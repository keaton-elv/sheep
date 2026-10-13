// The animal card: Stardew's animal query menu, for one sheep (= one plan).
// Big sprite, name, hearts, a mood line, the plan's details, and Shear / Edit / Sell.

import "./animal.css";
import { sfx } from "../audio";
import { hasPettedToday, sheepEmote } from "../entities/sheep";
import { api, isRetired, serverNow, store } from "../net";
import { dayKey, daysBetween, parseDayKey, stardewDate } from "../../shared/calendar";
import { CATEGORY_LABELS, LIMITS, MAX_PETS, RETIRE_AFTER_MS, type Sheep } from "../../shared/types";
import { FRAME, farmMoment, friendlyError, hostLabel, realDateLabel, safeLink, sheepFrame } from "./animal-common";
import { moodLine } from "./animal-mood";
import { confirmDialog, el, heartsEl, openDialog, openMenu, plural, promptDialog, registerMenu, relativeDays, spriteIcon, toast, type DialogHandle } from "./dom";
import { categoryIcon } from "./marnie-art";

export function initAnimal(): void {
  registerMenu("sheep", (id: string) => openAnimalCard(id));
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- the big sheep sprite (blinks, sleeps, hops when poked) ----------

class CardSprite {
  readonly button: HTMLButtonElement;
  readonly scene: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private sheared = false;
  private golden = false;
  private asleep = false;
  private blinkTimer = 0;
  private frameTimer = 0;
  private nibbling = false;
  private stopped = false;

  constructor(onPoke: () => void) {
    this.canvas = el("canvas", { class: "an-sprite", width: 32, height: 32 });
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.button = el("button", { class: "an-poke", type: "button" }, this.canvas, el("span", { class: "an-zzz", "aria-hidden": "true" }, "z", el("span", null, "z")));
    this.button.addEventListener("click", () => {
      onPoke();
      this.hop();
    });
    this.scene = el("div", { class: "an-scene" }, this.button);
  }

  set(sheared: boolean, golden: boolean, asleep: boolean, label: string): void {
    const changed = sheared !== this.sheared || golden !== this.golden || asleep !== this.asleep;
    this.sheared = sheared;
    this.golden = golden;
    this.asleep = asleep;
    this.button.setAttribute("aria-label", label);
    this.scene.classList.toggle("is-golden", golden);
    this.scene.classList.toggle("is-asleep", asleep);
    if (changed || !this.blinkTimer) {
      this.show(asleep ? FRAME.asleep : FRAME.idleFront);
      this.scheduleBlink();
    }
  }

  private show(index: number): void {
    this.ctx.clearRect(0, 0, 32, 32);
    this.ctx.drawImage(sheepFrame(this.sheared, index, this.golden), 0, 0);
  }

  private scheduleBlink(): void {
    clearTimeout(this.blinkTimer);
    if (this.stopped) return;
    this.blinkTimer = window.setTimeout(
      () => {
        if (this.stopped) return;
        if (!this.asleep && !this.nibbling) {
          this.show(FRAME.asleep); // eyes closed = a blink
          window.setTimeout(() => !this.stopped && !this.asleep && !this.nibbling && this.show(FRAME.idleFront), 150);
        }
        this.scheduleBlink();
      },
      2200 + Math.random() * 3200,
    );
  }

  /** Poke: baa, hop, and a quick nibble of grass. */
  private hop(): void {
    sfx("baa");
    this.button.classList.remove("is-hopping");
    void this.button.offsetWidth;
    this.button.classList.add("is-hopping");
    if (this.asleep || reducedMotion()) return;
    clearTimeout(this.frameTimer);
    this.nibbling = true;
    let i = 0;
    const step = () => {
      if (this.stopped) return;
      if (i < NIBBLE.length && !this.asleep) {
        this.show(NIBBLE[i++]!);
        this.frameTimer = window.setTimeout(step, 110);
      } else {
        this.nibbling = false;
        this.show(this.asleep ? FRAME.asleep : FRAME.idleFront);
      }
    };
    this.frameTimer = window.setTimeout(step, 260);
  }

  /** A little heart floats up out of the sheep (petted from the card). */
  heart(): void {
    const h = el("span", { class: "an-petheart", "aria-hidden": "true" }, spriteIcon("ui.heart.full", { scale: 2 }));
    this.scene.append(h);
    window.setTimeout(() => h.remove(), 1100);
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.blinkTimer);
    clearTimeout(this.frameTimer);
  }
}

