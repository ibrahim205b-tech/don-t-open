import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { csrfValid } from '../auth/csrf.ts';
import { destroyUserSessions, createSession, SESSION_COOKIE } from '../auth/sessions.ts';
import { isStaff } from '../auth/rbac.ts';
import { html, type SafeHtml } from '../lib/html.ts';
import { fmtDateTime, fmtPrice } from '../lib/format.ts';
import { deleteImageFiles, ImageError, MAX_IMAGES, storeImage, type StoredImage } from '../lib/images.ts';
import { hashPassword, passwordProblem, verifyPassword } from '../lib/password.ts';
import { newTotpSecret, otpauthUri, verifyTotp } from '../lib/totp.ts';
import { audit } from '../domain/audit.ts';
import { canEditPost, createPost, getPost, isPostOwner, parseDetails, parsePostForm, PostError, postImages, postItems, reindex, updatePost } from '../domain/posts.ts';
import { sectionEnabled } from '../domain/settings.ts';
import { STATUS_LABEL, TYPES, TYPE_KEYS, isPostType, type Post, type PostType } from '../domain/types.ts';
import { ACTIONS, availableActions, transition, WorkflowError, type Action } from '../domain/workflow.ts';
import { emptyState, errorList, field, statusBadge, postUrl } from '../views/components.ts';
import { chooseTypePage, postForm, valuesFromRow, type FormValues } from '../views/pages/forms.ts';
import { icon } from '../views/layout.ts';
import { bindOf, csrfInput } from './form.ts';
import { intParam, needUser } from './guards.ts';

interface Multipart { fields: Record<string, string | string[]>; files: Buffer[] }

/** يقرأ نموذج multipart بحدود صارمة: حقل الملفات الوحيد المسموح هو images. */
async function readMultipart(req: FastifyRequest): Promise<Multipart> {
  const fields: Record<string, string | string[]> = {};
  const files: Buffer[] = [];
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'images') { await part.toBuffer().catch(() => null); throw Object.assign(new Error('unexpected file'), { statusCode: 400 }); }
      const buf = await part.toBuffer();
      if (part.file.truncated) throw Object.assign(new Error('file too large'), { statusCode: 413, code: 'FST_REQ_FILE_TOO_LARGE' });
      if (buf.length) files.push(buf);
    } else {
      const val = String(part.value ?? '');
      const prev = fields[part.fieldname];
      fields[part.fieldname] = prev === undefined ? val : Array.isArray(prev) ? [...prev, val] : [prev, val];
    }
  }
  return { fields, files };
}

async function saveImages(bufs: Buffer[], dir: string): Promise<StoredImage[]> {
  const out: StoredImage[] = [];
  try {
    for (const b of bufs) out.push(await storeImage(b, dir));
    return out;
  } catch (e) {
    await deleteImageFiles(dir, out.flatMap((i) => [i.file, i.thumb]));
    throw e;
  }
}

function formValues(fields: Record<string, string | string[]>): FormValues {
  const v: FormValues = {};
  for (const [k, val] of Object.entries(fields)) if (k !== '_csrf' && typeof val === 'string') v[k] = val;
  return v;
}

