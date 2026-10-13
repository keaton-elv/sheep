// Builds and registers every sprite the farm world draws: real Stardew pieces cut from the sheets
// (craftables, deluxe barn, trees, forage...) plus hand-drawn art for things with no real sprite.
// Runs once in initWorld (after loadSprites), and again for seasonal art when the season turns.

import type { Season } from "../../shared/calendar";
import { DECOR_KINDS, type DecorKind } from "../../shared/types";
import { OBJECT_IDS, objectRegion } from "../art/regions";
import { draw, has, REGIONS, registerArt, type DrawOpts } from "../engine/sprites";
import {
  BANG,
  BILLBOARD,
  BUBBLE,
  CHEST_FALLBACK,
  FLAME,
  GNOME,
  LETTER,
  LOOM_FALLBACK,
  MAILBOX,
  MAILBOX_FLAG_UP,
  MINI_SHEEP,
  PUMPKIN,
  PUMPKIN_LIT,
  ZED,
  type ArtData,
} from "./world-artdata";
import {
  blitPx,
  cropPx,
  fruitTreePx,
  jackOLanternPx,
  newPx,
  pedestalPx,
  pondPx,
  rampPx,
  remapPx,
  rowsToPx,
  snowCapPx,
  type Px,
} from "./world-pixels";
import { CRAFT, craftRect, pxCanvas, sheetPx } from "./world-sheets";

/** Stardew item id of the Jack-O-Lantern in objects.png. */
const JACK_O_LANTERN = 746;

const art = (key: string, a: ArtData): HTMLCanvasElement => {
  const c = pxCanvas(rowsToPx(a.rows, a.pal));
  registerArt(key, c);
  return c;
};

/** Pixels of a craftable (null if craftables.png is missing). */
function craftPx(index: number): Px | null {
  const r = craftRect(index);
  return sheetPx("craftables", r.x, r.y, r.w, r.h);
}

/** Register a craftable under `key`, or hand-drawn fallback art when the sheet is missing. */
function craftArt(key: string, index: number, fallback: ArtData | null): Px | null {
  const px = craftPx(index);
  if (px) {
    registerArt(key, pxCanvas(px));
    return px;
  }
  if (fallback) {
    const fb = rowsToPx(fallback.rows, fallback.pal);
    registerArt(key, pxCanvas(fb));
    return fb;
  }
  return null;
}

/** Winter variants (snow on top) are registered as "<key>@winter" (key -> winter key). */
const winterKeys = new Map<string, string>();
function withWinter(key: string, px: Px | null, depth = 1, minY = 0): void {
  if (!px) return;
  const wk = `${key}@winter`;
  registerArt(wk, pxCanvas(snowCapPx(px, depth, { minY })));
  winterKeys.set(key, wk);
}

/** Draw a world sprite, using its snowy variant in winter when there is one. */
export function drawArt(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, season: Season, opts?: DrawOpts): boolean {
  if (season === "winter") {
    const wk = winterKeys.get(key);
    if (wk) return draw(ctx, wk, x, y, opts);
  }
  return draw(ctx, key, x, y, opts);
}

// ---------- decorations ----------

export const DECOR_VARIANTS: Partial<Record<DecorKind, number>> = { rarecrow: 8, scarecrow: 2, lamppost: 2, haybale: 2 };

/** Names for kinds with several looks (for the carpenter's shop labels). Looks, never people. */
export const VARIANT_NAMES: Partial<Record<DecorKind, string[]>> = {
  rarecrow: ["Spooky Skeleton", "Pointy Hat", "Little Green Visitor", "Snowman", "Pigtails", "Hoodie", "Big Grey Mouse", "Tiki Pumpkin"],
  scarecrow: ["Scarecrow", "Deluxe Scarecrow"],
  lamppost: ["Iron Lamp-post", "Wooden Lamp-post"],
  haybale: ["Hay Bale", "Wheat Bundle"],
};

/** Footprint info for drawing & hit-testing decorations (in-world size, centered on the feet). */
export interface DecorSize {
  w: number;
  h: number;
}

