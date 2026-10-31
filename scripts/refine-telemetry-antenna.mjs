/** Fixed telemetry-only final-stage derivative. No IO or caller-selected transform. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const SPEC = Object.freeze({
  id: 'world-yard-telemetry-body',
  slug: 'yard-telemetry-body',
  asset: 'yardTelemetryBody',
  method: 'telemetry-complete-antenna-roof-seating-final-stage-v1',
  output: 'a313535e9e0f67476fc92468d5a8c180d569dc1d3dcb9a9b57af0e22c370dc93',
  outputBytes: 37756,
  baseline: '24bcd7df0a2ba3aa45ecd59f5d3de1ba7a6b1a17a38a77c8decc4fca630ef22c',
  provider: '238b21f75c328e6c3492fe1e44c7fb50b52c0561c63234dd963aae2fe5ee1be8',
  prepared: '00a2cfe4a3c7e5ea30ce3ea390142017a98a79384e95def2a83d342c0b3a2bb8',
  baselineBytes: 37756,
  deltaY: -1.1,
  legacyHeight: 7.599999904632568,
  finalHeight: 6.5,
  sourceGroupYBefore: 5.4,
  sourceGroupYAfter: 4.3,
  triangles: 156,
  antennaTriangles: 72,
  rootScale: 8.600000431663139,
  rootTranslation: [0, 3.799999952316284, 0],
});
export function assertSourceInputs(provider, prepared) {
  assert.equal(hash(provider), SPEC.provider, 'Immutable telemetry provider changed');
  assert.equal(hash(prepared), SPEC.prepared, 'Immutable telemetry prepared source changed');
}
export function boundsOf(points) {
  assert(points.length);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let k = 0; k < 3; k++) {
      assert(Number.isFinite(p[k]));
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  return { min, max, size: max.map((v, k) => v - min[k]) };
}
export function inspect(input) {
  const bytes = Buffer.from(input);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength)),
    binStart = 28 + jsonLength;
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942);
  assert.equal(binStart + bytes.readUInt32LE(20 + jsonLength), bytes.length);
  const binary = bytes.subarray(binStart);
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].uri, undefined);
  assert.equal(json.nodes.length, 4);
  assert.equal(json.meshes.length, 3);
  assert.equal(json.materials.length, 1);
  assert.equal(json.textures.length, 2);
  assert.equal(json.images.length, 2);
  assert.equal(json.skins?.length ?? 0, 0);
  assert.equal(json.animations?.length ?? 0, 0);
  assert.deepEqual(json.scenes[json.scene ?? 0].nodes, [0]);
  const parent = json.nodes[0];
  assert.deepEqual(parent.children, [1, 2, 3]);
  assert.deepEqual(parent.scale, Array(3).fill(SPEC.rootScale));
  assert.deepEqual(parent.translation, SPEC.rootTranslation);
  assert(!parent.rotation && !parent.matrix && parent.mesh === undefined);
  for (const [i, name, cast, receive] of [
    [1, 'Yard-telemetry-bodyBody', false, false],
    [2, 'Authored shadows true:true', true, true],
    [3, 'Authored shadows true:false', true, false],
  ]) {
    const n = json.nodes[i];
    assert.equal(n.name, name);
    assert.equal(n.mesh, i - 1);
    assert.deepEqual(n.extras, { authoredCastShadow: cast, authoredReceiveShadow: receive });
    assert(
      !n.translation && !n.rotation && !n.scale && !n.matrix && !n.children && n.skin === undefined
    );
  }
  const cache = new Map();
  function accessor(id) {
    if (cache.has(id)) return cache.get(id);
    const definition = json.accessors[id],
      view = json.bufferViews[definition.bufferView];
    assert(!definition.sparse && view.buffer === 0);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[definition.type],
      type = {
        5126: ['readFloatLE', 4],
        5125: ['readUInt32LE', 4],
        5123: ['readUInt16LE', 2],
        5121: ['readUInt8', 1],
      }[definition.componentType];
    assert(width && type);
    const [reader, componentBytes] = type,
      start = (view.byteOffset ?? 0) + (definition.byteOffset ?? 0),
      stride = view.byteStride ?? width * componentBytes;
    assert(
      start + (definition.count - 1) * stride + width * componentBytes <=
        (view.byteOffset ?? 0) + view.byteLength
    );
    const result = {
      id,
      definition,
      width,
      start,
      stride,
      componentBytes,
      get: (index) =>
        Array.from({ length: width }, (_, k) =>
          binary[reader](start + index * stride + k * componentBytes)
        ),
    };
    cache.set(id, result);
    return result;
  }
  const meshes = json.meshes.map((mesh, meshIndex) => {
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert(!primitive.extensions && (primitive.mode ?? 4) === 4);
    assert(primitive.indices !== undefined);
    const position = accessor(primitive.attributes.POSITION),
      index = accessor(primitive.indices);
    assert.equal(position.definition.componentType, 5126);
    assert.equal(position.width, 3);
    const local = Array.from({ length: position.definition.count }, (_, i) => position.get(i));
    const points = local.map((p) => p.map((v, k) => v * parent.scale[k] + parent.translation[k]));
    const triangles = Array.from({ length: index.definition.count / 3 }, (_, i) =>
      [0, 1, 2].map((k) => index.get(i * 3 + k)[0])
    );
    return {
      meshIndex,
      node: json.nodes[meshIndex + 1],
      primitive,
      position,
      index,
      local,
      points,
      triangles,
      usedPoints: triangles.flatMap((ids) => ids.map((i) => points[i])),
    };
  });
  assert.equal(
    meshes.reduce((s, m) => s + m.triangles.length, 0),
    SPEC.triangles
  );
  assert.equal(meshes[0].triangles.length, 132);
  assert.equal(meshes[1].triangles.length, 12);
  assert.equal(meshes[2].triangles.length, 12);
  return {
    bytes,
    json,
    binary,
    binStart,
    accessor,
    meshes,
    bounds: boundsOf(meshes.flatMap((m) => m.usedPoints)),
  };
}
function serialize(json, binary) {
  const encoded = Buffer.from(JSON.stringify(json)),
    jsonLength = (encoded.length + 3) & ~3;
  const bytes = Buffer.alloc(28 + jsonLength + binary.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.fill(0x20, 20, 20 + jsonLength);
  encoded.copy(bytes, 20);
  bytes.writeUInt32LE(binary.length, 20 + jsonLength);
  bytes.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(bytes, 28 + jsonLength);
  return bytes;
}
export function derive(input, options = {}) {
  assert.deepEqual(options, {}, 'Caller-selected transforms/selections are forbidden');
  assert.equal(
    hash(input),
    SPEC.baseline,
    'Pinned telemetry normalized baseline required; wrong or repeated derivative refused'
  );
  assert.equal(input.length, SPEC.baselineBytes);
  const before = inspect(input),
    main = before.meshes[0];
  const selected = main.triangles
    .map((ids, index) => ({ ids, index }))
    .filter((t) => t.ids.every((i) => main.points[i][1] > 5.3));
  assert.equal(selected.length, SPEC.antennaTriangles, 'Antenna ownership changed');
  const triangleIds = new Set(selected.map((t) => t.index)),
    vertices = [...new Set(selected.flatMap((t) => t.ids))].sort((a, b) => a - b);
  const selectedSet = new Set(vertices),
    antennaBefore = boundsOf(vertices.map((i) => main.points[i]));
  assert.deepEqual(
    selected.map((t) => t.index),
    Array.from({ length: 72 }, (_, i) => i + 50),
    'Pinned antenna triangles changed'
  );
  assert.deepEqual(
    vertices,
    Array.from({ length: 108 }, (_, i) => i + 100),
    'Pinned antenna vertices changed'
  );
  assert.equal(main.position.id, 3, 'Pinned POSITION accessor changed');
  for (const [k, low, high] of [
    [0, -1.2, 1.2],
    [1, 5.4, 7.6],
    [2, -1.2, 1.2],
  ]) {
    assert(
      Math.abs(antennaBefore.min[k] - low) < 1e-6 && Math.abs(antennaBefore.max[k] - high) < 1e-6,
      'Antenna metric bounds changed'
    );
  }
  for (const mesh of before.meshes)
    if (mesh.position.id === main.position.id)
      for (let i = 0; i < mesh.triangles.length; i++) {
        if (mesh.meshIndex === 0 && triangleIds.has(i)) continue;
        assert(
          mesh.triangles[i].every((v) => !selectedSet.has(v)),
          'Selected vertices shared with non-antenna triangle'
        );
      }
  const bin = Buffer.from(before.binary),
    permitted = new Set();
  for (const i of vertices) {
    const at = main.position.start + i * main.position.stride + 4,
      old = bin.readFloatLE(at);
    bin.writeFloatLE(old + SPEC.deltaY / SPEC.rootScale, at);
    assert.notEqual(bin.readFloatLE(at), old);
    for (let k = 0; k < 4; k++) permitted.add(at + k);
  }
  for (let i = 0; i < bin.length; i++)
    if (bin[i] !== before.binary[i])
      assert(permitted.has(i), 'Non-antenna POSITION-Y byte changed');
  const json = structuredClone(before.json),
    definition = json.accessors[main.position.id];
  const local = Array.from({ length: definition.count }, (_, i) =>
    [0, 1, 2].map((k) => bin.readFloatLE(main.position.start + i * main.position.stride + k * 4))
  );
  definition.min = [0, 1, 2].map((k) => Math.min(...local.map((p) => p[k])));
  definition.max = [0, 1, 2].map((k) => Math.max(...local.map((p) => p[k])));
  const bytes = serialize(json, bin),
    after = inspect(bytes),
    undoMetadata = structuredClone(after.json);
  undoMetadata.accessors[main.position.id].min = before.json.accessors[main.position.id].min;
  undoMetadata.accessors[main.position.id].max = before.json.accessors[main.position.id].max;
  assert.deepEqual(undoMetadata, before.json, 'Only selected POSITION extrema metadata may change');
  for (let m = 0; m < before.meshes.length; m++) {
    const primitive = before.meshes[m].primitive;
    for (const [semantic, id] of Object.entries(primitive.attributes))
      if (semantic !== 'POSITION') {
        const a = before.accessor(id),
          b = after.accessor(id);
        for (let i = 0; i < a.definition.count; i++)
          assert.deepEqual(b.get(i), a.get(i), 'Non-POSITION attribute changed: ' + semantic);
      }
    assert.deepEqual(
      after.meshes[m].triangles,
      before.meshes[m].triangles,
      'Index topology changed'
    );
  }
  const deltas = vertices.map((i) => after.meshes[0].points[i][1] - main.points[i][1]);
  assert(
    deltas.every((delta) => Math.abs(delta - SPEC.deltaY) < 1e-6),
    'Wrong antenna translation'
  );
  for (let m = 0; m < before.meshes.length; m++)
    for (let i = 0; i < before.meshes[m].local.length; i++) {
      if (before.meshes[m].position.id === main.position.id && selectedSet.has(i)) {
        assert.equal(after.meshes[m].local[i][0], before.meshes[m].local[i][0]);
        assert.equal(after.meshes[m].local[i][2], before.meshes[m].local[i][2]);
      } else
        assert.deepEqual(
          after.meshes[m].local[i],
          before.meshes[m].local[i],
          'Non-antenna geometry changed'
        );
    }
  assert(Math.abs(after.bounds.size[1] - SPEC.finalHeight) < 1e-6, 'Final height must be6.5m');
  for (const axis of [0, 2]) {
    assert.equal(after.bounds.min[axis], before.bounds.min[axis]);
    assert.equal(after.bounds.max[axis], before.bounds.max[axis]);
  }
  assert.equal(after.bounds.min[1], before.bounds.min[1]);
  const antennaAfter = boundsOf(vertices.map((i) => after.meshes[0].points[i]));
  const roofTop = Math.max(...after.meshes[2].usedPoints.map((p) => p[1]));
  const bottomCap = selected.filter((t) =>
    t.ids.every((i) => Math.abs(main.points[i][1] - antennaBefore.min[1]) < 1e-6)
  );
  assert.equal(bottomCap.length, 12, 'Mast base cap changed');
  const roof = boundsOf(after.meshes[2].usedPoints);
  for (const t of bottomCap)
    for (const i of t.ids) {
      const p = after.meshes[0].points[i];
      assert(Math.abs(p[1] - roofTop) < 1e-6, 'Mast cap not seated at roof plane');
      for (const k of [0, 2])
        assert(
          p[k] > roof.min[k] && p[k] < roof.max[k],
          'Mast cap outside complete rectangular roof'
        );
    }
  const area = bottomCap.reduce((total, t) => {
    const [a, b, c] = t.ids.map((i) => after.meshes[0].points[i]);
    return total + Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0])) / 2;
  }, 0);
  assert(area > 0.04 && area < 0.05, 'Unexpected base cap contact area');
  assert.equal(hash(bytes), SPEC.output, 'Accepted telemetry output identity changed');
  assert.equal(bytes.length, SPEC.outputBytes, 'Accepted telemetry output size changed');
  return {
    bytes,
    receipt: {
      method: SPEC.method,
      inputSha256: hash(input),
      outputSha256: hash(bytes),
      outputBytes: bytes.length,
      sourceInputHeightMetres: SPEC.legacyHeight,
      finalRuntimeHeightMetres: SPEC.finalHeight,
      baselineBounds: before.bounds,
      actualFinalBounds: after.bounds,
      antennaBoundsBefore: antennaBefore,
      antennaBoundsAfter: antennaAfter,
      translatedTriangleIds: selected.map((t) => t.index),
      translatedVertexIds: vertices,
      positionAccessor: main.position.id,
      actualTranslationRange: [Math.min(...deltas), Math.max(...deltas)],
      triangles: SPEC.triangles,
      translatedTriangles: selected.length,
      roofTop,
      mastBaseResidualMetres: antennaAfter.min[1] - roofTop,
      baseContactAreaXZ: area,
      positionYOnly: true,
      normalsUVColoursIndicesMapsMaterialsNodesShadowsExact: true,
      bannerAndAllNonAntennaPositionsExact: true,
      materials: 1,
      textures: 2,
      renderVertices: 468,
    },
  };
}
export function assertCurrentOutput(current, candidate) {
  assert.equal(hash(candidate), SPEC.output, 'Telemetry candidate is not the accepted output');
  assert(
    [SPEC.baseline, SPEC.output].includes(hash(current)),
    'Unexpected telemetry current output; refuse overwrite'
  );
}
