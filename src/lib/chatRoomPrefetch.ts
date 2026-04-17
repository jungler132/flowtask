import { cursorFromUrl, fetchChat, fetchMessages, type ChatMessage } from '../api/chatsApi';

type PrefetchedChatRoomData = {
  messages: ChatMessage[];
  nextCursor: string | null;
  chatType: string | null;
  at: number;
};

const cache = new Map<string, PrefetchedChatRoomData>();
const TTL_MS = 20_000;

function msgTs(m: ChatMessage): number {
  const t = new Date(String((m as Record<string, unknown>).created_at ?? '')).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortAsc(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => msgTs(a) - msgTs(b));
}

export async function prefetchChatRoom(chatId: string) {
  const [messagesRes, chatRes] = await Promise.all([
    fetchMessages(chatId, { page_size: 50, ordering: '-created_at' }),
    fetchChat(chatId).catch(() => null),
  ]);
  const typeRaw = String((chatRes as Record<string, unknown> | null)?.type ?? '')
    .toLowerCase()
    .trim();
  cache.set(chatId, {
    messages: sortAsc(messagesRes.results ?? []),
    nextCursor: cursorFromUrl(messagesRes.next ?? null),
    chatType: typeRaw || null,
    at: Date.now(),
  });
}

export function consumePrefetchedChatRoom(chatId: string): PrefetchedChatRoomData | null {
  const got = cache.get(chatId);
  if (!got) return null;
  cache.delete(chatId);
  if (Date.now() - got.at > TTL_MS) return null;
  return got;
}
