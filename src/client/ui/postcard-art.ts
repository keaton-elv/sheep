// The picture side of KitKat's postcards: little Arizona scenes painted once from real Calico
// Desert scenery (sprites/postcard_desert.png, cropped from the desert tileset: cacti, the palm,
// the skull, sand and rock; never the shopkeepers or the bus driver). Sky, sun, mesa outlines and
// rain are painted in code; the ground, the rock and everything standing on them are the real sheet.
//
// Each picture is PICTURE_W x PICTURE_H game pixels, wider than any card: the card shows it at
// one menu pixel per game pixel with the sides cropped (mailbox.css, object-fit: cover), so the
// subject of every scene sits in the middle ~140 px.

import { makeCanvas, tinted } from "../engine/pixelart";
import { draw, isReal, REGIONS, SHEETS, size, spriteCanvas, type Region } from "../engine/sprites";
import { sheetCrop } from "./calendar-util";

// Registered at import time, before loadSprites() runs.
SHEETS.postcardDesert ??= "sprites/postcard_desert.png";
const desert = (x: number, y: number, w: number, h: number): Region => ({ sheet: "postcardDesert", x, y, w, h });
REGIONS["desert.palm"] ??= desert(0, 0, 45, 76);
REGIONS["desert.cactus.tall"] ??= desert(45, 0, 16, 41);
REGIONS["desert.cactus.short"] ??= desert(61, 0, 15, 30);
REGIONS["desert.tusk"] ??= desert(77, 0, 13, 40);
REGIONS["desert.skull"] ??= desert(90, 0, 32, 31);
REGIONS["desert.cactus.flower"] ??= desert(61, 30, 16, 15);
REGIONS["desert.bush"] ??= desert(61, 45, 16, 14);
const SAND = desert(90, 31, 16, 16);
const PEBBLES = desert(106, 31, 16, 16);
const SAND_SHADE = desert(106, 47, 16, 16);
const ROCK = desert(45, 63, 48, 32);
/** The plain sand colors in the pebble tile (knocked out so the pebbles can go anywhere). */
const SAND_RGB: readonly number[] = [0xffda8f, 0xffd188, 0xffe193];

export type PostcardScene = "sunset" | "palm" | "skull" | "monsoon" | "rocks";
export const PICTURE_W = 240;
export const PICTURE_H = 72;
const W = PICTURE_W;
const H = PICTURE_H;

type Ctx = CanvasRenderingContext2D;
type Band = readonly [color: string, until: number];
type Tint = readonly [color: string, amount: number];

const pictures = new Map<PostcardScene, HTMLCanvasElement>();

/** A fresh copy of a scene's picture (painted once), or null if the desert sheet didn't load. */
export function postcardPicture(scene: PostcardScene): HTMLCanvasElement | null {
  if (!isReal("desert.palm")) return null;
  let pic = pictures.get(scene);
  if (!pic) {
    try {
      pic = makeCanvas(null, W, H, (ctx) => PAINT[scene](ctx));
    } catch (err) {
      console.warn("[mailbox] postcard picture failed", err);
      return null;
    }
    pictures.set(scene, pic);
  }
  const src = pic;
  return makeCanvas(null, W, H, (ctx) => ctx.drawImage(src, 0, 0));
}

/**
 * The postage stamp, redone with the real desert flower: a 20x20 perforated stamp, the cactus
 * against a sunset. Replaces mailbox-art's hand-drawn stamp once the desert sheet is in.
 */
export function registerPostcardStamp(): void {
  if (!isReal("desert.cactus.flower")) return;
  makeCanvas("ui.postcard.stamp", 20, 20, (ctx) => {
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 20; i += 2) {
      ctx.fillRect(i + 1, 0, 1, 1);
      ctx.fillRect(i, 19, 1, 1);
      ctx.fillRect(0, i, 1, 1);
      ctx.fillRect(19, i + 1, 1, 1);
    }
    ctx.fillRect(1, 1, 18, 18);
    ctx.save();
    ctx.beginPath();
    ctx.rect(2, 2, 16, 16);
    ctx.clip();
    const bands: readonly Band[] = [["#7a4fa0", 4], ["#e86a8a", 7], ["#f59a3c", 10], ["#ffd25a", 13], ["#ffda8f", 20]];
    let y0 = 2;
    for (const [color, y1] of bands) {
      ctx.fillStyle = color;
      ctx.fillRect(2, y0, 16, y1 - y0);
      y0 = y1;
    }
    ctx.fillStyle = "#fdc75b";
    ctx.fillRect(2, 13, 16, 1);
    draw(ctx, "desert.cactus.flower", 10, 19, { anchor: "feet" });
    ctx.restore();
  });
}

// ---------- painting helpers ----------

