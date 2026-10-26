/**
 * Authored production-worker renderer for MillOS v0.40.
 *
 * The two CC0 Quaternius worker bodies arrive with complete industrial
 * workwear, compatible rigs, and a curated semantic animation set. Runtime
 * material variants carry identity and role cues. Declared gloves colour the
 * original skin vertices without altering the cached asset or animation rig.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { WORKER_ASSET_PATHS } from '../../constants/worldAssetUrls';
import type { WorkerAppearance, WorkerBodyType, WorkerWorkAction } from '../workers/workerTypes';
import { ToolAccessory, createWorkerHandheldMount } from '../workers/WorkerTools';
import {
  SHARED_WORKER_GEOMETRY,
  WORKER_EYE_CENTRES,
  WORKER_HEARING_FIT,
  WORKER_HAIR_GEOMETRIES,
  createWorkerHairMotion,
  createWorkerApronGeometry,
  createWorkerLabCoatGeometry,
  createWorkerShirtTrim,
} from '../workers/SharedWorkerGeometries';
import {
  SHARED_WORKER_ACCESSORY_MATERIALS,
  SHARED_WORKER_MATERIALS,
} from '../workers/SharedWorkerMaterials';
import { createWorkerBodyLod } from '../workers/workerBodyLod';
import { createWorkerFootwear } from '../workers/workerFootwear';
import { createWorkerCuffSockets } from '../workers/workerCuffSockets';
import { createWorkerGarmentMotion } from '../workers/workerGarmentMotion';
import { createWorkerHeadClosure, WORKER_HAIR_FIT } from '../workers/workerHeadClosure';
import type { WorkerMotionState } from '../workers/workerTypes';
import {
  createSeatedWorkerPose,
  validWorkerSeatCue,
  createWorkerHandPose,
  createWorkerGesture,
  easeWorkerGesture,
  createWorkerEyeBlink,
  createWorkerFaceExpression,
  sampleWorkerBlink,
  sampleWorkerGesture,
  sampleWorkerGreeting,
  createWorkerGaze,
  sampleWorkerGaze,
  type WorkerEyeSurface,
} from '../workers/workerPose';
export type { WorkerAppearance, WorkerMotionState } from '../workers/workerTypes';

/**
 * SkeletonUtils clones one Skeleton for each glTF primitive, even when they
 * use the same skin. Reuse compatible private copies within this one person.
 * Mesh bind matrices, materials and bones remain unchanged. Working if each
 * worker uploads one bone palette and independent people keep independent rigs.
 */
export function shareWorkerSkin(root: THREE.Object3D): THREE.Skeleton[] {
  const skins: THREE.Skeleton[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const skin = mesh.skeleton;
    const shared = skins.find(
      (candidate) =>
        candidate.bones.length === skin.bones.length &&
        candidate.boneInverses.length === skin.boneInverses.length &&
        candidate.bones.every((bone, i) => bone === skin.bones[i]) &&
        candidate.boneInverses.every((inverse, i) => inverse.equals(skin.boneInverses[i]))
    );
    if (shared) {
      mesh.skeleton = shared;
      if (shared !== skin) skin.dispose();
    } else skins.push(skin);
  });
  return skins;
}

/** Soften split face normals without welding the skinned topology. Skin-compatible
 * coincident vertices share a finish only across gentle (under 45 degree) edges.
 * Optional real arm joints receive a corner-angle weighted tube finish.
 * Working if faces/arms lose harsh shading seams while sharp ridges, hands and deformation stay exact.
 */
export function softenWorkerFaceNormals(
  source: THREE.BufferGeometry,
  armJoints: readonly number[] = []
) {
  const position = source.getAttribute('position'),
    normal = source.getAttribute('normal');
  if (!position || !normal) return null;
  const joints = source.getAttribute('skinIndex'),
    weights = source.getAttribute('skinWeight');
  const groups = new Map<string, number[]>();
  for (let i = 0; i < position.count; i++) {
    const key =
      [position.getX(i), position.getY(i), position.getZ(i)]
        .map((v) => Math.round(v * 100000))
        .join(',') +
      (joints && weights
        ? Array.from(
            { length: 4 },
            (_, c) => `${joints.getComponent(i, c)}:${weights.getComponent(i, c)}`
          ).join(',')
        : '');
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  }
  // A rounded arm needs its exported 45..65 degree tube edges to meet. Keep
  // that finish local to actual arm influences: hands, face and cloth retain
  // the existing crease profile. Triangle corner angles avoid weighting a
  // corner twice merely because its flat quad was triangulated differently.
  // Finger vertices carry up to0.222 incidental arm weight in these exports;
  // begin above0.25 so fingers/knuckles keep the original finish exactly.
  const cornerAngles = new Float32Array(position.count);
  if (armJoints.length && joints && weights) {
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
      edgeA = new THREE.Vector3(),
      edgeB = new THREE.Vector3(),
      cross = new THREE.Vector3(),
      count = source.index?.count ?? position.count;
    for (let triangle = 0; triangle + 2 < count; triangle += 3) {
      const ids = [0, 1, 2].map((c) => source.index?.getX(triangle + c) ?? triangle + c);
      ids.forEach((id, c) => points[c].fromBufferAttribute(position, id));
      for (let c = 0; c < 3; c++) {
        edgeA.subVectors(points[(c + 1) % 3], points[c]);
        edgeB.subVectors(points[(c + 2) % 3], points[c]);
        cross.crossVectors(edgeA, edgeB);
        if (edgeA.lengthSq() > 1e-16 && edgeB.lengthSq() > 1e-16)
          cornerAngles[ids[c]] += Math.atan2(cross.length(), edgeA.dot(edgeB));
      }
    }
  }
  const values = new Float32Array(normal.count * 3);
  const original = new THREE.Vector3(),
    candidate = new THREE.Vector3(),
    sum = new THREE.Vector3(),
    rounded = new THREE.Vector3();
  for (const group of groups.values())
    for (const i of group) {
      original.fromBufferAttribute(normal, i).normalize();
      sum.set(0, 0, 0);
      for (const j of group) {
        candidate.fromBufferAttribute(normal, j).normalize();
        if (original.dot(candidate) >= Math.SQRT1_2) sum.add(candidate);
      }
      sum.normalize();
      let armWeight = 0;
      if (armJoints.length && joints && weights)
        for (let c = 0; c < 4; c++)
          if (armJoints.includes(joints.getComponent(i, c)))
            armWeight += weights.getComponent(i, c);
      rounded.set(0, 0, 0);
      if (armWeight > 0.25)
        for (const j of group) {
          candidate.fromBufferAttribute(normal, j).normalize();
          if (original.dot(candidate) >= Math.cos((68 * Math.PI) / 180))
            rounded.addScaledVector(candidate, cornerAngles[j]);
        }
      original.lerp(sum, 0.65).normalize();
      if (rounded.lengthSq() > 1e-12)
        original
          .lerp(rounded.normalize(), THREE.MathUtils.smoothstep(armWeight, 0.25, 0.85))
          .normalize();
      original.toArray(values, i * 3);
    }
  const geometry = source.clone();
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

/**
 * Every worker clone of one body borrows the same skinned geometry, and its arm
 * joints come from the same bone names, so each softened the identical input
 * to the identical normals: ~1 s of main-thread startup across the crowd. The
 * first result is kept as a template (never handed out) per source geometry
 * and joint list, and each worker receives its own copy, which it owns and
 * disposes as before. The template is rebuilt if any attribute it read has
 * been replaced or re-uploaded since.
 * Working if a second worker's softening reads none of the source normals.
 */
const softenedWorkerTemplates = new WeakMap<
  THREE.BufferGeometry,
  Map<string, { inputs: unknown[]; template: THREE.BufferGeometry | null }>
>();

const softenInputs = (source: THREE.BufferGeometry): unknown[] =>
  [
    source.index,
    ...['position', 'normal', 'skinIndex', 'skinWeight'].map((name) => source.getAttribute(name)),
  ].flatMap((attribute) => [
    attribute,
    (attribute as THREE.InterleavedBufferAttribute | undefined)?.isInterleavedBufferAttribute
      ? (attribute as THREE.InterleavedBufferAttribute).data.version
      : (attribute as THREE.BufferAttribute | null | undefined)?.version,
  ]);

export function softenSharedWorkerGeometry(
  source: THREE.BufferGeometry,
  armJoints: readonly number[] = []
): THREE.BufferGeometry | null {
  let byJoints = softenedWorkerTemplates.get(source);
  if (!byJoints) softenedWorkerTemplates.set(source, (byJoints = new Map()));
  const key = armJoints.join(',');
  const inputs = softenInputs(source);
  let entry = byJoints.get(key);
  if (
    !entry ||
    entry.inputs.length !== inputs.length ||
    !entry.inputs.every((value, i) => Object.is(value, inputs[i]))
  ) {
    entry?.template?.dispose();
    entry = { inputs, template: softenWorkerFaceNormals(source, armJoints) };
    byJoints.set(key, entry);
  }
  return entry.template ? entry.template.clone() : null;
}

const cuffWorkerTemplates = new WeakMap<
  THREE.BufferGeometry,
  WeakMap<
    THREE.BufferGeometry,
    { inputs: unknown[]; frame: string; template: THREE.BufferGeometry | null }
  >
>();

/** Reuse the existing validated-template/private-copy pattern for identical cuffs.
 * Working if a compatible second wearer repeats no geometric fitting, still
 * receives its own current softened normals, and warm-cache frame mismatches reject.
 */
export function createSharedWorkerCuffSockets(
  trousers: THREE.SkinnedMesh,
  ankle: THREE.SkinnedMesh,
  originalTrousers: THREE.BufferGeometry,
  originalAnkle: THREE.BufferGeometry
): THREE.BufferGeometry | null {
  if (
    trousers.skeleton !== ankle.skeleton ||
    trousers.bindMode !== ankle.bindMode ||
    !trousers.bindMatrix.equals(ankle.bindMatrix) ||
    !trousers.bindMatrixInverse.equals(ankle.bindMatrixInverse) ||
    !trousers.matrixWorld.equals(ankle.matrixWorld)
  )
    return null;
  const inputs: unknown[] = [];
  for (const [current, original] of [
    [trousers.geometry, originalTrousers],
    [ankle.geometry, originalAnkle],
  ]) {
    const names = Object.keys(original.attributes).sort();
    if (
      Object.keys(current.attributes).sort().join(',') !== names.join(',') ||
      JSON.stringify(current.groups) !== JSON.stringify(original.groups) ||
      current.drawRange.start !== original.drawRange.start ||
      current.drawRange.count !== original.drawRange.count ||
      Object.keys(current.morphAttributes).length ||
      Object.keys(original.morphAttributes).length ||
      current.index?.count !== original.index?.count
    )
      return null;
    for (let i = 0; i < (original.index?.count ?? 0); i++)
      if (current.index!.getX(i) !== original.index!.getX(i)) return null;
    for (const name of names) {
      const a = current.getAttribute(name),
        b = original.getAttribute(name);
      if (
        a.count !== b.count ||
        a.itemSize !== b.itemSize ||
        a.normalized !== b.normalized ||
        a.array.constructor !== b.array.constructor
      )
        return null;
      // Only normal softening may differ from the canonical borrowed skin.
      for (let i = 0; i < a.count; i++)
        for (let c = 0; c < a.itemSize; c++) {
          const value = a.getComponent(i, c);
          if (!Number.isFinite(value) || (name !== 'normal' && value !== b.getComponent(i, c)))
            return null;
        }
    }
    inputs.push(
      JSON.stringify([original.groups, original.drawRange, Object.keys(original.morphAttributes)])
    );
    for (const attribute of [original.index, ...names.map((name) => original.getAttribute(name))])
      inputs.push(
        attribute,
        attribute instanceof THREE.InterleavedBufferAttribute
          ? attribute.data.version
          : attribute?.version,
        attribute?.itemSize,
        attribute?.normalized,
        (attribute as THREE.BufferAttribute | undefined)?.gpuType
      );
  }
  const frame = [
    ...trousers.bindMatrix.elements,
    ...trousers.bindMatrixInverse.elements,
    ...trousers.matrixWorld.elements,
    ...trousers.skeleton.bones.map((bone) => bone.name),
  ].join(',');
  let byAnkle = cuffWorkerTemplates.get(originalTrousers);
  if (!byAnkle) cuffWorkerTemplates.set(originalTrousers, (byAnkle = new WeakMap()));
  let entry = byAnkle.get(originalAnkle);
  if (
    !entry ||
    entry.frame !== frame ||
    entry.inputs.length !== inputs.length ||
    !entry.inputs.every((value, i) => Object.is(value, inputs[i]))
  ) {
    entry?.template?.dispose();
    entry = { inputs, frame, template: createWorkerCuffSockets(trousers, ankle) };
    byAnkle.set(originalAnkle, entry);
  }
  if (!entry.template) return null;
  const copy = entry.template.clone();
  const normal = copy.getAttribute('normal') as THREE.BufferAttribute;
  const softened = trousers.geometry.getAttribute('normal');
  for (let i = 0; i < softened.count; i++)
    for (let c = 0; c < softened.itemSize; c++)
      normal.setComponent(i, c, softened.getComponent(i, c));
  copy.userData = {
    ...copy.userData,
    workerCuffSockets: structuredClone(copy.userData.workerCuffSockets),
  };
  return copy;
}

/** Subtle lit skin undertones in Head bind space, never a baked light/shadow.
 * Working if cheeks/ears warm on both bodies without changing vertices, skinning,
 * cached assets, mesh count or the existing per-person skin colour.
 */
export function createWorkerFaceColours(
  mesh: THREE.Mesh,
  head: THREE.Object3D,
  bodyType: WorkerBodyType
): THREE.BufferAttribute | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position) return null;
  const intoHead = head.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const skin = mesh as THREE.SkinnedMesh;
  if (skin.isSkinnedMesh) {
    const joint = skin.skeleton.bones.indexOf(head as THREE.Bone);
    if (joint < 0) return null;
    intoHead
      .multiply(skin.bindMatrixInverse)
      .multiply(head.matrixWorld)
      .multiply(skin.skeleton.boneInverses[joint])
      .multiply(skin.bindMatrix);
  }
  const colours = new Float32Array(position.count * 3),
    point = new THREE.Vector3();
  const cheekY = WORKER_EYE_CENTRES[bodyType][1] - 0.045;
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(intoHead);
    const front = THREE.MathUtils.smoothstep(point.z, 0.035, 0.09);
    const cheek =
      Math.exp(-(((Math.abs(point.x) - 0.055) / 0.034) ** 2 + ((point.y - cheekY) / 0.045) ** 2)) *
      front;
    const ear = Math.exp(
      -(
        ((Math.abs(point.x) - 0.095) / 0.025) ** 2 +
        ((point.y - 0.055) / 0.05) ** 2 +
        ((point.z - 0.005) / 0.045) ** 2
      )
    );
    const warmth = Math.min(1, cheek + ear * 0.6);
    const jaw = Math.exp(-(((point.y + 0.015) / 0.055) ** 2)) * front * 0.025;
    colours.set(
      [1 + warmth * 0.045 - jaw, 1 - warmth * 0.05 - jaw, 1 - warmth * 0.065 - jaw],
      i * 3
    );
  }
  return new THREE.BufferAttribute(colours, 3);
}

