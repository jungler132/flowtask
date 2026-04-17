import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import type { ViewStyle } from 'react-native';
import {
  createType,
  darkColors,
  getRipplePrimary,
  getShadowCard,
  layout,
  lightColors,
  radii,
  space,
  type ThemeColors,
} from '../theme';

const STORAGE_KEY = '@flowtask/theme_mode';

export type ThemeMode = 'light' | 'dark' | 'system';

export type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  colors: ThemeColors;
  type: ReturnType<typeof createType>;
  shadowCard: ViewStyle;
  radii: typeof radii;
  layout: typeof layout;
  space: typeof space;
  ripplePrimary: string;
  isDark: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || raw == null) return;
        if (raw === 'light' || raw === 'dark' || raw === 'system') {
          setModeState(raw);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode,
      colors,
      type: createType(colors),
      shadowCard: getShadowCard(colors, isDark),
      radii,
      layout,
      space,
      ripplePrimary: getRipplePrimary(isDark),
      isDark,
    }),
    [mode, setMode, colors, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const v = useContext(ThemeContext);
  if (!v) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return v;
}
