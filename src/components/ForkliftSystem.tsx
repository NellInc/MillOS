import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Line } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';
import { positionRegistry, EntityPosition } from '../utils/positionRegistry';
import { audioManager } from '../utils/audioManager';
import { useAudioInitialized } from '../hooks/useAudioState';
import { useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useProductionStore } from '../stores/productionStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useShallow } from 'zustand/react/shallow';
import { getForkliftWarningColor } from '../utils/statusColors';
import { ForkliftModel } from './models';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { ForkliftData } from '../types';
import { POLYGON_OFFSET } from '../constants/renderLayers';
import { SITE_LAYOUT } from '../constants/siteLayout';
import {
  createRoundedForkliftRoute,
  canPerformForkliftLogisticsAction,
  isForkliftSimulationPaused,
  resolveForkliftMastTilt,
  type ForkliftOperationPhase,
  type ForkliftWaypointAction,
} from '../simulation/forkliftRoute';
import {
  createForkliftRoutePlan,
  createInitialForkliftMotion,
  distanceAheadOnClosedPath,
  sampleForkliftLoadPose,
  stepForkliftMotion,
  type ForkliftLoadPhase,
  type ForkliftStopReason,
} from '../simulation/vehicles/forkliftController';
import { sampleArcLengthPath } from '../simulation/vehicles/vehicleKinematics';
import {
  vehicleTelemetryRegistry,
  type VehicleTelemetrySnapshot,
} from '../simulation/vehicles/vehicleTelemetryRegistry';
import * as THREE from 'three';
import { applyWorldSurface } from '../utils/worldSurface';

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

/** Sweep rate of the beacon's light wedge, in radians per second. */
const BEACON_SWEEP_RATE = 4;

/**
 * Rotating safety beacon.
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
 * The wedge is additive geometry rather than a spotlight for the same reason:
 * a mesh's `visible` flag costs nothing, a light's changes every shader. The
 * real point light is reserved for high and ultra because each point light
 * adds a loop to every lit material in the complete scene. Medium retains the
 * emissive beacon and sweeping pool without that scene-wide shader cost.
 *
 * The same rule covers LOD: the beacon stays mounted in the far tier, where
 * `showGeometry` hides only the housing and wedge (the billboard has its own
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
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const sweepRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const realLightEnabled = graphicsQuality === 'high' || graphicsQuality === 'ultra';

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
      if (materialRef.current) {
        materialRef.current.emissiveIntensity = newFlash ? 3 : 0.5;
      }
      if (lightRef.current) {
        lightRef.current.intensity = newFlash ? 1.6 : 0;
      }
    }
  });

  // Red when stopped, blue when in crossing zone, amber when normal
  const color = getForkliftWarningColor(isStopped, isInCrossing);

  return (
    <group position={[0, height, -0.3]}>
      {/* Light housing */}
      <mesh visible={showGeometry}>
        <cylinderGeometry args={[0.1, 0.1, 0.15, 10]} />
        <meshStandardMaterial
          ref={materialRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          roughness={0.3}
          metalness={0}
          // TRUE, not false: this component renders at `low` as well, where
          // there is no composer and `false` would clamp the lit emissive to a
          // flat white blob instead of letting the Neutral curve roll it off.
          toneMapped
        />
      </mesh>
      {/* Sweeping light wedge - additive, so it only ever adds fill.
          16 radial segments, not 8. The cone is 1.1 m across and its material is
          unlit and constant-opacity, so what the eye gets is a hard coverage
          edge: at 8 that edge is a visible octagon on a metre-wide glow, which
          reads as a faceted cone rather than as light. The rotation is not paid
          for by the facets - the radial wobble 8 of them buy is 42 mm on a
          550 mm radius at 0.16 opacity - so smoothing costs the sweep nothing.
          16 stays divisible by 4, so the 0.55 m base radius is unchanged. */}
      <group ref={sweepRef} visible={showGeometry}>
        <mesh position={[0, 0.02, 0]} renderOrder={8}>
          <coneGeometry args={[0.55, 0.9, 16, 1, true]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.16}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      {realLightEnabled && (
        <pointLight ref={lightRef} color={color} intensity={0} distance={7} decay={2} />
      )}
    </group>
  );
});

