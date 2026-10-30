import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { assignableRoles, can, canManageUser, type Permission } from '../auth/rbac.ts';
import { destroyUserSessions } from '../auth/sessions.ts';
import { now } from '../db/index.ts';
import { html, paragraphs, type SafeHtml } from '../lib/html.ts';
import { fmtDate, fmtDateTime, fmtNumber, fmtPrice } from '../lib/format.ts';
import { normalizePhone } from '../lib/arabic.ts';
import { hashPassword } from '../lib/password.ts';
import { audit, AUDIT_LABEL } from '../domain/audit.ts';
import { decideClaim, EngagementError, REPORT_REASONS } from '../domain/engagement.ts';
import { notify } from '../domain/notifications.ts';
import { getPost, getPostView, parseDetails, postImages, postItems, reindex } from '../domain/posts.ts';
import { cleanSetting, saveSettings, SETTINGS } from '../domain/settings.ts';
import { ROLE_LABEL, STATUS_LABEL, TYPES, TYPE_KEYS, isPostType, type Post, type PostStatus, type Role } from '../domain/types.ts';
import { ACTIONS, availableActions, transition, WorkflowError, type Action } from '../domain/workflow.ts';
import { errorList, field, mediaUrl, pagination, postUrl, select, statusBadge, textarea } from '../views/components.ts';
import { icon } from '../views/layout.ts';
import { csrfInput } from './form.ts';
import { forbidden, intParam, needPermission } from './guards.ts';

type Q = Record<string, string | undefined>;

const DETAIL_LABEL: Record<string, string> = {
  address: 'العنوان', hours: 'ساعات العمل', services: 'الخدمات', delivery: 'مناطق التوصيل', lat: 'خط العرض', lng: 'خط الطول',
  workplace: 'مكان العمل', employment: 'نوع الدوام', work_hours: 'ساعات العمل', requirements: 'الشروط',
  offer: 'نوع العرض', size: 'المساحة (م²)', landmark: 'أقرب نقطة دالة', work_areas: 'مناطق العمل', experience: 'الخبرة',
  condition: 'الحالة', valid_days: 'مدة العرض (أيام)', event_date: 'تاريخ الفعالية', location: 'المكان', organizer: 'الجهة المنظمة',
  blood_type: 'فصيلة الدم', consent_at: 'تأكيد موافقة صاحب الحالة',
};

const MENU: [string, string, string, Permission][] = [
  ['/admin', 'المؤشرات', 'grid', 'admin.access'],
  ['/admin/queue', 'مراجعة المنشورات', 'list', 'posts.moderate'],
  ['/admin/reviews', 'التقييمات', 'star', 'reviews.moderate'],
  ['/admin/reports', 'البلاغات', 'flag', 'reports.handle'],
  ['/admin/claims', 'طلبات الملكية', 'store', 'claims.review'],
  ['/admin/users', 'المستخدمون', 'user', 'users.manage'],
  ['/admin/catalog', 'التصنيفات والمناطق', 'tag', 'catalog.manage'],
  ['/admin/featured', 'الإعلانات المميزة', 'badge', 'featured.manage'],
  ['/admin/settings', 'إعدادات الموقع', 'settings', 'settings.manage'],
  ['/admin/audit', 'سجل التدقيق', 'shield', 'audit.view'],
];

