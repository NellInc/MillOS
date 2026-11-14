# Instruments and logistics: QC laboratory, trucks and docks, layout planner, process inspection, SCADA

Paths are under `src/` in the snapshot. A runtime claim derived by reading code alone is tagged [Unverified].

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Test batch | `components/ui-new/panels/OverviewPanel.tsx:643-656` | Clicks Test on a released batch; a grade is recorded instantly | rework |
| Place hold | `OverviewPanel.tsx:657-673` | Holds one released batch, which opens an investigation | tune |
| Retest and release | `OverviewPanel.tsx:676-689` | Retests a held batch; a pass releases it and closes the alert | rework |
| Recall (confirmed) | `OverviewPanel.tsx:593-629, 690-701` | Scraps a held batch, irreversibly | keep |
| Trace batch, genealogy balance | `OverviewPanel.tsx:532-544, 632-642, 718-742` | Reads source lots, suppliers, paths and the mass-balance error | keep |
| Supplier contamination response | `systems/UnifiedGameTick.ts:213-226` | Retests or recalls each held batch | rework |
| Dispatch quality interlock | `stores/qcLabStore.ts:155-211`, `UnifiedGameTick.ts:1142-1283` | Nothing to do: the truck waits while dispatch is held | connect |
| Certification status | `qcLabStore.ts:159, 219, 557` | Nothing: it never changes | cut or connect |
| Truck cadence, delay incident, demurrage | `stores/truckScheduleStore.ts:48-64`, `UnifiedGameTick.ts:204-212`, `stores/operationsCampaignStore.ts:1436-1439` | Nothing: waits, and pays 120 an hour on a quality hold | rework |
| Grain receipt | `UnifiedGameTick.ts:1025-1040`, `stores/materialFlowStore.ts:1760-1787` | Nothing: grain goes to the emptiest silo | rework |
| Forklift blocking a truck | `components/TruckBay.tsx:3289-3297` | Drives a forklift into a truck's path, which stops the truck | keep |
| Layout planner | `components/ui-new/widgets/LayoutPlanner.tsx`, `simulation/layoutPlanning.ts:301-479`, `stores/logisticsLayoutStore.ts:453` | Types coordinates, runs the search, applies, undoes, compares, exports | rework |
| Process inspection | `stores/processInspectionStore.ts:52-74`, `widgets/ProcessInspectionCard.tsx` | Views a cutaway; answers two two-choice questions | rework |
| SCADA alarm acknowledge, shelve, suppress, out of service | `components/SCADAPanel.tsx:2046-2117, 2212-2223`, `scada/AlarmManager.ts:547-586` | Acts on an alarm with an identity and a reason | connect |
| SCADA setpoint (mill roll speed) | `components/SCADASetpointControl.tsx`, `scada/tagDatabase.ts:286-302` | Writes an RPM; the reading follows it | rework |
| SCADA trends, events, export, locate | `SCADAPanel.tsx:1822-1830, 1906-1932, 2229-2593` | Reads history; flies the camera to a tag's unit | keep |
| SCADA fault lab | `SCADAPanel.tsx:2759-2818` | Injects one of five faults into RM101 bearing temperature | rework |

## What works

