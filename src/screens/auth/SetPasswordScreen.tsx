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
import { isStrongEnoughPassword } from '../../lib/authValidation';
import { useTheme } from '../../context/ThemeContext';
import { AUTH_SCREEN_PADDING } from '../../lib/screenInsets';
import { AuthStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<AuthStackParamList, 'SetPassword'>;

type ThemeLayout = (typeof import('../../theme'))['layout'];
type ThemeRadii = (typeof import('../../theme'))['radii'];

function createStyles(colors: ThemeColors, layout: ThemeLayout, radii: ThemeRadii) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingTop: AUTH_SCREEN_PADDING },
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
      minHeight: layout.inputMinHeight,
      color: colors.text,
      fontSize: layout.fontSizeInput,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
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
    btnText: { color: colors.onPrimary, fontWeight: '700', fontSize: layout.fontSizeButton },
  });
}

export default function SetPasswordScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { email, changeToken, reason } = route.params;
  const { completePasswordSetup } = useAuth();
  const { colors, layout, radii } = useTheme();
  const styles = useMemo(() => createStyles(colors, layout, radii), [colors, layout, radii]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const title =
    reason === 'must_change' ? 'Смена временного пароля' : 'Создание пароля';
  const hint =
    reason === 'must_change'
      ? 'Задайте новый постоянный пароль для входа в приложение.'
      : 'Придумайте пароль для входа в приложение (не короче 8 символов).';

  async function onSubmit() {
    if (!isStrongEnoughPassword(password)) {
      Alert.alert('Слабый пароль', 'Пароль должен быть не короче 8 символов.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Пароли не совпадают', 'Повторите ввод в обоих полях.');
      return;
    }

    setBusy(true);
    try {
      await completePasswordSetup(changeToken, password, confirm);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      Alert.alert('Не удалось сохранить пароль', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subHint}>
            {email}
            {'\n\n'}
            {hint}
          </Text>

          <Text style={styles.fieldLabel}>Новый пароль</Text>
          <TextInput
            style={styles.input}
            placeholder="Не менее 8 символов"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            textContentType="newPassword"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Повторите пароль</Text>
          <TextInput
            style={styles.input}
            placeholder="Ещё раз"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            textContentType="newPassword"
            autoCapitalize="none"
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
              <Text style={styles.btnText}>Сохранить и войти</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
