/** AIR-only final-stage derivative. Normalization/indexing happen first.
 * Immutable provider/prepared inputs. Owned changes, all inside one primitive:
 * - the sign board drops 75 mm onto the post's cap plate (POSITION bytes only);
 * - the compressor housing (v7) is lofted from a traced side profile: a front console, a
 *   sloped control top, a 12 cm riser and a raised rear deck centred on the pole axis,
 *   extruded across the width on a dark battered plinth skirt;
 * - the pole (v4) is replaced whole by a plated post lofted from its profile: a square
 *   base plate standing wholly on the housing top, a flat-faceted octagonal shaft with
 *   a visible taper, and a square cap plate the board stands on. The axis stays at
 *   z -0.14 (runtime offset, hose coil and AIR text depend on it);
 * - the gauge and the hose reel (v5) are replaced whole, each lathed from a traced side
 *   profile: a dark gauge case let into the +z facet with a tapered bezel, a domed
 *   cream face and a needle; a reel of two flanged plates, a hex core and a bevelled
 *   hub boss, its inner plate let into the +x facet;
 * - the sign board (v6) is replaced whole by a framed plaque lofted from its traced side
 *   profile: a full-size blue back panel standing 6 mm into the cap plate, four dark
 *   bevelled frame strips stepping 25 mm in and 55 mm forward, and a blue face panel on
 *   the authored face plane (z -0.08) so the runtime AIR text keeps its 1 cm clearance.
 * Every surviving vertex keeps its 44 bytes apart from those owned moves; images,
 * material, nodes and samplers stay exact; the triangle count does not grow.
 * The 3.325 m source sizing is LEGACY pre-derivation sizing, not final runtime height.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const AIR_SIGN_DROP_METRES = 0.075;
// Delivered (centred) frame: pole axis at z -0.14, box z -0.14..0.26, y 0.1..0.7.
export const AIR_BOX_DROP_METRES = 0.1;
export const AIR_BOX_BACK_Z = -0.26; // the pole's own rear extent: bounds stay 0.52 deep
export const AIR_POLE_AXIS_Z = -0.14;
export const AIR_POLE_FOOT_Y = 0.58; // 2 cm below the lowered box top (0.6)
export const AIR_POLE_FOOT_RADIUS = 0.115; // 5 mm clear of the box back face
// Housing (v7, metres, delivered frame): a traced side profile extruded across the body
// width on a dark battered plinth. The plinth foot and the flush back hold the envelope
// (x +-0.30, z +-0.26); the raised rear deck spans back..deckFront, centred on the pole.
export const AIR_HOUSING = Object.freeze({
  halfWidth: 0.28,
  plinthHalfWidth: 0.3,
  front: 0.24,
  plinthFront: 0.26,
  back: -0.26,
  plinthTop: 0.08,
  consoleTop: 0.36,
  slopeTop: 0.48,
  deckFront: -0.02,
  top: 0.6,
});
// A profile of N open-bottom points costs 2(N - 1) strip + 2(N - 2) cap triangles, and
// the plinth skirt 8: N = 6 gives 10 + 8 + 8.
export const AIR_HOUSING_TRIANGLES = 26;
// The pole (v4) is rebuilt as a plated post, lofted from a traced profile rather than
// nudging the authored cylinder: a square base plate fully on the housing top, a
// flat-faceted octagonal shaft tapering 0.085 -> 0.062 m (circumradius, facets facing
// +-x and +-z so the dial sits on a flat), and a square cap plate the board stands on.
// The axis stays at z -0.14: the runtime offset, the hose coil and the AIR text use it.
export const AIR_POST = Object.freeze({
  segments: 8,
  basePlateHalf: 0.1, // rear edge 2 cm inside the housing back
  basePlateTop: 0.63,
  footRadius: 0.085,
  topRadius: 0.062,
  sink: 0.002,
  capPlateHalf: 0.08,
  capPlateBottom: 2.975,
  capPlateTop: 3.006, // the board's foot is slotted 6 mm into the cap plate
});
// The gauge and the reel (v5) are replaced whole: the authored flat discs (a 16-triangle
// face, a 32-triangle flat ring 1 cm in front of it, a 64-triangle plain cylinder) are
// deleted and each part is lathed from a traced side profile. Metres, delivered frame.
// Reel: axis along +x on the shaft's +x facet; two flanged end plates (closed prisms),
// a hex core between them, and a bevelled hex hub boss on the outer plate. Its axis is
// near the post axis so the inner plate is backed by the post rather than hanging off it.
export const AIR_REEL = Object.freeze({
  axisY: 2.0,
  axisZ: -0.12, // flange apothem 0.1386 keeps z >= -0.2586, inside the 0.52 m envelope
  segments: 8,
  flangeRadius: 0.15,
  flangeThickness: 0.015,
  flangeGap: 0.07,
  mountSink: 0.003, // the inner plate is let 3 mm into the shaft facet
  coreRadius: 0.1,
  coreSegments: 6,
  coreSink: 0.002,
  hubRadius: 0.045,
  hubRise: 0.02,
  hubSegments: 6,
});
// Gauge: axis along +z on the shaft's +z facet; a dark case with a closed back let into
// the shaft, a tapered bezel that reads as a 2 cm dark rim from the front, a domed
// cream face and a needle.
export const AIR_GAUGE = Object.freeze({
  centreY: 2.5,
  segments: 8,
  caseRadius: 0.12,
  faceRadius: 0.1,
  backSink: 0.008,
  bezelProud: 0.03,
  domeRise: 0.008,
  needleAngle: 0.9,
  needleInner: 0.008,
  needleLength: 0.08,
  needleHalfWidth: 0.005,
  needleProud: 0.0015,
  needleSink: 0.001,
});
// Sign (v6): the authored 2 cm box board is replaced by a framed plaque lofted from its
// side profile. Back panel = the full 0.5 x 0.25 m board; face panel inset by the bevel.
// Metres, delivered frame. The face stays on the authored plane: TruckBay draws "AIR" at
// GLB z -0.07, so nothing may come forward of z -0.08.
export const AIR_SIGN = Object.freeze({
  halfWidth: 0.25,
  bottom: 3.0,
  top: 3.25,
  back: -0.135,
  face: -0.08,
  bevelInset: 0.025,
  textPlaneZ: -0.07,
  textHalfWidth: 0.1,
  textHalfHeight: 0.05,
});
export const AIR_SIGN_OUTPUT_SHA256 =
  '2b95e32a713fe89090c698babae5c372f6fa7f3d4b797555cb268a9ef9d76f58';
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
export function inspectAirDelivery(input, expected = { vertices: 233, triangles: 184 }) {
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
  assert.equal(position.definition.count, expected.vertices);
  assert.equal(indices.definition.count, expected.triangles * 3);
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
  const points = Array.from({ length: expected.vertices }, (_, i) =>
    position.get(i).map((v, k) => v * parent.scale[k] + parent.translation[k])
  );
  const triangles = Array.from({ length: expected.triangles }, (_, i) =>
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
  // Compressor box: the 12 triangles wholly inside its authored envelope.
  const inBox = (p) =>
    Math.abs(p[0]) < 0.3 + 1e-5 &&
    p[1] > 0.1 - 1e-5 &&
    p[1] < 0.7 + 1e-5 &&
    p[2] > -0.14 - 1e-5 &&
    p[2] < 0.26 + 1e-5;
  const boxTriangles = triangles
    .map((ids, i) => ({ ids, i }))
    .filter((t) => t.ids.every((i) => inBox(points[i])));
  assert.equal(boxTriangles.length, 12, 'AIR box triangle ownership changed');
  const boxVertices = [...new Set(boxTriangles.flatMap((t) => t.ids))].sort((a, b) => a - b);
  assert.equal(boxVertices.length, 24, 'AIR box split-corner ownership changed');
  // Pole foot: every vertex on the ground ring (the pole side's lower ring and its cap).
  const poleFootVertices = points
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Math.abs(p[1]) < 1e-5)
    .map(({ i }) => i);
  for (const i of poleFootVertices)
    assert(
      Math.hypot(points[i][0], points[i][2] - AIR_POLE_AXIS_Z) < 0.12 + 1e-5,
      'AIR pole foot ownership changed'
    );
  const boxSet = new Set(boxVertices),
    footSet = new Set(poleFootVertices);
  for (let i = 0; i < triangles.length; i++) {
    const ids = triangles[i];
    if (ids.some((v) => boxSet.has(v)))
      assert(
        boxTriangles.some((t) => t.i === i),
        'AIR box shares corners with another part'
      );
    if (ids.some((v) => footSet.has(v)))
      assert(
        ids.every((v) => Math.hypot(points[v][0], points[v][2] - AIR_POLE_AXIS_Z) < 0.12 + 1e-5),
        'AIR pole foot shares corners with another part'
      );
    assert(!ids.some((v) => selectedVertices.includes(v) && (boxSet.has(v) || footSet.has(v))));
  }
  const writeMetric = (i, k, metres) => {
    const offset = position.start + i * position.stride + k * 4;
    outputBin.writeFloatLE((metres - parent.translation[k]) / parent.scale[k], offset);
    for (let b = 0; b < 4; b++) permittedBytes.add(offset + b);
  };
  const seated = new Map();
  for (const i of boxVertices) {
    const [x, y, z] = points[i];
    const next = [x, y - AIR_BOX_DROP_METRES, Math.abs(z + 0.14) < 1e-5 ? AIR_BOX_BACK_Z : z];
    writeMetric(i, 1, next[1]);
    if (next[2] !== z) writeMetric(i, 2, next[2]);
    seated.set(i, next);
  }
  // v4 post profile: circumradius at height y, and the facet apothem.
  const P4 = AIR_POST;
  const shaftBottom = P4.basePlateTop - P4.sink,
    shaftTop = P4.capPlateBottom + P4.sink;
  const circumAt = (y) =>
    P4.footRadius + ((P4.topRadius - P4.footRadius) * (y - shaftBottom)) / (shaftTop - shaftBottom);
  const apothemAt = (y) => circumAt(y) * Math.cos(Math.PI / P4.segments);
  // Dial (cream face + dark ring) and drum, identified by palette on the baseline.
  const colourKey = (i) =>
    [8, 9, 10]
      .map((k) => g.bin.readFloatLE(position.start + i * position.stride + k * 4).toFixed(3))
      .join(',');
  const partVertices = (pred) => {
    const ids = new Set();
    triangles.forEach((t) => {
      if (t.every(pred)) t.forEach((v) => ids.add(v));
    });
    return [...ids].sort((a, b) => a - b);
  };
  const dialFace = partVertices((i) => colourKey(i) === '0.991,0.896,0.571');
  const dialRing = partVertices((i) => colourKey(i) === '0.014,0.022,0.038');
  const drum = partVertices((i) => colourKey(i) === '0.947,0.171,0.008');
  assert.deepEqual(
    [dialFace.length, dialRing.length, drum.length],
    [17, 32, 76],
    'AIR dial/drum ownership changed'
  );
  // v5: the gauge and reel are deleted whole and lathed anew below, so nothing moves here.
  const footScale = AIR_POLE_FOOT_RADIUS / 0.12;
  for (const i of poleFootVertices) {
    const [x, , z] = points[i];
    const next = [
      x * footScale,
      AIR_POLE_FOOT_Y,
      AIR_POLE_AXIS_Z + (z - AIR_POLE_AXIS_Z) * footScale,
    ];
    for (let k = 0; k < 3; k++) writeMetric(i, k, next[k]);
    seated.set(i, next);
  }
  let changedBytes = 0;
  for (let i = 0; i < outputBin.length; i++)
    if (outputBin[i] !== g.bin[i]) {
      changedBytes++;
      assert(permittedBytes.has(i), 'Unowned POSITION byte changed');
    }
  assert(changedBytes > 0);

  // ---- v3: rebuild the housing inside the same primitive, within the same triangles.
  const sub = (a, b) => a.map((v, k) => v - b[k]);
  const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a) => a.map((v) => v / Math.hypot(...a));
  const j0 = g.json,
    attrs = before.primitive.attributes,
    STRIDE = 44,
    BASE_TRIANGLES = 184;
  const vertexViewId = j0.accessors[attrs.POSITION].bufferView,
    vertexView = j0.bufferViews[vertexViewId];
  assert.deepEqual(Object.keys(attrs).sort(), ['COLOR_0', 'NORMAL', 'POSITION', 'TEXCOORD_0']);
  assert.equal(vertexView.byteStride, STRIDE, 'AIR interleaved layout changed');
  for (const [name, offset, type] of [
    ['POSITION', 0, 'VEC3'],
    ['TEXCOORD_0', 12, 'VEC2'],
    ['NORMAL', 20, 'VEC3'],
    ['COLOR_0', 32, 'VEC3'],
  ]) {
    const a = j0.accessors[attrs[name]];
    assert(
      a.bufferView === vertexViewId &&
        (a.byteOffset ?? 0) === offset &&
        a.type === type &&
        a.componentType === 5126 &&
        a.count === 233 &&
        !a.normalized,
      `AIR ${name} layout changed`
    );
  }
  const indexAccessorId = before.primitive.indices,
    indexViewId = j0.accessors[indexAccessorId].bufferView,
    indexView = j0.bufferViews[indexViewId];
  assert.equal(j0.accessors[indexAccessorId].componentType, 5123);
  assert.equal(indexView.byteOffset ?? 0, 0);
  assert.equal(indexView.byteLength, BASE_TRIANGLES * 6);
  assert.equal(vertexView.byteOffset, indexView.byteLength);
  assert.equal(vertexView.byteLength, 233 * STRIDE);
  const tailStart = vertexView.byteOffset + vertexView.byteLength;
  j0.bufferViews.forEach((v, id) => {
    if (id !== vertexViewId && id !== indexViewId)
      assert(v.byteOffset >= tailStart, 'AIR image views must follow the vertices');
  });
  assert.equal(j0.buffers.length, 1);
  assert.equal(j0.buffers[0].byteLength, g.bin.length);
  const record = (i) =>
    outputBin.subarray(
      vertexView.byteOffset + i * STRIDE,
      vertexView.byteOffset + (i + 1) * STRIDE
    );
  const readF = (i, k) => record(i).readFloatLE(k * 4);
  const uvOf = (i) => [readF(i, 3), readF(i, 4)];
  const normalOf = (i) => [readF(i, 5), readF(i, 6), readF(i, 7)];
  const colourOf = (i) => [readF(i, 8), readF(i, 9), readF(i, 10)];

  // Affine UV map of each original box face (after the v2 seating), so the new
  // housing keeps the red atlas regions and their roughness.
  const solve3 = (m, r) => {
    const det = (a) =>
      a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
      a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
      a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
    const d = det(m);
    assert(Math.abs(d) > 1e-9, 'AIR degenerate UV fit');
    return [0, 1, 2].map(
      (c) => det(m.map((row, i) => row.map((v, k) => (k === c ? r[i] : v)))) / d
    );
  };
  const boxFaces = new Map();
  for (const i of boxVertices) {
    const key = normalOf(i)
      .map((v) => Math.round(v))
      .join(',');
    if (!boxFaces.has(key)) boxFaces.set(key, []);
    boxFaces.get(key).push(i);
  }
  assert.equal(boxFaces.size, 6, 'AIR box face normals changed');
  const boxColour = colourOf(boxVertices[0]);
  for (const i of boxVertices) assert.deepEqual(colourOf(i), boxColour, 'AIR box palette changed');
  const uvMaps = new Map();
  for (const [key, ids] of boxFaces) {
    assert.equal(ids.length, 4, 'AIR box face corners changed');
    const axes = [0, 1, 2].filter((k) => Number(key.split(',')[k]) === 0);
    const plane = (p) => [p[axes[0]], p[axes[1]], 1];
    const rows = ids.slice(0, 3).map((i) => plane(seated.get(i)));
    const coeffs = [0, 1].map((c) =>
      solve3(
        rows,
        ids.slice(0, 3).map((i) => uvOf(i)[c])
      )
    );
    const map = (p) => coeffs.map((m) => dot(m, plane(p)));
    for (const i of ids)
      assert(
        map(seated.get(i)).every((v, c) => Math.abs(v - uvOf(i)[c]) < 1e-4),
        'AIR box face UVs are not affine'
      );
    uvMaps.set(key, map);
  }

  const withIds = triangles.map((ids, i) => ({ ids, i }));
  // The authored pole (side, top cap, bottom cap) is replaced whole by the v4 post.
  const poleTop = withIds.filter((t) => t.ids.every((v) => Math.abs(points[v][1] - 3) < 1e-5));
  assert.equal(poleTop.length, 12, 'AIR pole top cap ownership changed');
  const poleTopCentre = poleTop[0].ids.find((v) => poleTop.every((t) => t.ids.includes(v)));
  assert(poleTopCentre !== undefined, 'AIR pole top cap is not a centre fan');
  const poleColour = colourOf(poleTopCentre);
  const poleBottom = withIds
    .filter((t) => t.ids.every((v) => Math.abs(points[v][1]) < 1e-5 && footSet.has(v)))
    .filter((t) => t.ids.every((v) => normalOf(v)[1] < -0.999));
  assert.equal(poleBottom.length, 12, 'AIR pole bottom cap ownership changed');
  const poleCapIds = new Set([...poleTop, ...poleBottom].map((t) => t.i));
  const poleSide = withIds.filter(
    (t) =>
      !poleCapIds.has(t.i) &&
      t.ids.every(
        (v) =>
          colourOf(v).every((c, k) => c === poleColour[k]) &&
          Math.hypot(points[v][0], points[v][2] - AIR_POLE_AXIS_Z) < 0.12 + 1e-5
      )
  );
  assert.equal(poleSide.length, 24, 'AIR pole side ownership changed');
  const poleTriangles = [...poleTop, ...poleBottom, ...poleSide];
  const poleVertices = [...new Set(poleTriangles.flatMap((t) => t.ids))];
  // The authored gauge (face + flat ring) and reel (plain cylinder) are deleted whole.
  const byPalette = (vertexIds) => {
    const set = new Set(vertexIds);
    return withIds.filter((t) => t.ids.every((v) => set.has(v)));
  };
  const dialFaceTriangles = byPalette(dialFace),
    dialRingTriangles = byPalette(dialRing),
    drumTriangles = byPalette(drum);
  assert.deepEqual(
    [dialFaceTriangles.length, dialRingTriangles.length, drumTriangles.length],
    [16, 32, 64],
    'AIR gauge/reel triangle ownership changed'
  );
  const gaugeReelTriangles = [...dialFaceTriangles, ...dialRingTriangles, ...drumTriangles];

  // v6: the authored board (12 triangles, 24 split corners) is replaced whole too.
  const removedTriangles = new Set(
    [...boxTriangles, ...poleTriangles, ...gaugeReelTriangles, ...selectedTriangles].map((t) => t.i)
  );
  assert.equal(removedTriangles.size, 12 + 48 + 112 + 12);
  const removedVertices = new Set([
    ...boxVertices,
    ...poleVertices,
    ...dialFace,
    ...dialRing,
    ...drum,
    ...selectedVertices,
  ]);
  for (let t = 0; t < triangles.length; t++)
    if (!removedTriangles.has(t))
      assert(
        triangles[t].every((v) => !removedVertices.has(v)),
        'AIR removed vertex still in use'
      );
  assert(
    poleFootVertices.every((i) => removedVertices.has(i)),
    'AIR authored pole foot survives'
  );

  // v7 housing, lofted from a traced side (z, y) profile and extruded across the width,
  // instead of a cuboid with chamfers and stuck-on blades. The profile climbs a front
  // console face, a sloped control top and a 12 cm riser to a raised rear deck whose
  // z-span is centred on the fixed pole axis, so the post stands in the middle of its own
  // deck. A dark mitred plinth skirt (battered, four faces) carries the body and holds the
  // envelope at its foot. Flat-shaded, split corners.
  const H = AIR_HOUSING,
    X = H.halfWidth,
    ZF = H.front,
    ZB = H.back,
    YT = H.top;
  const profile = [
    [ZF, H.plinthTop],
    [ZF, H.consoleTop],
    [H.deckFront, H.slopeTop],
    [H.deckFront, YT],
    [ZB, YT],
    [ZB, H.plinthTop],
  ];
  assert(
    Math.abs((ZB + H.deckFront) / 2 - AIR_POLE_AXIS_Z) < 1e-9,
    'AIR deck is not centred on the pole axis'
  );
  assert(YT - H.slopeTop >= 0.1, 'AIR deck riser too low to read');
  assert(H.slopeTop - H.consoleTop >= 0.1, 'AIR console slope too shallow to read');
  const newRecords = [],
    newPositions = [],
    newTriangles = [];
  const addVertex = (metres, uv, normal, colour) => {
    newPositions.push(metres);
    const r = Buffer.alloc(STRIDE);
    metres.forEach((m, k) => r.writeFloatLE((m - parent.translation[k]) / parent.scale[k], k * 4));
    uv.forEach((v, k) => r.writeFloatLE(v, 12 + k * 4));
    normal.forEach((v, k) => r.writeFloatLE(v, 20 + k * 4));
    colour.forEach((v, k) => r.writeFloatLE(v, 32 + k * 4));
    newRecords.push(r);
    return newRecords.length - 1;
  };
  const addPolygon = (corners, normal, colour, uvAt) => {
    const n = unit(normal);
    const ordered =
      dot(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])), n) > 0
        ? corners
        : [...corners].reverse();
    const ids = ordered.map((p) => addVertex(p, uvAt(p), n, colour));
    for (let k = 1; k + 1 < ordered.length; k++) {
      const face = cross(sub(ordered[k], ordered[0]), sub(ordered[k + 1], ordered[0]));
      assert(Math.abs(dot(unit(face), n) - 1) < 1e-9, 'AIR housing polygon not planar and convex');
      newTriangles.push([ids[0], ids[k], ids[k + 1]]);
    }
  };
  const red = (key) => (p) => uvMaps.get(key)(p);
  // A fan for the non-convex side caps: each triangle is oriented by the outward
  // normal, and every fan triangle must share one winding (no fold-over).
  const addFan = (corners, normal, colour, uvAt) => {
    const n = unit(normal);
    const ids = corners.map((p) => addVertex(p, uvAt(p), n, colour));
    const signs = [];
    for (let k = 1; k + 1 < corners.length; k++) {
      const face = cross(sub(corners[k], corners[0]), sub(corners[k + 1], corners[0]));
      assert(Math.hypot(...face) > 1e-9, 'AIR housing cap fan degenerate');
      assert(Math.abs(Math.abs(dot(unit(face), n)) - 1) < 1e-9, 'AIR housing cap not planar');
      signs.push(Math.sign(dot(face, n)));
      newTriangles.push(
        signs.at(-1) > 0 ? [ids[0], ids[k], ids[k + 1]] : [ids[0], ids[k + 1], ids[k]]
      );
    }
    assert.equal(new Set(signs).size, 1, 'AIR housing cap fan folds over');
  };
  // Strip faces: one quad per profile edge across the body width, normal off the edge.
  const stripMap = ['0,0,1', '0,1,0', '0,0,1', '0,1,0', '0,0,-1'];
  for (let k = 0; k + 1 < profile.length; k++) {
    const [z0, y0] = profile[k],
      [z1, y1] = profile[k + 1];
    addPolygon(
      [
        [-X, y0, z0],
        [X, y0, z0],
        [X, y1, z1],
        [-X, y1, z1],
      ],
      [0, z0 - z1, y1 - y0],
      boxColour,
      red(stripMap[k])
    );
  }
  // Side caps: the profile itself, fanned from the back-bottom corner, which sees every
  // other corner in monotonic angular order (checked by the fan's winding assertion).
  for (const side of [1, -1])
    addFan(
      [profile.at(-1), ...profile.slice(0, -1)].map(([z, y]) => [side * X, y, z]),
      [side, 0, 0],
      boxColour,
      red(side > 0 ? '1,0,0' : '-1,0,0')
    );
  // Plinth skirt: four battered trapezoids from the envelope foot up to the body's foot,
  // mitred at the corners, in the pole palette on the old louvre patch of its strip.
  const blade = { u: [0.1005, 0.116], v: [0.4, 0.46] };
  const PX = H.plinthHalfWidth,
    PF = H.plinthFront,
    PT = H.plinthTop;
  const foot = [
    [-PX, 0, PF],
    [PX, 0, PF],
    [PX, 0, ZB],
    [-PX, 0, ZB],
  ];
  const head = [
    [-X, PT, ZF],
    [X, PT, ZF],
    [X, PT, ZB],
    [-X, PT, ZB],
  ];
  const skirtOut = [
    [0, 0, 1],
    [1, 0, 0],
    [0, 0, -1],
    [-1, 0, 0],
  ];
  for (let k = 0; k < 4; k++) {
    const corners = [foot[k], foot[(k + 1) % 4], head[(k + 1) % 4], head[k]];
    const edge = sub(foot[(k + 1) % 4], foot[k]);
    const uvAt = (p) => [
      blade.u[0] + (p[1] / PT) * (blade.u[1] - blade.u[0]),
      blade.v[0] + (dot(sub(p, foot[k]), edge) / dot(edge, edge)) * (blade.v[1] - blade.v[0]),
    ];
    let n = unit(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
    if (dot(n, skirtOut[k]) < 0) n = n.map((v) => -v);
    addPolygon(corners, n, poleColour, uvAt);
  }
  assert.equal(newTriangles.length, AIR_HOUSING_TRIANGLES, 'AIR housing triangle accounting');

  // v4 plated post, lofted from its profile: base plate (sides + top; it stands on the
  // housing top, so no bottom), eight flat shaft facets, cap plate (sides, top, bottom).
  const AX = AIR_POLE_AXIS_Z;
  const plateUV = (axes) => (p) => [
    0.06 + 0.25 * (p[axes[0]] + 0.3),
    0.1 + 0.25 * (p[axes[1]] + 0.3),
  ];
  const addSlab = (half, y0, y1, faces) => {
    const xs = [-half, half],
      zs = [AX - half, AX + half];
    if (faces.includes('sides')) {
      for (const sx of [0, 1])
        addPolygon(
          [
            [xs[sx], y0, zs[0]],
            [xs[sx], y0, zs[1]],
            [xs[sx], y1, zs[1]],
            [xs[sx], y1, zs[0]],
          ],
          [sx ? 1 : -1, 0, 0],
          poleColour,
          plateUV([2, 1])
        );
      for (const sz of [0, 1])
        addPolygon(
          [
            [xs[0], y0, zs[sz]],
            [xs[1], y0, zs[sz]],
            [xs[1], y1, zs[sz]],
            [xs[0], y1, zs[sz]],
          ],
          [0, 0, sz ? 1 : -1],
          poleColour,
          plateUV([0, 1])
        );
    }
    for (const [face, y, ny] of [
      ['top', y1, 1],
      ['bottom', y0, -1],
    ])
      if (faces.includes(face))
        addPolygon(
          [
            [xs[0], y, zs[0]],
            [xs[1], y, zs[0]],
            [xs[1], y, zs[1]],
            [xs[0], y, zs[1]],
          ],
          [0, ny, 0],
          poleColour,
          plateUV([0, 2])
        );
  };
  const P = AIR_POST,
    housingTop = YT;
  addSlab(P.basePlateHalf, housingTop, P.basePlateTop, ['sides', 'top']);
  const step = (2 * Math.PI) / P.segments;
  const ring = (y) =>
    Array.from({ length: P.segments }, (_, k) => {
      const a = step / 2 + k * step,
        r = circumAt(y);
      return [r * Math.sin(a), y, AX + r * Math.cos(a)];
    });
  const lower = ring(shaftBottom),
    upper = ring(shaftTop);
  for (let k = 0; k < P.segments; k++) {
    const b0 = lower[k],
      b1 = lower[(k + 1) % P.segments],
      t0 = upper[k],
      t1 = upper[(k + 1) % P.segments];
    const facing = [Math.sin((k + 1) * step), 0, Math.cos((k + 1) * step)];
    let n = unit(cross(sub(b1, b0), sub(t0, b0)));
    if (dot(n, facing) < 0) n = n.map((v) => -v);
    const edge = sub(b1, b0),
      u0 = 0.04 + k * 0.018;
    const uvAt = (q) => [
      u0 + (0.018 * dot(sub(q, b0), edge)) / dot(edge, edge),
      0.004 + 0.992 * (q[1] / 3),
    ];
    addPolygon([b0, b1, t1, t0], n, poleColour, uvAt);
  }
  addSlab(P.capPlateHalf, P.capPlateBottom, P.capPlateTop, ['sides', 'top', 'bottom']);
  assert.equal(newTriangles.length, AIR_HOUSING_TRIANGLES + 10 + 2 * P.segments + 12);
  // The joint: the base plate stands wholly on the housing's flat top, at least 2 cm in
  // from every edge, and the shaft foot stands inside the plate with a visible lip.
  assert(
    P.basePlateHalf <= X - 0.02 &&
      AX - P.basePlateHalf >= ZB + 0.02 - 1e-9 &&
      AX + P.basePlateHalf <= H.deckFront - 0.02 + 1e-9,
    'AIR base plate not wholly on the housing top'
  );
  assert(P.basePlateHalf - P.footRadius >= 0.015, 'AIR base plate lip too narrow');
  assert(P.capPlateHalf - P.topRadius >= 0.015, 'AIR cap plate lip too narrow');
  // The board's foot is slotted into the cap plate (a modelled joint, not a butt).
  const boardZ = [boardBounds.min[2], boardBounds.max[2]];
  assert(
    boardBounds.min[1] - AIR_SIGN_DROP_METRES > P.capPlateBottom + 0.02 &&
      boardBounds.min[1] - AIR_SIGN_DROP_METRES < P.capPlateTop - 0.005 &&
      boardZ[0] >= AX - P.capPlateHalf &&
      boardZ[1] <= AX + P.capPlateHalf,
    'AIR board is not slotted into the cap plate'
  );
  const postEnd = newTriangles.length;

  // ---- v5: the reel and the gauge, each lathed from its traced side profile. A frame
  // maps (radius, axial position, angle) to metres; bands are smooth-shaded, caps flat.
  const orange = colourOf(drum[0]),
    cream = colourOf(dialFace[0]),
    rimDark = colourOf(dialRing[0]);
  const addTri = (ids, outward) => {
    const [p0, p1, p2] = ids.map((i) => newPositions[i]);
    const face = cross(sub(p1, p0), sub(p2, p0));
    assert(Math.hypot(...face) > 1e-12, 'AIR degenerate lathe triangle');
    newTriangles.push(dot(face, outward) > 0 ? ids : [ids[0], ids[2], ids[1]]);
  };
  const ringAt = (frame, n, phase, r, a) =>
    Array.from({ length: n }, (_, k) => frame.at(r, a, phase + (2 * Math.PI * k) / n));
  // A band between profile points (r0, a0) -> (r1, a1), a1 > a0, normals off the profile.
  const latheBand = (frame, n, phase, [r0, a0], [r1, a1], colour, uvAt) => {
    assert(a1 > a0 || r1 !== r0, 'AIR lathe band has no extent');
    const dr = r1 - r0,
      da = a1 - a0;
    const normalAt = (th) => unit(frame.radial(th).map((v, c) => v * da - frame.axis[c] * dr));
    const ring = (r, a, t) =>
      Array.from({ length: n + 1 }, (_, k) => {
        const th = phase + (2 * Math.PI * k) / n,
          p = frame.at(r, a, th);
        return addVertex(p, uvAt(p, k / n, t), normalAt(th), colour);
      });
    const A = ring(r0, a0, 0),
      B = ring(r1, a1, 1);
    for (let k = 0; k < n; k++) {
      const outward = normalAt(phase + (2 * Math.PI * (k + 0.5)) / n);
      addTri([A[k], A[k + 1], B[k + 1]], outward);
      addTri([A[k], B[k + 1], B[k]], outward);
    }
  };
  const latheCap = (frame, n, phase, r, a, sign, colour, uvAt) =>
    addPolygon(
      ringAt(frame, n, phase, r, a),
      frame.axis.map((v) => v * sign),
      colour,
      uvAt
    );
  // A domed fan: rim ring at (r, aRim) up to a peak on the axis, spherical normals.
  const latheDome = (frame, n, phase, r, aRim, aPeak, colour, uvAt) => {
    const rise = aPeak - aRim,
      sphere = (r * r + rise * rise) / (2 * rise),
      s = r / sphere;
    const peak = frame.at(0, aPeak, 0);
    const centre = addVertex(peak, uvAt(peak), frame.axis, colour);
    const rim = Array.from({ length: n }, (_, k) => {
      const th = phase + (2 * Math.PI * k) / n,
        p = frame.at(r, aRim, th);
      const normal = unit(
        frame.radial(th).map((v, c) => v * s + frame.axis[c] * Math.sqrt(1 - s * s))
      );
      return addVertex(p, uvAt(p), normal, colour);
    });
    for (let k = 0; k < n; k++) addTri([rim[k], rim[(k + 1) % n], centre], frame.axis);
  };
  const facetNormal = (corners, outward) => {
    const n = unit(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
    return dot(n, outward) > 0 ? n : n.map((v) => -v);
  };

  // Reel, axis +x. Profile from the post outward: inner plate | hex core | outer plate |
  // hex hub boss with a bevelled (pyramidal) face.
  const RL = AIR_REEL;
  const reelFrame = {
    axis: [1, 0, 0],
    radial: (th) => [0, Math.cos(th), Math.sin(th)],
    at: (r, a, th) => [a, RL.axisY + r * Math.cos(th), RL.axisZ + r * Math.sin(th)],
  };
  const reelPhase = Math.PI / RL.segments; // flats face +-y and +-z
  const reelInner = apothemAt(RL.axisY) - RL.mountSink;
  const plates = [reelInner, reelInner + RL.flangeThickness + RL.flangeGap];
  const reelOuter = plates[1] + RL.flangeThickness;
  const reelBandUV = (_p, s, t) => [0.4829 + 0.033 * t, 0.4291 + 0.155 * s];
  const reelCapUV = (vCentre) => (p) => [
    0.6523 + 0.3 * (p[2] - RL.axisZ),
    vCentre + 0.3 * (p[1] - RL.axisY),
  ];
  for (const x0 of plates) {
    const x1 = x0 + RL.flangeThickness;
    latheBand(
      reelFrame,
      RL.segments,
      reelPhase,
      [RL.flangeRadius, x0],
      [RL.flangeRadius, x1],
      orange,
      reelBandUV
    );
    latheCap(reelFrame, RL.segments, reelPhase, RL.flangeRadius, x0, -1, orange, reelCapUV(0.6018));
    latheCap(reelFrame, RL.segments, reelPhase, RL.flangeRadius, x1, 1, orange, reelCapUV(0.4971));
  }
  latheBand(
    reelFrame,
    RL.coreSegments,
    0,
    [RL.coreRadius, plates[0] + RL.flangeThickness - RL.coreSink],
    [RL.coreRadius, plates[1] + RL.coreSink],
    orange,
    reelBandUV
  );
  const hubBase = ringAt(reelFrame, RL.hubSegments, 0, RL.hubRadius, reelOuter - 0.001),
    hubApex = reelFrame.at(0, reelOuter + RL.hubRise, 0);
  const hubUV = (p) => [0.108 + 0.1 * (p[2] - RL.axisZ), 0.43 + 0.1 * (p[1] - RL.axisY)];
  for (let k = 0; k < RL.hubSegments; k++) {
    const tri = [hubBase[k], hubBase[(k + 1) % RL.hubSegments], hubApex];
    const mid = reelFrame.radial((2 * Math.PI * (k + 0.5)) / RL.hubSegments);
    addPolygon(tri, facetNormal(tri, sub(mid, [-1, 0, 0])), poleColour, hubUV);
  }
  const reelEnd = newTriangles.length;

  // Gauge, axis +z. Profile from the post outward: closed back let into the shaft |
  // tapered dark bezel | domed cream face | needle.
  const GA = AIR_GAUGE;
  const gaugeFrame = {
    axis: [0, 0, 1],
    radial: (th) => [Math.cos(th), Math.sin(th), 0],
    at: (r, a, th) => [r * Math.cos(th), GA.centreY + r * Math.sin(th), a],
  };
  const gaugePhase = Math.PI / GA.segments;
  const facetZ = AX + apothemAt(GA.centreY);
  const gaugeBack = facetZ - GA.backSink,
    bezelFront = facetZ + GA.bezelProud,
    domePeak = bezelFront + GA.domeRise;
  const darkUV = (p) => [0.2423 + 0.3 * p[0], 0.3395 + 0.3 * (p[1] - GA.centreY)];
  const creamUV = (p) => [0.6426 + 0.3 * p[0], 0.402 + 0.3 * (p[1] - GA.centreY)];
  latheCap(gaugeFrame, GA.segments, gaugePhase, GA.caseRadius, gaugeBack, -1, rimDark, darkUV);
  latheBand(
    gaugeFrame,
    GA.segments,
    gaugePhase,
    [GA.caseRadius, gaugeBack],
    [GA.faceRadius, bezelFront],
    rimDark,
    darkUV
  );
  latheDome(
    gaugeFrame,
    GA.segments,
    gaugePhase,
    GA.faceRadius,
    bezelFront,
    domePeak,
    cream,
    creamUV
  );
  // Needle: one dark blade along the dome, its root let 1 mm into the face.
  const domeZ = (rho) => domePeak - (GA.domeRise * rho) / GA.faceRadius;
  const along = [Math.cos(GA.needleAngle), Math.sin(GA.needleAngle)],
    across = [-along[1], along[0]];
  const needlePoint = (rho, side, dz) => [
    rho * along[0] + side * across[0],
    GA.centreY + rho * along[1] + side * across[1],
    domeZ(Math.hypot(rho, side)) + dz,
  ];
  const needle = [
    needlePoint(GA.needleInner, GA.needleHalfWidth, -GA.needleSink),
    needlePoint(GA.needleInner, -GA.needleHalfWidth, -GA.needleSink),
    needlePoint(GA.needleLength, 0, GA.needleProud),
  ];
  addPolygon(needle, facetNormal(needle, [0, 0, 1]), rimDark, darkUV);
  const gaugeEnd = newTriangles.length;
  const reelTriangles = reelEnd - postEnd,
    gaugeTriangles = gaugeEnd - reelEnd;
  assert.equal(
    reelTriangles,
    2 * (2 * RL.segments + 2 * (RL.segments - 2)) + 2 * RL.coreSegments + RL.hubSegments
  );
  assert.equal(gaugeTriangles, GA.segments - 2 + 2 * GA.segments + GA.segments + 1);
  // Joints and envelope: the reel's inner plate is let into the +x facet and its axis is
  // on that facet; the gauge back is let into the +z facet; nothing leaves the envelope.
  const flatHalf = (y) => circumAt(y) * Math.sin(Math.PI / P.segments);
  assert(Math.abs(RL.axisZ - AX) < flatHalf(RL.axisY), 'AIR reel axis is off the post facet');
  assert(reelInner < apothemAt(RL.axisY), 'AIR reel inner plate not let into the post');
  assert(RL.coreRadius < RL.flangeRadius * Math.cos(Math.PI / RL.segments));
  assert(RL.hubRadius < RL.coreRadius);
  const reelZ = RL.flangeRadius * Math.cos(Math.PI / RL.segments);
  assert(RL.axisZ - reelZ >= ZB - 1e-9 && RL.axisZ + reelZ <= ZF, 'AIR reel leaves the envelope');
  assert(reelOuter + RL.hubRise < H.plinthHalfWidth, 'AIR reel leaves the envelope');
  assert(gaugeBack < facetZ && bezelFront > facetZ, 'AIR gauge not let into the post facet');
  assert(GA.caseRadius <= H.plinthHalfWidth && GA.faceRadius < GA.caseRadius);
  assert(
    GA.needleLength < GA.faceRadius * Math.cos(Math.PI / GA.segments),
    'AIR needle overruns the face'
  );

  // ---- v6: the sign board, lofted from its side profile. Back panel (full board,
  // blue) | four bevelled frame strips (dark, the pole palette) | face panel (blue) on
  // the authored face plane. UVs keep the authored board's own atlas faces.
  const S = AIR_SIGN;
  const boardColour = colourOf(selectedVertices[0]);
  for (const i of selectedVertices)
    assert.deepEqual(colourOf(i), boardColour, 'AIR board palette changed');
  const droppedBoard = (i) => [points[i][0], points[i][1] - AIR_SIGN_DROP_METRES, points[i][2]];
  for (const [value, want] of [
    [S.halfWidth, boardBounds.max[0]],
    [-S.halfWidth, boardBounds.min[0]],
    [S.bottom, boardBounds.min[1] - AIR_SIGN_DROP_METRES],
    [S.top, boardBounds.max[1] - AIR_SIGN_DROP_METRES],
    [S.face, boardBounds.max[2]],
  ])
    assert(Math.abs(value - want) < 1e-6, 'AIR sign profile left the authored board frame');
  const boardFaces = new Map();
  for (const i of selectedVertices) {
    const key = normalOf(i)
      .map((v) => Math.round(v))
      .join(',');
    if (!boardFaces.has(key)) boardFaces.set(key, []);
    boardFaces.get(key).push(i);
  }
  assert.equal(boardFaces.size, 6, 'AIR board face normals changed');
  const boardMap = (key) => {
    const ids = boardFaces.get(key);
    assert.equal(ids?.length, 4, 'AIR board face corners changed');
    const axes = [0, 1, 2].filter((k) => Number(key.split(',')[k]) === 0);
    const plane = (p) => [p[axes[0]], p[axes[1]], 1];
    const rows = ids.slice(0, 3).map((i) => plane(droppedBoard(i)));
    const coeffs = [0, 1].map((c) =>
      solve3(
        rows,
        ids.slice(0, 3).map((i) => uvOf(i)[c])
      )
    );
    const map = (p) => coeffs.map((m) => dot(m, plane(p)));
    for (const i of ids)
      assert(
        map(droppedBoard(i)).every((v, c) => Math.abs(v - uvOf(i)[c]) < 1e-4),
        'AIR board face UVs are not affine'
      );
    return map;
  };
  const W = S.halfWidth,
    I = S.bevelInset;
  const backRect = [
    [-W, S.bottom, S.back],
    [W, S.bottom, S.back],
    [W, S.top, S.back],
    [-W, S.top, S.back],
  ];
  const faceRect = [
    [-W + I, S.bottom + I, S.face],
    [W - I, S.bottom + I, S.face],
    [W - I, S.top - I, S.face],
    [-W + I, S.top - I, S.face],
  ];
  addPolygon(backRect, [0, 0, -1], boardColour, boardMap('0,0,-1'));
  addPolygon(faceRect, [0, 0, 1], boardColour, boardMap('0,0,1'));
  // Frame strips: bottom, right, top, left; each joins a back edge to its face edge.
  const outwards = [
    [0, -1, 0],
    [1, 0, 0],
    [0, 1, 0],
    [-1, 0, 0],
  ];
  for (let k = 0; k < 4; k++) {
    const corners = [backRect[k], backRect[(k + 1) % 4], faceRect[(k + 1) % 4], faceRect[k]];
    const edge = sub(backRect[(k + 1) % 4], backRect[k]);
    const uvAt = (p) => [
      blade.u[0] + ((p[2] - S.back) / (S.face - S.back)) * (blade.u[1] - blade.u[0]),
      blade.v[0] + (dot(sub(p, backRect[k]), edge) / dot(edge, edge)) * (blade.v[1] - blade.v[0]),
    ];
    addPolygon(corners, facetNormal(corners, outwards[k]), poleColour, uvAt);
  }
  const signEnd = newTriangles.length;
  assert.equal(signEnd - gaugeEnd, 12, 'AIR sign triangle accounting changed');
  // The sign's foot is let into the cap plate (a modelled joint), its depth is inside the
  // cap plate's footprint, and the face clears the runtime AIR text on every side.
  assert(
    S.bottom > P.capPlateBottom + 0.02 &&
      S.bottom < P.capPlateTop - 0.005 &&
      S.back >= AX - P.capPlateHalf &&
      S.face <= AX + P.capPlateHalf,
    'AIR sign is not let into the cap plate'
  );
  assert(S.face < S.textPlaneZ - 0.005, 'AIR sign face reaches the runtime text plane');
  assert(
    W - I > S.textHalfWidth && (S.top - S.bottom) / 2 - I > S.textHalfHeight,
    'AIR sign face panel narrower than the runtime text'
  );
  assert(S.face - S.back >= 0.05, 'AIR sign thinner than its frame');

  // Assemble: survivors in baseline order, then housing, post, reel and gauge.
  const keep = Array.from({ length: 233 }, (_, i) => i).filter((i) => !removedVertices.has(i));
  const remap = new Map(keep.map((v, k) => [v, k]));
  const firstBox = Math.min(...boxTriangles.map((t) => t.i));
  const finalTriangles = [];
  for (let t = 0; t < triangles.length; t++) {
    if (t === firstBox)
      finalTriangles.push(...newTriangles.map((tri) => tri.map((v) => keep.length + v)));
    if (!removedTriangles.has(t)) finalTriangles.push(triangles[t].map((v) => remap.get(v)));
  }
  assert.equal(
    finalTriangles.length,
    BASE_TRIANGLES - removedTriangles.size + newTriangles.length,
    'AIR triangle accounting changed'
  );
  assert(finalTriangles.length <= BASE_TRIANGLES, 'AIR render-vertex budget exceeded');
  const vertexCount = keep.length + newRecords.length;
  assert(vertexCount < 65536);
  const indexBytes = finalTriangles.length * 6,
    indexPadded = (indexBytes + 3) & ~3;
  const vertexBytes = Buffer.concat([...keep.map((i) => Buffer.from(record(i))), ...newRecords]);
  const tail = outputBin.subarray(tailStart),
    delta = indexPadded + vertexBytes.length - tailStart;
  assert.equal(delta % 4, 0);
  const newBin = Buffer.alloc(indexPadded + vertexBytes.length + tail.length, 0);
  finalTriangles.flat().forEach((v, k) => newBin.writeUInt16LE(v, k * 2));
  vertexBytes.copy(newBin, indexPadded);
  tail.copy(newBin, indexPadded + vertexBytes.length);

  const j = structuredClone(g.json);
  j.accessors[indexAccessorId].count = finalTriangles.length * 3;
  for (const name of Object.keys(attrs)) j.accessors[attrs[name]].count = vertexCount;
  const local = Array.from({ length: vertexCount }, (_, i) =>
    [0, 1, 2].map((k) => vertexBytes.readFloatLE(i * STRIDE + k * 4))
  );
  const a = j.accessors[attrs.POSITION];
  a.min = [0, 1, 2].map((k) => Math.min(...local.map((p) => p[k])));
  a.max = [0, 1, 2].map((k) => Math.max(...local.map((p) => p[k])));
  j.bufferViews[indexViewId].byteLength = indexBytes;
  j.bufferViews[vertexViewId].byteOffset = indexPadded;
  j.bufferViews[vertexViewId].byteLength = vertexBytes.length;
  j.bufferViews.forEach((v, id) => {
    if (id !== vertexViewId && id !== indexViewId) v.byteOffset += delta;
  });
  j.buffers[0].byteLength = newBin.length;
  const encoded = Buffer.from(JSON.stringify(j)),
    jsonLength = (encoded.length + 3) & ~3;
  const output = Buffer.alloc(28 + jsonLength + newBin.length, 0);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  output.fill(0x20, 20, 20 + jsonLength);
  encoded.copy(output, 20);
  output.writeUInt32LE(newBin.length, 20 + jsonLength);
  output.writeUInt32LE(0x004e4942, 24 + jsonLength);
  newBin.copy(output, 28 + jsonLength);

  const after = inspectAirDelivery(output, {
    vertices: vertexCount,
    triangles: finalTriangles.length,
  });
  assert(
    Math.abs(after.bounds.max[1] - after.bounds.min[1] - AIR_SIGN_FINAL_HEIGHT_METRES) < 1e-6,
    'Final height is not3.25m'
  );
  // Only counts, POSITION min/max, view offsets/lengths and the buffer length may differ.
  const normalisedJSON = (json) => {
    const copy = structuredClone(json);
    for (const acc of copy.accessors) {
      delete acc.count;
      delete acc.min;
      delete acc.max;
    }
    for (const view of copy.bufferViews) {
      delete view.byteOffset;
      delete view.byteLength;
    }
    delete copy.buffers[0].byteLength;
    return copy;
  };
  assert.deepEqual(normalisedJSON(after.g.json), normalisedJSON(g.json), 'AIR JSON drift');
  assert.deepEqual(after.g.json.nodes, g.json.nodes, 'Node transform drift');
  j0.images.forEach((image) => {
    const was = j0.bufferViews[image.bufferView],
      now = after.g.json.bufferViews[image.bufferView];
    assert(
      g.bin
        .subarray(was.byteOffset, was.byteOffset + was.byteLength)
        .equals(after.g.bin.subarray(now.byteOffset, now.byteOffset + now.byteLength)),
      'AIR image bytes changed'
    );
  });
  const afterRecord = (i) =>
    after.g.bin.subarray(indexPadded + i * STRIDE, indexPadded + (i + 1) * STRIDE);
  for (const [k, i] of keep.entries()) {
    assert(afterRecord(k).equals(record(i)), 'AIR surviving vertex bytes changed');
    if (!selectedVertices.includes(i) && !seated.has(i))
      assert(
        afterRecord(k).equals(
          g.bin.subarray(
            vertexView.byteOffset + i * STRIDE,
            vertexView.byteOffset + (i + 1) * STRIDE
          )
        ),
        'Unowned vertex moved'
      );
  }
  // Envelope is the manifest's: 0.60 x 3.25 x 0.52 m, grounded and centred.
  for (const [k, span] of [
    [0, 0.6],
    [2, 0.52],
  ]) {
    assert(Math.abs(after.bounds.max[k] - after.bounds.min[k] - span) < 1e-5, 'Envelope drift');
    assert(Math.abs(after.bounds.max[k] + after.bounds.min[k]) < 1e-5, 'Centre drift');
  }
  assert(Math.abs(after.bounds.min[1]) < 1e-5, 'Not grounded');
  // The new sign keeps the dropped authored board's foot and top exactly.
  const signPoints = [...backRect, ...faceRect];
  const deltas = [
    boardBounds.min[1] - Math.min(...signPoints.map((p) => p[1])),
    boardBounds.max[1] - Math.max(...signPoints.map((p) => p[1])),
  ];
  assert(
    deltas.every((d) => Math.abs(d - AIR_SIGN_DROP_METRES) < 1e-6),
    'Incorrect metric drop'
  );
  assert.equal(
    airSignSha256(output),
    AIR_SIGN_OUTPUT_SHA256,
    `AIR derived output identity changed: ${airSignSha256(output)}`
  );
  return {
    bytes: output,
    receipt: {
      method: 'air-station-lofted-housing-final-stage-v7',
      boxVertexIds: boxVertices,
      poleFootVertexIds: poleFootVertices,
      boxDropMetres: AIR_BOX_DROP_METRES,
      boxBackZ: AIR_BOX_BACK_Z,
      poleFootY: AIR_POLE_FOOT_Y,
      poleFootRadius: AIR_POLE_FOOT_RADIUS,
      housing: { ...AIR_HOUSING },
      housingTriangles: AIR_HOUSING_TRIANGLES,
      removedTriangleIds: [...removedTriangles].sort((x, y) => x - y),
      removedVertexIds: [...removedVertices].sort((x, y) => x - y),
      post: { ...AIR_POST },
      postTriangles: postEnd - AIR_HOUSING_TRIANGLES,
      poleTrianglesReplaced: poleTriangles.map((t) => t.i).sort((x, y) => x - y),
      reel: { ...AIR_REEL, innerPlateX: reelInner, outerPlateX: reelOuter },
      reelTriangles,
      gauge: { ...AIR_GAUGE, facetZ, backZ: gaugeBack, bezelFrontZ: bezelFront },
      gaugeTriangles,
      gaugeReelTrianglesReplaced: gaugeReelTriangles.map((t) => t.i).sort((x, y) => x - y),
      sign: { ...AIR_SIGN },
      signTriangles: signEnd - gaugeEnd,
      signTrianglesReplaced: selectedTriangles.map((t) => t.i),
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
      positionOnlyForSurvivingVertices: true,
      v2ChangedBinBytes: changedBytes,
      imagesMaterialsNodesSamplersExact: true,
      triangles: finalTriangles.length,
      renderVertices: finalTriangles.length * 3,
      indexedVertices: vertexCount,
      materials: j.materials.length,
      textures: j.textures.length,
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
