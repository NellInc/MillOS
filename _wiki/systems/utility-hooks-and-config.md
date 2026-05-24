# Utility Layer: Hooks, Config, and Cross-cutting Utilities

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS has a significant utility layer in `src/hooks/` and `src/utils/` that provides GPU resource management, adaptive quality, audio reactivity, performance monitoring, and service worker support. The `src/config/` directory holds feature flags and portrait configuration. These cross-cutting systems support the main simulation without being specific to any zone or gameplay mechanic.

## Hooks (src/hooks/)

All hooks are React custom hooks for Three.js / R3F integration:

| Hook | Purpose |
|------|---------|
| `useAdaptiveQuality.ts` | Adjusts render quality based on GPU performance |
| `useAudioReactive.ts` | Connects audio analyzer to visual components |
| `useAudioState.ts` | Subscribes to audioAnalyzerStore state |
| `useDisposable.ts` | Auto-disposal of Three.js geometries/materials on unmount |
| `useFocusTrap.ts` | Accessibility: keyboard focus containment |
| `useGPUResource.ts` | GPU resource lifetime management |
| `useHistoricalMode.ts` | Toggling historical playback display state |
| `useKeyboardShortcuts.ts` | Global keybinding registry |
| `useKnowledgeIntegration.ts` | Integrates knowledgeStore into components |
| `useMobileDetection.ts` | Viewport/device detection for responsive 3D |
| `useProceduralTextures.ts` | On-demand procedural texture generation |
| `useReducedMotion.ts` | Accessibility: respects prefers-reduced-motion |
| `useSafetySimulation.ts` | Safety simulation state access |
| `useTextureWorker.ts` | Offloads texture work to textureWorker.ts (Web Worker) |

(src/hooks/ directory listing, 2026-05-23)

## GPU Resource Management (src/utils/)

`GPUResourceManager.ts` — singleton managing Three.js object lifecycle to prevent WebGL context loss from resource exhaustion. Works with `useGPUResource.ts` hook and `gpuManagement.ts` / `gpuTrackedResources.ts`. (src/utils/ listing)

`adaptiveQuality.ts` — quality preset logic called by `useAdaptiveQuality`. Four presets (low/medium/high/ultra) adjust shadow maps, antialiasing, draw distance.

`renderProfiler.ts` / `perfMonitor.ts` — frame timing instrumentation. `frameThrottle.ts` — throttles update frequency for non-critical renders.

`objectPool.ts` — generic pool for Three.js objects (reduce GC pressure in hot paths like worker agent movements and machine particles).

## Texture Pipeline

`textureCompression.ts`, `texturePreloader.ts`, `textureGenerator.ts`, `machineTextures.ts` — layered texture pipeline:
1. Procedural textures generated in `textureWorker.ts` (Web Worker, `src/workers/textureWorker.ts`)
2. Compressed via `textureCompression.ts`
3. Preloaded/cached by `texturePreloader.ts`
4. `sharedMaterials.ts` — single material instances shared across all instances of same type

(src/utils/ listing)

## Configuration (src/config/)

- `featureFlags.ts` — boolean flags controlling experimental features (format consistent with progressive disclosure approach)
- `portraits.ts` — worker portrait configuration: which portrait asset maps to which worker persona

(src/config/ directory listing, 2026-05-23)

## Service Worker

`serviceWorkerRegistration.ts` (src/utils/) — registers the Vite PWA service worker for offline capability. Related to the CNAME static hosting deployment model ([[millos:systems/build-deployment]]).

## AI and Gemini Client

`aiEngine.ts` — AI decision engine abstraction layer. `geminiClient.ts` — Gemini API client. Both in src/utils/. These underpin the AI narration (aiNarrationStore) and AI welfare analysis (aiWelfareStore) that show workers' inner states to the player. (src/utils/ listing)

`workerDialogue.ts` / `workerPortraits.ts` — utilities for generating worker dialogue and managing portrait display in the worker overlay UI.

## VCL Encoder

`vclEncoder.ts` (src/utils/) — encodes worker and machine state into VCL (Value Context Layer) compact strings. Called by VCP integration layer (`encodeWorkersVCL`, `encodeMachinesVCL`). ([[millos:systems/vcp-protocol]])

## Provenance

- Sources consulted: src/hooks/ directory listing, src/utils/ directory listing, src/config/ directory listing, src/workers/ directory listing
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/vcp-protocol]] — VCL encoder is part of the VCP pipeline
- [[millos:systems/graphics-rendering]] — adaptive quality and GPU management integrate with rendering
- [[millos:systems/audio-system]] — audio hooks connect to audioAnalyzerStore
- [[millos:systems/build-deployment]] — service worker registration relates to PWA deployment
