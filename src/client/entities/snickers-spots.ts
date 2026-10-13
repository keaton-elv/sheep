// Where Snickers hangs out, recomputed from the layout (so every spot stays valid on resize and
// rotation). Always in the yard, never in the pasture, and only where ALL of him shows: never behind
// the fence, the barn, the sign or the farm things, and never sitting on top of them either (so he
// can't hide them or steal their taps).
//
// Portrait: the strip of yard between the barn and the top fence. The doorstep, a seat under the
// barn wall, and a row of seats right of the sign, in the gaps between the loom/chest/mailbox/
// billboard (one of them is his sunny spot). Wide phones get seats in the farm-object row too.
// Landscape: the doorstep, the barn wall, between the farm things, and a seat by the left fence.

import type { Layout, Point, Rect } from "../world/layout";
import { signFeet } from "../world/world-zones";
import { REST_LAYERS, silhouette, type Layer, type SilhouetteRow } from "./snickers-art";

export type SpotKind = "door" | "shelter" | "yard" | "fence" | "sun";
/** Which way he sits there: facing you (front), or sideways toward the pasture. */
export type Facing = "front" | "right" | "left";

export interface Spot {
  id: string;
  kind: SpotKind;
  x: number;
  y: number;
  face: Facing;
  /** Only his low poses (loaf, nap) fit here: sitting up, his head would cover the farm things. */
  low?: boolean;
}

export interface Yard {
  spots: Spot[];
  door: Spot;
  shelter: Spot;
  /** Where he basks on sunny days (null when there's no room for one). */
  sun: Spot | null;
  /** Tap areas of the farm things and the barn: there, only his actual pixels count as a hit. */
  objects: Rect[];
  /** Portrait: every walk goes along this row (the yard strip in front of the barn). */
  laneY: number | null;
  /** Landscape: walks go up and down this column (the gap between the farm things). */
  spineX: number | null;
  /** Would he fit sitting up with his feet here? (For fusses mid-walk, off any spot.) */
  sitsUp(x: number, y: number): boolean;
}

const mid = (a: number, b: number) => Math.round((a + b) / 2);

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** The farm things' tap boxes (as world-objects.ts pads them for thumbs, plus a px or two). */
function objectRects(l: Layout): Rect[] {
  const box = (p: Point, half: number, up: number): Rect => ({ x: p.x - half, y: p.y - up, w: half * 2, h: up + 6 });
  return [box(l.loom, 14, 31), box(l.chest, 14, 28), box(l.mailbox, 14, 28), box(l.billboard, 18, 34), box(signFeet(l), 14, 33)];
}

/** Where the farm things are drawn (their sprite bounds, as world-objects.ts draws them). */
function thingRects(l: Layout): Rect[] {
  const r = (p: Point, left: number, up: number, w: number): Rect => ({ x: Math.round(p.x) + left, y: Math.round(p.y) - up, w, h: up });
  return [r(l.loom, -8, 25, 16), r(l.chest, -8, 22, 16), r(l.mailbox, -8, 22, 16), r(l.billboard, -15, 30, 30), r(signFeet(l), -8, 32, 16)];
}

/** Poses he sits up in (sit, watch, groom, pet) and the low ones (loaf, nap). */
const TALL: readonly (readonly Layer[])[] = [REST_LAYERS.front, REST_LAYERS.side];
const LOW: readonly (readonly Layer[])[] = [REST_LAYERS.loaf, REST_LAYERS.sleep];

interface Room {
  /** Rects none of him may touch. */
  solid: Rect[];
  /** The barn: only off-limits from behind (he's welcome in front of its wall). */
  barn: Rect;
  /** Horizontal limits (side safe areas). */
  minX: number;
  maxX: number;
}

function room(l: Layout): Room {
  const f = l.fence;
  const pad = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });
  const solid = [...thingRects(l), pad(l.hudClock, 2), pad(l.hudToolbar, 2)];
  if (l.portrait) {
    // The top fence's posts stick up 25px above its feet line (only their 4px caps on that first
    // row), the rails 18px. Everything from there down is fence or pasture.
    solid.push({ x: -50, y: f.y - 24, w: l.w + 100, h: l.h + 50 });
  } else {
    // The left fence's logs (and the pasture beyond).
    solid.push({ x: f.x - 4, y: -50, w: l.w + 50, h: l.h + 100 });
  }
  return {
    solid,
    barn: l.barn,
    minX: (l.portrait ? l.barn.x - 2 : l.barn.x - 6) + 1,
    maxX: f.x + f.w + 6 - 2,
  };
}

