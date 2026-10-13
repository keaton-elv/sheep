// Little sheep effects: dust puffs, wool tufts, golden twinkles, "+♥" floats, the shears swooping
// in for a snip, and wool items arcing out of a freshly sheared sheep into the chest.
// Everything lives in fixed pools (no per-frame allocation) and draws in two render passes.

import type { Game } from "../engine/game";
import { draw, isReal, size } from "../engine/sprites";

const Kind = { Puff: 0, Tuft: 1, Sparkle: 2, Heart: 3 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

interface Particle {
  on: boolean;
  kind: Kind;
  x: number;
  y: number;
  /** Height above the ground (tufts arc and bounce). */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  t: number;
  life: number;
  variant: number;
}

const MAX_PARTICLES = 160;
const pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
  on: false,
  kind: Kind.Puff as Kind,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  t: 0,
  life: 1,
  variant: 0,
}));
let liveCount = 0;

const reducedMotion = (() => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
})();

/** Scale particle counts down for reduced motion. */
function count(n: number): number {
  return reducedMotion ? Math.max(1, Math.ceil(n / 3)) : n;
}

function spawn(kind: Kind, x: number, y: number, life: number): Particle | null {
  for (const p of pool) {
    if (p.on) continue;
    p.on = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = 0;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.t = 0;
    p.life = life;
    p.variant = 0;
    liveCount++;
    return p;
  }
  return null;
}

/** A little dust cloud (sold sheep, wool regrowing, landing). */
export function spawnPuff(x: number, y: number, n = 8, spread = 8): void {
  for (let i = 0, c = count(n); i < c; i++) {
    const a = (i / c) * Math.PI * 2 + Math.random() * 0.6;
    const p = spawn(Kind.Puff, x + Math.cos(a) * 2, y + Math.sin(a) * 1.5, 0.45 + Math.random() * 0.25);
    if (!p) return;
    const sp = spread * (0.6 + Math.random() * 0.6);
    p.vx = Math.cos(a) * sp * 2.2;
    p.vy = Math.sin(a) * sp * 1.2 - 4;
    p.variant = 1 + Math.floor(Math.random() * 3);
  }
}

/** Wool tufts flying off a sheep being sheared. (x, y) = ground point under the sheep. */
export function spawnTufts(x: number, y: number, n: number, lift = 12): void {
  for (let i = 0, c = count(n); i < c; i++) {
    const p = spawn(Kind.Tuft, x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 4, 0.9 + Math.random() * 0.4);
    if (!p) return;
    p.z = lift + Math.random() * 6;
    p.vx = (Math.random() - 0.5) * 70;
    p.vy = (Math.random() - 0.5) * 16;
    p.vz = 30 + Math.random() * 55;
    p.variant = Math.random() < 0.6 ? 0 : 1;
  }
}

/** One golden twinkle. */
export function spawnSparkle(x: number, y: number, life = 0.5): void {
  spawn(Kind.Sparkle, x, y, life);
}

/** "+♥" floating up from a petted sheep. */
export function spawnPlusHeart(x: number, y: number): void {
  spawn(Kind.Heart, x, y, 1.0);
}

// ---------- wool items flying to the chest ----------

interface WoolFlyer {
  on: boolean;
  x0: number;
  y0: number;
  vx: number;
  delay: number;
  t: number;
  golden: boolean;
}

const WOOL_V0 = 90; // initial pop-up speed (px/s)
const WOOL_G = 620;
const WOOL_BOUNCE = 30;
const WOOL_LAND = (2 * WOOL_V0) / WOOL_G;
const WOOL_REST = WOOL_LAND + (2 * WOOL_BOUNCE) / WOOL_G;
const WOOL_FLY = 0.3;
const flyers: WoolFlyer[] = Array.from({ length: 8 }, () => ({ on: false, x0: 0, y0: 0, vx: 0, delay: 0, t: 0, golden: false }));

/** Total time a wool item takes from popping out to reaching the chest. */
export const WOOL_FLIGHT_TIME = WOOL_REST + WOOL_FLY;

/** Pop `n` wool items out of a sheep at (x, y) (its feet); they bounce once, then fly to the chest. */
export function launchWool(x: number, y: number, n: number, golden: boolean): void {
  for (let i = 0; i < n; i++) {
    const f = flyers.find((w) => !w.on);
    if (!f) return;
    f.on = true;
    f.x0 = x;
    f.y0 = y + 2;
    f.vx = n === 1 ? 14 : i === 0 ? -16 : 18;
    f.delay = i * 0.08;
    f.t = 0;
    f.golden = golden;
  }
}

// ---------- the shears ----------

interface ShearsAnim {
  on: boolean;
  start: number;
  target: () => { x: number; y: number } | null;
}

