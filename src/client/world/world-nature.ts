// Trees & bushes around the farm (tap: they shake, leaves flutter, often a seed drops; berry bushes
// drop berries in season; in fall one tree is a golden ginkgo that showers fan-shaped leaves), the
// day's seasonal forage (tap to pick it up, like the spring onions by the farmhouse), and most days a
// patch of wiggly worms: an artifact spot! Tap it to dig up a little treasure.
// Everything picked up goes into the shared chest (FarmState.items), where the bundles want it.

import { sfx } from "../audio";
import { BUNDLES } from "../../shared/bundles";
import { dayKey, type Season } from "../../shared/calendar";
import { rng, type Entity, type FarmEnv, type Game } from "../engine/game";
import { objectRegion } from "../art/regions";
import { draw, has, registerArt, REGIONS } from "../engine/sprites";
import { KEEPSAKE_KEYS, sendToChest } from "../entities/critter-keepsake";
import { store } from "../net";
import { toast } from "../ui/dom";
import { contains, fromFraction, inflate, type Layout, type Rect } from "./layout";
import { COFFEE_BEAN, FORAGE_BY_SEASON, forageKey } from "./world-art";
import { GINKGO_LEAF, GINKGO_LEAF_EDGE, GINKGO_LEAF_SMALL, type ArtData } from "./world-artdata";
import { dustPuff, fx, reducedMotion } from "./world-fx";
import type { Ground } from "./world-ground";
import { flipPx, hash2, remapPx, rowsToPx } from "./world-pixels";
import { onPond } from "./world-pond";
import { guard, safeOn } from "./world-safe";
import { canvasPx, ctx2d, cut, makeCanvasEl, pxCanvas } from "./world-sheets";
import { doorYard, keepClear, signFeet } from "./world-zones";

// ---------- art ----------

// Artifact spots & artifacts are real objects.png icons (the sheet keeps Stardew's item ids).
const ARTIFACT_SPOT = "world.artifactSpot";
REGIONS[ARTIFACT_SPOT] ??= objectRegion(590);

/**
 * What the worms were guarding: [name, Stardew item id, weight]. Mostly junk, sometimes a treasure.
 * Every one belongs to a bundle (Treasure, Beachcomber, Sutro Baths, Rare Finds); the weights keep
 * each of them filling in a month or two of short daily visits. (Changing a weight reshuffles which
 * artifact turns up on which date; nothing stored depends on it.)
 */
