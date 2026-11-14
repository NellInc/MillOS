# Operations campaign and the shift

All paths are under `src/` in the snapshot unless they say otherwise. Every file reviewed here ships (`reachability.txt`: all `alive`). Nothing was run.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Guided first programme (3 fixed orders: 6,000 / 4,000 / 8,000 kg, due at 240 / 360 / 480 min) | `stores/operationsCampaignStore.ts:886` | Watches | tune |
| Choosing the active commitment | `components/ui-new/onboarding/PlayableShift.tsx:987`, store `:2032` | Picks a customer from a select | rework |
| Accepting the next programme | store `:1948`, `PlayableShift.tsx:968,1453` | Presses one button when every order is done | tune |
| Rush order (2,500 kg, +30% pay, due in 125 min, double late penalty) | `simulation/programmes.ts:42,73`, card `PlayableShift.tsx:1025` | Leaves it first, or defers it | rework |
| Recipes (strong white 95, community 92, fine corn semolina 90) | store `:629` | Nothing direct: the order picks the recipe | rework |
| Line setpoint and pre-staging | store `:1000`, `:2877` | Nothing (automatic) | keep |
| Constraints / "Blocked" and "Attention" lines | store `:1498`, card `:1051` | Reads them | tune |
| Next-action button | `simulation/operationsPlay.ts:220`, card `:952` | Presses it (mostly navigation) | keep |
| Incident lifecycle (acknowledge, mitigate, resolve or restore) | store `:2174-2315`, `operationsPlay.ts:243-274` | Presses up to three buttons in a fixed order | rework |
| Recovery challenges (power, packaging, network) | `operationsPlay.ts:22`, store `:1879`, card `:1196` | Starts one, responds, abandons | rework |
| Failure-cost rates (late, work orders, demurrage) | store `:2639`, card `:1060` | Reads them | keep |
| Economics ledger | store `:2462-2680` | Nothing | connect |
| Utility vessels (fuel oil, process oil, diesel, LPG) | store `:2551`, `SCADAPanel.tsx:517` | Reads levels in SCADA | cut or connect |
| Shift grade | `simulation/shiftReview.ts:233` | Earns it | tune |
| Shift debrief and provisional report | `PlayableShift.tsx:1260,1374`, store `:1742,1855` | Reads it | keep |
| Decisions log (operator vs agent vs controller) | store `:3073`, `:1790` | Passive | keep |
| 3D incident beacons | `components/OperationalWorldSignals.tsx:33,120` | Clicks to focus the response | keep |
| Daily bag target (1,200 bags) | `components/ui-new/panels/OverviewPanel.tsx:873` | Reads it | connect or cut |
| Multi-objective dashboard (Y key) | `components/ui/MultiObjectiveDashboard.tsx:63` | Toggles it | connect or cut |
| Plant readiness index | `simulation/plantReadiness.ts:6` | Reads it (phone, Autonomy) | rework as OEE |

Not campaign mechanics: `components/ui/CostEstimationOverlay.tsx` (AI API spend), `components/ui/IncidentHistoryPanel.tsx` (reads `safetyStore`), `stores/incidentReplayStore.ts` (diagnostic frame recorder).

## What works

1. **Credit only from real departures.** Orders are credited only from sealed, released batches on a departed shipping manifest, never beyond a batch's own mass and never twice across reloads (store `:2374-2499`). Pinned by `operationsCampaignStore.test.ts:178`, `:377`, `:508` and `:914`. The ledger is honest.
2. **The shift review is causal.** Per-order outcomes, the binding reason, the gap to the next letter and one next step, in both languages, persisted and announced once; idle windows get no letter (`review.test.ts:117`, `shiftReview.nothingDue.pass14.test.ts:51`). The October gap is closed.
3. **Live cost rates.** The card prices each failure per game hour from the formula that books it (store `:2639-2661`; `operationsCampaignStore.test.ts:598`).
4. **Choices are separated from narration** in the review (`review.test.ts:322-357`): the right raw material for reflection.
5. **3D beacons.** Each live incident has a phase-coloured beacon beside its asset; a click focuses the response (`OperationalWorldSignals.tsx:120-131`). Programmes are deterministic and pinned feasible (`programmes.test.ts:104`).

