// Sheep sprites for the DOM: the real sheets (woolly, sheared, lamb) frame by frame, the golden
// tint, and the sheep's hat sitting on its head. Shared by the animal card, the flock list, the
// hat picker and the little lamb in "Buy a Sheep".

import "./animal.css";
import { sfx } from "../audio";
import { SHEETS, drawFrame, has, sheet, spriteCanvas } from "../engine/sprites";
import { drawHat as drawModuleHat, hatIcon, hatPlacement } from "../entities/sheep-hats";
import { isLamb } from "../net";
import { MAX_HAT_ID, type Sheep } from "../../shared/types";
import { el, spriteIcon } from "./dom";

// Registered at import time (before loadSprites runs). `??=` so whoever else maps these sheets
// keeps their key; a second key for the same file just hits the browser cache.
SHEETS.sheepBaby ??= "sprites/sheep_baby.png";
SHEETS.animalHats ??= "sprites/animal_hats.png";

export type SheepLook = "woolly" | "sheared" | "lamb";

/** Which sprite a sheep wears right now. A sheared lamb has grown up on the spot. */
export function lookOf(s: Sheep, now?: number): SheepLook {
  if (s.shearedAt !== null) return "sheared";
  return isLamb(s, now) ? "lamb" : "woolly";
}

const SHEET_OF: Record<SheepLook, string> = { woolly: "sheep", sheared: "sheepSheared", lamb: "sheepBaby" };

/** Sheep sheet frame indices: idle front, asleep (eyes closed), idle side, graze 16-19. */
export const FRAME = { idleFront: 12, asleep: 13, idleSide: 14, graze: [16, 17, 18, 19] } as const;

const SIZE = 32;

/**
 * Where the head is in each front-facing frame: [centre x, top row of the forehead outline],
 * measured from the sheets (the "-***-" crown just between the ears).
 */
const HEAD: Record<SheepLook, Record<number, readonly [number, number]>> = {
  woolly: { 12: [16, 13], 13: [16, 13], 16: [16, 14], 17: [16, 17], 18: [16, 19], 19: [16, 19] },
  sheared: { 12: [16, 12], 13: [16, 12], 16: [16, 14], 17: [16, 15], 18: [16, 17], 19: [16, 17] },
  lamb: { 12: [16, 18], 13: [16, 18], 16: [16, 18], 17: [15, 19], 18: [15, 20], 19: [15, 21] },
};

// Stardew's hat cells are 20x20; nearly every hat's brim ends on row 12 around column 10.
const HAT_CELL = 20;
const HAT_BRIM_ROW = 12;
const HAT_CENTRE_COL = 10;
/** How far the brim sinks onto the forehead (matches where the farm draws hats). */
const HAT_SINK: Record<SheepLook, number> = { woolly: 2, sheared: 2, lamb: 1 };

// ---------- frames ----------

const frameCache = new Map<string, HTMLCanvasElement>();

/** Warm gold recolor for golden sheep; leaves the soft shadow (semi-transparent pixels) alone. */
function goldify(c: HTMLCanvasElement): void {
  const ctx = c.getContext("2d");
  if (!ctx) return;
  let img: ImageData;
  try {
    img = ctx.getImageData(0, 0, c.width, c.height);
  } catch {
    return;
  }
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 200) continue;
    const r = d[i]!;
    const g = d[i + 1]!;
    const b = d[i + 2]!;
    d[i] = Math.min(255, r * 1.02 + 34);
    d[i + 1] = Math.min(255, g * 0.86 + 16);
    d[i + 2] = Math.min(255, b * 0.42);
  }
  ctx.putImageData(img, 0, 0);
}

/** A lamb borrows the grown-up frames if sheep_baby.png is missing. */
function effectiveLook(look: SheepLook): SheepLook {
  return look === "lamb" && !sheet(SHEET_OF.lamb) && sheet(SHEET_OF.woolly) ? "woolly" : look;
}

/** True when the real sheet for this look loaded (hats only line up on the real frames). */
export function hasRealSheet(look: SheepLook): boolean {
  return !!sheet(SHEET_OF[effectiveLook(look)]);
}

