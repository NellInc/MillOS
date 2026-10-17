import * as THREE from 'three';

/** Model metres, fitted to the delivered hen's 9.5cm leg chain. */
export const CHICKEN_WALK = { cycle: 0.09, speed: 0.24, lift: 0.021, settle: 0.008 } as const;
const STANCE = 0.6;
export interface ChickenStep {
  forward: number;
  lift: number;
}

/** One full cycle consumes exactly cycle metres; the other foot is half a cycle apart. */
export function sampleChickenStep(phase: number, leg: number, out: ChickenStep): ChickenStep {
  const p = ((((Number.isFinite(phase) ? phase : 0) / (Math.PI * 2) + leg * 0.5) % 1) + 1) % 1;
  const half = (CHICKEN_WALK.cycle * STANCE) / 2;
  out.forward = half - CHICKEN_WALK.cycle * p;
  out.lift = 0;
  if (p > STANCE) {
    const u = (p - STANCE) / (1 - STANCE);
    out.forward =
      -half +
      2 * half * u * u * (3 - 2 * u) -
      CHICKEN_WALK.cycle * (1 - STANCE) * u * (1 - u) * (1 - 2 * u);
    out.lift = CHICKEN_WALK.lift * Math.sin(Math.PI * u) ** 2;
  }
  return out;
}

/**
 * Use the hen's real skeleton. Its soles belong to Foot, ToeBase AND the
 * parallel CalfTwist02 heel owner. Keep that heel level with the foot, while
 * the two anatomical segments retain their lengths and original bend side.
 * No borrowed geometry, weights, inverse matrices or materials are modified.
 * Working if actual skinned soles translate rigidly, neutral is exact, and
 * wings/head retain their independent pose channels under a turned farm.
 */
export function createChickenWalk(model: THREE.Group) {
  const mesh = model.getObjectByName('ChickenBody') as THREE.SkinnedMesh | undefined;
  if (!mesh?.isSkinnedMesh) return null;
  model.updateWorldMatrix(true, true);
  const inverse = model.matrixWorld.clone().invert();
  const rootQ = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const restPosition = model.position.clone();
  const legs = ['L', 'R'].map((side) => {
    const bones = ['Thigh', 'Calf', 'Foot', 'CalfTwist02'].map((name) =>
      model.getObjectByName(`${side}_${name}`)
    );
    if (bones.some((bone) => !(bone as THREE.Bone)?.isBone)) return null;
    const saved = bones.map((bone) => ({
      bone: bone!,
      position: bone!.position.clone(),
      quaternion: bone!.quaternion.clone(),
      point: bone!.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse),
      rotation: bone!.getWorldQuaternion(new THREE.Quaternion()).premultiply(rootQ),
    }));
    const [hip, knee, ankle] = saved.map((s) => s.point);
    const upper = new THREE.Vector3().subVectors(knee, hip);
    const lower = new THREE.Vector3().subVectors(ankle, knee);
    const axis = new THREE.Vector3().subVectors(ankle, hip).normalize();
    const pole = upper.clone().addScaledVector(axis, -upper.dot(axis)).normalize();
    return { saved, hip, ankle, upper, lower, pole, a: upper.length(), b: lower.length() };
  });
  if (legs.some((leg) => !leg || leg.a < 0.03 || leg.b < 0.02 || leg.a + leg.b > 0.13)) return null;
  const target = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    pole = new THREE.Vector3(),
    knee = new THREE.Vector3(),
    segment = new THREE.Vector3(),
    world = new THREE.Vector3(),
    parentQ = new THREE.Quaternion(),
    modelQ = new THREE.Quaternion(),
    desiredQ = new THREE.Quaternion(),
    step: ChickenStep = { forward: 0, lift: 0 };
  const orient = (bone: THREE.Object3D, rotation: THREE.Quaternion) => {
    bone.parent!.getWorldQuaternion(parentQ).invert();
    bone.quaternion.copy(parentQ).multiply(modelQ).multiply(rotation);
    bone.updateWorldMatrix(false, true);
  };
  return {
    apply(phase: number, amount: number) {
      const blend = THREE.MathUtils.clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
      model.position.copy(restPosition);
      for (const leg of legs)
        for (const rest of leg!.saved) {
          rest.bone.position.copy(rest.position);
          rest.bone.quaternion.copy(rest.quaternion);
        }
      if (blend === 0) return;
      const drop = CHICKEN_WALK.settle * blend;
      model.position.y -= drop;
      model.updateWorldMatrix(true, true);
      model.getWorldQuaternion(modelQ);
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i]!;
        const { saved, hip, ankle, upper, lower, a, b } = leg;
        sampleChickenStep(phase, i, step);
        target.copy(ankle);
        target.y += drop + step.lift * blend;
        target.z += step.forward * blend;
        direction.subVectors(target, hip);
        const distance = THREE.MathUtils.clamp(
          direction.length(),
          Math.abs(a - b) + 1e-6,
          a + b - 1e-6
        );
        direction.normalize();
        pole.copy(leg.pole).addScaledVector(direction, -leg.pole.dot(direction)).normalize();
        const along = (a * a - b * b + distance * distance) / (2 * distance);
        knee
          .copy(hip)
          .addScaledVector(direction, along)
          .addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
        target.copy(hip).addScaledVector(direction, distance);
        segment.subVectors(knee, hip).normalize();
        desiredQ
          .setFromUnitVectors(world.copy(upper).normalize(), segment)
          .multiply(saved[0].rotation);
        orient(saved[0].bone, desiredQ);
        segment.subVectors(target, knee).normalize();
        desiredQ
          .setFromUnitVectors(world.copy(lower).normalize(), segment)
          .multiply(saved[1].rotation);
        orient(saved[1].bone, desiredQ);
        orient(saved[2].bone, saved[2].rotation);
        // Parallel heel skin shares the exact foot displacement, rather than
        // tilting the rear toes with the shin. This also preserves UV seams.
        world.copy(saved[3].point).add(target).sub(ankle).applyMatrix4(model.matrixWorld);
        saved[3].bone.parent!.worldToLocal(world);
        saved[3].bone.position.copy(world);
        orient(saved[3].bone, saved[3].rotation);
      }
    },
    dispose() {
      // Only transforms are owned; geometry/maps/skeleton remain with the rig.
      model.position.copy(restPosition);
      for (const leg of legs)
        for (const rest of leg!.saved) {
          rest.bone.position.copy(rest.position);
          rest.bone.quaternion.copy(rest.quaternion);
        }
    },
  };
}
