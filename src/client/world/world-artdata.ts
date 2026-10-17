// Hand-drawn pixel art for the farm world, as plain data (no DOM) so it can be previewed anywhere.
// One char = one pixel, "." transparent. Light comes from the top-left; outlines are warm darks.

export interface ArtData {
  rows: string[];
  pal: Record<string, string>;
}

const SHADOW = "rgba(40,20,60,0.25)";

// ---------- the farm mailbox (flag down / flag up) ----------

const MAILBOX_PAL = {
  o: "#3a2238",
  H: "#cfe3f5",
  B: "#7d9fca",
  b: "#56739c",
  D: "#3e507a",
  R: "#e2483a",
  r: "#a3292a",
  P: "#5a3a2a",
  W: "#c98a4b",
  w: "#9a5f2e",
  k: "#6b3d1f",
  s: SHADOW,
};

export const MAILBOX: ArtData = {
  rows: [
    "................",
    "................",
    "................",
    "...ooooooooooo..",
    "..oHHHHHHHHHHHo.",
    ".oHHBBBBBBBBBBbo",
    "oDHBBBBBBBBBBBbo",
    "oDBBBBBBBBBBBBbo",
    "oDBBBBBBBRRRRPbo",
    "oDBBBBBBBrrrrbbo",
    "oDbbbbbbbbbbbbbo",
    ".oooooooooooooo.",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    "......okwo......",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    ".....okkWwo.....",
    ".....okkwwo.....",
    "....ssssssss....",
  ],
  pal: MAILBOX_PAL,
};

export const MAILBOX_FLAG_UP: ArtData = {
  rows: [
    ".............RRR",
    ".............RRo",
    ".............Prr",
    "...ooooooooooPo.",
    "..oHHHHHHHHHHPo.",
    ".oHHBBBBBBBBBPbo",
    "oDHBBBBBBBBBBPbo",
    "oDBBBBBBBBBBBPbo",
    "oDBBBBBBBBBBBPbo",
    "oDBBBBBBBBBBBbbo",
    "oDbbbbbbbbbbbbbo",
    ".oooooooooooooo.",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    "......okwo......",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    "......okWo......",
    ".....okkWwo.....",
    ".....okkwwo.....",
    "....ssssssss....",
  ],
  pal: MAILBOX_PAL,
};

// ---------- the town-style calendar billboard ----------

export const BILLBOARD: ArtData = {
  rows: [
    "...oooooooooooooooooooooooo...",
    "..oTTTTTTTTTTTTTTTTTTTTTTTTo..",
    ".oRRRrRRRrRRRrRRRrRRRrRRRrRRo.",
    "orrRRRrRRRrRRRrRRRrRRRrRRRrrro",
    "oooooooooooooooooooooooooooooo",
    "..okkkkkkkkkkkkkkkkkkkkkkkko..",
    "..okWWWWWWWWWWWWWWWWWWWWWWko..",
    "..okWCCCCCCCCCCCCCCCCCCCCwko..",
    "..okWCHHHHHHHHHCCCCNCCCCCwko..",
    "..okWCHhhhhhhhHCCPPPPPPCCwko..",
    "..okWCPPPPPPPPPCCPLLLLPCCwko..",
    "..okWCPLPLPLPLPCCPPPPPPCCwko..",
    "..okWCPPPPPPPPPCCPLLLPPCCwko..",
    "..okWCPLPLPXPLPCCPPPPPPCCwko..",
    "..okWCPPPPPPPPPCCPLLLLPCCwko..",
    "..okWCPLPLPLPLPCCppppppCCwko..",
    "..okWCPPPPPPPPPCCCCCCCCCCwko..",
    "..okWCpppppppppCCCCCCCCCCwko..",
    "..okWCCCCCCCCCCCCCCCCCCCCwko..",
    "..okwwwwwwwwwwwwwwwwwwwwwwko..",
    "..okkkkkkkkkkkkkkkkkkkkkkkko..",
    "..oooooooooooooooooooooooooo..",
    "....okWo..............okWo....",
    "....okWo..............okWo....",
    "....okWo..............okWo....",
    "....okwo..............okwo....",
    "....okWo..............okWo....",
    "....okWo..............okWo....",
    "...okkWwo............okkWwo...",
    "...ssssss............ssssss...",
  ],
  pal: {
    o: "#3b1f12",
    T: "#e8834e",
    R: "#bd4a2e",
    r: "#863220",
    k: "#6b3d1f",
    W: "#d39a5a",
    w: "#8a5229",
    C: "#a86e3c",
    H: "#d6453a",
    h: "#f07a6a",
    P: "#fff4dc",
    p: "#e2cfae",
    L: "#8f8a9a",
    X: "#e8344b",
    N: "#e8344b",
    s: SHADOW,
  },
};

// ---------- "item ready" thought bubble (machines) ----------

