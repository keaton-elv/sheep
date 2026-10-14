// Bigfoot. On a rare night (and always on Oct 20, the anniversary of the Patterson-Gimlin film) a
// very tall, very fuzzy somebody walks past behind the top fence, through Karl the Fog if he's in.
// Halfway across he stops and turns to look right at you (blink... head tilt...), then walks on.
// The birds scatter, Otto and Milo jump, the nearest sheep go "!". Snickers doesn't even look up.
// Tap him for a blurry photo (it goes in the chest). The morning after, a trail of giant footprints
// crosses the pasture on both phones (the night comes from the date), for whoever missed him.
//
// A sighting sets localStorage farm.bigfoot.lastSeen and emits "bigfoot" (Otto writes in about it).
// Debug: ?bigfoot (a Bigfoot night at any hour or weather: he walks 3 s after load, and again 30 s
// after each exit), ?footprints (today's trail at any hour).

import { dayKey } from "../../shared/calendar";
import { preloadSfx, sfx } from "../audio";
import { currentGame, DUSK_HOUR, type Entity, type Game, type Light } from "../engine/game";
import { makeCanvas } from "../engine/pixelart";
import { draw, isReal, REGIONS, SHEETS, sheet, type DrawOpts } from "../engine/sprites";
import { api, ApiError, store } from "../net";
import { isDialogOpen, toast } from "../ui/dom";
import type { Layout } from "../world/layout";
import { smoothstep } from "../world/sky-light";
import { signFeet } from "../world/world-zones";
import { hash2 } from "../world/world-pixels";
import { critterReact, critterStartle, hangout } from "./critter-fox";
import { claimBottomLane, FENCE_HIDE, onLayoutChange, openGrass } from "./critter-place";
import { addSafe, chance, drawShadow, inBox, lsGet, lsSet, onTick, params, rand, reducedMotion, report } from "./critter-util";
import { sheepStartle } from "./sheep";

// The real Stardew sheet: 32x48 cells, feet on the last row, no baked shadow. Row 0 walks right
// (8 frames = 2 steps, 2 and 6 the full strides); row 1 faces the camera (0 eyes open, 2 a blink,
// 6 a head tilt).
SHEETS.bigfoot ??= "sprites/bigfoot.png";
const cell = (key: string, x: number, y: number, w = 32, h = 48): string => {
  REGIONS[key] ??= { sheet: "bigfoot", x, y, w, h };
  return key;
};
const WALK = Array.from({ length: 8 }, (_, i) => cell(`critter.bigfoot.walk.${i}`, 32 * i, 0));
const FRONT = Array.from({ length: 8 }, (_, i) => cell(`critter.bigfoot.front.${i}`, 32 * i, 48));
cell("critter.bigfoot.icon", 4, 48, 24, 24);

export const PHOTO = "item.artifact.blurry-photo";
export const PRINT = "critter.bigfoot.print";

/**
 * How far his body moves on each frame change of the walk (frame i -> i+1), measured off the sheet
 * so the planted foot stays put (2->3 and 6->7 are free: both feet are off the ground for those).
 * He moves in these steps, in time with the frames: gliding between them would skate his feet.
 */
const STRIDE = [2, 12, 5, 8, 5, 5, 4, 8] as const;
const CYCLE_PX = STRIDE.reduce((a, b) => a + b, 0);
/** How far he gets from one passing pose (feet together: frames 0 and 4) to the next. */
const SPAN: Record<number, number> = { 0: STRIDE[0] + STRIDE[1] + STRIDE[2] + STRIDE[3], 4: STRIDE[4] + STRIDE[5] + STRIDE[6] + STRIDE[7] };
/**
 * Each frame's share of the cycle: half even, half by its stride, so the long lunge (1->2) is held
 * a little longer and he doesn't lurch.
 */
