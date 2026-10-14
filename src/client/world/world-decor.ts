// Decorations from the carpenter's shop (scarecrows, rarecrows, lampposts, a campfire, a pond,
// a golden sheep statue...), kept in sync with the farm state, plus "placement mode": a ghost
// that follows your finger until you pick a spot. The pond's art and its place in the world live
// in world-pond.ts; its ducks, turtle and frogs in entities/critter-pond.ts.

import { sfx } from "../audio";
import { dayKey, type Season } from "../../shared/calendar";
import type { Decoration, DecorKind, FarmState } from "../../shared/types";
import { tinted } from "../engine/pixelart";
import type { Entity, Game, Light } from "../engine/game";
import { draw, has, spriteCanvas } from "../engine/sprites";
import { store } from "../net";
import { el, openMenu, spriteIcon, uiRoot } from "../ui/dom";
import { contains, inflate, toFraction, type Rect } from "./layout";
import { DECOR_VARIANTS, STATUE_SHINE_FRAMES, VARIANT_NAMES, decorSize, drawArt, fireFrames, lilyPads, miniPad } from "./world-art";
import { dustPuff, fx, reducedMotion, sparkle } from "./world-fx";
import { hash2 } from "./world-pixels";
import {
  debugPond,
  drawRipples,
  isDebugPond,
  onPond,
  onWater,
  pondArt,
  pondFeet,
  pondPicture,
  ponds,
  registerPondIcon,
  ripple,
  setPondHidden,
  setPondPending,
  updateRipples,
  type PondArt,
} from "./world-pond";
import { guard, safeOn, safePass } from "./world-safe";
import { keepClear } from "./world-zones";
import "./world.css";

const LAMP_LIGHT = "rgba(255,214,140,0.95)";
const FIRE_KEYS = Array.from({ length: 8 }, (_, i) => `world.fire.${i}`);
const SHINE_KEYS = Array.from({ length: STATUE_SHINE_FRAMES }, (_, i) => `world.statue.shine.${i}`);
const FIRE_LIGHT = "rgba(255,150,70,0.95)";
const PUMPKIN_LIGHT = "rgba(255,170,60,0.85)";
/** Render pass for the placement ghost: anything that must stay readable at night uses > 110. */
const GHOST_PASS = 115;
/** The moon on the pond at night: just above the night overlay (100), under the weather glow (110). */
const MOON_PASS = 105;

/** Clamp any variant number (even NaN or negative ones from an old save) into range. */
function variantIndex(kind: DecorKind, variant: number, n = DECOR_VARIANTS[kind] ?? 1): number {
  const v = Number.isFinite(variant) ? Math.floor(variant) : 0;
  return ((v % n) + n) % n;
}

export function decorKey(kind: DecorKind, variant = 0): string {
  return `decor.${kind}.${variantIndex(kind, variant)}`;
}

export function variantCount(kind: DecorKind): number {
  return DECOR_VARIANTS[kind] ?? 1;
}

/** A friendly name for a variant (rarecrows have names), or null for single-look kinds. */
export function variantName(kind: DecorKind, variant: number): string | null {
  const names = VARIANT_NAMES[kind];
  if (!names?.length) return null;
  return names[variantIndex(kind, variant, names.length)] ?? null;
}

let game: Game | null = null;
const entities = new Map<string, DecorEntity>();
/** The ?pond debug pond: only on this screen, and only while the farm has no pond of its own. */
let debugEntity: DecorEntity | null = null;
let synced = false;

// ---------- one decoration ----------

