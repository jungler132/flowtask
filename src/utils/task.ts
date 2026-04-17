import { Task } from '../api/tasksApi';

export function taskRouteId(t: Task): string {
  return String(t._id ?? t.id ?? '');
}

export function taskTitle(t: Task): string {
  return String(t.title ?? 'Без названия');
}
