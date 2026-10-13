// Small helpers shared by the farm menus (calendar, barn, loom, shop, mailbox, farm sign).

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
    const g = (window as unknown as { __farm?: { now?: () => Date } }).__farm;
    const d = g?.now?.();
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
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

/**
 * dom.ts's typewriter keeps typing (and blipping!) after its dialog closes, e.g. when you hit
 * Buy while Robin is mid-sentence. It finishes instantly on a pointerdown on the dialog box,
 * so send one of those on close. (Plain Event: doesn't bubble, so the backdrop never sees it.)
 */
export function hushTypewriter(d: { box: HTMLElement }): void {
  try {
    d.box.dispatchEvent(new Event("pointerdown"));
  } catch {
    // ignore
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
