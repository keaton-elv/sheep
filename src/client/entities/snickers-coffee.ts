// The morning coffee on the fence post. About one morning in five (the same mornings on both phones,
// 6:00 to 10:30, dry weather), somebody leaves a steaming mug of Stardew coffee on a top-rail post
// by the yard. Tap it for a sip. A minute or two later Snickers strolls over (getting up from his
// nap for it), sits down beside it, turns to look you dead in the eye, and pushes it off the post:
// three swipes, eye contact the whole time. It smashes in the grass, leaves a little splash until
// noon, and doesn't come back that day. A coffee bean rolls out of the mess (one a day per phone,
// for the Exotic Foraging Bundle): it's the only place beans come from.
// In landscape the top rail is way up past the barn, out of his reach: there it's left on the roof
// of the calendar board.
// About one morning in six, the same mornings on both phones, 6:00 to 10:30, dry weather.
// Debug: ?coffee puts the mug out right away (any day, hour or weather) and he comes after 12 s
// (even out of his night's sleep).

import { dayKey } from "../../shared/calendar";
import { objectRegion } from "../art/regions";
import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw, REGIONS } from "../engine/sprites";
import { toast } from "../ui/dom";
import type { Layout, Point } from "../world/layout";
import { dropCoffeeBean } from "../world/world-nature";
import { hash2 } from "../world/world-pixels";
import { freePosts, onLayoutChange, POST_TOP } from "./critter-place";
import { addSafe, chance, dotPuff, lsGet, lsSet, onTick, params, rand, reducedMotion } from "./critter-util";
import { DISH_H } from "./snickers-bowl";
import type { Yard } from "./snickers-spots";

REGIONS["item.coffee"] ??= objectRegion(395);

const DAY_KEY = "farm.coffee.day";
const FIRST_KEY = "farm.snickers.coffee";
const HOT_LINE = "Still hot.";
const ROAST_LINE = "It's from Blue Bottle or Sightglass or Ritual or Philz. Snickers can't tell, he's a cat.";
const EYE_LINE = "He made eye contact the whole time.";

/** The mug's opaque pixels in its 16x16 cell: columns 1..12, rows 2..14 (handle on the left). */
const MUG_L = 1;
const MUG_R = 12;
const MUG_TOP = 2;
const MUG_BOTTOM = 14;
/** Where the steam rises from (the middle of the coffee), in cell px. */
const RIM_X = 6;
const SPLASH = "#6b3e1f";
const SHARD = "#f4ead2";

export interface KnockHooks {
  /** A swipe: the mug scoots 1 px toward the edge. */
  nudge(): void;
  /** The third swipe: over it goes. */
  tip(): void;
  /** He got distracted (a pet, a rotation): the mug stays, he'll be back. */
  cancel(): void;
}

/** What the mug needs from Snickers (snickers.ts wires this up). */
export interface CoffeeCat {
  yard(): Yard | null;
  /**
   * Walk over to `seat` and knock the mug at `mug` off: false if he's busy (asleep for the night,
   * eating...). `forced` (?coffee): he gets up for it at any hour.
   */
  knock(mug: Point, seat: Point, hooks: KnockHooks, forced: boolean): boolean;
}

const seedOf = (key: string) => Number(key.replaceAll("-", ""));

/** About one morning in six, the same mornings on both phones. */
function coffeeMorning(key: string): boolean {
  return hash2(seedOf(key), 0xc0f, 0xfee) < 1 / 6;
}

interface Spotting {
  /** The perch's center x and the mug's feet (on the post cap, or on the calendar board's roof). */
  x: number;
  feet: number;
  /** The perch's feet line (the mug sorts just in front of it, like a bird on a post). */
  rail: number;
  /** Where Snickers sits to do it, and which way the mug falls (away from him). */
  seat: Point;
  away: 1 | -1;
}

/**
 * Where a mug could go: the free top-rail posts (clear of the gate). In landscape the top rail runs
 * along the top of the screen, way past the barn, so: the roof of the calendar board (its left end,
 * clear of its "!", where he can reach it from beside it), or the chest's lid. (world-objects.ts
 * draws them 30 and 22 px tall. Not the mailbox: its letter bobs right there.)
 */
