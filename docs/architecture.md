# MillOS Architecture

**Status:** current implementation map

**Reviewed:** 2026-08-31

**Target architecture:** [Agent Operating Architecture](./AGENT_OPERATING_ARCHITECTURE.md)

This document answers “what exists and where is its authority?” The target document answers “what should MillOS become?” Source and runtime evidence remain authoritative over prose.

## System shape

MillOS is a browser-based, real-time 3D grain mill simulation. It combines a persistent operational model, SCADA projections, safety and logistics systems, a strategic and tactical AI layer, an operational React interface, and a continuously rendered Three.js world.

```text
main.tsx
  -> App.tsx
       -> startup and runtime mode
       -> R3F Canvas
            -> PhysicsScene
            -> MillScene and authored world
            -> RuntimeController and live diagnostics
       -> DeferredOperationalUI
            -> GameInterface
            -> SCADA, AI, safety, production, settings, and replay surfaces

CentralTickProvider
  -> CentralTickSystem
       -> UnifiedGameTick
            -> domain-specific Zustand stores
            -> operational world consequences

SCADAService <-> adapters, alarms, history, SCADABridge <-> domain stores and UI
AI engine -> production observations and decision records -> current effect handlers
Replay stores <- snapshots, commands, decisions, and operational events
```

## Technology stack

Use `package.json` as the version authority.

| Concern     | Primary technology                                           |
| ----------- | ------------------------------------------------------------ |
| application | React 19, TypeScript, Vite                                   |
| 3D world    | Three.js, React Three Fiber, Drei, Rapier where enabled      |
| state       | Zustand domain stores                                        |
| UI          | Tailwind CSS, Framer Motion, Lucide, Recharts                |
| SCADA       | browser adapters, IndexedDB history, optional Node proxy     |
| AI          | deterministic heuristics, Gemini or WebGPU strategic backend |
| testing     | Vitest, Playwright, source validators, runtime capture tools |

## Runtime assembly

### Application shell

`src/App.tsx` owns:

- runtime-mode parsing;
- progressive loading of physics, the authored world, and operational UI;
- Canvas lifecycle and WebGL recovery;
- top-level camera and selection bridges;
- SCADA synchronization startup;
- graphics, audio, mobile, and accessibility integration.

The complete world and operational UI are lazy-loaded. A lightweight first frame renders while the authored scene hydrates.

### Runtime modes

`src/runtime/runtimeMode.ts` parses deterministic benchmark and review options. It controls scene, duration, quality, game time, weather, SCADA, PA mode, motion capture, art review, and operational UI capture.

These query parameters are measurement controls. They are not a general operational command interface.

### Runtime diagnostics

`src/components/RuntimeController.tsx` installs `window.__MILLOS_RUNTIME__`.

It exposes:

- performance and scene snapshots;
- motion and checkpoint telemetry;
- named object poses;
- material, light, object, and sample audits;
- camera control for deterministic captures;
- performance-system isolation.

This is the authoritative assembled-scene measurement surface. The planned semantic agent API will link to it rather than duplicate it.

The same controller also installs the separate, non-writable `window.__MILLOS_AGENT__` read
surface. Its `brief`, `query`, `capabilities`, and `trace` methods project canonical operational
store state into bounded immutable envelopes. They do not subscribe to stores, invoke actions, or
replace assembled-scene measurement. `trace` remains explicitly partial until causal command
events exist.

### Agent contract and query plane

Phases 0 through 2 of the agent operating programme are implemented under `src/agent/`. They
provide semantic URIs, 11 domain descriptors, 10 invariant descriptors, capability descriptors
discoverable from the read service, deterministic domain revisions, Level 0 and Level 1
observations, runtime validation, source fingerprints, and generated evidence under
`build/generated/agent/`.

`scripts/agent-brief.mjs` composes bounded Git state and generated contract facts without reading
diffs, environment values, credentials, or arbitrary repository contents. The browser imports the
registry only through the read adapter. Implemented capabilities are executable through the
command kernel that `installMillOSAgentRuntime` composes, and every agent command passes a
capability, revision, authority grant, preview, receipt, and verifier.