1. **The genealogy is real.** Lots are conserved and mass-weighted into batches (`materialFlowStore.ts:1305-1311`). A trace shows supplier, disposition and path for each lot (`OverviewPanel.tsx:727-739`). The balance readout proves no flour is created or lost (`:532-544`).
2. **The release logic is correct and pinned.** A release needs a pass recorded after the alert. One batch's retest never releases another. A recall scraps only the batch named. Tests: `stores/qcLabStore.alertScope.gameplay.test.ts:78-207`, `qcLabStore.failedBatchDispatch.gameplay.test.ts:55-71`, `qcLabStore.genealogy.test.ts:36-180`.
3. **The alarm model follows real practice.** It has acknowledged, unacknowledged and returned-unacknowledged states, and deadband on return. Shelving, suppressing and taking out of service need a reason and an identity. Timed shelves hold through a pause (`AlarmManager.ts:547-640`). There is a flood monitor at 10 alarms (`SCADAPanel.tsx:1967-1980`). Stopped equipment raises no low alarms (`AlarmManager.ts:236-237`). These are ISA-18.2 ideas, already built.
4. **SCADA reports the true plant.** Tags carry the material ledger, QC holds, recalls and work orders (`store.ts:618-650`, `tagDatabase.ts:1028-1042`), so panel, trends and alarms share one source with the game.
5. **An applied layout is visible.** It moves the forklift routes and pallet staging in 3D (`ForkliftSystem.tsx:1154, 1565`; `truckbay/PalletStaging.tsx:44`). It is saved (`utils/physicalSession.ts:491`) and can be undone. Its before and after measurement states which conditions were held constant (`logisticsLayoutStore.ts:243-270`).
6. **The silo cutaway shows the real fill** (`machines/MachineInspectionInterior.tsx:133-136`).

## Findings

**1. The lab reports a grade it does not measure, and never shows its readings.** High. [Unverified]
- **Evidence.**
  - The grade comes from the batch's stamped plant-quality score (`OverviewPanel.tsx:420`; bands at `:273-278`).
  - Moisture, protein, ash and particle size come from `qcReadingsForLots` (`:425-430`, `chronicle/cropYears.ts:159-186`). Ash and particle size are constants (`cropYears.ts:182-183`).
  - The falling number, and the reading-based grade (`cropYears.ts:179`), are computed and then dropped (`OverviewPanel.tsx:437-456`). `QualityTestResult` has no falling-number field (`qcLabStore.ts:23-39`).
  - No component draws the readings; a grep of `components/` finds only the write at `OverviewPanel.tsx:451`. The batch row reads "Test qc-00001: A" (`qcLabStore.messages.ts:7`).
- **What the player sees.** A letter. A retest returns the same letter, because the stamped score never changes.
- **Teaching (question 1).** The lab teaches nothing about moisture, protein or falling number.
- **Rubric.** 3 and 6.

**2. The lab's pass band and the customer's acceptance band disagree, so bad flour ships unflagged.** High. [Unverified]
- **Evidence.**
  - The lab fails a batch only below 70 (`OverviewPanel.tsx:277`).
  - Recipes need 95, 92 or 90 (`operationsCampaignStore.ts:637, 646, 655`).
  - Machine efficiency alone cannot take quality below 79.5 (`UnifiedGameTick.ts:356-371`).
  - New batches are released by default (`materialFlowStore.ts:1245-1249`).
  - Dispatch credits flour by priority and due date, ignoring batch quality (`operationsCampaignStore.ts:2433-2441`). Flour below the threshold earns full revenue, less 0.08 per kg (`:2452-2463`).
- **What happens.** A batch at 88 grades B, passes, ships to a strong-white order and fails. The consequences:
  - a customer relationship hit (`chronicle/engine.ts:782`);
  - a quarter-point of certifier standing (`chronicle/certifier.ts:17`);
  - a failed "no quality failure" trial (`chronicle/trials.ts:173-186`).
- **No return path.** There is no return, complaint or recall request from the customer.
- **The undrawn decision.** Strong white and community flour share one product, so routing flour by grade is a decision the game never offers.

**3. The supplier-contamination investigation holds the wrong flour.** High. [Unverified]
- **Evidence.**
  - The incident holds every batch already packed (`UnifiedGameTick.ts:215-225`) and takes 10 points off current production (`operationsCampaignStore.ts:756`).
  - The alert names no lots, so batches packed during the incident inherit "released" (`materialFlowStore.ts:1245-1249`) at the penalised quality.
  - A retest of the held, good stock always passes, so the alert clears in one click per batch (`OverviewPanel.tsx:459-475`).
- **Choice quality.** The right answer is never in doubt. Recall is dominated, because it scraps good stock.

