# TODO

## Small visual things

- **Desktop first open:** coming from the title screen, the farm flickers/jumps as the fence moves into place. Likely cause:
  `initHud()`/`initToolbar()` only run after `showPasswordGate()` resolves in `src/client/main.ts`, so the farm is laid out without
  the toolbar inset under the gate and relayouts once they mount. Lay out (and draw) the final farm before the gate fades.
- **Toolbar hover flashes (desktop):** hovering slot 8 (…) makes its frame vanish for a moment; hovering the selected tool (1 or 2)
  makes its red frame flash. Hover only lifts the icon in `toolbar.css`, so something on mouseenter is probably re-adding
  `.is-selected` / re-inserting the slot (restarting the `tb-select` animation) or reassigning `--tb-img-*` to new images that
  must decode again. Check `showLabel()` and anything a pointerover triggers in `src/client/ui/toolbar.ts`.

## Easter eggs & random events (curated, not built yet)

From a sweep of every sprite sheet, sound and existing egg. Group A = canvas world (critters, world events); group B = letters,
HUD, calendar, copy, chest, audio wiring. Each spec has its trigger, rarity, art rects, exact copy and a debug flag to force it.

### 1. Bigfoot walks past in Karl the Fog (tap for a blurry photo) (group A)

**Why:** This is the asset you're excited about, and it lands on lore: a Pacific Northwest legend (her Washington roots) seen through Karl the Fog, re-enacting the famous NorCal film's look-back. It's rare, wordless and easy to miss. The shared chest turns a solo 'did you see that?!' into proof the other person finds later.

**Files:** NEW src/client/entities/critter-bigfoot.ts. NEW src/client/public/sprites/bigfoot.png: a copy of 'assets/raw/PC _ Computer - Stardew Valley - Animals - Bigfoot.png' cropped to 256x96 (rows 96-127 are empty). Edits: src/client/entities/critters.ts (call initBigfoot(g) in initCritters); src/client/entities/critter-fox.ts (export critterStartle); src/client/entities/sheep.ts (export sheepStartle); src/client/entities/critter-trench.ts (skip the coat on a Bigfoot night).

