import type { DB } from '../db/index.ts';
import { now } from '../db/index.ts';
import { audit } from './audit.ts';
import { notify } from './notifications.ts';
import { getPost, isPostOwner } from './posts.ts';
import type { User } from './types.ts';

export class EngagementError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

// ---------- التقييمات ----------

export const REVIEWS_PER_DAY = 5;

/**
 * التقييم يُحفظ «بانتظار المراجعة» ولا يُحتسب حتى يعتمده مشرف.
 * القيود: حساب بعمر أدنى، تقييم واحد لكل منشور، حد يومي، لا تقييم لمنشورك، وتعليق نظيف.
 */
export function addReview(db: DB, user: Pick<User, 'id' | 'created_at'>, postId: number, rating: number, comment: string, ipHash: string, minAgeHours: number) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new EngagementError('اختر تقييماً من ١ إلى ٥.');
  const text = comment.trim();
  if (text.length > 600) throw new EngagementError('التعليق أطول من ٦٠٠ حرف.');
  if (now() - user.created_at < minAgeHours * 3600) throw new EngagementError(`يمكن كتابة التقييمات بعد مرور ${minAgeHours} ساعة على إنشاء الحساب.`);
  const post = getPost(db, postId);
  if (!post || post.status !== 'published' || !['business', 'service'].includes(post.type)) throw new EngagementError('لا يمكن تقييم هذا المنشور.', 404);
  if (isPostOwner(post, user.id)) throw new EngagementError('ما تگدر تقيّم منشورك.', 403);
  const today = db.prepare('SELECT count(*) FROM reviews WHERE user_id = ? AND created_at > ?').pluck().get(user.id, now() - 86400) as number;
  if (today >= REVIEWS_PER_DAY) throw new EngagementError('وصلت للحد اليومي للتقييمات.', 429);
  if (db.prepare('SELECT 1 FROM reviews WHERE post_id = ? AND user_id = ?').get(postId, user.id)) throw new EngagementError('قيّمت هذا المنشور من قبل.', 409);
  // سلوك غير طبيعي: تقييمات كثيرة لنفس المنشور من نفس الشبكة خلال يوم → تُعلَّم للمشرف
  const sameNet = db.prepare('SELECT count(*) FROM reviews WHERE post_id = ? AND ip_hash = ? AND created_at > ?').pluck().get(postId, ipHash, now() - 86400) as number;
  db.prepare('INSERT INTO reviews (post_id, user_id, rating, comment, ip_hash) VALUES (?, ?, ?, ?, ?)').run(postId, user.id, rating, text, ipHash);
  return { flagged: sameNet >= 2 };
}

export function reviewSummary(db: DB, postId: number) {
  return db.prepare("SELECT count(*) AS n, round(avg(rating), 1) AS avg FROM reviews WHERE post_id = ? AND status = 'published'").get(postId) as { n: number; avg: number | null };
}

export function publicReviews(db: DB, postId: number) {
  return db.prepare(`SELECT r.id, r.rating, r.comment, r.created_at, u.name FROM reviews r JOIN users u ON u.id = r.user_id
    WHERE r.post_id = ? AND r.status = 'published' ORDER BY r.created_at DESC LIMIT 30`).all(postId) as { id: number; rating: number; comment: string; created_at: number; name: string }[];
}

// ---------- البلاغات ----------

export const REPORT_REASONS: Record<string, string> = {
  fraud: 'احتيال أو إعلان وهمي', misleading: 'معلومات مضللة', offensive: 'محتوى مسيء أو تشهير',
  illegal: 'سلعة أو خدمة غير قانونية', privacy: 'نشر بيانات شخصية', spam: 'إزعاج أو تكرار', other: 'سبب آخر',
};

