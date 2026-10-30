import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { bootstrapSuperAdmin } from './domain/bootstrap.ts';

const cfg = loadConfig();
const app = await buildApp(cfg);

// تهيئة المدير الأول من متغيرات البيئة عند الإقلاع (للاستضافات التي لا توفر طرفية).
// لا تفعل شيئاً إذا وُجد مدير عام. احذف ADMIN_PASSWORD من الإعدادات بعد أول دخول.
if (process.env.ADMIN_PHONE && process.env.ADMIN_PASSWORD) {
  const r = await bootstrapSuperAdmin(app.db, { name: process.env.ADMIN_NAME, phone: process.env.ADMIN_PHONE, password: process.env.ADMIN_PASSWORD }, 'env');
  if (r.created) app.log.warn('Super admin created from environment variables. Remove ADMIN_PASSWORD from the environment now.');
  else app.log.info(`Admin bootstrap skipped: ${r.reason}`);
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
}

await app.listen({ host: cfg.host, port: cfg.port });
app.log.info(`Dalil Al-Maamil listening on ${cfg.baseUrl}`);
