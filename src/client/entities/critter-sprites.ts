// Hand-drawn critter pixel art as plain data (one char = one pixel, "." = transparent).
// Kept import-free on purpose so it can be previewed outside the browser.

export type Pal = Record<string, string>;
export interface PixelSprite {
  rows: string[];
  pal: Pal;
}

export const FOX_PAL: Pal = {
  o: "#4a1e12", // outline
  O: "#e3692a", // fur
  L: "#f6974a", // fur highlight
  D: "#b04a1e", // fur shade
  C: "#fff3dc", // cream
  c: "#ead0a8", // cream shade
  K: "#3b2220", // dark socks / ear backs
  k: "#5d3a30",
  e: "#24120c", // eye (top)
  E: "#24120c", // eye (bottom)
  n: "#2a1410", // nose
  b: "#ff8f7a", // blush
  W: "#fffaf0", // tail tip
  w: "#e2d8c6",
  g: "#3f7a34", // grass (dive)
  G: "#5f9e45",
  v: "#86c05a",
};

export const HOG_PAL: Pal = {
  o: "#3a2418", // outline
  S: "#5e3f2b", // spines dark
  s: "#8a6444", // spines
  t: "#c7a47a", // spine tips
  F: "#f8e0bb", // face
  f: "#dfbb8d", // face shade
  e: "#1e120c",
  n: "#1e120c",
  b: "#f59a8a", // blush
  K: "#6a4632", // feet
};

export const ACC_PAL: Pal = {
  o: "#4a1420", // outline
  R: "#d8343c", // knit red
  r: "#a51f2e",
  W: "#fff4e4", // knit cream
  w: "#e4cfb4",
  Y: "#ffd34a", // fringe
  K: "#1e1a24", // sunglasses
  k: "#3c3650",
  G: "#ffffff",
  L: "#e8742a", // fall leaf
  l: "#ffad45",
  d: "#9c3b12",
  P: "#ff8fc0", // spring flower
  p: "#e0559a",
  C: "#ffe066",
  s: "#5a9a3a", // stem
};

export const STUMP_PAL: Pal = {
  o: "#3e2412",
  T: "#e6b276", // cut wood
  t: "#c98a4c", // rings
  r: "#a0663a",
  H: "#231109", // hollow
  h: "#4a2a16",
  B: "#8a5530", // bark
  b: "#663a1c",
  X: "#ad7444",
  M: "#5f9e45", // moss
  m: "#3f7a34",
  N: "#9ccf6a",
  S: "#ffffff", // snow
  s: "#dfe8f5",
};

export const DECO_PAL: Pal = {
  o: "#4a2016",
  R: "#e0453a", // red
  r: "#a82a2a",
  W: "#fff4e0", // cream
  w: "#e8d2b0",
  P: "#f2a08c", // red x cream
  F: "#f6e3c0", // fringe
  C: "#f3dcb0", // mushroom stem
  c: "#d4b48a",
  L: "#e8742a", // leaves
  l: "#ffad45",
  y: "#f2c84a",
  d: "#b5421c",
  b: "#7a2e18",
  B: "#6b8fe0", // blue flower
  Y: "#ffe066",
  g: "#3f7a34",
  G: "#5f9e45",
  v: "#86c05a",
};

/** Red & cream gingham picnic blanket, w x h, with fringe on the short ends. */
function gingham(w: number, h: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const edgeX = x === 0 || x === w - 1;
      if (edgeX) {
        row += y > 0 && y < h - 1 && y % 2 === 1 ? "F" : ".";
        continue;
      }
      if (y === 0 || y === h - 1 || x === 1 || x === w - 2) {
        row += "o";
        continue;
      }
      if (y === h - 2) {
        row += "r";
        continue;
      }
      const sx = Math.floor((x - 2) / 2) % 2 === 0;
      const sy = Math.floor((y - 1) / 2) % 2 === 0;
      row += sx && sy ? "R" : sx || sy ? "P" : "W";
    }
    rows.push(row);
  }
  return rows;
}

