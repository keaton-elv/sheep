// The neighbor's hen. Now and then (about every other day, the same days on both phones; once a day
// at most per device; daytime, dry) a white hen wanders into the yard by the barn from the edge of
// the screen, pecks about and clucks. Snickers hears her (her clucking gets him up from a nap), comes
// over from wherever he is, crouches low and stares her down until she bawks and hurries back out
// the way she came. (She keeps pecking until he gets there.) Tap her: a cluck and a little hop.
// On a lucky morning a rooster crows (from a little way off) before she shows up.
// Real frames from the White Chicken sheet (sprites/hen.png). Debug: ?hen (?hen=rooster|left|right):
// she comes at any hour (and stays, even after dark), and he gets up for her even at night.

import { dayKey } from "../../shared/calendar";
import { preloadSfx, sfx } from "../audio";
import { DUSK_HOUR, type Entity, type Game } from "../engine/game";
import { draw, isReal, REGIONS, SHEETS, type DrawOpts } from "../engine/sprites";
import { isDialogOpen, toast } from "../ui/dom";
import type { Layout } from "../world/layout";
import { hash2 } from "../world/world-pixels";
import { signFeet } from "../world/world-zones";
import { onLayoutChange } from "./critter-place";
import { addSafe, chance, drawShadow, Emote, lsGet, lsSet, onTick, params, rand, reducedMotion } from "./critter-util";
import { snickersDish, snickersPosition, snickersStare, type StareHooks } from "./snickers";

// hen.png: row 0 = walking left (4 frames) + head down at the ground (facing left); row 1 = walking
// right. 16x16 cells, feet on the bottom row, body around x 7.
SHEETS.hen ??= "sprites/hen.png";
function cell(key: string, x: number, y: number): string {
  REGIONS[key] ??= { sheet: "hen", x, y, w: 16, h: 16 };
  return key;
}
const HEN = {
  left: [0, 16, 32, 48].map((x, i) => cell(`critter.hen.walk.l${i}`, x, 0)),
  right: [0, 16, 32, 48].map((x, i) => cell(`critter.hen.walk.r${i}`, x, 16)),
  /** Head down, pecking at the ground (faces left; mirrored to peck facing right). */
  peck: cell("critter.hen.peck", 64, 0),
};

const DAY_KEY = "farm.hen.day";
const STARED_KEY = "farm.hen.stared";
/** The first time he sees her off (on this device). */
const STARE_LINE = "Snickers has never lost a staring contest.";

const STROLL = 14;
const RUN = 44;
const HOP = 0.3;

const seedOf = (key: string) => Number(key.replaceAll("-", ""));

/** About every other day, the same days on both phones. */
function henDay(key: string): boolean {
  return hash2(seedOf(key), 0x4e2, 0xc1c) < 0.45;
}

/** Broad daylight and dry (a hen has standards). */
function henTime(g: Game): boolean {
  const e = g.env;
  return e.darkness < 0.05 && e.hour < DUSK_HOUR[e.season] - 1 && e.weather !== "rain" && e.weather !== "storm" && e.weather !== "snow";
}

/** Where she walks (feet y), and the screen edges she can come in from. */
function lane(l: Layout): { y: number; edges: (1 | -1)[] } {
  if (l.portrait) {
    // The yard strip between the barn and the top fence (where Snickers walks).
    return { y: Math.round(Math.max(l.barn.y + l.barn.h + 1, Math.min(l.barnDoor.y, l.fence.y - 25))), edges: [-1, 1] };
  }
  // The grass below the barn, above the farm things.
  return { y: Math.round(l.barnDoor.y + 4), edges: [-1] };
}

/**
 * The stretch of yard she potters about in, coming in from `edge`: near the edge, clear of the
 * sheep's way through the gate, his dish, the sign, and (if he's in the way) Snickers.
 */
