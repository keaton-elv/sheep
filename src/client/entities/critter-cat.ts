// The farm cat (the real grey Stardew cat sheet). Naps by the barn door, wanders between the
// loom, chest and mailbox, sits and grooms, sleeps at night. Pet it every day. Those are the rules.

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw, drawFrame, SHEETS, sheet } from "../engine/sprites";
import type { Layout } from "../world/layout";
import { dayKey } from "../../shared/calendar";
import { say, toast } from "../ui/dom";
import { addSafe, chance, drawShadow, Emote, heartFloat, inBox, lsGet, lsSet, rand } from "./critter-util";

// 128x256 = 4 cols x 8 rows of 32x32 frames:
//   0-3 walk down, 4-7 walk right, 8-11 walk up, 12-15 walk left,
//   16-19 sit (19 = eyes closed), 20-23 groom (20 = eyes closed),
//   24-27 lie down to the right (27 = flat out), 28-29 curled-up sleep, 30-31 stretch.
SHEETS.cat ??= "sprites/cat.png";

const F = {
  walkDown: 0,
  walkRight: 4,
  walkUp: 8,
  walkLeft: 12,
  sitTail: 16,
  sit: 17,
  sit2: 18,
  sitBlink: 19,
  groomRest: 20,
  groom: [21, 22, 23, 22] as const,
  lie: [24, 25, 26] as const,
  lieFlat: 27,
  sleep: [28, 29] as const,
  stretch: [30, 31] as const,
};

type CatState = "sit" | "groom" | "lie" | "nap" | "stretch" | "walk" | "sleep";

const CAT_LINES = [
  "The cat purrs like a tiny tractor.",
  "The cat would like it known that the barn is, in fact, ITS barn.",
  "Farm rule #1: pet the cat. Every day. No exceptions.",
  "The cat knocked one piece of hay off the loom. On purpose. While looking at you.",
  "The cat headbutts your hand. You have been chosen.",
  "The cat is judging the sheep's fashion choices. Wool again? Bold.",
];

// Cat spots sit in the gaps between the farm objects (never on top of them, so the cat
// doesn't steal taps meant for the chest or the mailbox). In portrait the strip between the
// objects and the pasture is hidden behind the fence, so the cat stays up in the yard row.
const SPOTS = ["door", "doorLeft", "loomChest", "chestMail"] as const;
type Spot = (typeof SPOTS)[number];

const mid = (a: number, b: number) => Math.round((a + b) / 2);

function spotPos(l: Layout, s: Spot): { x: number; y: number } {
  let p: { x: number; y: number };
  if (l.portrait) {
    const row = Math.min(l.loom.y, l.chest.y, l.mailbox.y) - 1;
    switch (s) {
      case "door": // its favorite napping spot, in the grass just behind the loom and the chest
        p = { x: mid(l.loom.x, l.chest.x), y: row - 16 };
        break;
      case "doorLeft":
        p = { x: mid(l.mailbox.x, l.billboard.x), y: row };
        break;
      case "loomChest":
        p = { x: mid(l.loom.x, l.chest.x), y: row };
        break;
      case "chestMail":
        p = { x: mid(l.chest.x, l.mailbox.x), y: row };
        break;
    }
  } else {
    switch (s) {
      case "door":
        p = { x: l.barnDoor.x + 26, y: l.barnDoor.y - 1 };
        break;
      case "doorLeft":
        p = { x: l.barnDoor.x - 30, y: l.barnDoor.y - 1 };
        break;
      case "loomChest":
        p = { x: mid(l.loom.x, l.chest.x), y: Math.max(l.loom.y, l.chest.y) + 9 };
        break;
      case "chestMail":
        p = { x: mid(l.chest.x, l.mailbox.x), y: mid(l.chest.y, l.mailbox.y) + 9 };
        break;
    }
  }
  // Keep clear of the screen edges, the HUD clock and the pasture fence.
  p.x = Math.max(12, Math.min(l.w - 12, p.x));
  p.y = Math.max(24, p.y);
  if (l.portrait) p.y = Math.min(p.y, l.fence.y - 22);
  else p.x = Math.min(p.x, l.fence.x - 12);
  const c = l.hudClock;
  if (p.x > c.x - 10 && p.y < c.y + c.h + 22) p.y = c.y + c.h + 22;
  return p;
}

