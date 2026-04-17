import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '../../api/client';
import {
  ChatMessage,
  cursorFromUrl,
  fetchChat,
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
import { colors, radii } from '../../theme';
import {
  ChatAttachment,
  displayableMessageText,
  formatMessageTime,
  isImageAttachment,
  parseAttachments,
  resolveFileUrl,
  shortSenderId,
} from '../../utils/chatAttachments';
import { useAuth } from '../../context/AuthContext';

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

function MessageBody({ text, isMine }: { text: string; isMine: boolean }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/gi).filter(Boolean);
  return (
    <Text style={[styles.msgText, isMine && styles.msgTextMine]} selectable>
      {parts.map((part, idx) => {
        const isLink = /^https?:\/\//i.test(part);
        if (!isLink) {
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
            onPress={() => Linking.openURL(part).catch(() => {})}
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
}: {
  item: ChatMessage;
  mySenderId: string;
  authHeaders: Record<string, string>;
  onOpenAttachment: (att: ChatAttachment) => void;
  /** Показывать имя отправителя (группа / чат по задаче). */
  showGroupSender: boolean;
  /** Имя с API пользователей; пустая строка = ещё грузим. */
  resolvedSenderName: string;
}) {
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
    <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
      <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
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
    </View>
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
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) setBusy(false);
  }, [visible]);

  const url = attachment?.url ? resolveFileUrl(attachment.url) : '';
  const isImage = attachment ? isImageAttachment(attachment) : false;
  const title = attachment?.name || (isImage ? 'Изображение' : 'Файл');

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
    >
      <View style={styles.modalRoot}>
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
  const senderFetchDone = useRef<Set<string>>(new Set());
  const listRef = useRef<FlatList>(null);
  const autoStickToBottom = useRef(false);
  const autoStickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadPrefetched = useRef(false);
  const insets = useSafeAreaInsets();

  const showGroupSender = chatType === 'group' || chatType === 'task';

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

  useEffect(() => {
    setInitialLoad(true);
    setInitialPositioned(false);
    setMessages([]);
    setNextCursor(null);
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

  function openAttachMenu() {
    Alert.alert('Прикрепить', 'Выберите тип вложения', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Фото', onPress: () => pickImage() },
      { text: 'Файл', onPress: () => pickFile() },
    ]);
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

  async function onSend() {
    if (!text.trim() && !pending) return;
    if (!senderId) {
      Alert.alert('Профиль', 'В профиле нет идентификатора пользователя (user_id).');
      return;
    }
    setSending(true);
    try {
      const attachmentIds: string[] = [];
      if (pending) {
        const up = await uploadFile(pending.uri, pending.name, pending.mime);
        attachmentIds.push(up.id);
      }
      const isImgPending = pending?.mime.startsWith('image/');
      const body: Record<string, unknown> = {
        sender_id: senderId,
        content:
          text.trim() ||
          (attachmentIds.length ? (isImgPending ? 'Фото' : 'Файл') : '.'),
      };
      if (attachmentIds.length) body.attachments = attachmentIds;

      await sendMessage(chatId, body);
      setText('');
      setPending(null);
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

  function onInputKeyPress(e: { nativeEvent: { key: string; shiftKey?: boolean } }) {
    if (e.nativeEvent.key !== 'Enter') return;
    if (e.nativeEvent.shiftKey) return;
    if (Platform.OS === 'web') onSend();
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior="padding"
      keyboardVerticalOffset={Platform.select({ ios: 86, android: 0, default: 0 })}
    >
      <AttachmentPreviewModal
        visible={previewAtt !== null}
        attachment={previewAtt}
        authHeaders={authHeaders}
        onClose={() => setPreviewAtt(null)}
      />

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
          renderItem={({ item }) => {
            const sid = normId(String(item.sender_id ?? ''));
            return (
              <MessageBubble
                item={item}
                mySenderId={senderId}
                authHeaders={authHeaders}
                onOpenAttachment={setPreviewAtt}
                showGroupSender={showGroupSender}
                resolvedSenderName={senderNames[sid] ?? ''}
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
      <View style={[styles.footer, { paddingBottom: 8 + insets.bottom }]}>
        <Pressable
          style={styles.attachBtn}
          onPress={openAttachMenu}
          disabled={sending}
          accessibilityLabel="Прикрепить файл или фото"
        >
          <Ionicons name="attach-outline" size={28} color={colors.primary} />
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
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
    color: '#1d4ed8',
  },
  time: {
    fontSize: 10,
    color: colors.muted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeMine: {
    color: colors.primary,
    opacity: 0.85,
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
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  attachBtn: {
    padding: 8,
    marginBottom: 2,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 16,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginBottom: 2,
  },
  sendBtnDisabled: { opacity: 0.7 },
});
