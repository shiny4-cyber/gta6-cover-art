# Sunset Strip

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/shiny4-cyber/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/shiny4-cyber/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01)

Cover art in the style of the launch-week poster: drop in a photo or three, write a caption, pick
a grade, export a PNG sized for a post. It is a static site: open `app/index.html` from any static
file server and it works with the network unplugged. Photos are read with
`URL.createObjectURL`, drawn to a canvas and dropped; nothing is uploaded, and the app makes no
request at all.

This is an entry in make.fun's [Make GTA 6 Cover Art](https://make.fun/bounty/gta6-cover-art-01)
bounty. Everything in it is original: no game logo, artwork, character or font file. The display
face is Archivo Black under the SIL Open Font License (`app/fonts/OFL.txt`); the sample photos were
made with an image model for this entry.

## Run it

```
python3 -m http.server 8080 --directory app    # or: node serve.ts
```

Then open <http://localhost:8080>. No build step, no dependencies, no network.

## What it does

- **Photos.** Drag and drop or pick one to six images. The first one fills every panel; after that
  each panel takes its own. Drag on the cover to reframe a panel, wheel or `+`/`−` to zoom, arrow
  keys to nudge. On load each photo is analysed on a 72-pixel copy: skin-toned pixels in the upper
  half give a face region, otherwise the local-contrast centre (biased upward) wins, so crops keep
  the head in frame instead of cutting at the middle.
- **Grade.** Every panel's crop is pushed through one duotone ramp (shadow, mid, highlight),
  contrast and a warm tint, so photos from different cameras sit in the same light.
- **The art.** `app/src/cover.js` draws the whole poster from code at any size: sky gradient with
  the sunset squeezed into the strip above the panels, a striped sun, a skyline standing on the
  title's top edge, two palm silhouettes in front, angled panels with a light keyline and a dark
  inner rule, halftone and grain, a thin frame with corner ticks, and the caption lettered in a
  skewed block with an extruded shadow, an ink stroke and an accent stroke. Measure, shrink to fit,
  split into two balanced lines when that gives bigger type — it never overflows.
- **Caption, palettes, panels, sizes.** Sunset / night neon / daylight; three, four, six or two
  panels; 1600 × 2000 print, 1080 × 1350, 1080 × 1080, 1920 × 1080. `⌘E` exports, and the exported
  PNG is shown beside the editor.

## Screenshots

`screenshots/` holds four captures of the running app in Chrome, not composites:

| file | what it shows |
| --- | --- |
| `1-cover.jpg` | a 1920 × 1080 cover the app drew, full bleed |
| `2-editor.jpg` | the editor with three photos loaded, portrait cover in the preview |
| `3-title.jpg` | a 2× crop of the title treatment, drawn by the app's own zoom scene |
| `4-neon-night.jpg` | the night-neon grade, with the exported PNG beside the editor |

They come from the scenes in `app/src/shots.js` (`?shot=cover`, `editor`, `detail`, `result`), so
each one is the app rendering itself at a fixed size.

## Hand it in

```
MAKEFUN_OUTPUT_DIR=out node main.ts
```

copies `app/` and `screenshots/` to the output directory, checks them against the scorer's caps,
and writes `dossier.json` with `vendor/makefun-app.ts`.

## Licence

MIT. See `LICENSE`.
