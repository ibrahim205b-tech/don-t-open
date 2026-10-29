// Regenerates assets/og-image.jpg and the PNG app icons with Playwright.
// Usage: node tools/render-assets.cjs   (needs the "playwright" package)
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto('file://' + path.join(root, 'tools/og-image.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, 'assets/og-image.jpg'), type: 'jpeg', quality: 88 });
  for (const s of [180, 512]) {
    const q = await browser.newPage({ viewport: { width: s, height: s } });
    await q.setContent(`<style>html,body{margin:0;background:#070607}</style><img src="file://${root}/assets/favicon.svg" width="${s}" height="${s}">`);
    await q.waitForTimeout(200);
    await q.screenshot({ path: path.join(root, `assets/icon-${s}.png`) });
  }
  await browser.close();
})();
