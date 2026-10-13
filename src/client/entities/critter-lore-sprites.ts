// Hand-drawn pixel art for the newer critters (one char = one pixel, "." = transparent), kept
// import-free like critter-sprites.ts so it can be previewed outside the browser. Real Stardew
// frames (parrots, seagulls, the opossum's walk, running raccoons) live in critter-lore-art.ts.

import type { PixelSprite } from "./critter-sprites";

/** The opossum's own colors, picked straight off its frames in critters.png. */
export const POSSUM_PAL: Record<string, string> = {
  a: "#3d2626", // outline
  c: "#6b4e4e",
  d: "#8b6666",
  e: "#b29192",
  f: "#ff8caa", // nose & toes
  g: "#d5c4c4",
  h: "#ffeded", // face
  p: "#e86a8c", // tongue
  t: "#d9a3ad", // bare tail
};

/** Trench coat, fedora, and whatever is hiding inside. */
export const COAT_PAL: Record<string, string> = {
  o: "#3b2412", // outline
  H: "#6b4a36", // fedora
  h: "#8e6a4c",
  B: "#2a1a14", // hat band
  K: "#2c2230", // the shadow under the brim
  k: "#463a48",
  C: "#c9a066", // coat
  c: "#a47a44",
  L: "#e4c288",
  D: "#7a5530", // seams & belt
  b: "#e8c860", // buttons & buckle
  F: "#3a3036", // shoes (or paws...)
  f: "#5a4e56",
  G: "#a49aa2", // raccoon tail
  R: "#3a3036",
  S: "#5e3f2b", // hedgehog spines
  s: "#8a6444",
  t: "#c7a47a",
};

/** Banana slug (Ariolimax): very yellow, a few brown freckles, eye stalks up front. */
export const SLUG_PAL: Record<string, string> = { o: "#6a5214", Y: "#ffd84a", y: "#e8b030", h: "#fff2a0", s: "#c08a1c", k: "#3a2c0c" };

/** Anna's hummingbird: iridescent green, a magenta throat, wings a blur. */
export const HUMMER_PAL: Record<string, string> = {
  o: "#1c2a24",
  G: "#4fbf6a",
  g: "#2c8a4a",
  E: "#b9d8b0",
  M: "#e8306e",
  W: "rgba(230,245,255,0.8)",
  w: "rgba(200,220,240,0.55)",
  K: "#120c10",
  B: "#2a2226",
  T: "#2f5e40",
};

/** A wine glass: dark rim (it has to read on the red gingham), pale glass, red wine. */
export const GLASS_PAL: Record<string, string> = { o: "#2e2a3c", w: "#ffffff", g: "rgba(214,232,255,0.75)", R: "#7a1d4a", r: "#b8336a" };

const COAT_TOP = [
  ".....oooooo.....",
  "....ohhHoHHo....",
  "....ohHHHHHo....",
  "....oBBBBBBo....",
  "..ooHHHHHHHHoo..",
  ".ohhHHHHHHHHHHo.",
  "..ooKKKKKKKKoo..",
  "...oLKKkkKKLo...", // the eyes are drawn on top (they glance around, and glint at night)
  "...oLLKKKKLco...",
  "..oLCLoKKocCco..",
  ".oLCCCLoocCCcco.",
  ".oLCDCCLcCCDcco.",
  "oLCCDCbCCbCDccco",
  "oLCCDCCLcCCDccco",
  "oLCCDCbCCbCDccco",
  "oDDDDDDbDDDDDDDo",
  "oLCCDCCCCCCDccco",
  "oLCCDCbCCbCDccco",
  "oLCCcDCCCCDcccco",
  "oLCCKKCCCCKKccco",
  "oLCCCCCCCCCCccco",
  "oLLCCCCDCCCCccco",
  "ocLCCCCDCCCCcCco",
  "ocLCCCCDCCCCcCco",
  "ocLCCCCDCCCCcCco",
  "ocLLCCCDCCCCcCco",
  "ocLCCCDoDCCCccco",
  "oooooooooooooooo",
];

/** Where the trench coat's eyes go (left eye; the right one is 3px over). */
export const COAT_EYES = { x: 6, y: 7, gap: 3 } as const;

