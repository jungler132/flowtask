import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchNewsById,
  fetchNewsPage,
  newsContentPreview,
  newsId,
  newsLevelKey,
  newsLevelMatches,
  newsTitle,
  type NewsItem,
  type NewsLevel,
} from '../api/newsApi';
import { useTheme } from '../context/ThemeContext';
import { paddingTopUnderStatusBar, useTabScrollBottomPadding } from '../lib/screenInsets';
import type { ThemeColors } from '../theme';

type ThemeRadii = (typeof import('../theme'))['radii'];

function levelBadgeLabel(item: NewsItem): string {
  const key = newsLevelKey(item);
  if (key === 'important') return 'Важно';
  if (key === 'general') return 'Общая';
  if (key === 'training') return 'Обучение';
  return '';
}

function formatNewsDate(iso: unknown): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function newsIsPinned(item: NewsItem): boolean {
  return Boolean((item as Record<string, unknown>).is_pinned);
}

function newsCreatedAtMs(item: NewsItem): number {
  const raw = String((item as Record<string, unknown>).created_at ?? '').trim();
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Закреплённые сверху; среди закреплённых и остальных — по дате, новее выше. */
function sortNewsItems(list: NewsItem[]): NewsItem[] {
  return [...list].sort((a, b) => {
    const pa = newsIsPinned(a);
    const pb = newsIsPinned(b);
    if (pa !== pb) return pa ? -1 : 1;
    return newsCreatedAtMs(b) - newsCreatedAtMs(a);
  });
}

function createNewsStyles(colors: ThemeColors, radii: ThemeRadii, shadowCard: ViewStyle) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    listFlex: { flex: 1 },
    listContent: { paddingTop: 0, paddingBottom: 24, paddingHorizontal: 10 },
    /**
     * Плашка поиска+фильтров: на всю ширину экрана и под статус-бар (фон до верха).
     * Контент — только внутри `headerInner`, чтобы поле и чипы не вылезали за края.
     */
    headerPanel: {
      width: '100%',
      alignSelf: 'stretch',
      backgroundColor: colors.bgMuted,
      marginBottom: 10,
      overflow: 'hidden',
    },
    headerInner: {
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8,
      minHeight: 42,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: Platform.OS === 'android' ? 0 : 2,
      minHeight: 24,
      ...(Platform.OS === 'android' ? { textAlignVertical: 'center' as const } : {}),
    },
    chipScroll: {
      flexGrow: 0,
      width: '100%',
      maxWidth: '100%',
    },
    chipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingRight: 4,
    },
    chip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radii.sm,
      backgroundColor: colors.chip,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 34,
      justifyContent: 'center',
    },
    chipOn: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipTxt: { fontSize: 13, fontWeight: '600', color: colors.text },
    chipTxtOn: { color: colors.onPrimary, fontWeight: '700' },
    card: {
      marginBottom: 12,
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadowCard,
    },
    cardPinned: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 8,
    },
    cardTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    levelPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radii.sm,
      backgroundColor: colors.primarySoft,
      alignSelf: 'flex-start',
    },
    levelPillTxt: { fontSize: 12, fontWeight: '700', color: colors.primary },
    preview: { fontSize: 15, lineHeight: 22, color: colors.muted },
    meta: { fontSize: 13, color: colors.primary, marginTop: 10 },
    empty: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 16, paddingHorizontal: 24 },
    footerLoader: { paddingVertical: 20 },
    modalRoot: { flex: 1 },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
    },
    modalSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'column',
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, paddingRight: 8 },
    /** Фиксированная высота листа + flex:1 — иначе длинный текст обрезается снизу */
    modalScroll: { flex: 1, minHeight: 0 },
    modalScrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28,
    },
    modalContent: { fontSize: 16, lineHeight: 24, color: colors.text },
    modalMeta: { fontSize: 14, color: colors.primary, marginBottom: 12 },
  });
}

