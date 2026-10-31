import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { createWorldRealm, FARM_REALM_GEOMETRY } from './WorldPublicRealm';
import {
  CANAL_FOOTBRIDGE_ACCESS as B,
  CANAL_BRIDGE_STEPS,
} from '../../constants/publicRealmLayout';
vi.mock('../../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

// Measured from main 5c805723 before appending mounts/herbs. Every current
// painted rail, cap, cross, coping, flower, mooring line and finish must survive.
const retained = {
  world: {
    count: 16428,
    hashes: {
      position: '8326c30a5e39574e78bf9626bd878026bf226588b2eb5f490099f5d470ad8eb9',
      normal: '9a9df5c686c6f31e8dba15d50ae13495cbf7e24b6024480cc2c380b13372b362',
      uv: '63e7b982bcab150c0d2cc407c6bb9c8c3f87124c81e9033b8ae6203bb6867820',
      color: '0bad6df8a61789db94b0ce9964637539c0df24886d9acd0d1855cbae4de1adb2',
    },
  },
  farm: {
    count: 2376,
    hashes: {
      position: 'cc8676579d77118c869b5895edc335827aa16fa4e44f01b7710dca8f5e423dc5',
      normal: 'c44c4311c603c6fed8c1efc5cfdb882e070099df9c837ea337a109e11de21251',
      uv: '71b25f979e1c50bfb307cd2d108e3a22147d9694f88c15cac0377ad81402a652',
      color: '5a4ecc70fbb9bbf58fe858cd1b3eac451a4ed2c207d1e5aad5c95d3a9cc92f31',
    },
  },
};
const bounds = (g: THREE.BufferGeometry, start: number, count: number) => {
  const p = g.getAttribute('position');
  return new THREE.Box3().setFromPoints(
    Array.from({ length: count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, start + i))
  );
};
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const hit = (meshes: THREE.Mesh[], x: number, y: number, z: number, side: number) =>
  new THREE.Raycaster(
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(0, 0, side),
    0,
    1
  ).intersectObjects(meshes)[0];

describe('current public-realm recovery', () => {
  it('appends bounded detail without replacing any current joinery or flower buffer', () => {
    const world = createWorldRealm(128);
    for (const [kind, g] of [
      ['world', world.solid],
      ['farm', FARM_REALM_GEOMETRY.solid],
    ] as const) {
      const reference = retained[kind];
      for (const [name, hash] of Object.entries(reference.hashes)) {
        const a = g.getAttribute(name);
        const bytes = Buffer.from(
          a.array.buffer,
          a.array.byteOffset,
          reference.count * a.itemSize * 4
        );
        expect(createHash('sha256').update(bytes).digest('hex'), `${kind}/${name}`).toBe(hash);
      }
      expect(g.groups).toHaveLength(0);
    }
    expect(world.solid.getAttribute('position').count - retained.world.count).toBe(60 * 36);
    expect(FARM_REALM_GEOMETRY.solid.getAttribute('position').count - retained.farm.count).toBe(
      8 * 60
    );
    world.paving.dispose();
    world.solid.dispose();
  });
  it('ties every current sleeve and stair rail to the real fascia or stone cheek', async () => {
    const world = createWorldRealm(128);
    const old = world.solid.clone();
    old.setDrawRange(0, retained.world.count);
    const supports = [new THREE.Mesh(old, material)];
    const doc = await new NodeIO().read('public/models/world/wooden-footbridge.glb');
    for (const node of doc.getRoot().listNodes())
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const g = new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
        );
        if (primitive.getIndices())
          g.setIndex(new THREE.BufferAttribute(primitive.getIndices()!.getArray()!, 1));
        g.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()))
          .translate(0, 0, 0.02)
          .rotateY(Math.PI / 2)
          .translate(-145, 0, -50);
        supports.push(new THREE.Mesh(g, material));
      }
    const added = Array.from({ length: 60 }, (_, i) =>
      bounds(world.solid, retained.world.count + i * 36, 36)
    );
    const stations = [
      B.minX + 0.02,
      ...Array.from({ length: 10 }, (_, i) => (B.minX + B.maxX) / 2 - 6.5 + i * 1.5),
    ];
    const feet = stations.map((x) => ({ x, base: B.deckY }));
    for (const edge of [B.minX, B.maxX])
      for (const t of [0, 0.5]) {
        const outer = edge + (edge === B.minX ? -1 : 1) * B.steps * B.going;
        const x = outer + (edge - outer) * t;
        feet.push({
          x,
          base:
            CANAL_BRIDGE_STEPS.find((s) => x >= s.minX - 1e-6 && x <= s.maxX + 1e-6)?.top ??
            B.deckY,
        });
      }
    for (const side of [-1, 1])
      for (const { x, base } of feet) {
        // Support ray excludes all new brackets, so they cannot validate themselves.
        const support = [x, x - 0.025, x + 0.025]
          .map((px) => hit(supports, px, base - 0.09, B.z + side * 1.3, -side))
          .find(Boolean);
        expect(support, `${x}/${side}`).toBeDefined();
        expect(Math.abs(support.point.z - B.z)).toBeCloseTo(B.halfWidth, 4);
        const plate = added.find(
          (b) =>
            b
              .getCenter(new THREE.Vector3())
              .distanceTo(new THREE.Vector3(x, base - 0.09, B.z + side * 1.255)) < 1e-4
        )!;
        const shelf = added.find(
          (b) =>
            b
              .getCenter(new THREE.Vector3())
              .distanceTo(new THREE.Vector3(x, base - 0.01, B.z + side * 1.345)) < 1e-4
        )!;
        expect(plate).toBeDefined();
        expect(shelf).toBeDefined();
        const overlap = plate.clone().intersect(shelf).getSize(new THREE.Vector3());
        expect(Math.min(...overlap.toArray())).toBeGreaterThan(0.009);
        expect(shelf.min.y).toBeLessThan(base);
        expect(shelf.max.y).toBeGreaterThan(base);
        // The actual retained rail foot intersects the shelf, not its AABB alone.
        expect(
          hit([new THREE.Mesh(old, material)], x, base + 0.002, B.z + side * 1.5, -side)
        ).toBeDefined();
      }
    for (const box of added)
      expect(Math.min(Math.abs(box.min.z - B.z), Math.abs(box.max.z - B.z))).toBeGreaterThan(1.23);
    supports.forEach((m) => m.geometry.dispose());
    world.solid.dispose();
    world.paving.dispose();
  });
  it('roots eight compact herb clusters inside the original soil and clear of the coping', () => {
    const g = FARM_REALM_GEOMETRY.solid;
    for (let i = 0; i < 8; i++) {
      const b = bounds(g, retained.farm.count + i * 60, 60);
      const z = i < 4 ? 12 : 18;
      expect(b.min.x).toBeGreaterThan(-19.9 - 0.465);
      expect(b.max.x).toBeLessThan(-19.9 + 0.465);
      expect(b.min.z).toBeGreaterThan(z - 1.715);
      expect(b.max.z).toBeLessThan(z + 1.715);
      expect(b.min.y).toBeCloseTo(0.262, 5); // ground=-.02, soil centre=.282
      expect(b.max.y).toBeLessThan(0.72);
    }
  });
});