export const LORE_SPRITES: Record<string, PixelSprite> = {
  // Playing dead: on its back, legs in the air, X eyes, tongue out. Head on the right.
  "critter.opossum.dead": {
    pal: POSSUM_PAL,
    rows: [
      "........a....a....a....a..........",
      ".......afa..afa..afa..afa.........",
      ".......aca..aca..aca..aca.........",
      "........aca.aca..aca.aca..........",
      "........acaaacaaaaca.aca..........",
      "........aaahgggeggggaaa...........",
      ".......ahhheggggeggggega..........",
      "......aeeegdeeegdeeegdeeaaaaaa....",
      ".....agdeeegdeeegdeeegdeahhhhhaa..",
      "..a..acdddecdddecdddecdahhahahhhaa",
      ".ata.aecdddecdddecdddecahhhahhhhhf",
      "at...adecdddecdddecdddeahhahahhhpf",
      "at...tadccccdccccdccccdagghhhhhhpa",
      "a.ttta.adccccdccccdccccaacagggaapa",
      ".aaaa...aaacccdccccdaaa..aa.aa..a.",
      "........a..aaaaaaaaaa.............",
    ],
  },
  // A tall stranger in a trench coat and fedora, shuffling (two steps).
  "critter.trenchcoat.0": { pal: COAT_PAL, rows: [...COAT_TOP, "....oFFo..oFFo..", "...oFFfo..oFfFo."] },
  "critter.trenchcoat.1": { pal: COAT_PAL, rows: [...COAT_TOP, "...oFFo...oFFo..", "...oFfFo..oFfo.."] },
  // ...and all that's left of it afterwards.
  "critter.trenchcoat.pile": {
    pal: COAT_PAL,
    rows: [
      "......oooooo......",
      ".....ohhHHHo......",
      "...ooBBBBBBBoo....",
      "..oHHHHHHHHHHHoo..",
      ".ooLCCHHHHHHHCcoo.",
      "oLCCCDCCbCCCDCccco",
      "occcccccDcccccccco",
      ".oooooooooooooooo.",
    ],
  },
  // Tells: a ringed tail under the hem, or a tuft of spines.
  "critter.trenchcoat.tail": { pal: COAT_PAL, rows: [".....oo", "...ooGo", "..oRGRo", "ooGRGo.", "GRGoo.."] },
  "critter.trenchcoat.spines": { pal: COAT_PAL, rows: ["t.t..", "St.t.", "sStSt", "oSsSo", ".ooo."] },
  // Banana slug, sliming right: stretched, scrunched, and eye stalks tucked in (tapped).
  "critter.slug.0": {
    pal: SLUG_PAL,
    rows: [
      "...........k.k",
      "...........o.o",
      "....oooooooYoo",
      "..oohhhYYYYYYo",
      ".oyyYYsYYYYsYYo",
      "oyyyyyyyyyyyyyo",
      ".ooooooooooooo.",
    ],
  },
  "critter.slug.1": {
    pal: SLUG_PAL,
    rows: [
      "............k.k",
      "............o.o",
      ".....ooooooooYo",
      "...oohhhYYYYYYYo",
      "..oyyYYsYYYYYsYo",
      "ooyyyyyyyyyyyyyo",
      "..oooooooooooooo",
    ],
  },
  "critter.slug.tuck": {
    pal: SLUG_PAL,
    rows: [
      "..............",
      "..............",
      "....oooooooo..",
      "..oohhhYYYYYo.",
      ".oyyYYsYYYYsYo",
      "oyyyyyyyyyyyyo",
      ".oooooooooooo.",
    ],
  },
  // Hummingbird hovering, facing right (wings up / wings down).
  "critter.hummingbird.0": {
    pal: HUMMER_PAL,
    rows: [
      "..wW........",
      ".wWWw..oo...",
      "..wWw.oGGo..",
      "....ooGGKoBBB",
      "...oGGgMMo...",
      "..oGgEEMo....",
      ".oTgEEo......",
      "oTTo.o.......",
    ],
  },
  "critter.hummingbird.1": {
    pal: HUMMER_PAL,
    rows: [
      "............",
      ".......oo...",
      "......oGGo..",
      "....ooGGKoBBB",
      ".wwoGGgMMo...",
      "wwwGgEEMo....",
      ".oTgEEo......",
      "oTTo.o.......",
    ],
  },
  // A wine glass for Wine Wednesday (two of them, on the picnic blanket).
  "critter.wineglass": { pal: GLASS_PAL, rows: [".ooo.", "owggo", "orrRo", "oRRRo", ".oRo.", "..o..", ".ooo."] },
};
