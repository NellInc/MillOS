/**
 * Unit Tests for SimulationAdapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SimulationAdapter } from '../adapters/SimulationAdapter';
import { TagDefinition } from '../types';
import { MILL_TAGS } from '../tagDatabase';

// Sample tag definitions for testing
const sampleTags: TagDefinition[] = [
  {
    id: 'TEST.TT001.PV',
    name: 'Test Temperature',
    description: 'Test temperature sensor',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 100,
    machineId: 'test-1',
    group: 'TEMPERATURE',
    alarmHi: 80,
    alarmHiHi: 90,
    simulation: {
      baseValue: 45,
      noiseAmplitude: 2,
      driftRate: 0,
      statusDependent: true,
    },
  },
  {
    id: 'TEST.ST001.PV',
    name: 'Test Speed',
    description: 'Test speed sensor',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2000,
    machineId: 'test-1',
    group: 'SPEED',
    simulation: {
      baseValue: 1200,
      noiseAmplitude: 50,
      driftRate: 0,
      loadFactor: true,
    },
  },
  {
    id: 'TEST.SP001.SP',
    name: 'Test Setpoint',
    description: 'Test speed setpoint',
    dataType: 'FLOAT32',
    accessMode: 'READ_WRITE',
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2000,
    machineId: 'test-1',
    group: 'SETPOINT',
    simulation: {
      baseValue: 1500,
      noiseAmplitude: 0,
      driftRate: 0,
    },
  },
];

describe('SimulationAdapter', () => {
  let adapter: SimulationAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new SimulationAdapter(sampleTags);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.useRealTimers();
  });

  describe('Lifecycle', () => {
    it('owns exactly one sampling interval across idempotent connect and disconnect', async () => {
      expect(adapter.isConnected()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
      expect(adapter.getConnectionStatus()).toMatchObject({
        connected: true,
        reconnectAttempts: 0,
      });
      expect(vi.getTimerCount()).toBe(1);

      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);
      expect(vi.getTimerCount()).toBe(1);

      await adapter.disconnect();
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('produces the same telemetry sequence for the same tag catalogue', async () => {
      const secondAdapter = new SimulationAdapter(sampleTags);
      await adapter.connect();
      await secondAdapter.connect();

      const firstValues = await adapter.readAllTags();
      const secondValues = await secondAdapter.readAllTags();
      expect(secondValues.map(({ tagId, value, quality }) => ({ tagId, value, quality }))).toEqual(
        firstValues.map(({ tagId, value, quality }) => ({ tagId, value, quality }))
      );

      await vi.advanceTimersByTimeAsync(3100);
      const firstLater = await adapter.readAllTags();
      const secondLater = await secondAdapter.readAllTags();
      expect(secondLater.map(({ tagId, value, quality }) => ({ tagId, value, quality }))).toEqual(
        firstLater.map(({ tagId, value, quality }) => ({ tagId, value, quality }))
      );
      await secondAdapter.disconnect();
    });

    it('does not mutate a shared tag catalogue when a setpoint is written', async () => {
      const originalSetpoint = sampleTags[2].simulation?.baseValue;
      await adapter.connect();
      await adapter.writeTag('TEST.SP001.SP', 1800);

      expect(sampleTags[2].simulation?.baseValue).toBe(originalSetpoint);
    });
  });

  describe('Read Operations', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should read a single tag', async () => {
      const value = await adapter.readTag('TEST.TT001.PV');
      expect(value.tagId).toBe('TEST.TT001.PV');
      expect(value.quality).toBe('GOOD');
      expect(typeof value.value).toBe('number');
    });

    it('should throw for unknown tag', async () => {
      await expect(adapter.readTag('UNKNOWN.TAG')).rejects.toThrow('Tag not found');
    });

    it('should read multiple tags', async () => {
      const values = await adapter.readTags(['TEST.TT001.PV', 'TEST.ST001.PV']);
      expect(values).toHaveLength(2);
      expect(values[0].tagId).toBe('TEST.TT001.PV');
      expect(values[1].tagId).toBe('TEST.ST001.PV');
    });

    it('should read all tags', async () => {
      const values = await adapter.readAllTags();
      expect(values.length).toBe(sampleTags.length);
    });
  });

  describe('Write Operations', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should write to a writable tag', async () => {
      const success = await adapter.writeTag('TEST.SP001.SP', 1800);
      expect(success).toBe(true);

      const value = await adapter.readTag('TEST.SP001.SP');
      expect(value.value).toBe(1800);
    });

    it('should reject writes to read-only tags', async () => {
      const success = await adapter.writeTag('TEST.TT001.PV', 100);
      expect(success).toBe(false);
    });

    it('should reject writes to unknown tags', async () => {
      const success = await adapter.writeTag('UNKNOWN.TAG', 100);
      expect(success).toBe(false);
    });
  });

  describe('Subscriptions', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('replays current data, publishes each tick, and stops exactly at unsubscribe', async () => {
      const callback = vi.fn();
      const unsubscribe = adapter.subscribe(['TEST.TT001.PV'], callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0]).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(callback).toHaveBeenCalledTimes(3);

      unsubscribe();
      await vi.advanceTimersByTimeAsync(2_000);
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('Machine State Integration', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should calculate plant load from running machines', () => {
      adapter.updateMachineStates([
        { id: 'test-1', status: 'running', metrics: { load: 80, rpm: 1400 } },
        { id: 'test-2', status: 'running', metrics: { load: 60, rpm: 1200 } },
        { id: 'test-3', status: 'idle', metrics: { load: 100, rpm: 0 } },
      ]);

      expect(adapter.getPlantLoad()).toBe(70); // (80 + 60) / 2
    });
  });

  describe('Operational State Integration', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('publishes exact conserved values without synthetic noise', async () => {
      adapter.updateOperationalValues({ 'TEST.TT001.PV': 63.25 });
      await vi.advanceTimersByTimeAsync(1100);
      expect((await adapter.readTag('TEST.TT001.PV')).value).toBe(63.25);
    });

    it('keeps fault injection authoritative over operational values', async () => {
      adapter.updateOperationalValues({ 'TEST.TT001.PV': 63.25 });
      await vi.advanceTimersByTimeAsync(1100);
      adapter.injectFault({ tagId: 'TEST.TT001.PV', faultType: 'sensor_fail' });
      expect((await adapter.readTag('TEST.TT001.PV')).quality).toBe('BAD');
    });
  });

  describe('Fault Injection', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should inject sensor failure fault', async () => {
      adapter.injectFault({
        tagId: 'TEST.TT001.PV',
        faultType: 'sensor_fail',
      });

      const faults = adapter.getActiveFaults();
      expect(faults).toHaveLength(1);
      expect(faults[0].faultType).toBe('sensor_fail');

      const value = await adapter.readTag('TEST.TT001.PV');
      expect(value.quality).toBe('BAD');
    });

    it('should clear a specific fault', async () => {
      adapter.injectFault({
        tagId: 'TEST.TT001.PV',
        faultType: 'spike',
      });

      expect(adapter.getActiveFaults()).toHaveLength(1);

      adapter.clearFault('TEST.TT001.PV');
      expect(adapter.getActiveFaults()).toHaveLength(0);
    });

    it('should clear all faults', async () => {
      adapter.injectFault({ tagId: 'TEST.TT001.PV', faultType: 'spike' });
      adapter.injectFault({ tagId: 'TEST.ST001.PV', faultType: 'drift' });

      expect(adapter.getActiveFaults()).toHaveLength(2);

      adapter.clearAllFaults();
      expect(adapter.getActiveFaults()).toHaveLength(0);
    });

    it('should expire timed faults', async () => {
      adapter.injectFault({
        tagId: 'TEST.TT001.PV',
        faultType: 'spike',
        duration: 500,
      });

      expect(adapter.getActiveFaults()).toHaveLength(1);

      // Advance past fault duration AND past a simulation tick to trigger expiration check
      await vi.advanceTimersByTimeAsync(1100);

      expect(adapter.getActiveFaults()).toHaveLength(0);
    });

    it('never reports BAD quality over an hour of nominal samples without an injected fault', async () => {
      // The real catalogue, not the 3-tag fixture: a rare spontaneous roll
      // needs enough tag-samples to show up. BAD lasts one sample, so collect
      // every notification rather than reading the final state.
      const plant = new SimulationAdapter(MILL_TAGS);
      const badSamples: string[] = [];
      await plant.connect();
      plant.subscribe(
        MILL_TAGS.map((tag) => tag.id),
        (values) =>
          values.forEach((value) => {
            if (value.quality === 'BAD') badSamples.push(value.tagId);
          })
      );

      vi.advanceTimersByTime(3_600_000);

      expect(badSamples).toEqual([]);
      await plant.disconnect();
    });
  });

  describe('Speed follows its setpoint', () => {
    const SP = 'RM101.ST001.SP';
    const PV = 'RM101.ST001.PV';
    const millTags = () => MILL_TAGS.filter((tag) => tag.machineId === 'rm-101');
    const speed = async (plant: SimulationAdapter) => (await plant.readTag(PV)).value as number;

    it('approaches a written setpoint over a few seconds rather than jumping or ignoring it', async () => {
      const plant = new SimulationAdapter(millTags());
      await plant.connect();
      const before = await speed(plant);
      expect(Math.abs(before - 1200)).toBeLessThanOrEqual(5);

      await plant.writeTag(SP, 1500);
      vi.advanceTimersByTime(1_000);
      const afterOneSecond = await speed(plant);
      // First-order: it has moved toward 1500 but not arrived.
      expect(afterOneSecond).toBeGreaterThan(before + 20);
      expect(afterOneSecond).toBeLessThan(1450);

      vi.advanceTimersByTime(30_000);
      // Settled within the transmitter noise (amplitude 5 RPM).
      expect(Math.abs((await speed(plant)) - 1500)).toBeLessThanOrEqual(6);

      await plant.writeTag(SP, 900);
      vi.advanceTimersByTime(30_000);
      expect(Math.abs((await speed(plant)) - 900)).toBeLessThanOrEqual(6);
      await plant.disconnect();
    });

    it('still reads zero speed while the mill is stopped, whatever the setpoint', async () => {
      const plant = new SimulationAdapter(millTags());
      await plant.connect();
      plant.updateMachineStates([{ id: 'rm-101', status: 'idle', metrics: { load: 0, rpm: 0 } }]);
      await plant.writeTag(SP, 1500);
      vi.advanceTimersByTime(5_000);

      expect(await plant.readTag(PV)).toMatchObject({ value: 0, quality: 'UNCERTAIN' });
      await plant.disconnect();
    });
  });

  describe('Diagnostics', () => {
    it('reports exact read rate and errors over elapsed uptime', async () => {
      await adapter.connect();
      await vi.advanceTimersByTimeAsync(1_000);
      await adapter.readTag('TEST.TT001.PV');
      await adapter.readTag('TEST.ST001.PV');
      await expect(adapter.readTag('UNKNOWN.TAG')).rejects.toThrow('Tag not found');

      const stats = adapter.getStatistics();
      expect(stats).toMatchObject({
        readsPerSecond: 3,
        writesPerSecond: 0,
        errorCount: 1,
        uptime: 1,
      });
      expect(stats.avgReadLatency).toBeGreaterThanOrEqual(0);
    });
  });
});
