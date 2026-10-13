// Weather & seasonal ambience: Stardew rain (streak -> 3-frame splash), storms with lightning and a
// far-off rumble, drifting snow, fog banks, windy-day debris (petals / leaves / flakes by season),
// slow cloud shadows, spring petals, fall leaves, summer-night fireflies and winter frost sparkles.
// Easter egg: on a rare rainy summer day the rain comes down green (Stardew 1.6's Green Rain).
//
// All particles live in fixed pools allocated once; counts scale with screen area and drop a lot
// when the player prefers reduced motion. Levels ease toward the current weather so a change
// (the worker refreshes it every 15 minutes) rolls in instead of popping.

import type { Season } from "../../shared/calendar";
import type { WeatherKind } from "../../shared/types";
import { sfx } from "../audio";
import { clamp, rng, type Game, type Light } from "../engine/game";
import { RAIN_SLANT, RAIN_TIP, SPLASH_CENTER, type ParticleSet, type SkyArt } from "./sky-art";
import { smoothstep, sunDarkness, type SkyLight } from "./sky-light";

const MAX_DROPS = 300;
const MAX_FLAKES = 220;
const MAX_DEBRIS = 96;
const MAX_FIREFLIES = 18;
const MAX_SPARKLES = 24;
const SPLASH_FRAME = 0.065;
const SPARKLE_SEQ = [0, 1, 2, 2, 1, 0];
const FIREFLY_COLOR = "rgba(214,255,120,0.6)";

/** Stardew 1.6: Green Rain falls on one of these summer days. */
const GREEN_RAIN_DAYS = [5, 6, 7, 14, 15, 16, 18, 23];
const greenRainParam = (() => {
  try {
    return new URLSearchParams(location.search).has("greenrain");
  } catch {
    return false;
  }
})();

/**
 * Green Rain easter egg: each real summer month picks one of Stardew's Green Rain days; if it
 * actually rains on that day, the rain comes down green. Rare on purpose. ?greenrain forces it.
 */
function isGreenRainDay(now: Date, season: Season): boolean {
  if (greenRainParam) return true;
  if (season !== "summer") return false;
  const y = now.getFullYear();
  const m = now.getMonth();
  const pick = GREEN_RAIN_DAYS[Math.floor(rng(y * 12 + m + 0x5eed)() * GREEN_RAIN_DAYS.length)] ?? 5;
  return now.getDate() === pick;
}

const rand = Math.random;
const between = (a: number, b: number) => a + rand() * (b - a);

interface Drop {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds of falling left; once <= 0 the drop is splashing. */
  fall: number;
  splash: number;
  grey: boolean;
  green: boolean;
}

interface Flake {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  sway: number;
  swayF: number;
  phase: number;
  kind: number;
  drift: number;
}

interface Debris {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  drag: number;
  phase: number;
  swayA: number;
  swayF: number;
  spin: number;
  spinT: number;
  set: ParticleSet | null;
  /** -1 = tumble through the frames, otherwise always show this frame. */
  frame: number;
}

interface Firefly {
  active: boolean;
  x: number;
  y: number;
  ang: number;
  speed: number;
  phase: number;
  freq: number;
  fade: number;
  glow: number;
  light: Light;
}

interface Sparkle {
  active: boolean;
  x: number;
  y: number;
  t: number;
  life: number;
}

interface Cloud {
  tex: number;
  x: number;
  y: number;
  speed: number;
  vis: number;
}

interface Targets {
  rain: number;
  storm: number;
  snow: number;
  fog: number;
  wind: number;
  cloudCount: number;
  cloudAlpha: number;
}

