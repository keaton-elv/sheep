// Time-of-day colour grading + the Stardew night: one reusable offscreen canvas holds a
// "multiply" colour (golden hour -> rosy dusk -> purple -> deep blue night -> lavender/peach dawn,
// times a weather gloom), with soft holes punched out wherever something glows. The same canvas is
// then re-filled (source-in, so the holes survive) with a navy "moonlight" lift that keeps nights
// blue instead of muddy brown/green. A warm additive glow is laid over each light so lamps and
// campfires feel cosy, and golden hour gets a soft-light orange so it glows instead of going olive.

import type { Season } from "../../shared/calendar";
import type { WeatherKind } from "../../shared/types";
import { clamp, type Game } from "../engine/game";
import { radialStamp } from "./sky-art";

export type RGB = [number, number, number];

/** Same numbers as the engine's darkness curve (kept in sync with engine/game.ts). */
const DUSK_HOUR: Record<Season, number> = { spring: 19.5, summer: 20.5, fall: 18.5, winter: 17.5 };
const DAWN_HOUR = 6;

// Multiply colours (white = untouched).
const WHITE: RGB = [255, 255, 255];
const GOLD: RGB = [255, 232, 196]; // golden hour, just before dusk (soft-light adds the glow)
const ROSE: RGB = [238, 168, 164]; // rosy dusk
const DUSK: RGB = [150, 118, 184]; // purple twilight
const NIGHT: RGB = [76, 84, 160]; // deep blue Stardew night
const DAWN_LAV: RGB = [140, 124, 192]; // lavender pre-dawn
const DAWN_PINK: RGB = [244, 176, 186]; // pink sunrise
const PEACH: RGB = [255, 220, 196]; // peachy early morning

interface Stop {
  at: number;
  c: RGB;
}
const EVENING: Stop[] = [
  { at: 0, c: GOLD },
  { at: 0.3, c: ROSE },
  { at: 0.62, c: DUSK },
  { at: 1, c: NIGHT },
];
const MORNING: Stop[] = [
  { at: 0, c: PEACH },
  { at: 0.28, c: DAWN_PINK },
  { at: 0.62, c: DAWN_LAV },
  { at: 1, c: NIGHT },
];

/** Golden hour: a soft-light orange (brightens + warms, unlike multiply which just goes olive). */
const GOLDEN_SOFTLIGHT = "#ff9840";
const GOLDEN_SOFTLIGHT_A = 0.35;
/** Screen washes: evening orange, morning pink. */
const WASH_EVENING_COLOR = "#ff8c3c";
const WASH_EVENING = 0.06;
const WASH_MORNING_COLOR = "#ff96aa";
const WASH_MORNING = 0.1;
/** Moonlight: a navy "screen" lift outside the light pools, so night reads blue, not mud. */
const NIGHT_LIFT_COLOR = "#22306e";
const NIGHT_LIFT_A = 0.32;
/** Light pools take on their lamp's colour (multiply), so lamplight on snow reads warm, not white. */
const LAMP_TINT_K = 0.7;
/** How long before dusk the golden hour starts creeping in. */
const GOLDEN_HOURS = 1.4;

/** Weather gloom (multiplied in on top of the time of day). */
const GLOOM: Record<WeatherKind, RGB> = {
  sunny: WHITE,
  windy: [250, 250, 252],
  cloudy: [226, 229, 240],
  fog: [222, 222, 232],
  snow: [214, 222, 244],
  rain: [172, 184, 212],
  storm: [134, 144, 184],
};
/** Green Rain gloom: a murky mossy green, like the 1.6 event. */
const GREEN_GLOOM: RGB = [176, 206, 150];

export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function sample(stops: Stop[], t: number, out: RGB): void {
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i]!;
    if (t <= b.at || i === stops.length - 1) {
      const a = stops[i - 1]!;
      const k = clamp((t - a.at) / (b.at - a.at), 0, 1);
      out[0] = a.c[0] + (b.c[0] - a.c[0]) * k;
      out[1] = a.c[1] + (b.c[1] - a.c[1]) * k;
      out[2] = a.c[2] + (b.c[2] - a.c[2]) * k;
      return;
    }
  }
}

