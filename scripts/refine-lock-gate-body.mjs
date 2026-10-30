/** Fixed final-stage closed-pose lock body derivative. Pure bytes; no IO.
 * The source restoration, legacy normalization and indexing finish before this
 * stage. The companion generated-only wrapper is [0,-.75,0]. Never renormalize
 * the indexed final body or apply this operation to its own output.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const SPEC = Object.freeze({
  id: 'world-lock-gate-structure',
  method: 'lock-gate-remove-isolated-arm-paired-origin-final-stage-v1',
  baseline: 'd60bc4899b1f29d6cc26cf3866e310d442d29289851952044e5ad1059d686a20',
  baselineBytes: 24924,
  rawNormalized: '02b64cc74e538efb68f32548256b6839e182ca1079cf0e934bb3b70a6aa147ab',
  output: '342fb81325a193f4ee3a4d3587e08064f9f50183239c0e54d5c616ed8d4bdd43',
  outputBytes: 24920,
  provider: '6b5db445e4b0e1e2bd1b62938b9369560d441b04405ef7c93df00a8aafe001ba',
  prepared: '4dec42f8701d358a768143cbdf3894c3113646db02a4b99d07a9360cb87615a9',
  authoredAtlas: 'cd92e0f9bc5cef149d6d45500ab9a4099d04c841e6c1729900d4d22bc4b0e69f',
  sourceGeometry: 'dd9428f86e33e5c57367dac17d89f4b5a532d83dad31aaee4355c499c1d39297',
  sourceReceipt: '47f3861ecfb6abc190d2ccc374fb359e757a5d75721382e93155bdd80648102c',
  targetHeight: 3.825000047683716,
  nodeZBefore: 8.568167686462402e-8,
  nodeZAfter: -1.748747914318323,
  wrapperBefore: [0, -0.75, -1.748748],
  wrapperAfter: [0, -0.75, 0],
  removedTriangleFirst: 50,
  removedTriangleLast: 61,
  originalIndexCount: 216,
  finalIndexCount: 180,
  positionCount: 144,
  indexBufferBytes: 432,
  attributeBufferBytes: 6336,
  expectedLength: 1.0000001043081284,
});

export function unpack(input) {
  const bytes = Buffer.from(input);
  assert(bytes.length >= 28, 'Truncated lock GLB');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Binary glTF required');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version drift');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB file length drift');
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'JSON chunk required');
  assert.equal(jsonLength % 4, 0, 'JSON padding alignment');
  assert(28 + jsonLength <= bytes.length, 'Truncated chunks');
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  const binaryLength = bytes.readUInt32LE(20 + jsonLength);
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942, 'BIN chunk required');
  const binStart = 28 + jsonLength;
  assert.equal(binStart + binaryLength, bytes.length, 'Unexpected trailing GLB chunk');
  const binary = bytes.subarray(binStart);
  return { bytes, json, binary, jsonLength, binStart };
}

export function pack(json, binary) {
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 0x20);
  encoded.copy(padded);
  const bytes = Buffer.alloc(28 + padded.length + binary.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(bytes, 20);
  bytes.writeUInt32LE(binary.length, 20 + padded.length);
  bytes.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(bytes, 28 + padded.length);
  return bytes;
}

export function boundsOf(points) {
  assert(points.length, 'Empty bounds');
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const point of points)
    for (let axis = 0; axis < 3; axis++) {
      assert(Number.isFinite(point[axis]), 'Nonfinite lock position');
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

/** Explicit hierarchy guard also called independently by mutation tests. */
export function inspect(input, final = false) {
  const parsed = unpack(input),
    { json, binary } = parsed;
  assert.equal(json.scene, 0, 'Unexpected default scene');
  assert.equal(json.scenes.length, 1, 'Exactly one scene required');
  assert.deepEqual(json.scenes[0].nodes, [0], 'Only node zero may be a scene root');
  assert.equal(json.nodes.length, 1, 'Exactly one node required');
  assert.equal(json.meshes.length, 1, 'Exactly one mesh required');
  const node = json.nodes[0];
  assert.equal(node.mesh, 0, 'Expected root mesh zero');
  assert.equal(node.name, 'Lock-gate-structureBody');
  for (const key of ['children', 'rotation', 'matrix', 'skin', 'weights'])
    assert.equal(node[key], undefined, 'Unexpected node ' + key);
  assert.deepEqual(node.scale, [11.5, 11.5, 11.5], 'Unexpected root scale');
  assert.deepEqual(
    node.translation,
    [0, 1.912500023841858, final ? SPEC.nodeZAfter : SPEC.nodeZBefore],
    'Unexpected root translation'
  );
  for (const key of ['animations', 'skins'])
    assert.equal(json[key]?.length ?? 0, 0, 'Unexpected ' + key);
  assert.equal(json.meshes[0].primitives.length, 1);
  const primitive = json.meshes[0].primitives[0];
  assert.equal(primitive.mode, 4);
  assert.equal(primitive.material, 0);
  assert.equal(primitive.indices, 0);
  assert.equal(primitive.targets, undefined);
  assert.deepEqual(primitive.attributes, { POSITION: 1, TEXCOORD_0: 2, NORMAL: 3, COLOR_0: 4 });
  assert.equal(json.materials.length, 1);
  assert.equal(json.images.length, 2);
  assert.equal(json.textures.length, 2);
  assert.equal(json.accessors.length, 5);
  assert.equal(json.bufferViews.length, 4);
  assert.deepEqual(json.buffers, [{ byteLength: 23016 }]);
  assert.equal(binary.length, 23016);
  assert.deepEqual(json.bufferViews[2], {
    buffer: 0,
    byteOffset: 0,
    byteLength: 432,
    target: 34963,
  });
  assert.deepEqual(json.bufferViews[3], {
    buffer: 0,
    byteOffset: 432,
    byteLength: 6336,
    byteStride: 44,
    target: 34962,
  });
  const indexCount = final ? 180 : 216;
  assert.deepEqual(json.accessors[0], {
    type: 'SCALAR',
    componentType: 5123,
    count: indexCount,
    bufferView: 2,
    byteOffset: 0,
  });
  for (let i = 1; i < 5; i++) {
    const accessor = json.accessors[i];
    assert.equal(accessor.count, 144);
    assert.equal(accessor.componentType, 5126);
    assert.equal(accessor.bufferView, 3);
    assert.equal(accessor.sparse, undefined);
    assert.equal(accessor.byteOffset, [0, 0, 12, 20, 32][i]);
  }
  const indices = Array.from({ length: indexCount }, (_, i) => binary.readUInt16LE(i * 2));
  assert(
    indices.every((index) => index < 144),
    'Index outside preserved attributes'
  );
  const localPoints = Array.from({ length: 144 }, (_, row) =>
    [0, 1, 2].map((axis) => binary.readFloatLE(432 + row * 44 + axis * 4))
  );
  const points = localPoints.map((point) =>
    point.map((value, axis) => value * node.scale[axis] + node.translation[axis])
  );
  return {
    ...parsed,
    node,
    primitive,
    indices,
    localPoints,
    points,
    indexedBounds: boundsOf(indices.map((index) => points[index])),
    conservativeBounds: boundsOf(points),
    images: json.images.map((image) => {
      const view = json.bufferViews[image.bufferView];
      return {
        name: image.name,
        bytes: view.byteLength,
        sha256: hash(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)),
      };
    }),
  };
}

