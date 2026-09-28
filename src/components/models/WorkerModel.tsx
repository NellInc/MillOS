/**
 * Authored production-worker renderer for MillOS v0.40.
 *
 * The two CC0 Quaternius worker bodies arrive with complete industrial
 * workwear, compatible rigs, and a curated semantic animation set. Runtime
 * material variants carry identity and role cues without duplicating geometry.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { useDracoGLTF } from '../../utils/dracoLoader';
import type { WorkerAppearance, WorkerBodyType, WorkerWorkAction } from '../workers/workerTypes';
import { ToolAccessory } from '../workers/WorkerTools';
import { SHARED_WORKER_GEOMETRY } from '../workers/SharedWorkerGeometries';
import type { WorkerMotionState } from '../workers/workerTypes';
import {
  createSeatedWorkerPose,
  createWorkerGesture,
  sampleWorkerGesture,
} from '../workers/workerPose';
export type { WorkerAppearance, WorkerMotionState } from '../workers/workerTypes';

const WORKER_ASSET_PATHS = {
  masculine: `${import.meta.env.BASE_URL}models/worker/worker-masculine.glb`,
  feminine: `${import.meta.env.BASE_URL}models/worker/worker-feminine.glb`,
};

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

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const EAR_DEFENDER = new THREE.CylinderGeometry(0.038, 0.038, 0.025, 14);
const EAR_DEFENDER_BAND = new THREE.TorusGeometry(0.104, 0.008, 6, 18, Math.PI);
const SUPERVISOR_CABLE = new THREE.TorusGeometry(0.065, 0.005, 6, 18, Math.PI * 1.25);
const SUPERVISOR_RADIO_KNOB = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10);

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
    glasses: new THREE.MeshPhysicalMaterial({
      color: '#c6e6f5',
      roughness: 0.12,
      metalness: 0,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: '#20272d',
      roughness: 0.7,
      metalness: 0.08,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: appearance.accentColor,
      roughness: 0.62,
      metalness: 0.06,
    }),
    badge: new THREE.MeshStandardMaterial({
      color: '#f4f7f8',
      roughness: 0.48,
      metalness: 0.02,
    }),
    // Retroreflective banding. The read comes from a very tight sheen lobe plus
    // an elevated environment contribution, not from an emissive cheat: at
    // 0.10 this stays below the 1.0 linear threshold that only behaves inside
    // the composer, so it looks the same on the 'low' tier where none exists.
    reflective: new THREE.MeshPhysicalMaterial({
      color: '#f2f7ea',
      emissive: '#cfe0d4',
      emissiveIntensity: 0.1,
      roughness: 0.26,
      metalness: 0,
      sheen: 1,
      sheenColor: new THREE.Color('#ffffff'),
      sheenRoughness: 0.12,
      envMapIntensity: 2.4,
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
    case 'hiVisStrap':
      return new THREE.Color(appearance.hatColor);
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
  const profile = SURFACE_PROFILES[surface];
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

const WorkerAccessories: React.FC<{
  appearance: WorkerAppearance;
  model: THREE.Group;
  materials: AccessoryMaterials;
  toolRef: React.RefObject<THREE.Group | null>;
}> = ({ appearance, model, materials, toolRef }) => {
  const head = model.getObjectByName('Head') ?? null;
  const chest = model.getObjectByName('Chest') ?? null;
  const hips = model.getObjectByName('Hips') ?? null;
  const wrist = model.getObjectByName('WristL') ?? null;
  const isSupervisor = appearance.workAction === 'supervise';
  return (
    <>
      {appearance.hasSafetyGlasses && (
        <BoneMount bone={head} name="worker-safety-glasses" position={[0, 0.055, 0.12]}>
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
          {[-0.084, 0.084].map((x) => (
            <mesh
              key={`temple-${x}`}
              position={[x, 0, -0.052]}
              geometry={UNIT_BOX}
              material={materials.dark}
              scale={[0.008, 0.008, 0.112]}
            />
          ))}
        </BoneMount>
      )}

      {appearance.hasHearingProtection && (
        <BoneMount bone={head} name="worker-hearing-protection" position={[0, 0.055, 0]}>
          {[-0.104, 0.104].map((x) => (
            <mesh
              key={x}
              position={[x, 0, 0]}
              rotation={[0, 0, Math.PI / 2]}
              geometry={EAR_DEFENDER}
              material={materials.accent}
            />
          ))}
          <mesh position={[0, 0.002, 0]} geometry={EAR_DEFENDER_BAND} material={materials.dark} />
        </BoneMount>
      )}

      <BoneMount bone={chest} name="worker-identity-badge" position={[0.105, 0.018, 0.142]}>
        <mesh geometry={UNIT_BOX} material={materials.badge} scale={[0.062, 0.082, 0.009]} />
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
            <mesh geometry={UNIT_BOX} material={materials.dark} scale={[0.052, 0.082, 0.026]} />
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
            {[-0.078, 0.078].map((x) => (
              <mesh
                key={x}
                position={[x, 0, 0]}
                geometry={UNIT_BOX}
                material={materials.reflective}
                scale={[0.018, 0.135, 0.008]}
              />
            ))}
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
            position={[0, 0.012, -0.035]}
            geometry={UNIT_BOX}
            material={materials.dark}
            scale={[0.32, 0.026, 0.032]}
          />
          {[-0.14, 0.14].map((x) => (
            <mesh
              key={x}
              position={[x, 0, 0]}
              geometry={UNIT_BOX}
              material={materials.dark}
              scale={[0.075, 0.105, 0.045]}
            />
          ))}
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

export const WorkerModel: React.FC<WorkerModelProps> = ({ appearance, motion }) => {
  const modelPath =
    appearance.bodyType === 'feminine' ? WORKER_ASSET_PATHS.feminine : WORKER_ASSET_PATHS.masculine;
  // The normalized v0.40 worker bodies use KHR_draco_mesh_compression. Keep
  // the decoder explicit here so a cold load never depends on another model
  // having configured Drei's shared GLTFLoader first.
  const { scene, animations } = useDracoGLTF(modelPath);
  const actionsRef = useRef<Partial<Record<WorkerClipName, THREE.AnimationAction>>>({});
  const toolRef = useRef<THREE.Group>(null);
  const gesture = useMemo(createWorkerGesture, []);
  const gestureTime = useRef(Number.isFinite(motion.phase) ? motion.phase : 0);
  const pendingDelta = useRef(0);
  const lastPose = useRef<{
    clip?: WorkerClipName;
    seated?: boolean;
    cycling?: boolean;
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
    const materials: THREE.MeshStandardMaterial[] = [];
    const skinned: THREE.Mesh[] = [];

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
    });

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

    return { model, materials, rigScale };
  }, [appearance, scene]);

  const accessoryMaterials = useMemo(() => createAccessoryMaterials(appearance), [appearance]);
  const mixer = useMemo(() => new THREE.AnimationMixer(prepared.model), [prepared.model]);
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
    else if (
      motion.activity === 'working' &&
      (appearance.workAction === 'bake' || appearance.workAction === 'garden')
    )
      seatedPose.applyTask(appearance.workAction);
    if (toolRef.current)
      toolRef.current.visible = !motion.seated && !motion.cycling && motion.activity === 'working';

    return () => {
      seatedPose.restore();
      actionsRef.current = {};
      mixer.stopAllAction();
      mixer.uncacheRoot(prepared.model);
    };
  }, [animations, mixer, prepared.model, motion, seatedPose, appearance.workAction]);

  useEffect(
    () => () => {
      prepared.materials.forEach((material) => material.dispose());
      Object.values(accessoryMaterials).forEach((material) => material.dispose());
    },
    [accessoryMaterials, prepared]
  );

  useFrame((_, delta) => {
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
        : speed > clipSpeed.walk * scale * RUN_CROSSOVER
          ? 'worker-run'
          : 'worker-walk'
      : motion.seated || motion.cycling || motion.activity === 'break'
        ? 'worker-break'
        : motion.activity === 'working'
          ? TASK_CLIPS[appearance.workAction]
          : 'worker-idle';

    const semanticChanged =
      lastPose.current.clip !== activeClip ||
      lastPose.current.seated !== motion.seated ||
      lastPose.current.cycling !== motion.cycling ||
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
    sampleWorkerGesture(
      motion.seated
        ? 'rest'
        : appearance.workAction === 'bake' || appearance.workAction === 'garden'
          ? appearance.workAction
          : 'idle',
      gestureTime.current,
      gesture
    );
    lastPose.current = {
      clip: activeClip,
      seated: motion.seated,
      cycling: motion.cycling,
      cyclePhase: motion.cyclePhase,
      cartGrip: motion.cartGrip,
      seatFloorOffset: motion.seatFloorOffset,
      activity: motion.activity,
    };

    // Undo last frame's absolute seated pose before the mixer restores its tracks.
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
    if (walk) walk.timeScale = THREE.MathUtils.clamp(speed / (clipSpeed.walk * scale), 0.55, 1.9);
    if (run) run.timeScale = THREE.MathUtils.clamp(speed / (clipSpeed.run * scale), 0.7, 2.4);
    mixer.update(safeDelta);
    if (motion.cycling) seatedPose.applyCycling(motion.cyclePhase ?? 0);
    else if (motion.seated) seatedPose.apply(motion.seatFloorOffset ?? 0, gesture);
    else if (motion.cartGrip) seatedPose.applyTask(motion.cartGrip);
    else if (
      motion.activity === 'working' &&
      (appearance.workAction === 'bake' || appearance.workAction === 'garden')
    )
      seatedPose.applyTask(appearance.workAction, gesture);
    else if (motion.activity === 'working') seatedPose.applyWork(appearance.workAction, gesture);
    else if (motion.activity === 'idle' || motion.activity === 'break')
      seatedPose.applyIdle(gesture);
    if (toolRef.current) {
      const heldTask =
        motion.activity === 'working' &&
        (appearance.workAction === 'bake' || appearance.workAction === 'garden');
      toolRef.current.position.set(0, heldTask ? gesture.toolY : 0, heldTask ? gesture.toolZ : 0);
    }
    if (toolRef.current)
      toolRef.current.visible = !motion.seated && !motion.cycling && motion.activity === 'working';
  });

  return (
    <group
      name="authored-worker"
      dispose={null}
      scale={[appearance.bodyScale, appearance.heightScale, appearance.bodyScale]}
    >
      <primitive object={prepared.model} />
      <WorkerAccessories
        appearance={appearance}
        model={prepared.model}
        materials={accessoryMaterials}
        toolRef={toolRef}
      />
    </group>
  );
};

export default WorkerModel;
