// @vitest-environment node
import { afterAll, beforeAll, expect, test } from 'vitest';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import {
  INPUT,
  SOURCE,
  INPUT_SHA256,
  SOURCE_SHA256,
  RESTORED,
  hash,
  primitive,
  face,
  signature,
  bounds,
  roofPlanes,
  roofClearances,
  refine,
  safeOutput,
} from './refine-coop-gable-candidate.mjs';
const io = new NodeIO();
let originalBytes, sourceBytes, before, provider, candidate, candidateBytes, report, temporary;
const glbJSON = (bytes) =>
  JSON.parse(
    Buffer.from(bytes)
      .subarray(20, 20 + Buffer.from(bytes).readUInt32LE(12))
      .toString()
  );
beforeAll(async () => {
  [originalBytes, sourceBytes] = await Promise.all([
    readFile('src/test/fixtures/farm-model-reconciliation/coop.baseline.glb'),
    readFile(SOURCE),
  ]);
  before = await io.readBinary(originalBytes);
  provider = await io.readBinary(sourceBytes);
  const changed = await io.readBinary(originalBytes);
  report = refine(changed, provider, hash(originalBytes), hash(sourceBytes));
  candidateBytes = await io.writeBinary(changed);
  candidate = await io.readBinary(candidateBytes);
  temporary = await mkdtemp(path.join(tmpdir(), 'coop-candidate-test-'));
});
afterAll(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});
function mesh(document, normalized = false, side = THREE.FrontSide) {
  const p = primitive(document),
    geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(p.getAttribute('POSITION').getArray(), 3)
  );
  geometry.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(), 1));
  const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side }));
  if (normalized)
    m.applyMatrix4(
      new THREE.Matrix4().fromArray(document.getRoot().listNodes()[0].getWorldMatrix())
    );
  m.updateMatrixWorld(true);
  return m;
}
const hit = (m, origin, direction, far = Infinity) =>
  new THREE.Raycaster(
    new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),
    0,
    far
  ).intersectObject(m);
const dispose = (m) => {
  m.geometry.dispose();
  m.material.dispose();
};

test('requires both pinned assets and restores exactly 105 reviewed original wall/post faces', async () => {
  expect(hash(originalBytes)).toBe(INPUT_SHA256);
  expect(hash(sourceBytes)).toBe(SOURCE_SHA256);
  expect(report.restoredFaces.map((f) => f.sourceTriangle)).toEqual(RESTORED);
  expect(report.restoredFaces.filter((f) => f.side === 'negative-x')).toHaveLength(15);
  expect(report.restoredFaces.filter((f) => f.side === 'positive-x')).toHaveLength(18);
  expect(() => refine(before, provider, 'changed', SOURCE_SHA256)).toThrow('Pinned accepted');
  expect(() => refine(before, provider, INPUT_SHA256, 'changed')).toThrow('Pinned immutable');
});

test('every existing attribute and index is byte-identical at its original offset', () => {
  const a = primitive(before),
    b = primitive(candidate);
  expect(b.listSemantics()).toEqual(a.listSemantics());
  for (const semantic of a.listSemantics()) {
    const x = a.getAttribute(semantic).getArray(),
      y = b.getAttribute(semantic).getArray();
    expect(Buffer.from(y.buffer, y.byteOffset, x.byteLength)).toEqual(
      Buffer.from(x.buffer, x.byteOffset, x.byteLength)
    );
    expect(b.getAttribute(semantic).getCount()).toBe(7123);
  }
  const x = a.getIndices().getArray(),
    y = b.getIndices().getArray();
  expect(Buffer.from(y.buffer, y.byteOffset, x.byteLength)).toEqual(
    Buffer.from(x.buffer, x.byteOffset, x.byteLength)
  );
  expect(Array.from(y.slice(x.length))).toEqual(Array.from({ length: 315 }, (_, i) => 6808 + i));
  expect(bounds(b)).toEqual(bounds(a));
});

