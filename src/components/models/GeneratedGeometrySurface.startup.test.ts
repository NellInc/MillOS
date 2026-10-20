/**
 * `restoreGeometryOrigin` was ~3 s of main-thread startup (the profiled `d1`
 * in the MillScene chunk). It must get cheaper WITHOUT changing a byte.
 *
 *   - golden hashes of two real attachments, taken on 3d2af742 before the change
 *   - every single-mesh delivered asset, restored against a shuffled, rewound,
 *     duplicated and (separately) jittered copy of itself, byte-equal to the
 *     verbatim pre-change implementation below, failures included
 *   - the work itself: no 27-cell neighbour search for a triangle whose
 *     rounded key already matches, and no second topology match for a repeat
 *     of the same attachment
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { restoreGeometryOrigin } from './GeneratedGeometrySurface';
import { MACHINE_PART_GEOMETRY } from '../machines/CompactMachines';
import { getFlourSackGeometry } from '../../utils/flourSacks';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';

// ---------------------------------------------------------------------------
// Verbatim copy of retainAuthoredUVs + restoreGeometryOrigin at 3d2af742.
// ---------------------------------------------------------------------------
function legacyRetainAuthoredUVs(geometry: THREE.BufferGeometry, original: THREE.BufferGeometry) {
  const atlas = geometry.getAttribute('uv');
  if (!atlas) throw new Error('Generated atlas UVs are required');
  const source = original.index ? original.toNonIndexed() : original;
  const target = geometry.index ? geometry.toNonIndexed() : geometry;
  const a = source.getAttribute('position');
  const b = target.getAttribute('position');
  const uv = source.getAttribute('uv');
  const uvValues = new Float32Array(b.count * 2);
  const key = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.round(v * 100000)).join(',');
  const triangleKey = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [key(p, i), key(p, i + 1), key(p, i + 2)].sort().join(';');
  source.computeBoundingBox();
  const tolerance = Math.max(1, source.boundingBox!.getSize(new THREE.Vector3()).length()) * 1e-6;
  const cells = new Map<string, Set<number>>();
  const cell = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    [p.getX(i), p.getY(i), p.getZ(i)].map((v) => Math.floor(v / tolerance));
  const close = (i: number, j: number) =>
    Math.hypot(b.getX(i) - a.getX(j), b.getY(i) - a.getY(j), b.getZ(i) - a.getZ(j)) <= tolerance;
  const triangles = new Map<string, number[]>();
  for (let i = 0; i < a.count; i += 3) {
    const k = triangleKey(a, i);
    const matches = triangles.get(k) ?? [];
    matches.push(i);
    triangles.set(k, matches);
    for (let corner = 0; corner < 3; corner++) {
      const c = cell(a, i + corner).join(',');
      const bucket = cells.get(c) ?? new Set<number>();
      bucket.add(i);
      cells.set(c, bucket);
    }
  }
  try {
    for (let i = 0; i < b.count; i += 3) {
      let matched = false;
      const candidates = new Set(triangles.get(triangleKey(b, i)) ?? []);
      const [x, y, z] = cell(b, i);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const j of cells.get([x + dx, y + dy, z + dz].join(',')) ?? []) candidates.add(j);
      for (const j of candidates) {
        for (let shift = 0; shift < 3 && !matched; shift++) {
          if (![0, 1, 2].every((k) => close(i + k, j + ((k + shift) % 3)))) continue;
          for (let k = 0; k < 3; k++) {
            const index = j + ((k + shift) % 3);
            uvValues[(i + k) * 2] = uv?.getX(index) ?? 0;
            uvValues[(i + k) * 2 + 1] = uv?.getY(index) ?? 0;
          }
          matched = true;
        }
        if (matched) break;
      }
      if (!matched) throw new Error('Generated triangle no longer matches authored UV topology');
    }
    target.setAttribute('uv1', target.getAttribute('uv'));
    target.setAttribute('uv', new THREE.BufferAttribute(uvValues, 2));
    return target;
  } catch (error) {
    if (target !== geometry) target.dispose();
    throw error;
  } finally {
    if (source !== original) source.dispose();
  }
}

function legacyRestoreGeometryOrigin(
  scene: THREE.Object3D,
  original: THREE.BufferGeometry,
  fitEnvelope = false
): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } {
  scene.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  if (meshes.length !== 1 || Array.isArray(meshes[0].material))
    throw new Error('A geometry attachment requires one rigid source mesh');
  const material = meshes[0].material as THREE.MeshStandardMaterial;
  if (!material.isMeshStandardMaterial || material.transparent || !material.normalMap)
    throw new Error('Expected an opaque standard surface with a normal map');
  const geometry = meshes[0].geometry.clone().applyMatrix4(meshes[0].matrixWorld);
  geometry.computeBoundingBox();
  original.computeBoundingBox();
  const generatedBounds = geometry.boundingBox!;
  const originalBounds = original.boundingBox!;
  const generatedSize = generatedBounds.getSize(new THREE.Vector3());
  const originalSize = originalBounds.getSize(new THREE.Vector3());
  if (
    ![...generatedSize.toArray(), ...originalSize.toArray()].every(Number.isFinite) ||
    originalSize.length() === 0 ||
    (!fitEnvelope &&
      generatedSize.distanceTo(originalSize) > Math.max(1, originalSize.length()) * 0.0002)
  ) {
    geometry.dispose();
    throw new Error('Generated geometry no longer matches its authored envelope');
  }
  if (fitEnvelope) {
    const centre = generatedBounds.getCenter(new THREE.Vector3());
    const factors = originalSize.clone().divide(generatedSize);
    if (!factors.toArray().every((v) => Number.isFinite(v) && v > 0)) {
      geometry.dispose();
      throw new Error('Envelope fitting requires positive finite dimensions');
    }
    geometry.translate(-centre.x, -centre.y, -centre.z);
    geometry.scale(factors.x, factors.y, factors.z);
    geometry.translate(centre.x, centre.y, centre.z);
  }
  const offset = originalBounds
    .getCenter(new THREE.Vector3())
    .sub(generatedBounds.getCenter(new THREE.Vector3()));
  geometry.translate(offset.x, offset.y, offset.z);
  geometry.deleteAttribute('color');
  try {
    const restored = legacyRetainAuthoredUVs(geometry, original);
    if (restored !== geometry) geometry.dispose();
    restored.computeBoundingBox();
    return { geometry: restored, material };
  } catch (error) {
    geometry.dispose();
    throw new Error(`${material.name}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------

const hash = (array: ArrayBufferView) =>
  createHash('sha256')
    .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
    .digest('hex')
    .slice(0, 16);

/** Every buffer and field of a restored geometry that a consumer could read. */
const bytesOf = (geometry: THREE.BufferGeometry) => ({
  index: geometry.index ? hash(geometry.index.array) : null,
  attributes: Object.entries(geometry.attributes).map(([name, attribute]) => [
    name,
    attribute.constructor.name,
    attribute.itemSize,
    attribute.normalized,
    attribute.count,
    hash((attribute as THREE.BufferAttribute).array),
  ]),
  box: geometry.boundingBox
    ? [...geometry.boundingBox.min.toArray(), ...geometry.boundingBox.max.toArray()]
    : null,
  sphere: geometry.boundingSphere,
  groups: geometry.groups,
  drawRange: { ...geometry.drawRange },
  name: geometry.name,
  userData: geometry.userData,
});

