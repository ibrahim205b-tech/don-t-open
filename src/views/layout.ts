import { html, raw, type SafeHtml } from '../lib/html.ts';
import { COPYRIGHT, sectionEnabled, type Settings } from '../domain/settings.ts';
import { TYPES, TYPE_KEYS, type User } from '../domain/types.ts';
import { isStaff } from '../auth/rbac.ts';
import { telLink, waLink } from '../lib/arabic.ts';

export interface ViewCtx {
  user: User | null;
  settings: Settings;
  csrf: string;
  path: string;
  baseUrl: string;
  v: string; // إصدار الملفات الثابتة لكسر التخزين المؤقت
  unread: number;
  flash?: { kind: 'ok' | 'error'; text: string } | null;
}

export interface PageMeta {
  title: string;
  description?: string;
  canonical?: string | null;
  noindex?: boolean;
  image?: string | null;
  head?: SafeHtml;
  bodyClass?: string;
}

export const icon = (name: string, cls = 'i') =>
  raw(`<svg class="${cls}" aria-hidden="true" focusable="false"><use href="/static/img/icons.svg#${name.replace(/[^a-z-]/g, '')}"></use></svg>`);

export const csrfField = (ctx: ViewCtx) => html`<input type="hidden" name="_csrf" value="${ctx.csrf}">`;

function nav(ctx: ViewCtx) {
  const links = TYPE_KEYS.filter((t) => t !== 'offer').map((t) => ({ href: TYPES[t].path, label: TYPES[t].label }));
  links.splice(1, 0, { href: '/restaurants', label: 'المطاعم والتوصيل' });
  return html`<ul class="nav-list">${links.map((l) => html`<li><a href="${l.href}" ${ctx.path.startsWith(l.href) ? raw('aria-current="page"') : ''}>${l.label}</a></li>`)}</ul>`;
}

export function layout(ctx: ViewCtx, meta: PageMeta, body: SafeHtml): string {
  const s = ctx.settings;
  const title = meta.title === s.site_name ? s.site_name : `${meta.title} | ${s.site_name}`;
  const desc = meta.description || s.tagline;
  const canonical = meta.canonical === null ? null : ctx.baseUrl + (meta.canonical ?? ctx.path);
  const ogImage = meta.image ? ctx.baseUrl + meta.image : `${ctx.baseUrl}/static/img/og.png`;
  const u = ctx.user;
  const canPost = TYPE_KEYS.some((t) => sectionEnabled(s, t));
  return '<!doctype html>' + html`<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
${meta.noindex ? raw('<meta name="robots" content="noindex, nofollow">') : ''}
${canonical ? html`<link rel="canonical" href="${canonical}">` : ''}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${s.site_name}">
<meta property="og:title" content="${meta.title}">
<meta property="og:description" content="${desc}">
<meta property="og:locale" content="ar_IQ">
${canonical ? html`<meta property="og:url" content="${canonical}">` : ''}
<meta property="og:image" content="${ogImage}">
<meta name="theme-color" content="#17594A">
<meta name="author" content="إبراهيم علي الشويلي">
<link rel="icon" href="/static/img/logo.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/static/img/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/static/fonts/IBMPlexSansArabic-400-arabic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/static/fonts/NotoKufiArabic-arabic.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/static/css/app.css?v=${ctx.v}">
<script src="/static/js/app.js?v=${ctx.v}" defer></script>
${meta.head ?? ''}
</head>
<body class="${meta.bodyClass ?? ''}">
<a class="skip" href="#main">انتقل إلى المحتوى</a>
${s.announcement ? html`<div class="announce" role="note">${s.announcement}</div>` : ''}
<header class="site-header">
  <div class="wrap header-row">
    <a class="brand" href="/" aria-label="${s.site_name}، الصفحة الرئيسية">
      <img src="/static/img/logo.svg" width="40" height="40" alt="">
      <span class="brand-name">${s.site_name}</span>
    </a>
    <div class="header-actions">
      ${canPost ? html`<a class="btn btn-sign" href="/submit">${icon('plus')}<span>أضف إعلانك</span></a>` : ''}
      <a class="btn-icon menu-toggle" href="#site-menu" role="button" aria-expanded="false" aria-controls="site-menu">${icon('menu')}<span class="sr">القائمة</span></a>
    </div>
  </div>
  <nav id="site-menu" class="site-menu" aria-label="الأقسام">
    <div class="wrap menu-inner">
      ${nav(ctx)}
      <ul class="nav-list nav-account">
        ${u ? html`
          ${isStaff(u.role) ? html`<li><a href="/admin">${icon('shield')}لوحة الإدارة</a></li>` : ''}
          <li><a href="/account">${icon('user')}حسابي${ctx.unread ? html` <span class="count" aria-label="${ctx.unread} إشعارات غير مقروءة">${ctx.unread}</span>` : ''}</a></li>
          <li><form method="post" action="/logout">${csrfField(ctx)}<button class="linklike" type="submit">${icon('logout')}خروج</button></form></li>`
        : html`<li><a href="/login">${icon('user')}تسجيل الدخول</a></li><li><a href="/register">إنشاء حساب</a></li>`}
      </ul>
    </div>
  </nav>
</header>
<main id="main" tabindex="-1">
${ctx.flash ? html`<div class="wrap"><p class="flash flash-${ctx.flash.kind}" role="${ctx.flash.kind === 'error' ? 'alert' : 'status'}">${ctx.flash.text}</p></div>` : ''}
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <section aria-labelledby="f-about">
      <h2 id="f-about" class="footer-title">${s.site_name}</h2>
      <p>${s.tagline}</p>
      ${s.footer_note ? html`<p>${s.footer_note}</p>` : ''}
    </section>
    <section aria-labelledby="f-support">
      <h2 id="f-support" class="footer-title">الدعم</h2>
      <p class="contact-line"><a href="${telLink(s.support_phone)}">${icon('phone')}<span dir="ltr">${s.support_phone}</span></a></p>
      <p class="contact-line"><a href="${waLink(s.whatsapp_phone)}" rel="noopener" target="_blank">${icon('whatsapp')}واتساب الدعم</a></p>
      ${[['facebook_url', 'فيسبوك'], ['instagram_url', 'إنستغرام'], ['telegram_url', 'تيليغرام']].filter(([k]) => s[k]).map(([k, l]) => html`<p><a href="${s[k]}" rel="noopener" target="_blank">${l}</a></p>`)}
    </section>
    <section aria-labelledby="f-links">
      <h2 id="f-links" class="footer-title">روابط</h2>
      <ul class="footer-links">
        <li><a href="/about">عن المنصة</a></li><li><a href="/contact">تواصل معنا</a></li>
        <li><a href="/policies/privacy">سياسة الخصوصية</a></li><li><a href="/policies/terms">شروط الاستخدام</a></li>
        <li><a href="/policies/posting">سياسة النشر</a></li><li><a href="/policies/ads">سياسة الإعلانات</a></li>
        <li><a href="/policies/reports">سياسة البلاغات</a></li>
      </ul>
    </section>
  </div>
  <div class="wrap copyright"><p>${COPYRIGHT}</p></div>
</footer>
</body>
</html>`.value;
}

export function sectionTitle(text: string, href?: string, linkText = 'عرض الكل', id?: string) {
  return html`<div class="section-head"><h2 ${id ? raw(`id="${id}"`) : ''}>${text}</h2>${href ? html`<a class="more" href="${href}">${linkText}${icon('chevron', 'i i-sm')}</a>` : ''}</div>`;
}
