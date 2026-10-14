// Visitors to the pond (world/world-pond.ts), once you two put one in. Mallards fly in and paddle
// about (now and then a mama waddles over with her ducklings in a line), quack every so often, dabble,
// tuck their heads in at night and stay away in winter, when it's frozen. Tap one: a quack and a
// little splash. On warm days a green turtle climbs out to sun itself on the stones, and slides back
// in when tapped. (The rain frogs that like the pond live in critter-ambient.ts.)
// Real frames from duck.png and turtle.png (cut from the raw sheets); the ducklings and the flapping
// wings are hand-drawn (there are no such frames). No real pond art, no visitors.
// Debug: ?pond (a pretend pond) plus ?ducks (a pair, now) ?ducklings (a family, now) ?turtle (basking soon)

import { preloadSfx, sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { pixelArt } from "../engine/pixelart";
import { REGIONS, SHEETS, sheet } from "../engine/sprites";
import { store } from "../net";
import { mainPond, pondArt, ripple, type PondArt, type PondSpot } from "../world/world-pond";
import { addSafe, chance, dotPuff, drawShadow, inBox, onTick, params, rand, reducedMotion } from "./critter-util";

// ---------- art ----------

SHEETS.duck ??= "sprites/duck.png";
SHEETS.turtle ??= "sprites/turtle.png";

function cell(key: string, sh: string, x: number, y: number, w: number, h: number): string {
  REGIONS[key] ??= { sheet: sh, x, y, w, h };
  return key;
}
const row4 = (name: string, y: number) => [0, 1, 2, 3].map((i) => cell(`critter.duck.${name}.${i}`, "duck", i * 16, y, 16, 16));
const pair = (name: string, x: number, y: number) => [0, 1].map((i) => cell(`critter.duck.${name}.${i}`, "duck", x + i * 16, y, 16, 16));
// duck.png rows: walk, swim, head turned / sitting, resting / tucked in, dabbling. 16x16, feet on row 15.
const DUCK = {
  walk: row4("walk", 0),
  swim: row4("swim", 16),
  look: pair("look", 0, 32),
  rest: pair("rest", 0, 48),
  tuck: pair("tuck", 32, 48),
  dabble: pair("dabble", 0, 64),
};
/** Which way each pose faces in the sheet (true = right). */
const FACES_RIGHT = { walk: true, swim: true, look: false, rest: true, tuck: false, dabble: false } as const;
type Pose = keyof typeof DUCK;
// turtle.png (32x32, feet on row 28, shadow baked in): walking, head up, lying in the sun. All face right.
const TURTLE = {
  walk: [0, 1, 2, 3].map((i) => cell(`critter.turtle.walk.${i}`, "turtle", i * 32, 0, 32, 32)),
  look: [2, 3].map((i) => cell(`critter.turtle.look.${i - 2}`, "turtle", i * 32, 32, 32, 32)),
  bask: [0, 1].map((i) => cell(`critter.turtle.bask.${i}`, "turtle", i * 32, 64, 32, 32)),
};

const DUCKLING_PAL = { o: "#3e2816", B: "#7a542c", b: "#5c3e20", Y: "#f2ce4a", y: "#ffec96", k: "#1a1008", n: "#c87c2e", F: "#e88c28" };
const DUCKLING = [
  "...oooo..",
  "..oBBBBo.",
  "..oYYkYnn",
  "o..oYYYo.",
  "oBooYYYo.",
  "oBBBBBYo.",
  ".obbbbbo.",
];
// The mallard's wings, flapping (the sheet has no flying frames): raised behind the head, then down.
const WING_PAL = { o: "#4b2f15", h: "#7c5732", g: "#a08539", s: "#3a64c8", w: "#e8eef8" };
const WING_UP = ["...oo..", "..ogho.", ".oghho.", ".oghhho", "oghhhho", "ohhsswo", "ohhhhho", ".ooooo."];
const WING_DOWN = ["ohhhhhhho", ".ohsswwho", "..ohhhho.", "...oooo.."];

interface Art {
  swim: HTMLCanvasElement;
  sleep: HTMLCanvasElement;
  walk: [HTMLCanvasElement, HTMLCanvasElement];
  wingUp: HTMLCanvasElement;
  wingDown: HTMLCanvasElement;
}
let art: Art | null = null;

function buildArt(): Art {
  const sleeping = DUCKLING.map((r) => r.replace("k", "b"));
  // Waddling: up on its legs, then down a pixel mid-step, leaning (feet stay on the ground).
  const step = [".........", ...DUCKLING.slice(0, 5), "oBBBBYyo.", ".obbbbbo.", "...FF...."];
  return {
    swim: pixelArt("critter.duckling.swim", DUCKLING, DUCKLING_PAL),
    sleep: pixelArt("critter.duckling.sleep", sleeping, DUCKLING_PAL),
    walk: [pixelArt("critter.duckling.walk.0", [...DUCKLING, "..F..F...", "..F..F..."], DUCKLING_PAL), pixelArt("critter.duckling.walk.1", step, DUCKLING_PAL)],
    wingUp: pixelArt("critter.duck.wing.up", WING_UP, WING_PAL),
    wingDown: pixelArt("critter.duck.wing.down", WING_DOWN, WING_PAL),
  };
}

/**
 * Draw a sprite (sheet region or canvas) with only its top `visH` rows showing: the rest is under
 * water. (dx, dy) is the top-left; flip mirrors it.
 */
function blit(ctx: CanvasRenderingContext2D, key: string | HTMLCanvasElement, dx: number, dy: number, visH: number, flip: boolean, alpha: number): void {
  let img: CanvasImageSource;
  let sx = 0;
  let sy = 0;
  let sw: number;
  let sh: number;
  if (typeof key === "string") {
    const r = REGIONS[key];
    const s = r ? sheet(r.sheet) : null;
    if (!r || !s) return;
    img = s;
    sx = r.x;
    sy = r.y;
    sw = r.w;
    sh = r.h;
  } else {
    img = key;
    sw = key.width;
    sh = key.height;
  }
  const h = Math.min(sh, Math.max(0, Math.round(visH)));
  if (h <= 0 || alpha <= 0) return;
  const x = Math.round(dx);
  const y = Math.round(dy);
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(x + sw, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, h, 0, 0, sw, h);
    ctx.restore();
  } else ctx.drawImage(img, sx, sy, sw, h, x, y, sw, h);
  ctx.globalAlpha = 1;
}

