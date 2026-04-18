import { resolveFileUrl } from './chatAttachments';

/**
 * Достаёт URL картинки аватара из объекта пользователя/сообщения (поля не задокументированы в OpenAPI).
 * Поддерживаются строки URL, относительные пути, вложенный объект с `url`/`id`, UUID файла.
 */
export function extractUserAvatarUrl(entity: unknown): string {
  if (!entity || typeof entity !== 'object') return '';
  const o = entity as Record<string, unknown>;

  const fromString = (raw: unknown): string => {
    if (typeof raw !== 'string') return '';
    const t = raw.trim();
    if (!t) return '';
    if (t.startsWith('http://') || t.startsWith('https://')) return t;
    return resolveFileUrl(t);
  };

  if (typeof o.avatar === 'string') {
    const u = fromString(o.avatar);
    if (u) return u;
  }

  for (const key of [
    'avatar_url',
    'avatarUrl',
    'photo_url',
    'photoUrl',
    'profile_picture_url',
    'picture_url',
    'image_url',
    'sender_avatar_url',
    'sender_photo_url',
  ]) {
    const u = fromString(o[key]);
    if (u) return u;
  }

  const nested = o.avatar ?? o.profile_picture ?? o.photo ?? o.sender_avatar;
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>;
    const u = fromString(n.url);
    if (u) return u;
    if (n.id != null) return extractUserAvatarUrl({ avatar_id: n.id });
  }

  return '';
}
