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
import { otpSendHint } from '../../api/authApi';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  isNonEmptyPassword,
  isZdravEmail,
  PASSWORD_REQUIRED_HINT,
  PASSWORD_SETUP_HINT,
  ZDRAV_EMAIL_HINT,
} from '../../lib/authValidation';
import { useTheme } from '../../context/ThemeContext';
import { AUTH_SCREEN_PADDING } from '../../lib/screenInsets';
import { AuthStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<AuthStackParamList, 'Login'>;

type ThemeLayout = (typeof import('../../theme'))['layout'];
type ThemeRadii = (typeof import('../../theme'))['radii'];

function createLoginStyles(colors: ThemeColors, layout: ThemeLayout, radii: ThemeRadii) {
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
    kicker: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
      marginBottom: 8,
      textAlign: 'center',
    },
    title: {
      fontSize: layout.fontSizeTitle,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    hint: {
      color: colors.muted,
      marginBottom: 22,
      fontSize: 16,
      lineHeight: 24,
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
    linkBtn: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
    linkText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  });
}

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { login, sendOtpCode } = useAuth();
  const { colors, layout, radii } = useTheme();
  const styles = useMemo(() => createLoginStyles(colors, layout, radii), [colors, layout, radii]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function goToOtpSetup(e: string, hint?: string) {
    try {
      const sent = await sendOtpCode(e);
      const otpHint = otpSendHint(sent) ?? hint;
      navigation.navigate('Verify', { email: e, hint: otpHint, mode: 'setup_password' });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      Alert.alert('Не удалось отправить код', msg);
    }
  }

  async function onSubmit() {
    const e = email.trim();
    if (!e) {
      Alert.alert('Введите email');
      return;
    }
    if (!isZdravEmail(e)) {
      Alert.alert('Некорректный email', ZDRAV_EMAIL_HINT);
      return;
    }
    if (!isNonEmptyPassword(password)) {
      Alert.alert('Введите пароль', PASSWORD_REQUIRED_HINT);
      return;
    }

    setBusy(true);
    try {
      const result = await login(e, password);

      if (result.status === 'AUTHENTICATED') {
        return;
      }

      if (result.status === 'MUST_CHANGE_PASSWORD') {
        navigation.navigate('SetPassword', {
          email: e,
          changeToken: result.changeToken,
          reason: 'must_change',
        });
        return;
      }

      if (result.status === 'PASSWORD_NOT_SET') {
        const msg =
          result.message?.trim() ||
          'Пароль ещё не задан. На вашу почту должно прийти письмо со ссылкой для создания пароля на сайте. Также можно подтвердить вход кодом из письма.';
        Alert.alert('Создайте пароль', msg, [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Ввести код из письма',
            onPress: () => {
              void goToOtpSetup(e, msg);
            },
          },
        ]);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      Alert.alert('Не удалось войти', msg);
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
          <Text style={styles.kicker}>Здравоохранение Москвы</Text>
          <Text style={styles.title}>Вход в приложение</Text>
          <Text style={styles.hint}>
            Аккаунт создаётся один раз на сайте (HR). {PASSWORD_SETUP_HINT}
          </Text>

          <Text style={styles.fieldLabel}>Электронная почта</Text>
          <TextInput
            style={styles.input}
            placeholder="name@zdrav.mos.ru"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoCorrect={false}
            textContentType="username"
          />

          <Text style={styles.fieldLabel}>Пароль</Text>
          <TextInput
            style={styles.input}
            placeholder="Пароль с сайта"
            placeholderTextColor={colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
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

          <Pressable
            style={styles.linkBtn}
            onPress={() => {
              const e = email.trim();
              if (!e || !isZdravEmail(e)) {
                Alert.alert('Укажите email', ZDRAV_EMAIL_HINT);
                return;
              }
              void goToOtpSetup(e);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>Первый вход — код из письма</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
