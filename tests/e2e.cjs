// End-to-end tests for DON'T OPEN. Starts its own static server and drives
// Chromium with Playwright through every stage, ending, secret and fallback.
//
//   node tests/e2e.cjs            (requires the "playwright" package)
//   BASE_URL=https://… node tests/e2e.cjs   to test a deployed copy

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

let passed = 0;
const failures = [];
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const t0 = Date.now();
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${String(err && err.stack || err).split('\n').slice(0, 4).join('\n      ')}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

/* ---------------------------------------------------------------- */

const NEIGHBOURS = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3); const c = i % 3; const o = [i];
  if (r > 0) o.push(i - 3); if (r < 2) o.push(i + 3); if (c > 0) o.push(i - 1); if (c < 2) o.push(i + 1);
  return o;
});
function solve(grid) {
  let best = null;
  for (let m = 0; m < 512; m++) {
    const g = grid.slice(); const ps = [];
    for (let i = 0; i < 9; i++) if (m & (1 << i)) { ps.push(i); for (const j of NEIGHBOURS[i]) g[j] = !g[j]; }
    if (g.every(Boolean) && (!best || ps.length < best.length)) best = ps;
  }
  return best;
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, ...opts.context });
  // The once-per-session intro is covered by its own tests; skip it elsewhere.
  if (!opts.intro) await ctx.addInitScript(() => { try { sessionStorage.setItem('dontopen:intro-seen', '1'); } catch { /* ignore */ } });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  return page;
}

const state = (page) => page.evaluate(() => window.__dontOpen.getState());
const stageIndex = async (page) => (await state(page)).run?.stage;

async function waitStage(page, n) {
  await page.waitForFunction((n) => window.__dontOpen.getState().run?.stage === n && document.querySelector(`.stage[data-stage="${n}"]`)?.children.length && !document.querySelector('.screen-out'), n, { timeout: 15000 });
  await page.waitForTimeout(150);
}

async function noOverflow(page, label) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(o <= 0, `${label}: horizontal overflow of ${o}px`);
}

