// اختبارات أمنية تقابل البنود ١–١٥ في المواصفات. تعمل على نسخة محلية معزولة من التطبيق فقط.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { Agent, BASE, createUser, jobForm, lastPostId, makeApp, pngImage, postStatus, PASSWORD } from './helpers.ts';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { openDatabase } from '../src/db/index.ts';

let app: FastifyInstance;
before(async () => { app = await makeApp(); });
after(async () => { await app.close(); });

async function publishedJob(title = 'وظيفة منشورة للاختبار') {
  const author = await createUser(app);
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(author.phone);
  await a.postMultipart('/submit/job', jobForm(app, title));
  const id = lastPostId(app);
  const m = new Agent(app); await m.login(mod.phone);
  await m.post(`/admin/posts/${id}/action`, { action: 'approve' });
  return { id, author, a, mod, m };
}

test('1. admin panel without login redirects to login', async () => {
  const anon = new Agent(app);
  for (const url of ['/admin', '/admin/queue', '/admin/users', '/admin/settings', '/admin/audit', '/admin/posts/1']) {
    const r = await anon.get(url);
    assert.equal(r.status, 303, url);
    assert.match(String(r.headers.location), /^\/login/);
  }
  const post = await anon.post('/admin/posts/1/action', { action: 'approve' });
  assert.equal(post.status, 401);
});

test('2. regular user and business owner cannot open the admin panel (and attempts are audited)', async () => {
  for (const role of ['user', 'business_owner'] as const) {
    const u = await createUser(app, role);
    const a = new Agent(app); await a.login(u.phone);
    for (const url of ['/admin', '/admin/queue', '/admin/users']) assert.equal((await a.get(url)).status, 403, `${role} ${url}`);
    assert.ok(app.db.prepare("SELECT 1 FROM audit_logs WHERE actor_id = ? AND result = 'denied'").get(u.id));
  }
});

test('3. approving without permission fails and leaves the post pending', async () => {
  const author = await createUser(app);
  const other = await createUser(app);
  const a = new Agent(app); await a.login(author.phone);
  await a.postMultipart('/submit/job', jobForm(app, 'محاولة اعتماد ذاتي'));
  const id = lastPostId(app);
  for (const agent of [a, (() => { const x = new Agent(app); return x; })()]) {
    if (!agent.loggedIn) await agent.login(other.phone);
    assert.equal((await agent.post(`/admin/posts/${id}/action`, { action: 'approve' })).status, 403);
  }
  // صاحب المنشور لا يستطيع نشره عبر إجراءات المالك أيضاً
  await a.post(`/account/posts/${id}/action`, { action: 'approve' });
  assert.equal(postStatus(app, id), 'pending');
  // المشرف صاحب المنشور لا يعتمد منشوره
  const mod = await createUser(app, 'moderator');
  const m = new Agent(app); await m.login(mod.phone);
  await m.postMultipart('/submit/job', jobForm(app, 'منشور المشرف نفسه'));
  const own = lastPostId(app);
  await m.post(`/admin/posts/${own}/action`, { action: 'approve' });
  assert.equal(postStatus(app, own), 'pending', 'moderator cannot approve own post');
  // حماية قاعدة البيانات: محاولة نشر مباشرة من دون موافقة مستقلة ترفضها المشغّلات
  assert.throws(() => app.db.prepare("UPDATE posts SET status = 'published' WHERE id = ?").run(id), /approval/);
  assert.throws(() => app.db.prepare("UPDATE posts SET status = 'published', approved_by = ?, approved_at = unixepoch() WHERE id = ?").run(author.id, id), /approval/);
  assert.throws(() => app.db.prepare("UPDATE posts SET status = 'published', approved_by = ?, approved_at = unixepoch() WHERE id = ?").run(mod.id, own), /approval/);
  assert.throws(() => app.db.prepare("INSERT INTO posts (type, user_id, category_id, area_id, title, status) VALUES ('job', ?, 1, 1, 'مباشر', 'published')").run(author.id), /draft or pending/);
});

