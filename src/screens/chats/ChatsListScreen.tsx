import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paddingTopUnderStatusBar, useTabScrollBottomPadding } from '../../lib/screenInsets';
import { Chat, ChatMessage, cursorFromUrl, fetchChats, fetchMessages } from '../../api/chatsApi';
import {
  applyLocalReadToChats,
  extractChatLastPreview,
  extractChatLastMessageAt,
  hydrateLocalReadChats,
  markChatLocallyRead,
} from '../../lib/chatUnread';
import { prefetchChatRoom } from '../../lib/chatRoomPrefetch';
import { ChatsStackParamList } from '../../navigation/types';
import { colors, radii, shadowCard } from '../../theme';
import { parseAttachments, isImageAttachment } from '../../utils/chatAttachments';
import { chatTypeLabelRu } from '../../utils/taskLabels';

type Props = StackScreenProps<ChatsStackParamList, 'ChatsHome'>;

export default function ChatsListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const tabScrollBottom = useTabScrollBottomPadding();
  const [items, setItems] = useState<Chat[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);

  const normalizePreview = useCallback((raw: unknown): string => {
    if (typeof raw === 'string') return raw.trim();
    if (raw && typeof raw === 'object') {
      const o = raw as Record<string, unknown>;
      for (const key of ['content', 'text', 'message', 'body']) {
        const v = o[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
    }
    return '';
  }, []);

  const previewFromMessage = useCallback(
    (m: ChatMessage): string => {
      const content = normalizePreview((m as Record<string, unknown>).content);
      if (content) return content;
      const attachments = parseAttachments((m as Record<string, unknown>).attachments);
      if (attachments.length > 0) {
        return attachments.some((a) => isImageAttachment(a)) ? 'Фото' : 'Файл';
      }
      return '';
    },
    [normalizePreview]
  );

  const messageTs = useCallback((m: ChatMessage): number => {
    const t = new Date(String((m as Record<string, unknown>).created_at ?? '')).getTime();
    return Number.isFinite(t) ? t : 0;
  }, []);

  const enrichChatsWithActualLastMessage = useCallback(
    async (source: Chat[]): Promise<Chat[]> => {
      const ids = source
        .map((c) => String(c._id ?? '').trim())
        .filter(Boolean)
        .slice(0, 20);
      if (ids.length === 0) return source;
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetchMessages(id, { page_size: 20, ordering: '-created_at' });
            const list = res.results ?? [];
            if (list.length === 0) return { id, preview: '', at: 0 };
            const latest = list[0];
            return { id, preview: previewFromMessage(latest), at: messageTs(latest) };
          } catch {
            return { id, preview: '', at: 0 };
          }
        })
      );
      const byId = new Map(results.map((x) => [x.id, x]));
      return source.map((c) => {
        const id = String(c._id ?? '').trim();
        const next = byId.get(id);
        if (!next) return c;
        const patch: Record<string, unknown> = {};
        if (next.preview) patch.last_message = next.preview;
        if (next.at > 0) patch.last_message_created_at = new Date(next.at).toISOString();
        return Object.keys(patch).length > 0 ? { ...c, ...patch } : c;
      });
    },
    [messageTs, previewFromMessage]
  );

  const loadInitial = useCallback(async () => {
    await hydrateLocalReadChats();
    const res = await fetchChats({ page_size: 30 });
    const normalized = applyLocalReadToChats(res.results ?? []);
    const enriched = await enrichChatsWithActualLastMessage(normalized).catch(() => normalized);
    setItems(enriched);
    setNextCursor(cursorFromUrl(res.next ?? null));
  }, [enrichChatsWithActualLastMessage]);

  useEffect(() => {
    loadInitial()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [loadInitial]);

  useFocusEffect(
    useCallback(() => {
      loadInitial().catch(() => {});
    }, [loadInitial])
  );

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  async function loadMore() {
    if (!nextCursor) return;
    await hydrateLocalReadChats();
    const res = await fetchChats({ cursor: nextCursor, page_size: 30 });
    const normalized = applyLocalReadToChats(res.results ?? []);
    const enriched = await enrichChatsWithActualLastMessage(normalized).catch(() => normalized);
    setItems((prev) => [...prev, ...enriched]);
    setNextCursor(cursorFromUrl(res.next ?? null));
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: paddingTopUnderStatusBar(insets) }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const filteredItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = String(item.name ?? '').toLowerCase();
    const preview = extractChatLastPreview(item).toLowerCase();
    return name.includes(q) || preview.includes(q);
  });

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={[
        styles.listContent,
        {
          paddingTop: paddingTopUnderStatusBar(insets),
          paddingBottom: tabScrollBottom,
        },
      ]}
      data={filteredItems}
      keyExtractor={(c, i) => String(c._id ?? '').trim() || `chat-${i}`}
      ListHeaderComponent={
        <View style={styles.topArea}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Поиск по чатам"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <View style={styles.actionsRow}>
            <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('ChatFromTask')}>
              <Ionicons name="briefcase-outline" size={16} color={colors.primary} />
              <Text style={styles.actionTxt}>По задаче</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('ChatCreate')}>
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.actionTxt}>Новый чат</Text>
            </Pressable>
          </View>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadInitial();
            setRefreshing(false);
          }}
        />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      renderItem={({ item }) => {
        const id = String(item._id ?? '');
        const typeRaw = String(item.type ?? '').trim();
        const typeRu = chatTypeLabelRu(typeRaw);
        const preview = extractChatLastPreview(item);
        const lastAt = extractChatLastMessageAt(item);
        const unread = Number(item.unread_count ?? 0);
        const iconName =
          typeRaw === 'task'
            ? 'briefcase-outline'
            : typeRaw === 'group'
              ? 'people-outline'
              : 'person-outline';
        return (
          <Pressable
            style={styles.row}
            onPress={async () => {
              if (openingChatId === id) return;
              setOpeningChatId(id);
              markChatLocallyRead(id, lastAt > 0 ? lastAt : undefined);
              setItems((prev) =>
                prev.map((c) => (String(c._id ?? '') === id ? { ...c, unread_count: 0 } : c))
              );
              try {
                await prefetchChatRoom(id);
              } catch {
                /* если префетч не удался — откроем чат обычным путём */
              }
              navigation.navigate('ChatRoom', {
                chatId: id,
                title: String(item.name ?? 'Чат'),
              });
              setOpeningChatId(null);
            }}
          >
            <View style={styles.rowHead}>
              <View style={styles.avatar}>
                <Ionicons name={iconName} size={22} color={colors.primary} />
              </View>
              <View style={styles.rowHeadText}>
                <Text style={styles.name} numberOfLines={2}>
                  {String(item.name ?? 'Чат')}
                </Text>
                <View style={styles.typeRow}>
                  <Text style={styles.typePill}>{typeRu}</Text>
                  {openingChatId === id ? <Text style={styles.loadingPill}>Открытие…</Text> : null}
                  {unread > 0 ? <Text style={styles.unreadPill}>{unread}</Text> : null}
                </View>
              </View>
            </View>
            {preview ? (
              <Text style={styles.preview} numberOfLines={2}>
                {preview}
              </Text>
            ) : (
              <Text style={styles.previewMuted}>Нет сообщений</Text>
            )}
          </Pressable>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>Нет чатов</Text>}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingBottom: 24 },
  topArea: { paddingHorizontal: 16, paddingBottom: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 10,
    marginLeft: 8,
  },
  actionsRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 8,
    gap: 6,
  },
  actionTxt: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  row: {
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadowCard,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rowHeadText: { flex: 1, minWidth: 0 },
  name: { color: colors.text, fontSize: 15, fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 4, gap: 8 },
  typePill: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: colors.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  unreadPill: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onPrimary,
    backgroundColor: colors.primary,
    minWidth: 22,
    textAlign: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  loadingPill: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted,
    backgroundColor: colors.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  preview: { color: colors.muted, marginTop: 6, fontSize: 13, lineHeight: 18 },
  previewMuted: { color: colors.muted, marginTop: 6, fontSize: 13, fontStyle: 'italic' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
});