function pattern(ctx: Ctx, r: Region): CanvasPattern | string {
  const c = sheetCrop(r.sheet, r.x, r.y, r.w, r.h);
  return (c && ctx.createPattern(c, "repeat")) || "#ffda8f";
}

/** Flat sky bands, top to bottom (the last one runs to the bottom), each seam dithered. */
function sky(ctx: Ctx, bands: readonly Band[]): void {
  let y0 = 0;
  bands.forEach(([color, y1], i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, y0, W, (i === bands.length - 1 ? H : y1) - y0);
    if (i > 0) {
      ctx.fillStyle = bands[i - 1]![0];
      for (let x = y0 % 2; x < W; x += 2) ctx.fillRect(x, y0, 1, 1);
    }
    y0 = y1;
  });
}

/** A round pixel sun (or cloud lump). */
function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.round(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/** Short pixel rays around a sun, alternating long and short. */
function rays(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = i % 2 ? 2 : 4;
    for (let k = 0; k < len; k++) {
      ctx.fillRect(Math.round(cx + Math.cos(a) * (r + 3 + k)), Math.round(cy + Math.sin(a) * (r + 3 + k)), 1, 1);
    }
  }
}

/**
 * Mesas on the horizon: [left, right, top] each. Flat top, a sheer cliff, then a talus slope
 * that spreads 1 px per row down to `base`. Filled with the real rock unless told otherwise;
 * `cap` paints the sunlit top row.
 */
function mesas(
  ctx: Ctx,
  list: readonly (readonly [x0: number, x1: number, top: number])[],
  base: number,
  fill: string | CanvasPattern = pattern(ctx, ROCK),
  cap?: string,
): void {
  for (const [x0, x1, top] of list) {
    const cliff = Math.max(2, Math.round((base - top) * 0.45));
    ctx.fillStyle = fill;
    for (let y = top; y < base; y++) {
      const spread = Math.max(0, y - top - cliff);
      // A couple of 1 px jogs in the cliff so it doesn't look ruled.
      const jog = y - top === 1 || y - top === cliff - 1 ? 1 : 0;
      ctx.fillRect(x0 - spread - jog, y, x1 - x0 + spread * 2 + jog, 1);
    }
    if (cap) {
      ctx.fillStyle = cap;
      ctx.fillRect(x0 + 1, top, x1 - x0 - 2, 1);
    }
  }
}

/** Paint into a scratch layer, then lay it down with `tint` washed over its opaque pixels. */
function layer(ctx: Ctx, paint: (l: Ctx) => void, tint?: Tint): void {
  const c = makeCanvas(null, W, H, (l) => {
    paint(l);
    if (tint) {
      l.globalCompositeOperation = "source-atop";
      l.globalAlpha = tint[1];
      l.fillStyle = tint[0];
      l.fillRect(0, 0, W, H);
    }
  });
  ctx.drawImage(c, 0, 0);
}

type Wave = readonly [amp: number, period: number, phase: number];

/**
 * Rolling dunes of the real sand from the crest down. Light comes from the top left, so faces
 * that fall away to the right get the darker sand (deeper where they're steeper), and the lit
 * crests get the tileset's pale lip.
 */
function dunes(l: Ctx, base: number, waves: readonly Wave[], lip = true): void {
  const sand = pattern(l, SAND);
  const shade = pattern(l, SAND_SHADE);
  for (let x = 0; x < W; x++) {
    let crest = base;
    let slope = 0;
    for (const [a, p, ph] of waves) {
      const k = (Math.PI * 2) / p;
      crest += a * Math.sin(x * k + ph);
      slope += a * k * Math.cos(x * k + ph);
    }
    const top = Math.round(crest);
    l.fillStyle = sand;
    l.fillRect(x, top, 1, H - top);
    const depth = Math.round(Math.min(7, Math.max(0, slope * 16)));
    if (depth > 0) {
      l.fillStyle = shade;
      l.fillRect(x, top, 1, depth);
    }
    if (!lip) continue;
    if (depth > 0) {
      l.fillStyle = "#f7b36a";
      l.fillRect(x, top, 1, 1);
    } else {
      l.fillStyle = "#ffe193";
      l.fillRect(x, top, 1, 1);
      l.fillStyle = "#fdc75b";
      l.fillRect(x, top + 1, 1, 1);
    }
  }
}

let pebbleArt: HTMLCanvasElement | null = null;