const BEAT = STRIDE.map((s) => 0.5 / 8 + (0.5 * s) / CYCLE_PX);
/** Seconds per walk cycle (8 frames, 2 steps): 6 fps on average, about 37 px/s. */
const WALK_CYCLE = 8 / 6;
/** After the flash he hurries off, twice as fast (still in step). */
const HURRY_CYCLE = 8 / 12;
/** The look: [front frame, seconds]. Eyes on you... blink... still looking... head tilt... and off. */
const LOOK: readonly (readonly [number, number])[] = [
  [0, 1.0],
  [2, 0.12],
  [0, 0.5],
  [6, 0.7],
  [0, 0.3],
];
const LOOK_TIME = LOOK.reduce((t, [, s]) => t + s, 0);
/** Where his eyes are in front frames 0 and 6 (cell px), for the glint. */
const EYES: Record<number, readonly [number, number, number, number]> = { 0: [14, 12, 19, 12], 6: [14, 14, 19, 15] };
const GLINT = "#ffbe6e";
const MOONLIT = "rgba(170,186,255,0.2)";
/** Landscape: he turns around (facing you for a beat) before heading back. */
const TURN_TIME = 0.4;

const LS_SEEN = "farm.bigfoot.lastSeen";
const DAY_MS = 86_400_000;
const forced = params.has("bigfoot");
const forcedPrints = params.has("footprints");

// ---------- which nights ----------

const digits = (key: string): number => Number(key.replaceAll("-", ""));
const roll = (key: string): number => hash2(digits(key), 0xb1, 0xf007);

/** The evening a moment belongs to: after noon it's tonight, before noon it's still last night. */
export function eveningKey(d: Date): string {
  if (d.getHours() >= 12) return dayKey(d);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

function daysBefore(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d - n));
}

/** Date-seeded (so both phones agree): about one evening in twelve, never two within five days, always Oct 20. */
export function isBigfootNight(key: string): boolean {
  if (key.endsWith("-10-20")) return true;
  if (roll(key) >= 0.1) return false;
  for (let i = 1; i <= 4; i++) if (roll(daysBefore(key, i)) < 0.1) return false;
  return true;
}

/** The evening this device last saw him ("" if never). */
function seenKey(): string {
  const at = Number(lsGet(LS_SEEN));
  return at > 0 ? eveningKey(new Date(at)) : "";
}

// ---------- the walk ----------

type Phase = "walk" | "look" | "turn" | "hurry";

class Bigfoot implements Entity {
  x: number;
  y = 0;
  layer = 1;
  dead = false;
  /** -1 walking left (portrait, and on the way back in landscape), 1 right. */
  private dir: 1 | -1;
  private phase: Phase = "walk";
  private t = 0;
  private frame = 0;
  private frameT = 0;
  private lookX: number;
  /** Landscape only: where he turns back. */
  private turnX: number | null;
  private looked = false;
  private entered = false;
  private noticed = false;
  private snapped = false;
  private alpha = 1;
  private light: Light = { x: 0, y: 0, radius: 22, color: MOONLIT };
  private opts: DrawOpts = { flipX: false, alpha: 1 };
  /** The eyes as last drawn, while he's looking your way (the glint pass reads these). */
  eyesOn = false;
  ex = 0;
  ey = 0;
  ex2 = 0;
  ey2 = 0;

  constructor(private g: Game) {
    const l = g.layout;
    if (l.portrait) {
      // Behind the top fence, right to left. The sheet faces right, so he's drawn mirrored.
      this.x = l.w + 20;
      this.dir = -1;
      this.lookX = rand(0.4, 0.6) * l.w;
      this.turnX = null;
    } else {
      // No headroom above the fence in landscape: he borrows the bottom lane, like the Trench Coat.
      const p = l.pasture;
      this.x = p.x - 20;
      this.dir = 1;
      this.turnX = Math.max(p.x + 60, hangout(l).x - 24);
      this.lookX = this.x + (this.turnX - this.x) * rand(0.4, 0.6);
    }
    this.y = this.feetY(l);
  }

  private feetY(l: Layout): number {
    return l.portrait ? l.fence.y - 3 : l.pasture.y + l.pasture.h - FENCE_HIDE;
  }

  /** Is he out where you can see him (in landscape, the pasture's left edge is where he fades in)? */
  private get onScreen(): boolean {
    const l = this.g.layout;
    return l.portrait ? this.x > 0 && this.x < l.w : this.x > l.pasture.x && this.x < l.w;
  }

