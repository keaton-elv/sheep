// Art for the sky module: rain (real Stardew sheet, with a hand-copied fallback), cherry petals,
// tumbling leaves and ginkgo fans, snowflakes, frost sparkles, firefly glows, soft cloud shadows and
// fog banks.
// Everything is built ONCE at init and cached as canvases; the hot paths only drawImage().

import { rng } from "../engine/game";
import { makeCanvas, pixelArt, tinted, type Palette } from "../engine/pixelart";
import { REGIONS, SHEETS, spriteCanvas } from "../engine/sprites";
import { GINKGO_LEAF } from "./world-artdata";

// ---------- real sheet: rain.png (64x32 = 4x2 cells of 16x16) ----------
// Cell 0 is the falling streak, cells 1-3 the splash. Row 0 is a grey variant, row 1 a pale one.
SHEETS.rain = "sprites/rain.png";
for (let i = 0; i < 4; i++) {
  REGIONS[`weather.rain.${i}`] = { sheet: "rain", x: i * 16, y: 16, w: 16, h: 16 };
  REGIONS[`weather.rainGrey.${i}`] = { sheet: "rain", x: i * 16, y: 0, w: 16, h: 16 };
}

/** Where the streak's tip sits inside its 16x16 cell, and the splash centre inside its cell. */
export const RAIN_TIP = { x: 4, y: 15 };
export const SPLASH_CENTER = { x: 7, y: 8 };
/** The streak leans 7px left for every 15px down. */
export const RAIN_SLANT = -7 / 15;

const RAIN_PAL: Palette = {
  a: "rgba(219,238,246,0.52)",
  b: "rgba(218,238,246,0.64)",
  c: "rgba(218,239,245,0.78)",
  d: "rgba(239,255,255,0.87)",
  e: "rgba(218,238,244,0.35)",
  f: "rgba(232,255,255,0.78)",
  g: "rgba(214,238,244,0.17)",
  h: "rgba(239,255,255,0.67)",
};

const RAIN_FRAMES: string[][] = [
  ["...........a", "...........a", "..........a", "..........b", ".........b", ".........b", "........c", "........c", ".......c", ".......c", "......c", "......c", ".....c", ".....c", "....d", "....d"],
  ["", "", "", "", "", "", "", "......ef", "......fggf", "......effe", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "......ghg", ".....gfeffe", ".....heffeh", ".....gfeefg", "......ghhg", "", "", "", "", ""],
  ["", "", "", "", "", "..gefhg.ghhg", "....efhghfffg", "...h.gfgfeg", "....ghgfg.h.h", ".....hgefghg", ".....gfggfg", "......gffg", "", "", "", ""],
];

const pad16 = (rows: string[]) => rows.map((r) => r.padEnd(16, "."));

// ---------- hand-drawn particles ----------

// A cherry blossom petal (notched top, light from the top-left).
export const PETAL = [
  ".L.L.",
  "LWLPP",
  "LLPPo",
  ".PPo.",
  "..o..",
];

// A little leaf: tip top-right, stem bottom-left, vein down the middle.
export const LEAF = [
  "...ooo.",
  "..oLLDo",
  ".oLLDMo",
  "oLLDMMo",
  "oLDMMo.",
  "oDMMo..",
  "soo....",
];

export const PETAL_PALETTES: Record<string, Palette> = {
  pink: { o: "#c9577f", P: "#f39ac0", L: "#ffcde0", W: "#fff3f8" },
  blush: { o: "#d9839f", P: "#ffc3d8", L: "#ffe4ee", W: "#ffffff" },
};

export const LEAF_PALETTES: Record<string, Palette> = {
  orange: { o: "#9a3d12", L: "#ffb347", M: "#ea7d24", D: "#b9521a", s: "#6b3a1c" },
  red: { o: "#7c1f22", L: "#f2735a", M: "#d1412f", D: "#9c2a26", s: "#5e2a1a" },
  gold: { o: "#8a5a12", L: "#ffd96a", M: "#e9ab2f", D: "#b9801f", s: "#6b4a1c" },
  brown: { o: "#5c3418", L: "#c98a4b", M: "#a2622e", D: "#7a4520", s: "#4a2a14" },
  green: { o: "#2f5a26", L: "#a5d86a", M: "#6eae45", D: "#4a8436", s: "#3a4a1c" },
  lime: { o: "#3f6a1e", L: "#d2ec7a", M: "#9ccc4a", D: "#6c9e2e", s: "#4a4a1c" },
};