const decorSizes = new Map<string, DecorSize>();
export function decorSize(kind: DecorKind): DecorSize {
  return decorSizes.get(kind) ?? { w: 16, h: 24 };
}

export const STATUE_SHINE_FRAMES = 7;
export const FIRE_FRAMES = 4;

/** Pond pieces (rim over water, water mask for the ripples). */
export interface PondArt {
  rim: HTMLCanvasElement;
  water: HTMLCanvasElement;
  mask: Uint8Array;
  w: number;
  h: number;
}
const pondArt = new Map<Season, PondArt>();
export function getPond(season: Season): PondArt {
  let p = pondArt.get(season);
  if (!p) {
    const raw = pondPx(season);
    p = { rim: pxCanvas(raw.rim), water: pxCanvas(raw.water), mask: raw.mask, w: raw.rim.width, h: raw.rim.height };
    pondArt.set(season, p);
  }
  return p;
}

/** Lily pad bobbing frames from the outdoors sheet (or one hand-drawn pad), and a tiny flowering pad. */
export let lilyPads: HTMLCanvasElement[] = [];
export let miniPad: HTMLCanvasElement | null = null;

function buildDecorations(): void {
  withWinter("decor.scarecrow.0", craftArt("decor.scarecrow.0", CRAFT.scarecrow, null));
  withWinter("decor.scarecrow.1", craftArt("decor.scarecrow.1", CRAFT.deluxeScarecrow, null));
  withWinter("decor.lamppost.1", craftArt("decor.lamppost.1", CRAFT.woodLamp, null));
  withWinter("decor.haybale.1", craftArt("decor.haybale.1", CRAFT.wheatBundle, null), 2);
  CRAFT.rarecrows.forEach((idx, v) => withWinter(`decor.rarecrow.${v}`, craftArt(`decor.rarecrow.${v}`, idx, null)));
  withWinter("decor.lamppost.0", craftArt("decor.lamppost.0", CRAFT.ironLamp, null));
  withWinter("decor.haybale.0", craftArt("decor.haybale.0", CRAFT.hayBale, null), 2);
  withWinter("decor.beehouse.0", craftArt("decor.beehouse.0", CRAFT.beeHouse, null), 2);
  withWinter("world.beehouse.honey", craftArt("world.beehouse.honey", CRAFT.beeHouseHoney, null), 2);

  // Campfire: stone ring + logs, with a flame on top for the shop icon.
  const camp = craftPx(CRAFT.campfire);
  const fire0 = fireFrames[0] ?? null;
  if (camp) {
    registerArt("world.campfire.base", pxCanvas(camp));
    const icon = newPx(16, 32);
    blitPx(icon, camp, 0, 0);
    if (fire0) blitPx(icon, fire0, 0, 8);
    registerArt("decor.campfire.0", pxCanvas(icon));
  }

  // The pumpkin is Stardew's real Jack-O-Lantern; its carved face glows at night.
  const jr = objectRegion(JACK_O_LANTERN);
  const jack = sheetPx(jr.sheet, jr.x, jr.y, jr.w, jr.h);
  if (jack) {
    const j = jackOLanternPx(jack);
    registerArt("decor.pumpkin.0", pxCanvas(j.base));
    withWinter("decor.pumpkin.0", j.base);
    registerArt("world.pumpkin.lit", pxCanvas(j.lit));
  } else {
    const pumpkin = rowsToPx(PUMPKIN.rows, PUMPKIN.pal);
    registerArt("decor.pumpkin.0", pxCanvas(pumpkin));
    withWinter("decor.pumpkin.0", pumpkin);
    registerArt("world.pumpkin.lit", pxCanvas(rowsToPx(PUMPKIN_LIT.rows, PUMPKIN_LIT.pal)));
  }

  const gnome = rowsToPx(GNOME.rows, GNOME.pal);
  registerArt("decor.gnome.0", pxCanvas(gnome));
  withWinter("decor.gnome.0", gnome);

  // Pond icon: rim over water.
  const pond = pondPx("spring");
  const pondIcon = newPx(pond.rim.width, pond.rim.height);
  blitPx(pondIcon, pond.water, 0, 0);
  blitPx(pondIcon, pond.rim, 0, 0);
  registerArt("decor.pond.0", pxCanvas(pondIcon));
  lilyPads = [];
  for (let i = 0; i < 4; i++) {
    const lily = sheetPx("outdoorsSpring", 288 + i * 16, 816, 16, 16);
    if (lily) lilyPads.push(pxCanvas(lily));
  }
  if (!lilyPads.length) lilyPads.push(pxCanvas(rowsToPx([".gGGg.", "gGGGGo", "gGGGgo", ".ogoo."], { g: "#3f8a3a", G: "#6cc04a", o: "#2a4a2a" })));
  miniPad = pxCanvas(rowsToPx(["..pP...", ".gpPGg.", "gGGGGgo", ".oggoo."], { g: "#3f8a3a", G: "#6cc04a", o: "#2a4a2a", p: "#ff8ab8", P: "#ffd0e4" }));

  buildStatue();

  decorSizes.set("scarecrow", { w: 16, h: 32 });
  decorSizes.set("rarecrow", { w: 16, h: 32 });
  decorSizes.set("lamppost", { w: 12, h: 32 });
  decorSizes.set("haybale", { w: 16, h: 19 });
  decorSizes.set("beehouse", { w: 16, h: 31 });
  decorSizes.set("campfire", { w: 16, h: 18 });
  decorSizes.set("pumpkin", { w: 16, h: 16 });
  decorSizes.set("gnome", { w: 12, h: 19 });
  decorSizes.set("pond", { w: pond.rim.width, h: pond.rim.height });
  decorSizes.set("flowers", { w: 16, h: 30 });
  decorSizes.set("tree", { w: 30, h: 44 });
  decorSizes.set("sheepstatue", { w: 24, h: 36 });
}

