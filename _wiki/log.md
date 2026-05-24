# Wiki Log

## [2026-05-23] bootstrap | Initial wiki creation

Pages created: store-architecture, scada-layer, scene-zones, game-simulation, graphics-rendering, fire-drill-evacuation, scada-store-sync, production-pipeline, bilateral-autonomy-system, flourishing-dimensions, economic-democracy, federation, ai-welfare

Sources ingested: CLAUDE.md, src/stores/index.ts, src/store.ts, src/stores/basStore.ts, src/stores/aiWelfareStore.ts, src/stores/flourishingStore.ts, src/stores/ownershipStore.ts, src/stores/interCooperationStore.ts, src/stores/productionStore.ts, src/stores/gameSimulationStore.ts, src/scada/SCADAService.ts, src/types.ts, src/constants/renderLayers.ts

## [2026-05-23] expand | 4 additional pages covering multiplayer, testing, audio, build/deploy
Pages created: systems/multiplayer-architecture, systems/testing-infrastructure, systems/audio-system, systems/build-deployment
Sources ingested: src/multiplayer/MultiplayerManager.ts, src/multiplayer/SignalingService.ts, src/multiplayer/HostMigration.ts, src/stores/multiplayerStore.ts, playwright.config.ts, vite.config.ts (filenames), scada-proxy/ directory, repo root listing
Key findings: PeerJS WebRTC, 20Hz/10Hz broadcast frequencies, host authority over MachineIntent; host migration is MVP-only (ends session); Playwright E2E at localhost:3000; perf-test-*.cjs scripts are standalone GPU/render benchmarks outside vitest suite; CNAME for custom domain; scada-proxy runs independently of Vite build

## [2026-05-23] expand | 3 additional pages covering VCP protocol, BAS value formula, utility layer
Pages created: systems/vcp-protocol, systems/bas-value-formula, systems/utility-hooks-and-config
Sources ingested: src/protocols/vcp/encoder.ts (lines 1–60), src/protocols/vcp/integration.ts (lines 1–80), src/systems/bas/valueCalculator.ts (lines 1–80), src/systems/bas/stabilityCalculator.ts (lines 1–80), src/stores/flourishingStore.ts (lines 1–80), src/protocols/vcp/ directory listing, src/hooks/ listing, src/utils/ listing, src/config/ listing
Key findings: VCP 2.0 encodes 6 layers into compact strings; shift phase derived from 6am–6pm game time (early<25%, mid 25–75%, late 75–95%, handover>95%); V=Z×S×E×F formula with BASELINE_VALUE=0.25 representing traditional management; Wallace stability threshold = e⁻¹ ≈ 0.368; EQUITY_AXIS_WEIGHTS has decisionMode at 0.30 (highest); engagement adjustment reduces effective friction; 14 hooks in src/hooks/ including useAdaptiveQuality, useFocusTrap, useReducedMotion; textureWorker.ts offloads texture work to Web Worker; geminiClient.ts + aiEngine.ts back aiNarrationStore/aiWelfareStore

## [2026-05-23] expand | 3 additional pages covering safety, scenarios, achievements
Pages created: systems/safety-audit-security-logging, systems/scenarios-social-mission, systems/achievements-system
Sources ingested: src/stores/safetyStore.ts:1-60, src/stores/auditStore.ts:1-60, src/stores/scenarioStore.ts:1-60, src/stores/socialMissionStore.ts:1-60, src/stores/achievementsStore.ts:1-60
Key findings: safetyStore has IncidentHeatMapIndex (spatial grid map of accident hotspots) + forklift emergency stop kill-switch; auditStore implements OWASP A09 with 20+ event types (auth/validation/rate-limit/API/session/suspicious/multiplayer); auditStore note: client-side only, production requires server forwarding; scenarioStore has 12 event types including 6 BAS-specific (vote_called, solidarity_test, federation_request, ai_preference, choice_point); socialMissionStore tracks carbon footprint, outreach programs, community investments aligned with Mondragon cooperative principles; achievementsStore has bilateral and social categories alongside production/safety/efficiency

## [2026-05-23] expand | 1 additional page covering stability, material flow, and emergent cooperation
Pages created: systems/stability-material-flow-emergent-cooperation
Sources ingested: src/stores/stabilityStore.ts (full, 525 lines); src/stores/materialFlowStore.ts (lines 1–100); src/stores/emergentCooperationStore.ts (lines 1–210)
Key findings: stabilityStore implements Wallace ατ < e⁻¹ criterion with three cross-store friction modifiers (engagement, ownership, named sources); stability coefficient S feeds V=Z×S×E×F; materialFlowStore models per-machine kg buffers + conveyor segment transit delays (6 material types); emergentCooperationStore gates self-organization on initiative>60 AND managementTrust>50, with 8 task types and 4 value categories; "control doesn't scale, trust does" design principle stated explicitly in store header

## [2026-05-23] expand | 2 additional pages covering worker agent system and voting governance
Pages created: systems/worker-agent-system, systems/voting-democratic-governance
Sources ingested: src/types/workerPersonality.ts, src/stores/workerPersonalityStore.ts, src/stores/workerMoodStore.ts, src/stores/workerDialogueStore.ts, src/stores/votingStore.ts, src/components/workers/ (listing)
Key findings: WorkerInternalState has 9 fields including FocusType:concern as distress proxy; 5 personality traits assigned from pool at initialization with energy variation; mood/personality stores are separate Zustand stores for independent subscription; voting store explicitly grounded in Semler + Mondragon; createAxisChangeVote + createAIBehaviorVote are convenience constructors connecting voting to BAS; AI can generateAIAnalysis on votes (voice but not vote); simulateWorkerVoting for NPC-driven resolution; AutonomyIndicator.tsx makes BAS visible on individual workers

## [2026-05-23] lint | Health check + fixes
Pages fixed: systems/achievements-system, index.md
Findings:
- WARNING (broken cross-ref): [[millos:domain/social-mission]] in achievements-system See Also did not resolve to any existing page. The social mission content lives in systems/scenarios-social-mission (socialMissionStore). Fixed: replaced with [[millos:systems/scenarios-social-mission]].
- WARNING (missing index metadata): index.md lacked wiki:type, wiki:created, wiki:scope header. Fixed: added full metadata block.
- INFO: 26 pages in index match actual files exactly. No orphans. All sampled pages have valid provenance citations. CLEAN on source drift (vcp-protocol, bilateral-autonomy-system, fire-drill-evacuation all verified).
