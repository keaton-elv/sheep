// The little row of farm things: the loom, the wool chest, the mailbox, the town-style calendar
// billboard and the farm sign. Each is a tappable, y-sorted entity that opens its menu. Their little
// cues (cloth ready, new mail, plans today) draw in a pass above the night overlay so they read at night.

import { dayKey } from "../../shared/calendar";
import { LOOM_WOOL_COST } from "../../shared/types";
import type { Entity, Game } from "../engine/game";
import { draw, has, spriteCanvas } from "../engine/sprites";
import { serverNow, store } from "../net";
import { openMenu } from "../ui/dom";
import { onMailChange, unreadMailCount } from "../ui/mailbox";
import type { Point } from "./layout";
import { BUBBLE_ITEM } from "./world-artdata";
import { drawArt } from "./world-art";
import { fx, reducedMotion, sparkle } from "./world-fx";
import { safePass } from "./world-safe";
import { signFeet } from "./world-zones";

/** Above the sky's night overlay (100): the cues are UI and must stay readable at night. */
const CUE_PASS = 114;

type Pick = (l: Game["layout"]) => Point;

/** Shared bits: position from the layout, a squash-bounce when tapped, a rect hit box. */
abstract class FarmThing implements Entity {
  x = 0;
  /** Sort key (usually the feet). */
  y = 0;
  /** Where the feet actually are (drawing & hit-testing use this). */
  protected fy = 0;
  layer = 1;
  protected bounce = 0;
  protected t = Math.random() * 10;
  /** Minimum tap width in game px. */
  protected minW = 28;
  constructor(
    protected g: Game,
    private pick: Pick,
    /** Hit box relative to the feet: [left, top, width, height]. */
    private box: [number, number, number, number],
  ) {
    const p = pick(g.layout);
    this.x = p.x;
    this.y = this.fy = p.y;
  }
  /** Sort key for a feet position (override to sort in front of something). */
  protected sortY(feetY: number, _g: Game): number {
    return feetY;
  }
  update(dt: number, g: Game): void {
    const p = this.pick(g.layout);
    this.x = p.x;
    this.fy = p.y;
    this.y = this.sortY(p.y, g);
    this.t += dt;
    if (this.bounce > 0) this.bounce = Math.max(0, this.bounce - dt);
    this.tick(dt, g);
  }
  protected tick(_dt: number, _g: Game): void {}
  /** Vertical squash offset while bouncing (in px, <= 0). */
  protected hop(): number {
    return this.bounce > 0 ? -Math.round(Math.sin((this.bounce / 0.22) * Math.PI) * 2) : 0;
  }
  abstract draw(ctx: CanvasRenderingContext2D, g: Game): void;
  /** A cue floating above the thing (drawn in the CUE_PASS, not with the entity). */
  cue(_ctx: CanvasRenderingContext2D, _g: Game): void {}
  /**
   * Top y for a bouncing cue `w` px wide resting at `restY` (hopping up by `bounce`, at most
   * `maxBounce`). In portrait the mailbox and billboard stand just under the DOM clock, which would
   * hide their cues, so there the cue rests a little lower, tucked under the clock's bottom edge.
   */
  protected cueY(g: Game, left: number, w: number, restY: number, bounce: number, maxBounce: number): number {
    const c = g.layout.hudClock;
    const underClock = left < c.x + c.w && left + w > c.x && restY - maxBounce < c.y + c.h + 1;
    const rest = underClock ? Math.max(restY, c.y + c.h + 1 + maxBounce) : restY;
    return Math.round(rest - bounce);
  }
  hit(wx: number, wy: number): boolean {
    const [l, t, w, h] = this.box;
    // Generous on phones: at least ~28 game px wide (~40 CSS px at the usual 1.33-1.5 CSS px per
    // game px), a little extra below the feet for thumbs. Neighbours stay ~30+ px apart.
    const padX = Math.max(3, (this.minW - w) / 2);
    const padTop = 3 + Math.max(0, 30 - h - 9);
    return wx >= this.x + l - padX && wx <= this.x + l + w + padX && wy >= this.fy + t - padTop && wy <= this.fy + t + h + 6;
  }
  onTap(): void {
    this.bounce = 0.22;
    this.tapped();
  }
  protected abstract tapped(): void;
}

// ---------- the loom ----------

