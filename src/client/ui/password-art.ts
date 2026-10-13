// Title-screen art for the password gate.
// - The chunky "Papa Snickers's Sheep Farm" logo: hand-made glyph masks, carved at runtime with
//   a bevel, an outline and a 3D extrusion (see buildLogo).
// - The sky comes from Stardew's real title-screen pieces (clouds.png and title_screen.png): the
//   big cloud bank, the small drifting clouds and the little flapping birds. These sheets are only
//   needed here, so the gate loads them itself instead of making every visit download them at
//   boot. (title_screen.png also holds the Stardew logo, buttons and other bits we never touch.)
// - Hand-drawn clouds and a bird stay registered as the fallback if the sheets can't load.
// - Along the bottom: Alamo Square and the Painted Ladies (see the end of the file).

import type { Season } from "../../shared/calendar";
import { makeCanvas, pixelArt } from "../engine/pixelart";
import { sheet as spriteSheet } from "../engine/sprites";
import { GROUND_ATLAS, groundPixels, hash2, type GroundShape } from "../world/world-pixels";
import { ctx2d, cut, makeCanvasEl, outdoorsSheet, sheetPx } from "../world/world-sheets";

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

// ---------- Alamo Square, along the bottom of the title screen ----------
//
// Postcard Row: the seven Painted Ladies (710-720 Steiner) stepping down the hill, seen from the
// lawn of Alamo Square with downtown hazy behind them. The Ladies are pixel art in Pelican Town's
// own building style (lap siding, fish-scale gables, sash windows, white trim, dark warm outlines),
// baked together with park pieces lifted from the Pelican Town tilesheets (the park tree, bushes,
// the lamppost and a bench) into one small sheet per season: sprites/title_alamo_<season>.png
// (snow on the roofs in winter, pumpkins on the stoops in fall), with two plainer Edwardian
// neighbors for wide screens. The lawn, the farm's own trees, the sheep and grass tufts come from
// sheets the farm has already loaded. Everything is painted in daylight at art resolution, then
// relit for dawn / dusk / night pixel by pixel, with lamplight in the windows and the lamppost
// after dark.

export type TitlePhase = "dawn" | "day" | "dusk" | "night";

/** The title page's own sheet for a season (only the title page loads it). */
export function alamoSheet(season: Season): string {
  return `sprites/title_alamo_${season}.png`;
}

/** A Lady's cell in the sheet (cell i at x = i * CELL_W); her lamplit windows are one row down. */
const CELL_W = 64;
const CELL_H = 122;
/** Inside a cell: the row of sidewalk she stands on (her front steps run on a few rows past it). */
const FOOT = 116;
/** Neighbors share a party wall, so each Lady starts 61 px after the last. */
const PITCH = 61;
/** How far each Lady steps down the hill from the one on her left. */
const STEP = 4;
const LADIES = 7;
/** Cells 7 and 8: the flat-fronted Edwardian neighbors either side of the row (wide screens). */
const NEIGHBOR_CELLS = [7, 8] as const;
/** The whole row, cell edge to cell edge. */
const ROW_W = (LADIES - 1) * PITCH + CELL_W;

/** Park pieces in the sheet (lifted from Pelican Town), and downtown with its lit windows. */
const PIECE = {
  tree: { x: 0, y: 244, w: 66, h: 110 },
  bushBig: { x: 66, y: 244, w: 48, h: 48 },
  bushSmall: { x: 114, y: 244, w: 32, h: 32 },
  lamp: { x: 146, y: 244, w: 16, h: 64 },
  lampLit: { x: 162, y: 244, w: 16, h: 16 },
  bench: { x: 178, y: 244, w: 30, h: 26 },
  cobble: { x: 178, y: 270, w: 32, h: 32 },
  skyline: { x: 210, y: 244, w: 256, h: 76 },
  skylineLit: { x: 210, y: 320, w: 256, h: 76 },
} satisfies Record<string, Rect>;

