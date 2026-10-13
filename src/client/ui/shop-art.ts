// Art for the carpenter's shop sign: the real Stardew axe from tools.png (no shopkeeper portraits
// on this farm). Without the tools sheet the sign simply goes without an icon.

import { REGIONS, SHEETS } from "../engine/sprites";

// Registered at import time, before loadSprites() runs. `??=` keeps whoever else maps it.
SHEETS.tools ??= "sprites/tools.png";

let done = false;

export function registerShopArt(): void {
  if (done) return;
  done = true;
  // The basic axe, mid-swing, which reads nicely as a little carpentry icon.
  REGIONS["ui.shop.axe"] ??= { sheet: "tools", x: 80, y: 32, w: 16, h: 16 };
}
