// Sound effects.
// Plays the real Stardew recordings in public/sounds (see FILES) and, for anything without a
// recording, synthesizes a little Stardew-ish sound with WebAudio (oscillators, noise, filters,
// envelopes). A drop-in public/sounds/<name>.(ogg|mp3|wav|m4a) is picked up automatically too.
// Also runs a quiet ambience bed (the real Stardew day/night/rain loops) while unmuted.

import type { Season } from "../shared/calendar";

export type Sfx =
  | "baa" // a sheep baa
  | "snip" // shears
  | "pop" // item pickup / wool pops out
  | "purchase" // cash register (buying a sheep / decoration)
  | "menuOpen"
  | "menuClose"
  | "blip" // dialogue typing
  | "select" // button click
  | "cancel" // error / nope
  | "loom" // loom clacking
  | "coin"
  | "junimo" // junimo chirp
  | "yip" // fox
  | "squeak" // hedgehog
  | "rustle" // grass/bush
  | "sparkle" // golden sheep / magic
  | "stardrop" // big milestone fanfare
  | "thud"
  | "door" // barn door
  | "crow"
  | "pet" // petting rustle + happy
  | "woosh"
  | "splash"
  | "chime" // gentle notification (new mail)
  | "meow" // the farm cat
  // Extras that have real Stardew recordings (free for any module to use):
  | "chest" // opening a chest
  | "croak" // a frog
  | "harvest" // picking something up off the ground
  | "owl"
  | "reward" // little "you got something" jingle
  | "secret" // secret found!
  | "thunder"
  | "lick"; // Snickers licking the air (tiny wet blip)

export interface SfxOpts {
  /** Multiplier on the sound's own level (default 1). */
  volume?: number;
  /** Pitch multiplier (default 1). 2 = an octave up. */
  pitch?: number;
}

export interface Ambience {
  /** Crickets (and the odd owl). */
  night: boolean;
  /** Soft rain bed. */
  rain: boolean;
  /** Birds chirping now and then (extra chirps on top of the day loop). */
  morning?: boolean;
  /** Heavier rain + the occasional distant rumble. */
  storm?: boolean;
  /** No crickets in the snow. */
  winter?: boolean;
  /** Which seasonal day/night loop to play (Stardew has one per season). */
  season?: Season;
  /** Now and then a gust of wind. */
  windy?: boolean;
}

const MASTER_VOLUME = 0.45;
const AMBIENCE_VOLUME = 0.55;
const MAX_VOICES = 8;
const MUTE_KEY = "farm.muted";
const BASE = import.meta.env.BASE_URL;

/** Real Stardew recordings in public/sounds. Names not listed here are synthesized. */
const FILES: Partial<Record<Sfx, string>> = {
  blip: "blip.wav",
  cancel: "cancel.wav",
  chest: "chest.wav",
  chime: "chime.wav",
  coin: "coin.wav",
  croak: "croak.wav",
  crow: "crow.wav",
  door: "door.wav",
  harvest: "harvest.wav",
  junimo: "junimo.wav",
  loom: "loom.wav",
  menuClose: "menuClose.wav",
  menuOpen: "menuOpen.wav",
  owl: "owl.m4a",
  pop: "pop.wav",
  purchase: "purchase.wav",
  reward: "reward.m4a",
  rustle: "rustle.wav",
  secret: "secret.m4a",
  select: "select.wav",
  snip: "snip.wav",
  sparkle: "sparkle.wav",
  splash: "splash.wav",
  squeak: "squeak.wav",
  stardrop: "stardrop.m4a",
  thud: "thud.wav",
  thunder: "thunder.m4a",
  woosh: "woosh.wav",
};
/**
 * Loudness trims for the recordings (they were cut from the game at wildly different levels:
 * the snip peaks at -22 dB, the crow at 0 dB). Roughly evens out their peaks.
 */
const FILE_GAIN: Partial<Record<Sfx, number>> = {
  blip: 1.2,
  cancel: 2.4,
  chest: 0.9,
  chime: 1.8,
  croak: 0.6,
  crow: 0.6,
  door: 5,
  junimo: 0.65,
  loom: 0.8,
  menuClose: 0.9,
  menuOpen: 0.9,
  pop: 3,
  purchase: 4,
  reward: 1.3,
  rustle: 2.2,
  secret: 1.4,
  select: 1.3,
  snip: 4,
  sparkle: 4,
  splash: 1.6,
  squeak: 5,
  thud: 0.8,
  woosh: 3,
};
/** Formats tried (in order) for a drop-in file whose name isn't in FILES. */
const PROBE_EXTS = ["ogg", "mp3", "wav", "m4a"];
/** Little UI sounds worth having decoded before the first tap. */
const PRELOAD: Sfx[] = ["select", "cancel", "reward", "menuOpen", "menuClose", "blip", "pop", "snip", "purchase", "rustle", "thud", "woosh", "sparkle", "chime", "door"];

// ---------- state ----------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let unlocked = false;
let muted = readMuted();
const muteListeners = new Set<(muted: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    // iOS 17+: mix with whatever else is playing (her music keeps going) and respect the
    // silent switch, like a polite little game should.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "ambient";
  } catch {
    /* older browsers */
  }
  try {
    ctx = new AC({ latencyHint: "interactive" });
  } catch {
    return null;
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_VOLUME;
  master.connect(comp);

  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = AMBIENCE_VOLUME;
  ambBus.connect(master);

  // Two seconds of white noise, reused by every noisy sound.
  const len = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return ctx;
}

