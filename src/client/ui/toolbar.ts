// Stardew's toolbar along the bottom: Hand and Shears (tools), then shortcuts to the ranch
// (+ a new sheep), the Flock list, the calendar, The Barn, the mailbox, and a "…" menu with the
// rest (the carpenter's shop, loom, chest, name tags, sound, music, how it works, log out).
// Copy is minimal on purpose: icons do the talking; hover labels are a name and a few words.
// Mobile first: every slot is at least 40 CSS px, and the bar fits a 360px-wide phone.

import { isMusicOn, isMuted, musicResting, playTestSound, setMuted, setMusicOn, sfx } from "../audio";
import type { Game, Tool } from "../engine/game";
import { flipped } from "../engine/pixelart";
import { isReal, spriteCanvas, spriteUrl } from "../engine/sprites";
import { api } from "../net";
import { confirmDialog, el, isDialogOpen, openMenu, spriteIcon, toast, uiRoot } from "./dom";
import type { MenuName } from "./dom";
import { closePopover, togglePopover } from "./hud-popover";
import { onMailChange, unreadMailCount } from "./mailbox";
import { iconKey, registerToolbarArt } from "./toolbar-art";
import "./toolbar.css";

const LABELS_KEY = "farm.labels";
const HELP_KEY = "farm.helpSeen";
const SHEARS_HINT_KEY = "farm.shearsHint";

/** Game-pixel geometry of the bar. */
const BORDER = 5;
const GAP = 1;
const SEP = 3;
const MIN_SLOT_CSS = 40;

interface SlotDef {
  id: string;
  icon: string;
  name: string;
  hint: string;
  tool?: Tool;
  menu?: MenuName;
  more?: true;
}

const SLOTS: SlotDef[] = [
  { id: "hand", icon: "tool.hand", name: "Hand", hint: "Pet & peek", tool: "hand" },
  { id: "shears", icon: "ui.tb.shears", name: "Shears", hint: "Did it? Snip snip!", tool: "shears" },
  { id: "new", icon: "ui.tool.plus-sheep", name: "New plan", hint: "Off to the ranch...", menu: "ranch" },
  { id: "flock", icon: "ui.icon.flock", name: "Flock", hint: "Find a sheep", menu: "flock" },
  { id: "calendar", icon: "ui.icon.calendar", name: "Calendar", hint: "Dated plans", menu: "calendar" },
  { id: "barn", icon: "ui.icon.barn", name: "The Barn", hint: "Memories", menu: "barn" },
  { id: "mail", icon: "ui.icon.mail", name: "Mailbox", hint: "Letters", menu: "mailbox" },
  { id: "more", icon: "ui.icon.more", name: "More", hint: "Shop, loom, chest...", more: true },
];

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: fine, it just won't be remembered */
  }
}

export function labelsOn(): boolean {
  return storageGet(LABELS_KEY) !== "0";
}