function mix(a: RGB, b: RGB, t: number, out: RGB): void {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

/** How dark the sky is from the sun alone (0..1), ignoring weather. */
export function sunDarkness(hour: number, season: Season): number {
  const dusk = DUSK_HOUR[season] ?? 19;
  if (hour >= dusk) return Math.min(1, (hour - dusk) / 2);
  if (hour < DAWN_HOUR) return 1;
  if (hour < DAWN_HOUR + 1) return 1 - (hour - DAWN_HOUR);
  return 0;
}

/** The time-of-day multiply colour. */
export function timeTint(hour: number, season: Season, out: RGB): void {
  const dusk = DUSK_HOUR[season] ?? 19;
  const sd = sunDarkness(hour, season);
  if (hour >= 12) {
    if (sd > 0) sample(EVENING, sd, out);
    else mix(WHITE, GOLD, smoothstep(dusk - GOLDEN_HOURS, dusk, hour), out);
  } else {
    if (sd > 0) sample(MORNING, sd, out);
    else mix(WHITE, PEACH, 1 - smoothstep(DAWN_HOUR + 1, DAWN_HOUR + 2, hour), out);
  }
}

/** 0..1: how strongly the golden-hour (evening) or sunrise-pink (morning) wash shows. */
function warmWash(hour: number, season: Season, sd: number): number {
  const dusk = DUSK_HOUR[season] ?? 19;
  if (hour >= 12) return sd > 0 ? Math.max(0, 1 - sd / 0.4) : smoothstep(dusk - GOLDEN_HOURS, dusk, hour);
  return sd > 0 ? Math.max(0, 1 - sd / 0.55) : 1 - smoothstep(DAWN_HOUR + 1, DAWN_HOUR + 2, hour);
}

export interface ParsedColor {
  /** "r,g,b" for building rgba() strings. */
  rgb: string;
  alpha: number;
  /** Colour bucket (5 bits per channel) so near-identical colours share one glow stamp. */
  key: number;
}

/** Caps for the caches below, so a flickering campfire that builds a new colour string every
 *  frame can't grow memory or force a new canvas per frame. */
const MAX_PARSED = 256;
const MAX_GLOWS = 48;

export class SkyLight {
  /** Lightning flash strength (0..1), set by the weather. Drawn above the night. */
  flash = 0;
  /** Set by the weather on Green Rain days (tints the gloom mossy green). */
  greenRain = false;

  private overlay = document.createElement("canvas");
  private octx = this.overlay.getContext("2d")!;
  private hole: HTMLCanvasElement;
  private glows = new Map<number, HTMLCanvasElement>();
  private tints = new Map<number, HTMLCanvasElement>();
  private colors = new Map<string, ParsedColor>();
  private tint: RGB = [255, 255, 255];
  private gloom: RGB = [255, 255, 255];
  private gloomTarget: RGB = [255, 255, 255];
  private final: RGB = [255, 255, 255];
  private fill = "";
  private fillKey = -1;
  private started = false;

  constructor(hole: HTMLCanvasElement) {
    this.hole = hole;
  }

  /** Jump straight to the current weather's gloom on the next update. */
  snap(): void {
    this.started = false;
  }

  update(dt: number, g: Game): void {
    const target = this.greenRain ? GREEN_GLOOM : (GLOOM[g.env.weather] ?? WHITE);
    this.gloomTarget[0] = target[0];
    this.gloomTarget[1] = target[1];
    this.gloomTarget[2] = target[2];
    // Weather changes roll in over a few seconds instead of snapping.
    const k = this.started ? 1 - Math.exp(-dt * 0.6) : 1;
    mix(this.gloom, this.gloomTarget, k, this.gloom);
    this.started = true;
  }

  /** Order 100: colour grade + darkness with light holes, then warm glows. */
  draw(ctx: CanvasRenderingContext2D, g: Game): void {
    const env = g.env;
    timeTint(env.hour, env.season, this.tint);
    const sd = sunDarkness(env.hour, env.season);
    // At night the gloom matters less (it's dark anyway), so rainy nights don't go pitch black.
    const gloomK = 1 - sd * 0.75;
    const f = this.final;
    for (let i = 0; i < 3; i++) {
      const gl = 255 + (this.gloom[i]! - 255) * gloomK;
      f[i] = Math.round((this.tint[i]! * gl) / 255);
    }
    const lights = g.lights;
    const darkness = env.darkness;
    const untouched = f[0] >= 254 && f[1] >= 254 && f[2] >= 254;
    if (untouched) return;

    const w = g.w;
    const h = g.h;
    // A 0-sized canvas makes drawImage throw (and one throw stops the frame loop). iOS can report
    // a 0x0 window for a moment while rotating or prerendering.
    if (!(w > 0 && h > 0)) return;
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w;
      this.overlay.height = h;
    }
    const o = this.octx;
    const key = (f[0] << 16) | (f[1] << 8) | f[2];
    if (key !== this.fillKey) {
      this.fillKey = key;
      this.fill = `rgb(${f[0]},${f[1]},${f[2]})`;
    }
    o.globalCompositeOperation = "source-over";
    o.globalAlpha = 1;
    o.fillStyle = this.fill;
    o.fillRect(0, 0, w, h);

    // Punch light holes. Lights barely matter in daylight; on a rainy afternoon they glow faintly.
    const holeK = smoothstep(0.08, 0.55, darkness);
    if (holeK > 0 && lights.length) {
      o.globalCompositeOperation = "destination-out";
      o.imageSmoothingEnabled = true;
      for (const l of lights) {
        const c = this.parse(l.color);
        const r = l.radius;
        if (!(r > 0) || !(c.alpha > 0) || !Number.isFinite(l.x) || !Number.isFinite(l.y)) continue;
        o.globalAlpha = holeK * c.alpha;
        o.drawImage(this.hole, l.x - r, l.y - r, r * 2, r * 2);
      }
      o.globalCompositeOperation = "source-over";
      o.globalAlpha = 1;
    }

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.overlay, 0, 0, w, h);

    // Each light pool takes on a little of its lamp's colour.
    if (holeK > 0 && lights.length) {
      for (const l of lights) {
        const r = l.radius * 0.9;
        if (!(r > 0) || !Number.isFinite(l.x) || !Number.isFinite(l.y)) continue;
        const c = this.parse(l.color);
        if (!(c.alpha > 0)) continue;
        ctx.globalAlpha = holeK * c.alpha;
        ctx.drawImage(this.lampTint(c), l.x - r, l.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }

    // Moonlight: re-fill the overlay navy *inside its own alpha* (so the light pools stay warm)
    // and screen it on, lifting the shadows toward blue like a Stardew night.
    const liftA = smoothstep(0.25, 1, sd) * NIGHT_LIFT_A;
    if (liftA > 0.004) {
      o.globalCompositeOperation = "source-in";
      o.fillStyle = NIGHT_LIFT_COLOR;
      o.fillRect(0, 0, w, h);
      o.globalCompositeOperation = "source-over";
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = liftA;
      ctx.drawImage(this.overlay, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Golden hour glows orange (soft-light brightens and warms instead of going olive), and a
    // soft "screen" wash adds the evening orange / sunrise blush. Clouds and rain mute both.
    const evening = env.hour >= 12;
    const wash = warmWash(env.hour, env.season, sd);
    const sunny = clamp(1 - (255 - this.gloom[2]) / 90, 0, 1);
    const goldenA = evening ? wash * sunny * GOLDEN_SOFTLIGHT_A : 0;
    if (goldenA > 0.004) {
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = goldenA;
      ctx.fillStyle = GOLDEN_SOFTLIGHT;
      ctx.fillRect(0, 0, w, h);
    }
    const washA = wash * sunny * (evening ? WASH_EVENING : WASH_MORNING);
    if (washA > 0.004) {
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = washA;
      ctx.fillStyle = evening ? WASH_EVENING_COLOR : WASH_MORNING_COLOR;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha = 1;

    // Warm additive glow around each light.
    const glowK = smoothstep(0.15, 0.9, darkness) * 0.38;
    if (glowK > 0.01 && lights.length) {
      ctx.globalCompositeOperation = "lighter";
      for (const l of lights) {
        const r = l.radius * 0.85;
        if (!(r > 0) || !Number.isFinite(l.x) || !Number.isFinite(l.y)) continue;
        const c = this.parse(l.color);
        if (!(c.alpha > 0)) continue;
        ctx.globalAlpha = glowK * c.alpha;
        ctx.drawImage(this.glow(c), l.x - r, l.y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }

  /** Order 110 (above the night): the lightning flash. */
  drawFlash(ctx: CanvasRenderingContext2D, g: Game): void {
    if (this.flash <= 0.003) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.flash);
    ctx.fillStyle = "#f2f4ff";
    ctx.fillRect(0, 0, g.w, g.h);
    ctx.restore();
  }

  private parse(color: string): ParsedColor {
    let c = this.colors.get(color);
    if (c) return c;
    c = parseColor(color);
    if (this.colors.size >= MAX_PARSED) this.colors.clear();
    this.colors.set(color, c);
    return c;
  }

  /** Multiply stamp per colour bucket: the lamp's colour (lightened) fading out to nothing. */
  private lampTint(c: ParsedColor): HTMLCanvasElement {
    let stamp = this.tints.get(c.key);
    if (stamp) return stamp;
    const [r, g, b] = c.rgb.split(",").map((v) => Math.round(255 + (Number(v) - 255) * LAMP_TINT_K));
    const rgb = `${r},${g},${b}`;
    stamp = radialStamp(64, [
      [0, `rgba(${rgb},1)`],
      [0.45, `rgba(${rgb},0.7)`],
      [1, `rgba(${rgb},0)`],
    ]);
    if (this.tints.size >= MAX_GLOWS) this.tints.clear();
    this.tints.set(c.key, stamp);
    return stamp;
  }

  /** Glow stamp per colour bucket, at full strength; the light's alpha goes on globalAlpha. */
  private glow(c: ParsedColor): HTMLCanvasElement {
    let stamp = this.glows.get(c.key);
    if (stamp) return stamp;
    const rgb = c.rgb;
    stamp = radialStamp(64, [
      [0, `rgba(${rgb},1)`],
      [0.35, `rgba(${rgb},0.55)`],
      [0.7, `rgba(${rgb},0.16)`],
      [1, `rgba(${rgb},0)`],
    ]);
    if (this.glows.size >= MAX_GLOWS) this.glows.clear();
    this.glows.set(c.key, stamp);
    return stamp;
  }
}

/** Tiny CSS colour parser for #rgb, #rgba, #rrggbb, #rrggbbaa, rgb() and rgba(). Anything it can't
 *  read (named colours, hsl(), junk) becomes warm lamp light rather than throwing. */
export function parseColor(color: unknown): ParsedColor {
  const s = typeof color === "string" ? color.trim() : "";
  let r = 255;
  let g = 200;
  let b = 120;
  let a = 0.9;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    r = +m[1]!;
    g = +m[2]!;
    b = +m[3]!;
    a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  } else if ((m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s))) {
    let hex = m[1]!;
    if (hex.length <= 4) hex = [...hex].map((ch) => ch + ch).join("");
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    r = n(0);
    g = n(2);
    b = n(4);
    a = hex.length === 8 ? n(6) / 255 : 1;
  }
  if (![r, g, b, a].every(Number.isFinite)) {
    r = 255;
    g = 200;
    b = 120;
    a = 0.9;
  }
  r = Math.round(clamp(r, 0, 255));
  g = Math.round(clamp(g, 0, 255));
  b = Math.round(clamp(b, 0, 255));
  return { rgb: `${r},${g},${b}`, alpha: clamp(a, 0, 1), key: ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3) };
}
