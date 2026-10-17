// Visitors from the sky, San Francisco edition:
//  - The wild parrots of Telegraph Hill: a little flock of green, red-headed parrots (the real
//    parrot from companions.png) streams over now and then, or drops onto a fence rail to chatter.
//    Tap them (or near them) and they're off, with a toast the first time.
//  - Seagulls: one or two glide over, slow and nosy (more on foggy days). Tap one and it lets you
//    know it has its eye on your pizza.
//  - Once in a while (a day at most, per device) a gull comes over the yard instead, carrying lunch,
//    and drops it by Snickers' dish: an anchovy, a sardine or (rarely) a SALMON. Snickers wins.
// Daytime only, never in rain or snow. Debug: ?parrots=1 ?gulls=1 ?gullfish (=salmon)

import { dayKey } from "../../shared/calendar";
import { objectRegion } from "../art/regions";
import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw, isReal, REGIONS } from "../engine/sprites";
import { toast } from "../ui/dom";
import type { Point } from "../world/layout";
import { GULL, PARROT } from "./critter-lore-art";
import { claimRail, onLayoutChange, RAIL_TOP, railGaps } from "./critter-place";
import { addSafe, chance, lsGet, lsSet, onAnyTap, onTick, params, rand, report } from "./critter-util";
import { snickersDish, snickersSnack } from "./snickers";

/** The fish a gull might drop (objects.png): mostly little ones, now and then the real thing. */
const FISH = { anchovy: 129, sardine: 131, salmon: 139 } as const;
type FishKind = keyof typeof FISH;
for (const [name, id] of Object.entries(FISH)) REGIONS[`item.fish.${name}`] ??= objectRegion(id);
const FISH_DAY = "farm.gull.fish";
const FISH_FIRST = "farm.gull.fishFirst";
const SALMON_LINE = "SALMON. He'll be talking about this for weeks.";
const FREE_LUNCH = "A seagull dropped a fish and Snickers ate it before anyone could say anything.";

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

function skyTime(g: Game): boolean {
  const e = g.env;
  return e.darkness < 0.35 && e.weather !== "rain" && e.weather !== "storm" && e.weather !== "snow";
}

// ---------- parrots ----------

type ParrotState = "in" | "perch" | "out" | "over";

class Parrot implements Entity {
  x = 0;
  y = 0;
  layer = 3;
  dead = false;
  state: ParrotState;
  private t: number;
  private anim = Math.random();
  private sx: number;
  private sy: number;
  private ex: number;
  private ey: number;
  private dur: number;
  /** Squawking (beak open) for this long. */
  private squawk = 0;
  private bob = 0;
  private bobIn = rand(1, 3);
  private wob = Math.random() * 6.28;
  /** Which way it's headed (the side frames face left natively). */
  private right: boolean;
  /** Where it is (x/y are the engine's sort position: perched, that's the fence's foot line). */
  private fx = 0;
  private fy = 0;
  /** Where it drew last, for taps. */
  cx = -99;
  cy = -99;

  constructor(
    private g: Game,
    over: boolean,
    fromLeft: boolean,
    /** Perch: feet on the rail. Flyover: the height of its line across the sky. */
    readonly px: number,
    readonly feet: number,
    private sortY: number,
    delay: number,
  ) {
    const l = g.layout;
    this.t = -delay;
    this.right = fromLeft;
    this.sx = fromLeft ? -16 : l.w + 16;
    this.state = over ? "over" : "in";
    if (over) {
      this.sy = feet;
      this.ex = fromLeft ? l.w + 20 : -20;
      this.ey = feet + rand(-14, 14);
      this.dur = Math.abs(this.ex - this.sx) / rand(55, 70);
    } else {
      this.sy = feet - rand(50, 80);
      this.ex = px;
      this.ey = feet;
      this.dur = rand(1.8, 2.6);
    }
  }

  get perched(): boolean {
    return this.state === "perch";
  }

  chatter(): void {
    if (this.perched) this.squawk = rand(0.35, 0.6);
  }

  /** Up and away (all together, a moment apart). */
  leave(delay: number): void {
    if (this.state === "out" || this.dead) return;
    if (this.t < 0) {
      this.dead = true; // never even arrived
      return;
    }
    const l = this.g.layout;
    const goRight = this.state === "over" ? this.right : this.fx > l.w / 2;
    this.state = "out";
    this.t = -delay;
    this.sx = this.fx;
    this.sy = this.fy;
    this.ex = goRight ? l.w + 24 : -24;
    this.ey = this.fy - rand(40, 80);
    this.dur = rand(1.4, 2);
    this.right = goRight;
  }

