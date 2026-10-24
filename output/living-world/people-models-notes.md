# Personnel renderer restoration

## Owned surfaces

- `src/components/models/WorkerModel.tsx`: restores the historical authored-body material/attachment renderer, replacing retired simulation/signals/texture dependencies with the small mutable motion contract.
- `src/components/workers/workerTypes.ts`: role-specific clothing/PPE/tools, preserved named profiles, deterministic anonymous-ID variation, community roles.
- `src/components/workers/workerPose.ts`: genuine seated pelvis/thigh/calf/foot/arm deformation, reversible before each mixer step.
- `src/components/workers/WorkerTools.tsx`, `SharedWorkerMaterials.ts`, `SharedWorkerGeometries.ts`: narrowly restored tool/accessory support, texture free.
- `src/components/workers/workerPose.test.ts`: actual Draco asset decode and Three.js skin/bone tests.
- `public/models/worker/worker-{masculine,feminine}.glb`, `LICENSE-QUATERNIUS.txt`: byte-exact historical runtime restoration from `9a95c7f^`.
- `public/models/asset-manifest.json`: only two worker rows appended, unrelated formatting preserved.

## Public contract

`WorkerModel({ appearance: WorkerAppearance, motion: WorkerMotionState })`.

`WorkerMotionState` is mutable: activity working/break/idle/walking, groundSpeed in world metres/sec, seated, deterministic phase in radians, enabled. The root must update before the renderer callback. `enabled=false` freezes pose/mixer. Initial seated state is also posed if mounted paused. Model faces +Z; origin remains ground.

`getWorkerAppearance(role,color,id)` supports Supervisor, Engineer, Operator, Quality/Quality Control, Logistics, Maintenance, Safety Officer, Baker, Gardener, Shopkeeper, Resident, Passenger and Cyclist. Community roles have no hardhat/PPE. Gardener adds trowel/garden; Baker adds bread-tray/bake. Tools hide whenever seated or not working. No audio, no independent simulation clock.

## Verified measurements

Tests load the actual compressed assets through NodeIO/Draco, write a temporary in-memory uncompressed GLB, then load through GLTFLoader and evaluate the actual skeleton and skinned vertices.

- Masculine: 13 skinned primitive meshes, 5,240 triangles. Standing skin bounds about .550 x 1.683 x .588 m, before per-person scale.
- Feminine: 12 meshes, 6,112 triangles. Standing skin bounds about .497 x 1.683 x .570 m.
- Accessories add role-dependent draws. Plain residents retain a four-part badge; worker PPE/tools add further small meshes. No graphics tier removes bodies.
- Seat top contract .46 m. Pelvis joint is .55 m (9 cm joint-to-seat allowance), knee joints .46 m, foot targets .03 m.
- Across both bodies and height multipliers .95/1.08: actual sole minimum .0041–.0088 m; no through-ground vertices. Seated maximum height 1.302–1.514 m.
- Knee forward position .353–.400 m and furthest skin/toes .560–.594 m relative to seated origin. Backward skin extent .147–.155 m. Bench alignment should place pelvis above seat centre.
- Restoring and reapplying seated pose 20 times produces no pelvis drift. Standing Body position restores exactly.
- GLTFLoader sanitizes bone names: authored `Wrist.L` becomes runtime `WristL`. The old renderer's dotted wrist name did not resolve in a real load. This restoration uses the actual loaded names for tools and pose.

## Verification

- `npx vitest run src/components/workers/workerPose.test.ts`: 7 passed, terminal exit 0.
- `npx eslint src/components/models/WorkerModel.tsx src/components/workers/`: terminal exit 0.
- `npm run typecheck`: final terminal exit 0. The first run encountered three concurrent communityLayout tuple assertions, since resolved by their owner; no worker type errors.
- `git diff --check -- public/models/asset-manifest.json`: terminal exit 0.
- Focused source formatted by local Prettier.

## Provenance caveat

Actual restored runtime SHA-256 values are:

- masculine `69a13ca722de26dea1e6cc6cf2241ec95dd46d27989a1f103f823616a17196db`
- feminine `9b4d0b4475919fbd05b72dd9a22eab6c840b8f5094dff0c757e6c42267cd2448`

These match the historical runtime commit exactly. They differ from the older `assets/source/models/worker-quaternius/PROVENANCE.json` runtime derivative hashes. The restored files contain Draco compression while that record describes normalized texture-free exports. The precise intervening transformation is unverified. No provenance metadata outside assigned ownership was edited.

