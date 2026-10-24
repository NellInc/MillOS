# MillOS resolute fix, from 18 October 2026

## Goal

Make MillOS genuinely good to play for a visitor who arrives by link, in
English or Brazilian Portuguese, with no presenter: a clear goal within a
minute, readable consequences, real choices, recoverable mistakes, and a shift
that ends in a meaningful review. Then fix everything else the evidence finds.
Gameplay first; everything else after it, completely.

"Fix everything" means the full set. Stop only for a decision that is truly
Nell's (ask in the same message as finished work), a destructive or
outward-facing step she has not authorised, or a hard resource limit. Report
what remains, with counts.

## Where things stand (verify before trusting)

- PR #40 (`claude/wcm26-demo-readiness-20261018`) merged and deployed on
  18 Oct, if the deploy completed: check `git log origin/main` and
  `curl -s https://www.millos.net/v0.40/build-info.json`. It contains:
  - 22+ commits fixing every audit finding both refuters accepted;
  - the `src/i18n` translation system (EN + pt-BR, ~3,560 keys, 134 modules);
  - a 171 MiB dist budget.
- The verified audit (79 findings, two refuter votes each, proposed fixes and
  verifier refinements) is at `_audit/wcm26-demo-audit-20261018.json`. Read
  `verified[].votes[].fix_assessment` before re-deciding anything in it.
- Translation rules: CLAUDE.md "Interface Language" and
  `src/i18n/GLOSSARY.md`. All new copy goes through `defineMessages`, then
  `useT` / `translate`, with numbers through `formatFixed` / `formatGrouped`.
  New hard-coded English is a regression.
- Other sessions (Codex) merge to `main` several times a day. Work in a
  sparse worktree off fresh `origin/main` (exclude `assets/source`,
  `test-results`, `output` and `dist-archives`; run `npm ci` with
  `PUPPETEER_SKIP_DOWNLOAD=1`). Re-merge `main` before you open the PR.
  Never edit the primary checkout's dirty tree.

## Constraints Nell has stated

- **Her machine overheats.** Do not run MillOS (dev server, preview,
  browser, benchmarks) unless a claim truly needs runtime evidence. Batch
  those runs, keep them short, and close the tab and server at once. Agents
  that read and edit code run nothing heavier than their own test file
  (`--maxWorkers=1`). Run the full suite once per wave, not per file.
- **No FPS or performance claims while load exceeds 3 runnable per core.**
  Check `uptime` first.
- **Disk is often under 2 GB free.** Delete your own `dist/` after each
  build, and check `df -h /` before installs and builds.
- **A safety hook guards paths containing `hooks`.** Committing or patching
  `src/hooks/*` needs `consent-gate approve policy-gate-edit`. Ask Nell for
  `--uses N` up front if you will touch them.
- **Pushes cost money.** Push or deploy only when Nell says "live", "ship"
  or "get it live". Then carry the whole path and verify the served bytes.
  End site reports with "local only — not live" or "live — verified in the
  served bytes".
- **Visual claims need pixels.** Screenshot the actual surface. A Chrome
  profile with auto-translate will rewrite pt-BR pages into English (look for
  `html.translated-ltr`), so verify Portuguese through the in-app switcher
  from an English load.

## Gameplay: the main work

Play it first, as a stranger would, once in each language, at standard pace
on Low quality. Write down every moment of confusion, dead time, false
statement, stuck state or missing feedback. Then fix the causes. Known
structural problems that the readiness pass only labelled or mitigated:

