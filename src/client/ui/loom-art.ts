// Art for the loom & chest menus: the real Stardew loom (a spinning wheel!) and chest from
// craftables.png when it's there, a hand-drawn loom as the fallback, and an extremely
// important pair of purple shorts.

import { pixelArt } from "../engine/pixelart";
import { registerArt, REGIONS, SHEETS } from "../engine/sprites";

// Big craftables are 16x32 cells, 8 per row; these sprites leave the top 8 rows empty, so
// the regions skip them. (The world registers the same sheet; ??= keeps whichever came first.)
SHEETS.craftables ??= "sprites/craftables.png";
const craft = (index: number) => ({ sheet: "craftables", x: (index % 8) * 16, y: Math.floor(index / 8) * 32 + 8, w: 16, h: 24 });
REGIONS["ui.menu.loom"] = craft(17);
REGIONS["ui.menu.loom.working"] = craft(18);
REGIONS["ui.menu.chest"] = craft(130);

let done = false;

export function registerLoomArt(): void {
  if (done) return;
  done = true;

  // 22x26 loom (fallback): wooden frame, warp threads, a bolt of cloth, a ball of wool on top.
  const loom = pixelArt(
    "ui.menu.loom",
    [
      "..........hh..........",
      "........hhWWhh........",
      ".......hWWWWWWh.......",
      "..oooo.hWWWWWWh.oooo..",
      "..oLMo.hWWWWwwh.oLNo..",
      "..oLMo..hhWwhh..oLNo..",
      ".ooooooooothooooooooo.",
      ".oLLLLLLLLtLLLLLLLLLo.",
      ".oooooooootoooooooooo.",
      "..oLMo.t.t.t.t.toLNo..",
      "..oLMo.t.t.t.t.toLNo..",
      "..oLMo.t.t.t.t.toLNo..",
      "..oLMossssssssssoLNo..",
      "..oLMosWWBBBBBBsoLNo..",
      "..oLMosbbbbbbbbsoLNo..",
      "..oLMosBBBBBBBBsoLNo..",
      "..oLMosbbbbbbbbsoLNo..",
      "..oLMossssssssssoLNo..",
      ".oooooooooooooooooooo.",
      ".oNNNNNNNNNNNNNNNNNNo.",
      ".oooooooooooooooooooo.",
      "..oLMssssssssssssLNo..",
      "..oLMsBBBBBBBBBBsLNo..",
      "..oLMssssssssssssLNo..",
      "..oLMo..........oLNo..",
      "..oooo..........oooo..",
    ],
    {
      o: "#4a1f0a",
      L: "#e98a2b",
      M: "#c25f17",
      N: "#8a3c0e",
      W: "#fff7e3",
      w: "#d8c7a4",
      t: "#efe6d2",
      B: "#dfe7f7",
      b: "#9fb2dd",
      s: "#3b3f6b",
      h: "#6b4a2f",
    },
  );
  registerArt("ui.menu.loom.working", loom);

  // Mayor Lewis's Lucky Purple Shorts. Nobody knows how they got in the chest.
  pixelArt(
    "item.shorts",
    [
      "................",
      "..oooooooooooo..",
      "..oLLLLYyLLLLo..",
      "..oooooooooooo..",
      "..oPPPPPPPPPpo..",
      ".oPLPPPPoPPPPpo.",
      ".oPLPPPPoPPPPpo.",
      ".oPPPPPPoPPPPpo.",
      "oPPPPPPooPPPPPpo",
      "oPPPPPo..oPPPPpo",
      "oPLPPPo..oPPPPpo",
      "opppppo..opppppo",
      "ooooooo..ooooooo",
      "................",
    ],
    { o: "#2e1838", P: "#8e4fbf", p: "#6a3596", L: "#b57be0", Y: "#ffe066", y: "#d9a62c" },
  );
}
