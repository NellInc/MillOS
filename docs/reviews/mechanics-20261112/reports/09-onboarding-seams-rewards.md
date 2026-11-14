# Onboarding, the first hour, navigation, seams, rewards and feedback

Real minutes at pace 30 (one real minute is 30 game minutes, `simulation/pace.ts:20-23`). Paths under `src/`. Read, not run.

## Mechanics inventory

| Mechanic | Entry point | What the player does | Verdict |
|---|---|---|---|
| Tour (clock held) | `ui-new/GameInterface.tsx:211-230` | Reads three cards; Skip, X or Escape | tune |
| Guided first delivery | `onboarding/PlayableShift.tsx:184-702`, `deliveryJourney.ts:112-279` | Inspects one machine, then watches | rework |
| Shift pace | `PlayableShift.tsx:143-182` | Pause to 4x | keep |
| Replay guide or tour | `PlayableShift.tsx:1126-1137`, `onboarding/replayGettingStarted.ts` | Reopens a guide | keep |
| Shift commitment card | `PlayableShift.tsx:849-1251` | Switches customer, next action, challenge, season opt-in | connect |
| Debrief and Accept next programme | `PlayableShift.tsx:1374-1471` | Reads grade, accepts | keep |
| Achievements | `stores/achievementsStore.ts`, `hooks/useAchievementTracker.ts` | Earns, then finds them in Overview › Quick actions | rework |
| PA captions and voice | `game/shared.tsx`, `PAAnnouncementSystem.tsx` | Hears fault and stop notices | keep |
| Bell | `hud/StatusHUD.tsx:539-688` | Acknowledges, dismisses, goes to repair | tune |
| Clock-holder chip | `StatusHUD.tsx:494-510` | Reads why the clock stopped | keep |
| Shortcuts and ? help | `hooks/useKeyboardShortcuts.ts`, `ui/KeyboardShortcutsModal.tsx` | P, I, O, nine overlays | tune |
| Dock (7 plus More) | `ui-new/dock/Dock.tsx:228-378` | Opens workspaces | tune |
| Season autoplay, Take over | `widgets/WorkplaceParticipation.tsx:465-571` | Watches or takes over | connect (owner) |
| Daily bag target | `stores/productionStore.ts:78`, `StatusHUD.tsx:464-477` | Nothing; a readout | rework |
| SCADA history and incident replay | `OverviewPanel.tsx:1176-1185`, `game/IncidentReplayControls.tsx` | Scrubs a timeline | not reviewed |

## What works

1. **Honest clock holders.** All ten (`pace.messages.ts:16-27`) get a desktop chip, a sentence on the cards and a screen-reader status; P releases only its own hold (`useKeyboardShortcuts.ts:327-356`; test `StatusHUD.gameplay.test.tsx:100-120`).
2. **The guide narrates real state.** Loading, departure, second trip and repair detour (`deliveryJourney.ts:147-246`; tests `deliveryJourney.test.ts:45, :434`); never "6,000 of 6,000" before fulfilment (`:68-72`).
3. **One time model.** Every pace keeps the first delivery winnable (`pace.ts:1-19`).
4. **Skip keeps the goal.** Skip and Start operating both land on a named order (`GameInterface.tsx:281-311`).
5. **Shift reports explain the grade,** with per-order outcomes, the gap and one thing to try next (`PlayableShift.tsx:1260-1372`).

## Findings

**F1. Success is silent. (high; rubric 2; Verified by reading)**
- **A fulfilled order emits nothing.** Fulfilment sets the status and writes a logbook row (`stores/operationsCampaignStore.ts:2466-2496`): no alert, no PA. With the guide closed, the central win is a changed line in Overview.
- **An unlock is close to invisible.** It files a `success` bell row with no `announce` (`useAchievementTracker.ts:96-115`), which the badge leaves out (`StatusHUD.tsx:126-132`), and calls `triggerCelebration` (`:117`), whose queue nothing reads (D1).
- **The 25, 50 and 75% daily milestones go to the same dead queue** (`systems/UnifiedGameTick.ts:910-930`).
- **What a player does notice:** the truck-departure sound (`TruckBay.tsx:3486`), the PA's "back up" and "today's target made" lines, and the spoken shift grade (`UnifiedGameTick.messages.ts:52-61`). Muting removes even those captions (F9).

