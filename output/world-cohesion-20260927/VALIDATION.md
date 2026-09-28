# Validation and remaining gate

## Candidate and authority

Local only. HEAD remains `3026399d411385f44780ddd11745b1927afe7ace` on the existing dirty main checkout. No push, deployment, remote mutation or audio playback. `candidate.json` pins 19,353 source, script, model and build files. `scope-custody.json` records 14 changed baseline source files and nine new source files, with unrelated work preserved.

All 842 inventoried model/source-pack files are unchanged in this continuation. All 146 delivery GLBs match public files, built files and localhost HTTP bytes (`served-custody.json`). Castle access/navigation, asset budgets, package files and Vite configuration remain unchanged. Package/config hashes match the unchanged HEAD; they were absent from the initial fingerprint, so the earlier comparison against the prior lighting inventory was invalid and its failed assertion is retained in `validation/custody-first.log`.

## Final machine gates

| Gate | Terminal result | Evidence |
|---|---|---|
| Production build | PASS, 14.34 seconds | validation/build-frozen.log |
| Whole suite | 2,002 tests, 194 files, all passed | validation/tests-frozen-final.log |
| TypeScript, ESLint, formatting | PASS | validation/static-frozen-final.log |
| Depth, shaders, reachability | PASS | validation/static-frozen-final.log |
| Bundle and uncrewed contracts | PASS | validation/static-frozen-final.log |
| Delivery asset validation | 146 passed; model bytes unchanged afterward | validation/gates-complete.log and validation/custody-final.log |
| Culvert geometry, dry tail and both terrain grids | 10 passed | validation/dry-tail-focused.log |
| Optional Impeccable design lint | Unavailable locally, no install attempted | validation/impeccable.log |

Baseline was 1,971 passing tests in 189 files from the preceding accepted source. Fresh affected baselines were 51 landscape tests and 30 startup tests, all passing. Final whole-suite delta: +31 passing tests, +5 test files, zero failures. The jsdom suite prints its pre-existing unimplemented canvas-context diagnostic; real Chromium captures provide WebGL proof separately.

## Runtime and visual proof

Two actual-reference concepts informed this pass. Thirty-seven main day/tier/night frames cover village gardens, field boundaries, meadow relief, hollow, station, interior, lock front/rear and water. Corrective water frames explicitly supersede earlier floating-bank and striped-sheet variants. The final bank is captured on high, medium and low in `final-bank-*`; final falling water is in `completed-water-high`, `completed-water-low` and `completed-water-night`. The gallery selects the current bank view.

Every accepted frame has empty browser-error and failed-request arrays, zero texture issues, a complete world-integrity inventory, zero active audio nodes and an uncreated audio context. Runtime light inspection confirms the retained two downward station spots at Y=4.21 and at most one shadow caster. Added hedge geometry is actually present as 1,047 instances. All render tools use the shared capture lock and mute Chrome before navigation.

High-quality capture at DPR 2 initially timed out waiting for settled startup. High at DPR 1 passed. This is a high-resolution performance limitation observed during competing work, not a verified high-DPR performance pass. No readiness timeout was shortened to conceal it.

## Startup reproduction and final matrix

The normal-page harness uses fresh browser contexts with service workers blocked, normal application UI, production animation, PA off and muted Chrome. It records every RAF and the loader/world/batching/readiness flags. Screenshots and scene traversal are outside a separate untouched 12-second timing interval.

Baseline loader disappeared at 5.27 seconds before world-ready, with a 134.7 ms reveal frame and 19 subsequent intervals over 50 ms. The full-scene readiness implementation instead waits for pending Three assets, lazy imports, procedural cache work, registered static batches, and 45 stable rendered intervals. It never manufactures readiness at a timeout.

| Final case | Reveal | Untouched p95 / maximum | Intervals >50ms |
|---|---:|---:|---:|
| Normal, DPR 1 | 19.84 s | 25.0 / 33.3 ms | 0 |
| Castle GLB held for 12 s | 18.83 s | 25.1 / 74.9 ms | 2 |
| Castle GLB intentionally 404 | 19.81 s | 25.9 / 41.7 ms | 0 |
| Reduced motion | 25.32 s | 26.3 / 34.6 ms | 0 |
| Retina, DPR 2 | 20.87 s | 41.5 / 117.2 ms | 5 |

All five cases satisfy the work barrier before revealing. The delayed-resource screenshot shows the opaque loader at 533/535 while the GLB is held; it only proceeds after release. The 404 case records 17 real fallback objects and filters only the intentional castle failure. No unexpected HTTP, console or page errors occurred. Reduced motion removes the fade. All cases are silent.

