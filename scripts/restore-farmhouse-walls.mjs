/** Exact-current farmhouse wall repair, then the roof-edge trim (trimRoofEdges below). */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
export const INPUT = 'public/models/farm/farmhouse.glb';
export const SOURCE = 'assets/source/models/farm/farmhouse-tripo-original.glb';
export const INPUT_SHA256 = '3915c901a1cbcfadb6b2997b89d622c38c4b2745dd265c4ff410d66bea615c6a';
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
/** The wall step alone, in place: the reviewed 14-triangle recessed wall
 * restoration that refine() then builds the roof-edge, window, tile and
 * chimney steps on. Exported so its exact-byte audits can run on it. */
export function restoreWalls(document, source, inputHash, sourceHash) {
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
      'Every current roof face is present before the roof-edge trim'
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
  return { p, P, indices, beforeBounds, planes, selected, changes, continuations };
}

export function refine(document, source, inputHash, sourceHash) {
  const { p, P, indices, beforeBounds, planes, selected, changes, continuations } = restoreWalls(
    document,
    source,
    inputHash,
    sourceHash
  );
  // The slab's top plane (ridge height and pitch), read before the trim moves
  // the slab's eave vertices; the chimney step measures heights from it.
  const ridgeTop = P.getElement(indices[4439 * 3], []),
    eaveTop = P.getElement(indices[4439 * 3 + 1], []),
    slab = Object.freeze({ ridgeY: ridgeTop[1], slope: (ridgeTop[1] - eaveTop[1]) / eaveTop[2] });
  const roofEdges = trimRoofEdges(p, beforeBounds);
  const windows = rebuildWindows(p, beforeBounds);
  const roofTiles = relayRoofTiles(p, beforeBounds);
  const chimney = rebuildChimney(p, beforeBounds, slab);
  return {
    status: 'Unpromoted output-only candidate; CPU diagnostics are not native renderer acceptance',
    scope:
      'Wall step: restore 14 exact original recessed plaster-wall triangles and UVs, 13 unambiguous retained source-normal entries, 2 documented new-corner normal continuations. Roof-edge step (roofEdges): delete provider roof-shell faces outside the wall footprint and rebuild verges, fascias and soffits as closed boards, then replace the chimney apron and the provider skin around it with a lead plate and counterflashing sleeve. Window step (windows): delete the sculpted provider window joinery on all three facades and rebuild frames, glazing bars, glass, sills, lintels and shutters as closed chamfered slabs seated into the measured wall. Tile step (roofTiles): re-centre each crafted roof tile on a seeded texel from six measured roof colours in a narrow value band, move every tile riser to one flat darker texel, and turn the -Z slope tile risers outward. Chimney step (chimney): delete the provider shaft and cap and rebuild the chimney as modelled brick courses on a mortar core, two corbel courses and a mitred coping round a flue, with lead flashing laid course by course on the tiles (stepped side flashing, front apron over the riser, back gutter); door, materials, textures, transform and bounds are kept',
    trianglesBefore: 5595,
    trianglesAfter: chimney.trianglesAfter,
    verticesBefore: 6100,
    verticesAfter: chimney.verticesAfter,
    renderVertices: chimney.renderVertices,
    wallStep: { trianglesAfter: 5609, verticesAfter: 6142, renderVertices: 16827 },
    bounds: beforeBounds,
    roofUnderside: planes,
    restoredFaces: selected,
    retainedNormalChanges: changes,
    newCornerNormalContinuations: continuations,
    preservedOriginalRoofFaces: PRESERVED_ROOF,
    residualClearance:
      'Original recessed wall profile only. The residual roof slot is closed from outside by the verge soffits and bargeboards; no claim of watertightness.',
    roofEdges,
    windows,
    roofTiles,
    chimney,
  };
}

// Roof-edge trim (asset loop, 2026-11-05). This reverses the earlier "roof
// cleanup is intentionally rejected" contract for the roof EDGES only. The
// provider roof shell still stuck out past the crafted slab at both verges and
// both eaves: a lumpy bargeboard 2 cm beyond the -X slab end, sawtooth eave
// lips hanging 34 cm below the slab, and strips poking above the tiles. The
// judge read them as torn, melted geometry at eye level. Here every provider
// face inside the roof band (within EDGE.depth of the slab's top plane) whose
// centroid lies outside the wall footprint is deleted, the crafted pencil
// verges and single-sided fascia strips are replaced, and the edges are
// rebuilt as closed, chamfered boards: mitred bargeboards, fascias under a
// slab extended to the old eave line, boxed eave soffits and verge soffits.
// The provider roof field under the slab is untouched. Bounds stay exact by
// construction: the -X bargeboard face and the +Z eave take the extremes the
// deleted provider shards used to set.
export const EDGE = Object.freeze({
  // Wall planes, measured on the delivered body (local, pre node scale).
  wallNegX: -0.463,
  wallPosX: 0.384,
  wallPosZ: 0.42,
  wallNegZ: -0.376,
  // Provider faces deleted: centroid beyond these, and within `depth` below
  // the slab's top plane. The walls start ~0.15 below it; the shell ends 0.069.
  zoneNegX: -0.466,
  zonePosX: 0.387,
  zonePosZ: 0.423,
  zoneNegZ: -0.38,
  depth: 0.09,
  // Board dimensions (local units; x6.001 for metres).
  proud: 0.013, // bargeboard top above the slab plane; tile courses stand 0.010 proud
  bargeDepth: 0.07, // vertical, below the tile plane; covers the old 0.068 verge
  bargeOverlap: 0.004, // bargeboard inner face past the slab end
  bargeWidth: 0.018, // both boards; the -X slab end moves out to meet its board
  fasciaSetback: 0.012, // fascia face behind the tile edge
  fasciaThickness: 0.016,
  fasciaDepth: 0.05, // vertical, below the tile plane at the eave line
  soffitThickness: 0.008,
  chamfer: 0.004,
});
// Crafted parts this trim replaces: the two fascia strips and four verge rods.
export const CRAFTED_EDGE_FACES = Object.freeze([
  4451,
  4452,
  4973,
  4974,
  ...Array.from({ length: 24 }, (_, i) => 4937 + i),
  ...Array.from({ length: 24 }, (_, i) => 5459 + i),
]);
export const RIDGE_FACES = Object.freeze(Array.from({ length: 16 }, (_, i) => 5483 + i));
export const ROOF_SLAB_FACES = Object.freeze([
  ...Array.from({ length: 12 }, (_, i) => 4439 + i),
  ...Array.from({ length: 12 }, (_, i) => 4961 + i),
]);
export const EDGE_DELETED_COUNT = 457;
export const EDGE_DELETED_SHA256 =
  'ddd1fc05a51b3fa5fa52ae749d49b347da6ebdee9eacddf147a1df477fe39c4f';

// Chimney flashing (asset loop, 2026-11-05, round 2). The crafted apron was
// eight thick slabs ray-cast onto whatever lay highest, and the authoring's
// chimney "protect" box (Blender x -.25..-.075, y .125..31) kept the provider
// roof skin around the chimney standing 11-22 mm (local) above the slab
// plane, so tile lips, provider skin and slab corners poked through each
// other: the judge read jagged dark shards and loose side tabs. Here the 96
// crafted apron faces and the provider skin remnants under and around them
// are deleted. Round 2 rebuilt the flashing as one flat plate and a sleeve;
// round 6 replaced both with rebuildChimney() below. Heights are measured from
// the slab's top plane: tile lips stand +0.010 proud of it.
export const APRON = Object.freeze({
  // Measured outer shaft walls (local), from the provider masonry planes.
  shaft: Object.freeze({ x0: -0.222, x1: -0.107, z0: -0.253, z1: -0.146 }),
  // Provider faces deleted: centroid in this box, outside the shaft core, and
  // every vertex below `ceiling` above the slab plane.
  box: Object.freeze({ x0: -0.26, x1: -0.065, z0: -0.32, z1: -0.115 }),
  core: 0.004,
  ceiling: 0.05,
});
export const CRAFTED_APRON_FACES = Object.freeze(Array.from({ length: 96 }, (_, i) => 5499 + i));
export const APRON_DELETED_COUNT = 121;
export const APRON_DELETED_SHA256 =
  'eb8227b547ca145a08ebe65262255bec1a9f92a72fba6b825e42533ecc998f05';

