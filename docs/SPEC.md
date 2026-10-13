# Papa Snickers's Sheep Farm: spec

This is the living spec the build agents worked from. It's cleaned up from the brief inside the
workflow script and updated with every decision made since. **Updates** marks changes made after
the first build started; those land in the integration pass.

## The idea

A tiny, private Stardew Valley–style farm that's secretly a shared todo list for two.
**Every plan is a sheep.** Finishing a plan = **shearing** the sheep.
One shared farm with no identities, so copy talks to "you two" or "the farmers". Super cute,
silly, and full of Stardew details she'll recognize. **Mobile is the first-class experience**,
and desktop works great too.

## Core loop

| In the game | In real life |
| --- | --- |
| Buy a sheep at the ranch (the **+** in the toolbar) | Add a plan. The sheep's name *is* the plan. Category, optional date, notes, link. |
| Sheep wander the fenced pasture, graze, nap, sleep at night | Your open plans, always visible |
| Tap a sheep → pet it (once a day per device = half a heart, max 5 hearts) | "I'm excited about this one." Hearts = excitement |
| Tap again / info card | Details: hearts, mood line, date, notes, link |
| Shears tool + tap (or "Shear" on the card) | "We did it!" Snip animation, wool pops into the chest, optional memory note |
| Sheared sheep rests in the pasture 3 days, then walks into the barn | The other person sees it was done, and it then becomes a memory |
| Barn | Browsable memories of everything you've done |
| 4 wool → Loom (168 s, i.e. 4 in-game hours) → 1 cloth | Reward currency |
| Cloth → carpenter's shop decorations, placed by tapping the pasture | Decorate the farm together |
| Billboard calendar | Dated plans by month |
| Mailbox letters | What happened while you were away |
| Farm sign | Rename the farm (default "Papa Snickers's Sheep Farm") |

## The world

- **Real time:** a Stardew clock ticking in 10-minute steps and the date box ("Mon. 12"). Day and night follow
  local time, with dusk earlier in winter.
- **Real seasons:** Mar–May spring, Jun–Aug summer, Sep–Nov fall, Dec–Feb winter. Real seasonal
  tilesets for ground, trees and grass.
- **Real San Francisco weather** (Open-Meteo, pinned to SF): rain, storms, snow, fog,
  wind and cloud shadows on the farm. Fireflies on summer nights, petals in spring, leaves in fall.
- **Live sync:** when one of you shears a sheep, the other sees it happen.

## Critters & secrets

- **Otto (the fox) and Milo (the hedgehog)** live in the bottom-right corner. They're best friends who nuzzle, sleep curled
  up together at night, and wear seasonal accessories (scarves and hats in winter). Tapping them gets
  reactions, and sometimes a little line.
- **Snickers** 🐈 is her real cat, a grey Himalayan: a cream cloud of a cat with a dark grey face, paws and a smoky
  plume of a tail, plus a tiny pink tongue that's *always* sticking out. He wanders the yard by the barn, loafs, grooms,
  and naps on the barn doorstep. Tap his head to pet him. Scratch **the spot on his butt** and he licks the air
  uncontrollably (rapid tongue flicks, little "mlem"s, more frantic the more you scratch). The first time:
  *"You found his lick button."*
- **Birds:** sparrows, blue jays, cardinals, crows and woodpeckers. They hop, peck, perch on the fence and
  scatter as a flock when tapped. Crows never land if there's a scarecrow (the Stardew joke).
- **Bugs:** butterflies, **ladybugs** (tap: "lucky day!", with a rare golden one), **bumblebees** bumbling
  between flowers (a swarm around a bee house). Frogs come out in the rain. Bunnies and squirrels at the edges.
  Bugs follow the season and hide at night and in rain.
- **Secrets:**
  - type "baaaaah" (or the Konami code) and every sheep throws a party
  - a Stardrop every 10 wool
  - "You're exhausted..." after 2 AM
  - a rare shooting star at night
  - seasonal touches: a jack-o'-lantern on Oct 31, a gift on Winter Star, a bouquet on Feb 14
  - a raccoon peeks out of a stump, very rarely

## Updates since the first build

