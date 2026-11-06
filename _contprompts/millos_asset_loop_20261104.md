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
  the accepted park bench (`ac5f8460`, pin `a44763b7`) needs **Nell's approval to
  re-pin**; never edit that hash directly. No other test pins delivered GLB bytes.
  `scripts/reconcile-farm-models.test.mjs` pins the farm authoring scripts' hashes
  (coop, windmill, farmhouse): update at integration, after acceptance, not mid-round.
- **Owned-build fan-out launched** (2026-11-05, run `wf_340bcbfa-b8c`): 34 assets in 16
  owning-script groups, one builder per file at a time.
- Fix pilot launched on the seat batch (3 assets, 3 owning files) to prove
  build -> normalize -> render -> fresh judge -> two-pass acceptance end to end.
