// Snickers: her grey Himalayan (he/him). A cloud of cream fur with a smoky blue-grey face, ears,
// paws and a huge plume of a tail, round blue eyes, and his signature tiny pink tongue that is
// ALWAYS sticking out (blep), even when he's asleep.
//
// He lives in the yard by the barn (never in the pasture, never hidden behind anything): wanders
// slowly between the doorstep, the barn wall, the gaps between the farm things and seats over the
// fence where he watches the sheep; sits and bleps, loafs, grooms, basks in his sunny spot on sunny
// days, naps on the barn doorstep, sleeps curled up there at night, and shelters by the barn wall
// when it rains.
//
// Tap his head (front half): a pet. Heart, happy squint, a meow and his name tag.
// Tap THE SPOT (his lower back / tail end): LICK FRENZY. Tongue flicking, head bobbing, mlems
// everywhere, and more taps make it worse. The very first time: "You found his lick button."
//
// Art: snickers-art.ts (hand-drawn data). Yard spots: snickers-spots.ts. DOM bits: snickers-ui.ts.

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { registerArt } from "../engine/sprites";
import { say, toast } from "../ui/dom";
import type { Layout, Point } from "../world/layout";
import { drawEmote, EMOTE_DURATION, type EmoteKind } from "./emotes";
import {
  buildAllParts,
  composite,
  drawLayers,
  FEET_ROW,
  HEAD_FRONT,
  HEAD_LOAF,
  HEAD_SIDE,
  HEAD_SLEEP,
  HEAD_WALK,
  opaqueAt,
  part,
  POSE_BOUNDS,
  WALK_LEGS,
  type Layer,
  type PartName,
  type PoseKind,
} from "./snickers-art";
import { computeYard, findSpot, pathTo, type Spot, type Yard } from "./snickers-spots";
import { nameTagVisible, positionTag, showNameTag, spawnMlem } from "./snickers-ui";

/** localStorage flag: has anyone ever found his lick button on this device? */
const FOUND_KEY = "farm.snickers.found";
/** Exactly this, the first time ever. */
export const LICK_BUTTON_LINE = "You found his lick button.";
const FRENZY_TOAST = "Snickers licks the air uncontrollably...";

type State = "sit" | "side" | "loaf" | "groom" | "nap" | "sleep" | "walk" | "pet" | "frenzy" | "watch";

const WALK_SPEED = 13; // game px per second: an unhurried cat stroll
const WALK_FRAME = 0.15;
const PET_TIME = 1.9;
const FRENZY_START = 2.5;
const FRENZY_EXTEND = 1.1;
const FRENZY_MAX = 6.5;
const MAX_LEVEL = 5;
/** Night falls for Snickers a bit after the farm starts getting dark; he wakes before dawn's done. */
const SLEEP_AT = 0.6;
const WAKE_AT = 0.45;

const MLEMS = ["mlem", "mlem", "mlem!", "blep", "mlem mlem", "mlem..."];
const BIG_MLEMS = ["MLEM", "mlem!!", "mlem mlem mlem", "blep!", "MLEM MLEM"];

const SHADOW_W: Record<PoseKind, number> = { front: 20, side: 22, walk: 22, loaf: 24, sleep: 24 };

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const chance = (p: number) => Math.random() < p;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const reducedMotion: boolean = (() => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
})();

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: he'll just be discovered again, which is fine
  }
}

/** A tiny tap of haptics where supported (Android). */
function buzz(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // no haptics
  }
}

// ---------- shadow ----------

const shadowCache = new Map<number, HTMLCanvasElement>();

/** Soft lavender ground shadow, `w` px wide, centered at (cx, cy). */
function drawShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
  let c = shadowCache.get(w);
  if (!c) {
    const h = Math.max(3, Math.round(w / 3));
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const sctx = c.getContext("2d");
    if (sctx) {
      sctx.fillStyle = "rgba(40,20,60,0.25)";
      const rx = w / 2;
      const ry = h / 2;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (x + 0.5 - rx) / rx;
          const dy = (y + 0.5 - ry) / ry;
          if (dx * dx + dy * dy <= 1) sctx.fillRect(x, y, 1, 1);
        }
      }
    }
    shadowCache.set(w, c);
  }
  ctx.drawImage(c, Math.round(cx - c.width / 2), Math.round(cy - c.height / 2));
}

// ---------- crash guard ----------

const reported = new Set<string>();
function report(where: string, err: unknown): void {
  if (reported.has(where)) return;
  reported.add(where);
  console.error(`[snickers] ${where} failed (skipping it, the farm keeps running)`, err);
}

