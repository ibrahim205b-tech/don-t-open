import type { FastifyRequest } from 'fastify';
import { csrfToken } from '../auth/csrf.ts';
import { html } from '../lib/html.ts';

/** القيمة التي يرتبط بها رمز CSRF لهذا الطلب: الجلسة إن وُجدت، وإلا معرّف الزائر. */
export function bindOf(req: FastifyRequest): string {
  return req.session ? 's:' + req.session.id : req.pendingMfa ? 's:' + req.pendingMfa.session.id : 'a:' + req.anonId;
}

export const csrfOf = (req: FastifyRequest) => csrfToken(req.server.cfg.sessionSecret, bindOf(req));
export const csrfInput = (req: FastifyRequest) => html`<input type="hidden" name="_csrf" value="${csrfOf(req)}">`;