test('4. users cannot edit, manage or delete another user\'s post', async () => {
  const { id } = await publishedJob('منشور شخص آخر');
  const intruder = await createUser(app);
  const x = new Agent(app); await x.login(intruder.phone);
  assert.equal((await x.get(`/account/posts/${id}`)).status, 404);
  assert.equal((await x.get(`/account/posts/${id}/edit`)).status, 404);
  assert.equal((await x.postMultipart(`/account/posts/${id}/edit`, jobForm(app, 'تم الاختراق'))).status, 404);
  assert.equal((await x.post(`/account/posts/${id}/action`, { action: 'withdraw' })).status, 404);
  assert.equal(postStatus(app, id), 'published');
  assert.notEqual(app.db.prepare('SELECT title FROM posts WHERE id = ?').pluck().get(id), 'تم الاختراق');
});

test('5. role cannot be changed from requests', async () => {
  // حقل role في التسجيل مرفوض
  const anon = new Agent(app);
  const r = await anon.post('/register', { name: 'مخترق', phone: '07712345678', password: 'a-very-good-pass', agree: 'on', role: 'super_admin' });
  assert.equal(r.status, 400);
  assert.equal(app.db.prepare("SELECT count(*) FROM users WHERE phone = '07712345678'").pluck().get(), 0);
  // مستخدم عادي يحاول تغيير دوره أو دور غيره
  const u = await createUser(app);
  const a = new Agent(app); await a.login(u.phone);
  assert.equal((await a.post(`/admin/users/${u.id}/role`, { role: 'admin' })).status, 403);
  // حقول إضافية في نموذج المنشور (status/role/approved_by) مرفوضة
  const sneaky = await a.postMultipart('/submit/job', { ...jobForm(app, 'منشور بحالة مزورة'), status: 'published', approved_by: '1' });
  assert.equal(sneaky.status, 400);
  // المدير لا يمنح super_admin ولا admin، ولا يغيّر دوره
  const admin = await createUser(app, 'admin');
  const ad = new Agent(app); await ad.login(admin.phone);
  assert.equal((await ad.post(`/admin/users/${u.id}/role`, { role: 'super_admin' })).status, 403);
  assert.equal((await ad.post(`/admin/users/${u.id}/role`, { role: 'admin' })).status, 403);
  assert.equal((await ad.post(`/admin/users/${admin.id}/role`, { role: 'super_admin' })).status, 403);
  assert.equal(app.db.prepare('SELECT role FROM users WHERE id = ?').pluck().get(u.id), 'user');
  assert.equal(app.db.prepare('SELECT role FROM users WHERE id = ?').pluck().get(admin.id), 'admin');
  // ترقية مسموحة تُنهي جلسات الحساب المستهدف
  assert.equal((await ad.post(`/admin/users/${u.id}/role`, { role: 'moderator' })).status, 303);
  assert.equal((await a.get('/account')).status, 303, 'target session invalidated after role change');
  // المشرف لا يدير المستخدمين ولا الإعدادات
  const mod = await createUser(app, 'moderator');
  const m = new Agent(app); await m.login(mod.phone);
  assert.equal((await m.post(`/admin/users/${u.id}/status`, { status: 'disabled' })).status, 403);
  assert.equal((await m.post('/admin/settings', { site_name: 'تم التغيير' })).status, 403);
});

test('6. audit log is protected from unauthorised access and tampering', async () => {
  const mod = await createUser(app, 'moderator');
  const user = await createUser(app);
  for (const p of [mod, user]) {
    const a = new Agent(app); await a.login(p.phone);
    assert.equal((await a.get('/admin/audit')).status, 403);
  }
  const admin = await createUser(app, 'admin');
  const ad = new Agent(app); await ad.login(admin.phone);
  assert.equal((await ad.get('/admin/audit')).status, 200);
  assert.throws(() => app.db.prepare('UPDATE audit_logs SET action = ?').run('x'), /append-only/);
  assert.throws(() => app.db.prepare('DELETE FROM audit_logs').run(), /append-only/);
});

test('7. SQL injection attempts in search and forms are inert', async () => {
  await publishedJob('وظيفة عامة');
  const pending = await createUser(app);
  const p = new Agent(app); await p.login(pending.phone);
  await p.postMultipart('/submit/job', jobForm(app, 'سر غير منشور'));
  const anon = new Agent(app);
  const payloads = [`' OR 1=1 --`, `"; DROP TABLE posts; --`, `1) UNION SELECT password_hash FROM users --`, `* OR status:pending`, `NEAR(a b)`];
  for (const q of payloads) {
    for (const url of [`/search?q=${encodeURIComponent(q)}`, `/jobs?q=${encodeURIComponent(q)}&category=${encodeURIComponent(q)}&area=1%20OR%201=1`]) {
      const r = await anon.get(url);
      assert.equal(r.status, 200, url);
      assert.ok(!r.body.includes('سر غير منشور'));
      assert.ok(!r.body.includes('scrypt$'));
    }
  }
  assert.equal((await anon.login(`' OR '1'='1`, `' OR '1'='1`)).status, 401);
  assert.ok(app.db.prepare("SELECT count(*) FROM posts").pluck().get() as number > 0, 'tables intact');
});

