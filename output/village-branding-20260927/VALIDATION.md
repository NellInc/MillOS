# Validation and remaining performance boundary

Local only. No audio playback, publication, dependency installation or unrelated process control. Source is frozen after the final corrected model and sign build.

## Passed on the final candidate

- Baseline: 64 affected tests in four files, no failures; preceding full suite 2,021 tests in 196 files. All 19,358 preceding candidate fingerprints matched at the start, with 403 existing dirty entries preserved.
- Final affected gate: **67 tests / five files pass**, 20.51 s (`validation/affected-accepted.log`). Delta: +3 tests, +1 file.
- Final whole suite: **2,024 tests / 197 files pass**, exit 0, 389.80 s (`validation/full-tests-accepted.log`). Delta: +3 tests, +1 file. Two preceding intermediate whole runs also passed 2,023 tests; those predate the final trailer occlusion regression and are not substituted for this final run.
- Final build: **PASS**, Vite 37.01 s (38.525 s including launcher), `validation/build.log`.
- TypeScript, ESLint and Prettier: **PASS**, `validation/checks.json` and named logs. Scoped `git diff --check` is clean.
- Depth, shaders, module reachability, bundle and uncrewed gates: **PASS**, `validation/build-gates.json`.
- All **146 delivered asset contracts pass**, `validation/assets-accepted.log`. Real delivery tests cover front-face roof undersides, planar normals and ground datums. All seven new buildings retain one mesh/material and stay beneath the existing byte, texture and vertex ceilings. School height changes only to remove the old turf-disc datum; ceilings are unchanged, also checked against HEAD (`budget-custody.json`).
- **34 accepted runtime appearance views** are browser-clean and silent (`accepted-frames.json`), with Day/Night and Low/Medium/High coverage. Every accepted audio context remains uncreated, with zero active nodes. Shadow-light count stays at most one. Fourteen final catalogue views cover the seven buildings from front and rear. These are visual evidence, not timing acceptance.
- **19,370 candidate fingerprints**, 148 unchanged provider-original files, 139 unchanged delivered models, and 146 model plus three graphic public/dist/HTTP matches (`candidate.json`, `scope-custody.json`, `served-custody.json`, `final-seal.json`). Castle/navigation, forecourt/canal work, the loading barrier, dependencies and performance limits remain intact. The retired TruckBay logo edit is fully restored to its baseline bytes.
- Gallery: 18 loaded images, no horizontal overflow at 1,440 px, zero audio/video elements. Final linked replacements have the same image dimensions and were inspected directly.

The root authored and reviewed this work. Optional Impeccable and SVGO are absent locally; neither was installed. Actual rendering, alpha/size checks, the existing asset gates and source checks supply the relevant evidence.

## Failed performance gate, kept separate

The final preflight briefly cleared: load/core 1.49, no active external renderer. The unchanged Medium benchmark then ran with device DPR 2 (effective renderer DPR 1.20), 5 s warmup and 10 s sampling. All five scenes completed, with continuous world geometry, clean browser diagnostics and no audio. **The performance gate failed, exit 1.**

| Scene | Average FPS | p95 ms | Load/core | Failed checks |
|---|---:|---:|---:|---|
| overview | 53.28 | 23.2 | 2.82 | firstFrame, averageFps, p95Frame, onePercentLow |
| interior | 56.05 | 20.8 | 2.69 | firstFrame, averageFps, p95Frame |
| shipping | 41.69 | 28.4 | 3.13 | averageFps, p95Frame, p99Frame, onePercentLow |
| receiving | 48.75 | 23.6 | 3.00 | firstFrame, averageFps, p95Frame, onePercentLow |
| water | 28.77 | 59.9 | 21.20 | firstFrame, averageFps, p95Frame, p99Frame, onePercentLow, framesOver50Ms |

A separately launched Blender process appeared during this run. The post-run preflight finds it active (PID 35139, 14.8% CPU), with load/core 15.65. The water sample reached load/core 21.20. This prevents attributing the measured deterioration to these asset changes; it does not turn failed acceptance into a pass. Earlier scene samples also fail below the CPU warning threshold, so CPU load alone cannot explain away the results. No performance or startup-readiness limit was relaxed.

Night performance and ordinary Retina startup remain unaccepted. No equivalent contended rerun was launched and no other project's renderer was controlled. The remaining dependency is a sustained quiet shared-GPU window for diagnosis and the unchanged acceptance commands below. There is no unattended continuation mechanism.

From the repository root, with the local preview at 127.0.0.1:4190:

```sh
node output/village-branding-20260927/performance-preflight.mjs next-preflight
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --scenes=overview,interior,shipping,receiving,water --output=output/village-branding-20260927/performance-day-quiet
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --time=22 --scenes=overview,interior,water --output=output/village-branding-20260927/performance-night-quiet
node output/world-cohesion-20260927/startup/probe.mjs village-branding-retina --dpr=2
```

The last command writes under the established world-cohesion startup evidence directory. All render scripts acquire the capture lock. A quiet preflight does not authorize process termination.

Task-owned preview session 92090 closed through its own session (Ctrl-C, exit 130) after served-byte verification. Capture browsers closed normally, the capture lock is absent, and the final seal rechecks all 19,370 fingerprints with zero mismatches. The 18-image static gallery is queued for display in Codex. No task renderer or automatic continuation remains.
