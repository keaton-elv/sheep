// Decorations from the carpenter's shop (scarecrows, rarecrows, lampposts, a campfire, a pond,
// a golden sheep statue...), kept in sync with the farm state, plus "placement mode": a ghost
// that follows your finger until you pick a spot.

import { sfx } from "../audio";
import { dayKey, type Season } from "../../shared/calendar";
import type { Decoration, DecorKind, FarmState } from "../../shared/types";
import { tinted } from "../engine/pixelart";
import type { Entity, Game } from "../engine/game";
import { draw, has, spriteCanvas } from "../engine/sprites";
import { store } from "../net";
import { el, openMenu, spriteIcon, uiRoot } from "../ui/dom";
import { contains, inflate, toFraction } from "./layout";
import { DECOR_VARIANTS, STATUE_SHINE_FRAMES, VARIANT_NAMES, decorSize, drawArt, fireFrames, getPond, lilyPads, miniPad } from "./world-art";
import { dustPuff, fx, reducedMotion, sparkle } from "./world-fx";
import { hash2 } from "./world-pixels";
import { guard, safeOn, safePass } from "./world-safe";
import "./world.css";

const LAMP_LIGHT = "rgba(255,214,140,0.95)";
const FIRE_KEYS = Array.from({ length: 8 }, (_, i) => `world.fire.${i}`);
const SHINE_KEYS = Array.from({ length: STATUE_SHINE_FRAMES }, (_, i) => `world.statue.shine.${i}`);
const FIRE_LIGHT = "rgba(255,150,70,0.95)";
const PUMPKIN_LIGHT = "rgba(255,170,60,0.85)";

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
let synced = false;

// ---------- one decoration ----------

