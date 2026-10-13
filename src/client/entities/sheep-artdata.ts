// Pure pixel-art data (no DOM, no imports) for emote bubbles and little sheep effects.
// One character = one pixel, "." = transparent. Turned into canvases by emotes.ts / sheep-art.ts.

export interface ArtData {
  rows: string[];
  palette: Record<string, string>;
}

/** Deep plum outline used by every bubble, like Stardew's emote sheet. */
const INK = "#3d2b4f";

// ---------- the speech bubble ----------

/** Full emote bubble: 15x16. The tail tip is at column BUBBLE_TAIL_X of the last row. */
export const BUBBLE: ArtData = {
  rows: [
    "...ooooooooo...",
    ".ooWWWWWWWWWoo.",
    ".oWWWWWWWWWWWo.",
    "oWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWso",
    "oWWWWWWWWWWWWso",
    ".osWWWWWWWWsso.",
    "..ooooWWsoooo..",
    ".....oWso......",
    ".....oso.......",
    "......o........",
  ],
  palette: { o: INK, W: "#ffffff", s: "#ddd5ec" },
};
export const BUBBLE_TAIL_X = 6;
/** Where an icon's top-left goes inside the bubble so an 11x9 icon is centered. */
export const ICON_BOX = { x: 2, y: 2, w: 11, h: 9 };

/** Pop-in stages: the bubble swells out of its tail (bottom-aligned, tail at column 2 / 4). */
export const POP: ArtData[] = [
  {
    rows: [".ooo.", "oWWWo", "oWWso", ".oso.", "..o.."],
    palette: { o: INK, W: "#ffffff", s: "#ddd5ec" },
  },
  {
    rows: [
      "..ooooo..",
      ".oWWWWWo.",
      "oWWWWWWWo",
      "oWWWWWWWo",
      "oWWWWWWso",
      ".oWWWWso.",
      "..ooWsoo.",
      "...oso...",
      "....o....",
    ],
    palette: { o: INK, W: "#ffffff", s: "#ddd5ec" },
  },
];
export const POP_TAIL_X = [2, 4];

// ---------- emote icons (drawn inside the bubble, centered in ICON_BOX) ----------

export const EMOTE_ICONS: Record<string, ArtData> = {
  heart: {
    rows: [
      ".rrr.rrr.",
      "rhhRrRRRr",
      "rhRRRRRRr",
      "rRRRRRRRr",
      ".rRRRRRr.",
      "..rRRRr..",
      "...rRr...",
      "....r....",
    ],
    palette: { r: "#8e0f24", R: "#e8344b", h: "#ff9aa6" },
  },
  happy: {
    rows: [
      "...ooooo...",
      "..oYYYYYo..",
      ".oYYYYYYYo.",
      "oYYkYYYkYyo",
      "oYkYkYkYkyo",
      "opYYYYYYYpo",
      ".oYkYYYkyo.",
      "..oYkkkyo..",
      "...ooooo...",
    ],
    palette: { o: "#8a4b0c", Y: "#ffd84a", y: "#f2a92c", k: "#5a2e0a", p: "#ff8a8a" },
  },
  music: {
    rows: [
      "...kkkkkkk.",
      "...kkkkkkk.",
      "...k.....k.",
      "...k.....k.",
      "...k.....k.",
      ".kkk...kkk.",
      "khhk..khhk.",
      "kkkk..kkkk.",
      ".kk....kk..",
    ],
    palette: { k: "#3f2d86", h: "#8a78e0" },
  },
  sleep: {
    rows: [
      ".....kkkkkk",
      ".....llllkk",
      "........kk.",
      ".......kk..",
      "......kk...",
      "kkkk.kkkkkk",
      "llkk.......",
      ".kk........",
      "kkkk.......",
    ],
    palette: { k: "#2f56c4", l: "#7fa6ff" },
  },
  question: {
    rows: [
      "..kkkkk..",
      ".kkhhhkk.",
      ".kk...kk.",
      "......kk.",
      "....kkk..",
      "...kk....",
      ".........",
      "...kk....",
      "...kk....",
    ],
    palette: { k: "#3346b0", h: "#7f90ff" },
  },
  exclaim: {
    rows: [
      ".RRR.",
      "RRhRR",
      "RRhRR",
      ".RRR.",
      ".RRR.",
      "..r..",
      ".....",
      ".RRR.",
      ".rrr.",
    ],
    palette: { R: "#ef4b2b", h: "#ffb38a", r: "#a8261a" },
  },
  sad: {
    rows: [
      "....b....",
      "...bLb...",
      "...bLb...",
      "..bLLLb..",
      "..bwLLb..",
      ".bwLLLLb.",
      ".bwLLLDb.",
      ".bLLLDDb.",
      "..bbbbb..",
    ],
    palette: { b: "#24478f", L: "#5fa8ff", w: "#d6ecff", D: "#3a7ad9" },
  },
  angry: {
    rows: [
      "...r...r...",
      "...r...r...",
      "..rR...Rr..",
      "rrR.....Rrr",
      "...........",
      "rrR.....Rrr",
      "..rR...Rr..",
      "...r...r...",
      "...r...r...",
    ],
    palette: { r: "#9b1414", R: "#ff4a3a" },
  },
  dots: {
    rows: ["kk..kk..kk", "kk..kk..kk"],
    palette: { k: INK },
  },
};

