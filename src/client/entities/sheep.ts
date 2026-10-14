// The sheep! One wandering sprite per todo still in the pasture.
//
// Each sheep is an entity with a little seeded personality (speed, appetite, wanderlust, how
// hoppy and chatty it is, a favorite spot in the pasture). It idles, blinks, looks around,
// wanders, grazes, gets nudged by its neighbours, sleeps at night, and reacts to pets, rain and
// shears. Buying a plan walks a new sheep out of the barn (as a lamb for its first day: bouncier,
// a bit faster, and fond of trotting after the grown-ups); shearing it (doing the plan) pops
// wool into the chest; three days later it strolls back into the barn as a memory. Sheep wear
// the hats you two buy them, on every frame (see sheep-hats.ts for the head anchors).

import { dayKey } from "../../shared/calendar";
import { LAMB_MS, MAX_PETS, type FarmState, type Sheep } from "../../shared/types";
import { sfx } from "../audio";
import { clamp, type Entity, type Game } from "../engine/game";
import { api, isLamb, isRetired, serverNow, store } from "../net";
import { openMenu, toast } from "../ui/dom";
import { contains, fromFraction, inflate, type Layout, type Point, type Rect } from "../world/layout";
import { onPond, steerAround } from "../world/world-pond";
import { critterCheer } from "./critter-fox";
import { drawEmote, registerEmoteArt, type EmoteKind } from "./emotes";
import { FEET, FRAME, buildSheepArt, drawSheepFrame, type SheepArt } from "./sheep-art";
import { SNIP_TIMES, WOOL_FLIGHT_TIME, initSheepFx, launchWool, spawnPlusHeart, spawnPuff, spawnSparkle, spawnTufts, startShears } from "./sheep-fx";
import { drawHat, hatPlacement, hatTopRow, type HatLook } from "./sheep-hats";
import { SheepTag, hudAvoidRects, layoutTags, markTagsDirty, screenBounds, setTagsVisible, type TagRect } from "./sheep-tags";

// ---------- frames ----------

type Dir = 0 | 1 | 2 | 3;
const DOWN: Dir = 0;
const RIGHT: Dir = 1;
const UP: Dir = 2;
const LEFT: Dir = 3;
type Quad = readonly [number, number, number, number];
const WALK_BASE: Quad = [0, 4, 8, 4];
const IDLE_FRAME: Quad = [12, 14, 15, 14];
const ASLEEP = 13;
/** Top opaque row of each frame (for placing emotes just above the head), measured from the sheets. */
const TOP_ROW = [7, 8, 7, 8, 9, 10, 9, 10, 5, 6, 5, 6, 7, 7, 10, 5, 8, 9, 10, 10] as const;
/** Same for the sheared sheet: without the wool the side views are 3px shorter. */
const TOP_ROW_SHEARED = [7, 8, 7, 8, 12, 13, 12, 13, 6, 7, 6, 6, 7, 7, 12, 6, 8, 8, 9, 9] as const;
/** And for lambs (smaller, same feet row). */
const TOP_ROW_LAMB = [10, 11, 10, 11, 13, 14, 13, 14, 10, 11, 10, 11, 11, 11, 14, 10, 10, 10, 10, 10] as const;
const TOP_ROWS: Record<HatLook, readonly number[]> = { woolly: TOP_ROW, sheared: TOP_ROW_SHEARED, lamb: TOP_ROW_LAMB };
/** Pixels walked per animation frame (legs keep pace with the ground). */
const STRIDE = 3.5;
/** A newly bought sheep (createdAt within this window) walks out of the barn. */
const FRESH_MS = 15_000;
/** Farm-wide: at most one ambient baa this often. */
const AMBIENT_BAA_EVERY = 45;
/** How long a "looks sheared" override waits for the server to agree before reverting. */
const SHEAR_CONFIRM_MS = 6000;
/** A shear we missed the live event for still gets the full animation if it's this fresh. */
const REPLAY_SHEAR_MS = 30_000;
const NIGHT_SLEEP = 0.6;
const NIGHT_WAKE = 0.45;
/** With name tags showing, the tap box reaches this far below the feet (covers the tag). */
const TAG_HIT_BELOW = 11;
/** Tap box reaches this far above the feet (31 game px tall = 40+ CSS px on phones), more with a hat. */
const HIT_ABOVE = 27;
const HIT_ABOVE_HAT = 31;
/** A lamb that grew up within this long ago still gets its little celebration when we notice. */
const GROW_UP_FRESH_MS = 2 * 60_000;
/** Lambs: a bit quicker on their feet, and quicker still trotting after a grown-up. */
const LAMB_SPEED = 1.15;
const LAMB_TROT = 1.4;
/**
 * How much of each sheep's own voice (p.pitch, 0.86-1.18) a baa keeps. The baas are real recordings
 * now (the Stardew sheep, and a little goat bleat for lambs), and pitching those too far sounds
 * like a tape deck, so each voice is squeezed to about +/-8% around normal.
 */
const VOICE_RANGE = 0.5;
/**
 * Lambs tag along after a grown-up only now and then, and only for a few seconds (otherwise a
 * young flock all chases the same one or two grown-ups into one clump). Seconds.
 */
const FOLLOW_MIN = 3;
const FOLLOW_MAX = 6;
const FOLLOW_COOLDOWN = 35;
/** How close a grown-up has to be for a lamb to bother trotting after it (game px). */
const FOLLOW_RANGE = 110;
/** Sprites are wider than they are tall, so vertical gaps count a bit extra when judging room. */
const ROOM_Y = 1.3;
/** Wander targets, beds and spawn spots weigh up this many candidate spots and take the roomiest. */
const CANDIDATES = 6;
/** Personal space wanted around a spot, scaled to how full the pasture is (game px). */
const ROOM_MIN = 22;
const ROOM_MAX = 46;
/** A crowd: CROWD_N other sheep within CROWD_R of us. Idling or grazing in one, we soon wander off. */
const CROWD_R = 24;
const CROWD_N = 2;
/** Favorite spots (and so beds) are spread over this inner part of the pasture (fraction of each side). */
const HOME_EDGE = 0.06;

type Mode = "wait" | "enter" | "idle" | "walk" | "graze" | "sleep" | "shear" | "exit";

// ---------- module state ----------

let game: Game | null = null;
let art: SheepArt | null = null;
const flock = new Map<string, SheepEntity>();
const list: SheepEntity[] = [];
let firstSync = true;
let lastAmbientBaa = -AMBIENT_BAA_EVERY + 12; // first ambient baa can come ~12s in
let nextDoorAt = 0;
let today = dayKey(new Date());
let lastPasture: Rect | null = null;
let labelsOn = true;

const reducedMotion = (() => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
})();

const now = (): number => game?.time ?? 0;

/** A thrown error inside an entity would stop the whole game loop; log it once and carry on. */
let reported = false;
function report(err: unknown): void {
  if (reported) return;
  reported = true;
  console.error("[sheep]", err);
}
function guard(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    report(err);
  }
}

function isRainy(g: Game): boolean {
  return g.env.weather === "rain" || g.env.weather === "storm";
}

/** The sheep's hat id, or null (also for state from a server that predates hats). */
function hatOf(s: Sheep): number | null {
  const h: unknown = s.hat;
  return typeof h === "number" && Number.isInteger(h) && h >= 0 ? h : null;
}

/** The lamb sheet loaded (otherwise lambs wear the adult sheet, and its head anchors). */
function hasLambArt(): boolean {
  return !!art && art.lamb !== art.woolly;
}

/** Haptic tick (Android; a no-op on iPhone and desktop). */
function buzz(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // Not allowed (no user gesture yet, iframe policy...): no buzz, no problem.
  }
}

// ---------- personality ----------

interface Personality {
  speed: number;
  wanderlust: number;
  appetite: number;
  hoppy: number;
  chatty: number;
  pitch: number;
  homeFx: number;
  homeFy: number;
  blinkEvery: number;
}

