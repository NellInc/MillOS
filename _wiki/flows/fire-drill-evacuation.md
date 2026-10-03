# Automated Egress Verification

<!-- wiki:type = flow -->
<!-- wiki:scope = millos -->
<!-- wiki:updated = 2026-09-30 -->
<!-- wiki:status = active -->

## Scope

This legacy filename remains for existing wiki links. The current feature is a simulated automated egress-verification sequence. Anonymous local personnel hold their current positions; the result is not a worker evacuation certificate (`src/components/CommunityLife.tsx`; `src/stores/gameSimulationStore.ts:400-493`).

## Flow

1. Safety, Controls, START DRILL calls `startEmergencyDrill`. Existing emergency/crisis state prevents a conflicting drill (`src/components/ui-new/panels/SafetyPanel.tsx:241-283`; `gameSimulationStore.ts:400-441`).
2. Production statuses are saved and stopped. Forklifts receive an emergency interlock. A simulated `fire_drill` event is recorded. No alarm audio starts (`gameSimulationStore.ts:400-441`).
3. `FireDrillExitMarkers` verifies one authored zone every four seconds, showing zone progress. After completion it holds for five seconds and ends the drill (`src/components/MillScene.tsx:398-430`).
4. END DRILL may close the sequence earlier. It restores saved machine statuses, clears the forklift stop, resets metrics and defensively stops any prior alarm (`gameSimulationStore.ts:442-474`).

## Authored zones

| Zone | Position x, z |
| --- | --- |
| Front service egress | 0, 52 |
| Back service egress | 0, -52 |
| West service egress | -62, 0 |
| East service egress | 62, 0 |

Source: `SERVICE_EGRESS_POINTS`, `src/stores/gameSimulationStore.ts:58-63`.

The metric is `verifiedZoneIds` out of `totalZones`, with `verificationComplete` and `finalTimeSeconds`. It tracks the simulated verification sequence, never an evacuated-person count (`gameSimulationStore.ts`, `DrillMetrics`, `markZoneVerified`).

## See also

- [[millos:systems/game-simulation]]
- [[millos:systems/scene-zones]]
