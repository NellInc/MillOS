import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PersistStorage } from 'zustand/middleware';
import { useAdaptiveQuality } from '../hooks/useAdaptiveQuality';
import { useFPSStore } from './FPSMonitor';
import { useGraphicsStore, type PerfDebugSettings } from '../stores/graphicsStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useProductionStore } from '../stores/productionStore';
import { useUIStore } from '../stores/uiStore';
import { useIncidentReplayStore } from '../stores/incidentReplayStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';
import { getRuntimeMode, type BenchmarkScene, type RuntimeMode } from '../runtime/runtimeMode';
import { SITE_LAYOUT, type Vec3Tuple } from '../constants/siteLayout';
import { inspectWorldIntegrity, type WorldIntegrityReport } from '../constants/worldContract';
import { sampleAtmosphere, sampleCelestial } from '../simulation/atmosphere';
import { audioManager } from '../utils/audioManager';
import { installMillOSAgentRuntime } from '../agent/adapters/runtime/installAgentRuntime';
import { registerSceneCapture } from '../utils/sceneCapture';

interface RuntimeRendererStats {
  vendor: string;
  adapter: string;
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
  /**
   * The RAW `gl.info.render` accumulators, before per-frame normalization.
   *
   * WHY THIS IS REPORTED. A printed `triangles: 0` can mean an empty scene, a
   * negative total, or a NaN, and `rendererCounterPerFrame` maps all three to
   * the same digit. Every scene in this app reported a hard zero for triangles
   * while its draw CALLS reproduced exactly, which is only diagnosable against
   * the unnormalized value. `null` here means "not a finite number" - JSON has
   * no NaN, and a NaN silently serialised as `null` is still more honest than
   * the 0 it used to be flattened to.
   */
  raw: {
    frame: number | null;
    calls: number | null;
    triangles: number | null;
    lines: number | null;
    points: number | null;
    autoReset: boolean;
  };
}

interface RuntimeSceneGraphStats {
  objects: number;
  meshes: number;
  visibleMeshes: number;
  instancedMeshes: number;
  uniqueGeometries: number;
  uniqueMaterials: number;
  topBranches: Array<{
    index: number;
    name: string;
    type: string;
    objects: number;
    meshes: number;
    uniqueGeometries: number;
    uniqueMaterials: number;
    staticBatchStats?: {
      totalMeshes: number;
      candidates: number;
      optimizedOriginals: number;
      batches: number;
      exclusions: Record<string, number>;
      materialTypes: Record<string, number>;
    };
  }>;
}

interface RuntimeRayHit {
  name: string;
  type: string;
  distance: number;
  material: string;
  materialColor: string | null;
  map: string | null;
  receiveShadow: boolean;
  renderOrder: number;
}

interface RuntimeShaderState {
  name: string;
  cacheKey: string;
  uniforms: Record<string, number | number[] | string>;
}

interface RuntimeTextureIssue {
  object: string;
  material: string;
  slot: string;
  texture: string;
}

export interface RuntimeMotionTelemetry {
  speed?: number;
  acceleration?: number;
  steeringAngle?: number;
  innerSteeringAngle?: number;
  outerSteeringAngle?: number;
  wheelRotation?: number;
  wheelTravel?: number;
  routeDistance?: number;
  forkHeight?: number;
  mastTilt?: number;
  trailerAngle?: number;
  articulation?: number;
  doorOpenAmount?: number;
  landingGearAmount?: number;
  cargo?: 'pallet' | 'empty';
  loadPhase?: string;
  servicePhase?: string;
  stopReason?: string;
  active?: boolean;
  parkingBrake?: boolean;
  chocksDeployed?: boolean;
  dockLocked?: boolean;
  levelerDeployed?: boolean;
  safetyHold?: boolean;
  stopped?: boolean;
}

export interface RuntimeNamedObjectPose {
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  visible: boolean;
}

export type RuntimeCheckpointPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface RuntimeCheckpointState {
  id: 'receiving-checkpoint' | 'shipping-checkpoint';
  gateOpen: boolean;
  phase: RuntimeCheckpointPhase;
  clearanceSecondsRemaining: number;
  armAngle: number;
}

interface RuntimeMotionEntity extends RuntimeMotionTelemetry {
  id: string;
  type: 'forklift' | 'truck';
  position: [number, number, number];
  rotationY: number;
  phase?: string;
}

interface RuntimeMotionState {
  gameSpeed: number;
  productionSpeed: number;
  materialSimulationTime: number;
  entities: RuntimeMotionEntity[];
}

export interface RuntimeTelemetrySnapshot {
  capturedAt: number;
  ready: boolean;
  firstFrameAt: number | null;
  sampleCount: number;
  averageFrameMs: number;
  p50FrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  frameTimeStdDevMs: number;
  onePercentLowFps: number;
  worstFrameMs: number;
  averageFps: number;
  framesOver16_7Ms: number;
  framesOver25Ms: number;
  framesOver50Ms: number;
  longTasks: Array<{ startTime: number; duration: number }>;
  renderer: RuntimeRendererStats;
  sceneGraph: RuntimeSceneGraphStats;
  canvas: {
    cssWidth: number;
    cssHeight: number;
    bufferWidth: number;
    bufferHeight: number;
    effectiveDpr: number;
  };
  camera: {
    position: [number, number, number];
    fov: number;
    near: number;
    far: number;
  };
  diagnosticRays: Record<string, RuntimeRayHit[]>;
  shaderStates: RuntimeShaderState[];
  textureIssues: RuntimeTextureIssue[];
  worldIntegrity: WorldIntegrityReport;
  /**
   * What each `StaticMeshBatch` root actually did, read off
   * `userData.staticBatchStats`.
   *
   * `surfaceProfiles` is the reason this is here. The batcher applies the world
   * surface treatment to the materials it PRODUCES, and no other instrument in
   * this repo can distinguish "the finish reached 32 merged batches" from "the
   * finish reached nothing": `audit-scene-models.mjs` marks a mesh finished on
   * the mere presence of an injection, and a treatment that is never applied
   * leaves no trace at all. This is the assembly saying what it did.
   */
  staticBatches: RuntimeStaticBatchReport[];
  humanPresence: {
    passed: boolean;
    workerStoreCount: number;
    sceneObjects: string[];
  };
  motion: RuntimeMotionState;
  checkpoints: RuntimeCheckpointState[];
  audio: ReturnType<typeof audioManager.getDiagnostics>;
  sceneChildren: number;
  quality: string;
  resolutionScale: number;
}

export interface RuntimeStaticBatchReport {
  name: string;
  totalMeshes: number;
  candidates: number;
  batches: number;
  mergedMeshes: number;
  mergedOriginals: number;
  instancedBatches: number;
  instancedOriginals: number;
  /** Profile name -> output materials it was applied to; `untreated` for declines. */
  surfaceProfiles: Record<string, number>;
}

export interface MillOSRuntimeTelemetry {
  version: 1;
  mode: RuntimeMode;
  ready: boolean;
  firstFrameAt: number | null;
  reset: () => void;
  snapshot: () => RuntimeTelemetrySnapshot;
  motionSnapshot: () => RuntimeMotionState;
  checkpointSnapshot: () => RuntimeCheckpointState[];
  namedObjectsSnapshot: (names: string[]) => RuntimeNamedObjectPose[];
  setCameraPose: (position: [number, number, number], target: [number, number, number]) => void;
  setPerfDebug: (patch: Partial<PerfDebugSettings>) => void;
  /**
   * Group every material instance in the graph by how it would actually draw.
   *
   * Batching is bounded by material sharing, not by geometry: `mergeGeometries`
   * may only merge meshes that end up drawn with the same material. So the
   * question "why does this scene cost 1,351 draw calls" reduces to how many of
   * its ~1,200 material instances are genuinely distinct, and the answer has to
   * come from the live graph rather than from reading constructors.
   */
  materialAudit: () => RuntimeMaterialAudit;
  /**
   * Every light the scene actually renders with, plus the renderer and
   * environment state that scales them.
   *
   * WHY THIS EXISTS. `src/components/Environment.tsx` declares a hemisphere and
   * a fill that no mounted component renders - the live rig is
   * `OptimizedFactoryEnvironment` - and reading colours out of the wrong file
   * produces a confident lighting diagnosis and an exactly 1.000 delta when it
   * is acted on. CLAUDE.md names that ratio as the tell for an inert term. The
   * only way to know which rig is mounted is to ask the assembled scene.
   */
  lightRig: () => RuntimeLightRig;
  /**
   * Resolved draw state for the meshes matching `query`, matched against mesh
   * name, material name and every ancestor name.
   *
   * For the class of defect where two objects out of one pipeline light an
   * order of magnitude apart: the pixels cannot say which input differs, and
   * two material dumps side by side can.
   */
  inspectObjects: (query: string, limit?: number) => RuntimeObjectReport[];
  /**
   * World positions of any objects matching `query` - bones included, unlike
   * `inspectObjects`, which is meshes only.
   *
   * A single frame cannot tell a driven rig from a static one, and this repo
   * has already produced one confident wrong answer from a screenshot of a cow.
   * Sampling a named bone over time can: a bone whose world position never
   * moves is a rig nothing is calling.
   */
  sampleObjects: (query: string, limit?: number) => RuntimeSample[];
}

