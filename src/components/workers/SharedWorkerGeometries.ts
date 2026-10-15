import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** A short linen work apron in the source skin's bind coordinates. It shares
 * the existing palette and indexed Uint8 joints, including the distant merge.
 * Working if the bib follows torso flexion and the hem follows the two thighs
 * without a separate animation loop or a seam between rigid panels.
 */
export function createWorkerApronGeometry(source: THREE.SkinnedMesh) {
  const joints = ['Hips', 'Abdomen', 'Chest', 'UpperLegL', 'UpperLegR'].map((name) =>
    source.skeleton.bones.findIndex((bone) => bone.name === name)
  );
  if (joints.some((index) => index < 0 || index > 255)) return null;
  const rest = joints.map((index) =>
    new THREE.Vector3().setFromMatrixPosition(
      new THREE.Matrix4().copy(source.skeleton.boneInverses[index]).invert()
    )
  );
  const hip = rest[0],
    abdomen = rest[1],
    chest = rest[2];
  const waist = abdomen.y,
    top = chest.y + 0.015,
    hem = hip.y - 0.17;
  const cloud: THREE.Vector3[] = [];
  const trouserFaces: { triangle: THREE.Triangle; ids: number[]; mesh: THREE.SkinnedMesh }[] = [];
  source.parent?.parent?.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !/Worker_(Body|Legs)/.test(mesh.parent?.name ?? '')) return;
    const attribute = mesh.geometry.getAttribute('position');
    for (let i = 0; i < attribute.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(attribute, i);
      if (Math.abs(point.x - hip.x) < 0.26) cloud.push(point);
    }
    if (mesh.parent?.name !== 'Worker_Legs') return;
    const index = mesh.geometry.index;
    const normal = new THREE.Vector3();
    for (let i = 0; i < (index?.count ?? attribute.count); i += 3) {
      const ids = [0, 1, 2].map((offset) => index?.getX(i + offset) ?? i + offset);
      const points = ids.map((id) => new THREE.Vector3().fromBufferAttribute(attribute, id));
      const triangle = new THREE.Triangle(points[0], points[1], points[2]);
      const centre = triangle.getMidpoint(new THREE.Vector3());
      // Transfer only from the front hip/thigh surface, never the back or arms.
      if (centre.y < hem - 0.08 || centre.y > hip.y + 0.13 || centre.z < hip.z) continue;
      if (triangle.getNormal(normal).z > 0.1) trouserFaces.push({ triangle, ids, mesh });
    }
  });
  if (!cloud.length) return null;
  function frontAt(y: number) {
    let front = -Infinity;
    for (const point of cloud) if (Math.abs(point.y - y) < 0.065) front = Math.max(front, point.z);
    return Number.isFinite(front) ? front : hip.z + 0.15;
  }
  const positions: number[] = [],
    colours: number[] = [],
    indices: number[] = [];
  const skinIndices: number[] = [],
    weights: number[] = [];
  const linen = new THREE.Color('#ded6bc'),
    stitch = new THREE.Color('#526e69');
  const pocket = new THREE.Color('#eee3c9'),
    strap = new THREE.Color('#46635f');
  function vertex(x: number, y: number, z: number, colour: THREE.Color, tone = 1) {
    positions.push(x, y, z);
    colours.push(colour.r * tone, colour.g * tone, colour.b * tone);
    // Around the hip, the exported trousers already blend into the thighs
    // above the Hips joint. A guessed height ramp leaves cloth behind in runs.
    // Use same-side front triangles' barycentric weights in that fitted region.
    const transferred = new Map<number, number>();
    const blend = z > hip.z ? 1 - THREE.MathUtils.smoothstep(y, hip.y + 0.075, hip.y + 0.12) : 0;
    let nearest = Infinity;
    let face: (typeof trouserFaces)[number] | undefined;
    const point = new THREE.Vector3(x, y, z),
      closest = new THREE.Vector3();
    const barycentric = new THREE.Vector3();
    if (blend > 0) {
      for (const candidate of trouserFaces) {
        const centre = candidate.triangle.getMidpoint(closest);
        if ((centre.x - hip.x) * (x - hip.x) < 0) continue;
        candidate.triangle.closestPointToPoint(point, closest);
        const distance = closest.distanceToSquared(point);
        if (distance < nearest) {
          nearest = distance;
          face = candidate;
          candidate.triangle.getBarycoord(closest, barycentric);
        }
      }
    }
    const offset = weights.length;
    if (y < hip.y) {
      const leg = THREE.MathUtils.smoothstep(hip.y - y, 0, 0.07);
      const side = x >= hip.x ? 1 : 0;
      skinIndices.push(joints[0], joints[3], joints[4], 0);
      weights.push(1 - leg, leg * side, leg * (1 - side), 0);
    } else {
      const upper = y >= abdomen.y;
      const amount = THREE.MathUtils.clamp(
        upper ? (y - abdomen.y) / (chest.y - abdomen.y) : (y - hip.y) / (abdomen.y - hip.y),
        0,
        1
      );
      skinIndices.push(joints[upper ? 1 : 0], joints[upper ? 2 : 1], 0, 0);
      weights.push(1 - amount, amount, 0, 0);
    }
    if (face) {
      for (let corner = 0; corner < 3; corner++) {
        const id = face.ids[corner];
        for (let influence = 0; influence < 4; influence++) {
          const sourceIndex = face.mesh.geometry.attributes.skinIndex.getComponent(id, influence);
          const joint = source.skeleton.bones.indexOf(face.mesh.skeleton.bones[sourceIndex]);
          const weight =
            face.mesh.geometry.attributes.skinWeight.getComponent(id, influence) *
            barycentric.getComponent(corner) *
            blend;
          if (joint >= 0 && joint <= 255 && weight > 0)
            transferred.set(joint, (transferred.get(joint) ?? 0) + weight);
        }
      }
      for (let influence = 0; influence < 4; influence++) {
        const joint = skinIndices[offset + influence];
        transferred.set(
          joint,
          (transferred.get(joint) ?? 0) + weights[offset + influence] * (1 - blend)
        );
      }
      const sorted = [...transferred].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = sorted.reduce((sum, entry) => sum + entry[1], 0);
      if (total > 0)
        for (let influence = 0; influence < 4; influence++) {
          skinIndices[offset + influence] = sorted[influence]?.[0] ?? 0;
          weights[offset + influence] = (sorted[influence]?.[1] ?? 0) / total;
        }
    }
  }
  function panel(
    columns: number,
    rows: number,
    point: (u: number, v: number) => [number, number, number],
    colour: THREE.Color,
    shade = false,
    vent = false
  ) {
    const start = positions.length / 3;
    for (let row = 0; row <= rows; row++)
      for (let column = 0; column <= columns; column++) {
        const u = column / columns,
          v = row / rows,
          p = point(u, v);
        vertex(...p, colour, shade ? 0.95 + 0.05 * Math.cos(u * Math.PI * 10 + v * 4) : 1);
        if (row < rows && column < columns) {
          // A real centre vent lets the two lower flaps follow opposite thighs.
          // Blending both legs through one sheet pulls the hem into the trousers.
          if (vent && p[1] < hip.y && column === 9) continue;
          const a = start + row * (columns + 1) + column,
            b = a + columns + 1;
          indices.push(a, b + 1, b, a, a + 1, b + 1);
        }
      }
  }
  function shape(u: number, v: number): [number, number, number] {
    const y = THREE.MathUtils.lerp(top, hem, v);
    const aboveWaist = THREE.MathUtils.smoothstep(y, waist, top);
    const width = THREE.MathUtils.lerp(0.235, 0.112, aboveWaist);
    const across = u * 2 - 1;
    const fold = 0.006 * Math.sin(across * Math.PI * 3 + v * 0.8) * (1 - aboveWaist);
    return [
      hip.x + across * width,
      y - (1 - across * across) * 0.008 * (1 - v),
      frontAt(y) +
        0.032 +
        0.018 * (1 - aboveWaist) +
        across * across * THREE.MathUtils.lerp(0.005, -0.02, aboveWaist) +
        fold,
    ];
  }
  panel(20, 24, shape, linen, true, true);
  // Sewn edges sit on the same folded cloth rather than floating straight lines.
  for (const edge of [0, 1])
    panel(
      1,
      24,
      (u, v) => {
        const p = shape(edge === 0 ? u * 0.012 : 1 - u * 0.012, v);
        p[2] += 0.0015;
        return p;
      },
      stitch
    );
  for (const edge of [0, 1])
    panel(
      20,
      1,
      (u, v) => {
        const p = shape(u, edge === 0 ? v * 0.009 : 1 - v * 0.009);
        p[2] += 0.0015;
        return p;
      },
      stitch,
      false,
      edge === 1
    );
  function clothAt(x: number, y: number) {
    const width = THREE.MathUtils.lerp(0.235, 0.112, THREE.MathUtils.smoothstep(y, waist, top));
    return shape(0.5 + x / (2 * width), (top - y) / (top - hem));
  }
  const pocketTop = waist + 0.075,
    pocketBottom = waist - 0.065;
  panel(
    10,
    6,
    (u, v) => {
      const p = clothAt((u * 2 - 1) * 0.105, THREE.MathUtils.lerp(pocketTop, pocketBottom, v));
      p[2] += 0.008 + 0.022 * Math.sin(u * Math.PI) * Math.sin(((1 - v) * Math.PI) / 2);
      return p;
    },
    pocket,
    true
  );
  panel(
    10,
    1,
    (u, v) => {
      const p = clothAt((u * 2 - 1) * 0.105, pocketTop - v * 0.006);
      p[2] += 0.01 + 0.022 * Math.sin(u * Math.PI);
      return p;
    },
    stitch
  );
  // Soft waist webbing and a small tied bow retain the back silhouette too.
  let back = Infinity;
  for (const p of cloud) if (Math.abs(p.y - waist) < 0.06) back = Math.min(back, p.z);
  if (!Number.isFinite(back)) back = hip.z - 0.12;
  const front = frontAt(waist),
    centreZ = (front + 0.055 + back - 0.018) / 2,
    radiusZ = (front + 0.055 - back + 0.018) / 2;
  panel(
    32,
    1,
    (u, v) => {
      const angle = u * Math.PI * 2;
      return [
        hip.x + Math.sin(angle) * 0.242,
        waist + (v - 0.5) * 0.025,
        centreZ + Math.cos(angle) * radiusZ,
      ];
    },
    strap
  );
  for (const side of [-1, 1]) {
    panel(
      12,
      1,
      (u, v) => [
        hip.x + side * Math.sin(u * Math.PI) * 0.065,
        waist - Math.sin(u * Math.PI * 2) * 0.022 + (v - 0.5) * 0.015,
        back - 0.025 - Math.sin(u * Math.PI) * 0.015,
      ],
      strap
    );
    panel(
      12,
      1,
      (u, v) => [
        hip.x + side * (0.075 + u * 0.014 + (v - 0.5) * 0.018),
        top + Math.sin(u * Math.PI) * 0.1,
        THREE.MathUtils.lerp(frontAt(top) + 0.03, back - 0.008, u),
      ],
      strap
    );
  }
  // A few teal stitches form a small grain sprig, no text or extra decal draw.
  const markY = top - 0.105;
  for (let i = 0; i < 5; i++)
    for (const side of [-1, 1])
      panel(
        1,
        1,
        (u, v) => {
          const y = markY + i * 0.014 + u * 0.012;
          const p = clothAt(side * (u * 0.022 + (v - 0.5) * 0.003), y);
          p[2] += 0.002;
          return p;
        },
        stitch
      );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // These generated and decoded worker attributes are non-interleaved buffers.
  // Preserve the source upload metadata as well as its array layout for merging.
  for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
    (geometry.getAttribute(name) as THREE.BufferAttribute).gpuType = (
      source.geometry.getAttribute(name) as THREE.BufferAttribute
    ).gpuType;
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Metre-space civilian cuts, seated on the measured Head-space scalp.
 * Each style is one shared lit surface. Industrial exports keep their own hair.
 * Working if front hairlines clear the eyes and the five styles resolve distinctly.
 */
