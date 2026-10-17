// The billboard's special days, all computed per year (no table to update, except Lunar New Year):
//  - real days you two might celebrate or go to (a little Golden Gate on the Bay Area ones), and
//  - the valley's days only when something really happens on the farm: the jack-o'-lantern on
//    Spirit's Eve, snow and a gift on the Winter Star, the bouquet on Valentine's Day, berries on
//    the bushes, the golden ginkgo in fall, extra shooting stars during meteor showers.
//
// Shared: the HUD clock shows festivalOn()'s icon, and the new-day banner looks up the Bay Area
// days by name ("Bay to Breakers", "Fleet Week", "Outside Lands", "Hardly Strictly Bluegrass").

import { daysBetween } from "../../shared/calendar";

export interface Festival {
  name: string;
  note: string;
  /** Farm days (founding, anniversaries) get the gold star instead of a festival flag. */
  star?: boolean;
  /** A real San Francisco day: gets the little Golden Gate instead of a festival flag. */
  sf?: boolean;
  /** A sweetheart day (the clock can show the heart, like farm days). */
  heart?: boolean;
  /** What actually shows up on the farm that day (a sprite key), drawn instead of the flag. */
  icon?: string;
  /** How it shows on the billboard grid: the flag (default), a small dot, or only in the day panel. */
  mark?: "flag" | "dot" | "none";
  /** Small stuff (clocks, berries, the middle of a long fair): never the clock's festival of the day. */
  quiet?: boolean;
  /** Dot color for small stuff. */
  tint?: string;
}

// ---------- date rules ----------

const at = (y: number, m: number, d: number): Date => new Date(y, m, d, 12);
const on = (d: Date, m: number, day: number): boolean => d.getMonth() === m && d.getDate() === day;

/** Day of the month of the nth (1-based) `weekday` (0 = Sunday) of a month (0-based). */
function nth(y: number, m: number, weekday: number, n: number): number {
  return 1 + ((weekday - at(y, m, 1).getDay() + 7) % 7) + (n - 1) * 7;
}

/** Day of the month of the last `weekday` (0 = Sunday) of a month (0-based). */
function last(y: number, m: number, weekday: number): number {
  const end = at(y, m + 1, 0);
  return end.getDate() - ((end.getDay() - weekday + 7) % 7);
}

/** Which day (0-based) of a `len`-day run starting on `start` is `d`? -1 if it isn't in it. */
function dayOf(d: Date, start: Date, len: number): number {
  const i = daysBetween(start, d);
  return i >= 0 && i < len ? i : -1;
}

/** Day of the Fri–Sun weekend ending on that Sunday (the Friday may fall in the month before). */
function weekend(d: Date, y: number, m: number, sunday: number): number {
  return dayOf(d, at(y, m, sunday - 2), 3);
}

/** Day i of a multi-day event: the flag on its first day, a dot after that. */
function run(f: Festival, i: number, later: Partial<Festival> = {}): Festival | null {
  if (i < 0) return null;
  return i === 0 ? f : { ...f, mark: "dot", ...later };
}

/** Lunar New Year: [month (0-based), day, animal]. */
const LUNAR_NEW_YEAR: Record<number, readonly [number, number, string]> = {
  2024: [1, 10, "Dragon"],
  2025: [0, 29, "Snake"],
  2026: [1, 17, "Horse"],
  2027: [1, 6, "Sheep"],
  2028: [0, 26, "Monkey"],
  2029: [1, 13, "Rooster"],
  2030: [1, 3, "Dog"],
  2031: [0, 23, "Pig"],
  2032: [1, 11, "Rat"],
  2033: [0, 31, "Ox"],
  2034: [1, 19, "Tiger"],
  2035: [1, 8, "Rabbit"],
};

/** Chinatown's night parade: the first Saturday at least 13 days after Lunar New Year (close enough). */
function lunarParade(y: number): Date | null {
  const lny = LUNAR_NEW_YEAR[y];
  if (!lny) return null;
  const earliest = at(y, lny[0], lny[1] + 13);
  return at(y, earliest.getMonth(), earliest.getDate() + ((6 - earliest.getDay() + 7) % 7));
}

