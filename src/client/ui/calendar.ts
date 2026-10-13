// The billboard: a paper calendar of a real month pinned to a wooden board (the real Stardew
// billboard art when it's loaded). Days with plans get tiny sheep faces; tap a day to see
// (or add) its plans.

import "./calendar.css";
import { sfx } from "../audio";
import { isRetired, store } from "../net";
import { capitalize, dayKey, daysBetween, monthName, parseDayKey, seasonOf, stardewDate } from "../../shared/calendar";
import { CATEGORY_LABELS, type FarmState, type Sheep } from "../../shared/types";
import { has, size } from "../engine/sprites";
import { isBigThursday, THURSDAY } from "./animal-lore";
import { openMemory } from "./barn";
import { billboardSkin, registerCalendarArt } from "./calendar-art";
import { festivalsOn, type Festival } from "./calendar-festivals";
import { categoryIcon, farmNow, sheepHead } from "./calendar-util";
import { el, heartsEl, openDialog, openMenu, plural, registerMenu, relativeDays, spriteIcon } from "./dom";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MAX_HEADS = 2;
const UPCOMING = 5;

const QUIET_DAY = [
  "Nothing planned... the sheep are suspiciously free.",
  "Wide open. Perfect for an adventure... or a nap.",
  "Wide open... so, a sketching meetup?",
  "Nothing yet. Karaoke? ...No? No.",
  "Zzz...",
];

/** Mid-November into early December, San Francisco's street ginkgos go gold. */
function ginkgoSeason(d: Date): boolean {
  return (d.getMonth() === 10 && d.getDate() >= 10) || (d.getMonth() === 11 && d.getDate() <= 10);
}

/**
 * Some weeks, Thursday is THURSDAY!!!!! Decided per date (same as the new-day banner and the
 * sheep), so the column header gets excited when this week's Thursday is one of those.
 */
function thursdayHype(today: Date): boolean {
  const monFirst = (today.getDay() + 6) % 7;
  return isBigThursday(new Date(today.getFullYear(), today.getMonth(), today.getDate() - monFirst + 3, 12));
}

export function initCalendar(): void {
  registerCalendarArt();
  // Optional arg: a "YYYY-MM-DD" day to jump to and select.
  registerMenu("calendar", (arg?: unknown) => openCalendar(typeof arg === "string" ? arg : undefined));
}

/** Plans grouped by their day key; woolly ones first. */
function plansByDay(state: FarmState | null): Map<string, Sheep[]> {
  const map = new Map<string, Sheep[]>();
  if (!state) return map;
  for (const s of state.sheep) {
    if (!s.date) continue;
    let list = map.get(s.date);
    if (!list) map.set(s.date, (list = []));
    list.push(s);
  }
  for (const list of map.values()) {
    list.sort((a, b) => Number(a.shearedAt !== null) - Number(b.shearedAt !== null) || a.createdAt - b.createdAt);
  }
  return map;
}

/** Open a plan: a sheep still in the pasture gets its info card, a barn sheep its memory. */
function openPlan(s: Sheep): void {
  if (isRetired(s)) openMemory(s.id);
  else openMenu("sheep", s.id);
}

