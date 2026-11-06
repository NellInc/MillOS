/** Two budget-preserving shop shell corrections. Provider originals and surface
 * derivatives are inputs only. Working if the register remains 72 vertices and
 * the coffee housing stays below 180, with unchanged envelopes. The register
 * replaces both of its maps: a roughness map with a matte value per face, laid
 * out as per-face islands on TEXCOORD_0, and a seamless greyscale textured-ABS
 * grain tile in the slot the normal map held (still two textures), sampled
 * through a second, metric UV set (TEXCOORD_1) that repeats it across every face.
 * Its normals are flat per face and its face tones are vertex colours. The grain
 * is a repeating tile rather than a painted atlas because the normaliser ships
 * 256 px JPEG at 4:2:0: an atlas spread over the whole body holds about 128 px
 * per source metre, too coarse for any grain, while a repeated tile holds 800.
 * On the register nothing is painted that the geometry does not have (no
 * arris line, no seam). Its plan is an octagon (all four vertical edges cut at
 * 45 degrees) and the customer-facing ridge carries a 45-degree chamfer mitred
 * with the front cuts, as D-032 asks; the deck-side edges and the operator
 * shoulder stay square. The deck is one smooth-shaded surface fanned from an
 * apex on its centreline. 17 corners and 24 triangles, the whole 72
 * render-vertex budget, closed except on the counter it stands on.
 * The coffee housing is one body, closed except on the floor it stands on,
 * with flat per-face normals and a grey vertex-colour shading ramp. Its panel
 * structure (trim bands, corner trim, panel reveals, a steel bay frame) is a
 * painted albedo and roughness atlas on metric per-wall UVs, in the two
 * texture slots the old normal map and cloudy roughness atlas held.
 */
import { NodeIO, TextureInfo } from '@gltf-transform/core';
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
const io = new NodeIO();
const inputs = {
  'station-register': '90bb6a5f214204e53848ce504bf6f0033cded7beeb4cb169b6e7e96c344df12c',
  'station-coffee-machine': '245224c6586e474d54f88a5e2bfb1793ae706ef6a5a1a82dc8b700f272961837',
};
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const reportPath =
  args.find((a) => a.startsWith('--report='))?.slice(9) ??
  'output/retail-world-polish-20260927/retail-shells.json';
if (
  args.some((a) => !a.startsWith('--only=') && !a.startsWith('--report=')) ||
  (only && !Object.hasOwn(inputs, only))
)
  throw Error('Unknown retail selector or argument');
// Register housing, authored in the source frame (x +-0.5, y and z +-0.4 before
// the 0.5 normalise scale). The 72 render-vertex budget counts INDICES: 24
// triangles. With the unseen floor left open, T = 2V - 2 - L for V corners and
// an L-edge floor outline. A ridge chamfer lowers the top below the pinned
// deck plane, so something must rise above that plane to keep the height the
// normaliser scales by. A straight kink across the deck does it with two
// corners (4 triangles) and showed as a line across the deck; one apex vertex
// on the centreline does it with one (2 triangles). Octagonal plan with the
// ridge chamfer and the apex: V = 17, L = 8, 24 triangles. Chamfering the
// deck-side edges as well (a lid ring) needs at least 26 with any of these,
// so they stay square.
// The roughness map is a per-face island atlas on TEXCOORD_0; the normaliser
// ships it as 256 px JPEG (8 px blocks), so islands start on 8 px block
// boundaries, keep at least 8 px apart, and each value is extended into its
// gap. Textured ABS walls; the deck is a satin moulded top, the one face whose
// sheen separates it from the body under any light. It can be satin because
// it is shaded as one surface (shared normals across its gentle folds), so no
// fold draws a line in its highlight; the chamfers are worn a little smoother
// than the walls. Rects are in texels at 256.
const REGISTER_ISLANDS = {
  side: { px: [8, 8, 136, 110.4], roughness: 0.72 },
  front: { px: [8, 120, 110.4, 222.4], roughness: 0.72 },
  deck: { px: [144, 8, 246.4, 144.08], roughness: 0.6 },
  operator: { px: [144, 152, 246.4, 208.32], roughness: 0.72 },
  chamfer: { px: [120, 120, 136, 224], roughness: 0.62 },
};
const REGISTER_ORM_SIZE = 256;
for (const island of Object.values(REGISTER_ISLANDS))
  island.rect = island.px.map((value) => value / REGISTER_ORM_SIZE);
