// The little Stardew "mood line" on the animal card ("Pottery Class looks really happy today!").
// Deterministic per sheep per day, so the card doesn't change its mind every time it re-renders.
// What the plan mentions (sketching, karaoke, coffee, a park...) gets a wink; see animal-lore.ts.

import { rng } from "../engine/game";
import { dayKey, daysBetween, parseDayKey } from "../../shared/calendar";
import type { Category, Sheep } from "../../shared/types";
import { offOriginal, originalStamps, realDateLabel, type FarmMoment } from "./animal-common";
import { THURSDAY, isBigThursday, isWineWednesday, planLore } from "./animal-lore";

/** What each kind of sheep daydreams about. */
const DREAMS: Record<Category, string[]> = {
  date: ["candlelight", "holding hooves", "a picnic in Dolores Park", "the sunset at Lands End", "slow dancing", "the Flower Dance"],
  workshop: ["clay", "a sketching meetup", "paint swatches", "glue guns", "a tiny apron", "hand-made mugs"],
  travel: ["train tickets", "a window seat", "visiting KitKat in Arizona", "BART to the airport", "airport snacks", "postcards"],
  adventure: ["the redwoods at Muir Woods", "the top of Mt. Tam", "a banana slug", "campfires", "the bottom of the Mines", "Point Reyes"],
  food: ["an Arsicault croissant", "rhubarb pie from Sumner", "a square of Golden Boy", "Bi-Rite ice cream", "Pink Cake", "salmon sashimi"],
  cozy: ["blankets", "a Blue Bottle latte", "a crackling fireplace", "a foggy-day nap", "fuzzy socks", "lavender tea"],
  other: ["something mysterious", "a stardrop", "the wild parrots of Telegraph Hill", "dolphins", "shooting stars", "the Secret Woods"],
};

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface MoodContext {
  moment: FarmMoment;
  /** Server-corrected wall clock (ms) for comparing against createdAt / lastPetAt / shearedAt. */
  nowMs: number;
  retired: boolean;
  /** Still a lamb (bought less than a day ago, not sheared). */
  lamb?: boolean;
  /** How many times the farmer has poked the sheep sprite on the card. */
  pokes?: number;
}

/** How a sheep feels about being petted today, scaled by its hearts (half-hearts, 0..10). */
function pettedLine(n: string, pets: number, choose: <T>(arr: readonly T[]) => T): string {
  if (pets >= 9) return choose([`${n} adores you two.`, `${n} thinks you two are the best farmers in the Bay.`, `${n} is glowing with happiness.`]);
  if (pets >= 6) return choose([`${n} loves you two!`, `${n} looks really happy today!`, `${n} would follow you two all the way to Ocean Beach.`]);
  if (pets >= 3) return choose([`${n} looks really happy today!`, `${n} enjoyed that pet.`, `Snickers saw that. He's a little jealous.`]);
  return choose([`${n} liked that!`, `${n} is warming up to you two.`, `${n} gave a happy little baa.`]);
}

