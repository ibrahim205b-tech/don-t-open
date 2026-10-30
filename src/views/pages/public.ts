import { html, paragraphs, raw, jsonScript, type SafeHtml } from '../../lib/html.ts';
import { fmtDate, fmtNumber, fmtPrice } from '../../lib/format.ts';
import { telLink, waLink } from '../../lib/arabic.ts';
import { TYPES, TYPE_KEYS, type PostType, type User } from '../../domain/types.ts';
import { parseDetails, type ImageRow, type ItemRow, type ListItem } from '../../domain/posts.ts';
import { REPORT_REASONS } from '../../domain/engagement.ts';
import { OWNERSHIP_STATEMENT, sectionEnabled, type Settings } from '../../domain/settings.ts';
import { icon, sectionTitle } from '../layout.ts';
import { EMPLOYMENT, OPEN_STATE, emptyState, mediaUrl, pagination, postUrl, rowList, select, stars, statusBadge } from '../components.ts';

type Opt = [string | number, string][];

export function searchBox(q = '', type = '', big = false): SafeHtml {
  return html`<form class="search${big ? ' search-big' : ''}" role="search" method="get" action="/search">
    <label class="sr" for="q${big ? '-hero' : ''}">ابحث في الدليل</label>
    <input id="q${big ? '-hero' : ''}" name="q" type="search" value="${q}" placeholder="اسم محل، خدمة، وظيفة، أو منطقة" maxlength="80" autocomplete="off" enterkeyhint="search">
    <label class="sr" for="type${big ? '-hero' : ''}">القسم</label>
    <select id="type${big ? '-hero' : ''}" name="type">
      <option value="">كل الأقسام</option>
      ${TYPE_KEYS.map((t) => html`<option value="${t}" ${t === type ? raw('selected') : ''}>${TYPES[t].label}</option>`)}
    </select>
    <button class="btn btn-primary" type="submit">${icon('search')}<span>ابحث</span></button>
  </form>`;
}

export interface HomeData {
  counts: Record<string, number>;
  featured: ListItem[]; latest: ListItem[]; offers: ListItem[]; jobs: ListItem[]; properties: ListItem[];
  food: ListItem[]; services: ListItem[]; market: ListItem[]; community: ListItem[]; help: ListItem[];
}

const quickLinks: [string, string, string][] = [
  ['/businesses', 'المحلات', 'store'], ['/restaurants', 'المطاعم', 'utensils'], ['/jobs', 'وظائف', 'briefcase'],
  ['/services', 'خدمات', 'wrench'], ['/properties', 'عقارات', 'building'], ['/market', 'بيع وشراء', 'tag'],
];