type Outcome = { ok: true; bytes: ReturnType<typeof bytesOf> } | { ok: false; message: string };
const outcome = (run: () => { geometry: THREE.BufferGeometry }): Outcome => {
  try {
    const { geometry } = run();
    const bytes = bytesOf(geometry);
    geometry.dispose();
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
};

const io = new NodeIO();
const fileOf = (id: keyof typeof GENERATED_ASSET_PATHS) =>
  `public/${GENERATED_ASSET_PATHS[id].replace(/^.*?models\//, 'models/')}`;

/** A delivered asset as `useDracoGLTF` would hand it over: one mesh, world-placed. */
async function delivered(path: string): Promise<THREE.Mesh | null> {
  const document = await io.readBinary(new Uint8Array(readFileSync(path)));
  const nodes = document
    .getRoot()
    .listNodes()
    .filter((candidate) => candidate.getMesh());
  if (nodes.length !== 1) return null;
  const primitives = nodes[0].getMesh()!.listPrimitives();
  if (primitives.length !== 1) return null;
  const primitive = primitives[0];
  const geometry = new THREE.BufferGeometry();
  for (const [semantic, attribute] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
    ['TEXCOORD_0', 'uv'],
  ]) {
    const accessor = primitive.getAttribute(semantic);
    if (!accessor) return null;
    geometry.setAttribute(
      attribute,
      new THREE.BufferAttribute(new Float32Array(accessor.getArray()!), accessor.getElementSize())
    );
  }
  const indices = primitive.getIndices();
  if (indices) geometry.setIndex(Array.from(indices.getArray()!));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ name: path, normalMap: new THREE.Texture() })
  );
  mesh.applyMatrix4(new THREE.Matrix4().fromArray(nodes[0].getWorldMatrix()));
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** Deterministic LCG, so every run builds the same adversarial copies. */
const random = (seed: number) => () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

