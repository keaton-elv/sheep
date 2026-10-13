// Real-world dates dressed up as Stardew dates.

export type Season = "spring" | "summer" | "fall" | "winter";
export const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];

/** Northern-hemisphere meteorological seasons, close enough to Stardew's 4-season loop. */
export function seasonOf(d: Date): Season {
  const m = d.getMonth(); // 0 = Jan
  if (m >= 2 && m <= 4) return "spring";
  if (m >= 5 && m <= 7) return "summer";
  if (m >= 8 && m <= 10) return "fall";
  return "winter";
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DAY_ABBR = ["Sun.", "Mon.", "Tue.", "Wed.", "Thu.", "Fri.", "Sat."];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthName(monthIndex: number): string {
  return MONTHS[((monthIndex % 12) + 12) % 12]!;
}

/** "Mon. 12", like the date box under the Stardew clock. */
export function clockDateLabel(d: Date): string {
  return `${DAY_ABBR[d.getDay()]} ${d.getDate()}`;
}

/** Stardew's clock only ticks in 10-minute steps: "4:30 pm". */
export function clockTimeLabel(d: Date): string {
  const h24 = d.getHours();
  const m = Math.floor(d.getMinutes() / 10) * 10;
  const ampm = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

/** Local calendar day key "YYYY-MM-DD". */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" as a local date at noon (noon avoids DST edge weirdness). */
export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) || dayKey(d) !== key ? null : d;
}

export function isValidDayKey(key: string): boolean {
  return parseDayKey(key) !== null;
}

/**
 * Farm year, Stardew style: Year 1 starts when the farm was founded, and a new year
 * begins every time spring comes around (March 1st).
 */
export function farmYear(foundedAt: number, now: Date): number {
  const founded = new Date(foundedAt);
  let year = 1;
  for (let y = founded.getFullYear(); y <= now.getFullYear(); y++) {
    const springStart = new Date(y, 2, 1);
    if (springStart > founded && springStart <= now) year++;
  }
  return year;
}

/** "Fall 12, Year 1": a real date written the way Stardew writes dates. */
export function stardewDate(d: Date, foundedAt: number): string {
  return `${capitalize(seasonOf(d))} ${d.getDate()}, Year ${farmYear(foundedAt, d)}`;
}

/** Whole days between two local days (b - a). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}
