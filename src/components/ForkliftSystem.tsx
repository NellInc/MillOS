import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import {
  registerReplayParticipant,
  isWorkplaceReplayRestoring,
} from '../simulation/workplaceReplayRuntime';
import { useFrame } from '@react-three/fiber';
import { Billboard, Line } from '@react-three/drei';
import { SceneText as Text, sceneTextLegible } from './shared/SceneText';
import { positionRegistry, EntityPosition } from '../utils/positionRegistry';
import { audioManager } from '../utils/audioManager';
import { useAudioInitialized } from '../hooks/useAudioState';
import { useForkliftMetricsSampler } from './useForkliftMetricsSampler';
import { speedZoneLimit, useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useShallow } from 'zustand/react/shallow';
import { getForkliftWarningColor } from '../utils/statusColors';
import { ForkliftModel } from './models';
import {
  applyCargoPresence,
  AUTHORED_PALLET_POSITION,
  FORKLIFT_PALLET_REACH_METRES,
} from './models/ForkliftModel';
import {
  FORKLIFT_BEACON,
  FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT,
  forkliftBeaconLabelHeight,
} from './models/forkliftBeacon';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { ForkliftData } from '../types';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../constants/renderLayers';
import { createLinearDataTexture } from '../utils/textureGenerator';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { useLogisticsLayoutStore } from '../stores/logisticsLayoutStore';
import {
  drivenLogisticsRoute,
  reconcileLogisticsMotion,
  registerLogisticsVehicle,
} from '../simulation/logisticsRuntime';
import {
  planForkliftRouteChange,
  type ForkliftManualMode,
} from '../simulation/forkliftRouteChange';
import { planningRouteActions, protectedEgressApproaches } from '../simulation/layoutPlanning';
import { FORKLIFT_PALLET_CLEARANCE, forkliftInDockLane } from '../constants/dockLoading';
import { plantTimeScale } from '../simulation/pace';
import {
  canPerformForkliftLogisticsAction,
  hydraulicSoundSeconds,
  isForkliftSimulationPaused,
  resolveForkliftMastTilt,
  type ForkliftOperationPhase,
  type ForkliftWaypointAction,
} from '../simulation/forkliftRoute';
import {
  createForkliftRoutePlan,
  createInitialForkliftMotion,
  distanceAheadOnClosedPath,
  FORKLIFT_HOLD_CLEARANCE_METRES,
  forkliftActionHoldDistance,
  forkliftRouteHeading,
  sampleForkliftLoadPose,
  resolveForkliftActionStop,
  forkliftActionPermitted,
  nextForkliftActionCommitment,
  resolveForkliftStopReason,
  stepForkliftMotion,
  type ForkliftLoadPhase,
  type ForkliftRoutePlan,
  type ForkliftStopReason,
} from '../simulation/vehicles/forkliftController';
import {
  sampleArcLengthPath,
  shortestVehicleAngle,
} from '../simulation/vehicles/vehicleKinematics';
import {
  createManualForkliftState,
  FORKLIFT_SEAT_EYE,
  MANUAL_FORK_MAXIMUM_METRES,
  createLaneReturnState,
  findLaneRejoinTarget,
  stepLaneReturn,
  type LaneReturnState,
  stepManualForklift,
  type ManualDriveInput,
  type ManualFootprintBlocked,
  type ManualForkliftState,
} from '../simulation/vehicles/forkliftManualDrive';
import {
  createManualWorldBlocked,
  dockPlatformDetour,
  manualStaticBlocked,
  type ManualWorldFrame,
} from '../simulation/vehicles/forkliftManualWorld';
import { forkliftCrewSite, type ForkliftCrewSite } from '../constants/forkliftCrewLayout';
import {
  forkliftCrewDuty,
  forkliftParkedForCrew,
  forkliftSpellEndTask,
  initialForkliftCrewState,
  isOperatorInCab,
  FORKLIFT_OPERATOR_SCALE,
  operatorSeatPosition,
  dockSpurTwinDistance,
  nearestSpurTurnAhead,
  type ForkliftCrewDuty,
  type ForkliftCrewStation,
} from '../simulation/forkliftCrew';
import { forkliftCrewLive, isForkliftCrewActive } from '../stores/forkliftCrewStore';
import { COMMUNITY_ROSTER } from '../simulation/communityLife';
import { useUIStore } from '../stores/uiStore';
import {
  FORKLIFT_FLEET_TAGS,
  forkliftBoardable,
  manualForkliftInput,
  useForkliftDriveStore,
} from '../stores/forkliftDriveStore';
import { sampleWalkingGroundHeight } from '../utils/castleNavigation';
import { getTerrainGridSegments } from './terrain/terrainTypes';
import {
  cargoStationAllows,
  cargoStationTakesBack,
  cargoStationWorkable,
  FORKLIFT_LOAD_KIND,
  FORKLIFT_STATION_KIND,
  type ForkliftLoadKind,
  placeCargo,
  stepCargoStation,
  takeCargo,
} from '../simulation/forkliftCargoStations';
import { forkliftCargoStation, type CargoStationLive } from '../stores/forkliftCargoStore';
import {
  FORKLIFT_APPROACH_METRES,
  FORKLIFT_APPROACH_SPEED,
  FORKLIFT_INSERT_METRES,
  FORKLIFT_PEDESTRIAN_LOOKAHEAD,
  FORKLIFT_PEDESTRIAN_SLOW_SPEED,
  FORKLIFT_PEDESTRIAN_STOP,
  FORKLIFT_REVERSE_METRES,
  FORKLIFT_STATION_WAIT_METRES,
  forkliftGiveWayExtra,
  forkliftWorkAlong,
  forkliftWorkOffset,
  isSpurMarker,
  markerArrivalHeading,
  nearestPedestrianAhead,
  type PedestrianPoint,
} from '../simulation/vehicles/forkliftWork';
import { ForkliftCargoLoads } from './ForkliftCargoLoads';

/**
 * Manual control of one forklift. 'driven': the player is in the seat.
 * 'lane': the player has left and it returns to its lane (stepLaneReturn),
 * parking and retrying when blocked; the player can always board it again.
 */
type ManualMode = ForkliftManualMode;
/** Metres of route travel over which the rejoin offset fades to nothing. */
const REJOIN_BLEND_METRES = 2;
/**
 * Plant seconds over which it fades even standing still: a forklift handed
 * back at its station waits there, and stood drawn up to 1.5 m off its lane
 * for an operator's whole break.
 */
const REJOIN_BLEND_SECONDS = 3;
/** Heading error within which a forklift standing at its station is lined up with its lane. */
const STATION_ALIGNED_RADIANS = 0.05;
const alignedWithLane = (
  plan: ForkliftRoutePlan,
  motion: { readonly heading: number; readonly routeDistance: number }
): boolean =>
  Math.abs(
    shortestVehicleAngle(motion.heading, forkliftRouteHeading(plan, motion.routeDistance))
  ) <= STATION_ALIGNED_RADIANS;
const ZERO_INPUT: ManualDriveInput = { throttle: 0, steer: 0, lift: 0 };
/** Placeholder until the first manual frame sets the forklift's own test. */
const NEVER_BLOCKED: ManualFootprintBlocked = () => false;

/** Crew point route distance per plan: a layout change makes a new plan. */
const crewDistanceByPlan = new WeakMap<ForkliftRoutePlan, number>();
const crewRouteDistance = (plan: ForkliftRoutePlan, site: ForkliftCrewSite): number => {
  let distance = crewDistanceByPlan.get(plan);
  if (distance === undefined) {
    distance = findLaneRejoinTarget(plan, {
      x: site.crewPoint[0],
      z: site.crewPoint[2],
      heading: site.crewHeading,
    }).distance;
    crewDistanceByPlan.set(plan, distance);
  }
  return distance;
};
/** Unmanned, a forklift moves at walking pace (m/s). */
const UNMANNED_SPEED = 1.2;
/** Within this much route distance past its crew point, it is at the crew point. */
const STATION_OVERSHOOT_METRES = 0.3;
/**
 * Within this much past a handover spot it is close enough: the forklift coasts
 * on after a player takes it, and the operator walks to where it stopped rather
 * than have it lap the route back to them.
 */
const HANDOVER_REACH_METRES = 6;
/** Driver's side handover: this far left of the origin (the stand offset). */
const HANDOVER_SIDE_METRES = 1.15;
/** Driver's (left) side first, then the right. */
const HANDOVER_SIDES = [1, -1] as const;
const NO_HANDOVER_SIDES = [] as const;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * The direction a forklift publishes for traffic checks: where the route goes
 * from here. At a pickup or dropoff that turns, the path's own tangent still
 * points along the arriving leg; the route heading is the leaving one.
 */
const routeDirection = (plan: ForkliftRoutePlan, distance: number): [number, number] => {
  const heading = forkliftRouteHeading(plan, distance);
  return [Math.sin(heading), Math.cos(heading)];
};

/**
 * Per marker, how far short of it the forklift waits while the action is not
 * yet permitted: outside the protected pedestrian approaches, so a forklift
 * waiting for its truck never stands in the dock doorway. One entry per plan.
 */
const holdLegsByPlan = new WeakMap<ForkliftRoutePlan, number[]>();
const markerHoldLegs = (plan: ForkliftRoutePlan): number[] => {
  const cached = holdLegsByPlan.get(plan);
  if (cached) return cached;
  const corridors = protectedEgressApproaches();
  const legs = plan.markers.map((marker) =>
    distanceAheadOnClosedPath(
      plan.path,
      forkliftActionHoldDistance(plan, marker.distance, corridors, FORKLIFT_HOLD_CLEARANCE_METRES),
      marker.distance
    )
  );
  holdLegsByPlan.set(plan, legs);
  return legs;
};

/** Per marker, the twin of its hold point on the leg back, or null (dockSpurTwinDistance). */
const spurTwinsByPlan = new WeakMap<ForkliftRoutePlan, (number | null)[]>();
const markerSpurTwins = (plan: ForkliftRoutePlan): (number | null)[] => {
  const cached = spurTwinsByPlan.get(plan);
  if (cached) return cached;
  const legs = markerHoldLegs(plan);
  const twins = plan.markers.map((marker, index) =>
    dockSpurTwinDistance(plan, marker.distance, legs[index] ?? 0)
  );
  spurTwinsByPlan.set(plan, twins);
  return twins;
};

/** Distance along the route to approach or leave a raised work surface with forks at its height. */
const SURFACE_APPROACH_METRES = 3;
/** Fork height to travel at here: at least a raised surface's height near its marker. */
const travelForkHeight = (plan: ForkliftRoutePlan, routeDistance: number, loaded: boolean) => {
  let surface = 0;
  for (const marker of plan.markers) {
    const height = marker.action.surfaceForkHeight ?? 0;
    if (height <= 0) continue;
    const ahead = distanceAheadOnClosedPath(plan.path, routeDistance, marker.distance);
    const behind = distanceAheadOnClosedPath(plan.path, marker.distance, routeDistance);
    if (Math.min(ahead, behind) <= SURFACE_APPROACH_METRES) surface = Math.max(surface, height);
  }
  if (surface <= 0) return loaded ? FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT : 0;
  return loaded
    ? Math.max(FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT, surface + FORKLIFT_PALLET_CLEARANCE)
    : surface;
};

/**
 * With people in the world, a forklift whose crew has not stepped for this
 * long (CommunityLife remounting, the first frames of a load) stands still
 * rather than work unmanned. Only after it does it fall back to working as if
 * crewed (forkliftCrewStore). Before this a forklift that mounted on its
 * pickup started a full pick in the frame before its crew first stepped, with
 * its operator on a break, and finished it with nobody aboard.
 */
const CREW_FALLBACK_GRACE_MS = 2500;
/** Real seconds between horn blasts: a courtesy, not a running commentary. */
const HORN_COOLDOWN_MS = 20000;
/** Plant seconds standing at a hold or its crew point before the forks go down. */
const FORKS_DOWN_AFTER_SECONDS = 2;

/**
 * What a forklift was doing when it unmounted (a scene reload, an error
 * boundary reset, a hot reload in development), so it carries on where it
 * stood rather than reappearing at its route's start with its load gone.
 */
interface ForkliftMemory {
  pathLength: number;
  motion: ReturnType<typeof createInitialForkliftMotion>;
  actionMarkerIndex: number;
  hasCargo: boolean;
  operation: ForkliftOperationPhase;
  operationTimer: number;
  operationDuration: number;
  forkHeight: number;
  mastTilt: number;
  work: ForkliftWorkState;
  position: [number, number, number];
  heading: number;
}
const forkliftMemory = new Map<string, ForkliftMemory>();

/**
 * Where a forklift starts: its route's first point, unless that is on top of
 * its first job (the shipping lane starts at the collection point), when it
 * starts where it would wait for that job instead, tines clear of the load.
 */
const initialWorkMotion = (
  plan: ForkliftRoutePlan,
  position: readonly [number, number, number],
  forkliftId: string
) => {
  const motion = createInitialForkliftMotion(plan, [...position]);
  // Its operator is off on foot when the session opens (between spells):
  // it stands parked at its crew point, rather than set off unmanned for it.
  const site = forkliftCrewSite(forkliftId);
  const person = site
    ? COMMUNITY_ROSTER.find((candidate) => candidate.id === site.operatorId)
    : undefined;
  if (site && person) {
    const game = useGameSimulationStore.getState();
    const live = forkliftCrewLive(forkliftId);
    const state = live.state ?? initialForkliftCrewState(person, game.gameDay * 24 + game.gameTime);
    if (!isOperatorInCab(state)) {
      const routeDistance = crewRouteDistance(plan, site);
      const at = sampleArcLengthPath(plan.path, routeDistance);
      return {
        ...motion,
        routeDistance,
        x: at.x,
        z: at.z,
        heading: forkliftRouteHeading(plan, routeDistance),
      };
    }
  }
  const first = plan.markers[0];
  if (!first || (first.action.type !== 'pickup' && first.action.type !== 'dropoff')) return motion;
  const kind = FORKLIFT_STATION_KIND[forkliftId]?.[first.action.type];
  const wait = FORKLIFT_INSERT_METRES + (kind === 'build' ? FORKLIFT_STATION_WAIT_METRES : 0);
  const ahead = distanceAheadOnClosedPath(plan.path, motion.routeDistance, first.distance);
  if (ahead >= wait) return motion;
  const total = plan.path.totalLength;
  const routeDistance = (((first.distance - wait) % total) + total) % total;
  const at = sampleArcLengthPath(plan.path, routeDistance);
  return {
    ...motion,
    routeDistance,
    x: at.x,
    z: at.z,
    heading: forkliftRouteHeading(plan, routeDistance),
  };
};

