// The loom (LOOM_WOOL_COST wool -> 1 cloth, 4 in-game hours) and the chest: two tabs, the chest
// itself (everything you've earned and everything picked up around the farm) and the bundles, a
// Community Center–style board of sacks with the open one's slots below it.

import "./loom.css";
import { sfx } from "../audio";
import { currentGame } from "../engine/game";
import { has, isReal } from "../engine/sprites";
import { BLURRY_PHOTO, KEEPSAKE_KEYS, POCKET_SUNSHINE, ROYAL_HONEY, STARDUST, SUSPICIOUS_FEDORA } from "../entities/critter-keepsake";
import { api, serverNow, store } from "../net";
import { COFFEE_BEAN, FORAGE_BY_SEASON, forageKey, GINKGO_DROPS } from "../world/world-art";
import { BUNDLES, ITEM_KEY_PATTERN, type Bundle } from "../../shared/bundles";
import { seasonOf, type Season } from "../../shared/calendar";
import { LOOM_DURATION_MS, LOOM_WOOL_COST, type FarmState } from "../../shared/types";
import { errorText, farmNow } from "./calendar-util";
import { append, el, openDialog, openMenu, plural, registerMenu, spriteIcon, toast, uiRoot } from "./dom";
import { bundleSackKey, registerLoomArt } from "./loom-art";

export function initLoom(): void {
  registerLoomArt();
  registerMenu("loom", () => openLoom());
  registerMenu("chest", () => openChest());
}

type Phase = "idle" | "working" | "ready";

function phaseOf(st: FarmState, now = serverNow()): Phase {
  if (!st.loom) return "idle";
  return now >= st.loom.readyAt ? "ready" : "working";
}

/** "2:31" */
function mmss(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

// ---------- loom ----------

function openLoom(): void {
  const root = el("div", { class: "fm-loom fm-menu" });
  let busy = false;
  let lastPhase: Phase | "" = "";
  let fill: HTMLElement | null = null;
  let countdown: HTMLElement | null = null;
  let bar: HTMLElement | null = null;

  const d = openDialog({
    title: "Loom",
    className: "fm-loom-dialog fm-menu",
    body: root,
    onClose: () => {
      off();
      clearInterval(timer);
    },
  });

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    d.error(null);
    render();
    try {
      await fn();
    } catch (err) {
      d.error(errorText(err));
    } finally {
      busy = false;
      render();
    }
  };

  const start = () =>
    run(async () => {
      await api.loomStart();
      sfx("loom");
    });

  const collect = () =>
    run(async () => {
      await api.loomCollect();
      sfx("pop");
      toast("Cloth!", { icon: "item.cloth" });
    });

  function render(): void {
    const st = store.state;
    fill = countdown = bar = null;
    if (!st) {
      lastPhase = "";
      root.replaceChildren(el("p", { class: "sv-say" }, "Warming up..."));
      return;
    }
    const phase = phaseOf(st);
    lastPhase = phase;

    const art = el(
      "div",
      { class: `fm-loom__art is-${phase} ${isReal("ui.menu.loom") ? "is-real" : ""}` },
      phase === "ready" ? el("div", { class: "fm-loom__bubble", "aria-hidden": "true" }, spriteIcon("item.cloth")) : null,
      spriteIcon(phase === "working" ? "ui.menu.loom.working" : "ui.menu.loom", { scale: 2, class: "fm-loom__machine" }),
    );

    const status = el("div", { class: "fm-loom__status" });
    const woolLine = el("p", { class: "fm-count", role: "img", "aria-label": `You have ${plural(st.wool, "wool", "wool")}` }, spriteIcon("item.wool"), `× ${st.wool}`);

    if (phase === "idle") {
      const enough = st.wool >= LOOM_WOOL_COST;
      const need = LOOM_WOOL_COST - st.wool;
      status.append(
        el("h3", null, "Empty..."),
        woolLine,
        el(
          "button",
          { type: "button", class: "sv-btn sv-btn--primary", disabled: !enough || busy, on: { click: start } },
          spriteIcon("item.wool"),
          el("span", null, `Put in ${LOOM_WOOL_COST} wool`),
        ),
        enough
          ? el("p", { class: "fm-loom__hint" }, "4 farm hours (about 3 minutes)")
          : el("p", { class: "fm-loom__hint" }, `Needs ${plural(need, "more wool", "more wool")}...`),
      );
    } else if (phase === "working") {
      fill = el("div", { class: "fm-loom__fill" });
      countdown = el("span", { class: "fm-loom__time" });
      bar = el("div", { class: "fm-loom__bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Weaving progress" }, fill);
      status.append(
        el("h3", null, "Clack, clack... weaving!"),
        bar,
        el("p", { class: "fm-loom__eta" }, "Cloth ready in ", countdown),
        woolLine,
      );
      tick();
    } else {
      status.append(
        el("h3", null, "Cloth's ready!"),
        el(
          "button",
          { type: "button", class: "sv-btn sv-btn--primary fm-loom__collect", disabled: busy, on: { click: collect } },
          spriteIcon("item.cloth"),
          el("span", null, "Collect"),
        ),
        woolLine,
      );
    }

    const footer = el(
      "div",
      { class: "fm-loom__footer" },
      el("span", { class: "fm-count", role: "img", "aria-label": `${plural(st.cloth, "cloth", "cloth")} in the chest` }, spriteIcon("item.cloth"), `× ${st.cloth}`),
      st.cloth > 0
        ? el("button", { type: "button", class: "sv-btn", on: { click: () => openMenu("shop") } }, el("span", null, "Shop ›"))
        : null,
    );

    root.replaceChildren(el("div", { class: "fm-loom__main" }, art, status), footer);
  }

  function tick(): void {
    const st = store.state;
    if (!st) return;
    const now = serverNow();
    const phase = phaseOf(st, now);
    if (phase !== lastPhase) {
      if (phase === "ready" && lastPhase === "working") sfx("pop", { volume: 0.5 });
      render();
      return;
    }
    if (phase !== "working" || !st.loom || !fill || !countdown) return;
    const total = Math.max(1, st.loom.readyAt - st.loom.startedAt) || LOOM_DURATION_MS;
    const pct = Math.min(100, Math.max(0, ((now - st.loom.startedAt) / total) * 100));
    fill.style.width = `${pct.toFixed(1)}%`;
    bar?.setAttribute("aria-valuenow", pct.toFixed(0));
    countdown.textContent = mmss(st.loom.readyAt - now);
  }

  const off = store.changed.on(render);
  const timer = window.setInterval(tick, 250);
  render();
}

