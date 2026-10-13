// Marnie's Ranch: buying a sheep = adding a plan. Also the "Edit sheep" form.

import "./marnie.css";
import { sfx } from "../audio";
import { pick } from "../engine/game";
import { api, pastureSheep, store } from "../net";
import { daysBetween, parseDayKey, stardewDate } from "../../shared/calendar";
import { CATEGORIES, CATEGORY_LABELS, LIMITS, type Category, type Sheep, type SheepPatch } from "../../shared/types";
import { checkLink, farmMoment, friendlyError } from "./animal-common";
import { el, openDialog, registerMenu, relativeDays, spriteIcon, toast, typewriter, type DialogHandle } from "./dom";
import { categoryIcon } from "./marnie-art";
import { PLACEHOLDERS, rollIdea } from "./marnie-ideas";

export function initMarnie(): void {
  registerMenu("marnie", (arg?: { date?: string }) => openMarnie(arg));
  registerMenu("editSheep", (id: string) => openEditSheep(id));
}

// ---------- Marnie's lines ----------

const GREETINGS = [
  "Oh, hi! Looking to add a sheep to the flock?",
  "Hello, you two! What'll this one be?",
  "Every good plan starts with a sheep. That's what I always say.",
  "Back again? The sheep have missed you.",
  "Shane says hi. Well, he grunted. Same thing.",
  "Jas wants to name the next lamb. Don't let her pick “Sir Fluffington” again.",
  "A new sheep? Wonderful! Every plan deserves a fluffy friend.",
  "These little ones are well-fed and ready for an adventure.",
  "I've got just the sheep for you. Fluffy, friendly, slightly judgmental.",
  "Lewis came by asking about you two. Don't worry, I didn't tell him anything.",
];

function greetingFor(): string {
  const m = farmMoment();
  const now = m.now;
  const flock = pastureSheep().filter((s) => s.shearedAt === null).length;
  const h = now.getHours();
  const special: string[] = [];
  if (h >= 22 || h < 5) special.push("Oh! You're up late. The sheep are asleep, but I can still help.");
  if (h >= 5 && h < 9) special.push("Mornin'! The sheep are up early today, just like you.");
  if (now.getDay() === 3) special.push("Pierre's is closed on Wednesdays, so you came to me? Smart.");
  if (now.getDay() === 1 || now.getDay() === 2) special.push("Technically I'm closed today... but for you two? Anything.");
  if (m.weather === "rain" || m.weather === "storm") special.push("Come in out of the rain! The sheep are all huddled up.");
  if (m.weather === "snow" || m.season === "winter") special.push("Brr! Good thing sheep come with built-in sweaters.");
  if (m.season === "fall") special.push("Fall's here! Perfect weather for a cozy plan, if you ask me.");
  if (flock === 0) special.push("Your pasture's looking awfully empty! Let's fix that.");
  if (flock >= 12) special.push("That's a lot of sheep... you two are BUSY! One more can't hurt.");
  // Specials show up about half the time so the regulars still get airtime.
  return special.length && Math.random() < 0.55 ? pick(special) : pick(GREETINGS);
}

const ROLL_REACTIONS = [
  "Ooh, I like that one.",
  "That one's got a twinkle in its eye.",
  "A fine sheep, if I do say so myself.",
  "Now THAT sounds like a good time.",
  "Oh, how fun!",
  "I'd do that one. Don't tell Lewis.",
  "Good pick. The sheep approve.",
  "That one's very fluffy.",
];

const PRICES = ["Free with one hug.", "Free with one hug. Two if it's raining.", "Payment accepted in forehead kisses.", "Free! I'll put it on your tab of hugs."];

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
  /** Called after a dice roll, for Marnie's reaction line. */
  onRoll?: (rolls: number) => void;
}

let formSeq = 0;

