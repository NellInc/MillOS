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
  // v7 replaces every baseline triangle with the lofted housing, post, reel,
  // gauge and sign; the counts are the regenerated delivery's own.
  b = inspectAirDelivery(first.bytes, { vertices: 286, triangles: 181 }),
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
test('the new sign keeps the authored board width and its foot and top dropped exactly75mm', () => {
  const board = first.receipt.boardBoundsBefore;
  for (const drop of first.receipt.actualDropRange) assert(Math.abs(drop - 0.075) < 1e-6);
  const top = b.points.filter((p) => Math.abs(p[1] - b.bounds.max[1]) < 1e-6);
  assert(top.length > 0);
  assert(Math.abs(b.bounds.max[1] - (board.max[1] - 0.075)) < 1e-6);
  assert.equal(Math.min(...top.map((p) => p[0])), board.min[0]);
  assert.equal(Math.max(...top.map((p) => p[0])), board.max[0]);
});
test('both maps are byte-exact and the material, nodes and samplers are unchanged', () => {
  for (const image of a.g.json.images) {
    const was = a.g.json.bufferViews[image.bufferView],
      now = b.g.json.bufferViews[image.bufferView];
    assert(
      a.g.bin
        .subarray(was.byteOffset, was.byteOffset + was.byteLength)
        .equals(b.g.bin.subarray(now.byteOffset, now.byteOffset + now.byteLength))
    );
  }
  for (const k of ['asset', 'scenes', 'nodes', 'materials', 'images', 'textures', 'samplers'])
    assert.deepEqual(b.g.json[k], a.g.json[k], k);
});
test('only accessor counts/extrema, view offsets/lengths and the buffer length change in JSON', () => {
  const normalised = (json) => {
    const copy = structuredClone(json);
    for (const accessor of copy.accessors) {
      delete accessor.count;
      delete accessor.min;
      delete accessor.max;
    }
    for (const view of copy.bufferViews) {
      delete view.byteOffset;
      delete view.byteLength;
    }
    delete copy.buffers[0].byteLength;
    return copy;
  };
  assert.deepEqual(normalised(b.g.json), normalised(a.g.json));
});
test('final accessor extrema describe actual POSITION values and final runtime bounds are3.25m', () => {
  const local = Array.from({ length: b.position.definition.count }, (_, i) => b.position.get(i));
  for (let k = 0; k < 3; k++) {
    assert.equal(b.position.definition.min[k], Math.min(...local.map((p) => p[k])));
    assert.equal(b.position.definition.max[k], Math.max(...local.map((p) => p[k])));
  }
  assert(Math.abs(b.bounds.max[1] - b.bounds.min[1] - 3.25) < 1e-6);
  // The envelope is regenerated from metric constants, so it agrees to float
  // precision rather than bit-for-bit: 0.60 x 0.52 m, grounded and centred.
  assert.equal(b.bounds.min[1], a.bounds.min[1]);
  for (const k of [0, 2])
    for (const side of ['min', 'max'])
      assert(Math.abs(b.bounds[side][k] - a.bounds[side][k]) < 1e-6);
});
test('one material/two maps/181triangles/543draw vertices/286indexed positions remain under budget', () => {
  assert.equal(b.g.json.materials.length, 1);
  assert.equal(b.g.json.images.length, 2);
  assert.equal(b.triangles.length, 181);
  assert.equal(b.indices.definition.count, 543);
  assert.equal(first.receipt.renderVertices, 543);
  assert(b.indices.definition.count <= 552); // manifest maxRenderVertices
  assert.equal(b.position.definition.count, 286);
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