  update(dt: number, g: Game): void {
    const l = g.layout;
    this.y = this.feetY(l);
    this.t += dt;
    if (this.phase === "look") {
      if (this.t >= LOOK_TIME) this.walkOn();
    } else if (this.phase === "turn") {
      if (this.t >= TURN_TIME) {
        this.dir = -1;
        this.walkOn();
      }
    } else {
      const cycle = this.phase === "hurry" ? HURRY_CYCLE : WALK_CYCLE;
      this.frameT += dt;
      while (this.frameT >= cycle * BEAT[this.frame]!) {
        this.frameT -= cycle * BEAT[this.frame]!;
        if (!this.stepFrame()) break;
      }
    }

    if (!l.portrait) {
      // Out of (and back into) Karl at the pasture's left edge.
      this.alpha = Math.max(0, Math.min(1, (this.x - l.pasture.x + 4) / 16));
      if (this.dir < 0 && this.x < l.pasture.x - 20) this.dead = true;
    } else if (this.x < -20) this.dead = true;

    if (!this.entered && (l.portrait ? this.x <= l.w + 8 : this.alpha > 0)) {
      this.entered = true;
      sfx("rustle", { volume: 0.35, pitch: 0.7 });
    }
    if (!this.noticed && (l.portrait ? this.x <= l.w - 16 : this.x >= l.pasture.x + 16)) this.notice(g);

    // Moonlit, so he reads as a silhouette in the dark.
    if (g.env.darkness > 0.45 && this.alpha > 0) {
      this.light.x = this.x;
      this.light.y = this.y - 22;
      g.addLight(this.light);
    }
  }

  /** One frame of the walk: move by that frame's stride, then decide whether to stop. False if he stopped. */
  private stepFrame(): boolean {
    this.x += this.dir * STRIDE[this.frame]!;
    this.frame = (this.frame + 1) % 8;
    // Heavy footfalls on the strides (the fence hides the rest).
    if ((this.frame === 2 || this.frame === 6) && this.onScreen) sfx("thud", { volume: 0.12, pitch: 0.6 });
    // Stops land on a passing pose (feet together), so he never freezes mid-stride.
    const passing = this.frame === 0 || this.frame === 4;
    if (!passing || this.phase !== "walk") return true;
    if (!this.looked && this.lookHere()) {
      this.looked = true;
      this.phase = "look";
    } else if (this.turnX !== null && this.dir > 0 && this.x >= this.turnX) {
      this.phase = "turn";
    } else return true;
    this.t = 0;
    return false;
  }

  /** At a passing pose: is this the one nearest his spot (and not behind the farm sign)? */
  private lookHere(): boolean {
    const ahead = this.dir < 0 ? this.x - this.lookX : this.lookX - this.x;
    if (ahead > SPAN[this.frame]! / 2) return false;
    const l = this.g.layout;
    return !l.portrait || Math.abs(this.x - signFeet(l).x) >= 22;
  }

  private walkOn(): void {
    this.phase = "walk";
    this.t = 0;
    this.frameT = 0;
    this.frame = 0;
  }

  /** He's in view: everybody notices (well, almost everybody). */
  private notice(g: Game): void {
    this.noticed = true;
    const x = this.x;
    const y = this.y;
    g.emit("scare", { x, y: y - 20, r: 90 });
    setTimeout(() => critterStartle(x), 400);
    setTimeout(() => sheepStartle(x, y, 90, 3), 600);
    if (g.env.darkness > 0.6) setTimeout(() => sfx("owl", { volume: 0.4 }), 1500);
    // (Snickers: nothing. Not even a glance.)
    lsSet(LS_SEEN, String(Date.now()));
    try {
      (currentGame ?? g).emit("bigfoot");
    } catch (err) {
      report("bigfoot.emit", err);
    }
  }

