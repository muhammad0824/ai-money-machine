# Afterimage Studio v2 — Build Spec

Sep 28, 2026 · @mo

## Why this spec exists

Afterimage Studio v1 is a per-pixel filter stack; v2 turns it into a compositing engine in which the photographs act on each other. Today `processImage` runs nine effects in a reorderable list, and the only things a stacked photo can do are blend by luminance and zoom. Every effect — posterize, gradient map, smear, JPEG corruption, RGB split, grain, vignette — is nameable on sight from Photomosh, Glitché or Photoshop.

The fingerprint is mathematical, not aesthetic. `fxPoster` quantizes each RGB channel separately, so at 3 levels every image draws from the same 27-point lattice: (255,128,128) salmon, (128,255,255) cyan, (255,255,128) mustard. `fxFinish` adds the same grey noise to every pixel and a radial vignette, and 10 of 12 presets ship with the vignette on.

Original, in this spec, means one test. An effect must read from the photograph's own structure (its palette, edges, luminance, subject) or from another stacked photograph. An effect that would look the same on any input is a filter, and is not built.

## Ground rules for every change

Keep the single-file, no-build architecture; Claude Code checks each rule below before it returns a change.

- One file, `index.html`, no bundler. External scripts only from cdnjs.cloudflare.com or cdn.jsdelivr.net/npm, pinned versions, UMD builds. Anything that needs model or wasm files from another host is gated behind a flag (Priority 3).
- Same math at preview and export. `WORK_MAX` (1400) previews, `EXPORT_MAX` exports; no effect may take a preview-only shortcut that changes the look. Resolution-dependent parameters (radii, block sizes, streak lengths) are stated as a fraction of the long edge, never in pixels.
- Deterministic. Same photos, same settings, same `seed` = identical output at both sizes. New randomness goes through `hash` and `rng`, never `Math.random` outside the generator.
- Every new effect is a schema entry in `FX` (or `LAYER_C`), takes part in `order`, is the identity when `on` is false, and is preset-able through `withPreset`.
- The one-rule test: a new effect reads from the photograph's structure or from another layer, or it is not built. No new frame-uniform textures (noise, scratches, light leaks, dust).
- Heavy per-pixel work (displacement, block matching, segmentation, feedback) runs in a Web Worker. The main thread never blocks longer than one frame; a stale preview job is cancelled when a slider moves.
- Mobile first. Every control works one-handed on a phone; placements and masks are drag gestures on the canvas, with sliders as the fallback.
- Nothing from v1 is deleted. Rename the RGB-lattice posterize to "Posterize (RGB lattice)", drop it from every preset and from the generator, and keep it available.

## Priority 1 — Colors from the photograph, not the cube

Add a `quant` effect that reduces the image to a K-color palette extracted from a photograph in a perceptual color space, and make it the default reduction everywhere `poster` is used today.

**Where.** New `fxQuant` beside `fxPoster`; a new `extractPalette(img, K)` cached like `getLayerData`; `PALETTES` becomes an ink model; `fxGmap` maps onto inks.

**Build.**

1. `extractPalette(img, K)`: downsample to 160 px on the long edge, convert to OKLab, k-means++ init, 12 iterations, sort by lightness. Cache by image uid and K. K ranges 3–12, default 5.
2. `quant` controls: `source` (this photo, layer 1…N, or an authored palette), `K`, `space` (OKLab default, RGB legacy), `dither` (none, Bayer 4×4, Bayer 8×8, Floyd–Steinberg), `ditherAmount` 0–100, `mix`. Nearest-color search and dithering both run in OKLab.
3. Cross-layer palette: `source = layer N` extracts the palette from that layer's photo and paints it onto the base. This is the first real relationship between two photographs in the app, and it needs no blend mode.
4. Ink model for authored palettes: `{ name, paper, inks: [hex…], provenance }`. `fxGmap` maps luminance bands to inks with `paper` as the highlight, hard or soft edges, plus a registration offset per ink (0–1% of the long edge) so misregistration is a control rather than an accident.
5. Ship four authored palettes with provenance: Riso (fluorescent pink, federal blue, teal, yellow, black on cream), three-strip Technicolor, Kodachrome, and one the owner samples from scans of hand-painted Lollywood posters and hoardings. Do not invent hex values for the last one; build the sampler and leave the slot empty.
6. Eyedropper palette builder: tap the loaded photo to add a color to a custom palette; name and save it.
7. Presets: replace every `poster` step with `quant` (K 4–6, Bayer 4×4 at 30) and re-tune by eye against three of the owner's photographs.