export function moodLine(s: Sheep, ctx: MoodContext): string {
  const { moment } = ctx;
  const r = rng((s.seed ^ hash(dayKey(moment.now))) >>> 0);
  const choose = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
  const n = s.name;
  const lore = planLore(s, choose);
  const loreDreams = lore.pool("dreams");
  const dream = loreDreams.length && r() < 0.6 ? choose(loreDreams) : choose(DREAMS[s.category] ?? DREAMS.other);
  const golden = s.golden ? " It's shimmering. Legendary." : "";
  const lamb = !!ctx.lamb && s.shearedAt === null;
  const karaoke = lore.has("karaoke");

  // The poke easter egg wins over everything.
  const pokes = ctx.pokes ?? 0;
  if (pokes >= 12) return `${n} would like a little personal space, please.`;
  if (pokes >= 6) return lamb ? `${n} is getting a little wobbly...` : `${n} is getting a little dizzy...`;

  if (ctx.retired) {
    if (karaoke && r() < 0.5) return `${n} still won't talk about the karaoke.${golden}`;
    return (
      choose([
        `${n} is cozy in the barn, remembering the good times...`,
        `${n} is happily retired. What a sheep.`,
        `${n} tells the other sheep about that day, and they always baa at the good part.`,
        `${n} is telling Snickers all about it. He's mostly asleep.`,
      ]) + golden
    );
  }

  if (s.shearedAt !== null) {
    if (moment.isNight) return `Zzz... ${n} is sleeping, light as a feather.${golden}`;
    const done = lore.pool("done");
    if (done.length && r() < 0.6) return choose(done) + golden;
    if (moment.weather === "fog" && r() < 0.5) return `${n} could use its wool back right about now. Brr...${golden}`;
    return (
      choose([
        `${n} feels light as a feather!`,
        `${n} looks very proud of you two.`,
        `${n} is strutting around the pasture.`,
        s.memory ? `${n} is remembering a lovely day...` : `${n} wonders if you'll write a memory...`,
      ]) + golden
    );
  }

  const planned = s.date ? parseDayKey(s.date) : null;
  const days = planned ? daysBetween(moment.now, planned) : null;

  if (moment.isNight) {
    if (karaoke) return `Zzz... ${n} is having a karaoke nightmare...${golden}`;
    if (days === 0) return `Zzz... did it happen today?${golden}`;
    if (days === 1) return `Zzz... big day tomorrow!${golden}`;
    if (lamb) return choose(["Zzz... tiny lamb dreams...", `${n} fell asleep mid-baa...`]) + golden;
    return `Zzz... ${n} is dreaming about ${dream}...${golden}`;
  }

  // Nobody wants to go to karaoke. Not even the sheep.
  if (karaoke) {
    if (lamb) return `${n} is too little for karaoke. Phew.${golden}`;
    if (days === 0) return `It's karaoke day. ${n} has gone into hiding.${golden}`;
    if (days === 1) return `Karaoke is tomorrow. ${n} feels a cold coming on... *baa-cough*${golden}`;
    if (days !== null && days < 0) return `${n} thinks everyone forgot about the karaoke. Phew.${golden}`;
    return choose(lore.hits.find((h) => h.topic === "karaoke")?.mood ?? [`${n} is hiding.`]) + golden;
  }

  if (days !== null) {
    if (days === 0) return isBigThursday(moment.now) ? `It's today!! And it's ${THURSDAY} ${n} is bouncing off the fence.${golden}` : `Today's the day!! ${n} is bouncing off the fence.${golden}`;
    if (days === 1) return `${n} can't wait! It's tomorrow!${golden}`;
    if (days > 1 && days <= 7) return `${n} can't wait! Only ${days} days to go!${golden}`;
    if (days === -1) return `Yesterday was the big day... did it happen?${golden}`;
    if (days < -1) return `${n} is wondering how it went...${golden}`;
  }

  const petToday = s.lastPetAt !== null && daysBetween(new Date(s.lastPetAt), moment.now) === 0;

  if (lamb) {
    if (petToday && s.pets >= 2) return `${n} did a happy little hop!${golden}`;
    if (moment.weather === "rain" || moment.weather === "storm") return `${n} is hiding under a big sheep, out of the rain.${golden}`;
    if (moment.weather === "snow") return `${n} has never seen snow before. It's amazed.${golden}`;
    if (moment.weather === "fog") return `${n} has never met Karl the Fog before. It's a little shy.${golden}`;
    return (
      choose([
        `${n} is practicing its baa... baa?`,
        `${n} tried to say "Mow" like Snickers. It came out "Baa."`,
        `${n} is following Snickers around. Snickers is not amused.`,
        `${n} just discovered grass. It's a big day.`,
      ]) + golden
    );
  }

  if (moment.weather === "storm") return `${n} is hiding from the thunder...${golden}`;
  if (moment.weather === "rain") return choose([`${n} doesn't like the rain...`, `${n} is unbothered. This is basically Washington drizzle.`]) + golden;
  if (moment.weather === "snow") return `${n}'s wool is keeping it toasty in the snow.${golden}`;
  if (moment.weather === "fog" && r() < 0.6) {
    const summer = moment.season === "summer" ? [`Summer in San Francisco: ${n} is glad it kept its wool.`] : [];
    return choose([`Foggy day. ${n} blends right in.`, `${n} lost the other sheep in the fog. Thanks, Karl.`, ...summer]) + golden;
  }
  if (moment.weather === "windy" && r() < 0.5) return `${n}'s wool is blowing in the wind. Majestic.${golden}`;

  const DAY = 86_400_000;
  const createdToday = daysBetween(new Date(s.createdAt), moment.now) === 0;
  const lastLove = s.lastPetAt ?? s.createdAt;

  if (petToday) return pettedLine(n, s.pets, choose) + golden;

  // The week has its own moods.
  const wednesday = isWineWednesday(moment.now);
  if (wednesday && lore.has("wine")) return `It's Wine Wednesday! ${n} has been waiting all week.${golden}`;
  if (isBigThursday(moment.now) && r() < 0.45) return choose([`It's ${THURSDAY} ${n} is doing zoomies.`, `${THURSDAY} ${n} can barely contain itself.`]) + golden;

  // Whatever the plan's about.
  const about = lore.pool("mood");
  if (about.length && r() < 0.6) return choose(about) + golden;

  // ORIGINAL PLAN: sheep remember their first name, and their first date.
  const off = offOriginal(s);
  if (off?.nameChanged && r() < 0.35) return `${n} still answers to “${off.name}”...${golden}`;
  if (off?.dateChanged && !off.nameChanged && off.date && r() < 0.35) {
    const first = parseDayKey(off.date);
    if (first) return `${n} still has ${realDateLabel(first, first.getFullYear() !== moment.now.getFullYear())} circled on the calendar...${golden}`;
  }
  if (originalStamps(s) > 0 && r() < 0.35) return `${n} is sticking to the ORIGINAL PLAN.${golden}`;

  if (wednesday && r() < 0.2) return `It's Wine Wednesday. ${n} is feeling sophisticated.${golden}`;

  if (ctx.nowMs - lastLove > 3 * DAY) return `${n} hasn't been pet in a while...${golden}`;
  if (createdToday) return `${n} is still getting used to the pasture.${golden}`;
  if (s.pets >= 8) return `${n} looks really happy today!${golden}`;
  if (s.pets >= 4 && r() < 0.5) return `${n} seems very content.${golden}`;
  if (s.golden) return `${n} is shimmering. Legendary.`;
  return choose([`${n} is daydreaming about ${dream}...`, `${n} is munching grass. Hmm... ${dream}...`]);
}