export function trimRoofEdges(p, beforeBounds) {
  const P = p.getAttribute('POSITION'),
    N = p.getAttribute('NORMAL'),
    UV = p.getAttribute('TEXCOORD_0'),
    oldIndices = p.getIndices().getArray(),
    faceCount = oldIndices.length / 3;
  assert.equal(faceCount, 5609, 'Trim runs on the wall-restored body');
  // Slab planes, read from the crafted slab itself.
  const [ridgeTop, eaveTop] = [0, 1].map((k) => P.getElement(oldIndices[4439 * 3 + k], [])),
    ridgeBottom = P.getElement(oldIndices[4441 * 3], []);
  assert(ridgeTop[2] === 0 && ridgeBottom[2] === 0 && eaveTop[2] > 0.46, 'Slab ridge and eave');
  const slope = (ridgeTop[1] - eaveTop[1]) / eaveTop[2],
    top = (z) => ridgeTop[1] - slope * Math.abs(z),
    bottom = (z) => ridgeBottom[1] - slope * Math.abs(z),
    slabEave = eaveTop[2];
  const slabX = [Infinity, -Infinity];
  for (const f of ROOF_SLAB_FACES)
    for (let k = 0; k < 3; k++) {
      const v = P.getElement(oldIndices[f * 3 + k], []);
      slabX[0] = Math.min(slabX[0], v[0]);
      slabX[1] = Math.max(slabX[1], v[0]);
    }
  const tri = (f) => [0, 1, 2].map((k) => P.getElement(oldIndices[f * 3 + k], []));
  // 1. Provider shell faces at the edges.
  const deleted = [];
  for (let f = 0; f < 4439; f++) {
    const c = [0, 1, 2].map((j) => tri(f).reduce((s, v) => s + v[j], 0) / 3);
    if (top(c[2]) - c[1] >= EDGE.depth) continue;
    if (
      c[0] < EDGE.zoneNegX ||
      c[0] > EDGE.zonePosX ||
      c[2] > EDGE.zonePosZ ||
      c[2] < EDGE.zoneNegZ
    )
      deleted.push(f);
  }
  assert.equal(deleted.length, EDGE_DELETED_COUNT, 'Exact reviewed roof-edge scope');
  assert.equal(hash(deleted.join(',')), EDGE_DELETED_SHA256, 'Exact reviewed roof-edge faces');
  // 1b. The old chimney apron and the provider roof skin around the chimney.
  const leadUV = UV.getElement(oldIndices[CRAFTED_APRON_FACES[0] * 3], []);
  for (const f of CRAFTED_APRON_FACES)
    for (let k = 0; k < 3; k++)
      assert(
        UV.getElement(oldIndices[f * 3 + k], []).every((u, j) => Math.abs(u - leadUV[j]) < 0.002),
        'Crafted apron faces sample the one lead patch'
      );
  const { shaft, box, core } = APRON,
    rel = (v) => v[1] - top(v[2]),
    apronDeleted = [];
  for (let f = 0; f < 4439; f++) {
    const t = tri(f),
      m = [0, 1, 2].map((j) => t.reduce((s, v) => s + v[j], 0) / 3);
    if (m[0] < box.x0 || m[0] > box.x1 || m[2] < box.z0 || m[2] > box.z1) continue;
    const inCore =
      m[0] > shaft.x0 + core &&
      m[0] < shaft.x1 - core &&
      m[2] > shaft.z0 + core &&
      m[2] < shaft.z1 - core;
    if (!inCore && Math.max(...t.map(rel)) < APRON.ceiling) apronDeleted.push(f);
  }
  assert(!apronDeleted.some((f) => deleted.includes(f)), 'Apron and edge scopes are disjoint');
  assert.equal(apronDeleted.length, APRON_DELETED_COUNT, 'Exact reviewed chimney-skirt scope');
  assert.equal(
    hash(apronDeleted.join(',')),
    APRON_DELETED_SHA256,
    'Exact reviewed chimney-skirt faces'
  );
  // 2. Extend slab and tile courses along the slope to the old eave line, so
  // tiles overhang the fascia and the +Z extreme is unchanged; carry the -X
  // ends out so both bargeboards are the same width and still cap the slab.
  const zEdge = beforeBounds.max[2];
  assert(zEdge > slabEave && -zEdge > beforeBounds.min[2], 'Eave extension stays in bounds');
  const xOuter = [beforeBounds.min[0], slabX[1] - EDGE.bargeOverlap + EDGE.bargeWidth],
    xInner = [xOuter[0] + EDGE.bargeWidth, slabX[1] - EDGE.bargeOverlap],
    dxNeg = xInner[0] - EDGE.bargeOverlap - slabX[0];
  assert(dxNeg < 0 && dxNeg > -0.012, 'The -X slab end moves out a little');
  const moved = new Set();
  for (let f = 4439; f < 5459; f++) {
    if (CRAFTED_EDGE_FACES.includes(f)) continue;
    for (let k = 0; k < 3; k++) {
      const i = oldIndices[f * 3 + k];
      if (moved.has(i)) continue;
      const v = P.getElement(i, []),
        eave = Math.abs(v[2]) >= slabEave - 0.006,
        end = v[0] < slabX[0] + 0.003;
      if (!eave && !end) continue;
      const s = Math.sign(v[2]),
        dz = eave ? zEdge - slabEave : 0;
      P.setElement(i, [
        end ? v[0] + dxNeg : v[0],
        v[1] - slope * dz,
        !eave ? v[2] : Math.abs(v[2] - s * slabEave) < 1e-6 ? s * zEdge : v[2] + s * dz,
      ]);
      moved.add(i);
    }
  }
  // 3. Ridge reaches the bargeboard faces.
  const ridgeRings = [[], []],
    ridgeMoved = new Set();
  for (const f of RIDGE_FACES)
    for (let k = 0; k < 3; k++) {
      const i = oldIndices[f * 3 + k];
      if (ridgeMoved.has(i)) continue;
      ridgeMoved.add(i);
      const v = P.getElement(i, []),
        end = Math.abs(v[0] - slabX[0]) < 1e-4 ? 0 : Math.abs(v[0] - slabX[1]) < 1e-4 ? 1 : -1;
      assert(end >= 0, 'Ridge vertex at a slab end');
      if (!ridgeRings[end].some((r) => r[1] === v[1] && r[2] === v[2])) ridgeRings[end].push(v);
      P.setElement(i, [xOuter[end], v[1], v[2]]);
    }
  // 4. New closed boards. Each is a convex prism: a 2D profile carried along
  // an affine map, so every side is a planar parallelogram.
  const added = [];
  // A convex solid lofted through rings of equal length, capped at the ends.
  const loft = (name, rings, caps = [true, true]) => {
    const faces = [];
    for (let r = 0; r + 1 < rings.length; r++) {
      const r0 = rings[r],
        r1 = rings[r + 1];
      for (let i = 0; i < r0.length; i++) {
        const j = (i + 1) % r0.length;
        faces.push([r0[i], r0[j], r1[j]], [r0[i], r1[j], r1[i]]);
      }
    }
    for (const [use, r] of [
      [caps[0], rings[0]],
      [caps[1], rings[rings.length - 1]],
    ])
      if (use) for (let i = 1; i + 1 < r.length; i++) faces.push([r[0], r[i], r[i + 1]]);
    const all = rings.flat(),
      centre = [0, 1, 2].map((j) => all.reduce((s, v) => s + v[j], 0) / all.length);
    for (const face of faces) {
      let n = normal(face);
      const c = [0, 1, 2].map((j) => (face[0][j] + face[1][j] + face[2][j]) / 3);
      if (
        dot(
          n,
          c.map((v, j) => v - centre[j])
        ) < 0
      ) {
        face.reverse();
        n = normal(face);
      }
      assert(
        dot(
          n,
          c.map((v, j) => v - centre[j])
        ) > 0,
        `${name}: outward face`
      );
      added.push({ name, face, normal: n });
    }
  };
  const prism = (name, profile, map, t0, t1, caps = [true, true]) => {
    const ring = (t) => profile.map(([a, b]) => map(a, b, t));
    loft(name, [ring(t0), ring(t1)], caps);
  };
  const c = EDGE.chamfer,
    D = EDGE.bargeDepth;
  for (const side of [0, 1]) {
    const inward = side === 0 ? 1 : -1,
      outer = xOuter[side],
      inner = xInner[side],
      barge = [
        [inner, -EDGE.proud],
        [outer + inward * c * 0.75, -EDGE.proud],
        [outer, -EDGE.proud + c * 0.75],
        [outer, D - c],
        [outer + inward * c, D],
        [inner, D],
      ],
      wall = side === 0 ? EDGE.wallNegX : EDGE.wallPosX,
      // From inside the bargeboard to inside the gable wall.
      soffit = [
        [inner - inward * 0.002, D - 0.003 - EDGE.soffitThickness],
        [wall + inward * 0.003, D - 0.003 - EDGE.soffitThickness],
        [wall + inward * 0.003, D - 0.003],
        [inner - inward * 0.002, D - 0.003],
      ];
    for (const s of [1, -1]) {
      const rake = (a, b, t) => [a, top(t) - b, t];
      // Rakes meet at z=0 with identical profiles: no cap there, one welded mitre.
      prism(`bargeboard-${side ? '+' : '-'}X${s > 0 ? '+' : '-'}Z`, barge, rake, 0, s * zEdge, [
        false,
        true,
      ]);
      prism(
        `verge-soffit-${side ? '+' : '-'}X${s > 0 ? '+' : '-'}Z`,
        soffit,
        rake,
        0,
        s * (zEdge - EDGE.fasciaSetback - EDGE.fasciaThickness + 0.002),
        [false, true]
      );
    }
  }
  const fasciaOut = zEdge - EDGE.fasciaSetback,
    fasciaIn = fasciaOut - EDGE.fasciaThickness,
    fasciaBottom = top(zEdge) - EDGE.fasciaDepth,
    x0 = xInner[0] - 0.002,
    x1 = xInner[1] + 0.002;
  for (const s of [1, -1]) {
    const across = (a, b, t) => [t, b, s * a],
      wall = s > 0 ? EDGE.wallPosZ : -EDGE.wallNegZ;
    prism(
      `fascia${s > 0 ? '+' : '-'}Z`,
      [
        [fasciaIn, bottom(fasciaIn) + 0.0015],
        [fasciaOut, bottom(fasciaOut) + 0.0015],
        [fasciaOut, fasciaBottom + c],
        [fasciaOut - c, fasciaBottom],
        [fasciaIn, fasciaBottom],
      ],
      across,
      x0,
      x1
    );
    prism(
      `eave-soffit${s > 0 ? '+' : '-'}Z`,
      [
        [wall - 0.004, fasciaBottom + 0.006],
        [fasciaIn + 0.002, fasciaBottom + 0.006],
        [fasciaIn + 0.002, fasciaBottom + 0.006 + EDGE.soffitThickness],
        [wall - 0.004, fasciaBottom + 0.006 + EDGE.soffitThickness],
      ],
      across,
      // Stops just proud of the gable walls: past them it would be a shelf
      // hanging below the sloped verge soffit.
      EDGE.wallNegX - 0.003,
      EDGE.wallPosX + 0.003
    );
  }
  // Ridge end caps, now that the ridge stops at the bargeboard faces.
  for (const end of [0, 1]) {
    const r = ridgeRings[end];
    assert.equal(r.length, 8, 'Octagonal ridge ring');
    const cy = r.reduce((s, v) => s + v[1], 0) / 8,
      cz = r.reduce((s, v) => s + v[2], 0) / 8,
      ordered = r
        .map((v) => [xOuter[end], v[1], v[2]])
        .sort((a, b) => Math.atan2(a[1] - cy, a[2] - cz) - Math.atan2(b[1] - cy, b[2] - cz));
    const out = end === 0 ? -1 : 1;
    for (let i = 1; i + 1 < 8; i++) {
      const face = [ordered[0], ordered[i], ordered[i + 1]];
      if (normal(face)[0] * out < 0) face.reverse();
      added.push({ name: `ridge-cap-${end ? '+' : '-'}X`, face, normal: normal(face) });
    }
  }
  // 4b. Round 6: the chimney flashing is no longer built here. The round-2
  // plate sat at constant heights over the slab plane while each tile course
  // is its own plane, so it stood proud at the top of a course and sank at the
  // lip; rebuildChimney() lays the flashing course by course instead.
  // 5. Rebuild: kept faces (compacted), then the new boards, flat-shaded on the
  // existing trim texel so they read as the same painted timber as the ridge.
  const drop = new Set([
      ...deleted,
      ...CRAFTED_EDGE_FACES,
      ...apronDeleted,
      ...CRAFTED_APRON_FACES,
    ]),
    trimUV = [0, 1, 2].map((k) => UV.getElement(oldIndices[4937 * 3 + k], [])),
    remap = new Map(),
    keptIndices = [];
  for (let f = 0; f < faceCount; f++) {
    if (drop.has(f)) continue;
    for (let k = 0; k < 3; k++) {
      const i = oldIndices[f * 3 + k];
      if (!remap.has(i)) remap.set(i, remap.size);
      keptIndices.push(remap.get(i));
    }
  }
  const kept = remap.size,
    total = kept + added.length * 3,
    build = (attr, extra) => {
      const size = attr.getElementSize(),
        out = new (attr.getArray().constructor)(total * size);
      for (const [from, to] of remap) out.set(attr.getElement(from, []), to * size);
      added.forEach((a, f) => {
        for (let k = 0; k < 3; k++) out.set(extra(a, k), (kept + f * 3 + k) * size);
      });
      attr.setArray(out);
    };
  build(P, (a, k) => a.face[k]);
  build(N, (a) => a.normal);
  build(UV, (a, k) => trimUV[k]);
  const indices = new oldIndices.constructor(keptIndices.length + added.length * 3);
  indices.set(keptIndices);
  for (let i = keptIndices.length; i < indices.length; i++)
    indices[i] = kept + i - keptIndices.length;
  p.getIndices().setArray(indices);
  assert.deepEqual(bounds(p), beforeBounds, 'Roof-edge trim keeps exact bounds');
  assert(indices.length <= 25200);
  const parts = {};
  for (const a of added) parts[a.name] = (parts[a.name] ?? 0) + 1;
  return {
    scope:
      'Reverses the earlier roof-cleanup rejection for the edges only: deletes provider roof-shell faces outside the wall footprint, replaces crafted verge rods and fascia strips with closed chamfered bargeboards, fascias, eave and verge soffits, and extends slab and tiles to the old eave line; deletes the crafted chimney apron and the provider skin around the chimney (the flashing is rebuilt by the chimney step)',
    deletedProviderFaces: deleted.length,
    deletedProviderFacesSHA256: hash(deleted.join(',')),
    replacedCraftedFaces: CRAFTED_EDGE_FACES.length,
    deletedChimneySkirtFaces: apronDeleted.length,
    deletedChimneySkirtFacesSHA256: hash(apronDeleted.join(',')),
    replacedApronFaces: CRAFTED_APRON_FACES.length,
    movedEaveVertices: moved.size,
    addedFaces: added.length,
    addedParts: parts,
    trianglesAfter: indices.length / 3,
    verticesAfter: total,
    renderVertices: indices.length,
  };
}
// Window joinery (asset loop, 2026-11-05, round 3). The provider's sculpted
// shutters, frames and sills were lumpy and bulging, and the shutter left of
// the door was a separate island floating 2-5 cm off the wall. Three rounds
// of judging showed they cannot be patched, so here every provider face of the
// window joinery (centroid proud of the measured wall inside each window box,
// plus any welded island wholly inside a box) is deleted, and the joinery is
// rebuilt from measured planes as closed, chamfered slabs: a mitred frame,
// glass, glazing bars, a lintel and sill, and ledged shutter leaves with raised
// fields and iron straps. Backs are seated 1.5 mm (local) into the wall and the
// parts overlap where they meet, so the holes the deletion leaves are covered
// with no slit. Each part takes one uniform atlas texel, so its edges read crisp.
const TEXEL = (x, y) => Object.freeze([(x + 0.5) / 1024, (y + 0.5) / 1024]);
// Uniform 11 px atlas blocks with a flat normal-map patch, measured on the
// delivered albedo: frame green 79,128,51; glass 59,49,39 (rough 0.11); sill
// wood 145,89,30. The glass block's 17 px neighbourhood stays below sRGB 70.
export const WINDOW_TEXELS = Object.freeze({
  paint: TEXEL(70, 526),
  glass: TEXEL(950, 856),
  wood: TEXEL(38, 389),
});
// The runtime night-window shader finds glass by position and a dark albedo
// (src/components/models/GeneratedOfficeModel.tsx, applyFarmWindows): side
// facade x >= .38 and x < .405, z in [.130, .252]; end facades |z| >= .37,
// x in [-.335, -.235], +Z glass z < .439, -Z glass z >= -.390; y in
// [-.247, -.139] on both. The openings below are exactly those boxes.
export const GLAZING = Object.freeze({
  y: Object.freeze([-0.247, -0.139]),
  side: Object.freeze([0.13, 0.252]),
  end: Object.freeze([-0.335, -0.235]),
  sideX: Object.freeze([0.38, 0.405]),
  posZMax: 0.439,
  negZMin: -0.39,
  endMin: 0.37,
});
// axis/sign: the facade's outward axis; h: the axis along the wall. `wall` is
// the nominal outward plane used to select proud faces; the seating plane is
// re-measured from the kept wall. Boxes are in (h, y).
export const WINDOWS = Object.freeze([
  Object.freeze({
    name: 'front',
    axis: 0,
    sign: 1,
    h: 2,
    wall: 0.3842,
    box: Object.freeze({ h: [0.02, 0.38], y: [-0.29, -0.1] }),
    opening: GLAZING.side,
    leaves: Object.freeze([
      [0.0185, 0.1185, -1],
      [0.2635, 0.3685, 1],
    ]),
    lintel: Object.freeze([0.016, 0.371]),
    sill: Object.freeze([0.016, 0.371]),
  }),
  Object.freeze({
    name: 'front-closed',
    axis: 0,
    sign: 1,
    h: 2,
    wall: 0.3842,
    box: Object.freeze({ h: [-0.3, -0.18], y: [-0.29, -0.09] }),
    opening: null,
    leaves: Object.freeze([[-0.29, -0.193, -1]]),
    lintel: Object.freeze([-0.2925, -0.1905]),
    sill: Object.freeze([-0.2925, -0.1905]),
  }),
  Object.freeze({
    name: 'gable+Z',
    axis: 2,
    sign: 1,
    h: 0,
    wall: 0.4196,
    box: Object.freeze({ h: [-0.38, -0.19], y: [-0.29, -0.11] }),
    opening: GLAZING.end,
    casing: Object.freeze([-0.376, -0.194]),
    sill: Object.freeze([-0.38, -0.19]),
  }),
  Object.freeze({
    name: 'gable-Z',
    axis: 2,
    sign: -1,
    h: 0,
    wall: 0.3761,
    box: Object.freeze({ h: [-0.39, -0.19], y: [-0.29, -0.11] }),
    opening: GLAZING.end,
    casing: Object.freeze([-0.376, -0.194]),
    sill: Object.freeze([-0.38, -0.19]),
  }),
]);
// Heights (y) and offsets (o, outward from the seating plane), local units.
export const JOINERY = Object.freeze({
  seat: -0.0015, // every back face sits this far inside the wall
  sashSide: 0.012,
  sashTop: 0.012,
  sashBottom: 0.016,
  sashFront: 0.011,
  glassFront: 0.003,
  barWidth: 0.0055,
  barFront: 0.0075,
  casingTop: -0.113,
  casingFront: 0.005,
  lintel: Object.freeze([-0.127, -0.1125]),
  lintelFront: 0.013,
  sill: Object.freeze([-0.284, -0.262]),
  sillFront: 0.019,
  leafTop: -0.127,
  leafBottom: -0.263,
  leafFront: 0.006,
  fieldFront: 0.0085,
  chamfer: 0.0012,
});
export const WINDOW_DELETED_COUNT = 1556;
export const WINDOW_DELETED_SHA256 =
  'b3e8197400a8f693d1c2cea497839568e6f10c9a580525318e51000e7cd276e5';