export class Loom extends FarmThing {
  private fluffTimer = 0;
  private cloth: HTMLCanvasElement | null = null;
  constructor(g: Game) {
    super(g, (l) => l.loom, [-8, -25, 16, 25]);
  }
  private state(): "idle" | "working" | "ready" {
    const lm = store.state?.loom;
    if (!lm) return "idle";
    return serverNow() >= lm.readyAt ? "ready" : "working";
  }
  protected override tick(dt: number): void {
    if (this.state() !== "working" || reducedMotion) return;
    // Little wisps of wool fluff drift off the spinning wheel.
    this.fluffTimer -= dt;
    if (this.fluffTimer <= 0) {
      this.fluffTimer = 0.5 + Math.random() * 0.6;
      fx.spawn({ x: this.x + (Math.random() * 8 - 4), y: this.fy - 18, vx: (Math.random() - 0.5) * 6, vy: -9, flutter: 7, life: 1.4, color: "#fffaf0" });
    }
  }
  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const s = this.state();
    const season = g.env.season;
    let dy = this.hop();
    // While weaving the loom rocks a little (clack, clack).
    if (s === "working") dy += Math.floor(this.t * 6) % 2 === 0 ? 0 : -1;
    drawArt(ctx, s === "idle" ? "world.loom.0" : "world.loom.1", this.x - 8, this.fy - 32 + dy, season);
  }
  override cue(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.state() === "ready") this.drawBubble(ctx, g, this.x, this.fy - 26);
  }
  /** Stardew's "it's ready!" bubble with a bolt of cloth, bobbing. */
  private drawBubble(ctx: CanvasRenderingContext2D, g: Game, x: number, top: number): void {
    const bob = Math.round(Math.sin(this.t * 3) * 1.5);
    const bx = Math.round(x - 10);
    const by = this.cueY(g, bx, 20, top - 20, 2 - bob, 4);
    draw(ctx, "world.bubble", bx, by);
    if (has("item.cloth")) {
      this.cloth ??= spriteCanvas("item.cloth");
      ctx.drawImage(this.cloth, bx + BUBBLE_ITEM.x, by + BUBBLE_ITEM.y);
    }
  }
  override hit(wx: number, wy: number): boolean {
    if (super.hit(wx, wy)) return true;
    // The bubble is tappable too.
    return this.state() === "ready" && Math.abs(wx - this.x) <= 11 && wy >= this.fy - 50 && wy <= this.fy - 24;
  }
  protected tapped(): void {
    openMenu("loom");
  }
}

// ---------- the chest ----------

const LID_SEQ = [0, 1, 2, 3, 4, 4, 4, 4, 3, 2, 1, 0];

export class Chest extends FarmThing {
  private lidT = -1;
  private sparkTimer = 3;
  constructor(g: Game) {
    super(g, (l) => l.chest, [-8, -22, 16, 22]);
  }
  protected override tick(dt: number): void {
    if (this.lidT >= 0) {
      this.lidT += dt;
      if (this.lidT > LID_SEQ.length * 0.05) this.lidT = -1;
    }
    // Enough wool for the loom? The chest twinkles a little hint.
    const wool = store.state?.wool ?? 0;
    if (wool >= LOOM_WOOL_COST && !reducedMotion) {
      this.sparkTimer -= dt;
      if (this.sparkTimer <= 0) {
        this.sparkTimer = 2.5 + Math.random() * 3;
        sparkle(this.x + 4, this.fy - 18, 1, 5, "#ffffff");
      }
    }
  }
  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const season = g.env.season;
    const dy = this.hop();
    const x = this.x - 8;
    const y = this.fy - 32 + dy;
    drawArt(ctx, "world.chest", x, y, season);
    const frame = this.lidT >= 0 ? (LID_SEQ[Math.min(LID_SEQ.length - 1, Math.floor(this.lidT / 0.05))] ?? 0) : 0;
    if (has(`world.chest.lid.${frame}`)) drawArt(ctx, `world.chest.lid.${frame}`, x, y, season);
    // A tuft of wool peeking out from under the lid when there's wool inside.
    if (frame === 0 && (store.state?.wool ?? 0) > 0) {
      ctx.fillStyle = "#6b4a2f";
      ctx.fillRect(x + 9, y + 20, 4, 1);
      ctx.fillStyle = "#fff7e3";
      ctx.fillRect(x + 9, y + 19, 3, 1);
      ctx.fillRect(x + 10, y + 18, 2, 1);
      ctx.fillStyle = "#e8dcc2";
      ctx.fillRect(x + 12, y + 19, 1, 1);
    }
  }
  protected tapped(): void {
    this.lidT = 0;
    openMenu("chest");
  }
}

