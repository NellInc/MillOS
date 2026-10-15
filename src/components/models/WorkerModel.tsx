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
import type { WorkerAppearance, WorkerBodyType, WorkerWorkAction } from '../workers/workerTypes';
import { ToolAccessory } from '../workers/WorkerTools';
import {
  SHARED_WORKER_GEOMETRY,
  WORKER_EYE_CENTRES,
  WORKER_HAIR_GEOMETRIES,
  createWorkerHairMotion,
  createWorkerApronGeometry,
} from '../workers/SharedWorkerGeometries';
import {
  SHARED_WORKER_ACCESSORY_MATERIALS,
  SHARED_WORKER_MATERIALS,
} from '../workers/SharedWorkerMaterials';
import { createWorkerBodyLod } from '../workers/workerBodyLod';
import type { WorkerMotionState } from '../workers/workerTypes';
import {
  createSeatedWorkerPose,
  createWorkerHandPose,
  createWorkerGesture,
  easeWorkerGesture,
  createWorkerEyeBlink,
  sampleWorkerBlink,
  sampleWorkerGesture,
  sampleWorkerGreeting,
} from '../workers/workerPose';
export type { WorkerAppearance, WorkerMotionState } from '../workers/workerTypes';

const WORKER_ASSET_PATHS = {
  masculine: `${import.meta.env.BASE_URL}models/worker/worker-masculine.glb`,
  feminine: `${import.meta.env.BASE_URL}models/worker/worker-feminine.glb`,
};

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
 * Working if faces lose harsh shading seams while sharp ridges and deformation stay exact.
 */
