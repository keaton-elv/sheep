// The barn: where sheared sheep (finished plans) retire, each with its little memory.

import "./barn.css";
import { sfx } from "../audio";
import { api, barnSheep, doneSheep, isRetired, serverNow, store } from "../net";
import { daysBetween, monthName, parseDayKey, stardewDate } from "../../shared/calendar";
import { CATEGORY_LABELS, LIMITS, RETIRE_AFTER_MS, type FarmState, type Sheep } from "../../shared/types";
import { originalStamps } from "./animal-common";
import { categoryIcon, farmNow, friendly, sheepPortrait } from "./calendar-util";
import { confirmDialog, el, frameIcon, heartsEl, openDialog, openMenu, plural, promptDialog, registerMenu, relativeDays, toast, type DialogHandle } from "./dom";
import { originalPlanBadge } from "./stamp";

const DAY_MS = 24 * 60 * 60 * 1000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const QUIPS = [
  "The auto-grabber is on strike again...",
  "Somebody left a truffle in the corner. Suspicious...",
  "A warm, cat-shaped dent in the hay. Snickers was here.",
  "Old beams, warm hay. Built the timeless way...",
  "Baa... (from somewhere in the dark)",
];

export function initBarn(): void {
  registerMenu("barn", () => openBarn());
}

function shearedDate(s: Sheep): Date {
  return new Date(s.shearedAt ?? Date.now());
}

function openBarn(): void {
  const root = el("div", { class: "fm-barn fm-menu" });
  openDialog({ title: "The Barn", className: "fm-barn-dialog fm-menu", body: root, onClose: () => off() });
  sfx("door", { volume: 0.5 });
  const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)]!;

  const render = () => {
    const st = store.state;
    root.replaceChildren(...content(st, quip).filter((n): n is HTMLElement => n !== null));
  };
  const off = store.changed.on(render);
  render();
}

function content(st: FarmState | null, quip: string): (HTMLElement | null)[] {
  if (!st) return [el("p", { class: "fm-barn__loading" }, "Creak...")];
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
        el("p", { class: "sv-say" }, "Quiet in here... Shear a sheep and its memory moves in."),
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
          el("h3", null, "Still grazing"),
          list(resting, (s) => {
            const left = Math.max(1, Math.ceil(((s.shearedAt ?? now) + RETIRE_AFTER_MS - now) / DAY_MS));
            return left === 1 ? "Moves in tomorrow" : `Moves in ${left} days`;
          }),
        )
      : null,
    el(
      "section",
      { class: "fm-barn__section" },
      el("h3", null, "Memories"),
      memories.length
        ? list(memories, () => null)
        : el("p", { class: "fm-barn__hint" }, "Nobody yet... (they graze 3 days first)"),
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
        originalStamps(s) > 0 ? originalPlanBadge(1, { inline: true }) : null,
      ),
      extra ? el("span", { class: "fm-barn__extra" }, extra) : null,
      el("span", { class: `fm-barn__memory ${s.memory ? "" : "is-empty"}` }, s.memory ? `“${s.memory}”` : "No memory yet..."),
      s.pets > 0 ? heartsEl(s.pets) : null,
    ),
  );
}

/** A sheep's memory page: what happened, when, and the chance to write it down. */
export function openMemory(id: string): void {
  const start = store.sheep(id);
  if (!start) {
    toast("That sheep wandered off...");
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
            `Un-shear “${s.name}”? It's a plan again, and ${plural(w, "wool", "wool")} leaves the chest.`,
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
            title: "A little memory...",
            label: "What was the best part?",
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
      body.replaceChildren(el("p", { class: "sv-say" }, "This sheep wandered off..."));
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
          el("p", { class: "sv-say" }, "Woolly again... back out grazing!"),
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
  // Same rule as the sheep card: stamped while it's on its ORIGINAL PLAN (no count, just the stamp).
  const stamped = originalStamps(s) > 0;

  return [
    el(
      "div",
      { class: "fm-mem__top" },
      el(
        "div",
        { class: "fm-mem__pic" },
        sheepPortrait(s, { scale: 2 }),
        stamped ? originalPlanBadge(1) : null,
      ),
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
    resting ? el("p", { class: "fm-mem__resting" }, `Grazing ${plural(left, "more day")}, then into the barn.`) : null,
    el("h3", null, "Memory"),
    s.memory
      ? el("blockquote", { class: "fm-mem__memory" }, s.memory)
      : el("p", { class: "fm-mem__memory is-empty" }, "No memory yet..."),
    s.notes ? el("h3", null, "Notes") : null,
    s.notes ? el("p", { class: "fm-mem__notes" }, s.notes) : null,
    link
      ? el("p", { class: "fm-mem__link" }, el("a", { href: link, target: "_blank", rel: "noopener noreferrer" }, prettyLink(link)))
      : null,
    s.date
      ? el(
          "button",
          { type: "button", class: "fm-mem__cal", on: { click: () => openMenu("calendar", s.date) } },
          "On the calendar ›",
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