// ---------- Snickers ----------

class Snickers implements Entity {
  x = 0;
  y = 0;
  layer = 1;

  private state: State = "nap";
  /** Seconds in the current state, and how long it should last. */
  private t = 0;
  private dur = 10;
  /** Side poses: 1 = facing right. */
  private facing: 1 | -1 = 1;
  /** Front poses: mirror him (tail on the left) now and then, for variety. */
  private frontFlip = false;
  /** Watching the flock from the side (landscape) instead of facing you (portrait). */
  private watchSide = false;

  private yard: Yard | null = null;
  private yardOf: Layout | null = null;
  /** The spot he's parked on (he follows it on resize), or null while walking / mid-path. */
  private spot: Spot | null = null;
  private targetId: string | null = null;
  private path: Point[] = [];

  private sleepy = false;
  private wet = false;
  /** A sunny day (and still daytime): his sunny spot is calling. */
  private sunny = false;

  private emote: { kind: EmoteKind; t: number } | null = null;
  private blinkIn = rand(2, 5);
  private blinkT = 0;
  private tailIn = rand(3, 7);
  private tailT = 0;
  private zzzIn = 3;
  private walkT = 0;

  /** Petted mid-loaf (or where sitting up won't fit): he stays loafed and just squints. */
  private petLoaf = false;
  /** A lick frenzy where sitting up won't fit: he licks away lying down. */
  private frenzyLoaf = false;
  /** Where to pick up after a pet or a frenzy. */
  private resumeState: "sleep" | "nap" | null = null;
  private resumeWalk: string | null = null;

  private frenzy = { left: 0, level: 1, flickT: 0, flick: 0, mlemIn: 0, side: 1 };
  private lastToast = -1e9;
  private foundThisSession = false;
  private placed = false;

  constructor(private readonly g: Game) {}

  // ---------- layout ----------

  private yardFor(l: Layout): Yard {
    if (!this.yard || this.yardOf !== l) {
      const yard = computeYard(l);
      this.yard = yard;
      this.yardOf = l;
      if (this.spot) {
        this.spot = findSpot(yard, this.spot.id) ?? yard.door;
        // Resized so that only loafing fits here now: settle down rather than cover the farm things.
        if (this.spot.low && (this.state === "sit" || this.state === "side" || this.state === "watch" || this.state === "groom")) this.set("loaf", rand(6, 12));
      } else if (this.placed && this.offYard(l)) {
        // Rotated mid-walk (or mid-fuss): don't stroll across the flock, just be where he was going.
        const s = findSpot(yard, this.state === "walk" ? this.targetId : this.resumeWalk) ?? yard.door;
        this.x = s.x;
        this.y = s.y;
      }
      if (this.state === "walk") {
        const s = findSpot(yard, this.targetId) ?? yard.door;
        this.targetId = s.id;
        this.path = pathTo(yard, this.x, this.y, s);
      }
    }
    return this.yard;
  }

  /** In the pasture or off screen (only possible right after a resize / rotation). */
  private offYard(l: Layout): boolean {
    const f = l.fence;
    if (this.x > f.x - 2 && this.x < f.x + f.w + 2 && this.y > f.y + 2 && this.y < f.y + f.h + 2) return true;
    return this.x < 8 || this.x > l.w - 8 || this.y < 20 || this.y > l.h - 4;
  }

  // ---------- state helpers ----------

  private set(state: State, dur = 0): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  private setSit(dur: number): void {
    this.frontFlip = chance(0.3);
    this.set("sit", dur);
  }

  private setSide(dur: number, l: Layout): void {
    // In landscape the flock is to the right; in portrait he just looks around.
    this.facing = !l.portrait ? 1 : chance(0.5) ? 1 : -1;
    this.set("side", dur);
  }

  private setWatch(spot: Spot, l: Layout): void {
    this.watchSide = !l.portrait && spot.face !== "front";
    this.facing = spot.face === "left" ? -1 : 1;
    this.frontFlip = chance(0.3);
    this.set("watch", rand(8, 16));
  }

  private walkTo(spot: Spot): void {
    const yard = this.yard;
    if (!yard) return;
    this.targetId = spot.id;
    this.path = pathTo(yard, this.x, this.y, spot);
    this.spot = null;
    this.walkT = 0;
    this.set("walk");
  }

  private showEmote(kind: EmoteKind): void {
    this.emote = { kind, t: 0 };
  }

