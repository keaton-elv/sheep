// Registers the critters' hand-drawn art (critter-sprites.ts) plus derived variants:
// blinks, ear twitches, breathing frames, winter recolors, color-swapped butterflies,
// the owl's blink & glances and the golden ladybug.

import { objectRegion } from "../art/regions";
import { makeCanvas, pixelArt, type Palette } from "../engine/pixelart";
import { REGIONS } from "../engine/sprites";
import { BUTTERFLY_PAL, FOX_PAL, GOLDBUG_PAL, HOG_PAL, OWL_PAL, SPRITES, STUMP_PAL, type PixelSprite } from "./critter-sprites";
import { report } from "./critter-util";

// The real Bouquet (item 458) from the objects sheet; the Stardrop is already shared in art/regions.ts.
// The hand-drawn versions in critter-sprites.ts cover them if the sheet is missing.
REGIONS["item.bouquet"] ??= objectRegion(458);

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

/** Register one sprite. A typo in one sprite's data only loses that sprite, never all the critter art. */
function reg(key: string, rows: string[], pal: Palette): void {
  try {
    pixelArt(key, rows, pal);
  } catch (err) {
    report(`art ${key}`, err);
  }
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

/** Owl eyes: [left eye x, right eye x] columns and the pupil row in critter.owl.perch. */
const OWL_EYES = { l: [3, 4], r: [8, 9], top: 5, pupil: 6 } as const;

/** Hand-drawn butterfly colors (fallbacks for the real critters sheet, see critter-ambient.ts). */
export const BUTTERFLY_COLORS: Record<string, [string, string]> = {
  green: ["#8ce87a", "#3a9a3a"],
  yellow: ["#ffe066", "#f2a03a"],
  blue: ["#8ec8ff", "#4a74d8"],
  orange: ["#ffa04a", "#3a2418"],
  pink: ["#ffb0d8", "#e0559a"],
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

  // ---- the owl: a slow blink, and glances left & right ----
  const owl = base("critter.owl.perch").rows;
  const [l0, l1] = OWL_EYES.l;
  const [r0, r1] = OWL_EYES.r;
  const { top, pupil } = OWL_EYES;
  reg("critter.owl.blink", edit(owl, [[l0, top, "C"], [l1, top, "C"], [r0, top, "C"], [r1, top, "C"], [l0, pupil, "o"], [l1, pupil, "o"], [r0, pupil, "o"], [r1, pupil, "o"]]), OWL_PAL);
  reg("critter.owl.left", edit(owl, [[l0, pupil, "K"], [l1, pupil, "Y"], [r0, pupil, "K"], [r1, pupil, "Y"]]), OWL_PAL);
  reg("critter.owl.right", edit(owl, [[l0, pupil, "Y"], [l1, pupil, "K"], [r0, pupil, "Y"], [r1, pupil, "K"]]), OWL_PAL);
  // A puffed-up hoot: one row taller through the chest.
  reg("critter.owl.hoot", breathe(owl, 9), OWL_PAL);

  // ---- the golden ladybug (very rare, very lucky) ----
  for (const key of ["critter.ladybug.0", "critter.ladybug.fly.0", "critter.ladybug.fly.1"]) {
    reg(key.replace("ladybug", "goldbug"), base(key).rows, GOLDBUG_PAL);
  }
  // Toast icons: the 6px bugs doubled up on a 16x16 tile, so they read next to the text.
  const lady = base("critter.ladybug.0");
  for (const [key, pal] of [["critter.ladybug.icon", lady.pal], ["critter.goldbug.icon", GOLDBUG_PAL]] as const) {
    const bug = pixelArt(null, lady.rows, pal);
    makeCanvas(key, 16, 16, (ctx) => ctx.drawImage(bug, 0, 0, bug.width, bug.height, 2, 4, bug.width * 2, bug.height * 2));
  }
  // ...and the Bumblesteed on a 16x16 tile, like an item icon.
  const steed = base("critter.bumblesteed.0");
  const steedArt = pixelArt(null, steed.rows, steed.pal);
  makeCanvas("critter.bumblesteed.icon", 16, 16, (ctx) => ctx.drawImage(steedArt, 0, 3));
}
