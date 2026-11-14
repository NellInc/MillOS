# D14 helper-text cut: working list (file · key · string · verdict)

The working list behind decision D-097, as it stood on 13 November 2026 when the
cut finished. Items marked OWED were another lane's files at the time; later
lanes dealt with them (the closing sweep, the Chronicle lane and the second
review pass), so read OWED as "passed on", not "outstanding".

Verdicts: CUT (element and both-language key removed) · TRIM (one clause kept: state, refusal or readout) · MOVED (fact moved to label/button/readout/refusal) · KEEP (reason) · OWED (file held by another lane at the time)

## Loading screen
- index.html · .loading-sub · "A live 3D grain mill, from wheat intake to flour dispatch." · CUT (tagline under heading)
- src/stores/knowledgeStore.messages.ts · quoteTraceEveryLot, quoteSafeStop, quoteMotion, quoteOneWorld, quoteAutonomyTrust, quoteAlarmNeeds, quoteBoringMill, quoteCheckMeasurement, quoteForklifts (9) + authorControl, authorVisual, authorArchitecture, authorAutonomy, authorScada, authorLogistics (6) · invented slogans credited to "MillOS ... principle" · REPLACED by 9 sourced facts (factExplosibleDust, factStaticSpark, factSecondaryBlast [hseDust/csbDust]; factExtraction, factTempering [ksuMiddlings]; factRolls, factFallingNumber [wmcMethods]; factStreams [ukfmProcess]; factIntake [ukfmIntake]), source publisher shown in place of the invented author
- LoadingQuote.tsx · quote icon, quotation marks, italics · CUT (a fact is not a quotation)
- SettingsPanel.messages.ts · loadingScreenQuotes "Loading Screen Quotes" · relabelled "Loading screen facts"

