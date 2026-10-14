// The critter corner: Otto the fox and Milo the hedgehog, best friends, with their mossy stump
// and gingham blanket, and (very rarely) a raccoon peeking out of the stump. On Wednesdays there's
// a bottle of wine and two glasses on the blanket (Wine Wednesday). Late on a Wine Wednesday, while
// Otto and Milo sleep, two raccoons might turn up arm in arm by the bottle: tap them and they scatter
// (somebody finished the wine...). They cheer every shearing, and jump when something big walks by.
//
// Debug: ?raccoon ?wineraccoons ?cheer
//
// Corner-local coordinates (0..60 x 0..31) are used for everything here, so the hangout
// follows layout.critterCorner around on resize.

import { dayKey } from "../../shared/calendar";
import { preloadSfx, sfx } from "../audio";
import type { Entity, Game, Light } from "../engine/game";
import { draw, has, REGIONS, SHEETS, size, type DrawOpts } from "../engine/sprites";
import { say, toast } from "../ui/dom";
import type { Layout } from "../world/layout";
import type { EmoteKind } from "./emotes";
import { RACCOON2_RUN, RACCOON_PAIR, RACCOON_RUN, WINE, WINE_TIPPED } from "./critter-lore-art";
import { bottomLaneBusy, claimBottomLane } from "./critter-place";
import { NameTag } from "./critter-tag";
import { addSafe, chance, dotPuff, drawAnchored, drawPart, drawShadow, Emote, heartFloat, inBox, lsGet, lsSet, onTick, params, rand } from "./critter-util";

// The raccoons live in the real Stardew raccoon sheet (512x256, 16x8 frames of 32x32).
// Frame 0 faces the camera; frame 8 is the rounder one. We only ever show their heads.
SHEETS.raccoons ??= "sprites/raccoons.png";
REGIONS["critter.raccoon.peek"] ??= { sheet: "raccoons", x: 8, y: 12, w: 16, h: 16 };
REGIONS["critter.raccoon2.peek"] ??= { sheet: "raccoons", x: 264, y: 12, w: 16, h: 16 };

// ---------- layout (corner-local) ----------

// The stump sits up and to the left, out of Milo's way (he used to stand right in front of it).
const STUMP = { x: 7, y: 9 };
const BLANKET = { x: 24, y: 16 };
const FOX_HOME = { x: 36, y: 22 };
const HOG_HOME = { x: 20, y: 27 };
const HOG_AREA = { x0: 15, x1: 27, y0: 22, y1: 30 };
/** Where the hedgehog stands to touch noses with the fox (fox lying at home, facing left). */
const NUZZLE = { x: FOX_HOME.x - 15, y: FOX_HOME.y - 3 };
/** Where the fox lands its mousing pounce. */
const POUNCE = { x: 48, y: 29 };
/** Where the hedgehog sleeps, tucked against the curled-up fox. */
const SNUGGLE = { x: FOX_HOME.x - 15, y: FOX_HOME.y + 1 };
/** Wine Wednesday: the bottle and two glasses, on the front of the blanket. */
const WINE_SPOT = { x: 52, y: 28 };
const GLASS_SPOTS = [
  { x: 41, y: 27 },
  { x: 45, y: 28 },
];
/** The raccoon couple's feet: right among the glasses and the bottle. */
const PAIR_SPOT = { x: 46, y: 31 };
/** Where the grey one turns up toward the stump (out in front of everyone, then straight up). */
const STUMP_PATH = [
  { x: 12, y: 31 },
  { x: STUMP.x + 2, y: STUMP.y + 2 },
];
const MOONLIT = "rgba(170,186,255,0.3)";

const WINE_RACCOONS = params.has("wineraccoons");
const CHEER_DEBUG = params.has("cheer");

/** Wednesdays are Wine Wednesdays. */
export function wineDay(g: Game): boolean {
  return WINE_RACCOONS || g.env.now.getDay() === 3;
}

/**
 * Top-left of the hangout in world px: simply the layout's critter corner (the layout keeps it
 * clear of the bottom fence rail, so everything down to local y 31 stays in view).
 */
export function hangout(l: Layout): { x: number; y: number } {
  return l.critterCorner;
}

const dimCache = new Map<string, { w: number; h: number }>();
function dims(key: string): { w: number; h: number } {
  let d = dimCache.get(key);
  if (!d) {
    d = size(key) ?? { w: 1, h: 1 };
    dimCache.set(key, d);
  }
  return d;
}

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// ---------- lines ----------

const FOX_LINES = [
  'Otto swishes his tail. That\'s fox for "hello..."',
  "Otto hiked Mt. Tam this morning. He'd like a nap now.",
  "Otto spotted dolphins off Crissy Field! (Porpoises. Don't tell him.)",
  "Otto would like you to know this is HIS blanket. (Milo may borrow it.)",
  "Otto sniffs your hand. You smell like sheep...",
  "Otto is watching the sheep. Not hungrily. Just... supervising.",
  'Otto blinks at you slowly. In fox, that means "I trust you."',
  "Otto pretends he didn't just pounce on a leaf...",
  "Otto has heard about karaoke. Otto is not going to karaoke.",
  "Otto swears he saw a ladybug knight riding a bumblebee. Milo believes him.",
  "Otto's favorite season is whichever one has Milo in it.",
];
const FOX_FOG_LINE = "Otto loves Karl the Fog. Perfect sneaking weather.";
const FOX_SLEEP_LINES = [
  "Otto and Milo are fast asleep. Shhh...",
  "Zzz... Otto's paw twitches. He's dreaming about butterflies.",
  "Milo snores very softly. Otto doesn't mind one bit... Zzz...",
  "Zzz... Maybe you two should head to bed, too?",
];
const HOG_LINES = [
  "Milo curls into a spiky little ball... then peeks at you.",
  "Milo would like you to know he is NOT a chestnut.",
  "Milo's nose wiggles. He smells... a beetle.",
  "You try not to boop Milo. You fail. Boop.",
  "Milo found a crumb of Arsicault croissant. Best day ever.",
  "Milo went to a sketching meetup. He drew Otto. (It's a circle.)",
  "Milo is guarding the stump. The raccoon owes him a favor.",
  "Milo snuffles like a tiny teakettle.",
  "Milo unrolls with great dignity, as if nothing happened.",
];
const HOG_SLEEP_LINES = [
  "Milo curls up tighter without waking up. Zzz...",
  "Shhh... Milo is dreaming about beetles. Big ones.",
  "Milo scoots closer to Otto in his sleep. Zzz...",
];
const STUMP_LINES = [
  "A hollow stump. It smells like berries... and trash.",
  "You knock. Something inside knocks back...",
  'A tiny sign: "RACCOON RESIDENCE. NO SOLICITING."',
  "There's a tiny coat hook on the stump. It's empty...",
  'Tiny letters in the bark: "knock five times, quickly." Hmm...',
];
const RACCOON_LINES: string[][] = [
  ["A raccoon pops out of the stump!", "It nods at your sheep approvingly... and ducks back inside."],
  ["A raccoon eyes the shared chest hopefully...", "...then waves a tiny paw instead."],
  ["A second, rounder raccoon peeks out.", "You hear tiny furniture being rearranged..."],
  ["Something inside the stump goes clunk.", "The raccoon peeks out to see if you noticed. You did."],
];
/** Every so often, a peek at how many raccoons actually live in there. */
const TRENCH_RACCOON_LINES = ["A raccoon pops out of the stump!", "Behind it: ninety-nine more raccoons... and a trench coat on a tiny hook."];
/** What five quick knocks gets you (the raccoon always answers those). */
const SECRET_KNOCK_LINES = ["Knock-knock-knock-knock-knock!", "A raccoon pops out, delighted. Nobody knocks properly anymore..."];

