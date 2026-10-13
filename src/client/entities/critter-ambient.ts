// Ambient wildlife: butterflies on nice spring/summer days, a squirrel scampering along the fence
// rail, a forest bunny, and frogs when it rains. (Birds live in critter-birds.ts, bugs in
// critter-bugs.ts.) Everything is capped and spawns lazily, so it's cheap when nothing is around.
// Debug: ?bunny=1 ?squirrel=1

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw, isReal, REGIONS, SHEETS } from "../engine/sprites";
import { contains, fromFraction } from "../world/layout";
import { pastureSheep, store } from "../net";
import { sheepPosition } from "./sheep";
import { BUTTERFLY_COLORS } from "./critter-art";
import { critterReact, hangout } from "./critter-fox";
import { claimBottomLane, FENCE_HIDE, onLayoutChange, pastureSpot, RAIL_TOP, railStretch, type Rail } from "./critter-place";
import { addSafe, chance, drawShadow, Emote, inBox, onTick, params, rand } from "./critter-util";

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// ---------- the real Stardew critters sheet (320x640) ----------
// Rabbits, squirrels & frogs face right, butterflies are 4-frame flaps. Hand-drawn art in
// critter-sprites.ts covers the butterflies, bunny and frogs if the sheet is missing.
SHEETS.critters ??= "sprites/critters.png";
function cell(key: string, x: number, y: number, w = 16, h = 16): string {
  REGIONS[key] ??= { sheet: "critters", x, y, w, h };
  return key;
}
const BUTTERFLY_REAL: Record<string, [number, number]> = { blue: [128, 96], yellow: [256, 96], green: [128, 112], pink: [192, 112], orange: [256, 112] };
for (const [name, [x, y]] of Object.entries(BUTTERFLY_REAL)) for (let f = 0; f < 4; f++) cell(`critter.butterfly.${name}.${f}`, x + f * 16, y);
cell("critter.bunny.sit", 128, 160, 32, 32);
cell("critter.bunny.nibble", 256, 192, 32, 32);
const BUNNY_HOP_REAL = ["critter.bunny.hop.0", "critter.bunny.hop.1", "critter.bunny.hop.2", "critter.bunny.hop.3"] as const;
[160, 192, 224, 256].forEach((x, i) => cell(BUNNY_HOP_REAL[i]!, x, 160, 32, 32));
cell("critter.frog.sit", 0, 224);
cell("critter.frog.croak", 96, 224);
const FROG_JUMP_REAL = ["critter.frog.jump.0", "critter.frog.jump.1", "critter.frog.jump.2", "critter.frog.land"] as const;
[16, 32, 48, 64].forEach((x, i) => cell(FROG_JUMP_REAL[i]!, x, 224));
cell("critter.frog.jump", 32, 224); // also backs the hand-drawn key
// Squirrel (32x32 cells, row y=192): two nibbling-a-nut frames, sitting up, then a 5-frame scamper.
const SQUIRREL = {
  nibble: [cell("critter.squirrel.nibble.0", 0, 192, 32, 32), cell("critter.squirrel.nibble.1", 32, 192, 32, 32)],
  alert: cell("critter.squirrel.alert", 64, 192, 32, 32),
  run: [96, 128, 160, 192, 224].map((x, i) => cell(`critter.squirrel.run.${i}`, x, 192, 32, 32)),
};

function niceDay(g: Game): boolean {
  const e = g.env;
  return e.darkness < 0.35 && (e.weather === "sunny" || e.weather === "cloudy" || e.weather === "windy");
}

// ---------- butterflies ----------

const BUTTERFLY_NAMES = Object.keys(BUTTERFLY_COLORS);
const FLAP = [0, 1, 2, 3, 2, 1] as const;
const CENTER = { anchor: "center" } as const;

class Butterfly implements Entity {
  x: number;
  y: number;
  layer = 3;
  dead = false;
  private vx = 0;
  private vy = 0;
  private tx = 0;
  private ty = 0;
  private t = 0;
  private stateT = 0;
  private state: "fly" | "land" | "leave" = "fly";
  private landDur = 0;
  private perchSheep: string | null = null;
  private keys: [string, string, string, string];

