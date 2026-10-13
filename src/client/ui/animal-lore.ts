// Lore for the sheep menus: what a plan is about (read from its name, then its notes), so the mood
// lines, the lamb at the ranch and the shears can wink at it. San Francisco, a little Washington,
// Snickers, and the things she loves. Winks, not walls: a plan only gets these when it actually
// mentions the thing.

import { dayKey } from "../../shared/calendar";

/** Real San Francisco parks (the Buy a Sheep name placeholder picks one). */
export const SF_PARKS = [
  "Dolores Park",
  "Golden Gate Park",
  "Alamo Square",
  "Lands End",
  "Crissy Field",
  "Bernal Heights Park",
  "Buena Vista Park",
  "Corona Heights Park",
  "Precita Park",
  "Duboce Park",
  "Lafayette Park",
  "Alta Plaza Park",
  "Washington Square",
  "Huntington Park",
  "Stern Grove",
  "McLaren Park",
  "Glen Canyon Park",
  "Fort Funston",
  "Presidio Tunnel Tops",
  "Twin Peaks",
  "Sutro Heights Park",
  "Mountain Lake Park",
  "Holly Park",
  "Salesforce Park",
];

export type Topic =
  | "karaoke"
  | "sketch"
  | "alexander"
  | "lavender"
  | "wine"
  | "snickers"
  | "kitkat"
  | "washington"
  | "festival"
  | "tilden"
  | "dolphins"
  | "ginkgo"
  | "loafing"
  | "salmon"
  | "coffee"
  | "bakery"
  | "pizza"
  | "icecream"
  | "vampires"
  | "burrito"
  | "hike"
  | "park";

/** One topic a plan mentions, with its lines already written for this sheep. */
export interface LoreHit {
  topic: Topic;
  /** The named place it mentions (e.g. "Tartine", "Dolores Park"), else a fitting stand-in. */
  place: string;
  /** Daytime mood lines while it's still a plan. */
  mood: string[];
  /** Mood lines once it's done (sheared). */
  done: string[];
  /** Things to dream about ("Zzz... Pottery class is dreaming about <dream>..."). */
  dreams: string[];
  /** Memory placeholders for after shearing. */
  memory: string[];
}

export interface PlanLore {
  hits: LoreHit[];
  has(topic: Topic): boolean;
  /** Every hit's lines of one kind, pooled (the first two topics only, so it stays a wink). */
  pool(kind: "mood" | "done" | "dreams" | "memory"): string[];
}

type Place = readonly [RegExp, string];

interface TopicDef {
  topic: Topic;
  re: RegExp;
  places?: readonly Place[];
  /** Stand-ins when the plan doesn't name a place (picked per sheep per day). */
  fallback?: readonly string[];
  mood: (n: string, place: string) => string[];
  done?: (n: string, place: string) => string[];
  dreams?: (place: string) => string[];
  memory?: readonly string[];
}

const FOOD_DONE = (n: string) => [`${n} is in a happy little food coma.`];

// Park names as people actually type them -> how the line says them.
const PARK_PLACES: readonly Place[] = [
  [/dolores/, "Dolores Park"],
  [/golden gate park|\bggp\b/, "Golden Gate Park"],
  [/alamo square|painted ladies/, "Alamo Square"],
  [/lands'? end|land'?s end/, "Lands End"],
  [/crissy/, "Crissy Field"],
  [/bernal/, "Bernal Heights"],
  [/buena vista/, "Buena Vista Park"],
  [/corona heights/, "Corona Heights"],
  [/precita/, "Precita Park"],
  [/duboce/, "Duboce Park"],
  [/lafayette/, "Lafayette Park"],
  [/alta plaza/, "Alta Plaza"],
  [/washington square/, "Washington Square"],
  [/huntington park/, "Huntington Park"],
  [/stern grove/, "Stern Grove"],
  [/mclaren/, "McLaren Park"],
  [/glen canyon/, "Glen Canyon"],
  [/fort funston/, "Fort Funston"],
  [/tunnel tops/, "the Tunnel Tops"],
  [/presidio/, "the Presidio"],
  [/twin peaks/, "Twin Peaks"],
  [/sutro baths/, "Lands End"],
  [/sutro/, "Sutro Heights"],
  [/mountain lake/, "Mountain Lake Park"],
  [/holly park/, "Holly Park"],
  [/salesforce park/, "Salesforce Park"],
  [/ocean beach/, "Ocean Beach"],
  [/baker beach/, "Baker Beach"],
  [/telegraph hill|coit tower/, "Telegraph Hill"],
];

