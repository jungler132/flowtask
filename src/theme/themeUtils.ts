import { Platform, type TextStyle, type ViewStyle } from 'react-native';
import type { ThemeColors } from './colors';
import { layout } from './tokens';

export function createType(colors: ThemeColors): Record<string, TextStyle> {
  return {
    title: {
      fontSize: layout.fontSizeTitle,
      fontWeight: '700' as const,
      letterSpacing: -0.2,
      color: colors.text,
    },
    headline: {
      fontSize: 19,
      fontWeight: '700' as const,
      color: colors.text,
    },
    body: { fontSize: layout.fontSizeBody, lineHeight: 26, color: colors.text },
    bodyMuted: { fontSize: 16, lineHeight: 24, color: colors.muted },
    caption: { fontSize: 14, lineHeight: 20, color: colors.muted },
  };
}

export function getShadowCard(colors: ThemeColors, isDark: boolean): ViewStyle {
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: isDark ? '#000000' : '#1565C0',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.25 : 0.06,
        shadowRadius: 8,
      },
      android: { elevation: isDark ? 3 : 2 },
      default: {},
    }) ?? {}
  );
}

export function getRipplePrimary(isDark: boolean): string {
  return isDark ? 'rgba(96, 165, 250, 0.18)' : 'rgba(21, 101, 192, 0.14)';
}