function zone(l: Layout, edge: 1 | -1, laneY: number): { lo: number; hi: number } {
  let lo: number;
  let hi: number;
  if (edge < 0) {
    lo = 10;
    hi = Math.min(64, (l.portrait ? l.gate.x - l.gate.w / 2 : l.barnDoor.x) - 12);
    const dish = snickersDish();
    if (dish && Math.abs(dish.y - laneY) < 10) hi = Math.min(hi, dish.x - 12);
  } else {
    lo = Math.max(l.w - 64, signFeet(l).x + 18);
    hi = l.w - 10;
  }
  const cat = snickersPosition();
  if (cat && Math.abs(cat.y - laneY) < 12 && cat.x > lo - 20 && cat.x < hi + 20) {
    if (edge < 0) hi = Math.min(hi, cat.x - 22);
    else lo = Math.max(lo, cat.x + 22);
  }
  if (hi < lo + 6) hi = lo + 6;
  return { lo, hi };
}

type HenState = "wait" | "in" | "peck" | "walk" | "eyed" | "flee" | "out";

class Hen implements Entity {
  x: number;
  y: number;
  layer = 1;
  dead = false;
  private state: HenState = "wait";
  private t = 0;
  private anim = Math.random();
  /** 1 = facing right. */
  private face: 1 | -1;
  /** Where she walks to next. */
  private tx = 0;
  /** How long she potters about before wandering home on her own (on hold while he's on his way). */
  private visit = rand(16, 26);
  /** ...but never longer than this, whatever he's up to. */
  private stay = 90;
  /** Pecks left in this burst, time into the current one, and the pause before what's next. */
  private burst = 0;
  private peckT = 0;
  private pause = 0.4;
  private down = false;
  private hopT = 0;
  private askIn = 1.2;
  private stared = false;
  private bawked = false;
  private crowIn: number;
  private readonly laneY: number;
  private readonly emote = new Emote();
  private readonly opts: DrawOpts = { flipX: false };

  readonly hooks: StareHooks = {
    crouch: () => {
      if (this.state !== "peck" && this.state !== "walk") return;
      // She's seen him: frozen, eyeing him right back.
      this.state = "eyed";
      this.t = 0;
      this.down = false;
      const cat = snickersPosition();
      if (cat && Math.abs(cat.x - this.x) > 1) this.face = cat.x > this.x ? 1 : -1;
    },
    win: () => this.flee(),
    alive: () => !this.dead && (this.state === "in" || this.state === "peck" || this.state === "walk" || this.state === "eyed"),
    off: () => {
      // He wandered off mid-stare: back to pecking (and he may try again in a bit).
      this.stared = false;
      this.askIn = 6;
      if (this.state === "eyed") {
        this.state = "peck";
        this.t = 0;
      }
    },
  };

  constructor(
    private readonly g: Game,
    /** Which side she comes in from (and goes back out to). */
    private readonly edge: 1 | -1,
    /** Seconds before she steps in (a rooster crows first, on a lucky morning). */
    private readonly delay: number,
    rooster: boolean,
    /** Debug (?hen): any hour, and he always comes. */
    private readonly forced = false,
  ) {
    const l = g.layout;
    const ln = lane(l);
    this.laneY = ln.y;
    this.x = edge < 0 ? -12 : l.w + 12;
    this.y = ln.y + 0.5;
    this.face = edge < 0 ? 1 : -1;
    const z = zone(l, edge, ln.y);
    this.tx = rand(z.lo, z.hi);
    this.crowIn = rooster ? 1.4 : -1;
  }

  /** Back the way she came, in her own time. */
  private leave(): void {
    if (this.state === "out" || this.state === "flee") return;
    this.state = "out";
    this.t = 0;
    this.down = false;
    this.tx = this.edge < 0 ? -14 : this.g.layout.w + 14;
    this.face = this.edge < 0 ? -1 : 1;
  }

