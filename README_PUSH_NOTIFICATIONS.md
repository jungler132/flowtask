# Push-уведомления FlowTask

Реализация под API из `newapiflowtask.txt` (раздел **notifications**).

## Клиент

| Файл | Назначение |
|------|------------|
| `src/api/pushApi.ts` | `register` / `unregister` push-токена |
| `src/api/notificationsApi.ts` | счётчик непрочитанных, бейдж |
| `src/lib/pushNotifications.ts` | FCM-токен, каналы Android, регистрация |
| `src/lib/pushNavigation.ts` | переход по `type`, `link`, `related_task_id` |
| `src/components/PushNotificationRoot.tsx` | подключение после входа |

## API

- `POST /api/notifications/push-tokens/register/` — `{ platform, token, app_version?, locale?, timezone? }`
- `POST /api/notifications/push-tokens/unregister/` — `{ token }`
- `GET /api/notifications/unread-count/` — бейдж на иконке

## Сборка Android

См. **[PUSH_ANDROID_SETUP.md](./PUSH_ANDROID_SETUP.md)** — нужен `google-services.json` из Firebase **flowtask-be985**.

Ключи сервера (`FCM_PRIVATE_KEY` в `keys.txt`) в приложение **не** входят.

## Payload (навигация по тапу)

Ожидаемые поля в `data` FCM:

- `type` — `task_assigned`, `chat_message`, `news`, …
- `related_task_id` / `task_id`
- `chat_id` (для чатов)
- `link` — например `/tasks/task_55/`, `/chats/{uuid}/`
