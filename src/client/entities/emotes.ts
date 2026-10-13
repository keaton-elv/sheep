// Stardew emote bubbles (the little speech bubbles animals pop above their heads).
// STUB — implemented by the sheep agent; also used by critters.

export type EmoteKind = "heart" | "happy" | "music" | "sleep" | "question" | "exclaim" | "sad" | "angry" | "dots";

/**
 * Draw an emote bubble whose bottom-center sits at (x, y).
 * `t` = seconds since the emote started (bubbles pop in, wobble, then fade out by ~1.6s).
 * Returns false once the emote has finished.
 */
export function drawEmote(_ctx: CanvasRenderingContext2D, _kind: EmoteKind, _x: number, _y: number, _t: number): boolean {
  return false;
}

/** How long an emote lasts, in seconds. */
export const EMOTE_DURATION = 1.6;