/** Tip offsets from the sheep's feet over time: swoop in, snip, slide, snip, lift away. */
const SHEAR_KEYS: [t: number, dx: number, dy: number, alpha: number][] = [
  [0.0, 22, -38, 0],
  [0.22, 8, -20, 1],
  [0.33, 7, -18, 1],
  [0.37, 6, -16, 1], // snip!
  [0.45, 6, -19, 1],
  [0.62, -4, -19, 1],
  [0.68, -5, -17, 1],
  [0.72, -6, -15, 1], // snip!
  [0.8, -6, -18, 1],
  [1.05, -16, -36, 0],
];
export const SNIP_TIMES = [0.35, 0.7];
const shears: ShearsAnim[] = Array.from({ length: 4 }, () => ({ on: false, start: 0, target: () => null }));

export function startShears(target: () => { x: number; y: number } | null): void {
  const s = shears.find((a) => !a.on);
  if (!s) return;
  s.on = true;
  s.start = performance.now();
  s.target = target;
}

function shearPose(t: number): { dx: number; dy: number; alpha: number } | null {
  const last = SHEAR_KEYS[SHEAR_KEYS.length - 1]!;
  if (t >= last[0]) return null;
  for (let i = 1; i < SHEAR_KEYS.length; i++) {
    const b = SHEAR_KEYS[i]!;
    if (t <= b[0]) {
      const a = SHEAR_KEYS[i - 1]!;
      let k = (t - a[0]) / (b[0] - a[0]);
      k = k * k * (3 - 2 * k);
      return { dx: a[1] + (b[1] - a[1]) * k, dy: a[2] + (b[2] - a[2]) * k, alpha: a[3] + (b[3] - a[3]) * k };
    }
  }
  return null;
}

// ---------- update & draw ----------

function update(dt: number): void {
  if (liveCount > 0) {
    for (const p of pool) {
      if (!p.on) continue;
      p.t += dt;
      if (p.t >= p.life) {
        p.on = false;
        liveCount--;
        continue;
      }
      if (p.kind === Kind.Tuft) {
        if (p.z > 0 || p.vz > 0) {
          p.vz -= 300 * dt;
          p.z += p.vz * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.z <= 0) {
            p.z = 0;
            p.vz = p.vz < -40 ? -p.vz * 0.3 : 0;
            p.vx *= 0.4;
            p.vy *= 0.4;
          }
        }
      } else if (p.kind === Kind.Puff) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - Math.min(1, dt * 5);
        p.vy *= 1 - Math.min(1, dt * 5);
      }
    }
  }
  for (const f of flyers) {
    if (!f.on) continue;
    f.t += dt;
    if (f.t - f.delay >= WOOL_FLIGHT_TIME) f.on = false;
  }
}

const SPARKLE_SEQ = [0, 1, 2, 1, 0];

/** Interaction feedback (twinkles, "+♥") that should stay bright at night, vs. dust and tufts. */
function glows(kind: Kind): boolean {
  return kind === Kind.Sparkle || kind === Kind.Heart;
}

