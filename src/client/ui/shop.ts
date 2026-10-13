// Robin's Carpenter's Shop: spend cloth on decorations for the pasture, and the little
// menu that opens when you tap a decoration you already placed.

import "./shop.css";
import { sfx } from "../audio";
import { has, size } from "../engine/sprites";
import { api, store } from "../net";
import { stardewDate } from "../../shared/calendar";
import { DECOR_COST, DECOR_KINDS, type DecorKind, type Decoration } from "../../shared/types";
import { beginMoveDecor, beginPlaceDecor, decorArtKey, decorVariants } from "../world/world";
import { errorText, farmNow, friendly, hushTypewriter } from "./calendar-util";
import { closeAllDialogs, confirmDialog, el, openDialog, plural, registerMenu, spriteIcon, toast, typewriter } from "./dom";
import { registerRobinArt } from "./shop-art";
import { DECOR_INFO, variantLabel } from "./shop-catalog";

export { DECOR_INFO, decorName } from "./shop-catalog";

const ROBIN = { portrait: "portrait.robin", speaker: "Robin" };

/** Cheapest first, like a price list pinned to Robin's counter. */
const CATALOG: readonly DecorKind[] = [...DECOR_KINDS].sort((a, b) => DECOR_COST[a] - DECOR_COST[b]);

export function initShop(): void {
  registerRobinArt();
  registerMenu("shop", () => openShop());
  registerMenu("decor", (id?: unknown) => openDecor(String(id ?? "")));
}

/** A decoration icon that fits inside a box of `max` game pixels. */
export function decorIcon(kind: DecorKind, variant: number, max = 32): HTMLElement {
  const key = decorArtKey(kind, variant);
  if (!has(key)) return el("span", { class: "fm-decor-glyph", "aria-hidden": "true" }, DECOR_INFO[kind].glyph);
  const s = size(key);
  const fit = s ? Math.min(2, max / s.w, max / s.h) : 1;
  // Prefer whole-number scales so pixels stay square; only shrink big things fractionally.
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  return spriteIcon(key, { scale, class: "fm-decor-icon" });
}