export function initToolbar(g: Game): void {
  registerToolbarArt();
  if (document.querySelector(".tb")) return; // already mounted (re-login)

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--tb-img-bar", `url("${spriteUrl("ui.tb.bar")}")`);
  rootStyle.setProperty("--tb-img-slot", `url("${spriteUrl("ui.tb.slot")}")`);
  rootStyle.setProperty("--tb-img-selected", `url("${spriteUrl("ui.tb.selected")}")`);
  setupCursors();

  // ---------- DOM ----------

  const bar = el("div", { class: "tb__bar" });
  const nav = el("nav", { class: "tb", "aria-label": "Toolbar" }, bar);
  const label = el("div", { class: "sv-box tb__label", "aria-hidden": "true" });
  const buttons = new Map<string, HTMLButtonElement>();
  let mailBadge: HTMLElement | null = null;

  SLOTS.forEach((def, i) => {
    const icon = spriteIcon(iconKey(def.icon), { class: "tb__icon" });
    icon.style.setProperty("--s", "var(--tb-icon-s)");
    const btn = el(
      "button",
      {
        class: `tb__slot ${def.tool ? "is-tool" : ""} ${i === 2 ? "is-first-action" : ""}`,
        type: "button",
        dataset: { slot: def.id },
        "aria-label": `${def.name}: ${def.hint}`,
        "aria-keyshortcuts": String(i + 1),
      },
      icon,
      el("span", { class: "tb__key", "aria-hidden": "true" }, String(i + 1)),
    );
    if (def.tool) btn.setAttribute("aria-pressed", "false");
    if (def.more) {
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", "false");
    }
    if (def.id === "mail") {
      mailBadge = el("span", { class: "tb__badge", hidden: true, "aria-hidden": "true" });
      btn.appendChild(mailBadge);
    }
    btn.addEventListener("click", (ev) => activate(def, btn, ev.detail === 0));
    btn.addEventListener("pointerenter", (ev) => {
      if (ev.pointerType === "mouse") showLabel(def, btn);
    });
    btn.addEventListener("pointerleave", hideLabel);
    btn.addEventListener("pointerdown", hideLabel);
    buttons.set(def.id, btn);
    bar.appendChild(btn);
  });

  uiRoot.appendChild(nav);
  uiRoot.appendChild(label);

  // ---------- behaviour ----------

  function activate(def: SlotDef, btn: HTMLButtonElement, viaKeyboard = false): void {
    hideLabel();
    if (def.tool) {
      closePopover(true);
      if (g.tool !== def.tool) sfx("select");
      g.setTool(def.tool);
      syncTool();
      if (def.tool === "shears" && !storageGet(SHEARS_HINT_KEY)) {
        storageSet(SHEARS_HINT_KEY, "1");
        toast("Tap a sheep you've done ✂", { icon: "tool.shears", ms: 4200 });
      }
      return;
    }
    if (def.more) {
      const pop = togglePopover({ anchor: btn, placement: "above", label: "More", className: "tb-more", content: buildMoreMenu() });
      if (pop && viaKeyboard) pop.root.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    if (def.menu) {
      closePopover(true);
      openMenu(def.menu);
    }
  }

  function syncTool(): void {
    for (const def of SLOTS) {
      if (!def.tool) continue;
      const btn = buttons.get(def.id)!;
      const on = g.tool === def.tool;
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-pressed", String(on));
    }
    document.body.dataset.tool = g.tool;
  }
  g.on("tool", syncTool);
  syncTool();

  // Mail badge (Stardew's bouncing letter).
  const syncMail = (n: number) => {
    if (!mailBadge) return;
    mailBadge.hidden = n <= 0;
    mailBadge.textContent = n > 9 ? "9+" : String(n);
    const btn = buttons.get("mail")!;
    btn.classList.toggle("has-mail", n > 0);
    btn.setAttribute("aria-label", n > 0 ? `Mailbox: ${n} new ${n === 1 ? "letter" : "letters"}` : "Mailbox");
  };
  syncMail(unreadMailCount());
  onMailChange(syncMail);

  // Name tags: tell the sheep the current setting once at start.
  g.emit("labels", labelsOn());

  // ---------- the "…" menu ----------

  function buildMoreMenu(): HTMLElement {
    const list = el("div", { class: "tb-more__list", role: "menu" });
    const item = (icon: string, text: string, state: string | null, onClick: () => void) => {
      const b = el(
        "button",
        { class: "tb-more__item", type: "button", role: "menuitem" },
        el("span", { class: "tb-more__icon" }, spriteIcon(iconKey(icon))),
        el("span", { class: "tb-more__text" }, text),
        state ? el("span", { class: `tb-more__state ${state === "On" ? "is-on" : ""}` }, state) : null,
      );
      b.addEventListener("click", onClick);
      list.appendChild(b);
      return b;
    };
    const go = (menu: MenuName) => () => {
      closePopover(true);
      openMenu(menu);
    };
    item("ui.icon.shop", "Carpenter's Shop", null, go("shop"));
    item("ui.icon.loom", "Loom", null, go("loom"));
    item("ui.icon.chest", "Chest", null, go("chest"));
    item("ui.icon.tag", "Name tags", labelsOn() ? "On" : "Off", () => {
      const on = !labelsOn();
      storageSet(LABELS_KEY, on ? "1" : "0");
      g.emit("labels", on);
      sfx("select");
      closePopover(true);
      toast(on ? "Name tags on. Hello, everyone!" : "Name tags off. Mystery sheep...", { icon: "ui.icon.tag" });
    });
    // The same switch as the speaker by the clock.
    item(isMuted() ? "ui.icon.mute" : "ui.icon.sound", "Sound", isMuted() ? "Off" : "On", () => {
      const next = !isMuted();
      setMuted(next);
      closePopover(true);
      toast(next ? "Sound off. baa... (quietly)" : "Sound on. Baaa!", { icon: next ? "ui.icon.mute" : "ui.icon.sound" });
      // (This tap also wakes the sound up; the baa waits until it's really running.)
      if (!next) playTestSound();
    });
    item("ui.icon.music", "Music", isMusicOn() ? "On" : "Off", () => {
      const on = !isMusicOn();
      setMusicOn(on);
      sfx("select");
      closePopover(true);
      const rest = musicResting();
      const text = !on
        ? "Music off. Just the farm now."
        : isMuted()
          ? "Music on. (Sound's off: tap the speaker.)"
          : rest === "night"
            ? "Music on. It rests till morning..."
            : rest === "rain"
              ? "Music on. Just the rain for now..."
              : "Music on. Baa la la!";
      toast(text, { icon: "ui.icon.music" });
    });
    item("ui.icon.help", "How it works", null, go("help"));
    // Arrow keys move between items (Tab works too; Escape closes the popover).
    list.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp" && ev.key !== "Home" && ev.key !== "End") return;
      const items = [...list.querySelectorAll<HTMLButtonElement>(".tb-more__item")];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      let n = ev.key === "Home" ? 0 : ev.key === "End" ? items.length - 1 : i + (ev.key === "ArrowDown" ? 1 : -1);
      n = (n + items.length) % items.length;
      ev.preventDefault();
      items[n]?.focus();
    });
    item("ui.icon.logout", "Log out", null, async () => {
      closePopover(true);
      const ok = await confirmDialog("Heading home? You'll need the password to get back in.", { yes: "Log out", no: "Stay", danger: true });
      if (!ok) return;
      try {
        await api.logout();
      } catch {
        /* reload anyway; the gate will sort it out */
      }
      location.reload();
    });
    return list;
  }

  // ---------- hover labels (desktop) ----------

  let labelFor: HTMLElement | null = null;
  function showLabel(def: SlotDef, btn: HTMLElement): void {
    labelFor = btn;
    label.replaceChildren(el("b", { class: "tb__label-name" }, def.name), el("span", { class: "tb__label-hint" }, def.hint));
    label.classList.add("is-on");
    const r = btn.getBoundingClientRect();
    const barTop = bar.getBoundingClientRect().top;
    const w = label.offsetWidth;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    label.style.left = `${Math.round(left)}px`;
    label.style.bottom = `${Math.round(window.innerHeight - barTop + 8)}px`;
  }
  function hideLabel(): void {
    if (!labelFor) return;
    labelFor = null;
    label.classList.remove("is-on");
  }

  // ---------- keyboard: 1-8 pick slots ----------

  addEventListener("keydown", (ev) => {
    if (ev.defaultPrevented || ev.altKey || ev.ctrlKey || ev.metaKey || ev.repeat) return;
    if (isDialogOpen()) return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector(".farm-gate")) return;
    const n = Number(ev.key);
    if (!Number.isInteger(n) || n < 1 || n > SLOTS.length) return;
    const def = SLOTS[n - 1]!;
    ev.preventDefault();
    const btn = buttons.get(def.id)!;
    btn.classList.add("is-pressed");
    setTimeout(() => btn.classList.remove("is-pressed"), 120);
    activate(def, btn, true);
  });

  // ---------- sizing ----------

  const layout = () => {
    const cs = g.cssScale;
    const scale = g.scale;
    const dpr = scale / cs;
    const n = SLOTS.length;
    const total = (slot: number, gap: number, sep: number) => n * slot + (n - 1) * gap + sep + BORDER * 2;
    const avail = g.w - 4;
    // Slots >= 40 CSS px where possible, an even number of device pixels wide (so icons center
    // on whole pixels), and the roomiest gaps that still fit on screen.
    const target = Math.max(20, Math.ceil(MIN_SLOT_CSS / cs - 1e-6));
    const sizes = [target, target + 1];
    for (let sl = target - 1; sl >= 14; sl--) sizes.push(sl);
    const spacings: [number, number][] = [
      [GAP, SEP],
      [GAP, 0],
      [0, 0],
    ];
    let pick: [number, number, number] | null = null;
    let fallback: [number, number, number] | null = null;
    outer: for (const sl of sizes) {
      for (const [ga, se] of spacings) {
        if (total(sl, ga, se) > avail) continue;
        fallback ??= [sl, ga, se];
        if ((sl * scale) % 2 === 0) {
          pick = [sl, ga, se];
          break outer;
        }
      }
    }
    const [slot, gap, sep] = pick ?? fallback ?? [14, 0, 0];
    // Icon scale: whole device pixels per art pixel, as big as fits nicely in the slot.
    let ipx = Math.floor(((slot - 4) * scale) / 16);
    if (slot >= 18) ipx = Math.max(ipx, scale);
    ipx = Math.max(1, ipx);
    const barW = total(slot, gap, sep);
    const barH = slot + BORDER * 2;
    nav.style.setProperty("--tb-slot", String(slot));
    nav.style.setProperty("--tb-gap", String(gap));
    nav.style.setProperty("--tb-sep", String(sep));
    nav.style.setProperty("--tb-icon-s", String(ipx / scale));
    nav.style.width = `calc(var(--px) * ${barW})`;
    nav.style.height = `calc(var(--px) * ${barH})`;
    const cssW = barW * cs;
    nav.style.left = `${Math.round(((window.innerWidth - cssW) / 2) * dpr) / dpr}px`;
    const toolbarH = `${Math.round((barH + 4) * cs)}px`;
    if (rootStyle.getPropertyValue("--toolbar-h") !== toolbarH) {
      rootStyle.setProperty("--toolbar-h", toolbarH);
      // The farm layout reserves room for the toolbar; re-run it with the real height.
      queueMicrotask(() => g.relayout());
    }
  };
  // Resize listeners share one emit(): never let this one break the others.
  const safeLayout = () => {
    try {
      layout();
    } catch (err) {
      console.warn("[toolbar] layout", err);
    }
  };
  safeLayout();
  g.on("resize", safeLayout);

  // ---------- first visit: show how the farm works ----------

  if (!storageGet(HELP_KEY)) {
    let tries = 0;
    const tryShow = () => {
      if (storageGet(HELP_KEY)) return;
      if (isDialogOpen() || document.querySelector(".farm-gate")) {
        if (++tries < 30) setTimeout(tryShow, 2000);
        return;
      }
      storageSet(HELP_KEY, "1");
      openMenu("help", { welcome: true });
    };
    setTimeout(tryShow, 1400);
  }
}

/** Custom cursors on desktop: shears while the shears are out; the hand over pettable things. */
function setupCursors(): void {
  try {
    // Blades up-left so the hotspot is the tip. The real sprite already points that way.
    const real = isReal("ui.tb.shears");
    const src = spriteCanvas(real ? "ui.tb.shears" : "tool.shears", 1);
    const shears = real ? src : flipped(null, src);
    const big = document.createElement("canvas");
    big.width = 32;
    big.height = 32;
    const c = big.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    c.drawImage(shears, 0, 0, 32, 32);
    const hand = spriteCanvas("tool.hand", 2);
    const root = document.documentElement.style;
    root.setProperty("--cursor-shears", `url("${big.toDataURL()}") ${real ? "4 4" : "3 3"}, crosshair`);
    root.setProperty("--cursor-hand", `url("${hand.toDataURL()}") 13 3, pointer`);
  } catch {
    /* default cursors are fine */
  }
}
