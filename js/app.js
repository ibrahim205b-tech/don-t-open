// DON'T OPEN — لا تفتح : application shell and story engine.

import { L, t, num, setLang, getLang, UI, PRIVACY } from './i18n.js';
import { h, prefersReducedMotion } from './dom.js';
import * as store from './storage.js';
import * as audio from './audio.js';
import * as share from './share.js';
import { CHAPTERS, getChapter } from './chapters/index.js';
import { copyright } from './credits.js';
import { shouldShowIntro, playIntro } from './intro.js';

const SCREENS = { landing: renderLanding, chapters: renderChapters, collection: renderCollection, privacy: renderPrivacy, game: renderGame, ending: renderEnding };
const ALL_ENDINGS = CHAPTERS.flatMap((c) => Object.keys(c.endings));
const TOTAL_SECRETS = CHAPTERS.reduce((n, c) => n + c.secrets.length, 0);

const $ = (id) => document.getElementById(id);
const app = $('app');

let state = store.load(CHAPTERS);
let challenge = null;
let disposers = [];

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

const save = () => store.save(state);

function dispose() {
  for (const d of disposers.splice(0)) {
    try { d(); } catch { /* ignore */ }
  }
}

function toast(html, kind = '') {
  const box = $('toasts');
  const el = h('div', { class: `toast${kind ? ` toast--${kind}` : ''}`, html });
  box.append(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 450);
  }, 4200);
}

function flash() {
  if (prefersReducedMotion()) return;
  const f = h('div', { class: 'flash', 'aria-hidden': 'true' });
  document.body.append(f);
  setTimeout(() => f.remove(), 800);
}

/** Generic modal built on <dialog>, with a graceful fallback. */
function modal({ title, body, actions }) {
  const dlg = $('modal');
  $('modalTitle').textContent = t(title);
  const bodyEl = $('modalBody');
  bodyEl.replaceChildren();
  if (typeof body === 'string' || (body && !(body instanceof Node) && !Array.isArray(body))) bodyEl.innerHTML = t(body);
  else if (body) bodyEl.append(...[].concat(body));
  const actEl = $('modalActions');
  actEl.replaceChildren();
  return new Promise((resolve) => {
    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      if (typeof dlg.close === 'function' && dlg.open) dlg.close();
      else dlg.removeAttribute('open');
      dlg.removeEventListener('cancel', onCancel);
      resolve(v);
    };
    const onCancel = (e) => { e.preventDefault(); close(null); };
    dlg.addEventListener('cancel', onCancel);
    for (const a of actions || [{ label: UI.close, value: null }]) {
      actEl.append(h('button', { class: `btn ${a.primary ? 'btn--primary' : 'btn--ghost'}`, type: 'button', onclick: () => close(a.value) }, t(a.label)));
    }
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    const first = actEl.querySelector('.btn--primary') || actEl.querySelector('button');
    if (first) first.focus();
  });
}

const confirmBox = async ({ title, body, ok, cancel, danger }) =>
  (await modal({ title, body, actions: [{ label: cancel || UI.cancel, value: false }, { label: ok || UI.confirm, value: true, primary: true, danger }] })) === true;

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function go(screen, { push = true, instant = false } = {}) {
  if (!SCREENS[screen]) screen = 'landing';
  if (screen === 'game' && !state.run) screen = 'landing';
  if (screen === 'ending' && !state.lastResult) screen = 'landing';
  const prev = app.firstElementChild;
  const doRender = () => {
    dispose();
    state.screen = screen;
    save();
    if (push && history.state?.screen !== screen) {
      try { history.pushState({ screen }, ''); } catch { /* ignore */ }
    }
    paint();
  };
  if (!instant && prev && !prefersReducedMotion()) {
    prev.classList.add('screen-out');
    setTimeout(doRender, 380);
  } else {
    doRender();
  }
}

function paint() {
  const screen = state.screen;
  document.body.className = '';
  $('notebookBtn').hidden = screen !== 'game';
  $('menuBtn').hidden = screen === 'landing';
  app.replaceChildren();
  SCREENS[screen]();
  window.scrollTo(0, 0);
  const focusTarget = app.querySelector('[data-autofocus]') || app;
  focusTarget.focus({ preventScroll: true });
}

