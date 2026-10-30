import type { FastifyReply, FastifyRequest } from 'fastify';
import { can, type Permission } from '../auth/rbac.ts';
import { audit } from '../domain/audit.ts';
import { html } from '../lib/html.ts';

/** يعيد التوجيه لتسجيل الدخول إذا لم يكن هناك مستخدم. يُرجع true إذا تم إيقاف الطلب. */
export function needUser(req: FastifyRequest, reply: FastifyReply): boolean {
  if (req.user) return false;
  if (req.method === 'GET') reply.redirect('/login?next=' + encodeURIComponent(req.url), 303);
  else reply.code(401).page(req, { title: 'سجّل الدخول', noindex: true }, html`<div class="wrap narrow"><h1>سجّل الدخول أولاً</h1><p><a class="btn btn-primary" href="/login">تسجيل الدخول</a></p></div>`);
  return true;
}

export function forbidden(req: FastifyRequest, reply: FastifyReply, text = 'لا تملك صلاحية الوصول لهذه الصفحة.') {
  return reply.code(403).page(req, { title: 'غير مسموح', noindex: true, canonical: null }, html`<div class="wrap narrow"><h1>غير مسموح</h1><p>${text}</p><p><a class="btn" href="/">الرئيسية</a></p></div>`);
}

/** يتحقق من الصلاحية على الخادم في كل طلب، ويسجل المحاولات المرفوضة في سجل التدقيق. */
export function needPermission(req: FastifyRequest, reply: FastifyReply, perm: Permission): boolean {
  if (needUser(req, reply)) return true;
  if (can(req.user!.role, perm)) return false;
  audit(req.server.db, { actorId: req.user!.id, action: 'admin.access_denied', result: 'denied', meta: { perm, url: req.url.slice(0, 200), method: req.method }, ipHash: req.ipHash });
  forbidden(req, reply);
  return true;
}

export const intParam = (v: unknown): number | null => (typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : null);

export function safeNext(next: unknown): string {
  return typeof next === 'string' && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) && !next.startsWith('/\\') ? next : '/account';
}
