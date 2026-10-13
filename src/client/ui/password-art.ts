// Title-screen art for the password gate.
// - The chunky "Papa Snickers's Sheep Farm" logo: hand-made glyph masks, carved at runtime with
//   a bevel, an outline and a 3D extrusion (see buildLogo).
// - The backdrop comes from Stardew's real title-screen pieces (clouds.png and title_screen.png):
//   the big cloud bank, the small drifting clouds, the leafy corner bushes (day / sunset / night
//   versions) and the little flapping birds. These two sheets are only needed here, so the gate
//   loads them itself instead of making every visit download them at boot. (title_screen.png also
//   holds the Stardew logo, buttons and other bits we never touch.)
// - Hand-drawn clouds and a bird stay registered as the fallback if the sheets can't load.

import { makeCanvas, pixelArt } from "../engine/pixelart";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The real title-screen sheets (paths relative to the app base). */
export const TITLE_SHEETS = {
  clouds: { src: "sprites/clouds.png", w: 512, h: 1002 },
  title: { src: "sprites/title_screen.png", w: 400, h: 655 },
} as const;

/** clouds.png pieces (rects verified against the sheet). */
export const TITLE_ART = {
  /** The towering cloud bank along the bottom of the title screen (its bottom fades out). */
  bank: { x: 14, y: 6, w: 480, h: 330 },
  /** Bright little cumulus clouds that drift across. */
  clouds: [
    { x: 152, y: 447, w: 123, h: 55 },
    { x: 410, y: 467, w: 64, h: 36 },
    { x: 0, y: 471, w: 149, h: 66 },
  ],
  /** Faint, far-away clouds (already translucent in the sheet). */
  faint: [
    { x: 260, y: 336, w: 168, h: 116 },
    { x: 115, y: 349, w: 123, h: 82 },
    { x: 20, y: 414, w: 82, h: 46 },
  ],
  /** Corner bushes, index 0 = day (green), 1 = sunset (red), 2 = night (blue). */
  bushLeft: [
    { x: 0, y: 554, w: 164, h: 142 },
    { x: 0, y: 707, w: 164, h: 142 },
    { x: 0, y: 860, w: 164, h: 142 },
  ],
  bushRight: [
    { x: 390, y: 543, w: 122, h: 153 },
    { x: 390, y: 696, w: 122, h: 153 },
    { x: 390, y: 849, w: 122, h: 153 },
  ],
} satisfies Record<string, Rect | Rect[]>;

/** title_screen.png: four frames of a little bird flapping, side by side (it faces left). */
export const TITLE_BIRD = { x: 296, y: 230, w: 26, h: 18, frames: 4 } as const;

// ---------- the logo ----------
//
// "Papa Snickers's" over "Sheep Farm", both lines in the same chunky letters, built from glyph
// masks at runtime: each line gets a bevel (white top edges, warm shadowed bottom edges, a
// two-tone fill), a dark outline, a 3D extrusion below, and an outer outline, so the lettering
// looks carved like Stardew's sign.

type Shade = "H" | "C" | "c" | "b" | "o" | "E" | "e" | "k";
type LogoPalette = Record<Shade, string>;

const GOLD: LogoPalette = { H: "#ffffff", C: "#fff3c4", c: "#ffe08a", b: "#f5b94a", o: "#7a3410", E: "#a8501c", e: "#6b2a0c", k: "#3b1505" };

interface Font {
  glyphs: Record<string, string[]>;
  cap: number;
  xHeight: number;
  descender: number;
  gap: number;
  space: number;
}

/**
 * Big chunky letters: 3px strokes, cap height 10, x-height 7. Every glyph was rendered and
 * checked for stray pixels: no lone dots inside a counter or at a stem/shoulder join (the old "h"
 * had one between its stem and its arch).
 */
const CHUNKY: Font = {
  cap: 10,
  xHeight: 7,
  descender: 3,
  gap: 2,
  space: 5,
  glyphs: {
    P: ["#######.", "########", "###..###", "###..###", "########", "#######.", "###.....", "###.....", "###.....", "###....."],
    S: [".######.", "########", "###..###", "###.....", "#######.", ".#######", ".....###", "###..###", "########", ".######."],
    F: ["#######", "#######", "###....", "###....", "######.", "######.", "###....", "###....", "###....", "###...."],
    h: ["###.....", "###.....", "###.....", "#######.", "########", "###..###", "###..###", "###..###", "###..###", "###..###"],
    k: ["###.....", "###.....", "###.....", "###..###", "###.###.", "######..", "######..", "###.###.", "###..###", "###..###"],
    i: ["###", "###", "...", "###", "###", "###", "###", "###", "###", "###"],
    a: [".######.", ".....###", ".#######", "########", "###..###", "########", ".#######"],
    c: [".######", "#######", "###....", "###....", "###....", "#######", ".######"],
    e: [".######.", "###..###", "########", "###.....", "###..###", "########", ".######."],
    m: ["##########.", "###########", "###.###.###", "###.###.###", "###.###.###", "###.###.###", "###.###.###"],
    n: ["#######.", "########", "###..###", "###..###", "###..###", "###..###", "###..###"],
    r: ["######.", "#######", "###..##", "###....", "###....", "###....", "###...."],
    s: [".######.", "########", "###.....", ".######.", ".....###", "########", ".######."],
    p: ["#######.", "########", "###..###", "###..###", "###..###", "########", "#######.", "###.....", "###.....", "###....."],
    "'": ["###", "###", ".##", ".#."],
  },
};

/** The top line: same letters, but the "p" of "Papa" has a shorter tail, so it just rests on the
 *  "S" of "Sheep" below instead of poking into it. */
const CHUNKY_TOP: Font = { ...CHUNKY, descender: 2, glyphs: { ...CHUNKY.glyphs, p: CHUNKY.glyphs.p!.slice(0, 9) } };

const DESCENDERS = new Set(["p"]);