/** A light line where a swimmer meets the water, flickering a little. */
function waterline(ctx: CanvasRenderingContext2D, x: number, y: number, half: number, t: number, alpha: number): void {
  ctx.globalAlpha = 0.75 * alpha;
  ctx.fillStyle = "#c4e6ff";
  const phase = Math.floor(t * 3);
  for (let dx = -half; dx <= half; dx++) if ((dx + phase) % 4 !== 0) ctx.fillRect(Math.round(x) + dx, Math.round(y), 1, 1);
  ctx.globalAlpha = 1;
}

const SPLASH = ["#c4e6ff", "#ffffff", "#7ec0ec"] as const;

function splash(x: number, y: number, n = 5): void {
  ripple(x, y, true);
  if (!reducedMotion) dotPuff(x, y - 2, SPLASH, n);
}

/** Can a swimmer `half` px wide float with its waterline at pond-local (lx, ly)? */
function floats(a: PondArt, lx: number, ly: number, half: number): boolean {
  const y = Math.round(ly);
  if (y < 1 || y + 1 >= a.h) return false;
  const x0 = Math.round(lx) - half;
  const x1 = Math.round(lx) + half;
  if (x0 < 0 || x1 >= a.w) return false;
  for (let x = x0; x <= x1; x++) if (!a.mask[y * a.w + x] || !a.mask[(y + 1) * a.w + x]) return false;
  return true;
}

/** A spot to float at just inside the near (bottom) stones, on the left or right (side < 0 = left). */
function bankPoint(a: PondArt, side: number, half: number, out: { x: number; y: number }): void {
  const wb = a.water;
  out.x = side < 0 ? wb.x + half + 1 : wb.x + wb.w - half - 2;
  out.y = wb.y + wb.h - 3;
  for (let k = 0; k < 24 && !floats(a, out.x, out.y, half); k++) {
    if (k % 2) out.y -= 1;
    else out.x -= side;
  }
}

function warmDay(g: Game): boolean {
  const e = g.env;
  if (e.season === "winter" || e.darkness > 0.12 || e.hour < 9.5 || e.hour > 17) return false;
  if (e.weather !== "sunny" && e.weather !== "cloudy" && e.weather !== "windy") return false;
  const c = store.weather?.tempC;
  return c == null || c >= 15;
}

// ---------- ducks ----------

type DuckState = "fly" | "swim" | "rest" | "dabble" | "look" | "sleep" | "walk" | "hop" | "takeoff" | "leave";

/** Scratch point for bankPoint (no allocations in the loop). */
const BANK = { x: 0, y: 0 };
/** Waddling ducks walk this far below the pond's feet line (in front of its near stones). */
const GRASS_DY = 6;
const ADULT_HALF = 6;
const BABY_HALF = 4;
/** Rows of the duck sprite above the waterline (the bottom 3 are under water). */
const DUCK_ABOVE = 13;
const BABY_ABOVE = 6;

