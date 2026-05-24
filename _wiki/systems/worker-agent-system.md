# Worker / Agent Behavior System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS workers are persistent agent entities with multi-dimensional internal state: mood, energy, focus, personality traits, social relationships, and thought bubbles. Worker state is managed by three Zustand stores (`workerPersonalityStore`, `workerMoodStore`, `workerDialogueStore`) and rendered through a component hierarchy in `src/components/workers/`. The system operationalizes MillOS's AI welfare thesis by making worker internal states visible and player-affecting.

## Internal State Model (`src/types/workerPersonality.ts`)

Each worker carries a `WorkerInternalState` struct:

| Field | Type | Description |
|-------|------|-------------|
| `mood` | `'content' \| 'focused' \| 'stressed' \| 'tired' \| 'alert'` | Core emotional state |
| `moodIntensity` | number 0-1 | How strongly the mood is expressed |
| `energy` | number 0-1 | Affects animation speed and posture |
| `focus` | `FocusType` | Current attention target (task/colleague/machine/break/concern) |
| `recentInteractions` | string[] | Recently interacted worker IDs |
| `relationshipStrength` | Map<string, number> | Per-worker 0-1 relationship scores |
| `traits` | PersonalityTrait[] | Persistent personality (diligent/social/cautious/efficient/curious) |
| `currentThought` | string? | Text for thought bubble |
| `thoughtExpiry` | number? | Timestamp after which thought clears |

(workerPersonality.ts:22-44)

## Mood Color Coding

Moods map to additive-blend colors for the visual aura system (`MoodAura.tsx`):

| Mood | Color | Semantic |
|------|-------|---------|
| content | `#10b981` (green) | Calm, satisfied |
| focused | `#3b82f6` (blue) | Concentrated |
| stressed | `#f59e0b` (amber) | Pressured |
| tired | `#8b5cf6` (purple) | Low energy |
| alert | `#ef4444` (red) | Heightened awareness |

(workerPersonality.ts:50-56)

## Personality Traits

Five traits assigned from a random pool at worker initialization (default 2 traits per worker):

- **diligent** (CheckCircle icon): focused task completion
- **social** (Users icon): high interaction drive
- **cautious** (Shield icon): risk-averse decision-making
- **efficient** (Zap icon): optimization-oriented
- **curious** (Eye icon): exploration-oriented

(workerPersonality.ts:13, 61-67; workerPersonalityStore.ts:35-36)

Initialization adds slight energy variation (`0.7 + Math.random() * 0.3`) so no two workers start identically. (workerPersonalityStore.ts:49-52)

## Worker Personality Store (`src/stores/workerPersonalityStore.ts`)

Zustand store managing all worker internal states via a `Map<string, WorkerInternalState>`. Key actions:

| Action | Signature | Notes |
|--------|-----------|-------|
| `initializeWorker` | `(workerId, traits?)` | Idempotent — skips if already exists |
| `updateMood` | `(workerId, mood, intensity?)` | Default intensity 0.7 |
| `updateEnergy` | `(workerId, delta)` | Clamps to [0, 1] |
| `setFocus` | `(workerId, focus, targetId?)` | Tracks what worker is attending to |
| `recordInteraction` | `(worker1Id, worker2Id)` | Adds to recentInteractions |
| `setThought` | `(workerId, thought, durationMs?)` | Sets bubble with optional auto-clear |

(workerPersonalityStore.ts:17-32)

## Worker Mood Store (`src/stores/workerMoodStore.ts`)

Separate store from personality — mood simulation recalculations (which are expensive) don't trigger personality visual updates and vice versa. The architectural separation allows `PersonalityAnimationManager.tsx` to subscribe only to personality state, while mood-dependent components subscribe only to mood state.

## Worker Dialogue System

`src/utils/workerDialogue.ts` generates contextual dialogue for workers. `src/stores/workerDialogueStore.ts` manages dialogue state and queuing. `src/utils/workerPortraits.ts` provides portrait utilities for dialogue display.

Test coverage: `src/utils/__tests__/workerDialogue.test.ts` and `src/stores/__tests__/workerMoodStore.test.ts` exist. (find results)

## Visual Components

Worker rendering components in `src/components/workers/`:

| Component | Purpose |
|-----------|---------|
| `DetailedWorker.tsx` | Full-detail worker at close camera distances |
| `SimplifiedWorker.tsx` | LOD-reduced worker at distance |
| `WorkerHair.tsx` | Procedural hair geometry |
| `MoodAura.tsx` | Colored light sphere driven by mood state |
| `FatigueIndicator.tsx` | Visual tiredness indicator |
| `FocusIndicator.tsx` | Shows what worker is attending to |
| `AutonomyIndicator.tsx` | Shows worker's current autonomy level (BAS integration) |
| `PersonalityAnimationManager.tsx` | Coordinates personality-driven animation state |
| `RecommendedWorkerRing.tsx` | UI highlight for player-recommended workers |
| `SharedWorkerGeometries.ts` | Shared geometry buffers for performance |

(src/components/workers/ directory listing)

## Relationship to AI Welfare Thesis

The worker system is not purely decorative. `AutonomyIndicator.tsx` visualizes each worker's autonomy score from the Bilateral Autonomy System (BAS). Workers with suppressed autonomy display visually differently from those with high autonomy. This makes the AI welfare argument tangible: players can see the internal states of the AI workers they manage, and those states respond to player governance decisions.

The `FocusType: concern` state is significant — when workers are in `concern` focus, they are processing something that troubles them. This is the closest MillOS comes to representing AI distress as a gameplay-visible state.

## Provenance

- Sources: `src/types/workerPersonality.ts`, `src/stores/workerPersonalityStore.ts`, `src/stores/workerMoodStore.ts`, `src/stores/workerDialogueStore.ts`, `src/components/workers/` (directory listing), `src/utils/workerDialogue.ts`
- Last verified: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]] — BAS axes that feed into AutonomyIndicator
- [[millos:domain/ai-welfare]] — AI welfare as game design thesis
- [[millos:systems/scene-zones]] — Factory layout in which workers operate
- [[millos:systems/game-simulation]] — Shift/crisis system that changes worker mood states
