/**
 * Where the first-person body is, for readers outside the Canvas (the
 * mini-map). The controllers write it each frame in place; nothing allocates.
 * `active` is false whenever no first-person controller is mounted.
 */
export const firstPersonPose = {
  active: false,
  x: 0,
  z: 0,
  /** Facing, as a three.js Y rotation: 0 looks toward -z. */
  yaw: 0,
};

export function writeFirstPersonPose(x: number, z: number, yaw: number): void {
  firstPersonPose.active = true;
  firstPersonPose.x = x;
  firstPersonPose.z = z;
  firstPersonPose.yaw = yaw;
}

export function clearFirstPersonPose(): void {
  firstPersonPose.active = false;
}
