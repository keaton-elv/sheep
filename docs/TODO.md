# TODO

## Small visual things

- **Ginkgo on phones:** in fall, the golden ginkgo stands above the sound button, between the barn and the clock, and the top of the
  screen cuts off its crown (trunk base at y≈42-48 game px; canopy is ~80 px tall). Scootch it down slightly and a little to the left so
  more of it shows. Measured at 3x DPR: ginkgo at (148,48) on 390x844, (166,48) on 375x812, (160,42) on 430x932, (154,48) on 393x852;
  barn ends at x=114, loom at (≈140,98), clock starts at x≈204-217. Tree spots come from `Nature.plant()` in
  `src/client/world/world-nature.ts` (the loom/chest/mailbox keep-clear boxes there are what stop it sitting lower); the ginkgo is
  chosen in `pickGinkgo()`. Idea: remember each tree's home spot, and after picking the ginkgo nudge it (~+8 y, ~-6 x) when its
  crown is clipped, reset to home whenever kinds are reassigned.
