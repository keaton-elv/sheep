// The real Stardew day/time box in the top-right: the date, the sun/moon dial and its hand, the
// weather + season icons, the time in 10-minute ticks, and the money box underneath repurposed as
// the WOOL counter (with Stardew's rolling digits).
// Tap the clock for the farm report (date, weather, a few numbers, one line from the TV); tap the
// wool for the chest. A little sound box hangs left of the wool (hud-sound.ts): the one sound
// switch, showing on, off, or waiting for a tap; holding it opens a sound check.
// Every couple of seconds the HUD also tells the audio what the farm sounds like: the ambience
// (night, rain, decorations) and which music fits (the season's, or the title theme while the
// password gate is up).
//
// The box is painted on a canvas at the farm's device-pixel scale, so the dial hand can rotate
// smoothly (like the game draws it at 4x) while everything else stays crisp pixel art.

import { setAmbience, setMusicContext } from "../audio";
import { capitalize, clockDateLabel, clockTimeLabel, dayKey, daysBetween, parseDayKey, stardewDate } from "../../shared/calendar";
import type { Season } from "../../shared/calendar";
import type { FarmState, WeatherKind } from "../../shared/types";
import type { Game } from "../engine/game";
import { draw as drawSprite, has, spriteCanvas } from "../engine/sprites";
import { store } from "../net";
import { festivalOn } from "./calendar-festivals";
import { el, openMenu, relativeDays, spriteIcon, uiRoot } from "./dom";
import { CLOCK, registerHudArt } from "./hud-art";
import { closePopover, togglePopover } from "./hud-popover";
import { mountSoundBox } from "./hud-sound";
import { iconKey } from "./toolbar-art";
import "./hud.css";

// Real Stardew wool & cloth icons (regions registered in toolbar-art.ts), hand-drawn otherwise.
const woolKey = () => iconKey("ui.hud.wool");
const clothKey = () => iconKey("ui.hud.cloth");

/** calc() for a length in game pixels, so DOM HUD pieces line up with the farm's pixels. */
const gp = (n: number) => `calc(var(--px) * ${n})`;

const WEATHER_NAMES: Record<WeatherKind, string> = {
  sunny: "Sunny",
  cloudy: "Cloudy",
  rain: "Rain",
  storm: "Thunderstorm",
  snow: "Snow",
  fog: "Fog",
  windy: "Windy",
};

// The TV's weather channel: one of these sometimes stands in for the trivia line.
const WEATHER_REPORT: Record<WeatherKind, string[]> = {
  sunny: ["Clear skies. Perfect sheep-napping weather...", "Sunny! Dolores Park is going to be packed."],
  cloudy: ["A bit cloudy. The sheep don't mind.", "Grey skies. Cozy-blanket weather..."],
  rain: ["Rain today! No need to water the crops.", "Rainy... the sheep smell like wet wool.", "Rain! Very Washington of it."],
  storm: ["Thunderstorms! Maybe put up a lightning rod.", "Stormy... the sheep are huddled up."],
  snow: ["Snow! Bundle up, farmers.", "Snowing... hot cocoa and trip-planning weather."],
  fog: ["Foggy out there. Spooky...", "Thick fog. Even the crows got lost."],
  windy: ["Windy! Leaves (and a bit of fluff) are flying.", "Breezy. Kite weather at Crissy Field!"],
};

/** "Livin' Off The Land" for sheep people: Stardew references and little jokes. */
const TRIVIA = [
  "Up past 2am? You'll pass out. Go to bed...",
  "The Traveling Cart visits on Fridays and Sundays.",
  "The Egg Festival is on Spring 13. Bring a basket.",
  "The Flower Dance is on Spring 24. Ask someone early!",
  "The Luau is on Summer 11. Don't put anything weird in the soup.",
  "The Moonlight Jellies arrive on Summer 28.",
  "The Fair is on Fall 16. Go for the star tokens!",
  "Spirit's Eve is on Fall 27. Bring a lantern. And garlic ice cream.",
  "The Feast of the Winter Star is on Winter 25.",
  "Every Stardrop raises your max energy.",
  "Ladybugs are lucky. A golden one is luckier...",
  "Legend says a tiny knight rides a bumblebee over the pasture...",
  // The local news.
  "In the news: Mayor Lurie has not visited the farm yet. The sheep remain hopeful.",
  "Muni update: the J is 10 minutes away. It has been 10 minutes away for 20 minutes.",
  "Wildlife report: the parrots of Telegraph Hill are loud today. As usual.",
  "Traffic: light on the Golden Gate. Heavy porpoise traffic under it.",
  "Sumner, WA: still the Rhubarb Pie Capital of the World.",
  "Bonney Lake forecast: drizzle, with a chance of drizzle.",
  "Baa...",
];