The exact Phase 2 production build transforms 3,609 modules. The initial JavaScript budget is
0.45 MiB gzip across five files. A capture-locked shipping-page probe confirmed all four methods,
the non-writable property descriptor, a 3,714-byte live brief, preserved legacy telemetry, and zero
browser console errors. The deterministic local measurement is generated at
`build/generated/agent/query-plane-measurement.json`; its machine-specific timing must be read as
local evidence rather than a universal performance claim.

## Simulation and control

### Central tick

`src/systems/CentralTickSystem.ts` schedules work by priority. `CentralTickProvider.tsx` owns its React lifecycle.

`src/systems/UnifiedGameTick.ts` composes canonical operational transitions including:

- simulation time and day rollover;
- machine wear, temperature, efficiency, status, and breakdowns;
- material flow and production throughput;
- campaign orders, incidents, economics, and constraints;
- maintenance progression and restart confirmation;
- quality and dispatch interlocks;
- truck transfers and loading;
- energy and shift metrics.

The tick stores truth and leaves cosmetic smoothing to presentation systems.

### Domain state

MillOS has 20 domain-oriented `*Store.ts` modules under `src/stores`. `src/store.ts` and `src/stores/index.ts` retain a compatibility facade for older consumers.

New code should use the smallest domain owner directly. See [State Management](./state-management.md) for the ownership map and mutation rules.

### Physical and visual simulation

Frame-local movement and rendering live in components and `src/simulation`. Important separation:

- canonical operational state belongs in stores or deterministic controllers;
- high-frequency pose and cosmetic variance stay outside global stores;
- runtime measurement reads the assembled scene;
- operational commands should not enter the render loop.

## Operational domains

| Domain                                  | Current authority                                 |
| --------------------------------------- | ------------------------------------------------- |
| clock, weather, shifts, drill           | `gameSimulationStore.ts`                          |
| machines, metrics, decision records     | `productionStore.ts`                              |
| inventory, buffers, batches, genealogy  | `materialFlowStore.ts`                            |
| sampling, disposition, recall           | `qcLabStore.ts`                                   |
| breakdowns, work orders, parts          | `breakdownStore.ts`                               |
| orders, incidents, economics, logbook   | `operationsCampaignStore.ts`                      |
| truck schedules and dock state          | `truckScheduleStore.ts`                           |
| safety records and configuration        | `safetyStore.ts`                                  |
| tagged data, alarms, historian          | `src/scada/`                                      |
| recent diagnostic and decision evidence | replay stores                                     |
| presentation preferences                | UI, graphics, audio, mobile, and knowledge stores |

Cross-domain effects currently use explicit coordinator code and some direct `getState()` calls. The target command plane will make consequence-bearing operations inspectable without centralizing all state.

## SCADA architecture

```text
domain truth
  -> SCADA synchronization and tag projection
  -> SCADAService
       -> SimulationAdapter
       -> REST, MQTT, WebSocket, PI, and Wonderware adapters
       -> AlarmManager
       -> HistoryStore and HistorianRouter
  -> SCADAPanel, hooks, alerts, and 3D visual projections
```

Simulation, disconnected, replay, hybrid, and external conditions must remain visibly distinct. External protocol availability does not imply current connectivity or control authority.

See [SCADA Integration](./SCADA_PLAN.md).

## AI architecture

The current AI layer has:

- a fast heuristic tactical engine in `src/utils/aiEngine.ts`;
- strategic reasoning through Gemini or an on-device WebGPU backend;
- mode, backend, priority, model readiness, and cost state in `aiConfigStore.ts`;
- provenance-bearing decision records in `productionStore.ts`;
- human accept, defer, reject, inspect, and replay surfaces in `AICommandCenter.tsx`.