window.addEventListener('popstate', (e) => {
  const s = e.state && e.state.screen;
  go(SCREENS[s] ? s : 'landing', { push: false });
});

/* ------------------------------------------------------------------ */
/* Run management                                                      */
/* ------------------------------------------------------------------ */

function newRun(chapterId) {
  return { chapter: chapterId, stage: 0, choices: {}, flags: {}, clues: [], found: [], rushed: 0, hints: 0, startedAt: Date.now() };
}

function startRun(chapterId = 1) {
  state.run = newRun(chapterId);
  save();
  audio.sfx('door');
  flash();
  go('game');
}

async function confirmNewRun(chapterId = 1) {
  if (state.run && !(await confirmBox({ title: UI.restartConfirmTitle, body: UI.restartConfirmBody, ok: UI.newRun }))) return;
  startRun(chapterId);
}

function recordSecret(chapter, id) {
  const def = chapter.secrets.find((s) => s.id === id);
  if (!def) return false;
  const run = state.run;
  if (run && !run.found.includes(id)) run.found.push(id);
  const fresh = !state.secrets[id];
  if (fresh) {
    state.secrets[id] = Date.now();
    audio.sfx('secret');
    const n = Object.keys(state.secrets).length;
    toast(`◬ ${t(UI.secretFound, { title: t(def.title), n: num(n), total: num(TOTAL_SECRETS) })}`, 'secret');
  }
  save();
  return fresh;
}

function finishRun(final) {
  const run = state.run;
  const chapter = getChapter(run.chapter);
  const result = chapter.resolve(run, final);
  const now = Date.now();
  const prev = state.endings[result.ending];
  state.endings[result.ending] = { count: (prev?.count || 0) + 1, first: prev?.first || now };
  state.history = [...state.history, { e: result.ending, s: run.found.length, t: now }].slice(-store.HISTORY_LIMIT);
  state.clearedChapters[chapter.id] = true;
  state.lastResult = { ...result, chapter: chapter.id, secretsFound: run.found.length };
  state.run = null;
  save();
  audio.sfx('ending');
  flash();
  go('ending');
}

/* ------------------------------------------------------------------ */
/* Stage context — the API every chapter stage renders against        */
/* ------------------------------------------------------------------ */