The delayed and Retina timing results above overlapped CPU validation and other projects' renderers. Those hitches remain findings, not a clean timing verdict. A follow-up with this task's CPU gates finished is recorded separately below. This loader measures the starting camera; it is not a guarantee of smooth rendering on every device or after every camera change. Slow settings expose explicit Reload and Continue while preparing controls.

### Follow-up after this task's CPU gates finished

| Case | Reveal | Untouched p95 / maximum | Intervals >50ms |
|---|---:|---:|---:|
| Retina, DPR 2 | 21.58 s | 41.7 / 91.6 ms | 3 |
| Castle GLB held for 12 s | 22.92 s | 25.3 / 66.9 ms | 2 |

Both current-build runs satisfy the work barrier, have no unexpected request/page/console errors and retain zero audio nodes with no audio context. The delayed screenshot still has the opaque loader at 20.83 seconds while the resource is held. Evidence: `startup/quiet-retina/report.json` and `startup/quiet-delayed/report.json`. The directory prefix means this task's CPU validation had finished; it does not mean the shared GPU was uncontended.

Other projects' renderers remained active. The final read-only preflight at 18:24:11 UTC found an active Ren'Py process at 55.6% CPU; the two idle Godot processes were not counted as active contention. The Retina hitches remain unresolved and their cause is not isolated. Repeating an equivalent timing run under the same overlap would not settle that question. No unrelated process was controlled.

## Repairs discovered by validation

- Hedge prototype: 1,538 crowns exceeded the new 1,500-instance ceiling. Reduced to 1,047, without changing the ceiling.
- Culvert prototype: 2,264 triangles exceeded the existing 2,000-triangle ceiling. Reduced to 1,908, without changing the ceiling.
- Whole suite found the eastern knoll reaching skyline building feet on both grids. Moved the knoll, keeping the city tests unchanged.
- The new water shader needed its stable cache-key contract advanced; stale v10/v11 expectations were updated to the actual v12 source.
- Terrain-fitted culvert tails initially stopped too close to the rounded channel end. The dry-tail check caught the eastern high-tier margin at -1.674 m. Extended the bank to 26 m; the unchanged 0.5 m dry-margin test now passes on both grids.
- The initial custody check looked for package hashes in a prior inventory that did not contain them. Corrected the measurement to compare those clean files with exact HEAD bytes.

Superseded failures are retained in `validation/`, rather than edited into passing reports.

## Performance acceptance

The preceding lighting continuation still requires the unchanged canonical day and night gates. Current source adds no lights or reflection passes and uses bounded shared geometry, but those facts do not prove frame-time acceptance.

Read-only preflight after this task's CPU validation finished found active Ren'Py and Godot workloads from other projects. Idle Godot instances were not treated as blockers. Active workloads, and the unresolved Retina pacing result, prevent an uncontended performance verdict. No other process was interrupted. `validation/performance-preflight.json` records the observed state.

Once a quiet shared-GPU window is available, the remaining canonical commands are:

```bash
cd /Users/nellwatson/Documents/GitHub/MillOS
npm run preview -- --host 127.0.0.1 --port 4190
# In a separate task-owned shell, with only one renderer active:
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --scenes=overview,interior,shipping,receiving,water --output=output/world-cohesion-20260927/performance-day
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --time=22 --scenes=overview,interior,water --output=output/world-cohesion-20260927/performance-night
```

No art-mode samples, averaged shader-program counts, or partial gate results substitute for these budgets. No budgets have been relaxed.

## Final checkpoint

`final-seal.json` rechecked 18,508 source, script and built-file hashes after the final suite, with zero mismatches and unchanged HEAD. Separate final custody verifies the 842 original/delivery files and 146 localhost deliveries. The offline gallery loads all 16 images, has no horizontal overflow at 1440 px, and contains no audio or video (`gallery-check.json`).

Implementation, machine gates and visual review are complete for this finite landscape/startup/lock pass. Aggregate performance acceptance remains open, including the preceding lighting gate. The next required work is an isolated day/night budget run and Retina startup timing on this frozen candidate. Diagnose any reproducible failure before changing source or budgets. This is local-only work, with no automatic continuation scheduled.

Task-owned preview session 2620 was closed through its own PTY after final served-byte and fingerprint checks (expected interrupt exit 130). Gallery and runtime browsers closed normally through their own finally blocks. No task renderer or automatic continuation remains.