// ---------- fox ----------

type FoxPose = "sit" | "lie" | "sleep" | "walk" | "leap" | "dive";
type FoxState = "lie" | "sit" | "alert" | "sleep" | "wake" | "pounce" | "walk" | "sunbathe" | "nuzzle" | "party";

interface PoseMeta {
  anchor: number; // sprite column that sits at the fox's x
  head: number; // sprite column for the emote bubble
  shadowX: number;
  shadow: number;
  scarf?: { x: number; y: number; key: string; w: number };
}

const POSE: Record<FoxPose, PoseMeta> = {
  lie: { anchor: 24, head: 24, shadowX: 15, shadow: 28, scarf: { x: 17, y: 10, key: "fox.scarf", w: 14 } },
  sit: { anchor: 14, head: 14, shadowX: 11, shadow: 20, scarf: { x: 7, y: 10, key: "fox.scarf", w: 14 } },
  sleep: { anchor: 10, head: 10, shadowX: 10, shadow: 22, scarf: { x: 3, y: 11, key: "fox.scarf.ball", w: 14 } },
  walk: { anchor: 23, head: 25, shadowX: 17, shadow: 26, scarf: { x: 18, y: 10, key: "fox.scarf", w: 14 } },
  leap: { anchor: 23, head: 25, shadowX: 17, shadow: 22, scarf: { x: 18, y: 10, key: "fox.scarf", w: 14 } },
  dive: { anchor: 8, head: 8, shadowX: 8, shadow: 14 },
};

const DIVE_KEYS = [
  ["fox.dive.0", "fox.dive.1"],
  ["fox.dive.0.winter", "fox.dive.1.winter"],
] as const;

