/** Two fixed final-stage derivatives. Run after ordinary normalization/indexing.
 * No IO, generic sizing change or caller-selected face list. Final outputs are pinned.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
export const hash = (b) => createHash('sha256').update(b).digest('hex');
export const FIXTURES = Object.freeze({
  intercom: Object.freeze({
    id: 'world-yard-intercom-body',
    output: 'd7af4d4b30ae0020d98c60da09c17bcf576b58f3f1ca1262fa6c73c19f6199ae',
    fileBytes: 35016,
    // v1 (casing lower-edge fit only). It is still produced, then rebuilt below.
    fitOutput: 'e26dd2a6ace5a58547dcf26f106be974c2504630ac57b590626ef201367324bf',
    fitFileBytes: 37240,
    // v6 head (round 5): accepted as the current delivery while v7 is installed.
    previousOutput: '67d75a8b60e4bb26761050c856f7a8b4dc88677bc57ffb42debdfdf709b384a9',
    asset: 'yardIntercomBody',
    slug: 'yard-intercom-body',
    baseline: 'ab8af7fa35b1ebf9d634dee2e223267b74b6f21a5e2449df8c52c8c34f5561be',
    provider: 'cb76edf2c03cf87aca09fb85f6afb2b9919c4f3f546cc023750ecaf10b95bfc2',
    prepared: 'bd4f7f67e972cbfe594dc0c4e03b6418fbec9f553e332652b67af3cec7987d6a',
    offset: [0, 0, 0.052500004],
    vertices: 305,
    triangles: 170,
    box: [
      [-0.15, 1.1, 0.005],
      [0.15, 1.5, 0.155],
    ],
    axis: 1,
    bottom: 1.0325,
    delta: -0.0675,
    method: 'intercom-casing-lower-edge-final-stage-v1',
    // v2 head: the v1 casing, rebuilt in place. Metres in the IntercomCallBox
    // group frame (GLB offset included), so they read against TruckBay.tsx.
    rebuildMethod: 'intercom-plan-section-chamfered-shell-hood-cap-control-panel-dome-grille-v7',
    head: Object.freeze({
      // v7: the housing is no longer a side profile lofted across x (v4) or two
      // nested shells (v5). It is skinned through octagonal PLAN sections (x, z):
      // each station is a trapezoid narrower at the back with its four vertical
      // edges chamfered, so every vertical edge of the box is bevelled, the sides
      // converge toward the back and the back leans in toward the top. A
      // separate hood cap, one octagonal slab wider than the body all round,
      // sits on it with a drip overhang and a top that falls to the back.
      x: 0.15,
      bottom: 1.0325,
      top: 1.55,
      back: 0.005, // the v1 casing back, used only to read the v1 parts
      // The face sits at z 0.150: the runtime red button's back (z 0.15) seats on it.
      face: 0.15,
      // Body stations: [y, front half-width, back half-width, front z, back z, chamfer].
      body: Object.freeze([
        Object.freeze([1.0325, 0.137, 0.127, 0.15, 0.016, 0.01]),
        Object.freeze([1.541, 0.14, 0.13, 0.15, 0.002, 0.01]),
      ]),
      // Hood: one plan section, a flat underside at y 1.538 (3 mm below the body
      // top, so the body enters it) and a top falling 6 mm from front to back.
      hood: Object.freeze({
        plan: Object.freeze([0.15, 0.14, 0.162, -0.008, 0.016]),
        bottom: 1.538,
        topFront: 1.55,
        topBack: 1.544,
        tint: 0.08,
      }),
      // v7 face: a raised control sub-panel (a 3 mm frustum in its own mid tone)
      // carries the keypad and the runtime red call button (y 1.2, r 0.03, back
      // at z 0.15, so it seats 3 mm into the panel); the keys stand on it.
      panel: Object.freeze({
        x: 0.068,
        bottom: 1.042,
        top: 1.246,
        height: 0.003,
        bevel: 0.003,
        tint: 0.25,
      }),
      // Keys: nine free-standing domed buttons on the panel, 30 mm square at a
      // 36 mm pitch, 8 mm high. Shared apex and base vertices with sloped normals
      // shade each one as a pillow; the apex is painted light.
      keys: Object.freeze({
        x: [-0.036, 0, 0.036],
        y: [1.069, 1.105, 1.141],
        half: 0.015,
        height: 0.008,
        apexLift: 0.45, // apex colour: post slate lifted this far toward white
      }),
      // Grille: a 24-sided domed cap, one fan from a light bezel ring on the face
      // to a dark raised centre, with sphere-like normals leaning out at the rim.
      // The runtime LED (0.08, 1.40, z 0.16) stays clear of the rim.
      grille: Object.freeze({
        y: 1.35,
        sides: 24,
        outer: 0.086,
        rise: 0.009,
        rimLean: 0.9, // tangent of the rim normal's lean away from +z
        rimLift: 0.25,
      }),
      // Label: a raised sign plate tucked under the hood. Its top edge meets the
      // hood underside (so it needs no top bevel); its bottom and side bevels are
      // a brushed-steel frame. The yellow field is centred on the runtime 'CALL
      // FOR ENTRY' line (y 1.52, middle-anchored, fontSize 0.025).
      label: Object.freeze({
        x: 0.124,
        bottom: 1.502,
        top: 1.538,
        height: 0.006,
        bevelX: 0.008,
        bevelY: 0.005,
        frameLift: 0.3,
      }),
      // Bracket: a flared steel saddle from the post to the full body depth; its
      // top ring sits 3.5 mm inside the body underside, its bottom ring round the
      // post. [half-width x, y, back z, front z].
      bracket: Object.freeze({
        top: Object.freeze([0.105, 1.036, 0.024, 0.142]),
        bottom: Object.freeze([0.056, 0.93, 0.014, 0.126]),
      }),
      // Pedestal: a round 12-sided shaft under the body, entering it 17.5 mm.
      // It rises from a 225 mm square bolt-down base plate (a drafted frustum);
      // the plate's back edge holds the old post's -0.06 envelope edge.
      post: Object.freeze({
        x: 0,
        z: 0.07,
        radius: 0.05,
        sides: 12,
        foot: 0.004, // shaft starts inside the plate
        top: 1.05,
        // One continuous strip from a single original post UV island, mirrored at
        // +x and -x so it closes with no wrap seam. v keeps the original 1.5 m scale.
        u: [0.01, 0.054],
        v: [0.0037, 0.9926 / 1.5],
      }),
      plate: Object.freeze({
        x: 0.1125,
        back: -0.06,
        front: 0.165,
        top: 0.012,
        draft: 0.006,
        // A corner of the original post island, near its foot.
        u: [0.0084, 0.0318],
        v: [0.0037, 0.1],
      }),
    }),
  }),
  tire: Object.freeze({
    id: 'world-yard-tire-inspection-body',
    output: '3b22ac1ab6e21375405f5c54bb663e6fb54d5b6d7f5b34901560c33e274db5f0',
    fileBytes: 53352,
    // v1 (sign-board front mount only). It is still produced, then the deck is rebuilt.
    fitOutput: 'ae5c06f33d8aafa759a698f5b6c16abbb89a348c8225db85302c3cd5592297dd',
    fitFileBytes: 51768,
    asset: 'yardTireInspectionBody',
    slug: 'yard-tire-inspection-body',
    baseline: '758f445ebaa320643f524a64b50f524c476fd51009cd043ab4df6d651440b497',
    provider: '35d53092ea3fe8b51a77fce5883bc52c5bd352f270bf81f5cf1099f39e487ed2',
    prepared: '5e99106f72225e571c33af65f3671c2f377a64b9c5314c1691ba576fbbcfc18f',
    offset: [0.149999976, -4.8e-8, 0],
    vertices: 548,
    triangles: 344,
    box: [
      [2.4, 2, -0.025],
      [3.6, 2.6, 0.025],
    ],
    axis: 2,
    delta: 0.06,
    method: 'tire-board-front-mount-final-stage-v1',
    // v2 deck: the v1 floor plate and seven tread strips, rebuilt in place. Metres
    // in the TireInspectionArea group frame (GLB offset included), so they read
    // against TruckBay.tsx. Every other part is copied byte for byte.
    rebuildMethod:
      'tire-deck-v2-cabinet-plinth-octagon-body-hip-canopy-panel-door-v3-swept-hoop-rails-v4-lathed-sign-post-framed-board-ridge-treads-v5-hip-frustum-lane-wear-plate-v6',
    // v5 sign: the v1 octagonal post (a bare cylinder) and the board (a plain
    // 50 mm slab) are rebuilt as one mounted assembly. The post is lathed from a
    // traced side profile: a square base plate whose top rises as a cast
    // pyramid into the shaft (the collar), a hexagonal shaft with smooth radial
    // normals, and a pyramid cap. The board is lofted: one section (back, outer
    // edge, rim, inner slope down to the face) swept round its rectangle with
    // mitred corners, so it has a grey aluminium edge, a raised rim and a white
    // bevelled border. Two triangular clamp brackets join the board back to the
    // post, which passes through them. Post x, post z, post top, board extents
    // and the board face are read from the v1 parts.
    sign: Object.freeze({
      // The v1 parts, used only to find their triangles.
      post: Object.freeze({ x: 3.0, halfWidth: 0.041, top: 2.4 }),
      shaft: Object.freeze({ radius: 0.048, sides: 6 }),
      // Square base plate on the ground; its top is a pyramid whose apex sits
      // inside the shaft, so it shows as a flared collar about 55 mm up the post.
      base: Object.freeze({ half: 0.12, thick: 0.016, rise: 0.09 }),
      cap: Object.freeze({ rise: 0.04 }),
      // Board section: back at the v1 back, outer edge up to the rim, then an
      // inner slope `inset` wide down to the v1 face (where the runtime text sits).
      board: Object.freeze({ rim: 0.1, inset: 0.05 }),
      // Clamp brackets: triangular prisms behind the board, seated `seat` into it.
      brackets: Object.freeze({
        y: Object.freeze([2.12, 2.48]),
        height: 0.09,
        half: 0.16,
        back: -0.085,
        seat: 0.004,
      }),
      // Planar charts inside the v1 post chart, at its texel density. The shaft's
      // cylindrical chart is the v1 post side chart, read from its records.
      uv: Object.freeze({ u0: 0.336, v0: 0.115, perMetre: 0.084 }),
      // Linear vertex colours: the v1 slate post (0.127, 0.175, 0.258) runs from
      // a grimy foot to a sun-faded head; the board keeps its v1 blue, faded at
      // the head, inside a white border that is dirtier along the bottom.
      colour: Object.freeze({
        shaftFoot: Object.freeze([0.07, 0.09, 0.125]),
        shaftTop: Object.freeze([0.17, 0.22, 0.3]),
        plate: Object.freeze([0.05, 0.052, 0.055]),
        plateTop: Object.freeze([0.11, 0.115, 0.12]),
        cap: Object.freeze([0.2, 0.25, 0.32]),
        panelFoot: Object.freeze([0.008, 0.034, 0.3]),
        panelHead: Object.freeze([0.02, 0.07, 0.48]),
        border: Object.freeze([0.8, 0.8, 0.76]),
        borderFoot: Object.freeze([0.5, 0.5, 0.46]),
        edge: Object.freeze([0.42, 0.44, 0.46]),
        back: Object.freeze([0.11, 0.115, 0.125]),
        bracket: Object.freeze([0.4, 0.41, 0.42]),
        bracketUnder: Object.freeze([0.16, 0.165, 0.17]),
      }),
    }),
    // v4 rails: each side's v1 rail and two end posts (three unjoined cylinders,
    // the rail overshooting the posts) become ONE tube swept along a traced
    // profile path: up the post, a mitred bend, along the rail, a mitred bend and
    // down the far post. A hexagonal section with smooth radial normals, so it
    // shades round. Post x, post z and rail height are read from the v1 parts.
    rails: Object.freeze({
      // The v1 parts, used only to find their triangles (|x| about 2.2).
      box: Object.freeze({ x: 2.2, halfWidth: 0.041, top: 1.031, z: 3.541 }),
      radius: 0.055, // 110 mm pipe (v1: 80 mm posts, 60 mm rail)
      sides: 6,
      bend: 0.16, // tangent length of each 90 degree bend, cut as one 45 degree mitre
      // Flared foot under each post: a hexagonal cone, its base on the ground and
      // its apex inside the tube, so it shows as a collar about 45 mm high.
      foot: Object.freeze({ radius: 0.13, apex: 0.08 }),
      // Re-laid UVs: one cylindrical chart per hoop inside the v1 post chart.
      uv: Object.freeze({ u0: 0.4, du: 0.2, v0: 0.17, dv: 0.14, foot: 0.05 }),
      // Linear vertex colours: grimy foot, sun-faded top, dirty underside, and a
      // tyre-scuffed lane side on the posts.
      colour: Object.freeze({
        paint: Object.freeze([0.965, 0.521, 0.018]),
        top: Object.freeze([1.0, 0.66, 0.085]),
        under: Object.freeze([0.56, 0.27, 0.012]),
        grime: Object.freeze([0.26, 0.135, 0.016]),
        grimeHeight: 0.5,
        scuff: Object.freeze([0.42, 0.25, 0.05]),
        foot: Object.freeze([0.07, 0.072, 0.07]),
        footTop: Object.freeze([0.2, 0.2, 0.19]),
      }),
    }),
    deck: Object.freeze({
      // v6 plate: traced from its plan and side profile as a hipped frustum, not
      // a section run along z. The base ring is the v1 plate (x +-2.0, z +-4.0,
      // on the ground); the top ring is inset by `bevel` on the long sides and
      // by the ramp run on the ends, at the v1 top. The long-side bevels and the
      // end ramps are planar faces that meet at four mitred hip lines. The top
      // and both ramps are lofted across lane stations (centre, wheel track,
      // edge) that carry the wear in vertex colour and in re-laid UVs. No bottom
      // face (it sits on the ground). x, top and z are the v1 ownership keys.
      plate: Object.freeze({
        x: 2.0,
        top: 0.1,
        z: 4.0,
        // Full height from -rampTop to +rampTop, ramping to a toe on the ground
        // at the v1 ends, so the length is unchanged.
        rampTop: 3.4,
        // Long-side bevel run: 0.18 m across for the 0.1 m rise (about 29
        // degrees), so it reads at eye level (about 4 cm a pixel at 10 m).
        bevel: 0.18,
        // Wheel-track centre line, |x|. Lanes: centre 0, track, edge.
        track: 1.0,
      }),
      // Re-laid plate UVs: a wear chart on the top band of the ORM map, where
      // roughness (G) falls from about 0.76 at u 0.16 through 0.51 at u 0.5 to
      // 0.29 at u 0.84. u is the wear (polished tyre track, dusty edge), v runs
      // along z with a small x term so mirrored vertices never share a UV.
      uv: Object.freeze({
        rough: 0.16,
        centre: 0.5,
        polished: 0.84,
        toeTrack: 0.62,
        v0: 0.012,
        dz: 0.035,
        dx: 0.01,
      }),
      // Treads (v5 shape, v6 height): hip-ended ridge strips standing on the
      // plate top, two long slopes to a ridge and a sloped triangle at each end.
      // Their base sits 1 mm inside the plate. v6 raises the ridge to 51 mm
      // proud (v5: 26 mm, under a pixel at eye level) and ends them inside the
      // top ring, clear of the long-side bevels.
      treads: Object.freeze({
        z: Object.freeze([-3, -2, -1, 0, 1, 2, 3]),
        x: 1.79,
        base: 0.099,
        top: 0.15,
        half: 0.08,
        hip: 0.06,
      }),
      // Linear vertex colours. The blue-steel plate (v1 0.038, 0.053, 0.082) now
      // carries wear in lanes: rubber-darkened wheel tracks, a cleaner centre
      // strip, dusty edges, a bevel worn bright along its top and grimy at the
      // foot, and yard dirt at the ramp toes. Adjacent bands differ by at least
      // 2:1. Treads are black rubber with dust collected at their foot.
      colour: Object.freeze({
        centre: Object.freeze([0.052, 0.062, 0.082]),
        track: Object.freeze([0.02, 0.023, 0.029]),
        edge: Object.freeze([0.105, 0.104, 0.1]),
        bevelTop: Object.freeze([0.2, 0.21, 0.225]),
        bevelFoot: Object.freeze([0.03, 0.029, 0.026]),
        toe: Object.freeze([0.078, 0.071, 0.06]),
        toeTrack: Object.freeze([0.028, 0.029, 0.032]),
        treadTop: Object.freeze([0.006, 0.0065, 0.0075]),
        treadFoot: Object.freeze([0.04, 0.041, 0.043]),
      }),
    }),
    // v3 cabinet: the v1 0.6 x 1.2 x 0.4 m red box, rebuilt in place. The door
    // faces +z, the same way as the sign board. Plan coordinates are insets from
    // the v1 box, read from its vertices; heights are metres above the ground.
    cabinet: Object.freeze({
      // The v1 box, used only to find its twelve triangles.
      box: Object.freeze([Object.freeze([-3.3, 0, -0.2]), Object.freeze([-2.7, 1.2, 0.2])]),
      // Body: an octagonal plan prism (every vertical edge chamfered), inset from
      // the v1 box. [x inset, back z inset, front z inset, chamfer].
      body: Object.freeze({ x: 0.02, back: 0.015, front: 0.015, chamfer: 0.018 }),
      // Plinth: a drafted octagonal frustum under the body. Its foot is the body
      // plan grown by `draft`, so it reaches the v1 x -3.3 envelope edge.
      plinth: Object.freeze({ top: 0.08, draft: 0.02, chamfer: 0.03 }),
      // Roof: a rain canopy. Flat underside at the body top, a vertical fascia,
      // then a shallow hip to a ridge along x at the v1 top (1.2 m).
      roof: Object.freeze({
        bottom: 1.12,
        fascia: 1.16,
        back: -0.015, // overhang beyond the v1 box at the back (z)
        front: 0.035, // and at the front, clear of the door handle
        ridgeHalf: 0.075,
      }),
      // Door: a raised panel on the body front. [x inset from the front flat, y range,
      // proud, bevel].
      door: Object.freeze({ x: 0.017, bottom: 0.15, top: 1.07, proud: 0.008, bevel: 0.01 }),
      // Louvres: three slats on the lower door, each a single face leaning out to
      // a lip, open at the ends and below, so the door shows behind them as slots.
      louvres: Object.freeze({
        top: Object.freeze([0.43, 0.365, 0.3]),
        height: 0.045,
        halfWidth: 0.13,
        lip: 0.012,
      }),
      // Handle: a vertical ridged bar near the door's +x (right-hand) edge.
      handle: Object.freeze({ x: -2.815, bottom: 0.56, top: 0.78, half: 0.013, proud: 0.028 }),
      // Linear vertex colours: a darker grimy foot, worn light edges, dusty roof.
      colour: Object.freeze({
        bodyFoot: Object.freeze([0.36, 0.018, 0.014]),
        bodyHead: Object.freeze([0.66, 0.024, 0.02]),
        edgeFoot: Object.freeze([0.5, 0.06, 0.045]),
        edgeHead: Object.freeze([0.88, 0.16, 0.11]),
        plinth: Object.freeze([0.04, 0.042, 0.046]),
        plinthTop: Object.freeze([0.085, 0.088, 0.094]),
        fascia: Object.freeze([0.48, 0.017, 0.014]),
        underside: Object.freeze([0.12, 0.006, 0.005]),
        roofTop: Object.freeze([0.56, 0.07, 0.055]),
        doorFoot: Object.freeze([0.42, 0.02, 0.016]),
        doorHead: Object.freeze([0.74, 0.03, 0.025]),
        doorBevel: Object.freeze([0.95, 0.2, 0.13]),
        louvre: Object.freeze([0.16, 0.008, 0.006]),
        handle: Object.freeze([0.42, 0.43, 0.45]),
        handleShade: Object.freeze([0.2, 0.205, 0.215]),
      }),
    }),
  }),
});
export function inspect(input, key, counts = FIXTURES[key]) {
  const spec = FIXTURES[key];
  assert(spec, 'Only the two fixed fixture decisions are supported');
  const bytes = Buffer.from(input);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const j = JSON.parse(bytes.subarray(20, 20 + jsonLength)),
    binStart = 28 + jsonLength;
  assert.equal(bytes.readUInt32LE(24 + jsonLength), 0x004e4942);
  assert.equal(binStart + bytes.readUInt32LE(20 + jsonLength), bytes.length);
  assert.equal(j.meshes.length, 1);
  assert.equal(j.meshes[0].primitives.length, 1);
  assert.equal(j.nodes.length, 2);
  assert.equal(j.materials.length, 1);
  assert.equal(j.images.length, 2);
  assert.equal(j.skins?.length ?? 0, 0);
  assert.equal(j.animations?.length ?? 0, 0);
  const primitive = j.meshes[0].primitives[0];
  assert(!primitive.extensions);
  assert(primitive.mode === undefined || primitive.mode === 4);
  const parent = j.nodes[0],
    child = j.nodes[1];
  assert.deepEqual(parent.children, [1]);
  assert.equal(child.mesh, 0);
  assert(
    !parent.rotation &&
      !parent.matrix &&
      !child.translation &&
      !child.rotation &&
      !child.scale &&
      !child.matrix
  );
  assert(parent.scale.every((s) => s > 0 && Number.isFinite(s)));
  const bin = bytes.subarray(binStart);
  function accessor(id) {
    const a = j.accessors[id],
      v = j.bufferViews[a.bufferView];
    assert(!a.sparse);
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const type = {
      5126: ['readFloatLE', 4],
      5125: ['readUInt32LE', 4],
      5123: ['readUInt16LE', 2],
      5121: ['readUInt8', 1],
    }[a.componentType];
    assert(width && type);
    const [method, size] = type;
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      stride = v.byteStride ?? width * size;
    return {
      a,
      width,
      start,
      stride,
      get: (i) =>
        Array.from({ length: width }, (_, k) => bin[method](start + i * stride + k * size)),
    };
  }
  const position = accessor(primitive.attributes.POSITION),
    index = accessor(primitive.indices);
  assert.equal(position.a.componentType, 5126);
  assert.equal(position.width, 3);
  assert.equal(position.a.count, counts.vertices);
  assert.equal(index.a.count, counts.triangles * 3);
  const local = Array.from({ length: counts.vertices }, (_, i) => position.get(i));
  const points = local.map((p) =>
    p.map((v, k) => v * parent.scale[k] + parent.translation[k] + spec.offset[k])
  );
  const triangles = Array.from({ length: counts.triangles }, (_, i) =>
    [0, 1, 2].map((k) => index.get(i * 3 + k)[0])
  );
  const bounds = (p) => ({
    min: [0, 1, 2].map((k) => Math.min(...p.map((v) => v[k]))),
    max: [0, 1, 2].map((k) => Math.max(...p.map((v) => v[k]))),
  });
  return {
    spec,
    bytes,
    j,
    bin,
    binStart,
    primitive,
    parent,
    position,
    index,
    local,
    points,
    triangles,
    bounds: bounds(points),
    localBounds: bounds(local),
    boundsOf: bounds,
  };
}
export function derive(input, key, options = {}) {
  assert.deepEqual(options, {}, 'Caller-selected transforms are forbidden');
  const spec = FIXTURES[key];
  assert(spec);
  assert.equal(
    hash(input),
    spec.baseline,
    'Pinned normalized baseline required; wrong, altered and already-derived inputs are refused'
  );
  const before = inspect(input, key),
    { points, triangles, position, parent } = before;
  const corner = (p) =>
    p.every((v, k) => Math.min(Math.abs(v - spec.box[0][k]), Math.abs(v - spec.box[1][k])) < 1e-6);
  const selectedTriangles = triangles
    .map((ids, i) => ({ ids, i }))
    .filter((t) => t.ids.every((id) => corner(points[id])));
  assert.equal(selectedTriangles.length, 12, 'Exact six-face box ownership changed');
  const selectedTriangleIds = new Set(selectedTriangles.map((t) => t.i));
  const selectedVertices = [...new Set(selectedTriangles.flatMap((t) => t.ids))].sort(
    (a, b) => a - b
  );
  assert.equal(selectedVertices.length, 24, 'Expected split box corners');
  for (let i = 0; i < triangles.length; i++)
    if (!selectedTriangleIds.has(i))
      assert(
        triangles[i].every((v) => !selectedVertices.includes(v)),
        'Selected box shares an unrelated vertex'
      );
  const faces = [0, 1, 2].flatMap((axis) =>
    [0, 1].map((side) => ({
      axis,
      side,
      count: selectedTriangles.filter((t) =>
        t.ids.every((id) => Math.abs(points[id][axis] - spec.box[side][axis]) < 1e-6)
      ).length,
    }))
  );
  assert(
    faces.every((f) => f.count === 2),
    'Not a complete six-face source box'
  );
  const changedVertices =
    key === 'intercom'
      ? selectedVertices.filter((i) => Math.abs(points[i][1] - spec.box[0][1]) < 1e-6)
      : selectedVertices;
  assert.equal(changedVertices.length, key === 'intercom' ? 12 : 24);
  const changedTriangles = selectedTriangles.filter((t) =>
    t.ids.some((i) => changedVertices.includes(i))
  );
  assert.equal(changedTriangles.length, key === 'intercom' ? 10 : 12);
  const result = Buffer.from(input),
    permitted = new Set();
  for (const i of changedVertices) {
    const offset = before.binStart + position.start + i * position.stride + spec.axis * 4;
    const current = result.readFloatLE(offset);
    const next =
      key === 'intercom'
        ? (spec.bottom - parent.translation[1] - spec.offset[1]) / parent.scale[1]
        : current + spec.delta / parent.scale[2];
    result.writeFloatLE(next, offset);
    assert.notEqual(result.readFloatLE(offset), current);
    for (let k = 0; k < 4; k++) permitted.add(offset + k);
  }
  let changedBytes = 0;
  for (let i = 0; i < result.length; i++)
    if (result[i] !== before.bytes[i]) {
      assert(permitted.has(i), 'Non-target byte changed');
      changedBytes++;
    }
  assert(changedBytes > 0);
  const after = inspect(result, key);
  assert.deepEqual(after.j, before.j, 'GLB JSON/normalization/material/image metadata changed');
  assert.deepEqual(after.localBounds, before.localBounds, 'Overall accessor bounds changed');
  assert.deepEqual(after.bounds, before.bounds, 'Whole fixture bounds changed');
  for (let i = 0; i < spec.vertices; i++) {
    if (!changedVertices.includes(i))
      assert.deepEqual(
        after.position.get(i),
        before.position.get(i),
        'Unselected position changed'
      );
    else
      for (let k = 0; k < 3; k++)
        assert(
          Math.abs(after.points[i][k] - before.points[i][k] - (k === spec.axis ? spec.delta : 0)) <
            1e-6,
          'Wrong metric displacement'
        );
  }
  assert.equal(
    hash(result),
    spec.fitOutput ?? spec.output,
    'Reviewed final-stage output identity changed'
  );
  const normalizedPoints = after.local.map((p) =>
    p.map((v, k) => v * parent.scale[k] + parent.translation[k])
  );
  const actualFinalBounds = after.boundsOf(normalizedPoints);
  const fitted = {
    bytes: result,
    receipt: {
      method: spec.method,
      actualFinalBounds,
      restoredFixtureBounds: after.bounds,
      inputSha256: spec.baseline,
      outputSha256: hash(result),
      axis: spec.axis,
      metricDelta: spec.delta,
      selectedTriangleIds: selectedTriangles.map((t) => t.i),
      changedTriangleIds: changedTriangles.map((t) => t.i),
      selectedVertices,
      changedVertices,
      selectedTriangles: 12,
      changedTriangles: changedTriangles.length,
      faces,
      beforeBox: before.boundsOf(selectedVertices.map((i) => points[i])),
      afterBox: after.boundsOf(selectedVertices.map((i) => after.points[i])),
      bounds: after.bounds,
      unchangedEnvelope: true,
      allOtherFileBytesExact: true,
      changedBytes,
      bytesBefore: input.length,
      bytesAfter: result.length,
      triangles: spec.triangles,
      indexedVertices: spec.vertices,
      maps: 2,
      materials: 1,
      noGenericNormalizationChange: true,
    },
  };
  return key === 'intercom' ? rebuildIntercomHead(fitted, spec) : rebuildTireDeck(fitted, spec);
}

/** v7 intercom head. Only the v1 palette and UV charts are read from the input;
 * every part is generated. The body is skinned through octagonal plan sections
 * (chamfered vertical edges, sides converging to the back, back leaning in), and
 * a separate hood cap overhangs it all round. On the face, a raised control
 * panel carries nine domed keys and seats the runtime call button; the grille
 * is a 24-sided domed cap; the framed sign is tucked under the hood. A flared
 * steel bracket spans the body depth above the 12-sided shaft and the drafted
 * base plate. The envelope, nodes, material and both maps are unchanged, and the
 * 170-triangle budget is a ceiling.
 */