export async function accountRoutes(app: FastifyInstance) {
  const db = app.db;
  const uploadDir = app.cfg.uploadDir;

  const opts = (sql: string, ...args: unknown[]) => (db.prepare(sql).all(...args) as { id: number; name: string }[]).map((r) => [r.id, r.name] as [number, string]);
  const categories = (type: PostType) => opts('SELECT id, name FROM categories WHERE section = ? AND active = 1 ORDER BY sort, name', type);
  const areas = () => opts('SELECT id, name FROM areas WHERE active = 1 ORDER BY sort, name');
  const ownedBusinesses = (userId: number) => opts("SELECT id, title AS name FROM posts WHERE type = 'business' AND owner_id = ? AND status = 'published' ORDER BY title", userId);

  function renderForm(req: FastifyRequest, reply: FastifyReply, type: PostType, values: FormValues, errors: string[], post?: Post) {
    const userId = req.user!.id;
    return reply.page(req, { title: post ? `تعديل: ${post.title}` : `إضافة ${TYPES[type].single}`, noindex: true }, postForm({
      type, values, errors, csrf: csrfInput(req), categories: categories(type), areas: areas(),
      images: post ? postImages(db, post.id) : [], businesses: type === 'offer' ? ownedBusinesses(post?.user_id ?? userId) : [],
      editing: !!post, status: post?.status, action: post ? `/account/posts/${post.id}/edit` : `/submit/${type}`,
    }));
  }

  // ---------- إضافة منشور ----------

  app.get('/submit', (req, reply) => {
    if (needUser(req, reply)) return;
    return reply.page(req, { title: 'أضف إعلانك', noindex: true }, chooseTypePage(TYPE_KEYS.filter((t) => sectionEnabled(req.settings, t))));
  });

  app.get('/submit/:type', (req, reply) => {
    if (needUser(req, reply)) return;
    const type = (req.params as { type: string }).type;
    if (!isPostType(type) || !sectionEnabled(req.settings, type)) return reply.callNotFound();
    return renderForm(req, reply, type, { contact_phone: req.user!.phone, show_phone: type === 'help' ? undefined : 'on' }, []);
  });

  app.post('/submit/:type', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (needUser(req, reply)) return;
    const type = (req.params as { type: string }).type;
    if (!isPostType(type) || !sectionEnabled(req.settings, type)) return reply.callNotFound();
    if (!req.isMultipart()) return reply.code(415).send();
    const { fields, files } = await readMultipart(req);
    if (!csrfValid(app.cfg.sessionSecret, bindOf(req), fields._csrf)) return reply.code(403).send('طلب مرفوض.');
    const parsed = parsePostForm(type, fields);
    if (!parsed.ok) { reply.code(400); return renderForm(req, reply, type, formValues(fields), parsed.errors); }
    if (files.length > MAX_IMAGES) { reply.code(400); return renderForm(req, reply, type, formValues(fields), ['الحد الأقصى ٦ صور.']); }
    let images: StoredImage[] = [];
    try {
      images = await saveImages(files, uploadDir);
      const id = createPost(db, req.user!, type, parsed.value, images, Number(req.settings.max_posts_per_day));
      if (isStaff(req.user!.role)) audit(db, { actorId: req.user!.id, action: 'post.create_by_admin', targetType: 'post', targetId: id, ipHash: req.ipHash });
      return reply.flashRedirect(`/account/posts/${id}`, 'ok', parsed.value.action === 'draft' ? 'تم حفظ المسودة.' : 'تم إرسال منشورك للمراجعة. راح نبلغك أول ما تنتهي المراجعة.');
    } catch (e) {
      await deleteImageFiles(uploadDir, images.flatMap((i) => [i.file, i.thumb]));
      if (e instanceof ImageError || e instanceof PostError) { reply.code(400); return renderForm(req, reply, type, formValues(fields), [e.message]); }
      throw e;
    }
  });

  // ---------- حسابي ----------

  app.get('/account', (req, reply) => {
    if (needUser(req, reply)) return;
    const u = req.user!;
    const posts = db.prepare(`SELECT id, type, title, status, status_reason, created_at, updated_at, expires_at FROM posts
      WHERE (user_id = ? OR owner_id = ?) AND status <> 'removed' ORDER BY updated_at DESC LIMIT 200`).all(u.id, u.id) as Post[];
    const notes = db.prepare('SELECT id, message, post_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(u.id) as { id: number; message: string; post_id: number | null; read_at: number | null; created_at: number }[];
    const unread = notes.some((n) => !n.read_at);
    return reply.page(req, { title: 'حسابي', noindex: true }, html`<div class="wrap">
      <div class="page-head"><div><h1>أهلاً ${u.name}</h1><p class="lede">تابع منشوراتك وإشعاراتك من هنا.</p></div>
        <a class="btn btn-sign" href="/submit">${icon('plus')}أضف إعلانك</a></div>
      <div class="account-grid">
        <section aria-labelledby="h-posts"><h2 id="h-posts">منشوراتي</h2>
          ${posts.length ? html`<ul class="manage-list">${posts.map((p) => html`<li>
            <a href="/account/posts/${p.id}"><strong>${p.title}</strong></a>
            <span class="muted">${TYPES[p.type].single}</span> ${statusBadge(p.status)}
            ${p.status_reason && ['rejected', 'changes_requested', 'hidden'].includes(p.status) ? html`<p class="reason">${p.status_reason}</p>` : ''}
          </li>`)}</ul>` : emptyState('ما عندك منشورات بعد', 'أضف محلك أو وظيفة أو أي إعلان، والإدارة تراجعه وتنشره.', { href: '/submit', label: 'أضف إعلانك' })}
        </section>
        <section aria-labelledby="h-notes"><h2 id="h-notes">${icon('bell', 'i i-sm')}الإشعارات</h2>
          ${notes.length ? html`<ul class="notes">${notes.map((n) => html`<li class="${n.read_at ? '' : 'unread'}"><p>${n.message}</p><span class="muted">${fmtDateTime(n.created_at)}</span>${n.post_id ? html` <a href="/account/posts/${n.post_id}">عرض</a>` : ''}</li>`)}</ul>
            ${unread ? html`<form method="post" action="/account/notifications/read">${csrfInput(req)}<button class="btn" type="submit">تعليم الكل كمقروء</button></form>` : ''}` : html`<p class="muted">ما كو إشعارات.</p>`}
          <h2>الحساب</h2>
          <p><a class="btn btn-block" href="/account/settings">${icon('settings')}إعدادات الحساب وكلمة المرور</a></p>
        </section>
      </div></div>`);
  });

  app.post('/account/notifications/read', (req, reply) => {
    if (needUser(req, reply)) return;
    db.prepare('UPDATE notifications SET read_at = unixepoch() WHERE user_id = ? AND read_at IS NULL').run(req.user!.id);
    return reply.redirect('/account', 303);
  });

  /** يحمّل المنشور ويتأكد أن المستخدم صاحبه. أي منشور لغيره يُعامل كغير موجود. */
  function ownPost(req: FastifyRequest): Post | null {
    const id = intParam((req.params as { id: string }).id);
    const post = id ? getPost(db, id) : undefined;
    if (!post || !req.user || !isPostOwner(post, req.user.id) || post.status === 'removed') return null;
    return post;
  }

  app.get('/account/posts/:id', (req, reply) => {
    if (needUser(req, reply)) return;
    const post = ownPost(req);
    if (!post) return reply.callNotFound();
    const u = req.user!;
    const actions = availableActions(post, u, 'owner').filter((a) => a !== 'withdraw');
    const items = post.type === 'business' && post.owner_id === u.id ? postItems(db, post.id) : null;
    const history = db.prepare('SELECT action, from_status, to_status, reason, created_at FROM moderation_actions WHERE post_id = ? ORDER BY id DESC LIMIT 20').all(post.id) as { action: string; from_status: string; to_status: string; reason: string | null; created_at: number }[];
    const pendingClaim = db.prepare("SELECT 1 FROM business_claims WHERE post_id = ? AND user_id = ? AND status = 'pending'").get(post.id, u.id);
    const csrf = csrfInput(req);
    const actionForm = (a: Action, cls = 'btn') => html`<form method="post" action="/account/posts/${post.id}/action" class="inline">${csrf}<input type="hidden" name="action" value="${a}"><button class="${cls}" type="submit">${ACTIONS[a].label}</button></form>`;
    return reply.page(req, { title: post.title, noindex: true }, html`<div class="wrap narrow">
      <nav class="crumbs" aria-label="مسار التنقل"><a href="/account">حسابي</a><span aria-hidden="true">/</span><span aria-current="page">${post.title}</span></nav>
      <h1>${post.title}</h1>
      <p>${TYPES[post.type].single} ${statusBadge(post.status)}</p>
      ${post.status_reason && ['rejected', 'changes_requested', 'hidden'].includes(post.status) ? html`<div class="note note-warn"><strong>ملاحظة الإدارة:</strong> ${post.status_reason}</div>` : ''}
      ${post.status === 'pending' ? html`<p class="note">${icon('clock', 'i i-sm')}منشورك بانتظار المراجعة وما يظهر للعامة لحد الموافقة.</p>` : ''}
      ${pendingClaim ? html`<p class="note">طلب الملكية قيد المراجعة.</p>` : ''}
      <div class="btn-row">
        <a class="btn" href="${postUrl(post)}">${icon('info')}${post.status === 'published' ? 'عرض المنشور' : 'معاينة'}</a>
        ${canEditPost(post, u) ? html`<a class="btn" href="/account/posts/${post.id}/edit">${icon('edit')}تعديل</a>` : ''}
        ${actions.map((a) => actionForm(a, a === 'submit' || a === 'renew' ? 'btn btn-primary' : 'btn'))}
      </div>
      ${post.type === 'business' && post.owner_id === u.id && post.status === 'published' ? html`
        <section class="block" aria-labelledby="h-open"><h2 id="h-open">حالة المحل الآن</h2>
          <form method="post" action="/account/posts/${post.id}/open" class="btn-row">${csrf}
            ${(['open', 'closed', 'unknown'] as const).map((s) => html`<button class="btn ${post.open_state === s ? 'btn-primary' : ''}" type="submit" name="open_state" value="${s}" aria-pressed="${post.open_state === s}">${{ open: 'مفتوح', closed: 'مغلق', unknown: 'غير محدد' }[s]}</button>`)}
          </form></section>` : ''}
      ${items ? html`<section class="block" aria-labelledby="h-items"><h2 id="h-items">المنتجات والأسعار / قائمة الطعام</h2>
        ${items.length ? html`<table class="menu"><thead><tr><th scope="col">الصنف</th><th scope="col">السعر</th><th scope="col"><span class="sr">حذف</span></th></tr></thead><tbody>
          ${items.map((it) => html`<tr><td>${it.name}${it.note ? html`<span class="muted block">${it.note}</span>` : ''}</td><td class="num">${it.price !== null ? fmtPrice(it.price) : 'حسب الطلب'}</td>
          <td><form method="post" action="/account/posts/${post.id}/items/${it.id}/delete">${csrf}<button class="btn btn-sm" type="submit">حذف</button></form></td></tr>`)}
        </tbody></table>` : html`<p class="muted">أضف أصنافك وأسعارك حتى تظهر بصفحة المحل.</p>`}
        ${items.length < 100 ? html`<form method="post" action="/account/posts/${post.id}/items" class="form compact">${csrf}
          <div class="two">${field({ name: 'name', label: 'اسم الصنف', required: true, max: 80 })}${field({ name: 'price', label: 'السعر (د.ع)', attrs: 'inputmode="numeric"' })}</div>
          ${field({ name: 'note', label: 'ملاحظة', max: 200 })}
          <button class="btn btn-primary" type="submit">إضافة الصنف</button></form>` : ''}
      </section>` : ''}
      <section class="block"><h2>سجل المنشور</h2><ul class="history">${history.map((h) => html`<li><span class="muted">${fmtDateTime(h.created_at)}</span> ${STATUS_LABEL[h.to_status as Post['status']] ?? h.to_status}${h.reason ? html`: ${h.reason}` : ''}</li>`)}</ul></section>
      ${availableActions(post, u, 'owner').includes('withdraw') ? html`<details class="panel danger"><summary>${icon('trash', 'i i-sm')}حذف المنشور</summary><p>الحذف نهائي ويخفي المنشور من الدليل.</p>${actionForm('withdraw', 'btn btn-danger')}</details>` : ''}
    </div>`);
  });

  app.post('/account/posts/:id/action', (req, reply) => {
    if (needUser(req, reply)) return;
    const post = ownPost(req);
    if (!post) return reply.callNotFound();
    const action = String((req.body as Record<string, string>).action ?? '') as Action;
    if (!(action in ACTIONS) || ACTIONS[action].who !== 'owner') return reply.code(400).flashRedirect(`/account/posts/${post.id}`, 'error', 'إجراء غير صالح.');
    try {
      transition(db, post.id, action, req.user!, '', req.ipHash);
    } catch (e) {
      if (e instanceof WorkflowError) { reply.code(e.status); return reply.flashRedirect(`/account/posts/${post.id}`, 'error', e.message); }
      throw e;
    }
    const msg = action === 'withdraw' || action === 'close' ? 'تم حذف المنشور.' : 'تم إرسال المنشور للمراجعة.';
    return reply.flashRedirect(action === 'withdraw' || action === 'close' ? '/account' : `/account/posts/${post.id}`, 'ok', msg);
  });

  app.post('/account/posts/:id/open', (req, reply) => {
    if (needUser(req, reply)) return;
    const post = ownPost(req);
    const state = String((req.body as Record<string, string>).open_state ?? '');
    if (!post || post.type !== 'business' || post.owner_id !== req.user!.id) return reply.callNotFound();
    if (!['open', 'closed', 'unknown'].includes(state)) return reply.code(400).send();
    db.prepare('UPDATE posts SET open_state = ?, updated_at = unixepoch() WHERE id = ?').run(state, post.id);
    return reply.flashRedirect(`/account/posts/${post.id}`, 'ok', 'تم تحديث حالة المحل.');
  });

  app.post('/account/posts/:id/items', (req, reply) => {
    if (needUser(req, reply)) return;
    const post = ownPost(req);
    if (!post || post.type !== 'business' || post.owner_id !== req.user!.id) return reply.callNotFound();
    const b = req.body as Record<string, string>;
    const name = String(b.name ?? '').trim();
    const priceRaw = String(b.price ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[,\s٬]/g, '');
    const note = String(b.note ?? '').trim();
    if (name.length < 2 || name.length > 80 || note.length > 200 || (priceRaw && !/^\d{1,10}$/.test(priceRaw)))
      return reply.flashRedirect(`/account/posts/${post.id}`, 'error', 'تحقق من اسم الصنف (٢ إلى ٨٠ حرفاً) والسعر (أرقام فقط).');
    const count = db.prepare('SELECT count(*) FROM post_items WHERE post_id = ?').pluck().get(post.id) as number;
    if (count >= 100) return reply.flashRedirect(`/account/posts/${post.id}`, 'error', 'الحد الأقصى ١٠٠ صنف.');
    db.prepare('INSERT INTO post_items (post_id, name, price, note, sort) VALUES (?, ?, ?, ?, ?)').run(post.id, name, priceRaw ? Number(priceRaw) : null, note, count);
    reindex(db, post.id);
    audit(db, { actorId: req.user!.id, action: 'business.item_add', targetType: 'post', targetId: post.id, meta: { name }, ipHash: req.ipHash });
    return reply.flashRedirect(`/account/posts/${post.id}`, 'ok', 'تمت إضافة الصنف.');
  });

  app.post('/account/posts/:id/items/:item/delete', (req, reply) => {
    if (needUser(req, reply)) return;
    const post = ownPost(req);
    const itemId = intParam((req.params as { item: string }).item);
    if (!post || post.type !== 'business' || post.owner_id !== req.user!.id || !itemId) return reply.callNotFound();
    db.prepare('DELETE FROM post_items WHERE id = ? AND post_id = ?').run(itemId, post.id);
    reindex(db, post.id);
    return reply.flashRedirect(`/account/posts/${post.id}`, 'ok', 'تم حذف الصنف.');
  });

  // ---------- التعديل ----------

  /** للتعديل: صاحب المنشور، أو مدير يعدّل بيانات نشاط تجاري. */
  function editablePost(req: FastifyRequest): Post | null {
    const id = intParam((req.params as { id: string }).id);
    const post = id ? getPost(db, id) : undefined;
    if (!post || !req.user || !canEditPost(post, req.user)) return null;
    return post;
  }

  app.get('/account/posts/:id/edit', (req, reply) => {
    if (needUser(req, reply)) return;
    const post = editablePost(req);
    if (!post) return reply.callNotFound();
    return renderForm(req, reply, post.type, valuesFromRow(post as unknown as Record<string, unknown>, parseDetails(post)), [], post);
  });

  app.post('/account/posts/:id/edit', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (needUser(req, reply)) return;
    const post = editablePost(req);
    if (!post) return reply.callNotFound();
    if (!req.isMultipart()) return reply.code(415).send();
    const { fields, files } = await readMultipart(req);
    if (!csrfValid(app.cfg.sessionSecret, bindOf(req), fields._csrf)) return reply.code(403).send('طلب مرفوض.');
    const parsed = parsePostForm(post.type, fields);
    if (!parsed.ok) { reply.code(400); return renderForm(req, reply, post.type, formValues(fields), parsed.errors, post); }
    let images: StoredImage[] = [];
    try {
      images = await saveImages(files, uploadDir);
      const r = updatePost(db, req.user!, post, parsed.value, images);
      await deleteImageFiles(uploadDir, r.removedFiles);
      if (!isPostOwner(post, req.user!.id)) audit(db, { actorId: req.user!.id, action: 'post.edit_by_admin', targetType: 'post', targetId: post.id, ipHash: req.ipHash });
      const back = isPostOwner(post, req.user!.id) ? `/account/posts/${post.id}` : `/admin/posts/${post.id}`;
      return reply.flashRedirect(back, 'ok', r.status === 'pending' ? 'تم حفظ التعديل وإرساله للمراجعة.' : 'تم حفظ التعديل.');
    } catch (e) {
      await deleteImageFiles(uploadDir, images.flatMap((i) => [i.file, i.thumb]));
      if (e instanceof ImageError || e instanceof PostError) { reply.code(400); return renderForm(req, reply, post.type, formValues(fields), [e.message], post); }
      throw e;
    }
  });

  // ---------- إعدادات الحساب ----------

  const settingsPage = (req: FastifyRequest, reply: FastifyReply, errors: string[] = [], extra: SafeHtml = html``) => {
    const u = req.user!;
    const csrf = csrfInput(req);
    return reply.page(req, { title: 'إعدادات الحساب', noindex: true }, html`<div class="wrap narrow">
      <nav class="crumbs" aria-label="مسار التنقل"><a href="/account">حسابي</a><span aria-hidden="true">/</span><span aria-current="page">الإعدادات</span></nav>
      <h1>إعدادات الحساب</h1>
      ${errorList(errors)}${extra}
      <dl class="facts"><div><dt>الاسم</dt><dd>${u.name}</dd></div><div><dt>رقم الهاتف</dt><dd dir="ltr">${u.phone}</dd></div></dl>
      <section class="block"><h2>تغيير كلمة المرور</h2>
        <form method="post" action="/account/password" class="form">${csrf}
          ${field({ name: 'current', label: 'كلمة المرور الحالية', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
          ${field({ name: 'password', label: 'كلمة المرور الجديدة', type: 'password', required: true, hint: '١٠ أحرف على الأقل', attrs: 'autocomplete="new-password" minlength="10" maxlength="128"' })}
          <button class="btn btn-primary" type="submit">تغيير كلمة المرور</button>
          <p class="hint">بعد التغيير يتم تسجيل خروجك من كل الأجهزة الأخرى.</p>
        </form></section>
      ${isStaff(u.role) ? html`<section class="block"><h2>التحقق بخطوتين</h2>
        ${u.totp_enabled ? html`<p>${icon('check', 'i i-sm')}مفعّل على حسابك.</p>` : html`<p>حسابات الإدارة ${app.cfg.adminRequireMfa ? 'ملزمة' : 'ننصحها'} بتفعيل التحقق بخطوتين.</p><a class="btn btn-primary" href="/account/security">تفعيل التحقق بخطوتين</a>`}
      </section>` : ''}
      <details class="panel danger"><summary>${icon('trash', 'i i-sm')}حذف الحساب</summary>
        <p>راح تنحذف منشوراتك من الدليل، ويُستبدل اسمك ورقمك ببيانات مجهولة. هذا الإجراء نهائي.</p>
        <form method="post" action="/account/delete" class="form">${csrf}
          ${field({ name: 'password', label: 'اكتب كلمة المرور للتأكيد', type: 'password', required: true, attrs: 'autocomplete="current-password"' })}
          <button class="btn btn-danger" type="submit">حذف حسابي نهائياً</button></form>
      </details></div>`);
  };

  app.get('/account/settings', (req, reply) => { if (needUser(req, reply)) return; return settingsPage(req, reply); });

  app.post('/account/password', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (needUser(req, reply)) return;
    const b = req.body as Record<string, string>;
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
    if (!(await verifyPassword(String(b.current ?? ''), row.password_hash))) { reply.code(400); return settingsPage(req, reply, ['كلمة المرور الحالية غير صحيحة.']); }
    const problem = passwordProblem(String(b.password ?? ''), req.user!.phone);
    if (problem) { reply.code(400); return settingsPage(req, reply, [problem]); }
    db.prepare('UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?').run(await hashPassword(String(b.password)), req.user!.id);
    destroyUserSessions(db, req.user!.id);
    const s = createSession(db, req.user!, true);
    reply.setCookie(SESSION_COOKIE, s.token, { path: '/', httpOnly: true, sameSite: 'lax', secure: app.cfg.cookieSecure, maxAge: s.maxAge });
    return reply.flashRedirect('/account/settings', 'ok', 'تم تغيير كلمة المرور.');
  });

  app.post('/account/delete', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 5, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (needUser(req, reply)) return;
    const u = req.user!;
    if (u.role === 'super_admin') { reply.code(400); return settingsPage(req, reply, ['لا يمكن حذف حساب المدير العام من هنا.']); }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(u.id) as { password_hash: string };
    if (!(await verifyPassword(String((req.body as Record<string, string>).password ?? ''), row.password_hash))) { reply.code(400); return settingsPage(req, reply, ['كلمة المرور غير صحيحة.']); }
    db.transaction(() => {
      const posts = db.prepare("SELECT id FROM posts WHERE user_id = ? AND status <> 'removed'").pluck().all(u.id) as number[];
      for (const id of posts) {
        db.prepare("UPDATE posts SET status = 'removed', status_reason = 'حذف الحساب', updated_at = unixepoch() WHERE id = ?").run(id);
        db.prepare('DELETE FROM search_index WHERE post_id = ?').run(id);
      }
      db.prepare('UPDATE posts SET owner_id = NULL WHERE owner_id = ?').run(u.id);
      db.prepare("UPDATE users SET name = 'مستخدم محذوف', phone = 'deleted-' || id, password_hash = '!', role = 'user', status = 'deleted', totp_secret = NULL, totp_enabled = 0, updated_at = unixepoch() WHERE id = ?").run(u.id);
      db.prepare('DELETE FROM notifications WHERE user_id = ?').run(u.id);
      destroyUserSessions(db, u.id);
    })();
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.flashRedirect('/', 'ok', 'تم حذف حسابك.');
  });

  // ---------- التحقق بخطوتين (لحسابات الإدارة) ----------

  app.get('/account/security', (req, reply) => {
    if (needUser(req, reply)) return;
    const u = req.user!;
    if (u.totp_enabled) return reply.redirect('/account/settings', 303);
    let secret = (db.prepare('SELECT totp_secret FROM users WHERE id = ?').pluck().get(u.id) as string | null);
    if (!secret) { secret = newTotpSecret(); db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, u.id); }
    return reply.page(req, { title: 'التحقق بخطوتين', noindex: true }, html`<div class="wrap narrow">
      <h1>تفعيل التحقق بخطوتين</h1>
      <ol class="steps">
        <li>ثبّت تطبيق مصادقة على هاتفك (مثل Google Authenticator أو Microsoft Authenticator).</li>
        <li>اختر «إدخال مفتاح الإعداد» واكتب المفتاح التالي، ونوع المفتاح «حسب الوقت».</li>
        <li>اكتب الرمز المكوّن من ٦ أرقام اللي يظهر بالتطبيق.</li>
      </ol>
      <p class="secret" dir="ltr">${secret.match(/.{1,4}/g)!.join(' ')}</p>
      <details><summary>رابط الإعداد (للتطبيقات التي تدعمه)</summary><p dir="ltr" class="break">${otpauthUri(secret, u.phone)}</p></details>
      <form method="post" action="/account/security" class="form">${csrfInput(req)}
        ${field({ name: 'code', label: 'الرمز', required: true, dir: 'ltr', attrs: 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}"' })}
        <button class="btn btn-primary" type="submit">تفعيل</button></form></div>`);
  });

  app.post('/account/security', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 10, timeWindow: '15 minutes' } } }, (req, reply) => {
    if (needUser(req, reply)) return;
    const u = req.user!;
    const row = db.prepare('SELECT totp_secret, totp_enabled FROM users WHERE id = ?').get(u.id) as { totp_secret: string | null; totp_enabled: number };
    if (row.totp_enabled || !row.totp_secret) return reply.redirect('/account/settings', 303);
    const step = verifyTotp(row.totp_secret, String((req.body as Record<string, string>).code ?? '').trim(), null);
    if (step === null) return reply.flashRedirect('/account/security', 'error', 'الرمز غير صحيح. تأكد من وقت الهاتف وحاول مرة ثانية.');
    db.prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ?, updated_at = unixepoch() WHERE id = ?').run(step, u.id);
    audit(db, { actorId: u.id, action: 'auth.mfa_enabled', ipHash: req.ipHash });
    return reply.flashRedirect('/account/settings', 'ok', 'تم تفعيل التحقق بخطوتين.');
  });
}
