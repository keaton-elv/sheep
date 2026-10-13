// Marnie's idea dice: a hand-picked bag of plans for two. Every roll is a sheep waiting to happen.
// Names stay well under LIMITS.name (80) so they fit on a name tag.

import type { Category } from "../../shared/types";

export interface PlanIdea {
  name: string;
  category: Category;
}

const RAW: Record<Category, string[]> = {
  date: [
    "Sunset picnic with a real wicker basket",
    "Fancy dinner, dress-up required",
    "Breakfast-for-dinner date",
    "Drive-in movie with too many snacks",
    "Night market date",
    "Museum date: pick each other's favorite piece",
    "Aquarium date (find the sea cucumber)",
    "Practice for the Flower Dance (go dancing!)",
    "Mini golf rematch",
    "Bowling + milkshakes",
    "Arcade night: Prairie King high-score battle",
    "Karaoke duet night",
    "Go to a comedy show",
    "See a play or a musical",
    "Botanical garden stroll",
    "Rooftop drinks at golden hour",
    "Cider or wine tasting",
    "Jazz bar night",
    "Roller skating date",
    "Ice skating (Festival of Ice vibes)",
    "Farmers market morning + fancy coffee",
    "Bookstore date: pick a book for each other",
    "Thrift-store $10 outfit challenge",
    "Recreate our first date",
    "Planetarium show",
    "Cat café date",
    "Pub trivia night",
    "Hot air balloon ride",
    "Get our silly portrait drawn at a fair",
    "Feast of the Winter Star gift swap",
  ],
  workshop: [
    "Pottery class",
    "Candle-making workshop",
    "Pasta-making class",
    "Sushi-rolling class",
    "Watercolor painting class",
    "Terrarium workshop",
    "Flower-arranging class",
    "Dumpling-folding class",
    "Glassblowing class",
    "Throw matching mugs on the wheel",
    "Knitting class (with real wool!)",
    "Needle-felting: make a tiny wool sheep",
    "Sourdough baking class",
    "Cocktail-mixing class",
    "Salsa dancing lessons",
    "Couples cooking class",
    "Woodworking class (Robin would be proud)",
    "Jewelry-making class",
    "Linocut printmaking workshop",
    "Perfume-blending workshop",
    "Intro to bouldering class",
    "Calligraphy workshop",
    "Cheese-making class (Artisan goods!)",
    "Macaron baking class",
    "Weaving class: use a real loom",
  ],
  travel: [
    "Weekend in Big Sur",
    "Road trip with the perfect playlist",
    "Cabin weekend in the woods",
    "Beach town getaway",
    "Stay at a cozy B&B",
    "Visit a new city just for the food",
    "Scenic train ride somewhere new",
    "Ski trip (or just cocoa at the lodge)",
    "Leaf-peeping road trip",
    "Hot springs weekend",
    "Wine country weekend",
    "Visit a national park",
    "Tiny-house cabin weekend",
    "Take the bus to the desert (Calico vibes)",
    "Island weekend, ferry included",
    "Lighthouse road trip",
    "Dream trip: Japan",
    "Dream trip: Italy",
    "Dream trip: Iceland",
    "Dream trip: Scotland (so many sheep)",
    "Visit a lavender farm",
    "Ginger Island-style beach vacation",
  ],
  adventure: [
    "Visit an actual sheep farm",
    "Stargaze somewhere really dark",
    "Sunrise hike with breakfast at the top",
    "Kayak or paddleboard day",
    "Pumpkin patch + corn maze",
    "Apple picking",
    "Strawberry picking (Egg Festival energy)",
    "Tide-pooling at low tide",
    "Go whale watching",
    "Hike to a waterfall",
    "Find a hidden beach",
    "Go horseback riding",
    "Escape room (no hints!)",
    "Renaissance faire in full costume",
    "Ride every coaster at the theme park",
    "Go foraging (salmonberry season!)",
    "Go fishing and actually catch something",
    "Geocaching treasure hunt",
    "Bike ride to somewhere new",
    "Watch a meteor shower",
    "See bioluminescent waves (Moonlight Jellies!)",
    "Haunted maze for Spirit's Eve",
    "Go to the county fair, win a prize",
    "Camping trip under the stars",
    "Spelunking in a real cave (Skull Cavern lite)",
  ],
  food: [
    "Bake a Pink Cake for real",
    "Make Pumpkin Soup from scratch",
    "Find the fanciest ramen in town",
    "Dumpling crawl",
    "Taco crawl: rate every taco",
    "Homemade pizza night (Saloon style)",
    "Bake cookies at midnight",
    "Fondue night",
    "Try a cuisine neither of us has had",
    "Brunch at the place with the long line",
    "Pancakes shaped like sheep",
    "Dessert-only dinner",
    "Build the ultimate snack board",
    "Ice cream taste test: 5 flavors, 1 winner",
    "Hot pot night",
    "Bake bread and eat it warm",
    "Food truck festival",
    "Three-course dinner at home, candles and all",
    "Make jam from fruit we picked",
    "Dim sum Sunday",
    "Try every pastry at one bakery",
    "Cook Gus's Spaghetti (with extra garlic)",
    "Luau potluck with friends",
  ],
  cozy: [
    "Blanket fort movie marathon",
    "Stardew co-op night (obviously)",
    "1000-piece puzzle night",
    "Rainy-day reading together",
    "Spa night at home",
    "Build a gingerbread house",
    "Board game tournament",
    "Bath + face masks + candles",
    "Studio Ghibli marathon",
    "Hot cocoa + drive around looking at lights",
    "Plant a little herb garden",
    "Write letters to future us",
    "Make a scrapbook of our year",
    "Pajama breakfast in bed",
    "Paint each other's portraits (badly)",
    "Start a new show from episode one",
    "Make a shared playlist",
    "Living-room floor picnic",
    "Two-person book club",
    "Sunday crossword in bed",
    "Draw our dream farm on paper",
    "No-phones lazy Sunday",
  ],
  other: [
    "Adopt a houseplant and name it",
    "Volunteer together for a day",
    "Photo booth strip, silly faces only",
    "Make a time capsule",
    "Learn 10 words in a new language",
    "Run a 5K (or walk it with snacks)",
    "Go to a concert",
    "$5 gift exchange: surprise each other",
    "Plant a tree together",
    "Pet a real sheep",
    "Donate a box of stuff we don't need",
    "Learn a dance from a video (badly)",
  ],
};

