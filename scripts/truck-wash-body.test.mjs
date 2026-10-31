// @vitest-environment node
/** Delivered-byte regressions. Tests never rewrite assets or execute the producer. */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const BASELINE = '8e2bd2e79cc7ca44cfa623b39132f9f75d0ba490943879aeb8820022ef3c6c23';
const SCALE = 11.999999310596936;
const ROOT_Y = 4.150000095367432;
const WRAPPER_X = 0.275000095;
const EPS = 0.000002;
const near = (actual, expected, label) =>
  assert.ok(
    Math.abs(actual - expected) <= EPS,
    `${label}: expected ${expected}, received ${actual}`
  );
function parse(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const bin = bytes.subarray(28 + jsonLength);
  const vector = (vertex, offset = 0) =>
    [0, 4, 8].map((axis) => bin.readFloatLE(4080 + 44 * vertex + offset + axis));
  const positions = Array.from({ length: 1211 }, (_, vertex) => {
    const [x, y, z] = vector(vertex);
    return [x * SCALE + WRAPPER_X, y * SCALE + ROOT_Y, z * SCALE];
  });
  const triangles = Array.from({ length: 680 }, (_, triangle) =>
    [0, 1, 2].map((corner) => bin.readUInt16LE((triangle * 3 + corner) * 2))
  );
  return { bytes, json, bin, vector, positions, triangles };
}
const before = parse(read('src/test/fixtures/yard-truck-wash-body.baseline.glb'));
const delivered = parse(read('public/models/world/yard-truck-wash-body.glb'));
const faceKey = (labels) =>
  [labels, [labels[1], labels[2], labels[0]], [labels[2], labels[0], labels[1]]]
    .map((values) => values.join('/'))
    .sort()[0];
function select(kind, x, z) {
  const rod = kind === 'rod';
  const radius = rod ? 0.05 : 0.04;
  const halfHeight = rod ? 3.5 : 0.05;
  const y = rod ? 4.8 : 4.7;
  const points = new Map();
  const faces = [];
  for (const level of rod ? ['t', 'b'] : ['b']) {
    const height = level === 't' ? halfHeight : -halfHeight;
    for (let index = 0; index < 8; index++) {
      const angle = (index * Math.PI) / 4;
      points.set(`${level}${index}`, [
        x + radius * Math.sin(angle),
        y + height,
        z + radius * Math.cos(angle),
      ]);
    }
    points.set(`${level}c`, [x, y + height, z]);
  }
  if (!rod) points.set('a', [x, y + halfHeight, z]);
  for (let index = 0; index < 8; index++) {
    const next = (index + 1) % 8;
    if (rod)
      faces.push(
        [`t${index}`, `b${index}`, `t${next}`],
        [`b${index}`, `b${next}`, `t${next}`],
        [`t${index}`, `t${next}`, 'tc']
      );
    else faces.push([`b${index}`, `b${next}`, 'a']);
    faces.push([`b${next}`, `b${index}`, 'bc']);
  }
  const labels = new Map();
  before.positions.forEach((position, vertex) => {
    const matches = [...points].filter(([, point]) =>
      point.every((value, axis) => Math.abs(value - position[axis]) < EPS)
    );
    assert.ok(matches.length <= 1, 'Canonical points must be unambiguous');
    if (matches.length) labels.set(vertex, matches[0][0]);
  });
  const triangles = before.triangles.flatMap((vertices, index) =>
    vertices.every((vertex) => labels.has(vertex)) ? [index] : []
  );
  const vertices = [...new Set(triangles.flatMap((index) => before.triangles[index]))];
  assert.equal(triangles.length, rod ? 32 : 16, `${kind} ${x},${z}: complete faces`);
  assert.equal(vertices.length, rod ? 44 : 33, `${kind} ${x},${z}: complete vertices`);
  assert.deepEqual(
    triangles
      .map((index) => faceKey(before.triangles[index].map((vertex) => labels.get(vertex))))
      .sort(),
    faces.map(faceKey).sort()
  );
  const owned = new Set(vertices);
  before.triangles.forEach((indices, index) => {
    if (!triangles.includes(index))
      assert.ok(
        indices.every((vertex) => !owned.has(vertex)),
        'Selected vertex shared outside its surface'
      );
  });
  return { kind, center: [x, y, z], vertices, triangles };
}
const selected = [-2, 0, 2].flatMap((z) => [
  select('rod', 0, z),
  ...[-3, -1.5, 0, 1.5, 3].map((x) => select('nozzle', x, z)),
]);
function bounds(points) {
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
  return { min, max, size: max.map((value, axis) => value - min[axis]) };
}

test('truck-wash baseline pins complete disjoint rod and nozzle topology', () => {
  assert.equal(digest(before.bytes), BASELINE);
  assert.equal(before.bytes.length, 72656);
  assert.equal(new Set(selected.flatMap((part) => part.vertices)).size, 627);
  assert.equal(new Set(selected.flatMap((part) => part.triangles)).size, 336);
  assert.equal(selected.filter((part) => part.kind === 'rod').length, 3);
  assert.equal(selected.filter((part) => part.kind === 'nozzle').length, 15);
});