/**
 * One 32x32 frame as a cached canvas, golden-tinted if asked. Lambs fall back to the adult sheet
 * if sheep_baby.png is missing; everything falls back to the hand-drawn "ui.sheep" icon.
 */
export function sheepFrame(wanted: SheepLook, index: number, golden: boolean): HTMLCanvasElement {
  const look = effectiveLook(wanted);
  const key = `${look}:${index}:${golden ? 1 : 0}`;
  let c = frameCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    if (sheet(SHEET_OF[look])) {
      drawFrame(ctx, SHEET_OF[look], index, SIZE, SIZE, 0, 0);
    } else {
      const icon = spriteCanvas("ui.sheep", 1);
      ctx.drawImage(icon, Math.round((SIZE - icon.width) / 2), SIZE - icon.height - 4);
    }
    if (golden) goldify(c);
  }
  frameCache.set(key, c);
  return c;
}

// ---------- hats ----------

const hatCache = new Map<number, HTMLCanvasElement | null>();

function isEmpty(c: HTMLCanvasElement): boolean {
  try {
    const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
    if (!d) return false;
    for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) return false;
    return true;
  } catch {
    return false; // can't tell; assume there's a hat
  }
}

/** Opaque bounding box of a canvas, or null if it's blank / unreadable. */
function bbox(c: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  try {
    const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data;
    if (!d) return null;
    let x0 = c.width;
    let y0 = c.height;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3]! === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch {
    return null;
  }
}

/** A usable icon from the hats module (the stub hands back a blank 300x150 canvas). */
function moduleHatIcon(id: number): HTMLCanvasElement | null {
  try {
    const c = hatIcon(id, { scale: 1 });
    if (!(c instanceof HTMLCanvasElement) || c.width < 4 || c.height < 4 || c.width > 64 || c.height > 64) return null;
    return isEmpty(c) ? null : c;
  } catch {
    return null;
  }
}

function validHatId(id: number | null | undefined): id is number {
  return typeof id === "number" && Number.isInteger(id) && id >= 0 && id <= MAX_HAT_ID;
}

/**
 * The hat's front frame laid out in Stardew's 20x20 cell (brim on row 12, centred on column 10),
 * straight from the hats sheet, or rebuilt from the hats module's icon. Null = no such hat.
 */
export function hatCell(id: number | null | undefined): HTMLCanvasElement | null {
  if (!validHatId(id)) return null;
  if (hatCache.has(id)) return hatCache.get(id)!;
  let out: HTMLCanvasElement | null = null;
  const img = sheet("animalHats");
  const cols = img ? Math.floor(img.width / HAT_CELL) : 0;
  const sx = cols ? (id % cols) * HAT_CELL : 0;
  const sy = cols ? Math.floor(id / cols) * HAT_CELL * 4 : 0;
  if (img && cols && sy + HAT_CELL <= img.height) {
    const c = document.createElement("canvas");
    c.width = c.height = HAT_CELL;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, HAT_CELL, HAT_CELL, 0, 0, HAT_CELL, HAT_CELL);
      out = isEmpty(c) ? null : c;
    }
  } else {
    // No sheet: centre the module's icon on the brim line instead.
    const icon = moduleHatIcon(id);
    const box = icon && bbox(icon);
    if (icon && box) {
      const c = document.createElement("canvas");
      c.width = c.height = HAT_CELL;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        const dx = Math.round(HAT_CENTRE_COL - box.w / 2);
        const dy = HAT_BRIM_ROW + 1 - box.h;
        ctx.drawImage(icon, box.x, box.y, box.w, box.h, dx, dy, box.w, box.h);
        out = c;
      }
    }
  }
  // Don't remember a miss made before the sheet arrived.
  if (out || img) hatCache.set(id, out);
  return out;
}

