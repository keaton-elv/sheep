// Letters about what happened on the farm while you were away, Stardew style.
// Built from store.state.events: anything newer than the last letter this browser saw,
// minus the things this tab did itself (you know about those already). The exceptions:
// an ORIGINAL PLAN always gets a letter from its sheep, and a few letters live only on this
// device (local, synthetic): Otto writes in about a Bumblesteed sighting (one per sighting day)
// and, the morning after, about Bigfoot; whoever was in the Trench Coat sends an alibi; and every
// couple of weeks or so Snickers's brother KitKat sends a postcard from Arizona.
//
// Debug: ?bigfootletter (=1..3 picks Otto's letter) ?kitkat=N (postcard N, unread). Neither saves anything.

import "./mailbox.css";
import { sfx } from "../audio";
import { currentGame } from "../engine/game";
import { has } from "../engine/sprites";
import { serverNow, store } from "../net";
import { bundleNamed } from "../../shared/bundles";
import { dayKey, parseDayKey, stardewDate } from "../../shared/calendar";
import type { DecorKind, FarmEvent, FarmEventKind, FarmState } from "../../shared/types";
import { openMemory } from "./barn";
import { safeStorage, sheepHead, timeAgo } from "./calendar-util";
import { el, openDialog, openMenu, plural, registerMenu, spriteIcon, toast } from "./dom";
import { bundleSackKey } from "./loom-art";
import { mailPaperSkin, registerMailboxArt } from "./mailbox-art";
import { postcardPicture, type PostcardScene } from "./postcard-art";
import { originalPlanBadge } from "./stamp";
import { decorIcon } from "./shop";
import { DECOR_INFO, decorName } from "./shop-catalog";
import { hatIcon } from "../entities/sheep-hats";
import type { Insides } from "../entities/critter-trench";

const LS_SEEN = "farm.mail.lastSeen";
const LS_OWN = "farm.mail.own";
const LS_WELCOME = "farm.mail.welcomeRead";
/** Written by the critters when a Bumblesteed shows up (ms timestamp). */
const LS_STEED = "farm.bumblesteed.lastSeen";
/** The sighting day ("Y-M-D") whose letter from Otto has been read on this device. */
const LS_STEED_READ = "farm.mail.steedRead";
/** KitKat's latest postcard on this device: JSON { at, n } (n < 0 = none yet, just the clock started). */
const LS_KITKAT = "farm.mail.kitkat";
/** The `at` of the postcard that has been read on this device. */
const LS_KITKAT_READ = "farm.mail.kitkatRead";
/** The local day KitKat last thought about writing (one roll per device per day). */
const LS_KITKAT_ROLL = "farm.mail.kitkatRoll";
/** Written by the critters when Bigfoot walks past (ms timestamp). */
const LS_BIGFOOT = "farm.bigfoot.lastSeen";
/** The evening ("YYYY-MM-DD") whose letter from Otto has been read on this device. */
const LS_BIGFOOT_READ = "farm.mail.bigfootRead";
/** How many evenings Otto has written about (picks his next letter), and the last evening counted. */
const LS_BIGFOOT_N = "farm.mail.bigfootN";
const LS_BIGFOOT_N_FOR = "farm.mail.bigfootNFor";
/** The latest Trench Coat alibi on this device: JSON { at, insides }. */
const LS_TRENCH = "farm.mail.trench";
/** The `at` of the alibi that has been read on this device. */
const LS_TRENCH_READ = "farm.mail.trenchRead";
const DAY_MS = 24 * 60 * 60 * 1000;
/** At most one postcard every two weeks, and then only on a lucky day. */
const KITKAT_GAP_MS = 14 * DAY_MS;
const KITKAT_CHANCE = 0.2;
/** An event that arrived without telling us who caused it gets this long to be claimed by this tab. */
const PENDING_MS = 3000;
const OWN_CAP = 80;
const OLD_LETTERS = 4;
/** Event kinds that get a letter even when this tab did them. */
const ALWAYS_MAIL: ReadonlySet<FarmEventKind> = new Set<FarmEventKind>(["original"]);

const debug = new URLSearchParams(location.search);
/** ?bigfootletter: Bigfoot walked past at 21:00 last night (in memory only). =1..3 picks the letter. */
const DEBUG_BIGFOOT = debug.has("bigfootletter");
/** ?kitkat=N: KitKat's postcard N just came (in memory only). */
const DEBUG_KITKAT = debug.has("kitkat") ? Number.parseInt(debug.get("kitkat") || "0", 10) || 0 : null;