  private lookFrame(): number {
    let t = this.t;
    for (let i = 0; i < LOOK.length; i++) {
      const beat = LOOK[i]!;
      if (t < beat[1]) return beat[0];
      t -= beat[1];
    }
    return 0;
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    this.eyesOn = false;
    if (this.alpha <= 0) return;
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    const left = x - 16;
    const top = y - 47;
    drawShadow(ctx, x, y, 20, this.alpha);
    const facing = this.phase === "look" || this.phase === "turn";
    const f = this.phase === "look" ? this.lookFrame() : 0;
    this.opts.flipX = !facing && this.dir < 0;
    this.opts.alpha = this.alpha;
    draw(ctx, facing ? FRONT[f]! : WALK[this.frame]!, left, top, this.opts);
    const eyes = this.phase === "look" ? EYES[f] : undefined;
    const env = g.env;
    if (eyes && (env.darkness > 0.2 || env.weather === "fog")) {
      this.eyesOn = true;
      this.ex = left + eyes[0];
      this.ey = top + eyes[1];
      this.ex2 = left + eyes[2];
      this.ey2 = top + eyes[3];
    }
  }

  hit(wx: number, wy: number): boolean {
    if (this.phase === "hurry" || this.phase === "turn" || this.alpha < 0.6 || !this.onScreen) return false;
    // Head and shoulders only (his legs are behind the fence anyway).
    return inBox(wx, wy, this.x - 11, this.y - 44, 22, 26);
  }

  onTap(g: Game): void {
    sfx("camera");
    startFlash();
    if (!this.noticed) this.notice(g);
    // Caught on camera: he breaks off the look and hurries on (in landscape, back the way he came).
    if (this.turnX !== null) this.dir = -1;
    this.looked = true;
    this.phase = "hurry";
    this.t = 0;
    this.frameT = 0;
    if (this.snapped) return;
    this.snapped = true;
    toast("Got him! ...It's blurry.", { icon: PHOTO });
    sendPhoto(1);
  }
}

function sendPhoto(retries: number): void {
  api.collectItem(PHOTO).catch((err: unknown) => {
    const status = err instanceof ApiError ? err.status : 0;
    if (retries > 0 && (status === 0 || status >= 500)) {
      window.setTimeout(() => sendPhoto(retries - 1), 4000);
      return;
    }
    toast("Couldn't reach the chest...", { icon: PHOTO });
  });
}

// ---------- the flash ----------

const FLASH_PEAK = reducedMotion ? 0.25 : 0.55;
const FLASH_TIME = reducedMotion ? 0.3 : 0.16;
let flash = 0;

function startFlash(): void {
  flash = FLASH_TIME;
}

// ---------- the footprints ----------

// A right foot, toes up (one char = one pixel). On the ground it's turned so the toes point left,
// the way he walked; left feet are its mirror image.
const FOOT = ["x.x.x", ".....", ".xxx.", "xxxxx", "xxxxx", ".xxxx", ".xxx.", ".xxx.", "..xx."];
const FOOT_COLOR = "rgba(56,34,20,0.68)";
const FOOT_SNOW = "rgba(110,130,165,0.5)";
/** The lit far edge of each dent (light comes from the top left), so they read as pressed in, not as dirt. */
const RIM = "rgba(255,236,190,0.45)";
const RIM_SNOW = "rgba(255,255,255,0.7)";
const PRINTS = 7;

/** The print on its side (9x5, toes left, plus its rim); `left` mirrors it top to bottom. */
function sidePrint(color: string, rim: string, left: boolean): HTMLCanvasElement {
  const on = (x: number, y: number): boolean => {
    if (x < 0 || x > 8 || y < 0 || y > 4) return false;
    // Rotated a quarter turn counterclockwise: the top row (the toes) becomes the left column.
    const c = 4 - (left ? 4 - y : y);
    return FOOT[x]![c] === "x";
  };
  return makeCanvas(null, 10, 6, (ctx) => {
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 10; x++) {
        if (on(x, y)) ctx.fillStyle = color;
        else if (on(x - 1, y - 1) || on(x, y - 1)) ctx.fillStyle = rim;
        else continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });
}

interface Print {
  on: boolean;
  x: number;
  y: number;
  left: boolean;
}

class Footprints implements Entity {
  x = 0;
  y = 0;
  layer = 0;
  private prints: Print[] = Array.from({ length: PRINTS }, () => ({ on: false, x: 0, y: 0, left: false }));
  private art: HTMLCanvasElement[] | null = null;
  private builtFor = "";
  private builtLayout: Layout | null = null;
  private morning = false;
  private checkIn = 0;
  private alpha = 0;

