import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { COMPACT_FORK_LOAD, createAuthoredForkliftMaterials } from './ForkliftModel';
import { getFlourPalletGeometry } from '../../utils/flourSacks';

describe('shipped forklift material contract', () => {
  // The runtime swaps each GLB material for its own by NAME and silently keeps
  // the loader's material on a miss. a2662a8a renamed `operator-seat` to
  // `control-seat` in the normalizer and here without regenerating the GLB, so
  // the seat kept the baked material. Working if every material the shipped
  // file carries has a runtime replacement.
  it('gives every material in public/models/forklift/forklift.glb a runtime replacement', () => {
    const bytes = readFileSync('public/models/forklift/forklift.glb');
    const jsonLength = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()) as {
      materials: { name?: string }[];
    };
    const shipped = gltf.materials.map((material) => material.name ?? '');
    const materials = createAuthoredForkliftMaterials(0);
    expect(shipped.filter((name) => !(name in materials.byName))).toEqual([]);
    expect(shipped).toContain('control-seat');
    for (const material of materials.all) material.dispose();
  });
});

describe('compact forklift pallet contact', () => {
  it('reproduces the prior compact contact defect against the actual timber', () => {
    const pallet = new THREE.Mesh(getFlourPalletGeometry().pallet, new THREE.MeshBasicMaterial());
    // Previous CompactForklift values: cargo y=.43; tines x=+/-.31, y=.32,
    // thickness=.08. Keep this control explicit instead of testing a copied pallet.
    pallet.position.set(0, 0.43, 0.66);
    pallet.updateMatrixWorld(true);
    const oldTineTop = 0.32 + 0.08 / 2;
    const hits = new THREE.Raycaster(
      new THREE.Vector3(0.31, oldTineTop, 0.66),
      new THREE.Vector3(0, 1, 0),
      0,
      0.2
    ).intersectObject(pallet);
    expect(hits[0].distance).toBeCloseTo(0.01, 6);
    expect(hits[0].distance).toBeGreaterThan(0.001); // fails the seating criterion
    // Raising the old tine under the deck cannot repair the lateral collision.
    const atDeck = 0.43 + 0.025 - 0.08 / 2;
    const blocked = new THREE.Raycaster(
      new THREE.Vector3(0.31, atDeck, 0.1),
      new THREE.Vector3(0, 0, 1),
      0,
      1.2
    ).intersectObject(pallet);
    expect(blocked.length).toBeGreaterThan(0);
    pallet.material.dispose();
  });

  it('fits both tines between the actual pallet blocks and runners', () => {
    const pallet = new THREE.Mesh(getFlourPalletGeometry().pallet, new THREE.MeshBasicMaterial());
    pallet.position.fromArray(COMPACT_FORK_LOAD.palletPosition);
    pallet.updateMatrixWorld(true);
    const [width, height] = COMPACT_FORK_LOAD.size;
    for (const x of COMPACT_FORK_LOAD.centres) {
      // Rays traverse the full channel at both tine edges and both vertical edges.
      for (const side of [-1, 1]) {
        for (const vertical of [-1, 1]) {
          const ray = new THREE.Raycaster(
            new THREE.Vector3(
              x + (side * width) / 2,
              COMPACT_FORK_LOAD.y + vertical * (height / 2 - 1e-5),
              0.1
            ),
            new THREE.Vector3(0, 0, 1),
            0,
            1.2
          );
          expect(ray.intersectObject(pallet)).toHaveLength(0);
        }
      }
    }
    pallet.material.dispose();
  });

  it.each([
    [0, 0],
    [0.32, -0.055],
    [0.72, -0.055],
  ] as const)('keeps deck support through lift %s and mast tilt %s', (lift, tilt) => {
    const mast = new THREE.Group();
    mast.rotation.x = tilt;
    const carriage = new THREE.Group();
    carriage.position.y = lift;
    mast.add(carriage);
    const pallet = new THREE.Mesh(getFlourPalletGeometry().pallet, new THREE.MeshBasicMaterial());
    pallet.position.fromArray(COMPACT_FORK_LOAD.palletPosition);
    carriage.add(pallet);
    mast.updateMatrixWorld(true);
    for (const x of COMPACT_FORK_LOAD.centres) {
      const origin = carriage.localToWorld(
        new THREE.Vector3(x, COMPACT_FORK_LOAD.y, COMPACT_FORK_LOAD.z)
      );
      const direction = new THREE.Vector3(0, 1, 0).transformDirection(carriage.matrixWorld);
      const hits = new THREE.Raycaster(origin, direction, 0, 0.1).intersectObject(pallet);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].distance).toBeCloseTo(COMPACT_FORK_LOAD.size[1] / 2, 6);
    }
    pallet.material.dispose();
  });
});
