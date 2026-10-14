// The pond decoration, drawn with Stardew's real Fish Pond (fish_pond.png, cut from the raw sheet at
// its original coordinates): the stone rim, the water bed (a grey depth map, tinted here with the
// season's lake color from the outdoors tilesets) and the shimmer strip that drifts across it. The
// rim is trimmed 18px shallower at a mortar line on both sides, so it sits in a pasture of sheep.
// Without the sheet it falls back to the old hand-drawn pond (and the ducks stay away).
//
// Also the pond's place in the world, for everything that must keep off the water: onPond() (sheep
// targets, birds, forage), steerAround() (a sheep walks round the rim, not across), ripples, and the
// ?pond debug pond (pretend there's one; "?pond=0.3,0.5" puts it at that pasture fraction).

import type { Season } from "../../shared/calendar";
import type { Decoration } from "../../shared/types";
import { registerArt, SHEETS, sheet } from "../engine/sprites";
import { store } from "../net";
import type { Layout, Point, Rect } from "./layout";
import { getPond } from "./world-art";
import { hash2, newPx, parseColor, snowCapPx, type Px } from "./world-pixels";
import { pxCanvas, sheetPx } from "./world-sheets";

SHEETS.fishPond ??= "sprites/fish_pond.png";

const SRC = 80;
/** Rows 34-51 of the rim go (a mortar line on both sides lines up at 34 and 52), and the bed's too. */
const CUT_AT = 34;
const CUT = 18;
const SHIMMER = { x: 16, y: 160, w: 48, h: 7 } as const;

/** The bottom fence rail hides this much of the pasture (critter-place's FENCE_HIDE). */
const FENCE_HIDE = 16;

export interface PondArt {
  /** Real Stardew art (false = the hand-drawn stand-in: no ducks or turtle on that one). */
  real: boolean;
  w: number;
  h: number;
  rim: HTMLCanvasElement;
  /** The water (or ice in winter), drawn under the shimmer, ripples and rim. */
  bed: HTMLCanvasElement;
  shimmer: HTMLCanvasElement | null;
  /** 1 = open water you can see between the stones (w*h). */
  mask: Uint8Array;
  /** Bounding box of the open water, relative to the pond's top-left. */
  water: Rect;
}

// ---------- art ----------

/** Water bed grey -> color, per season: Stardew's lake colors (outdoors tilesets) plus deeper shades. */
const BED_LEVELS = [56, 101, 130, 198, 223, 242] as const;
const BED_PAL: Record<Season, readonly string[]> = {
  spring: ["#173c4c", "#1f4f60", "#27596b", "#326f86", "#3b7e96", "#4c859a"],
  summer: ["#0c4652", "#11606f", "#136b80", "#1b8ba0", "#199bb2", "#2cbbb3"],
  fall: ["#163e5c", "#1e5786", "#2369a0", "#3289b9", "#3898ca", "#4b9cca"],
  // Frozen over: pale blue ice, darker where the stones shade it.
  winter: ["#6f98c0", "#7fa6cb", "#8db3d6", "#b0cfe6", "#d2e6f3", "#f2f9ff"],
};