/** The golden sheep statue: the real sheep sprite, gilded, on a stone pedestal. */
function buildStatue(): void {
  // Frame 12: idle, facing you. The face and ears read much better in gold than the side view.
  const sheepPx = sheetPx("sheep", 0, 96, 32, 32);
  const W = 32;
  const H = 40;
  const base = newPx(W, H);
  const ped = pedestalPx();
  blitPx(base, ped, 5, H - ped.height);
  let gold: Px | null = null;
  if (sheepPx) {
    // Drop the soft shadow (semi-transparent) before gilding.
    const solid = newPx(32, 32);
    for (let i = 0; i < sheepPx.data.length; i += 4) {
      if (sheepPx.data[i + 3]! < 200) continue;
      for (let c = 0; c < 4; c++) solid.data[i + c] = sheepPx.data[i + c]!;
    }
    const gilded = rampPx(solid, ["#4a2604", "#7a4a0c", "#b47618", "#dca02a", "#f6c83c", "#ffe680", "#fff6c8"], { contrast: 1.35, bias: -0.14 });
    // A crisp dark-gold outline so it reads as a statue at 1x, not a fuzzy blob.
    gold = newPx(32, 32);
    gold.data.set(gilded.data);
    const solidAt = (x: number, y: number) => x >= 0 && y >= 0 && x < 32 && y < 32 && gilded.data[(y * 32 + x) * 4 + 3]! > 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (solidAt(x, y) || !(solidAt(x - 1, y) || solidAt(x + 1, y) || solidAt(x, y - 1) || solidAt(x, y + 1))) continue;
        const o = (y * 32 + x) * 4;
        gold.data[o] = 0x5a;
        gold.data[o + 1] = 0x2e;
        gold.data[o + 2] = 0x06;
        gold.data[o + 3] = 255;
      }
    }
  } else {
    // No sheep sheet: a chunky golden blob of a sheep.
    gold = rowsToPx(
      [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "...........oooooo...............",
        ".........ooYYYYYYoo.....ooo.....",
        "........oYYYYYYYYYYo...oyYYo....",
        ".......oYYWYYYYYYYYYooooyYyYo...",
        ".......oYWYYYYYYYYYYYYYYYyyYo...",
        "......oYYYYYYYYYYYYYYYYyyyyo....",
        "......oYYYYYYYYYYYYYYYYyyyo.....",
        "......oyYYYYYYYYYYYYYYYyyo......",
        ".......oyyYYYYYYYYYYYyyyo.......",
        "........oyyyyyyyyyyyyyyo........",
        ".........oyyoooooooyyo..........",
        ".........oyo.......oyo..........",
        ".........oyo.......oyo..........",
        ".........ooo.......ooo..........",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
      ],
      { o: "#5a3206", Y: "#e8b030", y: "#b87818", W: "#fff1a8" },
    );
  }
  blitPx(base, gold, 0, H - ped.height + 1 - 28);
  registerArt("decor.sheepstatue.0", pxCanvas(base));
  // Shine frames: a bright diagonal band sweeping across the gold.
  for (let f = 0; f < STATUE_SHINE_FRAMES; f++) {
    const frame = newPx(W, H);
    frame.data.set(base.data);
    const c = -6 + f * 9;
    const top = H - ped.height + 1 - 28;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const gi = (y * 32 + x) * 4;
        if (gold.data[gi + 3]! < 200) continue;
        const d = x + y * 0.6 - c - 12;
        if (d < 0 || d > 2.5) continue;
        const oi = ((top + y) * W + x) * 4;
        if (top + y < 0 || top + y >= H) continue;
        frame.data[oi] = 255;
        frame.data[oi + 1] = d < 1.2 ? 255 : 246;
        frame.data[oi + 2] = d < 1.2 ? 240 : 190;
      }
    }
    registerArt(`world.statue.shine.${f}`, pxCanvas(frame));
  }
}

