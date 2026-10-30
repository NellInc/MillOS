/** Fixed telemetry banner stage after the unchanged antenna producer. No IO. */
import assert from 'node:assert/strict';
import { inspect, boundsOf, hash, SPEC as ANTENNA } from './refine-telemetry-antenna.mjs';

export const SPEC = Object.freeze({
  method: 'telemetry-complete-banner-wall-seating-post-antenna-v1',
  input: 'a313535e9e0f67476fc92468d5a8c180d569dc1d3dcb9a9b57af0e22c370dc93',
  inputBytes: 37756,
  output: 'e978d789b8bdd5df9d7aeebc40701a4a7dca461d0a7fdd672acb6a2e85504802',
  outputBytes: 37756,
  deltaZ: -0.15,
  triangles: 12,
  vertices: 24,
  positionAccessor: 3,
  boundsBefore: { min: [-2.4, 3.175, 3.14], max: [2.4, 3.825, 3.26] },
  boundsAfter: { min: [-2.4, 3.175, 2.99], max: [2.4, 3.825, 3.11] },
});
export { inspect, boundsOf, hash };
const near = (a, b, why) => assert(Math.abs(a - b) < 1e-6, why);
function assertBounds(actual, expected, why) {
  for (const side of ['min', 'max'])
    for (let k = 0; k < 3; k++) near(actual[side][k], expected[side][k], why);
}

/** Select the complete six-face authored box, never a plane or a bounding-box slice. */
export function bannerOwnership(body, expected = SPEC.boundsBefore) {
  const main = body.meshes[0];
  assert.equal(main.node.name, 'Yard-telemetry-bodyBody');
  assert.equal(main.position.id, SPEC.positionAccessor);
  const selected = main.triangles
    .map((ids, index) => ({ ids, index }))
    .filter(({ ids }) =>
      ids.every((i) =>
        main.points[i].every((v, k) => v >= expected.min[k] - 1e-6 && v <= expected.max[k] + 1e-6)
      )
    );
  assert.equal(selected.length, SPEC.triangles, 'Complete twelve-triangle banner required');
  const vertices = [...new Set(selected.flatMap((t) => t.ids))].sort((a, b) => a - b);
  assert.equal(vertices.length, SPEC.vertices, 'Complete twenty-four-entry box required');
  const vertexSet = new Set(vertices),
    triangleSet = new Set(selected.map((t) => t.index));
  for (const mesh of body.meshes)
    if (mesh.position.id === main.position.id)
      for (let i = 0; i < mesh.triangles.length; i++) {
        if (mesh === main && triangleSet.has(i)) continue;
        assert(
          mesh.triangles[i].every((v) => !vertexSet.has(v)),
          'Banner shares non-banner positions'
        );
      }
  // Every face owns exactly two triangles on one of the six box planes.
  for (let k = 0; k < 3; k++)
    for (const side of ['min', 'max'])
      assert.equal(
        selected.filter((t) =>
          t.ids.every((i) => Math.abs(main.points[i][k] - expected[side][k]) < 1e-6)
        ).length,
        2,
        'Missing or extra banner box face'
      );
  const bounds = boundsOf(vertices.map((i) => main.points[i]));
  assertBounds(bounds, expected, 'Banner metric envelope changed');
  return { selected, vertices, bounds };
}

// Same minimal GLB serialization as the existing antenna producer; no optimizer.
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

