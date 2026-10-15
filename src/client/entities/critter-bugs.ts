// Bugs, tiny and hand-drawn:
//  - Ladybugs crawl slowly over the grass, up and down fence posts and over the flower tubs.
//    Tap one and it flutters off: it's your lucky day (once a day). A very rare golden one is
//    extra lucky.
//  - Bumblebees bumble from flower to flower (tubs, pumpkins, blossoming trees, the corner's
//    wildflowers) and keep a little cluster busy around every bee house you've placed.
//  - The Bumblesteed: a ladybug knight riding a bumblebee. A rare sighting, galloping across
//    the pasture; tap it to hail the knight.
// Lots in spring & summer, a few in fall, none in winter; none at night or in the rain.
// Debug: ?ladybug=1 (more ladybugs, sooner), ?golden=1 (the next ladybug is golden), ?bees=1,
// ?bumblesteed=1

import { sfx } from "../audio";
import { currentGame, type Entity, type Game } from "../engine/game";
import { draw } from "../engine/sprites";
import type { Layout } from "../world/layout";
import { dayKey } from "../../shared/calendar";
import { toast } from "../ui/dom";
import { hangout, wineDay } from "./critter-fox";
import { decorPoints, freePosts, onLayoutChange, openGrass, pastureSpot, wildflowers } from "./critter-place";
import { addSafe, chance, drawShadow, inBox, lsGet, lsSet, onAnyTap, onTick, params, rand, report, sparkleBurst } from "./critter-util";

const LUCKY_KEY = "farm.ladybugDay";
/** The day a golden ladybug was found (tapped) on this device. */
const GOLDEN_KEY = "farm.goldenLadybugDay";
/** The day a golden ladybug last showed up: at most one a day, so it stays special. */
const GOLDEN_SEEN_KEY = "farm.goldenLadybugSeen";
const GOLDEN_CHANCE = 0.02;

/** Is it bug weather? (daylight, no rain/snow) */
function bugTime(g: Game): boolean {
  const e = g.env;
  return e.darkness < 0.35 && e.weather !== "rain" && e.weather !== "storm" && e.weather !== "snow";
}

// ---------- ladybugs ----------

type Surface = "grass" | "post" | "flower";

interface Patch {
  surface: Surface;
  /** Where it starts (a known-good spot). */
  cx: number;
  cy: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Sort line (just in front of whatever it's crawling on). */
  sortY: number;
}

/** Somewhere for a ladybug to crawl: a bit of grass, the face of a fence post, or a flower tub. */
function ladybugPatch(g: Game): Patch {
  const l = g.layout;
  const r = Math.random();
  if (r < 0.28) {
    const flowers = flowerPatches(g);
    const f = flowers[Math.floor(Math.random() * flowers.length)];
    if (f) return f;
  }
  if (r < 0.55) {
    const posts = freePosts(l, 0, true);
    const p = posts[Math.floor(Math.random() * posts.length)];
    if (p) {
      const F = p.rail.feet;
      return { surface: "post", cx: p.x, cy: F - rand(9, 20), x0: p.x - 1, x1: p.x, y0: F - 22, y1: F - 7, sortY: F + 1 };
    }
  }
  const c = pastureSpot(l, 16);
  return { surface: "grass", cx: c.x, cy: c.y, x0: c.x - 18, x1: c.x + 18, y0: c.y - 8, y1: c.y + 8, sortY: 0 };
}

/** The tops of the flower tubs (and, in spring & summer, the fox corner's wildflowers). */
function flowerPatches(g: Game): Patch[] {
  const l = g.layout;
  const out: Patch[] = [];
  for (const d of decorPoints(l, ["flowers"])) out.push({ surface: "flower", cx: d.x, cy: d.y - 21, x0: d.x - 5, x1: d.x + 5, y0: d.y - 26, y1: d.y - 16, sortY: d.y + 1 });
  const s = g.env.season;
  if (s === "spring" || s === "summer") {
    // The corner's yellow & blue wildflowers (critter-fox.ts draws them at corner-local (3, 31)).
    const c = hangout(l);
    out.push({ surface: "flower", cx: c.x - 1, cy: c.y + 25, x0: c.x - 2, x1: c.x + 7, y0: c.y + 24, y1: c.y + 26, sortY: c.y + 32 });
  }
  return out;
}

class Ladybug implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  /** Its center, in world px. */
  px: number;
  py: number;
  private heading: number;
  private speed = rand(2.5, 4);
  private pause = 0;
  private t = 0;
  private alpha = 0;
  private life = rand(60, 150);
  private flying = false;
  private fvx = 0;
  private fvy = 0;
  private flyT = 0;
  private sparkleIn = 1;
  /** Which way the sprite is drawn (0 right, 1 down, 2 left, 3 up), with a little hysteresis. */
  private dir4 = 0;