interface Ripple {
  x: number;
  y: number;
  t: number;
}

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
  private ripples: Ripple[] = [];
  private fish = -1;
  private fishX = 0;
  private fishY = 0;
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
    if (this.pending && Math.abs(d.fx - this.pending.fx) < 0.002 && Math.abs(d.fy - this.pending.fy) < 0.002) this.pending = null;
  }

  update(dt: number, g: Game): void {
    if (this.pending && g.time > this.pending.until) this.pending = null;
    const pos = this.pending ?? this.d;
    const pa = g.layout.pasture;
    this.x = Math.round(pa.x + pos.fx * pa.w);
    this.y = Math.round(pa.y + pos.fy * pa.h);
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
        this.updatePond(dt, env.season, env.weather === "rain" || env.weather === "storm");
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

  private updatePond(dt: number, season: Season, raining: boolean): void {
    if (season === "winter") {
      this.fxTimer -= dt;
      if (this.fxTimer <= 0 && !reducedMotion) {
        this.fxTimer = 2 + Math.random() * 3;
        sparkle(this.x + (Math.random() * 24 - 12), this.y - 13 + (Math.random() * 8 - 4), 1, 2, "#ffffff");
      }
      return;
    }
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]!;
      r.t += dt;
      if (r.t >= 1.3) this.ripples.splice(i, 1);
    }
    this.fxTimer -= dt;
    if (this.fxTimer <= 0) {
      // Raindrops dimple the pond much more often.
      this.fxTimer = raining ? 0.15 + Math.random() * 0.25 : 1.1 + Math.random() * 1.8;
      const pond = getPond(season);
      for (let k = 0; k < 8; k++) {
        const x = 8 + Math.floor(Math.random() * (pond.w - 16));
        const y = 8 + Math.floor(Math.random() * (pond.h - 14));
        if (pond.mask[y * pond.w + x]) {
          this.ripples.push({ x, y, t: 0 });
          break;
        }
      }
    }
    // A fish jumps every so often.
    if (this.fish < 0) {
      if (Math.random() < dt / 25 && !reducedMotion) {
        this.fish = 0;
        this.fishX = 14 + Math.random() * 14;
        this.fishY = 12 + Math.random() * 4;
      }
    } else {
      this.fish += dt;
      if (this.fish > 0.7) {
        this.ripples.push({ x: Math.round(this.fishX + 6), y: Math.round(this.fishY), t: 0 });
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
        drawArt(ctx, this.honey && season !== "winter" ? "world.beehouse.honey" : key, x, y, season, { anchor: "feet" });
        this.drawBees(ctx, x, y, g);
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
    const pond = getPond(season);
    const left = Math.round(x - pond.w / 2);
    const top = Math.round(y - pond.h);
    ctx.drawImage(pond.water, left, top);
    if (season !== "winter") {
      // Glints drifting on the water.
      ctx.fillStyle = "#9fd2f6";
      for (let i = 0; i < 3; i++) {
        const gx = Math.round(10 + ((this.t * (3 + i) + i * 9) % 22));
        const gy = 9 + i * 3;
        if (pond.mask[gy * pond.w + gx] && pond.mask[gy * pond.w + gx + 1]) ctx.fillRect(left + gx, top + gy, 2, 1);
      }
      // Ripple rings.
      ctx.fillStyle = "#b8e2ff";
      for (const r of this.ripples) {
        const rad = 1 + r.t * 4.5;
        ctx.globalAlpha = Math.max(0, 1 - r.t / 1.3);
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          const px = Math.round(r.x + Math.cos(ang) * rad);
          const py = Math.round(r.y + Math.sin(ang) * rad * 0.5);
          if (px >= 0 && py >= 0 && px < pond.w && py < pond.h && pond.mask[py * pond.w + px]) ctx.fillRect(left + px, top + py, 1, 1);
        }
      }
      ctx.globalAlpha = 1;
      const pad = lilyPads[Math.floor(this.t * 1.5) % Math.max(1, lilyPads.length)];
      if (pad) ctx.drawImage(pad, left + 7, top + 3);
      if (miniPad) ctx.drawImage(miniPad, left + pond.w - 16, top + pond.h - 11);
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

  private drawBees(ctx: CanvasRenderingContext2D, x: number, y: number, g: Game): void {
    const env = g.env;
    if (env.season === "winter" || env.isNight || env.weather === "rain" || env.weather === "storm" || env.weather === "snow") return;
    // Bees come and go in little bursts.
    if (Math.sin(this.t * 0.35 + this.d.fx * 10) < -0.1) return;
    for (let i = 0; i < 2; i++) {
      const a = this.t * (1.6 + i * 0.5) + i * 2.4;
      const bx = Math.round(x + Math.cos(a) * (9 + i * 3) + Math.sin(a * 2.3) * 2);
      const by = Math.round(y - 22 + Math.sin(a) * 5 - i * 3);
      draw(ctx, Math.floor(this.t * 18 + i) % 2 ? "world.bee.1" : "world.bee.0", bx - 2, by - 1);
    }
  }

  hit(wx: number, wy: number): boolean {
    if (this.hidden || placement) return false;
    const s = decorSize(this.d.kind);
    // A comfy thumb-sized target even for little things like the gnome.
    const w = Math.max(22, s.w + 4);
    const h = Math.max(22, s.h);
    return wx >= this.x - w / 2 && wx <= this.x + w / 2 && wy >= this.y - h && wy <= this.y + 4;
  }

  onTap(): void {
    this.wiggle = 0.25;
    openMenu("decor", this.d.id);
  }
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
    g.remove(e);
    entities.delete(id);
  }
  if (state) synced = true;
}

export function initDecor(g: Game): void {
  game = g;
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
  // Above the night overlay (sky = 100): the ghost is UI and should always be easy to see.
  safePass(g, 104, "placement ghost", (ctx) => drawGhost(ctx));
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

function validSpot(g: Game, x: number, y: number, movingId: string | null): boolean {
  const l = g.layout;
  if (!contains(l.pasture, x, y)) return false;
  if (l.blocked.some((r) => contains(inflate(r, 2), x, y))) return false;
  for (const e of entities.values()) {
    if (e.d.id === movingId || e.hidden) continue;
    if (Math.abs(e.x - x) < 10 && Math.abs(e.y - y) < 7) return false;
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
    const art = spriteCanvas(has(key) ? key : "world.crate");
    const good = tinted(null, art, "#7dff8a", 0.35);
    const bad = tinted(null, art, "#ff4a4a", 0.5);
    const l = g.layout;
    let start = { x: l.pasture.x + l.pasture.w / 2, y: l.pasture.y + l.pasture.h / 2 };
    if (movingId) {
      const e = entities.get(movingId);
      if (e) {
        start = { x: e.x, y: e.y };
        e.hidden = true;
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
      valid: validSpot(g, start.x, start.y, movingId),
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
      p.x = wx;
      p.y = wy;
      p.valid = validSpot(g, wx, wy, movingId);
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
        if (e) e.pending = { fx: f.fx, fy: f.fy, until: g.time + 6 };
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
  }
  p.resolve(result);
}
