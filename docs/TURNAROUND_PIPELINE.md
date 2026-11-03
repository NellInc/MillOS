# Four-view turnarounds for Tripo multiview

Tripo builds better geometry and covers more of the texture from several views
of an object than from one image. `scripts/tripo-world-queue.mjs` accepts
`operation: "multiview"` jobs, which send 2 to 4 views (front required) to
`POST /v3/generation/multiview-to-model`. This page covers how to make those
views.

Spending is unchanged. Every job stays inside the D-003 cap (`docs/DECISIONS.md`)
and needs `reviewed: true` from a person who has looked at every view. A
multiview job reserves the same 60 credits as image-to-model. Tripo publishes no
multiview price, so the first one submitted should be checked against
`observedAccountDebit` in its ledger record before submitting a second.

## Source A: existing geometry, rendered in Blender (preferred)

Use this when the asset already exists as authored geometry. Most queue jobs
qualify, since their acceptance notes say "preserve" the existing model. The
renders show the real shape, with nothing imagined.

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/blender/world_geometry_preview.py -- \
  --input test-results/tripo-world-20260907/<id>-geometry.json \
  --out test-results/tripo-world-20260907/<id>.png --turnaround
```

- **Output:** `<id>-front.png`, `-left.png`, `-back.png` and `-right.png` at
  1024 x 1024.
- **Framing:** the object's own bounds fill the frame. The camera looks down by
  12 degrees, on a plain light background.
- **Orientation:** the asset faces Three.js +Z. The left view looks at the
  object's own left side (Three.js +X). [Unverified] This assumes Tripo's
  "left" means the object's own left, not the viewer's. Before the first paid
  submission, check it against a free source: Tripo's own image-to-multiview
  output for an asymmetric object, or its docs. If Tripo means the viewer's
  left, swap the two side views, or the model comes back mirrored.
- **Capture lock:** take `.capture.lock` around the render (see
  `scripts/lib/capture-lock.mjs`).

The `<id>-geometry.json` files come from `scripts/blender/prepare-tripo-pilots.mjs`.

## Source B: a new asset, drawn by Codex

Use this when the asset has no geometry yet. `codex exec` has a built-in image
tool on Nell's ChatGPT account (see the `codex-build` skill).

**Always attach a capture of the area the object will sit in** with `-i`. Words
alone don't set the style. On 2026-11-02 the same handcart prompt came back
close to photoreal (wood grain, worn iron) without a reference. With a village
capture attached (`test-results/art-review/<run>/village.png`, scaled to 1024
px), it matched the village style: clean shapes, matte flat colour.

```bash
codex exec --yolo --skip-git-repo-check -i <capture>.png -o report.txt - < prompt.txt
```

Use this prompt, filling in the brackets:

```text
Generate one PNG image and save it to <absolute path>/<id>-sheet.png.
The attached image is a screenshot of the game this object will appear in.
Match its art style exactly: simple clean shapes, flat matte colours with only
gentle shading, very little surface texture, no photographic grain, weathering
or realistic metal. The object must look like it belongs among those buildings.
It is a character-turnaround style reference sheet of a single object:
<object, with materials, colours and real dimensions in metres>.
Layout: a 2 x 2 grid on one 2048 x 2048 canvas, each cell exactly 1024 x 1024.
Top-left: FRONT view. Top-right: LEFT view (the object's own left side).
Bottom-left: BACK view. Bottom-right: RIGHT view.
All four views: the same object at the same scale, centred, filling about 80% of
its cell; the same flat, even, shadowless studio light; the camera looking down
about 12 degrees; plain light grey background.
No text, labels, grid lines, borders, ground shadows or extra objects.
```

Then split the sheet:

```bash
node scripts/split-turnaround.mjs --sheet=<dir>/<id>-sheet.png --name=<id> --layout=2x2
```

- **What it prints:** the `views` block for the queue job, with each view's
  sha256 and `reviewed: false`.
- **Gutters:** if the generator drew any between the panels, add `--inset=<px>`.
- **Layouts:** the script also takes `--layout=1x4` (front, left, back, right,
  from left to right).
- **Minimum size:** each view must be at least 256 px a side.

**Check the sheet before you trust it.** Image generators often drift between
panels: a door moves, a colour shifts, or the left and right views get swapped.
Tripo needs all four views to show one consistent object. Reject the sheet if
any panel disagrees with another. Turning one into a model would bake the
disagreement into the geometry.

## Into the queue

Add the job to the plan with `operation: "multiview"`, the printed `views`
block, `reference` and `referenceSha256` set to the front view (the printout
already does this), and the usual `faceLimit`, `expectedCredits` (30, or 40 with
`smartLowPoly`) and `reserveCredits` (60). Set `reviewed: true` only after
looking at all four views. Then:

```bash
node scripts/tripo-world-queue.mjs --plan=<plan> --submit=<id>
node scripts/tripo-world-queue.mjs --plan=<plan> --poll=<id>
```

The output goes through the same normalisation, provenance and visual gates as
any other generated model. That includes axis 8, style coherence, in the visual
judge.