export function assertSourceInputs(provider, prepared) {
  assert.equal(hash(provider), SPEC.provider, 'Immutable lock provider input drift');
  assert.equal(hash(prepared), SPEC.prepared, 'Immutable lock prepared input drift');
}

/** The normalizer's generator-only metadata delta is a separately pinned input.
 * No arbitrary normalizer stream or already-derived file is accepted here. */
export function canonicalizeNormalizedBaseline(input, options = {}) {
  assert.deepEqual(options, {}, 'Caller-selected canonicalization is forbidden');
  assert.equal(hash(input), SPEC.rawNormalized, 'Pinned raw normalized lock input required');
  const before = inspect(input),
    json = structuredClone(before.json);
  assert.equal(json.asset.generator, 'MillOS generated-asset pipeline, glTF-Transform v4.4.2');
  json.asset.generator = 'glTF-Transform v4.4.2';
  const bytes = pack(json, before.binary);
  assert.equal(hash(bytes), SPEC.baseline, 'Canonical lock baseline identity changed');
  assert.equal(bytes.length, SPEC.baselineBytes);
  assert(unpack(bytes).binary.equals(before.binary), 'Generator canonicalization changed BIN');
  return bytes;
}

export function derive(input, options = {}) {
  assert.deepEqual(options, {}, 'Lock derivative does not accept caller-selected operations');
  assert.equal(hash(input), SPEC.baseline, 'Pinned lock baseline mismatch or double application');
  assert.equal(input.length, SPEC.baselineBytes);
  const before = inspect(input);
  const removedTriangleIds = Array.from({ length: 12 }, (_, i) => i + 50);
  const armOnlyUnreferencedVertexIds = Array.from({ length: 24 }, (_, i) => i + 100);
  const armVertices = new Set(armOnlyUnreferencedVertexIds),
    seenArm = new Set();
  const retained = [];
  for (let triangle = 0; triangle < 72; triangle++) {
    const corners = before.indices.slice(triangle * 3, triangle * 3 + 3);
    if (triangle >= 50 && triangle <= 61) {
      assert(
        corners.every((index) => armVertices.has(index)),
        'Old arm ownership mismatch'
      );
      corners.forEach((index) => seenArm.add(index));
    } else {
      assert(
        corners.every((index) => !armVertices.has(index)),
        'Retained triangle shares an arm vertex'
      );
      retained.push(...corners);
    }
  }
  assert.deepEqual(
    [...seenArm].sort((a, b) => a - b),
    armOnlyUnreferencedVertexIds
  );
  assert.equal(retained.length, 180);
  const json = structuredClone(before.json),
    binary = Buffer.from(before.binary);
  retained.forEach((index, word) => binary.writeUInt16LE(index, word * 2));
  json.accessors[0].count = 180;
  json.nodes[0].translation[2] = SPEC.nodeZAfter;
  const bytes = pack(json, binary),
    after = inspect(bytes, true);
  assert.equal(hash(bytes), SPEC.output, 'Lock derivative output identity changed');
  assert.equal(bytes.length, SPEC.outputBytes);
  assert.deepEqual(after.indices, retained, 'Retained triangle order drifted');
  // Prefix 0..149 already matches. Only the compacted 30 words at 150..179
  // can change; the unused tail 180..215 and every other BIN byte remain exact.
  let changedBinaryBytes = 0;
  for (let offset = 0; offset < binary.length; offset++)
    if (binary[offset] !== before.binary[offset]) {
      assert(offset >= 300 && offset < 360, 'Unexpected BIN change at ' + offset);
      changedBinaryBytes++;
    }
  const restored = structuredClone(after.json);
  restored.accessors[0].count = 216;
  restored.nodes[0].translation[2] = SPEC.nodeZBefore;
  assert.deepEqual(restored, before.json, 'Unexpected JSON value change');
  assert.deepEqual(after.images, before.images, 'Embedded map change');
  assert.equal(after.indexedBounds.size[2], SPEC.expectedLength);
  let maximumSurvivingWorldDelta = 0;
  for (const index of retained)
    for (let axis = 0; axis < 3; axis++) {
      const old = before.points[index][axis] + SPEC.wrapperBefore[axis];
      const next = after.points[index][axis] + SPEC.wrapperAfter[axis];
      maximumSurvivingWorldDelta = Math.max(maximumSurvivingWorldDelta, Math.abs(old - next));
    }
  assert.equal(
    maximumSurvivingWorldDelta,
    0,
    'Paired wrapper fails surviving live-coordinate equality'
  );
  return {
    bytes,
    receipt: {
      method: SPEC.method,
      inputSha256: SPEC.baseline,
      outputSha256: SPEC.output,
      bytesBefore: input.length,
      bytesAfter: bytes.length,
      removedTriangleIds,
      armOnlyUnreferencedVertexIds,
      indicesBefore: 216,
      indicesAfter: 180,
      retainedTriangleOrderExact: true,
      exclusiveArmOwnership: true,
      actualHierarchy: {
        scene: 0,
        sceneNodes: [0],
        node: 0,
        mesh: 0,
        primitive: 0,
        nodeCount: 1,
        meshCount: 1,
        rotationOrMatrixOrChildren: false,
        scale: before.node.scale,
        translationBefore: before.node.translation,
        translationAfter: after.node.translation,
      },
      pairedWrapperBefore: SPEC.wrapperBefore,
      pairedWrapperAfter: SPEC.wrapperAfter,
      maximumSurvivingWorldDelta,
      actualFinalBounds: after.indexedBounds,
      indexedBoundsBefore: before.indexedBounds,
      conservativeUnusedPositionBounds: after.conservativeBounds,
      conservativeBoundsAreNotVisibleIndexedBounds: true,
      jsonChanges: [
        { path: '/accessors/0/count', before: 216, after: 180 },
        { path: '/nodes/0/translation/2', before: SPEC.nodeZBefore, after: SPEC.nodeZAfter },
      ],
      jsonChunkBytesBefore: before.jsonLength,
      jsonChunkBytesAfter: after.jsonLength,
      binStartBefore: before.binStart,
      binStartAfter: after.binStart,
      binaryChunkBytes: binary.length,
      changedBinaryBytes,
      allowedChangedBINByteRange: [300, 360],
      unusedIndexTailExact: true,
      attributesImagesMaterialsBINRelativeOffsetsExact: true,
      allOtherJSONValuesExact: true,
      structuralGeometryBytes: 6768,
      structuralRenderVertexCap: 216,
      triangles: 60,
      renderVertices: 180,
      storedPositions: 144,
      meshes: 1,
      materials: 1,
      textures: 2,
      textureBytes: 16236,
      images: after.images,
      finalStageOrder:
        'Immutable prepared source; legacy sizing, normalization and indexing; generator-only canonicalization; arm-index removal and paired origin. Never normalize the final body again.',
      nativeAppearanceAcceptance: false,
    },
  };
}

