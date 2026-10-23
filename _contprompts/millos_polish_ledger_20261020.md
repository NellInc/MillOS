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

## Second fix round (21 Oct) and final confirmation on `2282aeb1`

Waves, all merged: art regressions (light rows computed on unbumped normals — the tile/glint grid;
structural steel grid; a `vessel` finish pinned from the batcher — the cotton tanks; steam puffs off
the casing — the mill smear, pre-existing; sub-pixel roof seams); coop (civic lamp shadow rebake
with caster pins); env (mountain snow line and lower slopes, water Fresnel and ripple, village
fields, varied skyline, glass glint); ground (concrete apron slabs, joints and tyre lanes, kerb,
silo pad, village flags, furrows, barrier, grit, plinth contact, roof liner); dressing (dock paint
as opaque worn outlines, sign board, braces, trailer drop yard, hedges, pallet island, palletising
cell, truck chassis/grille, apartment balconies, 2:1 tank heads, forklift camera); scale (mills,
sifters and packers were drawn 2–3x real size; scaled about their anchors, workers unchanged, old
saves normalised, milling camera re-aimed). Lead: build plugins honour `--outDir` (`5587e965`);
kerb test resolves spread path constants (`8af133f1`, the only gate failure after the merges).

- **Whole gate on `2282aeb1`**: typecheck, agent:typecheck, lint (now src, scripts, e2e), format,
  build, bundle, reachability, community, depth, shaders, assets pass; vitest 4,456 pass / 1 fail
  (the kerb test, fixed in `8af133f1`).
- **All seven art conditions captured** (`test-results/art-review/final-*`).
- **Blind A/B vs `d0a188f0`** (keys in `scratchpad/ab-keys/`): med-12 — final wins all 12
  comparable scenes (forklift not comparable: the old camera framed no forklift); low-12 — final 9,
  baseline 1 (milling, slight: the real-size hall reads sparse), 3 ties.
- **Rubric judge med-12**: FAIL with no blockers (axes 6/6/7/6/6/7; was 5/5/7/4/5/6 with two
  blockers). Both earlier blockers fixed or demoted; 20-item backlog (silos read as matte paint,
  truck still a box stack, cyan fill, roof underside still flat, sparse hall, field seams/ellipses,
  doorway fringe, flat planks, glazing, nameplates, beacon cone, pipe over a sign, edge aliasing).
- **Runtime batch**: startup trace world-ready 5.7 s (baseline 46.4 s), startup-ready 10.4 s (52.6),
  3 request waves (26), progress monotonic; EN and pt-BR play-tests — all three orders on time,
  no autosave failure (the "Physical save is too large" defect is gone), reload restored orders,
  money grouped per locale; SCADA EN/pt, 1280x657 footer, focus, OS and in-app reduced motion
  (people held), truck arrival, repair countdown EN/pt all pass; z-fight and e2e pass.
  **Found:** loading-cover recovery state has 1 axe violation (contrast 3.57 and 2.44:1); a runtime
  `TypeError ... reading 'toFixed'` in the operational UI at ~460 s in both play-tests; the phone
  check could not find the tour at 390 px (tool or app); the axe tool hung after finishing.

## Third fix round (on `8af133f1`, worktrees now under `~/Documents/GitHub/MillOS-polish-work/wt/`)

A reboot wiped `/private/tmp` mid-round; worktrees and tools moved to persistent paths. Agents were
also cut repeatedly by network drops (ECONNRESET, a self-signed-certificate interception, one DNS
failure) and resumed from their last commit each time.

