# Scene Zones

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-13 -->
<!-- wiki:status = active -->

## Summary

`src/components/MillScene.tsx` composes one authored factory and surrounding
site. Machines render through `src/components/machines/CompactMachines.tsx`;
lighting and sky live under `src/components/environment/`; the shell lives under
`src/components/infrastructure/`.

## Production layout

| Zone        | Position        | Contents                                     |
| ----------- | --------------- | -------------------------------------------- |
| Raw storage | rear row        | Five silos, Alpha through Epsilon            |
| Milling     | around z = -6   | Four roller mills, R.M. 101 through R.M. 104 |
| Sifting     | z = 6, elevated | Three plansifters                            |
| Packaging   | z = 25          | Three pack lines                             |

Machine anchors are centralized in `src/constants/siteLayout.ts`; the scene
constructs runtime `MachineData` from those anchors.

## Scene ownership

- `machines/CompactMachines.tsx`, machines, status, decals, and wear
- `environment/OptimizedFactoryEnvironment.tsx`, light and atmospheric owners
- `infrastructure/OptimizedFactoryInfrastructure.tsx`, interior shell
- `ConveyorSystem.tsx` and `SpoutingSystem.tsx`, material transport
- `WorkerSystemNew.tsx` and `ForkliftSystem.tsx`, moving agents
- `FactoryExterior.tsx`, `TruckBay.tsx`, `VillageArea.tsx`, and `FarmArea.tsx`, site
- `terrain/`, unified surrounding ground
- `FireDrillExitMarkers` in `MillScene.tsx`, drill egress indicators

## Depth and colour contracts

Floor, exterior, water, indicator, and transparent draw order are defined in
`src/constants/renderLayers.ts`. Procedural colour textures use explicit sRGB
colour space; data maps stay linear. `scripts/validate-depth-policy.mjs` and
`scripts/validate-shaders.mjs` enforce the source-level contracts. Native visual
review remains necessary for z-fighting, authored composition, and tier parity.

## Provenance

- Sources: `src/components/MillScene.tsx`, `src/constants/siteLayout.ts`,
  `src/constants/renderLayers.ts`, `src/stores/graphicsStore.ts`
- Last verified: 2026-08-13

## See Also

- [[millos:systems/graphics-rendering]]
- [[millos:flows/production-pipeline]]
- [[millos:flows/fire-drill-evacuation]]
