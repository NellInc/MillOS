# Embodied play, the world, safety and the drill

All paths are relative to `src/` in the snapshot. Every cited file ships (`alive` in reachability.txt) unless it is marked dead. "[Unverified]" means read from source, not seen running.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Walk, sprint, jump | `components/FirstPersonController.tsx:55-63,366-551` | 12 m/s walk, 43 m/s sprint, 0.85 m hop | tune |
| Silo ladder | `FirstPersonController.tsx:129-135,453` | Climbs to an empty silo top | cut or connect |
| School bell | `scenery/SchoolBell.tsx:110-120`; `utils/worldInteractables.ts:18` | E or click: it swings and strikes | keep |
| Board and drive a forklift | `FirstPersonController.tsx:260-276`; `simulation/vehicles/forkliftManualDrive.ts:271` | E boards FLT01 or FLT02; W/S/A/D drive | rework |
| Forks R/Q | `forkliftManualDrive.ts:66-68,222-228` | 0 to 0.72 m, no effect | rework |
| Displace the operator, then lane return | `ForkliftSystem.tsx:2659-2711`; `forkliftManualDrive.ts:550` | Operator steps off and waits; the forklift drives itself back | keep |
| Hold a truck with a forklift | `TruckBay.tsx:3308-3325`; `constants/dockLoading.ts:82-90` | Leave a forklift in a truck's path or dock lane: the truck waits | connect |
| Stand in a forklift lane | `ForkliftSystem.tsx:441-447,2427-2445` | The autopilot slows, stops and sounds its horn | connect |
| Farm windmill and henhouse lessons; animals | `FarmArea.tsx:1066,1786`; `stores/windmillLearningStore.ts` | Orbit-view click: quiz cards; hearts and sounds | connect |
| Forklift-only stop (X) | `hooks/useKeyboardShortcuts.ts:220-264` | Toggles; PA line and incident | tune |
| Facility E-stop | `ui-new/panels/SafetyPanel.tsx:380-489` | Confirm: everything stops; CLEAR restarts it all | rework |
| Egress drill | `SafetyPanel.tsx:300-360`; `systems/egressDrillSequencer.ts` | START, then watch about 21 s | rework |
| Speed zones, config sliders | `ui/ZoneCustomizationPanel.tsx`; `ui/SafetyConfigPanel.tsx:56-150`; `stores/safetyStore.ts:179-200` | Type x/z/r; move four sliders | connect |
| Safety analytics, heat map | `ui/SafetyAnalyticsPanel.tsx`; `MillScene.tsx:278` | Read stats, toggle the heat map, download JSON | tune |
| Mini-map; Blueprint mode | `game/MiniMap.tsx:60`; `blueprint/BlueprintMode.tsx` | Forklift dots; wireframe view | tune; keep |
| Phone walk and drive | `mobile/MobileControlsOverlay.tsx:65-108`; `mobile/MobileFirstPersonController.tsx:248-345` | D-pad, drag look, Drive, forks and Step down | tune |
| Agreed adjustments (D-058) | `simulation/agreedAdjustments.ts`; `utils/aiAccommodation.ts` | Nothing direct: props in the world, AI cards | connect |

## What works

1. **The autopilot forklifts model safe practice.** They:
   - slow within 6 m of anyone on foot and stop within 3.5 m, giving wheelchair and cane users more room;
   - sound the horn at most once every 20 s;
   - lower the forks when parked;
   - creep in to a pick and back straight out (D-060; `ForkliftSystem.tsx:2440-2470`).

   The player on foot triggers all of it. The October finding that queuing behind another vehicle counted as a near miss is **fixed**. `vehicle-queue` and `vehicle-yield` are now separate from `route-blocked` (`forkliftController.ts:58-69`), and only `route-blocked` is recorded (`ForkliftSystem.tsx:2472-2481`).
2. **Step-free egress is honest and checkable.** Each zone has a route, a refuge and an agreed alternative (`systems/accessibleEgress.ts:58-97`). A stopped forklift on a route really changes the result, and the AI files a card saying so (`egressDrillSequencer.ts:76-85`; `accessibleEgress.test.ts:162-170`).
3. **The agreed-adjustments register is well written.** It is in the social model and holds no number about anyone (`agreedAdjustments.ts:1-14`). The quiet-room planner really moves the air-line purge out of a booking and says why (`aiAccommodation.ts:282-342`).
4. **Manual driving is physically sound.** It runs on the autopilot's limits, cannot wedge itself, and always gets back to its lane, towed as a last resort (`forkliftManualDrive.ts:182-305,550-720`).
5. **The windmill lesson is accurate** (`WindmillLearningCard.messages.ts:9-26`). **Residents react to the plant**: the baker waits for the cooperative's order (`communityLife.ts:432-494`).

