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
  loginWithPassword,
  LoginResult,
  logoutApi,
  sendOtp,
  setPasswordWithToken,
  UserProfile,
  verifyOtpForPassword,
} from '../api/authApi';
import { clearTokens, getAccessToken, saveTokens } from '../lib/storage';
import { extractUserAvatarUrl } from '../utils/userAvatar';

type AuthState = {
  user: UserProfile | null;
  loading: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  sendOtpCode: (email: string) => ReturnType<typeof sendOtp>;
  verifyOtpCode: (email: string, code: string) => Promise<string>;
  completePasswordSetup: (
    changeToken: string,
    password: string,
    confirmPassword: string
  ) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginWithPassword(email, password);
    if (result.status === 'AUTHENTICATED') {
      await saveTokens(result.access, result.refresh);
      await refreshProfile();
    }
    return result;
  }, [refreshProfile]);

  const sendOtpCode = useCallback((email: string) => sendOtp(email), []);

  const verifyOtpCode = useCallback(
    (email: string, code: string) => verifyOtpForPassword(email, code.trim()),
    []
  );

  const completePasswordSetup = useCallback(
    async (changeToken: string, password: string, confirmPassword: string) => {
      await setPasswordWithToken(changeToken, password, confirmPassword);
      await refreshProfile();
    },
    [refreshProfile]
  );

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
      login,
      sendOtpCode,
      verifyOtpCode,
      completePasswordSetup,
      signOut,
      refreshProfile,
    }),
    [
      user,
      loading,
      ready,
      login,
      sendOtpCode,
      verifyOtpCode,
      completePasswordSetup,
      signOut,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
