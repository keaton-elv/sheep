// "Hold it!" A Stardew-style title screen over the (already running) farm, built from the game's
// real title pieces (sky, the big cloud bank, drifting clouds, corner bushes, birds), with a
// dialogue box asking for the password. Remembered afterwards by the server's cookie.
//
// The password box is deliberately a plain text field outside any <form> (no type="password", no
// "pass" in its name or id, password-manager opt-outs), so phones and password managers never
// offer to save it: it's a riddle for sheep fans, not an account.

import { sfx } from "../audio";
import { size as spriteSize, spriteUrl } from "../engine/sprites";
import { api } from "../net";
import { el, frameIcon, spriteIcon, uiRoot } from "./dom";
import { LOGO, registerPasswordArt, TITLE_ART, TITLE_BIRD, TITLE_SHEETS, type Rect } from "./password-art";
import "./password.css";

const GREETING = "Hold it! Only true sheep fans behind this gate. What's the password?";

// Wrong answers get a little reaction from the farm. (No hints, ever.)
const TEASES = [
  "Baa...? That's not it.",
  "The sheep stare at you suspiciously...",
  "Nope! Even Milo knows that one. He's a hedgehog.",
  "A crow caws. Judgmentally.",
  "Ba-nope.",
  "Otto yips. That's fox for \"nice try\".",
  "The gate doesn't budge. A sheep chews thoughtfully...",
  "Snickers opens one eye. Mlem. Back to sleep...",
  "A ladybug lands on the gate, looks at you, and leaves...",
  "Close! (It wasn't close.)",
];

const BASE = import.meta.env.BASE_URL;

type Phase = "dawn" | "day" | "dusk" | "night";
/** Which corner-bush variant goes with the sky: green by day, red at sunset, blue at night. */
const BUSH_VARIANT: Record<Phase, number> = { dawn: 0, day: 0, dusk: 1, night: 2 };

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = BASE + src;
  });
}

/**
 * Where the sheep stands on the logo: drop its 32x32 frame straight down onto the lettering
 * (column by column, like a falling block) and pick the right-hand spot where it sits lowest and
 * flattest. Returns the frame's left edge (x) and the logo row its bottom edge lands on (y).
 */
function sheepPerch(frame: HTMLCanvasElement): { x: number; y: number } {
  const fallback = { x: Math.max(0, LOGO.w - 34), y: 2 };
  try {
    const px = frame.getContext("2d")?.getImageData(0, 0, 32, 32).data;
    if (!px || !LOGO.w) return fallback;
    const bottom: number[] = [];
    for (let x = 0; x < 32; x++) {
      let b = -1;
      for (let y = 31; y >= 0; y--) {
        if (px[(y * 32 + x) * 4 + 3]! > 0) {
          b = y;
          break;
        }
      }
      bottom.push(b);
    }
    if (bottom.every((b) => b < 0)) return fallback;
    const top = (x: number) => (x >= 0 && x < LOGO.w ? LOGO.tops[x]! : LOGO.h);
    const spots: { x: number; y: number; air: number }[] = [];
    for (let fx = Math.floor(LOGO.w / 2); fx <= LOGO.w - 28; fx++) {
      let fy = LOGO.h;
      for (let x = 0; x < 32; x++) if (bottom[x]! >= 0) fy = Math.min(fy, top(fx + x) + 31 - bottom[x]!);
      let air = 0;
      for (let x = 0; x < 32; x++) {
        const t = top(fx + x);
        if (bottom[x]! >= 0 && t < LOGO.h) air += t - (fy - 32 + bottom[x]! + 1);
      }
      spots.push({ x: fx, y: fy, air });
    }
    if (!spots.length) return fallback;
    const lowest = Math.max(...spots.map((s) => s.y));
    const level = spots.filter((s) => s.y === lowest);
    const flattest = Math.min(...level.map((s) => s.air));
    const pick = level.filter((s) => s.air <= flattest + 3).pop()!;
    return { x: pick.x, y: pick.y };
  } catch {
    return fallback;
  }
}

/** A div showing one rect of a sheet as a CSS background, sized in --cp units (crisp pixels). */
function cropEl(cls: string, sheet: { src: string; w: number; h: number }, r: Rect): HTMLElement {
  const d = el("div", { class: cls });
  const cp = (n: number) => `calc(var(--cp) * ${n})`;
  d.style.width = cp(r.w);
  d.style.height = cp(r.h);
  d.style.backgroundImage = `url("${BASE}${sheet.src}")`;
  d.style.backgroundSize = `${cp(sheet.w)} ${cp(sheet.h)}`;
  d.style.backgroundPosition = `${cp(-r.x)} ${cp(-r.y)}`;
  return d;
}