function running(): boolean {
  return !!ctx && ctx.state === "running";
}

function resume(): void {
  if (!ctx || muted || document.visibilityState === "hidden") return;
  if (ctx.state !== "running") {
    void ctx.resume().then(() => applyAmbience(), () => {});
  }
}

/** Browsers need a user gesture before audio can play; main.ts calls this on first tap/key. */
export function unlockAudio(): void {
  const c = ensureContext();
  if (!c) return;
  if (!unlocked) {
    unlocked = true;
    // Decode the little UI sounds now, so the very first click already sounds like Stardew.
    setTimeout(preloadFiles, 60);
  }
  if (muted) {
    if (c.state === "running") void c.suspend().catch(() => {});
    return;
  }
  wake();
}

/** Resume from inside a user gesture. iOS also wants a sound started in that same gesture. */
function wake(): void {
  if (!ctx || ctx.state === "running") return;
  try {
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start(0);
  } catch {
    /* ignore */
  }
  resume();
}

// Touch "activation" only counts on pointerup/touchend/click (not pointerdown), and iOS can
// re-suspend the context after a call or a trip to the home screen, so keep listening.
for (const ev of ["pointerup", "touchend", "click", "keydown"]) {
  addEventListener(
    ev,
    () => {
      if (!unlocked) unlockAudio();
      else if (!muted) wake();
    },
    { capture: true, passive: true },
  );
}

document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.visibilityState === "hidden") {
    stopAmbience();
    if (ctx.state === "running") void ctx.suspend().catch(() => {});
  } else if (unlocked && !muted) {
    resume();
  }
});

// ---------- mute ----------

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  if (muted === m) return;
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    /* private mode */
  }
  if (ctx && master) {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(m ? 0 : MASTER_VOLUME, t + 0.05);
    if (m) {
      stopAmbience();
      setTimeout(() => muted && ctx?.state === "running" && void ctx.suspend().catch(() => {}), 80);
    } else {
      wake();
    }
  } else if (!m) {
    unlockAudio();
  }
  muteListeners.forEach((fn) => {
    try {
      fn(m);
    } catch (err) {
      console.warn("[audio] mute listener", err);
    }
  });
}

export function onMuteChange(fn: (muted: boolean) => void): () => void {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}

// ---------- voices ----------

interface Voice {
  out: GainNode;
  timer: number;
}
const voices: Voice[] = [];

function startVoice(volume: number, duration: number): Voice | null {
  if (!ctx || !sfxBus) return null;
  while (voices.length >= MAX_VOICES) killVoice(voices.shift()!);
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(sfxBus);
  const v: Voice = { out, timer: 0 };
  voices.push(v);
  endVoiceAfter(v, duration);
  return v;
}

/** (Re)schedule a voice's cleanup once its sound has finished. */
function endVoiceAfter(v: Voice, duration: number): void {
  clearTimeout(v.timer);
  v.timer = window.setTimeout(() => {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    v.out.disconnect();
  }, (duration + 0.15) * 1000);
}

function killVoice(v: Voice): void {
  clearTimeout(v.timer);
  if (!ctx) return;
  const t = ctx.currentTime;
  v.out.gain.cancelScheduledValues(t);
  v.out.gain.setValueAtTime(v.out.gain.value, t);
  v.out.gain.linearRampToValueAtTime(0, t + 0.03);
  setTimeout(() => v.out.disconnect(), 60);
}

// ---------- synth toolkit ----------

type Dest = AudioNode;

interface ToneOpts {
  type?: OscillatorType;
  f: number;
  /** End frequency (exponential glide over the whole duration). */
  f2?: number;
  /** Frequency points [time offset, freq] for custom contours (linear). */
  path?: [number, number][];
  dur: number;
  vol?: number;
  attack?: number;
  vibRate?: number;
  /** Vibrato depth as a fraction of f. */
  vibDepth?: number;
  detune?: number;
  /** Optional filter before the envelope. */
  filter?: { type: BiquadFilterType; f: number; q?: number };
}

function tone(d: Dest, t: number, o: ToneOpts): void {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t);
  if (o.path) for (const [dt, f] of o.path) osc.frequency.linearRampToValueAtTime(f, t + dt);
  else if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  let lfo: OscillatorNode | null = null;
  if (o.vibRate && o.vibDepth) {
    lfo = c.createOscillator();
    lfo.frequency.value = o.vibRate;
    const depth = c.createGain();
    depth.gain.value = o.f * o.vibDepth;
    lfo.connect(depth).connect(osc.frequency);
  }
  const env = c.createGain();
  const vol = o.vol ?? 0.3;
  const a = Math.min(o.attack ?? 0.006, o.dur * 0.5);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vol, t + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = osc;
  if (o.filter) {
    const f = c.createBiquadFilter();
    f.type = o.filter.type;
    f.frequency.value = o.filter.f;
    f.Q.value = o.filter.q ?? 0.7;
    node.connect(f);
    node = f;
  }
  node.connect(env).connect(d);
  osc.start(t);
  osc.stop(t + o.dur + 0.03);
  if (lfo) {
    lfo.start(t);
    lfo.stop(t + o.dur + 0.03);
  }
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  attack?: number;
  type?: BiquadFilterType;
  f?: number;
  /** Filter frequency points [time offset, freq]. */
  path?: [number, number][];
  q?: number;
  /** Hold the level and only fade at the very end (for swells). */
  sustain?: boolean;
}

