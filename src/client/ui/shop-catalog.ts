// The carpenter's shop catalog: friendly names and one-liners for every decoration.

import type { DecorKind } from "../../shared/types";

export interface DecorInfo {
  name: string;
  desc: string;
  /** Shown if no art is registered for the decoration yet. */
  glyph: string;
}

export const DECOR_INFO: Record<DecorKind, DecorInfo> = {
  scarecrow: { name: "Scarecrow", desc: "Keeps the crows away. The sheep think he's their friend.", glyph: "☺" },
  rarecrow: { name: "Rarecrow", desc: "A very unusual scarecrow. Collect all 8!", glyph: "★" },
  flowers: { name: "Flower Patch", desc: "Smells like the Flower Dance...", glyph: "✿" },
  lamppost: { name: "Lamp-post", desc: "So nobody trips over a sheep at night.", glyph: "☼" },
  campfire: { name: "Campfire", desc: "Cozy crackle for stargazing. Marshmallows not included.", glyph: "♨" },
  haybale: { name: "Hay Bale", desc: "Snack and sofa in one. The sheep fully approve.", glyph: "▦" },
  beehouse: { name: "Bee House", desc: "Home for some very busy bees. Bzzz...", glyph: "⬢" },
  pumpkin: { name: "Pumpkin", desc: "A giant pumpkin. Spirit's Eve vibes all year round.", glyph: "●" },
  tree: { name: "Tree", desc: "A shady spot for naps... Zzz...", glyph: "♣" },
  pond: { name: "Pond", desc: "A little pond. Might be home to a legendary fish...", glyph: "≈" },
  gnome: { name: "Garden Gnome", desc: "He's watching the sheep. Lovingly. Constantly...", glyph: "♠" },
  sheepstatue: { name: "Sheep Statue", desc: "A grand monument to fluff.", glyph: "♛" },
};

export function decorName(kind: string): string {
  return (DECOR_INFO as Record<string, DecorInfo | undefined>)[kind]?.name ?? "decoration";
}

/** "Rarecrow #3", or "Flower Patch (2/4)" for other kinds with looks. */
export function variantLabel(kind: DecorKind, variant: number, count: number): string {
  if (count <= 1) return "";
  return kind === "rarecrow" ? `#${variant + 1}` : `${variant + 1}/${count}`;
}
