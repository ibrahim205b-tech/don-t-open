const num = new Intl.NumberFormat('ar-IQ');
const date = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeZone: 'Asia/Baghdad' });
const dateTime = new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Baghdad' });

export const fmtNumber = (n: number) => num.format(n);
export const fmtPrice = (n: number | null | undefined) => (n === null || n === undefined ? '' : `${num.format(n)} د.ع`);
export const fmtDate = (t: number | null | undefined) => (t ? date.format(new Date(t * 1000)) : '');
export const fmtDateTime = (t: number | null | undefined) => (t ? dateTime.format(new Date(t * 1000)) : '');

export function fmtAgo(t: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const s = Math.max(0, nowSec - t);
  if (s < 3600) return 'قبل قليل';
  if (s < 86400) return `قبل ${num.format(Math.floor(s / 3600))} ساعة`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'أمس';
  if (d < 30) return `قبل ${num.format(d)} يوم`;
  return fmtDate(t);
}
