# MillOS: square to waterside

2026-09-28. Local only. Root self-review of work authored in this task.

The approved [goal](GOAL.md) is 3,309 characters. It covers the complete eight-part composition programme, rather than another isolated asset replacement. The white-and-blue castle, v0.30-derived civic buildings, shops, signs, boat and existing landscape remain the starting point.

## Programme disposition

| Priority | Implementation and evidence |
|---|---|
| Village composition | A restrained stone-and-brick frame defines the market square; the fountain and stalls retain open circulation. Shop thresholds, a church approach, enclosed churchyard, pub court and school frontage give buildings grounds of their own. `WorldPublicRealm.tsx`, matched `baseline` and `final-medium` cameras. |
| Surface junctions | Metre-scale paving follows the actual 64/128 terrain grids. Capped walls, thresholds and drains finish edges. The public surfaces write depth, so the terrain cannot overwrite them. Geometry tests check every paving vertex, finite normals, streets and civic approaches. |
| Shared construction palette | Gardens and district connections use the same cream, pale stone, warm brick, oak and iron palette. Farm paths use earth tones; the mill's functional hardstanding and the station's established red/cream identity remain. No blanket tint is applied to existing textured models. |
| Waterfront | The bakery-to-pond passage reaches a widened towpath and mooring court. A northern route goes around the cottage garden. Bridge stairs meet the measured 1.335 m deck, with iron handrails, shared walking heights and an east-bank path through an actual pedestrian opening in the mill fence. Coping-level mooring rings serve the existing boat. |
| Gardens and natural planting | Honey Cottage has asymmetric borders, Rose Gable a tiled courtyard and pots, Bluebell a lawn and long side border, Brick & Sage kitchen beds and climbing plants, and Pearl staggered flower beds. Existing field hedges, groves, hillocks and canal/river relief are retained. A bridge-side tree is moved out of the landing. Both local village grass and global meadow grass exclude the new paving. |
| Working approaches | The farm's earth-toned track connects the field and windmill to the side of the existing barnyard, clear of the field culvert. The farmhouse and kitchen garden have connected paths. The station footway goes behind the parked cars, around the caravan and to the real side door, with links to the admin and visitor buildings. The forecourt road remains clear and unchanged. |
| Lighting and efficiency | The existing daylight hemisphere gains a subtle earth/masonry hue blend at exactly unchanged linear luminance. The established night fill, lamps and warm windows remain. Paired daytime captures prove a real, small colour change. No new light, shadow pass, texture or per-frame geometry work. High startup and Retina costs are measured separately below. |
| Purposeful detail and restraint | Added benches serve civic courtyards and the quay; rings serve moorings; walls define usable plots; drains belong at paving edges. No extra scattered props or dense tree blanket. Reduced cottage roof-course detail and simpler garden planting save 1,488 triangles while retaining distinct silhouettes. |

## Geometry and navigation

`geometry-report.json` is generated from actual production modules through the installed Vite runtime:

- Public realm: 14,046 triangles, six meshes before existing static batching, below the 15,000-triangle ceiling.
- Village: 870 paving triangles and 5,640 solid-detail triangles.
- Farm: 312 paving and 816 solid-detail triangles.
- World connections: 2,348 paving and 4,060 solid-detail triangles at either terrain tier.
- Five homes, glazing, gardens and allotment: 37,352 triangles, down from 38,840, within the unchanged 40,000-triangle ceiling.
- No new texture, light or animation loop. One shadow-casting light remains the runtime ceiling.

Thirteen public-realm tests check merged finite geometry, real terrain seating, existing street and doorway clearance, meadow/local-grass exclusion, distinct garden arrangements, caravan clearance using its delivered GLB bounds, the real fence opening, and bridge steps against the delivered bridge geometry. Walking tests cross both stair flights in both directions and reject stepping off the elevated deck sides. Existing castle tests remain unchanged and pass.

The desktop and mobile controllers already consume the shared walking floor. The physics controller required its regional sweep gate to include the bridge. A new controller-level regression test first failed at camera height 2.48 m instead of 1.835 m, then passed after the gate and grounded spawn were extended. This verifies controller integration with mocked Rapier displacement; it is not a hardware/input-device acceptance test. Existing castle controller tests also pass.

## Review corrections retained in evidence

1. The first paving material did not write depth. Runtime images showed terrain painting over it despite valid geometry. Opaque depth writing corrected the defect; a material assertion now guards it.
2. The first geometry total was 15,990 triangles, above the new 15,000 ceiling. Longer wall sections reduced redundant coplanar boxes; the ceiling was not relaxed.
3. A station route initially crossed the caravan and a farm track faced the rear barn wall. The routes were moved, and the caravan's actual delivered bounds are checked.
4. A bridge-to-mill path required a real fence gap. The fence is now split around its 3.6 m opening.
5. The physics controller's castle-only regional sweep missed the new bridge. Reproduction and correction are recorded above.
6. High close review exposed local village tufts on the quay even though global meadow exclusion passed. Both grass owners now use the actual world-route and quay footprints.
7. The refreshed close-up exposed coplanar towpath tiles beneath the quay court. A ray regression reproduced two paving surfaces instead of one. Tiles are now clipped around each court and previously laid path, including the picnic area's partial-width intersection. The same defect at the station turn and bridge landing was reproduced by five junction rays and corrected in the same clipping routine. The final station/quay/bridge captures show the artefacts removed. No depth offset or acceptance threshold was changed. All 13 public-realm checks pass after the correction.

