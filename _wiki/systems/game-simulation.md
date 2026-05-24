# Game Simulation System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

`gameSimulationStore.ts` manages the time-based simulation layer: shift scheduling, handover conversations, crisis events, weather, celebration events, and the fire drill emergency evacuation system. It is one of the five core stores aggregated by `useMillStore`.

## Shift System

`ShiftData` interface (`src/stores/gameSimulationStore.ts`) tracks:
- `currentShift`: 'morning' | 'afternoon' | 'night'
- `shiftStartTime`, `previousShiftNotes`, `shiftIncidents` (typed by severity: low/medium/high/critical)
- `shiftProduction`: target, actual, efficiency percentage
- `outgoingSupervisor`, `incomingSupervisor`
- `handoverPhase`: 'idle' | 'briefing' | 'handover' | 'summary'
- Worker assignments and clock-in/clock-out tracking
- `handoffConversations` — typed `HandoffConversation` records with duration in seconds

## Crisis System

Crisis types: `CrisisType` = 'fire' | 'power_outage' | 'supply_emergency' | 'inspection' | 'weather'
Severity: `CrisisSeverity` = 'low' | 'medium' | 'high' | 'critical' (`src/stores/gameSimulationStore.ts:65-66`)

## Fire Drill Evacuation

State held in `DrillMetrics` (`src/stores/gameSimulationStore.ts:69-77`):
```typescript
interface DrillMetrics {
  active: boolean;
  startTime: number;
  evacuatedWorkerIds: string[];
  totalWorkers: number;
  evacuationComplete: boolean;
  finalTimeSeconds: number | null;
}
```

Store functions: `startEmergencyDrill(totalWorkers)`, `endEmergencyDrill()`, `markWorkerEvacuated(workerId)`, `getNearestExit(x, z)`.

Exit assignment uses nearest-exit logic (geometry-based); four exits at z=50, z=-50, x=-55, x=55 (`CLAUDE.md:392-403`).

## Celebration Events

`CelebrationEvent` with `CelebrationType`: 'milestone' | 'zero_incident' | 'target_met' | 'shift_complete'. Includes optional 3D position for in-scene effects.

## Tick System

`src/systems/CentralTickSystem.ts`, `UnifiedGameTick.ts`, `CentralTickProvider.tsx` — centralized update loop that drives simulation advancement, AI behavior, and worker behavior engines.

`src/systems/bas/aiBehaviorEngine.ts` — AI decision behavior driven by BAS axis settings.
`src/systems/bas/workerBehaviorEngine.ts` — worker agent decisions.
`src/systems/bas/stabilityCalculator.ts` — Wallace stability metrics.
`src/systems/bas/valueCalculator.ts` — computes derived flourishing values from axis state.

## Provenance

- Sources consulted: `src/stores/gameSimulationStore.ts`, `CLAUDE.md:380-440`, `src/systems/`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:flows/fire-drill-evacuation]]
- [[millos:domain/bilateral-autonomy-system]]
- [[millos:systems/store-architecture]]
