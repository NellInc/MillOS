# Plant core loop and time model

All paths are under `src/` in the snapshot unless they say otherwise. Figures derived by reading, without a run, carry `[Unverified]`.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Pace (pause, 1/2x, 1x, 2x, 4x) | `components/ui-new/panels/OverviewPanel.tsx:117-140`, `hooks/useKeyboardShortcuts.ts:327-357` (P) | Compresses time. No effect on the plant, by design | keep |
| Line rate 0-200% | `components/ui-new/panels/SettingsPanel.tsx:233-263`, `+`/`-` keys `useKeyboardShortcuts.ts:488-515` | Scales every processing rate, belt and spout | rework |
| Automatic line setpoint 84-108% | `stores/operationsCampaignStore.ts:1000-1011` | Nothing. The controller sets it from order priority | connect |
| Maintain (routine service) | `components/ui-new/sidebar/MachineInspector.tsx:250-327` | Spends 1 part to cut wear by 30-50 | rework |
| Schedule / Complete a predicted service | `components/ui/PredictiveMaintenancePanel.tsx:187-203, 531-557` | Books a service, then completes it | rework |
| Repair work order (start, verify, restart) | `PredictiveMaintenancePanel.tsx:415-470`, `stores/breakdownStore.ts:587-816` | Three presses, gated on parts | keep |
| Restart unit | `MachineInspector.tsx:356-458` | Clears a thermal trip or an idle unit | keep |
| Parts stock and restock | `breakdownStore.ts:161-167, 1008-1013`, `systems/UnifiedGameTick.ts:1038` | Nothing. Each grain truck adds 2 of every part | tune |
| Wear warnings and predictions | `UnifiedGameTick.ts:859-896`, `breakdownStore.ts:875-943` | Reads the bell, then Open repair | tune |
| Daily bag target and milestones | `stores/productionStore.ts:78`, `components/ProductionTargetWidget.tsx:70-123`, `UnifiedGameTick.ts:912-933` | Watches a 30 t/day bar | rework |
| Throughput and line-state chips | `components/ui-new/hud/StatusHUD.tsx:94-109, 421-425` | Reads them | keep |
| Machine flow state (starved, blocked) | `simulation/machineMotion.ts:39-62`, `MachineInspector.tsx:133-145` | Reads it in the Inspector | keep |
| Energy dashboard and tariff | `components/ui/EnergyDashboard.tsx:95-166`, `utils/energyCalculations.ts:245-253`, `stores/operationsCampaignStore.ts:2620-2627` | Reads it (AI settings or U) | connect |
| Weather buttons | `components/ui-new/panels/SafetyPanel.tsx:433-454` | Sets the sky freely | cut or move |
| Grain receiving | `UnifiedGameTick.ts:1025-1040`, `stores/materialFlowStore.ts:1760-1830` | Nothing | connect |
| Shipping load and holds | `UnifiedGameTick.ts:1042-1284` | Nothing; the trucks run themselves | keep (campaign's) |
| Clock holds (10 holders) | `stores/gameSimulationStore.ts:138-158, 485-548` | P, pace buttons, and holds from other features | tune |

## What works

1. **One time model.** `simulation/pace.ts:20-58` makes plant time a fixed fraction of game time.
   - **Plant seconds:** material flow (`UnifiedGameTick.ts:643, 994-1005`), bagging (`:1014`), loading (`:1210-1218`) and truck motion (`components/truckbay/truckClock.ts:52-77`).
   - **Game seconds or minutes:** the clock, truck arrivals (`UnifiedGameTick.ts:972`), wear (`:750-753`), repair downtime (`:701`) and the campaign (`:1318`), including energy cost (`:1309-1327` into `operationsCampaignStore.ts:2624-2627`).
   - **Pinned:** `UnifiedGameTick.playableJourney.test.ts:658-673` puts the whole guided programme on time at all four offered paces, with real truck travel, within 6 game minutes of standard. None of the offered paces fails. This is pinned at line rate 1.0 (Defect 9).
   - The October two-clocks fault is fixed.
2. **The idle gap between orders is gone.** The line pre-stages the next commitment (`operationsCampaignStore.ts:2877-2928`). `playableJourney.test.ts:678-710` asserts fewer than 80 idle ticks with open work. Its comment gives 63, against 425 before pre-staging.
3. **Honest machine states.** Starved, blocked, stopped and faulted come from the same feed judgement that sets load and energy (`machineMotion.ts:28-62`, `machineLoad.ts:46-91`). The Inspector shows why a unit is idle.
4. **The repair loop is legible and recoverable.** A breakdown opens a work order with named parts. Every grain truck restocks parts (`UnifiedGameTick.ts:1038`), so `awaiting_parts` always clears; no breakdown is a dead end. The guide turns to the repair (`components/ui-new/onboarding/deliveryJourney.ts:147-156`). Repair time holds under pause and scales with pace (`UnifiedGameTick.maintenance.test.ts:83`).
5. **Holds are named.** Each hold names its holder (`simulation/pace.messages.ts:16-28`). The persisted pace is the pace underneath any pause (D-049, `gameSimulationStore.ts:419-426`).

## Findings

### 1. An ordinary ten minutes is spent watching (high, [Unverified]; Verbs, Pacing)
Ten real minutes at 1x is 5 game hours (`pace.ts:20`; 1 game hour is 2 real minutes). Starting at 10:00 with no incident, the player has these decisions:
- one wear warning, silo-0 at about 13:24 to 13:48 (`components/MillScene.tsx:523-531`). The test figure of 3.8 h assumes the seed load of 60; the live load of 74 gives about 3.4 h.
- the shift review notice at 14:00 (`UnifiedGameTick.ts:260-329`).
- at most one Accept next programme (`components/ui-new/onboarding/PlayableShift.tsx:1453-1462`).

Pace is not a plant decision. The line setpoint, the recipe, loading and dispatch are all automatic. That is one or two consequential choices in ten minutes; the rest is watching. Levers that already exist could make it decision-rich: line rate with a real cost (Proposal 3), maintenance timing with downtime and a natural window in the "awaiting dispatch" stretch (Proposal 2), the rush sequence (`simulation/programmes.ts:131-152`), and off-peak stock building if energy mattered.

### 2. Maintenance has no trade-off (high, [Unverified]; Choice quality)
Where the action is, the Inspector is good. It shows wear, both thresholds, efficiency and the part Maintain will take (`MachineInspector.tsx:538-609`). The service raises a notice and writes a log entry (`productionStore.ts:994-1070`). The trouble is the choice behind it. The facts, together:
- Maintain is a 1.2 s wall-clock timer (`MachineInspector.tsx:278`). Nothing in it stops the unit, so it costs no downtime. A wall-clock timer should also complete while the clock is paused.
- It costs one part from a fixed list, filters first (`MachineInspector.tsx:88-95, 309`).
- There are 15 filters, and every grain truck adds 2 of each part (`breakdownStore.ts:161-167, 1008-1013`). Grain trucks cycle every 12-24 game minutes plus travel (`stores/truckScheduleStore.ts:48-51`). Parts are never scarce.
- Efficiency only feeds quality (`UnifiedGameTick.ts:355-371`). Nothing in `materialFlowStore.ts` reads it, so a worn mill processes at full rate. Quality moves 0.2 points per point of average efficiency across 10 units, so one worn unit cannot fail a recipe.
- A breakdown costs 90 per game hour per open work order (`operationsCampaignStore.ts:134, 2640`). Running at about 7.2 t per game hour, programme 1 earns roughly 14,000 (`:888-933`).
- The seeded worn mill, rm-101, can fail at no throughput cost. Packers are the bottleneck: 3 × 25 kg/s (`materialFlowStore.ts:807`) against 4 × 50 kg/s of milling (`:748`). rm-104 alone feeds sifter-a with 40 kg/s of wheat, giving 27 kg/s of flour (`:902-918`), more than packer-0's 25 kg/s.

Routine service is always right, and run-to-failure costs almost nothing. Downtime windows and spares holding never come up.

### 3. The line rate is buried, dominant and mostly irrelevant (high, [Unverified]; Choice quality, Discovery)
The only throughput lever is a slider under Settings → Simulation control (`SettingsPanel.tsx:233-263`). A fresh session boots it at 80% (`App.tsx:279-281`); a restored session keeps its saved rate (`utils/physicalSession.ts:524`).
- **Dominant.** Wear grows by `0.5 + load/100` per running game second (`UnifiedGameTick.ts:530-532`), and load caps at 100 (`machineLoad.ts:81-83`). At 200% throughput is 2.5 times that at 80%, but wear per hour rises only from 1.24 to 1.5, so wear per tonne falls by about half. The mill's target temperature at load 100 is 62 °C (`components/machines/MachineSimulationController.tsx:104`), below the 70 °C trip (`:139`). Nothing in the quality model reads the rate.
- **Mostly irrelevant.** The order feed budget (`materialFlowStore.ts:1123-1178`) caps output at what the book needs. Later programmes ask for 11.5 t in 7 h (`simulation/programmes.ts:43-55`) from a plant that makes 7.2 t per hour, so the line is idle or stock-building about 80% of the time.
- **Two rates multiply.** The player's rate is multiplied by the controller's setpoint, campaign incidents, the Chronicle and workplace capacity (`UnifiedGameTick.ts:794-801`). The player sees one of them.

### 4. The route from a wear warning leads to the worse, mispredicted service (medium, [Unverified]; Discovery, Teaching)
The wear notice's Open repair (`StatusHUD.tsx:629-640`) goes to Overview's maintenance section (`components/ui-new/openRepairWorkspace.ts:10-13`), not to the Inspector's Maintain. The card there offers Schedule, which books the predicted failure's two parts (`PredictiveMaintenancePanel.tsx:193-200`); Complete charges them (`breakdownStore.ts:1040-1066`). That is twice Maintain's price for the same `performMaintenance` call, and the prediction is wrong (Defect 1). The guide teaches the breakdown repair, never Maintain (`deliveryJourney.ts:147-156`). A first-time player finds a service, pays double, and never sees the cheaper one.

### 5. Energy and weather are display (medium, [Unverified]; Choice quality, Wiring)
**Energy.** Demand is about 360 kW at 80% (`energyCalculations.ts:19-25, 97, 157-210`), against about 7.2 t per hour. At the peak rate of 0.15 (`operationsCampaignStore.ts:2624-2627`) that is under 0.01 per kg, roughly 1% of 0.68-0.94 revenue per kg. No decision turns on it; running slower even raises energy per tonne. The dashboard's "defer heavy operations to off-peak" tip (`EnergyDashboard.tsx:540-545`, `EnergyDashboard.messages.ts:48-50`) names a lever that does not exist, and it is helper text under D-012. The dashboard opens from AI settings (`components/AISettingsModal.tsx:143`) or the U key (`useKeyboardShortcuts.ts:456-460`).

**Weather.** No production, truck or energy code reads it, only the sky, the Chronicle and a gardener's pose (`simulation/communityLife.ts:435`). A severe-rain incident sets `storm` (`UnifiedGameTick.ts:227-228`), but its slowdown comes from the incident's own effect (`operationsCampaignStore.ts:779-795`). The Safety panel lets the player set any weather (`SafetyPanel.tsx:440-443`): they can clear the sky while the trucks still crawl at 55%.

### 6. The idle line, three cases (medium; Pacing; the first is Verified)
- **Between orders: fixed.** Pre-staging is pinned by a test (What works, item 2).
- **Once every queued order is packed: still idle.** `getLineProductionPlan` returns the active order with no budget left (`operationsCampaignStore.ts:2918-2927`). The line reads "Line idle: awaiting dispatch" (`StatusHUD.tsx:94-109`) until trucks take the stock.
  - Dead time is the last departure minus the moment the whole book is packed. The guided book is five truckloads (5+1, 4 and 5+3 t; `UnifiedGameTick.ts:96`) at 14-26 game-minute cadence plus travel. Pre-staging packs it while earlier trucks still cycle, so the tail is probably one to three cycles: 25-80 game minutes, or 1-3 real minutes at 1x [Unverified].
  - The journey test counts idleness only while unpacked work exceeds 1,000 kg (`playableJourney.test.ts:684-698`), so it misses this stretch. The lead should measure it.
- **After a programme.** The line builds stock at 70% for no customer (`operationsCampaignStore.ts:597, 1026`), and the truck is held at the dock (`UnifiedGameTick.ts:1133-1191`). With no plan, the silo routing filter is off (`materialFlowStore.ts:1595-1597`), so mills grind wheat and corn together [Unverified].

### 7. The time model: residual seams and every hold (medium; Failure, Pacing)
**Coherent and pinned.** The holds stack is pinned by `stores/__tests__/gameSimulationStore.test.ts:322-407`. Its ten holders (`gameSimulationStore.ts:138-149`) are player, shortcut (P), tour, restore, restoreFailed (`utils/physicalSession.ts:505, 559`), workplace (`UnifiedGameTick.ts:630, 1369`), handoff (derived), layout (`LayoutPlanner.tsx:353`), scada (`UnifiedGameTick.ts:605`) and orientation (`RotateDeviceOverlay.tsx:27`).

**Stops outside the stack:** hidden tab, startup and session restore (`systems/CentralTickProvider.tsx:49`); `timeOfDayHeld` and `holdFrame` (benchmark only, `UnifiedGameTick.ts:654`); `WorkplaceReplay.tsx:115`, which pauses as `player`.

**The clock keeps running through** an E-stop or drill and a 0% line rate. Both are deliberate: deadlines keep running while the plant is stopped.

**Seams:**
- A pace button clears every hold except handoff (`gameSimulationStore.ts:488-496`, pinned at `gameSimulationStore.test.ts:357`). P names the hold and refuses (`useKeyboardShortcuts.ts:348-351`). The two controls behave differently.
- Maintain and Restart run on wall-clock timers (`MachineInspector.tsx:278, 372, 386`). They finish under any pause, and Restart costs 75 game seconds at 1x but 5 game minutes at 4x.

### 8. What running the plant teaches, and what it gets wrong (medium; Teaching; the facts need a source check)
**Taught by play:** a bottleneck (packers), starvation and blocking, buffers, make-to-order (the feed budget), changeover between grains, and repair lockout and verification before restart.

**Taught only by a panel:** what rollers and sifters do (`components/ui-new/widgets/ProcessInspectionCard.messages.ts:24-80`). Its quiz options ("Grain" or "Closed sacks") test nothing.

**Doubtful or wrong; each needs a source check:**
- **One pass.** A single mill pass yields 72% flour directly (`materialFlowStore.ts:753`). The sifter is a pass-through that loses 5% "to dust" (`:785`). The inspection lesson says the sifter separates by size into different outlets. Real mills sift between repeated break and reduction passes.
- **Corn semolina for pasta.** "Community Pasta Works" orders fine semolina milled from corn (`operationsCampaignStore.ts:904-912, 640-645`). Pasta semolina is normally durum wheat.
- **Missing or odd:** corn and wheat share roller mills with no purge (`materialFlowStore.ts:902-911`); no grain is tempered; the economy has no grain cost (`operationsCampaignStore.ts:117-125`), though grain is a large share of a real mill's costs; a mill is serviced with a filter first (`MachineInspector.tsx:89-95`); worn rolls cost quality but never throughput.

### 9. The daily target pulls against the order book (medium, [Unverified]; Choice quality, Feedback)
The HUD target is 1,200 bags (30 t) a day (`productionStore.ts:78`, `ProductionTargetWidget.tsx:35`). The guided programme is 18 t and later ones 11.5 t, and the feed budget refuses grain beyond them. On day one (10:00 to midnight) even two programmes make only 29.5 t. The target can be met only with a third programme or with stock built for no customer. The bar can read "behind" while every order is on time.

## Defects

1. **Wear predictions name the wrong failure** (medium, [Unverified]). On a wear crossing a mill reads about 1.6-2.6 mm/s, about 57 °C and 74% load. `addPredictiveAlert` therefore predicts `electrical` at 55% (`breakdownStore.ts:892-904`). The actual breakdown is `mechanical` for mills and packers and `vibration_failure` for sifters (`UnifiedGameTick.ts:471-476`). Schedule then books sensors and motors, and only 3 motors are stocked. Reproduce: let R.M. 101 cross 60 wear, then open Overview → Maintenance.
2. **A booked service costs double** (medium). Complete, and Maintain on a booked unit, charge `partsNeeded` (two parts). An unbooked Maintain charges one (`MachineInspector.tsx:182-196, 257-309`; `breakdownStore.ts:1040-1066`). Reproduce: Schedule silo-0's prediction, then Maintain.
3. **The scheduled time is decorative** (low). Nothing reads `scheduledTime` except the label (`PredictiveMaintenancePanel.tsx:196, 609`).
4. **Units wear while doing nothing** (low). A unit with no feed or on a 0% line keeps `running` status and wears at half rate (`UnifiedGameTick.ts:507, 529-532`; `machineLoad.ts:81`). Reproduce: set the line rate to 0% and watch wear in the Inspector.
5. **Milestone celebrations have no renderer** (low). They are written and persisted (`UnifiedGameTick.ts:924`, `gameSimulationStore.ts:881-893`), but nothing reads `milestoneQueue` or `celebrationActive`.
6. **The energy maintenance penalty is dead** (low). `maintenanceCountdown` is never set by the live roster (`energyCalculations.ts:76-84`; `MillScene.tsx:520-570`).
7. **Restart uses `Math.random`** (low). Post-restart readings are random (`MachineInspector.tsx:381-383`), so replays can diverge [Unverified].
8. **Stale comments** (low):
   - `pace.ts:7-8` says repair downtime runs on plant time. It runs on game seconds (`UnifiedGameTick.ts:700-701`).
   - `UnifiedGameTick.ts:491-494` and `productionStore.ts:160-162` cite the retired 180x pace.
   - `playableJourney.test.ts:704` says 425 ticks is "about 212 game minutes"; at 0.5 s × 30 it is 106.
   - `WorkplaceReplay.tsx:116` says "Space = forklift emergency stop", which D-050 changed.
9. **The feasibility test does not match a real session** (low). It pins delivery at line rate 1.0 (`playableJourney.test.ts:102`), but a session boots at 0.8 (`App.tsx:280`).

## Proposals

1. **Give Maintain and Schedule one price and the right prediction (S, safe).**
   - What changes: export `inferBreakdownType` and use it in `addPredictiveAlert` for wear crossings (`UnifiedGameTick.ts:860-875`). Make a booked service charge what Maintain charges.
   - Why: predictive maintenance would then teach the right failure mode, and the panel the bell sends players to would stop being a trap.
   - How we would know: new cases in `UnifiedGameTick.maintenance.test.ts`, "predicts the type it breaks with" and "a booked service costs what Maintain costs".
   - Old contract: saved `maintenanceSchedule.partsNeeded` (migrate or honour), and the `breakdown` agent commands.
2. **Make planned maintenance cost downtime, chosen by the player (M, needs the owner).**
   - What changes: Maintain idles the unit for a game-clock service time, counted in `tickDowntime`, rather than 1.2 wall seconds.
   - Why: servicing in the "awaiting dispatch" stretch costs nothing, servicing mid-order costs tonnes, and running to failure costs a longer repair. That is a real timing decision, and it makes the idle line useful.
   - How we would know: a gameplay test showing kg lost for each of the three choices; a play-tester services during dispatch waits.
   - Old contract: `firstShiftWear` timings, the `MachineInspector` in-flight sets, persisted work orders (migration plus fixture), and `performMaintenance` callers.
3. **Make line rate a visible decision with a cost (M, needs the owner).**
   - What changes: move the rate from Settings to Overview's production section. Above 100%, raise the mill's temperature target and wear superlinearly (`MachineSimulationController.tsx:104`, `UnifiedGameTick.ts:530`). Let efficiency scale `processingRate` (`materialFlowStore.ts:1342`).
   - Why: there would be an interior optimum to find, and wear would be felt as throughput.
   - How we would know: a rate-sweep test whose best kg per part is below 200%.
   - Old contract: the `app-controls` replay participant, the `+`/`-` keys, the agent `productionSpeed` projection, the SCADA load path at `store.ts:788`, and pt-BR copy.
4. **Send a wear notice to the unit (S, safe).**
   - What changes: Open repair on a wear notice selects the machine and focuses Maintain. Fault notices keep going to the work orders.
   - Why: the cheaper, correct action becomes the one a first-time player finds.
   - How we would know: a `StatusHUD` test where a wear notice opens the Inspector.
   - Old contract: `openRepairWorkspace` callers and `PlayableShift.repairRoute.test.tsx`.
5. **Replace the daily bag target with the programme's committed tonnes (S, needs the owner).**
   - What changes: drive `ProductionTargetWidget` from open commitments rather than `DAILY_TARGET_BAGS`. Remove the unrendered celebration writes.
   - Why: one goal, the customer's, and no reward for unsold stock.
   - How we would know: a widget test where a fully packed, on-time book never reads "behind".
   - Old contract: `productionTarget` in saves, `components/game/shared.tsx:135-160` (the PA's 100% line), and achievements (`hooks/useAchievementTracker.ts:117`).
6. **Price the grain (M, needs the owner).**
   - What changes: add a source-checked grain cost per kg received to `CampaignEconomics`, booked in `receiveGrainDelivery`.
   - Why: the real economics of milling come into play; waste, extraction and stock-building get a price; energy is seen in proportion.
   - How we would know: a shift report in which grain is the largest cost line and building unsold stock shows a loss.
   - Old contract: saved economics (migration), shift-report fixtures, and Chronicle ledger readers.
7. **Cut or own the weather buttons (S, needs the owner).**
   - What changes: remove them from `SafetyPanel.tsx:433-454`, or lock them while a `severe_rain` incident is open.
   - Why: the sky stops contradicting the incident, and a god control leaves a safety panel.
   - How we would know: a Safety panel test with no weather control, or a disabled one during the incident.
   - Old contract: the benchmark weather route (`RuntimeController.tsx:1714`) and the Chronicle `clear_weather` command.
8. **Housekeeping (S, safe).** Fix the stale comments, pin feasibility at 0.8, stop wear on unfed and 0% units, and seed Restart (Defects 4, 7-9). Why: the code stops describing a different game. How we would know: the journey test passes at 0.8, and no wear accrues at 0%. Old contract: the `firstShiftWear` pins shift, so re-measure them.

## Needs the owner

- **Pace buttons and holds.** Should a pace button override another feature's hold (tour, layout, restoreFailed) when P does not? Recommendation: one rule for both; buttons should name the hold, as P does.
- **What Maintain is.** Should maintenance take the unit offline (Proposal 2)? Recommendation: yes; it is the cheapest route to a real decision.
- **Who owns line rate.** Is it the player's or the controller's? Today both multiply. Recommendation: one rate, the player's, with the controller's setpoint folded into its default.
- **Daily target or programme.** Recommendation: the programme.
- **Corn semolina for a pasta works.** Recommendation: give the semolina order to a polenta or cornmeal customer, or switch it to durum, after a source check.

## Not reviewed

Truck and forklift controller internals beyond `truckClock.ts`; the SCADA load path (`store.ts:788`); `MachineSimulationController` beyond its load and thermal targets; workplace capacity (`simulation/bilateralWorkplace.ts:790`); Chronicle multipliers; incidents, QC holds and order grading (left to the campaign and QC reviewers). Nothing was run: every throughput, timing and energy figure is derived from the code.