function bedColor(grey: number, pal: readonly string[]): [number, number, number] {
  let i = 0;
  while (i < BED_LEVELS.length - 1 && grey > BED_LEVELS[i + 1]!) i++;
  const lo = BED_LEVELS[i]!;
  const hi = BED_LEVELS[Math.min(i + 1, BED_LEVELS.length - 1)]!;
  const a = parseColor(pal[i]!);
  const b = parseColor(pal[Math.min(i + 1, pal.length - 1)]!);
  const k = hi === lo ? 0 : Math.max(0, Math.min(1, (grey - lo) / (hi - lo)));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Drop rows CUT_AT..CUT_AT+CUT of an 80x80 piece. */
function trimmed(src: Px): Px {
  const out = newPx(SRC, SRC - CUT);
  for (let y = 0; y < out.height; y++) {
    const sy = y < CUT_AT ? y : y + CUT;
    out.data.set(src.data.subarray(sy * SRC * 4, (sy + 1) * SRC * 4), y * SRC * 4);
  }
  return out;
}

function waterBox(mask: Uint8Array, w: number, h: number): Rect {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function buildReal(season: Season): PondArt | null {
  const rimSrc = sheetPx("fishPond", 0, 0, SRC, SRC);
  const bedSrc = sheetPx("fishPond", 0, SRC, SRC, SRC);
  if (!rimSrc || !bedSrc) return null;
  let rim = trimmed(rimSrc);
  const grey = trimmed(bedSrc);
  const w = rim.width;
  const h = rim.height;
  const bed = newPx(w, h);
  const mask = new Uint8Array(w * h);
  const pal = BED_PAL[season];
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (grey.data[o + 3]! < 128) continue;
    const [r, g, b] = bedColor(grey.data[o]!, pal);
    bed.data[o] = r;
    bed.data[o + 1] = g;
    bed.data[o + 2] = b;
    bed.data[o + 3] = 255;
    if (rim.data[o + 3]! === 0) mask[i] = 1;
  }
  const water = waterBox(mask, w, h);
  if (season === "winter") {
    // A few bright streaks across the ice, and snow settled on the stones.
    for (let s = 0; s < 4; s++) {
      const sx = water.x + 6 + Math.floor(hash2(s, 1, 0x1ce) * Math.max(1, water.w - 16));
      const sy = water.y + 6 + Math.floor(hash2(s, 2, 0x1ce) * Math.max(1, water.h - 12));
      const len = 3 + (s % 3);
      for (let k = 0; k < len; k++) {
        const x = sx + k;
        const y = sy - (k >> 1);
        if (x < w && y >= 0 && mask[y * w + x]) bed.data.set([255, 255, 255, 255], (y * w + x) * 4);
      }
    }
    rim = snowCapPx(rim, 2);
  }
  const sh = sheetPx("fishPond", SHIMMER.x, SHIMMER.y, SHIMMER.w, SHIMMER.h);
  return { real: true, w, h, rim: pxCanvas(rim), bed: pxCanvas(bed), shimmer: sh ? pxCanvas(sh) : null, mask, water };
}

function buildFallback(season: Season): PondArt {
  const p = getPond(season);
  return { real: false, w: p.w, h: p.h, rim: p.rim, bed: p.water, shimmer: null, mask: p.mask, water: waterBox(p.mask, p.w, p.h) };
}

const realArt = new Map<Season, PondArt>();
const handArt = new Map<Season, PondArt>();

/** The pond's art for a season (real once fish_pond.png has loaded, else the hand-drawn one). Cached. */
export function pondArt(season: Season): PondArt {
  const real = !!sheet("fishPond");
  const cache = real ? realArt : handArt;
  let a = cache.get(season);
  if (!a) {
    a = (real && buildReal(season)) || buildFallback(season);
    cache.set(season, a);
  }
  return a;
}

/** Rim over water: the placement ghost. */
export function pondPicture(season: Season): HTMLCanvasElement {
  const a = pondArt(season);
  const c = document.createElement("canvas");
  c.width = a.w;
  c.height = a.h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(a.bed, 0, 0);
  ctx.drawImage(a.rim, 0, 0);
  return c;
}

/**
 * The shop / toast / letter icon: the pond at half size. Each 2x2 block keeps its darkest pixel when
 * it holds an outline (so the stones stay crisp), else its top-left one. Replaces world-art's
 * hand-drawn icon once the real sheet is in.
 */
export function registerPondIcon(): void {
  const a = pondArt("spring");
  if (!a.real) return;
  const src = pondPicture("spring").getContext("2d")!.getImageData(0, 0, a.w, a.h).data;
  const W = Math.floor(a.w / 2);
  const H = Math.floor(a.h / 2);
  const out = newPx(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let pick = ((y * 2) * a.w + x * 2) * 4;
      let darkest = 999;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const o = ((y * 2 + dy) * a.w + x * 2 + dx) * 4;
          if (src[o + 3]! < 200) continue;
          const lum = src[o]! * 0.3 + src[o + 1]! * 0.6 + src[o + 2]! * 0.1;
          if (lum < 70 && lum < darkest) {
            darkest = lum;
            pick = o;
          }
        }
      }
      out.data.set(src.subarray(pick, pick + 4), (y * W + x) * 4);
    }
  }
  registerArt("decor.pond.0", pxCanvas(out));
}

// ---------- where the ponds are ----------

export interface PondSpot {
  id: string;
  /** Feet (bottom center), kept inside the pasture whatever the screen. */
  x: number;
  y: number;
  /** Top-left of the art. */
  left: number;
  top: number;
  w: number;
  h: number;
  hidden: boolean;
  debug: boolean;
  /** Stable per pond, for seeded choices (the turtle's favorite stone...). */
  seed: number;
}

const params = new URLSearchParams(location.search);
const DEBUG_ID = "debug-pond";
const debugAt: { fx: number; fy: number } | null = (() => {
  if (!params.has("pond")) return null;
  const m = /^([\d.]+),([\d.]+)$/.exec(params.get("pond") ?? "");
  return m ? { fx: Math.min(1, Number(m[1])), fy: Math.min(1, Number(m[2])) } : { fx: 0.4, fy: 0.45 };
})();

