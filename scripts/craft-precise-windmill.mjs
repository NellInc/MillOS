/** farm-windmill: a tower windmill authored from primitives in the accepted raw frame.
 *
 * What it builds (every vertex is new; nothing is imported from a provider mesh):
 * - a battered white plaster tower (lime-wash weathering: drip streaks under the cap,
 *   a shadow band under the drip ring, warm ground splash at the foot);
 * - a jointed stone plinth: two courses of individually sized stones and a chamfered
 *   coping course over a mortar core, on the wide stone foot;
 * - a copper-brown ogee cap revolved with a flared drip ring, twelve radial battens swept
 *   along the ogee, and a small finial, sitting on a timber curb ring at the tower head;
 * - a windshaft that leaves the cap through a neck-bearing housing seated in the cap wall,
 *   ending in a fixed bearing collar;
 * - the rotor: a flanged poll end and nose cap with two staggered through-stocks carrying
 *   four open timber lattice sails;
 * - a full-height ledged plank door in a dressed-stone surround (quoined jambs, lintel,
 *   threshold), set back behind the surround, plus five small deep-set mullioned windows
 *   stepping up the tower.
 *
 * Run:  node scripts/craft-precise-windmill.mjs <out.glb>      (or --output=<out.glb>)
 * Writes the GLB and <out.glb>.receipt.json. Refuses any path under public/.
 * `deriveWindmill(parentBytes)` is the same derivation for the precision stage.
 *
 * The immutable precision parent (assets/source/models/farm/windmill-pre-precision.glb)
 * supplies only its node frame (WindmillBody, uniform scale 6.79571, ground-centre origin),
 * its single material and its three texture slots; geometry and all three maps are new.
 *
 * Runtime contract (src/components/models/GeneratedWindmill.tsx): sail weights are
 * computed from rest positions, smoothstep(x, X_IN, X_OUT) times a radial fade at
 * 0.55-0.57 about the hub (y 0.0948, z 0.031). Every rotor vertex must evaluate exactly
 * one and every static vertex exactly zero, so no vertex may sit between X_IN and X_OUT
 * near the axis. The band is 0.0003 raw wide, so the fixed bearing collar stops at
 * STATIC_X_MAX and the rotor flange starts at ROTOR_X_MIN, 0.0004 raw (2.7 mm delivered)
 * apart: one running joint between two faces, inside the turntable probe's 5 mm contact
 * radius. The runtime band and these constants change together.
 * Working if replay is byte-identical, every part is closed and outward, and every
 * vertex weight is exactly 0 or 1.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO, VERSION } from '@gltf-transform/core';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import sharp from 'sharp';

export const PARENT_PATH = 'assets/source/models/farm/windmill-pre-precision.glb';
export const PARENT_SHA256 = 'c2c99cbc01377a0da385b0eec5db7b6efad0d39d77bbddc5c41a6afde1541790';
const HUB = [0.0948, 0.031];
// Mirrors SAIL_X_IN/OUT and SAIL_R_IN/OUT in GeneratedWindmill.tsx.
const X_IN = 0.2277,
  X_OUT = 0.228,
  R_IN = 0.55,
  R_OUT = 0.57;
const STATIC_X_MAX = 0.22765,
  ROTOR_X_MIN = 0.22805;
const SHA = (bytes) => createHash('sha256').update(bytes).digest('hex');
const LOW = -0.5003532767295837;
const XNOSE = 0.29243865609169006;
const OLD_RADIUS = 0.5382265617518023;
const FOOT_RADIUS = 0.2631303381919861;
const CX = -0.03,
  CZ = 0.006;
const TOWER_Y0 = -0.438,
  TOWER_Y1 = 0.075,
  TOWER_R0 = 0.229,
  TOWER_R1 = 0.174;
const BATTER = (TOWER_R0 - TOWER_R1) / (TOWER_Y1 - TOWER_Y0);
const TILT = Math.atan(BATTER);
const wallRadius = (y) => TOWER_R0 - (y - TOWER_Y0) * BATTER;
/** Plaster atlas coordinates of a wall point: c once round the tower (CylinderGeometry
 * puts u 0 at +Z and 0.25 at +X), h from the tower foot (0) to its head (1). */
const plasterC = (phi) => ((((Math.PI / 2 - phi) / (Math.PI * 2)) % 1) + 1) % 1;
const plasterH = (y) => (y - TOWER_Y0) / (TOWER_Y1 - TOWER_Y0);
/** Small deep-set windows, one per floor, stepping round the tower: [index, azimuth, sill-top y]. */
const WINDOWS = [
  [0, Math.PI / 2, -0.3],
  [1, -0.7 * Math.PI, -0.25],
  [2, Math.PI, -0.155],
  [3, -Math.PI / 2, -0.085],
  [4, 0.3 * Math.PI, -0.05],
];
/** The door leaf: a little over 0.9 m wide and 2 m tall at delivered scale. */
const DOOR_W = 0.132,
  DOOR_H = 0.292;
const PALETTE = [
  ['plaster', [216, 216, 202], 226],
  ['stone', [134, 128, 112], 230],
  ['copper', [139, 78, 42], 150],
  ['wood', [109, 77, 44], 188],
  ['door', [116, 80, 48], 199],
  ['iron', [65, 68, 61], 163],
  ['mortar', [70, 72, 66], 240],
  ['limestone', [168, 160, 138], 224],
];
const tileIndex = (name) => PALETTE.findIndex(([key]) => key === name);

