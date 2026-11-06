/** One exact current-input replay (the lock gate); newer textures, finish and joinery are retained.
 * The Cupid figure-contact stage (scripts/refine-cupid-figure-contact.mjs) is retired: the figure
 * is rebuilt as authored geometry by scripts/blender/authored/cupid-authored-body.py (D-034,
 * 2026-11-06), seated on its pedestal at source, so no final-stage shift applies to it.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as lock from './refine-lock-gate-body.mjs';
import { assertModelNormalization } from './reconcile-yard-models.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const RECONCILED_SCENIC_MODELS = Object.freeze({
  [lock.SPEC.id]: { ...lock.SPEC, input: lock.SPEC.rawNormalized, producer: lock },
});

export function deriveScenicModel(id, baseline, provider, prepared, current) {
  const spec = RECONCILED_SCENIC_MODELS[id];
  assert(spec, `Unknown scenic model: ${id}`);
  assert.equal(hash(baseline), spec.input, `${id}: current normalized input changed`);
  spec.producer.assertSourceInputs(provider, prepared);
  assert([spec.input, spec.output].includes(hash(current)), `${id}: unknown current delivery`);
  // This changes only the historically pinned generator string. Both complete
  // streams are guarded by the archived producer before any geometry can move.
  const canonical = spec.producer.canonicalizeNormalizedBaseline(baseline);
  const result = spec.producer.derive(canonical);
  assert.equal(hash(result.bytes), spec.output, `${id}: reviewed output changed`);
  return result;
}

export async function assertScenicNormalization(id, result, current, baseline, provider, prepared) {
  const expected = deriveScenicModel(id, baseline, provider, prepared, current);
  assert.equal(hash(current), RECONCILED_SCENIC_MODELS[id].output, `${id}: repair not installed`);
  assert.equal(result.id, id);
  assert.equal(result.sourceSha256, hash(provider), `${id}: stale source hash`);
  assert.equal(result.blenderPreparation.sha256, hash(prepared), `${id}: stale preparation hash`);
  assert.deepEqual(result.geometryRefinement, expected.receipt, `${id}: stale repair receipt`);
  await assertModelNormalization(id, result, current);
}