class Duck implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  state: DuckState = "swim";
  /** Pond-local waterline position while on the water. */
  lx = 0;
  ly = 0;
  face = chance(0.5) ? 1 : -1;
  alpha = 0;
  private t = 0;
  private anim = Math.random() * 4;
  private dur = 0;
  private tx = 0;
  private ty = 0;
  private hurry = 0;
  /** Flying / walking: world position, altitude, start & end of the flight. */
  private wx = 0;
  private wy = 0;
  private z = 0;
  private fx0 = 0;
  private fy0 = 0;
  private fz0 = 0;
  private fx1 = 0;
  private fy1 = 0;
  private flightT = 0;
  private flightDur = 1;
  private quackIn = -1;
  private quacksLeft = 0;
  /** A walk on the grass: to the pond's edge (then hop in) or away from it (then gone). */
  private walkOut = false;
  private walkSide = 1;
  private hopT = -1;

  constructor(
    private flock: Flock,
    readonly baby: boolean,
    /** Ducklings follow the one in front of them. */
    readonly leader: Duck | null,
  ) {}

  private get half(): number {
    return this.baby ? BABY_HALF : ADULT_HALF;
  }

  get onWater(): boolean {
    return this.state === "swim" || this.state === "rest" || this.state === "dabble" || this.state === "look" || this.state === "sleep";
  }

  /** Quack (twice, now and then) on the next frame or `delay` s from now: counted down in update, no timers. */
  quack(times = 1, delay = 0.01): void {
    this.quackIn = delay;
    this.quacksLeft = times - 1;
  }

  /** Start floating at pond-local (lx, ly), fading in (already there when you arrived). */
  placeOn(lx: number, ly: number): void {
    const a = this.flock.art!;
    const ok = floats(a, lx, ly, this.half);
    if (!ok) bankPoint(a, lx < a.w / 2 ? -1 : 1, this.half, BANK);
    this.lx = ok ? lx : BANK.x;
    this.ly = ok ? ly : BANK.y;
    this.state = "rest";
    this.dur = rand(0.5, 3);
    this.t = 0;
    this.alpha = 0;
  }

  /** Fly in from off screen and splash down at pond-local (lx, ly). */
  flyIn(lx: number, ly: number, from: number): void {
    const p = this.flock.pond!;
    const l = this.flock.g.layout;
    this.lx = lx;
    this.ly = ly;
    this.fx1 = p.left + lx;
    this.fy1 = p.top + ly;
    this.fx0 = from < 0 ? -20 : l.w + 20;
    this.fy0 = this.fy1 + rand(-40, 30);
    this.fz0 = rand(60, 90);
    this.face = from < 0 ? 1 : -1;
    this.flightT = 0;
    this.flightDur = Math.abs(this.fx1 - this.fx0) / rand(55, 70);
    this.state = "fly";
    this.layer = 3;
    this.alpha = 1;
  }

  /** Take off and fly away to the nearer side of the screen. */
  flyAway(): void {
    if (!this.onWater) return;
    const p = this.flock.pond!;
    const l = this.flock.g.layout;
    this.fx0 = p.left + this.lx;
    this.fy0 = p.top + this.ly;
    this.fz0 = 0;
    const right = this.fx0 > l.w / 2;
    this.face = right ? 1 : -1;
    this.fx1 = right ? l.w + 24 : -24;
    this.fy1 = this.fy0 + rand(-50, 10);
    this.flightT = 0;
    this.flightDur = Math.abs(this.fx1 - this.fx0) / rand(50, 65);
    this.state = "takeoff";
    this.t = 0;
    splash(this.fx0, this.fy0, 6);
    sfx("lap", { volume: 0.6 });
    if (chance(0.6)) sfx("quack", { volume: 0.4, pitch: rand(0.95, 1.05) });
  }

  /** Waddle over from the side of the pasture, then hop in (side -1 = from the left). */
  walkIn(side: number, delay: number): void {
    const l = this.flock.g.layout;
    const p = this.flock.pond!;
    this.walkSide = side;
    this.walkOut = false;
    this.wx = side < 0 ? l.pasture.x - 14 - delay : l.pasture.x + l.pasture.w + 14 + delay;
    this.wy = p.y + GRASS_DY;
    this.face = side < 0 ? 1 : -1;
    this.state = "walk";
    this.layer = 1;
    this.alpha = 0;
  }

  /** Swim to the bank and waddle off to the side. */
  walkAway(): void {
    if (!this.onWater || this.walkOut) return;
    const l = this.flock.g.layout;
    this.walkSide = this.flock.pond!.x < l.pasture.x + l.pasture.w / 2 ? -1 : 1;
    this.walkOut = true;
    this.state = "swim";
    this.setBankTarget();
  }

  private setBankTarget(): void {
    bankPoint(this.flock.art!, this.walkSide, this.half, BANK);
    this.tx = BANK.x;
    this.ty = BANK.y;
  }

  /** Paddle somewhere new (away from the others). */
  private newTarget(away?: { x: number; y: number }): void {
    const a = this.flock.art!;
    const wb = a.water;
    const half = this.half;
    let best = -1;
    for (let i = 0; i < 14; i++) {
      const lx = wb.x + half + Math.random() * Math.max(1, wb.w - half * 2);
      const ly = wb.y + 6 + Math.random() * Math.max(1, wb.h - 9);
      if (!floats(a, lx, ly, half)) continue;
      let room = this.flock.roomAt(lx, ly, this);
      if (away) room += Math.hypot(lx - away.x, ly - away.y) * 2;
      if (room > best) {
        best = room;
        this.tx = lx;
        this.ty = ly;
      }
    }
    if (best < 0) {
      this.tx = this.lx;
      this.ty = this.ly;
    }
  }

  private set(state: DuckState, dur: number): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.anim += dt;
    const p = this.flock.pond;
    const a = this.flock.art;
    if (!p || !a) {
      // The pond went away: they just slip off.
      this.alpha -= dt * 2;
      if (this.alpha <= 0) this.dead = true;
      return;
    }
    if (this.quackIn > 0) {
      this.quackIn -= dt;
      if (this.quackIn <= 0) {
        sfx("quack", { volume: this.baby ? 0.3 : 0.45, pitch: this.baby ? 1.45 : rand(0.92, 1.05) });
        if (this.quacksLeft-- > 0) this.quackIn = 0.24;
      }
    }
    switch (this.state) {
      case "fly":
      case "takeoff":
      case "leave":
        this.updateFlight(dt, p);
        return;
      case "walk":
        this.updateWalk(dt, p, a);
        return;
      case "hop":
        this.updateHop(dt, p);
        return;
      default:
        break;
    }
    // On the water.
    this.alpha = Math.min(1, this.alpha + dt * 1.5);
    if (this.hurry > 0) this.hurry -= dt;
    const night = g.env.darkness > 0.55;
    if (this.leader) this.followLeader(dt, a, night);
    else if (this.state === "sleep") {
      if (!night) this.set("rest", rand(1, 3));
    } else if (this.state === "swim") {
      this.paddle(dt, this.hurry > 0 ? 13 : 5);
      if (Math.hypot(this.tx - this.lx, this.ty - this.ly) < 0.6) {
        if (this.walkOut) return this.hopOut(p);
        if (night) this.set("sleep", 0);
        else if (chance(0.4)) this.set("dabble", rand(1.2, 2.4));
        else this.set("rest", rand(1.5, 5));
      }
    } else if (this.t > this.dur) {
      // Off again (after a tap, the paddle-away target is already set). At night, to a spot to sleep.
      if (this.state !== "look") this.newTarget();
      this.state = "swim";
      this.t = 0;
      if (!night && chance(0.15)) sfx("lap", { volume: 0.35, pitch: rand(0.9, 1.1) });
    } else if (this.state === "dabble" && Math.floor(this.t / 0.6) !== Math.floor((this.t - dt) / 0.6)) {
      ripple(p.left + this.lx + this.face * 5, p.top + this.ly);
    }
    this.x = p.left + this.lx;
    this.y = p.top + this.ly;
  }

  private paddle(dt: number, speed: number): void {
    const dx = this.tx - this.lx;
    const dy = this.ty - this.ly;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) return;
    const step = Math.min(d, speed * dt);
    this.lx += (dx / d) * step;
    this.ly += (dy / d) * step;
    if (Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1;
  }

  /** Ducklings keep a few px behind whoever is in front of them, in a wobbly line. */
  private followLeader(dt: number, a: PondArt, night: boolean): void {
    const lead = this.leader!;
    if (lead.walkOut && !lead.onWater) {
      // The one in front has climbed out: follow it up the bank.
      this.walkOut = true;
      this.walkSide = lead.walkSide;
      this.setBankTarget();
      this.paddle(dt, 9);
      this.state = "swim";
      if (Math.hypot(this.tx - this.lx, this.ty - this.ly) < 0.6) this.hopOut(this.flock.pond!);
      return;
    }
    const gap = 9;
    const dx = lead.lx - this.lx;
    const dy = lead.ly - this.ly;
    const d = Math.hypot(dx, dy);
    if (d > gap) {
      const step = Math.min(d - gap, Math.max(4, (d - gap) * 3) * dt);
      const nx = this.lx + (dx / d) * step;
      const ny = this.ly + (dy / d) * step;
      // (A duckling that hopped in at the very edge may paddle its way clear.)
      if (floats(a, nx, ny, this.half) || !floats(a, this.lx, this.ly, this.half)) {
        this.lx = nx;
        this.ly = ny;
      }
      if (Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1;
      this.state = "swim";
    } else this.state = night && lead.state === "sleep" ? "sleep" : "rest";
  }

  private hopOut(p: PondSpot): void {
    this.wx = p.left + this.lx;
    this.wy = p.top + this.ly;
    this.fx0 = this.wx;
    this.fy0 = this.wy;
    this.fx1 = this.walkSide < 0 ? p.left - 6 : p.left + p.w + 6;
    this.fy1 = p.y + GRASS_DY;
    this.face = this.walkSide;
    this.hopT = 0;
    this.state = "hop";
    this.layer = 1;
    ripple(this.wx, this.wy);
  }

  private updateHop(dt: number, p: PondSpot): void {
    this.hopT += dt / 0.45;
    const k = Math.min(1, this.hopT);
    this.wx = this.fx0 + (this.fx1 - this.fx0) * k;
    this.wy = this.fy0 + (this.fy1 - this.fy0) * k;
    this.z = Math.sin(Math.PI * k) * 6;
    this.x = this.wx;
    this.y = this.wy;
    if (k < 1) return;
    this.z = 0;
    if (this.walkOut) {
      // Out of the water and off across the grass.
      this.state = "walk";
      return;
    }
    // Into the water.
    this.state = "rest";
    this.dur = rand(0.4, 1.2);
    this.t = 0;
    this.lx = this.wx - p.left;
    this.ly = this.wy - p.top;
    splash(this.wx, this.wy, 3);
    sfx("plop", { volume: this.baby ? 0.4 : 0.55, pitch: this.baby ? 1.4 : 1 });
  }

  private updateWalk(dt: number, p: PondSpot, a: PondArt): void {
    const l = this.flock.g.layout;
    const pa = l.pasture;
    const speed = 13;
    if (this.walkOut) {
      // Off to the side, fading out past the fence.
      this.wx += this.walkSide * speed * dt;
      this.face = this.walkSide;
      const past = this.walkSide < 0 ? pa.x - this.wx : this.wx - (pa.x + pa.w);
      this.alpha = Math.max(0, Math.min(1, 1 - past / 14));
      if (past > 14) this.dead = true;
    } else {
      this.alpha = Math.min(1, this.alpha + dt * 2);
      // Follow the one in front, or head for the bank.
      const lead = this.leader;
      let tx = this.walkSide < 0 ? p.left - 6 : p.left + p.w + 6;
      let ty = p.y + GRASS_DY;
      if (lead && lead.state === "walk") {
        tx = lead.wx - lead.face * 9;
        ty = lead.wy;
      }
      const dx = tx - this.wx;
      const dy = ty - this.wy;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const step = Math.min(d, speed * dt);
        this.wx += (dx / d) * step;
        this.wy += (dy / d) * step;
        if (Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1;
      }
      const atBank = !lead || lead.state !== "walk";
      if (atBank && d < 1) {
        // Hop in, just inside the stones.
        bankPoint(a, this.walkSide, this.half, BANK);
        this.fx0 = this.wx;
        this.fy0 = this.wy;
        this.fx1 = p.left + BANK.x;
        this.fy1 = p.top + BANK.y;
        this.hopT = 0;
        this.state = "hop";
      }
    }
    this.x = this.wx;
    this.y = this.wy;
  }

  private updateFlight(dt: number, p: PondSpot): void {
    this.flightT += dt / this.flightDur;
    const k = Math.min(1, this.flightT);
    const e = this.state === "fly" ? 1 - (1 - k) * (1 - k) : k * k;
    this.wx = this.fx0 + (this.fx1 - this.fx0) * e;
    this.wy = this.fy0 + (this.fy1 - this.fy0) * e;
    // Coming in: high over the pasture, then a long glide down. Leaving: climbing away.
    const dz = Math.max(0, (k - 0.3) / 0.7);
    this.z = this.state === "fly" ? this.fz0 * (1 - dz * dz * (3 - 2 * dz)) : 70 * e;
    this.x = this.wx;
    this.y = this.wy;
    if (this.state === "takeoff" && this.t > 0.15) {
      this.state = "leave";
      this.layer = 3;
    }
    if (k < 1) return;
    if (this.state === "fly") {
      // Splashdown.
      this.state = "rest";
      this.layer = 1;
      this.dur = rand(0.8, 2);
      this.t = 0;
      this.lx = this.fx1 - p.left;
      this.ly = this.fy1 - p.top;
      splash(this.fx1, this.fy1, 6);
      sfx("plop", { volume: 0.5, pitch: 0.8 });
      sfx("lap", { volume: 0.5 });
      this.quack(1, rand(0.4, 1.2));
    } else this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0.01) return;
    const flying = this.state === "fly" || this.state === "takeoff" || this.state === "leave";
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    if (flying) {
      const z = Math.round(this.z);
      drawShadow(ctx, x, y + 1, 10, Math.max(0, 1 - z / 80) * this.alpha);
      // Flapping (wings held up for the last bit before splashdown); the raised wing is the far one.
      const up = (this.state === "fly" && z < 8) || Math.floor(this.anim / 0.11) % 2 === 0;
      const top = y - 16 - z;
      const flip = this.face < 0;
      if (art && up) blit(ctx, art.wingUp, x - 8 + (flip ? 9 : 0), top - 1, 99, flip, this.alpha);
      blit(ctx, DUCK.swim[0]!, x - 8, top, 16, flip, this.alpha);
      if (art && !up) blit(ctx, art.wingDown, x - 8 + (flip ? 4 : 3), top + 13, 99, flip, this.alpha);
      return;
    }
    if (this.state === "walk" || this.state === "hop") {
      const z = Math.round(this.z);
      drawShadow(ctx, x, y, this.baby ? 7 : 11, this.alpha);
      if (this.baby) {
        if (art) blit(ctx, art.walk[Math.floor(this.anim / 0.14) % 2]!, x - 4, y - 9 - z, 99, this.face < 0, this.alpha);
      } else blit(ctx, DUCK.walk[Math.floor(this.anim / 0.12) % 4]!, x - 8, y - 16 - z, 16, this.face < 0, this.alpha);
      return;
    }
    // On the water: the bottom of the body is under it.
    if (this.baby) {
      if (!art) return;
      const bob = Math.floor(this.anim / 0.5) % 2;
      blit(ctx, this.state === "sleep" ? art.sleep : art.swim, x - 4, y - BABY_ABOVE + bob, BABY_ABOVE - bob, this.face < 0, this.alpha);
      waterline(ctx, x, y, 4, this.anim, this.alpha);
      return;
    }
    let pose: Pose = "swim";
    let f = 0;
    if (this.state === "swim") f = Math.floor(this.anim / 0.2) % 4;
    else if (this.state === "dabble") {
      pose = "dabble";
      f = Math.floor(this.t / 0.6) % 2;
    } else if (this.state === "look") {
      pose = "look";
      f = this.t < 0.25 ? 0 : 1;
    } else if (this.state === "sleep") {
      pose = "tuck";
      f = Math.floor(this.anim / 1.6) % 2;
    } else {
      // Resting: floating still, bobbing now and then.
      f = Math.floor(this.anim / 0.9) % 4 === 3 ? 1 : 0;
    }
    const key = DUCK[pose][f]!;
    const flip = FACES_RIGHT[pose] ? this.face < 0 : this.face > 0;
    blit(ctx, key, x - 8, y - DUCK_ABOVE, DUCK_ABOVE, flip, this.alpha);
    waterline(ctx, x, y, 7, this.anim, this.alpha);
  }

  hit(wx: number, wy: number): boolean {
    if (!this.onWater || this.alpha < 0.5) return false;
    return this.baby ? inBox(wx, wy, this.x - 6, this.y - 9, 12, 11) : inBox(wx, wy, this.x - 9, this.y - 15, 18, 17);
  }

  onTap(_g: Game, wx: number, wy: number): void {
    if (!this.onWater) return;
    sfx("quack", { volume: this.baby ? 0.45 : 0.6, pitch: this.baby ? 1.45 : rand(0.95, 1.05) });
    sfx("lap", { volume: 0.4, pitch: 1.2 });
    splash(this.x, this.y, 4);
    const p = this.flock.pond;
    if (this.baby) {
      // Mama answers.
      let m = this.leader;
      while (m?.leader) m = m.leader;
      m?.quack(1, 0.35);
      return;
    }
    if (this.state === "sleep") {
      this.set("look", 0.8);
      return;
    }
    this.face = wx < this.x ? 1 : -1;
    this.set("look", 0.55);
    this.hurry = 2;
    if (p) this.newTarget({ x: wx - p.left, y: wy - p.top });
  }
}

