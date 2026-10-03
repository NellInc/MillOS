# Operations Challenges and Community Commitments

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:updated = 2026-09-30 -->
<!-- wiki:status = active -->

## Current authority

The shipped campaign uses customer orders, recipe execution, incidents, economics and saved shift reports in `src/stores/operationsCampaignStore.ts`. The earlier `scenarioStore.ts` and `socialMissionStore.ts` descriptions referred to removed modules; they are not current functionality. The runtime applies campaign effects through `src/systems/UnifiedGameTick.ts`.

## Player loop

Overview shows a commitment, its blocker and a useful next action. The replayable delivery guide records inspection separately from shipment. Fulfillment requires an evidenced departure, not a packed-bag count. The existing SCADA and QC workspaces remain the operational controls (`src/components/ui-new/onboarding/PlayableShift.tsx`, `deliveryJourney.ts`; `src/components/SCADAPanel.tsx`).

Three optional recovery challenges use the existing power-sag, packaging-shortage and degraded-control incidents. New challenges allow six simulated hours to recover and dispatch up to 1,000 kg of fresh, quality-released goods. This gives two real minutes at standard pace; customer deadlines remain separate, and saved challenges retain their original deadlines. Acknowledgement retains effects; mitigation reduces penalties; guarded manual controller recovery is limited to challenge provenance. Abandonment or expiry remains recorded even after the incident is later recovered (`src/simulation/operationsPlay.ts`; `operationsCampaignStore.ts`, `startChallenge`, `finishChallengeRecovery`, `tickCampaign`).

Shift reports expose dispatch, costs, decisions, remaining risks and grade reasons. Quality failures and unresolved serious incidents cap grades. Settled programmes permit three new 3,000 kg commitments without creating material or revenue (`operationsCampaignStore.ts`, `gradePeriod`, `acceptNextProgramme`; `PlayableShift.tsx`, `ShiftDebrief`).

## Community relationship

The exact Riverside Bakers' Cooperative flour commitment supplies a bounded cosmetic bakery-stock signal after evidenced fulfillment. Other customers do not implicitly supply the grocer. Clock-driven walks, tea breaks and the empty-cart routine remain independent of production; working cues observe machine, quality and maintenance states. These cues never mutate material inventory (`src/simulation/communityLife.ts`, `hasCommunityBakerySupply`, `communityWorkResponse`; `src/components/CommunityLife.tsx`).

No social-investment score, employment simulation or cooperative voting system is asserted here. The guide explains the current customer/community relationship and its material evidence (`src/stores/knowledgeStore.ts`, `community-commitments`).

## Acceptance boundary

Source tests prove rules and state transitions. Rendered journeys, save/reload and eligible-host performance are separate acceptance evidence; this page does not certify completion of those gates.

## See also

- [[millos:systems/game-simulation]]
- [[millos:flows/fire-drill-evacuation]]