/** The sheep module's own placement, so a hat sits on the card exactly where it sits on the farm. */
function drawHatViaModule(ctx: CanvasRenderingContext2D, hat: number, look: SheepLook, frame: number, ox: number, oy: number): boolean {
  try {
    const p = hatPlacement(look, frame, false);
    if (p.behind) return false; // only back views tuck the hat behind the wool; ours face front
    return drawModuleHat(ctx, hat, p.dir, ox + p.x, oy + p.y);
  } catch {
    return false;
  }
}

/** Draw a hat on the head of a (front-facing) sheep frame that was drawn at (ox, oy). */
export function drawHat(ctx: CanvasRenderingContext2D, hat: number | null | undefined, wanted: SheepLook, frame: number, ox = 0, oy = 0): void {
  const look = effectiveLook(wanted);
  if (!validHatId(hat) || !hasRealSheet(look)) return;
  if (drawHatViaModule(ctx, hat, look, frame, ox, oy)) return;
  const cell = hatCell(hat);
  if (!cell) return;
  const [cx, top] = HEAD[look][frame] ?? HEAD[look][FRAME.idleFront]!;
  ctx.drawImage(cell, ox + cx - HAT_CENTRE_COL, oy + top + HAT_SINK[look] - HAT_BRIM_ROW);
}

/**
 * A crisp DOM icon for a hat (for the picker): the hats module's icon when it has one,
 * otherwise the cell trimmed to the hat. Sized with --w/--h/--s like spriteIcon.
 */
export function hatTileIcon(id: number, scale = 1): HTMLCanvasElement {
  let c = moduleHatIcon(id);
  if (!c) {
    const cell = hatCell(id);
    const box = cell && bbox(cell);
    c = document.createElement("canvas");
    if (cell && box) {
      c.width = box.w;
      c.height = box.h;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cell, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
      }
    } else {
      c.width = c.height = 1;
    }
  }
  c.classList.add("sv-sprite");
  c.style.setProperty("--w", String(c.width));
  c.style.setProperty("--h", String(c.height));
  c.style.setProperty("--s", String(scale));
  c.setAttribute("aria-hidden", "true");
  return c;
}

// ---------- still portraits (flock list, hat picker) ----------

function portraitSource(wanted: SheepLook, golden: boolean): CanvasImageSource & { width: number; height: number } {
  // The sheep module's stills share its golden tint (and shadow) with the farm.
  const look = effectiveLook(wanted);
  const key = `sheep.portrait${look === "woolly" ? "" : `.${look}`}${golden ? ".golden" : ""}`;
  if (has(key)) {
    const c = spriteCanvas(key, 1);
    if (c.width === SIZE && c.height === SIZE) return c;
  }
  return sheepFrame(look, FRAME.idleFront, golden);
}

const portraitCache = new Map<string, HTMLCanvasElement>();

/** Paint the front-facing still of a sheep (with its hat) into a fresh 32x32 canvas. */
export function portraitCanvas(look: SheepLook, golden: boolean, hat: number | null): HTMLCanvasElement {
  const key = `${look}:${golden ? 1 : 0}:${hat ?? "-"}`;
  let src = portraitCache.get(key);
  if (!src) {
    src = document.createElement("canvas");
    src.width = src.height = SIZE;
    const ctx = src.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(portraitSource(look, golden), 0, 0);
      drawHat(ctx, hat, look, FRAME.idleFront);
    }
    portraitCache.set(key, src);
  }
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0);
  }
  return c;
}

/** A sheep's still portrait as a DOM sprite (class sv-sprite, scaled with --s like spriteIcon). */
export function sheepPortraitIcon(s: Sheep, opts: { scale?: number; class?: string; now?: number } = {}): HTMLCanvasElement {
  const c = portraitCanvas(lookOf(s, opts.now), s.golden, s.hat);
  c.className = `sv-sprite ${opts.class ?? ""}`;
  c.style.setProperty("--w", String(SIZE));
  c.style.setProperty("--h", String(SIZE));
  c.style.setProperty("--s", String(opts.scale ?? 1));
  c.setAttribute("aria-hidden", "true");
  return c;
}

// ---------- the big animated sheep (card, hat picker, the lamb for sale) ----------

