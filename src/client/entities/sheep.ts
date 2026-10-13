// The sheep! One wandering sprite per todo still in the pasture. STUB — implemented by the sheep agent.

import type { Game } from "../engine/game";
import type { EmoteKind } from "./emotes";

export function initSheep(_g: Game): void {}

/** Animate shearing a sheep (shears swipe, snip, wool pops out). Resolves when done. */
export async function playShear(_sheepId: string): Promise<void> {}

/** Easter egg: every sheep jumps and baas at once. */
export function sheepParty(): void {}

/** Pop an emote above a sheep. */
export function sheepEmote(_sheepId: string, _kind: EmoteKind): void {}

/** Current world position (feet) of a sheep in the pasture, or null if it isn't out. */
export function sheepPosition(_sheepId: string): { x: number; y: number } | null {
  return null;
}