  constructor(
    private g: Game,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    const c = pick(BUTTERFLY_NAMES);
    this.keys = [`critter.butterfly.${c}.0`, `critter.butterfly.${c}.1`, `critter.butterfly.${c}.2`, `critter.butterfly.${c}.3`];
    this.t = Math.random() * 10;
    this.newTarget();
  }

  leave(): void {
    if (this.state === "leave") return;
    this.state = "leave";
    this.perchSheep = null;
    const l = this.g.layout;
    this.tx = this.x < l.w / 2 ? -20 : l.w + 20;
    this.ty = this.y + rand(-40, 20);
  }

  private newTarget(): void {
    const l = this.g.layout;
    this.perchSheep = null;
    if (chance(0.4)) {
      const spot = this.landingSpot();
      if (spot) {
        this.tx = spot.x;
        this.ty = spot.y;
        this.landDur = rand(2.5, 6);
        this.stateT = -1; // flag: this target is a perch
        return;
      }
    }
    this.stateT = 0;
    const p = l.pasture;
    this.tx = p.x - 20 + Math.random() * (p.w + 40);
    this.ty = Math.max(10, p.y - 30 + Math.random() * (p.h + 30));
  }

  private landingSpot(): { x: number; y: number } | null {
    const g = this.g;
    const l = g.layout;
    const r = Math.random();
    // On a sheep's back (the cutest option).
    if (r < 0.3) {
      const flock = pastureSheep();
      if (flock.length) {
        const s = pick(flock);
        const pos = sheepPosition(s.id);
        if (pos) {
          this.perchSheep = s.id;
          return { x: pos.x, y: pos.y - 21 };
        }
      }
    }
    // On the flower tubs you two placed (the blooms are on top of the tub).
    if (r < 0.6) {
      const flowers = store.state?.decorations?.filter((d) => d.kind === "flowers") ?? [];
      if (flowers.length) {
        const d = pick(flowers);
        const p = fromFraction(l, d.fx, d.fy);
        return { x: p.x + rand(-4, 4), y: p.y - rand(19, 26) };
      }
    }
    // The corner's wildflowers.
    if (r < 0.75 && (g.env.season === "spring" || g.env.season === "summer")) {
      const c = hangout(l);
      return chance(0.5) ? { x: c.x - 1, y: c.y + 23 } : { x: c.x + 6, y: c.y + 23 };
    }
    // The top rail of the fence.
    const st = railStretch(l, 4, 10);
    if (st) return { x: (st.x0 + st.x1) / 2, y: st.rail.feet - RAIL_TOP - 2 };
    return null;
  }

  update(dt: number): void {
    this.t += dt;
    const l = this.g.layout;
    if (this.state === "land") {
      this.stateT += dt;
      if (this.perchSheep) {
        const pos = sheepPosition(this.perchSheep);
        if (!pos) {
          this.state = "fly";
          this.newTarget();
          return;
        }
        this.x = pos.x;
        this.y = pos.y - 21;
      }
      if (this.stateT > this.landDur) {
        this.state = "fly";
        this.newTarget();
      }
      return;
    }
    if (this.perchSheep) {
      const pos = sheepPosition(this.perchSheep);
      if (pos) {
        this.tx = pos.x;
        this.ty = pos.y - 21;
      }
    }
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    const speed = this.state === "leave" ? 26 : 15;
    if (d < 2) {
      if (this.state === "leave") {
        this.dead = true;
        return;
      }
      if (this.stateT < 0) {
        this.state = "land";
        this.stateT = 0;
        this.vx = this.vy = 0;
        return;
      }
      this.newTarget();
      return;
    }
    const k = Math.min(1, dt * 2.5);
    this.vx += ((dx / d) * speed - this.vx) * k;
    this.vy += ((dy / d) * speed - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt + Math.sin(this.t * 7) * 6 * dt;
    if (this.state === "leave" && (this.x < -30 || this.x > l.w + 30)) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    let key: string;
    if (isReal(this.keys[0])) {
      // Real sheet: open -> closed in 4 frames, ping-ponged; perched = wings up, the odd slow open.
      if (this.state === "land") key = this.keys[Math.floor(this.stateT / 0.7) % 4 === 3 ? 1 : 3];
      else key = this.keys[FLAP[Math.floor(this.t / 0.05) % FLAP.length]!];
    } else {
      const f = this.state === "land" ? (Math.floor(this.stateT / 0.7) % 3 === 2 ? 0 : 1) : Math.floor(this.t / 0.09) % 2;
      key = this.keys[f as 0 | 1];
    }
    draw(ctx, key, this.x, this.y, CENTER);
  }
}

// ---------- squirrel ----------

/** A squirrel scampers along a fence rail, stops for a nut, and scampers off. */
class Squirrel implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  private px: number;
  private readonly feet: number;
  private t = 0;
  private anim = 0;
  private state: "run" | "alert" | "nibble" | "look" | "exit" = "run";
  private dur = 0;
  private dir: 1 | -1;
  private stopAt: number;
  private stopped = false;
  private alpha = 0;
  private speed = 40;
  /** Up and over each fence post it passes (a post stands 7px above the rail). */
  private z = 0;
  private emote = new Emote();

