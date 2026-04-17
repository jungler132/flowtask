import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchSubtasks, Task } from '../../api/tasksApi';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { TasksStackParamList } from '../../navigation/types';
import { colors } from '../../theme';
import { taskRouteId, taskTitle } from '../../utils/task';

type Props = StackScreenProps<TasksStackParamList, 'TaskSubtasks'>;

export default function TaskSubtasksScreen({ route, navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const { taskId } = route.params;
  const [items, setItems] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setItems(await fetchSubtasks(taskId));
  }, [taskId]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={{ paddingBottom: tabScrollBottom }}
      data={items}
      keyExtractor={(t) => taskRouteId(t)}
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
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() =>
            navigation.navigate('TaskDetail', {
              taskId: taskRouteId(item),
              taskTitle: taskTitle(item),
            })
          }
        >
          <Text style={styles.title}>{taskTitle(item)}</Text>
          <Text style={styles.meta}>{String(item.status ?? '')}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Нет подзадач</Text>}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  row: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.muted, marginTop: 4 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
