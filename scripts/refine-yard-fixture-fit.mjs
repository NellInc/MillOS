/** Two fixed final-stage derivatives. Run after ordinary normalization/indexing.
 * No IO, generic sizing change or caller-selected face list. Final outputs are pinned.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const hash = (b) => createHash('sha256').update(b).digest('hex');
export const FIXTURES = Object.freeze({
  intercom: Object.freeze({
    id: 'world-yard-intercom-body',
    output: 'e26dd2a6ace5a58547dcf26f106be974c2504630ac57b590626ef201367324bf',
    fileBytes: 37240,
    asset: 'yardIntercomBody',
    slug: 'yard-intercom-body',
    baseline: 'ab8af7fa35b1ebf9d634dee2e223267b74b6f21a5e2449df8c52c8c34f5561be',
    provider: 'cb76edf2c03cf87aca09fb85f6afb2b9919c4f3f546cc023750ecaf10b95bfc2',
    prepared: 'bd4f7f67e972cbfe594dc0c4e03b6418fbec9f553e332652b67af3cec7987d6a',
    offset: [0, 0, 0.052500004],
    vertices: 305,
    triangles: 170,
    box: [
      [-0.15, 1.1, 0.005],
      [0.15, 1.5, 0.155],
    ],
    axis: 1,
    bottom: 1.0325,
    delta: -0.0675,
    method: 'intercom-casing-lower-edge-final-stage-v1',
  }),
  tire: Object.freeze({
    id: 'world-yard-tire-inspection-body',
    output: 'ae5c06f33d8aafa759a698f5b6c16abbb89a348c8225db85302c3cd5592297dd',
    fileBytes: 51768,
    asset: 'yardTireInspectionBody',
    slug: 'yard-tire-inspection-body',
    baseline: '758f445ebaa320643f524a64b50f524c476fd51009cd043ab4df6d651440b497',
    provider: '35d53092ea3fe8b51a77fce5883bc52c5bd352f270bf81f5cf1099f39e487ed2',
    prepared: '5e99106f72225e571c33af65f3671c2f377a64b9c5314c1691ba576fbbcfc18f',
    offset: [0.149999976, -4.8e-8, 0],
    vertices: 548,
    triangles: 344,
    box: [
      [2.4, 2, -0.025],
      [3.6, 2.6, 0.025],
    ],
    axis: 2,
    delta: 0.06,
    method: 'tire-board-front-mount-final-stage-v1',
  }),
});
export function inspect(input, key) {
  const spec = FIXTURES[key];
  assert(spec, 'Only the two fixed fixture decisions are supported');
  const bytes = Buffer.from(input);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const j = JSON.parse(bytes.subarray(20, 20 + jsonLength)),
    binStart = 28 + jsonLength;
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942);
  assert.equal(binStart + bytes.readUInt32LE(20 + jsonLength), bytes.length);
  assert.equal(j.meshes.length, 1);
  assert.equal(j.meshes[0].primitives.length, 1);
  assert.equal(j.nodes.length, 2);
  assert.equal(j.materials.length, 1);
  assert.equal(j.images.length, 2);
  assert.equal(j.skins?.length ?? 0, 0);
  assert.equal(j.animations?.length ?? 0, 0);
  const primitive = j.meshes[0].primitives[0];
  assert(!primitive.extensions);
  assert(primitive.mode === undefined || primitive.mode === 4);
  const parent = j.nodes[0],
    child = j.nodes[1];
  assert.deepEqual(parent.children, [1]);
  assert.equal(child.mesh, 0);
  assert(
    !parent.rotation &&
      !parent.matrix &&
      !child.translation &&
      !child.rotation &&
      !child.scale &&
      !child.matrix
  );
  assert(parent.scale.every((s) => s > 0 && Number.isFinite(s)));
  const bin = bytes.subarray(binStart);
  function accessor(id) {
    const a = j.accessors[id],
      v = j.bufferViews[a.bufferView];
    assert(!a.sparse);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const type = {
      5126: ['readFloatLE', 4],
      5125: ['readUInt32LE', 4],
      5123: ['readUInt16LE', 2],
      5121: ['readUInt8', 1],
    }[a.componentType];
    assert(width && type);
    const [method, size] = type;
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      stride = v.byteStride ?? width * size;
    return {
      a,
      width,
      start,
      stride,
      get: (i) =>
        Array.from({ length: width }, (_, k) => bin[method](start + i * stride + k * size)),
    };
  }
  const position = accessor(primitive.attributes.POSITION),
    index = accessor(primitive.indices);
  assert.equal(position.a.componentType, 5126);
  assert.equal(position.width, 3);
  assert.equal(position.a.count, spec.vertices);
  assert.equal(index.a.count, spec.triangles * 3);
  const local = Array.from({ length: spec.vertices }, (_, i) => position.get(i));
  const points = local.map((p) =>
    p.map((v, k) => v * parent.scale[k] + parent.translation[k] + spec.offset[k])
  );
  const triangles = Array.from({ length: spec.triangles }, (_, i) =>
    [0, 1, 2].map((k) => index.get(i * 3 + k)[0])
  );
  const bounds = (p) => ({
    min: [0, 1, 2].map((k) => Math.min(...p.map((v) => v[k]))),
    max: [0, 1, 2].map((k) => Math.max(...p.map((v) => v[k]))),
  });
  return {
    spec,
    bytes,
    j,
    bin,
    binStart,
    primitive,
    parent,
    position,
    index,
    local,
    points,
    triangles,
    bounds: bounds(points),
    localBounds: bounds(local),
    boundsOf: bounds,
  };
}
export function derive(input, key, options = {}) {
  assert.deepEqual(options, {}, 'Caller-selected transforms are forbidden');
  const spec = FIXTURES[key];
  assert(spec);
  assert.equal(
    hash(input),
    spec.baseline,
    'Pinned normalized baseline required; wrong, altered and already-derived inputs are refused'
  );
  const before = inspect(input, key),
    { points, triangles, position, parent } = before;
  const corner = (p) =>
    p.every((v, k) => Math.min(Math.abs(v - spec.box[0][k]), Math.abs(v - spec.box[1][k])) < 1e-6);
  const selectedTriangles = triangles
    .map((ids, i) => ({ ids, i }))
    .filter((t) => t.ids.every((id) => corner(points[id])));
  assert.equal(selectedTriangles.length, 12, 'Exact six-face box ownership changed');
  const selectedTriangleIds = new Set(selectedTriangles.map((t) => t.i));
  const selectedVertices = [...new Set(selectedTriangles.flatMap((t) => t.ids))].sort(
    (a, b) => a - b
  );
  assert.equal(selectedVertices.length, 24, 'Expected split box corners');
  for (let i = 0; i < triangles.length; i++)
    if (!selectedTriangleIds.has(i))
      assert(
        triangles[i].every((v) => !selectedVertices.includes(v)),
        'Selected box shares an unrelated vertex'
      );
  const faces = [0, 1, 2].flatMap((axis) =>
    [0, 1].map((side) => ({
      axis,
      side,
      count: selectedTriangles.filter((t) =>
        t.ids.every((id) => Math.abs(points[id][axis] - spec.box[side][axis]) < 1e-6)
      ).length,
    }))
  );
  assert(
    faces.every((f) => f.count === 2),
    'Not a complete six-face source box'
  );
  const changedVertices =
    key === 'intercom'
      ? selectedVertices.filter((i) => Math.abs(points[i][1] - spec.box[0][1]) < 1e-6)
      : selectedVertices;
  assert.equal(changedVertices.length, key === 'intercom' ? 12 : 24);
  const changedTriangles = selectedTriangles.filter((t) =>
    t.ids.some((i) => changedVertices.includes(i))
  );
  assert.equal(changedTriangles.length, key === 'intercom' ? 10 : 12);
  const result = Buffer.from(input),
    permitted = new Set();
  for (const i of changedVertices) {
    const offset = before.binStart + position.start + i * position.stride + spec.axis * 4;
    const current = result.readFloatLE(offset);
    const next =
      key === 'intercom'
        ? (spec.bottom - parent.translation[1] - spec.offset[1]) / parent.scale[1]
        : current + spec.delta / parent.scale[2];
    result.writeFloatLE(next, offset);
    assert.notEqual(result.readFloatLE(offset), current);
    for (let k = 0; k < 4; k++) permitted.add(offset + k);
  }
  let changedBytes = 0;
  for (let i = 0; i < result.length; i++)
    if (result[i] !== before.bytes[i]) {
      assert(permitted.has(i), 'Non-target byte changed');
      changedBytes++;
    }
  assert(changedBytes > 0);
  const after = inspect(result, key);
  assert.deepEqual(after.j, before.j, 'GLB JSON/normalization/material/image metadata changed');
  assert.deepEqual(after.localBounds, before.localBounds, 'Overall accessor bounds changed');
  assert.deepEqual(after.bounds, before.bounds, 'Whole fixture bounds changed');
  for (let i = 0; i < spec.vertices; i++) {
    if (!changedVertices.includes(i))
      assert.deepEqual(
        after.position.get(i),
        before.position.get(i),
        'Unselected position changed'
      );
    else
      for (let k = 0; k < 3; k++)
        assert(
          Math.abs(after.points[i][k] - before.points[i][k] - (k === spec.axis ? spec.delta : 0)) <
            1e-6,
          'Wrong metric displacement'
        );
  }
  assert.equal(hash(result), spec.output, 'Reviewed final-stage output identity changed');
  const normalizedPoints = after.local.map((p) =>
    p.map((v, k) => v * parent.scale[k] + parent.translation[k])
  );
  const actualFinalBounds = after.boundsOf(normalizedPoints);
  return {
    bytes: result,
    receipt: {
      method: spec.method,
      actualFinalBounds,
      restoredFixtureBounds: after.bounds,
      inputSha256: spec.baseline,
      outputSha256: hash(result),
      axis: spec.axis,
      metricDelta: spec.delta,
      selectedTriangleIds: selectedTriangles.map((t) => t.i),
      changedTriangleIds: changedTriangles.map((t) => t.i),
      selectedVertices,
      changedVertices,
      selectedTriangles: 12,
      changedTriangles: changedTriangles.length,
      faces,
      beforeBox: before.boundsOf(selectedVertices.map((i) => points[i])),
      afterBox: after.boundsOf(selectedVertices.map((i) => after.points[i])),
      bounds: after.bounds,
      unchangedEnvelope: true,
      allOtherFileBytesExact: true,
      changedBytes,
      bytesBefore: input.length,
      bytesAfter: result.length,
      triangles: spec.triangles,
      indexedVertices: spec.vertices,
      maps: 2,
      materials: 1,
      noGenericNormalizationChange: true,
    },
  };
}

export function assertSourceInputs(key, provider, prepared) {
  const spec = FIXTURES[key];
  assert(spec, 'Unknown fixed yard fixture');
  assert.equal(hash(provider), spec.provider, 'Immutable provider input drift');
  assert.equal(hash(prepared), spec.prepared, 'Immutable prepared input drift');
}
export function assertCurrentOutput(key, current, candidate) {
  const spec = FIXTURES[key];
  assert(spec);
  assert.equal(hash(candidate), spec.output, 'Unreviewed yard fixture derivative');
  assert(
    [spec.baseline, spec.output].includes(hash(current)),
    'Current yard output is neither baseline nor reviewed derivative'
  );
}
