# State Management

**Status:** current ownership and mutation reference

**Reviewed:** 2026-08-31

**Target control model:** [Agent Operating Architecture](./AGENT_OPERATING_ARCHITECTURE.md)

MillOS uses domain-specific Zustand stores. `src/store.ts` is a compatibility and SCADA synchronization layer, not the single source of all application state.

## Core rule

Every operational field has one write owner. Consumers read the smallest owner directly. Cross-domain effects are coordinated through named system functions today and will migrate to registered capabilities where they represent operator or Becoming Mind actions.

```text
canonical domain state -> derived projections -> UI and 3D presentation
                       -> SCADA tags and history
                       -> AI observations
                       -> replay and evidence
```

Presentation must not become a competing operational authority.

## Store map

### Operational authorities

| Store                        | Owns                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `gameSimulationStore.ts`     | simulation time, speed, weather, shifts, worker roster state, safety events, fire drill, celebrations |
| `productionStore.ts`         | machine state, production KPIs, AI decision records and responses                                     |
| `materialFlowStore.ts`       | buffers, in-transit material, batches, manifests, mass balance, genealogy                             |
| `qcLabStore.ts`              | sampling, results, dispositions, contamination and recall audit                                       |
| `breakdownStore.ts`          | breakdowns, work orders, parts, repair phases, lockout audit                                          |
| `operationsCampaignStore.ts` | orders, active plan, incidents, constraints, economics, shift reports, operations logbook             |
| `truckScheduleStore.ts`      | receiving and shipping schedules, docking, departure state                                            |
| `safetyStore.ts`             | safety metrics, incident records, configuration, heat-map evidence                                    |

### Evidence and replay

| Store                        | Owns                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `incidentReplayStore.ts`     | bounded replay frames, diagnostic command records, diagnostic export |
| `historicalPlaybackStore.ts` | bounded AI decision history and time-window queries                  |

### AI and knowledge

| Store                 | Owns                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `aiConfigStore.ts`    | AI mode, strategic backend, model readiness, priorities, feature visibility, API cost tracking |
| `aiNarrationStore.ts` | narration queue and narration presentation state                                               |
| `knowledgeStore.ts`   | educational content, unlocks, tours, narration and tooltip preferences                         |

### Experience and device state

| Store                       | Owns                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `uiStore.ts`                | panels, alerts, interface state, UI scale, first-person mode     |
| `graphicsStore.ts`          | quality presets, render features, performance isolation settings |
| `announcementsStore.ts`     | PA mode, captions, context, announcement lifecycle               |
| `audioAnalyzerStore.ts`     | audio analysis values used by visual responses                   |
| `mobileControlStore.ts`     | touch movement, look input, mobile panel state                   |
| `useCameraPositionStore.ts` | camera position projection used by UI consumers                  |
| `achievementsStore.ts`      | achievement definitions and progress                             |

## Compatibility layer

`src/stores/index.ts` exports all primary stores and provides `useMillStore` for older consumers. The combined facade currently composes graphics, simulation, production, safety, and UI state.

`src/store.ts` re-exports that facade and owns SCADA synchronization between operational stores and `SCADAService`.

Rules:

1. New single-domain React code uses the domain hook.
2. New imperative code uses the exact domain's `getState()` only when it is internal to that domain or an existing coordinator.
3. New multi-domain operator actions use the planned capability command plane after the relevant vertical slice exists.
4. Compatibility callers are migrated incrementally. Do not remove the facade until all consumers and SCADA far-side contracts are proven.

## Reading state

Subscribe to the smallest stable selector.

```typescript
const machines = useProductionStore((state) => state.machines);
const gameTime = useGameSimulationStore((state) => state.gameTime);
```

Use `useShallow` when a component selects several sibling fields whose identity changes independently.

```typescript
const { weather, gameSpeed } = useGameSimulationStore(
  useShallow((state) => ({ weather: state.weather, gameSpeed: state.gameSpeed }))
);
```

Imperative reads are appropriate in deterministic coordinators, event handlers, services, and tests:

```typescript
const quality = useQCLabStore.getState();
```

An imperative read is a snapshot. Code that needs future changes must subscribe and retain the cleanup function.

## Canonical state and display state

Canonical state affects future simulation outcomes, invariants, persistence, or replay. Examples include machine wear, batch disposition, active order, work-order phase, and alarm state.

Display state changes presentation only. Examples include panel visibility, camera interpolation, audio analyser bands, hover, and smoothed gauges.

Frame-local state includes mesh transforms, shader uniforms, particles, and transient animation calculations. It stays in refs, controllers, registries, or local component state unless another system needs a bounded canonical projection.