| Merge | Wave | What landed |
|---|---|---|
| `38ffa9c6`, `0e2a464b` | runtime | shift-review gap looked up its bars by the translated label, so `formatFixed(undefined)` threw at ~460 s; loading quote mounted mid-fade (the axe contrast hit was the fade, not the palette); tour card collapsed to 70 px on a landscape phone; co-op take-over notice covered the open Overview sheet at 390 px. Tool fixes: axe hang (an uncleared 899 s timer), phone check follows the rotate screen, `day.mjs` import |
| `11ede0a4`, `a8fe3686` | art3land | village field-tree discs (the dark ellipses) replaced by copses, wooded parcels pulled behind a hedged margin (the ruled band); far lower slopes get rock, scree ribs and gullies, and the far ring's haze thins to 0.55 below the snow line (band contrast 1.20 to 2.02 at 12:00, 0.66 to 1.40 at 06:00; snow, upper rock and silhouette pixel-identical); hall sill and dock post slots closed (the dashed white lines); Low water uses fifth-power Fresnel |
| `f8de2a3e` | art3geo | 48-sided tank heads; forklift beacon cone off the load; 03 SIFTING hung clear of the spout; R.M. plates legible; plansifters hung from gantries; truck edges, lamps, flaps, cab bevel; both apartment street faces framed |
| `e1e53ced` | art3mat | daytime sky fill 55% toward neutral (the cyan shade); galvanised silos (neutral silver, patina, sparse run-off, sun aureole, grass-free reflection, rings matched; a cloned material had been dropping its `defines`); glazing Fresnel; roof liner albedo 0.29 to 0.45; door columns off coal black; aisle barrier detail to 90 m; dock sign trim inset (the doorway fringe was a z-fight) |

| `8da16e0d` | hall | working-floor dressing (sack bays, pallet piles, parts racks, carts, hose reels and hoses, spill kit, roll cradle, pallet jack, 42 m cable tray, post conduits) placed off every forklift route, painted aisle and worker circuit, proven against the real lane and route data; settled flour at every mill, sifter and packer as a lit decal drawn before the additive light pools (`RENDER_ORDER.floorDeposits`), dark at 22:00; planner `planningObstacles()` includes the dressing (no default route, optimiser search or replay fixture touches it). Cost about +19 to +32 draw calls and +32k to +44k triangles per frame |

After the overlapping merges: tsc, shaders (38 families), depth clean; 362/362 tests in the 40
overlapping files.

**Whole gate on `d8d49fdf`** (before the hall merge): typecheck, agent:typecheck, lint, format,
build, bundle, reachability, community, depth, shaders, assets pass; vitest 4,511 pass, 4 timed out
at load 12-44 per core and pass 182/182 re-run with long timeouts (cacheIdentity, systemRegistry,
perimeterKerbLayout, workerPose). The hall merge then passed tsc, eslint, prettier, depth, shaders
and its affected tests.

## Final confirmation on `8da16e0d` (labels `final3-*`)

- Build, reachability pass; seven art conditions captured; baseline retries all captured.
- **Runtime batch:** axe 0 violations (both loading-cover states); startup world-ready 4.1 s,
  startup-ready 8.3 s, 2 request waves, progress monotonic, no console/page errors; z-fight probe
  0.02-0.06% depth-flip pixels per scene; phone (844x390 and 390x844, EN and pt), footer, focus,
  reduced motion, arrival, repair, SCADA, in-app motion and e2e all pass.
- **Found, a real bug (pre-existing, surfaced by the R.M. 101 wear seed):** in both 46-hour
  unattended play-tests R.M. 101 goes critical at hour 5.8 and shipping stops for 24 game hours on
  all four lanes. Grain stranded in the broken mill's input buffer counts as committed to the order
  (`committedFor`/`finishedYield` in `materialFlowStore.ts` ignore `isProcessing`), and silos keep
  feeding the dead mill, so `feedBudgetKg` reaches 0 for every silo lane. Fix wave `fix-feed`.
- **Blind A/B vs `d0a188f0`** (keys in `scratch/ab-keys-final3/`): final wins 86 of 87 comparable
  scenes: med-12 10/10, low-12 13/13, med-06 13/13, med-19 12/13 (baseline won village: faceted
  tinted triangles on the dark hillside), med-22 13/13, med-rain 12/12 (the baseline did not render
  rain at all), med-1830 13/13.
- **Rubric judge med-12:** FAIL, no blockers, 7/6/7/6/6/7 (was 6/6/7/6/6/7). Fixed or improved:
  nameplates, silos as galvanised, truck, cyan fill, hall dressing. Unchanged: glazing, roof deck,
  beacon cone, edge aliasing, field ovals and hill seam.

## Round 4 (six waves on `a35d5b7e`, brief `scratch/r4-brief.md`)

