// Hats for sheep, from the animal hats sheet (sprites/animal_hats.png).
// Sheet layout (Stardew's hats sheet): 12 columns x 20px; each hat is a 20x80 strip of 4 frames
// stacked vertically: front (down), right, left, back (up). Hat id = row * 12 + column.
//
// Besides the picker contract (hatChoices / hatName / hatIcon) this module knows where a hat
// sits on every sheep frame: per-look head anchors measured from the woolly, sheared and lamb
// sheets (the head bobs while walking and dips while grazing), so sheep.ts can just ask
// hatPlacement() and drawHat().

import { MAX_HAT_ID } from "../../shared/types";
import { SHEETS, sheet } from "../engine/sprites";

// Registered at import time, before loadSprites() runs. `??=` keeps whoever else maps it.
SHEETS.animalHats ??= "sprites/animal_hats.png";

/** Hat frames are 20x20 cells. */
export const HAT_SIZE = 20;
const SHEET_COLS = 12;

// ---------- the curated hats ----------

/**
 * The hats that read clearly on a sheep, in picker order, with friendly names. Official Stardew
 * names where they fit; anything named after a villager got a new name.
 */
const CURATED: readonly (readonly [id: number, name: string])[] = [
  // Classics
  [0, "Cowboy Hat"],
  [2, "Top Hat"],
  [4, "Straw Hat"],
  [1, "Bowler Hat"],
  [19, "Fedora"],
  [3, "Sombrero"],
  [33, "Cowgal Hat"],
  [7, "Plum Chapeau"],
  [6, "Blue Bonnet"],
  // Cozy
  [53, "Beanie"],
  [55, "Fishing Hat"],
  [28, "Souwester"],
  [20, "Cool Cap"],
  // Bows & ears
  [77, "Pink Bow"],
  [22, "Polka Bow"],
  [21, "Lucky Bow"],
  [31, "Mouse Ears"],
  [32, "Cat Ears"],
  // Garden & critters
  [42, "Mushroom Cap"],
  [86, "Blueberry Hat"],
  [40, "Living Hat"],
  [23, "Gnome's Cap"],
  [78, "Frog Hat"],
  [91, "Tiger Hat"],
  [43, "Dinosaur Hat"],
  // Silly
  [57, "Party Hat"],
  [68, "Propeller Hat"],
  [61, "Chef Hat"],
  [62, "Pirate Hat"],
  [27, "Hard Hat"],
  [110, "Mystery Hat"],
  // Seasonal
  [25, "Santa Hat"],
  [70, "Spooky Hat"],
];

/** Names for hats outside the curated list (if one ever turns up on a sheep). */
const OTHER_NAMES: Readonly<Record<number, string>> = {
  5: "Official Cap",
  8: "Skeleton Mask",
  9: "Goblin Mask",
  10: "Chicken Mask",
  11: "Earmuffs",
  12: "Delicate Bow",
  13: "Tropiclip",
  14: "Butterfly Bow",
  15: "Hunter's Cap",
  16: "Trucker Hat",
  17: "Sailor's Cap",
  18: "Good Ol' Cap",
  24: "Eye Patch",
  26: "Tiara",
  29: "Daisy",
  30: "Watermelon Band",
  34: "Cowpoke Hat",
  35: "Archer's Cap",
  36: "Panda Hat",
  37: "Blue Cowboy Hat",
  38: "Red Cowboy Hat",
  39: "Cone Hat",
  41: "Magic Hat",
  44: "Totem Mask",
  45: "Logo Cap",
  46: "Horned Helm",
  47: "Fashion Hat",
  48: "Pumpkin Mask",
  49: "Hair Bone",
  50: "Knight's Helmet",
  51: "Squire's Helmet",
  52: "Spotted Headscarf",
  54: "Floppy Beanie",
  56: "Blobfish Mask",
  58: "Blue Party Hat",
  59: "Green Party Hat",
  60: "Arcane Hat",
  63: "Flat Topped Hat",
  64: "Elegant Turban",
  65: "White Turban",
  66: "Garbage Hat",
  67: "Golden Mask",
  69: "Bridal Veil",
  71: "Copper Pan",
};