// Cargo fade-in duration for billboard (matches detailed model)
const BILLBOARD_CARGO_FADE_DURATION = 0.25;

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
  mast: applyWorldSurface(
    new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.35, metalness: 0.85 }),
    'metal'
  ),
};

const ForkliftBillboard: React.FC<{ hasCargo: boolean; simulationPaused: boolean }> = ({
  hasCargo,
  simulationPaused,
}) => {
  // Cargo fade-in refs (no re-renders, minimal overhead)
  const cargoOpacityRef = useRef(hasCargo ? 1 : 0);
  const prevHasCargoRef = useRef(hasCargo);
  const cargoMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame((_, delta) => {
    if (!isTabVisible || simulationPaused) return;
    const animationDelta = delta * Math.max(0, useProductionStore.getState().productionSpeed);

    // Detect cargo spawn
    if (hasCargo && !prevHasCargoRef.current) {
      cargoOpacityRef.current = 0;
    }
    prevHasCargoRef.current = hasCargo;

    // Animate opacity (only when needed)
    const targetOpacity = hasCargo ? 1 : 0;
    if (cargoOpacityRef.current !== targetOpacity) {
      if (hasCargo) {
        cargoOpacityRef.current = Math.min(
          1,
          cargoOpacityRef.current + animationDelta / BILLBOARD_CARGO_FADE_DURATION
        );
      } else {
        cargoOpacityRef.current = 0;
      }
      if (cargoMaterialRef.current) {
        cargoMaterialRef.current.opacity = cargoOpacityRef.current;
        cargoMaterialRef.current.visible = cargoOpacityRef.current > 0.01;
      }
    }
  });

  return (
    <group name="forklift-billboard">
      {/* Simple body - single box.
          BILLBOARD_AMBER is the sRGB of the authored GLB's linear
          `painted-safety-amber` (0.694, 0.323, 0.024). The old `#f59e0b` was a
          different hue, so the LOD swap popped in colour as well as
          silhouette; matching it leaves only the silhouette delta. */}
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.2, 2.5]} />
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
        <primitive object={BILLBOARD_MATERIALS.body} attach="material" />
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
      <mesh position={[0, 1.2, 1.3]} castShadow receiveShadow>
        <boxGeometry args={[0.8, 2, 0.15]} />
        <primitive object={BILLBOARD_MATERIALS.mast} attach="material" />
      </mesh>
      {/* Cargo - always mounted, opacity animated */}
      <mesh
        position={[0, 1.4, 1.8]}
        castShadow
        receiveShadow
        visible={hasCargo || cargoOpacityRef.current > 0.01}
      >
        <boxGeometry args={[0.9, 0.7, 0.9]} />
        {/* Sacking on a pallet, in OBJECT rest space - the forklift drives, and
            a world-space field would slide the weave across the load. */}
        <meshStandardMaterial
          ref={(mat) => {
            cargoMaterialRef.current = mat;
            if (mat) applyWorldSurface(mat, 'fabric');
          }}
          color="#fef3c7"
          roughness={0.7}
          metalness={0}
          transparent
          opacity={cargoOpacityRef.current}
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
  const route = createRoundedForkliftRoute(forklift.path, forklift.pathActions, 2, 8);
  return {
    ...forklift,
    path: route.path,
    pathActions: route.actions,
    authoredPath: forklift.path,
    authoredActions: forklift.pathActions,
  };
};

