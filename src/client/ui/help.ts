// "How the farm works": a little journal in Stardew's quest-log style, in a plain narrator voice.
// Opened from the toolbar's "…" menu, and automatically once on a device's first visit.
// Copy stays short: one line per idea, plus a few hints for the secrets.

import { LOOM_DURATION_MS, LOOM_WOOL_COST, RETIRE_AFTER_MS } from "../../shared/types";
import { has } from "../engine/sprites";
import { store } from "../net";
import { el, frameIcon, openDialog, registerMenu, spriteIcon } from "./dom";
import { registerHelpArt } from "./help-art";
import { iconKey, registerToolbarArt } from "./toolbar-art";
import "./help.css";

interface Entry {
  icons: (() => HTMLElement)[];
  title: string;
  text: string;
  secret?: true;
}

const sprite = (key: string, scale = 1) => () => spriteIcon(iconKey(key), { scale });
/** A critter's own sprite if it has one, otherwise a fallback icon. */
const critter = (key: string, fallback: string) => () => spriteIcon(has(key) ? key : iconKey(fallback), { class: "help-critter" });
const sheep = () => frameIcon("sheep", 12, 32, 32, { class: "help-sheep" });
const lamb = () => frameIcon("sheepBaby", 12, 32, 32, { class: "help-sheep is-lamb" });
const shorn = () => frameIcon("sheepSheared", 13, 32, 32, { class: "help-sheep" });

const RETIRE_DAYS = Math.round(RETIRE_AFTER_MS / 86_400_000);
const LOOM_MINUTES = Math.max(1, Math.round(LOOM_DURATION_MS / 60_000));

const ENTRIES: Entry[] = [
  {
    icons: [sheep],
    title: "Every plan is a sheep",
    text: "Tap the + to buy one at the ranch. Its name is the plan: a date, a workshop, a trip...",
  },
  {
    icons: [lamb],
    title: "Lambs",
    text: "New sheep arrive as wobbly little lambs and grow up after a day.",
  },
  {
    icons: [sprite("ui.heart.full", 2)],
    title: "Pet your sheep",
    text: "Tap a sheep to pet it (once a day each) and peek at its plan. Hearts show how excited you both are.",
  },
  {
    icons: [sprite("ui.tb.shears", 1.5)],
    title: "Did it? Shear it!",
    text: "Pick the shears and tap the sheep, or press Shear on its card. The wool goes in the chest, and you can jot down a memory.",
  },
  {
    icons: [sprite("ui.icon.flock", 1.5)],
    title: "The Flock",
    text: "Every sheep in one list. Tap the flock button to find any of them fast.",
  },
  {
    icons: [sprite("ui.icon.hat", 1.5)],
    title: "Hats",
    text: "Pick one from any sheep's card — 1 cloth. Taking it off is free.",
  },
  {
    icons: [sprite("ui.icon.tag", 1.5)],
    title: "Changed your mind?",
    text: "Edit a plan or sell the sheep back to the ranch from its card. Sheared one by accident? There's an un-shear button.",
  },
  {
    icons: [sprite("ui.hud.wool"), sprite("ui.hud.cloth")],
    title: "Wool, loom, cloth",
    text: `${LOOM_WOOL_COST} wool in the loom makes cloth in about ${LOOM_MINUTES} minutes. Spend it at the carpenter's shop (in the … menu), then tap the pasture to place your decoration.`,
  },
  {
    icons: [shorn],
    title: "Memories in the barn",
    text: `A sheared sheep naps in the pasture for ${RETIRE_DAYS} days so you both see it, then moves into the barn for good.`,
  },
  {
    icons: [sprite("ui.icon.calendar"), sprite("ui.icon.mail")],
    title: "Calendar & mail",
    text: "Plans with a date go up on the calendar. Letters about the farm show up in the mailbox. (Tap the farm sign to rename the farm.)",
  },
  {
    icons: [critter("fox.sit.0", "ui.star"), critter("hedgehog.idle.0", "ui.star")],
    title: "Otto & Milo",
    text: "The fox and the hedgehog in the corner. Best friends, champion nappers.",
  },
  {
    icons: [sprite("ui.icon.snickers", 1.5)],
    title: "Snickers",
    text: "Snickers lives by the barn. Rumor has it he has a secret button...",
  },
  {
    icons: [sprite("ui.heart.full", 2), sprite("ui.heart.full", 2)],
    title: "Farming together",
    text: "It's one farm for two. When one of you shears a sheep, the other sees it happen, live.",
  },
  {
    icons: [sprite("ui.star", 2)],
    title: "Psst...",
    text: "Tap the grass a bunch. Knock on the stump. Look up at night.",
    secret: true,
  },
];

export function initHelp(): void {
  registerMenu("help", (arg?: { welcome?: boolean }) => openHelp(!!arg?.welcome));
}

function openHelp(welcome: boolean): void {
  registerToolbarArt();
  registerHelpArt();
  const farm = store.state?.farmName;

  const intro = welcome
    ? el(
        "div",
        { class: "help-note" },
        el("p", { class: "help-note__big" }, `Welcome to ${farm ? farm : "the farm"}!`),
        el("p", null, "The sheep are very excited to meet you both. Here's how things work around here."),
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
    title: welcome ? "Welcome to the Farm" : "How the Farm Works",
    className: "help-journal",
    body: [intro, list, keys],
    buttons: [{ label: welcome ? "Let's farm!" : "Got it!", kind: "primary" }],
  });
}