// Face tone (sRGB) after the albedo's base value. Two values carry the casing:
// the walls keep the card's #262626 (a little darker toward the counter), the
// deck is a moulded charcoal top 26 sRGB levels lighter, so the two separate
// after 256 px JPEG and at game distance, and the chamfers are a worn edge
// lighter again, so the bevels read as edges and not as slivers of wall.
const REGISTER_TONES = {
  deck: '#404040',
  side: '#262626',
  front: '#2c2c2c',
  operator: '#2a2a2a',
  chamfer: '#464646',
};
const REGISTER_FOOT_DARKEN = 0.9;
// Chamfers, source metres (half that once normalised). `leg` is every 45-degree
// chamfer's leg: the ridge chamfer's run along the deck and drop down the
// customer face, and each vertical cut's leg along a side wall and across an
// end face, about 2.8 cm wide delivered. The customer face's top sits at
// normalised y 0.38 (the runtime screen's top edge) and the end faces span
// |z| 0.18 (the bezel side bars reach 0.175, the drawer seam 0.175, the
// receipt slot 0.135); the side walls span x +-0.23 (the side vents reach
// 0.055). The normaliser scales by height, and the deck plane under the
// runtime keys is pinned in delivered space (GasStationInstanced.test.ts), so
// the chamfered ridge must still reach y = 0.4: the deck rises above its plane
// only toward the ridge corners, from an apex at `apexX` on the centreline
// (normalised x 0.1, ahead of the key bank, whose front edge is at -0.019).
const REGISTER_CHAMFER = { leg: 0.04, apexX: 0.2 };
// Textured-ABS grain: one seamless greyscale tile whose mean is
// REGISTER_ALBEDO_BASE (the vertex colour is divided by it, so the face tones
// above hold on average). TEXCOORD_1 is each face's own plane in source metres
// over `tile`, so the grain never stretches, and each face is offset so the
// repeat does not line up across a corner. The tile is periodic value noise on
// lattices that divide 256: cells of 8 and 16 px, about 1 and 2 cm in source
// metres, so the finest feature is still a full JPEG block wide and survives
// 4:2:0 at quality 50 as pure luma. There is no coarser octave: 4 cm cells
// read as blotches on the deck, not as moulded grain. `amplitude` is the byte
// swing either side of the base.
const REGISTER_ALBEDO_BASE = 190;
const REGISTER_GRAIN = {
  tile: 0.32,
  amplitude: 14,
  octaves: [
    { cell: 8, weight: 0.6 },
    { cell: 16, weight: 0.4 },
  ],
  seed: 0x5eed,
};

/** Linear value of an sRGB albedo byte. */
const registerAlbedoLinear = (byte) =>
  new THREE.Color().setRGB(byte / 255, byte / 255, byte / 255, THREE.SRGBColorSpace).r;

/** Moulded wedge: vertical customer face, deck sloping to the operator end.
 * Octagonal plan, chamfered ridge mitred with the front vertical cuts, square
 * deck-side and shoulder edges, and a deck that is the pinned plane behind an
 * apex on its centreline. 17 corners, 24 triangles, closed but for the floor.
 * Envelope and the deck plane under the keys unchanged, so the runtime key
 * bank, screen and receipt keep their seats.
 */
