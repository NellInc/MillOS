import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { translate } from '../i18n';
import { safetyStoreMessages as msg } from './safetyStore.messages';
import { gameSimulationStoreMessages } from './gameSimulationStore.messages';
import { readPlantClock, type PlantClock } from '../utils/timeFormatting';

/** Incident copy kept as a key, so the log reads in the language active now. */
export type SafetyIncidentDescriptionKey =
  | 'forkliftRouteBlocked'
  | 'keyboardEmergencyStop'
  | 'facilityStop';

const DESCRIPTION_KEYS: ReadonlySet<string> = new Set<SafetyIncidentDescriptionKey>([
  'forkliftRouteBlocked',
  'keyboardEmergencyStop',
  'facilityStop',
]);

/**
 * An incident's description in the language active now. The stored text was
 * resolved when the incident was logged; it stands for a record with no key
 * (a crisis, an older build's entry).
 */
export function incidentDescription(
  incident: Pick<SafetyIncident, 'description' | 'descriptionKey' | 'crisisType'>
): string {
  // A crisis reads through the crisis catalogue, with its type.
  if (incident.crisisType)
    return translate(gameSimulationStoreMessages, 'crisisCause', { type: incident.crisisType });
  const key = incident.descriptionKey;
  return key && DESCRIPTION_KEYS.has(key) ? translate(msg, key) : incident.description;
}

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

/**
 * The default speed zones, where the forklifts meet people: the receiving
 * forklift's corner at the west service door's egress approach, its x -35 leg
 * beside the west walkway (where FLT02's operator boards), both dock doors'
 * pedestrian approaches, and FLT01's crew point. The two west zones lie outside
 * every conveyor and dock crossing (whose own 1.2 m/s yield limit covers the
 * dock lanes), so the Speed Zone Rate slider acts at the defaults. A default
 * zone carries its name as a key (nameKey), read through speedZoneName() in the
 * language active now; `name` holds the canonical English for plain readers.
 */
function defaultSpeedZones(): SafetyStore['speedZones'] {
  const zone = (id: string, x: number, z: number, radius: number, nameKey: SpeedZoneNameKey) => ({
    id,
    x,
    z,
    radius,
    name: msg.en[nameKey],
    nameKey,
  });
  return [
    zone('zone-west-service', -35, -22, 4, 'zoneWestServiceDoor'),
    zone('zone-west-walkway', -35, -34, 5, 'zoneWestWalkway'),
    zone('zone-shipping-door', 0, 45, 4, 'zoneShippingDockDoor'),
    zone('zone-receiving-door', 0, -45, 4, 'zoneReceivingDockDoor'),
    zone('zone-shipping-crew', -12, 42, 3, 'zoneShippingCrewPoint'),
  ];
}

type SpeedZoneNameKey = keyof typeof msg.en;

/**
 * The six defaults of the builds before the current set (ids, centres, radii).
 * They lay off every forklift route, so the Speed Zone Rate slider did nothing.
 */
const LEGACY_DEFAULT_SPEED_ZONES: Readonly<Record<string, readonly [number, number, number]>> = {
  'zone-1': [0, 0, 5],
  'zone-2': [0, 28, 4],
  'zone-3': [0, -28, 4],
  'zone-4': [-28, 0, 3],
  'zone-5': [28, 0, 3],
  'zone-6': [0, 18, 4],
};

/**
 * The speed zones a save restores to. A save still holding exactly the six old
 * defaults, untouched (same ids, centres and radii; the names are the app's,
 * in whichever language), takes today's defaults, so a returning player's
 * slider acts; any set the player changed is theirs and is kept. A value that
 * is not an array takes the defaults. Working if an untouched old set is
 * replaced and an edited one survives (persist merge and physical restore).
 */
