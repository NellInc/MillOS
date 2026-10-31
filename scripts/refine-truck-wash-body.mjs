/**
 * Fixed final-stage truck-wash body derivative. No I/O or import-time execution.
 *
 * derive(input: Buffer | Uint8Array | ArrayBuffer) -> { bytes: Buffer, receipt }
 * inspect(input) -> original-only guarded inspection, without a derivative.
 *
 * Only the hash-pinned normalized delivery is accepted. Do not feed provider or
 * prepared source assets into this module. Do not change the producer's legacy
 * normalization target: these edits happen AFTER its existing normalization.
 *
 * Station frame = mesh position * node scale + node translation + the native
 * [0.275000095, 0, 0] wrapper. That wrapper and both GLB nodes are preserved.
 * Rods rotate by exact +PI/2 about station [0, 4.8, z]; nozzle Y moves +0.02 m.
 * The complete central bank (one rod plus five nozzles) also moves +1 m in Z.
 * Its resulting 3 m / 1 m bank spacing remains a visual design decision.
 * Float32 rounding occurs only when writing affected accessor components.
 */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const ORIGINAL_SHA256 = '8e2bd2e79cc7ca44cfa623b39132f9f75d0ba490943879aeb8820022ef3c6c23';
export const SPEC = Object.freeze({
  id: 'world-yard-truck-wash-body',
  slug: 'yard-truck-wash-body',
  method: 'truck-wash-spray-seating-central-bank-offset-final-stage-v1',
  baseline: ORIGINAL_SHA256,
  output: 'b89f17f01a89afbd86b387829e73004abfeb308bd8f8b5d434676407a50a0b97',
  provider: '766f606395913fad0dbcf088a5957a7b4844b3b625b02416b5b9cd33320927db',
  prepared: '53d6e4949740d28ace215f2a2fb6a8e9879d6b992fe77a014a830f9b74945e5f',
  baselineBytes: 72656,
  outputBytes: 72656,
  legacyHeight: 8.300000190734863,
  finalRuntimeHeight: 5.2,
});
const SOURCE_BYTES = SPEC.baselineBytes;
const SCALE = 11.999999310596936;
const ROOT_Y = 4.150000095367432;
const WRAPPER_X = 0.275000095;
const EPSILON_METRES = 0.000002;
const VERTICES = 1211;
const TRIANGLES = 680;
const ORIGINAL_MIN = [-0.35625001788139343, -0.34583336114883423, -0.5];
const ORIGINAL_MAX = [0.35625001788139343, 0.34583336114883423, 0.5];
const FINAL_MAX = [0.35625001788139343, 0.08749997615814209, 0.5];
const EXPECTED_NODES = [
  {
    name: 'Authored_surface_152',
    translation: [0, ROOT_Y, 0],
    scale: [SCALE, SCALE, SCALE],
    children: [1],
  },
  {
    name: 'Yard-truck-wash-bodyBody',
    extras: { authoredCastShadow: false, authoredReceiveShadow: false },
    mesh: 0,
  },
];
const EXPECTED_SCENES = [{ name: 'MillOS_World_Yard-truck-wash-body', nodes: [0] }];
const EXPECTED_VIEWS = [
  { buffer: 0, byteOffset: 57364, byteLength: 5173 },
  { buffer: 0, byteOffset: 62544, byteLength: 8025 },
  { buffer: 0, byteOffset: 0, byteLength: 4080, target: 34963 },
  { buffer: 0, byteOffset: 4080, byteLength: 53284, byteStride: 44, target: 34962 },
];
const EXPECTED_ACCESSORS = [
  { type: 'SCALAR', componentType: 5123, count: 2040, bufferView: 2, byteOffset: 0 },
  {
    type: 'VEC3',
    componentType: 5126,
    count: VERTICES,
    max: ORIGINAL_MAX,
    min: ORIGINAL_MIN,
    bufferView: 3,
    byteOffset: 0,
  },
  { type: 'VEC2', componentType: 5126, count: VERTICES, bufferView: 3, byteOffset: 12 },
  {
    name: 'Authored hard-surface normals',
    type: 'VEC3',
    componentType: 5126,
    count: VERTICES,
    bufferView: 3,
    byteOffset: 20,
  },
  {
    name: 'Authored linear palette',
    type: 'VEC3',
    componentType: 5126,
    count: VERTICES,
    bufferView: 3,
    byteOffset: 32,
  },
];
const EXPECTED_PRIMITIVE = {
  attributes: { POSITION: 1, TEXCOORD_0: 2, NORMAL: 3, COLOR_0: 4 },
  mode: 4,
  material: 0,
  indices: 0,
};
const EXPECTED_IMAGES = [
  {
    name: 'yard-truck-wash-body-normal',
    byteLength: 5173,
    sha256: 'f2e9f89a596f75ef888a598fa0bd55d9238253a3d948d73c498901fb98588e26',
  },
  {
    name: 'yard-truck-wash-body-orm',
    byteLength: 8025,
    sha256: 'ace594f1bc0af2243ff9bea6c3de6131b54b05b91b09de933c9bef6f6b26677b',
  },
];
const EXPECTED_ATTRIBUTE_HASHES = {
  indices: '7288a0aac85774f8c825dc609c53b07768334fab96fc4d64ad066ac0736d7bf0',
  uv: '5d19f13eb138570bb15a20683cd2a3bda36fa83d1af2c5d251a54d5e6a229d1c',
  color: 'df0311dd61b84002db492e387ed741e28d493144ad53afd153c5915eb1a54493',
};