test('8. XSS payloads in titles, descriptions and names are escaped', async () => {
  const xss = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
  const author = await createUser(app, 'user', 'اسم<script>alert(2)</script>');
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(author.phone);
  const r = await a.postMultipart('/submit/job', jobForm(app, `وظيفة ${xss}`.slice(0, 100), { body: xss, d_workplace: xss.slice(0, 140) }));
  assert.equal(r.status, 303, r.body.slice(0, 200));
  const id = lastPostId(app);
  const m = new Agent(app); await m.login(mod.phone);
  const adminView = await m.get(`/admin/posts/${id}`);
  await m.post(`/admin/posts/${id}/action`, { action: 'approve' });
  for (const body of [adminView.body, (await new Agent(app).get(`/jobs/${id}`)).body, (await new Agent(app).get('/jobs')).body, (await a.get('/account')).body]) {
    assert.ok(!body.includes('<script>alert'), 'no raw script tag');
    assert.ok(!body.includes('<img src=x'), 'no raw img tag');
  }
  assert.ok((await new Agent(app).get(`/jobs/${id}`)).body.includes('&lt;script&gt;'));
  const page = await new Agent(app).get(`/jobs/${id}`);
  assert.match(String(page.headers['content-security-policy']), /script-src 'self'/);
});

test('9. disallowed file types are rejected by content, not by name', async () => {
  const u = await createUser(app);
  const a = new Agent(app); await a.login(u.phone);
  const cases = [
    { filename: 'photo.jpg', type: 'image/jpeg', data: Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(200, ' ')) },
    { filename: 'logo.svg', type: 'image/svg+xml', data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>') },
    { filename: 'page.html', type: 'text/html', data: Buffer.from('<html><script>alert(1)</script></html>') },
    { filename: 'fake.png', type: 'image/png', data: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]) },
  ];
  for (const [i, f] of cases.entries()) {
    const r = await a.postMultipart('/submit/job', jobForm(app, `صورة مرفوضة ${i}`), [{ name: 'images', ...f }]);
    assert.equal(r.status, 400, f.filename);
  }
  assert.equal(app.db.prepare("SELECT count(*) FROM posts WHERE title LIKE 'صورة مرفوضة%'").pluck().get(), 0);
  // ملف بحقل غير متوقع
  const odd = await a.request('POST', '/submit/job', { multipart: (await import('./helpers.ts')).multipart({ _csrf: await a.token(), ...jobForm(app, 'حقل ملف غريب') }, [{ name: 'avatar', filename: 'a.png', type: 'image/png', data: await pngImage() }]) });
  assert.equal(odd.status, 400);
  // صورة صحيحة تُعاد ترميزها WebP باسم عشوائي
  const ok = await a.postMultipart('/submit/job', jobForm(app, 'صورة صحيحة'), [{ name: 'images', filename: '../../evil.png', type: 'image/png', data: await pngImage() }]);
  assert.equal(ok.status, 303);
  const file = app.db.prepare('SELECT file FROM post_images WHERE post_id = ?').pluck().get(lastPostId(app)) as string;
  assert.match(file, /^[0-9a-f]{32}\.webp$/);
  assert.equal(fs.readFileSync(path.join(app.cfg.uploadDir, file)).toString('latin1', 8, 12), 'WEBP');
});

