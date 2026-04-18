import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  fetchMe,
  logoutApi,
  sendOtp,
  UserProfile,
  verifyOtp,
} from '../api/authApi';
import { clearTokens, getAccessToken } from '../lib/storage';
import { extractUserAvatarUrl } from '../utils/userAvatar';

type AuthState = {
  user: UserProfile | null;
  loading: boolean;
  ready: boolean;
  sendCode: (email: string, useReserve?: boolean) => Promise<unknown>;
  confirmCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: (mergeFromPatch?: UserProfile | null) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const userRef = useRef<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshProfile = useCallback(async (mergeFromPatch?: UserProfile | null) => {
    const t = await getAccessToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const me = await fetchMe();
      if (mergeFromPatch) {
        setUser({ ...me, ...mergeFromPatch } as UserProfile);
        return;
      }
      const prevAv = extractUserAvatarUrl(userRef.current as unknown as Record<string, unknown>);
      const nextAv = extractUserAvatarUrl(me as unknown as Record<string, unknown>);
      if (prevAv && !nextAv) {
        setUser({ ...me, avatar_url: prevAv } as UserProfile);
      } else {
        setUser(me);
      }
    } catch {
      await clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refreshProfile();
      } finally {
        if (alive) {
          setLoading(false);
          setReady(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshProfile]);

  const sendCode = useCallback(
    (email: string, useReserve?: boolean) => sendOtp(email, useReserve),
    []
  );

  const confirmCode = useCallback(async (email: string, code: string) => {
    await verifyOtp(email, code.trim());
    await refreshProfile();
  }, [refreshProfile]);

  const signOut = useCallback(async () => {
    await logoutApi();
    await clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      ready,
      sendCode,
      confirmCode,
      signOut,
      refreshProfile,
    }),
    [user, loading, ready, sendCode, confirmCode, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
