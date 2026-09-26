/** Transfer the retained silo atlas to the live, shallower corrugated shell.
 * Working if only positions and normals change, every retained face maps once,
 * and only the original 64 zero-area pole faces are absent from the atlas.
 */
import console from 'node:console';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { transform } from 'esbuild';
import * as THREE from 'three';

const source =
  'assets/source/models/world/machine-silo-unit-authored-vertex-colour-tripo-finish.glb';
const authored = 'assets/source/models/world/machine-silo-unit-geometry.json';
const implementation = 'src/components/machines/CompactMachines.tsx';
const output = 'assets/source/models/world/machine-silo-unit-shallow-profile.glb';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashArray = (a) => hash(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const sourceBytes = await readFile(source);
const authoredBytes = await readFile(authored);
const implementationBytes = await readFile(implementation);
// Load the actual pure constructor without booting React or copying its shape.
const match = implementationBytes
  .toString()
  .match(/function createSiloShellGeometry\(\)[\s\S]*?\n}\n/);
if (!match) throw new Error('Live silo constructor was not found');
const compiled = await transform(match[0], { loader: 'ts' });
const geometry = new Function('THREE', compiled.code + '\nreturn createSiloShellGeometry();')(
  THREE
).toNonIndexed();
const p = geometry.getAttribute('position'),
  n = geometry.getAttribute('normal');
const old = JSON.parse(authoredBytes)
  .variants.flatMap((v) => v.parts)
  .flatMap((part) => part.positions);
if (old.length !== p.count * 3 || p.count !== 31104)
  throw new Error('Live shell no longer has the retained 10368-face topology');
const lo = [Infinity, Infinity, Infinity],
  hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < old.length; i++) {
  lo[i % 3] = Math.min(lo[i % 3], old[i]);
  hi[i % 3] = Math.max(hi[i % 3], old[i]);
}
const span = Math.max(...hi.map((v, i) => v - lo[i]));
const centre = hi.map((v, i) => (v + lo[i]) / 2);
const oldPoints = Array.from({ length: p.count }, (_, i) => [0, 1, 2].map((k) => old[i * 3 + k]));
let maxOrderError = 0;
for (let i = 0; i < p.count; i++) {
  const point = oldPoints[i],
    radius = Math.hypot(point[0], point[2]);
  const targetRadius = radius > 1e-6 ? 1 - (1 - radius) / 3 : 0;
  const expected = [
    radius ? (point[0] * targetRadius) / radius : 0,
    point[1],
    radius ? (point[2] * targetRadius) / radius : 0,
  ];
  const actual = [p.getX(i), p.getY(i), p.getZ(i)];
  maxOrderError = Math.max(maxOrderError, Math.hypot(...actual.map((v, k) => v - expected[k])));
}
if (maxOrderError > 3e-6)
  throw new Error(`Authored corner order or shallow profile changed: ${maxOrderError}`);
const pointKey = (point) => point.map((v) => Math.round(v * 1e4)).join(',');
const triangleKey = (points) =>
  [0, 1, 2].map((s) => [0, 1, 2].map((k) => pointKey(points[(k + s) % 3])).join('|')).sort()[0];
const candidates = new Map();
const cells = new Map();
const tolerance = 3e-6;
const cell = (point) => point.map((v) => Math.floor(v / tolerance));
const normalized = oldPoints.map((point) => point.map((v, k) => (v - centre[k]) / span));
for (let i = 0; i < p.count; i += 3) {
  const points = normalized.slice(i, i + 3),
    key = triangleKey(points);
  if (!candidates.has(key)) candidates.set(key, []);
  const candidate = { i, points };
  candidates.get(key).push(candidate);
  for (const point of points) {
    const key = cell(point).join(',');
    if (!cells.has(key)) cells.set(key, new Set());
    cells.get(key).add(candidate);
  }
}
const io = new NodeIO(),
  document = await io.readBinary(new Uint8Array(sourceBytes));
const root = document.getRoot();
if (
  root.listMeshes().length !== 1 ||
  root.listMeshes()[0].listPrimitives().length !== 1 ||
  root.listAnimations().length ||
  root.listSkins().length
)
  throw new Error('Expected one rigid retained silo primitive');
for (const node of root.listNodes()) {
  if (
    node.getTranslation().some((v) => v !== 0) ||
    node.getScale().some((v) => v !== 1) ||
    node.getRotation().some((v, i) => v !== (i === 3 ? 1 : 0))
  )
    throw new Error('Unexpected retained node transform');
}
const primitive = root.listMeshes()[0].listPrimitives()[0];
const sourcePosition = primitive.getAttribute('POSITION'),
  indices = primitive.getIndices();
if (indices?.getCount() !== 30912 || sourcePosition.getCount() !== 30912)
  throw new Error('Expected 10304 retained faces with independent corners');