export const BUBBLE: ArtData = {
  rows: [
    "...oooooooooooooo...",
    "..oWWWWWWWWWWWWWWo..",
    ".oWWWWWWWWWWWWWWWWo.",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oWWWWWWWWWWWWWWWWWWo",
    "oSWWWWWWWWWWWWWWWWSo",
    ".oSSWWWWWWWWWWWWSSo.",
    "..ooooooSWWSoooooo..",
    "........oSSo........",
    ".........oo.........",
  ],
  pal: { o: "#4a3040", W: "#ffffff", S: "#dcd2ea" },
};
/** Where a 16x16 item icon sits inside BUBBLE. */
export const BUBBLE_ITEM = { x: 2, y: 1 };

// ---------- a letter (mail indicator), sealed with a heart ----------

export const LETTER: ArtData = {
  rows: [
    "ooooooooooooo",
    "oWSWWWWWWWSWo",
    "oWWSWWWWWSWWo",
    "oWWWSWWWSWWWo",
    "oWWWWRWRWWWWo",
    "oWWWWRRRWWWWo",
    "oWWWWWRWWWWWo",
    "oSSSSSSSSSSSo",
    "ooooooooooooo",
  ],
  pal: { o: "#6b4030", W: "#fffaf0", S: "#e6d8c0", R: "#e8344b" },
};

/** A tiny "!" that bounces over the billboard on plan days. */
export const BANG: ArtData = {
  rows: [".ooo.", "oYYYo", "oYYYo", "oYYYo", ".oYo.", ".oYo.", "..o..", ".ooo.", ".oYo.", ".ooo."],
  pal: { o: "#5a1d0a", Y: "#ffd84a" },
};

/** "z" for the sleepy barn. */
export const ZED: ArtData = {
  rows: ["oooo", "..o.", ".o..", "oooo"],
  pal: { o: "#e8f0ff" },
};

// ---------- the farm sign's painting: a tiny sheep ----------

export const MINI_SHEEP: ArtData = {
  rows: [
    "..WW.W....",
    ".WWWWWWkk.",
    "WWWWWWWkKk",
    "wWWWWWWkk.",
    ".wwwwwww..",
    "..k...k...",
  ],
  pal: { W: "#fff8ec", w: "#d9cdbb", k: "#4a3a48", K: "#ffffff" },
};

// ---------- decorations with no real sprite in our sheets ----------

export const PUMPKIN: ArtData = {
  rows: [
    "................",
    ".......oo.......",
    "......oGgo......",
    ".......og.......",
    "...oooooGoooo...",
    "..oLLOOdOOdOOo..",
    ".oLLOOOdOOdOOOo.",
    ".oLffOOdOOdOffo.",
    "oLOfffOdOOdfffOo",
    "oLOOOOOdffdOOOOo",
    "oOOOOOOdffdOOOdo",
    "oOfOOfOOfOOfOOdo",
    "oOffffffffffOOdo",
    ".oOffOffOffOOdo.",
    "..odOOOOOOOddo..",
    "...oooooooooo...",
  ],
  pal: { o: "#4a1f0a", O: "#f08a24", L: "#ffb85a", d: "#c25a14", G: "#6a8a2e", g: "#3e5a1a", f: "#3a1606" },
};
/** The carved face, lit from inside (same rows as PUMPKIN, glowing palette) for night time. */
export const PUMPKIN_LIT: ArtData = {
  rows: PUMPKIN.rows,
  pal: { ...PUMPKIN.pal, O: "#c8681c", L: "#e08a34", d: "#94400e", f: "#fff0a0" },
};

export const GNOME: ArtData = {
  rows: [
    ".....oo.....",
    ".....oRo....",
    "....oRRo....",
    "....oRRro...",
    "...oRRRro...",
    "...oHRRRro..",
    "..oHRRRRrro.",
    "..ooooooooo.",
    "..oSSSNSSo..",
    "..oSSNNSSo..",
    "..oWWWWWWWo.",
    ".oBWWWWWWWBo",
    ".oBBWWWWWBBo",
    ".oSBBWWWBBSo",
    ".okkkkYkkkko",
    ".oBBBBBBBBbo",
    "..oBBBoBBbo.",
    "..oKKKoKKKo.",
    "..ooooooooo.",
    "..sssssssss.",
  ],
  pal: {
    o: "#3a1e2a",
    R: "#e0402e",
    r: "#a82424",
    H: "#ff8a6a",
    S: "#f6c8a0",
    N: "#e89a7a",
    W: "#fafaf4",
    B: "#4a78c8",
    b: "#33549a",
    k: "#6b3d1f",
    Y: "#ffd84a",
    K: "#5a3624",
    s: SHADOW,
  },
};

