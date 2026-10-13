// A tiny fixed-size particle pool for the farm world: tumbling leaves, dust puffs, campfire smoke,
// sparkles, wool fluff and sleepy z's. Drawn above the entities, below the sky's lighting.

import type { Game } from "../engine/game";
import { safeOn, safePass } from "./world-safe";

export const reducedMotion: boolean = (() => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
})();

export type ParticleKind = "sprite" | "pixel" | "spark";

interface Particle {
  on: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity (px/s^2). Negative floats up. */
  g: number;
  drag: number;
  t: number;
  life: number;
  /** Sideways flutter amplitude (px/s) and phase, for leaves & fluff. */
  flutter: number;
  phase: number;
  /** Stop falling at this y (leaves settle on the ground and fade). */
  groundY: number;
  landed: boolean;
  img: CanvasImageSource | null;
  imgFlip: CanvasImageSource | null;
  w: number;
  h: number;
  color: string;
  size: number;
  /** Fade over the last `fade` seconds. */
  fade: number;
}

export interface SpawnOpts {
  kind?: ParticleKind;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  g?: number;
  drag?: number;
  life?: number;
  flutter?: number;
  groundY?: number;
  img?: HTMLCanvasElement | null;
  imgFlip?: HTMLCanvasElement | null;
  color?: string;
  size?: number;
  fade?: number;
}

const CAPACITY = 220;

class Fx {
  private pool: Particle[] = [];
  private live = 0;

  constructor() {
    for (let i = 0; i < CAPACITY; i++) {
      this.pool.push({
        on: false,
        kind: "pixel",
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        g: 0,
        drag: 0,
        t: 0,
        life: 1,
        flutter: 0,
        phase: 0,
        groundY: Infinity,
        landed: false,
        img: null,
        imgFlip: null,
        w: 0,
        h: 0,
        color: "#fff",
        size: 1,
        fade: 0.4,
      });
    }
  }

  get count(): number {
    return this.live;
  }

  spawn(o: SpawnOpts): void {
    let p: Particle | undefined;
    for (const q of this.pool) {
      if (!q.on) {
        p = q;
        break;
      }
    }
    if (!p) return; // pool full: drop it, nobody will notice one less leaf
    p.on = true;
    this.live++;
    p.kind = o.kind ?? (o.img ? "sprite" : "pixel");
    p.x = o.x;
    p.y = o.y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.g = o.g ?? 0;
    p.drag = o.drag ?? 0;
    p.t = 0;
    p.life = o.life ?? 1;
    p.flutter = o.flutter ?? 0;
    p.phase = Math.random() * Math.PI * 2;
    p.groundY = o.groundY ?? Infinity;
    p.landed = false;
    p.img = o.img ?? null;
    p.imgFlip = o.imgFlip ?? null;
    p.w = o.img?.width ?? 0;
    p.h = o.img?.height ?? 0;
    p.color = o.color ?? "#ffffff";
    p.size = o.size ?? 1;
    p.fade = o.fade ?? Math.min(0.5, p.life * 0.4);
  }

  update(dt: number): void {
    if (!this.live) return;
    for (const p of this.pool) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) {
        p.on = false;
        this.live--;
        continue;
      }
      if (p.landed) continue;
      p.vy += p.g * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += (p.vx + (p.flutter ? Math.sin(p.t * 5 + p.phase) * p.flutter : 0)) * dt;
      p.y += p.vy * dt;
      if (p.y >= p.groundY) {
        p.y = p.groundY;
        p.landed = true;
        // Settle, then fade out soon.
        p.life = Math.min(p.life, p.t + 0.9);
        p.fade = 0.6;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.live) return;
    let lastColor = "";
    for (const p of this.pool) {
      if (!p.on) continue;
      const left = p.life - p.t;
      const a = left < p.fade ? Math.max(0, left / p.fade) : 1;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (p.kind === "sprite" && p.img) {
        // Tumble: alternate between the sprite and its mirror while falling.
        const img = !p.landed && p.imgFlip && Math.sin(p.t * 7 + p.phase) < 0 ? p.imgFlip : p.img;
        ctx.drawImage(img, x - (p.w >> 1), y - (p.h >> 1));
      } else if (p.kind === "spark") {
        if (p.color !== lastColor) {
          ctx.fillStyle = p.color;
          lastColor = p.color;
        }
        const r = p.t < p.life * 0.5 ? 1 : 0;
        ctx.fillRect(x, y, 1, 1);
        if (r || p.size > 1) {
          ctx.fillRect(x - 1, y, 1, 1);
          ctx.fillRect(x + 1, y, 1, 1);
          ctx.fillRect(x, y - 1, 1, 1);
          ctx.fillRect(x, y + 1, 1, 1);
        }
        if (p.size > 1 && r) {
          ctx.fillRect(x - 2, y, 1, 1);
          ctx.fillRect(x + 2, y, 1, 1);
          ctx.fillRect(x, y - 2, 1, 1);
          ctx.fillRect(x, y + 2, 1, 1);
        }
      } else {
        if (p.color !== lastColor) {
          ctx.fillStyle = p.color;
          lastColor = p.color;
        }
        ctx.fillRect(x, y, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}

export const fx = new Fx();

let inited = false;

export function initFx(g: Game): void {
  if (inited) return;
  inited = true;
  safeOn(g, "tick", "fx.update", (dt: number) => fx.update(dt));
  safePass(g, 8, "fx", (ctx) => fx.draw(ctx));
}

// ---------- canned effects ----------

/** A little puff of dust (placing things, things landing). */
export function dustPuff(x: number, y: number, n = 8, color = "rgba(246,236,214,0.9)"): void {
  const count = reducedMotion ? Math.ceil(n / 3) : n;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const s = 14 + Math.random() * 16;
    fx.spawn({ x, y: y - 1, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.45 - 6, drag: 4, life: 0.45 + Math.random() * 0.25, color, size: Math.random() < 0.4 ? 2 : 1 });
  }
}

/** A few twinkles around a point. */
export function sparkle(x: number, y: number, n = 4, spread = 10, color = "#fff6b8"): void {
  const count = reducedMotion ? 1 : n;
  for (let i = 0; i < count; i++) {
    fx.spawn({
      kind: "spark",
      x: x + (Math.random() - 0.5) * spread * 2,
      y: y + (Math.random() - 0.5) * spread,
      vy: -4 - Math.random() * 4,
      life: 0.5 + Math.random() * 0.4,
      color,
      size: Math.random() < 0.3 ? 2 : 1,
    });
  }
}
