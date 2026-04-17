import { API_BASE } from '../config';
import { apiFetch, ApiError, extractTokens, formatErrorMessage } from './client';
import { saveTokens } from '../lib/storage';

/** Профиль GET /api/auth/me/ (см. UserProfile в openapi). */
export type UserProfile = Record<string, unknown> & {
  _id?: string;
  _uid?: string;
  user_id?: string;
  email?: string;
  full_name?: string;
  role?: string;
  position?: string | null;
  department_id?: string | null;
  branch?: string | null;
  phone?: string;
  birth_date?: string | null;
  room_number?: string;
  reserve_email?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

/** Ответ POST /api/auth/login/ (успех без обёртки data или с success). */
export function loginResponseHint(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.message === 'string' && o.message.trim()) return o.message;
  if (typeof o.detail === 'string' && o.detail.trim()) return o.detail;
  if (o.data && typeof o.data === 'object') {
    const inner = o.data as Record<string, unknown>;
    if (typeof inner.message === 'string' && inner.message.trim()) return inner.message;
    if (typeof inner.detail === 'string' && inner.detail.trim()) return inner.detail;
  }
  return null;
}

export async function sendOtp(email: string, useReserveEmail?: boolean) {
  const body: Record<string, unknown> = { email: email.trim() };
  if (useReserveEmail) body.use_reserve_email = true;
  return apiFetch<unknown>('/api/auth/login/', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(body),
  });
}

export async function verifyOtp(email: string, code: string) {
  const raw = await fetch(`${API_BASE}/api/auth/verify/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp: code, otp_code: code }),
  });
  const text = await raw.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(text.slice(0, 200), raw.status);
    }
  }
  if (!raw.ok) {
    throw new ApiError(formatErrorMessage(json, raw.status), raw.status, json);
  }
  const { access, refresh } = extractTokens(json);
  await saveTokens(access, refresh);
  return { access, refresh };
}

export async function logoutApi() {
  try {
    await apiFetch('/api/auth/logout/', { method: 'POST' });
  } catch {
    /* ignore */
  }
}

export async function fetchMe(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/auth/me/');
}