/** mulberry32, same as engine's rng(), inlined so personality streams stay independent. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function personality(seed: number): Personality {
  const r = seeded(seed ^ 0x5eed5);
  return {
    speed: 15 + r() * 5,
    wanderlust: 0.6 + r() * 0.8,
    appetite: 0.6 + r() * 0.8,
    hoppy: r(),
    chatty: 0.6 + r() * 0.9,
    pitch: 0.86 + r() * 0.32,
    homeFx: HOME_EDGE + r() * (1 - 2 * HOME_EDGE),
    homeFy: HOME_EDGE + r() * (1 - 2 * HOME_EDGE),
    blinkEvery: 2.4 + r() * 3,
  };
}

// ---------- pasture geometry ----------

/**
 * Is there a real pasture on screen? A very short viewport (a phone keyboard squeezing the page,
 * say) can leave the fence with no inside at all; then the sheep just hold still where they are
 * (clamping into a zero-height pasture would squash the whole flock onto one line).
 */
function pastureOk(l: Layout): boolean {
  return l.pasture.w >= 24 && l.pasture.h >= 16;
}

function clampToPasture(e: { x: number; y: number }, l: Layout): void {
  if (!pastureOk(l)) return;
  const P = l.pasture;
  e.x = clamp(e.x, P.x + 3, P.x + P.w - 3);
  e.y = clamp(e.y, P.y + 1, P.y + P.h - 1);
}

/** Distance as the eye judges sheep crowding (vertical gaps count a bit extra). */
function roomDist(dx: number, dy: number): number {
  return Math.hypot(dx, dy * ROOM_Y);
}

/**
 * Personal space a sheep wants around a new spot: a fair share of the pasture, so a small flock
 * spreads out and a big one still fits.
 */
function roomWanted(l: Layout): number {
  let n = 0;
  for (const e of list) if (e.claim()) n++;
  const share = Math.sqrt((Math.max(1, l.pasture.w) * Math.max(1, l.pasture.h)) / Math.max(1, n));
  return clamp(share * 0.55, ROOM_MIN, ROOM_MAX);
}

/** Room at (x, y): the distance to the nearest other sheep, or to where it's already headed. */
function roomAt(x: number, y: number, self: SheepEntity): number {
  let best = Infinity;
  for (const e of list) {
    if (e === self) continue;
    const c = e.claim();
    if (!c) continue;
    const d = roomDist(c.x - x, c.y - y);
    if (d < best) best = d;
  }
  return best;
}

/** Is a sheep standing at (x, y) clear of the HUD, the critter corner and decorations? */
function freeSpot(x: number, y: number, l: Layout): boolean {
  const bx = x - 11;
  const by = y - 22;
  for (const b of l.blocked) if (bx < b.x + b.w && bx + 22 > b.x && by < b.y + b.h && by + 25 > b.y) return false;
  if (onPond(l, x, y, 4)) return false;
  const decor = store.state?.decorations;
  if (decor) {
    for (const d of decor) {
      const p = fromFraction(l, d.fx, d.fy);
      if (Math.abs(p.x - x) < 13 && Math.abs(p.y - y) < 8) return false;
    }
  }
  return true;
}

/** The two waypoints either side of the fence gap: just outside, and just inside the pasture. */
function gatePoints(l: Layout): { outside: Point; inside: Point } {
  const gt = l.gate;
  const P = l.pasture;
  if (gt.side === "top") {
    return {
      outside: { x: gt.x, y: Math.min(gt.y - 3, (l.barnDoor.y + gt.y) / 2) },
      inside: { x: clamp(gt.x, P.x + 4, P.x + P.w - 4), y: P.y + 3 },
    };
  }
  return {
    outside: { x: gt.x - 10, y: gt.y },
    inside: { x: P.x + 4, y: clamp(gt.y, P.y + 2, P.y + P.h - 2) },
  };
}

function inPasture(x: number, y: number, l: Layout): boolean {
  return contains(inflate(l.pasture, 3), x, y);
}

// ---------- petting (once per day per device) ----------

const memPetted = new Map<string, Set<string>>();

function pettedSet(day: string): Set<string> {
  let mem = memPetted.get(day);
  if (!mem) memPetted.set(day, (mem = new Set()));
  try {
    const raw = localStorage.getItem(`farm.petted.${day}`);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) for (const v of arr) if (typeof v === "string") mem.add(v);
  } catch {
    // Private mode: the in-memory set is all we've got.
  }
  return mem;
}

