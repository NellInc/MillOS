/** Exact-parent, output-only architectural coop derivative. No runtime writes.
 * Working if physical panel/door/ramp contacts are straight and the accepted
 * roof's complete position/normal/UV corner bytes survive the retopology.
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
export const ROOF_TRIANGLES = Object.freeze({ start: 5228, count: 716 });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const DEFAULT_OUTPUT = 'test-results/dm-farm-structure-20261027/coop-precision-candidate.glb';
const PATCH = { x: 16, y: 256, width: 128, height: 128 };
const METAL = { x: 16, y: 400, width: 64, height: 64 };
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
  // The entire already-authored roof occupies this pinned contiguous range.
  // Its membership is additionally constrained by the exact parent digest.
  for (
    let triangle = ROOF_TRIANGLES.start;
    triangle < ROOF_TRIANGLES.start + ROOF_TRIANGLES.count;
    triangle++
  ) {
    for (let c = 0; c < 3; c++)
      for (const semantic of Object.keys(arrays))
        arrays[semantic].push(
          ...old[semantic].getElement(originalIndices.getScalar(triangle * 3 + c), [])
        );
  }
  const roofHashes = Object.fromEntries(
    Object.entries(arrays).map(([key, value]) => [
      key,
      hash(Buffer.from(new Float32Array(value).buffer)),
    ])
  );
  parts.push({ name: 'accepted-roof', firstTriangle: 0, triangles: 716 });
  const roofPlanes = [5230, 5472].map((id) => {
    const points = [0, 1, 2].map((c) =>
      vector(old.POSITION.getElement(originalIndices.getScalar(id * 3 + c), []))
    );
    const normal = new THREE.Triangle(...points).getNormal(new THREE.Vector3());
    assert(normal.y < -0.7 && Math.abs(normal.x) < 1e-7);
    return { normal, constant: normal.dot(points[0]) };
  });
  const ceiling = (z) =>
    Math.min(...roofPlanes.map(({ normal: n, constant }) => (constant - n.z * z) / n.y));
  const uv = (point, normal, bounds, role = 'wood', seed = 0) => {
    const patch = role === 'metal' ? METAL : PATCH;
    if (role === 'metal')
      return [(patch.x + patch.width / 2) / 512, (patch.y + patch.height / 2) / 512];
    // Long grain follows each real timber's longest in-plane dimension.
    const spans = bounds.max.clone().sub(bounds.min).toArray();
    const axes = [0, 1, 2].filter((i) => Math.abs(normal.getComponent(i)) < 0.9);
    axes.sort((a, b) => spans[b] - spans[a]);
    const along = axes[0] ?? 0,
      across = axes[1] ?? 1;
    const u =
      (point.getComponent(along) - bounds.min.getComponent(along)) / Math.max(spans[along], 1e-8);
    const v =
      (point.getComponent(across) - bounds.min.getComponent(across)) /
      Math.max(spans[across], 1e-8);
    return [(patch.x + 4 + u * 118) / 512, (patch.y + 4 + ((seed * 13) % 20) + v * 96) / 512];
  };
  function add(name, geometry, role = 'wood', seed = parts.length) {
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    const p = plain.getAttribute('position'),
      n = plain.getAttribute('normal');
    assert(p && n);
    plain.computeBoundingBox();
    const firstTriangle = arrays.POSITION.length / 9;
    for (let i = 0; i < p.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(p, i),
        normal = new THREE.Vector3().fromBufferAttribute(n, i);
      arrays.POSITION.push(...point.toArray());
      arrays.NORMAL.push(...normal.toArray());
      arrays.TEXCOORD_0.push(...uv(point, normal, plain.boundingBox, role, seed));
    }
    parts.push({
      name,
      firstTriangle,
      triangles: p.count / 3,
      bounds: { min: plain.boundingBox.min.toArray(), max: plain.boundingBox.max.toArray() },
    });
    if (plain !== geometry) plain.dispose();
    geometry.dispose();
  }
  function box(name, min, max, bevel = 0.002, role = 'wood') {
    const low = vector(min),
      high = vector(max),
      half = high.clone().sub(low).multiplyScalar(0.5),
      centre = high.clone().add(low).multiplyScalar(0.5);
    if (bevel === 0) {
      add(
        name,
        new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2).translate(...centre.toArray()),
        role
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
    add(name, new ConvexGeometry(points).translate(...centre.toArray()), role);
  }
  function polygon(name, x0, x1, yz) {
    const points = [];
    for (const x of [x0, x1]) for (const [y, z] of yz) points.push(new THREE.Vector3(x, y, z));
    add(name, new ConvexGeometry(points));
  }
  function rod(name, a, b, radius, sides = 8, role = 'metal') {
    const from = vector(a),
      to = vector(b),
      direction = to.clone().sub(from);
    assert(direction.length() > 1e-6);
    const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), sides);
    geometry.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
    );
    add(name, geometry.translate(...from.add(to).multiplyScalar(0.5).toArray()), role);
  }
  // Raised, connected sill and four real supports, with grounded end faces.
  box(
    'floor',
    [backX - 0.018, floorY - 0.018, -halfZ - 0.015],
    [frontX + 0.025, floorY, halfZ + 0.015]
  );
  for (const x of [backX + 0.018, frontX - 0.018])
    for (const z of [-halfZ + 0.022, halfZ - 0.022])
      box(`leg-${x}-${z}`, [x - 0.019, groundY, z - 0.019], [x + 0.019, floorY + 0.018, z + 0.019]);
  for (const z of [-halfZ, halfZ])
    box(
      `long-sill-${z}`,
      [backX - 0.024, floorY - 0.018, z - 0.017],
      [frontX + 0.026, floorY + 0.018, z + 0.017]
    );
  for (const x of [backX, frontX])
    box(
      `end-sill-${x}`,
      [x - 0.018, floorY - 0.018, -halfZ - 0.017],
      [x + 0.018, floorY + 0.018, halfZ + 0.017]
    );
  const boardCount = 9,
    eaveY = ceiling(halfZ) - 0.001;
  for (let row = 0; row < boardCount; row++) {
    const y0 = floorY + ((eaveY - floorY) * row) / boardCount,
      y1 = floorY + ((eaveY - floorY) * (row + 1)) / boardCount;
    for (const side of [-1, 1])
      box(
        `side-board-${side}-${row}`,
        [backX, y0, side * halfZ - 0.006],
        [frontX, y1, side * halfZ + 0.006],
        0.0012
      );
    box(`rear-board-${row}`, [backX - 0.006, y0, -halfZ], [backX + 0.006, y1, halfZ], 0.0012);
    // Separate real panels flank the intended wire entrance, never an opaque fill.
    for (const side of [-1, 1]) {
      const z0 = side < 0 ? -halfZ : 0.1,
        z1 = side < 0 ? -0.1 : halfZ;
      box(`front-board-${side}-${row}`, [frontX - 0.006, y0, z0], [frontX + 0.006, y1, z1], 0.0012);
    }
    if (y0 >= 0.057)
      box(
        `front-lintel-board-${row}`,
        [frontX - 0.006, y0, -0.1],
        [frontX + 0.006, y1, 0.1],
        0.0012
      );
    else if (y1 > 0.057)
      box(
        `front-lintel-board-${row}`,
        [frontX - 0.006, 0.057, -0.1],
        [frontX + 0.006, y1, 0.1],
        0.0012
      );
  }
  // Straight, roof-fitted trapezoid courses close each gable below its real slab.
  const peak = ceiling(0) - 0.001;
  for (const x of [backX, frontX])
    for (let row = 0; row < 7; row++) {
      const y0 = eaveY + ((peak - eaveY) * row) / 7,
        y1 = eaveY + ((peak - eaveY) * (row + 1)) / 7;
      const z0 = (halfZ * (peak - y0)) / (peak - eaveY),
        z1 = (halfZ * (peak - y1)) / (peak - eaveY);
      if (x === frontX && y0 < 0.325 && y1 > 0.235) {
        // Small open gable vent retains the characteristic upper cubby.
        const a = Math.max(y0, 0.235),
          b = Math.min(y1, 0.325);
        const za = (halfZ * (peak - a)) / (peak - eaveY),
          zb = (halfZ * (peak - b)) / (peak - eaveY);
        if (y0 < a)
          polygon(`gable-${x}-${row}-bottom`, x - 0.006, x + 0.006, [
            [y0, -z0],
            [y0, z0],
            [a, za],
            [a, -za],
          ]);
        for (const side of [-1, 1]) {
          const outerA = side * za,
            outerB = side * zb,
            inner = side * 0.045;
          polygon(`gable-${x}-${row}-${side}`, x - 0.006, x + 0.006, [
            [a, inner],
            [a, outerA],
            [b, outerB],
            [b, inner],
          ]);
        }
        if (b < y1)
          polygon(`gable-${x}-${row}-top`, x - 0.006, x + 0.006, [
            [b, -zb],
            [b, zb],
            [y1, z1],
            [y1, -z1],
          ]);
      } else
        polygon(`gable-${x}-${row}`, x - 0.006, x + 0.006, [
          [y0, -z0],
          [y0, z0],
          [y1, z1],
          [y1, -z1],
        ]);
    }
  for (const x of [backX, frontX])
    for (const z of [-halfZ, halfZ])
      box(
        `corner-post-${x}-${z}`,
        [x - 0.015, floorY - 0.002, z - 0.014],
        [x + 0.015, ceiling(halfZ + 0.014) - 0.0003, z + 0.014],
        0.002
      );
  for (const z of [-0.11, 0.11])
    box(
      `door-jamb-${z}`,
      [frontX + 0.004, floorY, z - 0.011],
      [frontX + 0.029, 0.081, z + 0.011],
      0.0015
    );
  box('door-lintel', [frontX + 0.004, 0.058, -0.121], [frontX + 0.029, 0.083, 0.121], 0.0015);
  box(
    'door-threshold',
    [frontX + 0.002, floorY, -0.12],
    [frontX + 0.035, floorY + 0.018, 0.12],
    0.0015
  );
  for (const z of [-0.05, 0.05])
    box(
      `vent-jamb-${z}`,
      [frontX + 0.004, 0.229, z - 0.006],
      [frontX + 0.021, 0.331, z + 0.006],
      0.001
    );
  for (const y of [0.229, 0.331])
    box(
      `vent-lintel-${y}`,
      [frontX + 0.004, y - 0.006, -0.056],
      [frontX + 0.021, y + 0.006, 0.056],
      0.001
    );
  for (const z of [-0.086, -0.043, 0, 0.043, 0.086])
    rod(
      `door-wire-u-${z}`,
      [frontX + 0.019, floorY + 0.02, z],
      [frontX + 0.019, 0.057, z],
      0.00145,
      6
    );
  for (let i = 0; i < 7; i++) {
    const y = floorY + 0.02 + ((0.057 - floorY - 0.02) * i) / 6;
    rod(`door-wire-v-${i}`, [frontX + 0.019, y, -0.086], [frontX + 0.019, y, 0.086], 0.00145, 6);
  }
  for (const y of [-0.216, 0.012])
    box(
      `door-hinge-${y}`,
      [frontX + 0.026, y - 0.008, -0.118],
      [frontX + 0.033, y + 0.008, -0.097],
      0,
      'metal'
    );
  // Real sloping slab: doorway end rests on its sill, far nose contacts ground.
  const rampStartX = frontX + 0.02,
    topStart = floorY + 0.012,
    topEnd = groundY + 0.012;
  const rampPoints = [];
  for (const z of [-0.105, 0.105])
    for (const [x, y] of [
      [rampStartX, topStart],
      [rampEndX, topEnd],
      [rampEndX, groundY],
      [rampStartX, topStart - 0.012],
    ])
      rampPoints.push(new THREE.Vector3(x, y, z));
  add('ramp-slab', new ConvexGeometry(rampPoints));
  const slope = (topEnd - topStart) / (rampEndX - rampStartX),
    angle = Math.atan(slope);
  for (const z of [-0.1, 0.1]) {
    const a = [rampStartX, topStart + 0.007, z],
      b = [rampEndX, topEnd + 0.007, z];
    // Closed rectangular rail prism with explicit cut end faces at the same Xs.
    const points = [];
    for (const [x, y] of [a, b])
      for (const yy of [-0.007, 0.007])
        for (const zz of [-0.007, 0.007]) points.push(new THREE.Vector3(x, y + yy, z + zz));
    add(`ramp-rail-${z}`, new ConvexGeometry(points));
  }
  for (let i = 1; i <= 7; i++) {
    const x = rampStartX + ((rampEndX - rampStartX) * i) / 8,
      y = topStart + (x - rampStartX) * slope;
    const g = new THREE.BoxGeometry(0.012, 0.005, 0.184).rotateZ(angle).translate(x, y + 0.004, 0);
    add(`ramp-tread-${i}`, g);
  }
  // Material texture pixels outside the disjoint new timber/metal tiles survive
  // before encoding. JPEG90 stays within the existing cap; protected roof texel
  // colour, unit-normal and roughness errors are quantified, not called lossless.
  const protectedPixels = new Set();
  for (let i = 0; i < ROOF_TRIANGLES.count * 3; i += 3) {
    const coordinates = [0, 1, 2].map((c) => arrays.TEXCOORD_0.slice((i + c) * 2, (i + c) * 2 + 2));
    const min = coordinates.reduce((a, b) => a.map((v, k) => Math.min(v, b[k])), [1, 1]);
    const max = coordinates.reduce((a, b) => a.map((v, k) => Math.max(v, b[k])), [0, 0]);
    for (
      let y = Math.max(0, Math.floor(min[1] * 512) - 2);
      y <= Math.min(511, Math.ceil(max[1] * 512) + 2);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(min[0] * 512) - 2);
        x <= Math.min(511, Math.ceil(max[0] * 512) + 2);
        x++
      )
        protectedPixels.add(y * 512 + x);
  }
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
            data[at + 1] = patch === METAL ? 175 : 221;
            data[at + 2] = patch === METAL ? 90 : 0;
          } else if (patch === METAL) {
            data[at] = 83;
            data[at + 1] = 104;
            data[at + 2] = 91;
          } else {
            const u = x - patch.x,
              v = y - patch.y;
            const line =
              Math.sin(v * 0.62 + Math.sin(u * 0.037) * 0.35) +
              0.35 * Math.sin(v * 1.71 + u * 0.009) +
              0.18 * Math.sin(u * 0.31 + v * 0.27);
            const knot = Math.exp(-(((u - 87) / 18) ** 2 + ((v - 39) / 9) ** 2));
            data[at] = Math.round(164 + line * 5 - knot * 15);
            data[at + 1] = Math.round(105 + line * 4 - knot * 13);
            data[at + 2] = Math.round(53 + line * 2 - knot * 8);
          }
        }
    let outsideChanged = 0;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const inPatch = [PATCH, METAL].some(
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
    const encoded = await sharp(texture.getImage()).removeAlpha().raw().toBuffer();
    let sum = 0,
      maximum = 0,
      angleSum = 0,
      angleMax = 0,
      roughnessSum = 0,
      roughnessMax = 0;
    for (const pixel of protectedPixels) {
      for (let c = 0; c < 3; c++) {
        const error = Math.abs(encoded[pixel * 3 + c] - before[pixel * 3 + c]);
        sum += error;
        maximum = Math.max(maximum, error);
      }
      const a = vector([0, 1, 2].map((c) => before[pixel * 3 + c] / 127.5 - 1)).normalize(),
        b = vector([0, 1, 2].map((c) => encoded[pixel * 3 + c] / 127.5 - 1)).normalize();
      const degrees = (a.angleTo(b) * 180) / Math.PI;
      angleSum += degrees;
      angleMax = Math.max(angleMax, degrees);
      const drift = Math.abs(encoded[pixel * 3 + 1] - before[pixel * 3 + 1]) / 255;
      roughnessSum += drift;
      roughnessMax = Math.max(roughnessMax, drift);
    }
    textureReceipts.push({
      name,
      oldImageSHA256: hash(image),
      newImageSHA256: hash(texture.getImage()),
      outsidePatchChangedComponentsBeforeEncoding: outsideChanged,
      encoding: { format: 'jpeg', quality: 90, chromaSubsampling: '4:4:4' },
      protectedRoofTexels: {
        count: protectedPixels.size,
        meanAbsoluteRGBByteError: sum / (protectedPixels.size * 3),
        maximumRGBByteError: maximum,
        ...(name.includes('normal')
          ? {
              meanUnitNormalAngleDegrees: angleSum / protectedPixels.size,
              maximumUnitNormalAngleDegrees: angleMax,
            }
          : {}),
        ...(name.endsWith('-orm')
          ? {
              meanRoughnessDrift: roughnessSum / protectedPixels.size,
              maximumRoughnessDrift: roughnessMax,
            }
          : {}),
      },
      patches: [PATCH, METAL],
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
  const finalHashes = {};
  for (const key of Object.keys(arrays)) {
    const attribute = primitive.getAttribute(key),
      size = attribute.getElementSize(),
      expanded = [];
    for (let i = 0; i < ROOF_TRIANGLES.count * 3; i++)
      expanded.push(...attribute.getElement(indices[i], []));
    assert.equal(expanded.length, ROOF_TRIANGLES.count * 3 * size);
    finalHashes[key] = hash(Buffer.from(new Float32Array(expanded).buffer));
    assert.equal(finalHashes[key], roofHashes[key]);
  }
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
  assert(count / 3 >= 3000);
  root.getAsset().generator = `MillOS generated-asset pipeline, glTF-Transform ${VERSION}`;
  const bytes = Buffer.from(await io.writeBinary(document));
  assert(
    bytes.length <= 437000,
    `Existing file budget required, actual ${bytes.length}, vertices ${packed.POSITION.length / 3}, textures ${root.listTextures().map((t) => t.getImage().length)}`
  );
  return {
    bytes,
    receipt: {
      method: 'coop-precision-structure-v1',
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
        ...ROOF_TRIANGLES,
        outputFirstTriangle: 0,
        attributeSHA256: roofHashes,
        verifiedOutputSHA256: finalHashes,
      },
      parts,
      contacts: {
        floorY,
        backX,
        frontX,
        halfZ,
        groundY,
        rampEndX,
        doorOpening: { x: frontX + 0.019, y: [floorY + 0.018, 0.057], z: [-0.099, 0.099] },
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