/** The "..." emote types itself out one dot at a time. */
export const DOTS_STAGES: ArtData[] = [
  { rows: ["kk........", "kk........"], palette: { k: INK } },
  { rows: ["kk..kk....", "kk..kk...."], palette: { k: INK } },
];

// ---------- little sheep effects ----------

/** Golden-sheep twinkle, 3 frames (5x5). */
export const SPARKLE: ArtData[] = [
  { rows: [".....", "..w..", ".wWw.", "..w..", "....."], palette: { w: "#fff3a8", W: "#ffffff" } },
  { rows: ["..y..", "..w..", "ywWwy", "..w..", "..y.."], palette: { w: "#fff3a8", W: "#ffffff", y: "#ffc93a" } },
  { rows: [".....", ".y.y.", "..W..", ".y.y.", "....."], palette: { W: "#fff6c8", y: "#ffd23a" } },
];

/** "+" that rides up next to a heart when you pet a sheep. */
export const PLUS: ArtData = {
  rows: ["..ooo..", "..oWo..", "oooWooo", "oWWWWWo", "oooWooo", "..oWo..", "..ooo.."],
  palette: { o: "#8e0f24", W: "#ffffff" },
};

/** A wool tuft that flies off during shearing (two sizes). */
export const TUFTS: ArtData[] = [
  { rows: [".oo.", "oWWo", "oWso", ".oo."], palette: { o: "#b9a27e", W: "#fff7e3", s: "#e8dcc2" } },
  { rows: [".ooo.", "oWWWo", "oWWso", ".oso.", "..o.."], palette: { o: "#b9a27e", W: "#fff7e3", s: "#e8dcc2" } },
];

// ---------- golden sheep ----------

/** Luminance -> gold ramp (stops sorted by luminance). The sheep sheet's 5 tones map onto it. */
const GOLD_RAMP: [number, number, number, number][] = [
  [0.0, 0x2e, 0x17, 0x06],
  [0.15, 0x45, 0x24, 0x08],
  [0.27, 0x84, 0x48, 0x0e],
  [0.49, 0xcf, 0x8c, 0x1a],
  [0.79, 0xf9, 0xc9, 0x3e],
  [0.96, 0xff, 0xf2, 0x9c],
  [1.0, 0xff, 0xfb, 0xd8],
];

/** Recolor one opaque pixel of a sheep frame to its golden-sheep tone. Pure, so it's testable. */
export function goldenRGB(r: number, g: number, b: number): [number, number, number] {
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  for (let i = 1; i < GOLD_RAMP.length; i++) {
    const hi = GOLD_RAMP[i]!;
    if (L <= hi[0]) {
      const lo = GOLD_RAMP[i - 1]!;
      const t = (L - lo[0]) / (hi[0] - lo[0] || 1);
      return [Math.round(lo[1] + (hi[1] - lo[1]) * t), Math.round(lo[2] + (hi[2] - lo[2]) * t), Math.round(lo[3] + (hi[3] - lo[3]) * t)];
    }
  }
  const last = GOLD_RAMP[GOLD_RAMP.length - 1]!;
  return [last[1], last[2], last[3]];
}

// ---------- fallback sheep sheet ----------
// Only used if sprites/sheep.png fails to load. Paints a 128x160 RGBA sheet with the same
// layout as the real one: 0-3 walk down, 4-7 walk right, 8-11 walk up, 12 idle front,
// 13 asleep, 14 idle side, 15 idle back, 16-19 graze.

