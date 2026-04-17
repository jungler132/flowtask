import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { fetchAllDepartmentsCached } from '../../api/departmentsApi';
import { formatApiErrorForUser } from '../../api/client';
import {
  createTaskChat,
  extractChatIdFromCreateResponse,
  fetchChatByTask,
  normalizeTaskIdForChatApi,
} from '../../api/chatsApi';
import { deleteTask, fetchTask, Task, taskPickerTitle } from '../../api/tasksApi';
import { fetchAllUsersCached } from '../../api/usersApi';
import { TasksStackParamList } from '../../navigation/types';
import { colors, radii, shadowCard } from '../../theme';
import {
  buildDepartmentLookup,
  buildUserDisplayLookup,
  formatDepartmentIdsLine,
  formatSingleUserLabel,
  formatUserIdsLine,
  parseIdTokens,
} from '../../utils/entityDisplay';
import {
  formatActivityTime,
  taskPriorityLabelRu,
  taskStatusLabelRu,
  taskTypeLabelRu,
} from '../../utils/taskLabels';

type Props = StackScreenProps<TasksStackParamList, 'TaskDetail'>;

type Resolved = {
  creator: string;
  assignees: string;
  departments: string;
  parent: string;
};

const emptyResolved: Resolved = {
  creator: '',
  assignees: '',
  departments: '',
  parent: '',
};

function Field({ label, value, icon }: { label: string; value: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const show = value?.trim();
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        {icon ? <Ionicons name={icon} size={16} color={colors.muted} style={styles.fieldIcon} /> : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{show || '—'}</Text>
    </View>
  );
}

export default function TaskDetailScreen({ route, navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { taskId } = route.params;
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState<Resolved>(emptyResolved);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const t = await fetchTask(taskId);
      setTask(t);
      navigation.setOptions({ title: String(t.title ?? 'Задача') });
    } finally {
      setLoading(false);
    }
  }, [taskId, navigation]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!task) {
      setResolved(emptyResolved);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [users, depts] = await Promise.all([fetchAllUsersCached(), fetchAllDepartmentsCached()]);
        if (cancelled) return;
        const uMap = buildUserDisplayLookup(users);
        const dMap = buildDepartmentLookup(depts);

        const creatorRaw = String((task as Record<string, unknown>).creator_id ?? '').trim();
        const creator = creatorRaw ? formatSingleUserLabel(creatorRaw, uMap) : '';

        const assigneeIds = parseIdTokens((task as Record<string, unknown>).assignees);
        const assigneesLine = assigneeIds.length ? formatUserIdsLine(assigneeIds, uMap) : '';

        const deptIds = parseIdTokens((task as Record<string, unknown>).assigned_departments);
        const deptLine = deptIds.length ? formatDepartmentIdsLine(deptIds, dMap) : '';

        let parentLine = '';
        const pid = String((task as Record<string, unknown>).parent_task_id ?? '').trim();
        if (pid) {
          try {
            const pt = await fetchTask(pid);
            if (!cancelled) parentLine = taskPickerTitle(pt);
          } catch {
            if (!cancelled) parentLine = pid;
          }
        }

        if (!cancelled) {
          setResolved({
            creator: creator || (creatorRaw ? creatorRaw : ''),
            assignees: assigneesLine,
            departments: deptLine,
            parent: parentLine,
          });
        }
      } catch {
        if (!cancelled) {
          const o = task as Record<string, unknown>;
          setResolved({
            creator: String(o.creator_id ?? ''),
            assignees: String(o.assignees ?? ''),
            departments: String(o.assigned_departments ?? ''),
            parent: String(o.parent_task_id ?? ''),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task]);

  async function openChat() {
    const { primary, fallback } = normalizeTaskIdForChatApi(String(taskId));
    const tryIds = [primary, fallback].filter(Boolean) as string[];

    for (const tid of tryIds) {
      try {
        const chat = await fetchChatByTask(tid);
        const id = String(chat._id ?? '').trim();
        if (id) {
          navigation.getParent()?.navigate('Chats', {
            screen: 'ChatRoom',
            params: { chatId: id, title: String(chat.name ?? 'Чат задачи') },
          });
          return;
        }
      } catch {
        /* next */
      }
    }

    let createErr: unknown;
    for (const tid of tryIds) {
      try {
        const created = await createTaskChat(tid);
        const id = extractChatIdFromCreateResponse(created);
        if (id) {
          navigation.getParent()?.navigate('Chats', {
            screen: 'ChatRoom',
            params: { chatId: id, title: 'Чат задачи' },
          });
          return;
        }
      } catch (e) {
        createErr = e;
      }
    }
    if (createErr) {
      Alert.alert('Чат', formatApiErrorForUser(createErr));
    } else {
      Alert.alert('Чат', 'Не удалось открыть или создать чат по этой задаче.');
    }
  }

  function confirmDelete() {
    Alert.alert('Удалить задачу?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(taskId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Ошибка', formatApiErrorForUser(e));
          }
        },
      },
    ]);
  }

  if (loading || !task) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const o = task as Record<string, unknown>;
  const desc = String(o.description ?? '').trim();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: tabScrollBottom }]}
    >
      <View style={styles.card}>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillTxt}>{taskStatusLabelRu(String(task.status ?? ''))}</Text>
          </View>
          <View style={[styles.metaPill, styles.metaPillMuted]}>
            <Text style={styles.metaPillMutedTxt}>{taskPriorityLabelRu(String(task.priority ?? ''))}</Text>
          </View>
          <View style={[styles.metaPill, styles.metaPillMuted]}>
            <Text style={styles.metaPillMutedTxt}>{taskTypeLabelRu(String(task.task_type ?? ''))}</Text>
          </View>
        </View>

        <Text style={styles.cardTitle}>{String(o.title ?? 'Задача')}</Text>

        {desc ? (
          <View style={styles.descBlock}>
            <Text style={styles.descLabel}>Описание</Text>
            <Text style={styles.descText}>{desc}</Text>
          </View>
        ) : null}

        <View style={styles.divider} />

        <Field
          icon="calendar-outline"
          label="Срок"
          value={o.deadline ? formatActivityTime(String(o.deadline)) : ''}
        />
        <Field icon="person-outline" label="Создатель" value={resolved.creator} />
        <Field icon="people-outline" label="Исполнители" value={resolved.assignees} />
        <Field icon="business-outline" label="Подразделения" value={resolved.departments} />
        <Field icon="location-outline" label="Кабинет" value={String(o.room_number ?? '')} />
        <Field icon="git-branch-outline" label="Родительская задача" value={resolved.parent} />
      </View>

      <Text style={styles.actionsSectionTitle}>Действия</Text>
      <View style={styles.actionsGrid}>
        <ActionBtn
          icon="chatbubbles-outline"
          title="Комментарии"
          onPress={() => navigation.navigate('TaskComments', { taskId })}
        />
        <ActionBtn
          icon="layers-outline"
          title="Подзадачи"
          onPress={() => navigation.navigate('TaskSubtasks', { taskId })}
        />
        <ActionBtn
          icon="pulse-outline"
          title="Активность"
          onPress={() => navigation.navigate('TaskActivity', { taskId })}
        />
        <ActionBtn
          icon="person-add-outline"
          title="Исполнители"
          onPress={() => navigation.navigate('TaskAssign', { taskId })}
        />
        <ActionBtn
          icon="arrow-redo-outline"
          title="Передать"
          onPress={() => navigation.navigate('TaskTransfer', { taskId })}
        />
        <ActionBtn icon="chatbubble-ellipses-outline" title="Чат" onPress={openChat} />
        <ActionBtn icon="create-outline" title="Изменить" onPress={() => navigation.navigate('TaskForm', { taskId })} />
        <ActionBtn icon="trash-outline" title="Удалить" danger onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}

