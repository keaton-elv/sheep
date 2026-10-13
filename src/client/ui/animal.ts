// The animal card: Stardew's animal query menu, for one sheep (= one plan).
// Big sprite (with its hat), name, hearts, a mood line, the plan's details, and
// Shear / Hat / Edit / Sell.

import "./animal.css";
import { sfx } from "../audio";
import { hasPettedToday, markPetted, sheepEmote } from "../entities/sheep";
import { hatName } from "../entities/sheep-hats";
import { api, isLamb, isRetired, serverNow, store } from "../net";
import { dayKey, daysBetween, parseDayKey, stardewDate } from "../../shared/calendar";
import { CATEGORY_LABELS, LIMITS, MAX_PETS, RETIRE_AFTER_MS, type Sheep } from "../../shared/types";
import { crispPx, farmMoment, friendlyError, hostLabel, lambGrowsUp, realDateLabel, safeLink } from "./animal-common";
import { openHatPicker } from "./animal-hats";
import { moodLine } from "./animal-mood";
import { SheepSprite, hatTileIcon, lookOf } from "./animal-sprite";
import { confirmDialog, el, heartsEl, openDialog, openMenu, plural, promptDialog, registerMenu, relativeDays, spriteIcon, toast, type DialogHandle } from "./dom";
import { categoryIcon } from "./marnie-art";

export function initAnimal(): void {
  registerMenu("sheep", (id: string) => openAnimalCard(id));
}

// ---------- petting from the card ----------

/** Record this device's pet in the sheep module's "petted today" list (shared with field taps). */
function recordPet(id: string): void {
  try {
    markPetted(id);
  } catch {
    // Private mode etc.: the in-memory set below still stops double pets this session.
  }
}

/** Petted on this device today (via the field or the card). */
const pettedHere = new Set<string>();
function canPetToday(id: string): boolean {
  return !pettedHere.has(`${dayKey(new Date())}:${id}`) && !hasPettedToday(id);
}

function safeHatName(id: number): string {
  try {
    return hatName(id);
  } catch {
    return "A fine hat";
  }
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

  const sprite = new SheepSprite(() => {
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
  const body = el("div", { class: "an-card", style: `--ipx: ${crispPx(1.5, 2.25)}; --ipx-sm: ${crispPx(1.25, 2)}` }, top, details);

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
      if (!leaving) toast(`${name} trotted off to a new home.`, { icon: "ui.sheep" });
      dialog.close();
      return;
    }
    render();
  });
  // Dusk, midnight, growing up and "moves into the barn" happen without any store change; peek now and then.
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
    const lamb = s.shearedAt === null && isLamb(s, nowMs);
    const petMe = canPetToday(id);
    const sig = [JSON.stringify(s), founded, busy, moment.isNight, moment.weather, moment.season, dayKey(moment.now), dayKey(new Date(nowMs)), retired, lamb, petMe].join("|");
    if (!force && sig === lastSig) return;
    lastSig = sig;
    name = s.name;
    dialog.box.setAttribute("aria-label", `${s.name}, a ${lamb ? "lamb" : "sheep"}`);
    const sheared = s.shearedAt !== null;
    const asleep = moment.isNight && !busy;

    sprite.set({
      look: lookOf(s, nowMs),
      golden: s.golden,
      asleep,
      hat: s.hat,
      label: petMe ? `Pet ${s.name}` : `Say hi to ${s.name}`,
    });
    sprite.scene.dataset.season = moment.season;
    sprite.scene.classList.toggle("is-night", moment.isNight);

    const mood = moodLine(s, { moment, nowMs, retired, lamb, pokes });

    // --- header: name + hearts + mood ---
    const label = heartLabel(s.pets, petMe);
    const newHead = el(
      "div",
      { class: "an-head" },
      el("h2", { class: "an-name" }, s.name),
      el(
        "div",
        { class: "an-heartsrow", title: "Hearts = how excited you two are. Each of you can pet it once a day for half a heart." },
        heartsEl(s.pets, { scale: 2 }),
        label ? el("span", { class: "an-heartcount" }, label) : null,
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
      const pickDate = el("button", { class: "an-linkbtn", type: "button", dataset: { focus: "date" } }, "No date yet. Pick one?");
      pickDate.addEventListener("click", () => openMenu("editSheep", { id, focus: "date" }));
      row("When", pickDate);
    }

    const ageDays = daysBetween(new Date(s.createdAt), moment.now);
    if (lamb) {
      row("Age", el("span", { class: "an-chip an-chip--lamb" }, `Still a lamb! Grows up ${lambGrowsUp(s, moment.now)}.`));
    } else {
      row("Age", ageDays <= 0 ? "Brought home today" : ageDays === 1 ? "Brought home yesterday" : `Brought home ${plural(ageDays, "day")} ago`);
    }

    if (s.hat !== null) {
      row("Hat", el("span", { class: "an-chip an-chip--hat" }, hatTileIcon(s.hat, 1), safeHatName(s.hat)));
    }

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
      row("Sheared", el("span", { class: "an-date" }, `${stardewDate(shearDate, founded)} (${relativeDays(-ago)})`), el("span", { class: "an-sub" }, where));
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
    // Phones: Shear gets its own full-width row on top (un-shear at the bottom); the rest share a row.
    const actions = el("div", { class: "an-actions" });
    const btn = (label: string, kind: "plain" | "primary" | "danger", icon: Node | null, onClick: () => void, extra = "") => {
      const b = el(
        "button",
        { class: `sv-btn sv-btn--${kind} ${extra}`, type: "button", disabled: busy, dataset: { focus: label } },
        icon,
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
    if (!retired) btn("Hat", "plain", s.hat !== null ? hatTileIcon(s.hat, 1) : null, () => openHatPicker(id), "an-hatbtn");
    if (!sheared) btn("Shear", "primary", spriteIcon("tool.shears"), () => openMenu("shear", id), "an-act--main");
    else btn("Oops, un-shear", "plain", null, () => void unshear(s), "an-act--wide");

    // Re-rendering swaps the nodes; keep keyboard focus on "the same" button if it had it.
    const focused = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement.dataset.focus : undefined;
    details.replaceChildren(rows, actions);
    if (focused) body.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focused)}"]`)?.focus();
  }

  function pet(s: Sheep): void {
    const key = `${dayKey(new Date())}:${id}`;
    pettedHere.add(key);
    recordPet(id);
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
        pettedHere.delete(key);
        if (store.sheep(id)) render(true);
      });
  }

  async function sell(s: Sheep): Promise<void> {
    const extra = s.shearedAt !== null && s.memory ? " (This deletes the plan and its memory.)" : " (This deletes the plan.)";
    const yes = await confirmDialog(`Sell ${s.name}? A nice farm over the hill will give it a cozy new home.${extra}`, {
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
      toast(`${s.name} trotted off to a cozy new home.`, { icon: "ui.sheep" });
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
