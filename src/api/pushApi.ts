import { apiFetch } from './client';

export type PushRegisterBody = {
  /** Токен из Notifications.getExpoPushTokenAsync (формат ExponentPushToken[…]). */
  expo_push_token: string;
  platform: 'ios' | 'android';
};

/**
 * Регистрация устройства для push.
 *
 * Ожидаемый контракт бэкенда (при необходимости поменяйте путь под свой API):
 * `POST /api/users/device-tokens/` с телом PushRegisterBody.
 *
 * Сервер должен сохранять токен и при событиях задачи (назначение, смена статуса, обновление)
 * отправлять уведомления через Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Пример тела запроса к Expo:
 * `{ "to": "<expo_push_token>", "title": "...", "body": "...", "channelId": "tasks",
 *    "data": { "taskId": "...", "type": "task_assigned" } }`
 */
export async function registerDevicePushToken(body: PushRegisterBody): Promise<void> {
  await apiFetch('/api/users/device-tokens/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Снять регистрацию на сервере (не бросает — выход из аккаунта не должен ломаться).
 */
export async function unregisterDevicePushToken(expoPushToken: string): Promise<void> {
  try {
    await apiFetch('/api/users/device-tokens/', {
      method: 'DELETE',
      body: JSON.stringify({ expo_push_token: expoPushToken }),
    });
  } catch {
    try {
      await apiFetch('/api/users/device-tokens/unregister/', {
        method: 'POST',
        body: JSON.stringify({ expo_push_token: expoPushToken }),
      });
    } catch {
      /* эндпоинта ещё нет — ок */
    }
  }
}
