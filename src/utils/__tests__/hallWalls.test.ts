/**
 * The hall shell is solid to walkers (report 04 F4, P6): its walls are in the
 * walking model, with the dock and service portals and the personnel doors'
 * clear openings left open, and they agree with the plinth the shell draws.
 */
import { describe, expect, it } from 'vitest';
import { buildFactoryLowerWallSegments } from '../../components/infrastructure/OptimizedFactoryInfrastructure';
import { PERSONNEL_DOOR, PERSONNEL_DOORS } from '../../constants/accessibilityLayout';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { STEP_FREE_EGRESS } from '../../systems/accessibleEgress';
import {
  HALL_WALL_DEPTH,
  WALKING_OBSTACLES,
  hallWallBlocks,
  hallWallSolids,
  walkingObstacleAt,
} from '../walkingObstacles';

const R = 0.4;

describe('hall walls in the walking model', () => {
  it('are walking solids', () => {
    const ids = new Set(WALKING_OBSTACLES.map((o) => o.id));
    for (const wall of hallWallSolids()) expect(ids.has(wall.id), wall.id).toBe(true);
  });

  it('cover every plinth segment the shell draws, at its depth', () => {
    const walls = hallWallSolids();
    for (const segment of buildFactoryLowerWallSegments()) {
      const [x, , z] = segment.position;
      const [sx, , sz] = segment.scale;
      expect(Math.min(sx, sz)).toBeCloseTo(HALL_WALL_DEPTH, 6);
      const covering = walls.find(
        (w) =>
          w.minX <= x - sx / 2 + 1e-6 &&
          w.maxX >= x + sx / 2 - 1e-6 &&
          w.minZ <= z - sz / 2 + 1e-6 &&
          w.maxZ >= z + sz / 2 - 1e-6
      );
      expect(covering, `plinth at (${x}, ${z})`).toBeDefined();
    }
  });

  it('stop a body at the gable and side walls away from the openings', () => {
    const { minX, maxX, minZ, maxZ } = SITE_LAYOUT.factory.bounds;
    for (const [x, z] of [
      [-25, maxZ],
      [25, minZ],
      [minX, 10],
      [maxX, 30],
    ] as const) {
      expect(walkingObstacleAt(x, z, R)?.id, `(${x}, ${z})`).toMatch(/^hall-wall-/);
      expect(hallWallBlocks(x, z, R)).toBe(true);
    }
  });

  it('leave every portal open across its width', () => {
    for (const portal of Object.values(SITE_LAYOUT.portals)) {
      const front = portal.normal[2] !== 0;
      for (let t = -portal.halfWidth + R; t <= portal.halfWidth - R; t += 0.25) {
        const x = front ? portal.centre[0] + t : portal.centre[0];
        const z = front ? portal.centre[2] : portal.centre[2] + t;
        expect(hallWallBlocks(x, z, R), `${portal.id} at ${t}`).toBe(false);
      }
    }
  });

  it('let a body through each personnel door, and not through its jambs', () => {
    for (const door of PERSONNEL_DOORS) {
      expect(hallWallBlocks(door.x, door.wallZ, R)).toBe(false);
      // The clear opening is 1.0 m: a 0.8 m body has 0.1 m either way.
      expect(hallWallBlocks(door.x + 0.09, door.wallZ, R)).toBe(false);
      expect(hallWallBlocks(door.x + PERSONNEL_DOOR.clearWidth / 2, door.wallZ, R)).toBe(true);
      expect(hallWallBlocks(door.x - PERSONNEL_DOOR.openingHalfWidth, door.wallZ, R)).toBe(true);
      // The leaf stands open outward on the east jamb: solid, beside the route.
      expect(walkingObstacleAt(door.x + 0.95, door.wallZ + door.outward * 0.85, R)?.id).toBe(
        `hall-door-${door.id}-leaf`
      );
      expect(hallWallBlocks(door.x, door.wallZ + door.outward * 0.85, R)).toBe(false);
    }
  });

  it('keep every step-free egress route clear of the walls', () => {
    for (const egress of STEP_FREE_EGRESS)
      for (let i = 1; i < egress.route.length; i++) {
        const [a, b] = [egress.route[i - 1], egress.route[i]];
        const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
        for (let s = 0; s <= steps; s++) {
          const x = a[0] + ((b[0] - a[0]) * s) / steps;
          const z = a[1] + ((b[1] - a[1]) * s) / steps;
          expect(hallWallBlocks(x, z, R), `${egress.zoneId} at (${x}, ${z})`).toBe(false);
        }
      }
  });
});