/** Fill mask for one line of text. */
function lineMask(text: string, f: Font): { m: Uint8Array; w: number; h: number } {
  const placed: { x: number; y: number; g: string[] }[] = [];
  let x = 0;
  for (const ch of text) {
    const g = f.glyphs[ch];
    if (!g) {
      x += f.space;
      continue;
    }
    // Descenders first: a "p" is as tall as a capital, but it hangs below the baseline.
    const top = ch === "'" ? 0 : DESCENDERS.has(ch) ? f.cap - f.xHeight : g.length >= f.cap ? 0 : f.cap - g.length;
    placed.push({ x, y: top, g });
    x += Math.max(...g.map((r) => r.length)) + f.gap;
  }
  const w = Math.max(1, x - f.gap);
  const h = f.cap + f.descender;
  const m = new Uint8Array(w * h);
  for (const p of placed) {
    p.g.forEach((row, yy) => {
      for (let xx = 0; xx < row.length; xx++) if (row[xx] === "#") m[(p.y + yy) * w + p.x + xx] = 1;
    });
  }
  return { m, w, h };
}

/** A carved line: its canvas, plus which of its pixels are painted (1 = lettering). */
interface Carved {
  canvas: HTMLCanvasElement;
  solid: Uint8Array;
}

/** Outline + bevel + extrusion for a line mask, painted onto a new canvas. */
function carve(mask: { m: Uint8Array; w: number; h: number }, pal: LogoPalette, depth: number): Carved {
  const pad = 2;
  const w = mask.w + pad * 2;
  const h = mask.h + pad + depth + 2;
  const fill = new Uint8Array(w * h);
  for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) fill[(y + pad) * w + x + pad] = mask.m[y * mask.w + x]!;
  const at = (a: Uint8Array, x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? a[y * w + x]! : 0);
  const ring = new Uint8Array(w * h);
  const ext = new Uint8Array(w * h);
  const outer = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(fill, x, y)) continue;
      let near = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near |= at(fill, x + dx, y + dy);
      ring[y * w + x] = near;
    }
  }
  // The extrusion only hangs below each column's lowest letter pixel (fill or outline): inside a
  // counter or a notch (the mouth of a "c", the crook of a "k") it would read as stray pixels.
  const low = new Int16Array(w).fill(-1);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if (at(fill, x, y) || at(ring, x, y)) low[x] = y;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < low[x]! || at(fill, x, y) || at(ring, x, y)) continue;
      for (let d = 1; d <= depth; d++) {
        if (at(fill, x, y - d) || at(ring, x, y - d)) {
          ext[y * w + x] = 1;
          break;
        }
      }
    }
  }
  const solid = (x: number, y: number) => at(fill, x, y) | at(ring, x, y) | at(ext, x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      outer[y * w + x] = solid(x + 1, y) | solid(x - 1, y) | solid(x, y + 1) | solid(x, y - 1);
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const painted = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let shade: Shade | null = null;
      if (at(fill, x, y)) {
        if (!at(fill, x, y - 1)) shade = "H";
        else if (!at(fill, x, y + 1)) shade = "b";
        else shade = (y - pad) / Math.max(1, mask.h - 1) < 0.45 ? "C" : "c";
      } else if (at(ring, x, y)) shade = "o";
      else if (at(ext, x, y)) shade = at(ext, x, y + 1) ? "e" : "E";
      else if (at(outer, x, y)) shade = "k";
      if (!shade) continue;
      painted[y * w + x] = 1;
      ctx.fillStyle = pal[shade];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return { canvas: c, solid: painted };
}

/**
 * Logo size, which pixels are lettering (row-major, 1 = painted), and the top edge per column
 * (so the sheep and Snickers can sit on it without overlapping). Worked out from the glyph masks
 * rather than read back from the canvas: browsers' anti-fingerprinting can add noise to readbacks.
 */
export const LOGO = { w: 0, h: 0, tops: [] as number[], solid: new Uint8Array(0) };

function buildLogo(): void {
  const top = carve(lineMask("Papa Snickers's", CHUNKY_TOP), GOLD, 3);
  const bottom = carve(lineMask("Sheep Farm", CHUNKY), GOLD, 3);
  const tw = top.canvas.width;
  const bw = bottom.canvas.width;
  const w = Math.max(tw, bw);
  // Stack the lines as tightly as possible without any lettering touching: start with the top line's
  // outline resting on the bottom one's, then nudge "Sheep Farm" down until the tails of "Papa"'s p's
  // (and their extrusion) clear its letters, plus a pixel of breathing room.
  const bx = Math.floor((w - bw) / 2);
  const tx = Math.floor((w - tw) / 2);
  const touches = (oy: number): boolean => {
    for (let i = 0; i < top.solid.length; i++) {
      if (!top.solid[i]) continue;
      const x = tx + (i % tw) - bx;
      const y = Math.floor(i / tw) - oy;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (x < 0 || x >= bw || yy < 0 || yy >= bottom.canvas.height) continue;
        if (bottom.solid[yy * bw + x]) return true;
      }
    }
    return false;
  };
  let by = top.canvas.height - 3;
  while (touches(by) && by < top.canvas.height + 8) by++;
  const h = by + bottom.canvas.height;
  makeCanvas("ui.logo", w, h, (ctx) => {
    ctx.drawImage(bottom.canvas, bx, by);
    // The top line goes over the bottom one, so the tail of "Papa"'s p stays visible.
    ctx.drawImage(top.canvas, tx, 0);
  });
  const solid = new Uint8Array(w * h);
  const stamp = (line: Carved, ox: number, oy: number) => {
    const lw = line.canvas.width;
    for (let i = 0; i < line.solid.length; i++) {
      if (!line.solid[i]) continue;
      const x = ox + (i % lw);
      const y = oy + Math.floor(i / lw);
      if (x >= 0 && y >= 0 && x < w && y < h) solid[y * w + x] = 1;
    }
  };
  stamp(bottom, bx, by);
  stamp(top, tx, 0);
  const tops: number[] = [];
  for (let x = 0; x < w; x++) {
    let t = h;
    for (let y = 0; y < h; y++) {
      if (solid[y * w + x]) {
        t = y;
        break;
      }
    }
    tops.push(t);
  }
  LOGO.w = w;
  LOGO.h = h;
  LOGO.tops = tops;
  LOGO.solid = solid;
}