const reducedMotion = (): boolean => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const NIBBLE = [...FRAME.graze, FRAME.graze[2], FRAME.graze[3], FRAME.graze[2], FRAME.graze[1], FRAME.graze[0]];

export interface SheepSpriteState {
  look: SheepLook;
  golden: boolean;
  asleep: boolean;
  hat: number | null;
  label: string;
}

/** A big sheep that blinks, sleeps, and baas + hops + nibbles when poked. */
export class SheepSprite {
  readonly button: HTMLButtonElement;
  readonly scene: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private st: SheepSpriteState = { look: "woolly", golden: false, asleep: false, hat: null, label: "" };
  private current: number = FRAME.idleFront;
  private blinkTimer = 0;
  private frameTimer = 0;
  private nibbling = false;
  private stopped = false;
  private started = false;

  constructor(onPoke: () => void) {
    this.canvas = el("canvas", { class: "an-sprite", width: SIZE, height: SIZE });
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d");
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    this.button = el(
      "button",
      { class: "an-poke", type: "button" },
      this.canvas,
      el("span", { class: "an-zzz", "aria-hidden": "true" }, "z", el("span", null, "z")),
    );
    this.button.addEventListener("click", () => {
      onPoke();
      this.hop();
    });
    this.scene = el("div", { class: "an-scene" }, this.button);
  }

  set(next: SheepSpriteState): void {
    const prev = this.st;
    const changed = !this.started || next.look !== prev.look || next.golden !== prev.golden || next.asleep !== prev.asleep || next.hat !== prev.hat;
    this.st = { ...next };
    this.button.setAttribute("aria-label", next.label);
    this.scene.classList.toggle("is-golden", next.golden);
    this.scene.classList.toggle("is-asleep", next.asleep);
    this.scene.classList.toggle("is-lamb", next.look === "lamb");
    if (!changed) return;
    this.started = true;
    if (this.nibbling && !next.asleep) this.show(this.current);
    else {
      this.nibbling = false;
      clearTimeout(this.frameTimer);
      this.show(next.asleep ? FRAME.asleep : FRAME.idleFront);
    }
    this.scheduleBlink();
  }

  private show(index: number): void {
    this.current = index;
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(sheepFrame(this.st.look, index, this.st.golden), 0, 0);
    drawHat(ctx, this.st.hat, this.st.look, index);
  }

  private scheduleBlink(): void {
    clearTimeout(this.blinkTimer);
    if (this.stopped) return;
    this.blinkTimer = window.setTimeout(
      () => {
        if (this.stopped) return;
        if (!this.st.asleep && !this.nibbling) {
          this.show(FRAME.asleep); // eyes closed = a blink
          window.setTimeout(() => {
            if (!this.stopped && !this.st.asleep && !this.nibbling) this.show(FRAME.idleFront);
          }, 150);
        }
        this.scheduleBlink();
      },
      2200 + Math.random() * 3200,
    );
  }

  /** Poke: baa, hop, and a quick nibble of grass. */
  hop(sound = true): void {
    if (this.stopped) return;
    if (sound) sfx("baa");
    this.button.classList.remove("is-hopping");
    void this.button.offsetWidth; // restart the CSS animation
    this.button.classList.add("is-hopping");
    if (this.st.asleep || reducedMotion() || !sound) return;
    clearTimeout(this.frameTimer);
    this.nibbling = true;
    let i = 0;
    const step = () => {
      if (this.stopped) return;
      if (i < NIBBLE.length && !this.st.asleep) {
        this.show(NIBBLE[i++]!);
        this.frameTimer = window.setTimeout(step, 110);
      } else {
        this.nibbling = false;
        this.show(this.st.asleep ? FRAME.asleep : FRAME.idleFront);
      }
    };
    this.frameTimer = window.setTimeout(step, 260);
  }

  /** A little heart floats up out of the sheep. */
  heart(): void {
    const h = el("span", { class: "an-petheart", "aria-hidden": "true" }, spriteIcon("ui.heart.full", { scale: 2 }));
    this.scene.append(h);
    window.setTimeout(() => h.remove(), 1100);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.blinkTimer);
    clearTimeout(this.frameTimer);
  }
}