  update(dt: number): void {
    this.anim += dt;
    this.t += dt;
    if (this.squawk > 0) this.squawk -= dt;
    if (this.bob > 0) this.bob -= dt;
    if (this.t < 0) {
      this.fx = this.x = this.sx;
      this.fy = this.y = this.sy;
      return;
    }
    const k = Math.min(1, this.t / this.dur);
    switch (this.state) {
      case "over":
        this.fx = this.sx + (this.ex - this.sx) * k;
        this.fy = this.sy + (this.ey - this.sy) * k + Math.sin(this.t * 3 + this.wob) * 3;
        if (k >= 1) this.dead = true;
        break;
      case "in": {
        const e = easeOut(k);
        this.fx = this.sx + (this.ex - this.sx) * e;
        this.fy = this.sy + (this.ey - this.sy) * e;
        if (k >= 1) {
          this.state = "perch";
          this.t = 0;
        }
        break;
      }
      case "out":
        this.fx = this.sx + (this.ex - this.sx) * k * k;
        this.fy = this.sy + (this.ey - this.sy) * easeOut(k);
        if (k >= 1) this.dead = true;
        break;
      case "perch":
        this.fx = this.px;
        this.fy = this.feet;
        this.bobIn -= dt;
        if (this.bobIn <= 0) {
          this.bobIn = rand(1.5, 4);
          this.bob = 0.3;
        }
        break;
    }
    this.layer = this.perched ? 1 : 3;
    // (Perched: sort just in front of the fence run it sits on.)
    this.x = this.fx;
    this.y = this.perched ? this.sortY : this.fy;
  }

  private frame(): string {
    switch (this.state) {
      case "perch":
        if (this.squawk > 0) return PARROT.squawk;
        return this.bob > 0 ? PARROT.stand[1]! : PARROT.stand[0]!;
      case "in": {
        const k = this.t / this.dur;
        // Flaps in to land, facing you.
        if (k > 0.72) return PARROT.flap[Math.floor(this.anim / 0.06) % PARROT.flap.length]!;
        return PARROT.side[Math.floor(this.anim / 0.08) % PARROT.side.length]!;
      }
      case "out":
        if (this.t < 0.25) return PARROT.flap[Math.floor(this.anim / 0.06) % PARROT.flap.length]!;
        return PARROT.side[Math.floor(this.anim / 0.08) % PARROT.side.length]!;
      default:
        return PARROT.side[Math.floor(this.anim / 0.08) % PARROT.side.length]!;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.t < 0 && this.state !== "out") return;
    const key = this.frame();
    if (this.perched) {
      const x = Math.round(this.px) - 8;
      const top = Math.round(this.feet) - 16;
      // The chattering frame looks left; some of them look right instead.
      draw(ctx, key, x, top, { flipX: key === PARROT.squawk && this.right });
      this.cx = this.px;
      this.cy = this.feet - 8;
      return;
    }
    const side = key.startsWith("critter.parrot.side");
    draw(ctx, key, Math.round(this.fx) - 8, Math.round(this.fy) - 8, { flipX: side && this.right });
    this.cx = this.fx;
    this.cy = this.fy;
  }
}

class ParrotFlock {
  parrots: Parrot[] = [];
  private stay = rand(15, 35);
  private chatterIn = rand(0.8, 2);
  private leaving = false;
  toasted = false;

  constructor(readonly over: boolean) {}

  get done(): boolean {
    return this.parrots.every((p) => p.dead);
  }

  near(x: number, y: number): boolean {
    for (const p of this.parrots) if (!p.dead && Math.abs(p.cx - x) < 14 && Math.abs(p.cy - y) < 14) return true;
    return false;
  }

  scatter(): void {
    if (this.leaving) return;
    this.leaving = true;
    let i = 0;
    for (const p of this.parrots) p.leave(i++ * rand(0.05, 0.15));
    sfx("woosh", { volume: 0.25, pitch: 1.6 });
    this.squawks(3);
  }

