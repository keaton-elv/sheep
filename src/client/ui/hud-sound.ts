// The little sound box hanging left of the wool counter: the one sound switch. It says at a glance
// whether sound will play:
//   waves = on    red X = off    faint waves + "Tap for sound" = on, but the phone hasn't let it
//   play yet (any tap wakes it)
// Sound is on unless they turn it off, and when it's on it plays even with the iPhone's silent
// switch on.
// Tap: on / off (while it's waiting, a tap wakes the sound instead, with a baa).
// Hold (or right-click): a tiny "Sound check" card: the switch, a test baa, and one line saying
// what's going on.

import { getSoundStatus, onSoundStatus, playTestSound, setMuted, unlockAudio } from "../audio";
import type { SoundStatus } from "../audio";
import { el, spriteIcon } from "./dom";
import { CLOCK } from "./hud-art";
import { closePopover, currentPopover, togglePopover } from "./hud-popover";

/** calc() for a length in game pixels (same as hud.ts). */
const gp = (n: number) => `calc(var(--px) * ${n})`;
const HOLD_MS = 500;
/** How long sound can take to wake up before the box admits it's waiting for a tap. */
const WAIT_GRACE_MS = 700;

type Look = "on" | "off" | "wait";

/** Sound is on, but the engine isn't running: the phone is waiting for a tap. */
const waiting = (s: SoundStatus) => s.enabled && s.engine !== "running";
const lookOf = (s: SoundStatus): Look => (!s.enabled ? "off" : s.engine === "running" ? "on" : "wait");

const LABELS: Record<Look, string> = {
  on: "Sound on. Tap to turn it off.",
  off: "Sound off. Tap to turn it on.",
  wait: "Tap for sound.",
};
const TITLES: Record<Look, string> = {
  on: "Sound: on",
  off: "Sound: off",
  wait: "Tap for sound",
};

/** Mount the sound box inside the clock widget (positioned in its game-pixel space). */
export function mountSoundBox(root: HTMLElement): void {
  const icons: Record<Look, HTMLCanvasElement> = {
    on: spriteIcon("ui.hud.sound.on", { class: "hud-sound__icon hud-sound__icon--on" }),
    off: spriteIcon("ui.hud.sound.off", { class: "hud-sound__icon hud-sound__icon--off" }),
    wait: spriteIcon("ui.hud.sound.wait", { class: "hud-sound__icon hud-sound__icon--wait" }),
  };
  const S = CLOCK.sound;
  const btn = el(
    "button",
    {
      class: "hud-sound",
      type: "button",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      style: `left:${gp(S.x)};top:${gp(S.y)};width:${gp(S.w)};height:${gp(S.h)}`,
    },
    icons.on,
    icons.off,
    icons.wait,
    el("span", { class: "hud-sound__hint", "aria-hidden": "true" }, "Tap for sound"),
  );
  root.appendChild(btn);

  const apply = (look: Look) => {
    if (btn.dataset.state === look) return;
    btn.dataset.state = look;
    btn.setAttribute("aria-label", LABELS[look]);
    btn.title = TITLES[look];
  };
  // Turning sound on, or coming back to the page, wakes the engine in a blink: give it a moment
  // before switching to the waiting look, so the box doesn't flicker on every tap (it shows "on").
  let waitTimer = 0;
  const confirmWait = () => {
    waitTimer = 0;
    try {
      if (lookOf(getSoundStatus()) !== "wait") return;
      if (document.visibilityState === "hidden") waitTimer = window.setTimeout(confirmWait, WAIT_GRACE_MS);
      else apply("wait");
    } catch (err) {
      console.warn("[hud] sound", err);
    }
  };
  const show = (s: SoundStatus) => {
    const look = lookOf(s);
    const shown = btn.dataset.state;
    if (look !== "wait" || !shown || shown === "wait") {
      clearTimeout(waitTimer);
      waitTimer = 0;
      apply(look);
      return;
    }
    apply("on");
    if (!waitTimer) waitTimer = window.setTimeout(confirmWait, WAIT_GRACE_MS);
  };
  show(getSoundStatus());
  onSoundStatus((s) => {
    try {
      show(s);
    } catch (err) {
      console.warn("[hud] sound", err);
    }
  });
  // Back on the page: the engine is resuming right now, so start the moment over.
  document.addEventListener("visibilitychange", () => {
    if (!waitTimer || document.visibilityState !== "visible") return;
    clearTimeout(waitTimer);
    waitTimer = window.setTimeout(confirmWait, WAIT_GRACE_MS);
  });

  // ---------- the sound check card ----------

  const toggleCheck = () => {
    if (currentPopover()?.anchor === btn) {
      closePopover();
      return;
    }
    const card = buildSoundCheck();
    togglePopover({ anchor: btn, placement: "below-end", label: "Sound check", className: "hud-sound-pop", content: card.node, onClose: card.dispose });
  };

  // ---------- tap / hold ----------

  let holdTimer = 0;
  /** This press already opened the sound check, so its click is swallowed. */
  let held = false;
  /** Whether the box showed "waiting" when the finger went down (before this very tap woke it). */
  let downWaiting: boolean | null = null;
  let downAt = 0;
  /** A finger / the left button is down on the box right now. */
  let pressing = false;

  btn.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0) return; // right-click: contextmenu handles it
    held = false;
    pressing = true;
    downWaiting = btn.dataset.state === "wait";
    downAt = performance.now();
    clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
      held = true;
      try {
        toggleCheck();
      } catch (err) {
        console.warn("[hud] sound check", err);
      }
    }, HOLD_MS);
  });
  const cancelHold = () => {
    pressing = false;
    clearTimeout(holdTimer);
  };
  btn.addEventListener("pointerup", cancelHold);
  btn.addEventListener("pointercancel", cancelHold);
  btn.addEventListener("pointerleave", cancelHold);
  // Right-click, Android's long-press, Shift+F10 / the menu key.
  btn.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    clearTimeout(holdTimer);
    if (held) return; // the hold already opened it
    // A long-press might still end in a click: swallow that one (a right-click or key never does).
    if (pressing) held = true;
    toggleCheck();
  });

  // A key press never belongs to an earlier hold (whose click may never have come).
  btn.addEventListener("keydown", () => {
    held = false;
  });

  btn.addEventListener("click", () => {
    if (held) {
      held = false;
      return;
    }
    const st = getSoundStatus();
    // Goes by what the box showed: "on" (even in its moment's grace) means a tap turns it off.
    const wasWaiting = downWaiting !== null && performance.now() - downAt < 2000 ? downWaiting : btn.dataset.state === "wait";
    downWaiting = null;
    if (wasWaiting) {
      wakeUp();
      return;
    }
    if (st.enabled) {
      setMuted(true);
      return;
    }
    setMuted(false);
    playTestSound();
  });

  /** A tap while waiting: wake the engine (this click is a gesture) and baa once it's up. */
  const wakeUp = () => {
    unlockAudio();
    playTestSound();
    // Still not running a moment later: show the sound check, so they can see why.
    window.setTimeout(() => {
      try {
        if (waiting(getSoundStatus()) && currentPopover()?.anchor !== btn) toggleCheck();
      } catch (err) {
        console.warn("[hud] sound", err);
      }
    }, 1200);
  };
}

