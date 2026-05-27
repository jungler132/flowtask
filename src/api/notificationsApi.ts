import { apiFetch } from './client';

export type AppNotification = {
  _id?: string;
  _uid?: string;
  id?: string | number;
  user_id?: string;
  type?: string;
  title?: string;
  message?: string;
  link?: string;
  is_read?: boolean | string;
  related_task_id?: string;
  related_user_id?: string;
  created_at?: string;
  updated_at?: string;
};

type Paginated<T> = {
  results?: T[];
  count?: number;
};

/** GET /api/notifications/unread-count/ */
export async function fetchUnreadNotificationsCount(): Promise<number> {
  const data = await apiFetch<{ unread_count?: number } | Record<string, unknown>>(
    '/api/notifications/unread-count/'
  );
  if (data && typeof data === 'object' && 'unread_count' in data) {
    const n = (data as { unread_count?: number }).unread_count;
    return typeof n === 'number' && n >= 0 ? n : 0;
  }
  return 0;
}

/** POST /api/notifications/mark-all-read/ */
export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch('/api/notifications/mark-all-read/', { method: 'POST', body: '{}' });
}

/** PATCH /api/notifications/{id}/ */
export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/notifications/${encodeURIComponent(id)}/`, {
    method: 'PATCH',
    body: JSON.stringify({ is_read: 'true' }),
  });
}

export async function fetchNotificationsPage(page = 1): Promise<Paginated<AppNotification>> {
  return apiFetch<Paginated<AppNotification>>(`/api/notifications/?page=${page}&ordering=-created_at`);
}
