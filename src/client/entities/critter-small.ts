// Two small locals, both hand-drawn (critter-lore-sprites.ts):
//  - A hummingbird (an Anna's: iridescent green, magenta throat) darting from flower to flower on
//    fine spring & summer days. It hovers at each bloom, beak first, then zips to the next.
//  - A banana slug on rainy days, sliming slowly across the grass and leaving a faint shiny trail.
//    Tap it: Go Slugs!
// Debug: ?hummingbird=1 ?slug=1

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw } from "../engine/sprites";
import { toast } from "../ui/dom";
import { flowerTargets, type Target } from "./critter-bugs";
import { onLayoutChange, openGrass, pastureSpot } from "./critter-place";
import { addSafe, chance, drawShadow, inBox, onAnyTap, onTick, params, rand } from "./critter-util";

// ---------- hummingbird ----------

/** From the bird's center to the tip of its beak (it hovers this far from the flower). */
const BEAK = 7;

class Hummingbird implements Entity {
  x = 0;
  y = 0;
  layer = 2;
  dead = false;
  private px: number;
  private py: number;
  private t = Math.random();
  private target: Target | null = null;
  private hover = 0;
  private visits = 3 + Math.floor(Math.random() * 4);
  private leaving = false;
  private face: 1 | -1 = 1;
  private gx = 0;
  private gy = 0;

  constructor(private g: Game) {
    const l = g.layout;
    const fromLeft = chance(0.5);
    this.px = fromLeft ? -10 : l.w + 10;
    this.py = l.pasture.y + rand(0, l.pasture.h * 0.6);
    this.next();
  }

  private next(): void {
    const all = flowerTargets(this.g, this.g.layout);
    // Somewhere new each time (not the flower it just left).
    const options = all.filter((f) => !this.target || Math.hypot(f.x - this.target.x, f.y - this.target.y) > 10);
    const f = options[Math.floor(Math.random() * options.length)];
    if (!f || this.visits <= 0) {
      this.leave();
      return;
    }
    this.visits--;
    this.target = f;
    this.face = f.x >= this.px ? 1 : -1;
    this.gx = f.x - this.face * BEAK;
    this.gy = f.y - 1;
  }

  /** Off it zips. */
  leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.hover = 0;
    const l = this.g.layout;
    this.face = this.px < l.w / 2 ? -1 : 1;
    this.gx = this.face > 0 ? l.w + 20 : -20;
    this.gy = this.py - rand(20, 50);
  }

  update(dt: number): void {
    this.t += dt;
    if (this.hover > 0) {
      this.hover -= dt;
      // Hovering in place, the tiniest bob, sipping.
      this.px = this.gx;
      this.py = this.gy + Math.sin(this.t * 9) * 0.8;
      if (this.hover <= 0) this.next();
    } else {
      const dx = this.gx - this.px;
      const dy = this.gy - this.py;
      const d = Math.hypot(dx, dy);
      if (!this.leaving && d < 0.8) {
        this.hover = rand(0.8, 2.2);
      } else {
        // Dart: very fast, then a sudden stop.
        const step = Math.min(d, Math.min(150, Math.max(40, d * 7)) * dt);
        this.px += (dx / Math.max(d, 0.001)) * step;
        this.py += (dy / Math.max(d, 0.001)) * step;
        if (Math.abs(dx) > 2) this.face = dx > 0 ? 1 : -1;
      }
      const l = this.g.layout;
      if (this.leaving && (this.px < -16 || this.px > l.w + 16)) this.dead = true;
    }
    this.x = this.px;
    this.y = this.hover > 0 && this.target ? this.target.sortY : this.py + 12;
  }

  near(x: number, y: number): boolean {
    return !this.leaving && Math.abs(x - this.px) < 12 && Math.abs(y - this.py) < 12;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const key = Math.floor(this.t / 0.03) % 2 ? "critter.hummingbird.1" : "critter.hummingbird.0";
    // The sprite faces right; its body's center is at (6, 4).
    draw(ctx, key, Math.round(this.px) - 6, Math.round(this.py) - 4, { flipX: this.face < 0 });
  }
}

// ---------- banana slug ----------

const TRAIL_LIFE = 25;
const TRAIL_MAX = 48;

