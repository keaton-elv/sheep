// Where everything lives on screen, in game pixels. Recomputed on every resize.
//
// Portrait (phones):            Landscape (laptops):
//  ┌───────────────────┐         ┌──────────┬──────────────────┐
//  │ BARN    [clock]   │         │  BARN    │          [clock] │
//  │      loom chest ✉ │         │          │   pasture        │
//  │ ┌─fence─────────┐ │         │ loom ches│                  │
//  │ │   pasture     │ │         │ ✉  board │      fox+hog ▟   │
//  │ │       fox+hog▟│ │         │          │                  │
//  │ └───────────────┘ │         └──────────┴──────────────────┘
//  │    [toolbar]      │               [toolbar]
//  └───────────────────┘

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Layout {
  w: number;
  h: number;
  portrait: boolean;
  /** Where sheep roam (inside the fence). Sheep feet stay inside this rect. */
  pasture: Rect;
  /** The fence line drawn around the pasture. */
  fence: Rect;
  /**
   * The gap in the fence where sheep walk between the barn and the pasture.
   * (x, y) is the center of the gap on the fence line; `w` is the gap width;
   * `side` says which fence edge it's on (top in portrait, left in landscape).
   */
  gate: { x: number; y: number; w: number; side: "top" | "left" };
  /** Barn sprite bounds (112x112, the real Stardew barn size). */
  barn: Rect;
  /** Where sheep enter/exit the barn (feet position). */
  barnDoor: Point;
  /** Feet positions of tappable farm objects. */
  loom: Point;
  chest: Point;
  mailbox: Point;
  billboard: Point;
  sign: Point;
  /** Bottom-right corner hangout for the fox & hedgehog (inside the pasture). */
  critterCorner: Rect;
  /** Screen areas covered by the DOM HUD (clock top-right, toolbar bottom). */
  hudClock: Rect;
  hudToolbar: Rect;
  /** Rects sheep shouldn't pick as wander targets (HUD, critter corner, ...). */
  blocked: Rect[];
}

/** Game-pixel sizes the DOM HUD occupies (it scales with --px, so these stay true). */
export const HUD_CLOCK_SIZE = { w: 76, h: 62 };
export const HUD_TOOLBAR_H = 30;

export function computeLayout(w: number, h: number): Layout {
  const portrait = w < h * 1.1;
  const m = 6;
  const barn: Rect = { x: portrait ? 2 : 6, y: 2, w: 112, h: 112 };
  const barnDoor: Point = { x: barn.x + 56, y: barn.y + barn.h + 2 };
  const hudClock: Rect = { x: w - HUD_CLOCK_SIZE.w - 2, y: 2, w: HUD_CLOCK_SIZE.w, h: HUD_CLOCK_SIZE.h };
  const toolbarW = Math.min(w - 8, 260);
  const hudToolbar: Rect = { x: Math.round((w - toolbarW) / 2), y: h - HUD_TOOLBAR_H - 4, w: toolbarW, h: HUD_TOOLBAR_H };

  let fence: Rect;
  let loom: Point, chest: Point, mailbox: Point, billboard: Point, sign: Point;

  if (portrait) {
    const fenceTop = barn.y + barn.h + 8;
    fence = { x: m, y: fenceTop, w: w - m * 2, h: hudToolbar.y - 4 - fenceTop };
    // Little row of farm objects to the right of the barn, under the clock.
    const rowY = Math.max(hudClock.y + hudClock.h + 34, barn.y + 78);
    const startX = barn.x + barn.w + 6;
    const span = Math.max(80, w - startX - 8);
    const step = span / 4;
    loom = { x: Math.round(startX + step * 0.5), y: rowY };
    chest = { x: Math.round(startX + step * 1.5), y: rowY };
    mailbox = { x: Math.round(startX + step * 2.5), y: rowY };
    billboard = { x: Math.round(startX + step * 3.5), y: rowY };
    sign = { x: barn.x + barn.w + 2, y: fenceTop - 2 };
  } else {
    const colW = barn.x + barn.w + 8;
    fence = { x: colW, y: m, w: w - colW - m, h: hudToolbar.y - 4 - m };
    // 2x2 grid of farm objects under the barn.
    const gx0 = barn.x + 28;
    const gx1 = barn.x + 84;
    const gy0 = barn.y + barn.h + 40;
    const gy1 = Math.min(h - HUD_TOOLBAR_H - 10, gy0 + 44);
    loom = { x: gx0, y: gy0 };
    chest = { x: gx1, y: gy0 };
    mailbox = { x: gx0, y: gy1 };
    billboard = { x: gx1, y: gy1 };
    sign = { x: colW - 4, y: barn.y + barn.h + 8 };
  }

  // The pasture is the fence interior, with room for fence posts and sheep sprites.
  const pasture: Rect = { x: fence.x + 12, y: fence.y + 24, w: fence.w - 24, h: fence.h - 30 };
  const gateW = 28;
  const gate: Layout["gate"] = portrait
    ? { x: Math.max(fence.x + gateW, barnDoor.x), y: fence.y, w: gateW, side: "top" }
    : { x: fence.x, y: Math.min(fence.y + fence.h - gateW, barnDoor.y), w: gateW, side: "left" };
  const critterCorner: Rect = { x: pasture.x + pasture.w - 60, y: pasture.y + pasture.h - 34, w: 60, h: 34 };

  const blocked: Rect[] = [critterCorner, inflate(hudClock, 4), inflate(hudToolbar, 4)];

  return {
    w,
    h,
    portrait,
    pasture,
    fence,
    gate,
    barn,
    barnDoor,
    loom,
    chest,
    mailbox,
    billboard,
    sign,
    critterCorner,
    hudClock,
    hudToolbar,
    blocked,
  };
}

export function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Pasture-relative fraction (0..1) -> world coords, and back. Used for decorations. */
export function fromFraction(l: Layout, fx: number, fy: number): Point {
  return { x: l.pasture.x + fx * l.pasture.w, y: l.pasture.y + fy * l.pasture.h };
}

export function toFraction(l: Layout, x: number, y: number): { fx: number; fy: number } {
  const fx = (x - l.pasture.x) / l.pasture.w;
  const fy = (y - l.pasture.y) / l.pasture.h;
  return { fx: Math.min(1, Math.max(0, fx)), fy: Math.min(1, Math.max(0, fy)) };
}
