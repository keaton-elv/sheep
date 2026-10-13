// Real Stardew sprites for shared keys. Imported by main.ts before loadSprites() runs.
// Hand-drawn art registered under the same keys stays as the fallback.

import { REGIONS, SHEETS, type Region } from "../engine/sprites";

SHEETS.objects = "sprites/objects.png";
SHEETS.tools = "sprites/tools.png";

/**
 * The objects sheet keeps the game's original layout in its first 24 columns, so an item's
 * in-game id (e.g. Wool = 440) maps straight to its 16x16 cell.
 */
export function objectRegion(id: number): Region {
  return { sheet: "objects", x: (id % 24) * 16, y: Math.floor(id / 24) * 16, w: 16, h: 16 };
}

/** Handy object ids (Stardew item ids). */
export const OBJECT_IDS = {
  wool: 440,
  cloth: 428,
  stardrop: 434,
  pinkCake: 221,
  hay: 178,
  pumpkin: 276,
  leek: 20,
  daffodil: 18,
  dandelion: 22,
  spiceBerry: 396,
  sweetPea: 402,
  blackberry: 410,
  hazelnut: 408,
  commonMushroom: 404,
  holly: 283,
  crystalFruit: 414,
  egg: 176,
} as const;

REGIONS["item.wool"] = objectRegion(OBJECT_IDS.wool);
REGIONS["item.cloth"] = objectRegion(OBJECT_IDS.cloth);
REGIONS["item.stardrop"] = objectRegion(OBJECT_IDS.stardrop);
REGIONS["item.pinkcake"] = objectRegion(OBJECT_IDS.pinkCake);
REGIONS["item.hay"] = objectRegion(OBJECT_IDS.hay);

// The real shears from the tools sheet (blades point up-left).
REGIONS["tool.shears"] = { sheet: "tools", x: 112, y: 0, w: 16, h: 16 };
