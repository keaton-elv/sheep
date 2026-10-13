// Sheep art: the real sheep sheets split into body + ground shadow (so hops leave the shadow on
// the grass), golden variants, a procedural fallback sheet, and the little effect sprites.
// Everything is built once at init and cached.

import { makeCanvas, pixelArt, tinted } from "../engine/pixelart";
import { REGIONS, SHEETS, registerArt, sheet, spriteCanvas } from "../engine/sprites";
import { PLUS, SPARKLE, TUFTS, paintFallbackSheep, splitSheepPixels, type ArtData } from "./sheep-artdata";

// Lambs: same 4x5 grid of 32x32 frames as the adult sheet, feet on the same row.
SHEETS.sheepBaby ??= "sprites/sheep_baby.png";

// The real Stardew shears (tools sheet, top icon row) for the in-world snip animation.
// Kept under our own key so the toolbar's "tool.shears" stays whatever its owner maps.
SHEETS.tools ??= "sprites/tools.png";
REGIONS["fx.shears"] ??= { sheet: "tools", x: 112, y: 0, w: 16, h: 16 };

/** Sheep frames are 32x32; the feet sit this many px below the frame's top edge. */
export const FRAME = 32;
export const FEET = 29;

type Source = HTMLCanvasElement | HTMLImageElement;

export interface SheepSheet {
  /** Frames without their ground shadow (or full frames if splitting wasn't possible). */
  body: Source;
  golden: Source;
  /** Just the soft ground shadows; null when `body` already includes them. */
  shadow: Source | null;
  cols: number;
}

export interface SheepArt {
  woolly: SheepSheet;
  sheared: SheepSheet;
  /** Baby sheep (bought less than a day ago). Falls back to the woolly sheet. */
  lamb: SheepSheet;
  /** True when the real Stardew sheets loaded (not the hand-drawn fallback). */
  real: boolean;
}

function fallbackSheet(sheared: boolean): HTMLCanvasElement {
  return makeCanvas(null, 128, 160, (ctx) => {
    const img = ctx.createImageData(128, 160);
    img.data.set(paintFallbackSheep(sheared));
    ctx.putImageData(img, 0, 0);
  });
}

function splitSheet(src: Source): SheepSheet {
  const w = src.width;
  const h = src.height;
  const cols = Math.max(1, Math.floor(w / FRAME));
  try {
    const full = makeCanvas(null, w, h, (ctx) => ctx.drawImage(src, 0, 0));
    const pixels = full.getContext("2d")!.getImageData(0, 0, w, h).data;
    const split = splitSheepPixels(pixels, w, h, FRAME);
    const toCanvas = (px: Uint8ClampedArray) =>
      makeCanvas(null, w, h, (ctx) => {
        const img = ctx.createImageData(w, h);
        img.data.set(px);
        ctx.putImageData(img, 0, 0);
      });
    return { body: toCanvas(split.body), golden: toCanvas(split.golden), shadow: toCanvas(split.shadow), cols };
  } catch {
    // Tainted canvas or no getImageData: fall back to whole frames and a simple tint.
    return { body: src, golden: tinted(null, src, "#ffc83a", 0.45), shadow: null, cols };
  }
}

function artCanvas(key: string | null, data: ArtData): HTMLCanvasElement {
  return pixelArt(key, data.rows, data.palette);
}

/** Soft dust puffs, radius 1..4. */
function puff(key: string, r: number): void {
  const size = r * 2 + 1;
  makeCanvas(key, size, size, (ctx) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r;
        const dy = y - r;
        const d = Math.hypot(dx, dy);
        if (d > r + 0.35) continue;
        ctx.fillStyle = dy > 0 && d > r - 1.2 ? "#d8cfc2" : dx + dy < -r * 0.6 ? "#ffffff" : "#f4efe6";
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

let built: SheepArt | null = null;

/** Build (once) and return the sheep art. Call after loadSprites(). */
export function buildSheepArt(): SheepArt {
  if (built) return built;
  const woollySrc = sheet("sheep");
  const shearedSrc = sheet("sheepSheared");
  const lambSrc = sheet("sheepBaby");
  const woolly = splitSheet(woollySrc ?? fallbackSheet(false));
  const sheared = splitSheet(shearedSrc ?? fallbackSheet(true));
  const lamb = lambSrc && lambSrc.width >= FRAME * 4 && lambSrc.height >= FRAME * 5 ? splitSheet(lambSrc) : woolly;
  built = { woolly, sheared, lamb, real: !!woollySrc && !!shearedSrc };

  // Effect sprites. The fallback shears are the shared hand-drawn tool icon.
  registerArt("fx.shears", spriteCanvas("tool.shears"));
  SPARKLE.forEach((s, i) => artCanvas(`fx.sparkle.${i}`, s));
  artCanvas("fx.plus", PLUS);
  TUFTS.forEach((s, i) => artCanvas(`fx.tuft.${i}`, s));
  for (let r = 1; r <= 4; r++) puff(`fx.puff.${r}`, r);

  // Still portraits for the DOM (animal card, barn, the ranch...). Frame 12 = idle, facing you.
  const still = (key: string, src: SheepSheet, golden: boolean) =>
    registerArt(
      key,
      makeCanvas(null, FRAME, FRAME, (ctx) => {
        if (src.shadow) drawSheepFrame(ctx, src.shadow, src.cols, 12, 0, 0, false);
        drawSheepFrame(ctx, golden ? src.golden : src.body, src.cols, 12, 0, 0, false);
      }),
    );
  still("sheep.portrait", woolly, false);
  still("sheep.portrait.golden", woolly, true);
  still("sheep.portrait.sheared", sheared, false);
  still("sheep.portrait.sheared.golden", sheared, true);
  still("sheep.portrait.lamb", lamb, false);
  still("sheep.portrait.lamb.golden", lamb, true);
  return built;
}

/** Draw frame `index` (4 columns of 32x32) with its top-left at (x, y). */
export function drawSheepFrame(ctx: CanvasRenderingContext2D, src: Source, cols: number, index: number, x: number, y: number, flip: boolean): void {
  const sx = (index % cols) * FRAME;
  const sy = Math.floor(index / cols) * FRAME;
  if (flip) {
    ctx.save();
    ctx.translate(x + FRAME, y);
    ctx.scale(-1, 1);
    ctx.drawImage(src, sx, sy, FRAME, FRAME, 0, 0, FRAME, FRAME);
    ctx.restore();
  } else {
    ctx.drawImage(src, sx, sy, FRAME, FRAME, x, y, FRAME, FRAME);
  }
}