  constructor(
    private g: Game,
    private patch: Patch,
    readonly golden: boolean,
  ) {
    this.px = patch.cx;
    this.py = patch.cy;
    this.heading = patch.surface === "post" ? (chance(0.5) ? -Math.PI / 2 : Math.PI / 2) : Math.random() * Math.PI * 2;
  }

  get leaving(): boolean {
    return this.flying;
  }

  /** Flutter away (tapped, or just time to go). */
  flyOff(): void {
    if (this.flying) return;
    this.flying = true;
    this.flyT = 0;
    const dir = Math.cos(this.heading) >= 0 ? 1 : -1;
    this.fvx = dir * rand(10, 18);
    this.fvy = -rand(14, 22);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.flying) {
      this.flyT += dt;
      this.px += (this.fvx + Math.sin(this.flyT * 9) * 8) * dt;
      this.py += (this.fvy + Math.cos(this.flyT * 13) * 6) * dt;
      this.alpha = Math.max(0, 1 - Math.max(0, this.flyT - 1.2) / 0.8);
      if (this.flyT > 2) this.dead = true;
    } else {
      this.alpha = Math.min(1, this.alpha + dt * 1.5);
      this.life -= dt;
      if (this.life <= 0 || (!bugTime(this.g) && !params.has("ladybug") && !params.has("golden"))) this.flyOff();
      this.crawl(dt);
      if (this.golden) {
        this.sparkleIn -= dt;
        if (this.sparkleIn <= 0) {
          this.sparkleIn = rand(1.2, 2.6);
          sparkleBurst(this.px + rand(-2, 2), this.py - 3, 1, 3);
        }
      }
    }
    this.x = this.px;
    this.y = this.flying ? this.py + 12 : this.patch.sortY || this.py;
    this.layer = this.flying ? 2 : 1;
  }

  private crawl(dt: number): void {
    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }
    if (chance(dt / 4)) {
      this.pause = rand(0.8, 3);
      return;
    }
    const p = this.patch;
    const post = p.surface === "post";
    // Wander: little random turns (mostly up & down on a post).
    if (post) {
      if (chance(dt / 3)) this.heading = -this.heading;
    } else this.heading += rand(-1.5, 1.5) * dt;
    const nx = this.px + Math.cos(this.heading) * this.speed * dt * (post ? 0.15 : 1);
    const ny = this.py + Math.sin(this.heading) * this.speed * dt;
    const inside = nx >= p.x0 && nx <= p.x1 && ny >= p.y0 && ny <= p.y1 && (p.surface !== "grass" || openGrass(this.g.layout, nx, ny, 4));
    if (!inside) {
      this.heading = post ? -this.heading : this.heading + Math.PI + rand(-0.6, 0.6);
      return;
    }
    this.px = nx;
    this.py = ny;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    const base = this.golden ? "critter.goldbug" : "critter.ladybug";
    const x = Math.round(this.px);
    const y = Math.round(this.py);
    if (this.flying) {
      const key = Math.floor(this.flyT / 0.04) % 2 ? `${base}.fly.1` : `${base}.fly.0`;
      draw(ctx, key, x - 3, y - 3, { flipX: this.fvx < 0, alpha: this.alpha });
      return;
    }
    if (this.patch.surface === "grass") drawShadow(ctx, x, y + 2, 5, 0.7 * this.alpha);
    // Four directions: the sprite crawls right; mirror for left, turn it for up & down.
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const vertical = this.dir4 % 2 === 1;
    // Only turn the sprite once the heading is clearly in another direction (no flicker at 45°).
    if (vertical ? Math.abs(c) > Math.abs(s) * 1.3 : Math.abs(s) > Math.abs(c) * 1.3) this.dir4 = vertical ? (c < 0 ? 2 : 0) : s < 0 ? 3 : 1;
    else if (vertical) this.dir4 = s < 0 ? 3 : 1;
    else this.dir4 = c < 0 ? 2 : 0;
    const key = `${base}.0`;
    ctx.save();
    ctx.globalAlpha *= this.alpha;
    ctx.translate(x, y);
    if (this.dir4 % 2 === 1) {
      ctx.rotate(this.dir4 === 3 ? -Math.PI / 2 : Math.PI / 2);
      draw(ctx, key, -3, -2);
    } else draw(ctx, key, -3, -2, { flipX: this.dir4 === 2 });
    ctx.restore();
  }

  hit(wx: number, wy: number): boolean {
    // Much bigger than the bug itself (it's 6px long): a thumb has to be able to find it.
    return !this.flying && this.alpha > 0.5 && inBox(wx, wy, this.px - 8, this.py - 8, 16, 14);
  }

  onTap(g: Game): void {
    if (this.flying) return;
    this.flyOff();
    sfx("pop", { volume: 0.4, pitch: 1.7 });
    const today = dayKey(g.env.now);
    if (this.golden) {
      lsSet(GOLDEN_KEY, today);
      sfx("secret");
      sparkleBurst(this.px, this.py - 2, 8, 14);
      toast("A golden ladybug!! Rarer than a sunny day in the Sunset.", { icon: "critter.goldbug.icon" });
      return;
    }
    if (lsGet(LUCKY_KEY) !== today) {
      lsSet(LUCKY_KEY, today);
      toast(chance(0.5) ? "A ladybug! Lucky day 🍀" : "A ladybug! Luckier than parking in the Mission 🍀", { icon: "critter.ladybug.icon" });
    }
  }
}