**F2. The real goal is not on the HUD. (high; rubrics 5 and 7; Verified)**
- **Two goals compete.** The tour names "today's target" (`GameInterface.messages.ts`, `introFlourContent`); the HUD counts bags per day (`StatusHUD.tsx:464-477`); the grade reads customer orders in kilograms.
- **The commitment drops out of sight.** Once the guide card closes, the order, its due time and the next action live only at the top of the Overview sidebar (`OverviewPanel.tsx:830`), which starts closed (`GameInterface.tsx:116`).
- **Nothing links the two goals.** The bag target (30 t per day, `ProductionTargetWidget.tsx:35`) is graded nowhere; the shift grade reads only orders.

**F3. Achievements are cut off from the game. (high; rubrics 3 and 7; Verified)**
- **Most reward waiting or a side panel.** Of 11 visible achievements, none rewards a delivery, a grade, a programme, a challenge, a QC hold, a repair, the season or the Chronicle. Four reward answering AI decisions in the More › AI Partner panel. Three reward waiting for bags. Table in Q6.
- **There is no route to them on phones.** The panel exists only in desktop Overview › Quick actions (`OverviewPanel.tsx:1205-1226`). `MobilePanel.tsx` has none.

**F4. The seams carry the player nowhere. (high; rubric 7; Verified by reading)**
- **The season arrives unasked.** It starts by itself a second after the tour (`WorkplaceParticipation.tsx:493-513`) and binds the first order. Until its review is done, it blocks switching customers and Accept next programme (`PlayableShift.tsx:704-718, 989, 1455`).
- **It takes the guidance slot.** It suppresses AI reflections and fills the quiet slot with the Working agreement companion (`GameInterface.tsx:530, 647-661`).
- **Nothing points to the Chronicle.** No tour step, debrief, programme-complete card or PA line names it; only its dock item, Datalinks history notes and a Safety label do (grep). On phones it sits inside More (`Dock.tsx:321-343`).
- **Take over can stall the loop.** It stops the runner (`workplaceAutoplay.ts:337-346`) while the review gate stays, so a curiosity click holds programme acceptance until the season is finished or left. [Unverified]
- **"Seen everything" comes at "Programme complete"** (real minute ~16): the next programme looks like the first, while Chronicle, challenges, rush and customer switching stay unopened.

**F5. The first ten minutes offer one decision. (medium; rubric 5; Verified)**
Every lesson button is "Show …" or "Open SCADA" (`PlayableShift.tsx:661-695`); the only lever on the card is pace. Rush versus defer, customer switch and challenges live in Overview, challenges inside a collapsed `<details>` (`:1196-1247`).

**F6. A returning player is not oriented. (medium; rubric 5; [Unverified] at runtime)**
- **The restore is silent.** It brings back stock, orders, achievements and the bell's old notices (`utils/physicalSession.ts:76-101, 480-503`), and the clock runs (D-049).
- **The goal returns only by chance.** The guide comes back only if it was open when the player left (`stores/uiStore.ts:392-395`). Nothing says "you were on order X, due in Y" (Q5).

**F7. Navigation duplicates and buries. (medium; rubric 7; Verified)**
- **Two dock items, one panel.** Overview and Production differ only in camera (`ContextSidebar.tsx:218-222`, `GameInterface.tsx:444-445`).
- **Overview is long.** About a dozen sections (`OverviewPanel.tsx:829-1021`), with achievements and replay at the bottom.
- **Names diverge.** The dock says "Autonomy" while copy says "Bilateral Autonomy System (BAS) panel" (`Dock.messages.ts:26`; `pace.messages.ts:23`).
- **The HUD spends space badly.** It shows a constant "SCADA SIMULATED" (`StatusHUD.tsx:527-535`) and a safety % that no decision moves directly, but never the order.

**F8. On phones there is no notification surface. (medium; rubric 2; Verified)**
StatusHUD mounts only on desktop (`GameInterface.tsx:560`). On a phone the latest alert shows only inside the AI sheet (`MobilePanel.tsx:625`) and the pause state only inside the Overview sheet (`:329, 361`), so shift notices and achievements are effectively invisible unless the PA speaks.

