// The barn: where sheared sheep (finished plans) retire, each with its little memory.

import "./barn.css";
import { sfx } from "../audio";
import { api, barnSheep, doneSheep, isRetired, serverNow, store } from "../net";
import { daysBetween, monthName, parseDayKey, stardewDate } from "../../shared/calendar";
import { CATEGORY_LABELS, LIMITS, RETIRE_AFTER_MS, type FarmState, type Sheep } from "../../shared/types";
import { categoryIcon, farmNow, friendly, sheepPortrait } from "./calendar-util";
import { confirmDialog, el, frameIcon, heartsEl, openDialog, openMenu, plural, promptDialog, registerMenu, relativeDays, toast, type DialogHandle } from "./dom";

const DAY_MS = 24 * 60 * 60 * 1000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const QUIPS = [
  "It smells like hay and good decisions in here.",
  "The auto-grabber is on strike again.",
  "Somebody left a truffle in the corner. Suspicious.",
  "Hay supply: plentiful. Marnie made sure.",
  "A Junimo was here. It left a tiny thank-you note.",
  "The heater hums. Every sheep is dreaming of you two.",
  "Shane says hi. He's not here for the chickens, promise.",
];

export function initBarn(): void {
  registerMenu("barn", () => openBarn());
}

/** "Baaaah Farm" -> "Baaaah Barn" (and "Moonlight Meadow" -> "Moonlight Meadow Barn"). */
export function barnName(farmName: string): string {
  const base = farmName.replace(/\s+farm$/i, "").trim();
  return `${base || farmName} Barn`;
}

function shearedDate(s: Sheep): Date {
  return new Date(s.shearedAt ?? Date.now());
}

function openBarn(): void {
  const root = el("div", { class: "fm-barn fm-menu" });
  const state = store.state;
  const d = openDialog({ title: state ? barnName(state.farmName) : "The Barn", className: "fm-barn-dialog fm-menu", body: root, onClose: () => off() });
  const title = d.box.querySelector(".sv-dialog__title");
  const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)]!;

  const render = () => {
    const st = store.state;
    if (title && st) title.textContent = barnName(st.farmName);
    root.replaceChildren(...content(st, quip).filter((n): n is HTMLElement => n !== null));
  };
  const off = store.changed.on(render);
  render();
}

function content(st: FarmState | null, quip: string): (HTMLElement | null)[] {
  if (!st) return [el("p", { class: "fm-barn__loading" }, "Opening the barn doors...")];
  const now = serverNow();
  const done = doneSheep(st);
  const byNewest = (a: Sheep, b: Sheep) => (b.shearedAt ?? 0) - (a.shearedAt ?? 0);
  const resting = done.filter((s) => !isRetired(s, now)).sort(byNewest);
  const memories = barnSheep(st).sort(byNewest);

  if (!done.length) {
    return [
      el(
        "div",
        { class: "fm-empty fm-barn__empty" },
        frameIcon("sheep", 13, 32, 32, { scale: 2 }),
        el("p", { class: "sv-say" }, "The barn is quiet... shear some sheep and their stories will live here."),
        el("p", { class: "fm-barn__hint" }, "Did a plan together? Grab the shears and give that sheep a trim!"),
      ),
    ];
  }

  const hearts = done.reduce((n, s) => n + s.pets, 0) / 2;
  const stats = el(
    "p",
    { class: "fm-barn__stats" },
    el("span", null, plural(done.length, "adventure")),
    el("span", { "aria-hidden": "true" }, "·"),
    el("span", null, `${st.totalWool} wool`),
    hearts >= 1 ? el("span", { "aria-hidden": "true" }, "·") : null,
    hearts >= 1 ? el("span", null, plural(Math.floor(hearts), "heart")) : null,
  );

  const list = (sheep: Sheep[], extra: (s: Sheep) => string | null) =>
    el("ul", { class: "fm-barn__list" }, ...sheep.map((s) => el("li", null, memoryRow(s, st, extra(s)))));

  return [
    stats,
    resting.length
      ? el(
          "section",
          { class: "fm-barn__section" },
          el("h3", null, "Resting in the pasture"),
          list(resting, (s) => {
            const left = Math.max(1, Math.ceil(((s.shearedAt ?? now) + RETIRE_AFTER_MS - now) / DAY_MS));
            return `Moves into the barn in ${plural(left, "day")}`;
          }),
        )
      : null,
    el(
      "section",
      { class: "fm-barn__section" },
      el("h3", null, "Memories"),
      memories.length
        ? list(memories, () => null)
        : el("p", { class: "fm-barn__hint" }, "No one's moved in yet. Sheared sheep graze in the pasture for 3 days first, so you can both admire them."),
    ),
    el("p", { class: "fm-quip" }, quip),
  ];
}

