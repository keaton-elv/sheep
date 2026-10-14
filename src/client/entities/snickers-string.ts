// The piece of string from the chest (his favorite toy), out in the yard for a minute: a little red
// squiggle that twitches back and forth as if someone just out of sight is tugging it. Snickers
// pounces on it a few times, then loafs on top of it (the frayed tip peeking out from under his
// fluff). When he gets up, it's gone: he took it.
// Hand-drawn (Stardew has no string), in the chest's "item.string" colors. Not tappable.

import type { Entity } from "../engine/game";

const PAL: Record<string, string> = {
  o: "#6a1428",
  R: "#e0384f",
  r: "#a8203a",
  H: "#ff8da0",
};

/** Two wiggles of the same 10x4 squiggle (the frayed tip on the right). */
const FRAMES = [
  [".oo..oo...", "oRrooRroo.", ".ooRrooRHo", "...oo..oo."],
  ["...oo..oo.", ".ooRrooRHo", "oRrooRroo.", ".oo..oo..."],
];
const W = 10;
const H = 4;
const WIGGLE = 0.18;

let art: HTMLCanvasElement[] | null = null;
function frames(): HTMLCanvasElement[] {
  art ??= FRAMES.map((rows) => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = PAL[row[x]!];
        if (!color || !ctx) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
    return c;
  });
  return art;
}

export class StringToy implements Entity {
  x: number;
  y: number;
  layer = 1;
  dead = false;
  /** Where it lies (its center); it drags a few px either side of this. */
  baseX: number;
  /** Under Snickers: only the frayed tip peeks out, this side of him (feet at catX). 0 = all of it. */
  tucked: -1 | 0 | 1 = 0;
  catX = 0;
  private t = Math.random() * 6;
  /** A little skitter (after a pounce): from, to, time left. */
  private skFrom = 0;
  private skLeft = 0;

  /** (x, feet) is where the strand lies: drawn just in front of a cat standing on the same row. */
  constructor(x: number, feet: number) {
    this.baseX = x;
    this.x = x;
    this.y = feet + 0.6;
  }

  /** Where a pouncing cat should land (it keeps twitching, so aim for where it is right now). */
  get at(): number {
    return Math.round(this.x);
  }

  /** It whips out from under his paws, `by` px. */
  skitter(by: number): void {
    this.skFrom = this.x;
    this.baseX = this.x + by;
    this.skLeft = 0.12;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.skLeft > 0) {
      this.skLeft = Math.max(0, this.skLeft - dt);
      const k = 1 - this.skLeft / 0.12;
      this.x = this.skFrom + (this.baseX - this.skFrom) * k;
      return;
    }
    // Being tugged: a slow drag back and forth (holding still while he's on it).
    this.x = this.tucked ? this.baseX : this.baseX + Math.sin(this.t * 1.4) * 3;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const f = frames()[Math.floor(this.t / WIGGLE) % 2]!;
    const top = Math.round(this.y) - H + 1;
    if (this.tucked) {
      // Just the frayed end (3 columns: 2 px of string and its outline), out past his side.
      const sx = W - 3;
      const left = this.tucked > 0 ? Math.round(this.catX) + 11 : Math.round(this.catX) - 11;
      if (this.tucked > 0) ctx.drawImage(f, sx, 0, 3, H, left, top - 1, 3, H);
      else {
        ctx.save();
        ctx.translate(left + 1, top - 1);
        ctx.scale(-1, 1);
        ctx.drawImage(f, sx, 0, 3, H, 0, 0, 3, H);
        ctx.restore();
      }
      return;
    }
    const lift = this.skLeft > 0 ? 1 : 0;
    ctx.drawImage(f, Math.round(this.x) - W / 2, top - lift);
  }
}
