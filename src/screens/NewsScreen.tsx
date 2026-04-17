import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paddingTopUnderStatusBar, useTabScrollBottomPadding } from '../lib/screenInsets';
import { colors } from '../theme';

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const bottomPad = useTabScrollBottomPadding();
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
      <Text style={styles.title}>Новости</Text>
      <Text style={styles.text}>in progress</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  text: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
});
