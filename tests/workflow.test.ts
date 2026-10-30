import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { Agent, areaId, categoryId, createUser, jobForm, lastPostId, makeApp, nextPhone, pngImage, postStatus } from './helpers.ts';
import { expireDue } from '../src/domain/workflow.ts';

let app: FastifyInstance;
before(async () => { app = await makeApp(); });
after(async () => { await app.close(); });

test('public pages render with ownership notice and support number', async () => {
  const a = new Agent(app);
  for (const url of ['/', '/businesses', '/jobs', '/properties', '/services', '/market', '/offers', '/community', '/help', '/restaurants', '/search', '/about', '/contact', '/policies/privacy', '/policies/terms', '/policies/posting', '/policies/ads', '/policies/reports']) {
    const r = await a.get(url);
    assert.equal(r.status, 200, url);
    assert.ok(r.body.includes('جميع الحقوق محفوظة © إبراهيم علي الشويلي'), `footer copyright on ${url}`);
    assert.ok(r.body.includes('tel:07763438000'), `support tel link on ${url}`);
    assert.ok(r.body.includes('https://wa.me/9647763438000'), `support WhatsApp link on ${url}`);
  }
  const home = await a.get('/');
  assert.ok(home.body.includes('شنو تحتاج بالمعامل؟'));
  assert.ok(home.body.includes('أضف إعلانك'));
  const about = await a.get('/about');
  assert.ok(about.body.includes('منصة دليل المعامل مشروع أُنشئ وطُوّر بواسطة إبراهيم علي الشويلي. جميع الحقوق محفوظة وفقاً للقوانين المعمول بها.'));
  assert.equal((await a.get('/does-not-exist')).status, 404);
});

test('register, logout and login', async () => {
  const a = new Agent(app);
  const phone = nextPhone();
  let r = await a.post('/register', { name: 'أحمد', phone, password: 'a-very-good-pass', agree: 'on' });
  assert.equal(r.status, 303);
  assert.equal((await a.get('/account')).status, 200);
  const dup = await new Agent(app).post('/register', { name: 'أحمد', phone, password: 'another-good-pass', agree: 'on' });
  assert.equal(dup.status, 409);
  r = await a.post('/logout');
  assert.equal(r.status, 303);
  assert.equal((await a.get('/account')).status, 303, 'logged out user is redirected');
  r = await a.login(phone, 'a-very-good-pass');
  assert.equal(r.status, 303);
  assert.equal((await a.get('/account')).status, 200);
  const bad = await new Agent(app).login(phone, 'wrong-password-x');
  assert.equal(bad.status, 401);
});

