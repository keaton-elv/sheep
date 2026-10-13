// Birds! Little flocks of sparrows, blue jays and cardinals (and crows) drop in to hop, peck and
// look around on the grass, or line up along the fence rails and post tops. They scatter together
// when you tap near them or a sheep wanders too close, and come back a little later. More in the
// morning, fewer in the rain, none at night. Crows never land if there's a scarecrow or rarecrow
// (Stardew rules): they just fly over, grumbling. Plus a woodpecker drumming on the side fence and,
// rarely, an owl on a fence post at night (its eyes catch the moonlight).
//
// Every bird is a real frame from critters.png (32x32 cells, facing left; the woodpecker is 16x16).
// The perched owl is hand-drawn in the sheet's owl browns (the sheet only has it flying).
// They also keep an eye on Snickers: he only ever prowls the yard, but a fence perch is in reach.
// Any module can startle birds with g.emit("scare", { x, y }).
// Debug: ?birds=1 (flocks drop in quickly), ?crow=1, ?woodpecker=1, ?owl=1

import { sfx } from "../audio";
import { DAWN_HOUR, type Entity, type Game } from "../engine/game";
import { draw, isReal, REGIONS, SHEETS } from "../engine/sprites";
import { pastureSheep } from "../net";
import type { Season } from "../../shared/calendar";
import { sheepPosition } from "./sheep";
import { snickersPosition } from "./snickers";
import { critterReact } from "./critter-fox";
import { claimRail, fenceRuns, freePosts, hasScarecrow, onLayoutChange, openGrass, pastureSpot, perchClear, POST_TOP, postRow, RAIL_TOP, railGaps, type Rail, type Side } from "./critter-place";
import { addSafe, chance, drawShadow, Emote, inBox, onAnyTap, onTick, params, rand, report } from "./critter-util";

// ---------- frames (critters.png, 320x640) ----------

SHEETS.critters ??= "sprites/critters.png";

function cell(key: string, x: number, y: number, w = 32, h = 32): string {
  REGIONS[key] ??= { sheet: "critters", x, y, w, h };
  return key;
}

interface Frames {
  stand: string[];
  lean: string;
  peck: string[];
  hop: string;
  fly: string[];
  /** Real frames face left; the hand-drawn crow faces right. */
  real: boolean;
  /** Ground shadow width. */
  shadow: number;
  /** How close a tap has to be to startle it. */
  reach: number;
}

/** A songbird: 5 standing/pecking frames in a row, then a hop frame + 3 flaps at the start of the next row. */
function songbird(name: string, sx: number, sy: number, fx: number, fy: number): Frames {
  const k = (s: string) => `critter.${name}.${s}`;
  return {
    stand: [cell(k("stand.0"), sx, sy), cell(k("stand.1"), sx + 32, sy)],
    lean: cell(k("lean"), sx + 64, sy),
    peck: [cell(k("peck.0"), sx + 96, sy), cell(k("peck.1"), sx + 128, sy)],
    hop: cell(k("hop"), fx, fy),
    fly: [cell(k("fly.0"), fx + 32, fy), cell(k("fly.1"), fx + 64, fy), cell(k("fly.2"), fx + 96, fy), cell(k("fly.1"), fx + 64, fy)],
    real: true,
    shadow: 7,
    reach: 24,
  };
}

const SONGBIRDS = {
  sparrow: songbird("sparrow", 160, 64, 0, 96),
  bluejay: songbird("bluejay", 160, 128, 0, 160),
  cardinal: songbird("cardinal", 160, 416, 0, 448),
};

const CROW: Frames = {
  stand: [cell("critter.crow.stand", 128, 32), cell("critter.crow.stand.1", 160, 32), cell("critter.crow.stand.2", 288, 32)],
  lean: cell("critter.crow.lean", 192, 32),
  peck: [cell("critter.crow.peck", 224, 32), cell("critter.crow.peck.1", 256, 32)],
  hop: "critter.crow.lean",
  fly: [0, 32, 64, 96, 128, 96, 64, 32].map((x) => cell(`critter.crow.fly.${x / 32}`, x, 64)),
  real: true,
  shadow: 12,
  reach: 28,
};
/** The hand-drawn crow (critter-sprites.ts), if the sheet ever fails to load. */
const CROW_DRAWN: Frames = {
  stand: ["critter.crow.stand"],
  lean: "critter.crow.peck",
  peck: ["critter.crow.peck"],
  hop: "critter.crow.stand",
  fly: ["critter.crow.fly.0", "critter.crow.fly.1"],
  real: false,
  shadow: 12,
  reach: 28,
};

const WOODPECKER = {
  cling: [cell("critter.woodpecker.0", 0, 256, 16, 16), cell("critter.woodpecker.1", 16, 256, 16, 16)],
  fly: [cell("critter.woodpecker.fly.0", 32, 256, 16, 16), cell("critter.woodpecker.fly.1", 48, 256, 16, 16), cell("critter.woodpecker.fly.2", 64, 256, 16, 16), "critter.woodpecker.fly.1"],
};
const OWL_FLY = [96, 128, 160, 192].map((x, i) => cell(`critter.owl.fly.${i}`, x, 256));

type Species = keyof typeof SONGBIRDS | "crow";