export function deriveBanner(input, options = {}) {
  assert.deepEqual(options, {}, 'Caller-selected banner transforms forbidden');
  assert.equal(hash(input), SPEC.input, 'Exact accepted post-antenna input required');
  assert.equal(input.length, SPEC.inputBytes);
  assert.equal(ANTENNA.output, SPEC.input, 'Antenna stage identity changed');
  const before = inspect(input),
    main = before.meshes[0];
  const owned = bannerOwnership(before),
    selected = new Set(owned.vertices);
  const binary = Buffer.from(before.binary),
    allowed = new Set();
  for (const i of owned.vertices) {
    const at = main.position.start + i * main.position.stride + 8;
    binary.writeFloatLE(binary.readFloatLE(at) + SPEC.deltaZ / ANTENNA.rootScale, at);
    for (let k = 0; k < 4; k++) allowed.add(at + k);
  }
  const json = structuredClone(before.json),
    accessor = json.accessors[SPEC.positionAccessor];
  // X/Y remain exact. Recompute the entire accessor's truthful Z extrema.
  const values = Array.from({ length: accessor.count }, (_, i) =>
    binary.readFloatLE(main.position.start + i * main.position.stride + 8)
  );
  accessor.min[2] = Math.min(...values);
  accessor.max[2] = Math.max(...values);
  const bytes = serialize(json, binary),
    after = inspect(bytes),
    moved = bannerOwnership(after, SPEC.boundsAfter);
  assert.deepEqual(moved.vertices, owned.vertices);
  assert.deepEqual(
    moved.selected.map((t) => t.index),
    owned.selected.map((t) => t.index)
  );
  assert.equal(before.binary.length, after.binary.length);
  let changedBytes = 0;
  for (let i = 0; i < binary.length; i++)
    if (after.binary[i] !== before.binary[i]) {
      assert(allowed.has(i), 'Non-banner POSITION-Z byte changed');
      changedBytes++;
    }
  assert(changedBytes > 0);
  const undo = structuredClone(after.json);
  undo.accessors[SPEC.positionAccessor].min[2] =
    before.json.accessors[SPEC.positionAccessor].min[2];
  undo.accessors[SPEC.positionAccessor].max[2] =
    before.json.accessors[SPEC.positionAccessor].max[2];
  assert.deepEqual(undo, before.json, 'Unrelated GLB JSON changed');
  const deltas = [];
  for (let m = 0; m < before.meshes.length; m++) {
    assert.deepEqual(after.meshes[m].triangles, before.meshes[m].triangles);
    for (let i = 0; i < before.meshes[m].local.length; i++) {
      const old = before.meshes[m].local[i],
        now = after.meshes[m].local[i];
      if (m === 0 && selected.has(i)) {
        assert.equal(now[0], old[0]);
        assert.equal(now[1], old[1]);
        const delta = after.meshes[m].points[i][2] - before.meshes[m].points[i][2];
        near(delta, SPEC.deltaZ, 'Wrong world-metre banner delta');
        deltas.push(delta);
      } else assert.deepEqual(now, old, 'Non-banner geometry changed');
    }
  }
  assert.deepEqual(after.bounds, before.bounds, 'Complete fixture bounds changed');
  const wall = boundsOf(after.meshes[1].usedPoints);
  near(wall.max[2], 3, 'Wall attachment face changed');
  near(wall.max[2] - moved.bounds.min[2], 0.01, 'Ten-millimetre wall overlap required');
  for (const k of [0, 1]) {
    assert(moved.bounds.min[k] > wall.min[k]);
    assert(moved.bounds.max[k] < wall.max[k]);
  }
  // Antenna positions are independently pinned by the historical accepted stage.
  for (let i = 100; i <= 207; i++)
    assert.deepEqual(after.meshes[0].local[i], before.meshes[0].local[i]);
  const result = {
    bytes,
    receipt: {
      method: SPEC.method,
      inputSha256: hash(input),
      outputSha256: hash(bytes),
      inputBytes: input.length,
      outputBytes: bytes.length,
      binaryBytes: binary.length,
      translatedTriangleIds: owned.selected.map((t) => t.index),
      translatedVertexIds: owned.vertices,
      translatedTriangles: owned.selected.length,
      positionAccessor: SPEC.positionAccessor,
      deltaZ: SPEC.deltaZ,
      actualDeltaRange: [Math.min(...deltas), Math.max(...deltas)],
      bannerBoundsBefore: owned.bounds,
      bannerBoundsAfter: moved.bounds,
      wallBounds: wall,
      wallOverlapMetres: wall.max[2] - moved.bounds.min[2],
      fullBoundsBefore: before.bounds,
      fullBoundsAfter: after.bounds,
      fullFixtureBoundsExact: true,
      nonBannerBinaryExact: true,
      antennaPositionEntriesExact: true,
      normalsUVColoursIndicesMapsMaterialsNodesShadowsExact: true,
      changedPositionBytes: changedBytes,
      permittedPositionBytes: allowed.size,
      triangles: ANTENNA.triangles,
      materials: json.materials.length,
      textures: json.textures.length,
      meshes: json.meshes.length,
      nodes: json.nodes.length,
      priorAntennaStage: {
        method: ANTENNA.method,
        outputSha256: ANTENNA.output,
        finalHeight: ANTENNA.finalHeight,
        preservedWithoutReclassification: true,
      },
      nativeAppearanceAcceptance: false,
    },
  };
  assert.equal(hash(bytes), SPEC.output, 'Reviewed telemetry banner output changed');
  assert.equal(bytes.length, SPEC.outputBytes, 'Reviewed telemetry banner byte count changed');
  assert.deepEqual(result.receipt, EXPECTED_BANNER_RECEIPT, 'Telemetry banner receipt changed');
  return result;
}

