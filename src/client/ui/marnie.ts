// "Buy a Sheep" (the ranch): buying a sheep = adding a plan. Also the Edit form.
// No shopkeeper here: the lamb for sale does the talking (well, the baa-ing).

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
import { showOriginalPlanStamp } from "./stamp";

export function initMarnie(): void {
  registerMenu("ranch", (arg?: { date?: string }) => openBuySheep(arg));
  // arg: a sheep id, or { id, focus: "date" } to jump straight to the date (the card's "Pick a date?").
  registerMenu("editSheep", (arg?: string | { id: string; focus?: "date" }) => {
    if (typeof arg === "string") openEditSheep(arg);
    else if (arg?.id) openEditSheep(arg.id, arg.focus);
  });
}

// ---------- the lamb's line ----------

const GREETINGS = [
  "Baa... (This lamb would like a plan, please.)",
  "Freshly fluffed. Ready for an adventure.",
  "Fluffy, friendly, slightly judgmental.",
  "Baa? Baa!",
  "This lamb practiced its baa all morning...",
];

function greetingFor(date: string | null): string {
  const m = farmMoment();
  const now = m.now;
  const flock = pastureSheep().filter((s) => s.shearedAt === null).length;
  const h = now.getHours();
  const special: string[] = [];
  if (date) {
    const d = parseDayKey(date);
    if (d) special.push(`${realDateLabel(d)}? Baa! A date!`);
  }
  if (h >= 22 || h < 5) special.push("Shh... everyone's asleep. This one stayed up for you.");
  if (h >= 5 && h < 9) special.push("Up early? So is this lamb...");
  if (m.weather === "rain" || m.weather === "storm") special.push("Baa... (peeking out of the rain at you)");
  if (m.weather === "snow" || m.season === "winter") special.push("Brr! Good thing sheep come with built-in sweaters.");
  if (m.season === "spring") special.push("Spring lambs are the bounciest lambs.");
  if (flock === 0) special.push("The pasture's awfully empty...");
  if (flock >= 12) special.push("That's a lot of sheep... one more can't hurt.");
  // A date from the calendar always gets its line; other specials show up about half the time.
  if (date && special.length) return special[0]!;
  return special.length && Math.random() < 0.55 ? pick(special) : pick(GREETINGS);
}

const PRICES = ["Free with one hug.", "Free with one hug. Two if it's raining.", "Payment accepted in forehead kisses.", "Free! It goes on your tab of hugs."];