function framesFor(s: Species): Frames {
  if (s === "crow") return isReal(CROW.stand[0]!) ? CROW : CROW_DRAWN;
  return SONGBIRDS[s];
}

/** Draw a bird frame with its feet at (x, y). Real 32x32 cells keep their feet on row 30. */
function drawBird(ctx: CanvasRenderingContext2D, f: Frames, key: string, x: number, y: number, faceRight: boolean): void {
  if (f.real && isReal(key)) draw(ctx, key, Math.round(x) - 16, Math.round(y) - 31, { flipX: faceRight });
  else draw(ctx, key, Math.round(x), Math.round(y), { anchor: "feet", flipX: !faceRight });
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const HOP_DUR = 0.17;

// ---------- a bird ----------

type Mode = "ground" | "rail" | "post" | "flyover";
type BirdState = "in" | "idle" | "peck" | "hop" | "look" | "out";

class Bird implements Entity {
  x = 0;
  y = 0;
  layer = 3;
  dead = false;
  /** The spot it stands on (feet), or along its flight path. */
  gx: number;
  gy: number;
  /** Height above that spot. */
  z = 0;
  faceRight: boolean;
  state: BirdState = "in";
  private t: number;
  private anim = Math.random() * 3;
  private dur = 1;
  private next = rand(0.3, 1.5);
  // flight path: (sx, sy, sz) -> (ex, ey, ez)
  private sx: number;
  private sy: number;
  private sz: number;
  private ex: number;
  private ey: number;
  private ez = 0;
  // hopping
  private hops = 0;
  private hopFrom = 0;
  private hopTo = 0;
  private hopT = 0;
  private lookFrame = 0;
  private emoted = false;
  emote = new Emote();

  constructor(
    private g: Game,
    readonly frames: Frames,
    readonly mode: Mode,
    /** Where it lands (feet). */
    readonly lx: number,
    readonly ly: number,
    /** Sort line while landed (perched birds sort just in front of their fence run). */
    private sortY: number,
    /** How far it may hop along a rail (or the grass). */
    private minX: number,
    private maxX: number,
    fromLeft: boolean,
    delay: number,
  ) {
    const l = g.layout;
    this.t = -delay;
    this.faceRight = fromLeft;
    this.sx = fromLeft ? -26 : l.w + 26;
    this.sy = ly + rand(-25, 15);
    this.sz = rand(55, 85);
    this.gx = this.sx;
    this.gy = this.sy;
    this.z = this.sz;
    this.ex = lx;
    this.ey = ly;
    this.dur = rand(1.6, 2.4);
    if (mode === "flyover") {
      // Crosses the farm high up, spots the scarecrow, wants no part of it.
      this.ex = fromLeft ? l.w + 40 : -40;
      this.ey = this.sy + rand(-10, 10);
      this.sz = this.ez = rand(36, 46);
      this.dur = rand(4, 5);
    }
  }

  get landed(): boolean {
    return this.state !== "in" && this.state !== "out" && !this.dead;
  }

  /** The ground under it: its feet on the grass, or the foot of the fence it's perched on. */
  get groundY(): number {
    return this.mode === "ground" ? this.gy : this.sortY;
  }

  /** Take off and fly away from (ax, ay); `delay` staggers a flock. */
  flee(ax: number | null, delay = 0): void {
    if (this.state === "out" || this.dead) return;
    if (this.state === "in" && this.t < 0) {
      this.dead = true; // hadn't even arrived yet
      return;
    }
    const l = this.g.layout;
    let dir = ax === null || Math.abs(this.gx - ax) < 3 ? (this.gx < l.w / 2 ? -1 : 1) : Math.sign(this.gx - ax);
    if (this.mode === "flyover") dir = this.ex > this.gx ? 1 : -1;
    this.state = "out";
    this.t = -delay;
    this.sx = this.gx;
    this.sy = this.gy;
    this.sz = this.z;
    this.ex = dir > 0 ? l.w + 30 : -30;
    this.ey = this.gy - rand(10, 50);
    this.ez = this.z + rand(70, 110);
    this.dur = rand(1.3, 1.9);
    this.faceRight = dir > 0;
  }

  update(dt: number): void {
    this.anim += dt;
    this.emote.update(dt);
    this.t += dt;
    if (this.t < 0) return;
    switch (this.state) {
      case "in":
        this.updateIn();
        break;
      case "out":
        this.updateOut();
        break;
      case "hop":
        this.updateHop(dt);
        break;
      default:
        this.updateIdle(dt);
    }
    const flying = this.state === "in" || this.state === "out";
    this.layer = flying ? 3 : 1;
    this.x = this.gx;
    this.y = flying ? this.gy : this.sortY;
  }

  private updateIn(): void {
    const k = Math.min(1, this.t / this.dur);
    if (this.mode === "flyover") {
      this.gx = this.sx + (this.ex - this.sx) * k;
      this.gy = this.sy + (this.ey - this.sy) * k;
      this.z = this.sz + Math.sin(k * Math.PI) * 6;
      if (k > 0.4 && !this.emoted) {
        this.emoted = true;
        this.emote.show("angry");
        sfx("crow", { volume: 0.5 });
      }
      if (k >= 1) this.dead = true;
      return;
    }
    const e = easeOut(k);
    this.gx = this.sx + (this.ex - this.sx) * e;
    this.gy = this.sy + (this.ey - this.sy) * e;
    this.z = this.sz * (1 - e);
    if (Math.abs(this.ex - this.gx) > 1) this.faceRight = this.ex > this.gx;
    if (k >= 1) {
      this.gx = this.ex;
      this.gy = this.ey;
      this.z = 0;
      this.idle(rand(0.4, 1.2));
    }
  }

  private updateOut(): void {
    const k = Math.min(1, this.t / this.dur);
    this.gx = this.sx + (this.ex - this.sx) * k * k;
    this.gy = this.sy + (this.ey - this.sy) * k;
    this.z = this.sz + (this.ez - this.sz) * easeOut(k);
    const l = this.g.layout;
    if (k >= 1 || this.gx < -40 || this.gx > l.w + 40 || this.gy - this.z < -40) this.dead = true;
  }

  private idle(next: number): void {
    this.state = "idle";
    this.t = 0;
    this.next = next;
  }

  private updateIdle(_dt: number): void {
    if (this.state === "peck" || this.state === "look") {
      if (this.t > this.dur) this.idle(rand(0.3, 1.4));
      return;
    }
    if (this.t < this.next) return;
    const r = Math.random();
    const ground = this.mode === "ground";
    if (r < (ground ? 0.45 : 0.2)) {
      this.state = "peck"; // pecking at the grass (or preening, up on the fence)
      this.t = 0;
      this.dur = rand(0.45, ground ? 1.2 : 0.7);
    } else if (r < (ground ? 0.72 : 0.5) && this.mode !== "post") {
      if (chance(0.35)) this.faceRight = !this.faceRight;
      this.state = "hop";
      this.hops = 1 + Math.floor(Math.random() * 3);
      this.startHop();
    } else if (r < 0.9) {
      this.state = "look";
      this.t = 0;
      this.dur = rand(0.5, 1.4);
      if (chance(0.5)) this.faceRight = !this.faceRight;
      this.lookFrame = this.frames.stand.length > 1 && chance(0.6) ? 1 + Math.floor(Math.random() * (this.frames.stand.length - 1)) : 0;
    } else this.idle(rand(0.5, 2));
  }

  /** Can it stand at x (on its stretch of rail, or on open grass)? */
  private canStand(x: number): boolean {
    return x >= this.minX && x <= this.maxX && (this.mode !== "ground" || openGrass(this.g.layout, x, this.gy, 6));
  }

  private startHop(): void {
    const step = (this.frames.shadow > 10 ? rand(4, 7) : rand(3, 5)) * (this.faceRight ? 1 : -1);
    let to = this.gx + step;
    if (!this.canStand(to)) {
      this.faceRight = !this.faceRight;
      to = this.gx - step;
      if (!this.canStand(to)) {
        this.idle(rand(0.4, 1));
        return;
      }
    }
    this.hopFrom = this.gx;
    this.hopTo = to;
    this.hopT = 0;
    this.t = 0;
  }

  private updateHop(dt: number): void {
    this.hopT += dt;
    if (this.hopT < 0) return; // a breather between hops
    const k = Math.min(1, this.hopT / HOP_DUR);
    this.gx = this.hopFrom + (this.hopTo - this.hopFrom) * k;
    this.z = Math.sin(Math.PI * k) * (this.mode === "ground" ? 3 : 2);
    if (k < 1) return;
    this.z = 0;
    this.gx = this.hopTo;
    if (--this.hops <= 0) {
      this.idle(rand(0.3, 1.5));
      return;
    }
    const to = this.gx + (this.hopTo - this.hopFrom);
    if (!this.canStand(to)) {
      this.idle(rand(0.3, 1));
      return;
    }
    this.hopFrom = this.gx;
    this.hopTo = to;
    this.hopT = -rand(0.05, 0.25);
  }

  private frame(): string {
    const f = this.frames;
    switch (this.state) {
      case "in":
      case "out":
        if (this.t < 0) return f.stand[0]!; // still waiting its turn to take off
        return f.fly[Math.floor(this.anim / 0.07) % f.fly.length]!;
      case "peck":
        if (this.t < 0.08) return f.lean;
        return f.peck[Math.floor((this.t - 0.08) / 0.11) % f.peck.length]!;
      case "hop":
        return this.z > 0.6 ? f.hop : f.stand[0]!;
      case "look":
        return f.stand[this.lookFrame] ?? f.stand[0]!;
      default:
        return f.stand[0]!;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === "in" && this.t < 0) return; // not here yet
    const f = this.frames;
    if (this.mode === "ground" || this.mode === "flyover") {
      const fade = this.z < 0.5 ? 1 : Math.max(0, 1 - this.z / 50);
      if (fade > 0 && this.mode === "ground") drawShadow(ctx, this.gx, this.gy, f.shadow, fade);
    }
    const y = this.gy - this.z;
    drawBird(ctx, f, this.frame(), this.gx, y, this.faceRight);
    if (this.emote.active) this.emote.draw(ctx, Math.round(this.gx), Math.round(y) - (f === CROW ? 18 : 14));
  }
}

// ---------- a flock ----------

class Flock {
  birds: Bird[] = [];
  /** Set once it's been startled (it'll come back later). */
  startled = false;
  private stay: number;
  private leaving = false;
  /** Crows that just spotted a new scarecrow (they flap off a moment later). */
  private spooked = false;
  /** Songbirds chirp softly now and then. */
  private chirpIn = rand(3, 6);

  constructor(
    readonly species: Species,
    readonly mode: Mode,
  ) {
    this.stay = mode === "flyover" ? 99 : rand(25, 70);
  }

  get done(): boolean {
    return this.birds.every((b) => b.dead);
  }

  get landedCount(): number {
    let n = 0;
    for (const b of this.birds) if (b.landed) n++;
    return n;
  }

  /** Is any landed bird within its reach of (x, y)? */
  near(x: number, y: number, extra = 0): boolean {
    for (const b of this.birds) {
      if (!b.landed) continue;
      const r = b.frames.reach + extra;
      const by = b.gy - 6;
      if (Math.abs(b.gx - x) < r && Math.abs(by - y) < r * 0.8) return true;
    }
    return false;
  }

  /** Everyone up and away (startled: all at once; otherwise a calm, staggered departure). */
  scatter(ax: number | null, startled: boolean): void {
    if (this.leaving) return;
    this.leaving = true;
    this.startled = startled;
    let i = 0;
    for (const b of this.birds) {
      b.flee(ax, startled ? rand(0, 0.12) : i * rand(0.3, 0.7));
      i++;
    }
    if (startled) {
      if (this.species === "crow") sfx("crow", { volume: 0.7 });
      else sfx("woosh", { volume: 0.25, pitch: 1.7 });
    }
  }

  tick(dt: number, sheepSpots: { x: number; y: number }[] | null, cat: { x: number; y: number } | null): void {
    if (this.leaving || this.spooked || this.mode === "flyover") return;
    this.stay -= dt;
    if (this.stay <= 0) {
      this.scatter(null, false);
      return;
    }
    if (this.species === "crow" && hasScarecrow() && this.landedCount > 0) {
      // Somebody just put up a scarecrow. Nope.
      this.spooked = true;
      for (const b of this.birds) if (b.landed) b.emote.show("exclaim");
      setTimeout(() => this.scatter(null, true), 450);
      return;
    }
    if (this.species !== "crow") {
      this.chirpIn -= dt;
      if (this.chirpIn <= 0) {
        this.chirpIn = rand(15, 40);
        if (this.landedCount > 0 && chance(0.5)) sfx("chirp", { volume: 0.16, pitch: rand(1.35, 1.75) });
      }
    }
    if (sheepSpots) {
      for (const s of sheepSpots) {
        for (const b of this.birds) {
          if (!b.landed) continue;
          if (Math.abs(s.x - b.gx) < 16 && Math.abs(s.y - b.gy) < 11) {
            this.scatter(s.x, true);
            return;
          }
        }
      }
    }
    // A cat! (Snickers prowls the yard; a bird on the fence right by him doesn't stick around.)
    if (cat && this.nearCat(cat)) this.scatter(cat.x, true);
  }

  /** Is any landed bird within pouncing distance of the cat? */
  nearCat(cat: { x: number; y: number }): boolean {
    for (const b of this.birds) if (b.landed && catClose(cat, b.gx, b.groundY)) return true;
    return false;
  }
}

/** Snickers (feet at `cat`) is close enough to a bird standing above the ground line `groundY`. */
function catClose(cat: { x: number; y: number }, x: number, groundY: number): boolean {
  return Math.abs(cat.x - x) < 24 && Math.abs(cat.y - groundY) < 16;
}

// ---------- where a flock lands ----------

function spawnFlock(g: Game, species: Species): Flock | null {
  const l = g.layout;
  const frames = framesFor(species);
  const crow = species === "crow";
  const fromLeft = chance(0.5);
  if (crow && hasScarecrow()) {
    const f = new Flock("crow", "flyover");
    const s = pastureSpot(l, 14);
    const b = new Bird(g, frames, "flyover", s.x, s.y, s.y, 0, 0, fromLeft, 0);
    f.birds.push(addSafe(g, b, "crow"));
    return f;
  }
  const n = crow ? (chance(0.35) ? 2 : 1) + (chance(0.15) ? 1 : 0) : 2 + Math.floor(Math.random() * 3);
  const r = Math.random();
  const mode: Mode = crow ? (r < 0.75 ? "ground" : "post") : r < 0.5 ? "ground" : r < 0.82 ? "rail" : "post";
  const f = new Flock(species, mode);
  const add = (lx: number, ly: number, sortY: number, minX: number, maxX: number, i: number) => {
    const b = new Bird(g, frames, mode, lx, ly, sortY, minX, maxX, fromLeft, i * rand(0.15, 0.4));
    f.birds.push(addSafe(g, b, species));
  };
  const h = crow ? 20 : 15;
  const cat = snickersPosition();
  const byCat = (rail: Rail, xs: number[]) => !!cat && xs.some((x) => catClose(cat, x, rail.feet + 0.5));
  if (mode === "rail") {
    // A row along the top rail, one bird in each gap between the posts.
    const row = railGaps(l, n, h);
    if (!row || byCat(row.rail, row.gaps.flat())) return spawnGround(g, f, n, add);
    const feet = row.rail.feet - RAIL_TOP + 1;
    row.gaps.forEach(([x0, x1], i) => add((x0 + x1) / 2 + rand(-1, 1), feet, row.rail.feet + 0.5, x0, x1, i));
    claimRail(row.rail, row.gaps, f);
    return f;
  }
  if (mode === "post") {
    const row = postRow(l, n, h);
    if (!row || byCat(row.rail, row.xs)) return spawnGround(g, f, n, add);
    const feet = row.rail.feet - POST_TOP + 1;
    row.xs.forEach((x, i) => add(x, feet, row.rail.feet + 0.5, x, x, i));
    claimRail(row.rail, row.xs.map((x) => [x - 6, x + 6] as const), f);
    return f;
  }
  return spawnGround(g, f, n, add);
}

function spawnGround(g: Game, f: Flock, n: number, add: (lx: number, ly: number, sortY: number, minX: number, maxX: number, i: number) => void): Flock {
  const l = g.layout;
  const c = pastureSpot(l, 18);
  for (let i = 0; i < n; i++) {
    let x = c.x;
    let y = c.y;
    for (let k = 0; k < 8; k++) {
      const tx = c.x + rand(-16, 16);
      const ty = c.y + rand(-7, 7);
      if (openGrass(l, tx, ty, 8)) {
        x = tx;
        y = ty;
        break;
      }
    }
    add(x, y, y, l.pasture.x + 8, l.pasture.x + l.pasture.w - 8, i);
  }
  return f;
}

// ---------- the woodpecker ----------

class Woodpecker implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  state: "in" | "cling" | "out" = "in";
  private t = 0;
  private anim = 0;
  private stay = rand(20, 45);
  private drumIn = rand(1.5, 4);
  /** Each drumming burst is a few quick knocks. */
  private drum = 0;
  private knocks = 0;
  private hitch = 0;
  /** Sprite top-left while clinging. */
  private cx: number;
  private cy: number;
  /** Sprite top-left in flight. */
  private px: number;
  private py: number;
  private sx: number;
  private sy: number;
  private ex = 0;
  private ey = 0;
  private dur = rand(1.4, 1.9);
  /** Native frames cling to a trunk on the bird's right: flip on the left fence. */
  private flipCling: boolean;

  constructor(
    private g: Game,
    side: Side,
    top: number,
  ) {
    this.flipCling = side.edge === "left";
    this.cx = side.edge === "left" ? side.x + 4 : side.x - 4 - 16;
    this.cy = top;
    this.sx = side.edge === "left" ? -22 : g.layout.w + 6;
    this.sy = top - rand(40, 70);
    this.px = this.sx;
    this.py = this.sy;
  }

  get perched(): boolean {
    return this.state === "cling";
  }

  near(x: number, y: number): boolean {
    return this.perched && Math.abs(x - (this.cx + 8)) < 22 && Math.abs(y - (this.cy + 8)) < 22;
  }

  leave(): void {
    if (this.state === "out") return;
    this.state = "out";
    this.t = 0;
    this.sx = this.cx;
    this.sy = this.cy;
    this.ex = this.flipCling ? -24 : this.g.layout.w + 8;
    this.ey = this.cy - rand(30, 60);
    this.dur = rand(1, 1.4);
  }

  update(dt: number): void {
    this.t += dt;
    this.anim += dt;
    if (this.state === "in") {
      const k = Math.min(1, this.t / this.dur);
      const e = easeOut(k);
      this.px = this.sx + (this.cx - this.sx) * e;
      this.py = this.sy + (this.cy - this.sy) * e;
      if (k >= 1) {
        this.state = "cling";
        this.t = 0;
      }
    } else if (this.state === "out") {
      const k = Math.min(1, this.t / this.dur);
      this.px = this.sx + (this.ex - this.sx) * k * k;
      this.py = this.sy + (this.ey - this.sy) * easeOut(k);
      if (k >= 1) this.dead = true;
    } else {
      this.px = this.cx;
      this.py = this.cy;
      if (this.t > this.stay) this.leave();
      if (this.hitch > 0) this.hitch -= dt;
      if (this.drum > 0) {
        // Rat-a-tat-tat: each forward frame is a knock.
        this.drum -= dt;
        const n = Math.floor(this.anim / 0.065);
        if (n % 2 === 1 && n !== this.knocks) {
          this.knocks = n;
          sfx("thud", { volume: 0.1, pitch: rand(2.3, 2.6) });
        }
      } else {
        this.drumIn -= dt;
        if (this.drumIn <= 0) {
          this.drumIn = rand(5, 12);
          if (chance(0.3)) {
            // Hitch a little way up the log instead.
            this.cy = Math.max(this.cy - 3, this.g.layout.fence.y + 4);
            this.hitch = 0.15;
          } else {
            this.drum = rand(0.4, 0.8);
            this.anim = 0;
            this.knocks = 0;
          }
        }
      }
    }
    this.x = this.px + 8;
    this.y = this.state === "cling" ? this.cy + 18 : this.py + 16;
    this.layer = this.state === "cling" ? 1 : 3;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === "cling") {
      const key = this.drum > 0 ? WOODPECKER.cling[Math.floor(this.anim / 0.065) % 2]! : this.hitch > 0 ? WOODPECKER.cling[1]! : WOODPECKER.cling[0]!;
      draw(ctx, key, Math.round(this.px), Math.round(this.py), { flipX: this.flipCling });
    } else {
      const movingRight = (this.state === "in" ? this.cx - this.sx : this.ex - this.sx) > 0;
      const key = WOODPECKER.fly[Math.floor(this.anim / 0.08) % WOODPECKER.fly.length]!;
      draw(ctx, key, Math.round(this.px), Math.round(this.py), { flipX: movingRight });
    }
  }
}

