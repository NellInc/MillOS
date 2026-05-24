# Federation (Inter-Cooperation)

<!-- wiki:type = domain -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

`interCooperationStore.ts` models the Grain Cooperative Federation: a network of mill units that share knowledge, exchange workers, pool resources in crisis, and govern collectively. The principle is "no unit fails alone."

## Federation Concepts

### Knowledge Sharing

`Learning` records encapsulate transferable insights with lifecycle state: available → reviewing → adopted | rejected. Each learning has `effectiveness` (0-100, how well it worked at source) and `applicabilityScore` (0-100, relevance to receiving unit). `LearningType`: 'bas-config' | 'process' | 'ai-improvement' | 'crisis-response' | 'flourishing' (`src/stores/interCooperationStore.ts:23-45`).

### Worker Exchanges

`WorkerExchange` tracks temporary worker transfers between federation members. `ExchangeStatus`: 'proposed' | 'active' | 'completed'.

### Federation Governance

`FederationVote` governs collective decisions across mills. `VoteStatus` tracks quorum and outcome. `FederationMember` describes each member unit in the cooperative.

## Guiding Principles

From store comment (`src/stores/interCooperationStore.ts:9-14`): "Knowledge multiplies when shared", "Workers before capital", "Democratic federation governance", "Mutual aid in crisis." These mirror Mondragon cooperative principles.

## Relationship to BAS

BAS axis settings (particularly Decision Mode) determine how federation-level votes are weighted. Learnings of type 'bas-config' allow federation members to share governance configurations — a meta-cooperation layer where MillOS instances learn from each other's bilateral alignment experiments.

## Provenance

- Sources consulted: `src/stores/interCooperationStore.ts:1-65`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]]
- [[millos:domain/economic-democracy]]
- [[shared:bilateral-alignment]]
