import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useHeaderHeight } from '@react-navigation/elements';
import { useFocusEffect } from '@react-navigation/native';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  AppState,
  Dimensions,
  FlatList,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, apiFetch } from '../../api/client';
import {
  Chat,
  ChatMessage,
  chatPathId,
  cursorFromUrl,
  fetchChat,
  fetchChats,
  fetchMessages,
  markChatRead,
  sendMessage,
} from '../../api/chatsApi';
import { fetchUser } from '../../api/usersApi';
import { uploadFile } from '../../api/filesApi';
import { HeaderLink, HeaderRow } from '../../components/HeaderActions';
import { consumePrefetchedChatRoom } from '../../lib/chatRoomPrefetch';
import { markChatLocallyRead } from '../../lib/chatUnread';
import { getAccessToken } from '../../lib/storage';
import { ChatsStackParamList } from '../../navigation/types';
import {
  ChatAttachment,
  displayableMessageText,
  formatMessageTime,
  isImageAttachment,
  parseAttachments,
  resolveFileUrl,
  shortSenderId,
} from '../../utils/chatAttachments';
import { buildForwardContent, extractAttachmentIdsFromMessage } from '../../utils/chatForward';
import {
  buildReplyDraftFromMessage,
  extractReplyMeta,
  getMessageId,
  type ReplyDraft,
} from '../../utils/chatReply';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../theme';

type Props = StackScreenProps<ChatsStackParamList, 'ChatRoom'>;

type PendingAttachment = { uri: string; name: string; mime: string };

const WIN_H = Dimensions.get('window').height;

function normId(s: string) {
  return String(s ?? '').trim();
}

function comparableUserId(s: string) {
  let t = normId(s);
  if (t.toLowerCase().startsWith('user_')) t = t.slice(5);
  return t;
}

