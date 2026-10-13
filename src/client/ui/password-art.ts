// Title-screen art for the password gate: the chunky "Baaaah Farm" logo, drifting clouds, birds.
// The logo is a hand-made bitmap font with an outline + 3D extrusion baked in.

import { pixelArt } from "../engine/pixelart";

const LOGO_PALETTE = { H: "#ffffff", C: "#fff3c4", c: "#ffe08a", b: "#f5b94a", o: "#7a3410", E: "#a8501c", e: "#6b2a0c", k: "#3b1505" };
const CLOUD_PALETTE = { W: "#ffffff", w: "#eef7ff", s: "#d3e6f5", S: "#b9d3ea" };
const BIRD_PALETTE = { o: "#3b2a4a", w: "#6a587a" };

let registered = false;

export function registerPasswordArt(): void {
  if (registered) return;
  registered = true;

  pixelArt("ui.logo", [
    "................................................................................................................",
    "................................................................................................................",
    "kkkkkkkkkkk........................................kkkkkkk..........kkkkkkkkkkkk................................",
    "koooooooookk.......................................koooook..........kooooooooook................................",
    "koHHHHHHHook.......................................koHHHok..........koHHHHHHHHok................................",
    "koCCCbbCCHokkkkkkkkkkk..........kkkkkkkkkk.........koCCCok..........koCCCbbbbbokkkkkkkkkk........kkkkkkkkkkkkk..",
    "koCCCooCCCokkooooooookkkkkkkkkkkkooooooookkkkkkkkkkkoCCCokkkkk......koCCCooooookooooooookkkkkkkkkkoooooooooookk.",
    "koCCCooCCbokooHHHHHHookooooooookooHHHHHHookooooooookoCCCoooookk.....koCCCoeeeeeooHHHHHHooooooooooooHHHHHoHHHook.",
    "koCCCoHCCookoHbbbbCCHoooHHHHHHoooHbbbbCCHoooHHHHHHoooCCCHHHHook.....koCCCoooooeoHbbbbCCHooHHHoHHHooCCCbCHbCCHok.",
    "kocccHcccookoooooocccooHbbbbccHooooooocccooHbbbbccHoocccbbccHok.....kocccHHHHoEoooooocccoocccHbbboocccoccocccok.",
    "kocccbbbcHooooHHHHcccooooooocccoooHHHHcccooooooocccoocccoocccok.....kocccbbbbokooHHHHcccoocccbooooocccoccocccok.",
    "kocccoooccHooHccbbcccoooHHHHcccooHccbbcccoooHHHHcccoocccoocccok.....kocccoooookoHccbbcccoocccooeeeocccoccocccok.",
    "kocccoeocccoocccoocccooHccbbcccoocccoocccooHccbbcccoocccoocccok.....kocccoeeeekocccoocccoocccoeeeeocccoccocccok.",
    "kocccooocccoobccHHcccoocccoocccoobccHHcccoocccoocccoocccoocccok.....kocccoeeeekobccHHcccoocccoeEEEocccoccocccok.",
    "kobbbHHHbbbooobbbobbboobbbHHbbbooobbbobbboobbbHHbbboobbboobbbok.....kobbboEEEEkoobbbobbboobbboEkkkobbbobbobbbok.",
    "kobbbbbbbbooeooooooooooobbbobbboeooooooooooobbbobbboobbboobbbok.....kobbbokkkkkeoooooooooobbbokk.kooooooooooook.",
    "kooooooooooeeeeeeeeeeeeoooooooooeeeeeeeeeeeoooooooooooooooooook.....koooook...keeeeeeeeeeoooook..keeeeeeeeeeeek.",
    "keeeeeeeeeeeEeeeeeeeeeeeeeeeeeeeEeeeeeeeeeeeeeeeeeeeeeeeeeeeeek.....keeeeek...kEeeeeeeeeeeeeeek..keeeeeeeeeeeek.",
    "keeeeeeeeeeEkEEEEEEEEEEeeeeeeeeekEEEEEEEEEEeeeeeeeeeeeeeeeeeeek.....keeeeek...kkEEEEEEEEEeeeeek..kEEEEEEEEEEEEk.",
    "kEEEEEEEEEEkkkkkkkkkkkkEEEEEEEEEkkkkkkkkkkkEEEEEEEEEEEEEEEEEEEk.....kEEEEEk....kkkkkkkkkkEEEEEk..kkkkkkkkkkkkkk.",
    "kkkkkkkkkkkk..........kkkkkkkkkkk.........kkkkkkkkkkkkkkkkkkkkk.....kkkkkkk.............kkkkkkk.................",
  ], LOGO_PALETTE);

  pixelArt("ui.title.cloud.1", [
    "...............WWWWWW...WWWWWW..............",
    "..............WWWWWWWWWWWWWWWWWW............",
    ".............WWWWWWWWWWWWWWWWWWW............",
    "............WWWWWWWWWWWWWWWWWWWWWWWWW.......",
    "........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.....",
    "......WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW....",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW....",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW...",
    "....wWWWWWWWWWWWWWWWWWWWWWWWWwWWWWWWWWWWW...",
    "....wWWWWWWWWWWWWWWWWWWWWWWWWwwWWWWWWWWWWW..",
    "....swWWWWWWWWwwWWWWWWWWWWWWwswwwWWWWWWWWWw.",
    "....SwwwwwwwwwwwwwwwwwwwwwwwwSswwwwwwwwwwww.",
    ".....swwwwwwwwsswwwwwwwwwwwws.Ssswwwwwwwwws.",
    ".....SssssssssSSssssssssssssS..SSsssssssssS.",
    "......SSSSSSSS..SSSSSSSSSSSS.....SSSSSSSSS..",
    "............................................",
  ], CLOUD_PALETTE);

  pixelArt("ui.title.cloud.2", [
    "........................WWWWWWWWWW..........................",
    ".......................WWWWWWWWWWWW..WWWWWW.................",
    "...............WWWWWW.WWWWWWWWWWWWWWWWWWWWWWW...............",
    ".............WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW..............",
    "............WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.............",
    "...........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.............",
    "...........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW............",
    "..........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.........",
    "........WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.......",
    "......WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW......",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW......",
    ".....WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.....",
    "....wWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwWWWWWWWWWWWW....",
    "....wWWWWWWWWWWWWWWWWwwWWWWWWWWWWWWWWwwwwwwwwWWWWWWWWWWWW...",
    "....swWWWWWWWWwwwwwwwwwWWWWWWWWWWWWWWwwwwwwswwwWWWWWWWWWWw..",
    "....SwwwwwwwwwwwwwwwwsswwwwwwwwwwwwwwssssssSswwwwwwwwwwwww..",
    ".....swwwwwwwwsssssssSSwwwwwwwwwwwwwwSSSSSS.Ssswwwwwwwwwws..",
    ".....SssssssssSSSSSSS..ssssssssssssss........SSssssssssssS..",
    "......SSSSSSSS.........SSSSSSSSSSSSSS..........SSSSSSSSSS...",
    "............................................................",
  ], CLOUD_PALETTE);

  pixelArt("ui.title.cloud.3", [
    ".............WWWW.............",
    "...........WWWWWWWW...........",
    "..........WWWWWWWWWWWWWW......",
    "......WWWWWWWWWWWWWWWWWWWW....",
    "....WWWWWWWWWWWWWWWWWWWWWW....",
    "....WWWWWWWWWWWWWWWWWWWWWWW...",
    "...wWWWWWWWWWWWWWWWWWWWWWWWW..",
    "...wwwwwwwwwwwwwwwwwwwwwwwwww.",
    "...swwwwwwwwwwwwwwwwwwwwwwwww.",
    "...Ssssssssssssssssssssssssss.",
    "....SSSSSSSSSSSSSSSSSSSSSSSSS.",
    "..............................",
  ], CLOUD_PALETTE);

  // Two-frame flapping bird (frames side by side, 8px each) for a CSS steps() animation.
  pixelArt("ui.title.bird", [
    "o.....o.........",
    "wo...ow..o...o..",
    ".wo.ow....ooo...",
    "..ooo......o....",
  ], BIRD_PALETTE);
}
