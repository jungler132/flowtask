/** Дата/время из ISO в вид «15 мая 2026, 13:28». */
export function formatDateTimeRu(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Относительная дата для списков: сегодня / вчера / полная дата. */
export function formatDateTimeShortRu(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86400000);

  const time = d.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `сегодня, ${time}`;
  if (diffDays === 1) return `вчера, ${time}`;
  if (diffDays < 7) {
    const weekday = d.toLocaleString('ru-RU', { weekday: 'long' });
    return `${weekday}, ${time}`;
  }
  return formatDateTimeRu(s);
}

/** Телефон +7 в привычном виде, иначе как есть. */
export function formatPhoneRu(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const d = digits.startsWith('8') ? `7${digits.slice(1)}` : digits;
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw;
}

const MULTILINE_LABEL_RE =
  /\s+(?=(?:Логин(?:\s+врача)?|Врач|HOSTNAME(?:\s+APM)?|Инв\.?(?:\s*№)?|Каб(?:инет)?|MAC(?:-адрес)?|S\/N|Серийный|Инвентарный|Комментарий|Описание)\s*:)/gi;

/**
 * Длинные слитные строки (комментарии с API) — переносы перед метками «Врач:», «Логин:» и т.п.
 */
export function formatReadableMultiline(value: unknown): string {
  let s = String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  if (!s) return '';

  s = s.replace(/[ \t]+/g, ' ');
  s = s.replace(MULTILINE_LABEL_RE, '\n');
  s = s.replace(/([а-яё])([А-ЯЁ][а-яёА-ЯЁ\s]{2,30}:)/g, '$1\n$2');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Одна строка без лишних пробелов. */
export function formatReadableLine(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
