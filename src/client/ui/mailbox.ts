// Letters about what happened on the farm while you were away, Stardew style.
// Built from store.state.events: anything newer than the last letter this browser saw,
// minus the things this tab did itself (you know about those already). The exceptions:
// an ORIGINAL PLAN always gets a letter from its sheep, a Bumblesteed sighting on this
// device gets one (local, synthetic) letter from Otto per sighting day, and every couple of
// weeks or so Snickers's brother KitKat sends a postcard from Arizona (local too).

import "./mailbox.css";
import { sfx } from "../audio";
import { currentGame } from "../engine/game";
import { has } from "../engine/sprites";
import { serverNow, store } from "../net";
import { BUNDLES } from "../../shared/bundles";
import { dayKey, stardewDate } from "../../shared/calendar";
import type { DecorKind, FarmEvent, FarmEventKind, FarmState } from "../../shared/types";
import { openMemory } from "./barn";
import { safeStorage, sheepHead, timeAgo } from "./calendar-util";
import { el, openDialog, openMenu, plural, registerMenu, spriteIcon, toast } from "./dom";
import { bundleSackKey } from "./loom-art";
import { mailPaperSkin, registerMailboxArt } from "./mailbox-art";
import { originalPlanBadge } from "./stamp";
import { decorIcon } from "./shop";
import { DECOR_INFO, decorName } from "./shop-catalog";
import { hatIcon } from "../entities/sheep-hats";

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
  return unreadEvents(st).length + (welcomeUnread ? 1 : 0) + (steedUnread() ? 1 : 0) + (postcardUnread() ? 1 : 0);
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
  if (steedAt !== null) {
    steedReadDay = steedDay(steedAt);
    safeStorage.set(LS_STEED_READ, steedReadDay);
  }
  if (postcard && postcard.n >= 0) {
    postcardReadAt = postcard.at;
    safeStorage.set(LS_KITKAT_READ, String(postcard.at));
  }
  notify();
}

export function initMailbox(): void {
  registerMailboxArt();
  registerMenu("mailbox", () => openMailbox());
  if (started) return;
  started = true;
  readSteed();
  postcard = readPostcard();

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
    addEventListener("storage", (ev) => {
      if (ev.key === LS_KITKAT || ev.key === LS_KITKAT_READ) {
        postcard = readPostcard() ?? postcard;
        notify();
        return;
      }
      if (ev.key !== LS_STEED && ev.key !== LS_STEED_READ) return;
      readSteed();
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
              ? `I'm ${name}. Golden Boy or Tony's? ...Why not both.`
              : pick([`I'm ${name}. Can't wait... baa!`, `I'm ${name}. Can't wait... baa!`, `I'm ${name}! I hear Dolores Park has the best grass...`]),
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
          `${q(name)} left. Plans change... I do not.`,
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
                `We hiked all the way up Mt. Tam today, and the best view was still the new ${thing}.`,
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
      const bundle = BUNDLES.find((b) => b.name === name);
      const sack = gift(spriteIcon(bundle ? bundleSackKey(bundle.id) : "item.cloth"));
      if (bundle?.id === "seeds") {
        return { ...base, greeting: "Psst!", body: "The squirrels are furious about the Tree Seed Bundle. Milo and I are staying out of it...", sign: OTTO_MILO, gift: sack };
      }
      if (bundle?.id === "junk") {
        return { ...base, greeting: "Mow.", body: "You traded the rusty spoon for cloth. I was going to knock that off a table...", sign: SNICKERS, gift: sack };
      }
      return e.id % 2
        ? {
            ...base,
            greeting: "Psst!",
            body: `Word travels fast: the whole pasture is talking about the ${name}. Milo did a little victory roll.`,
            sign: OTTO,
            gift: sack,
          }
        : { ...base, greeting: "Mow.", body: "You put perfectly good snacks in a sack and got cloth. Next: a Salmon Bundle.", sign: SNICKERS, gift: sack };
    }
    default:
      return { ...base, greeting: "Humans,", body: "Something happened on the farm. I was asleep. Zzz...", sign: SNICKERS };
  }
}