// ---------- the turtle ----------

type TurtleState = "away" | "climb" | "bask" | "look" | "slide";

class Turtle implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  state: TurtleState = "away";
  private t = 0;
  private dur = 0;
  /** Pond-local feet on the back stones, and which way it faces. */
  private bx = 0;
  private by = 12;
  private face = 1;
  private lookIn = rand(5, 10);
  /** Seconds until it next feels like coming out. */
  wait = rand(6, 25);

  constructor(private flock: Flock) {}

  /** Its favorite stone on the back of the pond (seeded per pond, so it's always the same one). */
  private spot(p: PondSpot): void {
    const left = p.seed % 2 === 0;
    this.bx = left ? 24 : p.w - 24;
    this.face = left ? 1 : -1;
  }

  update(dt: number, g: Game): void {
    const p = this.flock.pond;
    const a = this.flock.art;
    this.t += dt;
    if (!p || !a) {
      this.state = "away";
      return;
    }
    this.spot(p);
    const warm = this.flock.forceTurtle || warmDay(g);
    switch (this.state) {
      case "away":
        if (!warm) break;
        this.wait -= dt;
        if (this.wait <= 0) {
          this.state = "climb";
          this.t = 0;
          ripple(p.left + this.bx, p.top + a.water.y + 3, true);
          sfx("lap", { volume: 0.35, pitch: 0.8 });
        }
        break;
      case "climb":
        if (this.t > 1) this.set("bask", 0);
        break;
      case "bask":
      case "look":
        if (!warm) return this.set("slide", 0);
        this.lookIn -= dt;
        if (this.state === "look" && this.t > this.dur) this.set("bask", 0);
        else if (this.state === "bask" && this.lookIn <= 0) {
          this.lookIn = rand(6, 14);
          this.set("look", rand(1.2, 2));
        }
        break;
      case "slide":
        if (this.t > 0.35) {
          this.state = "away";
          this.wait = this.flock.forceTurtle ? 6 : rand(50, 110);
          const wx = p.left + this.bx + this.face * 3;
          const wy = p.top + a.water.y + 4;
          splash(wx, wy, 4);
          sfx("plop", { volume: 0.6, pitch: 0.75 });
        }
        break;
    }
    this.x = p.left + this.bx;
    this.y = p.top + this.by;
  }

  private set(state: TurtleState, dur: number): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const p = this.flock.pond;
    const a = this.flock.art;
    if (!p || !a || this.state === "away") return;
    const flip = this.face < 0;
    const waterTop = p.top + a.water.y + 1;
    let key = TURTLE.bask[Math.floor(this.t / 2.4) % 2]!;
    let fx = this.x;
    let fy = this.y;
    let alpha = 1;
    if (this.state === "climb") {
      // Up out of the water onto the stones, crawling.
      const k = Math.min(1, this.t / 1);
      key = TURTLE.walk[Math.floor(this.t / 0.15) % 4]!;
      fy = this.y + (1 - k) * 12;
      alpha = Math.min(1, k * 3);
    } else if (this.state === "look") key = TURTLE.look[Math.floor(this.t / 0.5) % 2]!;
    else if (this.state === "slide") {
      const k = Math.min(1, this.t / 0.35);
      key = TURTLE.walk[1]!;
      fx = this.x + this.face * 3 * k;
      fy = this.y + k * 12;
      alpha = 1 - k * 0.4;
    }
    const top = Math.round(fy) - 28;
    // Whatever has dipped below the near edge of the back stones is under water.
    const vis = this.state === "bask" || this.state === "look" ? 32 : Math.max(0, waterTop + 2 - top);
    blit(ctx, key, Math.round(fx) - 16, top, vis, flip, alpha);
  }

  hit(wx: number, wy: number): boolean {
    if (this.state !== "bask" && this.state !== "look") return false;
    return inBox(wx, wy, this.x - 12, this.y - 15, 24, 18);
  }

  onTap(): void {
    if (this.state !== "bask" && this.state !== "look") return;
    this.set("slide", 0);
    sfx("rustle", { volume: 0.25, pitch: 1.3 });
  }
}

