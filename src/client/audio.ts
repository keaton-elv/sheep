// Sound effects.
// Plays real recordings from public/sounds (see FILES): the Stardew effects, plus the critter
// voices (the real Stardew baa, a lamb's bleat, Snickers's "Mow" and meows, birds, seagulls, a
// bunny, the banana slug's squelch, Otto's yip). A sound can have several takes (each play picks
// one, optionally weighted). Anything without a recording (pet, lick), or whose file fails to
// load, is synthesized with WebAudio (oscillators, noise, filters, envelopes): every name has a
// synth fallback. Only files listed in FILES / AMBIENCE_FILES are ever fetched: nothing probes
// the server for recordings that might not exist.
// Also runs a quiet ambience bed (the real Stardew loops in public/sounds/ambience: seasonal days,
// night insects, rain, wind gusts, a campfire's crackle, the pond's babble) while unmuted.
//
// Phones (iOS especially) only let a page make sound after a tap, and can stop it again at any
// time (a call, Siri, a trip to the home screen: Safari's non-standard "interrupted" state). So
// every tap/key re-wakes the engine inside the gesture (resume + a 1-sample silent buffer), a
// "closed" context is rebuilt, and a stuck "interrupted" one is rebuilt after a few taps.
// The audio session type is left alone ("auto": web audio respects the iPhone's silent switch)
// unless the farmers turn on "Play in silent mode" (farm.sound.silentmode), which asks for
// "playback" (plays on silent, pauses other apps' music).
// getSoundStatus()/onSoundStatus() say whether sound is supposed to be playing right now, so the
// HUD can show it (and a little sound check can explain it).

import type { Season } from "../shared/calendar";

export type Sfx =
  | "baa" // a sheep baa (the real Stardew sheep)
  | "baaLamb" // a lamb's little bleat
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
  | "chirp" // a little three-note chirp (real recording)
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
  | "meow" // Snickers: mostly his "Mow", now and then a real meow (never two at once)
  | "mow" // the same thing, by its proper name
  // Extras that have real Stardew recordings (free for any module to use):
  | "chest" // opening a chest
  | "croak" // a frog
  | "harvest" // picking something up off the ground
  | "owl"
  | "reward" // little "you got something" jingle
  | "secret" // secret found!
  | "thunder"
  | "lick" // Snickers licking the air: a tiny wet "mlem" (synthesized, a little different every time)
  // Critter voices (real recordings, several takes each):
  | "tweet" // a songbird
  | "seagull"
  | "bunny"
  | "squelch"; // the banana slug

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
  /** A campfire decoration is on the farm: its soft crackle (not in the rain). */
  campfire?: boolean;
  /** A pond decoration is on the farm: a gentle babble of water. */
  pond?: boolean;
}

const MASTER_VOLUME = 0.45;
const AMBIENCE_VOLUME = 0.55;
const MAX_VOICES = 8;
const MUTE_KEY = "farm.muted";
const SILENT_MODE_KEY = "farm.sound.silentmode";
const BASE = import.meta.env.BASE_URL;

/**
 * One recording of a sound. A sound can have several takes: each play picks one at random
 * (weighted by `weight`), so the birds don't sing the same phrase twice in a row.
 */
interface Take {
  file: string;
  /** Relative odds of this take being picked (default 1). */
  weight?: number;
  /** Loudness trim for this take on top of the sound's FILE_GAIN (evens out takes; default 1). */
  gain?: number;
  /** Playback rate baked into this take (default 1), multiplied with the caller's pitch. */
  rate?: number;
}
type Recording = string | Take | readonly (string | Take)[];

/** Snickers: mostly his "Mow", sometimes a proper meow, very rarely the silly one. */
const MEOWS: readonly Take[] = [
  { file: "mow1.wav", weight: 60 },
  // A long, steady meow: its loudest moment sits ~3 dB under the "Mow"'s.
  { file: "meow.wav", weight: 32, gain: 1.3 },
  // Already level-matched to mow1 by ear.
  { file: "meow-funny.wav", weight: 8 },
];