export function homePage(d: HomeData, s: Settings, user: User | null): SafeHtml {
  const block = (title: string, href: string, items: ListItem[], emptyText: string, type?: PostType) => html`<section class="block" aria-labelledby="h-${href.slice(1)}">
    ${sectionTitle(title, href, 'عرض الكل', `h-${href.slice(1)}`)}
    ${rowList(items, emptyState('ما كو إعلانات هنا بعد', emptyText, type && sectionEnabled(s, type) ? { href: `/submit/${type}`, label: 'أضف أول إعلان' } : undefined))}
  </section>`;
  return html`
  <section class="hero">
    <div class="wrap">
      <h1 class="hero-title">شنو تحتاج بالمعامل؟</h1>
      <p class="hero-sub">${s.tagline}</p>
      ${searchBox('', '', true)}
      <ul class="quick" aria-label="وصول سريع">${quickLinks.map(([h, l, i]) => html`<li><a href="${h}">${icon(i)}${l}</a></li>`)}</ul>
    </div>
  </section>

  <div class="wrap home">
    <section class="block" aria-labelledby="h-sections">
      <div class="section-head"><h2 id="h-sections">الأقسام</h2></div>
      <ul class="tiles">
        ${TYPE_KEYS.map((t) => html`<li><a class="tile" href="${TYPES[t].path}">
          <span class="tile-icon">${icon(TYPES[t].icon)}</span>
          <span class="tile-text"><span class="tile-label">${TYPES[t].label}</span><span class="tile-blurb">${TYPES[t].blurb}</span></span>
          <span class="tile-count" aria-label="${d.counts[t] ?? 0} منشور">${fmtNumber(d.counts[t] ?? 0)}</span></a></li>`)}
        <li><a class="tile" href="/restaurants"><span class="tile-icon">${icon('utensils')}</span>
          <span class="tile-text"><span class="tile-label">المطاعم والتوصيل</span><span class="tile-blurb">قوائم الطعام والأسعار وأرقام الطلب</span></span>
          <span class="tile-count">${fmtNumber(d.counts.food ?? 0)}</span></a></li>
      </ul>
    </section>

    ${d.featured.length ? html`<section class="block" aria-labelledby="h-featured"><div class="section-head"><h2 id="h-featured">مميز اليوم</h2></div>${rowList(d.featured, html``)}</section>` : ''}

    <div class="columns">
      ${block('أحدث الإعلانات', '/search', d.latest, 'أول ما توافق الإدارة على إعلانات جديدة راح تظهر هنا.')}
      ${block('عروض المحلات', '/offers', d.offers, 'ما كو عروض حالياً. أصحاب المحلات يگدرون ينشرون عروضهم من صفحة محلهم.')}
      ${block('فرص العمل', '/jobs', d.jobs, 'ما كو وظائف منشورة حالياً.', 'job')}
      ${block('المطاعم والتوصيل', '/restaurants', d.food, 'ما كو مطاعم مضافة بعد.', 'business')}
      ${block('الخدمات والمهن', '/services', d.services, 'ما كو أصحاب مهن مسجلين بعد.', 'service')}
      ${block('العقارات', '/properties', d.properties, 'ما كو عقارات معروضة حالياً.', 'property')}
      ${block('بيع وشراء', '/market', d.market, 'ما كو إعلانات بيع حالياً.', 'market')}
      ${block('أخبار ومبادرات المنطقة', '/community', d.community, 'ما كو أخبار أو فعاليات حالياً.', 'community')}
    </div>

    <section class="block help-block" aria-labelledby="h-help">
      <div class="section-head"><h2 id="h-help">المساعدات المجتمعية</h2><a class="more" href="/help">عرض الكل${icon('chevron', 'i i-sm')}</a></div>
      <p class="note">${icon('shield', 'i i-sm')}كل طلب يُراجع قبل النشر، ولا تُنشر وثائق طبية أو أرقام خاصة بدون موافقة. تأكد بنفسك قبل التبرع بأي مبلغ.</p>
      ${rowList(d.help, emptyState('ما كو طلبات حالياً', 'طلبات التبرع بالدم والمبادرات الخيرية تظهر هنا بعد مراجعتها.'))}
    </section>

    <section class="cta" aria-labelledby="h-cta">
      <div>
        <h2 id="h-cta">عندك محل أو خدمة أو شي تبيعه؟</h2>
        <ol class="steps">
          <li>${user ? 'اختار القسم واكتب إعلانك' : 'سوّي حساب بدقيقة'}</li>
          <li>الإدارة تراجعه حتى يبقى الدليل نظيف وموثوق</li>
          <li>ينشر ويوصل لأهل المنطقة</li>
        </ol>
      </div>
      <a class="btn btn-sign btn-lg" href="/submit">${icon('plus')}أضف إعلانك</a>
    </section>

    <section class="block about-block" aria-labelledby="h-about">
      <div class="section-head"><h2 id="h-about">عن دليل المعامل</h2><a class="more" href="/about">اقرأ أكثر${icon('chevron', 'i i-sm')}</a></div>
      ${paragraphs(s.about_text.split(/\n\s*\n/)[0] ?? '')}
      <p class="contact-row">
        <a class="btn" href="${telLink(s.support_phone)}">${icon('phone')}اتصل بالدعم <span dir="ltr">${s.support_phone}</span></a>
        <a class="btn btn-wa" href="${waLink(s.whatsapp_phone)}" target="_blank" rel="noopener">${icon('whatsapp')}واتساب</a>
      </p>
    </section>
  </div>`;
}

