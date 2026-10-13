// Pure pixel work for the farm world: noise, palette parsing, the ground generator and a few
// procedural sprites. NO DOM in here (only `import type`), so it can be eyeballed from Node.

import type { Season } from "../../shared/calendar";
import type { Layout, Rect } from "./layout";

/** A plain RGBA pixel buffer (same layout as ImageData). */
export interface Px {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function newPx(width: number, height: number): Px {
  return { width, height, data: new Uint8ClampedArray(Math.max(1, width * height) * 4) };
}

// ---------- noise ----------

/** Integer hash -> [0, 1). Deterministic across machines. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function vnoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  const top = a + (b - a) * tx;
  const bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---------- colors & hand-drawn rows ----------

export type RGBA = [number, number, number, number];

const colorCache = new Map<string, RGBA>();

/** "#rgb", "#rrggbb", "#rrggbbaa", "rgb(r,g,b)" or "rgba(r,g,b,a)" -> [r,g,b,a(0..255)]. */
export function parseColor(c: string): RGBA {
  const hit = colorCache.get(c);
  if (hit) return hit;
  let out: RGBA = [255, 0, 255, 255];
  const s = c.trim();
  if (s[0] === "#") {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const v = [...hex].map((ch) => parseInt(ch + ch, 16));
      out = [v[0]!, v[1]!, v[2]!, v[3] ?? 255];
    } else {
      const v = (i: number) => parseInt(hex.slice(i, i + 2), 16);
      out = [v(0), v(2), v(4), hex.length >= 8 ? v(6) : 255];
    }
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) {
      const p = m[1]!.split(",").map((t) => parseFloat(t));
      out = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] === undefined ? 255 : Math.round(p[3] * 255)];
    }
  }
  colorCache.set(c, out);
  return out;
}

/** One char = one pixel ("." and " " transparent), like engine/pixelart.ts but DOM-free. */
export function rowsToPx(rows: readonly string[], pal: Readonly<Record<string, string>>): Px {
  const h = rows.length;
  const w = Math.max(1, ...rows.map((r) => r.length));
  const px = newPx(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === "." || ch === " ") continue;
      const col = pal[ch];
      if (!col) throw new Error(`rowsToPx: no color for "${ch}"`);
      const [r, g, b, a] = parseColor(col);
      const o = (y * w + x) * 4;
      px.data[o] = r;
      px.data[o + 1] = g;
      px.data[o + 2] = b;
      px.data[o + 3] = a;
    }
  }
  return px;
}

/** Alpha-composite `src` onto `dst` at (dx, dy). */
export function blitPx(dst: Px, src: Px, dx: number, dy: number, sx = 0, sy = 0, sw = src.width, sh = src.height): void {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const si = ((sy + y) * src.width + (sx + x)) * 4;
      const a = src.data[si + 3]!;
      if (a === 0) continue;
      const di = (ty * dst.width + tx) * 4;
      if (a === 255) {
        dst.data[di] = src.data[si]!;
        dst.data[di + 1] = src.data[si + 1]!;
        dst.data[di + 2] = src.data[si + 2]!;
        dst.data[di + 3] = 255;
      } else {
        const k = a / 255;
        const da = dst.data[di + 3]! / 255;
        const oa = k + da * (1 - k);
        for (let c = 0; c < 3; c++) {
          dst.data[di + c] = (src.data[si + c]! * k + dst.data[di + c]! * da * (1 - k)) / (oa || 1);
        }
        dst.data[di + 3] = oa * 255;
      }
    }
  }
}

export function cropPx(src: Px, x: number, y: number, w: number, h: number): Px {
  const out = newPx(w, h);
  blitPx(out, src, 0, 0, x, y, w, h);
  return out;
}

export function flipPx(src: Px): Px {
  const out = newPx(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width + x) * 4;
      const di = (y * src.width + (src.width - 1 - x)) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c]!;
    }
  }
  return out;
}

const lum = (r: number, g: number, b: number) => (r * 0.3 + g * 0.59 + b * 0.11) / 255;

/** Remap every opaque pixel through a dark->light color ramp by luminance (golden statue, ice...). */
export function rampPx(src: Px, ramp: readonly string[], opts: { minAlpha?: number; contrast?: number; bias?: number } = {}): Px {
  const out = newPx(src.width, src.height);
  const cols = ramp.map(parseColor);
  const minAlpha = opts.minAlpha ?? 1;
  const contrast = opts.contrast ?? 1;
  const bias = opts.bias ?? 0;
  for (let i = 0; i < src.data.length; i += 4) {
    const a = src.data[i + 3]!;
    if (a < minAlpha) continue;
    let l = lum(src.data[i]!, src.data[i + 1]!, src.data[i + 2]!);
    l = Math.min(1, Math.max(0, (l - 0.5) * contrast + 0.5 + bias));
    const c = cols[Math.min(cols.length - 1, Math.floor(l * cols.length))]!;
    out.data[i] = c[0];
    out.data[i + 1] = c[1];
    out.data[i + 2] = c[2];
    out.data[i + 3] = a;
  }
  return out;
}