function buildRegisterHousing() {
  const { leg: c, apexX } = REGISTER_CHAMFER;
  const [F, B, Y0, Z] = [0.5, -0.5, -0.4, 0.4];
  const deckY = (x) => 0.04 + 0.36 * (x + 0.5);
  // Each face its own flat tone (linear for COLOR_0), divided by the albedo's
  // base so the product is the tone; walls darken linearly toward the counter,
  // which interpolates exactly across any triangulation of a planar face.
  const base = registerAlbedoLinear(REGISTER_ALBEDO_BASE);
  const tone = (island) => (p) => {
    const colour = new THREE.Color(REGISTER_TONES[island]).toArray().map((value) => value / base);
    if (island === 'deck') return colour;
    const t = Math.min(1, Math.max(0, (p[1] + 0.4) / 0.8));
    return colour.map((value) => value * (REGISTER_FOOT_DARKEN + (1 - REGISTER_FOOT_DARKEN) * t));
  };
  const positions = [],
    normals = [],
    uvs = [],
    grainUvs = [],
    colours = [],
    indices = [];
  let faceCount = 0;
  // Planar polygon, fan-triangulated from its first point (which must see every
  // edge); the rest are reversed if it faces away from `outward`. `axes` are two
  // in-plane directions for the island and grain UVs.
  const face = (input, island, outward, axes) => {
    let points = input;
    const normalOf = (pts) => {
      const a = new THREE.Vector3(...pts[0]);
      const sum = new THREE.Vector3();
      for (let i = 1; i < pts.length - 1; i++)
        sum.add(
          new THREE.Vector3()
            .subVectors(new THREE.Vector3(...pts[i]), a)
            .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...pts[i + 1]), a))
        );
      return sum.normalize();
    };
    let normal = normalOf(points);
    if (normal.dot(new THREE.Vector3(...outward)) < 0) {
      points = [points[0], ...points.slice(1).reverse()];
      normal = normalOf(points);
    }
    for (const p of points)
      if (Math.abs(new THREE.Vector3(...p).sub(new THREE.Vector3(...points[0])).dot(normal)) > 1e-6)
        throw Error('Register face is not planar: ' + island);
    const colourAt = tone(island);
    const projected = points.map((p) => axes.map((axis) => new THREE.Vector3(...p).dot(axis)));
    const min = [0, 1].map((k) => Math.min(...projected.map((p) => p[k])));
    const max = [0, 1].map((k) => Math.max(...projected.map((p) => p[k])));
    const [u0, v0, u1, v1] = REGISTER_ISLANDS[island].rect;
    const start = positions.length / 3;
    // Golden-ratio offsets, so no two faces start the grain tile at one place.
    const offset = [(faceCount * 0.618) % 1, (faceCount * 0.382) % 1];
    faceCount++;
    points.forEach((p, i) => {
      positions.push(...p);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(
        u0 + ((projected[i][0] - min[0]) / (max[0] - min[0])) * (u1 - u0),
        v0 + ((projected[i][1] - min[1]) / (max[1] - min[1])) * (v1 - v0)
      );
      grainUvs.push(
        offset[0] + projected[i][0] / REGISTER_GRAIN.tile,
        offset[1] + projected[i][1] / REGISTER_GRAIN.tile
      );
      colours.push(...colourAt(p));
    });
    for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1);
  };
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
  const X = v3(1, 0, 0),
    Zax = v3(0, 0, 1),
    negY = v3(0, -1, 0),
    negZ = v3(0, 0, -1);
  // Plan: an octagon, the rectangle with all four vertical edges cut at 45
  // degrees, leg `c` along each side wall and across each end face. Profile:
  // the ridge chamfer runs back `c` along the deck and drops `c` down the
  // customer face (45 degrees), mitred with the two front vertical cuts at the
  // wall-top corners M and at the face's top corners Fc. The operator end meets
  // the deck square (a 110-degree edge) between its two vertical cuts.
  const e = c; // ridge drop down the customer face
  const M = (s) => [F - c, 0.4, s * Z];
  const Fc = (s) => [F, 0.4 - e, s * (Z - c)];
  const R = (s) => [B + c, deckY(B + c), s * Z];
  const O = (s) => [B, deckY(B), s * (Z - c)];
  const P = [apexX, deckY(apexX), 0];
  const footF = (s) => [F, Y0, s * (Z - c)];
  const footM = (s) => [F - c, Y0, s * Z];
  const footR = (s) => [B + c, Y0, s * Z];
  const footO = (s) => [B, Y0, s * (Z - c)];
  face([M(-1), M(1), Fc(1), Fc(-1)], 'chamfer', [1, 1, 0], [Zax, v3(-c, e, 0)]);
  face([footF(-1), footF(1), Fc(1), Fc(-1)], 'front', [1, 0, 0], [negZ, negY]);
  face([footO(-1), footO(1), O(1), O(-1)], 'operator', [-1, 0, 0], [Zax, negY]);
  for (const s of [1, -1]) {
    face([footR(s), footM(s), M(s), R(s)], 'side', [0, 0, s], [X, negY]);
    face([footM(s), footF(s), Fc(s), M(s)], 'chamfer', [1, 0, s], [v3(1, 0, -s), negY]);
    face([footO(s), footR(s), R(s), O(s)], 'chamfer', [-1, 0, s], [v3(1, 0, s), negY]);
  }
  // The deck: one surface over the hexagon O-, O+, R+, M+, M-, R-, fanned from
  // the apex P on its centreline. O, R and P lie on the pinned plane, so the
  // three triangles behind P (which hold the key bank and every pinned ray)
  // are that plane exactly; only M, the full-height ridge corners, stand above
  // it, by 0.36c, and the three triangles that reach them rise by 1.6 to 2.8
  // degrees. One apex vertex buys that height for two fewer triangles than a
  // straight kink across the width, which is what pays for the rear vertical
  // cuts. The deck is shaded as one surface: its seven vertices are shared by
  // all six triangles, with one grain offset and one projection basis, so
  // neither the folds nor the grain show a seam. Walls and chamfers stay
  // flat-shaded.
  const deckPoints = [O(-1), O(1), R(1), M(1), M(-1), R(-1), P];
  const apex = 6;
  const deckTris = [0, 1, 2, 3, 4, 5].map((i) => [apex, i, (i + 1) % 6]);
  const planeNormal = v3(-0.36, 1, 0);
  for (const i of [0, 1, 2, 5, apex])
    if (Math.abs(deckPoints[i][1] - deckY(deckPoints[i][0])) > 1e-9)
      throw Error('Register deck corner off the pinned plane');
  {
    const vec = (i) => new THREE.Vector3(...deckPoints[i]);
    const weighted = deckPoints.map(() => new THREE.Vector3());
    for (const tri of deckTris) {
      let n = new THREE.Vector3().subVectors(vec(tri[1]), vec(tri[0]));
      n.cross(new THREE.Vector3().subVectors(vec(tri[2]), vec(tri[0]))).normalize();
      if (n.y < 0) {
        tri.reverse();
        n = n.negate();
      }
      if (n.angleTo(planeNormal) > (4 * Math.PI) / 180) throw Error('Register deck folds too far');
      for (let k = 0; k < 3; k++) {
        const here = vec(tri[k]);
        const a = vec(tri[(k + 1) % 3]).sub(here);
        const b = vec(tri[(k + 2) % 3]).sub(here);
        weighted[tri[k]].addScaledVector(n, a.angleTo(b));
      }
    }
    // Every corner on the plane keeps the plane's own normal, so the region
    // under the keys shades as the flat plane it is and both fold lines out of
    // P are continuous; only the ridge corners M take the angle-weighted mean
    // of the raised triangles meeting there.
    for (const i of [0, 1, 2, 5, apex]) weighted[i].copy(planeNormal);
    const axes = [Zax, v3(1, 0.36, 0)];
    const projected = deckPoints.map((p) => axes.map((axis) => new THREE.Vector3(...p).dot(axis)));
    const min = [0, 1].map((k) => Math.min(...projected.map((p) => p[k])));
    const max = [0, 1].map((k) => Math.max(...projected.map((p) => p[k])));
    const [u0, v0, u1, v1] = REGISTER_ISLANDS.deck.rect;
    const offset = [(faceCount * 0.618) % 1, (faceCount * 0.382) % 1];
    faceCount++;
    const start = positions.length / 3;
    const colour = tone('deck')(P);
    deckPoints.forEach((p, i) => {
      const n = weighted[i].normalize();
      positions.push(...p);
      normals.push(n.x, n.y, n.z);
      uvs.push(
        u0 + ((projected[i][0] - min[0]) / (max[0] - min[0])) * (u1 - u0),
        v0 + ((projected[i][1] - min[1]) / (max[1] - min[1])) * (v1 - v0)
      );
      grainUvs.push(
        offset[0] + projected[i][0] / REGISTER_GRAIN.tile,
        offset[1] + projected[i][1] / REGISTER_GRAIN.tile
      );
      colours.push(...colour);
    });
    for (const tri of deckTris) indices.push(...tri.map((i) => start + i));
  }
  // No floor: it stands on the counter top and is never seen.
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.setAttribute('uv1', new THREE.Float32BufferAttribute(grainUvs, 2));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  result.setIndex(indices);
  // Every face must point away from the centroid of the solid, and the solid
  // must be closed but for its floor: every undirected edge used exactly twice,
  // opposite ways, except the four edges of the floor outline.
  const key = (i) => [0, 1, 2].map((k) => Math.round(positions[i * 3 + k] * 1e5)).join(',');
  const edges = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, d] = [0, 1, 2].map((k) =>
      new THREE.Vector3().fromArray(positions, indices[t + k] * 3)
    );
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const centre = a.clone().add(b).add(d).divideScalar(3);
    if (n.dot(centre) <= 0) throw Error('Register face wound inward at triangle ' + t / 3);
    for (let k = 0; k < 3; k++) {
      const edge = `${key(indices[t + k])}>${key(indices[t + ((k + 1) % 3)])}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  const floorY = String(Math.round(Y0 * 1e5));
  let floorEdges = 0;
  for (const [edge, count] of edges) {
    const [a, b] = edge.split('>');
    if (count !== 1) throw Error('Register edge used twice one way at ' + edge);
    if (edges.get(`${b}>${a}`) === 1) continue;
    if (a.split(',')[1] !== floorY || b.split(',')[1] !== floorY)
      throw Error('Register not closed at ' + edge);
    floorEdges++;
  }
  if (floorEdges !== 8) throw Error('Register floor outline has ' + floorEdges + ' edges');
  return result;
}

// Coffee housing, authored in metres (x and z +-0.4, y 0 to 2.2). The 180
// render-vertex budget is 60 triangles; this build spends 54:
//   plan section: a rectangle whose four vertical edges are cut by flat facets,
//   100 mm along every side wall and across the back; the front pair is 50 mm
//   across the face, so the face plane keeps z +-0.35 for the runtime trim
//   strips. A 100 mm 45-degree top band matches them. Walls run to the floor.
//     top    14  band (four faces, four corner facets) and cap
//     walls  14  front facets, sides, back facets, back
//     front   8  face plane between the outline and the bay frame
//     frame   8  45-degree bevel ring from the mouth to the opening; its foot
//                is the sill
//     bay    10  rectangular box cut: level floor, square jambs, flat ceiling,
//                vertical back wall
// The floor is left open: it stands on the ground and no camera or player can
// see it, and every other edge is checked closed. The front face keeps x = 0.4
// over z +-0.35 and y 0 to 2.10, so the runtime trim strips (z +-0.34, y 0.16
// to 2.04), vent slats (y 0.12 to 0.34), buttons (y 1.21+) and label sit on it;
// the mouth keeps z +-0.30, y 0.40 to 1.18 on the face plane, and every
// runtime part of the bay (drip tray, dosing head, spouts, cup) stands in front
// of the face plane, so the pocket's depth is free.
// Panel structure is not geometry. Every wall carries metric UVs into a painted
// 256 atlas (albedo and roughness, the two textures the budget allows): a dark
// trim plinth band and cap band on every wall, the vertical facets and the top
// band in the same trim, so trim frames each graphite panel; an inset reveal
// groove round the panel on both sides and the back; a light satin steel bevel
// round the bay. A groove is a panel gap, so it is painted dark and rough; no
// highlight or bevel light is painted. Uniform finishes (trim, cap, steel, bay
// liner, bay floor) sample one point at the centre of their own 48 px block, so
// the JPEG's 16 px chroma blocks and the filter never carry a neighbour in.
// Vertex colour is a grey shading ramp only: darker toward the floor over the
// whole body and darker with depth in the bay, affine on every face.
const COFFEE = {
  half: 0.4,
  height: 2.2,
  face: 0.05, // front vertical facets: leg across the face
  side: 0.1, // every vertical facet's leg along the side walls (and across the back)
  top: 0.1, // top band, both legs
  mouth: { z: 0.3, y0: 0.4, y1: 1.18 }, // rectangle on the face plane
  frame: 0.04, // bevel ring: run inward and back, 45 degrees
  backX: 0.1, // the bay's back wall: 300 mm behind the face plane
  shade: { floor: 0.78, bayBack: 0.55 }, // linear multipliers at y = 0 and at the bay's back
  bands: { plinth: 0.1, cap: 1.98, groove: 0.016 }, // trim below plinth and above cap
  panel: { inset: 0.06, y0: 0.18, y1: 1.9 }, // reveal groove on sides and back
  finishes: {
    body: { colour: '#485153', roughness: 0.55 },
    trim: { colour: '#262b2d', roughness: 0.42 },
    groove: { colour: '#121516', roughness: 0.85 },
    steel: { colour: '#868c8e', roughness: 0.3 },
    liner: { colour: '#3a4143', roughness: 0.5 },
    floor: { colour: '#2b3133', roughness: 0.6 },
  },
};
// Atlas layout in texels at 256 (v measured down from the top row, as glTF
// does). Every wall island spans the wall's full height on the same rows, so a
// band lands at one row everywhere. Islands are filled past their mapped range
// with their edge content, and both samplers clamp, so nothing wraps.
const COFFEE_ATLAS = {
  size: 256,
  rows: [4, 252], // rows of y = wall top and y = 0
  panel: { px: [2, 102], s: 0.3, end: 105 }, // sides (s = x) and back (s = z)
  front: { px: [108, 228], s: 0.35, end: 231 }, // front face, s = z
  blocks: { px: 244, rows: 48, order: ['trim', 'body', 'steel', 'liner', 'floor'] },
};

/** Finish on a wall at lateral position s and height y (metres). */
function coffeeWallFinish(kind, s, y) {
  const { bands, panel, finishes: f } = COFFEE;
  const g = bands.groove;
  if (y < bands.plinth) return f.trim;
  if (y < bands.plinth + g) return f.groove;
  if (y >= bands.cap) return f.trim;
  if (y >= bands.cap - g) return f.groove;
  if (kind === 'panel') {
    const edge = COFFEE_ATLAS.panel.s - panel.inset;
    const a = Math.abs(s);
    if (y >= panel.y0 && y <= panel.y1 && a > edge - g && a <= edge) return f.groove;
    if (a <= edge && ((y >= panel.y0 && y < panel.y0 + g) || (y > panel.y1 - g && y <= panel.y1)))
      return f.groove;
  }
  return f.body;
}

/** Albedo and ORM (R occlusion 1, G roughness, B metal 0) atlases, each
 * texel the mean of 4 x 4 samples of the finish map, so grooves are filtered
 * rather than stair-stepped. Deterministic, so a re-run is byte-identical. */
function coffeeAtlas() {
  const { size, rows, panel, front, blocks } = COFFEE_ATLAS;
  const wallTop = COFFEE.height - COFFEE.top;
  const clamp = THREE.MathUtils.clamp;
  const bytes = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const finishAt = (x, y) => {
    if (x >= front.end) {
      const k = clamp(Math.floor(y / blocks.rows), 0, blocks.order.length - 1);
      return COFFEE.finishes[blocks.order[k]];
    }
    const island = x < panel.end ? panel : front;
    const s = clamp(
      -island.s + ((x - island.px[0]) / (island.px[1] - island.px[0])) * 2 * island.s,
      -island.s,
      island.s
    );
    const h = clamp((wallTop * (rows[1] - y)) / (rows[1] - rows[0]), 0, wallTop);
    return coffeeWallFinish(island === panel ? 'panel' : 'front', s, h);
  };
  const sub = 4;
  const albedo = new Float64Array(size * size * 3);
  const rough = new Float64Array(size * size);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++)
      for (let j = 0; j < sub; j++)
        for (let i = 0; i < sub; i++) {
          const f = finishAt(px + (i + 0.5) / sub, py + (j + 0.5) / sub);
          const rgb = bytes(f.colour);
          const t = py * size + px;
          for (let c = 0; c < 3; c++) albedo[t * 3 + c] += rgb[c] / (sub * sub);
          rough[t] += f.roughness / (sub * sub);
        }
  return {
    albedo: encodeRgbPng(size, (x, y) =>
      [0, 1, 2].map((c) => Math.round(albedo[(y * size + x) * 3 + c]))
    ),
    orm: encodeRgbPng(size, (x, y) => [255, Math.round(rough[y * size + x] * 255), 0]),
  };
}

/** Coffee housing. Every planar face is its own set of vertices with a flat
 * normal; faces are wound from a stated outward direction and checked planar,
 * and the solid is checked closed (every edge used twice, opposite ways) except
 * along the floor, with positive volume. */
function buildCoffeeHousing() {
  const {
    half: h,
    height: H,
    face: cf,
    side: cs,
    top: t,
    mouth: m,
    frame: fr,
    backX,
    shade,
  } = COFFEE;
  const { size, rows, blocks } = COFFEE_ATLAS;
  const wallTop = H - t;
  const positions = [],
    uvs = [],
    colours = [],
    normals = [],
    indices = [];
  // UV makers: a wall island at lateral coordinate s, or one block's centre.
  const island = (which, lateral) => (p) => {
    const isl = COFFEE_ATLAS[which];
    const s = lateral(p);
    return [
      (isl.px[0] + ((s + isl.s) / (2 * isl.s)) * (isl.px[1] - isl.px[0])) / size,
      (rows[1] - (p.y / wallTop) * (rows[1] - rows[0])) / size,
    ];
  };
  const block = (name) => {
    const k = blocks.order.indexOf(name);
    if (k < 0) throw Error('Unknown coffee finish block ' + name);
    const uv = [blocks.px / size, (blocks.rows * k + blocks.rows / 2) / size];
    return () => uv;
  };
  // Linear shade at a point: a floor-to-top ramp everywhere, and inside the
  // bay a further ramp from the face plane to the back wall.
  const shadeAt = (p, bay) =>
    (shade.floor + (1 - shade.floor) * (p.y / H)) *
    (bay ? 1 - (1 - shade.bayBack) * ((h - p.x) / (h - backX)) : 1);
  // Planar polygon, fan-triangulated from its first point, which must see
  // every edge; reversed if it faces `outward`'s opposite.
  const face = (points, outward, uvOf, { bay = false } = {}) => {
    let pts = points.map((p) => new THREE.Vector3(...p));
    const normal = new THREE.Vector3()
      .subVectors(pts[1], pts[0])
      .cross(new THREE.Vector3().subVectors(pts[2], pts[0]))
      .normalize();
    if (normal.dot(new THREE.Vector3(...outward)) < 0) {
      pts = pts.reverse();
      normal.negate();
    }
    if (normal.dot(new THREE.Vector3(...outward).normalize()) < 0.3)
      throw Error('Coffee face normal disagrees with its stated direction');
    for (const p of pts)
      if (Math.abs(new THREE.Vector3().subVectors(p, pts[0]).dot(normal)) > 1e-6)
        throw Error('Coffee face is not planar');
    const start = positions.length / 3;
    for (const p of pts) {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
      uvs.push(...uvOf(p));
      const grey = shadeAt(p, bay);
      colours.push(grey, grey, grey);
    }
    for (let i = 1; i < pts.length - 1; i++) indices.push(start, start + i, start + i + 1);
  };
  // The traced plan section in (x, z), anticlockwise from above. Edge 0 is
  // the front (+X) face, 1 and 7 the front facets, 2 and 6 the sides, 3 and 5
  // the back facets, 4 the back.
  const ring = [
    [h, -(h - cf)],
    [h, h - cf],
    [h - cs, h],
    [-(h - cs), h],
    [-h, h - cs],
    [-h, -(h - cs)],
    [-(h - cs), -h],
    [h - cs, -h],
  ];
  // Outward normal of ring edge i (anticlockwise seen from +Y).
  const edgeOut = (i) => {
    const [x0, z0] = ring[i],
      [x1, z1] = ring[(i + 1) % ring.length];
    const d2 = new THREE.Vector2(x1 - x0, z1 - z0).normalize();
    return [d2.y, 0, -d2.x];
  };
  // Top band, in trim: each ring vertex goes to the nearest corner of the
  // inset cap square, so a facet edge closes in a triangle and every other
  // edge in a trapezoid, planar because its two long edges are parallel.
  const s = h - t;
  for (let i = 0; i < ring.length; i++) {
    const [x0, z0] = ring[i],
      [x1, z1] = ring[(i + 1) % ring.length];
    const out = edgeOut(i);
    const pts = [
      [x0, wallTop, z0],
      [x1, wallTop, z1],
      [Math.sign(x1) * s, H, Math.sign(z1) * s],
    ];
    if (Math.sign(x0) !== Math.sign(x1) || Math.sign(z0) !== Math.sign(z1))
      pts.push([Math.sign(x0) * s, H, Math.sign(z0) * s]);
    face(pts, [out[0], 1, out[2]], block('trim'));
  }
  face(
    [
      [s, H, -s],
      [s, H, s],
      [-s, H, s],
      [-s, H, -s],
    ],
    [0, 1, 0],
    block('body')
  );
  // Walls, floor to shoulder: facets in trim, sides and back as panels.
  const wallUv = {
    1: block('trim'),
    3: block('trim'),
    5: block('trim'),
    7: block('trim'),
    2: island('panel', (p) => p.x),
    6: island('panel', (p) => p.x),
    4: island('panel', (p) => p.z),
  };
  for (let i = 1; i < ring.length; i++) {
    const [x0, z0] = ring[i],
      [x1, z1] = ring[(i + 1) % ring.length];
    face(
      [
        [x0, 0, z0],
        [x1, 0, z1],
        [x1, wallTop, z1],
        [x0, wallTop, z0],
      ],
      edgeOut(i),
      wallUv[i]
    );
  }
  // Front face: four trapezoids between the outline and the mouth rectangle,
  // each meeting its neighbours on an outline-corner-to-mouth-corner diagonal,
  // so no edge ends partway along another. Points are (z, y) on x = h,
  // anticlockwise seen from +X.
  const fz = h - cf;
  const rect = (z, y0, y1) => [
    [-z, y0],
    [z, y0],
    [z, y1],
    [-z, y1],
  ];
  const outline = rect(fz, 0, wallTop);
  const mouth = rect(m.z, m.y0, m.y1);
  const opening = rect(m.z - fr, m.y0 + fr, m.y1 - fr);
  const xi = h - fr;
  const at = (x, [z, y]) => [x, y, z];
  const frontUv = island('front', (p) => p.z);
  for (let k = 0; k < 4; k++)
    face(
      [at(h, outline[k]), at(h, outline[(k + 1) % 4]), at(h, mouth[(k + 1) % 4]), at(h, mouth[k])],
      [1, 0, 0],
      frontUv
    );
  // Frame: a 45-degree bevel ring in satin steel from the mouth on the face
  // plane to the opening, fr back and fr in; the bottom trapezoid is the sill.
  // Each trapezoid's outward direction is +X tipped toward the opening's centre.
  const bevelOut = [
    [1, 1, 0], // sill, faces up
    [1, 0, -1], // +Z jamb, faces -Z
    [1, -1, 0], // head, faces down
    [1, 0, 1], // -Z jamb, faces +Z
  ];
  for (let k = 0; k < 4; k++)
    face(
      [
        at(h, mouth[k]),
        at(h, mouth[(k + 1) % 4]),
        at(xi, opening[(k + 1) % 4]),
        at(xi, opening[k]),
      ],
      bevelOut[k],
      block('steel')
    );
  // Bay: a rectangular box cut behind the opening, square to the face.
  const zi = m.z - fr,
    yb = m.y0 + fr,
    yt = m.y1 - fr;
  face(
    [
      [xi, yb, -zi],
      [xi, yb, zi],
      [backX, yb, zi],
      [backX, yb, -zi],
    ],
    [0, 1, 0],
    block('floor'),
    { bay: true }
  );
  face(
    [
      [xi, yt, -zi],
      [xi, yt, zi],
      [backX, yt, zi],
      [backX, yt, -zi],
    ],
    [0, -1, 0],
    block('liner'),
    { bay: true }
  );
  for (const side of [-1, 1])
    face(
      [
        [xi, yb, side * zi],
        [backX, yb, side * zi],
        [backX, yt, side * zi],
        [xi, yt, side * zi],
      ],
      [0, 0, -side],
      block('liner'),
      { bay: true }
    );
  face(
    [
      [backX, yb, -zi],
      [backX, yb, zi],
      [backX, yt, zi],
      [backX, yt, -zi],
    ],
    [1, 0, 0],
    block('liner'),
    { bay: true }
  );
  if (indices.length > 180) throw Error('Coffee housing over its 60-triangle budget');
  // Closed except along the floor: every undirected edge used exactly twice,
  // in opposite directions, unless both its ends stand on y = 0.
  const key = (i) => [0, 1, 2].map((k) => Math.round(positions[i * 3 + k] * 1e5)).join(',');
  const edges = new Map();
  let volume = 0;
  for (let f = 0; f < indices.length; f += 3) {
    const tri = [0, 1, 2].map((k) => indices[f + k]);
    for (let k = 0; k < 3; k++) {
      const e = `${key(tri[k])}>${key(tri[(k + 1) % 3])}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
    // The open floor lies in y = 0 through the origin, so it adds nothing here.
    const [a, p, q] = tri.map((i) => new THREE.Vector3().fromArray(positions, i * 3));
    volume += a.dot(new THREE.Vector3().crossVectors(p, q)) / 6;
  }
  const onFloor = (k) => Number(k.split(',')[1]) === 0;
  for (const [e, n] of edges) {
    const [a, p] = e.split('>');
    const back = edges.get(`${p}>${a}`);
    if (n === 1 && back === 1) continue;
    if (n === 1 && back === undefined && onFloor(a) && onFloor(p)) continue;
    throw Error('Coffee housing not closed at ' + e);
  }
  if (!(volume > 0)) throw Error('Coffee housing wound inside out');
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  result.setIndex(indices);
  return result;
}

