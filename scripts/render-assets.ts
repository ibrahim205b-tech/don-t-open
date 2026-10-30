// يولّد أيقونات PNG وصورة المعاينة الاجتماعية من شعار SVG. يُشغَّل يدوياً عند تغيير الشعار.
import fs from 'node:fs';
import sharp from 'sharp';

const logo = fs.readFileSync('public/img/logo.svg');
for (const size of [180, 192, 512]) {
  await sharp(logo, { density: 600 }).resize(size, size).png().toFile(`public/img/icon-${size}.png`);
}
// صورة المعاينة: لوح أخضر بإطار أصفر والشعار في الوسط (من دون نص لتجنب الاعتماد على خطوط النظام)
const og = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#17594A"/><rect x="30" y="30" width="1140" height="570" rx="24" fill="none" stroke="#F2C230" stroke-width="10"/>
<g transform="translate(450 165) scale(4.6875)"><path d="M20 22h20a6 6 0 0 1 6 6v14H18v-7h21v-7H20z" fill="#F2C230"/></g></svg>`);
await sharp(og).png().toFile('public/img/og.png');
console.log('done');
