// Night shift:
//  - An opossum waddles along the bottom fence after dark, stops to stare at you, and heads home.
//    Tap it and it plays dead (flat on its back, legs up, X eyes, tongue out) until the coast is
//    clear, then hurries off. Real walk frames from critters.png; the dramatic part is hand-drawn.
//  - Mosquitoes on summer evenings: a tiny buzzing swarm around the lamppost (or the barn window).
//    Drawn above the night overlay so the specks read in the dark.
// Debug: ?opossum=1 ?mosquitoes=1

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw, isReal } from "../engine/sprites";
import { toast } from "../ui/dom";
import { POSSUM } from "./critter-lore-art";
import { hangout } from "./critter-fox";
import { claimBottomLane, decorPoints, FENCE_HIDE, onLayoutChange } from "./critter-place";
import { addSafe, chance, drawShadow, Emote, inBox, onAnyTap, onTick, params, rand, reducedMotion, report } from "./critter-util";

/** A faint moonlight on night critters so they read against the dark (like the owl's). */
const MOONLIGHT = "rgba(170,186,255,0.3)";

// ---------- opossum ----------

type PossumState = "walk" | "look" | "dead" | "up" | "flee";

class Opossum implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  private px: number;
  private dir: 1 | -1 = 1;
  private state: PossumState = "walk";
  private t = 0;
  private dur = 0;
  private anim = Math.random();
  private alpha = 0;
  private stops: number[];
  private turnAt: number;
  private lookFrame = 0;
  private emote = new Emote();
  /** Which way it flopped (its head stays toward where it was going). */
  private flopRight = true;

  constructor(private g: Game) {
    const p = g.layout.pasture;
    this.px = p.x + 2;
    const c = hangout(g.layout);
    this.turnAt = Math.max(p.x + 40, Math.min(c.x - 20, p.x + p.w - 24));
    this.stops = chance(0.7) ? [p.x + (this.turnAt - p.x) * rand(0.3, 0.6)] : [];
  }

  private set(state: PossumState, dur: number): void {
    this.state = state;
    this.t = 0;
    this.dur = dur;
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.anim += dt;
    this.emote.update(dt);
    const p = g.layout.pasture;
    this.y = p.y + p.h - FENCE_HIDE;
    const fading = this.dir < 0 && this.px < p.x + 12;
    this.alpha = fading ? Math.max(0, (this.px - p.x) / 12) : Math.min(1, this.alpha + dt * 1.5);
    switch (this.state) {
      case "walk":
      case "flee": {
        this.px += this.dir * (this.state === "flee" ? 24 : 9) * dt;
        if (this.dir > 0) {
          const stop = this.stops[0];
          if (stop !== undefined && this.px >= stop) {
            this.stops.shift();
            this.look(rand(1.6, 3));
          } else if (this.px >= this.turnAt) this.look(rand(1, 2.2));
        } else if (this.px <= p.x) this.dead = true;
        break;
      }
      case "look":
        if (this.t > this.dur) {
          if (this.dir > 0 && this.px >= this.turnAt - 0.5) this.dir = -1;
          this.set("walk", 0);
        }
        break;
      case "dead":
        if (this.t > this.dur) {
          // ...is it gone? It's gone. Up, and off home in a hurry.
          this.set("up", 0.7);
          this.emote.show("exclaim");
        }
        break;
      case "up":
        if (this.t > this.dur) {
          this.dir = -1;
          this.set("flee", 0);
        }
        break;
    }
    if (g.env.darkness > 0.3 && this.alpha > 0) g.addLight({ x: this.px, y: this.y - 8, radius: 18, color: MOONLIGHT });
    this.x = this.px;
  }

  private look(dur: number): void {
    this.set("look", dur);
    this.lookFrame = Math.floor(Math.random() * POSSUM.look.length);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    const x = Math.round(this.px);
    const y = Math.round(this.y);
    drawShadow(ctx, x, y, 20, this.alpha);
    if (this.state === "dead") {
      // Flat on its back, very convincingly. (A tiny twitch now and then gives it away.)
      const twitch = this.t % 1.6 < 0.08 ? 1 : 0;
      draw(ctx, "critter.opossum.dead", x, y + 1 - twitch, { anchor: "feet", flipX: !this.flopRight, alpha: this.alpha });
      return;
    }
    let key: string;
    let flip: boolean;
    if (this.state === "look" || this.state === "up") {
      // These frames look out at you over their left shoulder; mirror them when headed right.
      key = POSSUM.look[this.state === "up" ? 0 : this.lookFrame]!;
      flip = this.dir > 0;
    } else {
      key = POSSUM.walk[Math.floor(this.anim / (this.state === "flee" ? 0.07 : 0.14)) % POSSUM.walk.length]!;
      flip = this.dir < 0; // the walk faces right
    }
    draw(ctx, key, x - 16, y - 31, { flipX: flip, alpha: this.alpha });
    this.emote.draw(ctx, x, y - 18);
  }

  hit(wx: number, wy: number): boolean {
    return (this.state === "walk" || this.state === "look") && this.alpha > 0.5 && inBox(wx, wy, this.px - 14, this.y - 18, 28, 21);
  }

  onTap(): void {
    if (this.state !== "walk" && this.state !== "look") return;
    this.flopRight = this.dir > 0;
    this.set("dead", rand(3, 4.5));
    sfx("thud", { volume: 0.45, pitch: 1.4 });
  }
}

// ---------- mosquitoes ----------

interface Bug {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ph: number;
}

class Swarm {
  bugs: Bug[] = [];
  alpha = 0;
  leaving = false;
  dead = false;

