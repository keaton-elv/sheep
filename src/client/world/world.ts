// The farm itself: ground, fence, barn, loom, chest, mailbox, billboard, sign, decorations.
// STUB — implemented by the world agent.

import type { Game } from "../engine/game";
import type { DecorKind } from "../../shared/types";

export function initWorld(_g: Game): void {}

/**
 * Enter "placement mode": a ghost of the decoration follows the pointer over the pasture;
 * the next tap picks the spot. Resolves with the pasture fraction, or null if cancelled.
 */
export async function beginPlaceDecor(_kind: DecorKind, _variant: number): Promise<{ fx: number; fy: number } | null> {
  return null;
}

/** Same as beginPlaceDecor, but for moving an existing decoration. */
export async function beginMoveDecor(_decorId: string): Promise<{ fx: number; fy: number } | null> {
  return null;
}

/** Sprite key for a decoration (for shop icons). */
export function decorArtKey(kind: DecorKind, variant = 0): string {
  return `decor.${kind}.${variant}`;
}

/** How many looks a decoration kind has (e.g. 8 rarecrows). */
export function decorVariants(_kind: DecorKind): number {
  return 1;
}
