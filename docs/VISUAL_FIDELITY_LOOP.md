# Visual Fidelity Loop

A repeatable adversarial art-review loop for MillOS: capture fixed scenes, have
an independent judge grade them against a fixed written rubric, fix what it
found, prove the fix helped and stayed within the existing budgets, repeat until the rubric is met or
the iteration budget is spent.

## Why this document exists

This loop had already been run here, by hand, at least once — `test-results/`
still holds `aaa-baseline-v040`, `aaa-iter1`, `aaa-final` from an earlier
session. None of it is reusable. `test-results/` is gitignored, so what survives
is a pile of PNGs with no record of which commit, scene set, quality tier, or
hour produced them, no rubric, and no verdict. The capability was never the
missing piece. **Durability was.**

So the loop is written down, the judge's standard is a tracked file, and every
capture records its own provenance.

## What was already in place

| Leg                                                    | Status                                                  |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Fixed-camera scene capture at shipping fidelity        | `run-performance-benchmark.mjs --art --motion`          |
| Blind A/B staging so a reviewer can't grade intent     | `scripts/stage-blind-ab.mjs`                            |
| Blender for asset design, with this repo's constraints | `scripts/blender/PROMPTS.md`, `machine_part_preview.py` |
| Performance budgets to hold the fixes honest           | `npm run benchmark:runtime`                             |

New here: the scene-set + provenance wrapper (`npm run capture:art`), the
operational presentation capture (`npm run capture:operations`), the two judge
agents, and this protocol.

## The bar

**Reference class: real industrial photography of working flour mills, feed
mills, and grain terminals**, then industrial and rural simulation games
(Satisfactory, Farming Simulator 22, Teardown, Manor Lords) for what is
achievable in real time.

**Explicitly not a cinematic sci-fi bar.** The recipe this loop is adapted from
judged a space game against Starfield. Pointed at MillOS, that reference class
generates criticism — lens flare, anamorphic streaks, heavy filmic grade,
volumetric spectacle — which if acted on dismantles the project's actual art
direction _and_ can never be satisfied, so the loop would never terminate. The
reference class is written into `.claude/agents/visual-fidelity-judge.md` and is
load-bearing.

For the authored village, farm and castle, approved models and the pinned
miniature style take precedence. Photography informs light and material response;
it does not authorise a photoreal replacement. Working if critiques preserve
recognisable approved architecture while locating defects in its rendered finish.

## Screenshot-grounded target workflow