function noise(d: Dest, t: number, o: NoiseOpts): void {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = c.createBiquadFilter();
  filt.type = o.type ?? "bandpass";
  filt.frequency.setValueAtTime(o.f ?? 2000, t);
  if (o.path) for (const [dt, f] of o.path) filt.frequency.linearRampToValueAtTime(f, t + dt);
  filt.Q.value = o.q ?? 1;
  const env = c.createGain();
  const vol = o.vol ?? 0.3;
  const a = Math.min(o.attack ?? 0.003, o.dur * 0.5);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vol, t + a);
  if (o.sustain) env.gain.setValueAtTime(vol, t + o.dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(filt).connect(env).connect(d);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.03);
}

/** A soft bell: fundamental plus two inharmonic partials that fade faster. */
function bell(d: Dest, t: number, f: number, dur: number, vol: number): void {
  tone(d, t, { f, dur, vol, attack: 0.003 });
  tone(d, t, { f: f * 2.76, dur: dur * 0.45, vol: vol * 0.28, attack: 0.002 });
  tone(d, t, { f: f * 5.4, dur: dur * 0.2, vol: vol * 0.1, attack: 0.002 });
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- the sounds ----------

type Synth = (d: Dest, t: number, p: number) => number; // returns duration

const SYNTHS: Record<Sfx, Synth> = {
  baa(d, t, p) {
    const c = ctx!;
    const f0 = rand(300, 420) * p;
    const dur = rand(0.5, 0.68);
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f0 * 1.12, t);
    osc.frequency.linearRampToValueAtTime(f0, t + 0.07);
    osc.frequency.linearRampToValueAtTime(f0 * 0.97, t + dur * 0.65);
    osc.frequency.linearRampToValueAtTime(f0 * 0.8, t + dur);
    // The bleat's wobble: pitch vibrato + a faster amplitude tremolo.
    const vib = c.createOscillator();
    vib.frequency.value = rand(6.5, 8.5);
    const vibDepth = c.createGain();
    vibDepth.gain.value = f0 * 0.045;
    vib.connect(vibDepth).connect(osc.frequency);
    const trem = c.createOscillator();
    trem.frequency.value = rand(10, 13);
    const tremDepth = c.createGain();
    tremDepth.gain.value = 0.28;
    const tremGain = c.createGain();
    tremGain.gain.value = 0.72;
    trem.connect(tremDepth).connect(tremGain.gain);
    // "b" onset: a lowpass that opens up quickly.
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.exponentialRampToValueAtTime(3800, t + 0.08);
    lp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    // Formants for "eh".
    const mix = c.createGain();
    for (const [f, q, g] of [
      [650, 5, 1],
      [1750, 8, 0.7],
      [2600, 9, 0.35],
    ] as const) {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f * (0.95 + p * 0.05);
      bp.Q.value = q;
      const gg = c.createGain();
      gg.gain.value = g;
      lp.connect(bp).connect(gg).connect(mix);
    }
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.9, t + 0.035);
    env.gain.setValueAtTime(0.8, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    mix.connect(tremGain).connect(env).connect(d);
    for (const o of [osc, vib, trem]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    return dur;
  },

  snip(d, t, p) {
    for (let i = 0; i < 2; i++) {
      const ti = t + i * 0.085;
      noise(d, ti, { dur: 0.035, vol: 0.55, type: "highpass", f: 4200, q: 0.8, attack: 0.001 });
      tone(d, ti, { f: 5200 * p * (1 + i * 0.09), f2: 4100 * p, dur: 0.06, vol: 0.09, attack: 0.001 });
      tone(d, ti, { type: "square", f: 2600 * p, dur: 0.012, vol: 0.06, attack: 0.001 });
    }
    return 0.17;
  },

  pop(d, t, p) {
    tone(d, t, { f: 320 * p, f2: 980 * p, dur: 0.11, vol: 0.45, attack: 0.004 });
    tone(d, t, { type: "triangle", f: 640 * p, f2: 1900 * p, dur: 0.06, vol: 0.12 });
    return 0.12;
  },

  purchase(d, t, p) {
    noise(d, t, { dur: 0.06, vol: 0.22, type: "bandpass", f: 6000, q: 1.2 });
    tone(d, t, { f: 180, f2: 110, dur: 0.06, vol: 0.2 });
    bell(d, t + 0.04, 1318.5 * p, 0.55, 0.22);
    bell(d, t + 0.12, 1760 * p, 0.8, 0.26);
    return 0.95;
  },

  menuOpen(d, t, p) {
    [880, 1175, 1568].forEach((f, i) =>
      tone(d, t + i * 0.035, { type: "square", f: f * p, dur: 0.07, vol: 0.05, filter: { type: "lowpass", f: 3200 } }),
    );
    return 0.16;
  },

  menuClose(d, t, p) {
    [1320, 990, 740].forEach((f, i) =>
      tone(d, t + i * 0.035, { type: "square", f: f * p, dur: 0.07, vol: 0.045, filter: { type: "lowpass", f: 3000 } }),
    );
    return 0.16;
  },

  blip(d, t, p) {
    tone(d, t, { type: "triangle", f: rand(560, 820) * p, dur: 0.035, vol: 0.09, attack: 0.002 });
    return 0.04;
  },

  select(d, t, p) {
    tone(d, t, { type: "square", f: 1046 * p, f2: 1400 * p, dur: 0.05, vol: 0.05, filter: { type: "lowpass", f: 3500 } });
    tone(d, t, { f: 2093 * p, dur: 0.03, vol: 0.05 });
    return 0.06;
  },

  cancel(d, t, p) {
    for (let i = 0; i < 2; i++) {
      const ti = t + i * 0.11;
      const f = (i ? 104 : 124) * p;
      tone(d, ti, { type: "sawtooth", f, dur: 0.09, vol: 0.16, attack: 0.004, filter: { type: "lowpass", f: 800 } });
      tone(d, ti, { type: "square", f: f * 1.02, dur: 0.09, vol: 0.06, filter: { type: "lowpass", f: 600 } });
    }
    return 0.22;
  },

  loom(d, t, p) {
    const offs = [0, 0.13, 0.26, 0.5, 0.63];
    offs.forEach((o, i) => {
      noise(d, t + o, { dur: 0.05, vol: 0.45, type: "bandpass", f: (i % 2 ? 1400 : 950) * p, q: 6 });
      tone(d, t + o, { type: "triangle", f: (i % 2 ? 340 : 260) * p, f2: 160 * p, dur: 0.06, vol: 0.22 });
    });
    return 0.72;
  },

  coin(d, t, p) {
    tone(d, t, { type: "square", f: 988 * p, dur: 0.07, vol: 0.07, filter: { type: "lowpass", f: 5000 } });
    tone(d, t + 0.07, { type: "square", f: 1319 * p, dur: 0.35, vol: 0.07, filter: { type: "lowpass", f: 5000 } });
    return 0.42;
  },

  junimo(d, t, p) {
    [0, 0.085, 0.17].forEach((o, i) => {
      const f = (1500 + i * 260) * p;
      tone(d, t + o, { f, f2: f * 1.45, dur: 0.075, vol: 0.16, vibRate: 30, vibDepth: 0.04 });
    });
    tone(d, t + 0.29, { type: "triangle", f: 1300 * p, path: [[0.05, 1750 * p], [0.14, 1100 * p]], dur: 0.15, vol: 0.13 });
    return 0.45;
  },

  yip(d, t, p) {
    [0, 0.17].forEach((o, i) => {
      const s = i ? 1.08 : 1;
      const path: [number, number][] = [
        [0.035, 1350 * p * s],
        [0.12, 650 * p * s],
      ];
      tone(d, t + o, { type: "sawtooth", f: 650 * p * s, path, dur: 0.13, vol: 0.2, filter: { type: "bandpass", f: 1500, q: 2 } });
      tone(d, t + o, { f: 650 * p * s, path, dur: 0.13, vol: 0.12 });
    });
    return 0.32;
  },

  squeak(d, t, p) {
    tone(d, t, { f: 1900 * p, path: [[0.05, 2750 * p], [0.11, 2300 * p]], dur: 0.12, vol: 0.15, vibRate: 40, vibDepth: 0.02 });
    tone(d, t + 0.15, { f: 2100 * p, path: [[0.04, 2600 * p], [0.08, 2400 * p]], dur: 0.09, vol: 0.1 });
    return 0.26;
  },

  rustle(d, t, p) {
    for (let i = 0; i < 6; i++) {
      noise(d, t + rand(0, 0.26), { dur: rand(0.06, 0.13), vol: rand(0.1, 0.2), type: "bandpass", f: rand(2800, 5200) * p, q: 1.4 });
    }
    return 0.4;
  },

  sparkle(d, t, p) {
    [1319, 1661, 1976, 2637].forEach((f, i) => bell(d, t + i * 0.06, f * p, 0.5, 0.1));
    noise(d, t, { dur: 0.35, vol: 0.03, type: "highpass", f: 8000 });
    return 0.75;
  },

  stardrop(d, t, p) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      tone(d, t + i * 0.09, { type: "square", f: f * p, dur: 0.25, vol: 0.05, filter: { type: "lowpass", f: 4000 } });
      tone(d, t + i * 0.09, { type: "triangle", f: f * p, dur: 0.3, vol: 0.08 });
    });
    const tc = t + 0.5;
    [1047, 1319, 1568].forEach((f) => tone(d, tc, { type: "triangle", f: f * p, dur: 1.2, vol: 0.09, attack: 0.02, vibRate: 5.5, vibDepth: 0.006 }));
    [2093, 2637, 3136, 4186].forEach((f, i) => bell(d, tc + 0.1 + i * 0.07, f * p, 0.6, 0.05));
    return 1.75;
  },

  thud(d, t, p) {
    tone(d, t, { f: 140 * p, f2: 45 * p, dur: 0.18, vol: 0.55, attack: 0.002 });
    noise(d, t, { dur: 0.08, vol: 0.35, type: "lowpass", f: 420 });
    return 0.2;
  },

  door(d, t, p) {
    const c = ctx!;
    const dur = 0.55;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    const curve = new Float32Array(14);
    for (let i = 0; i < curve.length; i++) curve[i] = (70 + Math.random() * 70 + Math.sin(i * 0.9) * 20) * p;
    osc.frequency.setValueCurveAtTime(curve, t, dur);
    const bp1 = c.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.frequency.value = 900;
    bp1.Q.value = 4;
    const bp2 = c.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 2100;
    bp2.Q.value = 6;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.45, t + 0.12);
    env.gain.setValueAtTime(0.4, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(bp1).connect(env);
    osc.connect(bp2).connect(env);
    env.connect(d);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    tone(d, t + dur + 0.02, { f: 95 * p, f2: 50 * p, dur: 0.14, vol: 0.35 });
    noise(d, t + dur + 0.02, { dur: 0.06, vol: 0.2, type: "lowpass", f: 500 });
    return dur + 0.18;
  },

  crow(d, t, p) {
    const c = ctx!;
    const shaper = c.createWaveShaper();
    const k = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      k[i] = Math.tanh(x * 4);
    }
    shaper.curve = k;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1300;
    bp.Q.value = 1.4;
    const level = c.createGain();
    level.gain.value = 0.35;
    shaper.connect(bp).connect(level).connect(d);
    [0, 0.3].forEach((o) => {
      tone(shaper, t + o, { type: "sawtooth", f: 520 * p, f2: 360 * p, dur: 0.22, vol: 0.3, attack: 0.01, vibRate: 38, vibDepth: 0.05 });
    });
    return 0.55;
  },

  pet(d, t, p) {
    noise(d, t, { dur: 0.13, vol: 0.12, type: "bandpass", f: 2600, q: 1 });
    tone(d, t + 0.03, { f: 523 * p, f2: 880 * p, dur: 0.22, vol: 0.14, attack: 0.02 });
    tone(d, t + 0.1, { type: "triangle", f: 1046 * p, f2: 1760 * p, dur: 0.15, vol: 0.05 });
    return 0.28;
  },

  woosh(d, t, p) {
    noise(d, t, {
      dur: 0.42,
      vol: 0.32,
      attack: 0.12,
      type: "bandpass",
      f: 300 * p,
      path: [
        [0.18, 2400 * p],
        [0.42, 500 * p],
      ],
      q: 1.3,
    });
    return 0.45;
  },

  splash(d, t, p) {
    noise(d, t, { dur: 0.45, vol: 0.32, type: "lowpass", f: 3500, path: [[0.45, 700]], attack: 0.004 });
    for (let i = 0; i < 5; i++) {
      const f = rand(700, 1500) * p;
      tone(d, t + rand(0.04, 0.34), { f, f2: f * 1.7, dur: 0.05, vol: 0.07 });
    }
    return 0.5;
  },

  chime(d, t, p) {
    bell(d, t, 880 * p, 0.9, 0.17);
    bell(d, t + 0.13, 1318.5 * p, 1.1, 0.15);
    return 1.25;
  },

  meow(d, t, p) {
    const c = ctx!;
    const dur = 0.5;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(520 * p, t);
    osc.frequency.linearRampToValueAtTime(820 * p, t + 0.12);
    osc.frequency.linearRampToValueAtTime(760 * p, t + 0.25);
    osc.frequency.linearRampToValueAtTime(470 * p, t + dur);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.linearRampToValueAtTime(1600, t + 0.15);
    bp.frequency.linearRampToValueAtTime(850, t + dur);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.7, t + 0.06);
    env.gain.setValueAtTime(0.6, t + 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(bp).connect(lp).connect(env).connect(d);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return dur;
  },

  // ---- extras (normally played from their real recordings) ----

  chest(d, t, p) {
    tone(d, t, { type: "triangle", f: 210 * p, f2: 150 * p, dur: 0.12, vol: 0.25 });
    noise(d, t, { dur: 0.08, vol: 0.18, type: "bandpass", f: 1200 * p, q: 3 });
    bell(d, t + 0.1, 1568 * p, 0.4, 0.08);
    return 0.5;
  },

  croak(d, t, p) {
    for (let i = 0; i < 3; i++) {
      tone(d, t + i * 0.07, { type: "square", f: 150 * p, f2: 110 * p, dur: 0.06, vol: 0.12, filter: { type: "lowpass", f: 900 } });
    }
    return 0.25;
  },

  harvest(d, t, p) {
    noise(d, t, { dur: 0.08, vol: 0.18, type: "bandpass", f: 2400, q: 1.2 });
    tone(d, t + 0.02, { f: 420 * p, f2: 1100 * p, dur: 0.1, vol: 0.35 });
    return 0.14;
  },

  owl(d, t, p) {
    tone(d, t, { f: 390 * p, f2: 360 * p, dur: 0.32, vol: 0.3, attack: 0.05 });
    tone(d, t + 0.5, { f: 380 * p, f2: 350 * p, dur: 0.45, vol: 0.3, attack: 0.06 });
    return 1;
  },

  reward(d, t, p) {
    [784, 988, 1175, 1568].forEach((f, i) => bell(d, t + i * 0.09, f * p, 0.6, 0.13));
    return 0.95;
  },

  secret(d, t, p) {
    [523, 698, 880, 1047, 1397].forEach((f, i) => bell(d, t + i * 0.11, f * p, 0.7, 0.12));
    return 1.3;
  },

  thunder(d, t, p) {
    noise(d, t, { dur: 2.2, vol: 0.5, attack: 0.08, type: "lowpass", f: 320 * p, path: [[2.2, 70]] });
    return 2.25;
  },
  lick(d, t, p) {
    // A tiny wet "mlem": a quick bandpassed noise smack.
    noise(d, t, { dur: 0.06, vol: 0.18, attack: 0.004, type: "bandpass", f: rand(1800, 2600) * p, path: [[0.06, 900 * p]] });
    return 0.07;
  },
};