let lastTease = -1;

function phase(): Phase {
  // Match the farm underneath, including the ?time=HH:MM debug override.
  const forced = /^(\d{1,2}):\d{2}$/.exec(new URLSearchParams(location.search).get("time") ?? "");
  const h = forced ? Number(forced[1]) : new Date().getHours();
  if (h >= 21 || h < 5) return "night";
  if (h < 7) return "dawn";
  if (h >= 18) return "dusk";
  return "day";
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Show the password gate; resolves once the right word has been entered. */
export function showPasswordGate(): Promise<void> {
  registerPasswordArt();
  return new Promise<void>((resolve) => {
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    // ---------- sky ----------

    const ph = phase();
    const sky = el("div", { class: "pw-sky", "aria-hidden": "true" });
    const stars = el("div", { class: "pw-stars" });
    for (let i = 0; i < 46; i++) {
      const s = el("span", { class: "pw-star" });
      s.style.left = `${(i * 37.7) % 100}%`;
      s.style.top = `${((i * 53.3) % 60) + (i % 3)}%`;
      s.style.animationDelay = `${(i % 7) * 0.45}s`;
      if (i % 5 === 0) s.classList.add("is-big");
      stars.appendChild(s);
    }
    sky.appendChild(stars);

    /** A cloud drifting across at `top` % of the screen. Negative delays spread them out. */
    const drift = (node: HTMLElement, top: number, dur: number, start: number) => {
      node.classList.add("pw-cloud");
      node.style.top = `${top}%`;
      node.style.animationDuration = `${dur}s`;
      node.style.animationDelay = `${-dur * start}s`;
      sky.appendChild(node);
    };

    // The hand-drawn sky, used only if the real title sheets can't be loaded.
    const fallbackClouds = () => {
      const clouds: [string, number, number, number][] = [
        // [key, top %, duration s, start %]
        ["ui.title.cloud.2", 8, 150, 0.15],
        ["ui.title.cloud.1", 22, 120, 0.62],
        ["ui.title.cloud.3", 4, 95, 0.4],
        ["ui.title.cloud.1", 38, 170, 0.9],
        ["ui.title.cloud.3", 30, 110, 0.05],
      ];
      for (const [key, top, dur, start] of clouds) {
        const img = el("img", { src: spriteUrl(key), alt: "", draggable: "false" });
        const dim = spriteSize(key) ?? { w: 40, h: 16 };
        img.style.width = `calc(var(--cp) * ${dim.w})`;
        img.style.height = `calc(var(--cp) * ${dim.h})`;
        drift(img, top, dur, start);
      }
    };
    const fallbackBirds = () => {
      for (let i = 0; i < 2; i++) {
        const bird = el("div", { class: "pw-bird is-drawn" });
        bird.style.backgroundImage = `url("${spriteUrl("ui.title.bird")}")`;
        bird.style.top = `${14 + i * 7}%`;
        bird.style.animationDelay = `0s, ${-i * 3 - 4}s`;
        sky.appendChild(bird);
      }
    };

    // The real title screen: the cloud bank is drawn on a canvas (copies side by side, every
    // other one mirrored, so it reaches across any screen and can scroll slowly forever).
    const bank = document.createElement("canvas");
    bank.className = "pw-bank";
    let cloudsImg: HTMLImageElement | null = null;
    const BANK_STEP = 400; // art px between copies (they overlap a little, puff into puff)
    const buildBank = () => {
      if (!cloudsImg) return;
      const cpCss = parseFloat(gate.style.getPropertyValue("--cp")) || 1;
      const { bank: b } = TITLE_ART;
      // Screen width in art px, plus one full mirrored pair so the scroll can loop seamlessly.
      // (The canvas starts 120 art px left of the screen; see .pw-bank.)
      const need = Math.ceil(window.innerWidth / cpCss) + 120 + BANK_STEP * 2 + b.w;
      const copies = Math.ceil(need / BANK_STEP) + 1;
      const w = (copies - 1) * BANK_STEP + b.w;
      if (bank.width !== w) {
        bank.width = w;
        bank.height = b.h;
      }
      const c = bank.getContext("2d");
      if (!c) return;
      c.clearRect(0, 0, bank.width, bank.height);
      c.imageSmoothingEnabled = false;
      for (let i = 0; i < copies; i++) {
        const x = i * BANK_STEP;
        if (i % 2) {
          c.save();
          c.translate(x + b.w, 0);
          c.scale(-1, 1);
          c.drawImage(cloudsImg, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
          c.restore();
        } else {
          c.drawImage(cloudsImg, b.x, b.y, b.w, b.h, x, 0, b.w, b.h);
        }
      }
      bank.style.width = `calc(var(--cp) * ${w})`;
      bank.style.height = `calc(var(--cp) * ${b.h})`;
      bank.style.setProperty("--bank-loop", `calc(var(--cp) * ${-BANK_STEP * 2})`);
    };

    void loadImage(TITLE_SHEETS.clouds.src).then((img) => {
      if (closed) return;
      if (!img) {
        fallbackClouds();
        return;
      }
      cloudsImg = img;
      const sheet = TITLE_SHEETS.clouds;
      // Far-away clouds first, then the bank, then the bright clouds in front of it.
      TITLE_ART.faint.forEach((r, i) => drift(cropEl("pw-faint", sheet, r), [10, 26, 4][i]!, [260, 210, 300][i]!, [0.3, 0.75, 0.05][i]!));
      buildBank();
      sky.appendChild(bank);
      TITLE_ART.clouds.forEach((r, i) => drift(cropEl("pw-puff", sheet, r), [6, 30, 18][i]!, [140, 105, 175][i]!, [0.55, 0.15, 0.85][i]!));
      const v = BUSH_VARIANT[ph];
      sky.appendChild(cropEl("pw-bush is-left", sheet, TITLE_ART.bushLeft[v]!));
      sky.appendChild(cropEl("pw-bush is-right", sheet, TITLE_ART.bushRight[v]!));
      sky.classList.add("is-real");
    });
    void loadImage(TITLE_SHEETS.title.src).then((img) => {
      if (closed) return;
      if (!img) {
        fallbackBirds();
        return;
      }
      const flock: [number, number][] = [
        [13, 0],
        [19, -7.5],
        [16, -3.4],
      ];
      for (const [top, delay] of flock) {
        const bird = cropEl("pw-bird", TITLE_SHEETS.title, { x: TITLE_BIRD.x, y: TITLE_BIRD.y, w: TITLE_BIRD.w, h: TITLE_BIRD.h });
        bird.style.top = `${top}%`;
        bird.style.animationDelay = `${(delay * 0.13).toFixed(2)}s, ${delay}s`;
        sky.appendChild(bird);
      }
    });

    // ---------- logo ----------

    const logo = spriteIcon("ui.logo", { class: "pw-logo__text" });
    const sheepOpen = frameIcon("sheep", 12, 32, 32, { class: "pw-logo__sheep" });
    const sheepBlink = frameIcon("sheep", 13, 32, 32, { class: "pw-logo__sheep is-blink" });
    for (const c of [logo, sheepOpen, sheepBlink]) c.removeAttribute("style");
    // A sheep stands on top of the lettering (never overlapping it).
    const perch = sheepPerch(sheepOpen);
    const head = 32 - perch.y; // logo px of headroom above the lettering for the sheep
    const artW = Math.max(LOGO.w, perch.x + 32);
    const artH = head + LOGO.h;
    const sheepWrap = el("span", { class: "pw-logo__sheepwrap" }, sheepOpen, sheepBlink);
    sheepWrap.style.left = `calc(var(--lp) * ${perch.x})`;
    const art = el("span", { class: "pw-logo__art", "aria-hidden": "true" }, logo, sheepWrap);
    art.style.setProperty("--logo-w", String(LOGO.w));
    art.style.setProperty("--logo-h", String(LOGO.h));
    art.style.setProperty("--art-w", String(artW));
    art.style.setProperty("--head", String(head));
    const title = el("h1", { class: "pw-logo", id: "pw-title" }, el("span", { class: "visually-hidden" }, "Papa Snickers's Sheep Farm"), art);

    // ---------- the dialogue box ----------

    const say = el("p", { class: "sv-say pw-say", "aria-live": "polite" });
    // A plain text field, NOT in a <form>, so nothing offers to save it (see the top of the file).
    const input = el("input", {
      class: "sv-input pw-input",
      id: "farm-gate-word",
      type: "text",
      name: "gate-word",
      placeholder: "password",
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "none",
      spellcheck: "false",
      inputmode: "text",
      enterkeyhint: "go",
      "data-1p-ignore": "",
      "data-lpignore": "true",
      "data-form-type": "other",
      "aria-label": "Password",
    });
    const ok = el("button", { class: "sv-btn sv-btn--primary pw-ok", type: "button" }, "OK");
    const box = el("div", { class: "sv-box pw-box" }, say, el("div", { class: "pw-row" }, input, ok));

    const main = el("div", { class: "pw-main" }, title, box);
    const gate = el(
      "div",
      { class: `pw-gate is-${ph}`, role: "dialog", "aria-modal": "true", "aria-labelledby": "pw-title" },
      sky,
      main,
    );
    let closed = false;

    // ---------- sizing: whole device pixels per logo pixel ----------

    let lastW = 0;
    let lastH = 0;
    const size = () => {
      // A phone keyboard opening (same width, shorter window, typing in the box) shouldn't shrink
      // the logo and the clouds mid-word: keep the sizes from before it opened.
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw === lastW && vh < lastH && document.activeElement === input) return;
      lastW = vw;
      lastH = vh;
      const dpr = window.devicePixelRatio || 1;
      const avail = Math.min(window.innerWidth - 28, 700);
      const maxK = Math.max(1, Math.floor(5 * dpr));
      // Keep the logo (plus the sheep standing on it) to about a third of the screen, so the
      // dialogue box still fits on a phone held sideways.
      const byHeight = Math.floor((window.innerHeight * 0.32 * dpr) / artH);
      const k = Math.max(1, Math.min(maxK, byHeight, Math.floor((avail * dpr) / (artW + 4))));
      gate.style.setProperty("--lp", `${k / dpr}px`);
      // Title art: whole device pixels per art pixel, sized so the 330px cloud bank fills a bit
      // over a third of the screen height (like the real title screen).
      const ck = Math.max(1, Math.min(6, Math.round((window.innerHeight * dpr * 0.42) / 330)));
      gate.style.setProperty("--cp", `${ck / dpr}px`);
      buildBank();
    };
    size();
    addEventListener("resize", size);

    // ---------- typing ----------

    let typing = 0;
    const type = (text: string, cls = "") => {
      clearInterval(typing);
      say.className = `sv-say pw-say ${cls}`;
      if (reducedMotion()) {
        say.textContent = text;
        return;
      }
      let i = 0;
      say.textContent = "";
      typing = window.setInterval(() => {
        i++;
        say.textContent = text.slice(0, i);
        if (i % 3 === 0 && text[i - 1] !== " ") sfx("blip");
        if (i >= text.length) clearInterval(typing);
      }, 24);
    };

    // ---------- sheep idling: blink now and then ----------

    const blink = () => {
      sheepWrap.classList.add("is-blinking");
      later(() => sheepWrap.classList.remove("is-blinking"), 170);
      later(blink, 2200 + Math.random() * 3800);
    };
    later(blink, 1800);

    // ---------- submit ----------

    let busy = false;
    const shake = () => {
      box.classList.remove("is-shaking");
      sheepWrap.classList.remove("is-shaking");
      void box.offsetWidth;
      box.classList.add("is-shaking");
      sheepWrap.classList.add("is-shaking");
    };

    const submit = async () => {
      if (busy || closed) return;
      const word = input.value;
      if (!word.trim()) {
        shake();
        sfx("cancel");
        type("Hmm...? The gate wants a word.", "is-tease");
        input.focus();
        return;
      }
      busy = true;
      ok.disabled = true;
      gate.classList.add("is-busy");
      let right = false;
      try {
        right = await api.login(word);
      } catch {
        busy = false;
        ok.disabled = false;
        gate.classList.remove("is-busy");
        shake();
        sfx("cancel");
        type("The gate's stuck... Offline?", "is-tease");
        return;
      }
      if (!right) {
        busy = false;
        ok.disabled = false;
        gate.classList.remove("is-busy");
        let i = Math.floor(Math.random() * TEASES.length);
        if (i === lastTease) i = (i + 1) % TEASES.length;
        lastTease = i;
        shake();
        sfx("cancel");
        type(TEASES[i]!, "is-tease");
        input.value = "";
        input.focus();
        return;
      }
      // Welcome home!
      sfx("reward");
      later(() => sfx("baa", { pitch: 1.15 }), 420);
      input.blur();
      type("Welcome home!", "is-welcome");
      sheepWrap.classList.add("is-hopping");
      later(() => box.classList.add("is-done"), 500);
      later(() => gate.classList.add("is-leaving"), 1050);
      later(() => {
        finish();
        resolve();
      }, 1750);
    };

    input.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.isComposing) return;
      ev.preventDefault();
      void submit();
    });
    ok.addEventListener("click", () => void submit());

    const finish = () => {
      closed = true;
      timers.forEach(clearTimeout);
      clearInterval(typing);
      removeEventListener("resize", size);
      gate.remove();
      uiRoot.inert = false;
    };

    // ---------- show ----------

    uiRoot.inert = true;
    document.body.appendChild(gate);
    type(GREETING);
    requestAnimationFrame(() => {
      // Phones only open the keyboard on a real tap, so this is mostly for laptops.
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    });
  });
}