## Findings

**1. The plant plays itself. No operator verb in this layer can improve an outcome.** (high, Verified by tests)
With no input, every order ships on time; programmes 2 to 4 and the night programme each finish with 20+ game minutes to spare (`playableJourney.test.ts:650-651`, `:716-750`, `:794-807`). The 20 Oct ledger: "24/24 orders seen, 22 fulfilled, 0 late" (`millos_polish_ledger_20261020.md:292`). The only obligatory verb is "Accept next programme"; every other verb (switch customer, defer the rush, start a challenge) can only equal or worsen the result. Rubric 1, 3, 5.

**2. The one named choice has a dominant answer, and two of the three recipes are the same product.** (high; rush Verified, flour swap [Unverified])
- The card presents the rush as a choice. The tests prove that deferring it is always at least 20 minutes late, at double penalty, for no gain (`playableJourney.test.ts:759-792`). A changeover cost that could ever make deferral worthwhile was considered and declined as "a new mechanic" (`millos_polish_ledger_20261020.md:106`).
- Strong white and community flour are both `wheat_grain` to `flour` (store `:629-656`). The line knows only grain and product (`systems/UnifiedGameTick.ts:994-1003`), and dispatch credits flour to the highest-priority open flour order whichever one is selected (store `:2430-2441`).
- So switching between the two flour customers changes no physical production. Flour made while "community flour" is selected can be credited to the strong-white order, judged against 95 instead of 92, and fail.
- The card says "Changing customer changes the scheduled recipe" (`PlayableShift.messages.ts:118`). Rubric 3.

**3. Incidents are a button sequence, not a decision.** (high, Verified)
Acknowledging changes only the record; mitigating is free and halves every penalty (store `:1280`); restoring is free once applied. No alternatives, no trade; the challenge test responds instantly and wins (`playableJourney.test.ts:403-422`). Datalinks says "Read the response's consequence before choosing it" (`stores/knowledgeStore.messages.ts:97`): there is nothing to choose. Rubric 3, 6.

**4. Off-spec flour pays in full and fulfils the order.** (high for teaching; code Verified, runtime [Unverified])
- Shipped kg and revenue are booked before the quality check. A failed kg then adds £0.08, about 10% of the £0.82 price (store `:2446-2465`). The money signal says ship it; the grade says F.
- Nothing compares a batch with the recipe minimum before a truck loads. `getDispatchQualityStatus` has no recipe check (`stores/qcLabStore.ts:155-211`), and `minimumQuality` is read only at store `:2456` and in the guide (`components/ui-new/onboarding/deliveryJourney.ts:128`).
- The review's advice "check the recipe quality target in Overview" (`simulation/shiftReview.messages.ts:120`) points at nothing: Overview shows no recipe target.
- A real mill does not get paid for a non-conforming load: it is rejected. Rubric 2, 6.

**5. Supplier contamination holds old stock and lets the flagged supply keep shipping.** (medium-high, [Unverified])
- The incident's description says a source-lot notice "requires an immediate hold and traceability review" (`operationsCampaignStore.messages.ts:24`). The consequence passes `batchIds` only, never `sourceLotIds` (`UnifiedGameTick.ts:214-225`).
- New flour milled from the same lots is not held. Once mitigated, dispatch isolation lifts (store `:1284`).
- While the incident is raised, quality is 99.5 minus 10, so at most 89.5 (`UnifiedGameTick.ts:357`, `:810-815`; store `:756`). Batches packed then fail all three recipes, are not on the alert, and ship after it closes. That is an F from an incident the player handled correctly.
- Reachable only with a charter (`chronicle/eventDeck.ts:406`). Rubric 6, 8.