**4. QC passes can be farmed for know-how and certifier standing.** High in the Chronicle. [Unverified]
- **Evidence.**
  - Test stays available on a released batch, costs nothing and finishes instantly (`OverviewPanel.tsx:643-656`).
  - Each new pass earns +1 know-how and +8 hundredths of standing, with no cap (`chronicle/engine.ts:214, 735-750`; `certifier.ts:15`).
  - Standing gates the last two eras (`docs/CHRONICLE.md:414-418`).
  - No Chronicle test caps passes; grep of `chronicle/__tests__`.
- **Effect.** Thirteen clicks buy a whole point of standing. A shift with a quality failure costs a quarter of a point.

**5. Trucks set the pace and take no input.** High for engagement. Verified by reading: the store exposes no player action.
- **Evidence.**
  - Arrivals follow a fixed four-step cadence (`truckScheduleStore.ts:48-64`).
  - Each receiving truck tips 15 t into the emptiest silo, whose index decides the grain type (`materialFlowStore.ts:1764-1786`).
  - The shipping truck waits until its load is ready (`TruckBay.tsx:3260-3261`).
  - If a hold lands after loading, the truck leaves empty: "departed without load" (`UnifiedGameTick.ts:1076-1110`).
  - Demurrage is charged only on a quality hold, never while waiting for product (`operationsCampaignStore.ts:1436-1439, 2641-2645`).
  - A shift with no truck is graded F (`docs/CHRONICLE.md:725`).
- **What the player cannot do.** Schedule, prioritise, refuse a lot or dispatch a part-loaded truck. A late truck (`UnifiedGameTick.ts:204-212`) can only be waited out.
- **Answer to question 2.** Scenery that sets the pace. The 20 October ledger found that "the rush choice has no timing risk" because the truck cadence hides it (`_contprompts/millos_polish_ledger_20261020.md:83`). It is still open.

**6. A layout barely changes the running plant.** Medium. [Unverified]
- **The only gameplay effect** is a dock loading-rate factor of 0.25 to 2 on 400 kg per plant second (`layoutPlanning.ts:231-247`, `UnifiedGameTick.ts:1210-1218`). A 5 t load takes 12.5 s at the authored rate, or 50 s at worst.
- **Packing binds first.** [Inference] It runs near 60 kg per plant second. That figure comes from an October play-test that predates the pace rework. So whenever a truck waits for product, packing, not loading, sets the time.
- **What reads its numbers.** The weighted cost, slow-zone visits and travel metres are read by nothing outside the planner; its copy says its weights "never change gameplay" (`LayoutPlanner.messages.ts:63`).
- **Answer to question 3.** A competent site-planning and export tool (SVG, PNG, DXF, JSON) with an honest experiment attached. Its effect on orders, money and grade is near zero.

**7. A SCADA setpoint has no effect and no risk.** Medium. [Unverified]
- **Evidence.**
  - The only writable tags are the four mill roll-speed setpoints (`tagDatabase.ts:286-302`). Their copy says "It does not change throughput" (`SCADASetpointControl.messages.ts:18-22`).
  - The reading follows the setpoint with a lag (`scada/adapters/SimulationAdapter.ts:586-600`) and becomes `metrics.rpm` (`scada/SCADABridge.ts:460-461`).
  - Mill `rpm` is read only for display; outside the packer formula at `productionStore.ts:1176`, nothing in `systems/`, `stores/` or `simulation/` reads it.
  - In simulation mode, SCADA alarms never change machine status (`store.ts:764, 833-837`).
- **Effect.** 0 RPM raises a LOLO alarm, and the mill keeps milling.

**8. Alarm handling never changes a shift, and alarm priority is inflated.** Medium. Verified by reading.
- **Evidence.**
  - Acknowledge, shelve, suppress and out-of-service change only the alarm list and the bell (`store.ts:656-724`).
  - The three dispositions differ only by label; out of service never expires (`AlarmManager.ts:576-586`).
  - Every alarm is HIGH or CRITICAL: every branch overwrites the MEDIUM default (`AlarmManager.ts:242-286`). Priority follows the threshold, not the consequence. That teaches the priority inflation ISA-18.2 warns against.
- **Answer to question 5.** A player can ignore SCADA for a campaign.