export function adoptSavedSpeedZones(saved: unknown): SafetyStore['speedZones'] {
  if (!Array.isArray(saved)) return defaultSpeedZones();
  const legacyIds = Object.keys(LEGACY_DEFAULT_SPEED_ZONES);
  const seen = new Set<string>();
  const untouchedLegacy =
    saved.length === legacyIds.length &&
    saved.every((zone: unknown) => {
      if (!zone || typeof zone !== 'object') return false;
      const { id, x, z, radius } = zone as Record<string, unknown>;
      if (typeof id !== 'string' || seen.has(id)) return false;
      seen.add(id);
      const legacy = Object.prototype.hasOwnProperty.call(LEGACY_DEFAULT_SPEED_ZONES, id)
        ? LEGACY_DEFAULT_SPEED_ZONES[id]
        : undefined;
      return !!legacy && x === legacy[0] && z === legacy[1] && radius === legacy[2];
    });
  return untouchedLegacy ? defaultSpeedZones() : (saved as SafetyStore['speedZones']);
}

const DEFAULT_ZONE_NAME_KEYS: Readonly<Record<string, SpeedZoneNameKey>> = {
  'zone-west-service': 'zoneWestServiceDoor',
  'zone-west-walkway': 'zoneWestWalkway',
  'zone-shipping-door': 'zoneShippingDockDoor',
  'zone-receiving-door': 'zoneReceivingDockDoor',
  'zone-shipping-crew': 'zoneShippingCrewPoint',
  // The older defaults, which a save from before this set still holds.
  'zone-1': 'zoneCentralArea',
  'zone-2': 'zoneNorthLoading',
  'zone-3': 'zoneSouthLoading',
  'zone-4': 'zoneWestCorridor',
  'zone-5': 'zoneEastCorridor',
  'zone-6': 'zonePackingZone',
};

/**
 * A speed zone's name in the language active now. A default zone's key is
 * read in the current language. A zone from before keys were kept, still
 * carrying its default name (in either language), was named by the app, not
 * the player, so it follows a language switch too; any other name is the
 * player's and is shown as stored.
 */
export function speedZoneName(zone: { id: string; name: string; nameKey?: string }): string {
  if (
    typeof zone.nameKey === 'string' &&
    Object.prototype.hasOwnProperty.call(msg.en, zone.nameKey)
  )
    return translate(msg, zone.nameKey as SpeedZoneNameKey);
  const key = DEFAULT_ZONE_NAME_KEYS[zone.id];
  if (!key) return zone.name;
  return zone.name === msg.en[key] || zone.name === msg['pt-BR'][key]
    ? translate(msg, key)
    : zone.name;
}

/** A speed zone is a ceiling, never a stop: no zone holds a forklift below this (m/s). */
export const SPEED_ZONE_MIN_SPEED = 0.5;
/** The forklift's planned braking (forkliftController), for easing down before a zone. */
const SPEED_ZONE_BRAKING = 1;

/**
 * The fastest a forklift with nominal speed `baseSpeed` may go at (x, z): the
 * zone rate of that speed inside any speed zone, rising with distance outside
 * one at the planned braking rate, so it is down to the rate by the edge, and
 * Infinity clear of every zone. The rate is held to the Safety Config slider's
 * range and the result never falls below SPEED_ZONE_MIN_SPEED, so a zone over
 * a crew point never strands an unmanned forklift short of it.
 */
export function speedZoneLimit(
  x: number,
  z: number,
  zones: ReadonlyArray<{ x: number; z: number; radius: number }>,
  rate: number,
  baseSpeed: number
): number {
  const share = Number.isFinite(rate) ? Math.min(1, Math.max(0.2, rate)) : 0.5;
  const cap = Math.max(SPEED_ZONE_MIN_SPEED, (Number.isFinite(baseSpeed) ? baseSpeed : 0) * share);
  let limit = Infinity;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    // Persisted zones are only checked to be an array, so skip a bad entry.
    if (!zone || typeof zone !== 'object') continue;
    if (!Number.isFinite(zone.x) || !Number.isFinite(zone.z) || !Number.isFinite(zone.radius))
      continue;
    const outside = Math.hypot(x - zone.x, z - zone.z) - Math.max(0, zone.radius);
    const zoneLimit = outside <= 0 ? cap : Math.sqrt(cap * cap + 2 * SPEED_ZONE_BRAKING * outside);
    if (zoneLimit < limit) limit = zoneLimit;
  }
  return limit;
}

