# MillOS Launch Audit — File/Area Inventory per Lane
_Generated 2026-06-03 14:47. Real src = 521 files / ~211k LOC. Excludes src/0.10 Archive/ (dead)._

## Baseline (GREEN — protect as invariant)
- typecheck PASS · lint PASS · build PASS (10.96s) · tests 1199 pass / 43 files
- Main bundle 1.78MB (437kB gz) · three-rapier 2.26MB · three-core 720kB · charts 343kB

## UI DOM surface (lanes 5 a11y / 6 ux / 7 copy / 8 visual)
```
src/components/game/AchievementsPanel.tsx
src/components/game/GamificationBar.tsx
src/components/game/IncidentReplayControls.tsx
src/components/game/MiniMap.tsx
src/components/game/PAAnnouncementSystem.tsx
src/components/game/ProductionTargetsWidget.tsx
src/components/game/ScreenshotButton.tsx
src/components/game/WorkerLeaderboard.tsx
src/components/game/index.tsx
src/components/game/shared.tsx
src/components/knowledge/AINarration.tsx
src/components/knowledge/Datalinks.tsx
src/components/knowledge/KnowledgeEntryCard.tsx
src/components/knowledge/KnowledgeTooltip.tsx
src/components/knowledge/LoadingQuote.tsx
src/components/knowledge/UnlockNotification.tsx
src/components/mobile/CameraPresetMenu.tsx
src/components/mobile/DPad.tsx
src/components/mobile/MobileControlsOverlay.tsx
src/components/mobile/MobileFirstPersonController.tsx
src/components/mobile/MobilePanel.tsx
src/components/mobile/RotateDeviceOverlay.tsx
src/components/mobile/TouchLookHandler.tsx
src/components/multiplayer/AIDecisionVoting.tsx
src/components/multiplayer/ConnectionQuality.tsx
src/components/multiplayer/MachineLockIndicator.tsx
src/components/multiplayer/MultiplayerChat.tsx
src/components/multiplayer/MultiplayerLobby.tsx
src/components/multiplayer/RemotePlayerAvatar.tsx
src/components/multiplayer/RemotePlayersGroup.tsx
src/components/ui-new/GameInterface.tsx
src/components/ui-new/dock/Dock.test.tsx
src/components/ui-new/dock/Dock.tsx
src/components/ui-new/hud/StatusHUD.tsx
src/components/ui-new/panels/MultiplayerPanel.tsx
src/components/ui-new/panels/OverviewPanel.tsx
src/components/ui-new/panels/SafetyPanel.tsx
src/components/ui-new/panels/SettingsPanel.tsx
src/components/ui-new/panels/WorkforcePanel.tsx
src/components/ui-new/sidebar/ContextSidebar.tsx
src/components/ui-new/sidebar/MachineInspector.tsx
src/components/ui-new/sidebar/MissionControl.tsx
src/components/ui-new/widgets/AIWelfarePanel.tsx
src/components/ui-new/widgets/BASEducation.tsx
src/components/ui-new/widgets/BASTimeline.tsx
src/components/ui-new/widgets/ConceptTooltip.tsx
src/components/ui-new/widgets/EngagementSignaturePanel.tsx
src/components/ui-new/widgets/FederationPanel.tsx
src/components/ui-new/widgets/FiveAxesPanel.tsx
src/components/ui-new/widgets/FlourishingDashboard.tsx
src/components/ui-new/widgets/ManagementStylePanel.tsx
src/components/ui-new/widgets/OwnershipPanel.tsx
src/components/ui-new/widgets/PortraitCard.tsx
src/components/ui-new/widgets/PreferenceRequestWidget.tsx
src/components/ui-new/widgets/ScenarioPlayground.tsx
src/components/ui-new/widgets/SocialMissionPanel.tsx
src/components/ui-new/widgets/StabilityMonitor.tsx
src/components/ui-new/widgets/VCPStatusPanel.tsx
src/components/ui-new/widgets/ValueDashboard.tsx
src/components/ui-new/widgets/VotingPanel.tsx
src/components/ui/ActionPlanTimeline.tsx
src/components/ui/AlertAcknowledgmentFlow.tsx
src/components/ui/CollapsibleLegend.tsx
src/components/ui/ConfidenceBar.tsx
src/components/ui/CostEstimationOverlay.tsx
src/components/ui/DecisionHistoryPanel.tsx
src/components/ui/DecisionReplay.tsx
src/components/ui/EmergencyControlPanel.tsx
src/components/ui/EmergencyStopButton.tsx
src/components/ui/EnergyDashboard.tsx
src/components/ui/GraphicsSettingsPanel.tsx
src/components/ui/IncidentHistoryPanel.tsx
src/components/ui/KeyboardShortcutsModal.tsx
src/components/ui/MillClockDisplay.tsx
src/components/ui/MultiObjectiveDashboard.tsx
src/components/ui/PredictiveMaintenancePanel.tsx
src/components/ui/SafetyAnalyticsPanel.tsx
src/components/ui/SafetyConfigPanel.tsx
src/components/ui/SafetyMetricsDisplay.tsx
src/components/ui/ShiftHandoverSummary.tsx
src/components/ui/StrategicPriorityCards.tsx
src/components/ui/TimelinePlayback.tsx
src/components/ui/TruckScheduleWidget.tsx
src/components/ui/VCLDebugPanel.tsx
src/components/ui/VCLDiffPanel.tsx
src/components/ui/WeatherControlPanel.tsx
src/components/ui/WeatherEffectsOverlay.tsx
src/components/ui/ZoneCustomizationPanel.tsx
-- top-level overlays --
src/components/AICommandCenter.tsx
src/components/AboutModal.tsx
src/components/AlertSystem.tsx
src/components/GeminiSettingsModal.tsx
src/components/HolographicDisplays.tsx
src/components/ProductionMetrics.tsx
src/components/SCADAPanel.tsx
src/components/UIOverlay.tsx
src/components/WorkerDetailPanel.tsx
```

