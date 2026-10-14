import "./style.css";
import { registerCoreArt } from "./art/core";
import "./art/regions";
import { Game } from "./engine/game";
import { loadSprites } from "./engine/sprites";
import { initCritters } from "./entities/critters";
import { initEasterEggs } from "./entities/eastereggs";
import { initSheep } from "./entities/sheep";
import { api, connectLive, store } from "./net";
import { initAnimal } from "./ui/animal";
import { initBarn } from "./ui/barn";
import { initCalendar } from "./ui/calendar";
import { closeAllDialogs } from "./ui/dom";
import { initFarmSign } from "./ui/farmsign";
import { initFlock } from "./ui/flock";
import { initHelp } from "./ui/help";
import { initHud } from "./ui/hud";
import { initLoom } from "./ui/loom";
import { initMailbox } from "./ui/mailbox";
import { initMarnie } from "./ui/marnie";
import { showPasswordGate } from "./ui/password";
import { initShear } from "./ui/shear";
import { initShop } from "./ui/shop";
import { applySkin } from "./ui/skin";
import { initToolbar } from "./ui/toolbar";
import { initSky } from "./world/sky";
import { initWorld } from "./world/world";

const WEATHER_REFRESH_MS = 15 * 60 * 1000;

async function boot(): Promise<void> {
  registerCoreArt();
  await loadSprites();

  const canvas = document.getElementById("farm") as HTMLCanvasElement;
  const g = new Game(canvas);

  // The page color around the farm (and the phone's status bar) follows the season's grass.
  const SEASON_BG = { spring: "#64a33f", summer: "#4c8c2e", fall: "#cf8f3e", winter: "#d9e6ee" } as const;
  let bgSeason = "";
  const applySeasonBg = () => {
    const season = g.env.season;
    if (season === bgSeason) return;
    bgSeason = season;
    const color = SEASON_BG[season] ?? SEASON_BG.spring;
    document.documentElement.style.setProperty("--season-bg", color);
    g.clearColor = color;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
  };
  applySeasonBg();
  g.on("tick", applySeasonBg);
  // Expose for poking around in devtools: __farm.tool, __farm.env, ...
  (window as unknown as { __farm: Game }).__farm = g;

  // The HUD and toolbar go up first: the toolbar settles its real height (and the farm's layout with
  // it) before anything is built, so nothing moves when the loading or title screen fades off.
  initHud(g);
  initToolbar(g);

  // Then the world (ground, barn, fence), then everything that lives on it.
  initWorld(g);
  initSky(g);
  initSheep(g);
  initCritters(g);
  initEasterEggs(g);

  // Menus register themselves with openMenu().
  initMarnie();
  initAnimal();
  initShear();
  initCalendar();
  initBarn();
  initLoom();
  initShop();
  initMailbox();
  initFarmSign();
  initFlock();
  initHelp();

  // Art modules may have registered UI frames, so build the CSS skin after init.
  applySkin();

  g.start();
  // Audio unlocks itself on the first tap/click/key (audio.ts listens for the events iOS accepts).

  // A failed first load (patchy signal, a server hiccup) mustn't strand an empty farm: connect
  // anyway. The socket sends the whole farm when it opens, and its retries and the poll keep
  // trying until it does.
  let firstLoad: Promise<unknown> | null = null;
  const loadFarm = () => (firstLoad ??= api.state().catch((err) => console.warn("First farm load failed; retrying live", err)));

  // Logged out: the title screen goes up (instantly) under the loading screen before that fades, so
  // the farm never peeks out first. The flock loads the moment the answer's right, so the sheep are
  // already out when it fades.
  const gate = (await api.me()) ? null : showPasswordGate({ instant: true, onWelcome: () => void loadFarm() });
  document.getElementById("boot")?.classList.add("is-done");
  if (gate) await gate;
  g.show();

  // Logged out somewhere along the way (password changed?): ask again, then resync.
  // Registered before the first state load (on a reload; after a login it's already on its way) so
  // a 401 there brings the gate up too.
  let gateOpen = false;
  store.unauthorized.on(async () => {
    if (gateOpen) return;
    gateOpen = true;
    closeAllDialogs();
    await showPasswordGate();
    gateOpen = false;
    await api.state().catch(() => {});
    connectLive();
  });

  await loadFarm();
  connectLive();

  const refreshWeather = () =>
    api
      .weather()
      .then((w) => g.setWeather(w.kind))
      .catch(() => {});
  void refreshWeather();
  setInterval(refreshWeather, WEATHER_REFRESH_MS);
}

boot().catch((err) => {
  console.error(err);
  const bootEl = document.getElementById("boot");
  if (bootEl) {
    // g.start() may already have faded the boot screen out; bring it back so the message shows.
    bootEl.classList.remove("is-done");
    bootEl.textContent = "The sheep got loose! Try reloading.";
  }
});