/** Deterministic hash in [0, 1). */
function rand(a, b = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
/** Value noise; periodic in x when `period` is given (the tower wraps around). */
function noise(x, y, seed, period = 0) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    fx = fade(x - xi),
    fy = fade(y - yi);
  const wrap = (i) => (period ? ((i % period) + period) % period : i);
  const at = (i, j) => rand(wrap(i) * 7919 + seed * 104729, j * 15485863 + seed);
  const a = at(xi, yi),
    b = at(xi + 1, yi),
    c = at(xi, yi + 1),
    d = at(xi + 1, yi + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

async function atlas() {
  const size = 512,
    colour = Buffer.alloc(size * size * 3),
    normal = Buffer.alloc(colour.length),
    orm = Buffer.alloc(colour.length);
  // Rain streaks: one run from under each window sill, and a ragged row from under the
  // curb where the cap sheds water. Each is [c, width, top h, length in h, darkness].
  const sillStreaks = WINDOWS.map(([k, phi, y0]) => [
    plasterC(phi),
    0.013 + rand(k, 71) * 0.004,
    plasterH(y0 - 0.0075),
    0.13 + rand(k, 72) * 0.08,
    0.1 + rand(k, 73) * 0.04,
  ]);
  const curbStreaks = Array.from({ length: 14 }, (_, k) => [
    (k + 0.2 + rand(k, 1) * 0.6) / 14,
    0.006 + rand(k, 2) * 0.01,
    1,
    0.12 + rand(k, 3) * 0.3,
    0.06 + rand(k, 4) * 0.06,
  ]);
  const streaks = [...sillStreaks, ...curbStreaks];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const tile = Math.floor(x / 128) + 4 * Math.floor(y / 256),
        [name, base, roughness] = PALETTE[tile];
      const u = x % 128,
        v = y % 256;
      const hash = ((((x * 374761393) ^ (y * 668265263)) >>> 0) % 997) / 997 - 0.5;
      // Multipliers per channel; most surfaces darken all three alike.
      let shade = 1,
        warm = 0,
        yellow = 0,
        green = 0,
        rough = roughness;
      if (name === 'plaster') {
        // Tile u runs once around the tower, v from the foot (top row) to the cap.
        const c = THREE.MathUtils.clamp((u - 3) / 122, 0, 1),
          h = THREE.MathUtils.clamp((v - 3) / 250, 0, 1);
        // Patchy lime-wash: whole patches of an older, greyer and creamier coat
        // between fresher white ones, with a little trowel mottle inside each.
        const coat = THREE.MathUtils.smoothstep(noise(c * 6, h * 3.2, 14, 6), 0.42, 0.62);
        shade -= 0.055 * coat;
        yellow += 0.022 * coat;
        shade -= 0.02 * (noise(c * 7, h * 4, 11, 7) - 0.5) * 2;
        shade -= 0.014 * (noise(c * 31, h * 18, 12, 31) - 0.5) * 2;
        rough += Math.round(18 * coat - 10 * (noise(c * 23, h * 13, 15, 23) - 0.5));
        for (const [sc, width, top, length, dark] of streaks) {
          const dc = Math.min(Math.abs(c - sc), 1 - Math.abs(c - sc));
          const wobble = width * (0.75 + 0.5 * noise(c * 90, h * 9, 16, 90));
          if (dc < wobble && h < top && h > top - length) {
            const fall = 1 - (top - h) / length;
            shade -= dark * fall * Math.pow(1 - dc / wobble, 0.7);
            yellow += 0.15 * dark * fall;
          }
        }
        // Shadowed, sooty band under the drip ring.
        if (h > 0.9) shade -= 0.09 * Math.pow((h - 0.9) / 0.1, 1.4);
        // Rising damp above the plinth: a darker green-grey band with a ragged top.
        const damp = 0.16 + 0.05 * noise(c * 24, 0, 17, 24);
        if (h < damp) {
          const wet = Math.pow(1 - h / damp, 0.9);
          shade -= 0.15 * wet;
          green += 0.035 * wet;
          rough -= Math.round(22 * wet);
        }
        shade += hash * 0.014;
      } else if (name === 'stone' || name === 'limestone') {
        // Each block samples its own window of this tile, so the low-frequency tint
        // field gives every block its own warm buff or cool blue-grey cast.
        const amount = name === 'stone' ? 1 : 0.6;
        shade +=
          amount *
          ((noise(u / 18, v / 18, 21) - 0.5) * 0.34 +
            (noise(u / 6, v / 6, 22) - 0.5) * 0.1 +
            hash * 0.04);
        warm = amount * (noise(u / 20, v / 20, 23) - 0.5) * 0.24;
        rough += Math.round((noise(u / 9, v / 9, 24) - 0.5) * 30);
      } else if (name === 'mortar') {
        shade += (noise(u / 5, v / 5, 31) - 0.5) * 0.08 + hash * 0.04;
      } else if (name === 'wood' || name === 'door') {
        shade +=
          hash * 0.025 +
          0.035 * Math.sin(u * 0.72 + Math.sin(v * 0.033) * 0.65) +
          0.018 * Math.sin(u * 1.8) +
          (noise(u / 16, v / 40, 41) - 0.5) * 0.06;
      } else if (name === 'copper') {
        shade += hash * 0.025 + 0.025 * Math.sin(u * 0.15) + 0.008 * Math.sin(v * 0.2);
        shade += (noise(u / 14, v / 24, 51) - 0.5) * 0.05;
      } else shade += hash * 0.025;
      const at = (y * size + x) * 3;
      const tint = [0.55, 0.7, 0.95];
      // yellow takes blue (an ageing cream coat); green takes red and blue (algae).
      const extra = [green, 0, yellow + 0.6 * green];
      for (let k = 0; k < 3; k++)
        colour[at + k] = THREE.MathUtils.clamp(
          Math.round(base[k] * (shade - warm * tint[k] - extra[k])),
          0,
          255
        );
      normal[at] = 128;
      normal[at + 1] = 128;
      normal[at + 2] = 255;
      orm[at] = 255;
      orm[at + 1] = THREE.MathUtils.clamp(rough, 0, 255);
      orm[at + 2] = 0;
    }
  const encode = (data) =>
    sharp(data, { raw: { width: size, height: size, channels: 3 } })
      .jpeg({ quality: 94, chromaSubsampling: '4:4:4', mozjpeg: false })
      .toBuffer();
  return Promise.all([encode(colour), encode(normal), encode(orm)]);
}

/** Raw-frame sail weight exactly as the runtime computes it from Float32 positions. */
const weight = (x, y, z) =>
  THREE.MathUtils.smoothstep(Math.fround(x), X_IN, X_OUT) *
  (1 -
    THREE.MathUtils.smoothstep(
      Math.hypot(Math.fround(y) - HUB[0], Math.fround(z) - HUB[1]),
      R_IN,
      R_OUT
    ));

function construct() {
  const parts = [];
  /** Orient, de-degenerate, chart into the atlas tile and weld one closed part. */
  const add = (name, source, style, rotor = false, window = [0, 0, 1, 1], flat = false) => {
    const t = tileIndex(style);
    if (t < 0) throw new Error('Unknown authored surface');
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    const p = g.getAttribute('position'),
      n = g.getAttribute('normal'),
      uv = g.getAttribute('uv');
    const keep = [];
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3(),
      face = new THREE.Vector3(),
      sum = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      face.crossVectors(b.clone().sub(a), c.clone().sub(a));
      if (face.length() < 2e-12) continue;
      sum.set(0, 0, 0);
      for (let k = 0; k < 3; k++) sum.add(new THREE.Vector3().fromBufferAttribute(n, i + k));
      const order = face.dot(sum) < 0 ? [0, 2, 1] : [0, 1, 2];
      face.normalize();
      if (order[1] === 2) face.negate();
      for (const k of order) keep.push(i + k);
      if (flat) for (let k = 0; k < 3; k++) n.setXYZ(i + k, face.x, face.y, face.z);
    }
    const out = new THREE.BufferGeometry();
    const pos = [],
      nor = [],
      tex = [];
    for (const i of keep) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) || 1;
      nor.push(n.getX(i) / l, n.getY(i) / l, n.getZ(i) / l);
      const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1),
        v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
      // Image data uses top-down rows. glTF UV V=0 samples the first row.
      tex.push(
        ((t % 4) * 128 + 3 + (window[0] + u * window[2]) * 122) / 512,
        (Math.floor(t / 4) * 256 + 3 + (window[1] + v * window[3]) * 250) / 512
      );
    }
    g.dispose();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(tex, 2));
    // Weld only identical position/normal/UV tuples, keeping hard edges and seams.
    const indexed = mergeVertices(out, 1e-7);
    out.dispose();
    parts.push({ name, geometry: indexed, style, rotor });
  };
  const stoneWindow = (seed) => {
    const s = 0.34 + rand(seed, 91) * 0.2;
    return [rand(seed, 92) * (1 - s), rand(seed, 93) * (1 - s), s, s];
  };
  const box = (name, at, size, style, window) =>
    add(name, new THREE.BoxGeometry(...size).translate(...at), style, false, window);
  /** A cylinder about +X through the hub, `back` radius at x0 and `front` radius at x1. */
  const shaft = (name, x0, x1, back, front, style, segments, rotor) =>
    add(
      name,
      new THREE.CylinderGeometry(front, back, x1 - x0, segments)
        .rotateZ(-Math.PI / 2)
        .translate((x0 + x1) / 2, HUB[0], HUB[1]),
      style,
      rotor
    );
  /** A box authored on the battered tower wall: local +X outward along azimuth `phi`
   * (0 = +X, PI/2 = +Z), +Y up the wall face, +Z along the wall; origin on the wall line
   * at height `y0`. */
  const onWall = (name, phi, y0, [x0, x1, ya, yb, z0, z1], style, window) => {
    const r = wallRadius(y0);
    add(
      name,
      new THREE.BoxGeometry(x1 - x0, yb - ya, z1 - z0)
        .translate((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2)
        .rotateZ(TILT)
        .rotateY(-phi)
        .translate(CX + r * Math.cos(phi), y0, CZ + r * Math.sin(phi)),
      style,
      false,
      window
    );
  };
  /** Revolve an axis-to-axis (r, y) profile about the tower axis, or with `onShaft`
   * an (r, x) profile about the windshaft axis through the hub. Points in `hard`
   * split the normal; others average their two edges. */
  const revolve = (name, profile, hard, segments, style, onShaft = false, rotor = false) => {
    const edges = [];
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i],
        [r1, y1] = profile[i + 1],
        l = Math.hypot(r1 - r0, y1 - y0);
      edges.push({ n: [(y1 - y0) / l, -(r1 - r0) / l], l });
    }
    const total = edges.reduce((s, e) => s + e.l, 0);
    const pointNormal = (i, e) => {
      const own = edges[e].n;
      const other = i === e ? edges[e - 1] : edges[e + 1];
      if (hard.has(i) || !other) return own;
      const nr = own[0] + other.n[0],
        ny = own[1] + other.n[1],
        l = Math.hypot(nr, ny);
      return [nr / l, ny / l];
    };
    const pos = [],
      nor = [],
      tex = [];
    let along = 0;
    edges.forEach((edge, e) => {
      const ends = [e, e + 1].map((i) => ({
        r: profile[i][0],
        y: profile[i][1],
        n: pointNormal(i, e),
      }));
      const v0 = along / total,
        v1 = (along + edge.l) / total;
      along += edge.l;
      const vert = (end, s, v) => {
        const phi = (s / segments) * Math.PI * 2,
          sn = Math.sin(phi),
          cs = Math.cos(phi);
        if (onShaft) {
          pos.push(end.y, HUB[0] + end.r * sn, HUB[1] + end.r * cs);
          nor.push(end.n[1], end.n[0] * sn, end.n[0] * cs);
        } else {
          pos.push(CX + end.r * sn, end.y, CZ + end.r * cs);
          nor.push(end.n[0] * sn, end.n[1], end.n[0] * cs);
        }
        tex.push(s / segments, v);
      };
      for (let s = 0; s < segments; s++) {
        const quad = [
          [ends[0], s, v0],
          [ends[1], s, v1],
          [ends[1], s + 1, v1],
          [ends[0], s, v0],
          [ends[1], s + 1, v1],
          [ends[0], s + 1, v0],
        ];
        for (const q of quad) vert(...q);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(tex, 2));
    add(name, g, style, rotor);
  };
  /** Sweep a closed w x t rectangle along points with per-point outward normals. */
  const sweep = (name, points, normals, sides, w, t, style) => {
    const pos = [],
      nor = [],
      tex = [];
    const corner = (k, a, b) =>
      points[k]
        .clone()
        .addScaledVector(sides[k], (a * w) / 2)
        .addScaledVector(normals[k], (b * t) / 2);
    const faces = [
      [-1, -1, 1, -1, (k) => normals[k].clone().negate()],
      [1, -1, 1, 1, (k) => sides[k].clone()],
      [1, 1, -1, 1, (k) => normals[k].clone()],
      [-1, 1, -1, -1, (k) => sides[k].clone().negate()],
    ];
    const last = points.length - 1;
    faces.forEach(([a0, b0, a1, b1, normalAt], f) => {
      for (let k = 0; k < last; k++) {
        const quad = [
          [k, a0, b0, 0],
          [k + 1, a0, b0, 0],
          [k + 1, a1, b1, 1],
          [k, a0, b0, 0],
          [k + 1, a1, b1, 1],
          [k, a1, b1, 1],
        ];
        for (const [kk, a, b, side] of quad) {
          pos.push(...corner(kk, a, b).toArray());
          nor.push(...normalAt(kk).toArray());
          tex.push((f + side) / 4, kk / last);
        }
      }
    });
    for (const [k, sign] of [
      [0, -1],
      [last, 1],
    ]) {
      const tangent = points[Math.min(last, k + 1)]
        .clone()
        .sub(points[Math.max(0, k - 1)])
        .normalize()
        .multiplyScalar(sign);
      const ring = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (const tri of [
        [0, 1, 2],
        [0, 2, 3],
      ])
        for (const i of tri) {
          pos.push(...corner(k, ...ring[i]).toArray());
          nor.push(...tangent.toArray());
          tex.push((ring[i][0] + 1) / 2, (ring[i][1] + 1) / 2);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(tex, 2));
    add(name, g, style);
  };
  // Eight-sided chamfered timber section, closed caps, straight longitudinal grain.
  const beam = (name, a, b, width, depth, style = 'wood', rotor = false) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      direction = end.clone().sub(start),
      length = direction.length();
    const w = depth / 2,
      h = width / 2,
      bevel = Math.min(w, h) * 0.18;
    const shape = new THREE.Shape();
    [
      [-w + bevel, -h],
      [w - bevel, -h],
      [w, -h + bevel],
      [w, h - bevel],
      [w - bevel, h],
      [-w + bevel, h],
      [-w, h - bevel],
      [-w, -h + bevel],
    ].forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: length,
      bevelEnabled: false,
      curveSegments: 1,
    });
    const p = g.getAttribute('position'),
      uv = g.getAttribute('uv'),
      normals = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++)
      uv.setXY(
        i,
        Math.abs(normals.getZ(i)) > 0.9
          ? (p.getX(i) + w) / (2 * w)
          : 0.5 + Math.atan2(p.getY(i), p.getX(i)) / (Math.PI * 2),
        p.getZ(i) / length
      );
    g.translate(0, 0, -length / 2)
      .applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize())
      )
      .translate(...start.add(end).multiplyScalar(0.5).toArray());
    add(name, g, style, rotor);
  };
  /** A straight block between two lines of the same azimuth: x radial, z along the wall. */
  const plinthStone = (name, phiA, phiB, rIn, rOut, y0, y1, style, window, chamfer = 0) => {
    const mid = (phiA + phiB) / 2,
      rMid = (rIn + rOut) / 2,
      length = 2 * rMid * Math.sin((phiB - phiA) / 2);
    const g = new THREE.BoxGeometry(rOut - rIn, y1 - y0, length);
    if (chamfer) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++)
        if (p.getX(i) > 0 && p.getY(i) > 0) p.setX(i, p.getX(i) - chamfer);
    }
    g.translate(rMid, (y0 + y1) / 2, 0)
      .rotateY(-mid)
      .translate(CX, 0, CZ);
    add(name, g, style, false, window, chamfer > 0);
  };

  // ---------------------------------------------------------------- foot and plinth
  // The wide foot lies wholly outside the radial gate (r from the hub >= 0.5738).
  add(
    'foundation-foot',
    new THREE.CylinderGeometry(FOOT_RADIUS, FOOT_RADIUS, -0.479 - LOW, 32).translate(
      CX,
      (LOW - 0.479) / 2,
      CZ
    ),
    'mortar'
  );
  add(
    'plinth-core',
    // Its top stays below the learning view's ground floor (WindmillInterior, top -0.4235).
    new THREE.CylinderGeometry(0.2255, 0.229, 0.4788 - 0.4245, 32).translate(
      CX,
      (-0.4788 - 0.4245) / 2,
      CZ
    ),
    'mortar'
  );
  // The door opening, its quoins and threshold occupy the +X azimuths.
  const doorGap = Math.asin((DOOR_W / 2 + 0.0305) / 0.234) + 0.012;
  const courses = [
    { y0: -0.479, y1: -0.4565, min: 0.05, spread: 0.035, chamfer: 0 },
    { y0: -0.4565, y1: -0.4345, min: 0.045, spread: 0.032, chamfer: 0 },
    { y0: -0.4345, y1: -0.4215, min: 0.075, spread: 0.03, chamfer: 0.0068 },
  ];
  courses.forEach((course, c) => {
    const span = Math.PI * 2 - 2 * doorGap,
      rMean = 0.236;
    const lengths = [];
    for (let total = 0, i = 0; total < span * rMean; i++) {
      const l = course.min + rand(c * 101 + 7, i) * course.spread;
      lengths.push(l);
      total += l;
    }
    const scale = (span * rMean) / lengths.reduce((s, l) => s + l, 0);
    let phi = doorGap;
    lengths.forEach((l, i) => {
      const seed = c * 1000 + i,
        dphi = (l * scale) / rMean,
        joint = 0.0032 / rMean;
      // Hand-dressed rubble: each stone sits its own height in the bed and stands
      // its own depth proud of the core.
      const top = course.y1 - 0.0016 - (c < 2 ? rand(seed, 3) * 0.0036 : 0);
      plinthStone(
        `plinth-${c}-${i}`,
        phi + joint / 2,
        phi + dphi - joint / 2,
        0.221,
        (c < 2 ? 0.239 : 0.2515) + rand(seed, 4) * (c < 2 ? 0.011 : 0.0015),
        course.y0 + (c ? 0.0012 : 0),
        top,
        rand(seed, 5) < 0.22 ? 'limestone' : 'stone',
        stoneWindow(seed),
        course.chamfer
      );
      phi += dphi;
    });
  });

  // ---------------------------------------------------------------- tower and cap
  add(
    'plaster-tower',
    new THREE.CylinderGeometry(TOWER_R1, TOWER_R0, TOWER_Y1 - TOWER_Y0, 40).translate(
      CX,
      (TOWER_Y0 + TOWER_Y1) / 2,
      CZ
    ),
    'plaster'
  );
  // Timber curb the cap turns on: a ring proud of the tower head, its top hidden in the
  // cap skirt. An annulus, not a disc, so the learning-view section stays open.
  revolve(
    'cap-curb',
    [
      [0.168, 0.046],
      [0.1845, 0.046],
      [0.1845, 0.0656],
      [0.168, 0.0656],
      [0.168, 0.046],
    ],
    new Set([0, 1, 2, 3, 4]),
    32,
    'wood'
  );
  // The lid at y 0.065 is one the learning-view section removes (windmillCutaway.ts).
  const capProfile = [
    [0, 0.065],
    [0.188, 0.065],
    [0.1965, 0.0705],
    [0.1965, 0.0785],
    [0.1905, 0.0835],
    [0.188, 0.091],
    [0.185, 0.098],
    [0.173, 0.123],
    [0.153, 0.156],
    [0.122, 0.19],
    [0.087, 0.218],
    [0.052, 0.236],
    [0.018, 0.247],
    [0, 0.2485],
  ];
  // 36 sides keep every batten (at 15 + 30k degrees) seated: chord sag 0.7 mm < 0.9 mm seat.
  revolve('ogee-cap', capProfile, new Set([1, 2, 3, 4, 5]), 36, 'copper');
  // Twelve battens swept up the ogee, seated slightly into the copper.
  {
    const run = [...capProfile.slice(5, 12), [0.026, 0.2444]];
    const normal2 = run.map((point, k) => {
      const prev = run[Math.max(0, k - 1)],
        next = run[Math.min(run.length - 1, k + 1)];
      const dr = next[0] - prev[0],
        dy = next[1] - prev[1],
        l = Math.hypot(dr, dy);
      return [dy / l, -dr / l];
    });
    const w = 0.0042,
      t = 0.0026;
    for (let i = 0; i < 12; i++) {
      const phi = ((i + 0.5) * Math.PI) / 6,
        sn = Math.sin(phi),
        cs = Math.cos(phi);
      const normals = normal2.map(([nr, ny]) => new THREE.Vector3(nr * sn, ny, nr * cs));
      const points = run.map(([r, y], k) =>
        new THREE.Vector3(CX + r * sn, y, CZ + r * cs).addScaledVector(normals[k], t / 2 - 0.0009)
      );
      const sides = run.map(() => new THREE.Vector3(cs, 0, -sn));
      sweep(`cap-batten-${i}`, points, normals, sides, w, t, 'copper');
    }
  }
  revolve(
    'cap-finial',
    [
      [0, 0.244],
      [0.0105, 0.244],
      [0.0105, 0.2515],
      [0.0135, 0.2565],
      [0.0125, 0.2625],
      [0.0065, 0.2665],
      [0, 0.2675],
    ],
    new Set([1, 2]),
    16,
    'copper'
  );

  // ---------------------------------------------------------------- windshaft (static)
  // The shaft leaves the cap through a timber neck-bearing block on the cap front (cap
  // surface at hub height is x ~0.155); the block stands 0.04 proud so the bearing
  // reads from the ground. A bronze collar runs from the block face right up to the
  // sail band, and the rotor flange's back face sits ROTOR_X_MIN - STATIC_X_MAX
  // behind it, the running joint of the bearing. The collar lies past x 0.166 and
  // inside r 0.028, so the learning-view section keeps it whole as the fixed bearing.
  box('neck-bearing-block', [0.164, HUB[0], HUB[1]], [0.064, 0.068, 0.064], 'wood');
  shaft('bearing-collar', 0.195, STATIC_X_MAX, 0.0275, 0.0275, 'copper', 16, false);

  // ---------------------------------------------------------------- rotor
  // Dark iron flange, timber poll end through which the stocks pass, then a turned
  // bronze boss whose lip clamps the front stock: the stocks are held between the two.
  shaft('rotor-flange', ROTOR_X_MIN, 0.2365, 0.035, 0.035, 'iron', 16, true);
  shaft('poll-end', 0.2365, 0.267, 0.0285, 0.0285, 'wood', 16, true);
  revolve(
    'hub-boss',
    [
      [0, 0.2668],
      [0.032, 0.2668],
      [0.032, 0.2712],
      [0.022, 0.2732],
      [0.0185, 0.283],
      [0, XNOSE],
    ],
    new Set([1, 2, 3]),
    12,
    'copper',
    true,
    true
  );
  // Straight orthogonal stocks, individually fitted panels retain the modest
  // asymmetric source envelope; this does NOT claim exact rotational balance.
  const panels = [
    { tip: 0.517, lo: -0.049425, hi: 0.040183 },
    { tip: 0.517, lo: -0.04, hi: 0.04 },
    { tip: 0.504, lo: 0.06143, hi: 0.14143 },
    { tip: 0.505, lo: -0.045, hi: 0.045 },
  ];
  // The two through-stocks pass the poll end one behind the other, as on a real
  // mill, so they cross without sharing a plane; each pair of sails rides its stock.
  const stockX = [0.2455, 0.258];
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2,
      c = Math.cos(angle),
      s = Math.sin(angle),
      rotorX = stockX[i % 2];
    const point = (u, v) => [rotorX, HUB[0] + c * u - s * v, HUB[1] + s * u + c * v];
    if (i < 2) beam('stock-' + i, point(-0.535, 0), point(0.535, 0), 0.012, 0.017, 'wood', true);
    const panel = panels[i],
      inner = 0.145;
    for (const [n, v] of [
      ['inner', panel.lo],
      ['outer', panel.hi],
    ])
      beam(`sail-${i}-rail-${n}`, point(inner, v), point(panel.tip, v), 0.008, 0.013, 'wood', true);
    // Rungs are plain rectangular bars between the rails.
    const vLo = Math.min(0, panel.lo) - 0.002,
      vHi = Math.max(0, panel.hi) + 0.002;
    for (let row = 0; row <= 9; row++) {
      const u = inner + ((panel.tip - inner) * row) / 9;
      add(
        `sail-${i}-rung-${row}`,
        new THREE.BoxGeometry(0.012, 0.0055, vHi - vLo)
          .rotateX(angle)
          .translate(...point(u, (vLo + vHi) / 2)),
        'wood',
        true
      );
    }
  }

  // ---------------------------------------------------------------- door
  // Full-height ledged plank door in a dressed surround on the +X face. The surround
  // stands 0.0125 proud of the battered wall and the boards sit 0.010 behind its face.
  // The surround's back stops 0.016 into the wall, short of the learning view's interior
  // lining (WindmillInterior.tsx, inner face 0.019-0.020 inside the wall line).
  {
    const y0 = -0.4735,
      W = DOOR_W,
      H = DOOR_H,
      P = 0.0125,
      back = -0.016;
    const door = (name, spec, style, window) => onWall(name, 0, y0, spec, style, window);
    door(
      'door-threshold',
      [-0.0098, 0.0127, -0.0055, 0, -W / 2 - 0.013, W / 2 + 0.013],
      'limestone',
      stoneWindow(700)
    );
    door('door-backing', [-0.012, 0.0006, 0, H, -W / 2 - 0.004, W / 2 + 0.004], 'iron');
    // Open V-joints between the planks show the dark backing 0.0034 behind their faces.
    const gap = 0.0032,
      board = (W - 4 * gap) / 5;
    for (let i = 0; i < 5; i++) {
      const z0 = -W / 2 + i * (board + gap);
      door(`door-board-${i}`, [-0.004, 0.004, 0.001, H - 0.001, z0, z0 + board], 'door', [
        rand(i, 61) * 0.6,
        0,
        0.4,
        1,
      ]);
    }
    for (const [k, yy] of [
      [0, H * 0.18],
      [1, H * 0.8],
    ])
      door(
        `door-strap-${k}`,
        [0.0035, 0.0052, yy - 0.003, yy + 0.003, -W / 2 + 0.003, W * 0.12],
        'iron'
      );
    door(
      'door-ring',
      [0.0035, 0.0062, H * 0.5 - 0.0045, H * 0.5 + 0.0045, W / 2 - 0.018, W / 2 - 0.011],
      'iron'
    );
    for (const side of [-1, 1])
      for (let k = 0; k < 5; k++) {
        const width = k % 2 ? 0.019 : 0.027,
          inner = side * (W / 2),
          outer = side * (W / 2 + width);
        door(
          `door-quoin-${side < 0 ? 'l' : 'r'}-${k}`,
          [
            back,
            P,
            (k * H) / 5 + 0.0006,
            ((k + 1) * H) / 5 - 0.0006,
            Math.min(inner, outer),
            Math.max(inner, outer),
          ],
          'limestone',
          stoneWindow(710 + k * 2 + (side > 0 ? 1 : 0))
        );
      }
    door(
      'door-lintel',
      [back, P, H + 0.0006, H + 0.021, -W / 2 - 0.031, W / 2 + 0.031],
      'limestone',
      stoneWindow(730)
    );
  }

  // ---------------------------------------------------------------- windows
  // One small deep-set window per floor, stepping round the tower as the stair climbs.
  // The stone frame stands P proud of the wall; the dark light and its timber mullion sit
  // back in the reveal. The lintel and sill both overhang the jambs, so no two frame
  // stones share an edge.
  for (const [k, phi, y0] of WINDOWS) {
    const w = 0.036,
      h = 0.054,
      back = -0.006,
      P = 0.009;
    const win = (name, spec, style, window) =>
      onWall(`window-${k}-${name}`, phi, y0, spec, style, window);
    win('void', [back, 0.0008, 0, h, -w / 2 - 0.002, w / 2 + 0.002], 'iron');
    win('mullion', [-0.001, 0.0035, 0.0004, h - 0.0004, -0.0018, 0.0018], 'wood');
    win(
      'sill',
      [back, P + 0.003, -0.0075, 0, -w / 2 - 0.0105, w / 2 + 0.0105],
      'limestone',
      stoneWindow(800 + k)
    );
    win(
      'lintel',
      [back, P + 0.0015, h, h + 0.0085, -w / 2 - 0.0095, w / 2 + 0.0095],
      'limestone',
      stoneWindow(810 + k)
    );
    for (const side of [-1, 1])
      win(
        `jamb-${side < 0 ? 'l' : 'r'}`,
        [back, P, 0, h, side < 0 ? -w / 2 - 0.007 : w / 2, side < 0 ? -w / 2 : w / 2 + 0.007],
        'limestone',
        stoneWindow(820 + k * 2 + (side > 0 ? 1 : 0))
      );
  }
  return parts;
}

