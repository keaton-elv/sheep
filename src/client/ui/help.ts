// "How the farm works": a little journal in Stardew's quest-log style.
// Opened from the toolbar's "…" menu, and automatically once on a device's first visit.

import { LOOM_DURATION_MS, LOOM_WOOL_COST, RETIRE_AFTER_MS } from "../../shared/types";
import { store } from "../net";
import { el, frameIcon, openDialog, registerMenu, spriteIcon } from "./dom";
import { iconKey, registerToolbarArt } from "./toolbar-art";
import "./help.css";

interface Entry {
  icons: (() => HTMLElement)[];
  title: string;
  text: string;
  secret?: true;
}

const sprite = (key: string, scale = 1) => () => spriteIcon(iconKey(key), { scale });
const sheep = () => frameIcon("sheep", 12, 32, 32, { class: "help-sheep" });
const shorn = () => frameIcon("sheepSheared", 13, 32, 32, { class: "help-sheep" });

const RETIRE_DAYS = Math.round(RETIRE_AFTER_MS / 86_400_000);
const LOOM_MINUTES = Math.max(1, Math.round(LOOM_DURATION_MS / 60_000));

const ENTRIES: Entry[] = [
  {
    icons: [sheep],
    title: "Every plan is a sheep",
    text: "Tap the + sheep to buy one from Marnie. Its name is the plan: a date, a workshop, a trip... Stuck? Roll the dice for an idea.",
  },
  {
    icons: [sprite("ui.heart.full", 2)],
    title: "Pet your sheep",
    text: "Tap a sheep to pet it (once a day each) and peek at its plan. Hearts show how excited you both are.",
  },
  {
    icons: [sprite("ui.tb.shears", 1.5)],
    title: "Did it? Shear it!",
    text: "Pick the shears and tap the sheep, or press Shear on its card. Snip! The wool goes in the chest, and you can jot down a little memory.",
  },
  {
    icons: [sprite("ui.icon.tag", 1.5)],
    title: "Changed your mind?",
    text: "Open a sheep's card to Edit the plan or Sell it back to Marnie. Sheared one by accident? There's an un-shear button.",
  },
  {
    icons: [sprite("ui.hud.wool"), sprite("ui.hud.cloth")],
    title: "Wool, loom, cloth",
    text: `Feed ${LOOM_WOOL_COST} wool to the loom and wait about ${LOOM_MINUTES} minutes for cloth. Robin trades cloth for decorations; tap the pasture to place them.`,
  },
  {
    icons: [shorn],
    title: "Memories in the barn",
    text: `A sheared sheep naps in the pasture for ${RETIRE_DAYS} days so you both see it, then moves into the barn. Visit any time to relive your adventures.`,
  },
  {
    icons: [sprite("ui.icon.calendar"), sprite("ui.icon.mail")],
    title: "Calendar & mail",
    text: "Plans with a date go up on the calendar board. The mailbox has letters about everything that happened on the farm. (Tap the farm sign to rename the farm!)",
  },
  {
    icons: [sprite("ui.heart.full", 2), sprite("ui.heart.full", 2)],
    title: "Farming together",
    text: "It's one farm for two. When one of you shears a sheep, the other sees it happen, live.",
  },
  {
    icons: [sprite("ui.star", 2)],
    title: "Psst...",
    text: "Some critters love being tapped... and some secrets only come out at night.",
    secret: true,
  },
];

export function initHelp(): void {
  registerMenu("help", (arg?: { welcome?: boolean }) => openHelp(!!arg?.welcome));
}

function openHelp(welcome: boolean): void {
  registerToolbarArt();
  const farm = store.state?.farmName;

  const intro = welcome
    ? el(
        "div",
        { class: "help-note" },
        el("p", { class: "help-note__big" }, `Welcome to ${farm ? farm : "your farm"}!`),
        el("p", null, "Mayor Lewis left this little guide on the doorstep. The sheep are very excited to meet you both."),
      )
    : null;

  const list = el("ol", { class: "help-list" });
  for (const e of ENTRIES) {
    list.appendChild(
      el(
        "li",
        { class: `help-entry ${e.secret ? "is-secret" : ""}` },
        el("div", { class: `help-entry__icons ${e.icons.length > 1 ? "is-pair" : ""}`, "aria-hidden": "true" }, ...e.icons.map((f) => f())),
        el("div", { class: "help-entry__text" }, el("h3", { class: "help-entry__title" }, e.title), el("p", null, e.text)),
      ),
    );
  }

  const keys = matchMedia("(hover: hover) and (pointer: fine)").matches
    ? el("p", { class: "help-keys" }, "Tip: keys ", el("kbd", null, "1"), "–", el("kbd", null, "8"), " pick toolbar slots, ", el("kbd", null, "Esc"), " closes menus.")
    : null;

  openDialog({
    title: welcome ? "A Note From the Mayor" : "How the Farm Works",
    className: "help-journal",
    body: [intro, list, keys],
    buttons: [{ label: welcome ? "Let's farm!" : "Got it!", kind: "primary" }],
  });
}
