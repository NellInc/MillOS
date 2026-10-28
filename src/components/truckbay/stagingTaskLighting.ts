import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { STAGING_LAYOUT } from './palletStagingLayout';
import { YARD_MAST } from './dockApronLayout';

// This is a fixed working optic, not a lamp attached to movable stock. Its pool
// covers the authored default shipping staging footprint; relocated stock can
// leave it. Existing decorative yard lights keep their High/Ultra policy.
// Working if the mounted lens points at the same default footprint as this
// source, Medium adds one stable task source, High replaces one old point,
// and no source or shadow-map count changes with time, stock or camera.
const dockZ = SITE_LAYOUT.portals.shipping.centre[2];
export const SHIPPING_TASK_LIGHT = {
  mast: [30, 0, 35] as const,
  pivotHeight: YARD_MAST.height,
  aimWorld: [
    STAGING_LAYOUT.shippingOrigin[0] + ((STAGING_LAYOUT.columns - 1) * STAGING_LAYOUT.pitchX) / 2,
    0.65,
    STAGING_LAYOUT.shippingOrigin[2] - ((STAGING_LAYOUT.rows - 1) * STAGING_LAYOUT.pitchZ) / 2,
  ] as const,
  sourceOffset: -0.085,
  intensity: 6000,
  distance: 50,
  angle: 0.42,
  penumbra: 0.18,
  colour: '#ffe5b9',
} as const;

export const SHIPPING_TASK_MAST_TOP_WORLD = new THREE.Vector3(
  SHIPPING_TASK_LIGHT.mast[0],
  SHIPPING_TASK_LIGHT.pivotHeight,
  SHIPPING_TASK_LIGHT.mast[2] + dockZ
);
// The optical face must clear the pole, not shine from inside its top. Move
// the entire head 0.5m outboard and join its rear housing with a short bracket.
const outboard = new THREE.Vector3(...SHIPPING_TASK_LIGHT.aimWorld).sub(
  SHIPPING_TASK_MAST_TOP_WORLD
);
outboard.y = 0;
outboard.normalize().multiplyScalar(0.5);
export const SHIPPING_TASK_PIVOT_WORLD = SHIPPING_TASK_MAST_TOP_WORLD.clone().add(outboard);
export const SHIPPING_TASK_HEAD_LOCAL: [number, number, number] = [
  outboard.x,
  SHIPPING_TASK_LIGHT.pivotHeight,
  outboard.z,
];
export const SHIPPING_TASK_DIRECTION = new THREE.Vector3(...SHIPPING_TASK_LIGHT.aimWorld)
  .sub(SHIPPING_TASK_PIVOT_WORLD)
  .normalize();
export const SHIPPING_TASK_ORIENTATION = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, -1, 0),
  SHIPPING_TASK_DIRECTION
);
export const SHIPPING_TASK_SOURCE_WORLD = SHIPPING_TASK_PIVOT_WORLD.clone().addScaledVector(
  SHIPPING_TASK_DIRECTION,
  -SHIPPING_TASK_LIGHT.sourceOffset
);
const bracketStart = SHIPPING_TASK_MAST_TOP_WORLD.clone().add(new THREE.Vector3(0, -0.05, 0));
const bracketEnd = SHIPPING_TASK_PIVOT_WORLD.clone().addScaledVector(SHIPPING_TASK_DIRECTION, -0.3);
const bracketVector = bracketEnd.clone().sub(bracketStart);
export const SHIPPING_TASK_BRACKET_LENGTH = bracketVector.length();
export const SHIPPING_TASK_BRACKET_ORIENTATION = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  bracketVector.normalize()
);
export const SHIPPING_TASK_BRACKET_LOCAL = bracketStart
  .clone()
  .add(bracketEnd)
  .multiplyScalar(0.5)
  .sub(new THREE.Vector3(SHIPPING_TASK_LIGHT.mast[0], 0, SHIPPING_TASK_LIGHT.mast[2] + dockZ))
  .toArray() as [number, number, number];
// Shared registration gain also permits a same-page contribution control without
// removing the source or changing a shader's NUM_SPOT_LIGHTS permutation.
export const SHIPPING_TASK_GAIN = { value: 1 };
