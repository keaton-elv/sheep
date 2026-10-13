// Sound effects. STUB — implemented by the HUD/audio agent.
// Plays real sound files from public/sounds/<name>.(ogg|mp3|wav) when present,
// otherwise synthesizes a Stardew-ish sound with WebAudio.

export type Sfx =
  | "baa" // a sheep baa
  | "snip" // shears
  | "pop" // item pickup / wool pops out
  | "purchase" // cash register (buying a sheep / decoration)
  | "menuOpen"
  | "menuClose"
  | "blip" // dialogue typing
  | "select" // button click
  | "cancel" // error / nope
  | "loom" // loom clacking
  | "coin"
  | "junimo" // junimo chirp
  | "yip" // fox
  | "squeak" // hedgehog
  | "rustle" // grass/bush
  | "sparkle" // golden sheep / magic
  | "stardrop" // big milestone fanfare
  | "thud"
  | "door" // barn door
  | "crow"
  | "pet" // petting rustle + happy
  | "woosh"
  | "splash"
  | "chime"; // gentle notification (new mail)

export function sfx(_name: Sfx, _opts: { volume?: number; pitch?: number } = {}): void {}

/** Browsers need a user gesture before audio can play; main.ts calls this on first tap/key. */
export function unlockAudio(): void {}

export function isMuted(): boolean {
  return false;
}

export function setMuted(_muted: boolean): void {}

export function onMuteChange(_fn: (muted: boolean) => void): () => void {
  return () => {};
}
