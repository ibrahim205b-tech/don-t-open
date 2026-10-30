// بيانات تجريبية للتطوير فقط. كل عنوان يبدأ بـ «[تجريبي]» ولا يعمل هذا السكربت في بيئة الإنتاج.
import { openDatabase } from '../src/db/index.ts';
import { hashPassword } from '../src/lib/password.ts';
import { reindex } from '../src/domain/posts.ts';
import { normalizeArabic } from '../src/lib/arabic.ts';
import { loadEnvFile } from './util.ts';

loadEnvFile();
if (process.env.NODE_ENV === 'production') { console.error('هذا السكربت للتطوير فقط.'); process.exit(1); }
const db = openDatabase(process.env.DATABASE_PATH || './data/dalil.db');
if (db.prepare("SELECT 1 FROM posts WHERE title LIKE '[تجريبي]%'").get()) { console.log('البيانات التجريبية موجودة.'); process.exit(0); }

const pw = await hashPassword('demo-password-123');
const mk = (name: string, phone: string, role: string) => Number(db.prepare('INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name RETURNING id').pluck().get(name, phone, pw, role));
const author = mk('مستخدم تجريبي', '07000000001', 'user');
const mod = mk('مشرف تجريبي', '07000000002', 'moderator');
const cat = (section: string, name: string) => db.prepare('SELECT id FROM categories WHERE section = ? AND name = ?').pluck().get(section, name) as number;
const area = db.prepare("SELECT id FROM areas WHERE name = 'المعامل'").pluck().get() as number;

const demo: [string, string, string, string, number | null, Record<string, unknown>][] = [
  ['business', 'مطاعم', 'مطعم تجريبي للمشويات', 'مشويات وكباب وتكة. توصيل للمناطق القريبة.', null, { address: 'الشارع العام', hours: 'يومياً ١٢ الظهر - ١٢ بالليل', delivery: 'المعامل وما حولها' }],
  ['business', 'صيدليات', 'صيدلية تجريبية', 'أدوية ومستلزمات طبية.', null, { address: 'قرب السوق', hours: '٨ الصبح - ١١ بالليل' }],
  ['job', 'وظائف مطاعم', 'مطلوب عامل مطبخ', 'العمل بمطبخ مطعم، خبرة بسيطة.', 500000, { workplace: 'مطعم تجريبي', employment: 'full', work_hours: '٨ ساعات' }],
  ['property', 'بيوت للإيجار', 'بيت للإيجار ٢٠٠ متر', 'بيت طابقين، ٣ غرف نوم.', 400000, { offer: 'rent', size: 200 }],
  ['service', 'كهربائيون', 'كهربائي منازل', 'تأسيس وصيانة كهرباء منازل.', null, { work_areas: 'المعامل وبغداد الجديدة', experience: '١٠ سنوات' }],
  ['market', 'أثاث مستعمل', 'قنفات مستعملة بحالة جيدة', 'طقم قنفات ٧ مقاعد.', 250000, { condition: 'used' }],
  ['community', 'حملات نظافة', 'حملة تنظيف الحي يوم الجمعة', 'دعوة للمشاركة بحملة تطوعية.', null, { location: 'ساحة الحي', organizer: 'شباب المنطقة' }],
];
for (const [type, c, title, body, price, details] of demo) {
  const t = `[تجريبي] ${title}`;
  const id = Number(db.prepare("INSERT INTO posts (type, user_id, category_id, area_id, title, body, price, contact_phone, show_phone, whatsapp, details, status, title_key) VALUES (?, ?, ?, ?, ?, ?, ?, '07000000001', 1, 1, ?, 'pending', ?)")
    .run(type, author, cat(type, c), area, t, body, price, JSON.stringify(details), normalizeArabic(t)).lastInsertRowid);
  const exp = type === 'business' ? null : Math.floor(Date.now() / 1000) + 30 * 86400;
  db.prepare("UPDATE posts SET status = 'published', approved_by = ?, approved_at = unixepoch(), published_at = unixepoch(), expires_at = ? WHERE id = ?").run(mod, exp, id);
  reindex(db, id);
}
console.log('تمت إضافة بيانات تجريبية موسومة بـ [تجريبي]. الحسابات: 07000000001 / 07000000002 بكلمة المرور demo-password-123');
