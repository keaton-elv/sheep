// HUD art: the Stardew clock box (with its day/night dial), weather & season icons, the TV.
// Real Stardew regions under the same keys replace the hand-drawn ones automatically.

import { pixelArt } from "../engine/pixelart";

/** Clock geometry, in game pixels (the whole widget is 76x62, matching layout.hudClock). */
export const CLOCK = {
  w: 76,
  h: 62,
  /** Pivot of the dial's hand (center of the half-disc's flat edge). */
  pivot: { x: 27, y: 22 },
  handLength: 13,
  date: { x: 31, y: 4, w: 41, h: 12 },
  icons: { y: 18, weatherX: 36, seasonX: 56 },
  time: { x: 31, y: 28, w: 41, h: 12 },
  wool: { box: { x: 14, y: 44, w: 62, h: 18 }, icon: { x: 16, y: 45 }, digits: { x: 34, y: 48, w: 37, h: 10 } },
} as const;

/** The clock frame (generated from a shape: rect + round dial side, beveled like the menus). */
const CLOCK_ROWS = [
  "......................oooooooooooooooooooooooooooooooooooooooooooooooooooo..",
  "...................oooLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLo.",
  "................oooLLLMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMLo",
  "...............oLLLMMMDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDMDo",
  ".............ooLMMMDDDppppppppppqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpDMDo",
  "............oLLMDDDpppPPPPPPPPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "...........oLMMDpppPPPPoooooDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "..........oLMDDpPPPPPooohhhoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".........oLMDppPPPPoohhhsssoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "........oLMDpPPPPoohhssssssoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "........oLMDpPPPoohysssssssoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".......oLMDpPPPoohYYYssSSSSoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".......oLMDpPPoohyYYYySSSSSoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "......oLMDpPPPohssYYYSSSSSSoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "......oLMDpPPohhsssySSSSSSSoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".....oLMDpPPPohsssSSSSSSSSSoDPPPqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqPDMDo",
  ".....oLMDpPPohsssSSSSSSSSSSoDPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPDMDo",
  ".....oLMDpPPohsssSSSSSSSSSSoDPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPDMDo",
  ".....oLMDpPoohssSSSSSSSSSSSoDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPohsssSSSSSSSSSSSoDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPohsssSSSSSSSSSSSoDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPohsssSSSSSSSSSSSoDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPoKoooooooooooooooDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPoKnnnNNNNNNNNNNNoDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPoKnnnNNNNNNNNNNNoDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPoKnnnNNNNNNNNNNNoDPPpppppppppppppppppppppppppppppppppppppppppDMDo",
  ".....oLMDpPooKnnNNNNNNNNNNNoDPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPDMDo",
  ".....oLMDpPPoKnnnNNNNNNwNNNoDPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPDMDo",
  ".....oLMDpPPoKnnnNNNNNNNNNNoDPPPqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqPDMDo",
  "......oLMDpPPoKnnnNmmNNNNNNoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "......oLMDpPPoKKnnmmNNNNNNNoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".......oLMDpPPoKnnmmNNNNNNNoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".......oLMDpPPooKnmmnNNNNNNoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "........oLMDpPwooKnmmnnNNNNoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "........oLMDpPPPooKKnnnnnnnoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".........oLMDpPPPooKKwnnnnnoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "..........oLMDDpPPPooKKKnnnoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "...........oLMMDpPPPPoooKKKoDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  "............oLDMDDDpPPPoooooDPPqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqDMDo",
  ".............ooLMMMDDDpPPPPPPPPPqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqPDMDo",
  "...............oLDDMMMDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDMDo",
  "................oooLDDMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMDo",
  "...................oooLDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDo.",
  "......................oooooooooooooooooooooooooooooooooooooooooooooooooooo..",
  "................oooooooooooooooooooooooooooooooooooooooooooooooooooooooooo..",
  "...............oLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLo.",
  "..............oLDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDLo",
  "..............oLDpppppppppppppppppkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkppDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPkKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKhPDDo",
  "..............oLDpPPPPPPPPPPPPPPPPhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhPPDDo",
  "..............oLDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDo",
  "...............oLDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDo.",
  "................oooooooooooooooooooooooooooooooooooooooooooooooooooooooooo..",
];

const CLOCK_PALETTE = {
  o: "#4a1f0a",
  L: "#e98a2b",
  M: "#c25f17",
  D: "#8a3c0e",
  P: "#ffd795",
  p: "#f2bf72",
  Q: "#fff0c9",
  q: "#e9b56a",
  K: "#5a2a10",
  k: "#3b1606",
  h: "#a8622a",
  S: "#9ad8ff",
  s: "#c8ecff",
  N: "#2b2f6b",
  n: "#1d1f4d",
  Y: "#ffe066",
  y: "#f0a020",
  m: "#fff4c8",
  w: "#ffffff",
};

let registered = false;

export function registerHudArt(): void {
  if (registered) return;
  registered = true;

  pixelArt("ui.hud.clock", CLOCK_ROWS, CLOCK_PALETTE);

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

  pixelArt("ui.weather.cloudy", [
    ".oooooooooo.",
    "oBBBBBBBBBBo",
    "oBBBBWWBBBBo",
    "oBBWWWWWWBBo",
    "oBWWWWWWWWBo",
    "oBBwwwwwwBBo",
    "oBBBBBBBBBBo",
    ".oooooooooo.",
  ], { o: "#3a4a66", B: "#a9c4dd", W: "#ffffff", w: "#d5e2ee" });

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

  pixelArt("ui.weather.fog", [
    ".oooooooooo.",
    "oBBBBBBBBBBo",
    "oBWWWWWWBBBo",
    "oBBBBBBBBBBo",
    "oBBBWWWWWWBo",
    "oBBBBBBBBBBo",
    "oBWWWWWBBBBo",
    ".oooooooooo.",
  ], { o: "#4a4f5e", B: "#a7adbb", W: "#eef1f6" });

  pixelArt("ui.weather.windy", [
    ".oooooooooo.",
    "oBBBBBBBlBBo",
    "oBWWWWWBllBo",
    "oBBBBBBWBBBo",
    "oBWWWWWWBBBo",
    "oBBBBBBBWBlo",
    "oBWWWWWWBBBo",
    ".oooooooooo.",
  ], { o: "#2f5a5a", B: "#9fdcd0", W: "#ffffff", l: "#6fbf3a" });

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