class Fox implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  lx = FOX_HOME.x;
  ly = FOX_HOME.y;
  flip = true; // facing left, toward the stump and the hedgehog
  state: FoxState = "lie";
  t = 0;
  dur = rand(8, 16);
  emote = new Emote();
  tag = new NameTag("Otto");
  pose: FoxPose = "lie";
  key = "fox.lie.0";
  hop = 0;
  // idle fidgets
  blinkIn = rand(1, 4);
  blink = 0;
  earIn = rand(3, 7);
  ear = 0;
  swishIn = rand(2, 5);
  swish = 0;
  // pounce / walk
  phase = 0;
  ax = 0;
  ay = 0;
  bx = 0;
  by = 0;
  tx = 0;
  ty = 0;
  // hit box from the last draw
  hx = 0;
  hy = 0;
  hw = 0;
  hh = 0;
  tapCount = 0;

  constructor(private corner: Corner) {}

  get atHome(): boolean {
    return Math.abs(this.lx - FOX_HOME.x) < 1 && Math.abs(this.ly - FOX_HOME.y) < 1;
  }

  get asleep(): boolean {
    return this.state === "sleep";
  }

  /** Lying at home, awake, not busy: ready for a hedgehog visit. */
  get cuddleable(): boolean {
    return (this.state === "lie" || this.state === "sunbathe") && this.atHome && this.flip;
  }

  set(state: FoxState, dur = 0): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
    this.phase = 0;
  }

  walkTo(x: number, y: number): void {
    this.tx = x;
    this.ty = y;
    this.set("walk");
  }

  /** Back to the blanket (lying down facing the stump), or to sleep if it's night. */
  goHome(): void {
    if (this.atHome) {
      this.flip = true;
      this.set(this.corner.night ? "sleep" : "lie", rand(10, 22));
    } else this.walkTo(FOX_HOME.x, FOX_HOME.y);
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.emote.update(dt);
    const env = g.env;
    const night = env.isNight;

    // Fidget timers (only shown in some poses).
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blink = 0.14;
      this.blinkIn = rand(2.2, 5.5);
    }
    if (this.blink > 0) this.blink -= dt;
    this.earIn -= dt;
    if (this.earIn <= 0) {
      this.ear = 0.2;
      this.earIn = rand(4, 9);
    }
    if (this.ear > 0) this.ear -= dt;
    this.swishIn -= dt;
    if (this.swishIn <= 0) {
      this.swish = rand(0.5, 1.1);
      this.swishIn = rand(3, 7);
    }
    if (this.swish > 0) this.swish -= dt;

    switch (this.state) {
      case "lie":
      case "sunbathe":
        this.pose = "lie";
        if (night) this.set("sleep");
        else if (this.t > this.dur) this.chooseNext(g);
        break;
      case "sit":
      case "alert":
        this.pose = "sit";
        if (this.t > this.dur) this.goHome();
        break;
      case "wake":
        this.pose = "sit";
        if (this.t > this.dur) this.goHome();
        break;
      case "party":
        this.pose = "sit";
        this.swish = 0.3;
        if (this.t > this.dur) this.goHome();
        break;
      case "nuzzle":
        this.pose = "lie";
        if (this.t > this.dur) this.set("lie", rand(10, 20));
        break;
      case "sleep":
        this.pose = "sleep";
        if (!this.atHome) this.walkTo(FOX_HOME.x, FOX_HOME.y);
        else if (!night) {
          this.set("wake", 3.5);
          this.emote.show("happy", 0.4);
        }
        break;
      case "walk":
        this.updateWalk(dt);
        break;
      case "pounce":
        this.updatePounce(dt, g);
        break;
    }

    const c = hangout(g.layout);
    this.x = c.x + this.lx;
    this.y = c.y + this.ly;
    this.key = this.frameKey(g);
  }

  private chooseNext(g: Game): void {
    const env = g.env;
    const sunny = env.weather === "sunny" && env.season === "summer" && env.hour > 10 && env.hour < 17;
    const r = Math.random();
    if (sunny && r < 0.35) {
      this.set("sunbathe", rand(25, 45));
    } else if (r < 0.35) {
      this.set("sit", rand(6, 12));
    } else if (r < 0.55 && this.corner.pounceClear()) {
      this.startPounce();
    } else {
      this.set("lie", rand(12, 26));
    }
  }

  startPounce(): void {
    this.set("pounce");
    this.ax = this.lx;
    this.ay = this.ly;
    // Mousing pounce: turn toward the open grass on the right (the leaf pile in fall!) and dive in.
    this.flip = false;
    this.bx = POUNCE.x;
    this.by = POUNCE.y;
  }

  private updateWalk(dt: number): void {
    this.pose = "walk";
    const dx = this.tx - this.lx;
    const dy = this.ty - this.ly;
    const d = Math.hypot(dx, dy);
    const step = 20 * dt;
    if (Math.abs(dx) > 0.5) this.flip = dx < 0;
    if (d <= step) {
      this.lx = this.tx;
      this.ly = this.ty;
      if (this.atHome) {
        this.flip = true;
        this.set(this.corner.night ? "sleep" : "lie", rand(10, 22));
      } else this.set("sit", rand(2, 4));
    } else {
      this.lx += (dx / d) * step;
      this.ly += (dy / d) * step;
    }
  }

  private updatePounce(dt: number, g: Game): void {
    const CROUCH = 0.9;
    const LEAP = 0.55;
    const DIVE = 1.4;
    const OUT = 1.8;
    if (this.phase === 0) {
      // Butt wiggle before the leap (the tail swishes like mad).
      this.pose = "sit";
      this.swish = 0.2;
      if (this.t > CROUCH) {
        this.phase = 1;
        this.t = 0;
        sfx("woosh", { volume: 0.5 });
      }
    } else if (this.phase === 1) {
      this.pose = "leap";
      const k = Math.min(1, this.t / LEAP);
      this.lx = this.ax + (this.bx - this.ax) * k;
      this.ly = this.ay + (this.by - this.ay) * k;
      this.hop = Math.sin(Math.PI * k) * 13;
      if (k >= 1) {
        this.phase = 2;
        this.t = 0;
        this.hop = 0;
        const c = hangout(g.layout);
        const winter = g.env.season === "winter";
        const fall = g.env.season === "fall";
        dotPuff(c.x + this.lx, c.y + this.ly - 2, winter ? ["#ffffff", "#dfe8f5"] : fall ? ["#e8742a", "#ffad45", "#5f9e45"] : ["#5f9e45", "#86c05a", "#3f7a34"], 10);
        sfx("rustle");
      }
    } else if (this.phase === 2) {
      this.pose = "dive";
      if (this.t > DIVE) {
        this.phase = 3;
        this.t = 0;
        const c = hangout(g.layout);
        dotPuff(c.x + this.lx, c.y + this.ly - 4, g.env.season === "winter" ? ["#ffffff"] : ["#5f9e45", "#86c05a"], 6);
        this.emote.show(pick<EmoteKind>(["dots", "dots", "happy", "happy", "exclaim", "question"]));
      }
    } else {
      this.pose = "sit";
      if (this.t > OUT) this.goHome();
    }
  }

  private frameKey(g: Game): string {
    const t = g.time;
    switch (this.pose) {
      case "lie": {
        if (this.state === "sunbathe" || this.state === "nuzzle") return this.swish > 0 && Math.floor(t * 4) % 2 ? "fox.lie.1.blink" : "fox.lie.0.blink";
        const tail = this.swish > 0 && Math.floor(t * 4) % 2 === 1;
        if (this.blink > 0) return tail ? "fox.lie.1.blink" : "fox.lie.0.blink";
        if (this.ear > 0 && !tail) return "fox.lie.0.ear";
        return tail ? "fox.lie.1" : "fox.lie.0";
      }
      case "sit": {
        const tail = this.swish > 0 && Math.floor(t * (this.state === "pounce" ? 10 : 4)) % 2 === 1;
        if (this.blink > 0) return tail ? "fox.sit.1.blink" : "fox.sit.0.blink";
        if (this.ear > 0 && !tail) return "fox.sit.0.ear";
        return tail ? "fox.sit.1" : "fox.sit.0";
      }
      case "sleep":
        return Math.floor(t / 1.4) % 2 ? "fox.sleep.1" : "fox.sleep.0";
      case "walk":
        return Math.floor(t * 7) % 2 ? "fox.walk.1" : "fox.walk.0";
      case "leap":
        return "fox.leap";
      case "dive": {
        const f = Math.floor(t * 5) % 2;
        return DIVE_KEYS[g.env.season === "winter" ? 1 : 0]![f]!;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const meta = POSE[this.pose];
    const d = dims(this.key);
    const flip = this.flip;
    const fx = Math.round(this.x);
    const fy = Math.round(this.y - this.hop);
    const left = flip ? fx - (d.w - 1 - meta.anchor) : fx - meta.anchor;
    const shadowX = flip ? left + (d.w - 1 - meta.shadowX) : left + meta.shadowX;
    drawShadow(ctx, shadowX, this.y, meta.shadow * (this.hop > 0 ? Math.max(0.5, 1 - this.hop / 30) : 1));
    drawAnchored(ctx, this.key, d.w, d.h, meta.anchor, fx, fy, flip);
    const top = fy - d.h;

    const season = g.env.season;
    if (season === "winter" && meta.scarf) {
      const breath = this.key === "fox.sleep.1" ? 1 : 0;
      drawPart(ctx, meta.scarf.key, meta.scarf.w, left, top + breath, d.w, meta.scarf.x, meta.scarf.y, flip);
    }
    if (this.state === "sunbathe") drawPart(ctx, "fox.shades", 9, left, top, d.w, 20, 5, flip);

    this.hx = left;
    this.hy = top;
    this.hw = d.w;
    this.hh = d.h;
    const headX = flip ? left + (d.w - 1 - meta.head) : left + meta.head;
    const headY = top + (this.pose === "lie" ? 1 : 0);
    this.emote.draw(ctx, headX, headY);
    // Above the emote bubble (16px tall).
    this.tag.follow(g, headX, headY - 17);
  }

  hit(wx: number, wy: number): boolean {
    return inBox(wx, wy, this.hx - 3, this.hy - 3, this.hw + 6, this.hh + 6);
  }

  onTap(g: Game): void {
    this.corner.tapped("fox", g);
    this.tag.show();
    this.tapCount++;
    if (this.asleep) {
      this.emote.show("sleep");
      if (this.tapCount % 3 === 0) void say(pick(FOX_SLEEP_LINES));
      return;
    }
    sfx("yip", { volume: 0.8, pitch: rand(0.95, 1.06) });
    this.emote.show(pick<EmoteKind>(["heart", "heart", "happy", "music", "exclaim"]));
    if ((this.state === "lie" || this.state === "sunbathe") && this.atHome && chance(0.5)) this.set("sit", rand(3, 6));
    if (this.tapCount % 3 === 0) {
      const season = g.env.season;
      let line = pick(FOX_LINES);
      if (this.state === "sunbathe") line = "Otto is sunbathing. Very cool shades.";
      else if (g.env.weather === "fog" && chance(0.5)) line = FOX_FOG_LINE;
      else if (season === "winter" && chance(0.3)) line = "Otto's little red scarf was a gift from Milo.";
      void say(line);
    }
  }

  /** React to something happening nearby (a bunny, birds, the raccoon...). */
  react(kind: EmoteKind, towardX: number | null): void {
    if (this.asleep || this.state === "pounce" || this.state === "walk") return;
    if (towardX !== null && this.state !== "nuzzle") this.flip = towardX < this.x;
    if (this.state !== "nuzzle") this.set("alert", rand(2.5, 4));
    this.emote.show(kind);
  }
}

// ---------- hedgehog ----------

type HogState = "idle" | "walk" | "ball" | "peek" | "nuzzle" | "sleep" | "party";
type HogNext = "idle" | "nuzzle" | "sleep";

interface HogMeta {
  anchor: number;
  head: number;
  shadow: number;
  hat: [number, number];
  /** Spring flower, perched on top of the spines. */
  back: [number, number];
  /** Fall leaf, tucked down on his rear spines (inside the outline, so he stays round). */
  leaf: [number, number];
}
const HOG_META: Record<"stand" | "sleep" | "ball", HogMeta> = {
  stand: { anchor: 9, head: 13, shadow: 15, hat: [10, -2], back: [4, -3], leaf: [2, 3] },
  sleep: { anchor: 8, head: 12, shadow: 15, hat: [9, -1], back: [3, -3], leaf: [2, 3] },
  ball: { anchor: 8, head: 8, shadow: 14, hat: [4, -4], back: [5, -3], leaf: [2, 3] },
};

class Hedgehog implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  lx = HOG_HOME.x;
  ly = HOG_HOME.y;
  flip = false;
  state: HogState = "idle";
  t = 0;
  dur = rand(2, 5);
  emote = new Emote();
  tag = new NameTag("Milo");
  key = "hedgehog.idle.0";
  form: "stand" | "sleep" | "ball" = "stand";
  hop = 0;
  sniff = 0;
  sniffIn = rand(1, 3);
  tx = 0;
  ty = 0;
  next: HogNext = "idle";
  visitIn = rand(12, 30);
  ballFrom: "idle" | "sleep" = "idle";
  hx = 0;
  hy = 0;
  hw = 0;
  hh = 0;
  tapCount = 0;

  constructor(private corner: Corner) {}

  set(state: HogState, dur = 0): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  walkTo(x: number, y: number, next: HogNext): void {
    this.tx = x;
    this.ty = y;
    this.next = next;
    this.set("walk");
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.emote.update(dt);
    this.visitIn -= dt;
    const night = g.env.isNight;
    const fox = this.corner.fox;
    this.hop = 0;

    switch (this.state) {
      case "idle":
        this.form = "stand";
        this.sniffIn -= dt;
        if (this.sniffIn <= 0) {
          this.sniff = rand(0.8, 1.6);
          this.sniffIn = rand(2, 5);
        }
        if (this.sniff > 0) this.sniff -= dt;
        if (night) {
          this.walkTo(SNUGGLE.x, SNUGGLE.y, "sleep");
        } else if (this.t > this.dur) {
          if (this.visitIn <= 0 && fox.cuddleable) {
            this.walkTo(NUZZLE.x, NUZZLE.y, "nuzzle");
          } else if (chance(0.7)) {
            this.walkTo(rand(HOG_AREA.x0, HOG_AREA.x1), rand(HOG_AREA.y0, HOG_AREA.y1), "idle");
          } else this.set("idle", rand(2, 5));
        }
        break;
      case "walk": {
        this.form = "stand";
        const dx = this.tx - this.lx;
        const dy = this.ty - this.ly;
        const dist = Math.hypot(dx, dy);
        const step = 8 * dt;
        if (Math.abs(dx) > 0.3) this.flip = dx < 0;
        if (this.next === "idle" && night) {
          this.walkTo(SNUGGLE.x, SNUGGLE.y, "sleep");
          break;
        }
        if (dist <= step) {
          this.lx = this.tx;
          this.ly = this.ty;
          this.arrive();
        } else {
          this.lx += (dx / dist) * step;
          this.ly += (dy / dist) * step;
          // A little waddle bob.
          this.hop = Math.floor(this.t * 6) % 2 ? 1 : 0;
        }
        break;
      }
      case "nuzzle":
        this.form = "stand";
        this.flip = false;
        if (this.t > this.dur) {
          this.visitIn = rand(30, 70);
          this.walkTo(rand(HOG_AREA.x0, HOG_AREA.x1), rand(HOG_AREA.y0, HOG_AREA.y1), "idle");
        }
        break;
      case "ball":
        this.form = "ball";
        if (this.t > this.dur) this.set("peek", 0.5);
        break;
      case "peek":
        this.form = "ball";
        if (this.t > this.dur) {
          if (this.ballFrom === "sleep" && night) this.set("sleep");
          else this.set("idle", rand(1, 3));
        }
        break;
      case "sleep":
        this.form = "sleep";
        if (!night) {
          this.set("idle", rand(2, 4));
          this.emote.show("happy", 1);
        }
        break;
      case "party":
        this.form = "stand";
        this.hop = Math.round(Math.abs(Math.sin(this.t * 9)) * 4);
        if (this.t > this.dur) this.set("idle", rand(1, 3));
        break;
    }

    const c = hangout(g.layout);
    this.x = c.x + this.lx;
    this.y = c.y + this.ly;
    this.key = this.frameKey(g);
  }

  private arrive(): void {
    const next = this.next;
    this.next = "idle";
    if (next === "nuzzle") {
      const fox = this.corner.fox;
      if (fox.cuddleable) {
        this.set("nuzzle", 2.6);
        this.flip = false;
        this.emote.show("heart", 0.2);
        fox.set("nuzzle", 2.8);
        fox.emote.show("heart", 0.5);
        this.corner.nuzzleHearts();
        sfx("squeak", { volume: 0.4, pitch: 1.3 });
      } else this.set("idle", rand(2, 4));
    } else if (next === "sleep") {
      this.flip = false;
      this.set("sleep");
    } else this.set("idle", rand(2, 6));
  }

  private frameKey(g: Game): string {
    switch (this.state) {
      case "walk":
        return Math.floor(this.t * 6) % 2 ? "hedgehog.walk.1" : "hedgehog.idle.0";
      case "nuzzle":
      case "party":
        return "hedgehog.happy";
      case "ball":
        return "hedgehog.ball.0";
      case "peek":
        return "hedgehog.peek";
      case "sleep":
        return Math.floor(g.time / 1.6) % 2 ? "hedgehog.sleep.1" : "hedgehog.sleep.0";
      default:
        return this.sniff > 0 && Math.floor(this.t * 6) % 2 ? "hedgehog.sniff.1" : "hedgehog.idle.0";
    }
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const meta = HOG_META[this.form];
    const d = dims(this.key);
    const flip = this.flip;
    // A tiny shiver while rolled up.
    const shake = this.state === "ball" && this.t < 0.3 ? (Math.floor(this.t * 30) % 2 ? 1 : -1) : 0;
    const fx = Math.round(this.x) + shake;
    const fy = Math.round(this.y) - this.hop;
    drawShadow(ctx, this.x, this.y, meta.shadow);
    const left = drawAnchored(ctx, this.key, d.w, d.h, meta.anchor, fx, fy, flip);
    const top = fy - d.h;
    // The breathing frame is a row taller; the head stays put while the spines rise.
    const breath = this.key === "hedgehog.sleep.1" ? 1 : 0;

    const season = g.env.season;
    if (season === "winter") drawPart(ctx, "hedgehog.hat", 8, left, top + breath, d.w, meta.hat[0], meta.hat[1], flip);
    else if (season === "fall") drawPart(ctx, "hedgehog.leaf", 6, left, top + breath, d.w, meta.leaf[0], meta.leaf[1], flip);
    else if (season === "spring") drawPart(ctx, "hedgehog.flower", 7, left, top, d.w, meta.back[0], meta.back[1] + 1, flip);

    this.hx = left;
    this.hy = top;
    this.hw = d.w;
    this.hh = d.h;
    const hx = flip ? left + (d.w - 1 - meta.head) : left + meta.head;
    const hy = top - (season === "winter" ? 3 : 1);
    this.emote.draw(ctx, hx, hy);
    this.tag.follow(g, hx, hy - 17);
  }

  hit(wx: number, wy: number): boolean {
    return inBox(wx, wy, this.hx - 6, this.hy - 7, this.hw + 12, this.hh + 10);
  }

  onTap(g: Game): void {
    this.corner.tapped("hog", g);
    this.tag.show();
    this.tapCount++;
    sfx("squeak");
    if (this.state !== "ball" && this.state !== "peek") this.ballFrom = this.state === "sleep" ? "sleep" : "idle";
    if (this.state === "nuzzle") this.corner.fox.set("lie", rand(8, 14));
    this.set("ball", 2);
    if (this.tapCount % 3 === 0) {
      const season = g.env.season;
      let line = pick(HOG_LINES);
      if (this.ballFrom === "sleep") line = pick(HOG_SLEEP_LINES);
      else if (chance(0.35)) {
        if (season === "winter") line = "Milo's knit hat is slightly too big. It's perfect.";
        else if (season === "fall") line = "A leaf is stuck on Milo's spines. On purpose.";
        else if (season === "spring") line = "Milo is wearing a flower. Very fashionable.";
      }
      void say(line);
    }
  }

  react(kind: EmoteKind, towardX: number | null): void {
    if (this.state === "sleep" || this.state === "ball") return;
    if (towardX !== null && this.state === "idle") this.flip = towardX < this.x;
    this.emote.show(kind, 0.25);
  }
}