function recordPet(day: string, id: string): void {
  const set = pettedSet(day);
  set.add(id);
  try {
    localStorage.setItem(`farm.petted.${day}`, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

/** The pet request failed (offline?): let them try again later. */
function forgetPet(day: string, id: string): void {
  const set = pettedSet(day);
  set.delete(id);
  try {
    localStorage.setItem(`farm.petted.${day}`, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function forgetOldPets(day: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("farm.petted.") && k !== `farm.petted.${day}`) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

/** True if this device already petted the sheep today (for the animal card, say). */
export function hasPettedToday(sheepId: string): boolean {
  return pettedSet(dayKey(new Date())).has(sheepId);
}

/**
 * Record that this device petted the sheep today (the animal card's pet button calls this), so
 * a tap in the field won't pet it a second time. Same storage as field pets.
 */
export function markPetted(sheepId: string): void {
  recordPet(dayKey(new Date()), sheepId);
}

/** Undo markPetted for today (the card's pet request failed), so it can be petted again. */
export function unmarkPetted(sheepId: string): void {
  forgetPet(dayKey(new Date()), sheepId);
}

// ---------- the sheep ----------

class SheepEntity implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  data: Sheep;
  readonly p: Personality;
  readonly tag = new SheepTag();

  mode: Mode = "idle";
  dir: Dir = DOWN;
  alpha = 1;
  emoteKind: EmoteKind | null = null;
  emoteAt = 0;

  private modeT = 0;
  private modeDur = 0;
  private path: Point[] = [];
  private onArrive: (() => void) | null = null;
  private moving = false;
  private walkDist = 0;
  private fade = 0;
  private blinkAt = 0;
  private blinkUntil = 0;
  private lookAt = 0;
  private hopT = -1;
  private hopDur = 0.32;
  private hopH = 4;
  private hopsLeft = 0;
  private look: "auto" | "woolly" | "sheared" = "auto";
  private lookUntil = 0;
  private shearing: Promise<void> | null = null;
  private nextAmbient: number;
  private nextSparkle = 0;
  private sleepEmoteAt = 0;
  private wakeAt = -1;
  private waitUntil = 0;
  private shiverUntil = 0;
  /** Still a lamb (bought less than a day ago and never sheared). Refreshed every update. */
  lambNow: boolean;
  /** The grown-up a lamb is trotting after, and until when it bothers. */
  private follow: SheepEntity | null = null;
  private followUntil = 0;
  /** A lamb doesn't feel like tagging along again until this long after the last time. */
  private nextFollowAt: number;
  /** Next time an idling or grazing sheep checks whether it's standing in a crowd. */
  private crowdCheckAt = 0;
  /** Favorite spot for the current layout (and decorations), worked out once. */
  private homeCache: { l: Layout; decor: unknown; pt: Point } | null = null;

  constructor(s: Sheep) {
    this.data = s;
    this.p = personality(s.seed);
    this.nextAmbient = now() + 4 + Math.random() * 20;
    this.blinkAt = now() + Math.random() * this.p.blinkEvery;
    this.lambNow = s.shearedAt === null && isLamb(s);
    this.nextFollowAt = now() + 6 + Math.random() * FOLLOW_COOLDOWN;
  }

  /**
   * The spot this sheep takes up, for others judging how much room there is: where it's walking
   * to, or where it stands. Null when it isn't out in the pasture (in the barn, heading back in).
   */
  claim(): Point | null {
    if (this.dead || this.mode === "wait" || this.mode === "exit") return null;
    if ((this.mode === "walk" || this.mode === "enter") && this.path.length) return this.path[this.path.length - 1] ?? this;
    return this;
  }

  /**
   * Standing in a crowd (CROWD_N or more other sheep right around us)? A packed pasture counts
   * closer neighbours as normal, so a big flock doesn't spend all day shuffling about.
   */
  crowded(): boolean {
    const r = game ? Math.min(CROWD_R, roomWanted(game.layout) * 0.8) : CROWD_R;
    let n = 0;
    for (const e of list) {
      if (e === this || e.dead || !solid(e)) continue;
      if (roomDist(e.x - this.x, e.y - this.y) < r && ++n >= CROWD_N) return true;
    }
    return false;
  }

  // ----- lifecycle -----

  /**
   * Appear somewhere in the pasture (sheep that were already out when the page loaded): anywhere
   * by day, at the roomiest of a few seeded spots, so the flock starts out spread over the whole
   * field; asleep in bed at night.
   */
  placeRandom(g: Game): void {
    const l = g.layout;
    const night = g.env.darkness > NIGHT_SLEEP;
    const spot = night ? this.bedSpot(l) : this.spawnSpot(l);
    this.x = spot.x;
    this.y = spot.y;
    const roll = Math.random();
    this.dir = roll < 0.5 ? DOWN : roll < 0.75 ? RIGHT : LEFT;
    if (night) {
      this.startSleep();
      this.sleepEmoteAt = now() + Math.random() * 6;
    } else if (Math.random() < 0.4) {
      this.startGraze();
      this.modeT = Math.random() * this.modeDur * 0.5;
    } else {
      this.startIdle(0.5 + Math.random() * 3);
    }
  }

  /** Wait at the barn door for our turn, then walk out (so a crowd doesn't spill out at once). */
  queueEntrance(g: Game): void {
    this.mode = "wait";
    this.alpha = 0;
    this.x = g.layout.barnDoor.x;
    this.y = g.layout.barnDoor.y;
    this.waitUntil = Math.max(now(), nextDoorAt);
    nextDoorAt = this.waitUntil + 1.1;
  }

  private emerge(g: Game): void {
    const l = g.layout;
    const gp = gatePoints(l);
    this.x = l.barnDoor.x;
    this.y = l.barnDoor.y;
    this.dir = DOWN;
    this.alpha = 0;
    this.fade = 3;
    this.setMode("enter");
    this.path = [gp.outside, gp.inside, this.pickTarget(l, gp.inside)];
    this.onArrive = () => {
      this.hop(1, 4);
      this.decide(g);
    };
    g.emit("barnDoor");
    this.emote("exclaim");
    this.baa(0.5);
  }

  /** Sheared three days ago: amble back through the gate into the barn, as a memory now. */
  retire(g: Game): void {
    if (this.mode === "exit" || this.shearing) return;
    if (this.mode === "wait") return this.kill();
    const l = g.layout;
    const gp = gatePoints(l);
    this.setMode("exit");
    this.path = inPasture(this.x, this.y, l) ? [gp.inside, gp.outside, { ...l.barnDoor }] : [gp.outside, { ...l.barnDoor }];
    this.onArrive = () => {
      g.emit("barnDoor");
      this.dir = UP;
      this.fade = -2.6;
      this.path = [{ x: l.barnDoor.x, y: l.barnDoor.y - 4 }];
      this.onArrive = () => {};
    };
    this.emote("heart");
  }

  /** A pond went in right where we're standing: step off it (to bed, if we were asleep). */
  leavePond(g: Game): void {
    if (this.shearing || !onPond(g.layout, this.x, this.y)) return;
    if (this.mode === "sleep") this.goToBed(g);
    else if (this.mode === "idle" || this.mode === "graze") this.startWander(g);
  }

  /** Un-sheared while walking to the barn: turn around and head back out to the pasture. */
  private comeBack(g: Game): void {
    const l = g.layout;
    const gp = gatePoints(l);
    this.fade = this.alpha < 1 ? 3 : 0;
    this.setMode("enter");
    this.path = inPasture(this.x, this.y, l) ? [this.pickTarget(l)] : [gp.outside, gp.inside, this.pickTarget(l, gp.inside)];
    this.onArrive = () => this.decide(g);
  }

  /** Sold: a little poof and gone. */
  poof(): void {
    if (this.mode !== "wait" && this.alpha > 0.2) {
      spawnPuff(this.x, this.y - 8, 12, 10);
      sfx("woosh", { volume: 0.45 });
    }
    this.kill();
  }

  kill(): void {
    if (this.dead) return;
    this.dead = true;
    this.tag.remove();
    if (flock.get(this.data.id) === this) flock.delete(this.data.id);
    const i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
  }

  /** New data from the server. */
  setData(s: Sheep, g: Game): void {
    const prev = this.data;
    this.data = s;
    const hat = hatOf(s);
    if (hatOf(prev) !== hat && this.mode !== "wait" && this.alpha > 0.3) this.hatChanged(hat !== null);
    if (this.mode === "shear" || this.shearing) return;
    if (prev.shearedAt === null && s.shearedAt !== null && this.look === "auto" && this.mode !== "wait") {
      // Sheared somewhere we didn't see the live event for (socket reconnecting, polling).
      // Just now? Play the whole snip so the other farmer still sees it happen. Long ago (the
      // phone was asleep): a quick flurry of tufts is enough.
      if (this.mode !== "exit" && serverNow() - s.shearedAt < REPLAY_SHEAR_MS) void this.shear();
      else spawnTufts(this.x, this.y, 6, 10);
    } else if (prev.shearedAt !== null && s.shearedAt === null) {
      // The wool grew back (un-done). Huh?
      this.look = "auto";
      if (this.mode !== "wait") {
        spawnPuff(this.x, this.y - 10, 10, 8);
        this.emote("question");
      }
      if (this.mode === "exit") this.comeBack(g);
    }
  }

  // ----- update -----

  update(dt: number, g: Game): void {
    try {
      this.step(dt, g);
    } catch (err) {
      report(err);
    }
  }

  private step(dt: number, g: Game): void {
    if (this.dead) return;
    const t = g.time;
    this.modeT += dt;

    if (this.fade !== 0) {
      this.alpha = clamp(this.alpha + this.fade * dt, 0, 1);
      if (this.fade < 0 && this.alpha <= 0) return this.kill();
      if (this.fade > 0 && this.alpha >= 1) this.fade = 0;
    }
    if (this.hopT >= 0) {
      this.hopT += dt;
      if (this.hopT >= this.hopDur) {
        if (this.hopsLeft > 0) {
          this.hopsLeft--;
          this.hopT = 0;
        } else this.hopT = -1;
      }
    }
    // Lambs grow up after a day. Seeing it happen gets a little celebration.
    const lamb = this.data.shearedAt === null && isLamb(this.data);
    if (this.lambNow && !lamb && this.data.shearedAt === null) this.grewUp();
    this.lambNow = lamb;
    if (!lamb) this.follow = null;

    if (this.look === "sheared" && (this.data.shearedAt !== null || performance.now() >= this.lookUntil) && !this.shearing) {
      if (this.data.shearedAt === null) {
        // The server never agreed (the shear failed): the wool pops back.
        spawnPuff(this.x, this.y - 10, 8, 7);
        this.emote("question");
      }
      this.look = "auto";
    }

    // No pasture to speak of right now (see pastureOk): hold still until there is one again.
    if (!pastureOk(g.layout) && (this.mode === "idle" || this.mode === "walk" || this.mode === "graze")) return;

    switch (this.mode) {
      case "wait":
        if (t >= this.waitUntil) this.emerge(g);
        return;
      case "enter":
      case "exit":
      case "walk":
        if (this.follow) this.chase(t, g.layout);
        this.followPath(dt, g);
        break;
      case "idle":
        this.leaveCrowd(t);
        this.updateIdle(t, g);
        break;
      case "graze":
        this.leaveCrowd(t);
        if (this.modeT >= this.modeDur) this.decide(g);
        break;
      case "sleep":
        if (t >= this.sleepEmoteAt) {
          this.emote("sleep");
          this.sleepEmoteAt = t + 5 + Math.random() * 7;
        }
        break;
      case "shear":
        break;
    }

    if (this.mode === "sleep") {
      if (g.env.darkness < NIGHT_WAKE) {
        if (this.wakeAt < 0) this.wakeAt = t + Math.random() * 5;
        else if (t >= this.wakeAt) this.wake();
      }
    } else if (this.mode === "idle" || this.mode === "walk" || this.mode === "graze") {
      if (t >= this.nextAmbient) {
        this.nextAmbient = t + (10 + Math.random() * 18) / this.p.chatty;
        this.ambient(t, g);
      }
    }

    if (this.data.golden) this.twinkle(t, g);
  }

  private updateIdle(t: number, g: Game): void {
    if (this.dir === DOWN && t >= this.blinkAt) {
      this.blinkUntil = t + 0.14;
      this.blinkAt = t + this.p.blinkEvery * (0.6 + Math.random() * 0.8);
    }
    if (t >= this.lookAt) {
      // Look around a bit.
      this.lookAt = t + 1 + Math.random() * 2.5;
      const roll = Math.random();
      this.dir = roll < 0.45 ? DOWN : roll < 0.7 ? RIGHT : roll < 0.95 ? LEFT : UP;
    }
    if (this.modeT >= this.modeDur) this.decide(g);
  }

  /**
   * Every second or so: standing around in a crowd? Then wrap up whatever we're doing soon and
   * wander off somewhere roomier (decide() sends a crowded sheep off on a walk).
   */
  private leaveCrowd(t: number): void {
    if (t < this.crowdCheckAt) return;
    this.crowdCheckAt = t + 0.8 + Math.random() * 0.8;
    if (this.modeDur - this.modeT > 1.6 && this.crowded()) this.modeDur = this.modeT + 0.5 + Math.random() * 1.1;
  }

  /** Little moods: rain blues, excitement on the big day, love at five hearts, the odd baa. */
  private ambient(t: number, g: Game): void {
    const s = this.data;
    const sheared = s.shearedAt !== null;
    const roll = Math.random();
    if (isRainy(g) && roll < 0.35) return this.emote("sad");
    if (g.env.weather === "snow" && roll < 0.2) {
      this.shiverUntil = t + 0.5;
      return;
    }
    if (!sheared && s.date !== null && s.date === today && roll < 0.35) {
      this.emote("exclaim");
      this.hop(2, 3);
      return;
    }
    if (!sheared && s.date !== null && s.date < today && roll < 0.15) return this.emote("question");
    if (s.pets >= MAX_PETS && roll < 0.3) return this.emote(Math.random() < 0.6 ? "heart" : "happy");
    if (t - lastAmbientBaa > AMBIENT_BAA_EVERY && roll < 0.3 * this.p.chatty) {
      lastAmbientBaa = t;
      this.baa(0.4);
      this.emote("music");
      return;
    }
    if (roll > 0.95) this.emote(Math.random() < 0.5 ? "dots" : "music");
  }

  private twinkle(t: number, g: Game): void {
    if (t >= this.nextSparkle && this.alpha > 0.5) {
      this.nextSparkle = t + (0.7 + Math.random() * 1.6) * (reducedMotion ? 2.5 : 1);
      spawnSparkle(Math.round(this.x + (Math.random() - 0.5) * 18), Math.round(this.y - 6 - Math.random() * 14 - this.hopOffset()));
    }
    if (g.env.darkness > 0.3) g.addLight({ x: this.x, y: this.y - 10, radius: 22, color: "rgba(255,214,110,0.5)" });
  }

  // ----- behaviors -----

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.modeT = 0;
    this.moving = false;
    this.path = [];
    this.onArrive = null;
    this.follow = null;
  }

  private decide(g: Game): void {
    if (g.env.darkness > NIGHT_SLEEP) return this.goToBed(g);
    // Too many friends standing on our hooves: off somewhere roomier.
    if (this.crowded()) return this.startWander(g);
    const rainy = isRainy(g);
    const lamb = this.lambNow;
    // Lambs wander more, graze less, and now and then tag along after a grown-up for a bit.
    const wWander = 0.42 * this.p.wanderlust * (rainy ? 0.55 : 1) * (lamb ? 1.2 : 1);
    const wGraze = 0.33 * this.p.appetite * (lamb ? 0.55 : 1);
    const wIdle = 0.25 * (rainy ? 1.5 : 1);
    const wFollow = lamb && now() >= this.nextFollowAt ? 0.14 : 0;
    const roll = Math.random() * (wWander + wGraze + wIdle + wFollow);
    if (roll < wFollow) {
      const adult = this.nearestAdult(g.layout);
      if (adult) return this.startFollow(adult, g.layout);
      // Nobody to tag along after: ask again in a little while, not on every whim.
      this.nextFollowAt = now() + FOLLOW_COOLDOWN * 0.3;
      return this.startWander(g);
    }
    if (roll < wFollow + wWander) this.startWander(g);
    else if (roll < wFollow + wWander + wGraze) this.startGraze();
    else this.startIdle();
  }

  private startIdle(dur = 1.5 + Math.random() * 3.5): void {
    this.setMode("idle");
    this.modeDur = this.lambNow ? dur * 0.6 : dur;
    this.lookAt = now() + 0.8 + Math.random() * 2;
    const hopChance = this.lambNow ? 0.45 : this.p.hoppy * 0.18;
    if (Math.random() < hopChance) this.hop(1 + (Math.random() < (this.lambNow ? 0.5 : 0.3) ? 1 : 0), 3 + Math.round(Math.random() * 2));
  }

  private startGraze(): void {
    this.setMode("graze");
    this.dir = DOWN;
    this.modeDur = (3 + Math.random() * 5 * this.p.appetite) * (this.lambNow ? 0.6 : 1);
  }

  /** Some other lamb is already trotting after this grown-up. */
  private hasFollower(a: SheepEntity): boolean {
    for (const o of list) if (o !== this && !o.dead && o.follow === a) return true;
    return false;
  }

  /**
   * The closest awake, woolly grown-up out in the pasture for a lamb to trot after. Never a
   * sheared one (resting up), never one already crowded, and one lamb per grown-up at a time.
   */
  private nearestAdult(l: Layout): SheepEntity | null {
    let best: SheepEntity | null = null;
    let bestD = FOLLOW_RANGE;
    for (const e of list) {
      if (e === this || e.dead || e.lambNow || e.showSheared() || !inPasture(e.x, e.y, l)) continue;
      if (e.mode !== "idle" && e.mode !== "walk" && e.mode !== "graze") continue;
      const d = Math.hypot(e.x - this.x, (e.y - this.y) * 1.4);
      if (d >= bestD || this.hasFollower(e) || e.crowded()) continue;
      bestD = d;
      best = e;
    }
    return best;
  }

  /** A spot just beside the grown-up, on our side of it. */
  private besideOf(a: SheepEntity, l: Layout): Point {
    const side = this.x <= a.x ? -1 : 1;
    const pt = { x: a.x + side * 15, y: a.y + 2 };
    clampToPasture(pt, l);
    return pt;
  }

  /** Trot after a grown-up for a few seconds; a happy hop on catching up. */
  private startFollow(adult: SheepEntity, l: Layout): void {
    this.setMode("walk");
    this.follow = adult;
    this.followUntil = now() + FOLLOW_MIN + Math.random() * (FOLLOW_MAX - FOLLOW_MIN);
    this.nextFollowAt = now() + FOLLOW_COOLDOWN * (0.7 + Math.random() * 0.8);
    this.path = [this.besideOf(adult, l)];
    this.onArrive = () => {
      this.follow = null;
      this.startIdle(1.2 + Math.random() * 1.5);
      this.dir = adult.x < this.x ? LEFT : RIGHT;
      this.hop(1, 3);
      if (Math.random() < 0.35) this.emote(Math.random() < 0.5 ? "blush" : "heart");
    };
  }

  /** Keep steering toward the grown-up we're following (it may wander off). */
  private chase(t: number, l: Layout): void {
    const a = this.follow;
    if (!a) return;
    if (a.dead || t > this.followUntil || a.showSheared() || (a.mode !== "idle" && a.mode !== "walk" && a.mode !== "graze")) {
      // Lost interest: finish the trot to wherever we were headed.
      this.follow = null;
      return;
    }
    const target = this.besideOf(a, l);
    if (this.path.length) this.path[0] = target;
    else this.path.push(target);
  }

  private startWander(g: Game): void {
    this.setMode("walk");
    this.path = [this.pickTarget(g.layout)];
  }

  private goToBed(g: Game): void {
    const l = g.layout;
    const bed = this.bedSpot(l);
    if (Math.hypot(bed.x - this.x, bed.y - this.y) < 3) return this.startSleep();
    this.setMode("walk");
    this.path = [bed];
    this.onArrive = () => this.startSleep();
  }

  private startSleep(): void {
    this.setMode("sleep");
    this.dir = DOWN;
    this.sleepEmoteAt = now() + 1 + Math.random() * 4;
    this.wakeAt = -1;
    this.hopT = -1;
  }

  private wake(): void {
    this.wakeAt = -1;
    this.startIdle(2 + Math.random() * 1.5);
    this.dir = DOWN;
    if (Math.random() < 0.5) {
      this.hop(1, 3);
      this.emote("happy");
    }
  }

  private followPath(dt: number, g: Game): void {
    const target = this.path[0];
    if (!target) return this.arrive(g);
    // Round a pond, not across it: the aim is a corner of it (always > 1 step away) until the way is clear.
    const aim = steerAround(g.layout, this.x, this.y, target);
    const dx = aim.x - this.x;
    const dy = aim.y - this.y;
    const d = Math.hypot(dx, dy);
    const lamb = this.lambNow;
    const speed = this.p.speed * (this.mode === "walk" ? 1 : 1.1) * (lamb ? LAMB_SPEED : 1) * (this.follow ? LAMB_TROT : 1);
    const step = speed * dt;
    // Lambs bounce along as they go.
    if (lamb && this.hopT < 0 && d > 2 && Math.random() < dt * (this.follow ? 1.6 : 0.7)) this.hop(1, 2 + (Math.random() < 0.3 ? 1 : 0));
    if (d > 0.5) this.face(dx, dy);
    if (d <= step) {
      this.x = target.x;
      this.y = target.y;
      this.walkDist += d;
      this.path.shift();
      if (!this.path.length) this.arrive(g);
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.walkDist += step;
    this.moving = true;
  }

  private arrive(g: Game): void {
    this.moving = false;
    const cb = this.onArrive;
    this.onArrive = null;
    if (cb) cb();
    else this.decide(g);
  }

  /** Face the way we're walking, sticking with the current axis unless the other clearly wins. */
  private face(dx: number, dy: number): void {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (this.dir === RIGHT || this.dir === LEFT) {
      if (ay > ax * 1.4) this.dir = dy > 0 ? DOWN : UP;
      else this.dir = dx > 0 ? RIGHT : LEFT;
    } else if (ax > ay * 1.4) this.dir = dx > 0 ? RIGHT : LEFT;
    else this.dir = dy > 0 ? DOWN : UP;
  }

  /**
   * Our favorite spot (where we drift back to, and sleep). Seeded, spread evenly over the whole
   * pasture; if it's under the HUD, the critter corner or a decoration in this layout, the next
   * seeded spot that's free (so blocked homes scatter evenly instead of all landing in one place).
   */
  private homeSpot(l: Layout): Point {
    const decor = store.state?.decorations;
    const c = this.homeCache;
    if (c && c.l === l && c.decor === decor) return c.pt;
    let pt = fromFraction(l, this.p.homeFx, this.p.homeFy);
    if (!freeSpot(pt.x, pt.y, l)) {
      const r = seeded(this.data.seed ^ 0x40e5);
      let found = false;
      for (let i = 0; i < 24 && !found; i++) {
        const alt = fromFraction(l, HOME_EDGE + r() * (1 - 2 * HOME_EDGE), HOME_EDGE + r() * (1 - 2 * HOME_EDGE));
        if (freeSpot(alt.x, alt.y, l)) {
          pt = alt;
          found = true;
        }
      }
      if (!found) pt = fromFraction(l, 0.35, 0.4);
    }
    this.homeCache = { l, decor, pt };
    return pt;
  }

  /**
   * Weigh up candidate spots and take the first with room enough around it (the candidates come
   * in order of preference), or else the roomiest one. Room = distance to the nearest other sheep
   * or the spot it's headed for, so two sheep never set off for the same patch of grass.
   */
  private roomiest(l: Layout, want: number, tries: number, next: (i: number, out: Point) => void): Point | null {
    let best: Point | null = null;
    let bestRoom = -1;
    let weighed = 0;
    for (let i = 0; i < tries && weighed < CANDIDATES; i++) {
      const pos = { x: 0, y: 0 };
      next(i, pos);
      clampToPasture(pos, l);
      if (!freeSpot(pos.x, pos.y, l)) continue;
      weighed++;
      const room = Math.min(roomAt(pos.x, pos.y, this), want);
      if (room > bestRoom) {
        best = pos;
        bestRoom = room;
        if (room >= want) break;
      }
    }
    return best;
  }

  /**
   * A wander target: often near our favorite spot, otherwise a stroll from where we are, now and
   * then anywhere at all; always with some room around it.
   */
  private pickTarget(l: Layout, from?: Point): Point {
    const P = l.pasture;
    const cx = from?.x ?? this.x;
    const cy = from?.y ?? this.y;
    const home = this.homeSpot(l);
    const wander = this.p.wanderlust;
    const pick = this.roomiest(l, roomWanted(l), 14, (_i, pos) => {
      const roll = Math.random();
      if (roll < 0.45) {
        pos.x = home.x + (Math.random() - 0.5) * P.w * 0.45;
        pos.y = home.y + (Math.random() - 0.5) * P.h * 0.45;
      } else if (roll < 0.85) {
        const a = Math.random() * Math.PI * 2;
        const dist = 12 + Math.random() * 55 * wander;
        pos.x = cx + Math.cos(a) * dist;
        pos.y = cy + Math.sin(a) * dist * 0.6;
      } else {
        pos.x = P.x + Math.random() * P.w;
        pos.y = P.y + Math.random() * P.h;
      }
    });
    if (pick) return pick;
    const pos = { x: cx, y: cy };
    clampToPasture(pos, l);
    return pos;
  }

  /** Where to sleep tonight: by our favorite spot if there's room, otherwise a bit further afield. */
  private bedSpot(l: Layout): Point {
    const P = l.pasture;
    const home = this.homeSpot(l);
    const pick = this.roomiest(l, roomWanted(l) * 0.85, 18, (i, pos) => {
      // Right by home first, then the neighbourhood, then anywhere.
      const reach = i < 2 ? 0.06 : i < 5 ? 0.3 : 1;
      if (reach < 1) {
        pos.x = home.x + (Math.random() - 0.5) * P.w * reach;
        pos.y = home.y + (Math.random() - 0.5) * P.h * reach;
      } else {
        pos.x = P.x + Math.random() * P.w;
        pos.y = P.y + Math.random() * P.h;
      }
    });
    if (pick) return pick;
    const pos = { ...home };
    clampToPasture(pos, l);
    return pos;
  }

  /** A seeded spot anywhere in the pasture with room around it (sheep already out on page load). */
  private spawnSpot(l: Layout): Point {
    const P = l.pasture;
    const r = seeded(this.data.seed);
    const pick = this.roomiest(l, roomWanted(l), 24, (_i, pos) => {
      pos.x = P.x + 4 + r() * (P.w - 8);
      pos.y = P.y + 2 + r() * (P.h - 4);
    });
    return pick ?? { x: P.x + P.w / 2, y: P.y + P.h / 2 };
  }

  // ----- reactions -----

  hop(times = 1, height = 4): void {
    this.hopH = height;
    if (this.hopT < 0) {
      this.hopT = 0;
      this.hopsLeft = times - 1;
    } else this.hopsLeft = Math.max(this.hopsLeft, times - 1);
  }

  hopOffset(): number {
    return this.hopT < 0 ? 0 : Math.sin((Math.PI * this.hopT) / this.hopDur) * this.hopH;
  }

  emote(kind: EmoteKind): void {
    this.emoteKind = kind;
    this.emoteAt = now();
  }

  baa(volume: number, pitchUp = 1): void {
    const voice = 1 + (this.p.pitch - 1.02) * VOICE_RANGE;
    const pitch = voice * pitchUp * (0.97 + Math.random() * 0.06);
    // Lambs have their own little bleat (not just a squeaky grown-up baa).
    if (this.lambNow && !this.showSheared()) sfx("baaLamb", { volume, pitch });
    else sfx("baa", { volume, pitch });
  }

  /** Just grew up (crossed a day old). Seen happening: sparkle poof, a toast, a proud baa. */
  private grewUp(): void {
    const crossedAt = this.data.createdAt + LAMB_MS;
    const visible = this.mode !== "wait" && this.mode !== "exit" && this.alpha > 0.3;
    let hidden = false;
    try {
      hidden = document.hidden;
    } catch {
      // ignore
    }
    if (!visible || hidden || serverNow() - crossedAt > GROW_UP_FRESH_MS) return;
    spawnPuff(this.x, this.y - 10, 12, 10);
    const n = reducedMotion ? 3 : 9;
    for (let i = 0; i < n; i++) spawnSparkle(Math.round(this.x + (Math.random() - 0.5) * 26), Math.round(this.y - 4 - Math.random() * 24), 0.45 + Math.random() * 0.45);
    sfx("reward");
    toast(`${this.data.name} is all grown up...`, { icon: this.data.golden ? "sheep.portrait.golden" : "sheep.portrait" });
    if (this.mode !== "shear") {
      this.payAttention();
      this.hop(2, 5);
      this.emote("exclaim");
      window.setTimeout(() => !this.dead && this.baa(0.45), 380);
    }
  }

  /** A hat went on (or came off): a puff of dust, and a pleased little reaction. */
  private hatChanged(on: boolean): void {
    const headY = this.y - (this.lambNow ? 14 : 20);
    spawnPuff(this.x, headY, 8, 7);
    if (on) for (let i = 0; i < (reducedMotion ? 1 : 4); i++) spawnSparkle(Math.round(this.x + (Math.random() - 0.5) * 20), Math.round(headY - 4 - Math.random() * 8), 0.45 + Math.random() * 0.3);
    if (this.mode === "shear" || this.shearing) return;
    if (this.mode !== "sleep") {
      this.payAttention();
      this.hop(1, on ? 4 : 3);
      this.emote(on ? "blush" : "happy");
    }
  }

  /** Being fussed over: don't wander off from the crowd check for a few seconds. */
  private holdStill(secs: number): void {
    this.crowdCheckAt = Math.max(this.crowdCheckAt, now() + secs);
  }

  /** Stop strolling around when someone gives us attention. */
  private payAttention(): void {
    this.holdStill(4);
    if (this.mode === "walk" && (!this.onArrive || this.follow)) {
      this.startIdle(2 + Math.random());
      this.dir = DOWN;
    } else if (this.mode === "idle") {
      this.dir = DOWN;
      this.modeT = Math.min(this.modeT, Math.max(0, this.modeDur - 2));
    }
  }

  petReaction(): void {
    this.emote("heart");
    sfx("pet");
    // Off to the side so it doesn't sit on top of the heart bubble.
    spawnPlusHeart(this.x + 16, this.y - 16);
    if (this.mode !== "sleep") {
      this.payAttention();
      this.hop(1, 5);
      // Like in Stardew, a petted animal answers with its own little sound.
      window.setTimeout(() => {
        if (!this.dead) this.baa(0.35);
      }, 220);
    }
  }

  /** Awake, out in the pasture and not busy: free to react to things. */
  canReact(): boolean {
    return !this.dead && (this.mode === "idle" || this.mode === "walk" || this.mode === "graze") && !this.emoteKind;
  }

  /** Notices the shears: stops, looks your way, "!" (or a worried "?"). */
  glance(): void {
    if (this.mode === "walk" && (!this.onArrive || this.follow)) this.startIdle(1.6 + Math.random());
    else if (this.mode === "graze") this.modeT = Math.max(this.modeT, this.modeDur - 0.3);
    if (this.mode === "idle") {
      this.dir = DOWN;
      this.lookAt = now() + 1.4;
    }
    this.holdStill(3);
    this.emote(Math.random() < 0.7 ? "exclaim" : "question");
    if (Math.random() < 0.4) this.hop(1, 2);
  }

  /** Back to the ORIGINAL PLAN: a proud double hop, "!", a little sparkle and a pleased baa. */
  proud(): void {
    if (this.dead || this.mode === "wait" || this.alpha < 0.3) return;
    this.emote("exclaim");
    if (this.mode === "shear" || this.shearing || this.mode === "exit") return;
    if (this.mode === "sleep" || this.mode === "graze") {
      // Worth waking up (or looking up from the grass) for. Back to bed once the fuss is over.
      this.startIdle(2.6);
      this.dir = DOWN;
    } else this.payAttention();
    this.holdStill(4);
    this.hop(2, 6);
    const headY = this.y - (this.lambNow ? 14 : 20);
    for (let i = 0; i < (reducedMotion ? 1 : 5); i++) spawnSparkle(Math.round(this.x + (Math.random() - 0.5) * 24), Math.round(headY - Math.random() * 10), 0.4 + Math.random() * 0.35);
    // After the stamp's thud, not on top of it.
    window.setTimeout(() => !this.dead && this.baa(0.4, 1.08), 520);
  }

  remotePet(): void {
    this.emote("heart");
    if (this.mode !== "sleep" && this.mode !== "wait") this.hop(1, 4);
  }

  party(): void {
    if (this.dead || this.mode === "wait" || this.mode === "exit" || this.mode === "shear" || this.mode === "enter") return;
    if (this.mode === "sleep" || this.mode === "walk" || this.mode === "graze") this.startIdle(2.6);
    this.holdStill(4);
    this.modeT = 0;
    this.dir = DOWN;
    this.hop(this.lambNow ? 4 : 3, 5);
    this.emote("music");
  }

  // ----- tapping -----

  hit(wx: number, wy: number): boolean {
    if (this.dead || this.mode === "wait" || this.alpha < 0.3) return false;
    // Generous (~30x31 game px, 40+ CSS px on phones, lambs too) so it's easy to tap with a
    // thumb; a hat makes it a little taller. The name tag hangs under the hooves and lets taps
    // through, so tapping the tag counts too. (Sheep in front are hit-tested first, so this
    // never steals a tap from a sheep standing below.)
    const top = this.y - (hatOf(this.data) !== null ? HIT_ABOVE_HAT : HIT_ABOVE) - this.hopOffset();
    const bottom = this.y + (labelsOn ? TAG_HIT_BELOW : 4);
    return wx >= this.x - 15 && wx <= this.x + 15 && wy >= top && wy <= bottom;
  }

  onTap(g: Game): void {
    if (this.mode === "shear" || (this.mode === "exit" && this.fade < 0)) return;
    const id = this.data.id;
    if (g.tool === "shears") {
      openMenu("shear", id);
      return;
    }
    const day = dayKey(new Date());
    if (!pettedSet(day).has(id)) {
      recordPet(day, id);
      buzz(12);
      api.pet(id).catch((err: unknown) => {
        // Didn't stick (offline, hiccup): this device can try again. A 404 means the sheep is
        // gone anyway, and a 401 brings up the password gate on its own.
        console.warn("[sheep] pet failed", err);
        forgetPet(day, id);
      });
      this.petReaction();
      window.setTimeout(() => {
        if (!this.dead) openMenu("sheep", id);
      }, 650);
    } else {
      if (this.mode !== "sleep") {
        this.payAttention();
        this.hop(1, 3);
        this.emote("happy");
      } else this.emote("sleep");
      openMenu("sheep", id);
    }
  }

  // ----- shearing -----

  /** `own` = sheared from this device (gets the haptic snips; the other farmer's phone stays still). */
  shear(own = false): Promise<void> {
    if (this.shearing) return this.shearing;
    const golden = this.data.golden;
    this.setMode("shear");
    this.dir = DOWN;
    this.look = "woolly";
    this.hopT = -1;
    this.emoteKind = null;
    startShears(() => (this.dead ? null : { x: this.x, y: this.y }));
    const [snip1 = 0.35, snip2 = 0.7] = SNIP_TIMES;
    const popAt = snip2 + 0.06;
    // Each beat is guarded: a hiccup in an effect must never leave the shear flow hanging.
    const at = (secs: number, fn: () => void) => window.setTimeout(() => guard(fn), secs * 1000);
    this.shearing = new Promise<void>((resolve) => {
      at(snip1, () => {
        sfx("snip");
        if (own) buzz([8, 30, 8]);
        spawnTufts(this.x, this.y, 4, 13);
      });
      at(snip2, () => {
        sfx("snip");
        if (own) buzz([8, 30, 8]);
        spawnTufts(this.x, this.y, golden ? 12 : 9, 10);
        spawnPuff(this.x, this.y - 2, 5, 6);
        // A sheared lamb grows up on the spot (the sheared sprite is always the grown-up one).
        if (this.lambNow) spawnPuff(this.x, this.y - 12, 6, 8);
        this.look = "sheared";
        this.lookUntil = performance.now() + SHEAR_CONFIRM_MS;
        this.hop(1, 2);
      });
      at(popAt, () => {
        sfx("pop");
        launchWool(this.x, this.y, golden ? 2 : 1, golden);
        if (golden) {
          sfx("sparkle", { volume: 0.6 });
          for (let i = 0; i < (reducedMotion ? 2 : 6); i++) spawnSparkle(this.x + (Math.random() - 0.5) * 26, this.y - 4 - Math.random() * 22, 0.4 + Math.random() * 0.4);
        }
      });
      window.setTimeout(
        () => {
          this.shearing = null;
          try {
            if (!this.dead && this.mode === "shear") {
              const g = game;
              // Sheared on the way in from the barn? Finish walking into the pasture first.
              if (g && !inPasture(this.x, this.y, g.layout)) this.comeBack(g);
              else this.startIdle(1.4);
              this.dir = DOWN;
              this.hop(2, 4);
              this.emote("happy");
              // A happy little "baa!" of relief, slightly higher than usual. Lighter, too.
              window.setTimeout(() => !this.dead && this.baa(0.4, 1.12), 120);
            }
          } catch (err) {
            report(err);
          } finally {
            resolve();
          }
        },
        (popAt + WOOL_FLIGHT_TIME) * 1000,
      );
    });
    return this.shearing;
  }

  /** The shear request failed: stop waiting for the server and let the wool pop back now. */
  shearFailed(): void {
    if (this.look === "sheared" && this.data.shearedAt === null) this.lookUntil = 0;
  }

  /** What the sheep looks like right now (animations can run ahead of the server). */
  showSheared(): boolean {
    if (this.look === "woolly") return false;
    if (this.look === "sheared") return true;
    return this.data.shearedAt !== null;
  }

  // ----- drawing -----

  private frameIndex(): number {
    switch (this.mode) {
      case "sleep":
        return ASLEEP;
      case "graze": {
        const t = this.modeT;
        const left = this.modeDur - t;
        if (t < 0.45) return 16 + Math.min(2, Math.floor(t / 0.15));
        if (left < 0.3) return 16 + clamp(Math.floor(left / 0.1), 0, 2);
        return Math.floor((t - 0.45) / 0.38) % 2 === 0 ? 18 : 19;
      }
      case "wait":
        return IDLE_FRAME[DOWN];
    }
    if (this.moving) return WALK_BASE[this.dir] + (Math.floor(this.walkDist / STRIDE) % 4);
    if (this.dir === DOWN && now() < this.blinkUntil) return ASLEEP;
    return IDLE_FRAME[this.dir];
  }

  draw(ctx: CanvasRenderingContext2D): void {
    try {
      this.paint(ctx);
    } catch (err) {
      report(err);
    }
  }

  /** Which sprite sheet we're wearing right now. */
  private currentLook(): HatLook {
    if (this.showSheared()) return "sheared";
    return this.lambNow && hasLambArt() ? "lamb" : "woolly";
  }

  private paint(ctx: CanvasRenderingContext2D): void {
    if (!art || this.mode === "wait" || this.alpha <= 0) return;
    const look = this.currentLook();
    const sheet = art[look];
    const index = this.frameIndex();
    const flip = this.dir === LEFT && (index < 12 || index === 14);
    let fx = Math.round(this.x) - FRAME / 2;
    const fy = Math.round(this.y) - FEET;
    const hop = Math.round(this.hopOffset());
    if (this.shiverUntil > now()) fx += Math.floor(now() * 30) % 2;
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    if (sheet.shadow) drawSheepFrame(ctx, sheet.shadow, sheet.cols, index, fx, fy, flip);
    // The hat is never golden-tinted. Seen from behind it's tucked behind the wool.
    const hat = hatOf(this.data);
    const pl = hat !== null ? hatPlacement(look, index, flip) : null;
    if (hat !== null && pl?.behind) drawHat(ctx, hat, pl.dir, fx + pl.x, fy - hop + pl.y);
    drawSheepFrame(ctx, this.data.golden ? sheet.golden : sheet.body, sheet.cols, index, fx, fy - hop, flip);
    if (hat !== null && pl && !pl.behind) drawHat(ctx, hat, pl.dir, fx + pl.x, fy - hop + pl.y);
  }

  drawEmoteBubble(ctx: CanvasRenderingContext2D, t: number): void {
    if (!this.emoteKind || this.mode === "wait") return;
    const index = this.frameIndex();
    const side = (index >= 4 && index < 8) || index === 14;
    const ex = Math.round(this.x) + (side ? (this.dir === LEFT ? -8 : 8) : 0);
    const look = this.currentLook();
    let top = TOP_ROWS[look][index] ?? 7;
    const hat = hatOf(this.data);
    if (hat !== null) {
      // Float above the hat, not inside it.
      const pl = hatPlacement(look, index, this.dir === LEFT && (index < 12 || index === 14));
      const hatTop = hatTopRow(hat, pl.dir);
      if (hatTop !== null) top = Math.min(top, pl.y + hatTop);
    }
    const ey = Math.round(this.y) - FEET + top - 1 - Math.round(this.hopOffset());
    if (this.alpha < 1) ctx.globalAlpha = this.alpha;
    if (!drawEmote(ctx, this.emoteKind, ex, ey, t - this.emoteAt)) this.emoteKind = null;
    ctx.globalAlpha = 1;
  }

  // ----- layout changes -----

  /** The screen resized: keep our spot in the pasture proportionally, and redo any route. */
  relayout(g: Game, old: Rect): void {
    const l = g.layout;
    const P = l.pasture;
    const remap = (pt: { x: number; y: number }) => {
      pt.x = P.x + ((pt.x - old.x) / old.w) * P.w;
      pt.y = P.y + ((pt.y - old.y) / old.h) * P.h;
    };
    if (this.mode === "wait") {
      this.x = l.barnDoor.x;
      this.y = l.barnDoor.y;
      return;
    }
    const wasInside = contains(inflate(old, 3), this.x, this.y);
    if (wasInside) {
      remap(this);
      clampToPasture(this, l);
    }
    if (this.mode === "enter") {
      const gp = gatePoints(l);
      this.path = wasInside ? [this.pickTarget(l)] : [gp.outside, gp.inside, this.pickTarget(l, gp.inside)];
    } else if (this.mode === "exit") {
      if (this.fade < 0) return;
      const gp = gatePoints(l);
      this.path = wasInside ? [gp.inside, gp.outside, { ...l.barnDoor }] : [gp.outside, { ...l.barnDoor }];
    } else if (this.mode === "walk") {
      for (const pt of this.path) {
        remap(pt);
        clampToPasture(pt, l);
      }
    }
  }
}

// ---------- flock bookkeeping ----------

function spawn(g: Game, s: Sheep, entrance: boolean): void {
  const e = new SheepEntity(s);
  flock.set(s.id, e);
  list.push(e);
  g.add(e);
  if (entrance) e.queueEntrance(g);
  else e.placeRandom(g);
}

function sync(state: FarmState): void {
  const g = game;
  if (!g) return;
  const t = Date.now();
  const seen = new Set<string>();
  for (const s of state.sheep) {
    const e = flock.get(s.id);
    const retired = isRetired(s);
    if (e) {
      seen.add(s.id);
      e.setData(s, g);
      if (retired) e.retire(g);
    } else if (!retired) {
      seen.add(s.id);
      // After the first load, any sheep that shows up came out of the barn (just bought, or
      // un-sheared from the barn's memories). On first load only brand-new ones do.
      const fresh = state.serverNow - s.createdAt < FRESH_MS || t - s.createdAt < FRESH_MS;
      spawn(g, s, !firstSync || fresh);
    }
  }
  for (const e of [...list]) if (!seen.has(e.data.id) && e.mode !== "exit") e.poof();
  firstSync = false;
}

/** Soft separation: sheep standing on top of each other gently shuffle apart. */
function separate(dt: number, l: Layout): void {
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i]!;
    if (!solid(a)) continue;
    for (let j = i + 1; j < n; j++) {
      const b = list[j]!;
      if (!solid(b)) continue;
      const nx = (b.x - a.x) / 15;
      const ny = (b.y - a.y) / 7;
      const d2 = nx * nx + ny * ny;
      if (d2 >= 1) continue;
      const d = Math.sqrt(d2);
      let ux: number;
      let uy: number;
      if (d < 0.001) {
        ux = (i + j) % 2 ? 1 : -1;
        uy = 0;
      } else {
        ux = nx / d;
        uy = ny / d;
      }
      const push = (1 - d) * 14 * dt;
      const aStuck = a.mode === "shear";
      const bStuck = b.mode === "shear";
      const pa = aStuck ? 0 : bStuck ? 2 : 1;
      const pb = bStuck ? 0 : aStuck ? 2 : 1;
      a.x -= ux * push * pa;
      a.y -= uy * push * pa * 0.5;
      b.x += ux * push * pb;
      b.y += uy * push * pb * 0.5;
      clampToPasture(a, l);
      clampToPasture(b, l);
    }
  }
}

/** Scratch state for the per-frame tag layout (no allocation per frame). */
const tagScratch: SheepTag[] = [];
const avoid: TagRect[] = [
  { x: 0, y: 0, w: 0, h: 0 },
  { x: 0, y: 0, w: 0, h: 0 },
];

function scaleRect(r: Rect, s: number, out: TagRect): void {
  out.x = r.x * s;
  out.y = r.y * s;
  out.w = r.w * s;
  out.h = r.h * s;
}

function solid(e: SheepEntity): boolean {
  return e.mode === "idle" || e.mode === "walk" || e.mode === "graze" || e.mode === "sleep" || e.mode === "shear";
}

// ---------- public API ----------

export function initSheep(g: Game): void {
  if (game) return;
  game = g;
  try {
    registerEmoteArt();
    art = buildSheepArt();
  } catch (err) {
    // Without art the sheep are invisible, but the rest of the farm still boots.
    console.error("[sheep] couldn't build the sheep art", err);
  }
  initSheepFx(g);
  lastPasture = pastureOk(g.layout) ? { ...g.layout.pasture } : null;
  forgetOldPets(today);

  // Name tags: on by default, toggled from the toolbar.
  try {
    labelsOn = localStorage.getItem("farm.labels") !== "0";
  } catch {
    // ignore
  }
  setTagsVisible(labelsOn);
  g.on("labels", (on: unknown) => {
    labelsOn = !!on;
    setTagsVisible(labelsOn);
  });

  // Emote bubbles float above everything in the world, and stay readable at night (above the
  // night overlay at 100 and the glow at 110).
  g.addPass({
    order: 111,
    draw(ctx, game) {
      try {
        for (const e of list) e.drawEmoteBubble(ctx, game.time);
      } catch (err) {
        report(err);
      }
      ctx.globalAlpha = 1;
    },
  });

  let retireCheck = 0;
  let todayCheck = 0;
  const tick = (dt: number) => {
    if (!list.length) return;
    if (pastureOk(g.layout)) separate(dt, g.layout);

    retireCheck += dt;
    if (retireCheck > 2) {
      retireCheck = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (e && e.data.shearedAt !== null && isRetired(e.data)) e.retire(g);
        else e?.leavePond(g);
      }
    }
    todayCheck += dt;
    if (todayCheck > 20) {
      todayCheck = 0;
      today = dayKey(new Date());
    }

    // Name tags follow their sheep (just under the hooves), then get laid out together so they
    // stay on screen, out from under the HUD, and off each other. Hidden tags still keep their
    // text and stickers current (a cheap no-op unless something changed; no layout), so switching
    // them back on never replays an ORIGINAL PLAN stamp from earlier.
    if (!labelsOn) {
      for (const e of list) e.tag.update(e.data, e.showSheared(), e.lambNow, today);
      return;
    }
    const s = g.cssScale;
    const dark = g.env.darkness > 0.5;
    tagScratch.length = 0;
    for (const e of list) {
      e.tag.update(e.data, e.showSheared(), e.lambNow, today);
      const asleep = e.mode === "sleep";
      const opacity = e.mode === "wait" ? 0 : e.alpha * (asleep && dark ? 0.7 : 1);
      e.tag.target(e.x * s, (e.y + 2) * s, e.y, opacity, asleep && dark);
      tagScratch.push(e.tag);
    }
    const L = g.layout;
    scaleRect(L.hudClock, s, avoid[0]!);
    scaleRect(L.hudToolbar, s, avoid[1]!);
    layoutTags(tagScratch, screenBounds(hudAvoidRects(avoid)), dt);
  };
  g.on("tick", (dt: number) => {
    try {
      tick(dt);
    } catch (err) {
      report(err);
    }
  });

  g.on("resize", () =>
    guard(() => {
      markTagsDirty();
      // No real pasture right now (keyboard up on a short phone?): the sheep hold still where they
      // are, and get mapped across from the last real pasture once there's one again.
      if (!pastureOk(g.layout)) return;
      const old = lastPasture;
      lastPasture = { ...g.layout.pasture };
      if (!old || (old.x === lastPasture.x && old.y === lastPasture.y && old.w === lastPasture.w && old.h === lastPasture.h)) return;
      if (!(old.w > 0 && old.h > 0)) return;
      for (const e of list) e.relayout(g, old);
    }),
  );

  // Picking up the shears: a couple of woolly sheep do a little double-take. (Sheared ones
  // have nothing left to lose.)
  g.on("tool", (tool: unknown) => guard(() => tool === "shears" && nervousGlances()));

  // The store is shared by every module: a throw in here must not stop the others hearing about it.
  store.changed.on((state) => guard(() => sync(state)));
  store.pets.on(({ sheepId, own }) =>
    guard(() => {
      // Petted from this tab (field or animal card): remember it so a field tap doesn't re-pet.
      if (own) recordPet(dayKey(new Date()), sheepId);
      else flock.get(sheepId)?.remotePet();
    }),
  );
  store.events.on(({ event, own }) =>
    guard(() => {
      if (!event.sheepId) return;
      // ORIGINAL PLAN (renamed right back), from either farmer: the sheep is very proud.
      if (event.kind === "original") flock.get(event.sheepId)?.proud();
      else if (event.kind === "sheared" && !own) void animateShear(event.sheepId, false);
    }),
  );
  if (store.state) guard(() => sync(store.state!));
}

/** A few woolly, awake sheep glance up at the shears ("!" or "?"), staggered. */
function nervousGlances(): void {
  const woolly = list.filter((e) => e.canReact() && !e.showSheared());
  for (let i = woolly.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [woolly[i], woolly[j]] = [woolly[j]!, woolly[i]!];
  }
  woolly.slice(0, 3).forEach((e, i) => {
    window.setTimeout(() => e.canReact() && e.glance(), 120 + i * 260 + Math.random() * 200);
  });
}

async function animateShear(sheepId: string, own: boolean): Promise<void> {
  const e = flock.get(sheepId);
  if (!e || e.dead || e.mode === "wait" || e.mode === "exit") return;
  await e.shear(own);
  // Otto and Milo cheer (for the other farmer's shears too).
  critterCheer(e.x, e.data.golden);
}

/**
 * Animate shearing a sheep from this device (shears swipe, snip, wool pops out, a haptic tick
 * per snip on Android). Resolves when done.
 */
export function playShear(sheepId: string): Promise<void> {
  return animateShear(sheepId, true);
}

/**
 * Optional: call when api.shear() fails so the sheep goes woolly again right away (otherwise it
 * reverts on its own once the server hasn't confirmed within a few seconds).
 */
export function shearFailed(sheepId: string): void {
  flock.get(sheepId)?.shearFailed();
}

/** Easter egg: every sheep jumps and baas at once. */
export function sheepParty(): void {
  const g = game;
  if (!g) return;
  const P = g.layout.pasture;
  const dancers = list.filter((e) => !e.dead && e.mode !== "wait" && e.mode !== "exit" && e.mode !== "enter");
  for (const e of dancers) {
    // A wave from left to right across the pasture.
    const delay = clamp((e.x - P.x) / Math.max(1, P.w), 0, 1) * 900;
    window.setTimeout(() => e.party(), delay);
  }
  // A small choir, not one baa per sheep (that would be... a lot of sheep).
  const choir = dancers
    .map((e) => ({ e, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 4);
  choir.forEach(({ e }, i) => window.setTimeout(() => !e.dead && e.baa(0.45), 140 + i * 260));
}

/** Something big went by at (x, y): up to `n` of the nearest awake sheep within `r` px go "!", one after another. */
export function sheepStartle(x: number, y: number, r: number, n: number): void {
  const near = list.filter((e) => e.canReact() && Math.hypot(e.x - x, e.y - y) <= r);
  near.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  near.slice(0, n).forEach((e, i) => window.setTimeout(() => e.canReact() && e.emote("exclaim"), i * 160));
}

/** Pop an emote above a sheep. */
export function sheepEmote(sheepId: string, kind: EmoteKind): void {
  flock.get(sheepId)?.emote(kind);
}

/** Current world position (feet) of a sheep in the pasture, or null if it isn't out. */
export function sheepPosition(sheepId: string): { x: number; y: number } | null {
  const e = flock.get(sheepId);
  if (!e || e.dead || e.mode === "wait") return null;
  return { x: e.x, y: e.y };
}
