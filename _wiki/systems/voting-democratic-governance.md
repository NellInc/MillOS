# Voting and Democratic Governance System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS implements a Zustand-based democratic voting system (`src/stores/votingStore.ts`) that allows workers to vote on policy changes, AI behavior modifications, schedule changes, work methods, axis configuration changes, and recognition awards. The design is explicitly grounded in Semler's worker self-governance model and Mondragon's one-worker-one-vote principle. Votes have lifecycle state, quorum requirements, approval thresholds, discussion threads, and AI analysis generation.

## Design Principles

The store file opens with explicit attribution:
> "Based on Semler's worker self-governance and Mondragon's one-worker-one-vote."

Workers can vote on:
- Policy changes
- AI behavior modifications
- Schedule changes
- Work method changes
- Axis configuration changes (BAS axes)
- Recognition awards

(votingStore.ts:6-14)

## Vote Data Model

The `Vote` type (from `src/types/bas.ts`) has auto-generated fields:

| Field | Generated vs. provided |
|-------|----------------------|
| `id` | Auto-generated |
| `createdAt` | Auto-generated |
| `status` | Auto-generated (starts as pending) |
| `result` | Auto-generated on close |
| `turnout` | Calculated |
| `discussionThread` | Auto-initialized |
| `openedAt`, `closedAt`, `deadline` | Managed by lifecycle actions |
| `quorumRequired` | From `VOTING_RULES` |
| `approvalThreshold` | From `VOTING_RULES` |

(votingStore.ts:29-47, typed as `Omit<Vote, ...>` in `createVote`)

## Vote Lifecycle

```
createVote → openVote → [workers cast ballots] → closeVote → implementVote
```

Each step has its own store action. `getVoteResult` returns `{passed: boolean, winner: VoteOption | null, turnout: number}`.

`hasWorkerVoted(voteId, workerId)` prevents double-voting. (votingStore.ts:55-62)

## Convenience Constructors

Two specialized `create*Vote` convenience methods:

1. `createAxisChangeVote(axis, currentValue, proposedValue, proposerId)`: Creates a vote to change a BAS axis configuration. Generates structured title/description automatically.
2. `createAIBehaviorVote(title, description, options[])`: Creates a vote about AI behavior with custom option labels.

These convenience constructors connect the voting system to the BAS (Bilateral Autonomy System) — axis changes require democratic approval. (votingStore.ts:70-80)

## AI Integration and Simulation

`generateAIAnalysis(voteId)`: The AI can contribute analysis of an open vote — a comment explaining expected outcomes or trade-offs. This is the AI's voice in democratic deliberation, not a vote.

`simulateWorkerVoting(voteId)`: Simulates NPC workers casting votes (used when a vote opens and human players are not actively resolving it). Uses `WORKER_ROSTER` from `src/types/` to identify eligible voters.

(votingStore.ts:64-68)

## Discussion Threads

Each vote has a `discussionThread` for comments. `addComment(voteId, workerId, content, isAI?)` distinguishes worker comments from AI-generated analysis comments. This allows post-vote logs to show deliberation, not just results.

## Integration with BAS

The voting store imports `useBASStore` and `useUIStore`. When an axis change vote passes and `implementVote` is called, the BAS axis value is updated through `useBASStore`. This makes democratic outcomes binding on the AI governance configuration.

The `AxisKey` type (from `src/types/bas.ts`) determines which axes are votable. All five BAS axes are eligible for worker-initiated change proposals.

## Quorum and Threshold Rules

`VOTING_RULES` (from `src/types/bas.ts`) defines default quorum and approval thresholds. These are configurable at vote creation time, allowing some decisions to require supermajority while others require simple majority.

## Provenance

- Sources: `src/stores/votingStore.ts`, `src/types/bas.ts` (imports), `src/types/index.ts` (WORKER_ROSTER reference)
- Last verified: 2026-05-23

## See Also

- [[millos:domain/economic-democracy]] — Mondragon ownership model; voting as one component of the broader economic democracy system
- [[millos:domain/bilateral-autonomy-system]] — Five BAS axes that workers vote to configure
- [[millos:domain/ai-welfare]] — AI voice in governance as welfare operationalization
- [[millos:systems/worker-agent-system]] — Worker agents who cast and are affected by votes