export async function adminRoutes(app: FastifyInstance) {
  const db = app.db;

  // كل مسارات /admin تمر من هنا: جلسة صالحة + دور إداري من قاعدة البيانات + تحقق بخطوتين عند تفعيله.
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/admin')) return;
    if (needPermission(req, reply, 'admin.access')) return reply;
    if (app.cfg.adminRequireMfa && !req.user!.totp_enabled) {
      if (req.method === 'GET') return reply.flashRedirect('/account/security', 'error', 'فعّل التحقق بخطوتين قبل استخدام لوحة الإدارة.');
      reply.code(403).send('MFA required');
      return reply;
    }
  });

  const shell = (req: FastifyRequest, reply: FastifyReply, title: string, body: SafeHtml) => {
    const role = req.user!.role;
    const path = req.url.split('?')[0];
    return reply.page(req, { title: `${title} | الإدارة`, noindex: true, canonical: null, bodyClass: 'admin' }, html`<div class="wrap admin-wrap">
      <nav class="admin-nav" aria-label="أقسام الإدارة"><p class="admin-role">${req.user!.name}، ${ROLE_LABEL[role]}</p><ul>
        ${MENU.filter(([, , , p]) => can(role, p)).map(([href, label, ic]) => html`<li><a href="${href}" ${path === href ? html`aria-current="page"` : ''}>${icon(ic, 'i i-sm')}${label}</a></li>`)}
      </ul></nav>
      <div class="admin-main"><h1>${title}</h1>${body}</div></div>`);
  };

  const count = (sql: string, ...a: unknown[]) => db.prepare(sql).pluck().get(...a) as number;
  const fail = (reply: FastifyReply, back: string, e: unknown) => {
    if (e instanceof WorkflowError || e instanceof EngagementError) { reply.code(e.status); return reply.flashRedirect(back, 'error', e.message); }
    throw e;
  };

  // ---------- المؤشرات ----------

  app.get('/admin', (req, reply) => {
    const stat = (label: string, n: number, href?: string) => html`<li class="stat">${href ? html`<a href="${href}"><span class="stat-n">${fmtNumber(n)}</span><span>${label}</span></a>` : html`<span class="stat-n">${fmtNumber(n)}</span><span>${label}</span>`}</li>`;
    const recent = can(req.user!.role, 'audit.view')
      ? db.prepare('SELECT a.*, u.name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 12').all() as AuditRow[]
      : db.prepare("SELECT a.*, u.name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.actor_id = ? ORDER BY a.id DESC LIMIT 12").all(req.user!.id) as AuditRow[];
    return shell(req, reply, 'لوحة المؤشرات', html`
      <ul class="stats">
        ${stat('بانتظار المراجعة', count("SELECT count(*) FROM posts WHERE status = 'pending'"), '/admin/queue')}
        ${stat('منشورة', count("SELECT count(*) FROM posts WHERE status = 'published'"), '/admin/queue?status=published')}
        ${stat('مرفوضة', count("SELECT count(*) FROM posts WHERE status = 'rejected'"), '/admin/queue?status=rejected')}
        ${stat('بلاغات مفتوحة', count("SELECT count(*) FROM reports WHERE status = 'open'"), '/admin/reports')}
        ${stat('تقييمات بانتظار المراجعة', count("SELECT count(*) FROM reviews WHERE status = 'pending'"), '/admin/reviews')}
        ${stat('طلبات ملكية', count("SELECT count(*) FROM business_claims WHERE status = 'pending'"), can(req.user!.role, 'claims.review') ? '/admin/claims' : undefined)}
        ${stat('أنشطة تجارية منشورة', count("SELECT count(*) FROM posts WHERE type = 'business' AND status = 'published'"))}
        ${stat('المستخدمون', count("SELECT count(*) FROM users WHERE status <> 'deleted'"), can(req.user!.role, 'users.manage') ? '/admin/users' : undefined)}
      </ul>
      <h2>آخر العمليات الإدارية</h2>
      ${auditTable(recent)}`);
  });

  // ---------- طابور المراجعة ----------

  app.get('/admin/queue', (req, reply) => {
    if (needPermission(req, reply, 'posts.moderate')) return;
    const q = req.query as Q;
    const status = (q.status && q.status in STATUS_LABEL ? q.status : 'pending') as PostStatus;
    const type = isPostType(q.type) ? q.type : null;
    const where = ['p.status = ?']; const args: unknown[] = [status];
    if (type) { where.push('p.type = ?'); args.push(type); }
    if (q.q) { where.push('(p.title LIKE ? OR u.phone = ?)'); args.push(`%${q.q.slice(0, 60).replace(/[%_]/g, '')}%`, normalizePhone(q.q) ?? ''); }
    if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) { where.push('p.created_at >= ?'); args.push(Date.parse(q.from + 'T00:00:00+03:00') / 1000); }
    if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) { where.push('p.created_at < ?'); args.push(Date.parse(q.to + 'T00:00:00+03:00') / 1000 + 86400); }
    const total = count(`SELECT count(*) FROM posts p JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')}`, ...args);
    const pages = Math.max(1, Math.ceil(total / 30));
    const page = Math.min(Math.max(1, Number(q.page) || 1), pages);
    const rows = db.prepare(`SELECT p.id, p.type, p.title, p.status, p.created_at, p.updated_at, u.name AS author,
        (SELECT count(*) FROM reports r WHERE r.post_id = p.id AND r.status = 'open') AS open_reports
      FROM posts p JOIN users u ON u.id = p.user_id WHERE ${where.join(' AND ')} ORDER BY ${status === 'pending' ? 'p.updated_at ASC' : 'p.updated_at DESC'} LIMIT 30 OFFSET ?`)
      .all(...args, (page - 1) * 30) as (Post & { author: string; open_reports: number })[];
    const params = new URLSearchParams(Object.entries(q).filter(([k, v]) => v && k !== 'page') as [string, string][]);
    return shell(req, reply, 'مراجعة المنشورات', html`
      <form method="get" class="filter-form admin-filter">
        ${select({ name: 'status', label: 'الحالة', options: Object.entries(STATUS_LABEL), value: status, required: true })}
        ${select({ name: 'type', label: 'النوع', options: TYPE_KEYS.map((t) => [t, TYPES[t].single]), value: type, placeholder: 'الكل', required: true })}
        ${field({ name: 'q', label: 'عنوان أو رقم هاتف', value: q.q, required: true })}
        ${field({ name: 'from', label: 'من تاريخ', type: 'date', value: q.from, required: true })}
        ${field({ name: 'to', label: 'إلى تاريخ', type: 'date', value: q.to, required: true })}
        <div class="filter-actions"><button class="btn btn-primary" type="submit">عرض</button></div>
      </form>
      <p class="result-count">${fmtNumber(total)} منشور</p>
      ${rows.length ? html`<table class="data"><thead><tr><th scope="col">العنوان</th><th scope="col">النوع</th><th scope="col">صاحبه</th><th scope="col">آخر تحديث</th><th scope="col">الحالة</th></tr></thead><tbody>
        ${rows.map((r) => html`<tr><td><a href="/admin/posts/${r.id}">${r.title}</a>${r.open_reports ? html` <span class="status status-rejected">${r.open_reports} بلاغ</span>` : ''}</td><td>${TYPES[r.type].single}</td><td>${r.author}</td><td>${fmtDateTime(r.updated_at)}</td><td>${statusBadge(r.status)}</td></tr>`)}
      </tbody></table>` : html`<p class="empty-inline">${icon('check', 'i i-sm')}ما كو منشورات بهذه الحالة.</p>`}
      ${pagination(page, pages, params, '/admin/queue')}`);
  });

  app.get('/admin/posts/:id', (req, reply) => {
    if (needPermission(req, reply, 'posts.moderate')) return;
    const id = intParam((req.params as { id: string }).id);
    const p = id ? getPostView(db, id) : undefined;
    if (!p) return reply.callNotFound();
    const u = req.user!;
    const d = parseDetails(p);
    const author = db.prepare(`SELECT u.id, u.name, u.phone, u.role, u.status, u.created_at,
        (SELECT count(*) FROM posts WHERE user_id = u.id) AS posts, (SELECT count(*) FROM posts WHERE user_id = u.id AND status = 'rejected') AS rejected
      FROM users u WHERE u.id = ?`).get(p.user_id) as { id: number; name: string; phone: string; role: Role; status: string; created_at: number; posts: number; rejected: number };
    const owner = p.owner_id ? db.prepare('SELECT name, phone FROM users WHERE id = ?').get(p.owner_id) as { name: string; phone: string } : null;
    const history = db.prepare('SELECT m.*, u.name FROM moderation_actions m LEFT JOIN users u ON u.id = m.actor_id WHERE m.post_id = ? ORDER BY m.id DESC').all(p.id) as { action: string; from_status: string; to_status: string; reason: string | null; created_at: number; name: string | null }[];
    const revisions = db.prepare('SELECT r.snapshot, r.created_at, u.name FROM post_revisions r LEFT JOIN users u ON u.id = r.editor_id WHERE r.post_id = ? ORDER BY r.id DESC LIMIT 10').all(p.id) as { snapshot: string; created_at: number; name: string | null }[];
    const reports = db.prepare('SELECT id, reason, details, status, created_at FROM reports WHERE post_id = ? ORDER BY id DESC').all(p.id) as { id: number; reason: string; details: string; status: string; created_at: number }[];
    const acts = availableActions(p, u, 'staff');
    const csrf = csrfInput(req);
    const images = postImages(db, p.id);
    const items = p.type === 'business' ? postItems(db, p.id) : [];
    const isAuthor = p.user_id === u.id || p.owner_id === u.id;
    return shell(req, reply, p.title, html`
      <p>${TYPES[p.type].single} ${statusBadge(p.status)} ${p.verified ? html`<span class="badge badge-ok">${icon('badge', 'i i-sm')}موثّق</span>` : ''} ${p.is_official ? html`<span class="badge badge-ok">خبر مؤكد</span>` : ''}</p>
      ${p.status_reason ? html`<p class="note">السبب المسجل: ${p.status_reason}</p>` : ''}
      ${isAuthor && p.status === 'pending' && !can(u.role, 'posts.remove') ? html`<p class="note note-warn">هذا منشورك، ولا يمكنك اعتماده بنفسك.</p>` : ''}
      <div class="review-grid">
        <section class="review-main">
          <dl class="facts">
            <div><dt>التصنيف</dt><dd>${p.category_name}</dd></div><div><dt>المنطقة</dt><dd>${p.area_name}</dd></div>
            ${p.price !== null ? html`<div><dt>السعر</dt><dd>${fmtPrice(p.price)}</dd></div>` : ''}
            <div><dt>رقم التواصل</dt><dd dir="ltr">${p.contact_phone ?? '-'}</dd></div><div><dt>إظهار الرقم</dt><dd>${p.show_phone ? 'نعم' : 'لا'}</dd></div>
            ${Object.entries(d).map(([k, val]) => html`<div><dt>${DETAIL_LABEL[k] ?? k}</dt><dd>${k === 'consent_at' ? fmtDateTime(Number(val)) : String(val)}</dd></div>`)}
            <div><dt>تاريخ الإرسال</dt><dd>${fmtDateTime(p.created_at)}</dd></div><div><dt>آخر تحديث</dt><dd>${fmtDateTime(p.updated_at)}</dd></div>
            ${p.expires_at ? html`<div><dt>ينتهي</dt><dd>${fmtDateTime(p.expires_at)}</dd></div>` : ''}
          </dl>
          ${p.body ? html`<h2>النص</h2><div class="prose">${paragraphs(p.body)}</div>` : ''}
          ${images.length ? html`<h2>الصور (${images.length})</h2><ul class="thumbs">${images.map((im) => html`<li><a href="${mediaUrl(im.file)}" target="_blank"><img src="${mediaUrl(im.thumb)}" alt="صورة مرفوعة" width="160" height="120"></a></li>`)}</ul>` : ''}
          ${items.length ? html`<h2>الأصناف</h2><ul>${items.map((it) => html`<li>${it.name} - ${it.price !== null ? fmtPrice(it.price) : 'حسب الطلب'}</li>`)}</ul>` : ''}
          <p class="btn-row"><a href="${postUrl(p)}" target="_blank">معاينة كما تظهر للزوار</a>${p.type === 'business' && can(u.role, 'posts.verify') && !['rejected', 'removed', 'hidden'].includes(p.status) ? html` <a href="/account/posts/${p.id}/edit">تعديل بيانات النشاط</a>` : ''}</p>
        </section>
        <aside class="review-side">
          <section class="panel"><h2>صاحب المنشور</h2>
            <p><strong>${author.name}</strong> (${ROLE_LABEL[author.role]})${author.status !== 'active' ? html` <span class="status status-rejected">${author.status === 'disabled' ? 'معطّل' : 'محذوف'}</span>` : ''}</p>
            <p dir="ltr" class="end">${author.phone}</p>
            <p class="muted">حساب منذ ${fmtDate(author.created_at)}، ${fmtNumber(author.posts)} منشور، ${fmtNumber(author.rejected)} مرفوض</p>
            ${owner ? html`<p>المالك المعتمد: ${owner.name} <span dir="ltr">${owner.phone}</span></p>` : ''}
          </section>
          ${acts.length ? html`<section class="panel"><h2>القرار</h2>
            ${acts.filter((a) => !ACTIONS[a].reason).map((a) => html`<form method="post" action="/admin/posts/${p.id}/action">${csrf}<input type="hidden" name="action" value="${a}"><button class="btn ${a === 'approve' ? 'btn-primary' : ''} btn-block" type="submit">${ACTIONS[a].label}</button></form>`)}
            ${acts.some((a) => ACTIONS[a].reason) ? html`<form method="post" action="/admin/posts/${p.id}/action" class="form">${csrf}
              ${select({ name: 'action', label: 'إجراء يتطلب سبباً', options: acts.filter((a) => ACTIONS[a].reason).map((a) => [a, ACTIONS[a].label]), required: true, placeholder: 'اختر' })}
              ${textarea({ name: 'reason', label: 'السبب (يصل لصاحب المنشور)', required: true, max: 500, rows: 3 })}
              <button class="btn btn-block" type="submit">تنفيذ</button></form>` : ''}
          </section>` : ''}
          ${p.status === 'published' && (p.type === 'business' || p.type === 'help') && can(u.role, 'posts.verify') ? html`<section class="panel"><h2>التوثيق</h2>
            <p class="hint">${p.type === 'business' ? 'وثّق فقط بعد التحقق الفعلي من بيانات النشاط (زيارة أو اتصال بالرقم الرسمي).' : 'وثّق فقط بعد التحقق الفعلي من الحالة.'}</p>
            <form method="post" action="/admin/posts/${p.id}/verify">${csrf}<input type="hidden" name="value" value="${p.verified ? '0' : '1'}"><button class="btn btn-block" type="submit">${p.verified ? 'إلغاء التوثيق' : 'تم التحقق: وثّق'}</button></form></section>` : ''}
          ${p.type === 'community' && p.status === 'published' && can(u.role, 'posts.official') ? html`<section class="panel"><h2>الخبر</h2>
            <form method="post" action="/admin/posts/${p.id}/official">${csrf}<input type="hidden" name="value" value="${p.is_official ? '0' : '1'}"><button class="btn btn-block" type="submit">${p.is_official ? 'إلغاء وسم «مؤكد»' : 'وسم كخبر مؤكد'}</button></form></section>` : ''}
          ${reports.length ? html`<section class="panel"><h2>البلاغات</h2><ul>${reports.map((r) => html`<li>${REPORT_REASONS[r.reason]} (${r.status === 'open' ? 'مفتوح' : 'مغلق'})${r.details ? html`: ${r.details}` : ''}</li>`)}</ul><a href="/admin/reports">إدارة البلاغات</a></section>` : ''}
        </aside>
      </div>
      <h2>سجل الحالات</h2>
      <table class="data"><thead><tr><th scope="col">الوقت</th><th scope="col">بواسطة</th><th scope="col">الإجراء</th><th scope="col">السبب</th></tr></thead><tbody>
        ${history.map((h) => html`<tr><td>${fmtDateTime(h.created_at)}</td><td>${h.name ?? 'النظام'}</td><td>${STATUS_LABEL[h.from_status as PostStatus] ?? 'جديد'} ← ${STATUS_LABEL[h.to_status as PostStatus] ?? h.to_status}</td><td>${h.reason ?? ''}</td></tr>`)}
      </tbody></table>
      ${revisions.length ? html`<h2>سجل التعديلات</h2><p class="hint">كل سطر يعرض النسخة قبل التعديل.</p><ul class="revisions">${revisions.map((r) => {
        const s = JSON.parse(r.snapshot) as { title: string; body: string; price: number | null; contact_phone: string | null; images: string[] };
        return html`<li><details><summary>${fmtDateTime(r.created_at)}، ${r.name ?? ''}</summary><p><strong>${s.title}</strong></p><p>${s.body}</p><p>السعر: ${s.price ?? '-'}، الرقم: <span dir="ltr">${s.contact_phone ?? '-'}</span>، الصور: ${s.images.length}</p></details></li>`;
      })}</ul>` : ''}`);
  });

  app.post('/admin/posts/:id/action', (req, reply) => {
    if (needPermission(req, reply, 'posts.moderate')) return;
    const id = intParam((req.params as { id: string }).id);
    if (!id) return reply.callNotFound();
    const b = req.body as Q;
    const action = String(b.action ?? '') as Action;
    if (!(action in ACTIONS) || ACTIONS[action].who === 'owner') return reply.code(400).flashRedirect(`/admin/posts/${id}`, 'error', 'إجراء غير صالح.');
    try { transition(db, id, action, req.user!, String(b.reason ?? ''), req.ipHash); } catch (e) { return fail(reply, `/admin/posts/${id}`, e); }
    const next = action === 'approve' || action === 'reject' || action === 'request_changes'
      ? db.prepare("SELECT id FROM posts WHERE status = 'pending' AND id <> ? ORDER BY updated_at ASC LIMIT 1").pluck().get(id) as number | undefined : undefined;
    return reply.flashRedirect(next ? `/admin/posts/${next}` : '/admin/queue', 'ok', `تم: ${ACTIONS[action].label}.${next ? ' هذا المنشور التالي بالطابور.' : ''}`);
  });

  app.post('/admin/posts/:id/verify', (req, reply) => {
    if (needPermission(req, reply, 'posts.verify')) return;
    const id = intParam((req.params as { id: string }).id);
    const p = id ? getPost(db, id) : undefined;
    if (!p || !['business', 'help'].includes(p.type) || p.status !== 'published') return reply.callNotFound();
    const on = (req.body as Q).value === '1';
    db.prepare('UPDATE posts SET verified = ?, verified_by = ?, verified_at = ? WHERE id = ?').run(on ? 1 : 0, on ? req.user!.id : p.verified_by, on ? now() : p.verified_at, p.id);
    if (!on) db.prepare('UPDATE posts SET verified_by = NULL, verified_at = NULL WHERE id = ?').run(p.id);
    audit(db, { actorId: req.user!.id, action: on ? 'post.verify' : 'post.unverify', targetType: 'post', targetId: p.id, ipHash: req.ipHash });
    return reply.flashRedirect(`/admin/posts/${p.id}`, 'ok', on ? 'تم التوثيق.' : 'تم إلغاء التوثيق.');
  });

  app.post('/admin/posts/:id/official', (req, reply) => {
    if (needPermission(req, reply, 'posts.official')) return;
    const id = intParam((req.params as { id: string }).id);
    const p = id ? getPost(db, id) : undefined;
    if (!p || p.type !== 'community' || p.status !== 'published') return reply.callNotFound();
    const on = (req.body as Q).value === '1';
    db.prepare('UPDATE posts SET is_official = ?, verified_by = ? WHERE id = ?').run(on ? 1 : 0, req.user!.id, p.id);
    audit(db, { actorId: req.user!.id, action: on ? 'post.official' : 'post.unofficial', targetType: 'post', targetId: p.id, ipHash: req.ipHash });
    return reply.flashRedirect(`/admin/posts/${p.id}`, 'ok', 'تم التحديث.');
  });

  // ---------- التقييمات ----------

  app.get('/admin/reviews', (req, reply) => {
    if (needPermission(req, reply, 'reviews.moderate')) return;
    const rows = db.prepare(`SELECT r.*, u.name, u.created_at AS user_created, p.title, p.type,
        (SELECT count(*) FROM reviews x WHERE x.post_id = r.post_id AND x.ip_hash = r.ip_hash AND x.id <> r.id) AS same_net
      FROM reviews r JOIN users u ON u.id = r.user_id JOIN posts p ON p.id = r.post_id WHERE r.status = 'pending' ORDER BY r.id LIMIT 100`).all() as
      { id: number; rating: number; comment: string; created_at: number; name: string; user_created: number; title: string; type: keyof typeof TYPES; post_id: number; same_net: number }[];
    const csrf = csrfInput(req);
    return shell(req, reply, 'التقييمات بانتظار المراجعة', rows.length ? html`<ul class="cards-admin">${rows.map((r) => html`<li class="panel">
      <p><strong>${r.rating}/5</strong> على <a href="${postUrl({ id: r.post_id, type: r.type })}" target="_blank">${r.title}</a> من ${r.name} <span class="muted">(حساب منذ ${fmtDate(r.user_created)})</span></p>
      ${r.same_net ? html`<p class="note note-warn">${icon('alert', 'i i-sm')}${r.same_net} تقييم آخر لنفس المنشور من نفس الشبكة. راجع بعناية.</p>` : ''}
      ${r.comment ? html`<p>${r.comment}</p>` : ''}
      <div class="btn-row">
        <form method="post" action="/admin/reviews/${r.id}">${csrf}<input type="hidden" name="status" value="published"><button class="btn btn-primary" type="submit">نشر</button></form>
        <form method="post" action="/admin/reviews/${r.id}">${csrf}<input type="hidden" name="status" value="hidden"><button class="btn" type="submit">رفض وإخفاء</button></form>
      </div></li>`)}</ul>` : html`<p class="empty-inline">${icon('check', 'i i-sm')}ما كو تقييمات بانتظار المراجعة.</p>`);
  });

  app.post('/admin/reviews/:id', (req, reply) => {
    if (needPermission(req, reply, 'reviews.moderate')) return;
    const id = intParam((req.params as { id: string }).id);
    const status = (req.body as Q).status;
    if (!id || (status !== 'published' && status !== 'hidden')) return reply.code(400).send();
    const r = db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, id);
    if (!r.changes) return reply.callNotFound();
    audit(db, { actorId: req.user!.id, action: status === 'published' ? 'review.publish' : 'review.hide', targetType: 'review', targetId: id, ipHash: req.ipHash });
    return reply.flashRedirect('/admin/reviews', 'ok', 'تم.');
  });

  // ---------- البلاغات ----------

  app.get('/admin/reports', (req, reply) => {
    if (needPermission(req, reply, 'reports.handle')) return;
    const rows = db.prepare(`SELECT r.*, p.title, p.type, p.status AS post_status, v.comment AS review_comment, v.post_id AS review_post
      FROM reports r LEFT JOIN posts p ON p.id = r.post_id LEFT JOIN reviews v ON v.id = r.review_id
      WHERE r.status = 'open' ORDER BY r.id LIMIT 100`).all() as { id: number; post_id: number | null; review_id: number | null; reason: string; details: string; created_at: number; title: string | null; type: string | null; post_status: string | null; review_comment: string | null }[];
    const csrf = csrfInput(req);
    return shell(req, reply, 'البلاغات المفتوحة', rows.length ? html`<ul class="cards-admin">${rows.map((r) => html`<li class="panel">
      <p><strong>${REPORT_REASONS[r.reason]}</strong> <span class="muted">${fmtDateTime(r.created_at)}</span></p>
      ${r.post_id ? html`<p>منشور: <a href="/admin/posts/${r.post_id}">${r.title}</a> ${statusBadge(r.post_status as PostStatus)}</p>` : html`<p>تقييم: «${r.review_comment ?? ''}»</p>`}
      ${r.details ? html`<p>${r.details}</p>` : ''}
      <form method="post" action="/admin/reports/${r.id}" class="form compact">${csrf}
        ${field({ name: 'note', label: 'ملاحظة داخلية', max: 500 })}
        ${r.review_id ? html`<div class="check"><input type="checkbox" id="hide-${r.id}" name="hide_review" value="1"><label for="hide-${r.id}">إخفاء التقييم</label></div>` : ''}
        <div class="btn-row"><button class="btn btn-primary" type="submit" name="status" value="resolved">تمت المعالجة</button><button class="btn" type="submit" name="status" value="dismissed">بلاغ غير صحيح</button></div>
        ${r.post_id ? html`<p class="hint">لإخفاء المنشور أو حذفه افتحه واختر الإجراء مع السبب.</p>` : ''}
      </form></li>`)}</ul>` : html`<p class="empty-inline">${icon('check', 'i i-sm')}ما كو بلاغات مفتوحة.</p>`);
  });

  app.post('/admin/reports/:id', (req, reply) => {
    if (needPermission(req, reply, 'reports.handle')) return;
    const id = intParam((req.params as { id: string }).id);
    const b = req.body as Q;
    if (!id || (b.status !== 'resolved' && b.status !== 'dismissed')) return reply.code(400).send();
    const rep = db.prepare("SELECT * FROM reports WHERE id = ? AND status = 'open'").get(id) as { review_id: number | null } | undefined;
    if (!rep) return reply.callNotFound();
    db.transaction(() => {
      db.prepare('UPDATE reports SET status = ?, handled_by = ?, handled_at = unixepoch(), resolution_note = ? WHERE id = ?').run(b.status, req.user!.id, String(b.note ?? '').slice(0, 500) || null, id);
      if (rep.review_id && b.hide_review === '1') db.prepare("UPDATE reviews SET status = 'hidden' WHERE id = ?").run(rep.review_id);
      audit(db, { actorId: req.user!.id, action: b.status === 'resolved' ? 'report.resolve' : 'report.dismiss', targetType: 'report', targetId: id, ipHash: req.ipHash });
    })();
    return reply.flashRedirect('/admin/reports', 'ok', 'تم تحديث البلاغ.');
  });

  // ---------- طلبات الملكية ----------

  app.get('/admin/claims', (req, reply) => {
    if (needPermission(req, reply, 'claims.review')) return;
    const rows = db.prepare(`SELECT c.*, u.name, u.phone, p.title, p.contact_phone FROM business_claims c JOIN users u ON u.id = c.user_id JOIN posts p ON p.id = c.post_id
      WHERE c.status = 'pending' ORDER BY c.id`).all() as { id: number; post_id: number; message: string; created_at: number; name: string; phone: string; title: string; contact_phone: string | null }[];
    const csrf = csrfInput(req);
    return shell(req, reply, 'طلبات ملكية الأنشطة', html`<p class="hint">اعتمد المالك فقط بعد التحقق، مثلاً بالاتصال على رقم المحل المسجل ومطابقة الاسم.</p>
      ${rows.length ? html`<ul class="cards-admin">${rows.map((c) => html`<li class="panel">
        <p><a href="/admin/posts/${c.post_id}">${c.title}</a>، رقم المحل المسجل: <span dir="ltr">${c.contact_phone ?? '-'}</span></p>
        <p>الطالب: ${c.name} <span dir="ltr">${c.phone}</span> <span class="muted">${fmtDateTime(c.created_at)}</span></p>
        <p>${c.message}</p>
        <form method="post" action="/admin/claims/${c.id}" class="form compact">${csrf}
          ${field({ name: 'note', label: 'ملاحظة (تصل للطالب عند الرفض)', max: 500 })}
          <div class="btn-row"><button class="btn btn-primary" type="submit" name="decision" value="approve">اعتماد المالك</button><button class="btn" type="submit" name="decision" value="reject">رفض</button></div>
        </form></li>`)}</ul>` : html`<p class="empty-inline">${icon('check', 'i i-sm')}ما كو طلبات معلقة.</p>`}`);
  });

  app.post('/admin/claims/:id', (req, reply) => {
    if (needPermission(req, reply, 'claims.review')) return;
    const id = intParam((req.params as { id: string }).id);
    const b = req.body as Q;
    if (!id || (b.decision !== 'approve' && b.decision !== 'reject')) return reply.code(400).send();
    try { decideClaim(db, id, b.decision === 'approve', req.user!, String(b.note ?? ''), req.ipHash); } catch (e) { return fail(reply, '/admin/claims', e); }
    return reply.flashRedirect('/admin/claims', 'ok', 'تم.');
  });

  // ---------- المستخدمون ----------

  app.get('/admin/users', (req, reply) => {
    if (needPermission(req, reply, 'users.manage')) return;
    const q = req.query as Q;
    const where = ["status <> 'deleted'"]; const args: unknown[] = [];
    if (q.q) { where.push('(name LIKE ? OR phone = ?)'); args.push(`%${q.q.slice(0, 60).replace(/[%_]/g, '')}%`, normalizePhone(q.q) ?? ''); }
    if (q.role && q.role in ROLE_LABEL) { where.push('role = ?'); args.push(q.role); }
    const rows = db.prepare(`SELECT id, name, phone, role, status, created_at, last_login_at, totp_enabled,
      (SELECT count(*) FROM posts WHERE user_id = users.id) AS posts FROM users WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 100`).all(...args) as
      { id: number; name: string; phone: string; role: Role; status: string; created_at: number; last_login_at: number | null; totp_enabled: number; posts: number }[];
    const me = req.user!;
    const csrf = csrfInput(req);
    return shell(req, reply, 'المستخدمون', html`
      <form method="get" class="filter-form admin-filter">${field({ name: 'q', label: 'اسم أو رقم هاتف', value: q.q, required: true })}
        ${select({ name: 'role', label: 'الدور', options: Object.entries(ROLE_LABEL), value: q.role, placeholder: 'الكل', required: true })}
        <div class="filter-actions"><button class="btn btn-primary" type="submit">بحث</button></div></form>
      <table class="data"><thead><tr><th scope="col">الاسم</th><th scope="col">الهاتف</th><th scope="col">الدور</th><th scope="col">الحالة</th><th scope="col">منشورات</th><th scope="col">إجراءات</th></tr></thead><tbody>
      ${rows.map((u) => {
        const manageable = canManageUser(me, u);
        return html`<tr><td>${u.name}${u.totp_enabled ? html` <span title="تحقق بخطوتين مفعّل">${icon('shield', 'i i-xs')}</span>` : ''}</td><td dir="ltr">${u.phone}</td><td>${ROLE_LABEL[u.role]}</td>
          <td>${u.status === 'active' ? 'فعّال' : 'معطّل'}</td><td>${u.posts}</td>
          <td>${manageable ? html`<div class="btn-row">
            <form method="post" action="/admin/users/${u.id}/status">${csrf}<input type="hidden" name="status" value="${u.status === 'active' ? 'disabled' : 'active'}"><button class="btn btn-sm" type="submit">${u.status === 'active' ? 'تعطيل' : 'تفعيل'}</button></form>
            <form method="post" action="/admin/users/${u.id}/role" class="inline-select">${csrf}<label class="sr" for="role-${u.id}">الدور</label><select id="role-${u.id}" name="role">${assignableRoles(me.role).map((r) => html`<option value="${r}" ${r === u.role ? html`selected` : ''}>${ROLE_LABEL[r]}</option>`)}</select><button class="btn btn-sm" type="submit">حفظ الدور</button></form>
            <form method="post" action="/admin/users/${u.id}/reset-password">${csrf}<button class="btn btn-sm" type="submit">كلمة مرور مؤقتة</button></form>
          </div>` : html`<span class="muted">-</span>`}</td></tr>`;
      })}</tbody></table>`);
  });

  /** يحمّل المستخدم الهدف ويتأكد أن المنفّذ يملك إدارته (رتبة أعلى، وليس حسابه). */
  function target(req: FastifyRequest, reply: FastifyReply, action: string): { id: number; role: Role; name: string } | null {
    const id = intParam((req.params as { id: string }).id);
    const t = id ? db.prepare("SELECT id, role, name FROM users WHERE id = ? AND status <> 'deleted'").get(id) as { id: number; role: Role; name: string } | undefined : undefined;
    if (!t) { reply.callNotFound(); return null; }
    if (!canManageUser(req.user!, t)) {
      audit(db, { actorId: req.user!.id, action, targetType: 'user', targetId: t.id, result: 'denied', ipHash: req.ipHash });
      forbidden(req, reply, 'لا تملك صلاحية إدارة هذا الحساب.');
      return null;
    }
    return t;
  }

  app.post('/admin/users/:id/status', (req, reply) => {
    if (needPermission(req, reply, 'users.manage')) return;
    const t = target(req, reply, 'user.status'); if (!t) return;
    const status = (req.body as Q).status;
    if (status !== 'active' && status !== 'disabled') return reply.code(400).send();
    db.prepare('UPDATE users SET status = ?, updated_at = unixepoch() WHERE id = ?').run(status, t.id);
    if (status === 'disabled') destroyUserSessions(db, t.id);
    audit(db, { actorId: req.user!.id, action: status === 'disabled' ? 'user.disable' : 'user.enable', targetType: 'user', targetId: t.id, ipHash: req.ipHash });
    return reply.flashRedirect('/admin/users', 'ok', status === 'disabled' ? `تم تعطيل حساب ${t.name}.` : `تم تفعيل حساب ${t.name}.`);
  });

  app.post('/admin/users/:id/role', (req, reply) => {
    if (needPermission(req, reply, 'users.manage')) return;
    const t = target(req, reply, 'user.role'); if (!t) return;
    const role = String((req.body as Q).role ?? '') as Role;
    if (!assignableRoles(req.user!.role).includes(role)) {
      audit(db, { actorId: req.user!.id, action: 'user.role', targetType: 'user', targetId: t.id, result: 'denied', meta: { role }, ipHash: req.ipHash });
      return forbidden(req, reply, 'لا يمكنك منح هذا الدور.');
    }
    db.prepare('UPDATE users SET role = ?, updated_at = unixepoch() WHERE id = ?').run(role, t.id);
    destroyUserSessions(db, t.id); // تغيير الصلاحيات يُنهي جلسات الحساب ليعيد الدخول بالصلاحيات الجديدة
    audit(db, { actorId: req.user!.id, action: 'user.role', targetType: 'user', targetId: t.id, meta: { from: t.role, to: role }, ipHash: req.ipHash });
    notify(db, t.id, `تم تغيير دور حسابك إلى: ${ROLE_LABEL[role]}.`);
    return reply.flashRedirect('/admin/users', 'ok', 'تم تغيير الدور.');
  });

  app.post('/admin/users/:id/reset-password', async (req, reply) => {
    if (needPermission(req, reply, 'users.manage')) return;
    const t = target(req, reply, 'user.reset_password'); if (!t) return;
    const temp = crypto.randomBytes(9).toString('base64url');
    db.prepare('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = unixepoch() WHERE id = ?').run(await hashPassword(temp), t.id);
    destroyUserSessions(db, t.id);
    audit(db, { actorId: req.user!.id, action: 'user.reset_password', targetType: 'user', targetId: t.id, ipHash: req.ipHash });
    notify(db, t.id, 'تمت إعادة تعيين كلمة مرورك من الإدارة. غيّرها من إعدادات الحساب فوراً.');
    return shell(req, reply, 'كلمة مرور مؤقتة', html`<p>كلمة المرور المؤقتة لحساب ${t.name}:</p><p class="secret" dir="ltr">${temp}</p>
      <p class="note note-warn">تظهر هذه المرة فقط. سلّمها لصاحب الحساب بعد التحقق من هويته، واطلب منه تغييرها مباشرة.</p><p><a class="btn" href="/admin/users">رجوع</a></p>`);
  });

  // ---------- التصنيفات والمناطق ----------

  app.get('/admin/catalog', (req, reply) => {
    if (needPermission(req, reply, 'catalog.manage')) return;
    const cats = db.prepare('SELECT c.*, (SELECT count(*) FROM posts WHERE category_id = c.id) AS used FROM categories c ORDER BY section, sort, name').all() as { id: number; section: keyof typeof TYPES; name: string; sort: number; active: number; is_food: number; used: number }[];
    const areas = db.prepare('SELECT a.*, (SELECT count(*) FROM posts WHERE area_id = a.id) AS used FROM areas a ORDER BY sort, name').all() as { id: number; name: string; sort: number; active: number; used: number }[];
    const csrf = csrfInput(req);
    const row = (kind: 'category' | 'area', r: { id: number; name: string; sort: number; active: number; used: number; is_food?: number }) => html`<tr>
      <td><form method="post" action="/admin/catalog/${kind}/${r.id}" class="inline-edit">${csrf}
        <label class="sr" for="${kind}-${r.id}-n">الاسم</label><input id="${kind}-${r.id}-n" name="name" value="${r.name}" maxlength="60" required>
        <label class="sr" for="${kind}-${r.id}-s">الترتيب</label><input id="${kind}-${r.id}-s" name="sort" value="${r.sort}" inputmode="numeric" class="w-sort">
        <label class="check-inline"><input type="checkbox" name="active" value="1" ${r.active ? html`checked` : ''}> مفعّل</label>
        ${kind === 'category' ? html`<label class="check-inline"><input type="checkbox" name="is_food" value="1" ${r.is_food ? html`checked` : ''}> مطاعم</label>` : ''}
        <button class="btn btn-sm" type="submit">حفظ</button></form></td><td>${r.used}</td></tr>`;
    return shell(req, reply, 'التصنيفات والمناطق', html`
      <h2>المناطق</h2>
      <table class="data"><thead><tr><th scope="col">المنطقة</th><th scope="col">مستخدمة</th></tr></thead><tbody>${areas.map((a) => row('area', a))}</tbody></table>
      <form method="post" action="/admin/catalog/area" class="form compact">${csrf}${field({ name: 'name', label: 'منطقة فرعية جديدة', required: true, max: 60 })}<button class="btn btn-primary" type="submit">إضافة منطقة</button></form>
      <h2>التصنيفات</h2>
      ${TYPE_KEYS.map((t) => html`<h3>${TYPES[t].label}</h3><table class="data"><thead><tr><th scope="col">التصنيف</th><th scope="col">مستخدم</th></tr></thead><tbody>${cats.filter((c) => c.section === t).map((c) => row('category', c))}</tbody></table>`)}
      <form method="post" action="/admin/catalog/category" class="form compact">${csrf}
        ${select({ name: 'section', label: 'القسم', options: TYPE_KEYS.map((t) => [t, TYPES[t].label]), required: true, placeholder: 'اختر' })}
        ${field({ name: 'name', label: 'اسم التصنيف', required: true, max: 60 })}
        <button class="btn btn-primary" type="submit">إضافة تصنيف</button></form>
      <p class="hint">لا يمكن حذف تصنيف أو منطقة مستخدمة؛ عطّلها بدلاً من ذلك فتختفي من النماذج الجديدة.</p>`);
  });

  const cleanName = (v: unknown) => { const s = String(v ?? '').trim().replace(/\s+/g, ' '); return s.length >= 2 && s.length <= 60 && !/[<>]/.test(s) ? s : null; };

  app.post('/admin/catalog/:kind', (req, reply) => {
    if (needPermission(req, reply, 'catalog.manage')) return;
    const kind = (req.params as { kind: string }).kind;
    const b = req.body as Q;
    const name = cleanName(b.name);
    if (!name) return reply.flashRedirect('/admin/catalog', 'error', 'الاسم من ٢ إلى ٦٠ حرفاً.');
    try {
      if (kind === 'area') db.prepare('INSERT INTO areas (name, sort) VALUES (?, (SELECT coalesce(max(sort), 0) + 1 FROM areas))').run(name);
      else if (kind === 'category' && isPostType(b.section)) db.prepare('INSERT INTO categories (section, name, sort) VALUES (?, ?, (SELECT coalesce(max(sort), 0) + 1 FROM categories WHERE section = ?))').run(b.section, name, b.section);
      else return reply.code(400).send();
    } catch (e) { if (String(e).includes('UNIQUE')) return reply.flashRedirect('/admin/catalog', 'error', 'الاسم موجود مسبقاً.'); throw e; }
    audit(db, { actorId: req.user!.id, action: kind === 'area' ? 'area.save' : 'category.save', meta: { name, created: true }, ipHash: req.ipHash });
    return reply.flashRedirect('/admin/catalog', 'ok', 'تمت الإضافة.');
  });

  app.post('/admin/catalog/:kind/:id', (req, reply) => {
    if (needPermission(req, reply, 'catalog.manage')) return;
    const { kind } = req.params as { kind: string };
    const id = intParam((req.params as { id: string }).id);
    const b = req.body as Q;
    const name = cleanName(b.name);
    const sort = Number(b.sort);
    if (!id || !name || !Number.isInteger(sort) || sort < 0 || sort > 1000) return reply.flashRedirect('/admin/catalog', 'error', 'تحقق من الاسم والترتيب.');
    try {
      const r = kind === 'area'
        ? db.prepare('UPDATE areas SET name = ?, sort = ?, active = ? WHERE id = ?').run(name, sort, b.active === '1' ? 1 : 0, id)
        : kind === 'category' ? db.prepare('UPDATE categories SET name = ?, sort = ?, active = ?, is_food = ? WHERE id = ?').run(name, sort, b.active === '1' ? 1 : 0, b.is_food === '1' ? 1 : 0, id) : null;
      if (!r?.changes) return reply.callNotFound();
    } catch (e) { if (String(e).includes('UNIQUE')) return reply.flashRedirect('/admin/catalog', 'error', 'الاسم موجود مسبقاً.'); throw e; }
    if (kind === 'category') for (const pid of db.prepare("SELECT id FROM posts WHERE category_id = ? AND status = 'published'").pluck().all(id) as number[]) reindex(db, pid);
    audit(db, { actorId: req.user!.id, action: kind === 'area' ? 'area.save' : 'category.save', targetType: kind, targetId: id, meta: { name, active: b.active === '1' }, ipHash: req.ipHash });
    return reply.flashRedirect('/admin/catalog', 'ok', 'تم الحفظ.');
  });

  // ---------- الإعلانات المميزة ----------

  app.get('/admin/featured', (req, reply) => {
    if (needPermission(req, reply, 'featured.manage')) return;
    const rows = db.prepare(`SELECT f.*, p.title, p.type, p.status FROM featured_listings f JOIN posts p ON p.id = f.post_id
      WHERE f.ends_at > unixepoch() ORDER BY f.starts_at`).all() as { id: number; post_id: number; placement: string; starts_at: number; ends_at: number; note: string; title: string; type: keyof typeof TYPES; status: PostStatus }[];
    const csrf = csrfInput(req);
    return shell(req, reply, 'الإعلانات المميزة', html`
      <p class="hint">الترويج يُضاف يدوياً بعد الاتفاق مع صاحب الإعلان. يظهر الإعلان المميز فقط إذا كان منشوراً.</p>
      ${rows.length ? html`<table class="data"><thead><tr><th scope="col">المنشور</th><th scope="col">الموضع</th><th scope="col">من</th><th scope="col">إلى</th><th scope="col">ملاحظة</th><th scope="col"></th></tr></thead><tbody>
        ${rows.map((f) => html`<tr><td><a href="/admin/posts/${f.post_id}">${f.title}</a> ${statusBadge(f.status)}</td><td>${f.placement === 'home' ? 'الرئيسية' : 'صفحة القسم'}</td><td>${fmtDate(f.starts_at)}</td><td>${fmtDate(f.ends_at)}</td><td>${f.note}</td>
        <td><form method="post" action="/admin/featured/${f.id}/end">${csrf}<button class="btn btn-sm" type="submit">إنهاء الآن</button></form></td></tr>`)}
      </tbody></table>` : html`<p class="empty-inline">ما كو إعلانات مميزة حالياً.</p>`}
      <h2>إضافة ترويج</h2>
      <form method="post" action="/admin/featured" class="form compact">${csrf}
        ${field({ name: 'post_id', label: 'رقم المنشور', required: true, attrs: 'inputmode="numeric"', hint: 'الرقم الظاهر في رابط المنشور' })}
        ${select({ name: 'placement', label: 'الموضع', options: [['home', 'الصفحة الرئيسية'], ['section', 'أعلى صفحة القسم']], required: true })}
        ${field({ name: 'starts', label: 'تاريخ البداية', type: 'date', required: true, value: new Date().toISOString().slice(0, 10) })}
        ${field({ name: 'days', label: 'المدة بالأيام', required: true, value: '7', attrs: 'inputmode="numeric"' })}
        ${field({ name: 'note', label: 'ملاحظة (مثل رقم الاتفاق أو المبلغ)', max: 300 })}
        <button class="btn btn-primary" type="submit">إضافة</button></form>`);
  });

  app.post('/admin/featured', (req, reply) => {
    if (needPermission(req, reply, 'featured.manage')) return;
    const b = req.body as Q;
    const postId = intParam(b.post_id);
    const days = Number(b.days);
    const starts = b.starts && /^\d{4}-\d{2}-\d{2}$/.test(b.starts) ? Date.parse(b.starts + 'T00:00:00+03:00') / 1000 : NaN;
    const p = postId ? getPost(db, postId) : undefined;
    if (!p || p.status !== 'published') return reply.flashRedirect('/admin/featured', 'error', 'المنشور غير موجود أو غير منشور.');
    if (!Number.isInteger(days) || days < 1 || days > 365 || !Number.isFinite(starts) || (b.placement !== 'home' && b.placement !== 'section'))
      return reply.flashRedirect('/admin/featured', 'error', 'تحقق من التاريخ والمدة (١ إلى ٣٦٥ يوماً) والموضع.');
    const r = db.prepare('INSERT INTO featured_listings (post_id, placement, starts_at, ends_at, note, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.id, b.placement, starts, starts + days * 86400, String(b.note ?? '').slice(0, 300), req.user!.id);
    audit(db, { actorId: req.user!.id, action: 'featured.create', targetType: 'post', targetId: p.id, meta: { featured: Number(r.lastInsertRowid), placement: b.placement, days }, ipHash: req.ipHash });
    return reply.flashRedirect('/admin/featured', 'ok', 'تمت إضافة الترويج.');
  });

  app.post('/admin/featured/:id/end', (req, reply) => {
    if (needPermission(req, reply, 'featured.manage')) return;
    const id = intParam((req.params as { id: string }).id);
    if (!id) return reply.callNotFound();
    const t = now();
    const r = db.prepare('UPDATE featured_listings SET ends_at = max(starts_at + 1, ?) WHERE id = ? AND ends_at > ?').run(t, id, t);
    if (!r.changes) return reply.callNotFound();
    audit(db, { actorId: req.user!.id, action: 'featured.end', targetType: 'featured', targetId: id, ipHash: req.ipHash });
    return reply.flashRedirect('/admin/featured', 'ok', 'تم إنهاء الترويج.');
  });

  // ---------- الإعدادات ----------

  const settingsForm = (req: FastifyRequest, reply: FastifyReply, errors: string[] = [], values = req.settings) => shell(req, reply, 'إعدادات الموقع', html`
    ${errorList(errors)}
    <p class="hint">حقوق الملكية في التذييل («جميع الحقوق محفوظة © إبراهيم علي الشويلي») ثابتة ولا تُعدَّل من هنا. إعدادات الأمان (التحقق بخطوتين، الجلسات، المراجعة الإلزامية) تُدار من إعدادات الخادم فقط.</p>
    <form method="post" action="/admin/settings" class="form">${csrfInput(req)}
      ${Object.entries(SETTINGS).map(([k, d]) => d.kind === 'longtext'
        ? textarea({ name: k, label: d.label, value: values[k], max: d.max, rows: 8, required: true })
        : d.kind === 'sections'
          ? html`<fieldset class="group"><legend>${d.label}</legend>${TYPE_KEYS.map((t) => html`<label class="check-inline"><input type="checkbox" name="${k}" value="${t}" ${values[k].split(',').includes(t) ? html`checked` : ''}> ${TYPES[t].label}</label>`)}</fieldset>`
          : field({ name: k, label: d.label, value: values[k], required: d.kind !== 'url' && k !== 'announcement' && k !== 'footer_note', hint: d.help, dir: d.kind === 'phone' || d.kind === 'url' ? 'ltr' : undefined }))}
      <button class="btn btn-primary btn-lg" type="submit">حفظ الإعدادات</button>
    </form>`);

  app.get('/admin/settings', (req, reply) => { if (needPermission(req, reply, 'settings.manage')) return; return settingsForm(req, reply); });

  app.post('/admin/settings', (req, reply) => {
    if (needPermission(req, reply, 'settings.manage')) return;
    const b = req.body as Record<string, string | string[]>;
    const unknown = Object.keys(b).filter((k) => k !== '_csrf' && !(k in SETTINGS));
    if (unknown.length) {
      audit(db, { actorId: req.user!.id, action: 'settings.update', result: 'denied', meta: { unknown }, ipHash: req.ipHash });
      reply.code(400);
      return settingsForm(req, reply, ['النموذج يحتوي حقولاً غير مسموح بها.']);
    }
    const errors: string[] = []; const values: Record<string, string> = {};
    for (const k of Object.keys(SETTINGS)) {
      const r = cleanSetting(k, b[k] ?? (SETTINGS[k].kind === 'sections' ? '' : undefined));
      if ('error' in r) errors.push(r.error); else values[k] = r.value;
    }
    if (errors.length) { reply.code(400); return settingsForm(req, reply, errors, { ...req.settings, ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, String(v)])) }); }
    const changed = Object.keys(values).filter((k) => values[k] !== req.settings[k]);
    saveSettings(db, values, req.user!.id);
    audit(db, { actorId: req.user!.id, action: 'settings.update', meta: { changed }, ipHash: req.ipHash });
    return reply.flashRedirect('/admin/settings', 'ok', 'تم حفظ الإعدادات.');
  });

  // ---------- سجل التدقيق ----------

  app.get('/admin/audit', (req, reply) => {
    if (needPermission(req, reply, 'audit.view')) return;
    const page = Math.max(1, Number((req.query as Q).page) || 1);
    const total = count('SELECT count(*) FROM audit_logs');
    const pages = Math.max(1, Math.ceil(total / 50));
    const rows = db.prepare('SELECT a.*, u.name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 50 OFFSET ?').all((Math.min(page, pages) - 1) * 50) as AuditRow[];
    return shell(req, reply, 'سجل التدقيق', html`<p class="hint">السجل للإضافة فقط: لا يمكن تعديله أو حذفه من التطبيق أو من قاعدة البيانات مباشرة.</p>${auditTable(rows)}${pagination(Math.min(page, pages), pages, new URLSearchParams(), '/admin/audit')}`);
  });
}

interface AuditRow { id: number; actor_id: number | null; name: string | null; action: string; target_type: string | null; target_id: number | null; result: string; meta: string; created_at: number }

function auditTable(rows: AuditRow[]): SafeHtml {
  if (!rows.length) return html`<p class="empty-inline">ما كو عمليات مسجلة بعد.</p>`;
  return html`<table class="data"><thead><tr><th scope="col">الوقت</th><th scope="col">المنفّذ</th><th scope="col">العملية</th><th scope="col">الهدف</th><th scope="col">النتيجة</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td>${fmtDateTime(r.created_at)}</td><td>${r.name ?? '-'}</td><td>${AUDIT_LABEL[r.action] ?? r.action}</td>
      <td>${r.target_type === 'post' && r.target_id ? html`<a href="/admin/posts/${r.target_id}">منشور ${r.target_id}</a>` : r.target_type ? `${r.target_type} ${r.target_id ?? ''}` : '-'}</td>
      <td>${r.result === 'ok' ? 'نجحت' : r.result === 'denied' ? html`<span class="status status-rejected">مرفوضة</span>` : 'خطأ'}</td></tr>`)}
  </tbody></table>`;
}