// In season, these join the pool.
const SEASON_NEWS: Partial<Record<Season, string[]>> = {
  fall: ["Leaf report: it's ginkgo season. The sheep are big fans."],
};

// Some days get their own news.
const WINE_WEDNESDAY = ["It's Wine Wednesday!"];
const THURSDAY = ["It's Thursday. No, wait: it's THURSDAY!!!!!", "Today's forecast: THURSDAY!!!!!"];

// ---------- date flair ----------
// Some Wednesdays the date box just says "Wine". Some Thursdays it's THURSDAY!!!!! (the window
// only fits "THU!!"). Decided once a day, about one day in three, and kept all day on this device.
const FLAIR_KEY = "farm.hud.flair";
const FLAIR_CHANCE = 1 / 3;
let flairMemo: { day: string; on: boolean } | null = null;

function flairDay(now: Date): boolean {
  const dow = now.getDay();
  if (dow !== 3 && dow !== 4) return false;
  const day = dayKey(now);
  if (flairMemo?.day === day) return flairMemo.on;
  let on: boolean | null = null;
  try {
    const raw = localStorage.getItem(FLAIR_KEY);
    const v = raw ? (JSON.parse(raw) as { day?: unknown; on?: unknown } | null) : null;
    if (v && v.day === day && typeof v.on === "boolean") on = v.on;
  } catch {
    /* no storage: decide once per visit instead */
  }
  if (on === null) {
    on = Math.random() < FLAIR_CHANCE;
    try {
      localStorage.setItem(FLAIR_KEY, JSON.stringify({ day, on }));
    } catch {
      /* fine: it just won't survive a reload */
    }
  }
  flairMemo = { day, on };
  return on;
}

/** What the date window shows: "Mon. 12", or now and then "Wine 15" / "THU!! 16". */
function dateBoxLabel(now: Date): string {
  if (!flairDay(now)) return clockDateLabel(now);
  return `${now.getDay() === 3 ? "Wine" : "THU!!"} ${now.getDate()}`;
}

const SEASON_NAMES: Record<Season, string> = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter" };

let lastTrivia = -1;

type Special = "festival" | "wedding" | null;

/** Festival days get Stardew's confetti icon; Valentine's Day and farm anniversaries get the heart. */
function specialDay(now: Date, s: FarmState | null): { kind: Special; name: string | null } {
  try {
    const f = festivalOn(now, s?.foundedAt);
    if (!f) return { kind: null, name: null };
    // Farm days (founding, anniversaries) and Valentine's Day get the heart; festivals the confetti.
    const heart = f.star === true || f.heart === true || /anniversary|founding/i.test(f.name);
    return { kind: heart ? "wedding" : "festival", name: f.name };
  } catch {
    return { kind: null, name: null };
  }
}

