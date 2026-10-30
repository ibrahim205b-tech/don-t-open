import { z } from 'zod';
import type { DB } from '../db/index.ts';
import { now } from '../db/index.ts';
import { normalizeArabic, normalizePhone, searchText } from '../lib/arabic.ts';
import { isStaff, can } from '../auth/rbac.ts';
import { TYPES, type Post, type PostType, type User } from './types.ts';

// ---------- التحقق من المدخلات ----------

const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
const text = (label: string, min: number, max: number) =>
  z.string({ error: `${label}: مطلوب` }).trim()
    .min(min, min <= 1 ? `${label}: مطلوب` : `${label}: ${min} أحرف على الأقل`)
    .max(max, `${label}: الحد ${max} حرفاً`);
const optText = (label: string, max: number) => z.string().trim().max(max, `${label}: الحد ${max} حرفاً`).optional().default('');
const checkbox = z.string().optional().transform((v) => v === 'on' || v === '1');
const id = (label: string) => z.string({ error: `${label}: مطلوب` }).regex(/^\d{1,9}$/, `${label}: اختر من القائمة`).transform(Number);
const money = (label: string) => z.string().optional().default('').transform((v, ctx) => {
  const s = digits(v).replace(/[,\s٬.]/g, '');
  if (!s) return null;
  if (!/^\d{1,11}$/.test(s)) { ctx.addIssue({ code: 'custom', message: `${label}: أرقام فقط بالدينار العراقي` }); return z.NEVER; }
  return Number(s);
});
const phone = (label: string) => z.string().optional().default('').transform((v, ctx) => {
  if (!v.trim()) return null;
  const p = normalizePhone(v);
  if (!p) { ctx.addIssue({ code: 'custom', message: `${label}: رقم عراقي يبدأ بـ 07 ويتكون من ١١ رقماً` }); return z.NEVER; }
  return p;
});
const coord = (min: number, max: number) => z.string().optional().default('').transform((v, ctx) => {
  const s = digits(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) { ctx.addIssue({ code: 'custom', message: 'الموقع الجغرافي غير صحيح' }); return z.NEVER; }
  return Math.round(n * 1e6) / 1e6;
});

const common = {
  _csrf: z.string().optional(),
  action: z.enum(['draft', 'submit']).optional().default('submit'),
  title: text('العنوان', 3, 100),
  body: optText('الوصف', 4000),
  category_id: id('التصنيف'),
  area_id: id('المنطقة'),
  price: money('السعر'),
  contact_phone: phone('رقم التواصل'),
  show_phone: checkbox,
  whatsapp: checkbox,
  remove_image: z.union([z.string(), z.array(z.string())]).optional(),
};

