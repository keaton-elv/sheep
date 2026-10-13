// Day/night lighting, weather, and floaty seasonal particles.
//
// Render passes (all owned here):
//   40  cloud shadows drifting over the farm
//   60  fog banks (and a soft morning mist)
//   80  rain / snow / petals / leaves / frost sparkles
//  100  time-of-day grade + night darkness with warm light holes (see sky-light.ts)
//  110  fireflies and lightning — the only things that glow above the darkness
//
// Lights: anyone can g.addLight({x, y, radius, color}) each frame (lamps, campfires, barn windows);
// the night overlay cuts a soft hole for each, tints the pool with the lamp's colour and adds a warm
// glow. Fireflies add their own.

import type { Game } from "../engine/game";
import { buildSkyArt } from "./sky-art";
import { SkyLight } from "./sky-light";
import { SkyWeather } from "./sky-weather";

export function initSky(g: Game): void {
  const art = buildSkyArt();
  const light = new SkyLight(art.hole);
  const weather = new SkyWeather(g, art, light);

  // The engine loop has no try/catch: one throw would freeze the whole farm. The sky is pure
  // decoration, so if anything in here ever breaks, log it once and let the sheep carry on.
  const failed = new Set<string>();
  const report = (where: string, err: unknown) => {
    if (failed.has(where)) return;
    failed.add(where);
    console.error(`[sky] ${where} failed (skipping it, the farm keeps running)`, err);
  };
  const pass = (order: number, name: string, draw: (ctx: CanvasRenderingContext2D, game: Game) => void) =>
    g.addPass({
      order,
      draw: (ctx, game) => {
        ctx.save();
        try {
          draw(ctx, game);
        } catch (err) {
          report(name, err);
        } finally {
          ctx.restore();
        }
      },
    });

  // "tick" fires after entities update and before rendering, so lights added here make this frame.
  g.on("tick", (dt: number) => {
    try {
      weather.update(dt);
      light.update(dt, g);
    } catch (err) {
      report("update", err);
    }
  });
  g.on("resize", () => {
    try {
      weather.resize();
    } catch (err) {
      report("resize", err);
    }
  });

  pass(40, "clouds", (ctx) => weather.drawClouds(ctx));
  pass(60, "fog", (ctx) => weather.drawFog(ctx));
  pass(80, "particles", (ctx) => weather.drawParticles(ctx));
  pass(100, "night", (ctx, game) => light.draw(ctx, game));
  pass(110, "glow", (ctx, game) => {
    weather.drawGlow(ctx);
    light.drawFlash(ctx, game);
  });
}
