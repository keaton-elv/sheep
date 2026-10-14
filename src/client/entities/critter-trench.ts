// The Trench Coat. Very rarely, deep in the night, a tall stranger in a trench coat and a fedora
// shuffles along the bottom fence, stops, glances left... right... and shuffles on. Something
// about it is off (a ringed tail under the hem? a tuft of spines? a faint buzzing?). Tap it and
// the coat collapses: it was a hundred raccoons, or a hundred hedgehogs, or ten thousand
// mosquitoes, all along. They scatter off-screen; the coat and hat are left in a heap.
//
// Emits g.emit("trenchcoat", insides) and sets localStorage farm.trenchcoat.lastSeen when revealed.
// Debug: ?trenchcoat=1 (or =raccoons / =hedgehogs / =mosquitoes)

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw, has, isReal } from "../engine/sprites";
import { toast } from "../ui/dom";
import { bigfootTonight } from "./critter-bigfoot";
import { critterReact, hangout } from "./critter-fox";
import { RACCOON_RUN } from "./critter-lore-art";
import { COAT_EYES } from "./critter-lore-sprites";
import { claimBottomLane, FENCE_HIDE, onLayoutChange } from "./critter-place";
import { addSafe, chance, dotPuff, drawShadow, inBox, lsSet, onTick, params, rand, reducedMotion, report } from "./critter-util";

export type Insides = "raccoons" | "hedgehogs" | "mosquitoes";
const INSIDES: Insides[] = ["raccoons", "hedgehogs", "mosquitoes"];

const REVEAL: Record<Insides, string> = {
  raccoons: "It was a hundred raccoons in a trench coat all along.",
  hedgehogs: "It was a hundred hedgehogs in a trench coat all along.",
  mosquitoes: "It was ten thousand mosquitoes in a trench coat all along.",
};

const MOONLIGHT = "rgba(170,186,255,0.32)";
const EYE = "#ffe066";

/** Whatever burst out of the coat, while it's still scattering. */
let crowds: Crowd[] = [];

// ---------- the coat ----------

interface Speck {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

class TrenchCoat implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  private px: number;
  private dir: 1 | -1 = 1;
  state: "walk" | "pause" | "pile" = "walk";
  private t = 0;
  private dur = 0;
  private anim = 0;
  private alpha = 0;
  private stops: number[];
  private turnAt: number;
  private blinkIn = rand(2, 4);
  private blink = 0;
  /** A mosquito or two sneaking out of the collar. */
  private escapes: Speck[] = [];
  private escapeIn = rand(1, 2.5);
  /** Where the eyes were drawn (for the glint above the night overlay). */
  eyes: { x: number; y: number; a: number } | null = null;

  constructor(
    private g: Game,
    readonly insides: Insides,
  ) {
    const p = g.layout.pasture;
    this.px = p.x + 2;
    const c = hangout(g.layout);
    this.turnAt = Math.max(p.x + 40, Math.min(c.x - 20, p.x + p.w - 24));
    this.stops = [p.x + (this.turnAt - p.x) * rand(0.35, 0.6)];
  }

  get standing(): boolean {
    return this.state !== "pile";
  }

  /** Eyes: -1 glancing left, 1 right, 0 ahead. */
  private get look(): number {
    if (this.state !== "pause") return 0;
    const k = this.t / this.dur;
    return k < 0.3 ? -1 : k < 0.62 ? 1 : 0;
  }

  update(dt: number, g: Game): void {
    this.t += dt;
    this.anim += dt;
    const p = g.layout.pasture;
    this.y = p.y + p.h - FENCE_HIDE;
    if (this.state === "pile") {
      if (this.t > 7) this.alpha -= dt / 1.5;
      if (this.alpha <= 0) this.dead = true;
      // The puff of the reveal lights up the night for a moment.
      if (this.t < 1 && g.env.darkness > 0.2) g.addLight({ x: this.px, y: this.y - 10, radius: 26 + 30 * (1 - this.t), color: "rgba(255,238,200,0.5)" });
      return;
    }
    const fading = this.dir < 0 && this.px < p.x + 12;
    this.alpha = fading ? Math.max(0, (this.px - p.x) / 12) : Math.min(1, this.alpha + dt);
    if (this.state === "walk") {
      this.px += this.dir * 6.5 * dt;
      if (this.dir > 0) {
        const stop = this.stops[0];
        if (stop !== undefined && this.px >= stop) {
          this.stops.shift();
          this.pause(rand(2.2, 3.2));
        } else if (this.px >= this.turnAt) this.pause(rand(2.2, 3));
      } else if (this.px <= p.x) this.dead = true;
    } else if (this.t > this.dur) {
      if (this.dir > 0 && this.px >= this.turnAt - 0.5) this.dir = -1;
      this.state = "walk";
      this.t = 0;
    }
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkIn = rand(2.5, 5);
      this.blink = 0.14;
    }
    if (this.blink > 0) this.blink -= dt;
    if (this.insides === "mosquitoes") {
      this.escapeIn -= dt;
      if (this.escapeIn <= 0) {
        this.escapeIn = rand(1.2, 3);
        this.escapes.push({ x: this.px + rand(-4, 4), y: this.y - 21, vx: rand(-12, 12), vy: -rand(6, 14), life: 1.4, max: 1.4 });
      }
    }
    for (const s of this.escapes) {
      s.life -= dt;
      s.vx += rand(-60, 60) * dt;
      s.vy += rand(-60, 60) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    if (this.escapes.length && this.escapes[0]!.life <= 0) this.escapes = this.escapes.filter((s) => s.life > 0);
    if (g.env.darkness > 0.3 && this.alpha > 0) g.addLight({ x: this.px, y: this.y - 16, radius: 22, color: MOONLIGHT });
    this.x = this.px;
  }

