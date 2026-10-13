// Little helpers shared by the critters & easter eggs: emotes with their own clock,
// safe localStorage, soft ground shadows, and a tiny capped sparkle/particle system.

import type { Entity, Game } from "../engine/game";
import { draw } from "../engine/sprites";
import { drawEmote, EMOTE_DURATION, type EmoteKind } from "./emotes";

export const params = new URLSearchParams(location.search);

export const reducedMotion: boolean = (() => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
})();

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the farm forgets, that's fine */
  }
}

export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
export const chance = (p: number) => Math.random() < p;

// ---------- crash guards ----------
// The engine loop has no try/catch: one throw inside an entity's update/draw or a tick listener
// would freeze the whole farm. Critters are decoration, so if one ever misbehaves we log it once
// and the sheep carry on grazing.

const reported = new Set<string>();

export function report(where: string, err: unknown): void {
  if (reported.has(where)) return;
  reported.add(where);
  console.error(`[critters] ${where} failed (skipping it, the farm keeps running)`, err);
}

/** Wrap an entity's update/draw/hit/onTap in try/catch, in place. Returns the same entity. */
export function guard<T extends Entity>(e: T, name: string): T {
  const ent = e as Entity;
  const { update, draw: drawFn, hit, onTap } = ent;
  if (update) {
    ent.update = (dt, g) => {
      try {
        update.call(e, dt, g);
      } catch (err) {
        report(`${name}.update`, err);
      }
    };
  }
  ent.draw = (ctx, g) => {
    try {
      drawFn.call(e, ctx, g);
    } catch (err) {
      report(`${name}.draw`, err);
    }
  };
  if (hit) {
    ent.hit = (wx, wy) => {
      try {
        return hit.call(e, wx, wy);
      } catch (err) {
        report(`${name}.hit`, err);
        return false;
      }
    };
  }
  if (onTap) {
    ent.onTap = (g, wx, wy) => {
      try {
        onTap.call(e, g, wx, wy);
      } catch (err) {
        report(`${name}.onTap`, err);
      }
    };
  }
  return e;
}

/** g.add() with the crash guard on. */
export function addSafe<T extends Entity>(g: Game, e: T, name: string): T {
  return g.add(guard(e, name));
}

/** g.on("tick") with a try/catch around the listener. */
export function onTick(g: Game, name: string, fn: (dt: number) => void): () => void {
  return g.on("tick", (dt: number) => {
    try {
      fn(dt);
    } catch (err) {
      report(`${name}.tick`, err);
    }
  });
}

// ---------- emotes ----------

/** An emote bubble with its own timer. Call update(dt) every frame and draw() where the head is. */
export class Emote {
  kind: EmoteKind | null = null;
  t = 0;

  show(kind: EmoteKind, delay = 0): void {
    this.kind = kind;
    this.t = -delay;
  }

  get active(): boolean {
    return this.kind !== null;
  }

  update(dt: number): void {
    if (!this.kind) return;
    this.t += dt;
    if (this.t >= EMOTE_DURATION) this.kind = null;
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (this.kind && this.t >= 0) drawEmote(ctx, this.kind, x, y, this.t);
  }
}

// ---------- shadows ----------

const shadowCache = new Map<number, HTMLCanvasElement>();

/** Soft lavender ground shadow (an ellipse `w` px wide) centered at (cx, cy). */
export function drawShadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, alpha = 1): void {
  w = Math.max(4, Math.round(w));
  let c = shadowCache.get(w);
  if (!c) {
    const h = Math.max(3, Math.round(w / 3));
    c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const sctx = c.getContext("2d")!;
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
    shadowCache.set(w, c);
  }
  const prev = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prev * alpha;
  ctx.drawImage(c, Math.round(cx - c.width / 2), Math.round(cy - c.height / 2));
  ctx.globalAlpha = prev;
}

/**
 * Draw sprite `key` (w px wide, natively facing right) so that column `ax` of the sprite sits
 * at world x, with its bottom row at world y. Mirrors when facing left. Returns the sprite's left x.
 */