test('delivered truck-wash rods rotate POSITION and NORMAL by positive quarter-turn around Z', () => {
  for (const part of selected.filter((part) => part.kind === 'rod')) {
    for (const vertex of part.vertices) {
      const a = before.positions[vertex],
        b = delivered.positions[vertex];
      near(b[0], -(a[1] - 4.8), `rod ${part.center[2]} vertex ${vertex} X`);
      near(b[1], 4.8 + a[0], `rod ${part.center[2]} vertex ${vertex} Y`);
      const normal = before.vector(vertex, 20);
      assert.deepEqual(
        delivered.vector(vertex, 20),
        [-normal[1], normal[0], normal[2]].map(Math.fround)
      );
    }
    const measured = bounds(part.vertices.map((vertex) => delivered.positions[vertex]));
    near(measured.size[0], 7, 'Horizontal rod span');
    near(measured.min[1], 4.75, 'Rod lower surface');
    near(measured.max[1], 4.85, 'Rod upper surface');
  }
});

test('delivered truck-wash raises all fifteen complete nozzles by 20 mm without rotating normals', () => {
  for (const part of selected.filter((part) => part.kind === 'nozzle')) {
    for (const vertex of part.vertices) {
      near(
        delivered.positions[vertex][1],
        before.positions[vertex][1] + 0.02,
        `Nozzle ${part.center} vertex ${vertex} Y`
      );
      near(delivered.positions[vertex][0], before.positions[vertex][0], 'Nozzle X');
      assert.deepEqual(delivered.vector(vertex, 20), before.vector(vertex, 20));
    }
  }
});

test('delivered truck-wash moves the complete middle bank one metre in Z and leaves outer banks fixed', () => {
  for (const part of selected) {
    const delta = part.center[2] === 0 ? 1 : 0;
    for (const vertex of part.vertices)
      near(
        delivered.positions[vertex][2],
        before.positions[vertex][2] + delta,
        `${part.kind} ${part.center} vertex ${vertex} Z`
      );
  }
});

test('delivered truck-wash retains counts maps UVs colours hierarchy shadow flags and every unrelated byte', () => {
  const allowed = new Set();
  for (const part of selected) {
    const offsets = part.kind === 'rod' ? [0, 4, 20, 24] : [4];
    if (part.center[2] === 0) offsets.push(8);
    for (const vertex of part.vertices)
      for (const offset of offsets)
        for (let byte = 0; byte < 4; byte++) allowed.add(4080 + vertex * 44 + offset + byte);
  }
  assert.equal(allowed.size, 4928);
  assert.equal(delivered.bin.length, before.bin.length);
  for (let index = 0; index < before.bin.length; index++)
    if (!allowed.has(index))
      assert.equal(delivered.bin[index], before.bin[index], `Unexpected binary change at ${index}`);
  const restored = structuredClone(delivered.json);
  restored.accessors[1].min = before.json.accessors[1].min;
  restored.accessors[1].max = before.json.accessors[1].max;
  assert.deepEqual(restored, before.json);
  assert.equal(delivered.json.accessors[0].count, 2040);
  assert.equal(delivered.json.accessors[0].count / 3, 680);
  assert.equal(delivered.json.accessors[1].count, 1211);
  assert.equal(delivered.json.meshes.length, 1);
  assert.equal(delivered.json.meshes[0].primitives.length, 1);
  assert.equal(delivered.json.materials.length, 1);
  assert.equal(delivered.json.images.length, 2);
  const expected = [
    'f2e9f89a596f75ef888a598fa0bd55d9238253a3d948d73c498901fb98588e26',
    'ace594f1bc0af2243ff9bea6c3de6131b54b05b91b09de933c9bef6f6b26677b',
  ];
  delivered.json.images.forEach((image, index) => {
    const view = delivered.json.bufferViews[image.bufferView];
    assert.equal(
      digest(delivered.bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)),
      expected[index]
    );
  });
});

test('delivered truck-wash measures 8.55 by 5.2 by 12 metres with truthful accessor extrema', () => {
  const measured = bounds(delivered.positions);
  [8.55, 5.2, 12].forEach((value, axis) =>
    near(measured.size[axis], value, `Delivered dimension ${axis}`)
  );
  near(measured.min[1], 0, 'Ground');
  near(measured.max[1], 5.2, 'Canopy top');
  const raw = bounds(Array.from({ length: 1211 }, (_, vertex) => delivered.vector(vertex)));
  assert.deepEqual(delivered.json.accessors[1].min, raw.min);
  assert.deepEqual(delivered.json.accessors[1].max, raw.max);
  assert.deepEqual(delivered.json.nodes, before.json.nodes);
});
