// Robin's portrait (64x64), hand-drawn as a fallback for the "portrait.robin" key.
// Generated from a pixel sketch; a real Stardew portrait region replaces it automatically.
// Note: dom.ts currently never renders portraits (house rule), but the key stays registered
// so anything that wants a Robin face (now or later) gets one.

import { pixelArt } from "../engine/pixelart";

let done = false;

export function registerRobinArt(): void {
  if (done) return;
  done = true;
  pixelArt(
    "portrait.robin",
    [
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "................................................................",
      "............................oooooooo............................",
      ".........................ooorrrrrrrrooo.........................",
      ".......................oorroooooooooorroo.......................",
      ".....................ooroooHRRRRRRRRRoooroo.....................",
      "....................orooHHHRRRRRRRRRRRRRooro....................",
      "...................oooHHRRRRRRRRRRRRRRRRRRooo...................",
      "..................ooRHRJJRRRRRRRRRRRRRRRRRRRoo..................",
      ".................ooRHRJRRRRRRRRRRRRRRRRRRRRRRoo.................",
      "................ooRRRJRRRRRRRRRRRRrRRRRRRRRRRroo................",
      "...........x...oroRRRRRRRRRRRRRRRRrRRRRRrRRRrroDo...............",
      "..........xKx..oroRRRRRRRRrRRRRRRRRrRRRRRrRrrroDo...............",
      ".........xKKvxorroRRRRRRRRrRRRRRRRRrRRRRRrrrrroDDo..............",
      "..........xvvqxrroRRRRRRRRRrRRRRRRRrRRRRRrDrrroDDo..............",
      "...........xPPqxrooooRRRRRRRrRoooooooooorrDrrooDDDo.............",
      "............xPPqxoRRRoRRRRRRooSSSSSSSSSSoorDoroDDDo.............",
      ".............xPPxoRRRoRRRRooSSSSSSSSSSSSSSoorroDDDo.............",
      "............oxPPPoRRRoRRRohSSSSSSSSSSSSSSSorrroDDDDo............",
      "............orxPPoRRRoRRohSSSSSSSSSSSSSSSSorrroDDDDo............",
      "............orrxPoRRRoRDDDDSSSSSSSSSSSSSSSorrrroDDDo............",
      "............orrrxoRRooDohSSSSSSSSSSSSSDDDDorrrroDDDo............",
      "............orrrooRRRohhSSSSSSSSSSSSSSSSSSDorrroDDDo............",
      "............orrroRRRRoeeeeeSSSSSSSSSSSSSSSsorrroDDDo............",
      "............orrroRRRohheWiISSSSSSSSSSeeeeesorrroDDDo............",
      "............orrroRRRohSSWiiSSSSSSSSSSiIWessorrroDDDo............",
      "............oorroRRRoSSSSeeSSSSSSSSSSiiWsssorrroDDoo............",
      "............oRoooRRRoSSSSSSSSSSSSSSSSeessssorrroooro............",
      "............orRRoRRRoSSSfSSSSSSSSSSSSSSssssorrrorrro............",
      "............orRRoRRRoSfkkkfSSSSSsSSSSSfkssfoorrorrro............",
      "............orRRRoRRookkkkkSSSSnsSSSSkkkfkooorrorrro............",
      "...........orRRRRoRRooSkkkSSSSSSSSSSSkkkkkooororDrrro...........",
      "...........orRRRRoRRoooSSSSSSSSSSSSSsssksooDororDrrro...........",
      "...........orRRRRoRoRooSSSSSmmmmmmmSsssssooDroorDrrro...........",
      "...........oRRRRrRoRRoroSSSSSmtttmSsssssororDrorrDrro...........",
      "...........oRRRRrRRRRorroSSSSSmpmSsssssorrorDrrrrDrro...........",
      "...........oRRRRrRRRRorrroSSSSSSSSssssorrrorDrrrrDrro...........",
      "...........oRRRrRRRRrorrrroooSSSSssooorrrrorrDrrrrDro...........",
      "...........oRRRrRRRRrorrrrrosoooooossorrrrorrDrrrrDro...........",
      "...........oRRRrRRRRrorrrrrosssssssssorrrrorrDrrrrDro...........",
      "..........oRRRrRRRRrRRorrrrosssssssssorrrorrrrDrrrrDro..........",
      "..........oRRRrRRRRrRRorrooossssssssooorrorrrrDrrrrDro..........",
      "..........oRRRrRRRRrRRoooZZZonnnnnnoyyyooorrrrDrrrrDro..........",
      "..........oRRrRRRRrRRRooZZZZooooooooyyyyoorrrrrDrrrrDo..........",
      "..........oRRrRRRRrRRRooZZZZZonnnnoyyyyxxorrrrrDrrrrDo..........",
      "..........oRRrRRRRrRRoYYoZZZZooooooyyyyxKxorrrrDrrrrDo..........",
      "..........oRrRRRRrRRRoYYoZZZZZoYYoyyyyyxvxoDrrrrDrrrro..........",
      "..........oRrRRRRrRRRoYYYoZZZZoYYoyyyyoxPxoDrrrrDrrrro..........",
      "..........oRrRRRRrRRoYYYYoZZZooooooyyyoxPxYorrrrDrrrro..........",
      "..........orRRRRrRRRoYYYYYoooYYYYYYooozzzzzoDrrrrDrrro..........",
      ".........oRrRRRRrRRRoYYYYYYYYYYYYYYYYYzzzzzoDrrrrDrrrro.........",
      ".........oRrRRRRrRRoYYYYYYYYYYYYzYYYYYzyyyyyorrrrDrrrro.........",
      "........oorRRRRrRRRoYYYYYYYYYYYYYYYYYYzyyyyyoDrrrrDrrroo........",
      "........oorRRRRrRRRoYYYYYYYYYYYYYYYYYYzyyyyyoDrrrrDrrroo........",
      ".......oYooooooooooYYYYYYYYYYYYYzYYYYYzyyyyyyooooooooooyo.......",
      "......oYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYzzzzzzzzyyyyyyyyyyyo......",
    ],
    { D: "#8c2c14", H: "#ff9b52", I: "#355a22", J: "#ffc184", K: "#f29bb0", P: "#f5d14a", R: "#e2662b", S: "#fcd2ab", W: "#fffaf2", Y: "#e7b444", Z: "#f8d77c", e: "#2c1710", f: "#d98a66", h: "#fff0dc", i: "#5c8a3a", k: "#f19a8c", m: "#9e3a34", n: "#c47c5c", o: "#3d1c12", p: "#e86b6b", q: "#c99a22", r: "#bb4520", s: "#e6a47f", t: "#ffffff", v: "#c9ccd6", x: "#3b2a20", y: "#b98425", z: "#8a5d17" },
  );
}