test('10. oversized files and request bodies are refused', async () => {
  const u = await createUser(app);
  const a = new Agent(app); await a.login(u.phone);
  const big = Buffer.concat([await pngImage(), Buffer.alloc(6 * 1024 * 1024)]);
  const r = await a.postMultipart('/submit/job', jobForm(app, 'ملف كبير'), [{ name: 'images', filename: 'big.png', type: 'image/png', data: big }]);
  assert.equal(r.status, 413);
  const seven = await Promise.all(Array.from({ length: 7 }, () => pngImage()));
  const many = await a.postMultipart('/submit/job', jobForm(app, 'صور كثيرة'), seven.map((d, i) => ({ name: 'images', filename: `${i}.png`, type: 'image/png', data: d })));
  assert.ok([400, 413].includes(many.status), String(many.status));
  const huge = await a.post('/login', { phone: '0770', password: 'x'.repeat(300 * 1024) });
  assert.equal(huge.status, 413);
  assert.equal(app.db.prepare("SELECT count(*) FROM posts WHERE title IN ('ملف كبير', 'صور كثيرة')").pluck().get(), 0);
});

test('11. rapid repeated requests are rate limited and accounts lock after failed logins', async () => {
  const u = await createUser(app);
  const a = new Agent(app);
  for (let i = 0; i < 5; i++) await a.login(u.phone, 'wrong-password-' + i);
  const locked = await a.login(u.phone, PASSWORD);
  assert.equal(locked.status, 429, 'correct password refused while locked');
  // تطبيق بحدود الإنتاج الحقيقية
  const cfg = loadConfig({ env: 'development', baseUrl: BASE, databasePath: ':memory:', uploadDir: app.cfg.uploadDir, cookieSecure: false, adminRequireMfa: false }, { SESSION_SECRET: 'y'.repeat(48) });
  const db = openDatabase(':memory:');
  const strict = await buildApp(cfg, { db, logger: false, jobs: false });
  try {
    const s = new Agent(strict);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await s.post('/login', { phone: '07700000000', password: 'nope-nope-nope' })).status);
    assert.ok(statuses.includes(429), `got ${statuses.join(',')}`);
  } finally { await strict.close(); db.close(); }
});

test('12. logout and expiry end the session; sessions are stored hashed', async () => {
  const u = await createUser(app);
  const a = new Agent(app); await a.login(u.phone);
  const token = a.cookies.get('sid')!;
  assert.ok(!app.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(token), 'raw token is not stored');
  await a.post('/logout');
  const replay = new Agent(app); replay.cookies.set('sid', token);
  assert.equal((await replay.get('/account')).status, 303, 'old token rejected after logout');
  const b = new Agent(app); await b.login(u.phone);
  app.db.prepare('UPDATE sessions SET expires_at = unixepoch() - 1 WHERE user_id = ?').run(u.id);
  assert.equal((await b.get('/account')).status, 303, 'expired session rejected');
  // تعطيل الحساب يُنهي جلساته
  const c = new Agent(app); await c.login(u.phone);
  const admin = await createUser(app, 'admin');
  const ad = new Agent(app); await ad.login(admin.phone);
  await ad.post(`/admin/users/${u.id}/status`, { status: 'disabled' });
  assert.equal((await c.get('/account')).status, 303);
  assert.equal((await new Agent(app).login(u.phone)).status, 401, 'disabled account cannot log in');
  // خصائص كوكي الجلسة
  const d = new Agent(app);
  const other = await createUser(app);
  const res = await d.post('/login', { phone: other.phone, password: PASSWORD });
  const cookie = ([] as string[]).concat(res.headers['set-cookie'] as string[]).find((c) => c.startsWith('sid='))!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/);
});

test('13. pending, rejected and hidden posts never appear publicly', async () => {
  const author = await createUser(app);
  const a = new Agent(app); await a.login(author.phone);
  await a.postMultipart('/submit/market', { title: 'سلعة معلقة سرية', category_id: String(app.db.prepare("SELECT id FROM categories WHERE section='market' LIMIT 1").pluck().get()), area_id: '1', contact_phone: '07703333333', show_phone: 'on', d_condition: 'used', action: 'submit' });
  const id = lastPostId(app);
  const anon = new Agent(app);
  for (const url of ['/', '/market', '/search?q=' + encodeURIComponent('سلعة معلقة'), '/sitemap.xml', `/market/${id}`]) {
    const r = await anon.get(url);
    assert.ok(!r.body.includes('سلعة معلقة سرية'), url);
  }
  const other = await createUser(app);
  const o = new Agent(app); await o.login(other.phone);
  assert.equal((await o.get(`/market/${id}`)).status, 404, 'other users cannot preview');
  assert.equal((await anon.get(`/jobs/${id}`)).status, 404, 'wrong section path');
});

