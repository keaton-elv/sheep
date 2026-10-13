# 🐑 Baaaah Farm

A tiny private Stardew Valley–style farm that doubles as our shared todo list.
Every plan (dates, workshops, trips...) is a sheep. Did the thing? Shear the sheep.

Lives at **https://keatonelvins.com/sheep** (password-gated, remembered for 400 days).

## How it plays

| Stardew | Todo list |
| --- | --- |
| Buy a sheep at the ranch (+) | Add a plan (the sheep's name *is* the plan) |
| Pet a sheep (once a day per device) | Show you're excited, hearts = excitement |
| Shear it ✂ | Mark it done (+ write a little memory) |
| Sheared sheep rests 3 days, then moves into the barn | Done plans become browsable memories |
| Wool → Loom → Cloth → the carpenter's shop | Rewards: decorate the farm |
| Billboard calendar, mailbox | Dated plans, "what happened while you were away" |

Real local time drives day and night, the real season drives the farm's look, and the real
weather where you are makes it rain or snow on the farm. Changes sync live between both phones.

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
  `src/client/audio.ts`. Anything without a recording (baa, meow, the fox's yip, Snickers' licks) is
  synthesized.
- Raw downloads (from The Spriters Resource) are kept in `assets/raw/` for reference.

Stardew Valley art and sound © ConcernedApe. This is a private, non-commercial fan project.
