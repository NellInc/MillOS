/** Fixed final-stage derivative; no IO and no caller-selected transform or face list.
 * Apply only after the unchanged baseline normalization and indexing steps.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const SPEC = Object.freeze({
  id: 'world-cupid-authored-body',
  output: '38382051e4134c0ddd8803f03d246a2c774410b6a07cff127d7ed0876aeb9988',
  fileBytes: 93400,
  finalRuntimeHeight: 2.2792506503917576,
  rawNormalizedSha256: '48d7475f4ce74b57381274b7b8b16023d8580a95a047705589796c2c98332eb9',
  method: 'cupid-complete-figure-contact-final-stage-v1',
  asset: 'cupidAuthoredBody',
  slug: 'cupid-authored-body',
  baseline: 'aa4f24a81c8ee4965765fee4c59d42c6c7e4a8db92265e5d486d22012f67ab45',
  provider: '7c3e2b1426467f4b5cd627a671bb743d1d4134fb512b75ff620980bedebf7ec1',
  authoredAtlas: 'b52a2ceaf6d7e1adb0d204649cec7073297df174dd860b52a1e76f29e11a82d6',
  prepared: '573cc5f2132d204a54ce2d5e7409c2945faae08e8703834bfa929b04885128fa',
  sourceGeometry: '7b798925c5d1575c7d43c5c96ec2d4356174d4a1d8e6fe7e532544e7060fefb9',
  sourceReceipt: '0e9a9f402228f137910a7e79b707789e55bba1a3c017d04de5f597872059317b',
  baselineBytes: 93384,
  deltaY: -0.0507494,
  fallbackY: 1.4492506,
  normalizerTargetMetres: 2.330000028014183,
  parentNode: 0,
  figureNode: 1,
  pedestalNode: 2,
  figureMesh: 0,
  pedestalMesh: 1,
  primitive: 0,
  figurePositionAccessor: 2,
  pedestalPositionAccessor: 6,
  figureVertices: 1313,
  pedestalVertices: 132,
  figureTriangles: 1460,
  pedestalTriangles: 96,
});

export function boundsOf(points) {
  assert(points.length > 0);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const point of points)
    for (let k = 0; k < 3; k++) {
      assert(Number.isFinite(point[k]));
      min[k] = Math.min(min[k], point[k]);
      max[k] = Math.max(max[k], point[k]);
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
  const jsonBytes = bytes.subarray(20, 20 + jsonLength),
    json = JSON.parse(jsonBytes);
  const binStart = 28 + jsonLength;
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942);
  assert.equal(binStart + bytes.readUInt32LE(20 + jsonLength), bytes.length);
  const binary = bytes.subarray(binStart);
  assert.equal(json.buffers.length, 1);
  assert.equal(json.buffers[0].uri, undefined);
  assert.equal(json.buffers[0].byteLength, 90368);
  assert.equal(binary.length, 90368);
  assert.equal(json.nodes.length, 3);
  assert.equal(json.meshes.length, 2);
  assert.equal(json.accessors.length, 10);
  assert.equal(json.bufferViews.length, 5);
  assert.equal(json.materials.length, 1);
  assert.equal(json.images.length, 2);
  assert.equal(json.textures.length, 2);
  assert.equal(json.skins?.length ?? 0, 0);
  assert.equal(json.animations?.length ?? 0, 0);
  assert.equal(json.scene, 0);
  assert.equal(json.scenes.length, 1);
  assert.deepEqual(json.scenes[0].nodes, [0]);
  const parent = json.nodes[0];
  assert.equal(parent.name, 'Authored_surface_020');
  assert.deepEqual(parent.children, [1, 2]);
  assert.deepEqual(parent.scale, Array(3).fill(SPEC.normalizerTargetMetres));
  assert.deepEqual(parent.translation, [0, 1.1650000140070915, 0]);
  assert(!parent.matrix && !parent.rotation && parent.mesh === undefined);
  for (const [nodeIndex, meshIndex, receiveShadow, name] of [
    [1, 0, false, 'Cupid-authored-bodyBody'],
    [2, 1, true, 'Authored shadows true:true'],
  ]) {
    const node = json.nodes[nodeIndex];
    assert.equal(node.name, name);
    assert.equal(node.mesh, meshIndex);
    assert.deepEqual(node.extras, {
      authoredCastShadow: true,
      authoredReceiveShadow: receiveShadow,
    });
    assert(
      !node.children &&
        !node.matrix &&
        !node.translation &&
        !node.rotation &&
        !node.scale &&
        node.skin === undefined
    );
  }
  function accessor(id) {
    const definition = json.accessors[id],
      view = json.bufferViews[definition.bufferView];
    assert(definition && view && !definition.sparse);
    assert.equal(view.buffer, 0);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[definition.type];
    const type = { 5126: ['readFloatLE', 4], 5123: ['readUInt16LE', 2] }[definition.componentType];
    assert(width && type);
    const [reader, componentBytes] = type;
    const start = (view.byteOffset ?? 0) + (definition.byteOffset ?? 0);
    const stride = view.byteStride ?? width * componentBytes;
    assert(stride >= width * componentBytes);
    assert(start >= (view.byteOffset ?? 0));
    assert(
      start + (definition.count - 1) * stride + width * componentBytes <=
        (view.byteOffset ?? 0) + view.byteLength
    );
    assert((view.byteOffset ?? 0) + view.byteLength <= binary.length);
    return {
      id,
      definition,
      width,
      start,
      stride,
      componentBytes,
      read: (row) =>
        Array.from({ length: width }, (_, k) =>
          binary[reader](start + row * stride + k * componentBytes)
        ),
      byteOffsets: (row) =>
        Array.from({ length: width * componentBytes }, (_, k) => start + row * stride + k),
    };
  }
  const meshes = json.meshes.map((mesh, meshIndex) => {
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert.equal(primitive.mode, 4);
    assert.equal(primitive.material, 0);
    assert(!primitive.extensions && !primitive.targets);
    const base = meshIndex === 0 ? 2 : 6;
    assert.deepEqual(primitive.attributes, {
      POSITION: base,
      TEXCOORD_0: base + 1,
      NORMAL: base + 2,
      COLOR_0: base + 3,
    });
    assert.equal(primitive.indices, meshIndex);
    const position = accessor(base),
      index = accessor(primitive.indices);
    assert.equal(position.definition.componentType, 5126);
    assert.equal(position.width, 3);
    assert.equal(position.definition.normalized, undefined);
    assert.equal(
      position.definition.count,
      meshIndex === 0 ? SPEC.figureVertices : SPEC.pedestalVertices
    );
    assert.equal(
      index.definition.count,
      (meshIndex === 0 ? SPEC.figureTriangles : SPEC.pedestalTriangles) * 3
    );
    const local = Array.from({ length: position.definition.count }, (_, i) => position.read(i));
    const points = local.map((point) =>
      point.map((v, k) => v * parent.scale[k] + parent.translation[k])
    );
    const triangles = Array.from({ length: index.definition.count / 3 }, (_, i) =>
      [0, 1, 2].map((k) => index.read(i * 3 + k)[0])
    );
    const referenced = new Set(triangles.flat());
    assert.equal(referenced.size, position.definition.count, 'Unexpected unreferenced vertices');
    assert(
      [...referenced].every((i) => Number.isInteger(i) && i >= 0 && i < position.definition.count)
    );
    return {
      meshIndex,
      primitive,
      position,
      index,
      local,
      points,
      triangles,
      bounds: boundsOf(points),
      localBounds: boundsOf(local),
    };
  });
  const images = json.images.map((image) => {
    const view = json.bufferViews[image.bufferView];
    assert(!image.uri);
    const imageBytes = binary.subarray(
      view.byteOffset ?? 0,
      (view.byteOffset ?? 0) + view.byteLength
    );
    return {
      name: image.name,
      mimeType: image.mimeType,
      bytes: imageBytes.length,
      sha256: hash(imageBytes),
    };
  });
  return {
    bytes,
    jsonBytes,
    jsonLength,
    json,
    binStart,
    binary,
    parent,
    accessor,
    meshes,
    images,
    bounds: boundsOf(meshes.flatMap((mesh) => mesh.points)),
  };
}

function pack(json, binary) {
  const compact = Buffer.from(JSON.stringify(json)),
    jsonLength = Math.ceil(compact.length / 4) * 4;
  const result = Buffer.alloc(28 + jsonLength + binary.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(0x20, 20, 20 + jsonLength);
  compact.copy(result, 20);
  result.writeUInt32LE(binary.length, 20 + jsonLength);
  result.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(result, 28 + jsonLength);
  return result;
}

export function derive(input, options = {}) {
  assert.deepEqual(options, {}, 'Caller-selected transforms are forbidden');
  assert.equal(
    hash(input),
    SPEC.baseline,
    'Pinned normalized baseline required; altered and already-derived inputs are refused'
  );
  assert.equal(input.length, SPEC.baselineBytes);
  const before = inspect(input),
    figure = before.meshes[SPEC.figureMesh],
    binary = Buffer.from(before.binary);
  const permitted = new Set(),
    selectedVertices = Array.from({ length: SPEC.figureVertices }, (_, i) => i);
  // Ownership follows scene 0 -> node 0 -> node 1 -> mesh 0 -> primitive 0 -> POSITION accessor 2.
  // No geometric or bounding-box heuristic decides which vertices may move.
  for (const i of selectedVertices) {
    const offset = figure.position.start + i * figure.position.stride + 4;
    for (let k = 0; k < 4; k++) permitted.add(offset + k);
  }
  for (let accessorId = 0; accessorId < before.json.accessors.length; accessorId++) {
    if (accessorId === SPEC.figurePositionAccessor) continue;
    const accessor = before.accessor(accessorId);
    for (let row = 0; row < accessor.definition.count; row++)
      for (const offset of accessor.byteOffsets(row)) {
        assert(!permitted.has(offset), 'Selected Y bytes alias a different accessor');
      }
  }
  for (const image of before.json.images) {
    const view = before.json.bufferViews[image.bufferView];
    for (let i = view.byteOffset ?? 0; i < (view.byteOffset ?? 0) + view.byteLength; i++)
      assert(!permitted.has(i), 'Selected Y bytes alias an image');
  }
  for (const i of selectedVertices) {
    const offset = figure.position.start + i * figure.position.stride + 4;
    const oldY = binary.readFloatLE(offset);
    binary.writeFloatLE(oldY + SPEC.deltaY / before.parent.scale[1], offset);
    assert.notEqual(binary.readFloatLE(offset), oldY, 'A complete-figure vertex did not move');
  }
  let changedBinaryBytes = 0;
  for (let i = 0; i < binary.length; i++)
    if (binary[i] !== before.binary[i]) {
      assert(permitted.has(i), 'Non-selected binary byte changed');
      changedBinaryBytes++;
    }
  assert(changedBinaryBytes > 0);
  const afterLocalY = selectedVertices.map((i) =>
    binary.readFloatLE(figure.position.start + i * figure.position.stride + 4)
  );
  const json = structuredClone(before.json);
  json.accessors[SPEC.figurePositionAccessor].min[1] = Math.min(...afterLocalY);
  json.accessors[SPEC.figurePositionAccessor].max[1] = Math.max(...afterLocalY);
  const result = pack(json, binary),
    after = inspect(result);
  const restoredJSON = structuredClone(after.json);
  restoredJSON.accessors[2].min[1] = before.json.accessors[2].min[1];
  restoredJSON.accessors[2].max[1] = before.json.accessors[2].max[1];
  assert.deepEqual(
    restoredJSON,
    before.json,
    'Only the selected accessor Y extrema may change in JSON'
  );
  assert.deepEqual(after.images, before.images);
  assert.deepEqual(after.meshes[1].points, before.meshes[1].points, 'Pedestal moved');
  assert.deepEqual(after.meshes[1].localBounds, before.meshes[1].localBounds);
  let maximumMetricError = 0;
  for (const i of selectedVertices)
    for (let k = 0; k < 3; k++) {
      if (k !== 1)
        assert.equal(after.meshes[0].local[i][k], figure.local[i][k], 'Figure X/Z changed');
      const error = Math.abs(
        after.meshes[0].points[i][k] - figure.points[i][k] - (k === 1 ? SPEC.deltaY : 0)
      );
      maximumMetricError = Math.max(maximumMetricError, error);
      assert(error < 1e-7, 'Metric displacement exceeds float32 tolerance');
    }
  for (let meshIndex = 0; meshIndex < 2; meshIndex++) {
    const mesh = after.meshes[meshIndex],
      accessor = mesh.position.definition;
    assert.deepEqual(
      accessor.min,
      mesh.localBounds.min,
      'Accessor min must match actual final float32 positions'
    );
    assert.deepEqual(
      accessor.max,
      mesh.localBounds.max,
      'Accessor max must match actual final float32 positions'
    );
  }
  assert.equal(after.bounds.min[1], before.bounds.min[1]);
  for (const k of [0, 2]) {
    assert.equal(after.bounds.min[k], before.bounds.min[k]);
    assert.equal(after.bounds.max[k], before.bounds.max[k]);
  }
  assert(Math.abs(after.bounds.size[1] - before.bounds.size[1] - SPEC.deltaY) < 1e-7);
  assert.equal(hash(result), SPEC.output, 'Reviewed Cupid derivative identity changed');
  assert.equal(result.length, SPEC.fileBytes, 'Reviewed Cupid derivative byte length changed');
  assert.equal(
    after.bounds.size[1],
    SPEC.finalRuntimeHeight,
    'Reviewed Cupid final height changed'
  );
  return {
    bytes: result,
    receipt: {
      actualFinalBounds: after.bounds,
      legacyPreDerivationSizingMetres: SPEC.normalizerTargetMetres,
      finalRuntimeHeightMetres: SPEC.finalRuntimeHeight,
      triangles: 1556,
      renderVertices: 4668,
      indexedVertices: 1445,
      materials: 1,
      textures: 2,
      method: SPEC.method,
      inputSha256: SPEC.baseline,
      outputSha256: hash(result),
      selection: {
        scene: 0,
        parentNode: 0,
        node: 1,
        mesh: 0,
        primitive: 0,
        semantic: 'POSITION',
        accessor: 2,
        indexedVertices: SPEC.figureVertices,
        triangles: SPEC.figureTriangles,
        selectedVertices,
        entireOwnedFigure: true,
        geometricSelectionHeuristic: false,
      },
      metricDeltaY: SPEC.deltaY,
      normalizedDeltaY: SPEC.deltaY / before.parent.scale[1],
      maximumMetricError,
      actualParentTransform: { translation: before.parent.translation, scale: before.parent.scale },
      allowedBinaryOffsets: {
        origin: 'BIN chunk relative',
        firstY: figure.position.start + 4,
        vertexStride: figure.position.stride,
        vertexCount: SPEC.figureVertices,
        bytesPerY: 4,
      },
      changedBinaryBytes,
      allOtherBinaryBytesExact: true,
      binaryChunkLengthUnchanged: true,
      jsonChanges: [
        {
          path: '/accessors/2/min/1',
          before: before.json.accessors[2].min[1],
          after: after.json.accessors[2].min[1],
        },
        {
          path: '/accessors/2/max/1',
          before: before.json.accessors[2].max[1],
          after: after.json.accessors[2].max[1],
        },
      ],
      allOtherJSONValuesExact: true,
      jsonReserialized: true,
      bytesBefore: input.length,
      bytesAfter: result.length,
      fileSizeDelta: result.length - input.length,
      jsonChunkBytesBefore: before.jsonLength,
      jsonChunkBytesAfter: after.jsonLength,
      binStartBefore: before.binStart,
      binStartAfter: after.binStart,
      boundsBefore: before.bounds,
      boundsAfter: after.bounds,
      figureBoundsBefore: figure.bounds,
      figureBoundsAfter: after.meshes[0].bounds,
      pedestalBoundsUnchanged: after.meshes[1].bounds,
      resourceCounts: {
        meshes: 2,
        primitives: 2,
        triangles: 1556,
        indexedVertices: 1445,
        materials: 1,
        textures: 2,
        skins: 0,
        animations: 0,
      },
      images: after.images,
      shadowFlagsUnchanged: true,
      metadata: {
        sizedBy: 'height',
        baselineTargetMetres: SPEC.normalizerTargetMetres,
        actualFinalBounds: after.bounds,
        actualFinalHeightMetres: after.bounds.size[1],
        actualNormalizedBounds: {
          width: after.bounds.size[0],
          height: after.bounds.size[1],
          length: after.bounds.size[2],
          minY: after.bounds.min[1],
          centreX: (after.bounds.min[0] + after.bounds.max[0]) / 2,
          centreZ: (after.bounds.min[2] + after.bounds.max[2]) / 2,
        },
        finalStageOrder:
          'Normalize and index the immutable prepared source to the unchanged baseline target; then apply this fixed derivative and report actual final bounds.',
        genericSizingChange: false,
        actualHeightMustNotBeRenormalizedToBaselineTarget: true,
      },
    },
  };
}

export function assertSourceInputs(provider, prepared) {
  assert.equal(hash(provider), SPEC.provider, 'Immutable Cupid provider input drift');
  assert.equal(hash(prepared), SPEC.prepared, 'Immutable Cupid prepared input drift');
}

/** The real normalizer differs from the sealed delivery only in this generator
 * string. Both entire streams are pinned; this never admits arbitrary metadata,
 * changed geometry, changed maps, a canonical baseline, or a reviewed derivative.
 */
