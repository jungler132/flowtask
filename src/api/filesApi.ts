import { API_BASE } from '../config';
import { ApiError, parseResponse } from './client';
import { getAccessToken } from '../lib/storage';

export type FileUploadResult = {
  id: string;
  original_name?: string;
  mime_type?: string;
};

function pickUploadId(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const o = data as Record<string, unknown>;
  if (typeof o.id === 'string') return o.id;
  return '';
}

/**
 * POST /api/files/upload/ — поле form-data `file`.
 */
export async function uploadFile(
  uri: string,
  fileName: string,
  mimeType: string
): Promise<FileUploadResult> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append('file', {
    uri,
    name: fileName || 'upload.jpg',
    type: mimeType || 'image/jpeg',
  } as unknown as Blob);

  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}/api/files/upload/`, {
    method: 'POST',
    headers,
    body: form,
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError('Сервер вернул не JSON при загрузке файла', res.status);
    }
  }
  if (!res.ok) {
    if (json && typeof json === 'object') {
      const o = json as Record<string, unknown>;
      const msg =
        (typeof o.detail === 'string' && o.detail) ||
        (typeof o.message === 'string' && o.message) ||
        `Ошибка загрузки (${res.status})`;
      throw new ApiError(msg, res.status, json);
    }
    throw new ApiError(`Ошибка загрузки (${res.status})`, res.status);
  }

  const parsed = parseResponse<Record<string, unknown>>(json);
  const id = pickUploadId(parsed);
  if (!id) {
    throw new ApiError('В ответе загрузки нет id файла', res.status, parsed);
  }
  return {
    id,
    original_name: typeof parsed.original_name === 'string' ? parsed.original_name : fileName,
    mime_type: typeof parsed.mime_type === 'string' ? parsed.mime_type : mimeType,
  };
}
