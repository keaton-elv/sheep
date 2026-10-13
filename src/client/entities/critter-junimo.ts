// Junimos! Rarely (more often once the farm has sheared 10+ wool), a few forest spirits
// bounce into the pasture, hop around, and vanish into the bushes in a puff of sparkles.

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw } from "../engine/sprites";
import { contains } from "../world/layout";
import { store } from "../net";
import { toast } from "../ui/dom";
import { JUNIMO_COLORS } from "./critter-art";
import { FENCE_HIDE } from "./critter-ambient";
import { critterReact } from "./critter-fox";
import { addSafe, chance, drawShadow, inBox, lsGet, lsSet, onTick, params, rand, sparkleBurst } from "./critter-util";
import { dayKey } from "../../shared/calendar";

const COLORS = Object.keys(JUNIMO_COLORS);
/** Never more than this many junimos bouncing around at once (Konami spam, etc.). */
const MAX_JUNIMOS = 6;
let live = 0;
const GLOW: Record<string, string> = {
  green: "rgba(150,240,120,0.55)",
  blue: "rgba(120,190,255,0.55)",
  purple: "rgba(200,150,255,0.55)",
  yellow: "rgba(255,230,120,0.55)",
  red: "rgba(255,140,140,0.55)",
  orange: "rgba(255,180,110,0.55)",
};

class Junimo implements Entity {
  x: number;
  y: number;
  layer = 1;
  dead = false;
  private color: string;
  private keys: [string, string, string];
  private t = 0;
  private life = rand(12, 20);
  private hopT = -rand(0.1, 0.6);
  private hopDur = 0.42;
  private fx = 0;
  private fy = 0;
  private tx = 0;
  private ty = 0;
  private z = 0;
  private leaving = false;
  private spinT = -1;
  private alpha = 0;

  constructor(
    private g: Game,
    x: number,
    y: number,
    color?: string,
  ) {
    this.x = x;
    this.y = y;
    this.color = color ?? COLORS[Math.floor(Math.random() * COLORS.length)]!;
    this.keys = [`junimo.${this.color}.0`, `junimo.${this.color}.1`, `junimo.${this.color}.2`];
    this.pickHop();
  }

  private pickHop(): void {
    const l = this.g.layout;
    const p = l.pasture;
    this.fx = this.x;
    this.fy = this.y;
    if (this.leaving) {
      // Off into the bushes beyond the nearest fence.
      const toLeft = this.x - p.x < p.x + p.w - this.x;
      this.tx = this.x + (toLeft ? -12 : 12);
      this.ty = this.y + rand(-4, 4);
    } else {
      const a = Math.random() * Math.PI * 2;
      const d = rand(8, 15);
      this.tx = Math.max(p.x + 6, Math.min(p.x + p.w - 6, this.x + Math.cos(a) * d));
      this.ty = Math.max(p.y + 6, Math.min(p.y + p.h - FENCE_HIDE, this.y + Math.sin(a) * d * 0.7));
      for (const b of l.blocked) {
        if (contains(b, this.tx, this.ty)) {
          this.tx = this.x - (this.tx - this.x);
          this.ty = this.y - (this.ty - this.y);
          break;
        }
      }
    }
    this.hopDur = rand(0.36, 0.5);
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.life -= dt;
    this.alpha = Math.min(1, this.alpha + dt * 3);
    if (this.spinT >= 0) {
      this.spinT += dt;
      this.z += dt * 18;
      if (this.spinT > 0.55) this.poof(true);
      return;
    }
    if (this.life <= 0 && !this.leaving) this.leaving = true;
    const p = g.layout.pasture;
    if (this.leaving && (this.x < p.x - 4 || this.x > p.x + p.w + 4)) {
      this.poof(false);
      return;
    }
    this.hopT += dt;
    if (this.hopT < 0) {
      this.z = 0;
    } else {
      const k = Math.min(1, this.hopT / this.hopDur);
      this.x = this.fx + (this.tx - this.fx) * k;
      this.y = this.fy + (this.ty - this.fy) * k;
      this.z = Math.sin(Math.PI * k) * 7;
      if (k >= 1) {
        this.z = 0;
        this.hopT = -rand(0.08, this.leaving ? 0.15 : 0.7);
        this.pickHop();
      }
    }
    if (g.env.darkness > 0.3) g.addLight({ x: this.x, y: this.y - 5 - this.z, radius: 14, color: GLOW[this.color] ?? GLOW.green! });
  }