function makeStageContext(chapter, root) {
  const run = state.run;
  const stage = chapter.stages[run.stage];
  const prefix = `${stage.key}.`;
  const flags = new Proxy({}, { get: (_, p) => run.flags[prefix + String(p)] });

  const ctx = {
    run,
    root,
    flags,
    set(k, v) { run.flags[prefix + k] = v; save(); return v; },
    save,
    choose(k, v) { run.choices[k] = v; save(); },
    next() {
      if (run.stage < chapter.stages.length - 1) {
        run.stage += 1;
        save();
        audio.sfx('tap');
        go('game', { push: false });
      }
    },
    rerender() { dispose(); paint(); },
    finish: (final) => finishRun(final),
    secret: (id) => recordSecret(chapter, id),
    hasSecret: (id) => Boolean(state.secrets[id]),
    hasSecretThisRun: (id) => run.found.includes(id),
    clue(id) {
      if (!chapter.clues[id] || run.clues.includes(id)) return;
      run.clues.push(id);
      save();
      toast(`✎ ${t(UI.clueAdded, { text: t(chapter.clues[id]) })}`);
      const nb = $('notebookBtn');
      nb.classList.remove('shake');
      void nb.offsetWidth;
      nb.classList.add('shake');
    },
    sfx: (n) => audio.sfx(n),
    feedback: () => h('div', { class: 'feedback', 'aria-live': 'polite' }),
    say(el, msg, kind = '') {
      const text = t(msg);
      el.className = `feedback${text ? ' feedback-box' : ''}${kind ? ` is-${kind}` : ' is-story'}`;
      el.innerHTML = text ? `<p style="margin:0">${text}</p>` : '';
    },
    shake(el) {
      if (prefersReducedMotion()) return;
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    },
    later(fn, ms) { const id = setTimeout(fn, ms); disposers.push(() => clearTimeout(id)); return id; },
    every(fn, ms) { const id = setInterval(fn, ms); disposers.push(() => clearInterval(id)); return id; },
    on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); disposers.push(() => target.removeEventListener(ev, fn, opts)); },
    silent(on) {
      document.body.classList.toggle('is-silent', on);
      audio.setMood(on ? 'silence' : 'normal');
      if (on) disposers.push(() => { document.body.classList.remove('is-silent'); audio.setMood('normal'); });
    },
    confirm: (o) => confirmBox(o),
    continueBtn(label = UI.continue, onClick) {
      return h('button', { class: 'btn btn--primary', type: 'button', onclick: onClick || (() => ctx.next()) }, t(label), ' ', h('span', { 'aria-hidden': 'true' }, getLang() === 'ar' ? '←' : '→'));
    },
    /** Progressive hints. onReveal(index) runs each time a hint is shown. */
    hints(list, onReveal, opts = {}) {
      const items = list.map((x) => t(x)).filter(Boolean);
      const key = '_hints';
      const wrap = h('div', { class: 'hints' });
      const out = h('div', { 'aria-live': 'polite' });
      const btn = h('button', { class: 'btn btn--ghost', type: 'button' });
      const shown = () => Math.min(items.length, run.flags[prefix + key] || 0);
      const paintHints = () => {
        out.replaceChildren(...items.slice(0, shown()).map((txt, i) => h('div', { class: 'hint-box', html: `<b>${t(UI.hint)} ${num(i + 1)}:</b> ${txt}` })));
        const n = shown();
        const exhausted = n >= items.length;
        btn.textContent = exhausted ? (opts.repeatLast ? t(UI.hint) : t(UI.noMoreHints)) : t(n ? UI.anotherHint : UI.hint);
        btn.disabled = exhausted && !opts.repeatLast;
      };
      btn.addEventListener('click', () => {
        const n = shown();
        if (n < items.length) {
          ctx.set(key, n + 1);
          run.hints += 1;
          save();
          paintHints();
        }
        if (onReveal) onReveal(Math.min(n, items.length - 1));
        audio.sfx('tap');
      });
      paintHints();
      wrap.append(btn, out);
      return wrap;
    },
  };
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */

function renderLanding() {
  const scr = h('section', { class: 'screen landing', 'aria-labelledby': 'brandTitle' });
  if (challenge) {
    const ch = CHAPTERS.find((c) => c.endings[challenge.ending]);
    scr.append(h('div', { class: 'challenge-banner' },
      h('span', { class: 'kicker' }, t(UI.challengeTitle)),
      h('p', { style: { margin: 0 }, html: t(UI.challengeBody, { ending: t(ch.endings[challenge.ending].title), s: num(challenge.secrets), total: num(TOTAL_SECRETS) }) }),
      h('p', { class: 'small' }, t(UI.challengeNote)),
    ));
  }
  const ar = getLang() === 'ar';
  scr.append(
    h('div', { class: 'door-glow', 'aria-hidden': 'true' }),
    h('h1', { class: 'wordmark', id: 'brandTitle' },
      h('span', { class: 'wordmark__ar flicker', lang: ar ? 'ar' : 'en', dir: ar ? 'rtl' : 'ltr' }, ar ? 'لا تفتح' : "DON'T OPEN"),
      h('span', { class: 'wordmark__en', lang: ar ? 'en' : 'ar' }, ar ? "DON'T OPEN" : 'لا تفتح')),
    h('p', { class: 'landing__lead' }, t(UI.lead)),
    h('p', { class: 'landing__sub' }, t(UI.tagline)),
  );
  if (state.run) {
    const stage = getChapter(state.run.chapter).stages[state.run.stage];
    scr.append(
      h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { flash(); go('game'); } }, t(UI.continueRun)),
      h('p', { class: 'small muted', style: { marginTop: '10px' } }, `${t(UI.stageOf, { n: num(state.run.stage + 1), total: num(getChapter(state.run.chapter).stages.length) })} · ${t(stage.title)}`),
      h('div', { class: 'landing__secondary' }, h('button', { class: 'btn btn--link', type: 'button', onclick: () => confirmNewRun(1) }, t(UI.newRun))),
    );
  } else {
    scr.append(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => startRun(1) }, challenge ? t(UI.acceptChallenge) : t(UI.openDoor)));
  }
  scr.append(
    h('nav', { class: 'landing__foot', 'aria-label': t(UI.menu) },
      h('button', { class: 'btn btn--link', type: 'button', onclick: () => go('chapters') }, t(UI.chapters)),
      h('button', { class: 'btn btn--link', type: 'button', onclick: () => go('collection') }, t(UI.secrets)),
      h('button', { class: 'btn btn--link', type: 'button', onclick: () => go('privacy') }, t(UI.privacy)),
    ),
    h('p', { class: 'small', style: { color: 'var(--faint)', marginTop: '8px' } }, t(UI.footNote)),
  );
  app.append(scr);
}