Current decision effects call domain actions directly. The target architecture routes consequence-bearing effects through registered capabilities, authority checks, receipts, and causal evidence.

See [AI Integration](./ai-integration.md).

## Evidence and replay

`incidentReplayStore.ts` records bounded operational frames and diagnostic commands. `historicalPlaybackStore.ts` records bounded AI decision history and time-based queries. The campaign logbook, maintenance audit, quality audit, SCADA alarm history, and historian provide domain evidence.

These are strong local records with different schemas. The target causal evidence plane links them with semantic IDs, correlation and causation IDs, revisions, actors, authority, and outcomes.

## UI architecture

`DeferredOperationalUI.tsx` loads the main interface after the first scene frame. `src/components/ui-new/GameInterface.tsx` hosts the dock, sidebar, panels, alerts, and operational widgets. Large panels such as SCADA and the AI Command Center remain deferred.

The previous UI migration plan is historical. The next design layer is the agent cockpit in the [Agent Operating Architecture](./AGENT_OPERATING_ARCHITECTURE.md#12-agent-cockpit-and-interfaces).

## 3D world architecture

`src/components/MillScene.tsx` composes the factory, machines, conveyors, forklifts, trucks, terrain, water, village, farm, atmosphere, safety markers, and operational signals.

Rendering work must respect:

- canonical site coordinates and render layers;
- reachability, because many legacy modules are intentionally dead;
- shared geometry and material budgets;
- quality-tier contracts;
- capture serialization through `.capture.lock`;
- runtime assembly evidence over source-only assumptions.

## Services and boundaries

Singleton or registry services include audio, GPU resources, positions, vehicle telemetry, SCADA, and runtime measurement. Each service needs explicit lifecycle cleanup and bounded subscriptions.

Important boundaries:

1. browser simulation versus external industrial systems;
2. canonical state versus display smoothing;
3. operational actions versus UI preferences;
4. observed state versus prediction;
5. source validation versus runtime, human, deployment, and publication evidence;
6. current live modules versus archived and unreachable code.

## Current architectural seams

The following are migration targets, not blanket defects:

- broad direct store access makes cross-domain actions difficult to inventory;
- the compatibility aggregate covers only selected core stores;
- runtime diagnostics are rich but not semantically organized for operational control;
- AI, UI, replay, and SCADA describe actions through different contracts;
- documentation from older generations can compete with current source truth;
- causal records correlate some state changes by time or local IDs rather than one cross-domain chain.

The [Agent Operating Architecture](./AGENT_OPERATING_ARCHITECTURE.md) addresses these seams through a strangler migration. It does not require a whole-system rewrite.

## Source navigation

| Question                                | Start here                                                         |
| --------------------------------------- | ------------------------------------------------------------------ |
| How does the app boot?                  | `src/main.tsx`, `src/App.tsx`                                      |
| What is mounted in the world?           | `src/components/MillScene.tsx`                                     |
| What changes canonical state over time? | `src/systems/UnifiedGameTick.ts`                                   |
| Which store owns a value?               | `src/stores/README.md`, `src/stores/`                              |
| How does SCADA project or write data?   | `src/scada/`, `src/store.ts`                                       |
| How are AI decisions produced?          | `src/utils/aiEngine.ts`, `src/stores/aiConfigStore.ts`             |
| What did the assembled scene render?    | `window.__MILLOS_RUNTIME__`                                        |
| How is an incident replayed?            | replay stores and `src/components/game/IncidentReplayControls.tsx` |
| What agent contracts exist now?         | `docs/agent/README.md`, `src/agent/`, `build/generated/agent/`     |
| What should agent control become?       | `docs/AGENT_OPERATING_ARCHITECTURE.md`                             |

## Validation

Choose focused checks for the touched domain, then run repository-mandated aggregate gates before completion. The normal source ladder includes typecheck, lint, formatting, tests, build, asset, shader, depth, bundle, and reachability validation. Runtime, visual, accessibility, performance, external, and human gates remain distinct.