const CURATED_NAMES = new Map<number, string>(CURATED);

/** Curated hat ids offered in the hat picker (the ones that read well on a sheep). */
export function hatChoices(): number[] {
  return CURATED.map(([id]) => id);
}

/** Friendly name for a hat id. */
export function hatName(id: number): string {
  return CURATED_NAMES.get(id) ?? OTHER_NAMES[id] ?? "Fancy Hat";
}

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && id <= MAX_HAT_ID;
}

// ---------- sheet analysis (which frames are empty, where each hat's top is) ----------

/** Per hat: top opaque row of each of the 4 frames, -1 for an empty frame. */
const tops = new Map<number, readonly number[]>();
/** Per hat: opaque bounds of the front frame (for icons). */
const fronts = new Map<number, { x: number; y: number; w: number; h: number } | null>();
let pixels: Uint8ClampedArray | null | undefined; // undefined = not tried yet, null = unreadable
let pixelsOf: HTMLImageElement | null = null;

function sheetPixels(img: HTMLImageElement): Uint8ClampedArray | null {
  if (pixels !== undefined && pixelsOf === img) return pixels;
  pixelsOf = img;
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(img, 0, 0);
    pixels = ctx.getImageData(0, 0, img.width, img.height).data;
  } catch {
    // Tainted / unreadable: assume every frame is there.
    pixels = null;
  }
  tops.clear();
  fronts.clear();
  return pixels;
}

function cellOrigin(id: number, dir: number): { sx: number; sy: number } {
  return { sx: (id % SHEET_COLS) * HAT_SIZE, sy: Math.floor(id / SHEET_COLS) * HAT_SIZE * 4 + dir * HAT_SIZE };
}

function inSheet(img: HTMLImageElement, id: number): boolean {
  const { sx, sy } = cellOrigin(id, 3);
  return sx + HAT_SIZE <= img.width && sy + HAT_SIZE <= img.height;
}