// ---------- seasonal decorations ----------

let builtSeason: Season | null = null;

/**
 * Autumn palette for the real Tub o' Flowers (exact colors of its sprite): the blue blooms turn
 * sunflower gold, the purple ones crimson and peach, and the leaves go a warm olive. The reds and
 * oranges are autumnal already, and the soft shadow under the tub is left alone.
 */
const FALL_TUB: Record<string, string> = {
  "#14347a": "#7a3c0a",
  "#3f60a8": "#d4861a",
  "#6c8fdd": "#eeb030",
  "#45aae0": "#ffc83a",
  "#a8c3ff": "#ffeb8c",
  "#7b3e8f": "#82222a",
  "#c172c1": "#cc4436",
  "#f7b4d8": "#ffb48a",
  "#005015": "#2f5a1a",
  "#009c14": "#5e9420",
  "#3ed94b": "#a6c83a",
  "#3a652b": "#4a5a22",
};

/** (Re)build the decorations that change with the seasons. Cheap; call on season change. */
export function buildSeasonalArt(season: Season): void {
  if (builtSeason === season) return;
  builtSeason = season;
  // Tub o' Flowers: the real blooms in spring & summer, autumn colors in fall, the real empty tub
  // (with snow on it) in winter.
  const tub = craftPx(CRAFT.tubOFlowers);
  if (tub) {
    let look: Px = tub;
    if (season === "fall") look = remapPx(tub, FALL_TUB);
    if (season === "winter") {
      const empty = craftPx(CRAFT.tubEmpty);
      look = empty ? snowCapPx(empty, 2) : snowCapPx(tub, 1);
    }
    registerArt("decor.flowers.0", pxCanvas(look));
  } else {
    registerArt("decor.flowers.0", pxCanvas(rowsToPx(["..pPp.yYy..", ".pPPPpYYYy.", "..gpggygg..", ".ooooooooo.", ".oWWWWWWwo.", ".oWWWWWWwo.", "..ooooooo.."], { p: "#e8608a", P: "#ff9ab6", y: "#e8b030", Y: "#ffe07a", g: "#4a9a34", o: "#3b1f12", W: "#c98a4b", w: "#8a5229" })));
  }
  registerArt("decor.tree.0", pxCanvas(fruitTreePx(season)));
}

// ---------- machines, mail, signs ----------

export let fireFrames: Px[] = [];