// ---------- who's visiting ----------

class Flock {
  pond: PondSpot | null = null;
  art: PondArt | null = null;
  ducks: Duck[] = [];
  turtle: Turtle | null = null;
  readonly forceTurtle = params.has("turtle");
  /** Seconds until the next ducks show up, and until the ones here move on. */
  private visitIn = -1;
  private stay = 0;
  private quackIn = rand(8, 20);
  /** The ones here have been told it's time to go (told again every second, for any still walking in). */
  private leaving = false;
  private leaveCheck = 0;
  private pondId = "";
  private preloaded = false;

  constructor(readonly g: Game) {}

  /** Distance from pond-local (lx, ly) to the nearest other duck (or where it's headed). */
  roomAt(lx: number, ly: number, self: Duck): number {
    let best = 60;
    for (const d of this.ducks) {
      if (d === self || !d.onWater) continue;
      best = Math.min(best, Math.hypot(d.lx - lx, d.ly - ly));
    }
    return best;
  }

  private canArrive(): boolean {
    const e = this.g.env;
    return e.season !== "winter" && e.darkness < 0.4 && e.weather !== "storm";
  }

  private freeSpot(half: number, out: { x: number; y: number }): boolean {
    const a = this.art!;
    const wb = a.water;
    let best = -1;
    for (let i = 0; i < 16; i++) {
      const lx = wb.x + half + Math.random() * Math.max(1, wb.w - half * 2);
      const ly = wb.y + 6 + Math.random() * Math.max(1, wb.h - 9);
      if (!floats(a, lx, ly, half)) continue;
      let room = 60;
      for (const d of this.ducks) if (d.onWater || d.state === "fly") room = Math.min(room, Math.hypot(d.lx - lx, d.ly - ly));
      if (room > best) {
        best = room;
        out.x = lx;
        out.y = ly;
      }
    }
    return best >= 0;
  }