// ---------- صفحات الأقسام ----------

export interface ListPageData {
  title: string; intro: string; path: string; type: PostType | null;
  result: { items: ListItem[]; total: number; page: number; pages: number };
  featured: ListItem[]; query: URLSearchParams;
  categories: Opt; areas: Opt; extra: SafeHtml; canSubmit: boolean; submitType?: PostType;
}

export function listPage(d: ListPageData): SafeHtml {
  const q = d.query;
  const hasFilters = [...q.keys()].some((k) => k !== 'page');
  return html`<div class="wrap">
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span aria-hidden="true">/</span><span aria-current="page">${d.title}</span></nav>
    <div class="page-head">
      <div><h1>${d.title}</h1><p class="lede">${d.intro}</p></div>
      ${d.canSubmit && d.submitType ? html`<a class="btn btn-primary" href="/submit/${d.submitType}">${icon('plus')}أضف ${TYPES[d.submitType].single}</a>` : ''}
    </div>
    <details class="filters" ${hasFilters ? raw('open') : ''}>
      <summary>${icon('list', 'i i-sm')}تصفية النتائج${hasFilters ? ' (مفعّلة)' : ''}</summary>
      <form method="get" action="${d.path}" class="filter-form">
        <div class="field"><label for="f-q">كلمة البحث</label><input id="f-q" type="search" name="q" value="${q.get('q') ?? ''}" maxlength="80"></div>
        ${d.categories.length ? select({ name: 'category', label: 'التصنيف', options: d.categories, value: q.get('category'), placeholder: 'الكل', required: true }) : ''}
        ${select({ name: 'area', label: 'المنطقة', options: d.areas, value: q.get('area'), placeholder: 'كل المناطق', required: true })}
        ${select({ name: 'since', label: 'تاريخ النشر', options: [['1', 'آخر ٢٤ ساعة'], ['7', 'آخر أسبوع'], ['30', 'آخر شهر']], value: q.get('since'), placeholder: 'أي وقت', required: true })}
        ${d.extra}
        <div class="filter-actions"><button class="btn btn-primary" type="submit">تطبيق</button>${hasFilters ? html`<a class="btn" href="${d.path}">مسح التصفية</a>` : ''}</div>
      </form>
    </details>
    ${d.featured.length && d.result.page === 1 && !hasFilters ? html`<section class="block" aria-label="إعلانات مميزة">${rowList(d.featured, html``)}</section>` : ''}
    <p class="result-count" role="status">${d.result.total ? `${fmtNumber(d.result.total)} نتيجة` : ''}</p>
    ${rowList(d.result.items, hasFilters
      ? emptyState('ما لگينا نتائج', 'جرّب تغيير التصفية أو كلمة البحث.', { href: d.path, label: 'مسح التصفية' })
      : emptyState('القسم فارغ حالياً', 'ما كو منشورات معتمدة بهذا القسم بعد.', d.canSubmit && d.submitType ? { href: `/submit/${d.submitType}`, label: 'أضف أول منشور' } : undefined))}
    ${pagination(d.result.page, d.result.pages, q, d.path)}
  </div>`;
}

