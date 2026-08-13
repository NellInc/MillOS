# Fire Drill Evacuation Flow

<!-- wiki:type = flow -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-13 -->
<!-- wiki:status = active -->

## Summary

The fire drill is a simulated evacuation journey started from
`src/components/ui-new/panels/SafetyPanel.tsx`. It activates the alarm layer,
stops forklifts, sends workers to the geometrically nearest exit, and records a
candidate-local elapsed time and evacuated count.

## Flow

1. SafetyPanel calls `startEmergencyDrill(totalWorkers)`.
2. `src/stores/gameSimulationStore.ts` initializes `DrillMetrics` and alarm state.
3. `src/components/EmergencyOverlay.tsx` presents the clearly labelled simulated alarm.
4. `src/components/WorkerSystemNew.tsx` uses `getNearestExit` and moves workers at drill speed.
5. `src/components/ForkliftSystem.tsx` enforces the drill stop.
6. `src/components/physics/ExitZoneSensors.tsx` calls `markWorkerEvacuated` at an exit.
7. `FireDrillExitMarkers` in `src/components/MillScene.tsx` shows egress locations.
8. Completion records final time and stops the alarm; manual end resets the drill.

## Exit contract

`FIRE_DRILL_EXITS` in `gameSimulationStore.ts` defines front, back, west, and
east exits. Assignment is geometric rather than a set of hard-coded worker
categories. Duplicate evacuation marks are ignored.

The facility emergency stop is a separate interlock. The UI prevents changing
that interlock while a drill owns the safety state.

## Provenance

- Sources: `src/stores/gameSimulationStore.ts`,
  `src/components/ui-new/panels/SafetyPanel.tsx`,
  `src/components/WorkerSystemNew.tsx`, `src/components/ForkliftSystem.tsx`,
  `src/components/physics/ExitZoneSensors.tsx`
- Last verified: 2026-08-13

## See Also

- [[millos:systems/game-simulation]]
- [[millos:systems/safety-audit-security-logging]]