// Snowflakes: white, lit from the top-left, with a cool lavender-blue underside so they still read
// against Stardew's white winter ground (pure white flakes vanish on snow).
const FLAKE_PAL: Palette = { W: "#ffffff", L: "#dde8fb", B: "#9fb3df" };
export const FLAKES = [
  ["W", "B"],
  ["WL", "LB"],
  [".W.", "WWL", ".B."],
  ["W.W.L", ".WWL.", "WWWLB", ".WLB.", "L.B.B"],
];

// Frost glints: a white core, warm gold inner rays and sky-blue tips (the tips are what you see on
// white snow; the core is what you see on grass).
const SPARKLE_PAL: Palette = { W: "#ffffff", b: "#7fb6ec", c: "#bfe0ff", y: "#ffe7a0" };
export const SPARKLES = [
  [".b.", "bWb", ".b."],
  ["..b..", "..c..", "bcWcb", "..c..", "..b.."],
  ["...b...", "...y...", "..cWc..", "byWWWyb", "..cWc..", "...y...", "...b..."],
];

// ---------- helpers ----------

function rotate90(src: HTMLCanvasElement): HTMLCanvasElement {
  return makeCanvas(null, src.height, src.width, (ctx) => {
    ctx.translate(src.height, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(src, 0, 0);
  });
}

/** Four 90-degree turns: lossless pixel rotation, so a tumbling leaf stays crisp. */
function spinFrames(base: HTMLCanvasElement): HTMLCanvasElement[] {
  const r1 = rotate90(base);
  const r2 = rotate90(r1);
  const r3 = rotate90(r2);
  return [base, r1, r2, r3];
}

/** Soft radial stamp (for light holes and glows). Drawn scaled with smoothing on. */
export function radialStamp(size: number, stops: [number, string][]): HTMLCanvasElement {
  return makeCanvas(null, size, size, (ctx) => {
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  });
}

// ---------- the bundle ----------

export interface ParticleSet {
  frames: HTMLCanvasElement[];
  /** Half sizes per frame (integers) for centred drawing. */
  hw: number[];
  hh: number[];
}

export interface SkyArt {
  rain: HTMLCanvasElement[];
  rainGrey: HTMLCanvasElement[];
  /** Stardew 1.6's Green Rain (a summer easter egg): the pale drops, dyed green. */
  rainGreen: HTMLCanvasElement[];
  petals: ParticleSet[];
  leaves: Record<string, ParticleSet>;
  flakes: ParticleSet;
  sparkle: ParticleSet;
  /** White radial gradient used to punch light holes into the night. */
  hole: HTMLCanvasElement;
  firefly: HTMLCanvasElement;
  clouds: HTMLCanvasElement[];
  fog: HTMLCanvasElement;
}

function particleSet(keys: string[]): ParticleSet {
  const frames = keys.map((k) => spriteCanvas(k));
  return {
    frames,
    hw: frames.map((f) => Math.floor(f.width / 2)),
    hh: frames.map((f) => Math.floor(f.height / 2)),
  };
}

/** Register fallback art for a spinning particle, then read back (a real REGION wins if one is mapped). */
function spinSet(keyBase: string, rows: string[], pal: Palette): ParticleSet {
  const frames = spinFrames(pixelArt(null, rows, pal));
  const keys: string[] = [];
  frames.forEach((f, i) => {
    const key = `${keyBase}.${i}`;
    // registerArt via makeCanvas with a key keeps one source of truth in the sprite registry.
    makeCanvas(key, f.width, f.height, (ctx) => ctx.drawImage(f, 0, 0));
    keys.push(key);
  });
  return particleSet(keys);
}

/** Soft cloud shadow: a union of fuzzy puffs, drawn at half resolution (scaled up 2x with smoothing). */
function cloudShadow(seed: number, w: number, h: number): HTMLCanvasElement {
  const r = rng(seed);
  return makeCanvas(null, w, h, (ctx) => {
    const puffs = 7 + Math.floor(r() * 4);
    for (let i = 0; i < puffs; i++) {
      const t = (i + 0.5) / puffs;
      // Puffs follow a lumpy ellipse: bigger in the middle, smaller at the ends.
      const cx = w * (0.14 + 0.72 * t) + (r() - 0.5) * 8;
      const bulge = Math.sin(t * Math.PI);
      const cy = h * 0.55 + (r() - 0.5) * h * 0.3 - bulge * h * 0.08;
      // Keep every puff inside the canvas so no soft edge gets sliced flat.
      // (Never <= 0: createRadialGradient throws on a negative radius, and this runs at boot.)
      const rad = Math.max(1, Math.min((h * 0.22 + bulge * h * 0.2) * (0.8 + r() * 0.4), cx, w - cx, cy, h - cy));
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, "rgba(40,20,60,1)");
      grad.addColorStop(0.45, "rgba(40,20,60,0.8)");
      grad.addColorStop(1, "rgba(40,20,60,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
  });
}

/** A horizontally tileable bank of fog puffs (half resolution). */
function fogBank(seed: number, w: number, h: number): HTMLCanvasElement {
  const r = rng(seed);
  return makeCanvas(null, w, h, (ctx) => {
    const puffs = 26;
    for (let i = 0; i < puffs; i++) {
      const cx = r() * w;
      const cy = h * (0.35 + r() * 0.3);
      const rad = Math.max(1, Math.min(h * (0.22 + r() * 0.3), cy, h - cy));
      for (const ox of [-w, 0, w]) {
        const grad = ctx.createRadialGradient(cx + ox, cy, 0, cx + ox, cy, rad);
        grad.addColorStop(0, "rgba(238,238,248,0.5)");
        grad.addColorStop(0.6, "rgba(232,232,246,0.23)");
        grad.addColorStop(1, "rgba(232,232,246,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(cx + ox - rad, cy - rad, rad * 2, rad * 2);
      }
    }
  });
}

export function buildSkyArt(): SkyArt {
  // Rain fallbacks (the real sheet's REGIONS win when it loaded).
  RAIN_FRAMES.forEach((rows, i) => {
    pixelArt(`weather.rain.${i}`, pad16(rows), RAIN_PAL);
    const grey: Palette = {};
    for (const [k, v] of Object.entries(RAIN_PAL)) grey[k] = v.replace(/^rgba\(\d+,\d+,\d+/, "rgba(150,168,176");
    pixelArt(`weather.rainGrey.${i}`, pad16(rows), grey);
  });
  const rain = [0, 1, 2, 3].map((i) => spriteCanvas(`weather.rain.${i}`));
  const rainGrey = [0, 1, 2, 3].map((i) => spriteCanvas(`weather.rainGrey.${i}`));
  const rainGreen = rain.map((c) => tinted(null, c, "#9dffc8", 0.75));

  const petals = Object.entries(PETAL_PALETTES).map(([name, pal]) => spinSet(`weather.petal.${name}`, PETAL, pal));
  const leaves: Record<string, ParticleSet> = {};
  for (const [name, pal] of Object.entries(LEAF_PALETTES)) leaves[name] = spinSet(`weather.leaf.${name}`, LEAF, pal);
  // Golden ginkgo fans join the fall mix (the farm's ginkgo shares its leaves with the wind).
  leaves.ginkgo = spinSet("weather.leaf.ginkgo", GINKGO_LEAF.rows, GINKGO_LEAF.pal);

  FLAKES.forEach((rows, i) => pixelArt(`weather.flake.${i}`, rows, FLAKE_PAL));
  const flakes = particleSet(FLAKES.map((_, i) => `weather.flake.${i}`));
  SPARKLES.forEach((rows, i) => pixelArt(`weather.sparkle.${i}`, rows, SPARKLE_PAL));
  const sparkle = particleSet(SPARKLES.map((_, i) => `weather.sparkle.${i}`));

  const hole = radialStamp(64, [
    [0, "rgba(255,255,255,1)"],
    [0.3, "rgba(255,255,255,0.95)"],
    [0.6, "rgba(255,255,255,0.6)"],
    [0.82, "rgba(255,255,255,0.22)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const firefly = radialStamp(16, [
    [0, "rgba(246,255,190,1)"],
    [0.25, "rgba(222,255,120,0.75)"],
    [0.6, "rgba(170,230,80,0.22)"],
    [1, "rgba(150,220,60,0)"],
  ]);

  const clouds = [11, 23, 37].map((seed, i) => cloudShadow(seed, 96 + i * 14, 52 + i * 4));
  const fog = fogBank(7, 160, 40);

  return { rain, rainGrey, rainGreen, petals, leaves, flakes, sparkle, hole, firefly, clouds, fog };
}
