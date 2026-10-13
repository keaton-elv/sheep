// Name tags: tiny parchment pills with each sheep's plan, as real DOM text (crisp at any zoom)
// floating under the sheep. One container in #ui, positioned with transforms every frame.
//
// Every frame sheep.ts hands each tag where it would like to sit (just under the hooves), then
// layoutTags() makes the whole set readable on a small phone: tags stay inside the screen
// (notch-safe), slide out from under the clock and toolbar, and tags that collide nudge apart
// vertically (front-most sheep wins). A tag that's still almost completely covered fades out.

import type { Sheep } from "../../shared/types";
import { el, uiRoot } from "../ui/dom";
import "./sheep-tags.css";

export interface TagRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where tags may go, in CSS px relative to the tag layer. */
export interface TagBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Screen areas covered by the HUD (clock, toolbar): tags slide out from under them. */
  avoid: TagRect[];
}

/** Keep this far from the screen edges (CSS px). */
const EDGE = 4;
/** Gap kept between nudged tags. */
const GAP = 1;
/** Hide a tag when at least this much of it is still covered by a tag in front... */
const HIDE_COVERED = 0.6;
/** ...and only bring it back once it's clearly uncovered (no flicker at the threshold). */
const SHOW_COVERED = 0.4;
/** Stickers are rotated a few degrees: allow this much extra overhang (CSS px). */
const STICKER_SLACK = 2;

