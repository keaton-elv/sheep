// The little Stardew "mood line" on the animal card ("Pottery Class looks really happy today!").
// Deterministic per sheep per day, so the card doesn't change its mind every time it re-renders.

import { rng } from "../engine/game";
import { dayKey, daysBetween, parseDayKey } from "../../shared/calendar";
import type { Category, Sheep } from "../../shared/types";
import type { FarmMoment } from "./animal-common";

/** What each kind of sheep daydreams about. */
const DREAMS: Record<Category, string[]> = {
  date: ["candlelight", "holding hooves", "a fancy dinner", "a picnic blanket", "slow dancing", "the Flower Dance"],
  workshop: ["clay", "paint swatches", "learning something new", "glue guns", "a tiny apron", "hand-made mugs"],
  travel: ["train tickets", "a window seat", "far-off places", "the bus to the desert", "airport snacks", "postcards"],
  adventure: ["mountain trails", "the bottom of the Mines", "campfires", "a treasure map", "big views", "a secret beach"],
  food: ["Pink Cake", "a pizza party", "a big bowl of spaghetti", "a cheese plate", "dessert first", "warm bread"],
  cozy: ["blankets", "warm tea", "a crackling fireplace", "a rainy-day nap", "fuzzy socks", "a good book"],
  other: ["something mysterious", "a stardrop", "a moonlit meadow", "fairy lights", "shooting stars", "the Secret Woods"],
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
  if (pets >= 9) return choose([`${n} adores you two.`, `${n} thinks you two are the best farmers in the valley.`, `${n} is glowing with happiness.`]);
  if (pets >= 6) return choose([`${n} loves you two!`, `${n} looks really happy today!`, `${n} is wagging its little tail.`]);
  if (pets >= 3) return choose([`${n} looks really happy today!`, `${n} is wagging its little tail.`, `${n} enjoyed that pet.`]);
  return choose([`${n} liked that!`, `${n} is warming up to you two.`, `${n} gave a happy little baa.`]);
}

export function moodLine(s: Sheep, ctx: MoodContext): string {
  const { moment } = ctx;
  const r = rng((s.seed ^ hash(dayKey(moment.now))) >>> 0);
  const choose = <T>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
  const n = s.name;
  const dream = choose(DREAMS[s.category] ?? DREAMS.other);
  const golden = s.golden ? " It's shimmering. Legendary." : "";
  const lamb = !!ctx.lamb && s.shearedAt === null;

  // The poke easter egg wins over everything.
  const pokes = ctx.pokes ?? 0;
  if (pokes >= 12) return `${n} would like a little personal space, please.`;
  if (pokes >= 6) return lamb ? `${n} is getting a little wobbly.` : `${n} is getting a little dizzy.`;

  if (ctx.retired) {
    return (
      choose([
        `${n} is cozy in the barn, remembering the good times.`,
        `${n} is happily retired. What a sheep.`,
        `${n} tells the other sheep about that day. Constantly.`,
      ]) + golden
    );
  }

  if (s.shearedAt !== null) {
    if (moment.isNight) return `${n} is sleeping soundly, light as a feather.${golden}`;
    return (
      choose([
        `${n} feels light as a feather!`,
        `${n} is enjoying the breeze.`,
        `${n} looks very proud of you two.`,
        `${n} is strutting around the pasture.`,
        s.memory ? `${n} is remembering a lovely day.` : `${n} wonders if you'll write down a memory.`,
      ]) + golden
    );
  }

  const planned = s.date ? parseDayKey(s.date) : null;
  const days = planned ? daysBetween(moment.now, planned) : null;

  if (moment.isNight) {
    if (days === 0) return `${n} is sleeping... Did it happen today? Shear ${n} if it did!${golden}`;
    if (days === 1) return `${n} is sleeping. Big day tomorrow!${golden}`;
    if (lamb) return choose([`${n} is curled up, dreaming tiny lamb dreams.`, `${n} fell asleep mid-baa.`]) + golden;
    return `${n} is sleeping and dreaming about ${dream}.${golden}`;
  }

  if (days !== null) {
    if (days === 0) return `Today's the day!! ${n} is bouncing off the fence.${golden}`;
    if (days === 1) return `${n} can't wait! It's tomorrow!${golden}`;
    if (days > 1 && days <= 7) return `${n} can't wait! Only ${days} days to go!${golden}`;
    if (days === -1) return `Yesterday was the big day! Did it happen? Shear ${n} if it did!${golden}`;
    if (days < -1) return `${n} is wondering how it went... (Shear it if you did it!)${golden}`;
  }

  const petToday = s.lastPetAt !== null && daysBetween(new Date(s.lastPetAt), moment.now) === 0;

  if (lamb) {
    if (petToday && s.pets >= 2) return `${n} did a happy little hop!${golden}`;
    if (moment.weather === "rain" || moment.weather === "storm") return `${n} is hiding under a big sheep, out of the rain.${golden}`;
    if (moment.weather === "snow") return `${n} has never seen snow before. It's amazed.${golden}`;
    return (
      choose([
        `${n} is a wobbly little lamb.`,
        `${n} is practicing its baa.`,
        `${n} is bouncing around the pasture!`,
        `${n} is following the big sheep around.`,
        `${n} just discovered grass. It's a big day.`,
      ]) + golden
    );
  }

  if (moment.weather === "storm") return `${n} is hiding from the thunder.${golden}`;
  if (moment.weather === "rain") return `${n} doesn't like the rain.${golden}`;
  if (moment.weather === "snow") return `${n}'s wool is keeping it toasty in the snow.${golden}`;
  if (moment.weather === "windy" && r() < 0.5) return `${n}'s wool is blowing in the wind. Majestic.${golden}`;

  const DAY = 86_400_000;
  const createdToday = daysBetween(new Date(s.createdAt), moment.now) === 0;
  const lastLove = s.lastPetAt ?? s.createdAt;

  if (petToday) return pettedLine(n, s.pets, choose) + golden;
  if (ctx.nowMs - lastLove > 3 * DAY) return `${n} hasn't been pet in a while.${golden}`;
  if (createdToday) return `${n} is still getting used to the farm.${golden}`;
  if (s.pets >= 8) return `${n} looks really happy today!${golden}`;
  if (s.pets >= 4 && r() < 0.5) return `${n} seems very content.${golden}`;
  if (s.golden) return `${n} is shimmering. Legendary.`;
  return choose([`${n} is daydreaming about ${dream}.`, `${n} is thinking about ${dream}.`, `${n} is munching grass and dreaming of ${dream}.`]);
}
