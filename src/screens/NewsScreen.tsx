import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { paddingTopUnderStatusBar, useTabScrollBottomPadding } from '../lib/screenInsets';
import { createType, type ThemeColors } from '../theme';

function createNewsStyles(colors: ThemeColors, typography: ReturnType<typeof createType>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 22,
      borderWidth: 2,
      borderColor: colors.border,
    },
    title: {
      ...typography.title,
      marginBottom: 8,
      textAlign: 'center',
    },
    text: {
      ...typography.bodyMuted,
      textAlign: 'center',
      maxWidth: 280,
    },
  });
}

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = useTabScrollBottomPadding();
  const { colors, type } = useTheme();
  const styles = useMemo(() => createNewsStyles(colors, type), [colors, type]);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: paddingTopUnderStatusBar(insets),
          paddingBottom: bottomPad,
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="newspaper-outline" size={44} color={colors.primary} />
      </View>
      <Text style={styles.title}>Новости</Text>
      <Text style={styles.text}>Раздел в разработке — скоро здесь появятся объявления.</Text>
    </View>
  );
}