type RGBA = [number, number, number, number];
const FB = {
  outline: [0x51, 0x3f, 0x3f, 255] as RGBA,
  light: [0xff, 0xf6, 0xdc, 255] as RGBA,
  wool: [0xdc, 0xc9, 0xa5, 255] as RGBA,
  shade: [0x8e, 0x7a, 0x5a, 255] as RGBA,
  dark: [0x26, 0x26, 0x26, 255] as RGBA,
  skin: [0xf2, 0xd2, 0xb6, 255] as RGBA,
  skinShade: [0xc9, 0xa2, 0x86, 255] as RGBA,
  shadow: [0x28, 0x0a, 0x21, 109] as RGBA,
};

export function paintFallbackSheep(sheared: boolean): Uint8ClampedArray {
  const W = 128;
  const H = 160;
  const buf = new Uint8ClampedArray(W * H * 4);
  let ox = 0;
  let oy = 0;
  const put = (x: number, y: number, c: RGBA) => {
    const px = ox + Math.round(x);
    const py = oy + Math.round(y);
    if (px < ox || py < oy || px >= ox + 32 || py >= oy + 32) return;
    buf.set(c, (py * W + px) * 4);
  };
  /** A shaded, outlined ellipse; `bumps` gives wool a scalloped edge. Light from the top-left. */
  const blob = (cx: number, cy: number, rx: number, ry: number, base: RGBA, light: RGBA, shade: RGBA, bumps = 0) => {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) {
      for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const a = Math.atan2(dy, dx);
        const r = 1 + bumps * Math.sin(a * 7);
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        const edge = Math.hypot((x + 1.5 - cx) / rx, (y + 0.5 - cy) / ry) / r > 1 || Math.hypot((x - 0.5 - cx) / rx, (y + 0.5 - cy) / ry) / r > 1 || Math.hypot((x + 0.5 - cx) / rx, (y + 1.5 - cy) / ry) / r > 1 || Math.hypot((x + 0.5 - cx) / rx, (y - 0.5 - cy) / ry) / r > 1;
        if (edge) put(x, y, FB.outline);
        else if (dx + dy < -0.85 && d > 0.45) put(x, y, light);
        else if (dy > 0.55 || dx + dy > 1.0) put(x, y, shade);
        else put(x, y, base);
      }
    }
  };
  const shadow = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(x, y, FB.shadow);
  };
  const leg = (x: number, top: number, bottom: number) => {
    for (let y = top; y <= bottom; y++) {
      put(x, y, y === bottom ? FB.dark : FB.outline);
      put(x + 1, y, y === bottom ? FB.dark : FB.shade);
    }
  };
  const body = (cx: number, cy: number, rx: number, ry: number) =>
    sheared ? blob(cx, cy, rx * 0.72, ry * 0.75, FB.skin, FB.light, FB.skinShade) : blob(cx, cy, rx, ry, FB.wool, FB.light, FB.shade, 0.07);
  const face = (cx: number, cy: number, eyes: "open" | "closed" | "none") => {
    blob(cx, cy, 3.6, 4.2, FB.skin, FB.light, FB.skinShade);
    put(cx - 5, cy - 3, FB.outline);
    put(cx - 4, cy - 3, FB.shade);
    put(cx + 4, cy - 3, FB.shade);
    put(cx + 5, cy - 3, FB.outline);
    if (eyes === "open") {
      put(cx - 2, cy - 1, FB.dark);
      put(cx + 1, cy - 1, FB.dark);
    } else if (eyes === "closed") {
      put(cx - 2, cy - 1, FB.outline);
      put(cx - 3, cy - 1, FB.outline);
      put(cx + 1, cy - 1, FB.outline);
      put(cx + 2, cy - 1, FB.outline);
    }
    put(cx - 1, cy + 2, FB.skinShade);
    put(cx, cy + 2, FB.skinShade);
  };

  for (let i = 0; i < 20; i++) {
    ox = (i % 4) * 32;
    oy = Math.floor(i / 4) * 32;
    const step = i < 12 ? i % 4 : 0;
    const bob = step % 2;
    const legL = step === 1 ? -1 : 0;
    const legR = step === 3 ? -1 : 0;
    const legTop = sheared ? 22 : 25;
    if (i < 4 || i === 12 || i === 13 || i >= 16) {
      // Front view.
      shadow(16, 28, 10, 3);
      const asleep = i === 13;
      if (!asleep) {
        leg(10, legTop, 30 + legL);
        leg(20, legTop, 30 + legR);
      }
      body(16, 20 + bob + (asleep ? 2 : 0), 10, 8);
      const graze = i >= 16 ? Math.min(3, i - 15) : 0;
      face(16, 17 + bob + graze + (asleep ? 2 : 0), asleep ? "closed" : graze >= 2 ? "none" : "open");
    } else if ((i >= 4 && i < 8) || i === 14) {
      // Side view, facing right.
      shadow(16, 28, 11, 3);
      leg(8, legTop, 30 + legL);
      leg(12, legTop, 30 + legR);
      leg(18, legTop, 30 + legR);
      leg(22, legTop, 30 + legL);
      body(15, 20 + bob, 11, 7);
      blob(25, 16 + bob, 4, 3.6, FB.skin, FB.light, FB.skinShade);
      put(23, 12 + bob, FB.outline);
      put(22, 12 + bob, FB.shade);
      put(27, 15 + bob, FB.dark);
    } else {
      // Back view.
      shadow(16, 28, 10, 3);
      leg(10, legTop, 30 + legL);
      leg(20, legTop, 30 + legR);
      body(16, 19 + bob, 10, 8);
      put(10, 11 + bob, FB.outline);
      put(11, 11 + bob, FB.shade);
      put(21, 11 + bob, FB.shade);
      put(22, 11 + bob, FB.outline);
      blob(16, 26 + bob, 1.8, 1.6, sheared ? FB.skin : FB.wool, FB.light, FB.shade);
    }
  }
  return buf;
}