/** The pick or drop under way: the marker, the forks' line, and the way out. */
interface ForkliftWorkState {
  markerDistance: number;
  heading: number;
  spur: boolean;
  /** Which of its stations the load comes from or goes to (a put-back goes to the pickup's). */
  station?: 'pickup' | 'dropoff';
  /** Fork height of the work surface there (the dock deck, or 0 on the floor). */
  surface?: number;
}

/**
 * Where each station's load stands for this route: on the forks' line, a
 * pallet reach beyond the marker, at the work surface. Rewritten when the
 * route plan changes.
 */
const publishStationPose = (
  plan: ForkliftRoutePlan,
  marker: ForkliftRoutePlan['markers'][number],
  entry: CargoStationLive | null
): void => {
  if (!entry) return;
  const heading = markerArrivalHeading(plan, marker.distance);
  const at = sampleArcLengthPath(plan.path, marker.distance);
  const reach = FORKLIFT_PALLET_REACH_METRES.authored;
  const pose = entry.pose ?? (entry.pose = { x: 0, y: 0, z: 0, heading: 0 });
  pose.x = at.x + Math.sin(heading) * reach;
  pose.z = at.z + Math.cos(heading) * reach;
  pose.y = AUTHORED_PALLET_POSITION[1] + (marker.action.surfaceForkHeight ?? 0);
  pose.heading = heading;
};

/**
 * People a forklift gives way to: everyone on foot in the world, and the
 * player when walking in first person. Gathered once per frame for the fleet
 * into a fixed scratch list.
 */
const PEDESTRIAN_CAPACITY = 96;
interface PedestrianSlot extends PedestrianPoint {
  owner: THREE.Object3D | null;
}
const pedestrianScratch: PedestrianSlot[] = Array.from({ length: PEDESTRIAN_CAPACITY }, () => ({
  x: 0,
  z: 0,
  extra: 0,
  owner: null,
}));
const pedestrianFrame = { frame: -Infinity, count: 0 };
let personnelGroup: THREE.Object3D | null = null;
let personnelLookupFrame = -Infinity;
/**
 * The people in front of forklifts this frame, in `pedestrianScratch`; returns
 * how many to read. `exclude` (the forklift's own operator, who stands at its
 * cab to board it) is moved past the end of the count rather than copied out.
 */
const gatherPedestrians = (
  scene: THREE.Object3D,
  camera: THREE.Camera,
  frame: number,
  exclude: THREE.Object3D | null
): number => {
  if (pedestrianFrame.frame !== frame) {
    pedestrianFrame.frame = frame;
    if ((!personnelGroup || !personnelGroup.parent) && frame - personnelLookupFrame > 2) {
      personnelLookupFrame = frame;
      personnelGroup = scene.getObjectByName('world-personnel') ?? null;
    }
    let count = 0;
    const group = personnelGroup;
    if (group?.visible) {
      for (const person of group.children) {
        if (count >= PEDESTRIAN_CAPACITY - 1) break;
        const extra = forkliftGiveWayExtra(person);
        if (extra < 0) continue;
        const slot = pedestrianScratch[count];
        slot.x = person.position.x;
        slot.z = person.position.z;
        slot.extra = extra;
        slot.owner = person;
        count += 1;
      }
    }
    if (useUIStore.getState().fpsMode && !useForkliftDriveStore.getState().drivenId) {
      const slot = pedestrianScratch[count];
      slot.x = camera.position.x;
      slot.z = camera.position.z;
      slot.extra = 0;
      slot.owner = null;
      count += 1;
    }
    pedestrianFrame.count = count;
  }
  const count = pedestrianFrame.count;
  if (!exclude) return count;
  for (let index = 0; index < count; index += 1) {
    if (pedestrianScratch[index].owner !== exclude) continue;
    const slot = pedestrianScratch[index];
    pedestrianScratch[index] = pedestrianScratch[count - 1];
    pedestrianScratch[count - 1] = slot;
    return count - 1;
  }
  return count;
};
import {
  vehicleTelemetryRegistry,
  type VehicleTelemetrySnapshot,
} from '../simulation/vehicles/vehicleTelemetryRegistry';
import * as THREE from 'three';
import { applyWorldSurface } from '../utils/worldSurface';
import { translate, useT } from '../i18n';
import { forkliftSystemMessages } from './ForkliftSystem.messages';

// Path visualization component - shows forklift routes on the floor. The dashed
// line follows the rounded route; markers sit only on the authored waypoints,
// not on every corner-rounding sample.
const ForkliftPath: React.FC<{
  path: [number, number, number][];
  waypoints: [number, number, number][];
  waypointActions: WaypointAction[];
  color: string;
}> = ({ path, waypoints, waypointActions, color }) => {
  // PERF: Reuse Vector3 objects instead of allocating new ones each path change
  const pointsRef = useRef<THREE.Vector3[]>([]);
  const points = useMemo(() => {
    const pts = pointsRef.current;
    const targetLength = path.length + 1; // +1 for closing the loop
    // Resize array if needed (only grows, never shrinks to avoid allocation churn)
    while (pts.length < targetLength) {
      pts.push(new THREE.Vector3());
    }
    // Update point values
    for (let i = 0; i < path.length; i++) {
      pts[i].set(path[i][0], 0.1, path[i][2]); // Above floor to prevent z-fighting
    }
    // Close the loop
    pts[path.length].copy(pts[0]);
    // Return only the slice we need (in case array is larger from previous path)
    return pts.slice(0, targetLength);
  }, [path]);

  return (
    <group name="forklift-route-path">
      {/* Main path line */}
      <Line
        points={points}
        color={color}
        lineWidth={2}
        dashed
        dashSize={0.5}
        dashScale={2}
        gapSize={0.3}
      />
      {/* Waypoint markers. A closing point that repeats the first is skipped;
          pickup and dropoff stops get a wider ring. */}
      {waypoints.map((point, i) => {
        const isClosingRepeat =
          i > 0 &&
          i === waypoints.length - 1 &&
          point[0] === waypoints[0][0] &&
          point[2] === waypoints[0][2];
        if (isClosingRepeat) return null;
        const next = waypoints[(i + 1) % waypoints.length];
        const isStop =
          waypointActions[i]?.type === 'pickup' || waypointActions[i]?.type === 'dropoff';
        return (
          <group key={`waypoint-${i}-${point[0]}-${point[2]}`} position={[point[0], 0.1, point[2]]}>
            {/* Circle marker */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={isStop ? [0.55, 0.8, 24] : [0.3, 0.5, 16]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
            {/* Direction arrow to next point */}
            <mesh
              rotation={[-Math.PI / 2, 0, Math.atan2(next[0] - point[0], next[2] - point[2])]}
              position={[0, 0.05, 0]}
            >
              <coneGeometry args={[0.2, 0.4, 3]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.4}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

/** Turn rate of the beacon's reflector, in radians per second. */
const BEACON_SWEEP_RATE = 4;

/** Glow brightness (sprite opacity) with the lamp on and between flashes. */
const BEACON_GLOW_ON = 0.85;
const BEACON_GLOW_OFF = 0.2;

/**
 * The glow's falloff: white, alpha from 1 at the centre to 0 at the rim with a
 * soft square-law tail, so the sprite's quad never shows an edge. Shared by
 * every forklift; each one's colour and flash ride its own material.
 */
const BEACON_GLOW_TEXTURE = (() => {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const falloff = Math.max(0, 1 - r);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(255 * falloff * falloff);
    }
  const texture = createLinearDataTexture(data, size, size);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
})();

const BEACON_BASE_MATERIAL = new THREE.MeshStandardMaterial({
  name: 'forklift-beacon-base',
  color: '#1e2124',
  roughness: 0.6,
  metalness: 0.2,
});

/**
 * Rotating safety beacon: base, lens, dome and a turning reflector
 * (`FORKLIFT_BEACON`), plus a small camera-facing glow for its light.
 *
 * THE LIGHT IS MOUNTED UNCONDITIONALLY AND DRIVEN BY `intensity`. It used to be
 * conditionally rendered AND toggled with `visible`, and both are the same
 * mistake: `WebGLRenderer.projectObject` skips invisible objects entirely, so an
 * invisible light leaves the light arrays, `numPointLights` changes, and the
 * program cache key of every material in the scene changes with it. The flash
 * runs at 5-15 Hz, so the renderer was re-acquiring programs and re-uploading
 * every material's uniforms several times a second. Holding the light in the
 * tree at `intensity = 0` keeps the count constant, and gives the beacon real
 * illumination while it is moving rather than only when it stops.
 *
 * The glow is an additive sprite rather than a spotlight for the same reason:
 * a mesh's `visible` flag costs nothing, a light's changes every shader. The
 * real point light is reserved for high and ultra because each point light
 * adds a loop to every lit material in the complete scene. Medium keeps the
 * emissive lens, the turning hot spot and the glow without that cost. The
 * glow replaced an open light cone that read as an editor gizmo
 * (`forkliftBeacon.ts`).
 *
 * The same rule covers LOD: the beacon stays mounted in the far tier, where
 * `showGeometry` hides only the lamp and glow (the billboard has its own
 * beacon mesh), so crossing the LOD distance never changes the light count.
 */
const WarningLight = React.memo<{
  isStopped: boolean;
  isInCrossing: boolean;
  simulationPaused: boolean;
  height: number;
  showGeometry: boolean;
}>(({ isStopped, isInCrossing, simulationPaused, height, showGeometry }) => {
  // Use ref instead of useState to avoid triggering re-renders in useFrame
  const flashRef = useRef(false);
  const glowRef = useRef<THREE.SpriteMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const sweepRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const realLightEnabled = graphicsQuality === 'high' || graphicsQuality === 'ultra';
  // One emissive material for the lens and its dome, flashed in place.
  const lensMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        name: 'forklift-beacon-lens',
        emissiveIntensity: 0.5,
        roughness: 0.3,
        metalness: 0,
        // TRUE, not false: this component renders at `low` as well, where
        // there is no composer and `false` would clamp the lit emissive to a
        // flat white blob instead of letting the Neutral curve roll it off.
        toneMapped: true,
      }),
    []
  );
  useEffect(() => () => lensMaterial.dispose(), [lensMaterial]);

  useFrame((state, delta) => {
    // PERFORMANCE: Skip animations when tab hidden
    if (!isTabVisible || simulationPaused) return;
    if (sweepRef.current) {
      sweepRef.current.rotation.y += BEACON_SWEEP_RATE * Math.min(delta, 0.1);
    }
    // PERFORMANCE: Throttle flash check to every 2nd frame (~30fps is plenty for light flashing)
    if (!shouldRunThisFrame(2)) return;
    // Flash faster when stopped (red), medium for crossing (blue), slower when moving (amber)
    const flashSpeed = isStopped ? 15 : isInCrossing ? 10 : 5;
    const newFlash = Math.sin(state.clock.elapsedTime * flashSpeed) > 0;

    // Update material directly via ref instead of triggering re-render
    if (newFlash !== flashRef.current) {
      flashRef.current = newFlash;
      lensMaterial.emissiveIntensity = newFlash ? 3 : 0.5;
      if (glowRef.current) {
        glowRef.current.opacity = newFlash ? BEACON_GLOW_ON : BEACON_GLOW_OFF;
      }
      if (lightRef.current) {
        lightRef.current.intensity = newFlash ? 1.6 : 0;
      }
    }
  });

  // Red when stopped, blue when in crossing zone, amber when normal
  const color = getForkliftWarningColor(isStopped, isInCrossing);
  useEffect(() => {
    lensMaterial.color.set(color);
    lensMaterial.emissive.set(color);
  }, [lensMaterial, color]);
  const { base, lens, dome, reflector, glow } = FORKLIFT_BEACON;
  const lensCentre = (lens.bottom + lens.top) / 2;

  return (
    <group position={[0, height, FORKLIFT_BEACON.mountZ]}>
      <group visible={showGeometry}>
        <mesh position={[0, (base.bottom + base.top) / 2, 0]} material={BEACON_BASE_MATERIAL}>
          <cylinderGeometry args={[base.radius, base.radius, base.top - base.bottom, 16]} />
        </mesh>
        {/* Lens and dome share the flashing emissive material. */}
        <mesh position={[0, lensCentre, 0]} material={lensMaterial}>
          <cylinderGeometry args={[lens.radius, lens.radius, lens.top - lens.bottom, 16]} />
        </mesh>
        <mesh
          position={[0, dome.bottom, 0]}
          scale={[1, (dome.top - dome.bottom) / dome.radius, 1]}
          material={lensMaterial}
        >
          <sphereGeometry args={[dome.radius, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        {/* The reflector's hot spot, turning round the lens face. */}
        <group ref={sweepRef} position={[0, reflector.y, 0]}>
          <mesh position={[0, 0, reflector.radius + reflector.depth / 2]}>
            <boxGeometry args={[reflector.width, reflector.height, reflector.depth]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
        <sprite
          position={[0, lensCentre, 0]}
          scale={[glow.diameter, glow.diameter, 1]}
          renderOrder={8}
        >
          <spriteMaterial
            ref={glowRef}
            map={BEACON_GLOW_TEXTURE}
            color={color}
            opacity={BEACON_GLOW_OFF}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>
      {realLightEnabled && (
        <pointLight ref={lightRef} color={color} intensity={0} distance={7} decay={2} />
      )}
    </group>
  );
});

/**
 * sRGB of the authored forklift's linear `painted-safety-amber` baseColorFactor
 * (0.6939, 0.3231, 0.0242). Keeps the far LOD the same hue as the near one.
 */
const BILLBOARD_AMBER = '#d99a2b';

/**
 * LOD hysteresis band, in metres.
 *
 * Widened from 50/40. The near model is the 52k-triangle GLB and the far one is
 * a handful of boxes, so the swap is the most visible thing the forklift does;
 * pushing it out removes it from normal camera framing. The band is WIDENED,
 * never narrowed - `distanceTier` is React state written from `useFrame`, so a
 * narrow band makes `setDistanceTier` thrash and re-render every frame.
 */
const FORKLIFT_LOD_FAR_METRES = 62;
/** The fleet tag's em, metres; the status line under it is smaller and hides with it. */
const FORKLIFT_LABEL_FONT_SIZE = 0.17;
const FORKLIFT_LOD_CLOSE_METRES = 50;

// Simplified forklift billboard for distant rendering (50+ units away)
// Uses only 4 meshes instead of ~40+ for massive performance improvement
/**
 * Far-tier LOD materials, and why they carry the same finish as the near model.
 *
 * `test-results/pass7/unfinished-models.mjs` measures this group at 5.5 m per
 * forklift with nothing on it, while `ForkliftModel` finishes every material on
 * the near tier. That is not merely an omission: the LOD swap is a
 * SUBSTITUTION, and the comment on the body colour below already records what
 * that costs — the amber was matched to the authored GLB's linear
 * `painted-safety-amber` precisely so "the LOD swap popped in colour as well as
 * silhouette". An unfinished far tier reintroduces the same class of pop in the
 * SURFACE: a forklift that acquires grime, dust and worn edges the moment it
 * crosses the LOD distance and loses them when it recedes.
 *
 * Module-level and shared across both tiers' instances: `InstancedMesh` and
 * these few meshes are outside `StaticMeshBatch` either way, and one
 * `customProgramCacheKey` serves every profile, so this costs no draw call and
 * no permutation.
 *
 * The beacon is deliberately absent — emissive at 1.1, and `isOutOfSurfaceScope`
 * declines emitters.
 */
const BILLBOARD_MATERIALS = {
  body: applyWorldSurface(
    new THREE.MeshStandardMaterial({ color: BILLBOARD_AMBER, roughness: 0.42, metalness: 0 }),
    'vehicle'
  ),
  cabin: applyWorldSurface(
    new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.8, metalness: 0 }),
    'vehicle'
  ),
  steel: applyWorldSurface(
    new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.4, metalness: 0.85 }),
    'metal'
  ),
  // The near model paints its overhead guard and mast in the dielectric
  // 'structural-graphite' (linear 0.0388, 0.0508, 0.0592 = sRGB #384045,
  // ForkliftModel.tsx), so an amber canopy here popped colour at the swap.
  structural: applyWorldSurface(
    new THREE.MeshStandardMaterial({ color: '#384045', roughness: 0.45, metalness: 0 }),
    'vehicle'
  ),
};

const ForkliftBillboard: React.FC<{
  cargoPresenceRef: React.MutableRefObject<number>;
  load: ForkliftLoadKind;
}> = ({ cargoPresenceRef, load }) => {
  // The far tier draws the same pallet presence as the near models.
  const cargoMeshRef = useRef<THREE.Mesh>(null);
  const cargoMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame(() => {
    if (!isTabVisible) return;
    applyCargoPresence(cargoPresenceRef, cargoMeshRef.current, [
      cargoMaterialRef.current ?? undefined,
    ]);
  });

  return (
    <group name="forklift-billboard">
      {/* Simple body - single box.
          BILLBOARD_AMBER is the sRGB of the authored GLB's linear
          `painted-safety-amber` (0.694, 0.323, 0.024). The old `#f59e0b` was a
          different hue, so the LOD swap popped in colour as well as
          silhouette; matching it leaves only the silhouette delta. */}
      <mesh position={[0, 0.7, -0.35]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.2, 1.8]} />
        <primitive object={BILLBOARD_MATERIALS.body} attach="material" />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 1.5, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.8, 1]} />
        <primitive object={BILLBOARD_MATERIALS.cabin} attach="material" />
      </mesh>
      {/* ROPS canopy and pillars. The near model is 2.3 m tall with an overhead
          guard; without these the far tier is a 1.2 m box and the swap reads as
          a different vehicle rather than a different level of detail. */}
      <mesh position={[0, 2.05, -0.35]} castShadow receiveShadow>
        <boxGeometry args={[1.42, 0.08, 1.22]} />
        <primitive object={BILLBOARD_MATERIALS.structural} attach="material" />
      </mesh>
      {[-0.6, 0.6].map((x) => (
        <mesh key={`rops-${x}`} position={[x, 1.6, -0.85]} castShadow receiveShadow>
          <boxGeometry args={[0.09, 0.9, 0.09]} />
          <primitive object={BILLBOARD_MATERIALS.steel} attach="material" />
        </mesh>
      ))}
      {/* Beacon, so the far silhouette has the same topmost feature. */}
      <mesh position={[0, 2.16, -0.35]}>
        <cylinderGeometry args={[0.09, 0.09, 0.14, 8]} />
        <meshStandardMaterial
          color="#4a3200"
          emissive="#ff8c00"
          emissiveIntensity={1.1}
          roughness={0.35}
          metalness={0}
          toneMapped
        />
      </mesh>
      {/* Mast */}
      <mesh position={[0, 1.2, 0.66]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 2, 0.15]} />
        <primitive object={BILLBOARD_MATERIALS.structural} attach="material" />
      </mesh>
      {/* Cargo - always mounted, opacity from the shared presence. The near
          tiers' travelling load: pallet underside at the 0.32 m travel fork
          height, six courses to 1.52 m, 0.9 x 0.8 m in plan. */}
      <mesh
        ref={cargoMeshRef}
        position={[0, 0.92, FORKLIFT_PALLET_REACH_METRES.compact]}
        castShadow
        receiveShadow
        visible={cargoPresenceRef.current > 0.01}
      >
        <boxGeometry args={[0.9, 1.2, 0.8]} />
        {/* Sacking on a pallet, in OBJECT rest space - the forklift drives, and
            a world-space field would slide the weave across the load. */}
        <meshStandardMaterial
          ref={(mat) => {
            cargoMaterialRef.current = mat;
            if (mat) applyWorldSurface(mat, 'fabric');
          }}
          color={load === 'supplies' ? '#b79a6c' : '#fef3c7'}
          roughness={0.7}
          metalness={0}
          transparent
          opacity={cargoPresenceRef.current}
        />
      </mesh>
    </group>
  );
};