- **No characters or avatars:** no portraits, no speaker nameplates, no character-voiced
  dialogue. Places can keep their names (the ranch, the carpenter's shop). Letters come from the
  animals (see Copy rules). The witch easter egg becomes a shooting star.
- **No dice / random-idea button** when adding a sheep.
- **No Junimos.** More birds, ladybugs and bumblebees instead.
- **Real Stardew sounds:** effects plus ambience loops (seasonal days, crickets at night, rain, wind, campfire
  crackle), and real animal voices: the Stardew sheep (a goat bleat for lambs), bird tweets, seagulls, a bunny,
  a slug squelch for the banana slug, and a small bark pitched up for Otto. Snickers' voice is a random mix:
  "mow" (cut from a Stardew meow, ~60%), a real meow (~32%) and a funny meow (~8%). Only the pet and lick
  sounds are synthesized. Dialogs open and close quietly (no sound).
- **Sound is on by default and plays even with the iPhone's silent switch on.** One obvious off switch:
  the speaker button by the clock (ON / OFF, remembered per device). Before the first tap it shows
  "Tap for sound" (browsers only allow audio after one).
- **Music:** the real soundtrack, quiet and looped with slow fades. The Overture on the title page, then
  the season's song on the farm (`public/sounds/music/{title,spring,summer,fall,winter}.m4a`; a missing
  track just means no music). Like the game, the farm goes quiet at night and in the rain. Music On/Off
  lives in the toolbar's … menu.
- **Title page:** "Hold it! How would you describe Snickers's beautiful eyes?" (the answer is the
  password). A plain text field with nothing that iOS reads as a password or contact field, so no
  AutoFill. Snickers sits on the logo. The backdrop is Alamo Square: the Painted Ladies built from Pelican Town's
  houses (recolored to pastels, seasonal roofs), the park lawn with Stardew trees, a lamppost and bench, a couple of
  grazing sheep, and a faint downtown skyline; lit windows and lamps at night. One small sheet per season.
- **Calendar:** Stardew festivals only where something happens on the farm (Spirit's Eve, the Feast of the
  Winter Star...). The rest of the board is real holidays and Bay Area events.