## Findings

**F1. On foot there is almost nothing to do: walking is for looking, not playing.** High. Verified (code). Rubric 1, 5, 7.
- `worldInteractables.ts:18` allows one prompt, `ringBell`, and only `SchoolBell.tsx:120` registers. The instructions list the whole set: "Drive or leave a forklift, ring the school bell" (`FirstPersonController.messages.ts:14`).
- People cannot be clicked or inspected; `CommunityLife.tsx` has no handlers.
- The farm lessons use R3F `onClick` and register no world interactable, so in first person they show no prompt and cannot be aimed (`FarmArea.tsx:1066,1786`) [Unverified whether a stale-pointer click lands].
- Lessons leave no trace (`windmillLearningStore.ts` imports only zustand).
- The player camera presets cover only the mill (`CameraController.messages.ts:8-26`).

Places beyond the mill (survey; `onClick|onPointer` grep empty for CanalFinds, TacoTruckSign, RailwayStation, FairytaleCastle and GasStationInstanced):

| Place | What the player can do | Link to the mill |
|---|---|---|
| Village | Ring the bell; click the ducks, fountain bird and the forge horse (`VillageArea.tsx:1703-1716`). Buildings are solid and closed (`walkingObstacles.ts:17-21`). | The bakery stocks after a cooperative order (`communityLife.ts:297-322,444-447`). The Chronicle's "village" is abstract (`chronicle/eventDeck.ts:158-171`). |
| Farm | Henhouse quiz; animals | None. No grain comes from it (`materialFlowStore.ts:105`). |
| Windmill | Four-stage lesson | None. Not linked to the Chronicle's windmill note (`chronicle/history.ts:81-85`). |
| Castle | Walk the corridor to its courtyard (`castleNavigation.ts:66-97`) | None |
| Canal finds | Look | None (`scenery/CanalFinds.tsx`) |
| Riverside station, shop, taco truck | Walk into the gas-station shop; look | Only the clock and timetable. "Riverside" also names the bakers' cooperative (`chronicle/customers.ts:9`), but nothing joins them. |
| Bus | Watch | The bus waits for mill trucks on the road (`communityLife.ts:1688-1699`) |

**F2. Driving a forklift achieves nothing, and its only effect is silent harm.** High. Verified (code). Rubric 1, 2, 3, 4.
- The manual branch (`ForkliftSystem.tsx:1794-1973`) never picks or drops. `hasCargoRef` is written only by the autopilot (`:2209,2213`) and by restore (`:1649`).
- The forks touch nothing. A drive is excluded from layout metrics (`:1895-1897`).
- There is no goal, score or praise.
- One consequence exists, and it is hidden:
  - a manual forklift in a truck's path holds the truck (`TruckBay.tsx:3308-3313`);
  - any dock forklift standing in its lane, except while it waits on the interlock, keeps the truck's doors open (`TruckBay.tsx:3323-3325`; `dockLoading.ts:82-90`).
- So leaving FLT01 in the shipping lane, or pressing X while it is there, delays the departure with no notice, incident or log line [Unverified whether a delivery goes late].

**F3. A driven forklift passes through people.** High. Verified (code). Rubric 4, 6.
`createManualWorldBlocked` checks only static boxes, trucks and forklifts (`forkliftManualWorld.ts:118-132`). People are not in `positionRegistry` (`utils/positionRegistry.ts:11`), and residents follow routines with no avoidance (`CommunityLife.tsx:520-560`). A player can drive through a colleague, the quality technician's wheelchair or the town-hall cane user with no stop and no record. The give-way the autopilot obeys (`ForkliftSystem.tsx:2440`) does not apply to the human driver. The player's own driving teaches the opposite.

**F4. Driving skips most world solids, and nothing stops a walker at the hall walls.** High. [Unverified] at runtime. Rubric 4, 6, 8.
- `forkliftManualWorld.ts:6-7` says: "Factory walls are not here because no navigation mode has wall geometry: the walking player passes through them as well."
- `manualStaticBlocked` (`:93-106`) never calls `walkingObstacleBlocks`. So a driven forklift ignores the perimeter fence, cottages, hedges and the D-057 facility blocks, as well as the hall walls.
- On foot, the hall shell is absent from `walkingObstacles.ts`.
- This voids D-062's personnel doors as places a body must use.

