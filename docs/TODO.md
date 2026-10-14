# TODO

## Small visual things

- **Toolbar hover flash (desktop), check by eye:** the fix is in (one compositor layer, no layers added or removed on
  hover), but the flash never showed in headless Chrome, before or after. Hover slot 8 and the selected tool in real
  Chrome and Safari to confirm, with and without unread mail: the mailbox icon's endless bounce (`tb-mail-bounce` in
  toolbar.css) still gives slot 7 a layer of its own, so if it only flashes while mail is waiting, that's the next suspect.

## Saved for later

- **"Snickers is a DOG."** (their joke). Ideas for where it could go: after the hen's first stare-down ("Snickers has never
  lost a staring contest."), about one later chase in three toasts "Snickers is a DOG." (guarding the yard is a dog's job;
  `critter-hen.ts`, next to STARE_LINE); and/or National Dog Day (Aug 26) as a quiet dot on the calendar with the same note
  (`calendar-festivals.ts`, after the Perseids).

## Easter eggs & random events

### The J-Church streetcar on the title skyline

Not built this round: the J lives in the TV line and Otto's third Bigfoot letter for now. The spec stays here for
when it's wanted. Files: src/client/ui/password.ts, password-art.ts, password.css ('ding' is already in audio.ts).

CAMEO (title page only; no farm chrome).
- New paintMuni(ctx, phase) in password-art.ts: a 22x9 side view of a 1-car Breda LRV facing LEFT. Rows:
  '.........p.p..........'
  '..........p...........'
  '..oooooooooooooooooo..'
  '.oSSSSSSSSSSSSSSSSSSo.'
  'oWWWSWWWSWWWSWWWSWWWSo'
  'oLWWSWWWSWWWSWWWSWWWSo'
  'oRRRRRRRRRRRRRRRRRRRRo'
  'osssssssssssssssssssso'
  '.okkhkkkkkkkkkkkkhkko.'
- Palette:
  - o #4a4a55, S #d9d9d2, s #b8b8b0
  - W #3d4f6e by day; #ffd27a at dusk and night, unhazed
  - R #c3343a (Muni red)
  - L headlight #fff6c8
  - k #3a3a42, h #6a6a72
  - p pantograph #4a4a55
- Mix every color except the lit windows and the headlight with CITY_LIGHT[phase].haze at 0.35, so it sits at the city's distance.
- Element:
  - a canvas 'gate-muni' appended to `sky` between city and ladies
  - bottom = calc(var(--cp) * (LADIES_H + 3)), so it rides the city's hill just above Postcard Row's roofs (the J's view of downtown)
  - nudge the row by eye; if it reads as floating, add a 1 px rail line (#6b6f7a, hazed) across the city canvas at its bottom row.
- Motion:
  - CSS keyframes translateX from the right screen edge to -24 art px, 26 s, linear.
  - First pass 18-30 s after the gate shows (while she's thinking about the riddle), then every 90-150 s.
  - 1 pass in 4 gets class 'is-stopping': a keyframe hold from 45% to 55% (it stops for a few seconds, then carries on).
  - With prefers-reduced-motion: no car.
- Sound: sfx('ding', {volume:.25}) as it enters and when it pulls away from a stop. It only plays if audio is unlocked; sfx() no-ops otherwise.

DEBUG: ?muni starts the first pass at 2 s, repeats every 35 s, and always stops.

### Left out (and why)

- The eyes-in-the-fog teaser by a tree: the date-seeded footprints already foreshadow him, and two amber pixels near a tree read like the owl's or the coat's eyes.
- Bigfoot walking the bottom fence in portrait: that's the Trench Coat's stage, and two tall strangers in one lane would cheapen both (landscape only borrows the lane because there's no headroom).
- Strange Capsule, UFO beam, the title-screen alien: keep Bigfoot the farm's only cryptid.
- A neighbor's tabby (cat.png) staring at Snickers: a second cat muddies Snickers, and KitKat's look is unknown and he lives in Arizona.
- Milo plays dead with the opossum: the opossum only comes out at darkness > 0.6, when Milo is already asleep, so it would almost never fire.
- Butterfly day (the Conservatory of Flowers swarm): 8-10 extra sprites and a rare-day system for one joke; the monarchs and Mission blues already cover butterflies.
- Fireworks behind Karl (Jul 4/NYE), Blue Angels shadows at Fleet Week, the Bay to Breakers salmon run: all great at making calendar notes true, but the first showing is 3-12 months away; keep for a post-ship pass.
- The tiny earthquake ('Did you feel that?'): fun SF group text, but a shaking screen can read as a bug or feel stressful; maybe later.
- Rainbow plus Prismatic Shard after rain: lovely, but a new sky pass is medium effort; post-ship.
- Foghorn on Karl days (a sheep answering): sound only, and Open-Meteo rarely reports fog codes 45/48 for SF, so it would almost never play; post-ship.
- Coyote howl with Otto answering, a distant rooster, the real parrot squawk, a wine clink, mosquito whine, the Whisker Lickins crunch: good cheap sound polish, but no new moments; batch it later.
- A sheep waiting at the gate for the J: touches sheep AI and the gate path; the J is covered by copy.
- Raccoon in the trash can: needs Pelican Town tileset cutting, its loot includes Joja Cola, and the raccoons already get the wine scene.
- Steller's jay raiding the dish: overlaps the gull-fish Snickers moment; maybe later.
- Pet gifts by the dish, raccoon Mystery Boxes, crow shinies, rare rhubarb/garlic forage: more chest economy than critter moments.
- Help Wanted board: a UI feature that needs shared server state.
- Lucky Purple Shorts / Muni-transfer artifacts: the shorts are a Stardew-mayor joke riding close to the no-characters rule, and the J is already covered.
- Hat blowing off on windy days: medium (hat anchors plus tumbling); post-ship.
- Fairy ring after the rains: good fall forage, but it's forage-system work rather than a critter moment; post-ship.
- Year of the Sheep party (Feb 6 2027), the giant pumpkin, April Fools flamingos, the wilted bouquet, the golden pumpkin, the anniversary cake, the stone owl: nice seasonal props, but the dates are far off or it's a new prop system; batch them later as data rows (the winter snowman already exists).
- The Pond Legend / jumping-fish splash: only matters on farms that bought a pond; low reach for ship.