export function createWorkerHair(style: 'short' | 'medium' | 'curly' | 'ponytail') {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [];
  const colours: number[] = [],
    flex: number[] = [],
    indices: number[] = [];
  const segments = 24,
    rings = 10;
  const rx = style === 'curly' ? 0.116 : 0.111;
  const ry = style === 'medium' ? 0.126 : 0.116;
  const rz = style === 'medium' ? 0.114 : 0.107;
  const normal = new THREE.Vector3();
  for (let row = 0; row <= rings; row++) {
    for (let column = 0; column <= segments; column++) {
      const theta = (column / segments) * Math.PI * 2;
      const front = Math.max(0, Math.cos(theta));
      const back = Math.max(0, -Math.cos(theta));
      const hairline =
        1.64 -
        front ** 3 * 0.63 +
        back * (style === 'medium' ? 0.6 : 0.25) +
        0.04 * Math.sin(theta * 4 + 0.5);
      const phi = (row / rings) * hairline;
      const wave =
        style === 'curly'
          ? 0.005 * Math.sin(theta * 7 + phi * 8)
          : 0.006 * Math.sin(theta * 6 + phi * 2.5);
      const radial = 1 + (Math.sin(phi) * wave) / rx;
      const x = rx * Math.sin(phi) * Math.sin(theta) * radial;
      const y = 0.09 + ry * Math.cos(phi) + Math.sin(phi) * 0.004 * Math.sin(theta - 0.6);
      const z = 0.01 + rz * Math.sin(phi) * Math.cos(theta) * radial;
      positions.push(x, y, z);
      normal.set(x / (rx * rx), (y - 0.09) / (ry * ry), (z - 0.01) / (rz * rz)).normalize();
      normals.push(...normal.toArray());
      uvs.push(column / segments, row / rings);
      // Broad swept locks survive a normal portrait distance, unlike a smooth
      // uniformly coloured cap. The crown converges to one seamless tone.
      const locks = 0.5 + 0.5 * Math.sin(theta * 6 + phi * 2.5);
      const tone = THREE.MathUtils.lerp(0.88, 0.58 + 0.46 * locks, Math.sin(phi));
      colours.push(tone, tone, tone);
      flex.push(0);
      if (row < rings && column < segments) {
        const a = row * (segments + 1) + column,
          b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  cap.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  cap.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  cap.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  cap.setAttribute('hairFlex', new THREE.Float32BufferAttribute(flex, 1));
  cap.setIndex(indices);
  const parts = [cap];
  if (style === 'curly') {
    const locks = [
      [-0.06, 0.177, 0.07],
      [0, 0.19, 0.082],
      [0.055, 0.181, 0.065],
      [-0.085, 0.171, 0.005],
      [-0.035, 0.203, 0.025],
      [0.025, 0.208, 0.018],
      [0.078, 0.183, 0.012],
      [-0.065, 0.176, -0.052],
      [-0.02, 0.194, -0.045],
      [0.04, 0.193, -0.05],
      [0.08, 0.16, -0.045],
      [-0.035, 0.137, -0.085],
      [0.026, 0.151, -0.084],
    ];
    for (let lock = 0; lock < locks.length; lock++) {
      const curl = new THREE.SphereGeometry(1, 8, 6)
        .scale(0.039 + (lock % 3) * 0.001, 0.026 + (lock % 3) * 0.001, 0.037)
        .rotateY(lock * 0.71)
        .translate(...(locks[lock] as [number, number, number]));
      fittingTint(curl, 0.8 + (lock % 3) * 0.07);
      curl.setAttribute(
        'hairFlex',
        new THREE.Float32BufferAttribute(new Float32Array(curl.attributes.position.count), 1)
      );
      parts.push(curl);
    }
  }
  if (style === 'ponytail') {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.124, -0.088),
      new THREE.Vector3(0, 0.105, -0.123),
      new THREE.Vector3(0.008, 0.045, -0.144),
      new THREE.Vector3(0.016, -0.013, -0.14),
    ]);
    const tail = new THREE.TubeGeometry(path, 10, 1, 10, false);
    const pos = tail.attributes.position,
      n = tail.attributes.normal;
    const weights = new Float32Array(pos.count);
    const point = new THREE.Vector3(),
      centre = new THREE.Vector3();
    for (let index = 0; index < pos.count; index++) {
      const t = Math.floor(index / 11) / 10;
      path.getPointAt(t, centre);
      point
        .fromBufferAttribute(pos, index)
        .sub(centre)
        .multiplyScalar(
          0.025 * (1 - t * 0.76) * (1 + 0.1 * Math.cos(((index % 11) / 10) * Math.PI * 6 + t * 2))
        )
        .add(centre);
      pos.setXYZ(index, point.x, point.y, point.z);
      weights[index] = THREE.MathUtils.smoothstep(t, 0.12, 1);
    }
    tail.computeVertexNormals();
    n.needsUpdate = true;
    fittingTint(tail, 0.9);
    const tailColour = tail.getAttribute('color');
    for (let index = 0; index < pos.count; index++) {
      const t = Math.floor(index / 11) / 10;
      // A dark elastic at the root makes the tied shape legible in one material.
      const tone =
        t <= 0.1
          ? 0.16
          : 0.67 + 0.3 * (0.5 + 0.5 * Math.cos(((index % 11) / 10) * Math.PI * 6 + t * 2));
      tailColour.setXYZ(index, tone, tone, tone);
    }
    tail.setAttribute('hairFlex', new THREE.Float32BufferAttribute(weights, 1));
    parts.push(tail);
    const tip = new THREE.SphereGeometry(0.006, 10, 6).translate(0.016, -0.013, -0.14);
    fittingTint(tip, 0.9);
    tip.setAttribute(
      'hairFlex',
      new THREE.Float32BufferAttribute(new Float32Array(tip.attributes.position.count).fill(1), 1)
    );
    parts.push(tip);
  }
  const result = assembleWorkerFitting(parts);
  result.name = `worker-hair-${style}`;
  return result;
}

