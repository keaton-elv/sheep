// HUD art: Stardew's real day/time box and money box (clock.png), its dial hand, weather and
// season icons, little money-dial digits, and the TV for the farm report.
//
// clock.png (131x59) keeps the game's own layout:
//   (0,0) 72x59   the time box (sun/moon dial, date window, two icon holes, time window) with the
//                 money box hanging under it on two posts
//   (72,0) 7x19   the dial's hand (points up; pivots at its (3,17))
//   (80+13c, 9r)  12x8 icons. Row 0: spring, summer, fall, winter. Row 1: petals (windy spring),
//                 festival confetti, rain (umbrella), sunny. Row 2: wedding heart, snow,
//                 leaves (windy fall), storm.
// Hand-drawn art under the same keys is the fallback if the sheet doesn't load.

import { makeCanvas, pixelArt } from "../engine/pixelart";
import { REGIONS, SHEETS } from "../engine/sprites";

// Registered at import time (main.ts imports the HUD before loadSprites runs), so the sheet loads
// with everything else. It's tiny (2.6 KB).
SHEETS.clock ??= "sprites/clock.png";
REGIONS["ui.hud.clockbox"] = { sheet: "clock", x: 0, y: 0, w: 72, h: 59 };
REGIONS["ui.hud.hand"] = { sheet: "clock", x: 72, y: 0, w: 7, h: 19 };
const icon = (col: number, row: number) => ({ sheet: "clock", x: 80 + col * 13, y: row * 9, w: 12, h: 8 });
REGIONS["ui.season.spring"] = icon(0, 0);
REGIONS["ui.season.summer"] = icon(1, 0);
REGIONS["ui.season.fall"] = icon(2, 0);
REGIONS["ui.season.winter"] = icon(3, 0);
REGIONS["ui.weather.petals"] = icon(0, 1);
REGIONS["ui.weather.windy"] = icon(0, 1);
REGIONS["ui.weather.festival"] = icon(1, 1);
REGIONS["ui.weather.rain"] = icon(2, 1);
REGIONS["ui.weather.sunny"] = icon(3, 1);
REGIONS["ui.weather.wedding"] = icon(0, 2);
REGIONS["ui.weather.snow"] = icon(1, 2);
REGIONS["ui.weather.leaves"] = icon(2, 2);
REGIONS["ui.weather.storm"] = icon(3, 2);
// (Stardew has no cloudy or foggy icon: those two are hand-drawn below, in the same style.)

/** Clock widget geometry, in game pixels. The widget is 76x62 (= layout.hudClock). */
export const CLOCK = {
  w: 76,
  h: 62,
  /** Where the 72x59 box sits inside the widget (flush right, flush top). */
  box: { x: 4, y: 0 },
  /** The dial hand pivots here (the middle of the dial's flat edge)... */
  pivot: { x: 26, y: 22 },
  /** ...around this point of the hand sprite. */
  handOrigin: { x: 3, y: 17 },
  /** Text windows. */
  date: { x: 31, y: 4, w: 39, h: 10 },
  time: { x: 31, y: 27, w: 39, h: 9 },
  /** The two 12x8 icon holes. */
  weather: { x: 33, y: 16 },
  season: { x: 57, y: 16 },
  /** The tappable time box (dial + windows, down to the posts). */
  face: { x: 4, y: 0, w: 72, h: 43 },
  /** The money box (our WOOL counter), its eight 5x8 digit slots, and the wool icon on its end cap. */
  money: { x: 11, y: 44, w: 65, h: 15 },
  digits: { x: 21, y: 48, w: 5, h: 8, step: 6, count: 8 },
  wool: { x: 6, y: 44 },
} as const;