**F9. Mute deletes information, not just sound. (low; rubric 2; Verified)**
While muted the PA shows no caption and its screen-reader text is empty (`PAAnnouncementSystem.tsx:350-378`), losing the escalating fault wording (D-061) and the shift grade.

**F10. Keys go to overlays, not to verbs. (low; rubric 7; Verified)**
- **Nine keys toggle overlays that are off by default** (H, K, J, T, U, Y, $, G, Z; `useKeyboardShortcuts.ts:359-487`).
- **The verbs players most need have no key:** open the commitment, read the bell, Safety and the drill, the Chronicle, Datalinks.
- **`-` can stop the line quietly:** 0% line rate with a 1.2 s notice (`:505-517`), then nothing on screen says so. [Inference]

**F11. Reading costs deadline time. (low; rubric 6; Verified)** None of the shortcuts help, Datalinks, the Chronicle event dialog or the achievements panel holds the clock. The Chronicle event dialog is non-modal (`ChronicleEventHost.tsx:344`).

## Defects

1. **The celebration queue has no reader** (medium). `triggerCelebration` (`stores/gameSimulationStore.ts:881-899`) is called from `useAchievementTracker.ts:117` and `UnifiedGameTick.ts:924`. A grep finds no component that reads `celebrations`, and `UnifiedGameTick.ts:664-665` already admits the `shift_complete` one had no renderer. Repro: unlock First Bag, and nothing appears.
2. **Full Capacity cannot be earned at the default line rate** (medium). The load target is `50 + speed × 30`, which is 80 at 100% (`simulation/machineLoad.ts:81`). The achievement needs every machine `running` at 90 or more (`useAchievementTracker.ts:279-291`). Repro: play at the default rate; it needs 134% or more, from the Settings slider or with +. [Unverified: the bar's resting value, and whether any machine is ever not `running`]
3. **"Interlock Proven" teaches the wrong concept** (low). The copy says interlocks (`achievementsStore.messages.ts:11-12`), but the trigger is egress drill completion (`useAchievementTracker.ts:142-148`; D-010).
4. **Two achievements count the same thing** (low). One response increments both `first-preference` and `vote-participant` (`useAchievementTracker.ts:205-206`). "Decision Review" claims "shared, not handed down" but also counts rejections.
5. **The season opt-in is unreachable by default** (low). "Start linked cooperative campaign" needs `workplace.phase === 'idle'` (`PlayableShift.tsx:1149`), which autoplay leaves seconds after the tour. [Unverified]
6. **The HUD target hides its unit and period** (low). It reads "Target n / 1,200" with no unit or "today"; only its aria label says daily bags (`StatusHUD.messages.ts:39-40`).

## Proposals

**P1. Give success a sight and a sound.** (S–M, safe)
- **Change:** add a renderer for `celebrations.milestoneQueue` that consumes via the existing dequeue at `gameSimulationStore.ts:903-908`. Make it a transient HUD chip beside Target, showing a result, not advice: for example "Riverside Bakers' Cooperative: 6,000 kg, on time". Fire it on fulfilment from the `operationsCampaignStore.ts:2466` path, on a shift grade and on each unlock. Add a non-voice cue such as `audioManager.playCycleBell`. D-054 limits speech, not sound effects.
- **Why:** the core loop finally pays off when it is won.
- **Measure:** a test in which fulfilling `order-001` renders a status naming the customer and "on time". A play-tester should be able to say when they succeeded.
- **Old contract:** saved `celebrations` pass through the sanitiser at `gameSimulationStore.ts:340-363`. A new `CelebrationType` needs sanitiser support and a physical-save fixture. Needs translations. The chip and cue must be inert in benchmark runs.

**P2. Put the commitment on the HUD.** (S, safe)
- **Change:** replace "SCADA SIMULATED" with "Customer · shipped/required kg · due …", built from `deriveDeliveryDeadline` and `shownShippedKg`. Clicking it opens Overview at the commitment.
- **Why:** it answers "what am I doing?" at every minute.
- **Measure:** a StatusHUD test with an active order. After closing the guide, a play-tester can still name the goal.
- **Old contract:** StatusHUD tests that find the SCADA chip; translations.

**P3. Point achievements at the game.** (M, safe)
- **Add:** first on-time delivery, first A shift, first programme accepted, first challenge completed, first QC hold resolved, first season finished (run or taken over), Chronicle charter signed.
- **Fix Full Capacity:** retune it to 80 or rework it.
- **Phones:** add the list to the Overview sheet.
- **Why:** each achievement points at a mechanic the player has not opened yet.
- **Measure:** each new id has a tracker test that earns it from real store transitions.
- **Old contract:** the saved achievements list (`physicalSession.ts:98, 487`) must gain the new ids on load. Merge them in `createDefaultAchievements` and add a save fixture.

**P4. Hand over the next layers when the programme completes.** (S, safe)
- **Change:** when the next action is `programme`, the fulfilled card offers three buttons: Accept next programme, Cooperative season, and Chronicle charter. They are buttons, not captions.
- **Why:** this closes F4's "seen everything" point.
- **Measure:** a PlayableShift test that the programme-complete card offers all three routes and each opens its workspace.
- **Old contract:** PlayableShift fulfilled-card tests.

**P5. Start the season after the first delivery.** (S, needs owner)
- **Change:** `admit()` in `WorkplaceParticipation.tsx:502` waits until `order-001` is fulfilled.
- **Why:** the first delivery stays the player's own, and the season arrives as a new layer rather than a mystery chip.
- **Measure:** a test in which no season starts before fulfilment.
- **Old contract:** `workplaceAutoplay` admission tests; Nell's direction of 2026-10-04.

**P6. Reorient on return.** (S, safe)
- **Change:** after a restore, if no guide is open and an order is active, open the guide compact on the live order once per session (`startDeliveryJourney` plus the compact store).
- **Why:** the player knows at once what was in progress.
- **Measure:** a reload test shows the compact card with the current order.
- **Old contract:** the persisted `journeyVisible` tests.

**P7. Phone parity.** (S, safe)
- **Change:** a bell and a held-clock chip in the compact overlay, and the achievements list in the Overview sheet.
- **Why:** on phones, notices, pauses and achievements are effectively invisible today (F8).
- **Measure:** a compact-layout test finds both.
- **Old contract:** compact-layout tests and the PA ticker's space.

## Needs the owner

1. **Season auto-start.** It is recorded as Nell's 2026-10-04 direction (`_contprompts/millos_resolute_fix_20261018.md:294`), not in DECISIONS.md. Recommend P5.
2. **D-012 against the existing hint lines.** `PlayableShift.tsx:574, 1011-1016, 1122-1124, 1184, 1203-1208, 1292` and `programmeCompleteDetail` and `noReports` (`PlayableShift.messages.ts:56-57, 164-165`) are helper text. Recommend: keep only the lines that explain a disabled control (they work as error messages) and cut the rest.
3. **D-054 and good news.** Speak an on-time delivery? Recommend no; a sound cue and chip (P1).
4. **Mute semantics.** Recommend mute silences sound only; this changes CLAUDE.md's muted pattern.
5. **The daily bag target.** Recommend dropping it as a headline goal, or deriving it from the accepted programmes, so the HUD names one goal.
6. **D-006.** "Open loaded scene (slow)" (`LoadingScreen.tsx:366-374`) acts as a Continue button. Allowed?

## Not reviewed

Chronicle internals; AI Partner content; Datalinks and LearningNote fact accuracy; the two replay systems in depth (Overview "Replay" scrubs SCADA history, Settings has incident replay); `audioManager` beyond its cue list; load time, layout at 1366×768 and anything at runtime.

## Appendix: the lead's questions

**Q1. The journey.**

| # | Step | Visible goal | Next action |
|---|---|---|---|
| 1 | Loading cover (`App.tsx:701`) | none | wait (D-006) |
| 2 | Tour 1 at Silos, clock held (`GameInterface.tsx:211-218`, `tourCamera.ts:3`) | "Follow the grain" | Next |
| 3 | Tour 2 at Milling | select any machine | Next |
| 4 | Tour 3 at Packing | "today's target" (bags) | Start operating (`:281-291`) |
| 5 | Guide: Riverside Bakers' Cooperative, 6,000 kg, due in 4h; season chip a second later (`WorkplaceParticipation.tsx:532`) | ship by real minute 8 | Inspect a roller mill |
| 6 | Stages to the truck and second trip (`deliveryJourney.ts:161-246`) | same | watch |
| 7 | "Delivery fulfilled", next order (`PlayableShift.tsx:397-488`) | next order | Next action |
| 8 | Real minute 8: bell plus PA grade (`UnifiedGameTick.ts:260-300`) | review | open Overview |
| 9 | Real minute 16: "Programme complete" | accept next | Accept, if the season allows |
| 10 | Programmes repeat (`programmes.ts:43-53`) | same again | nothing points to season or Chronicle |

**Q2. The seams.** Onboarding to the campaign: the guide. Campaign to season: autoplay, unasked. Any layer to the Chronicle: the dock, by curiosity (F4).

**Q3. The ten October findings.**

| # | Status | Evidence |
|---|---|---|
| 1 Freeze when the season ends | Fixed | `workplaceAutoplay.ts:268-273`; test `workplaceAutoplay.test.ts:130` |
| 2 Card stuck on Inspect | Fixed | `deliveryJourney.ts:158-170`; test `deliveryJourney.test.ts:45` |
| 3 bags/h beside the daily target | Partly fixed | rate is now per game hour (`store.ts:86-94`); the target still shows no unit or period (D8) |
| 4 Dead time | Partly fixed | explained (`StatusHUD.test.tsx:93`) and pre-staged (`deliveryJourney.ts:194-199`); the last order of a programme still sits packed with no next customer [Unverified length] |
| 5 Unexplained season chip | Partly fixed | beside the guide card the explanation is sr-only (`WorkplaceParticipation.tsx:549-560`) |
| 6 Camera moves by itself | Fixed | `CameraController.tsx:68`; test `CameraController.test.ts:251` |
| 7 Pace control clipped | Fixed in code | `PlayableShift.tsx:612-614`; the test checks presence only [Unverified] |
| 8 Slow load | Partly fixed | recovery controls after 30 s (`LoadingScreen.tsx:320-376`) |
| 9 Unread notices never surfaced | Still there | the bell is the only surface; none on phones (F8) |
| 10 pt-BR copy | Not a defect | — |

**Q4. "What am I trying to do?"**

| When | Answer | Where it shows |
|---|---|---|
| Minute 1 | the tour's words | tour card |
| Minute 10 | the next order | guide card |
| Minute 60 | grades and programmes | the guide card if still open (it follows the live order, `PlayableShift.tsx:376-380, 439-448`), else Overview |
| Second session | nothing names the goal unless the guide was left open | — |

**Q5, Q7, Q8.** See F6, F1 and F7. The most-needed information more than one click away is the current order and its due time.

**Q6. Achievements.** No unlock is marked beyond a bell row the badge ignores. 17 defined; 6 hidden as untracked: trust-builder, flourishing-focus, team-player, happy-workforce, break-time, emergent-cooperation (`achievementsStore.ts:214-269`). The 11 visible:

| Achievement | Earned by | Points to a mechanic? |
|---|---|---|
| First Bag, Century, Thousand | waiting for bags [time Unverified] | no |
| Interlock Proven | completing the drill | yes, Safety |
| Zero Incidents | 24 game hours (48 real minutes) without a stop or near miss | waiting |
| Full Capacity | not earnable by default (D2) | Settings, hidden |
| Maintenance Master | servicing a machine before it breaks | yes |
| First Preference, Boundary Setter, Collaborative Spirit, Decision Review | Accept, Reject or Defer on local-engine decisions (`AICommandCenter.tsx:496-521`) [frequency Unverified] | yes, AI Partner |

**Q9. Clock stops.**

| Stop | Screen says why and how to resume |
|---|---|
| player, P, tour, restore, restore failed, workplace, handoff, layout, live SCADA, device upright | yes on desktop (chip, card note and title); on phones only inside the Overview sheet [Inference] |
| Autoplay end | no longer stops the clock |
| Dialogs | never hold the clock (F11) |

**Q10. Keyboard.**
- **On keys:** P, I, O, V, the camera presets 1–7 and ?.
- **Not on keys:** the commitment, the bell, Safety, the Chronicle.
- **Discoverability:** only tour card 3's ? hint and the More menu's I and V labels, both in tension with D-012.
