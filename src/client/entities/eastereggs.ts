// Secrets! Junimos, the witch, typing "baaaaah", the Konami code, a lucky clover, the 2 AM
// pass-out, Stardrops for every 10 wool, holiday surprises, and a soft "new day" banner.
//
// Debug: ?junimo=1 ?witch=1 ?stardrop=1 ?raccoon=1 ?crow=1 ?bunny=1 (plus the engine's ?date= ?time=).

import { sfx } from "../audio";
import type { Entity, Game } from "../engine/game";
import { draw } from "../engine/sprites";
import { store } from "../net";
import { clockDateLabel, dayKey, farmYear, seasonOf, capitalize } from "../../shared/calendar";
import type { FarmState } from "../../shared/types";
import { el, isDialogOpen, say, spriteIcon, toast, uiRoot } from "../ui/dom";
import { FENCE_HIDE } from "./critter-ambient";
import { critterParty } from "./critter-fox";
import { initJunimos, summonJunimos } from "./critter-junimo";
import { addSafe, chance, drawShadow, heartFloat, inBox, lsGet, lsSet, onTick, params, rand, reducedMotion, report, sparkleBurst } from "./critter-util";
import { initWitch } from "./critter-witch";
import { sheepParty } from "./sheep";
import "./critter-eggs.css";

// ---------- a queue so dialog-y moments never stack on top of each other ----------

let chain: Promise<void> = Promise.resolve();
function queue(fn: () => Promise<void> | void, delayMs = 0): void {
  chain = chain
    .then(() => new Promise<void>((r) => setTimeout(r, delayMs)))
    .then(fn)
    .catch((e) => console.warn("[eastereggs]", e));
}

/** Resolve once no menu/dialog is open (so a surprise never lands on top of a form). */
function whenNoDialog(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => (isDialogOpen() ? setTimeout(check, 600) : resolve());
    check();
  });
}

/** Resolve once the farm state has loaded (after the password gate). */
function whenState(): Promise<FarmState> {
  if (store.state) return Promise.resolve(store.state);
  return new Promise((resolve) => {
    const off = store.changed.on((s) => {
      off();
      resolve(s);
    });
  });
}

// ---------- typing secrets ----------

const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function party(g: Game, message: string, junimos = false): void {
  sheepParty();
  critterParty();
  sfx("secret");
  const l = g.layout;
  sparkleBurst(l.pasture.x + l.pasture.w / 2, l.pasture.y + l.pasture.h / 2, 10, 30);
  if (junimos) setTimeout(() => summonJunimos(g), 600);
  toast(message, { icon: "item.wool" });
}

function initKeys(g: Game): void {
  let typed = "";
  const keys: string[] = [];
  let lastParty = 0;
  addEventListener("keydown", (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || isTyping(ev.target)) return;
    const k = (ev.key ?? "").toLowerCase();
    keys.push(k);
    if (keys.length > KONAMI.length) keys.shift();
    if (k.length === 1) typed = (typed + k).slice(-12);
    const now = performance.now();
    if (now - lastParty < 1500) return;
    if (keys.length === KONAMI.length && keys.every((v, i) => v === KONAMI[i])) {
      lastParty = now;
      keys.length = 0;
      party(g, "Konami code! Mr. Qi nods approvingly.", true);
    } else if (/ba{4,}h$/.test(typed)) {
      lastParty = now;
      typed = "";
      party(g, "Baaaaah! Sheep party!");
    }
  });
}

// ---------- the lucky clover (tap empty grass 7 times, fast) ----------

const FEET = { anchor: "feet" } as const;

class Clover implements Entity {
  x: number;
  y: number;
  layer = 1;
  dead = false;
  private t = 0;
  private twinkleIn = 1.5;

  constructor(x: number, y: number) {
    this.x = Math.round(x);
    this.y = Math.round(y);
  }

