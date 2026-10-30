import { html, raw, type SafeHtml } from '../lib/html.ts';
import { fmtAgo, fmtPrice } from '../lib/format.ts';
import { STATUS_LABEL, TYPES, type PostStatus } from '../domain/types.ts';
import { parseDetails, type ListItem } from '../domain/posts.ts';
import { icon } from './layout.ts';

export const postUrl = (p: { id: number; type: keyof typeof TYPES }) => `${TYPES[p.type].path}/${p.id}`;
export const mediaUrl = (file: string) => `/media/${file}`;

export const EMPLOYMENT: Record<string, string> = { full: 'دوام كامل', part: 'دوام جزئي', daily: 'عمل يومي', training: 'تدريب', freelance: 'عمل حر' };
export const OPEN_STATE: Record<string, string> = { open: 'مفتوح الآن', closed: 'مغلق الآن', unknown: 'الحالة غير محددة' };

/** السطر المختصر الذي يظهر تحت عنوان الإعلان في القوائم. */
function summary(p: ListItem): string {
  const d = parseDetails(p);
  switch (p.type) {
    case 'job': return [d.workplace, EMPLOYMENT[String(d.employment)]].filter(Boolean).join('، ');
    case 'property': return [d.offer === 'rent' ? 'للإيجار' : 'للبيع', d.size ? `${d.size} م²` : ''].filter(Boolean).join('، ');
    case 'market': return d.condition === 'new' ? 'جديد' : 'مستعمل';
    case 'business': return OPEN_STATE[p.open_state];
    default: return '';
  }
}

function priceText(p: ListItem): string {
  if (p.type === 'job') return p.price !== null ? `${fmtPrice(p.price)} شهرياً` : 'الراتب يحدد عند التواصل';
  if (p.price !== null) return fmtPrice(p.price) + (p.type === 'property' && parseDetails(p).offer === 'rent' ? ' شهرياً' : '');
  return ['property', 'market'].includes(p.type) ? 'السعر عند التواصل' : '';
}

export function listRow(p: ListItem): SafeHtml {
  const sub = summary(p);
  const price = priceText(p);
  return html`<li class="row${p.featured ? ' row-featured' : ''}">
    <a class="row-link" href="${postUrl(p)}">
      <span class="row-thumb">${p.thumb
        ? html`<img src="${mediaUrl(p.thumb)}" alt="" width="96" height="72" loading="lazy" decoding="async">`
        : icon(TYPES[p.type].icon, 'i i-thumb')}</span>
      <span class="row-body">
        <span class="row-title">${p.title}${p.verified ? html` <span class="verified" title="بيانات موثقة">${icon('badge', 'i i-sm')}<span class="sr">موثّق</span></span>` : ''}</span>
        <span class="row-meta">${p.category_name}${sub ? html`<span class="sep" aria-hidden="true">/</span>${sub}` : ''}</span>
        <span class="row-meta">${icon('pin', 'i i-xs')}${p.area_name}<span class="sep" aria-hidden="true">/</span><time datetime="${new Date((p.published_at ?? p.created_at) * 1000).toISOString()}">${fmtAgo(p.published_at ?? p.created_at)}</time></span>
        ${price ? html`<span class="row-price">${price}</span>` : ''}
      </span>
      ${p.featured ? html`<span class="ribbon">مميز</span>` : ''}
      ${p.type === 'community' && p.is_official ? html`<span class="ribbon ribbon-official">خبر مؤكد</span>` : ''}
    </a>
  </li>`;
}

export function rowList(items: ListItem[], empty: SafeHtml): SafeHtml {
  return items.length ? html`<ul class="rows">${items.map(listRow)}</ul>` : empty;
}

export function emptyState(title: string, text: string, action?: { href: string; label: string }): SafeHtml {
  return html`<div class="empty">${icon('info', 'i i-lg')}<p class="empty-title">${title}</p><p>${text}</p>${action ? html`<a class="btn btn-primary" href="${action.href}">${action.label}</a>` : ''}</div>`;
}