export function searchPage(q: string, type: string, result: ListPageData['result'], query: URLSearchParams): SafeHtml {
  return html`<div class="wrap">
    <h1>البحث في الدليل</h1>
    ${searchBox(q, type)}
    ${q ? html`<p class="result-count" role="status">${result.total ? `${fmtNumber(result.total)} نتيجة لـ «${q}»` : ''}</p>` : ''}
    ${q || type ? rowList(result.items, emptyState('ما لگينا نتائج', 'جرّب كلمة أقصر أو تهجئة ثانية، أو ابحث بكل الأقسام.'))
      : html`<p class="muted">اكتب اسم محل أو خدمة أو منتج أو منطقة. البحث يتجاهل التشكيل ويفرّق بين الكلمات.</p>`}
    ${pagination(result.page, result.pages, query, '/search')}
  </div>`;
}

// ---------- صفحة التفاصيل ----------

export interface DetailData {
  post: ListItem; images: ImageRow[]; items: ItemRow[]; preview: boolean; user: User | null;
  reviews: { id: number; rating: number; comment: string; created_at: number; name: string }[];
  summary: { n: number; avg: number | null }; offers: ListItem[]; business: { id: number; title: string } | null;
  canReview: boolean; canClaim: boolean; ownerActions: SafeHtml; csrf: SafeHtml; s: Settings; baseUrl: string;
}

function facts(p: ListItem, d: Record<string, string | number>): [string, SafeHtml | string][] {
  const out: [string, SafeHtml | string][] = [['التصنيف', p.category_name], ['المنطقة', p.area_name]];
  switch (p.type) {
    case 'business':
      out.push(['الحالة', OPEN_STATE[p.open_state]]);
      if (d.address) out.push(['العنوان', String(d.address)]);
      if (d.hours) out.push(['ساعات العمل', String(d.hours)]);
      if (d.delivery) out.push(['مناطق التوصيل', String(d.delivery)]);
      break;
    case 'job':
      out.push(['الراتب', p.price !== null ? `${fmtPrice(p.price)} شهرياً` : 'يحدد عند التواصل'], ['مكان العمل', String(d.workplace ?? '')], ['نوع الدوام', EMPLOYMENT[String(d.employment)] ?? '']);
      if (d.work_hours) out.push(['ساعات العمل', String(d.work_hours)]);
      if (p.expires_at) out.push(['ينتهي الإعلان', fmtDate(p.expires_at)]);
      break;
    case 'property':
      out.push(['نوع العرض', d.offer === 'rent' ? 'إيجار' : 'بيع'], ['السعر', p.price !== null ? fmtPrice(p.price) + (d.offer === 'rent' ? ' شهرياً' : '') : 'عند التواصل']);
      if (d.size) out.push(['المساحة', `${fmtNumber(Number(d.size))} م²`]);
      if (d.landmark) out.push(['أقرب نقطة دالة', String(d.landmark)]);
      break;
    case 'service':
      if (d.work_areas) out.push(['مناطق العمل', String(d.work_areas)]);
      if (d.hours) out.push(['أوقات العمل', String(d.hours)]);
      if (d.experience) out.push(['الخبرة', String(d.experience)]);
      break;
    case 'market':
      out.push(['السعر', p.price !== null ? fmtPrice(p.price) : 'عند التواصل'], ['الحالة', d.condition === 'new' ? 'جديد' : 'مستعمل']);
      break;
    case 'offer':
      if (p.price !== null) out.push(['السعر', fmtPrice(p.price)]);
      if (p.expires_at) out.push(['ينتهي العرض', fmtDate(p.expires_at)]);
      break;
    case 'community':
      if (d.event_date) out.push(['التاريخ', String(d.event_date)]);
      if (d.location) out.push(['المكان', String(d.location)]);
      if (d.organizer) out.push(['الجهة', String(d.organizer)]);
      break;
    case 'help':
      if (d.blood_type) out.push(['فصيلة الدم المطلوبة', html`<span dir="ltr">${d.blood_type}</span>`]);
      if (d.location) out.push(['المكان', String(d.location)]);
      if (p.expires_at) out.push(['ينتهي الطلب', fmtDate(p.expires_at)]);
      break;
  }
  out.push(['آخر تحديث', fmtDate(p.updated_at)]);
  return out;
}

