// Local persistence with validation. Anything unexpected in storage is
// discarded rather than trusted, so corrupted data can never crash the app.

const KEY = 'dontopen:v1';
const SCREENS = ['landing', 'chapters', 'collection', 'game', 'ending', 'privacy'];
const MAX_HISTORY = 20;

let memory = null; // used when localStorage is unavailable
let available = true;

function probe() {
  try {
    const k = '__do_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
available = probe();
export const storageAvailable = () => available;

export function defaultState() {
  return {
    v: 1,
    lang: null,
    screen: 'landing',
    secrets: {},
    endings: {},
    clearedChapters: {},
    history: [],
    run: null,
    lastResult: null,
  };
}

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isId = (x) => typeof x === 'string' && /^[a-z0-9_-]{1,32}$/i.test(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function cleanMap(raw, valid) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (isId(k) && valid(v)) out[k] = v;
  }
  return out;
}

/** Validate a run against the chapter registry, or return null. */
function cleanRun(raw, chapters) {
  if (!isObj(raw)) return null;
  const chapter = chapters.find((c) => c.id === raw.chapter && c.playable);
  if (!chapter) return null;
  const stage = Number.isInteger(raw.stage) && raw.stage >= 0 && raw.stage < chapter.stages.length ? raw.stage : 0;
  const run = {
    chapter: chapter.id,
    stage,
    choices: cleanMap(raw.choices, isId),
    flags: isObj(raw.flags) ? sanitizeFlags(raw.flags) : {},
    clues: Array.isArray(raw.clues) ? raw.clues.filter((c) => isId(c) && chapter.clues[c]).slice(0, 50) : [],
    found: Array.isArray(raw.found) ? raw.found.filter((s) => isId(s) && chapter.secrets.some((x) => x.id === s)) : [],
    rushed: isNum(raw.rushed) && raw.rushed >= 0 ? Math.min(99, Math.floor(raw.rushed)) : 0,
    hints: isNum(raw.hints) && raw.hints >= 0 ? Math.min(99, Math.floor(raw.hints)) : 0,
    startedAt: isNum(raw.startedAt) ? raw.startedAt : Date.now(),
  };
  return run;
}

/** Flags are small primitives or short arrays of primitives only. */
function sanitizeFlags(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[a-z0-9_.-]{1,40}$/i.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (typeof v === 'boolean' || (isNum(v) && Math.abs(v) < 1e6) || (typeof v === 'string' && v.length < 40)) out[k] = v;
    else if (Array.isArray(v) && v.length <= 16 && v.every((x) => typeof x === 'boolean' || isNum(x))) out[k] = v.slice();
  }
  return out;
}

export function sanitize(raw, chapters) {
  const base = defaultState();
  if (!isObj(raw) || raw.v !== 1) return base;
  const allSecrets = new Set(chapters.flatMap((c) => c.secrets.map((s) => s.id)));
  const allEndings = new Set(chapters.flatMap((c) => Object.keys(c.endings || {})));
  base.lang = raw.lang === 'ar' || raw.lang === 'en' ? raw.lang : null;
  base.screen = SCREENS.includes(raw.screen) ? raw.screen : 'landing';
  base.secrets = cleanMap(raw.secrets, isNum);
  for (const k of Object.keys(base.secrets)) if (!allSecrets.has(k)) delete base.secrets[k];
  base.endings = cleanMap(raw.endings, (v) => isObj(v) && isNum(v.count) && isNum(v.first));
  for (const k of Object.keys(base.endings)) if (!allEndings.has(k)) delete base.endings[k];
  base.clearedChapters = cleanMap(raw.clearedChapters, (v) => v === true);
  base.history = Array.isArray(raw.history)
    ? raw.history.filter((h) => isObj(h) && allEndings.has(h.e) && isNum(h.s) && isNum(h.t)).slice(-MAX_HISTORY).map((h) => ({ e: h.e, s: h.s, t: h.t }))
    : [];
  base.run = cleanRun(raw.run, chapters);
  if (isObj(raw.lastResult) && allEndings.has(raw.lastResult.ending)) {
    base.lastResult = {
      ending: raw.lastResult.ending,
      chapter: Number.isInteger(raw.lastResult.chapter) ? raw.lastResult.chapter : 1,
      variant: isId(raw.lastResult.variant) ? raw.lastResult.variant : 'a',
      reasons: Array.isArray(raw.lastResult.reasons) ? raw.lastResult.reasons.filter(isId).slice(0, 12) : [],
      ctx: isObj(raw.lastResult.ctx) ? sanitizeFlags(raw.lastResult.ctx) : {},
      secretsFound: isNum(raw.lastResult.secretsFound) ? raw.lastResult.secretsFound : 0,
    };
  }
  // Screens that need data fall back gracefully.
  if (base.screen === 'game' && !base.run) base.screen = 'landing';
  if (base.screen === 'ending' && !base.lastResult) base.screen = 'landing';
  return base;
}

export function load(chapters) {
  let raw = memory;
  if (available) {
    try {
      const text = window.localStorage.getItem(KEY);
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = null;
    }
  }
  return sanitize(raw, chapters);
}

export function save(state) {
  const snapshot = JSON.parse(JSON.stringify(state));
  memory = snapshot;
  if (!available) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    available = false; // quota or privacy mode; keep working in memory
  }
}

export function clearAll() {
  memory = null;
  if (!available) return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEY = KEY;
export const HISTORY_LIMIT = MAX_HISTORY;
