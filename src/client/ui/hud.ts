// The Stardew clock box in the top-right: date, a day/night dial, weather + season icons, the
// time in 10-minute ticks, and the gold box underneath repurposed as the WOOL counter.
// Tap the clock for a little stats card + TV weather report; tap the wool for the chest.

import { setAmbience } from "../audio";
import { capitalize, clockDateLabel, clockTimeLabel, daysBetween, parseDayKey, stardewDate } from "../../shared/calendar";
import type { Season } from "../../shared/calendar";
import type { FarmState, WeatherKind } from "../../shared/types";
import type { Game } from "../engine/game";
import { draw as drawSprite } from "../engine/sprites";
import { barnSheep, store } from "../net";
import { el, openMenu, relativeDays, spriteIcon, uiRoot } from "./dom";
import { CLOCK, registerHudArt } from "./hud-art";
import { closePopover, togglePopover } from "./hud-popover";
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

const WEATHER_REPORT: Record<WeatherKind, string[]> = {
  sunny: ["Clear skies and sunshine. Perfect sheep-napping weather.", "Sunny all day! Great weather for an adventure."],
  cloudy: ["A bit cloudy, but the sheep don't mind one bit.", "Grey skies. Cozy-blanket weather."],
  rain: ["Rain today! No need to water the crops.", "Rainy... the sheep are huddled up and smell like wet wool."],
  storm: ["Thunderstorms! Stay cozy, and maybe put up a lightning rod.", "Stormy! The sheep are hiding in the barn."],
  snow: ["Snow! Bundle up, farmers.", "It's snowing! Perfect for hot cocoa and planning a trip."],
  fog: ["Foggy out there. Spooky! Keep a lantern handy.", "Thick fog. Even the crows got lost."],
  windy: ["Windy! Leaves (and a bit of fluff) are flying.", "Breezy today. Hold onto your hat!"],
};

const TRIVIA = [
  "Pierre's is closed on Wednesdays.",
  "The Stardrop Saloon opens at noon.",
  "The Traveling Cart visits on Fridays and Sundays.",
  "Marnie's ranch is closed on Mondays and Tuesdays.",
  "Sheep in the valley cost 8,000g. These ones only cost a good idea.",
  "A real loom turns 1 wool into cloth. Robin says ours are fancier.",
  "Pet your animals every day. They notice!",
  "Folks get grumpy if they catch you digging through trash cans. Except Linus. Linus gets it.",
  "Krobus says hello from the sewers.",
  "Shane loves pepper poppers. Shh, don't tell him you know.",
  "Abigail has been known to eat amethysts. Please don't.",
  "Every Stardrop you find raises your max energy.",
  "The Feast of the Winter Star is on Winter 25.",
  "Spirit's Eve is on Fall 27. Bring a lantern!",
  "The Egg Festival is on Spring 13. Pierre always wins. Always.",
  "The Flower Dance is on Spring 24. Ask someone early!",
  "The Luau is on Summer 11. Don't put anything weird in the soup.",
  "The Moonlight Jellies arrive on Summer 28.",
  "The Stardew Valley Fair is on Fall 16. Go for the star tokens!",
  "Mayor Lewis has misplaced his lucky purple shorts. Again.",
  "Rainy days are free watering days.",
  "If you're up past 2am, you'll pass out. Go to bed!",
  "Junimos love it when you finish bundles. And plans!",
  "Mr. Qi is watching. Mr. Qi is always watching.",
  "The Wizard's tower is in Cindersap Forest. He knows things.",
  "The Stardrop Saloon is the place to be on a Friday night.",
  "Shears cost 1,000g at Marnie's. These ones were free!",
  "The Old Mariner only shows up on the beach when it rains. He sells a certain pendant...",
  "Clint is too shy to talk to Emily. Don't be like Clint.",
  "A sheep's wool grows back every few days. So do good ideas.",
];

const SEASON_NAMES: Record<Season, string> = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter" };

let lastTrivia = -1;

