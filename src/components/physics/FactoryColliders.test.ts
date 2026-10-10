import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { createValleyCollider, generateObstacles } from './FactoryColliders';
import { sampleTerrainGroundHeight, VILLAGE_TERRACE } from '../terrain/splatMapGenerator';
import { CANAL_BRIDGE_STEPS, CANAL_FOOTBRIDGE_ACCESS } from '../../constants/publicRealmLayout';
import { LANDSCAPE_GROVE_TREES } from '../exterior/ExteriorVegetation';
import {
  SITE_LAYOUT,
  getLandmarkBounds,
  RIVER_FOOTBRIDGE_DECK,
  RIVER_FOOTBRIDGE_STEPS,
  RIVER_FOOTBRIDGE_LANDINGS,
} from '../../constants/siteLayout';

beforeAll(async () => {
  await RAPIER.init();
});

it('carries the actual river deck across both banks without a phantom side ledge', () => {
  const bridge = generateObstacles().find(({ id }) => id === 'stone-bridge-river')!;
  const {
    centre: [x, y, z],
    size: [width, height, length],
  } = RIVER_FOOTBRIDGE_DECK;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        (bridge.maxX - bridge.minX) / 2,
        (bridge.maxY! - bridge.minY!) / 2,
        (bridge.maxZ - bridge.minZ) / 2
      ).setTranslation(
        (bridge.minX + bridge.maxX) / 2,
        (bridge.minY! + bridge.maxY!) / 2,
        (bridge.minZ + bridge.maxZ) / 2
      )
    );
    world.step();
    const hitAt = (rayX: number, rayZ: number) =>
      world.castRay(new RAPIER.Ray({ x: rayX, y: 8, z: rayZ }, { x: 0, y: -1, z: 0 }), 10, true);
    for (const edgeX of [-width / 2 + 0.05, 0, width / 2 - 0.05])
      for (const edgeZ of [-length / 2 + 0.05, 0, length / 2 - 0.05]) {
        const hit = hitAt(x + edgeX, z + edgeZ);
        expect(hit, `deck at ${edgeX}, ${edgeZ}`).not.toBeNull();
        expect(8 - hit!.timeOfImpact).toBeCloseTo(y + height / 2, 5);
      }
    for (const side of [-1, 1]) expect(hitAt(x + side * (width / 2 + 0.1), z)).toBeNull();
  } finally {
    world.free();
  }
});

describe('physical valley relief', () => {
  it.each([64, 128])('matches rendered ground at the %s-segment tier', (segments) => {
    const [vertices, indices] = createValleyCollider(segments);
    expect(indices.length).toBeGreaterThan(0);
    expect(indices.length / 3).toBeLessThan(7500);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
      world.step();
      let tested = 0;
      for (const {
        position: [x, , z],
      } of LANDSCAPE_GROVE_TREES) {
        const ground = SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments);
        if (ground < 0.1) continue;
        const hit = world.castRay(new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }), 60, true);
        expect(hit, `${x}, ${z}`).not.toBeNull();
        expect(40 - hit!.timeOfImpact).toBeCloseTo(ground, 4);
        tested++;
      }
      expect(tested).toBeGreaterThan(30);
      const pad = getLandmarkBounds(SITE_LAYOUT.landmarks.village);
      for (const x of [pad.minX, (pad.minX + pad.maxX) / 2, pad.maxX])
        for (const z of [pad.minZ, (pad.minZ + pad.maxZ) / 2, pad.maxZ]) {
          const hit = world.castRay(
            new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }),
            60,
            true
          );
          expect(hit, `village ${x}, ${z}`).not.toBeNull();
          expect(40 - hit!.timeOfImpact).toBeCloseTo(
            SITE_LAYOUT.datum.terrain + VILLAGE_TERRACE.height,
            4
          );
        }
      for (let x = VILLAGE_TERRACE.minX - 3; x <= VILLAGE_TERRACE.maxX + 3; x += 3)
        for (let z = VILLAGE_TERRACE.minZ - 3; z <= VILLAGE_TERRACE.maxZ + 3; z += 3) {
          const hit = world.castRay(
            new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }),
            60,
            true
          );
          expect(hit, `plateau join ${x}, ${z}`).not.toBeNull();
          expect(40 - hit!.timeOfImpact).toBeCloseTo(
            SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments),
            4
          );
        }
    } finally {
      world.free();
    }
  });
});

