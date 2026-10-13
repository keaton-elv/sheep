// Shared hand-drawn art used across the UI. Real Stardew regions (REGIONS in sprites.ts)
// replace these automatically once the sheets are in public/sprites/.

import { makeCanvas, pixelArt } from "../engine/pixelart";

/** Stardew-ish wood + parchment palette, shared by UI art. */
export const UI = {
  outline: "#4a1f0a",
  woodLight: "#e98a2b",
  wood: "#c25f17",
  woodDark: "#8a3c0e",
  parchment: "#ffd795",
  parchmentShade: "#f2bf72",
  text: "#3b2316",
};

/** Nine-slice frame: `border` px of wood around a parchment center, with chamfered corners. */
function frame(key: string, size: number, border: number, colors: { inner: string; innerShade: string }) {
  makeCanvas(key, size, size, (ctx) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.min(x, y, size - 1 - x, size - 1 - y);
        const corner = Math.min(x, size - 1 - x) + Math.min(y, size - 1 - y);
        if (corner < 2) continue; // chamfer
        const topLeft = x <= y ? x < size / 2 : y < size / 2;
        let c: string;
        if (corner === 2 || d === 0) c = UI.outline;
        else if (d === 1) c = topLeft ? UI.woodLight : UI.woodDark;
        else if (d < border - 2) c = UI.wood;
        else if (d === border - 2) c = UI.woodDark;
        else if (d === border - 1) c = colors.innerShade;
        else c = colors.inner;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

export function registerCoreArt(): void {
  // Menu box (6px border) and smaller button/input frames (4px border).
  frame("ui.box", 18, 6, { inner: UI.parchment, innerShade: UI.parchmentShade });
  frame("ui.button", 12, 4, { inner: "#ffdfa6", innerShade: "#f5c47d" });
  frame("ui.button.hover", 12, 4, { inner: "#fff0c9", innerShade: "#ffd795" });
  frame("ui.input", 12, 4, { inner: "#fff8e6", innerShade: "#f6e2bd" });
  frame("ui.slot", 18, 5, { inner: "#f6c27a", innerShade: "#d99d50" });

  const heart = [".rr.rr.", "rhRrRRr", "rRRRRRr", ".rRRRr.", "..rRr..", "...r..."];
  pixelArt("ui.heart.full", heart, { r: "#8e0f24", R: "#e8344b", h: "#ff9aa6" });
  pixelArt("ui.heart.empty", heart, { r: "#5e4030", R: "#a0806a", h: "#a0806a" });
  pixelArt("ui.heart.half", [".rr.ee.", "rhRrEEe", "rRRrEEe", ".rRrEe.", "..rRe..", "...r..."], {
    r: "#8e0f24",
    R: "#e8344b",
    h: "#ff9aa6",
    e: "#5e4030",
    E: "#a0806a",
  });

  pixelArt(
    "ui.close",
    ["oo......oo", "oRo....oRo", ".oRo..oRo.", "..oRooRo..", "...oRRo...", "...oRRo...", "..oRooRo..", ".oRo..oRo.", "oRo....oRo", "oo......oo"],
    { o: "#5a0d0d", R: "#e0412f" },
  );

  pixelArt(
    "item.wool",
    [
      "................",
      ".....oooooo.....",
      "...ooWWWWWWoo...",
      "..oWWWWWWwWWWo..",
      ".oWWwWWWWWWWwWo.",
      ".oWWWWWWwWWWWWo.",
      "oWWWWWWWWWWWWWWo",
      "oWwWWWwWWWWWwWWo",
      "oWWWWWWWWWwWWWso",
      "oWWWwWWWWWWWWsso",
      ".oWWWWWWWwWWsso.",
      ".osWWWWWWWWssso.",
      "..ossWWWWsssso..",
      "...oosssssoo....",
      ".....oooooo.....",
      "................",
    ],
    { o: "#6b4a2f", W: "#fff7e3", w: "#e8dcc2", s: "#d8c7a4" },
  );

  pixelArt(
    "item.cloth",
    [
      "................",
      "................",
      "...oooooooooo...",
      "..oLLLLLLLLLLo..",
      ".oLLlLLLLLLlLLo.",
      ".oBBBBBBBBBBBBo.",
      ".oLLLLLLLLLLLLo.",
      ".oLlLLLLLlLLLLo.",
      ".oBBBBBBBBBBBBo.",
      ".oLLLLLLLLLLLLo.",
      ".oLLLLlLLLLLlLo.",
      ".oDDDDDDDDDDDDo.",
      "..oDDDDDDDDDDo..",
      "...oooooooooo...",
      "................",
      "................",
    ],
    { o: "#3b3f6b", L: "#dfe7f7", l: "#ffffff", B: "#9fb2dd", D: "#7f90c4" },
  );

  pixelArt(
    "tool.shears",
    [
      "................",
      "..............o.",
      ".............oSo",
      "............oSso",
      "...........oSso.",
      "..........oSso..",
      "....o....oSso...",
      "...oSo..oSso....",
      "...oSSooSso.....",
      "....oSSSso......",
      ".....oSSo.......",
      "....oRooRo......",
      "...oRRo.oRRo....",
      "..oRRo...oRRo...",
      "..oRo.....oRo...",
      "...o.......o....",
    ],
    { o: "#2e2a33", S: "#d7dce4", s: "#9aa2b1", R: "#c2412d" },
  );

  pixelArt(
    "tool.hand",
    [
      "................",
      "......oo........",
      ".....oYYo.......",
      ".....oYYo.......",
      ".....oYYooo.....",
      ".....oYYoYYoo...",
      "..oo.oYYoYYoYo..",
      ".oYYooYYYYYYYYo.",
      ".oYYYoYYYYYYYYo.",
      "..oYYYYYYYYYYYo.",
      "...oYYYYYYYYYyo.",
      "....oYYYYYYYyo..",
      ".....oYYYYYyo...",
      "......oyyyyo....",
      ".......oooo.....",
      "................",
    ],
    { o: "#5b3412", Y: "#f6d27a", y: "#d9a648" },
  );

  pixelArt(
    "ui.dice",
    [".ooooooooo.", "oWWWWWWWWWo", "oWkWWWWWkWo", "oWWWWWWWWWo", "oWWWWkWWWWo", "oWWWWWWWWWo", "oWkWWWWWkWo", "oWWWWWWWWWo", "ossssssssso", ".ooooooooo."],
    { o: "#4a3b33", W: "#fbf7ee", k: "#2b211c", s: "#cfc5b4" },
  );

  pixelArt(
    "ui.star",
    ["....o....", "...oYo...", "...oYo...", "ooooYoooo", "oYYYYYYyo", ".oYYYYyo.", "..oYyYo..", ".oYyooyo.", ".oyo..oyo", ".oo....oo"],
    { o: "#6b3f0b", Y: "#ffe066", y: "#e8a92c" },
  );
}
