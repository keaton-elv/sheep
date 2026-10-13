// Trees & bushes around the farm (tap: they shake, leaves flutter, sometimes a seed drops),
// the day's seasonal forage (tap to pick it up, like the spring onions by the farmhouse), and
// on some days a patch of wiggly worms: an artifact spot! Tap it to dig up a little treasure.

import { sfx } from "../audio";
import { dayKey, type Season } from "../../shared/calendar";
import { rng, type Entity, type Game } from "../engine/game";
import { objectRegion } from "../art/regions";
import { draw, has, registerArt, REGIONS } from "../engine/sprites";
import { store } from "../net";
import { toast } from "../ui/dom";
import { contains, fromFraction, inflate, type Layout, type Rect } from "./layout";
import { FORAGE_BY_SEASON, forageKey } from "./world-art";
import { dustPuff, fx, reducedMotion } from "./world-fx";
import type { Ground } from "./world-ground";
import { flipPx, hash2, rowsToPx } from "./world-pixels";
import { guard, safeOn } from "./world-safe";
import { canvasPx, ctx2d, cut, makeCanvasEl, pxCanvas } from "./world-sheets";
import { doorYard, keepClear, signFeet } from "./world-zones";

// ---------- art ----------

// Artifact spots & artifacts are real objects.png icons (the sheet keeps Stardew's item ids).
const ARTIFACT_SPOT = "world.artifactSpot";
REGIONS[ARTIFACT_SPOT] ??= objectRegion(590);