/** Play the whole chapter. opts: ledger (0 sign, 1 tear, 2 ignore), final ('leave'|'open'|'stay'|'name'), extras. */
async function playthrough(page, base, opts) {
  await page.goto(base);
  await page.waitForSelector('.landing .btn--primary, .stage[data-stage="0"]');
  if (await page.locator('.landing .btn--primary').count()) await page.click('.landing .btn--primary');
  await waitStage(page, 0);
  const width = page.viewportSize().width;

  // Stage 1 — the door
  await noOverflow(page, `stage1@${width}`);
  await page.click('.hs-lock');
  assert(await page.isVisible('.feedback.is-error'), 'locked door should give an error');
  await page.click('.hs-frame');
  assert(await page.isVisible('.feedback.is-error'), 'frame without light should give feedback');
  if (opts.peep) await page.click('.hs-peep');
  await page.click('.hs-mat');
  await page.click('.hs-lamp');
  await page.click('.hs-frame');
  assert((await state(page)).run.clues.includes('time'), 'key tag clue recorded');
  await page.click('.stage-actions .btn--primary');
  await waitStage(page, 1);

  // Stage 2 — the message
  await noOverflow(page, `stage2@${width}`);
  if (opts.watermark) await page.click('.btn-row .btn--ghost');
  await page.click('.word-lock .btn--primary');
  assert(await page.isVisible('.feedback.is-error'), 'empty answer rejected');
  await page.fill('#s2-answer', 'باب');
  await page.click('.word-lock .btn--primary');
  assert(await page.isVisible('.feedback.is-error'), 'wrong answer rejected');
  if (opts.hint) {
    await page.click('.hints .btn');
    assert(await page.isVisible('.hint-box'), 'hint shown');
  }
  if (opts.reloadMid) {
    await page.reload();
    await waitStage(page, 1);
    assert((await state(page)).run.stage === 1, 'progress survives refresh');
  }
  await page.fill('#s2-answer', opts.english ? 'Cellar' : 'السِّرداب');
  await page.click('.word-lock .btn--primary');
  await page.click('.stage-actions .btn--primary');
  await waitStage(page, 2);

  // Stage 3 — the choice
  await noOverflow(page, `stage3@${width}`);
  if (opts.date) await page.click('.ledger li.is-blank button');
  if (opts.room) {
    await page.click('.side-door button');
    await page.waitForSelector('.drawing');
    await page.click('.stage-actions .btn');
    await page.waitForSelector('.ledger');
  }
  await page.locator('.choices .choice').nth(opts.ledger).click();
  await page.waitForSelector('.stage-actions .btn--primary');
  await page.click('.stage-actions .btn--primary');
  await waitStage(page, 3);

  // Stage 4 — the pattern
  await noOverflow(page, `stage4@${width}`);
  if (opts.candle) {
    await page.click('.broken-candle');
    assert(!(await state(page)).secrets.candle, 'broken candle needs solved wall first');
  }
  const grid = await page.$$eval('.candle', (els) => els.map((e) => e.classList.contains('is-lit')));
  if (opts.ledger === 1) assert(grid.every((x) => !x), 'tearing the page blows every candle out');
  else assert(grid.some((x) => !x), 'puzzle starts unsolved');
  if (opts.candleHint) {
    await page.click('.hints .btn');
    await page.click('.hints .btn');
    assert(await page.locator('.candle.is-hint').count() === 1, 'hint marks one candle');
  }
  for (const i of solve(grid)) await page.locator('.candle').nth(i).click();
  await page.waitForSelector('.wall-text:not([hidden])');
  if (opts.candle) await page.click('.broken-candle');
  await page.click('.stage-actions .btn--primary');
  await waitStage(page, 4);

  // Stage 5 — the silence
  assert(await page.evaluate(() => document.body.classList.contains('is-silent')), 'silence mode active');
  if (opts.rush) {
    await page.waitForTimeout(1000);
    await page.mouse.click(200, 400);
    assert((await state(page)).run.rushed === 1, 'rushing is counted');
  }
  await page.waitForSelector('.silence .choices', { timeout: 20000 });
  await page.locator('.silence .choice').nth(0).click(); // wrong: candles
  assert(await page.isVisible('.feedback.is-error'), 'wrong silence answer rejected');
  if (opts.patience) await page.waitForFunction(() => window.__dontOpen.getState().secrets.patience, null, { timeout: 25000 });
  await page.locator('.silence .choice').nth(1).click(); // correct: backwards
  await page.click('.silence .btn--primary');
  await waitStage(page, 5);
  assert(!(await page.evaluate(() => document.body.classList.contains('is-silent'))), 'silence mode cleared');

  // Stage 6 — the secret
  await noOverflow(page, `stage6@${width}`);
  const dial = async (code) => {
    await page.locator('.dial__val').first().focus();
    for (const d of code) await page.keyboard.press(d);
    await page.click('.box .btn--primary');
  };
  if (opts.number) await dial('014');
  await dial('317');
  assert(await page.isVisible('.feedback.is-error'), '317 rejected with feedback');
  // also exercise the arrow buttons
  await page.locator('.dial__btn').first().click();
  await dial('713');
  await page.waitForSelector('.note');
  await page.click('.stage-actions .btn--primary');
  await waitStage(page, 6);

  // Stage 7 — final decision
  await noOverflow(page, `stage7@${width}`);
  const faint = await page.locator('.choice--faint').count();
  if (opts.final === 'name') {
    assert(faint === 1, 'name option visible once the name is known');
    await page.click('.choice--faint');
    await page.fill('#s7-name', 'سلمى');
    await page.click('form.word-lock .btn--primary');
    assert(await page.isVisible('.feedback.is-error'), 'wrong name rejected');
    await page.fill('#s7-name', opts.english ? 'Sidra' : 'سدره');
    await page.click('form.word-lock .btn--primary');
  } else {
    const idx = { leave: 0, open: 1, stay: 2 }[opts.final];
    await page.locator('.choices .choice').nth(idx).click();
    await page.waitForSelector('#modal[open]');
    await page.click('#modalActions .btn--ghost'); // cancel first
    assert((await stageIndex(page)) === 6, 'cancel keeps you at the final stage');
    await page.locator('.choices .choice').nth(idx).click();
    await page.click('#modalActions .btn--primary');
  }
  await page.waitForSelector('.ending h1');
  await page.waitForTimeout(200);
  await noOverflow(page, `ending@${width}`);
  return state(page);
}

