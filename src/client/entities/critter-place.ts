// Where critters can be: open grass in the pasture, the fence's rails, post tops and side logs,
// and the decorations you two have placed (flowers, bee houses...). Pure geometry, cached per layout.
//
// The fence numbers mirror world/world-fence.ts: each horizontal run has a post every ~20px, its
// top rail's upper edge sits 18px above the run's feet line and a post's flat top 25px above it.
// The side runs are 8px-wide logs (x-4..x+3).

import type { DecorKind } from "../../shared/types";
import type { Game } from "../engine/game";
import { store } from "../net";
import { contains, fromFraction, inflate, type Layout, type Point, type Rect } from "../world/layout";
import { critterZone, signFeet } from "../world/world-zones";
import { report } from "./critter-util";

/** The bottom fence rail hides the lowest strip of the pasture; keep ground critters above it. */
export const FENCE_HIDE = 16;
/** A horizontal run's top rail surface, in px above its feet line. */
export const RAIL_TOP = 18;
/** A fence post's top, in px above its run's feet line. */
export const POST_TOP = 25;

/** A horizontal fence run. */
export interface Rail {
  x0: number;
  x1: number;
  /** The run's feet line (world y); fence slices sort at this y. */
  feet: number;
  /** World x of each post's center. */
  posts: number[];
  top: boolean;
}

/** A vertical fence run (the side logs), from y0 down to y1, centered on x. */
export interface Side {
  x: number;
  y0: number;
  y1: number;
  /** Which side of the pasture: a critter clinging to it from inside the pasture faces this way. */
  edge: "left" | "right";
}

interface Fence {
  rails: Rail[];
  sides: Side[];
}

const fenceCache = new WeakMap<Layout, Fence>();

