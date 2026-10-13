// Tiny hand-drawn icons for Pierre's billboard: sheep faces for plans, a festival flag.

import { pixelArt } from "../engine/pixelart";

let done = false;

const SHEEP = { o: "#513f3f", W: "#fff6dc", w: "#dcc9a5", F: "#f3dfba", f: "#cdb48c", E: "#b49c78", k: "#2b2020", n: "#c98a7a" };

export function registerCalendarArt(): void {
  if (done) return;
  done = true;

  // 13x11 woolly sheep face (a plan still to do).
  pixelArt(
    "ui.sheephead",
    [
      "....ooooo....",
      "..ooWWWWWoo..",
      ".oWWWWWWWWwo.",
      "ooooWWWWWwooo",
      "oEEEoFFFFoEEo",
      "ooooFFFFFFooo",
      ".owFkFFFkFwo.",
      ".owFFFFFFFwo.",
      "..owFFnFFwo..",
      "...owwwwwo...",
      "....ooooo....",
    ],
    SHEEP,
  );

  // Same size, freshly sheared (a plan you did!).
  pixelArt(
    "ui.sheephead.sheared",
    [
      ".............",
      ".............",
      "....ooooo....",
      "ooo.oFFFo.ooo",
      "oEEooFFFooEEo",
      "oooFFFFFFFooo",
      "..oFkFFFkFo..",
      "..oFFFFFFFo..",
      "...oFFnFFo...",
      "....offfo....",
      ".....ooo.....",
    ],
    SHEEP,
  );

  // Festival flag, like the little flags on Pierre's billboard.
  pixelArt(
    "ui.festflag",
    ["oo.....", "oRRRo..", "oRRRRRo", "oRrRRo.", "oRro...", "oo.....", "o......", "o......", "oo....."],
    { o: "#5a2c14", R: "#e8344b", r: "#ffd84a" },
  );
}