// ---------- bumblebees ----------

export interface Target {
  x: number;
  y: number;
  /** Sort line while resting there. */
  sortY: number;
  /** Just hovering here (around the bee house), not sitting on a flower. */
  hover?: boolean;
}

/** Every flower-ish thing a bee (or a hummingbird) might visit right now. */
export function flowerTargets(g: Game, l: Layout): Target[] {
  const out: Target[] = [];
  const s = g.env.season;
  for (const d of decorPoints(l, ["flowers", "pumpkin", "tree"])) {
    if (d.kind === "flowers") out.push({ x: d.x + rand(-5, 5), y: d.y - rand(17, 26), sortY: d.y + 1 }, { x: d.x + rand(-5, 5), y: d.y - rand(17, 26), sortY: d.y + 1 });
    else if (d.kind === "pumpkin") out.push({ x: d.x + rand(-4, 4), y: d.y - 12, sortY: d.y + 1 });
    else if (s === "spring" || s === "summer") out.push({ x: d.x + rand(-10, 10), y: d.y - rand(24, 36), sortY: d.y + 1 });
  }
  if (s === "spring" || s === "summer") {
    // The corner's wildflowers (two blooms at corner-local (3, 31), two more at (57, 30) in spring,
    // except on Wine Wednesdays: that's where the wine goes).
    const c = hangout(l);
    out.push({ x: c.x - 1, y: c.y + 24, sortY: c.y + 32 }, { x: c.x + 6, y: c.y + 24, sortY: c.y + 32 });
    if (s === "spring" && !wineDay(g)) out.push({ x: c.x + 53, y: c.y + 23, sortY: c.y + 31 }, { x: c.x + 60, y: c.y + 23, sortY: c.y + 31 });
  }
  for (const w of wildflowers(l)) out.push({ x: w.x, y: w.y - 2, sortY: w.y + 1 });
  return out;
}

class Bee implements Entity {
  x = 0;
  y = 0;
  layer = 2;
  dead = false;
  px: number;
  py: number;
  private vx = 0;
  private vy = 0;
  private t = Math.random() * 10;
  private ph = Math.random() * 10;
  private target: Target;
  private resting = 0;
  private dart = 0;
  private alpha = 0;
  leaving = false;

  constructor(
    private g: Game,
    /** The bee house it belongs to (null = a wild bee). */
    readonly hive: { id: string; x: number; y: number } | null,
    x: number,
    y: number,
  ) {
    this.px = x;
    this.py = y;
    this.target = this.pickTarget();
  }

  private hiveSpot(): Target {
    const h = this.hive!;
    return { x: h.x + rand(-11, 11), y: h.y - rand(10, 26), sortY: h.y + 1, hover: true };
  }

  private pickTarget(): Target {
    const l = this.g.layout;
    if (this.hive) {
      // Hive bees: mostly buzz around the box, sometimes pop over to a flower close by.
      if (chance(0.3)) {
        const near = flowerTargets(this.g, l).filter((f) => Math.hypot(f.x - this.hive!.x, f.y - this.hive!.y) < 70);
        const f = near[Math.floor(Math.random() * near.length)];
        if (f) return f;
      }
      return this.hiveSpot();
    }
    const all = flowerTargets(this.g, l);
    const f = all[Math.floor(Math.random() * all.length)];
    if (f) return f;
    const s = pastureSpot(l, 14);
    return { x: s.x, y: s.y - 3, sortY: s.y + 1 };
  }

