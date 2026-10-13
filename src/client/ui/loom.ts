// The loom (LOOM_WOOL_COST wool -> 1 cloth, 4 in-game hours) and the chest (everything you've
// earned, everything picked up around the farm, and the Community Center–style bundles).

import "./loom.css";
import { sfx } from "../audio";
import { currentGame } from "../engine/game";
import { has, isReal } from "../engine/sprites";
import { api, serverNow, store } from "../net";
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

const TREE_SEEDS: ReadonlySet<string> = new Set(["item.forage.acorn", "item.forage.maple-seed", "item.forage.pine-cone"]);

/** A few things in the chest have something to say. */
const ITEM_NOTES: Record<string, string> = {
  "item.forage.salmonberry": "Only ripe a few days each spring...",
  "item.forage.grape": "Saving it for Wine Wednesday...",
  "item.forage.blackberry": "Grows wild all over Washington. Here too, apparently.",
  "item.forage.pine-cone": "Smells like a hike up Mt. Tam.",
  "item.forage.dandelion": "Make a wish...",
  "item.artifact.rusty-spoon": "Snickers would like to knock this off a table.",
  "item.artifact.dried-starfish": "Washed up from Ocean Beach, probably.",
  "item.artifact.anchor": "A Fleet Week souvenir?",
  "item.artifact.dinosaur-egg": "It's... warm?",
};

function itemDesc(key: string): string {
  if (Object.hasOwn(ITEM_NOTES, key)) return ITEM_NOTES[key]!;
  if (TREE_SEEDS.has(key)) return "Fell out of a tree. Bonk.";
  if (key.startsWith("item.artifact.")) return "Dug up where the worms were wiggling.";
  return "Picked up around the farm.";
}

/** Where to find what a bundle needs. */
const BUNDLE_HINTS: Record<string, string> = {
  spring: "In the grass, in spring.",
  summer: "In the grass, in summer.",
  fall: "In the grass, in fall.",
  winter: "Out in the snow, in winter.",
  seeds: "Shake a tree, then grab what falls.",
  junk: "Dig where the worms wiggle.",
};

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
  // Trees don't drop seeds in winter (like Stardew), so "shake the trees" would just be a tease.
  if (b.id === "seeds" && farmSeason() === "winter") return "The trees are napping till spring...";
  return BUNDLE_HINTS[b.id] ?? "";
}

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
      desc: `Soft, fluffy, full of memories... ${LOOM_WOOL_COST} makes a cloth.`,
    });
  }
  if (st.cloth > 0) {
    list.push({
      id: "cloth",
      icon: "item.cloth",
      name: "Cloth",
      count: st.cloth,
      desc: "Woven from your adventures. Buys decorations and hats.",
    });
  }
  // Everything picked up around the farm, in the order it first landed in the chest.
  for (const key of Object.keys(st.items ?? {})) {
    if (!ITEM_KEY_PATTERN.test(key)) continue;
    const count = countOf(st, key);
    if (!count) continue;
    list.push({ id: key, icon: key, name: itemName(key), count, desc: itemDesc(key), bundle: bundleFor(key) });
  }
  return list;
}

