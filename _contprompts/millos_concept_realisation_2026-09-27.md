---
title: Reference-faithful MillOS concept realisation
status: complete-local
approved_by: 'Nell: craft new concept art with strong adherence to existing models, create a goal under 3800 characters and execute it.'
---

# Goal

Evolve MillOS through reference-faithful concept art and verified implementation.

Finish any remaining authorised asset-polish repairs, preserve the existing Opus fixes and dirty authored work, and establish a clearly identified current visual baseline. Keep the previous quiet-host performance gate visible until it can actually be measured; do not mistake static or visual success for performance acceptance.

Create six production-oriented concept plates anchored to screenshots and model details from the real current scene: (1) milling and sifting machinery, (2) packing and logistics objects, (3) silos and receiving/exterior infrastructure, (4) Dead Dino gas station, (5) village architecture and woodland, and (6) farm, parkland and waterways. Inventory the live asset families across these plates so coverage is explicit. Each plate should depict how the existing place and objects could look better while retaining recognisable silhouettes, proportions, topology of the layout, operational clearances, palette, branding and narrative character. Use supplied reference captures directly. Avoid generic redesigns, invented buildings or machinery, impossible light effects, unrelated props and detail that disappears at gameplay distance.

Save the concept images, exact prompts and reference mapping in the project. Review each plate against its references, identify model drift, and correct or explicitly reject invented features before implementation. Translate accepted improvements into a finite, concrete concept-to-source checklist. Prioritise coherent materials, believable joints and edges, practical architectural detailing, richer organic forms, legible functional objects and restrained day/night lighting. Preserve successful recent polish.

Implement the accepted checklist in the live models and scene code using existing authoring, batching, texture and validation pipelines. Keep source assets, generated delivery assets and runtime consumers consistent. Preserve terrain contact, doors and routes, machine/cargo interfaces, animation and reduced-motion behaviour, quality-tier fallbacks, instancing and existing asset budgets. Avoid speculative frameworks and new dependencies. Do not replace geometry improvement with a generated picture or call concept art itself a completed runtime change.

Validate affected geometry and behaviour with focused tests, then run the required whole-project build, typecheck, lint, formatting and relevant asset, shader, depth, reachability and bundle gates. Review matched before/concept/after views, including close details, representative low/medium/high tiers and day/night states. Use paired measurements where a visual or performance claim depends on them. Fix in-scope regressions and continue through internal checkpoints until every accepted checklist item is implemented and verified or a genuine external or authorisation boundary is recorded.

Keep all capture browsers muted; play no audio or music. Serialize rendering and builds with the existing capture lock. No push, deployment, publication, unrelated process control or dependency installation. Deliver the saved concepts, concise implementation/evidence summary and an honest account of any unresolved acceptance gate. Mark this goal complete only when all required outcomes are genuinely satisfied.

# Execution state

- Goal created with 3329 characters. No token budget requested.
- Previous polish implementation is complete. Quiet-host performance acceptance remains open due to host contention; this does not invalidate the reference images or block the independent concept work.
- Current starting candidate: main at 3026399 with existing dirty authored work. Latest bounded pass:34 focused tests passed; build/typecheck/lint/format/assets/depth/shaders/reachability/bundle/uncrewed passed. Prior whole suite:1888 tests, historical only.
- Work inline unless an independent bounded lane materially benefits from delegation. Root owns image generation, visual acceptance, rendering/build locks and integration.
- Authority: local concept generation from selected scene captures, local implementation/tests/renders. No audio, publication, push, deployment, dependencies or unrelated process control.

# Pre-check

- Risks: generated art may drift from models; detail may be unreadable or too expensive; changed joints/materials may break assembly or night appearance. Mitigation: fixed reference views, explicit invariants, per-plate source checklist, unchanged operational envelopes and rendered plus numerical checks.
- All six plates require a reference-faithfulness review before their changes become implementation targets.
- Completion is the entire accepted checklist and applicable final gates, not merely saved concept images.