// ---------- the card ----------

type Tone = "ok" | "warn" | "off";

/** The one status line: is sound playing, and if not, why. */
function statusLine(s: SoundStatus): { text: string; tone: Tone } {
  if (!s.enabled) return { text: "Sound is off.", tone: "off" };
  if (s.engine === "running") return { text: "Playing! Can't hear it? Turn the volume up.", tone: "ok" };
  const why = s.engineError ? ` (${s.engineError})` : "";
  if (s.engine === "interrupted") return { text: `Paused by the phone. Tap for sound.${why}`, tone: "warn" };
  return { text: `Tap for sound.${why}`, tone: "warn" };
}

function buildSoundCheck(): { node: HTMLElement; dispose: () => void } {
  const pill = el("span", { class: "hud-sound__pill" });
  const sw = el(
    "button",
    { class: "hud-sound__switch", type: "button", role: "switch", "aria-checked": "false" },
    el("span", { class: "hud-sound__swlabel" }, "Sound"),
    pill,
  );
  const baa = el("button", { class: "sv-btn hud-sound__baa", type: "button" }, "Play a baa");
  const status = el("p", { class: "hud-sound__status", role: "status" });

  sw.addEventListener("click", () => {
    const on = !getSoundStatus().enabled;
    setMuted(!on);
    if (on) playTestSound();
  });
  baa.addEventListener("click", () => {
    if (!getSoundStatus().enabled) setMuted(false);
    playTestSound();
  });

  const render = (s: SoundStatus) => {
    sw.setAttribute("aria-checked", String(s.enabled));
    pill.textContent = s.enabled ? "On" : "Off";
    pill.classList.toggle("is-on", s.enabled);
    const line = statusLine(s);
    status.textContent = line.text;
    status.dataset.tone = line.tone;
  };
  render(getSoundStatus());
  const off = onSoundStatus((s) => {
    try {
      render(s);
    } catch (e) {
      console.warn("[hud] sound check", e);
    }
  });

  const node = el(
    "div",
    { class: "hud-sound__body" },
    el("p", { class: "hud-sound__title" }, spriteIcon("ui.hud.sound.on"), "Sound check"),
    sw,
    baa,
    status,
  );
  return { node, dispose: off };
}
