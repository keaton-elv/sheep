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
import { mailPaperSkin, registerMailboxArt } from "./mailbox-art";
import { decorIcon } from "./shop";
import { DECOR_INFO, decorName } from "./shop-catalog";
import { hatIcon } from "../entities/sheep-hats";

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
    // The welcome letter waits in the box until it's been read once on this device.
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

/**
 * Who writes the letters (see docs/SPEC.md, Copy rules): Snickers the barn cat, Otto the fox,
 * or the sheep itself, signed with its own name (which is the plan). Never "the farm" or
 * "the flock", and never a villager.
 */
const SNICKERS = "Snickers 🐾";
const OTTO = "Otto 🦊";
/** A sheep signs with its own name. */
const sheepSign = (name: string) => `${name} 🐑`;

function nameList(names: string[]): string {
  const quoted = names.map(q);
  if (quoted.length <= 1) return quoted.join("");
  if (quoted.length > 4) return `${quoted.slice(0, 3).join(", ")} and ${quoted.length - 3} more`;
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

function gift(icon: HTMLElement | null): HTMLElement | null {
  return icon ? el("span", { class: "fm-letter__gift", title: "Attached" }, icon) : null;
}

/** The hat a sheep is wearing right now, as a letter attachment. */
function hatGift(sheepId: string | null): HTMLElement | null {
  const s = sheepId ? store.sheep(sheepId) : undefined;
  if (!s || s.hat === null || s.hat === undefined) return null;
  try {
    return gift(hatIcon(s.hat, { scale: 1 }));
  } catch {
    return null;
  }
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

/** Bursts of "bought"/"sheared"/"hatted" (within a few minutes) become one letter; the rest are one letter each. */
const BURST_MS = 15 * 60 * 1000;
const BURSTY: ReadonlySet<FarmEventKind> = new Set<FarmEventKind>(["bought", "sheared", "hatted"]);

function toLetters(events: FarmEvent[], isNew: boolean): Letter[] {
  const groups: FarmEvent[][] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && BURSTY.has(e.kind) && prev.kind === e.kind && Math.abs(prev.at - e.at) < BURST_MS) {
      last.push(e);
    } else groups.push([e]);
  }
  return groups.map((g) => (g.length === 1 ? letterFor(g[0]!, isNew) : groupLetter(g[0]!.kind, g, isNew)));
}

function groupLetter(kind: FarmEventKind, g: FarmEvent[], isNew: boolean): Letter {
  const names = nameList(g.map((e) => e.subject));
  const base = { key: `g-${kind}-${g[0]!.id}`, at: g[0]!.at, isNew, action: null } as const;
  if (kind === "bought") {
    return {
      ...base,
      greeting: "Humans,",
      body: `${plural(g.length, "new lamb", "new lambs")} just trotted in: ${names}. They are very loud. I am keeping an eye on them.`,
      sign: SNICKERS,
      gift: gift(sheepHead(false, { scale: 1.5 })),
    };
  }
  if (kind === "hatted") {
    return {
      ...base,
      greeting: "Humans,",
      body: `${names} all got fancy new hats. Where is MY hat?`,
      sign: SNICKERS,
      gift: hatGift(g[0]!.sheepId),
    };
  }
  return {
    ...base,
    greeting: "Psst!",
    body: `Milo and I counted ${plural(g.length, "freshly sheared sheep", "freshly sheared sheep")}: ${names}! So many adventures. The wool is in the chest.`,
    sign: OTTO,
    gift: gift(spriteIcon("item.wool")),
  };
}