// Kept in step with the farm: berries in world-nature.ts, meteor showers in critter-star.ts.
const SALMONBERRY: Festival = {
  name: "Salmonberry season",
  note: "The bushes are full. Give one a shake.",
  icon: "item.forage.salmonberry",
  mark: "dot",
  quiet: true,
  tint: "#e8743c",
};
const BLACKBERRY: Festival = {
  name: "Blackberry season",
  note: "Ripe on the bushes. Pick them before the birds do.",
  icon: "item.forage.blackberry",
  mark: "dot",
  quiet: true,
  tint: "#5a2a6e",
};
// Fall's first day: one of the farm's trees turns into the golden ginkgo until winter (world-nature.ts).
const GINKGO: Festival = {
  name: "Ginkgo gold",
  note: "One of the farm's trees turns ginkgo gold for the fall.",
  icon: "weather.leaf.ginkgo.0",
  mark: "dot",
  quiet: true,
  tint: "#e9ab2f",
};
const METEORS = { mark: "dot", quiet: true, tint: "#e8c23a" } as const;

type Rule = (d: Date, y: number) => Festival | null;

const RULES: Rule[] = [
  (d) => (on(d, 0, 1) ? { name: "New Year's Day", note: "The sheep are all one year older, which for sheep is also one year." } : null),
  (d, y) => {
    const lny = LUNAR_NEW_YEAR[y];
    if (!lny || !on(d, lny[0], lny[1])) return null;
    const note = lny[2] === "Sheep" ? "Year of the Sheep! (Some say Goat. The sheep disagree.)" : `Year of the ${lny[2]}!`;
    return { name: "Lunar New Year", note };
  },
  (d, y) => {
    const p = lunarParade(y);
    return p && daysBetween(p, d) === 0
      ? { name: "Lunar New Year Parade", note: "A very long golden dragon winds through Chinatown. Firecrackers!", sf: true }
      : null;
  },
  (d) =>
    on(d, 1, 14)
      ? { name: "Valentine's Day", note: "A bouquet by the mailbox. In the valley, that means sweethearts.", heart: true, icon: "item.bouquet" }
      : null,
  (d, y) => (on(d, 2, nth(y, 2, 0, 2)) ? { name: "Spring forward", note: "Clocks jump an hour ahead. The sheep are confused.", mark: "dot", quiet: true } : null),
  (d) => (d.getMonth() >= 2 && d.getMonth() <= 4 && d.getDate() >= 15 && d.getDate() <= 18 ? SALMONBERRY : null),
  (d, y) => {
    // Two weekends in Japantown: the 2nd and 3rd Saturday–Sunday of April.
    const i = dayOf(d, at(y, 3, nth(y, 3, 6, 2)), 9);
    if (i < 0 || (i > 1 && i < 7)) return null;
    const f: Festival = { name: "Cherry Blossom Festival", note: "Japantown in bloom: taiko, mochi and paper lanterns.", sf: true };
    if (i === 8) return { ...f, mark: "dot", note: "Grand Parade day, from Civic Center to Japantown." };
    return i === 0 || i === 7 ? f : { ...f, mark: "dot" };
  },
  (d) => (on(d, 3, 22) ? { name: "Earth Day", note: "So far, Earth is the only planet with sheep on it." } : null),
  (d, y) =>
    on(d, 4, nth(y, 4, 0, 3))
      ? { name: "Bay to Breakers", note: "Twelve kilometers of costumes, Bay to Ocean Beach.", sf: true }
      : null,
  (d, y) => {
    // Memorial Day weekend, Saturday and Sunday.
    const i = dayOf(d, at(y, 4, last(y, 4, 1) - 2), 2);
    return run({ name: "Carnaval", note: "Samba, feathers and a big parade in the Mission.", sf: true }, i);
  },
  (d) => (on(d, 5, 19) ? { name: "Juneteenth", note: "Freedom Day. Music and barbecue in the Fillmore." } : null),
  (d, y) => (on(d, 5, last(y, 5, 0)) ? { name: "SF Pride", note: "The parade down Market Street. Rainbows everywhere!", sf: true } : null),
  (d) => (on(d, 6, 4) ? { name: "Fourth of July", note: "Fireworks over the Bay... somewhere behind Karl the Fog." } : null),
  (d, y) =>
    run(
      { name: "Outside Lands", note: "Music in Golden Gate Park. Bring a jacket: it's August in San Francisco.", sf: true },
      weekend(d, y, 7, nth(y, 7, 0, 2)),
    ),
  (d) =>
    d.getMonth() === 7 && d.getDate() >= 11 && d.getDate() <= 13
      ? { name: "Perseids", note: "Meteor shower! More shooting stars over the farm tonight, Karl the Fog permitting.", ...METEORS }
      : null,
  (d, y) => {
    // Puyallup, one town over from Sumner: the Friday before Labor Day through three Sundays later.
    const len = 24;
    const i = dayOf(d, at(y, 8, nth(y, 8, 1, 1) - 3), len);
    const f: Festival = { name: "Washington State Fair", note: "Do the Puyallup! Fair scones, one town over from Sumner." };
    if (i === len - 1) return run(f, i, { quiet: true, note: "Last day of the fair. One more scone?" });
    return run(f, i, { mark: "none", quiet: true });
  },
  (d) => (on(d, 8, 1) ? GINKGO : null),
  (d) => (d.getMonth() >= 8 && d.getMonth() <= 10 && d.getDate() >= 8 && d.getDate() <= 11 ? BLACKBERRY : null),
  (d, y) =>
    run({ name: "Hardly Strictly Bluegrass", note: "Free banjos in Golden Gate Park. Bring a blanket.", sf: true }, weekend(d, y, 9, nth(y, 9, 0, 1))),
  // The air show weekend: the Fri–Sun before the second Monday of October.
  (d, y) => run({ name: "Fleet Week", note: "Blue Angels over the Bay. Snickers is under the bed.", sf: true }, weekend(d, y, 9, nth(y, 9, 1, 2) - 1)),
  (d) =>
    on(d, 9, 31)
      ? { name: "Spirit's Eve", note: "Happy Halloween! A jack-o'-lantern glows by the fence after dark.", icon: "world.jack.lit" }
      : null,
  (d) => (on(d, 10, 2) ? { name: "Día de los Muertos", note: "Marigolds, candles and the procession through the Mission.", sf: true } : null),
  (d, y) => (on(d, 10, nth(y, 10, 0, 1)) ? { name: "Fall back", note: "Clocks go back an hour: one extra hour of loafing.", mark: "dot", quiet: true } : null),
  (d, y) => (on(d, 10, nth(y, 10, 4, 4)) ? { name: "Thanksgiving", note: "Save room for pie. (Rhubarb, if Sumner gets a vote.)" } : null),
  (d) =>
    d.getMonth() === 11 && d.getDate() >= 13 && d.getDate() <= 14
      ? { name: "Geminids", note: "The year's best meteor shower. It's cold out but that's where the meteors are.", ...METEORS }
      : null,
  (d) =>
    on(d, 11, 25)
      ? { name: "Feast of the Winter Star", note: "Merry Christmas! It snows on the farm, and someone left a gift...", icon: "item.gift" }
      : null,
  (d) => (on(d, 11, 31) ? { name: "New Year's Eve", note: "Fireworks over the Embarcadero at midnight. Just don't stay up past 2." } : null),
];

