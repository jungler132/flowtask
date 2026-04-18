import type { StackScreenProps } from '@react-navigation/stack';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { patchMyProfile, type UserProfile } from '../api/authApi';
import {
  fetchFileAttachmentMeta,
  fileMetaToAbsoluteUrl,
  uploadFile,
} from '../api/filesApi';
import { getAccessToken } from '../lib/storage';
import { useTabScrollBottomPadding } from '../lib/screenInsets';
import { extractUserAvatarUrl } from '../utils/userAvatar';
import { useAuth } from '../context/AuthContext';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import type { ProfileStackParamList } from '../navigation/types';
import type { ThemeColors } from '../theme';

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

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: 'Светлая' },
  { mode: 'dark', label: 'Тёмная' },
  { mode: 'system', label: 'Как в системе' },
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

type ThemeLayout = (typeof import('../theme'))['layout'];
type ThemeRadii = (typeof import('../theme'))['radii'];

function createProfileStyles(
  colors: ThemeColors,
  layout: ThemeLayout,
  radii: ThemeRadii,
  shadowCard: ViewStyle,
) {
  return StyleSheet.create({
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
    avatarPress: {
      width: 80,
      height: 80,
      borderRadius: 40,
      overflow: 'hidden',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    avatarPressInitials: {
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarText: {
      color: colors.onPrimary,
      fontSize: 28,
      fontWeight: '700',
    },
    avatarHint: {
      color: colors.muted,
      fontSize: 13,
      textAlign: 'center',
      marginBottom: 14,
    },
    name: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
      textAlign: 'center',
    },
    email: {
      color: colors.muted,
      fontSize: 16,
      marginTop: 8,
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
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
    },
    themeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    themeChip: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: radii.md,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.border,
    },
    themeChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderWidth: 2,
    },
    themeChipText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    themeChipTextActive: {
      color: colors.primary,
      fontWeight: '700',
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
      fontSize: 15,
      fontWeight: '600',
      marginBottom: 6,
    },
    fieldValue: {
      color: colors.text,
      fontSize: 17,
      lineHeight: 24,
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
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 10,
    },
    helpHint: {
      color: colors.text,
      fontSize: 16,
      lineHeight: 24,
    },
    btn: {
      marginTop: 4,
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
    out: {
      marginTop: 12,
      paddingVertical: layout.buttonPadV + 2,
      paddingHorizontal: layout.buttonPadH,
      borderRadius: radii.md,
      borderWidth: 2,
      borderColor: colors.danger,
      alignItems: 'center',
      backgroundColor: colors.card,
      minHeight: 52,
      justifyContent: 'center',
    },
    outText: { color: colors.danger, fontWeight: '700', fontSize: 16 },
  });
}

export default function ProfileScreen({ navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { user, signOut, refreshProfile } = useAuth();
  const { colors, layout, radii, shadowCard, mode, setMode } = useTheme();
  const styles = useMemo(
    () => createProfileStyles(colors, layout, radii, shadowCard),
    [colors, layout, radii, shadowCard],
  );
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null);
  const [imgHeaders, setImgHeaders] = useState<Record<string, string>>({});

  useEffect(() => {
    getAccessToken().then((t) => {
      if (t) setImgHeaders({ Authorization: `Bearer ${t}` });
    });
  }, []);

  const avatarUrl = useMemo(
    () => (user ? extractUserAvatarUrl(user as unknown as Record<string, unknown>) : ''),
    [user],
  );

  const displayAvatarUri = (avatarLocalUri || avatarUrl || '').trim();
  const isLocalAvatarUri =
    displayAvatarUri.startsWith('file:') ||
    displayAvatarUri.startsWith('content:') ||
    displayAvatarUri.startsWith('ph');
  const hasAuthHeader = !!imgHeaders.Authorization;

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarUrl]);

  async function pickAndUploadAvatar() {
    if (!user || avatarBusy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к фото в настройках устройства.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.88,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setAvatarLocalUri(a.uri);
    setAvatarBroken(false);
    setAvatarBusy(true);
    try {
      const up = await uploadFile(
        a.uri,
        a.fileName || 'avatar.jpg',
        a.mimeType || 'image/jpeg',
      );
      const updated = await patchMyProfile({ avatar_id: up.id });
      const upd = updated as Record<string, unknown>;
      let resolvedUrl = '';
      try {
        const meta = await fetchFileAttachmentMeta(up.id);
        resolvedUrl = fileMetaToAbsoluteUrl(meta);
      } catch {
        /* метаданные недоступны — ниже fallback */
      }
      if (!resolvedUrl && up.url) resolvedUrl = up.url;
      if (!resolvedUrl) resolvedUrl = extractUserAvatarUrl(updated);
      await refreshProfile({
        ...upd,
        ...(resolvedUrl ? { avatar_url: resolvedUrl } : {}),
      } as UserProfile);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'Не удалось обновить фото',
        `${msg}\n\nЕсли ошибка повторяется, на сервере может называться другое поле (не avatar_id).`,
      );
    } finally {
      setAvatarLocalUri(null);
      setAvatarBusy(false);
    }
  }

  function onAvatarPress() {
    if (!user || avatarBusy) return;
    Alert.alert('Фото профиля', 'Выберите квадратное изображение — оно будет сохранено как аватар.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Из галереи', onPress: () => void pickAndUploadAvatar() },
    ]);
  }

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
        <Pressable
          onPress={onAvatarPress}
          disabled={avatarBusy}
          style={[
            styles.avatarPress,
            (!displayAvatarUri || avatarBroken) && styles.avatarPressInitials,
            avatarBusy && { opacity: 0.65 },
          ]}
          accessibilityLabel="Сменить фото профиля"
        >
          {(() => {
            const showRemote =
              !!displayAvatarUri &&
              !isLocalAvatarUri &&
              hasAuthHeader &&
              !avatarBroken;
            const showLocal =
              !!displayAvatarUri && isLocalAvatarUri && !avatarBroken;
            const waitingToken =
              !!displayAvatarUri &&
              !isLocalAvatarUri &&
              !hasAuthHeader &&
              !avatarBroken;
            if (showLocal || showRemote) {
              return (
                <Image
                  source={
                    isLocalAvatarUri
                      ? { uri: displayAvatarUri }
                      : { uri: displayAvatarUri, headers: imgHeaders }
                  }
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={200}
                  onError={() => setAvatarBroken(true)}
                />
              );
            }
            if (waitingToken || avatarBusy) {
              return (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color={colors.onPrimary} />
                </View>
              );
            }
            return <Text style={styles.avatarText}>{initials(user)}</Text>;
          })()}
        </Pressable>
        <Text style={styles.avatarHint}>Нажмите на фото, чтобы сменить</Text>
        <Text style={styles.name}>{nameLine}</Text>
        {emailLine ? <Text style={styles.email}>{emailLine}</Text> : null}
        {roleLine ? (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{roleLine}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Тема оформления</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map(({ mode: m, label }) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.themeChip, mode === m && styles.themeChipActive]}
            >
              <Text style={[styles.themeChipText, mode === m && styles.themeChipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
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
