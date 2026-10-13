// The Deluxe Barn (where Stardew sheep live). Tap it to visit the retired, sheared sheep.
// Its animal door slides open whenever a sheep walks in or out, and its window glows at night.

import { sfx } from "../audio";
import type { Season } from "../../shared/calendar";
import type { Entity, Game } from "../engine/game";
import { spriteCanvas } from "../engine/sprites";
import { barnSheep } from "../net";
import { openMenu } from "../ui/dom";
import { fx, reducedMotion } from "./world-fx";
import { snowRoofPx, type Px } from "./world-pixels";
import { BARN, ctx2d, cut, makeCanvasEl, pxCanvas, sheetPx } from "./world-sheets";

const OPEN_TIME = 0.32;
const HOLD_TIME = 1.8;
const WINDOW_LIGHT = "rgba(255,196,110,0.9)";

interface BarnArt {
  body: HTMLCanvasElement;
  door: HTMLCanvasElement | null;
  glow: HTMLCanvasElement | null;
  /** The window panes, lit (drawn over the body at night). */
  lit: HTMLCanvasElement | null;
}

const artCache = new Map<string, BarnArt>();

function barnArt(season: Season): BarnArt {
  const key = season === "winter" ? "winter" : "default";
  const hit = artCache.get(key);
  if (hit) return hit;
  const raw = sheetPx(BARN.sheet, BARN.x, BARN.y, BARN.w, BARN.h);
  let a: BarnArt;
  if (raw) {
    const body: Px = season === "winter" ? snowRoofPx(raw, 80) : raw;
    a = {
      body: pxCanvas(body),
      door: cut(BARN.sheet, BARN.door.x, BARN.door.y, BARN.door.w, BARN.door.h),
      glow: cut(BARN.sheet, BARN.glow.x, BARN.glow.y, BARN.glow.w, BARN.glow.h),
      lit: litWindow(raw),
    };
  } else {
    a = { body: fallbackBarn(), door: null, glow: null, lit: null };
  }
  artCache.set(key, a);
  return a;
}