function perches(l: Layout): { x: number; feet: number; rail: number }[] {
  if (!l.portrait) {
    return [
      { x: l.billboard.x - 8, feet: l.billboard.y - 28, rail: l.billboard.y },
      { x: l.chest.x, feet: l.chest.y - 21, rail: l.chest.y },
    ];
  }
  const out: { x: number; feet: number; rail: number }[] = [];
  for (const p of freePosts(l, 16)) {
    if (p.rail.top && Math.abs(p.x - l.gate.x) >= 14) out.push({ x: p.x, feet: p.rail.feet - POST_TOP + 1, rail: p.rail.feet });
  }
  return out;
}

/**
 * A perch with room for him to sit up right beside it (just behind the post caps, or the board's
 * roof), close enough that his paw reaches. Picked by the date, so it's the same post all morning.
 */
function spotFor(l: Layout, yard: Yard, key: string): Spotting | null {
  const found: Spotting[] = [];
  for (const p of perches(l)) {
    let best: Spotting | null = null;
    // His swiping paw reaches ~9 px out from his feet: 14 px puts it right against the mug.
    for (const d of [14, 15, 13, 16, 12, 17, 18, 11, 10, 19, 20, 21, 22]) {
      for (const side of [1, -1] as const) {
        const sx = p.x + side * d;
        for (const sy of [p.feet - 1, p.feet - 2]) {
          // Not on the doorstep (the sheep's way in and out), and not in front of his dish.
          if (Math.abs(sx - yard.door.x) < 16 && Math.abs(sy - yard.door.y) < 10) continue;
          const dish = yard.dish;
          if (dish && Math.abs(sx - dish.x) < 18 && sy > dish.y - DISH_H && sy - 25 < dish.y) continue;
          if (!yard.sitsUp(sx, sy)) continue;
          best = { x: p.x, feet: p.feet, rail: p.rail, seat: { x: sx, y: sy }, away: side > 0 ? -1 : 1 };
          break;
        }
        if (best) break;
      }
      if (best) break;
    }
    if (best) found.push(best);
  }
  if (!found.length) return null;
  return found[Math.floor(hash2(seedOf(key), 0x9057, 0xfee) * found.length)] ?? null;
}

type MugState = "sit" | "fall" | "broken";

/** A wisp of steam (pooled: no allocations while it steams). */
interface Wisp {
  on: boolean;
  x: number;
  t: number;
  wob: number;
}
const WISP_LIFE = 1.3;

