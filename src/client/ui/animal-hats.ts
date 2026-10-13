// The hat picker: try hats on a sheep in a tiny fitting room, buy one for HAT_COST cloth,
// or take it off for free. Opened from the animal card's "Hat" button.

import { sfx } from "../audio";
import { has, registerArt } from "../engine/sprites";
import { sheepEmote } from "../entities/sheep";
import { hatChoices, hatName } from "../entities/sheep-hats";
import { api, isRetired, store } from "../net";
import { HAT_COST, LOOM_WOOL_COST, MAX_HAT_ID } from "../../shared/types";
import { crispPx, farmMoment, friendlyError } from "./animal-common";
import { SheepSprite, hatCell, hatTileIcon, lookOf } from "./animal-sprite";
import { el, openDialog, plural, spriteIcon, toast, type DialogHandle } from "./dom";

const openPickers = new Set<string>();

/** The hat as a sprite key, so the "looks fabulous!" toast can show it. */
function hatToastIcon(id: number): string {
  const key = `ui.hat.${id}`;
  if (!has(key)) {
    try {
      const c = hatTileIcon(id, 1);
      if (c.width > 1) registerArt(key, c);
    } catch {
      // no icon, no problem
    }
  }
  return has(key) ? key : "ui.sheep";
}

function niceHatName(id: number): string {
  try {
    return hatName(id) || "A mystery hat";
  } catch {
    return "A mystery hat";
  }
}

/** The curated hats we can actually draw, with the sheep's current hat first if it isn't one of them. */
function availableHats(current: number | null): number[] {
  let list: number[] = [];
  try {
    list = hatChoices();
  } catch {
    list = [];
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const h of current === null ? list : [current, ...list]) {
    if (!Number.isInteger(h) || h < 0 || h > MAX_HAT_ID || seen.has(h)) continue;
    seen.add(h);
    if (hatCell(h)) out.push(h);
  }
  return out;
}

