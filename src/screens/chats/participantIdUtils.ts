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
