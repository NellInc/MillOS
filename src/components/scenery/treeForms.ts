import * as THREE from 'three';

/** Independent, repeatable channels; terrain height never changes a tree's form. */
export function treeSeed(position: readonly [number, number, number], channel: number): number {
  const value =
    Math.sin(position[0] * 39.3467 + position[2] * 11.135 + channel * 71.173) * 24634.6345;
  return value - Math.floor(value);
}

// Spreading, upright, oval and full crowns. All stay within the old site envelope.
const BROADLEAF_FORMS = [
  [0.95, 0.69, 0.88],
  [0.68, 1.02, 0.75],
  [0.79, 0.86, 0.95],
  [0.93, 0.94, 0.91],
] as const;

export function treeFormFromPosition(position: readonly [number, number, number], conifer = false) {
  const habit = Math.floor(treeSeed(position, 1) * BROADLEAF_FORMS.length);
  const form = BROADLEAF_FORMS[habit];
  return {
    scale: new THREE.Vector3(
      conifer
        ? 0.72 + treeSeed(position, 2) * 0.24
        : form[0] * (0.94 + treeSeed(position, 2) * 0.06),
      conifer
        ? 0.82 + treeSeed(position, 3) * 0.23
        : form[1] * (0.95 + treeSeed(position, 3) * 0.1),
      conifer ? 0.76 + treeSeed(position, 4) * 0.2 : form[2] * (0.94 + treeSeed(position, 4) * 0.06)
    ),
    leanX: (treeSeed(position, 5) - 0.5) * (conifer ? 0.025 : 0.05),
    leanZ: (treeSeed(position, 6) - 0.5) * (conifer ? 0.025 : 0.05),
  };
}

/**
 * One rest transform for trunk, forks and crown, including generated meshes.
 * Rotation plus nonuniform scale preserves three's instanced normal transform;
 * a shear would not. Seat the tilted root flare slightly into the ground.
 * Working if crowns remain connected, roots never float and clearance tests pass.
 */
export function createTreeMatrix(
  position: readonly [number, number, number],
  scale: number,
  yaw: number,
  conifer = false
): THREE.Matrix4 {
  const form = treeFormFromPosition(position, conifer);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(form.leanX, yaw, form.leanZ, 'YXZ')),
    form.scale.multiplyScalar(scale)
  );
  // 0.4 m bounds every source root flare. Highest point of its tilted base
  // circle is now at or below the supplied ground height, without an open gap.
  matrix.elements[13] -= 0.4 * Math.hypot(matrix.elements[1], matrix.elements[9]);
  return matrix;
}
