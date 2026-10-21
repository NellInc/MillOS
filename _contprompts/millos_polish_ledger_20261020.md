# MillOS polish ledger, 19–20 October 2026 (Claude Opus 5.5)

Executes `_contprompts/millos_polish_20261020.md` (gameplay, animation, lighting, everything
left open), plus Nell's mid-session addition: "Fix all z-issues also please, especially around
the loading docks etc." Branch `claude/resolute-fix-20261018`, worktree
`/private/tmp/millos-resolute-20261018`. **Not pushed; local only — not live.**

This file is updated as evidence lands; sections marked _pending_ are filled by the final
runtime confirmation.

## State on arrival (verified)

- Branch at `d80c1272`, 83 commits ahead of `origin/main` (the contprompt said 78).
- Disk 3.9 GB free; load 10.5 on 10 cores. The system disk then filled to 0 twice from outside
  this work (6.2 GB -> 0 in ~25 min; later 6.9 GB -> 0), halting every write until Nell freed
  space. All agents paused writes; no file was truncated (checked per worktree).
- The machine then rebooted twice (14:46, 16:23; no panic report). `/private/tmp` was cleared:
  every worktree, the session scratchpad (probe, play-test and confirmation scripts) and the
  baseline art sheets were lost. Every commit survived in the shared object store
  (`claude/resolute-fix-20261018` at `95de49b4`). The tooling was rewritten, and the baseline was
  recaptured from `d0a188f0` in the same session as the final captures (a cleaner A/B than the
  original, taken a day earlier). Baseline numbers above are from the first capture.

## Baseline (named, `d0a188f0`, before any product change)

- `d0a188f0` itself is a tooling fix: `run-performance-benchmark.mjs` now passes
  `--enable-automation`. Playwright 1.62 stopped passing it, so CDP
  `Browser.getBrowserCommandLine` refused and every art capture exited before its first frame.
- Gate: typecheck, agent:typecheck, lint, format, manifest (after regenerating), build
  (`VERSION=v0.40`), validate:bundle/reachability/community/depth/shaders all 0. vitest
  **3,763 pass, 28 skipped, 5 fail**, all environmental `assets/source` ENOENT under the sparse
  checkout: `scripts/crafted-assets.test.mjs` x3, `HeritageSignage.test.ts` x2.