Earlier `first-pass`, `paving-review`, `final-*` and `final-*-sealed` images are retained diagnostics. `final-*-accepted` contains the finished source after the overlap correction.

## Lighting control

`lighting-control` uses one page and three on/off/on frames per view. Moving pixels are excluded by comparing the two on frames. `lighting-measure.json` records three static wall crops:

| Crop | Stable changed pixels | Mean absolute RGB-byte delta | Red-minus-green shift |
|---|---:|---:|---:|
| Square approach | 62,804 / 98,800 | 0.294 | +0.725 |
| Churchyard | 134,379 / 156,400 | 0.437 | +1.028 |
| Farm garden | 42,726 / 144,000 | 0.131 | +0.338 |

This is a subtle hue correction, not a dramatic brightness increase. The daytime hemisphere remains at 0.22 intensity. Unit tests prove unchanged linear luminance and an exact no-op at night. The existing isolation flag also controls earlier lighting work, so the evidence uses exterior wall crops rather than claiming a whole-image delta belongs only to this change.

## Validation

The final frozen-source gate passes **2,049 tests in 199 files**, zero failures, in **425.90 seconds**. This is **+15 tests and +1 test file** against the preceding exact whole-candidate baseline. The final production build reports **41.52 seconds** (42.176 seconds runner wall time).

| Gate | Terminal result | Evidence |
|---|---|---|
| Full test suite | 2,049 passed / 199 files | `validation/final/tests-full.log` |
| Production build | PASS, 41.52 s | `validation/final/build.log` |
| TypeScript, lint, formatting | All exit 0 | `validation/final/checks.json` |
| Depth, shaders, reachability, bundle, uncrewed | All exit 0 | `validation/final/build-gates.json` |
| Delivered asset contracts | 146 PASS | `validation/assets.log` |
| Public-realm geometry and access | 13 PASS after the final clipping fix | `validation/junction-overlap-after.log` |
| Gallery | 26 images, no overflow at 1,440/390 px | `gallery-check.json` |
| Source/build closing seal | 19,377 fingerprints, zero mismatches | `final-seal.json` |

Actual final terminal summaries:

```text
Test Files  199 passed (199)
     Tests  2049 passed (2049)
  Duration  425.90s
✓ built in 41.52s
```

The jsdom canvas warnings remain visible in test logs; they are not browser runtime failures. Real scene captures are independently browser-clean.

Baseline: 91 tests in six affected files pass, zero failures. All 19,373 prior candidate fingerprints matched. The preceding exact whole candidate passed 2,034 tests in 198 files. Intermediate runs passed 2,046, 2,048 and 2,049 tests during the successive geometry and integration corrections. Only the final frozen-source run above closes the full-suite gate.

Final runtime evidence: 46 silent browser-clean captures after the complete paving fix: High day 19, Medium day 15, Medium night eight and Low day four. Device DPR 1 gives effective render DPR 0.75, 0.6 and 0.5 respectively. The actual loading overlay clears before each capture session; no loader hiding or readiness override is used. Audio contexts remain uncreated and active audio nodes stay at zero. Shadow-casting lights remain at most one, and zero on Low. All 26 gallery images load at desktop 1,440 px and mobile 390 px without horizontal overflow or media playback. Root inspected the corrected quay, station turn and bridge landings in the real renders. These are appearance checks, separate from Retina performance.

Optional Impeccable is absent from the installed toolchain. No dependency was installed; rendered scene, geometry and gallery layout checks provide the visual evidence.

## Performance boundary

The same-page High/Retina diagnostic and standard Medium steady-state benchmark are complete. Appearance captures do not constitute a performance pass.

At 1,600 × 1,000 CSS pixels, device DPR 2 and effective DPR 1.5, High did not pass the unchanged 120-second complete-animation-ready observation. The loading screen remained. Four full-size control windows averaged 112.29, 109.28, 110.38 and 116.02 ms per frame. Between them, three half-width/half-height windows averaged 34.21, 34.95 and 33.53 ms. Adjacent-pair ratios are 0.309, 0.318 and 0.296. Control-only spread is 6.74 ms, far smaller than the roughly 77 ms pixel-count effect. Load during samples was 1.57 to 1.99 runnable/core, below the repository's warning threshold. This controls our browser workload; it does not certify exclusive GPU ownership.

This is strong evidence of resolution-sensitive cost, not an attribution to a particular shader, effect or new geometry. The same page held scene, quality, lighting and materials constant; the drawing buffer changed from 2,400 × 1,500 to 1,200 × 750. Draws stayed at 289 to 290, with about 668,000 triangles and 229 textures. No browser errors or failed requests occurred, and audio remained uncreated. The smaller view is diagnostic only and itself remains below the 60 FPS goal. Neither readiness nor performance limits were relaxed. Evidence: `high-retina-diagnostic/report.json`.

