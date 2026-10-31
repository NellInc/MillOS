// @vitest-environment node
// Coordinator only. Finite exact-byte tests; no source mutation or renderer.
import { test, afterAll as after } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveAirHoseSignGLB,
  inspectAirDelivery,
  airSignSha256,
  AIR_SIGN_INPUTS,
  assertAirSignSourceInputs,
  assertAirSignCurrentOutput,
} from './refine-air-hose-sign.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = fs.readFileSync(
  path.join(root, 'src/test/fixtures/yard-air-hose-body.baseline.glb')
);
const provider = fs.readFileSync(
  path.join(root, 'assets/source/models/world/yard-air-hose-body-tripo-original.glb')
);
const prepared = fs.readFileSync(
  path.join(root, 'assets/source/models/world/yard-air-hose-body-crafted-surface.glb')
);
const first = deriveAirHoseSignGLB(baseline),
  second = deriveAirHoseSignGLB(baseline),
  a = inspectAirDelivery(baseline),
  b = inspectAirDelivery(first.bytes),
  vset = new Set(first.receipt.boardVertexIds);
const proof = {
  receipt: first.receipt,
  testsScope:
    'Exact normalized GLB stream contracts only; actual component/native glyph/contact and CPU references separate.',
};
function checkInputs() {
  assert.equal(airSignSha256(baseline), AIR_SIGN_INPUTS.baselineDeliverySha256);
  assertAirSignSourceInputs(provider, prepared);
}
test('pinned baseline fixture and immutable source packs retain exact custody', () => {
  checkInputs();
  assertAirSignSourceInputs(provider, prepared);
});
test('the same pinned normalized baseline deterministically produces identical bytes', () => {
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.receipt.outputSha256, second.receipt.outputSha256);
  assert.equal(airSignSha256(baseline), AIR_SIGN_INPUTS.baselineDeliverySha256);
});
test('duplicate/already-derived input is refused instead of applying a second75mm drop', () =>
  assert.throws(() => deriveAirHoseSignGLB(first.bytes), /baseline mismatch/));
test('no-op or caller-selected displacement/face input is refused', () => {
  assert.throws(() => deriveAirHoseSignGLB(baseline, { dropMetres: 0 }), /does not accept/);
  assert.throws(() => deriveAirHoseSignGLB(baseline, { dropMetres: 0.15 }), /does not accept/);
  assert.throws(() => deriveAirHoseSignGLB(baseline, { vertices: [] }), /does not accept/);
});
test('wrong baseline hash and changed prepared/provider originals are refused', () => {
  const bad = Buffer.from(baseline);
  bad[bad.length - 1] ^= 1;
  assert.throws(() => deriveAirHoseSignGLB(bad), /baseline mismatch/);
  const badPrepared = Buffer.from(prepared);
  badPrepared[badPrepared.length - 1] ^= 1;
  assert.throws(() => assertAirSignSourceInputs(provider, badPrepared), /prepared input drift/);
  const badProvider = Buffer.from(provider);
  badProvider[badProvider.length - 1] ^= 1;
  assert.throws(() => assertAirSignSourceInputs(badProvider, prepared), /provider input drift/);
});
test('only known baseline or exact derivative is an admissible current output', () => {
  assertAirSignCurrentOutput(baseline, first.bytes);
  assertAirSignCurrentOutput(first.bytes, first.bytes);
  const altered = Buffer.from(first.bytes);
  altered[altered.length - 1] ^= 1;
  assert.throws(() => assertAirSignCurrentOutput(altered, first.bytes), /current output/);
});
test('exact12 triangles own24 disjoint board vertices without touching other consumers', () => {
  assert.equal(first.receipt.boardTriangleIds.length, 12);
  assert.equal(vset.size, 24);
  for (let t = 0; t < a.triangles.length; t++)
    if (!first.receipt.boardTriangleIds.includes(t))
      assert(a.triangles[t].every((i) => !vset.has(i)));
});
test('board XZ and every non-board POSITION remain exact, with75mm Y-only metric displacement', () => {
  for (let i = 0; i < 233; i++) {
    const x = a.position.get(i),
      y = b.position.get(i);
    assert.equal(x[0], y[0]);
    assert.equal(x[2], y[2]);
    if (vset.has(i)) assert(Math.abs(a.points[i][1] - b.points[i][1] - 0.075) < 1e-6);
    else assert.deepEqual(x, y);
  }
});
test('all normals, UVs, vertex colours, indices, images and BIN padding are byte-exact', () => {
  const permit = new Set();
  for (const i of vset)
    for (let k = 0; k < 4; k++) permit.add(a.position.start + i * a.position.stride + 4 + k);
  assert.equal(a.g.bin.length, b.g.bin.length);
  for (let i = 0; i < a.g.bin.length; i++)
    if (!permit.has(i)) assert.equal(a.g.bin[i], b.g.bin[i], 'Unexpected BIN mutation at' + i);
});
test('all nodes/materials/samplers/texture declarations exact; only accessor minmax metadata changes', () => {
  const j = structuredClone(b.g.json);
  j.accessors[a.primitive.attributes.POSITION].min =
    a.g.json.accessors[a.primitive.attributes.POSITION].min;
  j.accessors[a.primitive.attributes.POSITION].max =
    a.g.json.accessors[a.primitive.attributes.POSITION].max;
  assert.deepEqual(j, a.g.json);
});
test('final accessor extrema describe actual POSITION values and final runtime bounds are3.25m', () => {
  const local = Array.from({ length: 233 }, (_, i) => b.position.get(i));
  for (let k = 0; k < 3; k++) {
    assert.equal(b.position.definition.min[k], Math.min(...local.map((p) => p[k])));
    assert.equal(b.position.definition.max[k], Math.max(...local.map((p) => p[k])));
  }
  assert(Math.abs(b.bounds.max[1] - b.bounds.min[1] - 3.25) < 1e-6);
  assert.deepEqual(b.bounds.min, a.bounds.min);
  assert.equal(b.bounds.max[0], a.bounds.max[0]);
  assert.equal(b.bounds.max[2], a.bounds.max[2]);
});
test('one material/two maps/184triangles/552draw vertices/233indexed positions remain under budget', () => {
  assert.equal(b.g.json.materials.length, 1);
  assert.equal(b.g.json.images.length, 2);
  assert.equal(b.triangles.length, 184);
  assert.equal(b.indices.definition.count, 552);
  assert.equal(b.position.definition.count, 233);
  assert(first.bytes.length <= 70000);
});
test('written candidate exactly equals producer result and no input was overwritten', () => {
  assert.deepEqual(
    fs.readFileSync(path.join(root, 'public/models/world/yard-air-hose-body.glb')),
    first.bytes
  );
  checkInputs();
});
after(() => {
  proof.completedAt = new Date().toISOString();
  const report = path.join(root, 'test-results/air-hose');
  fs.mkdirSync(report, { recursive: true });
  fs.writeFileSync(
    path.join(report, 'producer-test-evidence.json'),
    JSON.stringify(proof, null, 2) + '\n'
  );
});
