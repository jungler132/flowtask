import { API_BASE } from '../config';
import { apiFetch } from './client';

export type Chat = Record<string, unknown>;
export type ChatMessage = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * В path `/api/chats/{id}/…` OpenAPI указывает format: uuid.
 * В ответах списка `_id` часто приходит как `chat_<uuid>` — без нормализации даёт 404.
 */
export function chatPathId(raw: string): string {
  const s = String(raw ?? '').trim();
  if (!s) return s;
  if (s.toLowerCase().startsWith('chat_')) {
    const rest = s.slice(5);
    if (UUID_RE.test(rest)) return rest;
  }
  return s;
}

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function cursorFromUrl(next: string | null | undefined): string | null {
  if (!next) return null;
  try {
    const base = next.startsWith('http') ? undefined : API_BASE;
    const u = new URL(next, base);
    return u.searchParams.get('cursor');
  } catch {
    return null;
  }
}

export async function fetchChats(params: {
  cursor?: string;
  page_size?: number;
  search?: string;
  ordering?: string;
} = {}) {
  return apiFetch<{
    next?: string | null;
    previous?: string | null;
    results?: Chat[];
  }>(`/api/chats/${qs(params as Record<string, unknown>)}`);
}

export async function fetchChat(id: string) {
  const cid = chatPathId(id);
  return apiFetch<Chat>(`/api/chats/${cid}/`);
}

export async function createChat(body: Record<string, unknown>) {
  return apiFetch<Chat>('/api/chats/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function patchChat(id: string, body: Record<string, unknown>) {
  const cid = chatPathId(id);
  return apiFetch<Chat>(`/api/chats/${cid}/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function putChat(id: string, body: Record<string, unknown>) {
  const cid = chatPathId(id);
  return apiFetch<Chat>(`/api/chats/${cid}/`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteChat(id: string) {
  const cid = chatPathId(id);
  await apiFetch(`/api/chats/${cid}/`, { method: 'DELETE' });
}

export async function searchChats(q: string) {
  if (!q.trim()) return [] as Chat[];
  const data = await apiFetch<unknown>(`/api/chats/search/${qs({ q })}`);
  if (Array.isArray(data)) return data as Chat[];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.results)) return o.results as Chat[];
  if (data && typeof data === 'object' && '_id' in (data as object)) return [data as Chat];
  return [];
}

export async function fetchChatByTask(taskId: string | number) {
  return apiFetch<Chat>(`/api/chats/by-task/${taskId}/`);
}

export async function createTaskChat(taskId: string | number) {
  return apiFetch('/api/chats/task/', {
    method: 'POST',
    body: JSON.stringify({ task_id: String(taskId) }),
  });
}

/** Достаёт _id чата из ответа POST /api/chats/task/ (с учётом обёрток success/data). */
export function extractChatIdFromCreateResponse(res: unknown): string {
  if (res == null || typeof res !== 'object') return '';
  const o = res as Record<string, unknown>;
  const top = String(o._id ?? '').trim();
  if (top) return top;
  const data = o.data;
  if (data && typeof data === 'object') {
    const id = String((data as Record<string, unknown>)._id ?? '').trim();
    if (id) return id;
  }
  return '';
}

/**
 * Некоторые эндпоинты ждут PK (24), другие — task_24. Отдаём оба варианта по очереди при необходимости.
 */
export function normalizeTaskIdForChatApi(raw: string): { primary: string; fallback?: string } {
  const s = String(raw ?? '').trim();
  if (!s) return { primary: s };
  const lower = s.toLowerCase();
  if (lower.startsWith('task_')) {
    const rest = s.slice(5);
    if (/^\d+$/.test(rest)) return { primary: s, fallback: rest };
  }
  if (/^\d+$/.test(s)) return { primary: s, fallback: `task_${s}` };
  return { primary: s };
}

export async function addParticipants(chatId: string, body: Record<string, unknown>) {
  const cid = chatPathId(chatId);
  return apiFetch<Chat>(`/api/chats/${cid}/participants/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function removeParticipant(chatId: string, userId: string) {
  const cid = chatPathId(chatId);
  await apiFetch(`/api/chats/${cid}/participants/${userId}/`, {
    method: 'DELETE',
  });
}

export async function fetchMessages(
  chatId: string,
  params: { cursor?: string; page_size?: number; search?: string; ordering?: string } = {}
) {
  const cid = chatPathId(chatId);
  return apiFetch<{
    next?: string | null;
    previous?: string | null;
    results?: ChatMessage[];
  }>(`/api/chats/${cid}/messages/${qs(params as Record<string, unknown>)}`);
}

export async function sendMessage(chatId: string, body: Record<string, unknown>) {
  const cid = chatPathId(chatId);
  return apiFetch(`/api/chats/${cid}/messages/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function markChatRead(chatId: string) {
  const cid = chatPathId(chatId);
  return apiFetch(`/api/chats/${cid}/messages/mark-read/`, {
    method: 'POST',
    body: JSON.stringify({ content: '.' }),
  });
}