export function canonicalizeNormalizedBaseline(input, options = {}) {
  assert.deepEqual(options, {}, 'Caller-selected canonicalization is forbidden');
  assert.equal(hash(input), SPEC.rawNormalizedSha256, 'Pinned raw normalized Cupid input required');
  const before = inspect(input),
    json = structuredClone(before.json);
  assert.equal(json.asset.generator, 'MillOS generated-asset pipeline, glTF-Transform v4.4.2');
  json.asset.generator = 'glTF-Transform v4.4.2';
  const result = pack(json, before.binary);
  assert.equal(hash(result), SPEC.baseline, 'Canonical Cupid baseline identity changed');
  assert.equal(result.length, SPEC.baselineBytes);
  const after = inspect(result),
    restored = structuredClone(after.json);
  restored.asset.generator = before.json.asset.generator;
  assert.deepEqual(restored, before.json, 'Only the fixed generator value may change');
  assert(after.binary.equals(before.binary), 'Canonicalization changed binary bytes');
  return result;
}

export function assertCurrentOutput(current, candidate) {
  assert.equal(hash(candidate), SPEC.output, 'Unreviewed Cupid derivative');
  assert(
    [SPEC.baseline, SPEC.output].includes(hash(current)),
    'Current Cupid output is neither baseline nor reviewed derivative'
  );
}