- **Page background** follows the season's grass color (and tints the phone's status bar). No scrollbars.
- **Real sprite sheets** replace hand-drawn stand-ins wherever they exist: emotes, craftables (loom, chest,
  scarecrows, rarecrows, lampposts...), tools (shears), objects (wool, cloth, stardrop, forage),
  seasonal tilesets, clock box, billboard, mail paper, title-screen sky and clouds, critters, hats,
  lambs. (The fence is the log fence from the outdoor tilesets; the fonts are Pixelify Sans with its 2,
  3, 5 and capital Z redrawn on its own pixel grid so they can't be misread; Snickers is hand-drawn.)
- **Lambs:** a newly bought sheep arrives as a lamb (baby sheep sprite) and grows up after a day.
- **Snickers** replaces the generic farm cat (see Critters). He's on the title page too, and his
  favorite toy (a secret item in the chest) is a piece of string.
- **Add-sheep form:** no date until one is set (with a ✕ to clear it); the name placeholder is
  "Eat pizza in <a random SF park>".
- **Animal hats** 🎩: cloth can buy a hat for a sheep.
- **Mobile-first pass:**
  - a "Flock" list to find any sheep fast
  - dialogs that stay above the phone keyboard
  - notch and home-bar safe areas
  - haptics on pet and shear (Android)
  - add-to-home-screen app icon

## Copy rules

- **Minimal text.** Only write words when they're a reference, a joke, an easter egg, or a genuinely
  necessary interface explainer. Prefer icons, short labels and one-line empty states.
- **No characters:** no villager portraits, names or voices. The only "people" who talk are animals:
  Snickers, Otto, Milo and the sheep themselves.
- **Mailbox letters** are written by Snickers, Otto, or the sheep themselves (signed with the sheep's
  name). No letters "from the flock" or "from the farm".

## More easter eggs

- **ORIGINAL PLAN:** every sheep remembers its original name. Rename a plan and later change it back,
  and a big red rubber stamp slams onto the screen: **ORIGINAL PLAN**. The sheep gets a stamp badge, the
  card offers "Go back to the ORIGINAL PLAN?" once a plan has changed, and the sheep writes a letter
  about it. No counts anywhere. (They always change plans, then stick to the original.)
- **The Bumblesteed:** a ladybug knight riding a bumblebee. A rare sighting drifts across the pasture,
  and Otto sometimes writes in about spotting one.

## Lore (personal references; use with restraint, as winks)

- **San Francisco:** parks, bakeries (Tartine, Arsicault...), coffee (Blue Bottle, Sightglass, Ritual, Philz),
  hikes (Muir Woods, Mt. Tam, Point Reyes...), Karl the Fog, Muni & BART, the wild parrots of Telegraph Hill,
  banana slugs, a light Mayor Daniel Lurie mention, Bay to Breakers, Outside Lands, Fleet Week, Hardly Strictly
  Bluegrass. Never San Jose.
- **Washington roots:** Sumner (Rhubarb Pie Capital of the World) and Bonney Lake. Lavender. Coffee.
- **Snickers:** says "Mow", loves string, Fancy Feast and Whisker Lickins, would eat salmon for every meal; his
  brother **KitKat** lives in Arizona (sends the occasional postcard).
- **Things she loves:** 1 hour of loafing, 3 hours in the black hole, salmon sashimi (also the ranch's joke
  prices, never "hugs"), garlic ice cream (vampire-proof), Tilden Little Farm (our sheep's celery-eating
  cousins), ginkgo trees (a golden ginkgo on the farm in fall), Christopher Alexander, dolphins.
- **Couple jokes:** he's secretly a hundred raccoons / a hundred hedgehogs / ten thousand mosquitoes in a trench
  coat (the Trench Coat easter egg); she goes to sketching meetups all the time; nobody wants to go to karaoke;
  Wine Wednesday; sometimes Thursday is THURSDAY!!!!!; they always end up on the ORIGINAL PLAN.
- **ORIGINAL PLAN** covers the plan's name and its date (moving the date away and back counts too).
- **Chest & bundles:** forage, tree seeds and dug-up artifacts go into the shared chest; Community Center–style
  bundles (seasonal foraging, tree seeds, treasure) trade one of each item for cloth.
- **Economy (short sessions):** the loom takes 4 wool; 10% of sheep are golden (2 wool).

## Mobile & accessibility rules

- Designed for 360–430 px portrait first; desktop landscape gets its own layout.
- Touch targets ≥ 40 CSS px, inputs ≥ 16 px (no iOS zoom), real `<button>`s, dialogs scroll inside.
- Pixel-perfect rendering: integer device-pixel scale, chosen so the short side shows ~240 game px.
- `prefers-reduced-motion` cuts heavy particles.

## Architecture

- **Frontend** (`src/client`): Vite + TypeScript, no framework. A canvas world (y-sorted entities,
  render passes, lights) plus a DOM overlay for the HUD, toolbar and menus.
  - `engine/`: game loop, sprite registry, pixel-art helpers
  - `world/`: layout, ground, fence, barn, objects, decorations, sky, weather
  - `entities/`: sheep, emotes, critters, easter eggs
  - `ui/`: dialog system plus every menu, HUD, toolbar, password gate
  - `audio.ts`: real sound files and music, with WebAudio synth fallbacks
- **Sprites:** one key per sprite (e.g. `item.wool`). A real sheet region wins when its sheet
  loads, otherwise the hand-drawn fallback under the same key is used.
- **Backend** (`src/worker`): one Cloudflare Worker. A password cookie gate (HMAC-signed,
  400 days), a JSON API, and a single SQLite-backed Durable Object `Farm` that stores everything and
  broadcasts changes over WebSockets. Weather proxy.
- **Hosting:** Worker routes `keatonelvins.com/sheep*` (and `www.`) run in front of the main
  site's Worker, so the main site is untouched.

## Art direction

Warm, saturated Stardew palette. Dark-but-never-black outlines, 2–3 shades per material, light
from the top-left, soft lavender ground shadows. Everything at native pixel size on integer positions.