silo (smeared corrugation, floodlight cut-off at the skirt, flat skirt ring); shell (glazing from
outside, roof deck and purlins, door thresholds, cyan band, dock door leaf, rain inside the hall);
floor (flour at dusk and night, flat barrier and partition, packing dead zone and panels, beacon
cone, pipe scale); yardtank (beam across signs, staging-bay clipping, dressing on painted lettering,
translucent wrap and blank panel, tank steel and saddles, dark stair core); land (village faceting
at 19:00, blotches and hill seam, fog edges in rain, hedge across the pond path, flat pond, Low
windmill sails); aa (Medium AA, Low aliasing at source). Plus `fix-feed`.

## Round 4 merged (`9115ad52`)

Feed fix `b0eb294c` (a broken mill no longer starves the plant: 18/18 orders on time with R.M. 101
down, against 2 late and shipping flat for 23 h). Round 4: aa `6742cf47` (SMAA never fired on the
linear buffer; edge detection on encoded values, HIGH preset, composer MSAA, canvas MSAA every tier;
about +1.9 ms Medium, +0.2 ms Low), shell `bfaf02ab`, land `fae38430` + `35abb75a`, yardtank
`ec476e24` (conflict resolved: the rain shelters derive from the shared `DOCK_CANOPY`), floor
`438dabd4` + bounce fix `0380a3eb` (the indoor bounce greyed the paint and Neutral's toe made it
void black), silo `5e30bd65`, toe `93f79984` (the grade's contrast clipped encoded <0.03 to black;
the operator is Khronos PBR Neutral, not AgX), measure `9115ad52` (`measure:surfaces` ignored the
`/v0.40/` base so every bundle 404'd; null control now 0.00-0.20%, not exactly 0, on foliage).

**Blind A/B round 4 vs round 3** (`final4-*` vs `final3-*`, keys `scratch/ab-keys-r4/`): round 4
wins 73, round 3 wins 14, 4 ties (med-12 12-1, low-12 8-5, med-06 9-4, med-19 13-0, med-22 12-0-1,
rain 10-2-1, 18:30 9-2-2). Every loss traces to: silos flat/plaster at distance and on Low, floods on
in daylight and rain, roof-deck moiré, flat haze band behind the village, village dusk too dark and
woods mottled, tank shell creases, TRUCK STAGING upside-down from the overview camera.
**Rubric final4-med-12:** 7/7/7/6/7/7 (was 7/6/7/6/6/7), no blockers; material response held at 6 by
the silos.

## Round 5 (four waves on `9115ad52`, brief `scratch/r5-brief.md`) plus the toe finish

silo5, land5, shell5, yard5 cover the list above plus the rubric backlog (tank gloss, glass sky
reflection, roof top, tank-farm pipework and yard grate, tractor cab and axles, dock shelters,
conveyor roller pitch, capture clock holding sky time). The night-toe finish (hue-preserving lift on
fill-only pixels, noon exactly unchanged) runs on `claude/polish-r4-toe`.

## Round 5 merged (`84b6ae7b`, then `3442b541`)

Toe finish `cb3f8cd9` (hue-preserving night lift on fill-only pixels, both tiers; noon pixel-identical
on medium; ≤3 crush at 22:00 down to 0.00-0.16%). r5-orders `5eb9da0d`: the "orphaned order" was a
harness artefact (Level 1 query truncation cut `orders` to five entries); the store never orphans
an order; 4 tests pin it and `scratch/tools/day.mjs` now pages the orders collection and audits
past-due orders. silo5, land5, shell5, yard5 merged `55ce41e4`..`84b6ae7b`. Gate fix `3442b541`
(forklift tag legibility read `state.size` through undefined in replay frames).

**Gate on `84b6ae7b`:** all pass; vitest 4,707 + the 5 fixed/timeout = all green after `3442b541`.
**Runtime batch:** axe 0; world-ready 5.3 s, startup-ready 10.4 s, 3 waves; z-fight 0.007-0.047%;
EN and pt-BR 24/24 orders seen, 22 fulfilled, 2 open not yet due, 0 late, 0 past-due-unmarked;
extras 11/11; e2e pass.
**Blind A/B round 5 vs round 4** (keys `scratch/ab-keys-r5/`): 73 wins, 8 losses, 10 ties
(med-12 11-0-2, low-12 10-0-3, med-06 10-1-2, med-19 10-2-1, med-22 9-3-1, rain 10-2-1, 18:30 13-0).
**Rubric final5-med-12: PROVISIONAL PASS, 7/7/7/7/7/7** (material response 6 → 7; axis 7 n/a).

## Round 6 (final; brief `scratch/r6-brief.md`)

rain (rain missing, cut off or under cover in round-5 captures; hard sun in rain), cyan (the line is
the stiffener rings' bare-trim mirror, fix `8791bc49` awaiting pixels), silo6 (lost silo base shadow,
rib band strengthening with distance, repeated streaks), land6 (pond teal shoreline band, 19:00
creases, dark lens over the farm ridge at night, canal reflection), hall6 (column sliver, residual
deck checker, truss jaggies, glass from outside, conduit visibility, elevator shaft), yard6 (night
pallet slats flattened by the toe lift, blue drain line, tank sheen, dock foot, pump house).

## Rounds 6 and 7 merged (release candidate `1b8feb75`)

Round 6: cyan `f01c8bfd` (top stiffener ring seen edge-on mirrored the sky horizon; rings now take
the drum film), silo6 `1141a223`, land6 `645f6715`, rain `04f310e6` + overcast `00675bae` (each drop
got its fall speed from its own height, so the field collapsed into one sheet every 12.6 s; rain
scatters the sun into fill; closed grey deck), contract `923d6486`, yard6 `71427a20`, hall6
`f5e242de` + truss `e9f23ad9` (purlins framed flush into the chords notched every junction; they now
sit on the trusses). Round 6 vs round 5 blind: 59-13-19. Tank-head streaks lost every condition and
were reverted (`0e1f892f`). Round 7: SCADA focus `6830ce37` (every live tag update moved focus to
Close; intermittent, pre-existing), startup prefetch `570e196c` (React loaded the deferred chunks
serially in most loads; world-ready median 8.5 s to 4.5 s, slow mode 9/10 to 0/10), polish7
`0f95eacd`, land7 `3a9b7331` + `1b8feb75` (hills behind the far crest take the far haze instead of
sinking; pond centre lifted).

**Gate on `1b8feb75`:** all green, vitest 4,756/4,756. **Runtime batch:** axe 0; world-ready 4.7 s,
startup-ready 9.7 s, 3 waves; z-fight ≤0.034%; EN and pt-BR 24/24 orders seen, 22 fulfilled, 0 late,
0 past-due-unmarked, autosave clean; extras 11/11 including SCADA; e2e pass.

**Known, recorded, not changed:** the noon sun is exactly overhead in this sun model, so a capture
held at 12:00 shows no silo shadow on the plinth (Nell kept the sun model). An outside process is
editing `.github/workflows`, `package*.json` and `scada-proxy/` (Node 22.23.4, sharp 0.35.5) in MillOS
working trees; never committed here.

**Blind A/B release candidate vs round 6** (keys `scratch/ab-keys-r7/`): 43 wins, 0 losses, 48 ties
(med-12 7-0-6, low-12 4-0-9, med-06 7-0-6, med-19 6-0-7, med-22 8-0-5, rain 5-0-8, 18:30 6-0-7).
**Rubric final7-med-12:** PROVISIONAL PASS, 7/7/7/7/7/7, no blockers.

**Pre-existing, recorded for follow-up (on both sides of every pair, or present in round 5):**
- a hard gantry shadow in rain;
- lamps lit at noon in rain (weather lamp floor);
- the far peak drawn translucent over the nearer ridge in overview;
- a small stepped notch in the far hill behind the shed roof in the silos camera, the same as round 5;
- pipe flow bands that read as stripes in stills;
- truss stair-steps in interior and milling;
- rubric backlog items: tank grime, silo sheen, sky in the curtain wall, dark roof-bay underside,
  box bevels, mountain backdrop at noon.

Not done: a performance benchmark on a quiet machine, the castle (a dressing call), and a HUD
rubric capture.

## Release

PR from `claude/resolute-fix-20261018` to `main`, merged; GitHub Pages deploy verified in the
served bytes at www.millos.net (Nell approved: PR, merge, go live). Not done: a performance benchmark on a quiet machine (the ground wave's crop adds
~319k triangles; the hall dressing will add more); the castle (a dressing call left to Nell).