const ARTIFACTS: readonly [string, number, number][] = [
  // The Treasure Bundle's three come up most (short visits should still fill it).
  ["Rusty Spoon", 110, 8],
  ["Rusty Cog", 112, 7],
  ["Glass Shards", 118, 7],
  ["Arrowhead", 101, 5],
  ["Chipped Amphora", 100, 4],
  ["Ancient Doll", 103, 4],
  ["Chicken Statue", 113, 4],
  ["Ornamental Fan", 106, 4],
  ["Dried Starfish", 116, 4],
  ["Lost Book", 102, 4],
  ["Elvish Jewelry", 104, 2],
  ["Bone Flute", 119, 2],
  ["Anchor", 117, 3],
  ["Rare Disc", 108, 2],
  ["Dinosaur Egg", 107, 2],
];
const artifactKey = (name: string) => `item.artifact.${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
for (const [name, id] of ARTIFACTS) REGIONS[artifactKey(name)] ??= objectRegion(id);
const ARTIFACT_WEIGHT = ARTIFACTS.reduce((t, a) => t + a[2], 0);

function pickArtifact(r: number): string {
  let k = r * ARTIFACT_WEIGHT;
  for (const [name, , w] of ARTIFACTS) {
    k -= w;
    if (k < 0) return name;
  }
  return ARTIFACTS[0]![0];
}

/** Hand-drawn worms poking out of the dirt, used if objects.png is missing (the region wins otherwise). */
function registerSpotFallback(): void {
  const c = pxCanvas(
    rowsToPx(
      [
        "................",
        "................",
        "....o.....o.....",
        "...oPo...oPo....",
        "...oPo...oPo..o.",
        "....oPo..oPo.oPo",
        "....oPo...oPooPo",
        ".....oPo..oPPPo.",
        "..ddddPdddddPdd.",
        ".dDDDDDDDDDDDDDd",
        "..ddddddddddddd.",
        "................",
        "................",
        "................",
        "................",
        "................",
      ],
      { o: "#4a2030", P: "#e88aa0", d: "#6b4a2f", D: "#8a6040" },
    ),
  );
  registerArt(ARTIFACT_SPOT, c);
}

type TreeKind = "oak" | "maple" | "pine";
const TREE_KINDS: readonly TreeKind[] = ["oak", "maple", "pine"];

/** How often a shaken tree drops its seed (never in winter, like Stardew). */
const SEED_CHANCE = 0.35;

const SEASON_X: Record<Season, number> = { spring: 0, summer: 146, fall: 292, winter: 438 };

const TREE_DEF: Record<TreeKind, { top: number; bottom: number; winterBottom: number; cx: number; winterCx: number; leaves: [number, number, number, number][]; seed: string }> = {
  oak: { top: 0, bottom: 83, winterBottom: 83, cx: 24, winterCx: 22, leaves: [[16, 112, 5, 6], [25, 114, 4, 4], [18, 122, 5, 5]], seed: "Acorn" },
  maple: { top: 160, bottom: 241, winterBottom: 243, cx: 25, winterCx: 24, leaves: [[16, 272, 7, 8], [25, 274, 5, 4], [17, 282, 6, 5]], seed: "Maple Seed" },
  pine: { top: 320, bottom: 406, winterBottom: 406, cx: 24, winterCx: 24, leaves: [[16, 432, 4, 3], [19, 443, 4, 4]], seed: "Pine Cone" },
};

interface TreeArt {
  img: HTMLCanvasElement;
  cx: number;
  leaves: { img: HTMLCanvasElement; flip: HTMLCanvasElement }[];
}

const treeArtCache = new Map<string, TreeArt | null>();

function treeArt(kind: TreeKind, season: Season): TreeArt | null {
  const k = `${kind}:${season}`;
  if (treeArtCache.has(k)) return treeArtCache.get(k)!;
  const def = TREE_DEF[kind];
  // Pines don't change in summer (and the sheet has no summer pine).
  const gx = kind === "pine" && season === "summer" ? 0 : SEASON_X[season];
  const bottom = season === "winter" ? def.winterBottom : def.bottom;
  const img = cut("trees", gx, def.top, 48, bottom - def.top + 1);
  let a: TreeArt | null = null;
  if (img) {
    const leaves = def.leaves
      .map(([x, y, w, h]) => cut("trees", gx + x, y, w, h))
      .filter((c): c is HTMLCanvasElement => !!c)
      .map((c) => ({ img: c, flip: pxCanvas(flipPx(canvasPx(c))) }));
    a = { img, cx: season === "winter" ? def.winterCx : def.cx, leaves };
  }
  treeArtCache.set(k, a);
  return a;
}

// ---------- the ginkgo ----------

/**
 * In fall one tree turns ginkgo gold, like SF's street trees: the real fall oak with its canopy
 * repainted butter yellow. (Its bark isn't in this map, so the trunk stays bark.)
 */
const GINKGO_CANOPY: Record<string, string> = {
  "#260318": "#452a0a",
  "#44091f": "#7c4f0c",
  "#721925": "#c08a14",
  "#b52f1f": "#eab81c",
  "#e5621b": "#fbd73a",
  "#f4b200": "#ffea5c",
  "#fff600": "#fffbb0",
};

const artCanvas = (a: ArtData) => pxCanvas(rowsToPx(a.rows, a.pal));
const mirror = (c: HTMLCanvasElement) => pxCanvas(flipPx(canvasPx(c)));

/** A quarter turn (a fallen leaf lying sideways). */
function quarterTurn(src: HTMLCanvasElement, clockwise: boolean): HTMLCanvasElement {
  const c = makeCanvasEl(src.height, src.width);
  const ctx = ctx2d(c);
  ctx.translate(clockwise ? src.height : 0, clockwise ? 0 : src.width);
  ctx.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

let ginkgoCache: (TreeArt & { fallen: HTMLCanvasElement[] }) | null = null;

function ginkgoArt(): (TreeArt & { fallen: HTMLCanvasElement[] }) | null {
  if (ginkgoCache) return ginkgoCache;
  const oak = treeArt("oak", "fall");
  if (!oak) return null;
  const fan = artCanvas(GINKGO_LEAF);
  const edge = artCanvas(GINKGO_LEAF_EDGE);
  const small = artCanvas(GINKGO_LEAF_SMALL);
  ginkgoCache = {
    img: pxCanvas(remapPx(canvasPx(oak.img), GINKGO_CANOPY)),
    cx: oak.cx,
    // Fans tumble by flicking edge-on.
    leaves: [
      { img: fan, flip: edge },
      { img: mirror(fan), flip: edge },
      { img: small, flip: mirror(small) },
    ],
    fallen: [small, mirror(small), quarterTurn(small, true), quarterTurn(small, false)],
  };
  return ginkgoCache;
}

/** Fallen fans under the ginkgo: a few in September, a golden carpet by late November. */
function fallenCount(now: Date): number {
  const day = Math.max(0, Math.min(90, (now.getMonth() - 8) * 30 + now.getDate()));
  return 6 + Math.floor(day / 6);
}

const CARPET_W = 54;
const CARPET_H = 14;
const carpetCache = new Map<number, HTMLCanvasElement>();

function ginkgoCarpet(count: number): HTMLCanvasElement | null {
  const cached = carpetCache.get(count);
  if (cached) return cached;
  const pieces = ginkgoArt()?.fallen;
  if (!pieces) return null;
  const c = makeCanvasEl(CARPET_W, CARPET_H);
  const ctx = ctx2d(c);
  // Scattered in an oval around the trunk, thickest near it. Leaf i always lands in the same spot,
  // so the carpet only ever grows.
  for (let i = 0; i < count; i++) {
    const a = hash2(i, 1, 0x91) * Math.PI * 2;
    const r = Math.sqrt(hash2(i, 2, 0x91));
    const img = pieces[Math.floor(hash2(i, 3, 0x91) * pieces.length)]!;
    const x = CARPET_W / 2 + Math.cos(a) * r * (CARPET_W / 2 - 3);
    const y = CARPET_H / 2 + Math.sin(a) * r * (CARPET_H / 2 - 2);
    ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height / 2));
  }
  carpetCache.set(count, c);
  return c;
}

type BushKind = "small" | "round" | "medium" | "large";

/** bushes.png rects per season: [x, y, w, h]. */
const BUSH_DEF: Record<BushKind, Record<Season, [number, number, number, number]>> = {
  small: { spring: [0, 229, 16, 27], summer: [32, 229, 16, 27], fall: [64, 229, 16, 27], winter: [96, 229, 16, 27] },
  round: { spring: [0, 98, 31, 29], summer: [32, 98, 31, 29], fall: [64, 98, 31, 29], winter: [96, 98, 31, 29] },
  medium: { spring: [1, 10, 30, 35], summer: [1, 10, 30, 35], fall: [1, 58, 30, 35], winter: [65, 58, 30, 35] },
  large: { spring: [1, 132, 47, 43], summer: [50, 177, 45, 46], fall: [49, 132, 47, 43], winter: [1, 180, 47, 43] },
};

const bushArtCache = new Map<string, HTMLCanvasElement | null>();
function bushArt(kind: BushKind, season: Season, berries: boolean): HTMLCanvasElement | null {
  const k = `${kind}:${season}:${berries}`;
  if (bushArtCache.has(k)) return bushArtCache.get(k)!;
  let r = BUSH_DEF[kind][season];
  // Salmonberry season (mid-spring) and blackberry season (early fall) put berries on the bushes.
  if (berries && kind === "medium" && season === "spring") r = [33, 10, 30, 35];
  if (berries && kind === "medium" && season === "fall") r = [33, 58, 30, 35];
  const c = cut("bushes", r[0], r[1], r[2], r[3]);
  bushArtCache.set(k, c);
  return c;
}

/** A soft lavender oval under trees and bushes. */
const shadowCache = new Map<number, HTMLCanvasElement>();
function shadow(w: number): HTMLCanvasElement {
  let c = shadowCache.get(w);
  if (!c) {
    const h = Math.max(3, Math.round(w / 4));
    c = makeCanvasEl(w, h);
    const ctx = ctx2d(c);
    ctx.fillStyle = "rgba(40,20,60,0.22)";
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = (x + 0.5 - w / 2) / (w / 2);
        const dy = (y + 0.5 - h / 2) / (h / 2);
        if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
      }
    }
    shadowCache.set(w, c);
  }
  return c;
}

function leafBurst(leaves: { img: HTMLCanvasElement; flip: HTMLCanvasElement }[], x: number, y: number, spread: number, groundY: number, n: number): void {
  if (!leaves.length) return;
  const count = reducedMotion ? Math.min(2, n) : n;
  for (let i = 0; i < count; i++) {
    const l = leaves[i % leaves.length]!;
    fx.spawn({
      kind: "sprite",
      img: l.img,
      imgFlip: l.flip,
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * spread * 0.5,
      vx: (Math.random() - 0.5) * 18,
      vy: -8 - Math.random() * 10,
      g: 26,
      drag: 1.6,
      flutter: 14,
      life: 3.2,
      groundY: groundY + Math.random() * 8 - 2,
    });
  }
}

// ---------- the chest & little lines ----------

/**
 * Put a picked-up thing in the shared chest. The toast is optimistic; the request is fire-and-forget
 * (one quiet retry if the network blinked), and only a real failure says so.
 */
function toChest(key: string, text: string): void {
  toast(text, { icon: key });
  sendToChest(key);
}

/** A wink for a few items, once per visit each (the plain "X → chest" otherwise). */
const winked = new Set<string>();
function itemWink(name: string, now: Date): string | null {
  if (winked.has(name)) return null;
  let line: string | null = null;
  switch (name) {
    case COFFEE_BEAN:
      line = now.getDate() % 2 ? "No Blue Bottle line!" : "Philz Mint Mojito time?";
      break;
    case "Salmonberry":
      line = "Snickers was hoping for salmon.";
      break;
    case "Grape":
      if (now.getDay() === 3) line = "Wine Wednesday!";
      break;
    case "Lost Book":
      line = "Left at a sketching meetup?";
      break;
    case "Rare Disc":
      line = "Please don't be karaoke...";
      break;
  }
  if (line) winked.add(name);
  return line;
}

function chestText(name: string, now: Date): string {
  const wink = itemWink(name, now);
  return wink ? `${name} → chest. ${wink}` : `${name} → chest`;
}

/** Rare flavor when a tree or bush is shaken and nothing falls out: each line at most once a visit. */
const saidLines = new Set<string>();
function rareLine(line: string | null): void {
  if (!line || saidLines.has(line) || Math.random() > 0.08) return;
  saidLines.add(line);
  toast(line);
}

function treeLine(env: FarmEnv): string | null {
  if (env.weather === "fog") return "The fog is stuck in the branches...";
  if (!env.isNight) return "A squirrel scolds you from the branches.";
  return null;
}

/** Shaking the ginkgo: sometimes a wink, each once a visit. Keep shaking and it gets a warning. */
function ginkgoWink(taps: number): void {
  const line = taps >= 5 ? "Careful... ginkgos drop every leaf at once." : "Somewhere in SF, a whole block just turned gold.";
  if (saidLines.has(line) || Math.random() > 0.35) return;
  saidLines.add(line);
  toast(line);
}

function bushLine(env: FarmEnv): string | null {
  if (env.weather === "rain" || env.weather === "storm") return "A banana slug was napping in there...";
  if (env.season === "summer" && env.hour >= 19) return "A cricket in there stops chirping and waits for you to leave.";
  return null;
}

// ---------- trees & bushes ----------

class Tree implements Entity {
  layer = 1;
  /** Fall only: this one is the golden ginkgo (Nature picks it). */
  ginkgo = false;
  private shake = 0;
  private season: Season = "spring";
  /** Fans shaken loose this visit (they join the carpet). */
  private shaken = 0;
  private fallen = 0;
  /** Where it was planted (the ginkgo may stand a little off it to show its crown). */
  readonly home: { x: number; y: number };
  constructor(
    public x: number,
    public y: number,
    /** Mutable: Nature makes sure every kind (and so every seed) is somewhere on the farm. */
    public kind: TreeKind,
    private nature: Nature,
  ) {
    this.home = { x, y };
  }
  private get golden(): boolean {
    return this.ginkgo && this.season === "fall";
  }
  private art(): TreeArt | null {
    return this.golden ? ginkgoArt() : treeArt(this.kind, this.season);
  }
  update(dt: number, g: Game): void {
    this.season = g.env.season;
    if (this.golden) this.fallen = Math.min(30, fallenCount(g.env.now) + this.shaken);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }
  draw(ctx: CanvasRenderingContext2D): void {
    const a = this.art();
    if (!a) return;
    const sh = shadow(30);
    ctx.drawImage(sh, this.x - 15, this.y - sh.height + 2);
    const carpet = this.golden ? ginkgoCarpet(this.fallen) : null;
    if (carpet) ctx.drawImage(carpet, this.x - (CARPET_W >> 1), this.y - (CARPET_H >> 1) - 1);
    const left = this.x - a.cx;
    const top = this.y - a.img.height + 1;
    const trunk = 18;
    const off = this.shake > 0 ? Math.round(Math.sin(this.shake * 38) * this.shake * 4) : 0;
    const canopyH = a.img.height - trunk;
    ctx.drawImage(a.img, 0, 0, a.img.width, canopyH, left + off, top, a.img.width, canopyH);
    ctx.drawImage(a.img, 0, canopyH, a.img.width, trunk, left, top + canopyH, a.img.width, trunk);
  }
  hit(wx: number, wy: number): boolean {
    const a = this.art();
    if (!a) return false;
    const h = a.img.height;
    const inCanopy = wx >= this.x - 20 && wx <= this.x + 20 && wy >= this.y - h + 6 && wy <= this.y - 16;
    const inTrunk = Math.abs(wx - this.x) <= 6 && wy >= this.y - 20 && wy <= this.y + 2;
    return inCanopy || inTrunk;
  }
  onTap(g: Game): void {
    if (this.shake > 0.3) return;
    this.shake = 0.5;
    sfx("rustle");
    const a = this.art();
    if (this.golden) {
      // No seed: a shower of golden fans, and a few more on the carpet.
      if (a) leafBurst(a.leaves, this.x, this.y - a.img.height * 0.6, 34, this.y + 4, 10);
      this.shaken = Math.min(14, this.shaken + 1);
      ginkgoWink(this.shaken);
      return;
    }
    if (a) leafBurst(a.leaves, this.x, this.y - a.img.height * 0.6, 30, this.y + 4, 7);
    // Often a seed tumbles out (oaks drop acorns, maples spin seeds down, pines drop cones).
    const seeded = this.season !== "winter" && Math.random() < SEED_CHANCE;
    if (seeded) this.nature.dropSeed(g, this.x + (Math.random() < 0.5 ? -10 : 10), this.y + 4, TREE_DEF[this.kind].seed, this);
    else rareLine(treeLine(g.env));
  }
}

/** Berry bushes (the medium ones) in berry season: salmonberries mid-spring, blackberries early fall. */
const BERRIES: Partial<Record<Season, string>> = { spring: "Salmonberry", fall: "Blackberry" };
/** Picked-list index for bush #i's berries (forage spots use 0..99, artifact spots 100+). */
const BERRY_INDEX = 200;

function berrySeason(season: Season, day: number): boolean {
  return (season === "spring" && day >= 15 && day <= 18) || (season === "fall" && day >= 8 && day <= 11);
}

class Bush implements Entity {
  layer = 1;
  private shake = 0;
  private season: Season = "spring";
  private berries = false;
  constructor(
    public x: number,
    public y: number,
    private kind: BushKind,
    private nature: Nature,
    private index: number,
  ) {}
  update(dt: number, g: Game): void {
    this.season = g.env.season;
    // Only the medium bush has a berry sprite; once today's berries are picked it goes back to leaves.
    this.berries = this.kind === "medium" && berrySeason(this.season, g.env.now.getDate()) && !this.nature.wasPicked(BERRY_INDEX + this.index);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }
  private art(): HTMLCanvasElement | null {
    return bushArt(this.kind, this.season, this.berries);
  }
  draw(ctx: CanvasRenderingContext2D): void {
    const img = this.art();
    if (!img) return;
    const sh = shadow(Math.max(12, img.width - 6));
    ctx.drawImage(sh, Math.round(this.x - sh.width / 2), this.y - sh.height + 2);
    const off = this.shake > 0 ? Math.round(Math.sin(this.shake * 45) * this.shake * 4) : 0;
    ctx.drawImage(img, Math.round(this.x - img.width / 2) + off, this.y - img.height + 1);
  }
  hit(wx: number, wy: number): boolean {
    const img = this.art();
    if (!img) return false;
    return Math.abs(wx - this.x) <= img.width / 2 && wy >= this.y - img.height + 2 && wy <= this.y + 2;
  }
  onTap(g: Game): void {
    if (this.shake > 0.25) return;
    this.shake = 0.4;
    sfx("rustle");
    const leaves = treeArt("oak", this.season)?.leaves ?? [];
    const img = this.art();
    leafBurst(leaves, this.x, this.y - (img?.height ?? 20) * 0.6, 18, this.y + 3, 3);
    // Berries pop out to be picked up (one per bush per day, like Stardew's salmonberry bushes).
    const berry = BERRIES[this.season];
    if (this.berries && berry) {
      this.nature.dropSeed(g, this.x + (Math.random() < 0.5 ? -8 : 8), this.y + 3, berry, this, BERRY_INDEX + this.index, 16);
      return;
    }
    rareLine(bushLine(g.env));
  }
}

// ---------- forage ----------

const PICKED_KEY = "farm.forage";

function readPicked(day: string): number[] {
  try {
    const raw = localStorage.getItem(PICKED_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as { day?: string; picked?: number[] };
    return v.day === day && Array.isArray(v.picked) ? v.picked : [];
  } catch {
    return [];
  }
}

function writePicked(day: string, picked: number[]): void {
  try {
    localStorage.setItem(PICKED_KEY, JSON.stringify({ day, picked }));
  } catch {
    /* private mode: forage just respawns on reload, no big deal */
  }
}

class Forage implements Entity {
  x = 0;
  y = 0;
  layer = 0;
  dead = false;
  private t = Math.random() * 10;
  private picked = -1;
  /** Seeds dropped from trees fall & bounce in first. */
  private fall = 0;
  private fallV = 0;
  private ttl = Infinity;
  /** The tree (or bush) a dropped seed or berry came from (one at a time each on the ground). */
  owner: object | null = null;
  /** The icon shown when picked (and in the toast). */
  private icon: string;
  constructor(
    private nature: Nature,
    readonly name: string,
    readonly index: number,
    private fx: number,
    private fy: number,
    private fixed: { x: number; y: number } | null = null,
    /** An artifact spot (wiggly worms) instead of a forage item lying in the grass. */
    private spot = false,
  ) {
    this.icon = spot ? artifactKey(name) : forageKey(name);
  }
  /** A seed dropping out of a tree: starts in the canopy, bounces, sticks around for a while. */
  dropFrom(height: number): void {
    this.fall = height;
    this.fallV = 0;
    this.ttl = 45;
  }
  update(dt: number, g: Game): void {
    if (this.fixed) {
      this.x = this.fixed.x;
      this.y = this.fixed.y;
    } else {
      const pa = g.layout.pasture;
      this.x = Math.round(pa.x + this.fx * pa.w);
      this.y = Math.round(pa.y + this.fy * pa.h);
    }
    this.t += dt;
    if (this.fall > 0 || this.fallV !== 0) {
      this.fallV += 260 * dt;
      this.fall -= this.fallV * dt;
      if (this.fall <= 0) {
        this.fall = 0;
        this.fallV = this.fallV > 60 ? -this.fallV * 0.35 : 0;
        if (this.fallV !== 0) sfx("thud", { volume: 0.25, pitch: 1.6 });
      }
    }
    this.ttl -= dt;
    if (this.ttl <= 0 && this.picked < 0) this.dead = true;
    if (this.picked >= 0) {
      this.picked += dt;
      if (this.picked > 0.35) this.dead = true;
    }
  }
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.spot && this.picked < 0) {
      // The worms wiggle (Stardew flips the sprite back and forth), with a little pause now and then.
      const phase = this.t % 3;
      const flip = phase < 1.6 && Math.floor(this.t * 4) % 2 === 1;
      // A little patch of turned soil so the worms read on any grass (and on a small phone).
      ctx.fillStyle = "rgba(84,46,22,0.5)";
      ctx.fillRect(this.x - 6, this.y - 2, 12, 2);
      ctx.fillRect(this.x - 4, this.y, 8, 1);
      ctx.fillStyle = "rgba(196,140,84,0.6)";
      ctx.fillRect(this.x - 4, this.y - 3, 8, 1);
      draw(ctx, ARTIFACT_SPOT, this.x - 8, this.y - 13, { flipX: flip });
      return;
    }
    const key = this.icon;
    const lift = this.picked >= 0 ? Math.round(this.picked * 40) : Math.round(this.fall);
    const alpha = this.picked >= 0 ? Math.max(0, 1 - this.picked / 0.35) : this.ttl < 3 ? Math.max(0, this.ttl / 3) : 1;
    if (this.picked < 0 && !this.spot) {
      ctx.fillStyle = "rgba(40,20,60,0.22)";
      ctx.fillRect(this.x - 4, this.y - 1, 8, 2);
      ctx.fillRect(this.x - 3, this.y + 1, 6, 1);
    }
    if (!has(key)) return;
    draw(ctx, key, this.x - 8, this.y - 15 - lift, { alpha });
  }
  hit(wx: number, wy: number): boolean {
    return this.picked < 0 && Math.abs(wx - this.x) <= 12 && wy >= this.y - 19 && wy <= this.y + 5;
  }
  onTap(g: Game): void {
    if (this.picked >= 0) return;
    this.picked = 0;
    if (this.spot) {
      dustPuff(this.x, this.y - 2, 9, "rgba(150,104,64,0.9)");
      sfx("thud", { volume: 0.5 });
    }
    sfx("pop");
    this.nature.picked(this);
    toChest(this.icon, chestText(this.name, g.env.now));
  }
}

// ---------- placement & lifecycle ----------

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** How much of a tree's canopy is on screen and not under the clock (trees often hang off the edges). */
function inView(t: { x: number; y: number }, l: Layout): number {
  const canopy = { x: t.x - 20, y: t.y - 80, w: 40, h: 62 };
  return overlapArea(canopy, { x: 0, y: 0, w: l.w, h: l.h }) - overlapArea(canopy, l.hudClock);
}

/**
 * The four seasonal Foraging bundles' items turn up twice as often as other forage, so a season's
 * bundle fills in a few short visits. (Only those four: every forage item is in some bundle now,
 * and doubling everything would be the same as doubling nothing.)
 */
const BUNDLE_KEYS = new Set(BUNDLES.filter((b) => Object.hasOwn(FORAGE_BY_SEASON, b.id)).flatMap((b) => b.items));
function pickForage(pool: readonly string[], r: number): string {
  const weight = (name: string) => (BUNDLE_KEYS.has(forageKey(name)) ? 2 : 1);
  let k = r * pool.reduce((t, name) => t + weight(name), 0);
  for (const name of pool) {
    k -= weight(name);
    if (k < 0) return name;
  }
  return pool[0]!;
}

/** Days since 1970 in local time (for things that rotate day by day). */
function dayNumber(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// Every bundle item has to come from somewhere on the farm (seasonal ones in their own season),
// or that bundle could never be finished. Cheap to check once at load; loud if it ever drifts.
(() => {
  const anywhere = new Set<string>([
    ...Object.values(FORAGE_BY_SEASON).flat().map(forageKey),
    forageKey(COFFEE_BEAN),
    ...Object.values(TREE_DEF).map((t) => forageKey(t.seed)),
    ...Object.values(BERRIES).map((b) => forageKey(b)),
    ...ARTIFACTS.map(([name]) => artifactKey(name)),
    // The rare visitors' keepsakes (entities/critter-keepsake.ts).
    ...KEEPSAKE_KEYS,
  ]);
  for (const b of BUNDLES) {
    const pool = (FORAGE_BY_SEASON as Partial<Record<string, string[]>>)[b.id];
    for (const key of b.items) {
      const ok = pool ? pool.some((n) => forageKey(n) === key) : anywhere.has(key);
      if (!ok) console.warn(`[world] nothing on the farm gives ${key} (${b.name})`);
    }
  }
})();

export class Nature {
  private plants: Entity[] = [];
  private trees: Tree[] = [];
  private forage: Forage[] = [];
  private day = "";
  private dayCheck = 0;
  private seedsOut = new Set<Forage>();
  /** What this device already picked up today (forage spot / artifact spot / berry bush indexes). */
  private pickedToday = new Set<number>();

  constructor(
    private g: Game,
    private ground: Ground,
  ) {
    registerSpotFallback();
    safeOn(g, "tick", "forage.day", (dt: number) => {
      this.dayCheck -= dt;
      if (this.dayCheck > 0) return;
      this.dayCheck = 5;
      const d = dayKey(g.env.now);
      if (d !== this.day) this.spawnForage();
    });
    // Once the farm loads, re-scatter today's forage so it can dodge the decorations.
    const off = store.changed.on(() => {
      off();
      try {
        this.spawnForage();
      } catch (err) {
        console.error("[world] forage respawn failed", err);
      }
    });
  }

  /** Re-plant trees & bushes for the current layout (deterministic per screen size). */
  plant(): void {
    const g = this.g;
    for (const e of this.plants) g.remove(e);
    this.plants = [];
    this.trees = [];
    const l = g.layout;
    const obstacles = this.obstacles(l);
    const r = rng(0xb05c + l.w * 7 + l.h * 13);
    const candidates: { x: number; y: number; k: number }[] = [];
    for (let y = 36; y <= l.h + 14; y += 6) {
      for (let x = -8; x <= l.w + 8; x += 6) candidates.push({ x, y, k: r() });
    }
    candidates.sort((a, b) => a.k - b.k);
    const placed: { x: number; y: number; r: number }[] = [];
    const free = (x: number, y: number, rect: Rect, spacing: number) => {
      if (obstacles.some((o) => overlaps(rect, o))) return false;
      if (contains(inflate(l.hudClock, -2), x, y - 6)) return false;
      if (this.ground.isDirt(x, y) || this.ground.isDirt(x - 6, y) || this.ground.isDirt(x + 6, y)) return false;
      return !placed.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(spacing, p.r));
    };
    for (const c of candidates) {
      if (placed.length >= 6) break;
      const rect = { x: c.x - 22, y: c.y - 80, w: 44, h: 80 };
      if (!free(c.x, c.y, rect, 34)) continue;
      const kind = TREE_KINDS[Math.floor(hash2(c.x, c.y, 5) * TREE_KINDS.length)]!;
      placed.push({ x: c.x, y: c.y, r: 34 });
      this.trees.push(new Tree(c.x, c.y, kind, this));
    }
    this.plants.push(...this.trees);
    this.assignTreeKinds();
    const bushKinds: BushKind[] = ["large", "medium", "round", "small"];
    let bushes = 0;
    for (const kind of bushKinds) {
      const size = { large: [44, 42], medium: [30, 35], round: [30, 28], small: [16, 26] }[kind] as [number, number];
      for (const c of candidates) {
        if (bushes >= 9) break;
        const rect = { x: c.x - size[0] / 2, y: c.y - size[1], w: size[0], h: size[1] };
        if (!free(c.x, c.y, rect, size[0] * 0.75)) continue;
        if (hash2(c.x, c.y, 77) < 0.35) continue; // leave some open grass
        placed.push({ x: c.x, y: c.y, r: size[0] * 0.75 });
        this.plants.push(new Bush(c.x, c.y, kind, this, bushes));
        bushes++;
      }
    }
    for (const e of this.plants) g.add(guard(e, "plant"));
  }

  /**
   * Oaks, maples and pines all have to be on the farm, or the Tree Seed Bundle can't be finished.
   * With room for 3+ trees, any missing kind takes over a doubled-up tree (the rest keep their
   * looks). On a cramped screen with only 1-2 trees, they take turns being each kind, day by day.
   * In fall, one of them is the golden ginkgo.
   */
  private assignTreeKinds(): void {
    const trees = this.trees;
    for (const t of trees) {
      t.ginkgo = false;
      t.x = t.home.x;
      t.y = t.home.y;
    }
    if (!trees.length) return;
    const n = dayNumber(this.g.env.now);
    if (trees.length < TREE_KINDS.length) {
      trees.forEach((t, i) => (t.kind = TREE_KINDS[(n + i) % TREE_KINDS.length]!));
    } else {
      this.coverTreeKinds();
    }
    if (this.g.env.season === "fall") this.pickGinkgo(n);
  }

  /** Re-kind doubled-up trees until every kind is somewhere (needs 3+ trees). */
  private coverTreeKinds(): void {
    const trees = this.trees;
    for (const kind of TREE_KINDS) {
      if (trees.some((t) => t.kind === kind)) continue;
      // Re-kind the last tree whose kind appears more than once.
      for (let i = trees.length - 1; i >= 0; i--) {
        const t = trees[i]!;
        if (trees.filter((o) => o.kind === t.kind).length > 1) {
          t.kind = kind;
          break;
        }
      }
    }
  }

  /**
   * The ginkgo is the most visible doubled-up tree, so every seed stays on the farm. With no
   * doubles (2-3 trees), it's the most visible tree and the others take turns being each kind, day
   * by day. A lone tree is the ginkgo every fourth day.
   */
  private pickGinkgo(n: number): void {
    const trees = this.trees;
    if (trees.length === 1) {
      trees[0]!.ginkgo = n % 4 === 3;
      return;
    }
    const l = this.g.layout;
    const best = (list: Tree[]) => list.reduce((a, b) => (inView(b, l) > inView(a, l) ? b : a));
    const doubled = trees.filter((t) => trees.some((o) => o !== t && o.kind === t.kind));
    if (doubled.length) {
      const gold = best(doubled);
      gold.ginkgo = true;
      this.showOff(gold);
      return;
    }
    const gold = best(trees);
    gold.ginkgo = true;
    this.showOff(gold);
    trees.filter((t) => t !== gold).forEach((t, i) => (t.kind = TREE_KINDS[(n + i) % TREE_KINDS.length]!));
  }

  /**
   * The ginkgo is the farm's fall show-off: if the top of the screen cuts off its crown (on phones it
   * stands between the barn and the clock), it steps down and a little left to show more of it, as
   * long as its canopy stays clear of the barn.
   */
  private showOff(t: Tree): void {
    const clipped = 80 - t.home.y;
    if (clipped <= 0) return;
    const barn = inflate(this.g.layout.barn, 2);
    const dx = t.home.x - 26 > barn.x + barn.w ? -6 : 0;
    t.x = t.home.x + dx;
    t.y = t.home.y + Math.min(10, clipped);
  }

  private obstacles(l: Layout): Rect[] {
    const f = l.fence;
    const out: Rect[] = [{ x: f.x - 8, y: f.y - 30, w: f.w + 16, h: f.h + 36 }, inflate(l.barn, 2), l.hudToolbar, ...keepClear(l)];
    for (const p of [l.loom, l.chest, l.mailbox, signFeet(l)]) out.push({ x: p.x - 14, y: p.y - 40, w: 28, h: 46 });
    out.push({ x: l.billboard.x - 20, y: l.billboard.y - 38, w: 40, h: 44 });
    return out;
  }

  /** True if this device already picked up item `index` today. */
  wasPicked(index: number): boolean {
    return this.pickedToday.has(index);
  }

  /**
   * Today's forage (3-5 things, now and then a coffee bean) and most days an artifact spot or two,
   * seeded by the date so both farmers find the same things in the same spots.
   */
  spawnForage(): void {
    const g = this.g;
    for (const f of this.forage) g.remove(f);
    this.forage = [];
    this.day = dayKey(g.env.now);
    this.pickedToday = new Set(readPicked(this.day));
    this.assignTreeKinds();
    const season = g.env.season;
    const pool = FORAGE_BY_SEASON[season];
    const seed = Number(this.day.replaceAll("-", "")) || 1;
    const r = rng(seed * 31 + 7);
    const count = 3 + Math.floor(r() * 3);
    const picked = this.pickedToday;
    const l = g.layout;
    // Keep forage out from under the decorations (they'd hide it and steal the tap), off paths,
    // out of the fox & hedgehog's corner and the barn door yard, and not piled on each other.
    const decor = (store.state?.decorations ?? []).map((d) => fromFraction(l, d.fx, d.fy));
    const clearZones = keepClear(l);
    const taken: { x: number; y: number }[] = [];
    const footprint = (x: number, y: number): Rect => ({ x: x - 8, y: y - 16, w: 16, h: 20 });
    const clear = (x: number, y: number) =>
      !l.blocked.some((b) => contains(inflate(b, 6), x, y)) &&
      !clearZones.some((z) => overlaps(footprint(x, y), z)) &&
      !decor.some((d) => Math.abs(d.x - x) < 18 && y > d.y - 40 && y < d.y + 10) &&
      !onPond(l, x, y, 8) &&
      !taken.some((t) => Math.abs(t.x - x) < 16 && Math.abs(t.y - y) < 14) &&
      !this.ground.isDirt(x, y);
    // What grows today (and whether there are worms) depends only on the date, so both farmers find
    // the same things. Each spot gets its own little rng: dodging a decoration or a narrower screen
    // never changes what the next spot is.
    const spot = (k: number, x0: number, y0: number): { fx: number; fy: number } => {
      const rr = rng(seed * 131 + k * 7919 + 17);
      let fx = 0.5;
      let fy = 0.5;
      for (let tries = 0; tries < 24; tries++) {
        fx = x0 + rr() * (1 - x0 * 2);
        fy = y0 + rr() * (1 - y0 * 2);
        const p = fromFraction(l, fx, fy);
        if (clear(p.x, p.y)) break;
      }
      taken.push(fromFraction(l, fx, fy));
      return { fx, fy };
    };
    const add = (name: string, index: number, artifact: boolean): void => {
      // Find the spot even if it's already picked, so picking one never moves the others.
      const s = artifact ? spot(index, 0.08, 0.1) : spot(index, 0.06, 0.08);
      if (picked.has(index)) return;
      const f = new Forage(this, name, index, s.fx, s.fy, null, artifact);
      this.forage.push(f);
      g.add(guard(f, artifact ? "artifact" : "forage"));
    };
    // Draw everything from the day's rng first, so what's picked never shifts what's left.
    const names: string[] = [];
    for (let i = 0; i < count; i++) names.push(pickForage(pool, r()));
    const coffee = r() < 0.12;
    const worms = r() < 0.8;
    const treasure = pickArtifact(r());
    const worms2 = r() < 0.5;
    const treasure2 = pickArtifact(r());
    names.forEach((name, i) => add(name, i, false));
    // Now and then a coffee bean, in any season.
    if (coffee) add(COFFEE_BEAN, 50, false);
    // Most days, a patch of wiggly worms (often two). Everyone in Stardew knows: you DIG there.
    if (worms) add(treasure, 100, true);
    if (worms2) add(treasure2, 101, true);
  }

  picked(f: Forage): void {
    this.seedsOut.delete(f);
    if (f.index < 0) return;
    this.pickedToday.add(f.index);
    const list = readPicked(this.day);
    if (!list.includes(f.index)) list.push(f.index);
    writePicked(this.day, list);
  }

  /**
   * Something falls out of a tree or bush (a seed, or a berry) and lands at (x, y) to be picked up.
   * One at a time per tree/bush. `index` >= 0 remembers the pick for today (berries); seeds use -1.
   */
  dropSeed(g: Game, x: number, y: number, name: string, from: object, index = -1, height = 34): void {
    for (const s of this.seedsOut) if (s.dead) this.seedsOut.delete(s);
    for (const s of this.seedsOut) if (s.owner === from) return;
    // Seeds don't land in the barn door yard (sheep and the cat need it): they roll to its edge.
    const yard = doorYard(g.layout);
    if (contains(inflate(yard, 6), x, y)) x = x < yard.x + yard.w / 2 ? yard.x - 8 : yard.x + yard.w + 8;
    // A tree hanging off the screen edge drops toward the middle (an off-screen seed can't be picked up,
    // and it would block that tree's next seed until it rots).
    x = Math.max(10, Math.min(g.layout.w - 10, x));
    const f = new Forage(this, name, index, 0, 0, { x: Math.round(x), y: Math.round(Math.min(g.layout.h - 4, y)) });
    f.owner = from;
    f.dropFrom(height);
    this.seedsOut.add(f);
    g.add(guard(f, "seed"));
  }
}