/**
 * Winter: settle snow on every upward-facing edge (opaque pixel with transparency above it),
 * `depth` pixels deep, but only on pixels at least `minY` from the top.
 */
export function snowCapPx(src: Px, depth = 2, opts: { minY?: number; maxY?: number; chance?: number; seed?: number } = {}): Px {
  const out = newPx(src.width, src.height);
  out.data.set(src.data);
  const W = src.width;
  const snow = parseColor("#f4f8ff");
  const shade = parseColor("#c4d4ee");
  const minY = opts.minY ?? 0;
  const maxY = opts.maxY ?? src.height;
  for (let x = 0; x < W; x++) {
    for (let y = Math.max(0, minY); y < Math.min(src.height, maxY); y++) {
      const i = (y * W + x) * 4;
      if (src.data[i + 3]! < 200) continue;
      const above = y === 0 ? 0 : src.data[((y - 1) * W + x) * 4 + 3]!;
      if (above > 40) continue;
      if (opts.chance !== undefined && hash2(x, y, opts.seed ?? 3) > opts.chance) continue;
      for (let d = 0; d < depth && y + d < src.height; d++) {
        const j = ((y + d) * W + x) * 4;
        if (src.data[j + 3]! < 200) break;
        const c = d === depth - 1 && depth > 1 ? shade : snow;
        out.data[j] = c[0];
        out.data[j + 1] = c[1];
        out.data[j + 2] = c[2];
      }
    }
  }
  return out;
}

/** Multiply RGB of every pixel (tints, darkening). */
export function mulPx(src: Px, r: number, g: number, b: number): Px {
  const out = newPx(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    out.data[i] = src.data[i]! * r;
    out.data[i + 1] = src.data[i + 1]! * g;
    out.data[i + 2] = src.data[i + 2]! * b;
    out.data[i + 3] = src.data[i + 3]!;
  }
  return out;
}

/** Hue-shift pixels whose hue lies in [h0, h1] degrees (e.g. turn pink flowers orange for fall). */
export function hueShiftPx(src: Px, h0: number, h1: number, shift: number, satMul = 1): Px {
  const out = newPx(src.width, src.height);
  out.data.set(src.data);
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3]! === 0) continue;
    const r = src.data[i]! / 255;
    const g = src.data[i + 1]! / 255;
    const b = src.data[i + 2]! / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d < 0.12) continue;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const inRange = h0 <= h1 ? h >= h0 && h <= h1 : h >= h0 || h <= h1;
    if (!inRange) continue;
    const l = (max + min) / 2;
    const s = Math.min(1, (d / (1 - Math.abs(2 * l - 1) || 1)) * satMul);
    const nh = (h + shift + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const xx = c * (1 - Math.abs(((nh / 60) % 2) - 1));
    const m = l - c / 2;
    const seg = Math.floor(nh / 60);
    const [rr, gg, bb] = seg === 0 ? [c, xx, 0] : seg === 1 ? [xx, c, 0] : seg === 2 ? [0, c, xx] : seg === 3 ? [0, xx, c] : seg === 4 ? [xx, 0, c] : [c, 0, xx];
    out.data[i] = (rr + m) * 255;
    out.data[i + 1] = (gg + m) * 255;
    out.data[i + 2] = (bb + m) * 255;
  }
  return out;
}

// ---------- the ground ----------

/** Shapes that make up the dirt yard + paths. Values are "inside-ness" in pixels. */
export type GroundShape =
  | { kind: "rr"; x: number; y: number; w: number; h: number; r: number }
  | { kind: "cap"; ax: number; ay: number; bx: number; by: number; r: number };

function sdRoundRect(px: number, py: number, s: { x: number; y: number; w: number; h: number; r: number }): number {
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  const qx = Math.abs(px - cx) - (s.w / 2 - s.r);
  const qy = Math.abs(py - cy) - (s.h / 2 - s.r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  return s.r - outside;
}

function sdCapsule(px: number, py: number, s: { ax: number; ay: number; bx: number; by: number; r: number }): number {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / l2));
  return s.r - Math.hypot(px - (s.ax + dx * t), py - (s.ay + dy * t));
}

