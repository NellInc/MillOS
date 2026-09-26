import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { createValleyCollider, generateObstacles } from './FactoryColliders';
import { sampleValleyGroundHeight, VILLAGE_TERRACE } from '../terrain/splatMapGenerator';
import { LANDSCAPE_GROVE_TREES } from '../exterior/ExteriorVegetation';
import { SITE_LAYOUT, getLandmarkBounds, RIVER_FOOTBRIDGE_DECK } from '../../constants/siteLayout';

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
    expect(indices.length / 3).toBeLessThan(1200);
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    try {
      world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
      world.step();
      let tested = 0;
      for (const {
        position: [x, , z],
      } of LANDSCAPE_GROVE_TREES) {
        const ground = sampleValleyGroundHeight(x, z, segments);
        if (ground < 0.1) continue;
        const hit = world.castRay(new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }), 40, true);
        expect(hit, `${x}, ${z}`).not.toBeNull();
        expect(40 - hit!.timeOfImpact).toBeCloseTo(ground, 4);
        tested++;
      }
      expect(tested).toBeGreaterThan(30);
      const pad = getLandmarkBounds(SITE_LAYOUT.landmarks.village);
      if (VILLAGE_TERRACE.height <= 0.001) {
        // At grade, the flat world floor carries the village; the valley
        // collider must add nothing under it.
        for (const x of [pad.minX + 1, (pad.minX + pad.maxX) / 2, pad.maxX - 1])
          for (const z of [pad.minZ + 1, (pad.minZ + pad.maxZ) / 2, pad.maxZ - 1])
            expect(
              world.castRay(new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }), 40, true),
              `village ${x}, ${z}`
            ).toBeNull();
        return;
      }
      for (const x of [pad.minX, (pad.minX + pad.maxX) / 2, pad.maxX])
        for (const z of [pad.minZ, (pad.minZ + pad.maxZ) / 2, pad.maxZ]) {
          const hit = world.castRay(
            new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }),
            40,
            true
          );
          expect(hit, `village ${x}, ${z}`).not.toBeNull();
          expect(40 - hit!.timeOfImpact).toBeCloseTo(SITE_LAYOUT.landmarks.village.position[1], 4);
        }
      for (let x = VILLAGE_TERRACE.minX - 3; x <= VILLAGE_TERRACE.maxX + 3; x += 3)
        for (let z = VILLAGE_TERRACE.minZ - 3; z <= VILLAGE_TERRACE.maxZ + 3; z += 3) {
          const hit = world.castRay(
            new RAPIER.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }),
            40,
            true
          );
          expect(hit, `plateau join ${x}, ${z}`).not.toBeNull();
          expect(40 - hit!.timeOfImpact).toBeCloseTo(sampleValleyGroundHeight(x, z, segments), 4);
        }
    } finally {
      world.free();
    }
  });
});
