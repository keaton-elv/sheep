// Little icons for the "How the farm works" journal that nobody else draws.

import { pixelArt } from "../engine/pixelart";
import { SHEETS } from "../engine/sprites";

// The journal shows a lamb and a hat from the real sheets. Their owners register these too; this
// just makes sure they load even if the journal is the only thing that needs them.
SHEETS.sheepBaby ??= "sprites/sheep_baby.png";
SHEETS.animalHats ??= "sprites/animal_hats.png";

let registered = false;

export function registerHelpArt(): void {
  if (registered) return;
  registered = true;

  // Snickers: a grey Himalayan (cream fluff, smoky face mask and ears, blue eyes) with his tiny
  // tongue sticking out, as always. Same colors as his in-game sprite (snickers-art.ts).
  pixelArt("ui.icon.snickers", [
    "................",
    "..o.........o...",
    ".odo.......odo..",
    ".oDdo.....odDo..",
    ".oDDdooooodDDo..",
    "oCCDCCCCCCCDCCo.",
    "oCCCcDDDDDcCCCo.",
    "oCCDbbDDDbbDCCo.",
    "oCCDbkDDDkbDCCo.",
    "ocCCDDDpDDDCCco.",
    ".ocCcDdDdDcCco..",
    "..occDDdDDcco...",
    "...oocctccoo....",
    ".....oottoo.....",
    "......oooo......",
    "................",
  ], { o: "#3f3440", C: "#f6eddd", c: "#d8c6a8", D: "#6e6977", d: "#46424e", b: "#6fa8e8", k: "#25212b", p: "#34303b", t: "#f2869d" });
}