function buildForm(initial: Partial<Sheep>, opts: { memory: boolean; onSubmit: () => void }): SheepForm {
  const id = `sf${++formSeq}`;
  let category: Category = initial.category ?? "date";
  let userPickedCategory = initial.category !== undefined && initial.id !== undefined;
  let rolls = 0;

  // Inline, per-field validation messages (the dialog's own error line can be scrolled out of view on phones).
  const errEl = () => el("p", { class: "mr-fielderr", role: "alert", hidden: true });
  const errs = { name: errEl(), date: errEl(), link: errEl() };
  const setErr = (which: keyof typeof errs, msg: string | null) => {
    errs[which].hidden = !msg;
    errs[which].textContent = msg ?? "";
  };

  // Name + dice
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

  const dice = el(
    "button",
    { class: "sv-btn mr-dice", type: "button", "aria-label": "Roll a random idea", title: "Roll a random idea" },
    spriteIcon("ui.dice", { scale: 2 }),
  );
  dice.addEventListener("click", () => {
    rolls++;
    const taken = new Set((store.state?.sheep ?? []).map((x) => x.name.toLowerCase()));
    const idea = rollIdea(userPickedCategory ? category : null, nameInput.value.trim(), taken);
    nameInput.value = idea.name;
    setErr("name", null);
    if (!userPickedCategory) setCategory(idea.category, false);
    dice.classList.remove("is-rolling");
    nameInput.classList.remove("is-fresh");
    void dice.offsetWidth; // restart the wobble animation
    dice.classList.add("is-rolling");
    nameInput.classList.add("is-fresh");
    sfx("pop");
    form.onRoll?.(rolls);
  });

  const nameField = el(
    "div",
    { class: "sv-field" },
    el("label", { class: "sv-field__label", for: `${id}-name` }, "Name your sheep ", el("span", { class: "mr-soft" }, "(that's the plan!)")),
    el("div", { class: "mr-namerow" }, nameInput, dice),
    errs.name,
  );

  // Category chips (real radio buttons, so arrow keys + screen readers just work)
  const chips = el("div", { class: "mr-chips" });
  const radios = new Map<Category, HTMLInputElement>();
  for (const c of CATEGORIES) {
    const input = el("input", { type: "radio", name: `${id}-cat`, value: c, class: "visually-hidden" });
    input.checked = c === category;
    input.addEventListener("change", () => {
      if (input.checked) {
        setCategory(c, true);
        sfx("blip");
      }
    });
    radios.set(c, input);
    chips.append(el("label", { class: "mr-chip" }, input, el("span", { class: "mr-chip__face" }, spriteIcon(categoryIcon(c)), el("span", null, CATEGORY_LABELS[c]))));
  }
  function setCategory(c: Category, byUser: boolean): void {
    category = c;
    if (byUser) userPickedCategory = true;
    const r = radios.get(c);
    if (r) r.checked = true;
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
      days < 0 ? `${when} · that's in the past! (Time travel is more of a Mr. Qi thing.)` : `${when} · ${relativeDays(days)}${days === 0 ? "!" : ""}`;
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

  const root = el("div", { class: "mr-form" }, nameField, catField, el("div", { class: "mr-grid" }, dateField, linkField), notesField, memoryField);

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

// ---------- Marnie: buy a sheep ----------

function openMarnie(arg?: { date?: string }): void {
  let dialog: DialogHandle | undefined;
  const date = arg?.date && parseDayKey(arg.date) ? arg.date : null;
  const form = buildForm({ category: "date", date }, { memory: false, onSubmit: submitVia(() => dialog) });

  // No portraits on this farm (house rule), so Marnie gets a little name plate instead.
  const say = el("span", { class: "mr-line" });
  const sayBox = el("p", { class: "sv-say mr-say" }, el("span", { class: "mr-speaker" }, "Marnie"), say);
  const price = el(
    "p",
    { class: "mr-price" },
    el("span", { class: "mr-price__label" }, "Price:"),
    spriteIcon("marnie.coin", { class: "mr-coin" }),
    el("s", null, "8,000g"),
    el("span", null, ` just kidding. ${pick(PRICES)}`),
  );

  dialog = openDialog({
    title: "Marnie's Ranch",
    className: "mr-dialog",
    body: [sayBox, form.root, price],
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
              toast("A golden sheep?! Marnie's never seen one like it.", { icon: "ui.star", ms: 4500 });
            }, 700);
          }
        },
      },
    ],
  });

  void typewriter(say, `“${greetingFor()}”`);
  form.onRoll = (rolls) => {
    const line =
      rolls === 12
        ? "Can't decide? Lewis once took three seasons to pick a hat."
        : rolls === 25
          ? "That dice is going to wear out! (I believe in you.)"
          : pick(ROLL_REACTIONS);
    // Don't talk over the greeting while it's still being typed out.
    if (say.classList.contains("sv-typing")) return;
    if (Math.random() < 0.5 || rolls === 12 || rolls === 25) {
      say.textContent = `“${line}”`;
      sayBox.classList.remove("is-pop");
      void sayBox.offsetWidth;
      sayBox.classList.add("is-pop");
    }
  };
}

// ---------- edit a sheep ----------

function openEditSheep(id: string): void {
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
    toast(`${s.name} wandered off to Marnie's.`, { icon: "ui.sheep" });
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
}