## 3D scene surface (lanes 1 correctness / 9 perf) — SAMPLED via anti-pattern grep + giant-file deep read
```
-- GIANT files (deep read each) --
    6415 src/components/FactoryExterior.tsx
    5932 src/components/TruckBay.tsx
    5864 src/utils/audioManager.ts
    5074 src/components/AmbientDetails.tsx
    4471 src/utils/aiEngine.ts
    4200 src/prototypes/AssetPrototypePage.tsx
    3564 src/components/game/shared.tsx
    2638 src/components/SkySystem.tsx
    2542 src/stores/knowledgeStore.ts
    2311 src/components/Environment.tsx
-- scene component dirs --
src/components/machines/: 15
src/components/workers/: 23
src/components/ambient/: 26
src/components/infrastructure/: 12
src/components/truckbay/: 12
src/components/exterior/: 1
src/components/village/: 3
src/components/farm/: 0
src/components/terrain/: 5
src/components/scenery/: 4
src/components/effects/: 2
src/components/physics/: 7
src/components/models/: 4
src/components/blueprint/: 5
src/components/breakdown/: 1
```

## State/logic surface (lanes 1 / 4)
```
stores: 39 files
achievementsStore.ts aiConfigStore.ts aiNarrationStore.ts aiWelfareStore.ts announcementsStore.ts audioAnalyzerStore.ts auditStore.ts basHistoryStore.ts basStore.ts breakdownStore.ts emergentCooperationStore.ts engagementStore.ts flourishingStore.ts gameSimulationStore.ts graphicsStore.ts historicalPlaybackStore.ts incidentReplayStore.ts index.ts interCooperationStore.ts knowledgeStore.ts materialFlowStore.ts mobileControlStore.ts multiplayerStore.ts ownershipStore.ts productionStore.ts qcLabStore.ts safetyReportStore.ts safetyStore.ts scenarioStore.ts socialMissionStore.ts stabilityStore.ts storage.ts truckScheduleStore.ts uiStore.ts useCameraPositionStore.ts votingStore.ts workerDialogueStore.ts workerMoodStore.ts workerPersonalityStore.ts 
systems: 12  utils: 40  hooks: 15
```

