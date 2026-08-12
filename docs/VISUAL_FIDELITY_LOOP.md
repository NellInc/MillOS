# Visual Fidelity Loop

A repeatable adversarial art-review loop for MillOS: capture fixed scenes, have
an independent judge grade them against a fixed written rubric, fix what it
found, prove the fix helped and cost nothing, repeat until the rubric is met or
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

## The loop

### 0. Baseline

```bash
npm run capture:art -- --label=baseline-<date> --perf-gate --headed
```

Captures 12 scenes at `medium`, noon, clear, into
`test-results/art-review/baseline-<date>/`, plus a contact sheet, a manifest,
and a non-art performance run.

- `--headed` uses the real GPU. Headless falls back to SwiftShader, which is both
  far slower and **renders differently** — software frames are not valid art
  evidence.
- **Capture from a clean tree if the result is meant to be a baseline.** The
  manifest flags a dirty tree as a caveat, because those frames show uncommitted
  work and cannot be compared against a later commit.
- Scene sets: `art` (12, default), `full` (all 19), `quick` (4), `exterior`,
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
| Lighting, exposure, shadow grounding                   | `Environment.tsx`, `PostProcessing.tsx`, `graphicsStore.ts` presets. One shadow-casting directional light — do not add a second.                                                   |

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

**Budget** — did it cost anything?

```bash
npm run benchmark:runtime -- --scenes=<the scenes you touched> --quality=medium --headed
```

`--headed` here is not optional either. The budgets in `run-performance-benchmark.mjs`
(55 fps average, p95 ≤ 25 ms, effective DPR ≥ 1) are real-GPU numbers; headless
falls back to SwiftShader and cannot reach them, so a headless run reports a
failure that means nothing. Keep every budget comparison in the same browser mode.

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

The loop ends in one of two states, and **both are successes**:

- **PASS.** Every gradeable axis ≥ 7, no blocking defects, budget held.
- **Budget exhausted.** Default **5 iterations**. On exhaustion the judge's
  remaining findings are written up as accepted debt — scored, ranked, and
  explicitly out of scope — and the loop stops.

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
