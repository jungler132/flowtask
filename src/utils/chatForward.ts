import type { ChatMessage } from '../api/chatsApi';
import {
  displayableMessageText,
  isImageAttachment,
  parseAttachments,
  shortSenderId,
} from './chatAttachments';

function inlineSenderName(item: ChatMessage): string | null {
  const o = item as Record<string, unknown>;
  for (const k of ['sender_full_name', 'sender_name', 'sender_display_name']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

export function extractAttachmentIdsFromMessage(message: ChatMessage): string[] {
  const raw = (message as Record<string, unknown>).attachments;

  if (Array.isArray(raw)) {
    const ids: string[] = [];
    for (const x of raw) {
      if (typeof x === 'string') {
        const s = x.trim();
        if (s) ids.push(s);
      } else if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        const id = String(o.id ?? o._id ?? o.file_id ?? o.attachment_id ?? '').trim();
        if (id) ids.push(id);
      }
    }
    if (ids.length) return ids;
  }

  const atts = parseAttachments(raw);
  const ids: string[] = [];
  for (const a of atts) {
    const o = a as Record<string, unknown>;
    const id = String(a.id ?? o._id ?? o.file_id ?? o.attachment_id ?? '').trim();
    if (id) ids.push(id);
  }
  return ids;
}

/** Разбор текста после `buildForwardContent` — отдельная полоска + подпись в пузыре. */
export function parseForwardedMessageContent(raw: string): { headerLine: string; caption: string } | null {
  const s = String(raw ?? '');
  const t = s.trimStart();
  if (!t.startsWith('↪')) return null;
  const nl = s.indexOf('\n');
  if (nl < 0) return { headerLine: s.trim(), caption: '' };
  return { headerLine: s.slice(0, nl).trim(), caption: s.slice(nl + 1).trim() };
}

/**
 * Короткий текст пересылки: первая строка — кто / из какого чата, вторая — текст или «фото».
 * Вложения передаются теми же id в теле запроса (`attachments`), без дублирования в тексте.
 */
export function buildForwardContent(
  message: ChatMessage,
  senderNames: Record<string, string>,
  fromChatTitle: string
): { content: string; hasAttachments: boolean } {
  const o = message as Record<string, unknown>;
  const sid = String(o.sender_id ?? '').trim();
  const name =
    inlineSenderName(message) ||
    (sid && senderNames[sid]) ||
    (sid ? shortSenderId(sid) : 'Участник');
  const attachments = parseAttachments(o.attachments);
  const hasAtt = attachments.length > 0;
  const hasImage = attachments.some(isImageAttachment);
  const text = displayableMessageText(String(o.content ?? ''), hasAtt) || '';
  const safeTitle = fromChatTitle.trim() || 'Чат';
  const header = `↪ ${name} · «${safeTitle}»`;
  let caption = text.trim();
  if (!caption) {
    if (hasImage) caption = '📷 фото';
    else if (hasAtt) caption = '📎 файл';
    else caption = '…';
  }
  const content = `${header}\n${caption}`;
  return { content, hasAttachments: hasAtt };
}