export function softenWorkerFaceNormals(source: THREE.BufferGeometry) {
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
  const values = new Float32Array(normal.count * 3);
  const original = new THREE.Vector3(),
    candidate = new THREE.Vector3(),
    sum = new THREE.Vector3();
  for (const group of groups.values())
    for (const i of group) {
      original.fromBufferAttribute(normal, i).normalize();
      sum.set(0, 0, 0);
      for (const j of group) {
        candidate.fromBufferAttribute(normal, j).normalize();
        if (original.dot(candidate) >= Math.SQRT1_2) sum.add(candidate);
      }
      sum.normalize();
      original
        .lerp(sum, 0.65)
        .normalize()
        .toArray(values, i * 3);
    }
  const geometry = source.clone();
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
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
 * Working if both fittings keep their original rest geometry, bounds and pose in one draw.
 */
export function createWorkerAccessoryPair(
  kind: WorkerAccessoryPairKind,
  material: THREE.Material
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
  [-spec.x, spec.x].forEach((x, index) => {
    transform.position.set(x, 0, spec.z);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return mesh;
}

/** Closure changes the two pupil instances themselves, never their bone mount.
 * The lid occludes pupils as the real inset eye narrows. Working if the pupil
 * centres stay fixed and no floating pupil highlights remain over closed eyes.
 */
export function setWorkerPupilBlink(mesh: THREE.InstancedMesh, amount: number) {
  const closure = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, 1) : 0;
  if ((mesh.userData.workerBlinkClosure ?? 0) === closure) return;
  mesh.userData.workerBlinkClosure = closure;
  const scale = ACCESSORY_PAIRS['eye-pupils'].scale[1] * (1 - closure * 0.92);
  for (let instance = 0; instance < 2; instance++)
    mesh.instanceMatrix.array[instance * 16 + 5] = scale;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.visible = closure < 0.5;
}

const WorkerAccessoryPair: React.FC<{
  kind: WorkerAccessoryPairKind;
  material: THREE.Material;
  meshRef?: React.RefObject<THREE.InstancedMesh | null>;
}> = ({ kind, material, meshRef }) => {
  const mesh = useMemo(() => createWorkerAccessoryPair(kind, material), [kind, material]);
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
      return appearance.hasVest
        ? new THREE.Color(appearance.hatColor)
        : shade(appearance.uniformColor, 0.88);
    case 'hiVis':
      return new THREE.Color(appearance.hasVest ? appearance.accentColor : appearance.uniformColor);
    case 'shirt':
      return new THREE.Color(appearance.hasLabCoat ? '#eef2f4' : appearance.uniformColor);
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
export function retainWorkerBrows(mesh: THREE.Mesh, head: THREE.Object3D) {
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
  geometry.setIndex(indices);
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
}> = ({ appearance, model, materials, toolRef, faceRef, pupilRef, hair }) => {
  const head = model.getObjectByName('Head') ?? null;
  const chest = model.getObjectByName('Chest') ?? null;
  const hips = model.getObjectByName('Hips') ?? null;
  const wrist = model.getObjectByName('WristL') ?? null;
  const isSupervisor = appearance.workAction === 'supervise';
  const eyeCentre = WORKER_EYE_CENTRES[appearance.bodyType];
  return (
    <>
      {hair && (
        <BoneMount bone={head} name="worker-hair-mount">
          <mesh
            name="worker-authored-hair"
            geometry={hair.motion.geometry}
            material={hair.material}
            scale={[appearance.bodyType === 'feminine' ? 0.92 : 1, 1, 1]}
            castShadow
            receiveShadow
            dispose={null}
          />
        </BoneMount>
      )}
      <BoneMount bone={head} name="worker-eye-detail" position={[...eyeCentre]}>
        <group ref={faceRef}>
          <WorkerAccessoryPair
            kind="eye-pupils"
            material={SHARED_WORKER_MATERIALS.pupil}
            meshRef={pupilRef}
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
            rotation={[0, 0, Math.PI / 2]}
            geometry={SHARED_WORKER_GEOMETRY.glassesBridge}
            material={materials.dark}
          />
          <WorkerAccessoryPair kind="glasses-temples" material={materials.dark} />
        </BoneMount>
      )}

      {appearance.hasHearingProtection && (
        <BoneMount bone={head} name="worker-hearing-protection" position={[eyeCentre[0], 0.14, 0]}>
          <WorkerAccessoryPair kind="hearing-cups" material={materials.accent} />
          <mesh
            position={[0, 0.002, 0]}
            geometry={SHARED_WORKER_GEOMETRY.hearingBand}
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
            appearance.tool === 'bread-tray'
              ? [0, 1.09 / appearance.heightScale, 0.28 / appearance.bodyScale]
              : appearance.tool === 'trowel'
                ? [
                    0.12 / appearance.bodyScale,
                    0.326 / appearance.heightScale,
                    0.5205 / appearance.bodyScale,
                  ]
                : [0, 0.035, 0.025]
          }
          rotation={
            appearance.tool === 'trowel'
              ? [0, 0, 0]
              : appearance.tool === 'bread-tray'
                ? [0, 0, 0]
                : [0, Math.PI / 2, 0]
          }
          scale={
            appearance.tool === 'bread-tray' || appearance.tool === 'trowel'
              ? [1 / appearance.bodyScale, 1 / appearance.heightScale, 1 / appearance.bodyScale]
              : [0.88, 0.88, 0.88]
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
  const gestureTime = useRef(Number.isFinite(motion.phase) ? motion.phase : 0);
  const pendingDelta = useRef(0);
  const greetingElapsed = useRef(0);
  const greetingYaw = useRef(0);
  const attentionYaw = useRef(0);
  const lastPose = useRef<{
    clip?: WorkerClipName;
    seated?: boolean;
    cycling?: boolean;
    greeting?: boolean;
    greetingTargetId?: string | null;
    cyclePhase?: number;
    cartGrip?: 'push' | 'pull';
    seatFloorOffset?: number;
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
    const ownedGeometry: THREE.BufferGeometry[] = [];

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
        !appearance.hasHardHat &&
        region === 'hair' &&
        nodeName.includes('Worker_Head') &&
        (sources[0].name === 'Eyebrows' || sources[0].name === 'DarkBrown')
      ) {
        const head = model.getObjectByName('Head');
        const brows = head ? retainWorkerBrows(mesh, head) : null;
        if (brows) {
          mesh.geometry = brows;
          ownedGeometry.push(brows);
        }
      }
      if (
        region &&
        ['skin', 'shirt', 'hiVis', 'hiVisStrap', 'denim', 'denimDark'].includes(region)
      ) {
        const softened = softenWorkerFaceNormals(mesh.geometry);
        if (softened) {
          mesh.geometry = softened;
          ownedGeometry.push(softened);
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
      if (
        appearance.hasGloves &&
        (mesh as THREE.SkinnedMesh).isSkinnedMesh &&
        nodeName.includes('Worker_Body') &&
        sources.length === 1 &&
        sources[0].name === 'Skin'
      )
        gloveSources.push(mesh as THREE.SkinnedMesh);
    });

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

    const apron = appearance.workAction === 'bake' ? createBakerApron(model) : null;
    if (apron) {
      ownedGeometry.push(apron.geometry);
      materials.push(apron.material);
      skinned.push(apron);
      if (apron.geometry.boundingBox) _bindBox.union(apron.geometry.boundingBox);
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
    const bodyLod = createWorkerBodyLod(model);
    const style = !appearance.hasHardHat ? WORKER_HAIR_GEOMETRIES[appearance.hairStyle] : null;
    const hair = style
      ? {
          motion: createWorkerHairMotion(style),
          material: createWorkerHairMaterial(appearance.hairColor),
        }
      : null;
    if (hair) {
      materials.push(hair.material);
    }
    return { model, materials, ownedGeometry, rigScale, skeletons, bodyLod, eyeBlink, hair };
  }, [appearance, scene]);

  const accessoryMaterials = useMemo(() => createAccessoryMaterials(appearance), [appearance]);
  const mixer = useMemo(() => new THREE.AnimationMixer(prepared.model), [prepared.model]);
  const handPose = useMemo(
    () => createWorkerHandPose(prepared.model, animations),
    [prepared.model, animations]
  );
  const seatedPose = useMemo(
    () => createSeatedWorkerPose(prepared.model, appearance.heightScale, appearance.bodyScale),
    [prepared.model, appearance.heightScale, appearance.bodyScale]
  );

  useEffect(() => {
    const actions: Partial<Record<WorkerClipName, THREE.AnimationAction>> = {};
    for (const clipName of WORKER_CLIPS) {
      const clip = animations.find((candidate) => candidate.name === clipName);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      action.reset().setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY).play();
      const phase = Number.isFinite(motion.phase) ? motion.phase : 0;
      const normalizedPhase = ((phase % (Math.PI * 2)) / (Math.PI * 2) + 1) % 1;
      action.time = clip.duration * normalizedPhase;
      action.setEffectiveWeight(
        clipName === (motion.seated || motion.cycling ? 'worker-break' : 'worker-idle') ? 1 : 0
      );
      actions[clipName] = action;
      actionWeights.current[clipName] =
        clipName === (motion.seated || motion.cycling ? 'worker-break' : 'worker-idle') ? 1 : 0;
    }
    actionsRef.current = actions;
    lastPose.current = {};
    mixer.update(0);
    if (motion.cycling) seatedPose.applyCycling(motion.cyclePhase ?? 0);
    else if (motion.seated) seatedPose.apply(motion.seatFloorOffset ?? 0);
    else if (motion.cartGrip) seatedPose.applyTask(motion.cartGrip);
    else if (motion.activity === 'working' && appearance.workAction === 'garden')
      seatedPose.applyGarden(true, undefined, 0, true);
    else if (motion.activity === 'working' && appearance.workAction === 'bake')
      seatedPose.applyTask('bake');
    handPose.apply(motion, appearance.tool, gesture);
    if (toolRef.current)
      toolRef.current.visible = !motion.seated && !motion.cycling && motion.activity === 'working';

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
  ]);

  useEffect(
    () => () => {
      prepared.bodyLod?.dispose();
      prepared.eyeBlink.dispose();
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
        faceRef.current.visible = state.camera.position.distanceToSquared(_center) < 18 * 18;
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
    const activeClip: WorkerClipName = moving
      ? !motion.enabled && previousLocomotion
        ? previousLocomotion
        : selectWorkerLocomotion(speed, clipSpeed.walk * scale, previousLocomotion)
      : motion.seated || motion.cycling || motion.activity === 'break'
        ? 'worker-break'
        : motion.activity === 'working'
          ? TASK_CLIPS[appearance.workAction]
          : 'worker-idle';

    const semanticChanged =
      lastPose.current.clip !== activeClip ||
      lastPose.current.seated !== motion.seated ||
      lastPose.current.cycling !== motion.cycling ||
      lastPose.current.greeting !== motion.greeting ||
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
      motion.seated ? 'rest' : motion.activity === 'working' ? appearance.workAction : 'idle',
      gestureTime.current,
      sampledGesture
    );
    if (lastPose.current.greetingTargetId !== motion.greetingTargetId) greetingElapsed.current = 0;
    const greetingActive = motion.greeting && motion.activity === 'idle' && !motion.seated;
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
    if (motion.activity === 'idle')
      sampledGesture.lookYaw = greetingActive
        ? greetingYaw.current
        : sampledGesture.lookYaw + greetingYaw.current;
    attentionYaw.current = THREE.MathUtils.damp(
      attentionYaw.current,
      Number.isFinite(motion.attentionYaw)
        ? THREE.MathUtils.clamp(motion.attentionYaw ?? 0, -0.26, 0.26)
        : 0,
      7,
      safeDelta
    );
    if (motion.activity === 'idle' && !motion.seated && !greetingActive)
      sampledGesture.lookYaw += attentionYaw.current;
    easeWorkerGesture(gesture, sampledGesture, safeDelta, !motion.enabled);
    // Facial detail is omitted at the existing near-face cutoff. Far body LOD
    // retains the open-eye bind shape; it never needs a third body draw.
    const blink = faceRef.current?.visible === false ? 0 : sampleWorkerBlink(gestureTime.current);
    prepared.eyeBlink.apply(blink);
    if (pupilRef.current?.isInstancedMesh) setWorkerPupilBlink(pupilRef.current, blink);
    lastPose.current = {
      clip: activeClip,
      seated: motion.seated,
      cycling: motion.cycling,
      greeting: motion.greeting,
      greetingTargetId: motion.greetingTargetId,
      cyclePhase: motion.cyclePhase,
      cartGrip: motion.cartGrip,
      seatFloorOffset: motion.seatFloorOffset,
      activity: motion.activity,
    };

    // Restore overlays before the mixer samples its authored joints.
    handPose.restore();
    seatedPose.restore();
    for (const clipName of WORKER_CLIPS) {
      const action = actionsRef.current[clipName];
      if (!action) continue;
      const weight = motion.enabled
        ? THREE.MathUtils.damp(
            actionWeights.current[clipName],
            clipName === activeClip ? 1 : 0,
            11,
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
    if (walk) walk.timeScale = THREE.MathUtils.clamp(speed / (clipSpeed.walk * scale), 0, 1.9);
    if (run) run.timeScale = THREE.MathUtils.clamp(speed / (clipSpeed.run * scale), 0, 2.4);
    mixer.update(safeDelta);
    const stationaryGarden =
      appearance.workAction === 'garden' &&
      !moving &&
      !motion.seated &&
      !motion.cycling &&
      !motion.cartGrip &&
      (motion.activity === 'working' || motion.activity === 'idle');
    if (!stationaryGarden) seatedPose.releaseGarden();
    if (motion.cycling) seatedPose.applyCycling(motion.cyclePhase ?? 0);
    else if (motion.seated) seatedPose.apply(motion.seatFloorOffset ?? 0, gesture);
    else if (motion.cartGrip) seatedPose.applyTask(motion.cartGrip);
    else if (
      stationaryGarden &&
      seatedPose.applyGarden(motion.activity === 'working', gesture, safeDelta, !motion.enabled)
    ) {
      // Contact-aware garden overlay already applied; fingers follow below.
    } else if (motion.activity === 'working' && appearance.workAction === 'bake')
      seatedPose.applyTask('bake', gesture);
    else if (motion.activity === 'working') seatedPose.applyWork(appearance.workAction, gesture);
    else if (motion.activity === 'walking') seatedPose.applyWalkingLook(gesture);
    else if (motion.activity === 'idle' || motion.activity === 'break')
      seatedPose.applyIdle(gesture);
    handPose.apply(motion, appearance.tool, gesture, safeDelta);
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
        (appearance.workAction !== 'garden' || seatedPose.gardenGripReady());
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
      />
    </group>
  );
};

export default WorkerModel;