export const hash = (value) => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function requireThat(condition, message) {
  if (!condition) throw new Error(`Truck-wash derivative rejected: ${message}`);
}
function near(a, b, epsilon = EPSILON_METRES) {
  return Math.abs(a - b) <= epsilon;
}
function copyInput(input) {
  requireThat(
    input instanceof Uint8Array || input instanceof ArrayBuffer,
    'input must be Buffer, Uint8Array or ArrayBuffer'
  );
  return Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
}
function parse(bytes) {
  requireThat(bytes.length >= 28, 'truncated GLB');
  requireThat(
    bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2,
    'expected GLB 2'
  );
  requireThat(bytes.readUInt32LE(8) === bytes.length, 'GLB total byte length mismatch');
  const jsonLength = bytes.readUInt32LE(12);
  requireThat(jsonLength % 4 === 0 && bytes.readUInt32LE(16) === 0x4e4f534a, 'invalid JSON chunk');
  const binHeader = 20 + jsonLength;
  requireThat(binHeader + 8 <= bytes.length, 'truncated BIN header');
  const binLength = bytes.readUInt32LE(binHeader);
  requireThat(
    binLength % 4 === 0 && bytes.readUInt32LE(binHeader + 4) === 0x004e4942,
    'invalid BIN chunk'
  );
  requireThat(binHeader + 8 + binLength === bytes.length, 'additional or truncated GLB chunks');
  const jsonText = bytes.subarray(20, binHeader).toString('utf8');
  const document = JSON.parse(jsonText);
  requireThat(
    equal(document.buffers, [{ byteLength: binLength }]),
    'external, multiple or inconsistent buffers'
  );
  return { bytes, document, jsonText, jsonLength, bin: bytes.subarray(binHeader + 8), binLength };
}
function readVec3(parsed, vertex, attributeOffset = 0) {
  const offset = 4080 + vertex * 44 + attributeOffset;
  return [0, 4, 8].map((component) => parsed.bin.readFloatLE(offset + component));
}
function station(vector) {
  return [vector[0] * SCALE + WRAPPER_X, vector[1] * SCALE + ROOT_Y, vector[2] * SCALE];
}
function unstation(vector) {
  return [(vector[0] - WRAPPER_X) / SCALE, (vector[1] - ROOT_Y) / SCALE, vector[2] / SCALE];
}
function bounds(points) {
  requireThat(points.length > 0, 'empty geometry');
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    requireThat(point.every(Number.isFinite), 'non-finite POSITION');
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}
function boundReport(parsed) {
  const raw = Array.from({ length: VERTICES }, (_, index) => readVec3(parsed, index));
  return {
    accessor: bounds(raw),
    glbScene: bounds(raw.map(([x, y, z]) => [x * SCALE, y * SCALE + ROOT_Y, z * SCALE])),
    station: bounds(raw.map(station)),
  };
}
function attributeHash(parsed, offset, length) {
  return hash(
    Buffer.concat(
      Array.from({ length: VERTICES }, (_, index) => {
        const start = 4080 + index * 44 + offset;
        return parsed.bin.subarray(start, start + length);
      })
    )
  );
}
function resources(parsed) {
  const d = parsed.document;
  const textures = d.images.map((image) => {
    const view = d.bufferViews[image.bufferView];
    requireThat(
      image.mimeType === 'image/jpeg' && image.uri === undefined,
      'image must remain embedded JPEG'
    );
    const payload = parsed.bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    return { name: image.name, byteLength: payload.length, sha256: hash(payload) };
  });
  return {
    counts: {
      positions: d.accessors[1].count,
      indices: d.accessors[0].count,
      triangles: d.accessors[0].count / 3,
      meshes: d.meshes.length,
      primitives: d.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
      materials: d.materials.length,
      textures: d.textures.length,
      images: d.images.length,
      samplers: d.samplers.length,
      nodes: d.nodes.length,
      bufferViews: d.bufferViews.length,
      binaryBytes: parsed.bin.length,
    },
    texturePayloads: textures,
    attributeHashes: {
      indices: hash(parsed.bin.subarray(0, 4080)),
      uv: attributeHash(parsed, 12, 8),
      color: attributeHash(parsed, 32, 12),
    },
  };
}
function guardedSource(input) {
  const bytes = copyInput(input);
  const actual = hash(bytes);
  requireThat(
    actual === ORIGINAL_SHA256,
    `original SHA256 required; wrong or already-derived input (${actual})`
  );
  requireThat(bytes.length === SOURCE_BYTES, 'original byte count');
  const p = parse(bytes),
    d = p.document;
  requireThat(p.jsonLength === 2052 && p.binLength === 70576, 'source chunk allocations');
  requireThat(
    equal(d.nodes, EXPECTED_NODES) && equal(d.scenes, EXPECTED_SCENES) && d.scene === 0,
    'exact node hierarchy, transforms or shadow metadata'
  );
  requireThat(
    equal(d.bufferViews, EXPECTED_VIEWS) && equal(d.accessors, EXPECTED_ACCESSORS),
    'accessor layout'
  );
  requireThat(
    d.meshes.length === 1 &&
      d.meshes[0].name === 'yard-truck-wash-body-mesh' &&
      equal(d.meshes[0].primitives, [EXPECTED_PRIMITIVE]),
    'single mesh/primitive contract'
  );
  requireThat(
    d.materials.length === 1 &&
      d.textures.length === 2 &&
      d.images.length === 2 &&
      d.samplers.length === 1,
    'material/map allocation'
  );
  const r = resources(p);
  requireThat(equal(r.texturePayloads, EXPECTED_IMAGES), 'source texture payloads');
  requireThat(
    equal(r.attributeHashes, EXPECTED_ATTRIBUTE_HASHES),
    'source indices, UVs or colours'
  );
  const b = boundReport(p);
  requireThat(
    equal(b.accessor.min, ORIGINAL_MIN) && equal(b.accessor.max, ORIGINAL_MAX),
    'source accessor or measured bounds'
  );
  requireThat(
    near(b.station.size[0], 8.55) &&
      near(b.station.size[1], 8.300000190734863) &&
      near(b.station.size[2], 12),
    'source station dimensions'
  );
  p.positions = Array.from({ length: VERTICES }, (_, index) => station(readVec3(p, index)));
  p.indices = Array.from({ length: TRIANGLES * 3 }, (_, index) => p.bin.readUInt16LE(index * 2));
  requireThat(
    p.indices.every((index) => index < VERTICES),
    'index outside POSITION accessor'
  );
  for (let index = 0; index < VERTICES; index++) {
    const normal = readVec3(p, index, 20);
    requireThat(
      normal.every(Number.isFinite) && near(Math.hypot(...normal), 1, 0.000002),
      `non-unit/non-finite NORMAL ${index}`
    );
  }
  return { parsed: p, resources: r, bounds: b };
}