function memoryRow(s: Sheep, st: FarmState, extra: string | null): HTMLElement {
  const cat = categoryIcon(s.category);
  return el(
    "button",
    { type: "button", class: "fm-barn__row", on: { click: () => openMemory(s.id) } },
    el("span", { class: "fm-barn__icon" }, sheepPortrait(s)),
    el(
      "span",
      { class: "fm-barn__text" },
      el("span", { class: "fm-barn__name" }, s.name),
      el(
        "span",
        { class: "fm-barn__date" },
        cat,
        `Sheared ${stardewDate(shearedDate(s), st.foundedAt)}`,
        s.golden ? el("span", { class: "fm-barn__gold" }, " · golden!") : null,
      ),
      extra ? el("span", { class: "fm-barn__extra" }, extra) : null,
      el("span", { class: `fm-barn__memory ${s.memory ? "" : "is-empty"}` }, s.memory ? `“${s.memory}”` : "No memory yet. Tap to write one!"),
      s.pets > 0 ? heartsEl(s.pets) : null,
    ),
  );
}

/** A sheep's memory page: what happened, when, and the chance to write it down. */
export function openMemory(id: string): void {
  const start = store.sheep(id);
  if (!start) {
    toast("That sheep wandered off somewhere...");
    return;
  }
  const body = el("div", { class: "fm-mem fm-menu" });
  let memLabel: HTMLElement | null = null;

  const current = () => store.sheep(id) ?? null;

  const d: DialogHandle = openDialog({
    title: start.name,
    className: "fm-mem-dialog fm-menu",
    body,
    buttons: [
      {
        label: "Let it back out",
        kind: "danger",
        onClick: async () => {
          const s = current();
          if (!s || s.shearedAt === null) return;
          const w = s.golden ? 2 : 1;
          const ok = await confirmDialog(
            `Un-shear “${s.name}”? Its wool grows back, it becomes a plan again, and ${w} wool leaves the chest.`,
            { yes: "Let it out", no: "Keep it", danger: true },
          );
          if (!ok) return false;
          await friendly(api.unshear(id));
          sfx("baa");
          toast(`${s.name} is woolly again!`, { icon: "item.wool" });
        },
      },
      {
        label: start.memory ? "Edit memory" : "Write memory",
        kind: "primary",
        onClick: async () => {
          const s = current();
          if (!s) return;
          const text = await promptDialog({
            title: "A little memory",
            label: `What happened at “${s.name}”? What was the best part?`,
            value: s.memory,
            placeholder: "We got lost, found a bakery, best day ever...",
            multiline: true,
            maxLength: LIMITS.memory,
            ok: "Save it",
          });
          if (text === null || text === s.memory) return false;
          await friendly(api.updateSheep(id, { memory: text }));
          sfx("sparkle");
          toast(text ? "Memory saved!" : "Memory cleared", { icon: "ui.heart.full" });
          return false;
        },
      },
    ],
    onClose: () => off(),
  });
  memLabel = d.box.querySelector(".sv-dialog__buttons .sv-btn--primary span");
  const titleEl = d.box.querySelector(".sv-dialog__title");
  const buttons = d.box.querySelector<HTMLElement>(".sv-dialog__buttons");
  // (`hidden` loses to the buttons row's display:flex, so toggle display directly.)
  const showButtons = (show: boolean) => {
    if (buttons) buttons.style.display = show ? "" : "none";
  };

  const render = () => {
    const st = store.state;
    const s = current();
    if (!st || !s) {
      body.replaceChildren(el("p", { class: "sv-say" }, "This sheep wandered off somewhere... (it's not on the farm anymore)."));
      showButtons(false);
      return;
    }
    if (titleEl) titleEl.textContent = s.name;
    if (s.shearedAt === null) {
      body.replaceChildren(
        el(
          "div",
          { class: "fm-empty" },
          sheepPortrait(s, { scale: 2 }),
          el("p", { class: "sv-say" }, `${s.name} is woolly again and back out grazing. A plan once more!`),
        ),
      );
      showButtons(false);
      return;
    }
    showButtons(true);
    if (memLabel) memLabel.textContent = s.memory ? "Edit memory" : "Write memory";
    body.replaceChildren(...memoryPage(s, st).filter((n): n is HTMLElement => n !== null));
  };
  const off = store.changed.on(render);
  render();
}

