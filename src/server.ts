import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';

const cfg = loadConfig();
const app = await buildApp(cfg);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
}

await app.listen({ host: cfg.host, port: cfg.port });
app.log.info(`دليل المعامل يعمل على ${cfg.baseUrl}`);