const DETAILS = {
  business: {
    d_address: text('العنوان التفصيلي', 3, 200),
    d_hours: optText('ساعات العمل', 200),
    d_services: optText('الخدمات', 1000),
    d_delivery: optText('مناطق التوصيل', 300),
    d_lat: coord(-90, 90),
    d_lng: coord(-180, 180),
    d_iam_owner: checkbox,
  },
  job: {
    d_workplace: text('مكان العمل', 2, 150),
    d_employment: z.enum(['full', 'part', 'daily', 'training', 'freelance'], { error: 'نوع الدوام: اختر من القائمة' }),
    d_work_hours: optText('ساعات العمل', 100),
    d_requirements: optText('الشروط', 1000),
  },
  property: {
    d_offer: z.enum(['sale', 'rent'], { error: 'نوع العرض: اختر بيع أو إيجار' }),
    d_size: z.string().optional().default('').transform((v, ctx) => {
      const s = digits(v).trim(); if (!s) return null;
      if (!/^\d{1,6}$/.test(s)) { ctx.addIssue({ code: 'custom', message: 'المساحة: رقم بالمتر المربع' }); return z.NEVER; }
      return Number(s);
    }),
    d_landmark: optText('أقرب نقطة دالة', 100),
  },
  service: {
    d_work_areas: optText('مناطق العمل', 300),
    d_experience: optText('الخبرة', 300),
    d_hours: optText('أوقات العمل', 200),
  },
  market: {
    d_condition: z.enum(['new', 'used'], { error: 'الحالة: اختر جديد أو مستعمل' }),
  },
  offer: {
    d_business_id: z.string().optional().default('').transform((v) => (/^\d{1,9}$/.test(v) ? Number(v) : null)),
    d_valid_days: z.string().optional().default('7').transform((v, ctx) => {
      const n = Number(digits(v));
      if (!Number.isInteger(n) || n < 1 || n > 30) { ctx.addIssue({ code: 'custom', message: 'مدة العرض: من ١ إلى ٣٠ يوماً' }); return z.NEVER; }
      return n;
    }),
  },
  community: {
    d_event_date: z.string().optional().default('').refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'تاريخ الفعالية غير صحيح'),
    d_location: optText('المكان', 150),
    d_organizer: optText('الجهة المنظمة', 100),
  },
  help: {
    d_blood_type: z.enum(['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().default(''),
    d_location: optText('المكان العام', 150),
    d_consent: z.string({ error: 'يجب تأكيد موافقة صاحب الحالة على النشر' }).refine((v) => v === 'on', 'يجب تأكيد موافقة صاحب الحالة على النشر'),
    d_phone_consent: checkbox,
  },
} satisfies Record<PostType, z.ZodRawShape>;

export const USES_PRICE: Record<PostType, boolean> = { business: false, job: true, property: true, service: false, market: true, offer: true, community: false, help: false };
const PHONE_REQUIRED: Record<PostType, boolean> = { business: true, job: true, property: true, service: true, market: true, offer: true, community: false, help: false };

export interface PostInput {
  action: 'draft' | 'submit';
  title: string; body: string; category_id: number; area_id: number; price: number | null;
  contact_phone: string | null; show_phone: boolean; whatsapp: boolean;
  details: Record<string, unknown>; iamOwner: boolean; businessId: number | null; validDays: number | null;
  removeImages: number[];
}

export type ParseResult = { ok: true; value: PostInput } | { ok: false; errors: string[] };

/** يتحقق من نموذج المنشور. أي حقل غير معروف يؤدي إلى الرفض (strict). */
export function parsePostForm(type: PostType, form: Record<string, unknown>): ParseResult {
  const schema = z.object({ ...common, ...DETAILS[type] }).strict();
  const r = schema.safeParse(form);
  if (!r.success) {
    const errors = r.error.issues.map((i) => (i.code === 'unrecognized_keys' ? 'النموذج يحتوي حقولاً غير مسموح بها.' : i.message));
    return { ok: false, errors: [...new Set(errors)] };
  }
  const v = r.data as Record<string, unknown> & typeof r.data;
  const details: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (!k.startsWith('d_') || ['d_iam_owner', 'd_business_id', 'd_valid_days', 'd_consent', 'd_phone_consent'].includes(k)) continue;
    if (val !== '' && val !== null) details[k.slice(2)] = val;
  }
  const errors: string[] = [];
  if (PHONE_REQUIRED[type] && !v.contact_phone) errors.push('رقم التواصل: مطلوب');
  if (type === 'help') {
    details.consent_at = now();
    if (v.show_phone && !v.d_phone_consent) errors.push('لإظهار رقم الهاتف يجب تأكيد موافقة صاحب الرقم على عرضه علناً.');
  }
  if (v.show_phone && !v.contact_phone) errors.push('أدخل رقم التواصل أو ألغِ خيار إظهاره.');
  if (errors.length) return { ok: false, errors };
  const rm = v.remove_image === undefined ? [] : Array.isArray(v.remove_image) ? v.remove_image : [v.remove_image];
  return {
    ok: true,
    value: {
      action: v.action, title: v.title, body: v.body, category_id: v.category_id, area_id: v.area_id,
      price: USES_PRICE[type] ? v.price : null,
      contact_phone: v.contact_phone, show_phone: v.show_phone, whatsapp: v.whatsapp && !!v.contact_phone,
      details,
      iamOwner: type === 'business' && v.d_iam_owner === true,
      businessId: type === 'offer' ? (v.d_business_id as number | null) : null,
      validDays: type === 'offer' ? (v.d_valid_days as number) : null,
      removeImages: rm.filter((x) => /^\d{1,9}$/.test(x)).map(Number),
    },
  };
}

// ---------- الصلاحيات على مستوى المنشور ----------

export function canEditPost(post: Post, user: Pick<User, 'id' | 'role'>): boolean {
  if (['rejected', 'removed', 'hidden'].includes(post.status)) return false;
  if (post.type === 'business') {
    if (can(user.role, 'posts.verify')) return true;
    if (post.owner_id !== null) return post.owner_id === user.id;
    return post.user_id === user.id && post.status !== 'published';
  }
  return post.user_id === user.id;
}

/** صاحب المنشور (المؤلف، أو المالك المعتمد للنشاط التجاري). */
export const isPostOwner = (post: Post, userId: number) => post.user_id === userId || post.owner_id === userId;

/** هل يحق لهذا المستخدم رؤية المنشور غير المنشور (معاينة)؟ */
export function canPreview(post: Post, user: Pick<User, 'id' | 'role'> | null): boolean {
  if (!user) return false;
  return isPostOwner(post, user.id) || isStaff(user.role);
}

