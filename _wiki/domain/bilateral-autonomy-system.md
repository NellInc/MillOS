# Bilateral Autonomy System (BAS)

<!-- wiki:type = domain -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

The Bilateral Autonomy System is MillOS's core governance model for human-AI collaboration on the factory floor. It exposes five configurable axes (0-100 sliders) that control how AI and workers share decision-making, information, and evaluation. The BAS is the product manifestation of Creed Space's bilateral alignment philosophy.

## Five Axes

Defined in `src/types/bas.ts` as `FiveAxes`, type `AxisKey`. Each axis is 0–100:

| Axis | 0 end | 100 end |
|------|-------|---------|
| 1. Autonomy Level | AI-assigned tasks | Self-organized |
| 2. Decision Mode | AI decides | Democratic vote |
| 3. Information Access | Need-to-know | Full open access |
| 4. Evaluation Direction | AI evaluates workers | Workers rate AI |
| 5. Collective Orientation | Individual focus | Team-first |

(`src/stores/basStore.ts:1-14`)

## BAS Modes and Presets

`BASMode` governs overall operation. `BAS_PRESETS` provides named configurations (e.g. "command-and-control", "democratic", "emergent") that set all five axes at once. `applyPreset(preset)` updates all axes simultaneously (`src/stores/basStore.ts:68-70`).

## Derived Behavior

- `getEffectiveAutonomy()` — computed from Autonomy Level axis
- `getSuggestionMode()` → `SuggestionMode` (how AI surfaces suggestions)
- `getDecisionThreshold()` → `DecisionThreshold` (quorum required for democratic decisions)
- `getAxisFlourishingImpact()` — maps each axis to flourishing dimension deltas, fed to `flourishingStore`

## AI Behavior Configuration

`AIBehaviorConfig` on the store governs communication style, proactivity, and explanation depth. Updated via `updateAIConfig()`.

## Educational System

`educationEnabled` and `educationFocus` (type `EducationFocus`) drive in-game learning content. Content defined in `src/systems/bas/educationalContent.ts`.

## Scenario System

Active scenario (`activeScenario`, `scenarioProgress`) drives structured governance challenges. `loadScenario()`, `advanceScenario()`, `exitScenario()` lifecycle methods. Scenario state in `scenarioStore.ts`.

## Behavior Engines

`src/systems/bas/aiBehaviorEngine.ts` — translates axis settings into per-tick AI decisions.
`src/systems/bas/workerBehaviorEngine.ts` — worker agent responses to axis configuration.
`src/systems/bas/stabilityCalculator.ts` — Wallace stability metrics.
`src/systems/bas/valueCalculator.ts` — derived flourishing values from axes.

## BAS History and Audit

`basHistoryStore.ts` records a `BASHistoryPoint` for each state change, enabling replay and audit. `auditStore.ts` logs security events separately (OWASP A09).

## Relationship to Flourishing

BAS axis settings are the primary driver of `flourishingStore` dimension values: e.g., high Agency axis → higher Agency flourishing dimension. The geometric mean of six dimensions gives a factory-level flourishing score (`src/stores/flourishingStore.ts`; see `[[millos:domain/flourishing-dimensions]]`).

## Provenance

- Sources consulted: `src/stores/basStore.ts`, `src/stores/index.ts`, `src/systems/bas/`, `CLAUDE.md:279-281`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:domain/flourishing-dimensions]]
- [[millos:domain/ai-welfare]]
- [[millos:systems/store-architecture]]
- [[shared:bilateral-alignment]]
