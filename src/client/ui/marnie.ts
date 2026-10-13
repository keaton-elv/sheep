// "Buy a Sheep" (the ranch): buying a sheep = adding a plan. Also the "Edit sheep" form.
// No shopkeeper here: the lamb for sale does the talking (well, the baa-ing), plus a narrator.

import "./marnie.css";
import { sfx } from "../audio";
import { pick } from "../engine/game";
import { api, pastureSheep, store } from "../net";
import { daysBetween, parseDayKey, stardewDate } from "../../shared/calendar";
import { CATEGORIES, CATEGORY_LABELS, LIMITS, type Category, type Sheep, type SheepPatch } from "../../shared/types";
import { checkLink, crispPx, farmMoment, friendlyError, realDateLabel } from "./animal-common";
import { SheepSprite } from "./animal-sprite";
import { el, openDialog, registerMenu, relativeDays, spriteIcon, toast, typewriter, type DialogHandle } from "./dom";
import { categoryIcon } from "./marnie-art";

export function initMarnie(): void {
  registerMenu("ranch", (arg?: { date?: string }) => openBuySheep(arg));
  // arg: a sheep id, or { id, focus: "date" } to jump straight to the date ("No date yet. Pick one?").
  registerMenu("editSheep", (arg?: string | { id: string; focus?: "date" }) => {
    if (typeof arg === "string") openEditSheep(arg);
    else if (arg?.id) openEditSheep(arg.id, arg.focus);
  });
}

// ---------- the narrator (and the lamb) ----------

const GREETINGS = [
  "A fluffy new friend is waiting for a plan!",
  "Every good plan starts with a sheep.",
  "Baa! (This lamb would like a plan, please.)",
  "One lamb, freshly fluffed, ready for an adventure.",
  "Name it after something you two want to do!",
  "This little one has been practicing its baa all morning.",
  "Fluffy, friendly, slightly judgmental. Perfect for a plan.",
  "The flock is ready to grow!",
  "Psst. The lamb is already excited. No pressure.",
  "A new plan? The pasture has room for one more.",
];

function greetingFor(date: string | null): string {
  const m = farmMoment();
  const now = m.now;
  const flock = pastureSheep().filter((s) => s.shearedAt === null).length;
  const h = now.getHours();
  const special: string[] = [];
  if (date) {
    const d = parseDayKey(date);
    if (d) special.push(`A plan for ${realDateLabel(d)}? This lamb loves a date on the calendar.`);
  }
  if (h >= 22 || h < 5) special.push("Shh... the flock is asleep. This lamb stayed up just for you two.");
  if (h >= 5 && h < 9) special.push("Good morning! The lambs are up early today, just like you.");
  if (m.weather === "rain" || m.weather === "storm") special.push("The lambs are huddled up out of the rain. This one is peeking out at you.");
  if (m.weather === "snow" || m.season === "winter") special.push("Brr! Good thing sheep come with built-in sweaters.");
  if (m.season === "spring") special.push("Spring lambs are the bounciest lambs.");
  if (m.season === "summer") special.push("Summer's here! Big skies, big plans.");
  if (m.season === "fall") special.push("Fall's here! Perfect weather for a cozy plan.");
  if (flock === 0) special.push("Your pasture's looking awfully empty! Let's fix that.");
  if (flock >= 12) special.push("That's a lot of sheep... you two are BUSY! One more can't hurt.");
  // A date from the calendar always gets its line; other specials show up about half the time.
  if (date && special.length) return special[0]!;
  return special.length && Math.random() < 0.55 ? pick(special) : pick(GREETINGS);
}

const PRICES = ["Free with one hug.", "Free with one hug. Two if it's raining.", "Payment accepted in forehead kisses.", "Free! It goes on your tab of hugs."];

const PLACEHOLDERS = [
  "e.g. Pottery class",
  "e.g. Weekend in Big Sur",
  "e.g. Bake a Pink Cake",
  "e.g. Stargaze somewhere dark",
  "e.g. Night market date",
  "e.g. Visit a lavender farm",
];

// ---------- the sheep form (shared by "buy" and "edit") ----------

interface FormValues {
  name: string;
  category: Category;
  date: string | null;
  notes: string;
  link: string;
  memory: string;
}