/** Does every pose in `set` (both ways round) fit with his feet at (x, y)? */
function fits(rm: Room, x: number, y: number, set: readonly (readonly Layer[])[]): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const behindBarn = y <= rm.barn.y + rm.barn.h;
  for (const layers of set) {
    const rows: SilhouetteRow[] = silhouette(layers);
    for (const flip of [false, true]) {
      for (const row of rows) {
        const l = x + (flip ? -row.r : row.l);
        const r = x + (flip ? -row.l : row.r);
        const band: Rect = { x: l, y: y + row.dy, w: r - l + 1, h: 1 };
        if (l < rm.minX || r > rm.maxX) return false;
        if (behindBarn && overlaps(band, rm.barn)) return false;
        for (const s of rm.solid) if (overlaps(band, s)) return false;
      }
    }
  }
  return true;
}

/**
 * A spot if he fits there sitting up, or a low one if only loafing/napping fits, else null.
 * Nudged a pixel or two either way when that's what it takes.
 */
function seat(rm: Room, id: string, kind: SpotKind, x: number, y: number, face: Facing = "front"): Spot | null {
  const sy = Math.round(y);
  const nudges = [0, -1, 1, -2, 2];
  for (const low of [false, true]) {
    for (const n of nudges) {
      const sx = Math.round(x) + n;
      if (fits(rm, sx, sy, low ? LOW : TALL)) return low ? { id, kind, x: sx, y: sy, face, low: true } : { id, kind, x: sx, y: sy, face };
    }
  }
  return null;
}

/** The first of these rows (feet y) where he fits sitting up, else the first where he can loaf. */
function seatAt(rm: Room, id: string, kind: SpotKind, x: number, ys: number[], face: Facing = "front"): Spot | null {
  let low: Spot | null = null;
  for (const y of ys) {
    const s = seat(rm, id, kind, x, y, face);
    if (s && !s.low) return s;
    low ??= s;
  }
  return low;
}

/** Centers of the gaps between the farm things (and the sign) along a row, left to right. */
function gaps(l: Layout, from: number, to: number): { x: number; w: number }[] {
  const spans = thingRects(l)
    .map((r) => ({ a: r.x, b: r.x + r.w }))
    .filter((s) => s.b > from && s.a < to)
    .sort((p, q) => p.a - q.a);
  const out: { x: number; w: number }[] = [];
  let edge = from;
  for (const s of spans) {
    if (s.a > edge) out.push({ x: mid(edge, s.a - 1), w: s.a - edge });
    edge = Math.max(edge, s.b);
  }
  if (to > edge) out.push({ x: mid(edge, to - 1), w: to - edge });
  return out;
}

