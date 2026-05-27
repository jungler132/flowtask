import type { UserProfile } from '../api/authApi';

/** IT-отдел и администраторы (newapiflowtask, MOBILE_APP_TECHNICAL_SPEC §5.13). */
export function canManageEquipment(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role ?? '').toLowerCase();
  if (role === 'admin') return true;
  const o = user as Record<string, unknown>;
  if (o.is_service === true || o.is_service === 'true') return true;
  return false;
}