export interface RuntimeSample {
  /**
   * Stable identity for the object's lifetime.
   *
   * A motion sweep has to compare the SAME object across samples. Path is not
   * an identity - most of this graph is unnamed, so thousands of objects
   * serialise to `.../<Group>/<Mesh>` - and traversal index is not one either,
   * because the graph mounts and unmounts constantly once the game clock is
   * running. Either substitute silently compares two different objects and
   * manufactures motion out of two static ones.
   */
  uuid: string;
  name: string;
  type: string;
  path: string;
  worldPosition: [number, number, number];
  /**
   * World orientation, as `[x, y, z, w]`.
   *
   * Position alone is not enough and reporting it alone produces false
   * negatives. A joint rotated about its OWN pivot never moves its origin, so a
   * rig driven purely in rotation - the sitting cat's head turn, which is a yaw
   * on a leaf `Head` bone with nothing below it - reads as perfectly static on
   * a position probe. That is the mirror of the error this whole API exists to
   * prevent, so both channels are published.
   */
  worldQuaternion: [number, number, number, number];
  /**
   * Checksum of an `InstancedMesh`'s instance matrices, or null.
   *
   * THE BLIND SPOT THIS CLOSES. An instanced machine animates by writing
   * `setMatrixAt`, which never touches the container object's own transform -
   * so a per-object position/rotation sweep reports spinning roller mills and
   * gyrating plansifters as perfectly static. That reading is not merely
   * incomplete, it is inverted, and acting on it would mean "fixing" an
   * animation that was working.
   *
   * Strided rather than summed whole: these buffers run to tens of thousands of
   * floats and this is read many times a second during a sweep. A stride of 37
   * is coprime with the 16 floats of a matrix, so successive samples walk every
   * lane rather than reading the same element of every matrix.
   */
  instanceMatrixChecksum: number | null;
  /**
   * Checksum of everything about this object's material that a viewer reads as
   * a state change: colour, emissive, emissive intensity, opacity, visibility.
   *
   * THE FOURTH BLIND SPOT. Position, orientation and instance matrices are all
   * TRANSFORMS, and a large amount of what is alive in this scene never moves:
   * the ceiling fixture lenses track the day/night exposure, every machine
   * status beacon changes colour, and the dock status lamps swap between a lit
   * green and a lit red as a truck berths. A sweep of the first three channels
   * reports all of it as perfectly static, which is the same false zero as
   * §6.4's instanced mills in a different medium.
   *
   * Null for an object with no material, so the audit can tell "not applicable"
   * from "applicable and unchanging".
   */
  materialChecksum: number | null;
}

export interface RuntimeLightReport {
  name: string;
  type: string;
  path: string;
  intensity: number;
  color: string;
  /** Hemisphere lights only. */
  groundColor: string | null;
  worldPosition: [number, number, number];
  /** Directional and spot lights only, in world space. */
  target: [number, number, number] | null;
  distance: number | null;
  decay: number | null;
  castShadow: boolean;
  visible: boolean;
  /** Shadow camera extent, for "is this receiver even inside the map". */
  shadow: {
    mapSize: [number, number];
    bias: number;
    normalBias: number;
    radius: number;
    near: number;
    far: number;
    /** Orthographic half-extents; null for a perspective shadow camera. */
    halfExtent: [number, number] | null;
  } | null;
}

export interface RuntimeLightRig {
  lights: RuntimeLightReport[];
  scene: {
    environmentBound: boolean;
    environmentIntensity: number;
    backgroundBound: boolean;
    fog: {
      type: string;
      color: string;
      near: number | null;
      far: number | null;
      density: number | null;
    } | null;
  };
  renderer: {
    toneMapping: number;
    toneMappingExposure: number;
    outputColorSpace: string;
    shadowMapEnabled: boolean;
    shadowMapType: number;
  };
}

export interface RuntimeObjectReport {
  name: string;
  path: string;
  worldPosition: [number, number, number];
  /**
   * Sign of the world matrix determinant. A negative scale flips every face's
   * winding and is the other way to get a body that is dark on all sides.
   */
  worldDeterminant: number;
  visible: boolean;
  /**
   * Visibility AFTER walking the ancestors, which is what decides whether the
   * renderer ever reaches this mesh.
   *
   * `Object3D.visible` is the object's OWN flag: a mesh inside a group whose
   * `visible` is false still reports true, and three skips the whole subtree
   * regardless. Reading the own flag as "this is drawn" is what made
   * `audit-scene-models.mjs` report 53 zero-opacity meshes as "drawn every
   * frame and contributes nothing" when every one of them was a forklift's
   * cargo inside a hidden group - a real check firing on a false premise.
   */
  visibleInTree: boolean;
  frustumCulled: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  layersMask: number;
  /** Instanced draws report their count; everything else reports 1. */
  instanceCount: number;
  geometry: {
    vertices: number;
    attributes: string[];
    boundingSphereRadius: number | null;
    /**
     * Bounding radius in metres of the LARGEST single draw of this mesh - after
     * the mesh's world scale AND, for an `InstancedMesh`, the per-instance
     * scale in `instanceMatrix`.
     */
    worldRadius: number;
    /**
     * The same measure summed over every instance. Use this to total a
     * material's surface; multiplying `worldRadius` by `instanceCount` is the
     * bug this field exists to remove.
     */
    worldRadiusSum: number;
    /**
     * A non-finite bounding volume or a non-finite POSITION value.
     *
     * `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN` is
     * the symptom the repo already documents, and by the time it reaches the
     * console it names no object. This names the object.
     */
    nonFinite: boolean;
    /**
     * `instanceCount` for an `InstancedBufferGeometry`, `null` for anything
     * else, and `'unbounded'` when the count is not a finite number.
     *
     * `'unbounded'` is its own value because it is its own defect and it is
     * silent. `InstancedBufferGeometry` defaults `instanceCount` to `Infinity`,
     * and `WebGLRenderer.js:1316` only clamps that against
     * `geometry._maxInstanceCount`, which `WebGLBindingStates` sets ONLY when it
     * binds an instanced attribute. A geometry with none - troika's
     * `GlyphsGeometry` before its glyphs are laid out - therefore draws with
     * `primcount` Infinity. Nothing renders (the GL call coerces it to 0), but
     * `WebGLInfo.update` runs first and adds `Infinity` to `render.triangles`,
     * which with `info.autoReset` off makes one transient frame permanent for
     * the whole measured window. See `SceneText.initialiseGlyphInstanceCount`.
     */
    instancedDrawCount: number | 'unbounded' | null;
  };
  /**
   * Every bound texture slot, with the colour space it will be sampled in.
   *
   * The repo's most expensive texture bug to date was a whole class of
   * `DataTexture` handed to the shader as linear when the bytes were sRGB, and
   * CLAUDE.md's rule is that getting it backwards on a normal or roughness map
   * is just as broken as leaving an albedo linear. That rule can only be
   * enforced against the textures actually bound at runtime.
   */
  textures: Array<{
    slot: string;
    uuid: string;
    colorSpace: string;
    size: [number, number] | null;
  }>;
  material: {
    type: string;
    name: string;
    uuid: string;
    color: string;
    emissive: string | null;
    emissiveIntensity: number | null;
    metalness: number | null;
    roughness: number | null;
    envMapIntensity: number | null;
    envMapBound: boolean;
    lightMapBound: boolean;
    lightMapIntensity: number | null;
    aoMapBound: boolean;
    aoMapIntensity: number | null;
    mapUuid: string | null;
    mapColorSpace: string | null;
    mapSize: [number, number] | null;
    normalMapBound: boolean;
    /** Carries its own `onBeforeCompile` / `customProgramCacheKey`. */
    shaderInjected: boolean;
    vertexColors: boolean;
    side: number;
    shadowSide: number | null;
    flatShading: boolean;
    transparent: boolean;
    opacity: number;
    toneMapped: boolean;
    fog: boolean;
    blending: number;
    depthWrite: boolean;
    visible: boolean;
  };
}

export interface RuntimeMaterialAuditBranch {
  name: string;
  meshes: number;
  materialInstances: number;
  distinctFingerprints: number;
}

export interface RuntimeMaterialAudit {
  totalMeshes: number;
  materialInstances: number;
  distinctFingerprints: number;
  branches: RuntimeMaterialAuditBranch[];
  worstDuplicates: Array<{ count: number; fingerprint: string }>;
}

const CHECKPOINT_PHASES = new Set<RuntimeCheckpointPhase>(['closed', 'opening', 'open', 'closing']);

export function readRuntimeCheckpointTelemetry(
  id: RuntimeCheckpointState['id'],
  userData: Record<string, unknown>
): RuntimeCheckpointState | null {
  const phase = userData.gatePhase;
  const clearanceSecondsRemaining = userData.clearanceSecondsRemaining;
  const armAngle = userData.armAngle;
  if (
    typeof userData.gateOpen !== 'boolean' ||
    typeof phase !== 'string' ||
    !CHECKPOINT_PHASES.has(phase as RuntimeCheckpointPhase) ||
    !Number.isFinite(clearanceSecondsRemaining) ||
    !Number.isFinite(armAngle)
  ) {
    return null;
  }
  return {
    id,
    gateOpen: userData.gateOpen,
    phase: phase as RuntimeCheckpointPhase,
    clearanceSecondsRemaining: rounded(clearanceSecondsRemaining as number),
    armAngle: rounded(armAngle as number, 4),
  };
}

declare global {
  interface Window {
    __MILLOS_RUNTIME__?: MillOSRuntimeTelemetry;
  }
}

interface RuntimeControllerProps {
  adaptiveEnabled: boolean;
  orbitControlsRef?: React.RefObject<OrbitLikeControls | null>;
}

interface OrbitLikeControls {
  target?: THREE.Vector3;
  update?: () => void;
}

