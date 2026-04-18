import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Зазор между safe area и контентом (строка состояния / вырез снизу). */
export const EDGE_CONTENT_GAP = 12;

/**
 * На главных вкладках таб-бар приподнят от нижнего края (`marginBottom` в AppNavigator).
 * Должен совпадать с тем значением — иначе списки могут залезать под «воздух» под панелью.
 */
export const TAB_BAR_FLOAT_BOTTOM_DP = 8;

/** Вертикальные поля на экранах входа (без таб-бара). */
export const AUTH_SCREEN_PADDING = 24;

/**
 * Верхний отступ, когда нет шапки навигации (`headerShown: false`)
 * или контент прижат к верху экрана.
 */
export function paddingTopUnderStatusBar(insets: { top: number }): number {
  return insets.top + EDGE_CONTENT_GAP;
}

/**
 * Нижний отступ для прокрутки на вкладках с таб-баром.
 * `useBottomTabBarHeight` — фактическая высота панели вкладок.
 */
export function useTabScrollBottomPadding(extraBelowTab = 12): number {
  const insets = useSafeAreaInsets();
  const tabBar = useBottomTabBarHeight();
  return Math.max(
    EDGE_CONTENT_GAP,
    insets.bottom + tabBar + extraBelowTab + TAB_BAR_FLOAT_BOTTOM_DP
  );
}