export function computeYard(l: Layout): Yard {
  const rm = room(l);
  const spots: Spot[] = [];
  const add = (s: Spot | null) => {
    if (s && !spots.some((o) => Math.abs(o.x - s.x) < 18 && Math.abs(o.y - s.y) < 10)) spots.push(s);
  };
  let door: Spot;
  let shelter: Spot;
  let sun: Spot | null = null;
  let laneY: number | null = null;
  let spineX: number | null = null;

  if (l.portrait) {
    // The yard strip: in front of the barn's bottom edge, with his toes just above the post caps.
    const barnBottom = l.barn.y + l.barn.h;
    const strip = Math.round(Math.max(barnBottom + 1, Math.min(l.barnDoor.y, l.fence.y - 25)));
    laneY = strip;
    // The doorstep, right in the gate gap under the barn's animal door.
    door = seat(rm, "door", "door", l.barnDoor.x, strip) ?? { id: "door", kind: "door", x: Math.round(l.barnDoor.x), y: strip, face: "front" };
    // Tucked against the barn wall left of the door: dry when it rains, a lookout over the rails when it doesn't.
    shelter = seat(rm, "shelter", "shelter", l.barnDoor.x - 46, strip) ?? { ...door, id: "shelter", kind: "shelter" };
    add(door);
    if (shelter.x !== door.x) add({ ...shelter, id: "porch", kind: "fence" });
    // Right of the barn: the gaps between the sign and the farm things, along the strip...
    const right = gaps(l, l.barn.x + l.barn.w, rm.maxX);
    const row = Math.max(l.loom.y, l.chest.y, l.mailbox.y, l.billboard.y);
    let roomiest = -1;
    for (let i = 0; i < right.length; i++) {
      const g = right[i]!;
      // (Right of the barn he can sit a row further back, clear of even the fence posts' caps.)
      const s = seatAt(rm, `strip${i}`, "fence", g.x, [Math.min(strip, l.fence.y - 26), strip]);
      add(s);
      if (!s || !spots.includes(s)) continue;
      // The roomiest strip seat (sitting up beats loafing only) is his sunny spot.
      const better = !sun || (!s.low && sun.low) || (!!s.low === !!sun.low && g.w > roomiest);
      if (better) {
        sun = s;
        roomiest = g.w;
      }
    }
    if (sun) {
      sun.kind = "sun";
      sun.id = "sun";
    }
    // ...and, on wide phones, right in the farm-object row.
    for (let i = 0; i < right.length; i++) {
      const s = seat(rm, `yard${i}`, "yard", right[i]!.x, row + 3);
      if (s && !s.low) add(s);
    }
  } else {
    door = seat(rm, "door", "door", l.barnDoor.x - 2, l.barnDoor.y + 1) ?? {
      id: "door",
      kind: "door",
      x: Math.round(l.barnDoor.x - 2),
      y: Math.round(l.barnDoor.y + 1),
      face: "front",
    };
    // Tucked against the barn wall, left of the door.
    shelter = seat(rm, "shelter", "shelter", l.barnDoor.x - 46, l.barnDoor.y + 1) ?? { ...door, id: "shelter", kind: "shelter" };
    add(door);
    const top = Math.max(l.loom.y, l.chest.y);
    const bottom = Math.max(l.mailbox.y, l.billboard.y);
    // Walks go down the gap between the two columns of farm things.
    spineX = mid(Math.max(l.loom.x + 8, l.mailbox.x + 8), Math.min(l.chest.x - 9, l.billboard.x - 16));
    add(seat(rm, "yard0", "yard", mid(l.loom.x + 8, l.chest.x - 9), top + 4));
    if (bottom - top >= 28) {
      const s = seat(rm, "sun", "sun", mid(l.mailbox.x + 8, l.billboard.x - 16), bottom + 4);
      add(s);
      if (s && spots.includes(s)) sun = s;
    }
    // Sitting by the left fence below the farm things, watching the flock.
    const ys = [25, 24, 23].map((d) => Math.min(bottom + d, l.hudToolbar.y - 3));
    add(seatAt(rm, "fence0", "fence", l.fence.x - 21, ys, "right"));
  }

  return {
    spots: [...spots, ...(spots.some((s) => s.x === shelter.x && s.y === shelter.y && s.id !== "door") || shelter.x === door.x ? [] : [shelter])],
    door,
    shelter,
    sun,
    objects: [...objectRects(l), { x: l.barn.x + 2, y: l.barn.y + 4, w: l.barn.w - 4, h: l.barn.h - 4 }],
    laneY,
    spineX,
    sitsUp: (x, y) => fits(rm, Math.round(x), Math.round(y), TALL),
  };
}

/**
 * Waypoints from (x, y) to a spot. Portrait: down to the yard strip, along it, then over (so he
 * never cuts behind the fence or across the farm things). Landscape: over to the gap between the
 * farm things, along it, then across.
 */
export function pathTo(yard: Yard, x: number, y: number, to: Spot): Point[] {
  const pts: Point[] = [];
  const add = (px: number, py: number) => {
    const last = pts[pts.length - 1] ?? { x, y };
    if (Math.abs(last.x - px) > 0.5 || Math.abs(last.y - py) > 0.5) pts.push({ x: px, y: py });
  };
  if (yard.laneY !== null) {
    add(x, yard.laneY);
    add(to.x, yard.laneY);
  } else if (yard.spineX !== null && Math.abs(y - to.y) > 2) {
    add(yard.spineX, y);
    add(yard.spineX, to.y);
  }
  add(to.x, to.y);
  if (!pts.length) pts.push({ x: to.x, y: to.y });
  return pts;
}

export function findSpot(yard: Yard, id: string | null): Spot | null {
  if (!id) return null;
  return yard.spots.find((s) => s.id === id) ?? (id === "shelter" ? yard.shelter : id === "door" ? yard.door : null);
}
