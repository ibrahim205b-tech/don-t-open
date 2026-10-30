// تهيئة أول حساب «مدير عام» بشكل آمن وقابل للتكرار.
//   ADMIN_NAME="..." ADMIN_PHONE="07..." npm run admin:create
// كلمة المرور تُقرأ من ADMIN_PASSWORD أو تُطلب بشكل مخفي في الطرفية. لا تُطبع ولا تُسجَّل.
// إذا وُجد مدير عام مسبقاً لا يُنشأ حساب جديد (إلا مع --add لإضافة مدير عام ثانٍ عمداً).
import { openDatabase } from '../src/db/index.ts';
import { hashPassword, passwordProblem } from '../src/lib/password.ts';
import { normalizePhone } from '../src/lib/arabic.ts';
import { audit } from '../src/domain/audit.ts';
import { readSecret, loadEnvFile } from './util.ts';

loadEnvFile();
const db = openDatabase(process.env.DATABASE_PATH || './data/dalil.db');
const add = process.argv.includes('--add');

const existing = db.prepare("SELECT count(*) FROM users WHERE role = 'super_admin' AND status = 'active'").pluck().get() as number;
if (existing > 0 && !add) {
  console.log('يوجد حساب مدير عام مسبقاً. لم يتم إنشاء حساب جديد.');
  console.log('لإعادة تعيين كلمة مرور مدير موجود: npm run admin:reset-password -- --phone 07XXXXXXXXX');
  process.exit(0);
}

const name = (process.env.ADMIN_NAME || '').trim();
const phone = normalizePhone(process.env.ADMIN_PHONE || '');
if (name.length < 2 || name.length > 60) { console.error('حدد ADMIN_NAME (من ٢ إلى ٦٠ حرفاً).'); process.exit(1); }
if (!phone) { console.error('حدد ADMIN_PHONE برقم عراقي صحيح يبدأ بـ 07.'); process.exit(1); }

const password = process.env.ADMIN_PASSWORD || await readSecret('كلمة المرور الجديدة للمدير (لن تظهر): ');
const problem = passwordProblem(password, phone);
if (problem) { console.error(problem); process.exit(1); }
if (!process.env.ADMIN_PASSWORD) {
  const again = await readSecret('أعد كتابة كلمة المرور: ');
  if (again !== password) { console.error('كلمتا المرور غير متطابقتين.'); process.exit(1); }
}

const user = db.prepare('SELECT id, role FROM users WHERE phone = ?').get(phone) as { id: number; role: string } | undefined;
const hash = await hashPassword(password);
let id: number;
if (user) {
  db.prepare("UPDATE users SET role = 'super_admin', status = 'active', password_hash = ?, updated_at = unixepoch() WHERE id = ?").run(hash, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  id = user.id;
} else {
  id = Number(db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'super_admin')").run(name, phone, hash).lastInsertRowid);
}
audit(db, { actorId: null, action: 'bootstrap.super_admin', targetType: 'user', targetId: id, meta: { via: 'cli', existingUser: !!user } });
db.close();
console.log(`تم تجهيز حساب المدير العام (رقم ${phone}). سجّل الدخول من /login ثم فعّل التحقق بخطوتين.`);