  /** A pair (or a lone mallard) flying in, or already paddling about if `here`. */
  private pairArrives(here: boolean, sleeping = false): void {
    const n = chance(0.65) ? 2 : 1;
    const from = chance(0.5) ? -1 : 1;
    const at = { x: 0, y: 0 };
    for (let i = 0; i < n; i++) {
      if (!this.freeSpot(ADULT_HALF, at)) return;
      const d = addSafe(this.g, new Duck(this, false, null), "duck");
      this.ducks.push(d);
      if (here || reducedMotion) d.placeOn(at.x, at.y);
      else d.flyIn(at.x, at.y, from);
      if (sleeping) d.state = "sleep";
    }
  }

  /** A mama and 2-3 ducklings: waddling over in a line, or already out on the water if `here`. */
  private familyArrives(here: boolean): void {
    const l = this.g.layout;
    const p = this.pond!;
    const side = p.x < l.pasture.x + l.pasture.w / 2 ? -1 : 1;
    const mama = addSafe(this.g, new Duck(this, false, null), "duck");
    this.ducks.push(mama);
    const at = { x: 0, y: 0 };
    let lead = mama;
    const babies = chance(0.5) ? 3 : 2;
    if (here) {
      if (!this.freeSpot(ADULT_HALF, at)) return;
      mama.placeOn(at.x, at.y);
    } else mama.walkIn(side, 0);
    for (let i = 0; i < babies; i++) {
      const b = addSafe(this.g, new Duck(this, true, lead), "duckling");
      this.ducks.push(b);
      if (here) {
        const lx = at.x - mama.face * 9 * (i + 1);
        b.placeOn(lx, at.y);
        b.face = mama.face;
      } else b.walkIn(side, 10 * (i + 1));
      lead = b;
    }
  }

