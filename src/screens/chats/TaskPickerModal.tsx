import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchAllTasksCached,
  taskPickerId,
  taskPickerTitle,
  type Task,
} from '../../api/tasksApi';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme';
import { taskStatusLabelRu } from '../../utils/taskLabels';

export type PickedTask = { id: string; title: string; status?: string };

type ThemeRadii = (typeof import('../../theme'))['radii'];

function taskKeysEqual(a: string, b: string): boolean {
  const na = String(a ?? '')
    .trim()
    .replace(/^task_/i, '');
  const nb = String(b ?? '')
    .trim()
    .replace(/^task_/i, '');
  return na === nb && na.length > 0;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (task: PickedTask) => void;
  /** Не показывать эту задачу (например, текущую при выборе родителя) */
  excludeTaskIds?: string[];
  /** Заголовок модалки (по умолчанию «Выбор задачи») */
  modalTitle?: string;
  /** Текст основной кнопки (по умолчанию «Привязать задачу») */
  confirmButtonLabel?: string;
};

function taskMatchesQuery(t: Task, q: string): boolean {
  if (!q) return true;
  const id = taskPickerId(t).toLowerCase();
  const title = taskPickerTitle(t).toLowerCase();
  const o = t as Record<string, unknown>;
  const status = String(o.status ?? '').toLowerCase();
  return title.includes(q) || id.includes(q) || status.includes(q);
}

function createTaskPickerStyles(colors: ThemeColors, radii: ThemeRadii) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    title: { fontSize: 20, fontWeight: '700', color: colors.text, flex: 1 },
    hint: { fontSize: 14, color: colors.muted, marginBottom: 12, lineHeight: 20 },
    search: {
      backgroundColor: colors.card,
      borderRadius: radii.md,
      padding: 14,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
    loaderHint: { marginTop: 12, fontSize: 14, color: colors.muted },
    list: { flex: 1 },
    listContent: { paddingBottom: 16 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    rowOn: { borderColor: colors.primary, backgroundColor: colors.chip },
    rowText: { flex: 1, marginRight: 10 },
    rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 13, color: colors.muted, marginTop: 4 },
    rowId: { fontSize: 11, fontFamily: 'monospace', color: colors.muted, marginTop: 4 },
    muted: { color: colors.muted, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
    btn: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: 'center',
      marginBottom: 8,
    },
    btnTxt: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
    btnDisabled: { opacity: 0.6 },
  });
}

export default function TaskPickerModal({
  visible,
  onClose,
  onPick,
  excludeTaskIds,
  modalTitle = 'Выбор задачи',
  confirmButtonLabel = 'Привязать задачу',
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createTaskPickerStyles(colors, radii), [colors, radii]);
  const [search, setSearch] = useState('');
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelectedId(null);
    setLoadError(false);
    setAllTasks([]);
    setLoading(true);
    fetchAllTasksCached({ pageSize: 40 })
      .then((list) => {
        setAllTasks(list);
        setLoadError(false);
      })
      .catch(() => {
        setAllTasks([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ex = excludeTaskIds ?? [];
    return allTasks.filter((t) => {
      const id = taskPickerId(t);
      if (!id) return false;
      if (ex.some((x) => taskKeysEqual(id, x))) return false;
      return taskMatchesQuery(t, q);
    });
  }, [allTasks, search, excludeTaskIds]);

  function applyPick() {
    if (!selectedId) return;
    const t = allTasks.find((x) => taskPickerId(x) === selectedId);
    if (!t) return;
    const o = t as Record<string, unknown>;
    const st = String(o.status ?? '').trim();
    onPick({
      id: selectedId,
      title: taskPickerTitle(t),
      ...(st ? { status: st } : {}),
    });
  }

  const emptyHint = loadError
    ? 'Не удалось загрузить задачи. Проверьте сеть.'
    : loading
      ? ''
      : allTasks.length === 0
        ? 'Задач не найдено'
        : filtered.length === 0
          ? search.trim()
            ? 'Ничего не нашли по запросу'
            : 'Список пуст'
          : '';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{modalTitle}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Загружаются ваши задачи из API. Поиск по названию, статусу или ID.
        </Text>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
        />
        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loaderHint}>Загружаем задачи…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(t, i) => taskPickerId(t) || `t-${i}`}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={emptyHint ? <Text style={styles.muted}>{emptyHint}</Text> : null}
            renderItem={({ item }) => {
              const id = taskPickerId(item);
              const selected = id && selectedId === id;
              const o = item as Record<string, unknown>;
              const status = String(o.status ?? '').trim();
              const statusRu = status ? taskStatusLabelRu(status) : '';
              return (
                <Pressable
                  style={[styles.row, selected && styles.rowOn]}
                  onPress={() => id && setSelectedId(id)}
                  disabled={!id}
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {taskPickerTitle(item)}
                    </Text>
                    {statusRu ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {statusRu}
                      </Text>
                    ) : null}
                    {id ? (
                      <Text style={styles.rowId} numberOfLines={1} selectable>
                        {id}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={selected ? colors.primary : colors.border}
                  />
                </Pressable>
              );
            }}
          />
        )}
        <Pressable
          style={[styles.btn, !selectedId && styles.btnDisabled]}
          onPress={() => {
            applyPick();
          }}
          disabled={!selectedId}
        >
          <Text style={styles.btnTxt}>{confirmButtonLabel}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
