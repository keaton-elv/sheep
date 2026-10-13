// The Witch. Very rarely, late at night, a silhouette on a broom swoops across the top of the
// farm (like Stardew's witch event). Force it with ?witch=1. Tap her if you're quick enough.

import { sfx } from "../audio";
import type { Game } from "../engine/game";
import { silhouette } from "../engine/pixelart";
import { draw, size, spriteCanvas } from "../engine/sprites";
import { dayKey } from "../../shared/calendar";
import { say } from "../ui/dom";
import { chance, inBox, lsGet, lsSet, onTick, params, rand, reducedMotion, report } from "./critter-util";

interface Flight {
  t: number;
  speed: number;
  dir: 1 | -1;
  y: number;
  x: number;
  cy: number;
  tapped: boolean;
}

const TRAIL = 14;
const RIM = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export function initWitch(g: Game): void {
  let flight: Flight | null = null;
  let glow: HTMLCanvasElement | null = null;
  const trailX = new Float32Array(TRAIL);
  const trailY = new Float32Array(TRAIL);
  const trailT = new Float32Array(TRAIL).fill(-1);
  let trailI = 0;
  let trailEvery = 0;
  let checkIn = rand(30, 90);

  const fly = () => {
    if (flight) return;
    const dir: 1 | -1 = chance(0.5) ? 1 : -1;
    const w = g.w;
    trailT.fill(-1);
    flight = { t: 0, speed: (w + 80) / rand(6.5, 8), dir, y: rand(14, 30), x: dir > 0 ? -40 : w + 40, cy: 0, tapped: false };
    setTimeout(() => sfx("woosh", { volume: 0.7, pitch: 0.8 }), 1800);
  };

  if (params.has("witch")) setTimeout(fly, 2000);

  onTick(g, "witch", (dt) => {
    const env = g.env;
    checkIn -= dt;
    if (checkIn <= 0) {
      checkIn = 120;
      const key = dayKey(env.now);
      const lateNight = env.isNight && (env.hour >= 21 || env.hour < 4);
      const spiritsEve = env.now.getMonth() === 9 && env.now.getDate() === 31;
      if (lateNight && lsGet("farm.witchNight") !== key && (chance(spiritsEve ? 0.5 : 0.025) || params.has("witch"))) {
        lsSet("farm.witchNight", key);
        fly();
      }
    }
    const f = flight;
    if (!f) return;
    f.t += dt;
    f.x += f.dir * f.speed * dt;
    if (f.tapped) f.y -= dt * 16;
    f.cy = f.y + Math.sin(f.t * 2.2) * 4;
    if ((f.dir > 0 && f.x > g.w + 40) || (f.dir < 0 && f.x < -40)) {
      flight = null;
      return;
    }
    trailEvery -= dt;
    if (trailEvery <= 0 && !reducedMotion) {
      trailEvery = 0.06;
      trailX[trailI] = f.x - f.dir * 17 + rand(-1, 1);
      trailY[trailI] = f.cy + 5 + rand(-1, 1);
      trailT[trailI] = 0;
      trailI = (trailI + 1) % TRAIL;
    }
    for (let i = 0; i < TRAIL; i++) if (trailT[i]! >= 0) trailT[i]! += dt;
  });

  const drawWitch = (ctx: CanvasRenderingContext2D): void => {
    const f = flight;
    if (!f) return;
    const s = size("critter.witch");
    if (!s) return;
    if (!glow) glow = silhouette(null, spriteCanvas("critter.witch"), "#cbbcff");
    const x = Math.round(f.x - s.w / 2);
    const y = Math.round(f.cy - s.h / 2);
    // Sparkly trail of broom dust.
    for (let i = 0; i < TRAIL; i++) {
      const tt = trailT[i]!;
      if (tt < 0 || tt > 0.8) continue;
      ctx.globalAlpha = 1 - tt / 0.8;
      ctx.fillStyle = i % 3 === 0 ? "#b4ff9a" : "#e8dcff";
      ctx.fillRect(Math.round(trailX[i]!), Math.round(trailY[i]! + tt * 6), 1, 1);
    }
    // A faint moonlit rim so the silhouette reads against the night.
    ctx.globalAlpha = 0.45;
    const flip = f.dir < 0;
    for (const [ox, oy] of RIM) {
      if (flip) {
        ctx.save();
        ctx.translate(x + ox + s.w, y + oy);
        ctx.scale(-1, 1);
        ctx.drawImage(glow, 0, 0);
        ctx.restore();
      } else ctx.drawImage(glow, x + ox, y + oy);
    }
    ctx.globalAlpha = 1;
    draw(ctx, "critter.witch", x, y, { flipX: flip });
  };
  g.addPass({
    order: 105, // above the night darkness, so she shows up against the dark sky
    draw: (ctx) => {
      if (!flight) return;
      ctx.save();
      try {
        drawWitch(ctx);
      } catch (err) {
        report("witch.draw", err);
        flight = null;
      } finally {
        ctx.restore();
      }
    },
  });

  // She's in a pass (not an entity), so catch taps on her before anything else.
  g.onGroundTap((wx, wy) => {
    const f = flight;
    if (!f || f.tapped) return false;
    if (!inBox(wx, wy, f.x - 22, f.cy - 14, 44, 28)) return false;
    f.tapped = true;
    f.speed *= 2.2;
    sfx("woosh");
    setTimeout(() => sfx("secret"), 250);
    void say(["The Witch cackles and zooms off into the night!", "(Rumor has it she only visits farms with very happy animals.)"]);
    return true;
  });
}
