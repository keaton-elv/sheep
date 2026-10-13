// The farm sign: give the sign out front a fresh coat of paint (rename the farm).

import "./farmsign.css";
import { sfx } from "../audio";
import { has } from "../engine/sprites";
import { api, store } from "../net";
import { stardewDate } from "../../shared/calendar";
import { LIMITS } from "../../shared/types";
import { friendly } from "./calendar-util";
import { el, openDialog, registerMenu, spriteIcon, toast } from "./dom";
import { registerFarmSignArt } from "./farmsign-art";

export function initFarmSign(): void {
  registerFarmSignArt();
  registerMenu("farmSign", () => openFarmSign());
}

function openFarmSign(): void {
  const st = store.state;
  if (!st) {
    toast("The paint is still drying... try again in a sec!");
    return;
  }
  const plank = el("span", null, st.farmName);
  const input = el("input", {
    class: "sv-input",
    type: "text",
    maxLength: LIMITS.farmName,
    value: st.farmName,
    placeholder: "e.g. Ewe & Me Farm",
    autocomplete: "off",
    autocapitalize: "words",
    enterkeyhint: "done",
    "aria-label": "Farm name",
  });
  // Preview the new name on the plank as you type.
  input.addEventListener("input", () => {
    plank.textContent = input.value.trim() || "…";
  });

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
    className: "fm-sign-dialog fm-menu",
    body: el(
      "div",
      { class: "fm-sign fm-menu" },
      el(
        "div",
        { class: "fm-sign__hero", "aria-hidden": "true" },
        has("ui.menu.woodsign") ? spriteIcon("ui.menu.woodsign", { scale: 2, class: "fm-sign__post" }) : null,
        el("div", { class: "fm-sign__plank" }, plank),
      ),
      el("p", { class: "fm-sign__say" }, "A fresh coat of paint for the sign out front. What should it say?"),
      el("label", { class: "sv-field" }, el("span", { class: "sv-field__label" }, "Farm name"), input),
      el("p", { class: "fm-sign__founded" }, `Founded ${stardewDate(new Date(st.foundedAt), st.foundedAt)}`),
    ),
    buttons: [
      { label: "Never mind", kind: "plain" },
      { label: "Paint it!", kind: "primary", icon: "ui.star", onClick: async () => void (await save()) },
    ],
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
}