// ---------- props ----------

const FEET = { anchor: "feet" } as const;

class Prop implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  private key: string | null = null;
  private w = 0;
  private h = 0;

  constructor(
    private keyFn: (g: Game) => string | null,
    private lx: number,
    private ly: number,
    private tap?: (g: Game) => void,
    /** A tighter tap box (feet-anchored), so a small prop doesn't steal taps from Otto behind it. */
    private box?: { w: number; h: number },
  ) {}

  update(_dt: number, g: Game): void {
    const c = hangout(g.layout);
    this.x = c.x + this.lx;
    this.y = c.y + this.ly;
    this.key = this.keyFn(g);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.key) return;
    const d = dims(this.key);
    this.w = d.w;
    this.h = d.h;
    draw(ctx, this.key, this.x, this.y, FEET);
  }

  hit(wx: number, wy: number): boolean {
    if (!this.key || !this.tap) return false;
    if (this.box) return inBox(wx, wy, this.x - this.box.w / 2, this.y - this.box.h, this.box.w, this.box.h + 1);
    return inBox(wx, wy, this.x - this.w / 2 - 2, this.y - this.h - 2, this.w + 4, this.h + 4);
  }

  onTap(g: Game): void {
    this.tap?.(g);
  }
}

/** Flat things on the ground under everyone (the blanket). */
class Blanket implements Entity {
  x = 0;
  y = 0;
  layer = 0;
  update(_dt: number, g: Game): void {
    const c = hangout(g.layout);
    this.x = c.x + BLANKET.x;
    this.y = c.y + BLANKET.y;
  }
  draw(ctx: CanvasRenderingContext2D): void {
    draw(ctx, "critter.blanket", this.x, this.y);
  }
}

