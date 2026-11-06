/** Output-only architectural coop derivative. No runtime writes.
 *
 * Builds the farm henhouse (farm-coop). Every triangle is authored here; the
 * pinned parent is read only for its node frame, envelope, atlas images and
 * the two soffit planes of its roof slab. Below the roof: a board floor on
 * joists, legs, sills, lapped weatherboard walls and gables, a louvred vent,
 * a round-headed hen pop-hole whose limewashed frame is one solid lofted from
 * the opening at the back to a splayed mouth at the face, over a dark-lined
 * passage and under a rain hood, its ledged and braced leaf swung flat
 * against the wall on modelled pintle hinges, and a ramp of chamfered
 * stringers carried on a bevelled bearer at the floor end and a ground sill
 * at the foot. The roof is closed shells: the slab on the parent's soffit
 * planes, one profiled metal sheet per slope (its rib cross-section traced
 * once and lofted from ridge to eave), a rolled ridge cap, traced barge
 * boards and fascias, landing exactly on the parent's envelope extremes.
 *
 * Run: node scripts/craft-precise-coop.mjs <output.glb>
 * (writes <output.glb> and <output.glb>.json; refuses public/ and assets/).
 *
 * Working if the envelope matches the parent to 2e-7, every part is a closed
 * shell that overlaps its neighbours rather than sharing faces, and each roof
 * slope reads as one green ribbed sheet with no per-tile or patch variation,
 * the second slope's ribs half a pitch along so the slopes never mirror.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, getBounds, VERSION } from '@gltf-transform/core';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import sharp from 'sharp';

export const PARENT_PATH = 'assets/source/models/farm/coop-pre-precision.glb';
export const PARENT_SHA256 = 'e6e1f4ff7184cd865c77d3952bbadccde7c51189580dfb0aaee823d7007a63b7';
// The parent's roof occupied this triangle range; nothing is copied from it
// any more (the roof is authored), but the range is kept for callers.
export const ROOF_TRIANGLES = Object.freeze({ start: 5228, count: 716 });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const DEFAULT_OUTPUT = 'test-results/dm-farm-structure-20261027/coop-precision-candidate.glb';
// Platform-stable integer hash in [0, 1).
const hash01 = (...values) => {
  let h = 0x9e3779b9;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
};
const PATCH = { x: 0, y: 256, width: 152, height: 192 };
const METAL = { x: 96, y: 456, width: 48, height: 48 };
// Pop-hole swatch, in atlas space no other part samples: LIME is the
// limewashed splayed reveal round the opening, SHADE the dark lining of the
// passage into the house behind it.
const LIME = { x: 4, y: 452, width: 40, height: 56 },
  SHADE = { x: 52, y: 452, width: 36, height: 56 };
// Wood board strip inside PATCH: 12 painted boards of 16 px, sampled along the
// grain at one world density (118 px per 0.6 parent units) from a 142 px
// window that starts WOOD_U0 px into the strip.
const WOOD_ROWS = 12,
  WOOD_ROW_PX = 16,
  WOOD_U0 = 5,
  WOOD_ALONG_PX = 142,
  WOOD_DENSITY = 118 / 0.6;
// Each painted row's tone, evenly spread over +-5.5% and shuffled, so no two
// rows are near-duplicates and no row is an outlier. Rank < 4 is "dark".
const WOOD_RANK = Array.from({ length: WOOD_ROWS }, (_, r) => r).sort(
  (a, b) => hash01(a, 41) - hash01(b, 41)
);
const woodTone = (row) => 1 + (WOOD_RANK.indexOf(row) / (WOOD_ROWS - 1) - 0.5) * 0.11;
const woodDark = (row) => WOOD_RANK.indexOf(row) < 4;
// Row and mirror per course of one wall. Adjacent courses never share a row
// (nor do courses two apart), two dark rows never sit together, and alternate
// courses run the strip backwards, so the drift and knots of one painted row
// cannot stack into a smear across several planks.
const courseSequences = new Map();
function courseUV(wall, course) {
  if (!courseSequences.has(wall)) {
    let seed = 7;
    for (const ch of wall) seed = Math.imul(seed ^ ch.charCodeAt(0), 0x01000193);
    const rows = [];
    for (let c = 0; c < 16; c++)
      for (let attempt = 0; ; attempt++) {
        const r = Math.floor(hash01(seed, c, attempt) * WOOD_ROWS),
          prev = rows[c - 1],
          prev2 = rows[c - 2];
        if (r === prev || r === prev2 || (prev !== undefined && woodDark(r) && woodDark(prev)))
          continue;
        rows.push(r);
        break;
      }
    courseSequences.set(wall, { rows, flip: hash01(seed, 99) < 0.5 });
  }
  const { rows, flip } = courseSequences.get(wall);
  return {
    row: rows[course],
    mirror: (course % 2 === 1) !== flip,
    offset: hash01(rows[course], course, 3),
  };
}
// Authored roof atlas regions. Each slope island is painted over its whole
// region with clamped coordinates, so the 8 px gutter round every island
// carries the island's own border colour into the lower mips.
const ROOF_GUTTER = 8;
const SLOPE_REGIONS = Object.freeze([
  { x: 160, y: 0, width: 352, height: 256 },
  { x: 160, y: 256, width: 352, height: 256 },
]);
const TRIM = { x: 0, y: 0, width: 152, height: 248 };
const TRIM_INSET = 16;
const ROOF_GREEN = [57, 113, 70],
  TRIM_GREEN = [44, 90, 57];
const smooth = (t) => t * t * (3 - 2 * t);
const valueNoise = (x, y, seed) => {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = smooth(x - ix),
    fy = smooth(y - iy);
  const a = hash01(ix, iy, seed),
    b = hash01(ix + 1, iy, seed),
    c = hash01(ix, iy + 1, seed),
    d = hash01(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};
const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
const floorY = -0.28,
  backX = -0.446,
  frontX = 0.083,
  halfZ = 0.27;
const groundY = -0.4356144368648529,
  rampEndX = 0.49995583295822144;
const frame = (node) => ({
  name: node.getName(),
  translation: node.getTranslation(),
  rotation: node.getRotation(),
  scale: node.getScale(),
});
const vector = (p) => new THREE.Vector3(...p);

export async function deriveCoop(parentBytes) {
  assert.equal(hash(parentBytes), PARENT_SHA256, 'Exact accepted immutable coop parent required');
  const io = new NodeIO(),
    document = await io.readBinary(parentBytes),
    root = document.getRoot();
  assert.equal(root.listMeshes().length, 1);
  assert.equal(root.listNodes().length, 1);
  assert.equal(root.listMaterials().length, 1);
  assert.equal(root.listTextures().length, 3);
  const node = root.listNodes()[0],
    primitive = root.listMeshes()[0].listPrimitives()[0];
  assert.equal(node.getName(), 'CoopBody');
  assert.equal(root.listMeshes()[0].listPrimitives().length, 1);
  assert.deepEqual(primitive.listSemantics(), ['POSITION', 'NORMAL', 'TEXCOORD_0']);
  assert.equal(primitive.getIndices().getCount(), 6049 * 3);
  assert.equal(primitive.getAttribute('POSITION').getCount(), 7123);
  const beforeBounds = getBounds(root.listScenes()[0]),
    beforeFrame = frame(node);
  const old = Object.fromEntries(
    primitive.listSemantics().map((key) => [key, primitive.getAttribute(key)])
  );
  const arrays = { POSITION: [], NORMAL: [], TEXCOORD_0: [] },
    parts = [];
  const originalIndices = primitive.getIndices();
  // No parent triangle is copied. The parent is read only for its measured
  // soffit planes (two underside triangles of its roof slab), which every
  // gable course and corner post is cut to and which the runtime interior
  // sits under; the new roof slab reproduces exactly those planes.
  const soffit = [5230, 5472].map((id) =>
    [0, 1, 2].map((c) => old.POSITION.getElement(originalIndices.getScalar(id * 3 + c), []))
  );
  const roofPlanes = soffit.map((corners) => {
    const points = corners.map(vector);
    const normal = new THREE.Triangle(...points).getNormal(new THREE.Vector3());
    assert(normal.y < -0.7 && Math.abs(normal.x) < 1e-7);
    return { normal, constant: normal.dot(points[0]) };
  });
  // Soffit corners: [apex, eave, eave] at the two slab ends (x).
  const slabX = [soffit[1][0][0], soffit[0][0][0]],
    soffitApex = [soffit[0][0][2], soffit[0][0][1]],
    soffitEave = [
      [soffit[1][1][2], soffit[1][1][1]],
      [soffit[0][1][2], soffit[0][1][1]],
    ];
  assert(slabX[0] < -0.49 && slabX[1] > 0.12, 'Slab ends');
  assert(soffitEave[0][0] < -0.35 && soffitEave[1][0] > 0.35, 'Soffit eaves');
  const ceiling = (z) =>
    Math.min(...roofPlanes.map(({ normal: n, constant }) => (constant - n.z * z) / n.y));
  const uv = (point, normal, bounds, role = 'wood', seed = 0, course = null) => {
    const patch = role === 'metal' ? METAL : PATCH;
    if (role === 'metal')
      return [(patch.x + patch.width / 2) / 512, (patch.y + patch.height / 2) / 512];
    // Long grain follows each real timber's longest in-plane dimension.
    const spans = bounds.max.clone().sub(bounds.min).toArray();
    const axes = [0, 1, 2].filter((i) => Math.abs(normal.getComponent(i)) < 0.9);
    axes.sort((a, b) => spans[b] - spans[a]);
    const along = axes[0] ?? 0,
      across = axes[1] ?? 1;
    // Along the grain the texel density is the same in world units for every
    // part (a short front board and a long rear board show the same grain
    // scale), from a seeded window of the board strip. Across, each part fills
    // one painted board row edge to edge, so the row's dark cut lines sit on
    // the part's own edges. A wall course takes its row, direction and window
    // from courseUV, so neighbouring courses never repeat one painted board.
    const span = Math.max(spans[along], 1e-8),
      density = Math.min(WOOD_DENSITY, WOOD_ALONG_PX / span),
      pick = course ?? {
        row: Math.floor(hash01(seed, 7) * WOOD_ROWS),
        mirror: hash01(seed, 11) < 0.5,
        offset: hash01(seed, 3),
      },
      offset = pick.offset * (WOOD_ALONG_PX - span * density),
      row = pick.row,
      t = pick.mirror
        ? bounds.max.getComponent(along) - point.getComponent(along)
        : point.getComponent(along) - bounds.min.getComponent(along);
    const u = patch.x + WOOD_U0 + offset + t * density;
    const v =
      (point.getComponent(across) - bounds.min.getComponent(across)) /
      Math.max(spans[across], 1e-8);
    return [u / 512, (patch.y + row * WOOD_ROW_PX + 0.5 + v * (WOOD_ROW_PX - 1)) / 512];
  };
  // role 'authored' keeps the geometry's own atlas UVs. `matrix`, when given,
  // places the part AFTER its UVs are laid in its own frame (a swung door
  // leaf, a sloped ramp timber), so the grain follows the timber, not the
  // world axes.
  function add(name, geometry, role = 'wood', seed = parts.length, course = null, matrix = null) {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = plain.getAttribute('position'),
      n = plain.getAttribute('normal'),
      authored = role === 'authored' ? plain.getAttribute('uv') : null;
    assert(p && n && (role !== 'authored' || authored));
    plain.computeBoundingBox();
    const firstTriangle = arrays.POSITION.length / 9,
      normalMatrix = matrix ? new THREE.Matrix3().getNormalMatrix(matrix) : null,
      placed = new THREE.Box3();
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(p, i),
        normal = new THREE.Vector3().fromBufferAttribute(n, i);
      arrays.TEXCOORD_0.push(
        ...(authored
          ? [authored.getX(i), authored.getY(i)]
          : uv(point, normal, plain.boundingBox, role, seed, course))
      );
      if (matrix) {
        point.applyMatrix4(matrix);
        normal.applyMatrix3(normalMatrix).normalize();
      }
      placed.expandByPoint(point);
      arrays.POSITION.push(...point.toArray());
      arrays.NORMAL.push(...normal.toArray());
    }
    parts.push({
      name,
      firstTriangle,
      triangles: p.count / 3,
      bounds: { min: placed.min.toArray(), max: placed.max.toArray() },
    });
    if (plain !== geometry) plain.dispose();
    geometry.dispose();
  }
  function box(name, min, max, bevel = 0.002, role = 'wood', course = null) {
    const low = vector(min),
      high = vector(max),
      half = high.clone().sub(low).multiplyScalar(0.5),
      centre = high.clone().add(low).multiplyScalar(0.5);
    if (bevel === 0) {
      add(
        name,
        new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2).translate(...centre.toArray()),
        role,
        parts.length,
        course
      );
      return;
    }
    const r = Math.min(bevel, half.x * 0.3, half.y * 0.3, half.z * 0.3),
      points = [];
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          points.push(new THREE.Vector3(x * half.x, y * (half.y - r), z * (half.z - r)));
          points.push(new THREE.Vector3(x * (half.x - r), y * half.y, z * (half.z - r)));
          points.push(new THREE.Vector3(x * (half.x - r), y * (half.y - r), z * half.z));
        }
    add(
      name,
      new ConvexGeometry(points).translate(...centre.toArray()),
      role,
      parts.length,
      course
    );
  }
  // A closed prism: a simple polygon traced in the (z, y) plane and extruded
  // along X from x0 to x1, with real end caps, so each piece is watertight.
  // uvSide(edge, x, z, y) and uvCap(x, z, y) return atlas pixels; without
  // them the part is left for the bbox wood mapping.
  function prismX(profile, x0, x1, uvSide = null, uvCap = null) {
    let area = 0;
    for (let j = 0; j < profile.length; j++) {
      const [az, ay] = profile[j],
        [bz, by] = profile[(j + 1) % profile.length];
      area += az * by - bz * ay;
    }
    const ring = area > 0 ? profile : [...profile].reverse(),
      flip = area <= 0,
      positions = [],
      normals = [],
      uvs = [];
    const tri = (corners, normal, cornerUVs) => {
      const [a, b, c] = corners,
        g = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const order = g.dot(normal) >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const k of order) {
        positions.push(corners[k].x, corners[k].y, corners[k].z);
        normals.push(normal.x, normal.y, normal.z);
        if (cornerUVs) uvs.push(cornerUVs[k][0] / 512, cornerUVs[k][1] / 512);
      }
    };
    const at = (x, [z, y]) => new THREE.Vector3(x, y, z);
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j],
        b = ring[(j + 1) % ring.length],
        dz = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dz, dy),
        normal = new THREE.Vector3(0, -dz / length, dy / length);
      // Report the edge in the caller's own winding, so edge ids are stable.
      const edge = flip ? ring.length - 2 - j : j,
        corner = (x, q) =>
          uvSide ? uvSide((edge + ring.length) % ring.length, x, q[0], q[1]) : null;
      const quad = [at(x0, a), at(x0, b), at(x1, b), at(x1, a)],
        quadUV = uvSide ? [corner(x0, a), corner(x0, b), corner(x1, b), corner(x1, a)] : null;
      tri([quad[0], quad[1], quad[2]], normal, quadUV && [quadUV[0], quadUV[1], quadUV[2]]);
      tri([quad[0], quad[2], quad[3]], normal, quadUV && [quadUV[0], quadUV[2], quadUV[3]]);
    }
    const faces = THREE.ShapeUtils.triangulateShape(
      ring.map(([z, y]) => new THREE.Vector2(z, y)),
      []
    );
    for (const [x, sign] of [
      [x0, -1],
      [x1, 1],
    ])
      for (const face of faces) {
        const corners = face.map((k) => at(x, ring[k]));
        tri(
          corners,
          new THREE.Vector3(sign, 0, 0),
          uvCap ? face.map((k) => uvCap(x, ring[k][0], ring[k][1])) : null
        );
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (uvSide && uvCap) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
  }
  // A loft between two traced contours of the same topology: contour A (2D
  // points, embedded by toA) and contour B (embedded by toB), joined vertex
  // to vertex, with flat end caps. Orientation comes from contour A's Newell
  // normal against the A-to-B direction, so a contour may be given in either
  // winding. uvOf(point, normal, kind) returns atlas pixels for every corner;
  // kind is { edge } for a side face (edge i joins contour points i and i+1)
  // or { cap: 'a' | 'b' }.
  function loft(contourA, contourB, toA, toB, uvOf) {
    assert.equal(contourA.length, contourB.length, 'Loft contours must match');
    const count = contourA.length,
      A = contourA.map(toA),
      B = contourB.map(toB),
      centroid = (ring) =>
        ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(ring.length),
      along = centroid(B).sub(centroid(A)),
      newell = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const p = A[i],
        q = A[(i + 1) % count];
      newell.x += (p.y - q.y) * (p.z + q.z);
      newell.y += (p.z - q.z) * (p.x + q.x);
      newell.z += (p.x - q.x) * (p.y + q.y);
    }
    const reversed = newell.dot(along) < 0,
      order = Array.from({ length: count }, (_, i) => (reversed ? count - 1 - i : i)),
      positions = [],
      normals = [],
      uvs = [];
    const tri = (corners, kind, outward = null) => {
      const normal = new THREE.Vector3()
        .subVectors(corners[1], corners[0])
        .cross(new THREE.Vector3().subVectors(corners[2], corners[0]));
      if (outward && normal.dot(outward) < 0) {
        corners = [corners[0], corners[2], corners[1]];
        normal.negate();
      }
      normal.normalize();
      for (const c of corners) {
        positions.push(c.x, c.y, c.z);
        normals.push(normal.x, normal.y, normal.z);
        const [u, v] = uvOf(c, normal, kind);
        uvs.push(u / 512, v / 512);
      }
    };
    for (let j = 0; j < count; j++) {
      const i0 = order[j],
        i1 = order[(j + 1) % count],
        kind = { edge: reversed ? i1 : i0 };
      tri([A[i0], A[i1], B[i1]], kind);
      tri([A[i0], B[i1], B[i0]], kind);
    }
    for (const [contour, ring, cap, outward] of [
      [contourA, A, 'a', along.clone().negate()],
      [contourB, B, 'b', along],
    ])
      for (const face of THREE.ShapeUtils.triangulateShape(
        contour.map(([a, b]) => new THREE.Vector2(a, b)),
        []
      ))
        tri(
          face.map((k) => ring[k]),
          { cap },
          outward
        );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    return geometry;
  }
  // A convex timber defined by its cut planes (n . p <= d inside): every
  // saw cut, chamfer, plumb head and level foot is one plane, and the solid's
  // corners are the plane triples that satisfy all of them.
  function halfSpaceSolid(planes) {
    const points = [],
      seen = new Set();
    for (let i = 0; i < planes.length; i++)
      for (let j = i + 1; j < planes.length; j++)
        for (let k = j + 1; k < planes.length; k++) {
          const [a, b, c] = [planes[i], planes[j], planes[k]],
            bc = new THREE.Vector3().crossVectors(b.n, c.n),
            det = a.n.dot(bc);
          if (Math.abs(det) < 1e-10) continue;
          const p = bc
            .multiplyScalar(a.d)
            .add(new THREE.Vector3().crossVectors(c.n, a.n).multiplyScalar(b.d))
            .add(new THREE.Vector3().crossVectors(a.n, b.n).multiplyScalar(c.d))
            .divideScalar(det);
          if (planes.some((q) => q.n.dot(p) > q.d + 1e-9)) continue;
          const key = p
            .toArray()
            .map((v) => Math.round(v * 1e8))
            .join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          points.push(p);
        }
    assert(points.length >= 4, 'Empty half-space solid');
    return new ConvexGeometry(points);
  }
  const plane = (nx, ny, nz, d) => {
    const n = new THREE.Vector3(nx, ny, nz),
      length = n.length();
    return { n: n.divideScalar(length), d: d / length };
  };
  // Raised floor of separate boards on two joists, framed by sills, on four
  // real supports with grounded end faces. Parts that touch overlap by about
  // 0.5 mm instead of sharing a face or an edge.
  const sillBottom = floorY - 0.021;
  const floorBoards = 10,
    floorX0 = backX - 0.015,
    floorX1 = frontX + 0.015,
    floorGap = 0.0008;
  for (let i = 0; i < floorBoards; i++) {
    const x0 = floorX0 + ((floorX1 - floorX0) * i) / floorBoards,
      x1 = floorX0 + ((floorX1 - floorX0) * (i + 1)) / floorBoards;
    box(
      `floor-board-${i}`,
      [x0 + floorGap / 2, floorY - 0.018, -halfZ - 0.015],
      [x1 - floorGap / 2, floorY, halfZ + 0.015],
      0,
      'wood',
      courseUV('floor', i)
    );
  }
  // Joists are framed between the end sills (0.5 mm into each inner face),
  // so no joist end hangs out under the doorway beside the ramp.
  for (const z of [-0.13, 0.13])
    box(
      `floor-joist-${z}`,
      [backX + 0.0175, floorY - 0.034, z - 0.012],
      [frontX - 0.0175, floorY - 0.0175, z + 0.012],
      0
    );
  for (const x of [backX + 0.018, frontX - 0.018])
    for (const z of [-halfZ + 0.022, halfZ - 0.022])
      box(`leg-${x}-${z}`, [x - 0.019, groundY, z - 0.019], [x + 0.019, floorY + 0.017, z + 0.019]);
  for (const z of [-halfZ, halfZ])
    box(
      `long-sill-${z}`,
      [backX - 0.024, sillBottom, z - 0.017],
      [frontX + 0.026, floorY + 0.018, z + 0.017]
    );
  for (const x of [backX, frontX])
    box(
      `end-sill-${x}`,
      [x - 0.018, sillBottom + 0.0005, -halfZ - 0.0165],
      [x + 0.018, floorY + 0.0175, halfZ + 0.0165]
    );
  // Lapped weatherboard. The inner face stays on the wall's inner plane (the
  // runtime section reads these room planes); the outer face leans from
  // OUT_TOP proud at the top edge to OUT_BOTTOM at the lower lip, which drops
  // LAP over the top of the course below, so every course casts a real shadow
  // line. The inner bottom edge sits SLIT above the course below, so no two
  // courses share an edge or an inner face. `bottom`/`top` are the course's
  // [start, end] along the wall at y0 and y1.
  const IN = 0.006,
    OUT_TOP = 0.004,
    OUT_BOTTOM = 0.011,
    LAP = 0.004,
    SLIT = 0.0005,
    CHAMFER = 0.002;
  function weatherboard(name, axis, plane, sign, y0, y1, bottom, top, lap = true, course = null) {
    const at = (d, y, h) =>
      axis === 'x'
        ? new THREE.Vector3(plane + sign * d, y, h)
        : new THREE.Vector3(h, y, plane + sign * d);
    const points = [];
    // The lower lip's outer arris carries a CHAMFER-wide drip chamfer.
    const lip = lap ? y0 - LAP : y0;
    for (const h of bottom) {
      points.push(at(-IN, lap ? y0 + SLIT : y0, h));
      points.push(at(OUT_BOTTOM - CHAMFER, lip, h));
      points.push(at(OUT_BOTTOM, lip + CHAMFER, h));
    }
    for (const h of top) {
      points.push(at(-IN, y1, h));
      points.push(at(OUT_TOP, y1, h));
    }
    add(name, new ConvexGeometry(points), 'wood', parts.length, course);
  }
  // A hen pop-hole, not a person's door. The opening is traced in front
  // elevation as one round-headed outline (about 0.33 m wide and 0.35 m clear
  // above the threshold, under a third of the 1.75 m capsule) and extruded
  // through the wall, so the frame is a single lofted ring rather than a stack
  // of guide and head boxes. Nothing of the frame rises above the third course.
  const boardCount = 9,
    eaveY = ceiling(halfZ) - 0.001,
    rowY = (row) => floorY + ((eaveY - floorY) * row) / boardCount,
    holeRows = 3,
    doorTop = rowY(holeRows);
  assert(doorTop > floorY + 0.12 && doorTop < floorY + 0.18, `Pop-hole height ${doorTop - floorY}`);
  // The opening is about 0.39 m wide by 0.37 m clear; its splayed mouth at
  // the face is about 0.49 m wide and still stops at the third course's top.
  const holeW = 0.065,
    holeBottom = floorY + 0.018,
    holeTop = doorTop - 0.016,
    springY = holeTop - holeW,
    cutHalf = holeW + 0.012,
    SPLAY = 0.016,
    mouthHalf = holeW + SPLAY,
    archOuter = mouthHalf + 0.012,
    archTop = springY + archOuter,
    frameBack = frontX + 0.002,
    frameFace = frontX + 0.02;
  assert(springY + mouthHalf <= doorTop + 1e-9, 'Pop-hole mouth must stay inside three courses');
  assert(springY > holeBottom + 0.04, 'Pop-hole needs straight jambs below the arch');
  for (let row = 0; row < boardCount; row++) {
    const y0 = rowY(row),
      y1 = rowY(row + 1),
      lap = row > 0;
    for (const side of [-1, 1])
      weatherboard(
        `side-board-${side}-${row}`,
        'z',
        side * halfZ,
        side,
        y0,
        y1,
        [backX, frontX],
        [backX, frontX],
        lap,
        courseUV(`side${side}`, row)
      );
    weatherboard(
      `rear-board-${row}`,
      'x',
      backX,
      -1,
      y0,
      y1,
      [-halfZ, halfZ],
      [-halfZ, halfZ],
      lap,
      courseUV('rear', row)
    );
    if (row < holeRows)
      for (const side of [-1, 1]) {
        const span = side < 0 ? [-halfZ, -cutHalf] : [cutHalf, halfZ];
        weatherboard(
          `front-board-${side}-${row}`,
          'x',
          frontX,
          1,
          y0,
          y1,
          span,
          span,
          lap,
          courseUV('front', row)
        );
      }
    else
      weatherboard(
        `front-board-${row}`,
        'x',
        frontX,
        1,
        y0,
        y1,
        [-halfZ, halfZ],
        [-halfZ, halfZ],
        lap,
        courseUV('front', row)
      );
  }
  // Lapped trapezoid courses close each gable below its real slab; the front
  // gable keeps its small open vent, with the courses split round it. Gable
  // courses continue their wall's course sequence (courses 9-15).
  const peak = ceiling(0) - 0.001,
    gableHalf = (y) => (halfZ * (peak - y)) / (peak - eaveY),
    ventLow = 0.235,
    ventHigh = 0.325,
    ventHalf = 0.045;
  for (const [x, sign] of [
    [backX, -1],
    [frontX, 1],
  ])
    for (let row = 0; row < 7; row++) {
      const y0 = eaveY + ((peak - eaveY) * row) / 7,
        y1 = eaveY + ((peak - eaveY) * (row + 1)) / 7,
        z0 = gableHalf(y0),
        z1 = gableHalf(y1),
        course = courseUV(x === frontX ? 'front' : 'rear', boardCount + row);
      if (x === frontX && y0 < ventHigh && y1 > ventLow) {
        const a = Math.max(y0, ventLow),
          b = Math.min(y1, ventHigh),
          filler = ventHalf + 0.0005;
        for (const side of [-1, 1])
          weatherboard(
            `gable-${x}-${row}-${side}`,
            'x',
            x,
            sign,
            y0,
            y1,
            [side * ventHalf, side * z0],
            [side * ventHalf, side * z1],
            true,
            course
          );
        if (y0 < a)
          weatherboard(
            `gable-${x}-${row}-below-vent`,
            'x',
            x,
            sign,
            y0,
            a,
            [-filler, filler],
            [-filler, filler],
            true,
            course
          );
        if (b < y1)
          weatherboard(
            `gable-${x}-${row}-above-vent`,
            'x',
            x,
            sign,
            b,
            y1,
            [-filler, filler],
            [-filler, filler],
            false,
            course
          );
      } else
        weatherboard(`gable-${x}-${row}`, 'x', x, sign, y0, y1, [-z0, z0], [-z1, z1], true, course);
    }
  for (const x of [backX, frontX])
    for (const z of [-halfZ, halfZ])
      box(
        `corner-post-${x}-${z}`,
        [x - 0.015, floorY - 0.002, z - 0.014],
        [x + 0.015, ceiling(halfZ + 0.014) - 0.0003, z + 0.014],
        0.002
      );
  // A U traced round the opening: outer sides and head, the round-headed
  // opening inside, open at the foot where it stands on the threshold.
  function archU(outerHalf, top, innerHalf, bottom) {
    const shape = new THREE.Shape();
    shape.moveTo(-outerHalf, bottom);
    shape.lineTo(-innerHalf, bottom);
    shape.lineTo(-innerHalf, springY);
    shape.absarc(0, springY, innerHalf, Math.PI, 0, true);
    shape.lineTo(innerHalf, bottom);
    shape.lineTo(outerHalf, bottom);
    shape.lineTo(outerHalf, top);
    shape.lineTo(-outerHalf, top);
    return shape;
  }
  // The round-headed outline as a polygon in world (z, y), arc sampled.
  const archOutline = (half, bottom, segments = 12) => {
    const points = [
      [-half, bottom],
      [half, bottom],
    ];
    for (let i = 0; i <= segments; i++) {
      const a = (Math.PI * i) / segments;
      points.push([half * Math.cos(a), springY + half * Math.sin(a)]);
    }
    return points;
  };
  // Sutherland-Hodgman against one z line: keep z >= at (above) or z <= at.
  const clipZ = (polygon, at, above) => {
    const inside = ([z]) => (above ? z >= at : z <= at),
      out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      if (inside(a)) out.push(a);
      if (inside(a) !== inside(b)) {
        const t = (at - a[0]) / (b[0] - a[0]);
        out.push([at, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  const boxGeometry = (min, max) =>
    new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]).translate(
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    );
  // The threshold runs the full depth of the reveal, inside and out, and sits
  // between the ramp's side boards.
  const thresholdHalf = cutHalf + 0.002,
    revealBack = frontX - 0.04;
  box(
    'door-threshold',
    [revealBack - 0.0005, floorY - 0.0005, -thresholdHalf],
    [frontX + 0.035, holeBottom, thresholdHalf],
    0.0015
  );
  // Planar atlas mapping of a pop-hole part from its front elevation (z, y)
  // into one swatch, so the paint does not depend on the part's own bbox.
  const elevationUV = (swatch) => (point) => [
    swatch.x + 3 + ((point.z + 0.11) / 0.22) * (swatch.width - 6),
    swatch.y + 3 + ((point.y - holeBottom + 0.01) / 0.2) * (swatch.height - 6),
  ];
  // The passage: a lining about 13 cm deep, from just behind the splayed
  // frame back through the wall and into the house, painted dark (it is in
  // shade in life), so the opening reads as an opening and not as more wall.
  {
    const lining = archU(cutHalf + 0.0005, doorTop + 0.0005, holeW, holeBottom - 0.0005),
      geometry = new THREE.ExtrudeGeometry(lining, {
        depth: frameBack + 0.002 - revealBack,
        bevelEnabled: false,
        curveSegments: 16,
      })
        .rotateY(Math.PI / 2)
        .translate(revealBack, 0, 0),
      p = geometry.getAttribute('position'),
      uvs = [],
      shadeUV = elevationUV(SHADE);
    assert(!geometry.index, 'ExtrudeGeometry is non-indexed');
    for (let i = 0; i < p.count; i++) {
      const [u, v] = shadeUV(new THREE.Vector3().fromBufferAttribute(p, i));
      uvs.push(u / 512, v / 512);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    add('pop-hole-lining', geometry, 'authored');
  }
  // The frame is one lofted solid, not an extruded ring: a round-headed
  // outline traced twice in front elevation, the opening itself at the back
  // (frameBack) and a mouth SPLAY wider at the face (frameFace), joined vertex
  // to vertex. The splayed reveal faces out and up, so it takes the light, and
  // it is limewashed; the outer edge is square-shouldered, lapping the cut
  // board ends and the passage head. The outline is open at the foot, where
  // the frame stands on the threshold and the end sill.
  {
    const frameContour = (inner) => {
      const bottom = holeBottom - 0.0005,
        points = [
          [-archOuter, bottom],
          [-inner, bottom],
        ];
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI - (Math.PI * i) / 14;
        points.push([inner * Math.cos(a), springY + inner * Math.sin(a)]);
      }
      points.push(
        [inner, bottom],
        [archOuter, bottom],
        [archOuter, archTop],
        [-archOuter, archTop]
      );
      return points;
    };
    const limeUV = elevationUV(LIME);
    add(
      'pop-hole-splay-frame',
      loft(
        frameContour(holeW + 0.0008),
        frameContour(mouthHalf),
        ([z, y]) => new THREE.Vector3(frameBack, y, z),
        ([z, y]) => new THREE.Vector3(frameFace, y, z),
        (point) => limeUV(point)
      ),
      'authored'
    );
  }
  // A rain hood over the opening, carried on two traced brackets.
  const hoodWallTop = archTop + 0.034,
    hoodFrontTop = archTop + 0.02,
    hoodBack = frontX + 0.003,
    hoodReach = frontX + 0.06,
    hoodHalf = archOuter + 0.016,
    hoodUnder = (x) =>
      hoodWallTop + ((x - hoodBack) / (hoodReach - hoodBack)) * (hoodFrontTop - hoodWallTop);
  for (const side of [-1, 1]) {
    const points = [];
    for (const z of [side * (archOuter + 0.001), side * (archOuter + 0.009)])
      for (const [x, y] of [
        [hoodBack, archTop - 0.03],
        [hoodBack, hoodUnder(hoodBack) + 0.0005],
        [hoodReach - 0.003, hoodUnder(hoodReach - 0.003) + 0.0005],
        [hoodReach - 0.003, hoodUnder(hoodReach - 0.003) - 0.009],
      ])
        points.push(new THREE.Vector3(x, y, z));
    add(`pop-hood-bracket-${side}`, new ConvexGeometry(points));
  }
  {
    const points = [];
    for (const z of [-hoodHalf, hoodHalf])
      for (const [x, y] of [
        [hoodBack, hoodWallTop],
        [hoodBack, hoodWallTop + 0.007],
        [hoodReach, hoodFrontTop + 0.006],
        [hoodReach, hoodFrontTop],
      ])
        points.push(new THREE.Vector3(x, y, z));
    add('pop-hood-board', new ConvexGeometry(points), 'wood', parts.length, courseUV('door', 6));
  }
  // The pop door is a ledged and braced leaf of three vertical boards cut
  // from the mouth's own outline (it closes over the splay, lapping the frame
  // face), hung on two pintle hinges on the frame's -Z face band (the side the
  // inspection section keeps) and swung right round to lie flat against the
  // boards beside the opening, ledges and brace outward, clear of the opening
  // and of the ramp's side board. The hinge is modelled as a joint: a pintle
  // plate on the frame face with its pin, and a knuckle on each strap round
  // that pin. Leaf parts are laid out closed and swung about the pin axis.
  const leafHalf = mouthHalf + 0.003,
    leafBottom = holeBottom + 0.005,
    leafBack = frameFace + 0.0005,
    leafFace = leafBack + 0.008,
    knuckleR = 0.0055,
    hingeX = frameFace + knuckleR,
    hingeZ = -leafHalf - 0.004,
    swing = Math.PI,
    swingMatrix = new THREE.Matrix4()
      .makeTranslation(hingeX, 0, hingeZ)
      .multiply(new THREE.Matrix4().makeRotationY(swing))
      .multiply(new THREE.Matrix4().makeTranslation(-hingeX, 0, -hingeZ));
  const leafOutline = archOutline(leafHalf, leafBottom),
    leafGap = 0.0012;
  for (let i = 0; i < 3; i++) {
    const za = -leafHalf + (2 * leafHalf * i) / 3 + (i > 0 ? leafGap / 2 : 0),
      zb = -leafHalf + (2 * leafHalf * (i + 1)) / 3 - (i < 2 ? leafGap / 2 : 0);
    add(
      `pop-door-board-${i}`,
      prismX(clipZ(clipZ(leafOutline, za, true), zb, false), leafBack, leafFace),
      'wood',
      parts.length,
      courseUV('door', i),
      swingMatrix
    );
  }
  // Ledges low on the leaf and just above the arch's springing, where the
  // round head is still wide enough to carry the full ledge.
  const ledgeYs = [leafBottom + 0.024, springY + 0.03];
  assert(Math.sqrt(leafHalf ** 2 - 0.03 ** 2) > leafHalf - 0.008, 'Upper ledge fits the head');
  ledgeYs.forEach((y, i) =>
    add(
      `pop-door-ledge-${i}`,
      boxGeometry(
        [leafBack - 0.0045, y - 0.007, -leafHalf + 0.008],
        [leafBack + 0.0005, y + 0.007, leafHalf - 0.008]
      ),
      'wood',
      parts.length,
      courseUV('door', 3 + i),
      swingMatrix
    )
  );
  {
    // The brace rises from the hinge-side end of the lower ledge to the free
    // end of the upper one.
    const from = new THREE.Vector2(-leafHalf + 0.014, ledgeYs[0] + 0.006),
      to = new THREE.Vector2(leafHalf - 0.014, ledgeYs[1] - 0.006),
      across = new THREE.Vector2()
        .subVectors(to, from)
        .normalize()
        .rotateAround(new THREE.Vector2(), Math.PI / 2)
        .multiplyScalar(0.005),
      points = [];
    for (const x of [leafBack - 0.004, leafBack + 0.0005])
      for (const end of [from, to])
        for (const sign of [-1, 1])
          points.push(new THREE.Vector3(x, end.y + across.y * sign, end.x + across.x * sign));
    add(
      'pop-door-brace',
      new ConvexGeometry(points),
      'wood',
      parts.length,
      courseUV('door', 5),
      swingMatrix
    );
  }
  ledgeYs.forEach((y, i) => {
    const tipZ = leafHalf - 0.012;
    add(
      `pop-door-strap-${i}`,
      prismX(
        [
          [hingeZ, y - 0.006],
          [tipZ - 0.012, y - 0.0035],
          [tipZ, y],
          [tipZ - 0.012, y + 0.0035],
          [hingeZ, y + 0.006],
        ],
        leafFace - 0.0005,
        leafFace + 0.003
      ),
      'metal',
      parts.length,
      null,
      swingMatrix
    );
    for (const z of [hingeZ + 0.03, (hingeZ + tipZ) / 2 + 0.012, tipZ - 0.02])
      add(
        `pop-door-bolt-${i}-${z.toFixed(3)}`,
        new THREE.CylinderGeometry(0.0024, 0.0024, 0.0025, 8)
          .rotateZ(Math.PI / 2)
          .translate(leafFace + 0.003 + 0.0007, y, z),
        'metal',
        parts.length,
        null,
        swingMatrix
      );
    // Fixed half of the joint: a knuckle round the pin, the pin itself, and
    // the pintle plate that carries it on the architrave face.
    add(
      `pop-door-knuckle-${i}`,
      new THREE.CylinderGeometry(knuckleR, knuckleR, 0.016, 12).translate(hingeX, y, hingeZ),
      'metal'
    );
    add(
      `pop-door-pin-${i}`,
      new THREE.CylinderGeometry(0.0022, 0.0022, 0.025, 8).translate(hingeX, y, hingeZ),
      'metal'
    );
    box(
      `pop-door-pintle-${i}`,
      [frameFace - 0.0005, y - 0.0055, hingeZ - 0.0045],
      [frameFace + 0.0035, y + 0.0055, hingeZ + 0.0055],
      0,
      'metal'
    );
  });
  for (const z of [-ventHalf - 0.005, ventHalf + 0.005])
    box(
      `vent-jamb-${z}`,
      [frontX + 0.008, ventLow - 0.006, z - 0.006],
      [frontX + 0.025, ventHigh + 0.006, z + 0.006],
      0.001
    );
  for (const y of [ventLow - 0.006, ventHigh + 0.006])
    box(
      `vent-lintel-${y}`,
      [frontX + 0.0075, y - 0.006, -ventHalf - 0.0115],
      [frontX + 0.0255, y + 0.006, ventHalf + 0.0115],
      0.001
    );
  // Gable vent louvres: four slats sloping down and out, housed 3 mm into
  // the jambs, so the vent reads as a louvred opening rather than a flat back.
  for (let i = 0; i < 4; i++)
    add(
      `vent-louvre-${i}`,
      new THREE.BoxGeometry(0.024, 0.0035, 2 * ventHalf + 0.004)
        .rotateZ(-0.7)
        .translate(frontX + 0.016, ventLow + 0.012 + i * 0.022, 0),
      'wood',
      parts.length,
      courseUV('vent', i)
    );
  // A chamfer plane on the arris where faces A and B meet, cutting c from
  // each face.
  const chamfer = (a, b, c) => plane(a.n.x + b.n.x, a.n.y + b.n.y, a.n.z + b.n.z, a.d + b.d - c);
  // Ramp, rebuilt as a carried frame (the struck build was a side profile
  // extruded with a bird's-mouth on a hidden cleat). Every timber is a solid
  // defined by its saw cuts: chamfered stringers with a plumb head against
  // the end sill, a level foot and a plumb toe; a deep bearer fixed across the
  // end sill's face under the ramp head, its top bevelled to the pitch so the
  // stringers bear on it across their full width; and a ground sill under the
  // foot. Deck planks run between the stringers from the threshold to the
  // nose. Timbers are laid out in the ramp's own frame for their grain.
  const deckX0 = frontX + 0.035 - 0.0005,
    deckY0 = holeBottom - 0.0005,
    sillTop = groundY + 0.016,
    rampSlope = (sillTop + 0.0115 - deckY0) / (rampEndX - deckX0),
    rampAngle = Math.atan(rampSlope),
    deckAt = (x) => deckY0 + (x - deckX0) * rampSlope,
    rampHalf = 0.074,
    stringerT = 0.015,
    railRise = 0.02,
    stringerBelow = 0.016,
    stringerOut = rampHalf + stringerT,
    headX = frontX + 0.0175,
    toeX = rampEndX - 0.0025,
    sillX = [0.455, 0.4985];
  const underLine = (offset) => plane(-rampSlope, 1, 0, deckY0 - rampSlope * deckX0 + offset),
    overLine = (offset) => plane(rampSlope, -1, 0, -(deckY0 - rampSlope * deckX0 + offset)),
    xAtLeast = (x) => plane(-1, 0, 0, -x),
    xAtMost = (x) => plane(1, 0, 0, x),
    yAtLeast = (y) => plane(0, -1, 0, -y),
    yAtMost = (y) => plane(0, 1, 0, y),
    zAtLeast = (z) => plane(0, 0, -1, -z),
    zAtMost = (z) => plane(0, 0, 1, z);
  const rampMatrix = new THREE.Matrix4().makeRotationZ(rampAngle),
    rampInverse = rampMatrix.clone().invert(),
    addRamp = (name, geometry, role = 'wood', course = null) =>
      add(name, geometry.applyMatrix4(rampInverse), role, parts.length, course, rampMatrix);
  const footX = deckX0 + (sillTop - 0.0005 + stringerBelow - deckY0) / rampSlope;
  assert(footX > sillX[0] + 0.005 && footX < toeX - 0.004, `Stringer foot ${footX}`);
  for (const side of [-1, 1]) {
    const zMin = side < 0 ? -stringerOut : rampHalf,
      zMax = side < 0 ? -rampHalf : stringerOut,
      top = underLine(railRise),
      bottom = overLine(-stringerBelow),
      hi = zAtMost(zMax),
      lo = zAtLeast(zMin);
    addRamp(
      `ramp-stringer-${side}`,
      halfSpaceSolid([
        top,
        bottom,
        hi,
        lo,
        chamfer(top, hi, 0.003),
        chamfer(top, lo, 0.003),
        chamfer(bottom, hi, 0.003),
        chamfer(bottom, lo, 0.003),
        xAtLeast(headX),
        xAtMost(toeX),
        yAtLeast(sillTop - 0.0005),
      ]),
      'wood',
      courseUV('ramp', 3 + (side + 1) / 2)
    );
  }
  for (let i = 0; i < 3; i++) {
    const z0 = -rampHalf - 0.0005 + ((2 * rampHalf + 0.001) * i) / 3 + (i > 0 ? 0.0004 : 0),
      z1 = -rampHalf - 0.0005 + ((2 * rampHalf + 0.001) * (i + 1)) / 3 - (i < 2 ? 0.0004 : 0);
    addRamp(
      `ramp-plank-${i}`,
      halfSpaceSolid([
        underLine(0),
        overLine(-0.012),
        zAtLeast(z0),
        zAtMost(z1),
        xAtLeast(deckX0),
        xAtMost(rampEndX),
      ]),
      'wood',
      courseUV('ramp', i)
    );
  }
  {
    const front = xAtMost(frontX + 0.045),
      bottom = yAtLeast(-0.306);
    add(
      'ramp-bearer',
      halfSpaceSolid([
        xAtLeast(headX),
        front,
        bottom,
        underLine(-stringerBelow + 0.0005),
        zAtLeast(-stringerOut - 0.012),
        zAtMost(stringerOut + 0.012),
        chamfer(front, bottom, 0.004),
      ]),
      'wood',
      parts.length,
      courseUV('ramp', 5)
    );
  }
  {
    const top = yAtMost(sillTop),
      front = xAtMost(sillX[1]),
      back = xAtLeast(sillX[0]);
    add(
      'ramp-ground-sill',
      halfSpaceSolid([
        top,
        front,
        back,
        yAtLeast(groundY),
        zAtLeast(-stringerOut - 0.014),
        zAtMost(stringerOut + 0.014),
        chamfer(top, front, 0.003),
        chamfer(top, back, 0.003),
      ]),
      'wood',
      parts.length,
      courseUV('ramp', 6)
    );
  }
  // Grip cleats run the full width, housed 0.5 mm into each stringer and
  // bedded 0.5 mm into the deck; two rungs tie the stringers under the deck.
  for (let i = 1; i <= 7; i++) {
    const x = deckX0 + ((rampEndX - deckX0) * i) / 8;
    addRamp(
      `ramp-cleat-${i}`,
      new THREE.BoxGeometry(0.012, 0.005, 2 * rampHalf + 0.001)
        .rotateZ(rampAngle)
        .translate(x, deckAt(x) + 0.002, 0)
    );
  }
  for (const x of [0.22, 0.38])
    addRamp(
      `ramp-rung-${x}`,
      new THREE.BoxGeometry(0.022, 0.012, 2 * rampHalf + 0.001)
        .rotateZ(rampAngle)
        .translate(x, deckAt(x) - 0.0175, 0)
    );
  // Two butt hinges at the threshold joint: a leaf on the threshold top, a
  // leaf lying on the deck, and the knuckle round the joint line between.
  for (const z of [-0.035, 0.035]) {
    add(
      `ramp-hinge-knuckle-${z}`,
      new THREE.CylinderGeometry(0.0032, 0.0032, 0.02, 10)
        .rotateX(Math.PI / 2)
        .translate(deckX0 + 0.0005, deckY0 + 0.0015, z),
      'metal'
    );
    box(
      `ramp-hinge-leaf-in-${z}`,
      [deckX0 - 0.018, holeBottom - 0.0005, z - 0.009],
      [deckX0 + 0.0005, holeBottom + 0.0012, z + 0.009],
      0,
      'metal'
    );
    const points = [];
    for (const zz of [z - 0.009, z + 0.009])
      for (const x of [deckX0 + 0.0005, deckX0 + 0.022])
        for (const dy of [-0.0005, 0.0015]) points.push(new THREE.Vector3(x, deckAt(x) + dy, zz));
    add(`ramp-hinge-leaf-out-${z}`, new ConvexGeometry(points), 'metal');
  }
  // ROOF, authored as closed shells from measured dimensions (no parent
  // triangle is copied): the slab on the parent's soffit planes; on each
  // slope one profiled metal sheet, its cross-section (flat pans between
  // trapezoidal ribs) traced once and lofted down the slope from the ridge to
  // the eave, so the ribs and the sheet's end profile are real geometry; a
  // rolled ridge cap over the rib ends; two traced barge boards and two fascia
  // boards. The barges and ridge land exactly on the parent's envelope
  // extremes. The sheet tops are projected in world units (x along the ridge,
  // s down the slope) onto one island per slope at one texel density, and the
  // paint is one green: no tiles, so nothing to vary per tile or to mirror.
  const SLAB_RISE = 0.00908, // parent slab: top 0.41956 over soffit apex 0.41048
    XMIN = -0.5001055002212524,
    ZMIN = -0.3535238206386566,
    ZMAX = 0.35358738899230957,
    RIDGE_TOP = 0.4356960654258728,
    H_UNDER = -0.003,
    H_PAN = 0.0025,
    H_RIB = 0.0095,
    RIB_BASE = 0.013,
    RIB_CROWN = 0.006,
    RIBS = 18,
    S0 = 0.004,
    courseX = [-0.4885, 0.1194],
    ribPitch = (courseX[1] - courseX[0]) / RIBS,
    bargeX = [
      [XMIN, XMIN + 0.0121],
      [0.1189, 0.131],
    ];
  const apexTop = [soffitApex[0], soffitApex[1] + SLAB_RISE];
  // Atlas UVs for one prism edge or cap, from the corner's arc length along
  // its own edge.
  const edgeArc = (profile) => {
    const arc = [0];
    for (let j = 0; j < profile.length; j++) {
      const [az, ay] = profile[j],
        [bz, by] = profile[(j + 1) % profile.length];
      arc.push(arc[j] + Math.hypot(bz - az, by - ay));
    }
    return (edge, z, y) => {
      const [sz, sy] = profile[edge];
      return sz === z && sy === y ? arc[edge] : arc[edge + 1];
    };
  };
  const trimUV = (profile, x0, x1) => {
    const arcOf = edgeArc(profile),
      perimeter = arcOf(profile.length - 1, ...profile[0]),
      zs = profile.map((p) => p[0]),
      ys = profile.map((p) => p[1]),
      [zLow, zHigh, yLow, yHigh] = [
        Math.min(...zs),
        Math.max(...zs),
        Math.min(...ys),
        Math.max(...ys),
      ],
      w = TRIM.width - TRIM_INSET * 2,
      h = TRIM.height - TRIM_INSET * 2;
    return {
      side: (edge, x, z, y) => [
        TRIM.x + TRIM_INSET + ((x - x0) / (x1 - x0)) * w,
        TRIM.y + TRIM_INSET + (arcOf(edge, z, y) / perimeter) * h,
      ],
      cap: (x, z, y) => [
        TRIM.x + TRIM_INSET + ((z - zLow) / (zHigh - zLow)) * w,
        TRIM.y + TRIM_INSET + ((y - yLow) / (yHigh - yLow)) * h,
      ],
    };
  };
  const addTrim = (name, profile, x0, x1) => {
    const mapping = trimUV(profile, x0, x1);
    add(name, prismX(profile, x0, x1, mapping.side, mapping.cap), 'authored');
  };
  addTrim(
    'roof-slab',
    [
      soffitEave[0],
      [soffitEave[0][0], soffitEave[0][1] + SLAB_RISE],
      apexTop,
      [soffitEave[1][0], soffitEave[1][1] + SLAB_RISE],
      soffitEave[1],
      soffitApex,
    ],
    slabX[0],
    slabX[1]
  );
  const slopes = [0, 1].map((k) => {
    const sign = k ? 1 : -1,
      E = [soffitEave[k][0], soffitEave[k][1] + SLAB_RISE],
      L = Math.hypot(E[0] - apexTop[0], E[1] - apexTop[1]),
      u = [(E[0] - apexTop[0]) / L, (E[1] - apexTop[1]) / L],
      n = [-sign * u[1], sign * u[0]],
      at = (s, h) => [apexTop[0] + s * u[0] + h * n[0], apexTop[1] + s * u[1] + h * n[1]],
      // The rib crowns lean out past the pans, so the sheet stops a little
      // shorter than the old courses did to stay inside the barge extremes.
      sEnd = L - 0.0045,
      // Each sheet is laid from its own barge, so the second slope's ribs sit
      // half a pitch along from the first's: the slopes never mirror exactly.
      ribs = Array.from(
        { length: k ? RIBS - 1 : RIBS },
        (_, i) => courseX[0] + ribPitch * (i + (k ? 1 : 0.5))
      ),
      contour = [
        [courseX[0], H_UNDER],
        [courseX[0], H_PAN],
      ];
    for (const c of ribs)
      contour.push(
        [c - RIB_BASE / 2, H_PAN],
        [c - RIB_CROWN / 2, H_RIB],
        [c + RIB_CROWN / 2, H_RIB],
        [c + RIB_BASE / 2, H_PAN]
      );
    contour.push([courseX[1], H_PAN], [courseX[1], H_UNDER]);
    for (const h of [H_UNDER, H_RIB])
      for (const s of [S0, sEnd]) {
        const [z] = at(s, h);
        assert(z > ZMIN + 0.0004 && z < ZMAX - 0.0004, `Sheet z ${z}`);
      }
    // Distance down the slope of a world point (n is normal to u).
    const sOf = (point) => (point.z - apexTop[0]) * u[0] + (point.y - apexTop[1]) * u[1];
    return { k, sign, at, L, sEnd, ribs, contour, sOf };
  });
  const islandWidth = SLOPE_REGIONS[0].width - ROOF_GUTTER * 2,
    islandHeight = SLOPE_REGIONS[0].height - ROOF_GUTTER * 2,
    roofDensity =
      0.995 *
      Math.min(
        islandWidth / (courseX[1] - courseX[0]),
        ...slopes.map((slope) => islandHeight / slope.sEnd)
      );
  for (const slope of slopes) {
    const region = SLOPE_REGIONS[slope.k],
      topEdges = slope.contour.length - 3;
    add(
      `roof-sheet-${slope.sign}`,
      loft(
        slope.contour,
        slope.contour,
        ([x, h]) => {
          const [z, y] = slope.at(S0, h);
          return new THREE.Vector3(x, y, z);
        },
        ([x, h]) => {
          const [z, y] = slope.at(slope.sEnd, h);
          return new THREE.Vector3(x, y, z);
        },
        (point, normal, kind) => {
          const s = slope.sOf(point);
          // The sheet's top (pans and ribs) goes to its slope island; the
          // lateral edges, the underside and the two cut ends to the trim.
          if (kind.edge !== undefined && kind.edge >= 1 && kind.edge <= topEdges)
            return [
              region.x + ROOF_GUTTER + (point.x - courseX[0]) * roofDensity,
              region.y + ROOF_GUTTER + s * roofDensity,
            ];
          return [
            TRIM.x +
              TRIM_INSET +
              ((point.x - courseX[0]) / (courseX[1] - courseX[0])) * (TRIM.width - TRIM_INSET * 2),
            TRIM.y + TRIM_INSET + (s / slope.L) * (TRIM.height - TRIM_INSET * 2),
          ];
        }
      ),
      'authored'
    );
  }
  {
    // Rolled ridge cap: a 10.5 mm roll whose crown is the envelope's top, on
    // straight wings that run down each slope over the rib crowns to tipS and
    // close down onto the pans there, covering the rib ends.
    const r = 0.0105,
      centre = [apexTop[0], RIDGE_TOP - r],
      tipS = 0.042,
      hTop = H_RIB + 0.003,
      hLow = H_PAN - 0.0005,
      [minus, plus] = slopes,
      arc = [];
    for (let i = 0; i <= 8; i++) {
      const degrees = 10 + 20 * i;
      arc.push(
        i === 4
          ? [apexTop[0], RIDGE_TOP]
          : [
              centre[0] + r * Math.cos((degrees * Math.PI) / 180),
              centre[1] + r * Math.sin((degrees * Math.PI) / 180),
            ]
      );
    }
    // Each wing runs from its tip to the roll's end point; every rib crown
    // between S0 and tipS must stay at least 1 mm under it.
    for (const [slope, join] of [
      [plus, arc[0]],
      [minus, arc.at(-1)],
    ]) {
      const tip = slope.at(tipS, hTop);
      for (let j = 0; j <= 40; j++) {
        const [z, y] = slope.at(S0 + ((tipS - S0) * j) / 40, H_RIB),
          t = (z - tip[0]) / (join[0] - tip[0]);
        if (t < 0 || t > 1) {
          // Past the roll's end point the roll itself is overhead.
          const dz = z - centre[0];
          assert(
            Math.abs(dz) < r && centre[1] + Math.sqrt(r * r - dz * dz) > y + 0.001,
            'Ridge roll clears ribs'
          );
          continue;
        }
        assert(tip[1] + t * (join[1] - tip[1]) > y + 0.001, `Ridge wing clears rib crown at ${z}`);
      }
    }
    addTrim(
      'roof-ridge-cap',
      [
        plus.at(tipS, hLow),
        plus.at(tipS, hTop),
        ...arc,
        minus.at(tipS, hTop),
        minus.at(tipS, hLow),
        minus.at(S0, hLow),
        plus.at(S0, hLow),
      ],
      bargeX[0][0] + 0.0003,
      bargeX[1][1] - 0.0003
    );
  }
  // Barge boards traced along the slab's top line, plumb-cut at the parent's
  // z extremes; the back one's outer face is the envelope's x minimum.
  const slabTopAt = (z) => {
    const E = z < apexTop[0] ? soffitEave[0] : soffitEave[1];
    return apexTop[1] + ((z - apexTop[0]) / (E[0] - apexTop[0])) * (E[1] + SLAB_RISE - apexTop[1]);
  };
  bargeX.forEach(([x0, x1], i) =>
    addTrim(
      `roof-barge-${i ? 'front' : 'back'}`,
      [
        [ZMIN, slabTopAt(ZMIN) + 0.016],
        [apexTop[0], apexTop[1] + 0.016],
        [ZMAX, slabTopAt(ZMAX) + 0.016],
        [ZMAX, slabTopAt(ZMAX) - 0.024],
        [apexTop[0], apexTop[1] - 0.024],
        [ZMIN, slabTopAt(ZMIN) - 0.024],
      ],
      x0,
      x1
    )
  );
  for (const sign of [-1, 1])
    addTrim(
      `roof-fascia-${sign}`,
      [
        [sign * 0.3499, 0.1165],
        [sign * 0.3529, 0.1165],
        [sign * 0.3529, 0.1385],
        [sign * 0.3499, 0.1385],
      ],
      bargeX[0][1] - 0.0005,
      bargeX[1][0] + 0.0005
    );
  // Texture pixels outside the disjoint authored timber, metal, pop-hole,
  // roof-slope and roof-trim regions survive before encoding; nothing samples
  // them, none move.
  // One painted-sheet sample for slope k at region pixel (x, y): albedo,
  // roughness and a tangent-space normal. Coordinates outside the island are
  // clamped, which fills the gutter with the border's own paint. The paint is
  // one green with no field across the sheet: rib crowns a touch lighter
  // (worn), a soft grime band toward the eave that is the same along the whole
  // ridge, and grain under 1%. The relief is the lofted ribs; the normal map
  // only adds two pressed stiffener lines down each pan.
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const roofPaint = (k, x, y) => {
    const region = SLOPE_REGIONS[k],
      slope = slopes[k],
      iu = clampInt(x - region.x - ROOF_GUTTER, 0, islandWidth - 1),
      iv = clampInt(y - region.y - ROOF_GUTTER, 0, islandHeight - 1),
      wx = courseX[0] + (iu + 0.5) / roofDensity,
      s = Math.min((iv + 0.5) / roofDensity, slope.sEnd),
      seed = 101 + k * 37;
    // Nearest rib, and where this pixel sits in its pan.
    let nearest = Infinity,
      left = courseX[0] - RIB_BASE / 2,
      right = courseX[1] + RIB_BASE / 2;
    for (const c of slope.ribs) {
      nearest = Math.min(nearest, Math.abs(wx - c));
      if (c <= wx) left = Math.max(left, c);
      else right = Math.min(right, c);
    }
    const eave = smooth(Math.max(0, Math.min(1, (s / slope.L - 0.72) / 0.28))),
      grain = (hash01(x, y, seed + 17) - 0.5) * 0.016;
    let value = 1,
      nx = 0,
      rough = 233;
    if (nearest <= RIB_CROWN / 2) {
      value = 1.05;
      rough = 227;
    } else if (nearest <= RIB_BASE / 2) value = 0.99;
    else {
      const panStart = left + RIB_BASE / 2,
        panEnd = right - RIB_BASE / 2,
        panPx = (panEnd - panStart) * roofDensity;
      for (const t of [1 / 3, 2 / 3]) {
        const d = ((wx - panStart) / (panEnd - panStart) - t) * panPx;
        nx += 0.5 * d * Math.exp(-(d * d) / 0.9);
      }
    }
    value *= (1 - 0.06 * eave) * (1 + grain);
    return {
      rgb: ROOF_GREEN.map((c) => clampByte(c * value)),
      roughness: clampByte(rough),
      normal: [clampByte(128 + nx * 127), 128, clampByte(128 + Math.sqrt(1 - nx * nx) * 127)],
    };
  };
  // Limewash on the splayed frame: an off-white with a faint soft mottle and
  // a little grime at the foot where the hens tread. The passage lining is a
  // dark weathered brown.
  const limePaint = (x, y) => {
    const v = (y - LIME.y) / LIME.height,
      mottle = (valueNoise(x / 7, y / 7, 211) - 0.5) * 0.05,
      foot = smooth(Math.max(0, Math.min(1, (0.22 - v) / 0.22))),
      s = (1 + mottle + (hash01(x, y, 213) - 0.5) * 0.02) * (1 - 0.14 * foot);
    return [228 * s, 220 * s, 199 * s].map(clampByte);
  };
  const shadePaint = (x, y) => {
    const s = 1 + (valueNoise(x / 6, y / 6, 217) - 0.5) * 0.08;
    return [68 * s, 49 * s, 32 * s].map(clampByte);
  };
  // Board strip: WOOD_ROWS painted boards, one per WOOD_ROW_PX row. Each has
  // its own tone and warmth, a slow tone drift along its length, two or three
  // wavering grain lines running with it, at most one small knot at a seeded
  // place, and a dark cut line on both long edges (the gap between boards,
  // which still reads in shade where the lap shadow does not).
  const KNOT_ACROSS_PX = 1.8,
    knotAlongPx =
      ((KNOT_ACROSS_PX * (rowY(1) - rowY(0))) / (WOOD_ROW_PX - 1)) * 1.25 * WOOD_DENSITY;
  const woodPaint = (x, y) => {
    const u = x - PATCH.x,
      local = y - PATCH.y,
      row = Math.floor(local / WOOD_ROW_PX),
      i = local % WOOD_ROW_PX;
    const tone = woodTone(row),
      warm = (hash01(row, 43) - 0.5) * 10,
      drift = 1 + (valueNoise(u / 34, row * 3.1, 47) - 0.5) * 0.07,
      wave = 2 * Math.sin(u / 21 + row * 1.9) + 0.8 * Math.sin(u / 8.3 + row * 0.7),
      grain =
        Math.sin((i + wave) * 1.15 + row * 2.3) * 0.035 +
        (valueNoise(u / 3, i * 1.7 + row * 20, 53) - 0.5) * 0.04;
    let knot = 0;
    // Knots are sized in world units and converted with the two texel
    // densities, so on a wall course they come out round, not stretched.
    if (hash01(row, 59) < 0.5) {
      const ku = 12 + hash01(row, 61) * (WOOD_ALONG_PX + WOOD_U0 - 24),
        kv = 5 + hash01(row, 67) * 5;
      knot = Math.exp(-(((u - ku) / knotAlongPx) ** 2 + ((i - kv) / KNOT_ACROSS_PX) ** 2)) * 0.22;
    }
    const edge =
      i === 0 || i === WOOD_ROW_PX - 1 ? 0.55 : i === 1 || i === WOOD_ROW_PX - 2 ? 0.84 : 1;
    // The base is lifted so the strip's mean, cut lines included, matches the
    // delivered wall (about 164/105/53); separation comes from the lines and
    // the lap shadow, not from a darker board.
    const s = tone * drift * (1 + grain - knot) * edge;
    return {
      rgb: [(177.5 + warm) * s, (112.5 + warm * 0.4) * s, 56.8 * s].map(clampByte),
      roughness: clampByte(edge < 1 ? 236 : 218 + (hash01(row, 71) - 0.5) * 14),
    };
  };
  const textureReceipts = [];
  for (const texture of root.listTextures()) {
    const image = texture.getImage(),
      decoded = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, 512);
    assert.equal(decoded.info.height, 512);
    assert.equal(decoded.info.channels, 3);
    const data = Buffer.from(decoded.data),
      before = Buffer.from(data),
      name = texture.getName();
    for (const patch of [PATCH, METAL])
      for (let y = patch.y; y < patch.y + patch.height; y++)
        for (let x = patch.x; x < patch.x + patch.width; x++) {
          const at = (y * 512 + x) * 3;
          if (name.includes('normal')) {
            data[at] = 128;
            data[at + 1] = 128;
            data[at + 2] = 255;
          } else if (name.endsWith('-orm')) {
            data[at] = 255;
            data[at + 1] = patch === METAL ? 175 : woodPaint(x, y).roughness;
            data[at + 2] = patch === METAL ? 90 : 0;
          } else if (patch === METAL) {
            data[at] = 83;
            data[at + 1] = 104;
            data[at + 2] = 91;
          } else [data[at], data[at + 1], data[at + 2]] = woodPaint(x, y).rgb;
        }
    // Pop-hole swatch: limewash and the dark passage lining, matte, flat.
    for (const swatch of [LIME, SHADE])
      for (let y = swatch.y; y < swatch.y + swatch.height; y++)
        for (let x = swatch.x; x < swatch.x + swatch.width; x++) {
          const at = (y * 512 + x) * 3;
          if (name.includes('normal')) [data[at], data[at + 1], data[at + 2]] = [128, 128, 255];
          else if (name.endsWith('-orm')) [data[at], data[at + 1], data[at + 2]] = [255, 242, 0];
          else
            [data[at], data[at + 1], data[at + 2]] =
              swatch === LIME ? limePaint(x, y) : shadePaint(x, y);
        }
    // Painted green sheet roof: matte paint (roughness about 0.9, no
    // metalness); the ribs are geometry, the stiffeners in the normal map.
    SLOPE_REGIONS.forEach((region, k) => {
      for (let y = region.y; y < region.y + region.height; y++)
        for (let x = region.x; x < region.x + region.width; x++) {
          const at = (y * 512 + x) * 3,
            paint = roofPaint(k, x, y);
          if (name.includes('normal')) [data[at], data[at + 1], data[at + 2]] = paint.normal;
          else if (name.endsWith('-orm')) {
            data[at] = 255;
            data[at + 1] = paint.roughness;
            data[at + 2] = 0;
          } else [data[at], data[at + 1], data[at + 2]] = paint.rgb;
        }
    });
    for (let y = TRIM.y; y < TRIM.y + TRIM.height; y++)
      for (let x = TRIM.x; x < TRIM.x + TRIM.width; x++) {
        const at = (y * 512 + x) * 3;
        if (name.includes('normal')) {
          data[at] = 128;
          data[at + 1] = 128;
          data[at + 2] = 255;
        } else if (name.endsWith('-orm')) {
          data[at] = 255;
          data[at + 1] = 238;
          data[at + 2] = 0;
        } else {
          const shade = (hash01(x, y, 23) - 0.5) * 4 + (valueNoise(x / 9, y / 9, 29) - 0.5) * 4;
          data[at] = clampByte(TRIM_GREEN[0] + shade * 0.8);
          data[at + 1] = clampByte(TRIM_GREEN[1] + shade);
          data[at + 2] = clampByte(TRIM_GREEN[2] + shade * 0.8);
        }
      }
    let outsideChanged = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const inPatch = [PATCH, METAL, LIME, SHADE, ...SLOPE_REGIONS, TRIM].some(
          (p) => x >= p.x && x < p.x + p.width && y >= p.y && y < p.y + p.height
        );
        if (!inPatch)
          for (let c = 0; c < 3; c++)
            if (data[(y * 512 + x) * 3 + c] !== before[(y * 512 + x) * 3 + c]) outsideChanged++;
      }
    assert.equal(outsideChanged, 0);
    texture
      .setImage(
        await sharp(data, { raw: { width: 512, height: 512, channels: 3 } })
          .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
          .toBuffer()
      )
      .setMimeType('image/jpeg');
    textureReceipts.push({
      name,
      oldImageSHA256: hash(image),
      newImageSHA256: hash(texture.getImage()),
      outsidePatchChangedComponentsBeforeEncoding: outsideChanged,
      encoding: { format: 'jpeg', quality: 90, chromaSubsampling: '4:4:4' },
      patches: [PATCH, METAL, LIME, SHADE, ...SLOPE_REGIONS, TRIM],
    });
  }
  const sourceCornerCount = arrays.POSITION.length / 3,
    indices = [],
    vertexMap = new Map(),
    packed = { POSITION: [], NORMAL: [], TEXCOORD_0: [] };
  for (let i = 0; i < sourceCornerCount; i++) {
    const key = [
      ...arrays.POSITION.slice(i * 3, i * 3 + 3),
      ...arrays.NORMAL.slice(i * 3, i * 3 + 3),
      ...arrays.TEXCOORD_0.slice(i * 2, i * 2 + 2),
    ]
      .map(Math.fround)
      .join(',');
    let index = vertexMap.get(key);
    if (index === undefined) {
      index = packed.POSITION.length / 3;
      for (const semantic of Object.keys(packed)) {
        const size = semantic === 'TEXCOORD_0' ? 2 : 3;
        packed[semantic].push(...arrays[semantic].slice(i * size, i * size + size));
      }
      vertexMap.set(key, index);
    }
    indices.push(index);
  }
  for (const [key, values] of Object.entries(packed)) {
    assert(values.every(Number.isFinite));
    const a = document
      .createAccessor(key)
      .setType(key === 'TEXCOORD_0' ? 'VEC2' : 'VEC3')
      .setArray(new Float32Array(values))
      .setBuffer(root.listBuffers()[0]);
    primitive.setAttribute(key, a);
  }
  const count = sourceCornerCount;
  primitive.setIndices(
    document
      .createAccessor('coop-precision-indices')
      .setType('SCALAR')
      .setArray(new Uint16Array(indices))
      .setBuffer(root.listBuffers()[0])
  );
  for (const a of Object.values(old)) if (a.listParents().length === 1) a.dispose();
  if (originalIndices.listParents().length === 1) originalIndices.dispose();
  assert.deepEqual(frame(node), beforeFrame);
  const afterBounds = getBounds(root.listScenes()[0]);
  for (const end of ['min', 'max'])
    for (let c = 0; c < 3; c++)
      assert(
        Math.abs(beforeBounds[end][c] - afterBounds[end][c]) < 2e-7,
        `Real ${end}/${c} envelope changed`
      );
  for (let i = 0; i < count; i++) {
    const n = arrays.NORMAL.slice(i * 3, i * 3 + 3);
    assert(Math.abs(Math.hypot(...n) - 1) < 2e-5, 'Unit normal required');
  }
  let minArea = Infinity;
  for (let i = 0; i < count; i += 3) {
    const t = new THREE.Triangle(
      ...[0, 1, 2].map((c) => vector(arrays.POSITION.slice((i + c) * 3, (i + c + 1) * 3)))
    );
    minArea = Math.min(minArea, t.getArea());
    assert(t.getArea() > 1e-12, 'Nondegenerate face required');
  }
  assert(count <= 25200);
  assert(count / 3 <= 4500, `Triangle budget ${count / 3}`);
  // Floor lowered from 3,000 to 2,500: the authored roof replaces 716 open
  // parent quads with about 400 closed triangles; the floor guards detail
  // regressions elsewhere, not the roof's own count.
  assert(count / 3 >= 2500, `Triangle floor ${count / 3}`);
  root.getAsset().generator = `MillOS generated-asset pipeline, glTF-Transform ${VERSION}`;
  const bytes = Buffer.from(await io.writeBinary(document));
  assert(
    bytes.length <= 437000,
    `Existing file budget required, actual ${bytes.length}, vertices ${packed.POSITION.length / 3}, textures ${root.listTextures().map((t) => t.getImage().length)}`
  );
  return {
    bytes,
    receipt: {
      method: 'coop-precision-structure-v2',
      parentPath: PARENT_PATH,
      parentSHA256: PARENT_SHA256,
      outputSHA256: hash(bytes),
      bytes: bytes.length,
      vertices: packed.POSITION.length / 3,
      triangles: count / 3,
      renderVertices: count,
      bounds: afterBounds,
      nodeFrame: beforeFrame,
      materials: 1,
      textures: 3,
      textureReceipts,
      roof: {
        method: 'authored-lofted-ribbed-sheet-v4',
        parentTrianglesCopied: 0,
        soffitPlanesFromParentTriangles: [5230, 5472],
        ribsPerSlope: slopes.map((slope) => slope.ribs.length),
        ribPitch,
        rib: { base: RIB_BASE, crown: RIB_CROWN, height: H_RIB - H_PAN },
        islandDensityPxPerUnit: roofDensity,
        envelopeExtremes: { xMin: XMIN, zMin: ZMIN, zMax: ZMAX, yMax: RIDGE_TOP },
      },
      parts,
      contacts: {
        floorY,
        backX,
        frontX,
        halfZ,
        groundY,
        rampEndX,
        doorOpening: {
          x: frontX,
          shape: 'round-headed',
          y: [holeBottom, holeTop],
          z: [-holeW, holeW],
          splayedMouth: { x: frameFace, halfWidth: mouthHalf, top: springY + mouthHalf },
        },
        ventOpening: { x: frontX, y: [0.235, 0.325], z: [-0.045, 0.045] },
      },
      minimumTriangleArea: minArea,
      status: 'Offline candidate only; root native appearance/opening/contact acceptance required',
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length <= 1, 'Only an optional output path is supported');
  const output = path.resolve(args[0] ?? DEFAULT_OUTPUT);
  await mkdir(path.dirname(output), { recursive: true });
  const parent = await realpath(path.dirname(output));
  for (const protectedPath of ['public', 'assets']) {
    const protectedRoot = await realpath(protectedPath);
    assert(
      !parent.startsWith(protectedRoot + path.sep) && parent !== protectedRoot,
      'CLI output must remain outside public/assets'
    );
  }
  // An existing filename may itself be a symlink even when its parent is safe.
  for (const target of [output, output + '.json']) {
    let resolved;
    try {
      resolved = await realpath(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (resolved)
      for (const protectedPath of ['public', 'assets']) {
        const protectedRoot = await realpath(protectedPath);
        assert(
          resolved !== protectedRoot && !resolved.startsWith(protectedRoot + path.sep),
          'CLI target may not reach protected assets'
        );
      }
  }
  const { bytes, receipt } = await deriveCoop(await readFile(PARENT_PATH));
  await writeFile(output, bytes);
  await writeFile(output + '.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    JSON.stringify({
      output,
      bytes: receipt.bytes,
      triangles: receipt.triangles,
      sha256: receipt.outputSHA256,
    })
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