test('full moderation flow: submit → pending (hidden) → approve → public → edit → back to review', async () => {
  const author = await createUser(app);
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(author.phone);
  const m = new Agent(app); await m.login(mod.phone);
  const anon = new Agent(app);

  const r = await a.postMultipart('/submit/job', jobForm(app, 'مطلوب كاشير مسائي'), [{ name: 'images', filename: 'a.png', type: 'image/png', data: await pngImage() }]);
  assert.equal(r.status, 303, r.body.slice(0, 300));
  const id = lastPostId(app);
  assert.equal(postStatus(app, id), 'pending');

  // غير ظاهر للعامة
  assert.equal((await anon.get(`/jobs/${id}`)).status, 404);
  assert.ok(!(await anon.get('/jobs')).body.includes('مطلوب كاشير مسائي'));
  assert.ok(!(await anon.get('/search?q=' + encodeURIComponent('كاشير'))).body.includes('مطلوب كاشير مسائي'));
  assert.ok(!(await anon.get('/sitemap.xml')).body.includes(`/jobs/${id}<`));
  const img = app.db.prepare('SELECT file FROM post_images WHERE post_id = ?').pluck().get(id) as string;
  assert.equal((await anon.get(`/media/${img}`)).status, 404, 'pending image is private');
  assert.equal((await a.get(`/media/${img}`)).status, 200, 'author can preview own image');
  assert.equal((await a.get(`/jobs/${id}`)).status, 200, 'author can preview');

  // يظهر في طابور المراجعة
  const queue = await m.get('/admin/queue');
  assert.ok(queue.body.includes('مطلوب كاشير مسائي'));

  // الموافقة
  assert.equal((await m.post(`/admin/posts/${id}/action`, { action: 'approve' })).status, 303);
  assert.equal(postStatus(app, id), 'published');
  const row = app.db.prepare('SELECT approved_by, approved_at, expires_at FROM posts WHERE id = ?').get(id) as { approved_by: number; approved_at: number; expires_at: number };
  assert.equal(row.approved_by, mod.id);
  assert.ok(row.expires_at > row.approved_at);
  assert.equal((await anon.get(`/jobs/${id}`)).status, 200);
  assert.ok((await anon.get('/search?q=' + encodeURIComponent('كاشير'))).body.includes('مطلوب كاشير مسائي'));
  assert.ok((await anon.get('/sitemap.xml')).body.includes(`/jobs/${id}<`));
  assert.equal((await anon.get(`/media/${img}`)).status, 200);
  assert.ok(app.db.prepare("SELECT 1 FROM audit_logs WHERE action = 'post.approve' AND target_id = ? AND actor_id = ?").get(id, mod.id), 'approval is audited');
  assert.ok(app.db.prepare("SELECT 1 FROM notifications WHERE user_id = ? AND post_id = ?").get(author.id, id), 'author notified');

  // تعديل منشور معتمد يعيده للمراجعة ويخفيه
  const e = await a.postMultipart(`/account/posts/${id}/edit`, jobForm(app, 'مطلوب كاشير مسائي براتب جديد', { price: '600000' }));
  assert.equal(e.status, 303, e.body.slice(0, 300));
  assert.equal(postStatus(app, id), 'pending');
  assert.equal((await anon.get(`/jobs/${id}`)).status, 404);
  assert.equal(app.db.prepare('SELECT approved_by FROM posts WHERE id = ?').pluck().get(id), null, 'old approval cleared');
  assert.ok(app.db.prepare('SELECT count(*) FROM post_revisions WHERE post_id = ?').pluck().get(id) as number >= 1, 'revision saved');
});

test('rejection requires a reason, notifies the author, and the post cannot be republished', async () => {
  const author = await createUser(app);
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(author.phone);
  const m = new Agent(app); await m.login(mod.phone);
  await a.postMultipart('/submit/job', jobForm(app, 'وظيفة سيتم رفضها'));
  const id = lastPostId(app);
  const noReason = await m.post(`/admin/posts/${id}/action`, { action: 'reject', reason: '' });
  assert.equal(noReason.status, 303);
  assert.equal(postStatus(app, id), 'pending', 'rejection without a reason is refused');
  await m.post(`/admin/posts/${id}/action`, { action: 'reject', reason: 'معلومات ناقصة' });
  assert.equal(postStatus(app, id), 'rejected');
  assert.ok((await a.get('/account')).body.includes('معلومات ناقصة'));
  // صاحب المنشور لا يستطيع إعادة إرساله أو تعديله
  await a.post(`/account/posts/${id}/action`, { action: 'submit' });
  assert.equal(postStatus(app, id), 'rejected');
  assert.equal((await a.get(`/account/posts/${id}/edit`)).status, 404);
  assert.equal((await new Agent(app).get(`/jobs/${id}`)).status, 404);
  // حتى المشرف لا يستطيع نشر منشور مرفوض
  await m.post(`/admin/posts/${id}/action`, { action: 'approve' });
  assert.equal(postStatus(app, id), 'rejected');
});

