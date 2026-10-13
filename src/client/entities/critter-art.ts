// Registers the critters' hand-drawn art (critter-sprites.ts) plus derived variants:
// blinks, ear twitches, breathing frames, winter recolors and color-swapped butterflies/junimos.

import { pixelArt, type Palette } from "../engine/pixelart";
import { REGIONS, SHEETS } from "../engine/sprites";
import { BUTTERFLY_PAL, FOX_PAL, HOG_PAL, JUNIMO_PAL, SPRITES, STUMP_PAL, type PixelSprite } from "./critter-sprites";

// The real Stardrop and Bouquet from Stardew's objects sheet (this fan rip's layout, verified by
// cropping). The hand-drawn versions in critter-sprites.ts cover them if the sheet is missing.
SHEETS.objects ??= "sprites/objects.png";
REGIONS["item.stardrop"] ??= { sheet: "objects", x: 32, y: 288, w: 16, h: 16 };
REGIONS["item.bouquet"] ??= { sheet: "objects", x: 32, y: 304, w: 16, h: 16 };

let done = false;

/** Copy of `rows` with single-pixel edits applied: [x, y, char]. */
function edit(rows: string[], edits: [number, number, string][]): string[] {
  const out = rows.map((r) => r.split(""));
  for (const [x, y, ch] of edits) {
    const row = out[y];
    if (row && x >= 0 && x < row.length) row[x] = ch;
  }
  return out.map((r) => r.join(""));
}

/** Duplicate row `at` (a 1px "inhale" for breathing animations). */
function breathe(rows: string[], at: number): string[] {
  return [...rows.slice(0, at + 1), ...rows.slice(at)];
}

function reg(key: string, rows: string[], pal: Palette): void {
  pixelArt(key, rows, pal);
}

function base(key: string): PixelSprite {
  const s = SPRITES[key];
  if (!s) throw new Error(`critter art: missing ${key}`);
  return s;
}

/** Front ear flicks back. `ox` = column where the fox's head starts in that frame. */
function earTwitch(rows: string[], ox: number): string[] {
  return edit(rows, [
    [ox + 7, 0, "."],
    [ox + 6, 1, "."],
    [ox + 7, 1, "o"],
    [ox + 8, 2, "K"],
  ]);
}

/** Hand-drawn butterfly colors (fallbacks for the real critters sheet, see critter-ambient.ts). */
export const BUTTERFLY_COLORS: Record<string, [string, string]> = {
  green: ["#8ce87a", "#3a9a3a"],
  yellow: ["#ffe066", "#f2a03a"],
  blue: ["#8ec8ff", "#4a74d8"],
  orange: ["#ffa04a", "#3a2418"],
  pink: ["#ffb0d8", "#e0559a"],
};

export const JUNIMO_COLORS: Record<string, { J: string; j: string; h: string; o: string }> = {
  green: { J: "#7ad25a", j: "#58aa3e", h: "#b4f08c", o: "#1d3a1a" },
  blue: { J: "#6aaef0", j: "#4a82cc", h: "#b0dcff", o: "#16284e" },
  purple: { J: "#b07ae8", j: "#8656c4", h: "#dcb8ff", o: "#321a52" },
  yellow: { J: "#f2d24a", j: "#c8a62a", h: "#fff0a0", o: "#4e3a0c" },
  red: { J: "#ee6a6a", j: "#c24646", h: "#ffb0b0", o: "#4e1414" },
  orange: { J: "#f59a42", j: "#cc7424", h: "#ffd0a0", o: "#4e260c" },
};

export function registerCritterArt(): void {
  if (done) return;
  done = true;

  // Everything drawn as data, as-is.
  for (const [key, s] of Object.entries(SPRITES)) reg(key, s.rows, s.pal);

  // ---- fox ----
  const blink: Palette = { ...FOX_PAL, e: FOX_PAL.O! };
  for (const key of ["fox.sit.0", "fox.sit.1", "fox.lie.0", "fox.lie.1", "fox.walk.0", "fox.walk.1"]) {
    reg(`${key}.blink`, base(key).rows, blink);
  }
  reg("fox.sit.0.ear", earTwitch(base("fox.sit.0").rows, 6), FOX_PAL);
  reg("fox.lie.0.ear", earTwitch(base("fox.lie.0").rows, 16), FOX_PAL);
  reg("fox.sleep.1", breathe(base("fox.sleep.0").rows, 3), FOX_PAL);
  const snow: Palette = { ...FOX_PAL, g: "#b8c8e0", G: "#e4ecf8", v: "#ffffff" };
  reg("fox.dive.0.winter", base("fox.dive.0").rows, snow);
  reg("fox.dive.1.winter", base("fox.dive.1").rows, snow);

  // ---- hedgehog ----
  const idle = base("hedgehog.idle.0").rows;
  // A happy squint: the eye becomes a little closed line.
  reg("hedgehog.happy", edit(idle, [[14, 6, "F"], [13, 7, "e"], [14, 7, "e"]]), HOG_PAL);
  reg("hedgehog.sleep.1", breathe(base("hedgehog.sleep.0").rows, 2), HOG_PAL);

  // ---- the hangout ----
  const stump = base("critter.stump").rows;
  reg("critter.stump.winter", stump, { ...STUMP_PAL, T: STUMP_PAL.S!, t: STUMP_PAL.s!, r: "#c4d0e4", M: "#dfe8f5", N: "#ffffff", m: "#9fb0c8" });

  // ---- butterflies ----
  for (const [name, [A, a]] of Object.entries(BUTTERFLY_COLORS)) {
    for (const f of [0, 1]) reg(`critter.butterfly.${name}.${f}`, base(`critter.butterfly.${f}`).rows, { ...BUTTERFLY_PAL, A, a });
  }

  // ---- junimos ----
  for (const [name, c] of Object.entries(JUNIMO_COLORS)) {
    for (const f of [0, 1, 2]) reg(`junimo.${name}.${f}`, base(`junimo.green.${f}`).rows, { ...JUNIMO_PAL, ...c });
  }
}