/** Flame frames for when the real animations sheet is missing (campfire). */
export const FLAME: ArtData[] = [
  {
    rows: ["....r.....", "...rO.....", "...rOr..r.", "..rOYOr.r.", "..rOYYOr..", ".rOYWYOr..", ".rOYWWYOr.", ".rOYWWYOr.", "..rOYYOr..", "...rrrr..."],
    pal: { r: "#d8361e", O: "#ff8a1f", Y: "#ffd23a", W: "#fff6c0" },
  },
  {
    rows: [".....r....", ".....Or...", "..r.rOr...", "..rrOYOr..", ".rOOYYOr..", ".rOYWYOr..", "rOYWWWYOr.", ".rOYWWYOr.", "..rOYYOr..", "...rrrr..."],
    pal: { r: "#d8361e", O: "#ff8a1f", Y: "#ffd23a", W: "#fff6c0" },
  },
  {
    rows: ["...r......", "...Or..r..", "..rOr.rO..", "..rOYOrO..", ".rOYYYOr..", ".rOYWYYOr.", ".rOYWWYOr.", "rOYWWWYOr.", "..rOYYOr..", "...rrrr..."],
    pal: { r: "#d8361e", O: "#ff8a1f", Y: "#ffd23a", W: "#fff6c0" },
  },
];

// ---------- fallbacks for machines (used only if craftables.png is missing) ----------

export const LOOM_FALLBACK: ArtData = {
  rows: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "....oooooooo....",
    "...oWWWWWWwwo...",
    "..oWkWoWWoWkwo..",
    "..oWWkWWWkWWwo..",
    "..oWoWkWkWoWwo..",
    "..oWWWWkWWWWwo..",
    "..oWoWkWkWoWwo..",
    "..oWWkWWWkWWwo..",
    "..owkWoWWoWkwo..",
    "...owwwwwwwwo...",
    "....oooWwooo....",
    ".....oWWwwo.....",
    "....oWWWWwwo....",
    "....oWWWWwwo....",
    "...oWWWWWWwwo...",
    "...oWWWWWWwwo...",
    "...oWWWooWwwo...",
    "...oWWWooWwwo...",
    "...owwwwwwwwo...",
    "...ossssssss o..",
    "................",
    "................",
    "................",
    "................",
  ],
  pal: { o: "#3b1f12", W: "#d39a5a", w: "#8a5229", k: "#5a3624", s: SHADOW },
};

export const CHEST_FALLBACK: ArtData = {
  rows: [
    "..oooooooooooo..",
    ".oWWWWWWWWWWWwo.",
    "oWWWWWWWWWWWWwwo",
    "oGGGGGGGGGGGGGGo",
    "oWWWWWWYYWWWWwwo",
    "oooooooYYooooooo",
    "owwwwwwwwwwwwwwo",
    "oWWWWWWWWWWWWwwo",
    "oGGGGGGGGGGGGGGo",
    "oWWWWWWWWWWWWwwo",
    "oWWWWWWWWWWWWwwo",
    "owwwwwwwwwwwwwwo",
    "oooooooooooooooo",
    ".ssssssssssssss.",
  ],
  pal: { o: "#3b1f12", W: "#d38a3a", w: "#9a5a22", G: "#5a5a6a", Y: "#ffd84a", s: SHADOW },
};

// ---------- fall: the golden ginkgo's fan-shaped leaves ----------

const GINKGO_PAL = { o: "#8a5a12", L: "#fff3a0", M: "#ffd94a", D: "#e9ab2f", s: "#7a5418" };

/** A ginkgo leaf: a little fan, notched at the top, on a long stem. */
export const GINKGO_LEAF: ArtData = {
  rows: [
    ".ooooooo.",
    "oLLLoMMMo",
    "oLLLLMMDo",
    ".oLLMDDo.",
    "..oLMDo..",
    "...oDo...",
    "....s....",
    "....s....",
  ],
  pal: GINKGO_PAL,
};

/** The same leaf turned edge-on mid-tumble (same cell size, so it stays centred). */
export const GINKGO_LEAF_EDGE: ArtData = {
  rows: [".........", "....o....", "...oLo...", "...oMo...", "...oDo...", "....o....", "....s....", "....s...."],
  pal: GINKGO_PAL,
};

/** A smaller one (the golden carpet under the tree, and some of the shower). */
export const GINKGO_LEAF_SMALL: ArtData = {
  rows: [".ooooo.", "oLLoMMo", ".oLMDo.", "..oDo..", "...s...", "...s..."],
  pal: GINKGO_PAL,
};

/** Spring and summer's fans: the same leaves, still green. */
export const GINKGO_GREEN_PAL = { o: "#2f5a1a", L: "#c8ec7a", M: "#8acb48", D: "#5a9a30", s: "#4a3a18" };

/** The Ginkgo Leaf in the chest: a big golden fan, veined, notched at the top. */
export const GINKGO_LEAF_ITEM: ArtData = {
  rows: [
    "oooooo..oooooo",
    "oLLLLLooMMMMDo",
    ".oLDLLLMMDMDo.",
    ".oLLDLLMDMMDo.",
    "..oLDLLMDMDo..",
    "..oLLDLMDDDo..",
    "...oLDLMDDo...",
    "...oLLDMDDo...",
    "....oLMDDo....",
    ".....oMDo.....",
    "......os......",
    "......s.......",
    "......s.......",
    ".....s........",
  ],
  pal: GINKGO_PAL,
};