  private poof(tapped: boolean): void {
    if (this.dead) return;
    this.dead = true;
    live--;
    sparkleBurst(this.x, this.y - 6 - this.z, tapped ? 8 : 5, 16);
    if (!tapped) sfx("junimo", { volume: 0.35, pitch: 1.2 });
  }

  draw(ctx: CanvasRenderingContext2D): void {
    let f: 0 | 1 | 2 = 0;
    if (this.spinT >= 0) f = 2;
    else if (this.hopT < 0 && this.hopT > -0.1) f = 1; // squish on landing
    else if (this.z > 3) f = 2;
    const flip = this.spinT >= 0 ? Math.floor(this.spinT / 0.07) % 2 === 1 : this.tx < this.fx;
    const a = this.alpha * (this.spinT >= 0 ? Math.max(0, 1 - this.spinT / 0.55) : 1);
    drawShadow(ctx, this.x, this.y, 9, a);
    draw(ctx, this.keys[f], Math.round(this.x), Math.round(this.y - this.z), { anchor: "feet", flipX: flip, alpha: a });
  }

  hit(wx: number, wy: number): boolean {
    // A bit bigger than the junimo itself: they're tiny and they don't sit still.
    return this.spinT < 0 && inBox(wx, wy, this.x - 11, this.y - this.z - 18, 22, 21);
  }

  onTap(g: Game): void {
    if (this.spinT >= 0) return;
    this.spinT = 0;
    sfx("junimo");
    const today = dayKey(g.env.now);
    const first = lsGet("farm.junimoDay") !== today;
    if (first || chance(0.35)) {
      lsSet("farm.junimoDay", today);
      setTimeout(() => sfx("reward"), 350);
      toast("A Junimo! It left you a star.", { icon: "ui.star" });
    }
  }
}

function spawnGroup(g: Game): boolean {
  const l = g.layout;
  const p = l.pasture;
  const n = Math.min(1 + Math.floor(Math.random() * 3), MAX_JUNIMOS - live);
  if (n <= 0) return false;
  live += n; // counted now, so a second summon during the staggered entrance still sees them
  const fromLeft = chance(0.5);
  const y0 = p.y + (p.h - FENCE_HIDE) * rand(0.2, 0.8);
  for (let i = 0; i < n; i++) {
    const x = fromLeft ? p.x + 2 + i * 6 : p.x + p.w - 2 - i * 6;
    const y = y0 + rand(-8, 8);
    setTimeout(() => addSafe(g, new Junimo(g, x, y), "junimo"), i * 350);
  }
  setTimeout(() => sfx("junimo", { volume: 0.5 }), 200);
  setTimeout(() => critterReact("exclaim", fromLeft ? p.x : p.x + p.w), 1200);
  return true;
}

export function initJunimos(g: Game): void {
  // Five quick knocks on the critters' stump (critter-fox.ts) wakes them up.
  g.on("junimos", () => {
    if (spawnGroup(g)) toast("Something giggles in the bushes...", { icon: "junimo.green.0" });
  });
  let next = params.has("junimo") ? 2 : rand(60, 120);
  onTick(g, "junimos", (dt) => {
    next -= dt;
    if (next > 0) return;
    next = params.has("junimo") ? 30 : 40;
    const wool = store.state?.totalWool ?? 0;
    if (params.has("junimo") || chance(wool >= 10 ? 0.06 : 0.025)) spawnGroup(g);
  });
}

/** Easter-egg helper: summon a little parade right now. */
export function summonJunimos(g: Game): void {
  void spawnGroup(g);
}