/** Real recordings in public/sounds. Names not listed here are synthesized. */
const FILES: Partial<Record<Sfx, Recording>> = {
  baa: "baa.wav", // the real Stardew sheep
  baaLamb: "baa-lamb.wav", // a goat kid's bleat: reads as a lamb
  blip: "blip.wav",
  bunny: "bunny.wav",
  cancel: "cancel.wav",
  chest: "chest.wav",
  chime: "chime.wav",
  coin: "coin.wav",
  croak: "croak.wav",
  crow: "crow.wav",
  door: "door.wav",
  harvest: "harvest.wav",
  chirp: "junimo.wav", // (the recording's original file name)
  loom: "loom.wav",
  meow: MEOWS,
  menuClose: "menuClose.wav",
  menuOpen: "menuOpen.wav",
  mow: MEOWS,
  owl: "owl.m4a",
  pop: "pop.wav",
  purchase: "purchase.wav",
  reward: "reward.m4a",
  rustle: "rustle.wav",
  // The takes were recorded ~20 dB apart: the gains bring each to the same loudness.
  seagull: [
    { file: "seagull1.wav", gain: 4.9 },
    { file: "seagull2.wav", gain: 1.13 },
    { file: "seagull3.wav" },
  ],
  secret: "secret.m4a",
  select: "select.wav",
  snip: "snip.wav",
  sparkle: "sparkle.wav",
  splash: "splash.wav",
  squeak: "squeak.wav",
  squelch: ["slug1.wav", { file: "slug2.wav", gain: 1.45 }],
  stardrop: "stardrop.m4a",
  thud: "thud.wav",
  thunder: "thunder.m4a",
  // Six little songs, recorded up to 30 dB apart (tweet1 is a whisper, tweet6 a shout).
  tweet: [
    { file: "tweet1.wav", gain: 6.9 },
    { file: "tweet2.wav" },
    { file: "tweet3.wav", gain: 1.16 },
    { file: "tweet4.wav", gain: 0.9 },
    { file: "tweet5.wav", gain: 2.33 },
    { file: "tweet6.wav", gain: 0.19 },
  ],
  woosh: "woosh.wav",
  // A small dog's bark, sped up a little so it reads as a fox kit's yip.
  yip: { file: "yip.wav", rate: 1.3 },
};
/**
 * Loudness trims for the recordings (they were cut at wildly different levels: the snip peaks at
 * -22 dB, the crow at 0 dB). Roughly evens out their peaks. The critter voices were set by
 * short-term (200 ms, K-weighted) loudness instead, to sit with the croak and the chirp
 * (about -20 LUFS after the trim): the sheep a touch louder, small things (bunny, slug) softer.
 */
const FILE_GAIN: Partial<Record<Sfx, number>> = {
  baa: 0.9,
  baaLamb: 1.8,
  blip: 1.2,
  bunny: 15,
  cancel: 2.4,
  chest: 0.9,
  chime: 1.8,
  croak: 0.6,
  crow: 0.6,
  door: 5,
  chirp: 0.65,
  loom: 0.8,
  meow: 0.3,
  menuClose: 0.9,
  menuOpen: 0.9,
  mow: 0.3,
  pop: 3,
  purchase: 4,
  reward: 1.3,
  rustle: 2.2,
  seagull: 1.75,
  secret: 1.4,
  select: 1.3,
  snip: 4,
  sparkle: 4,
  splash: 1.6,
  squeak: 5,
  squelch: 2.3,
  thud: 0.8,
  tweet: 2.8,
  woosh: 3,
  yip: 0.4,
};
/** Little UI sounds worth having decoded before the first tap. */
const PRELOAD: Sfx[] = ["select", "cancel", "reward", "menuOpen", "menuClose", "blip", "pop", "snip", "purchase", "rustle", "thud", "woosh", "sparkle", "chime", "door"];
/** Then, a little later, the small critter voices you get by tapping things (every take). */
const PRELOAD_LATER: Sfx[] = ["baa", "baaLamb", "meow", "yip", "tweet", "bunny", "squelch"];
/** Sounds that never overlap themselves (or each other, within a group): a cat has one mouth. */
const SOLO: Partial<Record<Sfx, string>> = { meow: "cat", mow: "cat" };

/** Every sound's takes, normalized once. */
const TAKES = new Map<Sfx, readonly Take[]>();
for (const [name, rec] of Object.entries(FILES) as [Sfx, Recording][]) {
  const list = (Array.isArray(rec) ? rec : [rec]) as readonly (string | Take)[];
  const takes = list.map((t) => (typeof t === "string" ? { file: t } : t)).filter((t) => t.file && (t.weight ?? 1) > 0);
  if (takes.length) TAKES.set(name, takes);
}

// ---------- state ----------

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfxBus: GainNode | null = null;
let ambBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
/** A tap/key has asked for sound at least once (the little UI sounds are queued to load). */
let unlocked = false;
/** The engine has really run at least once: the browser let us make sound. */
let everRan = false;
let muted = readFlag(MUTE_KEY);
let silentMode = readFlag(SILENT_MODE_KEY);
let lastError: string | null = null;
/** lastError came from starting the engine (cleared once it runs). */
let errorFromEngine = false;
/** When the engine went "interrupted" (performance.now()) and how many taps have tried to wake it. */
let interruptedAt = 0;
let wakeTries = 0;
let lastWakeTry = 0;
let lastRebuild = -Infinity;
/** The engine state onEngineState() last handled (a poll catches any change it never heard of). */
let seenState = "none";
const muteListeners = new Set<(muted: boolean) => void>();

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode: it just won't be remembered */
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message || err.name : String(err);
}

/** Remember what went wrong last (the sound check shows it). */
function noteError(what: string, engine = false): void {
  lastError = what;
  errorFromEngine = engine;
  console.warn("[audio]", what);
  emitStatus();
}

// ---------- status (is sound supposed to be playing?) ----------

export type SoundEngine = "none" | "suspended" | "running" | "interrupted" | "closed";

export interface SoundStatus {
  /** Sound is on (not muted). */
  enabled: boolean;
  /** The WebAudio engine. "none" until the first tap; only "running" can make a sound. */
  engine: SoundEngine;
  /** The browser has let the engine run at least once (a tap unlocked it). */
  unlocked: boolean;
  /** "Play in silent mode" is on. */
  silentMode: boolean;
  /** This browser can switch its audio session (Safari's navigator.audioSession), so "Play in silent mode" can work. */
  sessionControl: boolean;
  /** Recordings decoded and ready, that failed (synthesized instead), and still on their way. */
  filesReady: number;
  filesFailed: number;
  filesLoading: number;
  lastError: string | null;
}

