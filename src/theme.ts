import { Platform, type ViewStyle } from 'react-native';

/** Светлая тема: спокойный фон, читаемый контраст. */
export const colors = {
  bg: '#eef3fb',
  card: '#f8fbff',
  text: '#0f172a',
  muted: '#5f708a',
  primary: '#2563eb',
  border: '#d7e2f0',
  danger: '#dc2626',
  success: '#16a34a',
  chip: '#edf3ff',
  onPrimary: '#ffffff',
  /** Сообщения чата: свои / чужие */
  chatMine: '#dbeafe',
  chatMineBorder: '#93c5fd',
  chatOther: '#f8fbff',
  chatOtherBorder: '#d7e2f0',
};

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 };

/** Лёгкая тень для карточек в списках */
export const shadowCard: ViewStyle =
  Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
    },
    android: { elevation: 3 },
    default: {},
  }) ?? {};
