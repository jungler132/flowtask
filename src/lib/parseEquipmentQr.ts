/** Извлечь QR ID из сырой строки (URL или plain text). */
export function parseEquipmentQrPayload(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  const pathMatch =
    s.match(/\/equipment\/qr\/([^/?#\s]+)/i) ?? s.match(/\/api\/equipment\/qr\/([^/?#\s]+)/i);
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]).trim();
    } catch {
      return pathMatch[1].trim();
    }
  }

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const fromQuery =
        u.searchParams.get('qr_id') ??
        u.searchParams.get('qr') ??
        u.searchParams.get('id');
      if (fromQuery?.trim()) return fromQuery.trim();
      const seg = u.pathname.split('/').filter(Boolean);
      const qrIdx = seg.findIndex((p) => p.toLowerCase() === 'qr');
      if (qrIdx >= 0 && seg[qrIdx + 1]) return decodeURIComponent(seg[qrIdx + 1]).trim();
    } catch {
      /* не URL */
    }
  }

  return s;
}