  update(dt: number, g: Game): void {
    this.checkIn -= dt;
    if (this.checkIn <= 0) {
      this.checkIn = 3;
      this.refresh(g);
    }
    if (!this.morning) {
      this.alpha = 0;
      return;
    }
    const env = g.env;
    const h = env.hour;
    const wet = env.weather === "rain" || env.weather === "storm";
    if (forcedPrints) this.alpha = 1;
    else this.alpha = !wet && h >= 5.5 && h < 12 ? 1 - smoothstep(10, 12, h) : 0;
  }

  /** Is it the morning after? (Checked every few seconds, not every frame.) */
  private refresh(g: Game): void {
    const now = g.env.now;
    const lastNight = eveningKey(now);
    this.morning = forcedPrints || (now.getHours() < 12 && (isBigfootNight(lastNight) || seenKey() === lastNight));
    if (!this.morning) return;
    const today = dayKey(now);
    if (today === this.builtFor && g.layout === this.builtLayout) return;
    this.builtFor = today;
    this.builtLayout = g.layout;
    this.layTrail(g.layout, digits(today));
  }

  /** A gentle diagonal across the top third of the pasture, right to left, the same on both phones. */
  private layTrail(l: Layout, seed: number): void {
    const p = l.pasture;
    const ax = p.x + p.w + 4;
    const ay = p.y + 10;
    const bx = p.x - 4;
    const by = p.y + p.h * 0.35;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    // His right side while walking that way (right feet land on it, left feet on the other).
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    for (let i = 0; i < PRINTS; i++) {
      const k = i / (PRINTS - 1);
      const left = i % 2 === 1;
      const side = left ? -3 : 3;
      const pr = this.prints[i]!;
      pr.x = Math.round(ax + (bx - ax) * k + nx * side + (hash2(seed, i, 0xf00d) - 0.5) * 4);
      pr.y = Math.round(ay + (by - ay) * k + ny * side + (hash2(seed, i + 16, 0xf00d) - 0.5) * 4);
      pr.left = left;
      pr.on = openGrass(l, pr.x, pr.y, 4);
    }
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.alpha <= 0.01) return;
    const art = (this.art ??= [sidePrint(FOOT_COLOR, RIM, false), sidePrint(FOOT_COLOR, RIM, true), sidePrint(FOOT_SNOW, RIM_SNOW, false), sidePrint(FOOT_SNOW, RIM_SNOW, true)]);
    const snow = g.env.season === "winter" ? 2 : 0;
    ctx.globalAlpha = this.alpha;
    for (const pr of this.prints) if (pr.on) ctx.drawImage(art[snow + (pr.left ? 1 : 0)]!, pr.x - 4, pr.y - 2);
    ctx.globalAlpha = 1;
  }

  hit(wx: number, wy: number): boolean {
    if (this.alpha < 0.3) return false;
    for (const pr of this.prints) if (pr.on && Math.abs(wx - pr.x) <= 7 && Math.abs(wy - pr.y) <= 7) return true;
    return false;
  }

  onTap(_g: Game, wx: number): void {
    sfx("rustle", { volume: 0.3, pitch: 0.8 });
    critterReact("question", wx);
    const today = this.builtFor;
    if (lsGet("farm.bigfoot.prints") === today) return;
    lsSet("farm.bigfoot.prints", today);
    toast("Huge footprints... Milo measured one. Three Milos long.", { icon: PRINT });
  }
}

// ---------- art for the chest & the mailbox ----------

function registerBigfootArt(): void {
  // The blurry photo: a little instant print, Karl-grey, with a smudge of somebody tall in it.
  makeCanvas(PHOTO, 16, 16, (ctx) => {
    ctx.fillStyle = "#8a7a5e";
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = "#f4ead2";
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = "#b9c6c0";
    ctx.fillRect(2, 2, 12, 5);
    ctx.fillStyle = "#9fb0a8";
    ctx.fillRect(2, 7, 12, 5);
    const img = sheet("bigfoot");
    if (img) {
      // Shrunk without smoothing, twice, a pixel apart: that's the blur.
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, 3, 48 + 5, 27, 43, 5, 3, 6, 9);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(img, 3, 48 + 5, 27, 43, 6, 3, 6, 9);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = "#3a2618";
      ctx.fillRect(6, 5, 4, 7);
    }
  });
  // One footprint, toes up (the letter's gift and the toast icon).
  makeCanvas(PRINT, 12, 12, (ctx) => {
    ctx.fillStyle = "#5a3a24";
    for (let r = 0; r < FOOT.length; r++) for (let c = 0; c < 5; c++) if (FOOT[r]![c] === "x") ctx.fillRect(4 + c, 2 + r, 1, 1);
  });
}

