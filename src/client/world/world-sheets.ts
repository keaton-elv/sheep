// Real Stardew sheets the farm world uses, where things live inside them, and small helpers to
// cut/convert pieces into canvases. Registered at import time (before loadSprites runs).

import type { Season } from "../../shared/calendar";
import { SHEETS, sheet } from "../engine/sprites";
import type { Layout, Rect } from "./layout";
import { newPx, type Px } from "./world-pixels";

SHEETS.farmBuildings ??= "sprites/farm_buildings.png";
SHEETS.outdoorsSpring ??= "sprites/outdoors_spring.png";
SHEETS.outdoorsSummer ??= "sprites/outdoors_summer.png";
SHEETS.outdoorsFall ??= "sprites/outdoors_fall.png";
SHEETS.outdoorsWinter ??= "sprites/outdoors_winter.png";
SHEETS.trees ??= "sprites/trees.png";
SHEETS.bushes ??= "sprites/bushes.png";
SHEETS.grass ??= "sprites/grass.png";
SHEETS.forage ??= "sprites/forage.png";
SHEETS.craftables ??= "sprites/craftables.png";
SHEETS.animations ??= "sprites/animations.png";

/** The outdoors tilesheet for each season (all four share one layout). */
export function outdoorsSheet(season: Season): string {
  const key = { spring: "outdoorsSpring", summer: "outdoorsSummer", fall: "outdoorsFall", winter: "outdoorsWinter" }[season];
  // A missing seasonal sheet falls back to spring rather than to nothing.
  return sheet(key) ? key : "outdoorsSpring";
}

/** Big craftables are 16x32 cells, 8 per row. */
export function craftRect(index: number): { x: number; y: number; w: number; h: number } {
  return { x: (index % 8) * 16, y: Math.floor(index / 8) * 32, w: 16, h: 32 };
}

/** Indices in craftables.png. */
export const CRAFT = {
  scarecrow: 8,
  deluxeScarecrow: 167,
  beeHouse: 10,
  beeHouseHoney: 11,
  loom: 17,
  loomWorking: 18,
  woodSign: 37,
  hayBale: 46,
  wheatBundle: 45,
  tubOFlowers: 108,
  tubEmpty: 109,
  chest: 130,
  chestLid: [131, 132, 133, 134, 135],
  campfire: 146,
  woodLamp: 152,
  ironLamp: 153,
  rarecrows: [110, 113, 126, 136, 137, 138, 139, 140],
} as const;

/** Deluxe Barn (sheep live in the barn in Stardew) and its animal-door pieces. */
export const BARN = {
  sheet: "farmBuildings",
  x: 261,
  y: 0,
  w: 112,
  h: 112,
  /** The animal door's hole, relative to the barn sprite. */
  hole: { x: 64, y: 90, w: 32, h: 22 },
  door: { x: 270, y: 113, w: 32, h: 16 },
  glow: { x: 335, y: 113, w: 33, h: 16 },
  /** The upstairs window (two round panes) that glows at night. */
  window: { x: 48, y: 64, w: 18, h: 9 },
  interior: "#141313",
} as const;

/**
 * Where the barn sprite is drawn. The layout's 112x112 box assumes the door is centred, but the
 * Deluxe Barn's animal door sits right of centre, so the sprite slides over until its doorway is
 * exactly at layout.barnDoor (where the sheep walk in and out). Clamped so it never wanders far.
 */
export function barnRect(l: Layout): Rect {
  const b = l.barn;
  const ideal = Math.round(l.barnDoor.x - (BARN.hole.x + BARN.hole.w / 2));
  const x = Math.max(b.x - 40, Math.min(b.x + 40, ideal));
  return { x, y: b.y + b.h - BARN.h, w: BARN.w, h: BARN.h };
}

// ---------- canvases & pixels ----------

export function makeCanvasEl(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/**
 * 2D context with smoothing off. Only canvases we read pixels back from ask for
 * willReadFrequently: it forces a CPU-backed canvas, which is slower to draw every frame.
 */
export function ctx2d(c: HTMLCanvasElement, readBack = false): CanvasRenderingContext2D {
  const ctx = (readBack ? c.getContext("2d", { willReadFrequently: true }) : c.getContext("2d"))!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Cut a rectangle of a loaded sheet into its own canvas (null if the sheet didn't load). */
export function cut(sheetKey: string, x: number, y: number, w: number, h: number): HTMLCanvasElement | null {
  const img = sheet(sheetKey);
  if (!img) return null;
  const c = makeCanvasEl(w, h);
  ctx2d(c).drawImage(img, x, y, w, h, 0, 0, w, h);
  return c;
}

const pxCache = new Map<string, Px | null>();

/** Raw pixels of a sheet rectangle (cached). */
export function sheetPx(sheetKey: string, x: number, y: number, w: number, h: number): Px | null {
  const k = `${sheetKey}:${x},${y},${w},${h}`;
  if (pxCache.has(k)) return pxCache.get(k)!;
  const img = sheet(sheetKey);
  let px: Px | null = null;
  if (img) {
    try {
      const c = makeCanvasEl(w, h);
      const ctx = ctx2d(c, true);
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h);
      px = { width: w, height: h, data: d.data };
    } catch {
      px = null; // tainted canvas (shouldn't happen: same origin)
    }
  }
  pxCache.set(k, px);
  return px;
}

export function canvasPx(c: HTMLCanvasElement): Px {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: d.data };
}

export function pxCanvas(px: Px): HTMLCanvasElement {
  const c = makeCanvasEl(px.width, px.height);
  if (px.width > 0 && px.height > 0) {
    const img = new ImageData(new Uint8ClampedArray(px.data), px.width, px.height);
    ctx2d(c).putImageData(img, 0, 0);
  }
  return c;
}

/** Blank Px helper re-export for convenience. */
export { newPx };
