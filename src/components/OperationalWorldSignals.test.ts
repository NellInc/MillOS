import { describe, expect, it } from 'vitest';
import { createMachineObstacles } from '../constants/factoryObstacles';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { INCIDENT_DEFINITIONS } from '../stores/operationsCampaignStore';
import { OPERATIONAL_INCIDENT_PLACEMENTS } from './OperationalWorldSignals';

describe('operational world signal placement', () => {
  it('maps every operational incident into the canonical unified site', () => {
    expect(Object.keys(OPERATIONAL_INCIDENT_PLACEMENTS).sort()).toEqual(
      Object.keys(INCIDENT_DEFINITIONS).sort()
    );

    Object.values(OPERATIONAL_INCIDENT_PLACEMENTS).forEach(({ position }) => {
      expect(position.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(position[0], position[2])).toBeLessThan(SITE_LAYOUT.world.radius);
    });
  });

  it('keeps incident markers logically separated rather than stacking at the origin', () => {
    const placements = Object.values(OPERATIONAL_INCIDENT_PLACEMENTS);
    placements.forEach((placement, index) => {
      placements.slice(index + 1).forEach((other) => {
        expect(
          Math.hypot(
            placement.position[0] - other.position[0],
            placement.position[2] - other.position[2]
          )
        ).toBeGreaterThan(5);
      });
    });
  });

  it('keeps every ground-level marker outside the machine footprints', () => {
    const obstacles = createMachineObstacles(0);
    Object.entries(OPERATIONAL_INCIDENT_PLACEMENTS).forEach(([kind, { position }]) => {
      const [x, y, z] = position;
      if (y >= 1) return;
      obstacles.forEach((obstacle) => {
        const inside =
          x >= obstacle.minX && x <= obstacle.maxX && z >= obstacle.minZ && z <= obstacle.maxZ;
        expect(inside, `${kind} marker inside ${obstacle.id}`).toBe(false);
      });
    });
  });

  it('anchors machine incidents beside their actual production zones', () => {
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.bearing_overheat.position[2]).toBe(
      SITE_LAYOUT.factory.zones.milling
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.bearing_overheat.position[0] + 1.25).toBeLessThan(
      SITE_LAYOUT.machines.rollerMills[0].position[0] -
        SITE_LAYOUT.machineDimensions.rollerMill[0] / 2
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.dust_filter_pressure.position[2]).toBeCloseTo(
      SITE_LAYOUT.factory.zones.sifting + 2.75
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.dust_filter_pressure.position[1]).toBeGreaterThan(
      SITE_LAYOUT.datum.mezzanine
    );
    expect(OPERATIONAL_INCIDENT_PLACEMENTS.packaging_shortage.position[2]).toBe(
      SITE_LAYOUT.factory.zones.packing
    );
  });
});