test('all appended positions, normals and UVs exactly match the immutable source corners', () => {
  const a = primitive(provider),
    b = primitive(candidate);
  const oldSignatures = new Set(
    Array.from({ length: 5944 }, (_, i) => signature(face(primitive(before), i)))
  );
  for (const [i, sourceFace] of RESTORED.entries()) {
    expect(
      oldSignatures.has(signature(face(a, sourceFace))),
      `source face ${sourceFace} was genuinely deleted`
    ).toBe(false);
    expect(face(b, 5944 + i)).toEqual(face(a, sourceFace));
    for (let k = 0; k < 3; k++)
      for (const semantic of a.listSemantics()) {
        expect(b.getAttribute(semantic).getElement(6808 + i * 3 + k, [])).toEqual(
          a.getAttribute(semantic).getElement(a.getIndices().getScalar(sourceFace * 3 + k), [])
        );
      }
  }
  expect(RESTORED).not.toContain(1564);
  expect(RESTORED).not.toContain(6663);
  expect(RESTORED).not.toContain(7970);
});

test('both actual slab half-spaces bound every restored triangle with no clipping or protrusion', () => {
  const p = primitive(candidate),
    planes = roofPlanes(p);
  for (let i = 5944; i < 6049; i++) {
    const points = face(p, i);
    expect(Math.min(...roofClearances(points, planes))).toBeGreaterThan(0.01);
    // Interior samples cross the roof cusp too: the stronger affine proof is
    // not a centroid-only heuristic or the obsolete pre-envelope formula.
    for (let a = 0; a <= 10; a++)
      for (let b = 0; b <= 10 - a; b++) {
        const sample = points[0].map(
          (v, k) => (a * v + b * points[1][k] + (10 - a - b) * points[2][k]) / 10
        );
        expect(roofClearances([sample], planes)[0]).toBeGreaterThan(0.01);
      }
  }
});

test('source wall probes reproduce both holes before and hit outward source surfaces after', () => {
  const old = mesh(before),
    changed = mesh(candidate),
    source = mesh(provider);
  try {
    for (const [origin, direction, expectedSourceFace] of [
      [[-0.46, 0.29844, -0.1], [1, 0, 0], 1670],
      [[0.1, 0.29844, -0.1], [-1, 0, 0], 6859],
    ]) {
      expect(hit(old, origin, direction, 0.05)).toHaveLength(0);
      const expected = hit(source, origin, direction, 0.05)[0],
        actual = hit(changed, origin, direction, 0.05)[0];
      expect(expected.faceIndex).toBe(expectedSourceFace);
      expect(actual.point.toArray()).toEqual(expected.point.toArray());
      expect(actual.faceIndex).toBe(5944 + RESTORED.indexOf(expectedSourceFace));
    }
  } finally {
    [old, changed, source].forEach(dispose);
  }
});

test('existing door, mesh screen and residual replacement-roof clearance remain unfilled', () => {
  const old = mesh(before, false, THREE.DoubleSide),
    changed = mesh(candidate, false, THREE.DoubleSide);
  try {
    for (const origin of [
      [0.11, 0, 0],
      [-0.46, 0.39, 0],
      [0.1, 0.39, 0],
    ]) {
      const direction = [origin[0] < 0 ? 1 : -1, 0, 0];
      expect(hit(old, origin, direction, 0.1)).toHaveLength(0);
      expect(hit(changed, origin, direction, 0.1)).toHaveLength(0);
    }
    const screenBefore = hit(old, [0.11, 0.09, 0], [-1, 0, 0], 0.12);
    const screenAfter = hit(changed, [0.11, 0.09, 0], [-1, 0, 0], 0.12);
    expect(screenBefore.length).toBeGreaterThan(0);
    expect(screenAfter.map((h) => [h.faceIndex, h.point.toArray()])).toEqual(
      screenBefore.map((h) => [h.faceIndex, h.point.toArray()])
    );
  } finally {
    dispose(old);
    dispose(changed);
  }
});