export function detailPage(x: DetailData): SafeHtml {
  const p = x.post;
  const d = parseDetails(p);
  const t = TYPES[p.type];
  const phone = p.show_phone && p.contact_phone ? p.contact_phone : null;
  const contact = phone
    ? html`<div class="contact-row">
        <a class="btn btn-primary btn-lg" href="${telLink(phone)}">${icon('phone')}اتصال <span dir="ltr">${phone}</span></a>
        ${p.whatsapp ? html`<a class="btn btn-wa btn-lg" href="${waLink(phone)}" target="_blank" rel="noopener">${icon('whatsapp')}واتساب</a>` : ''}
      </div>`
    : p.type === 'help'
      ? html`<p class="note">صاحب الطلب لم يوافق على نشر رقمه. للتواصل كلّم إدارة المنصة على <a href="${telLink(x.s.support_phone)}" dir="ltr">${x.s.support_phone}</a> وراح نوصل رسالتك.</p>`
      : html`<p class="muted">صاحب الإعلان لم يختر إظهار رقم للتواصل.</p>`;
  return html`<div class="wrap detail">
    ${x.preview ? html`<p class="flash flash-error" role="status">${icon('eye-off', 'i i-sm')}معاينة: هذا المنشور غير منشور للعامة. الحالة: ${statusBadge(p.status)}</p>` : ''}
    <nav class="crumbs" aria-label="مسار التنقل"><a href="/">الرئيسية</a><span aria-hidden="true">/</span><a href="${t.path}">${t.label}</a><span aria-hidden="true">/</span><span aria-current="page">${p.title}</span></nav>
    <article>
      <header class="detail-head">
        <h1>${p.title}</h1>
        <div class="badges">
          ${p.verified ? html`<span class="badge badge-ok">${icon('badge', 'i i-sm')}${p.type === 'help' ? 'تم التحقق من الطلب' : 'بيانات النشاط موثقة'}</span>` : ''}
          ${p.type === 'community' ? (p.is_official ? html`<span class="badge badge-ok">${icon('check', 'i i-sm')}خبر مؤكد من الإدارة</span>` : html`<span class="badge">منشور من أحد المستخدمين، غير مؤكد رسمياً</span>`) : ''}
          ${p.type === 'help' && !p.verified ? html`<span class="badge badge-warn">${icon('alert', 'i i-sm')}لم يتم التحقق من تفاصيل الحالة</span>` : ''}
          ${x.summary.n ? html`<span class="badge">${stars(x.summary.avg ?? 0)} ${fmtNumber(x.summary.avg ?? 0)} من ${fmtNumber(x.summary.n)} تقييم</span>` : ''}
        </div>
      </header>
      ${x.images.length ? html`<div class="gallery">${x.images.map((im, i) => html`<a href="${mediaUrl(im.file)}" class="${i === 0 ? 'g-main' : ''}"><img src="${mediaUrl(i === 0 ? im.file : im.thumb)}" alt="صورة ${i + 1} من ${x.images.length} لـ ${p.title}" width="${i === 0 ? im.width : 480}" height="${i === 0 ? im.height : 360}" ${i ? raw('loading="lazy"') : raw('fetchpriority="high"')} decoding="async"></a>`)}</div>` : ''}
      <div class="detail-grid">
        <div class="detail-main">
          ${p.body ? html`<section aria-labelledby="h-desc"><h2 id="h-desc">التفاصيل</h2><div class="prose">${paragraphs(p.body)}</div></section>` : ''}
          ${p.type === 'job' && d.requirements ? html`<section><h2>الشروط</h2><div class="prose">${paragraphs(String(d.requirements))}</div></section>` : ''}
          ${p.type === 'business' && d.services ? html`<section><h2>الخدمات</h2><div class="prose">${paragraphs(String(d.services))}</div></section>` : ''}
          ${x.items.length ? html`<section aria-labelledby="h-menu"><h2 id="h-menu">${p.category_name.includes('مطاعم') || p.category_name.includes('أفران') ? 'قائمة الطعام والأسعار' : 'المنتجات والأسعار'}</h2>
            <table class="menu"><thead><tr><th scope="col">الصنف</th><th scope="col">السعر</th></tr></thead><tbody>
            ${x.items.map((it) => html`<tr><td>${it.name}${it.note ? html`<span class="muted block">${it.note}</span>` : ''}</td><td class="num">${it.price !== null ? fmtPrice(it.price) : 'حسب الطلب'}</td></tr>`)}
            </tbody></table></section>` : ''}
          ${x.offers.length ? html`<section><h2>عروض هذا المحل</h2>${rowList(x.offers, html``)}</section>` : ''}
          ${x.business ? html`<p>هذا العرض من <a href="/businesses/${x.business.id}">${x.business.title}</a></p>` : ''}
        </div>
        <aside class="detail-side" aria-label="معلومات وتواصل">
          ${contact}
          <dl class="facts">${facts(p, d).map(([k, val]) => html`<div><dt>${k}</dt><dd>${val}</dd></div>`)}</dl>
          ${p.type === 'business' && d.lat && d.lng ? html`<p><a class="btn btn-block" href="https://www.openstreetmap.org/?mlat=${d.lat}&amp;mlon=${d.lng}#map=18/${d.lat}/${d.lng}" target="_blank" rel="noopener">${icon('map')}الموقع على الخريطة</a></p>` : ''}
          ${x.ownerActions}
        </aside>
      </div>
    </article>

    ${['business', 'service'].includes(p.type) && !x.preview ? html`<section class="block" aria-labelledby="h-reviews">
      <h2 id="h-reviews">التقييمات</h2>
      <p class="muted">التقييمات آراء شخصية لمستخدمين مسجلين، تُراجع قبل ظهورها، ولا تعني أن معاملة تمت فعلاً.</p>
      ${x.reviews.length ? html`<ul class="reviews">${x.reviews.map((r) => html`<li><p>${stars(r.rating)} <strong>${r.name}</strong> <span class="muted">${fmtDate(r.created_at)}</span></p>${r.comment ? html`<p>${r.comment}</p>` : ''}</li>`)}</ul>` : html`<p>ما كو تقييمات بعد.</p>`}
      ${x.canReview ? html`<details class="panel"><summary>اكتب تقييمك</summary>
        <form method="post" action="/posts/${p.id}/review" class="form">${x.csrf}
          <fieldset class="rating"><legend>التقييم</legend>${[5, 4, 3, 2, 1].map((n) => html`<label><input type="radio" name="rating" value="${n}" required> ${n}</label>`)}</fieldset>
          <div class="field"><label for="f-comment">تعليقك <span class="opt">(اختياري)</span></label><textarea id="f-comment" name="comment" rows="3" maxlength="600"></textarea></div>
          <button class="btn btn-primary" type="submit">إرسال التقييم للمراجعة</button>
        </form></details>` : x.user ? '' : html`<p><a href="/login?next=${encodeURIComponent(postUrl(p))}">سجّل الدخول</a> حتى تكتب تقييماً.</p>`}
    </section>` : ''}

    ${!x.preview ? html`<section class="block report" aria-label="إبلاغ وملكية">
      <details class="panel"><summary>${icon('flag', 'i i-sm')}إبلاغ عن هذا المنشور</summary>
        <form method="post" action="/posts/${p.id}/report" class="form">${x.csrf}
          ${select({ name: 'reason', label: 'سبب البلاغ', options: Object.entries(REPORT_REASONS), required: true, placeholder: 'اختر السبب' })}
          <div class="field"><label for="f-details">تفاصيل <span class="opt">(اختياري)</span></label><textarea id="f-details" name="details" rows="3" maxlength="600"></textarea></div>
          <button class="btn" type="submit">إرسال البلاغ</button>
        </form></details>
      ${x.canClaim ? html`<details class="panel"><summary>${icon('store', 'i i-sm')}أنا صاحب هذا النشاط</summary>
        <form method="post" action="/businesses/${p.id}/claim" class="form">${x.csrf}
          <div class="field"><label for="f-claim">كيف نتأكد إنك صاحب النشاط؟</label><span class="hint" id="f-claim-h">مثلاً: اسمك كما في إجازة المحل، أو اطلب منا الاتصال على رقم المحل. لا ترفع وثائق هنا.</span>
          <textarea id="f-claim" name="message" rows="3" minlength="10" maxlength="1000" required aria-describedby="f-claim-h"></textarea></div>
          <button class="btn" type="submit">إرسال طلب الملكية</button>
        </form></details>` : ''}
    </section>` : ''}
    ${p.type === 'business' && !x.preview ? businessJsonLd(p, d, phone, x.baseUrl) : ''}
  </div>`;
}