function shapeBounds(s: GroundShape): Rect {
  if (s.kind === "rr") return { x: s.x, y: s.y, w: s.w, h: s.h };
  const x0 = Math.min(s.ax, s.bx) - s.r;
  const y0 = Math.min(s.ay, s.by) - s.r;
  return { x: x0, y: y0, w: Math.abs(s.bx - s.ax) + s.r * 2, h: Math.abs(s.by - s.ay) + s.r * 2 };
}

/** The worn dirt: a yard where the farm machines stand, an apron at the barn door, and paths. */
export function groundShapes(l: Layout): GroundShape[] {
  const shapes: GroundShape[] = [];
  const objs = [l.loom, l.chest, l.mailbox, l.billboard];
  const xs = objs.map((p) => p.x);
  const ys = objs.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const door = l.barnDoor;
  const gate = l.gate;
  shapes.push({ kind: "rr", x: door.x - 21, y: l.barn.y + l.barn.h - 8, w: 42, h: 16, r: 6 });
  if (l.portrait) {
    shapes.push({ kind: "rr", x: minX - 17, y: minY - 13, w: maxX - minX + 34, h: maxY - minY + 24, r: 9 });
    shapes.push({ kind: "cap", ax: door.x + 14, ay: door.y + 1, bx: minX - 8, by: minY + 5, r: 5 });
  } else {
    shapes.push({ kind: "rr", x: minX - 19, y: minY - 15, w: maxX - minX + 38, h: maxY - minY + 27, r: 10 });
    shapes.push({ kind: "cap", ax: door.x - 6, ay: door.y + 2, bx: (minX + maxX) / 2 - 4, by: minY - 12, r: 5 });
  }
  // From the barn door out through the gate, then a sheep-trodden trail fading into the pasture.
  if (gate.side === "top") {
    shapes.push({ kind: "cap", ax: door.x, ay: door.y, bx: gate.x, by: gate.y, r: 7 });
    shapes.push({ kind: "cap", ax: gate.x, ay: gate.y - 2, bx: gate.x + 5, by: gate.y + 30, r: 6 });
    shapes.push({ kind: "cap", ax: gate.x + 5, ay: gate.y + 30, bx: gate.x + 15, by: gate.y + 50, r: 3.5 });
  } else {
    shapes.push({ kind: "cap", ax: door.x, ay: door.y, bx: gate.x, by: gate.y, r: 6 });
    shapes.push({ kind: "cap", ax: gate.x - 2, ay: gate.y, bx: gate.x + 30, by: gate.y + 5, r: 6 });
    shapes.push({ kind: "cap", ax: gate.x + 30, ay: gate.y + 5, bx: gate.x + 52, by: gate.y + 15, r: 3.5 });
  }
  return shapes;
}

/** Tile choices on the 16px grid of the Stardew outdoors sheets (identical layout every season). */
const LIGHT_TILES: readonly [number, number, number][] = [
  [0, 112, 30],
  [0, 176, 30],
  [32, 256, 14],
  [0, 96, 8],
  [80, 160, 7],
  [0, 208, 5],
  [32, 208, 5],
  [16, 96, 2],
  [32, 96, 2],
];
/** Winter's versions of a few detail tiles have odd blue corners, so winter sticks to these. */
const WINTER_TILES: readonly [number, number, number][] = [
  [0, 112, 30],
  [0, 176, 30],
  [32, 256, 14],
  [0, 96, 10],
  [16, 96, 4],
  [32, 96, 4],
];
const MED_TILES: readonly [number, number][] = [
  [16, 224],
  [32, 192],
];
const DIRT_TILE: readonly [number, number] = [48, 96];
/** Transparent bits to sprinkle around: mossy rock, flower plant, pebbles, blue flowers. */
const SCATTER_TILES: readonly [number, number, number][] = [
  [112, 144, 2],
  [112, 160, 2],
  [112, 176, 3],
  [112, 192, 2],
];
/** The atlas callers must cut from the outdoors sheet: (x, y, w, h) in sheet pixels. */
export const GROUND_ATLAS = { x: 0, y: 96, w: 128, h: 176 } as const;

interface SeasonLook {
  patch: number;
  patchTint: [number, number, number] | null;
  shadow1: [number, number, number];
  shadow2: [number, number, number];
  side: [number, number, number];
  lip: [number, number, number];
  /** Blend dirt toward this color (0..1 amount), e.g. packed snow instead of icy cyan. */
  dirtMix: [string, number] | null;
  /** Procedural fallback colors (grass light, grass dark, dirt) when the sheet is missing. */
  fallback: [string, string, string];
}

