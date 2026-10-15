// Keepsakes: the farm's rare visitors each leave something in the shared chest, once per sighting,
// for the Field Research Bundle. Hail a Bumblesteed (Royal Honey), catch a golden ladybug (Pocket
// Sunshine), snap Bigfoot (the Blurry Photo), unmask the Trench Coat (Suspicious Fedora) or wish on a
// shooting star (Stardust; once a night per phone). Forcing an event with its debug flag and tapping
// it drops a real keepsake in the shared chest.

import { objectRegion } from "../art/regions";
import { REGIONS, SHEETS } from "../engine/sprites";
import { api, ApiError } from "../net";
import { toast } from "../ui/dom";

export const ROYAL_HONEY = "item.artifact.royal-honey";
export const POCKET_SUNSHINE = "item.artifact.pocket-sunshine";
export const SUSPICIOUS_FEDORA = "item.artifact.suspicious-fedora";
export const STARDUST = "item.artifact.stardust";
/** Bigfoot's photo (its art is drawn in critter-bigfoot.ts). */
export const BLURRY_PHOTO = "item.artifact.blurry-photo";

/** Every keepsake key, for the world's "can every bundle item be found?" check. */
export const KEEPSAKE_KEYS: readonly string[] = [ROYAL_HONEY, POCKET_SUNSHINE, BLURRY_PHOTO, SUSPICIOUS_FEDORA, STARDUST];

// Real Stardew icons: Honey, Solar Essence and Fairy Dust from objects.png, and the fedora off the
// animal hats sheet (its front frame, without the see-through rows under the brim).
REGIONS[ROYAL_HONEY] ??= objectRegion(340);
REGIONS[POCKET_SUNSHINE] ??= objectRegion(768);
REGIONS[STARDUST] ??= objectRegion(872);
SHEETS.animalHats ??= "sprites/animal_hats.png";
REGIONS[SUSPICIOUS_FEDORA] ??= { sheet: "animalHats", x: 142, y: 79, w: 16, h: 14 };

/**
 * Put something in the shared chest, fire-and-forget: one quiet retry 4 s later if the network
 * blinked (or the server hiccuped), and only a real failure says so.
 */
export function sendToChest(key: string, retries = 1): void {
  api.collectItem(key).catch((err: unknown) => {
    const status = err instanceof ApiError ? err.status : 0;
    if (retries > 0 && (status === 0 || status >= 500)) {
      window.setTimeout(() => sendToChest(key, retries - 1), 4000);
      return;
    }
    toast("Couldn't reach the chest...", { icon: key });
  });
}

/** A rare visitor left a keepsake: into the chest it goes, with a little toast after the event's own. */
export function keepsake(key: string, name: string, delayMs = 900): void {
  sendToChest(key);
  window.setTimeout(() => toast(`${name} → chest`, { icon: key }), delayMs);
}
