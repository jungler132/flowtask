import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chat } from '../../api/chatsApi';
import { fetchUser } from '../../api/usersApi';
import { shortSenderId } from '../../utils/chatAttachments';
import { parseParticipantIds, sameParticipantId } from './participantIdUtils';

/**
 * Имя чата для строки списка / модалки: в личке подставляет собеседника (поле name с API часто неверное).
 */
export function usePrivateChatPeerTitles(chats: Chat[], myUserId: string) {
  const [privatePeerTitles, setPrivatePeerTitles] = useState<Record<string, string>>({});
  const fetchStarted = useRef(new Set<string>());

  useEffect(() => {
    if (!myUserId) {
      setPrivatePeerTitles({});
      fetchStarted.current.clear();
    }
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) return;
    for (const c of chats) {
      const chatId = String(c._id ?? '').trim();
      const type = String(c.type ?? '').trim().toLowerCase();
      if (!chatId || type !== 'private') continue;
      if (privatePeerTitles[chatId]) continue;
      if (fetchStarted.current.has(chatId)) continue;
      const parts = parseParticipantIds(c.participant_ids);
      if (parts.length < 2) continue;
      const other = parts.find((p) => !sameParticipantId(p, myUserId));
      if (!other) continue;
      fetchStarted.current.add(chatId);
      fetchUser(other)
        .then((u) => {
          const label =
            String(u.full_name ?? u.email ?? '').trim() || shortSenderId(other);
          setPrivatePeerTitles((prev) => ({ ...prev, [chatId]: label }));
        })
        .catch(() => {
          fetchStarted.current.delete(chatId);
        });
    }
  }, [chats, myUserId, privatePeerTitles]);

  const chatRowTitle = useCallback(
    (c: Chat): string => {
      const id = String(c._id ?? '').trim();
      const isPrivate = String(c.type ?? '').trim().toLowerCase() === 'private';
      if (isPrivate && id && privatePeerTitles[id]) return privatePeerTitles[id];
      return String(c.name ?? 'Чат').trim() || 'Чат';
    },
    [privatePeerTitles]
  );

  return { privatePeerTitles, chatRowTitle };
}
