import * as THREE from 'three';
import type { WorkerBodyType, WorkerWorkAction } from './workerTypes';
import { WORKER_EYE_CENTRES } from './SharedWorkerGeometries';

/** Seat top and pelvis joint are different anchors: the fleshy underside is 9 cm below the joint. */
export const WORKER_SEAT_HEIGHT = 0.46;
export const WORKER_SEAT_PELVIS_OFFSET = 0.09;
/** Tread top .0245 m plus the measured .022-.027 m ankle-to-sole depth. */
export const BICYCLE_FOOT_TARGET_CLEARANCE = 0.052;

const WORKER_BLINK_STARTS = [1.7, 6.4, 12.8, 13.13] as const;

/** Brief asymmetric closure, long open-eye dwells, and an occasional double blink.
 * Working if independently phased people close both real eye surfaces and pupils.
 */
export function sampleWorkerBlink(seconds: number): number {
  const t = Number.isFinite(seconds) ? ((seconds % 17.3) + 17.3) % 17.3 : 0;
  for (const start of WORKER_BLINK_STARTS) {
    const elapsed = t - start;
    if (elapsed >= 0 && elapsed < 0.18)
      return (
        THREE.MathUtils.smoothstep(elapsed, 0, 0.045) *
        (1 - THREE.MathUtils.smoothstep(elapsed, 0.07, 0.18))
      );
  }
  return 0;
}

/** The authored eyes are dark inset surfaces, with no separate white sclera.
 * Close those vertices in Head rest space, together with the pupil fittings.
 * No morph shader or added draw: 48 private vertices update only while blinking.
 * Working if a blink narrows the entire eye and cached/other people's eyes stay intact.
 */
export function createWorkerEyeBlink(model: THREE.Object3D, bodyType: WorkerBodyType) {
  // This method refreshes SkinnedMesh.bindMatrixInverse; updateWorldMatrix
  // only refreshes transforms and can lift closing eyes 13 cm on a fresh clone.
  model.updateMatrixWorld(true);
  const head = model.getObjectByName('Head');
  const entries: Array<{
    mesh: THREE.Mesh;
    source: THREE.BufferGeometry;
    geometry: THREE.BufferGeometry;
    open: Float32Array;
    closed: Float32Array;
  }> = [];
  if (head) {
    const intoHead = new THREE.Matrix4();
    const fromHead = new THREE.Matrix4();
    const point = new THREE.Vector3();
    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (
        !mesh.isMesh ||
        !mesh.parent?.name.includes('Worker_Head') ||
        Array.isArray(mesh.material) ||
        ![
          bodyType === 'masculine' ? 'Eye' : 'Brown',
          `${bodyType === 'masculine' ? 'Eye' : 'Brown'}-${bodyType}`,
        ].includes(mesh.material.name)
      )
        return;
      const source = mesh.geometry;
      const geometry = source.clone();
      const position = geometry.getAttribute('position');
      const open = new Float32Array(position.count * 3);
      const closed = new Float32Array(position.count * 3);
      intoHead.copy(head.matrixWorld).invert().multiply(mesh.matrixWorld);
      const skin = mesh as THREE.SkinnedMesh;
      if (skin.isSkinnedMesh) {
        const joint = skin.skeleton.bones.indexOf(head as THREE.Bone);
        if (joint < 0) {
          geometry.dispose();
          return;
        }
        // Normalised exports retain nonidentity bind matrices. Include the
        // actual Head skin transform, not just the mesh's object transform.
        // Both authored eyes are entirely Head-weighted; unfamiliar weights
        // retain their open shape rather than guessing a deformation.
        const indices = source.getAttribute('skinIndex');
        const weights = source.getAttribute('skinWeight');
        for (let vertex = 0; vertex < position.count; vertex++) {
          for (let component = 0; component < 4; component++) {
            if (
              weights.getComponent(vertex, component) > 0.0001 &&
              indices.getComponent(vertex, component) !== joint
            ) {
              geometry.dispose();
              return;
            }
          }
        }
        intoHead
          .multiply(skin.bindMatrixInverse)
          .multiply(head.matrixWorld)
          .multiply(skin.skeleton.boneInverses[joint])
          .multiply(skin.bindMatrix);
      }
      fromHead.copy(intoHead).invert();
      for (let index = 0; index < position.count; index++) {
        point.fromBufferAttribute(position, index).toArray(open, index * 3);
        point.applyMatrix4(intoHead);
        const centre = WORKER_EYE_CENTRES[bodyType][1];
        point.y = centre + (point.y - centre) * 0.08;
        point.applyMatrix4(fromHead).toArray(closed, index * 3);
      }
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(open.slice(), 3).setUsage(THREE.DynamicDrawUsage)
      );
      mesh.geometry = geometry;
      mesh.userData.workerBlink = true;
      entries.push({ mesh, source, geometry, open, closed });
    });
  }
  let previous = 0;
  return {
    apply(amount: number) {
      const closure = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
      if (closure === previous) return;
      previous = closure;
      for (const { geometry, open, closed } of entries) {
        const position = geometry.getAttribute('position') as THREE.BufferAttribute;
        const array = position.array;
        for (let index = 0; index < open.length; index++)
          array[index] =
            closure === 0 ? open[index] : open[index] + (closed[index] - open[index]) * closure;
        position.needsUpdate = true;
      }
    },
    dispose() {
      for (const { mesh, source, geometry } of entries) {
        if (mesh.geometry === geometry) mesh.geometry = source;
        geometry.dispose();
      }
    },
  };
}

