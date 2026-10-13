// Art for the billboard calendar: the real Stardew billboard (wooden board, pinned paper, the
// grey pin, waving festival flags) cut from sprites/billboard.png, plus tiny hand-drawn sheep
// faces for plans, a Golden Gate for Bay Area days and a Wine Wednesday glass. Without the sheet,
// the menus fall back to their CSS paper and these faces.

import { pixelArt } from "../engine/pixelart";
import { REGIONS, SHEETS } from "../engine/sprites";
import { cssUrl, setRootVars, sheetCrop } from "./calendar-util";

// Registered at import time, before loadSprites() runs. `??=` keeps whoever else maps it.
SHEETS.billboard ??= "sprites/billboard.png";

// The purple festival pennant (first frame of its 6-frame wave) and the little gold star.
REGIONS["ui.festflag"] = { sheet: "billboard", x: 1, y: 398, w: 14, h: 12 };
REGIONS["ui.feststar"] = { sheet: "billboard", x: 140, y: 397, w: 10, h: 11 };

/** Waving flag strip: 6 frames of 14x12, side by side. */
export const FLAG_FRAMES = 6;
export const FLAG_W = 14;
export const FLAG_H = 12;

let done = false;

const SHEEP = { o: "#513f3f", W: "#fff6dc", w: "#dcc9a5", F: "#f3dfba", f: "#cdb48c", E: "#b49c78", k: "#2b2020", n: "#c98a7a" };

export function registerCalendarArt(): void {
  if (done) return;
  done = true;

  // 13x11 woolly sheep face (a plan still to do).
  pixelArt(
    "ui.sheephead",
    [
      "....ooooo....",
      "..ooWWWWWoo..",
      ".oWWWWWWWWwo.",
      "ooooWWWWWwooo",
      "oEEEoFFFFoEEo",
      "ooooFFFFFFooo",
      ".owFkFFFkFwo.",
      ".owFFFFFFFwo.",
      "..owFFnFFwo..",
      "...owwwwwo...",
      "....ooooo....",
    ],
    SHEEP,
  );

  // Same size, freshly sheared (a plan you did!).
  pixelArt(
    "ui.sheephead.sheared",
    [
      ".............",
      ".............",
      "....ooooo....",
      "ooo.oFFFo.ooo",
      "oEEooFFFooEEo",
      "oooFFFFFFFooo",
      "..oFkFFFkFo..",
      "..oFFFFFFFo..",
      "...oFFnFFo...",
      "....offfo....",
      ".....ooo.....",
    ],
    SHEEP,
  );

  // Hand-drawn festival flag (used only if the billboard sheet is missing).
  pixelArt(
    "ui.festflag",
    ["oo.....", "oRRRo..", "oRRRRRo", "oRrRRo.", "oRro...", "oo.....", "o......", "o......", "oo....."],
    { o: "#5a2c14", R: "#8e4fbf", r: "#ffd84a" },
  );
  pixelArt(
    "ui.feststar",
    ["...o...", "..oYo..", "ooYYYoo", "oYYYYYo", ".oYYYo.", ".oYoYo.", ".oo.oo."],
    { o: "#7a3a0a", Y: "#ffc93a" },
  );

  // 17x9 Golden Gate Bridge in International Orange, for the real Bay Area days.
  pixelArt(
    "ui.sfday",
    [
      "....HR.....HR....",
      "....HR.....HR....",
      "...cHRc...cHRc...",
      "..c.HR.c.c.HR.c..",
      ".c..HR..c..HR..c.",
      "c...HR.....HR...c",
      "DDDDDDDDDDDDDDDDD",
      "....HR.....HR....",
      ".wwwwwwwwwwwwwww.",
    ],
    { R: "#a8341f", H: "#e0603a", c: "#c8442c", D: "#7a2214", w: "#6a9ad8" },
  );

  // 5x7 glass of red, for Wine Wednesday.
  pixelArt("ui.wineglass", ["g...g", "gWRRg", "gRRRg", ".gRg.", "..g..", "..g..", ".ggg."], { g: "#8e7fa6", R: "#9a1e44", W: "#f0b0c8" });
}

// ---------- the real billboard, as CSS pieces ----------

/** Paper colors on the billboard sheet: fill, top/right highlight, left/bottom edge. */
const PAPER: readonly [number, number, number] = [251, 235, 194];
const EDGE: readonly [number, number, number] = [224, 176, 132];
const HIGHLIGHT: readonly [number, number, number] = [255, 247, 211];
const PAPER_KEEP = ["251,235,194", "255,247,211", "224,176,132"];

