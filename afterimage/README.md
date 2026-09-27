# Afterimage Studio

A browser photo editor for turning your own photos into pop-art, double-exposure and pixel-streak artwork.

Open `index.html` in any modern browser. Use **Open photo** for the base and **Add layers** to stack more photos on top (you can pick several at once, or drop several onto the canvas). There's nothing to install, and your photos stay on your device.

## Effect stack (runs top to bottom)

| Effect | What it does |
| --- | --- |
| Tone | Brightness, contrast, saturation, hue shift, crush blacks |
| Layers | Stacks up to 8 photos on the base. Each layer has its own blend mode (screen, color bleed, soft light, overlay, hard light, lighten, add, color dodge, multiply, darken, difference, exclusion, luminosity), strength, **bleed** (softens the layer so its colors spill past their edges), zoom, pan, and where it shows (whole frame, the layer's own brights or darks, the shadows or highlights below, or a glowing window). Reorder, hide, remove, or swap any layer with the base. |
| Solarize | Flips tones above a threshold (the Sabattier darkroom effect) |
| Posterize | Snaps each color channel into flat bands |
| Color map | Repaints shadows through highlights with a palette (Pop Eye, Neon Dusk, Sodium, Cyanotype, Acid, Infrared) |
| Pixel streak | Smears pixels into long lines or drips of light, downward, upward or sideways |
| Glitch | RGB channel split and displaced slices |
| Finish | Vignette and film grain |

## Recipes

- **Pop Eye**: saturated, posterized primaries (red, yellow, blue, black, white)
- **Color Bleed**, **Stacked Light**, **Melt**: several photos layered so their colors run into each other
- **Window Glow**: a dark scene with a second photo glowing through a window
- **Light Rain**: vertical pixel streaks over a warm, dark city
- **Sabattier**, **Ghost Signal**, **Infrared Drip**: more starting points

**Surprise me** builds a random stack. Hold the image (or press **Hold to see original**) to compare with the original photo. **Save image** exports a PNG up to 3200 px on the long side.
