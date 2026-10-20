import { describe, expect, it } from 'vitest';
import { SILO_FLOOD, siloFloodFixtures, siloFloodPools, siloWashStrength } from './SiloFloodlights';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { getExteriorLampLevel } from './ExteriorLighting';

describe('silo battery floodlights', () => {
  it('stands two ground floods per bin on its open east and west sides', () => {
    const fixtures = siloFloodFixtures();
    expect(fixtures).toHaveLength(SITE_LAYOUT.machines.silos.length * 2);
    const radius = SITE_LAYOUT.machineDimensions.silo[0] / 2;
    for (const fixture of fixtures) {
      // Clear of every bin: the bins stand 1 m apart in Z, so only +-X is open.
      for (const {
        position: [x, , z],
      } of SITE_LAYOUT.machines.silos) {
        expect(Math.hypot(fixture.position[0] - x, fixture.position[2] - z)).toBeGreaterThan(
          radius + 0.4
        );
      }
      expect(Math.abs(fixture.aim[2])).toBe(0);
      expect(fixture.position[1]).toBe(0);
      // Outdoors, never inside the hall.
      expect(fixture.position[0]).toBeGreaterThan(SITE_LAYOUT.factory.bounds.maxX + 5);
    }
  });

  it('washes the shell only at night, strongest low and facing the flood', () => {
    const night = getExteriorLampLevel(22, 'clear');
    expect(siloWashStrength(getExteriorLampLevel(12, 'clear'), 12, 1)).toBe(0);
    const low = siloWashStrength(night, SILO_FLOOD.washBase + 2, 1);
    const high = siloWashStrength(night, SILO_FLOOD.washTop, 1);
    const away = siloWashStrength(night, SILO_FLOOD.washBase + 2, -0.2);
    expect(low).toBeGreaterThan(0.2);
    expect(high).toBe(0);
    expect(away).toBe(0);
    expect(low).toBeLessThanOrEqual(SILO_FLOOD.peak);
  });
});

describe('silo lane pools', () => {
  it('lights the paving either side of the battery, off the pad, behind each flood', () => {
    // The yard camera's lane beside the bins was flat navy at 22:00: the
    // floods lit the drums and nothing returned to the ground.
    const fixtures = siloFloodFixtures();
    const pools = siloFloodPools();
    expect(pools).toHaveLength(fixtures.length);
    const pad = SITE_LAYOUT.bulkStorage.siloPad;
    const padMinX = pad.position[0] - pad.size[0] / 2;
    const padMaxX = pad.position[0] + pad.size[0] / 2;
    pools.forEach((pool, index) => {
      const fixture = fixtures[index];
      expect(pool.radius).toBeGreaterThanOrEqual(5);
      // Off the pad, so the pool lies on the paving it lights.
      expect(pool.position[0] < padMinX || pool.position[0] > padMaxX).toBe(true);
      // Behind the head: on the far side from the bin it aims at.
      expect((pool.position[0] - fixture.position[0]) * fixture.aim[0]).toBeLessThan(0);
      expect(pool.position[2]).toBe(fixture.position[2]);
    });
  });
});
