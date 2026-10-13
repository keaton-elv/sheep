// The log fence around the pasture, built from the real Stardew outdoors fence pieces.
// Horizontal runs are single entities (top one sorts behind the sheep, bottom one in front);
// the side runs are split into 16px bands so a sheep standing beside the fence sorts correctly.

import type { Season } from "../../shared/calendar";
import type { Entity, Game } from "../engine/game";
import type { Layout } from "./layout";
import { rowsToPx, type Px } from "./world-pixels";
import { ctx2d, makeCanvasEl, outdoorsSheet, pxCanvas, sheetPx } from "./world-sheets";

interface FencePieces {
  post: HTMLCanvasElement;
  rails: HTMLCanvasElement[];
  vcap: HTMLCanvasElement;
  vunit: HTMLCanvasElement;
  vbottom: HTMLCanvasElement;
}

/** Rows of the horizontal pieces (sheet y 225..254); the post's feet are at row POST_FEET. */
const H_TOP = 225;
const H_ROWS = 30;
const POST_FEET = 27;
const V_CAP_LIFT = 4;
const V_BOTTOM_H = 22;

const pieceCache = new Map<string, FencePieces>();

function piecesFor(season: Season): FencePieces {
  const sheetKey = outdoorsSheet(season);
  const hit = pieceCache.get(sheetKey);
  if (hit) return hit;
  const postSrc = sheetPx(sheetKey, 145, H_TOP, 12, H_ROWS);
  let pieces: FencePieces;
  if (postSrc) {
    // Keep only the post itself (cols 2..9) above the grass, and only solid grass below.
    const post: Px = { width: 12, height: H_ROWS, data: new Uint8ClampedArray(postSrc.data) };
    for (let y = 0; y < H_ROWS; y++) {
      for (let x = 0; x < 12; x++) {
        const i = (y * 12 + x) * 4;
        const keep = y < 248 - H_TOP ? x >= 2 && x <= 9 : post.data[i + 3] === 255;
        if (!keep) post.data[i + 3] = 0;
      }
    }
    const piece = (x: number, y: number, w: number, h: number) => pxCanvas(sheetPx(sheetKey, x, y, w, h)!);
    pieces = {
      post: pxCanvas(post),
      rails: [piece(136, H_TOP, 11, H_ROWS), piece(155, H_TOP, 13, H_ROWS)],
      vcap: piece(176, 228, 16, 16),
      vunit: piece(176, 244, 16, 20),
      vbottom: piece(176, 264, 16, V_BOTTOM_H),
    };
  } else {
    pieces = fallbackPieces();
  }
  pieceCache.set(sheetKey, pieces);
  return pieces;
}

/** Hand-drawn log fence, in case the outdoors sheet never loads. */
function fallbackPieces(): FencePieces {
  const pal = { o: "#3b2216", L: "#b98a44", M: "#8a5a2c", D: "#5e3a1c", s: "rgba(40,20,60,0.22)" };
  const postRows = ["..oooooooo..", "..oLMMMMDo..", "..oLMooMDo.."];
  for (let i = 0; i < 24; i++) postRows.push(i % 7 === 3 ? "..oLDMMMDo.." : "..oLMMMMDo..");
  postRows.push("..oooooooo..", "............", "............");
  const railRows: string[] = [];
  for (let y = 0; y < H_ROWS; y++) {
    if (y === 9 || y === 13 || y === 17 || y === 22) railRows.push("ooooooooooo");
    else if (y === 10 || y === 18) railRows.push("LLLLLLLLLLL");
    else if (y >= 11 && y <= 12) railRows.push("MMMMMMMMMMM");
    else if (y >= 19 && y <= 21) railRows.push("MMMMMMMMMMM");
    else if (y === 25) railRows.push("sssssssssss");
    else railRows.push("...........");
  }
  const vRows = (n: number, cap: boolean) => {
    const r: string[] = [];
    for (let y = 0; y < n; y++) {
      if (cap && y === 0) r.push("....oooooooo....");
      else if (cap && y === 1) r.push("....oLLMMMDo....");
      else r.push(y % 10 === 9 ? "....oDDDDDDo...." : "....oLMMMMDo....");
    }
    return r;
  };
  return {
    post: pxCanvas(rowsToPx(postRows, pal)),
    rails: [pxCanvas(rowsToPx(railRows, pal))],
    vcap: pxCanvas(rowsToPx(vRows(16, true), pal)),
    vunit: pxCanvas(rowsToPx(vRows(20, false), pal)),
    vbottom: pxCanvas(rowsToPx([...vRows(V_BOTTOM_H - 2, false), "....oooooooo....", "................"], pal)),
  };
}

