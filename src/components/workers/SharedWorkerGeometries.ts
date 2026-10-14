import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Immutable shared accessories. Instance disposal must never dispose these.
export const SHARED_WORKER_GEOMETRY = {
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