  /** BAWK. Stared down: she's out of here. */
  private flee(): void {
    if (this.dead || this.state === "flee" || this.state === "out" || this.state === "wait") return;
    sfx("bawk", { volume: 0.85, pitch: rand(0.96, 1.08) });
    this.emote.show("exclaim");
    this.hopT = HOP;
    this.state = "flee";
    this.t = 0;
    this.down = false;
    this.tx = this.edge < 0 ? -14 : this.g.layout.w + 14;
    this.face = this.edge < 0 ? -1 : 1;
    if (!lsGet(STARED_KEY)) {
      lsSet(STARED_KEY, String(Date.now()));
      window.setTimeout(() => toast(STARE_LINE, { icon: "snickers.icon" }), 1200);
    }
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.anim += dt;
    this.emote.update(dt);
    if (this.hopT > 0) this.hopT = Math.max(0, this.hopT - dt);
    if (this.crowIn > 0) {
      this.crowIn -= dt;
      // A neighbor's rooster, a little way off.
      if (this.crowIn <= 0) sfx("rooster", { volume: 0.7 });
    }
    // Dusk, or rain: she heads home. (Or she's been here long enough.)
    const e = g.env;
    const pottering = this.state === "in" || this.state === "peck" || this.state === "walk" || this.state === "eyed";
    if (pottering) this.stay -= dt;
    if (pottering && ((e.darkness > 0.3 && !this.forced) || e.weather === "rain" || e.weather === "storm" || this.stay <= 0)) this.leave();

    switch (this.state) {
      case "wait":
        if (this.t > this.delay) {
          this.state = "in";
          this.t = 0;
        }
        return;
      case "in":
      case "walk":
      case "out":
      case "flee":
        this.walk(dt);
        break;
      case "peck":
        this.peck(dt);
        // (Not while he's on his way over: that'd be no fun.)
        if (!this.stared) this.visit -= dt;
        if (this.visit <= 0 && this.burst === 0) this.leave();
        break;
      case "eyed":
        // (If he loses interest, so does she.)
        if (this.t > 9) {
          this.state = "peck";
          this.t = 0;
          this.stared = false;
          this.askIn = 6;
        }
        break;
    }

    if (this.state === "flee" && !this.bawked && this.t > 0.75) {
      this.bawked = true;
      sfx("bawk", { volume: 0.6, pitch: rand(1.02, 1.12) });
    }

    // Is Snickers up for this? (Asked now and then until he is.)
    if (!this.stared && (this.state === "peck" || this.state === "walk")) {
      this.askIn -= dt;
      if (this.askIn <= 0) {
        this.askIn = 3;
        this.stared = snickersStare(this, this.hooks, this.forced);
        // (A cluck: that's what he heard.)
        if (this.stared) sfx("cluck", { volume: 0.55, pitch: rand(0.95, 1.08) });
      }
    }
  }

  private walk(dt: number): void {
    // Startled: a hop on the spot before she runs for it.
    if (this.state === "flee" && this.t < 0.3) return;
    const speed = this.state === "flee" ? RUN : STROLL;
    const dx = this.tx - this.x;
    if (Math.abs(dx) > 0.5) this.face = dx > 0 ? 1 : -1;
    const step = speed * dt;
    if (Math.abs(dx) > step) {
      this.x += Math.sign(dx) * step;
      return;
    }
    this.x = this.tx;
    if (this.state === "out" || this.state === "flee") {
      this.dead = true;
      return;
    }
    this.state = "peck";
    this.t = 0;
    this.pause = rand(0.3, 0.8);
  }

  private peck(dt: number): void {
    if (this.burst > 0) {
      this.peckT += dt;
      if (this.peckT >= 0.26) {
        this.peckT = 0;
        this.burst--;
      }
      this.down = this.burst > 0 && this.peckT < 0.14;
      return;
    }
    this.down = false;
    this.pause -= dt;
    if (this.pause > 0) return;
    this.pause = rand(0.5, 1.4);
    if (chance(0.35)) sfx("cluck", { volume: 0.5, pitch: rand(0.95, 1.08) });
    // (Not while he's on his way over: she stays put, so he doesn't end up nose to beak with her.)
    if (!this.stared && chance(0.35)) {
      // A few steps somewhere else in her patch.
      const z = zone(this.g.layout, this.edge, this.laneY);
      const to = this.x + (chance(0.5) ? 1 : -1) * rand(6, 16);
      this.tx = Math.max(z.lo, Math.min(z.hi, to));
      if (Math.abs(this.tx - this.x) > 2) {
        this.state = "walk";
        this.t = 0;
        return;
      }
    }
    this.burst = 1 + Math.floor(Math.random() * 3);
    this.peckT = 0;
  }