const statusListeners = new Set<(s: SoundStatus) => void>();
let statusQueued = false;
let lastStatusKey = "";

export function getSoundStatus(): SoundStatus {
  let ready = 0;
  let failed = 0;
  for (const m of [fileBuf, ambBuf]) {
    for (const b of m.values()) {
      if (b) ready++;
      else failed++;
    }
  }
  return {
    enabled: !muted,
    engine: engineState(),
    unlocked: everRan,
    silentMode,
    sessionControl: !!audioSession(),
    filesReady: ready,
    filesFailed: failed,
    filesLoading: fileLoad.size + ambLoad.size,
    lastError,
  };
}

/** Fires (batched, only on real changes) whenever anything in getSoundStatus() changes. */
export function onSoundStatus(fn: (s: SoundStatus) => void): () => void {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
}

function emitStatus(): void {
  if (statusQueued || !statusListeners.size) return;
  statusQueued = true;
  queueMicrotask(() => {
    statusQueued = false;
    try {
      const s = getSoundStatus();
      const key = JSON.stringify(s);
      if (key === lastStatusKey) return;
      lastStatusKey = key;
      for (const fn of [...statusListeners]) {
        try {
          fn(s);
        } catch (err) {
          console.warn("[audio] status listener", err);
        }
      }
    } catch (err) {
      console.warn("[audio] status", err);
    }
  });
}

// ---------- the audio session (Safari's navigator.audioSession) ----------

interface AudioSessionLike {
  type: string;
}

function audioSession(): AudioSessionLike | null {
  try {
    return (navigator as unknown as { audioSession?: AudioSessionLike }).audioSession ?? null;
  } catch {
    return null;
  }
}

/**
 * Left at the browser's "auto" (web audio follows the silent switch and mixes with her music)
 * unless "Play in silent mode" is on: then "playback" (plays on silent; iOS pauses other apps).
 */
function applySession(): void {
  const s = audioSession();
  if (!s) return;
  const want = silentMode ? "playback" : "auto";
  try {
    if (s.type !== want) s.type = want;
  } catch (err) {
    noteError(`audio session: ${errText(err)}`);
  }
}

// ---------- the engine ----------

/** The context's state, including Safari's non-standard "interrupted". */
function engineState(): SoundEngine {
  if (!ctx) return "none";
  const s = ctx.state as string;
  return s === "running" || s === "suspended" || s === "interrupted" || s === "closed" ? s : "suspended";
}

function running(): boolean {
  return !!ctx && ctx.state === "running";
}

function ensureContext(): AudioContext | null {
  if (ctx && (ctx.state as string) !== "closed") return ctx;
  if (ctx) dropContext(); // closed under us: build a fresh one
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) {
    if (!lastError) noteError("no Web Audio in this browser", true);
    return null;
  }
  // Before the context exists, so it starts out in the right audio session.
  applySession();
  let c: AudioContext;
  try {
    c = new AC({ latencyHint: "interactive" });
  } catch {
    try {
      c = new AC();
    } catch (err) {
      noteError(`can't start audio: ${errText(err)}`, true);
      return null;
    }
  }
  ctx = c;
  try {
    buildGraph(c);
  } catch (err) {
    noteError(`audio graph: ${errText(err)}`, true);
  }
  c.onstatechange = onEngineState;
  emitStatus();
  return c;
}