**F5. Safety choices have no visible trade-off.** High. Verified (code), magnitudes [Unverified]. Rubric 3, 6.
- **Speed zones.** Two default zones sit on the dock doors (`safetyStore.ts:83-84`). Slowing the forklift there could only lengthen the dock-lane hold in F2 by seconds. Elsewhere, forklift time feeds nothing, because the dock loads at its own rate (D-060). The player sees no cost and no benefit.
- **Facility E-stop.** Only the player triggers it (`SafetyPanel.tsx:476` is the sole `triggerEmergency` caller). Nothing in this area calls for it, so it is pure cost.
- **Incidents.** The only live source is `route-blocked` against static boxes (`ForkliftSystem.tsx:2472`; `positionRegistry.ts:66-80`). `recordNearMiss` and `recordRouteConflict` are called only from the dead `hooks/useSafetySimulation.ts:61,68`.
  - At defaults I found no way to raise an incident, so the score probably stays at 100 and `zero-incidents` comes free [Unverified].
  - Raising Vehicle Detection (up to 5, `SafetyConfigPanel.tsx:61-62`) probably creates stops by widening clearance against machines. The only lever that moves the score would then make the plant worse [Unverified].

**F6. The drill is press-and-watch, and it loses its result.** Medium-high. Verified (code). Rubric 1, 2, 5.
- One zone verifies per 120 game seconds, about 21 s in all (`egressDrillSequencer.ts:19-22`). The player has no part in it.
- The one real input is where the forklifts stand at START. A forklift on the west route sends that zone to its alternative (`accessibleEgress.ts:84-91`; test `:162-170`). FLT02's default corner is described as "at the west service door's egress approach" (`safetyStore.ts:62-64,81`) [Unverified that its route crosses the egress line]. Nothing shows this before START.
- What survives is the cleared event card (`SafetyPanel.tsx:272-295`), the logbook entry, the AI egress cards, the achievement and the PA line. No per-zone result is kept in the Safety panel: `drillMetrics` resets 5 s after completion (`gameSimulationStore.ts:747-760`).
- `finalTimeSeconds` uses wall-clock time on a game-time drill and has no reader (`:796-799`).

**F7. People and their adjustments are invisible as people.** Medium. Verified. Rubric 2, 6, 7.
- The plant-aware `task` strings (`communityLife.ts:444-494`) go only to `userData` (`CommunityLife.tsx:333,646`). They are English, never shown, and never translated.
- D-058's adjustments reach play as props (wheelchair, cane, pager, `CommunityLife.tsx:339`) and as AI cards. No player can learn what the east operator's pager is for, or why the packer leaves at 10:00.

**F8. Phone parity has gaps.** Medium. Verified. Rubric 7.
- The mobile controller never calls the aimed-interactable functions, so there is no bell.
- There is no jump and no ladder; `camera.y` is pinned to the ground (`MobileFirstPersonController.tsx:291-292`).
- The forklift-only stop exists only on X (`useKeyboardShortcuts.ts:220`). `ui/EmergencyStopButton.tsx` is dead.
- Sprint is 24 m/s on a phone against 43 on desktop.
- Driving, forks and stepping down are covered.