function buildObjects(): void {
  const loom0 = craftArt("world.loom.0", CRAFT.loom, LOOM_FALLBACK);
  const loom1 = craftArt("world.loom.1", CRAFT.loomWorking, LOOM_FALLBACK);
  withWinter("world.loom.0", loom0);
  withWinter("world.loom.1", loom1);

  const chest = craftPx(CRAFT.chest);
  if (chest) {
    registerArt("world.chest", pxCanvas(chest));
    withWinter("world.chest", chest);
    CRAFT.chestLid.forEach((idx, i) => {
      const lid = craftPx(idx);
      if (lid) {
        registerArt(`world.chest.lid.${i}`, pxCanvas(lid));
        if (i === 0) withWinter(`world.chest.lid.${i}`, lid);
      }
    });
  } else {
    // Fallback chest is a single 16x14 sprite; pad it into a 16x32 cell so anchoring matches.
    const fb = rowsToPx(CHEST_FALLBACK.rows, CHEST_FALLBACK.pal);
    const cell = newPx(16, 32);
    blitPx(cell, fb, 0, 32 - fb.height);
    registerArt("world.chest", pxCanvas(cell));
  }

  const mb0 = rowsToPx(MAILBOX.rows, MAILBOX.pal);
  const mb1 = rowsToPx(MAILBOX_FLAG_UP.rows, MAILBOX_FLAG_UP.pal);
  registerArt("world.mailbox.0", pxCanvas(mb0));
  registerArt("world.mailbox.1", pxCanvas(mb1));
  withWinter("world.mailbox.0", mb0, 2);
  withWinter("world.mailbox.1", mb1, 1, 3);

  const bb = rowsToPx(BILLBOARD.rows, BILLBOARD.pal);
  registerArt("world.billboard", pxCanvas(bb));
  withWinter("world.billboard", bb, 2);

  // The farm sign: Stardew's wood sign, displaying a tiny painted sheep (signs can show items!).
  const sign = craftPx(CRAFT.woodSign);
  const mini = rowsToPx(MINI_SHEEP.rows, MINI_SHEEP.pal);
  if (sign) {
    const s = cropPx(sign, 0, 0, 16, 32);
    blitPx(s, mini, 3, 7);
    registerArt("world.sign", pxCanvas(s));
    withWinter("world.sign", s, 2);
  } else {
    const s = rowsToPx(
      [
        "................",
        "................",
        "................",
        ".oooooooooooooo.",
        "oWWWWWWWWWWWWWwo",
        "oWwwwwwwwwwwwwwo",
        "oWwwwwwwwwwwwwwo",
        "oWwwwwwwwwwwwwwo",
        "oWwwwwwwwwwwwwwo",
        "oWwwwwwwwwwwwwwo",
        "oWwwwwwwwwwwwwwo",
        "oWwwwwwwwwwwwwwo",
        "oWwwwwwwwwwwwwwo",
        "okkkkkkkkkkkkkko",
        ".oooooooooooooo.",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        "......okWo......",
        ".....okkWwo.....",
        "....ssssssss....",
        "................",
      ],
      { o: "#3b1f12", W: "#d39a5a", w: "#a86e3c", k: "#6b3d1f", s: "rgba(40,20,60,0.25)" },
    );
    blitPx(s, mini, 3, 6);
    registerArt("world.sign", pxCanvas(s));
  }

  art("world.crate", CHEST_FALLBACK);
  art("world.bubble", BUBBLE);
  art("world.letter", LETTER);
  art("world.bang", BANG);
  art("world.zed", ZED);

  // Fire: the real 4-frame flame from the animations sheet, or hand-drawn flames.
  fireFrames = [];
  for (let i = 0; i < FIRE_FRAMES; i++) {
    const f = sheetPx("animations", i * 16, 480, 16, 16);
    if (f) fireFrames.push(f);
  }
  if (fireFrames.length < FIRE_FRAMES) {
    fireFrames = [];
    for (let i = 0; i < FIRE_FRAMES; i++) {
      const fl = rowsToPx(FLAME[i % FLAME.length]!.rows, FLAME[i % FLAME.length]!.pal);
      const cell = newPx(16, 16);
      blitPx(cell, fl, 3, 16 - fl.height - 1);
      fireFrames.push(cell);
    }
  }
  fireFrames.forEach((f, i) => registerArt(`world.fire.${i}`, pxCanvas(f)));
}