type ForkliftOperation = ForkliftOperationPhase;

type WaypointAction = ForkliftWaypointAction;

interface Forklift {
  id: string;
  position: [number, number, number];
  rotation: number;
  speed: number;
  path: [number, number, number][];
  pathActions: WaypointAction[]; // Action at each waypoint
  pathIndex: number;
  cargo: 'empty' | 'pallet';
}

/** A forklift on its rounded route, keeping the authored waypoints for the overlay. */
interface RoutedForklift extends Forklift {
  authoredPath: [number, number, number][];
  authoredActions: WaypointAction[];
}

const withRoundedRoute = (forklift: Forklift): RoutedForklift => {
  const dock = forklift.id === 'forklift-1' ? 'shipping' : 'receiving';
  const route = drivenLogisticsRoute(dock, forklift.path);
  return {
    ...forklift,
    path: route.path,
    pathActions: route.actions,
    authoredPath: forklift.path,
    authoredActions: forklift.pathActions,
  };
};

// In-world tags use the SCADA vehicle names (tagDatabase FLT01/FLT02) plus the
// forklift's role; data.id stays the key for logic and selection. The role is a
// message key so the tag follows the interface language at render time.
const FORKLIFT_DISPLAY_LABELS: Record<
  string,
  { tag: string; role: 'roleShipping' | 'roleReceiving' }
> = {
  'forklift-1': { tag: FORKLIFT_FLEET_TAGS['forklift-1'], role: 'roleShipping' },
  'forklift-2': { tag: FORKLIFT_FLEET_TAGS['forklift-2'], role: 'roleReceiving' },
};

// Path colors for each forklift
const PATH_COLORS = ['#f59e0b', '#3b82f6']; // Amber for first, blue for second

// Conveyor crossing zones - areas where forklifts must yield
// Placements come from the same layout as the belt geometry.
interface CrossingZone {
  id: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  type: 'conveyor' | 'intersection';
}

const CROSSING_ZONES: CrossingZone[] = Object.values(SITE_LAYOUT.routeHazards).map(
  ({ id, type, bounds }) => ({
    id,
    type,
    xMin: bounds.minX,
    xMax: bounds.maxX,
    zMin: bounds.minZ,
    zMax: bounds.maxZ,
  })
);

// Check if a position is within any crossing zone
const isInCrossingZone = (x: number, z: number): CrossingZone | null => {
  for (const zone of CROSSING_ZONES) {
    if (x >= zone.xMin && x <= zone.xMax && z >= zone.zMin && z <= zone.zMax) {
      return zone;
    }
  }
  return null;
};

// Deterministic reservation table. A crossing belongs to one autonomous
// vehicle until it exits, preventing two independent wait timers from granting
// simultaneous entry on the same frame.
const crossingReservations = new Map<string, string>();