// Some sounds would be annoying if they stacked up (typing blips, menu clicks).
const MIN_GAP: Partial<Record<Sfx, number>> = { blip: 0.04, select: 0.03, menuOpen: 0.06, menuClose: 0.06, baa: 0.12, pop: 0.03 };
const lastPlayed = new Map<Sfx, number>();

// ---------- real sound files ----------

/** Settled lookups: a decoded recording, or null = no recording (synthesize). */
const fileBuf = new Map<Sfx, AudioBuffer | null>();
const fileLoad = new Map<Sfx, Promise<AudioBuffer | null>>();

async function fetchBuffer(url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    // Dev servers answer unknown paths with index.html; that's not a sound.
    if ((res.headers.get("content-type") ?? "").includes("text/html")) return null;
    const data = await res.arrayBuffer();
    if (!ctx) return null;
    return await new Promise<AudioBuffer | null>((resolve) => {
      ctx!.decodeAudioData(data, resolve, () => resolve(null))?.catch?.(() => resolve(null));
    });
  } catch {
    return null;
  }
}

async function probe(name: Sfx): Promise<AudioBuffer | null> {
  for (const ext of PROBE_EXTS) {
    const b = await fetchBuffer(`${BASE}sounds/${name}.${ext}`);
    if (b) return b;
  }
  return null;
}

