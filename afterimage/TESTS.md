# Afterimage tests

Checks from `SPEC.md`, added one build row at a time. Run them all in headless Chromium:

```
node afterimage/tests/run.mjs [photo-dir]
```

`photo-dir` defaults to `afterimage/test/`, which should hold the three owner photographs (JPG, PNG or WebP). Each photo is used once as the base, with the other two stacked as photo layers. Without photos, only the settings checks run. The script exits non-zero if anything fails.

The runner reads the app through `window.__afterimageTest`, a read-only handle the page exposes for tests. The app itself never uses it.

## Standing checks (ground rules)

| ID | Check | How |
| --- | --- | --- |
| G1 | Deterministic: same photos, settings and seed give identical output | Every recipe rendered twice at preview size on each photo; pixel hashes must match |
| G2 | Every recipe renders on every owner photo | No script error and no flat frame, with the base plus two photo layers |
| G3 | Nothing from v1 is deleted | All nine v1 effects are still in the stack; the RGB-lattice posterize is named "Posterize (RGB lattice)" |

## Row 1: P4 defaults (vignette 0, grain 0, slices 0, `TAME` trimmed)

| ID | Check | How |
| --- | --- | --- |
| 1.1 | Effect defaults ship with no vignette, grain or slice slip | `defaults()`: vignette 0, grain 0, slices 0 |
| 1.2 | No recipe ships a vignette, grain or slice slip | Every preset through `withPreset` |
| 1.3 | The generator never adds a vignette, grain, slice slip or the RGB-lattice posterize | 60 runs of Surprise me |

Not yet covered, because later rows deliver it:

- P4's "no preset output contains a global channel offset": Ghost Signal still splits RGB channels across the whole frame (shift 12). Row 7 makes the split edge-only by default; add the check then.
- The ground rule "drop the lattice posterize from every preset": Pop Eye, Data Rot and Ghost Signal still use it. Row 2 replaces it with `quant` (P1.7). It is already out of the generator (check 1.3).

## Run log

| Date | Row | Photos | Result |
| --- | --- | --- | --- |
| 2026-09-28 | 1 | The three owner photographs (from the chat; not in the repo) | 10 of 10 pass. Negative control: a vignette put back in Pop Eye, grain allowed in the generator, and `Math.random` in Tone made 1.2, 1.3 and G1 fail as expected. |
