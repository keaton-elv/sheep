// The ground under everything: ONE cached canvas per (layout size, season) with Stardew grass,
// the dirt yard & paths, and sprinkled rocks/flowers; plus grass tufts that sway in the wind.

import type { Season } from "../../shared/calendar";
import type { Game } from "../engine/game";
import { inflate, type Layout, type Point, type Rect } from "./layout";
import { GROUND_ATLAS, groundPixels, groundShapes, hash2 } from "./world-pixels";
import { barnRect, cut, ctx2d, makeCanvasEl, outdoorsSheet, sheetPx } from "./world-sheets";

/**
 * Where the farm sign actually stands. In landscape the layout puts it right in the gate opening
 * (sheep would walk through its post), so it steps down to stand beside the fence below the gap.
 */
export function signSpot(l: Layout): Point {
  const s = l.sign;
  const g = l.gate;
  if (g.side === "left") {
    const half = g.w / 2;
    const inGap = Math.abs(s.x - g.x) < 14 && s.y > g.y - half - 4 && s.y - 32 < g.y + half;
    if (inGap) return { x: g.x - 11, y: Math.min(l.h - 6, Math.round(g.y + half + 22)) };
  } else {
    const half = g.w / 2;
    const inGap = Math.abs(s.y - g.y) < 8 && Math.abs(s.x - g.x) < half + 8;
    if (inGap) return { x: Math.round(g.x + half + 12), y: s.y };
  }
  return s;
}

