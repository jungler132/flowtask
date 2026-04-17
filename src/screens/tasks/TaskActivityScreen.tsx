import { Ionicons } from '@expo/vector-icons';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { formatApiErrorForUser } from '../../api/client';
import { fetchActivity, postActivity, Task } from '../../api/tasksApi';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { TasksStackParamList } from '../../navigation/types';
import { colors, radii, shadowCard } from '../../theme';
import { formatActivityTime } from '../../utils/taskLabels';
import { taskRouteId, taskTitle } from '../../utils/task';

type Props = StackScreenProps<TasksStackParamList, 'TaskActivity'>;

type ActivityRow = Record<string, unknown>;

function activityDescription(item: ActivityRow): string {
  const d = item.description;
  if (typeof d === 'string' && d.trim()) return d.trim();
  const msg = item.message;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  const action = item.action;
  if (typeof action === 'string' && action.trim()) return action.trim();
  return taskTitle(item as Task);
}

function activityTime(item: ActivityRow): string {
  const raw = item.created_at ?? item.createdAt ?? item.timestamp;
  return formatActivityTime(typeof raw === 'string' ? raw : '');
}

function activityActionBadge(item: ActivityRow): string {
  const a = item.action;
  if (typeof a !== 'string' || !a.trim()) return '';
  return a.trim();
}

export default function TaskActivityScreen({ route }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { taskId } = route.params;
  const [items, setItems] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [payload, setPayload] = useState('{}');
  const [devOpen, setDevOpen] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchActivity(taskId);
    setItems(data);
  }, [taskId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function send() {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(payload || '{}');
    } catch {
      Alert.alert('Некорректный JSON');
      return;
    }
    try {
      await postActivity(taskId, body);
      setPayload('{}');
      await load();
    } catch (e) {
      Alert.alert('Ошибка', formatApiErrorForUser(e));
    }
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        contentContainerStyle={{ paddingBottom: tabScrollBottom }}
        keyExtractor={(t, i) => taskRouteId(t) + i}
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
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <Pressable style={styles.devToggle} onPress={() => setDevOpen((v) => !v)} hitSlop={8}>
              <Ionicons
                name={devOpen ? 'chevron-down' : 'chevron-forward'}
                size={20}
                color={colors.muted}
              />
              <Text style={styles.devToggleTxt}>Технический ввод (POST активности)</Text>
            </Pressable>
            {devOpen ? (
              <View style={styles.form}>
                <Text style={styles.hint}>Тело запроса JSON — только для отладки</Text>
                <TextInput
                  style={styles.jsonInput}
                  value={payload}
                  onChangeText={setPayload}
                  multiline
                />
                <Pressable style={styles.btn} onPress={send}>
                  <Text style={styles.btnText}>Отправить</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const row = item as unknown as ActivityRow;
          const desc = activityDescription(row);
          const time = activityTime(row);
          const badge = activityActionBadge(row);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                {badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt} numberOfLines={1}>
                      {badge}
                    </Text>
                  </View>
                ) : null}
                {time ? <Text style={styles.time}>{time}</Text> : null}
              </View>
              <Text style={styles.cardBody}>{desc || 'Событие без текста'}</Text>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Пока нет записей активности</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerBlock: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  devToggleTxt: { color: colors.muted, fontSize: 14, fontWeight: '500' },
  form: { paddingHorizontal: 16, paddingBottom: 12 },
  hint: { color: colors.muted, marginBottom: 8, fontSize: 13 },
  jsonInput: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: radii.md,
    padding: 12,
    minHeight: 80,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    marginTop: 10,
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnText: { color: colors.onPrimary, fontWeight: '700' },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  badge: {
    flexShrink: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '70%',
  },
  badgeTxt: { color: colors.primary, fontSize: 12, fontWeight: '600' },
  time: { color: colors.muted, fontSize: 12, flexShrink: 0 },
  cardBody: { color: colors.text, fontSize: 15, lineHeight: 22 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 32, paddingHorizontal: 24 },
});