/* ---------------------------------------------------------------- */

(async () => {
  const srv = process.env.BASE_URL ? null : await serve();
  const base = process.env.BASE_URL || `http://127.0.0.1:${srv.address().port}/`;
  console.log(`Testing ${base}`);
  const browser = await chromium.launch();

  for (const [label, viewport] of [['phone', { width: 360, height: 740 }], ['desktop', { width: 1366, height: 768 }]]) {
    await test(`intro credits on ${label}: content, timing, once per session, footer`, async () => {
      const page = await newPage(browser, { intro: true, context: { viewport }, init: () => {
        // Record exactly when the intro enters and leaves the DOM.
        window.__intro = {};
        new MutationObserver((muts) => {
          for (const m of muts) {
            for (const n of m.addedNodes) if (n.classList?.contains('intro')) window.__intro.added = performance.now();
            for (const n of m.removedNodes) if (n.classList?.contains('intro')) window.__intro.removed = performance.now();
          }
        }).observe(document, { childList: true, subtree: true });
      } });
      await page.goto(base);
      await page.waitForSelector('.intro');
      const text = await page.textContent('.intro');
      for (const s of ['Created by Ibrahim Ali', 'بعض الأفكار تبدأ بفضول... وبعضها لا يُنسى بعد اكتشافه', "DON'T OPEN", 'تجربة من تصميم وتطوير إبراهيم علي']) assert(text.includes(s), `intro missing: ${s}`);
      assert(await page.evaluate(() => document.getElementById('app').inert), 'page behind intro is inert');
      await page.waitForTimeout(2300);
      for (const sel of ['.intro__by', '.intro__line', '.intro__title', '.intro__sig']) {
        const box = await page.locator(sel).boundingBox();
        const vis = await page.$eval(sel, (e) => { const s = getComputedStyle(e); return Number(s.opacity) > 0.9 && s.visibility === 'visible'; });
        assert(vis, `${sel} visible`);
        assert(box && box.x >= 0 && box.x + box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height, `${sel} fully on screen ${JSON.stringify(box)}`);
      }
      const byPx = await page.$eval('.intro__by', (e) => parseFloat(getComputedStyle(e).fontSize));
      assert(byPx >= 16, `name font size ${byPx}`);
      await page.screenshot({ path: path.join(process.env.ARTIFACT_DIR || require('os').tmpdir(), `intro-${label}.png`) });
      await page.waitForSelector('.intro', { state: 'detached', timeout: 4000 });
      const { added, removed } = await page.evaluate(() => window.__intro);
      const took = Math.round(removed - added);
      assert(took <= 4100, `intro was on screen for ${took}ms`);
      console.log(`      intro on screen for ${took}ms`);
      assert(!(await page.evaluate(() => document.getElementById('app').inert)), 'page interactive again');
      assert(await page.isVisible('.landing .btn--primary'), 'landing after intro');
      const foot = (await page.textContent('#siteFooter')).trim();
      assert(foot === "© 2026 Ibrahim Ali — DON'T OPEN", `footer: ${foot}`);
      await page.locator('#siteFooter').scrollIntoViewIfNeeded();
      assert(await page.isVisible('#copyright'), 'footer visible');
      await noOverflow(page, `footer@${label}`);
      await page.reload();
      await page.waitForSelector('.landing h1');
      await page.waitForTimeout(300);
      assert(await page.locator('.intro').count() === 0, 'intro not repeated in the same session');
      await page.click('#langBtn');
      assert((await page.textContent('#siteFooter')).includes('Ibrahim Ali'), 'footer in English mode');
      assert(!page.errors.length, page.errors.join('\n'));
    });
  }

  await test('intro: skip button, Escape, and reduced motion', async () => {
    const page = await newPage(browser, { intro: true });
    await page.goto(base);
    await page.waitForSelector('.intro__skip');
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement.classList.contains('intro__skip')), 'skip reachable by keyboard');
    await page.click('.intro__skip');
    await page.waitForSelector('.intro', { state: 'detached', timeout: 1000 });
    await page.click('.landing .btn--primary');
    await waitStage(page, 0);
    const p2 = await newPage(browser, { intro: true, context: { reducedMotion: 'reduce' } });
    await p2.goto(base);
    await p2.waitForSelector('.intro--still');
    const op = await p2.$eval('.intro__sig', (e) => getComputedStyle(e).opacity);
    assert(op === '1', `reduced motion shows text at once (opacity ${op})`);
    await p2.keyboard.press('Escape');
    await p2.waitForSelector('.intro', { state: 'detached', timeout: 1000 });
    assert(!p2.errors.length && !page.errors.length, [...p2.errors, ...page.errors].join('\n'));
  });

  await test('landing page renders without errors, sound off by default', async () => {
    const page = await newPage(browser);
    await page.goto(base);
    await page.waitForSelector('.landing h1');
    assert((await page.textContent('.landing h1')).includes('لا تفتح'), 'wordmark');
    assert(await page.isVisible('text=افتح الباب'), 'main button');
    assert((await page.getAttribute('#soundBtn', 'aria-pressed')) === 'false', 'sound off by default');
    assert(await page.isHidden('#notebookBtn'), 'notebook hidden on landing');
    assert((await page.getAttribute('html', 'dir')) === 'rtl', 'rtl layout');
    await noOverflow(page, 'landing');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  let unknownPage;
  await test('ending OBSERVER (signed ledger + leave) with secrets eye, watermark, date, room, number; refresh mid-run', async () => {
    const page = await newPage(browser);
    const s = await playthrough(page, base, { ledger: 0, final: 'leave', peep: true, watermark: true, date: true, room: true, number: true, reloadMid: true, hint: true });
    assert(s.lastResult.ending === 'observer' && s.lastResult.variant === 'bound', `got ${s.lastResult.ending}/${s.lastResult.variant}`);
    assert(await page.evaluate(() => document.body.classList.contains('theme-observer')), 'observer theme');
    for (const k of ['eye', 'watermark', 'date', 'room', 'number']) assert(s.secrets[k], `secret ${k}`);
    assert(s.run === null, 'run cleared after ending');
    const why = await page.$$eval('.why li', (l) => l.map((x) => x.textContent));
    assert(why.some((x) => x.includes('كتبت')) && why.some((x) => x.includes('اسمك بالدفتر')), 'explanation mentions the signature');
    assert(!page.errors.length, page.errors.join('\n'));
    unknownPage = page;
  });

  await test('ending UNKNOWN (call the door by name) — replay keeps previous secrets', async () => {
    const page = unknownPage;
    await page.click('.ending .btn--ghost'); // play again
    await waitStage(page, 0);
    const before = (await state(page)).secrets;
    assert(Object.keys(before).length >= 5, 'secrets persisted across replay');
    const s = await playthrough(page, base, { ledger: 2, final: 'name' });
    assert(s.lastResult.ending === 'unknown', `got ${s.lastResult.ending}`);
    assert(await page.evaluate(() => document.body.classList.contains('theme-unknown')), 'unknown theme');
    assert(Object.keys(s.endings).length === 2, 'two endings recorded');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('ending ESCAPED (tear + leave) with candle & patience secrets and candle hint', async () => {
    const page = await newPage(browser);
    const s = await playthrough(page, base, { ledger: 1, final: 'leave', candle: true, candleHint: true, patience: true });
    assert(s.lastResult.ending === 'escaped' && s.lastResult.variant === 'tear', `got ${s.lastResult.ending}/${s.lastResult.variant}`);
    assert(s.secrets.candle && s.secrets.patience, 'candle + patience secrets');
    const body = await page.textContent('.ending__body');
    assert(body.includes('الصفحة الممزقة'), 'tear variant text');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('ending LAST DOOR (ignore + open) with rushing the silence', async () => {
    const page = await newPage(browser);
    const s = await playthrough(page, base, { ledger: 2, final: 'open', rush: true });
    assert(s.lastResult.ending === 'lastdoor', `got ${s.lastResult.ending}`);
    assert(s.lastResult.reasons.includes('rushed'), 'rushing affects explanation');
    assert(await page.locator('.choice--faint').count() === 0, 'no leftover UI');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('ending OBSERVER via staying (different text from the bound variant)', async () => {
    const page = await newPage(browser);
    const s = await playthrough(page, base, { ledger: 1, final: 'stay' });
    assert(s.lastResult.ending === 'observer' && s.lastResult.variant === 'a', 'stay variant');
    assert((await page.textContent('.ending__body')).includes('سحبت الكرسي'), 'stay variant text');
    assert(await page.locator('.choice--faint').count() === 0);
  });

  await test('English mode plays end to end (LTR, English answers)', async () => {
    const page = await newPage(browser, { context: { viewport: { width: 1280, height: 800 } } });
    await page.goto(base);
    await page.click('#langBtn');
    assert((await page.getAttribute('html', 'dir')) === 'ltr', 'ltr');
    assert(await page.isVisible('text=Open the door'), 'english button');
    const s = await playthrough(page, base, { ledger: 0, final: 'open', english: true, watermark: true });
    assert(s.lang === 'en' && s.lastResult.ending === 'lastdoor');
    assert((await page.textContent('.ending h1')).includes('The Last Door'));
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('share: Web Share API is used when available', async () => {
    const page = await newPage(browser, { init: () => { window.__shared = null; navigator.share = async (d) => { window.__shared = d; }; } });
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('dontopen:v1', JSON.stringify({ v: 1, screen: 'ending', secrets: { eye: 1 }, endings: { escaped: { count: 1, first: 1 } }, history: [], lastResult: { ending: 'escaped', chapter: 1, variant: 'a', reasons: ['ignore', 'patient', 'leave', 'secrets', 'nohints'], ctx: { ledger: 'ignore', rushed: 0, hints: 0 }, secretsFound: 3 } })));
    await page.reload();
    await page.waitForSelector('.ending h1');
    await page.click('.ending .btn--primary');
    const shared = await page.evaluate(() => window.__shared);
    assert(shared && /[?&]e=escaped/.test(shared.url) && /[?&]s=3/.test(shared.url), `share payload ${JSON.stringify(shared)}`);
    assert(shared.text.includes('الناجي'), 'share text names the ending');
    assert((await page.textContent('.share-status')).length > 0, 'status shown');
  });

  await test('share: copy-link fallback + downloadable result card', async () => {
    const page = await newPage(browser, { context: { permissions: ['clipboard-read', 'clipboard-write'] }, init: () => { delete Navigator.prototype.share; } });
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('dontopen:v1', JSON.stringify({ v: 1, screen: 'ending', secrets: {}, endings: { unknown: { count: 1, first: 1 } }, history: [], lastResult: { ending: 'unknown', chapter: 1, variant: 'a', reasons: ['tear', 'patient', 'name', 'secrets', 'hints'], ctx: { ledger: 'tear', rushed: 0, hints: 2 }, secretsFound: 7 } })));
    await page.reload();
    await page.waitForSelector('.ending h1');
    await page.click('.ending .btn--primary'); // share → falls back to copy
    let clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip.includes('e=unknown') && clip.includes('المجهول'), `clipboard after share: ${clip}`);
    await page.locator('.ending .btn-row').first().locator('.btn').nth(1).click(); // copy link
    clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(/\?e=unknown&s=7$/.test(clip), `copied link ${clip}`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.ending .btn-row').first().locator('.btn').nth(2).click()]);
    assert(dl.suggestedFilename() === 'dont-open-unknown.png', dl.suggestedFilename());
    const file = await dl.path();
    const size = fs.statSync(file).size;
    assert(size > 20000, `card size ${size}`);
    fs.copyFileSync(file, path.join(process.env.ARTIFACT_DIR || require('os').tmpdir(), 'card-unknown.png'));
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('challenge link shows a clearly-local challenge banner; bad params ignored', async () => {
    const page = await newPage(browser);
    await page.goto(`${base}?e=observer&s=4`);
    await page.waitForSelector('.challenge-banner');
    const txt = await page.textContent('.challenge-banner');
    assert(txt.includes('المراقب') && txt.includes('٤') && txt.includes('ما يتحقق'), txt);
    await page.goto(`${base}?e=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&s=99`);
    await page.waitForSelector('.landing h1');
    assert(await page.locator('.challenge-banner').count() === 0, 'invalid challenge ignored');
    await page.goto(`${base}?e=lastdoor&s=999&lang=en`);
    await page.waitForSelector('.challenge-banner');
    const t2 = await page.textContent('.challenge-banner');
    assert(t2.includes('The Last Door') && t2.includes('0 of 7'), t2);
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('corrupted / missing localStorage data does not crash', async () => {
    const page = await newPage(browser);
    await page.goto(base);
    for (const bad of ['{not json', '"string"', JSON.stringify({ v: 1, screen: 'game', run: { chapter: 99, stage: 'x' }, secrets: { eye: 'yes', fake: 1 }, endings: { observer: 5 }, history: [{ e: 'nope' }] }), JSON.stringify({ v: 1, screen: 'ending', lastResult: { ending: 'evil' } }), JSON.stringify({ v: 1, screen: 'game', run: { chapter: 1, stage: 5, flags: { 'secret.dials': 'xx', '__proto__': 1 }, choices: { ledger: 'sign' } } })]) {
      await page.evaluate((b) => localStorage.setItem('dontopen:v1', b), bad);
      await page.reload();
      await page.waitForSelector('main .screen');
    }
    // last one was a valid-ish run at stage 6 with broken dials → stage renders with defaults
    assert(await page.isVisible('.dials'), 'stage 6 recovered with default dials');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.landing h1');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('works when localStorage is blocked entirely', async () => {
    const page = await newPage(browser, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
    await page.goto(base);
    await page.waitForSelector('.landing h1');
    await page.waitForSelector('.toast');
    await page.click('.landing .btn--primary');
    await waitStage(page, 0);
    await page.click('.hs-lamp');
    await page.click('.hs-frame');
    await page.click('.stage-actions .btn--primary');
    await waitStage(page, 1);
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('chapters screen, collection screen and reset progress', async () => {
    const page = await newPage(browser);
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('dontopen:v1', JSON.stringify({ v: 1, screen: 'landing', secrets: { eye: 1, room: 2 }, endings: { escaped: { count: 2, first: 1 } }, clearedChapters: { 1: true }, history: [{ e: 'escaped', s: 2, t: Date.now() }], run: { chapter: 1, stage: 2, choices: {}, flags: {}, clues: [], found: [], rushed: 0, hints: 0 } })));
    await page.reload();
    assert(await page.isVisible('text=كمّل من وين وقفت'), 'continue offered');
    await page.click('.landing__foot button >> nth=0');
    await page.waitForSelector('.chapter-card');
    assert(await page.locator('.chapter-card.is-locked').count() === 2, 'future chapters marked coming soon');
    assert((await page.textContent('.chapters')).includes('مكتمل'), 'completed badge');
    await noOverflow(page, 'chapters');
    await page.click('#menuBtn');
    await page.click('#modalActions >> text=الأسرار والنهايات');
    await page.waitForSelector('.tile');
    assert(await page.locator('.tile.is-found').count() === 3, '2 secrets + 1 ending found');
    await noOverflow(page, 'collection');
    await page.click('text=امسح كل التقدّم');
    await page.click('#modalActions .btn--primary');
    await page.waitForSelector('.landing h1');
    const s = await state(page);
    assert(!s.run && !Object.keys(s.secrets).length && !s.history.length, 'state wiped');
    assert(await page.isVisible('text=افتح الباب'), 'fresh start');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('menu restart, notebook, privacy page, sound toggle', async () => {
    const page = await newPage(browser);
    await page.goto(base);
    await page.click('#soundBtn');
    assert((await page.getAttribute('#soundBtn', 'aria-pressed')) === 'true', 'sound on');
    await page.click('#soundBtn');
    assert((await page.getAttribute('#soundBtn', 'aria-pressed')) === 'false', 'sound off');
    await page.click('.landing .btn--primary');
    await waitStage(page, 0);
    await page.click('#notebookBtn');
    assert((await page.textContent('#modalBody')).includes('فارغ'), 'empty notebook');
    await page.keyboard.press('Escape');
    await page.click('.hs-lamp');
    await page.click('.hs-frame');
    await page.click('#notebookBtn');
    assert((await page.textContent('#modalBody')).includes('٣:١٧'), 'clue in notebook');
    await page.click('#modalActions .btn');
    await page.click('#menuBtn');
    await page.click('#modalActions >> text=أعد الفصل من البداية');
    await page.click('#modalActions .btn--primary');
    await waitStage(page, 0);
    assert((await state(page)).run.clues.length === 0, 'restart clears run');
    await page.click('#menuBtn');
    await page.click('#modalActions >> text=الخصوصية');
    await page.waitForSelector('.prose h1');
    assert((await page.textContent('.prose')).includes('localStorage'), 'privacy notice');
    await page.goBack();
    await page.waitForSelector('.stage');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('keyboard-only play of stage 1 and visible focus', async () => {
    const page = await newPage(browser, { context: { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' } });
    await page.goto(base);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    let guard = 0;
    while (!(await page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent.includes('افتح الباب'))) && guard++ < 20) await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert(outline !== 'none', 'focus outline visible');
    await page.keyboard.press('Enter');
    await waitStage(page, 0);
    for (const cls of ['hs-lamp', 'hs-frame']) {
      guard = 0;
      while (!(await page.evaluate((c) => document.activeElement?.classList.contains(c), cls)) && guard++ < 30) await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
    }
    assert((await state(page)).run.flags['door.key'], 'key found by keyboard');
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('small phones (320px) — no horizontal overflow on landing/stage screens', async () => {
    const page = await newPage(browser, { context: { viewport: { width: 320, height: 640 } } });
    await page.goto(base);
    await page.waitForSelector('.landing h1');
    await noOverflow(page, 'landing@320');
    await page.click('.landing .btn--primary');
    await waitStage(page, 0);
    await noOverflow(page, 'stage1@320');
    for (const [stage, ledger] of [[2, null], [3, 'tear'], [5, 'sign'], [6, 'sign']]) {
      await page.evaluate(([st, l]) => { const s = JSON.parse(localStorage.getItem('dontopen:v1')); s.run.stage = st; if (l) s.run.choices.ledger = l; localStorage.setItem('dontopen:v1', JSON.stringify(s)); }, [stage, ledger]);
      await page.reload();
      await waitStage(page, stage);
      await noOverflow(page, `stage${stage + 1}@320`);
    }
    assert(!page.errors.length, page.errors.join('\n'));
  });

  await test('all assets referenced by index.html resolve', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:href|src|content)="([^"#][^"]*\.(?:css|js|svg|png|jpg|woff2|webmanifest))"/g)].map((m) => m[1]);
    const css = fs.readFileSync(path.join(ROOT, 'css/fonts.css'), 'utf8');
    refs.push(...[...css.matchAll(/url\(\.\.\/([^)]+)\)/g)].map((m) => m[1]));
    assert(refs.length > 8, 'found references');
    for (const raw of refs) {
      // Absolute self-references (og:image) are checked against the copy under test.
      const r = raw.replace(/^https:\/\/ibrahim205b-tech\.github\.io\/don-t-open\//, '');
      const res = await fetch(new URL(r, base));
      assert(res.ok, `${r} → ${res.status}`);
    }
  });

  await browser.close();
  if (srv) srv.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})();