// ---------- chest ----------

interface ChestItem {
  id: string;
  icon: string;
  name: string;
  count: number;
  desc: string;
  /** The bundle this goes in, if any. */
  bundle?: Bundle;
}

/** A small Stardew chest is 6 x 4; it grows a row at a time if the farm finds more. */
const COLS = 6;
const MIN_SLOTS = 24;
/** The bundle sack hops once everything has jumped in (ms into the celebration). */
const HOP_AT = 750;

/** "item.forage.wild-horseradish" -> "Wild Horseradish" (item keys are sprite keys). */
function itemName(key: string): string {
  const slug = key.slice(key.lastIndexOf(".") + 1);
  return (
    slug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "Something"
  );
}

/** What falls out of the ginkgos. */
const TREE_DROPS: ReadonlySet<string> = new Set(Object.values(GINKGO_DROPS).flat().map(forageKey));
/** What fell out of the oaks, maples and pines, before every tree was a ginkgo (no bundle wants it now). */
const OLD_SEEDS: ReadonlySet<string> = new Set(["item.forage.acorn", "item.forage.maple-seed", "item.forage.pine-cone"]);

/** A few things in the chest have something to say. */
const ITEM_NOTES: Record<string, string> = {
  "item.forage.salmonberry": "Only ripe a few days each spring...",
  "item.forage.grape": "Saving it for Wine Wednesday...",
  "item.forage.blackberry": "Grows wild all over Washington. Here too, apparently.",
  "item.forage.pine-cone": "Smells like a hike up Mt. Tam.",
  "item.forage.dandelion": "Make a wish...",
  "item.forage.ginkgo-nut": "It smells bad so nobody eats it I guess.",
  "item.forage.ginkgo-leaf": "Pressing it in a sketchbook.",
  "item.forage.twig": "A good stick.",
  "item.artifact.rusty-spoon": "Snickers would like to knock this off a table.",
  "item.artifact.dried-starfish": "Washed up from Ocean Beach, probably.",
  "item.artifact.anchor": "A Fleet Week souvenir?",
  "item.artifact.dinosaur-egg": "It's... warm?",
  "item.artifact.ancient-doll": "Laffing Sal's little cousin?",
  [BLURRY_PHOTO]: "It’s definitely him.",
  [ROYAL_HONEY]: "From a ladybug knight's saddlebag.",
  [POCKET_SUNSHINE]: "Karl the Fog missed a spot.",
  [SUSPICIOUS_FEDORA]: "Nobody's claiming it.",
  [STARDUST]: "Swept up after a wish.",
};