export const WORKER_HAIR_GEOMETRIES = {
  short: createWorkerHair('short'),
  medium: createWorkerHair('medium'),
  curly: createWorkerHair('curly'),
  ponytail: createWorkerHair('ponytail'),
  bald: null,
};

/** Private flexible tail, with exact unmoving cap/root vertices and shared static cuts.
 * Working if walking produces a small tip response, rest settles, pause freezes,
 * and disposing one wearer never disposes a shared hairstyle.
 */
export function createWorkerHairMotion(source: THREE.BufferGeometry) {
  const weights = source.getAttribute('hairFlex');
  const dynamic = Array.from(weights.array).some((value) => value > 0);
  const geometry = dynamic ? source.clone() : source;
  const rest = source.getAttribute('position'),
    restNormal = source.getAttribute('normal');
  const position = geometry.getAttribute('position') as THREE.BufferAttribute,
    normals = geometry.getAttribute('normal') as THREE.BufferAttribute;
  if (dynamic) {
    position.setUsage(THREE.DynamicDrawUsage);
    normals.setUsage(THREE.DynamicDrawUsage);
    geometry.boundingBox?.expandByScalar(0.025);
    geometry.boundingSphere!.radius += 0.04;
  }
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  const rotation = new THREE.Quaternion(),
    euler = new THREE.Euler();
  const pivot = new THREE.Vector3(0, 0.124, -0.088);
  let energy = 0;
  return {
    geometry,
    apply(seconds: number, delta: number, speed: number, resting: boolean) {
      if (!dynamic || !Number.isFinite(delta) || delta <= 0) return;
      const dt = THREE.MathUtils.clamp(delta, 0, 0.15);
      const pace = Number.isFinite(speed) ? THREE.MathUtils.clamp(speed, 0, 2) : 0;
      energy = THREE.MathUtils.damp(energy, resting ? 0 : pace, 6, dt);
      const t = Number.isFinite(seconds) ? seconds : 0;
      const sway = Math.sin(t * 4.8) * energy * 0.055 + Math.sin(t * 1.45) * 0.018;
      const bounce = Math.sin(t * 9.6) * energy * 0.025;
      for (let index = 0; index < position.count; index++) {
        const weight = weights.getX(index);
        if (weight === 0) continue;
        rotation.setFromEuler(euler.set(bounce * weight, 0, sway * weight));
        point.fromBufferAttribute(rest, index).sub(pivot).applyQuaternion(rotation).add(pivot);
        normal.fromBufferAttribute(restNormal, index).applyQuaternion(rotation).normalize();
        position.setXYZ(index, point.x, point.y, point.z);
        normals.setXYZ(index, normal.x, normal.y, normal.z);
      }
      position.needsUpdate = true;
      normals.needsUpdate = true;
    },
    dispose() {
      if (dynamic) geometry.dispose();
    },
  };
}