/** Which 12x8 icon goes in the weather hole. Real weather that matters (rain, storm, snow) wins. */
function weatherIconKey(kind: WeatherKind, season: Season, special: Special): string {
  let key: string;
  if (special && kind !== "rain" && kind !== "storm" && kind !== "snow") key = `ui.weather.${special}`;
  else if (kind === "windy") key = season === "fall" || season === "winter" ? "ui.weather.leaves" : "ui.weather.petals";
  else key = `ui.weather.${kind}`;
  return has(key) ? key : `ui.weather.${kind}`;
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

export function initHud(g: Game): void {
  registerHudArt();
  if (document.querySelector(".hud-clock")) return; // already mounted (re-login)

  // ---------- DOM ----------

  const canvas = document.createElement("canvas");
  canvas.className = "hud-clock__bg";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d")!;

  const { face: F } = CLOCK;
  const dateEl = el("span", { class: "hud-clock__date" });
  const timeEl = el("span", { class: "hud-clock__time" });
  place(dateEl, CLOCK.date, F);
  place(timeEl, CLOCK.time, F);

  const face = el(
    "button",
    {
      class: "hud-clock__face",
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      style: `left:${gp(F.x)};top:${gp(F.y)};width:${gp(F.w)};height:${gp(F.h)}`,
    },
    dateEl,
    timeEl,
  );

  const { money, wool: W } = CLOCK;
  const woolIcon = spriteIcon(woolKey(), { class: "hud-wool__icon" });
  const woolFloat = el("span", { class: "hud-wool__float", "aria-hidden": "true" });
  const woolLeft = W.x;
  const woolRight = money.x + money.w;
  woolIcon.style.left = "0";
  woolIcon.style.top = gp(W.y - money.y + 0);
  const wool = el(
    "button",
    {
      class: "hud-wool",
      type: "button",
      style: `left:${gp(woolLeft)};top:${gp(money.y)};width:${gp(woolRight - woolLeft)};height:${gp(money.h)}`,
      "aria-label": "Wool in the chest",
    },
    woolIcon,
    woolFloat,
  );

  const root = el("div", { class: "hud-clock" }, canvas, face, wool);
  uiRoot.appendChild(root);
  try {
    mountSoundBox(root);
  } catch (err) {
    console.warn("[hud] sound box", err);
  }

  face.addEventListener("click", () => {
    // Anchor to the whole widget so the card opens below the wool box, not on top of it.
    togglePopover({ anchor: root, expander: face, placement: "below-end", label: "Farm report", className: "hud-report", content: buildReport(g) });
  });
  wool.addEventListener("click", () => {
    closePopover(true);
    openMenu("chest");
  });

  // ---------- painting ----------

  // Pieces drawn with sub-pixel motion (the hand, rolling digits) are cached as plain canvases.
  const hand = spriteCanvas("ui.hud.hand");
  const digits = new Map<string, HTMLCanvasElement>();
  for (let d = 0; d <= 9; d++) digits.set(String(d), spriteCanvas(`ui.hud.digit.${d}`));

  let k = 1; // device pixels per game pixel
  let weatherKey = "ui.weather.sunny";
  let seasonKey = "ui.season.spring";

  // The hand: shown position and where it's heading (0 = 6am, pointing down; 1 = 2am, up).
  let handT = 0;
  let handFrom = 0;
  let handTo = 0;
  let handStart = -1;
  let handMs = 0;

  // The wool counter: right-aligned in 8 slots; changed digits roll like Stardew's money dial.
  const blank = " ".repeat(CLOCK.digits.count);
  let woolFrom = blank;
  let woolTo = blank;
  let woolUp = true;
  let rollStart = -1;
  const ROLL_MS = 380;

  const animating = () => handStart >= 0 || rollStart >= 0;

  const snap = (v: number) => Math.round(v * k) / k;

  const paintDigits = (now: number) => {
    const { x: x0, y: y0, w, h, step } = CLOCK.digits;
    let p = 1;
    if (rollStart >= 0) {
      p = Math.min(1, (now - rollStart) / ROLL_MS);
      if (reducedMotion()) p = 1;
      if (p >= 1) rollStart = -1;
    }
    const e = easeOut(p);
    const glyph = (ch: string, x: number, y: number) => {
      const c = digits.get(ch);
      if (c) ctx.drawImage(c, x, snap(y));
    };
    for (let i = 0; i < CLOCK.digits.count; i++) {
      const a = woolFrom[i] ?? " ";
      const b = woolTo[i] ?? " ";
      const x = x0 + i * step;
      if (a === b || e >= 1) {
        glyph(b, x + 1, y0 + 1);
        continue;
      }
      // Counting up: the old digit rolls up and out, the new one rolls in from below.
      const dir = woolUp ? -1 : 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y0, w, h);
      ctx.clip();
      glyph(a, x + 1, y0 + 1 + dir * e * h);
      glyph(b, x + 1, y0 + 1 - dir * (1 - e) * h);
      ctx.restore();
    }
  };

  const paintHand = (now: number) => {
    if (handStart >= 0) {
      const p = handMs > 0 ? Math.max(0, Math.min(1, (now - handStart) / handMs)) : 1;
      handT = handFrom + (handTo - handFrom) * easeOut(p);
      if (p >= 1) {
        handT = handTo;
        handStart = -1;
      }
    }
    // Stardew: rotation = PI + PI * (how far through the 6am..2am day), clockwise.
    const { pivot, handOrigin } = CLOCK;
    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(Math.PI + Math.PI * handT);
    ctx.drawImage(hand, -handOrigin.x, -handOrigin.y);
    ctx.restore();
  };

  const paint = () => {
    try {
      const now = performance.now();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = false;
      drawSprite(ctx, "ui.hud.clockbox", CLOCK.box.x, CLOCK.box.y);
      drawSprite(ctx, weatherKey, CLOCK.weather.x, CLOCK.weather.y);
      drawSprite(ctx, seasonKey, CLOCK.season.x, CLOCK.season.y);
      paintDigits(now);
      paintHand(now);
    } catch (err) {
      console.warn("[hud] paint", err);
    }
  };

  const resize = () => {
    k = Math.max(1, Math.round(g.scale));
    if (canvas.width !== CLOCK.w * k) {
      canvas.width = CLOCK.w * k;
      canvas.height = CLOCK.h * k;
    }
    // Sit exactly where the farm's layout reserved room for the clock (it already includes the
    // notch / status-bar inset), on the farm's pixel grid.
    root.style.top = `${g.layout.hudClock.y * g.cssScale}px`;
    fitText(dateEl);
    fitText(timeEl);
    paint();
  };

  // ---------- clock ----------

  let lastMinuteKey = -1;
  let lastDay = -1;
  let lastWeather = "";
  let special: { kind: Special; name: string | null } = { kind: null, name: null };
  let acc = 1; // run immediately
  let ambAcc = 2;
  let firstHand = true;
  let handDue = false;

  const handTarget = (now: Date) => {
    const hour = now.getHours() + Math.floor(now.getMinutes() / 10) / 6;
    const h = hour < 6 ? hour + 24 : hour;
    return Math.max(0, Math.min(1, (h - 6) / 20));
  };

  const update = () => {
    const env = g.env;
    const now = env.now;
    let dirty = false;
    const minuteKey = now.getHours() * 6 + Math.floor(now.getMinutes() / 10);
    if (minuteKey !== lastMinuteKey) {
      lastMinuteKey = minuteKey;
      const time = clockTimeLabel(now);
      timeEl.textContent = time;
      // Past midnight the time goes red: go to bed, farmers!
      timeEl.classList.toggle("is-late", now.getHours() < 6);
      fitText(timeEl);
      const day = now.getDate();
      if (day !== lastDay) {
        lastDay = day;
        dateEl.textContent = dateBoxLabel(now);
        fitText(dateEl);
        special = specialDay(now, store.state);
        lastWeather = ""; // re-pick the icon (festival days)
      }
      handDue = true;
      dirty = true;
    }
    // On arrival the hand sweeps round from 6am to now, once the farm is on screen (the HUD goes up
    // under the loading screen, and the title screen when logged out); after that it ticks along.
    if (handDue && g.shown) {
      handDue = false;
      const target = handTarget(now);
      if (Math.abs(target - handTo) > 1e-4 || firstHand) {
        handFrom = handT;
        handTo = target;
        handMs = reducedMotion() ? 0 : firstHand ? 1300 : 500;
        handStart = performance.now() + (firstHand ? 350 : 0);
        firstHand = false;
        dirty = true;
      }
    }
    const wKey = `${env.weather}|${env.season}|${special.kind}`;
    if (wKey !== lastWeather) {
      lastWeather = wKey;
      weatherKey = weatherIconKey(env.weather, env.season, special.kind);
      seasonKey = `ui.season.${env.season}`;
      dirty = true;
    }
    if (dirty) {
      const weather = WEATHER_NAMES[env.weather] ?? capitalize(env.weather);
      const festival = special.name ? ` ${special.name} today!` : "";
      face.setAttribute("aria-label", `${clockDateLabel(now)}, ${timeEl.textContent}. ${weather}, ${SEASON_NAMES[env.season]}.${festival} Farm report`);
      if (!animating()) paint();
    }
  };

  const ambience = () => {
    const env = g.env;
    const decor = store.state?.decorations ?? [];
    setAmbience({
      night: env.isNight,
      rain: env.weather === "rain" || env.weather === "storm",
      storm: env.weather === "storm",
      morning: !env.isNight && env.hour >= 5.5 && env.hour < 10.5,
      winter: env.season === "winter" || env.weather === "snow",
      season: env.season,
      windy: env.weather === "windy",
      campfire: decor.some((d) => d.kind === "campfire"),
      pond: env.season !== "winter" && decor.some((d) => d.kind === "pond"),
      darkness: env.darkness,
    });
    // The title theme while the password gate is up (logged out mid-visit), the season's after.
    setMusicContext(document.querySelector(".farm-gate") ? "title" : env.season);
  };

  // This runs inside the game loop: a throw here would stop the whole farm, so never let one out.
  g.on("tick", (dt: number) => {
    try {
      acc += dt;
      if (acc >= 0.25) {
        acc = 0;
        update();
      }
      if (animating()) paint();
      ambAcc += dt;
      if (ambAcc >= 2) {
        ambAcc = 0;
        ambience();
      }
    } catch (err) {
      console.warn("[hud]", err);
    }
  });
  g.on("resize", () => {
    try {
      resize();
    } catch (err) {
      console.warn("[hud] resize", err);
    }
  });
  // Start the arrival sweep right as the farm shows, not at the next quarter-second check.
  g.on("shown", () => {
    try {
      update();
    } catch (err) {
      console.warn("[hud] shown", err);
    }
  });
  update();
  resize();
  // The pixel font may arrive after the first layout: re-check the text fits once it has.
  void document.fonts?.ready.then(() => {
    fitText(dateEl);
    fitText(timeEl);
  });

  // ---------- wool counter ----------

  let lastWool: number | null = null;
  let floatTimer = 0;
  const showWool = (s: FarmState | null) => {
    if (!s) return;
    const n = Math.max(0, s.wool);
    if (n === lastWool) return;
    const prev = lastWool;
    lastWool = n;
    const text = String(Math.min(n, 99_999_999)).padStart(CLOCK.digits.count, " ");
    wool.setAttribute("aria-label", `Wool in the chest: ${n}. Open the chest.`);
    if (prev === null) {
      woolFrom = woolTo = text;
      paint();
      return;
    }
    woolFrom = woolTo;
    woolTo = text;
    woolUp = n > prev;
    rollStart = performance.now();
    const diff = n - prev;
    woolFloat.textContent = diff > 0 ? `+${diff}` : `${diff}`;
    woolFloat.classList.toggle("is-minus", diff < 0);
    wool.classList.remove("is-bump");
    woolFloat.classList.remove("is-on");
    void wool.offsetWidth; // restart the CSS animations
    if (diff > 0) wool.classList.add("is-bump");
    woolFloat.classList.add("is-on");
    clearTimeout(floatTimer);
    floatTimer = window.setTimeout(() => woolFloat.classList.remove("is-on"), 1200);
  };
  showWool(store.state);
  store.changed.on((s) => {
    try {
      showWool(s);
      // The farm's founding day can change what today's icon is (anniversaries).
      if (s && lastDay !== -1 && special.kind === null) {
        const sp = specialDay(g.env.now, s);
        if (sp.kind) {
          special = sp;
          lastWeather = "";
        }
      }
    } catch (err) {
      console.warn("[hud] wool", err);
    }
  });
}