// ---------- splitting a sheep sheet into body / golden body / ground shadow ----------

export interface SplitSheet {
  body: Uint8ClampedArray;
  golden: Uint8ClampedArray;
  shadow: Uint8ClampedArray;
}

/**
 * Split RGBA sheet pixels (frames of `frame` x `frame`) into the opaque body, a golden recolor of
 * it, and the translucent ground shadow. The shadow is an ellipse partly hidden under the legs, so
 * each frame's shadow ellipse is re-filled underneath the body (otherwise hopping shows holes).
 */
export function splitSheepPixels(d: Uint8ClampedArray, w: number, h: number, frame = 32): SplitSheet {
  const body = new Uint8ClampedArray(d.length);
  const golden = new Uint8ClampedArray(d.length);
  const shadow = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a >= 250) {
      body[i] = d[i]!;
      body[i + 1] = d[i + 1]!;
      body[i + 2] = d[i + 2]!;
      body[i + 3] = 255;
      const [r, g, b] = goldenRGB(d[i]!, d[i + 1]!, d[i + 2]!);
      golden[i] = r;
      golden[i + 1] = g;
      golden[i + 2] = b;
      golden[i + 3] = 255;
    } else if (a > 8) {
      shadow[i] = d[i]!;
      shadow[i + 1] = d[i + 1]!;
      shadow[i + 2] = d[i + 2]!;
      shadow[i + 3] = a;
    }
  }
  const cols = Math.floor(w / frame);
  const rows = Math.floor(h / frame);
  for (let f = 0; f < cols * rows; f++) {
    const fx = (f % cols) * frame;
    const fy = Math.floor(f / cols) * frame;
    let minX = frame, maxX = -1, minY = frame, maxY = -1, color = -1;
    for (let y = 0; y < frame; y++) {
      for (let x = 0; x < frame; x++) {
        const i = ((fy + y) * w + fx + x) * 4;
        if (shadow[i + 3]! === 0) continue;
        if (color < 0) color = i;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (color < 0) continue;
    const cx = (minX + maxX + 1) / 2;
    const rx = (maxX - minX + 1) / 2;
    // The top of the ellipse hides under the body; assume it's symmetric about its widest row.
    const bottom = maxY + 1;
    const ry = Math.max(2, Math.min((bottom - minY) / 2, rx * 0.5));
    const cy = bottom - ry;
    for (let y = 0; y < frame; y++) {
      for (let x = 0; x < frame; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny > 1) continue;
        const i = ((fy + y) * w + fx + x) * 4;
        if (shadow[i + 3]! !== 0) continue;
        shadow[i] = shadow[color]!;
        shadow[i + 1] = shadow[color + 1]!;
        shadow[i + 2] = shadow[color + 2]!;
        shadow[i + 3] = shadow[color + 3]!;
      }
    }
  }
  return { body, golden, shadow };
}
