import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { ApiError, formatApiErrorForUser } from '../../api/client';
import {
  addParticipants,
  createChat,
  createTaskChat,
  extractChatIdFromCreateResponse,
  normalizeTaskIdForChatApi,
  patchChat,
} from '../../api/chatsApi';
import { resolveParticipantIdsForChatApi } from '../../api/usersApi';
import { ChatsStackParamList } from '../../navigation/types';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme';
import TaskPickerModal, { type PickedTask } from './TaskPickerModal';
import UserInvitePickerModal, { type PickedUser } from './UserInvitePickerModal';
import { sameParticipantId } from './participantIdUtils';

type Props = StackScreenProps<ChatsStackParamList, 'ChatCreate'>;

type ChatType = 'private' | 'group' | 'task';

const CHAT_TYPES: {
  value: ChatType;
  title: string;
  hint: string;
}[] = [
  {
    value: 'private',
    title: 'Личный',
    hint: 'Ровно один собеседник (кроме вас)',
  },
  {
    value: 'group',
    title: 'Групповой',
    hint: 'Нужны название и участники',
  },
  {
    value: 'task',
    title: 'По задаче',
    hint: 'Задача из списка или по ID',
  },
];

function parseIdTokens(s: string): string[] {
  return s
    .split(/[,\s\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ChatCreateScreen({ navigation }: Props) {
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(() => createChatCreateStyles(colors, radii, shadowCard), [colors, radii, shadowCard]);
  const tabScrollBottom = useTabScrollBottomPadding();
  const [type, setType] = useState<ChatType>('group');
  const [name, setName] = useState('');
  /** Из каталога — с именами для отображения */
  const [pickedParticipants, setPickedParticipants] = useState<PickedUser[]>([]);
  /** Дополнительно вручную — только ID */
  const [manualParticipantIds, setManualParticipantIds] = useState('');
  /** Задача для типа «По задаче»: из списка или ручной ID */
  const [taskPicked, setTaskPicked] = useState<PickedTask | null>(null);
  const [taskIdManual, setTaskIdManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);

  const effectiveTaskId = (taskPicked?.id ?? taskIdManual).trim();

  const participantIdsParsed = useMemo(() => {
    const fromPicked = pickedParticipants.map((p) => p.id);
    const fromManual = parseIdTokens(manualParticipantIds);
    return [...fromPicked, ...fromManual];
  }, [pickedParticipants, manualParticipantIds]);

  async function submit() {
    const participant_ids = [...participantIdsParsed];
    const uniq: string[] = [];
    for (const id of participant_ids) {
      if (!uniq.some((x) => sameParticipantId(x, id))) uniq.push(id);
    }

    if (type === 'task' && !effectiveTaskId) {
      Alert.alert(
        'Нужна задача',
        'Выберите задачу из списка или введите её ID вручную.'
      );
      return;
    }

    if (type === 'group' && !name.trim()) {
      Alert.alert(
        'Название чата',
        'Для группового чата укажите название — так он будет отображаться в списке.'
      );
      return;
    }

    if (type === 'private') {
      if (uniq.length === 0) {
        Alert.alert(
          'Личный чат',
          'Укажите ровно одного собеседника. Вы как создатель добавитесь автоматически на сервере.'
        );
        return;
      }
      if (uniq.length > 1) {
        Alert.alert(
          'Личный чат',
          'Можно указать только одного человека. Уберите лишних из списка или выберите тип «Групповой».'
        );
        return;
      }
    } else if (uniq.length === 0) {
      Alert.alert(
        'Нет участников',
        'Нажмите «Выбрать из списка» или введите ID вручную (через запятую или с новой строки).'
      );
      return;
    }

    setBusy(true);
    try {
      const participant_ids = await resolveParticipantIdsForChatApi(uniq);
      if (participant_ids.length === 0) {
        Alert.alert('Нет участников', 'Не удалось определить ID пользователей для сервера.');
        return;
      }
      if (type === 'task') {
        const { primary: taskIdPrimary, fallback: taskIdFallback } = normalizeTaskIdForChatApi(
          effectiveTaskId.trim()
        );
        let taskChatRes: unknown;
        try {
          taskChatRes = await createTaskChat(taskIdPrimary);
        } catch (e) {
          if (
            taskIdFallback &&
            e instanceof ApiError &&
            e.status >= 400 &&
            e.status < 500
          ) {
            taskChatRes = await createTaskChat(taskIdFallback);
          } else {
            throw e;
          }
        }
        const chatId = extractChatIdFromCreateResponse(taskChatRes);
        if (!chatId) {
          Alert.alert(
            'Чат задачи',
            'Ответ сервера без идентификатора чата. Загляните в список чатов — он мог всё равно появиться.'
          );
          navigation.goBack();
          return;
        }
        await addParticipants(chatId, {
          participant_ids,
          type: 'task',
        });
        if (name.trim()) {
          try {
            await patchChat(chatId, { name: name.trim() });
          } catch {
            /* имя необязательно */
          }
        }
        const roomTitle =
          name.trim() ||
          taskPicked?.title?.trim() ||
          'Чат задачи';
        navigation.replace('ChatRoom', {
          chatId,
          title: roomTitle,
        });
      } else {
        const body: Record<string, unknown> = {
          type,
          participant_ids,
        };
        if (type === 'group') {
          body.name = name.trim();
        } else if (name.trim()) {
          body.name = name.trim();
        }

        const chat = await createChat(body);
        const id = String((chat as Record<string, unknown>)._id ?? '');
        if (id) {
          navigation.replace('ChatRoom', {
            chatId: id,
            title: name.trim() || 'Новый чат',
          });
        } else {
          navigation.goBack();
        }
      }
    } catch (e) {
      Alert.alert('Не удалось создать чат', formatApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }

  function mergePickedUsers(selected: PickedUser[]) {
    setPickedParticipants((prev) => {
      const next = [...prev];
      for (const row of selected) {
        if (!next.some((p) => sameParticipantId(p.id, row.id))) {
          next.push(row);
        }
      }
      return next;
    });
    setPickerOpen(false);
  }

  function removePicked(id: string) {
    setPickedParticipants((prev) => prev.filter((p) => !sameParticipantId(p.id, id)));
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: tabScrollBottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <UserInvitePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        excludeIds={participantIdsParsed}
        primaryLabel="Добавить в список"
        onApply={mergePickedUsers}
      />

      <TaskPickerModal
        visible={taskPickerOpen}
        onClose={() => setTaskPickerOpen(false)}
        onPick={(t) => {
          setTaskPicked(t);
          setTaskIdManual('');
          setTaskPickerOpen(false);
        }}
      />

      <Text style={styles.lead}>
        Выберите тип чата. Участников можно добавить из каталога организации или вписать их ID вручную.
      </Text>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Тип чата</Text>
        <View style={styles.types}>
          {CHAT_TYPES.map((item) => {
            const on = type === item.value;
            return (
              <Pressable
                key={item.value}
                style={[styles.typeCard, on && styles.typeCardOn]}
                onPress={() => setType(item.value)}
              >
                <Text style={[styles.typeTitle, on && styles.typeTitleOn]}>{item.title}</Text>
                <Text style={[styles.typeHint, on && styles.typeHintOn]}>{item.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={styles.label}>
        Название{type === 'group' ? ' *' : ''}
      </Text>
      <Text style={styles.hint}>
        {type === 'group'
          ? 'Обязательно для группового чата.'
          : 'Необязательно для личного чата и чата по задаче.'}
      </Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Например: Согласование графика"
        placeholderTextColor={colors.muted}
      />

      <Text style={styles.label}>Участники</Text>
      <Text style={styles.hint}>
        {type === 'private'
          ? 'Ровно один человек (кроме вас). '
          : type === 'group'
            ? 'Один или несколько человек. '
            : ''}
        Из списка — с именами; на сервер уходят только ID. Ручной ввод, если человека нет в каталоге.
      </Text>
      <Pressable
        style={styles.btnPick}
        onPress={() => setPickerOpen(true)}
        disabled={busy}
      >
        <Ionicons name="people-outline" size={22} color={colors.primary} style={styles.btnPickIcon} />
        <Text style={styles.btnPickTxt}>Выбрать из списка</Text>
      </Pressable>

      {pickedParticipants.length > 0 ? (
        <View style={styles.pickedBox}>
          <Text style={styles.pickedTitle}>Выбрано из каталога ({pickedParticipants.length})</Text>
          {pickedParticipants.map((p) => (
            <View key={p.id} style={styles.pickedRow}>
              <View style={styles.pickedText}>
                <Text style={styles.pickedName} numberOfLines={2}>
                  {p.displayName}
                </Text>
                <Text style={styles.pickedId} numberOfLines={1} selectable>
                  {p.id}
                </Text>
              </View>
              <Pressable
                onPress={() => removePicked(p.id)}
                hitSlop={10}
                style={styles.pickedRemove}
                accessibilityLabel="Убрать"
              >
                <Ionicons name="close-circle" size={26} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.hintAfterPick}>Дополнительно — ID вручную (через запятую или с новой строки):</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={manualParticipantIds}
        onChangeText={setManualParticipantIds}
        placeholder="Только если нужного человека нет в списке выше"
        placeholderTextColor={colors.muted}
        multiline
        textAlignVertical="top"
      />

      {type === 'task' ? (
        <>
          <Text style={styles.label}>Задача</Text>
          <Text style={styles.hint}>
            Выберите задачу из каталога (как участников) или вставьте ID вручную.
          </Text>
          <Pressable
            style={styles.btnPick}
            onPress={() => setTaskPickerOpen(true)}
            disabled={busy}
          >
            <Ionicons
              name="clipboard-outline"
              size={22}
              color={colors.primary}
              style={styles.btnPickIcon}
            />
            <Text style={styles.btnPickTxt}>Выбрать задачу из списка</Text>
          </Pressable>
          {taskPicked ? (
            <View style={styles.pickedBox}>
              <Text style={styles.pickedTitle}>Выбранная задача</Text>
              <View style={styles.pickedRow}>
                <View style={styles.pickedText}>
                  <Text style={styles.pickedName} numberOfLines={3}>
                    {taskPicked.title}
                  </Text>
                  <Text style={styles.pickedId} numberOfLines={1} selectable>
                    {taskPicked.id}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setTaskPicked(null)}
                  hitSlop={10}
                  style={styles.pickedRemove}
                  accessibilityLabel="Сбросить задачу"
                >
                  <Ionicons name="close-circle" size={26} color={colors.muted} />
                </Pressable>
              </View>
            </View>
          ) : null}
          <Text style={styles.hintAfterPick}>Или ID задачи вручную:</Text>
          <TextInput
            style={styles.input}
            value={taskIdManual}
            onChangeText={(v) => {
              setTaskIdManual(v);
              if (v.trim()) setTaskPicked(null);
            }}
            placeholder="Вставьте ID, если задачи нет в списке"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
          />
        </>
      ) : null}

      <Pressable
        style={[styles.btn, busy && styles.disabled]}
        onPress={submit}
        disabled={busy}
      >
        <Text style={styles.btnText}>{busy ? 'Создание…' : 'Создать чат'}</Text>
      </Pressable>
    </ScrollView>
  );
}

type ThemeRadii = (typeof import('../../theme'))['radii'];

function createChatCreateStyles(colors: ThemeColors, radii: ThemeRadii, shadowCard: ViewStyle) {
  return StyleSheet.create({

  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: 16, paddingBottom: 40 },
  lead: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 8,
    ...shadowCard,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  types: { gap: 10, marginBottom: 8 },
  typeCard: {
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  typeCardOn: {
    borderColor: colors.primary,
    backgroundColor: colors.chip,
  },
  typeTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  typeTitleOn: { color: colors.primary },
  typeHint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  typeHintOn: { color: colors.muted },
  label: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 4,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.chip,
    borderRadius: radii.md,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  inputMultiline: { minHeight: 88, paddingTop: 12 },
  pickedBox: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 14,
  },
  pickedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 10,
  },
  pickedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pickedText: { flex: 1, marginRight: 8 },
  pickedName: { fontSize: 16, fontWeight: '600', color: colors.text },
  pickedId: { fontSize: 12, fontFamily: 'monospace', color: colors.muted, marginTop: 4 },
  pickedRemove: { padding: 4 },
  btnPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 10,
  },
  btnPickIcon: { marginRight: 8 },
  btnPickTxt: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  hintAfterPick: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  btn: {
    marginTop: 28,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  btnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  });
}