class DecorEntity implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  hidden = false;
  /** Show here (pasture fractions) until the server agrees (after a move). */
  pending: { fx: number; fy: number; until: number } | null = null;
  private drop = 0;
  private t = Math.random() * 100;
  private fxTimer = Math.random() * 2;
  private shineT = -1;
  private fish = -1;
  private fishX = 0;
  private fishY = 0;
  /** The moonlight pooling on the pond at night (reused every frame). */
  private moonLight: Light = { x: 0, y: 0, radius: 16, color: "rgba(180,196,255,0.22)" };
  private wiggle = 0;
  /** Bee houses have honey on some days (cosmetic, per day). */
  honey = false;
  /** Sprite key for this kind+variant (cached: draw() runs every frame). */
  private key: string;

  constructor(public d: Decoration, animateIn: boolean) {
    this.layer = d.kind === "pond" ? 0 : 1;
    this.key = decorKey(d.kind, d.variant);
    if (animateIn) this.drop = 0.45;
  }

  setDecoration(d: Decoration): void {
    this.d = d;
    this.layer = d.kind === "pond" ? 0 : 1;
    this.key = decorKey(d.kind, d.variant);
    if (this.pending && Math.abs(d.fx - this.pending.fx) < 0.002 && Math.abs(d.fy - this.pending.fy) < 0.002) this.setPending(null);
  }

  setPending(p: { fx: number; fy: number; until: number } | null): void {
    this.pending = p;
    if (this.d.kind === "pond") setPondPending(this.d.id, p);
  }

  update(dt: number, g: Game): void {
    if (this.pending && g.time > this.pending.until) this.setPending(null);
    const pos = this.pending ?? this.d;
    const pa = g.layout.pasture;
    if (this.d.kind === "pond") pondFeet(g.layout, pos.fx, pos.fy, this);
    else {
      this.x = Math.round(pa.x + pos.fx * pa.w);
      this.y = Math.round(pa.y + pos.fy * pa.h);
    }
    this.t += dt;
    if (this.wiggle > 0) this.wiggle = Math.max(0, this.wiggle - dt);
    if (this.drop > 0) {
      this.drop = Math.max(0, this.drop - dt);
      if (this.drop === 0) {
        dustPuff(this.x, this.y, 10);
        sfx("thud", { volume: 0.6 });
      }
    }
    if (this.hidden) return;
    const env = g.env;
    const dark = env.darkness;
    switch (this.d.kind) {
      case "lamppost":
        if (dark > 0.04) g.addLight({ x: this.x, y: this.y - 27, radius: 54, color: LAMP_LIGHT });
        break;
      case "campfire": {
        if (dark > 0.04) g.addLight({ x: this.x, y: this.y - 7, radius: 40 + Math.sin(this.t * 9) * 2 + Math.sin(this.t * 23) * 1.5, color: FIRE_LIGHT });
        this.fxTimer -= dt;
        if (this.fxTimer <= 0 && !reducedMotion) {
          this.fxTimer = 0.28 + Math.random() * 0.25;
          const grey = 150 + Math.floor(Math.random() * 60);
          fx.spawn({ x: this.x + (Math.random() * 4 - 2), y: this.y - 16, vx: (Math.random() - 0.3) * 4, vy: -10 - Math.random() * 5, flutter: 4, life: 1.6, color: `rgba(${grey},${grey},${grey + 8},0.7)`, size: Math.random() < 0.5 ? 2 : 1 });
          if (Math.random() < 0.25) fx.spawn({ x: this.x + (Math.random() * 6 - 3), y: this.y - 10, vy: -22, vx: (Math.random() - 0.5) * 10, life: 0.6, color: "#ffb03a" });
        }
        break;
      }
      case "pumpkin":
        if (dark > 0.2) g.addLight({ x: this.x, y: this.y - 6, radius: 24, color: PUMPKIN_LIGHT });
        break;
      case "sheepstatue":
        this.fxTimer -= dt;
        if (this.fxTimer <= 0) {
          this.fxTimer = 3.5 + Math.random() * 3;
          this.shineT = 0;
          if (!reducedMotion) sparkle(this.x + 4, this.y - 26, 2, 9);
        }
        if (this.shineT >= 0) {
          this.shineT += dt;
          if (this.shineT > STATUE_SHINE_FRAMES * 0.07) this.shineT = -1;
        }
        if (dark > 0.3) g.addLight({ x: this.x, y: this.y - 20, radius: 16, color: "rgba(255,220,120,0.5)" });
        break;
      case "pond":
        this.updatePond(dt, g);
        break;
      case "tree":
        // Now and then a leaf lets go (petals in spring).
        if (env.season !== "winter" && !reducedMotion) {
          this.fxTimer -= dt;
          if (this.fxTimer <= 0) {
            this.fxTimer = 4 + Math.random() * 6;
            const col = { spring: "#ffb6d9", summer: "#6cc04a", fall: "#f08a34", winter: "#fff" }[env.season];
            fx.spawn({ x: this.x + (Math.random() * 20 - 10), y: this.y - 30, vy: 6, vx: 4, flutter: 10, g: 2, life: 4, groundY: this.y + (Math.random() * 6 - 2), color: col, size: 1 });
          }
        }
        break;
      default:
        break;
    }
  }

  private updatePond(dt: number, g: Game): void {
    const env = g.env;
    const a = pondArt(env.season);
    const left = Math.round(this.x - a.w / 2);
    const top = this.y - a.h;
    const wb = a.water;
    // A little moonlight pooling on the water (the glint itself is drawn above the night).
    if (env.darkness > 0.45 && moonOut(g)) {
      this.moonLight.x = left + wb.x + wb.w * 0.66;
      this.moonLight.y = top + wb.y + wb.h * 0.4;
      g.addLight(this.moonLight);
    }
    if (env.season === "winter") {
      this.fxTimer -= dt;
      if (this.fxTimer <= 0 && !reducedMotion) {
        this.fxTimer = 2 + Math.random() * 3;
        sparkle(left + wb.x + 4 + Math.random() * (wb.w - 8), top + wb.y + 3 + Math.random() * (wb.h - 6), 1, 2, "#ffffff");
      }
      return;
    }
    this.fxTimer -= dt;
    if (this.fxTimer <= 0) {
      // Raindrops dimple the pond much more often.
      const raining = env.weather === "rain" || env.weather === "storm";
      this.fxTimer = raining ? 0.12 + Math.random() * 0.2 : 1.1 + Math.random() * 1.8;
      for (let k = 0; k < 8; k++) {
        const x = wb.x + 3 + Math.floor(Math.random() * Math.max(1, wb.w - 6));
        const y = wb.y + 3 + Math.floor(Math.random() * Math.max(1, wb.h - 6));
        if (a.mask[y * a.w + x]) {
          ripple(left + x, top + y);
          break;
        }
      }
    }
    // A fish jumps every so often.
    if (this.fish < 0) {
      if (Math.random() < dt / 25 && !reducedMotion) {
        this.fish = 0;
        this.fishX = wb.x + 6 + Math.random() * Math.max(1, wb.w - 26);
        this.fishY = wb.y + wb.h * (0.4 + Math.random() * 0.3);
      }
    } else {
      this.fish += dt;
      if (this.fish > 0.7) {
        ripple(left + Math.round(this.fishX + 12), top + Math.round(this.fishY));
        this.fish = -1;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.hidden) return;
    const season = g.env.season;
    const dropY = this.drop > 0 ? -Math.round((this.drop / 0.45) ** 2 * 18) : 0;
    const shake = this.wiggle > 0 ? Math.round(Math.sin(this.wiggle * 50) * this.wiggle * 3) : 0;
    const x = this.x + shake;
    const y = this.y + dropY;
    const kind = this.d.kind;
    const key = this.key;
    switch (kind) {
      case "pond":
        this.drawPond(ctx, x, y, season);
        return;
      case "campfire": {
        drawArt(ctx, has("world.campfire.base") ? "world.campfire.base" : key, x, y, season, { anchor: "feet" });
        const f = Math.floor(this.t * 10) % Math.max(1, fireFrames.length);
        draw(ctx, FIRE_KEYS[f] ?? "world.fire.0", x - 8, y - 23);
        return;
      }
      case "pumpkin": {
        drawArt(ctx, key, x, y, season, { anchor: "feet" });
        const dark = g.env.darkness;
        if (dark > 0.15) draw(ctx, "world.pumpkin.lit", x, y, { anchor: "feet", alpha: Math.min(1, (dark - 0.15) * 3) });
        return;
      }
      case "beehouse": {
        // (The bumblebees buzzing around it belong to the critters.)
        drawArt(ctx, this.honey && season !== "winter" ? "world.beehouse.honey" : key, x, y, season, { anchor: "feet" });
        return;
      }
      case "sheepstatue": {
        const f = this.shineT >= 0 ? Math.min(STATUE_SHINE_FRAMES - 1, Math.floor(this.shineT / 0.07)) : -1;
        draw(ctx, f >= 0 ? (SHINE_KEYS[f] ?? key) : key, x, y, { anchor: "feet" });
        return;
      }
      default:
        // No sprite for it (sheet missing)? A little crate stands in, so it's still tappable.
        if (!drawArt(ctx, key, x, y, season, { anchor: "feet" })) draw(ctx, "world.crate", x, y, { anchor: "feet" });
    }
  }

  private drawPond(ctx: CanvasRenderingContext2D, x: number, y: number, season: Season): void {
    const pond = pondArt(season);
    const wb = pond.water;
    const left = Math.round(x - pond.w / 2);
    const top = Math.round(y - pond.h);
    ctx.drawImage(pond.bed, left, top);
    if (season !== "winter") {
      if (pond.shimmer) {
        // Stardew's shimmer strip, twice, drifting and breathing out of step (the rim hides its ends).
        const sw = pond.shimmer.width;
        for (let i = 0; i < 2; i++) {
          const k = this.t + i * 2.3;
          const sx = left + wb.x + Math.round((wb.w - sw) / 2 + Math.sin(k * 0.45) * 5);
          const sy = top + wb.y + Math.round(wb.h * (0.22 + 0.4 * i) + Math.sin(k * 0.7) * 1.5);
          ctx.globalAlpha = 0.35 + 0.45 * Math.sin(k * 0.9) ** 2;
          ctx.drawImage(pond.shimmer, sx, sy);
        }
        ctx.globalAlpha = 1;
      } else {
        // (Hand-drawn pond) glints drifting on the water.
        ctx.fillStyle = "#9fd2f6";
        for (let i = 0; i < 3; i++) {
          const gx = Math.round(10 + ((this.t * (3 + i) + i * 9) % 22));
          const gy = 9 + i * 3;
          if (pond.mask[gy * pond.w + gx] && pond.mask[gy * pond.w + gx + 1]) ctx.fillRect(left + gx, top + gy, 2, 1);
        }
      }
      drawRipples(ctx, pond, left, top);
      const pad = lilyPads[Math.floor(this.t * 1.5) % Math.max(1, lilyPads.length)];
      if (pond.real) {
        // A lily pad by the front stones, a little flowering one tucked under the far bank.
        if (pad && season !== "fall") ctx.drawImage(pad, left + wb.x + 1, top + wb.y + wb.h - 15);
        if (miniPad) ctx.drawImage(miniPad, left + wb.x + wb.w - 12, top + wb.y + 7);
      } else {
        if (pad) ctx.drawImage(pad, left + 7, top + 3);
        if (miniPad) ctx.drawImage(miniPad, left + pond.w - 16, top + pond.h - 11);
      }
      // The jumping fish: a little orange arc.
      if (this.fish >= 0) {
        const k = this.fish / 0.7;
        const fxp = Math.round(left + this.fishX + k * 12);
        const fyp = Math.round(top + this.fishY - Math.sin(k * Math.PI) * 9);
        ctx.fillStyle = "#3a2a3a";
        ctx.fillRect(fxp - 1, fyp, 5, 2);
        ctx.fillStyle = "#ff9a3a";
        ctx.fillRect(fxp, fyp, 3, 1);
        ctx.fillStyle = "#ffd27a";
        ctx.fillRect(fxp + 3, fyp - 1, 1, 1);
      }
    }
    ctx.drawImage(pond.rim, left, top);
  }

  hit(wx: number, wy: number): boolean {
    if (this.hidden || placement) return false;
    const s = sizeOf(this.d.kind);
    // A comfy thumb-sized target even for little things like the gnome.
    const w = Math.max(22, s.w + 4);
    const h = Math.max(22, s.h);
    return wx >= this.x - w / 2 && wx <= this.x + w / 2 && wy >= this.y - h && wy <= this.y + 4;
  }

  onTap(g: Game, wx: number, wy: number): void {
    if (this.d.kind === "pond") {
      // A plop where the finger lands on the water (and the pond's own menu, unless it's pretend).
      const season = g.env.season;
      const spot = ponds(g.layout).find((p) => p.id === this.d.id);
      if (spot && season !== "winter" && onWater(spot, wx, wy, season)) {
        ripple(wx, wy);
        sfx("plop", { volume: 0.5, pitch: 1.1 });
      }
      if (isDebugPond(this.d.id)) return;
    }
    this.wiggle = this.d.kind === "pond" ? 0 : 0.25;
    openMenu("decor", this.d.id);
  }
}

