// Cinematic opening credits, shown once per browser session (sessionStorage).
// Total length is under four seconds; it can be skipped at any time.

import { CREDITS } from './credits.js';
import { h, prefersReducedMotion } from './dom.js';
import { t, L } from './i18n.js';

const SEEN_KEY = 'dontopen:intro-seen';
const DURATION = 3600; // ms until the fade-out starts
const FADE = 400;

function seen() {
  try { return window.sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

function markSeen() {
  try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

export const shouldShowIntro = () => !seen();

/** Shows the intro and resolves once it has finished or been skipped. */
export function playIntro() {
  return new Promise((resolve) => {
    markSeen();
    const reduced = prefersReducedMotion();
    const page = [document.querySelector('.skip-link'), document.getElementById('topbar'), document.getElementById('app'), document.getElementById('siteFooter')].filter(Boolean);
    page.forEach((el) => { el.inert = true; el.setAttribute('aria-hidden', 'true'); });

    const skip = h('button', { class: 'intro__skip', type: 'button' }, t(L('تخطَّ المقدمة', 'Skip intro')));
    const el = h('div', { class: `intro${reduced ? ' intro--still' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': CREDITS.intro.createdBy },
      h('div', { class: 'intro__stage' },
        h('p', { class: 'intro__by', lang: 'en', dir: 'ltr' }, CREDITS.intro.createdBy),
        h('p', { class: 'intro__line', lang: 'ar', dir: 'rtl' }, CREDITS.intro.line),
        h('p', { class: 'intro__title', lang: 'en', dir: 'ltr' }, CREDITS.project),
        h('p', { class: 'intro__sig', lang: 'ar', dir: 'rtl' }, CREDITS.intro.signature)),
      skip);
    document.body.append(el);
    document.documentElement.classList.remove('intro-pending');

    let done = false;
    let timer;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      page.forEach((p) => { p.inert = false; p.removeAttribute('aria-hidden'); });
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reduced ? 0 : FADE);
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(); };
    skip.addEventListener('click', finish);
    document.addEventListener('keydown', onKey);
    timer = setTimeout(finish, DURATION);
  });
}