/** Shared fittings use real metre dimensions and stay within the old mounts.
 * Working if shells/cushions read separately without extra meshes or textures.
 */
function assembleWorkerFitting(parts: THREE.BufferGeometry[]) {
  const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const result = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((part) => part.dispose());
  if (!result) throw new Error('Worker fitting attributes must match');
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
function fittingTint(geometry: THREE.BufferGeometry, value: number) {
  const colours = new Float32Array(geometry.getAttribute('position').count * 3).fill(value);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return geometry;
}
export function createWorkerHearingCup() {
  const shell = new RoundedBoxGeometry(0.069, 0.018, 0.076, 2, 0.008).translate(0, 0.0035, 0);
  const cushion = new THREE.LatheGeometry(
    [
      [0.027, -0.0125],
      [0.033, -0.0125],
      [0.035, -0.01],
      [0.035, -0.0075],
      [0.031, -0.0055],
      [0.027, -0.0055],
      [0.027, -0.0125],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    16
  );
  return assembleWorkerFitting([fittingTint(shell, 1), fittingTint(cushion, 0.22)]);
}
export function createWorkerHearingBand() {
  const band = new THREE.TorusGeometry(0.104, 0.008, 6, 18, Math.PI).scale(1, 1, 0.65);
  const parts: THREE.BufferGeometry[] = [band];
  for (const side of [-1, 1])
    parts.push(
      new RoundedBoxGeometry(0.013, 0.027, 0.014, 1, 0.003).translate(side * 0.104, 0.005, 0)
    );
  return assembleWorkerFitting(parts);
}
export function createWorkerGlassesTemple() {
  // The front end enters the lens at z=.004; the rear curls gently over the ear.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.056),
    new THREE.Vector3(0, 0, 0.013),
    new THREE.Vector3(0, -0.001, -0.029),
    new THREE.Vector3(0, -0.012, -0.052),
  ]);
  return new THREE.TubeGeometry(path, 9, 0.004, 6, false);
}
/** Fitted protective rims, in the unchanged lens mount's metres. The bridge
 * owns this one shared draw; optical centres stay open and temples stay separate.
 * Working if both clear lenses meet continuous bevelled rims and their bridge.
 */