WHEN.
- Picking the night (both phones agree because it comes from the date): eveningKey(now) = dayKey(now) if hour >= 12, otherwise dayKey(yesterday).
- r(key) = hash2(Number(key.replaceAll('-','')), 0xb1, 0xf007), using hash2 from world/world-pixels.ts.
- isBigfootNight(key) is true when:
  - the key ends in '-10-20' (the anniversary of the Patterson-Gimlin film, Oct 20 1967; that's one week after ship), OR
  - r(key) < 0.10 AND r is >= 0.10 for each of the 4 evenings before it.
- Karl bonus: if g.env.weather === 'fog' when the roll runs, the night also counts when hash2(seed, 0xb2, 0xf007) < 0.25.
- Never in the farm's first 3 days (store.state.foundedAt), except on Oct 20.
- Time window:
  - evening: env.hour >= DUSK_HOUR[season] - 0.5, or hour < 1
  - dawn: 5 <= hour < 7.5
  - never in rain or storm (snow is fine).
- Once per device per evening: skip if eveningKey(new Date(Number(lsGet('farm.bigfoot.lastSeen')))) is tonight's key.
- Never on a Trench Coat night:
  - skip if farm.trenchcoat.lastSeen is less than 12 h old
  - export bigfootTonight(): boolean (he's on screen, or walked this evening); initTrench's roll returns early when it's true.
- The roll: onTick every 15 s. It needs the farm open >= 20 s this session, !document.hidden and !isDialogOpen() (from ui/dom). Chance 0.3 per roll, so on a Bigfoot night anyone looking sees him within a minute or two.

WHERE.
- Portrait:
  - feetY = l.fence.y - 3: the yard strip behind the top fence. The rails hide his shins. y-sorting puts him in front of the barn and Snickers and behind the farm sign and the fence.
  - He enters at x = l.w + 20, walks LEFT (the sheet faces right, so flipX) and leaves at x = -20.
  - Sheep feet never get above pasture.y = fence.y + 24, so he can't overlap them.
- Landscape (fence.y is at the top of the screen, so there's no headroom):
  - claimBottomLane(this), and skip if it returns false.
  - feetY = pasture.y + pasture.h - FENCE_HIDE.
  - He enters at pasture.x - 20 walking right, does the look 40-60% of the way to hangout(l).x - 24, then turns around and walks back out on the left, like the Trench Coat.

SPRITES (SHEETS.bigfoot ??= 'sprites/bigfoot.png'). Cells are 32x48, feet on the cell's last row, body centered at x 16, no baked shadow.
- critter.bigfoot.walk.0-7 = {x:32*i, y:0, w:32, h:48}: faces right, one 8-frame cycle is 2 steps, frames 2 and 6 are the full strides.
- critter.bigfoot.front.0-7 = {x:32*i, y:48, w:32, h:48}: frame 0 is eyes open, 2 is a blink (no eyes), 6 is a head tilt.
- critter.bigfoot.icon = {x:4, y:48, w:24, h:24}.
- No hand-drawn fallback: never spawn unless isReal('critter.bigfoot.walk.0').

DRAWING.
- draw(ctx, key, x-16, feetY-47, {flipX}) and drawShadow(ctx, x, feetY, 20).
- Walk at 6 fps and about 22 px/s. Tune by eye so his feet don't slide (speed = px one cycle covers / 1.33 s).
- THE LOOK (the Patterson film beat): when x crosses lookX = rand(0.4, 0.6) * l.w, he stops and faces you:
  - front.0 for 1.0 s
  - front.2 for 0.12 s (blink)
  - front.0 for 0.5 s
  - front.6 for 0.7 s (head tilt)
  - front.0 for 0.3 s
  - then he walks on.
- Moonlight: if darkness > 0.45, g.addLight({x, y:feetY-22, radius:22, color:'rgba(170,186,255,0.2)'}), so he reads as a moonlit silhouette.
- Fog: the fog pass (order 60) draws over entities, so Karl veils him for free.
- EYE GLINT: a new pass at order 115.
  - Only during the look, only on front frames 0 and 6, only when darkness > 0.2 or it's foggy.
  - Two 1x1 px dots of #ffbe6e at alpha min(0.95, 0.4 + darkness).
  - Cell pixels (14,12)+(19,12) for f0 and (14,14)+(19,15) for f6, measured from (x-16, feetY-47).
- SOUND:
  - sfx('rustle', {volume:.35, pitch:.7}) when he steps on screen.
  - sfx('thud', {volume:.12, pitch:.6}) on walk frames 2 and 6 while 0 < x < l.w (thud.wav is Stardew's thudStep).
  - Silent during the look.
- No copy and no toast when he appears. He never speaks.

REACTIONS (once, when he is 16 px on screen).
- g.emit('scare', {x, y:feetY-20, r:90}), so the fence birds fly off.
- +0.4 s: critterStartle(x), a new export in critter-fox.ts.
  - Otto: if asleep, set('alert', 3) plus emote 'exclaim' (he lifts his head, and the night logic puts him back to sleep afterwards); otherwise react('exclaim', x).
  - Milo: copy Hedgehog.onTap's ballFrom/set('ball', 4) lines, without the tap sound or line.
- +0.6 s: sheepStartle(x, feetY, 90, 3), a new export in sheep.ts. Up to 3 of the nearest sheep within 90 px that canReact() pop 'exclaim', staggered 160 ms.
- If darkness > 0.6: sfx('owl', {volume:.4}) at +1.5 s.
- Snickers: NO reaction at all, not even a glance. That's the joke.
- At the same moment: lsSet('farm.bigfoot.lastSeen', String(Date.now())) and (currentGame ?? g).emit('bigfoot'). The mailbox (group B) listens for this.

TAP = THE PHOTO.
- hit(): only while walking or looking with 0 < x < l.w. Box (x-11, feetY-44, 22, 26): head and torso only.
- onTap:
  - sfx('camera') (added by B).
  - White flash: a pass at order 120 that fills the whole screen with #fff, alpha 0.55 down to 0 over 0.16 s. With prefers-reduced-motion: peak 0.25, over 0.3 s.
  - He cuts the look short, faces his walking direction and hurries off at 2.2x speed and 10 fps.
- First tap of each sighting only:
  - toast('Got him! ...It’s blurry.', {icon:'item.artifact.blurry-photo'})
  - api.collectItem('item.artifact.blurry-photo') (import api from ../net). One quiet retry after 4 s on a network or 5xx error. A real failure toasts 'Couldn’t reach the chest...', the same as world-nature's toChest.
  - The key already passes ITEM_KEY_PATTERN, and itemName() turns it into 'Blurry Photo'. The chest note is B's.
- PHOTO SPRITE: in initBigfoot (the sheets are loaded by then), registerArt('item.artifact.blurry-photo', a 16x16 canvas):
  - 1 px outline #8a7a5e
  - cream frame #f4ead2: 1 px on the top, left and right, 3 px on the bottom
  - a 12x10 window at (2,2): top half #b9c6c0, bottom half #9fb0a8
  - front.0 shrunk nearest-neighbor to 6x9, drawn at (5,3) with alpha .85 and again at (6,3) with alpha .45 (that's the blur)
  - if the sheet is missing: a 4x7 #3a2618 blob instead.

DEBUG: ?bigfoot makes it a Bigfoot night and ignores the window, weather, cooldown, trench and foundedAt rules. The first walk starts 3 s after load, and another starts 30 s after each exit.

### 2. Otto's Bigfoot letters + the photo's chest note (group B)

**Why:** The morning-after letter extends the sighting into the shared world. Otto writing breathlessly is pure critter voice. It echoes the Bumblesteed letter's 'Milo is never wrong', and letter 3 slips in the J-Church joke.

**Files:** src/client/ui/mailbox.ts, src/client/ui/loom.ts

MAILBOX (copy the Bumblesteed pattern in mailbox.ts: LS_STEED/readSteed/onSteed/steedLetter).
- Read localStorage 'farm.bigfoot.lastSeen' (an ms timestamp, written by group A). Subscribe with currentGame?.on('bigfoot', ...) and a storage event, the same way steed does.
- The letter ARRIVES THE NEXT MORNING:
  - Let ek = dayKey(at) if new Date(at).getHours() >= 12, otherwise the day before.
  - The letter is visible and unread once now >= the day after ek, at 06:00 local.
  - Read marker: 'farm.mail.bigfootRead' = ek.
- Rotation:
  - Keep 'farm.mail.bigfootN' (the count of distinct ek's shown so far), incremented the first time a new ek's letter is listed.
  - body = BODIES[(n-1) % 3], key `bigfoot-${ek}`, greeting 'Psst!', sign OTTO, action null.
  - gift = has('critter.bigfoot.print') ? spriteIcon('critter.bigfoot.print') : null. Use the footprint, not his face.
- BODIES (exact):
  1. 'Something VERY tall walked past the fence last night. Milo says it was just Karl the Fog. Milo is never wrong... right?'
  2. 'It came back. Big. Fuzzy. Smelled like wet ferns and Washington. Milo stayed in a ball until breakfast.'
  3. 'Saw him again, heading for Church Street. I think he was trying to catch the J. He’ll be waiting a while...'
- Include it in the unread count, the 'new' list and the 'older letters' list exactly like steedLetter.

LOOM.TS: add the ITEM_NOTES entry 'item.artifact.blurry-photo': 'It’s definitely him.'

DEBUG: ?bigfootletter treats lastSeen as yesterday 21:00 (in memory only, not saved), so the letter shows unread right away.

### 3. Giant footprints the morning after (group A)

**Why:** It's evidence that turns up for whoever wasn't looking, so it turns into a 'did YOU see him last night?' conversation. It teases Bigfoot before anyone has ever seen him, and it costs nothing at runtime.

**Files:** src/client/entities/critter-bigfoot.ts (same new file as the sighting)

WHEN.
- The morning after a Bigfoot night:
  - isBigfootNight(yesterday's eveningKey) on BOTH phones, so whoever missed him still finds the evidence, OR
  - this device's farm.bigfoot.lastSeen evening key is last night's (this covers fog-bonus and ?bigfoot sightings).
- Visible from 05:30 to 12:00.
- Hidden while it's raining or storming.
- Fade: alpha *= 1 - smoothstep(10, 12, hour).

WHERE.
- 7 prints in a gentle diagonal across the top third of the pasture, from (pasture.x + pasture.w + 4, pasture.y + 10) to (pasture.x - 4, pasture.y + pasture.h*0.35). That's the direction he walks: right to left.
- Evenly spaced, alternating left and right feet, offset ±3 px from the line.
- Jitter ±2 px using hash2(seed, i, 0xf00d), where seed = today's dayKey digits, so both phones match.
- Skip any print where !openGrass(l, x, y, 4) (decorations, the corner).

LOOK.
- Hand-drawn 5x9 right print, then rotated 90° so the toes point left (the way he walked). Left prints are mirrored. Rows (x = pixel):
  'x.x.x'
  '.....'
  '.xxx.'
  'xxxxx'
  'xxxxx'
  '.xxxx'
  '.xxx.'
  '.xxx.'
  '..xx.'
- Color: rgba(52,34,22,0.32). In winter (snow tiles): rgba(110,130,165,0.5).
- One entity at layer 0 (ground, drawn under the sheep; hitTest checks layer 1 sheep first, so it never steals their taps).
- Also registerArt('critter.bigfoot.print', a 12x12 canvas with one print in #5a3a24). B uses it as the letter gift and the toast icon.

TAP (within 7 px of a print).
- sfx('rustle', {volume:.3, pitch:.8}) and critterReact('question', x) (Milo and Otto look over).
- First tap of the day only: toast('Huge footprints... Milo measured one. Three Milos long.', {icon:'critter.bigfoot.print'}).

DEBUG: ?footprints shows today's trail at any hour, without the fade.

### 4. Snickers pushes the coffee off the fence post (while making eye contact) (group A)

**Why:** It's the most cat thing a cat can do, done by her real cat, and found by accident with the morning coffee (a lore wink at the SF roasters and Washington). It reuses Snickers' existing paw-up and front-head parts, so no new hand-drawn frames.

**Files:** NEW src/client/entities/snickers-coffee.ts (the mug, its steam, the fall, the splash decal, placement). Edit src/client/entities/snickers.ts (a knockMug sequence plus an export so the mug can request it). No new Snickers art (it reuses existing parts).

WHEN.
- Date-seeded, so both phones get the same mornings: hash2(seed, 0xc0f, 0xfee) < 0.2, about 1 morning in 5.
- 06:00-10:30. Not in rain, storm or snow.
- Portrait only. Landscape has no top-rail post next to his yard, so there's no mug there.
- 'farm.coffee.day' = dayKey once it has been knocked over, so it never comes back the same day.

THE MUG.
- REGIONS['item.coffee'] = objectRegion(395) = {sheet:'objects', x:176, y:256, w:16, h:16}: Stardew Coffee.
- Placement:
  - Pick a top-rail post (fenceRuns(l).rails where top) that's free (freePosts) and >= 14 px from l.gate.x, with a Snickers yard seat (kind fence or sun, not door or shelter) 10-22 px to its side.
  - Feet sit on the post cap at rail.feet - POST_TOP + 1, placed and sorted like the birds perched on posts.
  - No such pair: no mug today.
- Steam: every 0.6 s a 1 px wisp, #ffffff at alpha .5, rises 6 px from the mug's rim and fades. Reduced motion: 2 static pixels.

TAP THE MUG.
- sfx('sip') and 3 extra wisps.
- First tap: toast('Still hot.', {icon:'item.coffee'}).
- Later taps: 1 in 4, at least 30 s apart: 'Blue Bottle? Sightglass? Ritual? Philz? ...Yes.'
- Each tap pushes Snickers' timer back by 30 s.

THE CAT BEAT.
- 60-120 s after the mug first draws on this device (12 s with debug).
- Only if Snickers is awake and not walking, eating, being petted, in a frenzy or wet. A nap is fine: he gets up.
- Sequence:
  1. He walks to that seat (walkTo) and sits facing the mug for 1.5 s.
  2. He turns his face to the camera: groomBody + headFront, the front pose, so eye contact is built in. 1.2 s.
  3. He swipes: groomBody + headFront + pawUp1 then pawUp0, shifted dx -3 toward the mug (flip the whole composite if the mug is on his right), 0.25 s per frame. Each swipe nudges the mug 1 px.
  4. Pause 0.8 s (still looking at you), swipe, pause, then the 3rd swipe tips it.
- The fall:
  - The mug falls off the far side in an arc: vx 20 px/s away from him, gravity 220 px/s², rotating to 90°.
  - It lands in the grass at rail.feet + 6.
  - sfx('smash', {volume:.5}), and dotPuff(['#6b3e1f','#a8673a','#e9dcc8'], 6).
  - It leaves a splash decal at layer 0 (not tappable) until 12:00: a 3x2 #6b3e1f blob at alpha .6 plus 2 shard pixels in #f4ead2.
- First time ever on this device (ls 'farm.snickers.coffee'), 0.6 s after the landing: toast('He made eye contact the whole time.', {icon:'item.coffee'}).
- Then set('groom', 3), as if nothing happened.

DEBUG: ?coffee puts the mug out now (any day, hour or weather) and he comes for it after 12 s.

### 5. The chest's string finally summons Snickers (group A)

**Why:** It pays off a secret that currently goes nowhere: the toast promises his ears perked up, and then nothing happens outside. It's built on the spec's core Snickers lore (he loves string) and it's a pure critter moment.

**Files:** src/client/entities/snickers.ts (optionally NEW src/client/entities/snickers-string.ts for the string entity). Depends on B's one-line emit in loom.ts (see the plumbing pick).

TRIGGER: g.on('string') in initSnickers, next to the 'barnDoor' listener. B emits it when the chest closes after the string's secret poke (the existing toast 'Somewhere outside, a grey cat’s ears just perked up...'). Ignore it if a chase is already running. If he's in a frenzy or being petted, run it right after.

THE STRING.
- A hand-drawn 10x4 red squiggle with 2 wiggle frames that swap every 0.18 s. Same palette as the chest's 'item.string': outline #6a1428, strand alternating #e0384f / #a8203a, frayed tip #ff8da0.
- It sits at the door spot + (12, 1). If that isn't in the yard, use the nearest yard spot.
- It drags 3 px left and right on a slow sine, as if someone is pulling it.

SNICKERS.
- Wakes even from a nap or sleep, like the dish: showEmote('exclaim'), sfx('meow', {pitch:1.1}), mow('Mow!'), walkTo(door, hurry=true).
- If he's sheltering wet from rain: only the exclaim and the mow. He stays dry.
- On arrival:
  1. Crouch: the loaf pose for 0.9 s with a fast tail flick.
  2. 3 pounces: each is a hop arc 5 px high over 0.35 s, landing on the string's x, alternating facing. After pounces 1 and 2 the string jumps 2 px away. Each landing: sfx('rustle', {volume:.3, pitch:1.4}).
  3. Then he loafs on top of it for 8-12 s, with 2 px of string peeking out: showEmote('heart'), mow('Mow.') and one spawnMlem.
- When he gets up the string is gone (he took it).
- No new copy: the chest toast already set it up.

DEBUG: ?string emits 'string' 3 s after load.

### 6. A seagull drops a fish, and Snickers wins (group A)

**Why:** It introduces two existing favorites to each other: the Ocean Beach gulls (whose pizza toast finally pays off) and Snickers' salmon obsession. It's a little bit of living-world chaos she'll catch by accident.

**Files:** src/client/entities/critter-flyers.ts (the fish run and the falling fish entity); src/client/entities/snickers.ts (export snickersDish(): Point | null, his dish's feet position, and snickersSnack(onEat: () => void): boolean)

TRIGGER (in initFlyers, when a gull pass spawns).
- Conditions:
  - darkness < 0.3
  - snickersDish() is not null
  - lsGet('farm.gull.fish') !== dayKey(now)
  - chance 1/10
- Then this pass is a FISH RUN:
  - 1 gull, line = dish.y - 34 (so it flies over the yard, not the pasture), from a random side.
  - When |gull.x - (dish.x + 12)| < 4 it lets go and lsSet('farm.gull.fish', dayKey).
- Gulls already skip rain and snow.

THE FISH.
- Pick:
  - 5/12 Anchovy: objectRegion(129) = {x:144, y:80}
  - 5/12 Sardine: objectRegion(131) = {x:176, y:80}
  - 2/12 Salmon: objectRegion(139) = {x:304, y:80}
  - All 16x16 on objects. Register them as item.fish.anchovy / item.fish.sardine / item.fish.salmon.
- Falls from (gull.x, gull.y + 4) to (dish.x + 12, dish.y) in about 0.55 s with gravity, spinning in 90° steps every 0.1 s.
- Landing: sfx('slap', {volume:.45}) (from B), 2 small bounces (2 px), then it lies flat. The gull cries sfx('seagull', {volume:.3}) 0.3 s after the drop and flies on.
- Not tappable (no onTap), so it never blocks a tap.
- It fades after 60 s if nobody eats it.

SNICKERS (snickersSnack).
- Comes even out of a nap: showEmote('exclaim'), sfx('meow'), walkTo(eat spot, hurry).
- If he's in a frenzy or being petted: queue it.
- On arrival he starts the existing meal (eat state, 4-6 s). onEat() removes the fish at the first nom. Then mow('Mow.') and showEmote('heart').
- Copy, shown when he starts eating:
  - a salmon (any time): toast('SALMON. He’ll be talking about this for weeks.', {icon:'item.fish.salmon'})
  - otherwise, the first fish ever only (ls 'farm.gull.fishFirst'): toast('Free lunch.', {icon: that fish key}).

DEBUG: ?gullfish makes the next gull pass a fish run within 3 s (skips the chance and the day limit). ?gullfish=salmon forces a salmon.

### 7. Wine Wednesday nights: somebody finished the wine (group A)

**Why:** Wine Wednesday plus the 'secretly a hundred raccoons' couple joke, told with the unused arm-in-arm raccoon pair. There are two of them, like the two of you, and it never repeats the Trench Coat gag.

**Files:** src/client/entities/critter-fox.ts (the pair entity, the tipped bottle state, the wineDay debug override); src/client/entities/critter-lore-art.ts (the new raccoon cells)

WHEN.
- wineDay(g) (Wednesday) with darkness > 0.6, until midnight (it becomes Thursday then).
- Check every 45-90 s with chance 0.3.
- At most once per Wednesday per device (ls 'farm.wineRaccoons' = dayKey).
- Not while the stump raccoon is peeking (corner.raccoon.active).
- Otto and Milo stay asleep: they sleep through it.

SPRITES (raccoons.png, already loaded).
- The PAIR (brown and grey, arm in arm, shadow baked): critter.raccoon.pair.0-7 = {x:256+32*k, y:64, w:32, h:32}.
- Grey raccoon trotting (it faces left): critter.raccoon2.run.l0-7 = {x:256+32*i, y:32, w:32, h:32}. Draw with flipX to go right.
- Brown: the existing RACCOON_RUN.left.

ON SCREEN.
- The pair's feet go at hangout-local (46, 31), standing among the wine glasses and the bottle.
- They sway: pair frames 0-7 at 0.15 s each.
- If nobody taps them within 45-70 s they waddle off the way described below, with no toast and no tip.

TAP (box: 26x24 around the pair).
- toast('Somebody finished the wine...', {icon: WINE}).
- sfx('rustle', {volume:.4}).
- The bottle tips over:
  - sfx('thud', {volume:.3, pitch:1.6}).
  - Set a module flag wineTipped. The wine Prop's key fn returns 'critter.wine.tipped' (registerArt at init: WINE drawn rotated 90° clockwise into 16x16) for the rest of that night.
- They split up:
  - Brown trots left with RACCOON_RUN.left at 38 px/s and fades over the last 12 px at the pasture's left edge, like the coat.
  - Grey trots to the stump (STUMP), then dotPuff and a sfx('thud') like a knock, and it's gone.

DEBUG: ?wineraccoons makes wineDay() return true and spawns the pair 3 s after load, at any hour, skipping the chance and the day limit.

### 8. Monarchs in fall and winter, Mission blues in spring (group A)

**Why:** Real California seasonal visitors (the Pacific Grove monarch overwintering, and SF's own endangered butterfly from Twin Peaks and San Bruno Mountain). It fills the thin fall and winter daytime right when she gets the game. Two data rows on an existing class.

**Files:** src/client/entities/critter-ambient.ts

SPRITES (critters.png, already loaded; register REGIONS only, NOT BUTTERFLY_COLORS, so they never show up in the random picks).
- Monarch (orange with dark veins, checked by eye): critter.butterfly.monarch.0-3 = {x:64+16*i, y:288, w:16, h:16}.
- Mission blue (tiny, light blue, checked by eye):
  - critter.butterfly.missionblue.0 = (272,304)
  - .1 = (288,304)
  - .2 = (304,304)
  - .3 = (288,304) again, so the existing FLAP order works.
- Spawn only if isReal().
- Give Butterfly an optional color argument, used in place of pick(BUTTERFLY_NAMES).

MONARCH.
- Oct 1 to Feb 28, on niceDay(g).
- Check every 45-120 s with p 0.3. At most 1 on screen.
- It's passing through:
  - spawns at the top (x random, y = pasture.y - 10)
  - moves at 0.7x speed
  - every 3rd flap cycle it holds frame 0 (wings open) for 0.5 s, a glide
  - picks 2 targets, each lower on screen than the last (a rail or flower perch is fine, never a sheep), then leave()s toward the nearer bottom corner.
- Today nothing flies in fall or winter, so it's the only butterfly then.

MISSION BLUE.
- Spring only (Mar-May), on niceDay.
- Each normal spawn has a 1 in 6 chance of being a Mission blue instead, if none is on screen.

TAP (both).
- Hittable only while landed on a non-sheep perch (state land && perchSheep === null), 12x12 box. That way it never steals a sheep's tap.
- Toast once per season per device (ls `farm.bfly.${kind}` = year-season):
  - Monarch: 'A monarch, on its way to Pacific Grove.'
  - Mission blue: 'A Mission blue! It only lives on a few hills around SF.'
- Icon: frame 0. No sound.

DEBUG: ?monarch / ?missionblue spawns one within 2 s at any season, weather or hour, and again every 30 s.

### 9. Otto and Milo cheer every shearing (yours or the other farmer's) (group A)

**Why:** Shearing is the core 'we did it!' loop, and today the critters ignore it (critterReact is only called by crows, the bunny and the coat). One small hook puts her favorite animals in the celebration, and it reacts to the other person's progress too.

**Files:** src/client/entities/sheep.ts (the animateShear hook); src/client/entities/critter-fox.ts (export critterCheer)

HOOK: in sheep.ts animateShear(), after `await e.shear(own)`, call critterCheer(e.x, e.data.golden). That path also runs for remote shears (store.events 'sheared' && !own), so the live-sync moment gets an audience.

critterCheer(x, golden), new in critter-fox.ts.
- Skip entirely if the fox is asleep (at night they sleep through it).
- After 600 ms, so it lands after the wool pops:
  - Otto: react(golden ? 'heart' : 'happy', x).
  - Milo: if not asleep or balled up, hog.set('party', 1.2) and hog.emote.show('music', 0.15).
  - sfx('squeak', {volume:.35, pitch:1.3}) once.
- No copy.
- It fires every time, but it's only a small emote, so it stays background.

DEBUG: ?cheer runs critterCheer(l.w/2, false) every 10 s.

### 10. The Trench Coat finally gets letters (Milo denies everything) (group B)

**Why:** It pays off the 'he's secretly a hundred raccoons / hedgehogs / ten thousand mosquitoes' couple joke with a critter alibi, using an event that already fires. Copy only, no art.

**Files:** src/client/ui/mailbox.ts

critter-trench.ts already emits g.emit('trenchcoat', insides) on a reveal and sets farm.trenchcoat.lastSeen, but nothing listens.

LISTENING.
- currentGame?.on('trenchcoat', (insides) => ...) stores ls 'farm.mail.trench' = JSON {at: Date.now(), insides}.
- Only the first reveal per calendar day writes a new letter.
- Unread until 'farm.mail.trenchRead' === String(at).
- It arrives immediately, like the Bumblesteed letter, and is listed in unread, new and older the same way as steedLetter.
- key `trench-${at}`. gift = has('critter.trenchcoat.icon') ? spriteIcon('critter.trenchcoat.icon') : null.
- New sign constant: MILO = 'Milo 🦔'.

COPY (exact).
- raccoons: greeting 'Psst!', body 'The raccoons say they were only borrowing the coat. Milo and I are keeping an eye on the stump.', sign OTTO.
- hedgehogs: greeting 'Psst!', body 'It wasn’t me in the coat. I was asleep. Ask Otto.', sign MILO (his first solo letter).
- mosquitoes: greeting 'Humans,', body 'The coat was full of bugs. I did not eat any.\n\n(I ate one.)', sign SNICKERS.

DEBUG: the existing ?trenchcoat=raccoons|hedgehogs|mosquitoes, then tap the coat. The letter shows on the next mailbox open.

### 11. The J line: a TV line, plus a J-Church streetcar gliding across the title skyline (group B)

**Done:** the TV line (Oct 13). **Still to do:** the streetcar cameo. The title page is now Alamo Square, so place it along the downtown skyline behind the Ladies.

**Why:** You asked for a J mention in copy, plus a visual cameo only if it fits. The title page already has a hand-drawn SF skyline, so a tiny J climbing past downtown fits without touching the farm. She'll see it on ship day, typing Snickers' riddle. The 'always 10 minutes away' joke lands in the existing news ticker.

**Files:** src/client/ui/hud.ts; src/client/ui/password.ts; src/client/ui/password-art.ts; src/client/ui/password.css; src/client/audio.ts (the 'ding' synth, listed in the plumbing pick)

COPY (hud.ts TRIVIA).
- Replace 'Muni update: the N is running late. The sheep decided to walk.' with exactly: 'Muni update: the J is 10 minutes away. It has been 10 minutes away for 20 minutes.'
- Debug: ?tv=muni makes tvLine() return it.
- (Otto's 3rd Bigfoot letter is the second J mention. Keep it to these two in copy.)

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

### 12. Plumbing for the new moments: sounds, preloads, and the string hook (group B)

**Why:** It keeps the two groups' files completely separate. Group A only calls sfx names and listens for 'string'. Every new sound is a real Stardew recording from the raw folders, with a synth fallback, so nothing breaks before the files ship.

**Files:** src/client/audio.ts; NEW src/client/public/sounds/camera.wav, slap.wav, sip.wav, smash.wav; src/client/ui/loom.ts

AUDIO.TS (land this first; group A's code calls these names).
- Add to the Sfx union: 'camera' | 'slap' | 'sip' | 'smash' | 'ding'.
- FILES:
  - camera: 'camera.wav'
  - slap: 'slap.wav'
  - sip: 'sip.wav'
  - smash: 'smash.wav'
  - 'ding' has no file: it's synth only.
- FILE_GAIN starting points (set by ear against thud):
  - camera 0.8
  - slap 2
  - sip 4 (the recording is very quiet)
  - smash 1
- SYNTHS is Record<Sfx, Synth>, so every new name needs a fallback:
  - camera: two 8 ms noise clicks 45 ms apart, highpassed at 2 kHz
  - slap: a 120 Hz sine thump (60 ms) plus a short noise burst
  - sip: bandpassed noise, 250 ms swell
  - smash: 3 staggered highpassed noise bursts plus a 2.5 kHz ping
  - ding: two bell strikes 180 ms apart, each sine 1480 Hz + 2350 Hz (+3700 Hz at 0.2), 3 ms attack, exponential decay 0.6 s, gain .25
- MIN_GAP camera = 0.3.
- Add camera, slap, sip and smash to PRELOAD_LATER. Otherwise the first shutter arrives more than 350 ms late and gets skipped.

CONVERT (assets/raw is git-ignored; use mono 22.05 kHz like the rest):
- ffmpeg -i 'assets/raw/Interface/cameraNoise.wav' -ac 1 -ar 22050 src/client/public/sounds/camera.wav
- 'assets/raw/Characters/fishSlap.wav' -> slap.wav (trim to 0.5 s with a 0.1 s fade-out)
- 'assets/raw/Miscellaneous/sipTea.wav' -> sip.wav
- 'assets/raw/Miscellaneous/potterySmash.wav' -> smash.wav

LOOM.TS (the string hook).
- In the chest dialog, add `let called = false`. Set it to true where secretPokes === 1 shows the 'ears just perked up' toast.
- In openDialog's onClose, next to off(): if (called) currentGame?.emit('string').
- Import currentGame from ../engine/game.

No worker or shared changes: item.artifact.blurry-photo already passes ITEM_KEY_PATTERN.

DEBUG: the Sound box's hold-to-test, plus the A flags (?bigfoot, ?gullfish, ?coffee, ?string) exercise every new sound.

### Build split

- **Group A:** TODO ONLY. You asked to skip build/integrate, so this is the to-do list, not a build order. CANVAS WORLD.

Owns:
- src/client/entities/** and src/client/world/**:
  - NEW: critter-bigfoot.ts, snickers-coffee.ts, (optional) snickers-string.ts
  - EDITED: critters.ts, critter-fox.ts, critter-trench.ts, critter-flyers.ts, critter-ambient.ts, critter-lore-art.ts, sheep.ts, snickers.ts
- NEW src/client/public/sprites/bigfoot.png (a copy of the raw Bigfoot sheet, cropped to 256x96).

Imports but never edits:
- net.ts (api.collectItem, store)
- ui/dom.ts (toast, isDialogOpen)
- world/world-pixels.ts (hash2)
- shared/calendar.ts (dayKey)

Contracts with B:
- Calls sfx('camera'), sfx('slap'), sfx('sip'), sfx('smash'), which B adds to audio.ts. B's audio change must land first or in the same commit, because Sfx is a TypeScript union.
- Writes localStorage farm.bigfoot.lastSeen (ms) and emits g.emit('bigfoot').
- Listens for g.on('string').
- Registers sprite keys for B: item.artifact.blurry-photo, critter.bigfoot.icon, critter.bigfoot.print.

Debug flags (params.has, the critter-util convention): ?bigfoot ?footprints ?coffee ?string ?gullfish(=salmon) ?wineraccoons ?monarch ?missionblue ?cheer.
- **Group B:** TODO ONLY (you asked to skip build/integrate). LETTERS, COPY, CHEST, AUDIO, TITLE PAGE.

Owns:
- src/client/audio.ts:
  - new Sfx names camera, slap, sip, smash, ding (FILES, FILE_GAIN, SYNTHS fallbacks, PRELOAD_LATER, MIN_GAP)
- NEW src/client/public/sounds/camera.wav, slap.wav, sip.wav, smash.wav (converted from assets/raw)
- src/client/ui/mailbox.ts: Otto's Bigfoot letters, the Trench Coat letters, the new MILO sign
- src/client/ui/loom.ts: the ITEM_NOTES blurry-photo note, and emitting 'string' when the chest closes
- src/client/ui/hud.ts: the J TRIVIA line and ?tv=muni
- src/client/ui/password.ts, password-art.ts, password.css: the J-Church title cameo and ?muni

Contracts with A:
- reads localStorage farm.bigfoot.lastSeen
- listens for currentGame.on('bigfoot') and ('trenchcoat')
- uses A's sprite keys critter.bigfoot.print and critter.trenchcoat.icon (existing)

No changes to src/worker or src/shared.

Debug flags: ?bigfootletter ?tv=muni ?muni (and the existing ?trenchcoat=...).

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
- A sheep waiting at the gate for the J: touches sheep AI and the gate path; the J is covered by copy and the title cameo.
- Raccoon in the trash can: needs Pelican Town tileset cutting, its loot includes Joja Cola, and the raccoons already get the wine scene.
- Steller's jay raiding the dish: overlaps the gull-fish Snickers moment; maybe later.
- Pet gifts by the dish, raccoon Mystery Boxes, crow shinies, rare rhubarb/garlic forage: more chest economy than critter moments.
- Help Wanted board: a UI feature that needs shared server state.
- Lucky Purple Shorts / Muni-transfer artifacts: the shorts are a Stardew-mayor joke riding close to the no-characters rule, and the J is already covered.
- Hat blowing off on windy days: medium (hat anchors plus tumbling); post-ship.
- Fairy ring after the rains: good fall forage, but it's forage-system work rather than a critter moment; post-ship.
- Year of the Sheep party (Feb 6 2027), the giant pumpkin, April Fools flamingos, the wilted bouquet, the golden pumpkin, the anniversary cake, the stone owl: nice seasonal props, but the dates are far off or it's a new prop system; batch them later as data rows (the winter snowman already exists).
- The Pond Legend / jumping-fish splash: only matters on farms that bought a pond; low reach for ship.

## Stardew art worth pulling (The Spriters Resource, PC / Stardew Valley)

- 'PC _ Computer - Stardew Valley - Animals - Duck' (the farm duck sheet): Stow Lake ducks paddling across a placed pond, with a duckling line following. The raw Miscellaneous/Duck.wav is already downloaded.
- 'PC _ Computer - Stardew Valley - Animals - Chickens' (white/brown chicken sheet): a neighbor's hen wandering into the yard and getting stared down by Snickers, plus a quiet sunrise crow from the raw Characters/rooster.wav.
- 'PC _ Computer - Stardew Valley - Tilesets - Calico Desert' (less sure of the exact title): real desert scenery (cacti, sand, the bus-stop sign) for KitKat's Arizona postcards, in place of the cream card.
