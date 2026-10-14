// Art for the newer critters: the hand-drawn bits in critter-lore-sprites.ts, plus real Stardew
// frames wherever the sheets have them:
//   companions.png  the green, red-headed parrot (the Telegraph Hill parrots!), 16x16 frames
//   critters.png    seagulls and the opossum (32x32 cells, facing left / right as noted)
//   raccoons.png    raccoons trotting left & right (for a certain trench coat), and the brown & grey
//                   couple arm in arm (Wine Wednesday nights)
//   objects.png     Wine (item 348), for Wine Wednesday (and the bottle tipped over, once it's empty)

import { objectRegion } from "../art/regions";
import { makeCanvas, pixelArt } from "../engine/pixelart";
import { draw, has, REGIONS, SHEETS } from "../engine/sprites";
import { COAT_EYES, LORE_SPRITES } from "./critter-lore-sprites";
import { report } from "./critter-util";

SHEETS.critters ??= "sprites/critters.png";
SHEETS.companions ??= "sprites/companions.png";
SHEETS.raccoons ??= "sprites/raccoons.png";

function cell(key: string, sheet: string, x: number, y: number, w: number, h: number): string {
  REGIONS[key] ??= { sheet, x, y, w, h };
  return key;
}

/** Parrot frames (companions.png row y=160, 16x16). Side frames face left; the rest face the camera. */
export const PARROT = {
  side: [0, 16, 32, 48].map((x, i) => cell(`critter.parrot.side.${i}`, "companions", x, 160, 16, 16)),
  flap: [64, 80, 96, 112].map((x, i) => cell(`critter.parrot.flap.${i}`, "companions", x, 160, 16, 16)),
  stand: [cell("critter.parrot.stand.0", "companions", 128, 160, 16, 16), cell("critter.parrot.stand.1", "companions", 144, 160, 16, 16)],
  /** Head turned, beak open: chattering. */
  squawk: cell("critter.parrot.squawk", "companions", 160, 160, 16, 16),
};

/** Seagull frames (critters.png, 32x32, facing left): wings through a full flap, then gliding. */
export const GULL = {
  fly: [0, 32, 64, 96].map((x, i) => cell(`critter.gull.fly.${i}`, "critters", x, 32, 32, 32)),
  /** Wings spread wide: the glide. */
  glide: "critter.gull.fly.0",
  /** The standing gull, whole (beak to tail), for toasts. */
  icon: cell("critter.gull.icon", "critters", 5, 14, 22, 17),
};

/** Opossum (critters.png row y=480, 32x32): three looking-at-you frames, and a 4-frame walk to the right. */
export const POSSUM = {
  look: [0, 32, 96].map((x, i) => cell(`critter.opossum.look.${i}`, "critters", x, 480, 32, 32)),
  walk: [160, 192, 224, 256].map((x, i) => cell(`critter.opossum.walk.${i}`, "critters", x, 480, 32, 32)),
};

/** Raccoons trotting (raccoons.png, 32x32, 8 frames each way; their shadow is baked in). */
export const RACCOON_RUN = {
  left: [0, 32, 64, 96, 128, 160, 192, 224].map((x, i) => cell(`critter.raccoon.run.l${i}`, "raccoons", x, 32, 32, 32)),
  right: [0, 32, 64, 96, 128, 160, 192, 224].map((x, i) => cell(`critter.raccoon.run.r${i}`, "raccoons", x, 96, 32, 32)),
};

/** The grey raccoon trotting (raccoons.png, faces left: mirror it to go right). */
export const RACCOON2_RUN = {
  left: [256, 288, 320, 352, 384, 416, 448, 480].map((x, i) => cell(`critter.raccoon2.run.l${i}`, "raccoons", x, 32, 32, 32)),
};

/** The brown and the grey raccoon arm in arm, swaying (8 frames, shadow baked, feet on row 27). */
export const RACCOON_PAIR = [256, 288, 320, 352, 384, 416, 448, 480].map((x, i) => cell(`critter.raccoon.pair.${i}`, "raccoons", x, 64, 32, 32));

/** Stardew Wine, for Wine Wednesday on the picnic blanket. */
export const WINE = cell("critter.wine", "objects", objectRegion(348).x, objectRegion(348).y, 16, 16);
/** ...and the same bottle knocked over (a quarter turn clockwise: the neck lands on the blanket). */
export const WINE_TIPPED = "critter.wine.tipped";

let done = false;

export function registerLoreArt(): void {
  if (done) return;
  done = true;
  for (const [key, s] of Object.entries(LORE_SPRITES)) {
    try {
      pixelArt(key, s.rows, s.pal);
    } catch (err) {
      report(`art ${key}`, err);
    }
  }
  // A toast icon: the top of the trench coat (fedora, two glinting eyes, the collar).
  try {
    const coat = LORE_SPRITES["critter.trenchcoat.0"]!;
    const art = pixelArt(null, coat.rows, coat.pal);
    makeCanvas("critter.trenchcoat.icon", 16, 16, (ctx) => {
      ctx.drawImage(art, 0, 0, 16, 16, 0, 0, 16, 16);
      ctx.fillStyle = "#ffe066";
      ctx.fillRect(COAT_EYES.x, COAT_EYES.y, 1, 1);
      ctx.fillRect(COAT_EYES.x + COAT_EYES.gap, COAT_EYES.y, 1, 1);
    });
  } catch (err) {
    report("art trenchcoat.icon", err);
  }
  try {
    if (has(WINE)) {
      makeCanvas(WINE_TIPPED, 16, 16, (ctx) => {
        ctx.translate(16, 0);
        ctx.rotate(Math.PI / 2);
        draw(ctx, WINE, 0, 0);
      });
    }
  } catch (err) {
    report("art wine.tipped", err);
  }
}
