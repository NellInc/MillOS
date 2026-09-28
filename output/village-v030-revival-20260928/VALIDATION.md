# Village revival and canal boat, 2026-09-28

Status: local implementation and source/asset/visual validation complete. Aggregate Retina performance remains unaccepted.

## What changed

- Bakery, butcher and general-store signs now have fitted traditional lettering, enamel colours, gold framing and a trade crest. The pub, school, town hall and forge share the same physical signwriting treatment.
- The church restores the broad nave, rear bell tower and spire, with a rose window, pointed side windows, buttresses and dressed stone corners.
- The town hall restores the broad cream building, clock tower and blue swept cupola, with grounded columned entrances and clear approaches. Clock hands are static geometry.
- The Flour & Barrel restores hipped thatch and half-timbering, with a double-sided hanging sign. The school restores its cream frontage, open belfry and bronze bell.
- Flourish is a fully authored narrowboat: tapered navy hull, burgundy cabin, curved cream roof, brass portholes and fittings, teak decks, rope and traditional floral panels. Its existing night-glass shader now follows the new physical panes.

Reference: the locally preserved `codex/cleanup-preserve-millos-v030-20260912` branch at `20bcbe044fc6d7ca7275999fec63ddce83fd49d0`. Targeted read-only copies are in `reference/`. These are newly authored models, using the older silhouettes as the design reference.

## Delivered asset contracts

All five deliveries contain one mesh, one material and two textures. All 146 repository asset contracts pass. Existing byte, vertex, material and texture ceilings are unchanged; the reference-led building dimensions are deliberately updated.

| Delivery | Bytes | Render vertices | Width x height x length, metres |
|---|---:|---:|---|
| village-church | 343,188 | 14,352 | 11.24 x 20.155 x 13.65 |
| village-townhall | 477,704 | 19,860 | 13.94 x 18.32 x 14.61 |
| village-pub | 214,672 | 8,568 | 9.24 x 8.18 x 8.54 |
| village-school | 279,592 | 11,580 | 11.24 x 12.83 x 8.44 |
| world-canal-boat | 513,876 | 22,812 | 2.709 x 3.39 x 12.95 |

The boat stays below its existing 620,000-byte and 24,000-vertex limits. Evidence: `validation/accepted/assets.json` and `budget-custody.json`.

## Validation

- Baseline: 67 affected tests in five files pass; preceding whole-suite baseline 2,024 tests in 197 files passes on the exact preserved candidate hashes.
- Final affected geometry/clearance rerun: 40 tests in two files pass. The complete affected surface is also included in the whole suite.
- Initial final whole suite: 2,026 passed, one timed out, 197 files, 892.45 seconds. The failing test was `ProductionTargetWidget > closes to a launcher pill and re-opens the full card`, at the unchanged 10,000 ms timeout. Its unchanged focused rerun passes both tests, with 995 ms total test time. Logs are retained; no assertion, code or timeout was altered to obtain that result.
- Final unchanged whole-suite rerun: **2,027 tests in 197 files pass**, 418.86 seconds, exit 0. Delta from the starting whole-suite baseline: +3 tests, no new files, no remaining test failures. The initial timeout and focused rerun remain in the record.
- `npm run build`: exit 0, 3,645 modules, Vite reports 1m 34s; runner wall time 95.164 seconds.
- Typecheck, ESLint, formatting, depth, shader contracts, module reachability, bundle and uncrewed gates: all exit 0. Full logs and terminal-status JSON are under `validation/accepted/`.
- Optional Impeccable design linter is not installed. No package was installed. Actual scene renders, geometry tests and gallery overflow checks provide the visual evidence.

## Rendered evidence

Root self-review of changes authored in this task. Final accepted captures: 14 High daytime views, eight Medium night views and three Low daytime views. These are appearance checks, not performance passes. All 25 snapshots are ready, browser-error-free, request-failure-free and silent: zero active audio nodes and audio context never created. The original loading barrier was allowed to complete before each accepted capture.

Device DPR is 1 for accepted captures. Actual render buffers are 1200 x 750 for High, 960 x 600 for Medium, and 800 x 500 for Low, shown in a 1600 x 1000 viewport. See `review-summary.json` and each capture manifest.

Inspection covers text within frames, straight masonry and timber, rose-window clearance, the bell opening, grounded entrance steps, benches clear of the enlarged hall, attached boat strakes and selectively glowing porthole glass. Signs remain physically lit paint, so they are deliberately dark at night. No new lights or shadow passes were added.

`catalogue-final/` contains geometry/albedo reference views; the final hall rear-clock correction is superseded by `catalogue-hall-final/`. The gallery presents assembled final scene views. All 17 gallery images load at desktop 1440px and mobile 390px, with no horizontal overflow, media playback elements or page errors.

## Remaining performance boundary

The High/device-DPR2 run timed out after 120 seconds waiting for the animation-readiness screen to clear. Scene data and world readiness were true, with no browser/request errors, but p95 frame time was 120.7 ms over 1,240 samples. The loading screen correctly remained in place. Evidence: `high-day/failure.json` and `high-day/failure.png`.

The machine was shared with other renderers, and accepted appearance runs began at load/core approximately 4.19, 8.95 and 10.13. Contention does not turn the failed Retina run into a pass, nor does it prove the new assets caused that failure. Existing DPR2 day/night and Retina acceptance stays open until a sustained quiet shared-GPU window allows the unchanged benchmark and readiness gates to be measured. No thresholds, loader safeguards or unrelated processes were changed.

## Custody

The task began with 410 dirty entries. All 148 provider originals, 141 unaffected delivery models, protected castle/navigation/loading/performance files and dependency manifests remain exact. The scoped candidate records 19,371 fingerprints: 23 changed baseline source/asset files and one new production signage file. All 146 model deliveries and three existing print assets match between source public files, built dist files and HTTP-served bytes. See `scope-custody.json`, `served-custody.json`, `candidate.json` and the closing `final-seal.json`.

No push, deployment, external upload, added dependency, audio playback or unrelated process control. Local only.

Final seal: all 19,371 fingerprints rechecked, zero mismatches. The task-owned preview was closed through its own PTY (Ctrl-C, exit 1); capture browsers closed normally and the capture lock is absent. The static gallery is queued in Codex. No task renderer or automatic continuation remains.
