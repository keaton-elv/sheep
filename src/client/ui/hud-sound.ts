// The little sound box hanging left of the wool counter. It says at a glance whether sound is
// supposed to be playing:
//   waves = on    red X = off    faint waves + a nudge = on, but the phone hasn't let it play yet
// Tap: mute / unmute (while it's waiting, a tap wakes the sound instead, and plays a baa).
// Hold (or right-click): a tiny "Sound check" card with what the engine is doing, a test baa and
// (on iPhones that allow it) "Play in silent mode".

import { getSilentMode, getSoundStatus, onSoundStatus, playTestSound, setMuted, setSilentMode, unlockAudio } from "../audio";
import type { SoundStatus } from "../audio";
import { el, spriteIcon, toast } from "./dom";
import { CLOCK } from "./hud-art";
import { closePopover, currentPopover, togglePopover } from "./hud-popover";

/** calc() for a length in game pixels (same as hud.ts). */
const gp = (n: number) => `calc(var(--px) * ${n})`;
const HOLD_MS = 500;

type Look = "on" | "off" | "wait";

/** Phones and tablets: where the silent switch (and so "Play in silent mode") matters. */
export function silentModeMatters(): boolean {
  try {
    return matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

/**
 * "Play in silent mode" can actually do something: a phone whose browser lets a page pick its
 * audio session (Safari's navigator.audioSession). Elsewhere (Android has no silent switch for web
 * sounds; older iPhones can't opt out) the switch would be a lie, so it isn't shown.
 */
export function silentModeWorks(): boolean {
  try {
    return silentModeMatters() && getSoundStatus().sessionControl;
  } catch {
    return false;
  }
}

/** Sound is on, but the engine isn't running: the phone is waiting for a tap. */
const waiting = (s: SoundStatus) => s.enabled && s.engine !== "running";
const lookOf = (s: SoundStatus): Look => (!s.enabled ? "off" : s.engine === "running" ? "on" : "wait");

const LABELS: Record<Look, string> = {
  on: "Sound on. Tap to mute, hold for a sound check.",
  off: "Sound off. Tap for sound, hold for a sound check.",
  wait: "Sound is waiting for a tap. Tap to start it.",
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
      title: "Sound (hold for a sound check)",
      style: `left:${gp(S.x)};top:${gp(S.y)};width:${gp(S.w)};height:${gp(S.h)}`,
    },
    icons.on,
    icons.off,
    icons.wait,
  );
  root.appendChild(btn);

  const show = (s: SoundStatus) => {
    const look = lookOf(s);
    if (btn.dataset.state === look) return;
    btn.dataset.state = look;
    btn.setAttribute("aria-label", LABELS[look]);
  };
  show(getSoundStatus());
  onSoundStatus((s) => {
    try {
      show(s);
    } catch (err) {
      console.warn("[hud] sound", err);
    }
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
  /** Whether sound was waiting when the finger went down (before this very tap woke it). */
  let downWaiting: boolean | null = null;
  let downAt = 0;
  /** A finger / the left button is down on the box right now. */
  let pressing = false;
  let hinted = false;

  btn.addEventListener("pointerdown", (ev) => {
    if (ev.button > 0) return; // right-click: contextmenu handles it
    held = false;
    pressing = true;
    downWaiting = waiting(getSoundStatus());
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
    const wasWaiting = downWaiting !== null && performance.now() - downAt < 2000 ? downWaiting : waiting(st);
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
    // The usual iPhone reason for "I hear nothing": say it once per visit.
    if (!hinted && silentModeMatters() && !st.silentMode) {
      hinted = true;
      toast("Baa! No sound? Check the silent switch.", { icon: "ui.hud.sound.on", ms: 3800 });
    }
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

function engineWords(s: SoundStatus): string {
  switch (s.engine) {
    case "running":
      return "running";
    case "interrupted":
      return "interrupted";
    case "closed":
      return "stopped";
    default:
      if (!s.enabled) return "resting";
      return s.engine === "none" ? "waiting for a tap" : "asleep";
  }
}

function filesWords(s: SoundStatus): string {
  const total = s.filesReady + s.filesFailed + s.filesLoading;
  if (!total) return "none yet";
  return `${s.filesReady}/${total}${s.filesFailed ? ` · ${s.filesFailed} failed` : ""}`;
}

function buildSoundCheck(): { node: HTMLElement; dispose: () => void } {
  const row = (label: string) => {
    const value = el("b", { class: "hud-sound__value" });
    const li = el(
      "li",
      { class: "hud-sound__row" },
      el("span", { class: "hud-sound__label" }, label),
      el("span", { class: "hud-sound__dots", "aria-hidden": "true" }),
      value,
    );
    return { li, value };
  };
  const sound = row("Sound");
  const engine = row("Engine");
  const silent = row("Silent mode");
  const files = row("Files");
  const phone = silentModeMatters();
  const canSwitch = silentModeWorks();

  const nudge = el("p", { class: "hud-sound__nudge" }, "Tap anywhere to wake it.");
  const err = el("p", { class: "hud-sound__err" });
  const baa = el("button", { class: "sv-btn hud-sound__baa", type: "button" }, "Play a baa");
  const pill = el("span", { class: "hud-sound__pill" });
  const sw = el(
    "button",
    { class: "hud-sound__switch", type: "button", role: "switch", "aria-checked": "false" },
    el("span", { class: "hud-sound__swlabel" }, "Play in silent mode"),
    pill,
  );
  const note = el("p", { class: "hud-sound__note" }, "(Other music pauses.)");
  const help = el("p", { class: "hud-sound__help" });

  baa.addEventListener("click", () => {
    if (!getSoundStatus().enabled) setMuted(false);
    playTestSound();
  });
  sw.addEventListener("click", () => {
    const on = !getSilentMode();
    setSilentMode(on);
    if (on) playTestSound();
  });

  const render = (s: SoundStatus) => {
    sound.value.textContent = s.enabled ? "on" : "off";
    sound.value.classList.toggle("is-off", !s.enabled);
    engine.value.textContent = engineWords(s);
    engine.value.classList.toggle("is-warn", waiting(s));
    engine.value.classList.toggle("is-off", !s.enabled && s.engine !== "running");
    silent.value.textContent = s.silentMode ? "plays anyway" : "respected";
    files.value.textContent = filesWords(s);
    files.value.classList.toggle("is-warn", s.filesFailed > 0);
    nudge.hidden = !waiting(s);
    err.hidden = !s.lastError;
    err.textContent = s.lastError ?? "";
    sw.setAttribute("aria-checked", String(s.silentMode));
    pill.textContent = s.silentMode ? "On" : "Off";
    pill.classList.toggle("is-on", s.silentMode);
    note.hidden = !s.silentMode;
    help.textContent = phone && !s.silentMode ? "No sound? Check the silent switch." : "No sound? Check the volume.";
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
    el("ul", { class: "hud-sound__rows" }, sound.li, engine.li, phone ? silent.li : null, files.li),
    nudge,
    err,
    baa,
    canSwitch ? sw : null,
    canSwitch ? note : null,
    help,
  );
  return { node, dispose: off };
}