  /** Only his low poses fit where he is: a low spot, or (mid-walk) under the farm things. */
  private lowHere(): boolean {
    if (this.spot) return !!this.spot.low;
    return !!this.yard && !this.yard.sitsUp(this.x, this.y);
  }

  /** Sit up, or loaf where sitting up won't fit. */
  private settle(dur: number): void {
    if (this.lowHere()) this.set("loaf", dur);
    else this.setSit(dur);
  }

  private atDoor(): boolean {
    return !!this.spot && !!this.yard && this.spot.id === this.yard.door.id;
  }

  private atShelter(): boolean {
    return !!this.spot && !!this.yard && (this.spot.id === this.yard.shelter.id || (this.spot.x === this.yard.shelter.x && this.spot.y === this.yard.shelter.y));
  }

  /** A random spot that isn't where he is (prefers a different kind of spot). */
  private otherSpot(yard: Yard): Spot | null {
    const here = this.spot?.id;
    const pool = yard.spots.filter((s) => s.id !== here && s.kind !== "shelter");
    if (!pool.length) return null;
    const fresh = pool.filter((s) => s.kind !== this.spot?.kind);
    const from = fresh.length && chance(0.7) ? fresh : pool;
    return from[Math.floor(Math.random() * from.length)] ?? null;
  }

  // ---------- update ----------

  update(dt: number, g: Game): void {
    const l = g.layout;
    const yard = this.yardFor(l);
    const dark = g.env.darkness;
    if (this.sleepy ? dark < WAKE_AT : dark > SLEEP_AT) this.sleepy = !this.sleepy;
    this.wet = g.env.weather === "rain" || g.env.weather === "storm";
    this.sunny = g.env.weather === "sunny" && dark < 0.3;

    if (!this.placed) {
      this.placed = true;
      const basking = this.sunny && !this.sleepy && yard.sun && chance(0.5);
      this.spot = this.sleepy ? yard.door : this.wet ? yard.shelter : basking && yard.sun ? yard.sun : yard.door;
      this.x = this.spot.x;
      this.y = this.spot.y;
      this.facing = chance(0.5) ? 1 : -1;
      if (this.sleepy) this.set("sleep");
      else this.set("nap", rand(8, 20));
    }

    this.t += dt;
    if (this.emote) {
      this.emote.t += dt;
      if (this.emote.t >= EMOTE_DURATION) this.emote = null;
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkIn = rand(2.2, 6);
      this.blinkT = 0.14;
    }
    this.tailT = Math.max(0, this.tailT - dt);
    this.tailIn -= dt;
    if (this.tailIn <= 0) {
      this.tailIn = rand(3.5, 8);
      this.tailT = 0.45;
    }

    switch (this.state) {
      case "sit":
      case "side":
      case "loaf":
      case "watch": {
        // Bedtime or rain: wrap up whatever he's doing and head for cover soon.
        const needsMove = (this.sleepy && !this.atDoor()) || (this.wet && !this.sleepy && !this.atShelter());
        if (needsMove) this.dur = Math.min(this.dur, this.t + 1.2);
        if (this.t > this.dur) this.next(yard, l);
        break;
      }
      case "groom":
        if (this.t > this.dur) this.setSit(rand(2.5, 5));
        break;
      case "nap":
      case "sleep":
        this.zzzIn -= dt;
        if (this.zzzIn <= 0) {
          this.zzzIn = rand(5, 9);
          if (!this.emote) this.showEmote("sleep");
        }
        if (this.state === "sleep") {
          if (!this.sleepy && this.t > 2) {
            this.showEmote("happy");
            this.settle(rand(3, 6));
          }
        } else if (this.t > this.dur) {
          if (this.sleepy && this.atDoor()) this.set("sleep");
          else this.next(yard, l);
        }
        break;
      case "pet":
        if (this.t > this.dur) this.resume(yard, l);
        break;
      case "frenzy":
        this.updateFrenzy(dt, g);
        break;
      case "walk":
        this.updateWalk(dt, yard, l);
        break;
    }

    // Parked: stay glued to the spot (it moves when the screen resizes or rotates).
    if (this.spot && this.state !== "walk") {
      this.x = this.spot.x;
      this.y = this.spot.y;
    }

    if (nameTagVisible()) {
      // Above the heart bubble, and it stays put after the bubble's gone.
      const a = this.headAnchor();
      positionTag(g, a.x, a.y - 18);
    }
  }