  private arrive(here: boolean): void {
    const e = this.g.env;
    // Ducklings mostly in spring and summer (a late brood in fall, now and then).
    const odds = e.season === "spring" || e.season === "summer" ? 0.35 : e.season === "fall" ? 0.15 : 0;
    const family = params.has("ducklings") || (chance(odds) && !params.has("ducks"));
    if (family) this.familyArrives(here);
    else this.pairArrives(here);
    this.stay = rand(100, 260);
  }

  private leave(): void {
    this.leaving = true;
    for (const d of this.ducks) {
      if (d.baby) continue;
      if (this.ducks.some((b) => b.leader === d)) d.walkAway();
      else d.flyAway();
    }
  }

  tick(dt: number): void {
    const g = this.g;
    const p = mainPond(g.layout);
    const art = p ? pondArt(g.env.season) : null;
    this.pond = p && art?.real ? p : null;
    this.art = this.pond ? art : null;
    for (let i = this.ducks.length - 1; i >= 0; i--) if (this.ducks[i]!.dead) this.ducks.splice(i, 1);
    if (!this.pond) {
      this.visitIn = -1;
      this.pondId = "";
      return;
    }
    if (!this.preloaded) {
      this.preloaded = true;
      preloadSfx("quack", "lap", "plop");
    }
    if (!this.turtle) this.turtle = addSafe(g, new Turtle(this), "turtle");
    if (this.forceTurtle && this.turtle.state === "away") this.turtle.wait = Math.min(this.turtle.wait, 2);
    const env = g.env;
    // The first look at the pond when the farm opens: maybe someone's already here. (A pond put in
    // just now, or moved, starts empty: the ducks find it in a few seconds.)
    if (this.pondId !== this.pond.id) {
      this.pondId = this.pond.id;
      const forced = params.has("ducks") || params.has("ducklings");
      const opening = g.time < 5;
      if (forced) this.arrive(params.get("ducks") !== "fly" && params.get("ducklings") !== "walk");
      else if (opening && this.canArrive() && chance(0.55)) this.arrive(true);
      else if (opening && env.darkness > 0.55 && env.season !== "winter" && chance(0.5)) {
        this.pairArrives(true, true);
        this.stay = rand(100, 260);
      }
      this.visitIn = opening ? rand(4, 14) : rand(5, 12);
    }
    const here = this.ducks.length > 0;
    if (!here) {
      this.leaving = false;
      if (this.visitIn > 0) this.visitIn -= dt;
      if (this.visitIn <= 0 && this.canArrive()) {
        this.arrive(false);
        this.visitIn = rand(25, 80);
      }
      return;
    }
    // Winter (frozen) or a storm: off they go, whatever the time.
    const mustGo = env.season === "winter" || env.weather === "storm";
    // They sleep over: the clock only runs in the daytime.
    if (env.darkness < 0.4) this.stay -= dt;
    if (mustGo || this.stay <= 0) {
      if (!this.leaving) this.visitIn = rand(25, 80);
      this.leaveCheck -= dt;
      if (!this.leaving || this.leaveCheck <= 0) {
        this.leaveCheck = 1;
        this.leave();
      }
    }
    // Now and then somebody says something.
    if (env.darkness < 0.55) {
      this.quackIn -= dt;
      if (this.quackIn <= 0) {
        this.quackIn = rand(14, 40);
        const awake = this.ducks.filter((d) => d.onWater && d.state !== "sleep");
        const who = awake[Math.floor(Math.random() * awake.length)];
        who?.quack(!who.baby && chance(0.35) ? 2 : 1);
      }
    }
  }
}

export function initPond(g: Game): void {
  art = buildArt();
  const flock = new Flock(g);
  onTick(g, "pond", (dt) => flock.tick(dt));
}
