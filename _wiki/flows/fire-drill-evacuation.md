# Fire Drill Evacuation Flow

<!-- wiki:type = flow -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

The fire drill is a fully functional evacuation simulation. Workers pathfind to nearest exits; forklifts emergency-stop; progress is tracked live. Triggered from the Emergency & Environment Controls panel in `UIOverlay.tsx`.

## Flow

1. **Trigger**: User clicks "START DRILL" in `EmergencyEnvironmentPanel` (`src/components/UIOverlay.tsx`)
2. **Store init**: `startEmergencyDrill(totalWorkers)` — sets `DrillMetrics.active = true`, starts alarm audio, initializes `evacuatedWorkerIds = []` (`src/stores/gameSimulationStore.ts`)
3. **Alarm**: Emergency siren plays continuously via `audioManager`
4. **Worker evacuation**: `WorkerSystem.tsx` checks `drillMetrics.active`; each worker runs at speed 6 units/sec toward their assigned exit (lines ~1983–2024, `src/components/WorkerSystem.tsx`)
5. **Exit assignment**: `getNearestExit(x, z)` returns closest exit by geometric distance (`src/stores/gameSimulationStore.ts`)
6. **Forklift stop**: `ForkliftSystem.tsx` checks drill active flag and halts all movement (line ~559, `src/components/ForkliftSystem.tsx`)
7. **Exit markers**: `FireDrillExitMarkers` component in `MillScene.tsx` renders glowing green circles with labels at each exit
8. **Progress tracking**: UI shows live timer (100ms updates) and "Evacuated: X/Y" count via `DrillMetrics`
9. **Completion**: When all workers call `markWorkerEvacuated(workerId)`, `evacuationComplete = true` and alarm stops; "ALL CLEAR" banner shows with final time
10. **Manual end**: User can click "END DRILL"; `endEmergencyDrill()` resets all metrics

## Exit Points

| Exit | Position | Coverage |
|------|---------|----------|
| Front Exit | z = 50 | Workers with z > 0 |
| Back Exit | z = -50 | Workers with z < -15 |
| West Exit | x = -55 | Workers with x < -20 |
| East Exit | x = 55 | Workers with x > 20 |

Exit positions align with personnel door locations in `FactoryExterior.tsx` (`CLAUDE.md:392-403`).

## Key Files

| File | Role |
|------|------|
| `src/stores/gameSimulationStore.ts` | DrillMetrics state, FIRE_DRILL_EXITS, store functions |
| `src/components/WorkerSystem.tsx` | Evacuation movement behavior (~1983-2024) |
| `src/components/ForkliftSystem.tsx` | Emergency stop (~559) |
| `src/components/MillScene.tsx` | FireDrillExitMarkers component |
| `src/components/UIOverlay.tsx` | EmergencyEnvironmentPanel UI |

## Provenance

- Sources consulted: `CLAUDE.md:380-440`, `src/stores/gameSimulationStore.ts`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/game-simulation]]
- [[millos:systems/scene-zones]]
