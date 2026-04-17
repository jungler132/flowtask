import { apiFetch } from './client';

export type Task = Record<string, unknown>;

export type TaskListParams = {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  priority?: string;
  task_type?: string;
  parent_task?: number;
  creator?: number;
  office_number?: string;
  assignees?: number[];
  assigned_departments?: number[];
};

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, String(x)));
    else p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function normalizeTaskList(data: unknown): Task[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as Task[];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.results)) return o.results as Task[];
  if (Array.isArray(o.data)) return o.data as Task[];
  if (typeof o._id === 'string' || typeof o.title === 'string') return [o as Task];
  return [];
}

/** ID задачи для API (чаты, ссылки). */
export function taskPickerId(t: Task): string {
  const o = t as Record<string, unknown>;
  const id = o._id ?? o.id ?? o.pk ?? o.task_id;
  if (id == null || id === '') return '';
  return String(id).trim();
}

export function taskPickerTitle(t: Task): string {
  const o = t as Record<string, unknown>;
  const title = o.title ?? o.name ?? o.subject;
  const s = String(title ?? '').trim();
  if (s) return s;
  const id = taskPickerId(t);
  return id || 'Задача';
}

/**
 * Все доступные страницы списка задач (page + page_size).
 */
export async function fetchAllTasks(opts?: {
  pageSize?: number;
  search?: string;
}): Promise<Task[]> {
  const pageSize = opts?.pageSize ?? 40;
  const search = opts?.search;
  const seen = new Set<string>();
  const out: Task[] = [];
  let page = 1;

  for (let guard = 0; guard < 100; guard++) {
    const raw = (await fetchTasksPage({
      page,
      page_size: pageSize,
      ...(search ? { search } : {}),
    })) as Record<string, unknown>;
    const batch = normalizeTaskList(raw);
    for (const t of batch) {
      const id = taskPickerId(t);
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(t);
    }
    if (batch.length === 0) break;
    if (batch.length < pageSize) break;
    page += 1;
  }

  return out;
}

const TASKS_PICKER_CACHE_VERSION = 1;
let tasksPickerCache: { data: Task[]; at: number; v: number } | null = null;
const TASKS_PICKER_CACHE_MS = 120_000;

export function invalidateTasksPickerCache() {
  tasksPickerCache = null;
}

export async function fetchAllTasksCached(opts?: {
  force?: boolean;
  pageSize?: number;
}): Promise<Task[]> {
  const c = tasksPickerCache;
  const fresh =
    !!c &&
    c.v === TASKS_PICKER_CACHE_VERSION &&
    Date.now() - c.at < TASKS_PICKER_CACHE_MS;
  if (!opts?.force && fresh && c) {
    return c.data;
  }
  const data = await fetchAllTasks({ pageSize: opts?.pageSize ?? 40 });
  tasksPickerCache = { data, at: Date.now(), v: TASKS_PICKER_CACHE_VERSION };
  return data;
}

export async function fetchTasksList(params: TaskListParams = {}) {
  const data = await apiFetch(`/api/tasks/${qs(params as Record<string, unknown>)}`);
  return normalizeTaskList(data);
}

export async function fetchTasksPage(params: TaskListParams = {}) {
  return apiFetch<{
    count?: number;
    next?: string | null;
    previous?: string | null;
    results?: Task[];
  }>(`/api/tasks/${qs(params as Record<string, unknown>)}`);
}

export async function fetchTasksMy() {
  const data = await apiFetch('/api/tasks/my/');
  return normalizeTaskList(data);
}

export async function fetchTasksCreated() {
  const data = await apiFetch('/api/tasks/created/');
  return normalizeTaskList(data);
}

export async function fetchTasksUnassigned() {
  const data = await apiFetch('/api/tasks/unassigned/');
  return normalizeTaskList(data);
}

export async function fetchTasksAll() {
  const data = await apiFetch('/api/tasks/all/');
  return normalizeTaskList(data);
}

export async function fetchTask(id: string | number) {
  return apiFetch<Task>(`/api/tasks/${id}/`);
}

export async function createTask(body: Record<string, unknown>) {
  return apiFetch<Task>('/api/tasks/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateTask(id: string | number, body: Record<string, unknown>) {
  return apiFetch<Task>(`/api/tasks/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function replaceTask(id: string | number, body: Record<string, unknown>) {
  return apiFetch<Task>(`/api/tasks/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteTask(id: string | number) {
  await apiFetch(`/api/tasks/${id}/`, { method: 'DELETE' });
}

export async function addAssignees(id: string | number, assignees: string[]) {
  return apiFetch(`/api/tasks/${id}/add-assignee/`, {
    method: 'POST',
    body: JSON.stringify({ assignees }),
  });
}

export async function transferTask(id: string | number, assignees: string[]) {
  return apiFetch(`/api/tasks/${id}/transfer/`, {
    method: 'POST',
    body: JSON.stringify({ assignees }),
  });
}

export async function fetchSubtasks(id: string | number) {
  const data = await apiFetch(`/api/tasks/${id}/subtasks/`);
  return normalizeTaskList(data);
}

export async function postActivity(id: string | number, body: Record<string, unknown> = {}) {
  return apiFetch(`/api/tasks/${id}/activity/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchActivity(id: string | number) {
  const data = await apiFetch(`/api/tasks/${id}/activity/`);
  return normalizeTaskList(data);
}

export async function passwordResetTask(body: Record<string, unknown>) {
  return apiFetch('/api/tasks/password-reset/', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(body),
  });
}

export type TaskComment = Record<string, unknown>;

export async function fetchComments(
  taskId: string | number,
  params: { page?: number; limit?: number; search?: string } = {}
) {
  return apiFetch<{
    results?: TaskComment[] | TaskComment[][];
    count?: number;
    next?: string | null;
  }>(`/api/tasks/${taskId}/comments/${qs(params as Record<string, unknown>)}`);
}

export function flattenCommentResults(
  res: Awaited<ReturnType<typeof fetchComments>>
): TaskComment[] {
  const r = res?.results;
  if (!r) return [];
  if (Array.isArray(r) && r.length && Array.isArray(r[0]))
    return (r as TaskComment[][]).flat();
  return r as TaskComment[];
}

export async function createComment(
  taskId: string | number,
  body: Record<string, unknown>
) {
  return apiFetch(`/api/tasks/${taskId}/comments/`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateComment(
  taskId: string | number,
  commentId: string | number,
  content: string
) {
  return apiFetch(`/api/tasks/${taskId}/comments/${commentId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export async function deleteComment(taskId: string | number, commentId: string | number) {
  await apiFetch(`/api/tasks/${taskId}/comments/${commentId}/`, { method: 'DELETE' });
}
