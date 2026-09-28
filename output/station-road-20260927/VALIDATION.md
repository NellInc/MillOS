# Validation

Local only. No push, deployment, audio playback, dependency installation or unrelated process control.

## Baseline and source custody

HEAD is unchanged at 3026399d411385f44780ddd11745b1927afe7ace. All 19,353 prior-candidate fingerprints matched before editing. Fresh affected baseline: 66 tests across four files, all passed. Previous full suite: 2,002 tests across 194 files, all passed.

This continuation changes four existing source files and adds one geometry module plus its test file. Final custody pins 19,355 files. All 842 original/delivery model files remain unchanged; all 146 delivery GLBs match public, dist and localhost HTTP bytes. Castle navigation/controller files, loading barrier, asset budgets and package configuration are unchanged. Evidence: baseline-custody.json, scope-custody.json, candidate.json, served-custody.json, validation/custody-final.log.

## Gates

- Affected tests: 73 passed across five files, adding seven geometry/connection tests. Evidence: validation/focused.log.
- Whole suite: 2,009 tests across 195 files, all passed, terminal exit 0. Delta: +7 tests and +1 file, zero failures. Evidence: validation/tests-final.log.
- Production build: PASS, 1 minute 3 seconds. Evidence: validation/build.log.
- TypeScript: PASS. Evidence: validation/typecheck-first.log.
- ESLint and formatting: PASS.
- Depth, shaders, reachability, bundle and uncrewed contracts: PASS.
- Delivery asset contracts: all 146 PASS.
- Static and asset evidence: validation/gates-final.log.
- Optional Impeccable: absent locally, no installation. Rendered evidence is retained separately.

The new tests raycast the actual pavement across both lanes and flares, follow the parking throat, reproduce the old sign obstruction and verify its new clearance, check both 64/128 terrain grids, check the road-edge gap, contain all paint inside the pavement and bound both geometries below 160 triangles each.

## Runtime evidence

Three baseline frames and fourteen current frames. All current captures have zero browser errors, failed requests and texture issues. Every capture reports zero audio nodes with an uncreated audio context. The existing shadow budget remains at most one light. See render-inventory.json and the manifests in final-medium, final-low, final-high and final-night. Root visually reviewed every current frame, plus the original overhead and entrance views.

Art captures establish appearance and runtime cleanliness. They are not uncontended frame-time measurements.

## Remaining aggregate performance acceptance

The preceding lighting/landscape continuation still requires canonical day/night frame-time acceptance and isolated Retina startup timing. During this pass, the read-only preflight found an active Ren'Py game and a Blender process, with high recent load. Idle Godot instances were not treated as blockers. No competing process was interrupted and no equivalent contended performance run was repeated. The causes of the earlier Retina hitches remain unisolated; no performance improvement is claimed and no budget was relaxed.

After this task's CPU validation ends, check the host for a genuinely quiet rendering window. If available, run the unchanged commands below against the frozen candidate:

```bash
cd /Users/nellwatson/Documents/GitHub/MillOS
npm run preview -- --host 127.0.0.1 --port 4190 --strictPort
# Run serially in another task-owned shell:
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --scenes=overview,interior,shipping,receiving,water --output=output/station-road-20260927/performance-day
node output/castle-white-blue-20260927/benchmark-muted.mjs --base-url=http://127.0.0.1:4190 --headed --quality=medium --pa=off --duration=10 --warmup=5 --time=22 --scenes=overview,interior,water --output=output/station-road-20260927/performance-night
node output/world-cohesion-20260927/startup/probe.mjs station-road-isolated-retina --dpr=2
```

Any failure reproduced without competing work needs diagnosis and repair before aggregate acceptance. No automatic continuation is scheduled.

## Final checkpoint

After the suite finished, all 19,355 frozen-candidate fingerprints still matched. The final 19:28:37 UTC preflight found active Blender (95.0% CPU) and Ren'Py (81.2% CPU), while the idle Godot instances were ignored. The final day/night and Retina timing runs remain pending an isolated window. Forecourt implementation and functional/visual acceptance are complete. The unchanged loading-barrier implementation retains its earlier evidence; this pass adds no new isolated Retina claim.

Task-owned preview session 11671 was closed through its own PTY after verification (exit 130). All capture browsers closed normally. No task renderer remains active.
