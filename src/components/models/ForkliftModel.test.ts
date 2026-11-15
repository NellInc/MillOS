import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { COMPACT_FORK_LOAD, createAuthoredForkliftMaterials } from './ForkliftModel';
import { restoreGeometryOrigin } from './GeneratedGeometrySurface';
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

describe('shipped forklift body shell attachment', () => {
  // GeneratedGeometrySurface attaches forklift-chassis-unit.glb onto the rig's
  // `forklift-base-24` by matching every triangle, and the rig wraps it in
  // GeneratedBoundary fallback={null}: a mismatch throws, is swallowed, and the
  // forklift silently loses its atlas. Both files come from one authored source
  // (scripts/blender/authored/forklift-chassis-unit.py). Working if the two
  // delivered files restore against each other triangle for triangle.
  it('restores the delivered chassis unit onto the delivered forklift body', async () => {
    const io = new NodeIO()
      .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const rig = await io.readBinary(
      new Uint8Array(readFileSync('public/models/forklift/forklift.glb'))
    );
    const body = rig
      .getRoot()
      .listMeshes()
      .find((mesh) => mesh.getName() === 'forklift-base-24')!
      .listPrimitives()[0];
    const position = body.getAttribute('POSITION')!;
    // As GLTFLoader builds it: the int16 normalized accessor, kept normalized.
    const original = new THREE.BufferGeometry();
    original.setAttribute(
      'position',
      new THREE.BufferAttribute(position.getArray()!, 3, position.getNormalized())
    );
    original.setIndex(Array.from(body.getIndices()!.getArray()!));

    const unit = await io.readBinary(
      new Uint8Array(readFileSync('public/models/world/forklift-chassis-unit.glb'))
    );
    const [node] = unit
      .getRoot()
      .listNodes()
      .filter((candidate) => candidate.getMesh());
    const primitive = node.getMesh()!.listPrimitives()[0];
    const delivered = new THREE.BufferGeometry();
    for (const [semantic, name] of [
      ['POSITION', 'position'],
      ['NORMAL', 'normal'],
      ['TEXCOORD_0', 'uv'],
    ] as const) {
      const accessor = primitive.getAttribute(semantic)!;
      delivered.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(accessor.getArray()!), accessor.getElementSize())
      );
    }
    delivered.setIndex(Array.from(primitive.getIndices()!.getArray()!));
    const mesh = new THREE.Mesh(
      delivered,
      new THREE.MeshStandardMaterial({ normalMap: new THREE.Texture() })
    );
    mesh.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
    mesh.updateMatrixWorld(true);

    const restored = restoreGeometryOrigin(mesh, original).geometry;
    expect(restored.getAttribute('position').count).toBe(original.index!.count);
    expect(restored.getAttribute('uv1').count).toBe(original.index!.count);
    restored.dispose();

    // Control: the same match against a body with one corner moved 1 cm must fail,
    // or the assertion above proves nothing.
    const moved = new THREE.BufferGeometry();
    const values = new Float32Array(original.getAttribute('position').count * 3);
    for (let i = 0; i < values.length / 3; i++) {
      values[i * 3] = original.getAttribute('position').getX(i);
      values[i * 3 + 1] = original.getAttribute('position').getY(i);
      values[i * 3 + 2] = original.getAttribute('position').getZ(i);
    }
    values[original.index!.getX(0) * 3 + 1] += 0.01;
    moved.setAttribute('position', new THREE.BufferAttribute(values, 3));
    moved.setIndex(original.index!.clone());
    expect(() => restoreGeometryOrigin(mesh, moved)).toThrow(/no longer matches/);
    mesh.material.dispose();
  }, 120_000);
});
