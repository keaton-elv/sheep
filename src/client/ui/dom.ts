// DOM helpers and the Stardew-style dialog system every menu is built on.

import { sfx } from "../audio";
import { has, spriteCanvas } from "../engine/sprites";
import { MAX_PETS } from "../../shared/types";
import "./dom.css";

// ---------- element builder ----------

type Child = Node | string | number | null | undefined | false;
type Props = {
  class?: string;
  style?: Partial<CSSStyleDeclaration> | string;
  dataset?: Record<string, string>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
  [attr: string]: unknown;
};

/** el("button", { class: "sv-btn", on: { click } }, "OK") */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = String(v);
      else if (k === "style") {
        if (typeof v === "string") node.setAttribute("style", v);
        else Object.assign(node.style, v);
      } else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k === "on") {
        for (const [ev, fn] of Object.entries(v as Record<string, EventListener>)) node.addEventListener(ev, fn);
      } else if (k in node && typeof v !== "string") (node as any)[k] = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(node, ...children);
  return node;
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

/** The overlay that holds HUD, toolbar and dialogs (above the canvas). */
export const uiRoot: HTMLElement = (() => {
  let root = document.getElementById("ui");
  if (!root) {
    root = el("div", { id: "ui" });
    document.body.appendChild(root);
  }
  return root;
})();

// ---------- sprites in the DOM ----------

/** A sprite as a crisp pixel-art <canvas>, scaled with --px so it matches the farm. */
export function spriteIcon(key: string, opts: { scale?: number; class?: string; title?: string } = {}): HTMLCanvasElement {
  const c = spriteCanvas(key, 1);
  c.className = `sv-sprite ${opts.class ?? ""}`;
  c.style.setProperty("--w", String(c.width));
  c.style.setProperty("--h", String(c.height));
  c.style.setProperty("--s", String(opts.scale ?? 1));
  if (opts.title) c.title = opts.title;
  c.setAttribute("aria-hidden", "true");
  return c;
}

/** A frame from a grid sheet (e.g. sheep frame 0) as a DOM sprite. */
export function frameIcon(sheet: string, index: number, fw: number, fh: number, opts: { scale?: number; class?: string } = {}): HTMLCanvasElement {
  const c = spriteCanvas("", 1, { sheet, index, fw, fh });
  c.className = `sv-sprite ${opts.class ?? ""}`;
  c.style.setProperty("--w", String(fw));
  c.style.setProperty("--h", String(fh));
  c.style.setProperty("--s", String(opts.scale ?? 1));
  c.setAttribute("aria-hidden", "true");
  return c;
}

/** Five Stardew hearts for 0..MAX_PETS half-hearts. */
export function heartsEl(pets: number, opts: { scale?: number } = {}): HTMLElement {
  const wrap = el("span", { class: "sv-hearts", role: "img", "aria-label": `${pets / 2} of 5 hearts` });
  const p = Math.max(0, Math.min(MAX_PETS, pets));
  for (let i = 0; i < 5; i++) {
    const filled = p - i * 2;
    const key = filled >= 2 ? "ui.heart.full" : filled === 1 ? "ui.heart.half" : "ui.heart.empty";
    wrap.appendChild(spriteIcon(key, { scale: opts.scale ?? 1 }));
  }
  return wrap;
}

// ---------- menus registry ----------

export type MenuName =
  | "marnie" // buy a sheep (new todo). arg: { date?: string }
  | "editSheep" // edit a sheep. arg: sheep id
  | "sheep" // animal info card. arg: sheep id
  | "shear" // shear flow. arg: sheep id
  | "calendar"
  | "barn"
  | "loom"
  | "chest"
  | "shop" // Robin's decorations
  | "decor" // a placed decoration. arg: decoration id
  | "mailbox"
  | "farmSign" // rename the farm
  | "help"; // how the farm works

const menus = new Map<MenuName, (arg?: any) => void>();

export function registerMenu(name: MenuName, open: (arg?: any) => void): void {
  menus.set(name, open);
}

export function openMenu(name: MenuName, arg?: unknown): void {
  const open = menus.get(name);
  if (!open) {
    console.warn(`[ui] no menu registered for "${name}"`);
    return;
  }
  open(arg);
}

// ---------- dialogs ----------

export interface DialogButton {
  label: string;
  /** Return false (or a promise of false) to keep the dialog open. Throwing shows the error. */
  onClick?: (d: DialogHandle) => void | boolean | Promise<void | boolean>;
  kind?: "primary" | "danger" | "plain";
  /** Sprite key for an icon before the label. */
  icon?: string;
}

export interface DialogOptions {
  title?: string;
  /** Sprite key of a character portrait (e.g. "portrait.marnie"); shown on the right like Stardew. */
  portrait?: string;
  speaker?: string;
  body?: Child | Child[];
  buttons?: DialogButton[];
  className?: string;
  /** Backdrop click / Escape / ✕ closes it. Default true. */
  dismissable?: boolean;
  onClose?: () => void;
  /** Play the menu open/close sounds. Default true. */
  sounds?: boolean;
}