/** Money-dial digits: 4x6 glyphs drawn 1px in from the top-left of each 5x8 slot. */
const DIGITS: Record<string, string[]> = {
  "0": [".##.", "#..#", "#..#", "#..#", "#..#", ".##."],
  "1": [".#..", "##..", ".#..", ".#..", ".#..", "###."],
  "2": [".##.", "#..#", "..#.", ".#..", "#...", "####"],
  "3": ["###.", "...#", ".##.", "...#", "...#", "###."],
  "4": ["#..#", "#..#", "####", "...#", "...#", "...#"],
  "5": ["####", "#...", "###.", "...#", "...#", "###."],
  "6": [".##.", "#...", "###.", "#..#", "#..#", ".##."],
  "7": ["####", "...#", "..#.", "..#.", ".#..", ".#.."],
  "8": [".##.", "#..#", ".##.", "#..#", "#..#", ".##."],
  "9": [".##.", "#..#", "#..#", ".###", "...#", ".##."],
};
const DIGIT_INK = "#8a3005";

let registered = false;

export function registerHudArt(): void {
  if (registered) return;
  registered = true;

  for (const [d, rows] of Object.entries(DIGITS)) pixelArt(`ui.hud.digit.${d}`, rows, { "#": DIGIT_INK });

  // Cloudy and fog, drawn like the real 12x8 icons: full-bleed, darker top row and right edge.
  pixelArt("ui.weather.cloudy", [
    "AAAAAAAAAAAA",
    "BBBBBBBBBBBA",
    "BBBWWBWWBBBA",
    "BBWWWWWWWBBA",
    "BWWWWWWWWwBA",
    "BWwwwwwwwgBA",
    "BBgggggggBBA",
    "BBBBBBBBBBBA",
  ], { A: "#7ab0d6", B: "#a9d6f2", W: "#ffffff", w: "#e2edf6", g: "#b8c8d8" });
  pixelArt("ui.weather.fog", [
    "AAAAAAAAAAAA",
    "BBBBBBBBBBBA",
    "BWWWWWWwBBBA",
    "BBggggggBBBA",
    "BBBBWWWWWWwA",
    "BBBBBggggggA",
    "BWWWWWwBBBBA",
    "BBgggggBBBBA",
  ], { A: "#8e9bb0", B: "#bcc6d4", W: "#f6f8fb", w: "#dfe5ee", g: "#a8b3c4" });

  registerFallbacks();
}

// ---------- fallbacks (only seen if clock.png fails to load) ----------

const WOOD = { o: "#5b2b2a", D: "#853605", M: "#b14e05", L: "#dc7b05", H: "#fa9305", P: "#ffd787", p: "#f2bf72" };

