// Shearing = "we did it!". Confirm, play the snip animation on the farm while the server
// records it, hand out the wool, then offer to write a little memory for the barn.

import { sfx } from "../audio";
import { pick } from "../engine/game";
import { playShear } from "../entities/sheep";
import { ApiError, api, store } from "../net";
import { LIMITS, LOOM_WOOL_COST } from "../../shared/types";
import { friendlyError } from "./animal-common";
import { closeAllDialogs, confirmDialog, promptDialog, registerMenu, say, toast } from "./dom";

export function initShear(): void {
  registerMenu("shear", (id: string) => void shearFlow(id));
}

/** Sheep currently mid-shear on this device (double taps, impatient fingers). */
const inFlight = new Set<string>();

const MEMORY_PLACEHOLDERS = [
  "The best part was…",
  "We laughed so hard when…",
  "Next time, let's…",
  "Favorite moment:…",
  "10/10 would shear again because…",
];

const GOLDEN_LINES = [
  "Golden wool! Two for the chest. Even Mr. Qi would be impressed.",
  "Golden wool?! That's going straight into the chest. Twice.",
  "The wool is... glowing? Two golden bundles for the chest!",
];

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
    toast("That sheep wandered off.");
    return;
  }
  if (s.shearedAt !== null) {
    await say(`${s.name} has already been sheared!`);
    return;
  }

  const yes = await confirmDialog(`Shear ${s.name}?\n(Only if you two actually did it!)`, { yes: "We did it!", no: "Not yet" });
  if (!yes) return;

  // The other farmer might have sheared it while we were deciding.
  const fresh = store.sheep(id);
  if (!fresh) {
    toast(`${s.name} wandered off before you got the shears out.`);
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
  // Un-sheared earlier? Its old memory is still on it: keep it (the server overwrites it on shear).
  const prevMemory = fresh.memory;

  // Animation and request run side by side; the sheep entity follows store state afterwards,
  // so if the request fails the sheep simply goes back to being woolly.
  const [, result] = await Promise.all([
    playShear(id).catch((err) => console.warn("[shear] animation failed", err)),
    api.shear(id, prevMemory).then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, err }),
    ),
  ]);

  if (!result.ok) {
    const err = result.err;
    // Logged out: main.ts is already closing everything and showing the password gate.
    if (err instanceof ApiError && err.status === 401) return;
    if (err instanceof ApiError && err.status === 409) await say(`Looks like ${name} was already sheared! Teamwork.`);
    else if (err instanceof ApiError && err.status === 404) await say(`Hmm, ${name} isn't on the farm anymore.`);
    else await say(`Uh oh, the shears got stuck. ${friendlyError(err)}`);
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
    setTimeout(() => toast(`${LOOM_WOOL_COST} wool! The loom can weave cloth now.`, { icon: "item.cloth", ms: 4200 }), 900);
  }

  const memory = await promptDialog({
    title: "A little memory?",
    label: "Write a note for the barn (optional)",
    value: prevMemory,
    placeholder: pick(MEMORY_PLACEHOLDERS),
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
    await say(`The memory didn't stick: ${friendlyError(err)} You can add it later from ${name}'s card.`);
  }
}
