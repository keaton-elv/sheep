// Small anchored parchment popovers (the clock's stats card, the toolbar's "…" menu).
// Lighter than a dialog: no backdrop, closes on outside tap / Escape / resize.

import { sfx } from "../audio";
import { el, uiRoot } from "./dom";
import "./hud-popover.css";

export interface PopoverOptions {
  anchor: HTMLElement;
  content: Node;
  className?: string;
  /** "below-end": under the anchor, right-aligned. "above": over the anchor, centered on it. */
  placement: "below-end" | "above";
  label: string;
  /** Element that gets aria-expanded (defaults to the anchor). */
  expander?: HTMLElement;
  onClose?: () => void;
}

export interface PopoverHandle {
  root: HTMLElement;
  anchor: HTMLElement;
  close(silent?: boolean): void;
  reposition(): void;
}

let current: PopoverHandle | null = null;

export function currentPopover(): PopoverHandle | null {
  return current;
}

export function closePopover(silent = false): void {
  current?.close(silent);
}

/** Open (or, if this anchor's popover is already open, close) a popover. */
export function togglePopover(opts: PopoverOptions): PopoverHandle | null {
  if (current && current.anchor === opts.anchor) {
    current.close();
    return null;
  }
  return openPopover(opts);
}

export function openPopover(opts: PopoverOptions): PopoverHandle {
  current?.close(true);
  const root = el("div", { class: `sv-box hud-pop ${opts.className ?? ""}`, role: "dialog", "aria-label": opts.label, tabindex: "-1" }, opts.content);
  root.dataset.placement = opts.placement;
  uiRoot.appendChild(root);
  const expander = opts.expander ?? opts.anchor;
  expander.setAttribute("aria-expanded", "true");

  const reposition = () => {
    const r = opts.anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    root.style.maxWidth = `${Math.min(360, vw - margin * 2)}px`;
    const w = root.offsetWidth;
    if (opts.placement === "below-end") {
      root.style.top = `${Math.round(r.bottom + 6)}px`;
      root.style.left = `${Math.round(Math.max(margin, Math.min(vw - w - margin, r.right - w)))}px`;
      root.style.maxHeight = `${Math.max(120, vh - r.bottom - 18)}px`;
    } else {
      root.style.bottom = `${Math.round(vh - r.top + 6)}px`;
      root.style.left = `${Math.round(Math.max(margin, Math.min(vw - w - margin, r.left + r.width / 2 - w / 2)))}px`;
      root.style.maxHeight = `${Math.max(120, r.top - 18)}px`;
    }
  };

  const onDown = (ev: PointerEvent) => {
    const t = ev.target as Node | null;
    if (t && (root.contains(t) || opts.anchor.contains(t))) return;
    handle.close();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      handle.close();
      expander.focus();
    }
  };
  const onResize = () => handle.close(true);

  let closed = false;
  const handle: PopoverHandle = {
    root,
    anchor: opts.anchor,
    reposition,
    close(silent = false) {
      if (closed) return;
      closed = true;
      if (current === handle) current = null;
      expander.setAttribute("aria-expanded", "false");
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      removeEventListener("resize", onResize);
      root.classList.add("is-closing");
      setTimeout(() => root.remove(), 110);
      if (!silent) sfx("menuClose");
      opts.onClose?.();
    },
  };

  reposition();
  requestAnimationFrame(reposition);
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  addEventListener("resize", onResize);
  current = handle;
  sfx("menuOpen");
  return handle;
}
