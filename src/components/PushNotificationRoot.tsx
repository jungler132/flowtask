import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  clearPushRegistration,
  ensureAndroidNotificationChannels,
  initPushHandlers,
  registerForPushNotificationsAndSync,
  setupPushListeners,
} from '../lib/pushNotifications';
import { rootNavigationRef } from '../navigation/rootNavigationRef';

/**
 * Push (FCM): разрешения, каналы Android, регистрация токена после входа,
 * переход по тапу (задача / чат / новости) — см. newapiflowtask § notifications.
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
    ensureAndroidNotificationChannels().catch(() => {});
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