  update(dt: number): void {
    this.t += dt;
    // A tiny twinkle now and then, so it's easy to spot in the grass.
    this.twinkleIn -= dt;
    if (this.twinkleIn <= 0) {
      this.twinkleIn = rand(2, 3.5);
      sparkleBurst(this.x + rand(-5, 5), this.y - rand(8, 14), 1, 3);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    // Pops up out of the grass with a little bounce, then sways.
    const k = Math.min(1, this.t / 0.35);
    const z = this.t < 0.35 ? Math.sin(k * Math.PI) * 6 : 0;
    drawShadow(ctx, this.x, this.y, 11);
    if (k < 1) ctx.globalAlpha = k;
    const sway = this.t > 0.35 && Math.floor(this.t * 1.5) % 4 === 0 ? 1 : 0;
    draw(ctx, "item.clover", this.x + sway, this.y - z, FEET);
    ctx.globalAlpha = 1;
  }

  hit(wx: number, wy: number): boolean {
    return inBox(wx, wy, this.x - 10, this.y - 16, 20, 19);
  }

  onTap(): void {
    this.dead = true;
    sfx("harvest");
    sparkleBurst(this.x, this.y - 4, 6, 12);
    toast("A four-leaf clover! You two are lucky.", { icon: "item.clover" });
    // Luck is contagious: the whole farm does a little happy dance (the phone way to a sheep party).
    setTimeout(() => {
      sheepParty();
      critterParty();
    }, 400);
  }
}

function initClover(g: Game): void {
  const taps: number[] = [];
  let clover: Clover | null = null;
  g.on("groundtap", (p: { x: number; y: number }) => {
    taps.push(g.time);
    if (taps.length > 7) taps.shift();
    if (taps.length === 7 && taps[6]! - taps[0]! < 3.5) {
      taps.length = 0;
      if (clover && !clover.dead) clover.dead = true;
      // Don't let it sprout where the bottom fence rail would hide it.
      const l = g.layout;
      const hideTop = l.pasture.y + l.pasture.h - FENCE_HIDE;
      let y = p.y + 4;
      if (p.x > l.fence.x && p.x < l.fence.x + l.fence.w && y > hideTop && y < l.fence.y + l.fence.h + 6) y = hideTop;
      clover = addSafe(g, new Clover(p.x, y), "clover");
      sfx("secret");
      sparkleBurst(p.x, p.y - 2, 6, 14);
    }
  });
}

// ---------- 2 AM ----------

function initExhausted(g: Game): void {
  void whenState().then(() => {
    const h = g.env.hour;
    if (h < 2 || h >= 6) return;
    const key = dayKey(g.env.now);
    if (lsGet("farm.exhausted") === key) return;
    lsSet("farm.exhausted", key);
    queue(async () => {
      await whenNoDialog();
      await say(["It's past 2 AM...", "You're exhausted... You pass out on the couch. (Go to bed, farmers!)"]);
    }, 3800);
  });
}

// ---------- Stardrops: one for every 10 wool sheared ----------

async function stardropMoment(milestone: number): Promise<void> {
  await whenNoDialog();
  sfx("stardrop");
  const sparks: HTMLElement[] = [];
  if (!reducedMotion) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 34 + (i % 3) * 8;
      const s = spriteIcon(i % 2 ? "fx.sparkle.0" : "fx.sparkle.1", { scale: 2, class: "cr-stardrop__spark" });
      s.style.setProperty("--dx", `calc(var(--px) * ${Math.round(Math.cos(a) * r)})`);
      s.style.setProperty("--dy", `calc(var(--px) * ${Math.round(Math.sin(a) * r)})`);
      s.style.setProperty("--d", `${(i % 4) * 0.35}s`);
      sparks.push(s);
    }
  }
  const overlay = el(
    "div",
    { class: "cr-stardrop", role: "img", "aria-label": "A Stardrop!" },
    el(
      "div",
      { class: "cr-stardrop__stage" },
      el("div", { class: "cr-stardrop__halo" }),
      ...sparks,
      el("div", { class: "cr-stardrop__item" }, spriteIcon("item.stardrop", { scale: 5 })),
      el("div", { class: "cr-stardrop__caption" }, `${milestone} wool, together!`),
    ),
  );
  uiRoot.appendChild(overlay);
  return new Promise<void>((resolve) => {
    setTimeout(async () => {
      await say(["You found a Stardrop!", "Your mind fills with thoughts of all the adventures you've shared."]);
      overlay.classList.add("is-leaving");
      setTimeout(() => overlay.remove(), 460);
      resolve();
    }, 1500);
  });
}

