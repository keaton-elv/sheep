// Where Snickers hangs out: the barn doorstep, the gaps between the farm things, the barn wall
// when it rains, and a seat by the fence to watch the sheep. All in the yard, never inside the
// pasture, never on top of the loom/chest/mailbox/billboard/sign (so he can't steal their taps).
// Recomputed from the layout, so every spot stays valid on resize and rotation.

import type { Layout, Point, Rect } from "../world/layout";
import { signFeet } from "../world/world-zones";

export type SpotKind = "door" | "shelter" | "yard" | "fence";
/** Which way he sits there: facing you (front), or sideways toward the pasture. */
export type Facing = "front" | "right" | "left";

export interface Spot {
  id: string;
  kind: SpotKind;
  x: number;
  y: number;
  face: Facing;
}

export interface Yard {
  spots: Spot[];
  door: Spot;
  shelter: Spot;
  /** Tap areas of the farm things and the barn: there, only his actual pixels count as a hit. */
  objects: Rect[];
  /** Portrait: walks near the barn go along this line (the doorstep row, just behind the top fence). */
  laneY: number | null;
  /** Portrait: the lane is only needed left of this x (the barn, plus a little room for his tail). */
  laneEnd: number;
}

/** Half-size of the area he covers when sitting (feet-relative), used to validate spots. */
const BODY = { l: 13, r: 14, t: 24 };

const mid = (a: number, b: number) => Math.round((a + b) / 2);

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** The farm things' tap boxes (as world-objects.ts pads them for thumbs, plus a px or two). */
function objectRects(l: Layout): Rect[] {
  const box = (p: Point, half: number, up: number): Rect => ({ x: p.x - half, y: p.y - up, w: half * 2, h: up + 6 });
  return [box(l.loom, 14, 31), box(l.chest, 14, 28), box(l.mailbox, 14, 28), box(l.billboard, 18, 34), box(signFeet(l), 14, 33)];
}

/** Sprite cores of the farm things (what he must not sit on top of). */
function objectCores(l: Layout): Rect[] {
  const core = (p: Point, half: number, up: number): Rect => ({ x: p.x - half, y: p.y - up, w: half * 2, h: up + 2 });
  return [core(l.loom, 8, 30), core(l.chest, 8, 22), core(l.mailbox, 8, 22), core(l.billboard, 15, 30), core(signFeet(l), 7, 30)];
}

/**
 * Is this a good seat? `clear` says what must stay clear of the farm things: his paws and lower
 * body ("feet"), or only his head ("head": portrait fence seats, where the top rails hide the rest),
 * or nothing (the rainy-day shelter).
 */
function valid(l: Layout, s: Spot, cores: Rect[], clear: "feet" | "head" | null): boolean {
  if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return false;
  if (s.x < 14 || s.x > l.w - 14 || s.y < 28 || s.y > l.hudToolbar.y - 2) return false;
  const body: Rect = { x: s.x - BODY.l, y: s.y - BODY.t, w: BODY.l + BODY.r, h: BODY.t };
  const clock = l.hudClock;
  if (overlaps(body, { x: clock.x - 4, y: clock.y - 4, w: clock.w + 8, h: clock.h + 8 })) return false;
  // Never in the pasture.
  const f = l.fence;
  if (s.x > f.x - 2 && s.x < f.x + f.w + 2 && s.y > f.y + 2 && s.y < f.y + f.h + 2) return false;
  if (clear) {
    // Leave a few px of daylight between him and the farm things.
    const r: Rect = clear === "head" ? { x: s.x - 6, y: s.y - 21, w: 13, h: 11 } : { x: s.x - 9, y: s.y - 14, w: 18, h: 14 };
    for (const c of cores) if (overlaps(r, c)) return false;
  }
  return true;
}

