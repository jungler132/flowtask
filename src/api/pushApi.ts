import { apiFetch } from './client';

export type PushPlatform = 'android' | 'ios';

export type PushRegisterBody = {
  platform: PushPlatform;
  token: string;
  app_version?: string;
  locale?: string;
  timezone?: string;
};

/** POST /api/notifications/push-tokens/register/ (newapiflowtask). */
export async function registerPushToken(body: PushRegisterBody): Promise<void> {
  await apiFetch('/api/notifications/push-tokens/register/', {
    method: 'POST',
    body: JSON.stringify({
      platform: body.platform,
      token: body.token,
      app_version: body.app_version ?? '',
      locale: body.locale ?? '',
      timezone: body.timezone ?? '',
    }),
  });
}

/** POST /api/notifications/push-tokens/unregister/ */
export async function unregisterPushToken(token: string): Promise<void> {
  await apiFetch('/api/notifications/push-tokens/unregister/', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}