- Art sheets (`test-results/art-review/base-*`, Metal, sandboxed, `--skip-build` on the
  gate's dist): med-12, low-12, med-06, med-19, med-22, med-rain. visual-fidelity-judge: **all
  six FAIL**. Blockers: tank-farm pad untextured (med-12); Low interior floor ~2x Medium luma
  (172/185/183 vs 86/81/124); plansifter #3 self-lit at 19 and 22; rain reads as clear noon
  (blue sky, sun disc at 69%, hard shadows, no precipitation, dry ground); village fog wall in
  rain. Backlog: flat apron/yard (luma std 7.3), scalloped paving, plastic tanks, steam discs,
  "SH PPING" sign behind a column, flat apartment block, forklift camera framing nothing, dusk
  sky, blue night IBL indoors, moonlit packing streaks, murky silos/yard at night, dim fascia,
  dawn pond, missing dawn shadows, black roof deck at night.
- Z-fight probe (new, `scratchpad/zfight/zfight-probe.mjs`; geometry pass over every
  visible-in-tree mesh plus a 0.5 mm camera-nudge pixel test with motion strike-out):
  depth-flip pixels shipping **734** (0.080%), receiving 439, logistics-close **732**, markings
  4,514 (camera since moved, not comparable), yard 407, forklift 431, silos 466. A/B: all
  polygon-offset factors to 0 changes shipping 0.69%, logistics-close 0.42% (offsets work);
  terrain drawn first changes 0.002–0.043% (terrain-erases-paint hypothesis near-inert).
- Loading overlay axe (deterministic: `page.route` holds `models/worker/worker-masculine.glb`,
  service workers blocked): state A (held) and state B (held, recovery controls visible) both
  **0 violations**. Loading progress went **backwards** (94 -> 92 -> 53 -> 94 -> 84 -> 95).
- Startup trace (load ~2/core): progress 95% at 8.7 s, world-ready 46.4 s, startup-ready
  52.6 s; 26 request waves (each asset 5–180 ms) separated by 0.8–2.8 s of React render: one
  Suspense boundary over the whole world re-renders on every uncached loader hook.
- Stranger play-test (`scratchpad/playtest/day.mjs`, 1366x768, standard pace through order 1
  then 4x to the next morning, EN and pt-BR via the in-app switcher): orders 1–3 on time in both,
  3 shift reviews each, no `translated-ltr`, 2 navigations (both deliberate), cold ready 53.3 s
  / 49.4 s. **Autosave failed "Physical save is too large" from ~11 real minutes**, every 5 s;
  a later reload logged **"restore failed: Invalid physical field"**. Hard-to-reach states
  reached in pixels in both languages: ungraded review naming an open incident, pace buttons
  under a handoff hold (Overview and 390-wide mobile), close-experiment button, left-season
  message. Not reached: repair countdown (blocked by the restore failure). Unreachable: the
  follow-on replacement notice (no runtime path can make a follow-on's evidence stale).
  Copy seen: "C needs X resolved" and an ungrouped "8195.15" in English reviews.

## Audit (49 findings; 8 finders x 2 refuters, read-only)

41 accepted by both refuters, 3 split, 5 rejected. JSON: `scratchpad/audit-r1.json`.
Split/rejected decisions: yard loops ignoring reduced motion **accepted** (a 16 m decorative
shuttle); "Reset to 10 AM writes a review" **declined** (the confirm copy says the window
resets); near-plane clipping **declined** (second refuter showed the reproductions do not clip);
cloned programmes **taken up in bounded form** (the contprompt asks for afternoon/night shifts
worth playing); guide pinned to order 1 **declined** except its confirmed nit (a replayed guide
for a later order said "Your first delivery"); framer ignoring reduced motion and dock panels
moving the camera **rejected** (MotionConfig already wraps the UI; the camera pairing is pinned
by a test).

## Waves (each in a sparse worktree off `d0a188f0`, failing-test-first, merged with --no-ff)

| Wave | Delivered | Notes |
|---|---|---|
| SCADA | operator setpoint control in the full SCADA Tags tab; roll-speed PV follows its SP; out-of-range and non-simulation writes refused; operator write logged as a decision; agent preview refuses out-of-range too | throughput is order-driven (`deriveLineSetpoint`), so the helper text says only what the setpoint changes |
| Accessibility | 7/7 + 2: live regions outside inert, critical alerts announced when muted, focus after tour/Take over, keyboard Inspect, Overview/mobile contrast >= 4.57:1, 44 px mobile pace targets, label-in-name; metrics row breaking mid-word at 390 px; focus after the phone sheet closes | |
| Gameplay | varied programmes (rotating rush order +30% pay, bulk order, night 8,000 kg), feasibility pinned at pace 30; guide survives order trimming; replayed guide titled with its customer; Shift pace visible after order 1; trucks wait at the dock when no order is open; R.M. 101 seeded at wear 46 (warning ~16:29, breakdown ~06:22 day 2 if ignored) | the rush choice has no timing risk at pace 30 (truck cadence hides the changeover); the card states facts, not a risk |
| Art | tank-farm containment pad + bund walls; tank gloss to painted finish; `paving` world-surface macro on tarmac/concrete; thin asphalt cracks + UV warp; SHIPPING sign clear of the column; apartment facade weathering; forklift scene camera fixed (baseline break) | tyre tracks/oil stains need TruckBay decals (not done) |
| pt-BR | 8/8 + 2: SCADA enums, incident and breakdown text re-render, sentence case not CSS capitalize, times in app locale, fairness task names, AI prompt asks for pt-BR, "reprodução"; block reason and role names re-render on language switch | agent command-preview prose stays English (agent protocol, also read by agents) |
| Lighting | sifter #3: interior fill is now two line lights (rows of fittings), not centre points; Low sun at 10% under the roof (no shadow map); stars wait for real dark; night IBL greyed indoors; low moon dimmed; silo floodlights (no lights, no shadow casters); fascia glows; dawn pond takes the sky; sun floor 7 deg; rain: grey sky, sun disc 6%, softer shadows, haze grows with distance, wet terrain, camera-local precipitation (no drops in the hall, frozen under reduced motion) | sun sets at 18:00 in the sim, so 19:00 is night: see Decisions for Nell |
| Startup | preload of 126 models/27 textures/1 JSON at App module scope through the loaders' own caches; monotonic progress; "Use low graphics" after 5 s of confirmed slow frames, with reason text; `e2e/loading-overlay.spec.ts` (held-asset axe) | 5.8 s module evaluation of `sharedMaterials.ts` procedural textures not addressed |
| Flow | belts/sacks/rollers/grain/hum on plant time, stopped under any hold, interlocked with packers; belt direction; Low belts move; sacks scale in/out; AI engine silent while held; egress drill on game time; forklift metrics book no pause gap; hydraulic sound in plant time; steam soft Gaussian sprite | the wave put its sampler hook in `src/hooks/`; the lead rebuilt that commit with the file under `src/components/` (branch `claude/polish-wave-flow2`) so nothing lands in `src/hooks`; `claude/polish-wave-flow` was never merged |
| People | 1.25 m/s walking at pace 30, gait scaled to ground speed (time-lapse at 4x, never a run); disjoint lanes (closest pair 0.70 m); courier faces travel; two bus commuters appear/vanish only at the doors; residents use doors at opening/closing; heading held on a clock hold; reduced motion = held still | shop door anchor mirrored from the bakery, unverified against the model |
| Z-fighting | yard 0 / apron and road -1 (restoring the dropped stack without tying the +3 turnaround); dock paint laid out from the dock line, nothing under the slab; groove walls removed; 0.25 m lines; threshold band inside the building; silo rings 0.2 m; canopies/booth front faces only (both faces proven per GLB); roof kerbs, conveyor rails, motor plates, exterior pairs; depth gate over all of `src/components` + an exterior-ground bias rule; CLAUDE.md table corrected | castle and village GLB double faces: asset rebuild, recorded only |
| Vehicles | trucks on 14 m arcs at <= 2 m/s^2 lateral, trailer stops on the bumper, jockey and scales off the lanes; forklift yaw <= 1.2 rad/s with in-place pivots, old saved routes migrated; continuous pallet visibility; decorative yard loops frozen under reduced motion; tour Silos -> Milling -> Packing clear of the silo | a visit takes ~124 s (was 86); shipping drop-off still 22 m from the trailer |
| Save | process genealogy no longer saved; shipped batch/manifest windows 32; jammed-belt retries merged; old large saves trimmed on load; "Autosave stopped" notice once; restore accepts null only on the 8 nullable fields (`operations.activeOrderId` was the failure); held lots never evicted | `creditedBatchKg` left capped at 1,000 (pruning could double-credit after reload) |
| Lead | shift review: "Grade C needs …" / "Nota C exige …"; money grouped in English (was "8195.15"); CLAUDE.md drill section and offset table | |

### Fix waves, 20 October (Nell: "Fix everything please")

Each off the integrated branch, failing-test-first, merged with --no-ff; renders serialised on
one session lock. Every visual claim below was checked in frames by the wave and spot-checked by
the lead.

| Wave | Delivered | Notes |
|---|---|---|
| Hygiene | the six load "flakes" were vitest's 10 s timeout; root cause an O(segments) string-keyed cache in `materialFlowStore.finishedYield` (engine code, also costs real play): nested maps + per-tick index, replay evidence byte-identical, ~2x faster; measured per-file timeouts; `index.html` prettier (whitespace only); `creditedBatchKg` cap is reachable (~1 h at 4x) but safe, pinned by a reload-past-cap test | `format:check` covers `src/**` only; 484 older prettier failures outside `src` left |
| Startup | the 34 shared procedural textures bake in up to 4 workers before the scene chunk evaluates (byte-identical, golden hashes); longest main-thread task 6.4 s -> 1.3 s; progress 95% ~3x sooner | the lead's 32 s world-ready -> startup-ready gap did not reproduce at normal load (6 s: batching 2.8, compile 1.5, settle 1.6) |
| Startup 2 | atlas-UV restore (4.2 s -> 64 ms), terrain relief cache (3.6 s -> 97 ms), worker face softening (1.2 s -> 48 ms), scene/exterior/terrain/sack textures in the bake, word-wise static-batch key (~1.1 s -> ~35 ms); world-ready ~27 s -> ~9 s, startup-ready ~34 s -> ~16 s in interleaved pairs; "Open loaded scene" now latches like the slow-device text (a hitch no longer removes it) | `compileAsync` not adopted (three r182's is the same polling `StartupReadiness` already does); shader-poll slicing patch kept in scratch, not adopted (no measurable gain) |
| Vehicles | shipping forklift sets pallets at the trailer (22.5 m -> 2.2 m from the bumper face); found and fixed forklifts unloading facing away from the trailer (`holdHeading` while interlocked); rush window 150 -> 125 min so deferring it behind another product costs a truck (late, double penalty), card copy states it EN/pt-BR | pallet goes on the channel floor at the door: the leveler is 2 m up, forks lift 0.72 m (pre-existing modelling); a changeover cost to make deferral ever worthwhile was not added (new mechanic, not a fix) |
| Assets | shop AND bakery door anchors were 2.6 m off the real doors (found from the GLB threshold); store board in line with its door; wishing-well tile courses lifted 6.5 mm at the Blender source (rebuild reproduced byte-for-byte first); well/stall/postbox single-sided; postbox slot returns moved to cover the shell's cut ends (fleck from single-siding) | castle/village "double faces" did not reproduce; castle must stay double-sided (132.6 m² of back-seen window faces); guard tests added |
| Yard | tyre tracks and oil placed from a simulated truck visit; dock lines thinner than a pixel rebuilt as mipmapped masks; night yard/dock apron/silo lane lamp pools and dock floods (no new lights); roof-deck underside liner (night deck no longer black; noon ceiling lighter); dusk hemisphere fill pulled from mauve to warm grey (twilight band only); moon patches softened; KEEP CLEAR moved off the docked tractor's footprint; **troika reset the depth bias of every ground-painted label each frame** (the missing "KEEP"): bias now passed as `depthOffset` | |
| Z-fight 2 | trailer rear lamps were coplanar with the doors (5,894 -> 32 flicker px up close); brake lamps lit only while braking (paused clock was treated as a safety hold) and red not pink (tone mapping at 4.5); clock hands; then a colour-aware triangle sweep of all 31 benchmark scenes fixed every real different-colour coplanar pair (shell columns/chamfers, pond statue, footbridge posts, conveyor rails, dock lights and leveler, nameboard bars, safety-mirror and NO IDLING text, and the station's coffee and slush machines physically clipping into the cabinet and counter) | same-colour same-material faces, foliage cards and the unrendered `OptimizedTruckBay` left by design |

Three wave agents ran the full suite or a build against their brief (gameplay, pt-BR, flow
partly); their builds failed only on the `public/` symlink in sparse worktrees.

## Decisions taken (with reasons)

- **SCADA setpoint control belongs** (evidence: `useSCADA.writeSetpoint` "a write through the
  UI is the operator's decision"; `setpointDecisionLog.ts` expects operator entries;
  `AGENT_OPERATING_ARCHITECTURE.md` §17.1 "UI invocation"). Built in simulation mode only.
- **Loading-overlay axe is deterministic** by holding one asset; now an e2e spec.
- **Reduced-motion policy (as implemented):** people and decorative loops (yard jockey, crane,
  wash, wrapper, pulse lamps, rain streaks) hold still; state carriers (trucks, forklifts, belts,
  the bus, machines) keep moving because they show plant state; UI follows framer's
  `reducedMotion="user"`. Only the OS setting exists today (see Decisions for Nell).
- **Follow-on replacement notice stays test-only:** no player action can make a follow-on's
  evidence stale; a hook to fake it would be a test fixture in the product.
- **Agent-protocol prose stays English** in the Autonomy panel (also read by agents from the
  ledger), consistent with the previous session's glossary.

## Decisions for Nell

1. Native Brazilian reader (carried).
2. In-app reduced-motion setting: built and merged (`87d5c4ef`), off behind
   `FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED`. Turning it on needs a consent-gated change
   to `src/hooks/useReducedMotion.ts`; one patch carries all of it (hook: one import, one store
   subscription, return `prefersReducedMotion || inAppReducedMotion`; a 5-case hook test; the
   flag flip): `scratchpad/mp/in-app-reduced-motion.patch` (session scratchpad), `git apply
   --check` clean on `95de49b4`. Against copies outside `src/hooks`: patched 5/5, original 3/5
   (the two in-app cases fail).
   **Resolved:** Nell approved through the consent gate; applied as `2df1d4a9` (20 reduced-motion
   test files, 167 tests pass; typecheck clean).
3. 19:00 is astronomical night in the sim (sunset 18:00); the contprompt checks 19:00 as dusk.
   **Resolved (Nell took the recommendation): keep the sun model and check dusk at 18:30.** An
   18:00 sunset is an equinox day at any latitude, and the sun drives lamp levels, shift lighting and every earlier time-of-day capture; moving it would
   re-tune all of them for a checklist wording.

## Final runtime confirmation (partial; stopped at the usage limit, 21 Oct)

- Whole gate on `82fc1c00` at load 300–440/10 cores: typecheck, agent:typecheck, lint, format,
  build, bundle, reachability, depth, shaders, assets pass; vitest 4,159 pass / 6 fail: 4 load
  timeouts (fixed in hygiene2) and 2 real (validate:community rejected `sharedTextureBake.worker-*.js`
  — renamed to `sharedTextureBakeWorker.ts` with a guard test; farmhouse test compared the macOS
  /var alias with a real path). Both fixed in `6a18f835`. No whole gate has run since the later merges.
- Bundle budget raised to 200 MiB at Nell's request (`68669c35`).
- Final art captures on `6051c2d1`: `final-med-12` and `final-med-06` captured; `final-low-12`
  timed out (load ~520); others not run. A same-load control showed baseline and final builds both
  timing out at load ~740, so those failures are environmental.
- Blind A/B med-12 (key held outside the judge's folder; `scratchpad/ab-keys/med-12.json`): final
  wins forklift, logistics-close, silos, tank-farm, yard; baseline wins interior, milling, packing;
  5 ties. **Regressions in the final tree:** packer cabinets carry a tile/brick grid; plansifter
  bodies read as a grid of glinting patches; tank shells read as cotton (lumpy, no highlight).
- Rubric judge med-12: FAIL (verdict at `test-results/art-review/final-med-12/verdict.md`).
  Blockers: overview mountain backdrop turns into a flat slab below a hard line at y≈305; a
  pixelated white smear on the roller-mill side panels (milling/interior/forklift). Long backlog,
  mostly pre-existing: tan apron, flat water, machine scale vs workers, dressing, floating labels.

## What remains

- **Art regressions** (branch `claude/polish-fix-artregress`, worktree
  `/private/tmp/millos-fix-artregress-20261021`, agent stopped at start): bisect and fix the three
  regressions above plus the roller-mill smear, the forklift-scene door-column tile grid and the
  repeating roof dot grid.
- **Coop wave** (branch `claude/polish-fix-coop`, agent stopped mid civic rebake): the fascia
  fix and two timeouts are merged (`6051c2d1`); the civic lamp shadow rebake and the coop/farmhouse
  eave pixel checks are not done; check the branch for uncommitted work before resuming.
- **Judge backlog**, planned as four waves (empty worktrees created on `6051c2d1`:
  `/private/tmp/millos-fix-{env,ground,dressing,scale}-20261021`): env (mountain seam, water
  Fresnel/ripple, village backdrop hill, repeated city backdrop, sun glints); ground (apron to
  neutral concrete with joints and lanes, kerb at the grass edge, silo pad, village square, farm
  furrows, yellow slab, forklift-near floor, plinth contact, ceiling deck); dressing (dock lane
  stripes as worn paint, labels on boards, mid-air tie-rods, placeholder box, farm primitive, stray
  hedge, logistics-close and packing-line dressing, truck cab, apartment block, tank heads,
  forklift camera framing); scale (roller mills ~3x and packers ~5x a worker's height: investigate
  which is the outlier before changing anything).
- Then: whole gate, all seven final art conditions (+ blind A/B, regions.py, rubric judge), and
  the runtime batch (`scratchpad/tools/run-final.sh`: z-fight, axe, trace, EN/pt-BR play-tests,
  extras incl. in-app reduced motion, e2e). Tools are in the session scratchpad.
- Machine: load stayed 300–900/10 cores from other software, free disk fell 466 → ~78 GB; and the
  surface tripwire repeatedly saw hook/rule files (`hooks/bash-protection.cjs`, `policy-gate.*`,
  `.claude/rules/*`, `creed_guardian/guardian.py`) changed by another process — not by this work.

## What remains

_pending_
