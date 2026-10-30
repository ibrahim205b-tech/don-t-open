import type { DB } from '../db/index.ts';
import { now } from '../db/index.ts';
import { can } from '../auth/rbac.ts';
import { audit } from './audit.ts';
import { notify } from './notifications.ts';
import { getPost, isPostOwner, reindex } from './posts.ts';
import { TYPES, type Post, type PostStatus, type User } from './types.ts';

export type Action = 'submit' | 'renew' | 'withdraw' | 'close' | 'approve' | 'reject' | 'request_changes' | 'hide' | 'unhide' | 'remove';

interface ActionDef { from: PostStatus[]; to: PostStatus; who: 'owner' | 'moderator' | 'admin'; reason: boolean; label: string }

export const ACTIONS: Record<Action, ActionDef> = {
  submit: { from: ['draft', 'changes_requested'], to: 'pending', who: 'owner', reason: false, label: 'إرسال للمراجعة' },
  renew: { from: ['expired'], to: 'pending', who: 'owner', reason: false, label: 'تجديد (يرجع للمراجعة)' },
  withdraw: { from: ['draft', 'pending', 'changes_requested', 'rejected', 'published', 'expired'], to: 'removed', who: 'owner', reason: false, label: 'حذف المنشور' },
  close: { from: ['published'], to: 'removed', who: 'owner', reason: false, label: 'انتهت الحاجة، أزل الطلب' },
  approve: { from: ['pending'], to: 'published', who: 'moderator', reason: false, label: 'موافقة ونشر' },
  reject: { from: ['pending'], to: 'rejected', who: 'moderator', reason: true, label: 'رفض' },
  request_changes: { from: ['pending'], to: 'changes_requested', who: 'moderator', reason: true, label: 'طلب تعديل' },
  hide: { from: ['published'], to: 'hidden', who: 'moderator', reason: true, label: 'إخفاء' },
  unhide: { from: ['hidden'], to: 'published', who: 'moderator', reason: false, label: 'إعادة إظهار' },
  remove: { from: ['draft', 'pending', 'changes_requested', 'rejected', 'published', 'hidden', 'expired'], to: 'removed', who: 'admin', reason: true, label: 'حذف (مخالفة)' },
};

const MESSAGES: Partial<Record<Action, (title: string, reason: string) => string>> = {
  approve: (t) => `تمت الموافقة على «${t}» وصار منشوراً.`,
  reject: (t, r) => `تم رفض «${t}». السبب: ${r}`,
  request_changes: (t, r) => `مطلوب تعديل على «${t}» قبل النشر: ${r}`,
  hide: (t, r) => `تم إخفاء «${t}» من العرض العام. السبب: ${r}`,
  unhide: (t) => `عاد «${t}» للظهور.`,
  remove: (t, r) => `تم حذف «${t}» من قبل الإدارة. السبب: ${r}`,
};

export class WorkflowError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

/** هل يحق للمستخدم تنفيذ الإجراء على هذا المنشور (من حيث الدور والعلاقة، بغض النظر عن الحالة)؟ */
export function mayPerform(action: Action, post: Post, actor: Pick<User, 'id' | 'role'>): boolean {
  const def = ACTIONS[action];
  if (def.who === 'owner') {
    if (action === 'close' && post.type !== 'help') return false;
    if (post.type === 'business' && post.owner_id !== null) return post.owner_id === actor.id;
    return post.user_id === actor.id;
  }
  if (def.who === 'admin') return can(actor.role, 'posts.remove');
  if (!can(actor.role, 'posts.moderate')) return false;
  // لا أحد يعتمد منشوره بنفسه، باستثناء المدير لما يضيفه من لوحة الإدارة.
  if ((action === 'approve' || action === 'unhide') && isPostOwner(post, actor.id) && !can(actor.role, 'posts.remove')) return false;
  return true;
}