// The name placeholder: always the same plan, somewhere new. (Real San Francisco parks.)
const SF_PARKS = [
  "Dolores Park",
  "Golden Gate Park",
  "Alamo Square",
  "Lands End",
  "Crissy Field",
  "Bernal Heights Park",
  "Buena Vista Park",
  "Corona Heights Park",
  "Precita Park",
  "Duboce Park",
  "Lafayette Park",
  "Alta Plaza Park",
  "Washington Square",
  "Huntington Park",
  "Stern Grove",
  "McLaren Park",
  "Glen Canyon Park",
  "Fort Funston",
  "Presidio Tunnel Tops",
  "Twin Peaks",
  "Sutro Heights Park",
  "Mountain Lake Park",
  "Holly Park",
  "Salesforce Park",
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
    placeholder: `Eat pizza in ${pick(SF_PARKS)}`,
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
    el("label", { class: "sv-field__label", for: `${id}-name` }, "Name your sheep ", el("span", { class: "mr-soft" }, "(that's the plan)")),
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
  const catField = el("fieldset", { class: "sv-field mr-fieldset" }, el("legend", { class: "sv-field__label" }, "Kind"), chips);

  // Date: empty means "no date" (never a default). iOS draws today's date inside an empty date
  // input, so while it's empty the native text is hidden under a "No date" face (marnie.css), and
  // the ✕ is the only way to un-set a date on phones, so it shows whenever one is set.
  const dateInput = el("input", { class: "sv-input mr-date", id: `${id}-date`, type: "date" });
  dateInput.value = initial.date && parseDayKey(initial.date) ? initial.date : "";
  const dateBox = el(
    "div",
    { class: "mr-datebox" },
    dateInput,
    el("span", { class: "mr-dateface", "aria-hidden": "true" }, spriteIcon("ui.icon.calendar"), el("span", null, "No date")),
  );
  const clearDate = el("button", { class: "sv-btn mr-clear", type: "button", "aria-label": "Clear the date", title: "Clear the date" }, "✕");
  const dateHint = el("p", { class: "mr-hint", "aria-live": "polite" });
  const updateDateHint = () => {
    const d = parseDayKey(dateInput.value);
    const empty = !dateInput.value;
    dateBox.classList.toggle("is-empty", empty);
    clearDate.hidden = empty;
    if (!d) {
      dateHint.textContent = "";
      dateHint.hidden = true;
      return;
    }
    const days = daysBetween(farmMoment().now, d);
    const founded = store.state?.foundedAt ?? Date.now();
    const when = stardewDate(d, founded);
    dateHint.hidden = false;
    dateHint.textContent =
      days < 0 ? `${when} · in the past... time machine?` : `${when} · ${relativeDays(days)}${days === 0 ? "!" : ""}`;
  };
  const onDate = () => {
    setErr("date", null);
    updateDateHint();
  };
  dateInput.addEventListener("input", onDate);
  dateInput.addEventListener("change", onDate);
  // Desktop: clicking the text part of a date input doesn't open the calendar by itself.
  dateInput.addEventListener("click", () => {
    try {
      if (matchMedia("(pointer: fine)").matches) dateInput.showPicker?.();
    } catch {
      // already open, or not allowed here: typing works too
    }
  });
  clearDate.addEventListener("click", (ev) => {
    sfx("blip");
    dateInput.value = "";
    updateDateHint();
    // Keyboard users land back on the field; taps don't (focusing a date input can pop the picker).
    if (ev.detail === 0) dateInput.focus({ preventScroll: true });
  });
  updateDateHint();
  const dateField = el(
    "div",
    { class: "sv-field" },
    el("label", { class: "sv-field__label", for: `${id}-date` }, "When?"),
    el("div", { class: "mr-daterow" }, dateBox, clearDate),
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
    el("label", { class: "sv-field__label", for: `${id}-link` }, "Link"),
    linkInput,
    errs.link,
  );

  // Notes
  const notesInput = el("textarea", {
    class: "sv-input",
    id: `${id}-notes`,
    rows: 3,
    maxLength: LIMITS.notes,
    placeholder: pick(["Who brings snacks...", "Bring a jacket. And snacks.", "Times, places, little details..."]),
  });
  notesInput.value = initial.notes ?? "";
  const notesField = el(
    "div",
    { class: "sv-field" },
    el("label", { class: "sv-field__label", for: `${id}-notes` }, "Notes"),
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
        el("label", { class: "sv-field__label", for: `${id}-memory` }, "Memory"),
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
        const msg = "Every sheep needs a name...";
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
    el("span", null, pick(PRICES)),
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
          toast(`${sheep.name} hopped into the pasture!`, { icon: "ui.sheep" });
          if (sheep.golden) {
            setTimeout(() => {
              sfx("sparkle");
              toast("A golden lamb?! Legendary...", { icon: "ui.star", ms: 4500 });
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
    toast("That sheep wandered off...");
    return;
  }
  let dialog: DialogHandle | undefined;
  const sheared = s.shearedAt !== null;
  const form = buildForm(s, { memory: sheared, onSubmit: submitVia(() => dialog) });
  // Sometimes (1 in 3) the form reminds you the sheep are keeping score.
  const tease = Math.random() < 1 / 3 ? el("p", { class: "mr-intro mr-tease" }, "Changing the plan? Bold... (The sheep remember the original.)") : null;

  // Sold on the other phone while we were editing? Don't leave a form for a sheep that's gone.
  const unsubscribe = store.changed.on(() => {
    if (store.sheep(id) || !dialog) return;
    toast(`${s.name} went to a nice farm upstate...`, { icon: "ui.sheep" });
    dialog.close();
  });

  dialog = openDialog({
    title: "Edit",
    className: "mr-dialog mr-dialog--edit",
    body: tease ? [tease, form.root] : form.root,
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
          const returnsBefore = store.sheep(id)?.originalReturns ?? s.originalReturns ?? 0;
          let updated: Sheep;
          try {
            updated = await api.updateSheep(id, patch);
          } catch (err) {
            return showError(dialog, err);
          }
          // Renamed right back to its first name: ORIGINAL PLAN! (stamp.ts dedupes this against the matching event.)
          if ((updated.originalReturns ?? 0) > returnsBefore) {
            showOriginalPlanStamp(updated.name);
            return;
          }
          sfx("select");
          toast(patch.name ? `${v.name}? New name, same sheep.` : `${v.name} is all spruced up.`, { icon: categoryIcon(v.category) });
        },
      },
    ],
  });
  // After the dialog's own first-frame focus handling.
  if (focus === "date") requestAnimationFrame(() => form.focusDate());
}
