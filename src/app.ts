import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import compress from '@fastify/compress';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Config } from './config.ts';
import { openDatabase, type DB } from './db/index.ts';
import { loadSession, SESSION_COOKIE, purgeExpiredSessions, type SessionRow } from './auth/sessions.ts';
import { csrfToken, csrfValid, ipHash } from './auth/csrf.ts';
import { bindOf } from './routes/form.ts';
import { loadSettings, type Settings } from './domain/settings.ts';
import { unreadCount } from './domain/notifications.ts';
import { expireDue } from './domain/workflow.ts';
import type { User } from './domain/types.ts';
import { layout, type PageMeta, type ViewCtx } from './views/layout.ts';
import { html, type SafeHtml } from './lib/html.ts';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from './lib/images.ts';
import { publicRoutes } from './routes/public.ts';
import { authRoutes } from './routes/auth.ts';
import { accountRoutes } from './routes/account.ts';
import { adminRoutes } from './routes/admin.ts';
import { mediaRoutes } from './routes/media.ts';

declare module 'fastify' {
  interface FastifyInstance { db: DB; cfg: Config }
  interface FastifyRequest {
    user: User | null;
    session: SessionRow | null;
    pendingMfa: { session: SessionRow; user: User } | null;
    anonId: string;
    settings: Settings;
    ipHash: string;
  }
  interface FastifyReply {
    page(req: FastifyRequest, meta: PageMeta, body: SafeHtml): FastifyReply;
    flashRedirect(url: string, kind: 'ok' | 'error', text: string): FastifyReply;
  }
}

const PUBLIC_DIR = path.join(import.meta.dirname, '..', 'public');

export function assetVersion(): string {
  const h = crypto.createHash('sha256');
  for (const f of ['css/app.css', 'js/app.js']) h.update(fs.readFileSync(path.join(PUBLIC_DIR, f)));
  return h.digest('hex').slice(0, 10);
}

export function csrfFor(app: FastifyInstance, req: FastifyRequest) {
  return csrfToken(app.cfg.sessionSecret, bindOf(req));
}


export function viewCtx(app: FastifyInstance, req: FastifyRequest, reply: FastifyReply, v: string): ViewCtx {
  let flash: ViewCtx['flash'] = null;
  const raw = req.cookies.flash ? req.unsignCookie(req.cookies.flash) : null;
  if (raw?.valid && raw.value) {
    try { const f = JSON.parse(raw.value); if ((f.k === 'ok' || f.k === 'error') && typeof f.t === 'string') flash = { kind: f.k, text: f.t.slice(0, 300) }; } catch { /* تجاهل */ }
    reply.clearCookie('flash', { path: '/' });
  }
  return {
    user: req.user, settings: req.settings, csrf: csrfFor(app, req), path: req.url.split('?')[0], baseUrl: app.cfg.baseUrl,
    v, unread: req.user ? unreadCount(app.db, req.user.id) : 0, flash,
  };
}

