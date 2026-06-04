import { ApiError } from '../api/client';

export type EquipmentFormState = {
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
};

export type EquipmentFormField = keyof EquipmentFormState;

export const EQUIPMENT_FIELD_LABELS: Record<EquipmentFormField, string> = {
  equipment_type: 'Тип',
  status: 'Статус',
  model_name: 'Модель',
  manufacturer: 'Производитель',
  serial_number: 'Серийный №',
  inventory_number: 'Инвентарный №',
  room: 'Кабинет',
  description: 'Описание',
  comment: 'Комментарий',
  MAC_address: 'MAC-адрес',
  port_number: 'Номер порта',
  internal_number: 'Внутренний №',
  tt_number: 'ТТ',
  hostname: 'Hostname',
  imei: 'IMEI',
  phone_number: 'Телефон',
  qr_id: 'QR ID',
  branch_value: 'Филиал',
  ip_assignment: 'IP (назначение)',
};

/** Поля, отмеченные * в форме создания. */
export const EQUIPMENT_REQUIRED_HINT =
  'Обязательные поля отмечены *. Укажите тип и хотя бы одно: модель, инвентарный или серийный номер.';

const IDENTIFIER_FIELDS: EquipmentFormField[] = [
  'model_name',
  'inventory_number',
  'serial_number',
];

function fieldMsg(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((x) => typeof x === 'string' && String(x).trim());
    if (typeof first === 'string') return first.trim();
  }
  return null;
}

function normalizeApiFieldKey(key: string): EquipmentFormField | null {
  const k = key.replace(/\[\d+\]/g, '').split('.').pop() ?? key;
  if (k in EQUIPMENT_FIELD_LABELS) return k as EquipmentFormField;
  if (k === 'mac_address') return 'MAC_address';
  if (k === 'branch' || k === 'branch_name') return 'branch_value';
  return null;
}

/** Ошибки полей из ответа API (DRF). */
export function parseEquipmentApiFieldErrors(body: unknown): Partial<Record<EquipmentFormField, string>> {
  const out: Partial<Record<EquipmentFormField, string>> = {};
  if (!body || typeof body !== 'object') return out;

  const walk = (obj: Record<string, unknown>, prefix = '') => {
    for (const [key, val] of Object.entries(obj)) {
      if (key === 'success') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        walk(val as Record<string, unknown>, path);
        continue;
      }
      const msg = fieldMsg(val);
      if (!msg) continue;
      const field = normalizeApiFieldKey(path);
      if (field) out[field] = msg;
    }
  };

  walk(body as Record<string, unknown>);
  return out;
}

export function equipmentApiNonFieldError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  return (
    fieldMsg(o.detail) ??
    fieldMsg(o.non_field_errors) ??
    fieldMsg(o.error) ??
    null
  );
}

export function mergeEquipmentErrors(
  local: Partial<Record<EquipmentFormField, string>>,
  api: Partial<Record<EquipmentFormField, string>>,
): Partial<Record<EquipmentFormField, string>> {
  return { ...local, ...api };
}

export function validateEquipmentForm(
  form: EquipmentFormState,
): Partial<Record<EquipmentFormField, string>> {
  const errors: Partial<Record<EquipmentFormField, string>> = {};

  if (!String(form.equipment_type ?? '').trim()) {
    errors.equipment_type = 'Выберите тип оборудования';
  }

  const hasIdentifier = IDENTIFIER_FIELDS.some((f) => String(form[f] ?? '').trim());
  if (!hasIdentifier) {
    const msg = 'Укажите модель, инвентарный или серийный номер';
    IDENTIFIER_FIELDS.forEach((f) => {
      errors[f] = msg;
    });
  }

  const room = form.room.trim();
  if (room.length > 50) errors.room = 'Не более 50 символов';

  const qr = form.qr_id.trim();
  if (qr.length > 50) errors.qr_id = 'Не более 50 символов';

  const model = form.model_name.trim();
  if (model.length > 200) errors.model_name = 'Не более 200 символов';

  const manufacturer = form.manufacturer.trim();
  if (manufacturer.length > 200) errors.manufacturer = 'Не более 200 символов';

  const inv = form.inventory_number.trim();
  if (inv.length > 100) errors.inventory_number = 'Не более 100 символов';

  const serial = form.serial_number.trim();
  if (serial.length > 100) errors.serial_number = 'Не более 100 символов';

  const ip = form.ip_assignment.trim();
  if (ip && !Number.isFinite(Number(ip))) {
    errors.ip_assignment = 'Укажите целое число';
  }

  const phone = form.phone_number.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length > 0 && digits.length < 10) {
      errors.phone_number = 'Некорректный номер телефона';
    }
  }

  const mac = form.MAC_address.trim();
  if (mac && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac)) {
    errors.MAC_address = 'Формат: AA:BB:CC:DD:EE:FF';
  }

  return errors;
}

export function errorsFromApiError(e: unknown): {
  fieldErrors: Partial<Record<EquipmentFormField, string>>;
  message: string | null;
} {
  if (!(e instanceof ApiError)) {
    return { fieldErrors: {}, message: e instanceof Error ? e.message : String(e) };
  }
  const fieldErrors = parseEquipmentApiFieldErrors(e.body);
  const message =
    equipmentApiNonFieldError(e.body) ??
    (Object.keys(fieldErrors).length === 0 ? e.message : null);
  return { fieldErrors, message };
}

export function isEquipmentFieldRequired(field: EquipmentFormField): boolean {
  if (field === 'equipment_type') return true;
  if (IDENTIFIER_FIELDS.includes(field)) return true;
  return false;
}
