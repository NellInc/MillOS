/**
 * Self-coplanar overlaps that shade differently, inside one delivered asset.
 *
 * The pair sweeps compare separate meshes, so they cannot see two faces of ONE
 * mesh lying on each other: a GLB whose own post cap sits flush in its own
 * handrail, or two tiles of one atlas laid on the same plane. Those still fight
 * for depth - within one draw call the later triangle wins wherever its
 * interpolated depth is less-or-equal, and two different triangulations of one
 * plane interpolate depth with different rounding - and the fight is only
 * visible when the two faces shade differently.
 *
 * A piece counts when two triangles face the same way (or either way on a
 * double-sided material), lie under `maxSep` of each other across their whole
 * in-plane overlap, flush included, and differ at the overlap's centre in what
 * the shader would read there: material factors, vertex colour, the texel each
 * texture returns (sampled, not compared by UV: flat atlas tiles shade alike
 * from different coordinates), or the interpolated vertex normal.
 *
 * Pure geometry and colour; `readGlbTriangles` adapts a gltf-transform Document.
 */
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import * as THREE from 'three';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a) => Math.hypot(a[0], a[1], a[2]);

/** A triangle record; `null` when degenerate. */
export function makeTriangle(a, b, c, extra = {}) {
  const raw = cross(sub(b, a), sub(c, a));
  const twice = length(raw);
  if (!(twice > 2e-10)) return null;
  const n = raw.map((v) => v / twice);
  const dominant = [0, 1, 2].reduce(
    (best, k) => (Math.abs(n[k]) > Math.abs(n[best]) ? k : best),
    0
  );
  const sign = n[dominant] < 0 ? -1 : 1;
  const cn = n.map((v) => v * sign);
  return {
    p: [a, b, c],
    n,
    cn,
    cd: dot(cn, a),
    sign,
    area: twice / 2,
    min: [0, 1, 2].map((k) => Math.min(a[k], b[k], c[k])),
    max: [0, 1, 2].map((k) => Math.max(a[k], b[k], c[k])),
    doubleSided: false,
    ...extra,
  };
}

/** Barycentric weights of `point` (assumed on or near the plane) in triangle `t`. */
export function barycentric(t, point) {
  const [a, b, c] = t.p;
  const v0 = sub(b, a);
  const v1 = sub(c, a);
  const v2 = sub(point, a);
  const d00 = dot(v0, v0);
  const d01 = dot(v0, v1);
  const d11 = dot(v1, v1);
  const d20 = dot(v2, v0);
  const d21 = dot(v2, v1);
  const denom = d00 * d11 - d01 * d01;
  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  return [1 - v - w, v, w];
}

const area2 = (poly) => {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
};
const ccw = (poly) => (area2(poly) < 0 ? poly.slice().reverse() : poly);
function clip(subject, clipper) {
  let output = subject;
  for (let i = 0; i < clipper.length && output.length; i += 1) {
    const [ax, ay] = clipper[i];
    const [bx, by] = clipper[(i + 1) % clipper.length];
    const side = ([px, py]) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const input = output;
    output = [];
    for (let k = 0; k < input.length; k += 1) {
      const current = input[k];
      const previous = input[(k + input.length - 1) % input.length];
      const sc = side(current);
      const sp = side(previous);
      const at = () => {
        const t = sp / (sp - sc);
        return [
          previous[0] + (current[0] - previous[0]) * t,
          previous[1] + (current[1] - previous[1]) * t,
        ];
      };
      if (sc >= 0) {
        if (sp < 0) output.push(at());
        output.push(current);
      } else if (sp >= 0) output.push(at());
    }
  }
  return output;
}

/**
 * Every coplanar overlap piece between two triangles of `tris` (same facing, or
 * opposite facing when either is double-sided), at most `maxSep` apart across
 * the overlap. Pure geometry: shading is judged by the caller.
 */
