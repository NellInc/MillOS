# SCADA–Store Bidirectional Sync Flow

<!-- wiki:type = flow -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

`initializeSCADASync()` establishes live bidirectional synchronization between Zustand stores and the SCADA service at app startup. Machine states in `productionStore` flow to the simulation adapter; SCADA alarms and critical state flow back to the UI store.

## Flow

1. **App startup**: `initializeSCADASync()` called in `App.tsx` `useEffect` (`src/store.ts:53`)
2. **Async SCADA init**: `initializeSCADA()` resolves with a `SCADAService` instance; cancellation guard prevents processing if component unmounted before completion
3. **STORE → SCADA** (machine state sync):
   - Subscribe to `productionStore.machines` via `useProductionStore.subscribe()`
   - Debounce: only syncs if 200ms have elapsed since last sync (`MACHINE_SYNC_DEBOUNCE_MS = 200`, `src/store.ts:40`)
   - On sync: translates machine state to SCADA tags via `scadaToStoreMetrics()` in `SCADABridge.ts`
4. **SCADA → STORE** (alarm feed):
   - Subscribes to SCADA alarm updates via `SCADAService`
   - Pushes critical alarms to `uiStore` alerts for UI notification
   - Pushes critical-state flag to emergency overlay
5. **Cleanup**: All subscriptions collected into `cleanupFunctions[]`; returned teardown function calls all cleanups on component unmount

## Key Files

| File | Role |
|------|------|
| `src/store.ts` | `initializeSCADASync()`, debounce logic, subscription management |
| `src/scada/SCADAService.ts` | Service that receives machine state and emits alarms |
| `src/scada/SCADABridge.ts` | `scadaToStoreMetrics()` translation |
| `src/scada/adapters/SimulationAdapter.ts` | Default SCADA backend |

## Provenance

- Sources consulted: `src/store.ts:39-130`, `src/scada/SCADAService.ts`, `src/scada/SCADABridge.ts`
- Last verified against sources: 2026-05-23

## See Also

- [[millos:systems/scada-layer]]
- [[millos:systems/store-architecture]]