/** The calendar paper on the sheet (x, y, w, h) and its torn bits (paper-local boxes) to keep. */
const PAPER_RECT = { x: 29, y: 215, w: 240, h: 168 } as const;
const TORN: readonly (readonly [number, number, number, number])[] = [
  [227, 0, 13, 12], // top-right diagonal tear
  [215, 161, 20, 7], // bottom-right torn notch
  [27, 164, 9, 4], // bottom-left torn notch
];

/** border-image slices (top right bottom left) for the cleaned paper, and for its mirror. */
export const PAPER_SLICE = [12, 25, 8, 36] as const;

let skin: boolean | null = null;

/** Wipe the printed 28-day grid and the pin off the calendar paper, keeping its torn edges. */
function cleanPaper(c: HTMLCanvasElement): void {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const torn = (x: number, y: number) => TORN.some(([tx, ty, tw, th]) => x >= tx && x < tx + tw && y >= ty && y < ty + th);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const inside = x > 0 && y > 0 && x < c.width - 1 && y < c.height - 1;
      if (inside && !torn(x, y)) {
        d[i] = PAPER[0];
        d[i + 1] = PAPER[1];
        d[i + 2] = PAPER[2];
        d[i + 3] = 255;
      } else if (x === 0 && y > 0 && y < c.height - 1) {
        // A straight left edge (the sheet has a torn bump here that would smear when stretched).
        d[i] = EDGE[0];
        d[i + 1] = EDGE[1];
        d[i + 2] = EDGE[2];
        d[i + 3] = 255;
      } else if (y === 0 && x > 1 && !torn(x, y)) {
        // A clean top highlight (the pin used to sit on it).
        d[i] = HIGHLIGHT[0];
        d[i + 1] = HIGHLIGHT[1];
        d[i + 2] = HIGHLIGHT[2];
        d[i + 3] = 255;
      } else if (!PAPER_KEEP.includes(`${d[i]},${d[i + 1]},${d[i + 2]}`)) {
        d[i + 3] = 0; // board showing through a tear: let the menu's own wood show instead
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Just the grey pin (and its shadow on the paper), on a transparent background. */
function cleanPin(c: HTMLCanvasElement): void {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const r = d[i]!;
      const g = d[i + 1]!;
      const b = d[i + 2]!;
      const pin = b >= r - 4 && !(r > 200 && g > 200);
      const shadow = r === 224 && g === 176 && b === 132 && y >= 8;
      if (!pin && !shadow) d[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function mirror(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
  }
  return c;
}

/**
 * Build the billboard CSS pieces once (after loadSprites) and publish them as root CSS vars:
 * --fm-bb-frame (board frame, 9-slice 10 9 7 9), --fm-bb-wood (plank tile 16x168),
 * --fm-bb-paper / --fm-bb-paper-flip (240x168, slices PAPER_SLICE), --fm-bb-pin (18x18),
 * --fm-bb-flags (84x12 strip). Returns false (and the menus keep their CSS look) without the sheet.
 */
export function billboardSkin(): boolean {
  if (skin !== null) return skin;
  try {
    const frame = sheetCrop("billboard", 0, 197, 301, 199);
    const wood = sheetCrop("billboard", 272, 215, 16, 168);
    const paper = sheetCrop("billboard", PAPER_RECT.x, PAPER_RECT.y, PAPER_RECT.w, PAPER_RECT.h);
    const pin = sheetCrop("billboard", 156, 207, 18, 18);
    const flags = sheetCrop("billboard", 1, 398, FLAG_W * FLAG_FRAMES, FLAG_H);
    if (!frame || !wood || !paper || !pin || !flags) {
      // Not loaded (yet?): try again next time instead of caching a "no".
      return false;
    }
    cleanPaper(paper);
    cleanPin(pin);
    setRootVars({
      "--fm-bb-frame": cssUrl(frame),
      "--fm-bb-wood": cssUrl(wood),
      "--fm-bb-paper": cssUrl(paper),
      "--fm-bb-paper-flip": cssUrl(mirror(paper)),
      "--fm-bb-pin": cssUrl(pin),
      "--fm-bb-flags": cssUrl(flags),
    });
    skin = true;
  } catch (err) {
    console.warn("[calendar] billboard art unavailable", err);
    skin = false;
  }
  return skin;
}
