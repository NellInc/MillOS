// Retain exact authored colour and normals while using Tripo normal/roughness maps.
// The provider reorders triangles and UVs, so transfer a second UV set by measured
// triangle correspondence. Reject unmatched surfaces or conflicting UV assignments.
import { NodeIO } from '@gltf-transform/core';
import { unweld } from '@gltf-transform/functions';
import { writeFile, readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root =
  process.argv.find((a) => a.startsWith('--root='))?.slice(7) || 'assets/source/models/world';
const slug = process.argv.find((a) => a.startsWith('--slug='))?.slice(7);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw Error('Invalid asset slug');
const keepProviderColour = process.argv.includes('--keep-provider-colour');
const vertexColour = process.argv.includes('--vertex-colour');
const authoredShadows = process.argv.includes('--authored-shadows');
if (authoredShadows && !vertexColour) throw Error('Authored shadows require source vertex colours');
if (vertexColour && keepProviderColour) throw Error('Choose one colour strategy');
const suffix = vertexColour
  ? 'authored-vertex-colour-tripo-finish'
  : keepProviderColour
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
// Some providers weld a seam whose source corners have different normals.
// Split only on explicit request, retaining the complete ordered triangle stream.
const splitVertices = process.argv.includes('--split-vertices');
const restoreOppositeFaces = process.argv.includes('--restore-opposite-faces');
if (restoreOppositeFaces && (!splitVertices || !vertexColour))
  throw Error('Opposite-face restoration requires split vertices and source vertex colours');
const ordered = (primitive, semantic) => {
  const attribute = primitive.getAttribute(semantic),
    indices = primitive.getIndices();
  return Array.from({ length: indices?.getCount() ?? attribute.getCount() }, (_, i) =>
    attribute.getElement(indices ? indices.getScalar(i) : i, [])
  ).flat();
};
if (splitVertices) {
  const before = Object.fromEntries(b.listSemantics().map((k) => [k, ordered(b, k)]));
  await result.transform(unweld());
  for (const [k, values] of Object.entries(before)) {
    const after = ordered(b, k);
    if (values.length !== after.length || values.some((v, i) => v !== after[i]))
      throw Error('Vertex split changed ordered triangle attributes');
  }
  b.setIndices(
    result
      .createAccessor('Sequential triangle corners')
      .setType('SCALAR')
      .setArray(Uint32Array.from({ length: b.getAttribute('POSITION').getCount() }, (_, i) => i))
      .setBuffer(result.getRoot().listBuffers()[0])
  );
}
const pos = a.getAttribute('POSITION'),
  lo = pos.getMin([]),
  hi = pos.getMax([]);
const scale = Math.max(...hi.map((v, i) => v - lo[i]));
const centre = hi.map((v, i) => (v + lo[i]) / 2);
const key = (p) => p.map((v) => Math.round(v * 1e5)).join(',');
// Cyclic keys preserve orientation, allowing deliberately two-sided leaf cards.
// Working if opposite source faces remain distinct and reversed provider faces fail.
const triangleKey = (points) =>
  [0, 1, 2].map((shift) => [0, 1, 2].map((i) => key(points[(i + shift) % 3])).join('|')).sort()[0];
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
    out.push({ vertices, points, key: triangleKey(points) });
  }
  return out;
};
const distance = (a, b) => a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
const sourceTriangles = triangles(a, true);
// Explicitly admit floating-point pole slivers only when a provider has omitted
// them. The limit is in squared normalized model units, far below float32 precision.
// Working if ordinary missing faces still fail and every omission is recorded.
const minimumNormalizedDoubleArea = process.argv.includes('--omit-numerical-slivers')
  ? Number.EPSILON * 16
  : 0;
const hasArea = (t) => {
  const [o, p, q] = t.points,
    u = p.map((x, k) => x - o[k]),
    v = q.map((x, k) => x - o[k]);
  return (
    Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) >
    minimumNormalizedDoubleArea
  );
};
const old = sourceTriangles.filter(hasArea),
  lookup = new Map();