/** Same plan as the very first one (the server's rule: trimmed, case-insensitive). */
function sameName(a: unknown, b: unknown): boolean {
  return typeof a === "string" && typeof b === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Went back to its ORIGINAL PLAN (at least once) and is still on it. Safe on old server state. */
export function onOriginalPlan(s: Sheep): boolean {
  const returns: unknown = s.originalReturns;
  return typeof returns === "number" && returns > 0 && sameName(s.name, s.originalName);
}

let layer: HTMLDivElement | null = null;
const allTags = new Set<SheepTag>();
let layerW = 0;
let layerH = 0;
let insetL = 0;
let insetR = 0;
let insetB = 0;

function root(): HTMLDivElement {
  if (!layer) {
    layer = el("div", { class: "sheep-tags", "aria-hidden": "true" });
    // `#ui > *` re-enables pointer events on overlays; this layer covers the whole farm, so make
    // sure taps always fall through to the canvas (inline beats any stylesheet rule).
    layer.style.pointerEvents = "none";
    uiRoot.prepend(layer);
    try {
      // The pixel font arriving late changes every tag's width.
      document.fonts?.ready.then(() => markTagsDirty()).catch(() => {});
      document.fonts?.addEventListener?.("loadingdone", () => markTagsDirty());
    } catch {
      // no font loading API
    }
  }
  return layer;
}

export function setTagsVisible(on: boolean): void {
  root().hidden = !on;
  if (on) markTagsDirty();
}

export function tagsVisible(): boolean {
  return !root().hidden;
}

/** Re-measure the layer and every tag (call on resize: the tag font scales with --px). */
export function markTagsDirty(): void {
  layerW = 0;
  hudAt = -Infinity;
  for (const t of allTags) t.sizeDirty = true;
}

// ---------- the HUD's real footprint ----------

/** The DOM HUD pieces tags should stay out from under: the clock (+ wool box) and the toolbar. */
const HUD_SELECTORS = [".hud-clock", ".tb"] as const;
const HUD_EVERY_MS = 1000;
let hudAt = -Infinity;
const hudRects: TagRect[] = [];

/**
 * Where the clock and toolbar really are (CSS px, layer-relative), re-read about once a second
 * (cheap: done before this frame's tag writes). `fallbacks` (from the layout, same order:
 * clock, toolbar) cover a HUD piece that isn't in the DOM yet.
 */
export function hudAvoidRects(fallbacks: readonly TagRect[]): TagRect[] {
  const now = performance.now();
  if (now - hudAt < HUD_EVERY_MS && hudRects.length === fallbacks.length) return hudRects;
  hudAt = now;
  hudRects.length = fallbacks.length;
  let ox = 0;
  let oy = 0;
  try {
    const o = root().getBoundingClientRect();
    ox = o.left;
    oy = o.top;
  } catch {
    // keep 0,0
  }
  for (let i = 0; i < fallbacks.length; i++) {
    const out = hudRects[i] ?? (hudRects[i] = { x: 0, y: 0, w: 0, h: 0 });
    const fb = fallbacks[i]!;
    let r: DOMRect | null = null;
    try {
      const sel = HUD_SELECTORS[i];
      const node = sel ? document.querySelector(sel) : null;
      if (node) r = node.getBoundingClientRect();
    } catch {
      r = null;
    }
    if (r && r.width > 0 && r.height > 0) {
      out.x = r.left - ox;
      out.y = r.top - oy;
      out.w = r.width;
      out.h = r.height;
    } else {
      out.x = fb.x;
      out.y = fb.y;
      out.w = fb.w;
      out.h = fb.h;
    }
  }
  return hudRects;
}

function measureLayer(): void {
  const l = root();
  layerW = l.clientWidth || window.innerWidth;
  layerH = l.clientHeight || window.innerHeight;
  try {
    // The layer's padding is env(safe-area-inset-*) (see sheep-tags.css); absolutely positioned
    // tags ignore it, so it's only read here as the notch / home-bar insets.
    const cs = getComputedStyle(l);
    insetL = parseFloat(cs.paddingLeft) || 0;
    insetR = parseFloat(cs.paddingRight) || 0;
    insetB = parseFloat(cs.paddingBottom) || 0;
  } catch {
    insetL = insetR = insetB = 0;
  }
}

/** The layer's size and safe insets, for building TagBounds. */
export function tagViewport(): { w: number; h: number; left: number; right: number; bottom: number } {
  if (!layerW) measureLayer();
  return { w: layerW, h: layerH, left: insetL, right: insetR, bottom: insetB };
}

export class SheepTag {
  readonly el: HTMLDivElement;
  private readonly icon: HTMLSpanElement;
  private readonly name: HTMLSpanElement;
  private readonly done: HTMLSpanElement;
  private readonly lamb: HTMLSpanElement;
  private readonly og: HTMLSpanElement;
  private sig = "";
  private lastSheep: Sheep | null = null;
  private lastSheared = false;
  private lastLamb = false;
  private lastToday = "";

  /** Measured size in CSS px (re-measured when the text, style or font size changes). */
  sizeDirty = true;
  private w = 0;
  private h = 0;
  /** How far a corner sticker ("lamb" / "done!" / "ORIGINAL") pokes out left and right of the plate. */
  private overL = 0;
  private overR = 0;

  // What sheep.ts asked for this frame.
  private wantX = 0;
  private wantY = 0;
  private wantZ = 0;
  private wantOpacity = 0;
  private wantAsleep = false;

  // Layout results (smoothed).
  private nudge = 0;
  private covered = false;
  /** HUD dodge: the offset baseBox() wants this frame, and the smoothed one on screen. */
  private dodgeX = 0;
  private dodgeY = 0;
  private shownDodgeX = 0;
  private shownDodgeY = 0;
  private placedOnce = false;

  // What's on screen, to skip redundant style writes.
  private px = NaN;
  private py = NaN;
  private z = NaN;
  private opacity = -1;
  private asleep = false;

  constructor() {
    this.icon = el("span", { class: "sheep-tag__icon" });
    this.name = el("span", { class: "sheep-tag__name" });
    this.done = el("span", { class: "sheep-tag__sticker sheep-tag__done" }, "done!");
    this.lamb = el("span", { class: "sheep-tag__sticker sheep-tag__lamb" }, "lamb");
    this.og = el("span", { class: "sheep-tag__sticker sheep-tag__og" }, "ORIGINAL");
    this.og.addEventListener("animationend", () => this.og.classList.remove("is-fresh"));
    this.el = el("div", { class: "sheep-tag" }, this.icon, this.name);
    // Invisible until the first layout so it never flashes in the corner.
    this.el.style.opacity = "0";
    root().appendChild(this.el);
    allTags.add(this);
  }

  /** Refresh text and style from the sheep (cheap no-op when nothing changed). */
  update(s: Sheep, sheared: boolean, lamb: boolean, today: string): void {
    if (s === this.lastSheep && sheared === this.lastSheared && lamb === this.lastLamb && today === this.lastToday) return;
    this.lastSheep = s;
    this.lastSheared = sheared;
    this.lastLamb = lamb;
    this.lastToday = today;
    const isToday = !!s.date && s.date === today;
    const isLamb = lamb && !sheared;
    const isOg = onOriginalPlan(s);
    const sig = `${s.name}|${s.category}|${sheared}|${s.golden}|${isToday}|${isLamb}|${isOg}`;
    if (sig === this.sig) return;
    const firstTime = this.sig === "";
    this.sig = sig;
    this.name.textContent = s.name;
    this.el.title = s.name;
    this.el.dataset.cat = s.category;
    this.el.classList.toggle("is-done", sheared);
    this.el.classList.toggle("is-golden", s.golden);
    this.el.classList.toggle("is-today", isToday);
    this.el.classList.toggle("is-lamb", isLamb);
    this.el.classList.toggle("is-og", isOg);
    this.icon.className = sheared || s.golden ? "sheep-tag__icon" : "sheep-tag__dot";
    this.icon.textContent = sheared ? "✂" : s.golden ? "★" : "";
    if (sheared) this.el.appendChild(this.done);
    else this.done.remove();
    if (isLamb) this.el.appendChild(this.lamb);
    else this.lamb.remove();
    // The ORIGINAL PLAN stamp takes whichever top corner is free ("done!" sits top-right, "lamb"
    // top-left, and a sheep is never both; a short plate with two stickers widens, see the CSS).
    // Stamped on live (not on load): it thunks down.
    if (isOg) {
      if (!firstTime && this.og.parentNode !== this.el) {
        this.og.classList.add("is-fresh");
        // Backstop for animationend (it never fires while the tags are hidden or motion is reduced).
        window.setTimeout(() => this.og.classList.remove("is-fresh"), 2400);
      }
      this.og.classList.toggle("is-left", sheared);
      this.el.appendChild(this.og);
    } else {
      this.og.classList.remove("is-fresh");
      this.og.remove();
    }
    this.sizeDirty = true;
  }

  /** Where this tag would like to be (CSS px: centre x, top y), its stacking and fade. */
  target(x: number, y: number, z: number, opacity: number, asleep: boolean): void {
    this.wantX = x;
    this.wantY = y;
    this.wantZ = z;
    this.wantOpacity = opacity;
    this.wantAsleep = asleep;
  }

  /** Visible enough to take part in the layout. */
  get active(): boolean {
    return this.wantOpacity > 0.05;
  }

  get zIndex(): number {
    return this.wantZ;
  }

  /** Hidden last frame because a tag in front buries it. */
  get isCovered(): boolean {
    return this.covered;
  }

  measure(): void {
    if (!this.sizeDirty) return;
    this.sizeDirty = false;
    this.w = this.el.offsetWidth;
    this.h = this.el.offsetHeight;
    // Hidden layer (display: none) reports 0: try again next time.
    if (!this.w || !this.h) {
      this.sizeDirty = true;
      return;
    }
    // Stickers hang off the plate's corners; keep them on screen too.
    this.overL = 0;
    this.overR = 0;
    for (const s of [this.lamb, this.done, this.og]) {
      if (s.parentNode !== this.el) continue;
      const left = s.offsetLeft;
      const right = left + s.offsetWidth;
      if (left < 0) this.overL = Math.max(this.overL, Math.ceil(-left) + STICKER_SLACK);
      if (right > this.w) this.overR = Math.max(this.overR, Math.ceil(right - this.w) + STICKER_SLACK);
    }
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  /** The clamped box (before de-overlap nudging). */
  baseBox(b: TagBounds): TagRect {
    const w = this.w;
    const h = this.h;
    let x = this.wantX - w / 2;
    let y = this.wantY;
    // Never cut off at the screen edges (stickers included).
    const minX = b.left + this.overL;
    const maxX = Math.max(minX, b.right - w - this.overR);
    x = Math.min(Math.max(x, minX), maxX);
    y = Math.min(y, b.bottom - h);
    const x0 = x;
    const y0 = y;
    // Slide out from under the HUD the shortest way that stays on screen.
    for (const r of b.avoid) {
      if (x >= r.x + r.w || x + w <= r.x || y >= r.y + r.h || y + h <= r.y) continue;
      let bestX = x;
      let bestY = y;
      let bestD = Infinity;
      for (let i = 0; i < 4; i++) {
        // up, down, left, right
        const ox = i === 2 ? r.x - w - GAP : i === 3 ? r.x + r.w + GAP : x;
        const oy = i === 0 ? r.y - h - GAP : i === 1 ? r.y + r.h + GAP : y;
        if (ox < minX || ox > maxX || oy < b.top || oy > b.bottom - h) continue;
        const d = Math.abs(ox - x) + Math.abs(oy - y);
        if (d < bestD) {
          bestD = d;
          bestX = ox;
          bestY = oy;
        }
      }
      x = bestX;
      y = bestY;
    }
    this.dodgeX = x - x0;
    this.dodgeY = y - y0;
    return { x, y, w, h };
  }

  /** Apply the layout result: smoothed vertical nudge and HUD dodge, fade when covered. */
  apply(box: TagRect, nudgeTo: number, covered: boolean, dt: number, b: TagBounds): void {
    const k = Math.min(1, dt * 12);
    const ease = (from: number, to: number) => (Math.abs(to - from) < 0.5 ? to : from + (to - from) * k);
    this.nudge = ease(this.nudge, nudgeTo);
    // Glide out from under the clock / toolbar rather than jumping (a fresh tag starts in place).
    if (!this.placedOnce) {
      this.shownDodgeX = this.dodgeX;
      this.shownDodgeY = this.dodgeY;
      this.placedOnce = true;
    } else {
      this.shownDodgeX = ease(this.shownDodgeX, this.dodgeX);
      this.shownDodgeY = ease(this.shownDodgeY, this.dodgeY);
    }
    this.covered = covered;
    const x = box.x - this.dodgeX + this.shownDodgeX;
    const top = Math.min(Math.max(box.y - this.dodgeY + this.shownDodgeY + this.nudge, b.top), b.bottom - box.h);
    this.write(x, top, this.covered ? 0 : this.wantOpacity);
  }

  /** Not laid out this frame (hidden / waiting in the barn). */
  park(): void {
    this.nudge = 0;
    this.covered = false;
    this.placedOnce = false;
    this.write(this.px, this.py, this.wantOpacity);
  }

  private write(x: number, y: number, opacity: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (Number.isFinite(rx) && Number.isFinite(ry) && (rx !== this.px || ry !== this.py)) {
      this.px = rx;
      this.py = ry;
      this.el.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    }
    const rz = Math.round(this.wantZ);
    if (rz !== this.z) {
      this.z = rz;
      this.el.style.zIndex = String(rz);
    }
    const o = Math.round(opacity * 20) / 20;
    if (o !== this.opacity) {
      this.opacity = o;
      this.el.style.opacity = String(o);
    }
    if (this.wantAsleep !== this.asleep) {
      this.asleep = this.wantAsleep;
      this.el.classList.toggle("is-asleep", this.asleep);
    }
  }

  remove(): void {
    this.el.remove();
    allTags.delete(this);
  }
}

function overlapArea(a: TagRect, b: TagRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function hitsAny(r: TagRect, placed: readonly TagRect[], count: number): boolean {
  for (let i = 0; i < count; i++) if (overlapArea(r, placed[i]!) > 0) return true;
  return false;
}

// Scratch arrays reused every frame (no per-frame allocation beyond the boxes).
const order: SheepTag[] = [];
const placed: TagRect[] = [];
const candidates: number[] = [];

/**
 * Lay out every tag for this frame: clamp to the screen, dodge the HUD, de-overlap.
 * Front-most sheep (highest z) keep their spot; the ones behind nudge up or down a little.
 */
export function layoutTags(tags: readonly SheepTag[], bounds: TagBounds, dt: number): void {
  order.length = 0;
  // All the (rare) measuring first, before any style writes, so it costs at most one reflow.
  for (const t of tags) {
    if (!t.active) continue;
    t.measure();
    order.push(t);
  }
  for (const t of tags) if (!t.active) t.park();
  order.sort((a, b) => b.zIndex - a.zIndex);
  let n = 0;
  for (const t of order) {
    const box = t.baseBox(bounds);
    const maxNudge = Math.max(6, box.h * 1.1);
    candidates.length = 0;
    candidates.push(0);
    for (let i = 0; i < n; i++) {
      const p = placed[i]!;
      if (box.x >= p.x + p.w || box.x + box.w <= p.x) continue;
      candidates.push(p.y + p.h + GAP - box.y, p.y - GAP - (box.y + box.h));
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b));
    let dy: number | null = null;
    const probe: TagRect = { x: box.x, y: box.y, w: box.w, h: box.h };
    for (const c of candidates) {
      if (Math.abs(c) > maxNudge) break;
      probe.y = box.y + c;
      if (probe.y < bounds.top || probe.y + probe.h > bounds.bottom) continue;
      if (c !== 0 && hitsAny(probe, bounds.avoid, bounds.avoid.length)) continue;
      if (!hitsAny(probe, placed, n)) {
        dy = c;
        break;
      }
    }
    let covered = false;
    if (dy === null) {
      // No room nearby: stay put (the front tag draws on top), unless it's buried.
      dy = 0;
      let worst = 0;
      for (let i = 0; i < n; i++) worst = Math.max(worst, overlapArea(box, placed[i]!));
      const limit = t.isCovered ? SHOW_COVERED : HIDE_COVERED;
      covered = box.w * box.h > 0 && worst / (box.w * box.h) >= limit;
    }
    t.apply(box, dy, covered, dt, bounds);
    if (!covered) {
      const r = placed[n] ?? (placed[n] = { x: 0, y: 0, w: 0, h: 0 });
      r.x = box.x;
      r.y = box.y + dy;
      r.w = box.w;
      r.h = box.h;
      n++;
    }
  }
}

/** Bounds helper: the whole layer minus a margin and the safe-area insets. */
export function screenBounds(avoid: TagRect[]): TagBounds {
  const v = tagViewport();
  return {
    left: v.left + EDGE,
    right: v.w - v.right - EDGE,
    top: EDGE,
    bottom: v.h - v.bottom - EDGE,
    avoid,
  };
}