  /** Off you go (out of season, bedtime, the bee house was moved...). */
  leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.resting = 0;
    if (this.hive) this.target = { x: this.hive.x, y: this.hive.y - 14, sortY: this.hive.y + 1 };
    else {
      const l = this.g.layout;
      this.target = { x: this.px < l.w / 2 ? -12 : l.w + 12, y: this.py - rand(10, 40), sortY: 0 };
    }
  }

  /** Startled: zip off somewhere else for a moment. */
  startle(fromX: number, fromY: number): void {
    if (this.leaving) return;
    this.resting = 0;
    this.dart = 0.8;
    const a = Math.atan2(this.py - fromY, this.px - fromX);
    this.vx = Math.cos(a) * 40;
    this.vy = Math.sin(a) * 40;
    this.target = this.pickTarget();
  }

  update(dt: number): void {
    this.t += dt;
    if (this.dart > 0) this.dart -= dt;
    const fadeOut = this.leaving && this.hive && Math.hypot(this.target.x - this.px, this.target.y - this.py) < 6;
    this.alpha = fadeOut ? this.alpha - dt * 2 : Math.min(1, this.alpha + dt * 2);
    if (this.alpha <= 0 && this.leaving) {
      this.dead = true;
      return;
    }
    if (this.resting > 0) {
      this.resting -= dt;
      if (this.resting <= 0) this.target = this.pickTarget();
    } else {
      // Bumble: steer toward the target, wobbling all the way.
      const dx = this.target.x - this.px;
      const dy = this.target.y - this.py;
      const d = Math.hypot(dx, dy);
      const speed = this.dart > 0 ? 34 : this.leaving ? 20 : 13;
      if (d < 1.5 && !this.leaving) {
        this.resting = this.target.hover ? rand(0.3, 1.2) : rand(1, 3.2);
        this.vx = this.vy = 0;
      } else {
        const k = Math.min(1, dt * (this.dart > 0 ? 1.5 : 3));
        this.vx += ((dx / Math.max(d, 0.001)) * speed - this.vx) * k;
        this.vy += ((dy / Math.max(d, 0.001)) * speed - this.vy) * k;
        const wob = d < 6 ? 0.35 : 1;
        this.px += (this.vx + Math.sin(this.t * 6.3 + this.ph) * 11 * wob) * dt;
        this.py += (this.vy + Math.cos(this.t * 8.7 + this.ph) * 7 * wob) * dt;
      }
      const l = this.g.layout;
      if (this.leaving && !this.hive && (this.px < -10 || this.px > l.w + 10)) this.dead = true;
    }
    const resting = this.resting > 0;
    this.x = this.px;
    this.y = resting ? this.target.sortY : this.py + 14;
    this.layer = resting ? 1 : 2;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    const onFlower = this.resting > 0 && !this.target.hover;
    // Wings flicker fast in the air, slower while it's busy on a flower.
    const f = Math.floor(this.t / (onFlower ? 0.14 : 0.045)) % 2;
    const jiggle = this.resting > 0 && Math.floor(this.t * (onFlower ? 3 : 9)) % 4 === 0 ? 1 : 0;
    const resting = this.resting > 0;
    const faceLeft = resting ? this.vx < 0 || (this.vx === 0 && Math.sin(this.ph) < 0) : this.vx < 0;
    draw(ctx, f ? "critter.bee.1" : "critter.bee.0", Math.round(this.px) - 3 + jiggle, Math.round(this.py) - 3, { flipX: faceLeft, alpha: this.alpha });
  }

  near(x: number, y: number): boolean {
    return Math.abs(x - this.px) < 14 && Math.abs(y - this.py) < 14;
  }
}

// ---------- the Bumblesteed ----------

const STEED_W = 15;
const STEED_H = 10;
/** How high above the grass it rides (its shadow follows along on the ground). */
const STEED_ALT = 12;
/** When the farm last saw one (Otto writes in about it: see the mailbox). */
const STEED_SEEN_KEY = "farm.bumblesteed.lastSeen";