/** Highest event id this browser has read. null = never opened the farm here before. */
let lastSeen: number | null = parseIntOrNull(safeStorage.get(LS_SEEN));
/** Events this tab caused (auto-read). */
const ownIds = new Set<number>(parseIds(safeStorage.get(LS_OWN)));
/** Events we know came from someone else (the other farmer), or that always get a letter. */
const remoteIds = new Set<number>();
/** Last Bumblesteed sighting on this device (ms), or null. */
let steedAt: number | null = null;
/** In-memory copy of LS_STEED_READ (so a blocked localStorage can't keep the letter unread forever). */
let steedReadDay: string | null = null;
/** KitKat's latest postcard (or the clock waiting for his first one). */
let postcard: { at: number; n: number } | null = null;
/** In-memory copies of LS_KITKAT_READ / LS_KITKAT_ROLL (in case storage is blocked). */
let postcardReadAt: number | null = null;
let postcardRollDay: string | null = null;
/** Last Bigfoot sighting on this device (ms), or null. */
let bigfootAt: number | null = null;
/** In-memory copy of LS_BIGFOOT_READ. */
let bigfootReadEvening: string | null = null;
/** Which of Otto's Bigfoot letters goes with which evening (see bigfootNumber). */
let bigfootCount: { evening: string; n: number } | null = null;
let bigfootTimer = 0;
/** The latest Trench Coat alibi, and an in-memory copy of LS_TRENCH_READ. */
let trench: { at: number; insides: Insides } | null = null;
let trenchReadAt: number | null = null;
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

// ---------- the Bumblesteed letter (local to this device) ----------

/** Pick up the latest sighting from storage (never goes backwards). */
function readSteed(): void {
  const v = parseIntOrNull(safeStorage.get(LS_STEED));
  if (v !== null && v > 0 && (steedAt === null || v > steedAt)) steedAt = v;
}

/** Local calendar day of a sighting, so there's one letter per sighting day. */
function steedDay(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function steedUnread(): boolean {
  if (steedAt === null) return false;
  const day = steedDay(steedAt);
  return steedReadDay !== day && safeStorage.get(LS_STEED_READ) !== day;
}

/** A Bumblesteed was just seen (or another tab saw one). */
function onSteed(): void {
  readSteed();
  // The event itself means "just now", even if storage is blocked or not written yet.
  const now = Date.now();
  if (steedAt === null || now - steedAt > 60_000) steedAt = now;
  notify();
}

// ---------- KitKat's postcards (local to this device) ----------

function readPostcard(): { at: number; n: number } | null {
  const raw = safeStorage.get(LS_KITKAT);
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object") {
      const { at, n } = v as { at?: unknown; n?: unknown };
      if (typeof at === "number" && Number.isFinite(at) && typeof n === "number" && Number.isFinite(n)) return { at, n };
    }
  } catch {
    // fall through
  }
  return null;
}

/** Once a day per device, KitKat thinks about writing (and rarely does). */
function maybePostcard(): void {
  if (DEBUG_KITKAT !== null) return;
  const today = dayKey(new Date());
  if (postcardRollDay === today || safeStorage.get(LS_KITKAT_ROLL) === today) return;
  postcardRollDay = today;
  safeStorage.set(LS_KITKAT_ROLL, today);
  postcard = readPostcard() ?? postcard;
  const now = Date.now();
  if (!postcard || postcard.at > now) {
    // He hasn't heard about the farm yet: his first postcard can come in about five days.
    postcard = { at: now - KITKAT_GAP_MS + 5 * DAY_MS, n: -1 };
  } else if (now - postcard.at >= KITKAT_GAP_MS && Math.random() < KITKAT_CHANCE) {
    postcard = { at: now, n: postcard.n + 1 };
  } else return;
  safeStorage.set(LS_KITKAT, JSON.stringify(postcard));
}

function postcardUnread(): boolean {
  if (!postcard || postcard.n < 0) return false;
  return postcardReadAt !== postcard.at && safeStorage.get(LS_KITKAT_READ) !== String(postcard.at);
}

// ---------- Otto's Bigfoot letters (local to this device) ----------

function readBigfoot(): void {
  if (DEBUG_BIGFOOT) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    d.setHours(21, 0, 0, 0);
    bigfootAt = d.getTime();
    return;
  }
  const v = parseIntOrNull(safeStorage.get(LS_BIGFOOT));
  if (v !== null && v > 0 && (bigfootAt === null || v > bigfootAt)) bigfootAt = v;
}

/** The evening a sighting belongs to: a dawn sighting counts for the night before. */
function eveningOf(at: number): string {
  const d = new Date(at);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  return dayKey(d);
}

/** Otto's letter comes the next morning: 06:00 local, the day after the evening. */
function bigfootArrival(evening: string): number {
  const d = parseDayKey(evening) ?? new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d.getTime();
}

/** The evening whose letter is in the box by now, or null (none, or still on its way). */
function bigfootEvening(): string | null {
  if (bigfootAt === null) return null;
  const evening = eveningOf(bigfootAt);
  return Date.now() >= bigfootArrival(evening) ? evening : null;
}

function bigfootUnread(): boolean {
  const evening = bigfootEvening();
  return evening !== null && bigfootReadEvening !== evening && (DEBUG_BIGFOOT || safeStorage.get(LS_BIGFOOT_READ) !== evening);
}

