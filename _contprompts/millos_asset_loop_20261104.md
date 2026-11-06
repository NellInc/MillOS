---
title: MillOS asset loop — independent-judge polishing of models and maps
status: in_progress
started: 2026-11-04
owner: Claude Opus 5.5 (builder/orchestrator); judges run on Sonnet 5.5
---

# Goal

Nell (2026-11-04): "Can we please use this for polishing and mastering 3D assets
and models, and maps. Ultracode. Ultrathink." — "this" is the Opus + Blender
workflow from r/ClaudeAI: staged builds, every asset rendered from the same fixed
cameras, a *different* model scores every render, nothing passes below 8, a defect
that survives three rounds forces a different construction approach, a
player-sized capsule walks every route, and a handoff file lets a new session
resume.

"Maps" is read as the world's districts and walkable routes (scene families),
not texture maps; texture maps fall under the surface stage of each asset.

# Why this is not a repeat of the 2026-09-27 asset-mastery programme

That programme gave all 146 assets a disposition, but every visual acceptance
was **root self-review of root-authored work** (its own words). Nell later
rejected the shop as unfinished. The post's central finding is the same failure:
the builder model false-verifies its own renders. This run's one non-negotiable
change is that **no asset is accepted on the builder's say-so**: a fresh Sonnet
judge, blind to intent and to what changed, grades every round.

# Done for this run

1. **Rig.** `scripts/blender/asset_turntable.py` + `scripts/asset-turntable.mjs`
   render any manifest asset (or a candidate GLB) from 12 fixed cameras in colour
   and clay, compose two contact sheets, and write an objective probe report
   (floating assemblies, ground gap, open/non-manifold/flipped edges, bounds and
   budgets against `public/models/asset-manifest.json`). Unit-tested.
2. **Judge.** `.claude/agents/asset-judge.md` (Sonnet), fixed rubric, PASS = every
   view ≥ 8, zero blocking defects, probe clean. Smoke-tested on three assets
   from different families **including a planted floating part, which it must
   fail**.
3. **Procedure.** `.claude/commands/asset-loop.md`: contract → build → render →
   judge → fix; strike rule; one builder per authoring file; acceptance needs
   two consecutive fresh judge passes plus the in-game capture.
4. **Triage.** All 148 manifest assets rendered and independently judged; scores
   and stable defect IDs recorded in `output/asset-loop-20261104/ledger.json`.
5. **Fix.** Every asset that fails triage goes through the loop until it passes
   twice, hits the round cap (6), or is blocked (named dependency). Changes land
   through the existing authoring scripts and `normalize-models -- --only=<id>`,
   within unchanged budgets, and are confirmed in the live game.
6. **Maps.** District eye-level captures judged by a Sonnet scene judge, and a
   capsule-walk gate over the declared first-person routes.
7. **Handoff.** This file's State section names what passed, what remains, and
   why, with counts.

# Hard rules for every stage

- Assets: never round-trip a pipeline GLB through Blender (PROMPTS.md rule 1);
  `assets/source/models/**/*-original.glb` and provider originals are immutable;
  geometry changes go in the authoring script that already owns the asset.
- Budgets in `asset-manifest.json` (bytes, render vertices, materials, textures,
  bounds) do not move. No relaxation to obtain a pass.
- Identity is preserved (D-004); the village, farm and castle keep the miniature
  style (D-005); a photoreal element beside a miniature one is a defect (D-016).
- No Poly Haven or other photo-scan textures (D-005, `maxTextures`), no Tripo or
  other paid generation (D-003), no new dependencies.
- `casterPins`: a geometry change to a village/civic `<Name>Body` GLB breaks
  `civicLampShadows.test.ts` / `VillageGardens.test.ts` until the civic lamp bake
  is rerun. Check before touching one; bundle the rebake or defer.
- Renders take `.capture.lock`. Check free disk before every render batch and
  build (7.6 GiB free at start; the disk hit zero twice in October). No worktrees.
- The tree is shared with a live agent (src/ edits within the hour at start);
  `.claude/agents/visual-fidelity-judge.md` and `scripts/blender/world_geometry_preview.py`
  are dirty with someone else's work — hands off.
- Local only. No push, no deploy, no audio.

# State

_Updated as the run proceeds._

- Baseline: `main` @ `15c8b571`, 1,016 dirty entries preserved (not ours).
  Blender 5.2.0 LTS headless imports plain, meshopt and Draco GLBs. Blender MCP
  failed to connect this session (no GUI instance); headless is the committed
  route per `scripts/blender/PROMPTS.md`, so this is not blocking.
- Rig built and unit-tested (`scripts/asset-turntable.test.mjs`, 9 pass);
  `validate-assets.mjs` made importable (gate still 148/148). 24 frames per asset
  in ~5 s. Judge contract lives in `docs/ASSET_JUDGE.md`: the consent gate blocks
  a new `.claude/agents/asset-judge.md` without Nell's terminal approval, so each
  judge call pins `model: sonnet` instead (no tool restriction beyond the prompt).
