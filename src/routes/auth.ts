import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { now } from '../db/index.ts';
import { createSession, destroySession, SESSION_COOKIE } from '../auth/sessions.ts';
import { isStaff } from '../auth/rbac.ts';
import { dummyHash, hashPassword, passwordProblem, verifyPassword } from '../lib/password.ts';
import { verifyTotp } from '../lib/totp.ts';
import { normalizePhone } from '../lib/arabic.ts';
import { html } from '../lib/html.ts';
import { audit } from '../domain/audit.ts';
import { csrfInput } from './form.ts';
import { errorList, field } from '../views/components.ts';
import { safeNext } from './guards.ts';

const LOCK_AFTER = 5;
const LOCK_SECONDS = 15 * 60;
const GENERIC_LOGIN_ERROR = 'رقم الهاتف أو كلمة المرور غير صحيحة.';

interface UserRow { id: number; name: string; phone: string; role: string; status: string; password_hash: string; failed_logins: number; locked_until: number | null; totp_enabled: number; totp_secret: string | null; totp_last_step: number | null }

export async function authRoutes(app: FastifyInstance) {
  const db = app.db;
  const cookieOpts = (maxAge: number) => ({ path: '/', httpOnly: true, sameSite: 'lax' as const, secure: app.cfg.cookieSecure, maxAge });

  function startSession(reply: FastifyReply, req: FastifyRequest, user: UserRow, mfaPassed: boolean) {
    // تدوير الجلسة: أي جلسة سابقة على هذا المتصفح تُلغى قبل إنشاء جلسة جديدة
    if (req.session) destroySession(db, req.session.id);
    if (req.pendingMfa) destroySession(db, req.pendingMfa.session.id);
    const s = createSession(db, { id: user.id, role: user.role as never }, mfaPassed);
    reply.setCookie(SESSION_COOKIE, s.token, cookieOpts(s.maxAge));
  }

  const loginPage = (req: FastifyRequest, reply: FastifyReply, errors: string[] = [], phone = '', next = '') =>
    reply.page(req, { title: 'تسجيل الدخول', noindex: true }, html`<div class="wrap narrow">
      <h1>تسجيل الدخول</h1>
      ${errorList(errors)}
      <form method="post" action="/login" class="form" novalidate>
        ${csrfInput(req)}
        <input type="hidden" name="next" value="${next}">
        ${field({ name: 'phone', label: 'رقم الهاتف', value: phone, required: true, type: 'tel', dir: 'ltr', attrs: 'autocomplete="username" inputmode="tel"' })}
        ${field({ name: 'password', label: 'كلمة المرور', required: true, type: 'password', attrs: 'autocomplete="current-password"' })}
        <button class="btn btn-primary btn-block" type="submit">دخول</button>
      </form>
      <p>ما عندك حساب؟ <a href="/register">أنشئ حساباً</a></p>
      <p class="muted">نسيت كلمة المرور؟ تواصل مع الدعم على الرقم <a href="tel:${req.settings.support_phone}" dir="ltr">${req.settings.support_phone}</a> لإعادة تعيينها بعد التحقق من هويتك.</p>
    </div>`);

  app.get('/login', (req, reply) => {
    if (req.user) return reply.redirect('/account', 303);
    return loginPage(req, reply, [], '', safeNext((req.query as Record<string, string>).next));
  });

  app.post('/login', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const b = req.body as Record<string, string>;
    const phone = normalizePhone(String(b.phone ?? ''));
    const password = String(b.password ?? '');
    const next = safeNext(b.next);
    const user = phone ? (db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined) : undefined;
    if (!user) {
      await verifyPassword(password, await dummyHash()); // نفس زمن الرد تقريباً
      reply.code(401);
      return loginPage(req, reply, [GENERIC_LOGIN_ERROR], b.phone ?? '', next);
    }
    if (user.locked_until && user.locked_until > now()) {
      reply.code(429);
      return loginPage(req, reply, ['محاولات دخول كثيرة. حاول بعد ١٥ دقيقة.'], b.phone ?? '', next);
    }
    const ok = password.length <= 128 && (await verifyPassword(password, user.password_hash));
    if (!ok || user.status !== 'active') {
      if (!ok) {
        const fails = user.failed_logins + 1;
        db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails >= LOCK_AFTER ? 0 : fails, fails >= LOCK_AFTER ? now() + LOCK_SECONDS : null, user.id);
      }
      reply.code(401);
      return loginPage(req, reply, [GENERIC_LOGIN_ERROR], b.phone ?? '', next);
    }
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = unixepoch() WHERE id = ?').run(user.id);
    if (user.totp_enabled) {
      startSession(reply, req, user, false);
      return reply.redirect('/login/mfa?next=' + encodeURIComponent(next), 303);
    }
    startSession(reply, req, user, true);
    if (isStaff(user.role as never)) audit(db, { actorId: user.id, action: 'auth.login_admin', ipHash: req.ipHash });
    return reply.redirect(next, 303);
  });

  const mfaPage = (req: FastifyRequest, reply: FastifyReply, errors: string[] = [], next = '/account') =>
    reply.page(req, { title: 'التحقق بخطوتين', noindex: true }, html`<div class="wrap narrow">
      <h1>التحقق بخطوتين</h1>
      <p>اكتب الرمز المكوّن من ٦ أرقام من تطبيق المصادقة.</p>
      ${errorList(errors)}
      <form method="post" action="/login/mfa" class="form">
        ${csrfInput(req)}
        <input type="hidden" name="next" value="${next}">
        ${field({ name: 'code', label: 'الرمز', required: true, dir: 'ltr', attrs: 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}"' })}
        <button class="btn btn-primary btn-block" type="submit">تحقق</button>
      </form></div>`);

  app.get('/login/mfa', (req, reply) => {
    if (!req.pendingMfa) return reply.redirect('/login', 303);
    return mfaPage(req, reply, [], safeNext((req.query as Record<string, string>).next));
  });

  app.post('/login/mfa', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 10, timeWindow: '15 minutes' } } }, (req, reply) => {
    const pm = req.pendingMfa;
    if (!pm) return reply.redirect('/login', 303);
    const b = req.body as Record<string, string>;
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(pm.user.id) as UserRow;
    const step = u.totp_secret ? verifyTotp(u.totp_secret, String(b.code ?? '').trim(), u.totp_last_step) : null;
    if (step === null) {
      const fails = u.failed_logins + 1;
      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?').run(fails >= LOCK_AFTER ? 0 : fails, fails >= LOCK_AFTER ? now() + LOCK_SECONDS : null, u.id);
      if (fails >= LOCK_AFTER) { destroySession(db, pm.session.id); reply.clearCookie(SESSION_COOKIE, { path: '/' }); return reply.redirect('/login', 303); }
      reply.code(401);
      return mfaPage(req, reply, ['الرمز غير صحيح أو منتهي.'], safeNext(b.next));
    }
    db.prepare('UPDATE users SET totp_last_step = ?, failed_logins = 0 WHERE id = ?').run(step, u.id);
    startSession(reply, req, u, true);
    if (isStaff(u.role as never)) audit(db, { actorId: u.id, action: 'auth.login_admin', meta: { mfa: true }, ipHash: req.ipHash });
    return reply.redirect(safeNext(b.next), 303);
  });

  const registerPage = (req: FastifyRequest, reply: FastifyReply, errors: string[] = [], vals: Record<string, string> = {}) =>
    reply.page(req, { title: 'إنشاء حساب', noindex: true }, html`<div class="wrap narrow">
      <h1>إنشاء حساب</h1>
      <p>الحساب يخليك تنشر إعلاناتك وتتابع حالتها. رقم هاتفك ما يظهر لأحد إلا إذا اخترت إظهاره بإعلان.</p>
      ${errorList(errors)}
      <form method="post" action="/register" class="form" novalidate>
        ${csrfInput(req)}
        ${field({ name: 'name', label: 'الاسم', value: vals.name, required: true, max: 60, attrs: 'autocomplete="name"' })}
        ${field({ name: 'phone', label: 'رقم الهاتف', value: vals.phone, required: true, type: 'tel', dir: 'ltr', hint: 'مثال: 07701234567', attrs: 'autocomplete="tel" inputmode="tel"' })}
        ${field({ name: 'password', label: 'كلمة المرور', required: true, type: 'password', hint: '١٠ أحرف على الأقل. استخدم جملة يسهل عليك تذكرها.', attrs: 'autocomplete="new-password" minlength="10" maxlength="128"' })}
        <div class="check"><input type="checkbox" id="f-agree" name="agree" required><label for="f-agree">قرأت <a href="/policies/terms" target="_blank">شروط الاستخدام</a> و<a href="/policies/privacy" target="_blank">سياسة الخصوصية</a> وأوافق عليها</label></div>
        <button class="btn btn-primary btn-block" type="submit">إنشاء الحساب</button>
      </form>
      <p>عندك حساب؟ <a href="/login">سجّل الدخول</a></p></div>`);

  app.get('/register', (req, reply) => (req.user ? reply.redirect('/account', 303) : registerPage(req, reply)));

  app.post('/register', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    const b = req.body as Record<string, string>;
    const allowed = new Set(['_csrf', 'name', 'phone', 'password', 'agree']);
    if (Object.keys(b).some((k) => !allowed.has(k))) { reply.code(400); return registerPage(req, reply, ['النموذج يحتوي حقولاً غير مسموح بها.']); }
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
    const phone = normalizePhone(String(b.phone ?? ''));
    const password = String(b.password ?? '');
    const errors: string[] = [];
    if (name.length < 2 || name.length > 60 || /[<>]/.test(name)) errors.push('الاسم: من ٢ إلى ٦٠ حرفاً.');
    if (!phone) errors.push('رقم الهاتف: رقم عراقي يبدأ بـ 07 ويتكون من ١١ رقماً.');
    const pw = passwordProblem(password, phone ?? undefined);
    if (pw) errors.push(pw);
    if (b.agree !== 'on') errors.push('يجب الموافقة على الشروط وسياسة الخصوصية.');
    if (errors.length) { reply.code(400); return registerPage(req, reply, errors, { name, phone: b.phone ?? '' }); }
    const hash = await hashPassword(password);
    let userId: number;
    try {
      // الدور يُحدد هنا على الخادم فقط؛ لا يُقرأ أي دور من الطلب.
      userId = Number(db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, 'user')").run(name, phone, hash).lastInsertRowid);
    } catch (e) {
      if (String(e).includes('UNIQUE')) { reply.code(409); return registerPage(req, reply, ['هذا الرقم مسجل مسبقاً. سجّل الدخول، أو تواصل مع الدعم إذا نسيت كلمة المرور.'], { name, phone: b.phone ?? '' }); }
      throw e;
    }
    startSession(reply, req, { id: userId, role: 'user' } as UserRow, true);
    return reply.flashRedirect('/account', 'ok', 'تم إنشاء حسابك. تقدر تضيف إعلانك الآن.');
  });

  app.post('/logout', (req, reply) => {
    if (req.session) destroySession(db, req.session.id);
    if (req.pendingMfa) destroySession(db, req.pendingMfa.session.id);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.redirect('/', 303);
  });
}