let current = triangles(b, false);
let restoredOppositeSourceTriangles = 0;
const omittedSourceTriangles = sourceTriangles.length - old.length;
// Some texture providers deduplicate the two windings of alpha-cut leaf cards.
// Restore only a recorded reverse face of an existing provider triangle.
// Working if missing ordinary faces still fail and every restored side is counted.
if (restoreOppositeFaces && old.length > current.length) {
  const geometry = JSON.parse(await readFile(`${root}/${slug}-geometry.json`, 'utf8'));
  if (!geometry.variants.flatMap((v) => v.parts).every((p) => p.preserveOppositeWinding === true))
    throw Error('Opposite-face restoration requires an explicitly two-winding source');
  const close = (a, b) => distance(a, b) < 1e-12;
  const cyclic = (a, b) =>
    [0, 1, 2].some((shift) => a.every((p, i) => close(p, b[(i + shift) % 3])));
  const represented = new Set();
  for (const triangle of current) {
    const matches = old.filter((t) => cyclic(triangle.points, t.points));
    if (matches.length !== 1 || represented.has(matches[0]))
      throw Error('Provider face does not uniquely match the two-winding source');
    represented.add(matches[0]);
  }
  const appendVertices = [];
  for (const missing of old.filter((t) => !represented.has(t))) {
    const matches = current.flatMap((t) =>
      [
        [0, 2, 1],
        [1, 0, 2],
        [2, 1, 0],
      ]
        .filter((order) => missing.points.every((p, i) => close(p, t.points[order[i]])))
        .map((order) => order.map((i) => t.vertices[i]))
    );
    if (matches.length !== 1) throw Error('Missing face has no unique existing reverse side');
    appendVertices.push(...matches[0]);
    restoredOppositeSourceTriangles++;
  }
  const count = b.getAttribute('POSITION').getCount();
  if (
    b.getIndices().getCount() !== count ||
    Array.from({ length: count }, (_, i) => b.getIndices().getScalar(i)).some((v, i) => v !== i)
  )
    throw Error('Reverse-face reconstruction requires independent triangle corners');
  for (const semantic of b.listSemantics()) {
    const attribute = b.getAttribute(semantic);
    const values = attribute.getArray();
    const size = attribute.getElementSize();
    if (attribute.getCount() !== count) throw Error('Provider attribute counts disagree');
    const expanded = new values.constructor(values.length + appendVertices.length * size);
    expanded.set(values);
    appendVertices.forEach((index, i) =>
      expanded.set(values.subarray(index * size, (index + 1) * size), values.length + i * size)
    );
    b.setAttribute(semantic, attribute.clone().setArray(expanded));
  }
  b.getIndices().setArray(Uint32Array.from({ length: count + appendVertices.length }, (_, i) => i));
  current = triangles(b, false);
}
if (old.length !== current.length) throw Error('Triangle counts changed');
for (const t of old) {
  if (lookup.has(t.key)) throw Error('Ambiguous overlapping source triangles');
  lookup.set(t.key, t);
}
let geometryBytes;
const paletteTriangles = [],
  paletteLookup = new Map();