function rebuildIntercomHead(fitted, spec) {
  const H = spec.head;
  const before = inspect(fitted.bytes, 'intercom');
  const { j, bin, primitive, parent, points, triangles } = before;
  assert.deepEqual(Object.keys(primitive.attributes), [
    'POSITION',
    'TEXCOORD_0',
    'NORMAL',
    'COLOR_0',
  ]);
  const vertexView = j.accessors[primitive.attributes.POSITION].bufferView;
  assert.equal(j.bufferViews[vertexView].byteStride, 44, 'Expected one interleaved vertex view');
  const reader = (id) => {
    const a = j.accessors[id],
      v = j.bufferViews[a.bufferView],
      width = { VEC2: 2, VEC3: 3 }[a.type];
    assert.equal(a.bufferView, vertexView);
    assert.equal(a.componentType, 5126);
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return (i) => Array.from({ length: width }, (_, k) => bin.readFloatLE(start + i * 44 + k * 4));
  };
  const uvOf = reader(primitive.attributes.TEXCOORD_0),
    normalOf = reader(primitive.attributes.NORMAL),
    colourOf = reader(primitive.attributes.COLOR_0);
  const near = (a, b, e = 1e-5) => Math.abs(a - b) < e;
  const front = spec.box[1][2]; // the v1 casing front, z 0.155
  const box = [
    [-H.x, H.bottom, H.back],
    [H.x, spec.box[1][1], front],
  ];
  const onBox = (p) =>
    p.every((v, k) => Math.min(Math.abs(v - box[0][k]), Math.abs(v - box[1][k])) < 1e-5);
  const parts = { box: [], label: [], grille: [], postCap: [], post: [], keyBack: [], key: [] };
  triangles.forEach((t, i) => {
    const ps = t.map((v) => points[v]),
      n = normalOf(t[0]);
    if (ps.every(onBox)) parts.box.push(i);
    else if (ps.every((p) => near(p[2], 0.16) && p[1] > 1.48)) parts.label.push(i);
    else if (ps.every((p) => near(p[2], 0.16))) parts.grille.push(i);
    else if (ps.every((p) => Math.hypot(p[0], p[2]) < 0.0605))
      (ps.every((p) => near(p[1], 0)) && n[1] < -0.99 ? parts.postCap : parts.post).push(i);
    else if (ps.every((p) => near(p[2], front)) && n[2] < -0.99) parts.keyBack.push(i);
    else parts.key.push(i);
  });
  const partCounts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length]));
  assert.deepEqual(
    partCounts,
    { box: 12, label: 2, grille: 16, postCap: 8, post: 24, keyBack: 18, key: 90 },
    'Intercom part ownership changed'
  );
  for (const i of parts.key)
    for (const v of triangles[i]) {
      const p = points[v];
      assert(Math.abs(p[0]) < 0.06 && p[1] > 1.04 && p[1] < 1.16, 'Key outside the keypad');
    }
  // v3: the key undersides face the ground from 1.04-1.16 m. Every review and
  // in-game eye point is above them, so they are back-facing and never drawn;
  // they pay for the pedestal post and base plate.
  const keyBottoms = parts.key.filter((i) => normalOf(triangles[i][0])[1] < -0.99);
  assert.equal(keyBottoms.length, 18, 'Expected two underside triangles per key');
  const postColour = colourOf(triangles[parts.post[0]][0]);
  for (const i of [...parts.post, ...parts.postCap])
    for (const v of triangles[i]) assert.deepEqual(colourOf(v), postColour);
  // Reference charts: each original box face and the label quad, as bilinear
  // (s, t) -> UV over the two axes that are not the face's normal axis.
  const chart = (ids) => {
    const verts = [...new Set(ids.flatMap((i) => triangles[i]))];
    const n = normalOf(verts[0]),
      axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),
      axes = [0, 1, 2].filter((k) => k !== axis);
    const lo = axes.map((k) => Math.min(...verts.map((v) => points[v][k]))),
      hi = axes.map((k) => Math.max(...verts.map((v) => points[v][k])));
    assert.equal(verts.length, 4);
    const corner = (s, t) => {
      const v = verts.find(
        (v) =>
          near(points[v][axes[0]], s ? hi[0] : lo[0]) && near(points[v][axes[1]], t ? hi[1] : lo[1])
      );
      assert(v !== undefined, 'Chart corner missing');
      return uvOf(v);
    };
    const c = [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)];
    return {
      normal: n,
      uvAt: (s, t) =>
        [0, 1].map(
          (k) =>
            (1 - s) * (1 - t) * c[0][k] +
            s * (1 - t) * c[1][k] +
            (1 - s) * t * c[2][k] +
            s * t * c[3][k]
        ),
    };
  };
  const boxCharts = [];
  for (let f = 0; f < 6; f++) boxCharts.push(chart(parts.box.slice(f * 2, f * 2 + 2)));
  assert.deepEqual(
    boxCharts.map((c) => c.normal.map((v) => Math.round(v))),
    [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    'Casing face order changed'
  );
  const labelChart = chart(parts.label);
  const casingColour = colourOf(triangles[parts.box[0]][0]),
    labelColour = colourOf(triangles[parts.label[0]][0]);
  for (const i of parts.box)
    for (const v of triangles[i]) assert.deepEqual(colourOf(v), casingColour);
  for (const i of parts.label)
    for (const v of triangles[i]) assert.deepEqual(colourOf(v), labelColour);

  // Output stream, in the IntercomCallBox group frame until the final write.
  // v4 builds every head part from a generator (profile loft, lathe, frustum,
  // pyramid) instead of keeping or nudging the v1 parts.
  const out = { p: [], uv: [], n: [], c: [] },
    indices = [];
  const sub = (a, b) => a.map((v, k) => v - b[k]);
  const crossP = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a) => a.map((v) => v / Math.hypot(...a));
  const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
  const lerp = (a, b, f) => a + (b - a) * f;
  // UV from the reference chart whose normal best matches, by (s, t) over the
  // part's extent on the two axes that are not the face's dominant axis.
  const chartUV = (charts, extent) => (p, n) => {
    const dominant = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
    const axes = [0, 1, 2].filter((k) => k !== dominant);
    const ref = charts.reduce((best, c) => (dot(c.normal, n) > dot(best.normal, n) ? c : best));
    const [s, t] = axes.map((k) => (p[k] - extent[0][k]) / (extent[1][k] - extent[0][k]));
    assert(
      s >= -1e-9 && s <= 1 + 1e-9 && t >= -1e-9 && t <= 1 + 1e-9,
      'UV parameter outside the part'
    );
    return ref.uvAt(s, t);
  };
  // A flat planar polygon, corners counter-clockwise from outside, ear-clipped.
  // Its normal must agree with the expected outward direction.
  const polygon = (corners, expected, uvFn, colour, name, minDot = 0.999) => {
    const n = unit(
      corners.reduce(
        (acc, p, i) => acc.map((v, k) => v + crossP(p, corners[(i + 1) % corners.length])[k]),
        [0, 0, 0]
      )
    );
    assert(dot(n, unit(expected)) > minDot, 'Face faces the wrong way: ' + name);
    const base = out.p.length;
    for (const p of corners) {
      out.p.push(p);
      out.uv.push(uvFn(p, n));
      out.n.push(n);
      out.c.push(colour);
    }
    const left = corners.map((_, i) => i);
    const area = (a, b, d) =>
      dot(crossP(sub(corners[b], corners[a]), sub(corners[d], corners[a])), n);
    const inside = (q, a, b, d) =>
      [
        [a, b],
        [b, d],
        [d, a],
      ].every(
        ([u, v]) => dot(crossP(sub(corners[v], corners[u]), sub(corners[q], corners[u])), n) > 0
      );
    while (left.length > 3) {
      const at = left.findIndex((_, i) => {
        const a = left[(i + left.length - 1) % left.length],
          b = left[i],
          d = left[(i + 1) % left.length];
        return (
          area(a, b, d) > 1e-12 && left.every((q) => [a, b, d].includes(q) || !inside(q, a, b, d))
        );
      });
      assert(at >= 0, 'Polygon could not be triangulated: ' + name);
      const a = left[(at + left.length - 1) % left.length],
        d = left[(at + 1) % left.length];
      indices.push(base + a, base + left[at], base + d);
      left.splice(at, 1);
    }
    assert(area(left[0], left[1], left[2]) > 1e-12, 'Degenerate last ear: ' + name);
    indices.push(base + left[0], base + left[1], base + left[2]);
    return corners.length - 2;
  };
  const built = {};
  const tally = (name, n) => (built[name] = (built[name] ?? 0) + n);

  // 1. Housing. v7 skins octagonal PLAN sections (x, z) vertically instead of
  // lofting a side profile across x: each station is a trapezoid narrower at the
  // back with all four vertical edges chamfered, so the body has bevelled
  // vertical edges, sides converging to the back and a back leaning in toward
  // the top. A separate hood cap, wider than the body all round, takes the top:
  // a drip overhang with a flat underside and a top falling to the back.
  const X = H.x,
    zf = H.face,
    K = H.keys,
    L = H.label,
    B = H.body,
    HD = H.hood,
    PN = H.panel;
  const keyTop = Math.max(...K.y) + K.half,
    keyBottom = Math.min(...K.y) - K.half;
  const lift = (colour, f) => colour.map((v) => lerp(v, 1, f));
  const toward = (colour, f) => colour.map((v, k) => lerp(v, postColour[k], f));
  // Ring order: the front edge running +x, the right front chamfer, the right
  // side, the right back chamfer, the back running -x, and round the left.
  const plan = ([wf, wb, zF, zB, c]) => {
    assert(c > 0 && wf - c > 0.1 && wb - c > 0.1 && zF - zB > 4 * c, 'Bad plan section');
    return [
      [-(wf - c), zF],
      [wf - c, zF],
      [wf, zF - c],
      [wb, zB + c],
      [wb - c, zB],
      [-(wb - c), zB],
      [-wb, zB + c],
      [-wf, zF - c],
    ];
  };
  const station = (section, yAt) => plan(section).map(([x, z]) => [x, yAt(z), z]);
  const casing = [
    [-X, H.bottom, Math.min(HD.plan[3], ...B.map((s) => s[4]))],
    [X, H.top, HD.plan[2]],
  ];
  const casingUV = chartUV(boxCharts, casing);
  // Quads between two stations; each must face away from the section's axis
  // (polygon() alone passes a band wound inward).
  const skin = (lower, upper, colour, name) => {
    const axis = [0, 2].map((k) => lower.reduce((s, p) => s + p[k], 0) / lower.length);
    for (let i = 0; i < lower.length; i++) {
      const i1 = (i + 1) % lower.length;
      const corners = [lower[i], lower[i1], upper[i1], upper[i]];
      const g = crossP(sub(corners[1], corners[0]), sub(corners[3], corners[0]));
      const mid = [0, 2].map((k) => corners.reduce((s, p) => s + p[k] / 4, 0));
      assert(
        g[0] * (mid[0] - axis[0]) + g[2] * (mid[1] - axis[1]) > 0 && Math.abs(unit(g)[1]) < 0.2,
        'Skin faces inward: ' + name + ' ' + i
      );
      tally(name, polygon(corners, g, casingUV, colour, name + ' ' + i, 0.995));
    }
  };
  // Body: two stations; its front segment is the face (z 0.150 at both), one
  // uncut plate the panel, grille and label stand on. Its open top sits inside
  // the hood; its underside is a flat octagon.
  assert.equal(B.length, 2);
  assert(
    near(B[0][0], H.bottom) &&
      B.every((s) => near(s[3], zf)) &&
      B[1][0] > HD.bottom + 0.002 &&
      B[1][0] < HD.topBack - 0.002,
    'Body must stand on the casing bottom, carry the face and end inside the hood'
  );
  const body = B.map(([y, ...section]) => station(section, () => y));
  skin(body[0], body[1], casingColour, 'bodySkin');
  tally(
    'bodyCaps',
    polygon([...body[0]].reverse(), [0, -1, 0], casingUV, casingColour, 'body underside')
  );
  // Hood: one plan section wider than the body top on every side.
  const hoodPlan = plan(HD.plan),
    bodyTopPlan = plan(B[1].slice(1));
  // q lies at least `margin` metres inside a clockwise (x, z) section.
  const inside = (q, poly, margin = 0.004) =>
    poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const cross = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
      return cross / Math.hypot(b[0] - a[0], b[1] - a[1]) < -margin;
    });
  assert(
    bodyTopPlan.every((q) => inside(q, hoodPlan)) &&
      near(HD.plan[0], X) &&
      near(HD.topFront, H.top),
    'Hood must overhang the body top by at least 4 mm all round and hold the envelope'
  );
  const hoodSlope = (HD.topFront - HD.topBack) / (HD.plan[2] - HD.plan[3]);
  const hoodTopAt = (z) => HD.topBack + (z - HD.plan[3]) * hoodSlope;
  const hoodColour = toward(casingColour, HD.tint);
  const hoodBottom = station(HD.plan, () => HD.bottom),
    hoodTop = station(HD.plan, hoodTopAt);
  skin(hoodBottom, hoodTop, hoodColour, 'hoodSkin');
  tally('hoodCaps', polygon(hoodTop, [0, 1, -hoodSlope], casingUV, hoodColour, 'hood top'));
  tally(
    'hoodCaps',
    polygon([...hoodBottom].reverse(), [0, -1, 0], casingUV, hoodColour, 'hood underside')
  );
  // The face's flat width at height y (the body front edge between its chamfers).
  const faceHalf = (y) => {
    const f = (y - B[0][0]) / (B[1][0] - B[0][0]);
    return lerp(B[0][1] - B[0][5], B[1][1] - B[1][5], f);
  };

  // 2. Control panel: a raised sub-panel (a frustum: top plus four bevels) in
  // its own mid tone, carrying the keypad and the runtime red call button.
  const pz = zf + PN.height,
    px = PN.x - PN.bevel,
    py0 = PN.bottom + PN.bevel,
    py1 = PN.top - PN.bevel;
  assert(
    PN.x < faceHalf(PN.bottom) - 0.03 &&
      PN.bottom > H.bottom + 0.005 &&
      Math.max(...K.x) + K.half < px - 0.005 &&
      keyBottom > py0 + 0.005 &&
      keyTop < 1.2 - 0.03 - 0.008 &&
      0.03 < px - 0.01 &&
      1.2 - 0.03 > py0 &&
      1.2 + 0.03 < py1 - 0.005 &&
      pz < 0.17 - 0.015,
    'Panel must sit on the face, hold the keys and seat the runtime red button'
  );
  const panelColour = toward(casingColour, PN.tint);
  const panelUV = chartUV(boxCharts, [
    [-PN.x, PN.bottom, zf],
    [PN.x, PN.top, pz],
  ]);
  for (const [name, corners, expected] of [
    [
      'top',
      [
        [-px, py0, pz],
        [px, py0, pz],
        [px, py1, pz],
        [-px, py1, pz],
      ],
      [0, 0, 1],
    ],
    [
      'bottom',
      [
        [-PN.x, PN.bottom, zf],
        [PN.x, PN.bottom, zf],
        [px, py0, pz],
        [-px, py0, pz],
      ],
      [0, -PN.height, PN.bevel],
    ],
    [
      'top bevel',
      [
        [PN.x, PN.top, zf],
        [-PN.x, PN.top, zf],
        [-px, py1, pz],
        [px, py1, pz],
      ],
      [0, PN.height, PN.bevel],
    ],
    [
      'left',
      [
        [-PN.x, PN.top, zf],
        [-PN.x, PN.bottom, zf],
        [-px, py0, pz],
        [-px, py1, pz],
      ],
      [-PN.height, 0, PN.bevel],
    ],
    [
      'right',
      [
        [PN.x, PN.bottom, zf],
        [PN.x, PN.top, zf],
        [px, py1, pz],
        [px, py0, pz],
      ],
      [PN.height, 0, PN.bevel],
    ],
  ])
    tally('panel', polygon(corners, expected, panelUV, panelColour, 'panel ' + name, 0.99));

  // 3. Keys: nine free-standing domed buttons on the panel, the panel showing
  // between them. Each is one apex and four base corners with shared vertices;
  // the corner normals lean out past the facet slope, so the facets shade as a
  // pillow, and the apex is painted light. UVs come from one original key face.
  const keyFace = parts.key.filter((i) =>
    triangles[i].every((v) => {
      const p = points[v];
      return near(p[2], 0.165) && p[0] < -0.02 && p[1] < 1.08;
    })
  );
  assert.equal(keyFace.length, 2, 'Expected one original key face');
  const keyChart = chart(keyFace);
  const keyColour = colourOf(triangles[keyFace[0]][0]),
    keyApexColour = lift(postColour, K.apexLift);
  const pitch = K.x[1] - K.x[0];
  assert(
    near(K.y[1] - K.y[0], pitch) && pitch - 2 * K.half > 0.004 && pz + K.height < H.plate.front,
    'Keys must stand apart and inside the envelope'
  );
  const keysStart = indices.length;
  const keyCorners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  for (const kx of K.x)
    for (const ky of K.y) {
      const keyUV = chartUV(
        [keyChart],
        [
          [kx - K.half, ky - K.half, pz],
          [kx + K.half, ky + K.half, pz + K.height],
        ]
      );
      const base = out.p.length;
      for (const [sx, sy] of keyCorners) {
        const p = [kx + sx * K.half, ky + sy * K.half, pz],
          n = unit([sx * K.height * 1.5, sy * K.height * 1.5, K.half]);
        out.p.push(p);
        out.uv.push(keyUV(p, n));
        out.n.push(n);
        out.c.push(keyColour);
      }
      const apex = [kx, ky, pz + K.height];
      out.p.push(apex);
      out.uv.push(keyUV(apex, [0, 0, 1]));
      out.n.push([0, 0, 1]);
      out.c.push(keyApexColour);
      for (let f = 0; f < 4; f++) indices.push(base + f, base + ((f + 1) % 4), base + 4);
    }
  for (let i = keysStart; i < indices.length; i += 3) {
    const [a, b, d] = [0, 1, 2].map((k) => indices[i + k]);
    const g = crossP(sub(out.p[b], out.p[a]), sub(out.p[d], out.p[a]));
    assert(
      g[2] > 0 && dot(g, out.n[a]) > 0 && dot(g, out.n[d]) > 0,
      'Key facet faces the wrong way'
    );
  }
  tally('keys', (indices.length - keysStart) / 3);

  // 4. Grille: v7 replaces the 16-sided rim-and-bowl lathe with one 24-sided
  // domed cap: a fan from a light bezel ring on the face to a dark raised
  // centre. Rim normals lean out (sphere-like) so the cap shades as a dome.
  const G = H.grille;
  const grilleVerts = [...new Set(parts.grille.flatMap((i) => triangles[i]))];
  const gu = [0, 1].map((k) => grilleVerts.map((v) => uvOf(v)[k]));
  const gMid = gu.map((a) => (Math.min(...a) + Math.max(...a)) / 2),
    gHalf = gu.map((a) => (Math.max(...a) - Math.min(...a)) / 2);
  const grilleColour = colourOf(grilleVerts[0]);
  for (const v of grilleVerts) assert.deepEqual(colourOf(v), grilleColour);
  // The runtime LED disc (r 0.015 at (0.08, 1.40), z 0.16) must stand clear in
  // front of the dome where it overlaps the rim.
  const ledGap = Math.hypot(0.08, 1.4 - G.y) - 0.015;
  const domeZ = (r) => zf + G.rise * Math.max(0, 1 - r / G.outer);
  assert(
    G.sides >= 24 &&
      G.sides % 2 === 0 &&
      domeZ(Math.max(0, ledGap)) < 0.16 - 0.005 &&
      G.outer < faceHalf(G.y) - 0.03 &&
      G.y - G.outer > PN.top + 0.01 &&
      G.y - G.outer > 1.2 + 0.03 + 0.02 &&
      G.y + G.outer < L.bottom - 0.03 &&
      zf + G.rise < H.plate.front,
    'Grille must clear the runtime LED, red button, panel and label'
  );
  const grilleStart = indices.length,
    rimBase = out.p.length;
  const dishUV = (x, y) => [
    gMid[0] + (x / G.outer) * gHalf[0] * 0.9,
    gMid[1] + ((y - G.y) / G.outer) * gHalf[1] * 0.9,
  ];
  for (let k = 0; k < G.sides; k++) {
    const a = (2 * Math.PI * k) / G.sides,
      x = G.outer * Math.cos(a),
      y = G.y + G.outer * Math.sin(a);
    out.p.push([x, y, zf]);
    out.uv.push(dishUV(x, y));
    out.n.push(unit([G.rimLean * Math.cos(a), G.rimLean * Math.sin(a), 1]));
    out.c.push(lift(postColour, G.rimLift));
  }
  out.p.push([0, G.y, zf + G.rise]);
  out.uv.push(dishUV(0, G.y));
  out.n.push([0, 0, 1]);
  out.c.push(grilleColour.map((v, j) => lerp(v, casingColour[j], 0.5)));
  for (let k = 0; k < G.sides; k++)
    indices.push(rimBase + k, rimBase + ((k + 1) % G.sides), rimBase + G.sides);
  for (let i = grilleStart; i < indices.length; i += 3) {
    const [a, b, d] = [0, 1, 2].map((k) => indices[i + k]);
    const g = crossP(sub(out.p[b], out.p[a]), sub(out.p[d], out.p[a]));
    assert(dot(g, out.n[a]) > 0 && g[2] > 0, 'Grille faces the wrong way');
  }
  tally('grille', (indices.length - grilleStart) / 3);

  // 5. Label: a raised sign plate tucked under the hood. Its top edge meets
  // the hood underside, which closes it from above and below, so only the
  // bottom and side bevels are built; they are a brushed-steel frame.
  const lx = L.x - L.bevelX,
    ly0 = L.bottom + L.bevelY,
    lz = zf + L.height;
  assert(
    L.x < faceHalf(L.top) - 0.005 &&
      L.bottom > G.y + G.outer + 0.03 &&
      near(L.top, HD.bottom) &&
      lz < HD.plan[2] - 0.004 &&
      near((L.bottom + L.top) / 2, 1.52) &&
      L.top - ly0 >= 0.025 &&
      lx > 0.11 &&
      lz < 0.17 - 0.005,
    'Label must lie on the face under the hood, its yellow field round the runtime text line'
  );
  const labelBox = [
    [-lx, ly0, lz],
    [lx, L.top, lz],
  ];
  const frameColour = lift(postColour, L.frameLift);
  const frameUV = chartUV(boxCharts, [
    [-L.x, L.bottom, zf],
    [L.x, L.top, lz],
  ]);
  tally(
    'label',
    polygon(
      [
        [-lx, ly0, lz],
        [lx, ly0, lz],
        [lx, L.top, lz],
        [-lx, L.top, lz],
      ],
      [0, 0, 1],
      chartUV([labelChart], labelBox),
      labelColour,
      'label field'
    )
  );
  for (const [name, corners, expected] of [
    [
      'bottom',
      [
        [-L.x, L.bottom, zf],
        [L.x, L.bottom, zf],
        [lx, ly0, lz],
        [-lx, ly0, lz],
      ],
      [0, -L.height, L.bevelY],
    ],
    [
      'left',
      [
        [-L.x, L.top, zf],
        [-L.x, L.bottom, zf],
        [-lx, ly0, lz],
        [-lx, L.top, lz],
      ],
      [-L.height, 0, L.bevelX],
    ],
    [
      'right',
      [
        [L.x, L.bottom, zf],
        [L.x, L.top, zf],
        [lx, L.top, lz],
        [lx, ly0, lz],
      ],
      [L.height, 0, L.bevelX],
    ],
  ])
    tally('label', polygon(corners, expected, frameUV, frameColour, 'label frame ' + name, 0.99));

  // 6. Bracket: a flared steel saddle from round the post to the full body
  // depth, its top ring inside the body underside. Open at both ends (the
  // post fills the bottom; the top is inside the body).
  const BR = H.bracket;
  const bodyBottomPlan = plan(B[0].slice(1));
  const ring4 = ([hx, y, z0, z1]) => [
    [-hx, y, z0],
    [hx, y, z0],
    [hx, y, z1],
    [-hx, y, z1],
  ];
  const nb = ring4(BR.bottom),
    nt = ring4(BR.top);
  assert(
    BR.top[1] > H.bottom + 0.002 &&
      BR.top[1] < H.bottom + 0.01 &&
      BR.bottom[1] < H.bottom - 0.05 &&
      nt.every(([x, , z]) => inside([x, z], bodyBottomPlan)) &&
      BR.top[3] - BR.top[2] > 0.8 * (B[0][3] - B[0][4]),
    'Bracket top must span the body depth inside its underside'
  );
  const bracketUV = chartUV(boxCharts, [
    [-BR.top[0], BR.bottom[1], Math.min(BR.top[2], BR.bottom[2])],
    [BR.top[0], BR.top[1], Math.max(BR.top[3], BR.bottom[3])],
  ]);
  const bracketSides = [
    [0, 0, -1],
    [1, 0, 0],
    [0, 0, 1],
    [-1, 0, 0],
  ];
  for (let f = 0; f < 4; f++) {
    const f1 = (f + 1) % 4;
    tally(
      'bracket',
      polygon(
        [nb[f1], nb[f], nt[f], nt[f1]],
        bracketSides[f],
        bracketUV,
        postColour,
        'bracket side',
        0.8
      )
    );
  }

  // corners: counter-clockwise seen from outside.
  const quad = (corners, charts, extent, colour) => {
    const n = unit(crossP(sub(corners[1], corners[0]), sub(corners[2], corners[0])));
    const dominant = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
    const axes = [0, 1, 2].filter((k) => k !== dominant);
    const ref = charts.reduce((best, c) =>
      c.normal.reduce((s, v, k) => s + v * n[k], 0) >
      best.normal.reduce((s, v, k) => s + v * n[k], 0)
        ? c
        : best
    );
    const base = out.p.length;
    for (const p of corners) {
      const [s, t] = axes.map((k) => (p[k] - extent[0][k]) / (extent[1][k] - extent[0][k]));
      assert(
        s >= -1e-9 && s <= 1 + 1e-9 && t >= -1e-9 && t <= 1 + 1e-9,
        'UV parameter outside the part'
      );
      out.p.push(p);
      out.uv.push(ref.uvAt(s, t));
      out.n.push(n);
      out.c.push(colour);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return n;
  };
  // Pedestal shaft: smooth radial normals, open at both ends (the foot is inside
  // the plate, the top inside the body). Mirrored strip UVs, so no wrap seam.
  const P = H.post,
    D = H.plate;
  // The shaft stays inside the body underside and the bracket's bottom opening.
  const postPlan = Array.from({ length: P.sides }, (_, k) => {
    const a = (2 * Math.PI * k) / P.sides;
    return [P.x + P.radius * Math.cos(a), P.z + P.radius * Math.sin(a)];
  });
  const bodyPlanAt = (y) =>
    plan(B[0].slice(1).map((v, k) => lerp(v, B[1][k + 1], (y - B[0][0]) / (B[1][0] - B[0][0]))));
  assert(
    postPlan.every((q) => inside(q, bodyPlanAt(P.top))) &&
      P.z - P.radius > BR.bottom[2] &&
      P.z + P.radius < BR.bottom[3] &&
      P.radius < BR.bottom[0],
    'Post must stand under the body, inside the bracket'
  );
  assert(
    P.top > H.bottom + 0.015 && P.top < H.bottom + 0.04 && BR.bottom[1] < H.bottom,
    'Post must end inside the body'
  );
  assert(P.foot > 0 && P.foot < D.top, 'Post foot must sit inside the plate');
  const ring = (y) => {
    const base = out.p.length;
    for (let k = 0; k < P.sides; k++) {
      const a = (2 * Math.PI * k) / P.sides,
        half = P.sides / 2,
        f = k <= half ? k / half : (P.sides - k) / half;
      out.p.push([P.x + P.radius * Math.cos(a), y, P.z + P.radius * Math.sin(a)]);
      out.uv.push([lerp(P.u[0], P.u[1], f), P.v[0] + P.v[1] * y]);
      out.n.push([Math.cos(a), 0, Math.sin(a)]);
      out.c.push(postColour);
    }
    return base;
  };
  const shaftStart = indices.length;
  const foot = ring(P.foot),
    head = ring(P.top);
  for (let k = 0; k < P.sides; k++) {
    const k1 = (k + 1) % P.sides;
    indices.push(foot + k, head + k1, foot + k1, foot + k, head + k, head + k1);
  }
  for (let i = shaftStart; i < indices.length; i += 3) {
    const [a, b, d] = [0, 1, 2].map((k) => out.p[indices[i + k]]);
    const g = crossP(sub(b, a), sub(d, a)),
      mid = [0, 2].map((k) => (a[k] + b[k] + d[k]) / 3 - (k ? P.z : P.x));
    assert(g[0] * mid[0] + g[2] * mid[1] > 0, 'Post shaft faces inward');
  }
  // Bolt-down base plate: a drafted frustum, top and four sloped sides. The
  // underside lies on the ground and is not built.
  const plateChart = {
    normal: [0, 1, 0],
    uvAt: (s, t) => [lerp(D.u[0], D.u[1], s), lerp(D.v[0], D.v[1], t)],
  };
  const PX = D.x,
    PI = D.x - D.draft,
    zB = D.back,
    zF = D.front,
    zBi = zB + D.draft,
    zFi = zF - D.draft,
    yT = D.top;
  assert(
    P.x + P.radius < PI && P.z - P.radius > zBi && P.z + P.radius < zFi,
    'Post must stand on the plate top'
  );
  const plateBox = [
    [-PX, 0, zB],
    [PX, yT, zF],
  ];
  const plateQuads = {
    top: [
      [
        [-PI, yT, zFi],
        [PI, yT, zFi],
        [PI, yT, zBi],
        [-PI, yT, zBi],
      ],
      [0, 1, 0],
    ],
    front: [
      [
        [-PX, 0, zF],
        [PX, 0, zF],
        [PI, yT, zFi],
        [-PI, yT, zFi],
      ],
      [0, D.draft, yT],
    ],
    back: [
      [
        [PX, 0, zB],
        [-PX, 0, zB],
        [-PI, yT, zBi],
        [PI, yT, zBi],
      ],
      [0, D.draft, -yT],
    ],
    left: [
      [
        [-PX, 0, zB],
        [-PX, 0, zF],
        [-PI, yT, zFi],
        [-PI, yT, zBi],
      ],
      [-yT, D.draft, 0],
    ],
    right: [
      [
        [PX, 0, zF],
        [PX, 0, zB],
        [PI, yT, zBi],
        [PI, yT, zFi],
      ],
      [yT, D.draft, 0],
    ],
  };
  for (const [name, [corners, expected]] of Object.entries(plateQuads)) {
    const n = quad(corners, [plateChart], plateBox, postColour);
    assert(
      n.reduce((s, v, k) => s + v * unit(expected)[k], 0) > 0.999,
      'Plate face faces the wrong way: ' + name
    );
  }

  const partTriangles = {
    ...built,
    postShaft: 2 * P.sides,
    basePlate: 2 * Object.keys(plateQuads).length,
  };
  const vertexCount = out.p.length,
    triangleCount = indices.length / 3;
  assert.equal(
    Object.values(partTriangles).reduce((s, n) => s + n, 0),
    triangleCount,
    'Part tally does not cover the output'
  );
  assert(triangleCount <= spec.triangles, 'Triangle budget exceeded: ' + triangleCount);
  assert(vertexCount < 65536);
  // No degenerate geometry or UV chart on any output triangle.
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, d] = [0, 1, 2].map((k) => indices[i + k]);
    assert(
      Math.hypot(...crossP(sub(out.p[b], out.p[a]), sub(out.p[d], out.p[a]))) > 1e-8,
      'Degenerate triangle'
    );
    const u = [out.uv[a], out.uv[b], out.uv[d]];
    assert(
      Math.abs(
        (u[1][0] - u[0][0]) * (u[2][1] - u[0][1]) - (u[1][1] - u[0][1]) * (u[2][0] - u[0][0])
      ) > 1e-10,
      'Degenerate UV triangle at ' + JSON.stringify([a, b, d].map((v) => out.p[v]))
    );
  }
  // Envelope: the whole fixture keeps its v1 bounds exactly.
  const bounds = before.boundsOf(out.p);
  for (const side of ['min', 'max'])
    for (let k = 0; k < 3; k++)
      assert(near(bounds[side][k], before.bounds[side][k], 1e-6), 'Fixture envelope changed');

  // Write: same JSON, same view order (indices, interleaved vertices, normal map, ORM map).
  const local = out.p.map((p) =>
    p.map((v, k) => Math.fround((v - parent.translation[k] - spec.offset[k]) / parent.scale[k]))
  );
  const json = structuredClone(j);
  const align = (n) => Math.ceil(n / 8) * 8;
  const indexBytes = indices.length * 2,
    vertexBytes = vertexCount * 44;
  const indexView = json.accessors[primitive.indices].bufferView;
  assert.equal(indexView, 2);
  assert.equal(vertexView, 3);
  assert.equal(json.accessors[primitive.indices].componentType, 5123);
  const layout = [];
  let cursor = 0;
  for (const [id, length] of [
    [indexView, indexBytes],
    [vertexView, vertexBytes],
    ...json.images.map((im) => [im.bufferView, j.bufferViews[im.bufferView].byteLength]),
  ]) {
    cursor = align(cursor);
    layout.push([id, cursor, length]);
    json.bufferViews[id].byteOffset = cursor;
    json.bufferViews[id].byteLength = length;
    cursor += length;
  }
  const binLength = Math.ceil(cursor / 4) * 4;
  json.buffers[0].byteLength = binLength;
  json.accessors[primitive.indices].count = indices.length;
  for (const id of Object.values(primitive.attributes)) json.accessors[id].count = vertexCount;
  const positionAccessor = json.accessors[primitive.attributes.POSITION];
  positionAccessor.min = [0, 1, 2].map((k) => Math.min(...local.map((p) => p[k])));
  positionAccessor.max = [0, 1, 2].map((k) => Math.max(...local.map((p) => p[k])));
  const nextBin = Buffer.alloc(binLength);
  indices.forEach((v, i) => nextBin.writeUInt16LE(v, layout[0][1] + i * 2));
  for (let i = 0; i < vertexCount; i++) {
    const o = layout[1][1] + i * 44;
    local[i].forEach((v, k) => nextBin.writeFloatLE(v, o + k * 4));
    out.uv[i].forEach((v, k) => nextBin.writeFloatLE(v, o + 12 + k * 4));
    out.n[i].forEach((v, k) => nextBin.writeFloatLE(v, o + 20 + k * 4));
    out.c[i].forEach((v, k) => nextBin.writeFloatLE(v, o + 32 + k * 4));
  }
  for (const [id, offset, length] of layout.slice(2)) {
    const old = j.bufferViews[id];
    bin.copy(nextBin, offset, old.byteOffset ?? 0, (old.byteOffset ?? 0) + length);
  }
  const jsonBytes = Buffer.from(JSON.stringify(json)),
    paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(paddedJson);
  const bytes = Buffer.alloc(12 + 8 + paddedJson.length + 8 + nextBin.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(paddedJson.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(bytes, 20);
  bytes.writeUInt32LE(nextBin.length, 20 + paddedJson.length);
  bytes.writeUInt32LE(0x004e4942, 24 + paddedJson.length);
  nextBin.copy(bytes, 28 + paddedJson.length);

  const after = inspect(bytes, 'intercom', { vertices: vertexCount, triangles: triangleCount });
  for (const side of ['min', 'max'])
    for (let k = 0; k < 3; k++)
      assert(near(after.bounds[side][k], before.bounds[side][k], 1e-6), 'Written envelope changed');
  assert.deepEqual(
    json.images.map((im) =>
      hash(
        after.bin.subarray(
          after.j.bufferViews[im.bufferView].byteOffset,
          after.j.bufferViews[im.bufferView].byteOffset +
            after.j.bufferViews[im.bufferView].byteLength
        )
      )
    ),
    j.images.map((im) =>
      hash(
        bin.subarray(
          j.bufferViews[im.bufferView].byteOffset,
          j.bufferViews[im.bufferView].byteOffset + j.bufferViews[im.bufferView].byteLength
        )
      )
    ),
    'Embedded map changed'
  );
  const outputSha256 = hash(bytes);
  assert.equal(
    outputSha256,
    spec.output,
    'Rebuilt intercom head output identity changed: ' + outputSha256
  );
  assert.equal(
    bytes.length,
    spec.fileBytes,
    'Rebuilt intercom head byte count changed: ' + bytes.length
  );
  const normalizedPoints = after.local.map((p) =>
    p.map((v, k) => v * parent.scale[k] + parent.translation[k])
  );
  return {
    bytes,
    receipt: {
      method: spec.rebuildMethod,
      casingFit: fitted.receipt,
      actualFinalBounds: after.boundsOf(normalizedPoints),
      bounds: after.bounds,
      inputSha256: spec.baseline,
      outputSha256,
      head: H,
      casingBox: casing,
      labelBox,
      post: P,
      plate: D,
      partTriangles,
      triangles: triangleCount,
      indexedVertices: vertexCount,
      bytesBefore: fitted.bytes.length,
      bytesAfter: bytes.length,
      unchangedEnvelope: true,
      maps: 2,
      materials: 1,
    },
  };
}

/** v2 tire deck. Only the v1 floor plate and its seven tread strips are
 * regenerated; every other part (rails, posts, sign, cabinet) keeps its exact
 * 44-byte vertex records. The plate is skinned through one section along z: a
 * short vertical side, a chamfer and the flat top, full height between the
 * ramps and falling to a knife toe on the ground at the v1 ends, so its length
 * and the whole envelope are unchanged. The treads are trapezoid bars with
 * bevelled long sides. The v1 palette is replaced by a wider-value one (plate
 * mid steel, worn bright chamfer, black rubber treads); UVs come from the v1
 * plate and tread charts. The node, material and both maps are unchanged, and
 * the v1 344-triangle count is a ceiling.
 *
 * v3 adds the cabinet: the v1 red box becomes a drafted octagonal plinth, an
 * octagonal body with every vertical edge chamfered, a rain canopy (underside,
 * fascia, shallow hip) and, on the +z front, a raised panel door with bevelled
 * edges, three louvre slats and a ridged handle. Its triangles come from the
 * hidden ground caps of the posts and sign post and from re-fanning the other
 * cap fans; no visible kept face changes.
 *
 * v4 replaces each side's rail and two posts (unjoined cylinders) with one
 * hexagonal tube swept along the traced post-bend-rail-bend-post path, mitred
 * at the bends, with smooth radial normals, re-laid UVs and a flared foot under
 * each post.
 */
function rebuildTireDeck(fitted, spec) {
  const D = spec.deck,
    PL = D.plate,
    TR = D.treads,
    C = D.colour;
  const before = inspect(fitted.bytes, 'tire');
  const { j, bin, primitive, parent, points, triangles } = before;
  assert.deepEqual(Object.keys(primitive.attributes), [
    'POSITION',
    'TEXCOORD_0',
    'NORMAL',
    'COLOR_0',
  ]);
  const vertexView = j.accessors[primitive.attributes.POSITION].bufferView;
  assert.equal(j.bufferViews[vertexView].byteStride, 44, 'Expected one interleaved vertex view');
  const vertexBase = j.bufferViews[vertexView].byteOffset ?? 0;
  const offsets = ['POSITION', 'TEXCOORD_0', 'NORMAL', 'COLOR_0'].map((name) => {
    const a = j.accessors[primitive.attributes[name]];
    assert.equal(a.bufferView, vertexView);
    assert.equal(a.componentType, 5126);
    return a.byteOffset ?? 0;
  });
  assert.deepEqual(offsets, [0, 12, 20, 32], 'Vertex record layout changed');
  const record = (i) => bin.subarray(vertexBase + i * 44, vertexBase + i * 44 + 44);
  const readAt = (i, at, width) =>
    Array.from({ length: width }, (_, k) => bin.readFloatLE(vertexBase + i * 44 + at + k * 4));
  const uvOf = (i) => readAt(i, 12, 2),
    normalOf = (i) => readAt(i, 20, 3);
  const near = (a, b, e = 1e-5) => Math.abs(a - b) < e;
  const sub = (a, b) => a.map((v, k) => v - b[k]);
  const crossP = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const unit = (a) => a.map((v) => v / Math.hypot(...a));
  const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);

  // Part ownership: the v1 plate box and the seven 3.8 x 0.02 x 0.15 m tread boxes.
  const plateBox = [
    [-PL.x, 0, -PL.z],
    [PL.x, PL.top, PL.z],
  ];
  const treadBoxes = TR.z.map((z) => [
    [-1.9, 0.1, z - 0.075],
    [1.9, 0.12, z + 0.075],
  ]);
  const onCorners = (box) => (p) => p.every((v, k) => near(v, box[0][k]) || near(v, box[1][k]));
  const CB = spec.cabinet,
    RL = spec.rails;
  const inRail = (p) =>
    Math.abs(Math.abs(p[0]) - RL.box.x) <= RL.box.halfWidth &&
    p[1] > -1e-5 &&
    p[1] <= RL.box.top &&
    Math.abs(p[2]) <= RL.box.z;
  const SG = spec.sign;
  // The v1 board after the front-mount fit: spec.box moved `delta` along z.
  const boardBox = spec.box.map((c) => c.map((v, k) => v + (k === spec.axis ? spec.delta : 0)));
  const inPost = (p) =>
    Math.abs(p[0] - SG.post.x) <= SG.post.halfWidth &&
    Math.abs(p[2]) <= SG.post.halfWidth &&
    p[1] > -1e-5 &&
    p[1] <= SG.post.top + 1e-5;
  const parts = {
    plate: [],
    treads: TR.z.map(() => []),
    cabinet: [],
    rails: [[], []],
    board: [],
    post: [],
    kept: [],
  };
  triangles.forEach((t, i) => {
    const ps = t.map((v) => points[v]);
    if (ps.every(onCorners(plateBox))) return parts.plate.push(i);
    if (ps.every(onCorners(CB.box))) return parts.cabinet.push(i);
    if (ps.every(inRail)) return parts.rails[ps[0][0] < 0 ? 0 : 1].push(i);
    if (ps.every(onCorners(boardBox))) return parts.board.push(i);
    if (ps.every(inPost)) return parts.post.push(i);
    const k = treadBoxes.findIndex((b) => ps.every(onCorners(b)));
    if (k >= 0) parts.treads[k].push(i);
    else parts.kept.push(i);
  });
  assert.equal(parts.plate.length, 12, 'Plate ownership changed');
  assert.equal(parts.cabinet.length, 12, 'Cabinet ownership changed');
  parts.treads.forEach((ids) => assert.equal(ids.length, 12, 'Tread ownership changed'));
  parts.rails.forEach((ids) => assert.equal(ids.length, 96, 'Rail ownership changed'));
  assert.equal(parts.board.length, 12, 'Board ownership changed');
  // The v1 post: eight side quads and two eight-triangle cap fans.
  assert.equal(parts.post.length, 32, 'Sign post ownership changed');
  // v5: every v1 part is now rebuilt; nothing is copied.
  assert.equal(parts.kept.length, 0, 'Unowned v1 triangles remain');
  const replaced = new Set(
    [...parts.plate, ...parts.cabinet, ...parts.treads.flat(), ...parts.rails.flat()].flatMap(
      (i) => triangles[i]
    )
  );
  // Envelope-carrying coordinates are read from the v1 plate, not retyped.
  const plateVerts = [...replaced].filter((v) => parts.plate.some((i) => triangles[i].includes(v)));
  const pb = before.boundsOf(plateVerts.map((v) => points[v]));
  const X = pb.max[0],
    Z = pb.max[2],
    G = pb.min[1],
    Y = pb.max[1];
  assert(near(X, PL.x) && near(-pb.min[0], PL.x) && near(Z, PL.z) && near(-pb.min[2], PL.z));
  assert(near(G, 0) && near(Y, PL.top), 'Plate heights changed');
  assert(
    PL.rampTop < Z - 0.3 && PL.rampTop > Math.max(...TR.z.map(Math.abs)) + TR.half + 0.1,
    'Ramps must clear the end treads'
  );

  // Charts: each v1 box face as a bilinear (s, t) -> UV over its own extent on the
  // two axes that are not its normal axis. New faces take the chart whose normal
  // best matches, with (s, t) clamped to the face.
  const chartsOf = (ids) => {
    const groups = new Map();
    for (const i of ids) {
      const n = normalOf(triangles[i][0]).map((v) => Math.round(v));
      const key = n.join(',');
      if (!groups.has(key)) groups.set(key, { normal: n, verts: new Set() });
      for (const v of triangles[i]) groups.get(key).verts.add(v);
    }
    assert.equal(groups.size, 6, 'Expected six box charts');
    return [...groups.values()].map(({ normal, verts }) => {
      verts = [...verts];
      assert.equal(verts.length, 4);
      const axis = normal.map(Math.abs).indexOf(1),
        axes = [0, 1, 2].filter((k) => k !== axis);
      const lo = axes.map((k) => Math.min(...verts.map((v) => points[v][k]))),
        hi = axes.map((k) => Math.max(...verts.map((v) => points[v][k])));
      const corner = (s, t) => {
        const v = verts.find(
          (v) =>
            near(points[v][axes[0]], s ? hi[0] : lo[0]) &&
            near(points[v][axes[1]], t ? hi[1] : lo[1])
        );
        assert(v !== undefined, 'Chart corner missing');
        return uvOf(v);
      };
      const c = [corner(0, 0), corner(1, 0), corner(0, 1), corner(1, 1)];
      const clamp = (v) => Math.min(1, Math.max(0, v));
      return {
        normal,
        uv: (p) => {
          const [s, t] = axes.map((k, m) => clamp((p[k] - lo[m]) / (hi[m] - lo[m])));
          return [0, 1].map(
            (k) =>
              (1 - s) * (1 - t) * c[0][k] +
              s * (1 - t) * c[1][k] +
              (1 - s) * t * c[2][k] +
              s * t * c[3][k]
          );
        },
      };
    });
  };
  const treadCharts = parts.treads.map(chartsOf),
    cabinetCharts = chartsOf(parts.cabinet);

  // v5: nothing is kept. The v1 cap fans (v3 reclaim) went with the post rebuild.
  const keptTris = [];
  const boardCharts = chartsOf(parts.board);

  // Output: kept vertices first (exact records, remapped), then the new deck.
  const keptRecords = [],
    remap = new Map(),
    indices = [];
  for (const tri of keptTris)
    for (const v of tri) {
      if (!remap.has(v)) {
        remap.set(v, keptRecords.length);
        keptRecords.push(v);
      }
      indices.push(remap.get(v));
    }
  const out = { p: [], uv: [], n: [], c: [] };
  const built = {};
  // `colour` is one linear RGB triple, or a function of the vertex position.
  const emit = (ps, n, charts, colour) => {
    // `charts` is a list of v1 box charts, or (v6 plate) a UV function of the position.
    const uvAt =
      typeof charts === 'function'
        ? charts
        : charts.reduce((best, ch) => (dot(ch.normal, n) > dot(best.normal, n) ? ch : best)).uv;
    const base = keptRecords.length + out.p.length;
    for (const p of ps) {
      out.p.push(p);
      out.uv.push(uvAt(p));
      out.n.push(n);
      out.c.push(typeof colour === 'function' ? colour(p) : colour);
    }
    return base;
  };
  // One flat face from a corner loop (3 or 4 corners, repeated corners dropped).
  // A non-planar quad is split into two flat triangles. Winding is set from the
  // expected outward direction, which must be well clear of edge-on.
  const face = (name, corners, outward, charts, colour) => {
    const loop = corners.filter(
      (p, i) => !corners.slice(0, i).some((q) => p.every((v, k) => near(v, q[k], 1e-9)))
    );
    assert(loop.length >= 3, 'Collapsed face: ' + name);
    const triNormal = (a, b, d) => unit(crossP(sub(b, a), sub(d, a)));
    const flip = dot(triNormal(loop[0], loop[1], loop[2]), outward) < 0;
    if (flip) loop.reverse();
    const tris =
      loop.length === 3
        ? [[0, 1, 2]]
        : [
            [0, 1, 2],
            [0, 2, 3],
          ];
    const normals = tris.map(([a, b, d]) => triNormal(loop[a], loop[b], loop[d]));
    for (const n of normals)
      assert(dot(n, unit(outward)) > 0.3, 'Face faces the wrong way: ' + name);
    if (normals.length === 1 || dot(normals[0], normals[1]) > 1 - 1e-9) {
      const base = emit(loop, normals[0], charts, colour);
      for (const t of tris) indices.push(...t.map((k) => base + k));
    } else
      tris.forEach((t, m) => {
        const base = emit(
          t.map((k) => loop[k]),
          normals[m],
          charts,
          colour
        );
        indices.push(base, base + 1, base + 2);
      });
    built[name] = (built[name] ?? 0) + tris.length;
  };

  // 1. Plate (v6). A hipped frustum traced from the plan and the side profile:
  // the base ring is the v1 plate on the ground, the top ring is inset by the
  // bevel on the long sides and by the ramp run on the ends, and the long-side
  // bevels meet the end ramps at four mitred hip lines. The top and both ramps
  // are lofted across lane stations (centre, wheel track, edge) so the wear has
  // vertices to live on, and every plate vertex takes its UV from a wear chart.
  const R = PL.rampTop,
    PE = X - PL.bevel,
    PT = PL.track,
    PU = D.uv;
  assert(PE > PT + 0.4 && PT > 0.4 && PL.bevel >= 0.12, 'Plate lane stations out of range');
  // Wear at a plate vertex: [linear colour, wear u]. Top-ring vertices take the
  // lane at |x|; ground vertices are the ramp toes or the bevel foot.
  const plateLane = (ax) => {
    if (near(ax, 0)) return [C.centre, PU.centre];
    if (near(ax, PT)) return [C.track, PU.polished];
    assert(near(ax, PE), 'Off-station plate vertex at |x| ' + ax);
    return [C.edge, PU.rough];
  };
  const deckWear = (p) => {
    const ax = Math.abs(p[0]);
    if (p[1] > G + 1e-6) return plateLane(ax);
    if (near(ax, PT)) return [C.toeTrack, PU.toeTrack];
    assert(near(ax, X), 'Off-station plate toe at |x| ' + ax);
    return [C.toe, PU.rough];
  };
  const bevelWear = (p) => (p[1] > G + 1e-6 ? [C.bevelTop, PU.polished] : [C.bevelFoot, PU.rough]);
  const plateUV = (wear) => (p) => [
    wear(p)[1],
    PU.v0 + (PU.dz * (p[2] + Z)) / (2 * Z) + (PU.dx * (p[0] + X)) / (2 * X),
  ];
  const plateColour = (wear) => (p) => wear(p)[0];
  const head = (x, s) => [x, Y, s * R],
    toePoint = (x, s) => [x, G, s * Z];
  const laneX = [-PE, -PT, 0, PT, PE];
  for (let i = 0; i < 4; i++)
    face(
      'plate-deck',
      [head(laneX[i], -1), head(laneX[i + 1], -1), head(laneX[i + 1], 1), head(laneX[i], 1)],
      [0, 1, 0],
      plateUV(deckWear),
      plateColour(deckWear)
    );
  for (const s of [-1, 1]) {
    const up = [0, 1, 0.15 * s];
    // Outer lanes: track to edge at the head, track to the base corner at the
    // toe. Their outer side is the hip line shared with the bevel.
    for (const m of [-1, 1])
      face(
        'plate-ramp',
        [head(m * PT, s), head(m * PE, s), toePoint(m * X, s), toePoint(m * PT, s)],
        up,
        plateUV(deckWear),
        plateColour(deckWear)
      );
    // Centre: both tracks and the centre at the head, both tracks at the toe,
    // as three triangles so the centre station meets no T-junction.
    const [a, b, c] = [-PT, 0, PT].map((x) => head(x, s)),
      [d, e] = [PT, -PT].map((x) => toePoint(x, s));
    for (const tri of [
      [a, b, e],
      [b, c, d],
      [b, d, e],
    ])
      face('plate-ramp', tri, up, plateUV(deckWear), plateColour(deckWear));
  }
  for (const m of [-1, 1])
    face(
      'plate-bevel',
      [head(m * PE, -1), head(m * PE, 1), toePoint(m * X, 1), toePoint(m * X, -1)],
      [m, 1.8, 0],
      plateUV(bevelWear),
      plateColour(bevelWear)
    );

  // 2. Treads (v5 shape, v6 height): hip-ended ridge strips. Two long slopes meet
  // at a ridge that stops `hip` short of each end; each end is one sloped
  // triangle. Dust collects at the foot; the ridge is black rubber.
  assert(TR.hip > 0 && TR.hip < TR.x / 4, 'Tread hip out of range');
  const treadColour = (p) => (p[1] > TR.base + 1e-6 ? C.treadTop : C.treadFoot);
  TR.z.forEach((z0, k) => {
    const charts = treadCharts[k];
    const f = (x) => [x, TR.base, z0 - TR.half],
      b = (x) => [x, TR.base, z0 + TR.half],
      ridge = (x) => [x, TR.top, z0];
    const xr = TR.x - TR.hip;
    face(
      'tread-slope',
      [f(-TR.x), f(TR.x), ridge(xr), ridge(-xr)],
      [0, 1, -1],
      charts,
      treadColour
    );
    face('tread-slope', [ridge(-xr), ridge(xr), b(TR.x), b(-TR.x)], [0, 1, 1], charts, treadColour);
    face('tread-hip', [f(TR.x), b(TR.x), ridge(xr)], [1, 0.4, 0], charts, treadColour);
    face('tread-hip', [b(-TR.x), f(-TR.x), ridge(-xr)], [-1, 0.4, 0], charts, treadColour);
  });

  // 3. Cabinet. Its plan is read from the v1 box: the x -3.3 face carries the
  // fixture envelope, so the plinth foot and the roof edge return to it exactly.
  const BO = CB.body,
    PN = CB.plinth,
    RF = CB.roof,
    DR = CB.door,
    LV = CB.louvres,
    HD = CB.handle,
    CC = CB.colour;
  const cabinetVerts = [...new Set(parts.cabinet.flatMap((i) => triangles[i]))];
  const cbb = before.boundsOf(cabinetVerts.map((v) => points[v]));
  const [cx0, , cz0] = cbb.min,
    [cx1, cy1, cz1] = cbb.max;
  assert(near(cbb.min[1], G), 'Cabinet must stand on the ground');
  const mix = (a, b, t) => a.map((v, k) => v + (b[k] - v) * Math.min(1, Math.max(0, t)));
  const byHeight = (foot, head, y0, y1) => (p) => mix(foot, head, (p[1] - y0) / (y1 - y0));
  const bx0 = cx0 + BO.x,
    bx1 = cx1 - BO.x,
    bz0 = cz0 + BO.back,
    bz1 = cz1 - BO.front;
  const cxm = (cx0 + cx1) / 2,
    czm = (bz0 + bz1) / 2;
  // An octagonal plan, as [x, z] corners. Edge k runs from corner k to k + 1:
  // even edges are the flats (front, +x, back, -x), odd edges the chamfers.
  const octagon = (x0, x1, z0, z1, c) => [
    [x0 + c, z1],
    [x1 - c, z1],
    [x1, z1 - c],
    [x1, z0 + c],
    [x1 - c, z0],
    [x0 + c, z0],
    [x0, z0 + c],
    [x0, z1 - c],
  ];
  // Walls between two octagons stacked in y. Matching edges are parallel, so
  // every wall is a flat trapezoid.
  const walls = (name, lower, y0, upper, y1, colourOf) =>
    lower.forEach((a, k) => {
      const b = lower[(k + 1) % 8],
        c = upper[(k + 1) % 8],
        d = upper[k];
      const outward = [(a[0] + b[0]) / 2 - cxm, 0, (a[1] + b[1]) / 2 - czm];
      face(
        name,
        [
          [a[0], y0, a[1]],
          [b[0], y0, b[1]],
          [c[0], y1, c[1]],
          [d[0], y1, d[1]],
        ],
        outward,
        cabinetCharts,
        colourOf(k)
      );
    });
  const bodyPlan = octagon(bx0, bx1, bz0, bz1, BO.chamfer);
  const plinthFoot = octagon(
    bx0 - PN.draft,
    bx1 + PN.draft,
    bz0 - PN.draft,
    bz1 + PN.draft,
    PN.chamfer
  );
  assert(near(plinthFoot[6][0], cx0), 'Plinth foot must hold the envelope edge');
  walls('cabinet-plinth', plinthFoot, G, bodyPlan, PN.top, () =>
    byHeight(CC.plinth, CC.plinthTop, G, PN.top)
  );
  walls('cabinet-body', bodyPlan, PN.top, bodyPlan, RF.bottom, (k) =>
    k % 2
      ? byHeight(CC.edgeFoot, CC.edgeHead, PN.top, RF.bottom)
      : byHeight(CC.bodyFoot, CC.bodyHead, PN.top, RF.bottom)
  );

  // Roof canopy: underside, fascia, then a hip to a ridge along x at the v1 top.
  const rx0 = cx0,
    rx1 = cx1,
    rz0 = cz0 + RF.back,
    rz1 = cz1 + RF.front,
    rzm = (rz0 + rz1) / 2;
  assert(rx0 < bx0 && rx1 > bx1 && rz0 < bz0 && rz1 > bz1, 'Roof must overhang the body');
  const at = (x, y, z) => [x, y, z];
  face(
    'cabinet-roof-underside',
    [
      at(rx0, RF.bottom, rz0),
      at(rx1, RF.bottom, rz0),
      at(rx1, RF.bottom, rz1),
      at(rx0, RF.bottom, rz1),
    ],
    [0, -1, 0],
    cabinetCharts,
    CC.underside
  );
  const rim = [at(rx0, 0, rz1), at(rx1, 0, rz1), at(rx1, 0, rz0), at(rx0, 0, rz0)];
  rim.forEach((a, k) => {
    const b = rim[(k + 1) % 4];
    face(
      'cabinet-roof-fascia',
      [
        at(a[0], RF.bottom, a[2]),
        at(b[0], RF.bottom, b[2]),
        at(b[0], RF.fascia, b[2]),
        at(a[0], RF.fascia, a[2]),
      ],
      [(a[0] + b[0]) / 2 - cxm, 0, (a[2] + b[2]) / 2 - rzm],
      cabinetCharts,
      CC.fascia
    );
  });
  const ridgeL = at(cxm - RF.ridgeHalf, cy1, rzm),
    ridgeR = at(cxm + RF.ridgeHalf, cy1, rzm);
  const eave = (x, z) => at(x, RF.fascia, z);
  face(
    'cabinet-roof-hip',
    [eave(rx0, rz1), eave(rx1, rz1), ridgeR, ridgeL],
    [0, 1, 0.3],
    cabinetCharts,
    CC.roofTop
  );
  face(
    'cabinet-roof-hip',
    [eave(rx1, rz0), eave(rx0, rz0), ridgeL, ridgeR],
    [0, 1, -0.3],
    cabinetCharts,
    CC.roofTop
  );
  face(
    'cabinet-roof-hip',
    [eave(rx1, rz1), eave(rx1, rz0), ridgeR],
    [0.3, 1, 0],
    cabinetCharts,
    CC.roofTop
  );
  face(
    'cabinet-roof-hip',
    [eave(rx0, rz0), eave(rx0, rz1), ridgeL],
    [-0.3, 1, 0],
    cabinetCharts,
    CC.roofTop
  );

  // Door: a raised panel on the front flat, with bevelled edges worn light.
  const dx0 = bx0 + BO.chamfer + DR.x,
    dx1 = bx1 - BO.chamfer - DR.x,
    zf = bz1 + DR.proud;
  const dOut = [
    at(dx0, DR.bottom, bz1),
    at(dx1, DR.bottom, bz1),
    at(dx1, DR.top, bz1),
    at(dx0, DR.top, bz1),
  ];
  const dIn = [
    at(dx0 + DR.bevel, DR.bottom + DR.bevel, zf),
    at(dx1 - DR.bevel, DR.bottom + DR.bevel, zf),
    at(dx1 - DR.bevel, DR.top - DR.bevel, zf),
    at(dx0 + DR.bevel, DR.top - DR.bevel, zf),
  ];
  face(
    'cabinet-door',
    dIn,
    [0, 0, 1],
    cabinetCharts,
    byHeight(CC.doorFoot, CC.doorHead, DR.bottom, DR.top)
  );
  const bevelOut = [
    [0, -1, 1],
    [1, 0, 1],
    [0, 1, 1],
    [-1, 0, 1],
  ];
  dOut.forEach((a, k) => {
    const b = dOut[(k + 1) % 4];
    face(
      'cabinet-door-bevel',
      [a, b, dIn[(k + 1) % 4], dIn[k]],
      bevelOut[k],
      cabinetCharts,
      CC.doorBevel
    );
  });

  // Louvres: each slat leans out from the door face to a lip below it.
  const lx = (dx0 + dx1) / 2;
  assert(
    lx - LV.halfWidth > dx0 + DR.bevel && lx + LV.halfWidth < dx1 - DR.bevel,
    'Louvres overhang the door'
  );
  for (const yt of LV.top) {
    assert(yt - LV.height > DR.bottom + DR.bevel && yt < DR.top - DR.bevel, 'Louvre off the door');
    face(
      'cabinet-louvre',
      [
        at(lx - LV.halfWidth, yt, zf),
        at(lx + LV.halfWidth, yt, zf),
        at(lx + LV.halfWidth, yt - LV.height, zf + LV.lip),
        at(lx - LV.halfWidth, yt - LV.height, zf + LV.lip),
      ],
      [0, 0.3, 1],
      cabinetCharts,
      CC.louvre
    );
  }

  // Handle: a vertical bar with a ridge, standing on the door face.
  assert(
    HD.x + HD.half < dx1 - DR.bevel &&
      HD.bottom > Math.max(...LV.top) &&
      HD.top < DR.top - DR.bevel,
    'Handle off the door'
  );
  const hz = zf + HD.proud;
  const hl = (y) => at(HD.x - HD.half, y, zf),
    hr = (y) => at(HD.x + HD.half, y, zf),
    hc = (y) => at(HD.x, y, hz);
  face(
    'cabinet-handle',
    [hl(HD.bottom), hc(HD.bottom), hc(HD.top), hl(HD.top)],
    [-1, 0, 0.5],
    cabinetCharts,
    CC.handle
  );
  face(
    'cabinet-handle',
    [hc(HD.bottom), hr(HD.bottom), hr(HD.top), hc(HD.top)],
    [1, 0, 0.5],
    cabinetCharts,
    CC.handle
  );
  face('cabinet-handle', [hl(HD.top), hc(HD.top), hr(HD.top)], [0, 1, 0], cabinetCharts, CC.handle);
  face(
    'cabinet-handle',
    [hl(HD.bottom), hr(HD.bottom), hc(HD.bottom)],
    [0, -1, 0],
    cabinetCharts,
    CC.handleShade
  );

  // 4. Rails (v4). Each side is ONE tube swept along a profile path traced from
  // its v1 parts: up the near post, a mitred bend, along the rail, the mirrored
  // bend and down the far post. Rings are shared between segments, and each
  // joint ring is the mitre section (stretched by 1 / cos of half the turn in the
  // bend plane), so the elbows are modelled joints in one closed skin.
  const RC = RL.colour,
    RU = RL.uv,
    NS = RL.sides,
    RR = RL.radius;
  const scale = (a, s) => a.map((v) => v * s);
  const add = (a, b) => a.map((v, k) => v + b[k]);
  const BX = [1, 0, 0];
  let railFlip = null;
  parts.rails.forEach((ids) => {
    const vs = [...new Set(ids.flatMap((i) => triangles[i]))].map((v) => points[v]);
    const rb = before.boundsOf(vs);
    const sx = (rb.min[0] + rb.max[0]) / 2;
    const mid = (ps, k) =>
      (Math.min(...ps.map((p) => p[k])) + Math.max(...ps.map((p) => p[k]))) / 2;
    const feet = vs.filter((p) => near(p[1], G));
    const z0 = mid(
        feet.filter((p) => p[2] < 0),
        2
      ),
      z1 = mid(
        feet.filter((p) => p[2] > 0),
        2
      );
    const yR = mid(
      vs.filter((p) => p[1] > 0.9),
      1
    );
    assert(near(Math.abs(sx), 2.2, 1e-4) && near(-z0, 3.5, 1e-4) && near(z1, 3.5, 1e-4));
    assert(near(yR, 1.0, 1e-4), 'Rail height changed');
    const b = RL.bend;
    const path = [
      [sx, G, z0],
      [sx, yR - b, z0],
      [sx, yR, z0 + b],
      [sx, yR, z1 - b],
      [sx, yR - b, z1],
      [sx, G, z1],
    ];
    const T = path.slice(1).map((p, i) => unit(sub(p, path[i])));
    const N = T.map((t) => unit(crossP(t, BX)));
    const lengths = T.map((_, i) => Math.hypot(...sub(path[i + 1], path[i])));
    const L = lengths.reduce((a, v) => a + v, 0);
    const lane = [-Math.sign(sx), 0, 0];
    const railColour = (p, n) => {
      let c = mix(RC.paint, RC.top, Math.max(0, n[1]));
      c = mix(c, RC.under, Math.max(0, -n[1]));
      if (p[1] < yR - b + 1e-3) c = mix(c, RC.scuff, 0.55 * Math.max(0, dot(n, lane)));
      return mix(c, RC.grime, 1 - (p[1] - G) / RC.grimeHeight);
    };
    const rings = [];
    let s = 0;
    path.forEach((P, i) => {
      let n, stretch;
      if (i === 0 || i === path.length - 1) {
        n = N[Math.min(i, N.length - 1)];
        stretch = 1;
      } else {
        n = unit(add(N[i - 1], N[i]));
        stretch = 1 / Math.sqrt((1 + dot(T[i - 1], T[i])) / 2);
      }
      if (i > 0) s += lengths[i - 1];
      const base = keptRecords.length + out.p.length;
      for (let k = 0; k <= NS; k++) {
        const th = (2 * Math.PI * k) / NS;
        const radial = add(scale(BX, Math.cos(th)), scale(n, Math.sin(th)));
        const p = add(P, add(scale(BX, RR * Math.cos(th)), scale(n, RR * stretch * Math.sin(th))));
        const nrm = unit(radial);
        out.p.push(p);
        out.uv.push([RU.u0 + (RU.du * k) / NS, RU.v0 + (RU.dv * s) / L]);
        out.n.push(nrm);
        out.c.push(railColour(p, nrm));
      }
      rings.push(base);
    });
    for (let i = 0; i + 1 < rings.length; i++)
      for (let k = 0; k < NS; k++) {
        const a = rings[i] + k,
          bq = rings[i] + k + 1,
          c = rings[i + 1] + k + 1,
          d = rings[i + 1] + k;
        const at = (v) => out.p[v - keptRecords.length];
        const tn = crossP(sub(at(bq), at(a)), sub(at(c), at(a)));
        const flip = dot(tn, out.n[a - keptRecords.length]) < 0;
        if (railFlip === null) railFlip = flip;
        assert.equal(flip, railFlip, 'Rail winding is inconsistent');
        indices.push(...(flip ? [a, c, bq, a, d, c] : [a, bq, c, a, c, d]));
      }
    built['rail-hoop'] = (built['rail-hoop'] ?? 0) + 2 * NS * (rings.length - 1);

    // Flared foot under each post: a hexagonal cone on the ground with its apex
    // inside the tube, faces aligned with the tube flats. No vertex meets the tube.
    const FT = RL.foot;
    assert(FT.radius > RR * 2 && FT.apex > 0.04, 'Foot must flare clear of the tube');
    assert(Math.abs(sx) - FT.radius > X, 'Foot must clear the plate');
    for (const [P, n] of [
      [path[0], N[0]],
      [path[path.length - 1], N[N.length - 1]],
    ]) {
      const ring = Array.from({ length: NS }, (_, k) => {
        const th = (2 * Math.PI * k) / NS;
        return add(P, add(scale(BX, FT.radius * Math.cos(th)), scale(n, FT.radius * Math.sin(th))));
      });
      const apex = add(P, [0, FT.apex, 0]);
      const chart = [
        {
          normal: [0, 1, 0],
          uv: (p) => [
            RU.u0 + RU.foot * ((p[0] - P[0]) / (2 * FT.radius) + 0.5),
            RU.v0 + RU.foot * ((p[2] - P[2]) / (2 * FT.radius) + 0.5),
          ],
        },
      ];
      ring.forEach((a, k) => {
        const bq = ring[(k + 1) % NS];
        const m = sub(scale(add(a, bq), 0.5), P);
        face(
          'rail-foot',
          [a, bq, apex],
          [m[0], 0.12, m[2]],
          chart,
          byHeight(RC.foot, RC.footTop, G, FT.apex)
        );
      });
    }
  });

  // 5. Sign (v5). The post is lathed from its side profile: base plate edge,
  // a pyramid top rising into the shaft, the hexagonal shaft, a pyramid cap.
  // The board is one section lofted round its rectangle. Post x, z and top,
  // and the board's extents and face, are read from the v1 parts.
  const SC = SG.colour,
    SU = SG.uv;
  const postVerts = [...new Set(parts.post.flatMap((i) => triangles[i]))];
  const ppb = before.boundsOf(postVerts.map((v) => points[v]));
  const px = (ppb.min[0] + ppb.max[0]) / 2,
    pz = (ppb.min[2] + ppb.max[2]) / 2,
    pTop = ppb.max[1];
  assert(near(px, SG.post.x, 1e-4) && near(pz, 0, 1e-4) && near(pTop, SG.post.top, 1e-4));
  assert(near(ppb.min[1], G), 'Sign post must stand on the ground');
  const sideUV = postVerts.filter((v) => Math.abs(normalOf(v)[1]) < 0.5).map(uvOf);
  const su0 = Math.min(...sideUV.map((u) => u[0])),
    su1 = Math.max(...sideUV.map((u) => u[0])),
    sv0 = Math.min(...sideUV.map((u) => u[1])),
    sv1 = Math.max(...sideUV.map((u) => u[1]));
  const planar = (o) =>
    [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ].map((normal) => {
      const axis = normal.findIndex((v) => v !== 0),
        ax = [0, 1, 2].filter((k) => k !== axis);
      return {
        normal,
        uv: (p) => [
          SU.u0 + SU.perMetre * (p[ax[0]] - o[ax[0]]),
          SU.v0 + SU.perMetre * (p[ax[1]] - o[ax[1]]),
        ],
      };
    });
  const postCharts = planar([px - 0.2, 0, pz - 0.2]);
  const SR = SG.shaft.radius,
    SN = SG.shaft.sides,
    BP = SG.base;
  // A vertex on +-x and flats facing +-z, so the board seats on a flat.
  const ringAt = (r, y) =>
    Array.from({ length: SN }, (_, k) => {
      const th = (2 * Math.PI * k) / SN;
      return [px + r * Math.cos(th), y, pz + r * Math.sin(th)];
    });
  const flat = SR * Math.cos(Math.PI / SN);

  // Base plate: four edge faces, then a pyramid top whose apex is inside the shaft.
  const bh = BP.half,
    yb = G + BP.thick,
    apexB = [px, yb + BP.rise, pz];
  assert(bh > SR * 2 && BP.thick > 0, 'Base plate must stand clear of the shaft');
  const collarAt = (r) => yb + BP.rise * (1 - r / bh); // pyramid height at offset r along x or z
  assert(collarAt(SR) > yb + 0.03 && apexB[1] < pTop, 'Collar must rise into the shaft');
  const plateC = [
    [px - bh, pz + bh],
    [px + bh, pz + bh],
    [px + bh, pz - bh],
    [px - bh, pz - bh],
  ];
  plateC.forEach((a, k) => {
    const b = plateC[(k + 1) % 4];
    const out = [(a[0] + b[0]) / 2 - px, 0, (a[1] + b[1]) / 2 - pz];
    face(
      'sign-base-edge',
      [
        [a[0], G, a[1]],
        [b[0], G, b[1]],
        [b[0], yb, b[1]],
        [a[0], yb, a[1]],
      ],
      out,
      postCharts,
      byHeight(SC.plate, SC.plateTop, G, yb)
    );
    face(
      'sign-base-collar',
      [[a[0], yb, a[1]], [b[0], yb, b[1]], apexB],
      [out[0], 1, out[2]],
      postCharts,
      byHeight(SC.plateTop, SC.shaftFoot, yb, apexB[1])
    );
  });

  // Shaft: one hexagonal hoop from inside the collar to the v1 top, smooth radial
  // normals, on the v1 post side chart.
  {
    const rings = [yb, pTop].map((y) => {
      const base = keptRecords.length + out.p.length;
      for (let k = 0; k <= SN; k++) {
        const th = (2 * Math.PI * k) / SN;
        const nrm = [Math.cos(th), 0, Math.sin(th)];
        out.p.push([px + SR * nrm[0], y, pz + SR * nrm[2]]);
        out.uv.push([su0 + ((su1 - su0) * k) / SN, sv0 + ((sv1 - sv0) * (y - G)) / (pTop - G)]);
        out.n.push(nrm);
        out.c.push(mix(SC.shaftFoot, SC.shaftTop, (y - G) / (pTop - G)));
      }
      return base;
    });
    for (let k = 0; k < SN; k++) {
      const a = rings[0] + k,
        b = rings[0] + k + 1,
        c = rings[1] + k + 1,
        d = rings[1] + k;
      const pAt = (v) => out.p[v - keptRecords.length];
      const tn = crossP(sub(pAt(b), pAt(a)), sub(pAt(c), pAt(a)));
      const flip = dot(tn, out.n[a - keptRecords.length]) < 0;
      indices.push(...(flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
    }
    built['sign-shaft'] = 2 * SN;
  }
  // Cap: a hexagonal pyramid on the shaft's top ring.
  const capRing = ringAt(SR, pTop),
    capApex = [px, pTop + SG.cap.rise, pz];
  capRing.forEach((a, k) => {
    const b = capRing[(k + 1) % SN];
    const m = sub(scale(add(a, b), 0.5), [px, pTop, pz]);
    face('sign-cap', [a, b, capApex], [m[0], 0.5 * SR, m[2]], postCharts, SC.cap);
  });

  // Board: one section (back, outer edge, rim, inner slope to the face) swept
  // round the v1 rectangle; the corners mitre where neighbouring faces meet.
  const boardVerts = [...new Set(parts.board.flatMap((i) => triangles[i]))];
  const bb = before.boundsOf(boardVerts.map((v) => points[v]));
  const [gx0, gy0, gzb] = bb.min,
    [gx1, gy1, gzf] = bb.max;
  const rimZ = SG.board.rim,
    ins = SG.board.inset;
  assert(gzb < flat && gzb > pz, 'Board back must seat on the post front flat');
  assert(rimZ > gzf && ins > 0 && ins < (gy1 - gy0) / 4, 'Board rim out of range');
  const gxm = (gx0 + gx1) / 2,
    gym = (gy0 + gy1) / 2;
  const outer = [
    [gx0, gy0],
    [gx1, gy0],
    [gx1, gy1],
    [gx0, gy1],
  ];
  const inner = [
    [gx0 + ins, gy0 + ins],
    [gx1 - ins, gy0 + ins],
    [gx1 - ins, gy1 - ins],
    [gx0 + ins, gy1 - ins],
  ];
  const P3 = (q, z) => [q[0], q[1], z];
  face(
    'sign-board-back',
    outer.map((q) => P3(q, gzb)),
    [0, 0, -1],
    boardCharts,
    SC.back
  );
  outer.forEach((a, k) => {
    const b = outer[(k + 1) % 4];
    const o = unit([(a[0] + b[0]) / 2 - gxm, (a[1] + b[1]) / 2 - gym, 0]).map((v) => Math.round(v));
    face(
      'sign-board-edge',
      [P3(a, gzb), P3(b, gzb), P3(b, rimZ), P3(a, rimZ)],
      o,
      boardCharts,
      SC.edge
    );
    face(
      'sign-board-border',
      [P3(a, rimZ), P3(b, rimZ), P3(inner[(k + 1) % 4], gzf), P3(inner[k], gzf)],
      [-0.3 * o[0], -0.3 * o[1], 1],
      boardCharts,
      byHeight(SC.borderFoot, SC.border, gy0, gy1)
    );
  });
  face(
    'sign-board-face',
    inner.map((q) => P3(q, gzf)),
    [0, 0, 1],
    boardCharts,
    byHeight(SC.panelFoot, SC.panelHead, gy0 + ins, gy1 - ins)
  );

  // Clamp brackets: triangular prisms from inside the board back to behind the
  // post, which passes through them. Their open front face is inside the board.
  const BK = SG.brackets;
  const zF = gzb + BK.seat;
  assert(zF < gzf && BK.back < pz - flat - 0.02, 'Bracket must join the board to behind the post');
  assert(BK.half > SR + 0.02, 'Bracket must wrap the post');
  for (const yc of BK.y) {
    const h = BK.height / 2;
    assert(yc - h > gy0 + 0.02 && yc + h < gy1 - 0.02, 'Bracket off the board');
    const A = (x) => [x, yc + h, zF],
      B = (x) => [x, yc - h, zF],
      Cn = (x) => [x, yc, BK.back];
    const x0 = px - BK.half,
      x1 = px + BK.half;
    face('sign-bracket', [A(x0), A(x1), Cn(x1), Cn(x0)], [0, 1, -0.3], postCharts, SC.bracket);
    face(
      'sign-bracket',
      [B(x1), B(x0), Cn(x0), Cn(x1)],
      [0, -1, -0.3],
      postCharts,
      SC.bracketUnder
    );
    face('sign-bracket', [A(x1), B(x1), Cn(x1)], [1, 0, 0], postCharts, SC.bracket);
    face('sign-bracket', [B(x0), A(x0), Cn(x0)], [-1, 0, 0], postCharts, SC.bracket);
  }

  const vertexCount = keptRecords.length + out.p.length,
    triangleCount = indices.length / 3;
  const partTriangles = { kept: keptTris.length, ...built };
  assert.equal(
    Object.values(partTriangles).reduce((s, n) => s + n, 0),
    triangleCount,
    'Part tally does not cover the output'
  );
  assert(triangleCount <= spec.triangles, 'Triangle budget exceeded: ' + triangleCount);
  assert(vertexCount < 65536);
  const allPoints = [...keptRecords.map((v) => points[v]), ...out.p];
  const allUV = [...keptRecords.map(uvOf), ...out.uv];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, d] = [0, 1, 2].map((k) => indices[i + k]);
    assert(
      Math.hypot(...crossP(sub(allPoints[b], allPoints[a]), sub(allPoints[d], allPoints[a]))) >
        1e-8,
      'Degenerate triangle'
    );
    if (a < keptRecords.length) continue;
    const u = [allUV[a], allUV[b], allUV[d]];
    assert(
      Math.abs(
        (u[1][0] - u[0][0]) * (u[2][1] - u[0][1]) - (u[1][1] - u[0][1]) * (u[2][0] - u[0][0])
      ) > 1e-10,
      'Degenerate UV triangle at ' + JSON.stringify([a, b, d].map((v) => allPoints[v]))
    );
  }
  // Treads stand on the plate top, inside its top ring and clear of the bevels.
  assert(
    TR.base < Y && TR.base > Y - 0.002 && TR.x < PE - 0.01,
    'Treads must sit on the plate top'
  );
  const bounds = before.boundsOf(allPoints);
  for (const side of ['min', 'max'])
    for (let k = 0; k < 3; k++)
      assert(near(bounds[side][k], before.bounds[side][k], 1e-6), 'Fixture envelope changed');

  // Write: same JSON, same view order (indices, interleaved vertices, maps).
  const local = out.p.map((p) =>
    p.map((v, k) => Math.fround((v - parent.translation[k] - spec.offset[k]) / parent.scale[k]))
  );
  const json = structuredClone(j);
  const align = (n) => Math.ceil(n / 8) * 8;
  const indexView = json.accessors[primitive.indices].bufferView;
  assert.equal(indexView, 2);
  assert.equal(vertexView, 3);
  assert.equal(json.accessors[primitive.indices].componentType, 5123);
  const layout = [];
  let cursor = 0;
  for (const [id, length] of [
    [indexView, indices.length * 2],
    [vertexView, vertexCount * 44],
    ...json.images.map((im) => [im.bufferView, j.bufferViews[im.bufferView].byteLength]),
  ]) {
    cursor = align(cursor);
    layout.push([id, cursor, length]);
    json.bufferViews[id].byteOffset = cursor;
    json.bufferViews[id].byteLength = length;
    cursor += length;
  }
  const binLength = Math.ceil(cursor / 4) * 4;
  json.buffers[0].byteLength = binLength;
  json.accessors[primitive.indices].count = indices.length;
  for (const id of Object.values(primitive.attributes)) json.accessors[id].count = vertexCount;
  const nextBin = Buffer.alloc(binLength);
  indices.forEach((v, i) => nextBin.writeUInt16LE(v, layout[0][1] + i * 2));
  keptRecords.forEach((v, i) => record(v).copy(nextBin, layout[1][1] + i * 44));
  for (let i = 0; i < out.p.length; i++) {
    const o = layout[1][1] + (keptRecords.length + i) * 44;
    local[i].forEach((v, k) => nextBin.writeFloatLE(v, o + k * 4));
    out.uv[i].forEach((v, k) => nextBin.writeFloatLE(v, o + 12 + k * 4));
    out.n[i].forEach((v, k) => nextBin.writeFloatLE(v, o + 20 + k * 4));
    out.c[i].forEach((v, k) => nextBin.writeFloatLE(v, o + 32 + k * 4));
  }
  const allLocal = Array.from({ length: vertexCount }, (_, i) =>
    [0, 1, 2].map((k) => nextBin.readFloatLE(layout[1][1] + i * 44 + k * 4))
  );
  const positionAccessor = json.accessors[primitive.attributes.POSITION];
  positionAccessor.min = [0, 1, 2].map((k) => Math.min(...allLocal.map((p) => p[k])));
  positionAccessor.max = [0, 1, 2].map((k) => Math.max(...allLocal.map((p) => p[k])));
  for (const [id, offset, length] of layout.slice(2)) {
    const old = j.bufferViews[id];
    bin.copy(nextBin, offset, old.byteOffset ?? 0, (old.byteOffset ?? 0) + length);
  }
  const jsonBytes = Buffer.from(JSON.stringify(json)),
    paddedJson = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 0x20);
  jsonBytes.copy(paddedJson);
  const bytes = Buffer.alloc(12 + 8 + paddedJson.length + 8 + nextBin.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(paddedJson.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  paddedJson.copy(bytes, 20);
  bytes.writeUInt32LE(nextBin.length, 20 + paddedJson.length);
  bytes.writeUInt32LE(0x004e4942, 24 + paddedJson.length);
  nextBin.copy(bytes, 28 + paddedJson.length);

  const after = inspect(bytes, 'tire', { vertices: vertexCount, triangles: triangleCount });
  for (const side of ['min', 'max'])
    for (let k = 0; k < 3; k++)
      assert(near(after.bounds[side][k], before.bounds[side][k], 1e-6), 'Written envelope changed');
  const mapHashes = (doc, b) =>
    doc.images.map((im) => {
      const v = doc.bufferViews[im.bufferView];
      return hash(b.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
    });
  assert.deepEqual(mapHashes(after.j, after.bin), mapHashes(j, bin), 'Embedded map changed');
  const outputSha256 = hash(bytes);
  assert.equal(
    outputSha256,
    spec.output,
    'Rebuilt tire deck output identity changed: ' + outputSha256
  );
  assert.equal(
    bytes.length,
    spec.fileBytes,
    'Rebuilt tire deck byte count changed: ' + bytes.length
  );
  const normalizedPoints = after.local.map((p) =>
    p.map((v, k) => v * parent.scale[k] + parent.translation[k])
  );
  return {
    bytes,
    receipt: {
      method: spec.rebuildMethod,
      boardFit: fitted.receipt,
      actualFinalBounds: after.boundsOf(normalizedPoints),
      bounds: after.bounds,
      inputSha256: spec.baseline,
      outputSha256,
      deck: D,
      cabinet: CB,
      sign: SG,
      partTriangles,
      triangles: triangleCount,
      indexedVertices: vertexCount,
      bytesBefore: fitted.bytes.length,
      bytesAfter: bytes.length,
      unchangedEnvelope: true,
      maps: 2,
      materials: 1,
    },
  };
}

export function assertSourceInputs(key, provider, prepared) {
  const spec = FIXTURES[key];
  assert(spec, 'Unknown fixed yard fixture');
  assert.equal(hash(provider), spec.provider, 'Immutable provider input drift');
  assert.equal(hash(prepared), spec.prepared, 'Immutable prepared input drift');
}
export function assertCurrentOutput(key, current, candidate) {
  const spec = FIXTURES[key];
  assert(spec);
  assert.equal(hash(candidate), spec.output, 'Unreviewed yard fixture derivative');
  assert(
    [spec.baseline, spec.previousOutput, spec.output].filter(Boolean).includes(hash(current)),
    'Current yard output is neither baseline nor reviewed derivative'
  );
}