const TOPICS: readonly TopicDef[] = [
  {
    topic: "karaoke",
    re: /karaoke/,
    mood: (n) => [
      `${n} is hiding behind the barn. Nobody wants to go to karaoke.`,
      `${n} has suddenly lost its voice... *baa-cough*`,
      `${n} is pretending to be a bush.`,
      `${n} is hoping everyone forgets about this one...`,
    ],
    done: (n) => [`${n} can't believe you two actually went to karaoke.`, `${n} would rather not talk about the karaoke.`],
    memory: ["Nobody wanted to go, but...", "Our song was..."],
  },
  {
    topic: "sketch",
    re: /sketch|\bdraw(s|ing|ings)?\b|doodl|\bart\b|\barts\b|watercolou?r/,
    mood: (n) => [
      `Another sketching meetup? ${n} is shocked. Shocked!`,
      `${n} is sketching the other sheep. They won't hold still.`,
      `${n} packed a tiny sketchbook. And six pencils.`,
      `${n} has been to more sketching meetups than most sheep.`,
    ],
    done: (n) => [`${n} would love to see the sketches.`, `${n} is posing for the next sketching meetup.`],
    dreams: () => ["the next sketching meetup", "a fresh sketchbook"],
    memory: ["The best sketch was...", "We drew..."],
  },
  {
    // Christopher Alexander: A Pattern Language, The Timeless Way of Building.
    topic: "alexander",
    re: /christopher alexander|pattern language|timeless way|\barchitect(s|ure|ural)?\b/,
    mood: (n) => [`${n} is reading A Pattern Language. It has notes on the barn.`, `${n} is looking for the quality without a name.`],
    done: (n) => [`${n} found the quality without a name.`],
    dreams: () => ["light on two sides of every room"],
    memory: ["It had the quality without a name..."],
  },
  {
    topic: "lavender",
    re: /lavender/,
    mood: (n) => [`${n} smells faintly of lavender. Fancy.`, `${n} is daydreaming about rows and rows of lavender...`, `${n} would like lavender everything, please.`],
    done: (n) => [`${n} still smells like lavender.`],
    dreams: () => ["fields of lavender", "the lavender farms back in Washington"],
    memory: ["It smelled like..."],
  },
  {
    topic: "wine",
    re: /\b(wine|wines|winery|wineries|vineyards?|napa|sonoma|vino)\b/,
    mood: (n) => [`${n} is practicing its swirl. Swirl, sniff, baa.`, `${n} is feeling very sophisticated today.`],
    done: (n) => [`${n} is feeling very sophisticated.`],
    dreams: () => ["Wine Wednesday"],
    memory: ["The best glass was..."],
  },
  {
    topic: "snickers",
    re: /snickers|\b(cat|cats|kitty|fancy feast|whisker lickins)\b/,
    mood: (n) => [`Snickers has been informed. He said "Mow."`, `${n} is saving a Whisker Lickin for Snickers.`, `Snickers is pretending not to care about this one.`],
    done: () => ["Snickers approves. Mow."],
  },
  {
    topic: "kitkat",
    re: /\b(arizona|phoenix|tucson|scottsdale|sedona|flagstaff|kitkat|kit kat)\b/,
    mood: (n) => [`${n} hopes KitKat sends a postcard.`, `${n} packed sunscreen. Arizona is not foggy.`, `Snickers says to tell KitKat "Mow."`],
    done: (n) => [`${n} says KitKat says hi.`],
    dreams: () => ["visiting KitKat in Arizona"],
  },
  {
    topic: "washington",
    re: /\b(sumner|bonney lake|rainier|puyallup|tacoma|seattle|rhubarb)\b|\bwashington\b(?! square| st\b| street)/,
    places: [
      [/rhubarb|sumner/, "Sumner"],
      [/bonney lake/, "Bonney Lake"],
      [/rainier/, "Mt. Rainier"],
    ],
    fallback: ["Washington"],
    mood: (n, place) => [
      ...(place === "Sumner" ? [`Sumner: Rhubarb Pie Capital of the World. ${n} would know.`] : []),
      `${n} hopes for a little drizzle. Like home.`,
      `${n} can see Mt. Rainier from here. (It can't.)`,
    ],
    done: (n) => [`${n} misses the drizzle a little.`],
    dreams: () => ["rhubarb pie from Sumner", "Mt. Rainier on a clear day"],
  },
  {
    topic: "festival",
    re: /bay to breakers|outside lands|fleet week|blue angels|hardly strictly|bluegrass|\b(concerts?|festivals?|fest|gigs?)\b/,
    places: [
      [/bay to breakers/, "Bay to Breakers"],
      [/outside lands/, "Outside Lands"],
      [/fleet week|blue angels/, "Fleet Week"],
      [/hardly strictly|bluegrass/, "Hardly Strictly"],
    ],
    fallback: ["the show"],
    mood: (n, place) => {
      if (place === "Bay to Breakers") return [`${n} is working on its Bay to Breakers costume.`];
      if (place === "Outside Lands") return [`${n} is making an Outside Lands schedule. It's color-coded.`];
      if (place === "Fleet Week") return [`${n} keeps looking up. Was that the Blue Angels?`];
      if (place === "Hardly Strictly") return [`${n} is practicing its banjo face.`];
      return [`${n} is practicing its dance moves.`, `${n} is making a playlist.`];
    },
    done: (n, place) => (place === "Bay to Breakers" ? [`${n} is still wearing its costume.`] : [`${n} is still humming.`]),
  },
  {
    // Tilden Little Farm (Berkeley), where visitors feed celery to our sheep's cousins.
    topic: "tilden",
    re: /tilden|little farm|petting (zoo|farm)|celery/,
    mood: (n) => [`${n} is visiting the cousins at Tilden Little Farm. It packed celery.`, `${n}'s cousins at Tilden get celery from visitors. ${n} is just saying.`],
    done: (n) => [`${n}'s cousins at Tilden say thanks for the celery.`],
    dreams: () => ["celery at Tilden Little Farm"],
    memory: ["We fed the..."],
  },
  {
    topic: "dolphins",
    re: /dolphins?|porpoises?|\bwhales?\b|whale watching|aquarium|golden gate bridge/,
    places: [[/porpoise|golden gate bridge/, "the Golden Gate"]],
    mood: (n, place) =>
      place === "the Golden Gate"
        ? [`${n} is watching for the porpoises under the Golden Gate.`, `${n} heard the porpoises are back. It's bringing binoculars.`]
        : [`${n} is practicing its dolphin noises. They come out "baa."`, `${n} would like to be friends with a dolphin. Or several.`],
    done: (n) => [`${n} is still doing dolphin noises. They sound like baas.`],
    dreams: () => ["dolphins", "the porpoises under the Golden Gate"],
    memory: ["We saw..."],
  },
  {
    // In fall the street ginkgos go gold (fan-shaped leaves everywhere).
    topic: "ginkgo",
    re: /ginkgo|gingko|leaf peep|fall colou?rs|fall leaves|autumn leaves/,
    mood: (n) => [`${n} is hunting for the goldest ginkgo in the city.`, `${n} found a fan-shaped leaf. It's keeping it.`],
    done: (n) => [`${n} has a ginkgo leaf stuck in its wool. On purpose.`],
    dreams: () => ["streets full of golden ginkgo"],
    memory: ["The goldest tree was..."],
  },
  {
    // Her two favorite units of time.
    topic: "loafing",
    re: /\bloafing\b|\bloaf (around|day)\b|black hole|\bnaps?\b|napping|lazy (day|morning|saturday|sunday)|do(ing)? nothing/,
    mood: (n) => [`${n} has 1 hour of loafing penciled in. Maybe two.`, `${n} is worried this turns into 3 hours in the black hole.`, `Snickers is a professional loafer. ${n} is taking notes.`],
    done: (n) => [`${n} loafed like a pro. Snickers approves.`, `${n} made it out of the black hole. Eventually.`],
    dreams: () => ["1 hour of loafing", "3 hours in the black hole"],
    memory: ["We loafed for..."],
  },
  {
    topic: "salmon",
    re: /\b(salmon|sushi|sashimi|oysters?|seafood|fish|crab|cioppino)\b/,
    mood: (n) => [`Snickers keeps staring at ${n}. Something about salmon.`, `Snickers would like to come. He's heard there's salmon.`],
    done: (n) => [`Snickers is sniffing ${n} very carefully. Salmon?`],
    memory: ["The best bite was..."],
  },
  {
    topic: "coffee",
    re: /\b(coffee|latte|lattes|cortado|espresso|cappuccino|cafe|mocha)\b|blue bottle|sightglass|philz|ritual coffee/,
    places: [
      [/blue bottle/, "Blue Bottle"],
      [/sightglass/, "Sightglass"],
      [/ritual/, "Ritual"],
      [/philz/, "Philz"],
    ],
    fallback: ["Blue Bottle", "Sightglass", "Ritual", "Philz"],
    mood: (n, place) => [
      place === "Philz" ? `${n} wants a Mint Mojito. From Philz, obviously.` : `${n} is vibrating slightly. Too much ${place}.`,
      `${n} smelled coffee. Its ears perked right up.`,
      `${n} takes coffee very seriously. (Washington roots.)`,
    ],
    done: (n, place) => [`${n} is still a little buzzy from ${place}.`],
    dreams: (place) => [`a ${place} latte`],
    memory: ["We ordered..."],
  },
  {
    topic: "bakery",
    re: /\b(bakery|bakeries|bake|baking|croissants?|pastry|pastries|morning buns?|kouign|scones?|bread|donuts?|doughnuts?|brunch)\b|tartine|arsicault|patisserie|devil'?s teeth|ferry building/,
    places: [
      [/tartine/, "Tartine"],
      [/arsicault/, "Arsicault"],
      [/patisserie/, "b. Patisserie"],
      [/devil'?s teeth/, "Devil's Teeth"],
      [/ferry building/, "the Ferry Building"],
    ],
    fallback: ["Tartine", "Arsicault", "b. Patisserie"],
    mood: (n, place) => [`${n} would wait in the ${place} line for this.`, `${n} is thinking about croissants. Flaky ones.`, `${n} wants to split a morning bun. Maybe two.`],
    done: FOOD_DONE,
    dreams: () => ["an Arsicault croissant", "a morning bun"],
    memory: ["The best bite was..."],
  },
  {
    topic: "pizza",
    re: /pizza|golden boy|tony'?s napoletana/,
    mood: (n) => [`${n} is saving room for pizza. A lot of room.`, `${n} can't decide: Golden Boy or Tony's.`, `${n} would eat pizza in any park in the city.`],
    done: FOOD_DONE,
    dreams: () => ["a square of Golden Boy", "pizza in the park"],
    memory: ["The best slice was..."],
  },
  {
    topic: "icecream",
    re: /ice cream|gelato|bi-?rite|mitchell'?s|creamery|sundaes?|stinking rose/,
    // Garlic ice cream (The Stinking Rose has it) keeps the vampires away.
    places: [[/garlic|stinking rose/, "garlic"]],
    mood: (n, place) =>
      place === "garlic"
        ? [`Garlic ice cream? ${n} is intrigued. The vampires are not.`, `${n} is going vampire-proof. One scoop at a time.`]
        : [`${n} can't decide: Bi-Rite or Mitchell's.`, `${n} wants two scoops. Minimum.`],
    done: (n, place) => (place === "garlic" ? [`${n} had the garlic ice cream. Vampire-proof for a week.`] : FOOD_DONE(n)),
    dreams: (place) => [place === "garlic" ? "garlic ice cream" : "two scoops from Bi-Rite"],
    memory: ["The best scoop was..."],
  },
  {
    topic: "vampires",
    re: /\bvampires?\b|dracula|nosferatu|\bgarlic\b/,
    mood: (n) => [`${n} packed garlic. Just in case.`, `${n} knows the trick for vampires: garlic ice cream.`],
    done: (n) => [`No vampires. ${n} credits the garlic.`],
    dreams: () => ["garlic ice cream"],
  },
  {
    topic: "burrito",
    re: /burritos?|\btacos?\b|taqueria/,
    mood: (n) => [`${n} is dreaming about La Taqueria. No rice, obviously.`, `${n} wants a burrito the size of a lamb.`],
    done: FOOD_DONE,
    dreams: () => ["a La Taqueria burrito"],
    memory: ["The best bite was..."],
  },
  {
    topic: "hike",
    re: /\b(hike|hikes|hiking|trail|trails|camping|campout|backpacking|redwoods?|summit)\b|muir woods|mt\.? tam\b|mount tam|tamalpais|point reyes|headlands|mission peak|half moon bay|pacifica/,
    places: [
      [/muir woods|redwoods?/, "Muir Woods"],
      [/mt\.? tam\b|mount tam|tamalpais/, "Mt. Tam"],
      [/point reyes/, "Point Reyes"],
      [/headlands/, "the Marin Headlands"],
      [/mission peak/, "Mission Peak"],
      [/half moon bay/, "Half Moon Bay"],
      [/pacifica/, "Pacifica"],
    ],
    fallback: ["the trail"],
    mood: (n, place) => [
      `${n} packed trail snacks. And backup trail snacks.`,
      `${n} spotted a banana slug. It's mesmerized.`,
      `${n} is ready for ${place}. (Mostly the snacks.)`,
      `${n} has been training on Bernal Hill.`,
    ],
    done: (n) => [`${n}'s legs are sore. Worth it.`, `${n} made friends with a banana slug.`],
    dreams: (place) => [place === "the trail" || place === "Muir Woods" ? "the redwoods at Muir Woods" : `the view from ${place}`],
    memory: ["The view from the top...", "We saw a banana slug..."],
  },
  {
    topic: "park",
    re: new RegExp(`\\b(park|parks|picnic|picnics)\\b|${PARK_PLACES.map(([re]) => re.source).join("|")}`),
    places: PARK_PLACES,
    fallback: ["the park"],
    mood: (n, place) => [
      place === "Telegraph Hill" ? `${n} is listening for the wild parrots of Telegraph Hill.` : `${n} already knows the sunny spot in ${place}.`,
      `${n} is practicing its picnic-blanket fold.`,
      `${n} is hoping Karl the Fog sleeps in.`,
    ],
    done: (n) => [`${n} has grass stains. Good ones.`],
    dreams: (place) => [`a sunny afternoon in ${place}`],
    memory: ["Our spot was..."],
  },
];

/** Lowercase, accent-free, straight apostrophes: "Café" -> "cafe", "Tony’s" -> "tony's". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase();
}

function placeIn(text: string, places: readonly Place[] | undefined): string | null {
  if (!places) return null;
  for (const [re, name] of places) if (re.test(text)) return name;
  return null;
}

/**
 * What a plan is about. The name is read first, then the notes, so "Pottery class" with
 * "then Tartine?" in its notes still smells like croissants. `choose` picks stand-in places
 * (pass a seeded one for lines that shouldn't change their mind on every re-render).
 */
export function planLore(s: { name: string; notes?: string | null }, choose: <T>(arr: readonly T[]) => T): PlanLore {
  const hits: LoreHit[] = [];
  try {
    const name = fold(s.name ?? "");
    const notes = fold(s.notes ?? "");
    for (const text of [name, notes]) {
      if (!text) continue;
      for (const def of TOPICS) {
        if (hits.some((h) => h.topic === def.topic) || !def.re.test(text)) continue;
        // A place named anywhere in the plan counts ("Pastries" + notes "Arsicault on Arguello").
        const place = placeIn(text, def.places) ?? placeIn(`${name} ${notes}`, def.places) ?? (def.fallback?.length ? choose(def.fallback) : "");
        const n = s.name;
        hits.push({
          topic: def.topic,
          place,
          mood: def.mood(n, place),
          done: def.done?.(n, place) ?? [],
          dreams: def.dreams?.(place) ?? [],
          memory: [...(def.memory ?? [])],
        });
      }
    }
    // (Already in order: what the name mentions first, most telling topic first.)
  } catch {
    hits.length = 0;
  }
  const top = hits.slice(0, 2);
  return {
    hits,
    has: (topic) => hits.some((h) => h.topic === topic),
    pool: (kind) => top.flatMap((h) => h[kind]),
  };
}

// ---------- the week ----------

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function isWineWednesday(d: Date): boolean {
  return d.getDay() === 3;
}

/**
 * Some Thursdays are just Thursday. Some are THURSDAY!!!!! Decided per date, so both phones agree
 * (and a plan dated next Thursday already knows which kind it'll be).
 */
export function isBigThursday(d: Date): boolean {
  return d.getDay() === 4 && hash(`thursday:${dayKey(d)}`) % 2 === 0;
}

export const THURSDAY = "THURSDAY!!!!!";