**6. Money is a score, not a resource.** (medium, Verified)
- There is no cash balance, no bankruptcy, no grain cost and no wages. Workplace "credits" are a separate currency (`PlayableShift.messages.ts:108`).
- Energy plus automation is about £83 per game hour by day: site demand 340-395 kW (`MultiObjectiveDashboard.tsx:57-60`) at £0.15 (store `:2624-2628`) plus £28 (`:2628`). One truck of strong white earns £4,100.
- Margin goes negative only when nothing ships, so the margin gate on A and B almost never binds. The status `'cancelled'` is never assigned anywhere: orders cannot be refused, cancelled or negotiated.
- Desktop shows a running total only in the Chronicle ledger (`components/chronicle/LedgerTab.tsx:68`); the phone shows revenue (`components/mobile/MobilePanel.tsx:495`). Rubric 2, 3.

**7. Graded down by the clock.** (medium, [Unverified])
"Commitment due soon" is a warning constraint (store `:1552-1566`), and every non-info constraint counts as a carried risk (`:1661`; `shiftReview.ts:208`). An order that is on schedule but due within 90 minutes after the close costs the A. The advice it produces, "clear 'Commitment due soon' before the shift closes" (`shiftReview.messages.ts:127`), cannot be acted on. Rubric 4.

**8. Recovery challenges are hidden, often blocked, and reward nothing.** (medium, Verified)
- They sit inside an "Adjust the challenge" disclosure (card `:1196`). Start is blocked whenever any incident is open, the route is planning, feed is empty, the order is packed or quality is held (`operationsPlay.ts:151-173`). At standard pace much of a shift is "packed, awaiting truck".
- Penalties apply only until "Restore challenge controller" (`operationsPlay.ts:35`), one tick after mitigation, so a run reduces to shipping 1,000 kg in 360 minutes, which the plant does anyway.
- The reward is a status line and a Chronicle medal (`chronicle/engine.ts:1114`). The risk is a D cap if the player leaves it open.
- The copy calls it an "effect-only controller scenario" (`operationsPlay.messages.ts:37`), a meta frame rather than a diegetic one.

**9. Incident reachability.** (medium, Verified by grep)
- `triggerIncident` is called only by `startChallenge` (store `:1884`) and the Chronicle (`stores/chronicleStore.ts:142`).
- Without a charter, the only incidents are the three challenge kinds, all self-started.
- With a charter: severe rain, power sag, dust filter and delayed truck (`chronicle/forecasts.ts`), plus supplier contamination and packaging shortage (`chronicle/eventDeck.ts`).
- `bearing_overheat` is raised by nothing. Its definition, beacon, alert copy and consequence handler (`UnifiedGameTick.ts:176`) are dead content. Only tests raise it (`review.test.ts:137`).

**10. Utilities are decorative.** (low-medium, Verified by arithmetic)
- Fuel oil falls from 72% to its 30% reorder level at about 6.7 L/h (store `:2558`). That is ~2,270 game hours, about 76 real hours at pace 30. Process oil takes ~4,400 h; diesel at 0.15 L/h takes ~122,000 h.
- Nothing reads a level except SCADA's display. Empty vessels stop nothing, and no warning ever fires in play.
- Fuel oil burn is tied to electrical kW, which a grid-fed mill does not do. Water (tempering) and power supply are not modelled as stock. Rubric 6, 7.

**11. Competing goals on the same screen.** (low-medium)
- Overview shows a daily 1,200-bag target that counts packed bags whether or not they are owed (`OverviewPanel.tsx:873`). The line's 70% stock-build with no order also counts (store `:597`).
- The multi-objective dashboard's 250 kW energy target sits below its own nominal 340-395 kW (`MultiObjectiveDashboard.tsx:57-61`), and its 98 quality target matches no recipe.
- Neither reads orders, margin or the grade.

