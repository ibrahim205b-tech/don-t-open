// نسخة احتياطية متسقة لقاعدة البيانات (SQLite online backup) مع الصور المرفوعة.
//   npm run backup            → backups/dalil-YYYYMMDD-HHMMSS/
// الاستعادة موثقة في docs/BACKUP.md
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { loadEnvFile } from './util.ts';

loadEnvFile();
const dbPath = path.resolve(process.env.DATABASE_PATH || './data/dalil.db');
const uploads = path.resolve(process.env.UPLOAD_DIR || './data/uploads');
const root = path.resolve(process.env.BACKUP_DIR || './backups');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const dest = path.join(root, `dalil-${stamp}`);
fs.mkdirSync(dest, { recursive: true, mode: 0o700 });

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
await db.backup(path.join(dest, 'dalil.db'));
db.close();
if (fs.existsSync(uploads)) fs.cpSync(uploads, path.join(dest, 'uploads'), { recursive: true });

// النسخة ملف واحد مستقل (بلا ملفات -wal/-shm) ثم فحص سلامتها
const check = new Database(path.join(dest, 'dalil.db'));
check.pragma('journal_mode = DELETE');
const ok = check.pragma('integrity_check', { simple: true });
check.close();
if (ok !== 'ok') { console.error('فشل فحص سلامة النسخة الاحتياطية:', ok); process.exit(1); }

const keep = Number(process.env.BACKUP_KEEP || 14);
const all = fs.readdirSync(root).filter((d) => d.startsWith('dalil-')).sort();
for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(root, old), { recursive: true, force: true });
console.log(`تم حفظ النسخة الاحتياطية في ${dest}`);