// ---------- the mailbox ----------

export class Mailbox extends FarmThing {
  private unread = 0;
  private wiggle = 0;
  constructor(g: Game) {
    super(g, (l) => l.mailbox, [-8, -22, 16, 22]);
    this.unread = unreadMailCount();
    onMailChange((n) => {
      if (n > this.unread) this.wiggle = 0.4;
      this.unread = n;
    });
  }
  protected override tick(dt: number): void {
    if (this.wiggle > 0) this.wiggle = Math.max(0, this.wiggle - dt);
  }
  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const season = g.env.season;
    const dy = this.hop();
    const shake = this.wiggle > 0 ? Math.round(Math.sin(this.wiggle * 45) * 1.2) : 0;
    const hasMail = this.unread > 0;
    drawArt(ctx, hasMail ? "world.mailbox.1" : "world.mailbox.0", this.x - 8 + shake, this.fy - 24 + dy, season);
  }
  override cue(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.unread <= 0) return;
    // Stardew's bouncing letter.
    const bounce = Math.round(Math.abs(Math.sin(this.t * 3.2)) * 4);
    const x = Math.round(this.x - 6);
    draw(ctx, "world.letter", x, this.cueY(g, x, 13, this.fy - 36, bounce, 4));
  }
  override hit(wx: number, wy: number): boolean {
    if (super.hit(wx, wy)) return true;
    return this.unread > 0 && Math.abs(wx - this.x) <= 8 && wy >= this.fy - 42 && wy <= this.fy - 22;
  }
  protected tapped(): void {
    openMenu("mailbox");
  }
}

// ---------- the calendar billboard ----------

export class Billboard extends FarmThing {
  private plansToday = 0;
  private check = 0;
  constructor(g: Game) {
    super(g, (l) => l.billboard, [-15, -30, 30, 30]);
  }
  protected override tick(dt: number, g: Game): void {
    this.check -= dt;
    if (this.check > 0) return;
    this.check = 2;
    const today = dayKey(g.env.now);
    this.plansToday = store.state ? store.state.sheep.filter((s) => s.date === today && s.shearedAt === null).length : 0;
  }
  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const dy = this.hop();
    drawArt(ctx, "world.billboard", this.x - 15, this.fy - 30 + dy, g.env.season);
  }
  override cue(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.plansToday <= 0) return;
    // Something's planned for today! A bouncing "!" like a new quest on the town board.
    const b = Math.round(Math.abs(Math.sin(this.t * 3)) * 3);
    const x = Math.round(this.x - 2);
    draw(ctx, "world.bang", x, this.cueY(g, x, 5, this.fy - 42, b, 3));
  }
  protected tapped(): void {
    openMenu("calendar");
  }
}

// ---------- the farm sign ----------

export class FarmSign extends FarmThing {
  private wiggle = 0;
  /** Narrower: in portrait the sign stands right next to the loom. */
  protected override minW = 22;
  constructor(g: Game) {
    super(g, signFeet, [-8, -30, 16, 30]);
  }
  /** The sign stands right against the top fence: draw it in front of the rails so it reads. */
  protected override sortY(feetY: number, g: Game): number {
    const f = g.layout.fence;
    const onTopLine = Math.abs(feetY - f.y) < 6 && this.x >= f.x - 8 && this.x <= f.x + f.w + 8;
    return onTopLine ? f.y + 1 : feetY;
  }
  protected override tick(dt: number): void {
    if (this.wiggle > 0) this.wiggle = Math.max(0, this.wiggle - dt);
  }
  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const shake = this.wiggle > 0 ? Math.round(Math.sin(this.wiggle * 40) * this.wiggle * 3) : 0;
    drawArt(ctx, "world.sign", this.x - 8 + shake, this.fy - 32 + this.hop(), g.env.season);
  }
  protected tapped(): void {
    this.wiggle = 0.35;
    openMenu("farmSign");
  }
}

export function buildObjects(g: Game): Entity[] {
  const things: FarmThing[] = [new Loom(g), new Chest(g), new Mailbox(g), new Billboard(g), new FarmSign(g)];
  safePass(g, CUE_PASS, "object cues", (ctx, gg) => {
    for (const t of things) t.cue(ctx, gg);
  });
  return things;
}
