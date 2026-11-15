// audio.js — every sound in LOWTIDE is synthesised with WebAudio: no audio assets, no
// network, just oscillators and filtered noise shaped per event. The context is created
// lazily on the first user gesture (browsers refuse audio before one), a single master
// gain keeps the mix tame, and per-name throttling stops automatic fire from turning
// into a solid wall of noise. weapons.js and fx.js reach this through window.__sfx;
// rounds.js and hud.js import sfx directly.

let ctx = null;
let master = null;
let noiseBuf = null;
const lastPlayed = {};

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => ensure(), { once: false });
}

// A noise burst through a band/low-pass filter with an exponential decay — the body of
// every gunshot, the explosion, smoke and flash.
function noise(dur, { type = 'lowpass', freq = 1200, q = 0.8, gain = 0.5, sweepTo = 0, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}

// A single oscillator blip with pitch glide and decay — beeps, clicks, ticks, stings.
function tone(freq, dur, { type = 'sine', gain = 0.25, glideTo = 0, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

const SHOTS = {
  shot: { freq: 900, gain: 0.5, dur: 0.13 },
  'shot-pistol': { freq: 1100, gain: 0.42, dur: 0.1 },
  'shot-smg': { freq: 1000, gain: 0.4, dur: 0.09 },
  'shot-rifle': { freq: 800, gain: 0.55, dur: 0.15 },
  'shot-shotgun': { freq: 500, gain: 0.7, dur: 0.28 },
  'shot-sniper': { freq: 620, gain: 0.75, dur: 0.4 },
};

export function sfx(name, opt = {}) {
  if (!ctx && !ensure()) return;
  if (!ctx) return;
  const now = performance.now();
  const minGap = name.startsWith('shot') ? 34 : 24;
  if (lastPlayed[name] && now - lastPlayed[name] < minGap) return;
  lastPlayed[name] = now;
  const vol = opt.vol !== undefined ? opt.vol : 1;

  if (SHOTS[name]) {
    const s = SHOTS[name];
    noise(s.dur, { freq: s.freq, gain: s.gain * vol, sweepTo: s.freq * 0.35 });
    tone(150, 0.07, { type: 'triangle', gain: 0.3 * vol, glideTo: 55 });
    return;
  }
  switch (name) {
    case 'reload':
      tone(700, 0.04, { type: 'square', gain: 0.12 });
      tone(420, 0.04, { type: 'square', gain: 0.12, delay: 0.14 });
      tone(820, 0.05, { type: 'square', gain: 0.14, delay: 0.3 });
      break;
    case 'dry':
      tone(1500, 0.03, { type: 'square', gain: 0.1 });
      break;
    case 'hit':
      tone(1900, 0.035, { type: 'square', gain: 0.13 });
      break;
    case 'kill':
      tone(880, 0.07, { type: 'sine', gain: 0.2 });
      tone(1318, 0.11, { type: 'sine', gain: 0.2, delay: 0.07 });
      break;
    case 'hurt':
      tone(120, 0.12, { type: 'triangle', gain: 0.3, glideTo: 60 });
      break;
    case 'explosion':
      noise(0.9, { freq: 3000, gain: 0.9, sweepTo: 60 });
      tone(110, 0.8, { type: 'sine', gain: 0.6, glideTo: 28 });
      break;
    case 'flash':
      tone(6200, 0.35, { type: 'sine', gain: 0.1, glideTo: 3800 });
      noise(0.18, { type: 'highpass', freq: 4000, gain: 0.12 });
      break;
    case 'smoke':
      noise(0.7, { freq: 900, gain: 0.16, sweepTo: 240 });
      break;
    case 'beep':
      tone(1240, 0.055, { type: 'square', gain: 0.11 });
      break;
    case 'planted':
      tone(1240, 0.06, { type: 'square', gain: 0.13 });
      tone(1240, 0.06, { type: 'square', gain: 0.13, delay: 0.13 });
      tone(1560, 0.12, { type: 'square', gain: 0.15, delay: 0.26 });
      break;
    case 'defuse':
      tone(500, 0.05, { type: 'square', gain: 0.12 });
      tone(500, 0.05, { type: 'square', gain: 0.12, delay: 0.16 });
      tone(990, 0.14, { type: 'sine', gain: 0.18, delay: 0.3 });
      break;
    case 'win':
      [523, 659, 784].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.2, delay: i * 0.09 }));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.18, delay: i * 0.1 }));
      break;
    case 'step':
      noise(0.05, { freq: 380, gain: 0.05 * vol });
      break;
    case 'buy':
      tone(1560, 0.04, { type: 'square', gain: 0.1 });
      tone(2093, 0.07, { type: 'square', gain: 0.1, delay: 0.05 });
      break;
    default:
      break;
  }
}

if (typeof window !== 'undefined') window.__sfx = sfx;
