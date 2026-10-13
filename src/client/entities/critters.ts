// The fox & hedgehog in the corner, the farm cat, butterflies, crows, a bunny, frogs...
// Art is plain data in critter-sprites.ts (registered by critter-art.ts); each critter has its own file:
//   critter-fox.ts      fox + hedgehog + their stump & blanket (+ Mr. Raccoon)
//   critter-cat.ts      the farm cat (real Stardew sheet)
//   critter-ambient.ts  butterflies, crows, the forest bunny, rain frogs
//   critter-util.ts     emotes, shadows, sparkles, localStorage helpers

import type { Game } from "../engine/game";
import { registerCritterArt } from "./critter-art";
import { initAmbient } from "./critter-ambient";
import { initCat } from "./critter-cat";
import { initCorner } from "./critter-fox";
import { initParticles, report } from "./critter-util";

export { critterParty, critterReact, foxPosition } from "./critter-fox";

export function initCritters(g: Game): void {
  // Each piece boots on its own: if one ever breaks, the farm (and the other critters) still load.
  const parts: [string, () => void][] = [
    ["art", registerCritterArt],
    ["particles", () => initParticles(g)],
    ["corner", () => void initCorner(g)],
    ["cat", () => initCat(g)],
    ["ambient", () => initAmbient(g)],
  ];
  for (const [name, init] of parts) {
    try {
      init();
    } catch (err) {
      report(`init ${name}`, err);
    }
  }
}