/**
 * An authored stand-in made from the delivered triangles themselves: shuffled,
 * each rotated (winding kept), a synthetic UV per corner, some triangles
 * duplicated with different UVs before and after their first copy (the first
 * in source order must win), and optionally every coordinate jittered within
 * the match tolerance, which pushes many triangles across a rounding boundary
 * and into the neighbour-cell search.
 */
function authoredCopy(mesh: THREE.Mesh, seed: number, jitter: boolean) {
  const world = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const flat = world.index ? world.toNonIndexed() : world;
  const p = flat.getAttribute('position');
  flat.computeBoundingBox();
  const tolerance = Math.max(1, flat.boundingBox!.getSize(new THREE.Vector3()).length()) * 1e-6;
  const next = random(seed);
  const order = Array.from({ length: p.count / 3 }, (_, t) => t);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const duplicates = order.filter(() => next() < 0.03);
  const sequence = [
    ...duplicates.slice(0, duplicates.length >> 1),
    ...order,
    ...duplicates.slice(duplicates.length >> 1),
  ];
  const positions = new Float64Array(sequence.length * 9);
  const uvs = new Float32Array(sequence.length * 6);
  sequence.forEach((triangle, slot) => {
    const rotation = Math.floor(next() * 3);
    for (let k = 0; k < 3; k++) {
      const from = triangle * 3 + ((k + rotation) % 3);
      for (let axis = 0; axis < 3; axis++)
        positions[slot * 9 + k * 3 + axis] =
          p.getComponent(from, axis) + (jitter ? (next() - 0.5) * 0.5 * tolerance : 0);
      uvs[slot * 6 + k * 2] = next();
      uvs[slot * 6 + k * 2 + 1] = next();
    }
  });
  world.dispose();
  if (flat !== world) flat.dispose();
  const original = new THREE.BufferGeometry();
  original.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  original.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return original;
}

afterEach(() => vi.restoreAllMocks());

