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
// "Papa Snickers's" over "Sheep Farm", built from glyph masks at runtime: each line gets a
// bevel (white top edges, warm shadowed bottom edges, a two-tone fill), a dark outline, a 3D
// extrusion below, and an outer outline, so the lettering looks carved like Stardew's sign.

type Shade = "H" | "C" | "c" | "b" | "o" | "E" | "e" | "k";
type LogoPalette = Record<Shade, string>;

const GOLD: LogoPalette = { H: "#ffffff", C: "#fff3c4", c: "#ffe08a", b: "#f5b94a", o: "#7a3410", E: "#a8501c", e: "#6b2a0c", k: "#3b1505" };
const PINK: LogoPalette = { H: "#ffffff", C: "#ffe6ef", c: "#ffc2d6", b: "#f590b2", o: "#7a2440", E: "#a8406a", e: "#5e1a33", k: "#33101e" };

interface Font {
  glyphs: Record<string, string[]>;
  cap: number;
  xHeight: number;
  descender: number;
  gap: number;
  space: number;
}

/** Big chunky letters: 3px strokes, cap height 10, x-height 7. */
const BIG: Font = {
  cap: 10,
  xHeight: 7,
  descender: 3,
  gap: 2,
  space: 5,
  glyphs: {
    S: [".######.", "########", "###..###", "###.....", "#######.", ".#######", ".....###", "###..###", "########", ".######."],
    h: ["###.....", "###.....", "###.....", "###.###.", "########", "####.###", "###..###", "###..###", "###..###", "###..###"],
    e: [".######.", "###..###", "########", "###.....", "###..###", "########", ".######."],
    p: ["#######.", "########", "###..###", "###..###", "###..###", "########", "#######.", "###.....", "###.....", "###....."],
    F: ["#######", "#######", "###....", "###....", "######.", "######.", "###....", "###....", "###....", "###...."],
    a: [".######.", ".....###", ".#######", "########", "###..###", "########", ".#######"],
    r: ["###.###", "#######", "####...", "###....", "###....", "###....", "###...."],
    m: ["##########.", "###########", "###.###.###", "###.###.###", "###.###.###", "###.###.###", "###.###.###"],
  },
};

/** Smaller letters for the top line: 2px strokes, cap height 7, x-height 5. */
const SMALL: Font = {
  cap: 7,
  xHeight: 5,
  descender: 2,
  gap: 2,
  space: 4,
  glyphs: {
    P: ["####.", "#####", "##.##", "#####", "####.", "##...", "##..."],
    a: [".###.", "...##", ".####", "##.##", ".####"],
    p: ["####.", "##.##", "##.##", "##.##", "####.", "##...", "##..."],
    S: [".####", "##...", "##...", ".###.", "...##", "...##", "####."],
    n: ["####.", "##.##", "##.##", "##.##", "##.##"],
    i: ["##", "..", "##", "##", "##", "##", "##"],
    c: [".###", "##..", "##..", "##..", ".###"],
    k: ["##...", "##...", "##.##", "####.", "###..", "####.", "##.##"],
    e: [".###.", "##.##", "#####", "##...", ".####"],
    r: ["##.##", "####.", "##...", "##...", "##..."],
    s: [".###", "##..", ".##.", "..##", "###."],
    "'": ["##", "##", ".#"],
  },
};

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

/** Outline + bevel + extrusion for a line mask, painted onto a new canvas. */
function carve(mask: { m: Uint8Array; w: number; h: number }, pal: LogoPalette, depth: number): HTMLCanvasElement {
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
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(fill, x, y) || at(ring, x, y)) continue;
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
      ctx.fillStyle = pal[shade];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** Logo size and its top edge per column (so the sheep can stand on it without overlapping). */
export const LOGO = { w: 0, h: 0, tops: [] as number[] };

function buildLogo(): void {
  const top = carve(lineMask("Papa Snickers's", SMALL), PINK, 2);
  const bottom = carve(lineMask("Sheep Farm", BIG), GOLD, 3);
  const w = Math.max(top.width, bottom.width);
  const overlap = 2; // the top line's outline tucks into the bottom line's
  const h = top.height - overlap + bottom.height;
  const logo = makeCanvas("ui.logo", w, h, (ctx) => {
    ctx.drawImage(bottom, Math.floor((w - bottom.width) / 2), top.height - overlap);
    // The top line goes over the bottom one, so the descenders of "Papa" stay visible.
    ctx.drawImage(top, Math.floor((w - top.width) / 2), 0);
  });
  const data = logo.getContext("2d")!.getImageData(0, 0, w, h).data;
  const tops: number[] = [];
  for (let x = 0; x < w; x++) {
    let t = h;
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4 + 3]! > 0) {
        t = y;
        break;
      }
    }
    tops.push(t);
  }
  LOGO.w = w;
  LOGO.h = h;
  LOGO.tops = tops;
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
