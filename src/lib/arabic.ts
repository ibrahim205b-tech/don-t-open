const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;

/** تطبيع النص العربي للبحث ومقارنة التكرار. */
export function normalizeArabic(input: string): string {
  return input
    .normalize('NFKC')
    .replace(DIACRITICS, '')
    .replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10))
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// السوابق الملتصقة بالكلمة (ال، لل، وال، بال...) تُزال حتى تتطابق «الإيجار» و«للإيجار» و«إيجار».
const PREFIX = /^(وال|بال|فال|كال|لل|ال)(?=\p{L}{2,})/u;
const stripPrefix = (t: string) => t.replace(PREFIX, '');
const tokenize = (s: string) => normalizeArabic(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(' ').filter(Boolean);

/** النص المخزّن في فهرس البحث: كل كلمة بصيغتها المطبّعة، مع صيغتها بلا سابقة إن وجدت. */
export function searchText(input: string): string {
  return tokenize(input).map((t) => { const b = stripPrefix(t); return b === t ? t : `${t} ${b}`; }).join(' ');
}

/** يحوّل نص البحث إلى استعلام FTS5 آمن: كل كلمة بين علامتي تنصيص مع بحث بالبادئة. */
export function toFtsQuery(input: string): string | null {
  const tokens = tokenize(input).map(stripPrefix).filter((t) => t.length >= 2).slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t}"*`).join(' ');
}

/** أرقام الهواتف: يقبل الأرقام العربية والمسافات وبادئة 964+ ويعيد 07XXXXXXXXX أو null. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(ARABIC_DIGITS, (c) => String((c.charCodeAt(0) & 0xf) % 10)).replace(/[\s\-()]/g, '');
  if (d.startsWith('+964')) d = '0' + d.slice(4);
  else if (d.startsWith('00964')) d = '0' + d.slice(5);
  else if (d.startsWith('964')) d = '0' + d.slice(3);
  return /^07\d{9}$/.test(d) ? d : null;
}

export const waLink = (phone: string) => `https://wa.me/964${phone.slice(1)}`;
export const telLink = (phone: string) => `tel:${phone}`;

export function slugify(title: string): string {
  return normalizeArabic(title).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
