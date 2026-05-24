# BAS Value Formula and Stability Engine

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

The Bilateral Autonomy System (BAS) uses a formal value formula V = Z × S × E × F to compute a composite organizational health metric. The formula is implemented in `src/systems/bas/valueCalculator.ts` and `src/systems/bas/stabilityCalculator.ts`. Each factor is normalized 0–1; the multiplicative relationship means weakness in any single factor caps the total. A geometric mean variant is also provided for more balanced sensitivity.

## The V = Z × S × E × F Formula

(src/systems/bas/valueCalculator.ts:1)

| Factor | Name | Components |
|--------|------|-----------|
| **Z** | Resource Index | C (communication) × H (information) × M (material), each normalized |
| **S** | Stability Coefficient | Derived from Wallace friction (α) × delay (τ) < e⁻¹ threshold |
| **E** | Equity Index | Weighted sum of five BAS axes |
| **F** | Flourishing Coefficient | Geometric mean of six eudaimonia dimensions |

`calculateTotalValue(Z, S, E, F)` clamps all inputs to [MIN_VALUE=0.001, 1] and returns the product. At V=0.252, equity is the limiting factor in the docstring example. (src/systems/bas/valueCalculator.ts:62)

`BASELINE_VALUE = 0.25` represents traditional management performance — the threshold above which democratic autonomy adds measurable value. (src/systems/bas/valueCalculator.ts:26)

**Geometric mean variant**: `calculateTotalValueGeometric()` uses the 4th root of the product. This prevents a single near-zero factor from collapsing the score to zero, giving more balanced sensitivity across factors.

## Equity Index Construction

`EQUITY_AXIS_WEIGHTS` (src/systems/bas/valueCalculator.ts:32):

```ts
autonomyLevel:         0.20
decisionMode:          0.30   // Highest weight — decision structure most important
informationAccess:     0.20
evaluationDirection:   0.15
collectiveOrientation: 0.15
```

Equity E is the weighted sum of the five BAS axis scores, normalized to [0, 1].

## Wallace Stability Coefficient

(src/systems/bas/stabilityCalculator.ts:1)

The stability coefficient S derives from the paper "Fog, Friction, Delay and the Failure of Bounded Rationality" (Wallace). The critical threshold is STABILITY_THRESHOLD = e⁻¹ ≈ 0.368:

```
stabilityProduct = α × τ         (friction × delay)
S = 1 - (stabilityProduct / STABILITY_THRESHOLD)
```

When the product equals the threshold, S = 0 (critical instability). When the product exceeds it, the system is formally unstable (S < 0, clamped to 0).

**Engagement adjustment**: `mapEngagementToFriction()` (from `src/stores/engagementStore.ts`) reduces effective friction when worker engagement is high. This creates a positive feedback loop: engaged workers → lower friction → more stability → better conditions for further engagement. (src/systems/bas/stabilityCalculator.ts:29)

The function `calculateEngagementAdjustedStability(baseFriction, delay, engagement)` applies this adjustment.

## Flourishing Coefficient

The flourishing coefficient F is the geometric mean of six eudaimonia dimension scores (src/stores/flourishingStore.ts:1):

1. **Meaning** — purpose and significance in work (drivers: clear goals, visible impact)
2. **Mastery** — skill development and competence (drivers: challenging work, learning)
3. **Connection** — social bonds with colleagues (drivers: team collaboration, trust)
4. **Joy** — positive emotional experiences
5. **Wholeness** — work-life integration
6. **Agency** — sense of control and autonomy

Each dimension has explicit `drivers` and `barriers` arrays used by the UI to display actionable guidance. (src/stores/flourishingStore.ts:51) Geometric mean aggregate ensures all six dimensions must be present; a score of 0 on any dimension brings F to 0.

## Tick Integration

Stability and value calculations are driven by the tick system. `src/systems/CentralTickSystem.ts` and `src/systems/UnifiedGameTick.ts` schedule recalculation of BAS metrics. `DisplaySmoothing.ts` provides interpolation for the UI so rapid metric changes don't create visual flicker. (src/systems/ directory listing)

## Provenance

- Sources consulted: src/systems/bas/valueCalculator.ts (lines 1–80), src/systems/bas/stabilityCalculator.ts (lines 1–80), src/stores/flourishingStore.ts (lines 1–80), src/systems/ directory listing
- Last verified against sources: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]] — five axes this formula evaluates
- [[millos:domain/flourishing-dimensions]] — six-dimension breakdown with domain theory
- [[millos:systems/voting-democratic-governance]] — democratic processes that affect axis scores
- [[millos:domain/economic-democracy]] — ownership structures that interact with equity index