export function drawAnchored(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, ax: number, x: number, y: number, flip: boolean, alpha?: number): number {
  const left = Math.round(flip ? x - (w - 1 - ax) : x - ax);
  draw(ctx, key, left, Math.round(y - h), { flipX: flip, alpha });
  return left;
}

/** Draw an accessory at (ox, oy) of a sprite (in the sprite's right-facing coords), mirrored with it. */
export function drawPart(ctx: CanvasRenderingContext2D, key: string, partW: number, left: number, top: number, spriteW: number, ox: number, oy: number, flip: boolean, alpha?: number): void {
  const x = flip ? left + spriteW - ox - partW : left + ox;
  draw(ctx, key, x, top + oy, { flipX: flip, alpha });
}

// ---------- particles ----------

const PK = { Sparkle: 0, Heart: 1, Dot: 2 } as const;
type PK = (typeof PK)[keyof typeof PK];

interface Particle {
  on: boolean;
  kind: PK;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  color: string;
}

const MAX_PARTICLES = 64;

class Particles implements Entity {
  x = 0;
  y = 1e6; // draws after everything else on its layer
  layer = 3;
  private pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({ on: false, kind: PK.Sparkle, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, color: "" }));
  private live = 0;

  spawn(kind: PK, x: number, y: number, vx: number, vy: number, life: number, g = 0, color = ""): void {
    for (const p of this.pool) {
      if (p.on) continue;
      p.on = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.g = g;
      p.life = life;
      p.max = life;
      p.color = color;
      this.live++;
      return;
    }
  }

  update(dt: number): void {
    if (!this.live) return;
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        this.live--;
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.live) return;
    for (const p of this.pool) {
      if (!p.on) continue;
      const k = p.life / p.max;
      if (p.kind === PK.Sparkle) {
        draw(ctx, k > 0.45 ? "fx.sparkle.0" : "fx.sparkle.1", p.x, p.y, { anchor: "center" });
      } else if (p.kind === PK.Heart) {
        draw(ctx, "fx.heart", p.x, p.y, { anchor: "center", alpha: Math.min(1, k * 2) });
      } else {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        ctx.globalAlpha = 1;
      }
    }
  }
}

let particles: Particles | null = null;

export function initParticles(g: Game): void {
  if (particles) return;
  particles = addSafe(g, new Particles(), "particles");
}

/** A twinkly burst of sparkles (junimo poofs, clovers, stardrops...). */
export function sparkleBurst(x: number, y: number, n = 6, spread = 14): void {
  if (!particles) return;
  if (reducedMotion) n = Math.min(n, 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
    const sp = spread * (0.6 + Math.random() * 0.6);
    particles.spawn(PK.Sparkle, x, y, Math.cos(a) * sp, Math.sin(a) * sp - 6, 0.5 + Math.random() * 0.4);
  }
}

/** Little hearts floating up. */
export function heartFloat(x: number, y: number, n = 2): void {
  if (!particles) return;
  if (reducedMotion) n = 1;
  for (let i = 0; i < n; i++) particles.spawn(PK.Heart, x + rand(-4, 4), y - i * 3, rand(-3, 3), -10 - Math.random() * 4, 1.1 + i * 0.2);
}

/** Puff of colored pixels (grass bits, snow puffs) with a little gravity. */
export function dotPuff(x: number, y: number, colors: readonly string[], n = 8): void {
  if (!particles || !colors.length) return;
  if (reducedMotion) n = Math.min(n, 3);
  for (let i = 0; i < n; i++) {
    particles.spawn(PK.Dot, x + rand(-5, 5), y - rand(0, 3), rand(-16, 16), rand(-30, -12), 0.5 + Math.random() * 0.3, 70, colors[i % colors.length]!);
  }
}

/** Point-in-rect for hit boxes. */
export function inBox(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
  return px >= x && px <= x + w && py >= y && py <= y + h;
}
