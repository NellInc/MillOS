# Production Pipeline Flow

<!-- wiki:type = flow -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

Grain moves through four sequential processing stages represented by the factory's four zones. The pipeline is visualized in 3D by conveyor and spouting systems; production metrics aggregate bag output across the chain.

## Stages

1. **Intake — Zone 1 (z = -22)**: Five silos (Alpha–Epsilon) store raw grain. Each silo tracks `fillLevel` (0-100%), `grainQuality` (premium/standard/economy/mixed), and `grainType` (Wheat, Corn, Barley, etc.) on `MachineData` (`src/types.ts:47-53`).

2. **Milling — Zone 2 (z = -6)**: Six Roller Mills (RM-101 to RM-106) reduce grain. Machine metrics tracked: `rpm`, `temperature`, `vibration`, `load`, `wear` (0-100, accumulates during operation), `efficiency` (0-100, affected by wear) (`src/types.ts:41-46`).

3. **Sifting — Zone 3 (z = 6, y = 9 elevated)**: Three Plansifters (A, B, C) separate flour by particle size. Elevated position (y=9) in 3D scene (`CLAUDE.md:348`).

4. **Packaging — Zone 4 (z = 20)**: Three Packer Lines (1–3) output finished product in 25kg bags (`BAG_WEIGHT_KG = 25`, `src/types.ts:18`).

## Visualized Material Flow

- `ConveyorSystem.tsx` — animated belts between zones, product bag entities in motion
- `SpoutingSystem.tsx` — grain flow pipes connecting machines
- `ProductionFlowVisualization.tsx` and `DataFlowLine.tsx` — overlay visualization of throughput
- `ProductionMetrics.tsx` — KPI charts and bag count

## Production State

`productionStore` holds `machines` (array of `MachineData`) and production targets (`ProductionTarget`). Bag count updates are debounced through an accumulator: `pendingBagIncrement` flushes every 500ms via `_directIncrementBags()` to prevent cascade re-renders from conveyor-crossing events (`src/stores/productionStore.ts:46-58`).

## Quality Control

`qcLabStore.ts` (extracted from `productionStore`) manages quality test results (`QCGrade`, `QualityTestResult`, `QCLabState`). Results feed into `ProductionMetrics` and `SPCCharts.tsx`.

## AI Decisions in Pipeline

`AIDecision` type on `productionStore` represents AI-suggested actions (machine speed, maintenance priority, routing changes). Displayed in `AICommandCenter.tsx` slide-out panel. BAS axis settings govern how much autonomy the AI has over pipeline routing (`src/stores/basStore.ts`; see `[[millos:domain/bilateral-autonomy-system]]`).

## Provenance

- Sources consulted: `CLAUDE.md:344-365`, `src/types.ts`, `src/stores/productionStore.ts`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/scene-zones]]
- [[millos:systems/scada-layer]]
- [[millos:domain/bilateral-autonomy-system]]
