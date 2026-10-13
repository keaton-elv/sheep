// Stardew festivals pinned to real dates (little flags on the billboard), plus the real Bay Area
// days you two might actually go to (a little Golden Gate instead of a flag).

import { daysBetween } from "../../shared/calendar";

export interface Festival {
  name: string;
  note: string;
  /** Farm days (founding, anniversaries) get the gold star instead of a festival flag. */
  star?: boolean;
  /** A real San Francisco day: gets the little Golden Gate instead of a festival flag. */
  sf?: boolean;
}

const FIXED: Record<string, Festival> = {
  "01-08": { name: "Festival of Ice", note: "Ice fishing contest and snow sculptures. Bundle up!" },
  "01-12": { name: "SquidFest", note: "Squid fishing at the beach. Bring warm socks and bait." },
  "01-13": { name: "SquidFest", note: "Last day to catch the biggest squid of the winter." },
  "02-14": { name: "Bouquet Day", note: "In the valley, handing someone a bouquet means you're sweethearts." },
  "04-15": { name: "Desert Festival", note: "A party in the Calico Desert! Food stalls, races, makeovers." },
  "04-16": { name: "Desert Festival", note: "Place a bet on the snail races. Totally not rigged." },
  "04-17": { name: "Desert Festival", note: "Last day! Grab a makeover before the bus leaves." },
  "05-24": { name: "Flower Dance", note: "Ask your sweetheart to dance in Cindersap Forest." },
  "07-11": { name: "Luau", note: "Everyone adds something to the potluck soup. Choose wisely!" },
  "07-20": { name: "Trout Derby", note: "Rainbow trout season at the river. Golden tags are lucky!" },
  "07-21": { name: "Trout Derby", note: "Last day of the derby. One more cast..." },
  "08-28": { name: "Dance of the Moonlight Jellies", note: "Watch the glowing jellies drift by from the docks." },
  "10-16": { name: "Stardew Valley Fair", note: "Grange displays, the Strength Game, and star tokens!" },
  "10-31": { name: "Spirit's Eve", note: "Find the golden pumpkin in the haunted maze." },
  "12-15": { name: "Night Market", note: "Submarine rides and a mermaid show on the beach." },
  "12-16": { name: "Night Market", note: "The mermaid show is still going. Bring a coffee." },
  "12-17": { name: "Night Market", note: "Last night of the market! Don't miss the boats." },
  "12-25": { name: "Feast of the Winter Star", note: "Secret gift exchange. Who drew who?" },
};

/** Western Easter (anonymous Gregorian algorithm). Month is 0-based. */
function easter(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

// ---------- Bay Area days ----------

/** Day of the month of the nth (1-based) Sunday of a month (0-based). */
function nthSunday(year: number, month: number, n: number): number {
  const first = new Date(year, month, 1, 12).getDay(); // 0 = Sunday
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

function lastSunday(year: number, month: number): number {
  const last = new Date(year, month + 1, 0, 12);
  return last.getDate() - last.getDay();
}

/** Is `d` on the Fri–Sun weekend that ends on that Sunday? (The Friday may fall in the month before.) */
function onWeekendEnding(d: Date, year: number, month: number, sunday: number): boolean {
  const gap = daysBetween(d, new Date(year, month, sunday, 12));
  return gap >= 0 && gap <= 2;
}

/** Lunar New Year: [month (0-based), day, animal]. */
const LUNAR_NEW_YEAR: Record<number, readonly [number, number, string]> = {
  2026: [1, 17, "Horse"],
  2027: [1, 6, "Sheep"],
  2028: [0, 26, "Monkey"],
  2029: [1, 13, "Rooster"],
  2030: [1, 3, "Dog"],
  2031: [0, 23, "Pig"],
  2032: [1, 11, "Rat"],
  2033: [0, 31, "Ox"],
};

function bayArea(d: Date): Festival | null {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  if (m === 4 && day === nthSunday(y, 4, 3)) {
    return { name: "Bay to Breakers", note: "Twelve kilometers of costumes, Bay to Ocean Beach. Running optional.", sf: true };
  }
  if (m === 5 && day === lastSunday(y, 5)) return { name: "SF Pride", note: "The parade down Market Street. Rainbows everywhere!", sf: true };
  if (onWeekendEnding(d, y, 7, nthSunday(y, 7, 2))) {
    return { name: "Outside Lands", note: "Music in Golden Gate Park. Bring a jacket: it's August in San Francisco.", sf: true };
  }
  if (onWeekendEnding(d, y, 9, nthSunday(y, 9, 1))) {
    return { name: "Hardly Strictly Bluegrass", note: "Free banjos in Golden Gate Park. Bring a blanket.", sf: true };
  }
  if (onWeekendEnding(d, y, 9, nthSunday(y, 9, 2))) return { name: "Fleet Week", note: "Blue Angels over the Bay. Snickers is under the bed.", sf: true };
  if (m === 10 && day === 2) return { name: "Día de los Muertos", note: "Marigolds, candles and the procession through the Mission.", sf: true };
  const lny = LUNAR_NEW_YEAR[y];
  if (lny && lny[0] === m && lny[1] === day) {
    const note = lny[2] === "Sheep" ? "Year of the Sheep! (Some say Goat. The sheep disagree.)" : `Year of the ${lny[2]}! The Chinatown parade is coming.`;
    return { name: "Lunar New Year", note, sf: true };
  }
  return null;
}

// ---------- lookup ----------

/** Everything on a given local day: farm days first, then the Bay Area, then the valley's festivals. */
export function festivalsOn(d: Date, foundedAt?: number): Festival[] {
  const out: Festival[] = [];
  if (foundedAt) {
    const f = new Date(foundedAt);
    const years = d.getFullYear() - f.getFullYear();
    if (years > 0 && f.getMonth() === d.getMonth() && f.getDate() === d.getDate()) {
      out.push({ name: "Farm Anniversary", note: `${years} ${years === 1 ? "year" : "years"} of sheep! Time for cake.`, star: true });
    } else if (daysBetween(f, d) === 0) out.push({ name: "Farm Founding Day", note: "Where it all began...", star: true });
  }
  const sf = bayArea(d);
  if (sf) out.push(sf);
  const e = easter(d.getFullYear());
  if (e.month === d.getMonth() && e.day === d.getDate()) {
    out.push({ name: "Egg Festival", note: "Egg hunt in the town square! Bring a basket." });
  }
  const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const fixed = FIXED[key];
  if (fixed) out.push(fixed);
  return out;
}

/** The day's main festival (or farm anniversary), if any. */
export function festivalOn(d: Date, foundedAt?: number): Festival | null {
  return festivalsOn(d, foundedAt)[0] ?? null;
}
