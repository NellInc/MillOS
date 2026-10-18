/** Exact-current farmhouse wall repair. Preserve every existing roof face and vertex index. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
export const INPUT = 'public/models/farm/farmhouse.glb';
export const SOURCE = 'assets/source/models/farm/farmhouse-tripo-original.glb';
export const INPUT_SHA256 = '03080debdd7dcadf2807ba93f4456c66d9b339415caee2d686ffe88c6d1f57d1';
export const SOURCE_SHA256 = 'ebc862d40b2bc9df64c56e362be259f680a9241e4f1fa7893b8df56931306ba7';
export const RESTORED = Object.freeze([
  3067, 3342, 3347, 3375, 3472, 7329, 7336, 7337, 7362, 7712, 7862, 7865, 7867, 7899,
]);
export const PRESERVED_ROOF = Object.freeze([
  3049, 3113, 3139, 3151, 3153, 3366, 3372, 3417, 3418, 3421, 3502, 3523, 3528, 3531,
]);
// Only source-continuous fans with one retained normal value, no generated
// incident triangles, and no conflicting source donors. Keep every UV seam.
export const DONORS = Object.freeze(
  [
    [1538, 953],
    [1837, 2691],
    [1840, 514],
    [1890, 5637],
    [1908, 1078],
    [2803, 1075],
    [3729, 44],
    [3745, 2214],
    [3753, 3804],
    [3754, 3941],
    [3765, 4627],
    [3769, 5739],
    [3783, 4887],
  ].map(Object.freeze)
);
// Two single-restored-face corners continue the adjacent retained normal fan.
// Provider normals would create31.78/69.32-degree seams; changing retained
// normals would erase existing hard discontinuities. Geometry/UV remain exact.
export const CONTINUATIONS = Object.freeze(
  [
    { sourceFace: 7337, sourceVertex: 2616, retainedVertex: 3751, retainedFace: 4377 },
    { sourceFace: 7362, sourceVertex: 4833, retainedVertex: 2804, retainedFace: 3225 },
  ].map(Object.freeze)
);
export const hash = (b) => createHash('sha256').update(b).digest('hex');
export const primitive = (d) => d.getRoot().listMeshes()[0].listPrimitives()[0];
export const face = (p, f) =>
  [0, 1, 2].map((k) =>
    p.getAttribute('POSITION').getElement(p.getIndices().getScalar(f * 3 + k), [])
  );
export const signature = (pts) =>
  pts
    .map((p) => p.join(','))
    .sort()
    .join(';');
export const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
export const angle = (a, b) =>
  (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)))) * 180) /
  Math.PI;
export function normal(pts) {
  const a = pts[1].map((v, k) => v - pts[0][k]),
    b = pts[2].map((v, k) => v - pts[0][k]),
    n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    l = Math.hypot(...n);
  assert(l > 1e-12, 'Nondegenerate face');
  return n.map((v) => v / l);
}
export function bounds(p) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const i of p.getIndices().getArray())
    for (const [k, v] of p.getAttribute('POSITION').getElement(i, []).entries()) {
      min[k] = Math.min(min[k], v);
      max[k] = Math.max(max[k], v);
    }
  return { min, max };
}
export function roofPlanes(p) {
  return [4441, 4963].map((triangle) => {
    const points = face(p, triangle),
      n = normal(points);
    assert(n[1] < -0.7 && Math.abs(n[0]) < 1e-7, 'Actual roof underside');
    return { triangle, points, normal: n, constant: dot(n, points[0]) };
  });
}
export const clearances = (pts, planes) =>
  pts.map((v) =>
    Math.min(
      ...planes.map(({ normal: n, constant: c }) => (c - n[0] * v[0] - n[2] * v[2]) / n[1] - v[1])
    )
  );
export function refine(document, source, inputHash, sourceHash) {
  assert.equal(inputHash, INPUT_SHA256, 'Pinned accepted farmhouse input required');
  assert.equal(sourceHash, SOURCE_SHA256, 'Pinned immutable provider source required');
  const root = document.getRoot(),
    p = primitive(document),
    sp = primitive(source),
    P = p.getAttribute('POSITION'),
    N = p.getAttribute('NORMAL'),
    SN = sp.getAttribute('NORMAL');
  assert.equal(root.listMeshes().length, 1);
  assert.equal(root.listMeshes()[0].listPrimitives().length, 1);
  assert.equal(root.listMaterials().length, 1);
  assert.equal(root.listTextures().length, 3);
  assert.equal(root.listNodes().length, 1);
  assert.equal(root.listNodes()[0].getName(), 'FarmhouseBody');
  assert.equal(p.getIndices().getCount(), 5595 * 3);
  assert.equal(sp.getIndices().getCount(), 7992 * 3);
  assert.equal(P.getCount(), 6100);
  assert.deepEqual(p.listSemantics(), ['POSITION', 'NORMAL', 'TEXCOORD_0']);
  assert.deepEqual(sp.listSemantics(), p.listSemantics());
  const beforeBounds = bounds(p),
    planes = roofPlanes(p),
    existing = new Set(Array.from({ length: 5595 }, (_, i) => signature(face(p, i)))),
    selected = [];
  for (let f = 0; f < 7992; f++) {
    const pts = face(sp, f);
    if (existing.has(signature(pts))) continue;
    const n = normal(pts),
      negative = pts.every((v) => v[0] > -0.465 && v[0] < -0.461) && n[0] < -0.999,
      positive = pts.every((v) => v[0] > 0.382 && v[0] < 0.386) && n[0] > 0.999;
    if (!negative && !positive) continue;
    const clearance = clearances(pts, planes);
    if (Math.min(...clearance) <= 0.002) continue;
    assert(Math.min(...clearance) > 0.0108, 'Whole triangle below both actual roof planes');
    selected.push({
      sourceFace: f,
      sourceVertexIndices: [0, 1, 2].map((k) => sp.getIndices().getScalar(f * 3 + k)),
      positions: pts,
      geometricNormal: n,
      roofClearances: clearance,
    });
  }
  assert.deepEqual(
    selected.map((r) => r.sourceFace),
    RESTORED,
    'Exact reviewed recessed wall scope'
  );
  for (const f of PRESERVED_ROOF)
    assert(
      existing.has(signature(face(sp, f))) && !RESTORED.includes(f),
      'Every current roof face remains present; roof cleanup is intentionally rejected'
    );
  const changes = DONORS.map(([vertex, sourceVertex]) => {
    assert.deepEqual(
      P.getElement(vertex, []),
      sp.getAttribute('POSITION').getElement(sourceVertex, []),
      'Exact donor position'
    );
    return {
      vertex,
      sourceVertex,
      normalBefore: N.getElement(vertex, []),
      normalAfter: SN.getElement(sourceVertex, []),
    };
  });
  const continuations = CONTINUATIONS.map((r) => {
    const f = selected.find((x) => x.sourceFace === r.sourceFace);
    assert(f.sourceVertexIndices.includes(r.sourceVertex));
    assert.deepEqual(
      P.getElement(r.retainedVertex, []),
      sp.getAttribute('POSITION').getElement(r.sourceVertex, [])
    );
    assert(
      [0, 1, 2].some((k) => p.getIndices().getScalar(r.retainedFace * 3 + k) === r.retainedVertex)
    );
    const adopted = N.getElement(r.retainedVertex, []),
      provider = SN.getElement(r.sourceVertex, []),
      d = dot(adopted, f.geometricNormal);
    assert(d > 0.2, 'Continuation must remain outward, never inward');
    return {
      ...r,
      providerNormal: provider,
      adoptedRetainedNormal: adopted,
      geometricDot: d,
      deviationFromGeometricDegrees: angle(adopted, f.geometricNormal),
      differenceFromProviderDegrees: angle(provider, adopted),
    };
  });
  for (const semantic of p.listSemantics()) {
    const attr = p.getAttribute(semantic),
      old = attr.getArray(),
      a = sp.getAttribute(semantic),
      size = attr.getElementSize(),
      out = new old.constructor(old.length + 42 * size);
    out.set(old);
    let cursor = old.length;
    for (const f of selected)
      for (const id of f.sourceVertexIndices) {
        out.set(a.getElement(id, []), cursor);
        cursor += size;
      }
    attr.setArray(out);
  }
  for (const c of changes) N.setElement(c.vertex, c.normalAfter);
  for (const c of continuations) {
    const f = selected.findIndex((x) => x.sourceFace === c.sourceFace),
      k = selected[f].sourceVertexIndices.indexOf(c.sourceVertex);
    c.candidateVertex = 6100 + f * 3 + k;
    N.setElement(c.candidateVertex, c.adoptedRetainedNormal);
  }
  const old = p.getIndices().getArray(),
    indices = new old.constructor(old.length + 42);
  indices.set(old);
  for (let i = old.length; i < indices.length; i++) indices[i] = 6100 + i - old.length;
  p.getIndices().setArray(indices);
  assert.deepEqual(bounds(p), beforeBounds, 'Exact used geometry bounds');
  assert(indices.length <= 25200);
  return {
    status: 'Unpromoted output-only candidate; CPU diagnostics are not native renderer acceptance',
    scope:
      'Restore14 exact original recessed plaster-wall triangles and UVs,13 unambiguous retained source-normal entries,2 documented new-corner normal continuations; preserve every current index,position/UV,roof/chimney face,hard edge,material,texture,transform and bound',
    trianglesBefore: 5595,
    trianglesAfter: 5609,
    verticesBefore: 6100,
    verticesAfter: 6142,
    renderVertices: 16827,
    bounds: beforeBounds,
    roofUnderside: planes,
    restoredFaces: selected,
    retainedNormalChanges: changes,
    newCornerNormalContinuations: continuations,
    preservedOriginalRoofFaces: PRESERVED_ROOF,
    residualClearance:
      'Original recessed wall profile only. The residual roof slot is preserved, with no speculative infill or claim of watertightness.',
  };
}
export async function safeOutput(requested) {
  const output = path.resolve(requested),
    protectedRoots = await Promise.all(['public', 'assets'].map((p) => realpath(p)));
  const check = (p) => {
    for (const root of protectedRoots)
      assert(
        p !== root && !p.startsWith(root + path.sep),
        'Output must remain outside runtime/source assets'
      );
  };
  check(output);
  await mkdir(path.dirname(output), { recursive: true });
  const target = path.join(await realpath(path.dirname(output)), path.basename(output));
  check(target);
  try {
    const s = await lstat(output);
    assert(!s.isSymbolicLink(), 'Output may not be a symlink');
    assert.fail('Output must be new; existing targets are immutable');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return target;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = await safeOutput(
      process.argv[2] ??
        'test-results/farm-reconciliation-candidates/farmhouse-current-walls/farmhouse.glb'
    ),
    reportPath = await safeOutput(path.join(path.dirname(output), 'refinement-report.json')),
    [b, s] = await Promise.all([readFile(INPUT), readFile(SOURCE)]),
    io = new NodeIO(),
    d = await io.readBinary(b),
    source = await io.readBinary(s),
    report = refine(d, source, hash(b), hash(s)),
    out = await io.writeBinary(d);
  assert(out.length <= 437000, 'Existing farmhouse byte budget');
  Object.assign(report, {
    inputSHA256: hash(b),
    sourceSHA256: hash(s),
    outputSHA256: hash(out),
    inputBytes: b.length,
    outputBytes: out.length,
  });
  await writeFile(output, out, { flag: 'wx' });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}
