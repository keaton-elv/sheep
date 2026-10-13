// Stardew Community Center–style bundles: put one of each listed item in, get cloth back.
// Items are the things you pick up around the farm (forage, tree seeds, dug-up artifacts),
// stored in the shared chest as FarmState.items[key].

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

export const BUNDLES: Bundle[] = [
  { id: "spring", name: "Spring Foraging Bundle", items: ["Wild Horseradish", "Daffodil", "Leek", "Dandelion"].map(forage), reward: 1 },
  { id: "summer", name: "Summer Foraging Bundle", items: ["Spice Berry", "Grape", "Sweet Pea"].map(forage), reward: 1 },
  { id: "fall", name: "Fall Foraging Bundle", items: ["Common Mushroom", "Wild Plum", "Hazelnut", "Blackberry"].map(forage), reward: 1 },
  { id: "winter", name: "Winter Foraging Bundle", items: ["Winter Root", "Crystal Fruit", "Snow Yam", "Crocus"].map(forage), reward: 1 },
  { id: "seeds", name: "Tree Seed Bundle", items: ["Acorn", "Maple Seed", "Pine Cone"].map(forage), reward: 1 },
  { id: "junk", name: "Treasure Bundle", items: ["Rusty Spoon", "Rusty Cog", "Glass Shards"].map(artifact), reward: 1 },
];

/** Keys the server accepts into the chest: "item.forage.<name>" or "item.artifact.<name>". */
export const ITEM_KEY_PATTERN = /^item\.(forage|artifact)\.[a-z][a-z-]{0,39}$/;
