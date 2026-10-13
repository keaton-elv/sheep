// Snickers' little DOM bits: the parchment "Snickers" name tag that pops up when you pet him,
// and the "mlem" bubbles that fly off during a lick frenzy. Real DOM text, so it's crisp at any
// zoom. Everything lives in one pointer-events:none layer, so taps always reach the farm.

import type { Game } from "../engine/game";
import { uiRoot } from "../ui/dom";

const STYLE_ID = "snk-style";
const TAG_MS = 2000;
const MLEM_MS = 950;
const MAX_MLEMS = 10;

const CSS = `
#ui > .snk-layer, .snk-layer {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 4;
  contain: layout style;
}
.snk-tag {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  will-change: transform;
}
.snk-tag[hidden] { display: none; }
.snk-tag__in {
  position: relative;
  display: block;
  padding: 0.1em 0.55em 0.16em;
  border: max(1px, calc(var(--px, 2px) * 0.5)) solid #7a4e2a;
  border-radius: 0.45em;
  background: #fff4d8;
  color: #3b2316;
  box-shadow: 0 max(1px, calc(var(--px, 2px) * 0.5)) 0 rgba(59, 35, 22, 0.35);
  font: 700 clamp(12px, calc(var(--px, 2px) * 6), 15px) / 1.15 "Pixelify Sans", ui-rounded, system-ui, sans-serif;
  letter-spacing: 0.02em;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  transform-origin: 50% 100%;
}
.snk-tag__in::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: calc(-1 * max(4px, calc(var(--px, 2px) * 2)));
  width: max(4px, calc(var(--px, 2px) * 2));
  height: max(4px, calc(var(--px, 2px) * 2));
  margin-left: calc(-0.5 * max(4px, calc(var(--px, 2px) * 2)));
  background: #fff4d8;
  border-right: max(1px, calc(var(--px, 2px) * 0.5)) solid #7a4e2a;
  border-bottom: max(1px, calc(var(--px, 2px) * 0.5)) solid #7a4e2a;
  transform: translateY(-50%) rotate(45deg);
}
.snk-tag.is-in .snk-tag__in { animation: snk-pop 260ms cubic-bezier(0.2, 1.6, 0.4, 1) both; }
.snk-tag.is-out .snk-tag__in { animation: snk-fade 300ms ease-in forwards; }
.snk-mlem {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  padding: 0.04em 0.4em 0.1em;
  border: max(1px, calc(var(--px, 2px) * 0.5)) solid #8e3a55;
  border-radius: 0.6em;
  background: #fff8f2;
  color: #c2405f;
  font: 700 clamp(10px, calc(var(--px, 2px) * 4.5), 13px) / 1.1 "Pixelify Sans", ui-rounded, system-ui, sans-serif;
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  animation: snk-mlem ${MLEM_MS}ms ease-out forwards;
}
.snk-mlem.is-big { font-size: clamp(12px, calc(var(--px, 2px) * 5.5), 16px); }
@keyframes snk-pop {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes snk-fade {
  to { opacity: 0; transform: translateY(-3px); }
}
@keyframes snk-mlem {
  0% { transform: translate(-50%, -50%) translate(0, 4px) scale(0.6) rotate(var(--rot, 0deg)); opacity: 0; }
  14% { transform: translate(-50%, -50%) translate(0, 0) scale(1.05) rotate(var(--rot, 0deg)); opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(-50%, -50%) translate(var(--dx, 0px), -26px) scale(0.95) rotate(var(--rot, 0deg)); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .snk-tag.is-in .snk-tag__in { animation: none; }
  .snk-mlem { animation-name: snk-mlem-still; }
  @keyframes snk-mlem-still {
    0%, 75% { transform: translate(-50%, -50%); opacity: 1; }
    100% { transform: translate(-50%, -50%); opacity: 0; }
  }
}
`;

let layer: HTMLDivElement | null = null;
let tag: HTMLDivElement | null = null;
let tagUntil = 0;
let tagOutTimer = 0;
/** The tag's size in CSS px, measured once per pop (so following him never forces a layout). */
let tagW = 70;
let tagH = 20;
let mlems = 0;

function ensureLayer(): HTMLDivElement {
  if (layer && layer.isConnected) return layer;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  layer = document.createElement("div");
  layer.className = "snk-layer";
  layer.setAttribute("aria-hidden", "true");
  // `#ui > *` turns pointer events back on for overlays; inline wins so taps fall through.
  layer.style.pointerEvents = "none";
  uiRoot.appendChild(layer);
  tag = null;
  return layer;
}

/** World (game px) -> viewport CSS px. */
function toScreen(g: Game, wx: number, wy: number): { x: number; y: number; s: number } {
  const r = g.canvas.getBoundingClientRect();
  const s = r.width / Math.max(1, g.w);
  return { x: r.left + wx * s, y: r.top + wy * s, s };
}

/** Pop the "Snickers" name tag; call positionTag() every frame while it's up. */
export function showNameTag(): void {
  try {
    const root = ensureLayer();
    if (!tag) {
      tag = document.createElement("div");
      tag.className = "snk-tag";
      const inner = document.createElement("span");
      inner.className = "snk-tag__in";
      inner.textContent = "Snickers";
      tag.appendChild(inner);
      root.appendChild(tag);
    }
    tag.hidden = false;
    tag.classList.remove("is-out", "is-in");
    // (Reading the size also restarts the pop animation.)
    tagW = tag.offsetWidth || tagW;
    tagH = tag.offsetHeight || tagH;
    tag.classList.add("is-in");
    tagUntil = performance.now() + TAG_MS;
    window.clearTimeout(tagOutTimer);
    tagOutTimer = window.setTimeout(hideTag, TAG_MS);
  } catch {
    // decoration only
  }
}

function hideTag(): void {
  if (!tag) return;
  tag.classList.remove("is-in");
  tag.classList.add("is-out");
  const t = tag;
  window.setTimeout(() => {
    if (performance.now() >= tagUntil - 5) t.hidden = true;
  }, 320);
}

/** Keep the tag floating at world point (wx, wy) = the bottom-center of the tag. */
export function positionTag(g: Game, wx: number, wy: number): void {
  if (!tag || tag.hidden) return;
  const p = toScreen(g, wx, wy);
  const w = tagW;
  const h = tagH;
  const margin = 4;
  const x = Math.max(margin + w / 2, Math.min(window.innerWidth - margin - w / 2, p.x));
  const y = Math.max(margin + h, p.y);
  tag.style.transform = `translate(${Math.round(x - w / 2)}px, ${Math.round(y - h)}px)`;
}

export function nameTagVisible(): boolean {
  return !!tag && !tag.hidden;
}

/** A "mlem" bubble flying off from world point (wx, wy). */
export function spawnMlem(g: Game, wx: number, wy: number, text: string, big = false): void {
  try {
    if (mlems >= MAX_MLEMS) return;
    const root = ensureLayer();
    const p = toScreen(g, wx, wy);
    const b = document.createElement("div");
    b.className = big ? "snk-mlem is-big" : "snk-mlem";
    b.textContent = text;
    b.style.left = `${Math.round(p.x)}px`;
    b.style.top = `${Math.round(p.y)}px`;
    b.style.setProperty("--dx", `${Math.round((Math.random() - 0.5) * 22)}px`);
    b.style.setProperty("--rot", `${Math.round((Math.random() - 0.5) * 16)}deg`);
    root.appendChild(b);
    mlems++;
    window.setTimeout(() => {
      b.remove();
      mlems = Math.max(0, mlems - 1);
    }, MLEM_MS + 60);
  } catch {
    // decoration only
  }
}