// ---------- lookup ----------

const MARK_RANK = { flag: 0, dot: 1, none: 2 } as const;

/** Farm days first, then the day's events (flags before dots), then the small stuff. */
function rank(f: Festival): number {
  if (f.star) return 0;
  return 1 + (f.quiet ? 3 : 0) + MARK_RANK[f.mark ?? "flag"];
}

/** Everything on a given local day: farm days first, then the day's events. Never throws. */
export function festivalsOn(d: Date, foundedAt?: number): Festival[] {
  const out: Festival[] = [];
  if (Number.isNaN(d.getTime())) return out;
  if (foundedAt) {
    const f = new Date(foundedAt);
    const years = d.getFullYear() - f.getFullYear();
    if (years > 0 && f.getMonth() === d.getMonth() && f.getDate() === d.getDate()) {
      out.push({ name: "Farm Anniversary", note: `${years} ${years === 1 ? "year" : "years"} of sheep! Time for cake.`, star: true });
    } else if (daysBetween(f, d) === 0) out.push({ name: "Farm Founding Day", note: "Where it all began...", star: true });
  }
  const y = d.getFullYear();
  for (const rule of RULES) {
    try {
      const f = rule(d, y);
      if (f) out.push(f);
    } catch {
      // one bad rule never blanks the billboard
    }
  }
  return out.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i).map((x) => x.f);
}

/** The day's main event (or farm day) for the clock, if any. Small stuff doesn't count. */
export function festivalOn(d: Date, foundedAt?: number): Festival | null {
  return festivalsOn(d, foundedAt).find((f) => !f.quiet) ?? null;
}