/** Where the fence, the gate and the HUD are: everything a perched or crawling critter depends on. */
function layoutKey(l: Layout): string {
  const r = (b: Rect) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`;
  return `${l.w}x${l.h}|${r(l.fence)}|${r(l.hudClock)}|${r(l.hudToolbar)}|${Math.round(l.gate.x)},${Math.round(l.gate.y)}|${r(l.critterCorner)}`;
}

/**
 * Run `fn` when the farm's geometry really changes (a rotation, a new window size). The engine also
 * emits "resize" when nothing moved at all (the phone keyboard opening under a dialog, the toolbar
 * re-measuring itself), and the birds shouldn't all vanish for that.
 */
export function onLayoutChange(g: Game, name: string, fn: () => void): void {
  let key = layoutKey(g.layout);
  g.on("resize", () => {
    try {
      const next = layoutKey(g.layout);
      if (next === key) return;
      key = next;
      fn();
    } catch (err) {
      report(`${name}.resize`, err);
    }
  });
}

export function fenceRuns(l: Layout): Fence {
  let f = fenceCache.get(l);
  if (f) return f;
  const fe = l.fence;
  const x0 = fe.x;
  const x1 = fe.x + fe.w;
  const y0 = fe.y;
  const y1 = fe.y + fe.h;
  const half = l.gate.w / 2;
  const rails: Rail[] = [];
  const sides: Side[] = [];
  const hrun = (xa: number, xb: number, feet: number, top: boolean) => {
    if (xb - xa < 8) return;
    const n = Math.max(1, Math.round((xb - xa) / 20));
    const posts: number[] = [];
    for (let i = 0; i <= n; i++) posts.push(Math.round(xa + ((xb - xa) * i) / n));
    rails.push({ x0: xa, x1: xb, feet, posts, top });
  };
  const vrun = (ya: number, yb: number, x: number, edge: Side["edge"]) => {
    if (yb - ya >= 12) sides.push({ x, y0: ya, y1: yb, edge });
  };
  if (l.gate.side === "top") {
    hrun(x0, l.gate.x - half, y0, true);
    hrun(l.gate.x + half, x1, y0, true);
  } else hrun(x0, x1, y0, true);
  hrun(x0, x1, y1, false);
  if (l.gate.side === "left") {
    vrun(y0, l.gate.y - half, x0, "left");
    vrun(l.gate.y + half, y1, x0, "left");
  } else vrun(y0, y1, x0, "left");
  vrun(y0, y1, x1, "right");
  f = { rails, sides };
  fenceCache.set(l, f);
  return f;
}

const noPerchCache = new WeakMap<Layout, Rect[]>();

/**
 * Screen areas a perched critter must not cover: the HUD clock & toolbar, the farm sign, and the
 * loom, chest, mailbox & billboard (so nothing perched ever sits in front of them or steals their taps).
 */
function noPerch(l: Layout): Rect[] {
  let r = noPerchCache.get(l);
  if (r) return r;
  const s = signFeet(l);
  r = [inflate(l.hudClock, 4), inflate(l.hudToolbar, 4), { x: s.x - 13, y: s.y - 34, w: 26, h: 36 }];
  for (const p of [l.loom, l.chest, l.mailbox]) r.push({ x: p.x - 11, y: p.y - 34, w: 22, h: 39 });
  r.push({ x: l.billboard.x - 18, y: l.billboard.y - 32, w: 36, h: 37 });
  noPerchCache.set(l, r);
  return r;
}

/** Is a critter `w` wide and `h` tall, standing at (x, feet), clear of the HUD and the sign? */
export function perchClear(l: Layout, x: number, feet: number, w = 16, h = 16): boolean {
  if (feet - h < 2 || x - w / 2 < 2 || x + w / 2 > l.w - 2) return false;
  const box: Rect = { x: x - w / 2, y: feet - h, w, h };
  for (const r of noPerch(l)) if (overlaps(box, r)) return false;
  return true;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const pick = <T>(arr: readonly T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];

/** A random free stretch of top rail `len` px long (clear for something `w` x `h` all along it). */
export function railStretch(l: Layout, len: number, h = 16, w = 12): { rail: Rail; x0: number; x1: number } | null {
  const runs = fenceRuns(l).rails.filter((r) => r.x1 - r.x0 > len + 16);
  for (let tries = 0; tries < 10; tries++) {
    const rail = pick(runs);
    if (!rail) return null;
    const x0 = rail.x0 + 8 + Math.random() * (rail.x1 - rail.x0 - len - 16);
    const x1 = x0 + len;
    const feet = rail.feet - RAIL_TOP;
    let ok = true;
    for (let x = x0; x <= x1 + 0.01 && ok; x += Math.max(1, Math.min(6, len))) ok = perchClear(l, Math.min(x, x1), feet, w, h);
    if (ok) return { rail, x0, x1 };
  }
  return null;
}

/**
 * Up to `n` neighbouring gaps between posts on one run, each clear of the HUD: a free stretch of
 * top rail [x0, x1] per gap (posts are 8px wide, so a gap is ~11px: room for one little bird).
 */
export function railGaps(l: Layout, n: number, h = 16): { rail: Rail; gaps: [number, number][] } | null {
  const runs = fenceRuns(l).rails.filter((r) => r.posts.length > 1);
  for (let tries = 0; tries < 8; tries++) {
    const rail = pick(runs);
    if (!rail) return null;
    const feet = rail.feet - RAIL_TOP;
    const all: ([number, number] | null)[] = [];
    for (let i = 0; i + 1 < rail.posts.length; i++) {
      const x0 = rail.posts[i]! + 5;
      const x1 = rail.posts[i + 1]! - 5;
      // The bird may hop anywhere in its gap, so the whole gap has to be clear.
      all.push(x1 - x0 >= 4 && perchClear(l, x0, feet, 12, h) && perchClear(l, x1, feet, 12, h) ? [x0, x1] : null);
    }
    const start = Math.floor(Math.random() * all.length);
    const gaps: [number, number][] = [];
    for (let i = start; i < all.length && gaps.length < n; i++) {
      const gap = all[i];
      if (!gap) break;
      gaps.push(gap);
    }
    if (gaps.length) return { rail, gaps };
  }
  return null;
}

/** `n` neighbouring free post tops on one run (or fewer, if that's all there is). */
export function postRow(l: Layout, n: number, h = 16): { rail: Rail; xs: number[] } | null {
  const runs = fenceRuns(l).rails;
  for (let tries = 0; tries < 8; tries++) {
    const rail = pick(runs);
    if (!rail) return null;
    const ok = rail.posts.filter((x) => perchClear(l, x, rail.feet - POST_TOP, 12, h));
    if (!ok.length) continue;
    const start = Math.floor(Math.random() * ok.length);
    const xs: number[] = [];
    for (let i = start; i < ok.length && xs.length < n; i++) {
      // Only neighbours (no hopping over a post that's under the clock).
      if (xs.length && rail.posts.indexOf(ok[i]!) !== rail.posts.indexOf(xs[xs.length - 1]!) + 1) break;
      xs.push(ok[i]!);
    }
    if (xs.length) return { rail, xs };
  }
  return null;
}

/**
 * Every free fence post on the farm: clear above its top for something `h` tall standing on it (the
 * owl), or, with `face`, clear down its whole front face (for a ladybug crawling on it).
 */
export function freePosts(l: Layout, h = 16, face = false): { rail: Rail; x: number }[] {
  const out: { rail: Rail; x: number }[] = [];
  for (const rail of fenceRuns(l).rails) {
    for (const x of rail.posts) {
      const ok = face ? perchClear(l, x, rail.feet, 14, POST_TOP + 4) : perchClear(l, x, rail.feet - POST_TOP, 14, h);
      if (ok) out.push({ rail, x });
    }
  }
  return out;
}

/** Is (x, y) a good bit of open pasture grass (not in the fox corner, under the HUD or the bottom rail)? */
export function openGrass(l: Layout, x: number, y: number, margin = 8): boolean {
  const p = l.pasture;
  if (x < p.x + margin || x > p.x + p.w - margin || y < p.y + margin || y > p.y + p.h - Math.max(margin, FENCE_HIDE)) return false;
  // The whole critter (a bird is ~16px wide and ~12px tall) has to stay clear of the HUD & the fox corner.
  const body: Rect = { x: x - 8, y: y - 12, w: 16, h: 13 };
  for (const b of l.blocked) if (overlaps(body, b)) return false;
  if (contains(critterZone(l), x, y)) return false;
  for (const d of decorPoints(l)) if (Math.abs(d.x - x) < 12 && y > d.y - 14 && y < d.y + 5) return false;
  return true;
}

/** A random open spot in the pasture where a critter may land. */
export function pastureSpot(l: Layout, margin = 8): Point {
  const p = l.pasture;
  for (let i = 0; i < 16; i++) {
    const x = p.x + margin + Math.random() * Math.max(1, p.w - margin * 2);
    const y = p.y + margin + Math.random() * Math.max(1, p.h - margin - Math.max(margin, FENCE_HIDE));
    if (openGrass(l, x, y, margin)) return { x, y };
  }
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

type DecorPoint = Point & { kind: DecorKind; id: string };
let decorCache: { l: Layout; d: readonly unknown[]; at: number; pts: DecorPoint[] } | null = null;

/** Decorations as world points (feet), optionally only some kinds. Cached until the layout or decorations change. */
export function decorPoints(l: Layout, kinds?: readonly DecorKind[]): DecorPoint[] {
  const d = store.state?.decorations;
  if (!d || !d.length) return [];
  const now = performance.now();
  // (Also refreshed every couple of seconds, in case a decoration was moved in place.)
  if (!decorCache || decorCache.l !== l || decorCache.d !== d || now - decorCache.at > 2000) {
    const pts: DecorPoint[] = [];
    for (const x of d) {
      const p = fromFraction(l, x.fx, x.fy);
      pts.push({ x: p.x, y: p.y, kind: x.kind, id: x.id });
    }
    decorCache = { l, d, at: now, pts };
  }
  return kinds ? decorCache.pts.filter((p) => kinds.includes(p.kind)) : decorCache.pts;
}

export function hasScarecrow(): boolean {
  const d = store.state?.decorations;
  if (!d) return false;
  for (const x of d) if (x.kind === "scarecrow" || x.kind === "rarecrow") return true;
  return false;
}

const wildCache = new WeakMap<Layout, Point[]>();

/** A few fixed "wildflower" spots in the pasture for bees & butterflies to visit (stable per layout). */
export function wildflowers(l: Layout): Point[] {
  let w = wildCache.get(l);
  if (w) return w;
  w = [];
  const p = l.pasture;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 24 && w.length < 5; i++) {
    const x = p.x + 14 + r() * (p.w - 28);
    const y = p.y + 10 + r() * Math.max(1, p.h - 10 - FENCE_HIDE - 4);
    let ok = true;
    for (const b of l.blocked) if (contains(b, x, y)) ok = false;
    if (contains(critterZone(l), x, y)) ok = false;
    if (ok) w.push({ x: Math.round(x), y: Math.round(y) });
  }
  wildCache.set(l, w);
  return w;
}