/** What the worms were guarding: [name, Stardew item id, weight]. Mostly junk, sometimes a treasure. */
const ARTIFACTS: readonly [string, number, number][] = [
  ["Rusty Spoon", 110, 6],
  ["Rusty Cog", 112, 5],
  ["Glass Shards", 118, 5],
  ["Arrowhead", 101, 5],
  ["Chipped Amphora", 100, 4],
  ["Ancient Doll", 103, 3],
  ["Chicken Statue", 113, 3],
  ["Ornamental Fan", 106, 3],
  ["Dried Starfish", 116, 3],
  ["Lost Book", 102, 3],
  ["Elvish Jewelry", 104, 2],
  ["Bone Flute", 119, 2],
  ["Anchor", 117, 2],
  ["Rare Disc", 108, 1],
  ["Dinosaur Egg", 107, 1],
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

// ---------- trees & bushes ----------

class Tree implements Entity {
  layer = 1;
  private shake = 0;
  private season: Season = "spring";
  constructor(
    public x: number,
    public y: number,
    private kind: TreeKind,
    private nature: Nature,
  ) {}
  update(dt: number, g: Game): void {
    this.season = g.env.season;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
  }
  draw(ctx: CanvasRenderingContext2D): void {
    const a = treeArt(this.kind, this.season);
    if (!a) return;
    const sh = shadow(30);
    ctx.drawImage(sh, this.x - 15, this.y - sh.height + 2);
    const left = this.x - a.cx;
    const top = this.y - a.img.height + 1;
    const trunk = 18;
    const off = this.shake > 0 ? Math.round(Math.sin(this.shake * 38) * this.shake * 4) : 0;
    const canopyH = a.img.height - trunk;
    ctx.drawImage(a.img, 0, 0, a.img.width, canopyH, left + off, top, a.img.width, canopyH);
    ctx.drawImage(a.img, 0, canopyH, a.img.width, trunk, left, top + canopyH, a.img.width, trunk);
  }
  hit(wx: number, wy: number): boolean {
    const a = treeArt(this.kind, this.season);
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
    const a = treeArt(this.kind, this.season);
    if (a) leafBurst(a.leaves, this.x, this.y - a.img.height * 0.6, 30, this.y + 4, 7);
    // Every so often a seed tumbles out (oaks drop acorns, maples spin seeds down, pines drop cones).
    if (Math.random() < 0.16 && this.season !== "winter") this.nature.dropSeed(g, this.x + (Math.random() < 0.5 ? -10 : 10), this.y + 4, TREE_DEF[this.kind].seed, this);
  }
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
  ) {}
  update(dt: number, g: Game): void {
    this.season = g.env.season;
    const d = g.env.now.getDate();
    this.berries = (this.season === "spring" && d >= 15 && d <= 18) || (this.season === "fall" && d >= 8 && d <= 11);
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
  onTap(): void {
    if (this.shake > 0.25) return;
    this.shake = 0.4;
    sfx("rustle");
    const leaves = treeArt("oak", this.season)?.leaves ?? [];
    const img = this.art();
    leafBurst(leaves, this.x, this.y - (img?.height ?? 20) * 0.6, 18, this.y + 3, 3);
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

function article(name: string): string {
  return /^[aeiou]/i.test(name) ? "an" : "a";
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
  /** The tree a dropped seed came from (one seed per tree on the ground at a time). */
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
  onTap(): void {
    if (this.picked >= 0) return;
    this.picked = 0;
    if (this.spot) {
      dustPuff(this.x, this.y - 2, 9, "rgba(150,104,64,0.9)");
      sfx("thud", { volume: 0.5 });
      sfx("pop");
      toast(`Dug up ${article(this.name)} ${this.name}!`, { icon: this.icon });
    } else {
      sfx("pop");
      toast(`Found ${article(this.name)} ${this.name}!`, { icon: this.icon });
    }
    this.nature.picked(this);
  }
}

// ---------- placement & lifecycle ----------

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Nature {
  private plants: Entity[] = [];
  private forage: Forage[] = [];
  private day = "";
  private dayCheck = 0;
  private seedsOut = new Set<Forage>();

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
    const kinds: TreeKind[] = ["oak", "maple", "pine"];
    for (const c of candidates) {
      if (placed.length >= 6) break;
      const rect = { x: c.x - 22, y: c.y - 80, w: 44, h: 80 };
      if (!free(c.x, c.y, rect, 34)) continue;
      const kind = kinds[Math.floor(hash2(c.x, c.y, 5) * kinds.length)]!;
      placed.push({ x: c.x, y: c.y, r: 34 });
      this.plants.push(new Tree(c.x, c.y, kind, this));
    }
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
        this.plants.push(new Bush(c.x, c.y, kind));
        bushes++;
      }
    }
    for (const e of this.plants) g.add(guard(e, "plant"));
  }

  private obstacles(l: Layout): Rect[] {
    const f = l.fence;
    const out: Rect[] = [{ x: f.x - 8, y: f.y - 30, w: f.w + 16, h: f.h + 36 }, inflate(l.barn, 2), l.hudToolbar, ...keepClear(l)];
    for (const p of [l.loom, l.chest, l.mailbox, signFeet(l)]) out.push({ x: p.x - 14, y: p.y - 40, w: 28, h: 46 });
    out.push({ x: l.billboard.x - 20, y: l.billboard.y - 38, w: 40, h: 44 });
    return out;
  }

  /** Today's forage, seeded by the date so both farmers see the same spots. */
  spawnForage(): void {
    const g = this.g;
    for (const f of this.forage) g.remove(f);
    this.forage = [];
    this.day = dayKey(g.env.now);
    const season = g.env.season;
    const pool = FORAGE_BY_SEASON[season];
    const seed = Number(this.day.replaceAll("-", "")) || 1;
    const r = rng(seed * 31 + 7);
    const count = 1 + Math.floor(r() * 3);
    const picked = readPicked(this.day);
    const l = g.layout;
    // Keep forage out from under the decorations (they'd hide it and steal the tap), off paths,
    // out of the fox & hedgehog's corner and the barn door yard.
    const decor = (store.state?.decorations ?? []).map((d) => fromFraction(l, d.fx, d.fy));
    const clearZones = keepClear(l);
    const footprint = (x: number, y: number): Rect => ({ x: x - 8, y: y - 16, w: 16, h: 20 });
    const clear = (x: number, y: number) =>
      !l.blocked.some((b) => contains(inflate(b, 6), x, y)) &&
      !clearZones.some((z) => overlaps(footprint(x, y), z)) &&
      !decor.some((d) => Math.abs(d.x - x) < 18 && y > d.y - 40 && y < d.y + 10) &&
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
      return { fx, fy };
    };
    for (let i = 0; i < count; i++) {
      const name = pool[Math.floor(r() * pool.length)]!;
      if (picked.includes(i)) continue;
      const s = spot(i, 0.06, 0.08);
      const f = new Forage(this, name, i, s.fx, s.fy);
      this.forage.push(f);
      g.add(guard(f, "forage"));
    }
    // Most days, a patch of wiggly worms. Everyone in Stardew knows: you DIG there.
    const index = 100;
    const worms = r() < 0.6;
    const treasure = pickArtifact(r());
    if (worms && !picked.includes(index)) {
      const s = spot(index, 0.08, 0.1);
      const f = new Forage(this, treasure, index, s.fx, s.fy, null, true);
      this.forage.push(f);
      g.add(guard(f, "artifact"));
    }
  }

  picked(f: Forage): void {
    this.seedsOut.delete(f);
    if (f.index < 0) return;
    const list = readPicked(this.day);
    if (!list.includes(f.index)) list.push(f.index);
    writePicked(this.day, list);
  }

  dropSeed(g: Game, x: number, y: number, name: string, from: object): void {
    for (const s of this.seedsOut) if (s.dead) this.seedsOut.delete(s);
    for (const s of this.seedsOut) if (s.owner === from) return;
    // Seeds don't land in the barn door yard (sheep and the cat need it): they roll to its edge.
    const yard = doorYard(g.layout);
    if (contains(inflate(yard, 6), x, y)) x = x < yard.x + yard.w / 2 ? yard.x - 8 : yard.x + yard.w + 8;
    const f = new Forage(this, name, -1, 0, 0, { x: Math.round(x), y: Math.round(Math.min(g.layout.h - 4, y)) });
    f.owner = from;
    f.dropFrom(34);
    this.seedsOut.add(f);
    g.add(guard(f, "seed"));
  }
}
