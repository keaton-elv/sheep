// Letters about what happened on the farm while you were away, Stardew style.
// Built from store.state.events: anything newer than the last letter this browser saw,
// minus the things this tab did itself (you know about those already).

import "./mailbox.css";
import { sfx } from "../audio";
import { serverNow, store } from "../net";
import { stardewDate } from "../../shared/calendar";
import type { DecorKind, FarmEvent, FarmEventKind, FarmState } from "../../shared/types";
import { openMemory } from "./barn";
import { safeStorage, sheepHead, timeAgo } from "./calendar-util";
import { el, openDialog, openMenu, plural, registerMenu, spriteIcon, toast } from "./dom";
import { registerMailboxArt } from "./mailbox-art";
import { decorIcon } from "./shop";
import { DECOR_INFO, decorName } from "./shop-catalog";

const LS_SEEN = "farm.mail.lastSeen";
const LS_OWN = "farm.mail.own";
const LS_WELCOME = "farm.mail.welcomeRead";
/** An event that arrived without telling us who caused it gets this long to be claimed by this tab. */
const PENDING_MS = 3000;
const OWN_CAP = 80;
const OLD_LETTERS = 4;

/** Highest event id this browser has read. null = never opened the farm here before. */
let lastSeen: number | null = parseIntOrNull(safeStorage.get(LS_SEEN));
/** Events this tab caused (auto-read). */
const ownIds = new Set<number>(parseIds(safeStorage.get(LS_OWN)));
/** Events we know came from someone else (the other farmer). */
const remoteIds = new Set<number>();
let welcomeUnread = false;
let primed = false;
let started = false;
let lastNotified = -1;
let recheck = 0;
let lastChime = 0;
let liveRefresh: (() => void) | null = null;
const listeners = new Set<(unread: number) => void>();
let cache: { state: FarmState | null; count: number } = { state: null, count: 0 };

function parseIntOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseIds(v: string | null): number[] {
  if (!v) return [];
  try {
    const arr: unknown = JSON.parse(v);
    return Array.isArray(arr) ? arr.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function saveSeen(): void {
  if (lastSeen !== null) safeStorage.set(LS_SEEN, String(lastSeen));
}

function saveOwn(): void {
  const ids = [...ownIds].filter((id) => lastSeen === null || id > lastSeen).sort((a, b) => a - b);
  ownIds.clear();
  for (const id of ids.slice(-OWN_CAP)) ownIds.add(id);
  safeStorage.set(LS_OWN, JSON.stringify([...ownIds]));
}

function maxEventId(st: FarmState): number {
  let m = 0;
  for (const e of st.events) if (e.id > m) m = e.id;
  return m;
}

/** Unread letters (events), newest first. Fresh unclaimed events wait a moment (see PENDING_MS). */
function unreadEvents(st: FarmState, now = serverNow()): FarmEvent[] {
  if (lastSeen === null) return [];
  const seen = lastSeen;
  return st.events.filter(
    (e) => e.id > seen && !ownIds.has(e.id) && (remoteIds.has(e.id) || !store.connected || now - e.at >= PENDING_MS),
  );
}

/** How many letters are waiting in the mailbox (for the world's mailbox flag + toolbar badge). */
export function unreadMailCount(): number {
  const st = store.state;
  if (!st) return 0;
  // Cheap enough to call every frame: notify() refreshes the cache whenever anything changes.
  if (cache.state === st) return cache.count;
  return unreadEvents(st).length + (welcomeUnread ? 1 : 0);
}

/** Subscribe to unread-count changes. Returns an unsubscribe function. */
export function onMailChange(fn: (unread: number) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  clearTimeout(recheck);
  const st = store.state;
  if (!st) return;
  // Re-check once any "pending" events have waited long enough.
  if (lastSeen !== null && store.connected) {
    const now = serverNow();
    let soonest = Infinity;
    for (const e of st.events) {
      if (e.id <= lastSeen || ownIds.has(e.id) || remoteIds.has(e.id)) continue;
      const wait = e.at + PENDING_MS - now;
      if (wait > 0) soonest = Math.min(soonest, wait);
    }
    if (soonest !== Infinity) recheck = window.setTimeout(notify, soonest + 50);
  }
  const n = unreadEvents(st).length + (welcomeUnread ? 1 : 0);
  cache = { state: st, count: n };
  if (n !== lastNotified) {
    lastNotified = n;
    listeners.forEach((fn) => fn(n));
  }
  liveRefresh?.();
}

function onState(st: FarmState): void {
  const max = maxEventId(st);
  if (!primed) {
    primed = true;
    // Mayor Lewis's welcome letter waits in the box until it's been read once on this device.
    welcomeUnread = safeStorage.get(LS_WELCOME) !== "1";
  }
  if (lastSeen === null) {
    // First visit on this device: don't flood the mailbox with old news, just say hello.
    lastSeen = max;
    saveSeen();
  } else if (max < lastSeen) {
    // The farm was reset (ids went backwards): start over from here.
    lastSeen = max;
    saveSeen();
  }
  notify();
}

function markAllSeen(st: FarmState): void {
  lastSeen = Math.max(lastSeen ?? 0, maxEventId(st));
  saveSeen();
  saveOwn();
  if (welcomeUnread) {
    welcomeUnread = false;
    safeStorage.set(LS_WELCOME, "1");
  }
  notify();
}

export function initMailbox(): void {
  registerMailboxArt();
  registerMenu("mailbox", () => openMailbox());
  if (started) return;
  started = true;

  store.events.on(({ event, own }) => {
    if (own) {
      ownIds.add(event.id);
      saveOwn();
    } else {
      remoteIds.add(event.id);
      const now = Date.now();
      if (lastSeen !== null && event.id > lastSeen && now - lastChime > 1500) {
        lastChime = now;
        sfx("chime");
      }
    }
    notify();
  });
  store.changed.on(onState);
  store.connection.on(() => notify());
  if (store.state) onState(store.state);
}

// ---------- letters ----------

interface Letter {
  key: string;
  at: number;
  greeting: string;
  body: string;
  sign: string;
  gift: HTMLElement | null;
  action: { label: string; run: () => void } | null;
  isNew: boolean;
}

const q = (s: string) => `“${s}”`;

function nameList(names: string[]): string {
  const quoted = names.map(q);
  if (quoted.length <= 1) return quoted.join("");
  if (quoted.length > 4) return `${quoted.slice(0, 3).join(", ")} and ${quoted.length - 3} more`;
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

function gift(icon: HTMLElement | null): HTMLElement | null {
  return icon ? el("span", { class: "fm-letter__gift", title: "Attached" }, icon) : null;
}

function sheepAction(id: string | null, label: string): Letter["action"] {
  if (!id) return null;
  const s = store.sheep(id);
  if (!s) return null;
  return {
    label: label.replace("{name}", s.name),
    run: () => {
      const cur = store.sheep(id);
      if (!cur) toast("That sheep isn't on the farm anymore.");
      else if (cur.shearedAt !== null) openMemory(id);
      else openMenu("sheep", id);
    },
  };
}

/** Bursts of "bought"/"sheared" (within a few minutes) become one letter; the rest are one letter each. */
const BURST_MS = 15 * 60 * 1000;

function toLetters(events: FarmEvent[], isNew: boolean): Letter[] {
  const groups: FarmEvent[][] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && (e.kind === "bought" || e.kind === "sheared") && prev.kind === e.kind && Math.abs(prev.at - e.at) < BURST_MS) {
      last.push(e);
    } else groups.push([e]);
  }
  return groups.map((g) => (g.length === 1 ? letterFor(g[0]!, isNew) : groupLetter(g[0]!.kind, g, isNew)));
}

function groupLetter(kind: FarmEventKind, g: FarmEvent[], isNew: boolean): Letter {
  const names = nameList(g.map((e) => e.subject));
  const at = g[0]!.at;
  if (kind === "bought") {
    return {
      key: `g-bought-${g[0]!.id}`,
      at,
      greeting: "Hi there, you two!",
      body: `${plural(g.length, "new sheep", "new sheep")} arrived on the farm: ${names}. That's a lot of plans! Give them a pet every day and they'll be the happiest flock in the valley.`,
      sign: "Marnie",
      gift: gift(sheepHead(false, { scale: 1.5 })),
      action: null,
      isNew,
    };
  }
  return {
    key: `g-sheared-${g[0]!.id}`,
    at,
    greeting: "Dear farmers,",
    body: `${plural(g.length, "sheep", "sheep")} got sheared: ${names}! So many adventures. We carried all the wool to the chest and did a little dance.`,
    sign: "the Junimos ★",
    gift: gift(spriteIcon("item.wool")),
    action: null,
    isNew,
  };
}

function letterFor(e: FarmEvent, isNew: boolean): Letter {
  const base = { key: `e-${e.id}`, at: e.at, isNew, gift: null, action: null } as const;
  switch (e.kind) {
    case "bought":
      return {
        ...base,
        greeting: "Hi there, you two!",
        body: `A new sheep named ${q(e.subject)} just arrived on the farm! It already found a favorite patch of grass. Don't forget to give it a pet every day.`,
        sign: "Marnie",
        gift: gift(sheepHead(false, { scale: 1.5 })),
        action: sheepAction(e.sheepId, "Say hi to {name}"),
      };
    case "sheared":
      return {
        ...base,
        greeting: "Dear farmers,",
        body: `${q(e.subject)} got sheared! You did the thing! We carried the wool to the chest for you. (We also danced a little.)`,
        sign: "the Junimos ★",
        gift: gift(spriteIcon("item.wool")),
        action: sheepAction(e.sheepId, "Write a memory"),
      };
    case "sold":
      return {
        ...base,
        greeting: "Hi there, you two!",
        body: `I picked up ${q(e.subject)} today. Don't worry, it's going to a lovely farm across the valley. Plans change, and that's okay!`,
        sign: "Marnie",
      };
    case "loomed":
      return {
        ...base,
        greeting: "Hello, farmers!",
        body: "A fresh bolt of cloth just came off your loom! Robin's been eyeing it for decorations... or I could sew you two matching outfits. Just kidding. Mostly!",
        sign: "Emily",
        gift: gift(spriteIcon("item.cloth")),
      };
    case "decorated": {
      const known = Object.hasOwn(DECOR_INFO, e.subject);
      return {
        ...base,
        greeting: "Hey, you two!",
        body: `Hope you love the new ${decorName(e.subject)}! It took me no time at all. Let me know if you want it moved, I'm always around.`,
        sign: "Robin",
        gift: gift(known ? decorIcon(e.subject as DecorKind, 0, 16) : null),
      };
    }
    case "renamed":
      return {
        ...base,
        greeting: "Dear farmers,",
        body: `I've updated the town records: your farm is now officially called ${q(e.subject)}. What a lovely name! I'll have a new sign made.`,
        sign: "Mayor Lewis",
        gift: gift(spriteIcon("ui.star")),
      };
    case "unsheared":
      return {
        ...base,
        greeting: "Farmers,",
        body: `I sensed a disturbance in the fluff. ${q(e.subject)}'s wool has... grown back?! Most curious. Perhaps the plan isn't finished after all.`,
        sign: "M. Rasmodius, Wizard",
        action: sheepAction(e.sheepId, "Visit {name}"),
      };
    default:
      return { ...base, greeting: "Dear farmers,", body: "Something happened on the farm!", sign: "Mayor Lewis" };
  }
}

function welcomeLetter(st: FarmState): Letter {
  const woolly = st.sheep.filter((s) => s.shearedAt === null).length;
  return {
    key: "welcome",
    at: st.serverNow,
    greeting: "Dear new farmers,",
    body:
      `Welcome to ${st.farmName}! Every sheep in the pasture is a plan you two want to do together. ` +
      "Buy new ones from Marnie, and once you've done the thing, shear that sheep! The wool goes in the chest." +
      (woolly ? ` There ${woolly === 1 ? "is" : "are"} already ${plural(woolly, "sheep", "sheep")} waiting for you.` : "") +
      "\n\nP.S. If you find a pair of purple shorts... please return them. Discreetly.",
    sign: "Mayor Lewis",
    gift: gift(sheepHead(false, { scale: 1.5 })),
    action: null,
    isNew: true,
  };
}

function letterEl(l: Letter, st: FarmState, i: number): HTMLElement {
  const date = l.key === "welcome" ? "Today" : `${stardewDate(new Date(l.at), st.foundedAt)} · ${timeAgo(l.at, serverNow())}`;
  return el(
    "article",
    { class: `fm-letter ${l.isNew ? "is-new" : "is-read"} ${i % 2 ? "is-tilt-r" : "is-tilt-l"}` },
    l.isNew ? el("span", { class: "fm-letter__seal", "aria-label": "New" }) : null,
    el("p", { class: "fm-letter__date" }, date),
    el("p", { class: "fm-letter__greeting" }, l.greeting),
    el("p", { class: "fm-letter__body" }, l.body),
    el(
      "div",
      { class: "fm-letter__foot" },
      l.gift,
      el("p", { class: "fm-letter__sign" }, `— ${l.sign}`),
    ),
    l.action
      ? el("button", { type: "button", class: "fm-letter__action", on: { click: l.action.run } }, `${l.action.label} ›`)
      : null,
  );
}

function openMailbox(): void {
  const st0 = store.state;
  const root = el("div", { class: "fm-mail fm-menu" });
  if (!st0) {
    openDialog({ title: "Mailbox", className: "fm-mail-dialog fm-menu", body: el("p", { class: "sv-say" }, "The mailbox is empty... for now. (The farm is still loading.)") });
    return;
  }

  // Everything unread right now (plus anything that arrives while the box is open) is "new".
  const shownNew = new Set<number>(unreadEvents(st0).map((e) => e.id));
  const showWelcome = welcomeUnread;
  const d = openDialog({
    title: shownNew.size || showWelcome ? "You've got mail!" : "Mailbox",
    className: "fm-mail-dialog fm-menu",
    body: root,
    onClose: () => {
      if (liveRefresh === refresh) liveRefresh = null;
    },
  });
  const title = d.box.querySelector(".sv-dialog__title");
  if (shownNew.size || showWelcome) sfx("pop", { volume: 0.6 });

  const render = () => {
    const st = store.state;
    if (!st) return;
    const fresh = st.events.filter((e) => shownNew.has(e.id));
    const old = st.events.filter((e) => !shownNew.has(e.id) && !(lastSeen !== null && e.id > lastSeen && !ownIds.has(e.id)));
    const letters: Letter[] = [];
    if (showWelcome) letters.push(welcomeLetter(st));
    letters.push(...toLetters(fresh, true));
    const hasNew = letters.length > 0;
    const oldLetters = toLetters(old, false).slice(0, hasNew ? 2 : OLD_LETTERS);
    if (title) title.textContent = hasNew ? (letters.length === 1 ? "You've got mail!" : `${plural(letters.length, "new letter")}!`) : "Mailbox";

    const parts: HTMLElement[] = [];
    if (!hasNew) {
      parts.push(
        el(
          "div",
          { class: "fm-mail__empty" },
          spriteIcon("ui.letter", { scale: 2 }),
          el("p", { class: "sv-say" }, "No new mail."),
        ),
      );
    }
    letters.forEach((l, i) => parts.push(letterEl(l, st, i)));
    if (oldLetters.length) {
      parts.push(el("h3", { class: "fm-mail__old" }, hasNew ? "Older letters" : "Letters you've read"));
      oldLetters.forEach((l, i) => parts.push(letterEl(l, st, i + 1)));
    } else if (!hasNew) {
      parts.push(el("p", { class: "fm-quip" }, "Even Pierre hasn't sent a flyer. Go make some memories!"));
    }
    root.replaceChildren(...parts);
  };

  const refresh = () => {
    const st = store.state;
    if (!st) return;
    // New mail while the box is open: show it as new, and mark it read.
    const more = unreadEvents(st);
    if (more.length) {
      for (const e of more) shownNew.add(e.id);
      markAllSeen(st); // calls notify() -> liveRefresh again, but nothing is unread then
    }
    render();
  };
  liveRefresh = refresh;

  markAllSeen(st0);
  render();
}
