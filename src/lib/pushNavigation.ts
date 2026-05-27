import type { NavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../navigation/types';

export type PushPayload = Record<string, unknown>;

function pickString(data: PushPayload | undefined, ...keys: string[]): string | undefined {
  if (!data) return undefined;
  for (const k of keys) {
    const v = data[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function taskIdFromLink(link: string): string | undefined {
  const m = link.match(/\/tasks\/([^/?#]+)/i);
  return m?.[1];
}

function chatIdFromLink(link: string): string | undefined {
  const m = link.match(/\/chats\/([^/?#]+)/i);
  return m?.[1];
}

export function parsePushTarget(data: PushPayload | undefined): {
  kind: 'task' | 'chat' | 'news' | 'main';
  taskId?: string;
  chatId?: string;
  title?: string;
} {
  const link = pickString(data, 'link', 'url');
  const type = pickString(data, 'type', 'notification_type')?.toLowerCase() ?? '';
  const title = pickString(data, 'title');

  let taskId = pickString(data, 'taskId', 'task_id', 'related_task_id');
  let chatId = pickString(data, 'chatId', 'chat_id', 'related_chat_id');

  if (link) {
    taskId = taskId ?? taskIdFromLink(link);
    chatId = chatId ?? chatIdFromLink(link);
  }

  if (type.includes('chat') || chatId) {
    return { kind: 'chat', chatId, title: title ?? 'Чат' };
  }

  if (
    type.includes('task') ||
    type.includes('report') ||
    type.includes('directive') ||
    type.includes('mention') ||
    type.includes('comment') ||
    taskId
  ) {
    return { kind: 'task', taskId, title };
  }

  if (type.includes('news')) {
    return { kind: 'news', title };
  }

  if (taskId) return { kind: 'task', taskId, title };
  if (chatId) return { kind: 'chat', chatId, title: title ?? 'Чат' };

  return { kind: 'main' };
}

export function navigateFromPushPayload(
  navigationRef: NavigationContainerRef<RootStackParamList>,
  data: PushPayload | undefined
): void {
  if (!navigationRef.isReady()) return;

  const target = parsePushTarget(data);

  switch (target.kind) {
    case 'task':
      if (target.taskId) {
        navigationRef.navigate('Main', {
          screen: 'Tasks',
          params: {
            screen: 'TaskDetail',
            params: { taskId: target.taskId, taskTitle: target.title },
          },
        });
      } else {
        navigationRef.navigate('Main', { screen: 'Tasks' });
      }
      break;
    case 'chat':
      if (target.chatId) {
        navigationRef.navigate('Main', {
          screen: 'Chats',
          params: {
            screen: 'ChatRoom',
            params: { chatId: target.chatId, title: target.title ?? 'Чат' },
          },
        });
      } else {
        navigationRef.navigate('Main', { screen: 'Chats' });
      }
      break;
    case 'news':
      navigationRef.navigate('Main', { screen: 'News' });
      break;
    default:
      navigationRef.navigate('Main', { screen: 'Tasks' });
  }
}

/** Android channel id по типу уведомления (FCM data.type). */
export function androidChannelForType(type: string | undefined): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('chat')) return 'chats';
  if (t.includes('news')) return 'news';
  return 'tasks';
}
