/** Нормализация ID участника для сравнения (префикс user_ и т.п.). */
export function stripUserPrefix(s: string) {
  let t = s.trim();
  if (t.toLowerCase().startsWith('user_')) t = t.slice(5);
  return t;
}

export function sameParticipantId(a: string, b: string) {
  const x = stripUserPrefix(a);
  const y = stripUserPrefix(b);
  return x === y || a.trim() === b.trim();
}

/** Как в ChatManage: participant_ids массивом, JSON-массивом или через запятые. */
export function parseParticipantIds(raw: unknown): string[] {
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