// Canonical point/triangle templates describe all octagonal cylinder surfaces
// and cone surfaces, including caps. Cyclic signatures retain winding.
function faceKey(labels) {
  return [labels, [labels[1], labels[2], labels[0]], [labels[2], labels[0], labels[1]]]
    .map((items) => items.join('/'))
    .sort()[0];
}
function canonicalSurface(kind, center) {
  const rod = kind === 'rod',
    radius = rod ? 0.05 : 0.04,
    halfHeight = rod ? 3.5 : 0.05;
  const points = [],
    faces = [];
  const addPoint = (label, x, y, z) =>
    points.push({ label, position: [x + center[0], y + center[1], z + center[2]] });
  for (const level of rod ? ['t', 'b'] : ['b']) {
    const y = level === 't' ? halfHeight : -halfHeight;
    for (let index = 0; index < 8; index++) {
      const angle = (index * Math.PI) / 4;
      addPoint(`${level}${index}`, radius * Math.sin(angle), y, radius * Math.cos(angle));
    }
    addPoint(`${level}c`, 0, y, 0);
  }
  if (!rod) addPoint('a', 0, halfHeight, 0);
  for (let index = 0; index < 8; index++) {
    const next = (index + 1) % 8;
    if (rod) {
      faces.push(
        [`t${index}`, `b${index}`, `t${next}`],
        [`b${index}`, `b${next}`, `t${next}`],
        [`t${index}`, `t${next}`, 'tc']
      );
    } else faces.push([`b${index}`, `b${next}`, 'a']);
    faces.push([`b${next}`, `b${index}`, 'bc']);
  }
  return { points, faces: faces.map(faceKey).sort() };
}
function selectSurface(parsed, kind, center) {
  const template = canonicalSurface(kind, center),
    candidates = new Map();
  for (let vertex = 0; vertex < VERTICES; vertex++) {
    const matches = template.points.filter(({ position }) =>
      position.every((value, axis) => near(value, parsed.positions[vertex][axis]))
    );
    requireThat(matches.length <= 1, 'ambiguous canonical point');
    if (matches.length === 1) candidates.set(vertex, matches[0].label);
  }
  const triangles = [],
    vertices = new Set(),
    faces = [];
  for (let triangle = 0; triangle < TRIANGLES; triangle++) {
    const indices = parsed.indices.slice(triangle * 3, triangle * 3 + 3);
    // Coincident unrelated vertices must not be moved. Select complete faces,
    // not the larger pool of coordinates matching a cone tip or cap center.
    if (!indices.every((vertex) => candidates.has(vertex))) continue;
    triangles.push(triangle);
    indices.forEach((vertex) => vertices.add(vertex));
    faces.push(faceKey(indices.map((vertex) => candidates.get(vertex))));
  }
  const expectedVertices = kind === 'rod' ? 44 : 33,
    expectedTriangles = kind === 'rod' ? 32 : 16;
  requireThat(
    vertices.size === expectedVertices && triangles.length === expectedTriangles,
    `${kind} ${center}: complete surface counts`
  );
  requireThat(
    equal(faces.sort(), template.faces),
    `${kind} ${center}: complete oriented canonical topology`
  );
  const selectedTriangles = new Set(triangles);
  for (let triangle = 0; triangle < TRIANGLES; triangle++) {
    if (selectedTriangles.has(triangle)) continue;
    requireThat(
      !parsed.indices.slice(triangle * 3, triangle * 3 + 3).some((vertex) => vertices.has(vertex)),
      `${kind} ${center}: selected vertex shared with an unselected triangle`
    );
  }
  const vertexIndices = [...vertices].sort((a, b) => a - b);
  return {
    kind,
    center,
    vertexCount: vertexIndices.length,
    triangleCount: triangles.length,
    vertexIndices,
    triangleIndices: triangles,
    boundsBefore: bounds(vertexIndices.map((vertex) => parsed.positions[vertex])),
    completeOrientedSurface: true,
    sharedVerticesWithUnselectedTriangles: 0,
  };
}
function selections(parsed) {
  const result = [];
  for (const z of [-2, 0, 2]) {
    result.push(selectSurface(parsed, 'rod', [0, 4.8, z]));
    for (const x of [-3, -1.5, 0, 1.5, 3])
      result.push(selectSurface(parsed, 'nozzle', [x, 4.7, z]));
  }
  const allVertices = result.flatMap((selection) => selection.vertexIndices);
  const allTriangles = result.flatMap((selection) => selection.triangleIndices);
  requireThat(
    allVertices.length === 627 && new Set(allVertices).size === 627,
    'selected vertices must be disjoint and total 627'
  );
  requireThat(
    allTriangles.length === 336 && new Set(allTriangles).size === 336,
    'selected triangles must be disjoint and total 336'
  );
  return result;
}
function selectionTotals(items) {
  return Object.fromEntries(
    ['rod', 'nozzle'].map((kind) => {
      const selected = items.filter((item) => item.kind === kind);
      return [
        kind,
        {
          surfaces: selected.length,
          vertices: selected.reduce((sum, item) => sum + item.vertexCount, 0),
          triangles: selected.reduce((sum, item) => sum + item.triangleCount, 0),
        },
      ];
    })
  );
}