function spawnWoodpecker(g: Game): Woodpecker | null {
  const l = g.layout;
  const sides = fenceRuns(l).sides.filter((s) => s.y1 - s.y0 > 50);
  for (let tries = 0; tries < 6; tries++) {
    const side = sides[Math.floor(Math.random() * sides.length)];
    if (!side) return null;
    const top = Math.round(side.y0 + 12 + Math.random() * (side.y1 - side.y0 - 48));
    const cx = side.edge === "left" ? side.x + 12 : side.x - 12;
    if (!perchClear(l, cx, top + 16, 18, 18)) continue;
    const cat = snickersPosition();
    if (cat && Math.abs(cat.x - cx) < 30 && Math.abs(cat.y - 10 - (top + 8)) < 30) continue;
    return addSafe(g, new Woodpecker(g, side, top), "woodpecker");
  }
  return null;
}

// ---------- the owl ----------

class Owl implements Entity {
  x = 0;
  y = 0;
  layer = 3;
  dead = false;
  state: "in" | "perch" | "out" = "in";
  private t = 0;
  private anim = 0;
  private stay = rand(100, 240);
  private blinkIn = rand(2, 5);
  private blink = 0;
  private blinks = 0;
  private look = 0;
  private lookT = 0;
  private hootIn = rand(1.2, 3);
  private hoot = 0;
  private fx: number;
  private fy: number;
  private sx: number;
  private sy: number;
  private ex = 0;
  private ey = 0;
  private dur = rand(2, 2.6);
  /** Feet on the post top. */
  readonly feet: number;