function weatherTargets(kind: WeatherKind, season: Season, hour: number, out: Targets): void {
  out.rain = kind === "rain" ? 0.7 : kind === "storm" ? 1 : 0;
  out.storm = kind === "storm" ? 1 : 0;
  const calm = kind === "sunny" || kind === "cloudy" || kind === "windy" || kind === "fog";
  out.snow = kind === "snow" ? (season === "winter" ? 1 : 0.7) : season === "winter" && calm ? 0.03 : 0;
  // A soft morning mist on calm mornings is a lovely touch; real fog days get the full treatment.
  const still = kind === "sunny" || kind === "cloudy";
  const mist = still && season !== "winter" ? 0.28 * smoothstep(5, 6.3, hour) * (1 - smoothstep(7.4, 9, hour)) : 0;
  out.fog = Math.max(kind === "fog" ? 1 : kind === "rain" ? 0.1 : kind === "snow" ? 0.12 : 0, mist);
  out.wind =
    kind === "windy" ? 1 : kind === "storm" ? 0.75 : kind === "rain" ? 0.3 : kind === "cloudy" ? 0.25 : kind === "snow" ? 0.2 : kind === "fog" ? 0.04 : 0.12;
  out.cloudCount = kind === "cloudy" ? 5 : kind === "windy" ? 4 : kind === "sunny" ? 2 : 0;
  out.cloudAlpha = kind === "cloudy" ? 0.17 : kind === "windy" ? 0.12 : kind === "sunny" ? 0.075 : 0;
}

export class SkyWeather {
  private g: Game;
  private art: SkyArt;
  private light: SkyLight;
  private reduced = false;
  private t = 0;
  /** False on frames where everything should snap to the weather instead of easing. */
  private started = false;
  private lastWeather: WeatherKind | null = null;
  private changedOnce = false;

  // eased levels
  private rain = 0;
  private storm = 0;
  private snow = 0;
  private fog = 0;
  private windBase = 0.1;
  private cloudAlpha = 0;
  private fireflyLevel = 0;
  private targets: Targets = { rain: 0, storm: 0, snow: 0, fog: 0, wind: 0, cloudCount: 0, cloudAlpha: 0 };

  // wind
  private wind = 0;
  /** Wind speed in game px/s (positive = blowing toward the left, like the rain leans). */
  private windPx = 0;
  private gustLeft = 0;
  private gustDur = 1;
  private gustStr = 0;
  private gustWait = 4;

  // caps (recomputed on resize)
  private maxDrops = 120;
  private maxFlakes = 120;
  private maxDebrisWindy = 40;
  private ambientDebris = 8;
  private maxFireflies = 10;
  private sparkleRate = 2;

  private drops: Drop[] = [];
  private flakes: Flake[] = [];
  private debris: Debris[] = [];
  private fireflies: Firefly[] = [];
  private sparkles: Sparkle[] = [];
  private clouds: Cloud[] = [];
  private debrisAcc = 0;
  private sparkleAcc = 0;

  // lightning
  /** Share of drops drawn with the darker grey sprite (most of them on white winter snow). */
  private greyShare = 0.35;
  private greenRain = false;
  private greenCheck = 0;

  private boltIn = between(4, 12);
  private flashT = -1;
  private thunderIn = -1;
  private rumbleIn = -1;