function greeting(cloth: number, owned: number): string {
  const hour = farmNow().getHours();
  if (cloth === 0) return "Hey! Looks like you're out of cloth. Shear some sheep, run the loom, and come see me!";
  if (owned === 0) return "Ooh, your first decoration? Exciting! A scarecrow is a classic... but I won't judge a gnome.";
  if (hour >= 20 || hour < 6) return "It's past closing time... but for you two? I'll keep the lights on.";
  const lines = [
    "Hi there! Robin's Carpentry, at your service. I take payment in cloth these days. Don't ask.",
    "Oh, hey! Your sheep look extra fluffy today. Want something nice for their pasture?",
    "Demetrius says decorations 'improve ovine morale'. I just think they're cute.",
    "Sebastian's hiding in the basement again. Anyway! What can I build for you?",
    "Need something built? I can have it ready... well, right away. Valley magic!",
  ];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

// ---------- the shop ----------

function openShop(): void {
  const st = store.state;
  if (!st) {
    toast("Robin's still opening up shop... try again in a sec!");
    return;
  }
  const variants = new Map<DecorKind, number>();
  const line = el("p", { class: "sv-say fm-shop__say" });
  const root = el("div", { class: "fm-shop fm-menu" });

  const d = openDialog({
    title: "Carpenter's Shop",
    ...ROBIN,
    className: "fm-shop-dialog fm-menu",
    body: [el("div", { class: "fm-shop__robin" }, line, el("p", { class: "fm-shop__sig" }, "— Robin")), root],
    onClose: () => {
      off();
      hushTypewriter(d);
    },
  });
  void typewriter(line, greeting(st.cloth, st.decorations.length));

  function render(): void {
    const s = store.state;
    if (!s) return;
    const purse = el(
      "div",
      { class: "fm-shop__purse" },
      el("span", { class: "fm-count" }, spriteIcon("item.cloth"), el("span", null, `${s.cloth}`), el("span", { class: "fm-shop__unit" }, "cloth")),
    );
    const list = el("ul", { class: "fm-shop__list" });
    for (const kind of CATALOG) list.appendChild(el("li", null, row(kind, s.cloth)));
    root.replaceChildren(purse, list);
  }

  function row(kind: DecorKind, cloth: number): HTMLElement {
    const info = DECOR_INFO[kind];
    const cost = DECOR_COST[kind];
    const count = Math.max(1, decorVariants(kind));
    const variant = Math.min(variants.get(kind) ?? 0, count - 1);
    const afford = cloth >= cost;
    const iconBox = el("span", { class: "fm-shop__icon" }, decorIcon(kind, variant));

    const picker =
      count > 1
        ? el(
            "span",
            { class: "fm-shop__variant", role: "group", "aria-label": `${info.name} style` },
            el("button", { type: "button", class: "fm-shop__vbtn", "aria-label": "Previous style", on: { click: () => setVariant(kind, (variant + count - 1) % count) } }, "‹"),
            el("span", { class: "fm-shop__vlabel" }, variantLabel(kind, variant, count)),
            el("button", { type: "button", class: "fm-shop__vbtn", "aria-label": "Next style", on: { click: () => setVariant(kind, (variant + 1) % count) } }, "›"),
          )
        : null;

    return el(
      "div",
      { class: `fm-shop__item ${afford ? "" : "is-pricey"}` },
      iconBox,
      el(
        "div",
        { class: "fm-shop__info" },
        el("span", { class: "fm-shop__name" }, info.name),
        el("span", { class: "fm-shop__desc" }, info.desc),
        picker,
        afford ? null : el("span", { class: "fm-shop__need" }, `Needs ${plural(cost - cloth, "more cloth", "more cloth")}`),
      ),
      el(
        "div",
        { class: "fm-shop__buy" },
        el("span", { class: "fm-shop__price fm-count", "aria-label": `${cost} cloth` }, spriteIcon("item.cloth"), String(cost)),
        el(
          "button",
          {
            type: "button",
            class: "sv-btn sv-btn--primary fm-shop__btn",
            disabled: !afford,
            "aria-label": `Buy ${info.name} for ${cost} cloth`,
            on: { click: () => void buy(kind, variant) },
          },
          "Buy",
        ),
      ),
    );
  }

  function setVariant(kind: DecorKind, v: number): void {
    variants.set(kind, v);
    sfx("blip");
    render();
  }

  void d;
  const off = store.changed.on(render);
  render();
}

async function buy(kind: DecorKind, variant: number): Promise<void> {
  const name = DECOR_INFO[kind].name;
  sfx("select");
  closeAllDialogs();
  // The world shows its own "Tap where Robin should put it" banner while placing.
  const spot = await beginPlaceDecor(kind, variant);
  if (!spot) return;
  try {
    await api.buyDecor({ kind, fx: spot.fx, fy: spot.fy, variant });
    sfx("purchase");
    toast(`${name} placed! Thanks, Robin!`, { icon: decorArtKey(kind, variant) });
  } catch (err) {
    sfx("cancel");
    toast(errorText(err));
  }
}

// ---------- a placed decoration ----------

function openDecor(id: string): void {
  const st = store.state;
  const decor = st?.decorations.find((x) => x.id === id);
  if (!st || !decor) {
    toast("Hmm, that decoration isn't here anymore.");
    return;
  }
  const info = DECOR_INFO[decor.kind];
  const cost = DECOR_COST[decor.kind];
  const count = Math.max(1, decorVariants(decor.kind));
  const vlabel = variantLabel(decor.kind, decor.variant, count);

  openDialog({
    title: vlabel ? `${info.name} ${vlabel}` : info.name,
    ...ROBIN,
    className: "fm-decor-dialog fm-menu",
    body: el(
      "div",
      { class: "fm-decor fm-menu" },
      el("div", { class: "fm-decor__pic" }, decorIcon(decor.kind, decor.variant, 48)),
      el(
        "div",
        { class: "fm-decor__text" },
        el("p", { class: "fm-decor__desc" }, info.desc),
        el("p", { class: "fm-decor__when" }, `Placed ${stardewDate(new Date(decor.createdAt), st.foundedAt)}`),
        el("p", { class: "fm-decor__robin" }, `“Want me to move it? Or I can take it back and refund the ${plural(cost, "cloth", "cloth")}.” — Robin`),
      ),
    ),
    buttons: [
      {
        label: "Put away",
        kind: "danger",
        onClick: async () => {
          const ok = await confirmDialog(`Put the ${info.name} away? Robin will refund ${plural(cost, "cloth", "cloth")}.`, {
            yes: "Put away",
            no: "Keep it",
            ...ROBIN,
          });
          if (!ok) return false;
          await friendly(api.removeDecor(id));
          sfx("coin");
          toast(`${info.name} put away`, { icon: "item.cloth", count: cost });
        },
      },
      { label: "Move", kind: "primary", onClick: () => void move(decor) },
    ],
  });
}

async function move(decor: Decoration): Promise<void> {
  closeAllDialogs();
  const spot = await beginMoveDecor(decor.id);
  if (!spot) return;
  try {
    await api.moveDecor(decor.id, spot.fx, spot.fy);
    sfx("thud");
  } catch (err) {
    sfx("cancel");
    toast(errorText(err));
  }
}