// Exact historical stage receipts bind provenance semantically, independent of JSON key order.
const EXPECTED_ANTENNA_RECEIPT = {
  method: 'telemetry-complete-antenna-roof-seating-final-stage-v1',
  inputSha256: '24bcd7df0a2ba3aa45ecd59f5d3de1ba7a6b1a17a38a77c8decc4fca630ef22c',
  outputSha256: 'a313535e9e0f67476fc92468d5a8c180d569dc1d3dcb9a9b57af0e22c370dc93',
  outputBytes: 37756,
  sourceInputHeightMetres: 7.599999904632568,
  finalRuntimeHeightMetres: 6.5,
  baselineBounds: {
    min: [-4.300000215831569, 0, -3.2999999451009843],
    max: [4.300000215831569, 7.599999904632568, 3.2999999451009843],
    size: [8.600000431663139, 7.599999904632568, 6.5999998902019685],
  },
  actualFinalBounds: {
    min: [-4.300000215831569, 0, -3.2999999451009843],
    max: [4.300000215831569, 6.499999837498912, 3.2999999451009843],
    size: [8.600000431663139, 6.499999837498912, 6.5999998902019685],
  },
  antennaBoundsBefore: {
    min: [-1.2000001198367136, 5.400000282965226, -1.2000001198367136],
    max: [1.2000001198367136, 7.599999904632568, 1.2000001198367136],
    size: [2.4000002396734272, 2.1999996216673425, 2.4000002396734272],
  },
  antennaBoundsAfter: {
    min: [-1.2000001198367136, 4.300000279906566, -1.2000001198367136],
    max: [1.2000001198367136, 6.499999837498912, 1.2000001198367136],
    size: [2.4000002396734272, 2.1999995575923457, 2.4000002396734272],
  },
  translatedTriangleIds: [
    50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73,
    74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97,
    98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116,
    117, 118, 119, 120, 121,
  ],
  translatedVertexIds: [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118,
    119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137,
    138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156,
    157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175,
    176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194,
    195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207,
  ],
  positionAccessor: 3,
  actualTranslationRange: [-1.1000000671336574, -1.1000000030586596],
  triangles: 156,
  translatedTriangles: 72,
  roofTop: 4.300000215831569,
  mastBaseResidualMetres: 6.407499686389428e-8,
  baseContactAreaXZ: 0.04319999741988942,
  positionYOnly: true,
  normalsUVColoursIndicesMapsMaterialsNodesShadowsExact: true,
  bannerAndAllNonAntennaPositionsExact: true,
  materials: 1,
  textures: 2,
  renderVertices: 468,
};
const EXPECTED_BANNER_RECEIPT = {
  method: 'telemetry-complete-banner-wall-seating-post-antenna-v1',
  inputSha256: 'a313535e9e0f67476fc92468d5a8c180d569dc1d3dcb9a9b57af0e22c370dc93',
  outputSha256: 'e978d789b8bdd5df9d7aeebc40701a4a7dca461d0a7fdd672acb6a2e85504802',
  inputBytes: 37756,
  outputBytes: 37756,
  binaryBytes: 33784,
  translatedTriangleIds: [0, 1, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131],
  translatedVertexIds: [
    0, 1, 2, 3, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224,
    225, 226, 227,
  ],
  translatedTriangles: 12,
  positionAccessor: 3,
  deltaZ: -0.15,
  actualDeltaRange: [-0.1500000790545859, -0.1500000790545859],
  bannerBoundsBefore: {
    min: [-2.4000002396734272, 3.174999879222163, 3.1400000658160816],
    max: [2.4000002396734272, 3.825000221792034, 3.259999975279759],
    size: [4.8000004793468545, 0.6500003425698706, 0.11999990946367722],
  },
  bannerBoundsAfter: {
    min: [-2.4000002396734272, 3.174999879222163, 2.9899999867614957],
    max: [2.4000002396734272, 3.825000221792034, 3.109999896225173],
    size: [4.8000004793468545, 0.6500003425698706, 0.11999990946367722],
  },
  wallBounds: {
    min: [-4.000000057722398, 0, -3.0000000432917986],
    max: [4.000000057722398, 4.000000057722398, 3.0000000432917986],
    size: [8.000000115444797, 4.000000057722398, 6.000000086583597],
  },
  wallOverlapMetres: 0.010000056530302892,
  fullBoundsBefore: {
    min: [-4.300000215831569, 0, -3.2999999451009843],
    max: [4.300000215831569, 6.499999837498912, 3.2999999451009843],
    size: [8.600000431663139, 6.499999837498912, 6.5999998902019685],
  },
  fullBoundsAfter: {
    min: [-4.300000215831569, 0, -3.2999999451009843],
    max: [4.300000215831569, 6.499999837498912, 3.2999999451009843],
    size: [8.600000431663139, 6.499999837498912, 6.5999998902019685],
  },
  fullFixtureBoundsExact: true,
  nonBannerBinaryExact: true,
  antennaPositionEntriesExact: true,
  normalsUVColoursIndicesMapsMaterialsNodesShadowsExact: true,
  changedPositionBytes: 72,
  permittedPositionBytes: 96,
  triangles: 156,
  materials: 1,
  textures: 2,
  meshes: 3,
  nodes: 4,
  priorAntennaStage: {
    method: 'telemetry-complete-antenna-roof-seating-final-stage-v1',
    outputSha256: 'a313535e9e0f67476fc92468d5a8c180d569dc1d3dcb9a9b57af0e22c370dc93',
    finalHeight: 6.5,
    preservedWithoutReclassification: true,
  },
  nativeAppearanceAcceptance: false,
};
const EXPECTED_FINAL_RECEIPT = {
  method: 'telemetry-antenna-then-banner-final-stages-v1',
  inputSha256: ANTENNA.baseline,
  outputSha256: SPEC.output,
  outputBytes: SPEC.outputBytes,
  actualFinalBounds: EXPECTED_BANNER_RECEIPT.fullBoundsAfter,
  sourceInputHeightMetres: ANTENNA.legacyHeight,
  finalRuntimeHeightMetres: ANTENNA.finalHeight,
  stages: { antenna: EXPECTED_ANTENNA_RECEIPT, banner: EXPECTED_BANNER_RECEIPT },
};

export function composeFinalReceipt(antennaReceipt, bannerReceipt) {
  assert.deepEqual(
    antennaReceipt,
    EXPECTED_ANTENNA_RECEIPT,
    'Historical telemetry antenna receipt changed'
  );
  assert.deepEqual(bannerReceipt, EXPECTED_BANNER_RECEIPT, 'Telemetry banner receipt changed');
  return structuredClone(EXPECTED_FINAL_RECEIPT);
}

export function assertFinalReceipt(receipt) {
  assert.deepEqual(
    receipt,
    EXPECTED_FINAL_RECEIPT,
    'Stale or inconsistent telemetry combined receipt'
  );
}

export function assertCurrentOutput(current, candidate) {
  assert.equal(
    hash(candidate),
    SPEC.output,
    'Telemetry banner candidate is not the reviewed output'
  );
  assert.equal(candidate.length, SPEC.outputBytes, 'Telemetry banner candidate size changed');
  assert(
    [ANTENNA.baseline, ANTENNA.output, SPEC.output].includes(hash(current)),
    'Unexpected telemetry current delivery; refuse overwrite'
  );
}
