// تهيئة أول حساب «مدير عام» بشكل آمن وقابل للتكرار.
//   ADMIN_NAME="..." ADMIN_PHONE="07..." npm run admin:create
// كلمة المرور تُقرأ من ADMIN_PASSWORD أو تُطلب بشكل مخفي في الطرفية. لا تُطبع ولا تُسجَّل.
// إذا وُجد مدير عام مسبقاً لا يُنشأ حساب جديد (إلا مع --add لإضافة مدير عام ثانٍ عمداً).
import { openDatabase } from '../src/db/index.ts';
import { bootstrapSuperAdmin } from '../src/domain/bootstrap.ts';
import { readSecret, loadEnvFile } from './util.ts';

loadEnvFile();
const db = openDatabase(process.env.DATABASE_PATH || './data/dalil.db');
const add = process.argv.includes('--add');

if (!add && db.prepare("SELECT count(*) FROM users WHERE role = 'super_admin' AND status = 'active'").pluck().get()) {
  console.log('يوجد حساب مدير عام مسبقاً. لم يتم إنشاء حساب جديد.');
  console.log('لإعادة تعيين كلمة مرور مدير موجود: npm run admin:reset-password -- --phone 07XXXXXXXXX');
  process.exit(0);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await readSecret('كلمة المرور الجديدة للمدير (لن تظهر): ');
  if ((await readSecret('أعد كتابة كلمة المرور: ')) !== password) { console.error('كلمتا المرور غير متطابقتين.'); process.exit(1); }
}
const r = await bootstrapSuperAdmin(db, { name: process.env.ADMIN_NAME, phone: process.env.ADMIN_PHONE, password }, 'cli', add);
db.close();
if (!r.created) { console.error(r.reason); process.exit(1); }
console.log(`تم تجهيز حساب المدير العام (رقم ${r.phone}). سجّل الدخول من /login ثم فعّل التحقق بخطوتين.`);