export function rebuildWindows(p, beforeBounds) {
  const P = p.getAttribute('POSITION'),
    N = p.getAttribute('NORMAL'),
    UV = p.getAttribute('TEXCOORD_0'),
    oldIndices = p.getIndices().getArray(),
    faceCount = oldIndices.length / 3,
    J = JOINERY;
  assert.equal(faceCount, 5055, 'Window step runs on the roof-trimmed body');
  for (const [a, b] of [
    [J.sill[1], GLAZING.y[0] - J.sashBottom],
    [J.lintel[0], GLAZING.y[1] + J.sashTop],
  ])
    assert(Math.abs(a - b) < 0.0011, 'Sill and lintel meet the frame');
  const vtx = (i) => P.getElement(i, []),
    tri = (f) => [0, 1, 2].map((k) => vtx(oldIndices[f * 3 + k])),
    keyOf = (v) => v.map((x) => x.toFixed(5)).join(','),
    out = (w, v) => w.sign * v[w.axis],
    inBox = (w, v, m = 0) =>
      v[w.h] > w.box.h[0] - m &&
      v[w.h] < w.box.h[1] + m &&
      v[1] > w.box.y[0] - m &&
      v[1] < w.box.y[1] + m;
  // Welded islands (by position), to catch joinery islands wholly inside a box.
  const vkey = new Map(),
    parent = [];
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const vid = (i) => {
    const k = keyOf(vtx(i));
    if (!vkey.has(k)) {
      vkey.set(k, parent.length);
      parent.push(parent.length);
    }
    return vkey.get(k);
  };
  const faceKeys = [];
  for (let f = 0; f < faceCount; f++) {
    const ks = [0, 1, 2].map((k) => vid(oldIndices[f * 3 + k]));
    faceKeys.push(ks);
    parent[find(ks[1])] = find(ks[0]);
    parent[find(ks[2])] = find(ks[0]);
  }
  const islands = new Map();
  for (let f = 0; f < faceCount; f++) {
    const r = find(faceKeys[f][0]);
    if (!islands.has(r)) islands.set(r, []);
    islands.get(r).push(f);
  }
  // 1. Delete the provider joinery.
  const deleted = new Set(),
    perWindow = {};
  for (const w of WINDOWS) {
    const mine = new Set();
    for (let f = 0; f < faceCount; f++) {
      const t = tri(f),
        c = [0, 1, 2].map((j) => (t[0][j] + t[1][j] + t[2][j]) / 3);
      if (inBox(w, c) && out(w, c) > w.wall + 0.001) mine.add(f);
    }
    for (const faces of islands.values())
      if (
        faces.length < 500 &&
        faces.every((f) => tri(f).every((v) => inBox(w, v) && out(w, v) > w.wall - 0.004))
      )
        for (const f of faces) mine.add(f);
    for (const f of mine) {
      assert(!deleted.has(f), 'Window boxes are disjoint');
      deleted.add(f);
    }
    perWindow[w.name] = { deletedFaces: mine.size };
  }
  const deletedList = [...deleted].sort((a, b) => a - b);
  assert.equal(deletedList.length, WINDOW_DELETED_COUNT, 'Exact reviewed window-joinery scope');
  assert.equal(
    hash(deletedList.join(',')),
    WINDOW_DELETED_SHA256,
    'Exact reviewed window-joinery faces'
  );
  // 2. Holes the deletion opens: edges that were shared and are now open.
  const edgeCount = (keep) => {
    const m = new Map();
    for (let f = 0; f < faceCount; f++) {
      if (!keep(f)) continue;
      const ks = faceKeys[f];
      for (let k = 0; k < 3; k++) {
        const a = ks[k],
          b = ks[(k + 1) % 3],
          e = a < b ? `${a}:${b}` : `${b}:${a}`;
        m.set(e, (m.get(e) ?? 0) + 1);
      }
    }
    return m;
  };
  const before = edgeCount(() => true),
    after = edgeCount((f) => !deleted.has(f)),
    keyPos = new Map([...vkey].map(([k, id]) => [id, k.split(',').map(Number)])),
    rim = new Set();
  for (const [e, n] of after)
    if (n === 1 && before.get(e) !== 1) for (const id of e.split(':')) rim.add(Number(id));
  const rimPoints = [...rim].map((id) => keyPos.get(id));
  // 3. Build each window from its measured seating plane.
  const added = [];
  const loft = (name, uv, rings, caps = [true, true]) => {
    const faces = [];
    for (let r = 0; r + 1 < rings.length; r++)
      for (let i = 0; i < rings[r].length; i++) {
        const j = (i + 1) % rings[r].length;
        faces.push(
          [rings[r][i], rings[r][j], rings[r + 1][j]],
          [rings[r][i], rings[r + 1][j], rings[r + 1][i]]
        );
      }
    for (const [use, r] of [
      [caps[0], rings[0]],
      [caps[1], rings[rings.length - 1]],
    ])
      if (use) for (let i = 1; i + 1 < r.length; i++) faces.push([r[0], r[i], r[i + 1]]);
    const all = rings.flat(),
      centre = [0, 1, 2].map((j) => all.reduce((s, v) => s + v[j], 0) / all.length);
    for (const face of faces) {
      if (Math.hypot(...normalRaw(face)) < 1e-14) continue;
      let n = normal(face);
      const c = [0, 1, 2].map((j) => (face[0][j] + face[1][j] + face[2][j]) / 3),
        d = c.map((v, j) => v - centre[j]);
      if (dot(n, d) < 0) {
        face.reverse();
        n = normal(face);
      }
      assert(dot(n, d) > 0, `${name}: outward face`);
      added.push({ name, face, normal: n, uv });
    }
  };
  // Offset each edge of a convex 2D polygon toward its centre by d[i].
  const inset = (poly, d) => {
    const n = poly.length,
      c = [0, 1].map((j) => poly.reduce((s, v) => s + v[j], 0) / n),
      lines = poly.map((a, i) => {
        const b = poly[(i + 1) % n],
          e = [b[0] - a[0], b[1] - a[1]],
          l = Math.hypot(...e);
        let m = [-e[1] / l, e[0] / l];
        if (m[0] * (c[0] - a[0]) + m[1] * (c[1] - a[1]) < 0) m = [-m[0], -m[1]];
        return { m, k: m[0] * a[0] + m[1] * a[1] + d[i] };
      });
    return poly.map((_, i) => {
      const A = lines[(i + n - 1) % n],
        B = lines[i],
        det = A.m[0] * B.m[1] - A.m[1] * B.m[0];
      assert(Math.abs(det) > 1e-9, 'Inset corner is defined');
      return [(A.k * B.m[1] - B.k * A.m[1]) / det, (A.m[0] * B.k - B.m[0] * A.k) / det];
    });
  };
  const report = [],
    cover = [];
  for (const w of WINDOWS) {
    const at = (h, y, o) => {
        const v = [0, y, 0];
        v[w.h] = h;
        v[w.axis] = w.sign * (seat + o);
        return v;
      },
      ring = (poly, o) => poly.map(([h, y]) => at(h, y, o)),
      rect = (h0, h1, y0, y1) => [
        [h0, y0],
        [h1, y0],
        [h1, y1],
        [h0, y1],
      ],
      parts = [];
    // Seating plane: the most recessed kept wall vertex under this window.
    const footprint = [
      Math.min(...(w.leaves ?? []).map((l) => l[0]), ...(w.casing ?? []), ...w.sill),
      Math.max(...(w.leaves ?? []).map((l) => l[1]), ...(w.casing ?? []), ...w.sill),
    ];
    let seat = Infinity;
    for (let f = 0; f < faceCount; f++) {
      if (deleted.has(f)) continue;
      for (const v of tri(f))
        if (
          v[w.h] > footprint[0] &&
          v[w.h] < footprint[1] &&
          v[1] > J.sill[0] &&
          v[1] < J.casingTop &&
          Math.abs(out(w, v) - w.wall) < 0.012
        )
          seat = Math.min(seat, out(w, v));
    }
    assert(seat > w.wall - 0.004 && seat <= w.wall + 0.001, `${w.name}: measured wall plane`);
    // A slab: back at the seat, a chamfer ring, an inset front.
    const slab = (name, uv, poly, o0, o1, ch, d = poly.map(() => ch)) => {
      // Every slab's back is buried (in the wall, the leaf or the glass) and
      // is never seen: it is left open.
      loft(
        name,
        uv,
        ch > 0
          ? [ring(poly, o0), ring(poly, o1 - ch), ring(inset(poly, d), o1)]
          : [ring(poly, o0), ring(poly, o1)],
        [false, true]
      );
      parts.push({ name, poly, front: o1 });
    };
    const box = (name, uv, h0, h1, y0, y1, o0, o1, ch) =>
      slab(name, uv, rect(h0, h1, y0, y1), o0, o1, ch);
    const extrude = (name, uv, profile, h0, h1) => {
      loft(
        name,
        uv,
        [h0, h1].map((h) => profile.map(([o, y]) => at(h, y, o)))
      );
      parts.push({
        name,
        poly: rect(
          h0,
          h1,
          Math.min(...profile.map((q) => q[1])),
          Math.max(...profile.map((q) => q[1]))
        ),
        front: Math.max(...profile.map((q) => q[0])),
      });
    };
    const ch = J.chamfer,
      [y0, y1] = GLAZING.y;
    if (w.opening) {
      const [h0, h1] = w.opening,
        outer = [h0 - J.sashSide, h1 + J.sashSide, y0 - J.sashBottom, y1 + J.sashTop],
        corners = (r) => [
          [r[0], r[2]],
          [r[1], r[2]],
          [r[1], r[3]],
          [r[0], r[3]],
        ],
        mitred = (name, uv, o, i, front) => {
          const O = corners(o),
            I = corners(i);
          for (let k = 0; k < 4; k++) {
            const q = [O[k], O[(k + 1) % 4], I[(k + 1) % 4], I[k]],
              area = q.reduce((s, a, i) => {
                const b = q[(i + 1) % 4];
                return s + a[0] * b[1] - b[0] * a[1];
              }, 0);
            // A casing that stands on the sill has no bottom board.
            if (Math.abs(area) < 1e-9) continue;
            // Chamfer the outer and inner edges only; the mitres stay shared.
            slab(`${name}-${k}`, uv, q, J.seat, front, ch, [ch, 0, ch, 0]);
          }
        };
      // Glass first: the shader box decides where it may be.
      const glass = [h0 - 0.002, h1 + 0.002, y0 - 0.002, y1 + 0.002];
      box(`${w.name}-glass`, WINDOW_TEXELS.glass, ...glass, J.seat, J.glassFront, 0);
      const glassOut = seat + J.glassFront;
      if (w.axis === 0)
        assert(
          seat + J.glassFront >= GLAZING.sideX[0] && seat + J.glassFront < GLAZING.sideX[1],
          `${w.name}: glass inside the shader's recess`
        );
      else
        assert(
          glassOut >= GLAZING.endMin &&
            (w.sign > 0 ? glassOut < GLAZING.posZMax : -glassOut >= GLAZING.negZMin),
          `${w.name}: glass inside the shader's recess`
        );
      mitred(`${w.name}-frame`, WINDOW_TEXELS.paint, outer, [h0, h1, y0, y1], J.sashFront);
      const hc = (h0 + h1) / 2,
        yc = (y0 + y1) / 2,
        b = J.barWidth / 2;
      box(
        `${w.name}-bar-v`,
        WINDOW_TEXELS.paint,
        hc - b,
        hc + b,
        y0 - 0.0015,
        y1 + 0.0015,
        0.002,
        J.barFront,
        0
      );
      box(
        `${w.name}-bar-h0`,
        WINDOW_TEXELS.paint,
        h0 - 0.0015,
        hc - b,
        yc - b,
        yc + b,
        0.002,
        J.barFront,
        0
      );
      box(
        `${w.name}-bar-h1`,
        WINDOW_TEXELS.paint,
        hc + b,
        h1 + 0.0015,
        yc - b,
        yc + b,
        0.002,
        J.barFront,
        0
      );
      if (w.casing)
        mitred(
          `${w.name}-casing`,
          WINDOW_TEXELS.paint,
          [w.casing[0], w.casing[1], outer[2], J.casingTop],
          outer,
          J.casingFront
        );
    }
    for (const [index, [l0, l1, hinge]] of (w.leaves ?? []).entries()) {
      const name = `${w.name}-leaf${index}`,
        top = J.leafTop,
        bottom = J.leafBottom;
      box(name, WINDOW_TEXELS.paint, l0, l1, bottom, top, J.seat, J.leafFront, ch);
      // Two raised fields between stiles and rails.
      const side = 0.011,
        railTop = 0.013,
        railBottom = 0.015,
        mid = 0.01,
        fh = (top - railTop - (bottom + railBottom) - mid) / 2;
      for (const [fy0, fy1] of [
        [bottom + railBottom, bottom + railBottom + fh],
        [top - railTop - fh, top - railTop],
      ])
        box(
          `${name}-field`,
          WINDOW_TEXELS.paint,
          l0 + side,
          l1 - side,
          fy0,
          fy1,
          J.leafFront - 0.0005,
          J.fieldFront,
          0.0016
        );
      // Iron straps from the hinge stile across the rails.
      const edge = hinge < 0 ? l0 : l1,
        reach = 0.6 * (l1 - l0);
      for (const sy of [top - 0.0065, bottom + 0.0075])
        box(
          `${name}-strap`,
          WINDOW_TEXELS.glass,
          Math.min(edge - hinge * 0.0015, edge - hinge * reach),
          Math.max(edge - hinge * 0.0015, edge - hinge * reach),
          sy - 0.002,
          sy + 0.002,
          J.leafFront - 0.0005,
          J.leafFront + 0.0012,
          0
        );
    }
    if (w.lintel)
      extrude(
        `${w.name}-lintel`,
        WINDOW_TEXELS.paint,
        [
          [J.seat, J.lintel[1]],
          [J.lintelFront - 0.002, J.lintel[1]],
          [J.lintelFront, J.lintel[1] - 0.002],
          [J.lintelFront, J.lintel[0] + 0.001],
          [J.lintelFront - 0.001, J.lintel[0]],
          [J.seat, J.lintel[0]],
        ],
        ...w.lintel
      );
    extrude(
      `${w.name}-sill`,
      WINDOW_TEXELS.wood,
      [
        [J.seat, J.sill[1]],
        [J.sillFront - 0.003, J.sill[1] - 0.0015],
        [J.sillFront, J.sill[1] - 0.0035],
        [J.sillFront, J.sill[0] + 0.0015],
        [J.sillFront - 0.0015, J.sill[0]],
        [J.seat, J.sill[0]],
      ],
      ...w.sill
    );
    // Nothing kept may poke through a part's face.
    for (let f = 0; f < faceCount; f++) {
      if (deleted.has(f)) continue;
      for (const v of tri(f))
        for (const part of parts) {
          const hs = part.poly.map((q) => q[0]),
            ys = part.poly.map((q) => q[1]);
          if (
            v[w.h] > Math.min(...hs) + 0.0005 &&
            v[w.h] < Math.max(...hs) - 0.0005 &&
            v[1] > Math.min(...ys) + 0.0005 &&
            v[1] < Math.max(...ys) - 0.0005 &&
            Math.abs(out(w, v) - seat) < 0.03
          )
            assert(
              out(w, v) < seat + part.front - 0.0003,
              `${w.name}: kept wall pokes through ${part.name}`
            );
        }
    }
    cover.push({ w, seat, parts });
    report.push({ name: w.name, seatPlane: seat, parts: parts.length, ...perWindow[w.name] });
  }
  // Every rim vertex lies under some part, with a 1 mm (local) margin all round.
  const covered = (v) =>
    cover.some(
      ({ w, parts }) =>
        inBox(w, v, 0.01) &&
        [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [0.7, 0.7],
          [-0.7, 0.7],
          [0.7, -0.7],
          [-0.7, -0.7],
        ].every(([dh, dy]) =>
          parts.some((part) => {
            const hs = part.poly.map((q) => q[0]),
              ys = part.poly.map((q) => q[1]),
              h = v[w.h] + dh * 0.001,
              y = v[1] + dy * 0.001;
            return (
              h >= Math.min(...hs) &&
              h <= Math.max(...hs) &&
              y >= Math.min(...ys) &&
              y <= Math.max(...ys)
            );
          })
        )
    );
  const exposed = rimPoints.filter((v) => !covered(v));
  assert.equal(
    exposed.length,
    0,
    `Every opened rim is covered: ${JSON.stringify(exposed.slice(0, 4))}`
  );
  // 4. Rebuild: kept faces compacted, then the new parts, flat-shaded.
  const remap = new Map(),
    keptIndices = [];
  for (let f = 0; f < faceCount; f++) {
    if (deleted.has(f)) continue;
    for (let k = 0; k < 3; k++) {
      const i = oldIndices[f * 3 + k];
      if (!remap.has(i)) remap.set(i, remap.size);
      keptIndices.push(remap.get(i));
    }
  }
  // New corners shared by coplanar triangles of one part are one vertex:
  // equal position, flat normal and texel.
  const kept = remap.size,
    corners = [],
    cornerOf = new Map(),
    addedIndices = [];
  for (const a of added)
    for (let k = 0; k < 3; k++) {
      const key = [...a.face[k], ...a.normal.map((v) => v.toFixed(6)), ...a.uv].join(',');
      if (!cornerOf.has(key)) {
        cornerOf.set(key, kept + corners.length);
        corners.push({ position: a.face[k], normal: a.normal, uv: a.uv });
      }
      addedIndices.push(cornerOf.get(key));
    }
  const total = kept + corners.length,
    build = (attr, field) => {
      const size = attr.getElementSize(),
        arr = new (attr.getArray().constructor)(total * size);
      for (const [from, to] of remap) arr.set(attr.getElement(from, []), to * size);
      corners.forEach((c, i) => arr.set(c[field], (kept + i) * size));
      attr.setArray(arr);
    };
  build(P, 'position');
  build(N, 'normal');
  build(UV, 'uv');
  const indices = new oldIndices.constructor(keptIndices.length + addedIndices.length);
  indices.set(keptIndices);
  indices.set(addedIndices, keptIndices.length);
  p.getIndices().setArray(indices);
  assert.deepEqual(bounds(p), beforeBounds, 'Window step keeps exact bounds');
  assert(indices.length <= 25200);
  const parts = {};
  for (const a of added) {
    const k = a.name.replace(/-\d$/, '');
    parts[k] = (parts[k] ?? 0) + 1;
  }
  return {
    scope:
      'Deletes the sculpted provider window joinery on the +X front (window and the closed shutter left of the door) and both gable windows, and rebuilds frame, glass, glazing bars, lintel, sill and shutter leaves as closed chamfered slabs seated 1.5 mm into the measured wall; glass fills exactly the runtime glazing boxes',
    deletedFaces: deletedList.length,
    deletedFacesSHA256: hash(deletedList.join(',')),
    openedRimVertices: rimPoints.length,
    windows: report,
    addedFaces: added.length,
    addedParts: parts,
    trianglesAfter: indices.length / 3,
    verticesAfter: total,
    renderVertices: indices.length,
  };
}
// Roof tile field (asset loop, 2026-11-05, round 4). Every crafted tile is its
// own four-vertex quad sampling one flat atlas texel, but the author picked the
// texel with a period-5 rule shifted one tile per course ([A, A, A, B, C]), which
// the judge read top-down as diagonal stepped bands. Here each tile's UV patch is
// moved, whole and by integer pixels, to a texel chosen by a seeded hash of its
// slope, course and position from six measured roof colours, re-rolled when it
// would repeat its left neighbour (round 5: the palette, sampling and riser
// texel are below). The same step turns the 121 tile risers on the -Z slope the
// right way out: the author mirrored them without flipping them, so they faced
// uphill into the tile above, and at runtime (single-sided) they were culled.
export const TILE_SOURCE_TEXELS = Object.freeze([
  Object.freeze([489, 467]),
  Object.freeze([643, 730]),
  Object.freeze([975, 559]),
]);
// Round 5: the round-4 set spanned 2.1x in linear luminance (0.045-0.096), and
// the darkest entry (the author's 975,559) has a tilted, noisy normal patch, so
// under the sun one slope read as a coarse high-contrast mosaic and the other as
// a different, darker material. The palette is now six texels inside a 1.24x
// band (linear luminance 0.061-0.076, mean 0.069, the old mean 0.070), each the
// centre of a 13 px block that is uniform in albedo (channel spread <= 2), flat
// in the normal map (spread <= 2) and at roughness 137-146. Weights out of 20.
export const TILE_PALETTE = Object.freeze(
  [
    [[887, 297], '114,52,31', 3],
    [[50, 903], '118,53,31', 3],
    [[83, 670], '117,56,35', 4],
    [[88, 614], '120,55,33', 4],
    [[838, 318], '120,58,35', 3],
    [[682, 230], '125,59,37', 3],
  ].map(([texel, srgb, weight]) => Object.freeze({ texel: Object.freeze(texel), srgb, weight }))
);
// Tile and riser patches are re-centred on their texel's centre and shrunk to
// this span (px), so bilinear sampling reads the block centre alone and both
// slopes (the -Z one is a mirror with different sub-pixel offsets) sample alike.
export const TILE_UV_SPAN = 0.2;
// Risers leave the author's dark texel (975,559: linear 0.045, normal patch
// tilted 4/127 with spread 11) for a flat block a step darker than the tiles:
// 422,906, sRGB 103,48,28, linear 0.051, normal spread 0, roughness 143.
export const RISER_TEXEL = Object.freeze([422, 906]);
export const TILE_SEED = 'millos-farmhouse-roof-tiles-v1';
// Round 5 adds the eave course (13 tiles a slope), which the eave trim had
// stretched to a slightly steeper pitch and round 4's filter missed: it kept
// the author's period-5 texels, which the narrowed palette would have exposed.
export const TILE_COUNT = 242;
export const TURNED_RISER_FACES = 242;

