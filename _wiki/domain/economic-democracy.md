# Economic Democracy

<!-- wiki:type = domain -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

`ownershipStore.ts` implements a Mondragon cooperative-inspired ownership model: collective worker ownership (51%+), wage solidarity with max pay ratio enforcement, transparent self-set compensation with peer feedback, and democratic investment voting.

## Ownership Model

Workers collectively own 51%+ of the mill. Ownership vests over time via `VestingRule` (years of service → percentage vested). `DistributionModel` supports five types: equal, hours-weighted, role-weighted, tenure-weighted, hybrid (with configurable weights across hours, role, tenure, performance) (`src/stores/ownershipStore.ts:22-36`).

## Wage Solidarity

Max ratio enforced between highest and lowest-paid workers — a hard ceiling on inequality. Workers propose their own compensation (`Compensation.proposedBy = 'self' | 'collective' | 'ai-suggested'`) with a written rationale. All compensation is `visibleToAll = true` (radical pay transparency). Peer feedback recorded per compensation proposal (`PeerFeedback`) (`src/stores/ownershipStore.ts:43-51`).

## Investment Democracy

`InvestmentProposal` defines capital investment proposals. `InvestmentVote` records each worker's vote (approve/reject/abstain). Decisions require reaching democratic quorum set by BAS Decision Mode axis.

## Guiding Principles

From store comment (`src/stores/ownershipStore.ts:9-12`): "Workers before capital", collective ownership, wage solidarity, democratic investment. These align with the broader bilateral alignment philosophy where workers have genuine governance power, not just nominal participation.

## Provenance

- Sources consulted: `src/stores/ownershipStore.ts:1-70`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]]
- [[millos:domain/federation]]
- [[shared:bilateral-alignment]]
