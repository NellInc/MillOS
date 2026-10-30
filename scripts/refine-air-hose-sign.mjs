/** AIR-only final-stage derivative. Normalization/indexing happen first.
 * Immutable provider/prepared inputs and every non-board byte remain unchanged.
 * The3.325m source sizing is LEGACY pre-derivation sizing, not final runtime height.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const AIR_SIGN_DROP_METRES = 0.075;
export const AIR_SIGN_OUTPUT_SHA256 =
  'ba2feae1b9944117453d110dfd4db4f638bac8c67eae8e75ff74e2df76793040';
export const AIR_SIGN_FINAL_HEIGHT_METRES = 3.25;
export const AIR_SIGN_LEGACY_SIZING_METRES = 3.325000047683716;
export const AIR_SIGN_INPUTS = Object.freeze({
  providerSha256: '377ef7d61a783161377e42c67bb9b4eb5a698cf6695a7307573cb4cc8060e7f5',
  preparedSha256: '0ff4397b0b6abeabdb2888f10cdf7a8ca0f17c32274a9e1f47851207ddd892b3',
  baselineDeliverySha256: '1af0c68ad7a8ac0f29f03790b10a973564905a880d7ec0d09a8241ac9a529ddd',
});
export const airSignSha256 = (value) => createHash('sha256').update(value).digest('hex');
export function assertAirSignSourceInputs(provider, prepared) {
  assert.equal(airSignSha256(provider), AIR_SIGN_INPUTS.providerSha256, 'AIR provider input drift');
  assert.equal(airSignSha256(prepared), AIR_SIGN_INPUTS.preparedSha256, 'AIR prepared input drift');
}
export function readAirGLB(input) {
  const bytes = Buffer.from(input);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Expected GLB');
  assert.equal(bytes.readUInt32LE(4), 2, 'Expected GLB2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'Expected JSON first');
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binStart = 28 + jsonLength;
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942, 'Expected BIN second');
  const binLength = bytes.readUInt32LE(20 + jsonLength);
  assert.equal(binStart + binLength, bytes.length, 'Unexpected GLB chunks');
  return { bytes, json, bin: bytes.subarray(binStart), binStart };
}
function accessor(g, id) {
  const a = g.json.accessors[id],
    view = g.json.bufferViews[a.bufferView];
  assert(!a.sparse, 'Sparse accessor unsupported');
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const type = {
    5126: ['readFloatLE', 4],
    5125: ['readUInt32LE', 4],
    5123: ['readUInt16LE', 2],
    5121: ['readUInt8', 1],
  }[a.componentType];
  assert(width && type, 'Unsupported accessor');
  const [method, size] = type;
  const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0),
    stride = view.byteStride ?? width * size;
  const get = (i) =>
    Array.from({ length: width }, (_, k) => g.bin[method](start + i * stride + k * size));
  return { definition: a, width, size, start, stride, get };
}
export function inspectAirDelivery(input) {
  const g = readAirGLB(input),
    j = g.json;
  assert.equal(j.meshes.length, 1);
  assert.equal(j.meshes[0].primitives.length, 1);
  assert.equal(j.nodes.length, 2);
  assert.equal(j.materials.length, 1);
  assert.equal(j.images.length, 2);
  const primitive = j.meshes[0].primitives[0],
    position = accessor(g, primitive.attributes.POSITION),
    indices = accessor(g, primitive.indices);
  assert.equal(position.definition.componentType, 5126);
  assert.equal(position.width, 3);
  assert.equal(position.definition.count, 233);
  assert.equal(indices.definition.count, 552);
  const parent = j.nodes[0];
  assert.deepEqual(parent.translation, [0, 1.662500023841858, 0]);
  assert.deepEqual(parent.scale, [3.3250002458691745, 3.3250002458691745, 3.3250002458691745]);
  assert.deepEqual(parent.children, [1]);
  assert.equal(j.nodes[1].mesh, 0);
  assert(
    !parent.rotation &&
      !parent.matrix &&
      !j.nodes[1].translation &&
      !j.nodes[1].scale &&
      !j.nodes[1].matrix
  );
  const points = Array.from({ length: 233 }, (_, i) =>
    position.get(i).map((v, k) => v * parent.scale[k] + parent.translation[k])
  );
  const triangles = Array.from({ length: 184 }, (_, i) =>
    [0, 1, 2].map((k) => indices.get(i * 3 + k)[0])
  );
  const bounds = {
    min: [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k]))),
    max: [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k]))),
  };
  return { g, primitive, position, indices, parent, points, triangles, bounds };
}
/** There is one pinned baseline and one fixed decision, never a caller face list/drop. */
export function deriveAirHoseSignGLB(input, options = {}) {
  assert.deepEqual(options, {}, 'AIR derivative does not accept changed drops or selections');
  assert.equal(
    airSignSha256(input),
    AIR_SIGN_INPUTS.baselineDeliverySha256,
    'AIR final-stage baseline mismatch: wrong, altered, no-op or already-derived input refused'
  );
  const before = inspectAirDelivery(input),
    { g, position, points, triangles, parent } = before;
  // Full immutable baseline hash fixes the identity; this bounded identification
  // then checks the exact12 board triangles and every shared-corner consumer.
  const selectedTriangles = triangles
    .map((ids, i) => ({ ids, i }))
    .filter((t) => t.ids.every((i) => points[i][1] > 3.07 && points[i][1] < 3.33));
  assert.equal(selectedTriangles.length, 12, 'AIR board triangle ownership changed');
  const selectedTriangleIds = new Set(selectedTriangles.map((t) => t.i));
  const selectedVertices = [...new Set(selectedTriangles.flatMap((t) => t.ids))].sort(
    (a, b) => a - b
  );
  assert.equal(selectedVertices.length, 24, 'AIR board split-corner ownership changed');
  for (let i = 0; i < triangles.length; i++)
    if (!selectedTriangleIds.has(i))
      assert(
        triangles[i].every((v) => !selectedVertices.includes(v)),
        'AIR board shares non-board corners'
      );
  const boardBounds = {
    min: [0, 1, 2].map((k) => Math.min(...selectedVertices.map((i) => points[i][k]))),
    max: [0, 1, 2].map((k) => Math.max(...selectedVertices.map((i) => points[i][k]))),
  };
  for (const [side, want] of [
    ['min', [-0.25, 3.075, -0.1]],
    ['max', [0.25, 3.325, -0.08]],
  ])
    for (let k = 0; k < 3; k++)
      assert(Math.abs(boardBounds[side][k] - want[k]) < 1e-6, 'AIR board metric ownership changed');
  const outputBin = Buffer.from(g.bin),
    permittedBytes = new Set();
  for (const i of selectedVertices) {
    const offset = position.start + i * position.stride + 4;
    const old = outputBin.readFloatLE(offset);
    outputBin.writeFloatLE(old - AIR_SIGN_DROP_METRES / parent.scale[1], offset);
    assert.notEqual(outputBin.readFloatLE(offset), old, 'AIR no-op position mutation');
    for (let k = 0; k < 4; k++) permittedBytes.add(offset + k);
  }
  let changedBytes = 0;
  for (let i = 0; i < outputBin.length; i++)
    if (outputBin[i] !== g.bin[i]) {
      changedBytes++;
      assert(permittedBytes.has(i), 'Non-board POSITION byte changed');
    }
  assert(changedBytes > 0);
  const j = structuredClone(g.json),
    a = j.accessors[before.primitive.attributes.POSITION];
  const local = Array.from({ length: 233 }, (_, i) =>
    [0, 1, 2].map((k) => outputBin.readFloatLE(position.start + i * position.stride + k * 4))
  );
  a.min = [0, 1, 2].map((k) => Math.min(...local.map((p) => p[k])));
  a.max = [0, 1, 2].map((k) => Math.max(...local.map((p) => p[k])));
  const encoded = Buffer.from(JSON.stringify(j)),
    jsonLength = (encoded.length + 3) & ~3;
  const output = Buffer.alloc(28 + jsonLength + outputBin.length, 0);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(0x20, 20, 20 + jsonLength);
  encoded.copy(output, 20);
  output.writeUInt32LE(outputBin.length, 20 + jsonLength);
  output.writeUInt32LE(0x004e4942, 24 + jsonLength);
  outputBin.copy(output, 28 + jsonLength);
  const after = inspectAirDelivery(output);
  assert(
    Math.abs(after.bounds.max[1] - after.bounds.min[1] - AIR_SIGN_FINAL_HEIGHT_METRES) < 1e-6,
    'Final height is not3.25m'
  );
  const unchangedJSON = structuredClone(after.g.json);
  unchangedJSON.accessors[before.primitive.attributes.POSITION].min =
    g.json.accessors[before.primitive.attributes.POSITION].min;
  unchangedJSON.accessors[before.primitive.attributes.POSITION].max =
    g.json.accessors[before.primitive.attributes.POSITION].max;
  assert.deepEqual(unchangedJSON, g.json, 'Only POSITION accessor min/max metadata may differ');
  for (let i = 0; i < 233; i++)
    if (!selectedVertices.includes(i))
      assert.deepEqual(after.position.get(i), position.get(i), 'Non-board vertex moved');
  assert.deepEqual(after.g.json.nodes, g.json.nodes, 'Node transform drift');
  const deltas = selectedVertices.map((i) => points[i][1] - after.points[i][1]);
  assert(
    deltas.every((d) => Math.abs(d - AIR_SIGN_DROP_METRES) < 1e-6),
    'Incorrect metric drop'
  );
  assert.equal(
    airSignSha256(output),
    AIR_SIGN_OUTPUT_SHA256,
    'AIR derived output identity changed'
  );
  return {
    bytes: output,
    receipt: {
      method: 'air-sign-seating-final-stage-v1',
      inputSha256: AIR_SIGN_INPUTS.baselineDeliverySha256,
      outputSha256: airSignSha256(output),
      legacyPreDerivationSizingMetres: AIR_SIGN_LEGACY_SIZING_METRES,
      finalRuntimeHeightMetres: AIR_SIGN_FINAL_HEIGHT_METRES,
      actualFinalBounds: after.bounds,
      originalBounds: before.bounds,
      boardTriangleIds: selectedTriangles.map((t) => t.i),
      boardVertexIds: selectedVertices,
      boardBoundsBefore: boardBounds,
      actualDropRange: [Math.min(...deltas), Math.max(...deltas)],
      positionOnly: true,
      changedBinBytes: changedBytes,
      nonBoardPositionBytesExact: true,
      allOtherBuffersNodesMaterialsImagesExact: true,
      triangles: 184,
      renderVertices: 552,
      indexedVertices: 233,
      materials: 1,
      textures: 2,
      bytesBefore: input.length,
      bytesAfter: output.length,
    },
  };
}
export function assertAirSignCurrentOutput(current, candidate) {
  assert(
    [AIR_SIGN_INPUTS.baselineDeliverySha256, airSignSha256(candidate)].includes(
      airSignSha256(current)
    ),
    'AIR current output is neither pinned baseline nor exact current derivative'
  );
}