Adapted from [Dream Loop](https://github.com/achimala/dream-loop), especially its
[target guidance](https://github.com/achimala/dream-loop/blob/main/SKILL.md) and
[critic workflow](https://github.com/achimala/dream-loop/blob/main/references/pro-mode/workflow.md).
Borrow the review process; no external skill installation, asset service or
subscription-based model routing is required.

1. **Freeze the brief and baseline.** Record source/build hashes, named test
   failures, cameras, viewport/DPR, hour, weather and tier. Preserve approved
   architecture, signs, accessible paths, inhabitants and simulation authority.
   Working if every comparison names the same conditions and protected features.
2. **Make an achievable target.** Use an actual baseline capture as the image
   edit input. Existing approved artwork may guide palette and finish. Lock the
   target and reject invented buildings, altered footprints, missing people,
   unreferenced furniture or unreadable copy. Treat it as a visual brief, not
   evidence of implemented geometry. Working if each proposed change maps to a
   visible baseline defect without changing the protected scene identity.
3. **Review independently.** A fresh, read-only critic gets the target, actual
   frames and frozen brief, without the implementer's preferred diagnosis.
   Assess composition, lighting, materials and details. Each finding names the
   image/region, visible symptom, suggested repair and priority. Numbers are
   editorial judgments, never machine acceptance. Working if another person can
   locate each ranked defect in the supplied images.
4. **Refine a bounded batch.** The lead reconciles the findings with source,
   fixes approved defects and checks the far-side consumers. Retain authored
   Blender/procedural assets, batching and world-space surfacing where they fit.
   Paid generation, uploads, deployment and new dependencies require separate
   authority. Working if the diff follows the defect ledger and asset contracts.
5. **Confirm without moving the bar.** Capture the same conditions, plus the
   secondary angle and day/night controls needed by the change. Use the existing
   blind A/B utility for perceived improvement. One initial inspection and one
   corrective confirmation, at most two refinement rounds for this adaptation.
   Working if references, rubric and budgets remain unchanged between rounds.
6. **Keep proof separate.** Visual judgment, geometry/assets, tests/build,
   complete animation-ready loading, and eligible real-GPU Low/Medium frame
   pacing are independent gates. Retain failed and contended receipts. A smooth
   isolated asset or attractive still cannot certify the whole game. Working if
   the final disposition lists each gate and its actual evidence independently.

For the 4 October 2026 pilot, see `_contprompts/millos_dusk_fidelity_20261004.md`.
The scope is the existing village/civic square at dusk, local and silent.
There is no pixel-identical requirement: a single generated view cannot certify
hidden faces, physical access, correct normal maps or coherent moving lighting.

## The loop

### 0. Baseline

```bash
npm run capture:art -- --label=baseline-<date> --perf-gate --headed
```

Captures the current `art` scene set at `medium`, noon, clear, into
`test-results/art-review/baseline-<date>/`, plus a contact sheet, a manifest,
and a non-art performance run.

- `--headed` uses the real GPU. Headless falls back to SwiftShader, which is both
  far slower and **renders differently** — software frames are not valid art
  evidence.
- **Capture from a clean tree if the result is meant to be a baseline.** The
  manifest flags a dirty tree as a caveat, because those frames show uncommitted
  work and cannot be compared against a later commit.
- Scene sets: `art` (default), `full`, `quick`, `exterior`,
  `interior`. Lighting is a graded axis, so review at least one non-noon
  condition per round: `--time=18 --weather=cloudy`.

### Operational presentation evidence

The art set keeps the interface out of world-composition frames. Capture the
HUD and operational workspaces separately:

```bash
npm run capture:operations -- --label=operations-<date> --headed
```

The default set captures desktop overview, SCADA, AI Partner, workforce,
Bilateral Autonomy, safety controls, an active fire drill, a facility stop, and
the cleared recovery state, plus a compact mobile fire drill. `quick`, `desktop`,
and `safety` sets are available, or pass `--states=<comma-separated names>`.

Every state uses a fresh browser context, cleared persisted state, completed
onboarding, a fixed overview camera, blocked service workers, and the reduced
motion accessibility setting. Playwright opens each state through the shipping
Dock and safety controls. The manifest records the expected accessible surface,
runtime world-integrity result, browser diagnostics, viewport, and candidate
provenance. A stale bundle fails because the runtime must acknowledge
`operations=on` before capture.

The operational capture is presentation evidence. It does not establish a
performance budget. Run `npm run benchmark:runtime` on the same candidate before
calling a visual change shippable.

### 1. Judge

Spawn the judge as a subagent, pointed at the capture directory and nothing else:

> Use the `visual-fidelity-judge` agent. Capture directory:
> `test-results/art-review/<label>/`. Read the manifest, review the contact sheet
> and the full-resolution frames, and return your verdict.

Do not tell it what changed, which iteration this is, or what you hope it says.
It writes `verdict.md` into the capture directory.

**PASS = every axis ≥ 7/10 and zero blocking defects.** The seven axes and their
anchors are in the agent file.

### 2. Fix

Work the blocking defects in the order the judge ranked them. Route by kind:

| Finding                                                | Where it goes                                                                                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silhouette, profile, proportion                        | `scripts/blender/machine_part_preview.py --part <name>` to design against the real instance scale, then port the numbers into the procedural TS. See `scripts/blender/PROMPTS.md`. |
| Texel density, tiling, washed mid-tones, plastic sheen | `src/utils/textureGenerator.ts` — colour-space factories, channel usage, feature period. See the procedural texture rules in `CLAUDE.md`.                                          |
| Z-fighting, banding, depth artefacts                   | `src/constants/renderLayers.ts` presets; `npm run validate:depth`.                                                                                                                 |
| Lighting, exposure, shadow grounding                   | The live rigs in `src/components/environment/`, especially `OptimizedSkySystem.tsx`, `SceneEnvironmentIBL.tsx` and `SunShadowRig.tsx`; `PostProcessing.tsx` and `src/constants/colorGrade.ts`. Local exterior emitters use `exterior/ExteriorLighting.tsx`. Preserve one directional shadow caster and existing quality presets. |

### 3. Prove it, twice

A fix is accepted only if it clears **both** gates.

**Perceptual** — did it actually look better, judged blind?

```bash
npm run capture:art -- --label=iter-<n>
npm run review:stage-ab -- --before=test-results/art-review/iter-<n-1> \
                           --after=test-results/art-review/iter-<n> \
                           --output=test-results/art-review/ab-<n> --salt=<something new>
```

Then spawn the `blind-ab-judge` agent on `ab-<n>`. It must not read `key.json`,
and you must not tell it which side is new. Resolve the mapping yourself
afterwards.

**Budget:** does it remain within the existing acceptance limits?

```bash
npm run benchmark:runtime -- --scenes=<the scenes you touched> --quality=medium --headed
```

`--headed` here is not optional either. The budgets in `run-performance-benchmark.mjs`
(60 fps average, p95 ≤ 16.7 ms, p99 ≤ 25 ms, 1% low ≥ 45 fps,
and measured DPR matching the tier's requested effective DPR) are real-GPU numbers; headless
falls back to SwiftShader and cannot reach them, so a headless run reports a
failure that means nothing. Keep every budget comparison in the same browser mode.
Read all checks from the actual harness, including startup, long tasks, world,
motion and diagnostics. Its load-per-core threshold is 3.0: runs above that
remain contended evidence. Working if recorded gates use current harness limits
and never treat a visual capture or a contended frame sample as acceptance.

**Run captures alone.** Measured here: `overview` sampled **106 fps** in a quiet
12-scene run and **39.9 fps, p95 38.4 ms — FAIL** on the same scene, same
settings, same machine, while a judge subagent was doing heavy image analysis in
parallel. A capture competing with other work produces frame numbers that are
worse than useless, because they look like a regression. Do not overlap a
capture with a judging pass, another capture, or a build.

`--art` restores full fidelity and unpins reduced motion; the benchmark's own
help says frame samples in that mode are _indicative, not a budget gate_. A
visual PASS on an art capture with no accompanying non-art budget run is not
evidence that anything is shippable, and `capture:art` writes exactly that
caveat into the manifest when `--perf-gate` was omitted.

Then the standard gate: `npm run typecheck && npm run lint && npm run build && npm test`.

### 4. Terminate

Report the actual stopping state:

- **PASS.** Every gradeable axis ≥ 7, no blocking defects, budget held.
- **Budget exhausted.** Retain ranked unresolved findings and the completed
  proof. This is incomplete, not accepted debt or a performance pass. The
  screenshot-grounded adaptation allows at most two refinement rounds; other
  scopes need an explicit budget before execution.
- **Externally blocked.** Complete unaffected work and identify the exact
  missing access or eligible-host gate. Do not relax limits, displace another
  renderer or imply unattended continuation.

An axis the harness **structurally cannot** evidence is scored `n/a` and does not
block the verdict; it is listed in Provisos, and the result is a **PROVISIONAL
PASS**, never a PASS. A rubric item the harness cannot see would otherwise make
PASS unreachable no matter how good the render is, which is a broken halt
condition wearing the costume of a high bar. This escape is deliberately narrow:
a scene set that merely _omitted_ the evidence does not earn an `n/a`, or
narrowing `--scenes` would become a way to get axes excused.

**Axis 7 uses the dedicated operational set.** `operations=on` exposes the
shipping interface only when a fixed benchmark camera is active. World art
frames therefore remain unobstructed while the separate operational set makes
HUD hierarchy, SCADA readability, safety signaling, and compact layout
gradeable. `scada=on|off` still controls the telemetry runtime rather than
overlay visibility.

The source recipe for this loop did not terminate: "the judge kept critiquing and
it kept going overnight, then I manually stopped it." That is what happens when
the halt condition is a critic's satisfaction rather than a written standard. Two
rules prevent it here, both stated in the judge's own prompt: the rubric may not
be tightened between rounds, and findings below the blocking line are backlog,
not blockers.

The rubric may not be _relaxed_ either. If an implementing agent proposes editing
`.claude/agents/visual-fidelity-judge.md` to convert a FAIL into a PASS, that is
the loop failing, not passing. Rubric changes are a human decision, made
deliberately and outside a running loop.

## Failure modes this design exists to prevent

| Failure                                    | Guard                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer grades the intent, not the pixels | Blind A/B staging with per-scene side assignment and a rotating salt                                                                    |
| Loop never terminates                      | Written thresholds, fixed rubric, bounded iterations, blocker/backlog split                                                             |
| Beautiful and unshippable                  | Conjoined non-art budget gate; manifest caveat when it is missing                                                                       |
| Wrong aesthetic target                     | Reference class named in the agent file; cinematic sci-fi criticism ruled out of scope                                                  |
| Evidence that can't be reused              | `review-manifest.json`: commit, dirty state, scene set, every option                                                                    |
| Mis-framed evidence                        | Scene names validated against `BENCHMARK_SCENES` parsed from source — the runtime silently falls back to `overview` for an unknown name |
| Reviewing a stale bundle                   | `capture:art` builds by default; `--skip-build` records itself as a caveat                                                              |

## Files

| Path                                      | Role                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `scripts/capture-art-review.mjs`          | Capture wrapper: scene sets, validation, contact sheet, manifest, optional perf gate |
| `scripts/capture-operational-review.mjs`  | Deterministic operational UI states, desktop/mobile frames, manifest, contact sheet  |
| `.claude/agents/visual-fidelity-judge.md` | Absolute-bar judge. Rubric, thresholds, verdict format                               |
| `.claude/agents/blind-ab-judge.md`        | Regression judge over staged blind pairs                                             |
| `scripts/stage-blind-ab.mjs`              | Stages two capture runs into neutral A/B pairs                                       |
| `scripts/blender/PROMPTS.md`              | Blender headless/MCP prompts and this repo's asset constraints                       |


## Fixed-lamp concept realization

For an approved dense-lighting reference, use a located fixture manifest rather
than treating emissive lenses or additive floor pools as surface illumination.
Keep source counts resident and fade their intensities with the existing lamp
clock. Preserve the models, access paths, inhabitants and quality budgets.
Working if mapped fittings light actual receiver pixels and dusk does not change
the renderer light count.

The civic pilot uses `src/constants/civicSquareLighting.ts` and a fixed-lamp
radial-depth atlas. Its implementation is accepted only when the following
sequence has actual evidence:

1. Build the isolated candidate with `VITE_CIVIC_BAKE_EXPORT=1`, under the capture
   lock and with safe disk headroom. The tooling stage requests no substitute
   atlas. Capture the actual animation-ready scene, then export its world
   triangles through the benchmark-only civic instrument after measurement.
2. Inspect effective ancestor visibility, actual instanced transforms, caster
   bounds and exclusions. Export rigid opaque casters only. Alpha-tested crowns,
   opaque GPU-wind deformation, people and moving equipment require explicit
   exclusion. The civic exporter now checks the live WindDriver material identity,
   including opaque wind materials after hook composition.
3. Run `scripts/blender/bake_civic_lamp_depth.py` on that actual assembly. Retain
   source/geometry hash, source positions/ranges, shared cube bases, bake hash
   and PNG hash. The separate known-box fixture proves CPU depth encoding only.
4. Retain `public/textures/civic-square-lamp-depth.png` and matching JSON, then
   enable `CIVIC_SHADOW_BAKE_READY`. Normal builds load the real assets through
   the scene readiness boundary. Keep packed depth linear, nearest sampled and
   unmipped; reproject PCF edge taps into the neighboring cube face. Verify
   shader compilation, sampler headroom, thin casters, contacts and stale-input
   rejection on the actual renderer. A missing bake remains explicitly pending.
5. Measure shadows on/off/on in one page through the shared isolation uniform.
   Reject animated pixels using the existing surface-measurement pattern, then
   inspect source-by-source illumination, reversed views and noon/night/Low
   controls. Do not infer useful shadows from successful shader injection.
6. Run current-source aggregate checks, production build and the unchanged
   eligible startup/frame gates. Record separate still, runtime, performance
   and publication verdicts. Contended captures prove no performance pass.

The method adds no per-frame local shadow-map pass. It still costs a texture
sampler and fragment work. Static lamp occlusion applies to reflective PBR
receivers; Basic/emissive-only surfaces retain their existing semantics. Moving
local lamp-cast shadows are unsupported by this bake, while the existing single
celestial map supplies dynamic shadows on enabled tiers. A fixed-lamp pass does
not establish pixel-identical reference fidelity or moving local shadows.


### Actual origin and cache custody

The civic exporter checks the mounted world origins, rather than trusting a
parallel placement table. An emitter enclosed by rigid geometry is a failed
bake: the baker rejects any source with every radial ray blocked. Working if
missing/moved runtime origins and fully enclosed emitters fail before readiness
is enabled. Glass and lens emission remain separate from punctual illumination.
The benchmark-only gain scalar changes a source's incident radiance without
removing lights or changing its emissive fitting; on/off/on masks therefore
measure receiver illumination instead of a disappearing bulb.

Depth PNG and metadata requests share a content-derived query version. The
source test binds that version to both retained files, checks the PNG hash and
validates source positions/ranges/face convention. Working if a changed asset
pair requires a new request version, and a stale manifest is rejected. GPU
capacity is measured from actual linked uniforms and renderer limits, rather
than estimated from material property counts. These checks prove mechanism and
custody; final rendered contribution, appearance and eligible pacing still
have independent gates.


### Keep source attribution constant-time

The civic atlas uses512nearest-filtered lookup texels in its otherwise unused
right margin. Quantized world source coordinates select a source row, followed
by bounds and exact-position checks. This replaces a nested per-light manifest
scan without adding a sampler or shadow pass. Working if all actual sources
have unique cells, negative and reconstructed camera coordinates resolve the
same row, unused cells return the zero sentinel, and the retained radial-depth
faces remain byte-identical. A compiler or browser crash fails the runtime gate
even when CPU bake and source tests pass. Record the failed receipt and change
the hypothesis or implementation before another attempt.


### Compose accessor-based materials at their base

Troika's derived onBeforeCompile accessor calls its base and subsequently the
assigned user callback. Wrapping that getter via its setter recursively invokes
the same callback. Finish the retained baseMaterial before Troika derivation,
leaving the accessor untouched. Working if the actual createDerivedMaterial
regression calls its base once, retains the original getter and host transforms,
and repeated installer sweeps do not change the version or cache key. This
contract is tested against the dependency itself, rather than a copied mock.


### Retained callbacks can reach the same shader twice

Generated-geometry material clones intentionally retain their source callback.
A finishing wrapper on both identities can therefore reach one shader twice.
Make civic injection idempotent only when the actual owned uniform objects and
complete retained helper are already present. Keep incompatible Standard-light
assemblies as errors. Working if the real copied-hook regression produces one
helper and one effect, while the live page has no shader errors. A report-only
capture that exits zero with page errors is failed evidence; never attribute
frozen-frame pixels from it. Validate diagnostic arrays before isolation.

Actual source-by-source on/off/on measurements distinguish reflected surface
light from emissive glass. Keep source count and glass fixed, restore uniforms
in finally, and reject same-arm motion. Apply the same method to the sky's
bounded afterglow uniform. Working if every claimed source has a nonzero
receiver contribution in an appropriate view, the sky term has measured pixels,
and the lower tier retains its existing graphics semantics and frame budget.


### Attribute to the intended receiver at a fixed clock

A nonzero light delta anywhere in the frame does not prove it lights its named
object. Project actual caster bounds into the evidence camera, check source to
receiver distance, and inspect the named surface. The large civic grove trees
are outside the small village-tree ring, so targeting that ring yielded ground
light without the intended mature-trunk uplight. Working if the source is seated
beside the actual named receiver and its on/off control visibly changes that
receiver. Source-origin shader bounds are derived from the same manifest.

`--art --motion` deliberately advances the game at180x. It is appropriate for
moving-world review, and wrong for a still sky comparison spanning sunset.
Use the existing `motion=off` route for fixed-time light/sky attribution, keeping
render-clock movement and the on/off/on rejection mask. Do not change motion
or loading/performance acceptance to accommodate an isolation tool. Working
if capture custody records the clock mode, dusk time remains fixed across arms,
and the separate original gameplay/performance gates retain their inputs.

### Current civic-square evidence

The 4 October lamp expansion maps all 27 located sources in the pinned rich
concept: four posts, fourteen garden fittings, two hall lanterns, one shed
lantern, sign lighting and five window-spill sources. The actual mature grove
receivers required three fixtures to be reseated outside the smaller village
tree ring. The models and access paths were retained.

Canonical receipts are under `output/dusk-fidelity-20261004/`. The current
`lighting-final-fixed-gpu` capture fixes the game clock at 18.75, cloudy weather
and Medium quality. Actual per-source on/off/on checks report a nonzero receiver
contribution for every source. Fixed occlusion changes 1,884,209 pixels and bounded
sky afterglow changes 392,915 pixels, after same-arm motion rejection. Linked GPU
programs use at most 12 of 16 fragment samplers; page, console and request diagnostic
arrays are empty. Reverse and grove views use a 1.7 m camera. Noon, deep-night,
secondary-village and Low controls retain separate frames.

The retained bake comes from 343,035 actual vertices and 149,969 rigid triangles,
with 27 mounted origins checked. The PNG/JSON pair has content version
`ed597ad09d4006aefc7405fd4a450d1789145f20cb28c9c13bb0ef32f0435930`.
All 148 protected GLBs remain byte-identical to the baseline. Nineteen owned
source/assets and 387 normal-build delivery files have checked custody.

The current isolated candidate passes 2,628 tests in 239 files, typecheck, lint,
formatting, shader/depth/asset checks, normal production build and delivery
gates. Both original non-art Low/Medium five-scene budgets pass on eligible
load. These are local candidate proofs. Concurrent workplace changes are
excluded, the parent integration/release goal remains open, and no publication
or pixel-identical artwork verdict follows from these receipts. The task state
and final acceptance receipt distinguish lamp-active after-dark checks from the
standard noon route. Working if every current claim names the exact capture,
clock, source/build custody and gate, and historical failures stay discoverable.


The additional lamp-active square/village dusk and night runs pass all eight
original-budget cases on Low/Medium. Observed load is 0.60 to 1.20/core; raw
diagnostics are empty. The final canonical receipt is
`output/dusk-fidelity-20261004/lighting-final-acceptance.json`. Owned browser
closures, preview closures and capture-mutex release are terminal. There is no
active lamp job, rental or unattended watcher.
