// قوالب HTML مع تهريب تلقائي: كل قيمة مُدرجة تُهرَّب ما لم تكن SafeHtml صريحة.
export class SafeHtml {
  readonly value: string;
  constructor(value: string) { this.value = value; }
  toString() { return this.value; }
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(v: unknown): string {
  return String(v).replace(/[&<>"'`]/g, (c) => ESC[c]);
}

type Part = SafeHtml | string | number | boolean | null | undefined | Part[];

function render(v: Part): string {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join('');
  return escapeHtml(v);
}

export function html(strings: TemplateStringsArray, ...values: Part[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

/** فقط لنصوص ثابتة يكتبها المطوّر، لا لمدخلات المستخدم. */
export const raw = (s: string) => new SafeHtml(s);

/** نص متعدد الأسطر من المستخدم: يُهرَّب ثم تُحوَّل الأسطر الفارغة إلى فقرات. */
export function paragraphs(text: string): SafeHtml {
  const parts = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return new SafeHtml(parts.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''));
}

/** JSON داخل <script type="application/ld+json"> من دون إمكانية كسر الوسم. */
export function jsonScript(data: unknown): SafeHtml {
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return new SafeHtml(`<script type="application/ld+json">${json}</script>`);
}
