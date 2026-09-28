# British/Dutch village gardens

Date: 2026-09-28. Status: local only. This is root self-review of root-authored work.

## Delivered

Five distinct live homes replace the repeated cottage body: Honey Cottage's curved thatch and timber frame, Rose Gable's pastel Dutch facade, Bluebell House's clay tiles and red shutters, Brick & Sage's taller stepped brick front, and Pearl Cottage's bay window. Each has framed front, side and rear windows, a panelled door, chimney pots with correctly seated existing smoke, and a different colour palette.

All five plots have low capped walls, open picket gates, stepping paths, flower borders, window boxes, terracotta pots and benches. Two have climbing-flower arches. A fenced four-bed allotment adds cabbage, carrot/onion rows, runner beans, a shed, rain barrel and cold frame. Its entrance connects to existing square paving. Tended plots exclude stray meadow grass while the surrounding hedges and meadows remain intact.

The geometry follows the requested miniature/model-village style. No new lights, textures, dependency, shadow pass or runtime animation loop. All static details use the existing vertex-colour batching route. Five glazing meshes retain the existing shared day/night material.

## Scope and custody

- Starting checkout: main, HEAD `3026399d411385f44780ddd11745b1927afe7ace`, 413 pre-existing dirty entries.
- All 19,371 preceding candidate fingerprints matched before work.
- Only five prior source files changed: VillageArea.tsx and its test, LandscapeDressing.tsx, siteLayout.ts and shaderContracts.ts. Two files were added: VillageGardens.tsx and its geometry tests.
- `scope-custody.json` confirms all 148 provider originals and all 146 delivery GLBs unchanged. `served-custody.json` confirms every delivery has identical public, dist and HTTP bytes.
- Church, hall, pub, school, boat, signs, castle/navigation, roads, water, loading readiness and resource thresholds retain their previous source/assets. The shared site layout only gains plot constants; its prior anchors remain unchanged.
- `candidate.json` pins 19,373 source/build/asset fingerprints. Final seal is recorded separately in `final-seal.json` after the last required gate.
- No commit, push, deployment, audio playback or unrelated process intervention.

## Geometry and route proof

`geometry-report.mjs` imports transpiled actual production geometry rather than a hand-copied catalogue. Its report records **38,840 triangles** for the complete five houses, glazing, gardens and allotment, below the new 40,000-triangle detail ceiling. Eleven opaque meshes before the existing static batch and five live window meshes; zero new texture or light resources.

Seven new tests verify distinct real silhouettes/palettes, finite geometry and unit normals, closed roofs, seated smoke sources, clear 1.64 m garden/allotment walking lanes, real transformed plot bounds clear of streets/neighbouring buildings, both terrain-tier grass exclusions, and the cobbled allotment connection. This proves physical geometry clearance; it does not introduce enterable house interiors or a new navigation system.

The live `authored-village` batch reports 129 originals optimized into 15 batches, including 112 merged originals in 10 meshes. The five intended live window meshes are present and visible in every accepted capture. These counts are structural evidence, not an FPS improvement claim.

## Validation

- Baseline: 45/45 tests in three files, 8.74 seconds, no failing names. The preceding exact candidate had 2,027 tests across 197 files passing.
- Final focused surface gate: 36/36 tests across VillageGardens, VillageArea and LandscapeDressing, 165.79 seconds. This is a different focused file selection from baseline; whole-suite totals provide the comparable delta.
- `npm run build`: PASS, Vite reports `built in 2m 1s`; runner wall time 124.732 seconds.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: PASS.
- Depth, shader, reachability, bundle and uncrewed gates: PASS. Shader registry includes the new stable v4 paving key because the region-array length changed. Initial JavaScript 0.48 MiB gzip; build 164.14 MiB, within unchanged budgets.
- All 146 asset contracts: PASS.
- `git diff --check`: PASS.
- Optional Impeccable is unavailable locally; no dependency installed. Scene renders, real geometry checks and gallery overflow checks supply the visual evidence.
- Full-suite first run: **2,030 passed, four failed by the unchanged 10-second timeout**, 1,291.97 seconds. All four are in `scripts/restore-authored-asset-attributes.test.mjs`: `requires opt-in for omitted numerical slivers and records their strict area limit`; `retains deliberately opposite source faces as distinct oriented triangles`; `restores only an explicitly recorded reverse face without changing the paid source file`; `rejects an ordinary missing face even with reverse-face restoration enabled`. Source and limits are unchanged.
- Focused diagnosis rerun of that entire file: **13/13 passed in 7.98 seconds**, no timeout or assertion changes. This is not a substitute for the whole gate.
- **Whole-suite recheck: 2,034/2,034 tests across 198/198 files PASS**, 489.72 seconds. Delta against the exact preceding candidate: +7 tests and +1 file. All four earlier timeouts pass with unchanged limits; no production edit was made between the failed whole run and this successful whole run.

