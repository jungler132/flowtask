import { apiFetch } from './client';

export type NewsItem = Record<string, unknown>;

export type NewsLevel = '' | 'general' | 'important' | 'training';

const LEVEL_KEYS = new Set(['general', 'important', 'training']);

const RU_LEVEL: Record<string, NewsLevel> = {
  важно: 'important',
  общая: 'general',
  общие: 'general',
  обучение: 'training',
};

function normalizeLevelScalar(raw: unknown): NewsLevel | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).toLowerCase().trim();
  if (LEVEL_KEYS.has(s)) return s as NewsLevel;
  return RU_LEVEL[s] ?? null;
}

/** Значение `level` из ответа API → ключ фильтра (чипы). */
export function newsLevelKey(item: NewsItem): NewsLevel | null {
  const raw = (item as Record<string, unknown>).level;
  if (raw != null && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    return normalizeLevelScalar(o.value ?? o.code ?? o.key);
  }
  return normalizeLevelScalar(raw);
}

export function newsLevelMatches(item: NewsItem, filter: NewsLevel | 'all'): boolean {
  if (filter === 'all') return true;
  return newsLevelKey(item) === filter;
}

export type NewsListParams = {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
  level?: NewsLevel;
  is_pinned?: boolean;
  is_expired?: boolean;
  category?: number;
  author?: number;
};

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function fetchNewsPage(params: NewsListParams = {}) {
  return apiFetch<{
    count?: number;
    next?: string | null;
    previous?: string | null;
    results?: NewsItem[];
  }>(`/api/news/${qs(params as Record<string, unknown>)}`);
}

export async function fetchNewsById(id: string | number) {
  return apiFetch<NewsItem>(`/api/news/${encodeURIComponent(String(id))}/`);
}

export function newsId(n: NewsItem): string {
  return String((n as Record<string, unknown>)._id ?? '').trim();
}

export function newsTitle(n: NewsItem): string {
  const t = String((n as Record<string, unknown>).title ?? '').trim();
  return t || 'Новость';
}

export function newsContentPreview(n: NewsItem, maxLen = 180): string {
  const raw = String((n as Record<string, unknown>).content ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  return raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw;
}
