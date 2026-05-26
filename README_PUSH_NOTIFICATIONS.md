# Push-уведомления: внешние и внутренние

Ниже описано, как в этом проекте устроены уведомления, чтобы перенести архитектуру в другой React Native проект.

## Что такое внешние и внутренние уведомления

- **Внешние (system push/local notifications)** — системные уведомления ОС (шторка/lock screen), создаются через `@notifee/react-native`.
- **Внутренние (in-app prompt)** — баннер внутри приложения, показывается поверх UI, когда приложение уже открыто.

В этой кодовой базе внешние уведомления планируются локально по времени (`TIMESTAMP`), а внутренние показываются на событие доставки системного уведомления в foreground.

## Ключевые файлы

- `App.tsx` — запуск `setupBackgroundHandler()` и `useNotificationOrchestrator()`.
- `src/services/notification-service.ts` — низкоуровневая работа с Notifee (права, канал, schedule, listeners, background/open).
- `src/hooks/useNotificationOrchestrator.ts` — оркестратор всего жизненного цикла.
- `src/hooks/useNotifications.ts` — API для создания/удаления уведомлений из бизнес-фич.
- `src/store/slices/notificationsSlice.ts` — данные уведомлений (по детям, read/unread, селекторы due).
- `src/store/slices/notificationsRuntimeSlice.ts` — runtime-состояние (permission, sync status, active in-app prompt, режим открытия).
- `src/components/notifications/InAppNotificationPrompt.tsx` — UI внутреннего баннера.
- `src/components/screens/notifications/Notifications.tsx` — экран списка и модалка деталей.

## Архитектура по слоям

1. **Domain данные** (`notificationsSlice`):
   - хранится список уведомлений;
   - `markReminderAsViewed` переключает прочитанность;
   - `selectActiveDueUnreadNotificationsAt` возвращает «уже наступившие и непрочитанные».

2. **Runtime состояние** (`notificationsRuntimeSlice`):
   - `permissionStatus`, `systemSyncStatus`, `systemSyncError`;
   - `inAppNotificationId` для активного in-app баннера;
   - `notificationOpenMode` (`single`/`grouped`) для корректной навигации при открытии.

3. **Native слой** (`notification-service.ts`):
   - инициализация разрешений;
   - создание Android channel;
   - планирование/отмена уведомлений;
   - обработка foreground/background/initial событий.

4. **Оркестратор** (`useNotificationOrchestrator.ts`):
   - синхронизирует Redux ↔ OS;
   - показывает in-app баннеры;
   - открывает нужный экран/модалку по тапу в системном уведомлении.

## Поток «создать уведомление»

1. Фича вызывает `useNotifications().addNotification(...)`.
2. Хук:
   - добавляет `id`, `babyId`;
   - генерирует человекочитаемый текст через `buildNotificationCopy`;
   - диспатчит `addNotification` в Redux;
   - вызывает `scheduleNotificationService` (Notifee trigger).
3. Уведомление уходит в системный планировщик.

## Поток «доставка и показ»

### Когда приложение в foreground

1. Notifee кидает `EventType.DELIVERED`.
2. `useNotificationOrchestrator` вызывает `showInAppNotification(notificationId)`.
3. `InAppNotificationPrompt` показывает внутренний баннер.
4. Пользователь:
   - **Dismiss** — закрыть баннер;
   - **Open** — перейти на `Notifications` (single/grouped режим).

### Когда приложение в background/terminated

1. При тапе по системному уведомлению `setupBackgroundHandler` сохраняет `pendingBackgroundNotification`.
2. После старта приложения оркестратор читает:
   - `consumePendingBackgroundNotification()`;
   - `getInitialNotification()`.
3. Оркестратор ретраит открытие экрана уведомлений, пока `navigationRef` не готов.
4. Открывается экран `Notifications` с конкретным `notificationId` и, при наличии, `notificationSnapshot`.

## Как различаются single и grouped режимы

- **single**: открыть конкретную карточку/модалку (используется при тапе по конкретному системному уведомлению).
- **grouped**: если непрочитанных due уведомлений больше одного, показывается grouped in-app баннер, который ведет на общий список «new».

Это хранится в `notificationsRuntimeSlice.notificationOpenMode`, чтобы экран `Notifications` понимал контекст открытия и не путал сценарии.

## Синхронизация с системой (очень важно)

Оркестратор на изменениях списка уведомлений вызывает `reconcileScheduledNotifications(allNotifications)`:

- добавляет в OS недостающие trigger-уведомления;
- удаляет из OS устаревшие/лишние.

Именно эта синхронизация защищает от рассинхрона после редактирования, удаления, восстановления данных и т.д.

## Права и platform-нюансы

- Android:
  - если не `granted`, запрашивается permission;
  - всегда создается channel (`totly-reminders`).
- iOS:
  - запрашивается permission только в `not-determined`;
  - используются `foregroundPresentationOptions` для показа алерта/звука.

Статус сохраняется в `notificationsRuntimeSlice.permissionStatus` и влияет на `systemSyncStatus` (`ready`/`blocked`/`error`).

## Что перенести в другой проект (чеклист)

- Поставить `@notifee/react-native` и настроить native-часть (Android/iOS).
- Сделать сервис, аналогичный `notification-service.ts`:
  - `initializeNotifications`;
  - `scheduleNotification`/`cancelNotification`;
  - `setupNotificationListeners`;
  - `setupBackgroundHandler`;
  - `getInitialNotification`;
  - `reconcileScheduledNotifications`.
- Поднять 2 store-слайса:
  - данные уведомлений;
  - runtime-статус и in-app состояние.
- Добавить оркестратор-хук с эффектами синхронизации и открытия по tap.
- В `App.tsx`:
  - один раз вызвать `setupBackgroundHandler()` на уровне модуля;
  - в корневом bootstrap-компоненте подключить оркестратор.
- Добавить in-app баннер (отдельный компонент поверх `Navigation`).
- Добавить экран списка уведомлений и логику открытия detail модалки через route params.

## Минимальный контракт модели уведомления

Для аналогичной архитектуры в объекте уведомления должны быть:

- `id` (строка);
- `type` (doctor/vaccination/medication и т.п.);
- `scheduledAt` (timestamp события);
- `reminderTime` (timestamp, когда пушить; может совпадать с `scheduledAt`);
- `reminderViewed` (прочитано/нет);
- `title`, `description`, `body`;
- опциональные поля сценария (`note`, `dosage`, `whenToTake`, и т.д.).

## Частые ошибки при переносе

- Не вызывать `setupBackgroundHandler()` до монтирования приложения.
- Не делать `reconcile` при изменениях списка уведомлений.
- Открывать экран до готовности навигации (нужен retry-механизм).
- Смешивать raw `notification.body` и UI-копию — лучше централизовать через `buildNotificationCopy`.
- Не отделять runtime-состояние (permission/openMode/in-app) от domain-данных.

## Коротко: почему схема рабочая

- Есть единый native-сервис для OS-поведения.
- Есть оркестратор, который связывает OS события, Redux и навигацию.
- Есть разделение «данные уведомлений» и «runtime UI/state».
- Есть двухканальная подача: системный push + in-app prompt без дублирования логики.
