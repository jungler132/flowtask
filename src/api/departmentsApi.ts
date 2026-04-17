import { apiFetch } from './client';

export type DepartmentRow = Record<string, unknown>;

function normalizeList(data: unknown): DepartmentRow[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as DepartmentRow[];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.results)) return o.results as DepartmentRow[];
  return [];
}

export async function fetchAllDepartments(): Promise<DepartmentRow[]> {
  const out: DepartmentRow[] = [];
  let page = 1;
  const limit = 100;

  for (let guard = 0; guard < 50; guard++) {
    const data = await apiFetch<unknown>(`/api/departments/?page=${page}&limit=${limit}`);
    const batch = normalizeList(data);
    out.push(...batch);
    if (batch.length < limit) break;
    const o = data as Record<string, unknown>;
    if (typeof o.next === 'string' && o.next) {
      page += 1;
      continue;
    }
    break;
  }

  return out;
}

let cache: { data: DepartmentRow[]; at: number } | null = null;
const CACHE_MS = 120_000;

export async function fetchAllDepartmentsCached(): Promise<DepartmentRow[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await fetchAllDepartments();
  cache = { data, at: Date.now() };
  return data;
}

export function invalidateDepartmentsCache() {
  cache = null;
}
