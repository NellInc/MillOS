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

---

## Ledger (session of 18–19 Oct, Claude Opus 5.5)

### State on arrival (verified, not as the prompt assumed)

- PR #40 is **open, not merged** (CI Lint/Test in progress at 00:13Z, mergeable,
  contains current `origin/main`). Live build is `v0.40-f24007aae244` (= PR #39,
  `origin/main`), so the live site has neither the i18n system nor the readiness
  fixes. This branch (`claude/resolute-fix-20261018`) stacks on PR #40's head
  `e68818ca`; it must merge both PR #40's branch and `origin/main` before its PR.
- Another live Claude session is watching PR #40's CI from
  `/private/tmp/millos-wcm26-20261018`; that worktree is left alone.

### Pause holders (inventory before any change)

| Holder | Writes | Restores | Released by |
|---|---|---|---|
| Shift pace select (`PlayableShift` `TeachingPace`) | 0 / 30 / 180 | — | player |
| Overview pace buttons (`OverviewPanel`) | 0 / 180 / 1800 / 10800 | — | player |
| Mobile pace buttons (`MobilePanel`) | 0 / 180 / 1800 / 10800 | — | player |
| P key (`useKeyboardShortcuts`) | productionSpeed 0 **and** gameSpeed 0 | own ref, only if clock still 0 | P |
| `-` key / Settings line slider | productionSpeed → 0 (froze trucks and forklifts) | — | player |
| Tour (`GameInterface`) | 0 | prior pace (180→30) | Start/Skip/Close/unmount |
| Restore warm-up (`physicalSession.applyRestore`) | 0 | saved pace in `finishRestore` | restore |
| Restore failure (`physicalSession.halt`) | 0 | never | player picks a pace |
| Handoff / improvement (`WorkplaceImprovementPanel`, `UnifiedGameTick` L437/454/1043) | 0 | 30 on activate | panel buttons |
| Replay (`WorkplaceReplay`) | 0 | 30 | replay button |
| Workplace lab (`WorkplaceLab`) | 15 / 30 | — | lab |
| Season autoplay (`workplaceAutoplay`) | 30 on activate, 0 on pause | — | autoplay |
| Layout planner (`LayoutPlanner`) | productionSpeed 0 + gameSpeed 0 | both refs | Run |
| Mission start (`PlayableShift`) | 30 | — | — |
| Operations resume action (`PlayableShift`) | 30 if 0 | — | — |
| Reset simulation (`SettingsPanel`) | 0 before reload | — | reload |
| Benchmark route (`RuntimeController`) | 180 / 0 | previous | route exit |
| Agent command `simulation.set-speed` | any | — | agent |

Problems: two pause authorities (productionSpeed and gameSpeed); no holder knows
whether another holds the clock; a held 0 can be persisted and restored as if
the player chose it; three pace lists disagree (0/30/180, 0/180/1800/10800).

### Baseline (named, before any change, PR #40 head `e68818ca`)

- typecheck 0, agent:typecheck 0, lint 0, format 0.
- vitest: 3,595 pass, 28 skipped, **5 fail**: all `ENOENT` under `assets/source/`
  (excluded by the sparse checkout on purpose): `scripts/crafted-assets.test.mjs`
  ×3 (barn-crafted.glb, wishingwell-crafted.glb, castle-neuschwanstein-authored.glb),
  `HeritageSignage.test.ts` ×2 (service-signs/workshop-v1.png, village-signs/innFascia-v1.png).
- `VERSION=v0.40` build 0 (dist 171M); validate:bundle/reachability/community/depth/shaders all pass.
  Initial JS gzip 618 KB of a 2.5 MiB budget; dist 178.6 MB of 179.3 MB.

### Play-test ledger (stranger, Low, 1366×768, Metal headless, 19 Oct 21:40–22:00)

English run (12 min) then pt-BR via the in-app switcher from an English load (6 min).
Ranked by harm to a first-time visitor:

1. **Silent freeze at 14:49.** The autonomous cooperative season starts itself after
   the tour; when its three shifts complete, `workplaceAutoplay.pause()` sets
   gameSpeed 0. The whole plant stops; nothing on screen says why (the chip vanishes).