  constructor(g: Game, art: SkyArt, light: SkyLight) {
    this.g = g;
    this.art = art;
    this.light = light;
    for (let i = 0; i < MAX_DROPS; i++)
      this.drops.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, fall: 0, splash: 0, grey: false, green: false });
    for (let i = 0; i < MAX_FLAKES; i++)
      this.flakes.push({ active: false, x: 0, y: 0, vy: 0, sway: 0, swayF: 0, phase: 0, kind: 0, drift: 1 });
    for (let i = 0; i < MAX_DEBRIS; i++)
      this.debris.push({ active: false, x: 0, y: 0, vy: 0, drag: 1, phase: 0, swayA: 0, swayF: 0, spin: 0, spinT: 0, set: null, frame: -1 });
    for (let i = 0; i < MAX_FIREFLIES; i++)
      this.fireflies.push({
        active: false,
        x: 0,
        y: 0,
        ang: 0,
        speed: 0,
        phase: 0,
        freq: 1,
        fade: 0,
        glow: 0,
        light: { x: 0, y: 0, radius: 8, color: FIREFLY_COLOR },
      });
    for (let i = 0; i < MAX_SPARKLES; i++) this.sparkles.push({ active: false, x: 0, y: 0, t: 0, life: 1 });
    for (let i = 0; i < 5; i++) this.clouds.push({ tex: i % art.clouds.length, x: 0, y: 0, speed: between(0.75, 1.3), vis: 0 });

    const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (mq) {
      this.reduced = mq.matches;
      mq.addEventListener?.("change", () => {
        this.reduced = mq.matches;
        this.resize();
      });
    }
    this.resize();
    this.scatterClouds();
  }

  resize(): void {
    const area = this.g.w * this.g.h;
    const m = this.reduced ? 0.35 : 1;
    // Stardew runs ~1 drop per 820 game px² in normal rain; storms get the full pool.
    this.maxDrops = Math.round(clamp(area / 520, 40, MAX_DROPS) * m);
    this.maxFlakes = Math.round(clamp(area / 800, 30, MAX_FLAKES) * m);
    this.maxDebrisWindy = Math.round(clamp(area / 2600, 12, MAX_DEBRIS) * m);
    this.ambientDebris = Math.round(clamp(area / 22000, 3, 10) * (this.reduced ? 0.5 : 1));
    this.maxFireflies = Math.round(clamp(area / 9000, 6, MAX_FIREFLIES) * (this.reduced ? 0.6 : 1));
    this.sparkleRate = clamp(area / 50000, 1, 5) * (this.reduced ? 0.5 : 1);
  }

  // ---------------------------------------------------------------- update

  update(dt: number): void {
    const g = this.g;
    const env = g.env;
    this.t += dt;
    const sd = sunDarkness(env.hour, env.season);
    const tg = this.targets;
    weatherTargets(env.weather, env.season, env.hour, tg);
    // Pale drops vanish on Stardew's white winter ground; use the grey sprite for most of them.
    this.greyShare = env.season === "winter" ? 0.8 : 0.35;
    this.greenCheck -= dt;
    if (this.greenCheck <= 0) {
      this.greenCheck = 5;
      const raining = env.weather === "rain" || env.weather === "storm";
      this.greenRain = raining && isGreenRainDay(env.now, env.season);
      this.light.greenRain = this.greenRain;
    }

    // The real weather arrives a moment after load (it starts as "sunny"). Snap to that first
    // report so you open the app to a farm that's already rainy/snowy; later changes roll in.
    if (env.weather !== this.lastWeather) {
      if (this.lastWeather !== null && !this.changedOnce) {
        this.changedOnce = true;
        if (this.t < 90) {
          this.started = false;
          this.light.snap();
        }
      }
      this.lastWeather = env.weather;
    }

    // Ease toward the weather (snap on the very first frame so a rainy load starts rainy).
    const k = this.started ? 1 - Math.exp(-dt * 0.35) : 1;
    this.rain += (tg.rain - this.rain) * k;
    this.storm += (tg.storm - this.storm) * k;
    this.snow += (tg.snow - this.snow) * k;
    this.fog += (tg.fog - this.fog) * k;
    this.windBase += (tg.wind - this.windBase) * k;
    this.cloudAlpha += (tg.cloudAlpha - this.cloudAlpha) * k;
    const calmNight = env.season === "summer" && sd > 0.45 && env.weather !== "rain" && env.weather !== "storm" && env.weather !== "snow";
    this.fireflyLevel += ((calmNight ? 1 : 0) - this.fireflyLevel) * (this.started ? 1 - Math.exp(-dt * 0.5) : 1);

    this.updateWind(dt);
    this.updateRain(dt);
    this.updateSnow(dt, !this.started);
    this.updateDebris(dt, env.season, env.weather);
    this.updateFireflies(dt);
    this.updateSparkles(dt, env.season, env.weather, sd);
    this.updateClouds(dt, tg.cloudCount);
    this.updateLightning(dt);
    this.started = true;
  }

  private updateWind(dt: number): void {
    if (this.gustLeft > 0) {
      this.gustLeft -= dt;
    } else {
      this.gustWait -= dt;
      if (this.gustWait <= 0) {
        const blustery = this.windBase > 0.6;
        this.gustDur = between(1.4, 3.2);
        this.gustLeft = this.gustDur;
        this.gustStr = between(0.4, 1.1) * (blustery ? 1.2 : 0.6);
        this.gustWait = (blustery ? 2 : 7) + rand() * 6;
      }
    }
    const gust = this.gustLeft > 0 ? Math.sin(Math.PI * (1 - this.gustLeft / this.gustDur)) * this.gustStr : 0;
    const t = this.t;
    this.wind = this.windBase * (1 + 0.3 * Math.sin(t * 0.31) + 0.15 * Math.sin(t * 1.7 + 1) + gust);
    this.windPx = this.wind * 55;
  }

  // --- rain: Stardew-style, each drop falls briefly as a streak then splashes where it is.
  private spawnDrop(d: Drop, scatter: boolean): void {
    const g = this.g;
    const base = 380 + 110 * this.storm;
    d.active = true;
    d.vy = base * between(0.88, 1.12);
    d.vx = d.vy * RAIN_SLANT;
    d.x = between(-8, g.w + 40);
    d.y = between(-28, g.h - 10);
    d.fall = between(0.12, 0.5);
    if (scatter && rand() < 0.3) {
      d.fall = 0;
      d.splash = rand() * SPLASH_FRAME * 3;
    } else {
      d.splash = 0;
      if (scatter) d.fall *= rand();
    }
    d.green = this.greenRain;
    d.grey = !d.green && rand() < this.greyShare;
  }

  private updateRain(dt: number): void {
    const target = Math.floor(this.maxDrops * this.rain);
    if (target === 0 && !this.anyDrops) return;
    let any = false;
    const scatter = !this.started;
    for (let i = 0; i < MAX_DROPS; i++) {
      const d = this.drops[i]!;
      if (!d.active) {
        if (i >= target) continue;
        this.spawnDrop(d, scatter);
      }
      any = true;
      if (d.fall > 0) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.fall -= dt;
      } else {
        d.splash += dt;
        if (d.splash >= SPLASH_FRAME * 3) {
          if (i < target) this.spawnDrop(d, false);
          else d.active = false;
        }
      }
    }
    this.anyDrops = any;
  }
  private anyDrops = false;

  // --- snow: soft flakes drifting down with a sway.
  private spawnFlake(f: Flake, anywhere: boolean): void {
    const g = this.g;
    const r = rand();
    f.kind = r < 0.25 ? 0 : r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
    f.active = true;
    f.vy = 8 + f.kind * 4.5 + rand() * 6;
    f.sway = between(5, 13);
    f.swayF = between(0.7, 1.9);
    f.phase = rand() * Math.PI * 2;
    f.drift = between(0.6, 1.2);
    f.x = rand() * (g.w + 30);
    f.y = anywhere ? rand() * g.h : between(-12, -4);
  }

  private updateSnow(dt: number, anywhere: boolean): void {
    const g = this.g;
    const target = Math.floor(this.maxFlakes * this.snow + (this.snow > 0.01 ? 0.5 : 0));
    const wpx = this.windPx * 0.35;
    for (let i = 0; i < MAX_FLAKES; i++) {
      const f = this.flakes[i]!;
      if (!f.active) {
        if (i >= target) continue;
        this.spawnFlake(f, anywhere);
      }
      f.phase += dt * f.swayF;
      f.y += f.vy * dt;
      f.x += (Math.sin(f.phase) * f.sway - wpx * f.drift) * dt;
      if (f.x < -8) f.x += g.w + 16;
      else if (f.x > g.w + 8) f.x -= g.w + 16;
      if (f.y > g.h + 6) {
        if (i < target) this.spawnFlake(f, false);
        else f.active = false;
      }
    }
  }

  // --- debris: windy-day petals/leaves/flakes, plus occasional seasonal drifters on calm days.
  private debrisSet(season: Season): { set: ParticleSet | null; frame: number } {
    const a = this.art;
    const r = rand();
    switch (season) {
      case "spring":
        return { set: a.petals[r < 0.7 ? 0 : 1] ?? null, frame: -1 };
      case "summer":
        return { set: (r < 0.6 ? a.leaves.green : a.leaves.lime) ?? null, frame: -1 };
      case "fall":
        return {
          set: (r < 0.35 ? a.leaves.orange : r < 0.6 ? a.leaves.red : r < 0.85 ? a.leaves.gold : a.leaves.brown) ?? null,
          frame: -1,
        };
      default:
        return { set: a.flakes, frame: r < 0.5 ? 1 : 2 };
    }
  }

  private spawnDebris(p: Debris, season: Season, windy: boolean): void {
    const g = this.g;
    const pick = this.debrisSet(season);
    if (!pick.set) return;
    p.active = true;
    p.set = pick.set;
    p.frame = pick.frame;
    const leafy = season === "fall" || season === "summer";
    p.vy = windy ? between(10, 28) : leafy ? between(12, 22) : between(8, 15);
    p.drag = between(0.6, 1.25);
    p.phase = rand() * Math.PI * 2;
    p.swayA = windy ? between(8, 18) : between(6, 14);
    p.swayF = between(0.8, 2);
    p.spin = between(3, 7) * (leafy ? 1 : 0.7);
    p.spinT = rand() * 4;
    if (windy && rand() < 0.75) {
      p.x = g.w + between(4, 16);
      p.y = between(-10, g.h * 0.9);
    } else {
      p.x = between(-10, g.w + 20 + this.windPx * 3);
      p.y = between(-14, -6);
    }
  }

  private updateDebris(dt: number, season: Season, kind: WeatherKind): void {
    const g = this.g;
    const windy = kind === "windy";
    let target = 0;
    let rate = 0;
    if (windy) {
      target = this.maxDebrisWindy;
      rate = target / 2.5;
    } else if ((kind === "sunny" || kind === "cloudy" || kind === "fog") && (season === "spring" || season === "fall")) {
      target = this.ambientDebris;
      rate = 0.28;
    } else if (kind === "sunny" && season === "summer") {
      target = Math.max(1, Math.round(this.ambientDebris / 5));
      rate = 0.05;
    }
    let active = 0;
    const wpx = this.windPx;
    const windMag = Math.min(2, Math.abs(this.wind));
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const p = this.debris[i]!;
      if (!p.active) continue;
      active++;
      p.phase += dt * p.swayF;
      p.spinT += dt * p.spin * (0.6 + windMag * 0.8);
      p.x += (-wpx * p.drag + Math.cos(p.phase) * p.swayA) * dt;
      p.y += (p.vy + Math.sin(p.phase * 1.3) * p.swayA * 0.6) * dt;
      if (p.x < -14 || p.y > g.h + 12 || p.x > g.w + 60) p.active = false;
    }
    if (active >= target) {
      this.debrisAcc = 0;
      return;
    }
    this.debrisAcc += dt * rate;
    for (let i = 0; i < MAX_DEBRIS && this.debrisAcc >= 1 && active < target; i++) {
      const p = this.debris[i]!;
      if (p.active) continue;
      this.spawnDebris(p, season, windy);
      this.debrisAcc -= 1;
      if (p.active) active++;
    }
    if (this.debrisAcc > 3) this.debrisAcc = 3;
  }

  // --- fireflies: summer nights. They also cast tiny lights into the darkness.
  private updateFireflies(dt: number): void {
    const g = this.g;
    if (this.fireflyLevel < 0.01 && !this.anyFireflies) return;
    const target = Math.round(this.maxFireflies * this.fireflyLevel);
    const P = g.layout.pasture;
    const x0 = P.x - 10;
    const x1 = P.x + P.w + 10;
    const y0 = P.y - 16;
    const y1 = P.y + P.h;
    const cx = P.x + P.w / 2;
    const cy = P.y + P.h / 2;
    const t = this.t;
    let any = false;
    for (let i = 0; i < MAX_FIREFLIES; i++) {
      const f = this.fireflies[i]!;
      if (!f.active) {
        if (i >= target) continue;
        f.active = true;
        f.x = between(x0, x1);
        f.y = between(y0, y1);
        f.ang = rand() * Math.PI * 2;
        f.speed = between(4, 9);
        f.phase = rand() * Math.PI * 2;
        f.freq = between(0.8, 1.6);
        f.fade = 0;
      }
      any = true;
      if (i < target) f.fade = Math.min(1, f.fade + dt * 0.4);
      else {
        f.fade -= dt * 0.4;
        if (f.fade <= 0) {
          f.active = false;
          continue;
        }
      }
      f.ang += (Math.sin(t * 0.7 + f.phase * 3) * 1.4 + (rand() - 0.5) * 3) * dt;
      if (f.x < x0 || f.x > x1 || f.y < y0 || f.y > y1) {
        // Wander back toward the middle of the pasture.
        const want = Math.atan2(cy - f.y, cx - f.x);
        let diff = want - f.ang;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        f.ang += diff * Math.min(1, dt * 2);
      }
      f.x += Math.cos(f.ang) * f.speed * dt;
      f.y += Math.sin(f.ang) * f.speed * 0.7 * dt + Math.sin(t * 2.1 + f.phase) * 3 * dt;
      // Slow pulse with a dark pause, like real fireflies.
      const s = Math.sin(t * f.freq + f.phase);
      f.glow = s > 0 ? Math.pow(s, 1.6) * f.fade : 0;
      if (f.glow > 0.05) {
        f.light.x = f.x;
        f.light.y = f.y;
        f.light.radius = 6 + 7 * f.glow;
        g.addLight(f.light);
      }
    }
    this.anyFireflies = any;
  }
  private anyFireflies = false;

  // --- winter: sun glinting on frost.
  private updateSparkles(dt: number, season: Season, kind: WeatherKind, sd: number): void {
    const g = this.g;
    const on = season === "winter" && sd < 0.3 && (kind === "sunny" || kind === "cloudy" || kind === "windy");
    if (on) this.sparkleAcc += dt * this.sparkleRate * (kind === "sunny" ? 1 : 0.45);
    const P = g.layout.pasture;
    for (let i = 0; i < MAX_SPARKLES; i++) {
      const s = this.sparkles[i]!;
      if (s.active) {
        s.t += dt;
        if (s.t >= s.life) s.active = false;
      } else if (this.sparkleAcc >= 1) {
        this.sparkleAcc -= 1;
        s.active = true;
        s.t = 0;
        s.life = between(0.6, 1.0);
        s.x = P.x + rand() * P.w;
        s.y = P.y + rand() * P.h;
      }
    }
    if (this.sparkleAcc > 2) this.sparkleAcc = 2;
  }

  // --- cloud shadows drifting across the farm (textures are half-res, drawn at 2x).
  private placeCloud(c: Cloud, offscreen: boolean): void {
    const g = this.g;
    c.tex = Math.floor(rand() * this.art.clouds.length);
    const tex = this.art.clouds[c.tex]!;
    const w = tex.width * 2;
    const h = tex.height * 2;
    c.x = offscreen ? g.w + between(10, 160) : between(-w * 0.6, g.w);
    c.y = between(-h * 0.35, Math.max(0, g.h - h * 0.6));
    c.speed = between(0.75, 1.3);
  }

  private scatterClouds(): void {
    for (const c of this.clouds) this.placeCloud(c, false);
  }

  private updateClouds(dt: number, count: number): void {
    const k = this.started ? 1 - Math.exp(-dt * 0.15) : 1;
    const drift = 3.5 + this.windPx * 0.12;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i]!;
      c.vis += ((i < count ? 1 : 0) - c.vis) * k;
      c.x -= drift * c.speed * dt;
      if (c.x + this.art.clouds[c.tex]!.width * 2 < -4) this.placeCloud(c, true);
    }
  }

  // --- storms: rare lightning, then a soft far-off rumble.
  private updateLightning(dt: number): void {
    if (this.storm > 0.6) {
      this.boltIn -= dt;
      if (this.boltIn <= 0) {
        this.flashT = 0;
        this.thunderIn = between(0.5, 1.8);
        this.boltIn = between(14, 40);
      }
    }
    if (this.flashT >= 0) {
      this.flashT += dt;
      const t = this.flashT;
      let a: number;
      if (this.reduced) a = t < 0.5 ? 0.16 * Math.sin((t / 0.5) * Math.PI) : -1;
      else if (t < 0.06) a = 0.6;
      else if (t < 0.13) a = 0.08;
      else if (t < 0.2) a = 0.42;
      else a = 0.42 - (t - 0.2) * 1.3;
      if (a <= 0 && t > 0.2) {
        this.flashT = -1;
        a = 0;
      }
      this.light.flash = Math.max(0, a);
    } else {
      this.light.flash = 0;
    }
    if (this.thunderIn >= 0) {
      this.thunderIn -= dt;
      if (this.thunderIn < 0) {
        sfx("thud", { volume: 0.2, pitch: 0.45 });
        this.rumbleIn = 0.22;
      }
    }
    if (this.rumbleIn >= 0) {
      this.rumbleIn -= dt;
      if (this.rumbleIn < 0) sfx("thud", { volume: 0.12, pitch: 0.36 });
    }
  }

  // ---------------------------------------------------------------- drawing

  /** Order 40: soft cloud shadows over the ground and everything on it. */
  drawClouds(ctx: CanvasRenderingContext2D): void {
    const env = this.g.env;
    const day = 1 - sunDarkness(env.hour, env.season);
    const base = this.cloudAlpha * day * day;
    if (base < 0.004) return;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (const c of this.clouds) {
      const a = base * c.vis;
      if (a < 0.004) continue;
      const tex = this.art.clouds[c.tex]!;
      ctx.globalAlpha = a;
      ctx.drawImage(tex, Math.round(c.x), Math.round(c.y), tex.width * 2, tex.height * 2);
    }
    ctx.restore();
  }

  /** Order 60: fog banks drifting by, under the night overlay so they darken at night. */
  drawFog(ctx: CanvasRenderingContext2D): void {
    if (this.fog < 0.01) return;
    const g = this.g;
    const tex = this.art.fog;
    const t = this.t;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.22 * this.fog;
    ctx.fillStyle = "#e4e6f2";
    ctx.fillRect(0, 0, g.w, g.h);
    const slow = this.reduced ? 0.4 : 1;
    for (let b = 0; b < 4; b++) {
      const scale = 2 * (1 + b * 0.3);
      const bw = tex.width * scale;
      const bh = tex.height * scale;
      const y = Math.round(g.h * (0.06 + b * 0.28) + Math.sin(t * 0.05 + b * 1.7) * 6 - bh / 2);
      const speed = (3 + b * 2.2) * slow;
      const off = (t * speed + b * 97) % bw;
      ctx.globalAlpha = this.fog * (0.56 - b * 0.06);
      for (let x = -off; x < g.w; x += bw) ctx.drawImage(tex, Math.round(x), y, bw, bh);
    }
    ctx.restore();
  }

  /** Order 80: sparkles, petals/leaves, snow, rain — over the world, under the night. */
  drawParticles(ctx: CanvasRenderingContext2D): void {
    const art = this.art;

    // frost sparkles
    const sp = art.sparkle;
    for (const s of this.sparkles) {
      if (!s.active) continue;
      const idx = SPARKLE_SEQ[Math.min(SPARKLE_SEQ.length - 1, Math.floor((s.t / s.life) * SPARKLE_SEQ.length))]!;
      const img = sp.frames[idx]!;
      ctx.drawImage(img, Math.round(s.x) - sp.hw[idx]!, Math.round(s.y) - sp.hh[idx]!);
    }

    // petals & leaves
    for (const p of this.debris) {
      if (!p.active || !p.set) continue;
      const set = p.set;
      const n = set.frames.length;
      const idx = p.frame >= 0 ? Math.min(p.frame, n - 1) : Math.floor(p.spinT) % n;
      const img = set.frames[idx]!;
      ctx.drawImage(img, Math.round(p.x) - set.hw[idx]!, Math.round(p.y) - set.hh[idx]!);
    }

    // snow
    const fl = art.flakes;
    for (const f of this.flakes) {
      if (!f.active) continue;
      const img = fl.frames[f.kind]!;
      ctx.drawImage(img, Math.round(f.x) - fl.hw[f.kind]!, Math.round(f.y) - fl.hh[f.kind]!);
    }

    // rain
    if (this.anyDrops) {
      const splashDx = RAIN_TIP.x - SPLASH_CENTER.x;
      const splashDy = RAIN_TIP.y - SPLASH_CENTER.y;
      for (const d of this.drops) {
        if (!d.active) continue;
        const frames = d.green ? art.rainGreen : d.grey ? art.rainGrey : art.rain;
        if (d.fall > 0) {
          ctx.drawImage(frames[0]!, Math.round(d.x), Math.round(d.y));
        } else {
          const idx = 1 + Math.min(2, Math.floor(d.splash / SPLASH_FRAME));
          ctx.drawImage(frames[idx]!, Math.round(d.x + splashDx), Math.round(d.y + splashDy));
        }
      }
    }
  }

  /** Order 110: firefly glows (above the darkness). */
  drawGlow(ctx: CanvasRenderingContext2D): void {
    if (!this.anyFireflies) return;
    const tex = this.art.firefly;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    for (const f of this.fireflies) {
      if (!f.active || f.glow < 0.02) continue;
      ctx.globalAlpha = f.glow * 0.9;
      ctx.drawImage(tex, f.x - 8, f.y - 8, 16, 16);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fbffd2";
    for (const f of this.fireflies) {
      if (!f.active || f.glow < 0.02) continue;
      ctx.globalAlpha = Math.min(1, f.glow * 1.4);
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
    }
    ctx.restore();
  }
}