/** Dress the authored hands using their actual wrist/finger skin weights.
 * Working if cuffs blend continuously across shared triangles, no draw is added,
 * and all original positions, normals, joint weights and indices remain exact.
 */
export function dressWorkerHands(
  geometry: THREE.BufferGeometry,
  skeleton: THREE.Skeleton,
  skinColour: THREE.Color,
  gloveColour: THREE.Color
) {
  const joints = geometry.getAttribute('skinIndex'),
    weights = geometry.getAttribute('skinWeight'),
    positions = geometry.getAttribute('position');
  if (!joints || !weights || !positions || skinColour.toArray().some((c) => c <= 0)) return null;
  const handBones = new Set<number>();
  skeleton.bones.forEach((bone, index) => {
    if (/^(Wrist|Index|Middle|Ring|Pinky|Thumb)\d*[LR]$/.test(bone.name.replace(/[._]/g, '')))
      handBones.add(index);
  });
  if (!handBones.size) return null;
  const colours = new Float32Array(positions.count * 3);
  const tint = [
    gloveColour.r / skinColour.r,
    gloveColour.g / skinColour.g,
    gloveColour.b / skinColour.b,
  ];
  for (let i = 0; i < positions.count; i++) {
    let influence = 0;
    for (let c = 0; c < 4; c++) {
      if (handBones.has(joints.getComponent(i, c))) influence += weights.getComponent(i, c);
    }
    const glove = THREE.MathUtils.smoothstep(influence, 0.2, 0.95);
    for (let c = 0; c < 3; c++) colours[i * 3 + c] = THREE.MathUtils.lerp(1, tint[c], glove);
  }
  const dressed = geometry.clone();
  dressed.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return dressed;
}

export interface WorkerModelProps {
  appearance: WorkerAppearance;
  /** Mutable, read each frame after the simulation advances. */
  motion: WorkerMotionState;
}

type WorkerClipName =
  | 'worker-idle'
  | 'worker-walk'
  | 'worker-run'
  | 'worker-break'
  | 'worker-inspect'
  | 'worker-repair'
  | 'worker-supervise'
  | 'worker-radio'
  | 'worker-sample';

export const WORKER_CLIPS: WorkerClipName[] = [
  'worker-idle',
  'worker-walk',
  'worker-run',
  'worker-break',
  'worker-inspect',
  'worker-repair',
  'worker-supervise',
  'worker-radio',
  'worker-sample',
];

const TASK_CLIPS: Record<WorkerWorkAction, WorkerClipName> = {
  supervise: 'worker-supervise',
  inspect: 'worker-inspect',
  operate: 'worker-inspect',
  sample: 'worker-sample',
  repair: 'worker-repair',
  radio: 'worker-radio',
  garden: 'worker-break',
  bake: 'worker-break',
  none: 'worker-idle',
};

/**
 * Ground speed that each locomotion clip depicts, in ARMATURE units per second,
 * measured offline from the contact-phase sweep of the FootL/FootR IK targets
 * in both GLBs (both clips are strictly in-place: Body translation Z is
 * constant across every key). The two files share identical foot keyframes; the
 * feminine clips are simply retimed 1.25x slower, so its speeds are exactly
 * 0.8x the masculine ones.
 *
 * These are NOT metres per second. The CharacterArmature node carries a 0.9215
 * (masculine) / 0.9244 (feminine) uniform scale, so the world figure is this
 * value times the rig scale read off the model at prepare time, times the
 * per-person bodyScale that the wrapper group applies to X/Z.
 *
 * The previous single pair of constants (1.35 / 2.25) was right for nothing:
 * the masculine walk was ~8% fast, the feminine walk ~25% slow (half the roster
 * moonwalked), and the masculine run ~30% slow so the feet skated forward.
 */
const CLIP_GROUND_SPEED: Record<WorkerBodyType, { walk: number; run: number }> = {
  masculine: { walk: 1.352, run: 2.935 },
  feminine: { walk: 1.082, run: 2.348 },
};

/** Multiple of natural walk speed at which the run clip takes over. */
const RUN_CROSSOVER = 1.45;
/** A narrow speed band prevents alternating clip choices near the crossover.
 * Working if a real acceleration changes gait while small speed noise does not.
 */
export function selectWorkerLocomotion(speed: number, walkSpeed: number, previous?: string) {
  const threshold =
    RUN_CROSSOVER + (previous === 'worker-run' ? -0.08 : previous === 'worker-walk' ? 0.08 : 0);
  return speed > walkSpeed * threshold ? 'worker-run' : 'worker-walk';
}

/** Gait for a root whose clock runs `gaitScale` times faster than real time.
 * The gait is chosen from the speed the person would have at real time, so a
 * time-lapsed walker keeps walking; cadence follows the ground actually covered
 * so the feet stay planted, and the real-time ceilings scale with the clock.
 * Working if pace 120 shows a fast-cadence walk, never a run, and gaitScale 1
 * (or a missing value from an older save) is the previous behaviour exactly.
 */
export function workerGaitRates(
  speed: number,
  walkSpeed: number,
  runSpeed: number,
  gaitScale?: number,
  previous?: string
): { clip: 'worker-walk' | 'worker-run'; walk: number; run: number } {
  const scale = Number.isFinite(gaitScale) && gaitScale! > 0 ? gaitScale! : 1;
  return {
    clip: selectWorkerLocomotion(speed / scale, walkSpeed, previous),
    walk: THREE.MathUtils.clamp(speed / walkSpeed, 0, 1.9 * scale),
    run: THREE.MathUtils.clamp(speed / runSpeed, 0, 2.4 * scale),
  };
}

/** Empty-handed standing listeners use the authored neutral stance. Seat cues
 * keep precedence, including an interrupted approach, with no rest semantics.
 * Working if mount and admitted frames choose the same base while ordinary
 * idle, walking, work and coupled props keep their original clips.
 */
