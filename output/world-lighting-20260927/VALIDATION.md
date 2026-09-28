# Lighting and model refinement validation

Status: visual implementation and source/runtime correctness checks pass. Final isolated day/night performance gates remain open because other projects continued rendering on the shared host. Local only.

## Scope and outcomes

All 146 current asset deliveries have explicit dispositions and all 13 scene families have refreshed day/night evidence in COVERAGE.md. Two delivery assets changed (duck albedo and bale geometry); the hedge unit delivery is retained inside three refined runtime assemblies. Other geometry is deliberately retained after review. Three reference-locked concepts and their accepted/rejected features are in concepts/CONTRACT.md. This is a finite refinement pass, not a claim that every model was rebuilt.

Lighting uses existing hall fixtures with warm-neutral colours, the existing hemisphere with a smooth bounded night-only lift, and two shadow-free downward canopy banks. The daytime key, IBL intensity, exposure and shadow budget remain unchanged. No additional textures are needed for lighting. Hedge crowns share the existing leaf atlas, wind and depth shader with one additional instanced draw per row.

## Terminal gates

Starting whole-suite baseline: 1,965 passes across 189 files, zero failing test names. Fresh scoped baseline: 107 passes across eight files. Final whole suite: **1,971 passes across 189 files**, zero failures, terminal exit 0 (validation/corrected-test.log). Delta: six added tests, zero new failures. The final focused rerun after restoring equivalent literals and test formatting passed 57 tests across three files, exit 0.

Final frozen-source commands all exit 0, with full output in validation/frozen-*.log and status in validation/frozen-results.json:

| Check | Result |
|---|---|
| npm run build | PASS, 3,636 modules, 34.16 seconds |
| npm run typecheck | PASS |
| npm run lint | PASS |
| npm run format:check | PASS |
| npm run validate:depth | PASS, 80 active files, 12 resolved relationships |
| npm run validate:shaders | PASS, 27 families, 31 stable cache keys |
| npm run validate:reachability | PASS, no new dead modules or graph misses |
| npm run validate:uncrewed | PASS |
| npm run validate:assets | PASS, 146 assets under unchanged limits |
| npm run validate:bundle | PASS, 164.77 MiB build; 0.48 MiB initial JS gzip |

The first post-cleanup reachability attempt correctly rejected stale dist. It was not bypassed: the source was rebuilt and the normal gate passed. Pre-existing JSDOM canvas-not-implemented warnings and Vite's aiEngine static/dynamic import warning remain visible in logs; neither is a new runtime error. Optional Impeccable is unavailable and was not installed. Actual rendered checks supply the visual evidence.

## Rendered acceptance

Root inspected 120 accepted world/detail frames: 41 medium-day, 41 medium-night, eight high-night, eight low-day, eight low-night, three dawn, three dusk, three storm and five model close-ups. Eight additional Blender views inspect the final duck and bale from four angles each; these are geometry/albedo views, not substitutes for live PBR.

The last source cleanup restored three unrelated 0.15 elevations from the numerically identical duck-draft constant to 0.15 literals, and removed test-only formatting changes. The resulting bundle hashes differ (build-equivalence.json), so the 120-frame set is retained as equivalent-behaviour evidence, not mislabelled as a byte-identical build. Three fresh final-build station/well/duck confirmations plus 24 paired-lighting frames were captured and inspected. No geometry/material/light value changed in that cleanup.

All 147 current live art/control frames have no page/console errors, no failed requests, zero audio nodes and no created audio context. Every automation browser is launched with --mute-audio. The canopy inspector verifies two downward SpotLights at world Y=4.21, targets at Y=3.21, distance 11.5 and no shadows. They are off at clear noon and intensity 30 at night. The rendered world has at most one shadow-casting light across all inspected tiers. The earlier default-local-Y spotlight error and its frames are explicitly superseded in superseded-emitter-offset/.

Self-review: the assistant authored the concepts and implementation and inspected the renders. The delegated duck correction was separately reproduced from immutable input and matched byte-for-byte. Machine proof does not replace Nell's aesthetic judgment.

## Same-page lighting isolation

The final built page switches only disableLightingPolish. Three on/off pairs are interleaved per night view, with on/off/on motion exclusion for pixels. paired-results.json contains the data and paired-night/ plus paired-noon/ contain original images and manifests.

