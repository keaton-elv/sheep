// Stardew festivals, pinned to real dates, so the billboard has little flags on it.

import { daysBetween } from "../../shared/calendar";

export interface Festival {
  name: string;
  note: string;
}

const FIXED: Record<string, Festival> = {
  "01-08": { name: "Festival of Ice", note: "Ice fishing contest! Willy takes it very seriously." },
  "01-12": { name: "SquidFest", note: "Squid fishing at the beach. Bundle up and bring bait." },
  "01-13": { name: "SquidFest", note: "Last day to catch the biggest squid. Willy is watching." },
  "02-14": { name: "Bouquet Day", note: "In the valley, handing someone a bouquet means you're sweethearts." },
  "04-15": { name: "Desert Festival", note: "A party in the Calico Desert! Food stalls, races, makeovers." },
  "04-16": { name: "Desert Festival", note: "Place a bet on the races. Sandy swears it's not rigged." },
  "04-17": { name: "Desert Festival", note: "Last day! Grab a makeover from Emily before the bus leaves." },
  "05-24": { name: "Flower Dance", note: "Ask your sweetheart to dance in Cindersap Forest." },
  "07-11": { name: "Luau", note: "Everyone adds something to the potluck soup. Not a Joja Cola, please." },
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

/** Festival (or farm anniversary) on a given local day, if any. */
export function festivalOn(d: Date, foundedAt?: number): Festival | null {
  if (foundedAt) {
    const f = new Date(foundedAt);
    const years = d.getFullYear() - f.getFullYear();
    if (years > 0 && f.getMonth() === d.getMonth() && f.getDate() === d.getDate()) {
      return { name: "Farm Anniversary", note: `${years} ${years === 1 ? "year" : "years"} of sheep! Lewis is making a speech.` };
    }
    if (daysBetween(f, d) === 0) return { name: "Farm Founding Day", note: "The very first day on the farm. Grandpa would be proud." };
  }
  const e = easter(d.getFullYear());
  if (e.month === d.getMonth() && e.day === d.getDate()) {
    return { name: "Egg Festival", note: "Egg hunt in the town square! Abigail always wins." };
  }
  const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return FIXED[key] ?? null;
}