The appropriate next performance investigation is same-page isolation of the existing high-cost pixel effects at native resolution, retaining the complete-world and frame-pacing gates. This task does not claim an aggregate 60 FPS pass or a solved High/Retina startup.

The comparison galleries' telemetry windows include startup and camera changes. Their cumulative normalized draw counts are therefore unsuitable as per-scene regression deltas. The source has six new public-realm meshes, with shared materials and existing batching; the steady-state measurements below report actual costs without attributing an unpaired difference to these meshes.

### Standard Medium/Retina benchmark

This seven-scene run precedes the last court-overlap trim. That trim removes hidden static paving triangles without changing rendering options; the run is retained as diagnostic evidence and is not presented as final-candidate aggregate acceptance. The unmodified benchmark exits **1**, correctly preserving an overall **FAIL**. It uses 1,280 × 720 CSS pixels, device DPR 2, effective DPR 1.2, midday clear weather, eight-second samples after warmup and topology settling. This is the standard motion-off benchmark, not a motion-acceptance run.

| Scene | Average FPS | p95 ms | Draws/frame | Triangles/frame | Result |
|---|---:|---:|---:|---:|---|
| overview | 60.21 | 21.3 | 938 | 860,512 | FAIL |
| interior | 55.75 | 22.4 | 815 | 767,609 | FAIL |
| shipping | 63.94 | 19.4 | 676 | 912,990 | FAIL |
| receiving | 59.30 | 20.6 | 763 | 958,172 | FAIL |
| water | 45.83 | 28.4 | 924 | 1,176,288 | FAIL |
| village | 110.05 | 12.6 | 215 | 592,163 | PASS |
| farm | 47.68 | 25.8 | 1,029 | 1,248,051 | FAIL |

All seven scenes pass complete-world, browser-clean, intended-DPR, uncrewed and checkpoint checks; audio remains uncreated. No sample contains a frame over 50 ms or a long task. Load ranges from 1.19 to 2.02 runnable/core, below the warning threshold, so the failed pacing limits cannot be dismissed as the previously documented CPU contention. All six failed scenes miss p95 16.7 ms; several also miss mean FPS or one-percent-low limits. Farm's first useful frame is 373.9 ms against 350 ms. Full startup readiness is observed separately and passes before sampling.

The settled village result is 215 calls and 592,163 triangles per frame, with 228 textures. This does not support the apparent 600-call increase from the gallery's mixed telemetry window. It is a current measurement, not a controlled before/after attribution. There is no defensible measured performance improvement claim for the new geometry.

The complete-world performance gate remains **open**. Source and visual correctness can be accepted independently; six-scene frame pacing and High/Retina startup still require targeted renderer work. No budget was weakened, no source was reverted to obtain a pass, and no unrelated process was stopped. Evidence: `performance-medium/benchmark.json` and `validation/performance-medium.log`.

### Final-candidate village confirmation

After the complete court and junction clipping fix, the unchanged Medium/device-DPR2 village benchmark passes: **119.25 FPS**, p95 **9.9 ms**, p99 **10.7 ms**, one-percent low **68.35 FPS**, **215 draw calls/frame**. The report is `performance-village-final/benchmark.json`. No full-world result is inferred from this single scene. The preceding seven-scene failures and High/Retina limitation remain open; this is not a before/after performance-improvement claim.

## Custody and scope

Starting checkout: `main`, HEAD `3026399d411385f44780ddd11745b1927afe7ace`, 416 pre-existing dirty entries. No reset, clean, stash, commit, push, upload or deployment.

`scope-custody.json` checks every prior non-build fingerprint against the explicit edit allowlist. All 148 provider originals and 146 delivery GLBs are unchanged. The asset contracts and resource ceilings remain unchanged. Castle model/steps, canal/river geometry, forecourt road, loading safeguards and dependencies are preserved. Navigation extends only the existing authored-floor mechanism to the canal bridge.

The final candidate contains 19,377 source, asset and build fingerprints. All 146 models and three signage prints match public files, build output and served HTTP bytes, unchanged from baseline. The closing seal rechecks all 19,377 fingerprints with zero mismatches. No original or delivery changed, and no unrelated baseline file changed. No audio context or active audio node is permitted by the capture harness; browsers are launched muted as a second defence.


## Completion state

The eight-part composition goal is complete, including its separate performance diagnosis and explicit retained failures. The world now has connected public routes and appropriate grounds, shared construction materials, distinct garden arrangements, usable bridge stairs and working-district connections. This is root self-review of root-authored changes; visual taste remains a judgment rather than a test score.

**Remaining performance limit:** the full-world 60 FPS/frame-pacing programme and High/Retina first reveal are not accepted. The final village Medium/Retina scene passes; six wider-world scenes failed the preceding same-session aggregate run, and High/Retina remains strongly pixel-cost sensitive. No claim of complete performance closure or measured before/after speedup is made.

Local only. All capture and gallery-check browsers closed normally, the capture lock is absent, and the owned preview session was closed through its own PTY after HTTP-byte verification. No audio played, no publication occurred, and no renderer or automatic continuation remains active for this task.