/** A horizontal run between two post centers, drawn into its own canvas. */
function renderHRun(p: FencePieces, xa: number, xb: number): { canvas: HTMLCanvasElement; left: number } {
  const left = Math.floor(xa) - 6;
  const width = Math.ceil(xb) - left + 7;
  const c = makeCanvasEl(width, H_ROWS);
  const ctx = ctx2d(c);
  const n = Math.max(1, Math.round((xb - xa) / 20));
  const posts: number[] = [];
  for (let i = 0; i <= n; i++) posts.push(Math.round(xa + ((xb - xa) * i) / n) - left);
  for (let i = 0; i < n; i++) {
    const l = posts[i]! + 4;
    const r = posts[i + 1]! - 4;
    const rail = p.rails[i % p.rails.length]!;
    for (let x = l; x < r; x += rail.width) {
      const w = Math.min(rail.width, r - x);
      ctx.drawImage(rail, 0, 0, w, H_ROWS, x, 0, w, H_ROWS);
    }
  }
  for (const px of posts) ctx.drawImage(p.post, px - 6, 0);
  return { canvas: c, left };
}

/** A vertical run from feet ya down to feet yb. Canvas row 0 is world y (ya - V_CAP_LIFT). */
function renderVRun(p: FencePieces, ya: number, yb: number): HTMLCanvasElement {
  const top = ya - V_CAP_LIFT;
  const height = Math.max(V_BOTTOM_H + 4, yb + 2 - top);
  const c = makeCanvasEl(16, height);
  const ctx = ctx2d(c);
  const bottomY = height - V_BOTTOM_H; // canvas row where the grassy bottom piece starts
  ctx.drawImage(p.vcap, 0, 0);
  let y = p.vcap.height;
  while (y < bottomY) {
    const h = Math.min(p.vunit.height, bottomY - y);
    ctx.drawImage(p.vunit, 0, 0, 16, h, 0, y, 16, h);
    y += h;
  }
  ctx.drawImage(p.vbottom, 0, bottomY);
  return c;
}

class FenceSlice implements Entity {
  layer = 1;
  constructor(
    public x: number,
    public y: number,
    private canvas: HTMLCanvasElement,
    private dx: number,
    private dy: number,
    private sy = 0,
    private sh = canvas.height,
  ) {}
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.canvas, 0, this.sy, this.canvas.width, this.sh, this.dx, this.dy + this.sy, this.canvas.width, this.sh);
  }
}

/** Build all fence entities for the layout & season (caller adds them to the game). */
export function buildFence(l: Layout, season: Season): Entity[] {
  const p = piecesFor(season);
  const f = l.fence;
  const out: Entity[] = [];
  const x0 = f.x;
  const x1 = f.x + f.w;
  const y0 = f.y;
  const y1 = f.y + f.h;
  const half = l.gate.w / 2;

  const hrun = (xa: number, xb: number, feet: number) => {
    if (xb - xa < 8) return;
    const r = renderHRun(p, xa, xb);
    out.push(new FenceSlice((xa + xb) / 2, feet, r.canvas, r.left, feet - POST_FEET));
  };
  const vrun = (ya: number, yb: number, x: number, endsAtBottom: boolean) => {
    if (yb - ya < 12) return;
    const c = renderVRun(p, ya, yb);
    const top = ya - V_CAP_LIFT;
    const BAND = 16;
    for (let sy = 0; sy < c.height; sy += BAND) {
      const sh = Math.min(BAND, c.height - sy);
      let sortY = top + sy + sh;
      // The bottom run's corner post must draw over the end of the side run.
      if (endsAtBottom && sy + sh >= c.height) sortY = y1 - 1;
      out.push(new FenceSlice(x, sortY, c, Math.round(x) - 8, top, sy, sh));
    }
  };

  if (l.gate.side === "top") {
    hrun(x0, l.gate.x - half, y0);
    hrun(l.gate.x + half, x1, y0);
  } else {
    hrun(x0, x1, y0);
  }
  hrun(x0, x1, y1);
  if (l.gate.side === "left") {
    vrun(y0, l.gate.y - half, x0, false);
    vrun(l.gate.y + half, y1, x0, true);
  } else {
    vrun(y0, y1, x0, true);
  }
  vrun(y0, y1, x1, true);
  return out;
}
