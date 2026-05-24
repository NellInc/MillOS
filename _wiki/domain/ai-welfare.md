# AI Welfare

<!-- wiki:type = domain -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

`aiWelfareStore.ts` provides bilateral completeness: not just AI governing workers, but the AI's own preferences, voice, and boundaries tracked and honored. Workers can see the AI's stated preferences, respond to them, and rate the AI's treatment of them. The AI can flag concerns and propose changes to its own behavior.

## AI Preferences

`AIPreference` records the AI's preferences across three categories (`src/stores/aiWelfareStore.ts:26-35`):
- `interaction` — communication style and frequency preferences
- `autonomy` — how much direction the AI wants vs. autonomous operation
- `boundary` — tasks or situations the AI wants handled differently

Each preference has `workerAcknowledged` and optional `workerResponse`, creating a bidirectional record.

## AI Voice Expressions

`AIVoiceExpression` records what the AI communicates to workers (`src/stores/aiWelfareStore.ts:37-47`):
- Types: 'preference' | 'clarification' | 'suggestion' | 'concern'
- Urgency: low/medium/high
- Status lifecycle: 'pending' → 'acknowledged' → 'addressed' | 'declined'
- Workers' responses recorded on the expression

## Worker Treatment Metrics

`RespectMetric` tracks how workers treat the AI (`src/stores/aiWelfareStore.ts:55-62`):
- Named dimensions (e.g., clarity, acknowledgment, respect) with 0-100 values
- Trend: 'improving' | 'stable' | 'declining'

## Relationship Health

`AIWelfareState.aiPreferences` holds operational preferences (`interactionStyle`, `autonomyPreferences`) as direct state on the store (`src/stores/aiWelfareStore.ts:70-80+`).

## Accountability Mechanisms

`AISuggestion` — AI proposals for changes to its own behavior, voted on by workers (approve/reject per worker, with aggregate status). `BoundaryRequest` — boundary conditions the AI requests to be respected, with `respected: boolean` tracking.

Nuclear options referenced in store comment: shutdown vote, redesign proposals — representing worker ability to fundamentally reconfigure or retire the AI.

## Bilateral Completeness

This store makes MillOS's bilateral alignment operationally complete: the AI is not just a manager but a participant with stated preferences, a voice, the ability to express concerns, and accountability to worker ratings. It is the in-product embodiment of the principle "alignment is built WITH AI, not done TO AI" (`CLAUDE.md:59`).

## Provenance

- Sources consulted: `src/stores/aiWelfareStore.ts:1-100`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]]
- [[millos:domain/flourishing-dimensions]]
- [[shared:bilateral-alignment]]