interface BenchmarkCameraPose {
  position: Vec3Tuple;
  target: Vec3Tuple;
  fov?: number;
}

const BENCHMARK_CAMERAS: Record<BenchmarkScene, BenchmarkCameraPose> = {
  overview: SITE_LAYOUT.cameras.overview,
  interior: SITE_LAYOUT.cameras.interior,
  silos: SITE_LAYOUT.cameras.silos,
  milling: SITE_LAYOUT.cameras.milling,
  sifting: SITE_LAYOUT.cameras.sifting,
  packing: SITE_LAYOUT.cameras.packing,
  'process-floor': SITE_LAYOUT.cameras.processFloor,
  'tank-farm': SITE_LAYOUT.cameras.tankFarm,
  'logistics-close': SITE_LAYOUT.cameras.logisticsClose,
  forklift: SITE_LAYOUT.cameras.forklift,
  shipping: SITE_LAYOUT.cameras.shipping,
  receiving: SITE_LAYOUT.cameras.receiving,
  yard: SITE_LAYOUT.cameras.yard,
  water: SITE_LAYOUT.cameras.water,
  village: SITE_LAYOUT.cameras.village,
  farm: SITE_LAYOUT.cameras.farm,
  paddock: SITE_LAYOUT.cameras.paddock,
  square: SITE_LAYOUT.cameras.square,
  garage: SITE_LAYOUT.cameras.garage,
  markings: SITE_LAYOUT.cameras.markings,
  forecourt: SITE_LAYOUT.cameras.forecourt,
  carpark: SITE_LAYOUT.cameras.carpark,
  river: SITE_LAYOUT.cameras.river,
  tunnel: SITE_LAYOUT.cameras.tunnel,
  huts: SITE_LAYOUT.cameras.huts,
  offices: SITE_LAYOUT.cameras.offices,
  canal: SITE_LAYOUT.cameras.canal,
  lake: SITE_LAYOUT.cameras.lake,
  busstop: SITE_LAYOUT.cameras.busstop,
  'road-tunnel': SITE_LAYOUT.cameras.roadTunnel,
  castle: SITE_LAYOUT.cameras.castle,
  kiosk: SITE_LAYOUT.cameras.kiosk,
  sun: SITE_LAYOUT.cameras.celestial,
  moon: SITE_LAYOUT.cameras.celestial,
};

export function resolveBenchmarkCamera(
  scene: BenchmarkScene,
  gameTime: number,
  weather: RuntimeMode['weather']
): BenchmarkCameraPose {
  const camera = BENCHMARK_CAMERAS[scene];
  if (scene !== 'sun' && scene !== 'moon') return camera;

  const celestial = sampleCelestial(sampleAtmosphere(0, gameTime, weather));
  const direction = scene === 'sun' ? celestial.sunDirection : celestial.moonDirection;
  // The sky group follows the camera and places each disk along this world
  // direction. A tiny horizontal nudge avoids a degenerate lookAt basis when
  // the requested time puts a body at the exact zenith or nadir.
  const target: Vec3Tuple = [
    camera.position[0] + direction[0] * 180 + (Math.abs(direction[1]) > 0.98 ? 0.2 : 0),
    camera.position[1] + direction[1] * 180,
    camera.position[2] + direction[2] * 180,
  ];
  return { ...camera, target };
}

/**
 * Identity of a material as the renderer sees it.
 *
 * Two materials sharing a fingerprint would draw identically, so they could be
 * one shared instance and their meshes could then be merged into one call. The
 * fingerprint therefore has to cover everything that changes the draw: the
 * program-selecting flags, the colour and PBR constants, the identity of every
 * bound map, and any custom shader injection - a `customProgramCacheKey` makes
 * two otherwise identical materials genuinely different, and omitting it would
 * report a saving that does not exist.
 */
const MATERIAL_FINGERPRINT_SCALARS = [
  'transparent',
  'opacity',
  'side',
  'flatShading',
  'vertexColors',
  'depthWrite',
  'depthTest',
  'alphaTest',
  'metalness',
  'roughness',
  'envMapIntensity',
  'emissiveIntensity',
  'clearcoat',
  'transmission',
  'wireframe',
  'toneMapped',
  'blending',
  'polygonOffset',
  'polygonOffsetFactor',
  'polygonOffsetUnits',
] as const;

const MATERIAL_FINGERPRINT_COLORS = [
  'color',
  'emissive',
  'specular',
  'attenuationColor',
  'sheenColor',
] as const;

const MATERIAL_FINGERPRINT_MAPS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
] as const;

function materialFingerprint(material: THREE.Material): string {
  const source = material as unknown as Record<string, unknown>;
  const parts: string[] = [material.type];
  for (const key of MATERIAL_FINGERPRINT_SCALARS) {
    if (source[key] !== undefined) parts.push(`${key}=${String(source[key])}`);
  }
  for (const key of MATERIAL_FINGERPRINT_COLORS) {
    const value = source[key] as THREE.Color | undefined;
    if (value?.getHexString) parts.push(`${key}=#${value.getHexString()}`);
  }
  for (const key of MATERIAL_FINGERPRINT_MAPS) {
    const value = source[key] as THREE.Texture | undefined;
    if (value) parts.push(`${key}=${value.uuid}`);
  }
  if (typeof material.customProgramCacheKey === 'function') {
    try {
      parts.push(`cacheKey=${material.customProgramCacheKey()}`);
    } catch {
      parts.push('cacheKey=threw');
    }
  }
  return parts.join('|');
}

/**
 * Descend to the level of the graph that actually divides the scene up.
 *
 * Testing for a single child is not enough: the root has a dominant
 * `world-root` container beside an empty sibling, so a single-child test stops
 * immediately and attributes every mesh to one node - a breakdown that cannot
 * answer where draw calls come from, which is the only reason it exists. Follow
 * whichever child holds essentially all the meshes instead, and stop as soon as
 * no child dominates.
 *
 * SHARED ON PURPOSE. `sceneGraph.topBranches` and `materialAudit()` must agree
 * about what "a branch" is, or their mesh counts silently disagree and the two
 * tables cannot be read together. Deriving the level twice is the transcribed
 * constant problem: both copies read correct, and they diverge the first time
 * the scene graph gains a wrapper.
 */
function findBranchRoot(scene: THREE.Scene): THREE.Object3D {
  // The Canvas owns a small unnamed helper sibling beside `world-root`, so the
  // dominant-child descent below collapsed every diagnostic into a single
  // 1,400-mesh branch. Prefer the authored root explicitly and keep the
  // heuristic for isolated test scenes that have no `world-root`.
  const authoredRoot = scene.getObjectByName('world-root');
  if (authoredRoot) return authoredRoot;
  const countMeshes = (root: THREE.Object3D) => {
    let meshes = 0;
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes += 1;
    });
    return meshes;
  };
  let branchRoot: THREE.Object3D = scene;
  // Bounded: a pathological graph must not stall the snapshot.
  for (let depth = 0; depth < 8; depth += 1) {
    if (branchRoot.children.length === 0) break;
    const counted = branchRoot.children.map((child) => ({ child, meshes: countMeshes(child) }));
    const total = counted.reduce((sum, entry) => sum + entry.meshes, 0);
    if (total === 0) break;
    const dominant = counted.reduce((best, entry) => (entry.meshes > best.meshes ? entry : best));
    // Anything less than near-total means this level is a real division.
    if (dominant.meshes < total * 0.9) break;
    if (dominant.child instanceof THREE.Mesh || dominant.child.children.length === 0) break;
    branchRoot = dominant.child;
  }
  return branchRoot;
}

/**
 * Which of `branchRoot`'s children this mesh sits under.
 *
 * Walks up to the child of the branch root rather than guessing from the chain
 * of names, so every mesh lands in exactly one bucket and the buckets are the
 * same ones `topBranches` reports. A mesh parented above the branch root - which
 * should not happen, but is not worth crashing a diagnostic over - is reported
 * separately rather than folded into a real branch.
 */
function branchNameOf(object: THREE.Object3D, branchRoot: THREE.Object3D): string {
  let child: THREE.Object3D | null = null;
  let node: THREE.Object3D | null = object;
  while (node && node !== branchRoot) {
    child = node;
    node = node.parent;
  }
  if (node !== branchRoot || !child) return '(outside branch root)';
  return child.name || '(unnamed)';
}

