import type { DepartmentRow } from '../api/departmentsApi';
import {
  chatApiUserId,
  taskAssigneesApiId,
  userListDisplayName,
  type UserListItem,
} from '../api/usersApi';

function idMatchKey(s: string): string {
  let t = s.trim();
  if (t.toLowerCase().startsWith('user_')) t = t.slice(5);
  return t;
}

/** Парсинг id из поля задачи: массив, JSON-массив или строка через запятую */
export function parseIdTokens(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s) as unknown;
    if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    /* строка */
  }
  return s.split(/[,\s;]+/).map((t) => t.trim()).filter(Boolean);
}

/** Карта «любой известный id пользователя → отображаемое имя» */
export function buildUserDisplayLookup(users: UserListItem[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of users) {
    const name = userListDisplayName(u);
    const o = u as Record<string, unknown>;
    const keys = new Set<string>();
    const chatId = chatApiUserId(u);
    if (chatId) {
      keys.add(chatId.trim());
      keys.add(idMatchKey(chatId));
    }
    const pk = taskAssigneesApiId(u);
    if (pk) {
      keys.add(pk.trim());
      keys.add(idMatchKey(pk));
    }
    for (const raw of [u._id, u.id, u.pk, o._id, o.id]) {
      if (raw != null && raw !== '') keys.add(String(raw).trim());
    }
    for (const k of keys) {
      if (k) m.set(k, name);
    }
  }
  return m;
}

export function formatSingleUserLabel(id: string, lookup: Map<string, string>): string {
  const t = id.trim();
  if (!t) return '';
  return lookup.get(t) ?? lookup.get(idMatchKey(t)) ?? t;
}

export function formatUserIdsLine(ids: string[], lookup: Map<string, string>): string {
  if (!ids.length) return '';
  const parts = ids.map((id) => formatSingleUserLabel(id, lookup)).filter(Boolean);
  return parts.length ? parts.join(', ') : '';
}

export function buildDepartmentLookup(rows: DepartmentRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of rows) {
    const o = d as Record<string, unknown>;
    const name = String(o.name ?? '').trim() || 'Подразделение';
    const id = String(o._id ?? o.id ?? '').trim();
    if (!id) continue;
    const variants = new Set<string>([id, idMatchKey(id)]);
    const digits = id.match(/(\d+)$/)?.[1];
    if (digits) variants.add(digits);
    if (/^\d+$/.test(id)) variants.add(id);
    for (const v of variants) {
      if (v) m.set(v, name);
    }
  }
  return m;
}

export function formatDepartmentIdsLine(ids: string[], lookup: Map<string, string>): string {
  if (!ids.length) return '';
  const parts = ids.map((id) => {
    const t = id.trim();
    if (!t) return '';
    return lookup.get(t) ?? lookup.get(idMatchKey(t)) ?? t;
  }).filter(Boolean);
  return parts.length ? parts.join(', ') : '';
}
