// "Who goes there?" A Stardew-style title screen over the (already running) farm, with a
// dialogue box asking for the secret word. Remembered afterwards by the server's cookie.

import { sfx } from "../audio";
import { size as spriteSize, spriteUrl } from "../engine/sprites";
import { api } from "../net";
import { el, frameIcon, spriteIcon, uiRoot } from "./dom";
import { registerPasswordArt } from "./password-art";
import "./password.css";

const GREETING = "Hold it! Only farmers of this farm past the gate. What's the secret word?";

const TEASES = [
  "Baa? That's not it.",
  "The sheep look at you suspiciously.",
  "Nope! Even the hedgehog knows that's wrong.",
  "Hmm... the Junimos are giggling.",
  "That's not it. Marnie squints at you from across the field.",
  "A crow caws. Judgmentally.",
  "Ba-nope.",
  "Mr. Qi raises an eyebrow.",
  "The fox yips. That's fox for \"nice try\".",
  "Wrong word! Mayor Lewis has been notified. (Not really.)",
  "The gate doesn't budge. A sheep chews thoughtfully.",
];

let lastTease = -1;

function phase(): "dawn" | "day" | "dusk" | "night" {
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

    const sky = el("div", { class: "pw-sky", "aria-hidden": "true" });
    const clouds: [string, number, number, number][] = [
      // [key, top %, duration s, start %]
      ["ui.title.cloud.2", 8, 150, 0.15],
      ["ui.title.cloud.1", 22, 120, 0.62],
      ["ui.title.cloud.3", 4, 95, 0.4],
      ["ui.title.cloud.1", 38, 170, 0.9],
      ["ui.title.cloud.3", 30, 110, 0.05],
    ];
    for (const [key, top, dur, start] of clouds) {
      const img = el("img", { class: "pw-cloud", src: spriteUrl(key), alt: "", draggable: "false" });
      const dim = spriteSize(key) ?? { w: 40, h: 16 };
      img.style.width = `calc(var(--cp) * ${dim.w})`;
      img.style.height = `calc(var(--cp) * ${dim.h})`;
      img.style.top = `${top}%`;
      img.style.animationDuration = `${dur}s`;
      img.style.animationDelay = `${-dur * start}s`;
      sky.appendChild(img);
    }
    for (let i = 0; i < 2; i++) {
      const bird = el("div", { class: "pw-bird" });
      bird.style.backgroundImage = `url("${spriteUrl("ui.title.bird")}")`;
      bird.style.top = `${14 + i * 7}%`;
      bird.style.animationDelay = `0s, ${-i * 3 - 4}s`;
      sky.appendChild(bird);
    }
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

    // ---------- logo ----------

    const logo = spriteIcon("ui.logo", { class: "pw-logo__text" });
    const sheepOpen = frameIcon("sheep", 12, 32, 32, { class: "pw-logo__sheep" });
    const sheepBlink = frameIcon("sheep", 13, 32, 32, { class: "pw-logo__sheep is-blink" });
    for (const c of [logo, sheepOpen, sheepBlink]) c.removeAttribute("style");
    const sheepWrap = el("span", { class: "pw-logo__sheepwrap" }, sheepOpen, sheepBlink);
    const title = el(
      "h1",
      { class: "pw-logo", id: "pw-title" },
      el("span", { class: "visually-hidden" }, "Baaaah Farm"),
      el("span", { class: "pw-logo__art", "aria-hidden": "true" }, logo, sheepWrap),
    );
    const tagline = el("p", { class: "pw-tagline" }, "a tiny farm for two");

    // ---------- the dialogue box ----------

    const say = el("p", { class: "sv-say pw-say", "aria-live": "polite" });
    const user = el("input", {
      class: "visually-hidden",
      type: "text",
      name: "username",
      autocomplete: "username",
      value: "farmer",
      tabindex: "-1",
      "aria-hidden": "true",
      readonly: true,
    });
    const input = el("input", {
      class: "sv-input pw-input",
      id: "farm-password",
      type: "password",
      name: "password",
      autocomplete: "current-password",
      autocapitalize: "none",
      autocorrect: "off",
      spellcheck: "false",
      enterkeyhint: "go",
      required: true,
      placeholder: "secret word",
      "aria-label": "Secret word",
    });
    const ok = el("button", { class: "sv-btn sv-btn--primary pw-ok", type: "submit" }, "OK");
    const form = el(
      "form",
      { class: "sv-box pw-box", method: "post", action: "#", autocomplete: "on", novalidate: true },
      say,
      user,
      el("div", { class: "pw-row" }, input, ok),
    );

    const main = el("div", { class: "pw-main" }, title, tagline, form);
    const gate = el(
      "div",
      { class: `pw-gate is-${phase()}`, role: "dialog", "aria-modal": "true", "aria-labelledby": "pw-title" },
      sky,
      main,
    );

    // ---------- sizing: whole device pixels per logo pixel ----------

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      const avail = Math.min(window.innerWidth - 28, 700);
      const maxK = Math.max(1, Math.floor(5 * dpr));
      // The logo (plus the sheep standing on it) is 42 logo-px tall: keep it to about a third
      // of the screen so the dialogue box still fits on a phone held sideways.
      const byHeight = Math.floor((window.innerHeight * 0.32 * dpr) / 42);
      const k = Math.max(1, Math.min(maxK, byHeight, Math.floor((avail * dpr) / 116)));
      gate.style.setProperty("--lp", `${k / dpr}px`);
      const ck = Math.max(1, Math.round(k * 0.8));
      gate.style.setProperty("--cp", `${ck / dpr}px`);
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
      form.classList.remove("is-shaking");
      sheepWrap.classList.remove("is-shaking");
      void form.offsetWidth;
      form.classList.add("is-shaking");
      sheepWrap.classList.add("is-shaking");
    };

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (busy) return;
      const word = input.value;
      if (!word.trim()) {
        shake();
        sfx("cancel");
        type("The gate waits. It wants a word, not a shrug.", "is-tease");
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
        type("The gate's stuck! (Can't reach the farm. Check your connection?)", "is-tease");
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
      // Removing the form tells password managers the login worked.
      later(() => form.classList.add("is-done"), 500);
      later(() => gate.classList.add("is-leaving"), 1050);
      later(() => {
        finish();
        resolve();
      }, 1750);
    });

    const finish = () => {
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
