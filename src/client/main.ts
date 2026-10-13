import "./style.css";
import { registerCoreArt } from "./art/core";
import "./art/regions";
import { unlockAudio } from "./audio";
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
  // Expose for poking around in devtools: __farm.tool, __farm.env, ...
  (window as unknown as { __farm: Game }).__farm = g;

  // World first (ground, barn, fence), then everything that lives on it.
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
  initHelp();

  // Art modules may have registered UI frames, so build the CSS skin after init.
  applySkin();

  g.start();
  document.getElementById("boot")?.classList.add("is-done");
  addEventListener("pointerdown", () => unlockAudio(), { once: true, capture: true });
  addEventListener("keydown", () => unlockAudio(), { once: true, capture: true });

  if (!(await api.me())) await showPasswordGate();

  initHud(g);
  initToolbar(g);

  await api.state();
  connectLive();

  const refreshWeather = () =>
    api
      .weather()
      .then((w) => g.setWeather(w.kind))
      .catch(() => {});
  void refreshWeather();
  setInterval(refreshWeather, WEATHER_REFRESH_MS);

  // Logged out somewhere along the way (password changed?): ask again, then resync.
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
}

boot().catch((err) => {
  console.error(err);
  const bootEl = document.getElementById("boot");
  if (bootEl) bootEl.textContent = "The sheep got loose! Try reloading.";
});
