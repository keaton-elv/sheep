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
