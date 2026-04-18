import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { formatApiErrorForUser } from '../../api/client';
import {
  addParticipants,
  deleteChat,
  fetchChat,
  patchChat,
  removeParticipant,
} from '../../api/chatsApi';
import { fetchUser, resolveParticipantIdsForChatApi } from '../../api/usersApi';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { ChatsStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme';
import UserInvitePickerModal from './UserInvitePickerModal';
import { parseParticipantIds } from './participantIdUtils';

type Props = StackScreenProps<ChatsStackParamList, 'ChatManage'>;

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'private', label: 'Личный' },
  { value: 'group', label: 'Групповой' },
  { value: 'task', label: 'По задаче' },
];

function typeLabel(type: string): string {
  return TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function errMsg(e: unknown): string {
  return formatApiErrorForUser(e);
}

type ProfileRow = { name: string; email?: string };

export default function ChatManageScreen({ route, navigation }: Props) {
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(() => createChatManageStyles(colors, radii, shadowCard), [colors, radii, shadowCard]);
  const tabScrollBottom = useTabScrollBottomPadding();
  const { chatId } = route.params;
  const [chat, setChat] = useState<Record<string, unknown> | null>(null);
  const [type, setType] = useState('');
  const [newParticipants, setNewParticipants] = useState('');
  const [removeUserId, setRemoveUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTech, setShowTech] = useState(false);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, ProfileRow>>({});
  const participantFetched = useRef<Set<string>>(new Set());
  const [creatorLabel, setCreatorLabel] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const c = await fetchChat(chatId);
    const o = c as Record<string, unknown>;
    setChat(o);
    setType(String(o.type ?? ''));
  }, [chatId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    participantFetched.current.clear();
    setParticipantProfiles({});
    setCreatorLabel(null);
  }, [chatId]);

  const participants = chat ? parseParticipantIds(chat.participant_ids) : [];

  useEffect(() => {
    const cr = chat ? String(chat.creator_id ?? '').trim() : '';
    if (!cr || cr === '—') return;
    let cancelled = false;
    fetchUser(cr)
      .then((u) => {
        if (cancelled) return;
        const name = String(u.full_name ?? u.email ?? '').trim();
        setCreatorLabel(name || cr);
      })
      .catch(() => {
        if (!cancelled) setCreatorLabel(cr);
      });
    return () => {
      cancelled = true;
    };
  }, [chat?.creator_id]);

  useEffect(() => {
    for (const id of participants) {
      if (!id || participantFetched.current.has(id)) continue;
      participantFetched.current.add(id);
      fetchUser(id)
        .then((u) => {
          const name = String(u.full_name ?? '').trim();
          const email = String(u.email ?? '').trim();
          setParticipantProfiles((p) => ({
            ...p,
            [id]: {
              name: name || email || id,
              email: email || undefined,
            },
          }));
        })
        .catch(() => {
          setParticipantProfiles((p) => ({
            ...p,
            [id]: { name: id },
          }));
        });
    }
  }, [participants]);

  async function addFromPicker(selected: { id: string; displayName: string }[]) {
    const selectedIds = selected.map((p) => p.id);
    if (!selectedIds.length) return;
    setBusy(true);
    try {
      const participant_ids = await resolveParticipantIdsForChatApi(selectedIds);
      await addParticipants(chatId, {
        participant_ids,
        type: type.trim() || 'group',
      });
      setInviteOpen(false);
      await load();
      Alert.alert('Готово', 'Участники добавлены');
    } catch (e) {
      Alert.alert('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveType() {
    if (!type.trim()) {
      Alert.alert('Тип чата', 'Выберите тип.');
      return;
    }
    setBusy(true);
    try {
      await patchChat(chatId, { type: type.trim() });
      await load();
      Alert.alert('Готово', 'Тип чата обновлён');
    } catch (e) {
      Alert.alert('Не сохранилось', errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function addParts() {
    const ids = newParticipants
      .split(/[,\s\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      Alert.alert('Участники', 'Введите ID или выберите людей из списка.');
      return;
    }
    setBusy(true);
    try {
      const participant_ids = await resolveParticipantIdsForChatApi(ids);
      await addParticipants(chatId, {
        participant_ids,
        type: type.trim() || 'group',
      });
      setNewParticipants('');
      await load();
      Alert.alert('Готово', 'Участники добавлены');
    } catch (e) {
      Alert.alert('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function removePart() {
    const uid = removeUserId.trim();
    if (!uid) {
      Alert.alert('Кого убрать', 'Введите ID пользователя.');
      return;
    }
    setBusy(true);
    try {
      await removeParticipant(chatId, uid);
      setRemoveUserId('');
      await load();
      Alert.alert('Готово', 'Участник удалён из чата');
    } catch (e) {
      Alert.alert('Ошибка', errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Удалить чат?',
      'История и доступ к этому чату будут потеряны для всех. Действие необратимо.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteChat(chatId);
              navigation.popToTop();
            } catch (e) {
              Alert.alert('Не удалось удалить', errMsg(e));
            }
          },
        },
      ]
    );
  }

  const chatName = chat ? String(chat.name ?? 'Чат') : '…';
  const creator = chat ? String(chat.creator_id ?? '—') : '—';
  const taskRef = chat?.task_id != null && String(chat.task_id).trim() !== '' ? String(chat.task_id) : null;

  return (
    <>
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>{chatName}</Text>
        <View style={styles.heroRow}>
          <Ionicons name="pricetag-outline" size={16} color={colors.muted} />
          <Text style={styles.heroMeta}>Тип: {typeLabel(type) || '—'}</Text>
        </View>
        {taskRef ? (
          <View style={styles.heroRow}>
            <Ionicons name="link-outline" size={16} color={colors.muted} />
            <Text style={styles.heroMeta}>Задача: {taskRef}</Text>
          </View>
        ) : null}
        <View style={styles.heroRow}>
          <Ionicons name="person-outline" size={16} color={colors.muted} />
          <Text style={styles.heroMeta}>
            Создатель: {creatorLabel ?? creator}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Участники ({participants.length})</Text>
      <View style={styles.card}>
        {participants.length === 0 ? (
          <Text style={styles.muted}>Список пуст или не пришёл с сервера</Text>
        ) : (
          participants.slice(0, 40).map((id) => {
            const prof = participantProfiles[id];
            return (
              <View key={id} style={styles.participantRow}>
                <Text style={styles.participantName}>
                  {prof?.name ?? '…'}
                </Text>
                {prof?.email ? (
                  <Text style={styles.participantEmail} numberOfLines={1}>
                    {prof.email}
                  </Text>
                ) : null}
                <Text style={styles.participantId} selectable numberOfLines={2}>
                  {id}
                </Text>
              </View>
            );
          })
        )}
        {participants.length > 40 ? (
          <Text style={styles.muted}>… и ещё {participants.length - 40}</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Тип чата</Text>
      <Text style={styles.hint}>Меняется через сервер (PATCH). Выберите и нажмите «Сохранить».</Text>
      <View style={styles.typeRow}>
        {TYPE_OPTIONS.map((opt) => {
          const on = type === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[styles.typeChip, on && styles.typeChipOn]}
              onPress={() => setType(opt.value)}
            >
              <Text style={[styles.typeChipTxt, on && styles.typeChipTxtOn]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable style={[styles.btnPrimary, busy && styles.btnDisabled]} onPress={saveType} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.btnPrimaryTxt}>Сохранить тип</Text>
        )}
      </Pressable>

      <Text style={styles.sectionTitle}>Добавить участников</Text>
      <Text style={styles.hint}>
        Выберите людей из каталога организации или вставьте ID вручную.
      </Text>
      <Pressable
        style={styles.btnSecondary}
        onPress={() => {
          Keyboard.dismiss();
          setInviteOpen(true);
        }}
        disabled={busy}
      >
        <Ionicons name="people-outline" size={22} color={colors.primary} style={styles.btnIconLeft} />
        <Text style={styles.btnSecondaryTxt}>Выбрать из списка</Text>
      </Pressable>
      <Text style={styles.hintSmall}>Или введите ID через запятую:</Text>
      <TextInput
        style={styles.input}
        value={newParticipants}
        onChangeText={setNewParticipants}
        placeholder="id1, id2…"
        placeholderTextColor={colors.muted}
        multiline
        textAlignVertical="top"
      />
      <Pressable style={[styles.btnPrimary, busy && styles.btnDisabled]} onPress={addParts} disabled={busy}>
        <Text style={styles.btnPrimaryTxt}>Добавить по ID</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Убрать участника</Text>
      <Text style={styles.hint}>Точный ID пользователя, как в списке выше.</Text>
      <TextInput
        style={styles.input}
        value={removeUserId}
        onChangeText={setRemoveUserId}
        placeholder="ID пользователя"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
      />
      <Pressable style={[styles.btnDanger, busy && styles.btnDisabled]} onPress={removePart} disabled={busy}>
        <Text style={styles.btnDangerTxt}>Убрать из чата</Text>
      </Pressable>

      <Pressable style={styles.btnOutlineDanger} onPress={confirmDelete}>
        <Ionicons name="trash-outline" size={20} color={colors.danger} style={styles.btnIcon} />
        <Text style={styles.btnOutlineDangerTxt}>Удалить чат полностью</Text>
      </Pressable>

      <Pressable style={styles.techToggle} onPress={() => setShowTech((v) => !v)}>
        <Text style={styles.techToggleTxt}>
          {showTech ? '▼ Скрыть сырые данные' : '▶ Сырые данные API'}
        </Text>
      </Pressable>
      {showTech && chat ? (
        <View style={styles.techBox}>
          <Text style={styles.mono} selectable>
            {JSON.stringify(chat, null, 2)}
          </Text>
        </View>
      ) : null}
    </ScrollView>
    <UserInvitePickerModal
      visible={inviteOpen}
      onClose={() => setInviteOpen(false)}
      excludeIds={participants}
      primaryLabel="Добавить выбранных"
      onApply={addFromPicker}
      applyBusy={busy}
    />
    </>
  );
}

type ThemeRadii = (typeof import('../../theme'))['radii'];

function createChatManageStyles(colors: ThemeColors, radii: ThemeRadii, shadowCard: ViewStyle) {
  return StyleSheet.create({

  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    ...shadowCard,
  },
  heroTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  heroMeta: { marginLeft: 8, fontSize: 14, color: colors.muted, flex: 1 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
    marginBottom: 6,
  },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: 10 },
  hintSmall: { fontSize: 12, color: colors.muted, marginBottom: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  muted: { color: colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  participantRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },
  participantName: { fontSize: 16, fontWeight: '600', color: colors.text },
  participantEmail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  participantId: { fontSize: 11, fontFamily: 'monospace', color: colors.muted, marginTop: 6 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  typeChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipTxt: { fontSize: 14, fontWeight: '600', color: colors.text },
  typeChipTxtOn: { color: colors.onPrimary },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    minHeight: 48,
    marginBottom: 12,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: 20,
  },
  btnPrimaryTxt: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 12,
  },
  btnSecondaryTxt: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  btnIconLeft: { marginRight: 8 },
  btnDanger: {
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnDangerTxt: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  btnOutlineDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.card,
    marginBottom: 24,
  },
  btnOutlineDangerTxt: { color: colors.danger, fontWeight: '700', fontSize: 16 },
  btnIcon: { marginRight: 8 },
  btnDisabled: { opacity: 0.6 },
  techToggle: { paddingVertical: 12 },
  techToggleTxt: { color: colors.primary, fontWeight: '600', fontSize: 15 },
  techBox: {
    backgroundColor: colors.chip,
    borderRadius: radii.md,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mono: { fontSize: 11, fontFamily: 'monospace', color: colors.muted },
  });
}