/** Closed (every directed edge paired by position) and outward (positive volume). */
function assertClosedOutward(part, positions, indices) {
  const key = (i) =>
    [0, 1, 2].map((k) => Math.round(Math.fround(positions[i * 3 + k]) * 1e7)).join(',');
  const edge = new Map();
  let volume = 0;
  const v = (i) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  for (let t = part.triangleStart * 3; t < (part.triangleStart + part.triangleCount) * 3; t += 3) {
    const ids = [indices[t], indices[t + 1], indices[t + 2]];
    const [a, b, c] = ids.map(v);
    if (new THREE.Triangle(a, b, c).getArea() < 1e-13) continue;
    volume += a.dot(new THREE.Vector3().crossVectors(b, c)) / 6;
    for (let k = 0; k < 3; k++) {
      const e = key(ids[k]) + '>' + key(ids[(k + 1) % 3]);
      edge.set(e, (edge.get(e) ?? 0) + 1);
    }
  }
  for (const [directed, count] of edge) {
    const [a, b] = directed.split('>');
    if (edge.get(b + '>' + a) !== count) throw new Error(`${part.name} is not closed`);
  }
  if (!(volume > 1e-16)) throw new Error(`${part.name} is not outward (${volume})`);
}

export async function deriveWindmill(parentBytes) {
  if (SHA(parentBytes) !== PARENT_SHA256)
    throw new Error('Windmill precision parent SHA-256 mismatch');
  const io = new NodeIO(),
    doc = await io.readBinary(new Uint8Array(parentBytes));
  const root = doc.getRoot(),
    node = root.listNodes().find((n) => n.getMesh()),
    mesh = node.getMesh(),
    primitive = mesh.listPrimitives()[0],
    material = primitive.getMaterial();
  if (
    root.listMeshes().length !== 1 ||
    mesh.listPrimitives().length !== 1 ||
    root.listMaterials().length !== 1 ||
    root.listTextures().length !== 3
  )
    throw new Error('Windmill parent assembly changed');
  const originalMatrix = node.getMatrix();
  const parts = construct(),
    positions = [],
    normals = [],
    uvs = [],
    indices = [],
    membership = [];
  let radius = 0,
    staticMaxX = -Infinity,
    rotorMinX = Infinity;
  for (const part of parts) {
    const g = part.geometry,
      p = g.getAttribute('position'),
      n = g.getAttribute('normal'),
      uv = g.getAttribute('uv'),
      offset = positions.length / 3,
      startTriangle = indices.length / 3;
    for (let i = 0; i < p.count; i++) {
      const xyz = [p.getX(i), p.getY(i), p.getZ(i)],
        w = weight(...xyz);
      if (w !== (part.rotor ? 1 : 0))
        throw new Error(`${part.name} violates raw rigid sail weight: ${w} at ${xyz}`);
      positions.push(...xyz);
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
      if (part.rotor) {
        radius = Math.max(radius, Math.hypot(xyz[1] - HUB[0], xyz[2] - HUB[1]));
        rotorMinX = Math.min(rotorMinX, xyz[0]);
      } else if (xyz[1] > -0.479) staticMaxX = Math.max(staticMaxX, xyz[0]);
    }
    const local = g.index?.array ?? Array.from({ length: p.count }, (_, i) => i);
    for (const index of local) indices.push(offset + index);
    membership.push({
      name: part.name,
      rotor: part.rotor,
      style: part.style,
      vertexStart: offset,
      vertexCount: p.count,
      triangleStart: startTriangle,
      triangleCount: local.length / 3,
    });
    g.dispose();
  }
  for (const part of membership) assertClosedOutward(part, positions, indices);
  if (radius > OLD_RADIUS + 1e-7) throw new Error('Authored rotor exceeds parent sweep');
  if (indices.length / 3 > 8384 || positions.length / 3 > 6989)
    throw new Error(
      `Windmill geometry budget exceeded: ${indices.length / 3} triangles, ${positions.length / 3} vertices`
    );
  const buffer = root.listBuffers()[0],
    old = [...primitive.listAttributes(), primitive.getIndices()];
  for (const semantic of primitive.listSemantics()) primitive.setAttribute(semantic, null);
  primitive.setIndices(null);
  const attr = (name, type, array) =>
    doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
  primitive
    .setAttribute(
      'POSITION',
      attr('windmill-precision-position', 'VEC3', new Float32Array(positions))
    )
    .setAttribute('NORMAL', attr('windmill-precision-normal', 'VEC3', new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', attr('windmill-precision-uv', 'VEC2', new Float32Array(uvs)))
    .setIndices(attr('windmill-precision-index', 'SCALAR', new Uint16Array(indices)));
  for (const a of old) if (a) a.dispose();
  const images = await atlas();
  const textures = [
    material.getBaseColorTexture(),
    material.getNormalTexture(),
    material.getMetallicRoughnessTexture(),
  ];
  textures.forEach((texture, i) => texture.setImage(images[i]).setMimeType('image/jpeg'));
  // The normal atlas is deliberately flat: every relief here is real geometry.
  if (JSON.stringify(node.getMatrix()) !== JSON.stringify(originalMatrix))
    throw new Error('Windmill node frame changed');
  root.getAsset().generator = `MillOS generated-asset pipeline, glTF-Transform ${VERSION}`;
  const bytes = await io.writeBinary(doc);
  if (bytes.length > 393000) throw new Error('Windmill file budget exceeded');
  const box = new THREE.Box3().setFromArray(new Float32Array(positions));
  const receipt = {
    parentSha256: PARENT_SHA256,
    outputSha256: SHA(bytes),
    bytes: bytes.length,
    vertices: positions.length / 3,
    triangles: indices.length / 3,
    rawBounds: [box.min.toArray(), box.max.toArray()],
    rotorRadius: radius,
    rotorMinX,
    staticMaxXAboveFoot: staticMaxX,
    hub: HUB,
    nodeMatrix: originalMatrix,
    parts: membership,
    appearance:
      'weathered white plaster with five deep-set windows, jointed stone plinth with chamfered coping, copper-brown ogee cap with drip ring and twelve swept battens on a timber curb, staggered through-stocks carrying open timber lattice sails, full-height plank door in a dressed surround; flat tangent-normal atlas',
    panelContract:
      'Individually fitted straight panels retain the source asymmetry; no exact fourfold-balance claim',
  };
  return { bytes, receipt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const output =
    args.find((a) => a.startsWith('--output='))?.slice(9) ?? args.find((a) => !a.startsWith('--'));
  if (!output) throw new Error('Usage: node scripts/craft-precise-windmill.mjs <out.glb>');
  if (path.resolve(output).startsWith(path.resolve('public') + path.sep))
    throw new Error('Direct public installation is root-owned');
  const result = await deriveWindmill(await fs.readFile(PARENT_PATH));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.bytes);
  await fs.writeFile(output + '.receipt.json', JSON.stringify(result.receipt, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...result.receipt, parts: result.receipt.parts.length }));
}
