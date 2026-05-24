# Scenarios and Social Mission System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

Two Zustand stores implement BAS-aligned organizational dynamics beyond the core production loop. `scenarioStore.ts` provides scripted simulation scenarios (crisis, democratic transition, growth) with timed events and player choice points. `socialMissionStore.ts` tracks the community/environmental/knowledge-sharing dimension of the Mondragon cooperative model.

## Scenario Store (`src/stores/scenarioStore.ts`)

### Scenario Events

`ScenarioEvent` union (`scenarioStore.ts:22–38`):

- General: `friction_spike`, `delay_increase`, `resource_drop`, `mood_shift`, `demand_surge`, `engagement_change`
- BAS-specific: `vote_called`, `relationship_change`, `solidarity_test`, `federation_request`, `ai_preference`, `choice_point`

Each event has `time` (seconds), `magnitude` (0–1), and `description`. `choice_point` events carry a `ScenarioChoice[]` array with `effects` on friction, delay, trust, solidarity, `relationshipHealth`, `federationTrust` (`scenarioStore.ts:42–60`).

### Scenario Types

Scenarios simulate Semler/Mondragon-inspired situations: crisis response, democratic transitions, growth periods, experimental configurations. Scenarios teach players about organizational dynamics by making consequences observable.

## Social Mission Store (`src/stores/socialMissionStore.ts`)

Implements the social mission pillar of the Bilateral Autonomy System, grounded in Mondragon's principle that cooperatives serve their communities (`socialMissionStore.ts:7–9`).

### Community Impact Metrics (`socialMissionStore.ts:40–50`)

- `localEmploymentCreated`, `localSuppliersUsed`, `localSourcingPercentage`
- `communityInvestments` — `CommunityInvestment[]` with status (`planned|active|completed`) and `impactMetrics`
- `educationalOutreach` — `OutreachProgram[]` typed `education|employment|environment|community`
- `communitySpacesProvided`

### Environmental Stewardship (`socialMissionStore.ts:52–59`)

- `carbonFootprint` (tonnes CO2/year), `carbonReductionTarget`, `currentReduction`
- `wasteReduction`, `renewableEnergyPercentage`, `waterRecyclingRate`

### Knowledge Sharing

Public knowledge sharing tracks the cooperative's contribution to the broader field — open-source outputs, research publications, community training.

## Provenance

- Sources: `src/stores/scenarioStore.ts:1–60`, `src/stores/socialMissionStore.ts:1–60`
- Last verified: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]] — Five Axes; social mission as the fifth axis
- [[millos:domain/federation]] — federation trust fed by `federation_request` scenario events
- [[millos:domain/economic-democracy]] — Mondragon ownership model (related store: ownershipStore)