  /** Pick the next thing to do. */
  private next(yard: Yard, l: Layout): void {
    if (this.sleepy) {
      if (this.atDoor()) this.set("sleep");
      else this.walkTo(yard.door);
      return;
    }
    if (this.wet) {
      if (!this.atShelter()) {
        this.walkTo(yard.shelter);
        return;
      }
      const r = Math.random();
      if (this.spot?.low) this.set(r < 0.6 ? "loaf" : "nap", rand(10, 25));
      else if (r < 0.45) this.set("loaf", rand(10, 20));
      else if (r < 0.7) this.set("groom", rand(2.5, 4));
      else if (r < 0.85) this.set("nap", rand(15, 30));
      else this.setSit(rand(4, 8));
      return;
    }
    const r = Math.random();
    const here = this.spot;
    if (!here) {
      this.walkTo(yard.door);
      return;
    }
    // Sunny days: he keeps drifting back to the warm spot.
    const sun = this.sunny ? yard.sun : null;
    if (sun && here.id !== sun.id && r < 0.18) {
      this.walkTo(sun);
      return;
    }
    if (r < 0.3) {
      const s = this.otherSpot(yard);
      if (s) {
        this.walkTo(s);
        return;
      }
    }
    if (here.low) {
      // Only his low poses fit here (sitting up, he'd cover the farm things behind him).
      if (r < 0.75) this.set("loaf", rand(8, 16));
      else this.set("nap", rand(12, 25));
      return;
    }
    if (sun && here.id === sun.id) {
      // Basking.
      if (r < 0.6) this.set("loaf", rand(10, 20));
      else if (r < 0.85) this.set("nap", rand(15, 30));
      else this.setSit(rand(4, 8));
      return;
    }
    if (here.kind === "fence" && r < 0.55) this.setWatch(here, l);
    else if (r < 0.52) this.set("groom", rand(2.5, 4.5));
    else if (r < 0.68) this.set("loaf", rand(8, 16));
    else if (r < 0.8) this.setSide(rand(4, 8), l);
    else if (r < 0.9 && here.kind === "door") this.set("nap", rand(15, 35));
    else this.setSit(rand(4, 8));
  }

  /** Arrived at a spot: settle in. */
  private arrive(spot: Spot, yard: Yard, l: Layout): void {
    this.spot = spot;
    this.targetId = null;
    this.path = [];
    if (this.sleepy) {
      if (spot.id === yard.door.id) this.set("sleep");
      else this.walkTo(yard.door);
      return;
    }
    if (this.wet) {
      this.set("loaf", rand(10, 20));
      return;
    }
    if (spot.low || (this.sunny && spot.id === yard.sun?.id)) {
      if (chance(0.65)) this.set("loaf", rand(8, 18));
      else this.set("nap", rand(12, 25));
      return;
    }
    if (spot.kind === "fence") this.setWatch(spot, l);
    else if (spot.kind === "door") {
      if (chance(0.55)) this.set("nap", rand(12, 30));
      else this.set("loaf", rand(8, 16));
    } else this.setSit(rand(4, 8));
  }

  private updateWalk(dt: number, yard: Yard, l: Layout): void {
    this.walkT += dt;
    let budget = WALK_SPEED * dt;
    // (A loop so a short segment doesn't eat a whole frame's worth of walking.)
    for (let i = 0; i < 4 && budget > 0; i++) {
      const p = this.path[0];
      if (!p) {
        this.arrive(findSpot(yard, this.targetId) ?? yard.door, yard, l);
        return;
      }
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
      if (d <= budget) {
        this.x = p.x;
        this.y = p.y;
        budget -= d;
        this.path.shift();
        if (!this.path.length) {
          this.arrive(findSpot(yard, this.targetId) ?? yard.door, yard, l);
          return;
        }
      } else {
        this.x += (dx / d) * budget;
        this.y += (dy / d) * budget;
        budget = 0;
      }
    }
  }

  // ---------- petting & THE SPOT ----------

  /** Remember what he was up to, so he can go back to it after the fuss. */
  private interrupt(): void {
    if (this.state === "pet" || this.state === "frenzy") return;
    this.resumeState = this.state === "sleep" || this.state === "nap" ? this.state : null;
    if (this.state === "walk") {
      this.resumeWalk = this.targetId;
      this.path = [];
      this.spot = null;
    } else {
      this.resumeWalk = null;
    }
  }