## Remaining root acceptance

No build, browser, visual capture, full suite, deploy or push was run in this lane. Root owns integrated rendering, bench fit, task placement, scene performance and final gates. CPU geometry/bone proof does not establish visual quality of seated clothing contact or bare heads after hiding helmets. No cycling pose was added; root can show a pedestrian pushing a bicycle.

## Positive inhabited-world delivery gate follow-up

Replaced the obsolete blanket ban in `src/config/humanPresencePolicy.test.ts` and `scripts/validate-uncrewed-build.mjs`. `npm run validate:community` is canonical; `validate:uncrewed` delegates to it for existing callers.

The gate requires the enabled policy, CommunityLife import and mount, authored roster renderer, both named scene groups, both GLB references in compiled JavaScript, both manifest entries with CC0 and personnel role, the licence, and exact approved bytes in public and dist. It preserves autonomous vehicle, remote-avatar, portrait, speech and chatter exclusions. Unknown personnel-named assets remain rejected; animal animation aliases are deliberately excluded from identity classification.

Canaries exercise missing/relicensed/unapproved assets, policy disabled/unmounted roots, forbidden runtime layers, and an actual temporary delivery tree. The delivery fixture initially passes, then fails on missing served GLB, modified served GLB and removed compiled scene marker.

A manifest insertion defect in my first restoration was exposed by this positive gate: formatting-preserving insertion had targeted the last array (`quarantined`) rather than `assets`, and selected an obsolete third worker record. Corrected to exactly masculine/feminine in `assets`; original quarantine array remains byte-equivalent to HEAD. I informed the root and apologized. No generator overwrote the manifest. Targeted script search shows it is hand-maintained; normalize-model-assets writes GLBs and normalization reports, not this manifest. No generator change was made.

Paused pose transitions now select and apply new activity/seated states with `mixer.update(0)`, while retaining deterministic action phase and no animation-clock advancement. Unchanged paused poses remain frozen; changed props reset the pose signature. This lets the root's priority -1 callback drive time jumps while paused.

Focused gate + actual asset pose tests: 16 passed across two files before the separate paused-renderer test was added. Full build and actual dist gate remain root-owned, and were not run here.

The added `WorkerModel.test.tsx` passed (one test): it mounts the actual renderer with a synthetic Three.js rig and real AnimationMixer, verifies selected working clip at deterministic half-phase, applies idle/seated/working transitions while disabled, and proves unchanged disabled frames do not advance even with delta=100. Scoped ESLint passed after this addition. Combined lane total: 17 passing focused tests (16 + 1); root should rerun together during reconciliation.

## Cycling pose follow-up

Added optional `cycling` and `cyclePhase` to WorkerMotionState. The same reversible pose helper owns riding pose transforms; the root remains fixed and no independent cycling clock exists. Phase changes while paused recompute the pose with mixer delta zero; unchanged paused phase remains frozen.

The bicycle contract uses saddle top (0,.86,-.1), pelvis (0,.95,-.1), grips (+/-.23,1.08,.57), crank axle (0,.36,.04), radius .15. The actual loaded rig's L limb is +X: FootL follows the +.16 pedal at (.36+.15 cos(phase), .04+.15 sin(phase)); FootR follows the opposite pedal. Both body and height scale are divided out when solving world-metre bicycle anchors.

An analytic two-bone solver derives upper/lower segment lengths from the actual loaded rig, positions knees/elbows using forward/outward bend poles, and preserves original transforms for exact restoration. A roughly49-degree waist lean and upright head provide bar reach. The first36-degree lean required19–26% forearm stretch on short bodies, which failed the test and was corrected. Final measurements show arm and shin scale exactly1.000 on both bodies at all tested size extremes; no stretched limbs are needed.

Real Draco asset tests cover both bodies, height/width (.95,.96) and (1.08,1.06), and16 evenly spaced crank phases each (64 real rig/skin evaluations). Pelvis and ankle targets match bicycle coordinates within0.1mm, wrists within1mm. No drift on restore, no ground intersection. Across cases, skin minimumY .18365–.18807m and maximumY1.49072–1.60963m. The ankle/Foot target is roughly22–26mm above the shoe sole; root has been informed of this contact datum and the optional .026m sole clearance correction.