  private pause(dur: number): void {
    this.state = "pause";
    this.t = 0;
    this.dur = dur;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.eyes = null;
    if (this.alpha <= 0) return;
    const x = Math.round(this.px);
    const y = Math.round(this.y);
    if (this.state === "pile") {
      drawShadow(ctx, x, y, 18, this.alpha);
      draw(ctx, "critter.trenchcoat.pile", x, y + 1, { anchor: "feet", alpha: this.alpha });
      return;
    }
    drawShadow(ctx, x, y, 14, this.alpha);
    const walking = this.state === "walk";
    const frame = walking ? Math.floor(this.anim / 0.32) % 2 : 0;
    const left = x - 8;
    const top = y - 30 - (walking && frame === 1 ? 1 : 0);
    draw(ctx, `critter.trenchcoat.${frame}`, left, top, { alpha: this.alpha });
    // The tell, poking out under the hem.
    if (this.insides === "raccoons") draw(ctx, "critter.trenchcoat.tail", left + 13, top + 21 + (Math.floor(this.anim * 2.5) % 2), { alpha: this.alpha });
    else if (this.insides === "hedgehogs") draw(ctx, "critter.trenchcoat.spines", left + 13, top + 22, { alpha: this.alpha });
    if (this.blink <= 0) {
      const ex = left + COAT_EYES.x + this.look;
      const ey = top + COAT_EYES.y;
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = EYE;
      ctx.fillRect(ex, ey, 1, 1);
      ctx.fillRect(ex + COAT_EYES.gap, ey, 1, 1);
      ctx.globalAlpha = 1;
      this.eyes = { x: ex, y: ey, a: this.alpha };
    }
    drawSpecks(ctx, this.escapes);
  }

  hit(wx: number, wy: number): boolean {
    return this.standing && this.alpha > 0.6 && inBox(wx, wy, this.px - 10, this.y - 33, 20, 34);
  }

  onTap(g: Game): void {
    if (!this.standing) return;
    this.state = "pile";
    this.t = 0;
    this.alpha = 1;
    this.escapes = [];
    const x = this.px;
    const y = this.y;
    sfx("woosh", { volume: 0.6 });
    sfx("thud", { volume: 0.5, pitch: 0.8 });
    dotPuff(x, y - 4, ["#c9a066", "#e4c288", "#a47a44"], 10);
    crowds.push(addSafe(g, new Crowd(g, this.insides, x, y), "trenchcoat.crowd"));
    if (this.insides === "mosquitoes") sfx("rustle", { volume: 0.4, pitch: 2.2 });
    setTimeout(() => {
      sfx("secret");
      toast(REVEAL[this.insides], { icon: "critter.trenchcoat.icon", ms: 4500 });
    }, 700);
    setTimeout(() => critterReact("exclaim", x), 400);
    lsSet("farm.trenchcoat.lastSeen", String(Date.now()));
    try {
      g.emit("trenchcoat", this.insides);
    } catch (err) {
      report("trenchcoat.emit", err);
    }
  }
}

