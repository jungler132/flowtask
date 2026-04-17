import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

type IconName = keyof typeof Ionicons.glyphMap;

function useHeaderStyles() {
  const { colors, radii, ripplePrimary } = useTheme();
  return useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          marginRight: 4,
          flexShrink: 1,
        },
        linkPad: {
          paddingVertical: 12,
          paddingHorizontal: 10,
          minHeight: 44,
          justifyContent: 'center',
        },
        link: {
          color: colors.primary,
          fontSize: 16,
          fontWeight: '600',
        },
        linkMuted: {
          color: colors.muted,
          fontWeight: '400',
        },
        pressed: { opacity: 0.72 },
        pill: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.primary,
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderRadius: radii.md,
          marginLeft: 4,
          minHeight: 44,
        },
        pillPressed: { opacity: 0.88 },
        pillIcon: { marginRight: 5 },
        pillText: {
          color: colors.onPrimary,
          fontSize: 15,
          fontWeight: '700',
        },
        circleAdd: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 4,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: colors.primary,
        },
        circleAddPressed: { opacity: 0.72 },
        outlinePill: {
          marginLeft: 4,
          paddingVertical: 11,
          paddingHorizontal: 14,
          borderRadius: radii.md,
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: colors.primary,
          maxWidth: 240,
          minHeight: 44,
          justifyContent: 'center',
        },
        outlinePillPressed: { opacity: 0.72 },
        outlinePillText: {
          color: colors.primary,
          fontSize: 15,
          fontWeight: '700',
          textAlign: 'center',
        },
        secPill: {
          flexDirection: 'row',
          alignItems: 'center',
          maxWidth: 220,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: radii.md,
          marginRight: 6,
          backgroundColor: colors.card,
          borderWidth: 2,
          borderColor: colors.primary,
          minHeight: 44,
        },
        secPillPressed: { opacity: 0.82 },
        secPillIcon: { marginRight: 5 },
        secPillText: {
          flexShrink: 1,
          color: colors.primary,
          fontSize: 14,
          fontWeight: '700',
        },
      }),
    [colors, radii, ripplePrimary],
  );
}

export function HeaderRow({ children }: { children: ReactNode }) {
  const styles = useHeaderStyles();
  return <View style={styles.row}>{children}</View>;
}

export function HeaderLink({
  label,
  onPress,
  muted,
}: {
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  const { ripplePrimary } = useTheme();
  const styles = useHeaderStyles();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: ripplePrimary, borderless: true }}
      style={({ pressed }) => [styles.linkPad, pressed && styles.pressed]}
    >
      <Text style={[styles.link, muted && styles.linkMuted]}>{label}</Text>
    </Pressable>
  );
}

export function HeaderPill({
  label,
  onPress,
  icon = 'add',
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const styles = useHeaderStyles();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
    >
      <Ionicons name={icon} size={17} color={colors.onPrimary} style={styles.pillIcon} />
      <Text style={styles.pillText}>{label}</Text>
    </Pressable>
  );
}

/** Круглая контурная кнопка «+» (обводка primary). */
export function HeaderCircleAdd({
  onPress,
  accessibilityLabel = 'Создать',
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors, ripplePrimary } = useTheme();
  const styles = useHeaderStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={{ color: ripplePrimary, borderless: true }}
      style={({ pressed }) => [styles.circleAdd, pressed && styles.circleAddPressed]}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Ionicons name="add" size={26} color={colors.primary} />
    </Pressable>
  );
}

/** Контурная кнопка с подписью — тот же стиль: пусто внутри, синяя обводка, скругление. */
export function HeaderOutlineButton({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { ripplePrimary } = useTheme();
  const styles = useHeaderStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      android_ripple={{ color: ripplePrimary }}
      style={({ pressed }) => [styles.outlinePill, pressed && styles.outlinePillPressed]}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <Text style={styles.outlinePillText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Вторичная кнопка в шапке (контур + иконка), для «Из задачи» и т.п. */
export function HeaderSecondaryPill({
  label,
  onPress,
  icon = 'briefcase-outline',
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
}) {
  const { colors, ripplePrimary } = useTheme();
  const styles = useHeaderStyles();
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: ripplePrimary }}
      style={({ pressed }) => [styles.secPill, pressed && styles.secPillPressed]}
    >
      <Ionicons name={icon} size={15} color={colors.primary} style={styles.secPillIcon} />
      <Text style={styles.secPillText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
