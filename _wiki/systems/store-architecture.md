# Store Architecture

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS uses Zustand for state management across 25+ domain-specific stores. A backward-compatibility layer (`store.ts`) re-exports from the modular stores index and provides `useMillStore`, a combined hook for components not yet migrated to individual stores. The BAS, flourishing, ownership, federation, and AI welfare stores implement MillOS's governance model.

## Domain Store Groups

### Core Production
- `productionStore.ts` — machines (MachineData), workers, AI decisions, production targets; depends on `qcLabStore`, `achievementsStore`, `announcementsStore`, `incidentReplayStore`, `truckScheduleStore` (`src/stores/productionStore.ts`)
- `gameSimulationStore.ts` — shift data, crisis events, fire drill metrics, weather (`src/stores/gameSimulationStore.ts`)
- `safetyStore.ts` — safety metrics and incidents
- `graphicsStore.ts` — quality presets (Low/Medium/High/Ultra) and rendering flags

### UI
- `uiStore.ts` — alerts, panel visibility
- `workerMoodStore.ts` — per-worker mood state used by flourishing calculations

### Bilateral Autonomy System (BAS)
- `basStore.ts` — Five Axes (0-100 each): Autonomy Level, Decision Mode, Information Access, Evaluation Direction, Collective Orientation; BAS presets; axis-to-flourishing impact mapping (`src/stores/basStore.ts`)
- `stabilityStore.ts` — Wallace stability metrics (coefficient and margin)
- `flourishingStore.ts` — six eudaimonia dimensions per worker and factory aggregate (`src/stores/flourishingStore.ts`)
- `scenarioStore.ts` — active scenario and progress
- `basHistoryStore.ts` — append-only BAS history for audit
- `votingStore.ts` — democratic vote records

### Economic Democracy
- `ownershipStore.ts` — collective ownership, wage solidarity, compensation transparency, investment proposals (`src/stores/ownershipStore.ts`)

### Federation
- `interCooperationStore.ts` — federation membership, knowledge sharing, worker exchanges, federation votes (`src/stores/interCooperationStore.ts`)

### AI Welfare
- `aiWelfareStore.ts` — AI preferences, voice expressions, worker treatment metrics, relationship health, boundary requests, AI suggestions (`src/stores/aiWelfareStore.ts`)

### Engagement and Social
- `engagementStore.ts`, `socialMissionStore.ts`, `emergentCooperationStore.ts`, `knowledgeStore.ts`

### Security
- `auditStore.ts` — client-side OWASP A09 event logging; exports helpers: `auditValidationFailure`, `auditXssBlocked`, `auditRateLimit`, `auditAuthAttempt`, `auditApiError`, `auditSuspiciousInput`, `auditMultiplayer` (`src/stores/auditStore.ts`)

## Backward Compatibility Layer

`src/store.ts` re-exports all stores and provides `useMillStore`, a combined selector hook using `useSyncExternalStore`. Performance fix (Dec 2024): the combined hook only re-renders when the selected value changes via shallow equality, preventing cascading re-renders from any store update (`src/stores/index.ts:10-20`).

The `CombinedStoreState` type is the union of all five core stores: graphics, gameSimulation, production, safety, UI (`src/stores/index.ts:246-250`).

## SCADA Integration

`store.ts` exports `initializeSCADASync()`, called once at app startup, which creates bidirectional sync: machine states from `productionStore` flow to the SCADA simulation adapter (debounced 200ms); SCADA alarms flow back to UI alerts (`src/store.ts:53-130`).

## Provenance

- Sources consulted: `src/stores/index.ts`, `src/store.ts`, `src/stores/basStore.ts`, `src/stores/aiWelfareStore.ts`, `src/stores/flourishingStore.ts`, `src/stores/ownershipStore.ts`, `src/stores/interCooperationStore.ts`, `src/stores/productionStore.ts`, `src/stores/gameSimulationStore.ts`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/scada-layer]]
- [[millos:domain/bilateral-autonomy-system]]
- [[millos:domain/ai-welfare]]
- [[shared:bilateral-alignment]]
