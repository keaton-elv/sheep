// The tiny game engine: a pixel-perfect canvas, a fixed-ish timestep loop, y-sorted entities,
// render passes for ground/overlays, tap hit-testing, and the farm's sense of time & weather.

import { seasonOf, type Season } from "../../shared/calendar";
import type { WeatherKind } from "../../shared/types";
import { computeLayout, HUD_TOOLBAR_H, type Layout, type LayoutInsets } from "../world/layout";

export interface Entity {
  /** World position of the entity's feet, in game pixels. Entities are drawn sorted by y. */
  x: number;
  y: number;
  /** Draw layer. Entities sort by (layer, y). Default 1. Use 0 for flat ground things. */
  layer?: number;
  update?(dt: number, g: Game): void;
  draw(ctx: CanvasRenderingContext2D, g: Game): void;
  /** True if the world point hits this entity (for taps). Checked front-to-back. */
  hit?(wx: number, wy: number): boolean;
  onTap?(g: Game, wx: number, wy: number): void;
  /** Set true to have the engine drop this entity after the current frame. */
  dead?: boolean;
}

/** A render pass runs before (order < 0) or after (order > 0) the entities. */
export interface RenderPass {
  order: number;
  draw(ctx: CanvasRenderingContext2D, g: Game): void;
}

/** A light that glows through the night overlay. Re-added every frame by whoever owns it. */
export interface Light {
  x: number;
  y: number;
  radius: number;
  /** CSS color of the glow center, e.g. "rgba(255,200,120,0.9)". */
  color: string;
}

export type Tool = "hand" | "shears";

export interface FarmEnv {
  /** "Now", possibly overridden by ?time=, ?date=, ?speed= for testing. */
  now: Date;
  season: Season;
  /** 0..24, fractional. */
  hour: number;
  /** 0 = broad daylight, 1 = deepest night. */
  darkness: number;
  isNight: boolean;
  weather: WeatherKind;
}

export type GroundTapHandler = (wx: number, wy: number) => boolean | void;

type Listener = (...args: any[]) => void;

/** When darkness starts creeping in, per season (Stardew: 6pm in winter, 8pm otherwise-ish). */
export const DUSK_HOUR: Record<Season, number> = { spring: 19.5, summer: 20.5, fall: 18.5, winter: 17.5 };
export const DAWN_HOUR = 6;

/** The running game, for menu code that needs the farm's env (time/season/weather overrides). */
export let currentGame: Game | null = null;

const params = new URLSearchParams(location.search);

export class Game {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Device pixels per game pixel (always an integer, so pixels stay crisp). */
  scale = 4;
  /** CSS pixels per game pixel (= scale / devicePixelRatio). Use for sizing DOM UI. */
  cssScale = 2;
  /** Logical size in game pixels. */
  w = 320;
  h = 240;
  /** What the canvas clears to under the ground: the page's season color (main.ts keeps it in sync). */
  clearColor = getComputedStyle(document.documentElement).getPropertyValue("--season-bg").trim() || "#5a8f3c";
  layout: Layout;
  /** Seconds since the game started (scaled by ?speed only for the clock, not for animation). */
  time = 0;
  tool: Tool = "hand";
  env: FarmEnv;
  /** Lights collected this frame; cleared at the start of every frame. */
  lights: Light[] = [];
  /**
   * False until the farm is first on screen: the HUD and toolbar mount under the loading screen (and
   * the title screen, logged out), so arrival touches wait for show(), which emits "shown".
   */
  shown = false;