/** A Bumblesteed was seen (or hailed): note the day and tell the farm. */
function bumblesteedSighted(g: Game): void {
  lsSet(STEED_SEEN_KEY, String(Date.now())); // (try/catch inside: private mode just forgets)
  try {
    (currentGame ?? g).emit("bumblesteed");
  } catch (err) {
    report("bumblesteed.emit", err);
  }
}

/** A ladybug knight on a bumblebee, galloping through the air from one side of the farm to the other. */
class Bumblesteed implements Entity {
  x = 0;
  y = 0;
  layer = 3;
  dead = false;
  private px: number;
  private py: number;
  /** The ground line under it (its shadow, and its sort line). */
  private ground: number;
  private readonly dir: 1 | -1;
  private speed = rand(11, 14);
  private t = Math.random() * 3;
  private alpha = 0;
  private hailed = false;
  /** Has it crossed into view yet? (That's the sighting.) */
  private seen = false;
  /** A proud little rear-up after being hailed. */
  private rear = 0;

  constructor(
    private g: Game,
    private forced: boolean,
  ) {
    const l = g.layout;
    const p = l.pasture;
    this.dir = chance(0.5) ? 1 : -1;
    this.px = this.dir > 0 ? -STEED_W : l.w + STEED_W;
    // Across the upper two thirds of the pasture, clear of the fox corner and the bottom rail.
    this.ground = p.y + STEED_ALT + 10 + Math.random() * Math.max(8, p.h * 0.6 - STEED_ALT - 10);
    this.py = this.ground - STEED_ALT;
  }

  update(dt: number): void {
    this.t += dt;
    const l = this.g.layout;
    if (this.rear > 0) this.rear -= dt;
    // Bedtime or rain: the knight spurs on.
    if (!this.forced && !bugTime(this.g)) this.speed = Math.max(this.speed, 26);
    this.px += this.dir * this.speed * dt;
    // A stately gallop: a bounce every stride, and a slow rise and fall.
    const stride = Math.abs(Math.sin(this.t * 5.2)) * 2;
    const rear = this.rear > 0 ? Math.sin((this.rear / 0.7) * Math.PI) * 4 : 0;
    this.py = this.ground - STEED_ALT + Math.sin(this.t * 0.8) * 3 - stride - rear;
    this.alpha = Math.min(1, this.alpha + dt * 2);
    if (!this.seen && this.px > 0 && this.px < l.w) {
      this.seen = true;
      bumblesteedSighted(this.g);
    }
    if ((this.dir > 0 && this.px > l.w + STEED_W + 4) || (this.dir < 0 && this.px < -STEED_W - 4)) this.dead = true;
    this.x = this.px;
    this.y = this.ground;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    drawShadow(ctx, this.px, this.ground, 9, 0.7 * this.alpha);
    const key = Math.floor(this.t / 0.05) % 2 ? "critter.bumblesteed.1" : "critter.bumblesteed.0";
    draw(ctx, key, Math.round(this.px) - (STEED_W >> 1), Math.round(this.py) - (STEED_H >> 1), { flipX: this.dir < 0, alpha: this.alpha });
  }

  hit(wx: number, wy: number): boolean {
    return !this.hailed && this.alpha > 0.5 && inBox(wx, wy, this.px - 12, this.py - 10, 24, 20);
  }

  onTap(): void {
    if (this.hailed) return;
    this.hailed = true;
    this.rear = 0.7;
    this.speed = 22; // and off it gallops, triumphant
    sfx("secret");
    sparkleBurst(this.px, this.py - 3, 8, 14);
    toast("A Bumblesteed! A ladybug knight on her trusty bee.", { icon: "critter.bumblesteed.icon" });
    bumblesteedSighted(this.g);
  }
}

