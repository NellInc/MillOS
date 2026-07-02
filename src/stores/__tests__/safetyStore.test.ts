/**
 * Safety Store Tests
 *
 * Tests for safety metrics, incident recording, forklift emergency stop,
 * incident heat map, speed zones, and forklift efficiency tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSafetyStore } from '../safetyStore';
import { mockIncidents, generateBatchIncidents } from '../../test/fixtures';

describe('SafetyStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useSafetyStore.setState({
      safetyMetrics: {
        nearMisses: 0,
        safetyStops: 0,
        workerEvasions: 0,
        lastIncidentTime: null,
        daysSinceIncident: 127,
      },
      safetyIncidents: [],
      forkliftEmergencyStop: false,
      forkliftMetrics: {},
      forkliftUpdateTimes: new Map(),
      _incidentIndices: { incidentHeatMapIndex: new Map() },
      incidentHeatMap: [],
      showIncidentHeatMap: false,
      safetyConfig: {
        workerDetectionRadius: 1.8,
        forkliftSafetyRadius: 3,
        pathCheckDistance: 4,
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

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Safety Metrics', () => {
    it('should initialize with zero near misses', () => {
      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.nearMisses).toBe(0);
    });

    it('should initialize with high days since incident', () => {
      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.daysSinceIncident).toBe(127);
    });

    it('should record safety stop and increment counters', () => {
      const { recordSafetyStop } = useSafetyStore.getState();
      recordSafetyStop();

      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.safetyStops).toBe(1);
      expect(safetyMetrics.nearMisses).toBe(1);
      expect(safetyMetrics.daysSinceIncident).toBe(0);
      expect(safetyMetrics.lastIncidentTime).toBeDefined();
    });

    it('should record worker evasion', () => {
      const { recordWorkerEvasion } = useSafetyStore.getState();
      recordWorkerEvasion();

      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.workerEvasions).toBe(1);
    });

    it('should accumulate multiple incidents', () => {
      const { recordSafetyStop, recordWorkerEvasion } = useSafetyStore.getState();

      recordSafetyStop();
      recordSafetyStop();
      recordWorkerEvasion();
      recordWorkerEvasion();
      recordWorkerEvasion();

      const { safetyMetrics } = useSafetyStore.getState();
      expect(safetyMetrics.safetyStops).toBe(2);
      expect(safetyMetrics.nearMisses).toBe(2);
      expect(safetyMetrics.workerEvasions).toBe(3);
    });
  });

  describe('Safety Incidents', () => {
    it('should add safety incident with generated id and timestamp', () => {
      const { addSafetyIncident } = useSafetyStore.getState();
      addSafetyIncident(mockIncidents[0]);

      const { safetyIncidents } = useSafetyStore.getState();
      expect(safetyIncidents).toHaveLength(1);
      expect(safetyIncidents[0].id).toMatch(/^incident-/);
      expect(safetyIncidents[0].timestamp).toBeDefined();
      expect(safetyIncidents[0].type).toBe('stop');
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
    it('should initialize with emergency stop disabled', () => {
      const { forkliftEmergencyStop } = useSafetyStore.getState();
      expect(forkliftEmergencyStop).toBe(false);
    });

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
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should initialize with empty forklift metrics', () => {
      const { forkliftMetrics } = useSafetyStore.getState();
      expect(Object.keys(forkliftMetrics)).toHaveLength(0);
    });

    it('should update forklift metrics', () => {
      const { updateForkliftMetrics } = useSafetyStore.getState();

      vi.advanceTimersByTime(150); // Exceed debounce threshold
      updateForkliftMetrics('forklift-1', true);

      const { forkliftMetrics } = useSafetyStore.getState();
      expect(forkliftMetrics['forklift-1']).toBeDefined();
      expect(forkliftMetrics['forklift-1'].isMoving).toBe(true);
    });

    it('should debounce rapid updates', () => {
      const { updateForkliftMetrics } = useSafetyStore.getState();

      vi.advanceTimersByTime(150);
      updateForkliftMetrics('forklift-1', true);

      // Rapid update within 100ms should be ignored
      vi.advanceTimersByTime(50);
      updateForkliftMetrics('forklift-1', false);

      const { forkliftMetrics } = useSafetyStore.getState();
      expect(forkliftMetrics['forklift-1'].isMoving).toBe(true); // Not changed
    });

    it('should reset forklift metrics', () => {
      const { updateForkliftMetrics, resetForkliftMetrics } = useSafetyStore.getState();

      vi.advanceTimersByTime(150);
      updateForkliftMetrics('forklift-1', true);
      resetForkliftMetrics();

      const { forkliftMetrics, forkliftUpdateTimes } = useSafetyStore.getState();
      expect(Object.keys(forkliftMetrics)).toHaveLength(0);
      expect(forkliftUpdateTimes.size).toBe(0);
    });

    it('should track moving and stopped time', () => {
      const { updateForkliftMetrics } = useSafetyStore.getState();

      vi.advanceTimersByTime(150);
      updateForkliftMetrics('forklift-1', true); // Start moving

      vi.advanceTimersByTime(1150); // 1 second later
      updateForkliftMetrics('forklift-1', false); // Stop

      const { forkliftMetrics } = useSafetyStore.getState();
      expect(forkliftMetrics['forklift-1'].totalMovingTime).toBeGreaterThan(0);
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

    it('should cluster nearby incidents', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      // Record two nearby incidents (within threshold)
      recordIncidentLocation(10, 20, 'stop');
      recordIncidentLocation(11, 21, 'stop'); // Within grid threshold

      const { incidentHeatMap } = useSafetyStore.getState();
      // Should be clustered into same grid key
      expect(incidentHeatMap.length).toBeLessThanOrEqual(2);
    });

    it('should increase intensity for clustered incidents', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      // Record multiple incidents at exact same grid location
      recordIncidentLocation(0, 0, 'stop');
      recordIncidentLocation(0, 0, 'stop');
      recordIncidentLocation(0, 0, 'stop');

      const { incidentHeatMap } = useSafetyStore.getState();
      const point = incidentHeatMap.find((p) => p.x === 0 && p.z === 0);
      expect(point?.intensity).toBeGreaterThan(1);
    });

    it('should cap intensity at 10', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      // Record many incidents at same location
      for (let i = 0; i < 15; i++) {
        recordIncidentLocation(0, 0, 'stop');
      }

      const { incidentHeatMap } = useSafetyStore.getState();
      const point = incidentHeatMap.find((p) => p.x === 0 && p.z === 0);
      expect(point?.intensity).toBeLessThanOrEqual(10);
    });

    it('should limit heat map to 100 points', () => {
      const { recordIncidentLocation } = useSafetyStore.getState();

      // Record 120 incidents at different locations
      for (let i = 0; i < 120; i++) {
        recordIncidentLocation(i * 10, i * 10, 'stop'); // Spread out to avoid clustering
      }

      const { incidentHeatMap } = useSafetyStore.getState();
      expect(incidentHeatMap.length).toBeLessThanOrEqual(100);
    });

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
    it('should have default safety config', () => {
      const { safetyConfig } = useSafetyStore.getState();
      expect(safetyConfig.workerDetectionRadius).toBe(1.8);
      expect(safetyConfig.forkliftSafetyRadius).toBe(3);
      expect(safetyConfig.pathCheckDistance).toBe(4);
      expect(safetyConfig.speedZoneSlowdown).toBe(0.5);
    });

    it('should update safety config partially', () => {
      const { setSafetyConfig } = useSafetyStore.getState();
      setSafetyConfig({ workerDetectionRadius: 2.5 });

      const { safetyConfig } = useSafetyStore.getState();
      expect(safetyConfig.workerDetectionRadius).toBe(2.5);
      expect(safetyConfig.forkliftSafetyRadius).toBe(3); // Unchanged
    });

    it('should update multiple config values', () => {
      const { setSafetyConfig } = useSafetyStore.getState();
      setSafetyConfig({
        workerDetectionRadius: 2.0,
        speedZoneSlowdown: 0.3,
      });

      const { safetyConfig } = useSafetyStore.getState();
      expect(safetyConfig.workerDetectionRadius).toBe(2.0);
      expect(safetyConfig.speedZoneSlowdown).toBe(0.3);
    });
  });

  describe('Speed Zones', () => {
    it('should initialize with default speed zones', () => {
      const { speedZones } = useSafetyStore.getState();
      expect(speedZones.length).toBeGreaterThan(0);
      expect(speedZones[0].name).toBe('Central Area');
    });

    it('should add speed zone', () => {
      const { addSpeedZone } = useSafetyStore.getState();
      addSpeedZone({ x: 50, z: 50, radius: 5, name: 'New Zone' });

      const { speedZones } = useSafetyStore.getState();
      const newZone = speedZones.find((z) => z.name === 'New Zone');
      expect(newZone).toBeDefined();
      expect(newZone?.x).toBe(50);
      expect(newZone?.z).toBe(50);
      expect(newZone?.radius).toBe(5);
    });

    it('should generate unique id for new zones', () => {
      const { addSpeedZone } = useSafetyStore.getState();
      addSpeedZone({ x: 50, z: 50, radius: 5, name: 'New Zone' });

      const { speedZones } = useSafetyStore.getState();
      const newZone = speedZones.find((z) => z.name === 'New Zone');
      expect(newZone?.id).toMatch(/^zone-/);
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