  private resume(yard: Yard, l: Layout): void {
    if (this.resumeWalk) {
      const s = findSpot(yard, this.resumeWalk) ?? yard.door;
      this.resumeWalk = null;
      this.resumeState = null;
      this.walkTo(s);
      return;
    }
    if (!this.spot) {
      this.walkTo(yard.door);
      return;
    }
    const back = this.resumeState;
    this.resumeState = null;
    if (back && (this.sleepy || back === "nap")) {
      this.set(back, rand(12, 25));
      this.zzzIn = 2.5;
      return;
    }
    if (this.petLoaf || this.spot.low) {
      this.petLoaf = false;
      this.set("loaf", rand(6, 12));
      return;
    }
    if (this.spot.kind === "fence" && chance(0.5)) this.setWatch(this.spot, l);
    else this.setSit(rand(3, 6));
  }

  private pet(): void {
    const asleep = this.state === "sleep" || this.state === "nap";
    sfx("meow", asleep ? { volume: 0.45, pitch: 0.82 } : { pitch: rand(0.94, 1.12) });
    this.showEmote("heart");
    showNameTag();
    buzz(8);
    if (asleep) {
      // Still asleep, just purring a little louder.
      this.zzzIn = 2.2;
      const a = this.headAnchor();
      spawnMlem(this.g, a.x + (this.isFlipped() ? -13 : 13), a.y + 3, "purr...");
      return;
    }
    if (this.state === "frenzy") return; // he's busy (licking)
    const loafing = this.state === "loaf" || (this.state === "pet" && this.petLoaf) || this.lowHere();
    this.interrupt();
    this.petLoaf = loafing;
    this.set("pet", PET_TIME);
  }

  private lickButton(g: Game): void {
    const f = this.frenzy;
    buzz(12);
    if (this.state === "frenzy") {
      // Again! Longer, faster, bobbier.
      f.left = Math.min(FRENZY_MAX, f.left + FRENZY_EXTEND);
      f.level = Math.min(MAX_LEVEL, f.level + 1);
      this.mlem(g, f.level >= 3);
      return;
    }
    this.frenzyLoaf = this.lowHere();
    this.interrupt();
    this.petLoaf = false;
    this.set("frenzy");
    f.left = FRENZY_START;
    f.level = 1;
    f.flickT = 0;
    f.flick = 0;
    f.mlemIn = 0.18;
    this.lick();
    if (!this.foundThisSession && !lsGet(FOUND_KEY)) {
      this.foundThisSession = true;
      lsSet(FOUND_KEY, String(Date.now()));
      sfx("secret");
      // Let a few licks land first, then the big reveal.
      window.setTimeout(() => {
        say(LICK_BUTTON_LINE).catch(() => undefined);
      }, 700);
    } else {
      this.foundThisSession = true;
      if (g.time - this.lastToast > 45 && chance(0.3)) {
        this.lastToast = g.time;
        toast(FRENZY_TOAST, { icon: "snickers.icon" });
      }
    }
  }

  /** Seconds per tongue flick: ~5 a second, up to ~12 when he's really going. */
  private flickDur(): number {
    return clamp(0.2 / (1 + 0.32 * (this.frenzy.level - 1)), 0.075, 0.2);
  }

  private lick(): void {
    sfx("lick", { pitch: rand(0.82, 1.3) + 0.06 * (this.frenzy.level - 1), volume: rand(0.75, 1) });
  }

  private mlem(g: Game, big: boolean): void {
    const f = this.frenzy;
    f.side = -f.side;
    const flip = this.isFlipped() ? -1 : 1;
    const x = this.x + 0.5 + f.side * flip * rand(8, 13);
    const y = this.y - (this.frenzyLoaf ? 12 : 15) - rand(0, 7) - (big ? 3 : 0);
    const list = big ? BIG_MLEMS : MLEMS;
    spawnMlem(g, x, y, list[Math.floor(Math.random() * list.length)] ?? "mlem", big);
  }

  private updateFrenzy(dt: number, g: Game): void {
    const f = this.frenzy;
    f.left -= dt;
    const d = this.flickDur();
    f.flickT += dt;
    for (let i = 0; i < 3 && f.flickT >= d; i++) {
      f.flickT -= d;
      f.flick++;
      this.lick();
    }
    if (f.flickT >= d) f.flickT = 0;
    f.mlemIn -= dt;
    if (f.mlemIn <= 0) {
      const slow = reducedMotion ? 2 : 1;
      f.mlemIn = (rand(0.32, 0.55) * slow) / (1 + 0.25 * (f.level - 1));
      this.mlem(g, f.level >= 3 && chance(0.4));
    }
    if (f.left <= 0) {
      // All licked out: a blissful squint, then back to whatever he was doing.
      this.petLoaf = this.frenzyLoaf;
      this.set("pet", 0.9);
      if (f.level >= 3) {
        this.showEmote("happy");
        const a = this.headAnchor();
        spawnMlem(g, a.x + (this.isFlipped() ? -12 : 12), a.y + 6, "blep...");
      }
    }
  }