**F9. Some teaching is wrong or doubtful.** Medium. Rubric 6.
- **(a) CLEAR EMERGENCY and END DRILL restart every machine and forklift at once** (`gameSimulationStore.ts:383-393,664-690`). The rule is that resetting an emergency stop must not restart machinery, only permit a deliberate restart: IEC 60204-1 §9.2.3.4, as quoted by [ABB](https://help.plc.abb.com/sf_emergencystop.html), and [Pilz on ISO 13850](https://www.pilz.com/en-IE/support/faq/standards/articles/180045). These are secondary sources; check the clause in the edition held.
- **(b) The safety score takes −5 per near miss** (`safetyStore.ts:241-251`), and one blocked-route stop counts as both a stop and a near miss, −7 in all (`:364-367`). Near-miss reporting is a leading indicator to encourage, not to punish [Inference; source before writing copy].
- **(c) "Forklift Efficiency" is moving time over total time** (`SafetyAnalyticsPanel.tsx:110`). Every pedestrian yield lowers it.
- **(d) Loaded forklifts travel with the forks at 0.32 m** (`models/forkliftBeacon.ts:19`). Common practice is just clear of the floor, about 150 mm [Unverified source].
- **(e) The town-hall ramp may break Approved Document M.** It has two 4.8 m flights at 1:12 (0.4 m rise each) and is 1.3 m wide (`constants/accessibilityLayout.ts:291-310`). Approved Document M is commonly tabled as 1:12 for goings up to 2 m only, 1:15 to 5 m and 1:20 to 10 m, with a 1.5 m minimum width ([Designing Buildings: Ramps](https://www.designingbuildings.co.uk/wiki/Ramps)). Check Approved Document M Vol 2 itself.
- **(f) Drill copy says the zones "verify themselves"** (`SafetyPanel.messages.ts:40-41`; `EmergencyOverlay.messages.ts:8-9`). The code checks forklift footprints against routes.
- **(g) The player walks at 12 m/s, sprints at 43 m/s.** Colleagues walk at 1.25 m/s. Pedestrian segregation cannot be felt at those speeds.

**F10. D-012 is breached.** Low-medium. Verified.
- `SafetyPanel.tsx:324`: `drillDescription` caption.
- `SafetyPanel.tsx:251-253`: response line.
- `SafetyConfigPanel.tsx:166-182`: help lines and enforcement note.

## Defects

1. A driven forklift ignores pedestrians (F3). Reproduce: board FLT02 and drive at a resident. High.
2. A driven forklift ignores the hall walls, fence and village solids (F4). Reproduce: drive FLT01 at the north wall. [Unverified] High.
3. A truck held by a forklift is silent (F2). Reproduce: press X while FLT01 is in the shipping lane. The truck waits and nothing says why. Medium.
4. Reset restarts the plant (F9a). Reproduce: E-stop, then CLEAR. Medium.
5. Farm lessons are unusable in first person (F1). [Unverified] Medium.
6. Phones get no forklift-only stop, bell, jump or ladder (F8). Medium.
7. The drill result resets after 5 s; `finalTimeSeconds` is wall-clock time and unread (F6). Low.
8. One route stop counts as a stop and a near miss (F9b). Low.
9. `PhysicsFirstPersonController` has no board, bell or jump. It mounts only when `enablePhysics`, which every preset sets false and no UI exposes (`graphicsStore.ts:309,409,468,527`; `App.tsx:879`). Latent. Low.
10. Stale comments and controls listings:
    - `forkliftDriveStore.ts:6-7` still says F boards; D-053 made F fullscreen only.
    - `forkliftDriveStore.ts:39` says Q/E move the forks; it is R/Q.
    - `MiniMap.tsx:34` still says Space is the forklift stop; D-050 moved it to X.
    - The first-person instructions omit R/Q and X (`FirstPersonController.tsx:707-759`).

    Low.

## Proposals

Each passes the constraint list: no helper text, no number about a person, D-010 kept, both languages, inert in benchmarks.

**P1. The human driver obeys the autopilot's give-way.** S. Safe.
- Change: in the manual branch (`ForkliftSystem.tsx:1876-1895`), call `gatherPedestrians` with `crewLive.operatorRoot` excluded (the displaced operator stands at the cab) and `nearestPedestrianAhead` along the heading.
  - Cap `maximumSpeed` at the slow speed within 6 m, and to zero within 3.5 m.
  - Log a `near_miss` incident with its location to the incident log and the heat map only, not the score (see F9b and Owner 3).
- Why: give-way is felt, not read, and the log gains causes the player made and can stop making.
- Know it worked: a `forkliftManualDrive` test where a pedestrian 3 m ahead gives speed 0. Play-testers stop short of a resident.
- Old contract: the incident type already exists; `safetyMetrics` is restored whole by `physicalSession.ts:483`, and its shape is unchanged. HUD, Overview and MobilePanel read `computeSafetyScore`.

**P2. Driving gets a job: a player pallet trip that counts.** M. Needs the owner (D-060).
- Change: at its own pick station, with the forks low, E runs the existing `forkliftWork` pick. A drop at the destination completes the trip, as the autopilot's does (`forkliftCargoStations.ts`). The shift log records an operator delivery.
- An unsafe pick (forks high, or too fast near people) is refused with an error line, which D-012 allows.
- Know it worked: a test that a manual trip moves one station pallet. Play-testers deliver one in under two minutes.
- Old contract: vehicle-replay cargo snapshots (`ForkliftSystem.tsx:1638-1650`).

**P3. Reset, then restart.** S. Needs the owner (it changes what CLEAR does).
- CLEAR and END DRILL release the interlock and leave the machines idle; a RESTART LINE action runs `restoreProduction`.
- A drill that ends itself, or one the agent started (`runtimeCommandHandlers.ts`), also leaves the line idle, and the PA says "line ready to restart" (a pertinent update under D-054).
- Know it worked: a `gameSimulationStore` test that the line stays idle until restart.
- Old contract: agent `simulation.start-fire-drill`, the PA drill lines, tests expecting auto-restore, and a save restored mid-stop (`preEmergencyMachineStatuses`).

**P4. A drill the player prepares for and reads back, inside D-010.** M. Safe.
- Before START: draw `STEP_FREE_EGRESS` routes and refuges on the floor, and turn red any forklift standing on one.
- The player's verbs (lane return would undo a manual move, and the drill zeroes driving input):
  - pick the moment to start;
  - press X when the forklifts are clear;
  - add a no-stop egress zone that the autopilot will not stand in. That needs a small `ForkliftSystem` rule, and is real practice: escape routes kept clear.
- After: keep a per-zone record (own route, alternative or blocked, with the forklift named) in the Safety log, timed in game seconds. Nobody moves; people hold.
- Know it worked: an `egressDrillSequencer` test with a forklift on the west route giving "alternative" and a record. Play-testers start the second drill at a better moment.
- Old contract: `drillMetrics` in the physical session needs a migration and a fixture; `safety-first` tracker.

**P5. People readable on approach, without numbers.** S-M. Needs the owner (D-058, D-012).
- E or a tap on a resident shows:
  - their role;
  - the current `task`, moved into `communityLife.messages.ts` in both languages;
  - for the five D-058 people, the adjustment by its register name and who agreed it.
- No condition and no metric.
- Know it worked: every task key has a pt-BR string, and play-testers can say why the packer leaves at 10:00.
- Old contract: scene-inspection tests read English `userData.task`; keep that field.

**P6. One solid world for walkers and drivers.** M. Safe.
- Add the hall shell's wall segments, minus the portals and `PERSONNEL_DOORS`, to `walkingObstacles`.
- Make `manualStaticBlocked` call `walkingObstacleBlocks`.
- Know it worked: extend `capsuleWalk.routes.test.ts` (stopped at the gable, passes the personnel door) and a manual-drive test against the fence. `firstPersonSpawn.sweep.test.tsx` still passes.
- Old contract: in-hall spawns, and lane return near the dock doors.

**P7. Phone parity.** S. Safe.
- A context button calls `activateAimedInteractable`.
- A forklift-stop toggle sits beside RELEASE in the Safety panel.
- The D-pad climbs ladders.
- Know it worked: a mobile e2e test rings the bell and sets the stop.

**P8. Name the dock hold.** S. Safe.
- When `holdForForklift` or `dockForkliftInLane` holds a truck, write one incident or logbook line naming the forklift ("Truck held: FLT01 in the shipping lane"). The player then finds the cause and removes it.
- Know it worked: a TruckBay test that a held truck logs once per hold.

**P9. Farm lessons that work and stick.** S. Safe.
- Register the windmill and henhouse as world interactables.
- On finishing, mark the matching entry in `stores/knowledgeStore.ts` as read, and point the farm windmill at the Chronicle history note.
- Old contract: the knowledgeStore save shape needs a migration if a new key is added.

**P10. Cut the D-012 captions and fix the drill copy (F9f, F10).** S. Safe.

## Needs the owner

1. **D-060: should a player-moved load count?** Today driving, speed zones and the forklift stop have stakes only through the hidden dock hold. Recommend P2 and P8.
2. **D-050 and D-002: anyone can take a crewed forklift.** That is fine for play but is the opposite of authorised-operator practice. Recommend keeping it, with P1 and P2's refused unsafe pick.
3. **"Efficiency %" per forklift against D-008 and D-058.** Each forklift has one roster operator, so the figure reads as a productivity number about a person, and it penalises yielding. Recommend cutting it. Also decide whether near misses should lower a score at all (F9b).
4. **D-058's "1:12" ramp.** If Approved Document M confirms the issue, re-grade the ramp or describe it accurately.
5. **Walking speed.** Recommend near-real walking inside the fence.
6. **The E-stop's purpose.** Recommend a hazard model (another area) that makes stopping the right act.

## Not reviewed

- Partly read: `forkliftCrew.ts`, `forkliftCargoStations.ts`, `forkliftWork.ts`, `forkliftRoute.ts` and `forkliftController.ts`.
- Not read: `cameraNavigation.ts`, `ambientWorld.ts`, `DPad.tsx`, `TouchLookHandler.tsx`, `CameraPresetMenu.tsx`, `IncidentHistoryPanel.tsx` and the `ZoneCustomizationPanel` UX.
- Not checked: whether a tap in orbit view reaches R3F handlers.
- The places table comes from a helper survey that I spot-checked.
- Nothing was run.