function drawSpecks(ctx: CanvasRenderingContext2D, specks: readonly Speck[]): void {
  for (const s of specks) {
    if (s.life <= 0) continue;
    ctx.globalAlpha = Math.min(1, (s.life / s.max) * 2);
    ctx.fillStyle = "#1e1820";
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    ctx.fillRect(x, y, 1, 1);
    if (Math.floor(s.life * 24) % 2 === 0) {
      ctx.globalAlpha *= 0.5;
      ctx.fillStyle = "#eef0ff";
      ctx.fillRect(x, y - 1, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- what came out of it ----------

interface Runner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  delay: number;
  ph: number;
}

class Crowd implements Entity {
  x: number;
  y: number;
  layer = 2;
  dead = false;
  private t = 0;
  private runners: Runner[] = [];
  /** The mosquito cloud (drawn above the night overlay, see initTrench). */
  specks: Speck[] = [];

  constructor(
    private g: Game,
    readonly insides: Insides,
    ox: number,
    oy: number,
  ) {
    this.x = ox;
    this.y = oy;
    if (insides === "mosquitoes") {
      const n = reducedMotion ? 60 : 260;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(20, 95);
        const life = rand(2.5, 4.5);
        this.specks.push({ x: ox + rand(-5, 5), y: oy - rand(4, 26), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 - 10, life, max: life });
      }
      return;
    }
    const n = reducedMotion ? 12 : 40;
    const raccoons = insides === "raccoons";
    for (let i = 0; i < n; i++) {
      // Every which way, mostly sideways (it's a farm, not a stampede... ok, it's a stampede).
      const a = (chance(0.5) ? 0 : Math.PI) + rand(-0.9, 0.9);
      const sp = raccoons ? rand(45, 80) : rand(32, 58);
      this.runners.push({ x: ox + rand(-4, 4), y: oy - rand(0, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, delay: (i / n) * 1.1 + rand(0, 0.08), ph: Math.random() });
    }
  }

  update(dt: number): void {
    this.t += dt;
    const l = this.g.layout;
    let alive = false;
    for (const r of this.runners) {
      if (this.t < r.delay) {
        alive = true;
        continue;
      }
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      if (r.x > -30 && r.x < l.w + 30 && r.y > -30 && r.y < l.h + 30) alive = true;
    }
    const damp = Math.max(0, 1 - dt * 0.8);
    for (const s of this.specks) {
      s.life -= dt;
      if (s.life <= 0) continue;
      alive = true;
      s.vx = (s.vx + rand(-80, 80) * dt) * damp;
      s.vy = (s.vy + rand(-80, 80) * dt - 4 * dt) * damp;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    if (!alive || this.t > 8) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.runners.length) return;
    const live = this.runners.filter((r) => this.t >= r.delay);
    live.sort((a, b) => a.y - b.y);
    for (const r of live) {
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      if (this.insides === "raccoons") {
        const frames = r.vx < 0 ? RACCOON_RUN.left : RACCOON_RUN.right;
        const key = frames[Math.floor((this.t + r.ph) / 0.06) % frames.length]!;
        if (isReal(key)) draw(ctx, key, x - 16, y - 30);
        else if (has("critter.raccoon.peek")) draw(ctx, "critter.raccoon.peek", x, y, { anchor: "feet", flipX: r.vx < 0 });
      } else {
        // Milo's long-lost cousins (all ninety-nine of them... give or take).
        const hop = Math.round(Math.abs(Math.sin((this.t + r.ph) * 14)) * 2);
        drawShadow(ctx, x, y, 12);
        const key = Math.floor((this.t + r.ph) / 0.08) % 2 ? "hedgehog.walk.1" : "hedgehog.idle.0";
        draw(ctx, key, x, y - hop, { anchor: "feet", flipX: r.vx < 0 });
      }
    }
  }
}

// ---------- spawner ----------

export function initTrench(g: Game): void {
  const raw = params.get("trenchcoat");
  const forced = raw !== null;
  const want = INSIDES.find((k) => k === raw) ?? null;
  let coat: TrenchCoat | null = null;
  let checkIn = forced ? 2.5 : rand(60, 120);

  onTick(g, "trenchcoat", (dt) => {
    if (coat?.dead) coat = null;
    if (crowds.some((c) => c.dead)) crowds = crowds.filter((c) => !c.dead);
    checkIn -= dt;
    if (checkIn > 0) return;
    checkIn = forced ? 20 : rand(70, 140);
    if (!forced && bigfootTonight()) return; // one tall stranger a night
    const env = g.env;
    const dry = env.weather !== "rain" && env.weather !== "storm" && env.weather !== "snow";
    const ok = env.darkness > 0.7 && dry && chance(0.04);
    if (coat || !(ok || forced)) return;
    const insides = want ?? INSIDES[Math.floor(Math.random() * INSIDES.length)]!;
    const c = new TrenchCoat(g, insides);
    if (claimBottomLane(c)) coat = addSafe(g, c, "trenchcoat");
  });

  g.addPass({
    order: 114, // above the night overlay: glinting eyes, and the mosquito cloud
    draw: (ctx) => {
      const eyes = coat?.eyes;
      if (!eyes && !crowds.length) return;
      ctx.save();
      try {
        if (eyes && g.env.darkness > 0.25) {
          ctx.globalAlpha = Math.min(0.9, g.env.darkness) * eyes.a;
          ctx.fillStyle = EYE;
          ctx.fillRect(eyes.x, eyes.y, 1, 1);
          ctx.fillRect(eyes.x + COAT_EYES.gap, eyes.y, 1, 1);
          ctx.globalAlpha = 1;
        }
        for (const c of crowds) if (c.specks.length) drawSpecks(ctx, c.specks);
      } catch (err) {
        report("trenchcoat.pass", err);
      } finally {
        ctx.restore();
      }
    },
  });

  onLayoutChange(g, "trenchcoat", () => {
    if (coat) coat.dead = true;
    for (const c of crowds) c.dead = true;
    coat = null;
    crowds = [];
  });
}
