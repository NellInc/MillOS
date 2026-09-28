# Current validation boundary

Local only, silent. HEAD remains `3026399d411385f44780ddd11745b1927afe7ace`; unrelated dirty work is retained. The implementation and its focused checks pass. Aggregate acceptance remains open.

## Passed gates

* Affected baseline: 38 tests / 4 files, zero failures. Final affected suite: 41 tests / 4 files, zero failures, three added tests (`validation/focused-final.log`).
* Production build: PASS, 40.98 seconds (`validation/build-final.log`). No application source changed after this build.
* TypeScript, ESLint, Prettier: PASS (`validation/*-final.log`). Benchmark harness syntax and formatting also pass after its observation-gate repair.
* Depth, shaders, reachability, bundle, uncrewed and all 146 asset contracts: PASS (`validation/static-final.log`, explicit terminal gate statuses).
* 20 current art/control frames across Medium/DPR2, Low/DPR1, High/DPR1 and night: clean, no texture issues, zero active audio nodes and an uncreated audio context (`render-inventory.json`). Two station spots remain at Y 4.21 with no shadow map; at most one scene light casts shadows.
* Same-page lighting on/off/on changes 41.73% of stable pixels. This proves visible contribution, not a performance improvement (`lighting-control/pixel-comparison.json`).
* 842 original/delivery model files remain unchanged; all 146 GLBs match public, build and localhost bytes. Castle/navigation, loader thresholds, resource ceilings and dependencies remain unchanged (`scope-custody.json`, `served-custody.json`).
* Optional Impeccable executable is unavailable. Nothing was installed.

## Whole-suite gate: NOT ACCEPTED

Prior full-suite baseline: 2,009 passes / 195 files. The current suite contains 2,012 tests, three additions.

1. First run: 2,011 passed, one failed, 753.01 seconds. `CameraPresetMenu.test.tsx > compact camera disclosure > keeps all seven touch targets in a viewport-bounded scroll region` timed out at 10 seconds. Its isolated file passes all three tests in 2.10 seconds; the case itself takes 411 ms. Evidence: `validation/tests-final.log`, `validation/camera-timeout-isolation.log`.
2. Second run, with our capture browsers closed: 2,011 passed, one failed, 1,783.26 seconds. The mobile-camera case passes, but `scripts/restore-authored-asset-attributes.test.mjs > requires opt-in for omitted numerical slivers and records their strict area limit` times out at 10 seconds. That isolated file passes all 13 tests in 7.28 seconds, including the case in 421 ms. Evidence: `validation/tests-rerun.log`, `validation/restore-timeout-isolation.log`.

Neither timed-out test was changed. These moving timeouts are consistent with contention, but isolated greens do not substitute for the whole gate. No test timeout was raised and no check was removed. A third equivalent loaded rerun was deliberately not launched. After the second run, load/core was 24.96 with active Ren'Py and Godot rendering (`after-suite.json`). Other projects' processes were not controlled.

## Performance gate: NOT ACCEPTED

The benchmark's obsolete 12-second loader assumption failed before measurement (`validation/performance-day.log`). Its observation now waits for the real `millosStartupReady` signal and absence of the overlay through the existing bounded diagnostic helper. This does not change application readiness or any performance budget.

The ensuing five-scene day run finishes with clean diagnostics and 65.4 to 71.7 average FPS, but every scene misses the unchanged p95 limit at 17.2 to 17.6 ms. Water also misses first-frame latency. Load/core is 1.56 to 2.45 for the first three scenes, then 3.02 and 3.42. Those early failures cannot simply be excused by the later load warning. Evidence: `performance-day-ready/benchmark.json`, terminal exit 1 in `validation/performance-day-ready.log`.

Two High/DPR2 art attempts reach complete assets/world/static batches but remain behind the animation barrier, with p95 approximately 92 to 98 ms. The second has lower CPU load. Both failures are retained in `final-high` and `final-high-retry`. High/DPR1 passes appearance capture; it does not prove High/DPR2 pacing.

Before the night and Retina probes, new Blender/Ren'Py activity and load/core 3.91 fail the preflight. The post-suite state worsens to load/core 24.96 with active Ren'Py/Godot. No equivalent contended render was launched. Night, normal Retina-startup and aggregate performance acceptance remain open.

## Remaining authorised work

Obtain a quiet shared-rendering window, with no unrelated active renderer and low sustained host load. Run the whole suite with no task-owned captures/builds alongside it. Then run the unchanged medium day and night frame budgets and the ordinary Retina-startup probe serially. If day p95 or High/DPR2 startup still fails without overlap, isolate the actual cost in the same page before changing source; retain budgets and the loader barrier.

Commands, from the repository root, with a local preview on port 4190:

```sh
npm test -- --reporter=dot
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --scenes=overview,interior,shipping,receiving,water --output=output/concept-realisation-20260927/performance-day-isolated
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --time=22 --scenes=overview,interior,water --output=output/concept-realisation-20260927/performance-night-isolated
node output/world-cohesion-20260927/startup/probe.mjs concept-realisation-isolated-retina --dpr=2
```

No aggregate completion, publication or unattended continuation is claimed. Self-review: the assistant authored the changes and inspected the current runtime captures.

Task-owned preview session 96045 closed through its own session after served-byte verification (exit 130). All capture browsers closed normally. The final seal checks 19,356 fingerprints with zero mismatches. No task renderer or automatic continuation remains.