export function createWorkerGlassesFrame() {
  const parts: THREE.BufferGeometry[] = [
    new THREE.CapsuleGeometry(0.005, 0.024, 2, 6).rotateZ(Math.PI / 2),
  ];
  function rounded(path: THREE.Path, w: number, h: number, r: number) {
    path.moveTo(-w + r, -h);
    path.lineTo(w - r, -h);
    path.quadraticCurveTo(w, -h, w, -h + r);
    path.lineTo(w, h - r);
    path.quadraticCurveTo(w, h, w - r, h);
    path.lineTo(-w + r, h);
    path.quadraticCurveTo(-w, h, -w, h - r);
    path.lineTo(-w, -h + r);
    path.quadraticCurveTo(-w, -h, -w + r, -h);
    path.closePath();
  }
  for (const x of [-0.047, 0.047]) {
    const rim = new THREE.Shape(),
      opening = new THREE.Path();
    rounded(rim, 0.0359, 0.0204, 0.0074);
    rounded(opening, 0.0332, 0.0177, 0.0047);
    rim.holes.push(opening);
    parts.push(
      new THREE.ExtrudeGeometry(rim, {
        depth: 0.006,
        bevelEnabled: true,
        bevelSize: 0.0006,
        bevelThickness: 0.0006,
        bevelSegments: 1,
        steps: 1,
        curveSegments: 4,
      }).translate(x, 0, -0.003)
    );
  }
  return assembleWorkerFitting(parts);
}
export function createWorkerChestRadio() {
  const parts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(0.052, 0.082, 0.026, 2, 0.006)];
  for (let row = 0; row < 4; row++)
    parts.push(
      new RoundedBoxGeometry(0.031, 0.0028, 0.003, 1, 0.001).translate(
        0,
        0.015 - row * 0.008,
        0.013
      )
    );
  return assembleWorkerFitting(parts);
}

