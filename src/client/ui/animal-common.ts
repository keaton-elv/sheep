// Small helpers shared by the sheep menus (Marnie, the animal card, shearing).

import type { Game } from "../engine/game";
import { drawFrame, sheet, spriteCanvas } from "../engine/sprites";
import { ApiError, store } from "../net";
import { seasonOf, type Season } from "../../shared/calendar";
import type { WeatherKind } from "../../shared/types";

export interface FarmMoment {
  now: Date;
  season: Season;
  isNight: boolean;
  weather: WeatherKind;
}

/**
 * The farm's "now" (honors the ?time= / ?date= / ?weather= debug params via the running Game,
 * which main.ts exposes as window.__farm), with a plain wall-clock fallback.
 */
export function farmMoment(): FarmMoment {
  const g = (window as unknown as { __farm?: Game }).__farm;
  if (g?.env) {
    const { now, season, isNight, weather } = g.env;
    return { now, season, isNight, weather };
  }
  const now = new Date();
  const h = now.getHours();
  return { now, season: seasonOf(now), isNight: h >= 20 || h < 6, weather: store.weather?.kind ?? "sunny" };
}

/** Turn any thrown thing into a short, kind sentence for the farmers. */
export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "The farm forgot who you are. Enter the password again?";
    if (err.status >= 500) return "Something went wonky at the farmhouse. Try again in a moment?";
    return err.message;
  }
  if (err instanceof TypeError) return "Couldn't reach the farm. Is the internet napping? Try again in a sec.";
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Even the Wizard isn't sure what.";
}

/** "Sat, Oct 18" — the real calendar date, so nobody has to decode Stardew seasons. */
export function realDateLabel(d: Date, withYear = false): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  if (withYear) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

/** Only ever render http(s) links (the server enforces this too). */
export function safeLink(link: string): URL | null {
  if (!link) return null;
  try {
    const u = new URL(link);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Accepts "example.com/x" as well as full URLs. Returns an error message or null. */
export function checkLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "Links must start with http or https.";
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return "That link doesn't look like a web address.";
    return null;
  } catch {
    return "That link doesn't look like a web address.";
  }
}

export function hostLabel(u: URL): string {
  return u.hostname.replace(/^www\./, "");
}

// ---------- sheep sprites for the DOM ----------

const SHEEP_FRAME = 32;
const frameCache = new Map<string, HTMLCanvasElement>();

/** Warm gold recolor for golden sheep; leaves the soft shadow (semi-transparent pixels) alone. */
function goldify(c: HTMLCanvasElement): void {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, c.width, c.height);
  } catch {
    return;
  }
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 200) continue;
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    d[i] = Math.min(255, r * 1.02 + 34);
    d[i + 1] = Math.min(255, g * 0.86 + 16);
    d[i + 2] = Math.min(255, b * 0.42);
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * One 32x32 frame of the sheep (or sheared sheep) sheet as a cached canvas, golden-tinted if
 * asked. Falls back to the little hand-drawn "ui.sheep" icon if the sheet didn't load.
 */
export function sheepFrame(sheared: boolean, index: number, golden: boolean): HTMLCanvasElement {
  const sheetKey = sheared ? "sheepSheared" : "sheep";
  const key = `${sheetKey}:${index}:${golden ? 1 : 0}`;
  let c = frameCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = SHEEP_FRAME;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (sheet(sheetKey)) {
    drawFrame(ctx, sheetKey, index, SHEEP_FRAME, SHEEP_FRAME, 0, 0);
  } else {
    const icon = spriteCanvas("ui.sheep", 1);
    ctx.drawImage(icon, Math.round((SHEEP_FRAME - icon.width) / 2), SHEEP_FRAME - icon.height - 4);
  }
  if (golden) goldify(c);
  frameCache.set(key, c);
  return c;
}

/** Sheep sheet frame indices (see the brief): idle front, asleep, idle side, graze 16-19. */
export const FRAME = { idleFront: 12, asleep: 13, idleSide: 14, graze: [16, 17, 18, 19] } as const;