// ---------- spawning ----------

let game: Game | null = null;
let walker: Bigfoot | null = null;

/** Is he out there right now, or did he already walk this evening? (No Trench Coat on a Bigfoot night.) */
export function bigfootTonight(): boolean {
  if (walker && !walker.dead) return true;
  return !!game && seenKey() === eveningKey(game.env.now);
}

/** Tonight's the night, it's dusk (or dawn), it's dry, and he hasn't been by this evening. */
function canWalk(g: Game): boolean {
  const env = g.env;
  if (env.weather === "rain" || env.weather === "storm") return false;
  const h = env.hour;
  if (!(h >= DUSK_HOUR[env.season] - 0.5 || h < 1 || (h >= 5 && h < 7.5))) return false;
  const key = eveningKey(env.now);
  if (seenKey() === key) return false;
  const coat = Number(lsGet("farm.trenchcoat.lastSeen"));
  if (coat > 0 && Date.now() - coat < DAY_MS / 2) return false;
  const founded = store.state?.foundedAt;
  if (!key.endsWith("-10-20") && (!founded || env.now.getTime() - founded < 3 * DAY_MS)) return false;
  // Karl the Fog brings him out more often.
  return isBigfootNight(key) || (env.weather === "fog" && hash2(digits(key), 0xb2, 0xf007) < 0.25);
}

function spawn(g: Game): void {
  if (!isReal(WALK[0]!)) return; // no hand-drawn Bigfoot: real sheet or nothing
  const b = new Bigfoot(g);
  if (!g.layout.portrait && !claimBottomLane(b)) return;
  walker = addSafe(g, b, "bigfoot");
  preloadSfx("owl", "camera");
}

export function initBigfoot(g: Game): void {
  game = g;
  registerBigfootArt();
  addSafe(g, new Footprints(), "bigfoot.prints");

  let rollIn = forced ? 3 : 15;
  onTick(g, "bigfoot", (dt) => {
    if (flash > 0) flash = Math.max(0, flash - dt);
    if (walker?.dead) {
      walker = null;
      if (forced) rollIn = 30;
    }
    rollIn -= dt;
    if (rollIn > 0 || walker) return;
    if (forced) {
      spawn(g);
      rollIn = walker ? Infinity : 2; // the next one is queued when this one leaves
      return;
    }
    rollIn = 15;
    // (Never under the title screen: once he's walked past, that's the evening.)
    if (g.time < 20 || !g.shown || document.hidden || isDialogOpen() || !canWalk(g) || !chance(0.3)) return;
    spawn(g);
  });

  g.addPass({
    order: 115, // above the night overlay and the fog: two amber pixels looking right at you
    draw: (ctx) => {
      const b = walker;
      if (!b || !b.eyesOn) return;
      ctx.save();
      try {
        ctx.globalAlpha = Math.min(0.95, 0.4 + g.env.darkness);
        ctx.fillStyle = GLINT;
        ctx.fillRect(b.ex, b.ey, 1, 1);
        ctx.fillRect(b.ex2, b.ey2, 1, 1);
      } catch (err) {
        report("bigfoot.eyes", err);
      } finally {
        ctx.restore();
      }
    },
  });

  g.addPass({
    order: 120, // the camera flash, over everything
    draw: (ctx) => {
      if (flash <= 0) return;
      ctx.save();
      ctx.globalAlpha = FLASH_PEAK * (flash / FLASH_TIME);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, g.w, g.h);
      ctx.restore();
    },
  });

  onLayoutChange(g, "bigfoot", () => {
    if (walker) walker.dead = true;
  });
}