const CLOUD_PALETTE = { W: "#ffffff", w: "#eef7ff", s: "#d3e6f5", S: "#b9d3ea" };
const BIRD_PALETTE = { o: "#3b2a4a", w: "#6a587a" };

let registered = false;

export function registerPasswordArt(): void {
  if (registered) return;
  registered = true;

  buildLogo();

  pixelArt("ui.title.cloud.1", [
    "...............WWWWWW...WWWWWW..............",
    "..............WWWWWWWWWWWWWWWWWW............",
    ".............WWWWWWWWWWWWWWWWWWW............",
    "............WWWWWWWWWWWWWWWWWWWWWWWWW.......",
    "........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.....",
    "......WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW....",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW....",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW...",
    "....wWWWWWWWWWWWWWWWWWWWWWWWWwWWWWWWWWWWW...",
    "....wWWWWWWWWWWWWWWWWWWWWWWWWwwWWWWWWWWWWW..",
    "....swWWWWWWWWwwWWWWWWWWWWWWwswwwWWWWWWWWWw.",
    "....SwwwwwwwwwwwwwwwwwwwwwwwwSswwwwwwwwwwww.",
    ".....swwwwwwwwsswwwwwwwwwwwws.Ssswwwwwwwwws.",
    ".....SssssssssSSssssssssssssS..SSsssssssssS.",
    "......SSSSSSSS..SSSSSSSSSSSS.....SSSSSSSSS..",
    "............................................",
  ], CLOUD_PALETTE);

  pixelArt("ui.title.cloud.2", [
    "........................WWWWWWWWWW..........................",
    ".......................WWWWWWWWWWWW..WWWWWW.................",
    "...............WWWWWW.WWWWWWWWWWWWWWWWWWWWWWW...............",
    ".............WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW..............",
    "............WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.............",
    "...........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.............",
    "...........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW............",
    "..........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.........",
    "........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.......",
    "......WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW......",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW......",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.....",
    "....wWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwWWWWWWWWWWWW....",
    "....wWWWWWWWWWWWWWWWWwwWWWWWWWWWWWWWWwwwwwwwwWWWWWWWWWWWW...",
    "....swWWWWWWWWwwwwwwwwwWWWWWWWWWWWWWWwwwwwwswwwWWWWWWWWWWw..",
    "....SwwwwwwwwwwwwwwwwsswwwwwwwwwwwwwwssssssSswwwwwwwwwwwww..",
    ".....swwwwwwwwsssssssSSwwwwwwwwwwwwwwSSSSSS.Ssswwwwwwwwwws..",
    ".....SssssssssSSSSSSS..ssssssssssssss........SSssssssssssS..",
    "......SSSSSSSS.........SSSSSSSSSSSSSS..........SSSSSSSSSS...",
    "............................................................",
  ], CLOUD_PALETTE);

  pixelArt("ui.title.cloud.3", [
    ".............WWWW.............",
    "...........WWWWWWWW...........",
    "..........WWWWWWWWWWWWWW......",
    "......WWWWWWWWWWWWWWWWWWWW....",
    "....WWWWWWWWWWWWWWWWWWWWWW....",
    "....WWWWWWWWWWWWWWWWWWWWWWW...",
    "...wWWWWWWWWWWWWWWWWWWWWWWWW..",
    "...wwwwwwwwwwwwwwwwwwwwwwwwww.",
    "...swwwwwwwwwwwwwwwwwwwwwwwww.",
    "...Ssssssssssssssssssssssssss.",
    "....SSSSSSSSSSSSSSSSSSSSSSSSS.",
    "..............................",
  ], CLOUD_PALETTE);

  // Two-frame flapping bird (frames side by side, 8px each) for a CSS steps() animation.
  pixelArt("ui.title.bird", [
    "o.....o.........",
    "wo...ow..o...o..",
    ".wo.ow....ooo...",
    "..ooo......o....",
  ], BIRD_PALETTE);
}

// ---------- San Francisco, along the bottom of the title screen ----------
//
// Hand-drawn (procedurally, pixel by pixel), behind the corner bushes: the Golden Gate Bridge far
// off in the haze with the headlands and Mt. Tam behind it (Karl the Fog spilling over them), the
// city's pastel houses climbing its hills (Coit Tower and the Transamerica Pyramid out on wide
// screens), and Postcard Row (the Painted Ladies) with Alamo Square's lawn right in front. Every
// layer has day / dawn / dusk / night colors: after dark the towers are floodlit, the roadway's
// lamps and the city's windows come on, and the Ladies' bay windows glow. Plain fillRects only,
// seeded so the same screen always gets the same city (it's only repainted when the width changes).

export type TitlePhase = "dawn" | "day" | "dusk" | "night";

/** The bits of a 2D context the SF art uses. */
type Pen = Pick<CanvasRenderingContext2D, "fillRect"> & { fillStyle: CanvasRenderingContext2D["fillStyle"] };