// Crossing zone visual component
const CrossingZoneMarkers: React.FC = () => {
  return (
    <group>
      {CROSSING_ZONES.map((zone) => {
        // Guard against NaN/invalid dimensions
        const xWidth = Math.max(0.1, Math.abs(zone.xMax - zone.xMin));
        const zHeight = Math.max(0.1, Math.abs(zone.zMax - zone.zMin));

        return (
          <group key={zone.id}>
            {/* Hazard stripe markings on floor - raised to prevent z-fighting */}
            <mesh
              position={[(zone.xMin + zone.xMax) / 2, 0.08, zone.zMin]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[xWidth, 0.3]} />
              <meshStandardMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
                roughness={0.85}
              />
            </mesh>
            <mesh
              position={[(zone.xMin + zone.xMax) / 2, 0.08, zone.zMax]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[xWidth, 0.3]} />
              <meshStandardMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
                roughness={0.85}
              />
            </mesh>
            {/* Side markers */}
            <mesh
              position={[zone.xMin, 0.08, (zone.zMin + zone.zMax) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.3, zHeight]} />
              <meshStandardMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
                roughness={0.85}
              />
            </mesh>
            <mesh
              position={[zone.xMax, 0.08, (zone.zMin + zone.zMax) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.3, zHeight]} />
              <meshStandardMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
                roughness={0.85}
              />
            </mesh>
            {/* Warning text */}
            <Text
              surface="painted"
              position={[zone.xMin + 3, 0.1, (zone.zMin + zone.zMax) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.5}
              color="#fbbf24"
              anchorX="center"
              anchorY="middle"
            >
              YIELD
            </Text>
            <Text
              surface="painted"
              position={[zone.xMax - 3, 0.1, (zone.zMin + zone.zMax) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.5}
              color="#fbbf24"
              anchorX="center"
              anchorY="middle"
            >
              YIELD
            </Text>
          </group>
        );
      })}
    </group>
  );
};

/**
 * The speed zones the Safety panel edits, as translucent floor discs with an
 * edge ring, drawn with the crossings while the speed-zone view is on. A zone
 * with a non-finite field is skipped, as speedZoneLimit skips it.
 */
const SPEED_ZONE_FLOOR_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
const SpeedZoneOverlays: React.FC = () => {
  const zones = useSafetyStore((state) => state.speedZones);
  return (
    <group>
      {(Array.isArray(zones) ? zones : []).map((zone, index) => {
        if (!zone || typeof zone !== 'object') return null;
        if (!Number.isFinite(zone.x) || !Number.isFinite(zone.z) || !Number.isFinite(zone.radius))
          return null;
        const radius = Math.max(0.5, zone.radius);
        return (
          <group key={zone.id ?? index}>
            <mesh
              position={[zone.x, FLOOR_LAYERS.grid, zone.z]}
              rotation={SPEED_ZONE_FLOOR_ROTATION}
              renderOrder={RENDER_ORDER.floorMarkings}
            >
              <circleGeometry args={[radius, 48]} />
              <meshBasicMaterial
                color="#38bdf8"
                transparent
                opacity={0.16}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
            <mesh
              position={[zone.x, FLOOR_LAYERS.grid, zone.z]}
              rotation={SPEED_ZONE_FLOOR_ROTATION}
              renderOrder={RENDER_ORDER.floorText}
            >
              <ringGeometry args={[Math.max(0.1, radius - 0.15), radius, 48]} />
              <meshBasicMaterial
                color="#38bdf8"
                transparent
                opacity={0.55}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
                polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};

// ForkliftData is now imported from types.ts - use the canonical definition
// Re-export for backwards compatibility
export type { ForkliftData } from '../types';

interface ForkliftSystemProps {
  showSpeedZones?: boolean;
  onSelectForklift?: (forklift: ForkliftData) => void;
}

export const ForkliftSystem: React.FC<ForkliftSystemProps> = ({
  showSpeedZones = false,
  onSelectForklift,
}) => {
  const layout = useLogisticsLayoutStore((state) => state.layout);
  const forklifts = useMemo<RoutedForklift[]>(
    () =>
      (['shipping', 'receiving'] as const).map((dock, index) =>
        withRoundedRoute({
          id: `forklift-${index + 1}`,
          position: [...layout.routes[dock][0]],
          rotation: index === 0 ? 0 : Math.PI,
          speed: index === 0 ? 3.5 : 3,
          path: layout.routes[dock].map((point) => [...point]),
          pathActions: planningRouteActions(dock),
          pathIndex: 0,
          cargo: 'empty',
        })
      ),
    [layout]
  );

  useEffect(
    () =>
      registerReplayParticipant('forklift-crossings', {
        capture: () =>
          [...crossingReservations.entries()].filter(
            ([, owner]) => owner === 'forklift-1' || owner === 'forklift-2'
          ),
        restore: (entries) => {
          const ownedIds = new Set(['forklift-1', 'forklift-2']);
          crossingReservations.forEach((owner, crossingId) => {
            if (ownedIds.has(owner)) crossingReservations.delete(crossingId);
          });
          for (const [crossingId, owner] of entries) {
            if (ownedIds.has(owner)) crossingReservations.set(crossingId, owner);
          }
        },
      }),
    []
  );

  return (
    <group name="forklift-system">
      {/* Render crossing zone markers on floor */}
      {showSpeedZones && (
        <>
          <CrossingZoneMarkers />
          <SpeedZoneOverlays />
          {forklifts.map((f, i) => (
            <ForkliftPath
              key={`path-${f.id}`}
              path={f.path}
              waypoints={f.authoredPath}
              waypointActions={f.authoredActions}
              color={PATH_COLORS[i % PATH_COLORS.length]}
            />
          ))}
        </>
      )}
      {/* Render forklifts */}
      {forklifts.map((f) => (
        <Forklift key={f.id} data={f} onSelect={onSelectForklift} />
      ))}
      {/* What stands at their pickups and dropoffs. */}
      <ForkliftCargoLoads />
    </group>
  );
};

const Forklift: React.FC<{ data: Forklift; onSelect?: (forklift: ForkliftData) => void }> = ({
  data,
  onSelect,
}) => {
  const t = useT(forkliftSystemMessages);
  const displayLabel = FORKLIFT_DISPLAY_LABELS[data.id];
  const ref = useRef<THREE.Group>(null);
  const initialRoutePlan = useMemo(
    () => createForkliftRoutePlan(data.path, data.pathActions),
    [data.path, data.pathActions]
  );
  const routePlanRef = useRef(initialRoutePlan);
  // Carry on from where it stood if it unmounted on this same route.
  const [memory] = useState(() => {
    const saved = forkliftMemory.get(data.id);
    return saved && Math.abs(saved.pathLength - initialRoutePlan.path.totalLength) < 1e-6
      ? saved
      : null;
  });
  const motionStateRef = useRef(
    memory?.motion ?? initialWorkMotion(initialRoutePlan, data.position, data.id)
  );
  const dock = data.id === 'forklift-1' ? 'shipping' : 'receiving';
  const actionMarkerIndexRef = useRef(memory?.actionMarkerIndex ?? 0);
  const actionCommittedRef = useRef(false);
  const [isStopped, setIsStopped] = useState(false);
  const [distanceTier, setDistanceTier] = useState<'close' | 'far'>('close'); // LOD tier for rendering
  // The fleet tag hides once its em is too few rows to hold together (see
  // SCENE_TEXT_MIN_EM_PIXELS): a group flag, written from useFrame, no render.
  const labelGroupRef = useRef<THREE.Group>(null);
  const initialCargo = memory?.hasCargo ?? data.cargo === 'pallet';
  const [hasCargo, setHasCargo] = useState(initialCargo);
  const [currentOperation, setCurrentOperation] = useState<ForkliftOperation>(
    memory?.operation ?? 'traveling'
  );
  const forkHeightRef = useRef(memory?.forkHeight ?? 0); // Ref for fork animation - avoids re-renders
  const hasCargoRef = useRef(initialCargo); // Ref mirror for useFrame access
  // The one pallet visibility every render tier reads: on the forks or not.
  // A station draws the load whenever it is not (ForkliftCargoLoads).
  const cargoPresenceRef = useRef(initialCargo ? 1 : 0);
  const operationRef = useRef<ForkliftOperation>(memory?.operation ?? 'traveling'); // Ref mirror for useFrame access
  // The pick or drop under way (forkliftWork.ts), set when it starts.
  const workRef = useRef<ForkliftWorkState>(
    memory?.work ?? { markerDistance: 0, heading: 0, spur: false }
  );
  const workOffsetScratch = useRef({ insert: 0, reverse: 0 });
  const stationInputsScratch = useRef({ stockToShip: false, transferReady: false });
  const crewAbsentSinceRef = useRef<number | null>(null);
  const lastHornRef = useRef(-Infinity);
  const standingSecondsRef = useRef(0);
  const posedPlanRef = useRef<ForkliftRoutePlan | null>(null);
  const loadKind = FORKLIFT_LOAD_KIND[data.id] ?? 'flour';
  const pickupStation = useMemo(() => forkliftCargoStation(data.id, 'pickup'), [data.id]);
  const dropoffStation = useMemo(() => forkliftCargoStation(data.id, 'dropoff'), [data.id]);
  const loadPhaseRef = useRef<ForkliftLoadPhase>('idle');
  const stopReasonRef = useRef<ForkliftStopReason>('none');
  const cameraDistanceRef = useRef(0); // Track distance to camera
  // Mirrored into state so the beacon recolours on entry and exit; it flips only
  // a couple of times per lap, so the re-render is cheap.
  const isInCrossingRef = useRef(false);
  const [isInCrossing, setIsInCrossing] = useState(false);
  const dirNormalizedRef = useRef(new THREE.Vector3());
  // One snapshot per vehicle, mutated each frame; the registry copies it on publish.
  const telemetryRef = useRef<VehicleTelemetrySnapshot>({
    id: data.id,
    type: 'forklift',
    speedMps: 0,
    steeringRadians: 0,
    phase: 'idle',
    stopReason: 'none',
    articulationRadians: 0,
    transferReady: false,
  });
  const stateChangeTimerRef = useRef(0); // Hysteresis timer
  const frameCountRef = useRef(0); // Frame counter for throttling
  const lastCollisionCheckRef = useRef({
    pathClear: true,
    obstaclePathClear: true,
    forkliftsNearby: [] as EntityPosition[],
  });
  const crossingTimerRef = useRef(0); // Time spent waiting at crossing
  const operationTimerRef = useRef(memory?.operationTimer ?? 0); // Time spent on current loading/unloading operation
  const operationDurationRef = useRef(memory?.operationDuration ?? 0); // Target duration for current operation
  const currentSpeedRef = useRef(0);
  const steeringAngleRef = useRef(0);
  const innerSteeringAngleRef = useRef(0);
  const outerSteeringAngleRef = useRef(0);
  const mastTiltRef = useRef(
    memory?.mastTilt ?? resolveForkliftMastTilt('traveling', data.cargo === 'pallet')
  );
  const manualModeRef = useRef<ManualMode>('none');
  // Its operator (forkliftCrew.ts): when active, it works only while they are
  // seated, and otherwise waits for them at its crew point or handover spot.
  const crewSite = forkliftCrewSite(data.id);
  const crewLive = forkliftCrewLive(data.id);
  const operatorSeatRef = useRef<[number, number, number]>([0, 0, 0]);
  const manualStateRef = useRef<ManualForkliftState | null>(null);
  const laneReturnRef = useRef<LaneReturnState>(createLaneReturnState());
  const manualHeadingRef = useRef(0);
  const routeYRef = useRef(0);
  const rejoinBlendRef = useRef<{
    x: number;
    z: number;
    startTravel: number;
    seconds: number;
  } | null>(null);
  const manualFrameRef = useRef<ManualWorldFrame>({ originGround: 0, segments: 0 });
  const spurTurnScratch = useRef({ stopDistance: 0, turnTo: 0 });
  const spurTwinScratch = useRef<(number | null)[]>([]);
  // People on its route ahead (forkliftWork.ts), refreshed with the collision checks.
  const pedestrianBaseRef = useRef(0);
  const pedestrianAheadRef = useRef(Infinity);
  const pedestrianSampler = useMemo(
    () => (distance: number) =>
      sampleArcLengthPath(routePlanRef.current.path, pedestrianBaseRef.current + distance),
    []
  );
  // The manual step's options, filled each frame rather than built.
  const manualOptionsRef = useRef({
    lane: {
      loaded: false,
      deltaSeconds: 0,
      blocked: NEVER_BLOCKED,
      halted: false,
      detour: dockPlatformDetour,
    },
    drive: { loaded: false, deltaSeconds: 0, blocked: NEVER_BLOCKED, maximumSpeed: Infinity },
  });
  // Rewritten every frame (forkliftCrewDuty): no allocation per frame.
  const crewDutyScratch = useRef({
    duty: { works: false, station: null as ForkliftCrewStation | null, walkingPace: false },
    station: { kind: 'crew', routeDistance: 0 } as ForkliftCrewStation,
  });
  const manualBlocked = useMemo(
    () => createManualWorldBlocked(data.id, manualFrameRef.current),
    [data.id]
  );
  const HYSTERESIS_TIME = 0.15; // 150ms before state can change
  const CROSSING_WAIT_TIME = 1.0; // Wait 1.0s before entering crossing zone
  const CROSSING_APPROACH_DISTANCE = 3; // Distance to start slowing for crossing
  // Pallet clearance lift (shared with the driver's lever); loaded travel settles to 0.32 m.
  const FORK_LIFT_HEIGHT = MANUAL_FORK_MAXIMUM_METRES;
  const recordSafetyStop = useSafetyStore((state) => state.recordSafetyStop);
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  const audioReady = useAudioInitialized();
  const truckTransferReady = useTruckScheduleStore(
    useShallow((state) => ({
      shipping: state.truckSchedule.shipping.transferReady,
      receiving: state.truckSchedule.receiving.transferReady,
    }))
  );
  // FLT01 takes a finished pallet to the dock only for a truck that is on its
  // way in or at the dock: it no longer waits loaded at the door through the
  // gap between trucks, and so never ends a spell with a load it cannot place.
  const shippingTruckExpected = useTruckScheduleStore((state) => {
    const phase = state.truckSchedule.shipping.lifecyclePhase;
    return (
      state.truckSchedule.shipping.truckActive &&
      (phase === 'approaching' || phase === 'docked' || phase === 'servicing')
    );
  });
  const dispatchExecution = useOperationsCampaignStore(
    useShallow((state) => ({
      releasedFinishedKg: state.execution.releasedFinishedKg,
      loadStatus: state.execution.dispatchLoad.status,
    }))
  );
  const vehicleSpeedMultiplier = useOperationsCampaignStore(
    (state) => state.getIncidentEffect().vehicleSpeedMultiplier
  );
  const canPerformWaypointAction = useCallback(
    (action: 'pickup' | 'dropoff'): boolean => {
      // The plant must want the trip, and the load must be there to take (or
      // the place clear to put it): a pick never lifts a pallet that is not
      // standing at its source.
      const entry = action === 'pickup' ? pickupStation : dropoffStation;
      const stationAllows = cargoStationAllows(action, entry?.pose ? entry.station : null);
      const truckForIt = data.id !== 'forklift-1' || action !== 'pickup' || shippingTruckExpected;
      return (
        stationAllows &&
        truckForIt &&
        canPerformForkliftLogisticsAction({
          forkliftId: data.id,
          action,
          shippingDocked: truckTransferReady.shipping,
          receivingDocked: truckTransferReady.receiving,
          releasedFinishedKg: dispatchExecution.releasedFinishedKg,
          dispatchLoadStatus: dispatchExecution.loadStatus,
        })
      );
    },
    [
      data.id,
      pickupStation,
      dropoffStation,
      shippingTruckExpected,
      dispatchExecution.loadStatus,
      dispatchExecution.releasedFinishedKg,
      truckTransferReady.receiving,
      truckTransferReady.shipping,
    ]
  );

  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const authoredVehicleVisual = graphicsQuality !== 'low';
  // Per-vehicle wear. Two identically-grimy forklifts read as one asset drawn
  // twice, so the amount is derived from the id and differs across the fleet.
  const forkliftGrime = data.id === 'forklift-1' ? 0.74 : 0.52;
  const effectiveStopped = isStopped || forkliftEmergencyStop || emergencyDrillMode;
  const simulationPaused = isForkliftSimulationPaused(gameSpeed);
  const motionStopped = effectiveStopped || simulationPaused;
  const isOperating = currentOperation === 'loading' || currentOperation === 'unloading';
  const replayOperationRef = useRef<ForkliftOperation | null>(null);
  const stoppedMirrorRef = useRef(isStopped);
  stoppedMirrorRef.current = isStopped;
  const effectiveStoppedRef = useRef(effectiveStopped);
  effectiveStoppedRef.current = effectiveStopped;

  // 1 Hz utilisation sample for Safety Analytics, off while the clock is held
  // or the tab is hidden; a resume books none of the gap.
  useForkliftMetricsSampler(
    data.id,
    !simulationPaused && isTabVisible,
    () => !effectiveStoppedRef.current
  );

  useEffect(() => {
    if (!audioReady) return undefined;
    audioManager.startForkliftEngine(data.id);
    return () => audioManager.stopForkliftEngine(data.id);
  }, [audioReady, data.id]);

  useEffect(() => {
    if (!audioReady) return;
    audioManager.updateForkliftEngine(data.id, !motionStopped && !isOperating, effectiveStopped);
  }, [audioReady, data.id, effectiveStopped, isOperating, motionStopped]);

  // Lift and place sounds last the rest of the operation in real seconds at the
  // current pace. They stop when the operation ends, the clock is held, an
  // e-stop or drill freezes the cycle, or the forklift unmounts, and a release
  // plays only what is left. A pace change mid-lift does not restart them.
  const hydraulicHeld = simulationPaused || forkliftEmergencyStop || emergencyDrillMode;
  useEffect(() => {
    if (!audioReady) return undefined;
    if (replayOperationRef.current === currentOperation) return undefined;
    replayOperationRef.current = null;
    if (hydraulicHeld || isWorkplaceReplayRestoring()) return undefined;
    if (currentOperation !== 'loading' && currentOperation !== 'unloading') return undefined;
    const seconds = hydraulicSoundSeconds(
      (operationDurationRef.current || 1.5) - operationTimerRef.current,
      useGameSimulationStore.getState().gameSpeed
    );
    if (seconds <= 0) return undefined;
    if (currentOperation === 'loading') {
      audioManager.playHydraulicLift(data.id, seconds);
    } else {
      audioManager.playHydraulicLower(data.id, seconds);
    }
    return () => audioManager.stopHydraulic(data.id);
  }, [audioReady, currentOperation, data.id, hydraulicHeld]);

  // Set initial position only once (not via prop to avoid reset on re-render)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (ref.current && !initializedRef.current) {
      const motion = motionStateRef.current;
      ref.current.position.set(motion.x, data.position[1], motion.z);
      ref.current.rotation.y = motion.heading;
      // The autopilot never writes height: this is its height for good.
      routeYRef.current = data.position[1];
      initializedRef.current = true;
    }
  }, [data.position]);

  // Cleanup: unregister from position registry on unmount
  useEffect(() => {
    return () => {
      // Remember where it was, unless a player had it (that starts afresh).
      if (manualModeRef.current === 'none') {
        const motion = motionStateRef.current;
        forkliftMemory.set(data.id, {
          pathLength: routePlanRef.current.path.totalLength,
          motion,
          actionMarkerIndex: actionMarkerIndexRef.current,
          hasCargo: hasCargoRef.current,
          operation: operationRef.current,
          operationTimer: operationTimerRef.current,
          operationDuration: operationDurationRef.current,
          forkHeight: forkHeightRef.current,
          mastTilt: mastTiltRef.current,
          work: { ...workRef.current },
          position: [motion.x, routeYRef.current, motion.z],
          heading: motion.heading,
        });
      } else forkliftMemory.delete(data.id);
      positionRegistry.unregister(data.id);
      vehicleTelemetryRegistry.unregister(data.id);
      forkliftBoardable.delete(data.id);
      // A forklift that unmounts under its driver puts the player back on foot.
      if (useForkliftDriveStore.getState().drivenId === data.id)
        useForkliftDriveStore.getState().exit();
      crossingReservations.forEach((owner, crossingId) => {
        if (owner === data.id) crossingReservations.delete(crossingId);
      });
    };
  }, [data.id]);

  const publishMotionTelemetry = (paused = false): void => {
    const vehicle = ref.current;
    if (!vehicle) return;
    const motion = motionStateRef.current;
    Object.assign(vehicle.userData, {
      forkliftId: data.id,
      type: 'forklift',
      phase: operationRef.current,
      loadPhase: loadPhaseRef.current,
      speed: paused ? 0 : motion.speed,
      acceleration: paused ? 0 : motion.acceleration,
      steeringAngle: motion.steeringAngle,
      innerSteeringAngle: motion.innerSteeringAngle,
      outerSteeringAngle: motion.outerSteeringAngle,
      wheelTravel: motion.wheelTravel,
      routeDistance: motion.routeDistance,
      stopReason: paused ? 'simulation-paused' : motion.stopReason,
      forkHeight: forkHeightRef.current,
      mastTilt: mastTiltRef.current,
      cargo: hasCargoRef.current ? 'pallet' : 'empty',
      stopped: paused || motion.stopReason !== 'none' || motion.speed <= 0.01,
    });
    const telemetry = telemetryRef.current;
    telemetry.speedMps = paused ? 0 : motion.speed;
    telemetry.steeringRadians = motion.steeringAngle;
    telemetry.phase = loadPhaseRef.current;
    telemetry.stopReason = paused ? 'simulation-paused' : motion.stopReason;
    telemetry.cargo = hasCargoRef.current ? 'pallet' : 'empty';
    vehicleTelemetryRegistry.publish(telemetry);
  };

  const replayPresentationRef = useRef<() => void>(() => undefined);
  replayPresentationRef.current = () => publishMotionTelemetry(true);
  useEffect(
    () =>
      registerLogisticsVehicle(dock, {
        prepare: (points) => {
          const next = drivenLogisticsRoute(dock, points).plan;
          const change = planForkliftRouteChange(manualModeRef.current, () =>
            reconcileLogisticsMotion(
              routePlanRef.current,
              next,
              motionStateRef.current,
              actionMarkerIndexRef.current
            )
          );
          if (change.kind === 'refuse')
            return translate(forkliftSystemMessages, 'routeCornerAmbiguous', { id: data.id });
          return () => {
            routePlanRef.current = next;
            // A pick or drop under way follows its marker onto the new plan.
            const workMarker = next.markers[actionMarkerIndexRef.current];
            const working =
              operationRef.current === 'loading' || operationRef.current === 'unloading';
            if (working && workMarker)
              workRef.current = {
                markerDistance: workMarker.distance,
                heading: markerArrivalHeading(next, workMarker.distance),
                spur: isSpurMarker(next, workMarker.distance),
              };
            if (change.motion) motionStateRef.current = change.motion;
            // A lane return in progress was steering for the old route.
            else laneReturnRef.current = createLaneReturnState();
            frameCountRef.current = 0;
          };
        },
        restore: (points) => {
          routePlanRef.current = drivenLogisticsRoute(dock, points).plan;
        },
      }),
    [data.id, dock]
  );

  useEffect(
    () =>
      registerReplayParticipant(`forklift:${data.id}`, {
        capture: () => ({
          motionStateRef: motionStateRef.current,
          actionMarkerIndexRef: actionMarkerIndexRef.current,
          hasCargoRef: hasCargoRef.current,
          operationRef: operationRef.current,
          loadPhaseRef: loadPhaseRef.current,
          stopReasonRef: stopReasonRef.current,
          forkHeightRef: forkHeightRef.current,
          mastTiltRef: mastTiltRef.current,
          stateChangeTimerRef: stateChangeTimerRef.current,
          frameCountRef: frameCountRef.current,
          lastCollisionCheckRef: lastCollisionCheckRef.current,
          crossingTimerRef: crossingTimerRef.current,
          operationTimerRef: operationTimerRef.current,
          operationDurationRef: operationDurationRef.current,
          isInCrossingRef: isInCrossingRef.current,
          currentSpeedRef: currentSpeedRef.current,
          steeringAngleRef: steeringAngleRef.current,
          innerSteeringAngleRef: innerSteeringAngleRef.current,
          outerSteeringAngleRef: outerSteeringAngleRef.current,
          stoppedMirrorRef: stoppedMirrorRef.current,
          workRef: { ...workRef.current },
          pickupStation: pickupStation ? { ...pickupStation.station } : null,
          dropoffStation: dropoffStation ? { ...dropoffStation.station } : null,
          transform: ref.current
            ? {
                position: ref.current.position.toArray(),
                rotation: [ref.current.rotation.x, ref.current.rotation.y, ref.current.rotation.z],
              }
            : null,
        }),
        restore: (snapshot) => {
          // The snapshot holds no manual state: a restore puts the vehicle back
          // on autopilot at the captured route distance and the player on foot.
          if (useForkliftDriveStore.getState().drivenId === data.id)
            useForkliftDriveStore.getState().exit();
          manualModeRef.current = 'none';
          manualStateRef.current = null;
          rejoinBlendRef.current = null;
          motionStateRef.current = snapshot.motionStateRef;
          actionMarkerIndexRef.current = snapshot.actionMarkerIndexRef;
          // Not in the snapshot: re-earned on the restored leg.
          actionCommittedRef.current = false;
          hasCargoRef.current = snapshot.hasCargoRef;
          operationRef.current = snapshot.operationRef;
          loadPhaseRef.current = snapshot.loadPhaseRef;
          stopReasonRef.current = snapshot.stopReasonRef;
          forkHeightRef.current = snapshot.forkHeightRef;
          mastTiltRef.current = snapshot.mastTiltRef;
          stateChangeTimerRef.current = snapshot.stateChangeTimerRef;
          frameCountRef.current = snapshot.frameCountRef;
          lastCollisionCheckRef.current = snapshot.lastCollisionCheckRef;
          crossingTimerRef.current = snapshot.crossingTimerRef;
          operationTimerRef.current = snapshot.operationTimerRef;
          operationDurationRef.current = snapshot.operationDurationRef;
          isInCrossingRef.current = snapshot.isInCrossingRef;
          currentSpeedRef.current = snapshot.currentSpeedRef;
          steeringAngleRef.current = snapshot.steeringAngleRef;
          innerSteeringAngleRef.current = snapshot.innerSteeringAngleRef;
          outerSteeringAngleRef.current = snapshot.outerSteeringAngleRef;
          stoppedMirrorRef.current = snapshot.stoppedMirrorRef;
          // Derived, so not in the snapshot: the cargo flag where a station
          // draws the load off the forks, otherwise the operation's progress.
          if (snapshot.workRef) workRef.current = { ...snapshot.workRef };
          const replayStation = operationRef.current === 'loading' ? pickupStation : dropoffStation;
          cargoPresenceRef.current =
            replayStation?.pose ||
            (operationRef.current !== 'loading' && operationRef.current !== 'unloading')
              ? hasCargoRef.current
                ? 1
                : 0
              : sampleForkliftLoadPose(
                  operationRef.current === 'loading' ? 'pickup' : 'dropoff',
                  operationTimerRef.current / Math.max(0.1, operationDurationRef.current),
                  FORK_LIFT_HEIGHT
                ).cargoPresence;
          // Its stations as they stood at the capture.
          for (const [entry, saved] of [
            [pickupStation, snapshot.pickupStation],
            [dropoffStation, snapshot.dropoffStation],
          ] as const)
            if (entry && saved) Object.assign(entry.station, saved);
          setHasCargo(hasCargoRef.current);
          setCurrentOperation(operationRef.current);
          setIsStopped(stoppedMirrorRef.current);
          setIsInCrossing(isInCrossingRef.current);
          replayOperationRef.current = operationRef.current;
          if (ref.current) {
            if (snapshot.transform) {
              ref.current.position.fromArray(snapshot.transform.position);
              // Captured while driven, the height is the ground the player had
              // reached, which the autopilot (it never writes height) would keep.
              ref.current.position.y = routeYRef.current;
              ref.current.rotation.set(
                ...(snapshot.transform.rotation as [number, number, number])
              );
            } else {
              ref.current.position.x = motionStateRef.current.x;
              ref.current.position.z = motionStateRef.current.z;
              ref.current.rotation.y = motionStateRef.current.heading;
            }
            ref.current.updateMatrixWorld(true);
            const motion = motionStateRef.current;
            const [dirX, dirZ] = routeDirection(routePlanRef.current, motion.routeDistance);
            dirNormalizedRef.current.set(dirX, 0, dirZ);
            positionRegistry.register(
              data.id,
              motion.x,
              motion.z,
              dirX,
              dirZ,
              true,
              ref.current.position.y
            );
          }
          replayPresentationRef.current();
        },
      }),
    [data.id, pickupStation, dropoffStation]
  );

  useFrame((state, delta) => {
    if (!ref.current || !isTabVisible) return;
    const routePlan = routePlanRef.current;

    const wallDelta = Math.min(Math.max(delta, 1 / 240), 0.1);
    const simulationDelta = wallDelta * plantTimeScale(useGameSimulationStore.getState().gameSpeed);
    const vehicle = ref.current;
    const motionBefore = motionStateRef.current;

    if (audioReady && shouldRunThisFrame(4)) {
      // Engine height; the loop then follows camera distance and walls.
      audioManager.registerSoundPosition(
        data.id,
        vehicle.position.x,
        vehicle.position.y + 1,
        vehicle.position.z
      );
      audioManager.updateForkliftSpatialVolume(data.id);
    }

    cameraDistanceRef.current = state.camera.position.distanceTo(vehicle.position);
    const labelGroup = labelGroupRef.current;
    // Replay and headless frames can pass a state without size or viewport;
    // leave the tag as it is rather than reading through undefined.
    const renderRows = (state.size?.height ?? 0) * (state.viewport?.dpr ?? 1);
    if (labelGroup && renderRows > 0) {
      labelGroup.visible = sceneTextLegible(
        FORKLIFT_LABEL_FONT_SIZE,
        cameraDistanceRef.current,
        renderRows,
        (state.camera as THREE.PerspectiveCamera).fov ?? 50,
        labelGroup.visible
      );
    }
    if (distanceTier === 'close' && cameraDistanceRef.current > FORKLIFT_LOD_FAR_METRES) {
      setDistanceTier('far');
    } else if (distanceTier === 'far' && cameraDistanceRef.current < FORKLIFT_LOD_CLOSE_METRES) {
      setDistanceTier('close');
    }

    const framePaused = isForkliftSimulationPaused(useGameSimulationStore.getState().gameSpeed);

    // Its stations: where their loads stand on this route, and what the plant
    // has put there this frame (forkliftCargoStations.ts), on plant time.
    if (posedPlanRef.current !== routePlan) {
      posedPlanRef.current = routePlan;
      for (const marker of routePlan.markers) {
        if (marker.action.type === 'pickup') publishStationPose(routePlan, marker, pickupStation);
        else if (marker.action.type === 'dropoff')
          publishStationPose(routePlan, marker, dropoffStation);
      }
    }
    if (!framePaused && !isWorkplaceReplayRestoring()) {
      const execution = useOperationsCampaignStore.getState().execution;
      const stationInputs = stationInputsScratch.current;
      // The next pallet starts once this one has left the forks for the dock,
      // so the collection point is free to take it back at the end of a spell.
      stationInputs.stockToShip =
        execution.releasedFinishedKg > 0 &&
        execution.dispatchLoad.status !== 'ready' &&
        !hasCargoRef.current;
      stationInputs.transferReady =
        useTruckScheduleStore.getState().truckSchedule[dock].transferReady;
      if (pickupStation) stepCargoStation(pickupStation.station, stationInputs, simulationDelta);
      if (dropoffStation) stepCargoStation(dropoffStation.station, stationInputs, simulationDelta);
    }

    // Manual control. Boardable only between load operations, so the player
    // never interrupts a lift half-way.
    const drivenHere = useForkliftDriveStore.getState().drivenId === data.id;
    if (drivenHere && manualModeRef.current !== 'driven') {
      manualStateRef.current = createManualForkliftState({
        x: vehicle.position.x,
        z: vehicle.position.z,
        heading: vehicle.rotation.y,
        speed: motionBefore.speed,
        steeringAngle: motionBefore.steeringAngle,
        innerSteeringAngle: motionBefore.innerSteeringAngle,
        outerSteeringAngle: motionBefore.outerSteeringAngle,
        wheelTravel: motionBefore.wheelTravel,
        forkHeight: forkHeightRef.current,
      });
      manualModeRef.current = 'driven';
      manualHeadingRef.current = vehicle.rotation.y;
      rejoinBlendRef.current = null;
      actionCommittedRef.current = false;
      crossingReservations.forEach((owner, crossingId) => {
        if (owner === data.id) crossingReservations.delete(crossingId);
      });
    } else if (!drivenHere && manualModeRef.current === 'driven') {
      manualModeRef.current = 'lane';
      laneReturnRef.current = createLaneReturnState();
    }

    const manualState = manualStateRef.current;
    // Parked for its operator is only ever true on an autopilot frame below.
    crewLive.parkedAt = null;
    if (manualModeRef.current !== 'none' && manualState) {
      const held = framePaused || isWorkplaceReplayRestoring();
      const emergency = forkliftEmergencyStop || emergencyDrillMode;
      const segments = getTerrainGridSegments(useGraphicsStore.getState().graphics.quality);
      const frame = manualFrameRef.current;
      frame.segments = segments;
      frame.originGround = sampleWalkingGroundHeight(manualState.x, manualState.z, segments);
      const mode = manualModeRef.current;

      let next = manualState;
      if (mode === 'lane' && !held) {
        const laneOptions = manualOptionsRef.current.lane;
        laneOptions.loaded = hasCargoRef.current;
        laneOptions.deltaSeconds = simulationDelta;
        laneOptions.halted = emergency;
        laneOptions.blocked = manualBlocked;
        const step = stepLaneReturn(routePlan, manualState, laneReturnRef.current, laneOptions);
        laneReturnRef.current = step.laneReturn;
        if (step.rejoinDistance !== null) {
          // Hand back to the autopilot at the rejoin distance. It keeps the
          // body's heading and pivots standing if that is still off, and the
          // drawn position eases onto the lane over the first metres.
          const sample = sampleArcLengthPath(routePlan.path, step.rejoinDistance);
          const motion = createInitialForkliftMotion(routePlan, [sample.x, 0, sample.z]);
          motionStateRef.current = {
            ...motion,
            routeDistance: step.rejoinDistance,
            x: sample.x,
            z: sample.z,
            heading: manualState.heading,
            wheelTravel: manualState.wheelTravel,
          };
          // Towed (put back, not driven back): no slide across what it could not pass.
          rejoinBlendRef.current = step.towed
            ? null
            : {
                x: manualState.x - sample.x,
                z: manualState.z - sample.z,
                startTravel: manualState.wheelTravel,
                seconds: 0,
              };
          forkHeightRef.current = manualState.forkHeight;
          vehicle.position.y = routeYRef.current;
          manualModeRef.current = 'none';
          manualStateRef.current = null;
          actionCommittedRef.current = false;
          frameCountRef.current = 0;
          publishMotionTelemetry();
          return;
        }
        next = step.vehicle;
      } else if (mode === 'driven' && !held) {
        // The driver drives in real seconds, whatever the plant pace.
        const driveOptions = manualOptionsRef.current.drive;
        driveOptions.loaded = hasCargoRef.current;
        driveOptions.deltaSeconds = wallDelta;
        driveOptions.blocked = manualBlocked;
        // A speed zone caps the driver as it caps the autopilot: the same
        // ceiling on the same nominal speed, never zero (speedZoneLimit).
        const zoneRules = useSafetyStore.getState();
        driveOptions.maximumSpeed = speedZoneLimit(
          manualState.x,
          manualState.z,
          zoneRules.speedZones,
          zoneRules.safetyConfig.speedZoneSlowdown,
          data.speed
        );
        next = stepManualForklift(
          manualState,
          emergency ? ZERO_INPUT : manualForkliftInput,
          driveOptions
        );
      }

      // Not counted toward the layout's vehicle metres: a player's drive, and
      // the way back from wherever they left it, say nothing about the layout.
      if (!held) manualStateRef.current = next;

      const poseResponse = 1 - Math.exp(-7 * wallDelta);
      vehicle.position.set(next.x, sampleWalkingGroundHeight(next.x, next.z, segments), next.z);
      vehicle.rotation.y = next.heading;
      vehicle.rotation.z += (0 - vehicle.rotation.z) * poseResponse;
      vehicle.rotation.x +=
        (THREE.MathUtils.clamp(-next.acceleration * 0.008, -0.025, 0.025) - vehicle.rotation.x) *
        poseResponse;
      steeringAngleRef.current = next.steeringAngle;
      innerSteeringAngleRef.current = next.innerSteeringAngle;
      outerSteeringAngleRef.current = next.outerSteeringAngle;
      currentSpeedRef.current = next.speed;
      forkHeightRef.current = next.forkHeight;
      loadPhaseRef.current = hasCargoRef.current ? 'carrying' : 'idle';
      stopReasonRef.current = emergency ? 'emergency-stop' : 'none';
      motionStateRef.current = {
        ...motionStateRef.current,
        x: next.x,
        z: next.z,
        heading: next.heading,
        speed: held ? 0 : next.speed,
        acceleration: held ? 0 : next.acceleration,
        steeringAngle: next.steeringAngle,
        innerSteeringAngle: next.innerSteeringAngle,
        outerSteeringAngle: next.outerSteeringAngle,
        wheelTravel: next.wheelTravel,
        stopReason: stopReasonRef.current,
      };
      vehicle.userData.manualControl =
        manualModeRef.current === 'lane' ? laneReturnRef.current.mode : manualModeRef.current;
      // The beacon and engine follow manual state too: the autopilot's
      // hysteresis, which owns isStopped otherwise, does not run here.
      const manualStopped =
        held ||
        emergency ||
        (manualModeRef.current === 'lane' && laneReturnRef.current.mode === 'parked');
      if (stoppedMirrorRef.current !== manualStopped) {
        stoppedMirrorRef.current = manualStopped;
        setIsStopped(manualStopped);
      }
      positionRegistry.register(
        data.id,
        next.x,
        next.z,
        Math.sin(next.heading),
        Math.cos(next.heading),
        held || Math.abs(next.speed) <= 0.01,
        vehicle.position.y,
        'forklift',
        true
      );
      publishMotionTelemetry(held);

      if (manualModeRef.current === 'driven') {
        // The seat carries the camera, and the view turns with the truck.
        const camera = state.camera;
        const sin = Math.sin(next.heading);
        const cos = Math.cos(next.heading);
        const [seatX, seatY, seatZ] = FORKLIFT_SEAT_EYE;
        camera.position.set(
          next.x + cos * seatX + sin * seatZ,
          vehicle.position.y + seatY,
          next.z - sin * seatX + cos * seatZ
        );
        camera.rotateOnWorldAxis(
          WORLD_UP,
          shortestVehicleAngle(manualHeadingRef.current, next.heading)
        );
        manualHeadingRef.current = next.heading;
        if (labelGroup) labelGroup.visible = false;
      }
      return;
    }
    vehicle.userData.manualControl = 'none';

    if (framePaused || isWorkplaceReplayRestoring()) {
      const [dirX, dirZ] = routeDirection(routePlan, motionBefore.routeDistance);
      dirNormalizedRef.current.set(dirX, 0, dirZ);
      positionRegistry.register(
        data.id,
        motionBefore.x,
        motionBefore.z,
        dirX,
        dirZ,
        true,
        vehicle.position.y
      );
      publishMotionTelemetry(true);
      return;
    }

    const [currentDirX, currentDirZ] = routeDirection(routePlan, motionBefore.routeDistance);
    const direction = dirNormalizedRef.current.set(currentDirX, 0, currentDirZ);
    frameCountRef.current += 1;
    const shouldCheckCollisions = frameCountRef.current % 3 === 0;
    let pathClear: boolean;
    let obstaclePathClear: boolean;
    let forkliftsNearby: EntityPosition[];

    if (shouldCheckCollisions) {
      // Operator clearances from the Safety Config sliders (read, not subscribed).
      const clearance = useSafetyStore.getState().safetyConfig;
      pathClear = positionRegistry.isPathClear(
        motionBefore.x,
        motionBefore.z,
        direction.x,
        direction.z,
        clearance.pathCheckDistance,
        clearance.vehicleDetectionRadius,
        data.id,
        true,
        vehicle.position.y,
        (distanceAhead) =>
          sampleArcLengthPath(routePlan.path, motionBefore.routeDistance + distanceAhead)
      );
      obstaclePathClear = positionRegistry.isObstaclePathClear(
        motionBefore.x,
        motionBefore.z,
        direction.x,
        direction.z,
        clearance.pathCheckDistance,
        clearance.vehicleDetectionRadius,
        (distanceAhead) =>
          sampleArcLengthPath(routePlan.path, motionBefore.routeDistance + distanceAhead)
      );
      forkliftsNearby = positionRegistry.getForkliftsNearby(
        motionBefore.x,
        motionBefore.z,
        clearance.forkliftSafetyRadius,
        data.id,
        vehicle.position.y
      );
      lastCollisionCheckRef.current = { pathClear, obstaclePathClear, forkliftsNearby };
    } else {
      ({ pathClear, obstaclePathClear, forkliftsNearby } = lastCollisionCheckRef.current);
    }

    const currentCrossingZone = isInCrossingZone(motionBefore.x, motionBefore.z);
    const crossingLookAhead = sampleArcLengthPath(
      routePlan.path,
      motionBefore.routeDistance + CROSSING_APPROACH_DISTANCE
    );
    const approachingCrossingZone = isInCrossingZone(crossingLookAhead.x, crossingLookAhead.z);
    const activeCrossing = currentCrossingZone ?? approachingCrossingZone;
    let crossingClear = true;
    let crossingSpeedLimit = Infinity;

    if (activeCrossing) {
      const owner = crossingReservations.get(activeCrossing.id);
      const ownsReservation = owner === data.id;
      if (currentCrossingZone) {
        if (!owner) crossingReservations.set(activeCrossing.id, data.id);
        crossingClear = !owner || ownsReservation;
        crossingSpeedLimit = 1.2;
        crossingTimerRef.current = 0;
      } else if (owner && !ownsReservation) {
        crossingClear = false;
        crossingTimerRef.current = 0;
      } else {
        crossingTimerRef.current += simulationDelta;
        crossingClear = crossingTimerRef.current >= CROSSING_WAIT_TIME;
        crossingSpeedLimit = 1;
        if (crossingClear) crossingReservations.set(activeCrossing.id, data.id);
      }
    } else {
      crossingReservations.forEach((owner, crossingId) => {
        if (owner === data.id) crossingReservations.delete(crossingId);
      });
      crossingTimerRef.current = 0;
    }
    const inCrossing = activeCrossing !== null;
    if (inCrossing !== isInCrossingRef.current) {
      isInCrossingRef.current = inCrossing;
      setIsInCrossing(inCrossing);
    }

    // The crew's duty: work the route, or stand at a station on the lane.
    const nowMs = performance.now();
    const crewActive =
      !!crewSite && !!crewLive.state && isForkliftCrewActive(crewLive, nowMs, delta * 1000);
    if (crewActive || !crewSite) crewAbsentSinceRef.current = null;
    else crewAbsentSinceRef.current ??= nowMs;
    // People are in the world but its crew has not stepped yet (or has just
    // stopped): it stands where it is for a moment rather than work unmanned.
    const crewGrace =
      !crewActive &&
      !!crewSite &&
      !useGraphicsStore.getState().graphics.perfDebug.disableCommunityLife &&
      nowMs - (crewAbsentSinceRef.current ?? nowMs) < CREW_FALLBACK_GRACE_MS;
    const crewDuty: ForkliftCrewDuty | null =
      crewActive && crewLive.state
        ? forkliftCrewDuty(
            crewLive.state,
            crewRouteDistance(routePlan, crewSite),
            crewDutyScratch.current.duty,
            crewDutyScratch.current.station
          )
        : null;
    // At the end of a spell with a load on the forks, the job in hand comes
    // first: the crew point waits until the load is delivered or put back.
    const wantsOff = crewLive.state?.phase === 'wants-off' && crewDuty !== null;
    const keepWorking = wantsOff && hasCargoRef.current;
    const crewStation = keepWorking ? null : (crewDuty?.station ?? null);
    // Wrapped: a handover recorded before a layout edit can exceed the new length.
    const routeLength = routePlan.path.totalLength;
    const stationDistance = crewStation
      ? ((crewStation.routeDistance % routeLength) + routeLength) % routeLength
      : 0;
    const stationAhead = crewStation
      ? distanceAheadOnClosedPath(routePlan.path, motionBefore.routeDistance, stationDistance)
      : null;
    const stationBehind = crewStation
      ? distanceAheadOnClosedPath(routePlan.path, stationDistance, motionBefore.routeDistance)
      : null;
    const stationReach =
      crewStation?.kind === 'handover' ? HANDOVER_REACH_METRES : STATION_OVERSHOOT_METRES;
    const atStation =
      stationAhead !== null &&
      (stationAhead <= 0.06 || (stationBehind ?? Infinity) <= stationReach);
    const stationStop = stationAhead === null ? null : atStation ? 0 : stationAhead;

    // What the end of a spell leaves to do (forkliftCrew.ts forkliftSpellEndTask):
    // carry on, park, deliver the load, put it back where it was picked, or
    // hold it at the drop until the drop opens.
    const pickupMarkerIndex = routePlan.markers.findIndex(
      (candidate) => candidate.action.type === 'pickup'
    );
    const spellTask = forkliftSpellEndTask({
      wantsOff,
      loaded: hasCargoRef.current,
      dropOpen: hasCargoRef.current && canPerformWaypointAction('dropoff'),
      dropExpected: data.id === 'forklift-1' && shippingTruckExpected,
      committed: actionCommittedRef.current,
      canPutBack:
        pickupMarkerIndex >= 0 &&
        cargoStationTakesBack(pickupStation?.pose ? pickupStation.station : null),
    });
    const putBack = spellTask === 'put-back';
    const targetIndex = putBack ? pickupMarkerIndex : actionMarkerIndexRef.current;
    const marker = routePlan.markers[targetIndex];
    const markerAction = putBack
      ? 'dropoff'
      : marker?.action.type === 'pickup' || marker?.action.type === 'dropoff'
        ? marker.action.type
        : null;
    // The station the load comes from or goes to: a put-back's is the pickup's.
    const targetEntry =
      putBack || markerAction === 'pickup' ? pickupStation : markerAction ? dropoffStation : null;
    const cargoRelevant =
      markerAction === 'pickup'
        ? !hasCargoRef.current
        : markerAction === 'dropoff'
          ? hasCargoRef.current
          : false;
    const distanceToMarker = marker
      ? distanceAheadOnClosedPath(routePlan.path, motionBefore.routeDistance, marker.distance)
      : Infinity;
    // Unmanned it works nothing; at the end of a spell, empty, it starts no new job.
    const crewWorks = (crewDuty?.works ?? !crewGrace) && spellTask !== 'park';
    const markerRelevant = crewWorks && cargoRelevant;

    // An e-stop or drill freezes a lift/place cycle where it is, as well as travel.
    const emergencyStopped = forkliftEmergencyStop || emergencyDrillMode;

    if (operationRef.current === 'loading' || operationRef.current === 'unloading') {
      const work = workRef.current;
      const action = operationRef.current === 'loading' ? 'pickup' : 'dropoff';
      const stationEntry = (work.station ?? action) === 'pickup' ? pickupStation : dropoffStation;
      const workDirX = Math.sin(work.heading);
      const workDirZ = Math.cos(work.heading);
      if (emergencyStopped) {
        stopReasonRef.current = 'emergency-stop';
        motionStateRef.current = {
          ...motionBefore,
          speed: 0,
          acceleration: 0,
          stopReason: 'emergency-stop',
        };
        currentSpeedRef.current = 0;
        positionRegistry.register(
          data.id,
          motionBefore.x,
          motionBefore.z,
          workDirX,
          workDirZ,
          true,
          vehicle.position.y
        );
        publishMotionTelemetry();
        return;
      }
      operationTimerRef.current += simulationDelta;
      const duration = Math.max(0.1, operationDurationRef.current);
      const progress = operationTimerRef.current / duration;
      const loadPose = sampleForkliftLoadPose(
        action,
        progress,
        FORK_LIFT_HEIGHT,
        work.surface ?? marker?.action.surfaceForkHeight ?? 0
      );
      loadPhaseRef.current = loadPose.phase;
      forkHeightRef.current = loadPose.forkHeight;
      mastTiltRef.current = loadPose.mastTilt;
      stopReasonRef.current = 'load-operation';

      // The load changes hands where it stands: the station's pallet becomes
      // the forks' at engagement, and the station's again at release.
      if (action === 'pickup' && loadPose.cargoEngaged && !hasCargoRef.current) {
        hasCargoRef.current = true;
        if (stationEntry) takeCargo(stationEntry.station);
        setHasCargo(true);
      } else if (action === 'dropoff' && !loadPose.cargoEngaged && hasCargoRef.current) {
        hasCargoRef.current = false;
        if (stationEntry) placeCargo(stationEntry.station);
        setHasCargo(false);
      }
      cargoPresenceRef.current = stationEntry?.pose
        ? hasCargoRef.current
          ? 1
          : 0
        : loadPose.cargoPresence;

      // In along the forks' line, then straight back out (forkliftWork.ts).
      const along = forkliftWorkAlong(
        forkliftWorkOffset(action, progress, workOffsetScratch.current)
      );
      const total = routePlan.path.totalLength;
      const markerSample = sampleArcLengthPath(routePlan.path, work.markerDistance);
      const workX = markerSample.x + workDirX * along;
      const workZ = markerSample.z + workDirZ * along;
      const travelled = Math.hypot(workX - motionBefore.x, workZ - motionBefore.z);
      const workSpeed = simulationDelta > 0 ? travelled / simulationDelta : 0;
      motionStateRef.current = {
        ...motionBefore,
        routeDistance: (((work.markerDistance + along) % total) + total) % total,
        x: workX,
        z: workZ,
        heading: work.heading,
        speed: workSpeed,
        acceleration: 0,
        wheelTravel: motionBefore.wheelTravel + travelled,
        stopReason: 'load-operation',
      };
      vehicle.position.x = workX;
      vehicle.position.z = workZ;
      vehicle.rotation.y = work.heading;
      currentSpeedRef.current = workSpeed;
      positionRegistry.register(
        data.id,
        workX,
        workZ,
        workDirX,
        workDirZ,
        workSpeed <= 0.01,
        vehicle.position.y
      );

      if (loadPose.operationComplete) {
        if (action === 'dropoff') useLogisticsLayoutStore.getState().recordVehicle(dock, 0, true);
        operationTimerRef.current = 0;
        operationRef.current = 'traveling';
        loadPhaseRef.current = hasCargoRef.current ? 'carrying' : 'idle';
        setCurrentOperation('traveling');
        // A load put back where it was picked is that pickup's to take again.
        const putBackDone = action === 'dropoff' && work.station === 'pickup';
        actionMarkerIndexRef.current = putBackDone
          ? Math.max(
              0,
              routePlan.markers.findIndex((candidate) => candidate.action.type === 'pickup')
            )
          : routePlan.markers.length > 0
            ? (actionMarkerIndexRef.current + 1) % routePlan.markers.length
            : 0;
        // Backed out: on a spur that is exactly a point on the way back, so
        // it carries on from there; elsewhere it turns standing where it is
        // and eases onto its lane over the first metres it drives.
        const resume = work.spur
          ? (work.markerDistance + FORKLIFT_REVERSE_METRES) % total
          : work.markerDistance;
        const resumeSample = sampleArcLengthPath(routePlan.path, resume);
        motionStateRef.current = {
          ...motionStateRef.current,
          routeDistance: resume,
          x: resumeSample.x,
          z: resumeSample.z,
          speed: 0,
          acceleration: 0,
          stopReason: 'none',
        };
        rejoinBlendRef.current = {
          x: workX - resumeSample.x,
          z: workZ - resumeSample.z,
          startTravel: motionStateRef.current.wheelTravel,
          // Not while it turns standing: only the metres it drives fade it.
          seconds: work.spur ? 0 : -REJOIN_BLEND_SECONDS,
        };
        // A raised surface keeps the forks at its height until the vehicle has backed off.
        forkHeightRef.current = travelForkHeight(routePlan, resume, hasCargoRef.current);
        mastTiltRef.current = resolveForkliftMastTilt('traveling', hasCargoRef.current);
      }
      publishMotionTelemetry();
      return;
    }

    // Not yet permitted, the forklift waits at the marker's hold point: short of
    // the dock door's pedestrian approach for a dock-side action.
    // Once it has left the hold point with permission it finishes the action
    // while its truck is still docked, rather than stopping in the doorway.
    // A pallet being built is waited for short of it, its tines clear of the bags.
    const stationKind = targetEntry?.station.kind;
    const holdLeg = Math.max(
      markerHoldLegs(routePlan)[targetIndex] ?? 0,
      stationKind === 'build' ? FORKLIFT_STATION_WAIT_METRES + FORKLIFT_INSERT_METRES : 0
    );
    // Every stop is measured to where the insert begins, a metre short of the
    // marker: it stops there, then creeps in as the pick or drop starts.
    const workDistance = Math.max(0, distanceToMarker - FORKLIFT_INSERT_METRES);
    const workHoldLeg = Math.max(0, holdLeg - FORKLIFT_INSERT_METRES);
    const ownPermission = putBack
      ? true
      : markerAction
        ? canPerformWaypointAction(markerAction)
        : false;
    actionCommittedRef.current =
      markerRelevant &&
      nextForkliftActionCommitment({
        committed: actionCommittedRef.current,
        permitted: ownPermission,
        distanceToMarker: workDistance,
        holdLeg: workHoldLeg,
      });
    const actionPermitted = forkliftActionPermitted({
      permitted: ownPermission,
      committed: actionCommittedRef.current,
      truckAtDock: truckTransferReady[dock],
    });
    const actionStop =
      marker && markerRelevant && markerAction
        ? resolveForkliftActionStop({
            distanceToMarker: workDistance,
            holdLeg: workHoldLeg,
            permitted: actionPermitted,
          })
        : null;
    // It never goes up a dock spur it has no work at: it turns at the hold
    // point. Every spur ahead counts, not only the next marker's: an unloaded
    // forklift bound for a pickup passes the dropoff spur first, and went up
    // to the shut door whenever it set off from its crew point empty.
    const spurTwins = markerSpurTwins(routePlan);
    const turnTwins = spurTwinScratch.current;
    turnTwins.length = spurTwins.length;
    for (let index = 0; index < spurTwins.length; index += 1)
      turnTwins[index] = markerRelevant && index === targetIndex ? null : spurTwins[index];
    const spurTurn = nearestSpurTurnAhead(
      routePlan,
      motionBefore.routeDistance,
      markerHoldLegs(routePlan),
      turnTwins,
      stationAhead,
      spurTurnScratch.current
    );
    const logisticsInterlock = !emergencyStopped && (actionStop?.interlocked ?? false);
    if (
      marker &&
      markerRelevant &&
      distanceToMarker <= FORKLIFT_INSERT_METRES + 0.06 &&
      markerAction &&
      !emergencyStopped &&
      actionPermitted &&
      // At a trailer it waits at the insert point, in the lane, for the
      // pallet to reach the tail.
      cargoStationWorkable(markerAction, targetEntry?.pose ? targetEntry.station : null)
    ) {
      // Lined up a metre short with the forks set: the pick or drop begins
      // with the creep in (forkliftWork.ts).
      const total = routePlan.path.totalLength;
      const heading = markerArrivalHeading(routePlan, marker.distance);
      workRef.current = {
        markerDistance: marker.distance,
        heading,
        spur: isSpurMarker(routePlan, marker.distance),
        station: putBack ? 'pickup' : markerAction,
        surface: marker.action.surfaceForkHeight ?? 0,
      };
      const startDistance = (((marker.distance - FORKLIFT_INSERT_METRES) % total) + total) % total;
      const startSample = sampleArcLengthPath(routePlan.path, startDistance);
      motionStateRef.current = {
        ...motionBefore,
        routeDistance: startDistance,
        x: startSample.x,
        z: startSample.z,
        heading,
        speed: 0,
        acceleration: 0,
        stopReason: 'load-operation',
      };
      vehicle.position.x = startSample.x;
      vehicle.position.z = startSample.z;
      vehicle.rotation.y = heading;
      rejoinBlendRef.current = null;
      operationTimerRef.current = 0;
      operationDurationRef.current = marker.action.duration;
      operationRef.current = markerAction === 'pickup' ? 'loading' : 'unloading';
      loadPhaseRef.current = 'aligning';
      setCurrentOperation(operationRef.current);
      currentSpeedRef.current = 0;
      publishMotionTelemetry();
      return;
    }

    // People ahead on its route: it slows for them, and stops short of them.
    // Headless and replay frames can pass a state without a scene or clock.
    if (shouldCheckCollisions && state.scene && state.camera) {
      pedestrianBaseRef.current = motionBefore.routeDistance;
      const count = gatherPedestrians(
        state.scene,
        state.camera,
        state.clock?.elapsedTime ?? Number.NaN,
        crewLive.operatorRoot
      );
      pedestrianAheadRef.current = nearestPedestrianAhead(
        pedestrianSampler,
        pedestrianScratch,
        count
      );
    }
    const pedestrianAhead = pedestrianAheadRef.current;

    const resolvedStopReason = resolveForkliftStopReason({
      id: data.id,
      emergencyStopped,
      crossingClear,
      logisticsInterlock,
      pathClear,
      obstaclePathClear,
      nearby: forkliftsNearby,
    });
    // Someone on foot close ahead on its route has the right of way. Standing
    // at its station for its operator, or briefly for a crew that has not
    // stepped yet, is a scheduled stop.
    const stopReason: ForkliftStopReason =
      resolvedStopReason === 'none' && pedestrianAhead <= FORKLIFT_PEDESTRIAN_STOP
        ? 'pedestrian-yield'
        : resolvedStopReason === 'none' && (atStation || crewGrace)
          ? 'scheduled'
          : resolvedStopReason;

    const requestedStopped = stopReason !== 'none';
    if (requestedStopped !== isStopped) {
      stateChangeTimerRef.current += wallDelta;
      if (stateChangeTimerRef.current >= HYSTERESIS_TIME) {
        setIsStopped(requestedStopped);
        stateChangeTimerRef.current = 0;
        // Only a genuine static obstruction is a near-miss. Commanded waits
        // (crossing reservation, logistics interlock, e-stop or drill) and
        // queuing behind another vehicle keep the red beacon but neither sound
        // the horn nor reset Days Safe. A planned yield to a nearby vehicle
        // sounds the horn as a courtesy, but it is routine fleet priority, not
        // a near miss.
        // Working if a yield never raises 'Near-Miss Avoided' or lowers the
        // safety score, while a blocked route still records one.
        // The horn is for someone who may not have seen it: a person ahead, a
        // blocked route, a vehicle it yields to. Once, then not again for a while.
        if (
          (stopReason === 'route-blocked' ||
            stopReason === 'vehicle-yield' ||
            stopReason === 'pedestrian-yield') &&
          nowMs - lastHornRef.current >= HORN_COOLDOWN_MS
        ) {
          lastHornRef.current = nowMs;
          audioManager.playHorn(data.id);
        }
        if (stopReason === 'route-blocked') {
          recordSafetyStop({
            location: { x: vehicle.position.x, z: vehicle.position.z },
            forkliftId: data.id,
          });
          useSafetyStore
            .getState()
            .recordIncidentLocation(vehicle.position.x, vehicle.position.z, 'stop');
        }
      }
    } else {
      stateChangeTimerRef.current = 0;
    }

    let targetSpeed = data.speed * vehicleSpeedMultiplier;
    targetSpeed = Math.min(targetSpeed, crossingSpeedLimit);
    // Speed zones (Safety panel) cap it at the zone rate of its speed: a
    // ceiling, never zero (speedZoneLimit), read, not subscribed.
    const zoneRules = useSafetyStore.getState();
    targetSpeed = Math.min(
      targetSpeed,
      speedZoneLimit(
        motionBefore.x,
        motionBefore.z,
        zoneRules.speedZones,
        zoneRules.safetyConfig.speedZoneSlowdown,
        data.speed
      )
    );
    if (crewDuty?.walkingPace) targetSpeed = Math.min(targetSpeed, UNMANNED_SPEED);
    // Coming up to a pick or a drop it eases right down before the creep in.
    if (actionStop && actionPermitted && workDistance < FORKLIFT_APPROACH_METRES)
      targetSpeed = Math.min(targetSpeed, FORKLIFT_APPROACH_SPEED);
    if (pedestrianAhead <= FORKLIFT_PEDESTRIAN_LOOKAHEAD)
      targetSpeed = Math.min(targetSpeed, FORKLIFT_PEDESTRIAN_SLOW_SPEED);
    if (crewGrace) targetSpeed = 0;
    // A load set down while it waited is lifted clear before it moves.
    const travelHeight = travelForkHeight(
      routePlan,
      motionBefore.routeDistance,
      hasCargoRef.current
    );
    if (forkHeightRef.current < travelHeight - 0.06) targetSpeed = 0;
    const travelLimit = Math.min(
      actionStop?.stopDistance ?? Infinity,
      spurTurn?.stopDistance ?? Infinity,
      stationStop ?? Infinity
    );
    if (travelLimit < 5) {
      const brakingSpeed = Math.sqrt(Math.max(0, 2 * 1.5 * (travelLimit - 0.03)));
      targetSpeed = Math.min(targetSpeed, brakingSpeed);
    }

    let nextMotion = stepForkliftMotion(motionBefore, routePlan, {
      targetSpeed,
      stopReason,
      loaded: hasCargoRef.current,
      deltaSeconds: simulationDelta,
      maximumTravelDistance: Number.isFinite(travelLimit) ? travelLimit : undefined,
      // Held short of a pickup or dropoff it has not worked: keep facing along
      // the lane, or the bay or trailer at the marker itself. Standing for its
      // operator, it keeps the heading they will climb in beside, once it has
      // turned onto it: one handed back across its lane stood crosswise there.
      holdHeading: logisticsInterlock || (atStation && alignedWithLane(routePlan, motionBefore)),
    });
    // Parked for its operator. To be let off at the end of a spell it is also
    // empty with its forks down (forkliftParkedForCrew): never a load left on
    // the forks of a forklift nobody is in.
    const aligned = alignedWithLane(routePlan, nextMotion);
    crewLive.parkedAt =
      crewStation &&
      (wantsOff && crewStation.kind === 'crew'
        ? forkliftParkedForCrew({
            atStation,
            aligned,
            speed: nextMotion.speed,
            loaded: hasCargoRef.current,
            forkHeight: forkHeightRef.current,
          })
        : atStation && nextMotion.speed <= 0.01 && aligned)
        ? crewStation.kind
        : null;
    if (
      spurTurn &&
      nextMotion.speed <= 0.01 &&
      distanceAheadOnClosedPath(
        routePlan.path,
        nextMotion.routeDistance,
        (motionBefore.routeDistance + spurTurn.stopDistance) % routePlan.path.totalLength
      ) <= 0.06 &&
      stopReason === 'none'
    ) {
      // Standing at the hold point: onto the leg back. Keeping its heading, it
      // pivots standing next frame (stepForkliftMotion), and the drawn position
      // eases across the few centimetres between the twins.
      const twin = sampleArcLengthPath(routePlan.path, spurTurn.turnTo);
      // From where it is drawn, which may still carry a lane-rejoin offset.
      rejoinBlendRef.current = {
        x: vehicle.position.x - twin.x,
        z: vehicle.position.z - twin.z,
        startTravel: nextMotion.wheelTravel,
        seconds: 0,
      };
      nextMotion = { ...nextMotion, routeDistance: spurTurn.turnTo, x: twin.x, z: twin.z };
    }
    useLogisticsLayoutStore
      .getState()
      .recordVehicle(dock, Math.max(0, nextMotion.wheelTravel - motionBefore.wheelTravel));
    motionStateRef.current = nextMotion;
    stopReasonRef.current = stopReason;
    currentSpeedRef.current = nextMotion.speed;
    steeringAngleRef.current = nextMotion.steeringAngle;
    innerSteeringAngleRef.current = nextMotion.innerSteeringAngle;
    outerSteeringAngleRef.current = nextMotion.outerSteeringAngle;
    loadPhaseRef.current = hasCargoRef.current ? 'carrying' : 'idle';
    cargoPresenceRef.current = hasCargoRef.current ? 1 : 0;

    const poseResponse = 1 - Math.exp(-7 * simulationDelta);
    const nextSample = sampleArcLengthPath(routePlan.path, nextMotion.routeDistance);
    const lateralAcceleration = nextSample.curvature * nextMotion.speed * nextMotion.speed;
    const targetRoll = THREE.MathUtils.clamp(-lateralAcceleration * 0.012, -0.045, 0.045);
    const targetPitch = THREE.MathUtils.clamp(-nextMotion.acceleration * 0.008, -0.025, 0.025);
    // After a lane rejoin the drawn position eases from where the driver left
    // it onto the route over the first metres of travel.
    const blend = rejoinBlendRef.current;
    if (blend) blend.seconds += simulationDelta;
    const blendFade = blend
      ? Math.max(
          0,
          1 -
            Math.max(
              (nextMotion.wheelTravel - blend.startTravel) / REJOIN_BLEND_METRES,
              blend.seconds / REJOIN_BLEND_SECONDS
            )
        )
      : 0;
    if (blend && blendFade <= 0) rejoinBlendRef.current = null;
    vehicle.position.x = nextMotion.x + (blend ? blend.x * blendFade : 0);
    vehicle.position.z = nextMotion.z + (blend ? blend.z * blendFade : 0);
    vehicle.rotation.y = nextMotion.heading;
    vehicle.rotation.z += (targetRoll - vehicle.rotation.z) * poseResponse;
    vehicle.rotation.x += (targetPitch - vehicle.rotation.x) * poseResponse;
    // Parked or waiting a while, the load goes down onto the floor and the
    // forks stay down; they come back up before it moves off.
    const standing =
      nextMotion.speed <= 0.01 &&
      (stopReason === 'scheduled' || stopReason === 'logistics-interlock');
    standingSecondsRef.current = standing ? standingSecondsRef.current + simulationDelta : 0;
    forkHeightRef.current +=
      ((standingSecondsRef.current > FORKS_DOWN_AFTER_SECONDS ? 0 : travelHeight) -
        forkHeightRef.current) *
      poseResponse;
    mastTiltRef.current +=
      (resolveForkliftMastTilt('traveling', hasCargoRef.current) - mastTiltRef.current) *
      poseResponse;

    const [nextDirX, nextDirZ] = routeDirection(routePlan, nextMotion.routeDistance);
    positionRegistry.register(
      data.id,
      nextMotion.x,
      nextMotion.z,
      nextDirX,
      nextDirZ,
      requestedStopped || nextMotion.speed <= 0.01,
      vehicle.position.y
    );
    publishMotionTelemetry();
  });

  // After the forklift has moved this frame: publish its pose and the spot its
  // operator would step down at, and carry a seated operator with it, so the
  // body never trails the cab (CommunityLife places people before vehicles move).
  useFrame((_, delta) => {
    const vehicle = ref.current;
    if (!vehicle) return;
    if (!crewSite) {
      forkliftBoardable.set(data.id, operationRef.current === 'traveling');
      return;
    }
    const pose = crewLive.vehicle ?? (crewLive.vehicle = { x: 0, y: 0, z: 0, heading: 0 });
    pose.x = vehicle.position.x;
    pose.y = vehicle.position.y;
    pose.z = vehicle.position.z;
    pose.heading = vehicle.rotation.y;
    const sin = Math.sin(pose.heading);
    const cos = Math.cos(pose.heading);
    // Where its operator would step down: the driver's side, else the other
    // side, but never into a solid, the water or a dock door lane (where a
    // trailer reverses). With neither safe there is no handover, and a crewed
    // forklift cannot be boarded there (forkliftBoardable below). Only a player
    // on foot can displace an operator, so it is sought in first person, and
    // while one is displaced: they walk to wherever it stops for them, even
    // after the player has left first person.
    const seeking = useUIStore.getState().fpsMode || crewLive.state?.phase === 'displaced';
    const segments = seeking ? getTerrainGridSegments(graphicsQuality) : 0;
    const ground = seeking ? sampleWalkingGroundHeight(pose.x, pose.z, segments) : 0;
    let handoverSide = 0;
    for (const side of seeking ? HANDOVER_SIDES : NO_HANDOVER_SIDES) {
      const x = pose.x + side * cos * HANDOVER_SIDE_METRES;
      const z = pose.z - side * sin * HANDOVER_SIDE_METRES;
      if (!forkliftInDockLane(x, z) && !manualStaticBlocked(x, z, 0.3, ground, segments)) {
        handoverSide = side;
        break;
      }
    }
    // A displaced operator keeps the last safe spot: the forklift drives up to
    // theirs, so a stop a little past it with neither side safe still gets the
    // nearest spot to walk to, not the one they started from metres back.
    if (handoverSide === 0) {
      if (crewLive.state?.phase !== 'displaced') crewLive.handover = null;
    } else {
      const handover =
        crewLive.handover ?? (crewLive.handover = { x: 0, z: 0, rotation: 0, routeDistance: 0 });
      // Mutable scratch: the crew copies it on the frame it is used.
      handover.x = pose.x + handoverSide * cos * HANDOVER_SIDE_METRES;
      handover.z = pose.z - handoverSide * sin * HANDOVER_SIDE_METRES;
      handover.rotation = Math.atan2(-handoverSide * cos, handoverSide * sin);
      handover.routeDistance = motionStateRef.current.routeDistance;
    }
    // Boardable only between load operations and climbs, and only where a
    // seated operator has a safe spot to step down to (written just above), and
    // never with them held in a safety stop: the forklift's own, a drill, or a
    // site emergency, which CommunityLife holds every resident for.
    const crewActive = isForkliftCrewActive(crewLive, performance.now(), delta * 1000);
    const crewPhase = crewActive ? crewLive.state?.phase : undefined;
    const operatorSeated = crewPhase === 'aboard' || crewPhase === 'wants-off';
    forkliftBoardable.set(
      data.id,
      operationRef.current === 'traveling' &&
        crewPhase !== 'boarding' &&
        crewPhase !== 'alighting' &&
        !(
          operatorSeated &&
          (crewLive.handover === null ||
            forkliftEmergencyStop ||
            emergencyDrillMode ||
            useGameSimulationStore.getState().emergencyActive)
        )
    );
    crewLive.vehicleHeartbeat = performance.now();
    // The operator steers with it, and looks back over a shoulder while it
    // backs out of a pick or a drop (forkliftCrew.ts forkliftDriveCue).
    const controls = crewLive.controls ?? (crewLive.controls = { steer: 0, reversing: false });
    controls.steer = steeringAngleRef.current;
    controls.reversing =
      (operationRef.current === 'loading' || operationRef.current === 'unloading') &&
      (loadPhaseRef.current === 'retracting' ||
        loadPhaseRef.current === 'carrying' ||
        loadPhaseRef.current === 'withdrawing' ||
        loadPhaseRef.current === 'resetting');
    const root = crewLive.operatorRoot;
    const crew = crewLive.state;
    if (root && crew && isOperatorInCab(crew) && crewActive) {
      operatorSeatPosition(
        pose,
        authoredVehicleVisual ? 'authored' : 'compact',
        operatorSeatRef.current
      );
      root.position.set(...operatorSeatRef.current);
      root.rotation.y = pose.heading;
      root.scale.setScalar(FORKLIFT_OPERATOR_SCALE[authoredVehicleVisual ? 'authored' : 'compact']);
    }
  });

  // Handle click on forklift
  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (onSelect && ref.current) {
      const status =
        currentOperation === 'loading'
          ? 'loading'
          : currentOperation === 'unloading'
            ? 'unloading'
            : motionStopped
              ? 'idle'
              : 'moving';
      onSelect({
        id: data.id,
        cargo: hasCargo ? 'pallet' : 'empty',
        position: [ref.current.position.x, ref.current.position.y, ref.current.position.z],
        rotation: ref.current.rotation.y,
        status,
      });
    }
  };

  // Visual content for the forklift
  const forkliftContent = (
    <group
      ref={ref}
      name={data.id}
      onClick={handleClick}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      {/* Forklift model - full detail when close, billboard when far */}
      {distanceTier === 'close' ? (
        <ForkliftModel
          cargoPresenceRef={cargoPresenceRef}
          isMoving={!motionStopped && !isOperating}
          forkHeightRef={forkHeightRef}
          mastTiltRef={mastTiltRef}
          steeringAngleRef={steeringAngleRef}
          innerSteeringAngleRef={innerSteeringAngleRef}
          outerSteeringAngleRef={outerSteeringAngleRef}
          grime={forkliftGrime}
          load={loadKind}
        />
      ) : (
        <ForkliftBillboard cargoPresenceRef={cargoPresenceRef} load={loadKind} />
      )}

      {/* Warning light - always mounted so the point-light count is constant;
          its housing and wedge are drawn only in the close tier. The compact
          (low) model's roof is at 2.13 m, so the 0.15 m housing centres at 2.205. */}
      <WarningLight
        isStopped={effectiveStopped}
        isInCrossing={isInCrossing}
        simulationPaused={simulationPaused}
        height={FORKLIFT_BEACON.mountHeight[authoredVehicleVisual ? 'authored' : 'compact']}
        showGeometry={distanceTier === 'close'}
      />

      {/* Fleet identity and operation status, rendered only when close */}
      {distanceTier === 'close' && (
        <Billboard
          ref={labelGroupRef}
          position={[
            0,
            forkliftBeaconLabelHeight(authoredVehicleVisual ? 'authored' : 'compact'),
            0,
          ]}
          follow
        >
          <Text
            fontSize={FORKLIFT_LABEL_FONT_SIZE}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000"
          >
            {displayLabel
              ? t('fleetLabel', { tag: displayLabel.tag, role: t(displayLabel.role) })
              : data.id}
          </Text>
          {/* Show operation status when loading/unloading */}
          {isOperating && (
            <Text
              position={[0, 0.24, 0]}
              fontSize={0.14}
              color={currentOperation === 'loading' ? '#22c55e' : '#f59e0b'}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000"
            >
              {currentOperation === 'loading' ? t('operationLoading') : t('operationUnloading')}
            </Text>
          )}
        </Billboard>
      )}
    </group>
  );

  return forkliftContent;
};