**12. Helper text against D-012 ([Nell]).** (medium, Verified)
Captions under controls: `switchHint`, `campaignOptIn`, `acceptNextHint`, `challengeRules`, `provisionalNote`, and the multi-sentence `consequence` under every Next button (`PlayableShift.messages.ts:118,156,186,159,174`; `operationsPlay.messages.ts:27-59`). Challenge blocked-reasons are arguably error text.

### Direct answers

- **Q1 Orders.** Three fixed orders, then programmes of three (rush, standard, bulk) from the same three customers, the rush rotating by programme number (`programmes.ts:73-125`). One programme at a time, accepted only when all are done (store `:1950-1954`). No refusing, negotiating or reordering dispatch (credit follows priority then due time, `:2437-2441`). Tension exists only on paper.
- **Q2 Recipes.** A grain change costs only line-fill time (`playableJourney.test.ts:703-705`). Customers dictate recipes, so there is no choice and none dominates.
- **Q3 Utilities.** Feed can run empty (critical constraint, store `:1531-1546`); the remedy is waiting for the automatic receiving truck (`UnifiedGameTick.ts:1025-1039`). Vessels never run low (finding 10).
- **Q4/Q5.** Findings 3, 5, 8 and 9; effects at store `:671-815`. A delayed truck adds 45 minutes and an unexplained 8% production cut (`:736`); mitigation halves the cut, but the delay stays (`UnifiedGameTick.ts:204-212`). Challenges are winnable at standard pace (`playableJourney.test.ts:403-422`).
- **Q6 Economics.** Revenue is credited kg × price (rush +30%). Costs: energy £0.15 or £0.08 per kWh; automation £28/h; waste £0.18/kg; maintenance £90 per work-order hour; demurrage £120/h; late per kg-hour; quality £0.08/kg, booked as a late penalty. No wages, no bankruptcy.
- **Q7 The grade (exact).** No letter if (commitment minutes ≤ 0 and dispatched ≤ 0), or if (nothing fell due by close, commitment minutes > 0, dispatched ≤ 0, quality-failed ≤ 0 and no late deliveries) (`shiftReview.ts:184-205,233-234`). Otherwise, with issues = carried risks + late deliveries in the window:
  - **A:** dispatched > 0, issues 0, margin ≥ 0, and kg ≥ ⌈500 × commitment hours⌉
  - **B:** issues ≤ 1, margin ≥ 0, and kg ≥ ⌈312.5 × commitment hours⌉
  - **C:** issues ≤ 2
  - **D:** dispatched > 0
  - **F:** anything else

  Caps: any quality-failed kg gives F; any unresolved high or critical incident at close gives no better than D (`:214-239`). Risks are every non-info constraint at close (storage ≥ 85%, empty feed, the earliest open order overdue or due within 90 min, dispatch isolated, any open work order), plus each other overdue order (store `:1656-1698`).

  `docs/CHRONICLE.md:725` ("a shift with no truck is graded F") is stale. No truck gives F only when something fell due by the close (`shiftReview.nothingDue.pass14.test.ts:51,55`).

  F outside the player's control: finding 5, and a Chronicle wet year on strong white unless treated (`chronicle/__tests__/modules.test.ts:95`, Chronicle design). A grade unlocks nothing outside the Chronicle, where it feeds know-how, trial goals and the governance tally (`chronicle/engine.ts:734-735`, `:2852`; `chronicle/trials.ts:325`).
- **Q8 Review.** Yes on all three: fires on the boundary tick, pinned in both languages (`playableJourney.test.ts:190-210`), persisted (store `:2966`), reworded on a language switch; Reset to 10 AM folds the cut window (`playtest.test.ts:117`).
- **Q9 Second trip.** Visible in the guide ("At least N loads needed (up to 5,000 kg each); X kg still to ship", plus next-truck ETA, `deliveryJourney.ts:86-109`), but only at ready-to-load, loading and departed (`:200-244`), never while milling and never on the shift card (`PlayableShift.tsx:1041-1050`). The October "stuck on Inspect the line" item is fixed.
- **Q10 Teaching.** Named: due dates, late penalties, demurrage, quality hold, traceability, work orders. Only in copy: changeover (rush line), bottlenecks (Datalinks). Implied, never named: the truck yard as the bottleneck (`programmes.ts:31-35`, a code comment), earliest-due dispatching, WIP pre-staging. Absent: cost per kg and OEE; the readiness index averages efficiency, uptime and quality (`plantReadiness.ts:11`) where OEE multiplies them.