function standingBriefing(motion: WorkerMotionState, moving: boolean): boolean {
  return (
    motion.briefing === true &&
    motion.activity === 'idle' &&
    !moving &&
    !motion.seated &&
    !motion.cycling &&
    !motion.cartGrip &&
    !validWorkerSeatCue(motion.seat)
  );
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const SUPERVISOR_CABLE = new THREE.TorusGeometry(0.065, 0.005, 6, 18, Math.PI * 1.25);
const SUPERVISOR_RADIO_KNOB = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10);

type WorkerAccessoryPairKind = 'glasses-temples' | 'hearing-cups' | 'vest-strips' | 'eye-pupils';
const ACCESSORY_PAIRS: Record<
  WorkerAccessoryPairKind,
  {
    x: number;
    z: number;
    scale: THREE.Vector3Tuple;
    rotationZ: number;
  }
> = {
  'glasses-temples': { x: 0.084, z: -0.052, scale: [1, 1, 1], rotationZ: 0 },
  'hearing-cups': { x: 0.104, z: 0, scale: [1, 1, 1], rotationZ: Math.PI / 2 },
  'eye-pupils': { x: 0.047, z: 0, scale: [0.005, 0.008, 0.0025], rotationZ: 0 },
  'vest-strips': { x: 0.078, z: 0, scale: [0.018, 0.135, 0.008], rotationZ: 0 },
};

/** Fixed pairs remain in their moving bone's local space.
 * Working if the pads face inward and other fittings retain their rest pose in one draw.
 */
