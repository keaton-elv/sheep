// Stardew Community Center–style bundles: put one of each listed item in, get cloth back.
// Items are the things you pick up around the farm (forage, tree seeds, dug-up artifacts) and the
// keepsakes rare visitors leave behind, stored in the shared chest as FarmState.items[key].

export interface Bundle {
  id: string;
  name: string;
  /** Item keys (sprite keys, e.g. "item.forage.blackberry"); one of each is consumed. */
  items: string[];
  /** Cloth you get for completing it. Bundles can be completed again and again. */
  reward: number;
}

const forage = (name: string) => `item.forage.${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
const artifact = (name: string) => `item.artifact.${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

// The order is the Community Center board's (three rows of four, read left to right). Never rename
// or re-id a bundle: completions are counted per id on the server (meta bundle_<id>), and the
// mailbox finds a bundle's sack by its name (see bundleNamed for the one that was renamed). Everything
// the farm gives belongs to exactly one bundle.
export const BUNDLES: Bundle[] = [
  { id: "spring", name: "Spring Foraging Bundle", items: ["Wild Horseradish", "Daffodil", "Leek", "Dandelion"].map(forage), reward: 1 },
  { id: "summer", name: "Summer Foraging Bundle", items: ["Spice Berry", "Grape", "Sweet Pea", "Fiddlehead Fern"].map(forage), reward: 1 },
  { id: "fall", name: "Fall Foraging Bundle", items: ["Common Mushroom", "Wild Plum", "Hazelnut", "Blackberry"].map(forage), reward: 1 },
  { id: "winter", name: "Winter Foraging Bundle", items: ["Winter Root", "Crystal Fruit", "Snow Yam", "Crocus", "Holly"].map(forage), reward: 1 },
  // Salmonberries, wild onions and morels: what spring tastes like around Bonney Lake, WA.
  { id: "wild", name: "Bonney Lake Bundle", items: ["Salmonberry", "Spring Onion", "Morel"].map(forage), reward: 1 },
  { id: "exotic", name: "Exotic Foraging Bundle", items: ["Red Mushroom", "Chanterelle", "Purple Mushroom", "Coffee Bean"].map(forage), reward: 2 },
  // Every tree on the farm is a ginkgo, and each farmer gets one thing out of them a day. (It was the
  // Tree Seed Bundle once, so it keeps that id: its completions are counted under "seeds".)
  { id: "seeds", name: "Ginkgo Bundle", items: ["Ginkgo Nut", "Ginkgo Leaf", "Twig"].map(forage), reward: 1 },
  { id: "junk", name: "Treasure Bundle", items: ["Rusty Spoon", "Rusty Cog", "Glass Shards"].map(artifact), reward: 1 },
  { id: "beach", name: "Beachcomber Bundle", items: ["Anchor", "Dried Starfish", "Chipped Amphora"].map(artifact), reward: 2 },
  // Sutro's museum of curios once stood over the baths at Lands End.
  { id: "antiques", name: "Sutro Baths Bundle", items: ["Arrowhead", "Ancient Doll", "Chicken Statue", "Ornamental Fan", "Lost Book"].map(artifact), reward: 2 },
  { id: "rare", name: "Rare Finds Bundle", items: ["Elvish Jewelry", "Bone Flute", "Rare Disc", "Dinosaur Egg"].map(artifact), reward: 3 },
  // Keepsakes the farm's rare visitors leave in the chest (see client entities/critter-keepsake.ts).
  {
    id: "research",
    name: "Field Research Bundle",
    items: ["Royal Honey", "Pocket Sunshine", "Blurry Photo", "Suspicious Fedora", "Stardust"].map(artifact),
    reward: 5,
  },
];

/** The bundle with this name, as the event log wrote it (older events may use a bundle's old name). */
export function bundleNamed(name: string): Bundle | undefined {
  return BUNDLES.find((b) => b.name === name) ?? (name === "Tree Seed Bundle" ? BUNDLES.find((b) => b.id === "seeds") : undefined);
}

/** Keys the server accepts into the chest: "item.forage.<name>" or "item.artifact.<name>". */
export const ITEM_KEY_PATTERN = /^item\.(forage|artifact)\.[a-z][a-z-]{0,39}$/;
