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
import { loginResponseHint } from '../../api/authApi';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { AUTH_SCREEN_PADDING } from '../../lib/screenInsets';
import { AuthStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<AuthStackParamList, 'Login'>;

type ThemeLayout = (typeof import('../../theme'))['layout'];
type ThemeRadii = (typeof import('../../theme'))['radii'];

function createLoginStyles(colors: ThemeColors, layout: ThemeLayout, radii: ThemeRadii) {
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
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
      minHeight: layout.touchMin,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    toggleRowPressed: { opacity: 0.85 },
    toggleLabel: {
      color: colors.text,
      flex: 1,
      fontSize: 16,
      lineHeight: 22,
      paddingRight: 12,
      fontWeight: '500',
    },
    toggleTrack: {
      width: 52,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.border,
      padding: 3,
    },
    toggleTrackOn: { backgroundColor: colors.primary },
    toggleThumbRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    toggleThumbRowOff: { justifyContent: 'flex-start' },
    toggleThumbRowOn: { justifyContent: 'flex-end' },
    toggleThumb: {
      width: 26,
      height: 26,
      borderRadius: 13,
    },
    toggleOff: { backgroundColor: colors.muted },
    toggleOn: { backgroundColor: colors.onPrimary },
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

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { sendCode } = useAuth();
  const { colors, layout, radii } = useTheme();
  const styles = useMemo(() => createLoginStyles(colors, layout, radii), [colors, layout, radii]);
  const [email, setEmail] = useState('');
  const [reserve, setReserve] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const e = email.trim();
    if (!e) {
      Alert.alert('Введите email');
      return;
    }
    setBusy(true);
    try {
      const data = await sendCode(e, reserve);
      const hint = loginResponseHint(data);
      navigation.navigate('Verify', { email: e, hint: hint ?? undefined });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      Alert.alert('Не удалось отправить код', msg);
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
          <Text style={styles.kicker}>Здравоохранение Москвы</Text>
          <Text style={styles.title}>Вход в приложение</Text>
          <Text style={styles.hint}>
            Нужен email в домене @zdrav.mos.ru. Аккаунт должен быть заведён в системе (через HR).
            {'\n\n'}
            «Резервная почта» — отправить код на запасной адрес из вашего профиля, если он указан.
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
          />

          <Pressable
            style={({ pressed }) => [styles.toggleRow, pressed && styles.toggleRowPressed]}
            onPress={() => setReserve((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: reserve }}
          >
            <Text style={styles.toggleLabel}>Отправить код на резервную почту</Text>
            <View style={[styles.toggleTrack, reserve && styles.toggleTrackOn]}>
              <View
                style={[
                  styles.toggleThumbRow,
                  reserve ? styles.toggleThumbRowOn : styles.toggleThumbRowOff,
                ]}
              >
                <View style={[styles.toggleThumb, reserve ? styles.toggleOn : styles.toggleOff]} />
              </View>
            </View>
          </Pressable>

          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={onSubmit}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.btnText}>Отправить код</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