# Plate ledger

| Plate | References | Concept review | Accepted implementation | Evidence |
|---|---|---|---|---|
| Milling and sifting | milling, sifting |01-machinery-review.md | M1 gasket/rim/hinges, M2 clamp shoes | implemented; final high/low/day/night views accepted |
| Packing and logistics | packing, prior compact-loaded |02-packing-logistics-review.md | P1 service fittings/hopper band; cargo retained | implemented; final high/low/day/night views accepted |
| Silos and receiving | silos, receiving |03-silos-receiving-review.md | S1 shell joints/base anchors; receiving retained | implemented; final high/low/day/night views accepted |
| Dead Dino station | prior verified station/close |04-station-review.md | D1 caps, D2 digits, D3 kickplate/gaskets | implemented; root15tests passed; final day/night views accepted |
| Village and woodland | square, grove |05-village-woodland-review.md | V1 valances/braces, V2 setts; organic trees retained | implemented; final high/medium/low views accepted |
| Farm, parkland and water | paddock, water, parkland |06-farm-parkland-water-review.md | F1 straps, F2 trough lip, W1 shore reeds/stones | implemented; final21-test repair supplement passed; day/night views accepted |

All paths above are under output/concept-realisation-20260927/concepts unless named as reference views. Exact prompts saved under prompts, raw references under references, all146 catalogue dispositions in COVERAGE.md and asset-coverage.json. All six images were generated with the built-in imagegen tool using actual supplied captures.

# Deviations and external gates

- Quiet-host performance gate remains separate and unverified. Working if no timing claim is accepted from overloaded-host art renders.

- Named pre-edit baseline:40tests in5files, zero failures; expected JSDOM canvas getContext diagnostics only. Shell wrapper hit the reserved zsh variable `status` after Vitest finished; terminal log independently shows all40passed.
- Accepted native details leave all146 delivery GLBs unchanged; new trim geometry is used by live assemblies rather than editing fallback bodies alone.

## Integration findings

- First coherent candidate: build, typecheck, lint, format, asset/depth/shader/reachability/bundle/uncrewed gates passed. Full suite completed:1917tests in182files passed, exit0. Twenty high-tier muted captures returned no console/page/request failures, audio context not created.
- Root image inspection rejected the invisible fountain setts: exact zero changed pixels in its159000pixel matched crop. Cobble negative polygonOffset is the far-side depth contract; a dedicated stronger biased sett material repaired the issue. Final matched crop:9635pixels changed; root reviewed high/medium/low renders. Geometry existence and its seating tests did not establish visibility.
- Root reshaped lake planting into irregular sheaves with varied spacing, bank depth and maturity after the first close-up showed a row-like pattern. No extra surfaces or triangles.

## Final acceptance

- Six concepts, exact prompts, reference mapping and drift reviews saved. All accepted items M1/M2/P1/S1/D1/D2/D3/V1/V2/F1/F2/W1 implemented and visually inspected in the live assemblies.
- Whole suite:1917tests in182files passed, exit0. Baseline:40focused tests passed,0failures. Final fountain/reed repairs also passed21focused tests after the full suite started.
- Final build, typecheck, lint, format,146-asset gate, depth, shader, reachability, bundle and uncrewed checks passed.
- Final41captures:20high,8low,6medium,7medium/night. No console/page errors or failed requests; all audio contexts not-created and active nodes0.
- Final source/served/concept hashes and all146 unchanged delivery-asset hashes checked. Source scope13files; original unrelated dirty work preserved.
- Visual report: output/concept-realisation-20260927/REVIEW.md. Machine evidence: result.json, source-candidate.json, served-candidate.json and validation logs in the same directory.
- Optional Impeccable unavailable, not installed. Quiet-host performance remains a recorded external acceptance boundary (final host load26.95-31.87/core); no timing result claimed. Goal's concept/implementation/functional/visual deliverables complete.
- Local only. No push, deployment or publication. No automatic follow-up is scheduled.