export const BUTTERFLY_PAL: Pal = { o: "#2a1a24", A: "#fff6e8", a: "#c9b6e4" };
export const CROW_PAL: Pal = {
  o: "#100c1a",
  B: "#2a2840",
  b: "#4a4a6c",
  e: "#e6e0f0",
  y: "#6c6a7e",
  K: "#56546a",
};
export const BUNNY_PAL: Pal = {
  o: "#3a2414",
  B: "#a77c52",
  b: "#7d5634",
  c: "#ecd9b6",
  p: "#eba7a0",
  W: "#fffaf2",
  e: "#1e120c",
  n: "#e47f86",
  K: "#6d4a2c",
};
export const FROG_PAL: Pal = { o: "#1f3a18", G: "#6cbc4a", g: "#4a9334", y: "#d8e88a", e: "#101810", W: "#ffffff" };
export const JUNIMO_PAL: Pal = {
  o: "#1d3a1a",
  J: "#7ad25a",
  j: "#58aa3e",
  h: "#b4f08c",
  e: "#141414",
  l: "#4aa838",
  L: "#8be06a",
  s: "#3c7a2c",
};
export const FX_PAL: Pal = { Y: "#ffe27a", W: "#ffffff", y: "#ffb43c", P: "#ff9ad8" };
export const STARDROP_PAL: Pal = {
  o: "#3a1250",
  L: "#f4c4ff",
  P: "#c060ec",
  p: "#8a34c4",
  q: "#5e1f94",
  W: "#ffffff",
  Q: "#ff8ae0",
};
export const WITCH_PAL: Pal = {
  D: "#1c1228",
  d: "#3a2852",
  G: "#86d46e",
  Y: "#5c3e24",
  y: "#a8844a",
  e: "#ffe066",
};
export const JACK_PAL: Pal = {
  o: "#4a1a08",
  O: "#e8781e",
  D: "#b4520e",
  Y: "#ffe27a",
  y: "#ffb43c",
  g: "#4a7a2a",
  G: "#6aa83a",
};
export const GIFT_PAL: Pal = { o: "#2a1a24", G: "#3fae6a", g: "#2a8250", R: "#e0383c", r: "#a82230", Y: "#ffe27a" };
export const BOUQUET_PAL: Pal = {
  o: "#3a1a2a",
  P: "#ff8fbf",
  p: "#d85a96",
  Y: "#ffe066",
  y: "#e8b830",
  B: "#7aa8ff",
  b: "#4a74d8",
  G: "#5f9e45",
  g: "#3f7a34",
  W: "#fff6ea",
  w: "#e6d4bc",
  R: "#e0383c",
};
export const CLOVER_PAL: Pal = { o: "#1f4a1a", L: "#a2ec7a", G: "#68c84a", g: "#34802a", v: "#e2ffc4", s: "#2f6e26" };
export const CAT_PAL: Pal = { o: "#2a2026", C: "#8a7f80", c: "#6a5f62", W: "#e8ddd0", e: "#1a1418", n: "#f08a9a" };

export const SNOWMAN_PAL: Pal = {
  o: "#4a5a7a",
  W: "#ffffff",
  w: "#d6e2f2",
  e: "#1e1a24",
  n: "#ff8a2a",
  R: "#d8343c",
  r: "#a51f2e",
  k: "#5a3a2a",
};

