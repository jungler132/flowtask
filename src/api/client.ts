import { API_BASE } from '../config';
import { clearTokens, getAccessToken } from '../lib/storage';

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export function formatErrorMessage(json: unknown, status: number): string {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (typeof o.error === 'string') return o.error;
    if (o.error && typeof o.error === 'object') {
      const e = o.error as Record<string, unknown>;
      if (typeof e.message === 'string') return e.message;
    }
    if (typeof o.detail === 'string') return o.detail;
    if (Array.isArray(o.detail)) return JSON.stringify(o.detail);
    if (typeof o.message === 'string') return o.message;
  }
  return `Ошибка запроса (${status})`;
}

/**
 * Разворачивает тело ответа 4xx (Django/DRF: поля → массивы строк, detail, non_field_errors).
 * Удобно показывать в алерте целиком для отладки.
 */
export function formatValidationErrorsBody(body: unknown): string {
  if (body == null || body === '') return '';
  if (typeof body === 'string') return body.trim();

  const lines: string[] = [];

  const pushLine = (path: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    lines.push(path ? `${path}: ${t}` : t);
  };

  const walk = (value: unknown, path: string) => {
    if (value == null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      pushLine(path, String(value));
      return;
    }
    if (Array.isArray(value)) {
      const allPrimitive = value.every(
        (x) => x == null || ['string', 'number', 'boolean'].includes(typeof x)
      );
      if (allPrimitive) {
        pushLine(path, value.map((x) => String(x)).join('; '));
        return;
      }
      value.forEach((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`));
      return;
    }
    if (typeof value === 'object') {
      const o = value as Record<string, unknown>;
      for (const [k, v] of Object.entries(o)) {
        if (k === 'success' && typeof v === 'boolean') continue;
        const p = path ? `${path}.${k}` : k;
        walk(v, p);
      }
    }
  };

  walk(body, '');
  const joined = lines.join('\n').trim();
  if (joined) return joined;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

/** Текст для Alert: краткое сообщение + HTTP + разбор полей / сырой JSON. */
export function formatApiErrorForUser(e: unknown): string {
  if (e instanceof ApiError) {
    const parts: string[] = [];
    if (e.message.trim()) parts.push(e.message.trim());
    parts.push(`HTTP ${e.status}`);
    const structured = formatValidationErrorsBody(e.body);
    if (structured) {
      parts.push('— ответ сервера —\n' + structured);
    } else if (e.body !== undefined && e.body !== null) {
      try {
        parts.push('— ответ сервера (JSON) —\n' + JSON.stringify(e.body, null, 2));
      } catch {
        parts.push('— ответ сервера —\n' + String(e.body));
      }
    }
    return parts.join('\n\n');
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/** Тело ответа не JSON (часто HTML-страница 404/500 от Django). */
function humanizeNonJsonBody(text: string, status: number): string {
  const t = text.trim();
  if (/<!doctype|<html[\s>]/i.test(t)) {
    if (status === 404) {
      return 'Ресурс не найден (404). Проверьте адрес API или идентификатор.';
    }
    if (status >= 500) {
      return 'Ошибка на сервере. Попробуйте позже.';
    }
    return `Сервер вернул страницу вместо JSON (${status}).`;
  }
  return t.slice(0, 280) || `Некорректный ответ (${status})`;
}

export function parseResponse<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'success' in json) {
    const r = json as Record<string, unknown>;
    if (r.success === false) {
      throw new ApiError(formatErrorMessage(json, 400), 400, json);
    }
    if (r.success === true && r.data !== undefined) return r.data as T;
  }
  return json as T;
}

export type FetchOptions = RequestInit & {
  skipAuth?: boolean;
};

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<T> {
  const { skipAuth, headers: hdr, ...rest } = options;
  const headers = new Headers(hdr);
  const token = skipAuth ? null : await getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (
    rest.body &&
    !(rest.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...rest, headers });
  const text = await res.text();
  let json: unknown = null;
  let parsed = false;
  if (text) {
    try {
      json = JSON.parse(text);
      parsed = true;
    } catch {
      parsed = false;
    }
  }

  if (res.status === 401) await clearTokens();

  if (!res.ok) {
    if (!parsed) {
      throw new ApiError(humanizeNonJsonBody(text, res.status), res.status);
    }
    throw new ApiError(formatErrorMessage(json, res.status), res.status, json);
  }

  if (text && !parsed) {
    throw new ApiError(humanizeNonJsonBody(text, res.status), res.status);
  }

  if (json === null || json === undefined) return undefined as T;
  return parseResponse<T>(json);
}

const JWT_PARTS = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;

function isJwtLike(s: string): boolean {
  return s.length > 30 && JWT_PARTS.test(s.trim());
}

function pickAccess(o: Record<string, unknown>): string | undefined {
  const keys = [
    'access',
    'access_token',
    'token',
    'jwt',
    'auth_token',
    'key',
    'bearer',
  ];
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function pickRefresh(o: Record<string, unknown>): string | undefined {
  for (const k of ['refresh', 'refresh_token']) {
    const v = o[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Ищем JWT для доступа по имени поля (не берём первый токен в JSON — refresh часто идёт раньше access).
 */
function findAccessJwtByKey(obj: unknown, depth = 0): string | undefined {
  if (depth > 6 || obj == null) return undefined;
  if (typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    const kl = k.toLowerCase();
    if (kl.includes('refresh')) continue;
    if (
      typeof v === 'string' &&
      v.length > 0 &&
      (kl.includes('access') ||
        kl === 'token' ||
        kl.includes('jwt') ||
        kl.includes('auth') ||
        kl === 'key' ||
        kl.includes('bearer'))
    ) {
      if (isJwtLike(v) || v.length > 80) return v;
    }
    const inner = findAccessJwtByKey(v, depth + 1);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * Достаёт access (и при наличии refresh) из ответа POST /api/auth/verify/.
 * Поддерживает SimpleJWT, обёртки { success, data }, вложенные tokens и т.д.
 */
export function extractTokens(json: unknown): { access: string; refresh?: string } {
  const unwrapped = parseResponse<unknown>(json);

  if (typeof unwrapped === 'string' && isJwtLike(unwrapped)) {
    return { access: unwrapped.trim() };
  }

  if (!unwrapped || typeof unwrapped !== 'object') {
    throw new ApiError(
      'Сервер вернул успех, но тело ответа не JSON-объект. Покажите ответ API разработчику бэкенда.',
      200,
      json
    );
  }

  const body = unwrapped as Record<string, unknown>;
  let access = pickAccess(body);
  let refresh = pickRefresh(body);

  const nestKeys = ['data', 'tokens', 'auth', 'session', 'result', 'payload'];
  for (const nk of nestKeys) {
    const inner = body[nk];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      const o = inner as Record<string, unknown>;
      if (!access) access = pickAccess(o);
      if (!refresh) refresh = pickRefresh(o);
    }
  }

  const tokensRoot = body.tokens;
  if (tokensRoot && typeof tokensRoot === 'object' && !Array.isArray(tokensRoot)) {
    const t = tokensRoot as Record<string, unknown>;
    if (!access) access = pickAccess(t);
    if (!refresh) refresh = pickRefresh(t);
  }

  if (!access) access = findAccessJwtByKey(body);

  if (!access) {
    const keys =
      typeof unwrapped === 'object' && unwrapped !== null
        ? Object.keys(unwrapped as object).join(', ')
        : '';
    throw new ApiError(
      `Сервер не вернул access-токен в ожидаемом виде (поля верхнего уровня: ${keys || '—'}). Нужен пример JSON ответа verify от бэкенда.`,
      200,
      json
    );
  }

  return { access, refresh };
}