/** Minimal 8-bit RGB PNG writer; pixel(x, y) returns [r, g, b] bytes. */
function encodeRgbPng(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y), y * (size * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  );
}

/** Seamless greyscale textured-ABS grain tile for TEXCOORD_1: periodic value
 * noise, smoothstep-interpolated on lattices that wrap at the tile edge, so the
 * repeat has no seam. Normalised to zero mean and unit peak, then scaled to
 * REGISTER_GRAIN.amplitude bytes about REGISTER_ALBEDO_BASE. Seeded, so a
 * re-run is byte-identical. */
function registerGrainPng(grain = REGISTER_GRAIN, base = REGISTER_ALBEDO_BASE) {
  const size = REGISTER_ORM_SIZE;
  let state = grain.seed >>> 0;
  const random = () => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const field = new Float64Array(size * size);
  for (const { cell, weight } of grain.octaves) {
    const n = size / cell;
    if (!Number.isInteger(n)) throw Error('Register grain lattice must divide the tile');
    const lattice = Array.from({ length: n * n }, () => random() * 2 - 1);
    const at = (i, j) => lattice[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const fx = (x + 0.5) / cell - 0.5,
          fy = (y + 0.5) / cell - 0.5;
        const i = Math.floor(fx),
          j = Math.floor(fy);
        const tx = smooth(fx - i),
          ty = smooth(fy - j);
        const top = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
        const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
        field[y * size + x] += weight * (top + (bottom - top) * ty);
      }
  }
  const mean = field.reduce((sum, value) => sum + value, 0) / field.length;
  const peak = field.reduce((max, value) => Math.max(max, Math.abs(value - mean)), 0) || 1;
  return encodeRgbPng(size, (x, y) => {
    const value = (field[y * size + x] - mean) / peak;
    const byte = Math.round(THREE.MathUtils.clamp(base + grain.amplitude * value, 0, 255));
    return [byte, byte, byte];
  });
}