function auditMaterials(scene: THREE.Scene): RuntimeMaterialAudit {
  const byBranch = new Map<
    string,
    { meshes: number; instances: Set<string>; prints: Map<string, number> }
  >();
  const globalInstances = new Set<string>();
  const globalPrints = new Map<string, number>();
  const branchRoot = findBranchRoot(scene);
  let totalMeshes = 0;

  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    totalMeshes += 1;
    const branch = branchNameOf(object, branchRoot);
    let entry = byBranch.get(branch);
    if (!entry) {
      entry = { meshes: 0, instances: new Set(), prints: new Map() };
      byBranch.set(branch, entry);
    }
    entry.meshes += 1;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      entry.instances.add(material.uuid);
      globalInstances.add(material.uuid);
      const print = materialFingerprint(material);
      entry.prints.set(print, (entry.prints.get(print) ?? 0) + 1);
      globalPrints.set(print, (globalPrints.get(print) ?? 0) + 1);
    }
  });

  return {
    totalMeshes,
    materialInstances: globalInstances.size,
    distinctFingerprints: globalPrints.size,
    branches: [...byBranch.entries()]
      .map(([name, entry]) => ({
        name,
        meshes: entry.meshes,
        materialInstances: entry.instances.size,
        distinctFingerprints: entry.prints.size,
      }))
      .sort((a, b) => b.materialInstances - a.materialInstances),
    worstDuplicates: [...globalPrints.entries()]
      .map(([fingerprint, count]) => ({ count, fingerprint }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

/** Ancestor chain, root first, for locating a mesh in a graph of thousands. */
function objectPath(object: THREE.Object3D): string {
  const parts: string[] = [];
  let node: THREE.Object3D | null = object;
  while (node) {
    parts.push(node.name || `<${node.type}>`);
    node = node.parent;
  }
  return parts.reverse().join('/');
}

/**
 * Whether the renderer will reach this object at all.
 *
 * `Object3D.visible` is the own flag; three's `projectObject` returns early on
 * the first invisible ancestor and never descends, so a mesh under a hidden
 * group costs nothing to draw however its own flag reads.
 */
function isVisibleInTree(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

const _probePosition = new THREE.Vector3();
const _probeQuaternion = new THREE.Quaternion();
const _probeScale = new THREE.Vector3();
const _probeTarget = new THREE.Vector3();

const hex = (color: THREE.Color | undefined | null): string =>
  color ? `#${color.getHexString()}` : '#000000';

/**
 * A texture's decoded pixel size, or null.
 *
 * `Texture.image` is `any` in three's own typings and is a canvas, an
 * ImageBitmap, a DataTexture's `{ data, width, height }` or - for a texture
 * that has not finished decoding - undefined. Read defensively: a diagnostic
 * that throws is worse than one that reports a gap.
 */
function mapImageSize(map: THREE.Texture | null): [number, number] | null {
  const image = map?.image as { width?: number; height?: number } | undefined;
  if (typeof image?.width !== 'number' || typeof image?.height !== 'number') return null;
  return [image.width, image.height];
}

function reportLights(scene: THREE.Scene, gl: THREE.WebGLRenderer): RuntimeLightRig {
  const lights: RuntimeLightReport[] = [];
  scene.traverse((object) => {
    const light = object as THREE.Light & {
      groundColor?: THREE.Color;
      target?: THREE.Object3D;
      distance?: number;
      decay?: number;
    };
    if (!light.isLight) return;
    light.getWorldPosition(_probePosition);
    const shadow = light.shadow;
    const camera = shadow?.camera as THREE.OrthographicCamera | undefined;
    lights.push({
      name: light.name || '(unnamed)',
      type: light.type,
      path: objectPath(light),
      intensity: light.intensity,
      color: hex(light.color),
      groundColor: light.groundColor ? hex(light.groundColor) : null,
      worldPosition: [_probePosition.x, _probePosition.y, _probePosition.z],
      target: light.target
        ? (light.target.getWorldPosition(_probeTarget).toArray() as [number, number, number])
        : null,
      distance: light.distance ?? null,
      decay: light.decay ?? null,
      castShadow: light.castShadow,
      visible: light.visible,
      shadow: shadow
        ? {
            mapSize: [shadow.mapSize.x, shadow.mapSize.y],
            bias: shadow.bias,
            normalBias: shadow.normalBias,
            radius: shadow.radius,
            near: camera?.near ?? 0,
            far: camera?.far ?? 0,
            halfExtent:
              camera && (camera as THREE.OrthographicCamera).isOrthographicCamera
                ? [
                    Math.abs(camera.right - camera.left) / 2,
                    Math.abs(camera.top - camera.bottom) / 2,
                  ]
                : null,
          }
        : null,
    });
  });

  const fog = scene.fog as (Partial<THREE.Fog> & Partial<THREE.FogExp2>) | null;
  return {
    lights,
    scene: {
      environmentBound: Boolean(scene.environment),
      environmentIntensity: scene.environmentIntensity,
      backgroundBound: Boolean(scene.background),
      fog: fog
        ? {
            type: fog.isFogExp2 ? 'FogExp2' : 'Fog',
            color: hex(fog.color),
            near: fog.near ?? null,
            far: fog.far ?? null,
            density: fog.density ?? null,
          }
        : null,
    },
    renderer: {
      toneMapping: gl.toneMapping,
      toneMappingExposure: gl.toneMappingExposure,
      outputColorSpace: gl.outputColorSpace,
      shadowMapEnabled: gl.shadowMap.enabled,
      shadowMapType: gl.shadowMap.type,
    },
  };
}

/**
 * Every texture slot three can sample, so the audit can check each one against
 * the colour space it is REQUIRED to be in rather than against the one slot
 * somebody remembered.
 */
const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'displacementMap',
  'alphaMap',
  'lightMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'transmissionMap',
  'iridescenceMap',
] as const;

function surveyTextures(material: THREE.Material | undefined): RuntimeObjectReport['textures'] {
  if (!material) return [];
  const slots = material as unknown as Record<string, THREE.Texture | null | undefined>;
  const out: RuntimeObjectReport['textures'] = [];
  for (const slot of TEXTURE_SLOTS) {
    const texture = slots[slot];
    if (!texture?.isTexture) continue;
    out.push({
      slot,
      uuid: texture.uuid,
      colorSpace: texture.colorSpace,
      size: mapImageSize(texture),
    });
  }
  return out;
}

/**
 * A geometry with a non-finite bound or a non-finite position.
 *
 * The bounds are checked first because they are O(1) and are what the renderer
 * actually trips over. Positions are then SAMPLED rather than fully scanned:
 * this runs over every mesh in a scene of thousands inside a single frame, and
 * a NaN in a buffer is never a lone value - it comes from a bad argument that
 * poisons a whole geometry, so a stride of 97 finds it. 97 is prime, so the
 * sample cannot land on the same lane of a vec3-strided buffer every step.
 */
const _instanceMatrix = new THREE.Matrix4();
const _instancePosition = new THREE.Vector3();
const _instanceQuaternion = new THREE.Quaternion();
const _instanceScale = new THREE.Vector3();

/**
 * World-space bounding radius of the largest single DRAW of a mesh, and the sum
 * across all of them, both in metres.
 *
 * WHY THE INSTANCE MATRICES HAVE TO BE OPENED. `worldRadius` was the geometry
 * radius times the mesh's own world scale, and for an `InstancedMesh` that is
 * the wrong matrix: every instance's scale lives in `instanceMatrix`, and the
 * container itself is almost always unscaled. So every instanced row reported
 * the bare unit-geometry radius, 0.87, and the summed column degenerated to
 * `0.87 x instanceCount` - an instance count wearing a metres label. Measured on
 * `world-factory-infrastructure`: sixteen of nineteen rows were EXACTLY
 * `0.87 x count`, and `factory-trim` topped the branch's work list at "78 m"
 * purely for having 87 members.
 *
 * That is §4.1's own defect one level down. The work list was moved off mesh
 * count and onto world size precisely because count ranks a hundred bolts above
 * the wall behind them - and for instanced geometry it had quietly stayed a
 * count the whole time.
 */
function measureWorldRadius(
  mesh: THREE.Mesh,
  meshWorldScale: THREE.Vector3
): { largest: number; sum: number } {
  const geometryRadius = mesh.geometry.boundingSphere?.radius ?? 0;
  const meshScale = Math.max(
    Math.abs(meshWorldScale.x),
    Math.abs(meshWorldScale.y),
    Math.abs(meshWorldScale.z)
  );
  const instanced = mesh as THREE.InstancedMesh;
  if (!instanced.isInstancedMesh) {
    const radius = geometryRadius * meshScale;
    return { largest: radius, sum: radius };
  }
  let largest = 0;
  let sum = 0;
  for (let i = 0; i < instanced.count; i += 1) {
    instanced.getMatrixAt(i, _instanceMatrix);
    _instanceMatrix.decompose(_instancePosition, _instanceQuaternion, _instanceScale);
    const radius =
      geometryRadius *
      meshScale *
      Math.max(Math.abs(_instanceScale.x), Math.abs(_instanceScale.y), Math.abs(_instanceScale.z));
    if (!Number.isFinite(radius)) continue;
    sum += radius;
    if (radius > largest) largest = radius;
  }
  return { largest, sum };
}

/**
 * The instance count an `InstancedBufferGeometry` will actually draw with.
 *
 * Reported separately from `instanceCount` on the mesh because an
 * `InstancedMesh` carries its count on the OBJECT while an instanced GEOMETRY
 * carries it on itself, and only the second one can be silently unbounded.
 */
function readInstancedDrawCount(geometry: THREE.BufferGeometry): number | 'unbounded' | null {
  const instanced = geometry as THREE.BufferGeometry & {
    isInstancedBufferGeometry?: boolean;
    instanceCount?: number;
  };
  if (!instanced.isInstancedBufferGeometry) return null;
  return Number.isFinite(instanced.instanceCount)
    ? (instanced.instanceCount as number)
    : 'unbounded';
}

function hasNonFiniteGeometry(geometry: THREE.BufferGeometry): boolean {
  const sphere = geometry.boundingSphere;
  if (sphere && !Number.isFinite(sphere.radius)) return true;
  const box = geometry.boundingBox;
  if (box && (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x))) return true;
  const position = geometry.getAttribute('position');
  if (!position) return false;
  const array = position.array as ArrayLike<number>;
  for (let i = 0; i < array.length; i += 97) {
    if (!Number.isFinite(array[i])) return true;
  }
  return false;
}

function reportObjects(scene: THREE.Scene, query: string, limit: number): RuntimeObjectReport[] {
  const needle = query.toLowerCase();
  const out: RuntimeObjectReport[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (out.length >= limit) return;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const path = objectPath(mesh).toLowerCase();
    const matches =
      path.includes(needle) ||
      materials.some((m) => (m?.name ?? '').toLowerCase().includes(needle));
    if (!matches) return;

    mesh.matrixWorld.decompose(_probePosition, _probeQuaternion, _probeScale);
    const worldRadii = measureWorldRadius(mesh, _probeScale);
    const material = materials[0] as THREE.MeshStandardMaterial | undefined;
    const map = material?.map ?? null;
    out.push({
      name: mesh.name || '(unnamed)',
      path: objectPath(mesh),
      worldPosition: [_probePosition.x, _probePosition.y, _probePosition.z],
      worldDeterminant: mesh.matrixWorld.determinant(),
      visible: mesh.visible,
      visibleInTree: isVisibleInTree(mesh),
      frustumCulled: mesh.frustumCulled,
      castShadow: mesh.castShadow,
      receiveShadow: mesh.receiveShadow,
      renderOrder: mesh.renderOrder,
      layersMask: mesh.layers.mask,
      instanceCount: (mesh as THREE.InstancedMesh).isInstancedMesh
        ? (mesh as THREE.InstancedMesh).count
        : 1,
      geometry: {
        vertices: mesh.geometry.getAttribute('position')?.count ?? 0,
        attributes: Object.keys(mesh.geometry.attributes),
        boundingSphereRadius: mesh.geometry.boundingSphere?.radius ?? null,
        /**
         * Bounding radius in METRES, not in the geometry's own units, for the
         * LARGEST single draw of this mesh.
         *
         * WHY BOTH. Almost nothing in this scene owns its size: a shared unit
         * box scaled to a 60 m wall and the same shared unit box scaled to a
         * 0.05 m bolt report an identical `boundingSphereRadius`, because that
         * is a property of the geometry and the scale lives in the matrix. A
         * work list ordered by mesh count therefore ranks a hundred bolts above
         * the wall behind them, which is the opposite of what a viewer sees.
         * `worldRadius` is what makes "which untextured surfaces actually fill
         * the frame" answerable.
         *
         * Max axis rather than the mean: a plane scaled (120, 1, 10) is a
         * 120 m road, and averaging would report it as 44.
         */
        worldRadius: worldRadii.largest,
        /**
         * The same measure summed over every instance this mesh draws.
         *
         * Consumers must use THIS to total a material's surface, and must not
         * multiply `worldRadius` by `instanceCount` themselves - for an
         * `InstancedMesh` the per-instance scale is in `instanceMatrix`, so that
         * product silently reduces to the unit-geometry radius times a count.
         * See `measureWorldRadius`.
         */
        worldRadiusSum: worldRadii.sum,
        nonFinite: hasNonFiniteGeometry(mesh.geometry),
        instancedDrawCount: readInstancedDrawCount(mesh.geometry),
      },
      textures: surveyTextures(material),
      material: {
        type: material?.type ?? '(none)',
        name: material?.name ?? '',
        uuid: material?.uuid ?? '',
        color: hex(material?.color),
        emissive: material?.emissive ? hex(material.emissive) : null,
        emissiveIntensity: material?.emissiveIntensity ?? null,
        metalness: material?.metalness ?? null,
        roughness: material?.roughness ?? null,
        envMapIntensity: material?.envMapIntensity ?? null,
        envMapBound: Boolean(material?.envMap),
        lightMapBound: Boolean(material?.lightMap),
        lightMapIntensity: material?.lightMapIntensity ?? null,
        aoMapBound: Boolean(material?.aoMap),
        aoMapIntensity: material?.aoMapIntensity ?? null,
        mapUuid: map?.uuid ?? null,
        mapColorSpace: map?.colorSpace ?? null,
        mapSize: mapImageSize(map),
        normalMapBound: Boolean(material?.normalMap),
        /**
         * True when this material carries its own `onBeforeCompile` or
         * `customProgramCacheKey`.
         *
         * WITHOUT THIS THE WORK LIST LIES. A large amount of the surfacing in
         * this repo is injected GLSL rather than a bound texture slot: the
         * terrain's whole splat blend, the machines' grime/dust/edge-wear, and
         * the trailers' ribbed panels and gravity grime. Every one of them
         * reports zero textures, so an audit that equates "no texture slot"
         * with "unfinished" points the next pass straight at work that is
         * already done - `world-logistics` read 97% flat while its trailer
         * bodies carry a rib-and-grime shader with per-truck wear.
         *
         * Detected exactly the way `StaticMeshBatch.isSupportedMaterial` does,
         * so the two agree on what counts as a customised material.
         */
        shaderInjected:
          Boolean(material) &&
          (Object.hasOwn(material as object, 'onBeforeCompile') ||
            Object.hasOwn(material as object, 'customProgramCacheKey')),
        vertexColors: Boolean(material?.vertexColors),
        side: material?.side ?? -1,
        shadowSide: material?.shadowSide ?? null,
        flatShading: Boolean(material?.flatShading),
        transparent: Boolean(material?.transparent),
        opacity: material?.opacity ?? 1,
        toneMapped: material?.toneMapped ?? true,
        fog: material?.fog ?? true,
        blending: material?.blending ?? -1,
        depthWrite: material?.depthWrite ?? true,
        visible: material?.visible ?? true,
      },
    });
  });
  return out;
}

/**
 * See `RuntimeSample.materialChecksum` for why this exists.
 *
 * The channels are weighted by primes so two independent changes cannot cancel
 * - a beacon going from red to green while its intensity drops would otherwise
 * be able to sum to the same number it started at.
 */
function materialChecksum(object: THREE.Object3D): number | null {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) return null;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let sum = 0;
  for (let index = 0; index < materials.length; index += 1) {
    const material = materials[index] as THREE.MeshStandardMaterial | undefined;
    if (!material) continue;
    const weight = index + 1;
    if (material.color) sum += material.color.getHex() * 3 * weight;
    if (material.emissive) sum += material.emissive.getHex() * 5 * weight;
    sum += (material.emissiveIntensity ?? 0) * 7919 * weight;
    sum += material.opacity * 104729 * weight;
    sum += (material.visible ? 1 : 0) * 1299709 * weight;
  }
  return sum;
}