export interface DialogHandle {
  root: HTMLElement;
  box: HTMLElement;
  body: HTMLElement;
  close(): void;
  setBusy(busy: boolean): void;
  /** Show an inline error line (e.g. API failure) inside the dialog. */
  error(message: string | null): void;
  closed: Promise<void>;
}

const stack: DialogHandle[] = [];

export function isDialogOpen(): boolean {
  return stack.length > 0;
}

export function closeAllDialogs(): void {
  while (stack.length) stack[stack.length - 1]!.close();
}

addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || !stack.length) return;
  const top = stack[stack.length - 1]!;
  if (top.root.dataset.dismissable === "true") {
    ev.preventDefault();
    top.close();
  }
});

export function openDialog(opts: DialogOptions): DialogHandle {
  const dismissable = opts.dismissable ?? true;
  const sounds = opts.sounds ?? true;
  const body = el("div", { class: "sv-dialog__body" });
  append(body, ...(Array.isArray(opts.body) ? opts.body : [opts.body]));
  const errorLine = el("p", { class: "sv-dialog__error", role: "alert", hidden: true });
  const buttons = el("div", { class: "sv-dialog__buttons" });

  const box = el(
    "div",
    {
      class: `sv-box sv-dialog ${opts.portrait ? "sv-dialog--portrait" : ""} ${opts.className ?? ""}`,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": opts.title ?? opts.speaker ?? "Dialog",
    },
    opts.title ? el("h2", { class: "sv-dialog__title" }, opts.title) : null,
    el("div", { class: "sv-dialog__main" }, el("div", { class: "sv-dialog__content" }, body, errorLine), opts.portrait ? portraitEl(opts.portrait, opts.speaker) : null),
    buttons,
  );
  const root = el("div", { class: "sv-backdrop", dataset: { dismissable: String(dismissable) } }, box);

  let resolveClosed!: () => void;
  const closed = new Promise<void>((r) => (resolveClosed = r));
  let isClosed = false;

  const handle: DialogHandle = {
    root,
    box,
    body,
    closed,
    close() {
      if (isClosed) return;
      isClosed = true;
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      root.classList.add("is-closing");
      if (sounds) sfx("menuClose");
      setTimeout(() => root.remove(), 120);
      opts.onClose?.();
      resolveClosed();
      // Return focus to the previous dialog, if any.
      stack[stack.length - 1]?.box.focus();
    },
    setBusy(busy) {
      box.classList.toggle("is-busy", busy);
      buttons.querySelectorAll("button").forEach((b) => ((b as HTMLButtonElement).disabled = busy));
    },
    error(message) {
      errorLine.hidden = !message;
      errorLine.textContent = message ?? "";
      if (message) sfx("cancel");
    },
  };

  for (const b of opts.buttons ?? []) {
    const btn = el(
      "button",
      { class: `sv-btn sv-btn--${b.kind ?? "plain"}`, type: "button" },
      b.icon && has(b.icon) ? spriteIcon(b.icon) : null,
      el("span", null, b.label),
    );
    btn.addEventListener("click", async () => {
      sfx("select");
      if (!b.onClick) return handle.close();
      handle.error(null);
      try {
        handle.setBusy(true);
        const keep = await b.onClick(handle);
        if (keep !== false) handle.close();
      } catch (err) {
        handle.error(err instanceof Error ? err.message : String(err));
      } finally {
        handle.setBusy(false);
      }
    });
    buttons.appendChild(btn);
  }
  if (!opts.buttons?.length) buttons.remove();

  if (dismissable) {
    const x = el("button", { class: "sv-close", type: "button", "aria-label": "Close" }, has("ui.close") ? spriteIcon("ui.close") : "✕");
    x.addEventListener("click", () => handle.close());
    box.appendChild(x);
    root.addEventListener("pointerdown", (ev) => {
      if (ev.target === root) handle.close();
    });
  }

  box.tabIndex = -1;
  uiRoot.appendChild(root);
  stack.push(handle);
  if (sounds) sfx("menuOpen");
  requestAnimationFrame(() => {
    const first = box.querySelector<HTMLElement>("[autofocus], input, textarea, select");
    // Don't pop the keyboard open on phones unless asked; focus the box itself instead.
    if (first?.hasAttribute("autofocus") || (first && !matchMedia("(pointer: coarse)").matches)) first.focus();
    else box.focus();
  });
  return handle;
}

function portraitEl(key: string, speaker?: string): HTMLElement {
  return el(
    "div",
    { class: "sv-portrait" },
    el("div", { class: "sv-portrait__frame" }, has(key) ? spriteIcon(key, { class: "sv-portrait__img" }) : null),
    speaker ? el("div", { class: "sv-portrait__name" }, speaker) : null,
  );
}

