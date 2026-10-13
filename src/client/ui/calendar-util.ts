// Small helpers shared by the farm menus (calendar, barn, loom, shop, mailbox, farm sign).

import { currentGame } from "../engine/game";
import { has, sheet } from "../engine/sprites";
import { registerCalendarArt } from "./calendar-art";
import { frameIcon, spriteIcon } from "./dom";
import type { Sheep } from "../../shared/types";
import "./calendar-util.css";

/**
 * The farm's idea of "now". Uses the running game's clock when it's around, so the debug
 * URL params (?date=2026-12-24, ?time=21:30) move the billboard's "today" too.
 */
export function farmNow(): Date {
  try {
    const d = currentGame?.env.now;
    if (d instanceof Date && !Number.isNaN(d.getTime())) return new Date(d.getTime());
  } catch {
    // fall through
  }
  return new Date();
}

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago". */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "an hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const mo = Math.round(d / 30);
  return mo <= 1 ? "a month ago" : `${mo} months ago`;
}

/** A friendly message from whatever an API call threw. */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (!msg || /failed to fetch|networkerror|load failed/i.test(msg)) return "The farm is out of reach right now. Check your connection?";
  return msg;
}

/** Await an API call; if it fails, rethrow with a friendly message (dialog buttons show err.message). */
export async function friendly<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    throw new Error(errorText(err));
  }
}

/** Tiny sheep face for lists and calendar cells (woolly or sheared). */
export function sheepHead(sheared: boolean, opts: { scale?: number; golden?: boolean } = {}): HTMLElement {
  registerCalendarArt();
  const icon = spriteIcon(sheared ? "ui.sheephead.sheared" : "ui.sheephead", { scale: opts.scale ?? 1 });
  if (opts.golden) icon.classList.add("fm-golden");
  return icon;
}

/** A whole sheep (front idle frame) from the real sprite sheet (or a hand-drawn face if it's missing). */
export function sheepPortrait(s: Pick<Sheep, "shearedAt" | "golden">, opts: { scale?: number; frame?: number } = {}): HTMLElement {
  const key = s.shearedAt !== null ? "sheepSheared" : "sheep";
  if (!sheet(key)) return sheepHead(s.shearedAt !== null, { scale: 2 * (opts.scale ?? 1), golden: s.golden });
  const icon = frameIcon(key, opts.frame ?? 12, 32, 32, { scale: opts.scale ?? 1 });
  if (s.golden) icon.classList.add("fm-golden");
  return icon;
}

/** Category icon from the sheep-menus art, or nothing. (Small by default: it sits in meta lines.) */
export function categoryIcon(category: string, scale = 0.75): HTMLElement | null {
  const key = `ui.cat.${category}`;
  return has(key) ? spriteIcon(key, { scale }) : null;
}

/** localStorage that never throws (private mode, blocked storage). */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

// ---------- pieces of real sprite sheets, for CSS ----------

/** A copy of part of a loaded sheet as its own canvas (null if the sheet isn't loaded or is too small). */
export function sheetCrop(sheetKey: string, x: number, y: number, w: number, h: number): HTMLCanvasElement | null {
  const img = sheet(sheetKey);
  if (!img || img.width < x + w || img.height < y + h) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return c;
}

/** A canvas as a CSS url() value. */
export function cssUrl(c: HTMLCanvasElement): string {
  return `url("${c.toDataURL("image/png")}")`;
}

/** Put CSS custom properties on the document root (shared by every farm menu). */
export function setRootVars(vars: Record<string, string>): void {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
}