/** Copy the dark window-pane pixels as warm lamplight. */
function litWindow(raw: Px): HTMLCanvasElement {
  const w = BARN.window;
  const c = makeCanvasEl(w.w, w.h);
  const ctx = ctx2d(c);
  const dark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w.w || y >= w.h) return false;
    const i = ((w.y + y) * raw.width + (w.x + x)) * 4;
    const l = raw.data[i]! * 0.3 + raw.data[i + 1]! * 0.59 + raw.data[i + 2]! * 0.11;
    return raw.data[i + 3]! > 200 && l < 60;
  };
  for (let y = 0; y < w.h; y++) {
    for (let x = 0; x < w.w; x++) {
      if (!dark(x, y)) continue;
      const edge = !dark(x - 1, y) || !dark(x + 1, y) || !dark(x, y - 1) || !dark(x, y + 1);
      const top = !dark(x, y - 1) || !dark(x, y - 2);
      ctx.fillStyle = edge ? "#e8962e" : top ? "#ffe9a0" : "#ffd36b";
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/** A plain red barn, in case farm_buildings.png never shows up. */
function fallbackBarn(): HTMLCanvasElement {
  const c = makeCanvasEl(BARN.w, BARN.h);
  const ctx = ctx2d(c);
  ctx.fillStyle = "#3b1f12";
  ctx.fillRect(4, 40, 104, 72);
  ctx.fillStyle = "#b83a24";
  ctx.fillRect(6, 42, 100, 68);
  ctx.fillStyle = "#8a2a1a";
  for (let x = 10; x < 104; x += 8) ctx.fillRect(x, 42, 1, 68);
  ctx.fillStyle = "#3b1f12";
  ctx.beginPath();
  ctx.moveTo(0, 44);
  ctx.lineTo(56, 4);
  ctx.lineTo(112, 44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#7a6a5a";
  ctx.beginPath();
  ctx.moveTo(6, 42);
  ctx.lineTo(56, 8);
  ctx.lineTo(106, 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f4ead8";
  ctx.fillRect(BARN.hole.x - 2, BARN.hole.y - 2, BARN.hole.w + 4, 2);
  ctx.clearRect(BARN.hole.x, BARN.hole.y, BARN.hole.w, BARN.hole.h);
  return c;
}

export class Barn implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  private open = 0;
  private holdUntil = 0;
  private wiggle = 0;
  private zTimer = 2;
  private season: Season = "spring";
  private zed: HTMLCanvasElement | null = null;

  constructor(private g: Game) {
    g.on("barnDoor", () => this.knock());
  }

  /** A sheep is walking through the door: open up (and keep it open while they trickle through). */
  knock(): void {
    if (this.open < 0.05 && this.holdUntil < this.g.time) sfx("door");
    this.holdUntil = this.g.time + HOLD_TIME;
  }

  /** The barn sprite sits exactly in layout.barn (its doorway lines up with layout.barnDoor). */
  private box(l: Game["layout"]): { x: number; y: number; w: number; h: number } {
    return l.barn;
  }

  update(dt: number, g: Game): void {
    const b = this.box(g.layout);
    this.x = b.x + b.w / 2;
    this.y = b.y + b.h;
    this.season = g.env.season;
    const target = g.time < this.holdUntil ? 1 : 0;
    const step = dt / OPEN_TIME;
    this.open = target > this.open ? Math.min(1, this.open + step) : Math.max(0, this.open - step);
    if (this.wiggle > 0) this.wiggle = Math.max(0, this.wiggle - dt);

    const dark = g.env.darkness;
    if (dark > 0.08) g.addLight({ x: b.x + BARN.window.x + 9, y: b.y + BARN.window.y + 6, radius: 30, color: WINDOW_LIGHT });
    if (this.open > 0.3 && dark > 0.3) g.addLight({ x: b.x + BARN.hole.x + 16, y: b.y + BARN.hole.y + 14, radius: 18, color: WINDOW_LIGHT });

    // Sleepy z's drift out of the barn at night when somebody's home.
    if (g.env.isNight && !reducedMotion) {
      this.zTimer -= dt;
      if (this.zTimer <= 0) {
        this.zTimer = 2.4 + Math.random() * 2.5;
        if (barnSheep().length > 0) {
          this.zed ??= spriteCanvas("world.zed");
          fx.spawn({ kind: "sprite", img: this.zed, x: b.x + BARN.window.x + 14, y: b.y + BARN.window.y - 2, vx: 3, vy: -7, flutter: 5, life: 2.6, fade: 1 });
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const b = this.box(g.layout);
    const a = barnArt(this.season);
    const shake = this.wiggle > 0 ? Math.round(Math.sin(this.wiggle * 50) * this.wiggle * 4) : 0;
    const bx = Math.round(b.x + (b.w - a.body.width) / 2) + shake;
    const by = Math.round(b.y + b.h - a.body.height);
    const h = BARN.hole;
    // The animal door: dark interior, warm floor light when open, and the door sliding up.
    ctx.fillStyle = BARN.interior;
    ctx.fillRect(bx + h.x, by + h.y, h.w, h.h);
    if (a.glow && this.open > 0) {
      ctx.globalAlpha = this.open;
      ctx.drawImage(a.glow, 1, 0, h.w, a.glow.height, bx + h.x, by + h.y + h.h - a.glow.height, h.w, a.glow.height);
      ctx.globalAlpha = 1;
    }
    const lift = Math.round(this.open * (h.h - 2));
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx + h.x, by + h.y, h.w, h.h);
    ctx.clip();
    if (a.door) {
      ctx.drawImage(a.door, bx + h.x, by + h.y - lift);
      ctx.drawImage(a.door, bx + h.x, by + h.y + (h.h - a.door.height) - lift);
    } else {
      ctx.fillStyle = "#c27a2a";
      ctx.fillRect(bx + h.x, by + h.y - lift, h.w, h.h);
    }
    ctx.restore();
    ctx.drawImage(a.body, bx, by);
    const dark = g.env.darkness;
    if (a.lit && dark > 0.12) {
      ctx.globalAlpha = Math.min(1, (dark - 0.12) * 2.5);
      ctx.drawImage(a.lit, bx + BARN.window.x, by + BARN.window.y);
      ctx.globalAlpha = 1;
    }
  }

  hit(wx: number, wy: number): boolean {
    const b = this.box(this.g.layout);
    const lx = wx - b.x;
    const ly = wy - b.y;
    if (lx < 2 || lx > b.w - 2 || ly < 4 || ly > b.h) return false;
    // The roof's top corners are empty sky.
    if (ly < 40 && (lx < 20 - ly * 0.4 || lx > b.w - 20 + ly * 0.4)) return false;
    return true;
  }

  onTap(): void {
    this.wiggle = 0.25;
    // Somebody's home: a muffled "baa" from inside.
    if (barnSheep().length > 0) sfx("baa", { volume: 0.35, pitch: 0.85 });
    openMenu("barn");
  }
}