// ---------- forage ----------

/** Rare forage that can turn up in any season. */
export const COFFEE_BEAN = "Coffee Bean";

export interface ForageDef {
  name: string;
  key: string;
}

/**
 * Forage (and the seeds trees drop) are real objects.png icons, by Stardew item id. The ids the
 * shared regions module knows come from OBJECT_IDS; the rest are the same game's ids.
 */
const FORAGE_IDS: Record<string, number> = {
  "Wild Horseradish": 16,
  Daffodil: OBJECT_IDS.daffodil,
  Leek: OBJECT_IDS.leek,
  Dandelion: OBJECT_IDS.dandelion,
  "Spring Onion": 399,
  Salmonberry: 296,
  Morel: 257,
  "Common Mushroom": OBJECT_IDS.commonMushroom,
  "Spice Berry": OBJECT_IDS.spiceBerry,
  Grape: 398,
  "Sweet Pea": OBJECT_IDS.sweetPea,
  "Fiddlehead Fern": 259,
  "Red Mushroom": 420,
  Blackberry: OBJECT_IDS.blackberry,
  Hazelnut: OBJECT_IDS.hazelnut,
  "Wild Plum": 406,
  Chanterelle: 281,
  "Purple Mushroom": 422,
  "Crystal Fruit": OBJECT_IDS.crystalFruit,
  Holly: OBJECT_IDS.holly,
  "Snow Yam": 416,
  "Winter Root": 412,
  Crocus: 418,
  Acorn: 309,
  "Maple Seed": 310,
  "Pine Cone": 311,
  [COFFEE_BEAN]: 433,
};

export const FORAGE_BY_SEASON: Record<Season, string[]> = {
  spring: ["Wild Horseradish", "Daffodil", "Leek", "Dandelion", "Spring Onion", "Salmonberry", "Morel", "Common Mushroom"],
  summer: ["Spice Berry", "Grape", "Sweet Pea", "Fiddlehead Fern", "Red Mushroom", "Common Mushroom"],
  fall: ["Blackberry", "Hazelnut", "Wild Plum", "Common Mushroom", "Chanterelle", "Red Mushroom", "Purple Mushroom"],
  winter: ["Crystal Fruit", "Holly", "Snow Yam", "Winter Root", "Crocus"],
};

export function forageKey(name: string): string {
  return `item.forage.${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
}

// Registered at import, so the icons work in toasts and menus as soon as objects.png loads.
for (const [name, id] of Object.entries(FORAGE_IDS)) REGIONS[forageKey(name)] ??= objectRegion(id);

/** A little red berry sprig, for every forage key, in case objects.png never loads. */
function buildForage(): void {
  const generic = rowsToPx(
    ["....gg....", "...gGGg...", "..gGgg....", ".oRRoRRo..", "oRWRRRRRo.", "oRRRRRRRo.", ".oRRRRRo..", "..ooooo..."],
    { g: "#3f8a3a", G: "#6cc04a", o: "#4a1020", R: "#d8344a", W: "#ffd0d8" },
  );
  const cell = newPx(16, 16);
  blitPx(cell, generic, 3, 6);
  for (const name of Object.keys(FORAGE_IDS)) registerArt(forageKey(name), pxCanvas(cell));
}

// ---------- entry ----------

let built = false;

/** Any decoration still without art (its sheet failed to load) gets the crate, so shop icons work. */
function fillMissingDecor(): void {
  for (const kind of DECOR_KINDS) {
    const n = DECOR_VARIANTS[kind] ?? 1;
    for (let v = 0; v < n; v++) {
      const key = `decor.${kind}.${v}`;
      if (!has(key)) registerArt(key, pxCanvas(rowsToPx(CHEST_FALLBACK.rows, CHEST_FALLBACK.pal)));
    }
  }
}

export function buildWorldArt(season: Season): void {
  if (!built) {
    built = true;
    buildObjects();
    buildDecorations();
    buildForage();
  }
  buildSeasonalArt(season);
  fillMissingDecor();
}