## PlayableShift (src/components/ui-new/onboarding)
- programmeCompleteDetail · "The shift debrief shows this shift so far: ..." · CUT (heading + button carry it)
- selectMachineHint · "Select a machine to record your inspection." · CUT (Inspect a roller mill button below)
- switchChallengeHint · "Finish or abandon the challenge before switching customers." · KEEP (why the select is held: refusal)
- switchReviewHint · 3 sentences · TRIM to first clause (refusal)
- switchHandoffHint · 2 sentences · TRIM to first clause (refusal)
- responseQueued · "The response is queued. Await the next ..." · TRIM "The response is queued." (state)
- runningAtPace · "The shift is running at your chosen pace. ..." · CUT (advice; HUD shows pace)
- acceptNextHint · 2 sentences, shown only on an inert press · TRIM to first sentence (refusal)
- lastChallenge · "Last challenge: {status}. The delivery manifests ..." · TRIM to readout
- campaignOptIn · "Opt in to three shifts ... Fictional roles only." · CUT (disclaimer goes to About's one line)
- challengeRules · "New challenges allow {hours} ... customer deadlines still apply." · MOVED to a readout line challengeTerms "{hours} h to recover · up to {kg} kg to dispatch"
- provisionalNote · "This shift is still open. ..." · CUT (heading says "so far: provisional grade")
- noReports · "... saved when the shift closes at {time}. Keep operating, or inspect freely at a slower pace." · TRIM (state clause kept)
- accounts · "Illustrative workplace credits, separate from main mill revenue and pounds: ..." · TRIM disclaimer prefix ("Workplace credits: ...")
- noChoices · KEEP (empty state)
- agreementPausedBy* · KEEP (state + way out)
- rushChoice/rushDeferRisk/rushChangeover · KEEP (the decision's description and price)
- operationsPlay nextAction.consequence (src/simulation) · KEEP (effect of the Next button; explanation-only ones already hidden by an earlier lane)
- challenge.blockedReason · KEEP (refusal reason at the button)

## deliveryJourney (guide card, one line per step)
- fulfilledDetail · "... Departed manifests credit this customer. Inspection is a separate milestone." · TRIM to the receipt clause
- inspectDetail · "Select a silo ... Read its status and buffers ... Full output buffers can reveal ..." · TRIM to the action clause
- departureRule · "Only a departed manifest credits this customer; packed {product} alone does not." · CUT (repeated rule appended to 3 step details)
- qualityRule · "{qualityTarget} Conforming output must pass QC before loading." · TRIM to the target readout
- followDetail · "... Open SCADA for live line telemetry, or select a machine to read its buffers." · TRIM (readout kept, advice cut)
- choose/return/repair/qualityHold/planning/loading/readyToDepart/departed details · KEEP (the step's own action or state)

## Tour (GameInterface)
- introGrainContent · 3 sentences · TRIM to "Grain enters the silos, passes through milling and sifting, and leaves as packed flour."
- introLookContent · 2 sentences · TRIM to first
- introFlourContent · 4 sentences · TRIM to "Keep packing on pace for the programme commitment."
- introKeyboardHint · "Press ? for controls." · KEEP (only way a keyboard player learns the shortcut sheet exists; no other entry point to it)
- OnboardingGuide cameraHelp* · KEEP (behind a disclosure the player opens)

## AI narration cards
- GameInterface reflection card (aiNarrationStore welcome/library/extendedSession/emergencyActive) · CUT at render (src/hooks not touched: unlocks still happen in useKnowledgeIntegration)
- SettingsPanel aiReflections toggle "AI Reflections" · CUT (controls nothing now)
- src/stores/aiNarrationStore.messages.ts bodies · OWED (store copy, now never shown)

## LearningNote
- seeItIn · "See it in {places}. Open Datalinks for the full explanation." · TRIM to "See it in {places}." (inside the player-opened disclosure)
- whyItMatters · disclosure label · KEEP

## StatusHUD
- title heldBy_* on the clock chip · CUT (sr-only status keeps it)
- agreementPacingTitle · CUT
- lineIdleTitle, lineChangeoverTitle · CUT (aria-labels keep the state)
- repositionLabel · KEEP (aria-label)

## Pace
- PlayableShift select title=paceTitle · CUT title (aria-label stays; key kept, used as group aria-label elsewhere)
- Overview pace buttons title=pace label · KEEP (icon-only button; equals its name)

## Safety / E-stop
- SafetyPanel start drill title (clearEmergencyBeforeDrill, drillJustEnded) · MOVED to a visible refusal line under the button, while disabled
- SafetyPanel E-stop title (resolveCrisisFirst, chronicleFireInterlock, endDrillFirst) · MOVED same
- EmergencyStopButton title drillTitle, interlockTitle · CUT (button text states the lock; aria-label keeps the way out)

## Predictive maintenance
- Start service title (underRepairHint/facilityStopHint/belowMinimum/completeHint/partsUnavailableHint) · CUT title; completeHint, partsUnavailableHint keys removed (reasons already printed on the card)

## AICommandCenter
- settings button title settingsTitle* (4 keys) · CUT (aria-label names it)

## AISettingsModal
- overlaysHint · CUT
- modelDownloadNote · CUT; size MOVED onto the download button
- fastRules / bestOfBoth / llmOnly secondary labels on the mode radios · CUT; third radio's label becomes modelOnly "{model} Only"
- mode description paragraph (modeHeuristicDesc, modeLocalOnlyDesc, modeModelOnlyDesc, modeLocalHybridDesc, modeModelHybridDesc) · CUT
- chatgptIntroAfter · TRIM to " and open its 127.0.0.1 address."
- hybridExplanation · TRIM "giving you the best of both worlds" (confirm-step effect kept)
- costNote, openRouterKeyAdvice, openRouterConsent, keyMemoryNote, keyCheckFree, keyTestsBillable, webgpuUnavailable · KEEP (billing, consent, key security, unavailable state)

## SettingsPanel
- knowledgeHelp, interfaceScaleHelp, reduceMotionHelp, diagnosticReplayHelp · CUT
- transcriptEmpty, transcriptNoMatches · TRIM to the state ("Nothing announced yet." / "No matches.")
- resetDayMessage, resetFullMessage(WithMotion) · KEEP (effect on the confirm step)

## SCADAPanel
- grainFlowBody, rearIntakeToFrontDispatch, stage*Description (5) · CUT
- trendFootnote · CUT (trendTableCaption sr-only kept)
- upToSixTags · CUT
- eventHistoryBody, operationsLogbookBody · CUT
- enableToStart · CUT
- conn*Description (5) · CUT (secondary captions)
- proxyNote · KEEP (precondition of the selected connection; it fails without it)
- incidentTitle title on incident chips · CUT
- enterReasonFirst title on disabled shelve/suppress/OOS (3) · CUT (buttons are described by the note input, whose placeholder states the requirement); key removed
- fault lab fault*Description · KEEP (effect of each inject button)
- scadaDisabledBody · KEEP (state)

## Others
- MobilePanel closedLoopNote · CUT (tagline)
- VCLDebugPanel subtitle, howItWorks/howItWorksBefore/howItWorksAfter · CUT (saved badge carries the figure)
- CameraController presetDescription span · CUT
- AgentCockpit receiptIssued · TRIM to first sentence
- AboutModal description (tagline) · REPLACED by the one line: the simulation disclaimer
- EmergencyOverlay bodies · KEEP (state and way out of a blocking stop)
- CostEstimationOverlay onDevice/chatgptNote/pricingNote · KEEP (billing)
- JevAdvisory consent/apiKeyHelp/sendNote/resultCaveat/resultExpiry · KEEP (consent, billing, key handling, safety caveat of an AI result); intro · CUT
- icon-only button titles equal to the name (Dock, Overview tools, music player, timeline, achievements, zones) · KEEP
- truncation titles (track names, incident description, BuildCache value) · KEEP

## OWED at the time (files other lanes held; from a read-only sweep)
- WorkplaceParticipation: take-over button title (autonomousSeasonDetail) CUT; autonomousSeasonDetail, fairnessIntro ("Illustrative credits and modeled minutes..."), rehearsalNotice, handOverNote, seasonIntro, adoptionNote, seasonRequires, guideIntro, autoRunning/autoIdle/autoManual CUT; turnOnly, mandateChecksStatus TRIM
- WorkplaceLab: syntheticNotice ("Synthetic roles only..."), intro* subtitles, shiftIntro, adviserRolePlay, shiftThreeNote, reviewBeforeContinuing, pressureNote, shiftThreeResponseNote, alternativesNote, dispatchUncertain, creditsNote, alwaysActive, approachNote, agreementIntro, manualWorkshopNote, turnsOwn/simulatedOther/answerPacking, sharingNote, workshopRecordsNote/executionRequires, relationshipIntro, retentionNote, outstandingRecovery, confirmationsExpire, surplusDefinition, ballotsRequired, compareCurrentPlan, forecastsSeparate/standaloneExercise, illustrativeForecasts, localDownload CUT; targetLine, accountsLine, chairLine, surplusCharter, restartClears, rehearsalAdvanced, exported TRIM; about 12 more trailing disclaimers
- WorkplaceCampaignArchive: accounts ("Illustrative credits:") TRIM; freshIntro, freshCredits, retainedNote, leftNote CUT; leaveKept TRIM
- WorkplaceCompanion: adviserAbstained, frozenBound, reviewPhase, activePhase, openObjection, deferralValue, creditsValue TRIM
- WorkplaceNegotiation: dispatchUncertain, planningOnly, reviewExperiment CUT; termsOffered, proposalScope, stage*/challengeStatus/correction*/physicalWorkDetail TRIM
- WorkplacePackingEvidence: handoffIntro, actInPlant, scenarioBounds, frozenFacts, isolatedCopies, compareIdeas, firstPackingExplain, briefingRetains, assumeWithheld, moreStock, declinedNoPermission CUT; factsUnavailable, alreadyHeld/alreadyZero, abstainReason, paceValue, objections TRIM
- WorkplacePressureChapter: next* TRIM to one line; step*, extraDutyNote, recoveryNote, repairBelongs/remedyResumes CUT; willingnessExpired, protectedWithoutChallenge, noPressureResponse TRIM
- WorkplaceReplay: intro, captureRequires, replayNote, hearRoles, closingNote, optionalNavigation CUT; noCheckpoint, unequalHorizons, activeNote, reportDownloaded, workplaceCredits ("Illustrative workplace credits") TRIM; guide* narration cards TRIM
- WorkplaceImprovementPanel: introIdea, introProtected, openHoldNote, rolePlayNote, cancelNote, endToReviewNote, finaliseToReleaseNote, remediesNote, roleDecisionsNote, comparisonNote, closeNote, hearAdviserHint/workshopNoForecast/noCapacityBonus CUT; costLine, reserveLine, completeGame, originNote, reviewRecorded TRIM
- MachineInspector: maintain-button title CUT; restart-button title CUT except facility-stop branch (refusal with no visible copy: make it visible); warningGuidance, idleRestartGuidance CUT; repairGuidance, wearThresholds, maintenanceCost*, noMaintenance ("...very lucky"), trendCaption, machineRestarted*Message TRIM
- Chronicle: PlansTab title on Retain and Install CUT (text visible); trials m30-m34 CUT; ChronicleEventHost p10 / presentation b1, struckBody, fellBody TRIM
- simulation: workplaceAutoplay restartHint/readinessHint CUT, missionEvidence/seasonComplete/running/paused TRIM; workplaceImprovement limitationEarly/Complete CUT, evidence*/nextWatch TRIM; workplaceFairness beat*Detail TRIM; workplaceCampaign story*/next*/review* TRIM; workplaceAdvice assumption* CUT
- src/stores/aiNarrationStore.messages.ts: welcome, library, extendedSession, emergencyActive bodies are now never shown (card cut at render): store owner may delete

## Added during the sweep
- SafetyAnalyticsPanel clearTitle, confirmClearTitle (title on Clear heat map) · CUT (aria-label carries it)
- AchievementsPanel confirmTitle/cancelTitle/resetTitle · KEEP (name what Reset/Confirm/Cancel act on)
- GameInterface aiReflection ("AI reflection" aside label) · CUT with the card
- SCADA PT_INCIDENT_PHASE map · removed (only fed the cut title)
- CameraController PT_PRESET_DESCRIPTIONS map · removed (only fed the cut caption)

## Second pass (reconciled against the long-string, muted-text and title sweeps)
- LoadingScreen slowLoad · "... Low graphics can help on a slower device." · TRIM to state (e2e/loading-overlay.spec.ts pinned the old sentence: OWED at the time, since updated)
- TimelinePlayback nothingRecorded · "... Run the simulation and come back." · TRIM
- DecisionReplay awaitingResponse · "... Accept, defer, or reject it from the decision card." · TRIM
- DecisionReplay noMeasuredResult, noControlResponse; DecisionHistoryPanel empty; OverviewPanel firstBatch, awaitingFirstTransfer · KEEP (empty states)
- FirstPersonController clickToEnter, captureFailed, key legend · KEEP (the overlay is the control; legend is a shortcut sheet; captureFailed is an error)
- KeyboardShortcutsModal rows · KEEP (content the player opened)
- SafetyAnalytics confirmClearLabel · KEEP (aria-label)
- OverviewPanel note* (6) · KEEP (QC record readouts); batchListLabel KEEP (aria); recall confirm text KEEP (confirm step)
- truckForkliftHold lane*, ForkliftSystem route refusal, ScreenshotButton errors, AlertSystem near-miss alerts, worldCard communityTask lines, game/shared PA lines · KEEP (refusals, errors, alerts, state, PA)
- BuildCacheDiagnostics service-worker states · KEEP (diagnostic state readouts)
- SCADASetpointControl lines · KEEP (refusals and write results, set by item 1.18)
- RotateDeviceOverlay body · KEEP (the blocking state and its way out)
- WindmillLearningCard bodies · KEEP (lesson content and answer feedback)
- MultiObjectiveDashboard overdriveLine, HudResult, StatusHUD commitment/programme labels · KEEP (readouts, aria)
- StatusHUD repositionLabel · KEEP (aria-label)
- HolographicDisplays/VillageArea/TruckBay/VillageSignage/AgentCockpit `title` props · not DOM tooltips (3D sign text, list headings)

## Non-component catalogues (verdicts for their owners)
- operationsCampaignStore incident *Description (8) · KEEP (incident content); constraint*Detail · KEEP (state); constraintMaintenanceDetail tail "Open Mill Overview, Maintenance to dispatch service, verify the repair and restart." · KEEP (the way out of a block)
- qcLabStore / UnifiedGameTick supplierTraceabilityNote · KEEP (hold reason)
- UnifiedGameTick shiftClosedCaption · KEEP (PA caption, D15)
- productionStore rejectedWithNote, maintenanceRecordRestartNote · KEEP (records)
- App keyboardNote · KEEP (sr-only)
- physicalSession resetHint "{reason} Settings > Simulation > Reset Simulation starts a fresh shift." · OWED: menu path as advice; trim to {reason}
- achievementsStore *Description (24) · KEEP (what each achievement is)
- aiNarrationStore bodies (4) · OWED: never shown now; delete with the store owner

## Workplace widgets and MachineInspector (done in the same lane, from render tests written first)
- WorkplaceCampaignArchive: freshIntro, freshCredits, retainedNote, leftNote CUT; accounts TRIM ("Credits: ..."); leaveKept TRIM to the amounts
- WorkplaceCompanion: adviserAbstained, frozenBound, reviewPhase, activePhase, openObjection, deferralValue, creditsValue TRIM (7)
- WorkplaceNegotiation: dispatchUncertain, reviewExperiment, planningOnly, proposalScope, stageOfferDetail CUT (5); challengeNotRaised, challengeStatus, correctionDone, correctionPending, physicalWorkDetail, termsOffered TRIM (6)
- WorkplaceParticipation: rehearsalNotice, handOverNote, seasonIntro, adoptionNote, seasonRequires, fairnessIntro, guideIntro, autoRunning, autoIdle, autoManual, autonomousSeasonDetail (+ its title on Take over) CUT (11); turnOnly, mandateChecksStatus TRIM
- WorkplaceReplay: intro, captureRequires, replayNote, hearRoles, closingNote, optionalNavigation CUT (6); reportDownloaded, noCheckpoint, unequalHorizons, workplaceCredits, planLine, activeNote TRIM; guideShift/Practices/Agreement/Review narration cards TRIM to one next-step line (4)
- WorkplacePressureChapter: stepRestate, stepRemedy, stepApprove, stepReview, extraDutyNote, recoveryNote, repairBelongs, remedyResumes, nextRunningPauses CUT (9); 15 next* steps TRIM to one sentence; willingnessExpired, protectedWithoutChallenge, noPressureResponse TRIM
- WorkplacePackingEvidence: handoffIntro, actInPlant, abstainReason, scenarioBounds, frozenFacts, isolatedCopies, compareIdeas, firstPackingExplain, briefingRetains, assumeWithheld, keepOpen, moreStock, declinedNoPermission CUT (13); factsUnavailable, paceValue, matchedInput, timingUnavailable, resolveMissing, alreadyHeld, alreadyZero, independentEvidence, objections TRIM (9)
- WorkplaceImprovementPanel: introIdea, introProtected, openHoldNote, cancelNote, endToReviewNote, finaliseToReleaseNote, rolePlayNote, remediesNote, hearAdviserHint, workshopNoForecast, noCapacityBonus, roleDecisionsNote, watchLineDispatch, comparisonNote, closeNote CUT (15); completeGame+completeWorkshop -> complete; costLine, reserveLine, challengeItem, arrangementExpires, reviewRecorded, originNote TRIM
- WorkplaceLab: intro* (4), syntheticNotice, shiftIntro, adviserRolePlay, shiftThreeNote, pressureNote, shiftThreeResponseNote, alternativesNote, dispatchUncertain, creditsNote, alwaysActive, approachNote, agreementIntro, manualWorkshopNote, turnsOwn, simulatedOther, answerPacking, sharingNote, workshopRecordsNote, executionRequires, relationshipIntro, retentionNote, outstandingRecovery, confirmationsExpire, surplusDefinition, ballotsRequired, compareCurrentPlan, forecastsSeparate, standaloneExercise, restartClears, illustrativeForecasts, localDownload CUT (35); reviewBeforeContinuing MOVED to a refusal at Continue (heldRecovery / heldObjection, aria-describedby); rehearsalAdvanced, exported, freshExercise, setupReturned, missionPrompt, targetLine, volunteers, accountsLine, shippedDuringShift, campaignIncomplete, resumeAfter*Note (3), compareBurdens, chairLine, surplusCharter, followOnNone, matchedForecast TRIM (18)
- MachineInspector: titles on Perform Maintenance and Restart Unit CUT (Restart is now described by the visible held reason); warningGuidance, maintenanceTitle CUT; repairGuidance, wearThresholds, maintenanceBelowMinimum, noMaintenance, trendCaption, machineRestartedWornMessage, machineRestartedIncidentMessage TRIM; idleRestartGuidance KEPT (Restart sits in a closed disclosure: the line is the way out); maintenanceCost(Held) KEPT (cost terms on the button, incl. the refund; src/systems/__tests__/unitService.faultRefund.test.ts pins them)