if (vertexColour) {
  geometryBytes = await readFile(`${root}/${slug}-geometry.json`);
  const geometry = JSON.parse(geometryBytes);
  for (const variant of geometry.variants)
    for (const part of variant.parts) {
      if (part.transparent) continue;
      if (part.sourceMap || !part.color?.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
        throw Error('Vertex palette requires unmapped source colours');
      if (part.positions.length % 9) throw Error('Invalid source triangle positions');
      for (let i = 0; i < part.positions.length; i += 9) {
        const points = [0, 1, 2].map((j) =>
          part.positions.slice(i + j * 3, i + j * 3 + 3).map((v, k) => (v - centre[k]) / scale)
        );
        if (
          authoredShadows &&
          (typeof part.castShadow !== 'boolean' || typeof part.receiveShadow !== 'boolean')
        )
          throw Error('Missing authored shadow flags');
        const triangle = {
          points,
          key: triangleKey(points),
          color: part.color,
          castShadow: part.castShadow,
          receiveShadow: part.receiveShadow,
        };
        if (!hasArea(triangle)) continue;
        if (paletteLookup.has(triangle.key)) throw Error('Ambiguous source palette triangle');
        paletteTriangles.push(triangle);
        paletteLookup.set(triangle.key, triangle);
      }
    }
}
const colours = new Float32Array(b.getAttribute('POSITION').getCount() * 3).fill(NaN);
const uv = new Float32Array(b.getAttribute('POSITION').getCount() * 2).fill(NaN);
const normals = new Float32Array(b.getAttribute('POSITION').getCount() * 3).fill(NaN);
const matchedSource = new Set();
const shadowGroups = new Map();
const tolerance = 1e-6;
const cyclicMatch = (a, b) =>
  [0, 1, 2].some((shift) => a.every((p, i) => distance(p, b[(i + shift) % 3]) < tolerance ** 2));
let maxError = 0,
  slowMatches = 0;
for (const t of current) {
  let match = lookup.get(t.key);
  if (!match) {
    const candidates = old.filter((q) => cyclicMatch(t.points, q.points));
    if (candidates.length !== 1)
      throw Error(`Triangle winding or correspondence changed: ${candidates.length} matches`);
    match = candidates[0];
    slowMatches++;
  }
  if (matchedSource.has(match)) throw Error('Provider repeats a source triangle');
  matchedSource.add(match);
  let palette;
  if (vertexColour) {
    palette = paletteLookup.get(match.key);
    if (!palette) {
      const candidates = paletteTriangles.filter((q) => cyclicMatch(match.points, q.points));
      if (candidates.length !== 1) throw Error('Unmatched source palette triangle');
      palette = candidates[0];
    }
    if (authoredShadows) {
      const id = `${palette.castShadow}:${palette.receiveShadow}`;
      const group = shadowGroups.get(id) ?? {
        castShadow: palette.castShadow,
        receiveShadow: palette.receiveShadow,
        indices: [],
      };
      group.indices.push(...t.vertices);
      shadowGroups.set(id, group);
    }
  }
  // Match a complete cyclic permutation. Nearest-corner lookup alone can map
  // both almost-coincident sphere-pole vertices to the same source corner.
  // Working if pole seams retain three distinct corners and reversed faces fail.
  const correspondence = [0, 1, 2]
    .map((shift) => [0, 1, 2].map((i) => (i + shift) % 3))
    .filter((order) =>
      order.every((j, i) => distance(match.points[j], t.points[i]) <= tolerance ** 2)
    )
    .sort(
      (x, y) =>
        x.reduce((sum, j, i) => sum + distance(match.points[j], t.points[i]), 0) -
        y.reduce((sum, j, i) => sum + distance(match.points[j], t.points[i]), 0)
    )[0];
  if (!correspondence) throw Error('Triangle winding or corner correspondence changed');
  for (let i = 0; i < 3; i++) {
    const distances = match.points.map((p) => distance(p, t.points[i]));
    const j = correspondence[i];
    maxError = Math.max(maxError, Math.sqrt(distances[j]));
    const oldUv = a.getAttribute('TEXCOORD_0').getElement(match.vertices[j], []);
    const offset = t.vertices[i] * 2;
    const normal = a.getAttribute('NORMAL').getElement(match.vertices[j], []);
    for (let k = 0; k < 3; k++) {
      const n = t.vertices[i] * 3 + k;
      if (Number.isFinite(normals[n]) && Math.abs(normals[n] - normal[k]) > 1e-6)
        throw Error('Shared vertex needs distinct source normals');
      normals[n] = normal[k];
      if (palette) {
        if (Number.isFinite(colours[n]) && Math.abs(colours[n] - palette.color[k]) > 1e-6)
          throw Error('Shared vertex needs distinct source colours');
        colours[n] = palette.color[k];
      }
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
if (vertexColour && !colours.every(Number.isFinite)) throw Error('Unassigned source colours');
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
if (!keepProviderColour && !vertexColour)
  b.setAttribute(
    'TEXCOORD_1',
    result
      .createAccessor('Authored palette UV')
      .setType('VEC2')
      .setArray(uv)
      .setBuffer(result.getRoot().listBuffers()[0])
  );
const original = a.getMaterial().getBaseColorTexture();
if (vertexColour) {
  b.setAttribute(
    'COLOR_0',
    result
      .createAccessor('Authored linear palette')
      .setType('VEC3')
      .setArray(colours)
      .setBuffer(result.getRoot().listBuffers()[0])
  );
  const material = b.getMaterial(),
    rejected = material.getBaseColorTexture();
  material.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]);
  rejected?.dispose();
} else if (!keepProviderColour) {
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
if (authoredShadows) {
  // A single atlas may cover surfaces with different shadow contracts.
  // Split draws by those two flags, retaining shared attributes and textures.
  // Working if every source triangle belongs to exactly one matching shadow node.
  if ([...shadowGroups.values()].reduce((n, g) => n + g.indices.length, 0) !== current.length * 3)
    throw Error('Shadow partition lost triangles');
  const mesh = result.getRoot().listMeshes()[0];
  const parent = result
    .getRoot()
    .listNodes()
    .find((node) => node.getMesh() === mesh);
  if (!parent) throw Error('Missing source mesh node');
  parent.setMesh(null);
  for (const [id, group] of shadowGroups) {
    const primitive = b
      .clone()
      .setIndices(
        result
          .createAccessor('Authored shadow triangles')
          .setType('SCALAR')
          .setArray(new Uint32Array(group.indices))
          .setBuffer(result.getRoot().listBuffers()[0])
      );
    parent.addChild(
      result
        .createNode(`Authored shadows ${id}`)
        .setExtras({
          authoredCastShadow: group.castShadow,
          authoredReceiveShadow: group.receiveShadow,
        })
        .setMesh(result.createMesh(`Shadow group ${id}`).addPrimitive(primitive))
    );
  }
  mesh.dispose();
  b.dispose();
}
await io.write(output, result);
await writeFile(
  output.replace('.glb', '.json'),
  JSON.stringify(
    {
      matchedTriangles: current.length,
      splitVertices,
      restoredOppositeSourceTriangles,
      authoredShadowGroups: authoredShadows
        ? [...shadowGroups.values()].map((g) => ({
            castShadow: g.castShadow,
            receiveShadow: g.receiveShadow,
            triangles: g.indices.length / 3,
          }))
        : undefined,
      omittedZeroAreaSourceTriangles:
        minimumNormalizedDoubleArea === 0 ? omittedSourceTriangles : 0,
      omittedNumericallyNegligibleSourceTriangles:
        minimumNormalizedDoubleArea > 0 ? omittedSourceTriangles : 0,
      minimumNormalizedDoubleArea,
      slowMatches,
      maxNormalizedPositionError: maxError,
      preservedProviderAttributes: custody,
      sourceColourSha256: createHash('sha256')
        .update(vertexColour ? geometryBytes : original.getImage())
        .digest('hex'),
      note:
        (vertexColour
          ? 'Authored linear colour on vertices, no colour atlas. '
          : keepProviderColour
            ? 'Provider colour retained. '
            : 'Authored colour on UV1. ') +
        'Tripo normal and roughness on original UV0. Original corner normals restored. ' +
        (restoredOppositeSourceTriangles
          ? `${restoredOppositeSourceTriangles} authored reverse faces reconstructed from their provider-retained counterparts. `
          : 'Provider triangle positions and topology retained. ') +
        'Source degeneracies omitted only as counted above. Runtime appearance and benefit remain unverified.',
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