test('unchanged normalized roof retains physical top and underside with front-face culling', () => {
  const m = mesh(candidate, true),
    transform = new THREE.Matrix4().fromArray(candidate.getRoot().listNodes()[0].getWorldMatrix());
  try {
    for (const [x, y, z] of [
      [-0.0813816, 0.2185341, 0.2334904],
      [-0.2877239, 0.2185341, -0.2334269],
    ]) {
      for (const [offset, directionY] of [
        [0, 1],
        [0.026, -1],
      ]) {
        const origin = new THREE.Vector3(x, y + offset, z).applyMatrix4(transform);
        const end = new THREE.Vector3(x, y + offset + directionY * 0.03, z).applyMatrix4(transform);
        expect(
          hit(
            m,
            origin.toArray(),
            end.clone().sub(origin).normalize().toArray(),
            end.distanceTo(origin)
          ).length
        ).toBeGreaterThan(0);
      }
    }
  } finally {
    dispose(m);
  }
});

test('maps, material properties, node names, transforms, topology mode and instancing count stay exact', () => {
  const a = glbJSON(originalBytes),
    b = glbJSON(candidateBytes);
  for (const key of [
    'materials',
    'textures',
    'samplers',
    'nodes',
    'scenes',
    'scene',
    'extensionsUsed',
    'extensionsRequired',
  ])
    expect(b[key]).toEqual(a[key]);
  for (let i = 0; i < 3; i++) {
    expect(candidate.getRoot().listTextures()[i].getImage()).toEqual(
      before.getRoot().listTextures()[i].getImage()
    );
    expect(candidate.getRoot().listTextures()[i].getSize()).toEqual([512, 512]);
  }
  expect(candidate.getRoot().listMeshes()).toHaveLength(1);
  expect(candidate.getRoot().listMeshes()[0].listPrimitives()).toHaveLength(1);
  expect(candidate.getRoot().listMaterials()).toHaveLength(1);
  expect(primitive(candidate).getMode()).toBe(primitive(before).getMode());
  expect(
    candidate
      .getRoot()
      .listNodes()
      .map((n) => n.getWorldMatrix())
  ).toEqual(
    before
      .getRoot()
      .listNodes()
      .map((n) => n.getWorldMatrix())
  );
});

test('candidate CLI is deterministic, within budgets, and leaves both input files byte-identical', async () => {
  const output = path.join(temporary, 'coop.glb');
  // Run the original CLI against a disposable copy of its exact historical input.
  // The installed runtime candidate remains independent and must never be overwritten.
  const runtimeBefore = await readFile(INPUT);
  const cliRoot = path.join(temporary, 'historical-cli');
  await mkdir(path.join(cliRoot, 'public/models/farm'), { recursive: true });
  await writeFile(path.join(cliRoot, INPUT), originalBytes);
  await symlink(path.resolve('assets'), path.join(cliRoot, 'assets'));
  execFileSync(
    process.execPath,
    [path.resolve('scripts/refine-coop-gable-candidate.mjs'), output],
    {
      stdio: 'pipe',
      cwd: cliRoot,
    }
  );
  expect(await readFile(path.join(cliRoot, INPUT))).toEqual(originalBytes);
  expect(await readFile(INPUT)).toEqual(runtimeBefore);
  expect(await readFile(output)).toEqual(Buffer.from(candidateBytes));
  expect(candidateBytes.length).toBe(335992);
  expect(candidateBytes.length).toBeLessThanOrEqual(437000);
  expect(primitive(candidate).getIndices().getCount()).toBe(6049 * 3);
  expect(primitive(candidate).getIndices().getCount()).toBeLessThanOrEqual(25200);
  expect(await readFile('src/test/fixtures/farm-model-reconciliation/coop.baseline.glb')).toEqual(
    originalBytes
  );
  expect(await readFile(SOURCE)).toEqual(sourceBytes);
});

test('rejects both direct and symlink writes into runtime/source asset trees', async () => {
  await expect(safeOutput(INPUT)).rejects.toThrow('outside public/assets');
  await expect(safeOutput(SOURCE)).rejects.toThrow('outside public/assets');
  await symlink(path.resolve('public/models/farm'), path.join(temporary, 'runtime-link'));
  await expect(safeOutput(path.join(temporary, 'runtime-link', 'coop.glb'))).rejects.toThrow(
    'Symlink output'
  );
});