## Integration surface (lane 4 API contracts)
```
scada:
HistorianInterface.ts HistoryStore.ts useSCADAVisuals.ts HistorianRouter.ts SCADAService.ts AlarmManager.ts SCADABridge.ts types.ts useSCADA.ts index.ts tagDatabase.ts adapters/WebSocketAdapter.ts adapters/MQTTAdapter.ts adapters/SimulationAdapter.ts adapters/PIAdapter.ts adapters/messageValidation.ts adapters/WonderwareAdapter.ts adapters/RESTAdapter.ts 
multiplayer:
src/multiplayer/PeerConnection.ts src/multiplayer/SignalingService.ts src/multiplayer/PlayerInterpolation.ts src/multiplayer/types.ts src/multiplayer/MultiplayerManager.ts src/multiplayer/index.ts src/multiplayer/HostMigration.ts src/components/multiplayer/MachineLockIndicator.tsx src/components/multiplayer/MultiplayerLobby.tsx src/components/multiplayer/RemotePlayersGroup.tsx src/components/multiplayer/MultiplayerChat.tsx src/components/multiplayer/RemotePlayerAvatar.tsx src/components/multiplayer/index.ts src/components/multiplayer/ConnectionQuality.tsx src/components/multiplayer/AIDecisionVoting.tsx src/multiplayer/hooks/useMultiplayerSync.ts src/multiplayer/hooks/index.ts 
protocols/vcp:
19
 files
```

## Security surface (lane 2)
- src/utils/{apiSecurity,sanitize,geminiClient,logger}.ts · src/stores/aiConfigStore.ts (KEY persisted plaintext) · src/utils/storage.ts
- multiplayer peer trust: SignalingService, PeerConnection, MultiplayerManager, HostMigration · scada/adapters/RESTAdapter (Bearer)
- index.html CSP (unsafe-inline+unsafe-eval) · public/sw.js · serviceWorkerRegistration.ts
- KNOWN: sanitize* fns exist but NEVER imported (multiplayer chat unsanitized); secureFetch/CSRF/JWT exported-but-unused

## Privacy/GDPR surface (lane 3)
- localStorage keys: millos-ai-config(KEY!), millos-settings, millos-game-simulation, millos-ai-narration, millos-has-played, millos-knowledge; audioManager, perfMonitor, resourcePersistence
- Gemini data egress to Google (user prompts) · multiplayer data sharing (PeerJS) · NO analytics found (verify)

## Legal surface (lane 10) — NONE EXIST
- No privacy/terms/cookie docs. Public deploy millos.net. Client-only + user-supplied key. ASSESS need; FLAG for owner, do not fabricate/publish.

## Dead code / tech debt (lane 11)
- src/0.10 Archive/ (55 tracked; README screenshot refs src/0.10%20Archive/assets/Screenshot.png — MOVE asset first)
- src/components/UIOverlay.tsx.original · 4x *.glb.backup.glb · root: perf-test-*.{cjs,txt}(10), analyze-useMillStore.cjs, optimize_truckbay.py, split_ambient_details.py
- coverage/ (48 tracked — gitignore) · docs/ (61 files sprawl) · src/prototypes/AssetPrototypePage.tsx (4200 lines, shipped as 2nd build input?)
- 34 'any', 9 ts-ignore, 75 console.* (logger exists), 4 eslint-disable, 2 TODO/FIXME

## Launch config (lane 12)
- vite.config.ts (key define commented-OK; prototypes 2nd input) · .gitignore (missing coverage/) · package.json · index.html meta/CSP
- public/sw.js (cache strategy) · CNAME (millos.net) · .env.example MISSING · GitHub Pages deploy (.github/workflows?) · metadata.json