const LOOK: Record<Season, SeasonLook> = {
  spring: {
    patch: 0.64,
    patchTint: null,
    dirtMix: null,
    shadow1: [0.74, 0.69, 0.64],
    shadow2: [0.87, 0.83, 0.79],
    side: [0.93, 0.9, 0.88],
    lip: [0.7, 0.74, 0.72],
    fallback: ["#76b52e", "#4e8f2a", "#e8a83a"],
  },
  summer: {
    patch: 0.64,
    patchTint: null,
    dirtMix: null,
    shadow1: [0.74, 0.69, 0.64],
    shadow2: [0.87, 0.83, 0.79],
    side: [0.93, 0.9, 0.88],
    lip: [0.7, 0.74, 0.72],
    fallback: ["#9cc72a", "#6a9a22", "#e8a83a"],
  },
  fall: {
    patch: 0.7,
    patchTint: null,
    dirtMix: null,
    shadow1: [0.7, 0.64, 0.6],
    shadow2: [0.85, 0.8, 0.76],
    side: [0.92, 0.88, 0.86],
    lip: [0.72, 0.66, 0.62],
    fallback: ["#e08a2e", "#b4562a", "#c99a62"],
  },
  winter: {
    patch: 0.6,
    patchTint: [0.9, 0.94, 1],
    dirtMix: ["#e6f0fb", 0.4],
    shadow1: [0.82, 0.87, 0.96],
    shadow2: [0.91, 0.94, 0.98],
    side: [0.95, 0.97, 0.99],
    lip: [0.86, 0.9, 0.97],
    fallback: ["#f4f8ff", "#d6e4f6", "#bfe6f6"],
  },
};

export interface GroundInput {
  w: number;
  h: number;
  season: Season;
  seed: number;
  /** Pixels of GROUND_ATLAS cut from outdoors_<season>.png, or null for the procedural fallback. */
  atlas: Px | null;
  shapes: GroundShape[];
  /** Areas where no rocks/flowers get sprinkled (barn, machines, HUD, fence lines...). */
  avoid: Rect[];
}

export interface GroundOutput {
  px: Px;
  /** 1 where the ground is dirt/path (callers use it to keep grass tufts & forage off paths). */
  dirt: Uint8Array;
}

