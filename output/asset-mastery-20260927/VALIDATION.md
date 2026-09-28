# Validation and evidence

Self-review: the author of the refinements performed these checks. Art capture timings are excluded from performance acceptance.

## Required gates

- Fresh focused baseline: 26 passed, zero failures. Prior whole suite: 1,922 passed.
- Final whole suite: **1,933 passed across 183 files**, zero failures, exit 0. Delta: eleven added regressions. Duration 617.32 seconds.
- Production build: **passed**, `built in 38.22s`, exit 0.
- Typecheck, ESLint and whole-source Prettier check: passed.
- Depth, shader, reachability, bundle and uncrewed gates: passed.
- All 146 delivered asset contracts: passed, unchanged file/vertex/material/texture/bounds budgets.
- All 146 source/dist/HTTP delivery hashes match. All 145 declared provider-original hashes and runtime provenance match.
- Optional Impeccable executable is absent; no dependency was installed. Rendered and geometric checks supply the visual evidence.

[Whole test log](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/validation/full-tests.log) · [Build log](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/validation/build.log) · [Gate exits](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/validation/build-gates.json) · [Static check exits](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/validation/checks.json) · [Asset log](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/validation/final-assets.log)

## Runtime inspection

**112 accepted runtime frames** across the sets below. All show zero browser errors, zero failed requests, zero audio nodes and an uncreated audio context. Chromium was launched with `--mute-audio` before navigation; PA was disabled. Captures use real built assets, with service workers blocked. No audio or music was played.

| Set | Frames |
|---|---:|
| civic-final-high | 7 |
| civic-final-medium | 4 |
| civic-final-low | 3 |
| civic-final-night | 3 |
| scene-final-high | 24 |
| scene-final-medium | 16 |
| scene-final-low | 16 |
| scene-accepted-night | 16 |
| retail-final-high | 6 |
| retail-final-medium | 3 |
| retail-final-low | 3 |
| retail-final-night | 3 |
| tank-final-high | 3 |
| tank-final-medium | 1 |
| tank-final-low | 1 |
| tank-final-night | 3 |

Fountain landing opacity changes in the active-motion samples and remains constant under reduced motion. The source guard also retains visibility and game-speed handling. This runtime check measures the landing animation; it does not separately sample texture offsets.

## Failure reproduction and repairs

- Three civic geometry regressions failed on the original deliveries, then passed on the refined shelter, postbox and fountain.
- The initial fountain export exceeded the unchanged file budget. Continuous cylindrical UVs eliminated redundant vertex splits without changing its final triangle count.
- Runtime inspection corrected shelter uprights crossing the front of the back slats and falling-water tint that initially read as green cords.
- Retail ray tests reproduce the original solid-cabinet and slush-body occlusions and the incorrectly facing register plane, then verify the real transformed deliveries and screen placement.
- An initial canal test used the wrong layout property. That test typo was corrected to `exteriorFeatures`; the retained failed log is not a product failure.
- Both tank emission regressions failed before the correction and passed afterward. Four delivered models differ only in emission; geometry, transforms, textures and other material properties are identical.
- A baseline capture invoked the new fountain-motion assertion against the old model, which has no scuppers. It was rerun as a visual-only baseline.
- The local HTTP hash helper initially used Fetch, which rejects port 4190 as a reserved browser port. The final helper uses Node HTTP for the loopback server; all 146 served hashes match.
- The passing test suite emits the existing jsdom canvas-not-implemented warnings. The actual browser captures report no canvas or page errors.

## Performance

**Final unchanged five-scene gate: PASS, exit 0.** The repeat started at 1.18 runnable per core and remained between 0.89 and 1.12 during sampling, below the unchanged threshold of 3. Every timing and runtime check passed.

| Scene | Average FPS | p95 frame ms | Load/core | Verdict |
|---|---:|---:|---:|---|
| overview | 103.3 | 12.3 | 1.12 | PASS |
| interior | 109.7 | 10.6 | 1.06 | PASS |
| shipping | 108.0 | 11.1 | 1.03 | PASS |
| receiving | 101.4 | 11.2 | 0.99 | PASS |
| water | 96.8 | 12.1 | 0.89 | PASS |

This is the fixed medium-quality, reduced-motion benchmark at effective DPR 1.20. It establishes acceptance under this configuration, with no claim of measured speedup or identical performance at every camera and quality tier. All five snapshots report zero active audio nodes and no created audio context.

The first run remains recorded as exit 1 under 6.72 to 10.36 runnable per core. Its timing verdict was inconclusive. No budget was relaxed and no unrelated process was controlled. The fresh eligible host-load observation justified the repeat.

[Final benchmark report](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/performance-quiet/benchmark.json) · [Final terminal result](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/validation/performance-quiet.log) · [Prior contended failure](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/validation/performance.log)

The remaining performance gate is resolved. [Requirement-by-requirement completion audit](/Users/nellwatson/Documents/GitHub/MillOS/output/asset-mastery-20260927/completion-audit.json).

## Custody and review scope

Seven delivery GLBs changed: three civic geometries and four vessel materials. The other 139 deliveries are byte-identical. Four station assets gained runtime-only assembly refinement. Original files and the budget manifest are retained.

Earlier context captures establish retained geometry; the final vessel and 16-view night sets supersede obsolete background tank emission. The catalogue is a geometry review. Live frames are the material, foliage-alpha and assembly evidence.

**Local only. No push or deployment.**