describe('generated atlas UV restore at startup', () => {
  it('matches the golden bytes taken before the change', async () => {
    const GOLDEN_3D2AF742 = {
      silo: 'position=5a2f08252f435a07 normal=0cb3fe2b75e90af8 uv=423ec203fe1616d0 uv1=929ccfb359e8cbb5',
      flourSack:
        'position=782ca93a09f6f91d normal=86e7c7237464a42e uv=55abb32af655ceaa uv1=89eaa5ea7a44f3c5',
    };
    const cases = [
      ['silo', fileOf('machineSiloUnit'), MACHINE_PART_GEOMETRY.siloShell],
      ['flourSack', fileOf('flourSackUnit'), getFlourSackGeometry()],
    ] as const;
    for (const [name, path, original] of cases) {
      const mesh = (await delivered(path))!;
      // Twice: the second is the repeat-attachment copy and must be the same bytes.
      for (let pass = 0; pass < 2; pass++) {
        const restored = restoreGeometryOrigin(mesh, original).geometry;
        expect(
          ['position', 'normal', 'uv', 'uv1']
            .map((a) => `${a}=${hash(restored.getAttribute(a).array)}`)
            .join(' '),
          `${name} pass ${pass}`
        ).toBe(GOLDEN_3D2AF742[name]);
        restored.dispose();
      }
    }
  }, 120_000);

  it('restores every delivered single-mesh asset exactly as the pre-change code did', async () => {
    let compared = 0;
    let fallbackTriangles = 0;
    let failuresCompared = 0;
    const roundedKey = (p: THREE.BufferAttribute, i: number) =>
      [i, i + 1, i + 2]
        .map((v) => [p.getX(v), p.getY(v), p.getZ(v)].map((c) => Math.round(c * 100000)).join(','))
        .sort()
        .join(';');
    const ids = Object.keys(GENERATED_ASSET_PATHS) as (keyof typeof GENERATED_ASSET_PATHS)[];
    for (const [n, id] of ids.entries()) {
      const mesh = await delivered(fileOf(id));
      if (!mesh) continue;
      for (const jitter of [false, true]) {
        const original = authoredCopy(mesh, 1000 + n, jitter);
        const legacy = outcome(() => legacyRestoreGeometryOrigin(mesh, original));
        const first = outcome(() => restoreGeometryOrigin(mesh, original));
        const repeat = outcome(() => restoreGeometryOrigin(mesh, original));
        expect(first, `${id} jitter=${jitter}`).toEqual(legacy);
        expect(repeat, `${id} jitter=${jitter} repeat`).toEqual(legacy);
        compared += 1;
        if (jitter && legacy.ok) {
          const keys = new Set<string>();
          const a = original.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < a.count; i += 3) keys.add(roundedKey(a, i));
          const target = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed();
          const b = target.getAttribute('position') as THREE.BufferAttribute;
          for (let i = 0; i < b.count; i += 3) if (!keys.has(roundedKey(b, i))) fallbackTriangles++;
          target.dispose();
        }
      }
      // A changed topology: one corner of one triangle moved well beyond tolerance.
      const broken = authoredCopy(mesh, 2000 + n, false);
      const position = broken.getAttribute('position') as THREE.BufferAttribute;
      position.setX(0, position.getX(0) + 0.05);
      const legacy = outcome(() => legacyRestoreGeometryOrigin(mesh, broken));
      expect(
        outcome(() => restoreGeometryOrigin(mesh, broken)),
        `${id} broken`
      ).toEqual(legacy);
      if (!legacy.ok) failuresCompared += 1;
    }
    expect(compared).toBeGreaterThan(200);
    // The jittered copies really did exercise the neighbour-cell path.
    expect(fallbackTriangles).toBeGreaterThan(10_000);
    expect(failuresCompared).toBeGreaterThan(30);
  }, 900_000);

  it('does not search neighbour cells for a triangle whose rounded key already matches', async () => {
    const mesh = (await delivered(fileOf('machineSiloUnit')))!;
    // A fresh authored geometry object, so this is a first restore, not a repeat.
    const original = MACHINE_PART_GEOMETRY.siloShell.clone();
    const triangles = (original.index?.count ?? 0) / 3;
    expect(triangles).toBeGreaterThan(10_000);
    const get = vi.spyOn(Map.prototype, 'get');
    const restored = restoreGeometryOrigin(mesh, original).geometry;
    const lookups = get.mock.calls.length;
    get.mockRestore();
    restored.dispose();
    // One key lookup per target triangle plus slack for the rare boundary
    // crossing. The pre-change search made 28 per triangle, ~290,000 here.
    expect(lookups).toBeLessThan(triangles * 2);
  }, 120_000);

  it('copies a repeated attachment instead of matching its topology again', async () => {
    const mesh = (await delivered(fileOf('flourSackUnit')))!;
    const original = getFlourSackGeometry().clone();
    const toNonIndexed = vi.spyOn(THREE.BufferGeometry.prototype, 'toNonIndexed');
    const first = restoreGeometryOrigin(mesh, original);
    const firstCalls = toNonIndexed.mock.calls.length;
    expect(firstCalls).toBeGreaterThan(0);
    const second = restoreGeometryOrigin(mesh, original);
    expect(toNonIndexed.mock.calls.length).toBe(firstCalls);
    expect(bytesOf(second.geometry)).toEqual(bytesOf(first.geometry));
    expect(second.material).toBe(first.material);
    // Caller-owned: distinct objects and buffers, so one disposal or edit
    // cannot reach another attachment.
    expect(second.geometry).not.toBe(first.geometry);
    for (const name of Object.keys(first.geometry.attributes))
      expect(second.geometry.getAttribute(name).array).not.toBe(
        first.geometry.getAttribute(name).array
      );
    expect(second.geometry.userData).not.toBe(first.geometry.userData);
    first.geometry.dispose();
    // Re-uploading an input the restore read invalidates the copy.
    original.getAttribute('uv').needsUpdate = true;
    const third = restoreGeometryOrigin(mesh, original);
    expect(toNonIndexed.mock.calls.length).toBeGreaterThan(firstCalls);
    expect(bytesOf(third.geometry)).toEqual(bytesOf(second.geometry));
    second.geometry.dispose();
    third.geometry.dispose();
  }, 120_000);
});