  // ---------- the barn door ----------

  /** A sheep is coming through the barn door: if he's on the doorstep, he notices. */
  onBarnDoor(): void {
    const yard = this.yard;
    if (!yard || !this.atDoor()) return;
    if (this.state === "frenzy" || this.state === "pet" || this.state === "walk") return;
    this.showEmote("exclaim");
    if (this.state === "sleep" || this.state === "nap") {
      // Woken up. He sits and stares at the sheep (or loafs, where sitting up won't fit), then dozes off again.
      if (this.spot?.low) this.set("loaf", rand(3, 5));
      else this.setSit(rand(3, 5));
      return;
    }
    if (!this.sleepy && !this.wet && chance(0.6)) {
      const s = this.otherSpot(yard);
      if (s) this.walkTo(s);
    }
  }

  /** Join a party (the farm's "baaaaah" easter egg): a happy little lick-fest. */
  party(): void {
    if (this.state === "frenzy") return;
    if (this.state === "sleep" || this.state === "nap") {
      this.showEmote("music");
      return;
    }
    this.frenzyLoaf = this.lowHere();
    this.interrupt();
    this.petLoaf = false;
    this.set("frenzy");
    const f = this.frenzy;
    f.left = 2;
    f.level = 2;
    f.flickT = 0;
    f.flick = 0;
    f.mlemIn = 0.2;
    this.showEmote("music");
  }

  // ---------- poses ----------

  private poseKind(): PoseKind {
    switch (this.state) {
      case "pet":
        return this.petLoaf ? "loaf" : "front";
      case "frenzy":
        return this.frenzyLoaf ? "loaf" : "front";
      case "sit":
      case "groom":
        return "front";
      case "watch":
        return this.watchSide ? "side" : "front";
      case "side":
        return "side";
      case "loaf":
        return "loaf";
      case "nap":
      case "sleep":
        return "sleep";
      case "walk":
        return "walk";
    }
  }

  private isFlipped(): boolean {
    const pose = this.poseKind();
    return pose === "front" || pose === "loaf" ? this.frontFlip : this.facing === -1;
  }

  /** Where an emote bubble's tail sits (just above his head). */
  private headAnchor(): Point {
    const dir = this.isFlipped() ? -1 : 1;
    const cx = this.x + 0.5;
    switch (this.poseKind()) {
      case "front":
        return { x: cx, y: this.y - (this.state === "frenzy" ? 26 : 23) };
      case "loaf":
        return { x: cx, y: this.y - 19 };
      case "side":
        return { x: cx + 5 * dir, y: this.y - 23 };
      case "walk":
        return { x: cx + 7 * dir, y: this.y - 20 };
      case "sleep":
        return { x: cx - 3 * dir, y: this.y - 16 };
    }
  }

  /** The front-facing sit, with an optional head (and head offset / whole-body hop). */
  private front(head: PartName, hdx = 0, hdy = 0, hop = 0): Layer[] {
    const flick = this.tailT > 0 ? 1 : 0;
    return [
      ["sitTail", flick, -flick + hop],
      ["sitBody", 0, hop],
      [head, HEAD_FRONT.dx + hdx, HEAD_FRONT.dy + hdy + hop],
    ];
  }

