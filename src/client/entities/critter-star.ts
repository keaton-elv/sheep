// A shooting star. Rarely, on a clear night, a sparkly streak zips across the top of the screen;
// tap anywhere while it's streaking to make a wish. Meteor-shower nights (the Perseids around
// Aug 12, the Geminids around Dec 13) bring a lot more of them. Force one with ?star=1.
//
// Drawn in a render pass above the night overlay and the fireflies, so it glows against the dark.

import { sfx } from "../audio";
import type { Game } from "../engine/game";
import { toast } from "../ui/dom";
import { chance, onAnyTap, onTick, params, rand, reducedMotion, report } from "./critter-util";

interface Star {
  t: number;
  dur: number;
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  wished: boolean;
  sparkIn: number;
}

interface Spark {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

/** The tail is this many pixels long (sampled one pixel apart along the path). */
const TAIL = 36;
const FADE_IN = 0.12;
const FADE_OUT = 0.3;
/** You can still wish a moment after it's gone (it's fast!). */
const WISH_GRACE = 0.8;
const SPARK_COLORS = ["#ffffff", "#fff6c8", "#ffe7a0", "#e6dcff", "#ffd6f0"] as const;
const MAX_SPARKS = 48;

function meteorShower(now: Date): boolean {
  const m = now.getMonth();
  const d = now.getDate();
  return (m === 7 && d >= 11 && d <= 13) || (m === 11 && d >= 13 && d <= 14);
}

export function initShootingStars(g: Game): void {
  const forced = params.has("star");
  let star: Star | null = null;
  let checkIn = forced ? 2 : rand(20, 45);
  const sparks: Spark[] = Array.from({ length: MAX_SPARKS }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: "#fff" }));

  const spark = (x: number, y: number, vx: number, vy: number, life: number): void => {
    for (const s of sparks) {
      if (s.on) continue;
      s.on = true;
      s.x = x;
      s.y = y;
      s.vx = vx;
      s.vy = vy;
      s.life = s.max = life;
      s.color = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)]!;
      return;
    }
  };

  const launch = (): void => {
    const l = g.layout;
    const w = l.w;
    const dir = chance(0.5) ? 1 : -1;
    // Quick, but slow enough to spot it and tap before it's gone.
    const dur = rand(1.2, 1.7);
    const a = rand(0.22, 0.42); // radians below the horizon
    const dist = w * rand(0.55, 0.8);
    const speed = dist / dur;
    // Across the top of the farm, just under the clock box (so the clock never hides it).
    const top = l.hudClock.y + l.hudClock.h;
    star = {
      t: 0,
      dur,
      x0: dir > 0 ? rand(-6, w * 0.4) : rand(w * 0.6, w + 6),
      y0: top + rand(2, 22),
      vx: dir * speed * Math.cos(a),
      vy: speed * Math.sin(a),
      wished: false,
      sparkIn: 0,
    };
  };

  const head = (s: Star, t = s.t): { x: number; y: number } => ({ x: s.x0 + s.vx * t, y: s.y0 + s.vy * t });

  onTick(g, "star", (dt) => {
    const env = g.env;
    checkIn -= dt;
    if (checkIn <= 0) {
      const clear = env.weather === "sunny" || env.weather === "cloudy" || env.weather === "windy";
      const shower = meteorShower(env.now);
      checkIn = forced ? 9 : shower ? rand(8, 20) : rand(30, 50);
      if (!star && ((env.darkness > 0.6 && clear && chance(shower ? 0.5 : 0.035)) || forced)) launch();
    }

    const s = star;
    if (s) {
      s.t += dt;
      if (s.t < s.dur) {
        // Glitter falling off the head.
        s.sparkIn -= dt;
        if (s.sparkIn <= 0) {
          s.sparkIn = reducedMotion ? 0.12 : 0.028;
          const h = head(s);
          spark(h.x + rand(-1, 1), h.y + rand(-1, 1), s.vx * 0.08 + rand(-6, 6), rand(2, 10), rand(0.45, 0.9));
        }
      }
      if (s.t > s.dur + WISH_GRACE) star = null;
    }

    for (const p of sparks) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        continue;
      }
      p.vy += 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  });

  // Make a wish: any tap while it's streaking (or just after) counts. Never swallows the tap.
  onAnyTap(g, "star", () => {
    const s = star;
    if (!s || s.wished || s.t > s.dur + WISH_GRACE) return;
    s.wished = true;
    toast("Make a wish! ✨", { icon: "fx.sparkle.0" });
    sfx("sparkle");
    const h = head(s, Math.min(s.t, s.dur));
    const n = reducedMotion ? 4 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = rand(12, 26);
      spark(h.x, h.y, Math.cos(a) * v, Math.sin(a) * v - 6, rand(0.6, 1.1));
    }
  });

  const drawStar = (ctx: CanvasRenderingContext2D): void => {
    const s = star;
    if (s && s.t < s.dur) {
      const env = s.t < FADE_IN ? s.t / FADE_IN : s.t > s.dur - FADE_OUT ? Math.max(0, (s.dur - s.t) / FADE_OUT) : 1;
      // The tail: a line of pixels back along the path, fading out toward the end.
      const step = 1 / Math.max(1, Math.hypot(s.vx, s.vy));
      for (let i = 0; i < TAIL; i++) {
        const tt = s.t - i * step;
        if (tt < 0) break;
        const k = 1 - i / TAIL;
        const a = k * Math.sqrt(k) * env;
        if (a <= 0.02) continue;
        const p = head(s, tt);
        ctx.globalAlpha = Math.min(1, a);
        ctx.fillStyle = i < 3 ? "#ffffff" : i < 10 ? "#fff3c4" : "#d9ccff";
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        if (i < 9) {
          // A second, fainter row makes the bright end look a bit thicker.
          ctx.globalAlpha = Math.min(1, a * 0.45);
          ctx.fillRect(Math.round(p.x), Math.round(p.y) + 1, 1, 1);
        }
      }
      if (env > 0) {
        // The head: a little four-pointed twinkle.
        const h = head(s);
        const x = Math.round(h.x);
        const y = Math.round(h.y);
        ctx.globalAlpha = env;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
        ctx.globalAlpha = env * 0.8;
        ctx.fillStyle = "#fff6c8";
        const arm = Math.floor(s.t * 20) % 2 ? 2 : 1;
        ctx.fillRect(x - arm, y, arm, 1);
        ctx.fillRect(x + 1, y, arm, 1);
        ctx.fillRect(x, y - arm, 1, arm);
        ctx.fillRect(x, y + 2, 1, arm);
      }
    }
    for (const p of sparks) {
      if (!p.on) continue;
      const k = p.life / p.max;
      // Twinkle: blink off now and then as it falls.
      if (k < 0.6 && Math.floor(p.life * 18) % 3 === 0) continue;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;
  };

  g.addPass({
    order: 112, // above the night darkness (100) and the fireflies (110)
    draw: (ctx) => {
      ctx.save();
      try {
        drawStar(ctx);
      } catch (err) {
        report("star.draw", err);
        star = null;
      } finally {
        ctx.restore();
      }
    },
  });
}