/** While a letter is on its way, one timer raises the mailbox flag when it lands. */
function scheduleBigfoot(): void {
  clearTimeout(bigfootTimer);
  if (bigfootAt === null) return;
  const wait = bigfootArrival(eveningOf(bigfootAt)) - Date.now();
  if (wait > 0) bigfootTimer = window.setTimeout(notify, Math.min(wait + 1000, 2 ** 31 - 1));
}

/** Bigfoot just walked past (or another tab saw him). */
function onBigfoot(): void {
  readBigfoot();
  const now = Date.now();
  if (!DEBUG_BIGFOOT && (bigfootAt === null || now - bigfootAt > 60_000)) bigfootAt = now;
  scheduleBigfoot();
  notify();
}

/** Otto's letters take turns: the nth evening he writes about gets letter n (counted once per evening). */
function bigfootNumber(evening: string): number {
  if (DEBUG_BIGFOOT) return Number.parseInt(debug.get("bigfootletter") ?? "", 10) || 1;
  if (bigfootCount?.evening === evening) return bigfootCount.n;
  const n = parseIntOrNull(safeStorage.get(LS_BIGFOOT_N)) ?? 0;
  const counted = safeStorage.get(LS_BIGFOOT_N_FOR) === evening;
  bigfootCount = { evening, n: counted ? Math.max(1, n) : n + 1 };
  if (!counted) {
    safeStorage.set(LS_BIGFOOT_N, String(bigfootCount.n));
    safeStorage.set(LS_BIGFOOT_N_FOR, evening);
  }
  return bigfootCount.n;
}

// ---------- the Trench Coat alibis (local to this device) ----------

const isInsides = (v: unknown): v is Insides => v === "raccoons" || v === "hedgehogs" || v === "mosquitoes";

function readTrench(): { at: number; insides: Insides } | null {
  const raw = safeStorage.get(LS_TRENCH);
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object") {
      const { at, insides } = v as { at?: unknown; insides?: unknown };
      if (typeof at === "number" && Number.isFinite(at) && isInsides(insides)) return { at, insides };
    }
  } catch {
    // fall through
  }
  return null;
}

/** The coat just came apart: the first reveal of the day gets an alibi in the mail. */
function onTrench(insides: unknown): void {
  if (!isInsides(insides)) return;
  trench = readTrench() ?? trench;
  const now = Date.now();
  if (trench && dayKey(new Date(trench.at)) === dayKey(new Date(now))) return;
  trench = { at: now, insides };
  safeStorage.set(LS_TRENCH, JSON.stringify(trench));
  notify();
}

function trenchUnread(): boolean {
  return trench !== null && trenchReadAt !== trench.at && safeStorage.get(LS_TRENCH_READ) !== String(trench.at);
}

// ---------- unread bookkeeping ----------

/** Unread letters (events), newest first. Fresh unclaimed events wait a moment (see PENDING_MS). */
function unreadEvents(st: FarmState, now = serverNow()): FarmEvent[] {
  if (lastSeen === null) return [];
  const seen = lastSeen;
  return st.events.filter(
    (e) => e.id > seen && !ownIds.has(e.id) && (remoteIds.has(e.id) || !store.connected || now - e.at >= PENDING_MS),
  );
}

function unreadCount(st: FarmState): number {
  let n = unreadEvents(st).length + (welcomeUnread ? 1 : 0);
  for (const m of LOCAL_MAIL) if (m.unread()) n++;
  return n;
}

/** How many letters are waiting in the mailbox (for the world's mailbox flag + toolbar badge). */
export function unreadMailCount(): number {
  const st = store.state;
  if (!st) return 0;
  // Cheap enough to call every frame: notify() refreshes the cache whenever anything changes.
  if (cache.state === st) return cache.count;
  return unreadCount(st);
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
  const n = unreadCount(st);
  cache = { state: st, count: n };
  if (n !== lastNotified) {
    lastNotified = n;
    listeners.forEach((fn) => fn(n));
  }
  liveRefresh?.();
}

function onState(st: FarmState): void {
  const max = maxEventId(st);
  maybePostcard();
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
  for (const m of LOCAL_MAIL) m.markRead();
  notify();
}