/** Load (once) the recording for a sound: the known file, or a drop-in found by probing. */
function requestFile(name: Sfx): Promise<AudioBuffer | null> {
  const done = fileBuf.get(name);
  if (done !== undefined) return Promise.resolve(done);
  let p = fileLoad.get(name);
  if (p) return p;
  const known = FILES[name];
  // Only fetch recordings we know exist (listed in FILES); everything else is synthesized.
  p = (known ? fetchBuffer(`${BASE}sounds/${known}`) : Promise.resolve(null)).then((b) => {
    fileBuf.set(name, b);
    fileLoad.delete(name);
    return b;
  });
  fileLoad.set(name, p);
  return p;
}

function preloadFiles(): void {
  if (!ctx) return;
  // A few at a time, so we don't hog a phone's connection while the farm loads.
  const queue = PRELOAD.filter((n) => FILES[n]);
  const next = (): void => {
    const name = queue.shift();
    if (name) void requestFile(name).then(next);
  };
  for (let i = 0; i < 3; i++) next();
}

function playBuffer(buf: AudioBuffer, volume: number, pitch: number): void {
  const v = startVoice(volume * 0.8, buf.duration / pitch);
  if (!v || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = pitch;
  src.connect(v.out);
  src.start();
}

function playSynth(name: Sfx, volume: number, pitch: number): void {
  if (!ctx) return;
  const v = startVoice(volume, 2);
  if (!v) return;
  try {
    endVoiceAfter(v, SYNTHS[name](v.out, ctx.currentTime + 0.005, pitch));
  } catch (err) {
    console.warn("[audio]", name, err);
  }
}

export function sfx(name: Sfx, opts: SfxOpts = {}): void {
  try {
    play(name, opts);
  } catch (err) {
    // Never let a sound take down whatever called it (often the game loop).
    console.warn("[audio]", name, err);
  }
}

function play(name: Sfx, opts: SfxOpts): void {
  if (muted || !unlocked || !running()) return;
  const now = ctx!.currentTime;
  const gap = MIN_GAP[name] ?? 0.02;
  const last = lastPlayed.get(name);
  if (last !== undefined && now - last < gap) return;
  lastPlayed.set(name, now);
  const volume = Math.max(0, opts.volume ?? 1);
  const pitch = Math.max(0.25, Math.min(4, opts.pitch ?? 1));

  const trim = FILES[name] ? (FILE_GAIN[name] ?? 1) : 1;
  const buf = fileBuf.get(name);
  if (buf) return playBuffer(buf, volume * trim, pitch);
  if (buf === null) return playSynth(name, volume, pitch);
  if (!FILES[name]) {
    // No known recording: synthesize right away, and look for a drop-in file for next time.
    playSynth(name, volume, pitch);
    void requestFile(name);
    return;
  }
  // The recording is still on its way: play it if it shows up quickly, otherwise skip this one
  // (a click that sounds half a second late feels worse than no click).
  const asked = performance.now();
  void requestFile(name).then((b) => {
    if (muted || !running() || performance.now() - asked > 350) return;
    try {
      if (b) playBuffer(b, volume * trim, pitch);
      else playSynth(name, volume, pitch);
    } catch (err) {
      console.warn("[audio]", name, err);
    }
  });
}

// ---------- ambience ----------

type LayerName = "day" | "night" | "rain";

interface Layer {
  /** File (under sounds/ambience/) this layer should be playing, or null for silence. */
  path: string | null;
  level: number;
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
}

const layers: Record<LayerName, Layer> = {
  day: { path: null, level: 0, src: null, gain: null },
  night: { path: null, level: 0, src: null, gain: null },
  rain: { path: null, level: 0, src: null, gain: null },
};
const ambBuf = new Map<string, AudioBuffer | null>();
const ambLoad = new Map<string, Promise<AudioBuffer | null>>();

const DAY_LOOP: Record<Season, string> = { spring: "spring_day", summer: "summer_day", fall: "fall_day", winter: "winter_day" };
const NIGHT_LOOP: Partial<Record<Season, string>> = { spring: "spring_night", summer: "spring_night", fall: "crickets" };
/** Per-loop gain: the recordings range from -37 to -48 dB, so even them out (quietly). */
const LOOP_GAIN: Record<string, number> = {
  spring_day: 2.2,
  summer_day: 0.63,
  fall_day: 0.95,
  winter_day: 1.8,
  spring_night: 1.2,
  crickets: 1.1,
  rain: 0.62,
};

let amb: Ambience = { night: false, rain: false };
let ambKey = "";
let ambTimer = 0;
let lastOwl = 0;
let lastThunder = 0;
let lastGust = 0;
// Synthesized fallbacks, used only when a real loop couldn't be loaded.
let rainSrc: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let rainFilter: BiquadFilterNode | null = null;

function loadAmb(path: string): Promise<AudioBuffer | null> {
  const done = ambBuf.get(path);
  if (done !== undefined) return Promise.resolve(done);
  let p = ambLoad.get(path);
  if (!p) {
    p = fetchBuffer(`${BASE}sounds/ambience/${path}.m4a`).then((b) => {
      ambBuf.set(path, b);
      ambLoad.delete(path);
      return b;
    });
    ambLoad.set(path, p);
  }
  return p;
}

/** True when the layer wants a loop that turned out to be missing (so we synthesize instead). */
function layerFailed(l: Layer): boolean {
  return !!l.path && ambBuf.get(l.path) === null;
}

/** Called by the HUD every couple of seconds with what the farm looks like right now. */
export function setAmbience(next: Ambience): void {
  try {
    const key = [next.night, next.rain, next.morning, next.storm, next.winter, next.season, next.windy].map(String).join("|");
    amb = { ...next };
    const changed = key !== ambKey;
    ambKey = key;
    // Also kick things back on if they should be playing but aren't (e.g. after a resume).
    const idle = !ambTimer || (amb.rain && !layers.rain.src && !rainSrc);
    if (changed || (running() && idle)) applyAmbience();
  } catch (err) {
    console.warn("[audio] ambience", err);
  }
}

function ambienceAllowed(): boolean {
  return !muted && unlocked && running() && document.visibilityState === "visible";
}

function applyAmbience(): void {
  try {
    if (!ambienceAllowed() || !ctx || !ambBus) {
      stopAmbience();
      return;
    }
    const season = amb.season ?? "spring";
    const dayLoop = !amb.night && !amb.rain ? DAY_LOOP[season] : null;
    const nightLoop = amb.night && !amb.rain && !amb.winter ? (NIGHT_LOOP[season] ?? null) : null;
    setLayer(layers.rain, amb.rain ? "rain" : null, (LOOP_GAIN.rain ?? 1) * (amb.storm ? 1.4 : 1));
    setLayer(layers.day, dayLoop, dayLoop ? (LOOP_GAIN[dayLoop] ?? 1) : 0);
    setLayer(layers.night, nightLoop, nightLoop ? (LOOP_GAIN[nightLoop] ?? 1) : 0);
    synthRain(amb.rain && layerFailed(layers.rain));
    if (!ambTimer) scheduleAmbience(400);
  } catch (err) {
    console.warn("[audio] ambience", err);
  }
}

function setLayer(l: Layer, path: string | null, level: number): void {
  if (!ctx) return;
  if (l.path === path) {
    if (path && l.gain && l.level !== level) l.gain.gain.setTargetAtTime(level, ctx.currentTime, 1);
    l.level = level;
    return;
  }
  fadeOut(l, 1.2);
  l.path = path;
  l.level = level;
  if (!path) return;
  void loadAmb(path).then((buf) => {
    if (!buf || l.path !== path || l.src || !ambienceAllowed() || !ctx || !ambBus) return;
    try {
      startLoop(l, buf);
    } catch (err) {
      console.warn("[audio] ambience", err);
    }
  });
}

function startLoop(l: Layer, buf: AudioBuffer): void {
  if (!ctx || !ambBus) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  // Skip any codec padding (silence) at either end so the loop doesn't hiccup.
  const [a, b] = loopBounds(buf);
  src.loopStart = a;
  src.loopEnd = b;
  const g = ctx.createGain();
  g.gain.value = 0.0001;
  src.connect(g).connect(ambBus);
  // Start somewhere random in the loop so it doesn't always open with the same chirp.
  src.start(ctx.currentTime + 0.02, a + Math.random() * (b - a) * 0.9);
  g.gain.setTargetAtTime(l.level, ctx.currentTime, 1.4);
  l.src = src;
  l.gain = g;
}

/** Loop points that skip near-silent padding at the start/end (AAC priming), if there is any. */
function loopBounds(buf: AudioBuffer): [number, number] {
  const d = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const max = Math.min(d.length >> 2, Math.floor(sr * 0.15));
  let a = 0;
  while (a < max && Math.abs(d[a]!) < 1e-4) a++;
  let b = d.length - 1;
  const minB = d.length - 1 - max;
  while (b > minB && Math.abs(d[b]!) < 1e-4) b--;
  if (a >= max) a = 0;
  if (b <= minB) b = d.length - 1;
  return [a / sr, (b + 1) / sr];
}

function fadeOut(l: Layer, seconds: number): void {
  const src = l.src;
  const g = l.gain;
  l.src = null;
  l.gain = null;
  if (!src || !g || !ctx) return;
  const t = ctx.currentTime;
  try {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, seconds / 3);
    src.stop(t + seconds + 0.2);
  } catch {
    /* already stopped */
  }
  src.onended = () => g.disconnect();
}

