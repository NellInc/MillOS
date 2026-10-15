import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