export function initMailbox(): void {
  registerMailboxArt();
  registerMenu("mailbox", () => openMailbox());
  if (started) return;
  started = true;
  readSteed();
  readBigfoot();
  scheduleBigfoot();
  trench = readTrench();
  postcard = DEBUG_KITKAT !== null ? { at: Date.now() - 60 * 60 * 1000, n: DEBUG_KITKAT } : readPostcard();

  store.events.on(({ event, own }) => {
    if (own && !ALWAYS_MAIL.has(event.kind)) {
      ownIds.add(event.id);
      saveOwn();
    } else {
      remoteIds.add(event.id);
      const now = Date.now();
      // (An ORIGINAL PLAN, yours or theirs, slams down the stamp with its own sounds: no chime on top.)
      if (!own && event.kind !== "original" && lastSeen !== null && event.id > lastSeen && now - lastChime > 1500) {
        lastChime = now;
        sfx("chime");
      }
    }
    notify();
  });
  store.changed.on(onState);
  store.connection.on(() => notify());
  try {
    currentGame?.on("bumblesteed", onSteed);
    currentGame?.on("bigfoot", onBigfoot);
    currentGame?.on("trenchcoat", onTrench);
    addEventListener("storage", (ev) => {
      if (ev.key === LS_KITKAT || ev.key === LS_KITKAT_READ) {
        if (DEBUG_KITKAT === null) postcard = readPostcard() ?? postcard;
      } else if (ev.key === LS_BIGFOOT || ev.key === LS_BIGFOOT_READ) {
        readBigfoot();
        scheduleBigfoot();
      } else if (ev.key === LS_TRENCH || ev.key === LS_TRENCH_READ) {
        trench = readTrench() ?? trench;
      } else if (ev.key === LS_STEED || ev.key === LS_STEED_READ) {
        readSteed();
      } else return;
      notify();
    });
  } catch {
    // no game / no storage events: the letter still shows up next time the box is checked
  }
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
  /** A postcard (KitKat's) instead of a letter: different paper, a stamp and a postmark. */
  postcard?: boolean;
  /** The postcard's picture side. */
  picture?: PostcardScene;
}

const q = (s: string) => `“${s}”`;

/**
 * Who writes the letters (see docs/SPEC.md, Copy rules): Snickers the cat, Otto the fox (Milo
 * sometimes co-signs), or the sheep itself, signed with its own name (which is the plan).
 * Never "the farm" or "the flock", and never a villager.
 */
const SNICKERS = "Snickers 🐾";
const OTTO = "Otto 🦊";
const OTTO_MILO = "Otto (and Milo) 🦊🦔";
const MILO = "Milo 🦔";
/** Snickers's brother, writing from Arizona. */
const KITKAT = "KitKat 🌵";
/** A sheep signs with its own name. */
const sheepSign = (name: string) => `${name} 🐑`;
/** A few sheep writing together: "Picnic, Pottery class & 3 more 🐑🐑🐑". */
function flockSign(names: string[]): string {
  if (names.length <= 1) return sheepSign(names[0] ?? "Baa");
  const shown = names.length > 3 ? [...names.slice(0, 2), `${names.length - 2} more`] : names;
  return `${shown.slice(0, -1).join(", ")} & ${shown[shown.length - 1]} ${"🐑".repeat(Math.min(names.length, 3))}`;
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
  if (!id || !store.sheep(id)) return null;
  return {
    label,
    run: () => {
      const cur = store.sheep(id);
      if (!cur) toast("That sheep wandered off...");
      else if (cur.shearedAt !== null) openMemory(id);
      else openMenu("sheep", id);
    },
  };
}

/** Bursts of "bought"/"sheared"/"hatted" (within a few minutes) become one letter; the rest are one letter each. */
const BURST_MS = 15 * 60 * 1000;
const BURSTY: ReadonlySet<FarmEventKind> = new Set<FarmEventKind>(["bought", "sheared", "hatted", "original"]);

function toLetters(events: FarmEvent[], isNew: boolean): Letter[] {
  const groups: FarmEvent[][] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (last && prev && BURSTY.has(e.kind) && prev.kind === e.kind && Math.abs(prev.at - e.at) < BURST_MS) {
      last.push(e);
    } else groups.push([e]);
  }
  return groups.map((g) => {
    // One sheep trying on three hats is still one sheep writing (newest event wins).
    const seen = new Set<string>();
    const writers = g.filter((e) => {
      const who = e.sheepId ?? e.subject;
      if (seen.has(who)) return false;
      seen.add(who);
      return true;
    });
    return writers.length === 1 ? letterFor(writers[0]!, isNew) : groupLetter(g[0]!.kind, writers, isNew);
  });
}

/** Several sheep write one letter together. */
function groupLetter(kind: FarmEventKind, g: FarmEvent[], isNew: boolean): Letter {
  const sign = flockSign(g.map((e) => e.subject));
  const base = { key: `g-${kind}-${g[0]!.id}`, at: g[0]!.at, isNew, action: null, sign } as const;
  if (kind === "bought") {
    const body = g[0]!.id % 2 ? "We're new! Is this Golden Gate Park? It's smaller than we heard..." : "We're new! Can't wait... baa!";
    return { ...base, greeting: "Hi!!", body, gift: gift(sheepHead(false, { scale: 1.5 })) };
  }
  if (kind === "hatted") {
    return { ...base, greeting: "Baa!", body: "Do you like our hats? We match. Sort of...", gift: hatGift(g[0]!.sheepId) };
  }
  if (kind === "original") {
    return { ...base, greeting: "Dear farmers,", body: "We ALL went with the ORIGINAL PLAN.", gift: null };
  }
  return {
    ...base,
    greeting: "Dear farmers,",
    body: `${g.length === 2 ? "Both" : `All ${g.length}`} of us, done! ${g[0]!.id % 2 ? "Morning buns at Tartine to celebrate?" : "We feel so light..."}`,
    gift: gift(spriteIcon("item.wool")),
  };
}