const NIBBLE = [...FRAME.graze, FRAME.graze[2], FRAME.graze[3], FRAME.graze[2], FRAME.graze[1], FRAME.graze[0]];

/**
 * Pet from the card (e.g. opened from the calendar or barn, where there's no sheep to tap).
 * Mirrors the field-tap rule: once per day per device. The sheep module keeps its "petted
 * today" set under farm.petted.<day> in localStorage, so we add to the same list.
 */
function markPettedToday(id: string): void {
  const key = `farm.petted.${dayKey(new Date())}`;
  try {
    const raw = localStorage.getItem(key);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr.filter((v): v is string => typeof v === "string") : [];
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Private mode: the server still enforces once a day.
  }
}

/** Petted on this device today (via the field or the card). */
const pettedHere = new Set<string>();
function canPetToday(id: string): boolean {
  return !pettedHere.has(`${dayKey(new Date())}:${id}`) && !hasPettedToday(id);
}

// ---------- the card ----------

/** Cards currently open, by sheep id (a quick double tap on a sheep would otherwise stack two). */
const openCards = new Set<string>();

function openAnimalCard(id: string): void {
  const first = store.sheep(id);
  if (!first) {
    toast("That sheep wandered off.");
    return;
  }
  if (openCards.has(id)) return;
  openCards.add(id);

  let name = first.name;
  let busy = false;
  let leaving = false; // we sold it ourselves; don't announce it wandered off
  let pokes = 0;
  let lastSig = "";

  const sprite = new CardSprite(() => {
    const s = store.sheep(id);
    if (s && canPetToday(id)) {
      pet(s);
      return;
    }
    pokes++;
    if (pokes === 6 || pokes === 12) render(true);
  });
  // The sprite's frame stays put across re-renders (moving it would restart its animations);
  // only the header text and the details below get rebuilt.
  let head = el("div", { class: "an-head" });
  const top = el("div", { class: "an-top" }, el("div", { class: "an-frame" }, sprite.scene), head);
  const details = el("div", { class: "an-details" });
  const body = el("div", { class: "an-card" }, top, details);

  const dialog: DialogHandle = openDialog({
    className: "an-dialog",
    body,
    onClose: () => {
      openCards.delete(id);
      unsubscribe();
      clearInterval(ticker);
      sprite.stop();
    },
  });
  dialog.box.setAttribute("aria-label", `${name}, a sheep`);

  const unsubscribe = store.changed.on(() => {
    const s = store.sheep(id);
    if (!s) {
      if (!leaving) toast(`${name} wandered off to Marnie's.`, { icon: "ui.sheep" });
      dialog.close();
      return;
    }
    render();
  });
  // Dusk, midnight and "moves into the barn" happen without any store change; peek now and then.
  const ticker = window.setInterval(() => render(), 30_000);

  render();

  async function action(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    dialog.error(null);
    render(true);
    try {
      await fn();
    } catch (err) {
      dialog.error(friendlyError(err));
      dialog.box.querySelector(".sv-dialog__error")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } finally {
      busy = false;
      if (store.sheep(id)) render(true);
    }
  }

  function render(force = false): void {
    const s = store.sheep(id);
    if (!s) return;
    const founded = store.state?.foundedAt ?? s.createdAt;
    const moment = farmMoment();
    const nowMs = serverNow();
    const retired = isRetired(s, nowMs);
    const petMe = canPetToday(id);
    const sig = [JSON.stringify(s), founded, busy, moment.isNight, moment.weather, moment.season, dayKey(moment.now), dayKey(new Date(nowMs)), retired, petMe].join("|");
    if (!force && sig === lastSig) return;
    lastSig = sig;
    name = s.name;
    dialog.box.setAttribute("aria-label", `${s.name}, a sheep`);
    const sheared = s.shearedAt !== null;
    const asleep = moment.isNight && !busy;

    sprite.set(sheared, s.golden, asleep, petMe ? `Pet ${s.name}` : `Say hi to ${s.name}`);
    sprite.scene.dataset.season = moment.season;
    sprite.scene.classList.toggle("is-night", moment.isNight);

    const mood = moodLine(s, { moment, nowMs, retired, pokes });

    // --- header: sprite + name + hearts + mood ---
    const newHead = el(
      "div",
      { class: "an-head" },
      el("h2", { class: "an-name" }, s.name),
      el(
        "div",
        { class: "an-heartsrow", title: "Hearts = how excited you two are. Each of you can pet it once a day for half a heart." },
        heartsEl(s.pets, { scale: 2 }),
        heartLabel(s.pets, petMe) ? el("span", { class: "an-heartcount" }, heartLabel(s.pets, petMe)) : null,
      ),
      el("p", { class: "an-mood" }, mood),
    );
    head.replaceWith(newHead);
    head = newHead;

    // --- details ---
    const rows = el("dl", { class: "an-rows" });
    const row = (label: string, ...value: (Node | string | null)[]) => {
      rows.append(el("dt", null, label), el("dd", null, ...value));
    };

    row("Kind", el("span", { class: "an-chip" }, spriteIcon(categoryIcon(s.category)), CATEGORY_LABELS[s.category] ?? "Other"));

    const planned = s.date ? parseDayKey(s.date) : null;
    if (planned) {
      const days = daysBetween(moment.now, planned);
      row(
        "When",
        el("span", { class: "an-date" }, realDateLabel(planned, planned.getFullYear() !== moment.now.getFullYear())),
        el("span", { class: "an-sub" }, `${stardewDate(planned, founded)} · ${relativeDays(days)}${days === 0 ? "!" : ""}`),
      );
    } else if (!sheared) {
      const pickDate = el("button", { class: "an-linkbtn", type: "button", dataset: { focus: "date" } }, "No date yet — pick one?");
      pickDate.addEventListener("click", () => openMenu("editSheep", id));
      row("When", pickDate);
    }

    const ageDays = daysBetween(new Date(s.createdAt), moment.now);
    row(
      "Age",
      ageDays <= 0 ? "Brought home today" : ageDays === 1 ? "Brought home yesterday" : `Brought home ${plural(ageDays, "day")} ago`,
    );

    if (s.golden) {
      row("Wool", el("span", { class: "an-chip an-chip--gold" }, spriteIcon("ui.star"), sheared ? "Golden! Gave 2 wool." : "Golden! Shearing gives 2 wool."));
    }

    if (sheared && s.shearedAt !== null) {
      const shearDate = new Date(s.shearedAt);
      const ago = daysBetween(shearDate, moment.now);
      const moveIn = daysBetween(new Date(nowMs), new Date(s.shearedAt + RETIRE_AFTER_MS));
      const where = retired
        ? "Living in the barn now."
        : moveIn <= 0
          ? "Moves into the barn later today."
          : `Moves into the barn ${relativeDays(moveIn)}.`;
      row(
        "Sheared",
        el("span", { class: "an-date" }, `${stardewDate(shearDate, founded)} (${relativeDays(-ago)})`),
        el("span", { class: "an-sub" }, where),
      );
    }

    if (s.notes) row("Notes", el("span", { class: "an-notes" }, s.notes));

    const link = safeLink(s.link);
    if (link) {
      row("Link", el("a", { class: "an-link", href: link.href, target: "_blank", rel: "noopener noreferrer" }, hostLabel(link), el("span", { "aria-hidden": "true" }, " ↗")));
    }

    if (sheared) {
      if (s.memory) {
        row("Memory", el("blockquote", { class: "an-memory" }, s.memory));
      } else {
        const write = el("button", { class: "an-linkbtn", type: "button", dataset: { focus: "memory" } }, "Write a little memory?");
        write.addEventListener("click", () => void writeMemory(s));
        row("Memory", write);
      }
    }

    // --- actions ---
    const actions = el("div", { class: "an-actions" });
    const btn = (label: string, kind: "plain" | "primary" | "danger", icon: string | null, onClick: () => void) => {
      const b = el(
        "button",
        { class: `sv-btn sv-btn--${kind}`, type: "button", disabled: busy, dataset: { focus: label } },
        icon ? spriteIcon(icon) : null,
        el("span", null, label),
      );
      b.addEventListener("click", () => {
        sfx("select");
        onClick();
      });
      actions.append(b);
      return b;
    };

    btn("Sell", "danger", null, () => void sell(s));
    btn("Edit", "plain", null, () => openMenu("editSheep", id));
    if (!sheared) btn("Shear", "primary", "tool.shears", () => openMenu("shear", id));
    else btn("Oops, un-shear", "plain", null, () => void unshear(s));

    // Re-rendering swaps the nodes; keep keyboard focus on "the same" button if it had it.
    const focused = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement.dataset.focus : undefined;
    details.replaceChildren(rows, actions);
    if (focused) body.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
  }

  function pet(s: Sheep): void {
    pettedHere.add(`${dayKey(new Date())}:${id}`);
    markPettedToday(id);
    sfx("pet");
    sprite.heart();
    sheepEmote(id, "heart");
    render(true);
    api
      .pet(id)
      .then((r) => {
        if (r.petted && r.sheep.pets >= MAX_PETS && s.pets < MAX_PETS) toast(`${s.name} adores you two! Max hearts.`, { icon: "ui.heart.full" });
      })
      .catch(() => {
        // Not the end of the world: let them try again.
        pettedHere.delete(`${dayKey(new Date())}:${id}`);
        if (store.sheep(id)) render(true);
      });
  }

  async function sell(s: Sheep): Promise<void> {
    const extra = s.shearedAt !== null && s.memory ? " (This deletes the plan and its memory.)" : " (This deletes the plan.)";
    const yes = await confirmDialog(`Sell ${s.name} to Marnie? She'll find it a nice home.${extra}`, {
      yes: "Sell",
      no: "Keep",
      danger: true,
    });
    if (!yes) return;
    await action(async () => {
      leaving = true;
      try {
        await api.sellSheep(id);
      } catch (err) {
        leaving = false;
        throw err;
      }
      sfx("coin");
      toast(`${s.name} went to live with Marnie.`, { icon: "ui.sheep" });
      dialog.close();
    });
  }

  async function unshear(s: Sheep): Promise<void> {
    const wool = s.golden ? "2 wool go" : "the wool goes";
    const yes = await confirmDialog(`Un-shear ${s.name}? The plan goes back on the to-do list and ${wool} back on the sheep.`, {
      yes: "Un-shear",
      no: "Keep it sheared",
    });
    if (!yes) return;
    await action(async () => {
      await api.unshear(id);
      sfx("woosh");
      toast(`${s.name} is woolly again.`, { icon: "ui.sheep" });
    });
  }

  async function writeMemory(s: Sheep): Promise<void> {
    const text = await promptDialog({
      title: "A little memory?",
      label: `What do you want to remember about ${s.name}?`,
      placeholder: "The best part was…",
      multiline: true,
      maxLength: LIMITS.memory,
      ok: "Save memory",
    });
    if (!text) return;
    await action(async () => {
      await api.updateSheep(id, { memory: text });
      toast("Memory tucked away in the barn.", { icon: "ui.heart.full" });
    });
  }
}

function heartLabel(pets: number, petMe: boolean): string {
  if (pets >= MAX_PETS) return "Max!";
  if (petMe) return "Pet me!";
  return "";
}