function businessJsonLd(p: ListItem, d: Record<string, string | number>, phone: string | null, baseUrl: string): SafeHtml {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: p.title, url: `${baseUrl}/businesses/${p.id}`,
    address: { '@type': 'PostalAddress', streetAddress: d.address || undefined, addressLocality: p.area_name, addressRegion: 'بغداد', addressCountry: 'IQ' },
  };
  if (phone) data.telephone = '+964' + phone.slice(1);
  if (d.lat && d.lng) data.geo = { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng };
  return jsonScript(data);
}

// ---------- صفحات المعلومات ----------

export function aboutPage(s: Settings): SafeHtml {
  return html`<div class="wrap narrow prose-page">
    <h1>عن المنصة</h1>
    <div class="prose">${paragraphs(s.about_text)}</div>
    <h2>حقوق الملكية</h2>
    <p>${OWNERSHIP_STATEMENT}</p>
    <h2>كيف نراجع المحتوى</h2>
    <p>كل منشور يُرسل للإدارة قبل ظهوره. نرفض المحتوى المخالف ونخفي ما يُبلَّغ عنه إذا ثبتت مخالفته. اطّلع على <a href="/policies/posting">سياسة النشر</a> و<a href="/policies/reports">سياسة البلاغات</a>.</p>
  </div>`;
}

