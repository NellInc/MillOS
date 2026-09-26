import { SITE_LAYOUT, CONVEYOR_LAYOUT, conveyorBounds } from './siteLayout';

export interface FactoryObstacle {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
}

const createCentredObstacle = (
  id: string,
  position: readonly [number, number, number],
  dimensions: readonly [number, number, number],
  padding: number
): FactoryObstacle => {
  const [x, y, z] = position;
  const [width, height, depth] = dimensions;

  return {
    id,
    minX: x - width / 2 - padding,
    maxX: x + width / 2 + padding,
    minZ: z - depth / 2 - padding,
    maxZ: z + depth / 2 + padding,
    minY: Math.min(0, y),
    maxY: y + height,
  };
};

/**
 * Returns the collision footprint for every canonical machine anchor.
 * Plansifters are elevated, so only their four suspension columns block the floor.
 */
export function createMachineObstacles(clearancePadding = 1): FactoryObstacle[] {
  const obstacles: FactoryObstacle[] = [];

  SITE_LAYOUT.machines.silos.forEach((anchor) => {
    obstacles.push(
      createCentredObstacle(
        anchor.id,
        anchor.position,
        SITE_LAYOUT.machineDimensions.silo,
        clearancePadding
      )
    );
  });

  SITE_LAYOUT.machines.rollerMills.forEach((anchor) => {
    obstacles.push(
      createCentredObstacle(
        anchor.id,
        anchor.position,
        SITE_LAYOUT.machineDimensions.rollerMill,
        clearancePadding
      )
    );
  });

  const suspensionOffsets = [
    [-3.2, -3.2],
    [-3.2, 3.2],
    [3.2, -3.2],
    [3.2, 3.2],
  ] as const;

  SITE_LAYOUT.machines.sifters.forEach((anchor) => {
    suspensionOffsets.forEach(([dx, dz], index) => {
      obstacles.push({
        id: `${anchor.id}-suspension-${index}`,
        minX: anchor.position[0] + dx - 0.5,
        maxX: anchor.position[0] + dx + 0.5,
        minZ: anchor.position[2] + dz - 0.5,
        maxZ: anchor.position[2] + dz + 0.5,
        minY: 0,
        maxY: anchor.position[1],
      });
    });
  });

  SITE_LAYOUT.machines.packers.forEach((anchor) => {
    obstacles.push(
      createCentredObstacle(
        anchor.id,
        anchor.position,
        SITE_LAYOUT.machineDimensions.packer,
        clearancePadding
      )
    );
  });

  return obstacles;
}

/** Every navigation mode shares the rendered belt envelopes. */
export function createConveyorObstacles(): FactoryObstacle[] {
  return Object.values(CONVEYOR_LAYOUT).map((conveyor) => ({
    id: conveyor.id,
    ...conveyorBounds(conveyor),
    minY: 0,
    maxY: 1.5,
  }));
}

/** Conservative dock-platform envelopes shared by every navigation mode. */
export const DOCK_PLATFORM_OBSTACLES: readonly FactoryObstacle[] = [
  { id: 'shipping-dock-platform', minX: -18, maxX: 18, minZ: 44, maxZ: 54, minY: 0, maxY: 1.5 },
  { id: 'receiving-dock-platform', minX: -10, maxX: 10, minZ: -54, maxZ: -44, minY: 0, maxY: 1.5 },
];
