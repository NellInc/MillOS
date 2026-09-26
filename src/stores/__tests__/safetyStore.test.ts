/**
 * Safety Store Tests
 *
 * Tests for safety metrics, incident recording, forklift emergency stop,
 * incident heat map, speed zones, and forklift efficiency tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeSafetyScore, useSafetyStore } from '../safetyStore';
import { mockIncidents, generateBatchIncidents } from '../../test/fixtures';

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');

describe('SafetyStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts from the complete documented safety state', () => {
    const state = useSafetyStore.getState();

    expect({
      safetyMetrics: state.safetyMetrics,
      safetyIncidents: state.safetyIncidents,
      forkliftEmergencyStop: state.forkliftEmergencyStop,
      forkliftMetrics: state.forkliftMetrics,
      forkliftUpdateTimes: [...state.forkliftUpdateTimes.entries()],
      incidentHeatMap: state.incidentHeatMap,
      showIncidentHeatMap: state.showIncidentHeatMap,
      safetyConfig: state.safetyConfig,
      speedZones: state.speedZones,
    }).toEqual({
      safetyMetrics: {
        nearMisses: 0,
        safetyStops: 0,
        routeConflicts: 0,
        lastIncidentTime: null,
        daysSinceIncident: 0,
      },
      safetyIncidents: [],
      forkliftEmergencyStop: false,
      forkliftMetrics: {},
      forkliftUpdateTimes: [],
      incidentHeatMap: [],
      showIncidentHeatMap: false,
      safetyConfig: {
        vehicleDetectionRadius: 2.5,
        forkliftSafetyRadius: 4,
        pathCheckDistance: 5,
        speedZoneSlowdown: 0.5,
      },
      speedZones: [
        { id: 'zone-1', x: 0, z: 0, radius: 5, name: 'Central Area' },
        { id: 'zone-2', x: 0, z: 28, radius: 4, name: 'North Loading' },
        { id: 'zone-3', x: 0, z: -28, radius: 4, name: 'South Loading' },
        { id: 'zone-4', x: -28, z: 0, radius: 3, name: 'West Corridor' },
        { id: 'zone-5', x: 28, z: 0, radius: 3, name: 'East Corridor' },
        { id: 'zone-6', x: 0, z: 18, radius: 4, name: 'Packing Zone' },
      ],
    });
  });

  describe('Safety Metrics', () => {
    it('should record safety stop and increment counters', () => {
      const { recordSafetyStop } = useSafetyStore.getState();
      recordSafetyStop();

      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.safetyStops).toBe(1);
      expect(safetyMetrics.nearMisses).toBe(1);
      expect(safetyMetrics.daysSinceIncident).toBe(0);
      expect(safetyMetrics.lastIncidentTime).toBe(FIXED_NOW.getTime());
    });

    it('should record a mobile-equipment route conflict', () => {
      const { recordRouteConflict } = useSafetyStore.getState();
      recordRouteConflict();

      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.routeConflicts).toBe(1);
    });

    it('should accumulate multiple incidents', () => {
      const { recordSafetyStop, recordRouteConflict } = useSafetyStore.getState();

      recordSafetyStop();
      recordSafetyStop();
      recordRouteConflict();
      recordRouteConflict();
      recordRouteConflict();

      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.safetyStops).toBe(2);
      expect(safetyMetrics.nearMisses).toBe(2);
      expect(safetyMetrics.routeConflicts).toBe(3);
    });
  });

  describe('Safety Incidents', () => {
    it('should add safety incident with generated id and timestamp', () => {
      const { addSafetyIncident } = useSafetyStore.getState();
      addSafetyIncident(mockIncidents[0]);

      const { safetyIncidents } = useSafetyStore.getState();
      expect(safetyIncidents).toHaveLength(1);
      expect(safetyIncidents[0]).toEqual({
        ...mockIncidents[0],
        id: expect.stringMatching(/^incident-/),
        timestamp: FIXED_NOW.getTime(),
      });
    });

    it('should add incidents to the front of the array', () => {
      const { addSafetyIncident } = useSafetyStore.getState();

      addSafetyIncident(mockIncidents[0]);
      addSafetyIncident(mockIncidents[1]);

      const { safetyIncidents } = useSafetyStore.getState();
      expect(safetyIncidents[0].type).toBe('evasion'); // Most recent
      expect(safetyIncidents[1].type).toBe('stop');
    });

    it('should limit incidents to 50 items', () => {
      const { addSafetyIncident } = useSafetyStore.getState();
      const batchIncidents = generateBatchIncidents(60);

      batchIncidents.forEach((incident) => addSafetyIncident(incident));

      const { safetyIncidents } = useSafetyStore.getState();
      expect(safetyIncidents.length).toBe(50);
    });

    it('should clear all safety incidents', () => {
      const { addSafetyIncident, clearSafetyIncidents } = useSafetyStore.getState();

      mockIncidents.forEach((incident) => addSafetyIncident(incident));
      clearSafetyIncidents();

      const { safetyIncidents } = useSafetyStore.getState();
      expect(safetyIncidents).toHaveLength(0);
    });

    it('should preserve incident location data', () => {
      const { addSafetyIncident } = useSafetyStore.getState();
      addSafetyIncident(mockIncidents[0]);

      const { safetyIncidents } = useSafetyStore.getState();
      expect(safetyIncidents[0].location).toEqual({ x: 5, z: 10 });
    });
  });

  describe('Forklift Emergency Stop', () => {
    it('should enable emergency stop', () => {
      const { setForkliftEmergencyStop } = useSafetyStore.getState();
      setForkliftEmergencyStop(true);

      expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    });

    it('should disable emergency stop', () => {
      const { setForkliftEmergencyStop } = useSafetyStore.getState();
      setForkliftEmergencyStop(true);
      setForkliftEmergencyStop(false);

      expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    });
  });

  describe('Forklift Metrics', () => {
    it('should update forklift metrics', () => {
      const { updateForkliftMetrics } = useSafetyStore.getState();

      updateForkliftMetrics('forklift-1', true);

      const { forkliftMetrics } = useSafetyStore.getState();
      expect(forkliftMetrics['forklift-1']).toEqual({
        totalMovingTime: 0,
        totalStoppedTime: 0,
        lastUpdateTime: FIXED_NOW.getTime(),
        isMoving: true,
      });
    });

    it('should debounce rapid updates', () => {
      const { updateForkliftMetrics } = useSafetyStore.getState();

      updateForkliftMetrics('forklift-1', true);

      // Rapid update within 100ms should be ignored
      vi.advanceTimersByTime(50);
      updateForkliftMetrics('forklift-1', false);

      const { forkliftMetrics } = useSafetyStore.getState();
      expect(forkliftMetrics['forklift-1'].isMoving).toBe(true); // Not changed
    });

    it('should reset forklift metrics', () => {
      const { updateForkliftMetrics, resetForkliftMetrics } = useSafetyStore.getState();

      updateForkliftMetrics('forklift-1', true);
      resetForkliftMetrics();

      const { forkliftMetrics, forkliftUpdateTimes } = useSafetyStore.getState();
      expect(Object.keys(forkliftMetrics)).toHaveLength(0);
      expect(forkliftUpdateTimes.size).toBe(0);
    });

    it('attributes elapsed time exactly to the prior moving state', () => {
      const { updateForkliftMetrics } = useSafetyStore.getState();

      updateForkliftMetrics('forklift-1', true);

      vi.advanceTimersByTime(1000);
      updateForkliftMetrics('forklift-1', false);

      vi.advanceTimersByTime(2500);
      updateForkliftMetrics('forklift-1', true);

      expect(useSafetyStore.getState().forkliftMetrics['forklift-1']).toEqual({
        totalMovingTime: 1,
        totalStoppedTime: 2.5,
        lastUpdateTime: FIXED_NOW.getTime() + 3500,
        isMoving: true,
      });
    });
  });

  describe('Incident Heat Map', () => {
    it('should record incident location', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();
      recordIncidentLocation(10, 20, 'stop');

      const { incidentHeatMap } = useSafetyStore.getState();
      expect(incidentHeatMap).toHaveLength(1);
      expect(incidentHeatMap[0].x).toBe(10);
      expect(incidentHeatMap[0].z).toBe(20);
      expect(incidentHeatMap[0].type).toBe('stop');
    });

    it('should cluster nearby incidents across a grid-cell boundary', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      // Record two nearby incidents (within threshold)
      recordIncidentLocation(10, 20, 'stop');
      recordIncidentLocation(11, 21, 'stop'); // Within grid threshold

      const { incidentHeatMap } = useSafetyStore.getState();
      expect(incidentHeatMap).toEqual([{ x: 10, z: 20, type: 'stop', intensity: 2 }]);
    });

    it('keeps incidents at the exact clustering threshold distinct', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      recordIncidentLocation(0, 0, 'near_miss');
      recordIncidentLocation(3, 0, 'stop');

      const { incidentHeatMap } = useSafetyStore.getState();
      expect(incidentHeatMap).toEqual([
        { x: 0, z: 0, intensity: 1, type: 'near_miss' },
        { x: 3, z: 0, intensity: 1, type: 'stop' },
      ]);
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      'ignores malformed incident coordinate %s without corrupting either index',
      (coordinate) => {
        const before = useSafetyStore.getState();
        before.recordIncidentLocation(coordinate, 2, 'stop');
        before.recordIncidentLocation(2, coordinate, 'stop');

        const state = useSafetyStore.getState();
        expect(state.incidentHeatMap).toEqual([]);
        expect(state._incidentIndices.incidentHeatMapIndex.size).toBe(0);
      }
    );

    it('should clear incident heat map', () => {
      const { recordIncidentLocation, clearIncidentHeatMap } = useSafetyStore.getState();

      recordIncidentLocation(10, 20, 'stop');
      recordIncidentLocation(30, 40, 'evasion');
      clearIncidentHeatMap();

      const { incidentHeatMap, _incidentIndices } = useSafetyStore.getState();
      expect(incidentHeatMap).toHaveLength(0);
      expect(_incidentIndices.incidentHeatMapIndex.size).toBe(0);
    });

    it('should toggle heat map visibility', () => {
      const { setShowIncidentHeatMap } = useSafetyStore.getState();

      expect(useSafetyStore.getState().showIncidentHeatMap).toBe(false);

      setShowIncidentHeatMap(true);
      expect(useSafetyStore.getState().showIncidentHeatMap).toBe(true);

      setShowIncidentHeatMap(false);
      expect(useSafetyStore.getState().showIncidentHeatMap).toBe(false);
    });
  });

  describe('Safety Configuration', () => {
    it('drops the never-live v1 clearance defaults on migration but keeps user-set values', () => {
      const migrate = useSafetyStore.persist.getOptions().migrate;
      expect(migrate).toBeDefined();
      const untouched = migrate?.(
        {
          safetyConfig: {
            vehicleDetectionRadius: 1.8,
            forkliftSafetyRadius: 3,
            pathCheckDistance: 4,
            speedZoneSlowdown: 0.3,
          },
        },
        1
      ) as { safetyConfig: Record<string, number> };
      expect(untouched.safetyConfig).toEqual({ speedZoneSlowdown: 0.3 });

      const tuned = { safetyConfig: { vehicleDetectionRadius: 3.2, forkliftSafetyRadius: 3 } };
      expect(migrate?.(tuned, 1)).toBe(tuned);
    });

    it('should update safety config partially', () => {
      const { setSafetyConfig } = useSafetyStore.getState();
      setSafetyConfig({ vehicleDetectionRadius: 3.1 });

      const { safetyConfig } = useSafetyStore.getState();
      expect(safetyConfig.vehicleDetectionRadius).toBe(3.1);
      expect(safetyConfig.forkliftSafetyRadius).toBe(4); // Unchanged
    });

    it('should update multiple config values', () => {
      const { setSafetyConfig } = useSafetyStore.getState();
      setSafetyConfig({
        vehicleDetectionRadius: 2.0,
        speedZoneSlowdown: 0.3,
      });

      const { safetyConfig } = useSafetyStore.getState();
      expect(safetyConfig.vehicleDetectionRadius).toBe(2.0);
      expect(safetyConfig.speedZoneSlowdown).toBe(0.3);
    });
  });

  describe('Speed Zones', () => {
    it('adds speed zones with distinct generated identities even within one millisecond', () => {
      const { addSpeedZone } = useSafetyStore.getState();
      addSpeedZone({ x: 50, z: 50, radius: 5, name: 'New Zone A' });
      addSpeedZone({ x: 60, z: 70, radius: 6, name: 'New Zone B' });

      const { speedZones } = useSafetyStore.getState();
      const added = speedZones.slice(-2);
      expect(added).toEqual([
        { id: expect.stringMatching(/^zone-/), x: 50, z: 50, radius: 5, name: 'New Zone A' },
        { id: expect.stringMatching(/^zone-/), x: 60, z: 70, radius: 6, name: 'New Zone B' },
      ]);
      expect(added[0].id).not.toBe(added[1].id);
    });

    it('should remove speed zone by id', () => {
      const { removeSpeedZone } = useSafetyStore.getState();
      const initialLength = useSafetyStore.getState().speedZones.length;

      removeSpeedZone('zone-1');

      const { speedZones } = useSafetyStore.getState();
      expect(speedZones.length).toBe(initialLength - 1);
      expect(speedZones.find((z) => z.id === 'zone-1')).toBeUndefined();
    });

    it('should update speed zone', () => {
      const { updateSpeedZone } = useSafetyStore.getState();
      updateSpeedZone('zone-1', { radius: 10, name: 'Updated Central' });

      const { speedZones } = useSafetyStore.getState();
      const zone = speedZones.find((z) => z.id === 'zone-1');
      expect(zone?.radius).toBe(10);
      expect(zone?.name).toBe('Updated Central');
    });

    it('should update speed zone position', () => {
      const { updateSpeedZone } = useSafetyStore.getState();
      updateSpeedZone('zone-1', { x: 15, z: 25 });

      const { speedZones } = useSafetyStore.getState();
      const zone = speedZones.find((z) => z.id === 'zone-1');
      expect(zone?.x).toBe(15);
      expect(zone?.z).toBe(25);
    });
  });

  describe('Batch Recording Behavior', () => {
    // NOTE: this block previously asserted wall-clock durations under fake
    // timers, where performance.now() is frozen and every duration is 0 -
    // a tautology. It now asserts the state invariants that batch recording
    // must uphold instead.
    it('should record a rapid batch of incidents newest-first', () => {
      const { addSafetyIncident } = useSafetyStore.getState();
      const batchIncidents = generateBatchIncidents(50);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      batchIncidents.forEach((incident) => addSafetyIncident(incident));

      const { safetyIncidents } = useSafetyStore.getState();
      expect(safetyIncidents).toHaveLength(50);
      // Newest first: the last-added incident heads the list
      expect(safetyIncidents[0].description).toBe('Batch incident 49');
      expect(safetyIncidents[49].description).toBe('Batch incident 0');
      // Every incident got a unique id
      expect(new Set(safetyIncidents.map((i) => i.id)).size).toBe(50);
    });

    it('should aggregate repeated locations into one heat map point capped at intensity 10', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      for (let i = 0; i < 15; i++) {
        recordIncidentLocation(5, 5, 'stop');
      }

      const { incidentHeatMap } = useSafetyStore.getState();
      expect(incidentHeatMap).toHaveLength(1);
      expect(incidentHeatMap[0].intensity).toBe(10); // Capped, not 15
    });

    it('should cap the heat map at 100 points under rapid distinct updates', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      // 110 locations in distinct 3-unit grid cells (4-unit spacing)
      for (let i = 0; i < 110; i++) {
        const x = (i % 11) * 4 - 20;
        const z = Math.floor(i / 11) * 4 - 20;
        recordIncidentLocation(x, z, i % 2 === 0 ? 'stop' : 'evasion');
      }

      const { incidentHeatMap } = useSafetyStore.getState();
      expect(incidentHeatMap).toHaveLength(100);
      expect(incidentHeatMap.every((p) => p.intensity >= 1 && p.intensity <= 10)).toBe(true);
    });
  });
});

describe('computeSafetyScore', () => {
  it('is the single formula shared by the HUD and the Overview panel', () => {
    expect(computeSafetyScore(undefined)).toBe(100);
    expect(computeSafetyScore({ nearMisses: 1 })).toBe(95);
    expect(computeSafetyScore({ safetyStops: 1 })).toBe(98);
    // Route conflicts used to be counted by the HUD but not by the panel.
    expect(computeSafetyScore({ routeConflicts: 1 })).toBe(99);
    expect(computeSafetyScore({ nearMisses: 50, safetyStops: 50, routeConflicts: 50 })).toBe(0);
  });
});
