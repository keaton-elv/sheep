// The piece of string from the chest (his favorite toy), out in the yard for a minute: a little red
// squiggle that twitches back and forth as if someone just out of sight is tugging it. Snickers
// pounces on it a few times (it whips out from under his paws every time), then loafs on top of it
// for a good while (the frayed tip peeking out from under his fluff, twitching now and then). When
// he gets up it lies there a moment longer, then whoever's on the other end yanks it away.
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
/** Columns of it that peek out from under him. */
const TIP = 5;

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
  /** Its bottom row: the ground line of a cat lying with his feet on the same row. */
  private readonly ground: number;
  private t = Math.random() * 6;
  /** How hard it's being tugged (0..1): it eases back in after he's been lying on it. */
  private tug = 1;
  /** A skitter (after a pounce, or the last yank): from, time left, how long it takes. */
  private skFrom = 0;
  private skLeft = 0;
  private skDur = 0.12;
  /** Yanked away for good: gone once the skitter's done. */
  private yanked = false;

  /** (x, feet) is where the strand lies: drawn just in front of a cat with his feet on the same row. */
  constructor(x: number, feet: number) {
    this.baseX = x;
    this.x = x;
    this.y = feet + 0.6;
    this.ground = feet - 1;
  }

  /** Where a pouncing cat should land (it keeps twitching, so aim for where it is right now). */
  get at(): number {
    return Math.round(this.x);
  }

  /** It whips out from under his paws, over to `to`. */
  skitterTo(to: number, dur = 0.12): void {
    this.skFrom = this.x;
    this.baseX = to;
    this.skDur = dur;
    this.skLeft = dur;
  }

  /** Lying under him (feet at catX), the tip out on `side`. */
  tuck(catX: number, side: -1 | 1): void {
    this.tucked = side;
    this.catX = catX;
    this.baseX = catX + side;
    this.x = this.baseX;
    this.tug = 0;
    this.skLeft = 0;
  }

  /** The last tug: off it goes, `by` px, and it's gone. */
  yank(by: number): void {
    this.tucked = 0;
    this.yanked = true;
    this.skitterTo(this.x + by, 0.2);
  }

  update(dt: number): void {
    this.t += dt;
    if (!this.tucked && this.tug < 1) this.tug = Math.min(1, this.tug + dt / 1.2);
    // Being tugged: a slow drag back and forth (holding still while he's on it).
    const to = this.tucked ? this.baseX : this.baseX + Math.sin(this.t * 1.4) * 3 * this.tug;
    if (this.skLeft > 0) {
      this.skLeft = Math.max(0, this.skLeft - dt);
      const k = 1 - this.skLeft / this.skDur;
      this.x = this.skFrom + (to - this.skFrom) * k;
      if (this.skLeft === 0 && this.yanked) this.dead = true;
      return;
    }
    this.x = to;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Under him, the tip just twitches now and then; out in the open it never stops.
    const still = this.tucked && this.t % 3.4 > 0.5;
    const f = frames()[still ? 0 : Math.floor(this.t / WIGGLE) % 2]!;
    const top = this.ground - H + 1;
    if (this.tucked) {
      // Just the frayed end (its last few px and their outline), out from under his side.
      const sx = W - TIP;
      const edge = this.tucked > 0 ? Math.round(this.catX) + 11 : Math.round(this.catX) - 11;
      if (this.tucked > 0) ctx.drawImage(f, sx, 0, TIP, H, edge, top, TIP, H);
      else {
        ctx.save();
        ctx.translate(edge + 1, top);
        ctx.scale(-1, 1);
        ctx.drawImage(f, sx, 0, TIP, H, 0, 0, TIP, H);
        ctx.restore();
      }
      return;
    }
    const lift = this.skLeft > 0 ? 1 : 0;
    ctx.drawImage(f, Math.round(this.x) - W / 2, top - lift);
  }
}