function renderGame() {
  const run = state.run;
  const chapter = getChapter(run.chapter);
  const stage = chapter.stages[run.stage];
  const total = chapter.stages.length;
  const scr = h('section', { class: 'screen', 'aria-labelledby': 'stageTitle' });
  const dots = h('div', { class: 'progress__dots', 'aria-hidden': 'true' },
    chapter.stages.map((_, i) => h('span', { class: `progress__dot${i < run.stage ? ' is-done' : ''}${i === run.stage ? ' is-now' : ''}` })));
  const heading = h('h1', { class: `stage-title${stage.silent ? ' visually-hidden' : ''}`, id: 'stageTitle', tabindex: '-1', 'data-autofocus': true },
    h('span', { class: 'num' }, num(run.stage + 1)), t(stage.title));
  if (!stage.silent) {
    scr.append(h('div', { class: 'progress' }, dots, h('span', { class: 'progress__label' }, `${t(chapter.title)} · ${t(UI.stageOf, { n: num(run.stage + 1), total: num(total) })}`)));
  }
  const root = h('div', { class: 'stage', 'data-stage': String(run.stage) });
  scr.append(heading, root);
  app.append(scr);
  document.title = `${t(stage.title)} — ${t(L('لا تفتح', "DON'T OPEN"))}`;
  stage.render(makeStageContext(chapter, root));
}

