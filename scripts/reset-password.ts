// استعادة الوصول: إعادة تعيين كلمة مرور حساب من الخادم (يتطلب الوصول إلى الخادم نفسه).
//   npm run admin:reset-password -- --phone 07XXXXXXXXX [--disable-mfa]
import { openDatabase } from '../src/db/index.ts';
import { hashPassword, passwordProblem } from '../src/lib/password.ts';
import { normalizePhone } from '../src/lib/arabic.ts';
import { audit } from '../src/domain/audit.ts';
import { readSecret, loadEnvFile } from './util.ts';

loadEnvFile();
const args = process.argv.slice(2);
const phone = normalizePhone(args[args.indexOf('--phone') + 1] ?? '');
if (!args.includes('--phone') || !phone) { console.error('الاستخدام: npm run admin:reset-password -- --phone 07XXXXXXXXX [--disable-mfa]'); process.exit(1); }
const db = openDatabase(process.env.DATABASE_PATH || './data/dalil.db');
const user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as { id: number } | undefined;
if (!user) { console.error('لا يوجد حساب بهذا الرقم.'); process.exit(1); }
const password = process.env.NEW_PASSWORD || await readSecret('كلمة المرور الجديدة (لن تظهر): ');
const problem = passwordProblem(password, phone);
if (problem) { console.error(problem); process.exit(1); }
const disableMfa = args.includes('--disable-mfa');
db.prepare(`UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, status = CASE status WHEN 'disabled' THEN 'active' ELSE status END
  ${disableMfa ? ', totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL' : ''}, updated_at = unixepoch() WHERE id = ?`).run(await hashPassword(password), user.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
audit(db, { actorId: null, action: 'bootstrap.reset_password', targetType: 'user', targetId: user.id, meta: { via: 'cli', disableMfa } });
db.close();
console.log('تمت إعادة تعيين كلمة المرور وإنهاء كل جلسات الحساب.' + (disableMfa ? ' وتم إيقاف التحقق بخطوتين؛ فعّله مجدداً بعد الدخول.' : ''));
