/** Человекочитаемые подписи для enum-полей задач и чатов (API остаётся на англ. ключах). */

import { colors } from '../theme';

export const TASK_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'todo', label: 'Не начата' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'transferred', label: 'Передана' },
  { value: 'completed', label: 'Выполнена' },
  { value: 'failed', label: 'Не выполнена' },
  { value: 'paused', label: 'На паузе' },
];

export const TASK_PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'urgent', label: 'Срочно' },
];

export const TASK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'single', label: 'Один исполнитель' },
  { value: 'multiple', label: 'Несколько исполнителей' },
];

const statusMap = Object.fromEntries(TASK_STATUS_OPTIONS.map((o) => [o.value, o.label]));
const priorityMap = Object.fromEntries(TASK_PRIORITY_OPTIONS.map((o) => [o.value, o.label]));
const taskTypeMap = Object.fromEntries(TASK_TYPE_OPTIONS.map((o) => [o.value, o.label]));

export function taskStatusLabelRu(value: string | undefined | null): string {
  const v = String(value ?? '').trim();
  return (statusMap[v] ?? v) || '—';
}

export function taskPriorityLabelRu(value: string | undefined | null): string {
  const v = String(value ?? '').trim();
  return (priorityMap[v] ?? v) || '—';
}

/** Цвет тонкой обводки карточки задачи в списке */
export function taskPriorityBorderColor(value: string | undefined | null): string {
  const v = String(value ?? '').trim().toLowerCase();
  switch (v) {
    case 'low':
      return '#22c55e';
    case 'medium':
      return '#eab308';
    case 'high':
      return '#ef4444';
    case 'urgent':
      return '#b91c1c';
    default:
      return colors.border;
  }
}

/** Обводка списка: чуть толще, если приоритет известен API */
export function taskPriorityRowBorder(value: string | undefined | null): {
  borderColor: string;
  borderWidth: number;
} {
  const v = String(value ?? '').trim().toLowerCase();
  const known = v === 'low' || v === 'medium' || v === 'high' || v === 'urgent';
  return {
    borderColor: taskPriorityBorderColor(value),
    borderWidth: known ? 2 : 1,
  };
}

export function taskTypeLabelRu(value: string | undefined | null): string {
  const v = String(value ?? '').trim();
  return (taskTypeMap[v] ?? v) || '—';
}

const CHAT_TYPE_MAP: Record<string, string> = {
  private: 'Личный',
  group: 'Групповой',
  task: 'По задаче',
};

export function chatTypeLabelRu(value: string | undefined | null): string {
  const v = String(value ?? '').trim().toLowerCase();
  return (CHAT_TYPE_MAP[v] ?? String(value ?? '').trim()) || '—';
}

/** Короткая дата/время для ленты активности */
export function formatActivityTime(iso: string | undefined | null): string {
  const s = String(iso ?? '').trim();
  if (!s) return '';
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}
