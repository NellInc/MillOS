/** Precision retopology of the accepted windmill. No scene renormalisation.
 * Working if rigid sail triangles retain the existing raw-frame shader contract,
 * clean closed joinery replaces provider dents, and replay is byte-identical.
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
const SHA = (bytes) => createHash('sha256').update(bytes).digest('hex');
const LOW = -0.5003532767295837;
const XNOSE = 0.29243865609169006;
const OLD_RADIUS = 0.5382265617518023;
const PALETTE = [
  ['plaster', [216, 216, 202], 226],
  ['stone', [124, 121, 108], 230],
  ['copper', [139, 78, 42], 150],
  ['wood', [109, 77, 44], 188],
  ['door', [78, 49, 28], 199],
  ['iron', [65, 68, 61], 163],
  ['mortar', [82, 85, 77], 240],
  ['limestone', [160, 155, 137], 224],
];
const tileIndex = (name) => PALETTE.findIndex(([key]) => key === name);

async function atlas() {
  const size = 512,
    colour = Buffer.alloc(size * size * 3),
    normal = Buffer.alloc(colour.length),
    orm = Buffer.alloc(colour.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const tile = Math.floor(x / 128) + 4 * Math.floor(y / 256),
        [name, base, roughness] = PALETTE[tile];
      const u = x % 128,
        v = y % 256;
      const hash = ((((x * 374761393) ^ (y * 668265263)) >>> 0) % 997) / 997 - 0.5;
      let grain = hash * 0.025;
      if (name === 'wood' || name === 'door')
        grain +=
          0.035 * Math.sin(u * 0.72 + Math.sin(v * 0.033) * 0.65) + 0.018 * Math.sin(u * 1.8);
      if (name === 'copper') grain += 0.025 * Math.sin(u * 0.15) + 0.008 * Math.sin(v * 0.2);
      const at = (y * size + x) * 3;
      for (let k = 0; k < 3; k++) colour[at + k] = Math.round(base[k] * (1 + grain));
      normal[at] = 128;
      normal[at + 1] = 128;
      normal[at + 2] = 255;
      orm[at] = 255;
      orm[at + 1] = roughness;
      orm[at + 2] = 0;
    }
  const encode = (data) =>
    sharp(data, { raw: { width: size, height: size, channels: 3 } })
      .jpeg({ quality: 94, chromaSubsampling: '4:4:4', mozjpeg: false })
      .toBuffer();
  return Promise.all([encode(colour), encode(normal), encode(orm)]);
}

function construct() {
  const parts = [];
  const add = (name, geometry, style, rotor = false) => {
    const uv = geometry.getAttribute('uv'),
      t = tileIndex(style);
    if (t < 0) throw new Error('Unknown authored surface');
    for (let i = 0; i < uv.count; i++) {
      const u = THREE.MathUtils.clamp(uv.getX(i), 0, 1),
        v = THREE.MathUtils.clamp(uv.getY(i), 0, 1);
      // Image data uses top-down rows. glTF UV V=0 samples the first row.
      uv.setXY(
        i,
        ((t % 4) * 128 + 3 + u * 122) / 512,
        (Math.floor(t / 4) * 256 + 3 + v * 250) / 512
      );
    }
    // Weld only identical position/normal/UV tuples, keeping every hard edge
    // and atlas seam while indexing repeated triangles from closed extrusions.
    const indexed = mergeVertices(geometry, 1e-7);
    geometry.dispose();
    indexed.computeBoundingBox();
    parts.push({ name, geometry: indexed, style, rotor });
  };
  const box = (name, at, size, style, rotor = false) =>
    add(name, new THREE.BoxGeometry(...size).translate(...at), style, rotor);
  const cylinder = (
    name,
    at,
    lower,
    upper,
    height,
    style,
    segments = 32,
    rotor = false,
    axisX = false
  ) => {
    const g = new THREE.CylinderGeometry(upper, lower, height, segments);
    if (axisX) g.rotateZ(-Math.PI / 2);
    add(name, g.translate(...at), style, rotor);
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
    const g =
      width < 0.002
        ? new THREE.BoxGeometry(depth, width, length).translate(0, 0, length / 2)
        : new THREE.ExtrudeGeometry(shape, {
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
  const cx = -0.03,
    cz = 0.006;
  // The wide foot lies wholly outside the old radial gate. Upper courses taper
  // inside X=.216 before reaching that gate, so no stone can join the rotor.
  cylinder(
    'foundation-foot',
    [cx, (LOW - 0.479) / 2, cz],
    0.2631303381919861,
    0.2631303381919861,
    -0.479 - LOW,
    'mortar'
  );
  cylinder('base-mortar', [cx, -0.457, cz], 0.244, 0.24, 0.044, 'mortar');
  // Clean individual closed stones, with actual joint gaps over the closed core.
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 16; i++) {
      const angle = ((i + (row ? 0.5 : 0)) * Math.PI) / 8;
      const radius = row ? 0.237 : 0.241;
      const g = new THREE.BoxGeometry(0.041, 0.019, 0.018).translate(0, 0, 0);
      g.rotateY(-angle).translate(
        cx + Math.sin(angle) * radius,
        -0.469 + row * 0.021,
        cz + Math.cos(angle) * radius
      );
      // No positive-X stone corner may enter the measured sail gate.
      const p = g.getAttribute('position');
      for (let j = 0; j < p.count; j++) p.setX(j, Math.min(0.2155, p.getX(j)));
      add(`stone-${row}-${i}`, g, row % 2 ? 'limestone' : 'stone');
    }
  cylinder('plaster-tower', [cx, (-0.438 + 0.075) / 2, cz], 0.229, 0.174, 0.513, 'plaster', 40);
  cylinder('cap-curb', [cx, 0.078, cz], 0.191, 0.191, 0.026, 'copper', 40);
  const capProfile = [
    [0.191, 0.091],
    [0.185, 0.098],
    [0.173, 0.123],
    [0.153, 0.156],
    [0.122, 0.19],
    [0.087, 0.218],
    [0.052, 0.236],
    [0.018, 0.247],
    [0, 0.247],
  ];
  const cap = new THREE.LatheGeometry(
    [[0, 0.091], ...capProfile].map(([r, y]) => new THREE.Vector2(r, y)),
    40
  ).translate(cx, 0, cz);
  add('ogee-cap', cap, 'copper');
  // Seams are actual straight, seated strips; the cap surface is smooth, not dented.
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    for (let j = 0; j < capProfile.length - 2; j++) {
      const [r, y] = capProfile[j],
        [rr, yy] = capProfile[j + 1];
      beam(
        `cap-seam-${i}-${j}`,
        [cx + Math.sin(a) * (r + 0.0005), y, cz + Math.cos(a) * (r + 0.0005)],
        [cx + Math.sin(a) * (rr + 0.0005), yy, cz + Math.cos(a) * (rr + 0.0005)],
        0.0012,
        0.0012,
        'copper'
      );
    }
  }
  // Door is seated in its jambs, not baked as warped geometry/shading.
  box('door-leaf', [0.2075, -0.363, cz], [0.009, 0.152, 0.093], 'door');
  for (const side of [-1, 1])
    box('door-jamb-' + side, [0.2015, -0.3605, cz + side * 0.052], [0.027, 0.165, 0.012], 'wood');
  box('door-lintel', [0.2015, -0.275, cz], [0.027, 0.018, 0.12], 'wood');
  box('door-threshold', [0.202, -0.449, cz], [0.026, 0.012, 0.12], 'stone');
  for (let i = 0; i < 5; i++)
    box('door-board-' + i, [0.213, -0.363, cz - 0.038 + i * 0.019], [0.002, 0.15, 0.0012], 'wood');
  cylinder('fixed-bearing', [0.192, HUB[0], HUB[1]], 0.025, 0.025, 0.046, 'iron', 20, false, true);
  cylinder(
    'rotor-hub',
    [(0.228 + XNOSE) / 2, HUB[0], HUB[1]],
    0.027,
    0.023,
    XNOSE - 0.228,
    'wood',
    20,
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
  const rotorX = 0.252;
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const point = (u, v) => [rotorX, HUB[0] + c * u - s * v, HUB[1] + s * u + c * v];
    beam('stock-' + i, point(0, 0), point(0.535, 0), 0.012, 0.017, 'wood', true);
    const panel = panels[i],
      inner = 0.145;
    for (const [n, v] of [
      ['inner', panel.lo],
      ['outer', panel.hi],
    ])
      beam(`sail-${i}-rail-${n}`, point(inner, v), point(panel.tip, v), 0.008, 0.013, 'wood', true);
    for (let row = 0; row <= 7; row++) {
      const u = inner + ((panel.tip - inner) * row) / 7;
      beam(
        `sail-${i}-rung-${row}`,
        point(u, Math.min(0, panel.lo) - 0.002),
        point(u, Math.max(0, panel.hi) + 0.002),
        0.0055,
        0.012,
        'wood',
        true
      );
    }
  }
  return parts;
}

const weight = (x, y, z) =>
  THREE.MathUtils.smoothstep(x, 0.216, 0.228) *
  (1 - THREE.MathUtils.smoothstep(Math.hypot(y - HUB[0], z - HUB[1]), 0.55, 0.57));
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
  let radius = 0;
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
      if (part.rotor) radius = Math.max(radius, Math.hypot(xyz[1] - HUB[0], xyz[2] - HUB[1]));
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
  // All surface properties retain their accepted parent semantics. The normal
  // atlas is deliberately clean, not copied provider dents on straight joinery.
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
    hub: HUB,
    nodeMatrix: originalMatrix,
    parts: membership,
    appearance:
      'white plaster, jointed stone, copper-brown ogee cap and straight open timber lattice; clean flat tangent-normal atlas',
    panelContract:
      'Individually fitted straight panels retain the source asymmetry; no exact fourfold-balance claim',
  };
  return { bytes, receipt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output =
    process.argv.find((a) => a.startsWith('--output='))?.slice(9) ??
    'test-results/dm-farm-structure-20261027/windmill-precision.glb';
  if (path.resolve(output).startsWith(path.resolve('public') + path.sep))
    throw new Error('Direct public installation is root-owned');
  const result = await deriveWindmill(await fs.readFile(PARENT_PATH));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.bytes);
  await fs.writeFile(output + '.receipt.json', JSON.stringify(result.receipt, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...result.receipt, parts: result.receipt.parts.length }));
}
