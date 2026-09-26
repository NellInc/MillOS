# Domain Stores

MillOS separates its live simulation state into focused Zustand stores. New code should subscribe to the narrowest store that owns the required state. `useMillStore` remains as a compatibility facade for components that genuinely span several domains.

## Core stores

### Graphics (`graphicsStore.ts`)

Owns quality presets, rendering feature flags, shadow and post-processing budgets, LOD distances, and persisted display preferences.

Primary actions:

- `setGraphicsQuality(quality)` applies a preset, carrying the current SCADA sync and adaptive quality preferences across.
- `setGraphicsSetting(key, value)` changes one graphics setting.
- `resetGraphicsToPreset(quality)` restores the selected preset in full, including SCADA sync and adaptive quality.

Persistence key: `millos-graphics`.

### Game simulation (`gameSimulationStore.ts`)

Owns game time, simulation speed, weather, scheduled run windows, emergency state, and autonomous service-egress verification. The legacy field name `currentShift` remains for saved-state compatibility, but its value is a run window rather than a staffing schedule.

Primary actions:

- `tickGameTime(deltaSeconds)` advances the simulation clock.
- `setWeather(weather)` changes the environment.
- `setShift(runWindow)` selects a run window through the compatibility API.
- `triggerEmergency(machineId)` activates the plant emergency interlock.
- `startEmergencyDrill()` begins automated service-egress verification.

Persistence key: `millos-game-simulation`.

### Production (`productionStore.ts`)

Owns machine state, production metrics, material-flow integration, autonomous decisions, achievements, announcements, incident replay, QC results, and truck scheduling.

Primary actions:

- `updateMachineStatus(id, status)` changes equipment state.
- `addAIDecision(decision)` records an autonomous decision.
- `updateMetrics(metrics)` updates production KPIs.
- `incrementBagsProduced(count)` records packaged output.
- `performMaintenance(machineId)` services a machine through the automated maintenance path.

Persistence retains production progress and achievements through the compatibility settings key.

### Safety (`safetyStore.ts`)

Owns safety metrics, mobile-equipment conflicts, forklift telemetry, incident heat maps, speed zones, and detection thresholds.

Primary actions:

- `recordSafetyStop()` records an emergency stop.
- `addSafetyIncident(incident)` records a route or equipment incident.
- `updateForkliftMetrics(id, isMoving)` updates vehicle state.
- `addSpeedZone(zone)` defines a controlled-speed area.

Persistence key: `millos-safety`.

### UI (`uiStore.ts`)

Owns alerts, panel visibility, theme, first-person mode, camera selection, and interface preferences.

Primary actions:

- `addAlert(alert)` publishes a notification.
- `dismissAlert(id)` clears a notification.
- `toggleTheme()` switches the interface theme.
- `setShowAIPanel(show)` controls the autonomy panel.
- `registerCameraContainer(id, element)` registers a camera viewport.

Persistence key: `millos-ui`.

## Focused stores

The production domain delegates specialised state to `qcLabStore`, `achievementsStore`, `announcementsStore`, `incidentReplayStore`, `truckScheduleStore`, and `materialFlowStore`. Import these directly when a component only needs that subsystem.

`operationsCampaignStore` owns customer orders, plant constraints, operational incidents, recipes, and execution reports.

## Compatibility facade

`src/stores/index.ts` exports the individual stores and `useMillStore`. The facade combines the five core stores and uses `useSyncExternalStore` with selector result caching.

```typescript
// Preferred for a focused subscription
import { useProductionStore } from './stores';

const machines = useProductionStore((state) => state.machines);

// Compatibility path for a cross-domain consumer
import { useMillStore } from './store';

const snapshot = useMillStore((state) => ({
  machines: state.machines,
  weather: state.weather,
}));
```

Imperative subscriptions must retain and invoke the returned cleanup function. Direct store hooks remain preferable because they minimise invalidation and manage React subscription cleanup naturally.

## Performance and persistence

- Production bag increments are accumulated and flushed on a bounded interval.
- Safety heat-map events use spatial indexing and deduplication.
- Combined-store snapshots are invalidated only when a core store changes.
- Each core store persists only the state needed for recovery or user preferences.
- Persistence migrations sanitise legacy UI and knowledge data without restoring removed staffed-operation state.

## Verification

Run the normal project gates after store changes:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

SCADA integration lives in `src/scada/SCADAService.ts`; the backwards-compatible aggregate export lives in `src/store.ts`.