// ---------- the spawner ----------

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initBugs(g: Game): void {
  const forceLady = params.has("ladybug");
  let forceGolden = params.has("golden");
  const forceBees = params.has("bees");
  const forceSteed = params.has("bumblesteed");
  let ladybugs: Ladybug[] = [];
  let bees: Bee[] = [];
  let steed: Bumblesteed | null = null;
  let ladyIn = forceLady || forceGolden ? 1.5 : rand(2, 8);
  let beeIn = 1;
  let steedIn = forceSteed ? 2 : rand(60, 120);

  onTick(g, "bugs", (dt) => {
    const env = g.env;
    const season = env.season;
    const ok = bugTime(g) || forceBees;
    if (ladybugs.some((b) => b.dead)) ladybugs = ladybugs.filter((b) => !b.dead);
    if (bees.some((b) => b.dead)) bees = bees.filter((b) => !b.dead);

    // Ladybugs: a few in spring & summer, a couple in fall.
    let ladyWant = 0;
    if (bugTime(g)) ladyWant = season === "spring" || season === "summer" ? 3 : season === "fall" ? 2 : 0;
    if (forceLady) ladyWant = Math.max(ladyWant, 1) + 1;
    else if (forceGolden) ladyWant = Math.max(ladyWant, 1);
    const crawling = ladybugs.filter((b) => !b.leaving).length;
    if (crawling < ladyWant) {
      ladyIn -= dt;
      if (ladyIn <= 0) {
        ladyIn = forceLady ? rand(3, 6) : rand(5, 12);
        const today = dayKey(env.now);
        const golden = forceGolden || (lsGet(GOLDEN_SEEN_KEY) !== today && lsGet(GOLDEN_KEY) !== today && chance(GOLDEN_CHANCE));
        if (golden) lsSet(GOLDEN_SEEN_KEY, today);
        forceGolden = false;
        ladybugs.push(addSafe(g, new Ladybug(g, ladybugPatch(g), golden), golden ? "goldbug" : "ladybug"));
      }
    }

    // The Bumblesteed: a rare sighting on a fine day (about once every half hour or so of daytime
    // farm time, spring through fall; the bees sleep through winter).
    if (steed?.dead) steed = null;
    steedIn -= dt;
    if (steedIn <= 0) {
      steedIn = forceSteed ? 25 : rand(60, 120);
      const p = season === "winter" ? 0 : 0.05;
      if (!steed && ((bugTime(g) && chance(p)) || forceSteed)) steed = addSafe(g, new Bumblesteed(g, forceSteed), "bumblesteed");
    }

    // Bumblebees: wild ones roam, and every bee house keeps a little cluster busy.
    beeIn -= dt;
    if (beeIn > 0) return;
    beeIn = 0.6;
    const l = g.layout;
    const hives = decorPoints(l, ["beehouse"]);
    const busy = season === "spring" || season === "summer";
    // 3-5 bees per bee house in spring & summer (each house has its own number), 2 in fall.
    const perHive = (id: string) => (!ok ? 0 : busy ? 3 + (hashId(id) % 3) : season === "fall" ? 2 : forceBees ? 3 : 0);
    const flowers = decorPoints(l, ["flowers"]).length;
    const wildWant = !ok ? 0 : busy ? 4 + Math.min(2, flowers) : season === "fall" ? 2 : forceBees ? 3 : 0;
    // Leavers first: bees whose hive is gone, and anyone over the count.
    const hiveIds = new Set(hives.map((h) => h.id));
    for (const b of bees) if (b.hive && !hiveIds.has(b.hive.id)) b.leave();
    const wild = bees.filter((b) => !b.hive && !b.leaving);
    for (let i = wildWant; i < wild.length; i++) wild[i]!.leave();
    let spawned = false;
    for (const h of hives) {
      const mine = bees.filter((b) => b.hive?.id === h.id && !b.leaving);
      // The bee house may have been moved: follow it.
      for (const b of mine) if (b.hive && (b.hive.x !== h.x || b.hive.y !== h.y)) b.leave();
      const live = mine.filter((b) => !b.leaving);
      const want = perHive(h.id);
      for (let i = want; i < live.length; i++) live[i]!.leave();
      if (!spawned && live.length < want && bees.length < 20) {
        // Out of the bee house's little door, one at a time.
        bees.push(addSafe(g, new Bee(g, { id: h.id, x: h.x, y: h.y }, h.x + rand(-2, 2), h.y - 14), "bee"));
        spawned = true;
      }
    }
    if (!spawned && wild.length < wildWant && bees.length < 20 && chance(0.5)) {
      const fromLeft = chance(0.5);
      bees.push(addSafe(g, new Bee(g, null, fromLeft ? -8 : l.w + 8, l.pasture.y + rand(10, l.pasture.h * 0.7)), "bee"));
    }
  });

  // Tap near a bee: it zips off. (Ladybugs are tapped directly; see Ladybug.onTap.)
  onAnyTap(g, "bugs", (x, y) => {
    for (const b of bees) if (b.near(x, y)) b.startle(x, y);
  });

  // The farm's geometry changed: spots moved; let everyone go and come back fresh.
  onLayoutChange(g, "bugs", () => {
    for (const b of ladybugs) b.dead = true;
    for (const b of bees) b.dead = true;
    if (steed) steed.dead = true;
    ladybugs = [];
    bees = [];
    steed = null;
  });
}