/** Rects (in world px) where things should not sprout: barn, machines, sign, HUD, fence lines. */
export function busyAreas(l: Layout): Rect[] {
  const r: Rect[] = [inflate(barnRect(l), 2), l.hudClock, l.hudToolbar];
  for (const p of [l.loom, l.chest, l.mailbox, signSpot(l)]) r.push({ x: p.x - 10, y: p.y - 34, w: 20, h: 38 });
  r.push({ x: l.billboard.x - 17, y: l.billboard.y - 32, w: 34, h: 36 });
  // Fence runs (the posts stick up ~27px above their feet line).
  const f = l.fence;
  r.push({ x: f.x - 8, y: f.y - 28, w: f.w + 16, h: 32 });
  r.push({ x: f.x - 8, y: f.y + f.h - 28, w: f.w + 16, h: 32 });
  r.push({ x: f.x - 7, y: f.y - 4, w: 14, h: f.h + 6 });
  r.push({ x: f.x + f.w - 7, y: f.y - 4, w: 14, h: f.h + 6 });
  return r;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

interface Tuft {
  x: number;
  y: number;
  variant: number;
  phase: number;
}

/** grass.png rows (20px tall, 3 variants of 15px) per season. */
const TUFT_ROWS: Record<Season, number[]> = { spring: [0], summer: [20], fall: [40], winter: [80] };

export class Ground {
  canvas: HTMLCanvasElement | null = null;
  private dirt: Uint8Array | null = null;
  private dw = 0;
  private dh = 0;
  private key = "";
  private tufts: Tuft[] = [];
  /** Tuft art: [variant] -> { top, bottom } halves so the tips can sway. */
  private tuftArt: { top: HTMLCanvasElement; bottom: HTMLCanvasElement; whole: HTMLCanvasElement }[] = [];
  private tuftSeason: Season | null = null;
  readonly seed = 0x5eed;

  /** Rebuild if the layout size or season changed. Returns true when rebuilt. */
  build(g: Game, force = false): boolean {
    const l = g.layout;
    const season = g.env.season;
    const key = `${l.w}x${l.h}:${season}`;
    if (!force && key === this.key && this.canvas) return false;
    this.key = key;
    const atlas = sheetPx(outdoorsSheet(season), GROUND_ATLAS.x, GROUND_ATLAS.y, GROUND_ATLAS.w, GROUND_ATLAS.h);
    const out = groundPixels({ w: l.w, h: l.h, season, seed: this.seed, atlas, shapes: groundShapes(l), avoid: busyAreas(l) });
    const c = this.canvas && this.canvas.width === l.w && this.canvas.height === l.h ? this.canvas : makeCanvasEl(l.w, l.h);
    const ctx = ctx2d(c);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(out.px.data), l.w, l.h), 0, 0);
    // A soft shadow along the barn's base.
    const b = barnRect(l);
    ctx.fillStyle = "rgba(40,20,60,0.22)";
    ctx.fillRect(b.x + 3, b.y + b.h, b.w - 6, 2);
    ctx.fillRect(b.x + 6, b.y + b.h + 2, b.w - 12, 1);
    this.canvas = c;
    this.dirt = out.dirt;
    this.dw = l.w;
    this.dh = l.h;
    this.buildTufts(l, season);
    return true;
  }

  isDirt(x: number, y: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (!this.dirt || xi < 0 || yi < 0 || xi >= this.dw || yi >= this.dh) return false;
    return this.dirt[yi * this.dw + xi] === 1;
  }

  private buildTuftArt(season: Season): void {
    if (this.tuftSeason === season) return;
    this.tuftSeason = season;
    this.tuftArt = [];
    for (const row of TUFT_ROWS[season]) {
      for (let v = 0; v < 3; v++) {
        const whole = cut("grass", v * 15, row, 15, 20);
        if (!whole) continue;
        const top = makeCanvasEl(15, 12);
        ctx2d(top).drawImage(whole, 0, 0, 15, 12, 0, 0, 15, 12);
        const bottom = makeCanvasEl(15, 8);
        ctx2d(bottom).drawImage(whole, 0, 12, 15, 8, 0, 0, 15, 8);
        this.tuftArt.push({ top, bottom, whole });
      }
    }
  }

  private buildTufts(l: Layout, season: Season): void {
    this.buildTuftArt(season);
    this.tufts = [];
    if (!this.tuftArt.length) return;
    const busy = busyAreas(l);
    const target = Math.round((l.w * l.h) / 3400);
    for (let k = 0, tries = 0; this.tufts.length < target && tries < target * 20; k++, tries++) {
      const x = Math.floor(hash2(k, 11, this.seed) * l.w);
      const y = Math.floor(8 + hash2(k, 12, this.seed) * (l.h - 8));
      const r = { x: x - 7, y: y - 16, w: 14, h: 16 };
      if (busy.some((b) => overlaps(r, b))) continue;
      if (this.isDirt(x, y) || this.isDirt(x - 5, y) || this.isDirt(x + 5, y)) continue;
      if (this.tufts.some((t) => Math.abs(t.x - x) < 10 && Math.abs(t.y - y) < 8)) continue;
      this.tufts.push({ x, y, variant: Math.floor(hash2(k, 13, this.seed) * this.tuftArt.length), phase: hash2(k, 14, this.seed) * Math.PI * 2 });
    }
    this.tufts.sort((a, b) => a.y - b.y);
  }

  drawGround(ctx: CanvasRenderingContext2D): void {
    if (this.canvas) ctx.drawImage(this.canvas, 0, 0);
  }

  drawTufts(ctx: CanvasRenderingContext2D, g: Game): void {
    if (!this.tufts.length || !this.tuftArt.length) return;
    const w = g.env.weather;
    const amp = w === "windy" || w === "storm" ? 1.6 : w === "rain" ? 0.8 : 0;
    const t = g.time;
    for (const tf of this.tufts) {
      const a = this.tuftArt[tf.variant] ?? this.tuftArt[0]!;
      const x = tf.x - 7;
      const y = tf.y - 20;
      if (!amp) {
        ctx.drawImage(a.whole, x, y);
        continue;
      }
      // Gusts roll across the farm from left to right.
      const sway = Math.round((Math.sin(t * 2.6 + tf.phase + tf.x * 0.03) * 0.5 + 0.5) * amp);
      ctx.drawImage(a.bottom, x, y + 12);
      ctx.drawImage(a.top, x + sway, y);
    }
  }
}
