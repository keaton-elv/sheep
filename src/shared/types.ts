// Shared between the Worker (src/worker) and the game (src/client).
// Every todo is a sheep. Finishing it = shearing it.

export const CATEGORIES = ["date", "workshop", "travel", "adventure", "food", "cozy", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  date: "Date",
  workshop: "Workshop",
  travel: "Travel",
  adventure: "Adventure",
  food: "Food",
  cozy: "Cozy",
  other: "Other",
};

/** Max half-hearts a sheep can have (5 full hearts, like Stardew). */
export const MAX_PETS = 10;
/** A sheared sheep hangs around the pasture this long before retiring to the barn. */
export const RETIRE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Wool needed per loom batch, and how long the loom takes (4 in-game hours = 168 real seconds). */
export const LOOM_WOOL_COST = 5;
export const LOOM_DURATION_MS = 168 * 1000;

export const LIMITS = {
  name: 80,
  notes: 2000,
  link: 500,
  memory: 1000,
  farmName: 40,
} as const;

export interface Sheep {
  id: string;
  /** The plan itself, e.g. "Pottery class". Shown as the sheep's name. */
  name: string;
  notes: string;
  /** Optional http(s) URL. Empty string when unset. */
  link: string;
  category: Category;
  /** Optional planned day, "YYYY-MM-DD" (local calendar day, no timezone). */
  date: string | null;
  createdAt: number;
  /** Half-hearts, 0..MAX_PETS. Each pet adds one. */
  pets: number;
  lastPetAt: number | null;
  /** When the plan was done (sheep sheared). null = still woolly / still to do. */
  shearedAt: number | null;
  /** Optional little note written after doing the thing. */
  memory: string;
  /** Rare easter egg: a golden sheep gives 2 wool. Decided by the server at purchase. */
  golden: boolean;
  /** Stable random seed (0..2^31) for spawn position, personality, idle quirks. */
  seed: number;
}

export const DECOR_KINDS = [
  "scarecrow",
  "rarecrow",
  "flowers",
  "lamppost",
  "campfire",
  "haybale",
  "beehouse",
  "pumpkin",
  "tree",
  "pond",
  "gnome",
  "sheepstatue",
] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** Cloth cost of each decoration in Robin's shop. */
export const DECOR_COST: Record<DecorKind, number> = {
  scarecrow: 1,
  flowers: 1,
  haybale: 1,
  pumpkin: 1,
  lamppost: 2,
  campfire: 2,
  beehouse: 2,
  tree: 2,
  rarecrow: 3,
  gnome: 3,
  pond: 4,
  sheepstatue: 5,
};

export interface Decoration {
  id: string;
  kind: DecorKind;
  /** Position as a fraction (0..1) of the pasture rectangle, so it survives screen-size changes. */
  fx: number;
  fy: number;
  /** Variant index for kinds with several looks (e.g. rarecrow #1-8). */
  variant: number;
  createdAt: number;
}

export interface LoomState {
  startedAt: number;
  readyAt: number;
}

export type FarmEventKind = "bought" | "sheared" | "unsheared" | "sold" | "loomed" | "decorated" | "renamed";

/** Things that happened on the farm, shown as letters in the mailbox. */
export interface FarmEvent {
  id: number;
  at: number;
  kind: FarmEventKind;
  /** Human-readable subject, e.g. the sheep's name or the decoration kind. */
  subject: string;
  sheepId: string | null;
}

export interface FarmState {
  farmName: string;
  foundedAt: number;
  /** Wool sitting in the chest. */
  wool: number;
  cloth: number;
  /** Lifetime wool ever sheared (for milestones/stardrops). */
  totalWool: number;
  loom: LoomState | null;
  decorations: Decoration[];
  sheep: Sheep[];
  /** Most recent events first, capped (~50). */
  events: FarmEvent[];
  /** Server clock at the time this snapshot was made (ms), for clock-skew correction. */
  serverNow: number;
}

// ---------- API payloads ----------

export interface NewSheepInput {
  name: string;
  notes?: string;
  link?: string;
  category?: Category;
  date?: string | null;
}

export type SheepPatch = Partial<Pick<Sheep, "name" | "notes" | "link" | "category" | "date" | "memory">>;

export interface PetInput {
  /** Random id kept in this browser's localStorage, so each device can pet each sheep once a day. */
  deviceId: string;
  /** The device's local calendar day "YYYY-MM-DD". */
  day: string;
}

export interface PetResult {
  petted: boolean;
  sheep: Sheep;
}

export interface ShearInput {
  memory?: string;
}

export interface BuyDecorInput {
  kind: DecorKind;
  fx: number;
  fy: number;
  variant?: number;
}

export interface MoveDecorInput {
  fx: number;
  fy: number;
}

export type WeatherKind = "sunny" | "cloudy" | "rain" | "storm" | "snow" | "fog" | "windy";

export interface Weather {
  kind: WeatherKind;
  /** °C, may be null when unknown. */
  tempC: number | null;
  city: string | null;
  isDay: boolean;
}

// ---------- WebSocket messages (server -> client) ----------

export type ServerMessage =
  | { type: "state"; state: FarmState }
  /** Something happened, so other open clients can play the animation (snip, heart, etc.). */
  | { type: "event"; event: FarmEvent; origin: string | null }
  | { type: "pet"; sheepId: string; origin: string | null };

// ---------- WebSocket messages (client -> server) ----------

export type ClientMessage = { type: "hello"; clientId: string } | { type: "ping" };
