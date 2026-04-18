import { API_BASE } from '../config';

export type ChatAttachment = {
  id?: string;
  url?: string;
  name?: string;
  type?: string;
};

export function parseAttachments(raw: unknown): ChatAttachment[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t || t === '[]' || t === 'null') return [];
    try {
      const j = JSON.parse(t) as unknown;
      if (Array.isArray(j)) return j as ChatAttachment[];
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    if (raw.length > 0 && typeof raw[0] === 'string') {
      return (raw as string[])
        .map((s) => String(s).trim())
        .filter(Boolean)
        .map((id) => ({ id } as ChatAttachment));
    }
    return raw as ChatAttachment[];
  }
  return [];
}

export function resolveFileUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('//')) return `https:${u}`;
  const base = API_BASE.replace(/\/$/, '');
  const path = u.startsWith('/') ? u : `/${u}`;
  return `${base}${path}`;
}

export function isImageAttachment(a: ChatAttachment): boolean {
  const t = (a.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  const n = `${a.name || ''}${a.url || ''}`.toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|heic|bmp)(\?|$)/i.test(n);
}

export function formatMessageTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return t;
  return (
    d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' + t
  );
}

export function shortSenderId(id: string): string {
  const s = String(id).trim();
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…`;
}

/** Текст не показываем, если это заглушка под вложение (фото или файл). */
export function displayableMessageText(
  content: string,
  hasAttachments: boolean
): string | null {
  const t = (content || '').trim();
  if (!t) return null;
  if (hasAttachments) {
    const placeholders = new Set([
      'фото',
      'photo',
      '.',
      '📷',
      'image',
      'картинка',
      'файл',
      'file',
      'вложение',
    ]);
    if (placeholders.has(t.toLowerCase())) return null;
  }
  return t;
}
