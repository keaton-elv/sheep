// The Carpenter's Shop: spend cloth on decorations for the pasture, and the little menu that
// opens when you tap a decoration you already placed. No shopkeeper: just a sign, a price
// list and a narrator.

import "./shop.css";
import { sfx } from "../audio";
import { has, size } from "../engine/sprites";
import { api, store } from "../net";
import { stardewDate } from "../../shared/calendar";
import { DECOR_COST, DECOR_KINDS, HAT_COST, type DecorKind, type Decoration } from "../../shared/types";
import { beginMoveDecor, beginPlaceDecor, decorArtKey, decorVariantName, decorVariants } from "../world/world";
import { hatIcon } from "../entities/sheep-hats";
import { errorText, farmNow, friendly } from "./calendar-util";
import { closeAllDialogs, confirmDialog, el, openDialog, plural, registerMenu, spriteIcon, toast } from "./dom";
import { registerShopArt } from "./shop-art";
import { DECOR_INFO, variantLabel } from "./shop-catalog";

export { DECOR_INFO, decorName } from "./shop-catalog";

/** Cheapest first, like a price list pinned up by the door. */
const CATALOG: readonly DecorKind[] = [...DECOR_KINDS].sort((a, b) => DECOR_COST[a] - DECOR_COST[b]);

/** A top hat for the "hats live on the sheep cards" note. */
const NOTE_HAT = 2;

export function initShop(): void {
  registerShopArt();
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

/** The look's own name ("Deluxe Scarecrow", "Spooky Skeleton"), if it has one. */
function lookName(kind: DecorKind, variant: number): string | null {
  let name: string | null = null;
  try {
    name = decorVariantName(kind, variant);
  } catch {
    name = null;
  }
  return name || null;
}

/** "Deluxe Scarecrow", "Rarecrow: Spooky Skeleton", or just the kind's name. */
export function decorFullName(kind: DecorKind, variant: number): string {
  const base = DECOR_INFO[kind].name;
  const look = lookName(kind, variant);
  if (!look) {
    const label = variantLabel(kind, variant, Math.max(1, decorVariants(kind)));
    return label ? `${base} ${label}` : base;
  }
  return kind === "rarecrow" ? `${base}: ${look}` : look;
}

/** A line from the shop's narrator (no shopkeeper here, just a cozy shop). */
function shopLine(cloth: number, owned: number): string {
  const hour = farmNow().getHours();
  if (cloth === 0) return "Your cloth pouch is empty. Shear some sheep, run the loom, and come back!";
  if (owned === 0) return "Your very first decoration! A scarecrow is a classic... but nobody here will judge a gnome.";
  if (hour >= 20 || hour < 6) return "The shop lights are still on. Night owls welcome.";
  const lines = [
    "Sawdust, fresh pine, and a little bell over the door. Everything here is paid for in cloth.",
    "Something nice for the pasture? The sheep have opinions, but they're mostly “baa”.",
    "Built while you wait. (Valley magic.)",
    "Decorations improve sheep morale. That's just science.",
    "A chalkboard by the counter reads: “Will build for cloth. Hats? Ask a sheep.”",
  ];
  return lines[Math.floor(Math.random() * lines.length)]!;
}

// ---------- the shop ----------

function openShop(): void {
  const st = store.state;
  if (!st) {
    toast("The shop is still opening up... try again in a sec!");
    return;
  }
  const variants = new Map<DecorKind, number>();
  const root = el("div", { class: "fm-shop fm-menu" });
  const line = shopLine(st.cloth, st.decorations.length);

  const d = openDialog({
    title: "Carpenter's Shop",
    className: "fm-shop-dialog fm-menu",
    body: root,
    onClose: () => off(),
  });

  function render(): void {
    const s = store.state;
    if (!s) return;
    const sign = el(
      "div",
      { class: "fm-shop__top" },
      el(
        "div",
        { class: "fm-shop__sign" },
        has("ui.shop.axe") ? spriteIcon("ui.shop.axe", { class: "fm-shop__axe" }) : null,
        el("span", null, "Open daily"),
      ),
      el(
        "div",
        { class: "fm-shop__purse", "aria-label": `You have ${plural(s.cloth, "cloth", "cloth")}` },
        el("span", { class: "fm-count" }, spriteIcon("item.cloth"), el("span", null, `${s.cloth}`), el("span", { class: "fm-shop__unit" }, "cloth")),
      ),
    );
    const list = el("ul", { class: "fm-shop__list" });
    for (const kind of CATALOG) list.appendChild(el("li", null, row(kind, s.cloth)));
    root.replaceChildren(sign, el("p", { class: "fm-shop__say" }, line), list, hatNote());
  }

  function row(kind: DecorKind, cloth: number): HTMLElement {
    const info = DECOR_INFO[kind];
    const cost = DECOR_COST[kind];
    const count = Math.max(1, decorVariants(kind));
    const variant = Math.min(variants.get(kind) ?? 0, count - 1);
    const afford = cloth >= cost;
    const look = lookName(kind, variant);
    const full = decorFullName(kind, variant);
    const iconBox = el("span", { class: "fm-shop__icon" }, decorIcon(kind, variant));

    const picker =
      count > 1
        ? el(
            "span",
            { class: "fm-shop__variant", role: "group", "aria-label": `${info.name} style` },
            el("button", { type: "button", class: "fm-shop__vbtn", "aria-label": "Previous style", on: { click: () => setVariant(kind, (variant + count - 1) % count) } }, "‹"),
            el(
              "span",
              { class: "fm-shop__vlabel", "aria-live": "polite" },
              look ? el("span", { class: "fm-shop__vname" }, look) : null,
              el("span", { class: "fm-shop__vnum" }, `${variant + 1}/${count}`),
            ),
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
            "aria-label": `Buy ${full} for ${cost} cloth`,
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

/** Hats aren't sold here: they're picked right on a sheep's card. */
function hatNote(): HTMLElement {
  let icon: HTMLElement | null = null;
  try {
    icon = hatIcon(NOTE_HAT, { scale: 1 });
  } catch {
    icon = null;
  }
  return el(
    "p",
    { class: "fm-shop__hats" },
    icon ? el("span", { class: "fm-shop__hatpic" }, icon) : null,
    el(
      "span",
      null,
      el("b", null, "Hats?"),
      ` Tap any sheep and pick one from its card. (${plural(HAT_COST, "cloth", "cloth")} each.)`,
    ),
  );
}

async function buy(kind: DecorKind, variant: number): Promise<void> {
  const name = decorFullName(kind, variant);
  sfx("select");
  closeAllDialogs();
  // The world shows its own "tap where it should go" banner while placing.
  const spot = await beginPlaceDecor(kind, variant);
  if (!spot) return;
  try {
    await api.buyDecor({ kind, fx: spot.fx, fy: spot.fy, variant });
    sfx("purchase");
    toast(`${name} placed!`, { icon: decorArtKey(kind, variant) });
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
  const name = decorFullName(decor.kind, decor.variant);

  openDialog({
    title: name,
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
        el("p", { class: "fm-decor__hint" }, `Move it somewhere new, or put it away for a full refund (${plural(cost, "cloth", "cloth")}).`),
      ),
    ),
    buttons: [
      {
        label: "Put away",
        kind: "danger",
        onClick: async () => {
          const ok = await confirmDialog(`Put the ${name} away? You'll get ${plural(cost, "cloth", "cloth")} back.`, {
            yes: "Put away",
            no: "Keep it",
          });
          if (!ok) return false;
          await friendly(api.removeDecor(id));
          sfx("coin");
          toast(`${name} put away`, { icon: "item.cloth", count: cost });
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