type RGB = [number, number, number];
function rgbOf(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexOf([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1)}`;
}
/** `a` moved toward `b` by t (0..1). */
function mix(a: string, b: string, t: number): string {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return hexOf([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** A tiny seeded random (mulberry32), so the city and its lit windows don't change from visit to visit. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth hump: h at x = c, falling to 0 at c +- w. */
function hump(x: number, c: number, w: number, h: number): number {
  const d = (x - c) / w;
  return d <= -1 || d >= 1 ? 0 : h * (0.5 + 0.5 * Math.cos(Math.PI * d));
}

// ----- the bay: headlands, Mt. Tam, the water and the bridge -----

/** The bay canvas height, and where things sit in it (rows from the bottom). */
export const BAY = {
  h: 150,
  /** The water line. */
  water: 92,
  /** Main span between the towers' centers, and tower height above the water. */
  span: 112,
  tower: 44,
  /** The roadway's height above the water. */
  deck: 12,
} as const;

interface BayColors {
  far: string;
  farTop: string;
  hill: string;
  hillTop: string;
  hillShade: string;
  water: string;
  shine: string;
  lit: string;
  shade: string;
  dark: string;
  cable: string;
  hanger: string;
  pier: string;
  lamp: string | null;
}

const BAY_COLORS: Record<TitlePhase, BayColors> = {
  day: {
    far: "#b3d0de", farTop: "#c3dbe6", hill: "#93b9b9", hillTop: "#a6c7c3", hillShade: "#85adb0",
    water: "#a9d2ea", shine: "#d2ecf8",
    lit: "#d8604a", shade: "#b0483e", dark: "#8c3c3c", cable: "#b44e44", hanger: "#cf968e", pier: "#a3b6c2", lamp: null,
  },
  dawn: {
    far: "#cdb8cf", farTop: "#dac7d8", hill: "#ab9cb4", hillTop: "#bcaec2", hillShade: "#9e90aa",
    water: "#ecc8cc", shine: "#fbe2dc",
    lit: "#dc664e", shade: "#b44c44", dark: "#8e4048", cable: "#b8524a", hanger: "#d6a0a0", pier: "#c4b4c4", lamp: null,
  },
  dusk: {
    far: "#b6809c", farTop: "#c48ea6", hill: "#8f5f84", hillTop: "#9e6c8e", hillShade: "#835578",
    water: "#f0aa8c", shine: "#ffd4a6",
    lit: "#bc4a40", shade: "#923840", dark: "#6c2c40", cable: "#9e4044", hanger: "#bf7480", pier: "#9a7090", lamp: "#ffcf86",
  },
  night: {
    far: "#2c3368", farTop: "#343c72", hill: "#232a5a", hillTop: "#2a3262", hillShade: "#1f2552",
    water: "#2c3572", shine: "#4c5898",
    // Floodlit towers, glowing roadway lights.
    lit: "#eda05c", shade: "#bf6e40", dark: "#5c3444", cable: "#a2643e", hanger: "#5a3e52", pier: "#3c4276", lamp: "#ffd27a",
  },
};

/**
 * The Golden Gate in the haze: Mt. Tam and the East Bay hills far behind, the headlands on both
 * shores, the water, and the bridge, centered on column `cx` of a w x BAY.h canvas.
 */
export function paintBay(ctx: Pen, w: number, cx: number, phase: TitlePhase): void {
  const C = BAY_COLORS[phase];
  const H = BAY.h;
  const wy = H - BAY.water; // the water line (top-down row)
  const put = (x: number, y: number, ww: number, hh: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, ww, hh);
  };

  // Far hills: Mt. Tam's long ridge up behind the north (right) shore, low East Bay hills
  // through the gap, and a soft roll along both sides for wide screens.
  const far = (x: number) => {
    const d = x - cx;
    return Math.round(
      hump(d, 150, 120, 30) + hump(d, 205, 50, 6) + hump(d, 92, 70, 12) + hump(d, -10, 90, 7) + hump(d, -150, 120, 10) + 3 + 2 * Math.sin(x * 0.021),
    );
  };
  // The headlands: the Presidio bluff on the left, the Marin headlands (taller) on the right,
  // open water under the main span.
  const nearRaw = (x: number) => {
    const d = x - cx;
    const marin = hump(d, 116, 34, 21) + hump(d, 160, 48, 15) + hump(d, 228, 70, 9);
    const presidio = hump(d, -112, 30, 13) + hump(d, -160, 50, 8) + hump(d, -240, 80, 5);
    return marin + presidio + (Math.abs(d) > 120 ? Math.max(0, 2 * Math.sin(x * 0.05)) : 0);
  };
  const near = (x: number) => Math.round(nearRaw(x));
  const fogTint = phase === "night" ? "rgba(150,162,214,0.22)" : phase === "dusk" ? "rgba(255,226,214,0.3)" : "rgba(255,255,255,0.34)";
  for (let x = 0; x < w; x++) {
    const f = far(x);
    if (f > 0) {
      put(x, wy - f, 1, f, C.far);
      put(x, wy - f, 1, 1, C.farTop);
    }
    const n = near(x);
    if (n > 0) {
      // The slopes facing away from the (left) light are a shade darker.
      const away = nearRaw(x + 2) - nearRaw(x - 2) < -0.6;
      put(x, wy - n, 1, n, away ? C.hillShade : C.hill);
      put(x, wy - n, 1, 1, C.hillTop);
      // Karl the Fog, spilling over the Marin headlands: soft, dithered, see-through.
      const d = x - cx;
      const blanket = Math.round(hump(d, 150, 64, 5) + hump(d, 210, 36, 3));
      for (let k = 0; k < blanket; k++) {
        const y = wy - n + 1 - k;
        if (k >= blanket - 2 && (x + y) % 2) continue;
        ctx.fillStyle = fogTint;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // The water, with a few glints.
  put(0, wy, w, H - wy, C.water);
  const rnd = seeded(7);
  for (let y = wy + 2; y < H; y += 3) {
    for (let x = Math.floor(rnd() * 20); x < w; x += 14 + Math.floor(rnd() * 26)) put(x, y, 2 + Math.floor(rnd() * 4), 1, C.shine);
  }

  // ----- the bridge -----
  const deckY = wy - BAY.deck; // the roadway's top row
  const topY = wy - BAY.tower; // the towers' top row
  const half = BAY.span / 2;
  const anchor = half + 36; // where the side-span cables come down
  const roadEnd = anchor + 12;

  // Cables first (towers and roadway go over them).
  let prev = -1;
  const cable = (x: number, y: number) => {
    // Keep the line connected: fill straight down/up to the last column's height.
    const y0 = prev < 0 ? y : Math.min(prev + 1, y);
    const y1 = prev < 0 ? y : Math.max(prev - 1, y);
    put(x, Math.min(y0, y), 1, Math.abs(y1 - y0) + 1, C.cable);
    prev = y;
  };
  // Main span: a parabola from tower top to tower top, nearly touching the road in the middle.
  const sag = deckY - 2 - (topY + 1);
  const mainY = (x: number) => Math.round(topY + 1 + sag * (1 - ((x - cx) / half) ** 2));
  prev = -1;
  for (let x = cx - half; x <= cx + half; x++) cable(x, mainY(x));
  // Side spans: down from each tower top to its anchorage, with a gentle sag.
  const sideY = (t: number) => Math.round(topY + 1 + (deckY - 1 - (topY + 1)) * t + 3 * t * (1 - t));
  for (const dir of [-1, 1]) {
    prev = -1;
    for (let i = 0; i <= anchor - half; i++) cable(cx + dir * (half + i), sideY(i / (anchor - half)));
  }
  // Hangers: the fine vertical lines from the cables down to the road.
  for (let x = cx - half + 3; x <= cx + half - 3; x += 3) {
    const y = mainY(x) + 1;
    if (y < deckY) put(x, y, 1, deckY - y, C.hanger);
  }
  for (const dir of [-1, 1]) {
    for (let i = 3; i < anchor - half - 2; i += 3) {
      const y = sideY(i / (anchor - half)) + 1;
      if (y < deckY) put(cx + dir * (half + i), y, 1, deckY - y, C.hanger);
    }
  }

  // The roadway, its truss, and the approach piers on each shore.
  put(cx - roadEnd, deckY, roadEnd * 2 + 1, 1, C.lit);
  put(cx - roadEnd, deckY + 1, roadEnd * 2 + 1, 1, C.dark);
  for (const dir of [-1, 1]) {
    for (const off of [anchor, anchor + 6, anchor + 11]) {
      const x = cx + dir * off;
      const ground = wy - near(x);
      if (ground > deckY + 2) put(x, deckY + 2, 1, ground - deckY - 2, C.dark);
    }
    // The anchorage block where the cables come down.
    put(cx + dir * anchor - 1, deckY - 1, 3, 4, C.pier);
  }

  // The towers: two legs tied by portal struts, on concrete piers.
  for (const dir of [-1, 1]) {
    const tx = cx + dir * half; // tower center column
    const l = tx - 3;
    put(tx - 4, wy - 3, 8, 3, C.pier);
    put(l, topY, 2, wy - 3 - topY, C.lit); // the sunny leg
    put(l + 4, topY, 2, wy - 3 - topY, C.shade); // the shaded leg
    put(l + 2, topY + 2, 2, wy - 3 - topY - 2, mix(C.dark, C.far, 0.25)); // see-through gap (dim)
    // Portal struts: a deep cap, then lighter ones stepping down to the road.
    put(l, topY, 6, 2, C.lit);
    put(l + 1, topY - 1, 4, 1, C.shade); // the cap's little crown
    for (const s of [9, 17, 24]) put(l + 2, topY + s, 2, 1, C.lit);
    put(l + 2, deckY + 6, 2, 1, C.shade); // a strut under the road
    // Each leg steps in a little as it rises (the towers' setbacks).
    put(l, topY + 2, 1, 6, C.shade);
    put(l + 5, topY + 2, 1, 6, C.dark);
  }

  // The roadway's lamps after dark (the towers' red beacons blink in password.css).
  if (C.lamp) {
    for (let x = cx - roadEnd + 1; x <= cx + roadEnd; x += 3) put(x, deckY - 1, 1, 1, C.lamp);
  }
}

// ----- the fog -----

/** Karl the Fog: a long, soft wisp that drifts through the Gate (w x h, mostly see-through). */
export function paintFog(ctx: Pen, w: number, h: number, phase: TitlePhase, seed: number): void {
  const base = { day: [255, 255, 255], dawn: [255, 236, 232], dusk: [255, 222, 206], night: [160, 172, 222] }[phase];
  const rnd = seeded(seed);
  const lumps = Array.from({ length: 5 }, () => ({ c: rnd() * w, wd: w * (0.15 + rnd() * 0.25), hh: h * (0.5 + rnd() * 0.5) }));
  const mid = Math.floor(h * 0.62);
  for (let x = 0; x < w; x++) {
    // Thicker in the middle, wispy at the ends, with a few lumps on top.
    const env = Math.sin((Math.PI * (x + 0.5)) / w) ** 0.8;
    let up = h * 0.25 * env;
    for (const k of lumps) up = Math.max(up, hump(x, k.c, k.wd, k.hh) * env);
    const down = (h - mid) * env;
    const top = Math.round(mid - up);
    const bot = Math.round(mid + down);
    for (let y = top; y < bot; y++) {
      const edge = Math.min(y - top, bot - 1 - y);
      // Dithered edges, a denser core.
      const a = edge <= 0 ? ((x + y) % 2 ? 0 : 0.28) : edge === 1 ? 0.34 : 0.46;
      if (!a) continue;
      ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${a * Math.min(1, env * 1.6)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ----- the city -----

/** The rooftops canvas height (rows from the bottom). */
export const CITY_H = 90;

interface CityLight {
  /** The air the far-off houses fade into, and how much. */
  haze: string;
  amount: number;
  /** Window dots: unlit, lit, and the share that are lit. */
  win: string;
  lit: string;
  litShare: number;
}
const CITY_LIGHT: Record<TitlePhase, CityLight> = {
  day: { haze: "#b2c9db", amount: 0.6, win: "#8fa9c0", lit: "#8fa9c0", litShare: 0 },
  dawn: { haze: "#cdb5ca", amount: 0.62, win: "#a993ae", lit: "#ffd9a6", litShare: 0.05 },
  dusk: { haze: "#a07294", amount: 0.68, win: "#7e5878", lit: "#ffc27a", litShare: 0.2 },
  night: { haze: "#202657", amount: 0.84, win: "#191e47", lit: "#f3c46a", litShare: 0.3 },
};

/** San Francisco's houses come in every pastel (and white). */
const CITY_PASTELS = ["#ffffff", "#fff0c4", "#ffd6de", "#d6eaff", "#dcf2d4", "#efe0ff", "#ffe2c8", "#ffffff"];

/**
 * The city on its hills: rows of little pastel houses climbing up and down, a few trees, Coit
 * Tower on Telegraph Hill and the Transamerica Pyramid downtown (for wide screens), all in haze.
 */
export function paintCity(ctx: Pen, w: number, cx: number, phase: TitlePhase): void {
  const C = CITY_LIGHT[phase];
  const H = CITY_H;
  const haze = (c: string, more = 0) => mix(c, C.haze, Math.min(1, C.amount + more));
  const put = (x: number, y: number, ww: number, hh: number, c: string) => {
    if (ww <= 0 || hh <= 0) return;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, ww, hh);
  };
  const lit = (r: number) => r < C.litShare;
  // The skyline's hills (rows above the bottom), always from the same origin so the city is the
  // same city whatever the width.
  const hill = (x: number) => {
    const d = x - cx;
    return (
      44 +
      5 * Math.sin(x * 0.0093 + 0.7) +
      4 * Math.sin(x * 0.027 + 2.1) +
      hump(d, -150, 80, 9) + // Pacific Heights
      hump(d, 196, 34, 12) + // Telegraph Hill
      hump(d, 120, 40, 6) - // Russian Hill
      hump(d, 30, 70, 6) // down toward the Marina
    );
  };
  const treeish = (x: number) => {
    const d = x - cx;
    return hump(d, -64, 52, 0.8) + hump(d, -420, 90, 0.7) + 0.08; // the Presidio, Golden Gate Park
  };
  const TREE = haze("#5f9a6a", -0.08);
  const TREE_TOP = haze("#86bb84", -0.08);
  // (Far enough left to start off-screen even on a very wide, very short window.)
  const origin = cx - 1600 * Math.max(1, Math.ceil((cx + 8) / 1600));
  const rnd = seeded(1906);

  /** One row of houses along the hill, `down` rows below its crest. */
  const row = (down: number) => {
    let x = origin - Math.floor(rnd() * 6);
    while (x < w) {
      const hw = 4 + Math.floor(rnd() * 6);
      const hh = 4 + Math.floor(rnd() * 4);
      const r1 = rnd();
      const r2 = rnd();
      const r3 = rnd();
      if (x + hw >= 0) {
        const base = H - Math.round(hill(x + hw / 2) - down * 5);
        if (r1 < treeish(x) * 0.6) {
          // A tree: a round, lumpy crown.
          const tw = hw + 1;
          put(x, base - hh - 1, tw, H, TREE);
          put(x + 1, base - hh - 2, tw - 2, 1, TREE);
          put(x + 1, base - hh - 2, Math.max(1, tw - 4), 1, TREE_TOP);
          put(x, base - hh - 1, 2, 1, TREE_TOP);
        } else {
          const body = haze(CITY_PASTELS[Math.floor(r2 * CITY_PASTELS.length)]!);
          const top = base - hh;
          put(x, top, hw, H, body);
          put(x, top, hw, 1, mix(body, phase === "night" ? "#4a5290" : "#ffffff", 0.4)); // sunny roof edge
          put(x + hw - 1, top + 1, 1, H, mix(body, C.haze, 0.5)); // its shady side
          // A window (two on the wider houses), sometimes none.
          if (r3 > 0.15) {
            const wy = top + 2 + (r3 > 0.6 ? 1 : 0);
            put(x + 1 + Math.floor(r3 * 3) % Math.max(1, hw - 2), wy, 1, 1, lit(r3) ? C.lit : C.win);
            if (hw >= 7) put(x + hw - 3, wy, 1, 1, lit((r3 * 7.3) % 1) ? C.lit : C.win);
          }
        }
      }
      x += hw;
    }
  };

  // Back rows first (up on the crest), each next row a step lower and in front.
  const rows = Math.ceil(70 / 5);
  for (let down = 0; down < rows; down++) {
    row(down);
    if (down === 0) landmarks(ctx, cx, H - Math.round(hill(cx + 196)), H - Math.round(hill(cx + 300)), haze, phase);
  }
}

/** Coit Tower on Telegraph Hill and the Transamerica Pyramid, tiny and hazy, right of the bridge. */
function landmarks(ctx: Pen, cx: number, coitBase: number, pyramidBase: number, haze: (c: string, more?: number) => string, phase: TitlePhase): void {
  const put = (x: number, y: number, ww: number, hh: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, ww, hh);
  };
  const stone = haze("#fbf3e0", -0.15);
  const stoneShade = haze("#cfc4b0", -0.15);
  // Coit Tower: a fluted column with a crown of arches.
  const tx = cx + 196;
  put(tx - 2, coitBase - 15, 4, 15, stone);
  put(tx + 1, coitBase - 15, 1, 15, stoneShade);
  put(tx - 3, coitBase - 17, 6, 2, stone);
  put(tx - 2, coitBase - 18, 4, 1, stoneShade);
  put(tx - 1, coitBase - 16, 1, 1, phase === "night" ? "#f3c46a" : stoneShade);
  // The Transamerica Pyramid with its downtown neighbors.
  const px = cx + 300;
  const tower = haze("#dfe8f0", -0.1);
  const towerShade = haze("#aebdcc", -0.1);
  for (const [dx, tw, th] of [
    [-16, 7, 22],
    [-9, 6, 28],
    [8, 8, 25],
    [16, 6, 18],
  ] as const) {
    put(px + dx, pyramidBase - th, tw, th, tower);
    put(px + dx + tw - 1, pyramidBase - th, 1, th, towerShade);
    for (let y = pyramidBase - th + 2; y < pyramidBase; y += 3) put(px + dx + 1, y, tw - 3, 1, towerShade);
  }
  const ph = 40;
  for (let y = 0; y < ph; y++) {
    const half = Math.floor((y / ph) * 4);
    put(px - half, pyramidBase - ph + y, half * 2 + 1, 1, stone);
    if (half) put(px + half, pyramidBase - ph + y, 1, 1, stoneShade);
  }
  put(px, pyramidBase - ph - 4, 1, 4, stone); // the spire
  if (phase === "night" || phase === "dusk") put(px, pyramidBase - ph - 5, 1, 1, "#ff6a5a");
}

// ----- Postcard Row -----

/** One Painted Lady's width (they stand shoulder to shoulder) and the lowest one's peak. */
const LADY_W = 24;
const LADY_H = 58;
/** How far each house steps down the hill from the one on its left. */
const LADY_STEP = 2;
const LADIES = 7;
/** Alamo Square's lawn runs on past the end houses, then rolls away. */
const LAWN_MARGIN = 22;
/** Where the lawn meets a house (rows down from her peak). */
const LAWN_AT = 50;
/** The whole row's canvas size. */
export const LADIES_W = LADIES * LADY_W + LAWN_MARGIN * 2;
export const LADIES_H = LADY_H + (LADIES - 1) * LADY_STEP;

/** [body, accent] for each house, left to right. */
const LADY_PAINT: [string, string][] = [
  ["#9fd6bd", "#e0786a"], // mint, coral
  ["#bba5de", "#f0bf4c"], // lavender, gold
  ["#f3a7b9", "#5f9cc6"], // pink, blue
  ["#f4d779", "#7aae6c"], // butter, green
  ["#9cc4ec", "#e9875a"], // sky, orange
  ["#f6b98e", "#8a7bc8"], // peach, violet
  ["#b9d08e", "#d06e8a"], // sage, rose
];

const TRIM = "#fff6e2";
const TRIM_SHADE = "#e3d3b6";
const OUTLINE = "#4a3350";
const DOOR = "#6e4230";

/** Shift a daylight color into the phase's light. */
function inLight(c: string, phase: TitlePhase): string {
  switch (phase) {
    case "dawn":
      return mix(c, "#ffc7bc", 0.14);
    case "dusk":
      return mix(c, "#6a3a6e", 0.34);
    case "night":
      return mix(c, "#151a46", 0.64);
    default:
      return c;
  }
}

/** The house's peak row for house i (they step down the hill to the right). */
const ladyTop = (i: number) => LADIES_H - LADY_H - (LADIES - 1 - i) * LADY_STEP;

/** The Painted Ladies: seven Queen Annes stepping down the hill, Alamo Square's lawn in front. */
export function paintLadies(ctx: Pen, phase: TitlePhase): void {
  const rnd = seeded(710); // 710 Steiner
  for (let i = 0; i < LADIES; i++) {
    const [body, accent] = LADY_PAINT[i]!;
    paintLady(ctx, LAWN_MARGIN + i * LADY_W, ladyTop(i), body, accent, phase, rnd);
  }
  paintLawn(ctx, phase);
}

/** The park's lawn: it follows the street down the hill and rolls off past both ends. */
function paintLawn(ctx: Pen, phase: TitlePhase): void {
  const grass = inLight("#86c35e", phase);
  const crest = inLight("#a8d873", phase);
  const tuft = inLight("#6dab4f", phase);
  const deep = inLight("#5e9a48", phase);
  const rnd = seeded(1857);
  const H = LADIES_H;
  const housesW = LADIES * LADY_W;
  const tops: number[] = [];
  for (let x = 0; x < LADIES_W; x++) {
    // The street line, as a smooth slope through each house's lawn row.
    const t = (x - LAWN_MARGIN) / LADY_W - 0.5;
    let top = ladyTop(0) + LAWN_AT + t * LADY_STEP;
    // Past the houses, the lawn rounds off down to the bottom edge.
    const out = x < LAWN_MARGIN ? LAWN_MARGIN - x : x >= LAWN_MARGIN + housesW ? x - LAWN_MARGIN - housesW + 1 : 0;
    if (out) top += (H - top) * (1 - Math.cos((Math.PI / 2) * (out / LAWN_MARGIN)));
    const y = Math.round(top);
    if (y >= H) {
      tops.push(H);
      continue;
    }
    ctx.fillStyle = grass;
    ctx.fillRect(x, y, 1, H - y);
    ctx.fillStyle = crest;
    ctx.fillRect(x, y, 1, 1);
    // Tufts and a little shading toward the bottom.
    for (let yy = y + 2; yy < H; yy++) {
      const r = rnd();
      if (r < 0.08) {
        ctx.fillStyle = tuft;
        ctx.fillRect(x, yy, 1, 1);
      } else if (yy > H - 4 && r < 0.4) {
        ctx.fillStyle = deep;
        ctx.fillRect(x, yy, 1, 1);
      }
    }
    tops.push(y);
  }
  // A park tree on each shoulder of the lawn.
  for (const tx of [11, LADIES_W - 12]) paintParkTree(ctx, tx, tops[tx]! + 2, phase);
}

const PARK_TREE = [
  ".....oooo.....",
  "...ooGGHHoo...",
  "..oGGHHHHGGo..",
  ".oGGHHHHGGGgo.",
  ".oGHHHGGGGGgo.",
  "oGGHHGGGGGGggo",
  "oGGGGGGGGgGggo",
  "oGgGGGGGgGgggo",
  ".ogGGgGGggggo.",
  ".oggggggggggo.",
  "..oogggggooo..",
  "....ooTtoo....",
  "......Tt......",
  "......Tt......",
  "......Tt......",
];

/** A round park tree (14 x 15) with its trunk's foot at (cx, foot). */
function paintParkTree(ctx: Pen, cx: number, foot: number, phase: TitlePhase): void {
  const pal: Record<string, string> = {
    o: inLight("#2f5a3c", phase),
    g: inLight("#4f8a4c", phase),
    G: inLight("#68a85a", phase),
    H: inLight("#8cc86a", phase),
    T: inLight("#7a5236", phase),
    t: inLight("#5a3a28", phase),
  };
  const left = cx - 7;
  const top = foot - PARK_TREE.length;
  PARK_TREE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]!];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(left + x, top + y, 1, 1);
    }
  });
}

function paintLady(ctx: Pen, ox: number, top: number, body: string, accent: string, phase: TitlePhase, rnd: () => number): void {
  const L = (c: string) => inLight(c, phase);
  const B = L(body);
  const Bs = L(mix(body, "#4a3a6a", 0.18)); // siding shadow lines
  const A = L(accent);
  const As = L(mix(accent, "#3a2a50", 0.3));
  const T = L(TRIM);
  const Ts = L(TRIM_SHADE);
  const O = L(OUTLINE);
  const D = L(DOOR);
  const night = phase === "night";
  const dusk = phase === "dusk";
  // Window glass: sky reflections by day; lamplight (in some windows) after dark.
  const litShare = night ? 0.72 : dusk ? 0.3 : 0;
  const glass = (lit: boolean) =>
    lit
      ? { top: night ? "#fff1b4" : "#ffe2a0", fill: night ? "#ffcf62" : "#ffc070" }
      : { top: L(dusk ? "#f4b892" : phase === "dawn" ? "#f6d4d2" : "#b6dcf2"), fill: L("#4f7096") };

  const put = (x: number, y: number, w: number, h: number, c: string) => {
    if (h <= 0 || w <= 0) return;
    ctx.fillStyle = c;
    ctx.fillRect(ox + x, top + y, w, h);
  };
  const pane = (x: number, y: number, w: number, h: number, side: boolean) => {
    const g = glass(rnd() < litShare);
    put(x, y, w, h, side && !night ? mix(g.fill, "#2a3050", 0.2) : g.fill);
    put(x, y, w, 1, g.top);
    if (!night && !dusk) put(x, y + 1, 1, 1, g.top); // a glint in the corner
  };
  const H = LAWN_AT + 2; // the walls run on down behind the lawn

  // The front gable: outline, white bargeboard, fish-scale shingles in the accent color.
  for (let r = 0; r < 12; r++) {
    const l = 11 - r;
    const rr = 12 + r;
    put(l, r, 1, 1, O);
    put(rr, r, 1, 1, O);
    if (rr - l >= 2) {
      put(l + 1, r, 1, 1, T);
      put(rr - 1, r, 1, 1, Ts);
    }
    if (rr - l >= 4) {
      put(l + 2, r, rr - l - 3, 1, A);
      if (r % 2 === 1) for (let x = l + 2 + (r % 4 === 1 ? 0 : 1); x < rr - 1; x += 2) put(x, r, 1, 1, As);
    }
  }
  // The little arched attic window.
  put(11, 4, 2, 1, T);
  put(10, 5, 1, 5, T);
  put(13, 5, 1, 5, T);
  pane(11, 5, 2, 4, false);
  put(10, 9, 4, 1, T);

  // Cornice with dentils.
  put(0, 12, 24, 1, T);
  put(0, 12, 1, 2, O);
  put(23, 12, 1, 2, O);

  // The walls (outlined), with lap siding.
  put(0, 14, 1, H - 14, O);
  put(23, 14, 1, H - 14, O);
  put(1, 13, 22, H - 13, B);
  for (let x = 2; x < 23; x += 2) put(x, 13, 1, 1, Ts);
  for (let y = 16; y < H; y += 3) put(1, y, 22, 1, Bs);
  put(22, 14, 1, H - 14, Bs); // the shady side

  // Upstairs: a three-sided bay window.
  put(3, 15, 18, 1, T);
  put(3, 16, 18, 1, A);
  put(3, 17, 18, 10, T);
  pane(4, 18, 3, 8, true);
  pane(8, 18, 8, 8, false);
  put(8, 22, 8, 1, T); // the sash's meeting rail
  pane(17, 18, 3, 8, true);
  put(3, 26, 18, 1, T);
  put(3, 27, 18, 1, A);
  for (let x = 4; x < 20; x += 3) put(x, 27, 1, 1, As);
  put(4, 28, 16, 1, Ts);

  // The belt between the floors.
  put(1, 31, 22, 1, T);
  put(1, 32, 22, 1, A);

  // Downstairs: a bay on the left, the front door under its hood on the right.
  put(2, 34, 13, 11, T);
  pane(3, 35, 2, 8, true);
  pane(6, 35, 5, 8, false);
  pane(12, 35, 2, 8, true);
  put(2, 44, 13, 1, A);
  put(3, 45, 11, 1, Ts);
  // Door: a pediment hood, a transom, the door, and a stoop down to the street.
  put(18, 31, 2, 1, Ts);
  put(17, 32, 4, 1, T);
  put(16, 33, 6, 1, T);
  put(16, 34, 1, 12, T);
  put(21, 34, 1, 12, T);
  pane(17, 34, 4, 2, false);
  put(17, 36, 4, 10, D);
  put(18, 37, 2, 3, L("#8a5a44"));
  if (night || dusk) put(15, 34, 1, 1, "#ffe7a0"); // the porch lamp
  put(15, 46, 7, 1, T);
  put(16, 47, 7, 1, Ts);
  put(17, 48, 6, 1, T);
  put(18, 49, 5, 1, Ts);
}