**Doubtful facts.**
- "Community Pasta Works" buys corn semolina. Pasta is normally durum-wheat semolina.
- Quality, an abstract score, is shown as "%" (`OverviewPanel.tsx:862-867`).
- An energy cost near £0.088/kg (`docs/CHRONICLE.md:715`) implies roughly 590 kWh/t at £0.15. Published flour-milling figures are usually tens of kWh per tonne [Unverified; needs a source check].

## Defects

1. **Contamination does not hold source lots** (medium). `UnifiedGameTick.ts:214-225`. To reproduce: sign a charter, take the supplier event, mitigate, close the QC alert, then watch new batches ship.
2. **Off-spec loads earn revenue and count toward fulfilment** (medium). Store `:2446-2465`. To reproduce: ship flour stamped below 95 against strong white.
3. **`tryQuality` points to a recipe target Overview does not show** (low-medium). `shiftReview.messages.ts:120`.
4. **D-012 helper text on the shift card** (medium). Finding 12.
5. **Card and debrief disagree on a programme with an incident open** (low-medium, [Unverified]). The card hides its programme step (`operationsPlay.ts:282`) while the debrief and store accept (`PlayableShift.tsx:1378,1455`; store `:1950`); the card then says "Check remaining incident effects in SCADA" though the restore is in the Chronicle workspace (`ChronicleOverview.tsx:294-300`).
6. **`bearing_overheat` unreachable** (low). Finding 9.
7. **Delayed truck cuts production 8% for no cause; mitigation cannot touch the delay** (low). Store `:736`; `UnifiedGameTick.ts:204-212`.
8. **Stale text** (low). `docs/CHRONICLE.md:725`; `operationsPlay.ts:17` ("two real minutes": 360 game min at pace 30 is 12).
9. **Energy target below nominal demand** (low). `MultiObjectiveDashboard.tsx:61`.
10. **`'cancelled'` is never set**; every check of it is dead (low).

## Proposals

1. **Hold non-conforming stock at the dock; let it go to a lower spec.** (M; needs owner, because it changes what a quality failure is)
   - **What changes:** add a `nonConformingForOrder` block code. In the loader (`UnifiedGameTick.ts:1142-1229`), batches whose `qualityScore` is below the receiving order's `minimumQuality` are not loaded for that order. In `tickCampaign` allocation (store `:2430-2441`), off-spec flour skips strong white and may fill community flour (92).
   - **Why:** it teaches a quality hold by play, and it makes strong white and community flour genuinely different. The truck waits, demurrage ticks, and the player chooses: test and recall, or redirect.
   - **How we would know:** a gameplay test in which 93-quality flour fills the school order, never the bakery order; play-testers see a held truck with a reason.
   - **Old contract:** the `DispatchBlockCode` type and `dispatchBlockText` fallback; both catalogues; `agent/query/queryService.js:501`; `review.test.ts:182-191` (pins F via `averageQuality`); the Chronicle's `qualityFailureKg` reads.
2. **Drop "due soon" from carried risks.** (S; safe)
   - **What changes:** exclude `constraintDueSoonLabel` in `riskEvidence` (store `:1656`).
   - **How we would know:** a new test in which an on-schedule order due 30 minutes after the close still allows an A.
   - **Old contract:** saved reports keep their stored `gradeBasis` and letter.