**Done when.** Two different photographs through the same recipe produce two different palettes. The 27 lattice colors no longer appear in any preset output. A palette taken from layer 2 can be applied to the base while layer 2 itself is invisible.

**Tradeoff.** The candy pop of the lattice goes; the owner keeps it only through the legacy effect.

## Priority 2 — Geometry

Give the base photograph a frame of its own, give every stacked photograph a transform and a shape, then add displacement so one photograph warps the other.

**Where.** A new `frame` stage before `adjust` in `processImage`; `getLayerData` and `windowRect` replaced by a general `layerTransform`; a new `fxDisplace`.

**Build.**

1. Base reframe (`frame`): crop with aspect presets (1:1, 4:5, 2:3, 3:2, 16:9, free) and free position; rotation in 90° steps and free rotation with edge fill (mirror, stretch, black); mirror H/V; tile 2×2 and 3×3; kaleidoscope with N-fold symmetry (2–8). The working canvas takes the cropped aspect, so `WORK_MAX` and `EXPORT_MAX` apply to the new frame.
2. Per-layer transform: scale 20–300% (today's floor is 100), rotation −180–180°, free position including off-frame, flip H/V. Direct manipulation on the canvas: drag to move, pinch to scale, two-finger rotate.
3. Shape masks replace the fixed `window`, whose vertical position is currently locked: rectangle, circle, N-gon, torn edge (noise-perturbed contour), and a freehand path drawn on the canvas. Each has feather (0–5% of the long edge), position, size, rotation and invert. `surround` darkening stays as an option.
4. `fxDisplace`: source = base luminance, base edges, layer N luminance or layer N edges; `amountX` and `amountY` as ±% of the long edge (0–8); `smooth`, a blur radius on the source; direction = along the source gradient (pixels slide along contours) or a fixed axis. Bilinear sampling; edge mode wrap, mirror or clamp. Target = base or a chosen layer.
5. Displace runs in the worker (Priority 5) and the generator allows one instance per recipe (Priority 6).

**Done when.** A layer can sit rotated at 30% scale in a corner with a circular torn mask, and the 3200 px export matches the preview. Displacing the base by a layer's edges yields a warp that follows that layer's contours, not a random ripple.

**Tradeoff.** Per-layer transforms invalidate the layer cache more often; key the cache on the full transform and accept slower slider drags at eight layers.

## Priority 3 — Cut, don't blend

Extend layer masks so a photograph can appear inside a figure or be cut by another photograph's edges; luminance masks stay, but they stop being the only kind.

**Where.** The `mask` options in `LAYER_C` and the mask branch in `fxLayer`; a new masks section with `edgeMask`, `saliencyMask` and `subjectMask`, each cached per image, parameter set and working size.

**Build.**

1. Edge mask: Sobel magnitude on luminance, threshold 0–100, dilate radius 0–3% of the long edge, optional blur. Sources: the base or this layer, shown as "edges of the base" and "edges of this layer".
2. Saliency mask, dependency-free: spectral residual saliency (Hou and Zhang, 2007) at 64 px, upsampled, thresholded, feathered. Enough to separate a figure from a plain ground, and it ships in-file.
3. Subject segmentation, gated: MediaPipe Image Segmenter, script from cdn.jsdelivr.net. Its wasm may load from the same CDN, but its model files load from Google-hosted URLs by default, and the artifact host's content policy blocks other hosts. Implement behind `SEGMENT_ENABLED`, on by default only when the page is served from the owner's own domain or a model copy is found on an allowed CDN. Options: subject of the base, subject of this layer, outside the subject.
4. Mask algebra per layer: `invert`, `feather`, and `combine` (and, or, subtract) of two masks, so "inside the subject of the base and along the edges of this layer" is one layer, not two.
5. Contour cut: add `normal` to `BLENDS` (it is missing) and make normal at feather 0 the default for shape and subject masks. A hard edge and no blend is a collage cut.
6. Show masks: a toggle that draws the active mask as a red overlay on the canvas, so the cut is visible before the blend.

**Done when.** A portrait can carry a second photograph inside the figure only, with a clean hard edge, and the same recipe on a landscape gives a different cut. Edge masks follow a contour as closely at 3200 px as at 1400 px.

**Tradeoff.** Saliency is crude on busy backgrounds. The honest fix is ML segmentation, which means hosting the app outside claude.ai artifacts; that decision is the owner's and is flagged in the build order.

## Priority 4 — Kill the tells

Rework the four effects that mark the output as app-made — grain, vignette, RGB split, streak — so each reads from the image, and zero them in every default.

**Where.** `fxFinish`, `fxGlitch`, `fxStreak`, `PRESETS`, and `TAME` inside the generator.

**Build.**

1. Grain: replace uniform additive noise with film grain. Generate noise at a `size` (clumps of 1–4 px, low-resolution noise upsampled bilinearly), weight it by a luminance curve that peaks in the midtones and falls to zero at pure black and white, and add `chroma` (0 = grey, 100 = independent per channel). Default 0 in every preset.
2. Vignette: keep the control, set it to 0 in all 12 presets, remove it from `TAME`. Nothing ships with a vignette on.
3. RGB split: constrain the channel offset to an edge mask (Priority 3) with `edgeOnly` on by default, and add `direction` in degrees so the split follows a chosen axis. The global broadcast split stays as an explicit option.
4. Streak: add `dir = flow`, where each pixel streaks along the local edge tangent of the base (or a chosen layer) instead of down a column. Compute the gradient field once at a blur radius of 0.5–2% of the long edge and integrate short line samples along it. Column mode stays.
5. Slice slip: default `slices` to 0.
6. Byte corrupt: leave it alone. It already reads the image's own JPEG structure and is the one v1 effect that passes the rule.

**Done when.** No preset output contains radial darkening, frame-uniform noise or a global channel offset unless the owner turns one on. A streak in flow mode visibly bends around a figure.

**Tradeoff.** Flow-field streaks cost a gradient pass plus per-pixel line integration; run them in the worker and cap `length` at 40% of the long edge.

## Priority 5 — Process over filter

Add feedback across the whole stack and a two-still datamosh, and move the pipeline into a Web Worker so both stay usable on a phone.

**Where.** `processImage` gains an outer loop; a new `fxMosh`; a worker section wrapped as a Blob URL so the file stays single.

**Build.**

1. Worker pipeline first: `processImage` and every `fx*` move into a worker created from an inline Blob. The main thread sends `ImageData` plus settings, receives the result, and cancels a stale job when a slider moves; progress is reported per stage. If the host's content policy blocks `blob:` workers, fall back to main-thread processing sliced by row bands with `setTimeout`, and log which path is active.
2. Whole-stack feedback: `generations` 1–8 at recipe level. Each pass takes the previous output as the base; `decay` mixes each pass with the original (0 = pure feedback); `feedAsLayer` re-inserts the previous output as an extra layer at a chosen blend and scale, so the image accumulates itself.
3. `fxMosh`, a two-still datamosh: block-match layer N against the base (blocks of 8 or 16 px at working size, search radius 2–4% of the long edge, SAD metric) to get a motion field from base to layer. Modes: `transfer` (render the base's blocks displaced by the field), `drop` (apply the field N times without refreshing, the I-frame-removal look), `bloom` (accumulate displaced blocks additively). Field smoothing 0–100.
4. Use a three-step or diamond search, never exhaustive: at 1400 px, 16 px blocks and a 40 px radius, exhaustive search is roughly 10 billion pixel comparisons per pass; three-step search cuts that to tens of millions.
5. Seeded and deterministic: block scan order and tie-breaks derive from `seed`.
6. Reaction-diffusion and cellular automata are out of scope; they do not read the photograph and fail the rule.

**Done when.** Feedback at 4 generations is recognisably different from 1, and the same recipe on a different pair of photographs accumulates differently. `drop` at 6 passes shows the base melting along the second photograph's structure, not along a random field. Preview at 1400 px stays interactive on a current iPhone.

**Tradeoff.** The worker is a refactor with no visible payoff on its own, which is why it ships before anything that needs it rather than alongside.

## Priority 6 — A grammar, not Surprise Me

Replace the random 3–6 effects in random order with a grammar of roles and a budget, and let the owner lock a signature.

**Where.** `surprise` and `TAME`; a new `SIGNATURES` store; the preset strip.

**Build.**

1. Roles: every effect declares one. Reduction (quant, gmap, solar); Geometry (frame, displace, layer transform); Cut (any non-luminance mask); Damage (corrupt, glitch, streak, mosh); Finish. A generated recipe has exactly one Reduction, at most one Geometry, at most one Cut, at most one Damage, and Finish only with grain at or below 8 and vignette 0.
2. Budget: each effect exposes `intensity` 0–1, its normalised strength; the sum across a recipe is capped at 2.2. Draws over the cap are rescaled, not rejected, so results stay deterministic from the seed.
3. Fixed order: Geometry, Reduction, Cut, Damage, Finish, with one named variant that puts Damage before Reduction. Random order goes.
4. Locks: a padlock per effect and per layer; Generate varies only what is unlocked. The button is renamed Generate and "Surprise me" goes.
5. Signatures: save the locked set under a name to localStorage inside try/catch, list them beside the presets, export and import as JSON. A signature is the combination the owner refuses to vary; the app should make refusing easy.
6. Recipe line: the toast becomes a persistent, copyable line under the canvas naming roles and values, so every image carries its recipe.

**Done when.** Ten Generates in a row never yield two Damage effects or a vignette. A locked signature survives reload. Pasting a recipe line reproduces its image exactly.

**Tradeoff.** Less range per click; the range moves into the locks and the budget cap, which the owner can raise.

## Priority 7 — Output for print

Export at print size, and export quantized output as vector paths and ink separations so a piece can become a screenprint or a Riso print.

**Where.** `EXPORT_MAX` and the export handler; new `traceColors` and `exportSeparations`.

**Build.**

1. `EXPORT_MAX` 3200 to 6000, rendered in horizontal strips of 1024 rows so no single canvas exceeds mobile Safari's canvas limits, stitched to PNG through `OffscreenCanvas` where available.
2. Vector trace: for a `quant` or hard-edge `gmap` output, run marching squares per palette color at export size, simplify with Douglas–Peucker at a tolerance of 0.05% of the long edge, and write one SVG with a group per color. Anything not flat color (grain, displacement without quant) is rasterised into the SVG as an embedded PNG layer and flagged in the filename.
3. Separations: one PNG and one SVG group per ink at export size, black on transparent, with registration marks and the ink name; plus a contact sheet showing the inks in print order over the paper color.
4. Metadata: embed the recipe line as a PNG `tEXt` chunk and as an SVG `<desc>`.
5. Print sizing: show the export's dimensions at 150 and 300 dpi next to the button.

**Done when.** A 6000 px PNG exports on an iPhone without a crash. A five-color quant piece opens in a vector editor as five editable color groups. Separations stacked in order reassemble to the on-screen image.

**Tradeoff.** Tracing at 6000 px takes seconds even in the worker; show progress and never block.

## Build order and hand-off

Ship in the order below; each row is one Claude Code session that opens by re-reading the ground rules and closes by adding its Done-when checks to `TESTS.md`.

| Order | Work | Effort | Depends on | What the owner sees | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | P4 defaults: vignette 0, grain 0, slices 0, `TAME` trimmed | S | — | Presets stop looking app-made | Done |
| 2 | P1 quant, palette extraction, dither, eyedropper | M | — | Every photo gets its own palette | Not started |
| 3 | P5 worker pipeline | M | — | Sliders stop stuttering; groundwork for rows 4–11 | Not started |
| 4 | P2 per-layer transform, shape masks, reframe | M | 3 | Photos can be placed, cut and framed | Not started |
| 5 | P2 displace | S | 3, 4 | One photo warps the other | Not started |
| 6 | P3 edge and saliency masks, mask algebra, mask overlay | M | 4 | Collage cuts instead of blends | Not started |
| 7 | P4 film grain, edge-only split, flow streaks | M | 6 | The four tells read from the image | Not started |
| 8 | P6 grammar, locks, signatures, recipe line | M | 2, 4, 6 | Generate replaces Surprise Me | Not started |
| 9 | P5 feedback and mosh | L | 3 | Accumulation and two-still melting | Not started |
| 10 | P1 ink palettes with provenance, Lollywood sampler | S | 2 | Authored inks, misregistration as a control | Not started |
| 11 | P7 strip export, vector trace, separations | L | 2 | Prints and screens | Not started |
| 12 | P3 ML segmentation, gated | M | own hosting | Subject-accurate cuts | Not started |

Effort: S is under a session, M one session, L two or more.

Two decisions only the owner can make, before rows 6 and 12:

- Hosting: stay on claude.ai artifacts (no ML segmentation, allowed CDNs only) or move to an owned domain (any model, own content policy, still one file).
- Lollywood palette source: which poster or hoarding scans to sample, and whether that palette ships in the app or stays private.

Hand-off. Export this doc as Markdown to `SPEC.md` in the repo before the first session; Claude Code reads the file, not the link. Then open each session with: "Read SPEC.md, ground rules first. Implement row N only. Keep determinism and preview/export parity. Add the row's Done-when checks to TESTS.md and run them on the three owner photographs in `test/` before returning."