export function coplanarPieces(
  tris,
  { maxSep = 0.001, minPieceArea = 1e-8, cosLimit = 0.99985 } = {}
) {
  const bucketSize = 0.01;
  const buckets = new Map();
  const keyOf = (cn, cd) =>
    `${cn.map((v) => Math.round(v * 50)).join(',')}|${Math.round(cd / bucketSize)}`;
  tris.forEach((t, id) => {
    const key = keyOf(t.cn, t.cd);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  });
  const pieces = [];
  tris.forEach((t, i) => {
    const candidates = [-1, 0, 1].flatMap(
      (dd) => buckets.get(keyOf(t.cn, t.cd + dd * bucketSize)) ?? []
    );
    let basis = null;
    for (const j of candidates) {
      if (j <= i) continue;
      const u = tris[j];
      if (dot(t.cn, u.cn) < cosLimit || Math.abs(t.cd - u.cd) > maxSep + 1e-6) continue;
      const opposite = t.sign !== u.sign;
      if (opposite && !t.doubleSided && !u.doubleSided) continue;
      if (
        t.max[0] + maxSep < u.min[0] ||
        u.max[0] + maxSep < t.min[0] ||
        t.max[1] + maxSep < u.min[1] ||
        u.max[1] + maxSep < t.min[1] ||
        t.max[2] + maxSep < u.min[2] ||
        u.max[2] + maxSep < t.min[2]
      )
        continue;
      if (!basis) {
        const helper = Math.abs(t.cn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const ua = cross(t.cn, helper);
        const lu = length(ua);
        const uAxis = ua.map((v) => v / lu);
        basis = { uAxis, vAxis: cross(t.cn, uAxis) };
        basis.flatT = ccw(t.p.map((q) => [dot(q, basis.uAxis), dot(q, basis.vAxis)]));
      }
      const flatU = ccw(u.p.map((q) => [dot(q, basis.uAxis), dot(q, basis.vAxis)]));
      const overlap = clip(flatU, basis.flatT);
      if (overlap.length < 3) continue;
      const area = Math.abs(area2(overlap));
      if (area < minPieceArea) continue;
      const lift = ([x, y]) =>
        [0, 1, 2].map((k) => t.cn[k] * t.cd + basis.uAxis[k] * x + basis.vAxis[k] * y);
      const separation = Math.max(...overlap.map((q) => Math.abs(dot(u.cn, lift(q)) - u.cd)));
      if (separation >= maxSep) continue;
      const centre2 = overlap
        .reduce((s, q) => [s[0] + q[0], s[1] + q[1]], [0, 0])
        .map((v) => v / overlap.length);
      pieces.push({ i, j, area, separation, centre: lift(centre2), opposite });
    }
  });
  return pieces;
}

/** Shading at a world point of a triangle: { material, colour, textures, normal }. */
export function shadingAt(t, point) {
  const w = barycentric(t, point);
  const mix = (values) =>
    values
      ? values[0].map((_, k) => values[0][k] * w[0] + values[1][k] * w[1] + values[2][k] * w[2])
      : null;
  const textures = {};
  const uvs = t.uvs ?? {};
  for (const [slot, sampler] of Object.entries(t.textures ?? {})) {
    const uv = mix(uvs[sampler.texCoord ?? 0]);
    textures[slot] = uv ? sampler.sample(uv) : null;
  }
  const normal = mix(t.normals);
  const nl = normal ? length(normal) : 0;
  return {
    material: t.materialKey ?? null,
    colour: mix(t.colours),
    textures,
    normal: nl > 0 ? normal.map((v) => v / nl) : null,
  };
}

const toSrgb8 = (linear) => {
  const c = Math.max(0, Math.min(1, linear));
  return Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
};

/** Why two shadings differ (empty when they shade alike). */
export function shadingDifference(
  a,
  b,
  { texelTolerance = 8, colourTolerance = 2, normalDegrees = 3 } = {}
) {
  const reasons = [];
  if (a.material !== b.material) reasons.push('material');
  if (a.colour || b.colour) {
    const ca = (a.colour ?? [1, 1, 1, 1]).slice(0, 3).map(toSrgb8);
    const cb = (b.colour ?? [1, 1, 1, 1]).slice(0, 3).map(toSrgb8);
    if (ca.some((v, k) => Math.abs(v - cb[k]) > colourTolerance)) reasons.push('colour');
  }
  for (const slot of new Set([...Object.keys(a.textures), ...Object.keys(b.textures)])) {
    const ta = a.textures[slot];
    const tb = b.textures[slot];
    if (!ta || !tb) {
      if (ta !== tb) reasons.push(`texture:${slot}`);
      continue;
    }
    if (ta.some((v, k) => Math.abs(v - tb[k]) > texelTolerance)) reasons.push(`texture:${slot}`);
  }
  if (a.normal && b.normal) {
    const c = Math.min(1, Math.abs(dot(a.normal, b.normal)));
    if ((Math.acos(c) * 180) / Math.PI > normalDegrees) reasons.push('normal');
  }
  return reasons;
}

// ------------------------------------------------------------- GLB adapter
const WRAP = { 10497: 'repeat', 33071: 'clamp', 33648: 'mirror' };
const wrap = (x, mode) => {
  if (mode === 'clamp') return Math.min(1, Math.max(0, x));
  if (mode === 'mirror') {
    const f = ((x % 2) + 2) % 2;
    return f > 1 ? 2 - f : f;
  }
  return ((x % 1) + 1) % 1;
};

async function decodeTexture(texture, cache) {
  if (cache.has(texture)) return cache.get(texture);
  const { data, info } = await sharp(Buffer.from(texture.getImage()))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = { data, width: info.width, height: info.height, channels: info.channels };
  cache.set(texture, decoded);
  return decoded;
}

/** glTF UVs put (0, 0) at the image's top-left; nearest texel. */
function samplerFor(image, info) {
  const wrapS = WRAP[info.getWrapS()] ?? 'repeat';
  const wrapT = WRAP[info.getWrapT()] ?? 'repeat';
  return {
    texCoord: info.getTexCoord(),
    sample([u, v]) {
      const x = Math.min(image.width - 1, Math.floor(wrap(u, wrapS) * image.width));
      const y = Math.min(image.height - 1, Math.floor(wrap(v, wrapT) * image.height));
      const o = (y * image.width + x) * image.channels;
      return [image.data[o], image.data[o + 1], image.data[o + 2], image.data[o + 3]];
    },
  };
}

const materialKeyOf = (material) =>
  material
    ? JSON.stringify([
        material.getBaseColorFactor().map((v) => Number(v.toFixed(4))),
        material.getEmissiveFactor().map((v) => Number(v.toFixed(4))),
        Number(material.getMetallicFactor().toFixed(4)),
        Number(material.getRoughnessFactor().toFixed(4)),
        material.getAlphaMode(),
      ])
    : 'default';

const transformPoint = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];
// Normals through the inverse transpose, so a non-uniformly scaled node still shades right.
const normalMatrixOf = (m) =>
  new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().fromArray(m)).elements;
