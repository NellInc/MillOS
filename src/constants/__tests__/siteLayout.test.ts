import { describe, expect, it } from 'vitest';
import { resolveCameraCollision } from '../../utils/cameraCollision';
import {
  createMachineObstacles,
  createConveyorObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../factoryObstacles';
import { WATER_LAYERS } from '../renderLayers';
import {
  FACTORY_BOUNDS,
  SITE_LAYOUT,
  SILO_ACCESS_LAYOUT,
  boundsOverlapXZ,
  containsPoint,
  getServiceAssetBounds,
  getSiloAssemblyScale,
  getLandmarkBounds,
  getVisibleSiteCells,
  getVisibleSiteCellsForView,
  isPointInPortalTransition,
  landmarkLocalToWorld,
  routeIntersectsBoundsXZ,
} from '../siteLayout';

describe('canonical site layout', () => {
  it('shares a collision-clear floor composition between production navigation and review', () => {
    const floor = SITE_LAYOUT.cameras.processFloor;
    expect(SITE_LAYOUT.cameras.milling).toEqual(floor);
    expect(resolveCameraCollision([-34, 4.5, 49], floor.position)).toEqual({
      position: floor.position,
      collidedWith: null,
    });
    expect(containsPoint(FACTORY_BOUNDS, ...floor.position)).toBe(true);
    expect(floor.position[0] - FACTORY_BOUNDS.minX).toBeGreaterThan(3);
  });

  it('defines fifteen unique working machines with bulk storage outside the production hall', () => {
    const anchors = Object.values(SITE_LAYOUT.machines).flat();
    const ids = anchors.map(({ id }) => id);

    expect(anchors).toHaveLength(15);
    expect(new Set(ids).size).toBe(ids.length);
    const indoor = [
      ...SITE_LAYOUT.machines.rollerMills,
      ...SITE_LAYOUT.machines.sifters,
      ...SITE_LAYOUT.machines.packers,
    ];
    indoor.forEach(({ position }) => expect(containsPoint(FACTORY_BOUNDS, ...position)).toBe(true));
    SITE_LAYOUT.machines.silos.forEach(({ position }) => {
      expect(containsPoint(FACTORY_BOUNDS, ...position)).toBe(false);
      expect(position[0] - SITE_LAYOUT.machineDimensions.silo[0] / 2).toBeGreaterThan(
        FACTORY_BOUNDS.maxX
      );
    });
  });

  it('keeps the bulk-storage envelopes clear of aprons and neighbouring assets', () => {
    const size = SITE_LAYOUT.machineDimensions.silo;
    const storage = [
      {
        id: SITE_LAYOUT.bulkStorage.elevator.id,
        bounds: getServiceAssetBounds(SITE_LAYOUT.bulkStorage.elevator),
      },
      ...SITE_LAYOUT.machines.silos.map(({ id, position: [x, y, z] }) => ({
        id,
        bounds: {
          minX: x - size[0] / 2 - 0.3,
          maxX: x + size[0] / 2 + 0.3,
          minY: y,
          maxY: y + size[1] + 1,
          minZ: z - size[2] / 2 - 0.3,
          maxZ: z + size[2] / 2 + 0.3,
        },
      })),
    ];
    storage.forEach(({ id, bounds }, index) => {
      expect(boundsOverlapXZ(bounds, FACTORY_BOUNDS), id).toBe(false);
      expect(boundsOverlapXZ(bounds, SITE_LAYOUT.docks.receiving.apron), id).toBe(false);
      expect(bounds.minX).toBeGreaterThanOrEqual(SITE_LAYOUT.perimeter.minX);
      expect(bounds.maxX).toBeLessThanOrEqual(SITE_LAYOUT.perimeter.maxX);
      expect(bounds.minZ).toBeGreaterThanOrEqual(SITE_LAYOUT.perimeter.minZ);
      for (const other of storage.slice(index + 1))
        expect(boundsOverlapXZ(bounds, other.bounds), `${id} hits ${other.id}`).toBe(false);
      for (const asset of Object.values(SITE_LAYOUT.serviceYard))
        expect(
          boundsOverlapXZ(bounds, getServiceAssetBounds(asset)),
          `${id} hits ${asset.id}`
        ).toBe(false);
    });
  });

  it('provides continuous human-scale access from the pad to the bin eave', () => {
    const layout = SILO_ACCESS_LAYOUT;
    const [sx, sy] = getSiloAssemblyScale(SITE_LAYOUT.machineDimensions.silo);
    expect(layout.ladderHalfWidth * 2 * sx).toBeCloseTo(0.72, 6);
    expect(layout.rungPitch * sy).toBeCloseTo(0.3, 6);
    expect(layout.firstRungY * sy).toBeCloseTo(0.5, 6);
    expect((layout.firstRungY + (layout.rungCount - 1) * layout.rungPitch) * sy).toBeCloseTo(
      29.6,
      6
    );
    expect((layout.railCentreY + layout.railHeight / 2) * sy).toBeCloseTo(31.2, 6);
    expect(layout.hatchCentreY * sy).toBe(2);
    expect(layout.hatchSize[1] * sy).toBe(1.2);
    expect(layout.supportWidth * sx).toBeCloseTo(0.1866667, 5);
    const supportOuterRadius = Math.SQRT2 * (layout.supportOffset + layout.supportWidth / 2) * sx;
    expect(supportOuterRadius - layout.baseRadius * sx).toBeGreaterThan(0);
    expect(supportOuterRadius - layout.baseRadius * sx).toBeLessThan(0.13);
  });

  it('scales the complete silo assembly and rejects invalid dimensions per axis', () => {
    expect(getSiloAssemblyScale([4.5, 16, 4.5])).toEqual([1, 1, 1]);
    expect(getSiloAssemblyScale(SITE_LAYOUT.machineDimensions.silo)).toEqual([
      12 / 4.5,
      2,
      12 / 4.5,
    ]);
    expect(getSiloAssemblyScale([0, Number.NaN, -1])).toEqual([1, 1, 1]);
  });

  it('keeps each production group on its declared zone datum', () => {
    const expectedZones = [
      [SITE_LAYOUT.machines.rollerMills, SITE_LAYOUT.factory.zones.milling],
      [SITE_LAYOUT.machines.sifters, SITE_LAYOUT.factory.zones.sifting],
      [SITE_LAYOUT.machines.packers, SITE_LAYOUT.factory.zones.packing],
    ] as const;

    expectedZones.forEach(([anchors, expectedZ]) => {
      anchors.forEach(({ position }) => expect(position[2]).toBe(expectedZ));
    });
    const { position: centre, size } = SITE_LAYOUT.bulkStorage.siloPad;
    expect(centre[2]).toBe(SITE_LAYOUT.factory.zones.silos);
    for (const { position } of SITE_LAYOUT.machines.silos) {
      expect(
        Math.abs(position[0] - centre[0]) + SITE_LAYOUT.machineDimensions.silo[0] / 2
      ).toBeLessThanOrEqual(size[0] / 2);
      expect(
        Math.abs(position[2] - centre[2]) + SITE_LAYOUT.machineDimensions.silo[2] / 2
      ).toBeLessThanOrEqual(size[2] / 2);
    }
  });

  it('transforms village evidence cameras with the rendered site and keeps its pad inside the world', () => {
    const village = SITE_LAYOUT.landmarks.village;
    expect(SITE_LAYOUT.cameras.square.position).toEqual(
      landmarkLocalToWorld(village, [12, 3.6, -4])
    );
    expect(SITE_LAYOUT.cameras.square.target).toEqual(landmarkLocalToWorld(village, [0, 2, 8]));
    expect(landmarkLocalToWorld(village, [0, 0, 0])).toEqual(village.position);
    const bounds = getLandmarkBounds(village);
    for (const x of [bounds.minX, bounds.maxX])
      for (const z of [bounds.minZ, bounds.maxZ])
        expect(Math.hypot(x, z)).toBeLessThan(SITE_LAYOUT.world.radius);
  });

  it('retains every authored landmark footprint inside the playable landscape', () => {
    // The castle is a backdrop set against the foothills, as in v0.30. It turns
    // 45 degrees, so its reach is the half-diagonal; it must stand in front of
    // the site-anchored foothill ring, whose foot is world.radius + 16.
    const { castle, ...walkable } = SITE_LAYOUT.landmarks;
    const castleReach =
      Math.hypot(castle.position[0], castle.position[2]) +
      (Math.SQRT2 / 2) * Math.max(...castle.footprint) * castle.scale;
    expect(castleReach).toBeLessThan(SITE_LAYOUT.world.radius + 16);
    for (const anchor of Object.values(walkable)) {
      const bounds = getLandmarkBounds(anchor);
      for (const x of [bounds.minX, bounds.maxX])
        for (const z of [bounds.minZ, bounds.maxZ])
          expect(Math.hypot(x, z), anchor.id).toBeLessThan(SITE_LAYOUT.world.radius);
    }
  });

  it('aligns portals to the corresponding factory boundary', () => {
    expect(SITE_LAYOUT.portals.shipping.centre[2]).toBe(FACTORY_BOUNDS.maxZ);
    expect(SITE_LAYOUT.portals.receiving.centre[2]).toBe(FACTORY_BOUNDS.minZ);
    expect(SITE_LAYOUT.portals.eastService.centre[0]).toBe(FACTORY_BOUNDS.maxX);
    expect(SITE_LAYOUT.portals.westService.centre[0]).toBe(FACTORY_BOUNDS.minX);

    expect(SITE_LAYOUT.docks.shipping.bayCentre[2]).toBeGreaterThan(FACTORY_BOUNDS.maxZ);
    expect(SITE_LAYOUT.docks.receiving.bayCentre[2]).toBeLessThan(FACTORY_BOUNDS.minZ);
  });

  it('keeps service-yard footprints separated and vehicle aprons clear', () => {
    const assets = Object.values(SITE_LAYOUT.serviceYard);
    const bounds = assets.map((asset) => ({
      id: asset.id,
      bounds: getServiceAssetBounds(asset),
    }));

    for (let left = 0; left < bounds.length; left += 1) {
      for (let right = left + 1; right < bounds.length; right += 1) {
        expect(
          boundsOverlapXZ(bounds[left].bounds, bounds[right].bounds),
          `${bounds[left].id} overlaps ${bounds[right].id}`
        ).toBe(false);
      }
    }

    const maintenanceClearance = getServiceAssetBounds(
      SITE_LAYOUT.serviceYard.maintenanceGarage,
      true
    );
    const propaneClearance = getServiceAssetBounds(SITE_LAYOUT.serviceYard.propaneCompound, true);
    expect(boundsOverlapXZ(maintenanceClearance, propaneClearance)).toBe(false);

    const tankFarm = getServiceAssetBounds(SITE_LAYOUT.serviceYard.utilityTankFarm);
    expect(boundsOverlapXZ(tankFarm, propaneClearance)).toBe(false);

    for (const asset of bounds) {
      expect(boundsOverlapXZ(asset.bounds, FACTORY_BOUNDS), `${asset.id} crosses factory`).toBe(
        false
      );
      expect(asset.bounds.minX, `${asset.id} west perimeter`).toBeGreaterThanOrEqual(
        SITE_LAYOUT.perimeter.minX
      );
      expect(asset.bounds.maxX, `${asset.id} east perimeter`).toBeLessThanOrEqual(
        SITE_LAYOUT.perimeter.maxX
      );
      expect(asset.bounds.minZ, `${asset.id} north perimeter`).toBeGreaterThanOrEqual(
        SITE_LAYOUT.perimeter.minZ
      );
      expect(asset.bounds.maxZ, `${asset.id} south perimeter`).toBeLessThanOrEqual(
        SITE_LAYOUT.perimeter.maxZ
      );
      expect(
        boundsOverlapXZ(asset.bounds, SITE_LAYOUT.docks.shipping.apron),
        `${asset.id} crosses shipping apron`
      ).toBe(false);
      expect(
        boundsOverlapXZ(asset.bounds, SITE_LAYOUT.docks.receiving.apron),
        `${asset.id} crosses receiving apron`
      ).toBe(false);
    }
  });

  it('keeps canonical forklift swept corridors clear of machines and service assets', () => {
    const routes = Object.values(SITE_LAYOUT.routes.forklifts);
    const obstacles = createMachineObstacles(0.35);
    const serviceAssets = Object.values(SITE_LAYOUT.serviceYard).map((asset) => ({
      id: asset.id,
      bounds: getServiceAssetBounds(asset),
    }));

    for (const route of routes) {
      route.points.forEach((point) => expect(containsPoint(FACTORY_BOUNDS, ...point)).toBe(true));
      for (const obstacle of obstacles) {
        expect(routeIntersectsBoundsXZ(route, obstacle), `${route.id} hits ${obstacle.id}`).toBe(
          false
        );
      }
      for (const asset of serviceAssets) {
        expect(routeIntersectsBoundsXZ(route, asset.bounds), `${route.id} hits ${asset.id}`).toBe(
          false
        );
      }
    }
  });

  it('keeps forklift swept corridors clear of conveyors and physical dock platforms', () => {
    const shipping = SITE_LAYOUT.routes.forklifts.shipping;
    const receiving = SITE_LAYOUT.routes.forklifts.receiving;

    for (const route of [shipping, receiving]) {
      for (const platform of DOCK_PLATFORM_OBSTACLES) {
        expect(routeIntersectsBoundsXZ(route, platform), `${route.id} hits ${platform.id}`).toBe(
          false
        );
      }
      // Dock intersections are slow approach zones; only the platforms are solid.
      for (const hazard of Object.values(SITE_LAYOUT.routeHazards).filter(
        ({ type }) => type === 'conveyor'
      )) {
        expect(routeIntersectsBoundsXZ(route, hazard.bounds), `${route.id} hits ${hazard.id}`).toBe(
          false
        );
      }
    }
  });

  it('keeps navigation belt obstacles on the rendered conveyor hazards', () => {
    const obstacles = createConveyorObstacles();
    expect(obstacles).toHaveLength(4);
    for (const obstacle of obstacles) {
      const hazard = Object.values(SITE_LAYOUT.routeHazards).find(({ id }) => id === obstacle.id);
      expect(hazard).toBeDefined();
      expect(obstacle).toMatchObject(hazard!.bounds);
      expect(obstacle.maxY).toBeGreaterThan(0.85);
    }
  });

  it('keeps authored landscape districts separated from the factory and service yard', () => {
    const landmarks = Object.values(SITE_LAYOUT.landmarks).map((landmark) => ({
      id: landmark.id,
      bounds: getLandmarkBounds(landmark),
    }));
    const factory = SITE_LAYOUT.factory.bounds;
    const serviceAssets = Object.values(SITE_LAYOUT.serviceYard).map((asset) => ({
      id: asset.id,
      bounds: getServiceAssetBounds(asset),
    }));

    for (let left = 0; left < landmarks.length; left += 1) {
      expect(boundsOverlapXZ(landmarks[left].bounds, factory), landmarks[left].id).toBe(false);
      for (let right = left + 1; right < landmarks.length; right += 1) {
        expect(
          boundsOverlapXZ(landmarks[left].bounds, landmarks[right].bounds),
          `${landmarks[left].id} overlaps ${landmarks[right].id}`
        ).toBe(false);
      }
      for (const asset of serviceAssets) {
        expect(
          boundsOverlapXZ(landmarks[left].bounds, asset.bounds),
          `${landmarks[left].id} overlaps ${asset.id}`
        ).toBe(false);
      }
    }
  });

  it('models portal transition volumes on both sides of each opening', () => {
    expect(isPointInPortalTransition(SITE_LAYOUT.portals.shipping, 0, 49)).toBe(true);
    expect(isPointInPortalTransition(SITE_LAYOUT.portals.shipping, 0, 61)).toBe(true);
    expect(isPointInPortalTransition(SITE_LAYOUT.portals.shipping, 30, 50)).toBe(false);

    const east = SITE_LAYOUT.portals.eastService;
    expect(isPointInPortalTransition(east, east.centre[0] - 2, east.centre[2])).toBe(true);
    expect(isPointInPortalTransition(east, east.centre[0] + 2, east.centre[2])).toBe(true);
    expect(isPointInPortalTransition(east, east.centre[0], 0)).toBe(false);
  });

  it('preloads only nearby render cells and overlaps at portals', () => {
    expect(getVisibleSiteCells(35, 25, 20)).toEqual(['interior']);
    expect(getVisibleSiteCells(0, 5, 50)).toEqual(expect.arrayContaining(['interior', 'shipping']));
    expect(getVisibleSiteCells(0, 5, -50)).toEqual(
      expect.arrayContaining(['interior', 'receiving'])
    );
    // The new overview is beyond the west yard; its gaze still loads the mill.
    expect(getVisibleSiteCells(-75, 32, 110)).toEqual(['westYard']);
    expect(getVisibleSiteCells(...SITE_LAYOUT.cameras.overview.position)).toEqual([]);

    const overview = SITE_LAYOUT.cameras.overview;
    const direction = overview.target.map((value, index) => value - overview.position[index]) as [
      number,
      number,
      number,
    ];
    expect(getVisibleSiteCellsForView(overview.position, direction)).toEqual(
      expect.arrayContaining(['interior', 'shipping', 'receiving'])
    );
  });

  it('derives one collision set from the canonical machine anchors', () => {
    const obstacles = createMachineObstacles();
    const ids = obstacles.map(({ id }) => id);

    expect(obstacles).toHaveLength(24);
    expect(new Set(ids).size).toBe(ids.length);
    obstacles.forEach((obstacle) => {
      expect(obstacle.minX).toBeLessThan(obstacle.maxX);
      expect(obstacle.minY).toBeLessThan(obstacle.maxY);
      expect(obstacle.minZ).toBeLessThan(obstacle.maxZ);
    });
  });

  it('keeps every camera pose finite, above ground, and within the world', () => {
    Object.values(SITE_LAYOUT.cameras).forEach(({ position, target }) => {
      [...position, ...target].forEach((value) => expect(Number.isFinite(value)).toBe(true));
      expect(position[1]).toBeGreaterThan(SITE_LAYOUT.datum.terrain);
      expect(Math.hypot(position[0], position[2])).toBeLessThan(SITE_LAYOUT.world.radius);
    });
  });

  it('keeps the overview above the shell at a facade-preserving oblique angle', () => {
    const { position, target } = SITE_LAYOUT.cameras.overview;
    const horizontalDistance = Math.hypot(position[0] - target[0], position[2] - target[2]);
    const elevationAngle = Math.atan2(position[1] - target[1], horizontalDistance);

    expect(position[1]).toBeGreaterThan(SITE_LAYOUT.factory.bounds.maxY + 3);
    expect(elevationAngle).toBeGreaterThan(Math.PI / 24);
    expect(elevationAngle).toBeLessThan(Math.PI / 8);
    expect(SITE_LAYOUT.cameras.overview.fov).toBe(45);
  });

  it('keeps the yard camera and target outside the opaque factory shell', () => {
    const { position, target } = SITE_LAYOUT.cameras.yard;

    expect(
      containsPoint(SITE_LAYOUT.renderCells.eastYard, position[0], position[1], position[2])
    ).toBe(true);
    expect(containsPoint(SITE_LAYOUT.renderCells.eastYard, target[0], target[1], target[2])).toBe(
      true
    );
    expect(target[0]).toBeGreaterThan(SITE_LAYOUT.factory.bounds.maxX);
  });

  it('aims the water evidence camera at the declared water datum', () => {
    const { position, target } = SITE_LAYOUT.cameras.water;

    expect(target[1]).toBe(SITE_LAYOUT.datum.water);
    expect(Math.hypot(position[0], position[2])).toBeLessThan(SITE_LAYOUT.world.radius);
    expect(Math.hypot(position[0] - target[0], position[2] - target[2])).toBeGreaterThan(24);
  });

  it('keeps uncrewed review cameras on the process floor, tank farm, and logistics yard', () => {
    const process = SITE_LAYOUT.cameras.processFloor;
    const tank = SITE_LAYOUT.cameras.tankFarm;
    const logistics = SITE_LAYOUT.cameras.logisticsClose;
    const tankFarm = SITE_LAYOUT.serviceYard.utilityTankFarm.position;

    expect(containsPoint(SITE_LAYOUT.renderCells.interior, ...process.target)).toBe(true);
    expect(tank.target[0]).toBe(tankFarm[0]);
    expect(tank.target[2]).toBe(tankFarm[2]);
    expect(containsPoint(SITE_LAYOUT.renderCells.eastYard, ...tank.target)).toBe(true);
    expect(containsPoint(SITE_LAYOUT.renderCells.shipping, ...logistics.target)).toBe(true);
    expect(process.fov).toBeGreaterThanOrEqual(45);
    expect(tank.fov).toBeGreaterThanOrEqual(45);
    expect(logistics.fov).toBeGreaterThanOrEqual(45);
  });

  it('keeps the paddock and square cameras close enough to resolve their subjects', () => {
    // These two exist because `farm` and `village` frame whole sites and render
    // a 1.3 m cow at a handful of pixels. If either drifts back out to site
    // distance it stops grading what it was added to grade, so the distance is
    // asserted rather than left to a comment.
    const landmarks = {
      paddock: SITE_LAYOUT.landmarks.farm,
      square: SITE_LAYOUT.landmarks.village,
    } as const;

    (['paddock', 'square'] as const).forEach((name) => {
      const { position, target } = SITE_LAYOUT.cameras[name];
      const distance = Math.hypot(
        position[0] - target[0],
        position[1] - target[1],
        position[2] - target[2]
      );
      expect(distance).toBeGreaterThan(8);
      expect(distance).toBeLessThan(30);

      // And aimed inside the landmark it is named for, not merely near it.
      const anchor = landmarks[name];
      expect(Math.abs(target[0] - anchor.position[0])).toBeLessThan(anchor.footprint[0] / 2);
      expect(Math.abs(target[2] - anchor.position[2])).toBeLessThan(anchor.footprint[1] / 2);
      expect(position[1]).toBeGreaterThan(target[1]);
    });
  });

  it('uses one declared water surface datum', () => {
    expect(SITE_LAYOUT.datum.waterBed).toBe(WATER_LAYERS.bed);
    expect(SITE_LAYOUT.datum.water).toBe(WATER_LAYERS.surface);
    expect(SITE_LAYOUT.datum.waterBed).toBeGreaterThan(SITE_LAYOUT.datum.terrain);
    expect(SITE_LAYOUT.datum.water).toBeGreaterThan(SITE_LAYOUT.datum.waterBed);
    expect(SITE_LAYOUT.datum.water).toBeGreaterThan(SITE_LAYOUT.datum.terrain);
  });
});