Working if the central tick can run without a rendered UI, and the UI can be reconstructed from canonical state plus explicit presentation preferences.

## Current write paths

### Domain actions

Each store defines typed actions close to its invariants. A domain action should validate its local transition and return enough information for a coordinator to distinguish success from failure.

### Central tick

`UnifiedGameTick.ts` reads several domains and advances the deterministic operational story. It is allowed to coordinate internal simulation transitions. It should not become the generic entrypoint for user or model commands.

### UI handlers

Existing UI controls call store actions directly. During agent-system migration, an operational control moves to a capability handler together with all equivalent AI and automation call sites. UI-only preferences remain direct.

The Phase 0 direct-call inventory is generated at
`build/generated/agent/mutation-inventory.json`. It classifies 124 direct chained store method
calls, including 106 mutations. Its scope and exclusions are explicit in the artifact.
Capabilities are discoverable from the read service, and implemented ones are executable through
the command kernel installed by `installMillOSAgentRuntime`.

### AI effects

`applyDecisionEffects` currently records a response and invokes production actions. This is a compatibility path. Consequence-bearing AI effects will use the same command contract as human actions.

### SCADA writes

`SCADAService` owns tag writes and adapter mode. SCADA writes are a distinct trust boundary. External writes require endpoint-specific authority and far-side verification.

## Cross-domain coordination rules

Before changing one domain on behalf of another:

1. name the canonical owner of every written field;
2. name the initiating actor or deterministic system transition;
3. state the preconditions and relevant invariant IDs;
4. identify far-side consumers that still speak the old contract;
5. define partial failure and compensation;
6. record a causal link and outcome when the action is operationally meaningful;
7. test the full story, not only the first store mutation.

Direct cross-store calls are not automatically defects. They require classification. Internal tick transitions, UI preferences, render diagnostics, compatibility bridges, and operator commands have different migration needs.

## Persistence

Persistence is owned per domain. Persist only state required for recovery or explicit preferences.

Rules:

- validate and migrate persisted input before use;
- cap numeric values and collection sizes;
- never persist credentials in Zustand storage;
- keep schema version and migration tests;
- preserve semantic IDs across migrations;
- distinguish replay history from canonical recovery state;
- invalidate candidate evidence when source or schema fingerprints change.

`src/stores/storage.ts` provides safe storage helpers. `persistenceMigrations.ts` sanitizes legacy data for the stores that use it.

## Boundedness

Operational and evidence collections have explicit caps. Examples include replay frames, diagnostic commands, campaign log entries, reports, incidents, AI decisions, alarms, and audit histories.

When adding a collection, define:

- maximum count or time window;
- eviction order;
- stable cursor or retrieval path;
- what must survive export or audit;
- what persistence and migration apply;
- how compaction affects causal links.

## Planned query plane

The target query plane projects domain state into versioned observation envelopes. It does not own writable copies.

It adds:

- semantic scope and stable URIs;
- composed revision;
- source mode, freshness, quality, and completeness;
- field selection, filtering, pagination, and deltas;
- causal and evidence links;
- explicit distinction among facts, predictions, and replay.

See [Agent Operating Architecture, Query and context plane](./AGENT_OPERATING_ARCHITECTURE.md#9-query-and-context-plane).

## Planned command plane

The command plane wraps consequence-bearing operational actions through:

```text
request -> schema validation -> current-state preview -> authority decision
        -> owner transition or coordinated saga -> events -> invariant checks
        -> terminal receipt -> outcome verification
```

It does not replace store actions. It gives external actors a coherent, auditable route to those actions.

UI preferences, render toggles, and frame-local animation remain outside this plane unless they become operational evidence or safety-relevant controls.

## Dependency and cascade discipline

Before changing a shared interface or owner:

1. search imports and direct consumers;
2. inspect persistence and migrations;
3. inspect SCADA, replay, AI, UI, and runtime measurement consumers;
4. update the complete contract in one coherent change;
5. typecheck immediately;
6. run focused domain tests;
7. run aggregate gates on the exact candidate.

If a change produces a TypeScript cascade, stop and repair the root contract rather than suppressing downstream errors.

## Verification

Store changes normally require:

- focused tests for success, rejection, bounds, migration, and replay;
- cross-domain tests for affected invariants;
- `npm run typecheck`;
- `npm run lint`;
- `npm run format:check`;
- `npm test`;
- `npm run build`;
- runtime proof when assembly, timing, persistence, or external adapters matter.

Passing source checks do not prove browser persistence, multi-tab IndexedDB, real external adapters, human operability, deployment, or publication.