const transformDirection = (n, [x, y, z]) => [
  n[0] * x + n[3] * y + n[6] * z,
  n[1] * x + n[4] * y + n[7] * z,
  n[2] * x + n[5] * y + n[8] * z,
];

/** Every triangle of a gltf-transform Document in asset space, with what its shader reads. */
export async function readGlbTriangles(doc, cache = new Map()) {
  const tris = [];
  const primitives = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const nm = normalMatrixOf(m);
    const det =
      m[0] * (m[5] * m[10] - m[6] * m[9]) -
      m[4] * (m[1] * m[10] - m[2] * m[9]) +
      m[8] * (m[1] * m[6] - m[2] * m[5]);
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) continue;
      const material = primitive.getMaterial();
      const textures = {};
      for (const [slot, texture, info] of [
        ['base', material?.getBaseColorTexture(), material?.getBaseColorTextureInfo()],
        ['normal', material?.getNormalTexture(), material?.getNormalTextureInfo()],
        [
          'metalRough',
          material?.getMetallicRoughnessTexture(),
          material?.getMetallicRoughnessTextureInfo(),
        ],
        ['emissive', material?.getEmissiveTexture(), material?.getEmissiveTextureInfo()],
        ['occlusion', material?.getOcclusionTexture(), material?.getOcclusionTextureInfo()],
      ]) {
        if (texture && info) textures[slot] = samplerFor(await decodeTexture(texture, cache), info);
      }
      const primitiveId = primitives.length;
      primitives.push({
        mesh: mesh.getName(),
        node: node.getName(),
        material: material?.getName() ?? '',
        alphaMode: material?.getAlphaMode() ?? 'OPAQUE',
        doubleSided: material?.getDoubleSided() ?? false,
      });
      const position = primitive.getAttribute('POSITION');
      const normal = primitive.getAttribute('NORMAL');
      const colour = primitive.getAttribute('COLOR_0');
      const uvSets = [0, 1].map((k) => primitive.getAttribute(`TEXCOORD_${k}`));
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : position.getCount();
      const vertex = (k) => (indices ? indices.getScalar(k) : k);
      const read = (accessor, v) => accessor.getElement(v, []);
      for (let k = 0; k + 2 < count; k += 3) {
        const vs = [vertex(k), vertex(k + 1), vertex(k + 2)];
        let ps = vs.map((v) => transformPoint(m, read(position, v)));
        let order = [0, 1, 2];
        if (det < 0) order = [0, 2, 1];
        ps = order.map((o) => ps[o]);
        const ordered = order.map((o) => vs[o]);
        const t = makeTriangle(ps[0], ps[1], ps[2], {
          primitive: primitiveId,
          materialKey: materialKeyOf(material),
          doubleSided: material?.getDoubleSided() ?? false,
          alphaMode: material?.getAlphaMode() ?? 'OPAQUE',
          textures,
          uvs: Object.fromEntries(
            uvSets.flatMap((accessor, set) =>
              accessor ? [[set, ordered.map((v) => read(accessor, v))]] : []
            )
          ),
          // getElement decodes normalised integer colours to [0, 1]; glTF colours are linear.
          colours: colour ? ordered.map((v) => read(colour, v)) : null,
          normals: normal ? ordered.map((v) => transformDirection(nm, read(normal, v))) : null,
        });
        if (t) tris.push(t);
      }
    }
  }
  return { tris, primitives };
}

