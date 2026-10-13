// "How it works": a little journal in Stardew's quest-log style. One short line per idea, each
// with its icon, plus a few hints for the secrets. Opened from the toolbar's "…" menu, and
// automatically once on a device's first visit.

import { HAT_COST, LOOM_WOOL_COST, RETIRE_AFTER_MS } from "../../shared/types";
import { has } from "../engine/sprites";
import { store } from "../net";
import { el, frameIcon, openDialog, registerMenu, spriteIcon } from "./dom";
import { registerHelpArt } from "./help-art";
import { iconKey, registerToolbarArt } from "./toolbar-art";
import "./help.css";

interface Entry {
  icons: (() => HTMLElement)[];
  /** Bold lead-in. */
  title: string;
  text: string;
  secret?: true;
  /** Title inked like the red ORIGINAL PLAN rubber stamp. */
  stamp?: true;
}

/** A sprite icon (single 16px icons read best at 1.5); `fallback` if its sheet didn't load. */
const sprite = (key: string, scale = 1, fallback?: string) => () => spriteIcon(iconKey(key, fallback), { scale });
/** A critter's own sprite if it has one, otherwise a fallback icon. */
const critter = (key: string, fallback: string) => () => spriteIcon(has(key) ? key : iconKey(fallback), { class: "help-critter" });
const sheep = () => frameIcon("sheep", 12, 32, 32, { class: "help-sheep" });
const lamb = () => frameIcon("sheepBaby", 12, 32, 32, { class: "help-sheep is-lamb" });
const shorn = () => frameIcon("sheepSheared", 13, 32, 32, { class: "help-sheep" });

const RETIRE_DAYS = Math.round(RETIRE_AFTER_MS / 86_400_000);

const ENTRIES: Entry[] = [
  { icons: [sheep], title: "Every plan is a sheep.", text: "Tap + to buy one. Its name is the plan." },
  { icons: [sprite("ui.heart.full", 2)], title: "Pet.", text: "Once a day each. Hearts = excitement." },
  { icons: [sprite("ui.tb.shears", 1.5)], title: "Did it? Shear it!", text: "The wool goes in the chest." },
  { icons: [shorn], title: "The Barn.", text: `Shorn sheep nap ${RETIRE_DAYS} days, then move in as memories.` },
  { icons: [lamb], title: "Lambs.", text: "New sheep start tiny. Grown by tomorrow." },
  { icons: [sprite("ui.icon.hat", 1.5)], title: "Hats.", text: `${HAT_COST} cloth, from any sheep's card.` },
  { icons: [sprite("ui.icon.flock", 1.5)], title: "Flock.", text: "Every sheep in one list." },
  {
    icons: [sprite("ui.hud.wool"), sprite("ui.hud.cloth")],
    title: "Wool → cloth.",
    text: `${LOOM_WOOL_COST} wool in the loom. Spend cloth at the carpenter's shop.`,
  },
  {
    icons: [sprite("ui.icon.chest"), sprite("item.forage.acorn", 1, "ui.icon.chest")],
    title: "Forage.",
    text: "Tap to pick it up. Shake a tree, then grab what falls. It all goes in the chest. Fill a bundle, get cloth.",
  },
  { icons: [sprite("ui.icon.calendar"), sprite("ui.icon.mail")], title: "Calendar & mail.", text: "Dated plans. Letters from Snickers, Otto & the sheep." },
  { icons: [sprite("ui.heart.full", 2), sprite("ui.heart.full", 2)], title: "One farm, two farmers.", text: "Everything shows up live." },
  { icons: [sprite("ui.hud.sound.on", 1.5, "ui.icon.sound")], title: "Sound.", text: "The speaker by the clock: tap for on or off." },
  {
    icons: [critter("fox.sit.0", "ui.star"), critter("hedgehog.idle.0", "ui.star")],
    title: "Otto & Milo.",
    text: "Fox and hedgehog. Best friends, champion nappers.",
  },
  { icons: [sprite("ui.icon.snickers", 1.5)], title: "Snickers.", text: "Pet his head. Rumor has it he has a secret button..." },
  { icons: [sprite("ui.icon.stamp", 1.5)], title: "ORIGINAL PLAN.", text: "Change a plan... then change it back.", secret: true, stamp: true },
  {
    icons: [sprite("ui.star", 2)],
    title: "Psst...",
    text: "Tap the grass a bunch. Knock on the stump. Look up at night. Sheep love a good baaaaah...",
    secret: true,
  },
  { icons: [sprite("ui.icon.wine", 1.5)], title: "Wine Wednesday.", text: "Keep an eye on the clock. (Thursdays too!!!!!)", secret: true },
  {
    icons: [sprite("critter.raccoon.peek", 1.5)],
    title: "Overheard...",
    text: "one of you two is a hundred raccoons in a trench coat.",
    secret: true,
  },
];

export function initHelp(): void {
  registerMenu("help", (arg?: { welcome?: boolean }) => openHelp(!!arg?.welcome));
}

function openHelp(welcome: boolean): void {
  registerToolbarArt();
  registerHelpArt();
  const farm = store.state?.farmName?.trim() || "Papa Snickers's Sheep Farm";

  const intro = welcome ? el("p", { class: "help-note" }, "The sheep can't wait to meet you... baa!") : null;

  const list = el("ul", { class: "help-list" });
  for (const e of ENTRIES) {
    list.appendChild(
      el(
        "li",
        { class: `help-entry ${e.secret ? "is-secret" : ""}` },
        el("div", { class: `help-entry__icons ${e.icons.length > 1 ? "is-pair" : ""}`, "aria-hidden": "true" }, ...e.icons.map((f) => f())),
        el("p", { class: "help-entry__text" }, el("b", { class: `help-entry__title ${e.stamp ? "is-stamp" : ""}` }, e.title), " ", e.text),
      ),
    );
  }

  const keys = matchMedia("(hover: hover) and (pointer: fine)").matches
    ? el("p", { class: "help-keys" }, el("kbd", null, "1"), "–", el("kbd", null, "8"), " toolbar · ", el("kbd", null, "Esc"), " close")
    : null;

  openDialog({
    title: welcome ? farm : "How It Works",
    className: "help-journal",
    body: [intro, list, keys],
    buttons: [{ label: welcome ? "Let's farm!" : "Got it!", kind: "primary" }],
  });
}