  constructor(
    private rail: Rail,
    private x0: number,
    private x1: number,
  ) {
    this.dir = chance(0.5) ? 1 : -1;
    this.px = this.dir > 0 ? x0 : x1;
    this.feet = rail.feet - RAIL_TOP + 1;
    this.stopAt = x0 + (x1 - x0) * rand(0.35, 0.65);
  }

  update(dt: number): void {
    this.t += dt;
    this.anim += dt;
    this.emote.update(dt);
    const end = this.dir > 0 ? this.x1 : this.x0;
    if (this.state === "run" || this.state === "exit") {
      this.px += this.dir * this.speed * dt;
      const pastStop = this.dir > 0 ? this.px >= this.stopAt : this.px <= this.stopAt;
      if (this.state === "run" && !this.stopped && pastStop) {
        this.stopped = true;
        this.set("alert", rand(0.4, 0.8));
      }
      const atEnd = this.dir > 0 ? this.px >= end : this.px <= end;
      // Hops down off the far end of the rail.
      this.alpha = atEnd ? this.alpha - dt * 4 : Math.min(1, this.alpha + dt * 4);
      if (atEnd && this.alpha <= 0) this.dead = true;
    } else if (this.t > this.dur) {
      if (this.state === "alert") this.set("nibble", rand(2, 4.5));
      else if (this.state === "nibble") {
        if (chance(0.5)) {
          this.dir = this.dir > 0 ? -1 : 1; // changes its mind
          this.set("look", rand(0.4, 0.8));
        } else this.set("run", 0);
      } else this.set("run", 0);
    }
    let z = 0;
    for (const p of this.rail.posts) {
      const d = Math.abs(this.px - p);
      if (d < 8) z = Math.max(z, Math.cos((d / 8) * (Math.PI / 2)) * 7);
    }
    this.z = Math.round(z);
    this.x = this.px;
    this.y = this.rail.feet + 0.5;
  }

  private set(state: Squirrel["state"], dur: number): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0 || !isReal(SQUIRREL.alert)) return;
    let key: string;
    if (this.state === "run" || this.state === "exit") key = SQUIRREL.run[Math.floor(this.anim / (this.state === "exit" ? 0.045 : 0.065)) % SQUIRREL.run.length]!;
    else if (this.state === "nibble") key = SQUIRREL.nibble[Math.floor(this.t / 0.18) % 2]!;
    else key = SQUIRREL.alert;
    const x = Math.round(this.px);
    const feet = Math.round(this.feet) - this.z;
    draw(ctx, key, this.dir > 0 ? x - 14 : x - 17, feet - 31, { flipX: this.dir < 0, alpha: this.alpha });
    this.emote.draw(ctx, x, feet - 18);
  }

  hit(wx: number, wy: number): boolean {
    return this.state !== "exit" && this.alpha > 0.5 && inBox(wx, wy, this.px - 11, this.feet - this.z - 20, 22, 22);
  }

  onTap(): void {
    if (this.state === "exit") return;
    sfx("rustle", { volume: 0.45, pitch: 1.5 });
    this.emote.show("exclaim");
    // Dash for the nearest end of the rail.
    this.dir = this.px - this.x0 < this.x1 - this.px ? -1 : 1;
    this.speed = 75;
    this.state = "exit";
    this.t = 0;
  }
}