/** Downtown sits this many rows above the lowest Lady's sidewalk (its feet hide behind the row). */
const SKY_FOOT = 58;
/** ...and starts this far right of the row's left edge (the Pyramid peeks between Ladies 3 and 4). */
const SKY_DX = 112;

/** The farm's trees.png columns per season, and the two kinds the park gets. */
const TREE_SEASON_X: Record<Season, number> = { spring: 0, summer: 146, fall: 292, winter: 438 };
const FARM_TREES = {
  oak: { y: 0, w: 48, h: 84, winterH: 84 },
  maple: { y: 160, w: 48, h: 82, winterH: 84 },
} as const;
/** grass.png tuft rows per season (three 15x20 variants side by side). */
const TUFT_ROW: Record<Season, number> = { spring: 0, summer: 20, fall: 40, winter: 80 };

/** The lawn: rows of it in front of the lowest Lady (and the most it ever gets). */
const LAWN_MIN = 16;
const LAWN_MAX = 96;
/** ...and the furthest the row may sink below the bottom edge when nothing else fits. */
const LAWN_FLOOR = -6;

/** Each Lady's silhouette (first opaque row per cell column) and downtown's, read from the sheet. */
interface Tops {
  ladies: number[][];
  sky: number[];
}
const topsCache = new WeakMap<HTMLImageElement, Tops>();

function topsOf(img: HTMLImageElement): Tops {
  const hit = topsCache.get(img);
  if (hit) return hit;
  const scan = (r: Rect): number[] => {
    const c = makeCanvasEl(r.w, r.h);
    const ctx = ctx2d(c, true);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const d = ctx.getImageData(0, 0, r.w, r.h).data;
    const top: number[] = [];
    for (let x = 0; x < r.w; x++) {
      let t = r.h;
      for (let y = 0; y < r.h; y++) {
        if (d[(y * r.w + x) * 4 + 3]! > 0) {
          t = y;
          break;
        }
      }
      top.push(t);
    }
    return top;
  };
  let tops: Tops;
  try {
    tops = {
      ladies: Array.from({ length: LADIES + NEIGHBOR_CELLS.length }, (_, i) => scan({ x: i * CELL_W, y: 0, w: CELL_W, h: CELL_H })),
      sky: scan(PIECE.skyline),
    };
  } catch {
    // No readback (shouldn't happen, same origin): assume full cells.
    tops = { ladies: Array.from({ length: LADIES + NEIGHBOR_CELLS.length }, () => new Array<number>(CELL_W).fill(0)), sky: new Array<number>(PIECE.skyline.w).fill(0) };
  }
  topsCache.set(img, tops);
  return tops;
}

/** Where everything goes, in art px, for a canvas `w` wide. */
export interface AlamoPlan {
  w: number;
  h: number;
  /** Rows of lawn in front of the lowest Lady's sidewalk. */
  lawn: number;
  /** The lowest (rightmost) Lady's sidewalk row. */
  foot: number;
  /** Lady 0's cell's left edge. */
  rowX: number;
  /** Wide screens: all seven Ladies, with the park's trees beside the row instead of in front of it. */
  wide: boolean;
  /** Spots for the grazing sheep (frame's left/top, art px) and which way they face. */
  sheep: { x: number; y: number; flip: boolean; front: boolean }[];
}

/**
 * The houses along the street, left to right: [sheet cell, place in the row] (the Ladies are 0-6;
 * on wide screens a neighbor stands either side, at -1 and 7).
 */
function houses(wide: boolean): [number, number][] {
  const row: [number, number][] = Array.from({ length: LADIES }, (_, i) => [i, i]);
  return wide ? [[NEIGHBOR_CELLS[0], -1], ...row, [NEIGHBOR_CELLS[1], LADIES]] : row;
}