| View | Stationary changed pixels as fraction of full frame | Mean changed-pixel luminance delta (0-255) | Mean timing delta | Control-only spread |
|---|---:|---:|---:|---:|
| Overview, night | 37.35% | 3.09 | +0.287 ms | 2.00 ms |
| Milling, night | 42.23% | 4.25 | +0.803 ms | 1.25 ms |
| Forecourt, night | 35.65% | 9.35 | -0.047 ms | 0.75 ms |
| Castle, noon | 0.00%, exactly zero pixels | 0.00 | Not measured | Not measured |

Draw calls are identical in every on/off arm for each view (764, 609 and 128 respectively); the shadow count stays one. This proves visible lighting contribution without additional mesh draws. It does **not** prove free lighting: forward-renderer fragment cost remains. Timing differences are below the repository's approximately 2 ms drift floor, and host load reached 11.12 to 16.46 per core during these samples. No speedup or resolved cost claim is made.

## Performance status

The first canonical five-scene attempt is preserved in superseded-emitter-offset/performance-day/benchmark.json. It failed overview and receiving p95 limits; water also failed p95, p99, 1% low and the long-frame-count check, with load/core 3.95 at water. This is failed evidence, not an accepted gate. It preceded the emitter-offset repair. Other projects' active renderers were observed during the later high-load window; none was interrupted.

A later run began at load/core 0.80 and passed overview, interior, shipping and receiving. Water failed only p95 (17.5 ms against the unchanged 16.7 ms ceiling), while averaging 70.3 FPS. CPU load/core at water was 1.60, so this is not classified as a CPU-contention failure. An unrelated Blender render overlapped the water sample; causality is unresolved. This second failure is preserved in performance-day-gpu-overlap/benchmark.json and overlap-note.json, with terminal exit 1 in validation/performance-day.log.

Further preflights found another active headless renderer and then an active Godot render even after CPU load fell below one per core. No equivalent benchmark was launched under those conditions. validation/performance-renderer-preflight.json records the final observation. The project capture lock serialises MillOS jobs, not independent renderers in other projects. None was interrupted.

**Remaining acceptance:** an isolated five-scene day pass and three-scene night pass under the existing budgets. The night budget run has not yet occurred because the serial gate stops on a failed day result. No limits have been relaxed. The paired art-mode samples above are not the native performance gate. Visual/source implementation is finished, but performance acceptance and therefore the entire continuation are incomplete.

Reproduce once the shared GPU is available (use a fresh output directory to preserve failed evidence):

```sh
npm run preview -- --host 127.0.0.1 --port 4190 --strictPort
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --duration=8 --warmup=5 --pa=off --output=output/world-lighting-20260927/performance-day-isolated
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --duration=8 --warmup=5 --pa=off --time=22 --scenes=interior,forecourt,castle --output=output/world-lighting-20260927/performance-night-isolated
```

The existing muted wrapper changes only browser launch audio muting; it imports the canonical benchmark unchanged. A further isolated timing failure requires diagnosis, including same-page lighting isolation for water, rather than repeated attempts or budget changes.

## Preservation and provenance

candidate.json pins 1,901 final source/model/config/build files. scope-custody.json compares 18,967 initial files: 21 existing files changed in this continuation, no missing files, plus two new production files. The castle delivery, asset budget manifest and all five castle navigation/access files are unchanged. Pre-existing dirty work is retained.

served-custody.json checks all 146 delivery files against public, dist and localhost HTTP bytes, plus 145 active provider-original packs and two quarantined original packs. All match. Only duck and bale rows changed in farm provenance and the normalization report (row-custody.json). Duck correction preserves all accessors, topology, skin/rig and non-albedo payloads; its reviewed mask protects bill and foot UVs. The helper and root-check/correction-report.json document the exact boundary.

scoped-source.diff is against baseline-SHA-matching inputs. Two missing/existing-late before-copies were recovered by reversing only known documentation/formatting edits and verified against the original baseline hashes; baseline/recovered/README.json records this. No production file was replaced in that recovery.

No push, deployment, dependency installation, audio playback, or unrelated process control occurred. No new native desktop pointer-lock, physical-device, or collision behaviour is claimed in this lighting pass; prior castle access evidence remains separate and its source is unchanged.

The task-owned preview was closed through its own PTY after custody checks (expected interrupt exit 130). Capture browsers closed through their own finally blocks. No execution or unattended retry remains active.