3. **Contamination holds its lots.** (S; safe)
   - **What changes:** pass the `sourceLotIds` of lots in the silos at trigger time (`UnifiedGameTick.ts:215`).
   - **Why:** it teaches one-up/one-down traceability.
   - **How we would know:** a test in which batches packed from held lots stay on hold until the alert is released or recalled.
   - **Old contract:** the QC alert persistence; the Chronicle restore path. Recall still gives a way out (CLAUDE.md Chronicle rule 4).
4. **A changeover cost that makes the rush a real trade.** (M; needs owner, since the 20 Oct ledger declined it)
   - **What changes:** a grain change costs a deterministic flush (a few hundred kg to waste, via `wasteCost`), so some programmes favour deferral: two changeovers against one late truck, varying by programme number.
   - **How we would know:** `playableJourney` cases in which deferral wins in one programme and loses in another.
   - **Old contract:** the feasibility pin `programmes.test.ts:104`.
5. **Two responses per incident, each with a cost.** (M-L; needs owner)
   - **What changes:** e.g. power sag: shed one mill (−25% output) or ride through (quality penalty, extra wear); contamination: recall now or test first. Each is a keyed store action booked to existing economics; acknowledge folds in.
   - **How we would know:** a test proving neither response dominates across the programmes.
   - **Old contract:** the agent `mitigateIncident` handler and registry (`runtimeCommandHandlers.ts:227`, `systemRegistrySource.js:296`); `ChronicleOverview` buttons; the AI-partner thresholds (`chronicle/governance.ts:904-906`).
6. **Name OEE and cost per kg in the review.** (S-M; safe)
   - **What changes:** compute availability × performance × quality-conforming share from recorded evidence, and margin ÷ dispatched kg, as two reason lines in `shiftGradeReasons`. Replace the averaged readiness index (`plantReadiness.ts`).
   - **How we would know:** a pinned review line in both languages.
   - **Old contract:** the Autonomy and phone readiness labels; Datalinks entry; source-check the energy rate.
7. **Cut D-012 captions from the shift card.** (S; safe, it applies a [Nell] rule)
   - **What changes:** remove the hint keys listed in finding 12 from both catalogues, and keep only error text on an inert press.
   - **How we would know:** the card screenshot shows no caption under any control.
8. **Wire `bearing_overheat` to an ignored R.M. 101 wear warning, or delete it.** (S-M; safe) It joins maintenance to the campaign; test that ignoring the warning raises it.
   - **What changes:** either a static display, or deliveries the player books, with a stop at empty.

## Needs the owner

1. **Is the operations layer meant to be watched or played?** Today the controller makes every call well, and the Chronicle and cooperative carry the decisions. Recommendation: keep the automation as the default, but give each programme one or two decisions that genuinely trade off (proposals 1, 4 and 5).
2. **Quality failure: rejected load, or paid with a penalty?** Recommendation: reject or redirect (proposal 1). The current rule teaches that shipping off-spec pays.
3. **Should money constrain anything?** Recommendation: no bankruptcy, but show cost per kg and make penalties a real fraction of revenue.
4. **The declined changeover cost (20 Oct ledger, line 106).** Recommendation: adopt it, deterministic and small.
5. **D-012 and the consequence paragraph under the Next button.** Is it allowed consequence text or helper text? Recommendation: keep at most one clause.
6. **Utilities.** Static display, or player-booked deliveries with a stop at empty? Recommendation: static until a decision needs them.
7. **Customer and recipe naming.** Recommendation: rename the corn-semolina customer away from pasta, or source-check corn pasta first.

## Not reviewed

- `OverviewPanel.tsx:1-780`: traceability, genealogy, maintenance and QC sections, which belong to other areas.
- `FirstDeliveryJourney` (`PlayableShift.tsx:184-700`), read only through `deliveryJourney.ts`.
- Most of the pass-numbered campaign test files: only their test names were read.
- Agent handlers beyond the call sites.
- Runtime behaviour: nothing was run, so every runtime claim not pinned by a test is [Unverified].