export function groundPixels(inp: GroundInput): GroundOutput {
  const { w, h, season, seed, atlas } = inp;
  const look = LOOK[season];
  const px = newPx(w, h);
  const out = px.data;
  const dirt = new Uint8Array(w * h);

  // 1) Dirt mask: union of shapes, with a jagged grassy edge.
  const bounds = inp.shapes.map(shapeBounds);
  for (let si = 0; si < inp.shapes.length; si++) {
    const b = bounds[si]!;
    const s = inp.shapes[si]!;
    const x0 = Math.max(0, Math.floor(b.x - 6));
    const y0 = Math.max(0, Math.floor(b.y - 6));
    const x1 = Math.min(w, Math.ceil(b.x + b.w + 6));
    const y1 = Math.min(h, Math.ceil(b.y + b.h + 6));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        if (dirt[i]) continue;
        const f = s.kind === "rr" ? sdRoundRect(x + 0.5, y + 0.5, s) : sdCapsule(x + 0.5, y + 0.5, s);
        if (f < -5) continue;
        const n = vnoise(x, y, 3, seed + 7) * 2 - 1;
        const n2 = vnoise(x, y, 9, seed + 9) * 2 - 1;
        if (f + n * 2.1 + n2 * 1.5 > 0) dirt[i] = 1;
      }
    }
  }

  const [fbLight, fbDark, fbDirt] = look.fallback.map(parseColor) as [RGBA, RGBA, RGBA];
  const tiles = season === "winter" ? WINTER_TILES : LIGHT_TILES;
  const tilesTotal = tiles.reduce((s, t) => s + t[2], 0);
  const mixCol = look.dirtMix ? parseColor(look.dirtMix[0]) : null;
  const mixK = look.dirtMix ? look.dirtMix[1] : 0;
  const AW = atlas?.width ?? 0;
  const sample = (tx: number, ty: number, x: number, y: number, o: number) => {
    // (tx, ty) = tile origin in sheet pixels.
    const ai = ((ty - GROUND_ATLAS.y + (y & 15)) * AW + (tx - GROUND_ATLAS.x + (x & 15))) * 4;
    const a = atlas!.data;
    out[o] = a[ai]!;
    out[o + 1] = a[ai + 1]!;
    out[o + 2] = a[ai + 2]!;
    out[o + 3] = 255;
  };

  // 2) Grass + darker patches + dirt with shaded edges.
  for (let y = 0; y < h; y++) {
    const ty = y >> 4;
    for (let x = 0; x < w; x++) {
      const tx = x >> 4;
      const o = (y * w + x) * 4;
      const i = y * w + x;
      const isDirt = dirt[i] === 1;
      if (!isDirt) {
        const n = vnoise(x, y, 42, seed + 3) * 0.75 + vnoise(x, y, 13, seed + 4) * 0.25;
        const patch = n > look.patch + (BAYER4[((y & 3) << 2) | (x & 3)]! / 16 - 0.5) * 0.06;
        if (atlas) {
          if (patch && !look.patchTint) {
            const t = MED_TILES[Math.floor(hash2(tx, ty, seed + 5) * MED_TILES.length)]!;
            sample(t[0], t[1], x, y, o);
          } else {
            let r = hash2(tx, ty, seed) * tilesTotal;
            let t = tiles[0]!;
            for (const cand of tiles) {
              r -= cand[2];
              if (r < 0) {
                t = cand;
                break;
              }
            }
            sample(t[0], t[1], x, y, o);
            if (patch && look.patchTint) {
              out[o] = out[o]! * look.patchTint[0];
              out[o + 1] = out[o + 1]! * look.patchTint[1];
              out[o + 2] = out[o + 2]! * look.patchTint[2];
            }
          }
        } else {
          const c = patch ? fbDark : fbLight;
          const speck = hash2(x, y, seed + 11);
          const k = speck < 0.12 ? 0.86 : speck > 0.94 ? 1.1 : 1;
          out[o] = c[0] * k;
          out[o + 1] = c[1] * k;
          out[o + 2] = c[2] * k;
          out[o + 3] = 255;
        }
        // Grass lip: the bottom edge of grass that hangs over dirt gets a darker outline.
        if (y < h - 1 && dirt[i + w] === 1) {
          out[o] = out[o]! * look.lip[0];
          out[o + 1] = out[o + 1]! * look.lip[1];
          out[o + 2] = out[o + 2]! * look.lip[2];
        }
      } else {
        if (atlas) {
          sample(DIRT_TILE[0], DIRT_TILE[1], x, y, o);
          if (mixCol) {
            out[o] = out[o]! + (mixCol[0] - out[o]!) * mixK;
            out[o + 1] = out[o + 1]! + (mixCol[1] - out[o + 1]!) * mixK;
            out[o + 2] = out[o + 2]! + (mixCol[2] - out[o + 2]!) * mixK;
          }
        } else {
          const speck = hash2(x, y, seed + 12);
          const k = speck < 0.1 ? 0.9 : 1;
          out[o] = fbDirt[0] * k;
          out[o + 1] = fbDirt[1] * k;
          out[o + 2] = fbDirt[2] * k;
          out[o + 3] = 255;
        }
        const up1 = y > 0 && dirt[i - w] === 0;
        const up2 = y > 1 && dirt[i - 2 * w] === 0;
        let m: [number, number, number] | null = null;
        if (up1) m = look.shadow1;
        else if (up2) m = look.shadow2;
        else if ((x > 0 && dirt[i - 1] === 0) || (x < w - 1 && dirt[i + 1] === 0)) m = look.side;
        if (m) {
          out[o] = out[o]! * m[0];
          out[o + 1] = out[o + 1]! * m[1];
          out[o + 2] = out[o + 2]! * m[2];
        } else if (hash2(x, y, seed + 21) < 0.0035 && x < w - 1 && y < h - 1 && dirt[i + 1] && dirt[i + w + 1]) {
          // A pebble: light top-left pixel pair, dark shadow bottom-right.
          for (const [dx, dy, k] of [
            [0, 0, 1.18],
            [1, 0, 1.12],
            [1, 1, 0.72],
          ] as const) {
            const oo = ((y + dy) * w + (x + dx)) * 4;
            if (oo + 2 < out.length) {
              out[oo] = Math.min(255, out[oo]! * k);
              out[oo + 1] = Math.min(255, out[oo + 1]! * k);
              out[oo + 2] = Math.min(255, out[oo + 2]! * k);
            }
          }
        }
      }
    }
  }

  // 3) Sprinkle rocks & flower plants (from the same atlas) on the grass.
  if (atlas) {
    const total = SCATTER_TILES.reduce((s, t) => s + t[2], 0);
    const count = Math.round((w * h) / 6500);
    const placed: { x: number; y: number }[] = [];
    let tries = 0;
    let k = 0;
    while (placed.length < count && tries < count * 25) {
      tries++;
      k++;
      const x = Math.floor(hash2(k, 1, seed + 31) * (w - 16));
      const y = Math.floor(hash2(k, 2, seed + 31) * (h - 16));
      if (inp.avoid.some((r) => x + 16 > r.x && x < r.x + r.w && y + 16 > r.y && y < r.y + r.h)) continue;
      if (placed.some((p) => Math.abs(p.x - x) < 22 && Math.abs(p.y - y) < 22)) continue;
      let onDirt = false;
      for (let yy = 0; yy < 16 && !onDirt; yy += 3) for (let xx = 0; xx < 16 && !onDirt; xx += 3) if (dirt[(y + yy) * w + (x + xx)]) onDirt = true;
      if (onDirt) continue;
      let r = hash2(k, 3, seed + 31) * total;
      let t = SCATTER_TILES[0]!;
      for (const cand of SCATTER_TILES) {
        r -= cand[2];
        if (r < 0) {
          t = cand;
          break;
        }
      }
      blitPx(px, atlas, x, y, t[0] - GROUND_ATLAS.x, t[1] - GROUND_ATLAS.y, 16, 16);
      placed.push({ x, y });
    }
  }

  return { px, dirt };
}

