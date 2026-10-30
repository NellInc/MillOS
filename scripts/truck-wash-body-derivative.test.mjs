// @vitest-environment node
/** Pure byte derivative checks complement the separately pinned delivered-asset tests. */
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
} from './refine-truck-wash-body.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const baseline = read('src/test/fixtures/yard-truck-wash-body.baseline.glb');
const provider = read('assets/source/models/world/yard-truck-wash-body-tripo-original.glb');
const prepared = read('assets/source/models/world/yard-truck-wash-body-crafted-surface.glb');

test('truck-wash derivative replays the reviewed fixed output without mutating input', () => {
  const input = Buffer.from(baseline);
  const result = derive(input);
  assert.equal(hash(result.bytes), SPEC.output);
  assert.equal(result.bytes.length, 72656);
  assert.equal(hash(input), SPEC.baseline);
  assert.deepEqual(input, baseline);
  assert.deepEqual(derive(baseline), result);
  const arrayBuffer = Uint8Array.from(baseline).buffer;
  assert.deepEqual(derive(arrayBuffer), result);
  assert.equal(result.receipt.method, SPEC.method);
  assert.equal(result.receipt.legacyPreDerivationSizingMetres, 8.300000190734863);
  assert.equal(result.receipt.finalRuntimeHeightMetres, 5.2);
});

test('truck-wash derivative rejects wrong truncated already-derived and caller-selected inputs', () => {
  const mutated = Buffer.from(baseline);
  mutated[mutated.length - 1] ^= 1;
  for (const input of [
    mutated,
    baseline.subarray(0, 100),
    provider,
    prepared,
    derive(baseline).bytes,
  ])
    assert.throws(() => derive(input), /Truck-wash derivative rejected/);
  for (const options of [{ radians: 0 }, { centralBankZ: 0 }, { vertices: [] }, null])
    assert.throws(() => derive(baseline, options), /caller-selected operations/);
});

test('truck-wash derivative owns exactly three full rods and fifteen full nozzle surfaces', () => {
  const source = inspect(baseline);
  const result = derive(baseline);
  assert.deepEqual(result.receipt.selectionTotals, {
    rod: { surfaces: 3, vertices: 132, triangles: 96 },
    nozzle: { surfaces: 15, vertices: 495, triangles: 240 },
  });
  assert.equal(source.selections.length, 18);
  assert.equal(result.receipt.selectedVertices, 627);
  assert.equal(result.receipt.selectedTriangles, 336);
  for (const selection of result.receipt.selections) {
    assert.equal(selection.completeOrientedSurface, true);
    assert.equal(selection.sharedVerticesWithUnselectedTriangles, 0);
    assert.deepEqual(selection.bankTranslation, [0, 0, selection.center[2] === 0 ? 1 : 0]);
  }
  assert.deepEqual(result.receipt.geometricIntent.finalBankCentersZ, [-2, 1, 2]);
  assert.deepEqual(result.receipt.resourcesBefore, result.receipt.resourcesAfter);
  assert.equal(result.receipt.custody.allowedComponentBytes, 4928);
  assert.equal(result.receipt.custody.allUnrelatedBinaryBytesIdentical, true);
  assert.equal(result.receipt.custody.selectedVerticesSharedWithUnselectedTriangles, 0);
  assert.equal(
    result.receipt.custody.preservedBinaryBeforeSha256,
    result.receipt.custody.preservedBinaryAfterSha256
  );
});

test('truck-wash derivative guards immutable sources and only baseline-to-final or final-to-final output custody', () => {
  const final = derive(baseline).bytes;
  assert.doesNotThrow(() => assertSourceInputs(provider, prepared));
  assert.throws(() => assertSourceInputs(prepared, prepared), /provider/);
  assert.throws(() => assertSourceInputs(provider, provider), /prepared/);
  assert.doesNotThrow(() => assertCurrentOutput(baseline, final));
  assert.doesNotThrow(() => assertCurrentOutput(final, final));
  assert.throws(() => assertCurrentOutput(prepared, final), /unexpected current delivery/);
  assert.throws(() => assertCurrentOutput(baseline, baseline), /unreviewed candidate/);
});