export function relayRoofTiles(p, beforeBounds) {
  const P = p.getAttribute('POSITION'),
    N = p.getAttribute('NORMAL'),
    UV = p.getAttribute('TEXCOORD_0'),
    indices = p.getIndices().getArray(),
    faceCount = indices.length / 3;
  assert.equal(faceCount, 4285, 'Tile step runs on the window-rebuilt body');
  const vtx = (i) => P.getElement(i, []),
    tri = (f) => [0, 1, 2].map((k) => vtx(indices[f * 3 + k])),
    texelOf = (uv) => uv.map((v) => Math.floor(v * 1024)),
    sourceTexel = (uv) => {
      const t = texelOf(uv);
      return TILE_SOURCE_TEXELS.findIndex((s) => s[0] === t[0] && s[1] === t[1]);
    },
    uses = new Map();
  for (const i of indices) uses.set(i, (uses.get(i) ?? 0) + 1);
  // 1. Tile tops: the crafted tile pitch, on one of the author's three texels.
  const tileFaces = [];
  for (let f = 0; f < faceCount; f++) {
    const t = tri(f),
      raw = normalRaw(t),
      l = Math.hypot(...raw);
    if (l < 1e-14) continue;
    const n = raw.map((v) => v / l);
    // The field pitch (0.798, 0.603) and, since the eave trim stretched it to
    // the old eave line, the slightly steeper eave course (0.787, 0.617).
    if (Math.abs(n[0]) > 1e-4 || n[1] < 0.78 || n[1] > 0.81) continue;
    if (Math.abs(n[2]) < 0.59 || Math.abs(n[2]) > 0.625) continue;
    if (![0, 1, 2].every((k) => sourceTexel(UV.getElement(indices[f * 3 + k], [])) >= 0)) continue;
    tileFaces.push(f);
  }
  const byVertex = new Map();
  for (const f of tileFaces)
    for (let k = 0; k < 3; k++) {
      const i = indices[f * 3 + k];
      if (!byVertex.has(i)) byVertex.set(i, new Set());
      byVertex.get(i).add(f);
    }
  const seen = new Set(),
    tiles = [];
  for (const f of tileFaces) {
    if (seen.has(f)) continue;
    const group = new Set([f]),
      stack = [f];
    while (stack.length) {
      const g = stack.pop();
      for (let k = 0; k < 3; k++)
        for (const h of byVertex.get(indices[g * 3 + k]))
          if (!group.has(h)) {
            group.add(h);
            stack.push(h);
          }
    }
    for (const g of group) seen.add(g);
    const verts = [...new Set([...group].flatMap((g) => [0, 1, 2].map((k) => indices[g * 3 + k])))];
    assert.equal(group.size, 2, 'Each tile is one quad');
    assert.equal(verts.length, 4, 'Each tile has its own four vertices');
    for (const i of verts)
      assert.equal(
        uses.get(i),
        [...group].reduce(
          (s, g) => s + [0, 1, 2].filter((k) => indices[g * 3 + k] === i).length,
          0
        ),
        'Tile vertices are used by the tile only'
      );
    const source = new Set(verts.map((i) => sourceTexel(UV.getElement(i, []))));
    assert.equal(source.size, 1, 'One texel per tile');
    const pts = verts.map(vtx),
      c = [0, 1, 2].map((j) => pts.reduce((s, v) => s + v[j], 0) / 4);
    tiles.push({
      verts,
      source: [...source][0],
      side: Math.sign(c[2]),
      upper: Math.min(...pts.map((v) => Math.abs(v[2]))),
      x: c[0],
      positions: pts,
    });
  }
  // 2. Courses by the tile's upper edge, then position along the course.
  assert.equal(tiles.length, TILE_COUNT, 'Exact crafted tile scope');
  const uppers = [...new Set(tiles.map((t) => t.upper.toFixed(3)))].sort((a, b) => a - b);
  for (const t of tiles) t.course = uppers.indexOf(t.upper.toFixed(3));
  const courses = new Map();
  for (const t of tiles) {
    const k = `${t.side}:${t.course}`;
    if (!courses.has(k)) courses.set(k, []);
    courses.get(k).push(t);
  }
  // Move a patch onto a texel: its centre to the texel centre, its span scaled
  // to TILE_UV_SPAN px. The patch must have been inside one texel to start.
  const recentre = (verts, to) => {
    const uvs = verts.map((i) => UV.getElement(i, [])),
      lo = [0, 1].map((j) => Math.min(...uvs.map((uv) => uv[j]))),
      hi = [0, 1].map((j) => Math.max(...uvs.map((uv) => uv[j]))),
      span = Math.max(hi[0] - lo[0], hi[1] - lo[1]) * 1024;
    assert(span > 0.05 && span <= 1, 'Source patch lies inside one texel');
    const k = TILE_UV_SPAN / span;
    verts.forEach((i, n) => {
      const moved = [0, 1].map((j) => (to[j] + 0.5) / 1024 + (uvs[n][j] - (lo[j] + hi[j]) / 2) * k);
      assert.deepEqual(texelOf(moved), [...to], 'The patch lands whole inside its new texel');
      UV.setElement(i, moved);
    });
  };
  const weighted = TILE_PALETTE.flatMap((entry, i) => Array(entry.weight).fill(i));
  assert.equal(weighted.length, 20, 'Palette weights sum to 20');
  const roll = (key) =>
    weighted[createHash('sha256').update(`${TILE_SEED}:${key}`).digest().readUInt32BE(0) % 20];
  const counts = TILE_PALETTE.map(() => 0);
  let rerolled = 0;
  for (const [k, row] of [...courses].sort()) {
    row.sort((a, b) => a.x - b.x);
    let left = -1;
    row.forEach((t, i) => {
      let pick = roll(`${k}:${i}`);
      for (let n = 1; pick === left && n < 16; n++) {
        pick = roll(`${k}:${i}:${n}`);
        rerolled++;
      }
      assert.notEqual(pick, left, 'No tile repeats its left neighbour');
      left = pick;
      counts[pick]++;
      recentre(t.verts, TILE_PALETTE[pick].texel);
    });
  }
  // 3. Risers: vertical faces on the dark texel sharing an edge with a tile's
  // lower edge. Any that faces uphill (normal sign opposite its slope) is turned.
  const tileLower = new Set();
  for (const t of tiles)
    for (const v of t.positions)
      if (Math.abs(Math.abs(v[2]) - t.upper) > 0.01) tileLower.add(v.join(','));
  let risers = 0;
  const flipped = [],
    riserFaces = [];
  for (let f = 0; f < faceCount; f++) {
    const t = tri(f),
      raw = normalRaw(t),
      l = Math.hypot(...raw);
    if (l < 1e-14 || Math.abs(raw[2] / l) < 0.999) continue;
    if (Math.abs(t[0][2]) < 0.01) continue;
    if (!t.every((v) => Math.abs(v[2] - t[0][2]) < 1e-7)) continue;
    if (sourceTexel(UV.getElement(indices[f * 3], [])) !== 2) continue;
    if (t.filter((v) => tileLower.has(v.join(','))).length < 1) continue;
    risers++;
    riserFaces.push(f);
    if (Math.sign(raw[2]) === Math.sign(t[0][2])) continue;
    flipped.push(f);
  }
  assert.equal(risers, 2 * TILE_COUNT, 'Every tile has a two-face riser');
  // Every riser moves to the flat riser texel. Its vertices must be its own.
  const riserVertexUse = new Map();
  for (const f of riserFaces)
    for (let k = 0; k < 3; k++)
      riserVertexUse.set(indices[f * 3 + k], (riserVertexUse.get(indices[f * 3 + k]) ?? 0) + 1);
  for (const [i, n] of riserVertexUse)
    assert.equal(n, uses.get(i), 'Riser vertices are used by risers only');
  const riserGroups = new Map();
  for (const f of riserFaces) {
    const vs = [0, 1, 2].map((k) => indices[f * 3 + k]),
      key = [...riserGroups.keys()].find((g) => vs.some((i) => riserGroups.get(g).has(i)));
    const group = riserGroups.get(key) ?? new Set();
    for (const i of vs) group.add(i);
    riserGroups.set(key ?? f, group);
  }
  assert.equal(riserGroups.size, TILE_COUNT, 'One riser per tile');
  for (const group of riserGroups.values()) recentre([...group], RISER_TEXEL);
  assert.equal(flipped.length, TURNED_RISER_FACES, 'Exactly the -Z slope risers face uphill');
  const flippedVerts = new Set(flipped.flatMap((f) => [0, 1, 2].map((k) => indices[f * 3 + k])));
  const riserUse = new Map();
  for (const f of flipped)
    for (let k = 0; k < 3; k++)
      riserUse.set(indices[f * 3 + k], (riserUse.get(indices[f * 3 + k]) ?? 0) + 1);
  for (const i of flippedVerts)
    assert.equal(riserUse.get(i), uses.get(i), 'Turned riser vertices are the riser’s own');
  for (const f of flipped) {
    const a = indices[f * 3 + 1];
    indices[f * 3 + 1] = indices[f * 3 + 2];
    indices[f * 3 + 2] = a;
    const n = normalRaw(tri(f));
    assert(n[2] * tri(f)[0][2] > 0, 'Turned riser faces down the slope');
  }
  for (const i of flippedVerts) {
    const n = N.getElement(i, []);
    assert(n[2] * vtx(i)[2] < 0, 'Riser normal faced uphill before the turn');
    N.setElement(
      i,
      n.map((v) => -v)
    );
  }
  p.getIndices().setArray(indices);
  assert.deepEqual(bounds(p), beforeBounds, 'Tile step keeps exact bounds');
  return {
    scope:
      'Re-centres each crafted roof tile’s UV patch (span 0.2 px) on a seeded choice of six uniform, flat-normal roof texels within a 1.24x linear-luminance band (no repeat of the left neighbour), moves every tile riser to one flat texel a step darker, and turns the -Z slope tile risers outward; no position changes',
    seed: TILE_SEED,
    tiles: tiles.length,
    courses: courses.size,
    paletteCounts: Object.fromEntries(TILE_PALETTE.map((e, i) => [e.srgb, counts[i]])),
    rerolled,
    risers,
    turnedRiserFaces: flipped.length,
    trianglesAfter: faceCount,
    renderVertices: indices.length,
  };
}
// Chimney (asset loop, 2026-11-05, round 6). Patching the chimney failed for
// three judged rounds in a row, for two structural reasons. The provider
// shaft's UVs are Tripo bake islands scattered over the whole atlas, so its
// brick courses smear and skew and no re-projection can make them level. And
// each tile course is its own plane (rel 0.004 at its upper edge, 0.010 at its
// lip, then a 0.009 riser) while the round-2 plate was built at constant
// heights over the slab plane, so it stood proud at the top of a course and sank
// at the lip. So the method changes: the provider shaft and cap are deleted and
// the chimney is modelled. A mortar core carries brick courses of separate proud
// bricks, each on one flat texel, whose corner bricks turn the other way on
// alternate courses (level bed joints by construction, staggered perpends).
// Two corbel courses step out under a mitred coping round a flue. The lead is
// laid course by course on the measured tile planes: a soaker and a stepped
// upstand down each side, dropping over every riser; a front apron that folds
// over the downhill riser and ends in a dressed edge; a back gutter that stops
// against the riser of the course above. Every upstand top tucks into a joint.
export const CHIMNEY = Object.freeze({
  coreBottom: 0.14, // below the slab under the whole footprint
  course: 0.016,
  joint: 0.003,
  proud: 0.002, // brick face past its mortar plane
  bury: 0.001, // brick back inside the mortar plane
  stretcher: 0.04,
  corner: Object.freeze([0.04, 0.0185]), // corner brick leg and return
  corbel: Object.freeze([0.006, 0.01]), // brick face past the shaft wall
  coping: 0.013,
  oversail: 0.0165, // the provider cap's measured overhang
  copingChamfer: 0.003,
  flueInset: 0.029,
  flueDepth: 0.01,
  lead: 0.0015,
  lift: 0.0003, // lead underside above the tile face
  soaker: 0.016, // lead width on the tiles beside the shaft
  cover: 0.01, // upstand height above the tile at its uphill end, at least
  apronReach: 0.026, // apron length on the course below the riser
  dressed: 0.0012,
});
// Uniform atlas blocks with a flat normal-map patch, measured on the delivered
// textures: brick reds 138,34,25 (r4), 144,37,21 (r3) and 122,31,26 (r7);
// mortar 201,180,137 (r12); lead 142,130,118 (r2, roughness 136, against the
// old 59,52,42: the smoother 132,128,119 block at roughness 106 blew out to
// white under the sun on the back gutter at eye level); coping stone
// 143,129,118 (r10); flue soot is the glass texel.
export const CHIMNEY_TEXELS = Object.freeze({
  bricks: Object.freeze([
    Object.freeze({ texel: TEXEL(434, 678), weight: 10 }),
    Object.freeze({ texel: TEXEL(196, 860), weight: 6 }),
    Object.freeze({ texel: TEXEL(338, 170), weight: 4 }),
  ]),
  mortar: TEXEL(310, 756),
  lead: TEXEL(440, 370),
  coping: TEXEL(654, 164),
  flue: TEXEL(950, 856),
});
export const CHIMNEY_SEED = 'millos-farmhouse-chimney-bricks-v1';
export const CHIMNEY_DELETED_COUNT = 500;
export const CHIMNEY_DELETED_SHA256 =
  '6cf5a73edde3fb121d32ae5ac427f85230e11cbf07832453bbe63d5df4c3852d';

