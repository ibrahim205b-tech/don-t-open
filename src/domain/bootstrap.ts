import type { DB } from '../db/index.ts';
import { hashPassword, passwordProblem } from '../lib/password.ts';
import { normalizePhone } from '../lib/arabic.ts';
import { audit } from './audit.ts';

export type BootstrapResult = { created: true; phone: string } | { created: false; reason: string };

/**
 * ينشئ أول «مدير عام» إذا لم يوجد مدير عام فعّال. آمن للتكرار: لا ينشئ مديراً ثانياً.
 * لا يطبع كلمة المرور ولا يسجلها.
 */
export async function bootstrapSuperAdmin(db: DB, input: { name?: string; phone?: string; password?: string }, via: string, force = false): Promise<BootstrapResult> {
  const existing = db.prepare("SELECT count(*) FROM users WHERE role = 'super_admin' AND status = 'active'").pluck().get() as number;
  if (existing > 0 && !force) return { created: false, reason: 'يوجد حساب مدير عام مسبقاً. لم يتم إنشاء حساب جديد.' };
  const name = (input.name ?? '').trim();
  const phone = normalizePhone(input.phone ?? '');
  if (name.length < 2 || name.length > 60) return { created: false, reason: 'ADMIN_NAME مطلوب (من ٢ إلى ٦٠ حرفاً).' };
  if (!phone) return { created: false, reason: 'ADMIN_PHONE يجب أن يكون رقماً عراقياً صحيحاً يبدأ بـ 07.' };
  const problem = passwordProblem(input.password ?? '', phone);
  if (problem) return { created: false, reason: `ADMIN_PASSWORD: ${problem}` };
  const hash = await hashPassword(input.password!);
  const user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as { id: number } | undefined;
  let id: number;
  if (user) {
    db.prepare("UPDATE users SET role = 'super_admin', status = 'active', password_hash = ?, updated_at = unixepoch() WHERE id = ?").run(hash, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    id = user.id;
  } else {
    id = Number(db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'super_admin')").run(name, phone, hash).lastInsertRowid);
  }
  audit(db, { actorId: null, action: 'bootstrap.super_admin', targetType: 'user', targetId: id, meta: { via, existingUser: !!user } });
  return { created: true, phone };
}