/** A raccoon peeking out of the stump hollow. Drawn just in front of the stump. */
class Raccoon implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  active = false;
  t = 0;
  hold = 3;
  mrs = false;
  emote = new Emote();
  private rise = 0;

  constructor(private corner: Corner) {}

  /** Pop up for a few seconds. `lines`: what tapping it says this time (default: a random raccoon moment). */
  lines: string[] | null = null;

  peek(lines: string[] | null = null): void {
    if (this.active || !has("critter.raccoon.peek")) return;
    this.active = true;
    this.t = 0;
    this.hold = rand(2.8, 4.5);
    this.mrs = !lines && chance(0.25);
    this.lines = lines;
    sfx("rustle", { volume: 0.6 });
    if (chance(0.5)) this.emote.show(pick<EmoteKind>(["question", "happy", "exclaim"]), 0.8);
  }

  update(dt: number, g: Game): void {
    const c = hangout(g.layout);
    this.x = c.x + STUMP.x;
    this.y = c.y + STUMP.y + 0.5; // sorts just in front of the stump
    if (!this.active) return;
    this.t += dt;
    this.emote.update(dt);
    const UP = 0.45;
    const DOWN = 0.35;
    if (this.t < UP) this.rise = this.t / UP;
    else if (this.t < UP + this.hold) this.rise = 1;
    else if (this.t < UP + this.hold + DOWN) this.rise = 1 - (this.t - UP - this.hold) / DOWN;
    else {
      this.active = false;
      this.rise = 0;
    }
  }

  private rimY(): number {
    // The stump is 18px tall, drawn feet-anchored; its hollow's front rim is row 7.
    return Math.round(this.y - 0.5) - 18 + 7;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    const rim = this.rimY();
    // Peeking: the bottom of the head stays hidden in the hollow.
    const hidden = 16 - Math.round(this.rise * 14);
    const top = rim - 16 + hidden;
    const look = this.t > 1.4 && this.t < 2.4 ? 1 : this.t > 2.4 && this.t < 3.2 ? -1 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.round(this.x) - 12, rim - 24, 24, 24);
    ctx.clip();
    draw(ctx, this.mrs ? "critter.raccoon2.peek" : "critter.raccoon.peek", Math.round(this.x) - 8 + look, top);
    ctx.restore();
    this.emote.draw(ctx, Math.round(this.x), top - 1);
  }

  hit(wx: number, wy: number): boolean {
    if (!this.active || this.rise < 0.5) return false;
    const rim = this.rimY();
    return inBox(wx, wy, this.x - 10, rim - 16, 20, 18);
  }

  onTap(): void {
    if (!this.active) return;
    sfx("squeak", { pitch: 0.8 });
    this.hold = Math.min(this.hold, this.t - 0.45 + 0.3);
    const lines = this.lines ?? (this.mrs ? RACCOON_LINES[2]! : chance(1 / 8) ? TRENCH_RACCOON_LINES : pick([RACCOON_LINES[0]!, RACCOON_LINES[1]!, RACCOON_LINES[3]!]));
    void say(lines);
    this.corner.fox.react("question", this.x);
  }
}

