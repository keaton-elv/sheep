// Mailbox art: the real Stardew letter paper (sprites/mail.png) as a 9-slice CSS border-image,
// a little envelope with a heart seal for the empty mailbox, and the cactus stamp on KitKat's
// postcards from Arizona (their picture side is postcard-art.ts).

import { pixelArt } from "../engine/pixelart";
import { SHEETS } from "../engine/sprites";
import { cssUrl, setRootVars, sheetCrop } from "./calendar-util";
import { registerPostcardStamp } from "./postcard-art";

// Registered at import time, before loadSprites() runs. `??=` keeps whoever else maps it.
SHEETS.mail ??= "sprites/mail.png";

/** The classic parchment letter is the first 320x180 sheet in mail.png. */
const LETTER = { x: 0, y: 0, w: 320, h: 180 } as const;
/**
 * border-image slices (top right bottom left). The corners keep the real torn top-right corner,
 * the folded bottom-right corner and the little bottom notch; the edges between are plain.
 */
export const LETTER_SLICE = [16, 40, 14, 12] as const;

/** Small torn notches that sit in the stretchy edges: patched over with a clean bit of edge. */
const PATCHES: readonly (readonly [dx: number, dy: number, sx: number, sy: number, w: number, h: number])[] = [
  [58, 0, 80, 0, 12, 10], // top edge, left notch
  [260, 0, 236, 0, 14, 10], // top edge, right notch
  [0, 74, 0, 100, 10, 14], // left edge notch
];

let done = false;
let paper: boolean | null = null;

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

  // 15x15 postage stamp for KitKat's postcards: perforated white edge (mailbox.css outlines it so it
  // reads on the cream card), an Arizona sunset in bands, the sun sinking behind the hills, two saguaros.
  pixelArt(
    "ui.postcard.stamp",
    [
      ".W.W.W.W.W.W.W.",
      "WCCCCCCCCCCCCCW",
      ".CPPPPPPPPPPPC.",
      "WCPPPPPPPPgPPCW",
      ".CppppppppgpgC.",
      "WCppppppgpgpgCW",
      ".COOOOOOgggggC.",
      "WCOOgOOOOOgOOCW",
      ".CYgYgYYYYgYYC.",
      "WCYgggYSSYgYYCW",
      ".CYYgYSSSSgYYC.",
      "WCDDgDDDDDgDDCW",
      ".CDDDDDDDDDDDC.",
      "WCCCCCCCCCCCCCW",
      ".W.W.W.W.W.W.W.",
    ],
    { W: "#ffffff", C: "#ffffff", P: "#7a4fa0", p: "#e86a8a", O: "#f59a3c", Y: "#ffd25a", S: "#fff2a0", g: "#2f7a34", D: "#c8743a" },
  );
  // With the desert sheet in, the stamp gets the real cactus flower instead.
  registerPostcardStamp();
}

/** Publish the letter paper as --fm-mail-paper (once). False if mail.png isn't loaded. */
export function mailPaperSkin(): boolean {
  if (paper !== null) return paper;
  try {
    const c = sheetCrop("mail", LETTER.x, LETTER.y, LETTER.w, LETTER.h);
    if (!c) return false; // not loaded (yet?): try again next time
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      for (const [dx, dy, sx, sy, w, h] of PATCHES) ctx.putImageData(ctx.getImageData(sx, sy, w, h), dx, dy);
    }
    setRootVars({ "--fm-mail-paper": cssUrl(c) });
    paper = true;
  } catch (err) {
    console.warn("[mailbox] letter paper unavailable", err);
    paper = false;
  }
  return paper;
}
