import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { html } from '../lib/html.ts';
import { toFtsQuery } from '../lib/arabic.ts';
import { TYPES, TYPE_KEYS, isPostType, type PostType } from '../domain/types.ts';
import { canPreview, getPostView, isPostOwner, listFeatured, listPublic, postImages, postItems, PUBLIC_WHERE, type ListQuery } from '../domain/posts.ts';
import { addClaim, addReport, addReview, EngagementError, publicReviews, reviewSummary } from '../domain/engagement.ts';
import { POLICIES, sectionEnabled } from '../domain/settings.ts';
import { availableActions, ACTIONS } from '../domain/workflow.ts';
import { aboutPage, contactPage, detailPage, homePage, listPage, policyPage, searchPage } from '../views/pages/public.ts';
import { select } from '../views/components.ts';
import { icon } from '../views/layout.ts';
import { csrfInput } from './form.ts';
import { intParam, needUser } from './guards.ts';

type Q = Record<string, string | undefined>;
const num = (v: string | undefined) => (v && /^\d{1,11}$/.test(v) ? Number(v) : null);

export async function publicRoutes(app: FastifyInstance) {
  const db = app.db;

  const options = (section: string) => db.prepare('SELECT id, name FROM categories WHERE section = ? AND active = 1 ORDER BY sort, name').all(section).map((r) => {
    const x = r as { id: number; name: string }; return [x.id, x.name] as [number, string];
  });
  const areas = () => db.prepare('SELECT id, name FROM areas WHERE active = 1 ORDER BY sort, name').all().map((r) => {
    const x = r as { id: number; name: string }; return [x.id, x.name] as [number, string];
  });

  /** يبني استعلام القائمة من رابط الصفحة، مع تجاهل أي قيمة غير صالحة. */
  function readQuery(q: Q, types: PostType[]): { lq: ListQuery; fts: string | null; params: URLSearchParams } {
    const params = new URLSearchParams();
    const keep = (k: string, val: string | number | null | undefined) => { if (val !== null && val !== undefined && val !== '') params.set(k, String(val)); };
    const text = (q.q ?? '').slice(0, 80).trim();
    keep('q', text);
    const lq: ListQuery = {
      types, category: num(q.category), area: num(q.area), page: num(q.page) ?? 1,
      sinceDays: ['1', '7', '30'].includes(q.since ?? '') ? Number(q.since) : null,
      minPrice: num(q.min), maxPrice: num(q.max),
      openOnly: q.open === '1', offer: q.offer === 'sale' || q.offer === 'rent' ? q.offer : null,
      employment: q.employment && /^(full|part|daily|training|freelance)$/.test(q.employment) ? q.employment : null,
      sort: q.sort === 'price_asc' || q.sort === 'price_desc' ? q.sort : 'new',
    };
    keep('category', lq.category); keep('area', lq.area); keep('since', lq.sinceDays); keep('min', lq.minPrice); keep('max', lq.maxPrice);
    if (lq.openOnly) keep('open', '1'); keep('offer', lq.offer); keep('employment', lq.employment); if (lq.sort !== 'new') keep('sort', lq.sort);
    return { lq, fts: text ? toFtsQuery(text) : null, params };
  }

  app.get('/', (req, reply) => {
    const pick = (types: PostType[], extra: Partial<ListQuery> = {}, n = 4) => listPublic(db, { types, perPage: n, ...extra }).items;
    const counts: Record<string, number> = {};
    for (const r of db.prepare(`SELECT p.type, count(*) AS n FROM posts p WHERE ${PUBLIC_WHERE} GROUP BY p.type`).all() as { type: string; n: number }[]) counts[r.type] = r.n;
    counts.food = db.prepare(`SELECT count(*) FROM posts p JOIN categories c ON c.id = p.category_id WHERE ${PUBLIC_WHERE} AND p.type = 'business' AND c.is_food = 1`).pluck().get() as number;
    const s = req.settings;
    return reply.page(req, { title: s.site_name, canonical: '/' }, homePage({
      counts, featured: listFeatured(db, 'home'), latest: pick([...TYPE_KEYS], {}, 6), offers: pick(['offer']), jobs: pick(['job']),
      properties: pick(['property']), food: pick(['business'], { foodOnly: true }), services: pick(['service']), market: pick(['market']),
      community: pick(['community']), help: pick(['help'], {}, 3),
    }, s, req.user));
  });

  const filterExtras = (type: PostType | 'food', q: URLSearchParams) => {
    const parts = [];
    if (type === 'business' || type === 'food') parts.push(html`<div class="check"><input type="checkbox" id="f-open" name="open" value="1" ${q.get('open') ? html`checked` : ''}><label for="f-open">المفتوح الآن فقط</label></div>`);
    if (type === 'job') parts.push(select({ name: 'employment', label: 'نوع الدوام', required: true, placeholder: 'الكل', value: q.get('employment'), options: [['full', 'دوام كامل'], ['part', 'دوام جزئي'], ['daily', 'عمل يومي'], ['training', 'تدريب'], ['freelance', 'عمل حر']] }));
    if (type === 'property') parts.push(select({ name: 'offer', label: 'نوع العرض', required: true, placeholder: 'بيع وإيجار', value: q.get('offer'), options: [['sale', 'بيع'], ['rent', 'إيجار']] }));
    if (type === 'property' || type === 'market' || type === 'offer') {
      parts.push(html`<div class="field"><label for="f-min">أقل سعر (د.ع)</label><input id="f-min" name="min" inputmode="numeric" value="${q.get('min') ?? ''}" maxlength="11"></div>
        <div class="field"><label for="f-max">أعلى سعر (د.ع)</label><input id="f-max" name="max" inputmode="numeric" value="${q.get('max') ?? ''}" maxlength="11"></div>`);
      parts.push(select({ name: 'sort', label: 'الترتيب', required: true, value: q.get('sort') ?? '', options: [['', 'الأحدث'], ['price_asc', 'الأرخص أولاً'], ['price_desc', 'الأغلى أولاً']] }));
    }
    return html`${parts}`;
  };

  for (const type of TYPE_KEYS) {
    const t = TYPES[type];
    app.get(t.path, (req, reply) => {
      const { lq, fts, params } = readQuery(req.query as Q, [type]);
      const result = listPublic(db, lq, fts);
      return reply.page(req, { title: t.label, description: `${t.label} في منطقة المعامل: ${t.blurb}.`, canonical: t.path + (lq.page && lq.page > 1 ? `?page=${lq.page}` : '') }, listPage({
        title: t.label, intro: t.blurb, path: t.path, type, result, query: params, featured: listFeatured(db, 'section', type),
        categories: options(type), areas: areas(), extra: filterExtras(type, params), canSubmit: sectionEnabled(req.settings, type), submitType: type,
      }));
    });
    app.get(`${t.path}/:id`, (req, reply) => detail(req, reply, type));
    app.get(`${t.path}/:id/:slug`, (req, reply) => reply.redirect(`${t.path}/${(req.params as { id: string }).id}`, 301));
  }

  app.get('/restaurants', (req, reply) => {
    const { lq, fts, params } = readQuery(req.query as Q, ['business']);
    lq.foodOnly = true;
    const result = listPublic(db, lq, fts);
    const food = db.prepare("SELECT id, name FROM categories WHERE section = 'business' AND is_food = 1 AND active = 1 ORDER BY sort").all().map((r) => [(r as { id: number }).id, (r as { name: string }).name] as [number, string]);
    return reply.page(req, { title: 'المطاعم والتوصيل', description: 'مطاعم وأفران منطقة المعامل: قوائم الطعام والأسعار وأرقام الطلب والتوصيل.' }, listPage({
      title: 'المطاعم والتوصيل', intro: 'قوائم الطعام والأسعار ومناطق التوصيل. الطلب يكون مباشرة من المطعم بالاتصال أو واتساب.', path: '/restaurants', type: 'business',
      result, query: params, featured: [], categories: food, areas: areas(), extra: filterExtras('food', params), canSubmit: sectionEnabled(req.settings, 'business'), submitType: 'business',
    }));
  });

  app.get('/search', (req, reply) => {
    const q = req.query as Q;
    const type = isPostType(q.type) ? q.type : '';
    const { lq, fts, params } = readQuery(q, type ? [type] : [...TYPE_KEYS]);
    if (type) params.set('type', type);
    const text = params.get('q') ?? '';
    const result = text && !fts ? { items: [], total: 0, page: 1, pages: 1 } : listPublic(db, lq, fts);
    return reply.page(req, { title: text ? `نتائج البحث: ${text}` : 'البحث', noindex: !!text, canonical: '/search' }, searchPage(text, type, text || type ? result : { items: [], total: 0, page: 1, pages: 1 }, params));
  });

  function detail(req: FastifyRequest, reply: FastifyReply, type: PostType) {
    const id = intParam((req.params as { id: string }).id);
    const post = id ? getPostView(db, id) : undefined;
    if (!post || post.type !== type) return reply.callNotFound();
    const isPublic = post.status === 'published' && (!post.expires_at || post.expires_at > Date.now() / 1000);
    if (!isPublic && !canPreview(post, req.user)) return reply.callNotFound();
    const u = req.user;
    const owner = !!u && isPostOwner(post, u.id);
    const ownerActs = u ? availableActions(post, u, 'owner') : [];
    const ownerActions = owner ? html`<div class="panel owner-panel"><p class="panel-title">${icon('user', 'i i-sm')}أنت صاحب هذا المنشور</p>
      <p><a class="btn btn-block" href="/account/posts/${post.id}">إدارة المنشور</a></p>
      ${ownerActs.includes('close') ? html`<form method="post" action="/account/posts/${post.id}/action">${csrfInput(req)}<input type="hidden" name="action" value="close"><button class="btn btn-block" type="submit">${ACTIONS.close.label}</button></form>` : ''}</div>` : html``;
    const biz = post.business_id ? db.prepare(`SELECT p.id, p.title FROM posts p WHERE p.id = ? AND ${PUBLIC_WHERE}`).get(post.business_id) as { id: number; title: string } | undefined : undefined;
    const reviewed = u ? !!db.prepare('SELECT 1 FROM reviews WHERE post_id = ? AND user_id = ?').get(post.id, u.id) : false;
    const pendingClaim = u ? !!db.prepare("SELECT 1 FROM business_claims WHERE post_id = ? AND user_id = ? AND status = 'pending'").get(post.id, u.id) : false;
    const firstImage = postImages(db, post.id)[0];
    return reply.page(req, {
      title: post.title, description: (post.body || TYPES[type].single + ' في ' + post.area_name).slice(0, 155),
      canonical: `${TYPES[type].path}/${post.id}`, noindex: !isPublic, image: firstImage ? `/media/${firstImage.file}` : null,
    }, detailPage({
      post, images: postImages(db, post.id), items: type === 'business' ? postItems(db, post.id) : [], preview: !isPublic, user: u,
      reviews: publicReviews(db, post.id), summary: reviewSummary(db, post.id),
      offers: type === 'business' ? listPublic(db, { types: ['offer'], businessId: post.id, perPage: 5 }).items : [],
      business: biz ?? null,
      canReview: !!u && isPublic && ['business', 'service'].includes(type) && !owner && !reviewed,
      canClaim: !!u && isPublic && type === 'business' && post.owner_id !== u.id && !pendingClaim,
      ownerActions, csrf: csrfInput(req), s: req.settings, baseUrl: app.cfg.baseUrl,
    }));
  }

  const back = (_req: FastifyRequest, id: number) => {
    const p = getPostView(db, id);
    return p ? `${TYPES[p.type].path}/${p.id}` : '/';
  };

  app.post('/posts/:id/report', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 10, timeWindow: '1 hour' } } }, (req, reply) => {
    const id = intParam((req.params as { id: string }).id);
    if (!id) return reply.callNotFound();
    const b = req.body as Q;
    try {
      const r = addReport(db, { postId: id }, req.user?.id ?? null, String(b.reason ?? ''), String(b.details ?? ''), req.ipHash);
      return reply.flashRedirect(back(req, id), 'ok', r.duplicate ? 'بلاغك السابق قيد المراجعة.' : 'وصلنا بلاغك وراح نراجعه. شكراً لك.');
    } catch (e) {
      if (e instanceof EngagementError) return reply.code(e.status === 404 ? 404 : 303).flashRedirect(back(req, id), 'error', e.message);
      throw e;
    }
  });

  app.post('/reviews/:id/report', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 10, timeWindow: '1 hour' } } }, (req, reply) => {
    const id = intParam((req.params as { id: string }).id);
    if (!id) return reply.callNotFound();
    const b = req.body as Q;
    try { addReport(db, { reviewId: id }, req.user?.id ?? null, String(b.reason ?? 'other'), String(b.details ?? ''), req.ipHash); }
    catch (e) { if (!(e instanceof EngagementError)) throw e; return reply.flashRedirect('/', 'error', e.message); }
    return reply.flashRedirect('/', 'ok', 'وصلنا بلاغك وراح نراجعه.');
  });

  app.post('/posts/:id/review', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 10, timeWindow: '1 hour' } } }, (req, reply) => {
    if (needUser(req, reply)) return;
    const id = intParam((req.params as { id: string }).id);
    if (!id) return reply.callNotFound();
    const b = req.body as Q;
    try {
      addReview(db, req.user!, id, Number(b.rating), String(b.comment ?? ''), req.ipHash, Number(req.settings.review_min_account_age_hours));
      return reply.flashRedirect(back(req, id), 'ok', 'وصل تقييمك وراح يظهر بعد المراجعة.');
    } catch (e) {
      if (e instanceof EngagementError) { reply.code(e.status); return reply.flashRedirect(back(req, id), 'error', e.message); }
      throw e;
    }
  });

  app.post('/businesses/:id/claim', { config: { rateLimit: { max: app.cfg.env === 'test' ? 1000 : 5, timeWindow: '1 hour' } } }, (req, reply) => {
    if (needUser(req, reply)) return;
    const id = intParam((req.params as { id: string }).id);
    if (!id) return reply.callNotFound();
    try {
      addClaim(db, req.user!, id, String((req.body as Q).message ?? ''));
      return reply.flashRedirect(`/businesses/${id}`, 'ok', 'وصل طلب الملكية. الإدارة راح تتواصل وياك للتحقق.');
    } catch (e) {
      if (e instanceof EngagementError) return reply.flashRedirect(`/businesses/${id}`, 'error', e.message);
      throw e;
    }
  });

  app.get('/about', (req, reply) => reply.page(req, { title: 'عن المنصة' }, aboutPage(req.settings)));
  app.get('/contact', (req, reply) => reply.page(req, { title: 'تواصل معنا' }, contactPage(req.settings)));
  app.get('/policies/:slug', (req, reply) => {
    const p = POLICIES[(req.params as { slug: string }).slug];
    if (!p) return reply.callNotFound();
    return reply.page(req, { title: p.title }, policyPage(p.title, req.settings[p.key]));
  });

  app.get('/robots.txt', (_req, reply) => reply.type('text/plain; charset=utf-8').send(
    `User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /submit\nDisallow: /login\nDisallow: /register\nDisallow: /search?\nSitemap: ${app.cfg.baseUrl}/sitemap.xml\n`));

  app.get('/sitemap.xml', (_req, reply) => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const base = app.cfg.baseUrl;
    const urls = ['/', '/about', '/contact', '/restaurants', ...TYPE_KEYS.map((t) => TYPES[t].path), ...Object.keys(POLICIES).map((k) => `/policies/${k}`)]
      .map((u) => `<url><loc>${esc(base + u)}</loc></url>`);
    const posts = db.prepare(`SELECT p.id, p.type, p.updated_at FROM posts p WHERE ${PUBLIC_WHERE} ORDER BY p.updated_at DESC LIMIT 45000`).all() as { id: number; type: PostType; updated_at: number }[];
    for (const p of posts) urls.push(`<url><loc>${esc(`${base}${TYPES[p.type].path}/${p.id}`)}</loc><lastmod>${new Date(p.updated_at * 1000).toISOString().slice(0, 10)}</lastmod></url>`);
    return reply.type('application/xml; charset=utf-8').header('Cache-Control', 'public, max-age=3600')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
  });

  app.get('/manifest.webmanifest', (req, reply) => reply.type('application/manifest+json').send(JSON.stringify({
    name: req.settings.site_name, short_name: req.settings.site_name, lang: 'ar', dir: 'rtl', start_url: '/', display: 'standalone',
    background_color: '#EEF1EF', theme_color: '#17594A',
    icons: [{ src: '/static/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/static/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
  })));

  app.get('/healthz', (_req, reply) => {
    db.prepare('SELECT 1').get();
    return reply.header('Cache-Control', 'no-store').send({ ok: true });
  });
}