/** Rounded pouch, flap, rear belt loop and closed seam/fastener fittings.
 * Working if all details attach inside the original 75 x 105 x 45 mm envelope.
 */
export function createWorkerToolPouch() {
  const parts: THREE.BufferGeometry[] = [
    new RoundedBoxGeometry(0.075, 0.105, 0.036, 2, 0.006).translate(0, 0, 0.0005),
    new RoundedBoxGeometry(0.072, 0.039, 0.0056, 2, 0.0025).translate(0, 0.031, 0.0185),
    new RoundedBoxGeometry(0.055, 0.045, 0.002, 1, 0.0008).translate(0, 0.024, -0.0215),
    new RoundedBoxGeometry(0.012, 0.014, 0.003, 1, 0.001).translate(0, 0.025, 0.021),
    new THREE.BoxGeometry(0.055, 0.0015, 0.002).translate(0, -0.04, 0.0194),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      new RoundedBoxGeometry(0.004, 0.045, 0.005, 1, 0.001).translate(side * 0.0255, 0.024, -0.0195)
    );
    parts.push(
      new THREE.BoxGeometry(0.0015, 0.058, 0.002).translate(side * 0.0275, -0.011, 0.0194)
    );
  }
  return assembleWorkerFitting(parts);
}

function createWorkerToolBelt(pouch: THREE.BufferGeometry) {
  return assembleWorkerFitting([
    new THREE.BoxGeometry(0.32, 0.026, 0.032).translate(0, 0.012, -0.035),
    pouch.clone().translate(-0.14, 0, 0),
    pouch.clone().translate(0.14, 0, 0),
  ]);
}
const TOOL_POUCH = createWorkerToolPouch();

// Immutable shared accessories. Instance disposal must never dispose these.
export const SHARED_WORKER_GEOMETRY = {
  toolPouch: TOOL_POUCH,
  toolBelt: createWorkerToolBelt(TOOL_POUCH),
  hearingCup: createWorkerHearingCup(),
  hearingBand: createWorkerHearingBand(),
  glassesTemple: createWorkerGlassesTemple(),
  identityBadge: new RoundedBoxGeometry(0.062, 0.082, 0.009, 2, 0.004),
  chestRadio: createWorkerChestRadio(),
  eyePupil: new THREE.SphereGeometry(1, 10, 6),
  glassesLens: new RoundedBoxGeometry(0.073, 0.042, 0.01, 2, 0.008),
  glassesBridge: createWorkerGlassesFrame(),
};

/** Actual skinned eye-front centres in Head local space, not raw bind vertices.
 * Working if facial fittings stay centred on both bodies throughout their clips.
 */
export const WORKER_EYE_CENTRES = {
  masculine: [0.0004, 0.108, 0.112],
  feminine: [0.00035, 0.103, 0.114],
} as const;