/** The synthesized rain bed (only when the real rain loop is missing). */
function synthRain(on: boolean): void {
  if (!ctx || !ambBus) return;
  if (on && !rainSrc) {
    rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuf;
    rainSrc.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 350;
    rainFilter = ctx.createBiquadFilter();
    rainFilter.type = "lowpass";
    rainGain = ctx.createGain();
    rainGain.gain.value = 0.0001;
    rainSrc.connect(hp).connect(rainFilter).connect(rainGain).connect(ambBus);
    rainSrc.start();
  }
  if (rainSrc && rainGain && rainFilter) {
    const t = ctx.currentTime;
    rainFilter.frequency.setTargetAtTime(amb.storm ? 1500 : 2600, t, 0.5);
    rainGain.gain.setTargetAtTime(on ? (amb.storm ? 0.09 : 0.055) : 0.0001, t, 0.8);
    if (!on) {
      const src = rainSrc;
      rainSrc = null;
      setTimeout(() => {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }, 4000);
    }
  }
}

function stopAmbience(): void {
  clearTimeout(ambTimer);
  ambTimer = 0;
  for (const l of Object.values(layers)) {
    fadeOut(l, 0.05);
    l.path = null;
  }
  if (rainSrc) {
    try {
      rainSrc.stop();
    } catch {
      /* fine */
    }
    rainSrc = null;
  }
}

