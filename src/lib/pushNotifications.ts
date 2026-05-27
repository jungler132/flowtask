import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavigationContainerRef } from '@react-navigation/native';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';
import { fetchUnreadNotificationsCount } from '../api/notificationsApi';
import { registerPushToken, unregisterPushToken } from '../api/pushApi';
import type { RootStackParamList } from '../navigation/types';
import { androidChannelForType, navigateFromPushPayload } from './pushNavigation';

const STORAGE_KEY = '@flowtask/push_token';
const CHANNEL_TASKS = 'tasks';
const CHANNEL_CHATS = 'chats';
const CHANNEL_NEWS = 'news';

async function loadNotifications(): Promise<typeof import('expo-notifications') | null> {
  try {
    return await import('expo-notifications');
  } catch (e) {
    if (__DEV__) {
      console.warn(
        '[push] expo-notifications не собран. Выполните: npx expo prebuild && npx expo run:android',
        e
      );
    }
    return null;
  }
}

function appMeta() {
  const version = Constants.expoConfig?.version ?? '';
  let locale = 'ru-RU';
  let timezone = 'Europe/Moscow';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale || locale;
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone;
  } catch {
    /* defaults */
  }
  return { app_version: version, locale, timezone };
}

export async function initPushHandlers(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      const type = typeof data?.type === 'string' ? data.type : undefined;
      return {
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android'
          ? { channelId: androidChannelForType(type) }
          : {}),
      };
    },
  });
  return true;
}

export async function ensureAndroidNotificationChannels(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications || Platform.OS !== 'android') return;

  const base = {
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 110, 220] as number[],
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  };

  await Notifications.setNotificationChannelAsync(CHANNEL_TASKS, {
    ...base,
    name: 'Задачи и отчёты',
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_CHATS, {
    ...base,
    name: 'Чаты',
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_NEWS, {
    ...base,
    name: 'Новости',
  });
}

async function syncBadgeFromServer(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  try {
    const count = await fetchUnreadNotificationsCount();
    await Notifications.setBadgeCountAsync(count);
  } catch {
    /* не авторизован или сеть */
  }
}

/**
 * FCM/APNs токен устройства (предпочтительно для бэкенда с FCM).
 * При отсутствии google-services.json — fallback на Expo Push Token.
 */
async function getDevicePushTokenOrNull(): Promise<{
  token: string;
  platform: 'ios' | 'android';
} | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    if (__DEV__) console.warn('[push] Нет разрешения на уведомления');
    return null;
  }

  await ensureAndroidNotificationChannels();

  const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

  try {
    const native = await Notifications.getDevicePushTokenAsync();
    if (native?.data && native.data.length >= 20) {
      return { token: native.data, platform };
    }
  } catch (e) {
    if (__DEV__) {
      console.warn(
        '[push] Нет FCM-токена. Добавьте google-services.json и пересоберите приложение (см. PUSH_ANDROID_SETUP.md).',
        e
      );
    }
  }

  try {
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas
        ?.projectId ?? Constants.easConfig?.projectId;
    const expo = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    if (expo.data) return { token: expo.data, platform };
  } catch (e) {
    if (__DEV__) console.warn('[push] Expo Push Token недоступен', e);
  }

  return null;
}

/** Регистрация токена на сервере FlowTask. */
export async function registerForPushNotificationsAndSync(): Promise<void> {
  const device = await getDevicePushTokenOrNull();
  if (!device) return;

  const prev = await AsyncStorage.getItem(STORAGE_KEY);
  if (prev === device.token) {
    await syncBadgeFromServer();
    return;
  }

  const meta = appMeta();
  try {
    await registerPushToken({
      platform: device.platform,
      token: device.token,
      ...meta,
    });
    await AsyncStorage.setItem(STORAGE_KEY, device.token);
    await syncBadgeFromServer();
  } catch (e) {
    if (__DEV__) {
      console.warn('[push] POST /api/notifications/push-tokens/register/ не удался', e);
    }
  }
}

export async function clearPushRegistration(): Promise<void> {
  const Notifications = await loadNotifications();
  const token = await AsyncStorage.getItem(STORAGE_KEY);
  if (token) {
    try {
      await unregisterPushToken(token);
    } catch {
      /* выход */
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
  if (Notifications) {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch {
      /* */
    }
  }
}

function handleNotificationResponse(
  navigationRef: NavigationContainerRef<RootStackParamList>,
  data: Record<string, unknown> | undefined
) {
  navigateFromPushPayload(navigationRef, data);
  void syncBadgeFromServer();
}

export async function setupPushListeners(
  navigationRef: NavigationContainerRef<RootStackParamList>
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    handleNotificationResponse(navigationRef, data);
  });

  const subReceived = Notifications.addNotificationReceivedListener(() => {
    void syncBadgeFromServer();
  });

  const initial = await Notifications.getLastNotificationResponseAsync();
  if (initial) {
    const data = initial.notification.request.content.data as Record<string, unknown> | undefined;
    setTimeout(() => handleNotificationResponse(navigationRef, data), 400);
  }

  const appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void registerForPushNotificationsAndSync();
    }
  });

  return {
    remove: () => {
      subResponse.remove();
      subReceived.remove();
      appStateSub.remove();
    },
  };
}
