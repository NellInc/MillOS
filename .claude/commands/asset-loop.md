# Asset Loop

Polish MillOS models (and then maps) with an independent judge, after the
r/ClaudeAI Opus + Blender workflow Nell adopted on 2026-11-04: fixed cameras,
a different model grading every render, nothing passes below 8, a defect that
survives three rounds forces a different construction approach, and a handoff
file so a new session can resume.

Arguments: `$ARGUMENTS` — asset ids, an area (`world`, `village`, `farm`, ...),
`triage`, or `maps`.

## The one rule that matters

**The builder never accepts its own work.** Every round is graded by a fresh
judge running on a different model (Sonnet when the builder is Opus) against
`docs/ASSET_JUDGE.md`. The judge receives the asset directory, the context card
and the prior defect IDs only: never the diff, the round number, the builder's
notes or its hopes. "Looks good" from the builder is not a round.

## Files

| Path | Role |
|---|---|
| `scripts/asset-turntable.mjs` | Renders 12 fixed cameras (colour + clay), contact sheets, probe report, contract check; holds `.capture.lock` |
| `scripts/blender/asset_turntable.py` | The Blender side: cameras, clay pass, floating/winding/manifold probes. Read-only, never exports |
| `docs/ASSET_JUDGE.md` | The fixed rubric. Only Nell changes it |
| `output/asset-loop-<date>/ledger.json` | Per-asset state: context card, scores, defect IDs with strike counts, approach notes, round history |
| `_contprompts/millos_asset_loop_<date>.md` | Goal, done-definition, rules and the handoff State section |

## Stages

### 0. Preflight

- `df -h /` and free RAM. Refuse renders under 2 GiB free (the wrapper enforces
  it) and builds under 4 GiB. No worktrees (disk floor).
- Named baseline: `npm run validate:assets` plus the asset-scoped tests
  (`npx vitest run scripts/asset-turntable.test.mjs scripts/crafted-assets.test.mjs scripts/normalize-model-assets.test.mjs scripts/glb-self-coplanar.test.mjs`).
  Record pass/fail counts and failing names before any change.

### 1. Context card (once per asset, reused every round)

What the object is; where the game places it and the typical viewing distance;
what the runtime adds around it (glass, signs, lamps, smoke, water, animation,
people); its style family (village/farm/castle = miniature, D-005); identity
features that must survive (D-004); the authoring file that owns its geometry;
whether it is `casterPinned` (village townhall, pub, school, shop, wishingwell,
fountain, postbox: any byte change needs the civic lamp rebake).

### 2. Triage

`node scripts/asset-turntable.mjs --all --label=triage-<date>` then one fresh
judge per asset. Write scores and defects to the ledger. PASS assets are
retained untouched (strong models are not changed for activity).

### 3. Contract, before building

For each failing asset, write its done-definition into the ledger *before* the
first edit: the defect IDs to clear, identity to keep, budgets (unchanged),
protected nodes and animations, casterPins status, owning file, and the
construction approach. This is what stops a builder declaring victory.

### 4. Build round

1. Edit the owning authoring script only. Never edit a delivered GLB, never
   round-trip a pipeline GLB through Blender (`scripts/blender/PROMPTS.md`
   rule 1), never write provider originals.
2. Regenerate the prepared source with the owning script, then
   `npm run normalize-models -- --only=<id>` (never a bare run) and
   `npm run validate:assets`.
3. `node scripts/asset-turntable.mjs --ids=<id> --input=<prepared or delivered GLB>` with no `--label`: the
   default label is the candidate's own hash, because the run label is part of the path the judge
   sees and must not carry a round number or intent.
4. Fresh judge with the prior defect IDs. Re-grade all twelve views every round,
   not just the region that changed.
5. Update the ledger: scores, defects, strikes.

**Strike rule.** A defect ID present in three consecutive judged rounds means
the method is wrong, not the dose: rebuild that part another way (trace the
silhouette from front/side profiles and loft or lathe it instead of stacking
primitives; re-lay its UVs instead of nudging the texture; model the joint
instead of moving the part). Record the change of approach in the ledger.
Change one material region per round.

**Round cap.** Six rounds. At the cap, stop and record what is still wrong for
Nell's call.

### 5. Acceptance

- Two consecutive fresh judge PASSes on the same GLB sha256.
- The asset is seen in the live game: `npm run capture:art` on a scene that
  frames it, graded by the scene judge (`visual-fidelity-judge` rubric) run with
  `model: sonnet`, labelled with the model that produced it.
- Asset-scoped tests and `validate:assets` pass; whole-project gates
  (`typecheck`, `lint`, `build`, `test`) on each coherent batch, with the
  shared-tree caveat stated when other agents' work is in the checkout.

### 6. Maps

District fixed cameras (overhead, eye level at 1.6 m, reverse) graded by the
scene judge on Sonnet, plus a capsule walk (radius 0.3 m, height 1.75 m, step
0.35 m) over every declared first-person route through the shared floor and
collision definition the castle stairs use. Blocked doorways, gaps and
unclimbable steps are blocking defects.

## Parallelism and safety

- **One builder per authoring file.** Assets that share an owning script are
  worked one at a time by the same builder; different files run in parallel.
- Normalize, manifest and provenance writes are serialised by the orchestrator.
- Renders take `.capture.lock` (the wrapper does). Never overlap a capture with
  a performance measurement.
- No Poly Haven or other photo-scan textures (D-005, `maxTextures`), no Tripo or
  other paid generation (D-003), no new dependencies, no budget relaxation.
- Local only: no push, no deploy, no audio.

## Reporting

End each run with **Blocked on me** · **Changed** · **Found**, counts for
passed / improved / at-cap / blocked, and update the contprompt State section.
Name the model that produced every verdict.
