// Retain exact authored colour and normals while using Tripo normal/roughness maps.
// The provider reorders triangles and UVs, so transfer a second UV set by measured
// triangle correspondence. Reject unmatched surfaces or conflicting UV assignments.
import { NodeIO } from '@gltf-transform/core';
import { writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root =
  process.argv.find((a) => a.startsWith('--root='))?.slice(7) || 'assets/source/models/world';
const slug = process.argv.find((a) => a.startsWith('--slug='))?.slice(7);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw Error('Invalid asset slug');
const keepProviderColour = process.argv.includes('--keep-provider-colour');
const suffix = keepProviderColour
  ? 'authored-normals-tripo-finish'
  : 'authored-colour-normals-tripo-finish';
const output = `${root}/${slug}-${suffix}.glb`;
try {
  await access(output);
  throw Error('Derivative already exists');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const io = new NodeIO();
const source = await io.read(`${root}/${slug}-authored-atlas.glb`);
const result = await io.read(`${root}/${slug}-tripo-original.glb`);
for (const document of [source, result]) {
  const root = document.getRoot();
  if (
    root.listMeshes().length !== 1 ||
    root.listMeshes()[0].listPrimitives().length !== 1 ||
    root.listAnimations().length ||
    root.listSkins().length
  ) {
    throw Error('Expected one static mesh primitive');
  }
}
const a = source.getRoot().listMeshes()[0].listPrimitives()[0];
const b = result.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = a.getAttribute('POSITION'),
  lo = pos.getMin([]),
  hi = pos.getMax([]);
const scale = Math.max(...hi.map((v, i) => v - lo[i]));
const centre = hi.map((v, i) => (v + lo[i]) / 2);
const key = (p) => p.map((v) => Math.round(v * 1e5)).join(',');
const triangles = (p, normalized) => {
  const pos = p.getAttribute('POSITION'),
    indices = p.getIndices(),
    out = [];
  for (let i = 0; i < indices.getCount(); i += 3) {
    const vertices = [0, 1, 2].map((j) => indices.getScalar(i + j));
    const points = vertices.map((index) => {
      let v = pos.getElement(index, []);
      return normalized ? v.map((x, k) => (x - centre[k]) / scale) : v;
    });
    out.push({ vertices, points, key: points.map(key).sort().join('|') });
  }
  return out;
};
const distance = (a, b) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
const sourceTriangles = triangles(a, true);
const hasArea = (t) => {
  const [o, p, q] = t.points,
    u = p.map((x, k) => x - o[k]),
    v = q.map((x, k) => x - o[k]);
  return (
    Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) !==
    0
  );
};
const old = sourceTriangles.filter(hasArea),
  current = triangles(b, false),
  lookup = new Map();
const omittedZeroAreaSourceTriangles = sourceTriangles.length - old.length;
if (old.length !== current.length) throw Error('Triangle counts changed');
for (const t of old) {
  if (lookup.has(t.key)) throw Error('Ambiguous overlapping source triangles');
  lookup.set(t.key, t);
}
const uv = new Float32Array(b.getAttribute('POSITION').getCount() * 2).fill(NaN);
const normals = new Float32Array(b.getAttribute('POSITION').getCount() * 3).fill(NaN);
const matchedSource = new Set();
const tolerance = 1e-6;
let maxError = 0,
  slowMatches = 0;
for (const t of current) {
  let match = lookup.get(t.key);
  if (!match) {
    const candidates = old.filter((q) =>
      t.points.every((p) => q.points.some((v) => distance(p, v) < tolerance ** 2))
    );
    if (candidates.length !== 1)
      throw Error(`Unmatched or ambiguous triangle: ${candidates.length}`);
    match = candidates[0];
    slowMatches++;
  }
  if (matchedSource.has(match)) throw Error('Provider repeats a source triangle');
  matchedSource.add(match);
  const used = new Set();
  for (let i = 0; i < 3; i++) {
    const distances = match.points.map((p) => distance(p, t.points[i]));
    const j = distances.indexOf(Math.min(...distances));
    if (used.has(j) || distances[j] > tolerance ** 2) throw Error('Triangle corner mapping failed');
    used.add(j);
    maxError = Math.max(maxError, Math.sqrt(distances[j]));
    const oldUv = a.getAttribute('TEXCOORD_0').getElement(match.vertices[j], []);
    const offset = t.vertices[i] * 2;
    const normal = a.getAttribute('NORMAL').getElement(match.vertices[j], []);
    for (let k = 0; k < 3; k++) {
      const n = t.vertices[i] * 3 + k;
      if (Number.isFinite(normals[n]) && Math.abs(normals[n] - normal[k]) > 1e-6)
        throw Error('Shared vertex needs distinct source normals');
      normals[n] = normal[k];
    }
    for (let k = 0; k < 2; k++) {
      if (Number.isFinite(uv[offset + k]) && Math.abs(uv[offset + k] - oldUv[k]) > 1e-6)
        throw Error('Shared result vertex needs distinct source UVs');
      uv[offset + k] = oldUv[k];
    }
  }
}
if (!uv.every(Number.isFinite) || !normals.every(Number.isFinite))
  throw Error('Unassigned or non-finite source attributes');
const hash = (a) => {
  const v = a.getArray();
  return createHash('sha256')
    .update(Buffer.from(v.buffer, v.byteOffset, v.byteLength))
    .digest('hex');
};
const custody = Object.fromEntries(
  b
    .listSemantics()
    .filter((k) => k !== 'NORMAL')
    .map((k) => [k, hash(b.getAttribute(k))])
);
b.setAttribute(
  'NORMAL',
  result
    .createAccessor('Authored hard-surface normals')
    .setType('VEC3')
    .setArray(normals)
    .setBuffer(result.getRoot().listBuffers()[0])
);
if (!keepProviderColour)
  b.setAttribute(
    'TEXCOORD_1',
    result
      .createAccessor('Authored palette UV')
      .setType('VEC2')
      .setArray(uv)
      .setBuffer(result.getRoot().listBuffers()[0])
  );
const original = a.getMaterial().getBaseColorTexture();
if (!keepProviderColour) {
  const preserved = result
    .createTexture('Preserved authored palette')
    .setImage(original.getImage())
    .setMimeType(original.getMimeType());
  const material = b.getMaterial(),
    rejected = material.getBaseColorTexture();
  material.setBaseColorTexture(preserved).setBaseColorFactor(a.getMaterial().getBaseColorFactor());
  material.getBaseColorTextureInfo().setTexCoord(1);
  rejected.dispose();
}
for (const [k, v] of Object.entries(custody))
  if (hash(b.getAttribute(k)) !== v) throw Error(`Provider ${k} was changed`);
await io.write(output, result);
await writeFile(
  output.replace('.glb', '.json'),
  JSON.stringify(
    {
      matchedTriangles: current.length,
      omittedZeroAreaSourceTriangles,
      slowMatches,
      maxNormalizedPositionError: maxError,
      preservedProviderAttributes: custody,
      sourceColourSha256: createHash('sha256').update(original.getImage()).digest('hex'),
      note:
        (keepProviderColour ? 'Provider colour retained. ' : 'Authored colour on UV1. ') +
        'Tripo normal and roughness on original UV0. Original hard-surface normals restored. Positions and topology unchanged; no extra material. Runtime appearance and benefit remain unverified.',
    },
    null,
    2
  )
);
console.log({
  output,
  triangles: current.length,
  maxError,
  materials: result.getRoot().listMaterials().length,
  textures: result.getRoot().listTextures().length,
});