interface SheepForm {
  root: HTMLElement;
  values(): FormValues;
  /** Returns an error message (and focuses the bad field) or null. */
  validate(): string | null;
  /** Bring the date field into view, focus it and (where allowed) pop the date picker open. */
  focusDate(): void;
}

let formSeq = 0;

function buildForm(initial: Partial<Sheep>, opts: { memory: boolean; onSubmit: () => void; onCategory?: (c: Category) => void }): SheepForm {
  const id = `sf${++formSeq}`;
  let category: Category = initial.category ?? "date";

  // Inline, per-field validation messages (the dialog's own error line can be scrolled out of view on phones).
  const errEl = () => el("p", { class: "mr-fielderr", role: "alert", hidden: true });
  const errs = { name: errEl(), date: errEl(), link: errEl() };
  const setErr = (which: keyof typeof errs, msg: string | null) => {
    errs[which].hidden = !msg;
    errs[which].textContent = msg ?? "";
  };

  // Name
  const nameInput = el("input", {
    class: "sv-input mr-name",
    id: `${id}-name`,
    type: "text",
    maxLength: LIMITS.name,
    placeholder: pick(PLACEHOLDERS),
    autocomplete: "off",
    enterKeyHint: "done",
  });
  nameInput.value = initial.name ?? "";
  nameInput.addEventListener("input", () => setErr("name", null));
  nameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      opts.onSubmit();
    }
  });

  const nameField = el(
    "div",
    { class: "sv-field" },
    el("label", { class: "sv-field__label", for: `${id}-name` }, "Name your sheep ", el("span", { class: "mr-soft" }, "(that's the plan!)")),
    nameInput,
    errs.name,
  );

  // Category chips (real radio buttons, so arrow keys + screen readers just work)
  const chips = el("div", { class: "mr-chips" });
  for (const c of CATEGORIES) {
    const input = el("input", { type: "radio", name: `${id}-cat`, value: c, class: "visually-hidden" });
    input.checked = c === category;
    input.addEventListener("change", () => {
      if (input.checked) {
        category = c;
        sfx("blip");
        opts.onCategory?.(c);
      }
    });
    chips.append(el("label", { class: "mr-chip" }, input, el("span", { class: "mr-chip__face" }, spriteIcon(categoryIcon(c)), el("span", null, CATEGORY_LABELS[c]))));
  }
  const catField = el("fieldset", { class: "sv-field mr-fieldset" }, el("legend", { class: "sv-field__label" }, "What kind of plan?"), chips);

  // Date
  const dateInput = el("input", { class: "sv-input mr-date", id: `${id}-date`, type: "date" });
  dateInput.value = initial.date && parseDayKey(initial.date) ? initial.date : "";
  const clearDate = el("button", { class: "sv-btn mr-clear", type: "button", "aria-label": "Clear the date", title: "No date" }, "✕");
  const dateHint = el("p", { class: "mr-hint", "aria-live": "polite" });
  const updateDateHint = () => {
    const d = parseDayKey(dateInput.value);
    clearDate.hidden = !dateInput.value;
    if (!d) {
      dateHint.textContent = "No date? That's okay. Sheep are patient.";
      return;
    }
    const days = daysBetween(farmMoment().now, d);
    const founded = store.state?.foundedAt ?? Date.now();
    const when = stardewDate(d, founded);
    dateHint.textContent =
      days < 0 ? `${when} · that's in the past! (Unless you two have a time machine.)` : `${when} · ${relativeDays(days)}${days === 0 ? "!" : ""}`;
  };
  dateInput.addEventListener("input", updateDateHint);
  dateInput.addEventListener("change", updateDateHint);
  clearDate.addEventListener("click", () => {
    dateInput.value = "";
    updateDateHint();
    dateInput.focus();
  });
  updateDateHint();
  const dateField = el(
    "div",
    { class: "sv-field" },
    el("label", { class: "sv-field__label", for: `${id}-date` }, "When? ", el("span", { class: "mr-soft" }, "(optional)")),
    el("div", { class: "mr-daterow" }, dateInput, clearDate),
    dateHint,
    errs.date,
  );

  // Link
  const linkInput = el("input", {
    class: "sv-input",
    id: `${id}-link`,
    type: "url",
    inputMode: "url",
    maxLength: LIMITS.link,
    placeholder: "https://…",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
  });
  linkInput.value = initial.link ?? "";
  linkInput.addEventListener("input", () => setErr("link", null));
  linkInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.isComposing) {
      ev.preventDefault();
      opts.onSubmit();
    }
  });
  const linkField = el(
    "div",
    { class: "sv-field" },
    el("label", { class: "sv-field__label", for: `${id}-link` }, "Link ", el("span", { class: "mr-soft" }, "(tickets, menu, map…)")),
    linkInput,
    errs.link,
  );

  // Notes
  const notesInput = el("textarea", {
    class: "sv-input",
    id: `${id}-notes`,
    rows: 3,
    maxLength: LIMITS.notes,
    placeholder: pick(["Addresses, times, who brings snacks…", "Bring a jacket. And snacks.", "Ideas, prices, little details…"]),
  });
  notesInput.value = initial.notes ?? "";
  const notesField = el(
    "div",
    { class: "sv-field" },
    el("label", { class: "sv-field__label", for: `${id}-notes` }, "Notes ", el("span", { class: "mr-soft" }, "(optional)")),
    notesInput,
  );

  // Memory (only once the sheep has been sheared)
  const memoryInput = el("textarea", {
    class: "sv-input",
    id: `${id}-memory`,
    rows: 3,
    maxLength: LIMITS.memory,
    placeholder: "The best part was…",
  });
  memoryInput.value = initial.memory ?? "";
  const memoryField = opts.memory
    ? el(
        "div",
        { class: "sv-field" },
        el("label", { class: "sv-field__label", for: `${id}-memory` }, "Memory ", el("span", { class: "mr-soft" }, "(kept in the barn)")),
        memoryInput,
      )
    : null;

  const root = el("div", { class: "mr-form", style: `--ipx: ${crispPx(1.25, 2)}` }, nameField, catField, el("div", { class: "mr-grid" }, dateField, linkField), notesField, memoryField);

  const form: SheepForm = {
    root,
    values: () => ({
      name: nameInput.value.trim(),
      category,
      date: parseDayKey(dateInput.value) ? dateInput.value : null,
      notes: notesInput.value.trim(),
      link: linkInput.value.trim(),
      memory: memoryInput.value.trim(),
    }),
    validate() {
      setErr("name", null);
      setErr("date", null);
      setErr("link", null);
      if (!nameInput.value.trim()) {
        const msg = "Every sheep needs a name. (The name is the plan!)";
        setErr("name", msg);
        nameInput.focus();
        return msg;
      }
      if (dateInput.value && !parseDayKey(dateInput.value)) {
        const msg = "That date looks a little scrambled.";
        setErr("date", msg);
        dateInput.focus();
        return msg;
      }
      const linkErr = checkLink(linkInput.value);
      if (linkErr) {
        setErr("link", linkErr);
        linkInput.focus();
        return linkErr;
      }
      return null;
    },
    focusDate() {
      dateField.scrollIntoView({ block: "nearest" });
      dateInput.focus({ preventScroll: true });
      try {
        // Chrome / Android / newer Safari open the native picker; elsewhere focus is enough.
        dateInput.showPicker?.();
      } catch {
        // needs a fresh tap on some browsers; the field is focused and in view anyway
      }
    },
  };
  return form;
}