// ---------- القراءة ----------

export const getPost = (db: DB, id: number) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Post | undefined;

export const PUBLIC_WHERE = "p.status = 'published' AND (p.expires_at IS NULL OR p.expires_at > unixepoch())";

export interface ListItem extends Post { category_name: string; area_name: string; thumb: string | null; featured: number }

const LIST_SELECT = `SELECT p.*, c.name AS category_name, a.name AS area_name,
  (SELECT thumb FROM post_images i WHERE i.post_id = p.id ORDER BY sort, id LIMIT 1) AS thumb,
  EXISTS (SELECT 1 FROM featured_listings f WHERE f.post_id = p.id AND f.starts_at <= unixepoch() AND f.ends_at > unixepoch()) AS featured
  FROM posts p JOIN categories c ON c.id = p.category_id JOIN areas a ON a.id = p.area_id`;

export interface ListQuery {
  types?: PostType[]; q?: string | null; category?: number | null; area?: number | null;
  minPrice?: number | null; maxPrice?: number | null; sinceDays?: number | null; openOnly?: boolean;
  offer?: 'sale' | 'rent' | null; employment?: string | null; foodOnly?: boolean; businessId?: number | null;
  sort?: 'new' | 'price_asc' | 'price_desc'; page?: number; perPage?: number;
}

