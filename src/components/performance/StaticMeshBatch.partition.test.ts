/**
 * The instancing pass groups candidates by exact render data. Its bucket key
 * (a fingerprint over every byte of every attribute) was ~1.2 s of startup main
 * thread; it now folds 32-bit words. The decisions must not move:
 *
 *   - partitions equal the verbatim pre-change partition, group for group and
 *     candidate for candidate, over a corpus of real and synthetic geometry
 *     (equal data in separate objects, -0, interleaved, unaligned views,
 *     index/no index, groups, draw ranges)
 *   - createStaticMeshBatches output (batch kinds, counts, instance matrices,
 *     merged buffers) equals a golden hash taken on 33abb3e1, before the change
 *   - the fingerprint does a word of work per 4 bytes, not a closure call per byte
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import {
  collectStaticBatchCandidates,
  createStaticMeshBatches,
  partitionByGeometryData,
} from './StaticMeshBatch';

// ---------------------------------------------------------------------------
// Verbatim pre-change (33abb3e1) equality, fingerprint and partition.
// ---------------------------------------------------------------------------
const attributesHaveEqualData = (
  left: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  right: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): boolean => {
  const leftInterleaved = left instanceof THREE.InterleavedBufferAttribute;
  const rightInterleaved = right instanceof THREE.InterleavedBufferAttribute;
  if (
    left.itemSize !== right.itemSize ||
    left.count !== right.count ||
    left.normalized !== right.normalized ||
    left.array.constructor !== right.array.constructor ||
    left.array.length !== right.array.length ||
    leftInterleaved !== rightInterleaved
  ) {
    return false;
  }
  if (leftInterleaved && rightInterleaved) {
    if (left.offset !== right.offset || left.data.stride !== right.data.stride) return false;
  }
  for (let index = 0; index < left.array.length; index += 1) {
    if (!Object.is(left.array[index], right.array[index])) return false;
  }
  return true;
};

const geometriesHaveEqualRenderData = (
  left: THREE.BufferGeometry,
  right: THREE.BufferGeometry
): boolean => {
  if (left === right) return true;
  const leftNames = Object.keys(left.attributes).sort();
  const rightNames = Object.keys(right.attributes).sort();
  if (leftNames.length !== rightNames.length) return false;
  for (let index = 0; index < leftNames.length; index += 1) {
    const name = leftNames[index];
    if (name !== rightNames[index]) return false;
    if (!attributesHaveEqualData(left.getAttribute(name), right.getAttribute(name))) return false;
  }
  if (Boolean(left.index) !== Boolean(right.index)) return false;
  if (left.index && right.index && !attributesHaveEqualData(left.index, right.index)) return false;
  if (
    left.drawRange.start !== right.drawRange.start ||
    left.drawRange.count !== right.drawRange.count ||
    left.groups.length !== right.groups.length
  ) {
    return false;
  }
  return left.groups.every((group, index) => {
    const other = right.groups[index];
    return (
      other !== undefined &&
      group.start === other.start &&
      group.count === other.count &&
      group.materialIndex === other.materialIndex
    );
  });
};

const legacyFingerprint = (
  geometry: THREE.BufferGeometry,
  cache: WeakMap<THREE.BufferGeometry, string>
): string => {
  const cached = cache.get(geometry);
  if (cached !== undefined) return cached;

  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const updateByte = (value: number): void => {
    first = Math.imul(first ^ value, 0x01000193);
    second = Math.imul(second ^ value, 0x85ebca6b);
  };
  const updateText = (value: unknown): void => {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      updateByte(code & 0xff);
      updateByte(code >>> 8);
    }
    updateByte(0xff);
  };
  const updateAttribute = (
    name: string,
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  ): void => {
    const interleaved = attribute instanceof THREE.InterleavedBufferAttribute;
    const array = attribute.array;
    updateText(name);
    updateText(attribute.itemSize);
    updateText(attribute.count);
    updateText(attribute.normalized);
    updateText(array.constructor.name);
    updateText('gpuType' in attribute ? attribute.gpuType : '');
    updateText(interleaved);
    if (interleaved) {
      updateText(attribute.offset);
      updateText(attribute.data.stride);
    }
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    for (const byte of bytes) updateByte(byte);
  };

  for (const [name, attribute] of Object.entries(geometry.attributes).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    updateAttribute(name, attribute);
  }
  if (geometry.index) updateAttribute('index', geometry.index);
  else updateText('no-index');
  updateText(geometry.drawRange.start);
  updateText(geometry.drawRange.count);
  for (const group of geometry.groups) {
    updateText(group.start);
    updateText(group.count);
    updateText(group.materialIndex);
  }

  const fingerprint = `${first >>> 0}:${second >>> 0}`;
  cache.set(geometry, fingerprint);
  return fingerprint;
};

function legacyPartition<T extends { geometry: THREE.BufferGeometry }>(candidates: T[]): T[][] {
  const fingerprintCache = new WeakMap<THREE.BufferGeometry, string>();
  const buckets = new Map<string, T[][]>();
  for (const candidate of candidates) {
    const fingerprint = legacyFingerprint(candidate.geometry, fingerprintCache);
    const groups = buckets.get(fingerprint) ?? [];
    const existing = groups.find((group) =>
      geometriesHaveEqualRenderData(group[0].geometry, candidate.geometry)
    );
    if (existing) existing.push(candidate);
    else groups.push([candidate]);
    if (!buckets.has(fingerprint)) buckets.set(fingerprint, groups);
  }
  return [...buckets.values()].flat();
}

// ---------------------------------------------------------------------------

const random = (seed: number) => () =>
  (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

async function worldGeometry(file: string): Promise<THREE.BufferGeometry | null> {
  const document = await new NodeIO().readBinary(
    new Uint8Array(readFileSync(`public/models/world/${file}`))
  );
  const primitive = document.getRoot().listMeshes()[0]?.listPrimitives()[0];
  if (!primitive) return null;
  const geometry = new THREE.BufferGeometry();
  for (const [semantic, name] of [
    ['POSITION', 'position'],
    ['NORMAL', 'normal'],
    ['TEXCOORD_0', 'uv'],
  ]) {
    const accessor = primitive.getAttribute(semantic);
    if (accessor)
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(new Float32Array(accessor.getArray()!), accessor.getElementSize())
      );
  }
  const indices = primitive.getIndices()?.getArray();
  if (indices) geometry.setIndex(Array.from(indices));
  return geometry;
}

/** Equal data in separate objects, near-misses, and every layout the key reads. */
async function corpus(): Promise<THREE.BufferGeometry[]> {
  const out: THREE.BufferGeometry[] = [];
  const twice = (make: () => THREE.BufferGeometry) => out.push(make(), make());
  twice(() => new THREE.BoxGeometry(1, 1, 1));
  out.push(new THREE.BoxGeometry(1, 1, 1));
  twice(() => new THREE.BoxGeometry(1, 2, 1));
  twice(() => new THREE.CylinderGeometry(0.5, 0.5, 2, 8));
  twice(() => new THREE.SphereGeometry(1, 12, 8));
  twice(() => new THREE.PlaneGeometry(2, 3).toNonIndexed());
  // A changed draw range, and a dropped group.
  const ranged = new THREE.BoxGeometry(1, 1, 1);
  ranged.setDrawRange(0, 18);
  out.push(ranged);
  const ungrouped = new THREE.BoxGeometry(1, 1, 1);
  ungrouped.clearGroups();
  out.push(ungrouped);
  // +0 and -0 are equal bytes for neither the old key nor Object.is.
  for (const zero of [0, -0, 0]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([zero, 1, 2, 3, 4, 5], 3));
    out.push(geometry);
  }
  // Interleaved, twice equal and once with a different stride.
  for (const stride of [6, 6, 8]) {
    const data = new Float32Array(stride * 4).map((_, i) => (i % 7) * 0.5);
    const buffer = new THREE.InterleavedBuffer(data, stride);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    out.push(geometry);
  }
  // Byte attributes viewing an odd offset with a tail that is not a whole word.
  for (const variant of [0, 0, 1]) {
    const bytes = new Uint8Array(1 + 7 * 3 + 2);
    bytes.forEach((_, i) => (bytes[i] = (i * 37 + variant) & 0xff));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        new Array(21).fill(0).map((_, i) => i),
        3
      )
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Uint8Array(bytes.buffer, 1, 21), 3, true)
    );
    out.push(geometry);
  }
  for (const file of [
    'machine-silo-unit.glb',
    'flour-sack-unit.glb',
    'hedge-unit.glb',
    'truck-tyre-unit.glb',
    'fence-post-unit.glb',
  ]) {
    const geometry = await worldGeometry(file);
    if (geometry) out.push(geometry, geometry.clone(), geometry);
  }
  return out;
}

