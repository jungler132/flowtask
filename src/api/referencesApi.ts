import { apiFetch } from './client';

export type ReferenceItem = Record<string, unknown>;

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

function normalizeList(data: unknown): ReferenceItem[] {
  if (Array.isArray(data)) return data as ReferenceItem[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.results)) return o.results as ReferenceItem[];
  }
  return [];
}

/** GET /api/references/position/ */
export async function fetchPositions(params: { search?: string; page?: number } = {}) {
  const data = await apiFetch<unknown>(
    `/api/references/position/${qs(params as Record<string, unknown>)}`
  );
  return normalizeList(data);
}

/** GET /api/references/branch/ */
export async function fetchBranches(params: { search?: string; page?: number } = {}) {
  const data = await apiFetch<unknown>(
    `/api/references/branch/${qs(params as Record<string, unknown>)}`
  );
  return normalizeList(data);
}
