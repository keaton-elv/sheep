// Hand-drawn pixel art, written as strings. One character = one pixel.
//
//   pixelArt("item.wool", [
//     "..oooo..",
//     ".oWWWWo.",
//     "oWWwWWWo",
//   ], { o: "#5b3a29", W: "#fff6e0", w: "#e9dcc0" });
//
// "." and " " are transparent. Rows may be ragged; short rows are padded with transparency.
// Stardew style tips: dark, warm outlines (never pure black), 2-3 shades per material,
// light from the top-left, and a soft lavender-grey ground shadow (#00000033) under things.

import { registerArt } from "./sprites";

export type Palette = Record<string, string>;

export function pixelArt(key: string | null, rows: string[], palette: Palette): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const row = rows[y]!;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === "." || ch === " ") continue;
      const color = palette[ch];
      if (!color) throw new Error(`pixelArt(${key}): no color for "${ch}"`);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  if (key) registerArt(key, c);
  return c;
}

/** Procedural art: draw into a fresh w x h canvas with plain canvas calls. */
export function makeCanvas(key: string | null, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  paint(ctx);
  if (key) registerArt(key, c);
  return c;
}

/** Mirror a canvas horizontally. */
export function flipped(key: string | null, src: HTMLCanvasElement): HTMLCanvasElement {
  return makeCanvas(key, src.width, src.height, (ctx) => {
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
  });
}

/** Recolor every opaque pixel toward `color` by `amount` (0..1), keeping alpha. Good for golden sheep. */
export function tinted(key: string | null, src: CanvasImageSource & { width: number; height: number }, color: string, amount: number): HTMLCanvasElement {
  return makeCanvas(key, src.width, src.height, (ctx) => {
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = amount;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, src.width, src.height);
  });
}

/** Silhouette (every opaque pixel = color). Handy for outlines/hover highlights. */
export function silhouette(key: string | null, src: CanvasImageSource & { width: number; height: number }, color: string): HTMLCanvasElement {
  return makeCanvas(key, src.width, src.height, (ctx) => {
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, src.width, src.height);
  });
}
