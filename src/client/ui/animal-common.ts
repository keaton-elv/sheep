// Small helpers shared by the sheep menus (Buy a Sheep, the animal card, shearing, the flock list).

import { currentGame } from "../engine/game";
import { ApiError, store } from "../net";
import { daysBetween, seasonOf, type Season } from "../../shared/calendar";
import { LAMB_MS, type Sheep, type WeatherKind } from "../../shared/types";

export interface FarmMoment {
  now: Date;
  season: Season;
  isNight: boolean;
  weather: WeatherKind;
}

/**
 * The farm's "now" (honors the ?time= / ?date= / ?weather= debug params via the running Game),
 * with a plain wall-clock fallback.
 */
export function farmMoment(): FarmMoment {
  const g = currentGame;
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
    if (err.status === 401) return "Hmm... who goes there? Password again?";
    if (err.status >= 500) return "Something went wonky... try again in a moment?";
    return err.message;
  }
  if (err instanceof TypeError) return "No signal... is the internet napping?";
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Even the sheep aren't sure what...";
}

/** Same plan name, the way the server compares them for ORIGINAL PLAN (trimmed, any case). */
export function samePlanName(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** The plan's first name, if it has been renamed away from it since (else null). */
export function renamedFrom(s: Pick<Sheep, "name" | "originalName">): string | null {
  const original = (s.originalName ?? "").trim();
  return original && !samePlanName(s.name, original) ? original : null;
}

/** How many times it went back to its ORIGINAL PLAN, when that's the plan it's on now (else 0). */
export function originalStamps(s: Pick<Sheep, "name" | "originalName" | "originalReturns">): number {
  const n = Number(s.originalReturns) || 0;
  return n > 0 && samePlanName(s.name, s.originalName) ? n : 0;
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

/** "later today" / "tomorrow": when a lamb (bought less than a day ago) grows up. */
export function lambGrowsUp(s: Pick<Sheep, "createdAt">, now: Date): string {
  const days = daysBetween(now, new Date(s.createdAt + LAMB_MS));
  return days <= 0 ? "later today" : "tomorrow";
}

/**
 * A CSS px size for one art pixel in menus that lands on whole device pixels (crisp pixel art on
 * 3x phones too): the smallest whole number of device px that's at least `min` CSS px, capped at `max`.
 */
export function crispPx(min: number, max: number): string {
  const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  let dev = Math.ceil(min * dpr - 1e-6);
  if (dev / dpr > max) dev = Math.max(1, Math.floor(max * dpr + 1e-6));
  return `${dev / dpr}px`;
}