function buildGraph(c: AudioContext): void {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  comp.connect(c.destination);

  master = c.createGain();
  master.gain.value = muted ? 0 : MASTER_VOLUME;
  master.connect(comp);

  sfxBus = c.createGain();
  sfxBus.connect(master);
  ambBus = c.createGain();
  ambBus.gain.value = AMBIENCE_VOLUME;
  ambBus.connect(master);

  // Two seconds of white noise, reused by every noisy sound.
  const len = Math.floor(c.sampleRate * 2);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

/** Forget a dead context (closed, or stuck interrupted). Decoded recordings are kept. */
function dropContext(): void {
  const old = ctx;
  try {
    stopAmbience();
  } catch {
    /* it's going away anyway */
  }
  for (const v of voices.splice(0)) clearTimeout(v.timer);
  ctx = null;
  seenState = "none";
  master = sfxBus = ambBus = null;
  noiseBuf = null;
  rainGain = rainFilter = null;
  // These hold the old context's clock times.
  lastPlayed.clear();
  soloUntil.clear();
  if (old) {
    try {
      old.onstatechange = null;
      if ((old.state as string) !== "closed") (old.close() as Promise<void> | undefined)?.catch(() => {});
    } catch {
      /* already gone */
    }
  }
}

function onEngineState(): void {
  try {
    const st = engineState();
    seenState = st;
    if (st !== "interrupted") {
      interruptedAt = 0;
      wakeTries = 0;
    } else if (!interruptedAt) {
      interruptedAt = performance.now();
      wakeTries = 0;
    }
    if (st === "running") {
      everRan = true;
      if (errorFromEngine) {
        lastError = null;
        errorFromEngine = false;
      }
      applyAmbience();
    }
    emitStatus();
  } catch (err) {
    console.warn("[audio] state", err);
  }
}

/** Resume outside a gesture (back from the home screen). Once a tap has unlocked audio this
 * works; if it doesn't, the next tap will. */
function resume(): void {
  if (!ctx || muted || document.visibilityState === "hidden") return;
  const st = engineState();
  if (st === "running" || st === "closed") return;
  try {
    const p = ctx.resume() as Promise<void> | undefined;
    p?.then(
      () => applyAmbience(),
      () => {},
    );
  } catch {
    /* the next tap will try again */
  }
}

/** Browsers need a user gesture before audio can play. Runs on every tap/key (main.ts calls it too). */
export function unlockAudio(): void {
  try {
    const c = ensureContext();
    if (!c) return;
    if (!unlocked) {
      unlocked = true;
      // Decode the little UI sounds now, so the very first click already sounds like Stardew,
      // then the critter voices once the farm has had a moment to load.
      setTimeout(() => preloadFiles(PRELOAD), 60);
      setTimeout(() => preloadFiles(PRELOAD_LATER), 2500);
      emitStatus();
    }
    if (muted) {
      if (c.state === "running") void c.suspend().catch(() => {});
      return;
    }
    wake();
  } catch (err) {
    console.warn("[audio] unlock", err);
  }
}

/** Start (or restart) the engine from inside a user gesture. */
function wake(): void {
  let c = ensureContext();
  if (!c || muted) return;
  const st = engineState();
  if (st === "running") return;
  if (st === "interrupted") {
    const now = performance.now();
    // One tap fires pointerup, touchend and click: count it once.
    if (now - lastWakeTry > 400) {
      wakeTries++;
      lastWakeTry = now;
    }
    // Still interrupted after a few taps: build a fresh engine, right here inside the tap.
    if (wakeTries >= 3 && interruptedAt && now - interruptedAt > 1500 && now - lastRebuild > 10_000) {
      lastRebuild = now;
      noteError("engine stayed interrupted, so it was restarted", true);
      dropContext();
      c = ensureContext();
      if (!c) return;
    }
  }
  kick(c);
}

/** resume(), plus a 1-sample silent buffer started in the same gesture (what iOS wants). */
function kick(c: AudioContext): void {
  try {
    const s = c.createBufferSource();
    s.buffer = c.createBuffer(1, 1, c.sampleRate);
    s.connect(c.destination);
    s.start(0);
  } catch {
    /* ignore */
  }
  try {
    const p = c.resume() as Promise<void> | undefined;
    p?.then(
      () => {
        if (c === ctx) onEngineState();
      },
      (err: unknown) => {
        // (An early, pre-tap resume can be refused after a later one already got it going.)
        if (c === ctx && !running()) noteError(`resume: ${errText(err)}`, true);
      },
    );
  } catch (err) {
    noteError(`resume: ${errText(err)}`, true);
  }
}

// Touch "activation" only counts on pointerup/touchend/click (not pointerdown), and iOS can
// suspend or interrupt the context after a call or a trip to the home screen, so keep
// listening: every tap wakes it (synchronously, inside the gesture) if it isn't running.
for (const ev of ["pointerup", "touchend", "click", "keydown"]) {
  addEventListener(
    ev,
    () => {
      try {
        if (!unlocked) unlockAudio();
        else if (!muted && !running()) wake();
      } catch (err) {
        console.warn("[audio] gesture", err);
      }
    },
    { capture: true, passive: true },
  );
}

document.addEventListener("visibilitychange", () => {
  try {
    if (!ctx) return;
    if (document.visibilityState === "hidden") {
      stopAmbience();
      if (ctx.state === "running") void ctx.suspend().catch(() => {});
    } else if (unlocked && !muted) {
      resume();
    }
    emitStatus();
  } catch (err) {
    console.warn("[audio] visibility", err);
  }
});

// Back from Safari's back/forward cache: the old context may be suspended or interrupted.
addEventListener("pageshow", () => {
  try {
    if (unlocked && !muted) resume();
    emitStatus();
  } catch (err) {
    console.warn("[audio] pageshow", err);
  }
});

// Safety net: some Safaris skip "statechange" (older ones, and now and then "interrupted"), and
// the sound box must never claim sound is on when it isn't. Cheap: one property read.
setInterval(() => {
  try {
    if (document.visibilityState === "hidden") return;
    if (engineState() !== seenState) onEngineState();
  } catch (err) {
    console.warn("[audio] poll", err);
  }
}, 1500);

// ---------- mute & silent mode ----------

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  if (muted === m) return;
  muted = m;
  writeFlag(MUTE_KEY, m);
  try {
    if (ctx && master && (ctx.state as string) !== "closed") {
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
  } catch (err) {
    console.warn("[audio] mute", err);
  }
  muteListeners.forEach((fn) => {
    try {
      fn(m);
    } catch (err) {
      console.warn("[audio] mute listener", err);
    }
  });
  emitStatus();
}

export function onMuteChange(fn: (muted: boolean) => void): () => void {
  muteListeners.add(fn);
  return () => muteListeners.delete(fn);
}

export function getSilentMode(): boolean {
  return silentMode;
}

/** A silent-mode bounce (suspend + resume) still landing. */
let settling: Promise<unknown> | null = null;

/**
 * "Play in silent mode" (iPhone): on = the "playback" audio session (plays even with the silent
 * switch on; iOS pauses other apps' music), off = back to "auto". Call it from a tap: the new
 * session only takes hold when the engine starts, so a live engine is bounced (suspend + resume)
 * right here inside the gesture.
 */
export function setSilentMode(on: boolean): void {
  try {
    const changed = silentMode !== on;
    silentMode = on;
    if (changed) writeFlag(SILENT_MODE_KEY, on);
    applySession();
    const c = ctx;
    if (changed && c && (c.state as string) !== "closed" && !muted) {
      if (c.state === "running") {
        const p = c.suspend() as Promise<void> | undefined;
        // Belt and braces: if the bounce leaves it asleep, wake it once the suspend lands. The
        // test baa waits for this, so it doesn't start just before the engine pauses.
        // (Never waits more than a moment: an engine that won't come back can't hold up later baas.)
        const bounce: Promise<unknown> = Promise.race([
          Promise.resolve(p)
            .then(() => (c === ctx && !muted && !running() ? c.resume() : undefined))
            .catch(() => {}),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
        settling = bounce;
        void bounce.finally(() => {
          if (settling === bounce) settling = null;
        });
      }
      kick(c);
    }
  } catch (err) {
    noteError(`silent mode: ${errText(err)}`);
  }
  emitStatus();
}

/**
 * The sound check's "Play a baa": wakes the engine (call it from a tap) and plays the real baa,
 * waiting for the recording if it's still on its way (the synth stands in if it failed).
 * Returns false when sound is off or this browser has no audio at all.
 */
export function playTestSound(): boolean {
  try {
    if (muted) return false;
    unlockAudio();
    const c = ctx;
    if (!c) return false;
    const asked = performance.now();
    const take = TAKES.get("baa")?.[0];
    // A baa that turns up seconds after the tap would just be confusing.
    const stale = () => c !== ctx || muted || !running() || performance.now() - asked > 4000;
    const go = () => {
      try {
        if (stale()) return;
        lastPlayed.set("baa", c.currentTime);
        if (!take) {
          playSynth("baa", 1, 1);
          return;
        }
        void requestFile(take.file).then((buf) => {
          try {
            if (stale()) return;
            if (buf) playTake("baa", take, buf, 1, 1);
            else playSynth("baa", 1, 1);
          } catch (err) {
            console.warn("[audio] test", err);
          }
        });
      } catch (err) {
        console.warn("[audio] test", err);
      }
    };
    const ready = settling ?? (running() ? null : (c.resume() as Promise<void> | undefined));
    if (!ready) go();
    else ready.then(go, () => {});
    return true;
  } catch (err) {
    console.warn("[audio] test", err);
    return false;
  }
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

  baaLamb(d, t, p) {
    // (Fallback for baa-lamb.wav) The same bleat, smaller and higher.
    return SYNTHS.baa(d, t, p * 1.35);
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

  chirp(d, t, p) {
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
    // (Fallback for the real recordings.) Snickers mostly says "Mow": short, low and round. A
    // hummed "m" with the mouth shut, opening into an "o" that rounds off into a "w".
    const c = ctx!;
    const dur = 0.34;
    const f0 = rand(285, 315) * p;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.035); // "m..."
    env.gain.linearRampToValueAtTime(0.85, t + 0.1); // "...o..."
    env.gain.setValueAtTime(0.78, t + 0.16);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur); // "...w"
    env.connect(d);
    // The voice: a little lift on the "o", then it settles (a statement, not a question).
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(f0 * 0.92, t);
    osc.frequency.linearRampToValueAtTime(f0 * 1.1, t + 0.09);
    osc.frequency.linearRampToValueAtTime(f0 * 1.02, t + 0.17);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
    // The mouth: nearly shut for the "m", open for the "o", rounding off for the "w".
    const mouth = c.createBiquadFilter();
    mouth.type = "lowpass";
    mouth.Q.value = 0.9;
    mouth.frequency.setValueAtTime(420, t);
    mouth.frequency.linearRampToValueAtTime(450, t + 0.04);
    mouth.frequency.linearRampToValueAtTime(2000, t + 0.11);
    mouth.frequency.exponentialRampToValueAtTime(600, t + dur);
    osc.connect(mouth);
    // Two vowel formants gliding nasal "m" -> "ah" -> "oo".
    const formant = (from: number, open: number, to: number, q: number, level: number) => {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = q;
      bp.frequency.setValueAtTime(from, t);
      bp.frequency.linearRampToValueAtTime(open, t + 0.11);
      bp.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = c.createGain();
      g.gain.value = level;
      mouth.connect(bp).connect(g).connect(env);
    };
    formant(320, 740, 400, 3.5, 1);
    formant(950, 1250, 820, 5, 0.45);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    // A soft sine on the fundamental underneath: that's what makes it round instead of whiny.
    tone(d, t + 0.01, {
      f: f0 * 0.95,
      path: [
        [0.08, f0 * 1.1],
        [0.16, f0 * 1.02],
        [dur - 0.03, f0 * 0.82],
      ],
      dur: dur - 0.02,
      vol: 0.16,
      attack: 0.04,
    });
    return dur;
  },

  mow(d, t, p) {
    return SYNTHS.meow(d, t, p);
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
    // A tiny wet "mlem", a little different every flick:
    const r = rand(0.9, 1.12) * p;
    // "m": lips parting, a soft low bump...
    tone(d, t, { f: 210 * r, f2: 330 * r, dur: 0.04, vol: 0.11, attack: 0.006 });
    // ...the tongue pops out: a wet smack (a short, ringing band of noise sliding down)...
    noise(d, t + 0.022, { dur: 0.03, vol: 0.2, attack: 0.001, type: "bandpass", f: 3000 * r, q: 7, path: [[0.03, 1700 * r]] });
    // ..."lem": a little rising-then-falling vowel, kept soft and round...
    tone(d, t + 0.026, {
      type: "triangle",
      f: 560 * r,
      path: [
        [0.028, 1180 * r],
        [0.075, 760 * r],
      ],
      dur: 0.08,
      vol: 0.09,
      attack: 0.005,
      filter: { type: "lowpass", f: 2200 },
    });
    // ...and back in: a teeny higher click.
    noise(d, t + 0.088, { dur: 0.016, vol: rand(0.08, 0.13), attack: 0.001, type: "bandpass", f: 3800 * r, q: 9 });
    return 0.11;
  },

  // ---- critter voices (normally played from their real recordings) ----

  tweet(d, t, p) {
    // A quick little song: two to four bright, up-swept chirps.
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = rand(2600, 3400) * p;
    let at = 0;
    for (let i = 0; i < notes; i++) {
      const f = base * rand(0.9, 1.15);
      const dur = rand(0.05, 0.08);
      tone(d, t + at, { f, f2: f * rand(1.2, 1.5), dur, vol: 0.13, vibRate: 35, vibDepth: 0.03 });
      at += dur + rand(0.03, 0.07);
    }
    return at + 0.05;
  },

  seagull(d, t, p) {
    // "Kyow-kyow": a harsh, falling cry, two or three times, each a little lower.
    const calls = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < calls; i++) {
      const ti = t + i * 0.24;
      const f = (1250 - i * 70) * p;
      const path: [number, number][] = [
        [0.03, f * 1.25],
        [0.17, f * 0.62],
      ];
      const low = path.map(([dt, x]): [number, number] => [dt, x * 0.5]);
      tone(d, ti, { type: "sawtooth", f, path, dur: 0.18, vol: 0.13, attack: 0.01, filter: { type: "bandpass", f: 1900, q: 1.6 } });
      tone(d, ti, { type: "square", f: f * 0.5, path: low, dur: 0.18, vol: 0.04, filter: { type: "lowpass", f: 1800 } });
    }
    return calls * 0.24;
  },

  bunny(d, t, p) {
    // A soft little thump of a hop, then a twitchy sniff-sniff.
    tone(d, t, { f: 170 * p, f2: 80 * p, dur: 0.09, vol: 0.28, attack: 0.003 });
    noise(d, t, { dur: 0.05, vol: 0.12, type: "lowpass", f: 600 });
    for (let i = 0; i < 2; i++) noise(d, t + 0.14 + i * 0.07, { dur: 0.04, vol: 0.07, type: "bandpass", f: 4200 * p, q: 2.5 });
    return 0.3;
  },

  squelch(d, t, p) {
    // Wet and slow: a squishy gush that opens and closes, plus a gloopy little bubble.
    noise(d, t, {
      dur: 0.32,
      vol: 0.32,
      attack: 0.02,
      type: "bandpass",
      f: 380 * p,
      path: [
        [0.1, 1500 * p],
        [0.32, 260 * p],
      ],
      q: 5,
    });
    tone(d, t + 0.05, {
      f: 180 * p,
      path: [
        [0.08, 420 * p],
        [0.2, 150 * p],
      ],
      dur: 0.22,
      vol: 0.16,
      attack: 0.01,
      vibRate: 28,
      vibDepth: 0.08,
    });
    return 0.34;
  },
};

// Some sounds would be annoying if they stacked up (typing blips, menu clicks).
const MIN_GAP: Partial<Record<Sfx, number>> = {
  blip: 0.04,
  select: 0.03,
  menuOpen: 0.06,
  menuClose: 0.06,
  baa: 0.12,
  baaLamb: 0.12,
  pop: 0.03,
  lick: 0.05,
  meow: 0.2,
  mow: 0.2,
  tweet: 0.05,
  seagull: 0.15,
  bunny: 0.1,
  squelch: 0.12,
  yip: 0.1,
};
const lastPlayed = new Map<Sfx, number>();
/** SOLO group -> audio-clock time its current sound finishes. */
const soloUntil = new Map<string, number>();
/** The take each sound played last (evenly weighted takes don't repeat back to back). */
const lastTake = new Map<Sfx, Take>();

const clampRate = (r: number) => Math.max(0.25, Math.min(4, r));

// ---------- real sound files ----------

/** Settled lookups by file name: a decoded recording, or null = it failed (synthesize). */
const fileBuf = new Map<string, AudioBuffer | null>();
const fileLoad = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Fetch and decode one recording. On failure, says why (the sound check shows it) and returns
 * null; undefined = no engine to decode with right now (not a real failure: try again later).
 */
async function fetchBuffer(url: string): Promise<AudioBuffer | null | undefined> {
  const name = url.slice(url.lastIndexOf("/") + 1);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      noteError(`${name}: HTTP ${res.status}`);
      return null;
    }
    // Dev servers (and login pages) answer with HTML; that's not a sound.
    if ((res.headers.get("content-type") ?? "").includes("text/html")) {
      noteError(`${name}: got a web page, not a sound`);
      return null;
    }
    const data = await res.arrayBuffer();
    const c = ctx;
    if (!c) return undefined;
    const buf = await new Promise<AudioBuffer | null>((resolve) => {
      try {
        c.decodeAudioData(data, resolve, () => resolve(null))?.catch?.(() => resolve(null));
      } catch {
        resolve(null);
      }
    });
    // The engine was rebuilt mid-decode: that's not the file's fault.
    if (!buf && c !== ctx) return undefined;
    if (!buf) noteError(`${name}: couldn't decode`);
    return buf;
  } catch (err) {
    noteError(`${name}: ${errText(err)}`);
    return null;
  }
}

