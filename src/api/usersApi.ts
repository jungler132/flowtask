import { apiFetch } from './client';

export type UserDetail = Record<string, unknown> & {
  user_id?: string;
  full_name?: string;
  email?: string;
};

export type UserListItem = Record<string, unknown> & {
  _id?: string;
  _uid?: string;
  user_id?: string;
  id?: string | number;
  pk?: string | number;
  email?: string;
  full_name?: string;
  role?: string;
};

function qsUsers(params: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === '') return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

function isUserRow(x: unknown): x is UserListItem {
  return x != null && typeof x === 'object' && !Array.isArray(x);
}

/**
 * Достаёт массив пользователей из ответа GET /api/users/.
 * Учитывает: корневой массив, results, вложенный data, веб-обёртки success/data, users/items.
 */
export function normalizeUsersListResponse(data: unknown): UserListItem[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.filter(isUserRow) as UserListItem[];
  }
  if (typeof data !== 'object') return [];

  const fromObject = (obj: Record<string, unknown>): UserListItem[] | null => {
    let r: unknown = obj.results;
    if (Array.isArray(r) && r.length > 0 && Array.isArray((r as unknown[])[0])) {
      r = (r as unknown[][]).flat();
    }
    if (Array.isArray(r) && r.every(isUserRow)) {
      return r as UserListItem[];
    }
    for (const k of ['users', 'items', 'list']) {
      const a = obj[k];
      if (Array.isArray(a) && a.every(isUserRow)) {
        return a as UserListItem[];
      }
    }
    if (Array.isArray(obj.data) && (obj.data as unknown[]).every(isUserRow)) {
      return obj.data as UserListItem[];
    }
    return null;
  };

  const o = data as Record<string, unknown>;
  const top = fromObject(o);
  if (top) return top;

  const inner = o.data;
  if (inner != null && typeof inner === 'object' && !Array.isArray(inner)) {
    const nested = fromObject(inner as Record<string, unknown>);
    if (nested) return nested;
  }

  return [];
}

/** GET /api/users/{user_id}/ */
export async function fetchUser(userId: string): Promise<UserDetail> {
  const id = encodeURIComponent(userId.trim());
  return apiFetch<UserDetail>(`/api/users/${id}/`);
}

/** GET /api/users/ — список с поиском (параметр search в OpenAPI). */
export async function fetchUsersList(
  params: { search?: string; page?: number; limit?: number } = {}
): Promise<UserListItem[]> {
  const raw = await apiFetch<unknown>(
    `/api/users/${qsUsers({
      search: params.search,
      page: params.page,
      limit: params.limit ?? 40,
    })}`
  );
  return normalizeUsersListResponse(raw);
}

function resolveNextPageUrl(next: string): string {
  const nu = next.trim();
  if (nu.startsWith('http://') || nu.startsWith('https://')) return nu;
  if (nu.startsWith('/')) return nu;
  if (nu.startsWith('?')) return `/api/users/${nu}`;
  return `/api/users/${nu}`;
}

function isDigitsOnlyId(s: string): boolean {
  return /^\d+$/.test(s.trim());
}

/**
 * Внешний идентификатор для API чатов/задач (см. OpenAPI: user_id — placeholder_…, не внутренний PK).
 * Числовой `_id` не используем, если есть `user_id` / `_uid` / другой нечисловой id.
 */
export function chatApiUserId(u: UserListItem): string {
  const o = u as Record<string, unknown>;
  type Cand = { v: string; w: number };
  const cands: Cand[] = [];
  const push = (raw: unknown, w: number) => {
    if (raw == null || raw === '') return;
    const v = String(raw).trim();
    if (v) cands.push({ v, w });
  };
  push(u.user_id, 100);
  push(u._uid, 96);
  push(o.external_id, 94);
  push(o.external_user_id, 94);
  push(o.userId, 90);
  push(u._id, 55);
  push(u.id, 45);
  push(u.pk, 45);

  const nonNumeric = cands.filter((c) => !isDigitsOnlyId(c.v));
  const pool = nonNumeric.length > 0 ? nonNumeric : cands;
  pool.sort((a, b) => b.w - a.w);
  return pool[0]?.v ?? '';
}

/** Алиас для chatApiUserId (совместимость с существующим кодом). */
export function userInviteId(u: UserListItem): string {
  return chatApiUserId(u);
}

function participantDedupeKey(s: string): string {
  let t = s.trim();
  if (t.toLowerCase().startsWith('user_')) t = t.slice(5);
  return t;
}

/** PK пользователя для POST assignees к задаче (в OpenAPI — строки вроде "3", "4"). */
function stripToNumericUserPk(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (isDigitsOnlyId(s)) return s;
  const m = s.match(/^user_(\d+)$/i);
  if (m) return m[1];
  return null;
}

/**
 * Идентификатор исполнителя для тел задач (add-assignee, transfer, assignees в create/update).
 * Предпочитает числовой PK из профиля; иначе — тот же внешний id, что и для чатов.
 */
