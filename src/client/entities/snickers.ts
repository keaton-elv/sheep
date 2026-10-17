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
// Tap his head (front half): a pet. Heart, happy squint, a "Mow" (never "meow") and his name tag.
// Tap THE SPOT (his lower back / tail end): LICK FRENZY. Tongue flicking, head bobbing, mlems
// everywhere, and more taps make it worse. The very first time: "You found his lick button."
//
// His Fancy Feast dish sits by the barn doorstep. Now and then he crouches over it and eats (nom
// nom, or crunch crunch when it's Whisker Lickins), says "Mow." and gives himself a wash. Tap the
// dish to fill it (or just to rattle it): he comes running, even out of a nap.
//
// Little scripted moments, all built from his existing parts:
//  - the morning coffee on a fence post (snickers-coffee.ts): he sits beside it, looks you dead in
//    the eye and swipes it off, three times
//  - the string from the chest (snickers-string.ts): closing the chest after poking it brings him
//    running to the yard in front of the chest and the mailbox, to stalk it and pounce on it a few
//    times, then loaf on top of it for a good while (then it gets yanked away)
//  - a fish a seagull dropped (critter-flyers.ts): free lunch, eaten where it landed
//  - the neighbor's hen (critter-hen.ts): he crouches low and stares her down until she leaves
//
// Art: snickers-art.ts (hand-drawn data). Yard spots: snickers-spots.ts. DOM bits: snickers-ui.ts.
// The dish: snickers-bowl.ts.

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { registerArt } from "../engine/sprites";
import { say, toast } from "../ui/dom";
import type { Layout, Point } from "../world/layout";
import { drawEmote, EMOTE_DURATION, type EmoteKind } from "./emotes";
import { initCoffee, type KnockHooks } from "./snickers-coffee";
import { StringToy } from "./snickers-string";
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
import { Bowl, registerBowlIcon, type Food } from "./snickers-bowl";
import { computeYard, findSpot, pathTo, type Spot, type Yard } from "./snickers-spots";
import { nameTagVisible, positionTag, showNameTag, spawnMlem } from "./snickers-ui";

/** localStorage flag: has anyone ever found his lick button on this device? */
const FOUND_KEY = "farm.snickers.found";
/** Exactly this, the first time ever. */
export const LICK_BUTTON_LINE = "You found his lick button.";
const FRENZY_TOASTS = ["Snickers licks the air uncontrollably...", "Snickers loves licking toes. The air will have to do..."];

/** Every few pets, a toast. He's a cat: short and dry. */
const PET_LINES = [
  "Mow.",
  "Mow. (He means salmon.)",
  "Papa Snickers allows it.",
  "Snickers is thinking about string again.",
  "Snickers misses his brother KitKat, way out in Arizona.",
  "His tongue is out. His tongue is always out.",
  "Snickers would lick your toes, if you'd let him.",
];
/** Pet mid-loaf, now and then. */
const LOAF_LINE = "Snickers is on minute 47 of his 1 hour of loafing.";
/** Pet him asleep a few times. */
const BLACK_HOLE_LINE = "Zzz... Snickers is doing his 3 hours in the black hole.";
/** What the name tag says, now and then, instead of his name. */
const TAG_MOW = "Mow!";
const TAG_PAPA = "Papa Snickers";

/** Tapping an empty dish fills it. */
const FILL_LINES: Record<Food, string> = {
  salmon: "Fancy Feast, salmon. In the good crystal.",
  treats: "Whisker Lickins! He heard the bag from across the farm.",
};
/** Tapping a full one. */
const FULL_LINES = [
  "He'd eat salmon for every meal.",
  "Whisker Lickins are a treat, not dinner. Snickers disagrees.",
];
/** Rattling a full dish: a joke now and then, not every tap. */
const FULL_TOAST_GAP = 12;
/** Tapping it while he's eating. */
const EATING_LINE = "Mow. (He's eating.)";
const NOMS: Record<Food, readonly string[]> = {
  salmon: ["nom", "nom nom", "nom...", "mrrf"],
  treats: ["crunch", "crunch crunch", "crunch!", "crunch"],
};

type State = "sit" | "side" | "loaf" | "groom" | "nap" | "sleep" | "walk" | "pet" | "frenzy" | "watch" | "eat" | "beg" | "knock" | "hunt" | "stare";

/** Knocking the coffee off the post: (up from his nap,) eye on the mug, then on you, then swipe, pause, swipe... */
type KnockPhase = "wake" | "eye" | "look" | "swipe" | "pause" | "after";
/**
 * The string: a long wiggly stalk, pounce, land (it whips out from under his paws), stalk again...
 * 4-6 times, then he lies on it for a good while. Then he gets up, steps off it and eyes it, and
 * just as he's about to go again it's yanked away.
 */
type HuntPhase = "crouch" | "pounce" | "land" | "on" | "up" | "look" | "gone";
/** The hen: (her clucking wakes him,) he spots her, crouches low and stares, holds it as she runs, watches her go. */
type StarePhase = "wake" | "notice" | "crouch" | "hold" | "watch";

interface Hunt {
  toy: StringToy;
  phase: HuntPhase;
  /** Where it was dropped (the middle of the stretch the whole act stays within), and his feet row there. */
  home: number;
  row: number;
  /**
   * Portrait: how far up he's drawn whenever he's on his feet there (leaping, stepping off it). The
   * row is a px or two below the yard strip, and his walking paws would dip behind the post caps.
   */
  lift: number;
  /** Pounces so far, and how many it takes to catch it. */
  n: number;
  of: number;
  /** A pounce (or stepping off it): from, to, and how high he leaps. */
  x0: number;
  x1: number;
  peak: number;
  mowed: boolean;
  mlemmed: boolean;
  purred: boolean;
  /** Lying on it: when he squints happily again, and how long he has left (to pick up after a pet). */
  squintAt: number;
  left: number;
}

/** How far either side of where the string lands it all happens (his feet): every pounce, skitter and step. */
const PLAY = 12;

/** What the hen needs from a stare-down (critter-hen.ts). */
export interface StareHooks {
  /** He's crouched and staring: she notices. */
  crouch(): void;
  /** He won: she bawks and runs. */
  win(): void;
  /** Is she still there to stare at? */
  alive(): boolean;
  /** He got distracted before it was over (a pet, a rotation). */
  off(): void;
}