test('request changes → owner edits and resubmits → approve', async () => {
  const author = await createUser(app);
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(author.phone);
  const m = new Agent(app); await m.login(mod.phone);
  await a.postMultipart('/submit/job', jobForm(app, 'وظيفة تحتاج تعديل'));
  const id = lastPostId(app);
  await m.post(`/admin/posts/${id}/action`, { action: 'request_changes', reason: 'أضف ساعات العمل' });
  assert.equal(postStatus(app, id), 'changes_requested');
  await a.postMultipart(`/account/posts/${id}/edit`, jobForm(app, 'وظيفة تحتاج تعديل', { d_work_hours: '٨ ساعات' }));
  assert.equal(postStatus(app, id), 'pending');
  await m.post(`/admin/posts/${id}/action`, { action: 'approve' });
  assert.equal(postStatus(app, id), 'published');
});

test('drafts stay private until submitted', async () => {
  const author = await createUser(app);
  const a = new Agent(app); await a.login(author.phone);
  await a.postMultipart('/submit/job', jobForm(app, 'مسودة وظيفة', { action: 'draft' }));
  const id = lastPostId(app);
  assert.equal(postStatus(app, id), 'draft');
  assert.equal((await new Agent(app).get(`/jobs/${id}`)).status, 404);
  await a.post(`/account/posts/${id}/action`, { action: 'submit' });
  assert.equal(postStatus(app, id), 'pending');
});

test('hide, report and expiry', async () => {
  const author = await createUser(app);
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(author.phone);
  const m = new Agent(app); await m.login(mod.phone);
  const anon = new Agent(app);
  await a.postMultipart('/submit/job', jobForm(app, 'وظيفة للبلاغ'));
  const id = lastPostId(app);
  await m.post(`/admin/posts/${id}/action`, { action: 'approve' });

  const rep = await anon.post(`/posts/${id}/report`, { reason: 'fraud', details: 'يطلب مبلغ مقدماً' });
  assert.equal(rep.status, 303);
  assert.ok(app.db.prepare("SELECT 1 FROM reports WHERE post_id = ? AND reason = 'fraud' AND status = 'open'").get(id));
  assert.ok((await m.get('/admin/reports')).body.includes('وظيفة للبلاغ'));

  await m.post(`/admin/posts/${id}/action`, { action: 'hide', reason: 'قيد التحقق من البلاغ' });
  assert.equal(postStatus(app, id), 'hidden');
  assert.equal((await anon.get(`/jobs/${id}`)).status, 404);
  await m.post(`/admin/posts/${id}/action`, { action: 'unhide' });
  assert.equal(postStatus(app, id), 'published');

  app.db.prepare('UPDATE posts SET expires_at = unixepoch() - 10 WHERE id = ?').run(id);
  assert.equal((await anon.get(`/jobs/${id}`)).status, 404, 'expired posts are hidden even before the job runs');
  assert.ok(expireDue(app.db) >= 1);
  assert.equal(postStatus(app, id), 'expired');
  await a.post(`/account/posts/${id}/action`, { action: 'renew' });
  assert.equal(postStatus(app, id), 'pending', 'renewal goes back to review');
});