  constructor(
    private g: Game,
    readonly px: number,
    readonly rail: Rail,
  ) {
    this.feet = rail.feet - POST_TOP + 2;
    this.sx = px + rand(-50, 50);
    this.sy = -30;
    this.fx = this.sx;
    this.fy = this.sy;
  }

  get perched(): boolean {
    return this.state === "perch";
  }

  get eyesOpen(): boolean {
    return this.perched && this.blink <= 0;
  }

  /** Which way the pupils point: -1 left, 0 ahead, 1 right. */
  get gaze(): number {
    return this.lookT > 0 ? this.look : 0;
  }

  /** The perch sprite's top edge (the hoot frame is a row taller). */
  get top(): number {
    return this.feet - (this.hoot > 0 ? 16 : 15);
  }

  leave(): void {
    if (this.state !== "perch") return;
    this.state = "out";
    this.t = 0;
    const l = this.g.layout;
    // Its flying frames look down from above, so it swoops away down the screen.
    this.sx = this.px;
    this.sy = this.feet - 8;
    this.ex = this.px < l.w / 2 ? -40 : l.w + 40;
    this.ey = this.feet + rand(40, 90);
    this.dur = rand(1.6, 2.2);
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.anim += dt;
    if (this.state === "in") {
      const k = Math.min(1, this.t / this.dur);
      const e = easeOut(k);
      this.fx = this.sx + (this.px - this.sx) * e;
      this.fy = this.sy + (this.feet - 8 - this.sy) * e;
      if (k >= 1) {
        this.state = "perch";
        this.t = 0;
        this.hootIn = rand(1, 2.5);
      }
    } else if (this.state === "out") {
      const k = Math.min(1, this.t / this.dur);
      this.fx = this.sx + (this.ex - this.sx) * k * k;
      this.fy = this.sy + (this.ey - this.sy) * k;
      if (k >= 1) this.dead = true;
    } else {
      if (this.t > this.stay) this.leave();
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blink = 0.16;
        this.blinkIn = this.blinks > 0 ? 0.28 : rand(2.5, 6);
        if (this.blinks > 0) this.blinks--;
      }
      if (this.blink > 0) this.blink -= dt;
      if (this.lookT > 0) this.lookT -= dt;
      else if (chance(dt / 7)) {
        this.look = chance(0.5) ? -1 : 1;
        this.lookT = rand(1, 2.2);
      }
      if (this.hoot > 0) this.hoot -= dt;
      this.hootIn -= dt;
      if (this.hootIn <= 0) {
        this.hootIn = rand(18, 45);
        if (chance(0.7)) this.hootNow(0.55);
      }
      // A little moonlight on it, so it reads against the dark.
      if (g.env.darkness > 0.3) g.addLight({ x: this.px, y: this.feet - 8, radius: 13, color: "rgba(170,186,255,0.32)" });
    }
    this.x = this.perched ? this.px : this.fx;
    this.y = this.perched ? this.rail.feet + 0.5 : this.fy;
    this.layer = this.perched ? 1 : 3;
  }

  private hootNow(volume: number): void {
    this.hoot = 0.7;
    sfx("owl", { volume });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state !== "perch") {
      const key = OWL_FLY[Math.floor(this.anim / 0.12) % OWL_FLY.length]!;
      if (isReal(key)) draw(ctx, key, Math.round(this.fx) - 16, Math.round(this.fy) - 16);
      else draw(ctx, "critter.owl.perch", this.fx, this.fy, { anchor: "center" });
      return;
    }
    const key = this.blink > 0 ? "critter.owl.blink" : this.hoot > 0 ? "critter.owl.hoot" : this.gaze < 0 ? "critter.owl.left" : this.gaze > 0 ? "critter.owl.right" : "critter.owl.perch";
    draw(ctx, key, Math.round(this.px) - 6, this.top);
  }

  hit(wx: number, wy: number): boolean {
    return this.perched && inBox(wx, wy, this.px - 10, this.feet - 20, 20, 22);
  }

  onTap(_g: Game, wx: number): void {
    if (!this.perched) return;
    // Blink-blink... then a slow look your way.
    this.blink = 0.16;
    this.blinkIn = 0.3;
    this.blinks = 1;
    this.look = wx < this.px ? -1 : 1;
    this.lookT = 2.2;
    if (chance(0.4)) setTimeout(() => this.perched && this.hootNow(0.45), 700);
  }
}

