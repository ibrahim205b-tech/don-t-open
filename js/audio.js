// Optional atmosphere, synthesised with Web Audio (no audio files, no
// autoplay). Nothing is created until the visitor explicitly turns sound on.

let ac = null;
let master = null;
let ambientGain = null;
let enabled = false;
let heartbeat = null;

const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;

export const audioSupported = () => Boolean(AC);
export const isEnabled = () => enabled;

function brownNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

function build() {
  ac = new AC();
  master = ac.createGain();
  master.gain.value = 0;
  master.connect(ac.destination);

  ambientGain = ac.createGain();
  ambientGain.gain.value = 0.55;
  ambientGain.connect(master);

  // Low drone: two slightly detuned tones beating slowly.
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  lp.connect(ambientGain);
  [[55, 'sine', 0.22], [55.6, 'sine', 0.18], [82.4, 'triangle', 0.05]].forEach(([f, type, g]) => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const gn = ac.createGain();
    gn.gain.value = g;
    o.connect(gn).connect(lp);
    o.start();
  });

  // Breathing room tone: filtered brown noise with a slow swell.
  const noise = ac.createBufferSource();
  noise.buffer = brownNoise(ac, 4);
  noise.loop = true;
  const nf = ac.createBiquadFilter();
  nf.type = 'lowpass';
  nf.frequency.value = 500;
  const ng = ac.createGain();
  ng.gain.value = 0.06;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 0.08;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 0.04;
  lfo.connect(lfoGain).connect(ng.gain);
  noise.connect(nf).connect(ng).connect(ambientGain);
  noise.start();
  lfo.start();
}

export async function setEnabled(on) {
  if (!AC) return false;
  enabled = Boolean(on);
  try {
    if (enabled && !ac) build();
    if (!ac) return enabled;
    if (enabled && ac.state === 'suspended') await ac.resume();
    const now = ac.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(enabled ? 0.5 : 0, now + 0.8);
    if (!enabled) setTimeout(() => !enabled && ac && ac.suspend(), 900);
  } catch {
    enabled = false;
  }
  return enabled;
}

/** 'normal' | 'silence' — the silence stage drops the drone to near nothing. */
export function setMood(mood) {
  if (!ac || !ambientGain) return;
  const now = ac.currentTime;
  ambientGain.gain.cancelScheduledValues(now);
  ambientGain.gain.setValueAtTime(ambientGain.gain.value, now);
  ambientGain.gain.linearRampToValueAtTime(mood === 'silence' ? 0.08 : 0.55, now + 2);
  clearInterval(heartbeat);
  heartbeat = null;
  if (mood === 'silence') {
    heartbeat = setInterval(() => {
      sfx('beat');
      setTimeout(() => sfx('beat'), 260);
    }, 1500);
  }
}

function tone({ freq = 440, to = null, type = 'sine', dur = 0.25, gain = 0.2, delay = 0 }) {
  const t0 = ac.currentTime + delay;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function sfx(name) {
  if (!enabled || !ac || ac.state !== 'running') return;
  switch (name) {
    case 'tap': tone({ freq: 180, to: 120, dur: 0.12, gain: 0.12 }); break;
    case 'ok':
      tone({ freq: 392, dur: 0.5, gain: 0.12, type: 'triangle' });
      tone({ freq: 587, dur: 0.7, gain: 0.1, type: 'triangle', delay: 0.12 });
      break;
    case 'error': tone({ freq: 110, to: 70, dur: 0.35, gain: 0.25, type: 'sawtooth' }); break;
    case 'secret':
      [880, 1175, 1568].forEach((f, i) => tone({ freq: f, dur: 1.2, gain: 0.05, delay: i * 0.09 }));
      break;
    case 'door': tone({ freq: 70, to: 40, dur: 1.4, gain: 0.3, type: 'sawtooth' }); break;
    case 'beat': tone({ freq: 60, to: 40, dur: 0.18, gain: 0.35 }); break;
    case 'ending':
      tone({ freq: 73, dur: 3, gain: 0.25, type: 'triangle' });
      tone({ freq: 110, dur: 3, gain: 0.12, type: 'sine', delay: 0.3 });
      break;
    default: break;
  }
}