function letterFor(e: FarmEvent, isNew: boolean): Letter {
  const base = { key: `e-${e.id}`, at: e.at, isNew, gift: null, action: null } as const;
  const name = e.subject;
  const me = sheepSign(name);
  // Variety that's fixed per event, so a letter never changes its mind.
  const pick = <T>(xs: readonly T[]): T => xs[e.id % xs.length]!;
  switch (e.kind) {
    case "bought":
      return {
        ...base,
        greeting: "Hi!!",
        body: /karaoke/i.test(name)
          ? `I'm ${name}. ...Do we HAVE to?`
          : /sketch/i.test(name)
            ? `I'm ${name}. Another sketching meetup? I'll pose. Baa.`
            : /pizza/i.test(name)
              ? `I'm ${name}. Golden Boy or Tony's? I'll have to try both to know.`
              : /ice cream|gelato/i.test(name)
                ? `I'm ${name}. Garlic, please. Keeps the vampires away...`
                : pick([
                    `I'm ${name}. Can't wait... baa!`,
                    `I'm ${name}! My cousins at Tilden Little Farm say hi. ...Got any celery?`,
                    `I'm ${name}! I hear Dolores Park has the best grass...`,
                  ]),
        sign: me,
        gift: gift(sheepHead(false, { scale: 1.5 })),
        action: sheepAction(e.sheepId, "Say hi"),
      };
    case "sheared":
      return {
        ...base,
        greeting: pick(["Dear farmers,", "Baa!", "Hi again,"]),
        body: /karaoke/i.test(name)
          ? "We did it. We went to karaoke. Nobody ever has to know..."
          : /sketch/i.test(name)
            ? "Done! Did you draw me? Please say you drew me..."
            : pick([
                "We did it! I feel so light...",
                "I feel so light! Like a cloud. A bald cloud...",
                "Done! A little chilly, though. Who shears a sheep in San Francisco?! Brr...",
                "Done! Croissants to celebrate? I hear the Arsicault line is worth it...",
              ]),
        sign: me,
        gift: gift(spriteIcon("item.wool")),
        action: sheepAction(e.sheepId, e.sheepId && store.sheep(e.sheepId)?.memory ? "Our memory" : "Write a memory"),
      };
    case "unsheared":
      return {
        ...base,
        greeting: "Um, farmers?",
        body: "My wool grew back?! I guess we're not done after all...",
        sign: me,
        action: sheepAction(e.sheepId, "Visit"),
      };
    case "hatted":
      return {
        ...base,
        greeting: "Baa!",
        body: pick([
          "Do you like my hat? I've been strutting all day...",
          "Do you like my hat? Be honest. (Say yes.)",
          "Do you like my hat? It's for Bay to Breakers.",
        ]),
        sign: me,
        gift: hatGift(e.sheepId),
        action: sheepAction(e.sheepId, "Admire"),
      };
    case "original":
      return {
        ...base,
        greeting: "Dear farmers,",
        body: "We went with the ORIGINAL PLAN.",
        sign: me,
        // The sheep card's stamp: one letter, one trip back to the original.
        gift: originalPlanBadge(1),
        action: sheepAction(e.sheepId, "Visit"),
      };
    case "sold":
      return {
        ...base,
        greeting: "Humans,",
        body: pick([
          `${q(name)} moved to a nice farm upstate. I did not like them anyway.\n\n(I did.)`,
        ]),
        sign: SNICKERS,
      };
    case "loomed":
      return {
        ...base,
        greeting: "Humans,",
        body: pick([
          "The clacking machine made cloth again. I watched the whole time. Exhausting...",
          "The clacking machine made cloth. It is not string. I checked. Mow.",
        ]),
        sign: SNICKERS,
        gift: gift(spriteIcon("item.cloth")),
      };
    case "decorated": {
      const known = Object.hasOwn(DECOR_INFO, name);
      const thing = decorName(name);
      const body =
        name === "gnome"
          ? "Milo thinks the new gnome is watching him. I told him that's what gnomes do..."
          : name === "scarecrow" || name === "rarecrow"
            ? `The crows are furious about the new ${thing}. Milo and I think it's great.`
            : pick([
                `Milo and I snuck over to see the new ${thing}. Very fancy...`,
                `We hiked all the way up Mt. Tam today. You can see the whole Bay from up there but not the new ${thing}, so we came back.`,
                `The fog rolled in, so Milo and I had to get REAL close to see the new ${thing}. Very fancy...`,
              ]);
      return {
        ...base,
        greeting: "Psst!",
        body,
        sign: e.id % 3 === 0 ? OTTO_MILO : OTTO,
        gift: gift(known ? decorIcon(name as DecorKind, 0, 16) : null),
      };
    }
    case "renamed":
      return {
        ...base,
        greeting: "Psst!",
        body: /snickers/i.test(name)
          ? `The sign out front says ${q(name)} now. Snickers has been sitting under it all day, looking smug...`
          : `The sign out front says ${q(name)} now. I read it to Milo twice. He loves it.`,
        sign: OTTO,
        gift: gift(spriteIcon("ui.star")),
      };
    case "bundled": {
      const bundle = bundleNamed(name);
      const sack = gift(spriteIcon(bundle ? bundleSackKey(bundle.id) : "item.cloth"));
      if (bundle?.id === "seeds") {
        return { ...base, greeting: "Psst!", body: "Milo sniffed a ginkgo nut. He's still not over it...", sign: OTTO_MILO, gift: sack };
      }
      if (bundle?.id === "junk") {
        return { ...base, greeting: "Mow.", body: "You traded the rusty spoon for cloth. I was going to knock that off a table...", sign: SNICKERS, gift: sack };
      }
      if (bundle?.id === "research") {
        return { ...base, greeting: "Psst!", body: "The Field Research Bundle is in. Milo wants to publish. I told him nobody believes a hedgehog...", sign: OTTO, gift: sack };
      }
      // Snickers only writes about the snack sacks (the forage ones); the dig bundles get Otto.
      const snacks = bundle ? bundle.items.every((k) => k.startsWith("item.forage.")) : true;
      return e.id % 2 || !snacks
        ? {
            ...base,
            greeting: "Psst!",
            body: `The whole pasture is talking about the ${name}. Milo did a little roll, which is how hedgehogs clap.`,
            sign: OTTO,
            gift: sack,
          }
        : { ...base, greeting: "Mow.", body: "You put perfectly good snacks in a sack and got cloth. Next: a Salmon Sashimi Bundle.", sign: SNICKERS, gift: sack };
    }
    default:
      return { ...base, greeting: "Humans,", body: "Something happened on the farm. I was asleep. Zzz...", sign: SNICKERS };
  }
}