it('carries both complete river stair flights and their at-grade landings', () => {
  const parts = generateObstacles().filter(({ id }) => id.startsWith('river-footbridge-access-'));
  const steps = [...RIVER_FOOTBRIDGE_STEPS, ...RIVER_FOOTBRIDGE_LANDINGS];
  expect(parts).toHaveLength(steps.length);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    for (const p of parts)
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          (p.maxX - p.minX) / 2,
          (p.maxY! - p.minY!) / 2,
          (p.maxZ - p.minZ) / 2
        ).setTranslation((p.maxX + p.minX) / 2, (p.maxY! + p.minY!) / 2, (p.maxZ + p.minZ) / 2)
      );
    world.step();
    for (const step of steps) {
      const hit = world.castRay(
        new RAPIER.Ray({ x: 0, y: 8, z: (step.minZ + step.maxZ) / 2 }, { x: 0, y: -1, z: 0 }),
        10,
        true
      );
      expect(hit).not.toBeNull();
      expect(8 - hit!.timeOfImpact).toBeCloseTo(step.top, 5);
    }
  } finally {
    world.free();
  }
});

it.each([64, 128])(
  'keeps real capsule contact below the old phantom floor and preserves occupied pads at tier %i',
  (segments) => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      const [vertices, indices] = createValleyCollider(segments);
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
      for (const o of generateObstacles())
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(
            (o.maxX - o.minX) / 2,
            ((o.maxY ?? 5) - (o.minY ?? 0)) / 2,
            (o.maxZ - o.minZ) / 2
          ).setTranslation(
            (o.minX + o.maxX) / 2,
            ((o.minY ?? 0) + (o.maxY ?? 5)) / 2,
            (o.minZ + o.maxZ) / 2
          )
        );
      world.step();
      for (const [x, z] of [
        [100, -118],
        [25, -190],
        [-80, 100],
        [100, 0],
        [20, 0],
      ]) {
        const ray = world.castRay(new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }), 60, true);
        expect(ray).not.toBeNull();
        const floor =
          x === 20 && z === 0
            ? 0
            : SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments);
        expect(40 - ray!.timeOfImpact, `${x},${z}`).toBeCloseTo(floor, 4);
      }
      const x = 100,
        z = -118,
        ground = SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, ground + 0.02, z)
          .setGravityScale(0)
          .lockRotations()
      );
      world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.4).setTranslation(0, 0.9, 0), body);
      for (let i = 0; i < 30; i++) world.step();
      expect(body.translation().y).toBeLessThan(-0.5);
      expect(body.translation().y).toBeCloseTo(ground, 0);
      expect(Math.hypot(body.translation().x - x, body.translation().z - z)).toBeLessThan(0.15);
    } finally {
      world.free();
    }
  }
);

it('preserves the real canal deck, all access treads and the actual factory slab dimensions', () => {
  const obstacles = generateObstacles(),
    pad = SITE_LAYOUT.factory.bounds;
  expect(obstacles.find((o) => o.id === 'factory-floor')).toEqual({
    id: 'factory-floor',
    minX: pad.minX,
    maxX: pad.maxX,
    minZ: pad.minZ,
    maxZ: pad.maxZ,
    minY: -1,
    maxY: 0,
  });
  const bridge = CANAL_FOOTBRIDGE_ACCESS,
    parts = obstacles.filter(
      (o) => o.id === 'footbridge-canal' || o.id.startsWith('canal-footbridge-access-')
    );
  expect(parts).toHaveLength(15);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  try {
    for (const o of parts)
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          (o.maxX - o.minX) / 2,
          (o.maxY! - o.minY!) / 2,
          (o.maxZ - o.minZ) / 2
        ).setTranslation((o.minX + o.maxX) / 2, (o.minY! + o.maxY!) / 2, (o.minZ + o.maxZ) / 2)
      );
    world.step();
    for (const step of [
      ...CANAL_BRIDGE_STEPS,
      { minX: bridge.minX, maxX: bridge.maxX, top: bridge.deckY },
    ]) {
      const hit = world.castRay(
        new RAPIER.Ray(
          { x: (step.minX + step.maxX) / 2, y: 8, z: bridge.z },
          { x: 0, y: -1, z: 0 }
        ),
        10,
        true
      );
      expect(hit).not.toBeNull();
      expect(8 - hit!.timeOfImpact).toBeCloseTo(step.top, 5);
    }
  } finally {
    world.free();
  }
});