function ActionBtn({
  title,
  icon,
  onPress,
  danger,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        danger && styles.actionBtnDanger,
        pressed && styles.actionBtnPressed,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={22}
        color={danger ? colors.danger : colors.primary}
        style={styles.actionIcon}
      />
      <Text style={[styles.actionBtnText, danger && styles.actionBtnTextDanger]} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  metaPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  metaPillTxt: { fontSize: 13, fontWeight: '700', color: colors.primary },
  metaPillMuted: { borderColor: colors.border, backgroundColor: colors.card },
  metaPillMutedTxt: { fontSize: 13, fontWeight: '600', color: colors.text },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 28,
    marginBottom: 12,
  },
  descBlock: { marginBottom: 8 },
  descLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  descText: { fontSize: 15, lineHeight: 22, color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },
  field: { marginBottom: 16 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  fieldIcon: { marginRight: 6 },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  value: { color: colors.text, fontSize: 15, lineHeight: 22 },
  actionsSectionTitle: {
    marginTop: 12,
    marginBottom: 12,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  /** Без тени: на Android/iOS полупрозрачный фон «Удалить» + elevation давали «грязные» ореолы */
  actionBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.chip,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnDanger: {
    borderWidth: 1.5,
    borderColor: 'rgba(220, 38, 38, 0.45)',
    backgroundColor: colors.card,
  },
  actionBtnPressed: { opacity: 0.85 },
  actionIcon: { marginRight: 10 },
  actionBtnText: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 18,
  },
  actionBtnTextDanger: { color: colors.danger },
});
