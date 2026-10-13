// The farm sign: Mayor Lewis helps you (re)name the farm.

import "./farmsign.css";
import { sfx } from "../audio";
import { api, store } from "../net";
import { stardewDate } from "../../shared/calendar";
import { LIMITS } from "../../shared/types";
import { friendly, hushTypewriter } from "./calendar-util";
import { el, openDialog, registerMenu, spriteIcon, toast, typewriter } from "./dom";
import { registerLewisArt } from "./farmsign-art";

const LEWIS = { portrait: "portrait.lewis", speaker: "Mayor Lewis" };

const NAME_IDEAS = [
  "Ewe & Me Farm",
  "Woolly Acres",
  "Baaaah Farm",
  "Fluffernutter Farm",
  "Sweater Weather Farm",
  "Two Sheep Farm",
  "Stardrop Meadows",
  "Cloud Nine Farm",
  "Shear Bliss Farm",
  "Haystack Hollow",
  "Purl & Plait Farm",
  "Mutton Button Farm",
  "Cozy Fleece Farm",
  "Sleepy Sheep Farm",
  "Moonlight Meadow",
  "Lamb Chop Lane",
];

export function initFarmSign(): void {
  registerLewisArt();
  registerMenu("farmSign", () => openFarmSign());
}

function openFarmSign(): void {
  const st = store.state;
  if (!st) {
    toast("Mayor Lewis is still looking for his pen...");
    return;
  }
  const line = el("p", { class: "sv-say fm-sign__say" });
  const input = el("input", {
    class: "sv-input",
    type: "text",
    maxLength: LIMITS.farmName,
    value: st.farmName,
    placeholder: "e.g. Ewe & Me Farm",
    autocomplete: "off",
    enterkeyhint: "done",
    "aria-label": "Farm name",
  });
  let lastIdea = -1;
  const dice = el(
    "button",
    {
      type: "button",
      class: "sv-btn fm-sign__dice",
      "aria-label": "Suggest a name",
      title: "Suggest a name",
      on: {
        click: () => {
          let i = Math.floor(Math.random() * NAME_IDEAS.length);
          if (i === lastIdea) i = (i + 1) % NAME_IDEAS.length;
          lastIdea = i;
          input.value = NAME_IDEAS[i]!;
          sfx("blip");
          dice.classList.remove("is-rolling");
          void dice.offsetWidth; // restart the wiggle
          dice.classList.add("is-rolling");
        },
      },
    },
    spriteIcon("ui.dice"),
  );

  const save = async (): Promise<boolean> => {
    const name = input.value.trim().replace(/\s+/g, " ");
    const current = store.state?.farmName ?? st.farmName;
    if (!name) throw new Error("Every farm needs a name! Even a silly one.");
    if (name === current) {
      toast(`${name} it stays! A fine name.`);
      return true;
    }
    await friendly(api.renameFarm(name));
    sfx("chime");
    toast(`Welcome to ${name}!`, { icon: "ui.star" });
    return true;
  };

  const d = openDialog({
    title: "Farm Sign",
    ...LEWIS,
    className: "fm-sign-dialog fm-menu",
    body: el(
      "div",
      { class: "fm-sign fm-menu" },
      el("div", { class: "fm-sign__plank", "aria-hidden": "true" }, el("span", null, st.farmName)),
      line,
      el("p", { class: "fm-sign__sig" }, "— Mayor Lewis"),
      el("label", { class: "sv-field" }, el("span", { class: "sv-field__label" }, "Farm name"), el("div", { class: "fm-sign__row" }, input, dice)),
      el("p", { class: "fm-sign__founded" }, `Founded ${stardewDate(new Date(st.foundedAt), st.foundedAt)}`),
    ),
    buttons: [
      { label: "Never mind", kind: "plain" },
      { label: "That's the one!", kind: "primary", icon: "ui.star", onClick: async () => void (await save()) },
    ],
    onClose: () => hushTypewriter(d),
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    d.error(null);
    d.setBusy(true);
    save()
      .then(() => d.close())
      .catch((err: unknown) => d.error(err instanceof Error ? err.message : String(err)))
      .finally(() => d.setBusy(false));
  });

  void typewriter(line, "Ah, hello! The town records need your farm's name. What would you like to call it?");
}
