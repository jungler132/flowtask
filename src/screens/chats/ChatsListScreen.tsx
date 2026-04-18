import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
  unreadCountNumber,
} from '../../lib/chatUnread';
import { prefetchChatRoom } from '../../lib/chatRoomPrefetch';
import { ChatsStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme';
import { parseAttachments, isImageAttachment } from '../../utils/chatAttachments';
import { chatTypeLabelRu } from '../../utils/taskLabels';
import { usePrivateChatPeerTitles } from './usePrivateChatPeerTitles';

type Props = StackScreenProps<ChatsStackParamList, 'ChatsHome'>;

/** Пока открыт список чатов — тихий опрос, чтобы превью и непрочитанные обновлялись без pull-to-refresh. */
const CHATS_LIST_POLL_MS = 4000;

/** Время в строке списка (как в Telegram): сегодня — часы, вчера — «Вчера», иначе дата. */
function formatChatListTime(msOrIso: string | number | undefined): string {
  if (msOrIso == null || msOrIso === '') return '';
  const d =
    typeof msOrIso === 'number'
      ? new Date(msOrIso)
      : new Date(String(msOrIso));
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (today) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (yesterday.toDateString() === d.toDateString()) {
    return 'Вчера';
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function listRowInitials(chatName: string): string {
  const parts = chatName.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[1][0];
    if (a && b) return (a + b).toUpperCase();
  }
  const s = parts[0] || chatName.trim() || '?';
  return s.slice(0, 1).toUpperCase();
}

export default function ChatsListScreen({ navigation }: Props) {
  const { colors, radii } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createChatsListStyles(colors, radii), [colors, radii]);
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
      const id = setInterval(() => {
        loadInitial().catch(() => {});
      }, CHATS_LIST_POLL_MS);
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') loadInitial().catch(() => {});
      });
      return () => {
        clearInterval(id);
        sub.remove();
      };
    }, [loadInitial])
  );

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const myUserId = String(user?.user_id ?? user?._uid ?? user?._id ?? '').trim();
  const { chatRowTitle } = usePrivateChatPeerTitles(items, myUserId);

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
    const resolved = chatRowTitle(item).toLowerCase();
    const preview = extractChatLastPreview(item).toLowerCase();
    return name.includes(q) || resolved.includes(q) || preview.includes(q);
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
            <Ionicons name="search-outline" size={16} color={colors.muted} />
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
              <Ionicons name="briefcase-outline" size={15} color={colors.primary} />
              <Text style={styles.actionTxt}>По задаче</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => navigation.navigate('ChatCreate')}>
              <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
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
        const id = String(item._id ?? '').trim();
        const typeRaw = String(item.type ?? '').trim();
        const isPrivate = typeRaw.toLowerCase() === 'private';
        const typeRu = chatTypeLabelRu(typeRaw);
        const preview = extractChatLastPreview(item);
        const lastAt = extractChatLastMessageAt(item);
        const unread = unreadCountNumber(item.unread_count);
        const iconName =
          typeRaw === 'task'
            ? 'briefcase-outline'
            : typeRaw === 'group'
              ? 'people-outline'
              : 'person-outline';
        const timeStr = lastAt > 0 ? formatChatListTime(lastAt) : '';
        const apiTitle = String(item.name ?? 'Чат').trim() || 'Чат';
        const chatTitle = chatRowTitle(item) || apiTitle;
        const rowInitials = isPrivate ? listRowInitials(chatTitle) : '';

        return (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={async () => {
              if (openingChatId === id) return;
              setOpeningChatId(id);
              {
                const now = Date.now();
                markChatLocallyRead(
                  id,
                  lastAt > 0 ? Math.max(lastAt, now) : now
                );
              }
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
                title: chatTitle,
              });
              setOpeningChatId(null);
            }}
            android_ripple={{ color: colors.chipActive }}
          >
            <View style={styles.avatar}>
              {isPrivate ? (
                <Text style={styles.avatarInitials} numberOfLines={1}>
                  {rowInitials}
                </Text>
              ) : (
                <Ionicons name={iconName} size={20} color={colors.primary} />
              )}
            </View>
            <View style={styles.rowBody}>
              <View style={styles.titleRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {chatTitle}
                </Text>
                <View style={styles.titleRight}>
                  {openingChatId === id ? (
                    <Text style={styles.metaMuted}>…</Text>
                  ) : timeStr ? (
                    <Text style={styles.time}>{timeStr}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.previewRow}>
                {preview ? (
                  <Text style={styles.preview} numberOfLines={2}>
                    <Text style={styles.previewPrefix}>{typeRu} · </Text>
                    {preview}
                  </Text>
                ) : (
                  <Text style={styles.previewEmpty} numberOfLines={2}>
                    Нет сообщений
                  </Text>
                )}
                {unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeTxt}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      }}
      ListEmptyComponent={<Text style={styles.empty}>Нет чатов</Text>}
    />
  );
}

type ThemeRadii = (typeof import('../../theme'))['radii'];

function createChatsListStyles(colors: ThemeColors, radii: ThemeRadii) {
  return StyleSheet.create({

  root: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingBottom: 20, paddingHorizontal: 6 },
  /** Шапка списка без линии под чатами — только отступ, как единый фон */
  topArea: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    backgroundColor: colors.bg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    marginBottom: 8,
    minHeight: 42,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 9,
    marginLeft: 6,
  },
  actionsRow: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    gap: 6,
    minHeight: 40,
  },
  actionTxt: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  /** Строка чата: «полая» — только обводка, без заливки */
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 8,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.chip,
  },
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
  avatarInitials: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  rowBody: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  titleRight: { flexShrink: 0, paddingTop: 0 },
  /** Как у кнопок «По задаче» / «Новый чат» — не сливаться с серым превью */
  time: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  metaMuted: { fontSize: 13, color: colors.muted },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
    gap: 8,
  },
  preview: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  previewPrefix: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.primary,
    fontWeight: '600',
  },
  previewEmpty: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    fontStyle: 'italic',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeTxt: {
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 36, fontSize: 14 },
  });
}


