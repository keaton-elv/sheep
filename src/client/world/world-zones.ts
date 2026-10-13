// Spots on the farm that have to stay clear of grass tufts, rocks, forage, trees and decorations:
// the fox & hedgehog's corner, and the bit of yard in front of the barn door where the sheep walk
// in and out and Snickers loafs, grooms and naps on the doorstep. Pure (no DOM), so previews can use it.

import type { Layout, Point, Rect } from "./layout";

/**
 * Where the farm sign's post stands. The layout puts it beside the gate; in landscape that's on the
 * left fence line, where the 16px board would cover the fence logs (they run fence.x-4..fence.x+3),
 * so it stands just outside them instead. Everywhere else this is exactly layout.sign.
 */
export function signFeet(l: Layout): Point {
  const s = l.sign;
  if (l.gate.side !== "left") return s;
  const f = l.fence;
  const clearX = f.x - 13;
  const onFenceLine = s.x > clearX && s.x < f.x + 13 && s.y > f.y - 4 && s.y < f.y + f.h + 8;
  return onFenceLine ? { x: clearX, y: s.y } : s;
}

/**
 * The fox & hedgehog's corner, grown ~20px upward for their ears, hats and the odd hop, half a
 * decoration's width sideways and down to the bottom rail (so nothing tall stands in front of them).
 */
export function critterZone(l: Layout): Rect {
  const c = l.critterCorner;
  return { x: c.x - 8, y: c.y - 20, w: c.w + 16, h: c.h + 20 + 14 };
}

/** The yard in front of the barn door: ~24px deep, wide enough for a cat to pace past the doorway. */
export function doorYard(l: Layout): Rect {
  const d = l.barnDoor;
  return { x: d.x - 34, y: d.y - 8, w: 68, h: 8 + 24 };
}

/** Everything that must stay clear (critter corner + barn door yard). */
export function keepClear(l: Layout): Rect[] {
  return [critterZone(l), doorYard(l)];
}

const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

/**
 * Rects (in world px) where no grass tufts or rocks sprout: barn, machines, sign, HUD, fence lines,
 * the fox & hedgehog's corner and the yard in front of the barn door.
 */
export function busyAreas(l: Layout): Rect[] {
  const r: Rect[] = [grow(l.barn, 2), l.hudClock, l.hudToolbar, ...keepClear(l)];
  for (const p of [l.loom, l.chest, l.mailbox, signFeet(l)]) r.push({ x: p.x - 10, y: p.y - 34, w: 20, h: 38 });
  r.push({ x: l.billboard.x - 17, y: l.billboard.y - 32, w: 34, h: 36 });
  // Fence runs (the posts stick up ~27px above their feet line).
  const f = l.fence;
  r.push({ x: f.x - 8, y: f.y - 28, w: f.w + 16, h: 32 });
  r.push({ x: f.x - 8, y: f.y + f.h - 28, w: f.w + 16, h: 32 });
  r.push({ x: f.x - 7, y: f.y - 4, w: 14, h: f.h + 6 });
  r.push({ x: f.x + f.w - 7, y: f.y - 4, w: 14, h: f.h + 6 });
  return r;
}