export function contactPage(s: Settings): SafeHtml {
  return html`<div class="wrap narrow prose-page">
    <h1>تواصل معنا</h1>
    <p>للاستفسارات، تصحيح معلومات نشاطك، طلب إعلان مميز، أو الإبلاغ عن مشكلة:</p>
    <div class="contact-row">
      <a class="btn btn-primary btn-lg" href="${telLink(s.support_phone)}">${icon('phone')}اتصال <span dir="ltr">${s.support_phone}</span></a>
      <a class="btn btn-wa btn-lg" href="${waLink(s.whatsapp_phone)}" target="_blank" rel="noopener">${icon('whatsapp')}واتساب <span dir="ltr">${s.whatsapp_phone}</span></a>
    </div>
    <p class="muted">لا تشارك كلمة مرورك مع أي أحد، ولا حتى مع فريق الدعم.</p>
  </div>`;
}

export function policyPage(title: string, text: string): SafeHtml {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return html`<div class="wrap narrow prose-page"><h1>${title}</h1><div class="prose">${blocks.map((b) => {
    const lines = b.split('\n');
    const items = lines.filter((l) => l.startsWith('- '));
    const head = lines.filter((l) => !l.startsWith('- '));
    return html`${head.length === 1 && items.length ? html`<h2>${head[0]}</h2>` : head.length ? html`<p>${head.join(' ')}</p>` : ''}${items.length ? html`<ul>${items.map((l) => html`<li>${l.slice(2)}</li>`)}</ul>` : ''}`;
  })}</div></div>`;
}
