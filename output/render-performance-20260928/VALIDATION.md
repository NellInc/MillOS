# Renderer and duck pond refinement, 28 September 2026

Local only. Main checkout at `3026399d411385f44780ddd11745b1927afe7ace`. Existing authored work retained. All browser runs muted, PA off, audio context uncreated, zero active audio nodes. This is a self-review of work produced in this session.

## Outcome and remaining gate

- Duck pond replacement complete, integrated and visually inspected in the actual village at High daytime, Medium night and Low daytime.
- The previously reproduced High/Retina loader failure now clears naturally. Neither readiness thresholds nor timeouts were weakened. Final High daytime capture also passed without the diagnostic WebGL hook.
- Whole-world Medium frame-pacing acceptance remains OPEN. The last accepted candidate failed six of seven scene pacing budgets. The new Medium overview paired measurements do not establish an improvement. Heavy unrelated machine load prevents a credible final quiet-host gate; the final observed one-minute load was 189.78 across ten cores. No unrelated process was stopped.
- No claim of universal 60 FPS or completion of all world performance work. No push or deployment.

## Renderer diagnosis and change

`src/shaders/punctualLightCulling.ts` guards the stock point/spot direct-light BRDF only when Three has already calculated exactly zero incident light. All light counts, positions, radii, authored intensity, active contributions, directional/indirect equations and quality presets remain. The patch is restricted to Standard/Physical materials, installed before compilation, and fails explicitly if the installed Three chunk contract changes. Its diagnostic reference uniform defaults to zero in production, with no material hooks or upload work.

The prior High village failure was reproduced in `optical-harness/report.json`. AO removal saved around 12 to 14 ms but left 59 to 65 ms frames; Bloom differences were smaller than control variation. Neither appearance setting was weakened. AO/Bloom isolation flags are now available through the existing perf-debug interface and benchmark aliases.

`culling-control/report.json` compares stock and guarded equations on one page, toggling a uniform in the same compiled programs, with three interleaved stock samples and four guarded samples. High village guarded/stock frame-time ratios were 0.717, 0.699 and 0.690; stock spread 0.27 ms. High night interior ratios were 0.844, 0.844 and 0.891; stock spread 1.67 ms. Medium overview ratios were 1.041, 1.001 and 0.972, so no Medium improvement is established. These are diagnostic deltas under severe external load, not quiet-host budget acceptance.

Matched day/night frames retain lighting. The on/off/on static-pixel comparison is recorded in `culling-control/pixel-check.json`; small residual differences remain, so these are not claimed to be literally pixel-identical. All paired pages reported no console/page errors or failed requests.

## Authored duck pond

The provider geometry was replaced with independently authored geometry using the existing civic-prop builder:

- Three running-bond courses, 192 individual bricks, recessed mortar and 64 bevelled limestone coping stones.
- Level water, seven planted shelves, folded reed leaves and cattail heads.
- Original 11 x 10.956 m footprint and 2.195 m envelope retained. Source water remains at 0.80 m, with the existing 0.45 m runtime sink. Ducks, lilies and village placement remain unchanged.
- One material, two textures, 8,133 triangles, 24,399 render vertices and 506,892 bytes. Passes the existing asset limits.
- One live mesh shares the existing animated-water material. No additional light or water surface. The historical runtime inspection identifier is retained for capture-tool compatibility.
- Provider original is unchanged: SHA256 `8e92cc6519cd7c2cc04c7d95813e46df7233ae2183a02f3f6be9e67c4307379d`.
- Public asset, production-build asset and served local HTTP bytes share SHA256 `e57bc5277b602a0e17d1f6a3aadb8461fda5b018aba9be252bccf43ccd29fca0`.

Final images and manifests: `../duckpond-polish-20260928/final-day/`, `final-night/` and `final-low/`. Nine final captures, zero browser errors or failed requests, loader cleared naturally in all three quality runs. The earlier `catalog/` contains an intermediate over-budget mesh and is not final acceptance evidence.

The new geometry regression failed against the old pond (coping ray returned 0.8344 m instead of 1.12 m), then passed against the replacement. It probes 32 coping heights, 32 water heights and front-facing inner-wall geometry. Existing water-mask and reduced-motion tests pass.

## Validation

Starting focused baseline: 104 tests across four files passed, no failing tests. Last accepted full candidate: 2,049 tests across 199 files. Final: **2,054 tests across 200 files**, zero failures, delta +5 tests and +1 file.

| Gate | Terminal result |
|---|---|
| npm test | 200 files, 2,054 tests passed; exit 0 |
| npm run build | built in 1m 2s; exit 0 |
| npm run typecheck | exit 0 |
| npm run lint | exit 0 |
| npm run format:check | exit 0 |
| validate:depth, validate:shaders, validate:reachability | each exit 0 |
| validate:bundle, validate:uncrewed | each exit 0 |
| npm run validate:assets | all 146 assets pass; exit 0 |
| git diff --check | exit 0 |

Actual logs are in `validation/final/`; the asset and focused-test logs are in `../duckpond-polish-20260928/`. The full test run emits jsdom canvas-not-implemented warnings but completes successfully. Native browser captures verify the actual WebGL material. Optional Impeccable is absent; no dependency was installed. Rendered inspection was performed directly.

## Custody

`scope-custody.json` records 17 changed baseline files and two new shader/test files, with no unexpected changes or missing files. All 148 provider-original files and 145 of 146 runtime GLBs are unchanged. Only the pond delivery changed. `candidate.json` fingerprints the integrated source/assets/build. `final-seal.json` checks that candidate after all gates.

## Next performance acceptance, when the host is quiet

Keep the existing frame budgets. With load below the documented three runnable-per-core warning threshold and no other renderer active, run the normal seven-scene gate on this sealed candidate:

```sh
node scripts/run-performance-benchmark.mjs --quality=medium --device-scale-factor=2 --scenes=overview,interior,shipping,receiving,water,farm,village --duration=8 --warmup=5 --pa=off --headed --output=output/render-performance-20260928/quiet-medium
```

No `--art`, no `--report-only`, no disabled systems, no loosened budget. Any remaining failure needs fresh causal profiling under those quiet conditions. This command is recorded for continuation, not launched or scheduled under the present load.
