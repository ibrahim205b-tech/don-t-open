import type { Role } from '../domain/types.ts';

const STAFF: Role[] = ['super_admin', 'admin', 'moderator'];
const ADMINS: Role[] = ['super_admin', 'admin'];

const PERMISSIONS = {
  'admin.access': STAFF,
  'posts.moderate': STAFF,
  'posts.official': STAFF,
  'posts.remove': ADMINS,
  'posts.verify': ADMINS,
  'reviews.moderate': STAFF,
  'reports.handle': STAFF,
  'claims.review': ADMINS,
  'users.manage': ADMINS,
  'catalog.manage': ADMINS,
  'featured.manage': ADMINS,
  'settings.manage': ADMINS,
  'audit.view': ADMINS,
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, perm: Permission): boolean {
  return !!role && (PERMISSIONS[perm] as Role[]).includes(role);
}

export const isStaff = (role: Role | undefined | null) => !!role && STAFF.includes(role);

const RANK: Record<Role, number> = { user: 0, business_owner: 1, moderator: 2, admin: 3, super_admin: 4 };

/** الأدوار التي يستطيع المنفّذ منحها. لا أحد يمنح super_admin من الواجهة (يُنشأ فقط عبر سكربت التهيئة). */
export function assignableRoles(actor: Role): Role[] {
  if (actor === 'super_admin') return ['admin', 'moderator', 'business_owner', 'user'];
  if (actor === 'admin') return ['moderator', 'business_owner', 'user'];
  return [];
}

/** يستطيع المنفّذ إدارة حساب آخر فقط إذا كانت رتبته أعلى، ولا يدير حسابه هو. */
export function canManageUser(actor: { id: number; role: Role }, target: { id: number; role: Role }): boolean {
  return actor.id !== target.id && can(actor.role, 'users.manage') && RANK[actor.role] > RANK[target.role];
}