function openCalendar(focus?: string): void {
  const today = farmNow();
  const todayKey = dayKey(today);
  const focusDate = (focus ? parseDayKey(focus) : null) ?? today;
  let viewY = focusDate.getFullYear();
  let viewM = focusDate.getMonth();
  let selected: string | null = dayKey(focusDate);
  let showUndated = false;
  let showOverdue = false;
  const hype = thursdayHype(today);

  const root = el("div", { class: "fm-cal fm-menu" });
  const real = billboardSkin();
  const d = openDialog({ className: `fm-cal-dialog fm-menu ${real ? "is-real" : ""}`, body: root, onClose: () => off() });
  d.box.setAttribute("aria-label", "Calendar");

  const go = (delta: number) => {
    const next = new Date(viewY, viewM + delta, 1, 12);
    viewY = next.getFullYear();
    viewM = next.getMonth();
    const sel = selected ? parseDayKey(selected) : null;
    if (!sel || sel.getFullYear() !== viewY || sel.getMonth() !== viewM) {
      selected = today.getFullYear() === viewY && today.getMonth() === viewM ? todayKey : null;
    }
    sfx("blip");
    render();
  };

  const jumpTo = (key: string) => {
    const date = parseDayKey(key);
    if (!date) return;
    viewY = date.getFullYear();
    viewM = date.getMonth();
    selected = key;
    sfx("select");
    render();
    root.querySelector(".fm-cal__paper")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  function render(): void {
    const state = store.state;
    const byDay = plansByDay(state);
    root.replaceChildren(
      el("div", { class: "fm-cal__left" }, paper(state, byDay)),
      el("div", { class: "fm-cal__right" }, dayPanel(state, byDay), upcoming(state)),
    );
  }

  // ---------- the paper calendar ----------

  function paper(state: FarmState | null, byDay: Map<string, Sheep[]>): HTMLElement {
    const season = seasonOf(new Date(viewY, viewM, 15, 12));
    const first = new Date(viewY, viewM, 1, 12);
    const offset = (first.getDay() + 6) % 7; // Monday-first
    const days = new Date(viewY, viewM + 1, 0, 12).getDate();
    const isThisMonth = today.getFullYear() === viewY && today.getMonth() === viewM;

    const grid = el("div", { class: "fm-cal__grid" });
    for (let i = 0; i < offset; i++) grid.appendChild(el("div", { class: "fm-cal__cell is-blank", "aria-hidden": "true" }));
    for (let day = 1; day <= days; day++) {
      const date = new Date(viewY, viewM, day, 12);
      const key = dayKey(date);
      const plans = byDay.get(key) ?? [];
      const fests = festivalsOn(date, state?.foundedAt);
      const mark = cellMark(fests);
      const woolly = plans.filter((p) => p.shearedAt === null).length;
      const label = [
        `${monthName(viewM)} ${day}`,
        key === todayKey ? "today" : "",
        plans.length ? plural(plans.length, "plan") : "",
        plans.length && woolly < plans.length ? `${plans.length - woolly} done` : "",
        ...fests.map((f) => f.name),
      ]
        .filter(Boolean)
        .join(", ");
      const heads = el("span", { class: "fm-cal__heads" });
      const shown = plans.length > MAX_HEADS ? MAX_HEADS - 1 : plans.length;
      for (const p of plans.slice(0, shown)) {
        heads.appendChild(el("span", { class: `fm-cal__face ${p.shearedAt !== null ? "is-done" : ""}` }, sheepHead(p.shearedAt !== null, { golden: p.golden })));
      }
      if (plans.length > shown) heads.appendChild(el("span", { class: "fm-cal__more" }, `+${plans.length - shown}`));

      const cell = el(
        "button",
        {
          type: "button",
          class: [
            "fm-cal__cell",
            key === todayKey ? "is-today" : "",
            key === selected ? "is-selected" : "",
            plans.length ? "has-plans" : "",
            mark ? "is-festival" : "",
            daysBetween(today, date) < 0 ? "is-past" : "",
            date.getDay() === 0 || date.getDay() === 6 ? "is-weekend" : "",
          ].join(" "),
          "aria-label": label,
          "aria-pressed": String(key === selected),
          title: fests.length ? fests.map((f) => f.name).join(" · ") : undefined,
        },
        el("span", { class: "fm-cal__num" }, String(day)),
        mark,
        plans.length ? heads : null,
      );
      cell.addEventListener("click", () => {
        selected = key;
        sfx("select");
        render();
        // On phones the day panel sits below the grid: nudge it into view.
        if (matchMedia("(max-width: 699px)").matches) root.querySelector(".fm-cal__day")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      grid.appendChild(cell);
    }
    const trailing = (7 - ((offset + days) % 7)) % 7;
    for (let i = 0; i < trailing; i++) grid.appendChild(el("div", { class: "fm-cal__cell is-blank", "aria-hidden": "true" }));

    const nav = (label: string, delta: number, aria: string) =>
      el("button", { type: "button", class: "fm-cal__nav", "aria-label": aria, on: { click: () => go(delta) } }, label);

    const sheet = el(
      "div",
      { class: `fm-cal__paper is-${season}` },
      el("div", { class: "fm-cal__head" }, nav("‹", -1, "Previous month"), el("h2", { class: "fm-cal__title" }, el("span", { class: "fm-cal__season" }, capitalize(season)), el("span", { class: "fm-cal__month" }, `${monthName(viewM)} ${viewY}`)), nav("›", 1, "Next month")),
      el("div", { class: "fm-cal__dow", "aria-hidden": "true" }, ...DOW.map((x, i) => dowLabel(x, i))),
      grid,
      isThisMonth
        ? null
        : el("button", { type: "button", class: "fm-cal__today", on: { click: () => jumpTo(todayKey) } }, "Today"),
    );
    addSwipe(sheet, go);
    return sheet;
  }

  /** Column headers: a tiny glass on Wine Wednesday, and some weeks Thursday gets excited. */
  function dowLabel(x: string, i: number): HTMLElement {
    if (i === 2) return el("span", { class: "fm-cal__wed", title: "Wine Wednesday" }, x, spriteIcon("ui.wineglass", { class: "fm-cal__wine" }));
    if (i === 3 && hype) return el("span", { class: "fm-cal__thu" }, "Thu!!");
    return el("span", { class: i >= 5 ? "is-weekend" : "" }, x);
  }

  // ---------- the selected day ----------

  function dayPanel(state: FarmState | null, byDay: Map<string, Sheep[]>): HTMLElement {
    if (!selected) {
      return el("div", { class: "fm-note fm-cal__day is-hint" }, el("p", null, "Tap a day..."));
    }
    const date = parseDayKey(selected);
    if (!date) return el("div");
    const key = selected;
    const plans = byDay.get(key) ?? [];
    const rel = daysBetween(today, date);
    const fests = festivalsOn(date, state?.foundedAt);
    const sub = [state ? stardewDate(date, state.foundedAt) : capitalize(seasonOf(date)), relativeDays(rel)].join(" · ");

    const list = el("ul", { class: "fm-cal__plans" });
    for (const p of plans) list.appendChild(el("li", null, planRow(p, null)));

    let quip = QUIET_DAY[(date.getDate() + date.getMonth()) % QUIET_DAY.length]!;
    if (ginkgoSeason(date) && date.getDate() % 2 === 0) quip = "Wide open... perfect for a ginkgo walk.";
    if (date.getDay() === 3) quip = "Wine Wednesday... and wide open.";
    const big = isBigThursday(date);
    if (big) quip = "...and nothing planned?!";
    if (rel < 0) quip = "Nothing happened here... or nobody wrote it down.";
    const dayName = big ? THURSDAY : DOW_FULL[date.getDay()];

    return el(
      "div",
      { class: "fm-note fm-cal__day" },
      el(
        "h3",
        { class: "fm-cal__dayname" },
        `${dayName}${big ? "" : ","} ${monthName(date.getMonth())} ${date.getDate()}`,
        date.getDay() === 3 ? spriteIcon("ui.wineglass", { class: "fm-cal__wine" }) : null,
      ),
      el("p", { class: "fm-cal__sub" }, sub),
      ...fests.map((f) =>
        el(
          "p",
          { class: `fm-cal__fest ${f.sf ? "is-sf" : ""} ${f.quiet ? "is-quiet" : ""}` },
          f.quiet && !iconKey(f) ? festDot(f, false) : festIcon(f, false),
          el("span", null, el("b", null, f.name), " ", f.note),
        ),
      ),
      plans.length ? list : el("p", { class: "fm-cal__quiet" }, state ? quip : "Pinning it up..."),
      state
        ? el(
            "button",
            {
              type: "button",
              class: "sv-btn sv-btn--primary fm-cal__add",
              on: { click: () => openMenu("ranch", { date: key }) },
            },
            sheepHead(false),
            el("span", null, plans.length ? "Plan another" : "Plan something"),
          )
        : null,
    );
  }

  // ---------- coming up / undated / overdue ----------

  function upcoming(state: FarmState | null): HTMLElement | null {
    if (!state) return null;
    const woolly = state.sheep.filter((s) => s.shearedAt === null);
    const dated: { s: Sheep; d: Date; rel: number }[] = [];
    for (const s of woolly) {
      const date = s.date ? parseDayKey(s.date) : null;
      if (date) dated.push({ s, d: date, rel: daysBetween(today, date) });
    }
    dated.sort((a, b) => a.rel - b.rel || a.s.createdAt - b.s.createdAt);
    const soon = dated.filter((x) => x.rel >= 0).slice(0, UPCOMING);
    const overdue = dated.filter((x) => x.rel < 0);
    const undated = woolly.filter((s) => !s.date).sort((a, b) => b.createdAt - a.createdAt);

    const note = el("div", { class: "fm-note fm-cal__soon" }, el("h3", null, "Coming up"));
    if (soon.length) {
      const ul = el("ul", { class: "fm-cal__plans" });
      for (const x of soon) {
        ul.appendChild(el("li", null, planRow(x.s, el("span", { class: `fm-chip ${x.rel <= 1 ? "is-soon" : ""}` }, relativeDays(x.rel)), true)));
      }
      note.appendChild(ul);
    } else {
      note.appendChild(el("p", { class: "fm-cal__quiet" }, "Nothing dated yet..."));
    }

    if (overdue.length) {
      note.appendChild(
        disclosure(
          `${plural(overdue.length, "plan")} slipped by...`,
          showOverdue,
          (v) => {
            showOverdue = v;
            render();
          },
          overdue.map((x) => planRow(x.s, el("span", { class: "fm-chip is-late" }, relativeDays(x.rel)), true)),
        ),
      );
    }
    if (undated.length) {
      note.appendChild(
        disclosure(
          `Someday... (${undated.length})`,
          showUndated,
          (v) => {
            showUndated = v;
            render();
          },
          undated.map((s) => planRow(s, null)),
        ),
      );
    }
    return note;
  }

  function planRow(s: Sheep, trailing: HTMLElement | null, showDate = false): HTMLElement {
    const date = s.date ? parseDayKey(s.date) : null;
    const meta: (string | HTMLElement)[] = [];
    const cat = categoryIcon(s.category);
    if (cat) meta.push(cat);
    meta.push(CATEGORY_LABELS[s.category] ?? "Plan");
    if (showDate && date && store.state) meta.push(` · ${stardewDate(date, store.state.foundedAt).replace(/, Year \d+$/, "")}`);
    if (s.shearedAt !== null) meta.push(el("span", { class: "fm-cal__done" }, " · ✂ done!"));
    return el(
      "button",
      { type: "button", class: `fm-plan ${s.shearedAt !== null ? "is-done" : ""}`, on: { click: () => openPlan(s) } },
      el("span", { class: "fm-plan__icon" }, sheepHead(s.shearedAt !== null, { golden: s.golden })),
      el(
        "span",
        { class: "fm-plan__text" },
        el("span", { class: "fm-plan__name" }, s.name),
        el("span", { class: "fm-plan__meta" }, ...meta),
      ),
      trailing ?? (s.pets > 0 ? heartsEl(s.pets) : null),
    );
  }

  function disclosure(label: string, open: boolean, set: (v: boolean) => void, rows: HTMLElement[]): HTMLElement {
    const id = `fm-disc-${Math.random().toString(36).slice(2, 8)}`;
    return el(
      "div",
      { class: `fm-disc ${open ? "is-open" : ""}` },
      el(
        "button",
        { type: "button", class: "fm-disc__toggle", "aria-expanded": String(open), "aria-controls": id, on: { click: () => set(!open) } },
        el("span", { class: "fm-disc__caret", "aria-hidden": "true" }, open ? "▾" : "▸"),
        el("span", null, label),
      ),
      open ? el("div", { id }, el("ul", { class: "fm-cal__plans" }, ...rows.map((r) => el("li", null, r)))) : null,
    );
  }

  const off = store.changed.on(render);
  render();
}

/**
 * What a day cell shows for its events: one marker at most. The first flagged event gets its
 * flag (or what shows up on the farm); otherwise small stuff gets a dot; otherwise nothing.
 */
function cellMark(fests: Festival[]): HTMLElement | null {
  const flag = fests.find((f) => (f.mark ?? "flag") === "flag");
  if (flag) return festIcon(flag, true);
  const dot = fests.find((f) => f.mark === "dot");
  return dot ? festDot(dot, true) : null;
}

/** The event's farm sprite, if it has one and it's registered. */
function iconKey(fest: Festival): string | null {
  return fest.icon && has(fest.icon) ? fest.icon : null;
}

/** A little colored square: small stuff, and later days of a multi-day event. */
function festDot(fest: Festival, small: boolean): HTMLElement {
  const kind = fest.star ? "is-star" : fest.sf ? "is-sf" : fest.tint ? "" : fest.quiet ? "is-quiet" : "is-fest";
  return el("span", {
    class: `fm-cal__dot ${kind} ${small ? "fm-cal__flag" : "fm-cal__festicon is-big"}`,
    style: fest.tint ? `--tint: ${fest.tint}` : undefined,
    "aria-hidden": "true",
  });
}

/**
 * A festival's marker: what actually shows up on the farm that day (the jack-o'-lantern, the
 * gift, the bouquet), the gold star for farm days, a little Golden Gate for Bay Area days, or the
 * real waving purple pennant, with the hand-drawn flag as a fallback. `small` = the 3/4-size
 * version for calendar cells.
 */
function festIcon(fest: Festival, small: boolean): HTMLElement {
  const cls = small ? "fm-cal__flag" : "fm-cal__festicon";
  const icon = iconKey(fest);
  if (icon) {
    // Cells fit about 11 art pixels; the day panel about 14.
    const longest = Math.max(1, size(icon)?.w ?? 16, size(icon)?.h ?? 16);
    const scale = Math.min(small ? 0.75 : 1, (small ? 11 : 14) / longest);
    return spriteIcon(icon, { scale, class: `${cls} is-item` });
  }
  if (fest.star) return spriteIcon("ui.feststar", { scale: small ? 0.75 : 1, class: cls });
  if (fest.sf) return spriteIcon("ui.sfday", { scale: small ? 0.75 : 1, class: `${cls} is-sf` });
  if (billboardSkin()) return el("span", { class: `fm-flag ${small ? "is-small" : ""} ${cls}`, "aria-hidden": "true" });
  return spriteIcon("ui.festflag", { scale: small ? 0.75 : 1, class: cls });
}

/** Horizontal swipe on the calendar paper flips months (phones). */
function addSwipe(target: HTMLElement, go: (delta: number) => void): void {
  let x0 = 0;
  let y0 = 0;
  let id: number | null = null;
  target.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType === "mouse") return;
    id = ev.pointerId;
    x0 = ev.clientX;
    y0 = ev.clientY;
  });
  target.addEventListener("pointerup", (ev) => {
    if (id !== ev.pointerId) return;
    id = null;
    const dx = ev.clientX - x0;
    const dy = ev.clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 40) go(dx < 0 ? 1 : -1);
  });
  target.addEventListener("pointercancel", () => (id = null));
}