/** See `RuntimeSample.instanceMatrixChecksum` for why this exists. */
function instanceChecksum(object: THREE.Object3D): number | null {
  const mesh = object as THREE.InstancedMesh;
  if (!mesh.isInstancedMesh || !mesh.instanceMatrix) return null;
  const array = mesh.instanceMatrix.array as ArrayLike<number>;
  let sum = 0;
  for (let i = 0; i < array.length; i += 37) sum += array[i] * (i + 1);
  return sum;
}

/**
 * World positions of everything matching `query`, bones included.
 *
 * Deliberately does NOT call `scene.updateMatrixWorld` first. The imperative
 * rig handles write bone quaternions and refresh their own subtree, and the
 * renderer has already flushed the graph for the frame just drawn; forcing
 * another update here would sample a pose one step out of phase with what was
 * rendered.
 */
function sampleObjects(scene: THREE.Scene, query: string, limit: number): RuntimeSample[] {
  const needle = query.toLowerCase();
  const out: RuntimeSample[] = [];
  scene.traverse((object) => {
    if (out.length >= limit) return;
    if (!objectPath(object).toLowerCase().includes(needle)) return;
    object.getWorldPosition(_probePosition);
    object.getWorldQuaternion(_probeQuaternion);
    out.push({
      uuid: object.uuid,
      name: object.name || `<${object.type}>`,
      type: object.type,
      path: objectPath(object),
      worldPosition: [_probePosition.x, _probePosition.y, _probePosition.z],
      worldQuaternion: [
        _probeQuaternion.x,
        _probeQuaternion.y,
        _probeQuaternion.z,
        _probeQuaternion.w,
      ],
      instanceMatrixChecksum: instanceChecksum(object),
      materialChecksum: materialChecksum(object),
    });
  });
  return out;
}

function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * fraction) - 1)
  );
  return sortedValues[index] ?? 0;
}

function rounded(value: number, precision: number = 2): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

export interface FramePacingSummary {
  sampleCount: number;
  averageFrameMs: number;
  p50FrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  frameTimeStdDevMs: number;
  onePercentLowFps: number;
  worstFrameMs: number;
  averageFps: number;
  framesOver16_7Ms: number;
  framesOver25Ms: number;
  framesOver50Ms: number;
}

/** Summarize one contiguous render sample without hiding slow or invalid frames. */
export function summarizeFramePacing(frameTimes: readonly number[]): FramePacingSummary {
  const values = frameTimes.filter(
    (value) => Number.isFinite(value) && value > 0 && value < 120_000
  );
  const sorted = [...values].sort((left, right) => left - right);
  const average =
    values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
  const variance =
    values.length > 0
      ? values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length
      : 0;
  const slowSampleCount = values.length > 0 ? Math.max(1, Math.ceil(values.length * 0.01)) : 0;
  const slowestFrames = slowSampleCount > 0 ? sorted.slice(-slowSampleCount) : [];
  const slowestAverage =
    slowestFrames.length > 0
      ? slowestFrames.reduce((total, value) => total + value, 0) / slowestFrames.length
      : 0;

  return {
    sampleCount: values.length,
    averageFrameMs: rounded(average),
    p50FrameMs: rounded(percentile(sorted, 0.5)),
    p95FrameMs: rounded(percentile(sorted, 0.95)),
    p99FrameMs: rounded(percentile(sorted, 0.99)),
    frameTimeStdDevMs: rounded(Math.sqrt(variance)),
    onePercentLowFps: rounded(slowestAverage > 0 ? 1000 / slowestAverage : 0),
    worstFrameMs: rounded(sorted.at(-1) ?? 0),
    averageFps: rounded(average > 0 ? 1000 / average : 0),
    framesOver16_7Ms: values.filter((value) => value > 16.7).length,
    framesOver25Ms: values.filter((value) => value > 25).length,
    framesOver50Ms: values.filter((value) => value > 50).length,
  };
}