/** The owl's eyes catch the moonlight: redraw them above the night overlay. */
function drawOwlEyes(ctx: CanvasRenderingContext2D, owl: Owl | null, g: Game): void {
  if (!owl || !owl.eyesOpen || g.env.darkness < 0.25) return;
  const left = Math.round(owl.px) - 6;
  const top = owl.top + 5;
  const gaze = owl.gaze;
  ctx.globalAlpha = Math.min(0.9, g.env.darkness);
  for (const ex of [3, 8]) {
    const pupil = gaze < 0 ? ex : gaze > 0 ? ex + 1 : ex === 3 ? 4 : 8;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        if (dy === 1 && ex + dx === pupil) continue;
        ctx.fillStyle = dy === 0 ? "#ffe066" : "#ffc21f";
        ctx.fillRect(left + ex + dx, top + dy, 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function spawnOwl(g: Game): Owl | null {
  const posts = freePosts(g.layout, 18);
  // Prefer the top fence (it looks out over the pasture).
  const top = posts.filter((p) => p.rail.top);
  const list = top.length ? top : posts;
  const p = list[Math.floor(Math.random() * list.length)];
  if (!p) return null;
  return addSafe(g, new Owl(g, p.x, p.rail), "owl");
}

// ---------- the spawner ----------

const WEIGHTS: Record<Season, [Species, number][]> = {
  spring: [
    ["sparrow", 4],
    ["bluejay", 3],
    ["cardinal", 1],
    ["crow", 1.2],
  ],
  summer: [
    ["sparrow", 4],
    ["bluejay", 2],
    ["cardinal", 1],
    ["crow", 1.2],
  ],
  fall: [
    ["sparrow", 3],
    ["bluejay", 2],
    ["cardinal", 1.5],
    ["crow", 2],
  ],
  // Cardinals are the winter birds (bright red against the snow).
  winter: [
    ["cardinal", 4],
    ["bluejay", 2],
    ["sparrow", 1.5],
    ["crow", 1],
  ],
};

function pickSpecies(season: Season, allowCrow: boolean): Species {
  const list = WEIGHTS[season].filter(([s]) => allowCrow || s !== "crow");
  let total = 0;
  for (const [, w] of list) total += w;
  let r = Math.random() * total;
  for (const [s, w] of list) {
    r -= w;
    if (r <= 0) return s;
  }
  return list[0]![0];
}

export function initBirds(g: Game): void {
  const fastBirds = params.has("birds");
  const forceCrow = params.has("crow");
  const forceWood = params.has("woodpecker");
  const forceOwl = params.has("owl");
  let flocks: Flock[] = [];
  const returns: { species: Species; in: number }[] = [];
  // The first flock drops in within a few seconds (even in light rain or snow): short visits deserve birds.
  let nextIn = fastBirds || forceCrow ? 1.5 : rand(1.5, 6);
  let firstFlock = true;
  let sheepIn = 0;
  let woodpecker: Woodpecker | null = null;
  let woodIn = forceWood ? 2 : rand(25, 60);
  let owl: Owl | null = null;
  // At night, a good chance the owl is the first one to say hello.
  let owlIn = forceOwl ? 2 : rand(6, 16);
  let owlFirst = true;
  let firstCrow = forceCrow;

  const songbirdsReal = () => isReal(SONGBIRDS.sparrow.stand[0]!);

  const spawn = (species: Species): void => {
    const f = spawnFlock(g, species);
    if (!f) return;
    flocks.push(f);
    if (species === "crow" && f.mode !== "flyover") setTimeout(() => sfx("crow", { volume: 0.6 }), 1800);
    // The fox & hedgehog notice crows landing.
    if (species === "crow" && f.mode === "ground") setTimeout(() => critterReact("exclaim", f.birds[0]?.lx ?? null), 2600);
  };

  onTick(g, "birds", (dt) => {
    const env = g.env;
    const hour = env.hour;
    const night = env.darkness > 0.4;
    const storm = env.weather === "storm";
    const wet = env.weather === "rain" || env.weather === "snow";

    // Tidy up.
    if (flocks.some((f) => f.done)) {
      // A startled flock comes back a little later (not in the rain, though: they've gone to shelter).
      for (const f of flocks) if (f.done && f.startled && !night && !wet && !storm) returns.push({ species: f.species, in: rand(15, 35) });
      flocks = flocks.filter((f) => !f.done);
    }
    if (woodpecker?.dead) woodpecker = null;
    if (owl?.dead) owl = null;

    // Bedtime / bad weather: everyone heads home.
    if (night || storm) for (const f of flocks) f.scatter(null, false);
    if ((night || wet || storm) && woodpecker?.perched) woodpecker.leave();

    // Sheep wandering too close (checked a few times a second).
    sheepIn -= dt;
    let sheepSpots: { x: number; y: number }[] | null = null;
    if (sheepIn <= 0) {
      sheepIn = 0.25;
      sheepSpots = [];
      for (const s of pastureSheep()) {
        const p = sheepPosition(s.id);
        if (p) sheepSpots.push(p);
      }
    }
    const cat = sheepSpots ? snickersPosition() : null;
    for (const f of flocks) f.tick(dt, sheepSpots, cat);
    if (cat && woodpecker?.near(cat.x, cat.y - 10)) woodpecker.leave();

    // New arrivals: lots in the morning, fewer later, few in the rain, none at night.
    if (!night && !storm) {
      const morning = hour >= DAWN_HOUR && hour < 11;
      const max = wet ? 1 : morning ? 4 : 3;
      const live = flocks.filter((f) => f.mode !== "flyover").length;
      for (let i = returns.length - 1; i >= 0; i--) {
        const r = returns[i]!;
        r.in -= dt;
        if (r.in <= 0) {
          returns.splice(i, 1);
          if (live < max && (r.species === "crow" || songbirdsReal())) spawn(r.species);
        }
      }
      nextIn -= dt;
      if (nextIn <= 0) {
        const base = morning ? rand(4, 8) : hour < 16 ? rand(8, 18) : rand(13, 25);
        nextIn = fastBirds ? rand(4, 8) : base * (wet && !firstFlock ? 3 : 1);
        firstFlock = false;
        if (live < max) {
          const crowsOut = flocks.some((f) => f.species === "crow");
          const species: Species = firstCrow ? "crow" : pickSpecies(env.season, !crowsOut);
          firstCrow = false;
          // Only the crow has hand-drawn frames, for the (unlikely) day the sheet doesn't load.
          if ((species !== "crow" && songbirdsReal()) || (species === "crow" && !crowsOut)) spawn(species);
        }
      }
    } else if (forceCrow && !flocks.length) {
      nextIn -= dt;
      if (nextIn <= 0) {
        nextIn = 20;
        spawn("crow");
      }
    }

    // The woodpecker: now and then on dry days.
    woodIn -= dt;
    if (woodIn <= 0) {
      woodIn = forceWood ? 25 : rand(30, 75);
      const ok = (!night && !wet && !storm && chance(0.35)) || forceWood;
      if (!woodpecker && ok && isReal(WOODPECKER.cling[0]!)) woodpecker = spawnWoodpecker(g);
    }

    // The owl: rare, deep in the night, on a dry night.
    if (owl?.perched && env.darkness < 0.5 && !forceOwl) owl.leave(); // dawn: off to bed
    owlIn -= dt;
    if (owlIn <= 0) {
      owlIn = forceOwl ? 30 : rand(60, 120);
      const deep = env.darkness > 0.75 && !wet && !storm;
      const p = owlFirst ? 0.3 : 0.1;
      owlFirst = false;
      if (!owl && ((deep && chance(p)) || forceOwl)) owl = spawnOwl(g);
    }
  });

  // Tap near a flock (or the woodpecker) and they're off.
  const startle = (x: number, y: number, extra: number): void => {
    for (const f of flocks) if (f.near(x, y, extra)) f.scatter(x, true);
    if (woodpecker?.near(x, y)) {
      woodpecker.leave();
      sfx("woosh", { volume: 0.25, pitch: 1.8 });
    }
  };
  onAnyTap(g, "birds", (x, y) => startle(x, y, 0));
  g.on("scare", (p: { x?: number; y?: number; r?: number } | undefined) => {
    try {
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) startle(p.x!, p.y!, Math.max(0, (p.r ?? 8) - 8));
    } catch (err) {
      report("birds.scare", err);
    }
  });

  // The fence moved (rotation, a new window size): everyone just quietly leaves.
  onLayoutChange(g, "birds", () => {
    for (const f of flocks) for (const b of f.birds) b.dead = true;
    flocks = [];
    if (woodpecker) woodpecker.dead = true;
    if (owl) owl.dead = true;
    woodpecker = null;
    owl = null;
  });

  g.addPass({
    order: 113, // above the night overlay: the owl's eyes glint in the dark
    draw: (ctx, game) => {
      if (!owl) return;
      ctx.save();
      try {
        drawOwlEyes(ctx, owl, game);
      } catch (err) {
        report("owl.eyes", err);
      } finally {
        ctx.restore();
      }
    },
  });
}