function analyse(img: HTMLImageElement, id: number): readonly number[] {
  const px = sheetPixels(img);
  let t = tops.get(id);
  if (t) return t;
  if (!px) {
    t = [3, 3, 3, 3];
  } else {
    const out: number[] = [];
    let front: { x: number; y: number; w: number; h: number } | null = null;
    for (let dir = 0; dir < 4; dir++) {
      const { sx, sy } = cellOrigin(id, dir);
      let top = -1;
      let minX = HAT_SIZE, maxX = -1, minY = HAT_SIZE, maxY = -1;
      for (let y = 0; y < HAT_SIZE; y++) {
        for (let x = 0; x < HAT_SIZE; x++) {
          if (px[((sy + y) * img.width + sx + x) * 4 + 3]! === 0) continue;
          if (top < 0) top = y;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      out.push(top);
      if (dir === 0 && maxX >= 0) front = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
    fronts.set(id, front);
    t = out;
  }
  tops.set(id, t);
  return t;
}

// ---------- fallback hat (the hats sheet didn't load) ----------

/** A little straw boater with a red band, laid out in a 20x20 cell like the real hats. */
const FALLBACK_ROWS = [
  "",
  "",
  "",
  "",
  "",
  ".......oooooo",
  "......oHhhhhhdo",
  ".....oHhhhhhhhdo",
  ".....ohhhhhhhhdo",
  ".....oRRRRRRRRro",
  "..ooorRRRRRRRrrooo",
  ".oHhhhhhhhhhhhhhhdo",
  "..oddhhhhhhhhhhddo",
  "...oooddddddddooo",
];
const FALLBACK_PALETTE: Readonly<Record<string, string>> = {
  o: "#5b3420",
  H: "#ffe28c",
  h: "#e8b656",
  d: "#b87a34",
  R: "#d64048",
  r: "#9c2838",
};
const FALLBACK_TOP = 5;
let fallbackCell: HTMLCanvasElement | null = null;

function fallbackHat(): HTMLCanvasElement {
  if (fallbackCell) return fallbackCell;
  const c = document.createElement("canvas");
  c.width = c.height = HAT_SIZE;
  const ctx = c.getContext("2d");
  if (ctx) {
    FALLBACK_ROWS.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = FALLBACK_PALETTE[row[x]!];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  }
  fallbackCell = c;
  return c;
}

// ---------- drawing ----------

/** Hat sheet frame order: 0 front (facing down), 1 right, 2 left, 3 back (facing up). */
export type HatDir = 0 | 1 | 2 | 3;

interface Resolved {
  img: CanvasImageSource;
  sx: number;
  sy: number;
  flip: boolean;
  top: number;
}

/** Which cell to draw for a hat facing `dir` (empty frames borrow a mirrored neighbour). */
function resolve(id: number, dir: HatDir): Resolved | null {
  const img = sheet("animalHats");
  if (!img || !inSheet(img, id)) return { img: fallbackHat(), sx: 0, sy: 0, flip: dir === 2, top: FALLBACK_TOP };
  const t = analyse(img, id);
  if (t.every((v) => v < 0)) return { img: fallbackHat(), sx: 0, sy: 0, flip: dir === 2, top: FALLBACK_TOP };
  let d: number = dir;
  let flip = false;
  if (t[d]! < 0) {
    if (d === 1 && t[2]! >= 0) [d, flip] = [2, true];
    else if (d === 2 && t[1]! >= 0) [d, flip] = [1, true];
    else if (d === 3) return null; // a bow on the face just isn't visible from behind
    else if (t[0]! >= 0) d = 0;
    else return null;
  }
  const { sx, sy } = cellOrigin(id, d);
  return { img, sx, sy, flip, top: t[d]! };
}

/**
 * Draw hat `id` facing `dir` with its 20x20 cell's top-left at (x, y). Never throws.
 * Returns false when nothing was drawn.
 */
export function drawHat(ctx: CanvasRenderingContext2D, id: number, dir: HatDir, x: number, y: number): boolean {
  if (!validId(id)) return false;
  try {
    const r = resolve(id, dir);
    if (!r) return false;
    const dx = Math.round(x);
    const dy = Math.round(y);
    if (r.flip) {
      ctx.save();
      ctx.translate(dx + HAT_SIZE, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(r.img, r.sx, r.sy, HAT_SIZE, HAT_SIZE, 0, 0, HAT_SIZE, HAT_SIZE);
      ctx.restore();
    } else {
      ctx.drawImage(r.img, r.sx, r.sy, HAT_SIZE, HAT_SIZE, dx, dy, HAT_SIZE, HAT_SIZE);
    }
    return true;
  } catch {
    return false;
  }
}

/** Top opaque row of the hat's cell facing `dir` (so emote bubbles can float above it). */
export function hatTopRow(id: number, dir: HatDir): number | null {
  if (!validId(id)) return null;
  try {
    return resolve(id, dir)?.top ?? null;
  } catch {
    return null;
  }
}

// ---------- where the hat sits on each sheep frame ----------

/** Which sprite the sheep is wearing (a sheared sheep is always the adult sheared sprite). */
export type HatLook = "woolly" | "sheared" | "lamb";

/** Facing of each of the 20 sheep frames: 0 front, 1 side (drawn facing right), 2 back. */
const FACING: readonly (0 | 1 | 2)[] = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 0, 0, 1, 2, 0, 0, 0, 0];

/**
 * Head movement per frame relative to the idle frame of the same facing, found by matching
 * the head pixels across each sheet: the walk bob (+1 every other step), and the head dipping
 * into the grass while grazing (frames 16-19).
 */
const HEAD_SHIFT: Record<HatLook, readonly (readonly [number, number])[]> = {
  woolly: [[0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 0], [0, 1], [0, 0], [0, 1], [0, 4], [0, 6], [0, 6]],
  sheared: [[0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 2], [0, 3], [0, 5], [0, 5]],
  lamb: [[0, -1], [0, 0], [0, -1], [0, 0], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 1], [0, 0], [0, 0], [0, 1], [0, 0], [0, 0], [-1, 1], [0, 2], [0, 3]],
};

/**
 * Hat cell top-left (relative to the sheep frame's top-left) on the idle frame of each facing:
 * [front, side, back]. Front brims sit low over the forehead between the ears; side hats sit on
 * the head behind the snout; from behind the hat peeks over the back, tucked behind the wool
 * (drawn before the body) with the ears in front of it. Lambs have big low heads, so their
 * (adorably too big) hats ride lower.
 */
const BASE: Record<HatLook, readonly [readonly [number, number], readonly [number, number], readonly [number, number]]> = {
  woolly: [[6, 3], [15, 4], [6, -6]],
  sheared: [[6, 2], [15, 3], [6, -5]],
  lamb: [[6, 7], [16, 7], [6, -1]],
};

export interface HatPlacement {
  /** Hat cell top-left relative to the sheep frame's top-left. */
  x: number;
  y: number;
  /** Which hat frame to draw. */
  dir: HatDir;
  /** Draw before the body (seen from behind, the head is tucked behind the wool). */
  behind: boolean;
}

/**
 * Where the hat goes on sheep frame `frame` (0-19, the 4x5 sheep sheet layout). `flipped` =
 * the side frame is drawn mirrored to face left.
 */
export function hatPlacement(look: HatLook, frame: number, flipped: boolean): HatPlacement {
  const f = frame >= 0 && frame < FACING.length ? frame : 12;
  const facing = FACING[f]!;
  const base = (BASE[look] ?? BASE.woolly)[facing];
  const shift = (HEAD_SHIFT[look] ?? HEAD_SHIFT.woolly)[f]!;
  const x = base[0] + shift[0];
  const y = base[1] + shift[1];
  if (facing === 1) {
    // The frame is 32 wide and a hat cell 20: mirroring the cell's spot is 32 - 20 - x.
    return flipped ? { x: 12 - x, y, dir: 2, behind: false } : { x, y, dir: 1, behind: false };
  }
  return { x, y, dir: facing === 0 ? 0 : 3, behind: facing === 2 };
}

// ---------- DOM icon ----------

/** Front-facing hat icon as a crisp DOM canvas (for menus). Scaled with --px like spriteIcon. */
export function hatIcon(id: number, opts: { scale?: number } = {}): HTMLCanvasElement {
  const c = document.createElement("canvas");
  let src: CanvasImageSource = fallbackHat();
  let box = { x: 1, y: FALLBACK_TOP, w: 18, h: FALLBACK_ROWS.length - FALLBACK_TOP };
  let sx = 0;
  let sy = 0;
  try {
    const img = sheet("animalHats");
    if (validId(id) && img && inSheet(img, id)) {
      const t = analyse(img, id);
      const front = fronts.get(id);
      if (front) {
        src = img;
        box = front;
        ({ sx, sy } = cellOrigin(id, 0));
      } else if (t[0]! >= 0 && !fronts.has(id)) {
        // Pixels unreadable: show the whole cell.
        src = img;
        box = { x: 0, y: 0, w: HAT_SIZE, h: HAT_SIZE };
        ({ sx, sy } = cellOrigin(id, 0));
      }
    }
  } catch {
    // keep the fallback
  }
  c.width = box.w;
  c.height = box.h;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    try {
      ctx.drawImage(src, sx + box.x, sy + box.y, box.w, box.h, 0, 0, box.w, box.h);
    } catch {
      // nothing to draw
    }
  }
  c.className = "sv-sprite";
  c.style.setProperty("--w", String(box.w));
  c.style.setProperty("--h", String(box.h));
  c.style.setProperty("--s", String(opts.scale ?? 1));
  c.setAttribute("aria-hidden", "true");
  if (validId(id)) c.title = hatName(id);
  return c;
}