/** How far the art rises above the lowest Lady's sidewalk, column by column. */
function riseProfile(w: number, rowX: number, tops: Tops, wide: boolean): number[] {
  const rise = new Array<number>(w).fill(0);
  const hs = houses(wide);
  for (let x = 0; x < w; x++) {
    let r = 0;
    for (const [cell, i] of hs) {
      const cx = x - (rowX + i * PITCH);
      if (cx < 0 || cx >= CELL_W) continue;
      const t = tops.ladies[cell]![cx]!;
      if (t < CELL_H) r = Math.max(r, FOOT - t + (LADIES - 1 - i) * STEP);
    }
    const sx = x - (rowX + SKY_DX);
    if (sx >= 0 && sx < PIECE.skyline.w) {
      const t = tops.sky[sx]!;
      if (t < PIECE.skyline.h) r = Math.max(r, SKY_FOOT + PIECE.skyline.h - t);
    }
    rise[x] = r;
  }
  return rise;
}

/**
 * Lay the scene out for a canvas `w` art px wide. `room` is how many rows there are between the
 * bottom of the screen and the dialog box over columns [dl, dr) (the scene must stay below it there),
 * and `target` the height the scene would like to be. Returns the plan and whether it fits.
 */
export function planAlamo(img: HTMLImageElement, w: number, room: number, dl: number, dr: number, target: number, sink = false): { plan: AlamoPlan; fits: boolean } {
  const tops = topsOf(img);
  const wide = w >= ROW_W + 2 * PITCH + 60;
  // Center the row on the middle Lady (on a phone, the ones at the ends run off the edges).
  const rowX = Math.round(w / 2 - ROW_W / 2);
  const rise = riseProfile(w, rowX, tops, wide);
  const maxRise = Math.max(...rise);
  let under = 0;
  for (let x = Math.max(0, dl); x < Math.min(w, dr); x++) under = Math.max(under, rise[x]!);
  const fitLawn = room - under;
  const want = Math.max(LAWN_MIN, Math.min(LAWN_MAX, target - maxRise));
  const lawn = Math.min(want, fitLawn);
  const fits = lawn >= LAWN_MIN;
  // Out of other options (the smallest pixel size we'll go to), the row may sink a little below
  // the bottom edge instead of reaching up under the box: the lawn, then the steps, go first.
  const lawnRows = fits ? lawn : sink ? Math.max(LAWN_FLOOR, lawn) : LAWN_MIN;
  const h = maxRise + lawnRows + 1;
  const foot = h - lawnRows;
  // Sheep graze on the lawn when there's room for them.
  const sheep: AlamoPlan["sheep"] = [];
  if (lawnRows >= 48 && !wide) {
    // One up on the grass above the path, one down by the bottom edge (see the path in paintAlamo).
    sheep.push({ x: Math.round(w * 0.1), y: h - Math.round(lawnRows * 0.3) - 40, flip: false, front: true });
    if (w >= 240) sheep.push({ x: Math.round(w * 0.64), y: h - 38, flip: true, front: false });
  } else if (wide) {
    sheep.push({ x: rowX - PITCH - 84, y: h - 33, flip: false, front: true });
    sheep.push({ x: rowX + ROW_W + PITCH + 38, y: h - 31, flip: true, front: false });
  }
  return { plan: { w, h, lawn: lawnRows, foot, rowX, wide, sheep }, fits };
}

/** A Lady's sidewalk row (they step down the hill to the right). */
const ladyFoot = (plan: AlamoPlan, i: number) => plan.foot - (LADIES - 1 - i) * STEP;

/** The sidewalk's line: a straight slope through the Ladies' feet, carried on past both ends. */
function slopeY(plan: AlamoPlan, x: number): number {
  const t = (x - (plan.rowX + 2 + PITCH / 2)) / PITCH;
  return Math.round(ladyFoot(plan, 0) + t * STEP);
}