/** Position a text window relative to the face button (both in game pixels). */
function place(node: HTMLElement, r: { x: number; y: number; w: number; h: number }, origin: { x: number; y: number }): void {
  node.style.left = gp(r.x - origin.x);
  node.style.top = gp(r.y - origin.y);
  node.style.width = gp(r.w);
  node.style.height = gp(r.h);
}

/** Step the font down a notch if a long label ("10:50 pm", "Wed. 30") would spill out of its window. */
function fitText(node: HTMLElement): void {
  node.classList.remove("is-tight", "is-tighter");
  if (!node.isConnected || node.clientWidth === 0) return;
  if (node.scrollWidth <= node.clientWidth + 0.5) return;
  node.classList.add("is-tight");
  if (node.scrollWidth <= node.clientWidth + 0.5) return;
  node.classList.add("is-tighter");
}

// ---------- the farm report (clock popover) ----------

function fmtHearts(halves: number): string {
  const whole = Math.floor(halves / 2);
  return halves % 2 ? `${whole}½` : String(whole);
}

function useFahrenheit(): boolean {
  const lang = navigator.language || "";
  return /^en-(US|LR|MM)$/i.test(lang) || lang.toLowerCase() === "en";
}

function temperature(c: number): string {
  return useFahrenheit() ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`;
}

function stat(icon: string, label: string, value: string | number): HTMLElement {
  return el(
    "li",
    { class: "hud-report__stat" },
    el("span", { class: "hud-report__staticon" }, spriteIcon(icon)),
    el("span", { class: "hud-report__label" }, label),
    el("span", { class: "hud-report__dots", "aria-hidden": "true" }),
    el("b", { class: "hud-report__value" }, String(value)),
  );
}

/** One line from the TV: usually a tip or a joke, sometimes today's weather channel. */
function tvLine(kind: WeatherKind, season: Season, now: Date): string {
  const dow = now.getDay();
  if (dow === 3 || dow === 4) {
    // When the clock's already saying "Wine" / "THU!!", the TV is in on it too.
    if (Math.random() < (flairDay(now) ? 0.5 : 0.2)) return pick(dow === 3 ? WINE_WEDNESDAY : THURSDAY);
  }
  if (Math.random() < 0.3) return weatherLine(kind);
  const extra = SEASON_NEWS[season];
  const pool = extra ? [...TRIVIA, ...extra] : TRIVIA;
  let i = Math.floor(Math.random() * pool.length);
  if (i === lastTrivia) i = (i + 1) % pool.length;
  lastTrivia = i;
  return pool[i]!;
}

function buildReport(g: Game): HTMLElement {
  const s = store.state;
  const env = g.env;
  const now = env.now;
  const kind = env.weather;
  const w = store.weather;
  const sp = specialDay(now, s);

  const today = el(
    "div",
    { class: "hud-report__date" },
    spriteIcon(`ui.season.${env.season}`),
    ` ${s ? stardewDate(now, s.foundedAt) : `${capitalize(env.season)} ${now.getDate()}`}`,
  );
  const festival = sp.name && sp.kind ? el("div", { class: "hud-report__festival" }, spriteIcon(`ui.weather.${sp.kind}`), ` ${sp.name}!`) : null;
  const temp = w?.tempC != null ? `, ${temperature(w.tempC)}` : "";
  const weather = el(
    "div",
    { class: "hud-report__weather" },
    spriteIcon(weatherIconKey(kind, env.season, null)),
    ` ${WEATHER_NAMES[kind] ?? capitalize(kind)}${temp}`,
    w?.city ? el("span", { class: "hud-report__city" }, ` · ${w.city}`) : null,
  );

  let stats: HTMLElement;
  let next: HTMLElement | null = null;
  if (s) {
    const waiting = s.sheep.filter((x) => x.shearedAt === null).length;
    const halves = s.sheep.reduce((sum, x) => sum + x.pets, 0);
    const golden = s.sheep.filter((x) => x.golden).length;
    stats = el(
      "ul",
      { class: "hud-report__stats" },
      // (Wool isn't here: the counter right under the clock already shows it.)
      stat("ui.tool.plus-sheep", "Plans", waiting),
      stat(iconKey("ui.tb.shears"), "Done", s.sheep.length - waiting),
      stat(clothKey(), "Cloth", s.cloth),
      stat("ui.heart.full", "Hearts", fmtHearts(halves)),
      golden ? stat("ui.star", "Golden", golden) : null,
    );
    const np = nextPlan(s, now);
    if (np) next = el("p", { class: "hud-report__next" }, "Next: ", el("b", null, np.name), ` (${np.when})`);
  } else {
    stats = el("p", { class: "hud-report__say" }, "Counting sheep...");
  }

  const tv = el("p", { class: "hud-report__tv" }, spriteIcon("ui.icon.tv", { class: "hud-report__tvicon" }), el("span", null, tvLine(kind, env.season, now)));

  const live = el(
    "p",
    { class: `hud-report__live ${store.connected ? "is-live" : ""}` },
    el("span", { class: "hud-report__dot", "aria-hidden": "true" }),
    store.connected ? "Live" : "Offline...",
  );

  return el("div", { class: "hud-report__body" }, today, festival, weather, stats, next, tv, live);
}

function nextPlan(s: FarmState, now: Date): { name: string; when: string } | null {
  let best: { name: string; days: number } | null = null;
  for (const sh of s.sheep) {
    if (sh.shearedAt !== null || !sh.date) continue;
    const d = parseDayKey(sh.date);
    if (!d) continue;
    const days = daysBetween(now, d);
    if (days < 0) continue;
    if (!best || days < best.days) best = { name: sh.name, days };
  }
  if (!best) return null;
  return { name: best.name, when: relativeDays(best.days) };
}

// Exported for other modules that want the same wording (e.g. a TV easter egg).
export function weatherLine(kind: WeatherKind): string {
  return pick(WEATHER_REPORT[kind] ?? WEATHER_REPORT.sunny);
}

function pick(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]!;
}
