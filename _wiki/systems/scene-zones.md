# Scene Zones

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

The 3D factory scene is organized into four production zones along the Z axis, with an exterior environment and surrounding village/farm areas. `MillScene.tsx` is the main scene composition component; `Machines.tsx` renders zone-specific machine geometries.

## Production Zone Layout

Defined in `src/components/MillScene.tsx` and documented in `CLAUDE.md`:

| Zone | Z position | Contents |
|------|-----------|----------|
| Zone 1 | z = -22 | Silos (Alpha–Epsilon) — raw material storage |
| Zone 2 | z = -6 | Roller Mills (RM-101 to RM-106) — milling floor |
| Zone 3 | z = 6, elevated y = 9 | Plansifters (A–C) — sifting |
| Zone 4 | z = 20 | Packers (Lines 1–3) — packaging output |

## 3D Component Hierarchy

All 3D components render inside `MillScene.tsx`:

**Machines and materials:**
- `Machines.tsx` — silos, mills, sifters, packers with status indicators
- `ConveyorSystem.tsx` — animated conveyor belts and product flow
- `SpoutingSystem.tsx` — grain flow pipes between machines
- `ForkliftSystem.tsx` — autonomous forklifts
- `WorkerSystem.tsx` — worker avatars with pathfinding

**Atmosphere and environment:**
- `DustParticles.tsx` — atmospheric particle effects
- `Environment.tsx` — lighting and factory environment (lens flare with reusable vectors to prevent GC pressure)
- `SkySystem.tsx` — exterior sky
- `ZoneAccentLights.tsx` — per-zone accent lighting
- `AmbientDetails.tsx` — enabled on High/Ultra only

**Exterior and surrounding areas:**
- `FactoryExterior.tsx` — exterior ground surfaces using `EXTERIOR_LAYERS` + polygon offset layering system
- `VillageArea.tsx` — cobblestone village with `villageCobbleMaterial` color tint fix (`src/components/VillageArea.tsx`)
- `FarmArea.tsx` — farm grass and paths

**Emergency:**
- `FireDrillExitMarkers` (component inside `MillScene.tsx`) — glowing green exit circles during drills

## Render Layers and Z-Fighting

Exterior ground surfaces all share `EXTERIOR_LAYERS.ground = -0.02` (Y position) and differ only in `polygonOffset`:
- Grass: `POLYGON_OFFSET.exteriorBase` (factor 4 — renders behind)
- Asphalt: `POLYGON_OFFSET.exteriorMid` (factor 2)
- Roads: `POLYGON_OFFSET.exteriorTop` (factor 0)
- Road markings: `POLYGON_OFFSET.exteriorOverlay` (factor -2, always visible)

Constants defined in `src/constants/renderLayers.ts`: `EXTERIOR_LAYERS`, `FLOOR_LAYERS`, `POLYGON_OFFSET`, `INDICATOR_HEIGHTS`, `SURFACE_LAYERS`, `RENDER_ORDER`.

Material utilities in `src/utils/depthMaterials.ts`: `createFloorOverlayMaterial()`, `createDecalMaterial()`, `createSelectionRingMaterial()`.

## Machine Data Model

`MachineData` (`src/types.ts:28-58`) fields: `id`, `name`, `type` (enum: SILO, ROLLER_MILL, PLANSIFTER, PACKER, CONTROL_ROOM), `position`, `size`, `rotation`, `status`, `metrics` (rpm, temperature, vibration, load, wear 0-100, efficiency 0-100), `lastMaintenance`, `nextMaintenance`, plus optional silo fields (`fillLevel`, `grainQuality`, `grainType`) and machine personality/mood system.

## Performance Notes

- Shader cache key must be deterministic; `Date.now()` in `customProgramCacheKey` causes per-frame shader recompilation (fixed 2025-12-29, `CLAUDE.md:477-498`)
- `SmartForklift.tsx` and `Environment.tsx` use module-level reusable `THREE.Vector3` instances to avoid per-frame GC allocations
- Post-processing (Bloom/Vignette) disabled on Medium quality; `MeshReflectorMaterial` only on High/Ultra

## Provenance

- Sources consulted: `CLAUDE.md:344-351`, `CLAUDE.md:477-650`, `src/components/MillScene.tsx`, `src/types.ts`, `src/constants/renderLayers.ts`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/game-simulation]]
- [[millos:systems/graphics-rendering]]
- [[millos:flows/production-pipeline]]