function welcomeLetter(st: FarmState): Letter {
  return {
    key: "welcome",
    at: st.serverNow,
    greeting: "Humans,",
    body:
      `Welcome to ${st.farmName}. You can use my sheep to keep track of all the wonderful things to do! ` +
      "I will be supervising...\n\nP.S. Scratches accepted. Some spots more than others.\nP.P.S. I'd like my Fancy Feast now please :P.",
    sign: SNICKERS,
    // Signed by Snickers, so his face goes on it (a sheep if his art somehow isn't there).
    gift: gift(has("snickers.icon") ? spriteIcon("snickers.icon", { scale: 1.5 }) : sheepHead(false, { scale: 1.5 })),
    action: null,
    isNew: true,
  };
}

/** Otto writes in about the Bumblesteed (one letter per sighting day, this device only). */
function steedLetter(at: number, isNew: boolean): Letter {
  return {
    key: `steed-${steedDay(at)}`,
    at,
    greeting: "Psst!",
    body:
      new Date(at).getDate() % 2
        ? "I saw a ladybug knight riding a bumblebee today... Milo says it's called a Bumblesteed. Milo is never wrong."
        : "A ladybug knight on a bumblebee just flew over the pasture! Last time I saw one was in Muir Woods. Milo says it's a Bumblesteed.",
    sign: OTTO,
    gift: gift(has("critter.bumblesteed.icon") ? spriteIcon("critter.bumblesteed.icon") : null),
    action: null,
    isNew,
  };
}

/** Otto, the morning after Bigfoot walked past (they take turns, see bigfootNumber). */
const BIGFOOT_BODIES = [
  "Something VERY tall walked past the fence last night. Milo says it was just Karl the Fog. Milo is never wrong... right?",
  "It came back. Big. Fuzzy. Smelled like wet ferns and Washington. Milo stayed in a ball until breakfast.",
  "Saw him again, heading for Church Street. I think he was trying to catch the J. He’ll be waiting a while...",
] as const;

function bigfootLetter(evening: string, isNew: boolean): Letter {
  const n = bigfootNumber(evening);
  return {
    key: `bigfoot-${evening}`,
    at: Math.max(bigfootArrival(evening), bigfootAt ?? 0),
    greeting: "Psst!",
    body: BIGFOOT_BODIES[(n - 1) % BIGFOOT_BODIES.length]!,
    sign: OTTO,
    // His footprint, never his face.
    gift: gift(has("critter.bigfoot.print") ? spriteIcon("critter.bigfoot.print") : null),
    action: null,
    isNew,
  };
}