export function taskAssigneesApiId(u: UserListItem): string {
  const o = u as Record<string, unknown>;
  for (const raw of [u.pk, u.id, u._id, o.pk]) {
    const n = stripToNumericUserPk(raw);
    if (n) return n;
  }
  return chatApiUserId(u);
}

/**
 * Приводит id из UI (в т.ч. user_id/placeholder из каталога) к формату, который ждёт API задач.
 */
export async function resolveAssigneeIdsForTasksApi(ids: string[]): Promise<string[]> {
  const users = await fetchAllUsersCached();
  const byExternal = new Map<string, UserListItem>();
  for (const u of users) {
    const ext = chatApiUserId(u);
    if (ext) byExternal.set(participantDedupeKey(ext), u);
  }

  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of ids) {
    const t = raw.trim();
    if (!t) continue;

    let apiId: string;
    if (isDigitsOnlyId(t)) {
      apiId = t;
    } else {
      const u = byExternal.get(participantDedupeKey(t));
      apiId = u ? taskAssigneesApiId(u) : t;
    }

    if (!apiId) continue;
    const dedupe = isDigitsOnlyId(apiId) ? apiId : participantDedupeKey(apiId);
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(apiId);
  }

  return out;
}

/**
 * Если в participant_ids попал внутренний PK (только цифры), подставляет `user_id` из GET /api/users/{id}/.
 */
export async function resolveParticipantIdsForChatApi(ids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const raw of ids) {
    const t = raw.trim();
    if (!t) continue;
    let use = t;
    if (isDigitsOnlyId(t)) {
      try {
        const d = await fetchUser(t);
        const ext = String(d.user_id ?? '').trim();
        if (ext) use = ext;
      } catch {
        /* оставляем t */
      }
    }
    if (!out.some((x) => participantDedupeKey(x) === participantDedupeKey(use))) {
      out.push(use);
    }
  }
  return out;
}

/**
 * Все пользователи: GET /api/users/ с пагинацией (поле next как у DRF и/или page + limit + page_size).
 */
export async function fetchAllUsers(
  opts?: { pageSize?: number; search?: string }
): Promise<UserListItem[]> {
  const pageSize = opts?.pageSize ?? 100;
  const search = opts?.search;
  const seen = new Set<string>();
  const out: UserListItem[] = [];

  let url: string | null = `/api/users/${qsUsers({
    search,
    page: 1,
    limit: pageSize,
    page_size: pageSize,
  })}`;

  for (let guard = 0; guard < 1000 && url; guard++) {
    const pageUrl: string = url;
    const pageJson: Record<string, unknown> = await apiFetch<Record<string, unknown>>(pageUrl);
    const batch = normalizeUsersListResponse(pageJson);

    for (const u of batch) {
      const id = chatApiUserId(u);
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(u);
    }

    const nextRaw = pageJson.next;
    if (typeof nextRaw === 'string' && nextRaw.length > 0) {
      url = resolveNextPageUrl(nextRaw);
      continue;
    }

    const totalPages =
      typeof pageJson.pages === 'number' && pageJson.pages > 0 ? pageJson.pages : undefined;
    const currentPage: number = typeof pageJson.page === 'number' ? pageJson.page : guard + 1;

    if (batch.length === 0) break;
    if (totalPages != null && currentPage >= totalPages) break;
    if (totalPages == null && batch.length < pageSize) break;

    url = `/api/users/${qsUsers({
      search,
      page: currentPage + 1,
      limit: pageSize,
      page_size: pageSize,
    })}`;
  }

  return out;
}

/** Версия кэша: увеличивать при смене логики загрузки/разбора ответа. */
const ALL_USERS_CACHE_VERSION = 3;

let allUsersCache: { data: UserListItem[]; at: number; v: number } | null = null;
const ALL_USERS_CACHE_MS = 120_000;

export function invalidateAllUsersCache() {
  allUsersCache = null;
}

/** Полный список пользователей с коротким кэшем (для модалок выбора). */
export async function fetchAllUsersCached(opts?: {
  force?: boolean;
  pageSize?: number;
}): Promise<UserListItem[]> {
  const c = allUsersCache;
  const fresh =
    !!c &&
    c.v === ALL_USERS_CACHE_VERSION &&
    Date.now() - c.at < ALL_USERS_CACHE_MS;
  if (!opts?.force && fresh && c) {
    return c.data;
  }
  const data = await fetchAllUsers({ pageSize: opts?.pageSize ?? 100 });
  allUsersCache = { data, at: Date.now(), v: ALL_USERS_CACHE_VERSION };
  return data;
}

export function userListDisplayName(u: UserListItem): string {
  const n = String(u.full_name ?? '').trim();
  if (n) return n;
  const em = String(u.email ?? '').trim();
  if (em) return em;
  const id = chatApiUserId(u);
  return id || 'Пользователь';
}
