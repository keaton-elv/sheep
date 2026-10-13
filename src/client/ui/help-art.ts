// Little icons for the "How it works" journal that nobody else draws.

import { objectRegion } from "../art/regions";
import { pixelArt } from "../engine/pixelart";
import { REGIONS, SHEETS } from "../engine/sprites";

// The journal shows a lamb and a hat from the real sheets. Their owners register these too; this
// just makes sure they load even if the journal is the only thing that needs them.
SHEETS.sheepBaby ??= "sprites/sheep_baby.png";
SHEETS.animalHats ??= "sprites/animal_hats.png";
// A bottle of wine (object #348) for the Wine Wednesday hint.
REGIONS["ui.icon.wine"] ??= objectRegion(348);

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

  // A little rubber stamp (wooden handle, red ink pad) for the ORIGINAL PLAN hint.
  pixelArt("ui.icon.stamp", [
    "................",
    "......oooo......",
    ".....oLLMMo.....",
    "....oLLMMMDo....",
    "....oMMMMDDo....",
    ".....ooMDoo.....",
    "......oMDo......",
    "......oMDo......",
    "...oooooooooo...",
    "..oGGGGGGGGGGo..",
    "..oggggggggggo..",
    "..oRRRRRRRRRRo..",
    "...oooooooooo...",
    "................",
    "..iii.iiii.iii..",
    "................",
  ], { o: "#4a1f0a", L: "#f2a65a", M: "#c25f17", D: "#8a3c0e", G: "#9a8f8a", g: "#6b625e", R: "#c4121a", i: "#e0303a" });
}