export function openHatPicker(id: string): void {
  const first = store.sheep(id);
  if (!first) {
    toast("That sheep wandered off.");
    return;
  }
  if (openPickers.has(id)) return;
  openPickers.add(id);

  let name = first.name;
  let current: number | null = first.hat;
  let selected: number | null = first.hat;
  const hats = availableHats(current);

  // ----- the fitting room -----
  const sprite = new SheepSprite(() => {});
  const moment = farmMoment();
  sprite.scene.classList.add("an-scene--fitting");
  sprite.scene.dataset.season = moment.season;
  sprite.scene.classList.toggle("is-night", moment.isNight);

  const hatTitle = el("p", { class: "an-hat__name", "aria-live": "polite" });
  const priceLine = el("p", { class: "an-hat__price" });
  const wallet = el("p", { class: "an-hat__wallet" });
  const top = el("div", { class: "an-hat__top" }, el("div", { class: "an-frame an-frame--fitting" }, sprite.scene), el("div", { class: "an-hat__info" }, hatTitle, priceLine, wallet));

  // ----- the hat rack -----
  const grid = el("div", { class: "an-hat__grid", role: "group", "aria-label": "Hats" });
  const tiles = new Map<number | null, HTMLButtonElement>();
  const addTile = (hat: number | null) => {
    const label = hat === null ? "No hat" : niceHatName(hat);
    const tile = el(
      "button",
      { class: `an-hat__tile ${hat === null ? "an-hat__tile--none" : ""}`, type: "button", title: label, "aria-label": label, "aria-pressed": "false" },
      hat === null ? el("span", { class: "an-hat__none" }, "No hat") : hatTileIcon(hat, 1),
      el("span", { class: "an-hat__badge", "aria-hidden": "true" }, "✓"),
    );
    tile.addEventListener("click", () => {
      if (selected === hat) return;
      selected = hat;
      sfx("blip");
      sprite.hop(false);
      update();
    });
    tiles.set(hat, tile);
    grid.append(tile);
  };
  addTile(null);
  hats.forEach(addTile);

  const empty = hats.length === 0 ? el("p", { class: "an-hat__note" }, "The hat rack is still being unpacked. Check back soon!") : null;
  const note = el("p", { class: "an-hat__note", hidden: true });

  let dialog: DialogHandle | undefined;
  dialog = openDialog({
    title: "Pick a Hat",
    className: "an-dialog an-hatdialog",
    body: el("div", { class: "an-card an-hat", style: `--ipx: ${crispPx(1.5, 2.25)}; --ipx-sm: ${crispPx(1.25, 2)}` }, top, grid, empty, note),
    onClose: () => {
      openPickers.delete(id);
      unsubscribe();
      sprite.stop();
    },
    buttons: [
      { label: "Cancel", kind: "plain" },
      {
        label: "Put it on",
        kind: "primary",
        onClick: async (d) => {
          const s = store.sheep(id);
          if (!s) return;
          const want = selected;
          if (want === s.hat) return; // "Done"
          const cloth = store.state?.cloth ?? 0;
          if (want !== null && cloth < HAT_COST) {
            sfx("cancel");
            note.hidden = false;
            note.textContent = shortOfClothText();
            return false;
          }
          try {
            await api.setHat(id, want);
          } catch (err) {
            d.error(friendlyError(err));
            d.box.querySelector(".sv-dialog__error")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            return false;
          }
          if (want === null) {
            sfx("woosh");
            toast(`${s.name}'s hat is off. Breezy!`, { icon: "ui.sheep" });
          } else {
            sfx("purchase");
            toast(`${s.name} looks fabulous!`, { icon: hatToastIcon(want) });
            sheepEmote(id, "heart");
          }
        },
      },
    ],
  });
  const primary = dialog.box.querySelector<HTMLButtonElement>(".sv-dialog__buttons .sv-btn--primary");
  const primaryLabel = primary?.querySelector("span") ?? null;
  const primaryIcon = spriteIcon("item.cloth", { class: "an-hat__btnicon" });

  const unsubscribe = store.changed.on(() => {
    const s = store.sheep(id);
    if (!s || isRetired(s)) {
      dialog?.close();
      return;
    }
    update();
  });

  update();

  function shortOfClothText(): string {
    return `A hat costs ${plural(HAT_COST, "cloth", "cloth")}. Weave ${LOOM_WOOL_COST} wool into cloth at the loom, then come back!`;
  }

  function update(): void {
    const s = store.sheep(id);
    if (!s) return;
    name = s.name;
    current = s.hat;
    const cloth = store.state?.cloth ?? 0;
    const short = cloth < HAT_COST;
    const look = lookOf(s);

    sprite.set({ look, golden: s.golden, asleep: false, hat: selected, label: `${name} trying on ${selected === null ? "no hat" : niceHatName(selected)}` });

    // Header text
    hatTitle.textContent = selected === null ? "No hat" : niceHatName(selected);
    const wearing = selected === current;
    priceLine.replaceChildren(
      wearing
        ? el("span", { class: "an-hat__tag an-hat__tag--on" }, selected === null ? "Bare-headed" : "Wearing it now")
        : selected === null
          ? el("span", { class: "an-hat__tag" }, "Free to take off")
          : el("span", { class: `an-hat__tag ${short ? "an-hat__tag--short" : ""}` }, spriteIcon("item.cloth"), plural(HAT_COST, "cloth", "cloth")),
    );
    wallet.replaceChildren("You have ", spriteIcon("item.cloth"), el("b", null, String(cloth)), " cloth");

    // Tiles
    for (const [hat, tile] of tiles) {
      tile.setAttribute("aria-pressed", String(hat === selected));
      tile.classList.toggle("is-selected", hat === selected);
      tile.classList.toggle("is-current", hat === current);
      tile.classList.toggle("is-short", hat !== null && hat !== current && short);
    }

    // The main button says exactly what will happen.
    if (!note.hidden && !(selected !== null && selected !== current && short)) note.hidden = true;
    let label: string;
    let blocked = false;
    let withIcon = false;
    if (wearing) label = "Done";
    else if (selected === null) label = "Take it off";
    else if (short) {
      label = `Need ${plural(HAT_COST, "cloth", "cloth")}`;
      blocked = true;
    } else {
      label = `Buy for ${HAT_COST}`;
      withIcon = true;
    }
    if (primary && primaryLabel) {
      primaryLabel.textContent = label;
      if (withIcon && !primaryIcon.isConnected) primary.append(primaryIcon);
      else if (!withIcon && primaryIcon.isConnected) primaryIcon.remove();
      primary.classList.toggle("is-blocked", blocked);
      primary.setAttribute("aria-disabled", String(blocked));
    }
  }
}