test('14. private files are not exposed', async () => {
  const anon = new Agent(app);
  for (const url of ['/static/../src/config.ts', '/static/..%2f..%2fpackage.json', '/static/%2e%2e/.env', '/media/..%2f..%2fdalil.db', '/media/' + 'a'.repeat(32) + '.webp', '/.env', '/data/dalil.db', '/uploads/']) {
    const r = await anon.get(url);
    assert.ok([400, 403, 404].includes(r.status), `${url} → ${r.status}`);
  }
  const pub = path.join(import.meta.dirname, '..', 'public');
  assert.ok(!path.resolve(app.cfg.uploadDir).startsWith(pub), 'uploads live outside the public folder');
});

test('15. no secrets in public files or the repository', () => {
  const root = path.join(import.meta.dirname, '..');
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === 'node_modules' || e.name === '.git' || e.name === 'data' || e.name === 'backups' ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const patterns = [/SESSION_SECRET\s*=\s*(?!replace-with)[A-Za-z0-9_-]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /ghp_[A-Za-z0-9]{30,}/, /sk-[A-Za-z0-9]{30,}/, /AKIA[0-9A-Z]{16}/, /ADMIN_PASSWORD\s*=\s*\S+/];
  for (const f of walk(root)) {
    if (/\.(png|woff2|jpg|webp)$/.test(f) || f.endsWith('security.test.ts')) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const p of patterns) assert.ok(!p.test(text), `${path.relative(root, f)} matches ${p}`);
  }
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const entry of ['.env', 'data/', 'uploads/', '*.db']) assert.ok(ignore.includes(entry), entry);
  const js = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
  assert.ok(!/secret|password_hash|DATABASE_PATH/i.test(js));
});

test('CSRF: cross-origin and token-less posts are refused', async () => {
  const u = await createUser(app);
  const a = new Agent(app); await a.login(u.phone);
  assert.equal((await a.post('/account/notifications/read', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await a.post('/account/notifications/read', {}, { origin: null })).status, 403, 'missing origin and referer');
  assert.equal((await a.post('/account/notifications/read', {}, { csrf: false })).status, 403, 'missing token');
  assert.equal((await a.post('/account/notifications/read', { _csrf: 'forged' }, { csrf: false })).status, 403, 'forged token');
  assert.equal((await a.post('/account/notifications/read')).status, 303);
});

test('security headers are present and admin pages are not indexed', async () => {
  const admin = await createUser(app, 'admin');
  const ad = new Agent(app); await ad.login(admin.phone);
  const r = await ad.get('/admin');
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.match(String(r.headers['content-security-policy']), /frame-ancestors 'none'/);
  assert.match(String(r.headers['x-robots-tag']), /noindex/);
  assert.match(String(r.headers['cache-control']), /no-store/);
  assert.ok(r.body.includes('noindex'));
  const robots = (await new Agent(app).get('/robots.txt')).body;
  assert.ok(robots.includes('Disallow: /admin'));
});

test('MFA: when required, admin panel needs a verified second factor', async () => {
  const strict = await makeApp({ adminRequireMfa: true });
  try {
    const admin = await createUser(strict, 'admin');
    const a = new Agent(strict); await a.login(admin.phone);
    const r = await a.get('/admin');
    assert.equal(r.status, 303);
    assert.equal(r.headers.location, '/account/security');
    // تفعيل TOTP ثم الدخول بخطوتين
    await a.get('/account/security');
    const secret = strict.db.prepare('SELECT totp_secret FROM users WHERE id = ?').pluck().get(admin.id) as string;
    const { totpAt } = await import('../src/lib/totp.ts');
    const code = totpAt(secret, Math.floor(Date.now() / 30000));
    assert.equal((await a.post('/account/security', { code })).status, 303);
    assert.equal((await a.get('/admin')).status, 200);
    const b = new Agent(strict);
    await b.login(admin.phone);
    assert.match(String((await b.get('/admin')).headers.location), /^\/login/, 'password alone is not enough');
    const next = totpAt(secret, Math.floor(Date.now() / 30000) + 1);
    const mfaPage = await b.get('/login/mfa');
    const csrf = mfaPage.body.match(/name="_csrf" value="([^"]+)"/)![1];
    assert.equal((await b.post('/login/mfa', { _csrf: csrf, code: next, next: '/admin' }, { csrf: false })).status, 303);
    assert.equal((await b.get('/admin')).status, 200);
  } finally { await strict.close(); }
});
