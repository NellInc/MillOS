/** Replays the five bounded yard repairs without changing their source assets or finish. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getBounds, NodeIO } from '@gltf-transform/core';
import {
  AIR_SIGN_INPUTS,
  AIR_SIGN_OUTPUT_SHA256,
  deriveAirHoseSignGLB,
} from './refine-air-hose-sign.mjs';
import { SPEC as ANTENNA, derive as deriveAntenna } from './refine-telemetry-antenna.mjs';
import { SPEC as BANNER, deriveBanner, composeFinalReceipt } from './refine-telemetry-banner.mjs';
import { FIXTURES, derive as deriveFixture } from './refine-yard-fixture-fit.mjs';
import { SPEC as WASH, derive as deriveWash } from './refine-truck-wash-body.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// These five historical inputs are replayed byte-for-byte. The running toolkit
// is recorded by the execution environment; it cannot relabel a pinned input.
export const YARD_INPUT_GENERATOR = 'MillOS generated-asset pipeline, glTF-Transform v4.4.2';
export const RECONCILED_YARD_MODELS = Object.freeze({
  'world-yard-air-hose-body': {
    input: AIR_SIGN_INPUTS.baselineDeliverySha256,
    output: AIR_SIGN_OUTPUT_SHA256,
    provider: AIR_SIGN_INPUTS.providerSha256,
    prepared: AIR_SIGN_INPUTS.preparedSha256,
    derive: deriveAirHoseSignGLB,
  },
  [ANTENNA.id]: {
    ...ANTENNA,
    input: ANTENNA.baseline,
    output: BANNER.output,
    derive: (bytes) => {
      const antenna = deriveAntenna(bytes);
      const banner = deriveBanner(antenna.bytes);
      return { bytes: banner.bytes, receipt: composeFinalReceipt(antenna.receipt, banner.receipt) };
    },
  },
  ...Object.fromEntries(
    Object.entries(FIXTURES).map(([key, spec]) => [
      spec.id,
      { ...spec, input: spec.baseline, derive: (bytes) => deriveFixture(bytes, key) },
    ])
  ),
  [WASH.id]: { ...WASH, input: WASH.baseline, derive: deriveWash },
});

export function deriveYardModel(id, baseline, provider, prepared, current) {
  const spec = RECONCILED_YARD_MODELS[id];
  assert(spec, `Unknown reconciled yard model: ${id}`);
  assert.equal(hash(baseline), spec.input, `${id}: normalized input changed`);
  assert.equal(hash(provider), spec.provider, `${id}: immutable provider changed`);
  assert.equal(hash(prepared), spec.prepared, `${id}: prepared source changed`);
  assert([spec.input, spec.output].includes(hash(current)), `${id}: unknown current delivery`);
  const result = spec.derive(baseline);
  assert.equal(hash(result.bytes), spec.output, `${id}: reviewed output changed`);
  return result;
}

export async function assertYardNormalization(id, result, current, baseline, provider, prepared) {
  const expected = deriveYardModel(id, baseline, provider, prepared, current);
  assert.equal(hash(current), RECONCILED_YARD_MODELS[id].output, `${id}: repair not installed`);
  assert.equal(result.id, id);
  assert.equal(result.outputSha256, hash(current), `${id}: stale normalization output`);
  assert.equal(result.outputBytes, current.length, `${id}: stale byte count`);
  assert.equal(result.sourceSha256, hash(provider), `${id}: stale source hash`);
  assert.equal(result.blenderPreparation.sha256, hash(prepared), `${id}: stale preparation hash`);
  assert.deepEqual(result.geometryRefinement, expected.receipt, `${id}: stale repair receipt`);
  await assertModelNormalization(id, result, current);
}

/** Shared delivery measurements for the yard and the two scenic contact repairs. */
export async function assertModelNormalization(id, result, current) {
  assert.equal(result.outputSha256, hash(current), `${id}: stale normalization output`);
  assert.equal(result.outputBytes, current.length, `${id}: stale byte count`);
  const root = (await new NodeIO().readBinary(current)).getRoot();
  const measured = getBounds(root.listScenes()[0]);
  assert.deepEqual(
    result.bounds,
    {
      width: Number((measured.max[0] - measured.min[0]).toFixed(4)),
      height: Number((measured.max[1] - measured.min[1]).toFixed(4)),
      length: Number((measured.max[2] - measured.min[2]).toFixed(4)),
      minY: Number(measured.min[1].toFixed(5)),
      centreX: Number(((measured.min[0] + measured.max[0]) / 2).toFixed(5)),
      centreZ: Number(((measured.min[2] + measured.max[2]) / 2).toFixed(5)),
    },
    `${id}: stale measured bounds`
  );
  const vertices = root
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce(
      (sum, primitive) =>
        sum + (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()),
      0
    );
  assert.equal(result.renderVertices, vertices, `${id}: stale render vertices`);
  assert.equal(result.materials, root.listMaterials().length, `${id}: stale material count`);
  assert.equal(result.textures, root.listTextures().length, `${id}: stale texture count`);
  assert.equal(
    result.textureBytes,
    root.listTextures().reduce((sum, texture) => sum + texture.getImage().byteLength, 0),
    `${id}: stale texture bytes`
  );
  assert.equal(result.file, `world/${id.slice('world-'.length)}.glb`, `${id}: wrong runtime file`);
  assert(
    root.listNodes().some((node) => node.getName() === result.bodyNode),
    `${id}: wrong body node`
  );
}

/** Replace only named JSON array records; preserve all other text and metadata verbatim. */
export function replaceYardRecords(text, arrayKey, replacements) {
  const document = JSON.parse(text);
  assert(Array.isArray(document[arrayKey]), `Missing ${arrayKey} array`);
  const arrayStart = text.indexOf('[', text.indexOf(`"${arrayKey}"`));
  const spans = [];
  let depth = 0,
    quoted = false,
    escaped = false,
    start = -1;
  for (let i = arrayStart + 1; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '{' || c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}' || c === ']') {
      if (depth === 0) break;
      depth--;
      if (depth === 0)
        spans.push({ start, end: i + 1, value: JSON.parse(text.slice(start, i + 1)) });
    }
  }
  assert.equal(spans.length, document[arrayKey].length, 'Record span count differs');
  const edits = [...replacements].map(([id, next]) => {
    const matches = spans.filter((span) => span.value.id === id);
    assert.equal(matches.length, 1, `${id}: exactly one existing record required`);
    assert.equal(next.id, id, 'Replacement identity changed');
    const span = matches[0];
    const indent = text.slice(text.lastIndexOf('\n', span.start) + 1, span.start);
    assert(/^ *$/.test(indent), 'Record indentation changed');
    return { ...span, text: JSON.stringify(next, null, 2).split('\n').join(`\n${indent}`) };
  });
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }
  const after = JSON.parse(text);
  assert.deepEqual(
    after[arrayKey].filter((entry) => !replacements.has(entry.id)),
    document[arrayKey].filter((entry) => !replacements.has(entry.id)),
    'Unrelated records changed'
  );
  return text;
}
