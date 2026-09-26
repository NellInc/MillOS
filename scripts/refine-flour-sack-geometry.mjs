/**
 * Reshape the existing sack atlas onto the current authored pillow profile.
 * No texture upload, rebake, remeshing or change to the 84-triangle topology.
 * Working if every source corner maps once and the serialized UVs, palette,
 * texture bytes and index stream remain identical to the retained source.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { createServer } from 'vite';

const source = 'assets/source/models/world/flour-sack-unit-authored-vertex-colour-tripo-finish.glb';
const authored = 'assets/source/models/world/flour-sack-unit-geometry.json';
const output = 'assets/source/models/world/flour-sack-unit-pillow-profile.glb';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashArray = (array) => hash(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
const sourceBytes = await readFile(source);
const old = JSON.parse(await readFile(authored, 'utf8')).variants.flatMap((v) => v.parts);
const oldPositions = old.flatMap((p) => p.positions);
const oldUV = old.flatMap((p) => p.sourceUV);
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom',
});
let geometry;
try {
  const live = await server.ssrLoadModule('/src/utils/flourSacks.ts');
  geometry = live.getFlourSackGeometry().toNonIndexed();
} finally {
  await server.close();
}
const positions = geometry.getAttribute('position');
const normals = geometry.getAttribute('normal');
const uv = geometry.getAttribute('uv');
if (positions.count * 3 !== oldPositions.length || positions.count !== 252)
  throw new Error('The current sack no longer has the retained atlas topology');
if (oldUV.length !== uv.array.length || oldUV.some((v, i) => Math.abs(v - uv.array[i]) > 1e-6))
  throw new Error('Authored corner order no longer matches the retained UV source');
const lo = [Infinity, Infinity, Infinity],
  hi = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < oldPositions.length; i++) {
  const axis = i % 3;
  lo[axis] = Math.min(lo[axis], oldPositions[i]);
  hi[axis] = Math.max(hi[axis], oldPositions[i]);
}
const scale = Math.max(...hi.map((v, i) => v - lo[i]));
const centre = hi.map((v, i) => (v + lo[i]) / 2);
const oldPoints = Array.from({ length: positions.count }, (_, i) =>
  [0, 1, 2].map((k) => (oldPositions[i * 3 + k] - centre[k]) / scale)
);
const io = new NodeIO();
const document = await io.readBinary(new Uint8Array(sourceBytes));
const root = document.getRoot();
if (
  root.listMeshes().length !== 1 ||
  root.listMeshes()[0].listPrimitives().length !== 1 ||
  root.listAnimations().length ||
  root.listSkins().length
)
  throw new Error('Expected the single rigid retained sack primitive');
for (const node of root.listNodes()) {
  if (
    node.getTranslation().some((v) => v !== 0) ||
    node.getScale().some((v) => v !== 1) ||
    node.getRotation().some((v, i) => v !== (i === 3 ? 1 : 0))
  )
    throw new Error('Retained atlas has an unexpected node transform');
}
const primitive = root.listMeshes()[0].listPrimitives()[0];
const sourcePosition = primitive.getAttribute('POSITION');
const indices = primitive.getIndices();
if (indices?.getCount() !== positions.count || sourcePosition.getCount() !== positions.count)
  throw new Error('Expected independent retained triangle corners');
const stable = (p, r) => ({
  indices: hashArray(p.getIndices().getArray()),
  uv: hashArray(p.getAttribute('TEXCOORD_0').getArray()),
  colour: hashArray(p.getAttribute('COLOR_0').getArray()),
  textures: r.listTextures().map((t) => hash(t.getImage())),
});
const before = stable(primitive, root);
const newPositions = new Float32Array(positions.count * 3),
  newNormals = new Float32Array(positions.count * 3);
const usedTriangles = new Set(),
  usedVertices = new Set();
let maxCorrespondenceError = 0;
for (let i = 0; i < indices.getCount(); i += 3) {
  const vertices = [0, 1, 2].map((k) => indices.getScalar(i + k));
  const points = vertices.map((v) => sourcePosition.getElement(v, []));
  const matches = [];
  for (let j = 0; j < oldPoints.length; j += 3) {
    for (let shift = 0; shift < 3; shift++) {
      const error = Math.max(
        ...points.map((p, k) =>
          Math.hypot(...p.map((v, a) => v - oldPoints[j + ((k + shift) % 3)][a]))
        )
      );
      if (error < 1e-6) matches.push({ j, shift, error });
    }
  }
  if (matches.length !== 1 || usedTriangles.has(matches[0].j))
    throw new Error('Ambiguous retained triangle correspondence');
  const { j, shift, error } = matches[0];
  usedTriangles.add(j);
  maxCorrespondenceError = Math.max(maxCorrespondenceError, error);
  vertices.forEach((vertex, k) => {
    if (usedVertices.has(vertex))
      throw new Error('Shared retained corners require a different transfer');
    usedVertices.add(vertex);
    const corner = j + ((k + shift) % 3);
    newPositions.set(
      [positions.getX(corner), positions.getY(corner), positions.getZ(corner)],
      vertex * 3
    );
    newNormals.set([normals.getX(corner), normals.getY(corner), normals.getZ(corner)], vertex * 3);
  });
}
primitive.getAttribute('POSITION').setArray(newPositions);
primitive.getAttribute('NORMAL').setArray(newNormals);
const bytes = await io.writeBinary(document);
const checked = await io.readBinary(bytes);
const check = checked.getRoot().listMeshes()[0].listPrimitives()[0];
if (JSON.stringify(stable(check, checked.getRoot())) !== JSON.stringify(before))
  throw new Error('Serialized atlas data changed');
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
  authoredSha256: hash(await readFile(authored)),
  implementation: 'src/utils/flourSacks.ts',
  implementationSha256: hash(await readFile('src/utils/flourSacks.ts')),
  output,
  outputSha256: hash(bytes),
  triangles: usedTriangles.size,
  corners: usedVertices.size,
  maxCorrespondenceError,
  preservedAtlas: before,
  note: 'Local topology-preserving pillow-profile derivative; original provider and authored-atlas files are unchanged.',
};
await writeFile(output.replace(/\.glb$/, '.json'), JSON.stringify(report, null, 2) + '\n');
geometry.dispose();
console.log(JSON.stringify(report, null, 2));
