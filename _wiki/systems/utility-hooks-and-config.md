# Utility Layer: Hooks, Configuration, and Cross-cutting Systems

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-13 -->
<!-- wiki:status = active -->

## Summary

The utility layer supports adaptive graphics, audio state, accessibility,
keyboard control, mobile layout, GPU ownership, assets, recovery, logging, and
security boundaries. Dead hook barrels and unreferenced prototype utilities were
removed in the exhaustive improvement programme.

## Maintained hooks

| Hook                         | Purpose                                   |
| ---------------------------- | ----------------------------------------- |
| `useAchievementTracker.ts`   | Achievement progression integration       |
| `useAdaptiveQuality.ts`      | Sustained frame-pressure quality recovery |
| `useAudioReactive.ts`        | Optional audio analysis for visuals       |
| `useAudioState.ts`           | Narrow audio manager subscriptions        |
| `useFocusTrap.ts`            | Modal keyboard containment                |
| `useHistoricalMode.ts`       | Historical playback state                 |
| `useKeyboardShortcuts.ts`    | Registered global shortcuts               |
| `useKnowledgeIntegration.ts` | Knowledge-store integration               |
| `useMobileDetection.ts`      | Compact and orientation layout state      |
| `useReducedMotion.ts`        | User motion preference                    |
| `useSafetySimulation.ts`     | Safety simulation integration             |

## GPU and texture path

`src/utils/GPUResourceManager.ts` owns registered resources and budgets.
`src/utils/gpuTrackedResources.ts` registers shared runtime resources and
recreators. `src/utils/textureCompression.ts` configures KTX2 support.
Procedural textures are generated and cached through `src/textures/` and
`src/utils/textureGenerator.ts`; there is no maintained texture Web Worker.

`src/utils/resourcePersistence.ts` only reads a bounded legacy memory budget.
The earlier resource-metadata recreation API had no callers and was removed.

## Other boundaries

- `src/utils/serviceWorkerRegistration.ts`, scoped offline cache registration
- `src/utils/modelLoader.ts`, delivered-model availability and preload checks
- `src/utils/sanitize.ts`, bounded names, rooms, and chat input
- `src/utils/vitePathSecurity.ts`, contained legacy archive serving in dev
- `src/utils/logger.ts`, categorized diagnostics

## Provenance

- Sources: `src/hooks/`, `src/utils/`, `src/textures/`, `src/config/`
- Last verified: 2026-08-13

## See Also

- [[millos:systems/graphics-rendering]]
- [[millos:systems/build-deployment]]
