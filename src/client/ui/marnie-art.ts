// Hand-drawn art for the sheep menus: plan-category icons, a tiny sheep and a gold coin.
// Real Stardew regions (REGIONS in engine/sprites.ts) replace any of these keys automatically
// once mapped. (No character portraits on this farm.)
//
// Keys other modules may reuse: "ui.cat.<category>" for every CATEGORIES entry,
// "ui.sheep" (16x16 sheep icon), "ranch.coin" (8x8 gold coin).

import { pixelArt } from "../engine/pixelart";
import { has } from "../engine/sprites";
import type { Category } from "../../shared/types";

let registered = false;

/** Registers the art (idempotent). Runs on import so the keys exist before any init(). */
export function registerSheepMenuArt(): void {
  if (registered) return;
  registered = true;
  pixelArt(
    "ui.cat.date",
    [
      "................",
      "...ooo...ooo....",
      "..oPPPo.oWWWo...",
      ".oPPyPPooWyWWo..",
      ".oPPPPpRRoWWwo..",
      ".opPPpRRRRowwo..",
      "..oopRRyRRRoo...",
      ".oGGoRRRRRrGGo..",
      "oGGgooRrrrogGGo.",
      ".ogCCCooooCCCgo.",
      "..oCCCCCCCCCco..",
      "...oBBBbbBBBo...",
      "....ocBCCBco....",
      ".....oBCCBo.....",
      "......oBBo......",
      ".......oo.......",
    ],
    { "o": "#5a1f2e", "P": "#ff9fbf", "p": "#e0507a", "W": "#fff7f2", "w": "#e8c8d0", "R": "#e8344b", "r": "#a01f38", "y": "#ffd84a", "G": "#6cba48", "g": "#3d7a2a", "C": "#f8ecd2", "c": "#d6bb92", "B": "#ff6f9a", "b": "#c8406a" },
  );
  pixelArt(
    "ui.cat.workshop",
    [
      ".............oo.",
      "............oHo.",
      "...oooooo..oHHo.",
      "..oKKKKKKooHho..",
      ".oKRRKBBKoMMo...",
      ".oKRrKBbKoMmo...",
      "oKKKKKKKoTTo....",
      "oKYYKKKoTTTo....",
      "oKYyKKKKoTo.....",
      "oKKKKooKKoKo....",
      ".okKo..oKKKKo...",
      ".okKKooKKGGKo...",
      "..okkKKKKGgko...",
      "...ookkkkkkoo...",
      ".....oooooo.....",
      "................",
    ],
    { "o": "#4a2410", "K": "#f2c98a", "k": "#c8904c", "R": "#e8443a", "r": "#a8281e", "B": "#4a8ae8", "b": "#2c5cb0", "Y": "#ffd84a", "y": "#d8a020", "G": "#5cc04a", "g": "#2f8a2a", "H": "#d8503a", "h": "#9a2e1e", "M": "#dfe4ea", "m": "#9aa2b1", "T": "#ff8fb1" },
  );
  pixelArt(
    "ui.cat.travel",
    [
      "................",
      "................",
      "......oooo......",
      ".....oMooMo.....",
      ".....oMo.oMo....",
      ".oooooooooooooo.",
      "oKKKSKKKKKKSKKKo",
      "oLLLSLLLLLLSLLLo",
      "oLLLSLLPPLLSLLLo",
      "oLLLMLPpPPLMLLLo",
      "oLLLSLLPPLLSLYLo",
      "oLLLSLLLLLLSLLLo",
      "olllsllllllslllo",
      "oDDDsDDDDDDsDDDo",
      ".oooooooooooooo.",
      "..oo........oo..",
    ],
    { "o": "#4a2410", "K": "#e09a52", "L": "#c47a3a", "l": "#a8622c", "D": "#7e4320", "S": "#f2d9a0", "s": "#c8a870", "M": "#e3e6ee", "P": "#ff8fb1", "p": "#ffffff", "Y": "#ffd84a" },
  );
  pixelArt(
    "ui.cat.adventure",
    [
      "........oooo....",
      "........oFFFo...",
      "........oFFFFo..",
      "........oFoo....",
      ".......oWo......",
      "......oWWwo.....",
      ".....oWWWwmo....",
      "..oo.oMWoWmmo...",
      ".oWWooMMMMmmmo..",
      "oWwMMoMMMMMmmmo.",
      "oMMMMMoMMMMmmmmo",
      "oMMMMMMoMMMmmmdo",
      "oMMMMMMMoMmmmddo",
      "oGGGGGGGGGGGgggo",
      "ogggGGGGGGgggggo",
      ".oooooooooooooo.",
    ],
    { "o": "#2e2a4a", "F": "#e8443a", "W": "#ffffff", "w": "#c8d8f0", "M": "#8f9cc8", "m": "#6a76a4", "d": "#4d5580", "G": "#6cba48", "g": "#3d8a2a" },
  );
  pixelArt(
    "ui.cat.food",
    [
      "................",
      ".......oo.......",
      "......oRho......",
      "....ooRRRooo....",
      "..ooPPorroPPoo..",
      ".oPPWPPooPPWPPo.",
      ".oPWWPPPPPPPWPo.",
      ".oPPPPPPPPPPPpo.",
      ".oWpppppppppWpo.",
      ".oCWCCWCCCWCCco.",
      ".oCCCCCCCCCCCco.",
      ".oppppppppppppo.",
      ".oCCCCCCCCCCcco.",
      "oQoccccccccccoQo",
      "oQQooooooooooQqo",
      ".oqqqqqqqqqqqqo.",
    ],
    { "o": "#5a2440", "R": "#e8344b", "r": "#a01f38", "h": "#ffb0b8", "P": "#ff9fc4", "p": "#e86a9a", "W": "#fff7f2", "C": "#fbe6c4", "c": "#e0bf92", "Q": "#e8f0f8", "q": "#a8b8cc" },
  );
  pixelArt(
    "ui.cat.cozy",
    [
      "....s...s.......",
      "...s...s...s....",
      "....s...s..s....",
      "...s...s..s.....",
      "................",
      "..oooooooooo....",
      "..oCCCCCCCCo....",
      ".oMcCCCCCCcMoo..",
      ".oMMMMMMMMMMoMo.",
      ".oMMHHMHHMMMo.Mo",
      ".oMMHHHHHMMMo.Mo",
      ".oMMMHHHMMMMoMo.",
      ".omMMMHMMMMmoo..",
      "..ommmmmmmmo....",
      "...oooooooo.....",
      "................",
    ],
    { "o": "#3e2418", "C": "#8a4e2a", "c": "#6a3418", "M": "#f2f6fa", "m": "#b8c4d4", "H": "#e8344b", "s": "#ffffffdd" },
  );
  pixelArt(
    "ui.cat.other",
    [
      ".......o........",
      "......oYo.......",
      "......oYo.......",
      ".....oYWYo......",
      ".....oYYYo......",
      "ooooooYYYoooooo.",
      "oYWYYYYYYYYYyyo.",
      ".oYYYYYYYYYyyo..",
      "..oYYYYYYYyyo...",
      "...oYYYYYyyo....",
      "...oYYYyyyyo....",
      "..oYYYyoyyyyo...",
      "..oYYyo.oyyyo...",
      ".oYyoo...ooyyo..",
      ".ooo.......ooo..",
      "................",
    ],
    { "o": "#6b3f0b", "Y": "#ffe066", "y": "#e8a92c", "W": "#ffffff" },
  );
  pixelArt(
    "ui.sheep",
    [
      "................",
      "................",
      "................",
      "....oo.ooo.ooo..",
      "..ooWWoWWWoWWWo.",
      ".oWWWWWWWWWWWWWo",
      "oWWWwWWWWWWoEFFE",
      "oWWWWWWWWWoEFkFo",
      "oWwWWWWWWWWoFFFo",
      "oWWWWWwWWWWWoco.",
      ".owWWWWWWWWWWo..",
      "..oowwwwwwwwo...",
      "...oLooooLo.....",
      "...oLo..oLo.....",
      "...oo...oo......",
      "................",
    ],
    { "o": "#5b3a29", "W": "#fff7e3", "w": "#e2d2b0", "F": "#f2d2b6", "E": "#d9a88a", "k": "#2b1b14", "L": "#6b4a34", "c": "#f0a0a0" },
  );
  pixelArt(
    "ranch.coin",
    [
      "..oooo..",
      ".oYYYYo.",
      "oYWYYYyo",
      "oYYyyYyo",
      "oYYyYYyo",
      "oYYYYyyo",
      ".oyyyyo.",
      "..oooo..",
    ],
    { "o": "#7a4a08", "Y": "#ffd84a", "y": "#e09a1a", "W": "#ffffff" },
  );
}

registerSheepMenuArt();

/** Sprite key of a plan category's icon (falls back to the star for unknown values). */
export function categoryIcon(category: Category | string): string {
  const key = `ui.cat.${category}`;
  return has(key) ? key : "ui.cat.other";
}
