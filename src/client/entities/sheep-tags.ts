// Name tags: tiny parchment pills with each sheep's plan, as real DOM text (crisp at any zoom)
// floating under the sheep. One container in #ui, positioned with transforms every frame.

import type { Sheep } from "../../shared/types";
import { el, uiRoot } from "../ui/dom";
import "./sheep-tags.css";

let layer: HTMLDivElement | null = null;

function root(): HTMLDivElement {
  if (!layer) {
    layer = el("div", { class: "sheep-tags", "aria-hidden": "true" });
    // `#ui > *` re-enables pointer events on overlays; this layer covers the whole farm, so make
    // sure taps always fall through to the canvas (inline beats any stylesheet rule).
    layer.style.pointerEvents = "none";
    uiRoot.prepend(layer);
  }
  return layer;
}

export function setTagsVisible(on: boolean): void {
  root().hidden = !on;
}

export function tagsVisible(): boolean {
  return !root().hidden;
}

export class SheepTag {
  readonly el: HTMLDivElement;
  private readonly icon: HTMLSpanElement;
  private readonly name: HTMLSpanElement;
  private readonly done: HTMLSpanElement;
  private sig = "";
  private lastSheep: Sheep | null = null;
  private lastSheared = false;
  private lastToday = "";
  private px = NaN;
  private py = NaN;
  private z = NaN;
  private opacity = 0;
  private asleep = false;

  constructor() {
    this.icon = el("span", { class: "sheep-tag__icon" });
    this.name = el("span", { class: "sheep-tag__name" });
    this.done = el("span", { class: "sheep-tag__done" }, "done!");
    this.el = el("div", { class: "sheep-tag" }, this.icon, this.name);
    // Invisible until the first place() so it never flashes in the corner.
    this.el.style.opacity = "0";
    root().appendChild(this.el);
  }

  /** Refresh text and style from the sheep (cheap no-op when nothing changed). */
  update(s: Sheep, sheared: boolean, today: string): void {
    if (s === this.lastSheep && sheared === this.lastSheared && today === this.lastToday) return;
    this.lastSheep = s;
    this.lastSheared = sheared;
    this.lastToday = today;
    const isToday = !!s.date && s.date === today;
    const sig = `${s.name}|${s.category}|${sheared}|${s.golden}|${isToday}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.name.textContent = s.name;
    this.el.title = s.name;
    this.el.dataset.cat = s.category;
    this.el.classList.toggle("is-done", sheared);
    this.el.classList.toggle("is-golden", s.golden);
    this.el.classList.toggle("is-today", isToday);
    this.icon.className = sheared || s.golden ? "sheep-tag__icon" : "sheep-tag__dot";
    this.icon.textContent = sheared ? "✂" : s.golden ? "★" : "";
    if (sheared) this.el.appendChild(this.done);
    else this.done.remove();
  }

  /** Position (CSS px, top-center of the tag), stacking and fade. */
  place(x: number, y: number, z: number, opacity: number, asleep: boolean): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== this.px || ry !== this.py) {
      this.px = rx;
      this.py = ry;
      this.el.style.transform = `translate(${rx}px, ${ry}px) translateX(-50%)`;
    }
    const rz = Math.round(z);
    if (rz !== this.z) {
      this.z = rz;
      this.el.style.zIndex = String(rz);
    }
    const o = Math.round(opacity * 20) / 20;
    if (o !== this.opacity) {
      this.opacity = o;
      this.el.style.opacity = String(o);
    }
    if (asleep !== this.asleep) {
      this.asleep = asleep;
      this.el.classList.toggle("is-asleep", asleep);
    }
  }

  remove(): void {
    this.el.remove();
  }
}