  /** A burst of parrot chatter (a bird tweet, pitched up into a squawk, a few times over). */
  squawks(n: number): void {
    for (let i = 0; i < n; i++) setTimeout(() => sfx("tweet", { volume: 0.18, pitch: rand(1.3, 1.55) }), i * rand(150, 260));
  }

  tick(dt: number, ok: boolean): void {
    if (this.leaving || this.over) return;
    this.stay -= dt;
    if (this.stay <= 0 || !ok) {
      this.scatter();
      return;
    }
    this.chatterIn -= dt;
    if (this.chatterIn <= 0) {
      this.chatterIn = rand(1.2, 3.5);
      const perched = this.parrots.filter((p) => p.perched);
      const p = perched[Math.floor(Math.random() * perched.length)];
      if (p) {
        p.chatter();
        // Not every beak-open gets a sound (a perched flock would never stop otherwise).
        if (chance(0.35)) sfx("tweet", { volume: 0.12, pitch: rand(1.3, 1.55) });
      }
    }
  }
}

function spawnParrots(g: Game): ParrotFlock | null {
  if (!isReal(PARROT.stand[0]!)) return null; // real frames only
  const l = g.layout;
  const n = 3 + Math.floor(Math.random() * 4);
  const fromLeft = chance(0.5);
  if (chance(0.45)) {
    // Down onto the fence, one per gap between the posts.
    const row = railGaps(l, n, 16);
    if (row && row.gaps.length >= 2) {
      const f = new ParrotFlock(false);
      const feet = row.rail.feet - RAIL_TOP + 1;
      row.gaps.forEach(([x0, x1], i) => {
        f.parrots.push(addSafe(g, new Parrot(g, false, fromLeft, (x0 + x1) / 2 + rand(-1, 1), feet, row.rail.feet + 0.5, i * rand(0.15, 0.35)), "parrot"));
      });
      claimRail(row.rail, row.gaps, f);
      f.squawks(2);
      return f;
    }
  }
  // Streaming over in a loose, wavy line.
  const f = new ParrotFlock(true);
  const p = l.pasture;
  const line = p.y + rand(-10, p.h * 0.45);
  for (let i = 0; i < n; i++) f.parrots.push(addSafe(g, new Parrot(g, true, fromLeft, 0, line + rand(-10, 10), 0, i * rand(0.12, 0.3)), "parrot"));
  setTimeout(() => f.squawks(3), 600);
  return f;
}

// ---------- seagulls ----------

class Gull implements Entity {
  x: number;
  y: number;
  layer = 3;
  dead = false;
  private t = 0;
  private flapIn = rand(0.5, 2.5);
  private flap = -1;
  private readonly vx: number;
  private readonly y0: number;
  toasted = false;
  /** Carrying something: let go of it over x. */
  drop: { x: number; fn: (x: number, y: number) => void } | null = null;

  constructor(
    private g: Game,
    fromLeft: boolean,
    line: number,
    delay: number,
  ) {
    const l = g.layout;
    this.x = fromLeft ? -20 - delay * 30 : l.w + 20 + delay * 30;
    this.y0 = line;
    this.y = line;
    this.vx = (fromLeft ? 1 : -1) * rand(30, 38);
  }

  update(dt: number): void {
    this.t += dt;
    this.x += this.vx * dt;
    this.y = this.y0 + Math.sin(this.t * 0.7) * 5;
    if (this.flap >= 0) {
      this.flap += dt;
      if (this.flap > 0.5) this.flap = -1;
    } else {
      this.flapIn -= dt;
      if (this.flapIn <= 0) {
        this.flapIn = rand(2, 4.5);
        this.flap = 0;
      }
    }
    const d = this.drop;
    if (d && Math.abs(this.x - d.x) < 4) {
      this.drop = null;
      d.fn(this.x, this.y);
    }
    const l = this.g.layout;
    if ((this.vx > 0 && this.x > l.w + 40) || (this.vx < 0 && this.x < -40)) this.dead = true;
  }

  near(x: number, y: number): boolean {
    return Math.abs(this.x - x) < 16 && Math.abs(this.y - y) < 14;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // A full flap now and then (frames 1, 2, 3), otherwise gliding on spread wings.
    const key = this.flap >= 0 ? GULL.fly[1 + (Math.floor(this.flap / 0.125) % 3)]! : GULL.glide;
    draw(ctx, key, Math.round(this.x) - 16, Math.round(this.y) - 16, { flipX: this.vx > 0 });
  }
}