/** Relight daylight pixels for the time of day (in place). */
function relight(d: Uint8ClampedArray, phase: TitlePhase): void {
  if (phase === "day") return;
  // [multiply r, g, b] then [add r, g, b]
  const m =
    phase === "night"
      ? [0.3, 0.34, 0.56, 8, 10, 30]
      : phase === "dusk"
        ? [1.02, 0.78, 0.6, 14, 4, 6]
        : [0.86, 0.78, 0.88, 14, 6, 18];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    d[i] = d[i]! * m[0]! + m[3]!;
    d[i + 1] = d[i + 1]! * m[1]! + m[4]!;
    d[i + 2] = d[i + 2]! * m[2]! + m[5]!;
  }
}

/** Raw pixels of a piece of the sheet (cached per image). */
const pieceCache = new WeakMap<HTMLImageElement, Map<string, ImageData>>();
function piecePx(img: HTMLImageElement, r: Rect): ImageData | null {
  let m = pieceCache.get(img);
  if (!m) pieceCache.set(img, (m = new Map()));
  const k = `${r.x},${r.y},${r.w},${r.h}`;
  const hit = m.get(k);
  if (hit) return hit;
  try {
    const c = makeCanvasEl(r.w, r.h);
    const ctx = ctx2d(c, true);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const d = ctx.getImageData(0, 0, r.w, r.h);
    m.set(k, d);
    return d;
  } catch {
    return null;
  }
}

/** Relight a whole canvas for the time of day. */
function relightCanvas(c: HTMLCanvasElement, phase: TitlePhase): void {
  if (phase === "day") return;
  const ctx = ctx2d(c, true);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  relight(d.data, phase);
  ctx.putImageData(d, 0, 0);
}