export function assertCurrentOutput(current, candidate) {
  assert.equal(hash(candidate), SPEC.output, 'Unreviewed lock candidate');
  assert.equal(candidate.length, SPEC.outputBytes);
  assert(
    [SPEC.baseline, SPEC.output].includes(hash(current)),
    'Unexpected current lock output; refuse overwrite'
  );
}

/** Provenance must consume the actual final file and the complete producer receipt. */
export function assertFinalNormalization(spec, result, current, baseline) {
  const expected = derive(baseline).receipt;
  assert.equal(spec.id, SPEC.id);
  assert.equal(spec.axis, 'y');
  assert.equal(spec.target, SPEC.targetHeight);
  assert.equal(spec.slug, 'lock-gate-structure');
  assert.equal(hash(current), SPEC.output, 'Stale lock current delivery');
  assert.equal(current.length, SPEC.outputBytes);
  assert.deepEqual(result.geometryRefinement, expected, 'Stale lock final-stage receipt');
  const b = expected.actualFinalBounds;
  assert.deepEqual(
    result.bounds,
    {
      width: Number(b.size[0].toFixed(4)),
      height: Number(b.size[1].toFixed(4)),
      length: Number(b.size[2].toFixed(4)),
      minY: Number(b.min[1].toFixed(5)),
      centreX: Number(((b.min[0] + b.max[0]) / 2).toFixed(5)),
      centreZ: Number(((b.min[2] + b.max[2]) / 2).toFixed(5)),
    },
    'Stale lock normalized bounds'
  );
  const required = {
    id: SPEC.id,
    file: 'world/lock-gate-structure.glb',
    bodyNode: 'Lock-gate-structureBody',
    sourceSha256: SPEC.provider,
    outputSha256: SPEC.output,
    outputBytes: SPEC.outputBytes,
    scaleFactor: 11.5,
    facingYaw: 0,
    materials: 1,
    textures: 2,
    textureBytes: 16236,
    renderVertices: 180,
    joints: 0,
  };
  for (const [key, value] of Object.entries(required))
    assert.equal(result[key], value, 'Stale lock row ' + key);
  assert.equal(result.blenderPreparation?.sha256, SPEC.prepared, 'Stale lock prepared source');
}