/** كل الاستعلامات العامة تمر من هنا، وتفرض شرط «منشور وغير منتهٍ» دائماً. */
export function listPublic(db: DB, q: ListQuery, ftsQuery: string | null = null): { items: ListItem[]; total: number; page: number; pages: number } {
  const where: string[] = [PUBLIC_WHERE];
  const args: unknown[] = [];
  if (q.types?.length) { where.push(`p.type IN (${q.types.map(() => '?').join(',')})`); args.push(...q.types); }
  if (q.category) { where.push('p.category_id = ?'); args.push(q.category); }
  if (q.area) { where.push('p.area_id = ?'); args.push(q.area); }
  if (q.minPrice != null) { where.push('p.price >= ?'); args.push(q.minPrice); }
  if (q.maxPrice != null) { where.push('p.price <= ?'); args.push(q.maxPrice); }
  if (q.sinceDays) { where.push('p.published_at >= ?'); args.push(now() - q.sinceDays * 86400); }
  if (q.openOnly) where.push("p.open_state = 'open'");
  if (q.offer) { where.push("json_extract(p.details, '$.offer') = ?"); args.push(q.offer); }
  if (q.employment) { where.push("json_extract(p.details, '$.employment') = ?"); args.push(q.employment); }
  if (q.foodOnly) where.push('c.is_food = 1');
  if (q.businessId) { where.push('p.business_id = ?'); args.push(q.businessId); }
  if (ftsQuery) { where.push('p.id IN (SELECT post_id FROM search_index WHERE search_index MATCH ?)'); args.push(ftsQuery); }
  const perPage = Math.min(q.perPage ?? 20, 50);
  const total = db.prepare(`SELECT count(*) FROM posts p JOIN categories c ON c.id = p.category_id WHERE ${where.join(' AND ')}`).pluck().get(...args) as number;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, q.page ?? 1), pages);
  const order = q.sort === 'price_asc' ? 'p.price IS NULL, p.price ASC' : q.sort === 'price_desc' ? 'p.price IS NULL, p.price DESC' : 'featured DESC, p.published_at DESC';
  const items = db.prepare(`${LIST_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order}, p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, perPage, (page - 1) * perPage) as ListItem[];
  return { items, total, page, pages };
}

export function listFeatured(db: DB, placement: 'home' | 'section', type?: PostType, limit = 6): ListItem[] {
  return db.prepare(`${LIST_SELECT} WHERE ${PUBLIC_WHERE} AND p.id IN (
      SELECT post_id FROM featured_listings WHERE placement = ? AND starts_at <= unixepoch() AND ends_at > unixepoch())
      ${type ? 'AND p.type = ?' : ''} ORDER BY p.published_at DESC LIMIT ?`)
    .all(...(type ? [placement, type, limit] : [placement, limit])) as ListItem[];
}

export function getPostView(db: DB, id: number): ListItem | undefined {
  return db.prepare(`${LIST_SELECT} WHERE p.id = ?`).get(id) as ListItem | undefined;
}

export interface ImageRow { id: number; post_id: number; file: string; thumb: string; width: number; height: number }
export const postImages = (db: DB, postId: number) =>
  db.prepare('SELECT * FROM post_images WHERE post_id = ? ORDER BY sort, id').all(postId) as ImageRow[];

export interface ItemRow { id: number; post_id: number; name: string; price: number | null; note: string; sort: number }
export const postItems = (db: DB, postId: number) =>
  db.prepare('SELECT * FROM post_items WHERE post_id = ? ORDER BY sort, id').all(postId) as ItemRow[];

export const parseDetails = (p: Post) => { try { return JSON.parse(p.details) as Record<string, string | number>; } catch { return {}; } };

// ---------- الكتابة ----------

export class PostError extends Error {}

function snapshot(db: DB, post: Post, editorId: number) {
  const images = postImages(db, post.id).map((i) => i.file);
  db.prepare('INSERT INTO post_revisions (post_id, editor_id, snapshot) VALUES (?, ?, ?)').run(post.id, editorId, JSON.stringify({
    title: post.title, body: post.body, price: post.price, category_id: post.category_id, area_id: post.area_id,
    contact_phone: post.contact_phone, show_phone: post.show_phone, details: JSON.parse(post.details), status: post.status, images,
  }));
}

function checkRefs(db: DB, type: PostType, input: PostInput, user: Pick<User, 'id'>) {
  const cat = db.prepare('SELECT section, active FROM categories WHERE id = ?').get(input.category_id) as { section: string; active: number } | undefined;
  if (!cat || cat.section !== type || !cat.active) throw new PostError('التصنيف غير متاح لهذا القسم.');
  const area = db.prepare('SELECT active FROM areas WHERE id = ?').get(input.area_id) as { active: number } | undefined;
  if (!area || !area.active) throw new PostError('المنطقة غير متاحة.');
  if (input.businessId !== null) {
    const b = db.prepare("SELECT owner_id FROM posts WHERE id = ? AND type = 'business' AND status = 'published'").get(input.businessId) as { owner_id: number | null } | undefined;
    if (!b || b.owner_id !== user.id) throw new PostError('يمكن ربط العرض فقط بنشاط تجاري منشور تملكه.');
  }
}

export interface NewImage { file: string; thumb: string; width: number; height: number }

export function createPost(db: DB, user: Pick<User, 'id' | 'role'>, type: PostType, input: PostInput, images: NewImage[], maxPerDay: number): number {
  return db.transaction(() => {
    checkRefs(db, type, input, user);
    const titleKey = normalizeArabic(input.title);
    if (!isStaff(user.role)) {
      const recent = db.prepare('SELECT count(*) FROM posts WHERE user_id = ? AND created_at > ?').pluck().get(user.id, now() - 86400) as number;
      if (recent >= maxPerDay) throw new PostError(`وصلت للحد اليومي (${maxPerDay} منشورات). حاول باچر.`);
      const dupe = db.prepare("SELECT 1 FROM posts WHERE user_id = ? AND title_key = ? AND type = ? AND status NOT IN ('removed', 'rejected') AND created_at > ?")
        .get(user.id, titleKey, type, now() - 30 * 86400);
      if (dupe) throw new PostError('عندك منشور بنفس العنوان. عدّل المنشور السابق بدل تكراره.');
    }
    if (type === 'business') {
      const dup = db.prepare("SELECT 1 FROM posts WHERE type = 'business' AND title_key = ? AND area_id = ? AND status IN ('pending', 'published', 'hidden')").get(titleKey, input.area_id);
      if (dup) throw new PostError('هذا النشاط موجود بالدليل. إذا كنت صاحبه استخدم زر «أنا صاحب هذا النشاط» في صفحته.');
    }
    const status = input.action === 'draft' ? 'draft' : 'pending';
    const r = db.prepare(`INSERT INTO posts (type, user_id, business_id, category_id, area_id, title, body, price, contact_phone, show_phone, whatsapp, details, status, title_key, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).run(
      type, user.id, input.businessId, input.category_id, input.area_id, input.title, input.body, input.price,
      input.contact_phone, input.show_phone ? 1 : 0, input.whatsapp ? 1 : 0, JSON.stringify(input.details), status, titleKey);
    const postId = Number(r.lastInsertRowid);
    const ins = db.prepare('INSERT INTO post_images (post_id, file, thumb, width, height, sort) VALUES (?, ?, ?, ?, ?, ?)');
    images.forEach((im, i) => ins.run(postId, im.file, im.thumb, im.width, im.height, i));
    if (input.iamOwner) {
      db.prepare('INSERT INTO business_claims (post_id, user_id, message) VALUES (?, ?, ?)')
        .run(postId, user.id, 'أضاف صاحب النشاط هذه الصفحة بنفسه ويطلب إدارتها.');
    }
    db.prepare('INSERT INTO moderation_actions (post_id, actor_id, action, from_status, to_status) VALUES (?, ?, ?, ?, ?)')
      .run(postId, user.id, status === 'draft' ? 'create_draft' : 'submit', 'new', status);
    return postId;
  })();
}