export function createWorkerAccessoryPair(
  kind: WorkerAccessoryPairKind,
  material: THREE.Material,
  eyeSurfaces?: readonly WorkerEyeSurface[],
  bodyType?: WorkerBodyType
): THREE.InstancedMesh {
  const spec = ACCESSORY_PAIRS[kind];
  const geometry =
    kind === 'hearing-cups'
      ? SHARED_WORKER_GEOMETRY.hearingCup
      : kind === 'eye-pupils'
        ? SHARED_WORKER_GEOMETRY.eyePupil
        : kind === 'glasses-temples'
          ? SHARED_WORKER_GEOMETRY.glassesTemple
          : UNIT_BOX;
  const mesh = new THREE.InstancedMesh(geometry, material, 2);
  mesh.name = `worker-paired-${kind}`;
  mesh.matrixAutoUpdate = false;
  const transform = new THREE.Object3D();
  transform.scale.fromArray(spec.scale);
  transform.rotation.z = spec.rotationZ;
  const halfWidth =
    kind === 'hearing-cups' && bodyType ? WORKER_HEARING_FIT[bodyType].halfWidth : spec.x;
  [-halfWidth, halfWidth].forEach((x, index) => {
    if (kind === 'hearing-cups') transform.rotation.z = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    transform.position.set(x, 0, spec.z);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  if (kind === 'eye-pupils') {
    if (
      eyeSurfaces?.length === 2 &&
      bodyType &&
      eyeSurfaces.every(
        (s) =>
          [...s.centre, ...s.right, ...s.up, ...s.normal, s.halfWidth, s.halfHeight].every(
            Number.isFinite
          ) &&
          s.halfWidth >= 0.009 &&
          s.halfWidth <= 0.015 &&
          s.halfHeight >= 0.009 &&
          s.halfHeight <= 0.015
      )
    ) {
      const centre = new THREE.Vector3().fromArray(WORKER_EYE_CENTRES[bodyType]);
      const right = new THREE.Vector3(),
        up = new THREE.Vector3(),
        normal = new THREE.Vector3();
      const matrix = new THREE.Matrix4(),
        point = new THREE.Vector3();
      eyeSurfaces.forEach((surface, index) => {
        right.fromArray(surface.right);
        up.fromArray(surface.up);
        normal.fromArray(surface.normal);
        point.fromArray(surface.centre).sub(centre).addScaledVector(normal, 0.0012);
        matrix.makeBasis(right, up, normal).scale(transform.scale).setPosition(point);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.userData.workerEyeSurfaces = eyeSurfaces;
    }
    mesh.userData.workerPupilBase = new Float32Array(mesh.instanceMatrix.array);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  if (kind === 'eye-pupils') {
    mesh.boundingBox?.expandByScalar(0.006);
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.006;
  }
  return mesh;
}

/** One writer composes plane-constrained gaze and the eye's Head-Y closure.
 * Working if no transform accumulates, both eyes stay inside their inset quads,
 * and a full blink hides pupils without scaling or moving their bone mount.
 */
export function setWorkerPupilPose(
  mesh: THREE.InstancedMesh,
  amount: number,
  horizontal = 0,
  vertical = 0
) {
  const closure = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
  const surfaces = mesh.userData.workerEyeSurfaces as readonly WorkerEyeSurface[] | undefined;
  const x = surfaces && Number.isFinite(horizontal) ? THREE.MathUtils.clamp(horizontal, -1, 1) : 0;
  const y = surfaces && Number.isFinite(vertical) ? THREE.MathUtils.clamp(vertical, -1, 1) : 0;
  if (
    (mesh.userData.workerBlinkClosure ?? 0) === closure &&
    (mesh.userData.workerGazeX ?? 0) === x &&
    (mesh.userData.workerGazeY ?? 0) === y
  )
    return;
  mesh.userData.workerBlinkClosure = closure;
  mesh.userData.workerGazeX = x;
  mesh.userData.workerGazeY = y;
  const array = mesh.instanceMatrix.array;
  const base = (mesh.userData.workerPupilBase ??= new Float32Array(array)) as Float32Array;
  array.set(base);
  const scale = 1 - closure * 0.92;
  for (let instance = 0; instance < 2; instance++) {
    const offset = instance * 16,
      surface = surfaces?.[instance];
    if (surface) {
      const horizontalMetres = x * Math.max(0, Math.min(0.004, surface.halfWidth - 0.005 - 0.0006));
      const verticalMetres = y * Math.max(0, Math.min(0.0013, surface.halfHeight - 0.008 - 0.0006));
      for (let axis = 0; axis < 3; axis++)
        array[offset + 12 + axis] +=
          surface.right[axis] * horizontalMetres + surface.up[axis] * verticalMetres;
    }
    // Blink deforms the actual eye in Head Y, not along the fitted quad's up.
    array[offset + 1] *= scale;
    array[offset + 5] *= scale;
    array[offset + 9] *= scale;
    array[offset + 13] *= scale;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = closure < 0.5;
}

/** Old blink-only callers preserve their current gaze; neutral pairs stay exact. */
export function setWorkerPupilBlink(mesh: THREE.InstancedMesh, amount: number) {
  setWorkerPupilPose(mesh, amount, mesh.userData.workerGazeX ?? 0, mesh.userData.workerGazeY ?? 0);
}

const WorkerAccessoryPair: React.FC<{
  kind: WorkerAccessoryPairKind;
  material: THREE.Material;
  meshRef?: React.RefObject<THREE.InstancedMesh | null>;
  eyeSurfaces?: readonly WorkerEyeSurface[];
  bodyType?: WorkerBodyType;
}> = ({ kind, material, meshRef, eyeSurfaces, bodyType }) => {
  const mesh = useMemo(
    () => createWorkerAccessoryPair(kind, material, eyeSurfaces, bodyType),
    [kind, material, eyeSurfaces, bodyType]
  );
  // The rig borrows shared geometry/materials. Dispose only this pair's instance buffer.
  useEffect(
    () => () => {
      mesh.dispose();
    },
    [mesh]
  );
  return <primitive object={mesh} ref={meshRef} dispose={null} />;
};

/**
 * Conservative pose margin added to the bind-pose bounding volume, in metres.
 * The run clip swings FootL to y 0.560 / z 0.408 against a 1.87 m bind box, so
 * this covers the widest authored excursion without letting a mid-stride worker
 * pop out at a screen edge.
 */
const POSE_BOUNDS_MARGIN = 0.45;

// Scratch used only during instance preparation.
const _box = new THREE.Box3();
const _bindBox = new THREE.Box3();
const _center = new THREE.Vector3();

interface AccessoryMaterials {
  glasses: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  badge: THREE.MeshStandardMaterial;
  reflective: THREE.MeshPhysicalMaterial;
}

function createAccessoryMaterials(appearance: WorkerAppearance): AccessoryMaterials {
  return {
    ...SHARED_WORKER_ACCESSORY_MATERIALS,
    accent: new THREE.MeshStandardMaterial({
      color: appearance.accentColor,
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.06,
    }),
  };
}

interface BoneMountProps {
  bone: THREE.Object3D | null;
  name: string;
  position?: THREE.Vector3Tuple;
  rotation?: THREE.EulerTuple;
  scale?: THREE.Vector3Tuple;
  children: React.ReactNode;
}

const BoneMount: React.FC<BoneMountProps> = ({
  bone,
  name,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  children,
}) => {
  if (!bone) return null;
  return createPortal(
    <group name={name} position={position} rotation={rotation} scale={scale}>
      {children}
    </group>,
    bone
  );
};

function shade(hex: string, multiplier: number): THREE.Color {
  const color = new THREE.Color(hex);
  color.multiplyScalar(multiplier);
  return color;
}

/**
 * Per-surface material semantics.
 *
 * The previous implementation was a regex else-if chain over lowercased source
 * names, which mis-resolved on the feminine body: its eye material is literally
 * called `Brown` (baseColor bit-identical to the masculine `Eye`), so the
 * head-hair branch matched first and painted all five feminine workers' irises
 * with their hair colour. Its trouser materials are `Brown_02` and `Brown2`, and
 * both matched `includes('2')`, so both took the 0.72 darkening and the cuff /
 * trouser tonal split was lost. An explicit table keyed on the exact names
 * dumped from each GLB removes the ambiguity entirely.
 */
type WorkerSurface =
  | 'skin'
  | 'hardHat'
  | 'hiVisStrap'
  | 'hiVis'
  | 'shirt'
  | 'denim'
  | 'denimDark'
  | 'bootUpper'
  | 'bootSole'
  | 'boot'
  | 'hair'
  | 'eye';

const SURFACE_BY_MATERIAL: Record<WorkerBodyType, Record<string, WorkerSurface>> = {
  masculine: {
    Skin: 'skin',
    Worker_Yellow: 'hardHat',
    Worker_Vest: 'hiVis',
    LightBrown: 'shirt',
    Grey: 'bootUpper',
    Black: 'bootSole',
    Eyebrows: 'hair',
    Moustache: 'hair',
    Eye: 'eye',
    Brown: 'denim',
    Brown2: 'denimDark',
  },
  feminine: {
    Skin: 'skin',
    Worker_Vest: 'hiVis',
    White: 'shirt',
    Worker_Yellow: 'hardHat',
    Black: 'boot',
    DarkBrown: 'hair',
    Brown: 'eye',
    Brown_02: 'denim',
    Brown2: 'denimDark',
  },
};

/**
 * Resolve the surface for one primitive. `Worker_Yellow` is the only material
 * that spans two body regions: the helmet shell on Worker_Head, and a narrow
 * pair of vertical torso straps on Worker_Body (208 verts, y 1.12-1.54,
 * x +/-0.13 on both bodies). The straps are hi-vis webbing, not moulded HDPE,
 * so they must not take the helmet's clearcoat.
 */
function resolveSurface(
  bodyType: WorkerBodyType,
  materialName: string,
  nodeName: string
): WorkerSurface | null {
  const surface = SURFACE_BY_MATERIAL[bodyType][materialName] ?? null;
  if (surface === 'hardHat' && !nodeName.includes('Worker_Head')) return 'hiVisStrap';
  return surface;
}

interface SurfaceProfile {
  /** MeshPhysicalMaterial is restricted to the surfaces whose read depends on it. */
  physical: boolean;
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
}

/**
 * Every worker surface previously collapsed to `roughness = 0.72, metalness = 0`
 * (0.28 eyes, 0.86 feet), so skin, HDPE helmet, hi-vis polyester, cotton drill,
 * denim and rubber sole all reflected identically. With `scene.environment` now
 * present these values finally separate.
 */
const SURFACE_PROFILES: Record<WorkerSurface, SurfaceProfile> = {
  skin: {
    physical: true,
    roughness: 0.44,
    metalness: 0,
    envMapIntensity: 1.4,
    sheen: 0.22,
    sheenColor: '#ff9d7d',
    sheenRoughness: 0.65,
  },
  hardHat: {
    physical: true,
    roughness: 0.3,
    metalness: 0,
    envMapIntensity: 1.2,
    clearcoat: 0.35,
    clearcoatRoughness: 0.22,
  },
  hiVisStrap: {
    physical: true,
    roughness: 0.48,
    metalness: 0,
    envMapIntensity: 1.6,
    sheen: 0.3,
    sheenColor: '#ffffff',
    sheenRoughness: 0.5,
  },
  hiVis: {
    physical: true,
    roughness: 0.6,
    metalness: 0,
    envMapIntensity: 1.8,
    sheen: 0.35,
    sheenColor: '#ffffff',
    sheenRoughness: 0.55,
  },
  shirt: {
    physical: false,
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.9,
  },
  denim: {
    physical: false,
    roughness: 0.9,
    metalness: 0,
    envMapIntensity: 0.8,
  },
  denimDark: {
    physical: false,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.8,
  },
  bootUpper: { physical: false, roughness: 0.62, metalness: 0.02, envMapIntensity: 1 },
  bootSole: { physical: false, roughness: 0.88, metalness: 0, envMapIntensity: 0.7 },
  boot: { physical: false, roughness: 0.72, metalness: 0.02, envMapIntensity: 0.9 },
  hair: {
    physical: true,
    roughness: 0.55,
    metalness: 0,
    envMapIntensity: 1.1,
    sheen: 0.45,
    sheenRoughness: 0.35,
  },
  eye: {
    physical: true,
    roughness: 0.06,
    metalness: 0,
    envMapIntensity: 2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
  },
};

function surfaceColor(surface: WorkerSurface, appearance: WorkerAppearance): THREE.Color {
  switch (surface) {
    case 'skin':
      return new THREE.Color(appearance.skinTone);
    case 'hardHat':
      return new THREE.Color(appearance.hatColor);
    case 'hiVisStrap':
      if (appearance.hasLabCoat) return new THREE.Color('#eef0e7');
      return appearance.hasVest
        ? new THREE.Color(appearance.hatColor)
        : shade(appearance.uniformColor, 0.88);
    case 'hiVis':
      if (appearance.hasLabCoat) return new THREE.Color('#eef0e7');
      return new THREE.Color(appearance.hasVest ? appearance.accentColor : appearance.uniformColor);
    case 'shirt':
      return new THREE.Color(appearance.hasLabCoat ? '#eef0e7' : appearance.uniformColor);
    case 'eye':
      return new THREE.Color(appearance.eyeColor);
    case 'hair':
      return new THREE.Color(appearance.hairColor);
    case 'denim':
      return new THREE.Color(appearance.pantsColor);
    case 'denimDark':
      return shade(appearance.pantsColor, 0.72);
    case 'bootUpper':
      return new THREE.Color('#313b43');
    case 'bootSole':
      return new THREE.Color('#111820');
    case 'boot':
    default:
      return new THREE.Color('#232b33');
  }
}

/**
 * Build the runtime material for one primitive.
 *
 * Constructed rather than cloned, because half these surfaces need to be a
 * MeshPhysicalMaterial and the GLB ships MeshStandardMaterial. `side` is
 * deliberately carried over from the source: every material in both files is
 * authored `doubleSided: true`, and flipping to FrontSide without being able to
 * inspect the result risks an inside-out vest or hair for a shadow-pass saving
 * these scenes do not need.
 */
function createSurfaceMaterial(
  source: THREE.Material,
  surface: WorkerSurface,
  appearance: WorkerAppearance
): THREE.MeshStandardMaterial {
  const profile =
    SURFACE_PROFILES[
      !appearance.hasVest && (surface === 'hiVis' || surface === 'hiVisStrap') ? 'shirt' : surface
    ];
  const base = {
    color: surfaceColor(surface, appearance),
    roughness: profile.roughness,
    metalness: profile.metalness,
    envMapIntensity: profile.envMapIntensity,
    side: (source as THREE.MeshStandardMaterial).side ?? THREE.FrontSide,
    transparent: (source as THREE.MeshStandardMaterial).transparent ?? false,
    opacity: (source as THREE.MeshStandardMaterial).opacity ?? 1,
    flatShading: false,
  };

  if (!profile.physical) return new THREE.MeshStandardMaterial(base);

  const physical = new THREE.MeshPhysicalMaterial(base);
  if (profile.sheen !== undefined) {
    physical.sheen = profile.sheen;
    physical.sheenRoughness = profile.sheenRoughness ?? 0.5;
    // Hair catches a lighter version of its own colour rather than a fixed tint.
    if (profile.sheenColor) {
      physical.sheenColor.set(profile.sheenColor);
    } else {
      physical.sheenColor.copy(shade(appearance.hairColor, 1.6));
    }
  }
  if (profile.clearcoat !== undefined) {
    physical.clearcoat = profile.clearcoat;
    physical.clearcoatRoughness = profile.clearcoatRoughness ?? 0.1;
  }
  return physical;
}

/** The original hair primitive also carries eyebrows. Keep its measured
 * two whole front brow islands and all skin attributes; only the private index changes.
 * Working if civilian cuts replace scalp silhouettes without erasing eyebrows,
 * while original exports, unknown materials and helmeted workers remain intact.
 */
export function retainWorkerBrows(mesh: THREE.Mesh, head: THREE.Object3D, preserveScalp = false) {
  const source = mesh.geometry;
  const position = source.getAttribute('position');
  if (!position || Array.isArray(mesh.material)) return null;
  mesh.updateWorldMatrix(true, false);
  const inverse = head.matrixWorld.clone().invert();
  const point = new THREE.Vector3();
  const centres = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex++) {
    point.fromBufferAttribute(position, vertex);
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh)
      (mesh as THREE.SkinnedMesh).applyBoneTransform(vertex, point);
    point
      .applyMatrix4(mesh.matrixWorld)
      .applyMatrix4(inverse)
      .toArray(centres, vertex * 3);
  }
  // The actual exports contain two disconnected brow islands (24/40 vertices
  // each). Weld coincident corners, then classify complete islands so clipping
  // never leaves sharp triangles from the old fringe beside a new haircut.
  const parents = Uint32Array.from({ length: position.count }, (_, index) => index);
  const root = (vertex: number): number => {
    let index = vertex;
    while (parents[index] !== index) index = parents[index];
    while (parents[vertex] !== vertex) {
      const next = parents[vertex];
      parents[vertex] = index;
      vertex = next;
    }
    return index;
  };
  const join = (a: number, b: number) => {
    parents[root(a)] = root(b);
  };
  const welded = new Map<string, number>();
  for (let vertex = 0; vertex < position.count; vertex++) {
    const key = [0, 1, 2].map((c) => Math.round(centres[vertex * 3 + c] * 100000)).join(',');
    const other = welded.get(key);
    if (other === undefined) welded.set(key, vertex);
    else join(vertex, other);
  }
  const count = source.index?.count ?? position.count;
  const indexAt = (index: number) => source.index?.getX(index) ?? index;
  for (let triangle = 0; triangle < count; triangle += 3) {
    join(indexAt(triangle), indexAt(triangle + 1));
    join(indexAt(triangle), indexAt(triangle + 2));
  }
  const islands = new Map<number, THREE.Box3>();
  for (let vertex = 0; vertex < position.count; vertex++) {
    const id = root(vertex);
    let box = islands.get(id);
    if (!box) {
      box = new THREE.Box3();
      islands.set(id, box);
    }
    box.expandByPoint(point.fromArray(centres, vertex * 3));
  }
  const brows = new Set(
    [...islands]
      .filter(
        ([, box]) =>
          box.min.y > 0.105 &&
          box.max.y < 0.135 &&
          box.min.z > 0.095 &&
          box.max.z < 0.135 &&
          box.max.x - box.min.x < 0.07
      )
      .map(([id]) => id)
  );
  if (brows.size !== 2) return null;
  const indices: number[] = [];
  for (let triangle = 0; triangle < count; triangle += 3) {
    if (brows.has(root(indexAt(triangle))))
      indices.push(indexAt(triangle), indexAt(triangle + 1), indexAt(triangle + 2));
  }
  const geometry = source.clone();
  if (!preserveScalp) geometry.setIndex(indices);
  geometry.userData.workerBrowIslands = [...brows].map((id) =>
    [...new Set(indices)].filter((vertex) => root(vertex) === id)
  );
  return geometry;
}

/** Quiet civilian fibre finish, independent of the original glossy PPE export.
 * Working if cut vertices are coloured, nonmetallic and softly lit, not polished.
 */
export function createWorkerHairMaterial(hairColor: string) {
  return new THREE.MeshStandardMaterial({
    name: 'worker-authored-hair-material',
    color: hairColor,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0,
    envMapIntensity: 0.8,
  });
}

const WorkerAccessories: React.FC<{
  appearance: WorkerAppearance;
  model: THREE.Group;
  materials: AccessoryMaterials;
  toolRef: React.RefObject<THREE.Group | null>;
  hair: {
    motion: ReturnType<typeof createWorkerHairMotion>;
    material: THREE.MeshStandardMaterial;
  } | null;
  faceRef: React.RefObject<THREE.Group | null>;
  pupilRef: React.RefObject<THREE.InstancedMesh | null>;
  eyeSurfaces: readonly WorkerEyeSurface[];
  mouth: ReturnType<typeof createWorkerFaceExpression>['mouth'];
}> = ({ appearance, model, materials, toolRef, faceRef, pupilRef, hair, eyeSurfaces, mouth }) => {
  const head = model.getObjectByName('Head') ?? null;
  const chest = model.getObjectByName('Chest') ?? null;
  const hips = model.getObjectByName('Hips') ?? null;
  const wrist = model.getObjectByName('WristL') ?? null;
  const isSupervisor = appearance.workAction === 'supervise';
  const handheldMount = useMemo(
    () => createWorkerHandheldMount(model, appearance.tool),
    [model, appearance.tool]
  );
  const eyeCentre = WORKER_EYE_CENTRES[appearance.bodyType];
  const hearingFit = WORKER_HEARING_FIT[appearance.bodyType];
  const hairScale =
    appearance.hairStyle === 'bald'
      ? 1
      : WORKER_HAIR_FIT[appearance.bodyType][appearance.hairStyle];
  return (
    <>
      {hair && (
        <BoneMount bone={head} name="worker-hair-mount">
          <mesh
            name="worker-authored-hair"
            geometry={hair.motion.geometry}
            material={hair.material}
            position={[0, WORKER_HAIR_FIT.offsetY, 0]}
            scale={[
              hairScale * (appearance.bodyType === 'feminine' ? 0.92 : 1),
              hairScale,
              hairScale,
            ]}
            castShadow
            receiveShadow
            dispose={null}
          />
        </BoneMount>
      )}
      <BoneMount bone={head} name="worker-eye-detail" position={[...eyeCentre]}>
        <group ref={faceRef}>
          {mouth && (
            <mesh
              name="worker-authored-mouth"
              receiveShadow
              geometry={mouth.geometry}
              material={mouth.material}
              position={[-eyeCentre[0], -eyeCentre[1], -eyeCentre[2]]}
              dispose={null}
            />
          )}
          <WorkerAccessoryPair
            kind="eye-pupils"
            material={SHARED_WORKER_MATERIALS.pupil}
            meshRef={pupilRef}
            eyeSurfaces={eyeSurfaces}
            bodyType={appearance.bodyType}
          />
        </group>
      </BoneMount>
      {appearance.hasSafetyGlasses && (
        <BoneMount
          bone={head}
          name="worker-safety-glasses"
          position={[eyeCentre[0], eyeCentre[1], eyeCentre[2] + 0.018]}
        >
          {[-0.047, 0.047].map((x) => (
            <mesh
              key={x}
              position={[x, 0, 0]}
              geometry={SHARED_WORKER_GEOMETRY.glassesLens}
              material={materials.glasses}
              renderOrder={4}
            />
          ))}
          <mesh
            name="worker-fitted-glasses-frame"
            geometry={SHARED_WORKER_GEOMETRY.glassesBridge}
            material={materials.dark}
          />
          <WorkerAccessoryPair kind="glasses-temples" material={materials.dark} />
        </BoneMount>
      )}

      {appearance.hasHearingProtection && (
        <BoneMount bone={head} name="worker-hearing-protection" position={[...hearingFit.centre]}>
          <WorkerAccessoryPair
            kind="hearing-cups"
            material={materials.accent}
            bodyType={appearance.bodyType}
          />
          <mesh
            position={[0, 0.002, 0]}
            geometry={SHARED_WORKER_GEOMETRY.hearingBand}
            scale={[1, hearingFit.bandScaleY, 1]}
            material={materials.dark}
          />
        </BoneMount>
      )}

      {(appearance.hasHardHat || appearance.hasVest || appearance.hasLabCoat) && (
        <BoneMount bone={chest} name="worker-identity-badge" position={[0.105, 0.018, 0.142]}>
          <mesh geometry={SHARED_WORKER_GEOMETRY.identityBadge} material={materials.badge} />
          <mesh
            position={[0, 0.033, 0.006]}
            geometry={UNIT_BOX}
            material={materials.accent}
            scale={[0.052, 0.009, 0.004]}
          />
          <mesh
            position={[-0.017, -0.009, 0.006]}
            geometry={UNIT_BOX}
            material={materials.dark}
            scale={[0.018, 0.027, 0.004]}
          />
          {isSupervisor && (
            <>
              <mesh
                position={[0.015, 0.006, 0.006]}
                geometry={UNIT_BOX}
                material={materials.dark}
                scale={[0.021, 0.004, 0.004]}
              />
              <mesh
                position={[0.015, -0.008, 0.006]}
                geometry={UNIT_BOX}
                material={materials.dark}
                scale={[0.021, 0.004, 0.004]}
              />
              <mesh
                position={[0.015, -0.022, 0.006]}
                geometry={UNIT_BOX}
                material={materials.accent}
                scale={[0.021, 0.004, 0.004]}
              />
            </>
          )}
        </BoneMount>
      )}

      {isSupervisor && (
        <>
          <BoneMount bone={head} name="supervisor-hard-hat-identity-stripe">
            <mesh
              position={[0, 0.17, 0.125]}
              geometry={UNIT_BOX}
              material={materials.badge}
              scale={[0.025, 0.11, 0.008]}
            />
            <mesh
              position={[0, 0.222, 0.045]}
              geometry={UNIT_BOX}
              material={materials.badge}
              scale={[0.025, 0.008, 0.15]}
            />
          </BoneMount>
          <BoneMount
            bone={chest}
            name="supervisor-radio-and-lanyard"
            position={[-0.13, 0.055, 0.14]}
          >
            <mesh geometry={SHARED_WORKER_GEOMETRY.chestRadio} material={materials.dark} />
            <mesh
              position={[0.018, 0.048, 0]}
              rotation={[0, 0, Math.PI / 2]}
              geometry={SUPERVISOR_RADIO_KNOB}
              material={materials.accent}
            />
            <mesh
              position={[-0.021, 0.083, 0]}
              rotation={[0, 0, -0.14]}
              geometry={UNIT_BOX}
              material={materials.dark}
              scale={[0.006, 0.075, 0.006]}
            />
            <mesh
              position={[0.08, -0.035, -0.002]}
              rotation={[Math.PI / 2, 0, -0.55]}
              geometry={SUPERVISOR_CABLE}
              material={materials.dark}
            />
            <mesh
              position={[0.18, -0.045, 0.004]}
              rotation={[0, 0, -0.18]}
              geometry={UNIT_BOX}
              material={materials.accent}
              scale={[0.008, 0.12, 0.007]}
            />
          </BoneMount>
        </>
      )}

      {appearance.hasVest && (
        <>
          <BoneMount bone={chest} name="worker-reflective-vest-chest" position={[0, 0.008, 0.128]}>
            <WorkerAccessoryPair kind="vest-strips" material={materials.reflective} />
          </BoneMount>
          <BoneMount bone={hips} name="worker-reflective-vest-waist" position={[0, 0.12, 0.122]}>
            <mesh
              geometry={UNIT_BOX}
              material={materials.reflective}
              scale={[0.245, 0.019, 0.008]}
            />
          </BoneMount>
        </>
      )}

      {appearance.hasToolBelt && (
        <BoneMount bone={hips} name="worker-tool-belt" position={[0, 0.045, 0.075]}>
          <mesh
            name="worker-utility-belt"
            geometry={SHARED_WORKER_GEOMETRY.toolBelt}
            material={materials.dark}
          />
        </BoneMount>
      )}

      {appearance.tool !== 'none' && (
        <BoneMount
          bone={appearance.tool === 'bread-tray' || appearance.tool === 'trowel' ? model : wrist}
          name={`worker-tool-${appearance.tool}`}
          position={
            handheldMount?.position ??
            (appearance.tool === 'bread-tray'
              ? [0, 1.09 / appearance.heightScale, 0.28 / appearance.bodyScale]
              : appearance.tool === 'trowel'
                ? [
                    0.12 / appearance.bodyScale,
                    0.326 / appearance.heightScale,
                    0.5205 / appearance.bodyScale,
                  ]
                : [0, 0.035, 0.025])
          }
          rotation={
            handheldMount?.rotation ??
            (appearance.tool === 'trowel'
              ? [0, 0, 0]
              : appearance.tool === 'bread-tray'
                ? [0, 0, 0]
                : [0, Math.PI / 2, 0])
          }
          scale={
            handheldMount?.scale ??
            (appearance.tool === 'bread-tray' || appearance.tool === 'trowel'
              ? [1 / appearance.bodyScale, 1 / appearance.heightScale, 1 / appearance.bodyScale]
              : [0.88, 0.88, 0.88])
          }
        >
          <group name="worker-held-tool" ref={toolRef} dispose={null}>
            <ToolAccessory tool={appearance.tool} />
          </group>
        </BoneMount>
      )}
    </>
  );
};

/** One private garment, same bind frame and palette as the existing body.
 * Working if near cloth deforms and its colours survive the two-draw far body.
 */
export function createBakerApron(model: THREE.Object3D) {
  let source: THREE.SkinnedMesh | undefined;
  model.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!source && mesh.isSkinnedMesh && mesh.parent?.name === 'Worker_Body') source = mesh;
  });
  if (!source) return null;
  const geometry = createWorkerApronGeometry(source);
  if (!geometry) return null;
  const material = new THREE.MeshStandardMaterial({
    name: 'baker-linen-apron',
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.8,
    side: (Array.isArray(source.material) ? source.material[0] : source.material).side,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'baker-authored-apron';
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  mesh.bindMode = source.bindMode;
  mesh.bind(source.skeleton, source.bindMatrix);
  mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  source.parent?.add(mesh);
  return mesh;
}

/** The coat shares this person's existing bind frame, never the cached rig.
 * Working if one owned garment follows the original clips and joins the far LOD.
 */
export function createWorkerLabCoat(model: THREE.Object3D) {
  let source: THREE.SkinnedMesh | undefined;
  model.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (!source && mesh.isSkinnedMesh && mesh.parent?.name === 'Worker_Body') source = mesh;
  });
  if (!source) return null;
  const geometry = createWorkerLabCoatGeometry(source);
  if (!geometry) return null;
  const material = new THREE.MeshStandardMaterial({
    name: 'quality-ivory-lab-coat',
    color: '#eef0e7',
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.8,
    side: (Array.isArray(source.material) ? source.material[0] : source.material).side,
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'quality-authored-lab-coat';
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  mesh.bindMode = source.bindMode;
  mesh.bind(source.skeleton, source.bindMatrix);
  mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
  mesh.castShadow = mesh.receiveShadow = true;
  source.parent?.add(mesh);
  return mesh;
}

export const WorkerModel: React.FC<WorkerModelProps> = ({ appearance, motion }) => {
  const modelPath =
    appearance.bodyType === 'feminine' ? WORKER_ASSET_PATHS.feminine : WORKER_ASSET_PATHS.masculine;
  // The normalized v0.40 worker bodies use KHR_draco_mesh_compression. Keep
  // the decoder explicit here so a cold load never depends on another model
  // having configured Drei's shared GLTFLoader first.
  const { scene, animations } = useDracoGLTF(modelPath);
  const actionsRef = useRef<Partial<Record<WorkerClipName, THREE.AnimationAction>>>({});
  const toolRef = useRef<THREE.Group>(null);
  const faceRef = useRef<THREE.Group>(null);
  const pupilRef = useRef<THREE.InstancedMesh>(null);
  const gesture = useMemo(createWorkerGesture, []);
  const sampledGesture = useMemo(createWorkerGesture, []);
  const gaze = useMemo(createWorkerGaze, []);
  const gestureTime = useRef(Number.isFinite(motion.phase) ? motion.phase : 0);
  const pendingDelta = useRef(0);
  const greetingElapsed = useRef(0);
  const greetingYaw = useRef(0);
  const attentionYaw = useRef(0);
  // Break/idle clips are shared by duties and rest. A cosmetic duty blend must
  // have separate ownership, using admitted delta and the garden fade pattern.
  const dutyWeight = useRef(0);
  const lastPose = useRef<{
    clip?: WorkerClipName;
    seated?: boolean;
    cycling?: boolean;
    greeting?: boolean;
    briefing?: boolean;
    greetingTargetId?: string | null;
    cyclePhase?: number;
    cartGrip?: 'push' | 'pull';
    seatFloorOffset?: number;
    seatAmount?: number;
    seatSupport?: number;
    seatX?: number;
    seatZ?: number;
    seatYaw?: number;
    activity?: WorkerMotionState['activity'];
  }>({});
  const actionWeights = useRef<Record<WorkerClipName, number>>(
    Object.fromEntries(
      WORKER_CLIPS.map((clip) => [clip, clip === 'worker-idle' ? 1 : 0])
    ) as Record<WorkerClipName, number>
  );

  const prepared = useMemo(() => {
    const model = cloneSkeleton(scene) as THREE.Group;
    const skeletons = shareWorkerSkin(model);
    model.updateMatrixWorld(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    const skinned: THREE.Mesh[] = [];
    const gloveSources: THREE.SkinnedMesh[] = [];
    const footwearSources: { mesh: THREE.SkinnedMesh; kind: 'boot' | 'shoe' }[] = [];
    const clothSources: { mesh: THREE.SkinnedMesh; region: WorkerSurface }[] = [];
    const cuffSources: { mesh: THREE.SkinnedMesh; original: THREE.BufferGeometry }[] = [];
    const ankleSources: { mesh: THREE.SkinnedMesh; original: THREE.BufferGeometry }[] = [];
    const ownedGeometry: THREE.BufferGeometry[] = [];
    const headSkins: THREE.SkinnedMesh[] = [];
    const scalpDonors: { mesh: THREE.SkinnedMesh; brows: THREE.BufferGeometry }[] = [];
    let civilianHairAllowed = true;

    _bindBox.makeEmpty();

    model.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Boots contribute nothing to a silhouette shadow at ~5 cm shadow-map
      // texel density; the contact patch under the worker replaces them.
      const isFeet = (mesh.parent?.name ?? '').includes('Worker_Feet');
      mesh.castShadow = !isFeet;
      mesh.receiveShadow = true;
      skinned.push(mesh);

      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (geometry.boundingBox) _bindBox.union(_box.copy(geometry.boundingBox));

      const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      // glTFLoader splits multi-material nodes into generated Cube* primitives,
      // so the authored node name is the only remaining region cue.
      const nodeName = mesh.parent?.name ?? mesh.name;
      const built = sources.map((sourceMaterial) => {
        const surface = resolveSurface(appearance.bodyType, sourceMaterial.name, nodeName);
        if (!surface) return sourceMaterial as THREE.MeshStandardMaterial;
        const material = createSurfaceMaterial(sourceMaterial, surface, appearance);
        material.name = `${sourceMaterial.name}-${appearance.bodyType}`;
        materials.push(material);
        if (surface === 'hardHat' && !appearance.hasHardHat) material.visible = false;
        return material;
      });
      mesh.material = Array.isArray(mesh.material) ? built : built[0];
      const region =
        sources.length === 1
          ? resolveSurface(appearance.bodyType, sources[0].name, nodeName)
          : null;
      if (
        isFeet &&
        (mesh as THREE.SkinnedMesh).isSkinnedMesh &&
        (region === 'bootUpper' || region === 'boot')
      )
        footwearSources.push({
          mesh: mesh as THREE.SkinnedMesh,
          kind: region === 'boot' ? 'shoe' : 'boot',
        });
      if (
        region === 'hair' &&
        nodeName.includes('Worker_Head') &&
        (sources[0].name === 'Eyebrows' || sources[0].name === 'DarkBrown')
      ) {
        const head = model.getObjectByName('Head');
        const brows = head ? retainWorkerBrows(mesh, head, appearance.hasHardHat) : null;
        if (brows) {
          if (!appearance.hasHardHat && (mesh as THREE.SkinnedMesh).isSkinnedMesh)
            scalpDonors.push({ mesh: mesh as THREE.SkinnedMesh, brows });
          else {
            mesh.geometry = brows;
            ownedGeometry.push(brows);
          }
        }
      }
      if (
        !appearance.hasHardHat &&
        region === 'skin' &&
        nodeName.includes('Worker_Head') &&
        (mesh as THREE.SkinnedMesh).isSkinnedMesh
      )
        headSkins.push(mesh as THREE.SkinnedMesh);
      if (
        region &&
        ['shirt', 'hiVis', 'hiVisStrap'].includes(region) &&
        (mesh as THREE.SkinnedMesh).isSkinnedMesh
      )
        clothSources.push({ mesh: mesh as THREE.SkinnedMesh, region });
      if (
        region &&
        ['skin', 'shirt', 'hiVis', 'hiVisStrap', 'denim', 'denimDark'].includes(region)
      ) {
        const armJoints: number[] = [];
        if (
          region === 'skin' &&
          nodeName === 'Worker_Body' &&
          (mesh as THREE.SkinnedMesh).isSkinnedMesh
        )
          (mesh as THREE.SkinnedMesh).skeleton.bones.forEach((bone, index) => {
            if (/^(UpperArm|LowerArm)[LR]$/.test(bone.name)) armJoints.push(index);
          });
        const softened = softenSharedWorkerGeometry(mesh.geometry, armJoints);
        if (softened) {
          mesh.geometry = softened;
          ownedGeometry.push(softened);
          if (armJoints.length) mesh.userData.workerSoftArms = true;
          if (nodeName.includes('Worker_Head') && region === 'skin') {
            mesh.userData.workerSoftFace = true;
            const head = model.getObjectByName('Head');
            const colours = head ? createWorkerFaceColours(mesh, head, appearance.bodyType) : null;
            if (colours) {
              softened.setAttribute('color', colours);
              (mesh.material as THREE.MeshStandardMaterial).vertexColors = true;
            }
          }
        }
      }
      if (appearance.bodyType === 'feminine' && (mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        if (region === 'denim' && nodeName === 'Worker_Legs')
          cuffSources.push({ mesh: mesh as THREE.SkinnedMesh, original: geometry });
        if (region === 'skin' && nodeName === 'Worker_Feet')
          ankleSources.push({ mesh: mesh as THREE.SkinnedMesh, original: geometry });
      }
      if (
        appearance.hasGloves &&
        (mesh as THREE.SkinnedMesh).isSkinnedMesh &&
        nodeName.includes('Worker_Body') &&
        sources.length === 1 &&
        sources[0].name === 'Skin'
      )
        gloveSources.push(mesh as THREE.SkinnedMesh);
    });

    // Recess the closed trouser undersides around the real ankles before the
    // distant body is copied. Feet, rig and authored outer cloth stay unchanged.
    if (cuffSources.length === 1 && ankleSources.length === 1) {
      const cuff = cuffSources[0],
        ankle = ankleSources[0];
      const geometry = createSharedWorkerCuffSockets(
        cuff.mesh,
        ankle.mesh,
        cuff.original,
        ankle.original
      );
      if (geometry) {
        cuff.mesh.geometry = geometry;
        ownedGeometry.push(geometry);
        if (geometry.boundingBox) _bindBox.union(geometry.boundingBox);
      }
    }

    // Finish the original face first, then append only its complementary scalp.
    // Working if the softened/coloured face prefix stays exact, and an unfamiliar
    // donor retains its original scalp rather than becoming an open head.
    if (scalpDonors.length) {
      const head = model.getObjectByName('Head');
      const closed =
        head && scalpDonors.length === 1 && headSkins.length === 1
          ? createWorkerHeadClosure(headSkins[0], scalpDonors[0].mesh, head)
          : null;
      civilianHairAllowed = !!closed;
      if (closed) {
        headSkins[0].geometry = closed;
        ownedGeometry.push(closed);
        scalpDonors[0].mesh.geometry = scalpDonors[0].brows;
        ownedGeometry.push(scalpDonors[0].brows);
      } else scalpDonors.forEach(({ brows }) => brows.dispose());
    }

    // Colour the original skin rather than splitting triangles into jagged
    // material islands. This expresses the existing flag, with no extra draw,
    // separate skeleton, mesh, surface shader or safety-policy change.
    for (const source of gloveSources) {
      const material = source.material as THREE.MeshStandardMaterial;
      const dressed = dressWorkerHands(
        source.geometry,
        source.skeleton,
        material.color,
        new THREE.Color(appearance.hasLabCoat ? '#e6e8df' : '#435365')
      );
      if (!dressed) continue;
      source.geometry = dressed;
      source.userData.workerGloves = true;
      ownedGeometry.push(dressed);
      material.vertexColors = true;
      material.needsUpdate = true;
    }

    // Tailor the existing civilian clothes and laboratory coat body. Other PPE
    // keeps its original shape; the coat retains the original protected hands.
    // Build the complete fitting before assigning either private garment buffer.
    // Working if the original body buffers/skin and near/far draw counts survive.
    if ((!appearance.hasHardHat && !appearance.hasVest) || appearance.hasLabCoat) {
      const tailored = clothSources
        .filter(({ region }) => region === 'hiVis' || region === 'shirt')
        .map(({ mesh, region }) => ({
          mesh,
          geometry: createWorkerShirtTrim(mesh, region === 'hiVis' ? 'collar' : 'shirt'),
        }));
      const complete = tailored.length === 2 && tailored.every(({ geometry }) => geometry);
      for (const { mesh, geometry } of tailored) {
        if (!geometry) continue;
        if (!complete) {
          geometry.dispose();
          continue;
        }
        mesh.geometry = geometry;
        mesh.userData.workerTailoredCloth = geometry.userData.workerTailoring;
        ownedGeometry.push(geometry);
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.vertexColors = true;
        material.needsUpdate = true;
        _bindBox.union(geometry.boundingBox!);
      }
    }

    const apron = appearance.workAction === 'bake' ? createBakerApron(model) : null;
    if (apron) {
      ownedGeometry.push(apron.geometry);
      materials.push(apron.material);
      skinned.push(apron);
      if (apron.geometry.boundingBox) _bindBox.union(apron.geometry.boundingBox);
    }

    const coat = appearance.hasLabCoat ? createWorkerLabCoat(model) : null;
    if (coat) {
      ownedGeometry.push(coat.geometry);
      materials.push(coat.material);
      skinned.push(coat);
      if (coat.geometry.boundingBox) _bindBox.union(coat.geometry.boundingBox);
    }

    // One conservative bind-pose volume shared by every primitive: all meshes
    // live in the same armature space, so a single character-sized sphere is
    // both correct and generous. Recompute-then-inflate (never scale in place)
    // so a remount cannot compound the margin.
    _bindBox.getCenter(_center);
    const radius = _bindBox.isEmpty() ? 1.6 : _center.distanceTo(_bindBox.max) + POSE_BOUNDS_MARGIN;
    for (const mesh of skinned) {
      // SkinnedMesh culling prefers `object.boundingSphere` and would otherwise
      // derive one from whatever pose happened to be current on first cull.
      (mesh as THREE.SkinnedMesh).boundingSphere = new THREE.Sphere(_center.clone(), radius);
      mesh.frustumCulled = true;
    }

    // Uniform armature scale. Stride length scales with it, so the clip's world
    // ground speed does too; reading it here keeps the constants valid if the
    // asset is ever re-exported at a different scale.
    const armatureScale = model.getObjectByName('CharacterArmature')?.scale.x ?? 1;
    const rigScale = Number.isFinite(armatureScale) && armatureScale > 0 ? armatureScale : 1;

    const eyeBlink = createWorkerEyeBlink(model, appearance.bodyType);
    const faceExpression = createWorkerFaceExpression(
      model,
      appearance.bodyType,
      appearance.skinTone
    );
    const bodyLod = createWorkerBodyLod(model);
    // Copy the original far skin first. Fitted near shoes stay in their existing
    // draw, preserving the exact distant geometry and contact-box inputs.
    for (const { mesh, kind } of footwearSources) {
      const geometry = createWorkerFootwear(mesh, kind);
      if (!geometry) continue;
      mesh.geometry = geometry;
      (mesh.material as THREE.MeshStandardMaterial).vertexColors = true;
      ownedGeometry.push(geometry);
    }
    // Far copies keep the neutral fitted cloth. Only the existing private near
    // garments receive follow-through; no extra mesh, clock or palette upload.
    const garments = [apron, coat].flatMap((mesh) => {
      const garment = mesh && createWorkerGarmentMotion(mesh);
      return garment ? [garment] : [];
    });
    const style =
      !appearance.hasHardHat && civilianHairAllowed
        ? WORKER_HAIR_GEOMETRIES[appearance.hairStyle]
        : null;
    const hair = style
      ? {
          motion: createWorkerHairMotion(style),
          material: createWorkerHairMaterial(appearance.hairColor),
        }
      : null;
    if (hair) {
      materials.push(hair.material);
    }
    return {
      model,
      materials,
      ownedGeometry,
      rigScale,
      skeletons,
      bodyLod,
      garments,
      eyeBlink,
      faceExpression,
      hair,
    };
  }, [appearance, scene]);

  const accessoryMaterials = useMemo(() => createAccessoryMaterials(appearance), [appearance]);
  const mixer = useMemo(() => new THREE.AnimationMixer(prepared.model), [prepared.model]);
  const handPose = useMemo(
    () => createWorkerHandPose(prepared.model, animations),
    [prepared.model, animations]
  );
  const seatedPose = useMemo(
    () =>
      createSeatedWorkerPose(
        prepared.model,
        appearance.heightScale,
        appearance.bodyScale,
        animations.find((clip) => clip.name === 'worker-break'),
        appearance.tool
      ),
    [prepared.model, appearance.heightScale, appearance.bodyScale, appearance.tool, animations]
  );

  useEffect(() => {
    const actions: Partial<Record<WorkerClipName, THREE.AnimationAction>> = {};
    const speed = Number.isFinite(motion.groundSpeed) ? Math.max(0, motion.groundSpeed) : 0;
    const moving =
      (speed > 0.05 || motion.activity === 'walking') && !motion.seated && !motion.cycling;
    const initialScale = prepared.rigScale * appearance.bodyScale;
    const initialClip: WorkerClipName = moving
      ? workerGaitRates(
          speed,
          CLIP_GROUND_SPEED[appearance.bodyType].walk * initialScale,
          CLIP_GROUND_SPEED[appearance.bodyType].run * initialScale,
          motion.gaitScale
        ).clip
      : motion.seated ||
          motion.cycling ||
          motion.activity === 'break' ||
          standingBriefing(motion, moving)
        ? 'worker-break'
        : motion.activity === 'working'
          ? TASK_CLIPS[appearance.workAction]
          : 'worker-idle';
    dutyWeight.current =
      motion.activity === 'working' &&
      !moving &&
      !motion.seated &&
      !motion.cycling &&
      !motion.cartGrip
        ? 1
        : 0;
    for (const clipName of WORKER_CLIPS) {
      const clip = animations.find((candidate) => candidate.name === clipName);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.reset().setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY).play();
      const phase = Number.isFinite(motion.phase) ? motion.phase : 0;
      const normalizedPhase = ((phase % (Math.PI * 2)) / (Math.PI * 2) + 1) % 1;
      action.time = clip.duration * normalizedPhase;
      action.setEffectiveWeight(clipName === initialClip ? 1 : 0);
      actions[clipName] = action;
      actionWeights.current[clipName] = clipName === initialClip ? 1 : 0;
    }
    actionsRef.current = actions;
    lastPose.current = {};
    mixer.update(0);
    if (motion.cycling) seatedPose.applyCycling(motion.cyclePhase ?? 0);
    else if (
      validWorkerSeatCue(motion.seat) &&
      !motion.cartGrip &&
      (motion.seated || motion.activity === 'walking')
    )
      seatedPose.applySeat(motion.seat, motion.seatFloorOffset ?? 0);
    else if (motion.seated) seatedPose.apply(motion.seatFloorOffset ?? 0);
    else if (motion.cartGrip) seatedPose.applyTask(motion.cartGrip);
    else if (motion.activity === 'working' && !moving && appearance.workAction === 'garden')
      seatedPose.applyGarden(true, undefined, 0, true);
    else if (motion.activity === 'working' && !moving)
      seatedPose.applyDuty(appearance.workAction, gesture, 1);
    else if (moving) seatedPose.applyWalkingLook(gesture);
    else seatedPose.applyIdle(gesture);
    handPose.apply(motion, appearance.tool, gesture);
    if (toolRef.current)
      toolRef.current.visible =
        !moving &&
        !motion.cartGrip &&
        !motion.seated &&
        !motion.cycling &&
        motion.activity === 'working';

    return () => {
      handPose.restore();
      seatedPose.restore();
      actionsRef.current = {};
      mixer.stopAllAction();
      mixer.uncacheRoot(prepared.model);
    };
  }, [
    animations,
    mixer,
    prepared.model,
    motion,
    seatedPose,
    handPose,
    gesture,
    appearance.workAction,
    appearance.tool,
    appearance.bodyType,
    appearance.bodyScale,
    prepared.rigScale,
  ]);

  useEffect(
    () => () => {
      prepared.bodyLod?.dispose();
      prepared.eyeBlink.dispose();
      prepared.faceExpression.dispose();
      prepared.hair?.motion.dispose();
      prepared.ownedGeometry.forEach((geometry) => geometry.dispose());
      prepared.materials.forEach((material) => material.dispose());
      prepared.skeletons.forEach((skeleton) => skeleton.dispose());
      // Only the individual accent is owned here; fixed fittings are shared.
      accessoryMaterials.accent.dispose();
    },
    [accessoryMaterials, prepared]
  );

  useFrame((state, delta) => {
    // Camera changes must update the body draw LOD even while the simulation
    // is paused or a distant animation sample is being throttled.
    if (state.camera) {
      prepared.bodyLod?.update(state.camera);
      if (faceRef.current) {
        prepared.model.getWorldPosition(_center);
        const wasVisible = faceRef.current.visible;
        faceRef.current.visible = state.camera.position.distanceToSquared(_center) < 18 * 18;
        // A paused hidden worker may have resolved a new semantic pose. Reveal
        // its real skin attachment without advancing any expression clock.
        if (!wasVisible && faceRef.current.visible) prepared.faceExpression.refreshAttachment();
      }
    }
    let safeDelta =
      motion.enabled && Number.isFinite(delta) ? THREE.MathUtils.clamp(delta, 0, 0.075) : 0;
    const speed = Number.isFinite(motion.groundSpeed) ? Math.max(0, motion.groundSpeed) : 0;
    const clipSpeed = CLIP_GROUND_SPEED[appearance.bodyType];
    const scale = prepared.rigScale * appearance.bodyScale;
    const moving =
      (speed > 0.05 || motion.activity === 'walking') && !motion.seated && !motion.cycling;
    const previousLocomotion =
      lastPose.current.clip === 'worker-run' || lastPose.current.clip === 'worker-walk'
        ? lastPose.current.clip
        : undefined;
    const briefing = standingBriefing(motion, moving);
    const gait = workerGaitRates(
      speed,
      clipSpeed.walk * scale,
      clipSpeed.run * scale,
      motion.gaitScale,
      previousLocomotion
    );
    const activeClip: WorkerClipName = moving
      ? !motion.enabled && previousLocomotion
        ? previousLocomotion
        : gait.clip
      : motion.seated || motion.cycling || motion.activity === 'break' || briefing
        ? 'worker-break'
        : motion.activity === 'working'
          ? TASK_CLIPS[appearance.workAction]
          : 'worker-idle';

    const seat =
      validWorkerSeatCue(motion.seat) &&
      !motion.cycling &&
      !motion.cartGrip &&
      (motion.seated || motion.activity === 'walking')
        ? motion.seat
        : undefined;
    const seatChanged =
      lastPose.current.seatAmount !== seat?.amount ||
      lastPose.current.seatSupport !== seat?.support ||
      lastPose.current.seatX !== seat?.x ||
      lastPose.current.seatZ !== seat?.z ||
      lastPose.current.seatYaw !== seat?.yaw;
    const semanticChanged =
      seatChanged ||
      lastPose.current.clip !== activeClip ||
      lastPose.current.seated !== motion.seated ||
      lastPose.current.cycling !== motion.cycling ||
      lastPose.current.greeting !== motion.greeting ||
      lastPose.current.briefing !== briefing ||
      lastPose.current.greetingTargetId !== motion.greetingTargetId ||
      lastPose.current.cartGrip !== motion.cartGrip ||
      lastPose.current.seatFloorOffset !== motion.seatFloorOffset ||
      lastPose.current.activity !== motion.activity;
    const poseChanged =
      semanticChanged || (motion.cycling && lastPose.current.cyclePhase !== motion.cyclePhase);
    if (!motion.enabled && !poseChanged) {
      pendingDelta.current = 0;
      return;
    }
    if (motion.enabled) {
      pendingDelta.current += safeDelta;
      const interval = Number.isFinite(motion.animationInterval)
        ? THREE.MathUtils.clamp(motion.animationInterval ?? 0, 0, 1 / 15)
        : 0;
      // Pedals update every frame, so their rider must use the identical phase.
      if (!semanticChanged && !motion.cycling && pendingDelta.current + 1e-6 < interval) return;
      safeDelta = pendingDelta.current;
    }
    pendingDelta.current = 0;
    gestureTime.current += safeDelta;
    prepared.hair?.motion.apply(
      gestureTime.current,
      safeDelta,
      speed,
      motion.seated || motion.activity === 'break'
    );
    sampleWorkerGesture(
      motion.seated
        ? 'rest'
        : briefing
          ? 'briefing'
          : motion.activity === 'working'
            ? appearance.workAction
            : 'idle',
      gestureTime.current,
      sampledGesture
    );
    if (lastPose.current.greetingTargetId !== motion.greetingTargetId) greetingElapsed.current = 0;
    const greetingActive =
      !briefing && motion.greeting && motion.activity === 'idle' && !motion.seated;
    if (greetingActive) {
      greetingElapsed.current += safeDelta;
      sampleWorkerGreeting(greetingElapsed.current, sampledGesture);
    }
    greetingYaw.current = THREE.MathUtils.damp(
      greetingYaw.current,
      greetingActive ? (motion.greetingYaw ?? 0) : 0,
      7,
      safeDelta
    );
    if (motion.activity === 'idle' && !briefing)
      sampledGesture.lookYaw = greetingActive
        ? greetingYaw.current
        : sampledGesture.lookYaw + greetingYaw.current;
    attentionYaw.current = THREE.MathUtils.damp(
      attentionYaw.current,
      Number.isFinite(motion.attentionYaw)
        ? THREE.MathUtils.clamp(
            motion.attentionYaw ?? 0,
            moving ? -0.6 : -0.26,
            moving ? 0.6 : 0.26
          )
        : 0,
      7,
      safeDelta
    );
    if (motion.activity === 'idle' && !motion.seated && !greetingActive && !briefing)
      sampledGesture.lookYaw += attentionYaw.current;
    // Walking uses the same admitted attention channel. Only the existing head
    // overlay consumes it; authored torso, limbs, cadence and foot contacts stay exact.
    // Working if people acknowledge their route turn without steering their gait.
    if (moving && !motion.cartGrip && !seat) sampledGesture.lookYaw += attentionYaw.current;
    easeWorkerGesture(gesture, sampledGesture, safeDelta, !motion.enabled);
    // Facial detail is omitted at the existing near-face cutoff. Far body LOD
    // retains the open-eye bind shape; it never needs a third body draw.
    const blink = faceRef.current?.visible === false ? 0 : sampleWorkerBlink(gestureTime.current);
    prepared.eyeBlink.apply(blink);
    if (faceRef.current?.visible === false) gaze.horizontal = gaze.vertical = 0;
    else if (motion.enabled) sampleWorkerGaze(sampledGesture, gesture, safeDelta, gaze);
    if (pupilRef.current?.isInstancedMesh)
      setWorkerPupilPose(pupilRef.current, blink, gaze.horizontal, gaze.vertical);
    lastPose.current = {
      clip: activeClip,
      seated: motion.seated,
      cycling: motion.cycling,
      greeting: motion.greeting,
      briefing,
      greetingTargetId: motion.greetingTargetId,
      cyclePhase: motion.cyclePhase,
      cartGrip: motion.cartGrip,
      seatFloorOffset: motion.seatFloorOffset,
      seatAmount: seat?.amount,
      seatSupport: seat?.support,
      seatX: seat?.x,
      seatZ: seat?.z,
      seatYaw: seat?.yaw,
      activity: motion.activity,
    };

    // Restore overlays before the mixer samples its authored joints.
    handPose.restore();
    seatedPose.restore();
    const ordinaryDuty =
      !motion.seated &&
      !motion.cycling &&
      !motion.cartGrip &&
      !seat &&
      appearance.workAction !== 'garden' &&
      appearance.workAction !== 'none';
    const dutyClip = TASK_CLIPS[appearance.workAction];
    const dutyHandover =
      ordinaryDuty &&
      appearance.workAction !== 'bake' &&
      (activeClip === dutyClip || actionWeights.current[dutyClip] > 0.00001);
    for (const clipName of WORKER_CLIPS) {
      const action = actionsRef.current[clipName];
      if (!action) continue;
      const weight = motion.enabled
        ? THREE.MathUtils.damp(
            actionWeights.current[clipName],
            clipName === activeClip ? 1 : 0,
            // A short, softer handover gives the planted duty stance time to
            // meet the moving foot. Settled clips and stride cadence stay exact.
            dutyHandover ? 8 : 11,
            safeDelta
          )
        : clipName === activeClip
          ? 1
          : 0;
      actionWeights.current[clipName] = weight;
      action.setEffectiveWeight(weight);
    }
    const walk = actionsRef.current['worker-walk'];
    const run = actionsRef.current['worker-run'];
    if (walk) walk.timeScale = gait.walk;
    if (run) run.timeScale = gait.run;
    mixer.update(safeDelta);
    const strideAction = actionsRef.current[activeClip];
    const stridePhase = strideAction
      ? (strideAction.time * Math.PI * 2) / Math.max(strideAction.getClip().duration, 0.001)
      : 0;
    for (const garment of prepared.garments)
      if (garment.mesh.visible)
        garment.apply(
          safeDelta,
          speed,
          stridePhase,
          !moving || motion.seated || motion.cycling || !!motion.cartGrip
        );
    const dutyTarget = ordinaryDuty && motion.activity === 'working' && !moving ? 1 : 0;
    dutyWeight.current = !ordinaryDuty
      ? 0
      : motion.enabled
        ? THREE.MathUtils.damp(dutyWeight.current, dutyTarget, 4.5, safeDelta)
        : dutyTarget;
    const dutyAmount = THREE.MathUtils.smoothstep(dutyWeight.current, 0.002, 0.98);
    const stationaryGarden =
      appearance.workAction === 'garden' &&
      !moving &&
      !motion.seated &&
      !motion.cycling &&
      !motion.cartGrip &&
      (motion.activity === 'working' || motion.activity === 'idle');
    if (!stationaryGarden) seatedPose.releaseGarden();
    if (motion.cycling) seatedPose.applyCycling(motion.cyclePhase ?? 0);
    else if (seat) seatedPose.applySeat(seat, motion.seatFloorOffset ?? 0, gesture);
    else if (motion.seated) seatedPose.apply(motion.seatFloorOffset ?? 0, gesture);
    else if (motion.cartGrip) seatedPose.applyTask(motion.cartGrip);
    else if (
      stationaryGarden &&
      seatedPose.applyGarden(motion.activity === 'working', gesture, safeDelta, !motion.enabled)
    ) {
      // Contact-aware garden overlay already applied; fingers follow below.
    } else if (ordinaryDuty && (motion.activity === 'working' || dutyAmount > 0))
      seatedPose.applyDuty(appearance.workAction, gesture, dutyAmount, moving);
    else if (motion.activity === 'walking') seatedPose.applyWalkingLook(gesture);
    else if (motion.activity === 'idle' || motion.activity === 'break')
      seatedPose.applyIdle(gesture);
    // Neutral standing and the walk have independent Foot tracks too. Reuse
    // the existing anatomical closure for this handover, preserving both foot
    // targets and pure-clip endpoints. Seated/coupled and special bake/garden
    // poses keep their own contact solvers.
    const dutyMix = actionWeights.current[dutyClip];
    const neutralMix = actionWeights.current['worker-break'];
    const closureMix = dutyMix > 0.00001 && dutyMix < 0.99999 ? dutyMix : neutralMix;
    if (
      ordinaryDuty &&
      appearance.workAction !== 'bake' &&
      closureMix > 0.00001 &&
      closureMix < 0.99999
    )
      seatedPose.closeDutyTransition(closureMix);
    handPose.apply(motion, appearance.tool, gesture, safeDelta);
    // Mixed Head/Neck weights require the final admitted pose, even when the
    // expression envelope is unchanged. Never sample the previous mixer frame.
    prepared.faceExpression.apply(
      faceRef.current?.visible === false ? 0 : gesture.greetingLift,
      faceRef.current?.visible !== false
    );
    if (toolRef.current) {
      const heldTask =
        motion.activity === 'working' &&
        (appearance.workAction === 'bake' || appearance.workAction === 'garden');
      toolRef.current.position.set(0, heldTask ? gesture.toolY : 0, heldTask ? gesture.toolZ : 0);
    }
    if (toolRef.current)
      toolRef.current.visible =
        !motion.seated &&
        !motion.cycling &&
        motion.activity === 'working' &&
        !moving &&
        (appearance.workAction === 'garden' ? seatedPose.gardenGripReady() : dutyAmount === 1);
  });

  return (
    <group
      name="authored-worker"
      dispose={null}
      scale={[appearance.bodyScale, appearance.heightScale, appearance.bodyScale]}
    >
      <primitive object={prepared.model} />
      <WorkerAccessories
        hair={prepared.hair}
        appearance={appearance}
        model={prepared.model}
        materials={accessoryMaterials}
        toolRef={toolRef}
        faceRef={faceRef}
        pupilRef={pupilRef}
        eyeSurfaces={prepared.eyeBlink.surfaces}
        mouth={prepared.faceExpression.mouth}
      />
    </group>
  );
};

export default WorkerModel;