/** Shared metre-space targets keep hands and held props on the same motion. */
export const createWorkerGesture = () => ({
  toolY: 0,
  toolZ: 0,
  lookYaw: 0,
  lookPitch: 0,
  restReach: 0,
  workStroke: 0,
  workCheck: 0,
  breath: 0,
  greetingLift: 0,
  greetingWave: 0,
  idleSettle: 0,
});
export type WorkerGesture = ReturnType<typeof createWorkerGesture>;

/** One hello per arrival, with a quiet hand-down dwell while the neighbour stays.
 * Working if the wave ends after 2.1 seconds and never repeats on its own clock.
 */
export function sampleWorkerGreeting(seconds: number, out: WorkerGesture) {
  const t = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  out.greetingLift =
    THREE.MathUtils.smoothstep(t, 0, 0.45) * (1 - THREE.MathUtils.smoothstep(t, 1.65, 2.1));
  out.greetingWave = Math.sin(t * 8) * 0.18 * out.greetingLift;
  return out;
}

/** Bounded, staggered gestures, with no world-clock or per-frame allocations.
 * Working if tools follow the same sampled offset as palms and feet stay planted.
 */
export function sampleWorkerGesture(
  kind: WorkerWorkAction | 'rest' | 'idle' | 'greet',
  seconds: number,
  out: WorkerGesture
) {
  const t = Number.isFinite(seconds) ? seconds : 0;
  const tempo = t + Math.sin(t * 0.41) * 0.18;
  const cycle = 0.5 - 0.5 * Math.cos((tempo * Math.PI * 2) / (kind === 'garden' ? 3.6 : 6.4));
  out.breath = Math.sin(t * 1.45) * 0.5 + 0.5;
  out.greetingLift = 0;
  out.greetingWave = 0;
  if (kind === 'greet') sampleWorkerGreeting(t, out);
  // Two small changes of standing posture, each with a held position and quiet
  // dwell. Work and seated poses keep their own incoming posture.
  // Working if waiting people gently settle, with stationary boots and no accumulated lean.
  const idleTime = ((t % 19.7) + 19.7) % 19.7;
  const settleLeft =
    THREE.MathUtils.smoothstep(idleTime, 1.4, 3.1) *
    (1 - THREE.MathUtils.smoothstep(idleTime, 5.5, 7.2));
  const settleRight =
    THREE.MathUtils.smoothstep(idleTime, 10.5, 12.2) *
    (1 - THREE.MathUtils.smoothstep(idleTime, 14.3, 15.7));
  out.idleSettle =
    kind === 'idle' || kind === 'greet' ? 0.018 * (settleLeft - settleRight * 0.65) : 0;
  // Three small gardening strokes, then hands/tool settle together for a dwell.
  const gardenTime = ((t % 11.5) + 11.5) % 11.5;
  const gardenWork =
    THREE.MathUtils.smoothstep(gardenTime, 0, 0.45) *
    (1 - THREE.MathUtils.smoothstep(gardenTime, 7.2, 8.1));
  const settle = kind === 'bake' ? out.breath * 0.006 : 0;
  out.toolY = kind === 'garden' ? cycle * gardenWork * 0.08 : settle;
  out.toolZ = kind === 'garden' ? -cycle * gardenWork * 0.035 : settle * 0.35;
  // A glance has a quiet dwell and a smooth return, rather than continuous
  // clockwork nodding. The shared time already carries each person's phase.
  // Working if head gestures pause and seated/tool contact stays unchanged.
  const glanceTime = ((t % 16.9) + 16.9) % 16.9;
  const left =
    THREE.MathUtils.smoothstep(glanceTime, 1.1, 1.9) *
    (1 - THREE.MathUtils.smoothstep(glanceTime, 3.2, 4.15));
  const right =
    THREE.MathUtils.smoothstep(glanceTime, 8.8, 9.6) *
    (1 - THREE.MathUtils.smoothstep(glanceTime, 11.4, 12.5));
  const glance = left + right;
  out.lookYaw = (left - right * 0.82) * (kind === 'garden' ? 0.05 : 0.22);
  out.lookPitch = (left * 0.7 - right) * (kind === 'garden' ? 0.07 : 0.035);
  // Work attention has its own direction; walking/rest use the unmodified glance.
  // Working if inspectors read their held work, gardeners look into the bed,
  // and radio users remain forward-facing without changing hand/boot targets.
  const attentionPitch =
    kind === 'inspect' || kind === 'sample'
      ? 0.16
      : kind === 'repair'
        ? 0.12
        : kind === 'garden'
          ? 0.12 * gardenWork
          : kind === 'bake'
            ? 0.1
            : kind === 'operate' || kind === 'supervise'
              ? 0.06
              : 0;
  if (attentionPitch > 0) {
    out.lookYaw *= 0.35;
    out.lookPitch = attentionPitch * (1 - glance * 0.45) + out.lookPitch * 0.4;
  }
  if (kind === 'radio') {
    out.lookYaw *= 0.3;
    out.lookPitch *= 0.4;
  }
  out.restReach = kind === 'rest' ? Math.sin(t * 0.87) * glance * 0.12 : 0;
  // A small repeated stroke within a slower attention cycle leaves natural pauses.
  const workTime = ((t % 9.8) + 9.8) % 9.8;
  const attention =
    THREE.MathUtils.smoothstep(workTime, 0.3, 0.9) *
    (1 - THREE.MathUtils.smoothstep(workTime, 5.2, 6));
  // Roles share the established quiet dwell, with different measured rhythms.
  // Working if reading/supervision stay restrained and sampling never looks like wrench turning.
  const strokeRate =
    kind === 'repair'
      ? 2.3
      : kind === 'sample'
        ? 1.65
        : kind === 'inspect'
          ? 1.1
          : kind === 'supervise'
            ? 0.9
            : 2;
  const strokeRange =
    kind === 'inspect' ? 0.45 : kind === 'supervise' ? 0.4 : kind === 'operate' ? 0.7 : 1;
  const checkRate =
    kind === 'sample' ? 0.75 : kind === 'supervise' ? 0.65 : kind === 'repair' ? 0.9 : 1.15;
  out.workStroke = Math.sin(t * strokeRate) * attention * strokeRange;
  out.workCheck = Math.sin(t * checkRate) * attention;
  return out;
}

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

  function look(gesture?: WorkerGesture, strength = 1) {
    const head = bones.get('Head');
    if (!head || !gesture) return;
    head.rotateY(gesture.lookYaw * strength);
    head.rotateX(gesture.lookPitch * strength);
  }

  function applyTask(task: 'push' | 'pull' | 'bake' | 'garden', gesture?: WorkerGesture) {
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
    const hipTarget = task === 'garden' ? 0.44 : p.y * scale;
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
          task === 'garden' ? 0.68 : 1,
          task === 'garden' ? 0.73 : task === 'pull' ? -0.05 : 0.15
        )
      );
    const head = bones.get('Head');
    if (head) aim(head, undefined, direction.set(0, 1, task === 'garden' ? 0.35 : 0));
    look(gesture);
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
        if (gesture && (task === 'bake' || (task === 'garden' && side === 'L'))) {
          target.y += gesture.toolY / scale;
          target.z += gesture.toolZ / widthScale;
        }
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
    applyWork(action: WorkerWorkAction, gesture: WorkerGesture) {
      capture();
      look(gesture);
      const abdomen = bones.get('Abdomen');
      if (abdomen) abdomen.scale.z *= 1 + gesture.breath * 0.009;
      const left = bones.get('LowerArmL');
      const right = bones.get('LowerArmR');
      const wrist = bones.get('WristL');
      // The tool is wrist-mounted, so the same joint drives hand and tool.
      // Working if hands move through a bounded cycle without displacing the feet.
      if (action === 'repair') {
        left?.rotateX(gesture.workStroke * 0.19);
        wrist?.rotateY(gesture.workStroke * 0.14);
      } else if (action === 'sample') {
        left?.rotateX(gesture.workCheck * 0.1);
        wrist?.rotateZ(gesture.workStroke * 0.12);
        right?.rotateX(-gesture.workStroke * 0.08);
      } else if (action === 'operate' || action === 'inspect') {
        left?.rotateX(gesture.workCheck * 0.08);
        right?.rotateX(gesture.workStroke * 0.16);
      } else if (action === 'supervise') {
        left?.rotateX(gesture.workCheck * 0.07);
        right?.rotateZ(gesture.workStroke * 0.12);
      }
      // Radio already has an authored speaking gesture; only add the head glance.
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    applyWalkingLook(gesture: WorkerGesture) {
      capture();
      // A small occasional look complements the walking clip. No torso/limb
      // edits: working if both real rigs retain exact gait/boot transforms and
      // restore the incoming mixer pose without rotational accumulation.
      look(gesture, 0.35);
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    applyIdle(gesture: WorkerGesture) {
      capture();
      look(gesture);
      const abdomen = bones.get('Abdomen');
      if (abdomen) {
        abdomen.rotateZ(gesture.lookPitch * 0.25 + gesture.idleSettle);
        abdomen.userData.workerIdleSettle = gesture.idleSettle;
        abdomen.scale.z *= 1 + gesture.breath * 0.012;
      }
      const upper = bones.get('UpperArmR'),
        lower = bones.get('LowerArmR'),
        wrist = bones.get('WristR');
      if (gesture.greetingLift > 0 && upper && lower && wrist) {
        chainLengths(upper, lower, wrist, lengths.armR);
        modelPosition(upper, p);
        target.set(p.x - 0.15 / widthScale, p.y + 0.12 / scale, p.z + 0.12 / widthScale);
        modelPosition(wrist, q);
        target.lerpVectors(q, target, gesture.greetingLift);
        solveChain(upper, lower, wrist, target, lengths.armR, pole.set(-1, -0.2, 0), false);
        aim(wrist, undefined, direction.set(0, 1, 0));
        wrist.rotateZ(gesture.greetingWave);
      }
      applied = true;
      model.updateWorldMatrix(false, true);
    },
    restore() {
      if (!applied) return;
      const abdomen = bones.get('Abdomen');
      if (abdomen) abdomen.userData.workerIdleSettle = 0;
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
    apply(floorOffset = 0, gesture?: WorkerGesture) {
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
          aim(
            lower,
            undefined,
            direction.set(0, -0.3 + (side === 'L' ? (gesture?.restReach ?? 0) : 0), 1)
          );
        }
      }
      look(gesture);
      applied = true;
      model.updateWorldMatrix(false, true);
    },
  };
}