/**
 * تعديل منشور. إذا كان منشوراً يعود للمراجعة (ما لم يكن المعدّل مديراً يعدّل نشاطاً تجارياً).
 * يعيد قائمة ملفات الصور المحذوفة ليتم مسحها من القرص بعد نجاح المعاملة.
 */
export function updatePost(db: DB, user: Pick<User, 'id' | 'role'>, post: Post, input: PostInput, newImages: NewImage[]): { removedFiles: string[]; status: string } {
  return db.transaction(() => {
    const fresh = getPost(db, post.id);
    if (!fresh || !canEditPost(fresh, user)) throw new PostError('لا تملك صلاحية تعديل هذا المنشور.');
    checkRefs(db, fresh.type, { ...input, businessId: fresh.type === 'offer' ? input.businessId : null }, fresh.owner_id ? { id: fresh.owner_id } : user);
    const imgs = postImages(db, fresh.id);
    const toRemove = imgs.filter((i) => input.removeImages.includes(i.id));
    if (imgs.length - toRemove.length + newImages.length > 6) throw new PostError('الحد الأقصى ٦ صور لكل منشور.');
    snapshot(db, fresh, user.id);
    const adminEdit = fresh.type === 'business' && can(user.role, 'posts.verify') && !isPostOwner(fresh, user.id);
    db.prepare(`UPDATE posts SET category_id = ?, area_id = ?, title = ?, body = ?, price = ?, contact_phone = ?, show_phone = ?, whatsapp = ?,
      details = ?, title_key = ?, business_id = ?, updated_at = unixepoch() WHERE id = ?`).run(
      input.category_id, input.area_id, input.title, input.body, input.price, input.contact_phone, input.show_phone ? 1 : 0,
      input.whatsapp ? 1 : 0, JSON.stringify(input.details), normalizeArabic(input.title), fresh.type === 'offer' ? input.businessId : null, fresh.id);
    for (const im of toRemove) db.prepare('DELETE FROM post_images WHERE id = ?').run(im.id);
    const start = imgs.length;
    newImages.forEach((im, i) => db.prepare('INSERT INTO post_images (post_id, file, thumb, width, height, sort) VALUES (?, ?, ?, ?, ?, ?)')
      .run(fresh.id, im.file, im.thumb, im.width, im.height, start + i));
    let status: string = fresh.status;
    const wantsReview = input.action === 'submit';
    let to: string | null = null;
    if (fresh.status === 'published' && !adminEdit) to = 'pending';
    else if (['draft', 'changes_requested', 'expired'].includes(fresh.status) && wantsReview) to = 'pending';
    if (to) {
      db.prepare('UPDATE posts SET status = ?, status_reason = NULL WHERE id = ?').run(to, fresh.id);
      db.prepare('INSERT INTO moderation_actions (post_id, actor_id, action, from_status, to_status) VALUES (?, ?, ?, ?, ?)')
        .run(fresh.id, user.id, fresh.status === 'published' ? 'edit_resubmit' : 'submit', fresh.status, to);
      db.prepare('DELETE FROM search_index WHERE post_id = ?').run(fresh.id);
      status = to;
    } else if (fresh.status === 'published') {
      reindex(db, fresh.id);
    }
    return { removedFiles: toRemove.flatMap((i) => [i.file, i.thumb]), status };
  })();
}

/** يحدّث فهرس البحث: المنشور العام يُفهرس، وغيره يُحذف من الفهرس. */
export function reindex(db: DB, postId: number) {
  db.prepare('DELETE FROM search_index WHERE post_id = ?').run(postId);
  const p = db.prepare(`SELECT p.*, c.name AS category_name FROM posts p JOIN categories c ON c.id = p.category_id WHERE p.id = ?`).get(postId) as (Post & { category_name: string }) | undefined;
  if (!p || p.status !== 'published') return;
  const d = parseDetails(p);
  const extra = [p.category_name, d.services, d.workplace, d.address, d.work_areas, d.landmark, d.location]
    .filter(Boolean).join(' ');
  const items = postItems(db, postId).map((i) => i.name).join(' ');
  db.prepare('INSERT INTO search_index (post_id, title, body) VALUES (?, ?, ?)')
    .run(postId, searchText(p.title), searchText(`${p.body} ${extra} ${items}`));
}

export { TYPES };