/** Load (once) one recording. Only ever called with files listed in FILES. */
function requestFile(file: string): Promise<AudioBuffer | null> {
  const done = fileBuf.get(file);
  if (done !== undefined) return Promise.resolve(done);
  let p = fileLoad.get(file);
  if (p) return p;
  p = fetchBuffer(`${BASE}sounds/${file}`).then((b) => {
    if (b !== undefined) fileBuf.set(file, b);
    fileLoad.delete(file);
    emitStatus();
    return b ?? null;
  });
  fileLoad.set(file, p);
  emitStatus();
  return p;
}

/** Start loading every take of a sound (they're small), so later plays can pick any of them. */
function warm(name: Sfx): void {
  for (const t of TAKES.get(name) ?? []) if (!fileBuf.has(t.file) && !fileLoad.has(t.file)) void requestFile(t.file);
}

function preloadFiles(names: readonly Sfx[]): void {
  try {
    if (!ctx) return;
    // A few at a time, so we don't hog a phone's connection while the farm loads.
    const queue = [...new Set(names.flatMap((n) => (TAKES.get(n) ?? []).map((t) => t.file)))];
    const next = (): void => {
      const file = queue.shift();
      if (file) void requestFile(file).then(next);
    };
    for (let i = 0; i < 3; i++) next();
  } catch (err) {
    console.warn("[audio] preload", err);
  }
}

