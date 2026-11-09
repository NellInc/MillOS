import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  holdPose,
  isPoseHeld,
  isPoseSettled,
  notePoseSettled,
  releaseHeldPose,
  resumePose,
  SELF_PLACED,
  shieldHeldChildren,
} from './poseHold';
import type { WorkerMotionState } from './workerTypes';

const motionState = (): WorkerMotionState => ({
  activity: 'working',
  groundSpeed: 0,
  seated: false,
  phase: 0,
  enabled: false,
});

function person() {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const hips = new THREE.Group();
  const hand = new THREE.Mesh();
  // An object that already owns its matrix, as WorkerModel's static meshes do.
  const fixed = new THREE.Mesh();
  fixed.matrixAutoUpdate = false;
  root.position.set(4, 0, -2);
  root.rotation.y = 0.7;
  hips.position.y = 1;
  hand.position.set(0.3, 0.2, 0.1);
  scene.add(root);
  root.add(hips);
  hips.add(hand, fixed);
  scene.updateMatrixWorld();
  return { scene, root, hips, hand, fixed };
}

describe('held transforms for a person standing still', () => {
  it('does no matrix work for a held body and keeps its world matrices exact', () => {
    const { scene, root, hips, hand } = person();
    const motion = motionState();
    const drawn = hand.matrixWorld.clone();
    holdPose(motion, root);
    const composed = [root, hips, hand].map((node) => vi.spyOn(node, 'updateMatrix'));
    scene.updateMatrixWorld();
    for (const spy of composed) expect(spy).not.toHaveBeenCalled();
    expect(hand.matrixWorld.equals(drawn)).toBe(true);
    // A forced update (the runtime audit's) still lands on the same matrices.
    scene.updateMatrixWorld(true);
    expect(hand.matrixWorld.equals(drawn)).toBe(true);
  });

  it('hands every held object back on release, and leaves self-managed ones alone', () => {
    const { scene, root, hips, hand, fixed } = person();
    const motion = motionState();
    notePoseSettled(motion);
    holdPose(motion, root);
    expect(isPoseHeld(motion)).toBe(true);
    expect(fixed.matrixAutoUpdate).toBe(false);
    resumePose(motion);
    expect(isPoseHeld(motion)).toBe(false);
    expect(isPoseSettled(motion)).toBe(false);
    expect([root.matrixAutoUpdate, hips.matrixAutoUpdate, hand.matrixAutoUpdate]).toEqual([
      true,
      true,
      true,
    ]);
    expect(fixed.matrixAutoUpdate).toBe(false);
    // Released, a moved bone draws where it now is.
    hips.position.y = 0.6;
    scene.updateMatrixWorld();
    const world = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    const expected = hand.getWorldPosition(new THREE.Vector3());
    expect(world.distanceTo(expected)).toBeLessThan(1e-9);
    expect(world.y).toBeCloseTo(0.8);
  });

  it('leaves a self-placed prop live under a held body, drawn where it puts itself', () => {
    const { scene, root, hips } = person();
    const pager = new THREE.Group();
    const led = new THREE.Mesh();
    pager.userData[SELF_PLACED] = true;
    pager.add(led);
    root.add(pager);
    scene.updateMatrixWorld();
    const motion = motionState();
    holdPose(motion, root);
    expect(hips.matrixAutoUpdate).toBe(false);
    expect([pager.matrixAutoUpdate, led.matrixAutoUpdate]).toEqual([true, true]);
    pager.position.set(0.17, 0.98, 0.02); // the pager's own frame write
    scene.updateMatrixWorld();
    const drawn = new THREE.Vector3().setFromMatrixPosition(led.matrixWorld);
    const exact = led.getWorldPosition(new THREE.Vector3());
    expect(drawn.distanceTo(exact)).toBeLessThan(1e-9);
    expect(drawn.y).toBeCloseTo(0.98);
  });

  it('stops the scene-wide force above a held body, and forces again if the container moves', () => {
    const scene = new THREE.Scene();
    const personnel = new THREE.Group();
    const { root, hips, hand } = person();
    scene.add(personnel);
    personnel.add(root);
    const pager = new THREE.Group();
    pager.userData[SELF_PLACED] = true;
    root.add(pager);
    const unshield = shieldHeldChildren(personnel);
    scene.updateMatrixWorld();
    const drawn = hand.matrixWorld.clone();
    const motion = motionState();
    holdPose(motion, root);
    // Without the shield, the scene's own recompose would force a multiply here.
    const multiplied = vi.spyOn(hand.matrixWorld, 'multiplyMatrices');
    scene.updateMatrixWorld();
    expect(multiplied).not.toHaveBeenCalled();
    expect(hand.matrixWorld.equals(drawn)).toBe(true);
    // A self-placed prop under the held body still draws where it puts itself.
    pager.position.set(0.17, 0.98, 0.02);
    scene.updateMatrixWorld();
    expect(new THREE.Vector3().setFromMatrixPosition(pager.matrixWorld).y).toBeCloseTo(0.98);
    // The container moving forces every held matrix, as three would.
    personnel.position.x = 2;
    scene.updateMatrixWorld();
    expect(multiplied).toHaveBeenCalled();
    const world = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    expect(world.x).toBeCloseTo(new THREE.Vector3().setFromMatrixPosition(drawn).x + 2);
    // An unheld body updates normally under the shield.
    releaseHeldPose(motion);
    hips.position.y = 0.5;
    scene.updateMatrixWorld();
    const exact = hand.getWorldPosition(new THREE.Vector3());
    expect(
      new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld).distanceTo(exact)
    ).toBeLessThan(1e-9);
    unshield();
    expect(Object.prototype.hasOwnProperty.call(personnel, 'updateMatrixWorld')).toBe(false);
  });

  it('holds once, and a second release is harmless', () => {
    const { root, hand } = person();
    const motion = motionState();
    holdPose(motion, root);
    holdPose(motion, root);
    releaseHeldPose(motion);
    expect(hand.matrixAutoUpdate).toBe(true);
    releaseHeldPose(motion);
    expect(hand.matrixAutoUpdate).toBe(true);
  });
});
