# Push-уведомления FlowTask (FCM)

## Сервер

Ключи из `keys.txt` (`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`) — **только для бэкенда**. В мобильное приложение их не копируйте.

Бэкенд регистрирует токены через:

- `POST /api/notifications/push-tokens/register/`
- `POST /api/notifications/push-tokens/unregister/`

## Android (обязательно для FCM)

1. В [Firebase Console](https://console.firebase.google.com/) откройте проект **flowtask-be985**.
2. Добавьте Android-приложение с package name: `ru.flowtask220.app`.
3. Скачайте `google-services.json` и положите в корень `flowtask-app/google-services.json`.
4. Пересоберите нативное приложение:

```bash
npx expo prebuild --clean
npx expo run:android
```

Без `google-services.json` приложение попытается использовать Expo Push Token (может не совпасть с FCM на сервере).

## iOS

Настройте APNs в Firebase и EAS Credentials (`eas credentials`), затем `npx expo run:ios`.

## Поведение в приложении

После входа токен отправляется на API. По тапу на уведомление открываются:

- задачи / отчёты — экран задачи (`related_task_id`, `link` `/tasks/...`);
- чаты — комната чата (`chat_message`, `link` `/chats/...`);
- новости — вкладка «Новости».

Бейдж на иконке синхронизируется с `GET /api/notifications/unread-count/`.