// In-world tags use the SCADA vehicle names (tagDatabase FLT01/FLT02) plus the
// forklift's role; data.id stays the key for logic and selection.
const FORKLIFT_DISPLAY_LABELS: Record<string, string> = {
  'forklift-1': 'FLT01 · SHIPPING',
  'forklift-2': 'FLT02 · RECEIVING',
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
  // Both routes use the shared site anchors. Clearance tests cover the whole
  // swept vehicle corridor against machines, conveyors and dock platforms.
  const forklifts = useMemo<RoutedForklift[]>(
    () =>
      (
        [
          {
            id: 'forklift-1',
            position: [...SITE_LAYOUT.routes.forklifts.shipping.points[0]],
            rotation: 0,
            speed: 3.5,
            // Finished-bag aisle to the shipping platform side approach.
            path: SITE_LAYOUT.routes.forklifts.shipping.points.map((point) => [...point]),
            pathActions: [
              { type: 'pickup', duration: 7.0 }, // Align, engage, lift, tilt, and retract
              { type: 'none', duration: 0 },
              { type: 'none', duration: 0 },
              { type: 'none', duration: 0 },
              { type: 'dropoff', duration: 6.0 }, // Level, place, disengage, and withdraw
              { type: 'none', duration: 0 },
              { type: 'none', duration: 0 },
              { type: 'none', duration: 0 },
            ],
            pathIndex: 0,
            cargo: 'empty',
          },
          {
            id: 'forklift-2',
            position: [...SITE_LAYOUT.routes.forklifts.receiving.points[0]],
            rotation: Math.PI,
            speed: 3,
            // Receiving route: Receiving dock (back, z=-50) -> Silo area
            // IMPORTANT: Dock platform obstacle is x:-10 to 10, z:-54 to -44
            // Must stay outside - approach from side at x=-15
            path: SITE_LAYOUT.routes.forklifts.receiving.points.map((point) => [...point]),
            pathActions: [
              { type: 'pickup', duration: 7.0 }, // Align, engage, lift, tilt, and retract
              { type: 'none', duration: 0 },
              { type: 'none', duration: 0 },
              { type: 'dropoff', duration: 6.0 }, // Level, place, disengage, and withdraw
              { type: 'none', duration: 0 },
              { type: 'none', duration: 0 },
            ],
            pathIndex: 0,
            cargo: 'empty',
          },
        ] as Forklift[]
      ).map(withRoundedRoute),
    []
  );

  return (
    <group name="forklift-system">
      {/* Render crossing zone markers on floor */}
      {showSpeedZones && (
        <>
          <CrossingZoneMarkers />
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
    </group>
  );
};

const Forklift: React.FC<{ data: Forklift; onSelect?: (forklift: ForkliftData) => void }> = ({
  data,
  onSelect,
}) => {
  const ref = useRef<THREE.Group>(null);
  const routePlan = useMemo(
    () => createForkliftRoutePlan(data.path, data.pathActions),
    [data.path, data.pathActions]
  );
  const motionStateRef = useRef(createInitialForkliftMotion(routePlan, data.position));
  const actionMarkerIndexRef = useRef(0);
  const [isStopped, setIsStopped] = useState(false);
  const [distanceTier, setDistanceTier] = useState<'close' | 'far'>('close'); // LOD tier for rendering
  const [hasCargo, setHasCargo] = useState(data.cargo === 'pallet');
  const [currentOperation, setCurrentOperation] = useState<ForkliftOperation>('traveling');
  const forkHeightRef = useRef(0); // Ref for fork animation - avoids re-renders
  const hasCargoRef = useRef(data.cargo === 'pallet'); // Ref mirror for useFrame access
  const operationRef = useRef<ForkliftOperation>('traveling'); // Ref mirror for useFrame access
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
    forkliftsNearby: [] as EntityPosition[],
  });
  const crossingTimerRef = useRef(0); // Time spent waiting at crossing
  const operationTimerRef = useRef(0); // Time spent on current loading/unloading operation
  const operationDurationRef = useRef(0); // Target duration for current operation
  const currentSpeedRef = useRef(0);
  const steeringAngleRef = useRef(0);
  const innerSteeringAngleRef = useRef(0);
  const outerSteeringAngleRef = useRef(0);
  const mastTiltRef = useRef(resolveForkliftMastTilt('traveling', data.cargo === 'pallet'));
  const HYSTERESIS_TIME = 0.15; // 150ms before state can change
  const CROSSING_WAIT_TIME = 1.0; // Wait 1.0s before entering crossing zone
  const CROSSING_APPROACH_DISTANCE = 3; // Distance to start slowing for crossing
  const FORK_LIFT_HEIGHT = 0.72; // Pallet clearance lift; loaded travel settles to 0.32 m
  const recordSafetyStop = useSafetyStore((state) => state.recordSafetyStop);
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  const productionSpeed = useProductionStore((state) => state.productionSpeed);
  const audioReady = useAudioInitialized();
  const truckTransferReady = useTruckScheduleStore(
    useShallow((state) => ({
      shipping: state.truckSchedule.shipping.transferReady,
      receiving: state.truckSchedule.receiving.transferReady,
    }))
  );
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
      return canPerformForkliftLogisticsAction({
        forkliftId: data.id,
        action,
        shippingDocked: truckTransferReady.shipping,
        receivingDocked: truckTransferReady.receiving,
        releasedFinishedKg: dispatchExecution.releasedFinishedKg,
        dispatchLoadStatus: dispatchExecution.loadStatus,
      });
    },
    [
      data.id,
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
  const simulationPaused = isForkliftSimulationPaused(productionSpeed, gameSpeed);
  const motionStopped = effectiveStopped || simulationPaused;
  const isOperating = currentOperation === 'loading' || currentOperation === 'unloading';
  const effectiveStoppedRef = useRef(effectiveStopped);
  effectiveStoppedRef.current = effectiveStopped;

  // 1 Hz utilisation sample for Safety Analytics. The store books wall-clock
  // deltas, so the first sample after a resume attributes the pause gap to the
  // last known state.
  useEffect(() => {
    if (simulationPaused) return undefined;
    const id = setInterval(
      () => useSafetyStore.getState().updateForkliftMetrics(data.id, !effectiveStoppedRef.current),
      1000
    );
    return () => clearInterval(id);
  }, [data.id, simulationPaused]);

  useEffect(() => {
    if (!audioReady) return undefined;
    audioManager.startForkliftEngine(data.id);
    return () => audioManager.stopForkliftEngine(data.id);
  }, [audioReady, data.id]);

  useEffect(() => {
    if (!audioReady) return;
    audioManager.updateForkliftEngine(data.id, !motionStopped && !isOperating, effectiveStopped);
  }, [audioReady, data.id, effectiveStopped, isOperating, motionStopped]);

  useEffect(() => {
    if (!audioReady) return;
    const duration = Math.max(0.6, operationDurationRef.current || 1.5);
    if (currentOperation === 'loading') {
      audioManager.playHydraulicLift(data.id, duration);
    } else if (currentOperation === 'unloading') {
      audioManager.playHydraulicLower(data.id, duration);
    }
  }, [audioReady, currentOperation, data.id]);

  // Set initial position only once (not via prop to avoid reset on re-render)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (ref.current && !initializedRef.current) {
      ref.current.position.set(...data.position);
      initializedRef.current = true;
    }
  }, [data.position]);

  // Cleanup: unregister from position registry on unmount
  useEffect(() => {
    return () => {
      positionRegistry.unregister(data.id);
      vehicleTelemetryRegistry.unregister(data.id);
      crossingReservations.forEach((owner, crossingId) => {
        if (owner === data.id) crossingReservations.delete(crossingId);
      });
    };
  }, [data.id]);

  useFrame((state, delta) => {
    if (!ref.current || !isTabVisible) return;

    const wallDelta = Math.min(Math.max(delta, 1 / 240), 0.1);
    const simulationDelta = wallDelta * Math.max(0, productionSpeed);
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
    if (distanceTier === 'close' && cameraDistanceRef.current > FORKLIFT_LOD_FAR_METRES) {
      setDistanceTier('far');
    } else if (distanceTier === 'far' && cameraDistanceRef.current < FORKLIFT_LOD_CLOSE_METRES) {
      setDistanceTier('close');
    }

    const publishMotionTelemetry = (): void => {
      const motion = motionStateRef.current;
      Object.assign(vehicle.userData, {
        forkliftId: data.id,
        type: 'forklift',
        phase: operationRef.current,
        loadPhase: loadPhaseRef.current,
        speed: motion.speed,
        acceleration: motion.acceleration,
        steeringAngle: motion.steeringAngle,
        innerSteeringAngle: motion.innerSteeringAngle,
        outerSteeringAngle: motion.outerSteeringAngle,
        wheelTravel: motion.wheelTravel,
        routeDistance: motion.routeDistance,
        stopReason: motion.stopReason,
        forkHeight: forkHeightRef.current,
        mastTilt: mastTiltRef.current,
        cargo: hasCargoRef.current ? 'pallet' : 'empty',
        stopped: motion.stopReason !== 'none' || motion.speed <= 0.01,
      });
      const telemetry = telemetryRef.current;
      telemetry.speedMps = motion.speed;
      telemetry.steeringRadians = motion.steeringAngle;
      telemetry.phase = loadPhaseRef.current;
      telemetry.stopReason = motion.stopReason;
      vehicleTelemetryRegistry.publish(telemetry);
    };

    if (simulationPaused) {
      motionStateRef.current = {
        ...motionBefore,
        speed: 0,
        acceleration: 0,
        stopReason: 'simulation-paused',
      };
      currentSpeedRef.current = 0;
      stopReasonRef.current = 'simulation-paused';
      const sample = sampleArcLengthPath(routePlan.path, motionBefore.routeDistance);
      dirNormalizedRef.current.set(sample.tangentX, 0, sample.tangentZ);
      positionRegistry.register(
        data.id,
        motionBefore.x,
        motionBefore.z,
        sample.tangentX,
        sample.tangentZ,
        true,
        vehicle.position.y
      );
      publishMotionTelemetry();
      return;
    }

    const currentSample = sampleArcLengthPath(routePlan.path, motionBefore.routeDistance);
    const direction = dirNormalizedRef.current.set(
      currentSample.tangentX,
      0,
      currentSample.tangentZ
    );
    frameCountRef.current += 1;
    const shouldCheckCollisions = frameCountRef.current % 3 === 0;
    let pathClear: boolean;
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
      forkliftsNearby = positionRegistry.getForkliftsNearby(
        motionBefore.x,
        motionBefore.z,
        clearance.forkliftSafetyRadius,
        data.id,
        vehicle.position.y
      );
      lastCollisionCheckRef.current = { pathClear, forkliftsNearby };
    } else {
      ({ pathClear, forkliftsNearby } = lastCollisionCheckRef.current);
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

    const marker = routePlan.markers[actionMarkerIndexRef.current];
    const markerAction =
      marker?.action.type === 'pickup' || marker?.action.type === 'dropoff'
        ? marker.action.type
        : null;
    const markerRelevant =
      markerAction === 'pickup'
        ? !hasCargoRef.current
        : markerAction === 'dropoff'
          ? hasCargoRef.current
          : false;
    const distanceToMarker = marker
      ? distanceAheadOnClosedPath(routePlan.path, motionBefore.routeDistance, marker.distance)
      : Infinity;

    // An e-stop or drill freezes a lift/place cycle where it is, as well as travel.
    const emergencyStopped = forkliftEmergencyStop || emergencyDrillMode;

    if (operationRef.current === 'loading' || operationRef.current === 'unloading') {
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
          direction.x,
          direction.z,
          true,
          vehicle.position.y
        );
        publishMotionTelemetry();
        return;
      }
      operationTimerRef.current += simulationDelta;
      const duration = Math.max(0.1, operationDurationRef.current);
      const action = operationRef.current === 'loading' ? 'pickup' : 'dropoff';
      const loadPose = sampleForkliftLoadPose(
        action,
        operationTimerRef.current / duration,
        FORK_LIFT_HEIGHT
      );
      loadPhaseRef.current = loadPose.phase;
      forkHeightRef.current = loadPose.forkHeight;
      mastTiltRef.current = loadPose.mastTilt;
      stopReasonRef.current = 'load-operation';

      if (action === 'pickup' && loadPose.cargoEngaged && !hasCargoRef.current) {
        hasCargoRef.current = true;
        setHasCargo(true);
      } else if (action === 'dropoff' && !loadPose.cargoEngaged && hasCargoRef.current) {
        hasCargoRef.current = false;
        setHasCargo(false);
      }

      motionStateRef.current = {
        ...motionBefore,
        speed: 0,
        acceleration: 0,
        stopReason: 'load-operation',
      };
      currentSpeedRef.current = 0;
      positionRegistry.register(
        data.id,
        motionBefore.x,
        motionBefore.z,
        direction.x,
        direction.z,
        true,
        vehicle.position.y
      );

      if (loadPose.operationComplete) {
        operationTimerRef.current = 0;
        operationRef.current = 'traveling';
        loadPhaseRef.current = hasCargoRef.current ? 'carrying' : 'idle';
        setCurrentOperation('traveling');
        actionMarkerIndexRef.current =
          routePlan.markers.length > 0
            ? (actionMarkerIndexRef.current + 1) % routePlan.markers.length
            : 0;
        forkHeightRef.current = hasCargoRef.current ? 0.32 : 0;
        mastTiltRef.current = resolveForkliftMastTilt('traveling', hasCargoRef.current);
      }
      publishMotionTelemetry();
      return;
    }

    let logisticsInterlock = false;
    if (marker && markerRelevant && distanceToMarker <= 0.06 && markerAction && !emergencyStopped) {
      if (canPerformWaypointAction(markerAction)) {
        const markerSample = sampleArcLengthPath(routePlan.path, marker.distance);
        motionStateRef.current = {
          ...motionBefore,
          routeDistance: marker.distance,
          x: markerSample.x,
          z: markerSample.z,
          speed: 0,
          acceleration: 0,
          stopReason: 'load-operation',
        };
        vehicle.position.x = markerSample.x;
        vehicle.position.z = markerSample.z;
        operationTimerRef.current = 0;
        operationDurationRef.current = marker.action.duration;
        operationRef.current = markerAction === 'pickup' ? 'loading' : 'unloading';
        loadPhaseRef.current = 'aligning';
        setCurrentOperation(operationRef.current);
        currentSpeedRef.current = 0;
        publishMotionTelemetry();
        return;
      }
      logisticsInterlock = true;
    }

    let stopReason: ForkliftStopReason = 'none';
    if (emergencyStopped) stopReason = 'emergency-stop';
    else if (!pathClear) stopReason = 'route-blocked';
    else if (forkliftsNearby.some((other) => !other.isStopped || data.id > other.id)) {
      stopReason = 'vehicle-yield';
    } else if (!crossingClear) stopReason = 'crossing-reservation';
    else if (logisticsInterlock) stopReason = 'logistics-interlock';

    if (!pathClear && forkliftsNearby.length > 0 && data.id < forkliftsNearby[0].id) {
      // Stable fleet priority prevents reciprocal stopped vehicles from waiting
      // forever. The lower id proceeds only after the peer has fully stopped.
      if (forkliftsNearby.every((other) => other.isStopped)) stopReason = 'none';
    }

    const requestedStopped = stopReason !== 'none';
    if (requestedStopped !== isStopped) {
      stateChangeTimerRef.current += wallDelta;
      if (stateChangeTimerRef.current >= HYSTERESIS_TIME) {
        setIsStopped(requestedStopped);
        stateChangeTimerRef.current = 0;
        // Only a genuine obstruction is a near-miss. Commanded waits (crossing
        // reservation, logistics interlock, e-stop or drill) keep the red
        // beacon but neither sound the horn nor reset Days Safe.
        if (stopReason === 'route-blocked' || stopReason === 'vehicle-yield') {
          audioManager.playHorn(data.id);
          recordSafetyStop();
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
    if (marker && markerRelevant && distanceToMarker < 5) {
      const brakingSpeed = Math.sqrt(Math.max(0, 2 * 1.5 * (distanceToMarker - 0.03)));
      targetSpeed = Math.min(targetSpeed, brakingSpeed);
    }

    const nextMotion = stepForkliftMotion(motionBefore, routePlan, {
      targetSpeed,
      stopReason,
      loaded: hasCargoRef.current,
      deltaSeconds: simulationDelta,
      maximumTravelDistance: marker && markerRelevant ? distanceToMarker : undefined,
    });
    motionStateRef.current = nextMotion;
    stopReasonRef.current = stopReason;
    currentSpeedRef.current = nextMotion.speed;
    steeringAngleRef.current = nextMotion.steeringAngle;
    innerSteeringAngleRef.current = nextMotion.innerSteeringAngle;
    outerSteeringAngleRef.current = nextMotion.outerSteeringAngle;
    loadPhaseRef.current = hasCargoRef.current ? 'carrying' : 'idle';

    const poseResponse = 1 - Math.exp(-7 * simulationDelta);
    const nextSample = sampleArcLengthPath(routePlan.path, nextMotion.routeDistance);
    const lateralAcceleration = nextSample.curvature * nextMotion.speed * nextMotion.speed;
    const targetRoll = THREE.MathUtils.clamp(-lateralAcceleration * 0.012, -0.045, 0.045);
    const targetPitch = THREE.MathUtils.clamp(-nextMotion.acceleration * 0.008, -0.025, 0.025);
    vehicle.position.x = nextMotion.x;
    vehicle.position.z = nextMotion.z;
    vehicle.rotation.y = nextMotion.heading;
    vehicle.rotation.z += (targetRoll - vehicle.rotation.z) * poseResponse;
    vehicle.rotation.x += (targetPitch - vehicle.rotation.x) * poseResponse;
    forkHeightRef.current +=
      ((hasCargoRef.current ? 0.32 : 0) - forkHeightRef.current) * poseResponse;
    mastTiltRef.current +=
      (resolveForkliftMastTilt('traveling', hasCargoRef.current) - mastTiltRef.current) *
      poseResponse;

    positionRegistry.register(
      data.id,
      nextMotion.x,
      nextMotion.z,
      nextSample.tangentX,
      nextSample.tangentZ,
      requestedStopped || nextMotion.speed <= 0.01,
      vehicle.position.y
    );
    publishMotionTelemetry();
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
          hasCargo={hasCargo}
          isMoving={!motionStopped && !isOperating}
          forkHeightRef={forkHeightRef}
          mastTiltRef={mastTiltRef}
          steeringAngleRef={steeringAngleRef}
          innerSteeringAngleRef={innerSteeringAngleRef}
          outerSteeringAngleRef={outerSteeringAngleRef}
          grime={forkliftGrime}
        />
      ) : (
        <ForkliftBillboard hasCargo={hasCargo} simulationPaused={simulationPaused} />
      )}

      {/* Warning light - always mounted so the point-light count is constant;
          its housing and wedge are drawn only in the close tier. The compact
          (low) model's roof is at 2.13 m, so the 0.15 m housing centres at 2.205. */}
      <WarningLight
        isStopped={effectiveStopped}
        isInCrossing={isInCrossing}
        simulationPaused={simulationPaused}
        height={authoredVehicleVisual ? 1.86 : 2.205}
        showGeometry={distanceTier === 'close'}
      />

      {/* Fleet identity and operation status, rendered only when close */}
      {distanceTier === 'close' && (
        <Billboard position={[0, authoredVehicleVisual ? 2.18 : 2.48, 0]} follow>
          <Text
            fontSize={0.17}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000"
          >
            {FORKLIFT_DISPLAY_LABELS[data.id] ?? data.id}
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
              {currentOperation === 'loading' ? 'LOADING' : 'UNLOADING'}
            </Text>
          )}
        </Billboard>
      )}
    </group>
  );

  return forkliftContent;
};
