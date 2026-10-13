// The engine loop has no try/catch: a single throw inside an entity's update/draw (or a render pass,
// or a tick listener) would freeze the whole farm. Everything the world adds goes through these
// wrappers, so if some decoration ever misbehaves we log it once and the sheep carry on grazing.

import type { Entity, Game, RenderPass } from "../engine/game";

const reported = new Set<string>();

export function report(where: string, err: unknown): void {
  if (reported.has(where)) return;
  reported.add(where);
  console.error(`[world] ${where} failed (skipping it, the farm keeps running)`, err);
}

/** Wrap an entity's update/draw/hit/onTap in try/catch (in place). Returns the same entity. */
export function guard<T extends Entity>(e: T, name: string): T {
  const ent = e as Entity;
  const update = ent.update;
  const draw = ent.draw;
  const hit = ent.hit;
  const onTap = ent.onTap;
  if (update) {
    ent.update = (dt, g) => {
      try {
        update.call(e, dt, g);
      } catch (err) {
        report(`${name}.update`, err);
      }
    };
  }
  ent.draw = (ctx, g) => {
    try {
      draw.call(e, ctx, g);
    } catch (err) {
      report(`${name}.draw`, err);
    }
  };
  if (hit) {
    ent.hit = (wx, wy) => {
      try {
        return hit.call(e, wx, wy);
      } catch (err) {
        report(`${name}.hit`, err);
        return false;
      }
    };
  }
  if (onTap) {
    ent.onTap = (g, wx, wy) => {
      try {
        onTap.call(e, g, wx, wy);
      } catch (err) {
        report(`${name}.onTap`, err);
      }
    };
  }
  return e;
}

/** addPass with try/catch and a save/restore around the draw. */
export function safePass(g: Game, order: number, name: string, draw: RenderPass["draw"]): () => void {
  return g.addPass({
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
}

/** g.on with try/catch around the listener. */
export function safeOn<A extends unknown[]>(g: Game, event: string, name: string, fn: (...args: A) => void): () => void {
  return g.on(event, (...args: unknown[]) => {
    try {
      fn(...(args as A));
    } catch (err) {
      report(name, err);
    }
  });
}