const shape = (groups: Array<Array<{ id: number }>>) =>
  groups.map((group) => group.map((c) => c.id));

describe('static batch partition', () => {
  it('groups exactly as the pre-change partition, in the same order', async () => {
    const geometries = await corpus();
    const next = random(7);
    for (let round = 0; round < 6; round++) {
      const candidates = geometries
        .flatMap((geometry) => (next() < 0.5 ? [geometry, geometry] : [geometry]))
        .map((geometry, id) => ({ id, geometry, order: next() }))
        .sort((a, b) => a.order - b.order);
      const legacy = shape(legacyPartition(candidates));
      const current = shape(partitionByGeometryData(candidates));
      expect(current).toEqual(legacy);
      expect(legacy.length).toBeGreaterThan(15);
      expect(legacy.some((group) => group.length > 2)).toBe(true);
    }
  }, 120_000);

  it('folds data in words, not a closure call per byte', async () => {
    const geometry = (await worldGeometry('machine-silo-unit.glb'))!;
    let bytes = 0;
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
    bytes += geometry.index!.array.byteLength;
    const imul = vi.spyOn(Math, 'imul');
    partitionByGeometryData([{ geometry }]);
    const calls = imul.mock.calls.length;
    imul.mockRestore();
    // Two multiplies per 4-byte word, plus the short header text.
    expect(calls).toBeLessThan(bytes / 2 + 2000);
  }, 60_000);

  it('produces the same batches and merged buffers as before the change', async () => {
    const geometries = await corpus();
    const material = new THREE.MeshStandardMaterial({ color: '#8899aa' });
    const root = new THREE.Group();
    const next = random(11);
    geometries.forEach((geometry, i) => {
      // Interleaved and byte-coloured fixtures exercise the key, not batching.
      if (Object.values(geometry.attributes).some((a) => !(a instanceof THREE.BufferAttribute)))
        return;
      // Two copies alone in their own 80 m merge cell: equal geometry skips the
      // merge, so they reach the instancing partition, which groups across
      // cells (separate objects with equal data included).
      for (let copy = 0; copy < 2; copy++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `m${i}-${copy}`;
        mesh.position.set(i * 200 + Math.round(next() * 20), 0, Math.round(next() * 20));
        mesh.rotation.y = Math.round(next() * 4) * (Math.PI / 2);
        root.add(mesh);
      }
    });
    // And one cell of mixed shapes and colours that merges into one buffer.
    for (let k = 0; k < 6; k++) {
      const mesh = new THREE.Mesh(
        k % 2 ? new THREE.SphereGeometry(0.6, 10, 6) : new THREE.BoxGeometry(1, 1 + k, 1),
        new THREE.MeshStandardMaterial({ color: k % 3 ? '#8899aa' : '#aa9988' })
      );
      mesh.name = `merge-${k}`;
      mesh.position.set(-1000 + k * 3, 0, k);
      root.add(mesh);
    }
    const candidates = collectStaticBatchCandidates(root);
    const batches = createStaticMeshBatches(root, candidates, 'partition', 2);
    const digest = createHash('sha256');
    for (const batch of batches) {
      const mesh = batch.mesh;
      digest.update(
        `${mesh.type}:${(mesh as THREE.InstancedMesh).count ?? ''}:${batch.originals.map((o) => o.mesh.name).join(',')}|`
      );
      if (mesh instanceof THREE.InstancedMesh)
        digest.update(new Uint8Array(mesh.instanceMatrix.array.buffer));
      for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
        digest.update(name);
        const array = attribute.array as Float32Array;
        digest.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      }
    }
    expect(batches.length).toBeGreaterThan(5);
    expect(digest.digest('hex').slice(0, 16)).toBe('e3b0abf0ea479e84');
  }, 120_000);
});
