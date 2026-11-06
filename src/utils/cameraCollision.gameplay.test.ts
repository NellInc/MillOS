import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { resolveCameraCollision } from './cameraCollision';
import { createMachineObstacles } from '../constants/factoryObstacles';
import { SITE_LAYOUT, getMachineAssemblyScale, type Vec3Tuple } from '../constants/siteLayout';
import { MachineType } from '../types';

const obstacles = createMachineObstacles(0);
const silo = (id: string) => obstacles.find((obstacle) => obstacle.id === id);

/** Frames of a held key, as CameraController steps them (lifted to 1.5 m, then resolved). */
function hold(from: Vec3Tuple, step: Vec3Tuple, frames = 60): Vec3Tuple {
  let position = from;
  for (let frame = 0; frame < frames; frame++) {
    const requested: Vec3Tuple = [
      position[0] + step[0],
      Math.max(1.5, position[1] + step[1]),
      position[2] + step[2],
    ];
    position = resolveCameraCollision(position, requested).position;
  }
  return position;
}

describe('camera collision push-out', () => {
  // A preset flight skips collision (it owns its path), so input that cancels
  // it mid-route can leave the camera inside a machine envelope: flying from
  // just south of a silo to Shipping passes through that silo at about 2 m.
  const epsilon = silo('silo-4');
  // A metre west of the centre, so the west face is the nearest side.
  const low: Vec3Tuple = [
    ((epsilon?.minX ?? 0) + (epsilon?.maxX ?? 0)) / 2 - 1,
    2.1,
    ((epsilon?.minZ ?? 0) + (epsilon?.maxZ ?? 0)) / 2 + 0.5,
  ];

  it('never pushes a camera caught low inside a machine down through the floor', () => {
    const { position, collidedWith } = resolveCameraCollision(low, low);
    expect(collidedWith).toBe('silo-4');
    // The resolver clamps every request to 1.5 m; its push-out must keep to it.
    expect(position[1]).toBeGreaterThanOrEqual(1.5);
  });

  it('leaves W A S D able to move the camera again after the push-out', () => {
    const pushed = resolveCameraCollision(low, low).position;
    // Two seconds of a held key at 20 m/s.
    const moved = hold(pushed, [-0.33, 0, 0], 120);
    expect(moved[0]).toBeLessThan((epsilon?.minX ?? 0) - 0.65 - 10);
    expect(moved[1]).toBeGreaterThanOrEqual(1.5);
  });

  // The silo lesson used to fly to an eye 15.5 m along (0.19, 0.14, 1) from its
  // target, past the next silo up the row. For the third silo that eye sat
  // inside the first silo's envelope, which overlaps the second's across the
  // 1 m gap, and the push-out put it back into the gap. The lesson now stands
  // on the yard side (machineInspectionCamera.test.ts); this keeps the
  // resolver honest for any camera that still arrives there.
  it('does not wedge the camera between two silos after a silo lesson flight', () => {
    const anchor = SITE_LAYOUT.machines.silos[2];
    const machine = {
      type: MachineType.SILO,
      size: SITE_LAYOUT.machineDimensions.silo as Vec3Tuple,
      position: anchor.position as Vec3Tuple,
    };
    const scale = getMachineAssemblyScale(machine);
    const target = new THREE.Vector3(0, 4, 0)
      .multiply(new THREE.Vector3(...scale))
      .add(new THREE.Vector3(...machine.position));
    const size = Math.max(5.4 * scale[0], 5.5 * scale[1]);
    const eye = target
      .clone()
      .add(new THREE.Vector3(0.19, 0.14, 1).normalize().multiplyScalar(Math.max(15.5, size * 1.5)))
      .toArray() as Vec3Tuple;
    // The first frame after the flight resolves the eye where it stands.
    const settled = resolveCameraCollision(eye, eye).position;
    // One second of W (towards the lesson) and of S (backing away) each move.
    const forward = hold(settled, [0, 0, -0.33]);
    const back = hold(settled, [0, 0, 0.33]);
    expect(Math.abs(forward[2] - settled[2])).toBeGreaterThan(5);
    expect(Math.abs(back[2] - settled[2])).toBeGreaterThan(5);
  });
});