function spawnSquirrel(g: Game): Squirrel | null {
  if (!isReal(SQUIRREL.alert)) return null; // real frames only
  const l = g.layout;
  const len = Math.min(110, Math.max(50, l.fence.w * 0.4));
  const st = railStretch(l, len, 24, 22);
  if (!st) return null;
  return addSafe(g, new Squirrel(st.rail, st.x0, st.x1), "squirrel");
}

// ---------- bunny ----------

class Bunny implements Entity {
  x: number;
  y: number;
  layer = 1;
  dead = false;
  private t = 0;
  private hopT = 0;
  private state: "hop" | "sit" | "bolt" = "hop";
  private dir = 1;
  private sitDur = 0;
  private stops: number[];
  private alpha = 0;
  private hopFrom = 0;
  private hopTo = 0;
  private z = 0;
  private k = 0;
  private emote = new Emote();
  private warned = false;

  constructor(private g: Game) {
    const p = g.layout.pasture;
    this.x = p.x + 2;
    this.y = p.y + p.h - FENCE_HIDE;
    const c = g.layout.critterCorner;
    const maxX = Math.min(c.x - 16, p.x + p.w - 20);
    this.stops = [p.x + (maxX - p.x) * rand(0.25, 0.45), p.x + (maxX - p.x) * rand(0.6, 0.95)];
    this.startHop();
  }

  private startHop(): void {
    this.hopT = 0;
    this.hopFrom = this.x;
    this.hopTo = this.x + this.dir * (this.state === "bolt" ? 12 : 8);
  }