**9. The process-inspection quiz cannot be failed and teaches little milling.** Medium. Verified by reading.
- **Evidence.**
  - For every machine, the first answer is always the first button and the second answer always the second (`processInspectionStore.ts:63`).
  - The wrong choices are absurd: "Closed sacks", "Sack colour", "The silo roof" (`ProcessInspectionCard.messages.ts:31, 76, 114`).
  - Nothing is recorded.
  - The mill lesson never mentions differential speed, break and reduction passages, or corrugations. The rolls turn at equal speed (`MachineInspectionInterior.tsx:130-131`).
- **Accuracy (question 4).**
  - Equal-speed rolls and "the sieve decks oscillate" (plansifters gyrate) are doubtful and need a source check.
  - Silo storage, bottom discharge and the packer's hopper and gate are broadly right.

**Joined or island (question 6).**

| Surface | Joined to the main loop? |
|---|---|
| QC | Joined: dispatch interlock; the Chronicle's certifier, know-how and trials. As a decision it is near-dominant. |
| Trucks | Joined: they drive grade and revenue, but take no input. |
| Layout planner | Effectively an island. |
| Process inspection | Island. |
| SCADA | An island for outcomes. It mirrors the plant faithfully, and nothing feeds back. |

**October play-test status.**
- **Fixed.** The setpoint control now exists (`SCADASetpointControl.tsx`; the play-test said there was none at `_contprompts/millos_resolute_fix_20261018.md:452`).
- **Fixed.** Held batches stay listed (`OverviewPanel.tsx:353-362`).
- **Fixed.** Returned-to-normal alarms clear the bell (`scada/alarmBell.ts`).

## Defects

1. **Uncapped QC credit.** Sign a charter, click Test 20 times on one batch, then close the shift; standing should rise about 1.6 points (`chronicle/engine.ts:735-750`). High. [Unverified]
2. **False teaching copy about the falling number.** The history note says "The falling number is one of your laboratory's QC readings" (`chronicle/history.ts:156`). Open it, then test a batch: no falling number appears. High. [Unverified]
3. **False copy about the degraded network.** The note says that during `control_network_degraded` "your SCADA view may be stale or incomplete" (`chronicle/history.ts:276`). The incident adds a 3D marker (`OperationalWorldSignals.tsx:92-97, 322`) and campaign multipliers (`operationsCampaignStore.ts:797-813`). Nothing in `scada/` reads it. The agent's "uncertain" note (`agent/adapters/runtime/runtimeProjection.ts:49-57`) is about live mode, not the incident. Trigger the incident, open SCADA: the tags should read GOOD. Medium. [Unverified]
4. **Helper text breaks D-012 `[Nell]`.** All of these keys are rendered:
   - planner subtitle and notes (`LayoutPlanner.messages.ts:49, 63, 87, 97, 104, 116, 121, 128, 139`);
   - setpoint helper (`SCADASetpointControl.tsx:224-226`);
   - fault-lab banner (`SCADAPanel.messages.ts:342`).

   Fix by cutting them. Medium. Verified.
5. **Unreachable certification state.** "Certification expired" can never occur: nothing outside a test sets it (`qcLabStore.ts:557`; `logisticsLayoutStore.conditions.gameplay.test.ts:92`), and `certificationExpiry` is never read (`:219`). Low. Verified by grep.
6. **Player actions logged as the AI.** Every player QC action is logged as "Autonomous QC controller" (`OverviewPanel.tsx:435, 442, 469, 494, 503, 663`). That misattributes authorship in a game about bilateral work. Low. Verified.
7. **Grain silently dropped at receipt.** Grain beyond the emptiest silo's space vanishes without notice (`materialFlowStore.ts:1785-1787`). Fill the wheat silos above 35 t and wait for a delivery. Low. [Unverified]

Count: 2 high, 2 medium, 3 low.

## Proposals