const WALK_SPEED = 13; // game px per second: an unhurried cat stroll
const WALK_FRAME = 0.15;
/** Called to his dish: a trot. */
const HURRY = 2.2;
/** He won't wander over to eat again sooner than this (s), and the dish refills itself after a while. */
const MEAL_GAP = 240;
const REFILL_MIN = 180;
const REFILL_MAX = 360;
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
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
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
  private resumeState: "sleep" | "nap" | "eat" | null = null;
  private resumeWalk: string | null = null;

  private frenzy = { left: 0, level: 1, flickT: 0, flick: 0, mlemIn: 0, side: 1 };
  private lastToast = -1e9;
  private foundThisSession = false;
  private placed = false;

  /** His Fancy Feast dish (its own entity, placed with the yard). */
  readonly bowl: Bowl;
  /** When he last finished a meal (game seconds), and when the empty dish refills itself. */
  private lastMeal = -1e9;
  private refillAt = 0;
  /** Trotting over because someone rattled the dish. */
  private hurry = false;
  private nomIn = 0;
  private begMowed = false;
  private pets = 0;
  private sleepPets = 0;
  private lastPetToast = -1e9;
  private petDeck: string[] = [];
  private lastBowlToast = -1e9;
  private fullDeck: string[] = [];

  /** A one-off spot for a scripted moment (beside the mug, by the string, at a fish, near the hen). */
  private temp: Spot | null = null;
  /** Run on arriving there, instead of settling in. */
  private onArrive: (() => void) | null = null;
  /** Something that came up mid-fuss (the string, a fish, an interrupted pounce): once he's free. */
  private queued: (() => void) | null = null;
  /** Drawn this many px off the ground (a pounce). */
  private hopY = 0;
  /** A butt wiggle before he'd pounce (px). */
  private wiggle = 0;
  private knock: { mug: Point; seat: Spot; hooks: KnockHooks; phase: KnockPhase; swipes: number; hit: boolean } | null = null;
  private hunt: Hunt | null = null;
  /** Where the string lands in this yard (worked out once per yard). */
  private stringAt: { yard: Yard; at: Point } | null = null;
  private stare: { target: Point; hooks: StareHooks; phase: StarePhase; sits: boolean; forced: boolean } | null = null;
  /** A fish to eat (the gull dropped it), instead of what's in the dish. */
  private snack: { onEat: () => void; eaten: boolean } | null = null;

  constructor(private readonly g: Game) {
    this.bowl = new Bowl(g, {
      tap: () => this.onBowlTap(),
      onCat: (wx, wy) => this.onSprite(wx, wy, 0),
      eating: () => this.state === "eat",
    });
    // Usually there's dinner waiting; sometimes it's up to you two.
    if (chance(0.3)) {
      this.bowl.empty();
      this.refillAt = rand(60, 200);
    }
  }

  // ---------- layout ----------

  private yardFor(l: Layout): Yard {
    if (!this.yard || this.yardOf !== l) {
      const yard = computeYard(l);
      const old = this.yard;
      this.yard = yard;
      this.yardOf = l;
      this.bowl.place(yard.dish);
      // The yard really moved (a rotation, a new window size, not just the keyboard): whatever
      // scripted moment was going on is off (its spots are somewhere else now).
      if (old && (old.door.x !== yard.door.x || old.door.y !== yard.door.y || old.laneY !== yard.laneY || old.spineX !== yard.spineX)) {
        this.dropActs();
        this.temp = null;
        if (this.state === "knock" || this.state === "hunt" || this.state === "stare") this.set("loaf", rand(3, 6));
      }
      if (this.spot) {
        this.spot = this.find(yard, this.spot.id) ?? yard.door;
        // Resized so that only loafing fits here now: settle down rather than cover the farm things.
        if (this.spot.low && (this.state === "sit" || this.state === "side" || this.state === "watch" || this.state === "groom" || this.state === "beg")) this.set("loaf", rand(6, 12));
        // (And if the dish has nowhere to go any more, dinner's over.)
        if ((this.state === "eat" || this.state === "beg") && this.spot.id !== "eat") this.set("loaf", rand(4, 8));
      } else if (this.placed && this.offYard(l)) {
        // Rotated mid-walk (or mid-fuss): don't stroll across the flock, just be where he was going.
        const s = this.find(yard, this.state === "walk" ? this.targetId : this.resumeWalk) ?? yard.door;
        this.x = s.x;
        this.y = s.y;
      }
      if (this.state === "walk") {
        const s = this.find(yard, this.targetId) ?? yard.door;
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

  /** A yard spot by id (or the one-off spot of a scripted moment). */
  private find(yard: Yard, id: string | null): Spot | null {
    if (id && this.temp && id === this.temp.id) return this.temp;
    return findSpot(yard, id);
  }

  private walkTo(spot: Spot, hurry = false): void {
    const yard = this.yard;
    if (!yard) return;
    if (spot !== this.temp) this.temp = null;
    this.targetId = spot.id;
    this.path = pathTo(yard, this.x, this.y, spot);
    this.spot = null;
    this.walkT = 0;
    this.hurry = hurry;
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

    // Somebody tops up the dish now and then (nobody ever sees who).
    if (!this.bowl.full && this.state !== "eat" && g.time > this.refillAt) this.bowl.fill(chance(0.75) ? "salmon" : "treats");

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
      case "eat":
        this.updateMeal(dt, g);
        if (this.wet) this.dur = Math.min(this.dur, this.t + 1.2);
        if (this.t > this.dur) this.finishMeal(yard, l);
        break;
      case "beg":
        // Sitting by an empty dish, staring at whoever's nearest. Then, pointedly: "Mow."
        if (!this.begMowed && this.t > 1.4) {
          this.begMowed = true;
          sfx("meow", { volume: 0.7, pitch: rand(0.95, 1.08) });
          this.mow("Mow.");
        }
        if (this.bowl.full && this.t > 0.6) this.startMeal();
        else if (this.t > this.dur || this.sleepy || this.wet) this.next(yard, l);
        break;
      case "frenzy":
        this.updateFrenzy(dt, g);
        break;
      case "walk":
        this.updateWalk(dt, yard, l);
        break;
      case "knock":
        this.updateKnock(yard, l);
        break;
      case "hunt":
        this.updateHunt(dt, yard, l);
        break;
      case "stare":
        this.updateStare(yard, l);
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
    // Done with a one-off spot (by the mug, where the string was...): back to his usual haunts.
    if (here === this.temp) {
      this.walkTo(this.nearestSpot(yard));
      return;
    }
    // Dinner (likelier if he hasn't eaten yet). Or, if the dish is empty, a pointed sit beside it.
    const eat = yard.eat;
    const hungry = this.g.time - this.lastMeal > MEAL_GAP;
    if (eat && here.id !== eat.id && hungry && chance(!this.bowl.full ? 0.06 : this.lastMeal < 0 ? 0.3 : 0.12)) {
      this.walkTo(eat);
      return;
    }
    // Done at the dish: wander off.
    if (here.id === "eat" && chance(0.7)) {
      const s = this.otherSpot(yard);
      if (s) {
        this.walkTo(s);
        return;
      }
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
    const hurried = this.hurry;
    this.hurry = false;
    // Walked over for a scripted moment: on with it.
    const then = this.onArrive;
    if (then) {
      this.onArrive = null;
      then();
      return;
    }
    // At the fish (or his dish, with a fish waiting): lunch.
    if (this.snack && !this.wet && (spot.id === "eat" || spot === this.temp)) {
      this.startSnack();
      return;
    }
    // At the dish: dinner (he'll even get up for it at night), or a pointed stare at the empty dish.
    if (spot.id === "eat" && !this.wet && (this.bowl.full || !this.sleepy || hurried)) {
      this.startMeal();
      return;
    }
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
    this.walkT += dt * (this.hurry ? 1.6 : 1);
    let budget = WALK_SPEED * (this.hurry ? HURRY : 1) * dt;
    // (A loop so a short segment doesn't eat a whole frame's worth of walking.)
    for (let i = 0; i < 4 && budget > 0; i++) {
      const p = this.path[0];
      if (!p) {
        this.arrive(this.find(yard, this.targetId) ?? yard.door, yard, l);
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
          this.arrive(this.find(yard, this.targetId) ?? yard.door, yard, l);
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
    this.breakAct();
    this.resumeState = this.state === "sleep" || this.state === "nap" || this.state === "eat" ? this.state : null;
    if (this.state === "walk") {
      this.resumeWalk = this.targetId;
      this.path = [];
      this.spot = null;
    } else {
      this.resumeWalk = null;
    }
  }

  private resume(yard: Yard, l: Layout): void {
    // Something came up while he was busy being adored (the string, a fish, his pounce): that first.
    const q = this.queued;
    if (q) {
      this.queued = null;
      this.resumeWalk = null;
      this.resumeState = null;
      q();
      if (this.state !== "pet") return;
    }
    if (this.resumeWalk) {
      const s = this.find(yard, this.resumeWalk) ?? yard.door;
      this.resumeWalk = null;
      this.resumeState = null;
      this.walkTo(s, !!this.snack);
      return;
    }
    if (!this.spot) {
      this.walkTo(yard.door);
      return;
    }
    const back = this.resumeState;
    this.resumeState = null;
    if (back === "eat") {
      // Back to dinner (or the fish), if it's still there.
      if ((this.spot.id === "eat" || this.spot === this.temp) && (this.bowl.full || this.snack) && !this.wet) {
        this.set("eat", rand(3, 6));
        return;
      }
    } else if (back && (this.sleepy || back === "nap")) {
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
    buzz(8);
    if (asleep) {
      // Still asleep, just purring a little louder.
      showNameTag();
      this.zzzIn = 2.2;
      const a = this.headAnchor();
      spawnMlem(this.g, a.x + (this.isFlipped() ? -13 : 13), a.y + 3, "purr...");
      this.sleepPets++;
      if (this.sleepPets % 3 === 0 && this.g.time - this.lastPetToast > 25) {
        this.lastPetToast = this.g.time;
        toast(BLACK_HOLE_LINE, { icon: "snickers.icon" });
      }
      return;
    }
    this.pets++;
    if (this.pets % 4 === 0 && this.g.time - this.lastPetToast > 25) {
      this.lastPetToast = this.g.time;
      showNameTag();
      const midLoaf = this.state === "loaf" || (this.state === "pet" && this.petLoaf);
      toast(midLoaf && chance(0.5) ? LOAF_LINE : this.petLine(), { icon: "snickers.icon" });
    } else {
      const r = Math.random();
      showNameTag(r < 0.2 ? TAG_MOW : r < 0.3 ? TAG_PAPA : "Snickers");
    }
    if (this.state === "frenzy") return; // he's busy (licking)
    const loafing = this.state === "loaf" || this.state === "eat" || (this.state === "pet" && this.petLoaf) || this.lowHere() || this.crouching() || (this.state === "hunt" && this.poseKind() === "loaf");
    this.interrupt();
    this.petLoaf = loafing;
    this.set("pet", PET_TIME);
  }

  /** The next pet line (shuffled, no repeats until they've all come up). */
  private petLine(): string {
    if (!this.petDeck.length) this.petDeck = [...PET_LINES].sort(() => Math.random() - 0.5);
    return this.petDeck.pop() ?? "Mow.";
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
    // (Crouched over his dish, he licks away crouched.)
    this.frenzyLoaf = this.lowHere() || this.state === "eat" || this.crouching() || (this.state === "hunt" && this.poseKind() === "loaf");
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
        toast(pick(FRENZY_TOASTS), { icon: "snickers.icon" });
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

  // ---------- his dish ----------

  /** A little bubble from his mouth ("Mow.", "nom"). */
  private mow(text: string, big = false): void {
    const a = this.headAnchor();
    spawnMlem(this.g, a.x + (this.isFlipped() ? -12 : 12), a.y + 6, text, big);
  }

  /** Settled in at the dish: eat, or (if it's empty) sit and stare until something is done about it. */
  private startMeal(): void {
    this.hurry = false;
    if (!this.bowl.full && !this.snack) {
      this.showEmote("dots");
      this.begMowed = false;
      this.frontFlip = chance(0.3);
      // (Where sitting up won't fit, he makes his point lying down.)
      if (this.lowHere()) this.set("loaf", rand(5, 8));
      else this.set("beg", rand(5, 8));
      return;
    }
    this.set("eat", rand(6, 10));
    this.nomIn = rand(0.7, 1.1);
  }

  /** Mid-meal, he lifts his head out of the dish to chew for a moment. */
  private lookingUp(): boolean {
    return this.state === "eat" && this.t % 2.6 > 1.95;
  }

  private updateMeal(dt: number, g: Game): void {
    this.nomIn -= dt;
    if (this.nomIn > 0) return;
    this.nomIn = rand(1.3, 2.2) * (reducedMotion ? 1.6 : 1);
    if (!this.lookingUp()) {
      const f = this.frenzy;
      f.side = -f.side;
      const x = this.x + 0.5 + f.side * rand(8, 12);
      spawnMlem(g, x, this.y - 13 - rand(0, 4), pick(NOMS[this.snack ? "salmon" : this.bowl.food]));
      // The first nom of the fish: gone.
      const s = this.snack;
      if (s && !s.eaten) {
        s.eaten = true;
        s.onEat();
      }
    }
  }

  private finishMeal(yard: Yard, l: Layout): void {
    if (this.snack) {
      // The fish (the dish stays as it was).
      this.snack = null;
      this.showEmote("heart");
    } else {
      this.bowl.empty();
      this.refillAt = this.g.time + rand(REFILL_MIN, REFILL_MAX);
    }
    this.lastMeal = this.g.time;
    sfx("meow", { volume: 0.55, pitch: rand(0.9, 1) });
    this.mow("Mow.");
    // Then a wash, as is only proper (sitting up, where he fits).
    if (!this.wet && !this.sleepy && !this.lowHere()) {
      this.frontFlip = chance(0.3);
      this.set("groom", rand(2.5, 4));
    } else this.next(yard, l);
  }

  /** The dish was tapped: fill it (or rattle it), and he comes running. */
  private onBowlTap(): void {
    const g = this.g;
    const b = this.bowl;
    const eating = this.state === "eat";
    let line: string | null = null;
    if (!b.full) {
      // Filling it always says so.
      const food: Food = chance(0.7) ? "salmon" : "treats";
      b.fill(food);
      sfx("pop");
      line = FILL_LINES[food];
    } else if (g.time - this.lastBowlToast > FULL_TOAST_GAP) {
      // Rattling a full one: a joke now and then, not every tap.
      if (eating) line = EATING_LINE;
      else {
        if (!this.fullDeck.length) this.fullDeck = [...FULL_LINES].sort(() => Math.random() - 0.5);
        line = this.fullDeck.pop() ?? "Mow.";
      }
    }
    buzz(6);
    if (line) {
      this.lastBowlToast = g.time;
      toast(line, { icon: "snickers.bowl" });
    }
    if (!eating) this.callToDish();
  }

  /** Someone rattled the dish. He's on his way (unless it's raining, or he's mid-fuss). */
  private callToDish(): void {
    const eat = this.yard?.eat;
    if (!eat || !this.bowl.full || this.wet) return;
    if (this.state === "frenzy" || this.state === "pet" || this.busy()) return;
    if (this.spot?.id === eat.id) {
      if (this.state !== "eat") this.startMeal();
      return;
    }
    if (this.state === "walk" && this.targetId === eat.id) {
      this.hurry = true;
      return;
    }
    this.showEmote("exclaim");
    sfx("meow", { pitch: rand(1.04, 1.18), volume: 0.8 });
    this.mow("Mow!");
    this.walkTo(eat, true);
  }

  // ---------- the barn door ----------

  /** A sheep is coming through the barn door: if he's on the doorstep, he notices. */
  onBarnDoor(): void {
    const yard = this.yard;
    if (!yard || !this.atDoor()) return;
    if (this.state === "frenzy" || this.state === "pet" || this.state === "walk" || this.busy()) return;
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
    // Asleep, or eating: he's not getting up for a party.
    if (this.state === "sleep" || this.state === "nap" || this.state === "eat") {
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

  // ---------- little scripted moments ----------

  /** In the middle of one of his moments (or on his way to one, or to a fish). */
  private busy(): boolean {
    return !!(this.knock || this.hunt || this.stare || this.onArrive || this.snack);
  }

  /**
   * Up for something: awake, dry, not mid-fuss, mid-walk or mid-meal. (A nap, if `napOk`: he gets up.
   * Asleep for the night, if `forced`: a debug flag wants the whole moment, any hour.)
   */
  private free(napOk: boolean, forced = false): boolean {
    if (!this.placed || (this.sleepy && !forced) || this.wet || this.busy()) return false;
    switch (this.state) {
      case "sit":
      case "side":
      case "loaf":
      case "groom":
      case "watch":
      case "beg":
        return true;
      case "nap":
        return napOk || forced;
      case "sleep":
        return forced;
      default:
        return false;
    }
  }

  /** Call off every moment for good (the yard moved under him). */
  private dropActs(): void {
    this.knock?.hooks.cancel();
    this.knock = null;
    this.stare?.hooks.off();
    this.stare = null;
    if (this.hunt) this.hunt.toy.dead = true;
    this.hunt = null;
    this.snack = null;
    this.queued = null;
    this.onArrive = null;
    this.hopY = 0;
    this.wiggle = 0;
  }

  /** Petted (or lick-buttoned) mid-moment: the mug and the hen are let off; the string he'll get back to. */
  private breakAct(): void {
    if (this.knock) {
      this.knock.hooks.cancel();
      this.knock = null;
    }
    this.stare?.hooks.off();
    this.stare = null;
    if (this.hunt) this.queued = () => this.resumeHunt();
    this.onArrive = null;
    this.hopY = 0;
    this.wiggle = 0;
  }

  /** Make where he is now a (one-off) spot, so he stays put there for a bit. */
  private parkHere(yard: Yard, id: string): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    this.temp = { id, kind: "yard", x, y, face: "front", low: !yard.sitsUp(x, y) };
    this.spot = this.temp;
  }

  /** The closest of his usual spots. */
  private nearestSpot(yard: Yard): Spot {
    let best = yard.door;
    let bd = Infinity;
    for (const s of yard.spots) {
      const d = Math.hypot(s.x - this.x, s.y - this.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** The yard as it is right now (for the mug). */
  currentYard(): Yard {
    return this.yardFor(this.g.layout);
  }

  // The coffee mug on the fence post.

  /**
   * Asked to see to the mug: walk over to `seat` beside it (up from a nap first). False if he's not
   * up for it right now. `forced` (?coffee): even out of his night's sleep.
   */
  knockMug(mug: Point, seat: Point, hooks: KnockHooks, forced = false): boolean {
    if (!this.yard || !this.free(true, forced)) return false;
    const spot: Spot = { id: "mug", kind: "fence", x: Math.round(seat.x), y: Math.round(seat.y), face: "front" };
    const dozing = this.state === "nap" || this.state === "sleep";
    this.knock = { mug, seat: spot, hooks, phase: dozing ? "wake" : "eye", swipes: 0, hit: false };
    // Dozing: his head comes up first (he's noticed), then he gets up and strolls over.
    if (dozing) this.set("knock", rand(1, 1.4));
    else this.goKnock();
    return true;
  }

  private goKnock(): void {
    const k = this.knock;
    if (!k) return;
    this.temp = k.seat;
    this.onArrive = () => this.startKnock();
    this.walkTo(k.seat);
  }

  private startKnock(): void {
    const k = this.knock;
    if (!k) return this.settle(rand(3, 6));
    const dir = k.mug.x > this.x ? 1 : -1;
    this.facing = dir;
    // (His swiping paw is on the left of the front pose: mirror the lot when the mug's on his right.)
    this.frontFlip = dir > 0;
    k.phase = "eye";
    this.set("knock", 1.5);
  }

  private updateKnock(yard: Yard, l: Layout): void {
    const k = this.knock;
    if (!k || this.wet) {
      k?.hooks.cancel();
      this.knock = null;
      this.next(yard, l);
      return;
    }
    switch (k.phase) {
      case "wake":
        if (this.t > this.dur) this.goKnock();
        break;
      case "eye":
        // Considering the mug. Then: you.
        if (this.t > this.dur) {
          k.phase = "look";
          this.t = 0;
          this.dur = 1.2;
        }
        break;
      case "look":
      case "pause":
        if (this.t > this.dur) {
          k.phase = "swipe";
          k.hit = false;
          this.t = 0;
          this.dur = 0.5;
        }
        break;
      case "swipe":
        // Paw up, then out: that's when it connects. The third one does it.
        if (!k.hit && this.t >= 0.25) {
          k.hit = true;
          k.swipes++;
          if (k.swipes >= 3) k.hooks.tip();
          else k.hooks.nudge();
        }
        if (this.t > this.dur) {
          k.phase = k.swipes >= 3 ? "after" : "pause";
          this.t = 0;
          this.dur = k.swipes >= 3 ? 1.3 : 0.8;
        }
        break;
      case "after":
        // Still looking at you. Then a wash, as if nothing happened.
        if (this.t > this.dur) {
          this.knock = null;
          this.set("groom", 3);
        }
        break;
    }
  }

  // The string from the chest.

  /** Somebody poked the string in the chest and closed it: he heard. */
  onString(): void {
    if (this.hunt) return;
    if (this.state === "frenzy" || this.state === "pet") {
      this.queued = () => this.startString();
      return;
    }
    this.startString();
  }

  private startString(): void {
    const yard = this.yard;
    if (!yard || this.hunt) return;
    this.showEmote("exclaim");
    sfx("meow", { pitch: 1.1 });
    this.mow("Mow!");
    // Sheltering from the rain: ears up, but he's staying dry.
    if (this.wet) return;
    // The string beats everything (even a mug, a hen or a fish).
    this.knock?.hooks.cancel();
    this.knock = null;
    this.stare?.hooks.off();
    this.stare = null;
    this.snack = null;
    this.onArrive = null;
    this.hopY = 0;
    this.wiggle = 0;
    const at = this.stringSpot(yard);
    const toy = new StringToy(at.x, at.y);
    this.g.add(guard(toy, "string"));
    const h: Hunt = {
      toy,
      phase: "crouch",
      home: at.x,
      row: at.y,
      lift: yard.laneY !== null ? Math.max(0, at.y - yard.laneY) : 0,
      n: 0,
      of: 4 + Math.floor(Math.random() * 3),
      x0: 0,
      x1: 0,
      peak: 5,
      mowed: false,
      mlemmed: false,
      purred: false,
      squintAt: 0,
      left: 0,
    };
    this.hunt = h;
    this.goToString(yard, h);
  }

  /** Where the string lands in this yard. */
  private stringSpot(yard: Yard): Point {
    const c = this.stringAt;
    if (c && c.yard === yard) return c.at;
    const at = stringSpot(yard, this.yardOf ?? this.g.layout);
    this.stringAt = { yard, at };
    return at;
  }

  /** Trot over to the string: a pounce's length short of it, on whichever side he's coming from. */
  private goToString(yard: Yard, h: Hunt): void {
    // (In landscape he comes down the gap between the farm things, so that's the side he arrives on.)
    const from = yard.spineX !== null && Math.abs(this.y - h.row) > 2 ? yard.spineX : this.x;
    const dir = h.home >= from ? 1 : -1;
    this.temp = { id: "string", kind: "yard", x: h.home - dir * PLAY, y: h.row, face: "front", low: true };
    this.onArrive = () => this.huntCrouch(true);
    this.walkTo(this.temp, true);
  }

  /** Back to it after a pet, wherever he'd got to. */
  private resumeHunt(): void {
    const h = this.hunt;
    const yard = this.yard;
    if (!h || !yard) return;
    if (h.toy.dead || h.phase === "gone") return this.endHunt(yard);
    switch (h.phase) {
      case "on":
        // Still lying on it (the rest of his loaf).
        this.set("hunt", Math.max(4, h.left));
        return;
      case "up":
        this.stepOff(h, h.x1);
        return;
      case "look":
        this.huntLook(rand(1.6, 2.4));
        return;
      default:
        // Mid-hunt: back to stalking it right where he is (anywhere he plays, it's within a pounce),
        // or over to it again if he never got there.
        if (Math.abs(this.x - h.home) > PLAY || Math.round(this.y) !== h.row) this.goToString(yard, h);
        else this.huntCrouch();
    }
  }

  /** Crouched low, eyes locked on it, working up to a pounce (the first stalk is the longest). */
  private huntCrouch(first = false): void {
    const h = this.hunt;
    if (!h || h.toy.dead) {
      this.hunt = null;
      this.settle(rand(3, 6));
      return;
    }
    // Off his spot from here on: he goes wherever the string does.
    this.spot = null;
    this.facing = h.toy.at >= this.x ? 1 : -1;
    h.phase = "crouch";
    this.set("hunt", first ? rand(2.1, 2.7) : rand(1.4, 2));
  }

  /** Off the string at last: he gets up and steps over to `to` (then turns round to eye it). */
  private stepOff(h: Hunt, to: number): void {
    this.spot = null;
    h.phase = "up";
    h.x0 = this.x;
    h.x1 = to;
    this.facing = to >= this.x ? 1 : -1;
    this.walkT = 0;
    this.set("hunt", Math.max(0.2, Math.abs(to - this.x) / WALK_SPEED));
  }

  /** Eyeing the string, which is still twitching away. */
  private huntLook(dur: number): void {
    const h = this.hunt;
    if (!h) return;
    this.spot = null;
    this.facing = h.toy.at >= this.x ? 1 : -1;
    h.phase = "look";
    this.hopY = 0;
    this.set("hunt", dur);
  }

  private updateHunt(dt: number, yard: Yard, l: Layout): void {
    const h = this.hunt;
    if (!h || (h.toy.dead && h.phase !== "gone")) {
      this.endHunt(yard);
      return;
    }
    // Rain: it's only string. Off to his dry spot (and somebody reels it in).
    if (this.wet && h.phase !== "pounce") {
      h.toy.yank(h.toy.at >= this.x ? 16 : -16);
      this.hunt = null;
      this.hopY = 0;
      this.wiggle = 0;
      this.next(yard, l);
      return;
    }
    const toy = h.toy;
    switch (h.phase) {
      case "crouch":
      case "land":
      case "look": {
        // Eyes on it. (Working up to a pounce: a wiggle of the hindquarters, slow, then quick.)
        if (Math.abs(toy.at - this.x) > 1) this.facing = toy.at > this.x ? 1 : -1;
        const left = this.dur - this.t;
        this.wiggle = h.phase !== "land" && !reducedMotion && left < 0.85 ? Math.floor(this.t / (left < 0.4 ? 0.07 : 0.13)) % 2 : 0;
        if (this.t <= this.dur) break;
        this.wiggle = 0;
        if (h.phase === "land") {
          h.phase = "crouch";
          this.t = 0;
          this.dur = rand(1.4, 2);
          break;
        }
        if (h.phase === "look") {
          // Just as he's about to go again: whoever's on the other end yanks it away. Gone.
          toy.yank((toy.at >= this.x ? 1 : -1) * 16);
          sfx("rustle", { volume: 0.3, pitch: 1.6 });
          this.showEmote("question");
          h.phase = "gone";
          this.t = 0;
          this.dur = 1.6;
          break;
        }
        h.phase = "pounce";
        h.x0 = this.x;
        h.x1 = toy.at;
        // (A longer leap goes a little higher.)
        h.peak = 4 + Math.min(2, Math.abs(h.x1 - h.x0) / 6);
        this.t = 0;
        this.dur = 0.36;
        break;
      }
      case "pounce": {
        const k = Math.min(1, this.t / this.dur);
        this.x = h.x0 + (h.x1 - h.x0) * k;
        this.hopY = -Math.max(h.lift, Math.round(4 * h.peak * k * (1 - k)));
        if (k < 1) break;
        this.hopY = 0;
        h.n++;
        sfx("rustle", { volume: 0.3, pitch: 1.4 });
        if (h.n < h.of) {
          // It whips out from under his paws, round behind him (never far from where it fell): he
          // spins after it.
          const side = this.x > h.home ? 1 : this.x < h.home ? -1 : this.facing;
          toy.skitterTo(h.home - side * rand(5, 8));
          h.phase = "land";
          this.t = 0;
          this.dur = rand(0.35, 0.55);
          break;
        }
        // Got it. Now he lies on it (for a good while).
        h.phase = "on";
        this.t = 0;
        this.dur = rand(20, 30);
        h.left = this.dur;
        h.squintAt = rand(9, 14);
        this.frontFlip = chance(0.3);
        toy.tuck(this.x, chance(0.5) ? 1 : -1);
        this.showEmote("heart");
        break;
      }
      case "on":
        if (!h.mowed && this.t > 0.9) {
          h.mowed = true;
          sfx("meow", { volume: 0.6, pitch: rand(0.95, 1.05) });
          this.mow("Mow.");
        }
        if (!h.mlemmed && this.t > 3.4) {
          h.mlemmed = true;
          const a = this.headAnchor();
          spawnMlem(this.g, a.x + (this.isFlipped() ? 12 : -12), a.y + 5, "mlem");
        }
        if (!h.purred && this.t > h.squintAt) {
          h.purred = true;
          const a = this.headAnchor();
          spawnMlem(this.g, a.x + (this.isFlipped() ? -13 : 13), a.y + 3, "purr...");
        }
        toy.catX = this.x;
        h.left = this.dur - this.t;
        if (this.t > this.dur) {
          // Up he gets: off it, over to the other side, and it's out in the open again.
          toy.tucked = 0;
          const side = this.x >= h.home ? -1 : 1;
          this.stepOff(h, clamp(this.x + side * 14, h.home - PLAY, h.home + PLAY));
        }
        break;
      case "up": {
        this.walkT += dt;
        const k = Math.min(1, this.t / this.dur);
        this.x = h.x0 + (h.x1 - h.x0) * k;
        this.hopY = -h.lift;
        if (k >= 1) this.huntLook(rand(2.8, 3.8));
        break;
      }
      case "gone":
        // Still staring at where it was.
        if (this.t > this.dur) this.endHunt(yard);
        break;
    }
  }

  /** It's over: as if nothing happened. */
  private endHunt(yard: Yard): void {
    if (this.hunt) this.hunt.toy.dead = true;
    this.hunt = null;
    this.hopY = 0;
    this.wiggle = 0;
    this.parkHere(yard, "string");
    if (!this.lowHere()) {
      this.frontFlip = chance(0.3);
      this.set("groom", rand(2.5, 3.5));
    } else this.set("loaf", rand(3, 6));
  }

  // The neighbor's hen.

  /**
   * The neighbor's hen wandered into the yard, clucking. Oh, it's on (even out of a nap, from across
   * the yard). `forced` (?hen): even out of his night's sleep.
   */
  stareDown(hen: Point, hooks: StareHooks, forced = false): boolean {
    const yard = this.yard;
    if (!yard || this.busy() || (this.sleepy && !forced) || this.wet) return false;
    if (!this.free(true, forced) && this.state !== "walk") return false;
    const dx = hen.x - this.x;
    const dozing = this.state === "nap" || this.state === "sleep";
    if (this.state === "walk") {
      // Stopped mid-stroll.
      this.path = [];
      this.targetId = null;
      this.hurry = false;
      this.spot = null;
    }
    this.facing = dx >= 0 ? 1 : -1;
    this.showEmote("exclaim");
    // Napping: ears up, a look her way (still lying down), then he's up.
    this.stare = { target: hen, hooks, phase: dozing ? "wake" : "notice", sits: !this.lowHere(), forced };
    this.set("stare", dozing ? rand(0.8, 1.1) : 0.8);
    return true;
  }

  /** Creep closer (if she's a way off: a trot first, from across the yard), then crouch. */
  private stalk(yard: Yard): void {
    const s = this.stare;
    if (!s) return;
    const dx = s.target.x - this.x;
    const far = Math.hypot(dx, s.target.y - this.y);
    if (Math.abs(dx) > 52 || far > 60) {
      const near = dx > 0 ? -1 : 1; // (stays on his side of her, if there's room)
      const lane = yard.laneY ?? yard.door.y;
      const dish = yard.dish;
      for (const side of [near, -near]) {
        for (const d of [36, 42, 30, 48, 54, 24, 60]) {
          const x = Math.round(s.target.x + side * d);
          // (Not on top of his dish.)
          if (dish && Math.abs(x - dish.x) < 14 && Math.abs(lane - dish.y) < 8) continue;
          // (On the strip, or a row back where the fence posts' caps don't get in the way.)
          const y = yard.loafs(x, lane) ? lane : yard.loafs(x, lane - 1) ? lane - 1 : NaN;
          if (!Number.isFinite(y)) continue;
          this.temp = { id: "stalk", kind: "yard", x, y, face: "front", low: !yard.sitsUp(x, y) };
          this.onArrive = () => this.stareCrouch();
          this.walkTo(this.temp, far > 90);
          return;
        }
      }
    }
    this.stareCrouch();
  }

  private stareCrouch(): void {
    const s = this.stare;
    const yard = this.yard;
    if (!s || !yard) return this.settle(rand(3, 6));
    // She left while he was creeping up on her.
    if (!s.hooks.alive()) return this.endStare(yard);
    this.facing = s.target.x >= this.x ? 1 : -1;
    s.phase = "crouch";
    this.set("stare", rand(2.4, 3.2));
    s.hooks.crouch();
  }

  private updateStare(yard: Yard, l: Layout): void {
    const s = this.stare;
    if (!s || this.wet || (this.sleepy && !s.forced)) {
      s?.hooks.off();
      this.stare = null;
      this.wiggle = 0;
      this.next(yard, l);
      return;
    }
    switch (s.phase) {
      case "wake":
        if (!s.hooks.alive()) return this.endStare(yard);
        if (this.t > this.dur) {
          // Up (sitting, where he fits), eyes on her.
          s.phase = "notice";
          s.sits = !this.lowHere();
          this.t = 0;
          this.dur = 0.7;
        }
        break;
      case "notice":
        if (!s.hooks.alive()) return this.endStare(yard);
        if (this.t > this.dur) this.stalk(yard);
        break;
      case "crouch":
        if (!s.hooks.alive()) return this.endStare(yard);
        this.facing = s.target.x >= this.x ? 1 : -1;
        // Unblinking. The tail tip going. A wiggle of the hindquarters at the end (he never
        // actually pounces: the stare does it).
        this.wiggle = !reducedMotion && this.t > this.dur - 0.6 ? Math.floor(this.t / 0.09) % 2 : 0;
        if (this.t > this.dur) {
          this.wiggle = 0;
          s.hooks.win();
          s.phase = "hold";
          this.t = 0;
          this.dur = 0.7;
        }
        break;
      case "hold":
        if (this.t > this.dur) {
          s.phase = "watch";
          s.sits = yard.sitsUp(this.x, this.y);
          this.t = 0;
          this.dur = 1.4;
        }
        break;
      case "watch":
        if (this.t > this.dur) this.endStare(yard);
        break;
    }
  }

  /** As if nothing happened. */
  private endStare(yard: Yard): void {
    this.stare = null;
    this.wiggle = 0;
    if (!this.spot) this.parkHere(yard, "stalk");
    if (!this.lowHere()) {
      this.frontFlip = chance(0.3);
      this.set("groom", rand(2.5, 3.5));
    } else this.set("loaf", rand(4, 8));
  }

  // A fish from the sky.

  /** A fish just landed by his dish (thanks, gull): he's on his way. False if he can't come. */
  snackOn(onEat: () => void, at: Point | null): boolean {
    if (!this.yard?.eat || this.wet || this.knock || this.hunt || this.stare || this.snack) return false;
    this.snack = { onEat, eaten: false };
    if (this.state === "frenzy" || this.state === "pet") this.queued = () => this.goSnack(at);
    else this.goSnack(at);
    return true;
  }

  private goSnack(at: Point | null): void {
    const yard = this.yard;
    const eat = yard?.eat;
    if (!yard || !eat || !this.snack) return;
    // Already crouched at his dish: the fish is next.
    if (this.state === "eat") return;
    this.showEmote("exclaim");
    sfx("meow", { pitch: rand(1.04, 1.18), volume: 0.8 });
    // Right where it landed (face over the fish), if he fits there; else at his dish.
    const x = at ? Math.round(at.x) - 1 : NaN;
    let there = eat;
    if (at && yard.loafs(x, eat.y)) there = this.temp = { id: "snack", kind: "yard", x, y: eat.y, face: "front", low: !yard.sitsUp(x, eat.y) };
    this.walkTo(there, true);
  }

  private startSnack(): void {
    this.set("eat", rand(4, 6));
    this.nomIn = rand(0.7, 1.1);
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
      case "beg":
        return "front";
      case "eat":
        return "loaf";
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
      case "knock":
        return this.knock?.phase === "eye" ? "side" : this.knock?.phase === "wake" ? "loaf" : "front";
      case "hunt":
        return this.hunt?.phase === "pounce" || this.hunt?.phase === "up" ? "walk" : "loaf";
      case "stare": {
        const s = this.stare;
        return s && s.sits && (s.phase === "notice" || s.phase === "watch") ? "side" : "loaf";
      }
    }
  }

  /** Crouched low and side-on (his loaf with a side head), eyes locked on something. */
  private crouching(): boolean {
    if (this.state === "hunt") {
      const p = this.hunt?.phase;
      return p === "crouch" || p === "land" || p === "look" || p === "gone";
    }
    return this.state === "stare" && this.poseKind() === "loaf";
  }

  private isFlipped(): boolean {
    if (this.crouching()) return this.facing === -1;
    const pose = this.poseKind();
    return pose === "front" || pose === "loaf" ? this.frontFlip : this.facing === -1;
  }

  /** Where an emote bubble's tail sits (just above his head). */
  private headAnchor(): Point {
    const dir = this.isFlipped() ? -1 : 1;
    const cx = this.x + 0.5;
    const y = this.y + this.hopY;
    if (this.crouching()) return { x: cx + 6 * dir, y: y - 20 };
    switch (this.poseKind()) {
      case "front":
        return { x: cx, y: y - (this.state === "frenzy" ? 26 : 23) };
      case "loaf":
        return { x: cx, y: y - 19 };
      case "side":
        return { x: cx + 5 * dir, y: y - 23 };
      case "walk":
        return { x: cx + 7 * dir, y: y - 20 };
      case "sleep":
        return { x: cx - 3 * dir, y: y - 16 };
    }
  }

  /** Crouched low, side-on, the tip of his tail twitching away (and his hindquarters, with a wiggle). */
  private crouch(twitch: boolean): Layer[] {
    const k = twitch ? Math.floor(this.t / 0.16) % 2 : this.tailT > 0 ? 1 : 0;
    const w = this.wiggle;
    return [
      ["sideTail", -k - w, 1 - k],
      ["loafBody", -w, 0],
      ["headSide", 13, 11],
    ];
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
      case "beg":
        return this.front(blink ? "headBlink" : "headFront");
      case "eat": {
        // Crouched over the dish, face in it, nodding away; every couple of seconds he looks up to chew.
        const tail: Layer = ["loafTail", this.tailT > 0 ? 1 : 0, 0];
        if (this.lookingUp()) {
          const chomp = Math.floor(this.t / 0.18) % 2;
          return [["loafBody", 0, 0], [blink ? "headBlink" : "headLickIn", HEAD_LOAF.dx, HEAD_LOAF.dy + chomp], tail];
        }
        const nod = Math.floor(this.t / 0.24) % 2;
        return [["loafBody", 0, 0], [nod ? "headLickCurl" : "headLickIn", HEAD_LOAF.dx, HEAD_LOAF.dy + 2 + (nod ? 0 : 1)], tail];
      }
      case "watch":
        return this.watchSide ? this.side(blink) : this.front(blink ? "headBlink" : "headFront");
      case "knock": {
        const k = this.knock;
        if (!k || k.phase === "eye") return this.side(blink);
        if (k.phase === "wake") {
          // Head up out of his nap. (Coffee?)
          return [
            ["loafBody", 0, 0],
            [blink ? "headBlink" : "headFront", HEAD_LOAF.dx, HEAD_LOAF.dy],
            ["loafTail", this.tailT > 0 ? 1 : 0, 0],
          ];
        }
        if (k.phase === "swipe") {
          // Paw up... and out.
          const flick = this.tailT > 0 ? 1 : 0;
          return [
            ["sitTail", flick, -flick],
            ["groomBody", 0, 0],
            ["headFront", HEAD_FRONT.dx, HEAD_FRONT.dy],
            this.t >= 0.25 ? ["pawUp0", -4, 1] : ["pawUp1", -2, 0],
          ];
        }
        // Looking right at you. Not blinking.
        return this.front("headFront");
      }
      case "hunt": {
        const h = this.hunt;
        if (h?.phase === "pounce") {
          // Mid-leap, legs out.
          return [
            ["walkTail", 1, 0],
            ["walkLegs1", 0, 0],
            ["walkBody", 0, 0],
            ["headSide", HEAD_WALK.dx, HEAD_WALK.dy],
          ];
        }
        if (h?.phase === "on") {
          // Lying on it, extremely pleased with himself (and every so often, visibly so).
          const happy = this.t < 1.6 || (this.t > h.squintAt && this.t < h.squintAt + 1.8);
          return [
            ["loafBody", 0, 0],
            [happy ? "headHappy" : blink ? "headBlink" : "headFront", HEAD_LOAF.dx, HEAD_LOAF.dy],
            ["loafTail", this.tailT > 0 ? 1 : 0, 0],
          ];
        }
        if (h?.phase === "up") return this.walking(blink);
        return this.crouch(true);
      }
      case "stare":
        // Unblinking.
        if (this.poseKind() === "side") return this.side(false);
        return this.crouch(this.stare?.phase === "crouch" || this.stare?.phase === "hold");
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
      case "walk":
        return this.walking(blink);
    }
  }

  private walking(blink: boolean): Layer[] {
    const i = Math.floor(this.walkT / WALK_FRAME) % 4;
    const bob = i % 2 ? -1 : 0;
    return [
      ["walkTail", i % 2 ? 1 : 0, bob],
      [WALK_LEGS[i] ?? "walkLegs0", 0, 0],
      ["walkBody", 0, bob],
      [blink ? "headSideBlink" : "headSide", HEAD_WALK.dx, HEAD_WALK.dy + bob],
    ];
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
    drawLayers(ctx, x - (flip ? 16 : 15), y - FEET_ROW + this.hopY, this.layers(), flip);
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
      t: this.y + this.hopY + b.t,
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
    const top = Math.round(this.y) - FEET_ROW + this.hopY;
    return opaqueAt(this.layers(), flip, wx - left, wy - top, slop);
  }

  /** Is (wx, wy) on THE SPOT (his rear end / lower back / tail) rather than his head? */
  private isSpot(wx: number, wy: number): boolean {
    const rel = (wx - this.x - 0.5) * (this.isFlipped() ? -1 : 1);
    const up = this.y - wy;
    // Crouched side-on (head on the right): the back half.
    if (this.crouching()) return rel < 0;
    switch (this.poseKind()) {
      case "front":
        // Head on top; the lower back and the tail plume (on his right) are the spot.
        return rel > 9 || up < 11;
      case "loaf":
        // Face down in his dish, his head is where a loaf's lick spot would be: then it's only
        // his back end (right of his head: the tail side).
        if (this.state === "eat") return rel > 7;
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

/**
 * Where the string lands: out in the open right in front of the chest and the mailbox (portrait:
 * the strip of yard between them and the top fence; landscape: the middle of the farm things), on
 * the nearest spot where he can loaf anywhere within PLAY px either side of it, so the pounces, the
 * skitters and the long loaf all stay clear of the farm things, the sign, the fence and the HUD.
 */
function stringSpot(yard: Yard, l: Layout): Point {
  const tx = Math.round((l.chest.x + l.mailbox.x) / 2);
  const ty = l.portrait && yard.laneY !== null ? yard.laneY + 1 : Math.round((l.chest.y + l.mailbox.y) / 2);
  const top = Math.min(l.chest.y, l.mailbox.y);
  const bottom = l.portrait ? ty + 2 : Math.max(l.chest.y, l.mailbox.y) + 8;
  let best: Point | null = null;
  let score = Infinity;
  // Rows nearest the target first, and no further than the best so far.
  for (let d = 0; d <= bottom - top && d < score; d++) {
    for (const y of d ? [ty - d, ty + d] : [ty]) {
      if (y < top || y > bottom) continue;
      const reach = Math.min(72, score - d) + PLAY;
      let run = 0;
      for (let x = tx - reach; x <= tx + reach; x++) {
        run = yard.loafs(x, y) ? run + 1 : 0;
        if (run <= PLAY * 2) continue;
        const s = Math.abs(x - PLAY - tx) + d;
        if (s < score) {
          score = s;
          best = { x: x - PLAY, y };
        }
      }
    }
  }
  if (best) return best;
  // (No such stretch of yard: just right of the doorstep, or beside the nearest spot with room.)
  const door = yard.door;
  const near = [door, ...yard.spots.filter((s) => s !== door).sort((a, b) => Math.hypot(a.x - door.x, a.y - door.y) - Math.hypot(b.x - door.x, b.y - door.y))];
  for (const s of near) {
    for (const dx of [12, 10, 14, -12, -10, -14]) {
      if (yard.loafs(s.x + dx, s.y)) return { x: s.x + dx, y: s.y };
    }
  }
  return { x: door.x, y: door.y };
}

// ---------- boot ----------

let snickers: Snickers | null = null;

/** Wrap update/draw/hit/onTap in try/catch, so a bug here can never freeze the farm. */
function guard(e: Entity, name: string): Entity {
  const { update, draw, hit, onTap } = e;
  e.update = (dt, g) => {
    try {
      update?.call(e, dt, g);
    } catch (err) {
      report(`${name} update`, err);
    }
  };
  e.draw = (ctx, g) => {
    try {
      draw.call(e, ctx, g);
    } catch (err) {
      report(`${name} draw`, err);
    }
  };
  e.hit = (wx, wy) => {
    try {
      return hit?.call(e, wx, wy) ?? false;
    } catch (err) {
      report(`${name} hit`, err);
      return false;
    }
  };
  e.onTap = (g, wx, wy) => {
    try {
      onTap?.call(e, g, wx, wy);
    } catch (err) {
      report(`${name} onTap`, err);
    }
  };
  return e;
}

/** His face centered (by its visible pixels, not its frame) on a square of at least `size` px. */
function centeredIcon(src: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const data = src.getContext("2d")?.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; data && y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]! > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) [x0, y0, x1, y1] = [0, 0, w - 1, h - 1];
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const side = Math.max(size, bw, bh);
  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  c.getContext("2d")?.drawImage(src, x0, y0, bw, bh, Math.floor((side - bw) / 2), Math.floor((side - bh) / 2), bw, bh);
  return c;
}

/** DOM-friendly art: "snickers.icon" (his face, 16x16) and "snickers.sit" (32x32). */
function registerIcons(): void {
  const head = part("headFront");
  if (head) registerArt("snickers.icon", centeredIcon(head, 16));
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
    registerBowlIcon();
  } catch (err) {
    report("art", err);
  }
  const s = new Snickers(g);
  snickers = s;
  g.add(guard(s, "snickers"));
  g.add(guard(s.bowl, "dish"));
  g.on("barnDoor", () => {
    try {
      s.onBarnDoor();
    } catch (err) {
      report("barnDoor", err);
    }
  });
  // The chest closed after somebody poked the string (loom.ts).
  g.on("string", () => {
    try {
      s.onString();
    } catch (err) {
      report("string", err);
    }
  });
  try {
    initCoffee(g, { yard: () => s.currentYard(), knock: (mug, seat, hooks, forced) => s.knockMug(mug, seat, hooks, forced) });
  } catch (err) {
    report("coffee", err);
  }
  listenForParties();
  // Debug: ?string pokes the string 3 s in.
  if (new URLSearchParams(location.search).has("string")) window.setTimeout(() => g.emit("string"), 3000);
}

/** Where Snickers is (feet), e.g. for critters that want to keep their distance. */
export function snickersPosition(): Point | null {
  return snickers ? { x: snickers.x, y: snickers.y } : null;
}

/** His dish (its feet), e.g. for a seagull with something to drop. Null when there's no room for one. */
export function snickersDish(): Point | null {
  const b = snickers?.bowl;
  return b?.placed ? { x: b.x, y: b.y } : null;
}

/**
 * Something fishy just landed at `at` (by his dish): he comes running, even out of a nap, and eats
 * it. `onEat` runs at the first nom (that's when it's gone). False if he can't come.
 */
export function snickersSnack(onEat: () => void, at: Point | null = null): boolean {
  try {
    return snickers?.snackOn(onEat, at) ?? false;
  } catch (err) {
    report("snack", err);
    return false;
  }
}

/**
 * The neighbor's hen is in the yard (pass her: he keeps an eye on where she is). Will he stare her
 * down? `forced` (?hen): yes, even at night.
 */
export function snickersStare(hen: Point, hooks: StareHooks, forced = false): boolean {
  try {
    return snickers?.stareDown(hen, hooks, forced) ?? false;
  } catch (err) {
    report("stare", err);
    return false;
  }
}

/** Make Snickers join a farm party (lick-fest + music note). */
export function snickersParty(): void {
  try {
    snickers?.party();
  } catch (err) {
    report("party", err);
  }
}