function renderEnding() {
  const r = state.lastResult;
  const chapter = getChapter(r.chapter);
  const e = chapter.endings[r.ending];
  document.body.classList.add(`theme-${r.ending}`);
  document.title = `${t(e.title)} — ${t(L('لا تفتح', "DON'T OPEN"))}`;
  const found = Object.keys(state.endings).length;
  const url = share.challengeUrl(r.ending, r.secretsFound);
  const status = h('p', { class: 'share-status', role: 'status' });
  const shareText = `${t(e.share)}\n${t(UI.shareText, { ending: t(e.title), s: num(r.secretsFound), total: num(chapter.secrets.length) })}`;

  const doCopy = async () => {
    const ok = await share.copyText(url);
    if (ok) status.textContent = t(UI.copied);
    else {
      const input = h('input', { class: 'field', value: url, readonly: true, 'aria-label': t(UI.copyLink), style: { width: '100%', direction: 'ltr' } });
      modal({ title: UI.copyLink, body: [h('p', null, t(UI.copyFail)), input] });
      setTimeout(() => input.select(), 50);
    }
  };

  const doShare = async () => {
    const res = await share.webShare({ title: t(UI.shareTitle), text: shareText, url });
    if (res === 'shared') status.textContent = t(UI.shared);
    else if (res === 'unsupported' || res === 'failed') {
      const ok = await share.copyText(`${shareText}\n${url}`);
      status.textContent = ok ? t(UI.copied) : '';
      if (!ok) doCopy();
    }
  };

  const doCard = async () => {
    try {
      const blob = await share.drawCard({
        kicker: t(UI.cardMine),
        name: t(e.title),
        en: e.en,
        tagline: t(e.tagline),
        secrets: t(UI.cardSecrets, { s: num(r.secretsFound), total: num(chapter.secrets.length) }),
        dare: t(UI.cardDare),
        url: share.baseUrl(),
        accent: e.accent,
        rtl: getLang() === 'ar',
        light: Boolean(e.light),
        credit: copyright(),
      });
      share.downloadBlob(blob, `dont-open-${r.ending}.png`);
      status.textContent = t(UI.cardReady);
    } catch {
      status.textContent = '';
      modal({ title: UI.card, body: [h('p', null, t(UI.copyFail)), h('pre', { style: { whiteSpace: 'pre-wrap', color: 'var(--ink)' } }, `${shareText}\n${url}`)] });
    }
  };

  const scr = h('section', { class: `screen ending end-${r.ending}`, 'aria-labelledby': 'endingTitle' },
    h('span', { class: 'kicker' }, `${t(UI.endingLabel)} · ${t(UI.endingsCount, { n: num(found), total: num(ALL_ENDINGS.length) })}`),
    h('div', { class: 'ending__sigil', 'aria-hidden': 'true' }),
    h('h1', { class: 'ending__name', id: 'endingTitle', tabindex: '-1', 'data-autofocus': true }, t(e.title)),
    h('span', { class: 'ending__en', lang: 'en' }, e.en),
    h('p', { class: 'ending__tagline' }, t(e.tagline)),
    h('div', { class: 'ending__body' }, e.body(r).map((p) => h('p', null, t(p)))),
    h('section', { class: 'why', 'aria-labelledby': 'whyTitle' },
      h('h2', { id: 'whyTitle' }, t(UI.whyTitle)),
      h('ul', null, chapter.reasonLines(r, r.secretsFound, chapter.secrets.length).map((x) => h('li', null, x)))),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn--primary', type: 'button', onclick: doShare }, t(UI.share)),
      h('button', { class: 'btn', type: 'button', onclick: doCopy }, t(UI.copyLink)),
      h('button', { class: 'btn', type: 'button', onclick: doCard }, t(UI.card)),
    ),
    status,
    h('p', { class: 'small muted', style: { maxWidth: '520px', margin: '8px auto 0' } }, t(UI.shareLocalNote)),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => startRun(r.chapter) }, t(UI.replay)),
      h('button', { class: 'btn btn--link', type: 'button', onclick: () => go('collection') }, t(UI.secrets)),
      h('button', { class: 'btn btn--link', type: 'button', onclick: () => go('chapters') }, t(UI.chapters)),
    ),
  );
  app.append(scr);
}

function renderChapters() {
  document.title = `${t(UI.chaptersTitle)} — ${t(L('لا تفتح', "DON'T OPEN"))}`;
  const scr = h('section', { class: 'screen', 'aria-labelledby': 'chTitle' },
    h('span', { class: 'kicker' }, "DON'T OPEN"),
    h('h1', { id: 'chTitle', tabindex: '-1', 'data-autofocus': true, style: { fontSize: 'clamp(1.8rem, 1.4rem + 2vw, 2.6rem)' } }, t(UI.chaptersTitle)),
    h('p', { class: 'muted' }, t(UI.chaptersLead)));
  const list = h('div', { class: 'chapters' });
  for (const c of CHAPTERS) {
    if (!c.playable) {
      list.append(h('article', { class: 'chapter-card is-locked' },
        h('span', { class: 'chapter-card__num' }, t(UI.chapterN, { n: num(c.id) })),
        h('h2', null, t(c.title)),
        h('p', null, t(c.blurb)),
        h('span', { class: 'badge' }, t(UI.comingSoon)),
        h('p', { class: 'small', style: { marginTop: '10px' } }, t(UI.comingSoonNote))));
      continue;
    }
    const endFound = Object.keys(c.endings).filter((k) => state.endings[k]).length;
    const secFound = c.secrets.filter((s) => state.secrets[s.id]).length;
    const inProgress = state.run && state.run.chapter === c.id;
    list.append(h('article', { class: 'chapter-card' },
      h('span', { class: 'chapter-card__num' }, t(UI.chapterN, { n: num(c.id) })),
      h('h2', null, t(c.title)),
      h('p', null, t(c.blurb)),
      h('div', { class: 'stats' },
        state.clearedChapters[c.id] ? h('span', { class: 'badge badge--ok' }, t(UI.completed)) : null,
        inProgress ? h('span', { class: 'badge badge--red' }, `${t(UI.inProgress)} · ${num(state.run.stage + 1)}/${num(c.stages.length)}`) : null,
        h('span', { class: 'badge' }, t(UI.endingsCount, { n: num(endFound), total: num(Object.keys(c.endings).length) })),
        h('span', { class: 'badge' }, t(UI.secretsCount, { n: num(secFound), total: num(c.secrets.length) }))),
      h('div', { class: 'btn-row' },
        inProgress
          ? h('button', { class: 'btn btn--primary', type: 'button', onclick: () => go('game') }, t(UI.resume))
          : h('button', { class: 'btn btn--primary', type: 'button', onclick: () => startRun(c.id) }, t(UI.play)),
        inProgress ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => confirmNewRun(c.id) }, t(UI.newRun)) : null,
        h('button', { class: 'btn btn--link', type: 'button', onclick: () => go('collection') }, t(UI.secrets)))));
  }
  scr.append(list);
  app.append(scr);
}