type SafetyIncident = SafetyStore['safetyIncidents'][number];

/**
 * The log with one more entry at its head, under a unique id, capped at 50,
 * stamped with the plant clock it happened at (what the log shows).
 */
function prependIncident(
  incidents: SafetyIncident[],
  timestamp: number,
  entry: Omit<SafetyIncident, 'id' | 'timestamp'>
): SafetyIncident[] {
  const gameClock = entry.gameClock ?? readPlantClock();
  const incident = gameClock ? { ...entry, gameClock } : entry;
  const baseId = `incident-${timestamp}-${Math.random().toString(36).slice(2, 7)}`;
  const existingIds = new Set(incidents.map((entry) => entry.id));
  let id = baseId;
  let suffix = 1;
  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return [{ ...incident, id, timestamp }, ...incidents].slice(0, 50);
}

export interface SafetyMetrics {
  nearMisses: number;
  safetyStops: number;
  routeConflicts: number;
  lastIncidentTime: number | null;
  /** The plant clock at the last event; the card ages on it (absent in older saves). */
  lastIncidentClock?: PlantClock | null;
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
  /** A blocked-route stop: counted, and logged where it happened when that is known. */
  recordSafetyStop: (detail?: { location?: { x: number; z: number }; forkliftId?: string }) => void;
  recordRouteConflict: () => void;
  incrementDaysSafe: () => void;
  recordNearMiss: () => void;