function letterFor(e: FarmEvent, isNew: boolean): Letter {
  const base = { key: `e-${e.id}`, at: e.at, isNew, gift: null, action: null } as const;
  const name = e.subject;
  // Now and then Snickers writes instead. (Fixed per event, so a letter never changes author.)
  const fromCat = e.id % 4 === 0;
  switch (e.kind) {
    case "bought":
      return {
        ...base,
        greeting: "Baa!",
        body: "I just trotted into the pasture and found a favorite patch of clover. Pets daily, please!",
        sign: sheepSign(name),
        gift: gift(sheepHead(false, { scale: 1.5 })),
        action: sheepAction(e.sheepId, "Say hi to {name}"),
      };
    case "sheared":
      return fromCat
        ? {
            ...base,
            greeting: "Humans,",
            body: `I supervised the shearing of ${q(name)}. I napped on the wool before it went in the chest. You're welcome.`,
            sign: SNICKERS,
            gift: gift(spriteIcon("item.wool")),
            action: sheepAction(e.sheepId, "Write a memory"),
          }
        : {
            ...base,
            greeting: "Dear farmers,",
            body: "You did it! I feel so light and breezy. My wool is waiting in the chest.",
            sign: sheepSign(name),
            gift: gift(spriteIcon("item.wool")),
            action: sheepAction(e.sheepId, "Write a memory"),
          };
    case "sold":
      return {
        ...base,
        greeting: "Baa-bye!",
        body: "I'm off to a lovely farm across the valley. Plans change, and that's okay!",
        sign: sheepSign(name),
      };
    case "loomed":
      return e.id % 2
        ? {
            ...base,
            greeting: "Psst!",
            body: "Fresh cloth just came off the loom. Milo says it would make a very nice hat.",
            sign: OTTO,
            gift: gift(spriteIcon("item.cloth")),
          }
        : {
            ...base,
            greeting: "Humans,",
            body: "The loom went clack, clack, clack and made cloth. I watched the whole time. Exhausting.",
            sign: SNICKERS,
            gift: gift(spriteIcon("item.cloth")),
          };
    case "decorated": {
      const known = Object.hasOwn(DECOR_INFO, name);
      const thing = decorName(name);
      return {
        ...base,
        greeting: fromCat ? "Humans," : "Psst!",
        body: fromCat
          ? `I inspected the new ${thing}. I sat on it. I sniffed it. It is approved.`
          : `Milo and I snuck over to see the new ${thing}. Very fancy. The sheep won't stop talking about it.`,
        sign: fromCat ? SNICKERS : OTTO,
        gift: gift(known ? decorIcon(name as DecorKind, 0, 16) : null),
      };
    }
    case "renamed":
      return {
        ...base,
        greeting: "Humans,",
        body: /snickers/i.test(name)
          ? `The sign out front says ${q(name)} now. Named after me. As it should be.`
          : `The sign out front says ${q(name)} now. I will allow it.`,
        sign: SNICKERS,
        gift: gift(spriteIcon("ui.star")),
      };
    case "unsheared":
      return {
        ...base,
        greeting: "Um, farmers?",
        body: "My wool grew back?! I guess I'm not finished after all.",
        sign: sheepSign(name),
        action: sheepAction(e.sheepId, "Visit {name}"),
      };
    case "hatted":
      return {
        ...base,
        greeting: fromCat ? "Humans," : "Baa!",
        body: fromCat
          ? `${q(name)} got a fancy new hat! I would like one too. Mine should be bigger.`
          : `${q(name)} got a fancy new hat! (That's me.) I've been strutting around the pasture showing it off.`,
        sign: fromCat ? SNICKERS : sheepSign(name),
        gift: hatGift(e.sheepId),
        action: sheepAction(e.sheepId, "Admire {name}"),
      };
    default:
      return { ...base, greeting: "Humans,", body: "Something happened on the farm. I was asleep.", sign: SNICKERS };
  }
}

function welcomeLetter(st: FarmState): Letter {
  const mine = /snickers/i.test(st.farmName) ? " (Yes, it's named after me.)" : "";
  return {
    key: "welcome",
    at: st.serverNow,
    greeting: "Humans,",
    body:
      `Welcome to ${st.farmName}.${mine} Every sheep out there is a plan for you two. ` +
      "Do the thing, then shear the sheep. Wool becomes cloth, and cloth buys hats and decorations. I will be supervising." +
      "\n\nP.S. Scratches accepted. Some spots more than others.",
    sign: SNICKERS,
    gift: gift(sheepHead(false, { scale: 1.5 })),
    action: null,
    isNew: true,
  };
}

function letterEl(l: Letter, st: FarmState): HTMLElement {
  const date = l.key === "welcome" ? "Today" : `${stardewDate(new Date(l.at), st.foundedAt)} · ${timeAgo(l.at, serverNow())}`;
  return el(
    "article",
    { class: `fm-letter ${l.isNew ? "is-new" : "is-read"}` },
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
  const root = el("div", { class: `fm-mail fm-menu ${mailPaperSkin() ? "is-real" : ""}` });
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
    letters.forEach((l) => parts.push(letterEl(l, st)));
    if (oldLetters.length) {
      parts.push(el("h3", { class: "fm-mail__old" }, hasNew ? "Older letters" : "Letters you've read"));
      oldLetters.forEach((l) => parts.push(letterEl(l, st)));
    } else if (!hasNew) {
      parts.push(el("p", { class: "fm-quip" }, "Not even a seed catalog. Go make some memories!"));
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