  /** The frame to draw (the head-down one is drawn mirrored when she faces right). */
  private frameKey(): string {
    const walking = this.state === "in" || this.state === "walk" || this.state === "out" || (this.state === "flee" && this.t >= 0.3);
    if (walking) return (this.face > 0 ? HEN.right : HEN.left)[Math.floor(this.anim / (this.state === "flee" ? 0.07 : 0.14)) % 4]!;
    if (this.down) return HEN.peck;
    return (this.face > 0 ? HEN.right : HEN.left)[0]!;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.state === "wait") return;
    const x = Math.round(this.x);
    const y = Math.round(this.laneY);
    let lift = this.hopT > 0 ? Math.round(Math.sin(Math.PI * (1 - this.hopT / HOP)) * 3) : 0;
    // Running for it: a flappy little bounce.
    if (this.state === "flee" && this.t >= 0.3 && !reducedMotion) lift += Math.floor(this.anim / 0.07) % 2;
    drawShadow(ctx, x, y, 10);
    const key = this.frameKey();
    this.opts.flipX = key === HEN.peck && this.face > 0;
    draw(ctx, key, x - 8, y - 15 - lift, this.opts);
    this.emote.draw(ctx, x, y - 16 - lift);
  }

  hit(wx: number, wy: number): boolean {
    if (this.state === "wait") return false;
    return wx >= this.x - 7 && wx <= this.x + 7 && wy >= this.laneY - 14 && wy <= this.laneY + 2;
  }

  onTap(): void {
    sfx("cluck", { volume: 0.8, pitch: rand(1, 1.12) });
    this.hopT = HOP;
    if (this.state === "peck") {
      this.burst = 0;
      this.pause = 0.8;
    }
  }
}

export function initHen(g: Game): void {
  const force = params.has("hen");
  const forceRooster = params.get("hen") === "rooster";
  let hen: Hen | null = null;
  let rollIn = force ? 3 : 25;
  let open = 0;

  onTick(g, "hen", (dt) => {
    open += dt;
    if (hen?.dead) {
      hen = null;
      if (force) rollIn = 30;
    }
    if (hen) return;
    rollIn -= dt;
    if (rollIn > 0) return;
    rollIn = 20;
    if (!isReal(HEN.left[0]!)) return; // real frames only
    const key = dayKey(g.env.now);
    if (!force) {
      if (!henDay(key) || lsGet(DAY_KEY) === key || !henTime(g) || open < 20) return;
      if (!g.shown || document.hidden || isDialogOpen() || !chance(0.15)) return; // (once a day: not under the title screen)
      lsSet(DAY_KEY, key);
    }
    preloadSfx("cluck", "bawk", "rooster");
    // A lucky morning: the rooster first (and her a few seconds later).
    const rooster = forceRooster || (!force && g.env.hour < 9.5 && hash2(seedOf(key), 0x4e2, 0x500) < 0.5);
    const edges = lane(g.layout).edges;
    const want = params.get("hen") === "right" ? 1 : params.get("hen") === "left" ? -1 : 0;
    const edge = edges.find((e) => e === want) ?? edges[Math.floor(Math.random() * edges.length)] ?? -1;
    hen = addSafe(g, new Hen(g, edge, rooster ? 8 : 1.5, rooster, force), "hen");
  });

  onLayoutChange(g, "hen", () => {
    // A rotation: she's gone home (the yard's somewhere else now).
    if (hen) hen.dead = true;
    hen = null;
  });
}