/** A weighted random take. Evenly weighted pools of 3+ (birdsong) never repeat back to back. */
function pickTake(name: Sfx, takes: readonly Take[]): Take {
  if (takes.length === 1) return takes[0]!;
  const prev = lastTake.get(name);
  const w0 = takes[0]!.weight ?? 1;
  const even = takes.every((t) => (t.weight ?? 1) === w0);
  const pool = even && prev && takes.length >= 3 ? takes.filter((t) => t !== prev) : takes;
  let r = Math.random() * pool.reduce((sum, t) => sum + (t.weight ?? 1), 0);
  let pick = pool[pool.length - 1]!;
  for (const t of pool) {
    r -= t.weight ?? 1;
    if (r < 0) {
      pick = t;
      break;
    }
  }
  lastTake.set(name, pick);
  return pick;
}

/** Mark a SOLO sound's group busy until it finishes. */
function hold(name: Sfx, dur: number): void {
  const solo = SOLO[name];
  if (solo && ctx && dur > 0) soloUntil.set(solo, ctx.currentTime + dur);
}

/** Play a buffer on its own voice. Returns how long it lasts (0 if it couldn't start). */
function playBuffer(buf: AudioBuffer, volume: number, rate: number): number {
  const dur = buf.duration / rate;
  const v = startVoice(volume * 0.8, dur);
  if (!v || !ctx) return 0;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(v.out);
  src.start();
  return dur;
}

