import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createComment,
  deleteComment,
  fetchComments,
  flattenCommentResults,
  TaskComment,
  updateComment,
} from '../../api/tasksApi';
import { fetchAllUsersCached } from '../../api/usersApi';
import { TasksStackParamList } from '../../navigation/types';
import { colors, radii, shadowCard } from '../../theme';
import { buildUserDisplayLookup, formatSingleUserLabel } from '../../utils/entityDisplay';

type Props = StackScreenProps<TasksStackParamList, 'TaskComments'>;

export default function TaskCommentsScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const { taskId } = route.params;
  const [items, setItems] = useState<TaskComment[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [page] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [userLookup, setUserLookup] = useState<Map<string, string>>(() => new Map());

  const load = useCallback(async () => {
    const res = await fetchComments(taskId, { page, limit: 30 });
    setItems(flattenCommentResults(res));
  }, [taskId, page]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchAllUsersCached()
      .then((users) => {
        if (!cancelled) setUserLookup(buildUserDisplayLookup(users));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    if (!text.trim()) return;
    try {
      await createComment(taskId, { content: text.trim() });
      setText('');
      await load();
    } catch (e) {
      Alert.alert('Ошибка', String(e));
    }
  }

  function startEdit(c: TaskComment) {
    const id = c.id ?? c._id;
    if (id === undefined) return;
    setEditingId(String(id));
    setEditText(String(c.content ?? ''));
  }

  async function saveEdit() {
    if (!editingId || !editText.trim()) return;
    try {
      await updateComment(taskId, editingId, editText.trim());
      setEditingId(null);
      setEditText('');
      await load();
    } catch (e) {
      Alert.alert('Ошибка', String(e));
    }
  }

  async function removeItem(c: TaskComment) {
    const id = c.id ?? c._id;
    if (id === undefined) return;
    Alert.alert('Удалить комментарий?', undefined, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteComment(taskId, String(id));
            await load();
          } catch (e) {
            Alert.alert('Ошибка', String(e));
          }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={Platform.select({ ios: 84, android: 0, default: 0 })}
    >
      {editingId !== null && (
        <View style={styles.editBar}>
          <Text style={styles.editLabel}>Редактирование</Text>
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={setEditText}
            multiline
          />
          <View style={styles.editActions}>
            <Pressable onPress={() => { setEditingId(null); setEditText(''); }}>
              <Text style={styles.muted}>Отмена</Text>
            </Pressable>
            <Pressable style={{ marginLeft: 24 }} onPress={saveEdit}>
              <Text style={styles.link}>Сохранить</Text>
            </Pressable>
          </View>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(c, i) => String(c.id ?? c._id ?? '').trim() || `comment-${i}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ paddingBottom: 16 }}
        renderItem={({ item }) => {
          const byName = String(item.author_name ?? '').trim();
          const uid = String(item.user_id ?? '').trim();
          const author =
            byName ||
            (uid ? formatSingleUserLabel(uid, userLookup) : '') ||
            (uid || 'Участник');
          return (
          <View style={styles.card}>
            <Text style={styles.author}>{author}</Text>
            <Text style={styles.content}>{String(item.content ?? '')}</Text>
            <View style={styles.row}>
              <Pressable onPress={() => startEdit(item)}>
                <Text style={styles.link}>Изменить</Text>
              </Pressable>
              <Pressable style={{ marginLeft: 16 }} onPress={() => removeItem(item)}>
                <Text style={styles.danger}>Удалить</Text>
              </Pressable>
            </View>
          </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Нет комментариев</Text>}
      />
      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <TextInput
          style={styles.input}
          placeholder="Новый комментарий"
          placeholderTextColor={colors.muted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable style={styles.send} onPress={send}>
          <Text style={styles.sendText}>Отправить</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  editBar: {
    padding: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  editLabel: { color: colors.muted, marginBottom: 6 },
  editInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: 8,
    padding: 10,
    minHeight: 60,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  muted: { color: colors.muted },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  author: { color: colors.primary, fontWeight: '600', marginBottom: 6 },
  content: { color: colors.text },
  row: { flexDirection: 'row', marginTop: 10 },
  link: { color: colors.primary },
  danger: { color: colors.danger },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    minHeight: 44,
    color: colors.text,
    marginBottom: 8,
    backgroundColor: colors.chip,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendText: { color: colors.onPrimary, fontWeight: '600' },
});