export function computeYard(l: Layout): Yard {
  const cores = objectCores(l);
  const laneEnd = l.barn.x + l.barn.w + 14;
  const spots: Spot[] = [];
  let door: Spot;
  let shelter: Spot;
  let laneY: number | null = null;

  if (l.portrait) {
    // The doorstep sits in the gap of the top fence, right under the barn's animal door.
    door = { id: "door", kind: "door", x: Math.round(l.barnDoor.x), y: Math.round(l.barnDoor.y), face: "front" };
    // Under the barn's eaves is the only dry spot up here.
    shelter = { ...door, id: "shelter", kind: "shelter" };
    // Walks near the barn go along the doorstep row: in front of the barn (or it would hide him),
    // behind the top fence rails (his head and plume show over them).
    laneY = door.y;
    // A seat just behind the top rails: head, ruff and blep above the fence, paws behind it.
    const fenceSeatY = Math.round(l.fence.y - 10);
    const things = [l.loom, l.chest, l.mailbox, l.billboard].slice().sort((a, b) => a.x - b.x);
    const rowY = Math.max(...things.map((p) => p.y));
    for (let i = 0; i + 1 < things.length; i++) {
      const a = things[i]!;
      const b = things[i + 1]!;
      const x = mid(a.x, b.x);
      // In front of the row of farm things...
      spots.push({ id: `yard${i}`, kind: "yard", x, y: Math.round(rowY + 3), face: "front" });
      // ...or peeking over the top fence rails at the flock below.
      spots.push({ id: `fence${i}`, kind: "fence", x, y: fenceSeatY, face: "front" });
    }
    // Peeking over the fence from in front of the barn, left of the gate.
    const gateLeft = l.gate.x - l.gate.w / 2;
    // (Kept in front of the barn's bottom edge, or the barn would draw over him.)
    const barnSeatY = Math.round(Math.max(fenceSeatY, l.barn.y + l.barn.h + 2));
    if (gateLeft - l.barn.x > 40) spots.push({ id: "fenceBarn", kind: "fence", x: mid(l.barn.x + 6, gateLeft - 4), y: barnSeatY, face: "front" });
  } else {
    door = { id: "door", kind: "door", x: Math.round(l.barnDoor.x - 2), y: Math.round(l.barnDoor.y + 1), face: "front" };
    // Tucked against the barn wall, left of the door.
    shelter = { id: "shelter", kind: "shelter", x: Math.round(l.barnDoor.x - 46), y: Math.round(l.barnDoor.y + 1), face: "front" };
    const top = Math.max(l.loom.y, l.chest.y);
    const bottom = Math.max(l.mailbox.y, l.billboard.y);
    spots.push({ id: "yard0", kind: "yard", x: mid(l.loom.x, l.chest.x), y: Math.round(top + 4), face: "front" });
    if (bottom - top >= 28) spots.push({ id: "yard1", kind: "yard", x: mid(l.mailbox.x, l.billboard.x), y: Math.round(bottom + 4), face: "front" });
    // Sitting by the left fence, watching the flock.
    const fx = Math.round(l.fence.x - 19);
    // (Just below the loom/chest row: clear of the chest beside him and the billboard below.)
    spots.push({ id: "fence0", kind: "fence", x: fx, y: Math.round(top + 14), face: "right" });
    if (bottom + 26 < l.hudToolbar.y) spots.push({ id: "fence1", kind: "fence", x: fx, y: Math.round(bottom + 18), face: "right" });
  }

  // Portrait fence seats only show his head over the rails, so on narrow phones (where his whole
  // body won't fit between the farm things) he can still peek over the fence between them.
  const kept = spots.filter((s) => valid(l, s, cores, l.portrait && s.kind === "fence" ? "head" : "feet"));
  if (!valid(l, shelter, cores, null)) shelter = { ...door, id: "shelter", kind: "shelter" };
  return {
    spots: [door, ...(shelter.x !== door.x || shelter.y !== door.y ? [shelter] : []), ...kept],
    door,
    shelter,
    objects: [...objectRects(l), { x: l.barn.x + 2, y: l.barn.y + 4, w: l.barn.w - 4, h: l.barn.h - 4 }],
    laneY,
    laneEnd,
  };
}

/**
 * Waypoints from (x, y) to a spot. In portrait, the stretch in front of the barn goes along the
 * doorstep lane (anywhere higher up he'd vanish behind the barn); past the barn he cuts straight across.
 */
export function pathTo(yard: Yard, x: number, y: number, to: Spot): Point[] {
  const lane = yard.laneY;
  const end = yard.laneEnd;
  const fromNear = x < end;
  const toNear = to.x < end;
  if (lane === null || (!fromNear && !toNear)) return [{ x: to.x, y: to.y }];
  const pts: Point[] = [];
  const add = (px: number, py: number) => {
    const last = pts[pts.length - 1] ?? { x, y };
    if (Math.abs(last.x - px) > 1 || Math.abs(last.y - py) > 1) pts.push({ x: px, y: py });
  };
  add(fromNear ? x : end, lane);
  add(toNear ? to.x : end, lane);
  add(to.x, to.y);
  if (!pts.length) pts.push({ x: to.x, y: to.y });
  return pts;
}

export function findSpot(yard: Yard, id: string | null): Spot | null {
  if (!id) return null;
  return yard.spots.find((s) => s.id === id) ?? (id === "shelter" ? yard.shelter : id === "door" ? yard.door : null);
}