function messageTimeMs(item: ChatMessage): number {
  const t = new Date(String((item as Record<string, unknown>).created_at ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortMessagesAsc(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => messageTimeMs(a) - messageTimeMs(b));
}

/** Ключ для слияния: совпадает с логикой поиска по id в чате. */
function messageMergeKey(m: ChatMessage): string | null {
  const id = normId(getMessageId(m));
  return id ? id.toLowerCase() : null;
}

/**
 * Подмешивает последнюю страницу с сервера (самые новые сообщения) в уже открытую историю,
 * не теряя более старые сообщения после «Ранние сообщения».
 */
function mergeLatestMessagePage(prev: ChatMessage[], latestPage: ChatMessage[]): ChatMessage[] {
  const tail = sortMessagesAsc(latestPage);
  const map = new Map<string, ChatMessage>();
  const withoutId: ChatMessage[] = [];
  for (const m of prev) {
    const k = messageMergeKey(m);
    if (k) map.set(k, m);
    else withoutId.push(m);
  }
  for (const m of tail) {
    const k = messageMergeKey(m);
    if (k) map.set(k, m);
  }
  return sortMessagesAsc([...withoutId, ...map.values()]);
}

const CHAT_POLL_MS = 4000;

async function downloadAttachmentToLocal(att: ChatAttachment): Promise<string> {
  const url = att.url ? resolveFileUrl(att.url) : '';
  if (!url) throw new Error('Нет ссылки на файл');
  const token = await getAccessToken();
  const ext =
    att.name?.match(/\.[a-z0-9]+$/i)?.[0] ||
    (isImageAttachment(att) ? '.jpg' : '');
  const safeName = (att.name || `file-${Date.now()}`).replace(
    /[^a-zA-Z0-9а-яА-ЯёЁ._-]/g,
    '_'
  );
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  const dest = `${baseDir}chat-${Date.now()}-${safeName.slice(0, 48)}${ext || ''}`;
  const res = await FileSystem.downloadAsync(url, dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.uri;
}

function inlineSenderName(item: ChatMessage): string | null {
  const o = item as Record<string, unknown>;
  for (const k of ['sender_full_name', 'sender_name', 'sender_display_name']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Разбиение текста на куски: http(s), ftp, tg, mailto, www.…, t.me / telegram.me
 * (www и t.me без схемы — при открытии подставляется https://)
 */
const CHAT_LINK_SPLIT_RE =
  /(https?:\/\/[^\s]+|ftp:\/\/[^\s]+|tg:\/\/[^\s]+|mailto:[^\s]+|\bwww\.[^\s]+|\b(?:t\.me|telegram\.me)\/[^\s]+)/gi;

/** Знаки, часто «приклеивающиеся» к ссылке из текста предложения. */
function trimUrlTrailingJunk(raw: string): string {
  return raw.replace(/[`'".,;:!?)\]}»]+$/gu, '');
}

function isChatLinkToken(part: string): boolean {
  const t = trimUrlTrailingJunk(part);
  return (
    /^https?:\/\//i.test(t) ||
    /^ftp:\/\//i.test(t) ||
    /^tg:\/\//i.test(t) ||
    /^mailto:/i.test(t) ||
    /^www\./i.test(t) ||
    /^(?:t\.me|telegram\.me)\//i.test(t)
  );
}

function hrefForChatLink(part: string): string {
  const t = trimUrlTrailingJunk(part.trim());
  if (/^https?:\/\//i.test(t)) return t;
  if (/^www\./i.test(t)) return `https://${t}`;
  if (/^(?:t\.me|telegram\.me)\//i.test(t)) return `https://${t}`;
  return t;
}

function MessageBody({ text, isMine }: { text: string; isMine: boolean }) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createChatRoomStyles(colors, radii), [colors, radii]);
  const parts = text.split(CHAT_LINK_SPLIT_RE).filter(Boolean);
  return (
    <Text style={[styles.msgText, isMine && styles.msgTextMine]} selectable>
      {parts.map((part, idx) => {
        if (!isChatLinkToken(part)) {
          return (
            <Text key={`t-${idx}`} style={[styles.msgText, isMine && styles.msgTextMine]}>
              {part}
            </Text>
          );
        }
        return (
          <Text
            key={`l-${idx}`}
            style={[styles.msgLink, isMine && styles.msgLinkMine]}
            onPress={() => Linking.openURL(hrefForChatLink(part)).catch(() => {})}
          >
            {part}
          </Text>
        );
      })}
    </Text>
  );
}

function MessageBubble({
  item,
  mySenderId,
  authHeaders,
  onOpenAttachment,
  showGroupSender,
  resolvedSenderName,
  replyMeta,
  onOpenActions,
  onNavigateToReply,
}: {
  item: ChatMessage;
  mySenderId: string;
  authHeaders: Record<string, string>;
  onOpenAttachment: (att: ChatAttachment) => void;
  /** Показывать имя отправителя (группа / чат по задаче). */
  showGroupSender: boolean;
  /** Имя с API пользователей; пустая строка = ещё грузим. */
  resolvedSenderName: string;
  replyMeta: ReplyDraft | null;
  onOpenActions: () => void;
  onNavigateToReply: (messageId: string) => void;
}) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createChatRoomStyles(colors, radii), [colors, radii]);
  const sid = normId(String(item.sender_id ?? ''));
  const isMine =
    sid !== '' && comparableUserId(sid) === comparableUserId(mySenderId);
  const attachments = parseAttachments(item.attachments);
  const hasAtt = attachments.length > 0;
  const body = displayableMessageText(String(item.content ?? ''), hasAtt);
  const time = formatMessageTime(String(item.created_at ?? ''));
  const fromApi = inlineSenderName(item);
  const senderLine =
    !isMine && showGroupSender
      ? fromApi || resolvedSenderName || '…'
      : null;

  return (
    <Pressable
      onLongPress={onOpenActions}
      delayLongPress={380}
      style={[styles.msgRow, isMine && styles.msgRowMine]}
      accessibilityHint="Удерживайте: ответить, переслать или пожаловаться"
    >
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
        {replyMeta ? (
          <Pressable
            onPress={() => onNavigateToReply(replyMeta.messageId)}
            style={[styles.replyQuote, isMine ? styles.replyQuoteMine : styles.replyQuoteOther]}
            accessibilityRole="button"
            accessibilityLabel={`Перейти к сообщению: ${replyMeta.senderName}`}
          >
            <View style={[styles.replyQuoteAccent, isMine && styles.replyQuoteAccentMine]} />
            <View style={styles.replyQuoteBody}>
              <Text style={styles.replyQuoteName} numberOfLines={1}>
                {replyMeta.senderName}
              </Text>
              <Text style={styles.replyQuotePreview} numberOfLines={2}>
                {replyMeta.preview}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {senderLine ? <Text style={styles.senderName}>{senderLine}</Text> : null}
        {attachments.map((att, idx) => {
          const url = att.url ? resolveFileUrl(att.url) : '';
          if (!url) return null;
          if (isImageAttachment(att)) {
            return (
              <Pressable
                key={`${String(att.id ?? idx)}-img`}
                onPress={() => onOpenAttachment(att)}
                style={styles.imgWrap}
              >
                <Image
                  style={styles.attImage}
                  source={{ uri: url, headers: authHeaders }}
                  contentFit="cover"
                  transition={200}
                />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={`${String(att.id ?? idx)}-file`}
              onPress={() => onOpenAttachment(att)}
              style={styles.fileChip}
            >
              <Ionicons
                name="document-outline"
                size={18}
                color={colors.primary}
                style={styles.fileChipIcon}
              />
              <Text style={styles.fileChipText} numberOfLines={1}>
                {att.name || 'Файл'}
              </Text>
            </Pressable>
          );
        })}
        {body ? <MessageBody text={body} isMine={isMine} /> : null}
        {time ? (
          <Text style={[styles.time, isMine && styles.timeMine]}>{time}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ForwardChatPickerModal({
  visible,
  currentChatId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  currentChatId: string;
  onClose: () => void;
  onSelect: (targetChatId: string, title: string) => void;
}) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createChatRoomStyles(colors, radii), [colors, radii]);
  const insets = useSafeAreaInsets();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setLoading(true);
    fetchChats({ page_size: 100 })
      .then((res) => setChats(res.results ?? []))
      .catch(() => setChats([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const cur = normId(currentChatId).toLowerCase();
  const filtered = chats.filter((c) => {
    const id = normId(String(c._id ?? '')).toLowerCase();
    if (id === cur || id.replace(/^chat_/, '') === cur.replace(/^chat_/, '')) return false;
    if (!q.trim()) return true;
    const name = String(c.name ?? '').toLowerCase();
    return name.includes(q.trim().toLowerCase());
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.forwardRoot, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.forwardHeader}>
          <Text style={styles.forwardTitle}>Переслать в чат</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Закрыть">
            <Text style={styles.forwardClose}>Закрыть</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.forwardSearch}
          placeholder="Поиск…"
          placeholderTextColor={colors.muted}
          value={q}
          onChangeText={setQ}
        />
        {loading ? (
          <View style={styles.forwardCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filtered}
            keyExtractor={(c, i) => String(c._id ?? `fc-${i}`)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.forwardList}
            renderItem={({ item }) => (
              <Pressable
                style={styles.forwardRow}
                onPress={() => onSelect(String(item._id ?? ''), String(item.name ?? 'Чат'))}
              >
                <Text style={styles.forwardRowName} numberOfLines={2}>
                  {String(item.name ?? 'Чат')}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.muted} />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.forwardEmpty}>
                {q.trim() ? 'Ничего не найдено' : 'Нет других чатов для пересылки'}
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

function AttachmentPreviewModal({
  visible,
  attachment,
  authHeaders,
  onClose,
}: {
  visible: boolean;
  attachment: ChatAttachment | null;
  authHeaders: Record<string, string>;
  onClose: () => void;
}) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createChatRoomStyles(colors, radii), [colors, radii]);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) setBusy(false);
  }, [visible]);

  const url = attachment?.url ? resolveFileUrl(attachment.url) : '';
  const isImage = attachment ? isImageAttachment(attachment) : false;
  const title = attachment?.name || (isImage ? 'Изображение' : 'Файл');

  /** Нативное «Поделиться» поверх прозрачного Modal на Android ломает касания — сначала закрываем окно. */
  async function waitForModalDismissed() {
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    await new Promise<void>((r) => setTimeout(r, Platform.OS === 'android' ? 80 : 32));
  }

  async function onDownload() {
    if (!attachment) return;
    setBusy(true);
    try {
      const local = await downloadAttachmentToLocal(attachment);
      if (isImageAttachment(attachment)) {
        const perm = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        if (perm.granted) {
          await MediaLibrary.createAssetAsync(local);
          Alert.alert('Сохранено', 'Изображение добавлено в галерею');
          return;
        }
        Alert.alert(
          'Нет доступа к галерею',
          'Разрешите доступ в настройках или воспользуйтесь «Поделиться».'
        );
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        onClose();
        await waitForModalDismissed();
        await Sharing.shareAsync(local, {
          mimeType: attachment.type || undefined,
          dialogTitle: 'Сохранить файл',
        });
      } else {
        Alert.alert('Файл загружен', local);
      }
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      Alert.alert('Не удалось скачать', msg);
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (!attachment) return;
    setBusy(true);
    try {
      const local = await downloadAttachmentToLocal(attachment);
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Недоступно', 'На этом устройстве нет окна «Поделиться».');
        return;
      }
      onClose();
      await waitForModalDismissed();
      await Sharing.shareAsync(local, {
        mimeType: attachment.type || undefined,
        dialogTitle: 'Поделиться',
      });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      Alert.alert('Не удалось поделиться', msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      hardwareAccelerated
    >
      <View style={styles.modalRoot} collapsable={false}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} accessibilityLabel="Закрыть" />
        <View
          style={[styles.modalCenter, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}
          pointerEvents="box-none"
        >
          <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={2}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.modalCloseBtn}>
              <Ionicons name="close" size={28} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            {attachment && url ? (
              isImage ? (
                <Image
                  style={styles.modalImage}
                  source={{ uri: url, headers: authHeaders }}
                  contentFit="contain"
                  transition={200}
                />
              ) : (
                <View style={styles.modalFilePreview}>
                  <Ionicons name="document-text-outline" size={72} color={colors.primary} />
                  <Text style={styles.modalFileName} numberOfLines={3}>
                    {attachment.name || 'Вложение'}
                  </Text>
                  {attachment.type ? (
                    <Text style={styles.modalMime}>{attachment.type}</Text>
                  ) : null}
                </View>
              )
            ) : null}
          </View>

          <View style={styles.modalActions}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary, busy && styles.modalBtnDisabled]}
              onPress={onDownload}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={22} color={colors.onPrimary} />
                  <Text style={styles.modalBtnPrimaryText}>Скачать</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnSecondary, busy && styles.modalBtnDisabled]}
              onPress={onShare}
              disabled={busy}
            >
              <Ionicons name="share-outline" size={22} color={colors.primary} />
              <Text style={styles.modalBtnSecondaryText}>Поделиться</Text>
            </Pressable>
          </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ChatRoomScreen({ route, navigation }: Props) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createChatRoomStyles(colors, radii), [colors, radii]);
  const { chatId } = route.params;
  const { user } = useAuth();
  const senderId = String(user?.user_id ?? user?._uid ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [previewAtt, setPreviewAtt] = useState<ChatAttachment | null>(null);
  const [authHeaders, setAuthHeaders] = useState<Record<string, string>>({});
  const [chatType, setChatType] = useState<string | null>(null);
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [initialLoad, setInitialLoad] = useState(true);
  const [initialPositioned, setInitialPositioned] = useState(false);
  /** Ответ на сообщение (как в Telegram) */
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [forwardModalVisible, setForwardModalVisible] = useState(false);
  const [forwardTarget, setForwardTarget] = useState<ChatMessage | null>(null);
  const [attachMenuVisible, setAttachMenuVisible] = useState(false);
  const senderFetchDone = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const autoStickToBottom = useRef(false);
  const scrollAfterLatestRef = useRef(false);
  const autoStickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadPrefetched = useRef(false);
  /** Актуальный список для снятия фокуса: в cleanup нет свежего state. */
  const messagesRef = useRef<ChatMessage[]>([]);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  /** Android: KAV с padding часто не поднимает инпут; отступ по высоте клавиатуры. iOS — через KAV ниже. */
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);

  const showGroupSender = chatType === 'group' || chatType === 'task';

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onShow = (e: KeyboardEvent) => setKeyboardBottomInset(e.endCoordinates.height);
    const onHide = () => setKeyboardBottomInset(0);
    const subShow = Keyboard.addListener('keyboardDidShow', onShow);
    const subHide = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    getAccessToken().then((t) => {
      if (t) setAuthHeaders({ Authorization: `Bearer ${t}` });
    });
  }, []);

  const load = useCallback(async () => {
    const res = await fetchMessages(chatId, { page_size: 50, ordering: '-created_at' });
    const raw = sortMessagesAsc(res.results ?? []);
    setMessages(raw);
    const lastAt = raw.length ? messageTimeMs(raw[raw.length - 1]) : 0;
    if (lastAt > 0) markChatLocallyRead(chatId, lastAt);
    setNextCursor(cursorFromUrl(res.next ?? null));
  }, [chatId]);

  const refreshLatestMessages = useCallback(async () => {
    try {
      const res = await fetchMessages(chatId, { page_size: 50, ordering: '-created_at' });
      const latest = res.results ?? [];
      setMessages((prev) => {
        const prevLast = prev.length ? messageTimeMs(prev[prev.length - 1]) : 0;
        const next = mergeLatestMessagePage(prev, latest);
        const nextLast = next.length ? messageTimeMs(next[next.length - 1]) : 0;
        scrollAfterLatestRef.current = nextLast > prevLast && autoStickToBottom.current;
        return next;
      });
      requestAnimationFrame(() => {
        if (scrollAfterLatestRef.current) {
          scrollAfterLatestRef.current = false;
          listRef.current?.scrollToEnd({ animated: true });
        }
      });
      const tailAsc = sortMessagesAsc(latest);
      const last = tailAsc[tailAsc.length - 1];
      if (last && messageTimeMs(last) > 0) {
        markChatLocallyRead(chatId, messageTimeMs(last));
      }
    } catch {
      /* следующий тик / фокус */
    }
  }, [chatId]);

  useEffect(() => {
    setInitialLoad(true);
    setInitialPositioned(false);
    setMessages([]);
    setNextCursor(null);
    setReplyDraft(null);
    setForwardModalVisible(false);
    setForwardTarget(null);
    autoStickToBottom.current = true;
    if (autoStickTimer.current) clearTimeout(autoStickTimer.current);
    autoStickTimer.current = setTimeout(() => {
      autoStickToBottom.current = false;
    }, 2200);
  }, [chatId]);

  useEffect(() => {
    const prefetched = consumePrefetchedChatRoom(chatId);
    hadPrefetched.current = !!prefetched;
    if (!prefetched) return;
    setMessages(prefetched.messages);
    setNextCursor(prefetched.nextCursor);
    if (prefetched.chatType) setChatType(prefetched.chatType);
    const last = prefetched.messages[prefetched.messages.length - 1];
    const lastAt = last ? messageTimeMs(last) : 0;
    if (lastAt > 0) markChatLocallyRead(chatId, lastAt);
    setInitialLoad(false);
  }, [chatId]);

  useEffect(() => {
    return () => {
      if (autoStickTimer.current) clearTimeout(autoStickTimer.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hadPrefetched.current) {
        await new Promise((r) => setTimeout(r, 120));
      }
      try {
        await load();
      } catch {
        /* пустой список при ошибке */
      } finally {
        if (!cancelled) setInitialLoad(false);
      }
    })();
    markChatRead(chatId).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [chatId, load]);

  useEffect(() => {
    if (initialLoad) return;
    const id = setInterval(() => {
      void refreshLatestMessages();
    }, CHAT_POLL_MS);
    return () => clearInterval(id);
  }, [initialLoad, chatId, refreshLatestMessages]);

  useEffect(() => {
    if (initialLoad) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshLatestMessages();
    });
    return () => sub.remove();
  }, [initialLoad, chatId, refreshLatestMessages]);

  useFocusEffect(
    useCallback(() => {
      if (initialLoad) return;
      void refreshLatestMessages();
    }, [initialLoad, refreshLatestMessages])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        let maxT = 0;
        for (const m of messagesRef.current) {
          const t = messageTimeMs(m);
          if (t > maxT) maxT = t;
        }
        const now = Date.now();
        markChatLocallyRead(chatId, maxT > 0 ? Math.max(maxT, now) : now);
        markChatRead(chatId).catch(() => {});
      };
    }, [chatId])
  );

  useEffect(() => {
    senderFetchDone.current.clear();
    setSenderNames({});
    fetchChat(chatId)
      .then((c) =>
        setChatType(
          String((c as Record<string, unknown>).type ?? '')
            .toLowerCase()
            .trim() || null
        )
      )
      .catch(() => setChatType(null));
  }, [chatId]);

  useEffect(() => {
    if (!showGroupSender) return;
    const my = comparableUserId(senderId);
    for (const m of messages) {
      const raw = normId(String(m.sender_id ?? ''));
      if (!raw || comparableUserId(raw) === my) continue;
      if (inlineSenderName(m)) continue;
      if (senderFetchDone.current.has(raw)) continue;
      senderFetchDone.current.add(raw);
      fetchUser(raw)
        .then((u) => {
          const name =
            String(u.full_name ?? u.email ?? '').trim() || shortSenderId(raw);
          setSenderNames((prev) => ({ ...prev, [raw]: name }));
        })
        .catch(() => {
          setSenderNames((prev) => ({ ...prev, [raw]: shortSenderId(raw) }));
        });
    }
  }, [messages, senderId, showGroupSender]);

  useEffect(() => {
    if (initialLoad) return;
    if (messages.length === 0) setInitialPositioned(true);
  }, [initialLoad, messages.length]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderRow>
          <HeaderLink
            label="Настройки"
            onPress={() =>
              navigation.navigate('ChatManage', {
                chatId,
                title: route.params.title,
              })
            }
          />
        </HeaderRow>
      ),
    });
  }, [navigation, chatId, route.params.title]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await fetchMessages(chatId, {
        cursor: nextCursor,
        page_size: 50,
        ordering: '-created_at',
      });
      const older = res.results ?? [];
      setMessages((prev) => sortMessagesAsc([...older, ...prev]));
      setNextCursor(cursorFromUrl(res.next ?? null));
    } finally {
      setLoadingOlder(false);
    }
  }

  function closeAttachMenu() {
    setAttachMenuVisible(false);
  }

  /** Alert на Android даёт максимум 3 кнопки — «Файл» пропадал. Своё меню — все варианты на любой ОС. */
  function openAttachMenu() {
    setAttachMenuVisible(true);
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к фото в настройках устройства.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPending({
      uri: a.uri,
      name: a.fileName || 'photo.jpg',
      mime: a.mimeType || 'image/jpeg',
    });
  }

  async function pickFile() {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPending({
      uri: a.uri,
      name: a.name || 'файл',
      mime: a.mimeType || 'application/octet-stream',
    });
  }

  /**
   * Отправка сообщения. `attachmentOverride` — снимок с камеры без записи в pending.
   */
  async function submitOutgoingMessage(attachmentOverride?: PendingAttachment) {
    const att = attachmentOverride ?? pending;
    if (!text.trim() && !att) return;
    if (!senderId) {
      Alert.alert('Профиль', 'В профиле нет идентификатора пользователя (user_id).');
      return;
    }
    setSending(true);
    try {
      const attachmentIds: string[] = [];
      if (att) {
        const up = await uploadFile(att.uri, att.name, att.mime);
        attachmentIds.push(up.id);
      }
      const isImgAtt = att?.mime.startsWith('image/');
      const body: Record<string, unknown> = {
        sender_id: senderId,
        content:
          text.trim() ||
          (attachmentIds.length ? (isImgAtt ? 'Фото' : 'Файл') : '.'),
      };
      if (attachmentIds.length) body.attachments = attachmentIds;
      if (replyDraft) {
        body.reply_to = replyDraft.messageId;
      }

      await sendMessage(chatId, body);
      setText('');
      setPending(null);
      setReplyDraft(null);
      await load();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      Alert.alert('Ошибка', msg);
    } finally {
      setSending(false);
    }
  }

  async function takePhoto() {
    if (sending) return;
    if (!senderId) {
      Alert.alert('Профиль', 'В профиле нет идентификатора пользователя (user_id).');
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках устройства.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await submitOutgoingMessage({
        uri: a.uri,
        name: a.fileName || 'photo.jpg',
        mime: a.mimeType || 'image/jpeg',
      });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      Alert.alert('Камера', msg);
    }
  }

  const scrollToMessageById = useCallback(
    (rawId: string) => {
      const target = normId(rawId).toLowerCase();
      const idx = messages.findIndex((m) => {
        const id = normId(getMessageId(m)).toLowerCase();
        return (
          id === target ||
          id.replace(/^msg_/, '') === target.replace(/^msg_/, '') ||
          id.endsWith(target) ||
          target.endsWith(id)
        );
      });
      if (idx < 0) {
        Alert.alert(
          'Сообщение не найдено',
          'Оно может быть выше загруженной истории — нажмите «Ранние сообщения» и попробуйте снова.'
        );
        return;
      }
      try {
        listRef.current?.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.35,
        });
      } catch {
        Alert.alert('Не удалось прокрутить', 'Попробуйте пролистать вручную.');
      }
    },
    [messages]
  );

  async function submitMessageReport(messageId: string) {
    try {
      await apiFetch(
        `/api/chats/${chatPathId(chatId)}/messages/${encodeURIComponent(messageId)}/report/`,
        {
          method: 'POST',
          body: JSON.stringify({ message_id: messageId }),
        }
      );
    } catch {
      /* эндпоинт может быть не развёрнут на бэкенде */
    }
    Alert.alert('Спасибо', 'Ваша жалоба принята к рассмотрению.');
  }

  const openMessageActions = useCallback(
    (item: ChatMessage) => {
      const runReply = () => {
        const d = buildReplyDraftFromMessage(item, senderNames);
        if (d) setReplyDraft(d);
      };
      const runForward = () => {
        setForwardTarget(item);
        setForwardModalVisible(true);
      };
      const runReport = () => {
        const mid = getMessageId(item);
        if (!mid) return;
        Alert.alert(
          'Пожаловаться',
          'Отправить жалобу на это сообщение? Его увидят модераторы.',
          [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Пожаловаться',
              style: 'destructive',
              onPress: () => {
                void submitMessageReport(mid);
              },
            },
          ]
        );
      };

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: 'Сообщение',
            options: ['Отмена', 'Ответить', 'Переслать', 'Пожаловаться'],
            cancelButtonIndex: 0,
            destructiveButtonIndex: 3,
          },
          (buttonIndex) => {
            if (buttonIndex === 1) runReply();
            else if (buttonIndex === 2) runForward();
            else if (buttonIndex === 3) runReport();
          }
        );
      } else {
        Alert.alert('Сообщение', 'Выберите действие', [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Ответить', onPress: runReply },
          { text: 'Переслать', onPress: runForward },
          { text: 'Пожаловаться', style: 'destructive', onPress: runReport },
        ]);
      }
    },
    [senderNames, chatId]
  );

  function closeForwardModal() {
    setForwardModalVisible(false);
    setForwardTarget(null);
  }

  async function onForwardPickChat(targetChatId: string, targetTitle: string) {
    const src = forwardTarget;
    if (!src || !senderId) {
      closeForwardModal();
      return;
    }
    setForwardModalVisible(false);
    setSending(true);
    try {
      const fromTitle = route.params.title ?? 'Чат';
      const { content } = buildForwardContent(src, senderNames, fromTitle);
      const body: Record<string, unknown> = { sender_id: senderId, content };
      const ids = extractAttachmentIdsFromMessage(src);
      if (ids.length) body.attachments = ids;
      await sendMessage(targetChatId, body);
      setForwardTarget(null);
      Alert.alert('Готово', `Сообщение переслано в «${targetTitle}».`, [
        { text: 'ОК' },
        {
          text: 'Открыть чат',
          onPress: () =>
            navigation.navigate('ChatRoom', { chatId: targetChatId, title: targetTitle }),
        },
      ]);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
      Alert.alert('Не удалось переслать', msg);
      setForwardTarget(src);
      setForwardModalVisible(true);
    } finally {
      setSending(false);
    }
  }

  async function onSend() {
    await submitOutgoingMessage(undefined);
  }

  function onInputKeyPress(e: { nativeEvent: { key: string; shiftKey?: boolean } }) {
    if (e.nativeEvent.key !== 'Enter') return;
    if (e.nativeEvent.shiftKey) return;
    if (Platform.OS === 'web') onSend();
  }

  return (
    <View
      style={[
        styles.root,
        Platform.OS === 'android' && keyboardBottomInset > 0
          ? { paddingBottom: keyboardBottomInset }
          : null,
      ]}
    >
    <KeyboardAvoidingView
      style={styles.keyboardFlex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}
      keyboardVerticalOffset={headerHeight}
    >
      <AttachmentPreviewModal
        visible={previewAtt !== null}
        attachment={previewAtt}
        authHeaders={authHeaders}
        onClose={() => setPreviewAtt(null)}
      />
      <ForwardChatPickerModal
        visible={forwardModalVisible}
        currentChatId={chatId}
        onClose={closeForwardModal}
        onSelect={onForwardPickChat}
      />

      <Modal
        visible={attachMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAttachMenu}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeAttachMenu} accessibilityLabel="Закрыть" />
          <View style={styles.attachMenuWrap} pointerEvents="box-none">
            <View style={[styles.attachMenuCard, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
              <Text style={styles.attachMenuTitle}>Прикрепить</Text>
              <Text style={styles.attachMenuSubtitle}>Выберите тип вложения</Text>
              <Pressable
                style={styles.attachMenuRow}
                onPress={() => {
                  closeAttachMenu();
                  void takePhoto();
                }}
              >
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
                <Text style={styles.attachMenuRowText}>Сделать фото</Text>
              </Pressable>
              <Pressable
                style={styles.attachMenuRow}
                onPress={() => {
                  closeAttachMenu();
                  void pickImage();
                }}
              >
                <Ionicons name="images-outline" size={22} color={colors.primary} />
                <Text style={styles.attachMenuRowText}>Фото из галереи</Text>
              </Pressable>
              <Pressable
                style={styles.attachMenuRow}
                onPress={() => {
                  closeAttachMenu();
                  void pickFile();
                }}
              >
                <Ionicons name="document-outline" size={22} color={colors.primary} />
                <Text style={styles.attachMenuRowText}>Файл</Text>
              </Pressable>
              <Pressable style={styles.attachMenuCancel} onPress={closeAttachMenu}>
                <Text style={styles.attachMenuCancelText}>Отмена</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {!initialLoad && nextCursor ? (
        <Pressable style={styles.moreBar} onPress={loadOlder} disabled={loadingOlder}>
          <Text style={styles.moreTxt}>
            {loadingOlder ? 'Загрузка…' : 'Ранние сообщения'}
          </Text>
        </Pressable>
      ) : null}
      {initialLoad ? (
        <View style={styles.listLoader}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.listLoaderTxt}>Загрузка сообщений…</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          keyboardShouldPersistTaps="handled"
          data={messages}
          keyExtractor={(m, i) => {
            const id = String((m as Record<string, unknown>)._id ?? '').trim();
            return id || `msg-${chatId}-${i}`;
          }}
          contentContainerStyle={styles.list}
          style={!initialPositioned ? styles.hiddenList : undefined}
          onScrollBeginDrag={() => {
            autoStickToBottom.current = false;
          }}
          onContentSizeChange={() => {
            if (loadingOlder) return;
            if (autoStickToBottom.current) {
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
            }
            if (initialPositioned) return;
            requestAnimationFrame(() => {
              listRef.current?.scrollToEnd({ animated: false });
              setInitialPositioned(true);
            });
          }}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            const offset = Math.max(0, index * (averageItemLength || 80));
            listRef.current?.scrollToOffset({ offset, animated: true });
            setTimeout(() => {
              try {
                listRef.current?.scrollToIndex({
                  index,
                  animated: true,
                  viewPosition: 0.35,
                });
              } catch {
                /* ignore */
              }
            }, 120);
          }}
          renderItem={({ item }) => {
            const sid = normId(String(item.sender_id ?? ''));
            const replyMeta = extractReplyMeta(item, senderNames);
            return (
              <MessageBubble
                item={item}
                mySenderId={senderId}
                authHeaders={authHeaders}
                onOpenAttachment={setPreviewAtt}
                showGroupSender={showGroupSender}
                resolvedSenderName={senderNames[sid] ?? ''}
                replyMeta={replyMeta}
                onOpenActions={() => openMessageActions(item)}
                onNavigateToReply={scrollToMessageById}
              />
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>Нет сообщений</Text>}
        />
      )}
      {pending ? (
        <View style={styles.pendingBar}>
          {pending.mime.startsWith('image/') ? (
            <Image source={{ uri: pending.uri }} style={styles.pendingThumb} contentFit="cover" />
          ) : (
            <View style={styles.pendingFileIcon}>
              <Ionicons name="document-attach" size={22} color={colors.primary} />
            </View>
          )}
          <Text style={styles.pendingTxt} numberOfLines={2}>
            {pending.mime.startsWith('image/') ? 'Фото' : 'Файл'}: {pending.name}
          </Text>
          <Pressable onPress={() => setPending(null)} hitSlop={12}>
            <Ionicons name="close-circle" size={26} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      {replyDraft ? (
        <View style={styles.replyComposerBar}>
          <View style={styles.replyComposerAccent} />
          <Pressable
            style={styles.replyComposerBody}
            onPress={() => scrollToMessageById(replyDraft.messageId)}
            accessibilityRole="button"
            accessibilityLabel="Перейти к цитируемому сообщению"
          >
            <Text style={styles.replyComposerLabel}>Ответ на</Text>
            <Text style={styles.replyComposerName} numberOfLines={1}>
              {replyDraft.senderName}
            </Text>
            <Text style={styles.replyComposerPreview} numberOfLines={2}>
              {replyDraft.preview}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setReplyDraft(null)}
            hitSlop={10}
            accessibilityLabel="Отменить ответ"
            style={styles.replyComposerClose}
          >
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.footer, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <Pressable
          style={styles.attachBtn}
          onPress={openAttachMenu}
          disabled={sending}
          accessibilityLabel="Прикрепить файл или фото"
        >
          <Ionicons name="attach-outline" size={26} color={colors.primary} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={colors.muted}
          multiline
          returnKeyType="send"
          onSubmitEditing={onSend}
          blurOnSubmit={false}
          onKeyPress={onInputKeyPress}
          underlineColorAndroid="transparent"
          {...(Platform.OS === 'android' ? { textAlignVertical: 'center' } : {})}
        />
        <Pressable
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={onSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Ionicons name="send" size={20} color={colors.onPrimary} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </View>
  );
}

type ThemeRadii = (typeof import('../../theme'))['radii'];

function createChatRoomStyles(colors: ThemeColors, radii: ThemeRadii) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  keyboardFlex: { flex: 1 },
  listLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  listLoaderTxt: { marginTop: 12, fontSize: 15, color: colors.muted },
  hiddenList: { opacity: 0 },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  modalCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    overflow: 'hidden',
    maxHeight: WIN_H * 0.88,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    paddingRight: 8,
  },
  modalCloseBtn: { padding: 4 },
  modalBody: {
    minHeight: 160,
    maxHeight: WIN_H * 0.52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  modalImage: {
    width: '100%',
    height: WIN_H * 0.48,
    backgroundColor: colors.chip,
  },
  modalFilePreview: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  modalFileName: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  modalMime: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radii.md,
    marginHorizontal: 4,
  },
  modalBtnPrimary: {
    backgroundColor: colors.primary,
  },
  modalBtnSecondary: {
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnDisabled: { opacity: 0.65 },
  modalBtnPrimaryText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 16,
    marginLeft: 8,
  },
  modalBtnSecondaryText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 16,
    marginLeft: 8,
  },
  moreBar: {
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  moreTxt: { color: colors.primary, fontSize: 13 },
  list: { padding: 10, paddingBottom: 8 },
  msgRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 6,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  /** Мини-блок «ответ на…» внутри пузыря (как в Telegram) */
  replyQuote: {
    flexDirection: 'row',
    borderRadius: radii.sm,
    overflow: 'hidden',
    marginBottom: 8,
    maxWidth: '100%',
  },
  replyQuoteMine: {
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  replyQuoteOther: {
    backgroundColor: colors.chip,
  },
  replyQuoteAccent: {
    width: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  replyQuoteAccentMine: {
    backgroundColor: colors.link,
  },
  replyQuoteBody: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 0,
  },
  replyQuoteName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  replyQuotePreview: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.chatMine,
    borderColor: colors.chatMineBorder,
  },
  bubbleOther: {
    alignSelf: 'flex-start',
    backgroundColor: colors.chatOther,
    borderColor: colors.chatOtherBorder,
  },
  senderName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 6,
  },
  msgText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  msgLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  msgTextMine: {
    color: colors.text,
  },
  msgLinkMine: {
    color: colors.primary,
  },
  time: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeMine: {
    color: colors.muted,
  },
  imgWrap: {
    borderRadius: radii.sm,
    overflow: 'hidden',
    marginBottom: 6,
  },
  attImage: {
    width: 220,
    height: 160,
    backgroundColor: colors.chip,
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.chip,
    borderRadius: radii.sm,
    marginBottom: 6,
    maxWidth: 260,
  },
  fileChipText: {
    flex: 1,
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  pendingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.chip,
  },
  pendingThumb: { width: 44, height: 44, borderRadius: 6, marginRight: 10 },
  pendingFileIcon: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingTxt: { flex: 1, color: colors.muted, fontSize: 14 },
  fileChipIcon: { marginRight: 8 },
  replyComposerBar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgMuted,
  },
  replyComposerAccent: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginRight: 8,
    alignSelf: 'stretch',
  },
  replyComposerBody: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingRight: 4,
  },
  replyComposerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  replyComposerName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  replyComposerPreview: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  replyComposerClose: {
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 2,
  },
  /** Одна высота с полем ввода — без «плавающих» margin */
  attachBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    color: colors.text,
    paddingHorizontal: 10,
    ...Platform.select({
      ios: {
        paddingTop: 10,
        paddingBottom: 10,
      },
      android: {
        paddingVertical: 10,
        paddingHorizontal: 8,
      },
      default: {
        paddingVertical: 10,
      },
    }),
    fontSize: 17,
    lineHeight: 22,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.7 },
  forwardRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
  },
  forwardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  forwardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  forwardClose: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  forwardSearch: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: colors.text,
    marginBottom: 12,
  },
  forwardCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  forwardList: { paddingBottom: 24 },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  forwardRowName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    paddingRight: 8,
  },
  forwardEmpty: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 32,
    fontSize: 16,
  },
  attachMenuWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  attachMenuCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    paddingTop: 14,
  },
  attachMenuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 18,
  },
  attachMenuSubtitle: {
    fontSize: 14,
    color: colors.muted,
    paddingHorizontal: 18,
    marginTop: 4,
    marginBottom: 6,
  },
  attachMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  attachMenuRowText: {
    fontSize: 17,
    fontWeight: '500',
    color: colors.text,
  },
  attachMenuCancel: {
    paddingVertical: 16,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  attachMenuCancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.muted,
  },
  });
}