function scheduleAmbience(delay: number): void {
  ambTimer = window.setTimeout(ambienceTick, delay);
}

/** Little one-off sounds sprinkled over the loops: owls, extra birds, gusts, far-off thunder. */
function ambienceTick(): void {
  ambTimer = 0;
  try {
    if (!ambienceAllowed() || !ctx || !ambBus) return;
    const t = ctx.currentTime + 0.05;
    const now = performance.now();
    // Night: real crickets come from the loop; synthesize them only if it's missing.
    const crickets = amb.night && !amb.winter && !amb.rain;
    if (crickets && (layerFailed(layers.night) || !layers.night.path)) {
      cricket(t, rand(4300, 4700), rand(0.008, 0.016));
      if (Math.random() < 0.45) cricket(t + rand(0.25, 0.5), rand(4800, 5200), rand(0.005, 0.01));
    }
    if (amb.night && !amb.rain && Math.random() < 0.015 && now - lastOwl > 60_000) {
      lastOwl = now;
      if (!ambFile("owl", 0.14)) owl(t + 0.4);
    }
    if (amb.morning && !amb.rain && layerFailed(layers.day) && Math.random() < 0.22) bird(t + rand(0, 0.5));
    if (amb.windy && Math.random() < 0.08 && now - lastGust > 9_000) {
      lastGust = now;
      void loadAmb("wind").then((b) => b && playAmbOneShot(b, rand(0.6, 0.9), rand(0.85, 1.1)));
    }
    if (amb.storm && Math.random() < 0.025 && now - lastThunder > 45_000) {
      lastThunder = now;
      if (!ambFile("thunder", 0.17)) noise(ambBus, t, { dur: 2.4, vol: 0.12, attack: 0.3, type: "lowpass", f: 180, path: [[2.4, 70]] });
    }
  } catch (err) {
    console.warn("[audio] ambience", err);
  }
  scheduleAmbience(amb.night && !amb.rain ? rand(650, 1500) : rand(1200, 2600));
}