// ---------- Wine Wednesday, late ----------

/** The raccoon couple, arm in arm by the empty bottle, swaying a little. */
class RaccoonPair implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  private t = 0;
  private alpha = 0;
  /** Nobody tapped them by then: they wander off on their own. */
  private stay = rand(45, 70);
  private light: Light = { x: 0, y: 0, radius: 22, color: MOONLIT };
  private opts: DrawOpts = { alpha: 0 };

  constructor(private corner: Corner) {}

  update(dt: number, g: Game): void {
    const c = hangout(g.layout);
    this.x = c.x + PAIR_SPOT.x;
    this.y = c.y + PAIR_SPOT.y;
    this.t += dt;
    this.alpha = Math.min(1, this.t / 0.8);
    if (this.t > this.stay) this.corner.splitRaccoons(false);
    if (g.env.darkness > 0.3) {
      this.light.x = this.x;
      this.light.y = this.y - 12;
      g.addLight(this.light);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const key = RACCOON_PAIR[Math.floor(this.t / 0.15) % RACCOON_PAIR.length]!;
    this.opts.alpha = this.alpha;
    draw(ctx, key, Math.round(this.x) - 16, Math.round(this.y) - 28, this.opts);
  }

  hit(wx: number, wy: number): boolean {
    return this.alpha > 0.6 && inBox(wx, wy, this.x - 13, this.y - 24, 26, 25);
  }

  onTap(): void {
    this.corner.splitRaccoons(true);
  }
}

/** One of the two, trotting off: the brown one out along the fence, the grey one home into the stump. */
class Trotter implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  private lx: number;
  private ly: number;
  private leg = 0;
  private t = Math.random();
  private alpha = 1;
  private light: Light = { x: 0, y: 0, radius: 18, color: MOONLIT };
  private opts: DrawOpts = { alpha: 1 };

  constructor(
    private grey: boolean,
    lx: number,
  ) {
    this.lx = lx;
    this.ly = PAIR_SPOT.y;
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    const c = hangout(g.layout);
    if (this.grey) {
      const to = STUMP_PATH[this.leg]!;
      const dx = to.x - this.lx;
      const dy = to.y - this.ly;
      const d = Math.hypot(dx, dy);
      const step = 30 * dt;
      if (d <= step) {
        this.lx = to.x;
        this.ly = to.y;
        if (++this.leg >= STUMP_PATH.length) {
          // Home: a knock from inside, a puff of bark, gone.
          this.dead = true;
          sfx("thud");
          dotPuff(c.x + STUMP.x, c.y + STUMP.y - 14, ["#c98a4c", "#e6b276"], 4);
        }
      } else {
        this.lx += (dx / d) * step;
        this.ly += (dy / d) * step;
      }
    } else {
      this.lx -= 38 * dt;
      // Fades out over the last few px, at the pasture's left edge (like the coat).
      const p = g.layout.pasture;
      const wx = c.x + this.lx;
      this.alpha = Math.max(0, Math.min(1, (wx - p.x) / 12));
      if (this.alpha <= 0) this.dead = true;
    }
    this.x = c.x + this.lx;
    this.y = c.y + this.ly;
    if (g.env.darkness > 0.3 && !this.dead) {
      this.light.x = this.x;
      this.light.y = this.y - 10;
      g.addLight(this.light);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const frames = this.grey ? RACCOON2_RUN.left : RACCOON_RUN.left;
    const key = frames[Math.floor(this.t / 0.07) % frames.length]!;
    this.opts.alpha = this.alpha;
    draw(ctx, key, Math.round(this.x) - 16, Math.round(this.y) - 30, this.opts);
  }
}

// ---------- the corner ----------