export function addReport(db: DB, target: { postId?: number; reviewId?: number }, reporterId: number | null, reason: string, details: string, ipHash: string) {
  if (!(reason in REPORT_REASONS)) throw new EngagementError('اختر سبب البلاغ.');
  if (details.trim().length > 600) throw new EngagementError('التفاصيل أطول من ٦٠٠ حرف.');
  if (target.postId) {
    const p = getPost(db, target.postId);
    if (!p || p.status !== 'published') throw new EngagementError('المنشور غير موجود.', 404);
  } else if (target.reviewId) {
    if (!db.prepare("SELECT 1 FROM reviews WHERE id = ? AND status = 'published'").get(target.reviewId)) throw new EngagementError('التقييم غير موجود.', 404);
  } else throw new EngagementError('بلاغ غير صالح.');
  const dup = db.prepare("SELECT 1 FROM reports WHERE (post_id IS ? AND review_id IS ?) AND ip_hash = ? AND status = 'open'")
    .get(target.postId ?? null, target.reviewId ?? null, ipHash);
  if (dup) return { duplicate: true };
  db.prepare('INSERT INTO reports (post_id, review_id, reporter_id, reason, details, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .run(target.postId ?? null, target.reviewId ?? null, reporterId, reason, details.trim(), ipHash);
  return { duplicate: false };
}

// ---------- مطالبات الملكية ----------

export function addClaim(db: DB, user: Pick<User, 'id'>, postId: number, message: string) {
  const text = message.trim();
  if (text.length < 10 || text.length > 1000) throw new EngagementError('اكتب ما يثبت ملكيتك للنشاط (١٠ أحرف على الأقل).');
  const p = getPost(db, postId);
  if (!p || p.type !== 'business' || p.status !== 'published') throw new EngagementError('النشاط غير موجود.', 404);
  if (p.owner_id === user.id) throw new EngagementError('أنت مالك هذه الصفحة بالفعل.', 409);
  if (db.prepare("SELECT 1 FROM business_claims WHERE post_id = ? AND user_id = ? AND status = 'pending'").get(postId, user.id))
    throw new EngagementError('طلبك السابق قيد المراجعة.', 409);
  const recent = db.prepare('SELECT count(*) FROM business_claims WHERE user_id = ? AND created_at > ?').pluck().get(user.id, now() - 86400) as number;
  if (recent >= 3) throw new EngagementError('وصلت للحد اليومي لطلبات الملكية.', 429);
  db.prepare('INSERT INTO business_claims (post_id, user_id, message) VALUES (?, ?, ?)').run(postId, user.id, text);
}

export function decideClaim(db: DB, claimId: number, approve: boolean, actor: Pick<User, 'id'>, note: string, ipHash: string | null) {
  db.transaction(() => {
    const c = db.prepare("SELECT * FROM business_claims WHERE id = ? AND status = 'pending'").get(claimId) as { id: number; post_id: number; user_id: number } | undefined;
    if (!c) throw new EngagementError('الطلب غير موجود أو تمت مراجعته.', 404);
    if (c.user_id === actor.id) throw new EngagementError('لا يمكنك مراجعة طلبك.', 403);
    db.prepare('UPDATE business_claims SET status = ?, reviewed_by = ?, reviewed_at = unixepoch(), note = ? WHERE id = ?')
      .run(approve ? 'approved' : 'rejected', actor.id, note.trim().slice(0, 500) || null, c.id);
    const post = getPost(db, c.post_id)!;
    if (approve) {
      db.prepare('UPDATE posts SET owner_id = ? WHERE id = ?').run(c.user_id, c.post_id);
      db.prepare("UPDATE users SET role = 'business_owner', updated_at = unixepoch() WHERE id = ? AND role = 'user'").run(c.user_id);
      db.prepare("UPDATE business_claims SET status = 'rejected', reviewed_by = ?, reviewed_at = unixepoch(), note = 'تم اعتماد مالك آخر' WHERE post_id = ? AND status = 'pending'").run(actor.id, c.post_id);
      notify(db, c.user_id, `تم اعتماد ملكيتك لصفحة «${post.title}». تقدر تديرها من حسابك.`, c.post_id);
    } else {
      notify(db, c.user_id, `لم يتم اعتماد طلب ملكية «${post.title}».${note.trim() ? ' ' + note.trim() : ''}`, c.post_id);
    }
    audit(db, { actorId: actor.id, action: approve ? 'claim.approve' : 'claim.reject', targetType: 'post', targetId: c.post_id, meta: { claim: c.id, user: c.user_id }, ipHash });
  })();
}