export function availableActions(post: Post, actor: Pick<User, 'id' | 'role'>, who: 'owner' | 'staff'): Action[] {
  return (Object.keys(ACTIONS) as Action[]).filter((a) => {
    const d = ACTIONS[a];
    if ((who === 'owner') !== (d.who === 'owner')) return false;
    return d.from.includes(post.status) && mayPerform(a, post, actor);
  });
}

export function transition(db: DB, postId: number, action: Action, actor: Pick<User, 'id' | 'role'>, reason: string, ipHash: string | null = null): Post {
  const def = ACTIONS[action];
  const clean = reason.trim().slice(0, 500);
  return db.transaction(() => {
    const post = getPost(db, postId);
    if (!post) throw new WorkflowError('المنشور غير موجود.', 404);
    if (!mayPerform(action, post, actor)) {
      if (def.who !== 'owner') audit(db, { actorId: actor.id, action: `post.${action}`, targetType: 'post', targetId: post.id, result: 'denied', ipHash });
      throw new WorkflowError('لا تملك صلاحية تنفيذ هذا الإجراء.', 403);
    }
    if (!def.from.includes(post.status)) throw new WorkflowError('لا يمكن تنفيذ هذا الإجراء على المنشور بحالته الحالية.', 409);
    if (def.reason && clean.length < 3) throw new WorkflowError('اكتب سبباً واضحاً لهذا الإجراء.');
    const t = now();
    const sets: string[] = ['status = @to', 'status_reason = @reason', 'updated_at = @t'];
    if (def.to === 'published') {
      sets.push('approved_by = @actor', 'approved_at = @t');
      if (action === 'approve') {
        sets.push('published_at = @t');
        const days = post.type === 'offer' ? (Number(JSON.parse(post.details).valid_days) || null) : TYPES[post.type].expiryDays;
        sets.push(days ? `expires_at = ${t + days * 86400}` : 'expires_at = NULL');
      }
    }
    db.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = @id`).run({
      to: def.to, reason: def.reason ? clean : (action === 'close' ? 'انتهت الحاجة' : null), t, actor: actor.id, id: post.id,
    });
    db.prepare('INSERT INTO moderation_actions (post_id, actor_id, action, from_status, to_status, reason) VALUES (?, ?, ?, ?, ?, ?)')
      .run(post.id, actor.id, action, post.status, def.to, clean || null);
    reindex(db, post.id);
    if (def.who !== 'owner') {
      audit(db, { actorId: actor.id, action: `post.${action}`, targetType: 'post', targetId: post.id, meta: { from: post.status, to: def.to, reason: clean || undefined }, ipHash });
      const msg = MESSAGES[action]?.(post.title, clean);
      if (msg) for (const uid of new Set([post.user_id, post.owner_id].filter((x): x is number => x !== null && x !== actor.id))) notify(db, uid, msg, post.id);
    }
    return getPost(db, post.id)!;
  })();
}

/** ينهي المنشورات التي تجاوزت تاريخ انتهائها ويبلغ أصحابها. */
export function expireDue(db: DB): number {
  const due = db.prepare("SELECT id, user_id, title FROM posts WHERE status = 'published' AND expires_at IS NOT NULL AND expires_at <= unixepoch()").all() as Pick<Post, 'id' | 'user_id' | 'title'>[];
  const tx = db.transaction(() => {
    for (const p of due) {
      db.prepare("UPDATE posts SET status = 'expired', updated_at = unixepoch() WHERE id = ?").run(p.id);
      db.prepare("INSERT INTO moderation_actions (post_id, actor_id, action, from_status, to_status) VALUES (?, NULL, 'expire', 'published', 'expired')").run(p.id);
      db.prepare('DELETE FROM search_index WHERE post_id = ?').run(p.id);
      notify(db, p.user_id, `انتهت مدة عرض «${p.title}». تقدر تجدده من صفحة حسابك.`, p.id);
    }
  });
  tx();
  return due.length;
}
