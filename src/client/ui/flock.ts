// The flock list: every sheep in the pasture at a glance, so you can find one fast on a phone.
// Woolly sheep (plans still to do) first, then the freshly sheared ones resting before the barn.
// Tap a row to open that sheep's card (and it pops a "!" on the farm so you can spot it).

import "./flock.css";
import { sfx } from "../audio";
import { sheepEmote } from "../entities/sheep";
import { barnSheep, doneSheep, isLamb, pastureSheep, serverNow, store } from "../net";
import { dayKey, daysBetween, parseDayKey } from "../../shared/calendar";
import { CATEGORY_LABELS, RETIRE_AFTER_MS, type Sheep } from "../../shared/types";
import { crispPx, farmMoment, originalStamps, realDateLabel } from "./animal-common";
import { SheepSprite, sheepPortraitIcon } from "./animal-sprite";
import { el, heartsEl, openDialog, openMenu, plural, registerMenu, relativeDays, spriteIcon, type DialogHandle } from "./dom";
import { categoryIcon } from "./marnie-art";
import { originalPlanBadge } from "./stamp";

export function initFlock(): void {
  registerMenu("flock", () => openFlock());
}

// ---------- sorting & searching ----------

type SortKey = "soonest" | "loved" | "newest";

/** `short` is what a phone shows, so all three chips fit on one row at 360px. */
const SORTS: readonly { key: SortKey; label: string; short: string }[] = [
  { key: "soonest", label: "Soonest date", short: "Soonest" },
  { key: "loved", label: "Most loved", short: "Loved" },
  { key: "newest", label: "Newest", short: "Newest" },
];

const SORT_STORAGE = "farm.flock.sort";
/** The search box shows up once the pasture holds more sheep than this. */
const SEARCH_AFTER = 8;

function loadSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_STORAGE);
    if (v === "soonest" || v === "loved" || v === "newest") return v;
  } catch {
    // private mode
  }
  return "soonest";
}

function saveSort(v: SortKey): void {
  try {
    localStorage.setItem(SORT_STORAGE, v);
  } catch {
    // private mode
  }
}

function dateValue(s: Sheep): number {
  const d = s.date ? parseDayKey(s.date) : null;
  return d ? d.getTime() : Number.POSITIVE_INFINITY;
}

const byNewest = (a: Sheep, b: Sheep) => b.createdAt - a.createdAt;
const bySoonest = (a: Sheep, b: Sheep) => dateValue(a) - dateValue(b) || byNewest(a, b);

function sortWoolly(list: Sheep[], key: SortKey): Sheep[] {
  const out = [...list];
  if (key === "newest") out.sort(byNewest);
  else if (key === "loved") out.sort((a, b) => b.pets - a.pets || bySoonest(a, b));
  else out.sort(bySoonest);
  return out;
}

function sortResting(list: Sheep[], key: SortKey): Sheep[] {
  const out = [...list];
  if (key === "loved") out.sort((a, b) => b.pets - a.pets || (b.shearedAt ?? 0) - (a.shearedAt ?? 0));
  else out.sort((a, b) => (b.shearedAt ?? 0) - (a.shearedAt ?? 0)); // most recently done first
  return out;
}

/** Lowercase, accent-free text for forgiving search ("creme" finds "Crème brûlée"). */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function matches(s: Sheep, q: string): boolean {
  if (!q) return true;
  return fold(`${s.name} ${s.notes} ${CATEGORY_LABELS[s.category] ?? ""}`).includes(q);
}

// ---------- the dialog ----------

let openHandle: DialogHandle | null = null;

