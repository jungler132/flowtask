import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Доп. смещение под шапку стека на iOS (pt).
   * Базово 88 — типичная высота header + статус; при модалках без шапки — 0.
   */
  keyboardVerticalOffsetIOS?: number;
};

/**
 * Клавиатура:
 * - Android: при edge-toEdge и adjustResize иногда окно не «поджимается» как ожидается —
 *   дополнительно даём KeyboardAvoidingView с padding (см. RN KeyboardAvoidingView).
 * - iOS: padding + смещение под шапку стека.
 */
export function KeyboardAvoid({
  children,
  style,
  keyboardVerticalOffsetIOS = 88,
}: Props) {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, style]}
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffsetIOS}
      >
        {children}
      </KeyboardAvoidingView>
    );
  }
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
