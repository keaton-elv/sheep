// Turns the UI frame sprites into CSS custom properties, so CSS borders use real pixel art.
// Call after loadSprites() + art registration (and again if sheets change).

import { spriteUrl } from "../engine/sprites";

const VARS: Record<string, string> = {
  "--img-box": "ui.box",
  "--img-button": "ui.button",
  "--img-button-hover": "ui.button.hover",
  "--img-input": "ui.input",
  "--img-slot": "ui.slot",
};

export function applySkin(): void {
  const root = document.documentElement.style;
  for (const [cssVar, key] of Object.entries(VARS)) root.setProperty(cssVar, `url("${spriteUrl(key)}")`);
}