  update(dt: number): void {
    this.t += dt;
    this.emote.update(dt);
    const p = this.g.layout.pasture;
    this.y = p.y + p.h - FENCE_HIDE;
    const fading = this.dir < 0 && this.x < p.x + 10;
    this.alpha = fading ? Math.max(0, (this.x - p.x) / 10) : Math.min(1, this.alpha + dt * 2);
    if (this.dir < 0 && this.x <= p.x) {
      this.dead = true;
      return;
    }
    if (this.state === "sit") {
      if (this.t > this.sitDur) {
        this.state = "hop";
        if (!this.stops.length) this.dir = -1;
        this.startHop();
      }
      return;
    }
    const hopDur = this.state === "bolt" ? 0.22 : 0.36;
    this.hopT += dt;
    if (this.hopT < 0) return; // catching its breath between hops
    const k = Math.min(1, this.hopT / hopDur);
    this.k = k;
    this.x = this.hopFrom + (this.hopTo - this.hopFrom) * k;
    this.z = Math.sin(Math.PI * k) * (this.state === "bolt" ? 5 : 4);
    if (k >= 1) {
      this.z = 0;
      const next = this.stops[0];
      if (this.state === "hop" && this.dir > 0 && next !== undefined && this.x >= next) {
        this.stops.shift();
        this.state = "sit";
        this.t = 0;
        this.sitDur = rand(3, 6);
        if (chance(0.4)) this.emote.show(pick(["happy", "music", "dots"] as const), 0.5);
        return;
      }
      if (this.state === "hop" && this.dir > 0 && !this.stops.length) this.dir = -1;
      // Pause between hops.
      this.hopT = this.state === "bolt" ? 0 : -rand(0.1, 0.6);
      this.hopFrom = this.x;
      this.hopTo = this.x + this.dir * (this.state === "bolt" ? 12 : 8);
    }
    if (!this.warned && this.dir > 0) {
      const c = this.g.layout.critterCorner;
      if (c.x - this.x < 46) {
        this.warned = true;
        critterReact("exclaim", this.x);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    const sitting = this.state === "sit" || this.hopT < 0;
    const real = isReal("critter.bunny.sit");
    let key: string;
    if (real) {
      if (sitting) key = this.state === "sit" && Math.floor(this.t / 0.8) % 3 === 1 ? "critter.bunny.nibble" : "critter.bunny.sit";
      else key = BUNNY_HOP_REAL[Math.min(3, Math.floor(this.k * 4))]!;
    } else key = sitting ? "critter.bunny.sit" : "critter.bunny.hop";
    drawShadow(ctx, this.x, this.y, 11, this.alpha);
    draw(ctx, key, this.x, this.y - this.z, { anchor: "feet", flipX: this.dir < 0, alpha: this.alpha });
    this.emote.draw(ctx, Math.round(this.x), Math.round(this.y - (real ? 16 : 13)));
  }

  hit(wx: number, wy: number): boolean {
    return this.state !== "bolt" && inBox(wx, wy, this.x - 12, this.y - this.z - 18, 24, 21);
  }

  onTap(): void {
    sfx("bunny", { volume: 0.7, pitch: rand(0.95, 1.08) });
    sfx("rustle", { volume: 0.35 });
    this.emote.show("exclaim");
    this.state = "bolt";
    this.dir = -1;
    this.stops.length = 0;
    this.startHop();
  }
}

// ---------- frogs ----------

class Frog implements Entity {
  x: number;
  y: number;
  layer = 1;
  dead = false;
  private t = 0;
  private alpha = 0;
  private hopIn = rand(1, 3);
  private hopT = -1;
  private fx = 0;
  private fy = 0;
  private toX = 0;
  private toY = 0;
  private z = 0;
  private flip = chance(0.5);
  private life = rand(30, 60);
  private ribbit = 0;
  leaving = false;

  constructor(private g: Game) {
    const s = pastureSpot(g.layout, 10);
    this.x = s.x;
    this.y = s.y;
  }

  private hop(far = false): void {
    const l = this.g.layout;
    const a = Math.random() * Math.PI * 2;
    const d = far ? rand(16, 22) : rand(7, 13);
    const p = l.pasture;
    this.fx = this.x;
    this.fy = this.y;
    this.toX = Math.max(p.x + 4, Math.min(p.x + p.w - 4, this.x + Math.cos(a) * d));
    this.toY = Math.max(p.y + 4, Math.min(p.y + p.h - FENCE_HIDE, this.y + Math.sin(a) * d * 0.6));
    for (const b of l.blocked) {
      if (contains(b, this.toX, this.toY)) {
        this.toX = this.x - (this.toX - this.x);
        break;
      }
    }
    this.flip = this.toX < this.x;
    this.hopT = 0;
  }

  update(dt: number): void {
    this.t += dt;
    this.life -= dt;
    if (this.life < 0) this.leaving = true;
    this.alpha = this.leaving ? this.alpha - dt : Math.min(1, this.alpha + dt);
    if (this.leaving && this.alpha <= 0) {
      this.dead = true;
      return;
    }
    // Its throat puffs every 3.5s (see draw); now and then you hear it, softly, over the rain.
    const cycle = Math.floor(this.t / 3.5);
    if (cycle !== this.ribbit) {
      this.ribbit = cycle;
      if (this.hopT < 0 && !this.leaving && chance(0.12)) sfx("croak", { volume: 0.35, pitch: rand(0.9, 1.15) });
    }
    if (this.hopT >= 0) {
      this.hopT += dt;
      const k = Math.min(1, this.hopT / 0.4);
      this.x = this.fx + (this.toX - this.fx) * k;
      this.y = this.fy + (this.toY - this.fy) * k;
      this.z = Math.sin(Math.PI * k) * 5;
      if (k >= 1) {
        this.hopT = -1;
        this.z = 0;
        this.hopIn = rand(1.5, 4);
      }
    } else {
      this.hopIn -= dt;
      if (this.hopIn <= 0) this.hop();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    drawShadow(ctx, this.x, this.y, 8, this.alpha);
    let key: string;
    if (isReal("critter.frog.sit")) {
      if (this.hopT >= 0) {
        const k = this.hopT / 0.4;
        key = FROG_JUMP_REAL[k < 0.2 ? 0 : k < 0.55 ? 1 : k < 0.85 ? 2 : 3];
      } else key = this.t % 3.5 < 0.35 ? "critter.frog.croak" : "critter.frog.sit"; // ribbit
    } else key = this.hopT >= 0 ? "critter.frog.jump" : "critter.frog.sit";
    draw(ctx, key, this.x, this.y - this.z, { anchor: "feet", flipX: this.flip, alpha: Math.max(0, this.alpha) });
  }

  hit(wx: number, wy: number): boolean {
    return inBox(wx, wy, this.x - 10, this.y - this.z - 14, 20, 17);
  }

  onTap(): void {
    sfx("croak", { volume: 0.7 });
    this.hop(true);
  }
}

// ---------- spawner ----------

export function initAmbient(g: Game): void {
  const butterflies: Butterfly[] = [];
  const frogs: Frog[] = [];
  const forceBunny = params.has("bunny");
  const forceSquirrel = params.has("squirrel");
  // Short visits deserve wildlife: things show up quickly after the farm loads.
  let butterflyIn = rand(0.5, 3);
  let bunnyIn = forceBunny ? 3 : rand(15, 60);
  let squirrelIn = forceSquirrel ? 2 : rand(8, 30);
  let frogIn = 2;
  let bunny: Bunny | null = null;
  let squirrel: Squirrel | null = null;

  onLayoutChange(g, "squirrel", () => {
    // Its rail moved: it just hops down and goes home.
    if (squirrel) squirrel.dead = true;
    squirrel = null;
  });

  onTick(g, "ambient", (dt) => {
    const env = g.env;
    const season = env.season;

    // Butterflies: spring & summer, sunny-ish days.
    for (let i = butterflies.length - 1; i >= 0; i--) if (butterflies[i]!.dead) butterflies.splice(i, 1);
    const want = (season === "spring" || season === "summer") && niceDay(g) ? (season === "summer" ? 5 : 4) : 0;
    if (butterflies.length > want) {
      for (const b of butterflies) b.leave();
    } else if (butterflies.length < want) {
      butterflyIn -= dt;
      if (butterflyIn <= 0) {
        butterflyIn = rand(2, 6);
        const l = g.layout;
        const fromLeft = chance(0.5);
        butterflies.push(addSafe(g, new Butterfly(g, fromLeft ? -10 : l.w + 10, l.pasture.y + Math.random() * l.pasture.h * 0.7), "butterfly"));
      }
    }

    // A squirrel along the fence: busiest in fall (nuts!), rare in winter, never at night or in the rain.
    if (squirrel?.dead) squirrel = null;
    squirrelIn -= dt;
    if (squirrelIn <= 0) {
      squirrelIn = forceSquirrel ? 25 : season === "fall" ? rand(25, 60) : rand(55, 130);
      const dry = env.weather !== "rain" && env.weather !== "storm" && env.weather !== "snow";
      const ok = env.darkness < 0.3 && dry && (season !== "winter" || chance(0.3));
      if (!squirrel && (ok || forceSquirrel)) squirrel = spawnSquirrel(g);
    }

    // A forest bunny hops along the bottom of the pasture.
    if (bunny?.dead) bunny = null;
    bunnyIn -= dt;
    if (bunnyIn <= 0) {
      bunnyIn = forceBunny ? 30 : rand(60, 150);
      const ok = env.darkness < 0.6 && env.weather !== "rain" && env.weather !== "storm";
      if (!bunny && (ok || forceBunny)) {
        const b = new Bunny(g);
        // (It shares the bottom strip with the night walkers: one at a time.)
        if (claimBottomLane(b)) bunny = addSafe(g, b, "bunny");
      }
    }

    // Frogs come out in the rain (they sleep through the winter).
    for (let i = frogs.length - 1; i >= 0; i--) if (frogs[i]!.dead) frogs.splice(i, 1);
    const rainy = env.weather === "rain" || env.weather === "storm";
    const frogWant = rainy && season !== "winter" ? 3 : 0;
    let alive = 0;
    for (const f of frogs) if (!f.leaving) alive++;
    if (alive > frogWant) for (const f of frogs) f.leaving = true;
    else if (alive < frogWant) {
      frogIn -= dt;
      if (frogIn <= 0) {
        frogIn = rand(3, 9);
        frogs.push(addSafe(g, new Frog(g), "frog"));
      }
    }
  });
}
