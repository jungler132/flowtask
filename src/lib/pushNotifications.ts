import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavigationContainerRef } from '@react-navigation/native';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { RootStackParamList } from '../navigation/types';
import { registerDevicePushToken, unregisterDevicePushToken } from '../api/pushApi';

const STORAGE_KEY = '@flowtask/expo_push_token';
const ANDROID_CHANNEL_ID = 'tasks';

/** Нативный модуль может отсутствовать до `expo run:android` / dev build — грузим лениво. */
async function loadNotifications(): Promise<typeof import('expo-notifications') | null> {
  try {
    return await import('expo-notifications');
  } catch (e) {
    if (__DEV__) {
      console.warn(
        '[push] Модуль expo-notifications не собран в приложение. Выполните: npx expo prebuild && npx expo run:android',
        e
      );
    }
    return null;
  }
}

export async function initPushHandlers(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  return true;
}

function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  const Notifications = await loadNotifications();
  if (!Notifications || !Constants.platform?.android) return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Задачи и напоминания',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 220, 110, 220],
    sound: 'default',
    enableVibrate: true,
    showBadge: true,
  });
}

async function getExpoPushTokenOrNull(): Promise<string | null> {
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

  await ensureAndroidNotificationChannel();

  const projectId = expoProjectId();
  try {
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenRes.data;
  } catch (e) {
    if (__DEV__) {
      console.warn(
        '[push] Не удалось получить Expo push token. Укажите extra.eas.projectId (eas init).',
        e
      );
    }
    return null;
  }
}

/**
 * Сохраняет токен на сервере и локально (для снятия регистрации при выходе).
 */
export async function registerForPushNotificationsAndSync(): Promise<void> {
  const token = await getExpoPushTokenOrNull();
  if (!token) return;

  const prev = await AsyncStorage.getItem(STORAGE_KEY);
  if (prev === token) {
    return;
  }

  try {
    await registerDevicePushToken({
      expo_push_token: token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    await AsyncStorage.setItem(STORAGE_KEY, token);
  } catch (e) {
    if (__DEV__) {
      console.warn(
        '[push] Регистрация токена на сервере не удалась (нужен POST /api/users/device-tokens/).',
        e
      );
    }
  }
}

export async function clearPushRegistration(): Promise<void> {
  const token = await AsyncStorage.getItem(STORAGE_KEY);
  if (token) {
    try {
      await unregisterDevicePushToken(token);
    } catch {
      /* см. pushApi */
    }
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

function dataString(data: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!data) return undefined;
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Подписки на уведомления. Возвращает `null`, если нативный модуль недоступен.
 */
export async function setupPushListeners(
  navigationRef: NavigationContainerRef<RootStackParamList>
): Promise<{ remove: () => void } | null> {
  const Notifications = await loadNotifications();
  if (!Notifications) return null;

  const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
    const raw = response.notification.request.content.data as Record<string, unknown> | undefined;
    const taskId = dataString(raw, 'taskId', 'task_id');
    const chatId = dataString(raw, 'chatId', 'chat_id');
    const title = dataString(raw, 'taskTitle', 'title');

    if (!navigationRef.isReady()) return;

    if (taskId) {
      navigationRef.navigate('Main', {
        screen: 'Tasks',
        params: {
          screen: 'TaskDetail',
          params: { taskId, taskTitle: title },
        },
      });
      return;
    }

    if (chatId) {
      navigationRef.navigate('Main', {
        screen: 'Chats',
        params: {
          screen: 'ChatRoom',
          params: { chatId, title: title ?? 'Чат' },
        },
      });
    }
  });

  const subReceived = Notifications.addNotificationReceivedListener(() => {
    /* при необходимости: бейдж / кэш */
  });

  return {
    remove: () => {
      subResponse.remove();
      subReceived.remove();
    },
  };
}
