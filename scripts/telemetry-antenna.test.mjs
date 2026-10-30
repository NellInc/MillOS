// @vitest-environment node
/** Portable exact-byte and ownership tests. No rendering or source mutation. */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPEC,
  hash,
  inspect,
  derive,
  assertSourceInputs,
  assertCurrentOutput,
} from './refine-telemetry-antenna.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const baseline = read('src/test/fixtures/yard-telemetry-body.baseline.glb');
const provider = read('assets/source/models/world/yard-telemetry-body-tripo-original.glb');
const prepared = read('assets/source/models/world/yard-telemetry-body-crafted-surface.glb');
const result = derive(baseline),
  before = inspect(baseline),
  after = inspect(result.bytes);
test('immutable baseline/provider/prepared inputs and accepted antenna intermediate retain exact custody', () => {
  assert.equal(hash(baseline), SPEC.baseline);
  assertSourceInputs(provider, prepared);
  assert.equal(hash(result.bytes), SPEC.output);
  assert.equal(result.bytes.length, 37756);
  assert.deepEqual(read('src/test/fixtures/yard-telemetry-body.antenna-seated.glb'), result.bytes);
});
test('fixed final stage is deterministic and refuses repeat or caller-selected transforms', () => {
  assert.deepEqual(derive(baseline).bytes, result.bytes);
  assert.throws(() => derive(result.bytes), /Pinned telemetry/);
  for (const options of [{ deltaY: 0 }, { deltaY: -2.2 }, { vertices: [] }])
    assert.throws(() => derive(baseline, options), /Caller-selected/);
});
test('wrong inputs and unexpected current output cannot silently be overwritten', () => {
  const bad = Buffer.from(baseline);
  bad[bad.length - 1] ^= 1;
  assert.throws(() => derive(bad), /Pinned telemetry/);
  assert.throws(() => assertSourceInputs(bad, prepared), /provider/);
  assert.throws(() => assertSourceInputs(provider, bad), /prepared/);
  assertCurrentOutput(baseline, result.bytes);
  assertCurrentOutput(result.bytes, result.bytes);
  assert.throws(() => assertCurrentOutput(bad, result.bytes), /current output/);
  assert.throws(() => assertCurrentOutput(baseline, baseline), /accepted output/);
});
test('exactly72 antenna triangles own108 disjoint POSITION entries', () => {
  const ids = result.receipt.translatedTriangleIds,
    vertices = new Set(result.receipt.translatedVertexIds);
  assert.deepEqual(
    ids,
    Array.from({ length: 72 }, (_, i) => i + 50)
  );
  assert.deepEqual(
    [...vertices],
    Array.from({ length: 108 }, (_, i) => i + 100)
  );
  for (const mesh of before.meshes)
    if (mesh.position.id === 3)
      for (let i = 0; i < mesh.triangles.length; i++)
        if (mesh.meshIndex !== 0 || !ids.includes(i))
          assert(mesh.triangles[i].every((v) => !vertices.has(v)));
});
test('only selected POSITION Y bytes change; normals UVs maps colours indices padding and all other parts are exact', () => {
  const p = before.meshes[0].position,
    permit = new Set();
  for (const i of result.receipt.translatedVertexIds)
    for (let k = 0; k < 4; k++) permit.add(p.start + i * p.stride + 4 + k);
  assert.equal(before.binary.length, after.binary.length);
  for (let i = 0; i < before.binary.length; i++)
    if (!permit.has(i)) assert.equal(before.binary[i], after.binary[i], 'Unexpected byte ' + i);
  const restored = structuredClone(after.json);
  restored.accessors[3].min = before.json.accessors[3].min;
  restored.accessors[3].max = before.json.accessors[3].max;
  assert.deepEqual(restored, before.json);
});
test('actual final height and accessor extrema are truthful without changing root sizing or footprint', () => {
  assert.deepEqual(after.json.nodes, before.json.nodes);
  assert(Math.abs(after.bounds.size[1] - 6.5) < 1e-6);
  for (const k of [0, 2]) {
    assert.equal(after.bounds.min[k], before.bounds.min[k]);
    assert.equal(after.bounds.max[k], before.bounds.max[k]);
  }
  const p = after.meshes[0].position;
  for (let k = 0; k < 3; k++) {
    const values = Array.from({ length: p.definition.count }, (_, i) => p.get(i)[k]);
    assert.equal(p.definition.min[k], Math.min(...values));
    assert.equal(p.definition.max[k], Math.max(...values));
  }
  assert(Math.abs(result.receipt.mastBaseResidualMetres) < 1e-6);
  assert(result.receipt.baseContactAreaXZ > 0.04);
  assert.equal(result.receipt.triangles, 156);
  assert.equal(result.receipt.materials, 1);
  assert.equal(result.receipt.textures, 2);
});