/** In-world size of a kind (the pond's comes from its art: real or hand-drawn). */
function sizeOf(kind: DecorKind): { w: number; h: number } {
  if (kind !== "pond") return decorSize(kind);
  const a = pondArt("spring");
  return { w: a.w, h: a.h };
}

/** Is the sky clear enough for the moon to show on the pond? */
function moonOut(g: Game): boolean {
  const w = g.env.weather;
  return w === "sunny" || w === "cloudy" || w === "windy";
}

/** The moon's reflection: three wobbling streaks, upper right of the open water. */
function drawMoonGlint(ctx: CanvasRenderingContext2D, a: PondArt, left: number, top: number, t: number, alpha: number, frozen: boolean): void {
  const wb = a.water;
  const cx = left + wb.x + Math.round(wb.w * 0.66);
  const cy = top + wb.y + Math.round(wb.h * 0.36);
  ctx.globalAlpha = alpha;
  for (let row = 0; row < 3; row++) {
    const half = row === 1 ? 3 : row === 0 ? 2 : 1;
    // Ice holds the moon still; water breaks it up a little.
    const wob = frozen ? 0 : Math.round(Math.sin(t * 1.6 + row * 1.9) * 1.2);
    ctx.fillStyle = row === 1 ? "#f4f8ff" : "#cddcff";
    for (let dx = -half; dx < half; dx++) {
      const px = cx + dx + wob;
      const py = cy + row * 2;
      const lx = px - left;
      const ly = py - top;
      if (lx >= 0 && ly >= 0 && lx < a.w && ly < a.h && a.mask[ly * a.w + lx]) ctx.fillRect(px, py, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- syncing with the farm state ----------

function sync(state: FarmState | null): void {
  const g = game;
  if (!g) return;
  const day = dayKey(g.env.now);
  const seen = new Set<string>();
  for (const d of state?.decorations ?? []) {
    seen.add(d.id);
    let e = entities.get(d.id);
    if (e) e.setDecoration(d);
    else {
      e = new DecorEntity(d, synced);
      entities.set(d.id, e);
      g.add(guard(e, `decor.${d.kind}`));
    }
    e.honey = hash2(day.length + Number(day.replaceAll("-", "")), d.id.charCodeAt(0) || 1, 9) < 0.55;
  }
  for (const [id, e] of entities) {
    if (seen.has(id)) continue;
    if (!e.hidden) dustPuff(e.x, e.y, 12);
    if (e.d.kind === "pond") setPondHidden(id, false);
    g.remove(e);
    entities.delete(id);
  }
  // The pretend pond steps aside once there's a real one.
  if (debugEntity) debugEntity.hidden = !ponds(g.layout).some((p) => p.debug);
  if (state) synced = true;
}

export function initDecor(g: Game): void {
  game = g;
  registerPondIcon();
  const dbg = debugPond();
  if (dbg) debugEntity = g.add(guard(new DecorEntity(dbg, false), "decor.pond"));
  safeOn(g, "tick", "pond ripples", (dt: number) => updateRipples(dt));
  safePass(g, MOON_PASS, "pond moon", (ctx, gg) => {
    const env = gg.env;
    if (env.darkness < 0.45 || !moonOut(gg)) return;
    const a = pondArt(env.season);
    for (const p of ponds(gg.layout)) {
      if (p.hidden) continue;
      drawMoonGlint(ctx, a, p.left, p.top, gg.time, Math.min(0.8, (env.darkness - 0.45) * 2.2), env.season === "winter");
    }
  });
  g.canvas.addEventListener("pointerdown", (ev) => (lastPointerType = ev.pointerType || "mouse"), { capture: true });
  store.changed.on((s) => {
    try {
      sync(s);
    } catch (err) {
      console.error("[world] decoration sync failed", err);
    }
  });
  sync(store.state);
  store.events.on(({ event, own }) => {
    if (own || event.kind !== "decorated") return;
    // The other farmer decorated: a little sparkle once it shows up.
    setTimeout(() => {
      for (const e of entities.values()) if (e.d.createdAt > Date.now() - 15000) sparkle(e.x, e.y - 12, 5, 10);
    }, 400);
  });
  // Above the night overlay (sky = 100) and the lights: the ghost is UI and must read at night.
  safePass(g, GHOST_PASS, "placement ghost", (ctx) => drawGhost(ctx));
}

// ---------- placement mode ----------

let lastPointerType = "mouse";

interface Placement {
  kind: DecorKind;
  variant: number;
  movingId: string | null;
  x: number;
  y: number;
  valid: boolean;
  armed: boolean;
  shake: number;
  art: HTMLCanvasElement;
  good: HTMLCanvasElement;
  bad: HTMLCanvasElement;
  banner: HTMLElement;
  text: HTMLElement;
  ok: HTMLButtonElement;
  resolve: (r: { fx: number; fy: number } | null) => void;
  cleanup: (() => void)[];
}

let placement: Placement | null = null;

export function isPlacing(): boolean {
  return placement !== null;
}

const touches = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function validSpot(g: Game, x: number, y: number, kind: DecorKind, movingId: string | null): boolean {
  const l = g.layout;
  if (!contains(l.pasture, x, y)) return false;
  if (kind === "pond") return validPondSpot(g, x, y, movingId);
  if (l.blocked.some((r) => contains(inflate(r, 2), x, y))) return false;
  // Not in the fox & hedgehog's corner (or just above it), nor in the barn door yard: the whole
  // base counts, so a wide decoration next to the corner can't spill over the fox.
  const half = Math.max(4, decorSize(kind).w / 2 - 2);
  const base = { x: x - half, y: y - 4, w: half * 2, h: 6 };
  if (keepClear(l).some((r) => touches(base, r))) return false;
  // Nor on a pond.
  if (onPond(l, x, y, 4)) return false;
  for (const e of entities.values()) {
    if (e.d.id === movingId || e.hidden) continue;
    if (Math.abs(e.x - x) < 10 && Math.abs(e.y - y) < 7) return false;
  }
  return true;
}

/**
 * A pond (x, y = its clamped feet) takes a big bite of pasture: all of it has to stay clear of the
 * HUD, the fox's corner, the barn door yard, the path in from the gate, other ponds and every other
 * decoration's feet.
 */
function validPondSpot(g: Game, x: number, y: number, movingId: string | null): boolean {
  const l = g.layout;
  const a = pondArt("spring");
  const box: Rect = { x: x - a.w / 2, y: y - a.h, w: a.w, h: a.h };
  if (l.blocked.some((r) => touches(box, r))) return false;
  if (keepClear(l).some((r) => touches(box, r))) return false;
  const gt = l.gate;
  const gateWay: Rect = gt.side === "top" ? { x: gt.x - 18, y: gt.y, w: 36, h: 40 } : { x: gt.x, y: gt.y - 18, w: 40, h: 36 };
  if (touches(box, gateWay)) return false;
  for (const p of ponds(l)) {
    if (p.id === movingId || p.hidden || p.debug) continue;
    if (touches(box, inflate({ x: p.left, y: p.top, w: p.w, h: p.h }, 4))) return false;
  }
  for (const e of entities.values()) {
    if (e.d.id === movingId || e.hidden || e.d.kind === "pond") continue;
    if (contains(inflate(box, 4), e.x, e.y)) return false;
  }
  return true;
}

function drawGhost(ctx: CanvasRenderingContext2D): void {
  const p = placement;
  const g = game;
  if (!p || !g) return;
  const shake = p.shake > 0 ? Math.round(Math.sin(p.shake * 60) * 2) : 0;
  const x = Math.round(p.x) + shake;
  const y = Math.round(p.y);
  // Footprint marker.
  ctx.fillStyle = p.valid ? "rgba(120,255,140,0.45)" : "rgba(255,90,90,0.45)";
  ctx.fillRect(x - 6, y - 1, 12, 3);
  ctx.fillRect(x - 8, y, 16, 1);
  const bob = Math.round(Math.sin(g.time * 5) * 1) - 2;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(p.valid ? p.good : p.bad, x - Math.floor(p.art.width / 2), y - p.art.height + bob);
  ctx.globalAlpha = 1;
}

/**
 * Placement mode: a ghost of the decoration follows the pointer over the pasture (green = OK,
 * red = not there). Mouse: click to place. Touch: tap to move the ghost, tap it again (or the
 * "Here!" button) to place. Tap outside the pasture, press Escape or the ✕ to cancel.
 */
export function beginPlacement(kind: DecorKind, variant: number, movingId: string | null): Promise<{ fx: number; fy: number } | null> {
  const g = game;
  if (!g) return Promise.resolve(null);
  if (placement) finish(null);
  return new Promise((resolve) => {
    const key = decorKey(kind, variant);
    // (The pond's ghost is the whole pond: its icon is a half-size picture.)
    const art = kind === "pond" ? pondPicture(g.env.season) : spriteCanvas(has(key) ? key : "world.crate");
    const good = tinted(null, art, "#7dff8a", 0.35);
    const bad = tinted(null, art, "#ff4a4a", 0.5);
    const l = g.layout;
    // A pond's feet snap to where the whole pond fits inside the fence.
    const snap = (wx: number, wy: number) => {
      if (kind !== "pond") return { x: wx, y: wy };
      const f = toFraction(g.layout, wx, wy);
      return pondFeet(g.layout, f.fx, f.fy);
    };
    let start = snap(l.pasture.x + l.pasture.w / 2, l.pasture.y + l.pasture.h / 2);
    if (movingId) {
      const e = entities.get(movingId);
      if (e) {
        start = { x: e.x, y: e.y };
        e.hidden = true;
        if (kind === "pond") setPondHidden(movingId, true);
      }
    }

    const text = el("span", { class: "wd-banner__text" }, movingId ? "Tap its new spot!" : "Tap a spot in the pasture!");
    const ok = el("button", { class: "sv-btn sv-btn--primary wd-banner__ok", type: "button" }, "Here!");
    const x = el("button", { class: "sv-btn wd-banner__x", type: "button", "aria-label": "Cancel" }, has("ui.close") ? spriteIcon("ui.close") : "✕");
    const banner = el("div", { class: "sv-box wd-banner", role: "status", "aria-live": "polite" }, has(key) ? spriteIcon(key, { class: "wd-banner__icon" }) : null, text, ok, x);
    uiRoot.appendChild(banner);

    const p: Placement = {
      kind,
      variant,
      movingId,
      x: start.x,
      y: start.y,
      valid: validSpot(g, start.x, start.y, kind, movingId),
      armed: false,
      shake: 0,
      art,
      good,
      bad,
      banner,
      text,
      ok,
      resolve,
      cleanup: [],
    };
    placement = p;
    sfx("woosh", { volume: 0.5 });

    const moveTo = (wx: number, wy: number) => {
      const at = snap(wx, wy);
      p.x = at.x;
      p.y = at.y;
      p.valid = validSpot(g, at.x, at.y, kind, movingId);
      p.ok.disabled = !p.valid;
    };
    ok.disabled = !p.valid;
    const confirm = () => {
      if (!p.valid) {
        p.shake = 0.3;
        sfx("cancel");
        return;
      }
      const f = toFraction(g.layout, p.x, p.y);
      if (movingId) {
        const e = entities.get(movingId);
        e?.setPending({ fx: f.fx, fy: f.fy, until: g.time + 6 });
        dustPuff(p.x, p.y, 10);
      }
      sfx("select");
      finish(f);
    };

    // Touch: was this press on the (armed) ghost? Decided at pointerdown, before the ghost moves.
    let downOnGhost = false;
    const onGhost = (wx: number, wy: number) => {
      const halfW = Math.max(10, art.width / 2 + 2);
      return Math.abs(wx - p.x) <= halfW && wy >= p.y - art.height - 4 && wy <= p.y + 8;
    };
    p.cleanup.push(
      g.on("pointermove", (pt: { x: number; y: number }) => {
        if (!downOnGhost) moveTo(pt.x, pt.y);
      }),
      g.on("pointerdown", (pt: { x: number; y: number }) => {
        downOnGhost = lastPointerType !== "mouse" && p.armed && onGhost(pt.x, pt.y);
        if (!downOnGhost) moveTo(pt.x, pt.y);
      }),
      g.onGroundTap((wx, wy) => {
        if (!contains(inflate(g.layout.pasture, 6), wx, wy)) {
          finish(null);
          return true;
        }
        if (lastPointerType === "mouse") {
          moveTo(wx, wy);
          confirm();
          return true;
        }
        if (downOnGhost) {
          downOnGhost = false;
          confirm();
          return true;
        }
        moveTo(wx, wy);
        if (!p.valid) {
          p.shake = 0.3;
          sfx("cancel");
          return true;
        }
        p.armed = true;
        p.text.textContent = "Tap it again to plop it here";
        sfx("select", { volume: 0.6 });
        return true;
      }),
      safeOn(g, "tick", "placement", (dt: number) => {
        if (p.shake > 0) p.shake = Math.max(0, p.shake - dt);
      }),
    );
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        finish(null);
      } else if (ev.key === "Enter" && p.valid) {
        ev.preventDefault();
        confirm();
      }
    };
    addEventListener("keydown", onKey);
    p.cleanup.push(() => removeEventListener("keydown", onKey));
    ok.addEventListener("click", () => confirm());
    x.addEventListener("click", () => {
      sfx("cancel");
      finish(null);
    });
  });
}

function finish(result: { fx: number; fy: number } | null): void {
  const p = placement;
  if (!p) return;
  placement = null;
  for (const fn of p.cleanup) fn();
  p.banner.classList.add("is-leaving");
  setTimeout(() => p.banner.remove(), 160);
  if (p.movingId) {
    const e = entities.get(p.movingId);
    if (e) e.hidden = false;
    setPondHidden(p.movingId, false);
  }
  p.resolve(result);
}