export const SPRITES: Record<string, PixelSprite> = {
  "fox.lie.0": {
    pal: FOX_PAL,
    rows: [
      "...................o...o........",
      "..................oKo.oKo.......",
      "..................oKCooKCo......",
      ".................oKCCOOKCCo.....",
      ".................oOOOOOOOOOo....",
      "................oLLOOOOOOOOOo...",
      "................oLOOOOOOOeOOOo..",
      "................oOOOOOOOOEOCCCoo",
      ".........ooooo..oOOOOOObCCCCCCCn",
      "..oooo..oLLLOOooOOOOOCCCCCCCoon.",
      ".oLLOOoooLOOOOOOOOOOoCCCCCCCo...",
      "oLOOOOOOoOOOOOOOOOOOOoCCCCCo....",
      "oWLOOOOOOoOOOOOOOOOOOOoCCCo.....",
      "oWWOOOOOOOoOOOOOOOOOODcCCCo.....",
      "oWWWDOOOOODoDOOOOOODDDoKKKKKKo..",
      ".owWWDDDDDDooDDDDDDDDoKkKKKKkKo.",
      "..ooooooooo..ooooooooooooooooo..",
    ],
  },
  "fox.sit.0": {
    pal: FOX_PAL,
    rows: [
      ".........o...o..........",
      "........oKo.oKo.........",
      "........oKCooKCo........",
      ".......oKCCOOKCCo.......",
      ".......oOOOOOOOOOo......",
      "......oLLOOOOOOOOOo.....",
      "......oLOOOOOOOeOOOo....",
      "......oOOOOOOOOEOCCCoo..",
      "......oOOOOOObCCCCCCCn..",
      ".......oOOOOCCCCCCCoon..",
      "......ooOOOoCCCCCCo.....",
      ".....oLOOOOOoCCCCo......",
      "....oLOOOOOOoCCCCo......",
      "....oOOOOOOOOCCCCo......",
      "...oOOOOOOOOOCCCco......",
      "...oOOOOOOOODcCcKo......",
      "...oOOOOOOODDoKKKo......",
      "..ooDOOOOODDoKKoKo......",
      ".oLOoDDDDDDoKKKoKKo.....",
      "oLOOOooooooooooooooo....",
      "oLOOOOOOOOOOOOOOWWWWo...",
      "oDOOOOOOOOOOOOOWWWWWWo..",
      ".oDDDDDDDDDDDDDDWWwwo...",
      "..oooooooooooooooooo....",
    ],
  },
  "fox.sit.1": {
    pal: FOX_PAL,
    rows: [
      ".........o...o..........",
      "........oKo.oKo.........",
      "........oKCooKCo........",
      ".......oKCCOOKCCo.......",
      ".......oOOOOOOOOOo......",
      "......oLLOOOOOOOOOo.....",
      "......oLOOOOOOOeOOOo....",
      "......oOOOOOOOOEOCCCoo..",
      "......oOOOOOObCCCCCCCn..",
      ".......oOOOOCCCCCCCoon..",
      "......ooOOOoCCCCCCo.....",
      ".....oLOOOOOoCCCCo......",
      "....oLOOOOOOoCCCCo......",
      "....oOOOOOOOOCCCCo......",
      "...oOOOOOOOOOCCCco......",
      "...oOOOOOOOODcCcKo......",
      "...oOOOOOOODDoKKKo..oo..",
      "..ooDOOOOODDoKKoKo.oWWo.",
      ".oLOoDDDDDDoKKKoKKoWWWWo",
      "oLOOOooooooooooooooWWWwo",
      "oLOOOOOOOOOOOOOOOOOWWwo.",
      "oDOOOOOOOOOOOOOOOOOOwo..",
      ".oDDDDDDDDDDDDDDDDDoo...",
      "..oooooooooooooooooo....",
    ],
  },
  "fox.sleep.0": {
    pal: FOX_PAL,
    rows: [
      "......oooooooo......",
      "....ooLLLLOOOOoo....",
      "...oLLOOOOOOOOOOo...",
      "..oLOOOOOOOOOOOOOo..",
      ".oLOOOoOOOOOOoOOOOo.",
      ".oOOOoKoOOOOoKoOOOo.",
      "oOOOoKCKooooKCKoOOOo",
      "oOOOoOOOOOOOOOOoOOOo",
      "oDOoOEEOOOOOOEEOoODo",
      "oDOoCbCCCnnCCCbCoWWo",
      "oDDoCCCCCCCCCCCoWWWo",
      ".oDDoCCCCCCCCCoWWWo.",
      "..ooDooooooooooWWoo.",
      "....ooooooooooooo...",
    ],
  },
  "hedgehog.idle.0": {
    pal: HOG_PAL,
    rows: [
      ".....o.o.o.......",
      "...o.otototo.....",
      "..otososososo....",
      ".otsSsSsSsSsso...",
      "otsSsSsSsSsSsoo..",
      "osSsSsSsSsSsoFFo.",
      "otSsSsSsSsSoFFeFo",
      "osSsSsSsSsoFFFFFFo",
      "oSsSsSsSsSoFbFFFFn",
      ".oSSSSSSSoffFFFFoo",
      "..ooKKooooKKoooo..",
      "...oKo....oKo.....",
    ],
  },
  "fox.walk.0": {
    pal: FOX_PAL,
    rows: [
      "....................o...o........",
      "...................oKo.oKo.......",
      "...................oKCooKCo......",
      "..................oKCCOOKCCo.....",
      "..................oOOOOOOOOOo....",
      ".................oLLOOOOOOOOOo...",
      ".................oLOOOOOOOeOOOo..",
      ".................oOOOOOOOOEOCCCoo",
      "..........ooooooooOOOOOObCCCCCCCn",
      ".........oLLLLLLLLOOOOCCCCCCCoon.",
      "........oLOOOOOOOOOOOOoCCCCCCo...",
      "..oooooOOOOOOOOOOOOOOOOoCCCCo....",
      ".oLLLLOoOOOOOOOOOOOOOOOOCCCo.....",
      "oWLOOOOOoOOOOOOOOOOOOODcCo.......",
      "oWWOOOOOOoDOOOOOOOOODDco.........",
      ".oWWWDDDDDoDDDDDDDDDDDo..........",
      ".....ooooKKKoooooooKKKo..........",
      "........oKKoKo....oKKoKo.........",
      ".......oKKo.oKo..oKKo.oKo........",
      ".......okko..oko.okko..oko.......",
      ".......oooo..ooo.oooo..ooo.......",
    ],
  },
  "fox.walk.1": {
    pal: FOX_PAL,
    rows: [
      "....................o...o........",
      "...................oKo.oKo.......",
      "...................oKCooKCo......",
      "..................oKCCOOKCCo.....",
      "..................oOOOOOOOOOo....",
      ".................oLLOOOOOOOOOo...",
      ".................oLOOOOOOOeOOOo..",
      ".................oOOOOOOOOEOCCCoo",
      "..........ooooooooOOOOOObCCCCCCCn",
      ".........oLLLLLLLLOOOOCCCCCCCoon.",
      "........oLOOOOOOOOOOOOoCCCCCCo...",
      "..oooooOOOOOOOOOOOOOOOOoCCCCo....",
      ".oLLLLOoOOOOOOOOOOOOOOOOCCCo.....",
      "oWLOOOOOoOOOOOOOOOOOOODcCo.......",
      "oWWOOOOOOoDOOOOOOOOODDco.........",
      ".oWWWDDDDDoDDDDDDDDDDDo..........",
      ".....oooooKKKooooooKKKo..........",
      ".........oKKKo.....oKKKo.........",
      ".........oKKKo.....oKKKo.........",
      ".........okkko.....okkko.........",
      ".........ooooo.....ooooo.........",
    ],
  },
  "fox.leap": {
    pal: FOX_PAL,
    rows: [
      "....................o...o........",
      "...................oKo.oKo.......",
      "...................oKCooKCo......",
      "..................oKCCOOKCCo.....",
      "..................oOOOOOOOOOo....",
      ".................oLLOOOOOOOOOo...",
      ".................oLOOOOOOOeOOOo..",
      ".................oOOOOOOOOEOCCCoo",
      "..........ooooooooOOOOOObCCCCCCCn",
      ".........oLLLLLLLLOOOOCCCCCCCoon.",
      "........oLOOOOOOOOOOOOoCCCCCCo...",
      "..oooooOOOOOOOOOOOOOOOOoCCCCo....",
      ".oLLLLOoOOOOOOOOOOOOOOOOCCCo.....",
      "oWLOOOOOoOOOOOOOOOOOOODcCo.......",
      "oWWOOOOOOoDOOOOOOOOODDco.........",
      ".oWWWDDDDDoDDDDDDDDDDDo..........",
      ".....oooooooooooooooooKKo........",
      ".......oKKKo..........oKKo.......",
      "......oKKKo............oKko......",
      ".....okko...............ooo......",
      ".....ooo.........................",
    ],
  },
  "fox.dive.0": {
    pal: FOX_PAL,
    rows: [
      ".........oo......",
      "........oWWo.....",
      "........oWWWo....",
      "........owWWo....",
      "..oo....oLOOo....",
      ".oKKo..oLOOo.....",
      ".okKo.oLOOOo..oo.",
      "..okKoOOOOo..oKKo",
      "...oKOOOOOOooKKo.",
      "...oOOOOOOOOOKo..",
      "...oLOOOOOOOOo...",
      "...oLOOOOOOOOo...",
      "...oOOOOOOOODo...",
      "...oOOOOOOODDo...",
      "..voDOOOOOODDov..",
      ".vGGoDDDDDDoGGv..",
      "vGGgGvGGGgGGgGGv.",
      "GgGGGgGGGGgGGGgG.",
    ],
  },
  "fox.dive.1": {
    pal: FOX_PAL,
    rows: [
      "..........oo.....",
      ".........oWWo....",
      "........oWWWo....",
      "........owWWo....",
      "..oo....oLOOo....",
      ".oKKo..oLOOo.....",
      ".okKo.oLOOOo..oo.",
      "..okKoOOOOo..oKKo",
      "...oKOOOOOOooKKo.",
      "...oOOOOOOOOOKo..",
      "...oLOOOOOOOOo...",
      "...oLOOOOOOOOo...",
      "...oOOOOOOOODo...",
      "...oOOOOOOODDo...",
      "..voDOOOOOODDov..",
      ".vGGoDDDDDDoGGv..",
      "vGGgGvGGGgGGgGGv.",
      "GgGGGgGGGGgGGGgG.",
    ],
  },
  "hedgehog.walk.1": {
    pal: HOG_PAL,
    rows: [
      ".....o.o.o.......",
      "...o.otototo.....",
      "..otososososo....",
      ".otsSsSsSsSsso...",
      "otsSsSsSsSsSsoo..",
      "osSsSsSsSsSsoFFo.",
      "otSsSsSsSsSoFFeFo",
      "osSsSsSsSsoFFFFFFo",
      "oSsSsSsSsSoFbFFFFn",
      ".oSSSSSSSoffFFFFoo",
      "..oKKoooooooKKoo..",
      "..oKo.......oKo...",
    ],
  },
  "hedgehog.sniff.1": {
    pal: HOG_PAL,
    rows: [
      ".....o.o.o.......",
      "...o.otototo.....",
      "..otososososo....",
      ".otsSsSsSsSsso...",
      "otsSsSsSsSsSsoo..",
      "osSsSsSsSsSsoFFo.",
      "otSsSsSsSsSoFFeFoo",
      "osSsSsSsSsoFFFFFFn",
      "oSsSsSsSsSoFbFFFoo",
      ".oSSSSSSSoffFFFFo.",
      "..ooKKooooKKoooo..",
      "...oKo....oKo.....",
    ],
  },
  "hedgehog.ball.0": {
    pal: HOG_PAL,
    rows: [
      ".....o.o.o......",
      "...o.ototoo.o...",
      "..otososososto..",
      ".otsSsSsSsSsSso.",
      "otsSsSsSsSsSsSto",
      ".osSsSsSsSsSsSo.",
      "otSsSsSsSsSsSsto",
      ".osSsSsSsSsSsSo.",
      "otSsSsSsSsSsSSto",
      ".oSSsSsSsSsSSo..",
      "..ooSSSSSSSSoo..",
      "....oooooooo....",
    ],
  },
  "hedgehog.peek": {
    pal: HOG_PAL,
    rows: [
      ".....o.o.o......",
      "...o.ototoo.o...",
      "..otososososto..",
      ".otsSsSsSsSsSso.",
      "otsSsSsSsSsSsSto",
      ".osSsSsSsSsSsSo.",
      "otSsSsSsSsSsoooo",
      ".osSsSsSsSsoFeFn",
      "otSsSsSsSsSoFFoo",
      ".oSSsSsSsSsSoo..",
      "..ooSSSSSSSSoo..",
      "....oooooooo....",
    ],
  },
  "hedgehog.sleep.0": {
    pal: HOG_PAL,
    rows: [
      "....o.o.o........",
      "..o.otototo......",
      ".otososososo.....",
      "otsSsSsSsSsso....",
      "osSsSsSsSsSsoo...",
      "otSsSsSsSsSoFFo..",
      "osSsSsSsSsoFFFFo.",
      "oSsSsSsSsSoFeeFFo",
      "oSsSsSsSsoFbFFFFn",
      ".oSSSSSSSoffFFFo.",
      "..ooooooooooooo..",
    ],
  },
  "fox.scarf": {
    pal: ACC_PAL,
    rows: [
      ".ooooooooooo..",
      "oRRrRRrRRrRRo.",
      "orRRrRRrRRrRRo",
      ".oooooooRRrRo.",
      "........oRrRo.",
      "........orRRo.",
      "........oYYYo.",
      ".........oYo..",
    ],
  },
  "fox.scarf.ball": {
    pal: ACC_PAL,
    rows: [
      ".oooooooooooo.",
      "oRRrRRrRRrRRro",
      "orRRrRRrRRrRRo",
      ".ooooooooooRro",
      "..........oYYo",
      "...........oo.",
    ],
  },
  "fox.shades": {
    pal: ACC_PAL,
    rows: [
      "..ooooo..",
      "....oKGKo",
      "....oKKKo",
      ".....ooo.",
    ],
  },
  "hedgehog.hat": {
    pal: ACC_PAL,
    rows: [
      "...oo...",
      "..oWWo..",
      "..owWo..",
      ".oRRRRo.",
      "oRrRrRro",
      "oWWWWWWo",
      ".oooooo.",
    ],
  },
  "hedgehog.leaf": {
    pal: ACC_PAL,
    rows: [
      "...o...",
      "..oLo..",
      ".oLlLo.",
      "oLlLLLo",
      ".oLdLo.",
      "..odo..",
      "...d...",
    ],
  },
  "hedgehog.flower": {
    pal: ACC_PAL,
    rows: [
      ".oo.oo.",
      "oPPoPPo",
      ".oPCPo.",
      "oPPoPpo",
      ".oo.oo.",
    ],
  },
  "critter.stump": {
    pal: STUMP_PAL,
    rows: [
      ".......oooooooooo.......",
      ".....ooTTTTTTTTTToo.....",
      "....oTTttttttttttTTo....",
      "...oTttoooooooooottTo...",
      "...oTtohhhhhhhhhhotTo...",
      "..oTTtoHHHHHHHHHHottTo..",
      "..oTtroHHHHHHHHHHorttTo.",
      "..oNTtrooooooooooorttMo.",
      "..oMNTTttttrttttttTTMMo.",
      "..oMMNNTTTTTTTTTTTNNMmo.",
      "..obMmMNoooooooooMMMmbo.",
      "..obXmMXbBBXBbBXBBmbXbo.",
      "..obXBmXbBBXBbBXBBbXbbo.",
      "..obXBBXbBBXBbBXBBbXbbo.",
      ".oobXBBXbBBXBbBXBBbXbboo",
      "oXbbXBBXbBBXBbBXBBbXbbXo",
      "oXXbooXXbBXooobXXoobXXXo",
      ".ooo..oooooo..oooo..ooo.",
    ],
  },
  "critter.blanket": { pal: DECO_PAL, rows: gingham(30, 11) },
  "critter.mushroom": {
    pal: DECO_PAL,
    rows: [
      ".oooo.",
      "oRWRRo",
      "oRRRWo",
      "orrrro",
      ".oCco.",
      ".oCco.",
      "..oo..",
    ],
  },
  "critter.leaves": {
    pal: DECO_PAL,
    rows: [
      "......oo..oo........",
      "....ooLloolLoo......",
      "...oyLLdoLlLyLoo....",
      "..olLyLLoLdLLlLLo...",
      ".oLLdLlLyLLlLdLyLo..",
      "oyLlLLdLLlLyLLlLLLo.",
      "oLdLyLLlLdLLyLdLlLLo",
      ".ooooooooooooooooooo",
    ],
  },
  "critter.flowers": {
    pal: DECO_PAL,
    rows: [
      "..o......o..",
      ".oYo....oBo.",
      "oYcYo..oBYBo",
      ".oYo....oBo.",
      "..g..o...g..",
      "..g.oRo..g..",
      ".vg..g...gv.",
      ".GGvgGg.vGG.",
    ],
  },
  "critter.butterfly.0": {
    pal: BUTTERFLY_PAL,
    rows: [
      ".AA.AA.",
      "AaAoAaA",
      ".AAoAA.",
      "..A.A..",
    ],
  },
  "critter.butterfly.1": {
    pal: BUTTERFLY_PAL,
    rows: [
      "..A.A..",
      "..AoA..",
      "...o...",
    ],
  },
  "critter.crow.stand": {
    pal: CROW_PAL,
    rows: [
      "......ooo.....",
      ".....oBbBo....",
      ".....oBBeBoo..",
      ".....oBBBByyo.",
      "..ooooBBBBoo..",
      ".obbBBBBBBo...",
      "obBBBBBBBBo...",
      "oBBBBBBBBBo...",
      ".ooBBBBBBo....",
      "...ooKoKoo....",
      "....oKoKo.....",
      "...ooo.ooo....",
    ],
  },
  "critter.crow.peck": {
    pal: CROW_PAL,
    rows: [
      "...............",
      "...............",
      "..ooooo........",
      ".obbBBBoooo....",
      "obBBBBBBBBBo...",
      "oBBBBBBBBBBBo..",
      ".ooBBBBBBBeBo..",
      "...oBBBBBBBByyo",
      "...ooKoKoooyo..",
      "....oKoKo......",
      "...ooo.ooo.....",
    ],
  },
  "critter.crow.fly.0": {
    pal: CROW_PAL,
    rows: [
      "..oo.......oo.....",
      "..oBo.....oBo.....",
      "...oBo...oBbo.....",
      "....oBo.oBbo..ooo.",
      ".ooooBBoBBo..oBeBo",
      "obbBBBBBBBBBBBBByo",
      ".oooooBBBBBBBoo...",
      "......ooooooo.....",
    ],
  },
  "critter.crow.fly.1": {
    pal: CROW_PAL,
    rows: [
      ".............ooo..",
      "............oBeBo.",
      ".ooooooooooBBBByyo",
      "obbBBBBBBBBBBBoo..",
      ".ooooBBBBBBBBo....",
      "....oBbBooBbBo....",
      "...oBbo....oBbo...",
      "..oBo.......oBo...",
      "..oo.........oo...",
    ],
  },
  "critter.bunny.sit": {
    pal: BUNNY_PAL,
    rows: [
      ".........oo.oo",
      "........oBpoBo",
      "........oBpoBo",
      ".........oBBo.",
      "....ooooBBBBo.",
      "...oBBBBBBeBo.",
      "..oBBBBBBBBBBn",
      ".oWBBBBBBBBBo.",
      ".oWBBBBBBccoo.",
      ".obBBBBBBBco..",
      "..ooBKoooKKo..",
      "...ooo...ooo..",
    ],
  },
  "critter.bunny.hop": {
    pal: BUNNY_PAL,
    rows: [
      "..........ooo...",
      ".........oBpBoo.",
      "..........oBpBBo",
      "....oooooooBBBBo",
      "..ooBBBBBBBBBeBo",
      ".oWBBBBBBBBBBBBn",
      "oWWBBBBBBBBBBco.",
      ".obbBBBBBBBccoo.",
      "..oKKoooooKKo...",
      ".oKKo.....oKo...",
      ".ooo.......oo...",
    ],
  },
  "critter.frog.sit": {
    pal: FROG_PAL,
    rows: [
      "..oo.oo..",
      ".oeWoeWo.",
      ".oGGGGGo.",
      "oGgGGGgGo",
      "oGGyyyGGo",
      "ooGoooGoo",
    ],
  },
  "critter.frog.jump": {
    pal: FROG_PAL,
    rows: [
      "..oo.oo...",
      ".oeWoeWo..",
      ".oGGGGGGo.",
      "oGGyyyGGGo",
      ".ooGGGGoo.",
      ".oGo..oGo.",
      "oGo....oGo",
    ],
  },
  "junimo.green.0": {
    pal: JUNIMO_PAL,
    rows: [
      "....oo.....",
      "...oLlo....",
      "....os.....",
      "..ooooooo..",
      ".oJhhJJJJo.",
      "oJhJJJJJJJo",
      "oJJeJJJeJJo",
      "oJJeJJJeJJo",
      "oJJJJJJJJJo",
      ".ojJJJJJjo.",
      "..ojjjjjo..",
      "..oo...oo..",
    ],
  },
  "junimo.green.1": {
    pal: JUNIMO_PAL,
    rows: [
      "............",
      ".....oo.....",
      "....oLlo....",
      ".....os.....",
      ".oooooooooo.",
      "oJhhJJJJJJJo",
      "oJJJeJJJeJJo",
      "oJJJeJJJeJJo",
      "ojJJJJJJJJjo",
      ".ojjjjjjjjo.",
      ".oo......oo.",
    ],
  },
  "junimo.green.2": {
    pal: JUNIMO_PAL,
    rows: [
      "....oo.....",
      "...oLlo....",
      "....os.....",
      "..ooooooo..",
      "oooJhJJJJooo",
      "oJoJJJJJJoJo",
      ".ooeJJJeJoo.",
      "..oeJJJeJo..",
      "..oJJJJJJo..",
      "...ojjjjo...",
      "...oJ..Jo...",
      "...oo..oo...",
    ],
  },
  "fx.sparkle.0": {
    pal: FX_PAL,
    rows: [
      "..Y..",
      "..Y..",
      "YYWYY",
      "..Y..",
      "..Y..",
    ],
  },
  "fx.sparkle.1": {
    pal: FX_PAL,
    rows: [
      ".Y.",
      "YWY",
      ".Y.",
    ],
  },
  "fx.heart": {
    pal: FX_PAL,
    rows: [
      ".PP.PP.",
      "PPPPPPP",
      "PPPPPPP",
      ".PPPPP.",
      "..PPP..",
      "...P...",
    ],
  },
  "item.stardrop": {
    pal: STARDROP_PAL,
    rows: [
      ".......oo.......",
      "......oLPo......",
      "......oLPo......",
      ".....oLPPPo.....",
      ".....oLPPpo.....",
      "ooooooLPPPpooooo",
      "oLLLLPPPPPPPPppo",
      ".oLLPWWPPPPPPpo.",
      "..oLPWQPPPQPpo..",
      "...oPPPPPQQPpo..",
      "...oPPPPPPPPpo..",
      "..oPPPpqqPPPPpo.",
      "..oPPpo..oPPPpo.",
      ".oPPpo....oPppo.",
      ".oPpo......oqpo.",
      ".ooo........ooo.",
    ],
  },
  "critter.witch": {
    pal: WITCH_PAL,
    rows: [
      "...............DD.................",
      ".............DDDd.................",
      "...........DDDDDD.................",
      "..........DDDDDDDD................",
      "............DDDDDDDD..............",
      ".............DDDDDDDDDD...........",
      "................DDDDD.............",
      ".........DDDDDDDDDDDDGG...........",
      "......DDDDDDDDDDDDDDDDG...........",
      "....DDDDDDDDDDDDDDDDDD............",
      "..DDDDDDDDDDDDDDDDDDD.............",
      "yyYYYYYYYYYYYYYYYYYYYYYYYYYYYYY...",
      "yYyyy...DDDD....DDD...............",
      "yyy......DD......DD...............",
    ],
  },
  "world.jack.lit": {
    pal: JACK_PAL,
    rows: [
      "......og......",
      ".....oGo......",
      "..ooooooooo...",
      ".oOOoDOOoDOo..",
      "oOOYYoOOYYoOo.",
      "oOOYyoOOYyoOOo",
      "oDOOOOyYOOODOo",
      "oOYoYyYYyoYODo",
      "oOOYYoYoYYODOo",
      ".oOOOOoOOODOo.",
      "..oooooooooo..",
    ],
  },
  "world.jack": {
    pal: JACK_PAL,
    rows: [
      "......og......",
      ".....oGo......",
      "..ooooooooo...",
      ".oOOoDOOoDOo..",
      "oOOooOOOoooOo.",
      "oOOooOOOoooOOo",
      "oDOOOOooOOODOo",
      "oOoOooooooOODo",
      "oOOooOoOooODOo",
      ".oOOOOoOOODOo.",
      "..oooooooooo..",
    ],
  },
  "item.gift": {
    pal: GIFT_PAL,
    rows: [
      "..oo..oo...",
      ".oRRooRRo..",
      ".oRrRRrRo..",
      "..ooRRoo...",
      ".oooRRoooo.",
      ".oGGgRRGGo.",
      ".oGgGRRgGo.",
      ".oRRRRRRRo.",
      ".oGgGRRgGo.",
      ".oGGgRRGgo.",
      ".ooooooooo.",
    ],
  },
  "item.bouquet": {
    pal: BOUQUET_PAL,
    rows: [
      "..oo..oo....",
      ".oPPooYYo...",
      ".oPpPoYyYo..",
      "oBBoPPoYYoo.",
      "oBbBoooWWWo.",
      ".oBBoGgoWwo.",
      "..ooGgGGooo.",
      "...oGgGgGo..",
      "...oWWWWWo..",
      "...oWRRRwo..",
      "....oRWRo...",
      "....oWwWo...",
      ".....oWo....",
      ".....oo.....",
    ],
  },
  // Four heart-shaped leaves (bright enough to spot in the grass) on a little curly stem.
  "item.clover": {
    pal: CLOVER_PAL,
    rows: [
      "....oo.oo....",
      "...ovLovLo...",
      "...oLLgLLo...",
      ".oooGLgLGooo.",
      "ovLGoGgGoGLLo",
      "oLLLGogoGLLGo",
      ".ogggggggggo.",
      "oLLLGogoGGGLo",
      "oLLGoGgGoGGGo",
      ".oooGLgGGooo.",
      "...oLLgGGo...",
      "...oLGoLGos..",
      "....oo.oo..s.",
      "...........s.",
      "............s",
    ],
  },
  "critter.cat.sit": {
    pal: CAT_PAL,
    rows: [
      ".o......o...",
      "oCo....oCo..",
      "oCcooooocCo.",
      "oCCCCCCCCCo.",
      "oCeCCCCCeCo.",
      "oCWWCnCWWCo.",
      ".oCWWWWWCo..",
      "..oCCCCCo...",
      ".oCCWWWCCo..",
      ".oCCWWWCCoo.",
      ".oCCCCCCCocoo",
      ".oCcoCoCCCCo.",
      "..oooooooooo.",
    ],
  },
  "critter.cat.sleep": {
    pal: CAT_PAL,
    rows: [
      "....oooooo....",
      "..ooCCCCCCoo..",
      ".oCCcCCCCcCCo.",
      "oCCoCoCCoCoCCo",
      "oCCCCCCCCCCCCo",
      "oCcCooCCooCcCo",
      "oCCCCCnnCCCCco",
      ".oCCWWWWWWCco.",
      "..oooooooooo..",
    ],
  },
  "fox.lie.1": {
    pal: FOX_PAL,
    rows: [
      "...................o...o........",
      "..................oKo.oKo.......",
      "..................oKCooKCo......",
      ".................oKCCOOKCCo.....",
      ".................oOOOOOOOOOo....",
      "................oLLOOOOOOOOOo...",
      "oo..............oLOOOOOOOeOOOo..",
      "oWo.............oOOOOOOOOEOCCCoo",
      "oWWo.....ooooo..oOOOOOObCCCCCCCn",
      "oWWWoooooLLLOOooOOOOOCCCCCCCoon.",
      ".oWLOOOooLOOOOOOOOOOoCCCCCCCo...",
      ".oLOOOOOoOOOOOOOOOOOOoCCCCCo....",
      "..oOOOOOOoOOOOOOOOOOOOoCCCo.....",
      "..oOOOOOOOoOOOOOOOOOODcCCCo.....",
      "..oDDOOOOODoDOOOOOODDDoKKKKKKo..",
      "...oDDDDDDDooDDDDDDDDoKkKKKKkKo.",
      "....ooooooo..ooooooooooooooooo..",
    ],
  },
  "critter.snowman": {
    pal: SNOWMAN_PAL,
    rows: [
      "...ooo.....",
      "..oWWWo....",
      ".oWeWeWo...",
      ".oWWnnWo...",
      "..oWWwo....",
      ".oRRrRRo...",
      "oWWRrWWWo..",
      "oWWWkWWwo..",
      "kWWWWWWwok.",
      ".oWWkWwwo..",
      "..ooooooo..",
    ],
  },
};
