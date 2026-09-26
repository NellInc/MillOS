import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

interface IncidentHeatMapIndex {
  incidentHeatMapIndex: Map<string, { x: number; z: number; intensity: number; type: string }>;
}

function findNearbyIncidentKey(
  index: IncidentHeatMapIndex['incidentHeatMapIndex'],
  x: number,
  z: number,
  threshold: number
): string | undefined {
  // This collection is capped at 100 entries. A bounded scan preserves the
  // original per-axis proximity contract across rounded cell boundaries.
  for (const [key, point] of index) {
    if (Math.abs(point.x - x) < threshold && Math.abs(point.z - z) < threshold) {
      return key;
    }
  }

  return undefined;
}

function getGridKey(x: number, z: number, threshold: number): string {
  return `${Math.round(x / threshold)}_${Math.round(z / threshold)}`;
}

export interface SafetyMetrics {
  nearMisses: number;
  safetyStops: number;
  routeConflicts: number;
  lastIncidentTime: number | null;
  daysSinceIncident: number;
}

/**
 * The one safety-score formula. The HUD and the Overview panel used to carry
 * their own copies and disagreed by the route-conflict term, so a single
 * conflict showed "99%" in the HUD next to "100%" in the panel.
 */
export const computeSafetyScore = (metrics?: Partial<SafetyMetrics> | null): number =>
  Math.max(
    0,
    Math.min(
      100,
      100 -
        (metrics?.nearMisses ?? 0) * 5 -
        (metrics?.safetyStops ?? 0) * 2 -
        (metrics?.routeConflicts ?? 0)
    )
  );

interface SafetyStore {
  // Safety metrics
  safetyMetrics: SafetyMetrics;
  recordSafetyStop: () => void;
  recordRouteConflict: () => void;
  incrementDaysSafe: () => void;
  recordNearMiss: () => void;

  // Safety incident history
  safetyIncidents: Array<{
    id: string;
    type: 'stop' | 'evasion' | 'near_miss' | 'emergency';
    timestamp: number;
    description: string;
    location?: { x: number; z: number };
    forkliftId?: string;
    conflictingVehicleId?: string;
  }>;
  addSafetyIncident: (
    incident: Omit<SafetyStore['safetyIncidents'][0], 'id' | 'timestamp'>
  ) => void;
  clearSafetyIncidents: () => void;

  // Forklift emergency stop
  forkliftEmergencyStop: boolean;
  setForkliftEmergencyStop: (stopped: boolean) => void;

  // Forklift efficiency tracking
  forkliftMetrics: {
    [forkliftId: string]: {
      totalMovingTime: number;
      totalStoppedTime: number;
      lastUpdateTime: number;
      isMoving: boolean;
    };
  };
  // Forklift update times for debouncing (moved from module-level state to Zustand)
  forkliftUpdateTimes: Map<string, number>;
  updateForkliftMetrics: (forkliftId: string, isMoving: boolean) => void;
  resetForkliftMetrics: () => void;
  cleanupForkliftUpdateTimes: () => void; // Cleanup stale entries

  // Incident heat map data
  _incidentIndices: IncidentHeatMapIndex;
  incidentHeatMap: Array<{ x: number; z: number; intensity: number; type: string }>;
  recordIncidentLocation: (x: number, z: number, type: string) => void;
  clearIncidentHeatMap: () => void;
  showIncidentHeatMap: boolean;
  setShowIncidentHeatMap: (show: boolean) => void;

  // Safety configuration
  safetyConfig: {
    vehicleDetectionRadius: number;
    forkliftSafetyRadius: number;
    pathCheckDistance: number;
    speedZoneSlowdown: number; // 0-1, how much to slow down in speed zones
  };
  setSafetyConfig: (config: Partial<SafetyStore['safetyConfig']>) => void;