export function rebuildChimney(p, beforeBounds, slab) {
  const P = p.getAttribute('POSITION'),
    N = p.getAttribute('NORMAL'),
    UV = p.getAttribute('TEXCOORD_0'),
    oldIndices = p.getIndices().getArray(),
    faceCount = oldIndices.length / 3,
    C = CHIMNEY,
    { shaft, box } = APRON;
  assert.equal(faceCount, 4285, 'Chimney step runs on the tile-relaid body');
  const top = (z) => slab.ridgeY - slab.slope * Math.abs(z),
    vtx = (i) => P.getElement(i, []),
    tri = (f) => [0, 1, 2].map((k) => vtx(oldIndices[f * 3 + k])),
    mid = (t) => [0, 1, 2].map((j) => (t[0][j] + t[1][j] + t[2][j]) / 3),
    texelKey = (f) =>
      UV.getElement(oldIndices[f * 3], [])
        .map((v) => Math.floor(v * 1024))
        .join(','),
    inBox = (c) => c[0] > box.x0 && c[0] < box.x1 && c[2] > box.z0 && c[2] < box.z1,
    tileKeys = new Set(TILE_PALETTE.map((e) => e.texel.join(',')));
  // 1. The provider shaft and cap: every face in the chimney box reaching above
  // the tile lips (tiles stand at most 0.010 above the slab plane).
  const deleted = [];
  for (let f = 0; f < faceCount; f++) {
    const t = tri(f);
    if (!inBox(mid(t)) || Math.max(...t.map((v) => v[1] - top(v[2]))) <= 0.0125) continue;
    assert(!tileKeys.has(texelKey(f)) && texelKey(f) !== RISER_TEXEL.join(','), 'No tile deleted');
    deleted.push(f);
  }
  assert.equal(deleted.length, CHIMNEY_DELETED_COUNT, 'Exact reviewed chimney scope');
  assert.equal(hash(deleted.join(',')), CHIMNEY_DELETED_SHA256, 'Exact reviewed chimney faces');
  // 2. The tile courses on the -Z slope across the chimney, measured. s = -z
  // runs down the slope; each course is a plane from (su, yu) to its lip (sl, yl).
  const courseBy = new Map();
  for (let f = 0; f < faceCount; f++) {
    if (!tileKeys.has(texelKey(f))) continue;
    const t = tri(f),
      c = mid(t);
    if (c[2] >= 0 || c[0] < shaft.x0 - 0.06 || c[0] > shaft.x1 + 0.06) continue;
    const ss = t.map((v) => -v[2]),
      su = Math.min(...ss),
      sl = Math.max(...ss),
      yu = t[ss.indexOf(su)][1],
      yl = t[ss.indexOf(sl)][1],
      key = su.toFixed(4),
      known = courseBy.get(key);
    if (known)
      assert(
        Math.abs(known.sl - sl) < 1e-6 && Math.abs(known.yu - yu) < 1e-6,
        'One plane per course'
      );
    else courseBy.set(key, { su, sl, yu, yl });
  }
  const courses = [...courseBy.values()].sort((a, b) => a.su - b.su);
  for (const k of courses) assert(k.sl - k.su > 0.04 && k.yu > k.yl, 'A tile course');
  const tileY = (k, s) => {
      const c = courses[k];
      return c.yu + ((s - c.su) * (c.yl - c.yu)) / (c.sl - c.su);
    },
    courseAt = (s) => courses.findLastIndex((c) => c.su <= s + 0.001);
  // 3. Shaft, courses and joints. The coping's top takes the old cap's height,
  // which is the asset's maximum height.
  const X0 = shaft.x0,
    X1 = shaft.x1,
    Z0 = shaft.z0,
    Z1 = shaft.z1,
    pr = C.proud,
    J = C.joint,
    maxY = beforeBounds.max[1],
    copingBottom = maxY - C.coping,
    bodyTop = copingBottom - 2 * C.course,
    jointAbove = (y) => {
      const m = Math.floor((bodyTop + J / 2 - y) / C.course);
      assert(m >= 1, 'Flashing tucks into a joint of the body');
      return bodyTop - m * C.course + J / 2;
    };
  const added = [];
  const loft = (name, uv, rings, caps = [true, true]) => {
    const faces = [];
    for (let r = 0; r + 1 < rings.length; r++)
      for (let i = 0; i < rings[r].length; i++) {
        const j = (i + 1) % rings[r].length;
        faces.push(
          [rings[r][i], rings[r][j], rings[r + 1][j]],
          [rings[r][i], rings[r + 1][j], rings[r + 1][i]]
        );
      }
    for (const [use, r] of [
      [caps[0], rings[0]],
      [caps[1], rings[rings.length - 1]],
    ])
      if (use) for (let i = 1; i + 1 < r.length; i++) faces.push([r[0], r[i], r[i + 1]]);
    const all = rings.flat(),
      centre = [0, 1, 2].map((j) => all.reduce((s, v) => s + v[j], 0) / all.length);
    for (const face of faces) {
      if (Math.hypot(...normalRaw(face)) < 1e-14) continue;
      let n = normal(face);
      const d = mid(face).map((v, j) => v - centre[j]);
      if (dot(n, d) < 0) {
        face.reverse();
        n = normal(face);
      }
      assert(dot(n, d) > 0, `${name}: outward face`);
      added.push({ name, face, normal: n, uv });
    }
  };
  // An axis-aligned brick; `open` names a buried face that is never seen.
  const cuboid = (name, uv, [x0, x1], [y0, y1], [z0, z1], open = null) => {
    assert(x1 > x0 && y1 > y0 && z1 > z0, `${name}: positive extent`);
    const v = (i, j, k) => [[x0, x1][i], [y0, y1][j], [z0, z1][k]];
    for (const [key, quad, axis, sign] of [
      ['-x', [v(0, 0, 0), v(0, 0, 1), v(0, 1, 1), v(0, 1, 0)], 0, -1],
      ['+x', [v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)], 0, 1],
      ['-y', [v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)], 1, -1],
      ['+y', [v(0, 1, 0), v(0, 1, 1), v(1, 1, 1), v(1, 1, 0)], 1, 1],
      ['-z', [v(0, 0, 0), v(0, 1, 0), v(1, 1, 0), v(1, 0, 0)], 2, -1],
      ['+z', [v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)], 2, 1],
    ]) {
      if (key === open) continue;
      for (const face of [
        [quad[0], quad[1], quad[2]],
        [quad[0], quad[2], quad[3]],
      ]) {
        const n = normal(face);
        assert(n[axis] * sign > 0.999, `${name}: ${key} faces out`);
        added.push({ name, face, normal: n, uv });
      }
    }
  };
  // 4. Lead, laid on the tile planes. A convex (s, y) profile carried across x.
  const t = C.lead,
    W = C.soaker,
    at = (x, s, y) => [x, y, -s],
    lead = (name, poly, xa, xb) =>
      loft(name, CHIMNEY_TEXELS.lead, [
        poly.map(([s, y]) => at(xa, s, y)),
        poly.map(([s, y]) => at(xb, s, y)),
      ]),
    under = (k, s) => tileY(k, s) + C.lift,
    sheet = (k, sa, sb) => [
      [sa, under(k, sa)],
      [sb, under(k, sb)],
      [sb, under(k, sb) + t],
      [sa, under(k, sa) + t],
    ],
    upstand = (k, sa, sb, h, from = sa) => {
      assert(h > under(k, from) + t + C.cover - 1e-9, 'Upstand clears the tiles');
      return [
        [sa, under(k, sa)],
        [sb, under(k, sb)],
        [sb, h],
        [sa, h],
      ];
    };
  const backS = -Z1 - pr,
    frontS = -Z0 + pr,
    kb = courseAt(backS),
    kf = courseAt(frontS);
  assert(kb >= 1 && kf > kb && kf + 1 < courses.length, 'Shaft crosses whole courses');
  assert(courses[kb].su < backS - 0.02 && courses[kf].sl > frontS + 0.002, 'Lead stays on courses');
  // Pieces that meet overlap by `lap` rather than sharing a face, so no edge
  // is shared by four faces and the lead stays one visual sheet.
  const lap = 0.0002,
    dropAt = (k) => courses[k].sl + lap,
    legStart = (k) => (k === kb ? backS - lap : dropAt(k - 1) + lap),
    legEnd = (k) => (k === kf ? frontS + lap : dropAt(k) + t / 2),
    sideX = [
      [X0 - pr - W, X0 - pr + 0.0003],
      [X1 + pr - 0.0003, X1 + pr + W],
    ],
    standX = [
      [X0 - pr - t, X0 - pr + 0.0003],
      [X1 + pr - 0.0003, X1 + pr + t],
    ],
    steps = [];
  for (let k = kb; k <= kf; k++) {
    const c = courses[k],
      sb = k === kf ? frontS + t : legEnd(k);
    // The upstand steps down one brick course wherever the tile below has
    // fallen far enough for the next joint down to clear it; a sliver merges.
    for (let sa = k === kb ? backS - t : legStart(k); sa < sb - 1e-9; ) {
      const h = jointAbove(under(k, sa) + t + C.cover),
        fit = h - C.course - t - C.cover - C.lift,
        next = c.su + ((fit - c.yu) * (c.sl - c.su)) / (c.yl - c.yu),
        to = next > sb - 0.004 ? sb : next;
      assert(to > sa, 'Each step moves down the slope');
      steps.push({ k, sa, sb: to, h });
      const from = sa === backS - t ? sa + lap : sa === legStart(k) ? sa : sa - lap,
        until = k === kf && to === sb ? to - lap : to;
      for (const side of [0, 1])
        lead(`flashing-step-${side}`, upstand(k, from, until, h, sa), ...standX[side]);
      sa = to;
    }
    for (const side of [0, 1]) {
      lead(`flashing-soaker-${side}`, sheet(k, legStart(k), legEnd(k)), ...sideX[side]);
      if (k < kf) {
        const d = dropAt(k);
        lead(
          `flashing-drop-${side}`,
          [
            [d, under(k + 1, d)],
            [d + t, under(k + 1, d + t)],
            [d + t, under(k, courses[k].sl) + t],
            [d, under(k, courses[k].sl) + t],
          ],
          ...sideX[side]
        );
      }
    }
  }
  // Front apron: an upstand wrapping both corners, the sheet to the lip, a
  // drop over the riser, and a sheet on the course below with a dressed edge.
  const wide = [X0 - pr - W, X1 + pr + W],
    wrap = [X0 - pr - t - lap, X1 + pr + t + lap],
    frontH = jointAbove(under(kf, frontS - 0.0003) + t + C.cover),
    backH = jointAbove(under(kb, backS - t) + t + C.cover);
  lead('flashing-apron-upstand', upstand(kf, frontS - 0.0003, frontS + t, frontH), ...wrap);
  lead('flashing-apron', sheet(kf, frontS, dropAt(kf) + t / 2), ...wide);
  const d = dropAt(kf),
    end = d + C.apronReach,
    k1 = kf + 1;
  assert(end < courses[k1].sl - 0.003, 'Apron ends on the course below');
  lead(
    'flashing-apron-drop',
    [
      [d, under(k1, d)],
      [d + t, under(k1, d + t)],
      [d + t, under(kf, courses[kf].sl) + t],
      [d, under(kf, courses[kf].sl) + t],
    ],
    ...wide
  );
  lead(
    'flashing-apron-dressed',
    [
      [d + lap, under(k1, d + lap)],
      [end, under(k1, end)],
      [end, under(k1, end) + t * 0.35],
      [end - C.dressed, under(k1, end - C.dressed) + t],
      [d + lap, under(k1, d + lap) + t],
    ],
    ...wide
  );
  // Back gutter: from against the riser of the course above down to the shaft.
  const gutterStart = courses[kb].su - 0.0004;
  assert(gutterStart > courses[kb - 1].sl, 'Gutter ends below the riser above');
  lead('flashing-gutter', sheet(kb, gutterStart, backS), ...wide);
  lead('flashing-gutter-upstand', upstand(kb, backS - t, backS + 0.0003, backH), ...wrap);
  const flashingFaces = added.length;
  // Hidden behind the lead: a brick whose top is at or below every upstand
  // over its length on each face it shows on.
  const cover = (faceName, s) => {
    if (faceName === 'z0') return frontH;
    if (faceName === 'z1') return backH;
    const step = steps.find((q) => s >= q.sa - 1e-9 && s <= q.sb + 1e-9);
    return step ? step.h : -Infinity;
  };
  const hidden = (faceName, a, b, yt) => {
    for (let u = a; ; u = Math.min(b, u + 0.002)) {
      const s = faceName === 'x0' || faceName === 'x1' ? -u : null;
      if (yt > cover(faceName, s) + 1e-9) return false;
      if (u >= b) return true;
    }
  };
  // 5. Mortar core, corbel bands and bricks.
  loft(
    'chimney-core',
    CHIMNEY_TEXELS.mortar,
    [C.coreBottom, bodyTop + 0.0005].map((y) => [
      [X0, y, Z0],
      [X1, y, Z0],
      [X1, y, Z1],
      [X0, y, Z1],
    ]),
    [false, false]
  );
  for (const [i, out] of C.corbel.entries()) {
    const m = out - pr;
    cuboid(
      `chimney-corbel-band-${i}`,
      CHIMNEY_TEXELS.mortar,
      [X0 - m, X1 + m],
      [bodyTop + i * C.course, bodyTop + (i + 1) * C.course + 0.0005],
      [Z0 - m, Z1 + m],
      '+y'
    );
  }
  const weighted = CHIMNEY_TEXELS.bricks.flatMap((b, i) => Array(b.weight).fill(i));
  assert.equal(weighted.length, 20, 'Brick weights sum to 20');
  const brickUV = (key) =>
      CHIMNEY_TEXELS.bricks[
        weighted[
          createHash('sha256').update(`${CHIMNEY_SEED}:${key}`).digest().readUInt32BE(0) % 20
        ]
      ].texel,
    [Lc, Rc] = C.corner;
  let bricks = 0,
    covered = 0;
  const course = (key, y0, y1, out, parity) => {
    const m = out - pr,
      ox = [X0 - out, X1 + out],
      oz = [Z0 - out, Z1 + out],
      ix = [X0 - m + C.bury, X1 + m - C.bury],
      iz = [Z0 - m + C.bury, Z1 + m - C.bury],
      ex = parity ? Rc : Lc,
      ez = parity ? Lc : Rc,
      lay = (name, faces, xs, zs, open) => {
        if (faces.every(([f, a, b]) => hidden(f, a, b, y1))) {
          covered++;
          return;
        }
        bricks++;
        cuboid(`chimney-brick`, brickUV(`${key}:${name}`), xs, [y0, y1], zs, open);
      },
      run = (a, b) => {
        const len = b - a,
          n = Math.max(1, Math.round((len + J) / (C.stretcher + J))),
          l = (len - (n - 1) * J) / n;
        assert(l > 0.012, 'A whole brick');
        return Array.from({ length: n }, (_, i) => [a + i * (l + J), a + i * (l + J) + l]);
      };
    for (const [cx, cz] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]) {
      const xs = cx ? [ox[1] - ex, ox[1]] : [ox[0], ox[0] + ex],
        zs = cz ? [oz[1] - ez, oz[1]] : [oz[0], oz[0] + ez];
      lay(
        `corner${cx}${cz}`,
        [
          [`z${cz}`, ...xs],
          [`x${cx}`, ...zs],
        ],
        xs,
        zs,
        null
      );
    }
    for (const [i, [a, b]] of run(ox[0] + ex + J, ox[1] - ex - J).entries()) {
      lay(`z0-${i}`, [['z0', a, b]], [a, b], [oz[0], iz[0]], '+z');
      lay(`z1-${i}`, [['z1', a, b]], [a, b], [iz[1], oz[1]], '-z');
    }
    for (const [i, [a, b]] of run(oz[0] + ez + J, oz[1] - ez - J).entries()) {
      lay(`x0-${i}`, [['x0', a, b]], [ox[0], ix[0]], [a, b], '+x');
      lay(`x1-${i}`, [['x1', a, b]], [ix[1], ox[1]], [a, b], '-x');
    }
  };
  let bodyCourses = 0;
  for (let n = 0; bodyTop - n * C.course > tileY(kf, frontS); n++) {
    bodyCourses++;
    course(`body${n}`, bodyTop - (n + 1) * C.course + J, bodyTop - n * C.course, pr, n % 2);
  }
  assert(bodyTop - bodyCourses * C.course < tileY(kf, frontS), 'Courses reach below the roof');
  for (const [i, out] of C.corbel.entries())
    course(
      `corbel${i}`,
      bodyTop + i * C.course + J,
      bodyTop + (i + 1) * C.course,
      out,
      (i + 1) % 2
    );
  // 6. Coping: one closed ring round the flue (outer wall, chamfer, top, flue
  // wall, underside), so no faces meet at a mitre; a soot floor down the flue.
  const ov = C.oversail,
    fi = C.flueInset,
    ch = C.copingChamfer,
    cx = (X0 + X1) / 2,
    cz = (Z0 + Z1) / 2,
    rect = (x0, x1, z0, z1, y) => [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ],
    I = [X0 + fi, X1 - fi, Z0 + fi, Z1 - fi],
    copingRings = [
      rect(X0 - ov, X1 + ov, Z0 - ov, Z1 + ov, copingBottom),
      rect(X0 - ov, X1 + ov, Z0 - ov, Z1 + ov, maxY - ch),
      rect(X0 - ov + ch, X1 + ov - ch, Z0 - ov + ch, Z1 + ov - ch, maxY),
      rect(...I, maxY),
      rect(...I, copingBottom),
    ];
  for (let r = 0; r < copingRings.length; r++) {
    const a = copingRings[r],
      b = copingRings[(r + 1) % copingRings.length];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      for (const face of [
        [a[i], a[j], b[j]],
        [a[i], b[j], b[i]],
      ]) {
        const c = mid(face),
          radial = [c[0] - cx, 0, c[2] - cz],
          want = [
            radial,
            [radial[0], Math.hypot(...radial), radial[2]],
            [0, 1, 0],
            radial.map((v) => -v),
            [0, -1, 0],
          ][r];
        let n = normal(face);
        if (dot(n, want) < 0) {
          face.reverse();
          n = normal(face);
        }
        assert(dot(n, want) > 0, 'chimney-coping: outward face');
        added.push({ name: 'chimney-coping', face, normal: n, uv: CHIMNEY_TEXELS.coping });
      }
    }
  }
  cuboid(
    'chimney-flue',
    CHIMNEY_TEXELS.flue,
    [I[0] + 0.0002, I[1] - 0.0002],
    [maxY - C.flueDepth - 0.002, maxY - C.flueDepth],
    [I[2] + 0.0002, I[3] - 0.0002]
  );
  // 7. Rebuild: kept faces compacted, then the new parts, welded per part.
  const drop = new Set(deleted),
    remap = new Map(),
    keptIndices = [];
  for (let f = 0; f < faceCount; f++) {
    if (drop.has(f)) continue;
    for (let k = 0; k < 3; k++) {
      const i = oldIndices[f * 3 + k];
      if (!remap.has(i)) remap.set(i, remap.size);
      keptIndices.push(remap.get(i));
    }
  }
  const kept = remap.size,
    corners = [],
    cornerOf = new Map(),
    addedIndices = [];
  for (const a of added)
    for (let k = 0; k < 3; k++) {
      const key = [...a.face[k], ...a.normal.map((v) => v.toFixed(6)), ...a.uv].join(',');
      if (!cornerOf.has(key)) {
        cornerOf.set(key, kept + corners.length);
        corners.push({ position: a.face[k], normal: a.normal, uv: a.uv });
      }
      addedIndices.push(cornerOf.get(key));
    }
  const total = kept + corners.length,
    build = (attr, field) => {
      const size = attr.getElementSize(),
        arr = new (attr.getArray().constructor)(total * size);
      for (const [from, to] of remap) arr.set(attr.getElement(from, []), to * size);
      corners.forEach((c, i) => arr.set(c[field], (kept + i) * size));
      attr.setArray(arr);
    };
  build(P, 'position');
  build(N, 'normal');
  build(UV, 'uv');
  const indices = new oldIndices.constructor(keptIndices.length + addedIndices.length);
  indices.set(keptIndices);
  indices.set(addedIndices, keptIndices.length);
  p.getIndices().setArray(indices);
  assert.deepEqual(bounds(p), beforeBounds, 'Chimney step keeps exact bounds');
  assert(indices.length <= 25200);
  const parts = {};
  for (const a of added) parts[a.name] = (parts[a.name] ?? 0) + 1;
  return {
    scope:
      'Deletes the provider chimney shaft and cap and models the chimney: mortar core, proud brick courses with alternating corner bricks on flat brick texels, two corbel courses, a mitred chamfered coping round a flue whose top keeps the asset maximum height, and lead laid course by course on the measured tile planes (soakers and stepped upstands down both sides with drops over each riser, a front apron folded over the downhill riser with a dressed edge, a back gutter ending at the riser above)',
    deletedFaces: deleted.length,
    deletedFacesSHA256: hash(deleted.join(',')),
    tileCourses: courses.slice(kb - 1, kf + 2).map((c) => ({ su: c.su, sl: c.sl })),
    steps: steps.map((q) => ({ course: q.k, from: q.sa, to: q.sb, top: q.h })),
    frontUpstandTop: frontH,
    backUpstandTop: backH,
    bodyCourses,
    bricks,
    bricksHiddenByLead: covered,
    flashingFaces,
    addedFaces: added.length,
    addedParts: parts,
    trianglesAfter: indices.length / 3,
    verticesAfter: total,
    renderVertices: indices.length,
  };
}
const normalRaw = (pts) => {
  const a = pts[1].map((v, k) => v - pts[0][k]),
    b = pts[2].map((v, k) => v - pts[0][k]);
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
};
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
  // The manifest's maxFileBytes for farm-farmhouse (the round-6 chimney needs
  // more than the old 437000 guard).
  assert(out.length <= 540000, 'Farmhouse manifest byte budget');
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
