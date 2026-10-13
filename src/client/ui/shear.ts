// Shearing = "we did it!". Confirm, play the snip animation on the farm while the server
// records it, hand out the wool, then offer to write a little memory for the barn.

import { sfx } from "../audio";
import { pick } from "../engine/game";
import { playShear, shearFailed } from "../entities/sheep";
import { ApiError, api, store } from "../net";
import { LIMITS, LOOM_WOOL_COST } from "../../shared/types";
import { farmMoment, friendlyError, originalStamps } from "./animal-common";
import { THURSDAY, isBigThursday, planLore } from "./animal-lore";
import { closeAllDialogs, confirmDialog, promptDialog, registerMenu, say, toast } from "./dom";

export function initShear(): void {
  registerMenu("shear", (id: string) => void shearFlow(id));
}

/** Sheep currently mid-shear on this device (double taps, impatient fingers). */
const inFlight = new Set<string>();

const MEMORY_PLACEHOLDERS = ["The best part was...", "We laughed so hard when...", "Next time, let's...", "10/10 would shear again because..."];

const GOLDEN_LINES = [
  "Golden wool! Two for the chest. Even the stars are jealous.",
  "The wool is... glowing? Two for the chest!",
  "Golden wool! Two for the chest. Snickers would like to nap on it.",
];

type Lore = ReturnType<typeof planLore>;

/** The memory prompt's placeholder: about the plan when it's about something, else a classic. */
function memoryPlaceholder(lore: Lore, stuckToOriginal: boolean): string {
  const about = lore.pool("memory");
  if (stuckToOriginal && Math.random() < 0.5) return "We stuck to the ORIGINAL PLAN because...";
  if (about.length && Math.random() < 0.7) return pick(about);
  return pick(MEMORY_PLACEHOLDERS);
}

/** A little wink after the snip, for the plans that earn one. */
function shearWink(lore: Lore, stuckToOriginal: boolean): string | null {
  if (lore.has("karaoke")) return "Karaoke: survived. Legends.";
  if (stuckToOriginal) return "Stuck to the ORIGINAL PLAN. Classic.";
  if (lore.hits.some((h) => h.topic === "vampires" || (h.topic === "icecream" && h.place === "garlic"))) return "Vampires: zero. The garlic worked.";
  if (lore.has("loafing") && Math.random() < 0.6) return pick(["Loafed. Professionally.", "Back from the black hole. Barely."]);
  if (lore.has("tilden") && Math.random() < 0.6) return "Celery delivered. The cousins are thrilled.";
  const fins = lore.hits.find((h) => h.topic === "dolphins");
  if (fins && Math.random() < 0.5) return fins.place === "the Golden Gate" ? "Porpoises: spotted. Probably." : "Dolphins: spotted. Probably.";
  if (lore.has("sketch") && Math.random() < 0.5) return "Another sketching meetup, done!";
  try {
    if (isBigThursday(farmMoment().now)) return `Done on a ${THURSDAY}`;
  } catch {
    // no wink today
  }
  return null;
}

/** Run the whole shear flow for one sheep. Exported so other modules can trigger it directly. */
export async function shearFlow(id: string): Promise<void> {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    await runShear(id);
  } finally {
    inFlight.delete(id);
  }
}

async function runShear(id: string): Promise<void> {
  const s = store.sheep(id);
  if (!s) {
    toast("That sheep wandered off...");
    return;
  }
  if (s.shearedAt !== null) {
    await say(`${s.name} is already sheared!`);
    return;
  }

  const lore = planLore(s, pick);
  const yes = await confirmDialog(`Shear ${s.name}?`, { yes: "We did it!", no: "Not yet" });
  if (!yes) return;

  // The other farmer might have sheared it while we were deciding.
  const fresh = store.sheep(id);
  if (!fresh) {
    toast(`${s.name} wandered off before you got the shears out...`);
    return;
  }
  if (fresh.shearedAt !== null) {
    await say(`Looks like ${fresh.name} was already sheared! Teamwork.`);
    return;
  }

  closeAllDialogs();
  const golden = fresh.golden;
  const name = fresh.name;
  const woolBefore = store.state?.wool ?? 0;
  // Un-sheared earlier? Its old memory is still on it, and shearing without a memory keeps it.
  const prevMemory = fresh.memory;
  // Changed the plan, went back, and did the ORIGINAL PLAN after all.
  const stuckToOriginal = originalStamps(fresh) > 0;

  // Animation and request run side by side; the sheep entity follows store state afterwards.
  const [, result] = await Promise.all([
    playShear(id).catch((err) => console.warn("[shear] animation failed", err)),
    api.shear(id).then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, err }),
    ),
  ]);

  if (!result.ok) {
    const err = result.err;
    // Put the wool straight back on (otherwise it waits a few seconds for the server to agree).
    // A 409 means it really is sheared (the other farmer beat us to it), so leave it bare.
    if (!(err instanceof ApiError && err.status === 409)) {
      try {
        shearFailed(id);
      } catch {
        // the sheep reverts on its own anyway
      }
    }
    // Logged out: main.ts is already closing everything and showing the password gate.
    if (err instanceof ApiError && err.status === 401) return;
    if (err instanceof ApiError && err.status === 409) await say(`Looks like ${name} was already sheared! Teamwork.`);
    else if (err instanceof ApiError && err.status === 404) await say(`Hmm... ${name} wandered off.`);
    else await say(`Uh oh, the shears got stuck... ${friendlyError(err)}`);
    return;
  }

  const wool = golden ? 2 : 1;
  toast("Wool", { icon: "item.wool", count: wool });
  if (golden) {
    sfx("sparkle");
    await say(pick(GOLDEN_LINES));
  }
  const woolNow = store.state?.wool ?? woolBefore + wool;
  if (woolBefore < LOOM_WOOL_COST && woolNow >= LOOM_WOOL_COST) {
    setTimeout(() => toast(`${LOOM_WOOL_COST} wool! Loom time...`, { icon: "item.cloth", ms: 4200 }), 900);
  }
  const wink = shearWink(lore, stuckToOriginal);
  if (wink) setTimeout(() => toast(wink, { icon: "ui.sheep", ms: 3800 }), 500);

  const memory = await promptDialog({
    title: "A little memory?",
    label: "For the barn...",
    value: prevMemory,
    placeholder: memoryPlaceholder(lore, stuckToOriginal),
    multiline: true,
    maxLength: LIMITS.memory,
    ok: "Save memory",
  });
  // Cancelled, left blank, or unchanged: nothing to save.
  if (memory === null || memory === prevMemory || (!memory && !prevMemory)) return;
  try {
    await api.updateSheep(id, { memory });
    if (memory) {
      sfx("chime");
      toast("Memory tucked away in the barn.", { icon: "ui.heart.full" });
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    await say(`The memory didn't stick... ${friendlyError(err)}`);
  }
}
