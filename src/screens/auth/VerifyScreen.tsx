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
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { AUTH_SCREEN_PADDING } from '../../lib/screenInsets';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme';

type Props = StackScreenProps<AuthStackParamList, 'Verify'>;

export default function VerifyScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { email, hint } = route.params;
  const { confirmCode } = useAuth();
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
        <Text style={styles.title}>Код из письма</Text>
        <Text style={styles.hint}>{email}</Text>
        <Text style={styles.subHint}>
          {hint ??
            'Если письма нет несколько минут — проверьте «Спам» и корректность адреса. Код запрашивался на основной email, если на экране входа не была включена «Резервная почта».'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="000000"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          maxLength={8}
          value={code}
          onChangeText={setCode}
        />
        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={onSubmit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.btnText}>Войти</Text>
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
  hint: { color: colors.muted, marginBottom: 8 },
  subHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 20 },
  input: {
    backgroundColor: colors.chip,
    borderRadius: 12,
    padding: 16,
    color: colors.text,
    fontSize: 22,
    letterSpacing: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16 },
});
