# Game Simulation System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:updated = 2026-09-30 -->
<!-- wiki:status = active -->

## Clock and authority

`src/stores/gameSimulationStore.ts` owns game time, day, shift, speed, weather and emergency/drill state. `src/systems/UnifiedGameTick.ts` advances the live production, material, truck, quality, maintenance and operations authorities. Personnel routines in `src/components/CommunityLife.tsx` are cosmetic observations; they do not produce stock or certify repairs.

## Player pacing and reports

The default pace is 180 simulated seconds per real second. The guided-delivery and Overview controls offer pause, relaxed 30 and standard 180 without resetting process state (`src/components/ui-new/onboarding/PlayableShift.tsx`, `TeachingPace`).

Campaign period keys derive from the game day and visible shift. Period turnover saves a bounded report with dispatch, costs, risks and causal decisions (`src/systems/UnifiedGameTick.ts:846`; `src/stores/operationsCampaignStore.ts`, `tickCampaign`). Overview and compact Overview share the same saved debrief and guarded next-programme controls.

## Safety sequence

The drill is a simulated automated egress-verification sequence. It stops production and forklifts while the sequencer marks the existing service-egress zones. Personnel hold their current safe positions, including when the clock is reframed. No worker evacuation is performed or certified (`src/stores/gameSimulationStore.ts:400-493`; `src/components/MillScene.tsx:398-430`; `src/components/CommunityLife.tsx`).

Ending the drill restores saved pre-emergency machine statuses, clears its interlock and defensively stops any prior alarm. Starting this sequence does not start a siren (`gameSimulationStore.ts:400-474`).

## Current navigation

Desktop and compact walking use the shared 1.7 m eye height and measured ground/stair/bridge surfaces. The physics controller shares the regional bridge/castle sweep (`src/utils/cameraNavigation.ts:4`; `src/utils/castleNavigation.ts`; `src/components/physics/PhysicsFirstPersonController.tsx`). Navigation source tests and actual traversals are distinct proof.

## See also

- [[millos:flows/fire-drill-evacuation]]
- [[millos:systems/scenarios-social-mission]]
