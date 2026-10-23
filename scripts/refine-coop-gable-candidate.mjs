/** Output-only coop experiment. Restore exact deleted provider wall faces.
 * The old roof/fascia is deliberately excluded; no new gap-filling geometry. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

export const INPUT = 'public/models/farm/coop.glb';
export const SOURCE = 'assets/source/models/farm/coop-tripo-original.glb';
export const INPUT_SHA256 = '59d70ebe84a1daacd63c8b9be15a07febbceb14f3c34685ec19eeab50b3aff05';
export const SOURCE_SHA256 = 'c1c59659ffda9b0078b2f823289b0757abaf035e3df09526611af3fea55ee0b1';
export const GABLE_FACES = Object.freeze([
  1375, 1401, 1470, 1471, 1476, 1487, 1491, 1494, 1570, 1670, 1673, 2907, 3040, 3057, 3058, 5941,
  5942, 6141, 6142, 6637, 6661, 6835, 6859, 6876, 7236, 7458, 7667, 7674, 7840, 7841, 7883, 7884,
  7949,
]);
export const SIDE_WALL_FACES = Object.freeze([
  1385, 1431, 1432, 1437, 1438, 1448, 1453, 1459, 1478, 1480, 1512, 1513, 1514, 1517, 1519, 1524,
  1526, 1527, 1818, 1856, 1864, 1920, 1931, 1938, 1939, 2013, 2915, 2978, 3093, 3097, 3115, 3127,
  3128, 3147, 3195, 3262, 3264, 3266, 3313, 3314, 5773, 5776, 5797, 5798, 5804, 5805, 5806, 5807,
  5810, 5907, 5911, 5912, 5913, 5917, 5922, 5925, 5984, 5986, 6138, 6139, 6140, 7283, 7284, 7321,
  7322, 7323, 7429, 7459, 7799, 7822, 7824, 7878,
]);
export const RESTORED = Object.freeze([...GABLE_FACES, ...SIDE_WALL_FACES].sort((a, b) => a - b));
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const primitive = (d) => d.getRoot().listMeshes()[0].listPrimitives()[0];
export const face = (p, id) =>
  [0, 1, 2].map((k) =>
    p.getAttribute('POSITION').getElement(p.getIndices().getScalar(id * 3 + k), [])
  );
export const signature = (points) =>
  points
    .map((p) => p.join(','))
    .sort()
    .join(';');
export function normal(points) {
  const a = points[1].map((v, k) => v - points[0][k]);
  const b = points[2].map((v, k) => v - points[0][k]);
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const length = Math.hypot(...n);
  assert(length > 1e-12, 'Non-degenerate source wall required');
  return n.map((v) => v / length);
}
export function bounds(p) {
  const result = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const id of p.getIndices().getArray()) {
    for (const [k, v] of p.getAttribute('POSITION').getElement(id, []).entries()) {
      result.min[k] = Math.min(result.min[k], v);
      result.max[k] = Math.max(result.max[k], v);
    }
  }
  return result;
}
export function roofPlanes(p) {
  // Actual envelope-adjusted closed slab, not the pre-envelope authoring formula.
  return [5230, 5472].map((id) => {
    const points = face(p, id),
      n = normal(points);
    assert(n[1] < -0.7 && Math.abs(n[0]) < 1e-7, 'Pinned physical roof underside required');
    return {
      triangle: id,
      points,
      normal: n,
      constant: n.reduce((sum, v, k) => sum + v * points[0][k], 0),
    };
  });
}
export function roofClearances(points, planes) {
  // Below BOTH affine half-spaces proves the entire triangle is below the
  // concave gabled underside, including triangles crossing the ridge cusp.
  return points.map((v) =>
    Math.min(
      ...planes.map(
        ({ normal: n, constant }) => (constant - n[0] * v[0] - n[2] * v[2]) / n[1] - v[1]
      )
    )
  );
}
export function refine(document, source, inputHash, sourceHash) {
  assert.equal(inputHash, INPUT_SHA256, 'Pinned accepted coop input required');
  assert.equal(sourceHash, SOURCE_SHA256, 'Pinned immutable provider source required');
  const root = document.getRoot(),
    p = primitive(document),
    sp = primitive(source);
  assert.equal(root.listMeshes().length, 1);
  assert.equal(root.listMeshes()[0].listPrimitives().length, 1);
  assert.equal(root.listMaterials().length, 1);
  assert.equal(root.listTextures().length, 3);
  assert.equal(root.listNodes().length, 1);
  assert.equal(root.listNodes()[0].getName(), 'CoopBody');
  assert.equal(p.getIndices().getCount(), 5944 * 3);
  assert.equal(sp.getIndices().getCount(), 7986 * 3);
  assert.deepEqual(p.listSemantics(), ['POSITION', 'NORMAL', 'TEXCOORD_0']);
  assert.deepEqual(sp.listSemantics(), p.listSemantics());
  const vertexCount = p.getAttribute('POSITION').getCount();
  assert.equal(vertexCount, 6808);
  const beforeBounds = bounds(p),
    planes = roofPlanes(p);
  const existing = new Set(Array.from({ length: 5944 }, (_, id) => signature(face(p, id))));
  const selected = [];
  for (let id = 0; id < 7986; id++) {
    const points = face(sp, id);
    if (existing.has(signature(points))) continue;
    const n = normal(points);
    // Two known outward-facing gable panel / corner-post bands. Outer old
    // fascia sits at x≈−.48/+ .12, and inner roof faces are excluded as well.
    const left = points.every((v) => v[0] > -0.455 && v[0] < -0.437) && n[0] < -0.85;
    const right = points.every((v) => v[0] > 0.076 && v[0] < 0.091) && n[0] > 0.85;
    const sideWall =
      points.every((v) => v[0] > -0.455 && v[0] < 0.091) &&
      (points.every((v) => v[2] > -0.3 && v[2] < -0.23) ||
        points.every((v) => v[2] > 0.23 && v[2] < 0.3)) &&
      Math.abs(n[2]) > 0.85;
    if (!left && !right && !sideWall) continue;
    // Source7970 joins wooden wall5913 to old green roof5818/5819.
    // Even below the new slab, this fused transition is not clean wall evidence.
    if (id === 7970) continue;
    const clearances = roofClearances(points, planes);
    if (sideWall && Math.min(...clearances) <= 0.01) continue;
    assert(
      Math.min(...clearances) > (sideWall ? 0.01 : 0.015),
      'Restored wall must remain below physical roof with residual clearance'
    );
    for (const v of points) {
      assert(
        v[1] > 0.07 && v[1] < 0.38 && Math.abs(v[2]) < 0.3,
        'Only original upper wall/post faces may be restored'
      );
    }
    selected.push({
      sourceTriangle: id,
      side: left
        ? 'negative-x'
        : right
          ? 'positive-x'
          : points[0][2] < 0
            ? 'negative-z'
            : 'positive-z',
      sourceVertexIndices: [0, 1, 2].map((k) => sp.getIndices().getScalar(id * 3 + k)),
      positions: points,
      geometricNormal: n,
      roofClearances: clearances,
    });
  }
  assert.deepEqual(
    selected.map((f) => f.sourceTriangle),
    RESTORED,
    'Exact reviewed source-face selection required'
  );
  // Append-only attributes and indices: every existing triangle and vertex
  // stays at its original index, with source normals and UVs copied exactly.
  for (const semantic of p.listSemantics()) {
    const target = p.getAttribute(semantic),
      original = target.getArray(),
      provider = sp.getAttribute(semantic);
    assert.equal(provider.getType(), target.getType());
    const size = target.getElementSize(),
      output = new original.constructor(original.length + selected.length * 3 * size);
    output.set(original);
    let offset = original.length;
    for (const f of selected)
      for (const id of f.sourceVertexIndices) {
        output.set(provider.getElement(id, []), offset);
        offset += size;
      }
    target.setArray(output);
  }
  const originalIndices = p.getIndices().getArray();
  const indices = new originalIndices.constructor(originalIndices.length + selected.length * 3);
  indices.set(originalIndices);
  for (let i = originalIndices.length; i < indices.length; i++)
    indices[i] = vertexCount + i - originalIndices.length;
  p.getIndices().setArray(indices);
  assert.deepEqual(bounds(p), beforeBounds, 'Used geometry envelope must remain exact');
  assert(indices.length <= 25200, 'Rendered vertex budget exceeded');
  return {
    status:
      'output-only unpromoted candidate; CPU diagnostics do not establish native renderer acceptance',
    scope:
      'Append 105 exact deleted provider gable and long-side wall/post faces; no reshaping, clipping, infill, old roof/fascia restoration, texture change or runtime asset change',
    trianglesBefore: 5944,
    trianglesAfter: indices.length / 3,
    verticesBefore: vertexCount,
    verticesAfter: p.getAttribute('POSITION').getCount(),
    renderVertices: indices.length,
    limits: { bytes: 437000, renderVertices: 25200 },
    bounds: beforeBounds,
    roofUnderside: planes,
    restoredFaces: selected,
    residualClearance:
      'The original recessed wall profile remains below the thinner replacement roof. The continuous residual slot is preserved; this experiment does not claim it is intentional ventilation or a watertight enclosure.',
    originalOuterFasciaExcluded: [1564, 6663],
  };
}
export async function safeOutput(requested) {
  const output = path.resolve(requested);
  for (const dir of ['public', 'assets'])
    assert(
      !output.startsWith(path.resolve(dir) + path.sep),
      'Output must remain outside public/assets'
    );
  await mkdir(path.dirname(output), { recursive: true });
  const parent = await realpath(path.dirname(output));
  for (const dir of ['public', 'assets']) {
    const protectedRoot = await realpath(dir);
    assert(
      parent !== protectedRoot && !parent.startsWith(protectedRoot + path.sep),
      'Symlink output may not reach runtime/source assets'
    );
  }
  // Existing symlink files are not safe output targets either.
  try {
    assert.equal(
      await realpath(output),
      path.join(parent, path.basename(output)),
      'Output file may not be a symlink'
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return output;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = await safeOutput(
    process.argv[2] ?? 'test-results/farm-reconciliation-candidates/coop-wall/coop.glb'
  );
  const [bytes, sourceBytes] = await Promise.all([readFile(INPUT), readFile(SOURCE)]),
    io = new NodeIO();
  const doc = await io.readBinary(bytes),
    source = await io.readBinary(sourceBytes);
  const report = refine(doc, source, hash(bytes), hash(sourceBytes));
  const candidate = await io.writeBinary(doc);
  assert(candidate.length <= 437000, 'Candidate byte budget exceeded');
  await writeFile(output, candidate);
  Object.assign(report, {
    inputSHA256: hash(bytes),
    sourceSHA256: hash(sourceBytes),
    outputSHA256: hash(candidate),
    inputBytes: bytes.length,
    outputBytes: candidate.length,
  });
  await writeFile(
    path.join(path.dirname(output), 'refinement-report.json'),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(
    JSON.stringify(
      {
        ...report,
        restoredFaces: report.restoredFaces.map((f) => f.sourceTriangle),
        roofUnderside: report.roofUnderside.map((p) => p.triangle),
      },
      null,
      2
    )
  );
}