const MOTION_NUMBER_KEYS = [
  'speed',
  'acceleration',
  'steeringAngle',
  'innerSteeringAngle',
  'outerSteeringAngle',
  'wheelRotation',
  'wheelTravel',
  'routeDistance',
  'forkHeight',
  'mastTilt',
  'trailerAngle',
  'articulation',
  'doorOpenAmount',
  'landingGearAmount',
] as const satisfies ReadonlyArray<keyof RuntimeMotionTelemetry>;

/** Read only deliberately published, finite vehicle telemetry from scene userData. */
export function readRuntimeMotionTelemetry(
  userData: Record<string, unknown>
): RuntimeMotionTelemetry {
  const telemetry: RuntimeMotionTelemetry = {};
  MOTION_NUMBER_KEYS.forEach((key) => {
    const value = userData[key];
    if (typeof value === 'number' && Number.isFinite(value)) telemetry[key] = rounded(value, 4);
  });
  if (userData.cargo === 'pallet' || userData.cargo === 'empty') telemetry.cargo = userData.cargo;
  const stringKeys = ['loadPhase', 'servicePhase', 'stopReason'] as const;
  stringKeys.forEach((key) => {
    if (typeof userData[key] === 'string') telemetry[key] = userData[key];
  });
  const booleanKeys = [
    'active',
    'parkingBrake',
    'chocksDeployed',
    'dockLocked',
    'levelerDeployed',
    'safetyHold',
    'stopped',
  ] as const;
  booleanKeys.forEach((key) => {
    if (typeof userData[key] === 'boolean') telemetry[key] = userData[key];
  });
  return telemetry;
}

/**
 * WebGLRenderer.info normally resets after every render call. A post-processing
 * composer renders the scene and then several fullscreen passes, so reading the
 * default counter after the frame reports only the final pass. Benchmarks turn
 * auto-reset off and accumulate the full measured window; normalize that total
 * back to a representative per-frame count for comparable reports.
 */
export function rendererCounterPerFrame(
  total: number,
  sampleCount: number,
  cumulative: boolean
): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const divisor = cumulative ? Math.max(1, sampleCount) : 1;
  return Math.round(total / divisor);
}

/** JSON has no NaN or Infinity; a poisoned counter must not arrive as a 0. */
const finiteOrNull = (value: number): number | null => (Number.isFinite(value) ? value : null);

