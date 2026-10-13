// ORIGINAL PLAN: a big red rubber stamp slams onto the screen when a plan goes right back to its
// very first name and date. (They always change plans, then stick to the original.)
//
// Self-registering: importing this module subscribes to store.events, so an "original" event from
// either farmer stamps the screen. Local callers may also call showOriginalPlanStamp() straight
// from an API response (works with the live socket down); a repeat for the same plan within a few
// seconds is ignored, so the event and the response never stamp twice.

import "./stamp.css";
import { sfx } from "../audio";
import { serverNow, store } from "../net";
import { el, uiRoot } from "./dom";

/** How long the stamp stays fully inked, then how long it takes to fade. */
const HOLD_MS = 1600;
const FADE_MS = 450;
/** The slam lands this far into its animation (matches st-slam in stamp.css). */
const IMPACT_MS = 170;
const SHAKE_MS = 280;
/** The same plan stamped again within this window is the same moment (event + API response). */
const DEDUPE_MS = 4000;
/** Events older than this (a frozen phone socket catching up) don't stamp. */
const STALE_MS = 90_000;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

interface Live {
  root: HTMLElement;
  timers: number[];
  leaving: boolean;
}

let live: Live | null = null;
const recent = new Map<string, number>();

function reducedMotion(): boolean {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function keyOf(name: string | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

// ---------- ink ----------

/**
 * A mask that makes flat red look like rubber-stamp ink: uneven pressure across the face, dry
 * speckles where the ink didn't take, and a couple of scratches. Low-res on purpose, so the gaps
 * come out chunky like the rest of the farm. Returns a data URL, or "" if canvas isn't available.
 */
function inkTexture(w: number, h: number, specks: number): string {
  try {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";

    // Pressure: one side of the stamp always prints a bit lighter.
    const flip = Math.random() < 0.5;
    const g = ctx.createLinearGradient(flip ? 0 : w, 0, flip ? w : 0, h);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.6, "rgba(0,0,0,0.08)");
    g.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // A blotchy patch or two where the pad was dry.
    for (let i = 0; i < 2; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.max(w, h) * (0.12 + Math.random() * 0.14);
      const blot = ctx.createRadialGradient(x, y, 0, x, y, r);
      blot.addColorStop(0, "rgba(0,0,0,0.38)");
      blot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = blot;
      ctx.fillRect(0, 0, w, h);
    }

    // Speckles (denser toward the edges, like a real stamp's rim).
    ctx.fillStyle = "#000";
    for (let i = 0; i < specks; i++) {
      const edge = Math.random() < 0.45;
      let x = Math.random() * w;
      let y = Math.random() * h;
      if (edge) {
        if (Math.random() < 0.5) y = Math.random() < 0.5 ? Math.random() * 3 : h - Math.random() * 3;
        else x = Math.random() < 0.5 ? Math.random() * 3 : w - Math.random() * 3;
      }
      ctx.globalAlpha = 0.45 + Math.random() * 0.55;
      const s = Math.random() < 0.82 ? 1 : 2;
      ctx.fillRect(Math.floor(x), Math.floor(y), s, s);
    }

    // Scratches.
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000";
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 0.35 + Math.random() * 0.35;
      const x = Math.random() * w;
      const y = Math.random() * h;
      const len = w * (0.12 + Math.random() * 0.2);
      const a = (Math.random() - 0.5) * 0.9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
    return c.toDataURL("image/png");
  } catch {
    return "";
  }
}

function applyInk(node: HTMLElement, url: string): void {
  if (!url) return;
  const v = `url("${url}")`;
  node.style.setProperty("-webkit-mask-image", v);
  node.style.setProperty("mask-image", v);
}

let badgeInk = "";

// ---------- the big stamp ----------

function stampDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function shake(): void {
  const targets = [uiRoot, document.getElementById("farm")].filter((n): n is HTMLElement => !!n);
  for (const t of targets) {
    t.classList.remove("st-shake");
    void t.offsetWidth; // restart the animation
    t.classList.add("st-shake");
  }
  window.setTimeout(() => targets.forEach((t) => t.classList.remove("st-shake")), SHAKE_MS + 40);
}

function splatters(): HTMLElement[] {
  const out: HTMLElement[] = [];
  const n = 6 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    // Around the rim: pick a side, then a spot along it, a little outside the border.
    const side = Math.floor(Math.random() * 4);
    const along = 4 + Math.random() * 92;
    const off = -2 - Math.random() * 7; // % outside the rim
    const x = side === 0 || side === 2 ? along : side === 1 ? 100 - off : off;
    const y = side === 1 || side === 3 ? along : side === 2 ? 100 - off : off;
    const size = 1 + Math.floor(Math.random() * 3);
    out.push(
      el("span", {
        class: "st-splat",
        "aria-hidden": "true",
        style: `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--sz:${size};--d:${Math.round(Math.random() * 60)}ms`,
      }),
    );
  }
  return out;
}