  private layers(): Layer[] {
    const blink = this.blinkT > 0;
    switch (this.state) {
      case "sit":
        return this.front(blink ? "headBlink" : "headFront");
      case "watch":
        return this.watchSide ? this.side(blink) : this.front(blink ? "headBlink" : "headFront");
      case "pet":
        if (this.petLoaf) {
          return [
            ["loafBody", 0, 0],
            ["headHappy", HEAD_LOAF.dx, HEAD_LOAF.dy],
            ["loafTail", this.tailT > 0 ? 1 : 0, 0],
          ];
        }
        return this.front("headHappy");
      case "frenzy": {
        const f = this.frenzy;
        const ph = clamp(f.flickT / this.flickDur(), 0, 1);
        const head: PartName = ph < 0.38 ? "headLickOut" : ph < 0.62 ? "headLickCurl" : "headLickIn";
        if (this.frenzyLoaf) {
          // No room to sit up here: he licks away loafed, nodding into his fluff (never up, so he
          // stays clear of the farm things) and swishing his tail.
          const nod = f.level >= 2 && ph > 0.3 && ph < 0.7 ? 1 : 0;
          return [
            ["loafBody", 0, 0],
            [head, HEAD_LOAF.dx, HEAD_LOAF.dy + nod],
            ["loafTail", Math.floor(this.t / 0.22) % 2, 0],
          ];
        }
        const amp = Math.min(3, 1 + (f.level - 1) * 0.5);
        const bob = -1 - Math.round(Math.sin(ph * Math.PI) * amp);
        const tilt = f.level >= 2 ? (f.flick % 2 ? -1 : 1) : 0;
        const hop = f.level >= 3 && ph < 0.3 ? -1 : 0;
        return this.front(head, tilt, bob, hop);
      }
      case "groom": {
        const lick = Math.floor(this.t / 0.32) % 2 === 0;
        const flick = this.tailT > 0 ? 1 : 0;
        return [
          ["sitTail", flick, -flick],
          ["groomBody", 0, 0],
          lick ? ["headGroom", HEAD_FRONT.dx, HEAD_FRONT.dy + 1] : ["headBlink", HEAD_FRONT.dx, HEAD_FRONT.dy],
          [lick ? "pawUp0" : "pawUp1", 0, 0],
        ];
      }
      case "side":
        return this.side(blink);
      case "loaf":
        return [
          ["loafBody", 0, 0],
          [blink ? "headBlink" : "headFront", HEAD_LOAF.dx, HEAD_LOAF.dy],
          ["loafTail", this.tailT > 0 ? 1 : 0, 0],
        ];
      case "nap":
      case "sleep": {
        // Slow breathing: the fluffy ball rises and falls.
        const breath = Math.floor(this.t / 1.6) % 2;
        return [
          ["sleepBody", 0, -breath],
          ["headSleep", HEAD_SLEEP.dx, HEAD_SLEEP.dy],
          ["sleepTail", 0, 0],
        ];
      }
      case "walk": {
        const i = Math.floor(this.walkT / WALK_FRAME) % 4;
        const bob = i % 2 ? -1 : 0;
        return [
          ["walkTail", i % 2 ? 1 : 0, bob],
          [WALK_LEGS[i] ?? "walkLegs0", 0, 0],
          ["walkBody", 0, bob],
          [blink ? "headSideBlink" : "headSide", HEAD_WALK.dx, HEAD_WALK.dy + bob],
        ];
      }
    }
  }

  private side(blink: boolean): Layer[] {
    const flick = this.tailT > 0 ? 1 : 0;
    return [
      ["sideTail", -flick, -flick],
      ["sideBody", 0, 0],
      [blink ? "headSideBlink" : "headSide", HEAD_SIDE.dx, HEAD_SIDE.dy],
    ];
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const pose = this.poseKind();
    const flip = this.isFlipped();
    drawShadow(ctx, x + 0.5, y, SHADOW_W[pose]);
    // Unflipped, column 15 of the frame is over his feet; mirrored, that's column 16.
    drawLayers(ctx, x - (flip ? 16 : 15), y - FEET_ROW, this.layers(), flip);
    if (this.emote) {
      const a = this.headAnchor();
      drawEmote(ctx, this.emote.kind, Math.round(a.x), Math.round(a.y), this.emote.t);
    }
  }

  // ---------- taps ----------

  /** Tight sprite box in world coords. */
  private box(): { l: number; t: number; r: number; b: number } {
    const b = POSE_BOUNDS[this.poseKind()];
    const flip = this.isFlipped();
    return {
      l: this.x + (flip ? -b.r : b.l),
      r: this.x + (flip ? -b.l : b.r),
      t: this.y + b.t,
      b: this.y + b.b,
    };
  }

  hit(wx: number, wy: number): boolean {
    const b = this.box();
    // Generous for thumbs: at least ~44 CSS px each way, centered on him...
    const min = clamp(Math.ceil(44 / Math.max(0.5, this.g.cssScale || 1)), 26, 40);
    const cx = (b.l + b.r) / 2;
    const cy = (b.t + b.b) / 2;
    const hw = Math.max((b.r - b.l) / 2 + 3, min / 2);
    const hh = Math.max((b.b - b.t) / 2 + 3, min / 2);
    if (wx < cx - hw || wx > cx + hw || wy < cy - hh || wy > cy + hh + 2) return false;
    // ...but where he overlaps the barn or a farm thing, only his actual pixels count (with a
    // pixel of slop), so taps meant for the barn door or the loom still reach them.
    for (const r of this.yard?.objects ?? []) {
      if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return this.onSprite(wx, wy, 1);
    }
    return true;
  }