function spawnGulls(g: Game): Gull[] {
  if (!isReal(GULL.glide)) return [];
  const l = g.layout;
  const fromLeft = chance(0.5);
  const n = chance(0.35) ? 2 : 1;
  const line = l.pasture.y + rand(0, l.pasture.h * 0.4);
  const out: Gull[] = [];
  for (let i = 0; i < n; i++) out.push(addSafe(g, new Gull(g, fromLeft, line + i * rand(8, 14), i * rand(0.6, 1.2)), "gull"));
  // Now and then one of them cries on the way over (gulls are loud, but this is the farm, not the pier).
  if (chance(0.4)) setTimeout(() => sfx("seagull", { volume: 0.22, pitch: rand(0.96, 1.04) }), 1400);
  return out;
}

// ---------- a fish from the sky ----------

const FALL = 0.55;
const FISH_STAY = 60;

/** Dropped from on high: it tumbles down (spinning in quarter turns), slaps onto the grass, bounces twice, and lies there. */
class Fish implements Entity {
  x: number;
  y: number;
  layer = 3;
  dead = false;
  private t = 0;
  private landed = false;
  private lieT = 0;
  /** Snickers is on his way for it (if he's busy, it waits for him, asking every couple of seconds). */
  private claimed = false;
  private askIn = 0;
  private readonly grav: number;

  constructor(
    readonly key: string,
    private readonly sx: number,
    private readonly sy: number,
    private readonly to: Point,
    private readonly claim: () => boolean,
  ) {
    this.x = sx;
    this.y = sy;
    this.grav = (2 * Math.max(8, to.y - sy)) / (FALL * FALL);
  }

  update(dt: number): void {
    if (!this.landed) {
      this.t += dt;
      const k = Math.min(1, this.t / FALL);
      this.x = this.sx + (this.to.x - this.sx) * k;
      this.y = Math.min(this.to.y, this.sy + 0.5 * this.grav * this.t * this.t);
      if (k < 1) return;
      this.landed = true;
      this.layer = 1;
      this.x = this.to.x;
      this.y = this.to.y + 0.5;
      sfx("slap", { volume: 0.45 });
      return;
    }
    this.lieT += dt;
    if (!this.claimed && this.lieT < FISH_STAY) {
      this.askIn -= dt;
      if (this.askIn <= 0) {
        this.askIn = 2.5;
        this.claimed = this.claim();
      }
    }
    // Nobody wanted it (somehow): it fades away.
    if (this.lieT > FISH_STAY + 1.5) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = Math.round(this.x);
    if (!this.landed) {
      ctx.save();
      ctx.translate(cx, Math.round(this.y) - 8);
      ctx.rotate((Math.floor(this.t / 0.1) % 4) * (Math.PI / 2));
      draw(ctx, this.key, -8, -8);
      ctx.restore();
      return;
    }
    // Two little bounces (2 px, then 1), then it lies flat.
    const b = this.lieT;
    const hop = b < 0.16 ? Math.round(2 * Math.sin((Math.PI * b) / 0.16)) : b < 0.28 ? Math.round(Math.sin((Math.PI * (b - 0.16)) / 0.12)) : 0;
    const alpha = this.lieT > FISH_STAY ? Math.max(0, 1 - (this.lieT - FISH_STAY) / 1.5) : 1;
    draw(ctx, this.key, cx - 8, Math.round(this.to.y) - 15 - hop, { alpha });
  }
}

function pickFish(): FishKind {
  if (params.get("gullfish") === "salmon") return "salmon";
  const r = Math.random() * 12;
  return r < 5 ? "anchovy" : r < 10 ? "sardine" : "salmon";
}

/**
 * Maybe make this gull pass a fish run (darkness < 0.3, a day at most, 1 in 10): one gull, low over
 * the yard, that lets go of a fish right by Snickers' dish. `force` (?gullfish) skips the odds.
 */
