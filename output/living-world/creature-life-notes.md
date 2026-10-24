# Creature-life implementation handoff

Produced by the creature_life worker. Root owns integration and visual acceptance.

## Scope and custody

Changed only `src/components/FarmArea.tsx`, `src/components/VillageArea.tsx`, `src/simulation/creatureMotion.ts`, `src/simulation/__tests__/creatureMotion.test.ts`, and new `src/components/LivingWorldCreatures.test.tsx`. Existing dirty clock and exterior-lamp changes in VillageArea were retained. No assets, policies, workers, deployment settings or unrelated files were changed. No build, browser, capture, full suite, audio playback, commit or remote write was performed.

## Behaviours and placements

- Farm field scarecrow at farm-local `[0,0,-42]`: restored original shaped brim/crown, pole, pumpkin head, straw hands, scarf, red shirt and blue trousers. Added sleeves, cuffs, plaid strips and a mended knee. Triangular eyes and stitched smile sit outside the pumpkin surface rather than being buried in it. Geometry/material sharing follows the existing SG/SM pattern. No new lights.
- Rigged crow returned from pen post to hat-local `[0.2,3.018,0]`, using the original authored crown contact. The crow is individually marked dynamic; static effigy remains batchable. Brief seeded head turns interrupt pecking. Held look angles do not repeatedly rebuild the rig.
- One shared FountainBird component sits outside either fountain body, selected alongside the relevant GeneratedBoundary branch. Generated perch is `[1.48,1.385,0]`, facing inward. Fallback perch is `[3,0.6,0]`, on its different coping. Animated head turns, occasional pecks, and explicit click-only sound/hop; no autonomous sound.
- Delivered `public/models/village/fountain.glb` raycasts return `1.3849999904632568` at both feet, x=1.48 and z=+/-0.035. The test loads actual GLB primitives and node world transforms, not duplicated shape assumptions.
- Ducks follow individually seeded small closed swim loops, at most 0.4 m from existing anchors, with 38% of each schedule held still for dabbling. Existing draft, pet response and rig are retained. Heart particles use the current swimming position. Reduced motion restores anchors; post-pet yaw resumes the current heading.
- Chickens, pigs, cows, sheep and farm horse take independently seeded forage bouts with smooth head-up resting intervals. Their existing collision bounds, routes, rig deformation limits and planted stationary feet are unchanged.
- Runtime names for inspection: `field-scarecrow`, `scarecrow-crow`, `fountain-bird`, `fountain-bird-motion`, `fountain-bird-head`.

## Verification actually run

Final focused suite:

```
npm test -- src/simulation/__tests__/creatureMotion.test.ts src/components/LivingWorldCreatures.test.tsx src/components/__tests__/primitiveBodyLeaves.test.ts
Test Files 3 passed (3)
Tests 18 passed (18)
```

The new tests cover per-animal rest/feeding schedules, sparse bounded head turns, 120 seconds of duck path samples (basin containment, mutual separation, continuity), exactly one bird on generated/fallback branches, original crow mounting, actual delivered fountain foot contact, and the live FountainBird useFrame callback moving silently and holding/resetting for pause/reduced motion. Browser rendering is not claimed. JSDOM reports two existing canvas getContext-unavailable messages from module texture initialization; tests pass without adding a canvas dependency.

`npm run typecheck`: exit 0.

Focused ESLint, Prettier check, and `git diff --check`: exit 0.

Logs: `/tmp/millos-creature-tests-final.log`, `/tmp/millos-creature-types-final.log`. Initial test-only issues (missing reduced-motion mock and missing FountainBird import) were repaired before final run.

## Remaining root acceptance

- Inspect integrated diff, run root whole-project gates and visual review.
- Confirm scarecrow/crow silhouette and fountain bird visibility in the intended cameras and night lighting.
- Cat refinement omitted: optional lane, outside file ownership, and these bounded changes already add the requested animal variation. No cow-trough navigation was added because it would need new collision-safe paths; duck dabbling provides water behaviour while farm animals gain head-up rests.
- No UI/material-build success is substituted for a visual render. No production or deployment claims.