class Mug implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  state: MugState = "sit";
  /** Scooted toward the edge by his swipes. */
  private dx = 0;
  /** The fall: time, and the landing point. */
  private ft = 0;
  private landY = 0;
  private wispIn = 0.3;
  private wisps: Wisp[] = Array.from({ length: 8 }, () => ({ on: false, x: 0, t: 0, wob: 0 }));
  /** Has it been on screen yet (his timer starts then), and when he comes for it (game time). */
  shown = false;
  catAt = Infinity;
  private taps = 0;
  private lastRoast = -1e9;

  constructor(
    private readonly g: Game,
    public at: Spotting,
    /** It landed (and smashed) at (x, y). */
    private readonly onBroken: (x: number, y: number) => void,
  ) {
    this.place(at);
  }

  place(at: Spotting): void {
    this.at = at;
    this.x = at.x;
    this.y = at.rail + 0.5;
  }

  get point(): Point {
    return { x: this.at.x + this.dx, y: this.at.feet };
  }

  /** The mug's drawn left/top (cell origin). */
  private left(): number {
    return Math.round(this.at.x + this.dx) - 8;
  }
  private top(): number {
    return this.at.feet - MUG_BOTTOM;
  }

  puff(n: number): void {
    for (let i = 0; i < n; i++) {
      const w = this.wisps.find((v) => !v.on);
      if (!w) return;
      w.on = true;
      w.t = -i * 0.18;
      w.x = this.left() + RIM_X + Math.round(rand(-2, 2));
      w.wob = Math.random() * 6.28;
    }
  }

  nudge(): void {
    this.dx += this.at.away;
    sfx("thud", { volume: 0.12, pitch: 1.9 });
  }

  tip(): void {
    if (this.state !== "sit") return;
    this.state = "fall";
    this.ft = 0;
    this.landY = this.at.rail + 6;
  }

  update(dt: number): void {
    if (this.state === "sit") {
      if (reducedMotion) return;
      this.wispIn -= dt;
      if (this.wispIn <= 0) {
        this.wispIn = 0.6;
        this.puff(1);
      }
      for (const w of this.wisps) {
        if (!w.on) continue;
        w.t += dt;
        if (w.t > WISP_LIFE) w.on = false;
      }
      return;
    }
    if (this.state !== "fall") return;
    this.ft += dt;
    const y = this.at.feet + 0.5 * 220 * this.ft * this.ft;
    // (It falls in front of the rails (or the board), into the grass.)
    this.y = Math.max(this.at.rail + 0.5, y);
    if (y >= this.landY) {
      this.state = "broken";
      this.layer = 0;
      this.y = this.landY;
      const cx = this.at.x + this.dx + this.at.away * 20 * this.ft;
      this.dx = cx - this.at.x;
      sfx("smash", { volume: 0.5 });
      dotPuff(cx, this.landY - 1, ["#6b3e1f", "#a8673a", "#e9dcc8"], 6);
      this.onBroken(cx, this.landY);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === "broken") {
      drawSplash(ctx, Math.round(this.at.x + this.dx), Math.round(this.landY));
      return;
    }
    this.shown = true;
    if (this.state === "fall") {
      // Off the far side in an arc, tipping over onto its side as it goes.
      const t = this.ft;
      const x = this.at.x + this.dx + this.at.away * 20 * t;
      const y = this.at.feet + 0.5 * 220 * t * t;
      const turn = Math.min(1, t / 0.4) * (Math.PI / 2) * this.at.away;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y) - 6);
      ctx.rotate(turn);
      draw(ctx, "item.coffee", -8, -8);
      ctx.restore();
      return;
    }
    const left = this.left();
    draw(ctx, "item.coffee", left, this.top());
    // Steam: wisps of white rising off the coffee (two still pixels with reduced motion).
    const rim = this.top() + MUG_TOP;
    ctx.fillStyle = "#ffffff";
    if (reducedMotion) {
      ctx.globalAlpha = 0.5;
      ctx.fillRect(left + RIM_X - 1, rim - 3, 1, 1);
      ctx.fillRect(left + RIM_X + 1, rim - 5, 1, 1);
      ctx.globalAlpha = 1;
      return;
    }
    for (const w of this.wisps) {
      if (!w.on || w.t < 0) continue;
      const k = w.t / WISP_LIFE;
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.fillRect(w.x + Math.round(Math.sin(w.wob + w.t * 4) * 0.8), Math.round(rim - 1 - k * 6), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  hit(wx: number, wy: number): boolean {
    if (this.state !== "sit") return false;
    // A little roomier than the mug, but not much: Snickers sits right next to it.
    const left = this.left();
    const top = this.top();
    return wx >= left + MUG_L - 2 && wx <= left + MUG_R + 2 && wy >= top + MUG_TOP - 3 && wy <= top + MUG_BOTTOM + 2;
  }

  onTap(): void {
    sfx("sip");
    this.puff(3);
    this.catAt += 30;
    this.taps++;
    if (this.taps === 1) toast(HOT_LINE, { icon: "item.coffee" });
    else if (this.g.time - this.lastRoast > 30 && chance(0.25)) {
      this.lastRoast = this.g.time;
      toast(ROAST_LINE, { icon: "item.coffee" });
    }
  }
}

/** What's left of it: a little puddle of coffee and two bits of mug. */
function drawSplash(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = SPLASH;
  ctx.fillRect(x - 1, y - 1, 3, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = SHARD;
  ctx.fillRect(x - 3, y, 1, 1);
  ctx.fillRect(x + 3, y - 1, 1, 1);
}

/** The puddle on its own (a reload after he's done it, until noon). */
class Splash implements Entity {
  layer = 0;
  dead = false;
  constructor(
    public x: number,
    public y: number,
  ) {}
  draw(ctx: CanvasRenderingContext2D): void {
    drawSplash(ctx, Math.round(this.x), Math.round(this.y));
  }
}

export function initCoffee(g: Game, cat: CoffeeCat): void {
  const force = params.has("coffee");
  let mug: Mug | null = null;
  let splash: Splash | null = null;
  let checkIn = 1;
  /** He's on his way to it (or at it): it stays put until he's done. */
  let coming = false;

  const today = () => dayKey(g.env.now);
  const morning = () => {
    const e = g.env;
    return e.hour >= 6 && e.hour < 10.5 && e.weather !== "rain" && e.weather !== "storm" && e.weather !== "snow";
  };

  const remove = () => {
    if (mug) mug.dead = true;
    if (splash) splash.dead = true;
    mug = null;
    splash = null;
  };

  const hooks: KnockHooks = {
    nudge: () => mug?.nudge(),
    tip: () => mug?.tip(),
    cancel: () => {
      // Distracted: he'll come back for it in a bit.
      coming = false;
      if (mug && mug.state === "sit") mug.catAt = g.time + rand(20, 35);
    },
  };

  const broken = (x: number, y: number) => {
    coming = false;
    lsSet(DAY_KEY, today());
    dropCoffeeBean(g, x, y + 3, true);
    if (lsGet(FIRST_KEY)) return;
    lsSet(FIRST_KEY, String(Date.now()));
    window.setTimeout(() => toast(EYE_LINE, { icon: "item.coffee" }), 600);
  };

  onTick(g, "coffee", (dt) => {
    checkIn -= dt;
    if (mug?.state === "sit" && mug.shown && g.shown) {
      // Soon after she sees it (a morning check is short, and the wait starts over on every visit).
      if (mug.catAt === Infinity) mug.catAt = g.time + (force ? 12 : rand(8, 18));
      if (g.time >= mug.catAt && !coming) {
        mug.catAt = g.time + 4; // (he's busy: ask again in a few seconds)
        const at = mug.point;
        // Always "forced": the mug only comes out in the morning, and coffee gets him up even from his
        // night's sleep (before sunrise in fall and winter he'd otherwise sleep right through it).
        if (cat.knock({ x: at.x, y: at.y }, mug.at.seat, hooks, true)) coming = true;
      }
    }
    if (checkIn > 0) return;
    checkIn = 2;
    const key = today();
    const l = g.layout;
    const yard = cat.yard();
    // Broken: the puddle stays until noon.
    if (mug?.state === "broken" || splash) {
      if (g.env.hour >= 12 && !force) remove();
      return;
    }
    const done = lsGet(DAY_KEY) === key;
    if (!mug && done && g.env.hour < 12 && yard && !force) {
      // Reloaded after he knocked it off: just the puddle, where it landed.
      const s = spotFor(l, yard, key);
      if (s) {
        splash = addSafe(g, new Splash(s.x + s.away * 12, s.rail + 6), "coffee splash");
        // Its bean, if nobody picked it up yet.
        dropCoffeeBean(g, s.x + s.away * 12, s.rail + 9, false);
      }
      return;
    }
    const wanted = force || (!done && coffeeMorning(key) && morning());
    if (mug) {
      // The window closed before he got to it: someone must've taken it in.
      if (!wanted && mug.state === "sit" && !coming) remove();
      return;
    }
    if (!wanted || !yard) return;
    const s = spotFor(l, yard, key);
    if (s) mug = addSafe(g, new Mug(g, s, broken), "coffee");
  });

  onLayoutChange(g, "coffee", () => {
    // A rotation or a new window size: put it back on the right post (or the board, in landscape).
    if (mug?.state === "fall") return;
    const yard = cat.yard();
    const s = yard ? spotFor(g.layout, yard, today()) : null;
    if (mug && mug.state === "sit" && s) mug.place(s);
    else if (mug && mug.state === "sit") remove();
    else if (mug || splash) remove();
    checkIn = 0;
  });
}