/** Show an API error on the dialog's error line and make sure it's actually on screen. */
function showError(d: DialogHandle | undefined, err: unknown): false {
  if (d) {
    d.error(friendlyError(err));
    d.box.querySelector(".sv-dialog__error")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  return false;
}

function primaryButton(d: DialogHandle): HTMLButtonElement | null {
  return d.box.querySelector<HTMLButtonElement>(".sv-dialog__buttons .sv-btn--primary");
}

/** Submit via the dialog's own primary button, so busy/error handling stays in one place. */
function submitVia(getDialog: () => DialogHandle | undefined): () => void {
  return () => {
    const btn = getDialog() && primaryButton(getDialog()!);
    if (btn && !btn.disabled) btn.click();
  };
}

// ---------- buy a sheep ----------

function openBuySheep(arg?: { date?: string }): void {
  let dialog: DialogHandle | undefined;
  const date = arg?.date && parseDayKey(arg.date) ? arg.date : null;

  // The lamb that's for sale: blinks, baas when poked, hops when you pick a kind of plan.
  const lamb = new SheepSprite(() => {});
  const lambBox = el("div", { class: "mr-lamb" }, lamb.button);

  const form = buildForm({ category: "date", date }, { memory: false, onSubmit: submitVia(() => dialog), onCategory: () => lamb.hop(false) });

  const say = el("span", { class: "mr-line" });
  const sayBox = el("div", { class: "mr-say" }, lambBox, el("p", { class: "sv-say mr-say__text" }, say));
  const price = el(
    "p",
    { class: "mr-price" },
    el("span", { class: "mr-price__label" }, "Price:"),
    spriteIcon("ranch.coin", { class: "mr-coin" }),
    el("s", null, "8,000g"),
    el("span", null, ` just kidding. ${pick(PRICES)}`),
  );

  dialog = openDialog({
    title: "Buy a Sheep",
    className: "mr-dialog",
    body: [sayBox, form.root, price],
    onClose: () => lamb.stop(),
    buttons: [
      { label: "Never mind", kind: "plain" },
      {
        label: "Purchase",
        kind: "primary",
        icon: "ui.sheep",
        onClick: async () => {
          if (form.validate()) {
            sfx("cancel");
            return false;
          }
          const v = form.values();
          let sheep: Sheep;
          try {
            sheep = await api.addSheep({ name: v.name, category: v.category, date: v.date, notes: v.notes, link: v.link });
          } catch (err) {
            return showError(dialog, err);
          }
          sfx("purchase");
          toast(`${sheep.name} joined the flock!`, { icon: "ui.sheep" });
          if (sheep.golden) {
            setTimeout(() => {
              sfx("sparkle");
              toast("A golden lamb?! It's shimmering. Legendary.", { icon: "ui.star", ms: 4500 });
            }, 700);
          }
        },
      },
    ],
  });

  lamb.set({ look: "lamb", golden: false, asleep: false, hat: null, label: "Say hi to the lamb" });
  void typewriter(say, greetingFor(date));
}

// ---------- edit a sheep ----------

function openEditSheep(id: string, focus?: "date"): void {
  const s = store.sheep(id);
  if (!s) {
    toast("That sheep wandered off.");
    return;
  }
  let dialog: DialogHandle | undefined;
  const sheared = s.shearedAt !== null;
  const form = buildForm(s, { memory: sheared, onSubmit: submitVia(() => dialog) });
  const intro = el("p", { class: "mr-intro" }, sheared ? "Fix up the details, or the memory, for the barn." : "Changing plans? No problem. The sheep won't mind.");

  // Sold on the other phone while we were editing? Don't leave a form for a sheep that's gone.
  const unsubscribe = store.changed.on(() => {
    if (store.sheep(id) || !dialog) return;
    toast(`${s.name} trotted off to a cozy new home.`, { icon: "ui.sheep" });
    dialog.close();
  });

  dialog = openDialog({
    title: "Edit sheep",
    className: "mr-dialog mr-dialog--edit",
    body: [intro, form.root],
    onClose: () => unsubscribe(),
    buttons: [
      { label: "Cancel", kind: "plain" },
      {
        label: "Save",
        kind: "primary",
        icon: categoryIcon(s.category),
        onClick: async () => {
          if (form.validate()) {
            sfx("cancel");
            return false;
          }
          const v = form.values();
          // Only send what changed, so two farmers editing different fields don't clobber each other.
          const patch: SheepPatch = {};
          if (v.name !== s.name) patch.name = v.name;
          if (v.category !== s.category) patch.category = v.category;
          if (v.date !== s.date) patch.date = v.date;
          if (v.notes !== s.notes) patch.notes = v.notes;
          if (v.link !== s.link) patch.link = v.link;
          if (sheared && v.memory !== s.memory) patch.memory = v.memory;
          if (Object.keys(patch).length === 0) return;
          try {
            await api.updateSheep(id, patch);
          } catch (err) {
            return showError(dialog, err);
          }
          sfx("select");
          toast(patch.name ? `${v.name} has a new name!` : `${v.name} is all spruced up.`, { icon: categoryIcon(v.category) });
        },
      },
    ],
  });
  // After the dialog's own first-frame focus handling.
  if (focus === "date") requestAnimationFrame(() => form.focusDate());
}
