import type { ChatMessage } from '../api/chatsApi';
import {
  displayableMessageText,
  parseAttachments,
  shortSenderId,
} from './chatAttachments';

export type ReplyDraft = {
  messageId: string;
  senderName: string;
  preview: string;
};

export function getMessageId(m: ChatMessage): string {
  return String((m as Record<string, unknown>)._id ?? '').trim();
}

function previewFromMessageLike(o: Record<string, unknown>): string {
  const hasAtt = parseAttachments(o.attachments).length > 0;
  const body = displayableMessageText(String(o.content ?? ''), hasAtt);
  const t = (body ?? '').trim();
  if (t) return t.length > 160 ? `${t.slice(0, 157)}…` : t;
  if (hasAtt) return 'Вложение';
  return '…';
}

/**
 * Данные для блока «ответ на сообщение» из ответа API.
 * Поддерживаются вложенный объект и плоские поля — бэкенд может отличаться.
 */
export function extractReplyMeta(
  item: ChatMessage,
  senderNames: Record<string, string>
): ReplyDraft | null {
  const o = item as Record<string, unknown>;

  if (typeof o.reply_to === 'string' && o.reply_to.trim()) {
    const messageId = o.reply_to.trim();
    const senderName =
      String(o.reply_to_sender_name ?? '').trim() ||
      String(o.reply_sender_name ?? '').trim() ||
      '…';
    const preview =
      String(o.reply_to_preview ?? o.reply_preview ?? '').trim() || '…';
    return { messageId, senderName, preview };
  }

  const nested = o.reply_to ?? o.reply ?? o.parent_message ?? o.quoted_message;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    const messageId = String(n._id ?? n.id ?? '').trim();
    if (!messageId) return null;
    let senderName = '';
    for (const k of ['sender_full_name', 'sender_name', 'sender_display_name']) {
      const v = n[k];
      if (typeof v === 'string' && v.trim()) {
        senderName = v.trim();
        break;
      }
    }
    if (!senderName) {
      const sid = String(n.sender_id ?? '').trim();
      senderName = (sid && senderNames[sid]) || (sid ? shortSenderId(sid) : '…');
    }
    const preview = previewFromMessageLike(n);
    return { messageId, senderName, preview };
  }

  const messageId = String(
    o.reply_to_id ?? o.reply_to_message_id ?? o.parent_message_id ?? ''
  ).trim();
  if (!messageId) return null;

  let senderName = String(
    o.reply_to_sender_name ?? o.reply_sender_name ?? o.reply_to_name ?? ''
  ).trim();
  if (!senderName) {
    const sid = String(o.reply_to_sender_id ?? o.reply_sender_id ?? '').trim();
    senderName = (sid && senderNames[sid]) || (sid ? shortSenderId(sid) : '…');
  }

  let preview = String(
    o.reply_to_preview ?? o.reply_preview ?? o.reply_to_content ?? o.reply_to_text ?? ''
  ).trim();
  if (!preview) preview = '…';

  return { messageId, senderName, preview };
}

/** Черновик ответа для панели ввода (long press). */
export function buildReplyDraftFromMessage(
  item: ChatMessage,
  senderNames: Record<string, string>
): ReplyDraft | null {
  const messageId = getMessageId(item);
  if (!messageId) return null;

  const o = item as Record<string, unknown>;
  const sid = String(o.sender_id ?? '').trim();
  let senderName = '';
  for (const k of ['sender_full_name', 'sender_name', 'sender_display_name']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) {
      senderName = v.trim();
      break;
    }
  }
  if (!senderName) {
    senderName =
      (sid && senderNames[sid]) || (sid ? shortSenderId(sid) : 'Сообщение');
  }

  const hasAtt = parseAttachments(o.attachments).length > 0;
  const body = displayableMessageText(String(o.content ?? ''), hasAtt);
  const raw = (body ?? '').trim();
  const preview =
    raw.length > 200 ? `${raw.slice(0, 197)}…` : raw || (hasAtt ? 'Вложение' : '…');

  return { messageId, senderName, preview };
}
