import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  registerForPushNotificationsAndSync,
  clearPushRegistration,
  ensureAndroidNotificationChannel,
  initPushHandlers,
  setupPushListeners,
} from '../lib/pushNotifications';
import { rootNavigationRef } from '../navigation/rootNavigationRef';

/**
 * Инициализация push: разрешения, канал Android, регистрация токена после входа,
 * переход по тапу на уведомление (задача / чат).
 * Нативный модуль подключается через dynamic import — без него приложение не падает.
 */
export function PushNotificationRoot() {
  const { user } = useAuth();
  const listenersCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await initPushHandlers();
      if (cancelled) return;
      const bundle = await setupPushListeners(rootNavigationRef);
      if (!cancelled && bundle) {
        listenersCleanup.current = bundle.remove;
      }
    })();

    return () => {
      cancelled = true;
      listenersCleanup.current?.();
      listenersCleanup.current = null;
    };
  }, []);

  useEffect(() => {
    ensureAndroidNotificationChannel().catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) {
      clearPushRegistration().catch(() => {});
      return;
    }
    registerForPushNotificationsAndSync().catch(() => {});
  }, [user]);

  return null;
}