/** Paint Alamo Square into `c` (sized to the plan) for a time of day and season. */
export function paintAlamo(c: HTMLCanvasElement, img: HTMLImageElement, plan: AlamoPlan, phase: TitlePhase, season: Season): void {
  const { w, h } = plan;
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const out = ctx2d(c, true);
  out.clearRect(0, 0, w, h);
  // Two layers, each relit before its own lights go on: downtown far behind, and everything else.
  const back = makeCanvasEl(w, h);
  const front = makeCanvasEl(w, h);
  let ctx = ctx2d(back, true);
  const piece = (r: Rect, x: number, y: number, flip = false) => {
    if (!flip) {
      ctx.drawImage(img, r.x, r.y, r.w, r.h, x, y, r.w, r.h);
      return;
    }
    ctx.save();
    ctx.translate(x + r.w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    ctx.restore();
  };
  const farm = (src: HTMLCanvasElement | null, x: number, y: number, flip = false) => {
    if (!src) return;
    if (!flip) {
      ctx.drawImage(src, x, y);
      return;
    }
    ctx.save();
    ctx.translate(x + src.width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  };
  const seed = 0xa1a0;
  const lamps: { x: number; foot: number }[] = [];

  // ----- far: downtown -----
  const skyX = plan.rowX + SKY_DX;
  const skyY = plan.foot - SKY_FOOT - PIECE.skyline.h;
  piece(PIECE.skyline, skyX, skyY);
  relightCanvas(back, phase);
  if (phase === "night" || phase === "dusk") {
    // Downtown's glow on the haze behind it.
    const gx = skyX + PIECE.skyline.w / 2;
    const gy = plan.foot - SKY_FOOT;
    // Fades out before the canvas top, or its edge shows as a line across the night sky.
    const reach = Math.max(8, Math.min(PIECE.skyline.w * 0.6, gy - 1));
    const grad = ctx.createRadialGradient(gx, gy, 4, gx, gy, reach);
    grad.addColorStop(0, phase === "night" ? "rgba(255, 170, 120, 0.22)" : "rgba(255, 220, 170, 0.18)");
    grad.addColorStop(1, "rgba(255, 170, 120, 0)");
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = grad;
    ctx.fillRect(gx - PIECE.skyline.w, gy - PIECE.skyline.w, PIECE.skyline.w * 2, PIECE.skyline.w * 2);
    ctx.restore();
  }
  if (phase === "night") piece(PIECE.skylineLit, skyX, skyY);

  // ----- near: the row, the street and the park -----
  ctx = ctx2d(front, true);

  // Postcard Row, left (top of the hill) to right, between its neighbors on wide screens.
  const hs = houses(plan.wide);
  for (const [cell, i] of hs) {
    ctx.drawImage(img, cell * CELL_W, 0, CELL_W, CELL_H, plan.rowX + i * PITCH, ladyFoot(plan, i) - FOOT, CELL_W, CELL_H);
  }
  // Shrubs in the little front gardens under the bay windows (the sidewalk hides their feet).
  for (const [, i] of hs) {
    piece(PIECE.bushSmall, plan.rowX + i * PITCH + 4 + (i % 2) * 3, ladyFoot(plan, i) + 13 - PIECE.bushSmall.h, i % 2 === 1);
  }

  // The sidewalk along the slope (pale concrete with joints), under the Ladies' steps.
  for (let x = 0; x < w; x++) {
    const s = slopeY(plan, x);
    ctx.fillStyle = "#d3cbc4";
    ctx.fillRect(x, s - 1, 1, 6);
    ctx.fillStyle = "#e9e3dc";
    ctx.fillRect(x, s - 1, 1, 1);
    ctx.fillStyle = "#9f9290";
    ctx.fillRect(x, s + 4, 1, 1);
    if ((x + 3) % 14 === 0) {
      ctx.fillStyle = "#bbb0aa";
      ctx.fillRect(x, s, 1, 4);
    }
  }
  // The front steps run out over the sidewalk.
  for (const [cell, i] of hs) {
    const x = plan.rowX + i * PITCH;
    const f = ladyFoot(plan, i);
    ctx.drawImage(img, cell * CELL_W + 38, FOOT - 14, 26, CELL_H - FOOT + 14, x + 38, f - 14, 26, CELL_H - FOOT + 14);
  }

  // The lawn: the farm's own Stardew grass, with a cobbled path (Pelican Town's cobbles) through it.
  let lawnTop = h;
  for (let x = 0; x < w; x++) lawnTop = Math.min(lawnTop, slopeY(plan, x) + 5);
  const lawnH = h - lawnTop;
  const path = plan.lawn >= 48 && !plan.wide;
  /** The path's centerline (scene coords): in from the bottom left, curving up and off to the right. */
  const pathPts: [number, number][] = [
    [-12, h - Math.round(plan.lawn * 0.18)],
    [Math.round(w * 0.3), h - Math.round(plan.lawn * 0.36)],
    [Math.round(w * 0.62), h - Math.round(plan.lawn * 0.5)],
    [w + 12, h - Math.round(plan.lawn * 0.56)],
  ];
  if (lawnH > 0) {
    const atlas = sheetPx(outdoorsSheet(season), GROUND_ATLAS.x, GROUND_ATLAS.y, GROUND_ATLAS.w, GROUND_ATLAS.h);
    const shapes: GroundShape[] = [];
    if (path) {
      for (let i = 0; i + 1 < pathPts.length; i++) {
        const [ax, ay] = pathPts[i]!;
        const [bx, by] = pathPts[i + 1]!;
        shapes.push({ kind: "cap", ax, ay: ay - lawnTop, bx, by: by - lawnTop, r: 6 });
      }
    }
    const g = groundPixels({ w, h: lawnH, season, seed, atlas, shapes, avoid: [{ x: 0, y: 0, w, h: 14 }] });
    const data = new Uint8ClampedArray(g.px.data);
    const cob = piecePx(img, PIECE.cobble);
    for (let y = 0; y < lawnH; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const o = i * 4;
        if (cob && g.dirt[i]) {
          // Cobbles instead of dirt; shaded under the grass's lip and along the edges.
          const co = (((y + lawnTop) & 31) * 32 + (x & 31)) * 4;
          const up = y > 0 && !g.dirt[i - w];
          const up2 = y > 1 && !g.dirt[i - 2 * w];
          const side = (x > 0 && !g.dirt[i - 1]) || (x < w - 1 && !g.dirt[i + 1]) || (y < lawnH - 1 && !g.dirt[i + w]);
          const k = up ? 0.62 : up2 ? 0.8 : side ? 0.86 : 1;
          data[o] = cob.data[co]! * k;
          data[o + 1] = cob.data[co + 1]! * k;
          data[o + 2] = cob.data[co + 2]! * k;
        }
      }
    }
    // Clip the lawn to the slope (it starts just below the sidewalk), with a dark lip at the curb.
    for (let x = 0; x < w; x++) {
      const top = slopeY(plan, x) + 5 - lawnTop;
      for (let y = 0; y < Math.min(top, lawnH); y++) data[(y * w + x) * 4 + 3] = 0;
      for (const [dy, k] of [
        [0, 0.66],
        [1, 0.86],
      ] as const) {
        if (top + dy < 0 || top + dy >= lawnH) continue;
        const o = ((top + dy) * w + x) * 4;
        data[o] = data[o]! * k;
        data[o + 1] = data[o + 1]! * k;
        data[o + 2] = data[o + 2]! * (k + 0.04);
      }
    }
    const lawnCanvas = makeCanvasEl(w, lawnH);
    ctx2d(lawnCanvas).putImageData(new ImageData(data, w, lawnH), 0, 0);
    ctx.drawImage(lawnCanvas, 0, lawnTop);
  }

  // Grass tufts on the lawn (off the path).
  const tuftRow = TUFT_ROW[season];
  const tufts = [0, 1, 2].map((v) => cut("grass", v * 15, tuftRow, 15, 20));
  const onPath = (x: number, y: number) => {
    if (!path) return false;
    for (let i = 0; i + 1 < pathPts.length; i++) {
      const [ax, ay] = pathPts[i]!;
      const [bx, by] = pathPts[i + 1]!;
      if (x < ax - 10 || x > bx + 10) continue;
      const t = (x - ax) / (bx - ax);
      const py = ay + (by - ay) * Math.max(0, Math.min(1, t));
      if (Math.abs(y - py) < 12) return true;
    }
    return false;
  };
  const nT = Math.round((w * plan.lawn) / 1100);
  for (let k = 0, n = 0; k < nT * 4 && n < nT; k++) {
    const x = Math.floor(hash2(k, 3, seed) * (w + 8)) - 8;
    const y = plan.foot + 16 + Math.floor(hash2(k, 4, seed) * Math.max(1, plan.lawn - 10));
    if (onPath(x + 7, y - 2)) continue;
    farm(tufts[k % 3] ?? null, x, y - 20);
    n++;
  }

  // Park furniture: a lamppost and a bench by the path (or flanking the row on wide screens).
  if (path) {
    const lx = Math.round(w * 0.47);
    const lf = h - Math.round(plan.lawn * 0.46) - 5;
    lamps.push({ x: lx, foot: lf });
    const bx = Math.round(w * 0.56);
    piece(PIECE.bench, bx, lf - PIECE.bench.h + 2);
  } else if (plan.wide) {
    lamps.push({ x: plan.rowX + 30, foot: h - 2 });
    lamps.push({ x: plan.rowX + ROW_W - 38, foot: h - 2 });
  }
  for (const l of lamps) piece(PIECE.lamp, l.x, l.foot - PIECE.lamp.h);

  // Trees: the Pelican Town park tree framing the corners, the farm's maples and oaks beside it.
  const treeS = TREE_SEASON_X[season];
  const oak = cut("trees", treeS, FARM_TREES.oak.y, FARM_TREES.oak.w, season === "winter" ? FARM_TREES.oak.winterH : FARM_TREES.oak.h);
  const maple = cut("trees", treeS, FARM_TREES.maple.y, FARM_TREES.maple.w, season === "winter" ? FARM_TREES.maple.winterH : FARM_TREES.maple.h);
  if (plan.wide) {
    // Beside the row: the big park tree at each end, then maples and oaks out to the edges.
    for (let x = plan.rowX - PITCH - 52, k = 0; x > -70; x -= 54, k++) {
      if (k % 2 === 0) piece(PIECE.tree, x - 4, h + 3 - PIECE.tree.h, k % 4 === 2);
      else farm(k % 4 === 1 ? maple : oak, x + 6, h + 1 - (maple?.height ?? 82));
    }
    for (let x = plan.rowX + ROW_W + PITCH - 6, k = 0; x < w + 70; x += 54, k++) {
      if (k % 2 === 0) piece(PIECE.tree, x, h + 3 - PIECE.tree.h, k % 4 === 0);
      else farm(k % 4 === 1 ? oak : maple, x + 6, h + 1 - (oak?.height ?? 84), true);
    }
  } else {
    piece(PIECE.tree, -30, h + 6 - PIECE.tree.h);
    piece(PIECE.tree, w - 36, h + 6 - PIECE.tree.h, true);
  }
  // A couple of bushes along the bottom edge.
  if (plan.lawn >= 30 && !plan.wide) {
    piece(PIECE.bushSmall, Math.round(w * 0.8), h - 24);
    piece(PIECE.bushBig, Math.round(w * 0.14) - 16, h - 26);
  }

  relightCanvas(front, phase);

  // Lamplight: most windows at night, some at dusk, a few early risers at dawn.
  const lit = phase === "night" ? [-1, 0, 1, 2, 3, 4, 5, 6, 7] : phase === "dusk" ? [1, 3, 4, 6, 7] : phase === "dawn" ? [2, 5] : [];
  for (const [cell, i] of hs) {
    if (lit.includes(i)) ctx.drawImage(img, cell * CELL_W, CELL_H, CELL_W, CELL_H, plan.rowX + i * PITCH, ladyFoot(plan, i) - FOOT, CELL_W, CELL_H);
  }
  if (phase !== "day") {
    for (const l of lamps) {
      const ly = l.foot - PIECE.lamp.h;
      piece(PIECE.lampLit, l.x, ly);
      // A soft pool of warm light around the lantern (Stardew's lights are soft and round).
      const cx = l.x + 8;
      const cy = ly + 8;
      const r = phase === "night" ? 40 : 22;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 214, 140, ${phase === "night" ? 0.55 : 0.25})`);
      grad.addColorStop(0.4, `rgba(255, 190, 110, ${phase === "night" ? 0.2 : 0.09})`);
      grad.addColorStop(1, "rgba(255, 190, 110, 0)");
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = grad;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  out.drawImage(back, 0, 0);
  out.drawImage(front, 0, 0);
}

/** A sheep frame (32x32) from the farm's sheep sheet, relit for the time of day. */
export function sheepFrame(c: HTMLCanvasElement, index: number, flip: boolean, phase: TitlePhase): void {
  const src = spriteSheet("sheep");
  if (!src) return;
  c.width = 32;
  c.height = 32;
  const ctx = ctx2d(c, true);
  ctx.clearRect(0, 0, 32, 32);
  ctx.save();
  if (flip) {
    ctx.translate(32, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, (index % 4) * 32, Math.floor(index / 4) * 32, 32, 32, 0, 0, 32, 32);
  ctx.restore();
  if (phase !== "day") {
    const d = ctx.getImageData(0, 0, 32, 32);
    relight(d.data, phase);
    ctx.putImageData(d, 0, 0);
  }
}