function itemDesc(key: string): string {
  if (Object.hasOwn(ITEM_NOTES, key)) return ITEM_NOTES[key]!;
  if (TREE_DROPS.has(key)) return "Fell out of a ginkgo. Bonk.";
  if (OLD_SEEDS.has(key)) return "From back when the trees weren't all ginkgos.";
  if (key.startsWith("item.artifact.")) return "Dug up where the worms were wiggling.";
  return "Picked up around the farm.";
}

/** Where to find what a bundle needs. */
const BUNDLE_HINTS: Record<string, string> = {
  spring: "In the grass, in spring.",
  summer: "In the grass, in summer.",
  fall: "In the grass, in fall.",
  winter: "Out in the snow, in winter.",
  wild: "In the grass, in spring.",
  exotic: "In the grass, in fall.",
  seeds: "Stuff falls out of a ginkgo if you shake it.",
  junk: "The worms wiggle where stuff is buried I guess.",
  beach: "The worms wiggle where stuff is buried I guess.",
  antiques: "The worms wiggle where stuff is buried I guess.",
  rare: "Some of the stuff under the worms is really old.",
  research: "Rare visitors leave keepsakes...",
};

/** Where to find one item, when its bundle's hint isn't the whole story. */
const ITEM_HINTS: Record<string, string> = {
  "item.forage.red-mushroom": "In the grass, in summer and fall.",
  "item.forage.coffee-bean": "Turns up now and then, any season.",
  [ROYAL_HONEY]: "Hail a Bumblesteed on a sunny day.",
  [POCKET_SUNSHINE]: "Catch a golden ladybug on a sunny day.",
  [BLURRY_PHOTO]: "Snap something tall at dusk...",
  [SUSPICIOUS_FEDORA]: "Late at night, unmask a trench coat.",
  [STARDUST]: "Wish on a shooting star.",
};

/** The keepsakes only bugs leave (and the bugs sleep through winter). */
const BUG_KEEPSAKES: ReadonlySet<string> = new Set([ROYAL_HONEY, POCKET_SUNSHINE]);
const KEEPSAKES: ReadonlySet<string> = new Set(KEEPSAKE_KEYS);
const COFFEE_KEY = forageKey(COFFEE_BEAN);

/** The farm's season (the world's, which can be overridden for testing), for the hints. */
function farmSeason(): Season {
  try {
    const s = currentGame?.env.season;
    if (s) return s;
  } catch {
    // fall through
  }
  return seasonOf(farmNow());
}

function bundleHint(b: Bundle): string {
  return BUNDLE_HINTS[b.id] ?? "";
}

function itemHint(key: string): string | null {
  if (BUG_KEEPSAKES.has(key) && farmSeason() === "winter") return "The bugs are napping till spring...";
  // Bare ginkgos only have twigs to give.
  if (TREE_DROPS.has(key) && !inSeason(key, farmSeason())) return "The ginkgos are bare till spring...";
  return Object.hasOwn(ITEM_HINTS, key) ? ITEM_HINTS[key]! : null;
}

/** Can this turn up on the farm this season? (Digs, coffee and most keepsakes: any season.) */
function inSeason(key: string, season: Season): boolean {
  if (BUG_KEEPSAKES.has(key)) return season !== "winter";
  if (TREE_DROPS.has(key)) return GINKGO_DROPS[season].some((name) => forageKey(name) === key);
  if (!key.startsWith("item.forage.") || key === COFFEE_KEY) return true;
  return FORAGE_BY_SEASON[season].some((name) => forageKey(name) === key);
}

/**
 * "Spring Foraging Bundle" -> "Spring", "Ginkgo Bundle" -> "Ginkgo" (the board's labels). A
 * soft hyphen lets "Beach-comber" break on a 360px phone, where it's wider than its tile.
 */