export async function buildApp(cfg: Config, opts: { db?: DB; logger?: boolean; jobs?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : {
      level: cfg.env === 'production' ? 'info' : 'warn',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    trustProxy: cfg.trustProxy,
    bodyLimit: 256 * 1024,
    routerOptions: { maxParamLength: 120 },
  });
  const db = opts.db ?? openDatabase(cfg.databasePath);
  app.decorate('db', db);
  app.decorate('cfg', cfg);
  const v = assetVersion();
  const origin = new URL(cfg.baseUrl).origin;

  await app.register(compress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] });
  await app.register(cookie, { secret: cfg.sessionSecret });
  await app.register(formbody, { bodyLimit: 64 * 1024 });
  await app.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES, fields: 60, fieldSize: 8 * 1024, parts: 70, headerPairs: 200 },
  });
  await app.register(rateLimit, {
    global: true, max: cfg.env === 'test' ? 10_000 : 300, timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: 'Too Many Requests', message: `طلبات كثيرة بوقت قصير. حاول بعد ${Math.ceil(ctx.ttl / 1000)} ثانية.` }),
  });
  await app.register(fastifyStatic, {
    root: PUBLIC_DIR, prefix: '/static/', index: false, dotfiles: 'deny', cacheControl: false,
    setHeaders: (reply, filePath) => {
      // css/js تُطلب دائماً مع ?v=<بصمة المحتوى>، لذلك يمكن تخزينها سنة كاملة
      reply.header('Cache-Control', /\.(css|js)$/.test(filePath) ? 'public, max-age=31536000, immutable' : 'public, max-age=2592000');
    },
  });

  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  app.decorateRequest('pendingMfa', null);
  app.decorateRequest('anonId', '');
  app.decorateRequest('ipHash', '');
  app.decorateRequest('settings', null as unknown as Settings);

  app.decorateReply('page', function (this: FastifyReply, req: FastifyRequest, meta: PageMeta, body: SafeHtml) {
    const ctx = viewCtx(app, req, this, v);
    this.header('Content-Type', 'text/html; charset=utf-8');
    if (req.user || meta.noindex) this.header('Cache-Control', 'private, no-store');
    return this.send(layout(ctx, meta, body));
  });
  app.decorateReply('flashRedirect', function (this: FastifyReply, url: string, kind: 'ok' | 'error', text: string) {
    this.setCookie('flash', JSON.stringify({ k: kind, t: text }), { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, signed: true, maxAge: 60 });
    return this.redirect(url, 303);
  });

  app.addHook('onRequest', async (req, reply) => {
    req.settings = loadSettings(db);
    req.ipHash = ipHash(cfg.sessionSecret, req.ip);
    const aid = req.cookies.aid;
    if (aid && /^[A-Za-z0-9_-]{22}$/.test(aid)) req.anonId = aid;
    else {
      req.anonId = crypto.randomBytes(16).toString('base64url');
      reply.setCookie('aid', req.anonId, { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.cookieSecure, maxAge: 365 * 86400 });
    }
    const loaded = loadSession(db, req.cookies[SESSION_COOKIE]);
    if (loaded) {
      if (loaded.session.mfa_passed) { req.user = loaded.user; req.session = loaded.session; }
      else req.pendingMfa = loaded;
    }
    // حماية CSRF الأولى: كل طلب يغيّر البيانات يجب أن يأتي من نفس أصل الموقع.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const o = req.headers.origin;
      const ref = req.headers.referer;
      const sameOrigin = o ? o === origin : typeof ref === 'string' && (ref === origin || ref.startsWith(origin + '/'));
      if (!sameOrigin) {
        reply.code(403).type('text/plain; charset=utf-8').send('طلب مرفوض: مصدر غير موثوق.');
        return reply;
      }
    }
  });

  // حماية CSRF الثانية: رمز مرتبط بالجلسة لكل نموذج. نماذج رفع الملفات تتحقق منه داخل المعالج.
  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.isMultipart()) return;
    const token = (req.body as Record<string, unknown> | undefined)?._csrf;
    if (!csrfValid(cfg.sessionSecret, bindOf(req), token)) {
      reply.code(403);
      return reply.page(req, { title: 'انتهت صلاحية النموذج', noindex: true }, html`<div class="wrap narrow"><h1>انتهت صلاحية النموذج</h1><p>ارجع للصفحة السابقة وحدّثها ثم حاول مرة ثانية.</p></div>`);
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; manifest-src 'self'");
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (cfg.cookieSecure) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.url.startsWith('/admin') || req.url.startsWith('/account')) reply.header('X-Robots-Tag', 'noindex, nofollow');
    return payload;
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).page(req, { title: 'الصفحة غير موجودة', noindex: true, canonical: null }, html`<div class="wrap narrow">
      <h1>الصفحة غير موجودة</h1><p>الرابط غير صحيح أو أن المحتوى حُذف أو انتهت مدته.</p>
      <p><a class="btn btn-primary" href="/">الرجوع للرئيسية</a> <a class="btn" href="/search">البحث في الدليل</a></p></div>`);
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    const msg = status === 413 || err.code === 'FST_REQ_FILE_TOO_LARGE' ? 'حجم الطلب أو الملف أكبر من المسموح (٥ ميغابايت للصورة).'
      : status === 429 ? err.message
      : status === 400 ? 'الطلب غير صالح.'
      : status < 500 ? 'تعذّر تنفيذ الطلب.' : 'صار خطأ غير متوقع. حاول مرة ثانية بعد قليل.';
    const code = err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_FILES_LIMIT' || err.code === 'FST_PARTS_LIMIT' ? 413 : status;
    reply.code(code);
    if (!req.settings) req.settings = loadSettings(db);
    return reply.page(req, { title: 'تعذّر تنفيذ الطلب', noindex: true, canonical: null }, html`<div class="wrap narrow"><h1>تعذّر تنفيذ الطلب</h1><p>${msg}</p><p><a class="btn" href="/">الرئيسية</a></p></div>`);
  });

  await app.register(publicRoutes);
  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(adminRoutes);
  await app.register(mediaRoutes);

  if (opts.jobs !== false) {
    const tick = () => { try { expireDue(db); purgeExpiredSessions(db); } catch (e) { app.log.error(e); } };
    tick();
    const timer = setInterval(tick, 10 * 60 * 1000);
    timer.unref();
    app.addHook('onClose', async () => clearInterval(timer));
  }
  if (!opts.db) app.addHook('onClose', async () => db.close());
  return app;
}