function fishRun(g: Game, force: boolean, onFish: (f: Fish) => void): Gull[] | null {
  if (!isReal(GULL.glide)) return null;
  const dish = snickersDish();
  if (!dish) return null;
  const today = dayKey(g.env.now);
  if (!force && (g.env.darkness >= 0.3 || lsGet(FISH_DAY) === today || !chance(0.1))) return null;
  const kind = pickFish();
  const key = `item.fish.${kind}`;
  const gull = addSafe(g, new Gull(g, chance(0.5), dish.y - 34, 0), "gull");
  const to = { x: dish.x + 12, y: dish.y };
  gull.drop = {
    x: to.x,
    fn: (gx, gy) => {
      lsSet(FISH_DAY, today);
      // (It cries about it on the way off.)
      window.setTimeout(() => sfx("seagull", { volume: 0.3, pitch: rand(0.96, 1.04) }), 300);
      const fish: Fish = addSafe(
        g,
        // Snickers heard that. It's gone at his first nom.
        new Fish(key, gx, gy + 4, to, () =>
          snickersSnack(() => {
            fish.dead = true;
            if (kind === "salmon") toast(SALMON_LINE, { icon: key });
            else if (!lsGet(FISH_FIRST)) {
              lsSet(FISH_FIRST, String(Date.now()));
              toast(FREE_LUNCH, { icon: key });
            }
          }, to),
        ),
        "fish",
      );
      onFish(fish);
    },
  };
  return [gull];
}

// ---------- spawner ----------

export function initFlyers(g: Game): void {
  const forceParrots = params.has("parrots");
  const forceGulls = params.has("gulls");
  const forceFish = params.has("gullfish");
  let flocks: ParrotFlock[] = [];
  let gulls: Gull[] = [];
  let fish: Fish | null = null;
  const onFish = (f: Fish) => (fish = f);
  // A decent chance of a fly-by in the first few seconds (short visits deserve wildlife too).
  let parrotIn = forceParrots ? 2 : rand(6, 18);
  let parrotFirst = true;
  let gullIn = forceGulls || forceFish ? 3 : rand(8, 22);
  let gullFirst = true;
  let gullToasts = 0;

  onTick(g, "flyers", (dt) => {
    const ok = skyTime(g);
    if (flocks.some((f) => f.done)) flocks = flocks.filter((f) => !f.done);
    if (gulls.some((b) => b.dead)) gulls = gulls.filter((b) => !b.dead);
    for (const f of flocks) f.tick(dt, ok || forceParrots);

    parrotIn -= dt;
    if (parrotIn <= 0) {
      parrotIn = forceParrots ? 25 : rand(40, 100);
      const p = parrotFirst ? 0.25 : 0.3;
      parrotFirst = false;
      if (!flocks.length && ((ok && chance(p)) || forceParrots)) {
        const f = spawnParrots(g);
        if (f) flocks.push(f);
      }
    }

    gullIn -= dt;
    if (gullIn <= 0) {
      gullIn = forceGulls ? 20 : forceFish ? 25 : rand(50, 120);
      // Karl the Fog brings the gulls in.
      const p = gullFirst ? 0.2 : g.env.weather === "fog" ? 0.5 : 0.25;
      gullFirst = false;
      if (!gulls.length && ((ok && chance(p)) || forceGulls || forceFish)) gulls = fishRun(g, forceFish, onFish) ?? spawnGulls(g);
    }
  });

  onAnyTap(g, "flyers", (x, y) => {
    for (const f of flocks) {
      if (!f.near(x, y)) continue;
      if (!f.toasted) {
        f.toasted = true;
        toast("The wild parrots of Telegraph Hill dropped by! 🦜", { icon: PARROT.stand[0] });
      }
      f.scatter();
    }
    for (const b of gulls) {
      if (b.toasted || !b.near(x, y)) continue;
      b.toasted = true;
      sfx("seagull", { volume: 0.35, pitch: rand(0.96, 1.04) });
      // The pizza line is a rare one: the first gull you tap, then only now and then.
      if (gullToasts > 0 && !chance(0.25)) continue;
      gullToasts++;
      toast("A seagull from Ocean Beach. It's eyeing your pizza 🍕", { icon: GULL.icon });
    }
  });

  g.on("scare", (p: { x?: number; y?: number } | undefined) => {
    try {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      for (const f of flocks) if (f.near(p.x!, p.y!)) f.scatter();
    } catch (err) {
      report("flyers.scare", err);
    }
  });

  onLayoutChange(g, "flyers", () => {
    for (const f of flocks) for (const p of f.parrots) p.dead = true;
    for (const b of gulls) b.dead = true;
    if (fish) fish.dead = true;
    flocks = [];
    gulls = [];
    fish = null;
  });
}