export const IDEAS: PlanIdea[] = (Object.keys(RAW) as Category[]).flatMap((category) =>
  RAW[category].map((name) => ({ name, category })),
);

// Shuffle bags so the dice doesn't repeat itself until it's been through the whole pile.
const bags = new Map<string, PlanIdea[]>();

function shuffled<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Roll a random idea, optionally from one category. Skips `avoid` (the current name) and,
 * when possible, anything already in `taken` (lower-cased names of sheep on the farm).
 */
export function rollIdea(category?: Category | null, avoid?: string, taken?: ReadonlySet<string>): PlanIdea {
  const key = category ?? "*";
  const pool = category ? IDEAS.filter((i) => i.category === category) : IDEAS;
  let fallback: PlanIdea | null = null;
  for (let tries = 0; tries < pool.length + 1; tries++) {
    let bag = bags.get(key);
    if (!bag || bag.length === 0) {
      bag = shuffled(pool);
      bags.set(key, bag);
    }
    const idea = bag.pop()!;
    if (idea.name === avoid && pool.length > 1) continue;
    fallback ??= idea;
    if (!taken?.has(idea.name.toLowerCase())) return idea;
  }
  return fallback ?? pool[0]!;
}

/** A handful of placeholder examples for the name field. */
export const PLACEHOLDERS = [
  "e.g. Pottery class",
  "e.g. Weekend in Big Sur",
  "e.g. Bake a Pink Cake",
  "e.g. Stargaze somewhere dark",
  "e.g. Night market date",
  "e.g. Visit a lavender farm",
];