function welcomeLetter(st: FarmState): Letter {
  const mine = /snickers/i.test(st.farmName) ? " (Named after me.)" : "";
  return {
    key: "welcome",
    at: st.serverNow,
    greeting: "Humans,",
    body:
      `Welcome to ${st.farmName}.${mine} Every sheep out there is a plan. Do the thing, then shear the sheep. ` +
      "I will be supervising...\n\nP.S. Scratches accepted. Some spots more than others.\nP.P.S. Fancy Feast. Salmon, if you have it.",
    sign: SNICKERS,
    gift: gift(sheepHead(false, { scale: 1.5 })),
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

/** What KitKat writes from Arizona (one after another, so no postcard repeats for a while). */
const POSTCARDS: readonly (readonly [greeting: string, body: string])[] = [
  ["Brother,", "It is 114° here. I lie on the tile. The tile is also hot.\n\nSay hi to your humans."],
  ["Hi you two!", "Is it foggy there? Here the sun is out. ALWAYS. Please mail me some fog. Karl, if he's free."],
  ["Brother,", "Monsoon season! It rained for four whole minutes. Everyone is still talking about it."],
  ["Brother,", "I found a cactus. I sat near it. Not on it. I learned."],
  ["Hi you two!", "The sunsets here are pink and orange and purple. Like lavender, but on fire."],
  ["Brother,", "A roadrunner ran past. I did not chase it. Too hot."],
  ["Hi you two!", "A javelina looked at me today. I looked back. We agreed never to speak of it."],
  ["Brother,", "It's a dry heat, they keep saying. I am melting anyway."],
];

function postcardLetter(p: { at: number; n: number }, isNew: boolean): Letter {
  const [greeting, body] = POSTCARDS[((p.n % POSTCARDS.length) + POSTCARDS.length) % POSTCARDS.length]!;
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
  };
}

/** `arriving` = first time this letter is drawn while the box is open (it slides in once). */
function letterEl(l: Letter, st: FarmState, arriving: boolean): HTMLElement {
  const date = l.key === "welcome" ? "Today" : `${stardewDate(new Date(l.at), st.foundedAt)} · ${timeAgo(l.at, serverNow())}`;
  return el(
    "article",
    { class: `fm-letter ${l.isNew ? "is-new" : "is-read"} ${arriving ? "is-arriving" : ""} ${l.postcard ? "is-postcard" : ""}` },
    l.isNew ? el("span", { class: "fm-letter__seal", "aria-label": "New" }) : null,
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
  maybePostcard();
  const shownNew = new Set<number>(unreadEvents(st0).map((e) => e.id));
  const showWelcome = welcomeUnread;
  let steedNew = steedUnread();
  let cardNew = postcardUnread();
  const anyNew = shownNew.size > 0 || showWelcome || steedNew || cardNew;
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
    if (steedNew && steedAt !== null) newLetters.push(steedLetter(steedAt, true));
    if (cardNew && postcard && postcard.n >= 0) newLetters.push(postcardLetter(postcard, true));
    newLetters.sort(newestFirst);
    const letters: Letter[] = showWelcome ? [welcomeLetter(st), ...newLetters] : newLetters;
    const hasNew = letters.length > 0;
    const oldAll = toLetters(old, false);
    if (!steedNew && steedAt !== null) oldAll.push(steedLetter(steedAt, false));
    if (!cardNew && postcard && postcard.n >= 0) oldAll.push(postcardLetter(postcard, false));
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
    const steed = steedUnread();
    const card = postcardUnread();
    if (more.length || steed || card) {
      for (const e of more) shownNew.add(e.id);
      if (steed) steedNew = true;
      if (card) cardNew = true;
      markAllSeen(st); // calls notify() -> liveRefresh again, but nothing is unread then
    }
    render();
  };
  liveRefresh = refresh;

  markAllSeen(st0);
  render();
}
