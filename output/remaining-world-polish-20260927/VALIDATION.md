# Validation and remaining boundary

Local only. No audio, publication or unrelated process control. Source is frozen after the final build.

## Passed

- Fresh baseline: 83 affected tests in seven files, then five office-lighting tests before that component changed. No baseline failure in those focused sets.
- Full current suite: **2,021 tests / 196 files pass**, exit 0, 712.72 seconds (`validation/tests-final.log`). Nine tests added versus the preceding 2,012-test candidate. Both prior timeout cases pass in this complete run. This closes the previous whole-suite gate.
- Final build: **PASS**, 56.81 seconds (`validation/build.log`).
- TypeScript, ESLint and Prettier: **PASS** (`validation/checks.json` and corresponding logs).
- Depth, shaders, module reachability, bundle and uncrewed gates: **PASS** (`validation/build-gates.json`). Shader registry: 29 families, 33 stable keys, 25 definition sites.
- All **146 asset contracts pass** (`validation/assets-final.log`). Coffee geometry/texture equality: `assets/coffee-custody.json`.
- All **52 final runtime captures are silent and browser-clean**. At most one shadow-casting light; the existing two canopy spotlights remain at their lens datum. Pond injection present, 6,967 original vertices retained. Grass tier counts are 0 / 1,050 / 3,000 at Low / Medium / High.
- Storm capture exercises active animation followed by reduced motion. Existing fountain emission varies over four samples, then freezes exactly over three. Pond and shared water phase freeze/resume have direct component tests.
- **19,358 fingerprints**, 839 unchanged model-related files, and 146 public/dist/HTTP asset matches. The three changed model-related files are the prepared coffee GLB, delivered coffee GLB and world provenance JSON. Provider originals, castle/navigation, loading policy, manifest ceilings, dependencies and Vite configuration are preserved (`scope-custody.json`, `served-custody.json`, `candidate.json`).
- Gallery: 16 images, no overflow at 1,440 px, zero audio/video elements (`gallery-check.json`).

Optional Impeccable is not installed locally. No dependency or skill was installed to obtain it. Rendered review and functional checks were performed instead.

## Performance remains unaccepted

Appearance checks use DPR 1 and are not performance results. The previous five-scene DPR 2 day benchmark misses its unchanged p95 budget (17.2 to 17.6 ms), including early scenes below the CPU-load warning threshold. The water scene also misses first-frame latency. Two previous High/DPR 2 runs remained behind the intact loading barrier. Those failures are retained in `output/concept-realisation-20260927`; they are not excused or converted into passes here.

This pass's quiet-window preflights continue to find an active unrelated Ren'Py renderer. The post-capture preflight reports PID 62066 at 93.9% CPU and load/core 5.18. The final preflight still finds the same Ren'Py PID at 86.5% CPU and load/core 6.79 (`final-performance-preflight.json`). Idle Godot instances are not classified as blockers. No contended canonical benchmark is repeated and no readiness/performance limit is weakened.

Remaining required work is an isolated day/night benchmark and Retina startup measurement on this final candidate, followed by diagnosis and repair of any reproduced failure. A quiet shared-GPU window is the external dependency. There is no unattended continuation mechanism.

From the repository root, with the local preview at port 4190, the unchanged acceptance commands are:

```sh
node output/remaining-world-polish-20260927/performance-preflight.mjs before-performance
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --scenes=overview,interior,shipping,receiving,water --output=output/remaining-world-polish-20260927/performance-day
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --time=22 --scenes=overview,interior,water --output=output/remaining-world-polish-20260927/performance-night
node output/world-cohesion-20260927/startup/probe.mjs remaining-world-retina --dpr=2
```

The last command writes its evidence under the existing world-cohesion startup directory. Run renderers sequentially under the existing capture lock. The preflight is a prerequisite, not permission to terminate other projects.

Task-owned preview session 62561 closed through its own PTY (Ctrl-C, exit 1) after served-byte and final-seal verification. All capture/gallery-check browsers closed normally and the capture lock is released. The static local gallery was queued for display in Codex. No task renderer or automatic continuation remains.
