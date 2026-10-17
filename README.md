# 🐑 Papa Snickers's Sheep Farm

A tiny private Stardew Valley–style farm that doubles as our shared todo list.
Every plan (dates, workshops, trips...) is a sheep. When you do the plan you shear the sheep, and
then it moves into the barn as a memory.

Lives at **https://keatonelvins.com/sheep** (password-gated, remembered for 400 days).

## How it plays

| Stardew | Todo list |
| --- | --- |
| Buy a sheep at the ranch (+) | Add a plan (the sheep's name *is* the plan) |
| Pet a sheep (once a day per device) | Show you're excited, hearts = excitement |
| Shear it ✂ | Mark it done (+ write a little memory) |
| Sheared sheep rests 3 days, then moves into the barn | Done plans become browsable memories |
| Wool → Loom → Cloth → the carpenter's shop | Rewards: decorate the farm |
| Hats from any sheep's card | Spend cloth on a plan you love |
| Forage (pick it up, shake the ginkgos, dig where the worms wiggle, let Snickers knock the coffee over) → bundles | More cloth, and a Community Center board to fill |
| Billboard calendar, mailbox | Dated plans, "what happened while you were away" |

Real local time drives day and night, the real season drives the farm's look, and the real
weather where you are makes it rain or snow on the farm. Changes sync live between both phones.

## Writing copy

The farm talks like Keaton writes (keatonelvins.com/me): the deadpan statement of an obvious thing
in an unexpected way, the way a kid would explain it.

- "A level has a little bubble in it that wants to be in the middle."
- "Loafing is when you sit down and then keep sitting down for an hour."
- "[sheep] has grass stains and is a slightly greener sheep now."

No ad-copy one-liners ("Scarecrows are a classic. Gnomes are a lifestyle."), no fun facts with a wink,
and no one-word punchline at the end ("Legends.", "Worth it."). Inside jokes ("Mow.", karaoke, the
ORIGINAL PLAN) stay as they are. The full rules are under *Copy rules* in `docs/SPEC.md`.

## Stack

- **Frontend:** Vite + TypeScript, a pixel-perfect canvas world plus DOM menus (`src/client`)
- **Backend:** one Cloudflare Worker (`src/worker`), with a single SQLite-backed Durable Object
  (`Farm`) holding all the data and broadcasting changes over WebSockets
- **Shared types:** `src/shared`

The app is served under `/sheep/`, and Vite builds into `dist/client/sheep/` so asset paths
match the URL. Worker routes `keatonelvins.com/sheep*` run in front of the main site's
Worker, so the main site is untouched.

## Develop

```bash
npm install
```

```bash
npm run preview          # build + wrangler dev → http://localhost:8787/sheep/
```

For hot reload, run `npm run dev:worker` in one terminal and `npm run dev` in another
(http://localhost:5173/sheep/, which proxies the API to the worker).

Local secrets live in `.dev.vars` (gitignored): `FARM_PASSWORD` and `COOKIE_SECRET`.

Handy URL params for testing: `?time=21:30`, `?date=2026-12-24`, `?season=winter`,
`?weather=rain|snow|storm|fog|windy|cloudy`, `?speed=600` (fast-forward the clock).

## Deploy

```bash
npm run deploy
```

Secrets in production: `wrangler secret put FARM_PASSWORD` / `wrangler secret put COOKIE_SECRET`.
Changing either one logs every device out.

## Adding more Stardew art & sounds

- Sprites go in `src/client/public/sprites/`. Each sheet is registered in `SHEETS`, and named
  rectangles in `REGIONS` (`src/client/engine/sprites.ts` and the modules that use them).
  Anything without a real sprite falls back to hand-drawn art under the same key, so
  sheets can be added one at a time.
- Sounds live in `src/client/public/sounds/` (short effects as small WAVs, longer ones and the
  ambience loops in `ambience/` as AAC `.m4a`). Each recording is listed in `FILES` in
  `src/client/audio.ts`. Anything without a recording (the pet sound, Snickers' licks) is
  synthesized.
- Music lives in `src/client/public/sounds/music/` as `title.m4a`, `spring.m4a`, `summer.m4a`,
  `fall.m4a` and `winter.m4a`. Convert a download with
  `afconvert -f m4af -d aac -b 96000 in.mp3 out.m4a`. A missing track just means silence.
- Raw downloads (from The Spriters Resource) are kept in `assets/raw/` for reference.

Stardew Valley art and sound © ConcernedApe. This is a private, non-commercial fan project.
