// Hats for sheep, from the animal hats sheet (sprites/animal_hats.png). STUB — implemented by the sheep agent.
// Sheet layout (Stardew's hats sheet): 12 columns x 20px; each hat is a 20x80 strip of 4 frames
// stacked vertically: front (down), right, left, back (up). Hat id = row * 12 + column.

/** Curated hat ids offered in the hat picker (the ones that read well on a sheep). */
export function hatChoices(): number[] {
  return [];
}

/** Friendly name for a hat id. */
export function hatName(id: number): string {
  return `Hat #${id}`;
}

/** Front-facing hat icon as a crisp DOM canvas (for menus). Scaled with --px like spriteIcon. */
export function hatIcon(_id: number, _opts: { scale?: number } = {}): HTMLCanvasElement {
  return document.createElement("canvas");
}
