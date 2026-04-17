import { StackScreenProps } from '@react-navigation/stack';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AUTH_SCREEN_PADDING } from '../../lib/screenInsets';
import { AuthStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<AuthStackParamList, 'Verify'>;

type ThemeLayout = (typeof import('../../theme'))['layout'];
type ThemeRadii = (typeof import('../../theme'))['radii'];

function createVerifyStyles(colors: ThemeColors, layout: ThemeLayout, radii: ThemeRadii) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingTop: AUTH_SCREEN_PADDING,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.lg,
      padding: layout.buttonPadH,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: layout.fontSizeTitle,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
      textAlign: 'center',
    },
    hint: {
      color: colors.primary,
      marginBottom: 12,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    subHint: {
      color: colors.muted,
      fontSize: 16,
      lineHeight: 24,
      marginBottom: 20,
      textAlign: 'center',
    },
    fieldLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.chip,
      borderRadius: radii.md,
      paddingHorizontal: 18,
      paddingVertical: 16,
      minHeight: layout.inputMinHeight + 4,
      color: colors.text,
      fontSize: 24,
      letterSpacing: 6,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
      textAlign: 'center',
      fontWeight: '600',
    },
    btn: {
      backgroundColor: colors.primary,
      paddingVertical: layout.buttonPadV + 2,
      paddingHorizontal: layout.buttonPadH,
      borderRadius: radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 56,
    },
    btnDisabled: { opacity: 0.65 },
    btnText: {
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: layout.fontSizeButton,
    },
  });
}

export default function VerifyScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { email, hint } = route.params;
  const { confirmCode } = useAuth();
  const { colors, layout, radii } = useTheme();
  const styles = useMemo(() => createVerifyStyles(colors, layout, radii), [colors, layout, radii]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const c = code.trim();
    if (c.length < 4) {
      Alert.alert('Введите код из письма');
      return;
    }
    setBusy(true);
    try {
      await confirmCode(email, c);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      Alert.alert('Ошибка входа', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: AUTH_SCREEN_PADDING,
            paddingBottom: AUTH_SCREEN_PADDING + insets.bottom,
          },
        ]}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Код из письма</Text>
          <Text style={styles.hint}>{email}</Text>
          <Text style={styles.subHint}>
            {hint ??
              'Если письма нет несколько минут — проверьте «Спам» и правильность адреса. Код приходит на основной email, если не включена «Резервная почта».'}
          </Text>

          <Text style={styles.fieldLabel}>Код</Text>
          <TextInput
            style={styles.input}
            placeholder="000000"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={8}
            value={code}
            onChangeText={setCode}
            accessibilityLabel="Код из письма"
          />

          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={onSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.btnText}>Войти</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