  /** Is (wx, wy) on one of his drawn pixels (as of the current pose)? */
  private onSprite(wx: number, wy: number, slop: number): boolean {
    const flip = this.isFlipped();
    const left = Math.round(this.x) - (flip ? 16 : 15);
    const top = Math.round(this.y) - FEET_ROW;
    return opaqueAt(this.layers(), flip, wx - left, wy - top, slop);
  }

  /** Is (wx, wy) on THE SPOT (his rear end / lower back / tail) rather than his head? */
  private isSpot(wx: number, wy: number): boolean {
    const rel = (wx - this.x - 0.5) * (this.isFlipped() ? -1 : 1);
    const up = this.y - wy;
    switch (this.poseKind()) {
      case "front":
        // Head on top; the lower back and the tail plume (on his right) are the spot.
        return rel > 9 || up < 11;
      case "loaf":
        return (rel > 5 && up < 10) || up < 7;
      case "side":
      case "walk":
        // Facing right: the back half is the spot.
        return rel < 0;
      case "sleep":
        // Curled up with his head on the left: his back and tail base are the spot.
        return rel > 3;
    }
  }

  onTap(g: Game, wx: number, wy: number): void {
    if (this.isSpot(wx, wy)) this.lickButton(g);
    else this.pet();
  }
}

// ---------- boot ----------

let snickers: Snickers | null = null;

/** Wrap update/draw/hit/onTap in try/catch, so a bug here can never freeze the farm. */
function guard(s: Snickers): Entity {
  const e = s as Entity;
  const { update, draw, hit, onTap } = e;
  e.update = (dt, g) => {
    try {
      update?.call(s, dt, g);
    } catch (err) {
      report("update", err);
    }
  };
  e.draw = (ctx, g) => {
    try {
      draw.call(s, ctx, g);
    } catch (err) {
      report("draw", err);
    }
  };
  e.hit = (wx, wy) => {
    try {
      return hit?.call(s, wx, wy) ?? false;
    } catch (err) {
      report("hit", err);
      return false;
    }
  };
  e.onTap = (g, wx, wy) => {
    try {
      onTap?.call(s, g, wx, wy);
    } catch (err) {
      report("onTap", err);
    }
  };
  return e;
}

/** DOM-friendly art: "snickers.icon" (his face, 16x16) and "snickers.sit" (32x32). */
function registerIcons(): void {
  const head = part("headFront");
  if (head) {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    c.getContext("2d")?.drawImage(head, 0, 1);
    registerArt("snickers.icon", c);
  }
  registerArt(
    "snickers.sit",
    composite([
      ["sitTail", 0, 0],
      ["sitBody", 0, 0],
      ["headFront", HEAD_FRONT.dx, HEAD_FRONT.dy],
    ]),
  );
}

const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

/**
 * Snickers hears the farm's typed party secrets ("baaaaah", the Konami code) for himself, so he
 * joins in even though the party code lives elsewhere. (Calling snickersParty() twice is harmless.)
 */
function listenForParties(): void {
  let typed = "";
  const keys: string[] = [];
  let last = -Infinity;
  addEventListener("keydown", (ev) => {
    try {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const k = (ev.key ?? "").toLowerCase();
      keys.push(k);
      if (keys.length > KONAMI.length) keys.shift();
      if (k.length === 1) typed = (typed + k).slice(-12);
      const konami = keys.length === KONAMI.length && keys.every((v, i) => v === KONAMI[i]);
      const baa = /ba{4,}h$/.test(typed);
      if (!konami && !baa) return;
      keys.length = 0;
      typed = "";
      const now = performance.now();
      if (now - last < 1500) return;
      last = now;
      // A beat after the sheep start dancing.
      window.setTimeout(snickersParty, 350);
    } catch (err) {
      report("party keys", err);
    }
  });
}

export function initSnickers(g: Game): void {
  if (snickers) return;
  try {
    buildAllParts();
    registerIcons();
  } catch (err) {
    report("art", err);
  }
  const s = new Snickers(g);
  snickers = s;
  g.add(guard(s));
  g.on("barnDoor", () => {
    try {
      s.onBarnDoor();
    } catch (err) {
      report("barnDoor", err);
    }
  });
  listenForParties();
}

/** Where Snickers is (feet), e.g. for critters that want to keep their distance. */
export function snickersPosition(): Point | null {
  return snickers ? { x: snickers.x, y: snickers.y } : null;
}

/** Make Snickers join a farm party (lick-fest + music note). */
export function snickersParty(): void {
  try {
    snickers?.party();
  } catch (err) {
    report("party", err);
  }
}
