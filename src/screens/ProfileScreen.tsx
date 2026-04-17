import type { StackScreenProps } from '@react-navigation/stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTabScrollBottomPadding } from '../lib/screenInsets';
import type { UserProfile } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import type { ProfileStackParamList } from '../navigation/types';
import { colors, radii, shadowCard } from '../theme';

type Props = StackScreenProps<ProfileStackParamList, 'ProfileMain'>;

const WORK_FIELDS: { key: keyof UserProfile | string; label: string }[] = [
  { key: 'phone', label: 'Телефон' },
  { key: 'position', label: 'Должность' },
  { key: 'branch', label: 'Филиал' },
  { key: 'room_number', label: 'Кабинет' },
  { key: 'department_id', label: 'Подразделение' },
  { key: 'reserve_email', label: 'Запасная почта' },
  { key: 'birth_date', label: 'Дата рождения' },
];

function formatValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim() || '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  return '';
}

function displayLine(v: unknown): string {
  const s = formatValue(v);
  return s || '—';
}

function initials(user: UserProfile): string {
  const name = formatValue(user.full_name);
  const mail = formatValue(user.email);
  const s = name || mail;
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[1][0];
    if (a && b) return (a + b).toUpperCase();
  }
  return s.slice(0, 1).toUpperCase();
}

function roleLabel(role: unknown): string {
  const r = formatValue(role);
  if (!r) return '';
  const map: Record<string, string> = {
    admin: 'Администратор',
    hr: 'Кадры',
    user: 'Сотрудник',
  };
  return map[r.toLowerCase()] ?? 'Сотрудник';
}

export default function ProfileScreen({ navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { user, signOut, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Профиль не загрузился. Проверьте интернет и попробуйте ещё раз.</Text>
        <Pressable
          style={styles.btn}
          onPress={async () => {
            setBusy(true);
            try {
              await refreshProfile();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.btnText}>Попробовать снова</Text>
          )}
        </Pressable>
      </View>
    );
  }

  const nameLine = formatValue(user.full_name) || 'Пользователь';
  const emailLine = formatValue(user.email);
  const roleLine = roleLabel(user.role);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}
    >
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user)}</Text>
        </View>
        <Text style={styles.name}>{nameLine}</Text>
        {emailLine ? <Text style={styles.email}>{emailLine}</Text> : null}
        {roleLine ? (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{roleLine}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Работа и контакты</Text>
        {WORK_FIELDS.map(({ key, label }, i) => (
          <View
            key={key}
            style={[styles.fieldRow, i === WORK_FIELDS.length - 1 && styles.fieldRowLast]}
          >
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.fieldValue} selectable>
              {displayLine(user[key as keyof UserProfile])}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={styles.helpCard}
        onPress={() => navigation.navigate('TaskPasswordReset')}
      >
        <Text style={styles.helpTitle}>Забыли пароль от рабочей почты?</Text>
        <Text style={styles.helpHint}>
          Нажмите сюда и отправьте короткую заявку — вам помогут восстановить доступ.
        </Text>
      </Pressable>

      <Pressable
        style={[styles.btn, busy && styles.btnDisabled]}
        onPress={async () => {
          setBusy(true);
          try {
            await refreshProfile();
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.btnText}>Обновить сведения</Text>
        )}
      </Pressable>

      <Pressable style={styles.out} onPress={() => signOut()}>
        <Text style={styles.outText}>Выйти</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: {
    color: colors.onPrimary,
    fontSize: 28,
    fontWeight: '700',
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  email: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  roleChip: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleChipText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
    marginBottom: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  fieldRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fieldRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 4,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  fieldValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  helpCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 16,
  },
  helpTitle: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  helpHint: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  btn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  btnText: { color: colors.onPrimary, fontWeight: '600', fontSize: 16 },
  out: {
    marginTop: 12,
    padding: 16,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  outText: { color: colors.danger, fontWeight: '600', fontSize: 15 },
});