const shortName = (b: Bundle): string => b.name.replace(/ (Foraging )?Bundle$/, "").replace("Beachcomber", "Beach\u00adcomber");

const bundleFor = (key: string): Bundle | undefined => BUNDLES.find((b) => b.items.includes(key));

/** How many of `key` are in the shared chest (0 for anything odd). */
function countOf(st: FarmState, key: string): number {
  const n = Math.floor(Number(st.items?.[key] ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function bundleReady(st: FarmState, b: Bundle): boolean {
  return b.items.length > 0 && b.items.every((k) => countOf(st, k) > 0);
}

function timesDone(st: FarmState, b: Bundle): number {
  const n = Math.floor(Number(st.bundles?.[b.id] ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Can't be finished this season: something it's still missing doesn't turn up now. */
function bundleAsleep(st: FarmState, b: Bundle, season: Season): boolean {
  return b.items.some((k) => countOf(st, k) < 1 && !inSeason(k, season));
}

/** The bundle to open first: a ready one, or the first one that can be worked on this season. */
function defaultBundle(st: FarmState, season: Season): string {
  return (BUNDLES.find((b) => bundleReady(st, b)) ?? BUNDLES.find((b) => !bundleAsleep(st, b, season)) ?? BUNDLES[0]!).id;
}

/** Chest order: forage, then what the trees dropped, then digs, then keepsakes (first-landed within each). */
function itemRank(key: string): number {
  if (KEEPSAKES.has(key)) return 3;
  if (key.startsWith("item.artifact.")) return 2;
  return TREE_DROPS.has(key) || OLD_SEEDS.has(key) ? 1 : 0;
}

function starIcon(scale = 1): HTMLElement {
  return has("ui.star") ? spriteIcon("ui.star", { scale }) : el("span", null, "★");
}

/** An item's icon, or a little "?" if its sprite never registered. */
function itemIcon(key: string, opts: { scale?: number; class?: string } = {}): HTMLElement {
  if (has(key)) return spriteIcon(key, opts);
  return el("span", { class: `fm-item-glyph ${opts.class ?? ""}`, "aria-hidden": "true" }, "?");
}

function chestItems(st: FarmState): ChestItem[] {
  const list: ChestItem[] = [];
  if (st.wool > 0) {
    list.push({
      id: "wool",
      icon: "item.wool",
      name: "Wool",
      count: st.wool,
      desc: `Sheep hair, technically. ${LOOM_WOOL_COST} makes a cloth.`,
    });
  }
  if (st.cloth > 0) {
    list.push({
      id: "cloth",
      icon: "item.cloth",
      name: "Cloth",
      count: st.cloth,
      desc: "Wool, but flat. Buys decorations and hats.",
    });
  }
  // Everything picked up around the farm, by kind, each kind in the order it first landed in the chest.
  const keys = Object.keys(st.items ?? {}).filter((key) => ITEM_KEY_PATTERN.test(key) && countOf(st, key) > 0);
  keys.sort((a, b) => itemRank(a) - itemRank(b)); // (stable)
  for (const key of keys) {
    list.push({ id: key, icon: key, name: itemName(key), count: countOf(st, key), desc: itemDesc(key), bundle: bundleFor(key) });
  }
  return list;
}

type ChestTab = "chest" | "bundles";
/** Which side of the chest is showing, remembered for the visit. */
let chestTab: ChestTab = "chest";

function openChest(): void {
  const root = el("div", { class: "fm-chest fm-menu", role: "tabpanel", id: "fm-chest-panel" });
  let selected: string | null = null;
  let secretPokes = 0;
  /** The string's secret poke got Snickers' attention: he comes for it once the chest closes. */
  let called = false;
  let busy = false;
  /** The bundle item each card is showing the name of (tap a slot to see what it is). */
  const peek = new Map<string, string>();
  /** The bundle open under the board (picked when the board first shows; see defaultBundle). */
  let openBundle: string | null = null;
  /** The Bundles tab's tallest height so far, at this width (see holdBoard). */
  let boardFloor = { w: 0, h: 0 };

  const d = openDialog({
    title: "Chest",
    className: "fm-chest-dialog fm-menu",
    body: root,
    buttons: [
      { label: "Loom", onClick: () => (openMenu("loom"), false) },
      { label: "Shop", icon: "item.cloth", kind: "primary", onClick: () => (openMenu("shop"), false) },
    ],
    onClose: () => {
      off();
      if (called) currentGame?.emit("string");
    },
  });
  sfx("chest");

  // Chest | Bundles sit between the title and the scrolling body, so they never scroll away.
  const tabs = el("div", { class: "fm-chest__tabs", role: "tablist", "aria-label": "Chest" });
  d.box.querySelector(".sv-dialog__main")?.before(tabs);
  const scroller = d.box.querySelector<HTMLElement>(".sv-dialog__content");

  const secret: ChestItem | null = has("item.string")
    ? {
        id: "string",
        icon: "item.string",
        name: "Snickers's String",
        count: 1,
        desc: "His favorite. Do not touch.",
      }
    : null;

  function setTab(tab: ChestTab): void {
    if (tab === chestTab) return;
    chestTab = tab;
    sfx("select");
    if (scroller) scroller.scrollTop = 0;
    render();
  }

  /** Over to the Bundles tab, with this bundle open. */
  function showBundle(id: string): void {
    openBundle = id;
    peek.delete(id);
    chestTab = "bundles";
    sfx("select");
    if (scroller) scroller.scrollTop = 0;
    render();
  }

  function renderTabs(st: FarmState | null | undefined): void {
    const anyReady = !!st && BUNDLES.some((b) => bundleReady(st, b));
    const tab = (id: ChestTab, label: string, icon: string, dot: boolean): HTMLElement =>
      el(
        "button",
        {
          type: "button",
          class: `fm-tab ${chestTab === id ? "is-on" : ""}`,
          role: "tab",
          id: `fm-chest-tab-${id}`,
          "aria-selected": String(chestTab === id),
          "aria-controls": "fm-chest-panel",
          tabindex: chestTab === id ? "0" : "-1",
          dataset: { focus: `tab-${id}` },
          on: {
            click: () => setTab(id),
            keydown: (ev: KeyboardEvent) => {
              if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
              ev.preventDefault();
              const other: ChestTab = id === "chest" ? "bundles" : "chest";
              setTab(other);
              tabs.querySelector<HTMLElement>(`#fm-chest-tab-${other}`)?.focus();
            },
          },
        },
        has(icon) ? spriteIcon(icon, { class: "fm-tab__icon" }) : null,
        el("span", null, label),
        dot ? el("span", { class: "fm-tab__dot", role: "img", "aria-label": "(a bundle is ready)" }) : null,
      );
    // (The Bundles tab carries this season's sack.)
    tabs.replaceChildren(tab("chest", "Chest", "ui.icon.chest", false), tab("bundles", "Bundles", bundleSackKey(farmSeason()), anyReady));
  }

  function render(): void {
    const st = store.state;
    // Re-rendering replaces every button: keep the keyboard where it was.
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement && d.box.contains(active) ? active.dataset.focus : undefined;
    renderTabs(st);
    if (!st) {
      root.replaceChildren(el("p", { class: "sv-say" }, "Stuck... (still loading)"));
      return;
    }
    root.setAttribute("aria-labelledby", `fm-chest-tab-${chestTab}`);
    root.style.minHeight = "";
    root.replaceChildren(...(chestTab === "bundles" ? bundlesPanel(st) : chestPanel(st)));
    if (chestTab === "bundles") holdBoard();
    if (focusKey) d.box.querySelector<HTMLElement>(`[data-focus="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  /**
   * After the Bundles tab renders: a card name on two lines (narrow phones) gets its ribbon stripe
   * moved out from behind the words, and the tab only grows while the chest is open (a shorter card,
   * with no Complete! button or a one-line name, would re-center the dialog and slide the board out
   * from under your thumb).
   */
  function holdBoard(): void {
    const name = root.querySelector<HTMLElement>(".fm-bundle__name");
    if (name) name.parentElement?.classList.toggle("is-wrapped", name.offsetHeight > parseFloat(getComputedStyle(name).lineHeight) * 1.5);
    const w = root.clientWidth;
    const h = root.offsetHeight; // (layout height: the dialog's pop-in transform doesn't count)
    boardFloor = w === boardFloor.w ? { w, h: Math.max(boardFloor.h, h) } : { w, h }; // (a new width starts over)
    root.style.minHeight = `${boardFloor.h}px`;
  }

  /** The chest itself: the slots, a closer look at the selected one, and the lifetime wool. */
  function chestPanel(st: FarmState): HTMLElement[] {
    const list = chestItems(st);
    const all = new Map<string, ChestItem>(list.map((i) => [i.id, i]));
    if (secret) all.set(secret.id, secret);
    if (selected && !all.has(selected)) selected = null;

    // Snickers keeps his favorite toy hidden in the very last slot. Shh.
    const slots = Math.max(MIN_SLOTS, Math.ceil((list.length + (secret ? 1 : 0)) / COLS) * COLS);
    const grid = el("div", { class: "fm-chest__grid", role: "list" });
    for (let i = 0; i < slots; i++) {
      const item = i < list.length ? list[i] : i === slots - 1 && secret ? secret : undefined;
      if (!item) {
        grid.appendChild(el("div", { class: "fm-slot is-empty", role: "listitem", "aria-hidden": "true" }));
        continue;
      }
      const slot = el(
        "button",
        {
          type: "button",
          class: `fm-slot ${selected === item.id ? "is-selected" : ""} ${item.id === "string" ? "is-secret" : ""}`,
          role: "listitem",
          "aria-label": item.count > 1 ? `${item.name}, ${item.count}` : item.name,
          "aria-pressed": String(selected === item.id),
          dataset: { focus: `slot-${item.id}` },
          on: { click: () => pick(item) },
        },
        // (spriteIcon sets --s inline, so the slot scale has to be passed here, not in CSS.)
        itemIcon(item.icon, { scale: 1.25, class: "fm-slot__icon" }),
        item.count > 1 ? el("span", { class: "fm-slot__count" }, String(item.count)) : null,
      );
      grid.appendChild(slot);
    }

    const sel = selected ? all.get(selected) : undefined;
    const info = el("div", { class: "fm-chest__info", "aria-live": "polite" });
    if (sel) {
      const bundle = sel.bundle;
      append(
        info,
        el("b", null, sel.count > 1 ? `${sel.name} ×${sel.count}` : sel.name),
        el("span", null, sel.desc),
        bundle
          ? el(
              "button",
              { type: "button", class: "fm-chest__for", dataset: { focus: "for" }, on: { click: () => showBundle(bundle.id) } },
              spriteIcon(bundleSackKey(bundle.id), { scale: 0.75 }),
              el("span", null, `For the ${bundle.name}`),
            )
          : null,
      );
    } else {
      info.classList.add("is-idle");
      const ready = BUNDLES.find((b) => bundleReady(st, b));
      append(
        info,
        has("ui.menu.chest") ? spriteIcon("ui.menu.chest", { class: "fm-chest__pic" }) : null,
        ready
          ? el(
              "button",
              { type: "button", class: "fm-chest__nudge", dataset: { focus: "nudge" }, on: { click: () => showBundle(ready.id) } },
              spriteIcon(bundleSackKey(ready.id)),
              el("span", null, "A bundle is ready!"),
            )
          : list.length
            ? el("span", { class: "fm-chest__idle" }, "Tap something for a closer look...")
            : el("span", { class: "fm-chest__idle" }, "Empty... shear a sheep!"),
      );
    }

    return [
      grid,
      info,
      el(
        "p",
        { class: "fm-chest__lifetime fm-count" },
        spriteIcon("item.wool"),
        `Lifetime wool: ${st.totalWool}`,
        st.loom ? el("span", { class: "fm-chest__loom" }, phaseOf(st) === "ready" ? " · cloth's ready in the loom!" : " · loom: clack, clack...") : null,
      ),
    ];
  }

  /** The Community Center board: every bundle's sack, always in the same spot, and the open one below. */
  function bundlesPanel(st: FarmState): HTMLElement[] {
    const season = farmSeason();
    openBundle ??= defaultBundle(st, season);
    const open = BUNDLES.find((b) => b.id === openBundle) ?? BUNDLES[0]!;
    const board = el("div", { class: "fm-board", role: "group", "aria-label": "Bundles" }, ...BUNDLES.map((b) => sackButton(st, b, season, b === open)));
    return [board, bundleCard(st, open)];
  }

  /** One sack on the board: its label, a pip per item (filled once it's in the chest), and ★×N once done. */
  function sackButton(st: FarmState, b: Bundle, season: Season, isOpen: boolean): HTMLElement {
    const have = b.items.filter((k) => countOf(st, k) > 0).length;
    const ready = bundleReady(st, b);
    const times = timesDone(st, b);
    // Whatever it's still missing can't turn up this season: it waits, a little faded (never hidden).
    const asleep = !ready && bundleAsleep(st, b, season);
    return el(
      "button",
      {
        type: "button",
        class: `fm-sack is-${b.id} ${ready ? "is-ready" : ""} ${asleep ? "is-asleep" : ""} ${isOpen ? "is-open" : ""}`,
        "aria-label": `${b.name}, ${have} of ${b.items.length}${ready ? ", ready" : ""}`,
        "aria-pressed": String(isOpen),
        dataset: { focus: `sack-${b.id}`, bundle: b.id },
        on: {
          click: () => {
            if (openBundle === b.id) return;
            openBundle = b.id;
            sfx("select");
            render();
          },
        },
      },
      spriteIcon(bundleSackKey(b.id), { scale: 1.5, class: "fm-sack__icon" }),
      el("span", { class: "fm-sack__label" }, shortName(b)),
      el("span", { class: "fm-sack__pips", "aria-hidden": "true" }, ...b.items.map((k) => el("i", { class: countOf(st, k) > 0 ? "is-have" : "" }))),
      times > 0 ? el("span", { class: "fm-sack__times", "aria-hidden": "true" }, starIcon(0.75), `×${times}`) : null,
    );
  }

  /** One Community Center–style bundle: its slots (silhouettes until you have one), the reward, and Complete! */
  function bundleCard(st: FarmState, b: Bundle): HTMLElement {
    const have = b.items.filter((k) => countOf(st, k) > 0).length;
    const ready = bundleReady(st, b);
    const times = timesDone(st, b);
    const peeked = peek.get(b.id);
    const hint = bundleHint(b);

    const slots = el(
      "div",
      { class: "fm-bundle__slots" },
      ...b.items.map((k) => {
        const got = countOf(st, k) > 0;
        return el(
          "button",
          {
            type: "button",
            class: `fm-bslot ${got ? "is-have" : "is-missing"} ${peeked === k ? "is-peek" : ""}`,
            "aria-label": got ? itemName(k) : `${itemName(k)} (missing)`,
            "aria-pressed": String(peeked === k),
            title: itemName(k),
            dataset: { focus: `bslot-${k}` },
            on: {
              click: () => {
                if (peeked === k) peek.delete(b.id);
                else peek.set(b.id, k);
                sfx("select");
                render();
              },
            },
          },
          itemIcon(k, { class: "fm-bslot__icon" }),
        );
      }),
    );

    let caption: HTMLElement | null = null;
    if (peeked && b.items.includes(peeked)) {
      const got = countOf(st, peeked) > 0;
      const where = itemHint(peeked) ?? hint;
      caption = el(
        "p",
        { class: "fm-bundle__peek" },
        el("b", null, itemName(peeked)),
        got ? " · in the chest ✓" : where ? ` · ${where.charAt(0).toLowerCase()}${where.slice(1)}` : " · still missing",
      );
    } else if (!ready && hint) {
      caption = el("p", { class: "fm-bundle__peek is-hint" }, hint);
    }

    return el(
      "article",
      {
        class: `fm-bundle is-${b.id} ${ready ? "is-ready" : ""}`,
        dataset: { bundle: b.id },
        "aria-label": `${b.name}: ${have} of ${b.items.length}`,
      },
      el(
        "div",
        { class: "fm-bundle__head" },
        spriteIcon(bundleSackKey(b.id), { class: "fm-bundle__sack" }),
        el("span", { class: "fm-bundle__name" }, b.name),
        times > 0
          ? el(
              "span",
              { class: "fm-bundle__times", role: "img", "aria-label": `Completed ${plural(times, "time")}`, title: `Completed ${plural(times, "time")}` },
              starIcon(),
              `×${times}`,
            )
          : null,
        el(
          "span",
          { class: "fm-bundle__reward", role: "img", "aria-label": `Reward: ${plural(b.reward, "cloth", "cloth")}` },
          `+${b.reward}`,
          spriteIcon("item.cloth"),
        ),
      ),
      slots,
      caption,
      ready
        ? el(
            "button",
            { type: "button", class: "sv-btn sv-btn--primary fm-bundle__go", disabled: busy, dataset: { focus: `go-${b.id}` }, on: { click: () => void complete(b) } },
            el("span", null, "Complete!"),
          )
        : null,
    );
  }

  async function complete(b: Bundle): Promise<void> {
    if (busy) return;
    busy = true;
    d.error(null);
    render();
    let done = false;
    try {
      await api.completeBundle(b.id);
      done = true;
    } catch (err) {
      d.error(errorText(err));
    } finally {
      busy = false;
      render();
    }
    if (!done) return;
    sfx("reward");
    toast(`+${plural(b.reward, "cloth", "cloth")}`, { icon: "item.cloth" });
    // The "jump into the sack" animation, measured after the re-render (the card just lost its
    // Complete! button, so the dialog may have moved): out of the card's slots and up into the
    // bundle's sack on the board.
    const card = root.querySelector<HTMLElement>(`.fm-bundle[data-bundle="${b.id}"]`);
    const from = card
      ? [...card.querySelectorAll<HTMLElement>(".fm-bslot")].map((slot, i) => ({ key: b.items[i] ?? "", rect: slot.getBoundingClientRect() }))
      : [];
    const sackEl = root.querySelector(`.fm-sack[data-bundle="${b.id}"] .fm-sack__icon`) ?? card?.querySelector(".fm-bundle__sack");
    celebrate(b, from, sackEl?.getBoundingClientRect() ?? null);
  }

  function pick(item: ChestItem): void {
    if (item.id === "string" && selected === "string") {
      secretPokes++;
      if (secretPokes === 1) {
        called = true;
        sfx("meow");
        toast("Somewhere outside, a grey cat's ears just perked up...", { icon: "item.string" });
        return;
      }
    }
    selected = item.id;
    sfx(item.id === "string" ? "rustle" : "select");
    render();
  }

  const off = store.changed.on(render);
  render();
}

/**
 * The Community Center moment: the bundle's items hop into its sack, the sack bounces, stars
 * burst out and "+1 cloth" floats up. Drawn on its own layer above the dialog (which re-renders
 * underneath), and purely decorative: it never throws and is skipped for reduced motion.
 */
function celebrate(b: Bundle, from: { key: string; rect: DOMRect }[], sack: DOMRect | null): void {
  try {
    if (!sack || !sack.width || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cx = sack.left + sack.width / 2;
    const cy = sack.top + sack.height / 2;
    const at = (node: HTMLElement, x: number, y: number) => {
      node.style.left = `${Math.round(x)}px`;
      node.style.top = `${Math.round(y)}px`;
      return node;
    };
    const layer = el("div", { class: "fm-menu fm-burst", "aria-hidden": "true" });
    layer.style.pointerEvents = "none";

    from.forEach(({ key, rect }, i) => {
      if (!key || !rect.width) return;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const icon = at(itemIcon(key, { class: "fm-burst__item" }), x, y);
      icon.style.setProperty("--dx", `${Math.round(cx - x)}px`);
      icon.style.setProperty("--dy", `${Math.round(cy - y)}px`);
      icon.style.animationDelay = `${i * 80}ms`;
      layer.appendChild(icon);
    });
    layer.appendChild(at(spriteIcon(bundleSackKey(b.id), { scale: 1.5, class: "fm-burst__sack" }), cx, cy));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const star = at(has("ui.star") ? spriteIcon("ui.star", { class: "fm-burst__star" }) : el("span", { class: "fm-burst__star" }, "★"), cx, cy);
      star.style.setProperty("--tx", `${Math.round(Math.cos(a) * 52)}px`);
      star.style.setProperty("--ty", `${Math.round(Math.sin(a) * 40 - 8)}px`);
      star.style.animationDelay = `${HOP_AT + 80 + (i % 2) * 60}ms`;
      layer.appendChild(star);
    }
    const plus = at(el("span", { class: "fm-burst__plus" }, `+${b.reward}`, spriteIcon("item.cloth")), cx, cy - 8);
    plus.style.animationDelay = `${HOP_AT + 120}ms`;
    layer.appendChild(plus);

    uiRoot.appendChild(layer);
    window.setTimeout(() => layer.remove(), HOP_AT + 1400);
  } catch {
    // decorative only
  }
}
