// A little envelope with a heart seal, for the mailbox menu.

import { pixelArt } from "../engine/pixelart";

let done = false;

export function registerMailboxArt(): void {
  if (done) return;
  done = true;
  // 15x10 envelope: cream paper, folded flap, a red heart wax seal.
  pixelArt(
    "ui.letter",
    [
      "ooooooooooooooo",
      "oSWWWWWWWWWWWSo",
      "oWSSWWWWWWWSSWo",
      "oWWWSrrWrrSWWWo",
      "oWWWrhRrRRrWWWo",
      "oWWWrRRRRdrWWWo",
      "owwwwrRRdrwwwwo",
      "owwwwwrdrwwwwwo",
      "owwwwwwrwwwwwwo",
      "ooooooooooooooo",
    ],
    { o: "#6b4a2f", W: "#fff7e3", w: "#ecdcb8", S: "#d9bf8e", R: "#e8344b", r: "#8e0f24", h: "#ff9aa6", d: "#b81e33" },
  );
}
