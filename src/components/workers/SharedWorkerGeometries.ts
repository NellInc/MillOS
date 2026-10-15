import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
  glassesBridge: new THREE.CapsuleGeometry(0.005, 0.024, 2, 6),
};

/** Actual skinned eye-front centres in Head local space, not raw bind vertices.
 * Working if facial fittings stay centred on both bodies throughout their clips.
 */
export const WORKER_EYE_CENTRES = {
  masculine: [0.0004, 0.108, 0.112],
  feminine: [0.00035, 0.103, 0.114],
} as const;
