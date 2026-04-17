import { StackScreenProps } from '@react-navigation/stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { ApiError } from '../../api/client';
import { passwordResetTask } from '../../api/tasksApi';
import { ProfileStackParamList } from '../../navigation/types';
import { colors, radii, shadowCard } from '../../theme';

type Props = StackScreenProps<ProfileStackParamList, 'TaskPasswordReset'>;

export default function TaskPasswordResetScreen({ navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const [title, setTitle] = useState('Восстановление пароля от рабочей почты');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = title.trim();
    if (!t) {
      Alert.alert('Нужна тема', 'Напишите короткую тему обращения.');
      return;
    }
    setBusy(true);
    try {
      await passwordResetTask({
        title: t,
        description: description.trim() || undefined,
      });
      Alert.alert('Отправлено', 'Заявку передали ответственным. С вами свяжутся, когда будет готово.', [
        { text: 'Хорошо', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Не получилось отправить. Попробуйте позже.';
      Alert.alert('Не вышло', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.lead}>
          Если нельзя войти в рабочую почту, оставьте заявку. Укажите, что случилось — это поможет
          быстрее вам помочь.
        </Text>
        <Text style={styles.label}>Тема обращения</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Коротко, о чём заявка"
          placeholderTextColor={colors.muted}
        />
        <Text style={styles.label}>Подробности (по желанию)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="Например: не помню пароль, письма не приходят…"
          placeholderTextColor={colors.muted}
          multiline
        />
        <Pressable
          style={[styles.btn, busy && styles.disabled]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.btnText}>Отправить заявку</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  lead: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  label: { color: colors.muted, marginBottom: 8, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: colors.chip,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    fontSize: 16,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  btn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.65 },
  btnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
});
