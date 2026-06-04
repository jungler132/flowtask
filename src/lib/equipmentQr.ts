/** Случайный QR ID (16 hex), как на существующих наклейках. */
export function generateEquipmentQrId(): string {
  let id = '';
  for (let i = 0; i < 16; i += 1) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

/** Значение для кодирования в QR — plain id, сканер приложения его понимает. */
export function buildEquipmentQrValue(qrId: string): string {
  return qrId.trim();
}

export type EquipmentQrCaption = {
  title: string;
  lines: string[];
  qrId: string;
};

export function equipmentQrCaptionFrom(
  eq: Record<string, unknown>,
  qrId: string,
): EquipmentQrCaption {
  const title =
    String(eq.model_name ?? '').trim() ||
    String(eq.inventory_number ?? '').trim() ||
    `Оборудование #${eq.id ?? ''}`;

  const lines: string[] = [];
  const type = String(eq.equipment_type_display ?? eq.equipment_type ?? '').trim();
  if (type) lines.push(type);

  const room = String(eq.room ?? '').trim();
  if (room) lines.push(`Кабинет ${room}`);

  const inv = String(eq.inventory_number ?? '').trim();
  if (inv) lines.push(`Инв. ${inv}`);

  const branch = String(eq.branch_name ?? eq.branch_value ?? '').trim();
  if (branch) lines.push(branch);

  return { title, lines, qrId: qrId.trim() };
}