/** The ?pond debug pond, as a decoration that only exists on this screen (null without the flag). */
export function debugPond(): Decoration | null {
  return debugAt ? { id: DEBUG_ID, kind: "pond", fx: debugAt.fx, fy: debugAt.fy, variant: 0, createdAt: 0 } : null;
}

export function isDebugPond(id: string): boolean {
  return id === DEBUG_ID;
}

const hiddenIds = new Set<string>();
const pendingAt = new Map<string, { fx: number; fy: number }>();
let rev = 0;

/** While a pond is being moved it's hidden (its ducks lie low). */
export function setPondHidden(id: string, hidden: boolean): void {
  if (hidden === hiddenIds.has(id)) return;
  if (hidden) hiddenIds.add(id);
  else hiddenIds.delete(id);
  rev++;
}

/** Just moved: show it here until the server agrees (null to clear). */
export function setPondPending(id: string, at: { fx: number; fy: number } | null): void {
  if (at) pendingAt.set(id, at);
  else if (!pendingAt.delete(id)) return;
  rev++;
}

/** Feet of a pond at pasture fraction (fx, fy), clamped so the whole pond stays inside the fence. */
export function pondFeet(l: Layout, fx: number, fy: number, out: Point = { x: 0, y: 0 }): Point {
  const a = pondArt("spring");
  const pa = l.pasture;
  const x0 = pa.x - 6 + a.w / 2;
  const x1 = pa.x + pa.w + 6 - a.w / 2;
  const y0 = pa.y - 16 + a.h;
  const y1 = pa.y + pa.h - FENCE_HIDE - 2;
  const x = pa.x + fx * pa.w;
  const y = pa.y + fy * pa.h;
  out.x = Math.round(x1 < x0 ? (x0 + x1) / 2 : Math.max(x0, Math.min(x1, x)));
  out.y = Math.round(y1 < y0 ? (y0 + y1) / 2 : Math.max(y0, Math.min(y1, y)));
  return out;
}

let cache: { l: Layout; d: readonly Decoration[] | undefined; rev: number; real: boolean; spots: PondSpot[] } | null = null;

/** Every pond on the farm (the debug pond only while there's no real one). Cached; don't mutate. */
export function ponds(l: Layout): readonly PondSpot[] {
  const d = store.state?.decorations;
  const real = !!sheet("fishPond");
  if (cache && cache.l === l && cache.d === d && cache.rev === rev && cache.real === real) return cache.spots;
  const a = pondArt("spring");
  const spots: PondSpot[] = [];
  const add = (dec: Decoration, debug: boolean) => {
    const at = pendingAt.get(dec.id) ?? dec;
    const p = pondFeet(l, at.fx, at.fy);
    let seed = 7;
    for (let i = 0; i < dec.id.length; i++) seed = (seed * 31 + dec.id.charCodeAt(i)) >>> 0;
    spots.push({ id: dec.id, x: p.x, y: p.y, left: Math.round(p.x - a.w / 2), top: p.y - a.h, w: a.w, h: a.h, hidden: hiddenIds.has(dec.id), debug, seed });
  };
  for (const dec of d ?? []) if (dec.kind === "pond") add(dec, false);
  const dbg = debugPond();
  if (dbg && !spots.length) add(dbg, true);
  cache = { l, d, rev, real, spots };
  return spots;
}

/** The first pond that's out (the one the ducks and the turtle visit), or null. */
export function mainPond(l: Layout): PondSpot | null {
  for (const p of ponds(l)) if (!p.hidden) return p;
  return null;
}

/** Is world (x, y) on a pond (stones or water), give or take `pad` px? */
export function onPond(l: Layout, x: number, y: number, pad = 0): boolean {
  for (const p of ponds(l)) {
    if (p.hidden) continue;
    if (x >= p.left - pad && x <= p.left + p.w + pad && y >= p.top - pad && y <= p.top + p.h + pad) return true;
  }
  return false;
}

/** Is world (x, y) on open water of `p` (not the stones)? */
export function onWater(p: PondSpot, x: number, y: number, season: Season): boolean {
  const a = pondArt(season);
  const lx = Math.floor(x - p.left);
  const ly = Math.floor(y - p.top);
  return lx >= 0 && ly >= 0 && lx < a.w && ly < a.h && a.mask[ly * a.w + lx] === 1;
}

// ---------- walking round it ----------

/** How far sheep feet keep off the stones, and how wide a berth the corners give. */
const BLOCK_PAD = 3;
const CORNER_PAD = 3;
const steer = { x: 0, y: 0 };
const corner = { x: 0, y: 0 };

