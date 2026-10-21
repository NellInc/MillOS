import { describe, expect, it } from 'vitest';
import {
  CONVEYOR_LAYOUT,
  FACTORY_BOUNDS,
  SITE_LAYOUT,
  conveyorBounds,
  routeIntersectsBoundsXZ,
} from '../../constants/siteLayout';
import { createConveyorObstacles, createMachineObstacles } from '../../constants/factoryObstacles';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import {
  END_OF_LINE_FOOTPRINTS,
  EOL_INFEED,
  ROLLER_WEST_END_X,
  type CellRect,
} from './endOfLineLayout';

const meets = (a: Omit<CellRect, 'id'>, b: Omit<CellRect, 'id'>, margin = 0) =>
  a.minX - margin < b.maxX &&
  b.minX < a.maxX + margin &&
  a.minZ - margin < b.maxZ &&
  b.minZ < a.maxZ + margin;

describe('packing end-of-line cell', () => {
  it('starts where the roller line ends', () => {
    const roller = conveyorBounds(CONVEYOR_LAYOUT.roller);
    expect(ROLLER_WEST_END_X).toBe(roller.minX);
    expect(EOL_INFEED.maxX).toBeLessThan(roller.minX);
    expect(roller.minX - EOL_INFEED.maxX).toBeLessThanOrEqual(0.1);
    expect(EOL_INFEED.minZ).toBeGreaterThanOrEqual(roller.minZ);
    expect(EOL_INFEED.maxZ).toBeLessThanOrEqual(roller.maxZ);
  });

  it('stands inside the hall, clear of every belt and machine and of itself', () => {
    const conveyors = createConveyorObstacles();
    const machines = createMachineObstacles(0.35);
    for (const cell of END_OF_LINE_FOOTPRINTS) {
      expect(cell.minX).toBeGreaterThan(FACTORY_BOUNDS.minX);
      expect(cell.maxX).toBeLessThan(FACTORY_BOUNDS.maxX);
      expect(cell.minZ).toBeGreaterThan(FACTORY_BOUNDS.minZ);
      expect(cell.maxZ).toBeLessThan(FACTORY_BOUNDS.maxZ);
      // The infeed may butt the roller line; nothing may enter any belt.
      for (const belt of conveyors)
        expect(meets(cell, belt), `${cell.id} / ${belt.id}`).toBe(false);
      for (const machine of machines)
        expect(meets(cell, machine), `${cell.id} / ${machine.id}`).toBe(false);
    }
    for (let i = 0; i < END_OF_LINE_FOOTPRINTS.length; i += 1)
      for (let j = i + 1; j < END_OF_LINE_FOOTPRINTS.length; j += 1)
        expect(meets(END_OF_LINE_FOOTPRINTS[i], END_OF_LINE_FOOTPRINTS[j])).toBe(false);
  });

  it('keeps out of both forklift corridors, with half a metre to spare', () => {
    for (const route of Object.values(SITE_LAYOUT.routes.forklifts))
      for (const cell of END_OF_LINE_FOOTPRINTS)
        expect(routeIntersectsBoundsXZ(route, cell, 0.5), `${route.id} / ${cell.id}`).toBe(false);
  });

  it('keeps off every walking circuit in the mill', () => {
    for (const person of COMMUNITY_ROSTER.filter(({ district }) => district === 'mill')) {
      const points = person.stops.map((stop) => stop.position);
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.25));
        for (let s = 0; s <= steps; s += 1) {
          const x = a[0] + ((b[0] - a[0]) * s) / steps;
          const z = a[2] + ((b[2] - a[2]) * s) / steps;
          for (const cell of END_OF_LINE_FOOTPRINTS)
            expect(
              meets(cell, { minX: x, maxX: x, minZ: z, maxZ: z }, 0.6),
              `${person.id} at (${x.toFixed(1)}, ${z.toFixed(1)}) / ${cell.id}`
            ).toBe(false);
        }
      }
    }
  });
});
