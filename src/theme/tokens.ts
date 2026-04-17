import { Platform, type ViewStyle } from 'react-native';

export const radii = { sm: 12, md: 16, lg: 20, pill: 999 };

export const layout = {
  touchMin: 48,
  buttonPadV: 16,
  buttonPadH: 22,
  inputMinHeight: 54,
  fontSizeInput: 18,
  fontSizeBody: 17,
  fontSizeButton: 17,
  fontSizeTitle: 26,
};

export const space = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24 };

/** Статичная тень для мест без ThemeProvider (редко). */
export const shadowCardLight: ViewStyle =
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#1565C0',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  }) ?? {};
