// Stardew emote bubbles (the little speech bubbles animals pop above their heads).
// Used by the sheep and by the critters. Art is registered as "emote.<kind>" (a full 15x15
// bubble with the icon inside), so a real emotes sheet can replace it via REGIONS later.

import { pixelArt } from "../engine/pixelart";
import { REGIONS, SHEETS, draw, drawFrame, has, registerArt, sheet, size } from "../engine/sprites";
import { BUBBLE, BUBBLE_TAIL_X, DOTS_STAGES, EMOTE_ICONS, ICON_BOX, POP, POP_TAIL_X, type ArtData } from "./sheep-artdata";

export type EmoteKind = "heart" | "happy" | "music" | "sleep" | "question" | "exclaim" | "sad" | "angry" | "dots" | "blush";

export const EMOTE_KINDS: readonly EmoteKind[] = ["heart", "happy", "music", "sleep", "question", "exclaim", "sad", "angry", "dots", "blush"];

/** How long an emote lasts, in seconds. */
export const EMOTE_DURATION = 1.6;

const POP_IN = 0.14; // seconds of "swelling" before the full bubble shows
const FADE = 0.3; // fade-out at the end

// ---------- the real Stardew emote sheet (optional) ----------
// 64x256 = 4 frames x 16 rows of 16x16. Row 0 is the bubble popping open; each emote row
// animates over 4 frames. When public/sprites/emotes.png exists it's used automatically;
// otherwise the hand-drawn bubbles below cover everything.
SHEETS.emotes ??= "sprites/emotes.png";
const REAL_ROW: Record<EmoteKind, number> = {
  question: 2,
  angry: 3,
  exclaim: 4,
  heart: 5,
  sleep: 6,
  sad: 7,
  happy: 8,
  dots: 10,
  music: 14,
  blush: 15, // a rosy-cheeked little face (lambs snuggling up, a new hat)
};
/** Which frame makes the best still icon (for DOM use via spriteIcon("emote.heart")). */
const REAL_ICON_FRAME: Partial<Record<EmoteKind, number>> = { sleep: 3, dots: 3 };
for (const kind of Object.keys(REAL_ROW) as EmoteKind[]) {
  REGIONS[`emote.${kind}`] ??= { sheet: "emotes", x: (REAL_ICON_FRAME[kind] ?? 0) * 16, y: REAL_ROW[kind] * 16, w: 16, h: 16 };
}
const REAL_POP_FRAME = 0.055; // seconds per pop-open frame
const REAL_EMOTE_FRAME = 0.13; // seconds per emote frame

function drawRealEmote(ctx: CanvasRenderingContext2D, kind: EmoteKind, x: number, y: number, t: number): void {
  const pop = REAL_POP_FRAME * 4;
  const left = EMOTE_DURATION - t;
  let index: number;
  if (t < pop) index = Math.min(3, Math.floor(t / REAL_POP_FRAME));
  else if (left < pop) index = Math.max(0, Math.min(3, Math.floor(left / REAL_POP_FRAME))); // closes back up
  else {
    const f = Math.floor((t - pop) / REAL_EMOTE_FRAME);
    index = REAL_ROW[kind] * 4 + (kind === "dots" ? Math.min(3, f) : f % 4);
  }
  drawFrame(ctx, "emotes", index, 16, 16, Math.round(x - 8), Math.round(y - 16));
}

let ready = false;

function artCanvas(data: ArtData): HTMLCanvasElement {
  return pixelArt(null, data.rows, data.palette);
}

/** A full bubble canvas with `icon` centered inside it. */
function bubbleWith(icon: ArtData | null): HTMLCanvasElement {
  const bubble = artCanvas(BUBBLE);
  if (!icon) return bubble;
  const ic = artCanvas(icon);
  const ctx = bubble.getContext("2d")!;
  const ox = ICON_BOX.x + Math.floor((ICON_BOX.w - ic.width) / 2);
  const oy = ICON_BOX.y + Math.floor((ICON_BOX.h - ic.height) / 2);
  ctx.drawImage(ic, ox, oy);
  return bubble;
}

/** Build and register every emote canvas. Safe to call more than once. */
export function registerEmoteArt(): void {
  if (ready) return;
  ready = true;
  for (const kind of EMOTE_KINDS) {
    // Kinds without a hand-drawn icon (blush) fall back to the happy face.
    const icon = EMOTE_ICONS[kind] ?? (kind === "blush" ? EMOTE_ICONS.happy : undefined);
    registerArt(`emote.${kind}`, bubbleWith(icon ?? null));
  }
  registerArt("emote.bubble", bubbleWith(null));
  POP.forEach((p, i) => registerArt(`emote.pop.${i}`, artCanvas(p)));
  DOTS_STAGES.forEach((d, i) => registerArt(`emote.dots.${i + 1}`, bubbleWith(d)));
}

/** Tail-tip column of a bubble key (real sheets are 16 wide with a centered tail). */
function tailX(key: string, w: number): number {
  if (key.startsWith("emote.pop.")) return POP_TAIL_X[Number(key.slice(10))] ?? Math.floor(w / 2);
  return w === BUBBLE.rows[0]!.length ? BUBBLE_TAIL_X : Math.floor(w / 2);
}

function blit(ctx: CanvasRenderingContext2D, key: string, x: number, y: number): void {
  const s = size(key);
  if (!s) return;
  draw(ctx, key, Math.round(x - tailX(key, s.w)), Math.round(y - s.h));
}

/**
 * Draw an emote bubble whose bottom-center (the tail tip) sits at (x, y).
 * `t` = seconds since the emote started (bubbles pop in, wobble, then fade out by ~1.6s).
 * Returns false once the emote has finished.
 */
export function drawEmote(ctx: CanvasRenderingContext2D, kind: EmoteKind, x: number, y: number, t: number): boolean {
  if (t >= EMOTE_DURATION || t < 0) return t < 0;
  if (sheet("emotes")) {
    drawRealEmote(ctx, kind, x, y, t);
    return true;
  }
  if (!ready) registerEmoteArt();

  const prevAlpha = ctx.globalAlpha;
  const left = EMOTE_DURATION - t;
  if (left < FADE) ctx.globalAlpha = prevAlpha * Math.max(0, left / FADE);

  if (t < POP_IN) {
    // Swell out of the tail: tiny blob, then a small bubble.
    blit(ctx, t < POP_IN / 2 ? "emote.pop.0" : "emote.pop.1", x, y);
  } else {
    // A one-pixel overshoot right after popping, then a gentle bob.
    const since = t - POP_IN;
    let dy = 0;
    if (since < 0.08) dy = -1;
    else if (since > 0.25) dy = Math.round(Math.sin((since - 0.25) * 5.5) * 0.9);
    let key = `emote.${kind}`;
    if (kind === "dots") {
      // "." ".." "..." typing out.
      if (since < 0.22) key = "emote.dots.1";
      else if (since < 0.44) key = "emote.dots.2";
    }
    if (!has(key)) key = "emote.bubble";
    blit(ctx, key, x, y + dy);
  }

  ctx.globalAlpha = prevAlpha;
  return true;
}

// Register at import (the DOM is ready by the time modules run in the browser).
try {
  registerEmoteArt();
} catch {
  ready = false;
}
