# TODO

## Small visual things

- **Ginkgo on phones:** in fall, the golden ginkgo stands above the sound button, between the barn and the clock, and the top of the
  screen cuts off its crown (trunk base at y≈42-48 game px; canopy is ~80 px tall). Scootch it down slightly and a little to the left so
  more of it shows. Measured at 3x DPR: ginkgo at (148,48) on 390x844, (166,48) on 375x812, (160,42) on 430x932, (154,48) on 393x852;
  barn ends at x=114, loom at (≈140,98), clock starts at x≈204-217. Tree spots come from `Nature.plant()` in
  `src/client/world/world-nature.ts` (the loom/chest/mailbox keep-clear boxes there are what stop it sitting lower); the ginkgo is
  chosen in `pickGinkgo()`. Idea: remember each tree's home spot, and after picking the ginkgo nudge it (~+8 y, ~-6 x) when its
  crown is clipped, reset to home whenever kinds are reassigned.
- **Desktop first open:** coming from the title screen, the farm flickers/jumps as the fence moves into place. Likely cause:
  `initHud()`/`initToolbar()` only run after `showPasswordGate()` resolves in `src/client/main.ts`, so the farm is laid out without
  the toolbar inset under the gate and relayouts once they mount. Lay out (and draw) the final farm before the gate fades.
- **Toolbar hover flashes (desktop):** hovering slot 8 (…) makes its frame vanish for a moment; hovering the selected tool (1 or 2)
  makes its red frame flash. Hover only lifts the icon in `toolbar.css`, so something on mouseenter is probably re-adding
  `.is-selected` / re-inserting the slot (restarting the `tb-select` animation) or reassigning `--tb-img-*` to new images that
  must decode again. Check `showLabel()` and anything a pointerover triggers in `src/client/ui/toolbar.ts`.