**1. Make the lab measure and show, beside the order's limit.** S–M. Safe.
- **What changes.**
  - Add `fallingNumber` to `QualityTestResult`.
  - Pass the readings through `runConformingTest` (`OverviewPanel.tsx:437-456`).
  - Draw moisture, protein, falling number and quality on the batch row, each beside the limit of the order the batch would serve. A reading next to its limit is layout, not helper text.
  - Grade on the worse of the reading-based grade (`cropYears.ts:179`) and the plant-quality grade, with FAIL set at the order's `minimumQuality`.
- **Why.** It teaches baker's measures by consequence, and fixes findings 1 and 2 and defect 2.
- **Measure.** A new test: a batch at 93 for a strong-white order fails and is held. A play-tester can say why.
- **Old contract.**
  - saved `testHistory`: optional field plus a fixture;
  - Chronicle `seenQcTestIds` (`chronicleStore.ts:205`);
  - SCADA quality tags (`tagDatabase.ts:1037-1039`);
  - pt-BR.

**2. Cap QC credit and scope the supplier incident to lots.** S. Safe.
- **What changes.**
  - In `creditShift` (`chronicle/engine.ts:733-737`), credit at most one pass per batch per shift.
  - Have the supplier incident (`UnifiedGameTick.ts:215-225`) name the affected receiving lots as `sourceLotIds`, so later batches form on hold.
- **Unverified.** A lot-scoped alert blocks all dispatch while it is open (`qcLabStore.ts:171-175`). Later batches inherit the hold without joining `alert.batchIds`. Confirm that closing the alert releases them, through `setLotDisposition`, before shipping.
- **Measure.** A steward test: 20 tests of one batch add 8 hundredths. A batch packed during the incident is held.
- **Old contract.** Saved open alerts without lots; `steward.test.ts`; the `alertScope` tests.

**3. Batches await test; the bench is a resource.** M. Needs the owner.
- **What changes.**
  - New batches form as `pending`; dispatch loads only released stock.
  - A test takes game time: advance `currentTest.progress`, declared and never used (`qcLabStore.ts:74`).
  - Allow one test in flight, charging bench occupancy rather than a person's time (D-008, D-058).
- **Why.** Testing becomes a trade-off between throughput and assurance.
- **Measure.** A pending case in `qcLabStore.dispatch.gameplay.test.ts`. `playableJourney` still delivers on time.
- **Old contract.**
  - the `MaterialDisposition` union;
  - a save migration treating existing batches as released, plus a fixture;
  - the first-delivery guide;
  - `playableJourney` tests;
  - agent quality capabilities (`agent/registry/systemRegistrySource.js:259`);
  - benchmark inertness: auto-release without a charter.

**4. Intake sampling at the receiving dock.** M. Needs the owner.
- **What changes.**
  - When a receiving truck docks (`UnifiedGameTick.ts:1027`), show the lot's stamped moisture, protein and falling number.
  - The player accepts it into a named silo, accepts it for blending, or refuses it at a fee, with a seeded consequence on the next delivery.
  - Reuse the crop treatment costs (`cropYears.ts:189`).
- **Why.** Real intake labs work this way. It gives the receiving dock a decision and teaches the falling number by consequence.
- **Measure.** A play-tester refuses a sprouted lot and keeps the next order's grade.
- **Old contract.**
  - `receiveGrainDelivery` signature;
  - the seeded RNG;
  - arrival fixtures;
  - inert without a charter.

**5. Give the shipping dock two levers: dispatch now, and load by grade.** M. Needs the owner.
- **What changes.**
  - Add a "Dispatch now" control for a truck that is held or loading.
  - In load selection (`shipFinishedGoods` and `getFinishedGoodsAvailability`), load only batches that meet the active order's `minimumQuality`, so the two flours compete for stock.
  - Charge demurrage while a truck waits for product as well, but never on the no-commitment hold, which the player cannot clear.
- **Why.** The rush choice gains timing risk.
- **Measure.** `playableJourney` still on time at standard pace. A new test: flour at 93 does not load for strong white.
- **Old contract.** `batchCreditKey`; demurrage in shift reports; Chronicle tallies.