function memoryPage(s: Sheep, st: FarmState): (HTMLElement | null)[] {
  const sheared = shearedDate(s);
  const now = serverNow();
  const resting = !isRetired(s, now);
  const left = Math.max(1, Math.ceil(((s.shearedAt ?? now) + RETIRE_AFTER_MS - now) / DAY_MS));
  const planned = s.date ? parseDayKey(s.date) : null;
  const cat = categoryIcon(s.category, 1);
  const real = `${DOW[sheared.getDay()]}, ${monthName(sheared.getMonth())} ${sheared.getDate()}, ${sheared.getFullYear()}`;
  const ago = relativeDays(daysBetween(farmNow(), sheared));
  const link = /^https?:\/\//i.test(s.link) ? s.link : "";

  return [
    el(
      "div",
      { class: "fm-mem__top" },
      el("div", { class: "fm-mem__pic" }, sheepPortrait(s, { scale: 2 })),
      el(
        "div",
        { class: "fm-mem__facts" },
        el("p", { class: "fm-mem__cat" }, cat, CATEGORY_LABELS[s.category] ?? "Plan", s.golden ? el("span", { class: "fm-barn__gold" }, " · golden sheep! (2 wool)") : null),
        heartsEl(s.pets),
        el("p", { class: "fm-mem__when" }, el("b", null, `Sheared ${stardewDate(sheared, st.foundedAt)}`)),
        el("p", { class: "fm-mem__real" }, `${real} · ${ago}`),
        planned ? el("p", { class: "fm-mem__real" }, `Planned for ${stardewDate(planned, st.foundedAt)}`) : null,
      ),
    ),
    resting ? el("p", { class: "fm-mem__resting" }, `Grazing in the pasture for ${plural(left, "more day")}, then it moves into the barn.`) : null,
    el("h3", null, "Memory"),
    s.memory
      ? el("blockquote", { class: "fm-mem__memory" }, s.memory)
      : el("p", { class: "fm-mem__memory is-empty" }, "No memory written yet. What was the best part? Future you two will want to know."),
    s.notes ? el("h3", null, "Notes") : null,
    s.notes ? el("p", { class: "fm-mem__notes" }, s.notes) : null,
    link
      ? el("p", { class: "fm-mem__link" }, el("a", { href: link, target: "_blank", rel: "noopener noreferrer" }, prettyLink(link)))
      : null,
    s.date
      ? el(
          "button",
          { type: "button", class: "fm-mem__cal", on: { click: () => openMenu("calendar", s.date) } },
          "See it on the calendar ›",
        )
      : null,
  ];
}

function prettyLink(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const short = `${u.hostname.replace(/^www\./, "")}${path}`;
    return short.length > 48 ? `${short.slice(0, 46)}…` : short;
  } catch {
    return url;
  }
}
