export type EquipmentType =
  | 'printer'
  | 'mfu'
  | 'monitor'
  | 'system_unit'
  | 'monoblock'
  | 'arm_emias'
  | 'printer_emias'
  | 'arm_ps'
  | 'tablet'
  | 'micro'
  | 'phone'
  | 'other';

export type EquipmentStatus = 'working' | 'not_working' | 'written_off' | 'transferred' | '';

const TYPE_LABELS: Record<string, string> = {
  printer: 'Принтер',
  mfu: 'МФУ',
  monitor: 'Монитор',
  system_unit: 'Системный блок',
  monoblock: 'Моноблок',
  arm_emias: 'АРМ ЕМИАС',
  printer_emias: 'Принтер ЕМИАС',
  arm_ps: 'АРМ ПС',
  tablet: 'Планшет',
  micro: 'Микрофон',
  phone: 'Телефон',
  other: 'Другое',
};

const STATUS_LABELS: Record<string, string> = {
  working: 'Исправно',
  not_working: 'Неисправно',
  written_off: 'Списано',
  transferred: 'Передано',
  '': 'Не указано',
};

export const EQUIPMENT_TYPE_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: 'printer', label: 'Принтер' },
  { value: 'mfu', label: 'МФУ' },
  { value: 'monitor', label: 'Монитор' },
  { value: 'system_unit', label: 'Системный блок' },
  { value: 'monoblock', label: 'Моноблок' },
  { value: 'arm_emias', label: 'АРМ ЕМИАС' },
  { value: 'printer_emias', label: 'Принтер ЕМИАС' },
  { value: 'arm_ps', label: 'АРМ ПС' },
  { value: 'tablet', label: 'Планшет' },
  { value: 'micro', label: 'Микрофон' },
  { value: 'phone', label: 'Телефон' },
  { value: 'other', label: 'Другое' },
];

export const EQUIPMENT_STATUS_OPTIONS: { value: EquipmentStatus; label: string }[] = [
  { value: 'working', label: 'Исправно' },
  { value: 'not_working', label: 'Неисправно' },
  { value: 'transferred', label: 'Передано' },
  { value: 'written_off', label: 'Списано' },
  { value: '', label: 'Не указано' },
];

export function equipmentTypeLabel(v: string): string {
  const s = TYPE_LABELS[v] ?? v;
  return s || '—';
}

export function equipmentStatusLabel(v: string): string {
  const s = STATUS_LABELS[v] ?? v;
  return s || '—';
}

export function equipmentStatusColorKey(
  status: string
): 'success' | 'danger' | 'muted' | 'warning' {
  switch (status) {
    case 'working':
      return 'success';
    case 'not_working':
      return 'danger';
    case 'written_off':
      return 'muted';
    case 'transferred':
      return 'warning';
    default:
      return 'muted';
  }
}
