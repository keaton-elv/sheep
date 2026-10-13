// The loom (5 wool -> 1 cloth, 4 in-game hours) and the chest (everything you've earned).

import "./loom.css";
import { sfx } from "../audio";
import { has, isReal } from "../engine/sprites";
import { api, serverNow, store } from "../net";
import { LOOM_DURATION_MS, LOOM_WOOL_COST, type FarmState } from "../../shared/types";
import { errorText } from "./calendar-util";
import { append, el, openDialog, openMenu, plural, registerMenu, spriteIcon, toast } from "./dom";
import { registerLoomArt } from "./loom-art";

export function initLoom(): void {
  registerLoomArt();
  registerMenu("loom", () => openLoom());
  registerMenu("chest", () => openChest());
}

type Phase = "idle" | "working" | "ready";

function phaseOf(st: FarmState, now = serverNow()): Phase {
  if (!st.loom) return "idle";
  return now >= st.loom.readyAt ? "ready" : "working";
}

/** "2:31" */
function mmss(ms: number): string {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

// ---------- loom ----------

function openLoom(): void {
  const root = el("div", { class: "fm-loom fm-menu" });
  let busy = false;
  let lastPhase: Phase | "" = "";
  let fill: HTMLElement | null = null;
  let countdown: HTMLElement | null = null;
  let bar: HTMLElement | null = null;

  const d = openDialog({
    title: "Loom",
    className: "fm-loom-dialog fm-menu",
    body: root,
    onClose: () => {
      off();
      clearInterval(timer);
    },
  });

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    d.error(null);
    render();
    try {
      await fn();
    } catch (err) {
      d.error(errorText(err));
    } finally {
      busy = false;
      render();
    }
  };

  const start = () =>
    run(async () => {
      await api.loomStart();
      sfx("loom");
    });

  const collect = () =>
    run(async () => {
      await api.loomCollect();
      sfx("pop");
      toast("Cloth", { icon: "item.cloth" });
    });

  function render(): void {
    const st = store.state;
    fill = countdown = bar = null;
    if (!st) {
      lastPhase = "";
      root.replaceChildren(el("p", { class: "sv-say" }, "The loom is still warming up..."));
      return;
    }
    const phase = phaseOf(st);
    lastPhase = phase;

    const art = el(
      "div",
      { class: `fm-loom__art is-${phase} ${isReal("ui.menu.loom") ? "is-real" : ""}` },
      phase === "ready" ? el("div", { class: "fm-loom__bubble", "aria-hidden": "true" }, spriteIcon("item.cloth")) : null,
      spriteIcon(phase === "working" ? "ui.menu.loom.working" : "ui.menu.loom", { scale: 2, class: "fm-loom__machine" }),
    );

    const status = el("div", { class: "fm-loom__status" });
    const woolLine = el("p", { class: "fm-count" }, spriteIcon("item.wool"), `You have ${plural(st.wool, "wool", "wool")}`);

    if (phase === "idle") {
      const enough = st.wool >= LOOM_WOOL_COST;
      const need = LOOM_WOOL_COST - st.wool;
      status.append(
        el("h3", null, "The loom is empty."),
        woolLine,
        el(
          "button",
          { type: "button", class: "sv-btn sv-btn--primary", disabled: !enough || busy, on: { click: start } },
          spriteIcon("item.wool"),
          el("span", null, `Put in ${LOOM_WOOL_COST} wool`),
        ),
        enough
          ? el("p", { class: "fm-loom__hint" }, "Takes 4 farm hours (about 3 real minutes).")
          : el("p", { class: "fm-loom__hint" }, `Needs ${plural(need, "more wool", "more wool")}. Go shear ${need === 1 ? "a sheep" : "some sheep"}!`),
      );
    } else if (phase === "working") {
      fill = el("div", { class: "fm-loom__fill" });
      countdown = el("span", { class: "fm-loom__time" });
      bar = el("div", { class: "fm-loom__bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "Weaving progress" }, fill);
      status.append(
        el("h3", null, "Clack, clack... weaving!"),
        bar,
        el("p", { class: "fm-loom__eta" }, "Cloth ready in ", countdown),
        woolLine,
      );
      tick();
    } else {
      status.append(
        el("h3", null, "Your cloth is ready!"),
        el(
          "button",
          { type: "button", class: "sv-btn sv-btn--primary fm-loom__collect", disabled: busy, on: { click: collect } },
          spriteIcon("item.cloth"),
          el("span", null, "Collect cloth"),
        ),
        woolLine,
      );
    }

    const footer = el(
      "div",
      { class: "fm-loom__footer" },
      el("span", { class: "fm-count" }, spriteIcon("item.cloth"), plural(st.cloth, "cloth", "cloth"), " in the chest"),
      st.cloth > 0
        ? el("button", { type: "button", class: "sv-btn", on: { click: () => openMenu("shop") } }, el("span", null, "Carpenter's shop ›"))
        : null,
    );

    root.replaceChildren(el("div", { class: "fm-loom__main" }, art, status), footer);
  }

  function tick(): void {
    const st = store.state;
    if (!st) return;
    const now = serverNow();
    const phase = phaseOf(st, now);
    if (phase !== lastPhase) {
      if (phase === "ready" && lastPhase === "working") sfx("pop", { volume: 0.5 });
      render();
      return;
    }
    if (phase !== "working" || !st.loom || !fill || !countdown) return;
    const total = Math.max(1, st.loom.readyAt - st.loom.startedAt) || LOOM_DURATION_MS;
    const pct = Math.min(100, Math.max(0, ((now - st.loom.startedAt) / total) * 100));
    fill.style.width = `${pct.toFixed(1)}%`;
    bar?.setAttribute("aria-valuenow", pct.toFixed(0));
    countdown.textContent = mmss(st.loom.readyAt - now);
  }

  const off = store.changed.on(render);
  const timer = window.setInterval(tick, 250);
  render();
}

// ---------- chest ----------

interface ChestItem {
  id: string;
  icon: string;
  name: string;
  count: number;
  desc: string;
}

const SLOTS = 24;
/** Snickers keeps his favorite toy hidden in the last slot. Shh. */
const SECRET_SLOT = SLOTS - 1;

function openChest(): void {
  const root = el("div", { class: "fm-chest fm-menu" });
  let selected: string | null = null;
  let secretPokes = 0;

  const d = openDialog({
    title: "Chest",
    className: "fm-chest-dialog fm-menu",
    body: root,
    buttons: [
      { label: "Loom", onClick: () => (openMenu("loom"), false) },
      { label: "Carpenter's shop", icon: "item.cloth", kind: "primary", onClick: () => (openMenu("shop"), false) },
    ],
    onClose: () => off(),
  });
  void d;
  sfx("chest");

  const items = (st: FarmState): ChestItem[] => {
    const list: ChestItem[] = [];
    if (st.wool > 0) {
      list.push({
        id: "wool",
        icon: "item.wool",
        name: "Wool",
        count: st.wool,
        desc: `Soft, fluffy, and full of memories. Put ${LOOM_WOOL_COST} in the loom!`,
      });
    }
    if (st.cloth > 0) {
      list.push({
        id: "cloth",
        icon: "item.cloth",
        name: "Cloth",
        count: st.cloth,
        desc: "Woven from your adventures. Spend it at the carpenter's shop, or on a fancy hat for a sheep.",
      });
    }
    return list;
  };

  const secret: ChestItem | null = has("item.feather")
    ? {
        id: "feather",
        icon: "item.feather",
        name: "Snickers' Feather",
        count: 1,
        desc: "His very favorite toy. He hid it in here. Do NOT tell him you found it.",
      }
    : null;

  function render(): void {
    const st = store.state;
    if (!st) {
      root.replaceChildren(el("p", { class: "sv-say" }, "The chest is stuck... (the farm is still loading)"));
      return;
    }
    const list = items(st);
    const all = new Map<string, ChestItem>(list.map((i) => [i.id, i]));
    if (secret) all.set(secret.id, secret);
    if (selected && !all.has(selected)) selected = null;

    const grid = el("div", { class: "fm-chest__grid", role: "list" });
    for (let i = 0; i < SLOTS; i++) {
      const item = i < list.length ? list[i] : i === SECRET_SLOT && secret ? secret : undefined;
      if (!item) {
        grid.appendChild(el("div", { class: "fm-slot is-empty", role: "listitem", "aria-hidden": "true" }));
        continue;
      }
      const slot = el(
        "button",
        {
          type: "button",
          class: `fm-slot ${selected === item.id ? "is-selected" : ""} ${item.id === "feather" ? "is-secret" : ""}`,
          role: "listitem",
          "aria-label": item.count > 1 ? `${item.name}, ${item.count}` : item.name,
          "aria-pressed": String(selected === item.id),
          on: { click: () => pick(item) },
        },
        // (spriteIcon sets --s inline, so the slot scale has to be passed here, not in CSS.)
        spriteIcon(item.icon, { scale: 1.25, class: "fm-slot__icon" }),
        item.count > 1 ? el("span", { class: "fm-slot__count" }, String(item.count)) : null,
      );
      grid.appendChild(slot);
    }

    const sel = selected ? all.get(selected) : undefined;
    const info = el("div", { class: "fm-chest__info", "aria-live": "polite" });
    if (sel) info.append(el("b", null, sel.count > 1 ? `${sel.name} ×${sel.count}` : sel.name), el("span", null, sel.desc));
    else {
      info.classList.add("is-idle");
      append(
        info,
        has("ui.menu.chest") ? spriteIcon("ui.menu.chest", { class: "fm-chest__pic" }) : null,
        el(
          "span",
          { class: "fm-chest__idle" },
          list.length ? "Tap something to look at it." : "Empty! Shear a sheep to get wool.",
        ),
      );
    }

    root.replaceChildren(
      grid,
      info,
      el(
        "p",
        { class: "fm-chest__lifetime fm-count" },
        spriteIcon("item.wool"),
        `Lifetime wool: ${st.totalWool}`,
        st.loom ? el("span", { class: "fm-chest__loom" }, phaseOf(st) === "ready" ? " · cloth ready in the loom!" : " · the loom is busy") : null,
      ),
    );
  }

  function pick(item: ChestItem): void {
    if (item.id === "feather" && selected === "feather") {
      secretPokes++;
      if (secretPokes === 1) {
        sfx("meow");
        toast("Somewhere outside, a grey cat's ears just perked up...", { icon: "item.feather" });
        return;
      }
    }
    selected = item.id;
    sfx(item.id === "feather" ? "rustle" : "select");
    render();
  }

  const off = store.changed.on(render);
  render();
}