function initStardrops(): void {
  const KEY = "farm.stardropMilestone";
  const stored = lsGet(KEY);
  let celebrated: number | null = stored !== null && Number.isFinite(Number(stored)) ? Number(stored) : null;
  store.changed.on((s) => {
    // (Guarded: a throw here would also stop every store listener registered after this one.)
    try {
      if (!Number.isFinite(s.totalWool)) return;
      const m = Math.floor(s.totalWool / 10) * 10;
      if (celebrated === null) {
        // First visit on this device: don't throw a party for wool sheared before today.
        celebrated = m;
        lsSet(KEY, String(m));
        return;
      }
      if (m >= 10 && m > celebrated) {
        celebrated = m;
        lsSet(KEY, String(m));
        queue(() => stardropMoment(m), 2200); // after the snip animation
      }
    } catch (err) {
      report("stardrops", err);
    }
  });
  if (params.has("stardrop")) {
    void whenState().then((s) => queue(() => stardropMoment(Math.max(10, Math.floor(s.totalWool / 10) * 10)), 1200));
  }
}

// ---------- a soft "new day" banner on the first visit of each day ----------

function dayFlavor(now: Date): string {
  const m = now.getMonth();
  const d = now.getDate();
  if (m === 9 && d === 31) return "Happy Spirit's Eve!";
  if (m === 11 && d === 25) return "Feast of the Winter Star!";
  if (m === 11 && d === 24) return "The Winter Star is tomorrow!";
  if (m === 1 && d === 14) return "A good day for bouquets.";
  if (d === 1 && (m === 2 || m === 5 || m === 8 || m === 11)) return `It's the first day of ${capitalize(seasonOf(now))}!`;
  const dow = now.getDay();
  if (dow === 3) return "Pierre's is closed today.";
  if (dow === 5 && chance(0.6)) return "The Stardrop Saloon is lively tonight.";
  const lines = [
    "The sheep look extra fluffy today.",
    "The spirits are in good humor today.",
    "A perfect day to make plans.",
    "Marnie says hello!",
    "Lewis is looking for his purple shorts again.",
    "Somewhere, a Junimo is humming.",
    "The fox and the hedgehog say good morning.",
  ];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

function initDayBanner(g: Game): void {
  void whenState().then((s) => {
    const now = g.env.now;
    const key = dayKey(now);
    if (lsGet("farm.lastDay") === key) return;
    lsSet("farm.lastDay", key);
    setTimeout(() => {
      const banner = el(
        "div",
        { class: "cr-day", role: "status" },
        el("div", { class: "cr-day__date" }, `${clockDateLabel(now)} — Year ${farmYear(s.foundedAt, now)}`),
        el("div", { class: "cr-day__flavor" }, dayFlavor(now)),
      );
      uiRoot.appendChild(banner);
      setTimeout(() => banner.remove(), 4800);
    }, 700);
  });
}

// ---------- holidays ----------

type Holiday = "spirits" | "winterstar" | "valentine" | null;

function holiday(now: Date): Holiday {
  const m = now.getMonth();
  const d = now.getDate();
  if (m === 9 && d === 31) return "spirits";
  if (m === 11 && d === 25) return "winterstar";
  if (m === 1 && d === 14) return "valentine";
  return null;
}

class HolidayThing implements Entity {
  x = 0;
  y = 0;
  layer = 1;
  hidden = false;
  private t = 0;

  constructor(
    private g: Game,
    private kind: Exclude<Holiday, null>,
  ) {
    if (kind === "winterstar" && lsGet("farm.winterStarGift") === String(g.env.now.getFullYear())) this.hidden = true;
  }

  update(dt: number): void {
    this.t += dt;
    const g = this.g;
    const l = g.layout;
    if (holiday(g.env.now) !== this.kind) {
      this.hidden = true;
      return;
    }
    if (this.kind === "spirits") {
      this.x = l.pasture.x + 7;
      this.y = l.pasture.y + l.pasture.h - FENCE_HIDE;
      if (g.env.darkness > 0.2) {
        const flicker = Math.sin(this.t * 11) * 1.5 + Math.sin(this.t * 3.7) * 1.5;
        g.addLight({ x: this.x, y: this.y - 5, radius: 26 + flicker, color: "rgba(255,170,70,0.85)" });
      }
    } else if (this.kind === "winterstar") {
      if (l.portrait) {
        // In portrait the barn door is behind the fence, so the gift waits by the chest.
        this.x = Math.round((l.loom.x + l.chest.x) / 2);
        this.y = Math.min(l.loom.y, l.chest.y) + 2;
      } else {
        this.x = l.barnDoor.x - 16;
        this.y = l.barnDoor.y - 1;
      }
    } else {
      // Leaning against the mailbox post.
      this.x = l.mailbox.x + 6;
      this.y = l.mailbox.y + 2;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.hidden) return;
    const g = this.g;
    let key: string;
    let w = 12;
    if (this.kind === "spirits") {
      key = g.env.darkness > 0.2 ? "world.jack.lit" : "world.jack";
      w = 13;
    } else if (this.kind === "winterstar") key = "item.gift";
    else key = "item.bouquet";
    drawShadow(ctx, this.x, this.y, w);
    // The gift wiggles now and then, like it can't wait to be opened.
    const wiggle = this.kind === "winterstar" && this.t % 4 < 0.4 ? (Math.floor(this.t * 20) % 2 ? 1 : -1) : 0;
    draw(ctx, key, this.x + wiggle, this.y, FEET);
  }

  hit(wx: number, wy: number): boolean {
    // Kept small so it never hides the mailbox (or the barn door) behind it.
    return !this.hidden && inBox(wx, wy, this.x - 6, this.y - 13, 12, 14);
  }

  onTap(): void {
    if (this.hidden) return;
    if (this.kind === "spirits") {
      sfx("thud");
      void say("Happy Spirit's Eve! The jack-o'-lantern grins at you both. Somewhere in town, a skeleton is dancing.");
    } else if (this.kind === "winterstar") {
      this.hidden = true;
      lsSet("farm.winterStarGift", String(this.g.env.now.getFullYear()));
      sfx("pop");
      sparkleBurst(this.x, this.y - 6, 8, 16);
      queue(async () => {
        await say(["Feast of the Winter Star! Someone left you two a gift.", "It's a tiny knitted sheep. It looks exactly like one of yours."]);
        sfx("reward");
        toast("You received: Tiny Knitted Sheep", { icon: "item.gift" });
      });
    } else {
      sfx("sparkle");
      heartFloat(this.x, this.y - 12, 3);
      void say([
        "Someone left a bouquet by the mailbox!",
        "In Pelican Town, giving someone a bouquet means you're officially sweethearts.",
        "...You two already knew that.",
      ]);
    }
  }
}

function initHolidays(g: Game): void {
  const h = holiday(g.env.now);
  if (!h) return;
  addSafe(g, new HolidayThing(g, h), "holiday");
  if (h === "winterstar" && !params.has("weather")) {
    // It always snows on the Feast of the Winter Star (overrides the real forecast).
    onTick(g, "winterstar", () => {
      if (holiday(g.env.now) === "winterstar" && g.env.weather !== "snow") g.setWeather("snow");
    });
  }
}

// ---------- entry ----------

export function initEasterEggs(g: Game): void {
  // Each secret boots on its own: one breaking never stops the farm (or the other secrets).
  const parts: [string, () => void][] = [
    ["junimos", () => initJunimos(g)],
    ["witch", () => initWitch(g)],
    ["keys", () => initKeys(g)],
    ["clover", () => initClover(g)],
    ["holidays", () => initHolidays(g)],
    ["day banner", () => initDayBanner(g)],
    ["2am", () => initExhausted(g)],
    ["stardrops", initStardrops],
  ];
  for (const [name, init] of parts) {
    try {
      init();
    } catch (err) {
      report(`init ${name}`, err);
    }
  }
}