/** Play a real recording on the ambience bus. Returns false if it isn't available (yet). */
function ambFile(name: Sfx, volume: number): boolean {
  const b = fileBuf.get(name);
  if (b === undefined) void requestFile(name);
  if (!b) return false;
  playAmbOneShot(b, volume, rand(0.94, 1.04));
  return true;
}

function playAmbOneShot(buf: AudioBuffer, volume: number, rate: number): void {
  if (!ctx || !ambBus || !ambienceAllowed()) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = volume;
  src.connect(g).connect(ambBus);
  src.onended = () => g.disconnect();
  src.start();
}

function cricket(t: number, f: number, vol: number): void {
  const pulses = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < pulses; i++) tone(ambBus!, t + i * 0.045, { f, dur: 0.03, vol, attack: 0.004 });
}

function bird(t: number): void {
  const notes = 2 + Math.floor(Math.random() * 3);
  const base = rand(2400, 3600);
  for (let i = 0; i < notes; i++) {
    const f = base * rand(0.9, 1.15);
    tone(ambBus!, t + i * rand(0.08, 0.14), { f, f2: f * rand(1.15, 1.45), dur: rand(0.05, 0.09), vol: 0.035 });
  }
}

function owl(t: number): void {
  tone(ambBus!, t, { f: 390, f2: 360, dur: 0.32, vol: 0.05, attack: 0.05 });
  tone(ambBus!, t + 0.5, { f: 380, f2: 350, dur: 0.45, vol: 0.05, attack: 0.06 });
}
