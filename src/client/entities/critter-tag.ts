// Little parchment name tags ("Otto", "Milo") that pop up over a critter when you tap it, in the
// same style as Snickers' tag. Real DOM text, so it's crisp at any zoom. Everything lives in one
// pointer-events:none layer, so taps always reach the farm.
//
// Otto and Milo hang out nose to nose, so with both tags up (the best-friends secret is tapping
// both within two seconds) they'd overlap. The tag that popped later steps aside, up or sideways,
// whichever is the smaller move, and its little point slides along to keep pointing at its critter.

import type { Game } from "../engine/game";
import { uiRoot } from "../ui/dom";

const STYLE_ID = "cr-tag-style";
const TAG_MS = 2000;
/** Distance kept from the screen edges (CSS px). */
const MARGIN = 4;
/** Space between two tags that had to dodge each other (CSS px). */
const GAP = 2;

const CSS = `
#ui > .cr-tag-layer, .cr-tag-layer {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 4;
  contain: layout style;
}
.cr-tag {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  will-change: transform;
}
.cr-tag[hidden] { display: none; }
.cr-tag__in {
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
.cr-tag__in::after {
  content: "";
  position: absolute;
  left: calc(50% + var(--tip, 0px));
  bottom: calc(-1 * max(4px, calc(var(--px, 2px) * 2)));
  width: max(4px, calc(var(--px, 2px) * 2));
  height: max(4px, calc(var(--px, 2px) * 2));
  margin-left: calc(-0.5 * max(4px, calc(var(--px, 2px) * 2)));
  background: #fff4d8;
  border-right: max(1px, calc(var(--px, 2px) * 0.5)) solid #7a4e2a;
  border-bottom: max(1px, calc(var(--px, 2px) * 0.5)) solid #7a4e2a;
  transform: translateY(-50%) rotate(45deg);
}
.cr-tag.is-in .cr-tag__in { animation: cr-tag-pop 260ms cubic-bezier(0.2, 1.6, 0.4, 1) both; }
.cr-tag.is-out .cr-tag__in { animation: cr-tag-fade 300ms ease-in forwards; }
@keyframes cr-tag-pop {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes cr-tag-fade {
  to { opacity: 0; transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  .cr-tag.is-in .cr-tag__in { animation: none; }
}
`;

let layer: HTMLDivElement | null = null;

function ensureLayer(): HTMLDivElement {
  if (layer && layer.isConnected) return layer;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  layer = document.createElement("div");
  layer.className = "cr-tag-layer";
  layer.setAttribute("aria-hidden", "true");
  // `#ui > *` turns pointer events back on for overlays; inline wins so taps fall through.
  layer.style.pointerEvents = "none";
  uiRoot.appendChild(layer);
  return layer;
}