class Cat implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  state: CatState = "sit";
  t = 0;
  dur = rand(3, 6);
  flip = false;
  spot: Spot = "door";
  target: Spot = "door";
  frame: number = F.sit;
  emote = new Emote();
  blinkIn = rand(2, 5);
  tapCount = 0;
  private placed = false;
  private walkDir = 0; // 0 down, 1 right, 2 up, 3 left

  set(state: CatState, dur = 0): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  private walkTo(spot: Spot): void {
    this.target = spot;
    this.set("walk");
  }

  update(dt: number, g: Game): void {
    const l = g.layout;
    if (!this.placed) {
      this.placed = true;
      const p = spotPos(l, "door");
      this.x = p.x;
      this.y = p.y;
      if (g.env.isNight) this.set("sleep");
      else this.set("nap", rand(10, 30));
    }
    this.t += dt;
    this.emote.update(dt);
    const sleepy = g.env.isNight || g.env.weather === "rain" || g.env.weather === "storm";

    switch (this.state) {
      case "sit": {
        this.blinkIn -= dt;
        if (this.blinkIn < 0) this.blinkIn = rand(2.5, 6);
        this.frame = this.blinkIn < 0.16 ? F.sitBlink : this.t < 0.35 ? F.sitTail : F.sit;
        if (this.t > this.dur) this.next(sleepy);
        break;
      }
      case "groom": {
        const i = Math.floor(this.t / 0.2);
        this.frame = this.t > this.dur - 0.6 ? F.groomRest : F.groom[i % 4]!;
        if (this.t > this.dur) this.set("sit", rand(2, 5));
        break;
      }
      case "lie": {
        const i = Math.floor(this.t / 0.16);
        this.frame = i < 3 ? F.lie[i]! : Math.floor(this.t / 3) % 3 === 2 ? F.lieFlat : F.lie[2];
        if (this.t > this.dur) this.set(chance(0.5) ? "nap" : "stretch", rand(14, 30));
        break;
      }
      case "stretch": {
        this.frame = this.t < 1.2 ? F.stretch[Math.floor(this.t / 0.3) % 2]! : F.sit;
        if (this.t > 1.8) this.set("sit", rand(2, 4));
        break;
      }
      case "nap":
      case "sleep": {
        this.frame = F.sleep[Math.floor(this.t / 1.5) % 2]!;
        if (this.state === "sleep") {
          if (!sleepy && this.t > 2) this.set("stretch");
        } else if (this.t > this.dur) this.set(sleepy ? "sleep" : "stretch");
        break;
      }
      case "walk": {
        const p = spotPos(l, this.target);
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const d = Math.hypot(dx, dy);
        const step = 16 * dt;
        if (d <= step) {
          this.x = p.x;
          this.y = p.y;
          this.spot = this.target;
          this.flip = chance(0.5);
          if (sleepy) this.set("sleep");
          else this.set("sit", rand(3, 7));
        } else {
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
          this.walkDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 0 : 2;
          const base = [F.walkDown, F.walkRight, F.walkUp, F.walkLeft][this.walkDir]!;
          this.frame = base + (Math.floor(this.t / 0.14) % 4);
        }
        break;
      }
    }

    // Stay glued to the current spot when the screen resizes.
    if (this.state !== "walk") {
      const p = spotPos(l, this.spot);
      this.x = p.x;
      this.y = p.y;
    }
  }

  private next(sleepy: boolean): void {
    if (sleepy) {
      if (this.spot !== "door") this.walkTo("door");
      else this.set("sleep");
      return;
    }
    const r = Math.random();
    if (r < 0.3) this.set("groom", rand(2.5, 5));
    else if (r < 0.55) this.set("lie", rand(6, 14));
    else if (r < 0.7) this.set("nap", rand(15, 40));
    else {
      let s: Spot = this.spot;
      while (s === this.spot) s = SPOTS[Math.floor(Math.random() * SPOTS.length)]!;
      this.walkTo(s);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    // Lying/stretch frames face right; mirror them sometimes. Walk frames have their own directions.
    const sideways = this.frame >= 24 && this.frame !== 28 && this.frame !== 29;
    const flip = sideways && this.flip;
    if (sheet("cat")) {
      drawFrame(ctx, "cat", this.frame, 32, 32, x - 16, y - 30, flip);
    } else {
      // Hand-drawn fallback, in case the sheet ever goes missing.
      drawShadow(ctx, x, y, 14);
      const key = this.state === "nap" || this.state === "sleep" || this.state === "lie" ? "critter.cat.sleep" : "critter.cat.sit";
      const bob = this.state === "walk" && Math.floor(this.t * 8) % 2 ? 1 : 0;
      draw(ctx, key, x, y - bob, { anchor: "feet", flipX: this.flip });
    }
    const lying = this.state === "nap" || this.state === "sleep" || this.state === "lie";
    this.emote.draw(ctx, x, y - (lying ? 13 : 18));
  }

  hit(wx: number, wy: number): boolean {
    const lying = this.state === "nap" || this.state === "sleep" || this.state === "lie" || this.state === "stretch";
    return lying ? inBox(wx, wy, this.x - 13, this.y - 15, 26, 18) : inBox(wx, wy, this.x - 11, this.y - 21, 22, 24);
  }

  onTap(g: Game): void {
    this.tapCount++;
    sfx("meow");
    this.emote.show("heart");
    heartFloat(this.x, this.y - 16, 1);
    if (this.state === "walk") this.set("sit", rand(3, 5));
    else if (this.state === "nap" || this.state === "lie") this.set("sit", rand(4, 7));
    const today = dayKey(g.env.now);
    if (lsGet("farm.catPetDay") !== today) {
      lsSet("farm.catPetDay", today);
      toast("You pet the cat. It purrs.", { icon: "emote.heart" });
    } else if (this.tapCount % 5 === 0) {
      void say(CAT_LINES[Math.floor(Math.random() * CAT_LINES.length)]!);
    }
  }
}

export function initCat(g: Game): void {
  addSafe(g, new Cat(), "cat");
}
