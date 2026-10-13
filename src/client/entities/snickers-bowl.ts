// Snickers' Fancy Feast dish by the barn doorstep: a tiny footed crystal dish (the fancy kind, as
// seen in the ads, eaten from by cats who look exactly like him). It holds salmon pâté (every meal,
// if he had his way) or a few Whisker Lickins.
//
// Tap it: an empty dish gets filled, a full one gets a joke, and either way he comes running.
// Hand-drawn below; one character = one pixel, "." is transparent, outlines are drawn by hand.

import type { Entity, Game } from "../engine/game";
import { registerArt } from "../engine/sprites";

export type Food = "salmon" | "treats";

const PAL: Record<string, string> = {
  // crystal
  o: "#3e3a5c",
  G: "#d6ecfa",
  g: "#a3c4e2",
  d: "#7493bb",
  n: "#8fb0d4",
  "*": "#ffffff",
  // salmon pâté
  Z: "#8a3a36",
  S: "#ffb391",
  s: "#f0866a",
  z: "#cc604e",
  // Whisker Lickins
  M: "#5a2e1a",
  K: "#d39a5c",
  k: "#9a5d32",
  m: "#70391f",
};

const SALMON = [
  "....ZZZZ....",
  "..ZZSSSsZZ..",
  ".oZSSssszZo.",
  "o*GsszzzzdGo",
  "oGggggggddGo",
  ".oGgggggddo.",
  "..ooGgddoo..",
  "....oGdo....",
  "...oGgddo...",
  "...oooooo...",
];
const TREATS = [
  "............",
  "...MM.MM.M..",
  ".oMKkMKkMKo.",
  "o*KkmKkmKmGo",
  "oGggggggddGo",
  ".oGgggggddo.",
  "..ooGgddoo..",
  "....oGdo....",
  "...oGgddo...",
  "...oooooo...",
];
const EMPTY = [
  "............",
  "............",
  ".oooooooooo.",
  "o*GnnnnnngGo",
  "oGggggggddGo",
  ".oGgggggddo.",
  "..ooGgddoo..",
  "....oGdo....",
  "...oGgddo...",
  "...oooooo...",
];

/** The dish's size; its feet (bottom row) sit on the entity's y, centered on x. */
export const DISH_W = 12;
export const DISH_H = 10;
/** Rows from the top of the dish down to the glass rim (where a dipped head meets it). */
export const DISH_RIM = 3;

interface BowlArt {
  salmon: HTMLCanvasElement;
  treats: HTMLCanvasElement;
  empty: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
}

function rowsCanvas(rows: readonly string[]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, ...rows.map((r) => r.length));
  c.height = Math.max(1, rows.length);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = PAL[row[x]!];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

/** Soft lavender ground shadow under the dish's foot. */
function shadowCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "rgba(40,20,60,0.25)";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2);
      const dy = (y + 0.5 - h / 2) / (h / 2);
      if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

let art: BowlArt | null = null;
function bowlArt(): BowlArt {
  art ??= {
    salmon: rowsCanvas(SALMON),
    treats: rowsCanvas(TREATS),
    empty: rowsCanvas(EMPTY),
    shadow: shadowCanvas(12, 3),
  };
  return art;
}

/** "snickers.bowl": the full dish, for toasts (centered in 16x16, like the other toast icons). */
export function registerBowlIcon(): void {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  c.getContext("2d")?.drawImage(bowlArt().salmon, (16 - DISH_W) / 2, 16 - DISH_H - 2);
  registerArt("snickers.bowl", c);
}

export interface BowlHooks {
  /** The dish was tapped. */
  tap(): void;
  /** Is (wx, wy) on Snickers, as drawn right now? (Then it's his tap, unless it's on the dish itself.) */
  onCat(wx: number, wy: number): boolean;
  /** His face is down in the dish (so the food on top is his face, as far as taps go). */
  eating(): boolean;
}

export class Bowl implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  /** Where the dish is, once the yard has room for one. */
  placed = false;
  full = true;
  food: Food = "salmon";
  /** A little hop when it's tapped. */
  private bump = 0;

  constructor(
    private readonly g: Game,
    private readonly hooks: BowlHooks,
  ) {}

  place(spot: { x: number; y: number } | null): void {
    if (!spot) {
      this.placed = false;
      return;
    }
    this.placed = true;
    this.x = spot.x;
    this.y = spot.y;
  }

  fill(food: Food): void {
    this.full = true;
    this.food = food;
  }

  empty(): void {
    this.full = false;
  }

  /** Top row of the dish (world y). */
  top(): number {
    return Math.round(this.y) - DISH_H + 1;
  }

  update(dt: number): void {
    if (this.bump > 0) this.bump = Math.max(0, this.bump - dt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.placed) return;
    const a = bowlArt();
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    ctx.drawImage(a.shadow, x - DISH_W / 2, y - 1);
    const dish = !this.full ? a.empty : this.food === "treats" ? a.treats : a.salmon;
    const hop = this.bump > 0.08 ? 1 : 0;
    ctx.drawImage(dish, x - DISH_W / 2, y - DISH_H + 1 - hop);
  }

  /** Is (wx, wy) on one of the dish's drawn pixels? */
  private onDish(wx: number, wy: number): boolean {
    const rows = !this.full ? EMPTY : this.food === "treats" ? TREATS : SALMON;
    const ch = rows[Math.floor(wy) - this.top()]?.[Math.floor(wx) - (Math.round(this.x) - DISH_W / 2)];
    return !!ch && ch !== ".";
  }

  hit(wx: number, wy: number): boolean {
    if (!this.placed) return false;
    const top = this.top();
    // Roomier than the dish for thumbs (it's tiny). Further down is free (whatever's in front of
    // it sorts first anyway); up and sideways stay tight, clear of the barn door and the sheep.
    const min = Math.ceil(40 / Math.max(0.5, this.g.cssScale || 1));
    const hw = Math.max(DISH_W / 2 + 2, Math.min(min / 2, 11));
    const cx = Math.round(this.x);
    if (wx < cx - hw || wx > cx + hw || wy < top - 2 || wy > this.y + 8) return false;
    // Snickers beside it, walking past, or crouched over it: where he's drawn, it's a tap on him
    // (pet / lick button). Only the dish's own glass and food are the dish, and with his face
    // down in it, the food on top is his face too.
    if (this.hooks.onCat(wx, wy) && (!this.onDish(wx, wy) || (wy < top + DISH_RIM && this.hooks.eating()))) return false;
    return true;
  }

  onTap(): void {
    this.bump = 0.16;
    this.hooks.tap();
  }
}
