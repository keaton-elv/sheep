// Hand-drawn toolbar & menu icons (16x16) plus the toolbar's wooden frames.
// Real Stardew regions under the same keys (REGIONS in sprites.ts) replace these automatically.

import { makeCanvas, pixelArt } from "../engine/pixelart";
import { has, REGIONS, SHEETS } from "../engine/sprites";
import { UI } from "../art/core";

// Real Stardew icons used by the HUD, toolbar and help journal, under our own keys so the
// shared hand-drawn art (tool.shears, item.wool, item.cloth) stays untouched for everyone else.
// This runs at import time, i.e. before loadSprites(), so the sheets get loaded with the rest.
SHEETS.tools ??= "sprites/tools.png";
SHEETS.objects ??= "sprites/objects.png";
REGIONS["ui.tb.shears"] ??= { sheet: "tools", x: 112, y: 0, w: 16, h: 16 };
REGIONS["ui.hud.wool"] ??= { sheet: "objects", x: 128, y: 288, w: 16, h: 16 }; // springobjects #440
REGIONS["ui.hud.cloth"] ??= { sheet: "objects", x: 320, y: 272, w: 16, h: 16 }; // springobjects #428

/** Where a real-sheet key falls back to when its sheet didn't load. */
const FALLBACKS: Record<string, string> = {
  "ui.tb.shears": "tool.shears",
  "ui.hud.wool": "item.wool",
  "ui.hud.cloth": "item.cloth",
};

const SHEEP = { o: "#513f3f", W: "#fff6dc", w: "#dcc9a5", s: "#8e7a5a", k: "#262626", p: "#e89a8f", F: "#f6e4c4" };
const PLUS = { g: "#1f5e1a", G: "#5fd13d", L: "#b6f78f" };
const WOOD = { o: "#4a1f0a", L: "#e98a2b", M: "#c25f17", D: "#8a3c0e" };

let registered = false;