function registerFallbacks(): void {
  // The box, built from the same geometry as the real one.
  makeCanvas("ui.hud.clockbox", 72, 59, (ctx) => {
    const rect = (x: number, y: number, w: number, h: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    };
    const panel = (x: number, y: number, w: number, h: number) => {
      rect(x, y, w, h, WOOD.o);
      rect(x + 1, y + 1, w - 2, h - 2, WOOD.H);
      rect(x + 2, y + 2, w - 4, h - 4, WOOD.M);
      rect(x + 2, y + h - 3, w - 4, 1, WOOD.D);
    };
    const pane = (x: number, y: number, w: number, h: number) => {
      rect(x - 1, y - 1, w + 2, h + 2, WOOD.D);
      rect(x, y, w, h, WOOD.P);
      rect(x, y + h - 2, w, 2, WOOD.p);
    };
    // Dial: a half disc of sky (night at the top, day at the bottom).
    for (let y = 0; y < 39; y++) {
      for (let x = 0; x < 24; x++) {
        const d = Math.hypot(x - 22.5, y - 19);
        if (d > 19.5) continue;
        const sky = y < 13 ? "#8f86c9" : y < 19 ? "#9bb6ef" : y < 26 ? "#a1edff" : "#bff2ff";
        rect(x, y, 1, 1, d > 18.5 ? WOOD.o : d > 17 ? WOOD.L : sky);
      }
    }
    rect(10, 8, 4, 4, "#ffffff");
    rect(10, 27, 4, 4, "#fffe80");
    panel(22, 0, 49, 39);
    pane(27, 4, 39, 10);
    pane(27, 27, 39, 9);
    ctx.clearRect(29, 16, 12, 8);
    ctx.clearRect(53, 16, 12, 8);
    rect(42, 16, 10, 8, WOOD.L);
    // Posts and the money box.
    rect(18, 39, 3, 5, WOOD.o);
    rect(19, 39, 1, 5, WOOD.L);
    rect(58, 39, 3, 5, WOOD.o);
    rect(59, 39, 1, 5, WOOD.L);
    panel(7, 44, 65, 15);
    rect(16, 47, 49, 9, WOOD.D);
    for (let i = 0; i < 8; i++) rect(17 + i * 6, 48, 5, 8, WOOD.P);
  });

  pixelArt("ui.hud.hand", [
    "...o...",
    "..oYo..",
    "..oYo..",
    ".oYYYo.",
    ".oYYYo.",
    "oYYYYYo",
    "oYYOYYo",
    "oooOooo",
    "..oOo..",
    "..oOo..",
    "..oYo..",
    "..oYo..",
    "..oYo..",
    "..oYo..",
    "..oYo..",
    "..oOo..",
    "..ooo..",
    "..oko..",
    "...o...",
  ], { o: "#7a3405", Y: "#f7ba00", O: "#dc7b05", k: "#5b2b2a" });

  // Hand-drawn weather & season icons (12x8 with a little frame).
  pixelArt("ui.weather.sunny", [
    ".oooooooooo.",
    "oBBBByyBBBBo",
    "oByBYYYYByBo",
    "oBBYYYYYYBBo",
    "oBBYYYYYYBBo",
    "oByBYYYYByBo",
    "oBBBByyBBBBo",
    ".oooooooooo.",
  ], { o: "#2e4a7a", B: "#8fd3ff", Y: "#ffe066", y: "#f0a020" });

  pixelArt("ui.weather.rain", [
    ".oooooooooo.",
    "oBBBBGGBBBBo",
    "oBBGGGGGGBBo",
    "oBGGGGGGGGBo",
    "oBBggggggBBo",
    "oBdBBdBBdBBo",
    "oBBdBBdBBdBo",
    ".oooooooooo.",
  ], { o: "#1d2f55", B: "#3f6aa8", G: "#d5dde8", g: "#9aa8bd", d: "#9be3ff" });

  pixelArt("ui.weather.storm", [
    ".oooooooooo.",
    "oBBBGGGGBBBo",
    "oBBGGGGGGGBo",
    "oBGGggYgggBo",
    "oBBBBYYBBBBo",
    "oBBBYYBBBBBo",
    "oBBBBYBBBBBo",
    ".oooooooooo.",
  ], { o: "#1b1636", B: "#4b3f7a", G: "#a9a3c4", g: "#7d769c", Y: "#ffe066" });

  pixelArt("ui.weather.snow", [
    ".oooooooooo.",
    "oBBBBWBBBBBo",
    "oBWBWWWBBWBo",
    "oBBBBWBBWWWo",
    "oBBWBBBBBWBo",
    "oBWWWBBWBBBo",
    "oBBWBBBBBBBo",
    ".oooooooooo.",
  ], { o: "#3a5a85", B: "#bfe3ff", W: "#ffffff" });

  const windy = [
    ".oooooooooo.",
    "oBBBBBBBlBBo",
    "oBWWWWWBllBo",
    "oBBBBBBWBBBo",
    "oBWWWWWWBBBo",
    "oBBBBBBBWBlo",
    "oBWWWWWWBBBo",
    ".oooooooooo.",
  ];
  pixelArt("ui.weather.windy", windy, { o: "#2f5a5a", B: "#9fdcd0", W: "#ffffff", l: "#ff8fb8" });
  pixelArt("ui.weather.petals", windy, { o: "#2f5a5a", B: "#9fdcd0", W: "#ffffff", l: "#ff8fb8" });
  pixelArt("ui.weather.leaves", windy, { o: "#5a2a0a", B: "#f7c070", W: "#fff3dc", l: "#e0621f" });

  pixelArt("ui.weather.festival", [
    ".oooooooooo.",
    "oBrBBBgBBBBo",
    "oBBBBBBBBrBo",
    "oByBBpBBBBBo",
    "oBBBBBBByBBo",
    "oBgBBBrBBBBo",
    "oBBBBBBBBgBo",
    ".oooooooooo.",
  ], { o: "#2e4a7a", B: "#a9e8ff", r: "#ff4a5a", g: "#3fbf3a", y: "#ffd23f", p: "#c86bff" });

  pixelArt("ui.weather.wedding", [
    ".oooooooooo.",
    "oWWWWWWWWWWo",
    "oWWRRWRRWWWo",
    "oWRRRRRRRWWo",
    "oWWRRRRRWWWo",
    "oWWWRRRWWWWo",
    "oWWWWRWWWWWo",
    ".oooooooooo.",
  ], { o: "#8a6a5a", W: "#fff8f0", R: "#ff5a3a" });

  pixelArt("ui.season.spring", [
    ".oooooooooo.",
    "oGGGGpGGGGGo",
    "oGGGpPpGGGGo",
    "oGGpPyPpGGGo",
    "oGGGpPpGlGGo",
    "oGGGGpGllGGo",
    "oGGGGGllGGGo",
    ".oooooooooo.",
  ], { o: "#1f4a1a", G: "#7fd15a", p: "#ff8fb8", P: "#ffd1e3", y: "#ffe066", l: "#2f8a2a" });

  pixelArt("ui.season.summer", [
    ".oooooooooo.",
    "oBBBByYyBBBo",
    "oBBByYcYyBBo",
    "oBBBYcccYBBo",
    "oBBByYcYyBBo",
    "oBBBByYgBBBo",
    "oBBBBBgBBBBo",
    ".oooooooooo.",
  ], { o: "#7a4a0a", B: "#ffd27a", Y: "#ffe94a", y: "#f0a020", c: "#7a3e12", g: "#3f8a2a" });

  pixelArt("ui.season.fall", [
    ".oooooooooo.",
    "oBBBBrBBBBBo",
    "oBBrBRrBrBBo",
    "oBBBRRRRRBBo",
    "oBBrRRRRrBBo",
    "oBBBBRRBBBBo",
    "oBBBBBsBBBBo",
    ".oooooooooo.",
  ], { o: "#5a2a0a", B: "#f7c070", R: "#e0621f", r: "#b8401a", s: "#6b3a12" });

  pixelArt("ui.season.winter", [
    ".oooooooooo.",
    "oBBBBBBBBBBo",
    "oBBGgBBgGBBo",
    "oBGGGgGGGBBo",
    "oBBGrrrGBBBo",
    "oBBBrRrBBBBo",
    "oBBBBrBBBBBo",
    ".oooooooooo.",
  ], { o: "#2a4a6b", B: "#d8eeff", G: "#2f8a3a", g: "#1f5e2a", r: "#a8122a", R: "#ff4a5a" });

  pixelArt("ui.icon.tv", [
    "................",
    "....o.....o.....",
    ".....o...o......",
    "......o.o.......",
    ".ooooooooooooo..",
    "oWWWWWWWWWWWWWo.",
    "oWooooooooooWWo.",
    "oWoSSSSSSSSoWko.",
    "oWoSsSSSSSSoWWo.",
    "oWoSSSSSSSSoWko.",
    "oWoSSSSSSSSoWWo.",
    "oWooooooooooWWo.",
    "oDDDDDDDDDDDDDo.",
    ".ooDooooooooDoo.",
    "..ooo......ooo..",
    "................",
  ], { o: "#3b2316", W: "#c47a35", D: "#8a4a1c", S: "#7fd0ff", s: "#e6f7ff", k: "#ffd23f" });
}
