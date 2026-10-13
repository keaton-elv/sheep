// The farm itself: ground, fence, barn, loom, chest, mailbox, billboard, sign, trees & forage,
// and the decorations bought at the carpenter's shop. Everything here is drawn with real Stardew sheets where we
// have them (see world-sheets.ts) and hand-drawn pixel art where we don't (world-artdata.ts).

import type { Season } from "../../shared/calendar";
import type { DecorKind } from "../../shared/types";
import type { Entity, Game } from "../engine/game";
import { store } from "../net";
import { buildSeasonalArt, buildWorldArt } from "./world-art";
import { Barn } from "./world-barn";
import { beginPlacement, decorKey, initDecor, variantCount, variantName } from "./world-decor";
import { buildFence } from "./world-fence";
import { initFx } from "./world-fx";
import { Ground } from "./world-ground";
import { Nature } from "./world-nature";
import { buildObjects } from "./world-objects";
import { guard, report, safeOn, safePass } from "./world-safe";

let game: Game | null = null;
let ground: Ground | null = null;
let nature: Nature | null = null;
let fence: Entity[] = [];
let season: Season = "spring";

function rebuildFence(g: Game): void {
  for (const e of fence) g.remove(e);
  fence = buildFence(g.layout, g.env.season);
  for (const e of fence) g.add(guard(e, "fence"));
}

function relayout(g: Game): void {
  ground?.build(g);
  rebuildFence(g);
  nature?.plant();
}

/** Run one piece of world setup; if it breaks, log it and let the rest of the farm boot. */
function step(name: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    report(`init ${name}`, err);
  }
}

export function initWorld(g: Game): void {
  if (game) return;
  game = g;
  season = g.env.season;
  step("fx", () => initFx(g));
  step("art", () => buildWorldArt(season));

  const gr = (ground = new Ground());
  step("ground", () => gr.build(g, true));
  safePass(g, -100, "ground", (ctx) => gr.drawGround(ctx));
  safePass(g, -60, "tufts", (ctx, gg) => gr.drawTufts(ctx, gg));

  step("fence", () => rebuildFence(g));
  step("barn", () => g.add(guard(new Barn(g), "barn")));
  step("objects", () => {
    for (const e of buildObjects(g)) g.add(guard(e, "object"));
  });

  step("nature", () => {
    nature = new Nature(g, gr);
    nature.plant();
    nature.spawnForage();
  });

  step("decor", () => initDecor(g));

  // Window resizes: the fence moves right away; the ground (a ~30ms rebuild) waits for a pause.
  let timer = 0;
  safeOn(g, "resize", "resize", () => {
    rebuildFence(g);
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      step("relayout", () => relayout(g));
    }, 90);
  });

  // The seasons turn (or someone is testing with ?speed=): repaint the farm.
  let check = 0;
  safeOn(g, "tick", "season", (dt: number) => {
    check -= dt;
    if (check > 0) return;
    check = 1;
    if (g.env.season === season) return;
    season = g.env.season;
    buildSeasonalArt(season);
    relayout(g);
    nature?.spawnForage();
  });
}

/**
 * Enter "placement mode": a ghost of the decoration follows the pointer over the pasture;
 * the next tap picks the spot. Resolves with the pasture fraction, or null if cancelled.
 */
export async function beginPlaceDecor(kind: DecorKind, variant: number): Promise<{ fx: number; fy: number } | null> {
  return beginPlacement(kind, variant, null);
}

/** Same as beginPlaceDecor, but for moving an existing decoration. */
export async function beginMoveDecor(decorId: string): Promise<{ fx: number; fy: number } | null> {
  const d = store.state?.decorations.find((x) => x.id === decorId);
  if (!d) return null;
  return beginPlacement(d.kind, d.variant, decorId);
}

/** Sprite key for a decoration (for shop icons). */
export function decorArtKey(kind: DecorKind, variant = 0): string {
  return decorKey(kind, variant);
}

/** How many looks a decoration kind has (e.g. 8 rarecrows). */
export function decorVariants(kind: DecorKind): number {
  return variantCount(kind);
}

/** A cute name for a decoration variant, when it has one (rarecrows do). */
export function decorVariantName(kind: DecorKind, variant: number): string | null {
  return variantName(kind, variant);
}