export class Corner {
  fox: Fox;
  hog: Hedgehog;
  raccoon: Raccoon;
  night = false;
  private lastTap = { fox: -99, hog: -99 };
  private zzzIn = 3;
  private zzzWho = 0;
  private raccoonIn = rand(40, 90);
  private knocks = 0;
  private knockTimes: number[] = [];
  private knockLine: ReturnType<typeof setTimeout> | undefined;
  private wineToast = -99;
  /** The bottle lies tipped over until this time (ms), i.e. the rest of that Wine Wednesday. */
  private tippedUntil = 0;
  private pair: RaccoonPair | null = null;
  private pairIn = WINE_RACCOONS ? 3 : rand(45, 90);
  private cheerIn = 10;
  private g: Game;

  constructor(g: Game) {
    this.g = g;
    this.fox = new Fox(this);
    this.hog = new Hedgehog(this);
    this.raccoon = new Raccoon(this);

    addSafe(g, new Blanket(), "blanket");
    addSafe(g, new Prop((g) => (g.env.season === "winter" ? "critter.stump.winter" : "critter.stump"), STUMP.x, STUMP.y, (g) => this.knock(g)), "stump");
    addSafe(g, this.raccoon, "raccoon");
    // Seasonal bits around the hangout.
    addSafe(g, new Prop((g) => (g.env.season === "fall" || g.env.season === "spring" ? "critter.mushroom" : null), -2, STUMP.y + 3), "mushroom");
    addSafe(g, new Prop((g) => (g.env.season === "spring" || g.env.season === "summer" ? "critter.flowers" : null), 3, 31), "flowers");
    // (The right end of the blanket is the wine's spot on Wednesdays: the seasonal bits there step aside.)
    addSafe(g, new Prop((g) => (g.env.season === "spring" && !wineDay(g) ? "critter.flowers" : null), 57, 30), "flowers2");
    addSafe(
      g,
      new Prop((g) => (g.env.season === "fall" && !wineDay(g) ? "critter.leaves" : null), 50, 31, () => {
        sfx("rustle");
        const c = hangout(this.g.layout);
        dotPuff(c.x + 50, c.y + 27, ["#e8742a", "#ffad45", "#f2c84a", "#b5421c"], 10);
      }),
      "leaves",
    );
    addSafe(
      g,
      new Prop((g) => (g.env.season === "winter" && !wineDay(g) ? "critter.snowman" : null), 55, 31, () => {
        sfx("pop");
        void say("A tiny snowman in a red scarf... just like Otto's.");
      }),
      "snowman",
    );
    // Wine Wednesday.
    const cheers = () => this.cheers();
    const bottle = (g: Game) => (!wineDay(g) || !has(WINE) ? null : this.tipped() && has(WINE_TIPPED) ? WINE_TIPPED : WINE);
    addSafe(g, new Prop(bottle, WINE_SPOT.x, WINE_SPOT.y, cheers, { w: 14, h: 14 }), "wine");
    GLASS_SPOTS.forEach((p, i) => addSafe(g, new Prop((g) => (wineDay(g) ? "critter.wineglass" : null), p.x, p.y, cheers, { w: 9, h: 11 }), `wineglass${i}`));
    addSafe(g, this.fox, "fox");
    addSafe(g, this.hog, "hedgehog");

    onTick(g, "corner", (dt) => this.tick(dt));
    // Milo's squeak is the cheer at every shearing: have it ready for the first one.
    preloadSfx("squeak");

    if (params.has("raccoon")) setTimeout(() => this.raccoon.peek(), 2500);
    // Knocked over earlier tonight (before a reload)? It's still lying there.
    if (lsGet("farm.wineTipped") === dayKey(g.env.now)) this.tipBottle();
  }

  private tick(dt: number): void {
    const g = this.g;
    this.night = g.env.isNight;

    // Sleepy zzz's, taking turns.
    if (this.fox.asleep) {
      this.zzzIn -= dt;
      if (this.zzzIn <= 0) {
        this.zzzIn = rand(3.5, 6);
        this.zzzWho++;
        if (this.zzzWho % 2 === 0 || this.hog.state !== "sleep") this.fox.emote.show("sleep");
        else this.hog.emote.show("sleep");
      }
    }

    // Late on a Wine Wednesday (Otto and Milo long asleep), a certain couple, once a night at most.
    if (this.pair?.dead) this.pair = null;
    this.pairIn -= dt;
    if (this.pairIn <= 0) {
      this.pairIn = rand(45, 90);
      const day = dayKey(g.env.now);
      const ok = wineDay(g) && g.env.darkness > 0.6 && lsGet("farm.wineRaccoons") !== day && chance(0.3);
      if (!this.pair && !this.raccoon.active && !bottomLaneBusy() && has(RACCOON_PAIR[0]!) && (ok || WINE_RACCOONS)) {
        const pair = new RaccoonPair(this);
        if (claimBottomLane(pair)) {
          this.pair = addSafe(g, pair, "raccoon pair");
          lsSet("farm.wineRaccoons", day);
        }
      }
      // (?wineraccoons: just the once, as soon as the stump and the fence are clear.)
      if (WINE_RACCOONS) this.pairIn = this.pair ? Infinity : 2;
    }

    if (CHEER_DEBUG) {
      this.cheerIn -= dt;
      if (this.cheerIn <= 0) {
        this.cheerIn = 10;
        this.cheer(g.layout.w / 2, false);
      }
    }

    // The raccoon: rare, a little more likely after dark.
    this.raccoonIn -= dt;
    if (this.raccoonIn <= 0) {
      const dusk = g.env.hour >= 18 || g.env.hour < 6;
      this.raccoonIn = params.has("raccoon") ? 20 : rand(30, 50);
      if (chance(params.has("raccoon") ? 1 : dusk ? 0.1 : 0.04)) {
        this.raccoon.peek();
        if (!this.fox.asleep) setTimeout(() => this.fox.react("question", this.raccoon.x), 700);
      }
    }
  }

  private cheers(): void {
    sfx("chime", { volume: 0.5, pitch: 1.6 });
    if (this.tipped()) return; // (somebody finished it)
    const now = this.g.time;
    if (now - this.wineToast < 8) return;
    this.wineToast = now;
    toast("Wine Wednesday 🍷 Otto and Milo poured you two a glass.", { icon: has(WINE) ? WINE : "critter.wineglass" });
    this.fox.react("happy", null);
    this.hog.react("heart", null);
  }

  private tipped(): boolean {
    return this.g.env.now.getTime() < this.tippedUntil;
  }

  /** Over it goes, until midnight (when it's Thursday anyway). */
  private tipBottle(): void {
    const now = this.g.env.now;
    this.tippedUntil = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  }

