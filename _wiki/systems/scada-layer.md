# SCADA Layer

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS implements a full SCADA (Supervisory Control and Data Acquisition) abstraction layer using the adapter pattern. `SCADAService` is the primary orchestration class; it delegates to pluggable protocol adapters (Simulation, REST, MQTT, WebSocket, PI, Wonderware), an `AlarmManager`, and a `HistoryStore`. UI components interact via the `useSCADA` hook.

## Architecture

### Service Layer
`SCADAService` (`src/scada/SCADAService.ts`) orchestrates:
- Protocol adapter selection and lifecycle (connect/stop)
- In-memory tag value cache (`Map<string, TagValue>`)
- Subscriber registry for real-time value and alarm callbacks
- Tag registry built from `MILL_TAGS` tag database

### Protocol Adapters (`src/scada/adapters/`)

| Adapter | Use case |
|---------|----------|
| `SimulationAdapter.ts` | Default — simulates sensor values from store state |
| `RESTAdapter.ts` | Polls a REST endpoint |
| `MQTTAdapter.ts` | MQTT broker subscription |
| `WebSocketAdapter.ts` | WebSocket live feed |
| `PIAdapter.ts` | OSIsoft PI historian |
| `WonderwareAdapter.ts` | AVEVA Wonderware integration |

All adapters implement `IProtocolAdapter` (`src/scada/types.ts`), providing a uniform interface for `connect()`, `stop()`, tag reads/writes, and fault injection.

### Supporting Services
- `AlarmManager.ts` — alarm lifecycle (raise, acknowledge, suppress, clear) with `AlarmSuppression` support
- `HistoryStore.ts` — in-memory tag history with `TagHistoryPoint` records; exposed via `HistorianInterface`
- `HistorianRouter.ts` — routes history queries across adapters
- `tagDatabase.ts` — `MILL_TAGS` constant; helpers `getTagsByMachine()`, `getTagsByGroup()`
- `SCADABridge.ts` — translates SCADA metrics to the Zustand store format via `scadaToStoreMetrics()`

### React Integration
- `useSCADA.ts` — primary hook for component subscriptions; mode: `SCADAMode`
- `useSCADAVisuals.ts` — hooks for SCADA-driven 3D visual state

## Key Types (`src/scada/types.ts`)

- `TagDefinition`, `TagValue`, `TagHistoryPoint` — core tag model
- `Alarm`, `AlarmSuppression` — alarm model
- `SCADAConfig`, `SCADAMode` — config and runtime mode
- `FaultInjection`, `ConnectionStatus`, `AdapterStatistics`, `ConnectionConfig` — operational types

## Store Sync

Bidirectional sync with Zustand is established by `initializeSCADASync()` in `src/store.ts`. Machine state changes in `productionStore` are debounced (200ms) before being forwarded to the simulation adapter. SCADA alarms and critical state are pushed back to the UI store for alert notifications (`src/store.ts:53-130`).

## Provenance

- Sources consulted: `src/scada/SCADAService.ts`, `src/scada/types.ts`, `src/scada/adapters/`, `src/scada/tagDatabase.ts`, `src/scada/SCADABridge.ts`, `src/store.ts`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/store-architecture]]
- [[millos:flows/scada-store-sync]]