  private entities: Entity[] = [];
  private passes: RenderPass[] = [];
  private listeners = new Map<string, Set<Listener>>();
  private groundTapHandlers: GroundTapHandler[] = [];
  private last = 0;
  private bootClock = Date.now();
  private weatherKind: WeatherKind = "sunny";
  private insetProbe: HTMLDivElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No 2D canvas?!");
    this.ctx = ctx;
    currentGame = this;
    this.layout = computeLayout(this.w, this.h);
    this.env = this.computeEnv();
    this.resize();
    addEventListener("resize", () => this.resize());
    visualViewport?.addEventListener("resize", () => this.resize());
    this.bindInput();
  }

  // ---------- sizing ----------

  resize(): void {
    const dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 100) / 100);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    // Mid-rotation / hidden-tab moments can report a 0x0 viewport; keep the last good layout.
    if (cssW < 1 || cssH < 1) return;
    const devW = Math.round(cssW * dpr);
    const devH = Math.round(cssH * dpr);
    // Aim for roughly 240+ game pixels on the short side (Stardew at 1080p is 480x270).
    this.scale = Math.max(2, Math.floor(Math.min(devW, devH) / 240));
    this.cssScale = this.scale / dpr;
    this.canvas.width = devW;
    this.canvas.height = devH;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.w = Math.ceil(devW / this.scale);
    this.h = Math.ceil(devH / this.scale);
    this.layout = computeLayout(this.w, this.h, this.insets());
    document.documentElement.style.setProperty("--px", `${this.cssScale}px`);
    this.emit("resize", this);
  }

  /** Re-run layout (e.g. after the toolbar sets --toolbar-h). Emits "resize". */
  relayout(): void {
    this.resize();
  }

  /** Safe-area insets and the toolbar's real height, converted to game px. */
  private insets(): LayoutInsets {
    const probe = (this.insetProbe ??= (() => {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
        "padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);" +
        "padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)";
      document.body.appendChild(el);
      return el;
    })());
    const cs = getComputedStyle(probe);
    const toolbarCss = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--toolbar-h")) || 0;
    return {
      top: (parseFloat(cs.paddingTop) || 0) / this.cssScale,
      bottom: (parseFloat(cs.paddingBottom) || 0) / this.cssScale,
      left: (parseFloat(cs.paddingLeft) || 0) / this.cssScale,
      right: (parseFloat(cs.paddingRight) || 0) / this.cssScale,
      toolbarH: toolbarCss ? toolbarCss / this.cssScale : HUD_TOOLBAR_H,
    };
  }

  // ---------- entities & passes ----------

  add<T extends Entity>(e: T): T {
    this.entities.push(e);
    return e;
  }

  remove(e: Entity): void {
    e.dead = true;
  }

  all(): readonly Entity[] {
    return this.entities;
  }

  addPass(pass: RenderPass): () => void {
    this.passes.push(pass);
    this.passes.sort((a, b) => a.order - b.order);
    return () => {
      this.passes = this.passes.filter((p) => p !== pass);
    };
  }

  addLight(light: Light): void {
    this.lights.push(light);
  }

  // ---------- events ----------

  on(name: string, fn: Listener): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(name: string, ...args: unknown[]): void {
    this.listeners.get(name)?.forEach((fn) => fn(...args));
  }

  /** The loading screen is fading off the farm (and the title screen is gone, if it was up). Once. */
  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.emit("shown");
  }

  setTool(tool: Tool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    this.emit("tool", tool);
  }

  setWeather(kind: WeatherKind): void {
    this.weatherKind = kind;
  }

  /**
   * Tap interceptors get first dibs on EVERY tap, before entities (e.g. "tap where the scarecrow
   * should go"). Return true to swallow the tap. Newest handler runs first.
   */
  onGroundTap(fn: GroundTapHandler): () => void {
    this.groundTapHandlers.unshift(fn);
    return () => {
      this.groundTapHandlers = this.groundTapHandlers.filter((h) => h !== fn);
    };
  }

  // ---------- time ----------

  /** The farm's notion of now. Honors ?time=HH:MM, ?date=YYYY-MM-DD and ?speed=N for testing. */
  now(): Date {
    const speed = Number(params.get("speed") ?? 1) || 1;
    const real = Date.now();
    const d = new Date(this.bootClock + (real - this.bootClock) * speed);
    const date = params.get("date");
    if (date) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      if (m) d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const time = params.get("time");
    if (time) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(time);
      if (m) {
        const base = new Date(d);
        base.setHours(Number(m[1]), Number(m[2]), 0, 0);
        return new Date(base.getTime() + (real - this.bootClock) * speed);
      }
    }
    return d;
  }

  private computeEnv(): FarmEnv {
    const now = this.now();
    const season = (params.get("season") as Season | null) ?? seasonOf(now);
    const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const dusk = DUSK_HOUR[season] ?? 19;
    let darkness: number;
    if (hour >= dusk) darkness = Math.min(1, (hour - dusk) / 2);
    else if (hour < DAWN_HOUR) darkness = 1;
    else if (hour < DAWN_HOUR + 1) darkness = 1 - (hour - DAWN_HOUR);
    else darkness = 0;
    const weather = (params.get("weather") as WeatherKind | null) ?? this.weatherKind;
    // Gloomy weather dims the day a little, like Stardew's rainy days.
    if (weather === "rain" || weather === "storm") darkness = Math.max(darkness, 0.25);
    return { now, season, hour, darkness, isNight: darkness > 0.5, weather };
  }

  // ---------- loop ----------

  start(): void {
    const frame = (t: number) => {
      const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
      this.last = t;
      this.step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private step(dt: number): void {
    this.time += dt;
    this.env = this.computeEnv();
    this.lights.length = 0;
    for (const e of this.entities) e.update?.(dt, this);
    if (this.entities.some((e) => e.dead)) this.entities = this.entities.filter((e) => !e.dead);
    this.emit("tick", dt);
    this.render();
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.clearColor;
    ctx.fillRect(0, 0, this.w, this.h);

    for (const p of this.passes) if (p.order < 0) p.draw(ctx, this);

    const sorted = [...this.entities].sort((a, b) => (a.layer ?? 1) - (b.layer ?? 1) || a.y - b.y);
    for (const e of sorted) {
      ctx.save();
      e.draw(ctx, this);
      ctx.restore();
    }

    for (const p of this.passes) if (p.order >= 0) p.draw(ctx, this);
  }

  // ---------- input ----------

  /** Convert a pointer event's client coords to world (game pixel) coords. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * this.w, y: ((clientY - r.top) / r.height) * this.h };
  }

  /** Convert world (game pixel) coords to client coords (the inverse of toWorld). */
  toClient(x: number, y: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (x / this.w) * r.width, y: r.top + (y / this.h) * r.height };
  }

  private bindInput(): void {
    let down: { x: number; y: number; id: number } | null = null;
    this.canvas.addEventListener("pointerdown", (ev) => {
      down = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
      this.emit("pointerdown", this.toWorld(ev.clientX, ev.clientY));
    });
    this.canvas.addEventListener("pointerup", (ev) => {
      if (!down || down.id !== ev.pointerId) return;
      const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
      down = null;
      if (moved > 12) return;
      const { x, y } = this.toWorld(ev.clientX, ev.clientY);
      this.tap(x, y);
    });
    this.canvas.addEventListener("pointercancel", () => (down = null));
    this.canvas.addEventListener("pointermove", (ev) => {
      const { x, y } = this.toWorld(ev.clientX, ev.clientY);
      const hovering = this.hitTest(x, y);
      this.canvas.style.cursor = hovering?.onTap ? "pointer" : "default";
      this.emit("pointermove", { x, y });
    });
  }

  /** Front-most entity under the point (highest layer/y first). */
  hitTest(wx: number, wy: number): Entity | null {
    const sorted = [...this.entities].sort((a, b) => (b.layer ?? 1) - (a.layer ?? 1) || b.y - a.y);
    for (const e of sorted) if (e.onTap && e.hit?.(wx, wy)) return e;
    return null;
  }

  tap(wx: number, wy: number): void {
    this.emit("tap", { x: wx, y: wy });
    for (const h of this.groundTapHandlers) if (h(wx, wy)) return;
    const target = this.hitTest(wx, wy);
    if (target) target.onTap!(this, wx, wy);
    else this.emit("groundtap", { x: wx, y: wy });
  }
}

// ---------- small shared helpers ----------

/** Deterministic PRNG (mulberry32) so a sheep's quirks stay the same across reloads. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pick = <T>(arr: readonly T[], r: () => number = Math.random): T => arr[Math.floor(r() * arr.length)]!;