/** Register every toolbar/menu icon. Safe to call more than once. */
export function registerToolbarArt(): void {
  if (registered) return;
  registered = true;

  pixelArt("ui.tool.plus-sheep", [
    "................",
    ".....o.oo.o.....",
    "....oWoWWoWo....",
    "...oWWWWWWWWo...",
    "..oWWwWWWWwWWo..",
    ".oWWWooooooWWWo.",
    ".ossoFFFFFFosso.",
    ".ooooFkFFkFoooo.",
    "..oWoFFFFFFoWo..",
    "..oWoFFFFFFggg..",
    "...oWoFFFFogGg..",
    "....ooFppgggGggg",
    "......ooogGGLGGg",
    ".........gggGggg",
    "...........gGg..",
    "...........ggg..",
  ], { ...SHEEP, ...PLUS });

  pixelArt("ui.icon.calendar", [
    "................",
    "...k..k..k..k...",
    ".ookookookookoo.",
    ".oRkRRkRRkRRkRo.",
    ".oRRRRRRRRRRRRo.",
    ".orrrrrrrrrrrro.",
    ".oPPPPPPPPPPPPo.",
    ".oPgPPgPPgPPgPo.",
    ".oPPPPPPPPPPPPo.",
    ".oPgPPgPhhPhhPo.",
    ".oPPPPPPhhhhhPo.",
    ".oPgPPgPPhhhPPo.",
    ".oPPPPPPPPhPPPo.",
    ".osssssssssssso.",
    "..oooooooooooo..",
    "................",
  ], { o: "#4a2a1a", k: "#2e2a33", R: "#e0412f", r: "#a8231a", P: "#fff8e6", g: "#c9b28c", s: "#e6d3ad", h: "#ff5a7a" });

  pixelArt("ui.icon.barn", [
    "................",
    ".....oooooo.....",
    "...ooSsSSsSoo...",
    "..oSSSSSSSSsSo..",
    ".oSsSSSsSSSSSSo.",
    "oSSSSSSSSSsSSSSo",
    "oWWWWWWWWWWWWWWo",
    "oRrRrRrRrRrRrRro",
    "oRrWWWWWWWWWWrRo",
    "oRrWkkkkkkkkWrRo",
    "oRrWkkkkkkkkWrRo",
    "oRrWkkkkkkkkWrRo",
    "oRrWkkYkkYkkWrRo",
    "oRrWkYYYYYYkWrRo",
    "oooooooooooooooo",
    "................",
  ], { o: "#3d1a12", S: "#6e5048", s: "#4f362f", R: "#c8402a", r: "#9a2a1c", W: "#fff3dc", k: "#3a1d14", d: "#c8402a", Y: "#e8b84a" });

  pixelArt("ui.icon.shop", [
    "......ooo...ooo.",
    ".....oHHho.oggGo",
    "....oHHhhooggGGo",
    "...oHHhhhoggGGGo",
    "..oHHhhhoggGGgo.",
    ".oHHhhhoggGGGo..",
    "oHHhhhbbgGGgo...",
    "oHhhhoBbbGGo....",
    "ohhhokkBbbo.....",
    ".oookkKKBbbo....",
    "..okkKKKoBbbo...",
    ".okkKKKo.oBbbo..",
    "okkKKKo...oBbbo.",
    "okKKKo.....oBbo.",
    "oKKKo.......oBo.",
    ".ooo.........o..",
  ], { o: "#3b2316", H: "#aeb6c4", h: "#6f7787", G: "#e3e8ef", g: "#9aa2b1", B: "#d08a45", b: "#8a4a1c", K: "#a8562a", k: "#d97a3c" });

  pixelArt("ui.icon.mail", [
    "................",
    "................",
    "................",
    ".oooooooooooooo.",
    ".oPoPPPPPPPPoPo.",
    ".oPPoPPPPPPoPPo.",
    ".oPPPoPPPPoPPPo.",
    ".oPPPPoRRoPPPPo.",
    ".oPPPPRRRRoPPPo.",
    ".oPPPoRRRRRoPPo.",
    ".oPPoPPRRRPPoPo.",
    ".oPoPPPPRPPPPoo.",
    ".osssssssssssso.",
    ".oooooooooooooo.",
    "................",
    "................",
  ], { o: "#5b3a29", P: "#fff8e6", s: "#e8d6b0", R: "#d6304a" });

  pixelArt("ui.icon.more", [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    ".ooo..ooo..ooo..",
    "oLMMooLMMooLMMo.",
    "oMMDooMMDooMMDo.",
    "oMDDooMDDooMDDo.",
    ".ooo..ooo..ooo..",
    "................",
    "................",
    "................",
    "................",
    "................",
  ], WOOD);

  const SPEAKER = { o: "#3b2316", B: "#8a6a52", b: "#5e4030", C: "#c9a27a", c: "#a87c56", w: "#4d8fd6", x: "#d6304a", X: "#8e0f24" };
  pixelArt("ui.icon.sound", [
    "................",
    "................",
    "......o.........",
    ".....oCo....o...",
    "....oCco..o..o..",
    ".oooCcco...o.o..",
    "oBBoCcco.o..o.o.",
    "oBboCcco..o.o.o.",
    "oBboCcco..o.o.o.",
    "oBBoCcco.o..o.o.",
    ".oooCcco...o.o..",
    "....oCco..o..o..",
    ".....oCo....o...",
    "......o.........",
    "................",
    "................",
  ], { ...SPEAKER, o: "#3b2316" });

  pixelArt("ui.icon.mute", [
    "................",
    "................",
    "......o.........",
    ".....oCo........",
    "....oCco........",
    ".oooCcco.Xx...xX",
    "oBBoCcco..Xx.xX.",
    "oBboCcco...XxX..",
    "oBboCcco...XxX..",
    "oBBoCcco..Xx.xX.",
    ".oooCcco.Xx...xX",
    "....oCco........",
    ".....oCo........",
    "......o.........",
    "................",
    "................",
  ], SPEAKER);

  pixelArt("ui.icon.tag", [
    "................",
    "..........ss....",
    ".........s..s...",
    "........s....s..",
    "....ooooooooos..",
    "...oPPPPPPPPPo..",
    "..oPPPPPPPPPPo..",
    ".oPPPPPRRRRPPo..",
    ".oPkPPPPPPPPPo..",
    ".oPPPPPRRRPPPo..",
    "..oPPPPPPPPPPo..",
    "...oPPPPPPPPPo..",
    "....ooooooooo...",
    "................",
    "................",
    "................",
  ], { o: "#5b3a29", P: "#fff1c9", k: "#5b3a29", R: "#c2412d", s: "#b08a5a" });

  pixelArt("ui.icon.loom", [
    "................",
    "..oo........oo..",
    ".oLDo......oLDo.",
    ".oLDooooooooLDo.",
    ".oLDLLLLLLLLLDo.",
    ".oLDoooooooooDo.",
    ".oLDwbwbwbwbwDo.",
    ".oLDwbwbwbwbwDo.",
    ".oLDwbwbwbwbwDo.",
    ".oLDooooooooLDo.",
    ".oLDcccccccccDo.",
    ".oLDCCCCCCCCCDo.",
    ".oLDoooooooooDo.",
    ".oLDo.......oLDo",
    ".oooo.......oooo",
    "................",
  ], { o: "#3b2316", L: "#d08a45", D: "#8a4a1c", w: "#fff6dc", b: "#9fb2dd", c: "#dfe7f7", C: "#7f90c4" });

  pixelArt("ui.icon.chest", [
    "................",
    "................",
    "...oooooooooo...",
    "..oLLLLLLLLLLo..",
    ".oLMMMMMMMMMMMo.",
    ".oMMMMMMMMMMMMo.",
    ".oDDDDDDDDDDDDo.",
    ".ooooooYYoooooo.",
    ".oMMMMoyYoMMMMo.",
    ".oMMMMMooMMMMMo.",
    ".oDMMMMMMMMMMDo.",
    ".oDDDDDDDDDDDDo.",
    ".oDDDDDDDDDDDDo.",
    "..oooooooooooo..",
    "................",
    "................",
  ], { o: "#3b1a0a", L: "#d9893c", M: "#b5651d", D: "#7a3e12", Y: "#ffd23f", y: "#c98a12" });

  pixelArt("ui.icon.help", [
    "................",
    "...ooooooooo....",
    "..oGGGGGGGGGo...",
    "..oGgGGYGGGGoP..",
    "..oGgGYYYGGGoP..",
    "..oGgYYYYYGGoP..",
    "..oGgGYYYGGGoP..",
    "..oGgGYGYGGGoP..",
    "..oGgGGGGGGGoP..",
    "..oGgGGGGGGGoP..",
    "..oGgGGGGGGGoP..",
    "..oGgGGGGGGGoP..",
    "..oGgoooooooooo.",
    "..oGoPPPPPPPPPo.",
    "...oooooooooooo.",
    "................",
  ], { o: "#1f3a1a", G: "#4f9a3a", g: "#2f6b1f", Y: "#ffd23f", P: "#fff1c9" });

  pixelArt("ui.icon.logout", [
    "................",
    "..oooooooooo....",
    "..oFFFFFFFFo....",
    "..oFoooooooo....",
    "..oFoDDDDo......",
    "..oFoDdDDo...g..",
    "..oFoDdDDo...gg.",
    "..oFoDdDYoggggGg",
    "..oFoDdDDogGGGGG",
    "..oFoDdDDoggggGg",
    "..oFoDdDDo...gg.",
    "..oFoDdDDo...g..",
    "..oFoDDDDo......",
    "..oFoooooooo....",
    "..oooooooooo....",
    "................",
  ], { o: "#3b2316", F: "#b5651d", D: "#d08a45", d: "#a8682a", Y: "#ffd23f", g: "#1f5e1a", G: "#5fd13d" });

  // ---------- frames ----------

  // The toolbar's wooden bar: a 5px frame around a warm parchment center (nine-slice).
  frame("ui.tb.bar", 14, 5, "#ffd795", "#f2bf72");

  // Inset slot: dark bevel top-left, light bevel bottom-right.
  makeCanvas("ui.tb.slot", 9, 9, (ctx) => {
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const d = Math.min(x, y, 8 - x, 8 - y);
        const corner = Math.min(x, 8 - x) + Math.min(y, 8 - y);
        if (corner === 0) continue;
        const shadowSide = isTopLeft(x, y, d, 9); // inset: shadow on the top/left
        let c: string;
        if (d === 0) c = "#a8581c";
        else if (d === 1) c = shadowSide ? "#b8682a" : "#ffe3a8";
        else if (d === 2) c = shadowSide ? "#df9a50" : "#f2b66c";
        else c = "#f2b66c";
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  // Stardew's red "this one's in your hand" selection frame (transparent center).
  makeCanvas("ui.tb.selected", 9, 9, (ctx) => {
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const d = Math.min(x, y, 8 - x, 8 - y);
        const corner = Math.min(x, 8 - x) + Math.min(y, 8 - y);
        if (corner === 0) continue;
        let c: string | null = null;
        if (d === 0) c = "#6e0b12";
        else if (d === 1) c = corner === 2 ? "#6e0b12" : "#ff4d3a";
        else if (d === 2) c = "#c41f1f";
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

/** Same nine-slice wood frame as the core UI boxes, with a custom border width and fill. */
function frame(key: string, size: number, border: number, inner: string, innerShade: string): void {
  makeCanvas(key, size, size, (ctx) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.min(x, y, size - 1 - x, size - 1 - y);
        const corner = Math.min(x, size - 1 - x) + Math.min(y, size - 1 - y);
        if (corner < 2) continue;
        const topLeft = isTopLeft(x, y, d, size);
        let c: string;
        if (corner === 2 || d === 0) c = UI.outline;
        else if (d === 1) c = topLeft ? UI.woodLight : UI.woodDark;
        else if (d < border - 2) c = UI.wood;
        else if (d === border - 2) c = UI.woodDark;
        else if (d === border - 1) c = innerShade;
        else c = inner;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

/**
 * Is this frame pixel on the top or left side (lit) rather than the bottom/right (shaded)?
 * Decided by the nearest edge, so every pixel along an edge slice matches and CSS
 * border-image can stretch it cleanly.
 */
function isTopLeft(x: number, y: number, d: number, size: number): boolean {
  return y === d ? x < size - 1 - d : x === d;
}

/** Icon key with a graceful fallback (so a missing key never renders as an empty slot). */
export function iconKey(key: string, fallback?: string): string {
  if (has(key)) return key;
  const alt = fallback ?? FALLBACKS[key];
  return alt && has(alt) ? alt : "ui.star";
}
