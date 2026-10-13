// Art for the loom & chest menus: the real Stardew loom (a spinning wheel!) and chest from
// craftables.png when it's there, a hand-drawn loom as the fallback, the piece of string
// Snickers keeps hidden in the chest (hand-drawn: Stardew has no string), and the little
// Community Center bundle sacks.

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

  // 16x16 Snickers's String: a loose loop of red string, tail wiggling off with a frayed pink end.
  // Light/dark pixels alternate along the strand so it reads as twisted string.
  pixelArt(
    "item.string",
    [
      ".....oooo.......",
      "...ooHRHRoo.....",
      "..oHRooooRRo....",
      ".oHoo....ooRo...",
      "oHo.......oro...",
      "oRo.......oRo...",
      "oRo......oro....",
      ".oRo....oRo.....",
      "..orooooro......",
      "...oRrRrHro.....",
      "....ooooRo......",
      ".......oHoo.oo..",
      "........oRHoHRo.",
      ".........ooRoofo",
      "...........o..o.",
      "................",
    ],
    {
      o: "#6a1428",
      R: "#e0384f",
      r: "#a8203a",
      H: "#ff8da0",
      f: "#ffc4cf",
    },
  );

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

  // 16x16 Community Center bundles: a little drawstring sack tied with red string, one color per
  // bundle (hand-drawn: the junimo note sheet isn't in the pack). Light from the top-left.
  const SACK = [
    "................",
    ".....o.oo.o.....",
    "....oKoKKoKo....",
    "....oKKHKKKo....",
    ".....okKKko.....",
    ".....oTTTto.....",
    "....oBBBBBBo....",
    "...oBHBBBBBbo...",
    "..oBHHBBBBBBbo..",
    ".oBHHBBBBBBBBbo.",
    ".oBHBBBBBBBBBbo.",
    ".oBBBBBBBBBBBbo.",
    ".obBBBBBBBBBbbo.",
    "..obbBBBBBbbbo..",
    "...oobbbbbbbo...",
    ".....ooooooo....",
  ];
  for (const [id, [B, H, b, K, k]] of Object.entries(SACK_COLORS)) {
    pixelArt(`ui.bundle.${id}`, SACK, { o: "#3b2a1a", T: "#c0503a", t: "#7a2a1a", B, H, b, K, k });
  }
}

/** Sack colors per bundle id: body, highlight, shade, ruffle, ruffle shade. */
const SACK_COLORS: Record<string, readonly [string, string, string, string, string]> = {
  spring: ["#5fae3a", "#a6e070", "#3c7a28", "#7cc84a", "#4f9a2c"],
  summer: ["#e8a51e", "#ffe07a", "#a8650e", "#f5c440", "#c8861a"],
  fall: ["#d0602a", "#f5a060", "#8e3414", "#e88040", "#b04a1c"],
  winter: ["#5a8fd8", "#a8d0ff", "#33589a", "#7aaef0", "#4672b8"],
  seeds: ["#9a6a3a", "#d0a070", "#5e3e1e", "#b8844a", "#7a522a"],
  junk: ["#9a62c8", "#d0a8f0", "#5e3488", "#b484e0", "#7a4aa8"],
};

/** The sack sprite for a bundle (a plain brown one for any bundle without its own color). */
export function bundleSackKey(id: string): string {
  return Object.hasOwn(SACK_COLORS, id) ? `ui.bundle.${id}` : "ui.bundle.seeds";
}