/** Whoever was in the Trench Coat writes in with an alibi (Milo denies everything). */
const TRENCH_ALIBIS: Record<Insides, readonly [greeting: string, body: string, sign: string]> = {
  raccoons: ["Psst!", "The raccoons say they were only borrowing the coat. Milo and I are keeping an eye on the stump.", OTTO],
  hedgehogs: ["Psst!", "It wasn’t me in the coat. I was asleep. Ask Otto.", MILO],
  mosquitoes: ["Humans,", "The coat was full of bugs. I did not eat any.\n\n(I ate one.)", SNICKERS],
};

function trenchLetter(t: { at: number; insides: Insides }, isNew: boolean): Letter {
  const [greeting, body, sign] = TRENCH_ALIBIS[t.insides];
  return {
    key: `trench-${t.at}`,
    at: t.at,
    greeting,
    body,
    sign,
    gift: gift(has("critter.trenchcoat.icon") ? spriteIcon("critter.trenchcoat.icon") : null),
    action: null,
    isNew,
  };
}

/** What KitKat writes from Arizona (one after another, so no postcard repeats for a while), and the picture on the front. */
const POSTCARDS: readonly (readonly [greeting: string, body: string, picture: PostcardScene])[] = [
  ["Brother,", "It is 114° here. I lie on the tile. The tile is also hot.\n\nSay hi to your humans.", "skull"],
  ["Hi you two!", "Is it foggy there? Here the sun is out. ALWAYS. Please mail me some fog. Karl, if he's free.", "palm"],
  ["Brother,", "Monsoon season! It rained for four whole minutes. Everyone is still talking about it.", "monsoon"],
  ["Brother,", "I found a cactus. I sat near it. Not on it. I learned.", "rocks"],
  ["Hi you two!", "The sunsets here are pink and orange and purple, all at the same time.", "sunset"],
  ["Brother,", "A roadrunner ran past. I did not chase it. Too hot.", "palm"],
  ["Hi you two!", "A javelina looked at me today. It looks like a pig but it is not a pig.", "sunset"],
  ["Brother,", "It's a dry heat, they keep saying. I am melting anyway.", "skull"],
];

function postcardLetter(p: { at: number; n: number }, isNew: boolean): Letter {
  const [greeting, body, picture] = POSTCARDS[((p.n % POSTCARDS.length) + POSTCARDS.length) % POSTCARDS.length]!;
  return {
    key: `kitkat-${p.at}`,
    at: p.at,
    greeting,
    body,
    sign: KITKAT,
    gift: null,
    action: null,
    isNew,
    postcard: true,
    picture,
  };
}

/** A letter that only lives on this device (never on the server). */
interface LocalMail {
  /** In the box (arrived) and not read here yet. */
  unread(): boolean;
  /** Its letter, if there's one in the box at all (new or old). */
  letter(isNew: boolean): Letter | null;
  markRead(): void;
}

const LOCAL_MAIL: readonly LocalMail[] = [
  {
    unread: steedUnread,
    letter: (isNew) => (steedAt === null ? null : steedLetter(steedAt, isNew)),
    markRead: () => {
      if (steedAt === null) return;
      steedReadDay = steedDay(steedAt);
      safeStorage.set(LS_STEED_READ, steedReadDay);
    },
  },
  {
    unread: bigfootUnread,
    letter: (isNew) => {
      const evening = bigfootEvening();
      return evening === null ? null : bigfootLetter(evening, isNew);
    },
    markRead: () => {
      const evening = bigfootEvening();
      if (evening === null) return;
      bigfootReadEvening = evening;
      if (!DEBUG_BIGFOOT) safeStorage.set(LS_BIGFOOT_READ, evening);
    },
  },
  {
    unread: trenchUnread,
    letter: (isNew) => (trench === null ? null : trenchLetter(trench, isNew)),
    markRead: () => {
      if (trench === null) return;
      trenchReadAt = trench.at;
      safeStorage.set(LS_TRENCH_READ, String(trench.at));
    },
  },
  {
    unread: postcardUnread,
    letter: (isNew) => (postcard && postcard.n >= 0 ? postcardLetter(postcard, isNew) : null),
    markRead: () => {
      if (!postcard || postcard.n < 0) return;
      postcardReadAt = postcard.at;
      if (DEBUG_KITKAT === null) safeStorage.set(LS_KITKAT_READ, String(postcard.at));
    },
  },
];

