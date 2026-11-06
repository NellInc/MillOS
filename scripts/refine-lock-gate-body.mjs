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
  method: 'lock-gate-ridged-sheet-leaves-flush-heel-stiles-post-lapped-beam-final-stage-v7',
  baseline: 'd60bc4899b1f29d6cc26cf3866e310d442d29289851952044e5ad1059d686a20',
  baselineBytes: 24924,
  rawNormalized: '02b64cc74e538efb68f32548256b6839e182ca1079cf0e934bb3b70a6aa147ab',
  output: '0524bc79de951e648841f555619af8f883942b99890675086a1fe1193f2fa77a',
  outputBytes: 24920,
  // Predecessors accepted only as deliveries to replace: v1 (arm removal only,
  // posts 0.75 m clear of the ground), v2 (posts seated, no timber bearer), v3
  // (2.5 m slab leaves under a bearer with a 0.75 m open slot between them),
  // v4 (slab leaves under a breastwork notched through round the paddle gear)
  // v5 (framed leaves, a sloped upstream breast panel over a gear bay left
  // open downstream, and a post-to-post head beam) and v6 (a flat diaphragm,
  // heel stiles stepped 0.1 m back from the posts, and a free splayed beam).
  previousOutputs: Object.freeze([
    '342fb81325a193f4ee3a4d3587e08064f9f50183239c0e54d5c616ed8d4bdd43',
    '0f1794649cf9d4e8a61bc3ab6044c3405f98bb3eec4b70c292049f5beceab081',
    '9a1a4f44f248f0f1267527248bb14f477497d28f2aeaf656626bb806caab116d',
    'c0b4246b32320c1f5eb6e2b0681eae4bdab43c77289398ec3807157279c3c008',
    'a0509d560eef0c04f217bbc20a130726d719f644600ba6a31a470200f7cac2ea',
    '24f1285ed4364fd32382b9af8ef5d0ce66bb45fd345bb4232bad49c7e1c5cd69',
  ]),
  // v4 to v6 keep the deck and the four side faces of each post exactly and
  // rebuild everything else. Baseline triangle ids kept: the deck (0, 1, 62..71) and the
  // post sides (2..5, 10..13, 14..17, 22..25). Dropped as never visible: the post
  // tops (inside the deck), post bottoms (on the ground), and every old leaf and
  // arm triangle. Their rows are rebuilt below.
  keptTriangles: Object.freeze([
    0, 1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 22, 23, 24, 25, 62, 63, 64, 65, 66, 67, 68,
    69, 70, 71,
  ]),
  freedRowRanges: Object.freeze([
    [12, 19],
    [36, 43],
    [52, 123],
  ]),
  // Seated posts, in body-node (pre-wrapper) metres: footings from y 0.75 to
  // 0.002, grounded and 2 mm clear of the leaf bottoms (y 0).
  postFootingBefore: 0.75,
  postFootingAfter: 0.002,
  postFootingRows: 16,
  // v7 leaves, body-node metres (live = body - 0.75). The pair is one folded
  // double-sided sheet (the material is double-sided) traced in plan: flat
  // panels at z 0 from each heel reveal to the mitre, where the two leaves turn
  // up into a ridge (x +-0.15 to an apex 0.13 upstream at x 0). Upstream that
  // ridge is the meeting stile with its closed joint on the apex; downstream
  // the same sheet reads as the seam groove. The ridge stays behind the runtime
  // planks (z >= 0.147, |x| >= 0.107) and shows through their gap at the mitre.
  // Heel stiles (x 4.77..5.05) stand flush with the post faces (z +-0.25) on
  // both faces and abut the post inner face, so the post, the stile and the
  // head band above are one plane at each heel; one through-reveal at x 4.77
  // joins each stile pair to the panel. No bottom rail.
  leaf: Object.freeze({
    heel: 5.05,
    stile: 4.77,
    seat: 2.5,
    frameZ: 0.25,
    ridgeHalf: 0.15,
    ridgeApex: 0.13,
  }),
  // Head band (as v6): the gate is closed on both faces from the seat (y 2.5) to
  // the deck underside (y 3.675). Each face is two planes meeting at the mitre
  // in a 1-degree V: flush with the post faces (z +-0.25) at the posts and
  // +-0.34 at x = 0, so it meets every post with no slit and still clears the
  // handwheel rim (|z| <= 0.283) by 7 mm or more. One soffit at y 2.5 spans the
  // whole section. Downstream, the band leaves a pocket at each heel (x
  // 4.77..5.05, y 2.5..2.835) where the runtime balance beam and its lever pass
  // out to the lockside; nothing else is open. The paddle gear is enclosed.
  band: Object.freeze({
    postZ: 0.25,
    apexZ: 0.34,
    top: 3.675,
    pocketX: 4.77,
    pocketTop: 2.835,
  }),
  // v7 timber: one 4 m box-section beam off the centreline on the upstream
  // face at walkway height, lapped 0.1 m onto the west post's face (its back on
  // the post face, z 0.25) and running east along the band; its top bears on
  // the deck soffit, its ends are square, and it stands 0.14 to 0.21 proud of
  // the band and post. Its back runs into the closed band, so no back face is
  // needed. The lap stops 5 cm short of the runtime lamp plate.
  beam: Object.freeze({
    x: Object.freeze([-5.15, -1.15]),
    yBottom: 3.355,
    yTop: 3.675,
    zBack: 0.25,
    zFront: 0.46,
  }),
  // Linear vertex colours. Stiles, reveals, the meeting ridge and the head band
  // are weathered oak,
  // well above the slate leaves in value; the beam is dark-brown timber (sRGB
  // about #4e3826), darker than the band it stands on. The two leaves carry the
  // authored slate scaled per corner: the west leaf a little darker, the east a
  // little lighter, both lighter at the head than at the wet foot, so the mitre
  // reads as a value break at every height.
  palettes: Object.freeze({
    frame: Object.freeze([0.181, 0.117, 0.05]),
    band: Object.freeze([0.13, 0.085, 0.04]),
    timber: Object.freeze([0.0762, 0.0395, 0.0194]),
    leafScale: Object.freeze({
      west: Object.freeze({ foot: 0.8, head: 1.25 }),
      east: Object.freeze({ foot: 1.1, head: 1.75 }),
    }),
  }),
  // Runtime parts (AuthoredPropTrim.tsx, live + 0.75) that no drawn triangle
  // may enter, in body-node metres, mirrored in x. Axis-aligned boxes are
  // { x, y, z }; the yawed balance beam is an oriented box { from, to, half }.
  // The paddle gear is its three actual shapes, each widened 5 mm: housing box
  // 0.33 x 0.48 x 0.4 (top y 2.73), spindle and threads (r 0.056) and the
  // handwheel (rim r 0.283 in the band y 3.037..3.103). Below the seat the
  // housing is sunk in the leaf by design. The balance beam (0.22 square, heel
  // (4.8, 2.595, 0) to tail (6.4, 2.595, -3.9)) and the three legs of its lever
  // (y 2.68..2.82) are their exact shapes widened 5 mm, replacing v5's two
  // coarse boxes, which did not reach the beam beyond x 4.94 below y 2.67. The
  // outer stile and hinge stack (below the seat) and the lamp plate and
  // stand-off on each post face are new in v6.
  keepOuts: Object.freeze([
    { name: 'paddle-housing', x: [2.33, 2.67], y: [2.501, 2.735], z: [-0.205, 0.205] },
    { name: 'paddle-spindle', x: [2.439, 2.561], y: [2.501, 3.08], z: [-0.061, 0.061] },
    { name: 'paddle-wheel', x: [2.212, 2.788], y: [3.032, 3.108], z: [-0.288, 0.288] },
    // Above the seat only: the beam's foot sinks 1.5 cm into the seat by design.
    {
      name: 'balance-beam',
      from: [4.8, 2.6055, 0],
      to: [6.4, 2.6055, -3.9],
      half: [0.115, 0.1045],
    },
    { name: 'lever-heel-leg', x: [4.785, 4.935], y: [2.675, 2.825], z: [-0.345, 0.005] },
    { name: 'lever-cross-leg', x: [4.855, 5.585], y: [2.675, 2.825], z: [-0.415, -0.265] },
    { name: 'lever-tail-leg', x: [5.505, 5.655], y: [2.675, 2.825], z: [-3.925, -0.335] },
    { name: 'outer-stile-and-hinges', x: [4.795, 5.04], y: [0.01, 2.495], z: [-0.125, 0.125] },
    // Off the post face it is mounted on (z 0.25).
    { name: 'lamp-plate', x: [5.205, 5.395], y: [3.485, 3.655], z: [0.255, 0.32] },
    { name: 'lamp-stand-off', x: [5.266, 5.334], y: [3.576, 3.644], z: [0.295, 0.705] },
  ]),
  // The kept post sides' front and back faces, z +-0.25 under the paired wrapper.
  postFrontZ: 0.25,
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
  retainedIndexCount: 180,
  keptIndexCount: 84,
  finalIndexCount: 216,
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
  const indexCount = final ? SPEC.finalIndexCount : SPEC.originalIndexCount;
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
  json.nodes[0].translation[2] = SPEC.nodeZAfter;
  const scale = before.node.scale,
    finalTranslation = json.nodes[0].translation;
  const near = (a, b) => Math.abs(a - b) < 1e-4;
  const rowOffset = (row) => 432 + row * 44;
  const readVec = (buffer, row, at, n) =>
    Array.from({ length: n }, (_, k) => buffer.readFloatLE(rowOffset(row) + at + k * 4));
  const sub = (p, q) => p.map((value, axis) => value - q[axis]);
  const cross = (p, q) => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
  const dot = (p, q) => p.reduce((sum, value, axis) => sum + value * q[axis], 0);

  // Kept faces: the deck and the four sides of each post, by baseline triangle
  // id, in baseline order. Every other row is rebuilt.
  const kept = SPEC.keptTriangles.flatMap((triangle) =>
    before.indices.slice(triangle * 3, triangle * 3 + 3)
  );
  assert.equal(kept.length, SPEC.keptIndexCount);
  for (const triangle of SPEC.keptTriangles)
    assert(triangle < 50 || triangle > 61, 'A kept triangle belongs to the removed arm');
  const keptRows = new Set(kept);
  const freedRows = SPEC.freedRowRanges.flatMap(([first, last]) =>
    Array.from({ length: last - first + 1 }, (_, i) => first + i)
  );
  for (const row of freedRows) assert(!keptRows.has(row), 'Freed row is still drawn: ' + row);
  assert.equal(
    keptRows.size + freedRows.length,
    SPEC.positionCount,
    'Kept and freed rows must partition the vertex buffer'
  );

  // Seat the posts: the footing rows of the kept post sides come down to the
  // ground. Only the y word of each moves; normals, UVs and palette stay.
  const footingRows = [...keptRows]
    .filter((row) => near(before.points[row][1], SPEC.postFootingBefore))
    .sort((a, b) => a - b);
  assert.equal(footingRows.length, SPEC.postFootingRows, 'Post footing ownership mismatch');
  for (const row of footingRows)
    binary.writeFloatLE(
      Math.fround((SPEC.postFootingAfter - finalTranslation[1]) / scale[1]),
      rowOffset(row) + 4
    );

  // Palettes: frames, reveals and the head band take the pinned oak, the beam
  // the pinned timber, and the two leaves the authored slate scaled per corner.
  // The old leaf and arm rows were one colour each.
  const colourOf = (buffer, row) =>
    Buffer.from(buffer.subarray(rowOffset(row) + 32, rowOffset(row) + 44));
  const authored = { leaf: colourOf(before.binary, 52), arm: colourOf(before.binary, 100) };
  for (let row = 52; row <= 123; row++)
    assert(
      colourOf(before.binary, row).equals(row < 100 ? authored.leaf : authored.arm),
      'Old leaf or arm palette is not one colour'
    );
  const rgb = (values) => {
    const out = Buffer.alloc(12);
    values.forEach((value, k) => out.writeFloatLE(value, k * 4));
    return out;
  };
  const authoredLeaf = [0, 1, 2].map((k) => authored.leaf.readFloatLE(k * 4));
  const palette = {
    frame: rgb(SPEC.palettes.frame),
    band: rgb(SPEC.palettes.band),
    timber: rgb(SPEC.palettes.timber),
  };
  assert(!palette.timber.equals(authored.arm), 'Beam must not keep the red arm colour');
  // A leaf corner's colour: the authored slate scaled from foot (y 0) to head.
  const leafColour = (leaf, y) => {
    const { foot, head } = SPEC.palettes.leafScale[leaf];
    const scale = foot + ((head - foot) * y) / SPEC.leaf.seat;
    return rgb(authoredLeaf.map((value) => value * scale));
  };
  const luminance = (bytes) =>
    [0.2126, 0.7152, 0.0722].reduce((sum, w, k) => sum + w * bytes.readFloatLE(k * 4), 0);
  // Value separation, stated: the frame reads at least three times the brighter
  // leaf, the band stands well clear of the beam, and the two leaves differ at
  // the mitre at every height by at least a third.
  const brightestLeaf = luminance(leafColour('east', SPEC.leaf.seat));
  assert(luminance(palette.frame) > 3 * brightestLeaf, 'Frame and leaf values must separate');
  assert(luminance(palette.band) > 1.5 * luminance(palette.timber), 'Beam must read on the band');
  for (const y of [0, SPEC.leaf.seat])
    assert(
      luminance(leafColour('east', y)) > (4 / 3) * luminance(leafColour('west', y)),
      'The two leaves must differ in value at the mitre'
    );

  // Each rebuilt face is laid onto the UV island of the old face it replaces,
  // stretched to fit, so it samples only that atlas rectangle.
  const island = (rows, axes) => {
    const points = rows.map((row) => axes.map((axis) => before.points[row][axis]));
    const uvs = rows.map((row) => readVec(before.binary, row, 12, 2));
    const lo = [0, 1].map((k) => Math.min(...points.map((point) => point[k])));
    const hi = [0, 1].map((k) => Math.max(...points.map((point) => point[k])));
    const at = (a, b) => {
      const i = points.findIndex((point) => near(point[0], a) && near(point[1], b));
      assert(i >= 0, 'Old UV island is not a rectangle');
      return uvs[i];
    };
    const o = at(lo[0], lo[1]),
      u = at(hi[0], lo[1]),
      v = at(lo[0], hi[1]),
      w = at(hi[0], hi[1]);
    for (let k = 0; k < 2; k++)
      assert(Math.abs(w[k] - (u[k] + v[k] - o[k])) < 1e-4, 'Old UV island is not affine');
    return (s, t) => [0, 1].map((k) => o[k] + (u[k] - o[k]) * s + (v[k] - o[k]) * t);
  };
  // The arm's UV strips (4 rows each) for the timber head beam, grain along x.
  const strip = (first) => {
    const uvs = [0, 1, 2, 3].map((k) => readVec(before.binary, first + k, 12, 2));
    const u = [Math.min(...uvs.map((uv) => uv[0])), Math.max(...uvs.map((uv) => uv[0]))];
    const v = [Math.min(...uvs.map((uv) => uv[1])), Math.max(...uvs.map((uv) => uv[1]))];
    return (s, t) => [u[0] + (u[1] - u[0]) * t, v[0] + (v[1] - v[0]) * s];
  };

  const faces = [];
  // A planar face in 3-D. `triangles` index `points`; in the face's own 2-D
  // coordinates (`uvAxes`) every triangle must turn the same way and together
  // they must cover exactly `area` (the outline's area unless given), so the
  // tiling has no overlap and no hole. Winding is derived from `normal` below.
  const addPoly = (name, part, points, triangles, normal, uvAxes, uvAt, area) => {
    const flat = points.map((point) => uvAxes.map((axis) => point[axis]));
    const twice = ([i, j, k]) =>
      (flat[j][0] - flat[i][0]) * (flat[k][1] - flat[i][1]) -
      (flat[k][0] - flat[i][0]) * (flat[j][1] - flat[i][1]);
    const signed = triangles.map(twice);
    assert(
      signed.every((value) => value > 1e-9) || signed.every((value) => value < -1e-9),
      'Inconsistent or degenerate tiling in ' + name
    );
    const outline =
      flat.reduce((sum, [x, y], i) => {
        const [nx, ny] = flat[(i + 1) % flat.length];
        return sum + x * ny - nx * y;
      }, 0) / 2;
    const covered = signed.reduce((sum, value) => sum + Math.abs(value), 0) / 2;
    assert(
      Math.abs(covered - (area ?? Math.abs(outline))) < 1e-9,
      'Tiling of ' + name + ' overlaps or leaves a hole'
    );
    const lo = uvAxes.map((axis) => Math.min(...points.map((point) => point[axis])));
    const hi = uvAxes.map((axis) => Math.max(...points.map((point) => point[axis])));
    const uvs = points.map((point) =>
      uvAt(...uvAxes.map((axis, k) => (point[axis] - lo[k]) / (hi[k] - lo[k])))
    );
    const length = Math.hypot(...normal);
    // A leaf's corners take its slate by height; every other part is one colour.
    const colours = points.map((point) =>
      part.endsWith('-leaf') ? leafColour(part.slice(0, 4), point[1]) : palette[part]
    );
    faces.push({
      name,
      part,
      normal: normal.map((value) => value / length),
      points,
      uvs,
      colours,
      triangles,
    });
  };
  // An axis-aligned face at `axis` = `value`, outlined in its other two axes.
  const addFace = (name, part, axis, value, normal, outline, triangles, uvAt, area) => {
    const [a, b] = [0, 1, 2].filter((k) => k !== axis);
    const points = outline.map(([pa, pb]) => {
      const point = [0, 0, 0];
      point[axis] = value;
      point[a] = pa;
      point[b] = pb;
      return point;
    });
    addPoly(name, part, points, triangles, normal, [a, b], uvAt, area);
  };
  const quad = (name, part, axis, value, normal, [a0, a1], [b0, b1], uvAt) =>
    addFace(
      name,
      part,
      axis,
      value,
      normal,
      [
        [a0, b0],
        [a1, b0],
        [a1, b1],
        [a0, b1],
      ],
      [
        [0, 1, 2],
        [0, 2, 3],
      ],
      uvAt
    );
  const span = (p, q) => [Math.min(p, q), Math.max(p, q)];
  const sideName = (side) => (side < 0 ? 'west' : 'east');
  const L = SPEC.leaf,
    H = SPEC.band,
    B = SPEC.beam;
  // Old leaf UV islands by side: upstream face, downstream face, top, mitre, heel.
  const islands = {
    '-1': {
      front: [68, 69, 70, 71],
      back: [72, 73, 74, 75],
      top: [60, 61, 62, 63],
      mitre: [52, 53, 54, 55],
      heel: [56, 57, 58, 59],
    },
    1: {
      front: [92, 93, 94, 95],
      back: [96, 97, 98, 99],
      top: [84, 85, 86, 87],
      mitre: [80, 81, 82, 83],
      heel: [76, 77, 78, 79],
    },
  };
  const W = islands[-1],
    E = islands[1];
  const x1 = L.heel,
    xs = L.stile,
    seat = L.seat,
    postX = 5.05;
  // The head band in plan: on face `face` (+1 upstream, -1 downstream), z at x,
  // flush with the post faces at |x| = 5.05 and out to the apex at the mitre.
  const bandZ = (face, x) =>
    face * (H.postZ + ((H.apexZ - H.postZ) * (postX - Math.abs(x))) / postX);
  // The unit normal of a planar face from two in-plane directions, turned to
  // agree with `toward`.
  const normalOf = (p, q, toward) => {
    const n = cross(p, q);
    return dot(n, toward) < 0 ? n.map((value) => -value) : n;
  };

  // Leaves. Heel stiles flush with the post faces on both faces, abutting the
  // post inner face, and one through-reveal joining each pair to the panel.
  for (const side of [-1, 1]) {
    for (const face of [1, -1])
      quad(
        `${sideName(side)}-${face > 0 ? 'upstream' : 'downstream'}-heel-stile`,
        'frame',
        2,
        face * L.frameZ,
        [0, 0, face],
        span(side * xs, side * x1),
        [0, seat],
        island(face > 0 ? islands[side].front : islands[side].back, [0, 1])
      );
    quad(
      `${sideName(side)}-heel-reveal`,
      'frame',
      0,
      side * xs,
      [-side, 0, 0],
      [0, seat],
      [-L.frameZ, L.frameZ],
      island(islands[side].heel, [1, 2])
    );
  }
  // The folded sheet, traced in plan from heel reveal to heel reveal: each
  // leaf's flat panel, then its half of the meeting ridge up to the apex at the
  // mitre. Every segment is one vertical face from the ground to the seat.
  const plan = [
    [-xs, 0],
    [-L.ridgeHalf, 0],
    [0, L.ridgeApex],
    [L.ridgeHalf, 0],
    [xs, 0],
  ];
  const segments = [
    ['west-leaf-panel', 'west-leaf', island(W.front, [0, 1])],
    // The old mitre faces stood at constant x, so their islands lie in y, z.
    ['west-meeting-ridge', 'frame', island(W.mitre, [1, 2])],
    ['east-meeting-ridge', 'frame', island(E.mitre, [1, 2])],
    ['east-leaf-panel', 'east-leaf', island(E.front, [0, 1])],
  ];
  segments.forEach(([name, part, uvAt], k) => {
    const [[xa, za], [xb, zb]] = [plan[k], plan[k + 1]];
    addPoly(
      name,
      part,
      [
        [xa, 0, za],
        [xb, 0, zb],
        [xb, seat, zb],
        [xa, seat, za],
      ],
      [
        [0, 1, 2],
        [0, 2, 3],
      ],
      normalOf([xb - xa, 0, zb - za], [0, 1, 0], [0, 0, 1]),
      [0, 1],
      uvAt
    );
  });

  // Head band. One soffit at the seat spans the whole section.
  addFace(
    'head-band-soffit',
    'band',
    1,
    seat,
    [0, -1, 0],
    [
      [-postX, bandZ(-1, -postX)],
      [0, bandZ(-1, 0)],
      [postX, bandZ(-1, postX)],
      [postX, bandZ(1, postX)],
      [0, bandZ(1, 0)],
      [-postX, bandZ(1, -postX)],
    ],
    [
      [0, 1, 4],
      [0, 4, 5],
      [1, 2, 3],
      [1, 3, 4],
    ],
    island(E.top, [0, 2])
  );
  // Each face is two planes meeting at the mitre; downstream, each half leaves
  // the balance-beam pocket at its heel.
  for (const face of [1, -1])
    for (const side of [-1, 1]) {
      const outline =
        face > 0
          ? [
              [side * postX, seat],
              [0, seat],
              [0, H.top],
              [side * postX, H.top],
            ]
          : [
              [side * postX, H.pocketTop],
              [side * H.pocketX, H.pocketTop],
              [side * H.pocketX, seat],
              [0, seat],
              [0, H.top],
              [side * postX, H.top],
            ];
      const triangles =
        face > 0
          ? [
              [0, 1, 2],
              [0, 2, 3],
            ]
          : [
              [2, 3, 4],
              [1, 2, 4],
              [0, 1, 4],
              [0, 4, 5],
            ];
      const points = outline.map(([x, y]) => [x, y, bandZ(face, x)]);
      addPoly(
        `${face > 0 ? 'upstream' : 'downstream'}-${sideName(side)}-head-band`,
        'band',
        points,
        triangles,
        normalOf(
          [side * postX, 0, bandZ(face, side * postX) - bandZ(face, 0)],
          [0, 1, 0],
          [0, 0, face]
        ),
        [0, 1],
        island(face > 0 ? islands[side].front : islands[side].back, [0, 1])
      );
    }

  // The timber: one 4 m box-section beam, lapped onto the west post's face and
  // bearing on the deck soffit. Its back is the post face, so the soffit and
  // east end run on behind the band face into the closed band.
  const [xb0, xb1] = B.x;
  quad('beam-front', 'timber', 2, B.zFront, [0, 0, 1], [xb0, xb1], [B.yBottom, B.yTop], strip(100));
  quad(
    'beam-soffit',
    'timber',
    1,
    B.yBottom,
    [0, -1, 0],
    [xb0, xb1],
    [B.zBack, B.zFront],
    strip(104)
  );
  for (const [x, out, first] of [
    [xb0, -1, 108],
    [xb1, 1, 112],
  ])
    quad(
      `${out < 0 ? 'west' : 'east'}-beam-end`,
      'timber',
      0,
      x,
      [out, 0, 0],
      [B.yBottom, B.yTop],
      [B.zBack, B.zFront],
      strip(first)
    );

  // Joints, stated as geometry.
  const keptPostRows = SPEC.keptTriangles
    .filter((triangle) => triangle >= 2 && triangle <= 25)
    .flatMap((triangle) => before.indices.slice(triangle * 3, triangle * 3 + 3));
  const postZ = keptPostRows.map((row) =>
    Math.abs(before.localPoints[row][2] * scale[2] + finalTranslation[2])
  );
  const postXs = keptPostRows.map((row) => Math.abs(before.points[row][0]));
  assert(
    postZ.every((z) => near(z, SPEC.postFrontZ)) && H.postZ === SPEC.postFrontZ,
    'Head band must meet the post faces flush'
  );
  assert(near(Math.min(...postXs), postX), 'Head band and soffit must end on the post inner faces');
  const deckRows = SPEC.keptTriangles
    .filter((triangle) => triangle < 2 || triangle > 61)
    .flatMap((triangle) => before.indices.slice(triangle * 3, triangle * 3 + 3));
  const deckSoffit = Math.min(...deckRows.map((row) => before.points[row][1]));
  assert(near(deckSoffit, H.top), 'Head band must rise to the deck soffit');
  assert.equal(L.heel, postX, 'Heel stiles must abut the post inner face');
  assert.equal(L.frameZ, SPEC.postFrontZ, 'Heel stiles must be flush with the post faces');
  assert(L.stile < postX && L.stile <= H.pocketX, 'Heel stile must show and frame the pocket');
  // The ridge stays behind the runtime planks (z 0.147 from |x| 0.107 out) and
  // turns up inside the panel span.
  assert(L.ridgeApex < 0.147 && L.ridgeHalf < xs, 'Meeting ridge must stay behind the planks');
  assert(L.ridgeApex * (1 - 0.107 / L.ridgeHalf) < 0.147, 'Ridge must clear the plank backs');
  assert(H.apexZ > H.postZ && H.apexZ < 0.5, 'Head band must stand out within the deck');
  assert(H.pocketX < postX && H.pocketTop > seat, 'Pocket must open at the heel above the seat');
  assert.equal(B.yTop, H.top, 'Beam must bear on the deck soffit');
  assert(B.zFront < 0.5, 'Beam must stand under the deck');
  assert(Math.abs(xb1 - xb0 - 4) < 1e-9 && xb1 < 0, 'Beam must be 4 m and off the centreline');
  assert(xb0 < -postX && xb0 > -5.55, 'Beam must lap onto the west post face');
  assert.equal(B.zBack, SPEC.postFrontZ, 'Beam back must bear on the post face');
  for (const x of [Math.max(xb0, -postX), xb1])
    assert(B.zFront - bandZ(1, x) >= 0.1, 'Beam must stand at least 0.1 m proud of the band');

  // Rows: every rebuilt face takes its own rows from the freed set in order.
  const newIndices = [];
  let cursor = 0;
  for (const face of faces) {
    face.rows = face.points.map(() => freedRows[cursor++]);
    face.points.forEach((point, k) => {
      const row = face.rows[k];
      point.forEach((value, axis) =>
        binary.writeFloatLE(
          Math.fround((value - finalTranslation[axis]) / scale[axis]),
          rowOffset(row) + axis * 4
        )
      );
      face.uvs[k].forEach((value, i) => binary.writeFloatLE(value, rowOffset(row) + 12 + i * 4));
      face.normal.forEach((value, axis) =>
        binary.writeFloatLE(value, rowOffset(row) + 20 + axis * 4)
      );
      face.colours[k].copy(binary, rowOffset(row) + 32);
    });
    for (const tri of face.triangles) {
      const [p, q, r] = tri.map((k) => face.points[k]);
      const facing = dot(cross(sub(q, p), sub(r, p)), face.normal);
      assert(Math.abs(facing) > 1e-6, 'Degenerate triangle in ' + face.name);
      const ordered = facing > 0 ? tri : [tri[0], tri[2], tri[1]];
      newIndices.push(...ordered.map((k) => face.rows[k]));
    }
  }
  // Unused freed rows repeat the first rebuilt rows, so no stored row lies
  // outside the drawn body and the declared range is tight.
  const spareRows = freedRows.slice(cursor);
  const firstNewRows = freedRows.slice(0, spareRows.length);
  spareRows.forEach((row, k) =>
    binary.copy(binary, rowOffset(row), rowOffset(firstNewRows[k]), rowOffset(firstNewRows[k]) + 44)
  );
  const finalIndices = [...kept, ...newIndices];
  assert.equal(finalIndices.length, SPEC.finalIndexCount, 'Index count ' + finalIndices.length);
  assert(finalIndices.length <= SPEC.originalIndexCount, 'Rebuild exceeds the index buffer');
  finalIndices.forEach((index, word) => binary.writeUInt16LE(index, word * 2));
  json.accessors[0].count = SPEC.finalIndexCount;
  const storedLocal = Array.from({ length: SPEC.positionCount }, (_, row) =>
    readVec(binary, row, 0, 3)
  );
  json.accessors[1].min = [0, 1, 2].map((axis) => Math.min(...storedLocal.map((p) => p[axis])));
  json.accessors[1].max = [0, 1, 2].map((axis) => Math.max(...storedLocal.map((p) => p[axis])));

  const bytes = pack(json, binary),
    after = inspect(bytes, true);
  assert.equal(hash(bytes), SPEC.output, 'Lock derivative output identity changed: ' + hash(bytes));
  assert.equal(bytes.length, SPEC.outputBytes, 'Lock output length ' + bytes.length);
  assert.deepEqual(after.indices, finalIndices, 'Index order drifted');
  assert.deepEqual(after.indices.slice(0, SPEC.keptIndexCount), kept, 'Kept faces drifted');

  // BIN: the index words, the footing y words and the freed rows may change;
  // every other byte (kept rows, images) is exact.
  const footingOffsets = new Set(
    footingRows.flatMap((row) => [0, 1, 2, 3].map((k) => rowOffset(row) + 4 + k))
  );
  const freedRowSet = new Set(freedRows);
  let changedBinaryBytes = 0;
  for (let offset = 0; offset < binary.length; offset++)
    if (binary[offset] !== before.binary[offset]) {
      const inRows = offset >= 432 && offset < 432 + SPEC.attributeBufferBytes;
      const row = inRows ? Math.floor((offset - 432) / 44) : -1;
      assert(
        offset < SPEC.indexBufferBytes || footingOffsets.has(offset) || freedRowSet.has(row),
        'Unexpected BIN change at ' + offset
      );
      changedBinaryBytes++;
    }
  // The POSITION accessor's declared range is exactly the stored rows' range.
  const accessor = after.json.accessors[1];
  for (let axis = 0; axis < 3; axis++) {
    const values = after.localPoints.map((point) => point[axis]);
    assert.equal(accessor.min[axis], Math.min(...values), 'Loose POSITION min');
    assert.equal(accessor.max[axis], Math.max(...values), 'Loose POSITION max');
  }
  let maximumRebuildError = 0;
  for (const face of faces)
    face.rows.forEach((row, k) => {
      for (let axis = 0; axis < 3; axis++)
        maximumRebuildError = Math.max(
          maximumRebuildError,
          Math.abs(after.points[row][axis] - face.points[k][axis])
        );
      assert(colourOf(binary, row).equals(face.colours[k]), 'Rebuilt row lost its palette');
    });
  assert(maximumRebuildError < 1e-5, 'Rebuilt rows missed their targets');
  // No drawn triangle may enter a runtime keep-out (separating-axis test
  // against a box with its own orthonormal axes and half extents).
  const meets = (triangle, box) => {
    const v = triangle.map((point) => sub(point, box.centre));
    const edges = [sub(v[1], v[0]), sub(v[2], v[1]), sub(v[0], v[2])];
    const candidates = [...box.axes, cross(edges[0], edges[1])];
    for (const edge of edges) for (const unit of box.axes) candidates.push(cross(unit, edge));
    for (const axis of candidates) {
      if (Math.hypot(...axis) < 1e-12) continue;
      const projected = v.map((point) => dot(point, axis));
      const radius = box.half.reduce((sum, h, k) => sum + h * Math.abs(dot(box.axes[k], axis)), 0);
      if (Math.min(...projected) > radius || Math.max(...projected) < -radius) return false;
    }
    return true;
  };
  const unit = (p) => p.map((value) => value / Math.hypot(...p));
  const keepOutBoxes = SPEC.keepOuts.flatMap((keepOut) =>
    [-1, 1].map((side) => {
      const name = `${side < 0 ? 'west' : 'east'}-${keepOut.name}`;
      if (keepOut.from) {
        // Oriented: along the run, up, and across, each half extent stated.
        const from = [side * keepOut.from[0], keepOut.from[1], keepOut.from[2]];
        const to = [side * keepOut.to[0], keepOut.to[1], keepOut.to[2]];
        const along = unit(sub(to, from));
        const up = [0, 1, 0];
        return {
          name,
          centre: from.map((value, k) => (value + to[k]) / 2),
          axes: [along, up, unit(cross(along, up))],
          half: [Math.hypot(...sub(to, from)) / 2 + 0.005, keepOut.half[1], keepOut.half[0]],
        };
      }
      const min = [Math.min(side * keepOut.x[0], side * keepOut.x[1]), keepOut.y[0], keepOut.z[0]];
      const max = [Math.max(side * keepOut.x[0], side * keepOut.x[1]), keepOut.y[1], keepOut.z[1]];
      return {
        name,
        centre: min.map((value, k) => (value + max[k]) / 2),
        axes: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        half: min.map((value, k) => (max[k] - value) / 2),
      };
    })
  );
  for (let t = 0; t < finalIndices.length / 3; t++) {
    const triangle = finalIndices.slice(t * 3, t * 3 + 3).map((row) => after.points[row]);
    for (const point of triangle)
      assert(point[2] >= -0.5 - 1e-6, 'Drawn geometry over the lock water');
    for (const box of keepOutBoxes)
      assert(!meets(triangle, box), `Triangle ${t} enters runtime keep-out ${box.name}`);
  }
  const restored = structuredClone(after.json);
  restored.accessors[0].count = SPEC.originalIndexCount;
  restored.accessors[1].min = before.json.accessors[1].min;
  restored.accessors[1].max = before.json.accessors[1].max;
  restored.nodes[0].translation[2] = SPEC.nodeZBefore;
  assert.deepEqual(restored, before.json, 'Unexpected JSON value change');
  assert.deepEqual(after.images, before.images, 'Embedded map change');
  assert.equal(after.indexedBounds.size[2], SPEC.expectedLength);
  // Every kept row keeps its exact live coordinate under the paired wrapper,
  // except the footing rows' y, which lands on its stated target.
  let maximumSurvivingWorldDelta = 0,
    maximumSeatingError = 0;
  for (const row of keptRows)
    for (let axis = 0; axis < 3; axis++) {
      const old = before.points[row][axis] + SPEC.wrapperBefore[axis];
      const next = after.points[row][axis] + SPEC.wrapperAfter[axis];
      if (axis === 1 && footingRows.includes(row))
        maximumSeatingError = Math.max(
          maximumSeatingError,
          Math.abs(after.points[row][1] - SPEC.postFootingAfter)
        );
      else maximumSurvivingWorldDelta = Math.max(maximumSurvivingWorldDelta, Math.abs(old - next));
    }
  assert.equal(maximumSurvivingWorldDelta, 0, 'Paired wrapper fails kept live-coordinate equality');
  assert(maximumSeatingError < 1e-5, 'Footing rows missed their targets');
  assert.equal(after.indexedBounds.min[1], before.indexedBounds.min[1], 'Ground line drifted');
  assert.equal(after.indexedBounds.size[0], before.indexedBounds.size[0], 'Width drifted');
  assert.equal(after.indexedBounds.max[1], before.indexedBounds.max[1], 'Height drifted');
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
      keptTriangleIds: SPEC.keptTriangles,
      freedRows,
      indicesBefore: SPEC.originalIndexCount,
      indicesAfter: SPEC.finalIndexCount,
      keptTriangleOrderExact: true,
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
      seatedPosts: {
        postFooting: { before: SPEC.postFootingBefore, after: SPEC.postFootingAfter },
        postRows: footingRows,
        maximumSeatingError,
        normalsUVsPaletteExact: true,
      },
      rebuild: {
        construction:
          'One gate section: a folded double-sided sheet traced in plan, flat panels at z 0 from each heel reveal turning up at the mitre into a meeting ridge (a stile with its closed joint on the apex upstream, the seam groove downstream); heel stiles flush with the post faces on both faces abutting the post inner face, joined to the panel by one through-reveal; all capped by a head band closed on both faces from the seat to the deck soffit as two planes per face meeting at the mitre, flush with the post faces at the posts, with a pocket at each downstream heel for the balance beam and lever directly above the flush stile; one 4 m box-section timber beam with square ends lapped onto the west post face and bearing on the deck soffit.',
        leaf: L,
        band: H,
        beam: B,
        pocketsForBalanceBeamAndLever: [-1, 1].map((side) => ({
          x: span(side * H.pocketX, side * postX),
          y: [seat, H.pocketTop],
        })),
        pairedRuntimeGearEnclosed:
          'The paddle housings, spindles and handwheels stand inside the closed head band and are not visible from outside; no drawn triangle enters them.',
        faces: faces.map((face) => ({
          name: face.name,
          part: face.part,
          rows: face.rows,
          triangles: face.triangles.length,
        })),
        triangles: newIndices.length / 3,
        spareRowsRepeatFirstRebuiltRows: spareRows,
        palettes: {
          ...Object.fromEntries(
            Object.entries(palette).map(([part, bytes]) => [
              part,
              [0, 1, 2].map((k) => bytes.readFloatLE(k * 4)),
            ])
          ),
          leafScale: SPEC.palettes.leafScale,
        },
        keepOuts: SPEC.keepOuts,
        maximumRebuildError,
        droppedHiddenFaces: 'post tops (inside the deck), post bottoms (on the ground)',
      },
      actualFinalBounds: after.indexedBounds,
      indexedBoundsBefore: before.indexedBounds,
      conservativeUnusedPositionBounds: after.conservativeBounds,
      conservativeBoundsAreNotVisibleIndexedBounds: true,
      jsonChanges: [
        {
          path: '/accessors/0/count',
          before: SPEC.originalIndexCount,
          after: SPEC.finalIndexCount,
        },
        {
          path: '/accessors/1/min',
          before: before.json.accessors[1].min,
          after: after.json.accessors[1].min,
        },
        {
          path: '/accessors/1/max',
          before: before.json.accessors[1].max,
          after: after.json.accessors[1].max,
        },
        { path: '/nodes/0/translation/2', before: SPEC.nodeZBefore, after: SPEC.nodeZAfter },
      ],
      jsonChunkBytesBefore: before.jsonLength,
      jsonChunkBytesAfter: after.jsonLength,
      binStartBefore: before.binStart,
      binStartAfter: after.binStart,
      binaryChunkBytes: binary.length,
      changedBinaryBytes,
      allowedChangedBINByteRange: [0, SPEC.indexBufferBytes],
      allowedChangedFootingWords: footingRows.length,
      allowedChangedRows: freedRows.length,
      imagesMaterialsBINRelativeOffsetsExact: true,
      allOtherJSONValuesExact: true,
      structuralGeometryBytes: 6768,
      structuralRenderVertexCap: 216,
      triangles: SPEC.finalIndexCount / 3,
      renderVertices: SPEC.finalIndexCount,
      storedPositions: 144,
      meshes: 1,
      materials: 1,
      textures: 2,
      textureBytes: 16236,
      images: after.images,
      finalStageOrder:
        'Immutable prepared source; legacy sizing, normalization and indexing; generator-only canonicalization; arm-index removal and paired origin; post footings grounded; leaves, head band and beam rebuilt on the freed rows. Never normalize the final body again.',
      nativeAppearanceAcceptance: false,
    },
  };
}

export function assertCurrentOutput(current, candidate) {
  assert.equal(hash(candidate), SPEC.output, 'Unreviewed lock candidate');
  assert.equal(candidate.length, SPEC.outputBytes);
  assert(
    [SPEC.baseline, ...SPEC.previousOutputs, SPEC.output].includes(hash(current)),
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
    renderVertices: SPEC.finalIndexCount,
    joints: 0,
  };
  for (const [key, value] of Object.entries(required))
    assert.equal(result[key], value, 'Stale lock row ' + key);
  assert.equal(result.blenderPreparation?.sha256, SPEC.prepared, 'Stale lock prepared source');
}
