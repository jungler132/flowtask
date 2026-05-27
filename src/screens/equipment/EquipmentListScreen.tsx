import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import {
  equipmentId,
  equipmentSubtitle,
  equipmentTitle,
  fetchEquipmentPage,
  normalizeEquipmentList,
  type Equipment,
} from '../../api/equipmentApi';
import { HeaderOutlineButton, HeaderRow } from '../../components/HeaderActions';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { canManageEquipment } from '../../lib/equipmentAccess';
import { useTabScrollBottomPadding } from '../../lib/screenInsets';
import type { ProfileStackParamList } from '../../navigation/types';
import type { ThemeColors } from '../../theme';
import {
  EQUIPMENT_STATUS_OPTIONS,
  EQUIPMENT_TYPE_OPTIONS,
  equipmentStatusLabel,
  equipmentStatusColorKey,
  equipmentTypeLabel,
} from '../../utils/equipmentLabels';

type Props = StackScreenProps<ProfileStackParamList, 'EquipmentList'>;

const PAGE_SIZE = 20;

function createStyles(colors: ThemeColors, radii: (typeof import('../../theme'))['radii'], shadowCard: ViewStyle) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    filters: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.bgMuted,
    },
    search: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.card,
      marginBottom: 8,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    chip: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.muted },
    chipTextActive: { color: colors.onPrimary },
    row: {
      marginHorizontal: 12,
      marginTop: 10,
      padding: 14,
      borderRadius: radii.lg,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
    },
    rowTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    rowSub: { color: colors.muted, fontSize: 14, marginTop: 4 },
    status: { fontSize: 13, fontWeight: '600', marginTop: 6 },
    empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    emptyText: { color: colors.muted, fontSize: 16, textAlign: 'center' },
    footer: { paddingVertical: 16, alignItems: 'center' },
  });
}

function statusColor(colors: ThemeColors, key: ReturnType<typeof equipmentStatusColorKey>): string {
  switch (key) {
    case 'success':
      return colors.success;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.priorityMedium;
    default:
      return colors.muted;
  }
}

export default function EquipmentListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadowCard), [colors, radii, shadowCard]);
  const tabScrollBottom = useTabScrollBottomPadding();

  const [items, setItems] = useState<Equipment[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!canManageEquipment(user)) {
      Alert.alert('Нет доступа', 'Раздел оборудования доступен только IT и администраторам.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [user, navigation]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (opts?: { page?: number; append?: boolean; refresh?: boolean }) => {
      const p = opts?.page ?? 1;
      const append = opts?.append ?? false;
      if (opts?.refresh) setRefreshing(true);
      else if (!append) setLoading(true);
      try {
        const res = await fetchEquipmentPage({
          page: p,
          limit: PAGE_SIZE,
          search: searchDebounced || undefined,
          equipment_type: typeFilter || undefined,
          status: statusFilter || undefined,
          ordering: '-updated_at',
        });
        const batch = normalizeEquipmentList(res);
        const total = Number(res.count ?? 0);
        const pages = Number(res.pages ?? 0);
        setItems((prev) => (append ? [...prev, ...batch] : batch));
        setPage(p);
        if (pages > 0) {
          setHasMore(p < pages);
        } else if (total > 0) {
          setHasMore(p * PAGE_SIZE < total);
        } else {
          setHasMore(batch.length >= PAGE_SIZE);
        }
      } catch {
        if (!append) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchDebounced, typeFilter, statusFilter],
  );

  useEffect(() => {
    if (!canManageEquipment(user)) return;
    load({ page: 1 }).catch(() => {});
  }, [load, user]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderRow>
          <HeaderOutlineButton label="Скан QR" onPress={() => navigation.navigate('EquipmentQr')} />
          <HeaderOutlineButton
            label="Добавить"
            onPress={() => navigation.navigate('EquipmentForm', {})}
          />
        </HeaderRow>
      ),
    });
  }, [navigation]);

  const renderItem = ({ item }: { item: Equipment }) => {
    const id = equipmentId(item);
    const st = String(item.status ?? '');
    const sk = equipmentStatusColorKey(st);
    return (
      <Pressable
        style={styles.row}
        onPress={() => id && navigation.navigate('EquipmentDetail', { equipmentId: id })}
      >
        <Text style={styles.rowTitle}>{equipmentTitle(item)}</Text>
        <Text style={styles.rowSub}>{equipmentSubtitle(item)}</Text>
        <Text style={[styles.status, { color: statusColor(colors, sk) }]}>
          {String(item.status_display ?? equipmentStatusLabel(st))}
          {String(item.inventory_number ?? '').trim()
            ? ` · инв. ${String(item.inventory_number)}`
            : ''}
        </Text>
        <Text style={styles.rowSub}>
          {equipmentTypeLabel(String(item.equipment_type ?? ''))}
        </Text>
      </Pressable>
    );
  };

  const listEmpty =
    !loading && items.length === 0 ? (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Оборудование не найдено</Text>
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <View style={styles.filters}>
        <TextInput
          style={styles.search}
          placeholder="Поиск: модель, инв. №, серийный…"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !typeFilter && styles.chipActive]}
              onPress={() => setTypeFilter('')}
            >
              <Text style={[styles.chipText, !typeFilter && styles.chipTextActive]}>Все типы</Text>
            </Pressable>
            {EQUIPMENT_TYPE_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                style={[styles.chip, typeFilter === o.value && styles.chipActive]}
                onPress={() => setTypeFilter(typeFilter === o.value ? '' : o.value)}
              >
                <Text
                  style={[styles.chipText, typeFilter === o.value && styles.chipTextActive]}
                >
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !statusFilter && styles.chipActive]}
              onPress={() => setStatusFilter('')}
            >
              <Text style={[styles.chipText, !statusFilter && styles.chipTextActive]}>Все статусы</Text>
            </Pressable>
            {EQUIPMENT_STATUS_OPTIONS.filter((o) => o.value !== '').map((o) => (
              <Pressable
                key={o.value || 'blank'}
                style={[styles.chip, statusFilter === o.value && styles.chipActive]}
                onPress={() => setStatusFilter(statusFilter === o.value ? '' : o.value)}
              >
                <Text
                  style={[styles.chipText, statusFilter === o.value && styles.chipTextActive]}
                >
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, i) => equipmentId(item) || `eq-${i}`}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: tabScrollBottom }}
          ListEmptyComponent={listEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ page: 1, refresh: true }).catch(() => {})}
              colors={[colors.primary]}
            />
          }
          onEndReached={() => {
            if (hasMore && !loading && !refreshing) {
              load({ page: page + 1, append: true }).catch(() => {});
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            hasMore && items.length > 0 ? (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
