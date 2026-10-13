// Art for the farm sign dialog: the real Stardew wood sign from craftables.png (big craftable
// #37). Without the sheet the dialog just shows the name plank.

import { REGIONS, SHEETS } from "../engine/sprites";

// Registered at import time, before loadSprites() runs. `??=` keeps whoever else maps it.
SHEETS.craftables ??= "sprites/craftables.png";

let done = false;

export function registerFarmSignArt(): void {
  if (done) return;
  done = true;
  REGIONS["ui.menu.woodsign"] ??= { sheet: "craftables", x: 80, y: 128, w: 16, h: 32 };
}