function playTake(name: Sfx, take: Take, buf: AudioBuffer, volume: number, pitch: number): void {
  const gain = (FILE_GAIN[name] ?? 1) * (take.gain ?? 1);
  hold(name, playBuffer(buf, volume * gain, clampRate(pitch * (take.rate ?? 1))));
}

function playSynth(name: Sfx, volume: number, pitch: number): void {
  if (!ctx) return;
  const v = startVoice(volume, 2);
  if (!v) return;
  try {
    const dur = SYNTHS[name](v.out, ctx.currentTime + 0.005, pitch);
    endVoiceAfter(v, dur);
    hold(name, dur);
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
  const solo = SOLO[name];
  if (solo && now < (soloUntil.get(solo) ?? 0)) return; // e.g. Snickers is mid-meow
  lastPlayed.set(name, now);
  const volume = Math.max(0, opts.volume ?? 1);
  const pitch = clampRate(opts.pitch ?? 1);

  const takes = TAKES.get(name);
  if (!takes) {
    // No recording for this one: it's synthesized.
    playSynth(name, volume, pitch);
    return;
  }
  warm(name);
  const take = pickTake(name, takes);
  const buf = fileBuf.get(take.file);
  if (buf) return playTake(name, take, buf, volume, pitch);
  // That take failed or hasn't arrived yet: another take that's ready will do...
  const ready = takes.filter((t) => t !== take && fileBuf.get(t.file));
  if (ready.length) {
    const alt = ready[Math.floor(Math.random() * ready.length)]!;
    return playTake(name, alt, fileBuf.get(alt.file)!, volume, pitch);
  }
  // ...and if it failed outright, the synth stands in.
  if (buf === null) return playSynth(name, volume, pitch);
  // The recording is still on its way: play it if it shows up quickly, otherwise skip this one
  // (a click that sounds half a second late feels worse than no click).
  const pending = now + 0.4;
  if (solo) soloUntil.set(solo, pending);
  const asked = performance.now();
  void requestFile(take.file).then((b) => {
    try {
      if (solo && soloUntil.get(solo) === pending) soloUntil.delete(solo);
      if (muted || !running() || performance.now() - asked > 350) return;
      if (b) playTake(name, take, b, volume, pitch);
      else playSynth(name, volume, pitch);
    } catch (err) {
      console.warn("[audio]", name, err);
    }
  });
}

// ---------- ambience ----------

type LayerName = "day" | "night" | "rain" | "fire" | "water";

interface Layer {
  /** Loop (sounds/ambience/<path>.m4a) this layer should be playing, or null for silence. */
  path: AmbienceFile | null;
  level: number;
  src: AudioBufferSourceNode | null;
  gain: GainNode | null;
}

const layers: Record<LayerName, Layer> = {
  day: { path: null, level: 0, src: null, gain: null },
  night: { path: null, level: 0, src: null, gain: null },
  rain: { path: null, level: 0, src: null, gain: null },
  fire: { path: null, level: 0, src: null, gain: null },
  water: { path: null, level: 0, src: null, gain: null },
};
const ambBuf = new Map<string, AudioBuffer | null>();
const ambLoad = new Map<string, Promise<AudioBuffer | null>>();

/**
 * Every loop in public/sounds/ambience (all .m4a) and what it's for. Only these are fetched.
 *   spring/summer/fall/winter_day: the seasonal day beds   spring_night: spring night peepers
 *   night_time: the summer night chorus                     crickets: fall nights
 *   rain: rain and storms     wind: one-shot gusts on windy days
 *   fire: a campfire decoration's crackle                   babbling_brook: a pond decoration
 */
const AMBIENCE_FILES = [
  "spring_day",
  "summer_day",
  "fall_day",
  "winter_day",
  "spring_night",
  "night_time",
  "crickets",
  "rain",
  "wind",
  "fire",
  "babbling_brook",
] as const;
type AmbienceFile = (typeof AMBIENCE_FILES)[number];

const DAY_LOOP: Record<Season, AmbienceFile> = { spring: "spring_day", summer: "summer_day", fall: "fall_day", winter: "winter_day" };
/** No night insects in winter (or in the snow). */
const NIGHT_LOOP: Partial<Record<Season, AmbienceFile>> = { spring: "spring_night", summer: "night_time", fall: "crickets" };
/** Per-loop gain: the recordings range from -35 to -48 dB, so even them out (quietly). */
const LOOP_GAIN: Record<AmbienceFile, number> = {
  spring_day: 2.2,
  summer_day: 0.63,
  fall_day: 0.95,
  winter_day: 1.8,
  spring_night: 1.2,
  night_time: 0.5,
  crickets: 1.1,
  rain: 0.62,
  wind: 1,
  // Decoration loops sit under everything else: you notice them, but only just.
  fire: 0.75,
  babbling_brook: 0.7,
};

let amb: Ambience = { night: false, rain: false };
const ambienceFiles: ReadonlySet<string> = new Set(AMBIENCE_FILES);
let ambKey = "";
let ambTimer = 0;
let lastOwl = 0;
let lastThunder = 0;
let lastGust = 0;
// Synthesized fallbacks, used only when a real loop couldn't be loaded.
let rainSrc: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let rainFilter: BiquadFilterNode | null = null;

function loadAmb(path: AmbienceFile): Promise<AudioBuffer | null> {
  // Belt and braces: never fetch a loop that isn't in the folder.
  if (!ambienceFiles.has(path)) return Promise.resolve(null);
  const done = ambBuf.get(path);
  if (done !== undefined) return Promise.resolve(done);
  let p = ambLoad.get(path);
  if (!p) {
    p = fetchBuffer(`${BASE}sounds/ambience/${path}.m4a`).then((b) => {
      if (b !== undefined) ambBuf.set(path, b);
      ambLoad.delete(path);
      emitStatus();
      return b ?? null;
    });
    ambLoad.set(path, p);
    emitStatus();
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
    const key = [next.night, next.rain, next.morning, next.storm, next.winter, next.season, next.windy, next.campfire, next.pond].map(String).join("|");
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
    // A campfire crackles louder at night, when everything else is quiet. Rain puts it out.
    const fire = amb.campfire && !amb.rain;
    setLayer(layers.fire, fire ? "fire" : null, LOOP_GAIN.fire * (amb.night ? 1 : 0.6));
    setLayer(layers.water, amb.pond ? "babbling_brook" : null, LOOP_GAIN.babbling_brook * (amb.rain ? 0.5 : 1));
    synthRain(amb.rain && layerFailed(layers.rain));
    if (!ambTimer) scheduleAmbience(400);
  } catch (err) {
    console.warn("[audio] ambience", err);
  }
}

function setLayer(l: Layer, path: AmbienceFile | null, level: number): void {
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
    if (amb.morning && !amb.rain && layerFailed(layers.day) && Math.random() < 0.22 && !ambFile("tweet", 0.3)) bird(t + rand(0, 0.5));
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
  const takes = TAKES.get(name);
  if (!takes) return false;
  warm(name);
  const ready = takes.filter((t) => fileBuf.get(t.file));
  if (!ready.length) return false;
  const t = ready[Math.floor(Math.random() * ready.length)]!;
  const gain = (FILE_GAIN[name] ?? 1) * (t.gain ?? 1);
  playAmbOneShot(fileBuf.get(t.file)!, volume * gain, clampRate((t.rate ?? 1) * rand(0.94, 1.04)));
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
