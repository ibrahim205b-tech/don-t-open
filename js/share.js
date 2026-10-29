// Sharing: challenge links, Web Share API with clipboard fallback, and a
// client-side result card drawn on <canvas>. Only the ending id and the
// number of secrets ever leave the device, and only when the visitor shares.

import { getLang } from './i18n.js';

export function baseUrl() {
  const { origin, pathname } = window.location;
  return origin + pathname.replace(/index\.html$/, '');
}

export function challengeUrl(endingId, secrets) {
  const u = new URL(baseUrl());
  u.searchParams.set('e', endingId);
  u.searchParams.set('s', String(secrets));
  if (getLang() === 'en') u.searchParams.set('lang', 'en');
  return u.toString();
}

/** Read a challenge from the current URL, validated against known endings. */
export function readChallenge(validEndings, maxSecrets) {
  try {
    const p = new URLSearchParams(window.location.search);
    const e = p.get('e');
    const s = Number.parseInt(p.get('s'), 10);
    if (!e || !validEndings.includes(e)) return null;
    return { ending: e, secrets: Number.isInteger(s) && s >= 0 && s <= maxSecrets ? s : 0 };
  } catch {
    return null;
  }
}

export function readLangParam() {
  try {
    const l = new URLSearchParams(window.location.search).get('lang');
    return l === 'en' || l === 'ar' ? l : null;
  } catch {
    return null;
  }
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Returns 'shared' | 'cancelled' | 'unsupported' | 'failed'. */
export async function webShare(data) {
  if (!navigator.share) return 'unsupported';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (err) {
    return err && err.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draw a 1080×1350 result card.
 * @param {{kicker:string,name:string,en:string,tagline:string,secrets:string,dare:string,url:string,accent:string,rtl:boolean,light:boolean}} d
 */
export async function drawCard(d) {
  try {
    await Promise.all([
      document.fonts.load('900 120px "Noto Kufi Arabic"', d.name),
      document.fonts.load('400 40px "IBM Plex Sans Arabic"', d.tagline),
    ]);
  } catch {
    /* system fallback fonts are fine */
  }
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) throw new Error('no-canvas');
  const fg = d.light ? '#111111' : '#ECEAE6';
  const muted = d.light ? '#4a4a4a' : '#B3ACAA';

  // Background
  x.fillStyle = d.light ? '#E9E6DF' : '#070607';
  x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, 360, 20, W / 2, 360, 760);
  g.addColorStop(0, d.light ? 'rgba(0,0,0,0.06)' : 'rgba(125,13,30,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  // Grain (deterministic so every card looks the same)
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.fillStyle = d.light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 9000; i++) x.fillRect(rnd() * W, rnd() * H, 2, 2);

  // Door
  const dw = 170;
  const dh = 280;
  const dx = W / 2 - dw / 2;
  const dy = 150;
  x.fillStyle = d.light ? '#d9d5cc' : '#120a0c';
  x.fillRect(dx, dy, dw, dh);
  x.strokeStyle = d.light ? '#999' : '#3a1a20';
  x.lineWidth = 3;
  x.strokeRect(dx, dy, dw, dh);
  const lg = x.createRadialGradient(W / 2, dy + dh, 4, W / 2, dy + dh, 200);
  lg.addColorStop(0, d.accent);
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = lg;
  x.fillRect(W / 2 - 220, dy + dh - 4, 440, 40);

  x.textAlign = 'center';
  x.direction = d.rtl ? 'rtl' : 'ltr';

  x.fillStyle = muted;
  x.font = '600 34px "IBM Plex Sans Arabic", "Noto Kufi Arabic", sans-serif';
  x.fillText(d.kicker, W / 2, 540);

  x.fillStyle = fg;
  let size = 132;
  x.font = `900 ${size}px "Noto Kufi Arabic", sans-serif`;
  while (x.measureText(d.name).width > W - 140 && size > 60) {
    size -= 6;
    x.font = `900 ${size}px "Noto Kufi Arabic", sans-serif`;
  }
  x.fillText(d.name, W / 2, 700);

  x.direction = 'ltr';
  x.fillStyle = d.accent;
  x.font = '800 30px "Noto Kufi Arabic", sans-serif';
  if ('letterSpacing' in x) x.letterSpacing = '14px';
  x.fillText(d.en, W / 2, 770);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  x.direction = d.rtl ? 'rtl' : 'ltr';

  x.fillStyle = fg;
  x.font = '400 42px "IBM Plex Sans Arabic", "Noto Kufi Arabic", sans-serif';
  wrap(x, d.tagline, W - 220).slice(0, 3).forEach((ln, i) => x.fillText(ln, W / 2, 870 + i * 64));

  x.fillStyle = d.accent;
  x.font = '700 38px "Noto Kufi Arabic", sans-serif';
  x.fillText(d.secrets, W / 2, 1080);

  x.strokeStyle = d.light ? 'rgba(0,0,0,0.2)' : 'rgba(196,22,42,0.6)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(W / 2 - 160, 1140);
  x.lineTo(W / 2 + 160, 1140);
  x.stroke();

  x.fillStyle = fg;
  x.font = '800 44px "Noto Kufi Arabic", sans-serif';
  x.fillText(d.dare, W / 2, 1212);

  x.direction = 'ltr';
  x.fillStyle = muted;
  x.font = '400 28px "IBM Plex Sans Arabic", sans-serif';
  x.fillText(d.url.replace(/^https?:\/\//, '').replace(/\?.*$/, ''), W / 2, 1272);
  if (d.credit) {
    x.font = '400 24px "IBM Plex Sans Arabic", sans-serif';
    x.fillText(d.credit, W / 2, 1318);
  }

  x.fillStyle = d.light ? '#111' : '#C4162A';
  x.font = '900 30px "Noto Kufi Arabic", sans-serif';
  if ('letterSpacing' in x) x.letterSpacing = '12px';
  x.fillText("DON'T OPEN", W / 2, 90);

  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png');
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