/** `glowing` picks which half to draw: dust and tufts live in the world, the rest glows. */
function drawParticles(ctx: CanvasRenderingContext2D, glowing: boolean): void {
  if (liveCount === 0) return;
  for (const p of pool) {
    if (!p.on || glows(p.kind) !== glowing) continue;
    const k = p.t / p.life;
    switch (p.kind) {
      case Kind.Puff: {
        const r = Math.min(4, Math.max(1, Math.round(p.variant + k * 2)));
        ctx.globalAlpha = Math.max(0, 1 - k * k) * 0.9;
        draw(ctx, `fx.puff.${r}`, p.x, p.y, { anchor: "center" });
        break;
      }
      case Kind.Tuft: {
        ctx.globalAlpha = k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
        draw(ctx, `fx.tuft.${p.variant}`, p.x, p.y - p.z, { anchor: "center" });
        break;
      }
      case Kind.Sparkle: {
        const f = SPARKLE_SEQ[Math.min(SPARKLE_SEQ.length - 1, Math.floor(k * SPARKLE_SEQ.length))]!;
        ctx.globalAlpha = 1;
        draw(ctx, `fx.sparkle.${f}`, p.x, p.y, { anchor: "center" });
        break;
      }
      case Kind.Heart: {
        const rise = 1 - (1 - k) * (1 - k);
        const yy = Math.round(p.y - rise * 14);
        ctx.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
        draw(ctx, "fx.plus", Math.round(p.x) - 8, yy - 3);
        draw(ctx, "ui.heart.full", Math.round(p.x) + 1, yy - 3);
        break;
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawWool(ctx: CanvasRenderingContext2D, g: Game): void {
  const chest = g.layout.chest;
  for (const f of flyers) {
    if (!f.on) continue;
    const t = f.t - f.delay;
    if (t < 0) continue;
    const key = "item.wool";
    let x: number;
    let y: number;
    let scale = 1;
    if (t < WOOL_REST) {
      // Pop up, land, one little bounce.
      const tt = Math.min(t, WOOL_REST);
      x = f.x0 + f.vx * Math.min(tt, WOOL_LAND);
      let z: number;
      if (tt < WOOL_LAND) z = WOOL_V0 * tt - 0.5 * WOOL_G * tt * tt;
      else {
        const b = tt - WOOL_LAND;
        z = WOOL_BOUNCE * b - 0.5 * WOOL_G * b * b;
      }
      // Ground shadow under the item.
      ctx.fillStyle = "rgba(40,20,60,0.25)";
      ctx.fillRect(Math.round(x) - 4, Math.round(f.y0) - 1, 8, 2);
      y = f.y0 - 8 - Math.max(0, z);
    } else {
      // Zip into the chest, shrinking.
      let k = Math.min(1, (t - WOOL_REST) / WOOL_FLY);
      k = k * k;
      const sx = f.x0 + f.vx * WOOL_LAND;
      const sy = f.y0 - 8;
      const tx = chest.x;
      const ty = chest.y - 12;
      x = sx + (tx - sx) * k;
      y = sy + (ty - sy) * k - Math.sin(k * Math.PI) * 12;
      scale = 1 - k * 0.5;
    }
    draw(ctx, key, x, y, { anchor: "center", scale });
    if (f.golden && Math.floor(t * 20) % 3 === 0) {
      const s = size(key);
      const half = s ? s.w / 2 : 8;
      ctx.globalAlpha = 0.9;
      draw(ctx, "fx.sparkle.1", x + half * 0.6 * scale, y - half * 0.6 * scale, { anchor: "center" });
      ctx.globalAlpha = 1;
    }
  }
}

function drawShears(ctx: CanvasRenderingContext2D): void {
  const now = performance.now();
  for (const s of shears) {
    if (!s.on) continue;
    const t = (now - s.start) / 1000;
    const pose = shearPose(t);
    const at = s.target();
    if (!pose || !at) {
      s.on = false;
      continue;
    }
    const tipX = Math.round(at.x + pose.dx);
    const tipY = Math.round(at.y + pose.dy);
    ctx.globalAlpha = Math.max(0, Math.min(1, pose.alpha));
    // Place the blade tips on the wool. The hand-drawn shears point up-right; the real Stardew
    // icon points up-left, so mirror it to match.
    draw(ctx, "fx.shears", tipX - 6, tipY + 7, { anchor: "center", flipX: isReal("fx.shears") });
    // A white "snip!" flash right at the snip moments.
    for (const st of SNIP_TIMES) {
      const d = t - st;
      if (d < 0 || d > 0.1) continue;
      const r = d < 0.05 ? 3 : 4;
      ctx.globalAlpha = 1 - d / 0.1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(tipX - r - 1, tipY, 2, 1);
      ctx.fillRect(tipX + r, tipY, 2, 1);
      ctx.fillRect(tipX, tipY - r - 1, 1, 2);
      ctx.fillRect(tipX, tipY + r, 1, 2);
      ctx.fillRect(tipX - r, tipY - r, 1, 1);
      ctx.fillRect(tipX + r, tipY - r, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

let installed = false;
let reported = false;

/** The engine loop has no try/catch (one throw freezes the farm): log once and keep going. */
function report(err: unknown): void {
  if (reported) return;
  reported = true;
  console.error("[sheep-fx]", err);
}

/**
 * Hook the effects into the game: one update per tick and two render passes above the entities.
 * Dust and wool tufts are part of the world (dimmed at night like everything else); the shears,
 * twinkles, "+♥" and wool flying to the chest are feedback, so they draw above the night overlay
 * (100) and the glow (110) and stay readable when you two shear a plan in the evening.
 */
export function initSheepFx(g: Game): void {
  if (installed) return;
  installed = true;
  g.on("tick", (dt: number) => {
    try {
      update(dt);
    } catch (err) {
      report(err);
    }
  });
  g.addPass({
    order: 4,
    draw(ctx) {
      try {
        drawParticles(ctx, false);
      } catch (err) {
        report(err);
      }
      ctx.globalAlpha = 1;
    },
  });
  g.addPass({
    order: 111,
    draw(ctx, game) {
      try {
        drawParticles(ctx, true);
        drawShears(ctx);
        drawWool(ctx, game);
      } catch (err) {
        report(err);
      }
      ctx.globalAlpha = 1;
    },
  });
}