/** The canvas's screen rect, read once per frame however many tags are following. */
let rect: DOMRect | null = null;
let rectAt = -1;
function canvasRect(g: Game): DOMRect {
  if (!rect || rectAt !== g.time) {
    rect = g.canvas.getBoundingClientRect();
    rectAt = g.time;
  }
  return rect;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every tag, so a fresh pop can dodge the ones already up. */
const tags = new Set<NameTag>();
/** Pop order (a later pop dodges an earlier one, never the other way round, so they never trade places). */
let popSeq = 0;

/** One critter's name tag. show() on tap, follow() every frame (cheap while hidden). */
export class NameTag {
  private node: HTMLDivElement | null = null;
  private until = 0;
  private outTimer = 0;
  private order = 0;
  /** Size in CSS px, measured once per pop (so following never forces a layout). */
  private w = 44;
  private h = 20;
  /** Where follow() last pinned it, so a fresh pop lands in place (never a frame at 0,0). */
  private at: { g: Game; x: number; y: number } | null = null;
  /** Where it sits on screen right now (top-left, CSS px), for the other tags to dodge. */
  private box: Box | null = null;
  /** This pop's dodge offset. It's kept until the next pop, so the tag never jumps back mid-show. */
  private dx = 0;
  private dy = 0;
  /** How far the little point is slid off center (CSS px), as last written. */
  private tip = 0;

  constructor(private readonly name: string) {
    tags.add(this);
  }

  get visible(): boolean {
    return !!this.node && !this.node.hidden && this.node.isConnected;
  }

  show(): void {
    try {
      const root = ensureLayer();
      if (!this.node || this.node.parentNode !== root) {
        this.node?.remove();
        const tag = document.createElement("div");
        tag.className = "cr-tag";
        const inner = document.createElement("span");
        inner.className = "cr-tag__in";
        inner.textContent = this.name;
        tag.appendChild(inner);
        root.appendChild(tag);
        this.node = tag;
        this.tip = 0;
      }
      const tag = this.node;
      tag.hidden = false;
      tag.classList.remove("is-out", "is-in");
      // (Reading the size also restarts the pop animation.)
      this.w = tag.offsetWidth || this.w;
      this.h = tag.offsetHeight || this.h;
      tag.classList.add("is-in");
      this.order = ++popSeq;
      this.dx = 0;
      this.dy = 0;
      this.until = performance.now() + TAG_MS;
      window.clearTimeout(this.outTimer);
      this.outTimer = window.setTimeout(() => this.hide(), TAG_MS);
      if (this.at) this.follow(this.at.g, this.at.x, this.at.y);
    } catch {
      // decoration only
    }
  }

  private hide(): void {
    const tag = this.node;
    if (!tag) return;
    tag.classList.remove("is-in");
    tag.classList.add("is-out");
    window.setTimeout(() => {
      if (performance.now() >= this.until - 5) tag.hidden = true;
    }, 320);
  }

  /** An earlier tag that's up and would overlap this one at (x, y), if any. */
  private blocker(x: number, y: number): Box | null {
    for (const o of tags) {
      const b = o.box;
      if (o === this || !b || o.order > this.order || !o.visible) continue;
      if (x < b.x + b.w + GAP && x + this.w + GAP > b.x && y < b.y + b.h + GAP && y + this.h + GAP > b.y) return b;
    }
    return null;
  }

  /** Keep the tag floating with its bottom-center (its little point) at world point (wx, wy). */
  follow(g: Game, wx: number, wy: number): void {
    if (this.at) {
      this.at.g = g;
      this.at.x = wx;
      this.at.y = wy;
    } else this.at = { g, x: wx, y: wy };
    const tag = this.node;
    if (!tag || tag.hidden) return;
    try {
      const r = canvasRect(g);
      const s = r.width / Math.max(1, g.w);
      const px = r.left + wx * s;
      const py = r.top + wy * s;
      const w = this.w;
      const h = this.h;
      const clampX = (x: number) => Math.max(MARGIN, Math.min(window.innerWidth - MARGIN - w, x));
      const clampY = (y: number) => Math.max(MARGIN, y);
      // Centered over the head, kept on screen...
      const x0 = clampX(px - w / 2);
      const y0 = clampY(py - h);
      let x = clampX(x0 + this.dx);
      let y = clampY(y0 + this.dy);
      // ...unless it would cover a tag that popped first: then step up, or aside (away from it).
      const b = this.blocker(x, y);
      if (b) {
        const up = { x: x0, y: clampY(b.y - GAP - h) };
        const side = { x: clampX(px >= b.x + b.w / 2 ? b.x + b.w + GAP : b.x - GAP - w), y: y0 };
        const fits = (c: { x: number; y: number }) => !this.blocker(c.x, c.y);
        const upCost = y0 - up.y;
        const sideCost = Math.abs(side.x - x0);
        const pick = fits(side) && (!fits(up) || sideCost < upCost) ? side : up;
        x = pick.x;
        y = pick.y;
        this.dx = x - x0;
        this.dy = y - y0;
      }
      // The little point keeps pointing at the head, wherever the tag ended up.
      const tip = Math.round(Math.max(-(w / 2 - 5), Math.min(w / 2 - 5, px - (x + w / 2))));
      if (tip !== this.tip) {
        this.tip = tip;
        tag.style.setProperty("--tip", `${tip}px`);
      }
      tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      this.box = { x, y, w, h };
    } catch {
      // decoration only
    }
  }
}