2. **Guided card stuck on "Inspect the line"** for the whole first delivery unless a
   machine is clicked: it never narrates loading, departure, the 5,000-of-6,000 kg
   second trip or fulfilment.
3. **"8,640 bags/h" beside "Target 4 / 1,200"** (EN) / "8.640 sacos/h" (pt-BR): the
   rate is per plant hour, the target per game day. False at a glance.
4. **Dead time:** "0 bags/h · Line idle" for ~100 game minutes after each order is
   packed (minutes ~60–160 and ~203–233), ~3 real minutes of nothing to do.
5. **Autonomous season chip** ("Autonomous season: take over" / "Temporada autônoma:
   assumir") appears at once with no explanation of what is running or what taking
   over means.
6. **Camera moves by itself** between observations in both runs (ended inside R.M. 103
   in the EN run) with no input.
7. **Shift pace select clipped** below the guided card's fold at 1366×768.
8. Loading cover ~45 s on an M1 Max at load ~6/10 cores (strict 30 FPS window).
9. Two unread notifications in the bell, never surfaced.
10. pt-BR: copy reads naturally; numbers grouped correctly ("6.000 kg", "1.200");
    no `translated-ltr`. Only English seen: song titles and the customer name (allowed).

What worked: at standard pace (30) every order was met (order 1 at minute ~142 of
240, order 2 at ~223 of 360), no console or page errors in either run.

### Audit (19 Oct, 86 agents, read-only on a frozen snapshot of `e68818ca`)

40 findings: 27 accepted by both refuters, 5 split, 8 refuted by both. Full JSON
kept outside the repo (scratchpad `audit-resolute.json`); fixes were assigned as:
- lead (waves 1, 2, D): 0/35 guided card, 1/15/38 autoplay freeze and chip, 3 labels,
  4 idle line, 5 Skip tour, 6 pace position, 13 pace writers, 28/37 bags/h, 29 line-rate
  owner and AI decision, 30 replay hold, 31 truck clock, 32 old paces, 33 advice, 34 PA,
  36 pace copy;
- wave A (failure and recovery): 7, 8, 9, 10, 11, 12 and first-shift wear timing;
- wave B (cooperative): 16, 18, 19 and an honest season exit (2/14/17 lighter design);
- wave C (shift ending): 21, 22, 23, 24, 26.
Not re-opened: 20, 25, 27, 39 (refuted by both, no new evidence).

### Decisions taken (with reasons)

- **Standard pace is 30.** Plant physics is authored for it (3 packers x 25 kg/s = 9 t
  per game hour; trucks at road speed). Paces 0, 1/2x, 1x, 2x, 4x; 4x is the ceiling
  the truck display bound can follow on an ordinary laptop.
- **Auto-start of the autonomous season is kept** (Nell's 2026-10-04 direction, cited by
  a refuter); it no longer freezes the plant, and Take over keeps the shift running.
- **Lazy-loading pt-BR: not done.** pt-BR adds 297 KB raw / 92 KB gzip across 133
  catalogs. Lazy-loading saves English visitors at most ~92 KB of a 618 KB initial
  gzip and nothing of the dist budget (a lazy chunk still ships); it would make
  `translate` asynchronous across 133 modules. Initial JS has 1.9 MiB of headroom.
- **Hard-coded English re-sweep:** an AST scan (JSX text, title/aria-label/placeholder/
  alt/label props, alert/announcement objects) over 461 live files plus the audit's
  copy finder found no live player-facing English outside the deliberate set (signage,
  proper names, model names, key names, agent protocol). FPSDisplay's English is in a
  component nothing renders.
- **Unexplained preview reload [Inference]:** the service-worker policy reloads once
  "before the scene opens" (`startup.opened || startup.ready`). On the build with the
  suspend loop, readiness never arrived, so a preview rebuild's new worker reloaded a
  visible scene. The context-restore reload needs an empty GPU tracker, which App's
  startup registration rules out. To confirm: log navigations in the runtime pass.
  **Confirmed by the runtime pass:** every run logged exactly one navigation per
  deliberate load or reload (9 runs, 0 unexplained).

### Runtime confirmation (20 Oct 00:20–01:45, built `VERSION=v0.40`, Metal headless, 1366×768 unless noted)

Load 2.8–8.3 per machine, so no frame-rate claims. Scripts and frames in the session
scratchpad (`playtest/`, `sw/`).

- **Standard pace (EN, 7.5 real min):** orders 1 and 2 on time; Truck 1 departs at
  5,000 kg, then the 1,000 kg second trip; HUD "Changing over to the next order" then
  "Line idle: order packed, awaiting dispatch"; bags/h 189–288 beside "Target n / 1,200".
- **Guide card:** "Truck 1 of 2 for this order (up to 5000 kg each); 6000 kg still to
  ship", "Inspection: waiting · Delivery: 0 kg dispatched", receipt "6,000 of 6,000 kg,
  delivered on time".
- **4x pace:** the clock, deadlines, loading and dispatch all move 4x together.
  Overview "Standard, 1x" button sets 30 (pt-BR "Padrão, 1x" too).
- **P:** 120 → 0 → 120, its own hold only.
- **Take over:** opens Autonomy, clock stays at 120; "Automatic decisions paused. Your
  choices take priority."
- **Second tab:** the stage tab kept running (14:13 → 15:14 in 30 s at 4x).
- **Autosave failure (setItem throwing QuotaExceededError for 20 s):** five failed
  cycles, one bell notice, last good record kept byte-identical, writing resumed after.
- **Shift review:** "Morning shift closed: grade A…" announced in EN and pt-BR; Overview
  "Balanço do turno" shows Manhã nota A (three orders, on time), Tarde provisória A,
  linked agreement and season exit; **the same after reload**.
- **pt-BR via the in-app switcher from an English load:** every captured surface
  Portuguese, `html.translated-ltr` never set, no console errors.
- **Wear → maintenance:** Silo Alpha warning at ~13:44; Predictive Maintenance shows
  Silo Alpha electrical 55%, Schedule → "Silo Alpha · Predictive · 17:54 · Parts:
  sensors, motors" with Complete.
- **Load:** cold load to `millosStartupReady` 35.3 s and 35.4 s, reload 36.7 s and 37.6 s,
  with "Use low graphics" offered on the loading screen.
- **Service worker (built app, fixture server, build B differing only in sw.js and
  build-info):** cold boots; reload served from the versioned shell cache (21 entries);
  offline reload boots; a 4 s stalled navigation still one navigation; deploy while open
  does not reload the open scene, the new worker waits and the old build keeps serving;
  next visit runs B with only B's caches.
- **e2e (`e2e/`, headless Metal via a scratch config):** 2/2 pass after one fix below.

Defects the runtime pass found, each fixed failing-test-first and re-confirmed in pixels:

1. Choosing any pace stopped the autonomous season silently (Take over vanished; the
   default path lost its sobras). A pace is now only a speed; P/Paused defer its steps.
2. A reload mid-season dropped the season and its Take over (the runner is ephemeral and
   `manual` persisted). The running profile now persists and resumes after startup,
   also once every order is fulfilled; a taken-over season stays the player's. Late-season
   reload then stops by itself with "Automatic three-shift season complete" in the bell.
3. First-delivery card: text bled half-clipped under the pinned actions (sticky edge inset
   by the card padding). Pinned into the padding; shorter pt-BR view labels ("Ver a
   expedição") keep the row on one line at 1280×657 so Shift pace stays visible.
4. Parts inventory labels truncated ("Be…", "Mo…"); tiles now wrap and keep "Rolamentos" whole.
5. Loading-screen quote attribution 4.02:1 (axe, e2e); now 7.29:1, knowledge card too.

### Whole gate after the runtime fixes (vs the named baseline)

typecheck 0, agent:typecheck 0, lint 0, format 0, agent:manifest:check 0 (after
regenerating the gitignored inventory). vitest 3,702 pass, 28 skipped, 5 fail: the same
five `assets/source` ENOENT tests as the baseline, nothing new. `VERSION=v0.40` build 0,
dist 171M; validate:bundle/reachability/community/depth/shaders 0. dist deleted.