test('business: claim ownership, owner manages menu, others cannot; reviews are moderated', async () => {
  const submitter = await createUser(app);
  const owner = await createUser(app);
  const stranger = await createUser(app);
  const admin = await createUser(app, 'admin');
  const s = new Agent(app); await s.login(submitter.phone);
  const o = new Agent(app); await o.login(owner.phone);
  const x = new Agent(app); await x.login(stranger.phone);
  const ad = new Agent(app); await ad.login(admin.phone);

  const r = await s.postMultipart('/submit/business', {
    title: 'مطعم الاختبار', category_id: String(app.db.prepare("SELECT id FROM categories WHERE section = 'business' AND is_food = 1 LIMIT 1").pluck().get()),
    area_id: String(areaId(app)), contact_phone: '07701111111', show_phone: 'on', whatsapp: 'on', d_address: 'الشارع العام', d_hours: '١٢ - ١٢', action: 'submit',
  });
  assert.equal(r.status, 303, r.body.slice(0, 300));
  const id = lastPostId(app);
  await ad.post(`/admin/posts/${id}/action`, { action: 'approve' });
  assert.ok((await new Agent(app).get('/restaurants')).body.includes('مطعم الاختبار'));
  const page = await new Agent(app).get(`/businesses/${id}`);
  assert.ok(page.body.includes('tel:07701111111') && page.body.includes('https://wa.me/9647701111111'));
  assert.ok(page.body.includes('application/ld+json'));
  assert.ok(!page.body.includes('بيانات النشاط موثقة'), 'no automatic verification badge');

  assert.equal((await o.post(`/businesses/${id}/claim`, { message: 'أنا صاحب المطعم واسمي على الإجازة' })).status, 303);
  const claimId = app.db.prepare('SELECT id FROM business_claims WHERE post_id = ? AND user_id = ?').pluck().get(id, owner.id) as number;
  // قبل الاعتماد لا يستطيع إدارة الصفحة
  assert.equal((await o.post(`/account/posts/${id}/items`, { name: 'تكة', price: '5000' })).status, 404);
  await ad.post(`/admin/claims/${claimId}`, { decision: 'approve' });
  assert.equal(app.db.prepare('SELECT owner_id FROM posts WHERE id = ?').pluck().get(id), owner.id);
  assert.equal(app.db.prepare('SELECT role FROM users WHERE id = ?').pluck().get(owner.id), 'business_owner');

  await o.login(owner.phone); // الجلسة الحالية صالحة؛ الدخول مجدداً يدوّرها
  assert.equal((await o.post(`/account/posts/${id}/items`, { name: 'تكة لحم', price: '6000' })).status, 303);
  assert.equal((await o.post(`/account/posts/${id}/open`, { open_state: 'open' })).status, 303);
  assert.ok((await new Agent(app).get(`/businesses/${id}`)).body.includes('تكة لحم'));
  // المُضيف الأصلي ومستخدم غريب لا يديران الصفحة بعد اعتماد مالك
  assert.equal((await s.post(`/account/posts/${id}/items`, { name: 'صنف دخيل', price: '1' })).status, 404);
  assert.equal((await x.post(`/account/posts/${id}/items`, { name: 'صنف دخيل', price: '1' })).status, 404);
  assert.equal((await x.post(`/account/posts/${id}/open`, { open_state: 'closed' })).status, 404);
  assert.equal((await s.get(`/account/posts/${id}/edit`)).status, 404);

  // التقييم: المالك لا يقيّم نفسه، وتقييم الغريب ينتظر المراجعة
  await o.post(`/posts/${id}/review`, { rating: '5', comment: 'ممتاز' });
  assert.equal(app.db.prepare('SELECT count(*) FROM reviews WHERE post_id = ? AND user_id = ?').pluck().get(id, owner.id), 0);
  await x.post(`/posts/${id}/review`, { rating: '4', comment: 'أكل طيب' });
  assert.equal(app.db.prepare('SELECT status FROM reviews WHERE post_id = ? AND user_id = ?').pluck().get(id, stranger.id), 'pending');
  assert.ok(!(await new Agent(app).get(`/businesses/${id}`)).body.includes('أكل طيب'));
  await x.post(`/posts/${id}/review`, { rating: '1', comment: 'تقييم مكرر' });
  assert.equal(app.db.prepare('SELECT count(*) FROM reviews WHERE post_id = ? AND user_id = ?').pluck().get(id, stranger.id), 1, 'one review per user');
  const rid = app.db.prepare('SELECT id FROM reviews WHERE post_id = ? AND user_id = ?').pluck().get(id, stranger.id) as number;
  await ad.post(`/admin/reviews/${rid}`, { status: 'published' });
  assert.ok((await new Agent(app).get(`/businesses/${id}`)).body.includes('أكل طيب'));

  // التوثيق يدوي من المدير فقط
  assert.equal((await x.post(`/admin/posts/${id}/verify`, { value: '1' })).status, 403);
  await ad.post(`/admin/posts/${id}/verify`, { value: '1' });
  assert.ok((await new Agent(app).get(`/businesses/${id}`)).body.includes('بيانات النشاط موثقة'));
});

