# Flourishing Dimensions

<!-- wiki:type = domain -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

`flourishingStore.ts` tracks worker wellbeing across six eudaimonia dimensions. Aggregate factory-level flourishing uses geometric mean to ensure no single dimension is neglected. Dimension values are driven by BAS axis settings, worker mood, and production state.

## The Six Dimensions

Defined as `FLOURISHING_DIMENSIONS` in `src/stores/flourishingStore.ts:50+`:

| Key | Label | Drivers (examples) | Barriers (examples) |
|-----|-------|-------|---------|
| `meaning` | Meaning | Clear goals, visible impact, recognition | Pointless tasks, lack of feedback |
| `mastery` | Mastery | Skill development, competence | [per store] |
| `connection` | Connection | Social bonds with colleagues | [per store] |
| `joy` | Joy | Positive emotional experiences | [per store] |
| `wholeness` | Wholeness | Work-life integration | [per store] |
| `agency` | Agency | Sense of control and autonomy | [per store] |

(`src/stores/flourishingStore.ts:50-117`)

## Types

`FlourishingDimensionKey`, `FlourishingDimension`, `FlourishingEvent`, `WorkerFlourishing`, `FactoryFlourishing` — all from `src/types/bas.ts`.

`WORKER_ROSTER` from `src/types.ts` defines the worker roster that flourishing is tracked per-worker against. `DEFAULT_WORKER_PREFERENCES` provides baseline preferences.

## Store Dependencies

`flourishingStore` depends on (`src/stores/flourishingStore.ts:31-34`):
- `useBASStore` — axis settings are primary input
- `useProductionStore` — production load, machine status
- `useWorkerMoodStore` — trust/initiative signals

BAS axis-to-flourishing mapping: `getAxisFlourishingImpact()` on `basStore` returns a `Record<string, number>` used by flourishing calculations.

## Aggregate Score

Factory-level flourishing uses geometric mean of all six dimensions: if any dimension reaches zero, overall flourishing collapses to zero. This prevents gaming via specialization — balanced development required.

## Per-Worker Tracking

`WorkerFlourishing` tracks dimension values per worker ID. `FlourishingEvent` logs what caused a dimension to change (for audit and retrospective).

## Provenance

- Sources consulted: `src/stores/flourishingStore.ts:1-120`, `src/types/bas.ts` (inferred from imports)
- Last verified against sources: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]]
- [[millos:domain/economic-democracy]]
- [[shared:bilateral-alignment]]