/** ORM (R occlusion 1, G roughness, B metal 0) matching REGISTER_ISLANDS. One
 * value per island: a sub-level drift quantises to 8-bit steps that read as
 * stripes in the highlight, so value variation is left to the vertex colours. */
function registerOrmPng() {
  const size = REGISTER_ORM_SIZE;
  // Each island's value reaches half-way into its gap, past any filter footprint.
  const pad = 4 / size;
  return encodeRgbPng(size, (x, y) => {
    const u = (x + 0.5) / size,
      v = (y + 0.5) / size;
    let roughness = 0.55;
    for (const { rect, roughness: value } of Object.values(REGISTER_ISLANDS)) {
      const [u0, v0, u1, v1] = rect;
      if (u >= u0 - pad && u <= u1 + pad && v >= v0 - pad && v <= v1 + pad) roughness = value;
    }
    return [255, Math.round(Math.min(1, Math.max(0, roughness)) * 255), 0];
  });
}

const report = [];
for (const [slug, expected] of Object.entries(inputs)) {
  if (only && slug !== only) continue;
  const source = `assets/source/models/world/${slug}-crafted-surface.glb`;
  const bytes = await readFile(source);
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw Error('Pinned retail input changed: ' + slug);
  const doc = await io.readBinary(bytes),
    primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  let geometry;
  if (slug === 'station-register') {
    geometry = buildRegisterHousing();
    // Taken from the material slots, not by name: "normal" contains "orm".
    const orm = primitive.getMaterial()?.getMetallicRoughnessTexture();
    if (!orm) throw Error('Register roughness map missing');
    orm.setImage(registerOrmPng()).setMimeType('image/png');
    // The normal slot's texture becomes the grain albedo: same texture count,
    // and the material keeps flat geometric normals. It reads TEXCOORD_1, the
    // metric per-face UVs, and repeats.
    const material = primitive.getMaterial();
    const albedo = material?.getNormalTexture();
    if (!albedo || albedo === orm) throw Error('Register normal map missing');
    material.setNormalTexture(null);
    material.setBaseColorTexture(albedo).setBaseColorFactor([1, 1, 1, 1]);
    material
      .getBaseColorTextureInfo()
      .setTexCoord(1)
      .setWrapS(TextureInfo.WrapMode.REPEAT)
      .setWrapT(TextureInfo.WrapMode.REPEAT);
    albedo
      .setName('station-register-grain')
      .setURI('')
      .setImage(registerGrainPng())
      .setMimeType('image/png');
  } else {
    // A faceted housing with a framed box-cut bay replaces the cuboid and its
    // solid, side-facing baked cup. The real cup is owned by live dressing.
    geometry = buildCoffeeHousing();
    const material = primitive.getMaterial();
    const orm = material?.getMetallicRoughnessTexture();
    const normalMap = material?.getNormalTexture();
    if (!orm || !normalMap || normalMap === orm) throw Error('Coffee housing maps missing');
    // The painted panel atlas: roughness in the ORM slot, and the normal slot's
    // texture becomes the albedo (still two textures). Geometric normals stay
    // flat per face; no normal map.
    const atlas = coffeeAtlas();
    orm.setImage(atlas.orm).setMimeType('image/png');
    material.setNormalTexture(null);
    material.setBaseColorTexture(normalMap).setBaseColorFactor([1, 1, 1, 1]);
    normalMap
      .setName('station-coffee-machine-albedo')
      .setURI('')
      .setImage(atlas.albedo)
      .setMimeType('image/png');
    for (const info of [
      material.getBaseColorTextureInfo(),
      material.getMetallicRoughnessTextureInfo(),
    ])
      info
        .setTexCoord(0)
        .setWrapS(TextureInfo.WrapMode.CLAMP_TO_EDGE)
        .setWrapT(TextureInfo.WrapMode.CLAMP_TO_EDGE);
  }
  const count = geometry.getAttribute('position').count;
  // The manifest budget is render vertices: index count when indexed.
  const rendered = geometry.index ? geometry.index.count : count;
  if (rendered > (slug === 'station-register' ? 72 : 180))
    throw Error('Retail vertex budget exceeded');
  const buffer = doc.getRoot().listBuffers()[0];
  for (const [name, semantic, type] of [
    ['position', 'POSITION', 'VEC3'],
    ['normal', 'NORMAL', 'VEC3'],
    ['uv', 'TEXCOORD_0', 'VEC2'],
    ['uv1', 'TEXCOORD_1', 'VEC2'],
    ['color', 'COLOR_0', 'VEC3'],
  ]) {
    // Only the register carries the second (grain) UV set.
    if (!geometry.getAttribute(name)) continue;
    const old = primitive.getAttribute(semantic),
      array = new Float32Array(geometry.getAttribute(name).array);
    primitive.setAttribute(
      semantic,
      doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
    );
    old?.dispose();
  }
  const oldIndices = primitive.getIndices();
  primitive.setIndices(
    doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(
        new Uint16Array(
          geometry.index ? geometry.index.array : Array.from({ length: count }, (_, i) => i)
        )
      )
      .setBuffer(buffer)
  );
  oldIndices?.dispose();
  const output = `assets/source/models/world/${slug}-crafted-retail.glb`;
  await io.write(output, doc);
  report.push({
    slug,
    source,
    sourceSha256: expected,
    output,
    vertices: count,
    triangles: primitive.getIndices().getCount() / 3,
  });
  geometry.dispose();
}
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