// ---------- procedural sprites ----------

type Pal = Record<string, string>;

/** A little fruit tree (32x46): blossoms in spring, cherries in summer, red leaves in fall, snowy twigs in winter. */
export function fruitTreePx(season: Season, seed = 77): Px {
  const W = 32;
  const H = 46;
  const px = newPx(W, H);
  const put = (x: number, y: number, col: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const [r, g, b, a] = parseColor(col);
    const o = (y * W + x) * 4;
    px.data[o] = r;
    px.data[o + 1] = g;
    px.data[o + 2] = b;
    px.data[o + 3] = a;
  };
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : px.data[(y * W + x) * 4 + 3]!);

  const bark: Pal = { o: "#3d2216", d: "#5e3620", m: "#8a5430", l: "#b07344" };
  // Ground shadow.
  for (let x = 8; x <= 23; x++) for (let y = 42; y <= 45; y++) {
    const dx = (x - 15.5) / 8;
    const dy = (y - 43.5) / 2.2;
    if (dx * dx + dy * dy <= 1) put(x, y, "rgba(40,20,60,0.25)");
  }
  // Trunk with a little root flare.
  for (let y = 22; y <= 43; y++) {
    const flare = y >= 41 ? 2 : y >= 39 ? 1 : 0;
    const x0 = 14 - flare;
    const x1 = 18 + flare;
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1;
      put(x, y, edge ? bark.o! : x === x0 + 1 ? bark.l! : x === x1 - 1 ? bark.d! : bark.m!);
    }
  }
  // A knot and some bark lines.
  put(16, 33, bark.d!);
  put(16, 34, bark.o!);
  put(17, 28, bark.d!);

  if (season === "winter") {
    // Bare branches reaching up (thick near the trunk), with snow resting on top.
    const branch = (x0: number, y0: number, dx: number, dy: number, len: number, thick: number) => {
      let x = x0;
      let y = y0;
      for (let i = 0; i < len; i++) {
        const rx = Math.round(x);
        const ry = Math.round(y);
        const t = i < len * 0.5 ? thick : 1;
        for (let k = 0; k < t; k++) put(rx + k, ry, k === 0 ? bark.l! : bark.m!);
        put(rx + t, ry, bark.o!);
        put(rx - 1, ry, bark.o!);
        x += dx;
        y += dy;
      }
    };
    branch(15, 23, 0, -1, 15, 3);
    branch(14, 23, -0.8, -1, 13, 2);
    branch(17, 23, 0.8, -1, 13, 2);
    branch(10, 17, -1, -0.5, 6, 1);
    branch(22, 17, 1, -0.5, 6, 1);
    branch(16, 13, -0.6, -1, 7, 1);
    branch(16, 13, 0.6, -1, 7, 1);
    branch(6, 13, -0.2, -1, 5, 1);
    branch(26, 13, 0.2, -1, 5, 1);
    branch(12, 9, -0.4, -1, 4, 1);
    branch(20, 9, 0.4, -1, 4, 1);
    // Outline branch tips and snow on top.
    const snowy = snowCapPx(px, 1, { maxY: 40 });
    px.data.set(snowy.data);
    return px;
  }

  // Canopy: a lumpy blob lit from the top-left.
  const cx = 16;
  const cy = 14;
  const R = 13;
  const pal: Record<Exclude<Season, "winter">, Pal> = {
    spring: { o: "#2b4a1c", d: "#3f7a2a", m: "#5ea83a", l: "#8fd14f", h: "#c6ec7a", x: "#ffb6d9", X: "#ff7fb6", w: "#fff0f6" },
    summer: { o: "#22401c", d: "#2f6a28", m: "#4a9a34", l: "#73c443", h: "#a8e06a", x: "#e8343c", X: "#a8141e", w: "#ffd0c0" },
    fall: { o: "#4a1a10", d: "#9a2e1a", m: "#d2522a", l: "#f08a34", h: "#ffc65a", x: "#ffe07a", X: "#c03a1a", w: "#fff0b0" },
  };
  const p = pal[season];
  const inside = (x: number, y: number) => {
    const dx = x + 0.5 - cx;
    const dy = (y + 0.5 - cy) * 1.12;
    const ang = Math.atan2(dy, dx);
    const r = R + Math.sin(ang * 6 + 0.6) * 1.3 + Math.sin(ang * 11) * 0.6;
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) continue;
      const dx = (x - cx) / R;
      const dy = (y - cy) / R;
      // Light from the top-left; clumpy leaf texture from noise.
      let shade = -dx * 0.45 - dy * 0.75 + (vnoise(x, y, 2.2, seed) - 0.5) * 0.9;
      shade += (vnoise(x, y, 5, seed + 1) - 0.5) * 0.5;
      const col = shade > 0.75 ? p.h! : shade > 0.25 ? p.l! : shade > -0.35 ? p.m! : p.d!;
      put(x, y, col);
    }
  }
  // Outline.
  const mask = new Uint8Array(W * 30);
  for (let y = 0; y < 30; y++) for (let x = 0; x < W; x++) mask[y * W + x] = inside(x, y) ? 1 : 0;
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      const edge = x === 0 || y === 0 || !mask[y * W + x - 1] || !mask[y * W + x + 1] || !mask[(y - 1) * W + x] || y === 29 || !mask[(y + 1) * W + x];
      if (edge) put(x, y, p.o!);
    }
  }
  // Fruit / blossoms / bright leaves sprinkled on the lit side.
  let placed = 0;
  for (let k = 0; k < 400 && placed < 11; k++) {
    const x = 4 + Math.floor(hash2(k, 0, seed + 5) * 24);
    const y = 3 + Math.floor(hash2(k, 1, seed + 5) * 22);
    if (!inside(x - 1, y - 1) || !inside(x + 2, y + 2)) continue;
    if (get(x, y) === 0) continue;
    let near = false;
    for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
      const o = ((y + yy) * W + (x + xx)) * 4;
      if (x + xx >= 0 && x + xx < W && y + yy >= 0 && y + yy < H && px.data[o]! === parseColor(p.x!)[0] && px.data[o + 1]! === parseColor(p.x!)[1]) near = true;
    }
    if (near) continue;
    placed++;
    if (season === "summer") {
      // Round cherry with a highlight.
      put(x, y, p.x!);
      put(x + 1, y, p.x!);
      put(x, y + 1, p.X!);
      put(x + 1, y + 1, p.X!);
      put(x, y, p.w!);
    } else if (season === "spring") {
      put(x, y, p.x!);
      put(x + 1, y, p.X!);
      put(x, y + 1, p.X!);
      put(x + 1, y + 1, p.x!);
      put(x, y - 1, p.w!);
    } else {
      put(x, y, p.x!);
      put(x + 1, y, p.x!);
      put(x, y + 1, p.X!);
    }
  }
  return px;
}