/** Read-only, original-only inspection; does not create or write output bytes. */
export function inspect(input) {
  const source = guardedSource(input),
    selected = selections(source.parsed);
  return {
    inputSha256: ORIGINAL_SHA256,
    inputBytes: source.parsed.bytes.length,
    frame: {
      wrapperTranslation: [WRAPPER_X, 0, 0],
      nodeTranslation: [0, ROOT_Y, 0],
      nodeScale: [SCALE, SCALE, SCALE],
    },
    bounds: source.bounds,
    resources: source.resources,
    selectionTotals: selectionTotals(selected),
    selections: selected,
    originalOnly: true,
  };
}
function jsonWithoutPositionBounds(document) {
  const copy = structuredClone(document);
  delete copy.accessors[1].min;
  delete copy.accessors[1].max;
  return JSON.stringify(copy);
}
function replaceUnique(text, oldValue, newValue) {
  requireThat(text.split(oldValue).length === 2, 'POSITION bounds JSON token not unique');
  return text.replace(oldValue, newValue);
}
function makeGlb(source, bin, finalBounds) {
  // Splice only the two bound tokens. Do not reserialize material, node, image,
  // extras, generator or other JSON; their original text remains byte-exact.
  const oldMax = `"max":${JSON.stringify(ORIGINAL_MAX)}`;
  const oldMin = `"min":${JSON.stringify(ORIGINAL_MIN)}`;
  const newMax = `"max":${JSON.stringify(finalBounds.max)}`;
  const newMin = `"min":${JSON.stringify(finalBounds.min)}`;
  let text = replaceUnique(source.jsonText, oldMax, newMax);
  text = replaceUnique(text, oldMin, newMin);
  const unpadded = text.replace(/ +$/, '');
  const json = Buffer.from(unpadded + ' '.repeat((4 - (Buffer.byteLength(unpadded) % 4)) % 4));
  const result = Buffer.alloc(12 + 8 + json.length + 8 + bin.length);
  source.bytes.copy(result, 0, 0, 12);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(json.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  json.copy(result, 20);
  const binHeader = 20 + json.length;
  result.writeUInt32LE(bin.length, binHeader);
  result.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(result, binHeader + 8);
  const restored = replaceUnique(
    replaceUnique(json.toString('utf8'), newMax, oldMax),
    newMin,
    oldMin
  );
  requireThat(
    restored.replace(/ +$/, '') === source.jsonText.replace(/ +$/, ''),
    'unrelated JSON text changed'
  );
  return result;
}

/** Produce a new in-memory GLB and custody receipt; never mutate the input. */
export function derive(input, options = {}) {
  requireThat(equal(options, {}), 'caller-selected operations are forbidden');
  const before = guardedSource(input),
    source = before.parsed;
  const selected = selections(source);
  const bin = Buffer.from(source.bin),
    allowed = new Uint8Array(bin.length);
  let allowedBytes = 0;
  const write = (vertex, componentOffset, value) => {
    const offset = 4080 + vertex * 44 + componentOffset;
    requireThat(Number.isFinite(value), 'attempted non-finite write');
    for (let byte = offset; byte < offset + 4; byte++) {
      requireThat(allowed[byte] === 0, 'overlapping component writes');
      allowed[byte] = 1;
      allowedBytes++;
    }
    bin.writeFloatLE(value, offset);
  };
  for (const selection of selected) {
    const bankShiftZ = selection.center[2] === 0 ? 1 : 0;
    selection.bankTranslation = [0, 0, bankShiftZ];
    selection.finalCenter = [
      selection.center[0],
      selection.center[1] + (selection.kind === 'nozzle' ? 0.02 : 0),
      selection.center[2] + bankShiftZ,
    ];
    for (const vertex of selection.vertexIndices) {
      const position = source.positions[vertex];
      if (selection.kind === 'rod') {
        // +PI/2: (dx, dy) -> (-dy, dx). Use the authored center, not
        // a rounded measured bound center. The separate central-bank Z
        // translation below changes Z only for that one bank.
        const rotated = unstation([-(position[1] - 4.8), 4.8 + position[0], position[2]]);
        write(vertex, 0, rotated[0]);
        write(vertex, 4, rotated[1]);
        const normal = readVec3(source, vertex, 20);
        write(vertex, 20, -normal[1]);
        write(vertex, 24, normal[0]);
      } else {
        // Uniform scale and no rotation in the pinned parent hierarchy.
        write(vertex, 4, readVec3(source, vertex)[1] + 0.02 / SCALE);
      }
      if (bankShiftZ !== 0) write(vertex, 8, readVec3(source, vertex)[2] + bankShiftZ / SCALE);
    }
  }
  requireThat(
    allowedBytes === 132 * 16 + 495 * 4 + (44 + 5 * 33) * 4,
    'affected component byte budget'
  );
  const provisional = { ...source, bin };
  const afterBounds = boundReport(provisional);
  requireThat(
    equal(afterBounds.accessor.min, ORIGINAL_MIN) && equal(afterBounds.accessor.max, FINAL_MAX),
    'final accessor bounds'
  );
  requireThat(
    near(afterBounds.station.size[0], 8.55) &&
      near(afterBounds.station.size[1], 5.2) &&
      near(afterBounds.station.size[2], 12),
    'final dimensions must be 8.55 x 5.2 x 12 m'
  );
  requireThat(
    near(afterBounds.station.min[1], 0) && near(afterBounds.station.max[1], 5.2),
    'final floor/canopy limits'
  );
  for (const selection of selected) {
    const afterPositions = selection.vertexIndices.map((vertex) =>
      station(readVec3(provisional, vertex))
    );
    selection.boundsAfter = bounds(afterPositions);
    for (const vertex of selection.vertexIndices) {
      const a = source.positions[vertex],
        b = station(readVec3(provisional, vertex));
      const shiftZ = selection.bankTranslation[2];
      const expected =
        selection.kind === 'rod'
          ? [-(a[1] - 4.8), 4.8 + a[0], a[2] + shiftZ]
          : [a[0], a[1] + 0.02, a[2] + shiftZ];
      requireThat(
        b.every((value, axis) => near(value, expected[axis])),
        `prescribed transform of vertex ${vertex}`
      );
      const normal = readVec3(provisional, vertex, 20),
        oldNormal = readVec3(source, vertex, 20);
      const expectedNormal =
        selection.kind === 'rod' ? [-oldNormal[1], oldNormal[0], oldNormal[2]] : oldNormal;
      requireThat(
        normal.every((value, axis) => Object.is(value, Math.fround(expectedNormal[axis]))),
        `NORMAL transform of vertex ${vertex}`
      );
      requireThat(near(Math.hypot(...normal), 1, 0.000002), `final unit NORMAL ${vertex}`);
    }
    const [x, , z] = selection.finalCenter;
    const expectedMin =
      selection.kind === 'rod' ? [-3.5, 4.75, z - 0.05] : [x - 0.04, 4.67, z - 0.04];
    const expectedMax =
      selection.kind === 'rod' ? [3.5, 4.85, z + 0.05] : [x + 0.04, 4.77, z + 0.04];
    requireThat(
      selection.boundsAfter.min.every((value, axis) => near(value, expectedMin[axis])) &&
        selection.boundsAfter.max.every((value, axis) => near(value, expectedMax[axis])),
      `${selection.kind} ${selection.center}: final part bounds`
    );
  }
  let changedBytes = 0,
    preservedBytes = 0;
  const unchangedBefore = [],
    unchangedAfter = [];
  for (let byte = 0; byte < bin.length; byte++) {
    if (bin[byte] !== source.bin[byte]) {
      changedBytes++;
      requireThat(allowed[byte] === 1, `unrelated binary byte changed at ${byte}`);
    }
    if (allowed[byte] === 0) {
      preservedBytes++;
      unchangedBefore.push(source.bin[byte]);
      unchangedAfter.push(bin[byte]);
    }
  }
  requireThat(changedBytes > 0, 'derivative did not change any bytes');
  const bytes = makeGlb(source, bin, afterBounds.accessor),
    output = parse(bytes);
  requireThat(
    hash(bytes) === SPEC.output && bytes.length === SPEC.outputBytes,
    'unreviewed final output identity'
  );
  const afterResources = resources(output);
  requireThat(
    equal(before.resources, afterResources),
    'resource allocations, texture payloads, indices, UVs or colours changed'
  );
  requireThat(
    jsonWithoutPositionBounds(source.document) === jsonWithoutPositionBounds(output.document),
    'JSON data other than POSITION bounds changed'
  );
  requireThat(
    equal(output.document.accessors[1].min, afterBounds.accessor.min) &&
      equal(output.document.accessors[1].max, afterBounds.accessor.max),
    'written POSITION accessor bounds mismatch'
  );
  requireThat(hash(source.bytes) === ORIGINAL_SHA256, 'source buffer was mutated');
  const preservedBeforeHash = hash(Buffer.from(unchangedBefore)),
    preservedAfterHash = hash(Buffer.from(unchangedAfter));
  requireThat(preservedBeforeHash === preservedAfterHash, 'unrelated binary byte digest');
  return {
    bytes,
    receipt: {
      method: SPEC.method,
      legacyPreDerivationSizingMetres: SPEC.legacyHeight,
      finalRuntimeHeightMetres: SPEC.finalRuntimeHeight,
      actualFinalBounds: afterBounds.glbScene,
      sourceInputs: { providerSha256: SPEC.provider, preparedSha256: SPEC.prepared },
      finalStageOrder:
        'Immutable source; legacy sizing, texture compression and indexing; pinned spray derivative. Never normalize this output again.',
      inputSha256: ORIGINAL_SHA256,
      outputSha256: hash(bytes),
      inputBytes: source.bytes.length,
      outputBytes: bytes.length,
      frame: {
        wrapperTranslation: [WRAPPER_X, 0, 0],
        nodeTranslation: [0, ROOT_Y, 0],
        nodeScale: [SCALE, SCALE, SCALE],
      },
      operations: {
        rods: { rotationAxis: 'Z', radians: Math.PI / 2, centerY: 4.8, transformsNormals: true },
        nozzles: { translation: [0, 0.02, 0], transformsNormals: false },
        centralBank: { sourceZ: 0, translation: [0, 0, 1], rodSurfaces: 1, nozzleSurfaces: 5 },
      },
      selectionTotals: selectionTotals(selected),
      selectedVertices: 627,
      selectedTriangles: 336,
      selections: selected,
      boundsBefore: before.bounds,
      boundsAfter: afterBounds,
      geometricIntent: {
        finalBankCentersZ: [-2, 1, 2],
        bankSpacingsMetres: [3, 1],
        visualDesignBasis:
          'Uneven bank spacing is the retained matched-reference geometry hypothesis; native appearance remains unaccepted.',
        intentionalMountingOverlaps: {
          pipeIntoCanopyUndersideNominalMetres: 0.05,
          nozzleTipIntoPipeNominalMetres: 0.02,
          basis:
            'Authored pipe Y envelope 4.75..4.85, canopy underside Y=4.8, translated nozzle tip Y=4.77; these are intended mount penetrations.',
        },
        conservativeCentralBankToSideBrushSweepClearance: {
          sideBrushMaximumRadialEnvelopeMetres: Math.hypot(0.7, 0.05),
          rodGapAlongZMetres: 1 - 0.05 - Math.hypot(0.7, 0.05),
          nozzleGapAlongZMetres: 1 - 0.04 - Math.hypot(0.7, 0.05),
          basis:
            'Positive separating-Z gap against the existing side-brush full-revolution radial envelope; not a renderer or triangle-collision acceptance.',
        },
      },
      resourcesBefore: before.resources,
      resourcesAfter: afterResources,
      texturePayloads: before.resources.texturePayloads.map((texture, index) => ({
        name: texture.name,
        byteLength: texture.byteLength,
        beforeSha256: texture.sha256,
        afterSha256: afterResources.texturePayloads[index].sha256,
        unchanged: true,
      })),
      custody: {
        allowedComponentBytes: allowedBytes,
        changedBinaryBytes: changedBytes,
        preservedBinaryBytes: preservedBytes,
        preservedBinaryBeforeSha256: preservedBeforeHash,
        preservedBinaryAfterSha256: preservedAfterHash,
        originalInputUnmodified: true,
        allUnrelatedBinaryBytesIdentical: true,
        unrelatedJsonTextIdentical: true,
        onlyJsonChanges: [
          'accessors[1].min',
          'accessors[1].max',
          'JSON alignment padding if needed',
        ],
        originalBinaryAllocationRetained: true,
        originalHierarchyAndTransformsRetained: true,
        indicesUvsColoursMaterialsMapsAndShadowFlagsRetained: true,
        completeOrientedSelections: true,
        selectedVerticesSharedWithUnselectedTriangles: 0,
        sourceBoundsChecked: true,
        finalBoundsChecked: true,
        resourceChecksPassed: true,
      },
      limits: [
        'Static body derivative only; no dynamic brush change.',
        'This byte receipt does not establish native rendering, shader, performance or full-assembly acceptance.',
      ],
    },
  };
}

/** Immutable source identities are checked by both producer and provenance writer. */
export function assertSourceInputs(provider, prepared) {
  requireThat(hash(provider) === SPEC.provider, 'immutable provider source changed');
  requireThat(hash(prepared) === SPEC.prepared, 'immutable prepared source changed');
}

/** Only the pinned baseline or the already-current final delivery may be replaced. */
export function assertCurrentOutput(current, candidate) {
  requireThat(
    hash(candidate) === SPEC.output && candidate.length === SPEC.outputBytes,
    'unreviewed candidate output'
  );
  requireThat(
    [SPEC.baseline, SPEC.output].includes(hash(current)),
    'unexpected current delivery; refuse overwrite'
  );
}
