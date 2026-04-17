import { chatPathId, type Chat } from '../api/chatsApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'flowtask.readChats.v1';
const locallyReadChats = new Map<string, number>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

/** Допуск между last_message_at и created_at / разными полями ответа. */
const READ_AT_FIELD_SLOP_MS = 15000;

function mergeReadAtIntoMap(id: string, value: number) {
  if (!id || !Number.isFinite(value) || value <= 0) return;
  const prev = locallyReadChats.get(id) ?? 0;
  locallyReadChats.set(id, Math.max(prev, value));
}

/** Лучшая локальная отметка прочтения по объекту чата (несколько форматов _id). */
function localReadWatermark(chat: Chat): number | null {
  const raw = String(chat._id ?? '').trim();
  if (!raw) return null;
  const keys = new Set<string>([raw, chatPathId(raw)]);
  let best = 0;
  let any = false;
  for (const k of keys) {
    if (!k || !locallyReadChats.has(k)) continue;
    any = true;
    best = Math.max(best, locallyReadChats.get(k) ?? 0);
  }
  return any ? best : null;
}

/**
 * API в схеме отдаёт unread_count как string; в JSON может быть number.
 */
export function unreadCountNumber(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  const s = String(raw ?? '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
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

/**
 * Время «последнего сообщения» для сравнения с локальной отметкой прочтения.
 * Не используем updated_at / last_activity_at — они часто новее времени сообщения,
 * из‑за чего lastAt > readAt и в списке снова показывается завышенный unread_count с API.
 */
export function extractChatLastMessageAt(chat: Chat): number {
  const o = chat as Record<string, unknown>;
  const candidates: unknown[] = [o.last_message_created_at, o.last_message_at];
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
  const collapsed: Record<string, number> = {};
  for (const [k, v] of locallyReadChats.entries()) {
    const c = chatPathId(k) || k;
    if (!c || !Number.isFinite(v) || v <= 0) continue;
    collapsed[c] = Math.max(collapsed[c] ?? 0, v);
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(collapsed));
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
        const parsedNum = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(parsedNum) || parsedNum <= 0) continue;
        mergeReadAtIntoMap(id, parsedNum);
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
  const trimmed = String(chatId ?? '').trim();
  if (!trimmed) return;
  const proposed = readAtMs && readAtMs > 0 ? readAtMs : Date.now();
  const keys = new Set<string>([trimmed, chatPathId(trimmed)]);
  for (const key of keys) {
    if (!key) continue;
    mergeReadAtIntoMap(key, proposed);
  }
  const runPersist = () => persist().catch(() => {});
  if (hydrated) runPersist();
  else void hydrateLocalReadChats().then(runPersist);
}

export function applyLocalReadToChat(chat: Chat): Chat {
  const readAt = localReadWatermark(chat);
  if (readAt == null) return chat;
  const lastAt = extractChatLastMessageAt(chat);
  // Уже заходили в чат: без времени последнего сообщения в объекте не показываем «хвост» с API.
  if (lastAt <= 0) {
    return { ...chat, unread_count: 0 };
  }
  if (lastAt <= readAt + READ_AT_FIELD_SLOP_MS) {
    return { ...chat, unread_count: 0 };
  }
  return chat;
}

export function applyLocalReadToChats(chats: Chat[]): Chat[] {
  return chats.map((c) => applyLocalReadToChat(c));
}