**6. Wire SCADA to the network incident and author alarm priorities.** S–M. Safe as scoped.
- **What changes.**
  - While `control_network_degraded` is unmitigated, `SimulationAdapter` serves a seeded subset of tags as UNCERTAIN and stale.
  - Give each tag a priority by consequence, so most alarms read LOW or MEDIUM.
  - The cost of an alarm out of service stays inside the SCADA list and bell; the PA (D-054) and the strobes and pager agreed in D-058 are untouched.
- **Why.** Stale data and alarm rationalisation get taught through play, and defect 3 becomes true.
- **Measure.** A SCADA test: tags go UNCERTAIN during the incident. The priority mix reads mostly LOW and MEDIUM.
- **Old contract.**
  - persisted dispositions;
  - agent commands `scada.acknowledge-alarm` and `scada.write-setpoint`;
  - benchmarks.

**7. Make roll speed matter, or remove the control.** M. Needs the owner.
- **The ask.** Let the mill speed setpoint move mill throughput, wear and quality within a band.
- **Not traced.** Where the mill rate is set (`deriveLineSetpoint`, `operationsCampaignStore.ts:1000`, and `materialTransport`).
- **Old contract.**
  - `millos-scada-setpoints`;
  - benchmarks: keep today's value as the default.

**8. Rewrite the inspection lessons around the live cutaway.** S. Safe.
- **What changes.**
  - Shuffle the correct answer's position, seeded per subject.
  - Ask what the cutaway shows: which roll runs faster, where a deck sends its overs, the silo's fill.
  - Record completion as know-how.
  - Source-check every fact.
- **Measure.** An answer-position test; a source list for each fact.
- **Old contract.** Both catalogues; `HenhouseInspection.tsx` stage poses.

## Needs the owner

1. **Should one held batch stop every truck?**
   - Place hold routes one batch through an investigation, and any open investigation holding stock stops all dispatch. This is commented at `qcLabStore.ts:163-166` and pinned by `alertScope` test `:207`, so it is designed.
   - It makes Place hold a plant-wide stop with demurrage, with the outcome of the retest never in doubt.
   - Recommendation: a hold on a single batch should isolate that batch by mass, as non-investigation holds already do (`:180-182`).
2. **Should trucks take input?** D-060 fixes the dock rate "so delivery deadlines are unchanged". Recommendation: keep the rate, and add proposals 4 and 5.
3. **Should a SCADA setpoint change production?** Recommendation: roll speed only, within a band. Otherwise remove the control.
4. **What is the planner for?**
   - Recommendation: keep it as an optional engineering tool, and cut its notes (defect 4).
   - Its `tripsPerHour` assumption counts forklift trips (it multiplies route length). It could be fed from the store's completed unloads (`ForkliftSystem.tsx:2259`).
5. **Certification.** Connect it (to proposal 3 audits or the Chronicle certifier) or cut it.

**Best candidate for hands-on play (question 7).** The QC lab, with intake sampling (proposals 1–4). The lots, crop stamps, bench technician, release logic, interlocks and Chronicle readers all exist. What is missing is the readings on screen, a cost per test, and the customer's limit beside the result.

## Not reviewed

- **Partly read:**
  - `simulation/forkliftCargoStations.ts` (only as D-060 describes it);
  - the `LayoutPlanner.tsx` body beyond its copy and wiring;
  - `layoutPlanningExport.ts`;
  - the SCADA overview, trends, events and settings tabs (`SCADAPanel.tsx:1227-1724, 2229-2757, 2822-3286`);
  - most of `scada/useSCADA.ts` and `SimulationAdapter.ts`;
  - the pose feed (`machines/CompactMachines.tsx:924, 2116`);
  - `truckbay/truckController.ts` beyond its service phases.
- **Not traced:**
  - whether a fault-lab spike on `RM101.TT001.PV` (hard-coded at `SCADAPanel.tsx:2776-2781`) reaches the mill's temperature and holds a warning (`UnifiedGameTick.ts:691`), against its "telemetry only" banner;
  - where the mill rate is set (proposal 7).
- **Not run.** Nothing was run. The packer-flow figure behind finding 6 is the least certain.
