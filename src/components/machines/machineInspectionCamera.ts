import * as THREE from 'three';
import type { Vec3Tuple } from '../../constants/siteLayout';

export type MachineInspectionCameraKind = 'mill' | 'sifter' | 'packer' | 'silo';

export interface MachineInspectionCameraPose {
  readonly eye: [number, number, number];
  readonly target: [number, number, number];
  /** Vertical lens that frames the stage's subject at the eye's distance. */
  readonly fov: number;
}

/**
 * Turn of the cutaway about its own vertical axis; its open face is local +z.
 * The silos stand in a row along z, 13 m apart with a 1 m gap, so a lesson
 * framed along the row looked through the next silo up it. A silo's cut turns
 * a quarter to face +x, the open yard side away from the mill hall (x <= 40),
 * and its eye stands on that side. Working if no silo lesson's eye is inside,
 * or looks through, a neighbouring silo.
 */
export function machineInspectionYaw(kind: MachineInspectionCameraKind): number {
  return kind === 'silo' ? Math.PI / 2 : 0;
}

/**
 * Where a cutaway lesson puts the camera for one stage, in world metres.
 * Pure, so the framing can be checked against the site without a Canvas.
 */
export function machineInspectionCamera(
  kind: MachineInspectionCameraKind,
  stage: number,
  position: Vec3Tuple,
  scale: Vec3Tuple
): MachineInspectionCameraPose {
  const targets: Vec3Tuple[] =
    kind === 'silo'
      ? [
          [0, 8.1, 0],
          [0, 8.5, 0],
          [0, 4, 0],
          [0, 1.4, 0],
        ]
      : kind === 'mill'
        ? [
            [0, 5.3, 0],
            [0, 2.6, 0],
            [0, 2.1, 0],
            [0, 0.9, 0],
          ]
        : kind === 'sifter'
          ? [
              [0, 5.7, 0],
              [0, 3.2, 0],
              [0, 2.5, 0],
              [0, 0.7, 0],
            ]
          : [
              [0, 5.5, 0],
              [0, 3.8, 0],
              [0, 2.75, 0],
              [0, 1.6 / scale[1], 1.9 / scale[2]],
            ];
  const target = new THREE.Vector3(...targets[stage])
    .multiply(new THREE.Vector3(...scale))
    .add(new THREE.Vector3(...position));
  const size =
    kind === 'silo'
      ? Math.max(5.4 * scale[0], (stage === 0 ? 17.5 : 5.5) * scale[1])
      : kind === 'sifter'
        ? 3.9
        : 3;
  const distance = Math.max(15.5, size * 1.5);
  const eye = target.clone().add(
    new THREE.Vector3(
      ...(kind === 'mill' && (stage === 1 || stage === 2)
        ? ([0.6, 1.7, 1] as const)
        : kind === 'silo'
          ? // Square to the turned cut, edged towards +z so the nearest
            // silo's eye clears the maintenance garage at z <= 6.15.
            ([1, 0.14, 0.19] as const)
          : ([0.19, 0.14, 1] as const))
    )
      .normalize()
      .multiplyScalar(distance)
  );
  return {
    eye: eye.toArray(),
    target: target.toArray(),
    fov: THREE.MathUtils.radToDeg(2 * Math.atan(size / (2 * distance))),
  };
}