class BananaSlug implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  dead = false;
  px: number;
  py: number;
  private heading: number;
  private t = Math.random() * 2;
  private alpha = 0;
  private life = rand(80, 150);
  private tuck = 0;
  private toasted = false;
  private odo = 0;
  private trail: { x: number; y: number; age: number }[] = [];
  leaving = false;

  constructor(private g: Game) {
    const s = pastureSpot(g.layout, 16);
    this.px = s.x;
    this.py = s.y;
    this.heading = (chance(0.5) ? 0 : Math.PI) + rand(-0.3, 0.3);
  }

  private get dir(): 1 | -1 {
    return Math.cos(this.heading) >= 0 ? 1 : -1;
  }

  update(dt: number): void {
    this.t += dt;
    for (const p of this.trail) p.age += dt;
    while (this.trail.length && this.trail[0]!.age > TRAIL_LIFE) this.trail.shift();
    this.life -= dt;
    if (this.life <= 0) this.leaving = true;
    this.alpha = this.leaving ? this.alpha - dt * 0.5 : Math.min(1, this.alpha + dt * 0.5);
    if (this.leaving && this.alpha <= 0) {
      this.dead = true;
      return;
    }
    if (this.tuck > 0) {
      this.tuck -= dt;
    } else {
      // Slow, slow, slow. (A little faster on the stretch, a little slower on the scrunch.)
      const stretch = Math.floor(this.t / 0.7) % 2 === 0;
      const speed = stretch ? 2.6 : 1.6;
      this.heading += rand(-0.5, 0.5) * dt;
      // Mostly sideways, so it reads as a slug crossing the lawn.
      const s = Math.sin(this.heading);
      if (Math.abs(s) > 0.45) this.heading -= Math.sign(s) * Math.cos(this.heading) * 0.02;
      const nx = this.px + Math.cos(this.heading) * speed * dt;
      const ny = this.py + Math.sin(this.heading) * speed * dt * 0.6;
      if (!openGrass(this.g.layout, nx, ny, 10)) {
        this.heading += Math.PI + rand(-0.5, 0.5); // turns around (slowly, in spirit)
      } else {
        this.odo += Math.hypot(nx - this.px, ny - this.py);
        this.px = nx;
        this.py = ny;
        if (this.odo > 1.5) {
          this.odo = 0;
          // The trail starts at its tail.
          this.trail.push({ x: this.px - this.dir * 6, y: this.py - 1, age: 0 });
          if (this.trail.length > TRAIL_MAX) this.trail.shift();
        }
      }
    }
    this.x = this.px;
    this.y = this.py;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    const prev = ctx.globalAlpha;
    for (const p of this.trail) {
      const a = (1 - p.age / TRAIL_LIFE) * 0.45 * this.alpha;
      if (a <= 0.02) continue;
      ctx.globalAlpha = prev * a;
      ctx.fillStyle = "#e6eeff";
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = prev;
    drawShadow(ctx, this.px, this.py, 12, 0.6 * this.alpha);
    const key = this.tuck > 0 ? "critter.slug.tuck" : Math.floor(this.t / 0.7) % 2 ? "critter.slug.1" : "critter.slug.0";
    draw(ctx, key, this.px, this.py + 1, { anchor: "feet", flipX: this.dir < 0, alpha: this.alpha });
  }

  hit(wx: number, wy: number): boolean {
    return this.alpha > 0.5 && inBox(wx, wy, this.px - 11, this.py - 11, 22, 14);
  }

  onTap(): void {
    this.tuck = 2.5;
    sfx("squelch", { volume: 0.6, pitch: rand(0.92, 1.05) });
    if (this.toasted) return;
    this.toasted = true;
    toast("A banana slug! Go Slugs! 🍌", { icon: "critter.slug.0" });
  }
}

// ---------- spawner ----------

export function initSmall(g: Game): void {
  const forceHum = params.has("hummingbird");
  const forceSlug = params.has("slug");
  let hummer: Hummingbird | null = null;
  let slug: BananaSlug | null = null;
  let humIn = forceHum ? 2 : rand(4, 14);
  let humFirst = true;
  let slugIn = forceSlug ? 2 : rand(3, 10);
  let slugFirst = true;

  onTick(g, "small", (dt) => {
    const env = g.env;
    if (hummer?.dead) hummer = null;
    if (slug?.dead) slug = null;

    // Hummingbird: fine spring & summer days.
    const flowerDay = (env.season === "spring" || env.season === "summer") && env.darkness < 0.35 && (env.weather === "sunny" || env.weather === "cloudy" || env.weather === "windy");
    if (hummer && !flowerDay && !forceHum) hummer.leave();
    humIn -= dt;
    if (humIn <= 0) {
      humIn = forceHum ? 20 : rand(35, 80);
      const p = humFirst ? 0.6 : 0.45;
      humFirst = false;
      if (!hummer && ((flowerDay && chance(p)) || forceHum)) hummer = addSafe(g, new Hummingbird(g), "hummingbird");
    }

    // Banana slug: rainy days (SF's rainy season is slug season).
    const rainy = env.weather === "rain" || env.weather === "storm";
    if (slug && !rainy && !forceSlug) slug.leaving = true;
    slugIn -= dt;
    if (slugIn <= 0) {
      slugIn = forceSlug ? 30 : rand(30, 70);
      const p = slugFirst ? 0.8 : 0.6;
      slugFirst = false;
      if (!slug && ((rainy && chance(p)) || forceSlug)) slug = addSafe(g, new BananaSlug(g), "slug");
    }
  });

  onAnyTap(g, "small", (x, y) => {
    if (hummer?.near(x, y)) hummer.leave();
  });

  onLayoutChange(g, "small", () => {
    if (hummer) hummer.dead = true;
    if (slug) slug.dead = true;
    hummer = null;
    slug = null;
  });
}
