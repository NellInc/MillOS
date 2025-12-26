# Domain-Specific Stores

This directory contains the refactored Zustand stores, split from the original monolithic `/src/store.ts` into domain-specific modules for better maintainability and code organization.

## Store Architecture

The state management has been divided into 5 domain-specific stores:

### 1. Graphics Store (`graphicsStore.ts`)
**Responsibility:** Graphics quality settings and visual effects configuration

**State:**
- `graphics` - Graphics settings object with quality presets (low/medium/high/ultra)
- Individual effect toggles (SSAO, bloom, dust particles, shadows, etc.)
- Performance settings (particle counts, shadow map sizes, LOD distances)

**Key Actions:**
- `setGraphicsQuality(quality)` - Apply a preset
- `setGraphicsSetting(key, value)` - Toggle individual effects
- `resetGraphicsToPreset(quality)` - Reset to preset

**Persistence:** Settings saved to `millos-graphics` localStorage

---

### 2. Game Simulation Store (`gameSimulationStore.ts`)
**Responsibility:** Game time, environmental conditions, and simulation events

**State:**
- `gameTime` - Current hour (0-24)
- `gameSpeed` - Time multiplier (60 = 1 real sec = 1 game min)
- `weather` - Weather conditions (clear/cloudy/rain/storm)
- `currentShift` - Active shift (morning/afternoon/night)
- `emergencyActive` - Emergency state

**Key Actions:**
- `tickGameTime(deltaSeconds)` - Advance game clock
- `setWeather(weather)` - Change weather
- `triggerShiftChange()` - Initiate shift change
- `triggerEmergency(machineId)` - Start emergency

**Persistence:** Game time, speed, and weather saved to `millos-game-simulation` localStorage

---

### 3. Production Store (`productionStore.ts`)
**Responsibility:** Machines, workers, production metrics, and AI decisions

**State:**
- `machines` - Array of MachineData
- `workers` - Array of WorkerData
- `metrics` - Production KPIs (throughput, efficiency, uptime, quality)
- `aiDecisions` - AI decision history
- `achievements` - Unlockable achievements
- `productionTarget` - Daily production goals

**Key Actions:**
- `updateMachineStatus(id, status)` - Change machine state
- `addAIDecision(decision)` - Log AI decision
- `updateMetrics(metrics)` - Update production KPIs
- `incrementBagsProduced(count)` - Track production
- `unlockAchievement(id)` - Award achievement

**Performance:** Uses indexed Maps for O(1) lookups of machines/workers by ID

**Persistence:** Total bags produced and achievements saved to `millos-settings` (legacy compatibility)

---

### 4. Safety Store (`safetyStore.ts`)
**Responsibility:** Safety metrics, incidents, forklift tracking, and speed zones

**State:**
- `safetyMetrics` - Incident counters and days since incident
- `safetyIncidents` - History of safety events
- `forkliftMetrics` - Per-forklift efficiency tracking
- `incidentHeatMap` - Spatial incident data
- `safetyConfig` - Detection radii and safety parameters
- `speedZones` - Designated slow zones

**Key Actions:**
- `recordSafetyStop()` - Log emergency stop
- `addSafetyIncident(incident)` - Record incident
- `updateForkliftMetrics(id, isMoving)` - Track forklift state
- `addSpeedZone(zone)` - Create safety zone

**Persistence:** Safety config and speed zones saved to `millos-safety` localStorage

---

### 5. UI Store (`uiStore.ts`)
**Responsibility:** UI state, alerts, panel visibility, and camera management

**State:**
- `alerts` - Active alert notifications
- `showZones` / `showAIPanel` / `showMiniMap` etc. - Panel toggles
- `theme` - Dark/light mode
- `fpsMode` - First-person mode toggle
- `panelMinimized` - Panel collapse state
- `activeCameraId` - Selected security camera

**Key Actions:**
- `addAlert(alert)` - Show notification
- `dismissAlert(id)` - Clear notification
- `toggleTheme()` - Switch dark/light mode
- `setShowAIPanel(show)` - Toggle AI panel
- `registerCameraContainer(id, element)` - Register camera view

**Persistence:** UI preferences saved to `millos-ui` localStorage

---

## Backwards Compatibility

The original `/src/store.ts` now acts as a **compatibility layer** that re-exports all stores and offers:

1. **Combined `useMillStore` hook** - Merges all stores into a single state object
2. **`useMillStore.getState()`** - Access combined state imperatively
3. **`useMillStore.subscribe()`** - Subscribe to changes across stores
4. **SCADA Integration** - `initializeSCADASync()` for bidirectional sync

### Migration Path

**Old code (still works):**
```typescript
import { useMillStore } from './store';

const machines = useMillStore(state => state.machines);
```

**New code (recommended):**
```typescript
import { useProductionStore } from './stores';

const machines = useProductionStore(state => state.machines);
```

**Benefits of new approach:**
- Better tree-shaking (only import needed stores)
- Clearer separation of concerns
- Reduced re-renders (subscribe to specific stores)
- Easier testing (mock individual stores)

---

## Implementation Notes

### Index Management
Production and Safety stores use **indexed Maps** for O(1) lookups:
- `machinesById` - Fast machine lookup by ID
- `workersById` - Fast worker lookup by ID
- `heatMapIndex` - Spatial indexing for heat maps

These indices are automatically rebuilt when arrays change.

### Persistence Strategy
Each store persists only its relevant state:
- Graphics settings → User preferences
- Game simulation → Session recovery
- Production → Long-term progress (achievements, bags)
- Safety → Configuration and zones
- UI → Panel states and theme

The old unified `millos-settings` storage key is gradually being phased out.

### Performance Considerations
- **Debouncing:** Forklift metrics updates debounced to 100ms
- **Grid indexing:** Heat maps use grid-based deduplication
- **Selective persistence:** Only user-relevant state is persisted
- **Lazy evaluation:** Subscriptions only fire on actual changes

---

## File Structure

```
src/stores/
├── README.md                    # This file
├── index.ts                     # Re-exports + compatibility layer
├── graphicsStore.ts             # Graphics settings
├── gameSimulationStore.ts       # Time, weather, shifts
├── productionStore.ts           # Machines, workers, metrics
├── safetyStore.ts               # Safety, forklifts, incidents
└── uiStore.ts                   # UI state, alerts, panels
```

---

## Testing

To verify the refactoring:

```bash
# TypeScript compilation
npm run build

# Component render test
npm run dev

# Check localStorage keys
# Open DevTools > Application > Local Storage
# Should see: millos-graphics, millos-game-simulation, millos-safety, millos-ui
```

---

## Future Improvements

1. **Smart subscription routing** - Route `useMillStore.subscribe()` calls to specific stores based on selector
2. **Deprecate legacy storage** - Fully migrate away from `millos-settings` key
3. **Store composition** - Allow stores to reference each other (e.g., production store triggering UI alerts)
4. **DevTools integration** - Add Zustand DevTools for time-travel debugging
5. **Performance monitoring** - Track store update frequency and re-render counts

---

## Related Files

- `/src/store.ts` - Main backwards-compatibility export
- `/src/types.ts` - Shared type definitions
- `/src/scada/SCADAService.ts` - SCADA integration (subscribes to productionStore)