export function pagination(page: number, pages: number, base: URLSearchParams, path: string): SafeHtml {
  if (pages <= 1) return html``;
  const link = (n: number) => { const q = new URLSearchParams(base); q.set('page', String(n)); return `${path}?${q}`; };
  return html`<nav class="pager" aria-label="الصفحات">
    ${page > 1 ? html`<a class="btn" href="${link(page - 1)}" rel="prev">السابق</a>` : ''}
    <span>صفحة ${page} من ${pages}</span>
    ${page < pages ? html`<a class="btn" href="${link(page + 1)}" rel="next">التالي</a>` : ''}
  </nav>`;
}

export const statusBadge = (s: PostStatus) => html`<span class="status status-${s}">${STATUS_LABEL[s]}</span>`;

export function errorList(errors: string[]): SafeHtml {
  if (!errors.length) return html``;
  return html`<div class="form-errors" role="alert" tabindex="-1" id="form-errors"><p>راجع الحقول التالية:</p><ul>${errors.map((e) => html`<li>${e}</li>`)}</ul></div>`;
}

interface FieldOpts { name: string; label: string; value?: string | number | null; type?: string; required?: boolean; hint?: string; max?: number; attrs?: string; dir?: string }

export function field(o: FieldOpts): SafeHtml {
  const id = `f-${o.name}`;
  const hint = o.hint ? html`<span class="hint" id="${id}-h">${o.hint}</span>` : '';
  return html`<div class="field"><label for="${id}">${o.label}${o.required ? '' : html` <span class="opt">(اختياري)</span>`}</label>${hint}
    <input id="${id}" name="${o.name}" type="${o.type ?? 'text'}" value="${o.value ?? ''}" ${o.required ? raw('required') : ''} ${o.max ? raw(`maxlength="${o.max}"`) : ''} ${o.hint ? raw(`aria-describedby="${id}-h"`) : ''} ${o.dir ? raw(`dir="${o.dir}"`) : ''} ${raw(o.attrs ?? '')}></div>`;
}

export function textarea(o: FieldOpts & { rows?: number }): SafeHtml {
  const id = `f-${o.name}`;
  return html`<div class="field"><label for="${id}">${o.label}${o.required ? '' : html` <span class="opt">(اختياري)</span>`}</label>${o.hint ? html`<span class="hint" id="${id}-h">${o.hint}</span>` : ''}
    <textarea id="${id}" name="${o.name}" rows="${o.rows ?? 5}" ${o.max ? raw(`maxlength="${o.max}"`) : ''} ${o.required ? raw('required') : ''} ${o.hint ? raw(`aria-describedby="${id}-h"`) : ''}>${o.value ?? ''}</textarea></div>`;
}

export function select(o: { name: string; label: string; options: [string | number, string][]; value?: string | number | null; required?: boolean; placeholder?: string; hint?: string }): SafeHtml {
  const id = `f-${o.name}`;
  return html`<div class="field"><label for="${id}">${o.label}${o.required ? '' : html` <span class="opt">(اختياري)</span>`}</label>${o.hint ? html`<span class="hint">${o.hint}</span>` : ''}
    <select id="${id}" name="${o.name}" ${o.required ? raw('required') : ''}>
      ${o.placeholder !== undefined ? html`<option value="">${o.placeholder}</option>` : ''}
      ${o.options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(o.value ?? '') ? raw('selected') : ''}>${l}</option>`)}
    </select></div>`;
}

export function checkbox(o: { name: string; label: string; checked?: boolean; hint?: string }): SafeHtml {
  const id = `f-${o.name}`;
  return html`<div class="check"><input type="checkbox" id="${id}" name="${o.name}" ${o.checked ? raw('checked') : ''}><label for="${id}">${o.label}${o.hint ? html`<span class="hint">${o.hint}</span>` : ''}</label></div>`;
}

export function stars(n: number): SafeHtml {
  return html`<span class="stars" aria-label="${n} من ٥">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= Math.round(n) ? 'i i-sm star-on' : 'i i-sm star-off'))}</span>`;
}
