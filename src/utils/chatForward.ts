import type { ChatMessage } from '../api/chatsApi';
import {
  displayableMessageText,
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
  const atts = parseAttachments((message as Record<string, unknown>).attachments);
  const ids: string[] = [];
  for (const a of atts) {
    const id = String(a.id ?? '').trim();
    if (id) ids.push(id);
  }
  return ids;
}

/** Текст пересланного сообщения (как в мессенджерах) + признак вложений. */
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
  const hasAtt = parseAttachments(o.attachments).length > 0;
  const text = displayableMessageText(String(o.content ?? ''), hasAtt) || '';
  const safeTitle = fromChatTitle.trim() || 'Чат';
  const prefix = `↩️ Переслано из «${safeTitle}» (${name}):\n`;
  const content = prefix + (text.trim() || (hasAtt ? 'Вложение' : '.'));
  return { content, hasAttachments: hasAtt };
}