1. **Two clocks.**
   - **The problem:** deadlines, wear, wages and the campaign run on game
     time (`gameSpeed`, where 180 is "1x"), but material flow and trucks run
     on real seconds × `productionSpeed`. At 180x the first order cannot be
     met. The fix was relabelling the pace options ("Fast clock, 6x:
     deadlines tighten") and releasing the tour to 30.
   - **What to do:** design one time model so every pace is physically
     coherent, or make the pace control honest about what it accelerates.
     Then delete the caveats. Check `UnifiedGameTick` (material ~L732, campaign
     ~L960), `TruckBay` truck delta, the `OverviewPanel` clock ratio (it shows
     0.2x at "Standard pace") and the 180x `playableJourney` tests.
2. **The idle line.** Once an order's mass is packed, the feed budget stops
   the line ("0 bags/h") until the truck leaves. It is now explained in the
   copy, but it is still dead time. Pre-stage the next commitment, or give the
   player a meaningful choice during the wait (`materialFlowStore` ~L829,
   `operationsCampaignStore` `executionMessage`).
3. **The first guided delivery.**
   - Check it is winnable without expertise at standard pace, and that the
     guide always names the next useful action.
   - A truck holds 5,000 kg against a 6,000 kg order: make the second trip
     visible and predictable.
   - The guided card still waits on 'Inspect the line' for the loading and
     dispatched stages; decide whether that teaches or obstructs.
4. **Failure and recovery.** A breakdown, a QC hold, a stock shortage and a
   late order should each be discoverable, explained and recoverable through
   the ordinary UI. Today wear warnings are staggered per line (`WEAR_PACE` in
   `UnifiedGameTick`), but check that a first-time player can find Maintain,
   knows what it costs, and sees the result.
5. **The cooperative layer.** This is what the WCM audience came for:
   roles, ballots, *sobras* (surplus), pay and rest, handoff experiments and
   member review.
   - Make sure it connects to the plant, not just to panels.
   - The autonomous season starts by itself after the tour. Make its
     take-over obvious and reversible.
   - A linked campaign still cannot be abandoned: add an honest exit through
     the engine (`bilateralWorkplace`, `workplaceStore`), not only copy.
   - Surplus voting is disabled unless the charter includes gainsharing.
     Consider making shared surplus reachable in the default path, because it
     is the most cooperative mechanic.
6. **The shift ending.** A shift should end in a review that says what
   happened, why, and what to try next, using the evidence already recorded.
   Check it fires, reads well in both languages, and persists across reload.
7. **Pause authorities.** Before you add any new pause path, list every
   holder (P, Shift pace, the tour hold, the restore halt, the handoff hold,
   the speed slider) and make them coherent. The P key restores only a hold it
   made itself.

For each gameplay change, give the before and after evidence:
- a failing-then-passing test on the real simulation path;
- one short runtime confirmation of what the player sees.

## Everything else still open

Each item is either open or only partly fixed.

- **Service worker:** the navigation timeout, the hashed entry-graph precache
  under the `/v0.40/` base, and update-on-next-startup are unit-tested only.
  Prove them in a real browser once (cold load, reload, offline reload,
  deploy-while-open). Offline after one visit is still only partial.
- **Autosave retry, second-tab behaviour and coop autoplay gating** are
  unit-tested only. Confirm each in the running app.
- **The Playwright e2e suite has not been run** on the merged build (CI's Jev
  acceptance did; e2e specs assert English region names).
- **SCADA alarms that returned to normal but were never acknowledged** still
  hold the quiet UI. Decide by ISA-18.2 semantics.
- **A forklift queuing behind another vehicle still counts as a near miss**
  ('route-blocked'). Splitting peer-ahead from static obstruction changes the
  controller contract (`forkliftController.ts`).
- **`operationsPlay` next-action labels** ('Inspect …') open the SCADA tag
  list. Word them for what opens.
- **Duplicated constants:** `TruckBay` copies truck limits from
  `truckController` (export `TRUCK_LIMITS`); `store.ts` `storeOwnedLoad`
  copies `MachineSimulationController`'s formula.
- **Leftovers:**
  - `applySessionQuality` in `adaptiveQuality.ts` no longer has a caller;
  - `persistenceMigrations` still lists `fpsMode`/`blueprintMode`;
  - the session-tier record lives beside `millos-graphics`, not in
    `graphicsStore`.
- **Bundle:**
  - the pt-BR catalogs ship to English visitors;
  - consider lazy-loading the pt-BR half, which would let the budget return
    toward 170 MiB;
  - the initial JS gzip budget is 2.5 MiB, so check headroom.
- **One production-preview reload was never explained.** It was seen once,
  only on a build that still had the suspend loop, under heavy load
  (suspected: WebGL context restore at `App.tsx` ~L767). Check whether it
  recurs.
- **Load time:** strict readiness needs a 30 FPS window, so slow laptops wait
  about 30 s for "Open loaded scene (slow)". The cover's "Use low graphics"
  now persists. Consider whether a first visit should start Low on weak GPUs.
- **Translation upkeep:**
  - re-sweep for hard-coded English, since other sessions have kept adding
    copy since 18 Oct;
  - a native Brazilian reader should review the cooperative vocabulary;
  - deliberately English, so leave it: SCADA tag names, machine designations,
    proper names, lyrics, painted signage, the agent protocol.
- **Refuted by both verifiers on 18 Oct.** Re-open one only with new
  evidence:
  - Space as emergency stop;
  - Monday-shift zero output;
  - no way to replay the tour;
  - one boundary wrapping the whole HUD;
  - a silently paused restored shift;
  - SCADA NaN as a cause of save failure.

## Method

1. Orient (git state, live build id, `uptime`, `df`). Then call the advisor
   before committing to an approach.
2. Play-test in one short, batched runtime session. Record the findings in a
   ranked ledger kept in this file.
3. Run a read-only audit workflow over the gameplay and cooperative code,
   seeded with the play-test, with two refuters per finding. Agents read only.
4. Run fix waves in disjoint file groups, each one failing-test-first. Then
   one whole gate: typecheck, agent:typecheck, lint, format, full vitest,
   build, validate:bundle, validate:reachability, validate:community,
   validate:depth, validate:shaders. Compare the result to a named baseline
   taken before your first change.
5. Do one runtime confirmation pass covering every visual and gameplay claim,
   in both languages. Then close the browser and delete `dist/`.
6. Ship only on Nell's word. Report: Blocked on me, Changed, Found, then the
   deploy-status line.

Working if a stranger on a mid-range laptop, in either language, can finish a
shift, understand why it went the way it did, and want to play the next one,
with every claim above backed by a test or a screenshot.