const PAGE_SIZE = 15;
/** Если сервер не отфильтровал по `level`, подгружаем пачку без параметра и режем на клиенте. */
const LEVEL_FALLBACK_PAGE_SIZE = 200;

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const tabScrollBottom = useTabScrollBottomPadding();
  const { colors, radii, shadowCard } = useTheme();
  const styles = useMemo(
    () => createNewsStyles(colors, radii, shadowCard),
    [colors, radii, shadowCard],
  );

  const [items, setItems] = useState<NewsItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<NewsLevel | 'all'>('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<NewsItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /** Сервер вернул 0 по `level=…` — дальше грузим страницы без `level` и фильтруем сами. */
  const clientSideLevelOnly = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadInitial = useCallback(async () => {
    clientSideLevelOnly.current = false;
    setLoading(true);
    try {
      if (levelFilter === 'all') {
        const res = await fetchNewsPage({
          page: 1,
          page_size: PAGE_SIZE,
          search: debouncedSearch || undefined,
          ordering: '-created_at',
        });
        const batch = res.results ?? [];
        setItems(sortNewsItems(batch));
        setHasMore(!!res.next);
        setPage(2);
        return;
      }

      let res = await fetchNewsPage({
        page: 1,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        ordering: '-created_at',
        level: levelFilter,
      });
      let batch = res.results ?? [];
      if (batch.length === 0) {
        res = await fetchNewsPage({
          page: 1,
          page_size: LEVEL_FALLBACK_PAGE_SIZE,
          search: debouncedSearch || undefined,
          ordering: '-created_at',
        });
        batch = (res.results ?? []).filter((i) => newsLevelMatches(i, levelFilter));
        clientSideLevelOnly.current = true;
      }
      setItems(sortNewsItems(batch));
      setHasMore(!!res.next);
      setPage(2);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, levelFilter]);

  useEffect(() => {
    loadInitial().catch(() => {});
  }, [loadInitial]);

  async function loadMore() {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const base = {
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch || undefined,
        ordering: '-created_at' as const,
      };
      const res =
        levelFilter !== 'all' && !clientSideLevelOnly.current
          ? await fetchNewsPage({ ...base, level: levelFilter })
          : await fetchNewsPage(base);
      let batch = res.results ?? [];
      if (levelFilter !== 'all' && clientSideLevelOnly.current) {
        batch = batch.filter((i) => newsLevelMatches(i, levelFilter));
      }
      setItems((prev) => sortNewsItems([...prev, ...batch]));
      setHasMore(!!res.next);
      setPage((p) => p + 1);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  async function openDetail(item: NewsItem) {
    const id = newsId(item);
    if (!id) return;
    setDetailId(id);
    setDetailItem(item);
    setDetailLoading(true);
    try {
      const full = await fetchNewsById(id);
      setDetailItem(full);
    } catch {
      /* оставляем данные из списка */
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailId(null);
    setDetailItem(null);
    setDetailLoading(false);
  }

  const modalSheetHeight = Math.round(windowHeight * 0.88);
  const modalSheetPadBottom = Math.max(16, insets.bottom + 12);

  const levelChips: { key: NewsLevel | 'all'; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'important', label: 'Важно' },
    { key: 'general', label: 'Общие' },
    { key: 'training', label: 'Обучение' },
  ];

  if (loading && items.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: paddingTopUnderStatusBar(insets) }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const newsHeader = (
    <View style={[styles.headerPanel, { paddingTop: insets.top }]}>
      <View style={styles.headerInner}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по новостям"
            placeholderTextColor={colors.muted}
            value={searchInput}
            onChangeText={setSearchInput}
            returnKeyType="search"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
          bounces={false}
        >
          {levelChips.map((c) => {
            const on = levelFilter === c.key;
            return (
              <Pressable
                key={c.key}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setLevelFilter(c.key)}
              >
                <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {newsHeader}
      <FlatList
        style={styles.listFlex}
        data={items}
        keyExtractor={(item, i) => newsId(item) || `news-${i}`}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: tabScrollBottom,
            flexGrow: items.length === 0 ? 1 : undefined,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadInitial().catch(() => {});
            }}
            tintColor={colors.primary}
          />
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListEmptyComponent={
          <Text style={styles.empty}>Нет новостей по выбранным условиям.</Text>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const title = newsTitle(item);
          const preview = newsContentPreview(item, 200);
          const pinned = Boolean((item as Record<string, unknown>).is_pinned);
          const lvl = levelBadgeLabel(item);
          const author = String((item as Record<string, unknown>).author_name ?? '').trim();
          const cat = String((item as Record<string, unknown>).category_name ?? '').trim();
          const created = formatNewsDate((item as Record<string, unknown>).created_at);
          const metaBits = [created, author, cat].filter(Boolean);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.card,
                pinned && styles.cardPinned,
                pressed && { opacity: 0.92 },
              ]}
              onPress={() => void openDetail(item)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={3}>
                  {title}
                </Text>
                {lvl ? (
                  <View style={styles.levelPill}>
                    <Text style={styles.levelPillTxt}>{lvl}</Text>
                  </View>
                ) : null}
              </View>
              {pinned ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Ionicons name="pin" size={14} color={colors.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>Закреплено</Text>
                </View>
              ) : null}
              {preview ? (
                <Text style={styles.preview} numberOfLines={4}>
                  {preview}
                </Text>
              ) : null}
              {metaBits.length > 0 ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {metaBits.join(' · ')}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />

      <Modal
        visible={detailId !== null}
        transparent
        animationType="slide"
        onRequestClose={closeDetail}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeDetail} accessibilityLabel="Закрыть" />
          <View
            style={[
              styles.modalSheet,
              { height: modalSheetHeight, paddingBottom: modalSheetPadBottom },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={3}>
                {detailItem ? newsTitle(detailItem) : 'Новость'}
              </Text>
              <Pressable onPress={closeDetail} hitSlop={12} accessibilityLabel="Закрыть">
                <Ionicons name="close" size={28} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {detailLoading ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}
              <Text style={styles.modalMeta}>
                {detailItem
                  ? [
                      formatNewsDate((detailItem as Record<string, unknown>).created_at),
                      String((detailItem as Record<string, unknown>).author_name ?? '').trim(),
                      String((detailItem as Record<string, unknown>).category_name ?? '').trim(),
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : ''}
              </Text>
              <Text style={styles.modalContent} selectable>
                {detailItem ? String((detailItem as Record<string, unknown>).content ?? '').trim() : ''}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