/** `arriving` = first time this letter is drawn while the box is open (it slides in once). */
function letterEl(l: Letter, st: FarmState, arriving: boolean): HTMLElement {
  const date = l.key === "welcome" ? "Today" : `${stardewDate(new Date(l.at), st.foundedAt)} · ${timeAgo(l.at, serverNow())}`;
  const picture = l.postcard && l.picture ? postcardPicture(l.picture) : null;
  if (picture) picture.className = "fm-postcard__picture";
  return el(
    "article",
    {
      class: `fm-letter ${l.isNew ? "is-new" : "is-read"} ${arriving ? "is-arriving" : ""} ${l.postcard ? "is-postcard" : ""} ${picture ? "has-picture" : ""}`,
    },
    l.isNew ? el("span", { class: "fm-letter__seal", "aria-label": "New" }) : null,
    picture ? el("div", { class: "fm-postcard__front", "aria-hidden": "true" }, picture) : null,
    l.postcard
      ? el(
          "div",
          { class: "fm-postcard__corner", "aria-hidden": "true" },
          el("span", { class: "fm-postcard__mark" }, "ARIZONA"),
          has("ui.postcard.stamp") ? spriteIcon("ui.postcard.stamp", { scale: 1.5, class: "fm-postcard__stamp" }) : null,
        )
      : null,
    el("p", { class: "fm-letter__date" }, l.postcard ? `Postcard · ${timeAgo(l.at, serverNow())}` : date),
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

const newestFirst = (a: Letter, b: Letter) => b.at - a.at;

function openMailbox(): void {
  const st0 = store.state;
  const root = el("div", { class: `fm-mail fm-menu ${mailPaperSkin() ? "is-real" : ""}` });
  if (!st0) {
    openDialog({ title: "Mailbox", className: "fm-mail-dialog fm-menu", body: el("p", { class: "sv-say" }, "Empty... for now.") });
    return;
  }

  // Everything unread right now (plus anything that arrives while the box is open) is "new".
  readSteed();
  readBigfoot();
  maybePostcard();
  const shownNew = new Set<number>(unreadEvents(st0).map((e) => e.id));
  const showWelcome = welcomeUnread;
  const localNew = LOCAL_MAIL.map((m) => m.unread());
  const anyNew = shownNew.size > 0 || showWelcome || localNew.includes(true);
  // The box redraws on every farm update; only letters it hasn't drawn yet slide in.
  const drawn = new Set<string>();
  const draw = (l: Letter, st: FarmState) => {
    const arriving = l.isNew && !drawn.has(l.key);
    drawn.add(l.key);
    return letterEl(l, st, arriving);
  };
  const d = openDialog({
    title: anyNew ? "You've got mail!" : "Mailbox",
    className: "fm-mail-dialog fm-menu",
    body: root,
    onClose: () => {
      if (liveRefresh === refresh) liveRefresh = null;
    },
  });
  const title = d.box.querySelector(".sv-dialog__title");
  if (anyNew) sfx("pop", { volume: 0.6 });

  const render = () => {
    const st = store.state;
    if (!st) return;
    const fresh = st.events.filter((e) => shownNew.has(e.id));
    const old = st.events.filter((e) => !shownNew.has(e.id) && !(lastSeen !== null && e.id > lastSeen && !ownIds.has(e.id)));
    const newLetters = toLetters(fresh, true);
    const oldAll = toLetters(old, false);
    LOCAL_MAIL.forEach((m, i) => {
      const l = m.letter(localNew[i]!);
      if (l) (localNew[i] ? newLetters : oldAll).push(l);
    });
    newLetters.sort(newestFirst);
    const letters: Letter[] = showWelcome ? [welcomeLetter(st), ...newLetters] : newLetters;
    const hasNew = letters.length > 0;
    const oldLetters = oldAll.sort(newestFirst).slice(0, hasNew ? 2 : OLD_LETTERS);
    if (title) title.textContent = hasNew ? (letters.length === 1 ? "You've got mail!" : `${plural(letters.length, "new letter")}!`) : "Mailbox";

    const parts: HTMLElement[] = [];
    if (!hasNew) {
      parts.push(
        el(
          "div",
          { class: "fm-mail__empty" },
          spriteIcon("ui.letter", { scale: 2 }),
          el("p", { class: "sv-say" }, "No new mail..."),
        ),
      );
    }
    letters.forEach((l) => parts.push(draw(l, st)));
    if (oldLetters.length) {
      parts.push(el("h3", { class: "fm-mail__old" }, "Older letters"));
      oldLetters.forEach((l) => parts.push(draw(l, st)));
    } else if (!hasNew) {
      parts.push(el("p", { class: "fm-quip" }, "Not even a seed catalog..."));
    }
    root.replaceChildren(...parts);
  };

  const refresh = () => {
    const st = store.state;
    if (!st) return;
    // New mail while the box is open: show it as new, and mark it read.
    const more = unreadEvents(st);
    const local = LOCAL_MAIL.map((m) => m.unread());
    if (more.length || local.includes(true)) {
      for (const e of more) shownNew.add(e.id);
      local.forEach((u, i) => u && (localNew[i] = true));
      markAllSeen(st); // calls notify() -> liveRefresh again, but nothing is unread then
    }
    render();
  };
  liveRefresh = refresh;

  markAllSeen(st0);
  render();
}