// ---------------------------------------------------------------- severity
const srgbToLinear = (c8) => {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const factorsOf = (key) => {
  try {
    return key && key !== 'default' ? JSON.parse(key) : null;
  } catch {
    return null;
  }
};
const baseColourOf = (shade) => {
  const factor = factorsOf(shade.material)?.[0] ?? [1, 1, 1, 1];
  const texel = shade.textures?.base;
  return [0, 1, 2].map((k) =>
    toSrgb8(factor[k] * (texel ? srgbToLinear(texel[k]) : 1) * (shade.colour ? shade.colour[k] : 1))
  );
};
const mapNormal = (texel) => {
  if (!texel) return [0, 0, 1];
  const v = [0, 1, 2].map((k) => (texel[k] / 255) * 2 - 1);
  const l = length(v) || 1;
  return v.map((x) => x / l);
};
const degreesBetween = (a, b) => (Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180) / Math.PI;

/**
 * How differently two shadings light the same pixel: `base` is the largest sRGB
 * channel delta of the base colour (factor x texel x vertex colour); `rough` the
 * roughness delta on the 0-255 scale; `normal` the vertex-normal angle PLUS the
 * normal-map texel angle (tangent frames ignored, so an upper bound).
 */
export function shadingSeverity(a, b) {
  const ca = baseColourOf(a);
  const cb = baseColourOf(b);
  const base = Math.max(...ca.map((v, k) => Math.abs(v - cb[k])));
  const vertex = a.normal && b.normal ? degreesBetween(a.normal, b.normal) : 0;
  const mapped = degreesBetween(mapNormal(a.textures?.normal), mapNormal(b.textures?.normal));
  const fa = factorsOf(a.material);
  const fb = factorsOf(b.material);
  const roughA = (a.textures?.metalRough?.[1] ?? 255) * (fa?.[3] ?? 1);
  const roughB = (b.textures?.metalRough?.[1] ?? 255) * (fb?.[3] ?? 1);
  return { base, rough: Math.abs(roughA - roughB), normal: vertex + mapped };
}

/**
 * The contrast the depth-flip probe can see: its pixel test counts a channel
 * change over 24/255, so a base delta under 24 cannot be resolved in frames.
 * Normal-only differences (smooth-shading seams between parts) are reported
 * apart: their angle is an upper bound and needs a frame before it counts.
 */
export const SEVERITY = { base: 24, rough: 48, normal: 10 };
export const severityClass = (s) =>
  s.base >= SEVERITY.base || s.rough >= SEVERITY.rough
    ? 'contrast'
    : s.normal >= SEVERITY.normal
      ? 'normal-only'
      : 'subtle';

// -------------------------------------------------------------- visibility
/**
 * Ray-escape visibility in asset space (the crafted-assets guard's test): a
 * point counts as seen if any of 48 directions within ~81 deg of its normal
 * leaves the asset without a hit, with a ground plane at the asset's datum.
 */
export function visibilityTester(tris) {
  let minY = Infinity;
  for (const t of tris) for (const q of t.p) minY = Math.min(minY, q[1]);
  const cells = new Map();
  for (const t of tris) {
    const key = [0, 1, 2].map((k) => Math.floor((t.p[0][k] + t.p[1][k] + t.p[2][k]) / 6)).join(',');
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(...t.p.flat());
  }
  const side = { side: THREE.DoubleSide };
  const targets = [...cells.values()].map((positions) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial(side));
  });
  targets.push(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000).rotateX(-Math.PI / 2).translate(0, minY, 0),
      new THREE.MeshBasicMaterial(side)
    )
  );
  const directions = Array.from({ length: 48 }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / 48;
    const r = Math.sqrt(1 - y * y);
    return new THREE.Vector3(Math.cos(i * 2.399963) * r, y, Math.sin(i * 2.399963) * r);
  });
  const ray = new THREE.Raycaster();
  const escapes = (point, normal) => {
    const n = new THREE.Vector3(...normal);
    ray.ray.origin.set(...point).addScaledVector(n, 0.0005);
    ray.far = 1000;
    return directions.some((d) => {
      if (d.dot(n) < 0.15) return false;
      ray.ray.direction.copy(d);
      return ray.intersectObjects(targets, false).length === 0;
    });
  };
  const dispose = () => {
    for (const target of targets) {
      target.geometry.dispose();
      target.material.dispose();
    }
  };
  return { minY, escapes, dispose };
}