function dismiss(fast = false): void {
  const cur = live;
  if (!cur || cur.leaving) return;
  cur.leaving = true;
  cur.timers.forEach((t) => clearTimeout(t));
  cur.root.classList.add("is-leaving");
  cur.root.style.setProperty("--st-fade", `${fast ? 180 : FADE_MS}ms`);
  // Timer-based removal: never leave a tap-blocking layer behind if animations are paused.
  window.setTimeout(() => {
    cur.root.remove();
    if (live === cur) live = null;
  }, (fast ? 180 : FADE_MS) + 40);
}

function removeNow(): void {
  const cur = live;
  if (!cur) return;
  cur.timers.forEach((t) => clearTimeout(t));
  cur.root.remove();
  live = null;
}

/**
 * Slam a big red ORIGINAL PLAN stamp onto the screen. Holds ~1.6s, then fades; tap (or Escape) to
 * dismiss. A second call for the same plan within a few seconds does nothing.
 */
export function showOriginalPlanStamp(sheepName?: string): void {
  try {
    const key = keyOf(sheepName);
    const now = Date.now();
    const last = recent.get(key);
    if (last !== undefined && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
    render(sheepName?.trim() ?? "");
  } catch (err) {
    console.warn("[stamp]", err);
  }
}

function render(name: string): void {
  removeNow();
  const calm = reducedMotion();

  const ink = el(
    "div",
    { class: "st-ink" },
    el("span", { class: "st-word st-word--top" }, "ORIGINAL"),
    el("span", { class: "st-band" }, el("span", { class: "st-band__rule" }), el("span", { class: "st-band__text" }, stampDate(new Date())), el("span", { class: "st-band__rule" })),
    el("span", { class: "st-word st-word--bottom" }, "PLAN"),
    name ? el("span", { class: "st-name" }, name) : null,
  );
  applyInk(ink, inkTexture(72, 48, 170));

  const stamp = el("div", { class: "st-stamp", "aria-hidden": "true" }, ink, ...(calm ? [] : splatters()));
  const root = el(
    "div",
    { class: `st-layer${calm ? " is-calm" : ""}`, role: "alert" },
    el("span", { class: "visually-hidden" }, name ? `ORIGINAL PLAN: ${name}` : "ORIGINAL PLAN"),
    el("div", { class: "st-tilt" }, stamp),
  );
  // Dismiss on the click itself, not pointerdown: hiding the layer on pointerdown would let the
  // same tap's click land on whatever is underneath (a card button, the farm).
  root.addEventListener("pointerdown", (ev) => ev.stopPropagation());
  root.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    dismiss(true);
  });

  const cur: Live = { root, timers: [], leaving: false };
  live = cur;
  document.body.appendChild(root);

  const impact = calm ? 0 : IMPACT_MS;
  cur.timers.push(
    window.setTimeout(() => {
      if (live !== cur || cur.leaving) return;
      sfx("thud", { pitch: 0.8 });
      if (!calm) shake();
      try {
        navigator.vibrate?.(30);
      } catch {
        // no haptics, no problem
      }
    }, impact),
    window.setTimeout(() => {
      if (live === cur && !cur.leaving) sfx("secret");
    }, impact + 160),
    window.setTimeout(() => dismiss(), impact + HOLD_MS),
  );
}

// Escape dismisses the stamp first (before it would close the dialog underneath).
addEventListener(
  "keydown",
  (ev) => {
    if (ev.key !== "Escape" || !live || live.leaving) return;
    ev.preventDefault();
    ev.stopPropagation();
    dismiss(true);
  },
  true,
);

// ---------- the little badge on a sheep's card ----------

/**
 * A tiny red "ORIGINAL PLAN" stamp for a sheep that's back on its original plan. No count: once
 * is all it takes. (`_count` is accepted and ignored, so older call sites keep working.)
 * `inline` = one line, for lists.
 */
export function originalPlanBadge(_count?: number, opts: { inline?: boolean } = {}): HTMLElement {
  const ink = opts.inline
    ? el("span", { class: "st-badge__ink" }, el("span", null, "ORIGINAL PLAN"))
    : el("span", { class: "st-badge__ink" }, el("span", { class: "st-badge__l" }, "ORIGINAL"), el("span", { class: "st-badge__l" }, "PLAN"));
  if (!badgeInk) badgeInk = inkTexture(40, 24, 46);
  applyInk(ink, badgeInk);
  return el(
    "span",
    {
      class: `st-badge${opts.inline ? " st-badge--inline" : ""}`,
      role: "img",
      "aria-label": "ORIGINAL PLAN",
      title: "Back on the original plan",
    },
    ink,
  );
}

// ---------- self-registration ----------

store.events.on(({ event }) => {
  try {
    if (event.kind !== "original") return;
    if (serverNow() - event.at > STALE_MS) return;
    showOriginalPlanStamp(event.subject);
  } catch (err) {
    console.warn("[stamp]", err);
  }
});

// Warm up the stamp font so the first slam isn't in a fallback face.
try {
  const warm = () => void document.fonts?.load('400 48px "Stamp Tiny5"').catch(() => {});
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (typeof idle === "function") idle.call(window, warm);
  else window.setTimeout(warm, 1500);
} catch {
  // fonts API missing: the fallback face is fine
}