Terminal logs are under `validation/accepted/`. JSDOM prints the existing unimplemented canvas-context warning in tests; the real browser error and request-failure arrays are empty.

## Rendered evidence

There are **19 final runtime captures**: 12 Medium daylight views (including one corrected Bluebell camera), four Medium night views and three Low daylight views. Every one passes the unchanged loading barrier and checks for the complete world, zero browser errors, zero failed requests and an uncreated audio context with zero active nodes. Device DPR is 1; actual canvas DPR is 0.6 for Medium and 0.5 for Low. These are appearance/correctness checks, not isolated timing benchmarks.

The 11-image `gallery.html` uses the final Medium images. Desktop 1440 px and mobile 390 px both load all images, have no horizontal overflow, no media playback elements and no page errors. `gallery-check.json` and the screenshots retain that proof.

Root inspected all five home fronts, rear detail, allotment, entry route, whole-village and night views. The initial pass exposed meadow grass through coping, coarse brick-joint overlays, and missing rear windows. Final source fixes all three. The first Bluebell framing was blocked by a streetlamp; `final-detail/bluebell-garden.png` is the corrected final camera and the gallery uses it. `first-day/` is earlier High reference evidence, not the final candidate.

## Remaining performance boundary

Two final **High/device-DPR1** captures reached the loaded world but remained behind the unchanged animation-readiness guard for 120 seconds:

| Run | Startup load/core | p95 frame time | Average FPS | Browser/audio |
| --- | ---: | ---: | ---: | --- |
| accepted-day | 1.92 | 66.6 ms | 21.86 | clean, silent |
| final-day | 2.35 | 63.7 ms | 21.03 | clean, silent |

System load subsequently rose sharply during both attempts. That observation neither proves a source regression nor excuses the failed acceptance. After two equivalent failures, the strategy changed to successful Medium/Low appearance validation. No third equivalent High retry, relaxed loader threshold or forced loader removal occurred.

High readiness and the prior aggregate Retina/day/night performance programme remain open. They require a sustained quiet shared-GPU window and a controlled diagnosis. No new performance win is claimed and no automatic continuation is scheduled. The earlier performance command set remains in `../village-v030-revival-20260928/VALIDATION.md` and `../remaining-world-polish-20260927/VALIDATION.md`.

## Reproduction

Run from `/Users/nellwatson/Documents/GitHub/MillOS`:

```sh
npm test
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run validate:depth
npm run validate:shaders
npm run validate:reachability
npm run validate:bundle
npm run validate:uncrewed
npm run validate:assets
```

To review the final scene against the local built preview, start `npm run preview -- --host 127.0.0.1 --port 4190 --strictPort`, then use the existing lock-owning capture harness with a new output label:

```sh
node output/village-gardens-20260928/capture.mjs review-medium --quality=medium --dpr=1 --benchmark=village --scenes=village,honey-garden,rose-garden,bluebell-garden,brick-garden,pearl-garden,allotment
```

Closing custody: all 19,373 candidate fingerprints match with zero mismatches. The task preview was closed through its own PTY after evidence collection. All capture/gallery-check browsers closed normally, and the capture lock is absent. The static gallery is queued in Codex. No task renderer or automatic continuation remains. No unrelated process was controlled.
