import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import { fetchTasksCreated, fetchTasksMy, fetchTasksPage, Task } from '../../api/tasksApi';
import { HeaderOutlineButton, HeaderRow } from '../../components/HeaderActions';
import { TasksStackParamList } from '../../navigation/types';
import { colors, radii, shadowCard } from '../../theme';
import { taskRouteId, taskTitle } from '../../utils/task';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  taskPriorityLabelRu,
  taskPriorityRowBorder,
  taskStatusLabelRu,
} from '../../utils/taskLabels';

type Props = StackScreenProps<TasksStackParamList, 'TasksHome'>;

type Segment = 'my' | 'created' | 'all';

export default function TasksHomeScreen({ navigation }: Props) {
  const tabScrollBottom = useTabScrollBottomPadding();
  const [segment, setSegment] = useState<Segment>('all');
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');

  const load = useCallback(
    async (opts: { reset?: boolean; appendPage?: number } = {}) => {
      const reset = opts.reset ?? false;
      setFetching(true);
      try {
        if (segment === 'all') {
          const p = reset ? 1 : (opts.appendPage ?? page);
          const res = await fetchTasksPage({
            page: p,
            page_size: 20,
            search: search || undefined,
            status: status || undefined,
            priority: priority || undefined,
          });
          const next = res.results ?? [];
          setHasMore(!!res.next);
          if (reset) {
            setItems(next);
            setPage(2);
          } else {
            setItems((prev) => [...prev, ...next]);
            setPage(p + 1);
          }
        } else if (segment === 'my') {
          setItems(await fetchTasksMy());
          setHasMore(false);
        } else {
          setItems(await fetchTasksCreated());
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setFirstLoadDone(true);
        setFetching(false);
        setRefreshing(false);
      }
    },
    [segment, page, search, status, priority]
  );

  useEffect(() => {
    if (!firstLoadDone) setLoading(true);
    load({ reset: true }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on segment/filters
  }, [segment, search, status, priority]);

  const onRefresh = () => {
    setRefreshing(true);
    setPage(1);
    load({ reset: true });
  };

  const loadMore = () => {
    if (!hasMore || segment !== 'all' || loading || refreshing) return;
    load({ appendPage: page });
  };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderRow>
          <HeaderOutlineButton
            label="Создать задачу"
            onPress={() => navigation.navigate('TaskForm', {})}
          />
        </HeaderRow>
      ),
    });
  }, [navigation]);

  const segments: { key: Segment; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'my', label: 'Мои' },
    { key: 'created', label: 'Созданные' },
  ];
  
  const listHeader = (
    <>
      <View style={styles.segmentBlock}>
        <View style={styles.segmentRow}>
          {segments.map((s) => (
            <Pressable
              key={s.key}
              style={[styles.segmentChip, segment === s.key && styles.segmentChipActive]}
              onPress={() => setSegment(s.key)}
            >
              <Text style={[styles.segmentChipText, segment === s.key && styles.segmentChipTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {segment === 'all' ? (
        <View style={styles.filters}>
          <TextInput
            style={styles.filterSearch}
            placeholder="Поиск по названию…"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.filterGroup}>
            <View style={styles.filterGroupHeader}>
              <Text style={styles.filterLabel}>Статус</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              <Pressable
                style={[styles.filterChip, !status && styles.filterChipOn]}
                onPress={() => setStatus('')}
              >
                <Text style={[styles.filterChipTxt, !status && styles.filterChipTxtOn]}>Все</Text>
              </Pressable>
              {TASK_STATUS_OPTIONS.map((opt) => {
                const on = status === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.filterChip, on && styles.filterChipOn]}
                    onPress={() => setStatus(opt.value)}
                  >
                    <Text style={[styles.filterChipTxt, on && styles.filterChipTxtOn]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.filterGroup}>
            <View style={styles.filterGroupHeader}>
              <Text style={styles.filterLabel}>Приоритет</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              <Pressable
                style={[styles.filterChip, !priority && styles.filterChipOn]}
                onPress={() => setPriority('')}
              >
                <Text style={[styles.filterChipTxt, !priority && styles.filterChipTxtOn]}>Все</Text>
              </Pressable>
              {TASK_PRIORITY_OPTIONS.map((opt) => {
                const on = priority === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.filterChip, on && styles.filterChipOn]}
                    onPress={() => setPriority(opt.value)}
                  >
                    <Text style={[styles.filterChipTxt, on && styles.filterChipTxtOn]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.root}>
      {!firstLoadDone && loading ? (
        <View style={styles.listFill}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabScrollBottom }]}
          data={items}
          keyExtractor={(t) => taskRouteId(t)}
          ListHeaderComponent={listHeader}
          ListHeaderComponentStyle={fetching ? styles.listHeaderBusy : undefined}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => {
            const st = String(item.status ?? '').trim();
            const pr = String(item.priority ?? '').trim();
            const metaParts: string[] = [];
            if (st) metaParts.push(taskStatusLabelRu(st));
            if (pr) metaParts.push(taskPriorityLabelRu(pr));
            const border = taskPriorityRowBorder(pr);
            return (
              <Pressable
                style={[styles.row, { borderColor: border.borderColor, borderWidth: border.borderWidth }]}
                onPress={() =>
                  navigation.navigate('TaskDetail', {
                    taskId: taskRouteId(item),
                    taskTitle: taskTitle(item),
                  })
                }
              >
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {taskTitle(item)}
                </Text>
                {metaParts.length > 0 ? (
                  <Text style={styles.rowMeta}>{metaParts.join(' · ')}</Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.empty}>Нет задач</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segmentBlock: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentChip: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  segmentChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentChipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  segmentChipTextActive: { color: colors.onPrimary },
  list: { flex: 1 },
  listContent: { paddingTop: 10, paddingBottom: 24 },
  listFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filters: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  filterSearch: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: colors.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 16,
  },
  filterGroup: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 10,
  },
  filterGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 8,
  },
  filterLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 10,
  },
  listHeaderBusy: { opacity: 0.6 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipTxt: { color: colors.text, fontSize: 14, fontWeight: '500' },
  filterChipTxtOn: { color: colors.onPrimary, fontWeight: '600' },
  row: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    ...shadowCard,
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowMeta: { color: colors.muted, marginTop: 4, fontSize: 13 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 48 },
});
