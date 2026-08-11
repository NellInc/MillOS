import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
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
  steeringAngle?: number;
  wheelRotation?: number;
  forkHeight?: number;
  mastTilt?: number;
  trailerAngle?: number;
  doorOpenAmount?: number;
  landingGearAmount?: number;
  cargo?: 'pallet' | 'empty';
  stopped?: boolean;
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
  worstFrameMs: number;
  averageFps: number;
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
  motion: RuntimeMotionState;
  audio: ReturnType<typeof audioManager.getDiagnostics>;
  sceneChildren: number;
  quality: string;
  resolutionScale: number;
}

export interface MillOSRuntimeTelemetry {
  version: 1;
  mode: RuntimeMode;
  ready: boolean;
  firstFrameAt: number | null;
  reset: () => void;
  snapshot: () => RuntimeTelemetrySnapshot;
  motionSnapshot: () => RuntimeMotionState;
  setPerfDebug: (patch: Partial<PerfDebugSettings>) => void;
}

declare global {
  interface Window {
    __MILLOS_RUNTIME__?: MillOSRuntimeTelemetry;
  }
}

interface RuntimeControllerProps {
  adaptiveEnabled: boolean;
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
  personnel: SITE_LAYOUT.cameras.personnel,
  'personnel-close': SITE_LAYOUT.cameras.personnelClose,
  'personnel-feminine': SITE_LAYOUT.cameras.personnelFeminine,
  forklift: SITE_LAYOUT.cameras.forklift,
  shipping: SITE_LAYOUT.cameras.shipping,
  receiving: SITE_LAYOUT.cameras.receiving,
  yard: SITE_LAYOUT.cameras.yard,
  water: SITE_LAYOUT.cameras.water,
  village: SITE_LAYOUT.cameras.village,
  farm: SITE_LAYOUT.cameras.farm,
  garage: SITE_LAYOUT.cameras.garage,
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

export function resolveBenchmarkGameSpeed(scene: BenchmarkScene, motionCapture: boolean): number {
  if (!motionCapture) return 0;

  // The close cameras target named workers at their declared initial
  // positions. Advancing the simulation during warmup lets those workers walk
  // out of a two-metre portrait frame before evidence is captured.
  if (scene === 'personnel-close' || scene === 'personnel-feminine') return 0;
  return 180;
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

const MOTION_NUMBER_KEYS = [
  'speed',
  'steeringAngle',
  'wheelRotation',
  'forkHeight',
  'mastTilt',
  'trailerAngle',
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
  if (typeof userData.stopped === 'boolean') telemetry.stopped = userData.stopped;
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

export const RuntimeController: React.FC<RuntimeControllerProps> = ({ adaptiveEnabled }) => {
  const mode = getRuntimeMode();
  const { camera, gl, scene, controls } = useThree();
  const firstFrameAtRef = useRef<number | null>(null);
  const frameTimesRef = useRef<number[]>([]);
  const longTasksRef = useRef<Array<{ startTime: number; duration: number }>>([]);
  const drawingBufferSizeRef = useRef(new THREE.Vector2());
  const raycasterRef = useRef(new THREE.Raycaster());
  const lastReplayCaptureRef = useRef(0);

  useAdaptiveQuality(adaptiveEnabled && !mode.benchmark);

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
    });

    const unsubscribeProduction = useProductionStore.subscribe((state) => {
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
            workerId: decision.workerId ?? null,
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
    game.setGameSpeed(resolveBenchmarkGameSpeed(mode.benchmarkScene, mode.motionCapture));
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
      // Benchmark and demo inputs are ephemeral. Restore ordinary user
      // preferences before the isolated route closes so measurement never
      // overwrites the next normal visit.
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
    };
  }, [camera, controls, mode]);

  useEffect(() => {
    let observer: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== 'undefined') {
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

    const snapshot = (): RuntimeTelemetrySnapshot => {
      const values = frameTimesRef.current;
      const sorted = [...values].sort((a, b) => a - b);
      const average =
        values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0;
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
        if (!(object instanceof THREE.Mesh)) return;
        sceneGraph.meshes += 1;
        if (object.visible) sceneGraph.visibleMeshes += 1;
        if (object instanceof THREE.InstancedMesh) sceneGraph.instancedMeshes += 1;
        if (object.geometry) geometryIds.add(object.geometry.uuid);
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => materialIds.add(material.uuid));
      });
      sceneGraph.uniqueGeometries = geometryIds.size;
      sceneGraph.uniqueMaterials = materialIds.size;
      const branchRoot = scene.children.length === 1 ? scene.children[0] : scene;
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
      const worldIntegrity = inspectWorldIntegrity(scene);
      const diagnosticRays = Object.fromEntries(
        [
          ['centre', 0, 0],
          ['top', 0, 0.9],
          ['upperLeft', -0.8, 0.8],
          ['upperRight', 0.8, 0.8],
        ].map(([label, x, y]) => {
          raycasterRef.current.setFromCamera(new THREE.Vector2(x as number, y as number), camera);
          const hits = raycasterRef.current
            .intersectObjects(scene.children, true)
            .slice(0, 6)
            .map((hit) => {
              const object = hit.object as THREE.Mesh;
              const firstMaterial = Array.isArray(object.material)
                ? object.material[0]
                : object.material;
              return {
                name: object.name || object.parent?.name || '(unnamed)',
                type: object.type,
                distance: rounded(hit.distance),
                material: firstMaterial?.name || firstMaterial?.type || '(none)',
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
        sampleCount: values.length,
        averageFrameMs: rounded(average),
        p50FrameMs: rounded(percentile(sorted, 0.5)),
        p95FrameMs: rounded(percentile(sorted, 0.95)),
        p99FrameMs: rounded(percentile(sorted, 0.99)),
        worstFrameMs: rounded(sorted.at(-1) ?? 0),
        averageFps: rounded(average > 0 ? 1000 / average : 0),
        framesOver50Ms: values.filter((value) => value > 50).length,
        longTasks: [...longTasksRef.current],
        renderer: {
          vendor,
          adapter,
          calls: rendererCounterPerFrame(
            gl.info.render.calls,
            values.length,
            cumulativeRendererInfo
          ),
          triangles: rendererCounterPerFrame(
            gl.info.render.triangles,
            values.length,
            cumulativeRendererInfo
          ),
          lines: rendererCounterPerFrame(
            gl.info.render.lines,
            values.length,
            cumulativeRendererInfo
          ),
          points: rendererCounterPerFrame(
            gl.info.render.points,
            values.length,
            cumulativeRendererInfo
          ),
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
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
        motion,
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

    return () => {
      observer?.disconnect();
      delete window.__MILLOS_RUNTIME__;
    };
  }, [camera, gl, mode, scene]);

  useFrame((_state, delta) => {
    const frameMs = delta * 1000;
    // Preserve pathological frames so the benchmark cannot report 0 FPS with
    // a misleading 0 ms percentile merely because every frame exceeded 5 s.
    if (Number.isFinite(frameMs) && frameMs > 0 && frameMs < 120000) {
      frameTimesRef.current.push(frameMs);
      if (frameTimesRef.current.length > 7200) {
        frameTimesRef.current.shift();
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
          workerPositions: production.workers.map((worker) => ({
            id: worker.id,
            position: worker.position,
            task: worker.currentTask,
          })),
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
