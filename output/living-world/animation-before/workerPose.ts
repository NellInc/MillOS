import * as THREE from 'three';

/** Seat top and pelvis joint are different anchors: the fleshy underside is 9 cm below the joint. */
export const WORKER_SEAT_HEIGHT = 0.46;
export const WORKER_SEAT_PELVIS_OFFSET = 0.09;
/** Tread top .0245 m plus the measured .022-.027 m ankle-to-sole depth. */
export const BICYCLE_FOOT_TARGET_CLEARANCE = 0.052;

/**
 * The Quaternius rig has independent root-mounted foot targets. Rotating only
 * the thighs leaves the boots on the standing mark. Pose both chains and feet,
 * in model coordinates, so a parent rotation still makes the person face +Z.
 * All temporary vectors are per instance and reused; shared geometry is untouched.
 */
export function createSeatedWorkerPose(model: THREE.Object3D, heightScale = 1, bodyScale = 1) {
  const names = [
    'Body',
    'Hips',
    'Abdomen',
    'Head',
    'WristL',
    'WristR',
    'UpperLegL',
    'LowerLegL',
    'FootL',
    'UpperLegR',
    'LowerLegR',
    'FootR',
    'UpperArmL',
    'LowerArmL',
    'UpperArmR',
    'LowerArmR',
  ];
  const bones = new Map(names.map((name) => [name, model.getObjectByName(name)]));
  const saved = [...bones.values()]
    .filter((bone): bone is THREE.Object3D => !!bone)
    .map((bone) => ({
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    }));
  let applied = false;
  const inverse = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const parentInverse = new THREE.Matrix4();
  const deltaRotation = new THREE.Quaternion();
  const scale = Number.isFinite(heightScale) && heightScale > 0 ? heightScale : 1;
  const widthScale = Number.isFinite(bodyScale) && bodyScale > 0 ? bodyScale : 1;
  const pelvisHeight = (WORKER_SEAT_HEIGHT + WORKER_SEAT_PELVIS_OFFSET) / scale;
  const kneeHeight = 0.46 / scale;

  function modelPosition(bone: THREE.Object3D, target: THREE.Vector3) {
    return bone.getWorldPosition(target).applyMatrix4(inverse);
  }
  function setPosition(bone: THREE.Object3D, point: THREE.Vector3) {
    point.applyMatrix4(model.matrixWorld);
    if (bone.parent) bone.parent.worldToLocal(point);
    bone.position.copy(point);
    bone.updateWorldMatrix(false, true);
  }
  function aim(bone: THREE.Object3D, child: THREE.Object3D | undefined, direction: THREE.Vector3) {
    // Solve in the bone parent's coordinates, preserving nonuniform person scale.
    if (child)
      from.copy(child.position).multiply(bone.scale).applyQuaternion(bone.quaternion).normalize();
    else from.set(0, 1, 0).applyQuaternion(bone.quaternion).normalize();
    to.copy(direction).transformDirection(model.matrixWorld);
    if (bone.parent) {
      parentInverse.copy(bone.parent.matrixWorld).invert();
      to.transformDirection(parentInverse);
    }
    deltaRotation.setFromUnitVectors(from, to);
    bone.quaternion.premultiply(deltaRotation);
    bone.updateWorldMatrix(false, true);
  }
  const direction = new THREE.Vector3();
  const sides = ['L', 'R'];
  const shinLengths = [0.43, 0.43];
  const upperPoint = new THREE.Vector3();
  const endPoint = new THREE.Vector3();
  const kneePoint = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const bend = new THREE.Vector3();
  const target = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const feet = [new THREE.Vector3(), new THREE.Vector3()];
  const palmLengths = [0.09, 0.09];
  const lengths = { legL: [0, 0], legR: [0, 0], armL: [0, 0], armR: [0, 0] };

  function capture() {
    for (const entry of saved) {
      entry.position.copy(entry.bone.position);
      entry.quaternion.copy(entry.bone.quaternion);
      entry.scale.copy(entry.bone.scale);
    }
    model.updateWorldMatrix(true, true);
    inverse.copy(model.matrixWorld).invert();
  }
  function chainLengths(
    upper: THREE.Object3D,
    lower: THREE.Object3D,
    end: THREE.Object3D,
    into: number[]
  ) {
    modelPosition(upper, p);
    modelPosition(lower, q);
    modelPosition(end, from);
    into[0] = p.distanceTo(q);
    into[1] = q.distanceTo(from);
  }
  function solveChain(
    upper: THREE.Object3D,
    lower: THREE.Object3D,
    end: THREE.Object3D,
    endpoint: THREE.Vector3,
    lengths: number[],
    poleDirection: THREE.Vector3,
    independentFoot: boolean
  ) {
    modelPosition(upper, upperPoint);
    axis.copy(endpoint).sub(upperPoint);
    const distance = Math.max(axis.length(), 0.0001);
    axis.divideScalar(distance);
    const upperLength = lengths[0];
    const lowerLength = Math.max(lengths[1], distance - upperLength + 0.004);
    const along = THREE.MathUtils.clamp(
      (upperLength * upperLength + distance * distance - lowerLength * lowerLength) /
        (2 * distance),
      -upperLength,
      upperLength
    );
    const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
    bend.copy(poleDirection).addScaledVector(axis, -poleDirection.dot(axis)).normalize();
    kneePoint.copy(upperPoint).addScaledVector(axis, along).addScaledVector(bend, height);
    aim(upper, lower, direction.copy(kneePoint).sub(upperPoint));
    modelPosition(lower, endPoint);
    aim(lower, independentFoot ? undefined : end, direction.copy(endpoint).sub(endPoint));
    lower.scale.y *= lowerLength / Math.max(lengths[1], 0.0001);
    lower.updateWorldMatrix(false, true);
    if (independentFoot) setPosition(end, p.copy(endpoint));
  }

  function applyTask(task: 'push' | 'pull' | 'bake' | 'garden') {
    capture();
    const body = bones.get('Body'),
      hips = bones.get('Hips'),
      abdomen = bones.get('Abdomen');
    if (!body || !hips) return;
    for (let index = 0; index < sides.length; index++) {
      const side = sides[index];
      const thigh = bones.get(`UpperLeg${side}`),
        calf = bones.get(`LowerLeg${side}`),
        foot = bones.get(`Foot${side}`);
      const upper = bones.get(`UpperArm${side}`),
        lower = bones.get(`LowerArm${side}`),
        wrist = bones.get(`Wrist${side}`);
      if (thigh && calf && foot) {
        chainLengths(thigh, calf, foot, lengths[side === 'L' ? 'legL' : 'legR']);
        modelPosition(foot, feet[index]);
      }
      if (upper && lower && wrist) {
        chainLengths(upper, lower, wrist, lengths[side === 'L' ? 'armL' : 'armR']);
        const m1 = model.getObjectByName(`Middle1${side}`),
          m2 = model.getObjectByName(`Middle2${side}`);
        if (m1 && m2) {
          modelPosition(m1, p);
          modelPosition(m2, q);
          p.lerp(q, 0.5);
          palmLengths[index] = p.distanceTo(modelPosition(wrist, q));
        }
      }
    }
    modelPosition(hips, p);
    // Keep the natural standing pelvis for carry/push poses; props meet the
    // hands, rather than forcing every task into a permanent squat.
    const hipTarget = task === 'garden' ? 0.38 : p.y * scale;
    const lift = hipTarget / scale - p.y;
    modelPosition(body, p);
    p.y += lift;
    setPosition(body, p);
    if (abdomen)
      aim(
        hips,
        abdomen,
        direction.set(
          0,
          task === 'garden' ? 0.38 : 1,
          task === 'garden' ? 0.92 : task === 'pull' ? -0.05 : 0.15
        )
      );
    const head = bones.get('Head');
    if (head) aim(head, undefined, direction.set(0, 1, task === 'garden' ? 0.35 : 0));
    for (let index = 0; index < sides.length; index++) {
      const side = sides[index],
        sign = side === 'L' ? 1 : -1;
      const thigh = bones.get(`UpperLeg${side}`),
        calf = bones.get(`LowerLeg${side}`),
        foot = bones.get(`Foot${side}`);
      if (thigh && calf && foot) {
        target.copy(feet[index]);
        if (task === 'garden')
          target.set((sign * 0.15) / widthScale, 0.028 / scale, -0.1 / widthScale);
        solveChain(
          thigh,
          calf,
          foot,
          target,
          lengths[side === 'L' ? 'legL' : 'legR'],
          pole.set(0, 0, 1),
          true
        );
      }
      const upper = bones.get(`UpperArm${side}`),
        lower = bones.get(`LowerArm${side}`),
        wrist = bones.get(`Wrist${side}`);
      if (upper && lower && wrist) {
        if (task === 'garden')
          target.set(
            (side === 'L' ? 0.12 : -0.12) / widthScale,
            (side === 'L' ? 0.326 : 0.4) / scale,
            (side === 'L' ? 0.5205 : 0.26) / widthScale
          );
        else if (task === 'bake')
          target.set((sign * 0.18) / widthScale, 1.1 / scale, 0.28 / widthScale);
        else
          target.set(
            (sign * 0.32) / widthScale,
            1.05 / scale,
            (task === 'push' ? 0.2 : -0.2) / widthScale
          );
        // Grip denotes the centre of the palm, not the wrist joint above it.
        target.y += palmLengths[index];
        solveChain(
          upper,
          lower,
          wrist,
          target,
          lengths[side === 'L' ? 'armL' : 'armR'],
          pole.set(sign, -0.2, 0),
          false
        );
        aim(wrist, undefined, direction.set(0, -1, 0));
      }
    }
    applied = true;
    model.updateWorldMatrix(false, true);
  }

  return {
    applyTask,
    restore() {
      if (!applied) return;
      for (const entry of saved) {
        entry.bone.position.copy(entry.position);
        entry.bone.quaternion.copy(entry.quaternion);
        entry.bone.scale.copy(entry.scale);
      }
      applied = false;
    },
    /** Bicycle coordinates are metres in the unscaled actor root, facing +Z. */
    applyCycling(phase: number) {
      capture();
      const body = bones.get('Body');
      const hips = bones.get('Hips');
      const abdomen = bones.get('Abdomen');
      if (!body || !hips) return;
      for (const side of sides) {
        const thigh = bones.get(`UpperLeg${side}`);
        const calf = bones.get(`LowerLeg${side}`);
        const foot = bones.get(`Foot${side}`);
        const upper = bones.get(`UpperArm${side}`);
        const lower = bones.get(`LowerArm${side}`);
        const wrist = bones.get(`Wrist${side}`);
        if (thigh && calf && foot)
          chainLengths(thigh, calf, foot, lengths[side === 'L' ? 'legL' : 'legR']);
        if (upper && lower && wrist)
          chainLengths(upper, lower, wrist, lengths[side === 'L' ? 'armL' : 'armR']);
      }
      modelPosition(hips, p);
      const lift = 0.95 / scale - p.y;
      const shift = -0.1 / widthScale - p.z;
      modelPosition(body, p);
      p.y += lift;
      p.z += shift;
      setPosition(body, p);
      // Lean from the waist so the short authored arms can reach a city-bike bar.
      if (abdomen) aim(hips, abdomen, direction.set(0, 0.65, 0.76));
      const head = bones.get('Head');
      if (head) aim(head, undefined, direction.set(0, 1, 0));
      const safePhase = Number.isFinite(phase) ? phase : 0;
      for (const side of sides) {
        const sign = side === 'L' ? 1 : -1;
        const thigh = bones.get(`UpperLeg${side}`);
        const calf = bones.get(`LowerLeg${side}`);
        const foot = bones.get(`Foot${side}`);
        if (thigh && calf && foot) {
          target.set(
            (sign * 0.16) / widthScale,
            (0.36 + BICYCLE_FOOT_TARGET_CLEARANCE + sign * 0.15 * Math.cos(safePhase)) / scale,
            (0.04 + sign * 0.15 * Math.sin(safePhase)) / widthScale
          );
          solveChain(
            thigh,
            calf,
            foot,
            target,
            lengths[side === 'L' ? 'legL' : 'legR'],
            pole.set(0, 0, 1),
            true
          );
        }
        const upper = bones.get(`UpperArm${side}`);
        const lower = bones.get(`LowerArm${side}`);
        const wrist = bones.get(`Wrist${side}`);
        if (upper && lower && wrist) {
          target.set((sign * 0.23) / widthScale, 1.08 / scale, 0.57 / widthScale);
          solveChain(
            upper,
            lower,
            wrist,
            target,
            lengths[side === 'L' ? 'armL' : 'armR'],
            pole.set(sign * 0.6, -0.4, 0),
            false
          );
        }
      }
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    apply(floorOffset = 0) {
      const footHeight =
        (0.03 + Math.max(0, Number.isFinite(floorOffset) ? floorOffset : 0)) / scale;
      capture();
      const body = bones.get('Body');
      const hips = bones.get('Hips');
      if (!body || !hips) return;
      modelPosition(hips, p);
      for (let i = 0; i < sides.length; i++) {
        const calf = bones.get(`LowerLeg${sides[i]}`);
        const foot = bones.get(`Foot${sides[i]}`);
        shinLengths[i] =
          calf && foot ? modelPosition(calf, from).distanceTo(modelPosition(foot, to)) : 0.43;
      }
      modelPosition(hips, p);
      const lift = pelvisHeight - p.y;
      const centre = -p.z;
      modelPosition(body, p);
      p.y += lift;
      p.z += centre;
      setPosition(body, p);
      for (const side of sides) {
        const thigh = bones.get(`UpperLeg${side}`);
        const calf = bones.get(`LowerLeg${side}`);
        const foot = bones.get(`Foot${side}`);
        if (!thigh || !calf || !foot) continue;
        modelPosition(thigh, p);
        modelPosition(calf, q);
        const length = p.distanceTo(q);
        const drop = THREE.MathUtils.clamp(p.y - kneeHeight, 0, length * 0.8);
        aim(thigh, calf, direction.set(0, -drop, Math.sqrt(length * length - drop * drop)));
        aim(calf, undefined, direction.set(0, -1, 0));
        const shinLength = shinLengths[side === 'L' ? 0 : 1];
        calf.scale.y *= (kneeHeight - footHeight) / shinLength;
        calf.updateWorldMatrix(false, true);
        modelPosition(calf, p);
        p.y = footHeight;
        setPosition(foot, p);
      }
      // Forearms rest forward on the lap, rather than a neutral standing arm pose.
      for (const side of sides) {
        const upper = bones.get(`UpperArm${side}`);
        const lower = bones.get(`LowerArm${side}`);
        if (upper && lower) {
          aim(upper, lower, direction.set(side === 'L' ? 0.12 : -0.12, -1, 0.2));
          aim(lower, undefined, direction.set(0, -0.3, 1));
        }
      }
      applied = true;
      model.updateWorldMatrix(false, true);
    },
  };
}
