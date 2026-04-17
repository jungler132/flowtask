import { StackScreenProps } from '@react-navigation/stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AUTH_SCREEN_PADDING } from '../../lib/screenInsets';
import { loginResponseHint } from '../../api/authApi';
import { ApiError } from '../../api/client';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme';
import { useAuth } from '../../context/AuthContext';

type Props = StackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { sendCode } = useAuth();
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
      style={[
        styles.root,
        {
          paddingTop: AUTH_SCREEN_PADDING + insets.top,
          paddingBottom: AUTH_SCREEN_PADDING + insets.bottom,
        },
      ]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Вход</Text>
        <Text style={styles.hint}>
          Нужен email в домене @zdrav.mos.ru. Аккаунт должен быть заведён в системе (через HR).
          {'\n\n'}
          «Резервная почта» — отправить код на запасной адрес из вашего профиля (если он указан).
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Pressable style={styles.row} onPress={() => setReserve((v) => !v)}>
          <Text style={styles.label}>Резервная почта</Text>
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
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.btnText}>Отправить код</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 },
  hint: { color: colors.muted, marginBottom: 20, fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: colors.chip,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingVertical: 4,
  },
  label: { color: colors.text, flex: 1 },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 2,
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
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  toggleOff: { backgroundColor: '#94a3b8' },
  toggleOn: { backgroundColor: colors.onPrimary },
  btn: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16 },
});