test('help requests hide the phone unless consent is given and need publication consent', async () => {
  const u = await createUser(app);
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(u.phone);
  const base = { title: 'مطلوب متبرع دم', category_id: String(categoryId(app, 'help')), area_id: String(areaId(app)), contact_phone: '07709999999', d_blood_type: 'O-', action: 'submit' };
  assert.equal((await a.postMultipart('/submit/help', base)).status, 400, 'consent required');
  assert.equal((await a.postMultipart('/submit/help', { ...base, d_consent: 'on', show_phone: 'on' })).status, 400, 'phone consent required to show number');
  assert.equal((await a.postMultipart('/submit/help', { ...base, d_consent: 'on' })).status, 303);
  const id = lastPostId(app);
  const m = new Agent(app); await m.login(mod.phone);
  await m.post(`/admin/posts/${id}/action`, { action: 'approve' });
  const page = (await new Agent(app).get(`/help/${id}`)).body;
  assert.ok(!page.includes('07709999999'), 'private phone not shown');
  assert.ok(page.includes('لم يتم التحقق من تفاصيل الحالة'));
  await a.post(`/account/posts/${id}/action`, { action: 'close' });
  assert.equal(postStatus(app, id), 'removed');
});

test('search and filters return only matching published posts', async () => {
  const u = await createUser(app);
  const mod = await createUser(app, 'moderator');
  const a = new Agent(app); await a.login(u.phone);
  const m = new Agent(app); await m.login(mod.phone);
  const prop = (title: string, offer: string, price: string) => ({ title, category_id: String(categoryId(app, 'property')), area_id: String(areaId(app)), contact_phone: '07702222222', show_phone: 'on', d_offer: offer, price, action: 'submit' });
  await a.postMultipart('/submit/property', prop('بيت للإيجار قرب السوق', 'rent', '300000'));
  const rent = lastPostId(app);
  await a.postMultipart('/submit/property', prop('أرض للبيع بالمعامل', 'sale', '90000000'));
  const sale = lastPostId(app);
  for (const id of [rent, sale]) await m.post(`/admin/posts/${id}/action`, { action: 'approve' });
  const anon = new Agent(app);
  let body = (await anon.get('/properties?offer=rent')).body;
  assert.ok(body.includes('بيت للإيجار قرب السوق') && !body.includes('أرض للبيع بالمعامل'));
  body = (await anon.get('/properties?min=1000000')).body;
  assert.ok(!body.includes('بيت للإيجار قرب السوق') && body.includes('أرض للبيع بالمعامل'));
  body = (await anon.get('/search?q=' + encodeURIComponent('الايجار'))).body; // بلا همزة: التطبيع يطابق «الإيجار»
  assert.ok(body.includes('بيت للإيجار قرب السوق'));
  body = (await anon.get('/search?type=property&q=' + encodeURIComponent('أرض'))).body;
  assert.ok(body.includes('أرض للبيع بالمعامل') && !body.includes('بيت للإيجار'));
});

test('daily limit and duplicate titles are blocked', async () => {
  const u = await createUser(app);
  const a = new Agent(app); await a.login(u.phone);
  assert.equal((await a.postMultipart('/submit/job', jobForm(app, 'وظيفة مكررة'))).status, 303);
  const dup = await a.postMultipart('/submit/job', jobForm(app, 'وظيفة مكررة'));
  assert.equal(dup.status, 400);
  assert.ok(dup.body.includes('بنفس العنوان'));
  for (let i = 0; i < 4; i++) await a.postMultipart('/submit/job', jobForm(app, `وظيفة رقم ${i + 10}`));
  const over = await a.postMultipart('/submit/job', jobForm(app, 'وظيفة فوق الحد'));
  assert.equal(over.status, 400);
  assert.ok(over.body.includes('للحد اليومي'));
});