function openFlock(): void {
  if (openHandle) return; // already open
  let sort = loadSort();
  let query = "";

  const counts = el("p", { class: "fl-counts", "aria-live": "polite" });

  // Sort chips: real radio buttons (arrow keys + screen readers just work).
  const sortGroup = el("div", { class: "fl-sorts", role: "radiogroup", "aria-label": "Sort" });
  for (const { key, label, short } of SORTS) {
    const input = el("input", { type: "radio", name: "fl-sort", value: key, class: "visually-hidden", "aria-label": label });
    input.checked = key === sort;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      sort = key;
      saveSort(key);
      sfx("blip");
      renderList();
    });
    const face =
      short === label
        ? el("span", { class: "fl-chip__face" }, label)
        : el("span", { class: "fl-chip__face" }, el("span", { class: "fl-chip__long" }, label), el("span", { class: "fl-chip__short", "aria-hidden": "true" }, short));
    sortGroup.append(el("label", { class: "fl-chip", title: label }, input, face));
  }

  const searchInput = el("input", {
    class: "sv-input fl-search__input",
    type: "search",
    placeholder: "Find a sheep…",
    "aria-label": "Find a sheep by name",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterKeyHint: "search",
  });
  searchInput.addEventListener("input", () => {
    query = fold(searchInput.value.trim());
    renderList();
  });
  searchInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && searchInput.value) {
      // Clear the search first; a second Escape closes the dialog.
      ev.stopPropagation();
      ev.preventDefault();
      searchInput.value = "";
      query = "";
      renderList();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      searchInput.blur(); // put the phone keyboard away so the results are visible
    }
  });
  const search = el("div", { class: "fl-search", hidden: true }, searchInput);

  // Sort + search stay pinned at the top while the list scrolls (it's a sibling of the list so
  // position: sticky can travel the whole way down).
  const bar = el("div", { class: "fl-bar" }, sortGroup, search);
  const list = el("div", { class: "fl-list" });
  const footer = el("div", { class: "fl-footer" });

  const dialog = openDialog({
    title: "Flock",
    className: "fl-dialog",
    body: el("div", { class: "fl", style: `--ipx: ${crispPx(1.5, 2)}` }, counts, bar, list, footer),
    onClose: () => {
      openHandle = null;
      unsubscribe();
      emptyLamb?.stop();
    },
    buttons: [
      {
        label: "Buy a sheep",
        kind: "primary",
        icon: "ui.sheep",
        onClick: (d) => {
          d.close();
          openMenu("ranch");
        },
      },
    ],
  });
  openHandle = dialog;

  let emptyLamb: SheepSprite | null = null;
  /** Built rows by sheep id: live updates and search keystrokes only rebuild rows that changed. */
  const rowCache = new Map<string, { sig: string; el: HTMLElement }>();
  const unsubscribe = store.changed.on(() => renderList());
  renderList();

  function goTo(id: string): void {
    dialog.close();
    openMenu("sheep", id);
    sheepEmote(id, "exclaim");
  }

  function renderList(): void {
    const nowMs = serverNow();
    const moment = farmMoment();
    const pasture = pastureSheep();
    const woolly = pasture.filter((s) => s.shearedAt === null);
    const resting = pasture.filter((s) => s.shearedAt !== null);
    const done = doneSheep().length;
    const inBarn = barnSheep().length;

    // Header counts: "7 plans waiting · 2 done"
    counts.textContent = `${woolly.length ? plural(woolly.length, "plan") : "No plans"} waiting · ${done} done`;

    // Controls only make sense with sheep to sort/search.
    counts.hidden = pasture.length === 0;
    const wantSearch = pasture.length > SEARCH_AFTER;
    if (!wantSearch && query) {
      searchInput.value = "";
      query = "";
    }
    search.hidden = !wantSearch;
    sortGroup.hidden = pasture.length < 2;
    bar.hidden = search.hidden && sortGroup.hidden;

    const rows: Node[] = [];
    if (pasture.length === 0) {
      rows.push(emptyState(store.state?.sheep.length ? "allDone" : "none"));
    } else {
      const w = sortWoolly(woolly.filter((s) => matches(s, query)), sort);
      const r = sortResting(resting.filter((s) => matches(s, query)), sort);
      if (!w.length && !r.length) {
        rows.push(el("p", { class: "fl-empty fl-empty--search" }, `No “${searchInput.value.trim()}”... baa?`));
      }
      if (w.length && r.length) rows.push(el("h3", { class: "fl-group" }, "To do"));
      for (const s of w) rows.push(row(s, nowMs, moment.now));
      if (r.length) {
        rows.push(el("h3", { class: "fl-group" }, "Done!"));
        for (const s of r) rows.push(row(s, nowMs, moment.now));
      }
    }
    if (pasture.length > 0 && emptyLamb) {
      emptyLamb.stop();
      emptyLamb = null;
    }

    // Keep keyboard focus on the same sheep across live re-renders.
    const focusedId = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement.dataset.id : undefined;
    list.replaceChildren(...rows);
    if (focusedId) list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focusedId)}"]`)?.focus();

    // Memories in the barn
    footer.replaceChildren();
    if (inBarn > 0) {
      const barn = el("button", { class: "fl-barnlink", type: "button" }, `${plural(inBarn, "memory", "memories")} in the barn`, el("span", { "aria-hidden": "true" }, " →"));
      barn.addEventListener("click", () => {
        sfx("select");
        dialog.close();
        openMenu("barn");
      });
      footer.append(barn);
    }
  }

  function emptyState(kind: "none" | "allDone"): HTMLElement {
    if (!emptyLamb) {
      emptyLamb = new SheepSprite(() => {});
      emptyLamb.set({ look: "lamb", golden: false, asleep: false, hat: null, label: "A lonely lamb says baa" });
    }
    const text = kind === "none" ? "No sheep yet... baa?" : "All done! Everyone's in the barn...";
    return el("div", { class: "fl-empty" }, el("div", { class: "fl-empty__lamb" }, emptyLamb.button), el("p", { class: "fl-empty__text" }, text));
  }

  function row(s: Sheep, nowMs: number, now: Date): HTMLElement {
    const sheared = s.shearedAt !== null;
    const lamb = !sheared && isLamb(s, nowMs);
    const moveInDays = s.shearedAt !== null ? daysBetween(new Date(nowMs), new Date(s.shearedAt + RETIRE_AFTER_MS)) : 0;
    const stamped = originalStamps(s) > 0;
    const sig = [s.name, s.category, s.date, s.pets, s.golden, s.hat, s.shearedAt, lamb, moveInDays, stamped, dayKey(now)].join("|");
    const cached = rowCache.get(s.id);
    if (cached && cached.sig === sig) return cached.el;
    const cat = CATEGORY_LABELS[s.category] ?? "Other";

    // When: the plan's date, or how long ago it was sheared.
    const meta: (Node | string)[] = [];
    const spoken: string[] = [cat];
    const badges: HTMLElement[] = [];
    if (sheared && s.shearedAt !== null) {
      const ago = daysBetween(new Date(s.shearedAt), now);
      const when = `Sheared ${relativeDays(-ago)}`;
      meta.push(el("span", { class: "fl-when" }, when));
      spoken.push(when, moveInDays <= 0 ? "moves into the barn later today" : `moves into the barn ${relativeDays(moveInDays)}`);
    } else {
      const d = s.date ? parseDayKey(s.date) : null;
      if (d) {
        const days = daysBetween(now, d);
        const label = `${realDateLabel(d, d.getFullYear() !== now.getFullYear())} · ${relativeDays(days)}`;
        meta.push(el("span", { class: "fl-when" }, label));
        spoken.push(label);
        if (days === 0) badges.push(el("span", { class: "fl-badge fl-badge--today" }, "Today!"));
        else if (days < 0) badges.push(el("span", { class: "fl-badge fl-badge--late" }, "Did it happen?"));
      } else {
        meta.push(el("span", { class: "fl-when fl-when--none" }, "No date"));
        spoken.push("no date yet");
      }
    }
    if (lamb) badges.push(el("span", { class: "fl-badge fl-badge--lamb" }, "Lamb"));
    if (s.golden) badges.push(el("span", { class: "fl-badge fl-badge--gold" }, spriteIcon("ui.star"), "Golden"));
    if (stamped) badges.push(originalPlanBadge(undefined, { inline: true }));
    spoken.push(`${s.pets / 2} of 5 hearts`);
    if (lamb) spoken.push("a lamb");
    if (s.golden) spoken.push("golden");
    if (stamped) spoken.push("ORIGINAL PLAN");

    const b = el(
      "button",
      {
        class: `fl-row${sheared ? " is-sheared" : ""}${lamb ? " is-lamb" : ""}${s.golden ? " is-golden" : ""}`,
        type: "button",
        dataset: { id: s.id },
        "aria-label": `${s.name}. ${spoken.join(", ")}.`,
      },
      el("span", { class: "fl-pic" }, sheepPortraitIcon(s, { now: nowMs })),
      el("span", { class: "fl-name" }, s.name),
      el("span", { class: "fl-hearts" }, heartsEl(s.pets)),
      el("span", { class: "fl-meta" }, spriteIcon(categoryIcon(s.category), { class: "fl-cat", title: cat }), ...meta, ...badges),
    );
    const id = s.id;
    b.addEventListener("click", () => {
      sfx("select");
      goTo(id);
    });
    rowCache.set(id, { sig, el: b });
    return b;
  }
}
