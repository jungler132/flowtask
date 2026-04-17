import { chatPathId, type Chat } from '../api/chatsApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'flowtask.readChats.v1';
const locallyReadChats = new Map<string, number>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function chatIdOf(chat: Chat): string {
  return chatPathId(String(chat._id ?? ''));
}

function previewFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of ['content', 'text', 'message', 'body']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return '';
}

export function extractChatLastPreview(chat: Chat): string {
  for (const k of ['last_message', 'last_message_text', 'last_message_content', 'preview']) {
    const got = previewFromUnknown((chat as Record<string, unknown>)[k]);
    if (got) return got;
  }
  return '';
}

function toMs(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function extractChatLastMessageAt(chat: Chat): number {
  const o = chat as Record<string, unknown>;
  const candidates: unknown[] = [
    o.last_message_created_at,
    o.last_message_at,
    o.last_activity_at,
    o.updated_at,
  ];
  for (const c of candidates) {
    const ms = toMs(c);
    if (ms > 0) return ms;
  }
  const lm = o.last_message;
  if (lm && typeof lm === 'object') {
    const ms = toMs((lm as Record<string, unknown>).created_at);
    if (ms > 0) return ms;
  }
  return 0;
}

async function persist() {
  const data = Object.fromEntries(locallyReadChats.entries());
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function hydrateLocalReadChats() {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        const id = chatPathId(k);
        if (!id) continue;
        if (typeof v === 'number') {
          locallyReadChats.set(id, v);
          continue;
        }
        const parsedNum = Number(v);
        if (Number.isFinite(parsedNum) && parsedNum > 0) locallyReadChats.set(id, parsedNum);
      }
    } catch {
      /* ignore damaged cache */
    } finally {
      hydrated = true;
      hydratePromise = null;
    }
  })();
  return hydratePromise;
}

export function markChatLocallyRead(chatId: string, readAtMs?: number) {
  const id = chatPathId(chatId);
  if (!id) return;
  locallyReadChats.set(id, readAtMs && readAtMs > 0 ? readAtMs : Date.now());
  hydrateLocalReadChats()
    .then(() => persist())
    .catch(() => {});
}

export function applyLocalReadToChat(chat: Chat): Chat {
  const id = chatIdOf(chat);
  if (!id) return chat;
  if (!locallyReadChats.has(id)) return chat;
  const readAt = locallyReadChats.get(id) ?? 0;
  const lastAt = extractChatLastMessageAt(chat);
  if (lastAt > readAt) return chat;
  return { ...chat, unread_count: 0 };
}

export function applyLocalReadToChats(chats: Chat[]): Chat[] {
  return chats.map((c) => applyLocalReadToChat(c));
}
