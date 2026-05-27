import { saveTokens } from '../lib/storage';
import { apiFetch, extractTokens } from './client';

/** Профиль GET /api/auth/me/ */
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
  avatar_url?: string | null;
  avatar_id?: string | null;
};

export type LoginStatus = 'AUTHENTICATED' | 'MUST_CHANGE_PASSWORD' | 'PASSWORD_NOT_SET';

export type LoginResult =
  | { status: 'AUTHENTICATED'; access: string; refresh?: string }
  | { status: 'MUST_CHANGE_PASSWORD'; changeToken: string; message?: string }
  | { status: 'PASSWORD_NOT_SET'; message?: string };

export type OtpSendResult = {
  message?: string;
  emailsSentTo?: string[];
};

function unwrapPayload(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== 'object') return {};
  const root = json as Record<string, unknown>;
  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    return root.data as Record<string, unknown>;
  }
  return root;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function pickStatus(body: Record<string, unknown>): LoginStatus | undefined {
  const raw = pickString(body, ['status', 'login_status', 'state', 'auth_status']);
  if (!raw) return undefined;
  const u = raw.toUpperCase();
  if (u === 'AUTHENTICATED' || u === 'MUST_CHANGE_PASSWORD' || u === 'PASSWORD_NOT_SET') {
    return u;
  }
  return undefined;
}

function extractChangeToken(body: Record<string, unknown>): string | undefined {
  return pickString(body, [
    'change_token',
    'change_password_token',
    'password_change_token',
    'token',
  ]);
}

/** POST /api/auth/login/ — email + пароль (newapiflowtask). */
export function parseLoginResponse(json: unknown): LoginResult {
  const body = unwrapPayload(json);
  const status = pickStatus(body);
  const message = pickString(body, ['message', 'detail']);

  if (status === 'PASSWORD_NOT_SET') {
    return { status: 'PASSWORD_NOT_SET', message };
  }

  if (status === 'MUST_CHANGE_PASSWORD') {
    const changeToken = extractChangeToken(body);
    if (!changeToken) {
      throw new Error('Сервер не вернул токен смены пароля (MUST_CHANGE_PASSWORD).');
    }
    return { status: 'MUST_CHANGE_PASSWORD', changeToken, message };
  }

  try {
    const { access, refresh } = extractTokens(body);
    return { status: 'AUTHENTICATED', access, refresh };
  } catch {
    if (status === 'AUTHENTICATED') {
      throw new Error('Сервер подтвердил вход, но не вернул access-токен.');
    }
  }

  const changeToken = extractChangeToken(body);
  if (changeToken) {
    return { status: 'MUST_CHANGE_PASSWORD', changeToken, message };
  }

  if (status) {
    throw new Error(`Неизвестный статус входа: ${status}`);
  }

  throw new Error('Не удалось разобрать ответ сервера при входе.');
}

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const json = await apiFetch<unknown>('/api/auth/login/', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email: email.trim(), password }),
  });
  return parseLoginResponse(json);
}

/** POST /api/auth/otp/send/ — OTP на основной и резервный email. */
export async function sendOtp(email: string): Promise<OtpSendResult> {
  const json = await apiFetch<unknown>('/api/auth/otp/send/', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email: email.trim() }),
  });
  const body = unwrapPayload(json);
  const emailsRaw = body.emails_sent_to;
  const emailsSentTo = Array.isArray(emailsRaw)
    ? emailsRaw.filter((x): x is string => typeof x === 'string')
    : undefined;
  return {
    message: pickString(body, ['message', 'detail']),
    emailsSentTo,
  };
}

export function otpSendHint(data: OtpSendResult): string | null {
  if (data.message?.trim()) return data.message.trim();
  if (data.emailsSentTo?.length) {
    return `Код отправлен на: ${data.emailsSentTo.join(', ')}`;
  }
  return null;
}

/** POST /api/auth/otp/verify/ → change_token для set-password. */
export async function verifyOtpForPassword(email: string, code: string): Promise<string> {
  const json = await apiFetch<unknown>('/api/auth/otp/verify/', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      email: email.trim(),
      otp: code.trim(),
      otp_code: code.trim(),
    }),
  });
  const body = unwrapPayload(json);
  const token = extractChangeToken(body);
  if (!token) {
    throw new Error('Сервер не вернул токен для установки пароля.');
  }
  return token;
}

/** POST /api/auth/set-password/ — после OTP или временного пароля. */
export async function setPasswordWithToken(
  changeToken: string,
  password: string,
  confirmPassword: string
): Promise<{ access: string; refresh?: string }> {
  const json = await apiFetch<unknown>('/api/auth/set-password/', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({
      change_token: changeToken,
      password,
      confirm_password: confirmPassword,
    }),
  });
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

/** PATCH /api/users/me/ */
export async function patchMyProfile(body: Record<string, unknown>): Promise<UserProfile> {
  return apiFetch<UserProfile>('/api/users/me/', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** POST /api/auth/reset-password/ — временный пароль на email. */
export async function requestPasswordReset(email: string) {
  await apiFetch('/api/auth/reset-password/', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ email: email.trim() }),
  });
}

/** POST /api/auth/change-password/ — для авторизованного пользователя. */
export async function changePassword(
  oldPassword: string,
  password: string,
  confirmPassword: string
) {
  await apiFetch('/api/auth/change-password/', {
    method: 'POST',
    body: JSON.stringify({
      old_password: oldPassword,
      password,
      confirm_password: confirmPassword,
    }),
  });
}

/**
 * POST /api/auth/verify/ — alias OTP verify (тот же контракт, что /api/auth/otp/verify/).
 */
export async function verifyOtpLegacy(email: string, code: string) {
  return verifyOtpForPassword(email, code);
}