// ---------- dialogue helpers ----------

/**
 * Stardew-style typewriter: reveals text a few characters at a time with a soft blip.
 * Tapping the dialog finishes it instantly.
 */
export function typewriter(target: HTMLElement, text: string, opts: { speed?: number; silent?: boolean } = {}): Promise<void> {
  const speed = opts.speed ?? 28;
  target.textContent = "";
  target.classList.add("sv-typing");
  return new Promise((resolve) => {
    let i = 0;
    let timer = 0;
    const finish = () => {
      clearInterval(timer);
      target.textContent = text;
      target.classList.remove("sv-typing");
      target.closest(".sv-dialog")?.removeEventListener("pointerdown", finish);
      resolve();
    };
    target.closest(".sv-dialog")?.addEventListener("pointerdown", finish, { once: true });
    timer = window.setInterval(() => {
      i++;
      target.textContent = text.slice(0, i);
      if (!opts.silent && i % 3 === 0 && text[i - 1] !== " ") sfx("blip");
      if (i >= text.length) finish();
    }, speed);
  });
}

/** A character says one or more lines (tap / OK to advance). Resolves when done. */
export async function say(lines: string | string[], opts: { portrait?: string; speaker?: string; title?: string } = {}): Promise<void> {
  const all = Array.isArray(lines) ? lines : [lines];
  for (let i = 0; i < all.length; i++) {
    const p = el("p", { class: "sv-say" });
    const last = i === all.length - 1;
    const d = openDialog({
      portrait: opts.portrait,
      speaker: opts.speaker,
      title: opts.title,
      body: p,
      buttons: [{ label: last ? "OK" : "▶", kind: "primary" }],
      sounds: i === 0,
    });
    void typewriter(p, all[i]!);
    await d.closed;
  }
}

/** Stardew's yes/no question box. */
export function confirmDialog(
  question: string,
  opts: { yes?: string; no?: string; danger?: boolean; portrait?: string; speaker?: string; title?: string } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const d = openDialog({
      title: opts.title,
      portrait: opts.portrait,
      speaker: opts.speaker,
      body: el("p", { class: "sv-say" }, question),
      buttons: [
        { label: opts.no ?? "No", kind: "plain" },
        { label: opts.yes ?? "Yes", kind: opts.danger ? "danger" : "primary", onClick: () => void (answer = true) },
      ],
      onClose: () => resolve(answer),
    });
    void d;
  });
}

/** Ask for a line (or paragraph) of text. Resolves null if cancelled. */
export function promptDialog(opts: {
  title?: string;
  label: string;
  value?: string;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  ok?: string;
  portrait?: string;
  speaker?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    let result: string | null = null;
    const input = opts.multiline
      ? el("textarea", { class: "sv-input", rows: 4, maxLength: opts.maxLength ?? 1000, placeholder: opts.placeholder ?? "" })
      : el("input", { class: "sv-input", type: "text", maxLength: opts.maxLength ?? 200, placeholder: opts.placeholder ?? "", autofocus: true });
    input.value = opts.value ?? "";
    const form = el("label", { class: "sv-field" }, el("span", { class: "sv-field__label" }, opts.label), input);
    const d = openDialog({
      title: opts.title,
      portrait: opts.portrait,
      speaker: opts.speaker,
      body: form,
      buttons: [
        { label: "Cancel", kind: "plain" },
        { label: opts.ok ?? "OK", kind: "primary", onClick: () => void (result = input.value.trim()) },
      ],
      onClose: () => resolve(result),
    });
    if (!opts.multiline) {
      input.addEventListener("keydown", (ev) => {
        if ((ev as KeyboardEvent).key === "Enter") {
          ev.preventDefault();
          result = input.value.trim();
          d.close();
        }
      });
    }
  });
}

// ---------- toasts (Stardew's bottom-left "item received" popups) ----------

const toastStack = el("div", { class: "sv-toasts", "aria-live": "polite" });
uiRoot.appendChild(toastStack);

export function toast(text: string, opts: { icon?: string; count?: number; ms?: number } = {}): void {
  const item = el(
    "div",
    { class: "sv-box sv-toast" },
    opts.icon && has(opts.icon) ? spriteIcon(opts.icon, { class: "sv-toast__icon" }) : el("span", { class: "sv-toast__bang" }, "!"),
    el("span", { class: "sv-toast__text" }, text),
    opts.count && opts.count > 1 ? el("span", { class: "sv-toast__count" }, `x${opts.count}`) : null,
  );
  toastStack.appendChild(item);
  setTimeout(() => item.classList.add("is-leaving"), opts.ms ?? 3200);
  setTimeout(() => item.remove(), (opts.ms ?? 3200) + 400);
}

// ---------- misc ----------

/** Plural helper: plural(3, "wool") -> "3 wool", plural(2, "sheep", "sheep"). */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3 days ago", "today", "in 2 days". */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
