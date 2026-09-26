import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { MachineType } from '../types';
import { getHolographicZoneMetrics, HOLOGRAPHIC_ZONE_POSITIONS } from './HolographicDisplays';

describe('holographic production displays', () => {
  it('preserves empty storage and stopped output without fabricated offsets', () => {
    const result = getHolographicZoneMetrics(
      [
        { type: MachineType.SILO, status: 'idle', fillLevel: 0 },
        { type: MachineType.ROLLER_MILL, status: 'idle' },
      ],
      { throughput: 0, quality: 0 },
      0
    );
    expect(result).toEqual({
      siloLevel: 0,
      runningMills: 0,
      millAvailability: 0,
      runningMachines: 0,
      qualityGrade: 0,
      bagsPerMin: 0,
      totalBags: 0,
    });
  });

  it('converts actual hourly output and reports missing readings as unavailable', () => {
    const result = getHolographicZoneMetrics(
      [{ type: MachineType.SILO, status: 'running' }],
      { throughput: 1240, quality: Number.NaN },
      24
    );
    expect(result.bagsPerMin).toBeCloseTo(1240 / 60);
    expect(result.siloLevel).toBeNull();
    expect(result.qualityGrade).toBeNull();
    expect(result.millAvailability).toBeNull();
    expect(result.totalBags).toBe(24);
  });

  it('counts a mill running with a warning as running', () => {
    const result = getHolographicZoneMetrics(
      [
        { type: MachineType.ROLLER_MILL, status: 'warning' },
        { type: MachineType.ROLLER_MILL, status: 'running' },
        { type: MachineType.ROLLER_MILL, status: 'critical' },
        { type: MachineType.ROLLER_MILL, status: 'idle' },
      ],
      { throughput: 0, quality: 0 },
      0
    );
    expect(result.runningMills).toBe(2);
    expect(result.millAvailability).toBe(50);
    expect(result.runningMachines).toBe(2);
  });

  it('places every zone label at its actual production bank', () => {
    expect(HOLOGRAPHIC_ZONE_POSITIONS.storage[2]).toBe(SITE_LAYOUT.factory.zones.silos);
    expect(HOLOGRAPHIC_ZONE_POSITIONS.milling[2]).toBe(SITE_LAYOUT.factory.zones.milling);
    expect(HOLOGRAPHIC_ZONE_POSITIONS.sifting[2]).toBe(SITE_LAYOUT.factory.zones.sifting);
    expect(HOLOGRAPHIC_ZONE_POSITIONS.packing[2]).toBe(SITE_LAYOUT.factory.zones.packing);
  });
});