  // Speed zones (customizable)
  speedZones: Array<{ id: string; x: number; z: number; radius: number; name: string }>;
  addSpeedZone: (zone: { x: number; z: number; radius: number; name: string }) => void;
  removeSpeedZone: (id: string) => void;
  updateSpeedZone: (
    id: string,
    updates: Partial<{ x: number; z: number; radius: number; name: string }>
  ) => void;
}

export const useSafetyStore = create<SafetyStore>()(
  persist(
    (set, get) => ({
      safetyMetrics: {
        nearMisses: 0,
        safetyStops: 0,
        routeConflicts: 0,
        lastIncidentTime: null,
        daysSinceIncident: 0,
      },
      recordSafetyStop: () =>
        set((state) => ({
          safetyMetrics: {
            ...state.safetyMetrics,
            safetyStops: state.safetyMetrics.safetyStops + 1,
            nearMisses: state.safetyMetrics.nearMisses + 1,
            lastIncidentTime: Date.now(),
            daysSinceIncident: 0,
          },
        })),
      recordRouteConflict: () =>
        set((state) => ({
          safetyMetrics: {
            ...state.safetyMetrics,
            routeConflicts: state.safetyMetrics.routeConflicts + 1,
          },
        })),
      incrementDaysSafe: () =>
        set((state) => ({
          safetyMetrics: {
            ...state.safetyMetrics,
            daysSinceIncident: state.safetyMetrics.daysSinceIncident + 1,
          },
        })),
      recordNearMiss: () =>
        set((state) => ({
          safetyMetrics: {
            ...state.safetyMetrics,
            nearMisses: state.safetyMetrics.nearMisses + 1,
            lastIncidentTime: Date.now(),
            daysSinceIncident: 0,
          },
        })),

      // Safety incident history
      safetyIncidents: [],
      addSafetyIncident: (incident) =>
        set((state) => {
          const timestamp = Date.now();
          const baseId = `incident-${timestamp}-${Math.random().toString(36).slice(2, 7)}`;
          const existingIds = new Set(state.safetyIncidents.map((entry) => entry.id));
          let id = baseId;
          let suffix = 1;
          while (existingIds.has(id)) {
            id = `${baseId}-${suffix}`;
            suffix += 1;
          }
          return {
            safetyIncidents: [{ ...incident, id, timestamp }, ...state.safetyIncidents].slice(
              0,
              50
            ),
          };
        }),
      clearSafetyIncidents: () => set({ safetyIncidents: [] }),

      // Forklift emergency stop
      forkliftEmergencyStop: false,
      setForkliftEmergencyStop: (stopped) => set({ forkliftEmergencyStop: stopped }),

      // Forklift efficiency tracking
      forkliftMetrics: {},
      // Forklift update times for debouncing (moved from module-level state to Zustand)
      forkliftUpdateTimes: new Map<string, number>(),
      updateForkliftMetrics: (forkliftId, isMoving) => {
        const state = get();
        const now = Date.now();

        // Debounce: prevent updates faster than 100ms per forklift
        const lastUpdate = state.forkliftUpdateTimes.get(forkliftId) || 0;
        if (now - lastUpdate < 100) return; // Skip this update

        set((state) => {
          const existing = state.forkliftMetrics[forkliftId] || {
            totalMovingTime: 0,
            totalStoppedTime: 0,
            lastUpdateTime: now,
            isMoving: true,
          };

          const timeDelta = (now - existing.lastUpdateTime) / 1000; // Convert to seconds

          // Update both metrics and update times
          const newUpdateTimes = new Map(state.forkliftUpdateTimes);
          newUpdateTimes.set(forkliftId, now);

          return {
            forkliftMetrics: {
              ...state.forkliftMetrics,
              [forkliftId]: {
                totalMovingTime: existing.totalMovingTime + (existing.isMoving ? timeDelta : 0),
                totalStoppedTime: existing.totalStoppedTime + (!existing.isMoving ? timeDelta : 0),
                lastUpdateTime: now,
                isMoving,
              },
            },
            forkliftUpdateTimes: newUpdateTimes,
          };
        });
      },
      resetForkliftMetrics: () =>
        set({
          forkliftMetrics: {},
          forkliftUpdateTimes: new Map(),
        }),
      cleanupForkliftUpdateTimes: () =>
        set((state) => {
          const now = Date.now();
          const cleanedUpdateTimes = new Map(state.forkliftUpdateTimes);
          const activeForkliftIds = new Set(Object.keys(state.forkliftMetrics));

          // Remove entries older than 5 minutes or for forklifts that no longer exist
          for (const [forkliftId, timestamp] of cleanedUpdateTimes.entries()) {
            if (now - timestamp > 300000 || !activeForkliftIds.has(forkliftId)) {
              cleanedUpdateTimes.delete(forkliftId);
            }
          }

          // Only update if something changed
          if (cleanedUpdateTimes.size !== state.forkliftUpdateTimes.size) {
            return { forkliftUpdateTimes: cleanedUpdateTimes };
          }
          return {};
        }),

      // Incident heat map data
      _incidentIndices: { incidentHeatMapIndex: new Map() },
      incidentHeatMap: [],
      recordIncidentLocation: (x, z, type) =>
        set((state) => {
          if (!Number.isFinite(x) || !Number.isFinite(z)) return {};
          const threshold = 3;
          const newIndex = new Map(state._incidentIndices.incidentHeatMapIndex);

          const existingKey = findNearbyIncidentKey(newIndex, x, z, threshold);
          const existing = existingKey ? newIndex.get(existingKey) : undefined;
          if (existing && existingKey) {
            // Update existing point (guard against undefined intensity)
            const updated = { ...existing, intensity: Math.min((existing.intensity ?? 0) + 1, 10) };
            newIndex.set(existingKey, updated);
            return {
              incidentHeatMap: Array.from(newIndex.values()),
              _incidentIndices: {
                incidentHeatMapIndex: newIndex,
              },
            };
          }

          // Add new point with size limiting
          const newPoint = { x, z, intensity: 1, type };
          const gridKey = getGridKey(x, z, threshold);
          newIndex.set(gridKey, newPoint);

          // Limit size to 100 points (remove oldest by deleting first entry)
          if (newIndex.size > 100) {
            const firstKey = newIndex.keys().next().value;
            if (firstKey !== undefined) {
              newIndex.delete(firstKey);
            }
          }

          return {
            incidentHeatMap: Array.from(newIndex.values()),
            _incidentIndices: {
              incidentHeatMapIndex: newIndex,
            },
          };
        }),
      clearIncidentHeatMap: () =>
        set({
          incidentHeatMap: [],
          _incidentIndices: { incidentHeatMapIndex: new Map() },
        }),
      showIncidentHeatMap: false,
      setShowIncidentHeatMap: (show) => set({ showIncidentHeatMap: show }),

      // The forklift controller reads the first three every collision check
      // (ForkliftSystem). Defaults are the clearances the fleet was tuned and
      // deadlock-checked with; the older 1.8 / 3 / 4 values were never live.
      safetyConfig: {
        vehicleDetectionRadius: 2.5, // path-corridor half-width for vehicles ahead
        forkliftSafetyRadius: 4, // radius for nearby-forklift yielding
        pathCheckDistance: 5, // look-ahead along the route
        speedZoneSlowdown: 0.5, // planning value: speed zones are not enforced yet
      },
      setSafetyConfig: (config) =>
        set((state) => ({
          safetyConfig: { ...state.safetyConfig, ...config },
        })),

      // Speed zones updated to match new forklift perimeter paths
      speedZones: [
        { id: 'zone-1', x: 0, z: 0, radius: 5, name: 'Central Area' },
        { id: 'zone-2', x: 0, z: 28, radius: 4, name: 'North Loading' },
        { id: 'zone-3', x: 0, z: -28, radius: 4, name: 'South Loading' },
        { id: 'zone-4', x: -28, z: 0, radius: 3, name: 'West Corridor' },
        { id: 'zone-5', x: 28, z: 0, radius: 3, name: 'East Corridor' },
        { id: 'zone-6', x: 0, z: 18, radius: 4, name: 'Packing Zone' },
      ],
      addSpeedZone: (zone) =>
        set((state) => {
          const baseId = `zone-${Date.now()}`;
          const existingIds = new Set(state.speedZones.map((speedZone) => speedZone.id));
          let id = baseId;
          let suffix = 1;
          while (existingIds.has(id)) {
            id = `${baseId}-${suffix}`;
            suffix += 1;
          }
          return { speedZones: [...state.speedZones, { ...zone, id }] };
        }),
      removeSpeedZone: (id) =>
        set((state) => ({
          speedZones: state.speedZones.filter((z) => z.id !== id),
        })),
      updateSpeedZone: (id, updates) =>
        set((state) => ({
          speedZones: state.speedZones.map((z) => (z.id === id ? { ...z, ...updates } : z)),
        })),
    }),
    {
      name: 'millos-safety',
      storage: safeJSONStorage,
      version: 2,
      // v1 persisted the cosmetic 1.8 / 3 / 4 defaults. Now that the sliders
      // drive the controller, an untouched v1 config must not silently tighten
      // every clearance: drop exactly those values so the v2 defaults apply.
      // A config the user actually moved keeps its values.
      migrate: (persisted, version) => {
        if (version >= 2 || persisted === null || typeof persisted !== 'object') return persisted;
        const record = persisted as { safetyConfig?: Record<string, unknown> };
        const config = record.safetyConfig;
        if (
          config &&
          config.vehicleDetectionRadius === 1.8 &&
          config.forkliftSafetyRadius === 3 &&
          config.pathCheckDistance === 4
        ) {
          const safetyConfig = { ...config };
          delete safetyConfig.vehicleDetectionRadius;
          delete safetyConfig.forkliftSafetyRadius;
          delete safetyConfig.pathCheckDistance;
          return { ...record, safetyConfig };
        }
        return persisted;
      },
      partialize: (state) => ({
        safetyConfig: state.safetyConfig,
        speedZones: state.speedZones,
      }),
      // zustand's default merge is shallow, so a persisted safetyConfig would
      // replace the default object wholesale and any key added later would
      // rehydrate as undefined (NaN in the proximity checks). Merge per key and
      // keep only finite numbers.
      merge: (persisted, current) => {
        const record =
          persisted !== null && typeof persisted === 'object' && !Array.isArray(persisted)
            ? (persisted as Partial<SafetyStore>)
            : {};
        const persistedConfig =
          record.safetyConfig && typeof record.safetyConfig === 'object' ? record.safetyConfig : {};
        const safetyConfig = { ...current.safetyConfig };
        for (const key of Object.keys(safetyConfig) as Array<keyof typeof safetyConfig>) {
          const value = (persistedConfig as Record<string, unknown>)[key];
          if (typeof value === 'number' && Number.isFinite(value)) safetyConfig[key] = value;
        }
        return {
          ...current,
          safetyConfig,
          speedZones: Array.isArray(record.speedZones) ? record.speedZones : current.speedZones,
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          return;
        }

        // Validate arrays exist (a persisted null is falsy, so test the shape
        // directly rather than truthiness).
        if (state && !Array.isArray(state.speedZones)) {
          state.speedZones = [
            { id: 'zone-1', x: 0, z: 0, radius: 5, name: 'Central Area' },
            { id: 'zone-2', x: 0, z: 28, radius: 4, name: 'North Loading' },
            { id: 'zone-3', x: 0, z: -28, radius: 4, name: 'South Loading' },
            { id: 'zone-4', x: -28, z: 0, radius: 3, name: 'West Corridor' },
            { id: 'zone-5', x: 28, z: 0, radius: 3, name: 'East Corridor' },
            { id: 'zone-6', x: 0, z: 18, radius: 4, name: 'Packing Zone' },
          ];
        }
      },
    }
  )
);