  /**
   * The couple splits up: the brown one trots off along the fence, the grey one goes home to the
   * stump. Tapped: they were caught, and the bottle goes over.
   */
  splitRaccoons(tapped: boolean): void {
    const pair = this.pair;
    if (!pair || pair.dead) return;
    pair.dead = true;
    this.pair = null;
    if (tapped) {
      toast("Somebody finished the wine...", { icon: WINE });
      sfx("rustle", { volume: 0.4 });
      sfx("thud", { volume: 0.3, pitch: 1.6 });
      this.tipBottle();
      lsSet("farm.wineTipped", dayKey(this.g.env.now));
    }
    const brown = new Trotter(false, PAIR_SPOT.x - 5);
    if (claimBottomLane(brown)) addSafe(this.g, brown, "raccoon trot");
    addSafe(this.g, new Trotter(true, PAIR_SPOT.x + 5), "raccoon home");
  }

  /** Is the patch of grass in front of the fox free for a pounce? (Not on Wednesdays: that's where the wine is.) */
  pounceClear(): boolean {
    if (wineDay(this.g)) return false;
    return this.fox.atHome && Math.hypot(this.hog.lx - POUNCE.x, this.hog.ly - POUNCE.y) > 14 && this.hog.next !== "nuzzle";
  }

  nuzzleHearts(): void {
    const c = hangout(this.g.layout);
    setTimeout(() => heartFloat(c.x + NUZZLE.x + 8, c.y + NUZZLE.y - 12, 2), 300);
  }

  tapped(who: "fox" | "hog", g: Game): void {
    const now = g.time;
    this.lastTap[who] = now;
    const other = who === "fox" ? this.lastTap.hog : this.lastTap.fox;
    if (now - other < 2) {
      // Tapped both within two seconds: they're best friends, and they know it.
      this.lastTap.fox = this.lastTap.hog = -99;
      setTimeout(() => {
        this.fox.emote.show("heart");
        this.hog.emote.show("heart", 0.15);
        heartFloat((this.fox.x + this.hog.x) / 2, Math.min(this.fox.y, this.hog.y) - 18, 3);
        sfx("pet");
      }, 120);
    }
  }

  private knock(g: Game): void {
    sfx("thud");
    const c = hangout(g.layout);
    const sx = c.x + STUMP.x;
    dotPuff(sx, c.y + STUMP.y - 14, ["#c98a4c", "#e6b276"], 4);
    clearTimeout(this.knockLine);
    // Knock-knock-knock-knock-knock: the raccoon always answers a proper knock (a phone-friendly secret).
    const now = g.time;
    const times = this.knockTimes;
    times.push(now);
    if (times.length > 5) times.shift();
    if (times.length === 5 && now - times[0]! < 4) {
      times.length = 0;
      this.hog.react("exclaim", sx);
      if (this.raccoon.active || !has("critter.raccoon.peek")) return;
      this.knockLine = setTimeout(() => {
        if (this.raccoon.active) return;
        sfx("secret");
        this.raccoon.peek(SECRET_KNOCK_LINES);
        this.raccoon.hold = 5.5;
        this.raccoon.emote.show("happy", 0.6);
        if (!this.fox.asleep) this.fox.react("exclaim", sx);
      }, 500);
      return;
    }
    if (this.raccoon.active) return;
    // Whatever answers waits a beat, so nothing pops up in the middle of a knocking spree:
    // sometimes the raccoon, otherwise a line every other time (the hedgehog just wonders).
    this.knockLine = setTimeout(() => {
      if (this.raccoon.active) return;
      if (chance(0.3) && has("critter.raccoon.peek")) this.raccoon.peek();
      else if (this.knocks++ % 2 === 0) void say(pick(STUMP_LINES));
      else this.hog.react("question", sx);
    }, 700);
  }

  react(kind: EmoteKind, towardX: number | null = null): void {
    this.fox.react(kind, towardX);
    this.hog.react(kind, towardX);
  }

  startle(x: number): void {
    const { fox, hog } = this;
    // Milo first (same as a poke, minus the squeak): a nuzzle ends there and then.
    if (hog.state !== "ball" && hog.state !== "peek") hog.ballFrom = hog.state === "sleep" ? "sleep" : "idle";
    if (hog.state === "nuzzle") fox.set("lie", rand(8, 14));
    hog.set("ball", 4);
    if (fox.asleep) {
      // Head up for a moment; the night puts him straight back to sleep after.
      fox.flip = x < fox.x;
      fox.set("alert", 3);
      fox.emote.show("exclaim");
    } else fox.react("exclaim", x);
  }

  cheer(x: number, golden: boolean): void {
    if (this.fox.asleep) return; // they sleep through it
    setTimeout(() => {
      const { fox, hog } = this;
      fox.react(golden ? "heart" : "happy", x);
      if (hog.state !== "sleep" && hog.state !== "ball" && hog.state !== "peek") {
        hog.set("party", 1.2);
        hog.emote.show("music", 0.15);
      }
      sfx("squeak", { volume: 0.35, pitch: 1.3 });
    }, 600);
  }

  party(): void {
    if (!this.fox.asleep) {
      this.fox.set("party", 2.6);
      this.fox.emote.show("music");
      // One happy yip, after the sheep choir has started (not on top of the first baa).
      setTimeout(() => sfx("yip", { volume: 0.55, pitch: rand(1, 1.08) }), 900);
    }
    if (this.hog.state !== "sleep") {
      this.hog.set("party", 2.6);
      this.hog.emote.show("music", 0.3);
    }
  }
}

let corner: Corner | null = null;

export function initCorner(g: Game): Corner {
  corner ??= new Corner(g);
  return corner;
}

/** Make the fox & hedgehog look at something. Safe to call before init. */
export function critterReact(kind: EmoteKind, towardX: number | null = null): void {
  corner?.react(kind, towardX);
}

/** Sheep party! The fox and the hedgehog join in. */
export function critterParty(): void {
  corner?.party();
}

/** Where the fox is (for other critters to keep their distance). */
export function foxPosition(): { x: number; y: number } | null {
  return corner ? { x: corner.fox.x, y: corner.fox.y } : null;
}

/** Something very big just walked past (a certain somebody, at x): Otto jumps up, Milo rolls into a ball. */
export function critterStartle(x: number): void {
  corner?.startle(x);
}

/** A sheep was just sheared (here or on the other phone): Otto and Milo cheer from their corner. */
export function critterCheer(x: number, golden: boolean): void {
  corner?.cheer(x, golden);
}