  // Safety incident history
  safetyIncidents: Array<{
    id: string;
    type: 'stop' | 'evasion' | 'near_miss' | 'emergency';
    timestamp: number;
    /** Resolved when logged; read through incidentDescription(). */
    description: string;
    descriptionKey?: SafetyIncidentDescriptionKey;
    /** For a crisis stop: its type, so the line reads in the language active now. */
    crisisType?: string;
    /** The plant clock at logging; absent on an entry from before it was kept. */
    gameClock?: PlantClock;
    location?: { x: number; z: number };
    forkliftId?: string;
    conflictingVehicleId?: string;
  }>;
  addSafetyIncident: (
    incident: Omit<SafetyStore['safetyIncidents'][0], 'id' | 'timestamp'>
  ) => void;
  clearSafetyIncidents: () => void;
  /**
   * Incidents logged this session. The log is capped at 50 and can be
   * cleared, so its length is not a count; this rises with every logged
   * incident and is reset only by a new session (Reset Simulation reloads).
   */
  sessionIncidentCount: number;

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
  /**
   * Rebase a forklift's sample clock to now without booking the gap, for
   * when sampling resumes after the clock was held or the tab was hidden.
   */
  resumeForkliftMetrics: (forkliftId: string) => void;
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
  /** `nameKey` names a default zone in the language active now (speedZoneName). */
  speedZones: Array<{
    id: string;
    x: number;
    z: number;
    radius: number;
    name: string;
    nameKey?: SpeedZoneNameKey;
  }>;
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
      // A blocked-route stop is counted, and logged as the same event, so the
      // Stops card, the Incident Log and the report's byType.stop agree.
      recordSafetyStop: (detail) =>
        set((state) => {
          const timestamp = Date.now();
          return {
            safetyMetrics: {
              ...state.safetyMetrics,
              safetyStops: state.safetyMetrics.safetyStops + 1,
              nearMisses: state.safetyMetrics.nearMisses + 1,
              lastIncidentTime: timestamp,
              lastIncidentClock: readPlantClock() ?? null,
              daysSinceIncident: 0,
            },
            sessionIncidentCount: state.sessionIncidentCount + 1,
            safetyIncidents: prependIncident(state.safetyIncidents, timestamp, {
              ...(detail?.location &&
              Number.isFinite(detail.location.x) &&
              Number.isFinite(detail.location.z)
                ? { location: { x: detail.location.x, z: detail.location.z } }
                : {}),
              ...(detail?.forkliftId ? { forkliftId: detail.forkliftId } : {}),
              type: 'stop',
              description: translate(msg, 'forkliftRouteBlocked'),
              descriptionKey: 'forkliftRouteBlocked',
            }),
          };
        }),
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
            lastIncidentClock: readPlantClock() ?? null,
            daysSinceIncident: 0,
          },
        })),

      // Safety incident history
      safetyIncidents: [],
      // Every logged incident is the Last Event. Counters, near misses and
      // Days Safe stay with their recorders: a stop the operator chose is not
      // a safety lapse and must not lower the safety score. A crisis that
      // stops the plant (a duct fire) was not chosen, so it ends Days Safe as
      // a blocked-route stop does.
      addSafetyIncident: (incident) =>
        set((state) => {
          const timestamp = Date.now();
          return {
            safetyMetrics: {
              ...state.safetyMetrics,
              lastIncidentTime: timestamp,
              lastIncidentClock: readPlantClock() ?? null,
              ...(incident.crisisType ? { daysSinceIncident: 0 } : {}),
            },
            sessionIncidentCount: state.sessionIncidentCount + 1,
            safetyIncidents: prependIncident(state.safetyIncidents, timestamp, incident),
          };
        }),
      // Clearing the log leaves the session's count: the incidents happened.
      clearSafetyIncidents: () => set({ safetyIncidents: [] }),
      sessionIncidentCount: 0,

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
      resumeForkliftMetrics: (forkliftId) =>
        set((state) => {
          const existing = state.forkliftMetrics[forkliftId];
          if (!existing) return {};
          const now = Date.now();
          const forkliftUpdateTimes = new Map(state.forkliftUpdateTimes);
          forkliftUpdateTimes.set(forkliftId, now);
          return {
            forkliftMetrics: {
              ...state.forkliftMetrics,
              [forkliftId]: { ...existing, lastUpdateTime: now },
            },
            forkliftUpdateTimes,
          };
        }),
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
      // (ForkliftSystem), and the zone rate every frame (speedZoneLimit).
      // Defaults are the clearances the fleet was tuned and deadlock-checked
      // with; the older 1.8 / 3 / 4 values were never live.
      safetyConfig: {
        vehicleDetectionRadius: 2.5, // path-corridor half-width for vehicles ahead
        forkliftSafetyRadius: 4, // radius for nearby-forklift yielding
        pathCheckDistance: 5, // look-ahead along the route
        speedZoneSlowdown: 0.5, // share of its speed kept inside a speed zone
      },
      setSafetyConfig: (config) =>
        set((state) => ({
          safetyConfig: { ...state.safetyConfig, ...config },
        })),

      // Speed zones (speedZoneLimit, ForkliftSystem): ceilings on the
      // forklifts inside them, autopilot and driven alike.
      speedZones: defaultSpeedZones(),
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
          speedZones: state.speedZones.map((z) => {
            if (z.id !== id) return z;
            // A new name is the player's text, so the default key no longer names it.
            if (updates.name === undefined) return { ...z, ...updates };
            const { nameKey: _defaultName, ...named } = z;
            return { ...named, ...updates };
          }),
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
          speedZones: adoptSavedSpeedZones(record.speedZones),
        };
      },
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          return;
        }

        // Validate arrays exist (a persisted null is falsy, so test the shape
        // directly rather than truthiness).
        if (state && !Array.isArray(state.speedZones)) {
          state.speedZones = defaultSpeedZones();
        }
      },
    }
  )
);