/** The pond (44x26): stones around an oval of water. Water frames are drawn live on top. */
export function pondPx(season: Season): { rim: Px; water: Px; mask: Uint8Array } {
  const W = 44;
  const H = 26;
  const rim = newPx(W, H);
  const water = newPx(W, H);
  const mask = new Uint8Array(W * H);
  const cx = W / 2;
  const cy = H / 2 + 0.5;
  const rx = W / 2 - 1;
  const ry = H / 2 - 1.5;
  const frozen = season === "winter";
  const put = (p: Px, x: number, y: number, col: string) => {
    const [r, g, b, a] = parseColor(col);
    const o = (y * W + x) * 4;
    p.data[o] = r;
    p.data[o + 1] = g;
    p.data[o + 2] = b;
    p.data[o + 3] = a;
  };
  const stone = ["#5b5468", "#8a8296", "#b4adbf", "#d6d0de"];
  const moss = season === "fall" ? "#c07a2e" : season === "winter" ? "#eef4ff" : "#6aa83a";
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const lump = (vnoise(x, y, 3, 91) - 0.5) * 0.14;
      if (d > 1 + lump) continue;
      const inner = d < 0.72 + lump * 0.5;
      if (!inner) {
        // Stones: lumpy cobbles lit from the top-left.
        const cell = vnoise(x, y, 2.6, 17);
        const lit = -dx * 0.3 - dy * 0.5 + (cell - 0.5) * 1.2;
        const edge = d > 0.95 + lump;
        let col = edge ? "#3a2f44" : lit > 0.45 ? stone[3]! : lit > 0 ? stone[2]! : lit > -0.45 ? stone[1]! : stone[0]!;
        if (!edge && hash2(x, y, 5) < 0.12 && dy < 0.2) col = moss;
        put(rim, x, y, col);
      } else {
        mask[y * W + x] = 1;
        // Deep in the middle, lighter at the edges; a shadow band under the top stones.
        const depth = 1 - d / 0.72;
        let col: string;
        if (frozen) col = dy < -0.45 ? "#9cc4e4" : depth > 0.5 ? "#cfe6f8" : "#b8d8f2";
        else col = dy < -0.42 ? "#2a5a8c" : depth > 0.55 ? "#2f6fa8" : depth > 0.25 ? "#3d86c2" : "#4f9ad2";
        put(water, x, y, col);
      }
    }
  }
  if (frozen) {
    // Ice shine streaks.
    for (let i = 0; i < 7; i++) {
      const x = 14 + i;
      const y = 9 + (i >> 1);
      if (mask[y * W + x]) put(water, x, y, "#ffffff");
    }
    for (let i = 0; i < 4; i++) {
      const x = 26 + i;
      const y = 15 + (i >> 1);
      if (mask[y * W + x]) put(water, x, y, "#eef8ff");
    }
  }
  return { rim, water, mask };
}