function openChest(): void {
  const root = el("div", { class: "fm-chest fm-menu" });
  let selected: string | null = null;
  let secretPokes = 0;
  let busy = false;
  /** The bundle item each card is showing the name of (tap a slot to see what it is). */
  const peek = new Map<string, string>();
  /** Ready bundles first, decided once per visit so cards don't jump around while you're looking. */
  let order: Bundle[] | null = null;

  const d = openDialog({
    title: "Chest",
    className: "fm-chest-dialog fm-menu",
    body: root,
    buttons: [
      { label: "Loom", onClick: () => (openMenu("loom"), false) },
      { label: "Shop", icon: "item.cloth", kind: "primary", onClick: () => (openMenu("shop"), false) },
    ],
    onClose: () => off(),
  });
  sfx("chest");

  const secret: ChestItem | null = has("item.string")
    ? {
        id: "string",
        icon: "item.string",
        name: "Snickers's String",
        count: 1,
        desc: "His favorite. Do not touch.",
      }
    : null;

  function render(): void {
    const st = store.state;
    if (!st) {
      root.replaceChildren(el("p", { class: "sv-say" }, "Stuck... (still loading)"));
      return;
    }
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
      append(
        info,
        el("b", null, sel.count > 1 ? `${sel.name} ×${sel.count}` : sel.name),
        el("span", null, sel.desc),
        sel.bundle
          ? el("span", { class: "fm-chest__for" }, spriteIcon(bundleSackKey(sel.bundle.id), { scale: 0.75 }), `For the ${sel.bundle.name}`)
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
              { type: "button", class: "fm-chest__nudge", on: { click: () => scrollToReady() } },
              spriteIcon(bundleSackKey(ready.id)),
              el("span", null, "A bundle is ready!"),
            )
          : list.length
            ? has("ui.menu.chest")
              ? null
              : el("span", { class: "fm-chest__idle" }, "...")
            : el("span", { class: "fm-chest__idle" }, "Empty... shear a sheep!"),
      );
    }

    order ??= [...BUNDLES].sort((a, b) => Number(bundleReady(st, b)) - Number(bundleReady(st, a)));

    root.replaceChildren(
      grid,
      info,
      el(
        "p",
        { class: "fm-chest__lifetime fm-count" },
        spriteIcon("item.wool"),
        `Lifetime wool: ${st.totalWool}`,
        st.loom ? el("span", { class: "fm-chest__loom" }, phaseOf(st) === "ready" ? " · cloth's ready in the loom!" : " · loom: clack, clack...") : null,
      ),
      el(
        "section",
        { class: "fm-bundles", "aria-label": "Bundles" },
        el("h3", { class: "fm-bundles__title" }, "Bundles"),
        el("div", { class: "fm-bundles__list" }, ...order.map((b) => bundleCard(st, b))),
      ),
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
      caption = el(
        "p",
        { class: "fm-bundle__peek" },
        el("b", null, itemName(peeked)),
        got ? " · in the chest ✓" : hint ? ` · ${hint.charAt(0).toLowerCase()}${hint.slice(1)}` : " · still missing",
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
              has("ui.star") ? spriteIcon("ui.star") : "★",
              `×${times}`,
            )
          : null,
      ),
      el(
        "div",
        { class: "fm-bundle__row" },
        slots,
        el(
          "span",
          { class: "fm-bundle__reward", role: "img", "aria-label": `Reward: ${plural(b.reward, "cloth", "cloth")}` },
          `+${b.reward}`,
          spriteIcon("item.cloth"),
        ),
      ),
      caption,
      ready
        ? el(
            "button",
            { type: "button", class: "sv-btn sv-btn--primary fm-bundle__go", disabled: busy, on: { click: () => void complete(b) } },
            el("span", null, "Complete!"),
          )
        : null,
    );
  }

  function scrollToReady(): void {
    sfx("select");
    root.querySelector(".fm-bundle.is-ready")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  async function complete(b: Bundle): Promise<void> {
    if (busy) return;
    // Where everything is right now, for the little "jump into the sack" animation.
    const card = root.querySelector<HTMLElement>(`.fm-bundle[data-bundle="${b.id}"]`);
    const from = card
      ? [...card.querySelectorAll<HTMLElement>(".fm-bslot")].map((slot, i) => ({ key: b.items[i] ?? "", rect: slot.getBoundingClientRect() }))
      : [];
    const sack = card?.querySelector(".fm-bundle__sack")?.getBoundingClientRect() ?? null;
    busy = true;
    d.error(null);
    render();
    try {
      await api.completeBundle(b.id);
      sfx("reward");
      toast(`+${plural(b.reward, "cloth", "cloth")}`, { icon: "item.cloth" });
      celebrate(b, from, sack);
    } catch (err) {
      d.error(errorText(err));
    } finally {
      busy = false;
      render();
    }
  }

  function pick(item: ChestItem): void {
    if (item.id === "string" && selected === "string") {
      secretPokes++;
      if (secretPokes === 1) {
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