Both focused renderer/pose suites passed12 tests; a measurement-only selected rerun passed4 cycling cases with7 deliberately skipped non-cycling tests. Paused renderer coverage now also enters cycling, changes phase, and exits to working without advancing the clip clock. No browser/build/deploy/push was used. Root owns visual fit with the actual bicycle and final integrated gates.

### Final physical pedal contact correction

Root supplied the real pedal tread top: platform centre+.0245m. The ankle target now uses crank centre+.052m, retaining exact X/Z, radius and phase. This includes the tread thickness and measured skinned ankle-to-sole depth. The first+.051m candidate clipped the tall masculine boot by .34mm;+.052m corrected it without relaxing the no-clipping assertion.

Tests inspect every actual skinned Worker_Feet vertex, classify +X/-X shoes, and compare each sole minimum against its own moving tread top for16 phases on each body/scale case. Final measured sole clearance:

- masculine height.95,width.96:3.75–4.38mm
- masculine height1.08,width1.06:0.47–1.26mm
- feminine height.95,width.96:4.50–5.54mm
- feminine height1.08,width1.06:1.58–2.44mm

All64 poses satisfy zero clipping and less than7mm clearance; all lower arm and shin scales remain1.000. Both complete focused suites passed12 tests after the final correction. This supersedes the earlier raw ankle-centre contact caveat. No further production edits planned; root was notified to rebuild.

## Render-review task-contact correction

Reviewed the root's actual day-courier, day-bakery and day-gardener screenshots. These showed defects in my earlier task-pose implementation: courier hands missed shafts; baker/gardener aliases used generic waving interactions and held their tools at the side. Corrected the actual pose/mount contracts rather than relabelling those animations.

- Optional `motion.cartGrip: 'push' | 'pull'`: target means the actual palm centre, derived from the midpoint between the rig's Middle1/Middle2 bones, at actor-local metres(+/-.32,.85,+/-.2). A loaded knee bend lowers pelvis to .68m for the low shafts. Foot trajectories remain those of the current authored walking clip, solved back onto their original positions. Both hands grip with downward palms. Root supplies cart placement and driving flag.
- Bake: idle-neutral base, pelvis .68m, actual palms at(+/-.18,.86,.33). A .38x.24m tray is model-root anchored at(0,.85,.33), level, with scale compensation. The hand positions bracket the tray edges. Loaves now have a distinct baked-gold material. No sample-clip wave and no side-mounted tray.
- Garden: pelvis .38m, deep forward crouch, upright/downward-looking head, feet grounded. Trowel hand at(.12,.326,.5205), support hand at(-.12,.40,.26). The root-anchored, scale-compensated trowel angles downward/forward; nominal blade-tip centre is(.12,.22,.60). Tool rotation is inside the inverse-scale mount, avoiding nonuniform body scale skew. Root owns moving gardener toward the raised bed.
- Optional `motion.seatFloorOffset`: only raises seated foot targets and adjusts shin length; pelvis stays fixed. With floor offset.048 and root origin+.062, actual skin soles clear the bus floor at.11m while pelvis remains.612m.

Verification:33 focused tests passed across actual asset rig/skin tests and renderer pause-transition tests, terminal exit0. New task-contact tests cover both bodies and height extremes; actual palm centres stay within12mm of targets and limb scales below1.05. Bus tests check actual skinned sole floor clearance and unchanged pelvis. Additional walk test covers both bodies, push/pull and eight animation phases, preserving original Foot target positions within0.1mm and keeping limb scales below1.05. Existing bicycle/seat proofs remain green. Scoped ESLint completed exit0 after final edits. No browser/build/audio/push was used; root owns refreshed rendered acceptance.

## Root reconciliation and rendered acceptance (2026-09-28)

The rendered contact correction exposed a second issue: lowering the pelvis to .68m left the baker and courier in permanent crouches. The final root correction preserves each actual standing pelvis, raises cart palm/grip centres to1.05m, and places the level bread tray at(0,1.09,.28) with palm centres(+/-.18,1.10,.28). The gardener and seated/bicycle contracts are unchanged. Actual-rig palm, gait, body-scale and sole tests plus a raycast of the real cart handles passed45 tests. Root viewed fresh day-bakery, day-courier and delivery-courier renders and confirmed standing poses and contact.

