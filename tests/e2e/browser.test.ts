// اختبارات متصفح حقيقية (Chromium عبر Playwright) على خادم محلي معزول.
// يحتاج متصفح Chromium الخاص بـ Playwright: npx playwright install chromium
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium, type Browser, type Page } from 'playwright';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.ts';
import { loadConfig } from '../../src/config.ts';
import { openDatabase } from '../../src/db/index.ts';
import { hashPassword } from '../../src/lib/password.ts';

const PORT = 4100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'browser-test-pass';
let app: FastifyInstance;
let browser: Browser;
let tmp: string;
const cspErrors: string[] = [];

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dalil-e2e-'));
  const cfg = loadConfig({ baseUrl: BASE, databasePath: path.join(tmp, 'e2e.db'), uploadDir: path.join(tmp, 'up'), port: PORT, cookieSecure: false, adminRequireMfa: false },
    { NODE_ENV: 'test', SESSION_SECRET: 'e2e-secret-'.padEnd(48, 'z') });
  const db = openDatabase(cfg.databasePath);
  db.prepare("INSERT INTO users (name, phone, password_hash, role) VALUES ('مدير الاختبار', '07711111111', ?, 'admin')").run(await hashPassword(PASS));
  app = await buildApp(cfg, { db, logger: false, jobs: false });
  await app.listen({ host: '127.0.0.1', port: PORT });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await app?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.deepEqual(cspErrors, [], 'no Content-Security-Policy violations');
});

async function newPage(width = 390, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'ar-IQ' });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text()); });
  page.on('pageerror', (e) => cspErrors.push('pageerror: ' + e.message));
  return page;
}

async function noHorizontalScroll(page: Page, label: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, `${label}: horizontal overflow ${over}px`);
}

test('mobile home: RTL, search box, menu and support links', async () => {
  const page = await newPage();
  await page.goto(BASE + '/');
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  assert.equal(await page.getAttribute('html', 'lang'), 'ar');
  assert.equal((await page.textContent('h1'))?.trim(), 'شنو تحتاج بالمعامل؟');
  await noHorizontalScroll(page, 'home');
  // القائمة تفتح وتغلق
  const toggle = page.locator('.menu-toggle');
  assert.equal(await page.locator('#site-menu').isVisible(), false);
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#site-menu').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  // روابط الدعم
  assert.equal(await page.locator('footer a[href="tel:07763438000"]').count(), 1);
  assert.equal(await page.locator('footer a[href="https://wa.me/9647763438000"]').count(), 1);
  assert.ok((await page.textContent('footer'))!.includes('جميع الحقوق محفوظة © إبراهيم علي الشويلي'));
  // رابط تخطي المحتوى أول عنصر قابل للتركيز
  await page.goto(BASE + '/');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip');
  // البحث الفارغ يعرض حالة واضحة
  await page.fill('#q-hero', 'شي غير موجود');
  await page.click('.search-big button[type=submit]');
  await page.waitForURL(/\/search\?/);
  assert.ok((await page.textContent('main'))!.includes('ما لگينا نتائج'));
  await page.context().close();
});

test('register → submit job with image → admin approves → visible to public', async () => {
  const user = await newPage();
  await user.goto(BASE + '/register');
  await user.fill('#f-name', 'سارة');
  await user.fill('#f-phone', '07722222222');
  await user.fill('#f-password', 'my-secure-pass-123');
  await user.check('#f-agree');
  await user.click('form.form button[type=submit]');
  await user.waitForURL(BASE + '/account');
  assert.ok((await user.textContent('.flash'))!.includes('تم إنشاء حسابك'));

  await user.goto(BASE + '/submit');
  await noHorizontalScroll(user, 'submit chooser');
  await user.click('a[href="/submit/job"]');
  await noHorizontalScroll(user, 'job form');
  await user.fill('#f-title', 'مطلوب عامل توصيل بدراجة');
  await user.selectOption('#f-category_id', { index: 1 });
  await user.fill('#f-d_workplace', 'مطعم الحي');
  await user.selectOption('#f-d_employment', 'full');
  await user.fill('#f-price', '٤٠٠٠٠٠');
  await user.fill('#f-body', 'توصيل طلبات داخل المنطقة.');
  const img = path.join(tmp, 'photo.jpg');
  fs.writeFileSync(img, await sharp({ create: { width: 640, height: 480, channels: 3, background: '#c33' } }).jpeg().toBuffer());
  await user.setInputFiles('#f-images', img);
  assert.equal(await user.locator('[data-preview] img').count(), 1, 'image preview shown');
  await user.click('button[name=action][value=submit]');
  await user.waitForURL(/\/account\/posts\/\d+$/);
  assert.ok((await user.textContent('main'))!.includes('بانتظار المراجعة'));
  const postId = user.url().match(/(\d+)$/)![1];

  const anon = await newPage();
  assert.equal((await anon.goto(`${BASE}/jobs/${postId}`))!.status(), 404, 'pending post hidden');

  const admin = await newPage(1280, 900);
  await admin.goto(BASE + '/login');
  await admin.fill('#f-phone', '07711111111');
  await admin.fill('#f-password', PASS);
  await admin.click('form.form button[type=submit]');
  await admin.goto(BASE + '/admin/queue');
  await admin.click(`a[href="/admin/posts/${postId}"]`);
  assert.ok((await admin.textContent('main'))!.includes('مطلوب عامل توصيل بدراجة'));
  assert.equal(await admin.locator('.thumbs img').count(), 1, 'moderator sees uploaded image');
  await admin.click('button:has-text("موافقة ونشر")');
  await admin.waitForURL(/\/admin\/queue/);

  const res = await anon.goto(`${BASE}/jobs/${postId}`);
  assert.equal(res!.status(), 200);
  await noHorizontalScroll(anon, 'job detail');
  const body = await anon.textContent('main');
  assert.ok(body!.includes('٤٠٠٬٠٠٠') || body!.includes('400,000') || body!.includes('٤٠٠'), 'salary shown in IQD');
  assert.equal(await anon.locator('a[href="tel:07722222222"]').count(), 1);
  const imgOk = await anon.evaluate(async () => { const i = document.querySelector('.gallery img') as HTMLImageElement; await i.decode(); return i.naturalWidth > 0; });
  assert.ok(imgOk, 'image loads');
  await anon.goto(BASE + '/jobs');
  assert.ok((await anon.textContent('.rows'))!.includes('مطلوب عامل توصيل بدراجة'));

  // الإبلاغ من الواجهة
  await anon.goto(`${BASE}/jobs/${postId}`);
  await anon.click('summary:has-text("إبلاغ")');
  await anon.selectOption('#f-reason', 'spam');
  await anon.click('form[action$="/report"] button[type=submit]');
  assert.ok((await anon.textContent('.flash'))!.includes('وصلنا بلاغك'));

  for (const p of [user, anon, admin]) await p.context().close();
});

test('key pages fit small screens without horizontal scrolling', async () => {
  const page = await newPage(320, 640);
  for (const url of ['/', '/businesses', '/restaurants', '/jobs', '/help', '/about', '/contact', '/policies/privacy', '/login', '/register', '/search?q=x']) {
    await page.goto(BASE + url);
    await noHorizontalScroll(page, url);
  }
  await page.context().close();
});