export function initHud(g: Game): void {
  registerHudArt();
  if (document.querySelector(".hud-clock")) return; // already mounted (re-login)

  // ---------- DOM ----------

  const bg = document.createElement("canvas");
  bg.width = CLOCK.w;
  bg.height = CLOCK.h;
  bg.className = "hud-clock__bg";
  bg.setAttribute("aria-hidden", "true");
  const bgCtx = bg.getContext("2d")!;

  const dateEl = el("span", { class: "hud-clock__date" });
  const timeEl = el("span", { class: "hud-clock__time" });
  const weatherSlot = el("span", { class: "hud-clock__icon", style: `left:${gp(CLOCK.icons.weatherX)};top:${gp(CLOCK.icons.y)}` });
  const seasonSlot = el("span", { class: "hud-clock__icon", style: `left:${gp(CLOCK.icons.seasonX)};top:${gp(CLOCK.icons.y)}` });
  place(dateEl, CLOCK.date);
  place(timeEl, CLOCK.time);

  const face = el(
    "button",
    {
      class: "hud-clock__face",
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      style: `width:${gp(CLOCK.w)};height:${gp(CLOCK.wool.box.y)}`,
    },
    dateEl,
    weatherSlot,
    seasonSlot,
    timeEl,
  );

  const woolNum = el("span", { class: "hud-wool__n" }, "·");
  const woolIcon = spriteIcon(woolKey(), { class: "hud-wool__icon" });
  const woolFloat = el("span", { class: "hud-wool__float", "aria-hidden": "true" });
  const { box, icon, digits } = CLOCK.wool;
  woolIcon.style.left = gp(icon.x - box.x);
  woolIcon.style.top = gp(icon.y - box.y);
  woolNum.style.cssText = `left:${gp(digits.x - box.x)};top:${gp(digits.y - box.y)};width:${gp(digits.w)};height:${gp(digits.h)}`;
  const wool = el(
    "button",
    {
      class: "hud-wool",
      type: "button",
      style: `left:${gp(box.x)};top:${gp(box.y)};width:${gp(box.w)};height:${gp(box.h)}`,
      "aria-label": "Wool in the chest",
    },
    woolIcon,
    woolNum,
    woolFloat,
  );

  const root = el("div", { class: "hud-clock" }, bg, face, wool);
  uiRoot.appendChild(root);

  face.addEventListener("click", () => {
    // Anchor to the whole widget so the card opens below the wool box, not on top of it.
    togglePopover({ anchor: root, expander: face, placement: "below-end", label: "Farm report", className: "hud-report", content: buildReport(g) });
  });
  wool.addEventListener("click", () => {
    closePopover(true);
    openMenu("chest");
  });

  // ---------- clock ----------

  let lastMinuteKey = -1;
  let lastDay = -1;
  let lastWeather: WeatherKind | null = null;
  let lastSeason: Season | null = null;
  let acc = 1; // run immediately
  let ambAcc = 2;

  const paintClock = (hour: number) => {
    bgCtx.clearRect(0, 0, CLOCK.w, CLOCK.h);
    drawSprite(bgCtx, "ui.hud.clock", 0, 0);
    paintHand(bgCtx, hour);
  };

  const update = () => {
    const env = g.env;
    const now = env.now;
    const minuteKey = now.getHours() * 6 + Math.floor(now.getMinutes() / 10);
    if (minuteKey !== lastMinuteKey) {
      lastMinuteKey = minuteKey;
      const time = clockTimeLabel(now);
      timeEl.textContent = time;
      // Past midnight the time goes red: go to bed, farmers!
      timeEl.classList.toggle("is-late", now.getHours() < 6);
      paintClock(now.getHours() + Math.floor(now.getMinutes() / 10) / 6);
      const day = now.getDate();
      if (day !== lastDay) {
        lastDay = day;
        dateEl.textContent = clockDateLabel(now);
      }
      face.setAttribute("aria-label", `${clockDateLabel(now)}, ${time}. Tap for the farm report.`);
    }
    if (env.weather !== lastWeather) {
      lastWeather = env.weather;
      weatherSlot.replaceChildren(spriteIcon(`ui.weather.${env.weather}`, { title: WEATHER_NAMES[env.weather] ?? env.weather }));
    }
    if (env.season !== lastSeason) {
      lastSeason = env.season;
      seasonSlot.replaceChildren(spriteIcon(`ui.season.${env.season}`, { title: SEASON_NAMES[env.season] ?? env.season }));
    }
  };

  const ambience = () => {
    const env = g.env;
    setAmbience({
      night: env.isNight,
      rain: env.weather === "rain" || env.weather === "storm",
      storm: env.weather === "storm",
      morning: !env.isNight && env.hour >= 5.5 && env.hour < 10.5,
      winter: env.season === "winter" || env.weather === "snow",
      season: env.season,
      windy: env.weather === "windy",
    });
  };

  // This runs inside the game loop: a throw here would stop the whole farm, so never let one out.
  g.on("tick", (dt: number) => {
    try {
      acc += dt;
      if (acc >= 0.25) {
        acc = 0;
        update();
      }
      ambAcc += dt;
      if (ambAcc >= 2) {
        ambAcc = 0;
        ambience();
      }
    } catch (err) {
      console.warn("[hud]", err);
    }
  });
  update();

  // ---------- wool counter ----------

  let lastWool: number | null = null;
  let floatTimer = 0;
  const showWool = (s: FarmState | null) => {
    if (!s) return;
    const n = s.wool;
    if (n === lastWool) return;
    const prev = lastWool;
    lastWool = n;
    woolNum.textContent = String(n);
    wool.setAttribute("aria-label", `Wool in the chest: ${n}. Open the chest.`);
    if (prev === null) return;
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
  store.changed.on(showWool);
}

function place(node: HTMLElement, r: { x: number; y: number; w: number; h: number }): void {
  node.style.left = gp(r.x);
  node.style.top = gp(r.y);
  node.style.width = gp(r.w);
  node.style.height = gp(r.h);
}

// ---------- the dial's hand ----------

const HAND = "#d8342a";
const HAND_EDGE = "#7a1010";
const PIVOT = "#ffd23f";

/** Stardew's dial: the hand points up at 6am, sweeps left through the afternoon, down at 2am. */
function paintHand(ctx: CanvasRenderingContext2D, hour: number): void {
  const h = hour < 6 ? hour + 24 : hour;
  const t = Math.max(0, Math.min(1, (h - 6) / 20));
  const phi = Math.PI * t;
  const { x: px, y: py } = CLOCK.pivot;
  const tx = Math.round(px - Math.sin(phi) * CLOCK.handLength);
  const ty = Math.round(py - Math.cos(phi) * CLOCK.handLength);
  const pts = linePoints(px, py, tx, ty);
  ctx.fillStyle = HAND_EDGE;
  for (const [x, y] of pts) {
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }
  ctx.fillStyle = HAND;
  for (const [x, y] of pts) ctx.fillRect(x, y, 1, 1);
  // Brass pivot cap.
  ctx.fillStyle = HAND_EDGE;
  ctx.fillRect(px - 1, py - 1, 3, 3);
  ctx.fillStyle = PIVOT;
  ctx.fillRect(px - 1, py, 3, 1);
  ctx.fillRect(px, py - 1, 1, 3);
}

function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let i = 0; i < 64; i++) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
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