function renderCollection() {
  document.title = `${t(UI.collectionTitle)} — ${t(L('لا تفتح', "DON'T OPEN"))}`;
  const scr = h('section', { class: 'screen screen--wide', 'aria-labelledby': 'colTitle' },
    h('span', { class: 'kicker' }, "DON'T OPEN"),
    h('h1', { id: 'colTitle', tabindex: '-1', 'data-autofocus': true, style: { fontSize: 'clamp(1.8rem, 1.4rem + 2vw, 2.6rem)' } }, t(UI.collectionTitle)),
    h('p', { class: 'muted' }, t(UI.collectionLead)));
  for (const c of CHAPTERS.filter((x) => x.playable)) {
    const secFound = c.secrets.filter((s) => state.secrets[s.id]).length;
    scr.append(h('h2', null, `${t(UI.secretsHeading)} — ${t(c.title)} (${num(secFound)}/${num(c.secrets.length)})`));
    scr.append(h('ul', { class: 'grid-list' }, c.secrets.map((s) => {
      const got = state.secrets[s.id];
      return h('li', { class: `tile ${got ? 'is-found' : 'is-hidden'}` },
        h('h3', null, got ? t(s.title) : t(UI.hiddenSecret)),
        h('p', null, got ? t(s.desc) : t(s.hint)));
    })));
    const ends = Object.entries(c.endings);
    scr.append(h('h2', null, `${t(UI.endingsHeading)} (${num(ends.filter(([k]) => state.endings[k]).length)}/${num(ends.length)})`));
    scr.append(h('ul', { class: 'grid-list' }, ends.map(([k, e]) => {
      const got = state.endings[k];
      return h('li', { class: `tile ${got ? 'is-found' : 'is-hidden'}` },
        h('h3', null, got ? `${t(e.title)} · ${e.en}` : t(UI.hiddenSecret)),
        h('p', null, got ? `${t(e.tagline)} (×${num(got.count)})` : t(UI.lockedEnding)));
    })));
  }
  scr.append(h('h2', null, t(UI.historyHeading)));
  if (!state.history.length) scr.append(h('p', { class: 'muted' }, t(UI.noHistory)));
  else {
    const fmt = (ts) => {
      try { return new Date(ts).toLocaleString(getLang() === 'ar' ? 'ar-IQ' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; }
    };
    scr.append(h('ul', { class: 'history' }, state.history.slice().reverse().slice(0, 8).map((x) => {
      const e = CHAPTERS.find((c) => c.endings[x.e]).endings[x.e];
      return h('li', null, h('span', null, t(e.title)), h('span', null, `◬ ${num(x.s)}`), h('span', null, fmt(x.t)));
    })));
  }
  scr.append(h('div', { class: 'btn-row' },
    h('button', { class: 'btn btn--primary', type: 'button', onclick: () => (state.run ? go('game') : startRun(1)) }, state.run ? t(UI.resume) : t(UI.play)),
    h('button', { class: 'btn btn--ghost', type: 'button', onclick: resetAll }, t(UI.resetAll))));
  app.append(scr);
}

async function resetAll() {
  if (!(await confirmBox({ title: UI.resetTitle, body: UI.resetBody, ok: UI.erase }))) return;
  const lang = state.lang;
  store.clearAll();
  state = store.defaultState();
  state.lang = lang;
  save();
  toast(t(UI.resetDone));
  go('landing');
}

function renderPrivacy() {
  document.title = `${t(UI.privacyTitle)} — ${t(L('لا تفتح', "DON'T OPEN"))}`;
  app.append(h('section', { class: 'screen prose', 'aria-labelledby': 'pvTitle' },
    h('span', { class: 'kicker' }, "DON'T OPEN"),
    h('h1', { id: 'pvTitle', tabindex: '-1', 'data-autofocus': true, style: { fontSize: 'clamp(1.8rem, 1.4rem + 2vw, 2.6rem)' } }, t(UI.privacyTitle)),
    h('div', { html: PRIVACY[getLang()] }),
    h('div', { class: 'btn-row', style: { marginTop: '24px' } }, h('button', { class: 'btn', type: 'button', onclick: () => history.length > 1 ? history.back() : go('landing') }, t(UI.back)))));
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

function syncChrome() {
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(UI[el.dataset.i18n]); });
  const lb = $('langBtn');
  lb.textContent = t(UI.langBtn);
  lb.setAttribute('lang', getLang() === 'ar' ? 'en' : 'ar');
  lb.setAttribute('aria-label', t(UI.switchLang));
  const on = audio.isEnabled();
  $('soundBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
  $('soundLabel').textContent = t(on ? UI.soundOff : UI.soundOn);
  $('brandBtn').setAttribute('aria-label', t(UI.home));
  $('notebookBtn').setAttribute('aria-label', t(UI.notebook));
  $('menuBtn').setAttribute('aria-label', t(UI.menu));
  document.querySelector('.skip-link').textContent = t(UI.skip);
  $('copyright').textContent = copyright();
}

function openNotebook() {
  const run = state.run;
  const chapter = run && getChapter(run.chapter);
  const body = run && run.clues.length
    ? h('ul', null, run.clues.map((id) => h('li', { html: t(chapter.clues[id]) })))
    : h('p', null, t(UI.notebookEmpty));
  modal({ title: UI.notebookTitle, body });
}

async function openMenu() {
  const choice = await modal({
    title: UI.menuTitle,
    body: '',
    actions: [
      { label: UI.close, value: null },
      { label: UI.privacy, value: 'privacy' },
      { label: UI.secrets, value: 'collection' },
      { label: UI.chapters, value: 'chapters' },
      ...(state.run ? [{ label: UI.restartChapter, value: 'restart' }] : []),
      { label: UI.home, value: 'landing', primary: true },
    ],
  });
  if (choice === 'restart') confirmNewRun(state.run.chapter);
  else if (choice) go(choice);
}

function initChrome() {
  $('brandBtn').addEventListener('click', () => go('landing'));
  $('notebookBtn').addEventListener('click', openNotebook);
  $('menuBtn').addEventListener('click', openMenu);
  $('langBtn').addEventListener('click', () => {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
    state.lang = getLang();
    save();
    syncChrome();
    dispose();
    paint();
  });
  const sb = $('soundBtn');
  if (!audio.audioSupported()) sb.hidden = true;
  sb.addEventListener('click', async () => {
    await audio.setEnabled(!audio.isEnabled());
    if (audio.isEnabled() && document.body.classList.contains('is-silent')) audio.setMood('silence');
    syncChrome();
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  try { history.scrollRestoration = 'manual'; } catch { /* ignore */ }
  setLang(share.readLangParam() || state.lang || 'ar');
  challenge = share.readChallenge(ALL_ENDINGS, TOTAL_SECRETS);
  initChrome();
  syncChrome();
  const first = challenge ? 'landing' : state.screen;
  try { history.replaceState({ screen: first }, ''); } catch { /* ignore */ }
  go(first, { push: false, instant: true });
  if (!store.storageAvailable()) toast(t(UI.storageWarn));
  if (shouldShowIntro()) {
    playIntro().then(() => {
      const target = app.querySelector('[data-autofocus]') || app;
      target.focus({ preventScroll: true });
    });
  } else {
    document.documentElement.classList.remove('intro-pending');
  }
}

boot();

// Small hook for automated tests; harmless in production.
window.__dontOpen = { getState: () => JSON.parse(JSON.stringify(state)) };
