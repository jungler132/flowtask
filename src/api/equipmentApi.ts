import { apiFetch } from './client';

export type Equipment = Record<string, unknown>;

export type EquipmentListParams = {
  page?: number;
  limit?: number;
  search?: string;
  equipment_type?: string;
  status?: string;
  branch?: string;
  room?: string;
  ordering?: string;
};

function qs(params: Record<string, unknown>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function normalizeEquipmentList(data: unknown): Equipment[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as Equipment[];
  const o = data as Record<string, unknown>;
  if (Array.isArray(o.results)) return o.results as Equipment[];
  if (typeof o.id !== 'undefined' || typeof o._id !== 'undefined') return [o as Equipment];
  return [];
}

export function equipmentId(eq: Equipment): string {
  const id = eq.id ?? eq._id;
  if (id == null || id === '') return '';
  return String(id).trim();
}

export function equipmentTitle(eq: Equipment): string {
  const model = String(eq.model_name ?? '').trim();
  if (model) return model;
  const inv = String(eq.inventory_number ?? '').trim();
  if (inv) return `Инв. ${inv}`;
  const serial = String(eq.serial_number ?? '').trim();
  if (serial) return `S/N ${serial}`;
  const id = equipmentId(eq);
  return id ? `Оборудование #${id}` : 'Оборудование';
}

export function equipmentSubtitle(eq: Equipment): string {
  const parts: string[] = [];
  const type = String(eq.equipment_type_display ?? eq.equipment_type ?? '').trim();
  if (type) parts.push(String(eq.equipment_type_display ?? type));
  const room = String(eq.room ?? '').trim();
  if (room) parts.push(`каб. ${room}`);
  const branch = String(eq.branch_value ?? eq.branch_name ?? '').trim();
  if (branch) parts.push(branch);
  return parts.join(' · ') || '—';
}

/** GET /api/equipment/ */
export async function fetchEquipmentPage(params: EquipmentListParams = {}) {
  return apiFetch<{
    count?: number;
    next?: string | null;
    previous?: string | null;
    results?: Equipment[];
    page?: number;
    pages?: number;
  }>(`/api/equipment/${qs(params as Record<string, unknown>)}`);
}

/** GET /api/equipment/{id}/ */
export async function fetchEquipment(id: string | number) {
  return apiFetch<Equipment>(`/api/equipment/${encodeURIComponent(String(id))}/`);
}

/** GET /api/equipment/qr/{qr_id}/ */
export async function fetchEquipmentByQr(qrId: string) {
  const q = encodeURIComponent(qrId.trim());
  return apiFetch<Equipment>(`/api/equipment/qr/${q}/`);
}

/** POST /api/equipment/ */
export async function createEquipment(body: Record<string, unknown>) {
  return apiFetch<Equipment>('/api/equipment/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** PATCH /api/equipment/{id}/ */
export async function patchEquipment(id: string | number, body: Record<string, unknown>) {
  return apiFetch<Equipment>(`/api/equipment/${encodeURIComponent(String(id))}/`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** PUT /api/equipment/{id}/ */
export async function replaceEquipment(id: string | number, body: Record<string, unknown>) {
  return apiFetch<Equipment>(`/api/equipment/${encodeURIComponent(String(id))}/`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** DELETE /api/equipment/{id}/ */
export async function deleteEquipment(id: string | number) {
  await apiFetch(`/api/equipment/${encodeURIComponent(String(id))}/`, { method: 'DELETE' });
}

/** Собрать тело для create/update из формы. */
export function buildEquipmentPayload(form: {
  equipment_type: string;
  status: string;
  model_name: string;
  manufacturer: string;
  serial_number: string;
  inventory_number: string;
  room: string;
  description: string;
  comment: string;
  MAC_address: string;
  port_number: string;
  internal_number: string;
  tt_number: string;
  hostname: string;
  imei: string;
  phone_number: string;
  qr_id: string;
  branch_value: string;
  ip_assignment: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    equipment_type: form.equipment_type || 'other',
    status: form.status || 'working',
    model_name: form.model_name.trim(),
    manufacturer: form.manufacturer.trim(),
    serial_number: form.serial_number.trim(),
    inventory_number: form.inventory_number.trim(),
    room: form.room.trim(),
    description: form.description.trim(),
    comment: form.comment.trim(),
    MAC_address: form.MAC_address.trim(),
    port_number: form.port_number.trim(),
    internal_number: form.internal_number.trim(),
    tt_number: form.tt_number.trim(),
    hostname: form.hostname.trim(),
    imei: form.imei.trim(),
    phone_number: form.phone_number.trim(),
    qr_id: form.qr_id.trim(),
    branch_value: form.branch_value.trim() || null,
  };
  const ip = form.ip_assignment.trim();
  if (ip) {
    const n = Number(ip);
    body.ip_assignment = Number.isFinite(n) ? n : null;
  } else {
    body.ip_assignment = null;
  }
  return body;
}

export function equipmentToForm(eq: Equipment) {
  return {
    equipment_type: String(eq.equipment_type ?? 'other'),
    status: String(eq.status ?? 'working'),
    model_name: String(eq.model_name ?? ''),
    manufacturer: String(eq.manufacturer ?? ''),
    serial_number: String(eq.serial_number ?? ''),
    inventory_number: String(eq.inventory_number ?? ''),
    room: String(eq.room ?? ''),
    description: String(eq.description ?? ''),
    comment: String(eq.comment ?? ''),
    MAC_address: String(eq.MAC_address ?? eq.mac_address ?? ''),
    port_number: String(eq.port_number ?? ''),
    internal_number: String(eq.internal_number ?? ''),
    tt_number: String(eq.tt_number ?? ''),
    hostname: String(eq.hostname ?? ''),
    imei: String(eq.imei ?? ''),
    phone_number: String(eq.phone_number ?? ''),
    qr_id: String(eq.qr_id ?? ''),
    branch_value: String(eq.branch_value ?? eq.branch_name ?? ''),
    ip_assignment: eq.ip_assignment != null && eq.ip_assignment !== '' ? String(eq.ip_assignment) : '',
  };
}
