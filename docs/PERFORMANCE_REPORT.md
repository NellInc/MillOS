# MillOS v0.40 Performance Report

**Candidate:** v0.40.0 coherence and fidelity pass

**Measured:** 2026-08-11

**Status:** Green. Source, delivery, motion, world, uncrewed, and strict five
view frame pacing gates pass on the current v0.40 candidate.

## Startup metric used today

`npm run benchmark:runtime -- --startup-only --scenes=overview` measures
navigation to removal of the loading dialog (`startup.coverClearMs`). This
includes the existing exit transition. The benchmark still requires strict
world readiness before that removal. Use `--max-cover-clear-ms=<n>` to enforce
a measured baseline for the same browser, quality and network profile. No
default latency target has been calibrated for cover removal.

`startup.readyMs` and `startup.firstFrameLoopMs` are diagnostic milestones.
The loop can tick before any WebGL draw. The figures below are the historical
August assessment; its 350 ms and 3,200 ms targets timed the first loop tick
and do not apply to cover removal.

## Historical acceptance budgets

| Gate | Budget |
|---|---:|
| Native first useful frame | 350 ms or less |
| Representative Fast 3G first useful frame | 3,200 ms or less |
| Average frame rate | 60 FPS or more |
| One percent low | 45 FPS or more |
| p95 frame time | 16.7 ms or less |
| p99 frame time | 25 ms or less |
| Frames over 50 ms | 0 |
| Effective DPR error | 0.03 or less |

The benchmark now reports the one percent low, p95, p99, standard deviation,
16.7 ms and 25 ms spike counts, long tasks, effective DPR, renderer calls,
world continuity, uncrewed state, checkpoint state, and vehicle motion. Motion
acceptance rejects position plateaus, unbounded steps, missing wheel travel,
missing steering or articulation, and checkpoint interlock failures.

## Accepted local health evidence

| View | Average FPS | One percent low | p95 | p99 | Draw calls | Effective DPR | Result |
|---|---:|---:|---:|---:|---:|---:|---|
| Overview | 88.84 | 56.93 | 13.2 ms | 14.0 ms | 1,312 | 1.20 | Pass |
| Interior | 117.94 | 76.34 | 9.6 ms | 10.6 ms | 851 | 1.20 | Pass |
| Shipping | 99.47 | 65.30 | 12.1 ms | 12.9 ms | 1,121 | 1.20 | Pass |
| Receiving | 100.53 | 65.24 | 11.7 ms | 12.3 ms | 1,082 | 1.20 | Pass |
| Water | 85.67 | 59.35 | 13.0 ms | 14.2 ms | 1,346 | 1.20 | Pass |

Each view used six measured seconds after a two second warmup, with
deterministic truck and forklift motion enabled. All five recorded zero frames
over 50 ms, valid fleet motion, valid checkpoint behavior, continuous world
composition, and no human content. Native first useful frame ranged from 234.1
to 299.9 ms, within the 350 ms budget.

This is a health measurement for the current coherence pass. It is not an
improvement claim because no hash matched baseline from before this pass was
captured with the corrected benchmark semantics.

## Retained host saturation evidence

The strict five view run remained useful diagnostically. Every view passed
world continuity, uncrewed content, checkpoint, motion, effective DPR, long
task, p99, and 50 ms spike gates. Frame pacing missed acceptance while the host
load averages exceeded 60 and multiple unrelated render and test jobs were
active.

| View | Average FPS | One percent low | p95 | p99 | Draw calls | Functional gates |
|---|---:|---:|---:|---:|---:|---|
| Overview | 61.81 | 33.42 | 20.1 ms | 22.7 ms | 1,328 | Pass |
| Interior | 76.89 | 40.62 | 16.1 ms | 18.0 ms | 846 | Pass |
| Shipping | 62.03 | 36.10 | 19.5 ms | 22.6 ms | 1,126 | Pass |
| Receiving | 61.50 | 38.52 | 19.0 ms | 20.2 ms | 1,083 | Pass |
| Water | 55.78 | 32.79 | 20.7 ms | 22.7 ms | 1,350 | Pass |

These values are a stressed lower bound. They remain in
`test-results/runtime-final-v040/benchmark.json` so a failed performance run is
not erased after diagnosis.

## Startup

| Network profile | Overview first useful frame | Five view range | Result |
|---|---:|---:|---|
| Native | 295.5 ms | 234.1 to 299.9 ms | Pass |
| Representative Fast 3G | 3,065.0 ms | 3,058.2 to 3,069.3 ms | Pass |

These accepted measurements use the versioned Vite preview path. A bare Python
static server is not a representative serving baseline because it does not
reproduce Vite or deployment compression and routing.

The native row is from the current candidate. The Fast 3G row retains the last
accepted v0.40 delivery baseline and is labelled separately from the current
hash exact native receipt.

## Delivery

* Initial JavaScript is 0.42 MiB gzip across five files.
* The production build transforms 3,592 modules.
* The current build is 95.79 MiB without duplicating the immutable historical
  release archives into the v0.40 output.
* Physics, WebGPU, SCADA, charts, and post processing remain deferred chunks.
* The service worker isolates caches by deployment scope and build identity.
* v0.10, v0.20, and v0.30 remain genuine immutable archives. v0.40 is the
  default selection.

## Optimization priorities at the time

1. Keep the five view gate repeatable in quiet host windows, while retaining
   contended misses as diagnostic evidence rather than weakening budgets.
2. Preserve the 60 FPS, 45 FPS one percent low, 16.7 ms p95, and 25 ms p99
   budgets while integrating visible geometry.
3. Keep native first useful frame at or below 350 ms and representative Fast
   3G at or below 3.2 seconds.
4. Reject shader cache keys containing time, randomness, or other per frame
   values.
5. Retain failed benchmark receipts and identify host contention separately
   from candidate defects.

## Required commands

```bash
VERSION=v0.40 npm run build
npm run validate:bundle
npm run validate:depth
npm run validate:shaders
npm run validate:uncrewed
npm run validate:releases
node scripts/run-performance-benchmark.mjs --motion
npm run capture:art
```

A build proves compilation and packaging. Runtime, visual, deployment, and
final aesthetic acceptance remain separate gates.