const stable = (prim, rt) => ({
  attributes: Object.fromEntries(
    prim
      .listSemantics()
      .filter((s) => !['POSITION', 'NORMAL'].includes(s))
      .map((s) => [s, hashArray(prim.getAttribute(s).getArray())])
  ),
  indices: hashArray(prim.getIndices().getArray()),
  textures: rt.listTextures().map((t) => hash(t.getImage())),
});
const before = stable(primitive, root),
  newPositions = new Float32Array(sourcePosition.getCount() * 3),
  newNormals = new Float32Array(newPositions.length);
const usedTriangles = new Set(),
  usedVertices = new Set();
let maxCorrespondenceError = 0;
for (let i = 0; i < indices.getCount(); i += 3) {
  const vertices = [0, 1, 2].map((k) => indices.getScalar(i + k));
  const points = vertices.map((v) => sourcePosition.getElement(v, []));
  const matches = [];
  const nearby = new Set(candidates.get(triangleKey(points)) ?? []);
  const [x, y, z] = cell(points[0]);
  // Float32 values can straddle a decimal key boundary. Neighbour cells only
  // nominate candidates; actual point distances and winding still decide.
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (const candidate of cells.get([x + dx, y + dy, z + dz].join(',')) ?? [])
          nearby.add(candidate);
  for (const candidate of nearby) {
    for (let shift = 0; shift < 3; shift++) {
      const error = Math.max(
        ...points.map((point, k) =>
          Math.hypot(...point.map((v, a) => v - candidate.points[(k + shift) % 3][a]))
        )
      );
      if (error < 3e-6) matches.push({ ...candidate, shift, error });
    }
  }
  if (matches.length !== 1 || usedTriangles.has(matches[0].i))
    throw new Error(
      `Ambiguous retained face ${i / 3}: ${matches.length} matches; key candidates ${candidates.get(triangleKey(points))?.length ?? 0}; points ${JSON.stringify(points)}`
    );
  const match = matches[0];
  usedTriangles.add(match.i);
  maxCorrespondenceError = Math.max(maxCorrespondenceError, match.error);
  vertices.forEach((vertex, k) => {
    if (usedVertices.has(vertex)) throw new Error('Retained corners are shared');
    usedVertices.add(vertex);
    const corner = match.i + ((k + match.shift) % 3);
    newPositions.set([p.getX(corner), p.getY(corner), p.getZ(corner)], vertex * 3);
    newNormals.set([n.getX(corner), n.getY(corner), n.getZ(corner)], vertex * 3);
  });
}
let poleSlivers = 0;
for (let i = 0; i < p.count; i += 3) {
  if (usedTriangles.has(i)) continue;
  const points = oldPoints.slice(i, i + 3).map((v) => new THREE.Vector3(...v));
  const area = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).length();
  if (area > 1e-10 || points.some((point) => Math.abs(Math.abs(point.y) - 0.5) > 1e-6))
    throw new Error(`A nondegenerate authored face is absent: ${i / 3}`);
  poleSlivers++;
}
if (poleSlivers !== 64 || usedVertices.size !== sourcePosition.getCount())
  throw new Error('Incomplete retained face coverage');
primitive.getAttribute('POSITION').setArray(newPositions);
primitive.getAttribute('NORMAL').setArray(newNormals);
const bytes = await io.writeBinary(document),
  checked = await io.readBinary(bytes);
const check = checked.getRoot().listMeshes()[0].listPrimitives()[0];
if (JSON.stringify(stable(check, checked.getRoot())) !== JSON.stringify(before))
  throw new Error('Serialized atlas attributes changed');
for (const [semantic, expected] of [
  ['POSITION', newPositions],
  ['NORMAL', newNormals],
]) {
  const actual = check.getAttribute(semantic).getArray();
  if (actual.length !== expected.length || actual.some((v, i) => v !== expected[i]))
    throw new Error(`Serialized ${semantic} changed`);
}
await writeFile(output, bytes);
const report = {
  source,
  sourceSha256: hash(sourceBytes),
  authored,
  authoredSha256: hash(authoredBytes),
  implementation,
  implementationSha256: hash(implementationBytes),
  output,
  outputSha256: hash(bytes),
  triangles: usedTriangles.size,
  corners: usedVertices.size,
  omittedOriginalPoleSlivers: poleSlivers,
  maxOrderError,
  maxCorrespondenceError,
  preservedAtlas: before,
  note: 'Local topology-preserving shallow-profile derivative. Original provider and authored-atlas files are unchanged.',
};
await writeFile(output.replace(/\.glb$/, '.json'), JSON.stringify(report, null, 2) + '\n');
geometry.dispose();
console.log(JSON.stringify(report, null, 2));
