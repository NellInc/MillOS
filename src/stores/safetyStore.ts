import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

interface IncidentHeatMapIndex {
  incidentHeatMapIndex: Map<string, { x: number; z: number; intensity: number; type: string }>;
}

function getGridKey(x: number, z: number, threshold: number): string {
  return `${Math.round(x / threshold)}_${Math.round(z / threshold)}`;
}

interface SafetyStore {
  // Safety metrics
  safetyMetrics: {
    nearMisses: number;
    safetyStops: number;
    workerEvasions: number;
    lastIncidentTime: number | null;
    daysSinceIncident: number;
  };
  recordSafetyStop: () => void;
  recordWorkerEvasion: () => void;

  // Safety incident history
  safetyIncidents: Array<{
    id: string;
    type: 'stop' | 'evasion' | 'near_miss' | 'emergency';
    timestamp: number;
    description: string;
    location?: { x: number; z: number };
    forkliftId?: string;
    workerId?: string;
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

  // Incident heat map data (separate from worker heat map)
  _incidentIndices: IncidentHeatMapIndex;
  incidentHeatMap: Array<{ x: number; z: number; intensity: number; type: string }>;
  recordIncidentLocation: (x: number, z: number, type: string) => void;
  clearIncidentHeatMap: () => void;
  showIncidentHeatMap: boolean;
  setShowIncidentHeatMap: (show: boolean) => void;

  // Safety configuration
  safetyConfig: {
    workerDetectionRadius: number;
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
        workerEvasions: 0,
        lastIncidentTime: null,
        daysSinceIncident: 127,
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
      recordWorkerEvasion: () =>
        set((state) => ({
          safetyMetrics: {
            ...state.safetyMetrics,
            workerEvasions: state.safetyMetrics.workerEvasions + 1,
          },
        })),

      // Safety incident history
      safetyIncidents: [],
      addSafetyIncident: (incident) =>
        set((state) => ({
          safetyIncidents: [
            {
              ...incident,
              id: `incident-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              timestamp: Date.now(),
            },
            ...state.safetyIncidents,
          ].slice(0, 50), // Keep last 50 incidents
        })),
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
          const threshold = 3;
          const gridKey = getGridKey(x, z, threshold);
          const newIndex = new Map(state._incidentIndices.incidentHeatMapIndex);

          const existing = newIndex.get(gridKey);
          if (existing) {
            // Update existing point
            const updated = { ...existing, intensity: Math.min(existing.intensity + 1, 10) };
            newIndex.set(gridKey, updated);
            return {
              incidentHeatMap: Array.from(newIndex.values()),
              _incidentIndices: {
                incidentHeatMapIndex: newIndex,
              },
            };
          }

          // Add new point with size limiting
          const newPoint = { x, z, intensity: 1, type };
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

      safetyConfig: {
        workerDetectionRadius: 1.8, // Reduced from 2.5 - less aggressive stopping
        forkliftSafetyRadius: 3, // Reduced from 4 - forklifts can pass closer
        pathCheckDistance: 4, // Reduced from 5 - shorter lookahead
        speedZoneSlowdown: 0.5, // Increased from 0.4 - less slowdown (50% speed)
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
        set((state) => ({
          speedZones: [...state.speedZones, { ...zone, id: `zone-${Date.now()}` }],
        })),
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
      partialize: (state) => ({
        safetyConfig: state.safetyConfig,
        speedZones: state.speedZones,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          return;
        }

        // Validate arrays exist
        if (state && state.speedZones && !Array.isArray(state.speedZones)) {
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
