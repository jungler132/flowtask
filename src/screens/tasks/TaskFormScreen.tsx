import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useEffect, useMemo, useState } from 'react';
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
import { formatApiErrorForUser } from '../../api/client';
import { createTask, fetchTask, updateTask } from '../../api/tasksApi';
import { resolveAssigneeIdsForTasksApi } from '../../api/usersApi';
import { KeyboardAvoid } from '../../components/KeyboardAvoid';
import TaskPickerModal from '../chats/TaskPickerModal';
import UserInvitePickerModal, { type PickedUser } from '../chats/UserInvitePickerModal';
import { TasksStackParamList } from '../../navigation/types';
import { colors, radii, shadowCard } from '../../theme';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASK_TYPE_OPTIONS,
} from '../../utils/taskLabels';

function parseAssigneeIds(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s) as unknown;
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    /* строка */
  }
  return s.split(/[,\s;]+/).map((t) => t.trim()).filter(Boolean);
}

function assigneesFieldToString(raw: unknown): string {
  const ids = parseAssigneeIds(raw);
  return ids.length ? ids.join(', ') : '';
}

type Props = StackScreenProps<TasksStackParamList, 'TaskForm'>;

export default function TaskFormScreen({ route, navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const editId = route.params?.taskId;
  const [loading, setLoading] = useState(!!editId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('medium');
  const [taskType, setTaskType] = useState('single');
  const [pickedAssignees, setPickedAssignees] = useState<PickedUser[]>([]);
  const [assigneesManual, setAssigneesManual] = useState('');
  const [deadline, setDeadline] = useState('');
  const [parentTaskId, setParentTaskId] = useState('');
  const [parentPickLabel, setParentPickLabel] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);

  const assigneeIdsParsed = useMemo(() => {
    const fromPicked = pickedAssignees.map((p) => p.id);
    const fromManual = assigneesManual
      .split(/[,\s\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const set = new Set<string>();
    fromPicked.forEach((id) => set.add(id));
    fromManual.forEach((id) => set.add(id));
    return Array.from(set);
  }, [pickedAssignees, assigneesManual]);

  useEffect(() => {
    if (!editId) {
      navigation.setOptions({ title: 'Новая задача' });
      return;
    }
    (async () => {
      try {
        const t = await fetchTask(editId);
        setTitle(String(t.title ?? ''));
        setDescription(String(t.description ?? ''));
        setStatus(String(t.status ?? ''));
        setPriority(String(t.priority ?? 'medium'));
        setTaskType(String(t.task_type ?? 'single'));
        setPickedAssignees([]);
        setAssigneesManual(assigneesFieldToString(t.assignees));
        setParentTaskId(String(t.parent_task_id ?? '').trim());
        setParentPickLabel('');
        setDeadline(String(t.deadline ?? ''));
        setRoomNumber(String(t.room_number ?? ''));
        navigation.setOptions({ title: 'Редактирование' });
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, navigation]);

  async function save() {
    if (!title.trim()) {
      Alert.alert('Укажите название');
      return;
    }
    setBusy(true);
    try {
      const assigneeList =
        assigneeIdsParsed.length > 0
          ? await resolveAssigneeIdsForTasksApi(assigneeIdsParsed)
          : [];
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description || undefined,
        priority,
        task_type: taskType,
      };
      if (status) body.status = status;
      if (deadline.trim()) body.deadline = deadline.trim();
      if (parentTaskId.trim()) body.parent_task_id = parentTaskId.trim();
      if (roomNumber.trim()) body.room_number = roomNumber.trim();
      if (assigneeList.length) body.assignees = assigneeList;

      if (editId) {
        await updateTask(editId, body);
      } else {
        await createTask(body);
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Ошибка', formatApiErrorForUser(e));
    } finally {
      setBusy(false);
    }
  }

  function mergeAssigneesFromPicker(selected: PickedUser[]) {
    setPickedAssignees((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      selected.forEach((p) => byId.set(p.id, p));
      return Array.from(byId.values());
    });
    setAssignPickerOpen(false);
  }

  function removeAssignee(id: string) {
    setPickedAssignees((prev) => prev.filter((p) => p.id !== id));
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoid>
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <UserInvitePickerModal
        visible={assignPickerOpen}
        onClose={() => setAssignPickerOpen(false)}
        excludeIds={assigneeIdsParsed}
        primaryLabel="Добавить исполнителей"
        onApply={mergeAssigneesFromPicker}
        applyBusy={busy}
      />
      <TaskPickerModal
        visible={parentPickerOpen}
        onClose={() => setParentPickerOpen(false)}
        excludeTaskIds={editId ? [editId] : []}
        onPick={(p) => {
          setParentTaskId(p.id);
          setParentPickLabel(p.title);
          setParentPickerOpen(false);
        }}
      />

      <View style={styles.card}>
        <Text style={[styles.label, styles.labelFirst]}>Название *</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} editable={!busy} />

        <Text style={styles.label}>Описание</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          multiline
          editable={!busy}
        />

        <Text style={styles.label}>Статус</Text>
        <View style={styles.chipRow}>
          {TASK_STATUS_OPTIONS.map((opt) => {
            const on = status === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setStatus(opt.value)}
                disabled={busy}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setStatus('')} disabled={busy}>
          <Text style={styles.linkMuted}>{status ? 'Сбросить статус' : 'Статус не задан'}</Text>
        </Pressable>

        <Text style={styles.label}>Приоритет</Text>
        <View style={styles.chipRow}>
          {TASK_PRIORITY_OPTIONS.map((opt) => {
            const on = priority === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setPriority(opt.value)}
                disabled={busy}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Тип задачи</Text>
        <View style={styles.chipRow}>
          {TASK_TYPE_OPTIONS.map((opt) => {
            const on = taskType === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.chip, styles.chipWide, on && styles.chipOn]}
                onPress={() => setTaskType(opt.value)}
                disabled={busy}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Исполнители</Text>
        <Text style={styles.fieldHint}>Выберите людей из списка или укажите ID вручную.</Text>
        <Pressable
          style={styles.btnPick}
          onPress={() => setAssignPickerOpen(true)}
          disabled={busy}
        >
          <Ionicons name="person-add-outline" size={22} color={colors.primary} style={styles.btnPickIcon} />
          <Text style={styles.btnPickTxt}>Выбрать из списка</Text>
        </Pressable>
        {pickedAssignees.length > 0 ? (
          <View style={styles.assignChips}>
            {pickedAssignees.map((p) => (
              <View key={p.id} style={styles.assignChip}>
                <Text style={styles.assignChipTxt} numberOfLines={1}>
                  {p.displayName}
                </Text>
                <Pressable onPress={() => removeAssignee(p.id)} hitSlop={8} disabled={busy}>
                  <Ionicons name="close-circle" size={20} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.fieldHintSmall}>Дополнительно — ID через запятую:</Text>
        <TextInput
          style={styles.input}
          value={assigneesManual}
          onChangeText={setAssigneesManual}
          placeholder="если кого-то нет в каталоге"
          placeholderTextColor={colors.muted}
          editable={!busy}
        />

        <Text style={styles.label}>Срок</Text>
        <Text style={styles.fieldHintSmall}>
          Укажите дату и время в формате ISO, например 2026-04-08T15:00:00Z
        </Text>
        <TextInput
          style={styles.input}
          value={deadline}
          onChangeText={setDeadline}
          placeholder="2026-04-08T15:00:00Z"
          placeholderTextColor={colors.muted}
          editable={!busy}
        />

        <Text style={styles.label}>Родительская задача</Text>
        {parentPickLabel ? (
          <View style={styles.pickedBanner}>
            <Text style={styles.pickedBannerTxt} numberOfLines={2}>
              {parentPickLabel}
            </Text>
            <Pressable
              onPress={() => {
                setParentTaskId('');
                setParentPickLabel('');
              }}
              hitSlop={8}
              disabled={busy}
            >
              <Text style={styles.link}>Очистить</Text>
            </Pressable>
          </View>
        ) : null}
        <Pressable style={styles.btnPickSecondary} onPress={() => setParentPickerOpen(true)} disabled={busy}>
          <Ionicons name="list-outline" size={20} color={colors.primary} style={styles.btnPickIcon} />
          <Text style={styles.btnPickTxt}>Выбрать из моих задач</Text>
        </Pressable>
        <Text style={styles.fieldHintSmall}>Или введите ID родительской задачи:</Text>
        <TextInput
          style={styles.input}
          value={parentTaskId}
          onChangeText={(t) => {
            setParentTaskId(t);
            setParentPickLabel('');
          }}
          placeholder="task_12 или 12"
          placeholderTextColor={colors.muted}
          editable={!busy}
        />

        <Text style={styles.label}>Кабинет</Text>
        <TextInput style={styles.input} value={roomNumber} onChangeText={setRoomNumber} editable={!busy} />
      </View>

      <Pressable style={[styles.save, busy && styles.disabled]} onPress={save} disabled={busy}>
        <Text style={styles.saveText}>{busy ? '…' : 'Сохранить'}</Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoid>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  label: { color: colors.muted, marginBottom: 8, marginTop: 16, fontSize: 13, fontWeight: '500' },
  labelFirst: { marginTop: 0 },
  fieldHint: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: 10 },
  fieldHintSmall: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    margin: 4,
  },
  chipWide: { minWidth: '46%' },
  chipOn: { borderColor: colors.primary, backgroundColor: '#dbeafe' },
  chipTxt: { color: colors.text, fontSize: 14, fontWeight: '500' },
  chipTxtOn: { color: colors.primary },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  linkMuted: { color: colors.muted, fontSize: 13, marginBottom: 4 },
  btnPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 10,
  },
  btnPickSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingVertical: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  btnPickIcon: { marginRight: 8 },
  btnPickTxt: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  assignChips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  assignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  assignChipTxt: { flexShrink: 1, color: colors.text, fontSize: 13, fontWeight: '500' },
  pickedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    backgroundColor: colors.chip,
    borderRadius: radii.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickedBannerTxt: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
  input: {
    backgroundColor: colors.chip,
    borderRadius: radii.md,
    padding: 14,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  save: {
    marginTop: 20,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  saveText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
});