Baseline:2067 tests passed. Full expanded suite:2154 tests across208 files passed with a60-second observation timeout. A preceding10-second-timeout run had exactly two timeouts (community route sweep and temporary served-asset gate), no assertion failures. The timeout was changed only on the verification command line, not in repository configuration. Final population-isolation instrumentation then passed89 affected graphics/runtime/community tests, typecheck, lint, format and a fresh production build. Asset, depth, shader, reachability, community-delivery and bundle gates passed.

Rendered evidence: output/playwright/living-world/gallery.html, report.json and report-day-delivery-village.json. Seven cases cover day, loaded delivery, boarding, shelter seating, village motion, night and Low quality. Fourteen actual bodies mount in all cases; visibility follows hours. Nine people changed position in the live test and froze when paused. Browser errors and failed requests were empty, audio nodes0, AudioContext not created, playback attempts0. Bird feet rest on the actual fountain rim; scarecrow/crow restored. Automated browsers and preview servers were closed by their owning scripts. No audio was played. No commit, push or deployment was performed.

### Performance limitation, not a green gate

The strict three-scene benchmark failed: overview59.9FPS/p9520.5ms; interior60.7FPS/p9520.4ms/1%low42.4FPS; village100.5FPS but first-frame381.6ms against350ms. Diagnostics, world continuity, actual personnel, checkpoints and silence passed. See test-results/living-world/performance/benchmark.json.

A same-page runtime population control was added through the existing graphics perfDebug contract. It hides the two new community groups and stops their animation updates without unloading bodies or rebuilding materials. Default remains enabled. Paired static control then live-animation measurement is recorded in output/playwright/living-world/population-cost.json. Three alternating pairs per scene retain raw values:
- Interior population costs3.85,1.45,1.75ms; control spread1.16ms;71–72 extra calls. Live authored scene54.79FPS, p9520.5ms.
- Village population costs.34,1.32,1.65ms; control spread.12ms;111 extra calls. Live authored scene80.46FPS, p9515.5ms.
- Host load remained1.15–1.44 runnable/core during paired captures. This is below the repository's severe-contention warning threshold, but not an idle machine. Added population has a measurable cost; it must not be called free or blamed entirely on host contention. Factory frame-pacing and startup acceptance remain open. No budgets were relaxed, and no further broad factory optimization was folded into the community restoration.

Status: functional and visual implementation local only. Performance gate remains failed/unresolved; a quieter-host confirmation and, if reproduced, further factory performance work are still needed for full performance sign-off.


## September 28, requested movement pass

Local only, no push or deployment. Existing dirty work preserved. Root-authored and root-reviewed.

- Added shared, staggered procedural gestures for baker/gardener tool handling, seated glances and forearm movement, idle breathing, mill inspection/operation/repair/sampling/supervision. Held props use the same sampled metre-space offsets as their palm targets.
- Every procedural transform is restored before the mixer runs. Real-GLB tests cover 1,000 frames per gesture without accumulated rotation, both body variants, varied heights, grounded feet and hand contacts.
- Distance-based skeletal sampling at 60/30/15 Hz; roots still update per display frame. Cycling bypasses sampling so boots and pedals remain in phase. Pause preserves locomotion clip and exact pose.
- The rendered review caught my earlier gardener crouch occluding the torso and placing legs through the bed. Raised the torso and moved the root back 0.5m onto the path. Real skinned low-leg/boot vertices now clear the actual bed wall, with the trowel reaching the soil.
- Starting focused baseline: 45 tests passed, zero failures. Final affected suite: 96 passed across five files. Full suite: 2,180 passed across 208 files (26 new tests). Build/typecheck/lint/format/reachability/community/bundle passed. Terminal logs and exact source hashes: test-results/living-world-animation/.
- Four final live rendered cases: baker, gardener, seated engineer, working operator. Baker hand travel 5.29cm, gardener 8.72cm, resting forearm 5.01cm. Head rotations confirmed. Pauses stable, no browser errors, failed requests or audio activity.
- The first capture's 1mm palm-centre threshold rejected 1.86mm of authored finger flex. Final threshold is 3mm inside the 25mm tool handle, alongside the existing real-rig palm/contact assertions. Final maximum drift: gardener 1.82mm, baker 0.31mm.
- Optional Impeccable was not installed, so omitted. Rendered review replaces no performance gate: capture-time close-up rates 70.4–90.7 FPS are indicative, include video/screenshot overhead, and do not resolve the earlier strict overview/interior budget failures.
- Silent review gallery: output/playwright/living-world/animation-after/gallery.html. MP4 previews contain video only and never autoplay.
