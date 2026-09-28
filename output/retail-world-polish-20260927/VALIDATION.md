# Validation

Self-review: I authored the concepts and changes. This report separates machine proof from the rendered art review.

## Whole-project gates

Baseline: 1,933 tests, zero failures. Fresh station baseline: 18 tests, zero failures. Final: **1,946 tests across 184 files, zero failures, exit 0**. Delta: 13 added tests and zero new failures. The final suite took 238.59 seconds.

The existing jsdom canvas-context notices are retained in the log; browser captures have zero console/page errors. No canvas dependency was installed to silence test-environment notices.

| Gate | Terminal result | Seconds |
|---|---:|---:|
| typecheck | exit 0 | 27.54 |
| lint | exit 0 | 9.12 |
| format:check | exit 0 | 16.45 |
| build | exit 0 | 16.92 |
| validate:depth | exit 0 | 0.18 |
| validate:shaders | exit 0 | 1.16 |
| validate:reachability | exit 0 | 4.03 |
| validate:bundle | exit 0 | 0.19 |
| validate:uncrewed | exit 0 | 0.38 |

[Actual full-suite output](/Users/nellwatson/Documents/GitHub/MillOS/output/retail-world-polish-20260927/validation/full-suite-final.log) · [Actual build output](/Users/nellwatson/Documents/GitHub/MillOS/output/retail-world-polish-20260927/validation/build.log)

All 146 asset contracts pass. The original asset manifest is byte-identical. Root inspected actual diffs and rendered results. The optional Impeccable executable is absent, so it was not run; no new dependency was installed. Rendered 3D inspection and existing depth, shader and build gates were used.

## Geometry and fit

- Bottles have closed bases, rounded shoulders, necks and caps. Label bands sit outside the body and face the aisle.
- All 60 packets/cartons and 36 bottles have tested support positions. Packet print follows the actual six-facet profile; price cards clear the shelf faces.
- The five shared retail batches have finite bounds and remain below the local triangle test. No per-frame update was added.
- The retained room opening is clear. The grill cupboard reaches the floor, and the ceiling cassette seats the fixture.
- The delivered till has a real sloped deck with keys placed to that slope. The coffee shell has a real recessed dispensing bay. Both delivery materials and texture payloads are byte-identical to their previous versions.
- Four market stock meshes fit within the actual delivered trays and each stays below 20,000 triangles. Delivered-geometry rays prove the trays are empty before dressing and the posts stop below the canvas.
- The castle finial neck passes 24 radial probes. Its final delivery has 25,017 render vertices against the unchanged 25,200 limit.

## Current visual evidence

124 accepted frames cover 13 scene families, close shop/market views, all three quality tiers and night. Every accepted frame reports zero audio nodes and no audio context; every capture launched muted, with PA off. All manifests have zero page/console errors and zero failed requests.

The four `world-final-*/castle.png` frames predate the neck repair. They remain as historical evidence; `castle-final-*/castle.png` replaces each one in the accepted inventory. The other scene frames remain valid because the subsequent production change only affected the castle model. Contact sheets retain the older castle frame, so use the linked final castle views for that correction.

138 current deliveries match the prior two-angle catalogue exactly. Four unchanged utility/LPG deliveries differ from the earlier catalogue only through the previous emission correction, whose geometry custody is retained. Four new deliveries (market, castle, till, coffee) are assessed using current mesh tests and live views. The other 142 delivery files are byte-identical to the previous accepted candidate. All 145 provider originals match provenance; all 146 public/dist/HTTP delivery bytes match.

## Performance

**PASS, exit 0**, all five unchanged medium-quality scenes, without contention flags. No speedup is claimed.

| Scene | FPS | p95 ms | Load/core |
|---|---:|---:|---:|
| overview | 87.9 | 14.9 | 1.19 |
| interior | 94.9 | 12.9 | 1.09 |
| shipping | 93.5 | 14.2 | 1.16 |
| receiving | 91.2 | 12.9 | 1.02 |
| water | 93.4 | 13.4 | 0.97 |

The first run exited 1 as machine load rose to 9.81 to 14.05 runnable tasks per core during four scenes. Interior timing checks and receiving first-frame time failed under that contention. All five world-integrity and page-cleanliness checks passed. The run is preserved; no thresholds were relaxed and no unrelated processes were controlled. A new below-threshold preflight justified the second run.

[First run](/Users/nellwatson/Documents/GitHub/MillOS/output/retail-world-polish-20260927/performance/benchmark.json) · [Retry log](/Users/nellwatson/Documents/GitHub/MillOS/output/retail-world-polish-20260927/validation/performance-retry.log)

## Failures found and repaired

- Initial packet profile produced non-finite geometry; the fractional-power input is now clamped, with regression coverage.
- A shelf upright extended below the shop floor; its base was reseated.
- Bottle print was buried and price cards occluded; their actual external geometry and visible atlas pixels are tested.
- The first greengrocer stock exceeded its 20,000-triangle limit; leaf subdivisions were reduced. A dairy binding extended 1.9 mm below the support plane and was raised.
- Closer renders exposed the inherited solid coffee cup and box-shaped till; both shells were corrected in editable prepared derivatives.
- The first castle neck-plus-ring had 25,305 render vertices. The unnecessary ring was removed, leaving the structural neck at 25,017.
- The custody helper initially used Node fetch on port 4190, which Node rejects as a restricted port. It now uses the repository's existing node:http inspection pattern against the same local preview.

No failed check was deleted or weakened. Earlier failed logs remain alongside the final passing outputs. Existing dirty work and original assets are preserved. No push, deployment, external publication, new dependencies or audio playback occurred.
