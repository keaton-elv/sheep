// Sprite registry.
//
// Two sources of art, looked up by the same string key (e.g. "item.wool", "fox.idle.0"):
//   1. REGIONS: rectangles inside real Stardew sprite sheets (public/sprites/*.png).
//   2. Fallback art: canvases drawn in code (see pixelart.ts), registered with registerArt().
// A real region wins whenever its sheet loaded; otherwise the fallback is used. That way the
// game looks complete with hand-drawn art and upgrades itself as real sheets are added.
//
// Key naming: "ui.*" HUD & menus, "emote.*", "item.*", "tool.*", "decor.*", "world.*",
// "critter.*", "fox.*", "hedgehog.*", "snickers.*". Animation frames end in ".0", ".1"...

export interface Region {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sheet key -> URL relative to the app base (/sheep/). */
export const SHEETS: Record<string, string> = {
  sheep: "sprites/sheep.png",
  sheepSheared: "sprites/sheared_sheep.png",
};

/** Named rectangles inside SHEETS. Filled in as real Stardew sheets are added. */
export const REGIONS: Record<string, Region> = {};

type Art = HTMLCanvasElement | HTMLImageElement;

const images = new Map<string, HTMLImageElement>();
const art = new Map<string, Art>();
const iconCache = new Map<string, string>();

const BASE = import.meta.env.BASE_URL; // "/sheep/"

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Load every sheet in SHEETS. Missing sheets are fine; fallbacks cover them. */
export async function loadSprites(): Promise<void> {
  await Promise.all(
    Object.entries(SHEETS).map(async ([key, path]) => {
      const img = await loadImage(BASE + path);
      if (img) images.set(key, img);
      else console.info(`[sprites] ${path} not found; using hand-drawn fallbacks`);
    }),
  );
  iconCache.clear();
}

export function sheet(key: string): HTMLImageElement | null {
  return images.get(key) ?? null;
}

/** Register hand-drawn fallback art under a key. Later registrations replace earlier ones. */
export function registerArt(key: string, canvas: Art): void {
  art.set(key, canvas);
  iconCache.delete(key);
}

function resolve(key: string): { img: Art; sx: number; sy: number; w: number; h: number } | null {
  const r = REGIONS[key];
  if (r) {
    const img = images.get(r.sheet);
    if (img) return { img, sx: r.x, sy: r.y, w: r.w, h: r.h };
  }
  const a = art.get(key);
  if (a) return { img: a, sx: 0, sy: 0, w: a.width, h: a.height };
  return null;
}

export function has(key: string): boolean {
  return resolve(key) !== null;
}

/** True if the key is backed by a real Stardew sheet (not the hand-drawn fallback). */
export function isReal(key: string): boolean {
  const r = REGIONS[key];
  return !!r && images.has(r.sheet);
}

export function size(key: string): { w: number; h: number } | null {
  const s = resolve(key);
  return s ? { w: s.w, h: s.h } : null;
}

/** How many consecutive animation frames exist for a base key ("fox.idle" -> fox.idle.0..N-1). */
export function frameCount(base: string): number {
  let n = 0;
  while (has(`${base}.${n}`)) n++;
  return n;
}

export interface DrawOpts {
  flipX?: boolean;
  alpha?: number;
  /** "topleft" (default): (x, y) is the top-left corner. "feet": x is center, y is the bottom edge. "center". */
  anchor?: "topleft" | "feet" | "center";
  /** Integer scale (rarely needed in-world; the canvas is already scaled). */
  scale?: number;
}

/** Draw a sprite by key. Returns false if nothing is registered under that key. */
export function draw(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, opts: DrawOpts = {}): boolean {
  const s = resolve(key);
  if (!s) return false;
  const scale = opts.scale ?? 1;
  const w = s.w * scale;
  const h = s.h * scale;
  let dx = x;
  let dy = y;
  if (opts.anchor === "feet") {
    dx = x - w / 2;
    dy = y - h;
  } else if (opts.anchor === "center") {
    dx = x - w / 2;
    dy = y - h / 2;
  }
  dx = Math.round(dx);
  dy = Math.round(dy);
  const prevAlpha = ctx.globalAlpha;
  if (opts.alpha !== undefined) ctx.globalAlpha = prevAlpha * opts.alpha;
  if (opts.flipX) {
    ctx.save();
    ctx.translate(dx + w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, dx, dy, w, h);
  }
  ctx.globalAlpha = prevAlpha;
  return true;
}

/** Draw frame `index` from a sheet laid out as a grid of fw x fh cells (e.g. the 32x32 sheep sheets). */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheetKey: string,
  index: number,
  fw: number,
  fh: number,
  x: number,
  y: number,
  flipX = false,
): boolean {
  const img = images.get(sheetKey);
  if (!img) return false;
  const cols = Math.floor(img.width / fw);
  const sx = (index % cols) * fw;
  const sy = Math.floor(index / cols) * fh;
  const dx = Math.round(x);
  const dy = Math.round(y);
  if (flipX) {
    ctx.save();
    ctx.translate(dx + fw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
    ctx.restore();
  } else {
    ctx.drawImage(img, sx, sy, fw, fh, dx, dy, fw, fh);
  }
  return true;
}

/** Copy a sprite into its own canvas at an integer scale (for DOM icons, CSS, tinting). */
export function spriteCanvas(key: string, scale = 1, frame?: { sheet: string; index: number; fw: number; fh: number }): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  if (frame) {
    c.width = frame.fw * scale;
    c.height = frame.fh * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.scale(scale, scale);
    drawFrame(ctx, frame.sheet, frame.index, frame.fw, frame.fh, 0, 0);
    return c;
  }
  const s = resolve(key);
  if (!s) {
    c.width = c.height = 1;
    return c;
  }
  c.width = s.w * scale;
  c.height = s.h * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, 0, 0, s.w * scale, s.h * scale);
  return c;
}

/** A data: URL of a sprite (cached), for <img> tags and CSS backgrounds. */
export function spriteUrl(key: string): string {
  let url = iconCache.get(key);
  if (!url) {
    url = spriteCanvas(key).toDataURL();
    iconCache.set(key, url);
  }
  return url;
}