/** A stone pedestal for the golden sheep statue. */
export function pedestalPx(): Px {
  return rowsToPx(
    [
      "..oooooooooooooooooo..",
      ".oLLLLLLLLLLLLLLLLLLo.",
      "oLHHHHHHHHHHHHHHHHHHLo",
      "oMLLLLLLLLLLLLLLLLLLMo",
      "oooooooooooooooooooooo",
      ".oMMMMMMMMMMMMMMMMMMo.",
      ".oMDMMMMMMMMMMMMMMDMo.",
      ".oMMMMMMMMMMMMMMMMMMo.",
      ".oDDDDDDDDDDDDDDDDDDo.",
      "oooooooooooooooooooooo",
      ".ssssssssssssssssssss.",
    ],
    { o: "#3e3548", H: "#f2eef6", L: "#cfc8d8", M: "#a49cb2", D: "#7a7290", s: "rgba(40,20,60,0.25)" },
  );
}

/**
 * Winter barn: the grey-brown shingles (low saturation, warm hue) above `maxY` get a blanket of
 * snow, keeping the shingle texture as soft blue shading. Red walls & white trim are untouched.
 */
export function snowRoofPx(src: Px, maxY: number): Px {
  const out = newPx(src.width, src.height);
  out.data.set(src.data);
  const ramp = ["#5d6f94", "#a9bcdb", "#cbdaf0", "#e4edf9", "#f6f9ff", "#ffffff"].map(parseColor);
  for (let y = 0; y < Math.min(maxY, src.height); y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3]! < 200) continue;
      const r = src.data[i]! / 255;
      const g = src.data[i + 1]! / 255;
      const b = src.data[i + 2]! / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const l = r * 0.3 + g * 0.59 + b * 0.11;
      if (l > 0.82 || l < 0.1) continue; // white trim / outlines stay
      let hue = 0;
      if (max > min) {
        const d = max - min;
        hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        hue = (hue * 60 + 360) % 360;
      }
      const brownish = sat < 0.6 && hue >= 12 && hue <= 50;
      const greyish = sat < 0.18 && r >= b;
      if (!brownish && !greyish) continue; // red walls, doors, the metal vent
      const k = 1 + Math.min(ramp.length - 2, Math.max(0, Math.round(((l - 0.13) / 0.36) * (ramp.length - 2))));
      const c = ramp[k]!;
      out.data[i] = c[0];
      out.data[i + 1] = c[1];
      out.data[i + 2] = c[2];
    }
  }
  return out;
}