  constructor(
    public ax: number,
    public ay: number,
  ) {
    const n = reducedMotion ? 6 : 9 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) this.bugs.push({ x: ax + rand(-8, 8), y: ay + rand(-6, 6), vx: rand(-10, 10), vy: rand(-10, 10), ph: Math.random() * 10 });
  }

  near(x: number, y: number): boolean {
    return !this.leaving && Math.abs(x - this.ax) < 16 && Math.abs(y - this.ay) < 14;
  }

  /** Swatted at: everyone scatters, then drifts right back. */
  scatter(x: number, y: number): void {
    for (const b of this.bugs) {
      const a = Math.atan2(b.y - y, b.x - x) + rand(-0.6, 0.6);
      b.vx += Math.cos(a) * 45;
      b.vy += Math.sin(a) * 45;
    }
  }

  update(dt: number): void {
    this.alpha = this.leaving ? this.alpha - dt * 0.8 : Math.min(1, this.alpha + dt * 0.8);
    if (this.leaving && this.alpha <= 0) this.dead = true;
    const damp = Math.max(0, 1 - dt * 2.4);
    for (const b of this.bugs) {
      // Jittery little loops around the light.
      b.vx = (b.vx + (rand(-90, 90) + (this.ax - b.x) * 6) * dt) * damp;
      b.vy = (b.vy + (rand(-90, 90) + (this.ay - b.y) * 8) * dt) * damp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ph += dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    for (const b of this.bugs) {
      ctx.globalAlpha = this.alpha * 0.9;
      ctx.fillStyle = "#1e1820";
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      ctx.fillRect(x, y, 1, 1);
      // Wings catching the light, every other beat.
      if (Math.floor(b.ph * 22) % 2 === 0) {
        ctx.globalAlpha = this.alpha * 0.45;
        ctx.fillStyle = "#eef0ff";
        ctx.fillRect(x, y - 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** Somewhere bright for mosquitoes to hang around: lampposts first, then the brightest light (the barn window). */
function swarmSpots(g: Game): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const d of decorPoints(g.layout, ["lamppost"])) out.push({ x: d.x, y: d.y - 24 });
  let best: { x: number; y: number; r: number } | null = null;
  for (const l of g.lights) if (l.radius >= 28 && l.radius < 50 && (!best || l.radius > best.r)) best = { x: l.x, y: l.y, r: l.radius };
  if (best) out.push({ x: best.x, y: best.y + 4 });
  if (!out.length) {
    // Dusk, nothing lit yet: they bother Otto & Milo instead.
    const c = hangout(g.layout);
    out.push({ x: c.x + 34, y: c.y + 4 });
  }
  return out;
}

// ---------- spawner ----------

export function initNight(g: Game): void {
  const forcePossum = params.has("opossum");
  const forceMoz = params.has("mosquitoes");
  let possum: Opossum | null = null;
  let possumIn = forcePossum ? 2 : rand(5, 12);
  let possumFirst = true;
  let swarms: Swarm[] = [];
  let swarmCheck = forceMoz ? 1 : 2;
  let lastToast = -999;

  onTick(g, "night", (dt) => {
    const env = g.env;
    const dry = env.weather !== "rain" && env.weather !== "storm" && env.weather !== "snow";

    // The opossum: dry nights, any time of year (it's San Francisco).
    if (possum?.dead) possum = null;
    possumIn -= dt;
    if (possumIn <= 0) {
      possumIn = forcePossum ? 30 : rand(45, 100);
      const p = possumFirst ? 0.65 : 0.35;
      possumFirst = false;
      const ok = env.darkness > 0.6 && dry && chance(p);
      if (!possum && (ok || forcePossum) && isReal(POSSUM.walk[0]!)) {
        const o = new Opossum(g);
        if (claimBottomLane(o)) possum = addSafe(g, o, "opossum");
      }
    }

    // Mosquitoes: summer evenings & nights, when it's calm and dry.
    const evening = env.hour >= 19.5 || env.hour < 4.5;
    const mozTime = forceMoz || (env.season === "summer" && evening && dry && env.weather !== "windy");
    for (const s of swarms) {
      s.update(dt);
      if (!mozTime) s.leaving = true;
    }
    if (swarms.some((s) => s.dead)) swarms = swarms.filter((s) => !s.dead);
    swarmCheck -= dt;
    if (swarmCheck <= 0) {
      swarmCheck = 3;
      if (mozTime) {
        const spots = swarmSpots(g).slice(0, 2);
        // Follow their light if it moved; a new light gets its own little cloud.
        for (const s of swarms) {
          const near = spots.find((p) => Math.hypot(p.x - s.ax, p.y - s.ay) < 40);
          if (near) {
            s.ax = near.x;
            s.ay = near.y;
          } else s.leaving = true;
        }
        for (const p of spots) {
          if (swarms.some((s) => !s.leaving && Math.hypot(p.x - s.ax, p.y - s.ay) < 40)) continue;
          if (swarms.length < 2) swarms.push(new Swarm(p.x, p.y));
        }
      }
    }
  });

  onAnyTap(g, "mosquitoes", (x, y) => {
    for (const s of swarms) {
      if (!s.near(x, y)) continue;
      s.scatter(x, y);
      if (g.time - lastToast > 90) {
        lastToast = g.time;
        toast("Bzzz... Not enough mosquitoes for a trench coat. Yet.", { icon: "critter.trenchcoat.icon" });
      }
    }
  });

  g.addPass({
    order: 114, // above the night overlay, so the specks read in the dark
    draw: (ctx) => {
      if (!swarms.length) return;
      ctx.save();
      try {
        for (const s of swarms) s.draw(ctx);
      } catch (err) {
        report("mosquitoes.draw", err);
      } finally {
        ctx.restore();
      }
    },
  });

  onLayoutChange(g, "night", () => {
    if (possum) possum.dead = true;
    possum = null;
    swarms = [];
  });
}