/** A few of the tileset's pebbles scattered on the sand (the tile's own sand knocked out). */
function pebbles(ctx: Ctx, at: readonly (readonly [x: number, y: number])[]): void {
  pebbleArt ??= makeCanvas(null, PEBBLES.w, PEBBLES.h, (c) => {
    const src = sheetCrop(PEBBLES.sheet, PEBBLES.x, PEBBLES.y, PEBBLES.w, PEBBLES.h);
    if (!src) return;
    c.drawImage(src, 0, 0);
    const img = c.getImageData(0, 0, PEBBLES.w, PEBBLES.h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (SAND_RGB.includes((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!)) d[i + 3] = 0;
    }
    c.putImageData(img, 0, 0);
  });
  for (const [x, y] of at) ctx.drawImage(pebbleArt, x, y);
}

/** A real sprite, feet at (x, y), optionally washed with a color (dusk light, rain). */
function prop(ctx: Ctx, key: string, x: number, y: number, opts: { flipX?: boolean; tint?: Tint } = {}): void {
  if (!opts.tint) {
    draw(ctx, key, x, y, { anchor: "feet", flipX: opts.flipX });
    return;
  }
  const s = size(key);
  if (!s) return;
  const c = tinted(null, spriteCanvas(key), opts.tint[0], opts.tint[1]);
  const dx = Math.round(x - s.w / 2);
  if (opts.flipX) {
    ctx.save();
    ctx.translate(dx + s.w, y - s.h);
    ctx.scale(-1, 1);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  } else ctx.drawImage(c, dx, y - s.h);
}

/** Cheap fixed scatter (same picture every time). */
const scatter = (i: number, salt: number) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// ---------- the scenes ----------

const PAINT: Record<PostcardScene, (ctx: Ctx) => void> = {
  /** Saguaros against a pink, orange and purple sunset ("pink and orange and purple, all at the same time"). */
  sunset(ctx) {
    sky(ctx, [
      ["#4b2f7a", 7],
      ["#6a4196", 14],
      ["#9a4f9e", 20],
      ["#d0608e", 26],
      ["#ee7a78", 31],
      ["#f8a04a", 37],
      ["#ffd25a", 44],
    ]);
    disc(ctx, 140, 41, 11, "#ffe48a");
    disc(ctx, 140, 41, 9, "#fff4b8");
    mesas(ctx, [[22, 58, 31], [104, 196, 35], [214, 238, 38]], 46, "#6e3f72", "#9a5a86");
    layer(ctx, (l) => dunes(l, 47, [[1.5, 70, 0.3], [1, 31, 2]], false), ["#a6507a", 0.5]);
    layer(ctx, (l) => dunes(l, 57, [[3, 96, 1.2], [1.5, 37, 0.4]]), ["#c4607a", 0.32]);
    const dusk: Tint = ["#3e2050", 0.55];
    prop(ctx, "desert.cactus.short", 176, 63, { tint: dusk, flipX: true });
    prop(ctx, "desert.cactus.tall", 92, 67, { tint: dusk });
    prop(ctx, "desert.cactus.flower", 116, 70, { tint: dusk });
    prop(ctx, "desert.bush", 206, 71, { tint: dusk });
    prop(ctx, "desert.bush", 34, 70, { tint: dusk, flipX: true });
  },

  /** A palm by the dunes under a sun that is ALWAYS out. */
  palm(ctx) {
    sky(ctx, [
      ["#4fa4ec", 10],
      ["#6cb8f3", 20],
      ["#8ecbf6", 30],
      ["#b4def8", 38],
      ["#d8effa", 44],
    ]);
    disc(ctx, 66, 13, 7, "#fff1a6");
    disc(ctx, 66, 13, 5, "#fffbe0");
    rays(ctx, 66, 13, 7, "#fff1a6");
    mesas(ctx, [[0, 30, 37], [150, 214, 36]], 45, "#a9b2d8", "#c3c9e6");
    layer(ctx, (l) => dunes(l, 45, [[2, 58, 0.5], [1, 23, 1.1]], false), ["#e8c8b0", 0.35]);
    layer(ctx, (l) => dunes(l, 54, [[4, 110, 2.6], [1.5, 41, 0.2]]));
    pebbles(ctx, [[60, 58], [170, 60]]);
    prop(ctx, "desert.cactus.short", 196, 60);
    prop(ctx, "desert.bush", 104, 68);
    prop(ctx, "desert.palm", 128, 74);
    prop(ctx, "desert.bush", 152, 71, { flipX: true });
    prop(ctx, "desert.cactus.flower", 46, 66);
  },

  /** 114°: the skull and a flower on flat sand, heat shimmer on the horizon. */
  skull(ctx) {
    sky(ctx, [
      ["#ffd98a", 9],
      ["#ffe3a2", 18],
      ["#ffecbe", 28],
      ["#fff4d8", 36],
      ["#fffaea", 42],
    ]);
    disc(ctx, 178, 12, 9, "#fff2b0");
    disc(ctx, 178, 12, 7, "#ffffff");
    mesas(ctx, [[30, 92, 34], [204, 240, 36]], 43, "#efbe92", "#f7d4ac");
    // Heat shimmer: a pale ripple across the foot of the mesas.
    ctx.fillStyle = "rgba(255,253,244,0.7)";
    for (let x = 0; x < W; x++) ctx.fillRect(x, 40 + Math.round(Math.sin(x / 3) * 0.7), 1, 1);
    layer(ctx, (l) => dunes(l, 43, [[0.6, 80, 0.2]], false), ["#ffe6c0", 0.3]);
    layer(ctx, (l) => dunes(l, 50, [[1.5, 120, 1], [0.8, 33, 2]]));
    pebbles(ctx, [[40, 54], [92, 60], [150, 52], [184, 58], [214, 52]]);
    prop(ctx, "desert.tusk", 78, 64, { flipX: true });
    prop(ctx, "desert.skull", 120, 66);
    prop(ctx, "desert.cactus.flower", 150, 68);
    prop(ctx, "desert.bush", 206, 64);
  },

  /** Monsoon season: four whole minutes of rain over the red rocks. */
  monsoon(ctx) {
    sky(ctx, [
      ["#3f4868", 10],
      ["#4e5878", 20],
      ["#626c8c", 30],
      ["#8a8aa2", 36],
      ["#e2b48a", 41],
    ]);
    // Storm clouds: a lighter back row of lumps, then a darker front row with a pale underside.
    for (let i = 0; i < 18; i++) {
      disc(ctx, i * 14 - 4 + Math.round(scatter(i, 1) * 8), 12 + Math.round(scatter(i, 2) * 5), 6 + Math.round(scatter(i, 3) * 5), "#5d6788");
    }
    ctx.fillStyle = "#353d5c";
    ctx.fillRect(0, 0, W, 5);
    for (let i = 0; i < 14; i++) {
      const x = i * 19 - 6 + Math.round(scatter(i, 4) * 10);
      const y = 4 + Math.round(scatter(i, 5) * 4);
      const r = 7 + Math.round(scatter(i, 6) * 6);
      disc(ctx, x, y + 1, r, "#4d5678");
      disc(ctx, x, y - 1, r, "#353d5c");
    }
    layer(ctx, (l) => {
      mesas(l, [[150, 210, 26]], 46);
      mesas(l, [[26, 52, 33]], 46);
    }, ["#3f3858", 0.35]);
    // A little lightning over the far butte.
    ctx.fillStyle = "#fff6c8";
    const bolt = [[177, 12], [176, 13], [176, 14], [175, 15], [176, 16], [177, 16], [177, 17], [176, 18], [176, 19], [175, 20], [175, 21]] as const;
    for (const [x, y] of bolt) ctx.fillRect(x, y, 1, 1);
    layer(ctx, (l) => dunes(l, 46, [[1, 60, 0.3]], false), ["#6a5a78", 0.4]);
    layer(ctx, (l) => dunes(l, 55, [[2.5, 90, 0.8], [1, 29, 2]]), ["#5a5a7a", 0.3]);
    const wet: Tint = ["#3a4060", 0.22];
    prop(ctx, "desert.cactus.tall", 108, 65, { tint: wet });
    prop(ctx, "desert.cactus.short", 130, 63, { tint: wet, flipX: true });
    prop(ctx, "desert.bush", 60, 68, { tint: wet });
    // Rain: short slanted streaks everywhere below the clouds.
    ctx.fillStyle = "rgba(200,214,240,0.42)";
    for (let i = 0; i < 150; i++) {
      const x = Math.round(scatter(i, 7) * (W + 8));
      const y = 12 + Math.round(scatter(i, 8) * (H - 14));
      ctx.fillRect(x, y, 1, 1);
      ctx.fillRect(x - 1, y + 1, 1, 1);
      ctx.fillRect(x - 1, y + 2, 1, 1);
    }
  },

  /** Red rocks and saguaros ("I found a cactus. I sat near it. Not on it."). */
  rocks(ctx) {
    sky(ctx, [
      ["#5aa8ea", 10],
      ["#78bcf2", 22],
      ["#9ed0f6", 32],
      ["#c6e4f8", 42],
    ]);
    mesas(ctx, [[176, 238, 30]], 45, "#b7a6cc", "#cdc0de");
    layer(ctx, (l) => {
      mesas(l, [[40, 102, 18]], 47);
      mesas(l, [[112, 136, 28]], 47);
    }, ["#d09a8a", 0.18]);
    layer(ctx, (l) => dunes(l, 46, [[1, 50, 0.3]], false), ["#f0c8a8", 0.25]);
    layer(ctx, (l) => dunes(l, 55, [[2.5, 100, 2.2], [1.2, 35, 0.6]]));
    pebbles(ctx, [[64, 60], [200, 58]]);
    prop(ctx, "desert.cactus.short", 92, 64);
    prop(ctx, "desert.cactus.tall", 150, 67);
    prop(ctx, "desert.cactus.flower", 124, 70);
    prop(ctx, "desert.bush", 186, 68, { flipX: true });
    prop(ctx, "desert.bush", 42, 70);
  },
};