/** Liang-Barsky clip state for segHits (module-level: it runs per sheep per frame near a pond). */
let clipT0 = 0;
let clipT1 = 1;

function clip(p: number, q: number): boolean {
  if (p === 0) return q > 0;
  const t = q / p;
  if (p < 0) clipT0 = Math.max(clipT0, t);
  else clipT1 = Math.min(clipT1, t);
  return clipT0 < clipT1;
}

/** Does the segment (x0, y0)-(x1, y1) cross the open rectangle? */
function segHits(x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): boolean {
  clipT0 = 0;
  clipT1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  return clip(-dx, x0 - rx) && clip(dx, rx + rw - x0) && clip(-dy, y0 - ry) && clip(dy, ry + rh - y0);
}

/**
 * Where a sheep at (x, y) heading for `to` should aim right now: `to` itself, or the corner of the
 * pond in the way that makes for the shortest walk round it (a reused point: copy it if you keep it).
 * Corners nearer than 4px don't count, so it never aims at where it already stands (and with walking
 * steps under 4px, as the engine caps dt, it never "arrives" anywhere but `to`).
 */
export function steerAround(l: Layout, x: number, y: number, to: Point): Point {
  const list = ponds(l);
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (p.hidden) continue;
    const rx = p.left - BLOCK_PAD;
    const ry = p.top - BLOCK_PAD;
    const rw = p.w + BLOCK_PAD * 2;
    const rh = p.h + BLOCK_PAD * 2;
    // Already in it (it was put down on top of us) or headed into it: just go.
    if (x > rx && x < rx + rw && y > ry && y < ry + rh) continue;
    if (to.x > rx && to.x < rx + rw && to.y > ry && to.y < ry + rh) continue;
    if (!segHits(x, y, to.x, to.y, rx, ry, rw, rh)) continue;
    let best = Infinity;
    for (let c = 0; c < 4; c++) {
      corner.x = c & 1 ? rx + rw + CORNER_PAD : rx - CORNER_PAD;
      corner.y = c & 2 ? ry + rh + CORNER_PAD : ry - CORNER_PAD;
      const d0 = Math.hypot(corner.x - x, corner.y - y);
      if (d0 < 4 || segHits(x, y, corner.x, corner.y, rx, ry, rw, rh)) continue;
      const cost = d0 + Math.hypot(to.x - corner.x, to.y - corner.y);
      if (cost < best) {
        best = cost;
        steer.x = corner.x;
        steer.y = corner.y;
      }
    }
    if (best < Infinity) return steer;
  }
  return to;
}

// ---------- ripples ----------

interface Ripple {
  on: boolean;
  x: number;
  y: number;
  t: number;
  /** Seconds it lasts, and how far it spreads per second. */
  life: number;
  grow: number;
}

const RIPPLES: Ripple[] = Array.from({ length: 28 }, () => ({ on: false, x: 0, y: 0, t: 0, life: 1.3, grow: 4.5 }));

/** A ring spreading on the water at world (x, y). big = something landed (a duck, a turtle). */
export function ripple(x: number, y: number, big = false): void {
  let slot: Ripple | null = null;
  for (const r of RIPPLES) {
    if (!r.on) {
      slot = r;
      break;
    }
    if (!slot || r.t / r.life > slot.t / slot.life) slot = r;
  }
  if (!slot) return;
  slot.on = true;
  slot.x = x;
  slot.y = y;
  slot.t = 0;
  slot.life = big ? 1.6 : 1.3;
  slot.grow = big ? 7 : 4.5;
}

export function updateRipples(dt: number): void {
  for (const r of RIPPLES) {
    if (!r.on) continue;
    r.t += dt;
    if (r.t >= r.life) r.on = false;
  }
}

/** Draw the rings that fall on this pond's open water (pond top-left at left, top). */
export function drawRipples(ctx: CanvasRenderingContext2D, a: PondArt, left: number, top: number): void {
  ctx.fillStyle = "#b8e2ff";
  for (const r of RIPPLES) {
    if (!r.on) continue;
    const lx = r.x - left;
    const ly = r.y - top;
    if (lx < -10 || ly < -10 || lx > a.w + 10 || ly > a.h + 10) continue;
    const rad = 1 + r.t * r.grow;
    ctx.globalAlpha = Math.max(0, 1 - r.t / r.life) * 0.9;
    const n = rad > 6 ? 24 : 16;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2;
      const px = Math.round(lx + Math.cos(ang) * rad);
      const py = Math.round(ly + Math.sin(ang) * rad * 0.45);
      if (px >= 0 && py >= 0 && px < a.w && py < a.h && a.mask[py * a.w + px]) ctx.fillRect(left + px, top + py, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}