/** Swapped in for the benchmark route so its overrides never reach localStorage. */
const NO_PERSIST: PersistStorage<unknown> = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const RuntimeController: React.FC<RuntimeControllerProps> = ({
  adaptiveEnabled,
  orbitControlsRef,
}) => {
  const mode = getRuntimeMode();
  const { camera, gl, scene, controls } = useThree();
  const firstFrameAtRef = useRef<number | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  // Every rendered frame since reset(), including those the finite/range filter
  // drops from frameTimesRef. With autoReset off, gl.info accumulates across all
  // of them, so this - not the frame-time buffer - is the per-frame divisor.
  const renderedFramesRef = useRef(0);
  const longTasksRef = useRef<Array<{ startTime: number; duration: number }>>([]);
  const drawingBufferSizeRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const lastReplayCaptureRef = useRef(0);

  useAdaptiveQuality(adaptiveEnabled && !mode.benchmark);

  // Screenshot bridge: re-render and read back in one tick, because the
  // context does not preserve its drawing buffer between frames.
  useEffect(() => {
    registerSceneCapture(() => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/png');
    });
    return () => registerSceneCapture(null);
  }, [gl, scene, camera]);

  useEffect(() => {
    if (!mode.benchmark) return undefined;

    const previousAutoReset = gl.info.autoReset;
    gl.info.autoReset = false;
    gl.info.reset();

    return () => {
      gl.info.reset();
      gl.info.autoReset = previousAutoReset;
    };
  }, [gl, mode.benchmark]);

  useEffect(() => {
    if (mode.benchmark) return;
    const diagnostics = useIncidentReplayStore.getState();
    diagnostics.recordCommand({
      timestamp: Date.now(),
      category: 'control',
      action: 'session_started',
      data: {
        quality: useGraphicsStore.getState().graphics.quality,
        seed: diagnostics.simulationSeed,
      },
    });

    let safetySignature = '';
    let decisionSignature = '';
    let truckSignature = '';

    const unsubscribeGame = useGameSimulationStore.subscribe((state, previous) => {
      if (state.gameSpeed !== previous.gameSpeed) {
        useIncidentReplayStore.getState().recordCommand({
          timestamp: Date.now(),
          category: 'control',
          action: 'game_speed_changed',
          data: { value: state.gameSpeed },
        });
      }
      if (state.weather !== previous.weather) {
        useIncidentReplayStore.getState().recordCommand({
          timestamp: Date.now(),
          category: 'control',
          action: 'weather_changed',
          data: { value: state.weather },
        });
      }
      // safetyEvents is replaced immutably; skip the per-frame clock ticks.
      if (state.safetyEvents !== previous.safetyEvents) {
        const event = state.safetyEvents.at(-1);
        const nextSignature = event
          ? `${event.id}:${event.stage}:${event.acknowledgedAt ?? 0}:${event.clearedAt ?? 0}`
          : '';
        if (event && nextSignature !== safetySignature) {
          safetySignature = nextSignature;
          useIncidentReplayStore.getState().recordCommand({
            timestamp: Date.now(),
            category: 'safety',
            action: `${event.kind}_${event.stage}`,
            targetId: event.id,
            data: {
              cause: event.cause,
              severity: event.severity,
              simulated: event.simulated,
            },
          });
        }
      }
    });

    const unsubscribeProduction = useProductionStore.subscribe((state, previous) => {
      if (state.aiDecisions === previous.aiDecisions) return;
      const decision = state.aiDecisions[0];
      const nextSignature = decision
        ? `${decision.id}:${decision.status}:${decision.response?.disposition ?? 'none'}`
        : '';
      if (decision && nextSignature !== decisionSignature) {
        decisionSignature = nextSignature;
        useIncidentReplayStore.getState().recordCommand({
          timestamp: Date.now(),
          category: 'ai',
          action: decision.response?.disposition ?? decision.status,
          targetId: decision.id,
          data: {
            type: decision.type,
            machineId: decision.machineId ?? null,
          },
        });
      }
    });

    const unsubscribeTrucks = useTruckScheduleStore.subscribe((state) => {
      const nextSignature = [
        state.truckSchedule.shipping.truckDocked,
        state.truckSchedule.shipping.departureCount,
        state.truckSchedule.receiving.truckDocked,
        state.truckSchedule.receiving.departureCount,
      ].join(':');
      if (nextSignature === truckSignature) return;
      truckSignature = nextSignature;
      useIncidentReplayStore.getState().recordCommand({
        timestamp: Date.now(),
        category: 'vehicle',
        action: 'truck_schedule_transition',
        data: {
          shippingDocked: state.truckSchedule.shipping.truckDocked,
          shippingDepartures: state.truckSchedule.shipping.departureCount,
          receivingDocked: state.truckSchedule.receiving.truckDocked,
          receivingDepartures: state.truckSchedule.receiving.departureCount,
        },
      });
    });

    return () => {
      unsubscribeGame();
      unsubscribeProduction();
      unsubscribeTrucks();
    };
  }, [mode.benchmark]);

  useEffect(() => {
    const previousSuggestions = useFPSStore.getState().qualitySuggestionsEnabled;
    if (adaptiveEnabled) {
      useFPSStore.getState().setQualitySuggestionsEnabled(false);
    }
    return () => {
      useFPSStore.getState().setQualitySuggestionsEnabled(previousSuggestions);
    };
  }, [adaptiveEnabled]);

  useEffect(() => {
    if (!mode.benchmark) return;

    // Detach persistence before any override. A closed tab or reload never runs
    // this effect's cleanup, so an override that reached localStorage would
    // freeze the clock and pin the benchmark's quality, weather, PA and SCADA
    // settings on the next ordinary visit.
    const previousGraphicsStorage = useGraphicsStore.persist.getOptions().storage;
    const previousPAStorage = useAnnouncementsStore.persist.getOptions().storage;
    const previousGameStorage = useGameSimulationStore.persist.getOptions().storage;
    useGraphicsStore.persist.setOptions({ storage: NO_PERSIST });
    useAnnouncementsStore.persist.setOptions({ storage: NO_PERSIST });
    useGameSimulationStore.persist.setOptions({ storage: NO_PERSIST });

    const previousGraphics = useGraphicsStore.getState().graphics;
    const previousPAMode = useAnnouncementsStore.getState().mode;
    const previousGame = useGameSimulationStore.getState();
    const previousGameInputs = {
      gameTime: previousGame.gameTime,
      gameSpeed: previousGame.gameSpeed,
      weather: previousGame.weather,
    };
    useGraphicsStore.getState().setGraphicsQuality(mode.quality);
    useGraphicsStore.getState().setSCADAEnabled(mode.scadaEnabled);
    useAnnouncementsStore.getState().setMode(mode.paMode);
    const game = useGameSimulationStore.getState();
    game.setGameTime(mode.gameTime);
    game.setGameSpeed(mode.motionCapture ? 180 : 0);
    game.setWeather(mode.weather);

    const benchmarkCamera = resolveBenchmarkCamera(
      mode.benchmarkScene,
      mode.gameTime,
      mode.weather
    );
    const perspectiveCamera = camera instanceof THREE.PerspectiveCamera ? camera : null;
    const previousFov = perspectiveCamera?.fov;
    camera.position.set(...benchmarkCamera.position);
    camera.lookAt(...benchmarkCamera.target);
    if (perspectiveCamera && benchmarkCamera.fov) perspectiveCamera.fov = benchmarkCamera.fov;
    camera.updateProjectionMatrix();

    const orbitControls = controls as OrbitLikeControls | null;
    if (orbitControls?.target) {
      orbitControls.target.set(...benchmarkCamera.target);
      orbitControls.update?.();
    }

    return () => {
      // Benchmark and demo inputs are ephemeral and never reach localStorage:
      // persistence stays detached for the life of the route. Restore the
      // in-memory preferences first (those writes still go to the no-op), and
      // only then reattach storage, so the stored values stay pre-benchmark.
      useGraphicsStore.setState({ graphics: previousGraphics });
      useAnnouncementsStore.getState().setMode(previousPAMode);
      if (perspectiveCamera && previousFov !== undefined) {
        perspectiveCamera.fov = previousFov;
        perspectiveCamera.updateProjectionMatrix();
      }
      const currentGame = useGameSimulationStore.getState();
      currentGame.setGameTime(previousGameInputs.gameTime);
      currentGame.setGameSpeed(previousGameInputs.gameSpeed);
      currentGame.setWeather(previousGameInputs.weather);
      useGraphicsStore.persist.setOptions({ storage: previousGraphicsStorage });
      useAnnouncementsStore.persist.setOptions({ storage: previousPAStorage });
      useGameSimulationStore.persist.setOptions({ storage: previousGameStorage });
    };
  }, [camera, controls, mode, scene]);

  useEffect(() => {
    let observer: PerformanceObserver | null = null;
    // Only benchmark runs read longTasks, and only they call reset(); observing
    // on an ordinary visit would grow the buffer for the whole session.
    if (mode.benchmark && typeof PerformanceObserver !== 'undefined') {
      try {
        observer = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            longTasksRef.current.push({
              startTime: rounded(entry.startTime),
              duration: rounded(entry.duration),
            });
          });
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        observer = null;
      }
    }

    const reset = (): void => {
      frameTimesRef.current = [];
      renderedFramesRef.current = 0;
      longTasksRef.current = [];
      gl.info.reset();
    };

    let trackedMotionObjects: THREE.Object3D[] = [];
    const refreshTrackedMotionObjects = (): void => {
      trackedMotionObjects = [];
      scene.traverse((object) => {
        const forkliftId =
          typeof object.userData.forkliftId === 'string' ? object.userData.forkliftId : null;
        const isTruck = object.name === 'shipping-truck' || object.name === 'receiving-truck';
        if (forkliftId || isTruck) trackedMotionObjects.push(object);
      });
    };
    const motionPosition = new THREE.Vector3();
    const motionQuaternion = new THREE.Quaternion();
    const motionEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const motionSnapshot = (): RuntimeMotionState => {
      if (
        trackedMotionObjects.length < 4 ||
        trackedMotionObjects.some((object) => object.parent === null)
      ) {
        refreshTrackedMotionObjects();
      }

      const entities: RuntimeMotionEntity[] = trackedMotionObjects.map((object) => {
        const forkliftId =
          typeof object.userData.forkliftId === 'string' ? object.userData.forkliftId : null;
        object.getWorldPosition(motionPosition);
        object.getWorldQuaternion(motionQuaternion);
        motionEuler.setFromQuaternion(motionQuaternion, 'YXZ');
        const phase = typeof object.userData.phase === 'string' ? object.userData.phase : undefined;
        return {
          id: forkliftId ?? object.name,
          type: forkliftId ? 'forklift' : 'truck',
          position: [
            rounded(motionPosition.x),
            rounded(motionPosition.y),
            rounded(motionPosition.z),
          ],
          rotationY: rounded(motionEuler.y, 4),
          ...(phase ? { phase } : {}),
          ...readRuntimeMotionTelemetry(object.userData),
        };
      });
      entities.sort((left, right) => left.id.localeCompare(right.id));
      return {
        gameSpeed: useGameSimulationStore.getState().gameSpeed,
        productionSpeed: useProductionStore.getState().productionSpeed,
        materialSimulationTime: rounded(useMaterialFlowStore.getState().simulationTime),
        entities,
      };
    };

    const namedObjectPosition = new THREE.Vector3();
    const namedObjectsSnapshot = (names: string[]): RuntimeNamedObjectPose[] => {
      scene.updateMatrixWorld(true);
      return names.flatMap((name) => {
        const object = scene.getObjectByName(name);
        if (!object) return [];
        object.getWorldPosition(namedObjectPosition);
        return [
          {
            name,
            position: [
              rounded(namedObjectPosition.x),
              rounded(namedObjectPosition.y),
              rounded(namedObjectPosition.z),
            ],
            rotation: [
              rounded(object.rotation.x, 4),
              rounded(object.rotation.y, 4),
              rounded(object.rotation.z, 4),
            ],
            visible: object.visible,
          },
        ];
      });
    };

    const checkpointSnapshot = (): RuntimeCheckpointState[] =>
      (['receiving-checkpoint', 'shipping-checkpoint'] as const).flatMap((id) => {
        const object = scene.getObjectByName(id);
        if (!object) return [];
        const telemetry = readRuntimeCheckpointTelemetry(id, object.userData);
        return telemetry ? [telemetry] : [];
      });

    const snapshot = (): RuntimeTelemetrySnapshot => {
      const values = frameTimesRef.current;
      const framePacing = summarizeFramePacing(values);
      const bufferSize = gl.getDrawingBufferSize(drawingBufferSizeRef.current);
      const cssWidth = Math.max(1, gl.domElement.clientWidth);
      const cssHeight = Math.max(1, gl.domElement.clientHeight);
      const graphics = useGraphicsStore.getState().graphics;
      const cumulativeRendererInfo = mode.benchmark && !gl.info.autoReset;
      const context = gl.getContext();
      const debugRendererInfo = context.getExtension('WEBGL_debug_renderer_info');
      const vendor = String(
        debugRendererInfo
          ? context.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
          : context.getParameter(context.VENDOR)
      );
      const adapter = String(
        debugRendererInfo
          ? context.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
          : context.getParameter(context.RENDERER)
      );
      const geometryIds = new Set<string>();
      const materialIds = new Set<string>();
      const humanSceneObjects = new Set<string>();
      const sceneGraph: RuntimeSceneGraphStats = {
        objects: 0,
        meshes: 0,
        visibleMeshes: 0,
        instancedMeshes: 0,
        uniqueGeometries: 0,
        uniqueMaterials: 0,
        topBranches: [],
      };
      scene.traverse((object) => {
        sceneGraph.objects += 1;
        const objectName = object.name.toLowerCase();
        if (
          objectName.startsWith('worker-') ||
          objectName.startsWith('remote-player') ||
          objectName === 'seated-vehicle-operator' ||
          objectName.startsWith('dock-spotter') ||
          objectName.startsWith('warehouse-worker') ||
          typeof object.userData.workerId === 'string' ||
          typeof object.userData.operatorName === 'string'
        ) {
          humanSceneObjects.add(object.name || object.type);
        }
        if (!(object instanceof THREE.Mesh)) return;
        sceneGraph.meshes += 1;
        if (isVisibleInTree(object)) sceneGraph.visibleMeshes += 1;
        if (object instanceof THREE.InstancedMesh) sceneGraph.instancedMeshes += 1;
        if (object.geometry) geometryIds.add(object.geometry.uuid);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => materialIds.add(material.uuid));
      });
      sceneGraph.uniqueGeometries = geometryIds.size;
      sceneGraph.uniqueMaterials = materialIds.size;
      // Shared with materialAudit() so both tables bucket meshes identically.
      const branchRoot = findBranchRoot(scene);
      sceneGraph.topBranches = branchRoot.children
        .map((branch, index) => {
          let objects = 0;
          let meshes = 0;
          const branchGeometries = new Set<string>();
          const branchMaterials = new Set<string>();
          branch.traverse((object) => {
            objects += 1;
            if (!(object instanceof THREE.Mesh)) return;
            meshes += 1;
            if (object.geometry) branchGeometries.add(object.geometry.uuid);
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => branchMaterials.add(material.uuid));
          });
          return {
            index,
            name: branch.name || '(unnamed)',
            type: branch.type,
            objects,
            meshes,
            uniqueGeometries: branchGeometries.size,
            uniqueMaterials: branchMaterials.size,
            ...(branch.userData.staticBatchStats
              ? { staticBatchStats: branch.userData.staticBatchStats }
              : {}),
          };
        })
        .sort((a, b) => b.meshes - a.meshes)
        .slice(0, 20);

      scene.updateMatrixWorld(true);
      const motion = motionSnapshot();
      const checkpoints = checkpointSnapshot();
      const worldIntegrity = inspectWorldIntegrity(scene);
      const staticBatches: RuntimeStaticBatchReport[] = [];
      scene.traverse((object) => {
        const stats = object.userData?.staticBatchStats as
          | Omit<RuntimeStaticBatchReport, 'name'>
          | undefined;
        if (!stats) return;
        staticBatches.push({ name: object.name || object.type, ...stats });
      });
      const humanPresence = {
        passed: humanSceneObjects.size === 0,
        workerStoreCount: 0,
        sceneObjects: [...humanSceneObjects].sort(),
      };
      const diagnosticRays = Object.fromEntries(
        [
          ['centre', 0, 0],
          ['top', 0, 0.9],
          ['upperLeft', -0.8, 0.8],
          ['upperRight', 0.8, 0.8],
          ['lowerCentre', 0, -0.65],
          ['lowerLeft', -0.65, -0.65],
          ['lowerRight', 0.65, -0.65],
        ].map(([label, x, y]) => {
          raycasterRef.current.setFromCamera(new THREE.Vector2(x as number, y as number), camera);
          const hits = raycasterRef.current
            .intersectObjects(scene.children, true)
            // Raycaster tests layers, never `visible`: drop hidden subtrees.
            .filter((hit) => isVisibleInTree(hit.object))
            .slice(0, 6)
            .map((hit) => {
              const object = hit.object as THREE.Mesh;
              const firstMaterial = Array.isArray(object.material)
                ? object.material[0]
                : object.material;
              const materialWithSurface = firstMaterial as THREE.Material & {
                color?: THREE.Color;
                map?: THREE.Texture | null;
              };
              return {
                name: object.name || object.parent?.name || '(unnamed)',
                type: object.type,
                distance: rounded(hit.distance),
                material: firstMaterial?.name || firstMaterial?.type || '(none)',
                materialColor: materialWithSurface.color?.getHexString() ?? null,
                map: materialWithSurface.map?.name || materialWithSurface.map?.source?.uuid || null,
                receiveShadow: object.receiveShadow,
                renderOrder: object.renderOrder,
              };
            });
          return [label as string, hits];
        })
      );
      const seenShaders = new Set<string>();
      const shaderStates: RuntimeShaderState[] = [];
      const seenTextureIssues = new Set<string>();
      const textureIssues: RuntimeTextureIssue[] = [];
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        objectMaterials.forEach((material) => {
          Object.entries(material).forEach(([slot, value]) => {
            if (!(value instanceof THREE.Texture) || value.version === 0 || value.image !== null) {
              return;
            }
            const key = `${material.uuid}:${slot}:${value.uuid}`;
            if (seenTextureIssues.has(key) || textureIssues.length >= 100) return;
            seenTextureIssues.add(key);
            textureIssues.push({
              object: object.name || object.parent?.name || '(unnamed)',
              material: material.name || material.type,
              slot,
              texture: value.name || value.uuid,
            });
          });
          if (!(material instanceof THREE.ShaderMaterial) || seenShaders.has(material.uuid)) return;
          seenShaders.add(material.uuid);
          const uniforms = Object.fromEntries(
            Object.entries(material.uniforms)
              .slice(0, 24)
              .map(([name, uniform]) => {
                const value = uniform.value;
                if (typeof value === 'number') return [name, rounded(value, 4)];
                if (value instanceof THREE.Color) return [name, `#${value.getHexString()}`];
                if (value instanceof THREE.Vector2 || value instanceof THREE.Vector3) {
                  return [name, value.toArray().map((component) => rounded(component, 4))];
                }
                return [name, typeof value];
              })
          );
          shaderStates.push({
            name: material.name || material.type,
            cacheKey: material.customProgramCacheKey(),
            uniforms,
          });
        });
      });

      return {
        capturedAt: rounded(performance.now()),
        ready: firstFrameAtRef.current !== null,
        firstFrameAt: firstFrameAtRef.current,
        ...framePacing,
        longTasks: [...longTasksRef.current],
        renderer: {
          vendor,
          adapter,
          calls: rendererCounterPerFrame(
            gl.info.render.calls,
            renderedFramesRef.current,
            cumulativeRendererInfo
          ),
          triangles: rendererCounterPerFrame(
            gl.info.render.triangles,
            renderedFramesRef.current,
            cumulativeRendererInfo
          ),
          lines: rendererCounterPerFrame(
            gl.info.render.lines,
            renderedFramesRef.current,
            cumulativeRendererInfo
          ),
          points: rendererCounterPerFrame(
            gl.info.render.points,
            renderedFramesRef.current,
            cumulativeRendererInfo
          ),
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
          raw: {
            frame: finiteOrNull(gl.info.render.frame),
            calls: finiteOrNull(gl.info.render.calls),
            triangles: finiteOrNull(gl.info.render.triangles),
            lines: finiteOrNull(gl.info.render.lines),
            points: finiteOrNull(gl.info.render.points),
            autoReset: gl.info.autoReset,
          },
        },
        sceneGraph,
        canvas: {
          cssWidth,
          cssHeight,
          bufferWidth: bufferSize.x,
          bufferHeight: bufferSize.y,
          effectiveDpr: rounded(bufferSize.x / cssWidth),
        },
        camera: {
          position: [
            rounded(camera.position.x),
            rounded(camera.position.y),
            rounded(camera.position.z),
          ],
          fov: camera instanceof THREE.PerspectiveCamera ? rounded(camera.fov) : 0,
          near: camera instanceof THREE.PerspectiveCamera ? rounded(camera.near) : 0,
          far: camera instanceof THREE.PerspectiveCamera ? rounded(camera.far) : 0,
        },
        diagnosticRays,
        shaderStates,
        textureIssues,
        worldIntegrity,
        staticBatches,
        humanPresence,
        motion,
        checkpoints,
        audio: audioManager.getDiagnostics(),
        sceneChildren: scene.children.length,
        quality: graphics.quality,
        resolutionScale: graphics.resolutionScale,
      };
    };

    window.__MILLOS_RUNTIME__ = {
      version: 1,
      mode,
      ready: firstFrameAtRef.current !== null,
      firstFrameAt: firstFrameAtRef.current,
      reset,
      snapshot,
      motionSnapshot,
      materialAudit: () => auditMaterials(scene),
      lightRig: () => reportLights(scene, gl),
      inspectObjects: (query, limit = 12) => reportObjects(scene, query, limit),
      sampleObjects: (query, limit = 400) => sampleObjects(scene, query, limit),
      checkpointSnapshot,
      namedObjectsSnapshot,
      setCameraPose: (position, target) => {
        camera.position.set(...position);
        camera.lookAt(...target);
        const orbitControls = orbitControlsRef?.current ?? (controls as OrbitLikeControls | null);
        orbitControls?.target?.set(...target);
        orbitControls?.update?.();
      },
      setPerfDebug: (patch) => {
        useGraphicsStore.setState((state) => ({
          graphics: {
            ...state.graphics,
            perfDebug: {
              ...state.graphics.perfDebug,
              ...patch,
            },
          },
        }));
      },
    };
    const removeAgentRuntime = installMillOSAgentRuntime(window);

    return () => {
      observer?.disconnect();
      removeAgentRuntime();
      delete window.__MILLOS_RUNTIME__;
    };
  }, [camera, controls, gl, mode, orbitControlsRef, scene]);

  useFrame((_state, delta) => {
    renderedFramesRef.current += 1;
    const frameMs = delta * 1000;
    // Preserve pathological frames so the benchmark cannot report 0 FPS with
    // a misleading 0 ms percentile merely because every frame exceeded 5 s.
    if (Number.isFinite(frameMs) && frameMs > 0 && frameMs < 120000) {
      frameTimesRef.current.push(frameMs);
      // Trim in blocks: a per-frame shift() is an O(n) reindex inside the
      // instrument itself. A benchmark window (clamped to 300 s) must fit
      // whole even at high refresh, or the pacing stats cover only its tail.
      const frameCap = mode.benchmark ? 72000 : 8000;
      if (frameTimesRef.current.length > frameCap) {
        frameTimesRef.current.splice(0, frameTimesRef.current.length - Math.round(frameCap * 0.9));
      }
    }

    if (!mode.benchmark) {
      const now = performance.now();
      if (now - lastReplayCaptureRef.current >= 1000) {
        lastReplayCaptureRef.current = now;
        const production = useProductionStore.getState();
        const alerts = useUIStore.getState().alerts;
        useIncidentReplayStore.getState().recordReplayFrame({
          timestamp: Date.now(),
          machineStates: production.machines.map((machine) => ({
            id: machine.id,
            status: machine.status,
            metrics: {
              rpm: machine.metrics.rpm,
              temperature: machine.metrics.temperature,
              vibration: machine.metrics.vibration,
              load: machine.metrics.load,
              wear: machine.metrics.wear,
              efficiency: machine.metrics.efficiency,
            },
          })),
          mobileEquipmentPositions: [],
          alerts: alerts.slice(0, 20).map((alert) => ({
            id: alert.id,
            type: alert.type,
            message: alert.message,
          })),
        });
      }
    }

    if (firstFrameAtRef.current !== null) return;

    firstFrameAtRef.current = rounded(performance.now());
    document.documentElement.dataset.sceneReady = 'true';
    performance.mark('millos:first-frame');
    window.dispatchEvent(
      new CustomEvent('millos:first-frame', {
        detail: { firstFrameAt: firstFrameAtRef.current },
      })
    );

    if (window.__MILLOS_RUNTIME__) {
      window.__MILLOS_RUNTIME__.ready = true;
      window.__MILLOS_RUNTIME__.firstFrameAt = firstFrameAtRef.current;
    }
  }, -1000);

  return null;
};