/**
 * Visible, differently shaded self-coplanar area of one delivered asset,
 * grouped by plane and severity class. Pieces under the asset's datum facing
 * down lie on the terrain and are dropped. `testsPerGroup` bounds the ray work:
 * the tested share of a group's area scales to the whole group.
 */
export async function assetSelfCoplanar(doc, { maxSep = 0.001, testsPerGroup = 160 } = {}) {
  const { tris, primitives } = await readGlbTriangles(doc);
  const pieces = coplanarPieces(tris, { maxSep });
  const vis = visibilityTester(tris);
  const groups = new Map();
  for (const piece of pieces) {
    const a = tris[piece.i];
    const b = tris[piece.j];
    if (a.n[1] < -0.99 && Math.abs(piece.centre[1] - vis.minY) < 0.01) continue;
    const sa = shadingAt(a, piece.centre);
    const sb = shadingAt(b, piece.centre);
    const reasons = shadingDifference(sa, sb);
    if (!reasons.length) continue;
    const severity = shadingSeverity(sa, sb);
    const kind = severityClass(severity);
    const key = [
      kind,
      piece.opposite ? 'opposed' : 'same',
      a.cn.map((v) => Math.round(v * 20)).join(','),
      Math.round(a.cd / 0.05),
    ].join('|');
    let g = groups.get(key);
    if (!g) {
      g = {
        kind,
        opposite: piece.opposite,
        normal: a.cn,
        area: 0,
        tested: 0,
        testedArea: 0,
        seenArea: 0,
        severity,
        centre: piece.centre,
        largest: 0,
        samples: [],
      };
      groups.set(key, g);
    }
    g.area += piece.area;
    for (const k of ['base', 'rough', 'normal'])
      g.severity[k] = Math.max(g.severity[k], severity[k]);
    if (piece.area > g.largest) {
      g.largest = piece.area;
      g.centre = piece.centre;
    }
    if (g.tested < testsPerGroup) {
      g.tested += 1;
      g.testedArea += piece.area;
      const front = vis.escapes(piece.centre, a.n);
      const seen =
        front ||
        ((piece.opposite || a.doubleSided) &&
          vis.escapes(
            piece.centre,
            a.n.map((v) => -v)
          ));
      if (seen) {
        g.seenArea += piece.area;
        if (g.samples.length < 4) g.samples.push(piece.centre.map((v) => Number(v.toFixed(3))));
      }
    }
  }
  vis.dispose();
  return {
    triangles: tris.length,
    primitives,
    groups: [...groups.values()]
      .map((g) => ({
        kind: g.kind,
        opposite: g.opposite,
        normal: g.normal.map((v) => Number(v.toFixed(3))),
        area: g.area,
        visibleArea: g.testedArea ? (g.area * g.seenArea) / g.testedArea : 0,
        severity: Object.fromEntries(
          Object.entries(g.severity).map(([k, v]) => [k, Math.round(v)])
        ),
        centre: g.centre.map((v) => Number(v.toFixed(3))),
        samples: g.samples,
      }))
      .sort((p, q) => q.visibleArea - p.visibleArea),
  };
}