- Smoke (Sonnet judges, 2026-11-04): bus shelter FAIL (two glazing clips 2-5 cm
  off their gaskets, confirming the probe's floating notes), birch canopy unit
  FAIL (cap shading seam = the probe's 2 winding edges), frog FAIL (eight
  untreated primitives). Context cards are factual and name owners with file:line.
- Calibration on a planted candidate (stray bar through the +X cabinet, floating
  plate before the backrest), two fresh Sonnet judges, neutral directory names:
  both FAIL and both find the bar unaided. The judge without probe flags misses
  the thin floating plate; the probe auto-fails it. Probes and judge are
  complementary, so neither is dropped. Judges differ at the margin (the clips
  were "blocking" for one judge, "identity" for another): hence two consecutive
  fresh passes for acceptance.
- Leaks found and closed in our own rig before scale: candidate input path and
  round labels reached the judge (`review.json`, `report.json`, run label);
  provenance now lives only in the run `index.json`, candidate runs default to
  an opaque `j-<sha>` label.
- **Triage (2026-11-04/05):** 148/148 rendered (`test-results/asset-loop/triage-20261104`)
  and graded by 148 fresh Sonnet judges with factual context cards (12 card agents);
  160 agents, ~15.4 M subagent tokens, no errors. **53 PASS, 95 FAIL.** Min view
  score: 4 (3 assets), 5 (24), 6 (34), 7 (31), 8 (56). Blocking defects by axis:
  construction 37, form 26, surface 9, grounding 7, artefacts 4.
  Ledger: `output/asset-loop-20261104/ledger.json` (cards, scores, defect IDs, strikes).
- **Dispositions** (`node scripts/asset-loop/disposition.mjs <ledger> --write`), replacing
  done-item 5's "every failing asset" with "every *buildable* failing asset":
  - owned-build 34: geometry script in the repo; builders one per owning file.
  - new-authoring 37: authored-atlas/exported geometry with no generator; a builder
    writes the authoring function after confirming no runtime contract pins it.
  - seat 3 (forge, nissen hut, park bench): only a measured flag blocks; the pilot batch.
  - pinned-batch 5 (shop, townhall, pub, fountain, wishingwell): fix together, one civic
    lamp rebake, then `civicLampShadows.test.ts` and `VillageGardens.test.ts`.
  - in-game 5 (park/oak/pine canopy units): the runtime leaf atlas replaces GLB colour,
    so the turntable cannot show the crown; graded by the scene judge in-game.
  - runtime-contract 8 (spouting flange/crossbeam, industrial portal, mill/sifter/packer
    housings, oak trunk, truck tyre): the runtime regenerates or triangle-matches the
    geometry from TypeScript. **Nell's call** whether to change runtime geometry in
    lockstep in a tree another agent is editing; deferred, not skipped silently.
  - provider-retain 3 (forklift CC-BY, worker-feminine CC0, cat): surface-only or retain.
- Loop tooling is in the repo: `scripts/asset-loop/*.mjs` (ledger, cards, dispositions,
  fix args, calibration staging), workflow scripts in `output/asset-loop-20261104/workflows/`
  (triage.js, calibration.js, fix.js, batches, planted-defect script).
- **Maps, capsule walk** (`src/utils/__tests__/capsuleWalk.routes.test.ts`, new, Opus
  subagent; independently re-run: 202 pass, 7 expected-fail). Every declared route is
  walked both ways at terrain 64/128, stride 0.2 and 4.32, through the real
  `moveWalkingPosition` and the controller's own obstacle sources (radius 0.4, eye 1.7,
  0.23 m step limit). Canal footbridge, bus shelter, station forecourt and both
  platforms, the barrow crossing, castle and river bridge, 19 world, 5 village and 7 farm
  walks pass. Findings pinned as `it.fails` so they turn red when fixed:
  1. **World walk 4** starts on tread 5 of the canal footbridge's east stairs and is
     refused a 0.968 m side drop at (-137, -48.88); the bridge is reachable from the
     stair foot, but 1.437 m of grass separates that foot from the paving at z -48.75.
  2. **Houses, garden walls, the perimeter fence and the station shop have no collision
     in the walking model**: a capsule walks through a cottage's front wall and through
     the closed shop door. So village/shop "door" walks pass vacuously. Adding colliders
     changes controller code under `src/` (another agent's live area): Nell's call.
  3. No datum exists for forecourt->platform ramps, the booking-hall interior or paved
     areas; the mill fence gap and shop door exist only as literals in components.
- **Fix pilot (seat batch) result, verified on bytes:** park bench ACCEPTED (two
  consecutive fresh Sonnet passes on `ac5f8460`), Nissen hut ACCEPTED (`84eaf1c3`).
  In both, the first pass was overturned by the fresh confirmation judge and the builder
  changed method under the strike rule before passing twice. Forge hit the 6-round cap at
  min view 7 (hood form, plain back wall, paving); its round 6 reintroduced a judged roof
  defect after round 5 scored min 8, and per-round GLBs were not kept (fixed: builders now
  save `candidate.glb`). A blind Sonnet A/B of original vs round-6 forge picked round 6
  with high confidence (domed hood, arched firebox, varied stone vs a "cupboard" box), so
  round 6 stays delivered as *improved, at cap, not accepted*: Nell's call.
  `validate:assets` 148/148; provenance recorded for the three deliveries with
  `scripts/asset-loop/record-provenance.mjs` (hash and existing byte fields only); asset-scoped
  suite 321/321 (17 files). Builders no longer run vitest per round (13 min each, CPU
  contention); tests run at integration.
- **Pins found at integration (reported by peer session millos-f5, verified):**
  `src/components/exterior/riverbankHedgeGrounding.test.tsx` pins the bytes of
  `public/models/world/{hedge-unit,park-bench,info-sign}.glb` and is consent-gated:
  the accepted park bench (`ac5f8460`, pin `a44763b7`) needed Nell's approval to
  re-pin. **Done 2026-11-05 by peer session millos-f5**, citing Nell's approval in that
  session ("Do it please, use your best judgment"); verified here: pin is `ac5f8460…`,
  equal to the delivered bytes, and the test passes 12/12. Future re-pins still go to Nell. No other test pins delivered GLB bytes.
  `scripts/reconcile-farm-models.test.mjs` pins the farm authoring scripts' hashes
  (coop, windmill, farmhouse): update at integration, after acceptance, not mid-round.
- **Integration checklist for every accepted asset** (builders stage helpers in the
  session scratchpad, which reboots wipe): (1) regenerate from the owning script alone,
  `normalize-models -- --only=<id>`, and confirm the delivered sha256 equals the
  accepted one, so nothing depends on a scratch file; (2) `record-provenance.mjs`;
  (3) farm authoring-script pins; (4) consent-gated byte pins named to Nell;
  (5) asset-scoped suite; (6) in-game capture judged by a Sonnet scene judge.
  At-cap assets: blind A/B of original vs last round (now from `candidate.glb`) decides
  keep or restore; restore = `git checkout HEAD --` on the owning script and its outputs,
  only when those files carried no other session's changes at the start.
- **Owned-build fan-out launched** (2026-11-05, run `wf_340bcbfa-b8c`): 34 assets in 16
  owning-script groups, one builder per file at a time.
- **Owned-build run finished** (2026-11-05, `wf_340bcbfa-b8c`, 318 agents, survived one
  session crash via cache resume: 302 results replayed, only the wedged duck round re-ran).
  Outcomes in `output/asset-loop-20261104/fix-owned-outcomes.json`
  (`node scripts/asset-loop/fix-outcomes.mjs <task output>`): **6 accepted** (brick carport,
  office apartment, office apartment three, caravan, hatchback, pickup; all delivered sha256
  equal the twice-passed sha256), **22 at cap** (last `candidate.glb` saved for all 22),
  **6 blocked**:
  - farm-coop: deterministic candidate built and rendered but never judged; installing it
    needs the lead to re-pin `precision-farm-models.mjs` (builderSHA256 eaedad7b…, outputSHA256
    2bbd7191…). Judge first, re-pin only on acceptance.
  - farm-windmill: `reconcile-farm-models.mjs` AUTHORING_SHA256 pins
    `refine_architecture_assets.py` at HEAD; accepted carport/office edits changed it. Re-pin at
    integration, then windmill pins (builder 4a4ec08d…, output 340a9874…), then judge.
  - world-yard-truck-wash-body: candidate built (280d0684…), install needs a one-line
    `previousOutput` allowance in shared `reconcile-yard-models.mjs:52` plus test pins. Judge first.
  - world-station-register: **Nell's call**: the 36 render-vertex budget allows only a
    knife-edged 12-triangle wedge; a chamfered ridge needs 48 (ridge + front corners 72).
    Every texture-only substitute was judged fake. Otherwise accept knife edges at 6-12 m.
  - world-flour-sack-unit: **Nell's call**: geometry is pinned to runtime
    `src/utils/flourSacks.ts createFlourSackGeometry` (load-time match); same class as the 8
    runtime-contract assets.
  - world-cupid-authored-body: **Nell's call**: the owning script is a hash-sealed Y-shift, not
    a generator; a real remodel means relaxing `reconcile-scenic-models.mjs` current-delivery
    guard and the Cupid pins in its test, or reclassifying it as new-authoring.
  - Builder self-pin found: the farmhouse builder changed `reconcile-farm-models.mjs`
    farmhouse `outputSHA256` 0a579e5c… -> 4af020ee… although the farmhouse never passed.
    Revert with the farmhouse disposition; builders must not edit acceptance pins.
- **Post-run review (2026-11-05, advisor-guided):** render paths measured with
  `scripts/asset-loop/render-path.mjs`; overrides in
  `output/asset-loop-20261104/disposition-overrides.json`. 3 new-authoring assets are
  runtime-guarded (dock bumper rubber, drainage pipe, forklift chassis -> runtime-contract,
  now 12 incl. flour sack), 4 are never rendered (frog, grain elevator, pallet staging, yard
  dock plate -> not-shipped). 30 new-authoring assets remain genuinely buildable.
- **At-cap blind A/Bs** (23, Sonnet, sides alternated, key in `ab-key.json`, decisions in
  `ab-decisions.json`): **22 keep the last round** (14 high confidence), **1 restore**
  (cottage: the new roof reads as shingle, losing thatch identity). Last round only, because
  only the last round regenerates from the scripts.
- **Unjudged candidates** (two fresh Sonnet judges each): coop FAIL7/PASS8, windmill FAIL6/7,
  truck wash FAIL6/6 -> all rejected. Never installed; their builder scripts returned to
  HEAD, builder diffs kept in `output/asset-loop-20261104/rejected/*.diff`.
- Farmhouse builder self-pin reverted to HEAD (0a579e5c…). The at-cap farmhouse is KEPT, so
  its pin is set again at integration, by the lead, to the regenerated delivery.
- Cottage restore delegated (one Opus agent): regenerate cottage to HEAD bytes from
  `rebuild_village_architecture.py` while church, canal boat and forge still regenerate to
  their current bytes.
- In-game check of the 8 turntable-accepted assets: `capture:art` label
  `asset-accepted-20261105`, scenes huts, offices, carpark, picnic-shelter, lake, square.
- Cottage restored: `cottage-crafted.glb` regenerates to HEAD bytes; the delivered GLB was
  HEAD's except a 2-byte glTF-Transform stamp (v4.4.2 at HEAD vs pinned 4.5.1), so HEAD's file
  was checked out (source proven equal). Church, canal boat and forge still regenerate to
  their kept bytes. ~535 lines of now-unused `cottage_*` helpers remain in
  `rebuild_village_architecture.py` (rejected work; remove at integration or keep for Nell).
- Register: delivered round 5 won a blind A/B against the original (removes a mirror glare;
  geometry identical), so it is kept; the chamfer question stays with Nell (budget 36).
- **In-game check** (`test-results/art-review/asset-accepted-20261105`, Sonnet scene judge,
  dirty tree, load ~5/core so no perf claim): frame FAIL, blocker = **background hillside
  renders as a faceted patchwork of hard-edged green cells** (huts, offices, lake, square):
  a map/terrain defect, first item for the maps stage. Subject models: Nissen hut, bench and
  brick carport (the picnic shelter IS `GeneratedModel asset="brickCarport"`, the judge
  could not know that) read correctly with no model-level blocker; offices and cars read but
  dark facades, flat window glass and black paint lose form in game light; caravan and forge
  not resolved by any frame -> need close cameras before they count as in-game checked.
- **Integration** of the 31 kept assets delegated (one Opus agent): regenerate-and-compare,
  pins, provenance, named-baseline tests.
- **Integration result:** all 31 kept assets regenerate byte-for-byte from their owning
  scripts (delivered and prepared). Pins set to regenerated values only:
  `reconcile-farm-models.mjs:34` farmhouse outputSHA256 -> 4af020ee…, `:39` AUTHORING_SHA256
  -> c0251ba2…; `restore-farmhouse-walls.test.mjs:201/212/214` and
  `GeneratedLighting.test.ts:611` (boat paint-slot count 932 -> 1278). Provenance updated for
  all 31. `validate:assets` 148/148. Asset-scoped suite 691/27 (+11 skipped) -> 703/26, plus
  `refine-air-hose-sign.test.mjs` crashing at load before and after.
  Pre-existing, not ours: `farm-gardenbed` and `village-duckpond` are non-deterministic in
  `refine_civic_props.py` (also at HEAD); 18 untouched GLBs differ from a regeneration only
  by the glTF-Transform 4.4.2 -> 4.5.1 stamp (kept at HEAD bytes).
- **Fix-forward on the 26 failures** delegated: classify each as stale contract (update the
  expectation, keep the invariant), real mismatch (minimal owning-script fix, blind A/B
  against the kept version must tie or favour it), or pre-existing. Real-mismatch suspects:
  coplanar faces (castle, church, kiosk, office), night-lighting window/recess positions
  (castle, farm), coffee housing depth, castle drainage straps, horse/pig creature contracts.
- **Fix-forward done, verified by the lead** (2026-11-05): of 26 failures + 1 crashing file,
  25 resolved without lowering a bar. Real mismatches fixed in owning scripts: coplanar faces
  on castle, church, kiosk and office-apartment (each blind A/B = tie vs kept, high
  confidence; new hashes castle 97f1d7cb, church eb5b4533, kiosk 8c77ac58, office
  508c2ce4, stamped in ledger `integrated`). A real game bug the turntable could not show:
  `createHorseRestMotion` refused the kept 3,935-vertex horse, so ears, tail and breathing
  froze in game; fixed in `src/components/models/RiggedCreatureModel.tsx` (clean vs HEAD
  before the edit). Stale contracts updated with invariants kept (receipts, air hose v7,
  yard fixture fit, farmhouse wall step split out, lock-gate beam, coffee bay depth,
  castle pane UV, farm recess witnesses, castle gutter housed by the new cross-gable).
  `AUTHORING_SHA256` re-pinned again -> 74e6408e… after the architecture-script fix.
  **Lead rerun:** 27 files, 670 pass / 1 fail / 7 expected-fail (capsule-walk findings);
  `validate:assets` 148/148.
  Remaining failure (not ours to edit): `LivingWorldCreatures.test.tsx:2112` pig footprint
  `0.733` -> `0.731` (kept pig measures 0.73211; the real `PIG_CLEARANCE_RADIUS = 0.76`
  still holds). That file carries another session's uncommitted Nov 3 edits: Nell or that
  session applies it.
- **2026-11-06, Nell: "FIX EVERYTHING USE YOUR BEST JUDGMENT ASK THE ADVISOR ULTRATHINK FIX THE
  PIG ALSO".** Advisor-reviewed plan. Done inline: pig floor `0.733` -> `0.731` with comment
  (`LivingWorldCreatures.test.tsx:2112`; passes alone; the full file shows 4 timeouts at load
  ~130-190 from other sessions, not assertion failures; rerun when quieter); register
  `maxRenderVertices` 36 -> 72; DECISIONS D-031 (bar 8 + "improved" via blind A/B),
  D-032 (till 72), D-033 (unrendered four left), D-034 (Cupid rebuilt); D-030 reserved by
  millos-6e; D-035 (collision) after it lands. Workflow results now copied into
  `output/asset-loop-20261104/` on landing.
- Far-hills defect traced: committed `62e9122c` (2026-10-26, "Soften foothill farmland into
  smaller organic parcels") in OptimizedSkySystem's ridge field; the Oct 31 capture
  (`layout-audit-after`, built before it) shows large hedged fields that read correctly.
  No decision recorded for it; maps agent keeps the intent, fixes the rendering.
- The riverbank source-hash pins are a convention ("re-baselined with Nell's consent"), not
  the policy hook; Nell's 2026-11-06 instruction is that consent; every re-pin is named.
- Running: collision agent (new `src/utils/walkingObstacles.ts`, avoids pinned files); maps
  agent (far hills, black cars, office glass, hut plinth, picnic shelter, caravan/forge/car
  cameras; Sonnet scene judge plus blind A/B per change). Queued for the capture lock (held by
  millos-6e's measurement chain): builder workflow `workflows/fix2.js` with
  `workflows/fix2-args.json` (40 assets, 37 groups: 34 candidate-mode incl. 30 new-authoring
  files under `scripts/blender/authored/`, Cupid, coop, windmill, truck wash; 6 in-place:
  register, shop, townhall, pub, fountain, wishingwell, with kept-hash regression checks).
  After the run: cottage dead-code removal, gardenbed/duckpond determinism, civic lamp rebake,
  installs, and the 17 runtime-locked assets (TS lockstep, coordinate with millos-6e).
- **Collisions landed** (D-035): `src/utils/walkingObstacles.ts` + one-line wiring in the
  desktop, mobile and Rapier controllers; world walk 4 fixed via `publicRealmLayout.ts`.
  Lead rerun: capsule walk, obstacles and spawn sweep 348/348 (no it.fails left). Open:
  village civic buildings and hedges as solids (needs measured wall bounds; shop, townhall
  and pub GLBs are in the builder run), and the main/lake paths start at fence corners now
  closed by the fence.
- **Maps stage landed** (every change won or tied its blind Sonnet A/B; none lost; final
  composite `test-results/art-review/maps-final`): far-hill parcels curved with soft hedgerows
  (OptimizedSkySystem `parcelCraft`, cache key v31; improved, thin seams remain), dark car
  paint `#1f2937` -> `#4b5563`, office glass sky-tinted and facade lifted
  (GeneratedOfficeModel), Nissen hut grass bank, forecourt tarmac tiled in metres (cause of
  the streaks), new `canopyBounce.ts` (+17% under the carport roof, one extra draw call
  since it skips batching), new review cameras `cars`, `caravan`, `forge`. Re-pinned only
  `GeneratedModel.tsx` in the riverbank test (dated comment); FactoryExterior is
  AST-checked there and the test passes 12/12 (lead rerun). Sonnet frame verdict still
  FAIL with no blocker. **Second maps pass, after the builder run:** dusk ground near-black
  under a glowing sky, forge smoke puffs read as spheres, forge horse glossy orange,
  caravan frame blank wall, near grass smear, residual hill seams, dusk recapture for the
  round 3-4 tweaks. Expected mid-run test reds: shop produce counts and civicLampShadows
  (pinned builders) and reconcile-farm "Precision builder changed" (coop/windmill
  candidates).
- **fix2 blocked builds -> measured dispositions** (overrides file): grill = runtime-contract
  (`AuthoredPropTrim.createPosterStationGeometry` rebuilds the 412-triangle in-game casing only
  from the exact 36-vertex cuboid; the turntable judged a placeholder), windmill =
  runtime-contract (`GeneratedWindmill.computeSailWeights` binary sail weights by rest x),
  dock door panel = runtime-dressed (deliberate box, seven sections painted by
  `truckbay/sectionalDoor.ts` after modelled joints aliased at 34 m), slushie =
  runtime-dressed (hoppers, taps, tray added at runtime). Cupid/register overrides removed
  (settled by D-034/D-032).
- **Runtime-derived GLBs (render-path.mjs missed this route):** `GeneratedModel.tsx` feeds
  stationCanopy, fuelPumpShell and stationGrill to `createPosterStationGeometry`,
  the market stall to `createMarketCanopyGeometry`, the barn to `createBarnJoineryGeometry`,
  and the shop to `createShopDisplayGeometry`. Before installing any of these (fuel pump
  candidate, shop in-place), judge IN GAME (forecourt/kiosk/square cameras) against the
  current runtime result, and run GeneratedModel.test.tsx / GasStationInstanced.test.ts.
- **fix2 finished** (`wf_a8c1cc8f-50f`, 363 agents, ~50 M subagent tokens, no errors; result
  in `fix2-result.json`, outcomes in `fix2-outcomes.json`): **14 accepted** (13 candidates:
  dock canopy, dock leveler lip, dock door frame, station shelving, wooden bollard, fuel-pump
  shell, wheel chock, yard access node, crane, fuel island, guard shack, manifest holder,
  scale kiosk; and wishingwell, in place), **20 at cap** (shop, townhall, pub, fountain,
  register, coop, truck wash, station counter, utility fuel shell, propane large shell,
  wooden footbridge, compactor, dumpster, extinguisher, jockey, pallet charger, maintenance,
  stretch wrap, weight scale, cupid), **6 blocked** (windmill, grill = runtime-contract;
  door panel, slushie = runtime-dressed; checkpoint booth, metal bollard = budget ceilings,
  new). Candidates are NOT installed yet ("DELIVERED != ACCEPTED" is expected).
- **fix2 at-cap A/Bs** (19, Sonnet, register compared against its kept fix1 round
  `j-373c46688a`; shop judged in game instead; decisions `ab2-decisions.json`): 18 keep,
  1 restore (utility fuel shell, low confidence: never installed; its authoring file moved to
  `rejected/authored/`). Extinguisher kept, but the judge flagged its board as dark maroon
  instead of red: colour fix in the hygiene pass. Kept in place already: pub, townhall,
  fountain, register. **14 kept candidates still to install as "improved":** coop, cupid,
  propane large shell, station counter, wooden footbridge, compactor, dumpster, extinguisher,
  jockey, maintenance, pallet charger, stretch wrap, truck wash, weight scale.
- D-036: metal bollard 96 -> 324, checkpoint booth 100 -> 140 (2 placements each); follow-up
  run fix3 (`wf_1fe40b2d-2ee`) on just those two. Install integrator for the 13 accepted
  candidates is running (fuel pump gated on an in-game forecourt A/B).
- **13 accepted candidates installed** (integrator, 2026-11-06): each prepared source
  `<slug>-authored-v2.glb` equals its accepted candidate; each installed GLB tied its accepted
  turntable in a blind Sonnet A/B (9 high, 4 medium); fuel pump tied in game (forecourt, kiosk).
  Pipeline fix: opt-in `authoredTextures: true` registry flag in `normalize-model-assets.mjs`
  ships authored JPEG atlases byte-exact (re-compression had softened the canopy relief).
  The kiosk scale kiosk now uses `metalness: 1` as judged (old delivery 0). Asset tests
  296/4 before and after (all 4 pre-existing). Lead fix: `fuel-pump-shell.py` default atlas
  -> preserved `fuel-pump-shell-atlas-e24d2734.glb`, so a plain rerun reproduces `1add479e`
  (verified). **Open for the hygiene pass:** 12 of the 13 contain no Tripo bytes but their
  GLB copyright and manifest `source`/`attribution` still credit Tripo3D (correct to
  "authored MillOS geometry; Tripo original preserved as provenance", checking
  validate:community first); the GasStationInstanced pump UV test now reads unindexed vertices
  of a welded GLB, so it should index first.
- Checkpoint booth ACCEPTED in fix3 at its D-036 budget; metal bollard still in rounds.
- **Integrator 2 running:** 14 improved candidates + booth (with the CheckpointBarrier west
  pane change), in-place integration of pub, townhall, fountain, wishingwell and register,
  shop judged in game vs HEAD, extinguisher red correction. Then the civic lamp rebake.
- **Maps pass 2 landed** (every kept change won or tied blind; Sonnet frame verdict still FAIL,
  no blocker): dusk fill follows the blue hour (D-037; sheets in
  `test-results/art-review/dusk-before-after/`, lead looked at 19:00: reads as dusk, ground
  legible), forge smoke as soft camera-facing puffs (2 tris each, was 96), horse matte
  (`RiggedCreatureModel.tsx`, paddock horses too, paddock not captured), caravan camera
  reframed, grass albedo v2 (pin `sceneTextureBake.test.ts` terrainGrass -> 591f3796),
  hill-seam and dusk-hill-form trials reverted (equal). Tests 23 files 399 -> 402, 0 fail.
  Not yet done: dawn ~05:00 capture; the gas station's blank back wall (dressing it means
  updating `GasStationInstanced.test.ts`'s pinned layout count of 170: a deliberate change,
  hygiene pass); field-mosaic seams need a shader-level rework; floating leaf cluster at top
  left of the `forge` frame; empty grass foregrounds; flat caravan-frame paving and office
  facade. Its first capture runner broke the lock heartbeat (spawnSync); fixed to async; it
  rebuilt `dist/` under the lock.
- **Integrator 2 landed:** 13 installed (compactor, dumpster, jockey, weight scale,
  maintenance, pallet charger, stretch wrap, footbridge, station counter, checkpoint booth,
  Cupid, extinguisher with red board `#b91c1c`, coop), each tied blind in its turntable, plus
  6 in-game paired wins; the shop beat HEAD in game (kept); pub, townhall, fountain,
  wishingwell and register integrated in place (all regenerate byte-for-byte). CheckpointBarrier
  west pane now stops at the door jamb. 49-file baseline 737/7 (+1 crashed suite) -> 753/1
  (civicLampShadows, expected until the rebake). Not installed: truck wash (runtime fallback
  mirror -> runtime-contract), propane large shell (not rendered: D-038). Windmill builder
  restored to HEAD (fix2-blocked copy in `rejected/`). Untracked new files needing `git add`
  at commit: `scripts/blender/authored/*.py` and `assets/source/models/world/*-authored-v2.glb`.
- **Running now:** civic lamp rebake; village civic buildings and hedges as walking solids;
  read-only map of the 17 runtime-contract chains (`runtime-contract-map.json`); hygiene
  (Tripo credit accuracy, pump UV test, gas-station back wall + layout count 170, booth glass,
  truck-wash dead code, gardenbed/duckpond determinism). Metal bollard (fix3) still in rounds.
- **Runtime-contract plan (advisor):** after the rebake releases the lock: in-game triage of
  the 17 with a Sonnet scene judge naming each; build only the ones it names, owning file = the
  TS geometry source, exporter first where none exists, in-game blind A/B acceptance; pilot
  with the truck wash (candidate `ea4548d0` ready). Cottage dead-helper removal after the rebake.
  Final gates when millos-6e is idle; no named tsc baseline at HEAD was taken this session
  (state as a shared-tree caveat).
- fix3 done: booth accepted (installed by integrator 2); metal bollard at cap, last round
  `j-9305516f49` won a blind A/B against the original (high confidence: mooring cap and neck
  vs bare octagon) -> keep as improved; **install pending** (after hygiene and collisions finish,
  to avoid concurrent registry edits).
- **Civic lamp rebake landed:** export 452,405 vertices / 201,434 triangles / 38 objects
  (village, medium, noon, headless Metal, `disableDistanceLod` on so the trunks export their
  near mesh), 27 sources matched within 1 mm, PNG `f6e01f6c…`, JSON `32f8538c…`,
  `CIVIC_SHADOW_ASSET_VERSION` `f80527bf…`; casterPins updated for townhall, pub, shop,
  wishingwell, fountain. civicLampShadows + VillageGardens 49/49; validate:shaders/depth pass;
  same-page shadow isolation moves 485,740 px (square 22:00). Blind A/B: rebake wins 4/4.
  Doc drift to fix in VISUAL_FIDELITY_LOOP.md: no export driver in the repo (adapter in
  `output/civic-rebake-20261106/`), casterPins are computed, not exported; distance LOD
  must be disabled; `verify-civic-codec-rebind.mjs` now fails its first check (no codec
  record; ungated). **Check after hygiene:** fountain and wishingwell sha256 must still equal
  their new casterPins (`2ab7febb…`, `689c1c7f…`), since hygiene edits refine_civic_props.py.
- **Civic collisions landed** (D-039): church, town hall, pub, school, forge and the three
  shops are walking solids measured from their GLBs (probe rays at six heights; tests re-derive
  them, verified to fail on a 5 cm wall shift); porticos, forge bay and market stalls stay
  open; 40 hedge rows plus town-hall privet, canal-walk and riverbank hedges solid with every
  gap kept. No walk needed rerouting. Main and lake path start points moved 0.53 m clear of
  the corner posts (no gate exists; a pedestrian gate would be Nell's design call). 17 files
  549 -> 652 tests, 0 fail; spawn sweep 180/180. Walls measured from the working-tree GLBs, so
  re-run walkingObstacles.test.ts if any village GLB changes again.
- `docs/DECISIONS.md` is UNTRACKED in git (never committed). Whoever commits must add it.
- **Runtime-contract triage (Sonnet, in game, `runtime-triage-20261106`):** RETAIN spouting
  flanges, mill/sifter/packer housings, flour sacks, dock door. WORK: spouting crossbeams
  (packing runs unsupported), forklift body (reads as a plain box: check close before touching
  the CC-BY hero model), dock bumpers (vanish in canopy shade), oak trunks (stick forks),
  windmill hub (sails pass into the cap), grill + slushie (unresolved: need the kiosk camera).
  Scene blockers: NearHorizonCity flat cut-out, floating leaf cluster at the forge. D-040: four
  more unrendered models (industrial portal, truck tyre, drainage pipe, dock-door panel GLB).
- **Maps pass 3 running** (`wf_7d336e08-75e`): A interior (crossbeam supports, sifting ceiling
  moire, concrete joints, packing dressing), B docks + trees (bumper material, oak trunk
  profile + GLB regen note, floating leaves, crushed canopy shade; sole owner of riverbank
  re-pins), C horizon (city cut-out, field mosaic shader rework, ridge profile, farm pond).
  **Held until hygiene finishes** (file overlap): forklift (close check), windmill hub
  lockstep, grill/slushie via kiosk camera, office facade, caravan-frame paving, empty
  foregrounds, dawn capture, bollard install, cottage dead-helper removal.
- **Hygiene landed and installed by the lead:** 24/25 re-authored models carry no Tripo bytes
  (fuel pump keeps Tripo atlas images, credited as such); credits via
  `runtimeLicense`/`runtimeAttribution` rows; lead copied the deterministic gardenbed
  (`542a087c`) and duckpond (`a74f3645`) sources (cause: Blender UV-sphere face order; fixed by
  sorting in `refine_civic_props.py sphere()`), re-normalized 27 ids, ran the manifest credit
  rewrite (75 lines), record-provenance for all 27, emptied
  `AUTHORED_CREDIT_PENDING_RENORMALIZE`, added walking solids for the new ice chest and vending
  machine. validate:assets 148/148; normalize header + crafted + walking tests 500/500.
  Also: index-aware pump UV test, gas-station south wall dressed (layout count 170 -> 190),
  booth glass `#8aa4bb`, truck-wash builder dead code removed (file back at HEAD).
  Fountain and wishingwell still equal their new casterPins.
- **Running:** maps pass 3 (A/B/C); installer (metal bollard + cottage dead-helper removal with
  byte-identity proof); in-game fixer (forklift close check, windmill hub, grill/slushie via
  kiosk, office facade, caravan paving, foregrounds, dawn).
- **Metal bollard installed** (candidate `9305516f` = rebuild; delivered `63fcf19f`; row adds
  `surface.metalness: 0.06` to keep the judged material, since the pipeline defaults metalness to 0).
  Blind Sonnet A/B installed vs candidate: tie, high confidence (key: installed = B, candidate =
  A, pair `scratchpad/pair1`; the consent gate refused the key-file write, so it is recorded here).
  **Cottage dead code removed:** 457 lines from `rebuild_village_architecture.py`; the pub's
  thatch helpers stay; all eight assets the script builds regenerate byte-identical. Found:
  the texture-slot regex `/orm|rough|metal/` at `normalize-model-assets.mjs:3773` mislabels a
  colour atlas when the slug contains "metal" (cosmetic; left so watertrough's farm pins don't move).
- **Maps pass 3 landed** (`maps3-result.json`). Lesson: workflow subagents have no Agent tool,
  so they cannot spawn judges. Group A ran its judges via `claude -p --agent <name> --model
  sonnet`; B and C self-judged, so the lead ran fresh Sonnet blind-ab-judges on
  `groupB-ab`, `groupC-ab-noon` and `groupC-ab-dusk`.
  - A (verified by Sonnet; final judge 0 blockers; A/B packing better, others equal): spouting
    hangers on the packing runs (+2 draw calls), 5 m saw-cut floor joints + panel tone
    (`factoryFloorMacro.ts`, bake pins re-pinned), packing right half dressed + instanced soft
    contact shadows. Ceiling stripes NOT fixed: geometric aliasing of the 1.5 m purlins (inferred).
  - B (pending blind verdict): floating forge leaves (parkland spray cards re-seated inside the
    crown, `InstancedFoliage.tsx:467`), dock rubber/shelter fabric finishes (`TruckBay.tsx`),
    re-pinned TruckBay + InstancedFoliage in riverbank test. The "oak" trunks were parkland trees
    in `ExteriorVegetation.tsx` (pinned): exact fix recorded (start first fork at y 2.85, base
    0.31). Village/farm fork edits in InstancedFoliage (`:454`, `:480`) have NO A/B (baseline
    capture timed out): verify or revert. Crushed shade lever is the fill rig (warm
    hemisphere ground/horizon in daylight, or a canopyBounce-style yard bounce).
  - C (pending blind verdict): NearHorizonCity takes the hill's own aerial haze, darker plinth,
    ~50 foot trees (1 draw), chimneys (`millos-near-city-aerial-v1`); field mosaic rework
    (neighbour-parcel blend, hedge on the bent line, contrast fade 260-680 m, cache key v32);
    ridge crest rounded + higher harmonics (flanks still chords; far ring capped at 13,000
    triangles by a test, 768 columns would need ~24.6k). Farm pond unchanged (already full water
    material; lever would be in FactoryExterior).
- **Maps 3 blind verdicts (Sonnet, keys resolved by lead):** B: floating forge leaves fixed (the
  cluster appears only in the before frame), dock surfaces tie. C noon: after wins village (clear),
  huts, lake, forecourt, packing, receiving (slight), ties overview/farm, so 0 losses. C dusk:
  after wins forecourt and packing, ties the rest. All of maps 3 stays. Noted: packing hanger
  struts read as thin vertical lines through the glazing (judged a minor cost twice); at 19:00
  the distant town's walls merge into the hill haze, leaving lit windows.
- **Running:** follow-up agent (parkland trunk fork step in `ExteriorVegetation.tsx`, blind
  verification of the two village/farm fork hunks in `InstancedFoliage.tsx`, warm daylight fill
  for the navy dock shade); in-game fixer (forklift, windmill hub, grill/slushie, office facade,
  paving, foregrounds, dawn).
- Fix pilot launched on the seat batch (3 assets, 3 owning files) to prove
  build -> normalize -> render -> fresh judge -> two-pass acceptance end to end.
- **In-game fixer landed** (Sonnet verdicts, keys `scratchpad/ab-rt6-{1,2,3}-key.json`):
  forklift guard/mast graphite + tyre grey (equal), `forklift-close`/`windmill`/`station-shop`
  cameras, office facade relief (better), huts + lake scrub pockets (better), world paving
  stain (equal), shop sausages seated / slushie collar + fill (equal; real geometry fixes, small
  at that distance; kept), windmill iron cap LOST its A/B and was removed; hidden shaft bridges
  a 13 mm stub-hub gap no camera shows (moves no visible pixels; kept as geometry, not claimed
  as a visual fix). Dawn: lamps 94% at 06:30 come from `getExteriorLampLevel` (millos-6e's
  file); exact dawn-only fix sent to millos-6e by SendMessage. 05:30 dark lake path mirrors
  the 18:30 dusk state of D-037.
- **Lead fixes after the fixer:** far forklift stand-in canopy + mast now `structural`
  graphite (`#384045`, matches near model; amber canopy popped at the LOD swap).
  **Forklift fork datum = floor (D-041):** authored pallet floated 0.3 m above the GLB tines
  (both judges); every tier's floor pickup hovered 0.28 m. Pallet origin y 0.06 in all three
  tiers, compact tines/plate and procedural forks lowered, `FORKLIFT_PALLET_REST_ABOVE_FORK` 0,
  dock deck fork height 0.71, billboard load box follows. 25 forklift-related test files pass
  (203 + 21 gameplay). Blind Sonnet A/B (`ab-fk-datum`, key in scratchpad): after wins
  forklift-close (clear) and forklift (slight). Capture `fk-datum` FAILs firstFrame/p95 only
  under load 3.2-3.6/core (contended), not a regression.
  Drainage pipe preload removed (D-042). `verify-civic-codec-rebind.mjs` handles a full
  rebake (prints NOT_APPLICABLE, checks 7 caster pins + atlas). Export driver promoted to
  `scripts/export-civic-casters.mjs`; VISUAL_FIDELITY_LOOP bake steps corrected.
  Normaliser names textures by material slot (fixes metal-bollard "orm" colour atlas and
  checkpoint-booth "albedo" ORM map); both re-normalized (`65cd6439`, `4292fd87`), provenance
  recorded, validate:assets 148/148, booth/walking/normalize tests 55/55.
- **Purlin sub-pixel fade tried and REVERTED:** a `worldSurface` opt-in that faded members under
  ~2 px into the liner (purlins 0.16 m). Moved 3-8% of pixels in hall scenes and removed most of
  the far-ceiling moire, but the blind Sonnet A/B (`ab-purlin`, key in scratchpad) preferred
  BEFORE in sifting, interior and milling (slight; the rank "dissolves, the ceiling reads as a flat
  plane"), packing tie. Reverted in full; worldSurface.ts and its test byte-equal HEAD again.
  The ceiling stripes stay as a known residual (judge: no stair-stepping or banding visible in
  either arm at 1:1; motion shimmer unverified).
- Follow-up agent landed: parkland trunk ledge kept (blind tie, then "after slight" when pointed
  at the junction: a prompted verdict, supported by geometry 0.135 -> 0.016 m), village/farm
  fork hunks equal (kept, no visible effect), dock shade daylight neutralise 0.65 + zenith 0.9
  (markings after, overview/receiving slight, others tie). D-043 dawn mirrors dusk.
  Truck wash: not named by the in-game runtime triage, so unchanged.
- **Final gates (2026-11-06 evening):** typecheck clean (raw `tsc -p .` 212 in test files, none in
  files this session touched), lint clean (fixed unused `side` in refine-yard-fixture-fit.mjs),
  format clean, validate:assets 148/148, depth/shaders/reachability/community pass, tests
  972 files 7841/7841, build OK. Dock frames in `fk-datum` show no forklift at a deck, so the
  0.71 deck fork height is verified by `dockLoading.test.ts` only, not by pixels.
  Untracked files to `git add` at commit: docs/DECISIONS.md, scripts/export-civic-casters.mjs,
  scripts/asset-loop/, scripts/asset-turntable*, scripts/blender/asset_turntable.py,
  scripts/blender/authored/*.py, assets/source/models/**/*-authored-v2.glb,
  src/utils/walkingObstacles.ts (+tests), capsuleWalk.routes.test.ts,
  firstPersonSpawn.sweep.test.tsx, canopyBounce.ts, docs/ASSET_JUDGE.md, .claude/commands/asset-loop.md.
