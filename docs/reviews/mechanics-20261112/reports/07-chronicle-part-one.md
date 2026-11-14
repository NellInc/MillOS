# The Mill Chronicle, part one, and its balance

## How to read this

- **Paths** are relative to `src/` in the snapshot, except those under `docs/`. A bare filename sits in `src/chronicle/`.
- **"A"** is the throughput `docs/CHRONICLE.md:713-716` was tuned on: one 5,000 kg truck every second close, netting about 2,200 on a shipping close.
- **"B"** is the order-limited case the current plant allows: one 11,500 kg delivery programme each close (`simulation/programmes.ts:42-56`), every programme accepted at once. B's net of about 8,000 a close is my assumption.
- **Both columns are [Unverified]** until kg and net per close are measured at pace 30.
- **Scripts:** `docs/reviews/mechanics-20261112/balance/calc07-reviewer-scripts/` (a copy of the reviewer's scripts).
  - `econ.py` is a greedy buyer: library first, then the cheapest plans, keeping three shifts of upkeep in hand. It leaves out treatment, event and mitigation spend, and assumes grade A on shipping closes, one QC pass a close, silver medals and a contractor.
  - `pacing.py` ports `rng.ts`; a JS copy confirmed the port. It counts how often the event roll passes, over the whole deck. Four drawn part-two events share that deck, so most draws, but not all, are part-one events.
- **Plan tree totals:** 344 know-how, 3,790 fund to install, and 89 upkeep a close with everything installed (`plans.ts:116-339`).

## Mechanics inventory

| Mechanic | Entry | What the player does | Verdict |
|---|---|---|---|
| Charter | `components/chronicle/CharterScreen.tsx:25`, `charter.ts:31-133` | Picks five options, signs | rework |
| Crop year | `engine.ts:943`, `cropYears.ts:78-90` | Reads the notice, then treats or plans | tune |
| Direct treatment | `engine.ts:2552` | Pays 200 | keep, reword |
| Eras | `plans.ts:14-57`, `engine.ts:2647` | Nothing: they advance by themselves | tune |
| Plan and install | `engine.ts:2269, 2336, 2385` | Spends know-how, then fund; cancels | rework |
| Upkeep shortfall | `engine.ts:811, 2490` | Chooses Conserve or Forced maintenance | tune |
| Voluntary austerity | `engine.ts:2531` | Toggles it | cut or rework |
| Duct fire | `engine.ts:1891, 1951` | Pays 70, or cleans by hand for free | keep |
| Contractors | `contractors.ts:73`, `engine.ts:2410` | Hires a firm | rework |
| Forecasts | `forecasts.ts:9-49`, `engine.ts:1187-1298, 2131` | Pays to mitigate | tune |
| Restore controls | `engine.ts:2228` | Clicks after recovery | keep |
| Events (20) | `eventDeck.ts:25-784`, `engine.ts:1407` | Chooses, thinks it over, or lets it lapse | tune |
| Customer relationships | `customers.ts:39-46`, `engine.ts:763` | Nothing directly | connect or cut |
| Trials (5) | `trials.ts:13-84`, `engine.ts:983` | Meets each goal in the plant | rework |
| Challenge medals | `trials.ts:262`, `scoring.ts:65-70` | Repeats recovery challenges | tune |
| Training mode | `engine.ts:1101, 2591` | Accepts it | keep |
| Delegation 0-3 | `delegation.ts:11-45`, `engine.ts:2041` | Sets a level, reverses initiatives | tune |
| Notes and quiz | `engine.ts:2610, 2622` | Reads and answers, for know-how | keep |
| QC pass credit | `engine.ts:736-739` | Presses Test batch | fix |
| Score and rank | `scoring.ts:61-82` | Nothing | tune |

## What works

1. **All chance is seeded and order-independent** (`rng.ts:1-41`).
2. **The rules are honest.** Costs and effects are printed on the buttons, every default is free, and everything the Chronicle raises can be undone. A duct fire can always be cleaned by hand, free, in 120 minutes (`engine.ts:226, 1958`). Ending or abandoning hands every hazard back (`engine.ts:2689`).
3. **The Inspection sends the player onto the plant floor.** It needs a passed QC test in each of three consecutive shifts (`trials.ts:167-173`), and the player runs it from Test batch (`components/ui-new/panels/OverviewPanel.tsx:643`).
4. **The crop data are true.**
   - Moisture is 13.2% in a typical year and 15.6% in a wet one.
   - The falling number is 320 typical and 190 sprouted.
   - Protein is higher in a dry year.
   - Lab readings come from the lots actually tested (`cropYears.ts:21-74, 140-170`).
5. **Only surplus is reinvested** (`engine.ts:728-731`). The members' meeting, reinvestment against low prices, is a real co-operative dilemma.
6. **Trials are telegraphed and framed by real history, and a bronze says what silver needed** (`engine.ts:1051-1062`).

## Findings

**F1. The Chronicle is tuned for a pace that no longer exists. High.** Code: Verified. Throughput: [Unverified].

`CURRENCY_TO_FUND = 0.18` rests on a measurement "at standard pace (180x)" (`engine.ts:200-205`, `docs/CHRONICLE.md:713`). Standard pace has been 30 since 2026-10-18 (`simulation/pace.ts:20`, commit 0b092b81).

- **Length:** a close is 8 game hours, which is 16 real minutes at 1x. 63 closes take 16.8 real hours at 1x and 4.2 at 4x, not "2.8" (`docs/CHRONICLE.md:41`).
- **Throughput:** the real-truck test ships an 11,500 kg programme with at least 20 minutes to spare (`systems/__tests__/UnifiedGameTick.playableJourney.test.ts:716-751`).

What `econ.py` gives in each case:

| | Fund income a close | Upkeep at the end | Fund at the end | Plans installed | Furthest era |
|---|---|---|---|---|---|
| A | about 65 | 58 | about 300 | 11 of 16 | Regional (close 30) |
| B | about 430 | 76 | about 26,000, unspent | all 16 by close 38 | Federated (close 35) |

- **Under A, Federated is out of reach:** it needs 12 installs (`plans.ts:52`).
- **Under B, fund stops constraining anything after about close 15.**

**F2. Trial medals measure the throughput regime, not the player. High.** Arithmetic from `trials.ts:13-84, 126-131`.

| Trial | kg a close for Gold / Silver | Under A | Under B |
|---|---|---|---|
| Wet Harvest, 6,000 in 4 | 3,000 / 2,000 | Gold impossible (2 closes ship 5,000). Silver only if the window opens on a truck close | Gold in 1 close |
| Inspection, 3 clean in 4 | none | A skill test | Same |
| Bakers' Rush, 12,000 in 6 | 3,000 / 2,400 | Gold impossible. Silver depends on phase | Gold in 2 closes |
| Grid Winter, 8,000 in 5, at most 0.08 a kg | 2,667 / 2,000 | Gold depends on phase. Energy needs a multiplier of 0.909 or less on the measured 0.088, which only Regional plus wind and heat recovery reach (0.875) | Tonnage is trivial |
| Great Programme, 20,000 in 9, no failure | 3,334 / 2,500 | Gold impossible. Silver needs exactly 20,000 in 8 closes with every truck full | Gold in 2 closes |

- **Energy per kg falls as output rises.** Energy cost is kW × hours × tariff (`stores/operationsCampaignStore.ts:2624-2627`).
- **Only the quality conditions and the Inspection test the player.** Medals are worth 15 of the 60 points.

**F3. No plan's own effect pays for itself. High.** Arithmetic.

- **Plant savings reach the fund at 4.5%:** 25% reinvested × 0.18 (`engine.ts:731`). A 6% energy saving is about 1.4 fund a close. The wind turbine costs 400 and 6 a close (`plans.ts:273-285`).
- **Per-forecast payment beats every forecast-relief plan.** Drainage costs 130 plus 3 a close for 0.25 relief on about 3 storm forecasts per chronicle. Paying each time costs 60 a storm for 0.35 relief. Aspiration, the standby generator and haulage lose the same way.
- **The crop-relief plans rarely pay.** The dryer helps only in wet years. Cooperative growers draw one 1 year in 10 (`charter.ts:180-184`). Blending bins never help a beginner charter, because it never draws a sprouted year.
- **Only two plans return their cost:** the library (1 know-how a close for 2 fund) and federated purchasing, which arrives too late.
- **Plans buy era progress, not savings.** Installs pay off through era bonuses (Cooperative's +5% reinvestment is +20% fund), score (3 an era) and trial thresholds.
- **Result: there is one best order.** Build the library, then the cheapest plans. Upkeep only bites under A.

**F4. Test batch farms know-how and standing. High.** Code: Verified. Runtime: [Unverified].

- **Test batch has no limit:** it is offered on every released batch, as often as pressed (`OverviewPanel.tsx:643-655`).
- **Each fresh passed test pays out:** 1 know-how (`engine.ts:736-739`) and 0.08 standing (`certifier.ts:15`).
- **Standing has teeth:** it gates the Regional (4) and Federated (6) eras and is worth up to 4 points.
- **No test pins this.**

**F5. Most events have an obvious answer, and six recommendations are beaten. Medium.** Know-how is valued here at the forced-maintenance rate of 25 fund (`engine.ts:218`).

| Kind | Events |
|---|---|
| Obvious answer | Generous crop year (bank). Federation grant (full). College (run). School specks (records). Inspector (records). Low falling number (blend: the only option that treats). Lot notification (test). Demand response (shed). Proving test (letter once the relationship is at 100) |
| Recommendation beaten | Wet intake: dryer at 160, where blending costs 90 and 5% production for 3 shifts. Members' meeting: Table, beaten by Reinvest, which has no downside. Weighbridge: First come, beaten by valley (+60 fund) and by hill (+4 know-how). Off-peak tariff: the timer costs 80 to save about 8 fund outside Grid Winter. Pest signs: the firm at 70, where in-house costs 3% production. Haulier: relief at 80, against a medium incident a few clicks recover |
| Real dilemma | Valley against hill (fund against know-how). Millwrights (near par). Dull flutes (wear against energy, impossible to price). Sack delivery (70 against a high incident). Village work party (40 for −0.10 forecast chance, worth about 19 at mitigation prices). Two buyers (only while a customer is below warm) |

About 34 event rolls pass per chronicle, so each part-one event recurs about once or twice.

**F6. Mitigation is priced against attention, not odds. Medium.** Incident damage: [Unverified].

- **Break-even damage, cost ÷ relief:** storm 171, grid strain 267, dust 143, road works 150 fund.
- **Incidents persist until someone acts.** A raised incident only resolves when someone acknowledges and mitigates it, by button or agent command (`components/ui-new/onboarding/PlayableShift.tsx:956-958`, `agent/adapters/runtime/runtimeCommandHandlers.ts:223-229`), and then a challenge ends or the Chronicle restores it (`operationsCampaignStore.ts:1945`, `chronicleStore.ts:151`).
- **An attentive player loses a few fund to a strike.** An absent one gets a grade capped at D and a broken Inspection run.
- **The card hides the real stake.** Dust adds 3 quality points (`operationsCampaignStore.ts:689-705`), which together with a wet year fails community flour. The card does not say so.
- **Under B, every mitigation is affordable, so none is a decision.**

**F7. Contractors: hire any firm, once. Medium.**

- **Every firm beats the in-house crew's x1.5 duration.** Even a Passive firm (+15% time) is faster (`contractors.ts:144-150`).
- **One hire lasts the whole chronicle** (`engine.ts:2410-2425`).
- **Diligent and Neglectful scale only `effect`** (`effects.ts:90-93`). Seven plans have an empty effect, so on them the "plan effect +X%" label does nothing.

**F8. Relationships saturate, and the hard charter columns are cheap score. Medium.**

- **"Demanding buyers" fades within five programmes.** Each customer gains 8 for each on-time order, one order per programme (`customers.ts:41-46`), so it climbs from 30 to warm (67) in five programmes: five closes under B, longer under A.
- **The penalties scale with how short fund is.** Under B, fund pays off hard fortune and marginal harvests, so the hard columns give up to 9 of the 60 points cheaply.
- **"Relationships weight which events appear" is not implemented.** Beyond the 4% loyalty premium, a relationship gates one event (`eventDeck.ts:640`), despite `docs/CHRONICLE.md:176`.

**F9. Austerity and the fire are almost never reached. Medium.**

- **Forced maintenance is the dominant answer.** It costs 1 know-how per 25 fund short, about 3 against A's upkeep of 58. Conserve costs production x0.92, wear x1.2 and a fire chance that rises 4% a close (`effects.ts:28-32`, `engine.ts:1882-1889`).
- **Neither econ.py case ever falls short.** So the duct fire only reaches players who let the shortfall prompt lapse.
- **Voluntary austerity may be free money under A.** It halves upkeep and saves about 29 a close. If the yard rather than the line sets the pace (`programmes.ts:31-36`), its production cost changes no shipped kg [Unverified].

**F10. Delegation silently loses the Wet Harvest under A. Medium.**

- **The partner's purse is small under A.** It may spend 15% of the fund per close: 36-60 on A's fund of 240-400.
- **Most paid answers lapse.** Only road works (45) fits among the mitigations. The recommended wet-intake dryer (160) needs a fund of 1,067, so it lapses to "Mill it as it comes": the wet penalty stays, strong white fails, and the trial fails.
- **The know-how halving barely matters.** It touches only event know-how (1 to 6 a decision).
- **Under B the purse covers everything.**

**F11. Pacing is slow at 1x, and the first trial is three hours away. Medium-high.**

- **The first trial starts at close 11, 2.9 real hours in.** The first crop-year turn comes at 2.4 hours.
- **About 4.5 decisions a real hour at 1x, 18 at 4x.** That rests on about 1.2 decisions a close: 0.55 event rolls, 0.24 forecasts, about 0.5 plan or install actions, and a crop year and contractor offer every 9 closes.
- **A third of closes are quiet.** 21 of 62 closes see neither an event roll nor a forecast. The longest quiet run has a median of 3 closes (48 min at 1x), p90 of 5 (80 min) and a maximum of 11 (about 3 hours) over 2,000 seeds.

**F12. The Chronicle is a panel game. Medium.**

- **Nothing it builds is drawn.** The 3D scene reads only its multipliers (`systems/UnifiedGameTick.ts:728-815`). The dashboards read its energy figure (`components/ui/EnergyDashboard.tsx:68`).
- **Trials reach the plant floor through three levers:** accepting programmes (`PlayableShift.tsx:969`), Test batch, and keeping quality above the recipe floors.
- **The production multipliers may do nothing** if the yard sets the pace [Unverified].

**F13. The charter is signed blind. Medium.**

- **The screen shows only options, tier, effect and score** (`CharterScreen.tsx:25-81`).
- **It never states the commitment:** 63 closes, about 17 hours at 1x, the first trial at close 11, a second year that is always wet (`cropYears.ts:82`), or that trials need accepted programmes and QC tests.
- **The only way in is the dock** (`components/ui-new/dock/Dock.tsx:256`). No onboarding copy names the Chronicle.

**F14. Quality margins are invisible. Medium.** Arithmetic: Verified. Runtime: [Unverified].

- **The ceiling is 99.5** (`UnifiedGameTick.ts:357`), and each efficiency point lost costs 0.2. Batch quality is a mass-weighted average with no rounding (`stores/materialFlowStore.ts:1306-1310`).
- **Strong white has 4.5 points of margin.** A lapsed pest note (2) and a struck dust forecast (3) together fail every Riverside shipment, and with them the Great Programme (`trials.ts:175-185`).

**F15. Teaching errors. Medium.**

- **"Condition the grain" is ambiguous.** It is the wet-year button (`components/chronicle/ChronicleOverview.messages.ts:34`, notice at `engine.ts:2566`). In a mill, conditioning means tempering, which adds water. The wording needs a source check.
- **The ledger inverts the maintenance lesson.** Vibration monitoring and roll regrinding show their upkeep but never the breakdowns they avoid, so the ledger says predictive maintenance does not pay.
- **Grid Winter teaches the wrong lever.** Its copy points at energy plans, while the real levers are output per hour (specific energy consumption) and night running (0.08 against 0.15).

**F16. A second chronicle earns about 148 less know-how. Low-medium.** Notes and quiz answers carry over (`engine.ts:557-562, 2611, 2627`). There are 37 notes at 2 know-how and 74 questions at 1. Without them, the eras under A arrive 4 to 6 closes later.

## Defects

1. **Test batch know-how and standing farm.** See F4. To reproduce: sign, open Overview, press Test batch 20 times, close the shift; know-how rises by 20 and standing by 1.6. High.
2. **Tuning comment and doc name a 180x pace and 2.8 hours.** See F1. High.
3. **Moisture meters cannot save strong white in a wet year:** 99.5 − 6 + 1 = 94.5 < 95. `docs/CHRONICLE.md:123` lists them as a response and `cropYears.ts:5-10` assumes a ceiling of 100. To reproduce: wet year, meters installed, ship strong white. Medium.
4. **"Switch recipe" is offered as a wet-year response** (`docs/CHRONICLE.md:123`, `cropYears.ts:8-9`) but recipes belong to customers. Every programme carries Riverside strong white (`operationsCampaignStore.ts:886-935`, `programmes.ts:98-124`), and there is no cancel. Medium [Unverified].
5. **The Diligent and Neglectful labels promise an effect they do not have on seven plans.** See F7. Low-medium.
6. **The Inspection failure omits which condition broke the run** (`trials.ts:211-212, 286-290`). Low-medium.
7. **Grid Winter is telegraphed 2 shifts ahead** (`trials.ts:11`), against 3-6 shift energy installs. Low-medium.
8. **The doc has drifted from the code.**
   - "A shift with no truck is graded F" (`docs/CHRONICLE.md:725`) contradicts the null grade for windows with nothing due (`simulation/shiftReview.ts:197-205, 233-234`).
   - Relationship weighting of events is unimplemented (F8).

   Low.

## Proposals

1. **Measure, then re-tune at pace 30.** S-M. Needs the owner (difficulty).
   - **Change:** add a measurement script that takes the capture lock and records kg, net and energy per close over 10 closes with programmes accepted. Re-derive `CURRENCY_TO_FUND` (`engine.ts:205`) and each trial's kg, with gold at about 1.2× and silver at 1.0× measured pace.
   - **Why:** medals then reward running the floor well.
   - **Proof:** a test pins gold per close at 1.1 to 1.4 of the measurement.
   - **Old contract:** `modules.test.ts:277-331` and saved trial progress. Targets are read live, so saves follow.
2. **Credit one QC pass per batch per shift.** S. Safe.
   - **Change:** dedupe in `creditShift` (`engine.ts:736`).
   - **Proof:** a store test where twenty presses give 1 know-how.
   - **Old contract:** saved `seenQcTestIds`.
3. **Make plans pay in what they save.** M. Needs the owner.
   - **Change:** a "Avoided cost" fund source that credits plant cost a plan saved (work orders, energy) at the full rate, or upkeep cut to match.
   - **Why:** it teaches that maintenance and efficiency pay.
   - **Proof:** wind, heat recovery and vibration monitoring each pay back within 25 closes at the measured pace.
   - **Old contract:** the `FundSource` union, `LedgerTab` labels in both languages, and saved ledgers (the new key reads 0).
4. **Show quality margins as numbers.** S-M. Safe under D-012: an effect value, not a caption.
   - **Change:** on the trial card and crop-year line, for example "strong white 93.5 / 95".
   - **Proof:** a play-tester can say why the Wet Harvest failed.
   - **Old contract:** English `cropYearSummary` notices in saves.
5. **Re-balance the six beaten recommendations.** S. Safe.
   - **Change:** retune them so the recommendation follows value. Add a deck test that values every choice and fails when a non-recommended option beats the recommended one by more than 30 fund.
   - **Old contract:** brief divergence counts in `governance.test.ts` (`docs/CHRONICLE.md:595-603`), and both catalogues.
6. **Size the partner's purse for paid crop treatments.** S. Safe.
   - **Change:** let a crop treatment exceed the 15% share up to its price, as fire suppression already does (`engine.ts:1995-2000`).
   - **Proof:** a delegated A-scale run treats the wet year.
   - **Old contract:** `delegation.playtest.test.ts`.
7. **Telegraph Grid Winter 6 shifts ahead, and name both levers in its pressure beat.** S. Safe.
   - **Change:** a per-trial `telegraphShifts`.
   - **Old contract:** callers of `TRIAL_TELEGRAPH_SHIFTS` and saved `telegraphed` phases.
8. **Offer a shorter chronicle.** M. Needs the owner.
   - **Change:** a length column, for example 27 closes (about 7 hours at 1x), with the trials compressed.
   - **Proof:** more `ended` outcomes in the funnel (`funnel.ts:28-47`).
   - **Old contract:** `CHRONICLE_SHIFTS`, the part-two scheduled shifts, and saves.

## Needs the owner

- **Which throughput is the Chronicle for?** Recommend the measured pace-30 plant with programmes accepted, and make the measurement a gate.
- **Should plans be investments or a prestige track?** They are a prestige track today. Recommend investments (proposal 3).
- **Is 63 closes, about 17 hours at 1x, the intended length?** Recommend a length option.
- **Should a second chronicle re-earn notes and quiz know-how?** Recommend half rate.
- **Should the hard charter columns keep +9 while fund buys them off?** Recommend re-scoring after the re-tune.

## Not reviewed

- **History and quiz accuracy:** the content of `history.ts` and `quiz.ts` was not checked.
- **Part-two and part-three pressure on part-one numbers:** stakeholder reinvestment, policies, reserve and standing.
- **The screens.**
- **Challenge availability:** whether recovery challenges are always open, given they repeat and the best three count.
- **Runtime throughput:** measured kg per shift at pace 30.
- **Incident duration** under the autonomous agent.
- **Whether production multipliers change shipped kg.**