function statRow(label: string, value: string | number, icon?: string): HTMLElement {
  return el(
    "li",
    { class: "hud-report__stat" },
    el("span", { class: "hud-report__staticon" }, icon ? spriteIcon(icon) : null),
    el("span", { class: "hud-report__label" }, label),
    el("span", { class: "hud-report__dots", "aria-hidden": "true" }),
    el("b", { class: "hud-report__value" }, String(value)),
  );
}

function buildReport(g: Game): HTMLElement {
  const s = store.state;
  const env = g.env;
  const now = env.now;
  const kind = env.weather;
  const w = store.weather;

  // TV weather report
  const where = w?.city ? `in ${w.city}` : "on the farm";
  const temp = w?.tempC != null ? `, ${temperature(w.tempC)}` : "";
  const lines = WEATHER_REPORT[kind] ?? WEATHER_REPORT.sunny;
  const name = WEATHER_NAMES[kind] ?? capitalize(kind);
  const report = el(
    "section",
    { class: "hud-report__tv" },
    spriteIcon("ui.icon.tv", { scale: 2, class: "hud-report__tvicon" }),
    el(
      "div",
      null,
      el("div", { class: "hud-report__kicker" }, "Weather Report"),
      el("div", { class: "hud-report__weather" }, spriteIcon(`ui.weather.${kind}`), ` ${name} ${where}${temp}`),
      el("p", { class: "hud-report__say" }, lines[Math.floor(Math.random() * lines.length)]!),
    ),
  );

  const today = el("div", { class: "hud-report__date" }, spriteIcon(`ui.season.${env.season}`), ` ${s ? stardewDate(now, s.foundedAt) : `${capitalize(env.season)} ${now.getDate()}`}`);

  let stats: HTMLElement;
  if (s) {
    const waiting = s.sheep.filter((x) => x.shearedAt === null);
    const done = s.sheep.length - waiting.length;
    const halves = s.sheep.reduce((sum, x) => sum + x.pets, 0);
    stats = el(
      "ul",
      { class: "hud-report__stats" },
      statRow("Plans waiting", waiting.length, "ui.tool.plus-sheep"),
      statRow("Adventures done", done, iconKey("ui.tb.shears")),
      statRow("Memories in the barn", barnSheep(s).length, "ui.icon.barn"),
      statRow("Wool in the chest", s.wool, woolKey()),
      statRow("Cloth", s.cloth, clothKey()),
      statRow("Hearts given", fmtHearts(halves), "ui.heart.full"),
    );
    const golden = s.sheep.filter((x) => x.golden).length;
    if (golden) stats.appendChild(statRow(golden === 1 ? "Golden sheep (lucky!)" : "Golden sheep (so lucky!)", golden, "ui.star"));
    const next = nextPlan(s, now);
    if (next) stats.appendChild(el("li", { class: "hud-report__next" }, "Next up: ", el("b", null, next.name), ` (${next.when})`));
  } else {
    stats = el("p", { class: "hud-report__say" }, "The farm ledger is still loading...");
  }

  let i = Math.floor(Math.random() * TRIVIA.length);
  if (i === lastTrivia) i = (i + 1) % TRIVIA.length;
  lastTrivia = i;
  const trivia = el("p", { class: "hud-report__trivia" }, spriteIcon("ui.star"), " ", TRIVIA[i]!);

  const live = el(
    "p",
    { class: `hud-report__live ${store.connected ? "is-live" : ""}` },
    el("span", { class: "hud-report__dot", "aria-hidden": "true" }),
    store.connected ? "Live: you'll see each other's changes" : "Offline for a sec. We'll catch up!",
  );

  return el("div", { class: "hud-report__body" }, report, today, stats, trivia, live);
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
  const lines = WEATHER_REPORT[kind] ?? WEATHER_REPORT.sunny;
  return lines[Math.floor(Math.random() * lines.length)]!;
}
