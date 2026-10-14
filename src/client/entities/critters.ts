// The farm's wildlife. Art is plain data in critter-sprites.ts (registered by critter-art.ts) plus
// real frames from critters.png; each kind of critter has its own file:
//   critter-fox.ts      Otto the fox & Milo the hedgehog, their stump & blanket (+ the raccoon in the stump)
//   critter-tag.ts      the little "Otto" / "Milo" name tags that pop up when you tap them
//   critter-birds.ts    sparrows, blue jays, cardinals, crows, a woodpecker, the night owl
//   critter-bugs.ts     ladybugs (and a rare golden one), bumblebees and their bee houses, the Bumblesteed
//                       (each sighting sets localStorage farm.bumblesteed.lastSeen + emits "bumblesteed")
//   critter-ambient.ts  butterflies, the fence squirrel, the forest bunny, rain frogs
//   critter-flyers.ts   the wild parrots of Telegraph Hill, seagulls gliding over (one drops lunch)
//   critter-hen.ts      the neighbor's hen, now and then (Snickers stares her down)
//   critter-small.ts    a hummingbird among the flowers, a banana slug in the rain
//   critter-night.ts    the opossum (plays dead!), mosquitoes around the lights on summer nights
//   critter-trench.ts   the Trench Coat (it was raccoons / hedgehogs / mosquitoes all along)
//   critter-lore-*.ts   art for those (hand-drawn data + real frames from companions/critters/raccoons)
//   critter-star.ts     the rare shooting star (make a wish!)
//   critter-place.ts    where critters can stand: grass, fence rails & posts, decorations
//   critter-util.ts     emotes, shadows, sparkles, crash guards, localStorage helpers
// Snickers, the farm's cat, lives in snickers.ts.

import type { Game } from "../engine/game";
import { registerCritterArt } from "./critter-art";
import { initAmbient } from "./critter-ambient";
import { initBirds } from "./critter-birds";
import { initBugs } from "./critter-bugs";
import { initFlyers } from "./critter-flyers";
import { initCorner } from "./critter-fox";
import { initHen } from "./critter-hen";
import { registerLoreArt } from "./critter-lore-art";
import { initNight } from "./critter-night";
import { initSmall } from "./critter-small";
import { initTrench } from "./critter-trench";
import { initParticles, report } from "./critter-util";
import { initSnickers } from "./snickers";

export { critterParty, critterReact, foxPosition } from "./critter-fox";

export function initCritters(g: Game): void {
  // Each piece boots on its own: if one ever breaks, the farm (and the other critters) still load.
  const parts: [string, () => void][] = [
    ["art", registerCritterArt],
    ["lore art", registerLoreArt],
    ["particles", () => initParticles(g)],
    ["corner", () => void initCorner(g)],
    ["snickers", () => initSnickers(g)],
    ["ambient", () => initAmbient(g)],
    ["birds", () => initBirds(g)],
    ["bugs", () => initBugs(g)],
    ["flyers", () => initFlyers(g)],
    ["small", () => initSmall(g)],
    ["night", () => initNight(g)],
    ["trenchcoat", () => initTrench(g)],
    ["hen", () => initHen(g)],
  ];
  for (const [name, init] of parts) {
    try {
      init();
    } catch (err) {
      report(`init ${name}`, err);
    }
  }
}
