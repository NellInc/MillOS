import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import { positionRegistry, EntityPosition } from '../utils/positionRegistry';
import { audioManager } from '../utils/audioManager';
import { useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useShallow } from 'zustand/react/shallow';
import { getForkliftWarningColor } from '../utils/statusColors';
import { ForkliftModel } from './models';
import { PhysicsForklift } from './physics/PhysicsForklift';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { ForkliftData } from '../types';
import { POLYGON_OFFSET } from '../constants/renderLayers';
import * as THREE from 'three';

// Path visualization component - shows forklift routes on the floor
const ForkliftPath: React.FC<{ path: [number, number, number][]; color: string }> = ({
  path,
  color,
}) => {
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
    <group>
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
      {/* Waypoint markers */}
      {path.map((point, i) => (
        <group key={`waypoint-${i}-${point[0]}-${point[2]}`} position={[point[0], 0.1, point[2]]}>
          {/* Circle marker */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.3, 0.5, 16]} />
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
          {i < path.length && (
            <mesh
              rotation={[
                -Math.PI / 2,
                0,
                Math.atan2(
                  path[(i + 1) % path.length][0] - point[0],
                  path[(i + 1) % path.length][2] - point[2]
                ),
              ]}
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
          )}
        </group>
      ))}
    </group>
  );
};

// Warning light component that changes color based on state
// Memoized since props are primitives (cheap comparison)
const WarningLight = React.memo<{ isStopped: boolean; isInCrossing: boolean }>(
  ({ isStopped, isInCrossing }) => {
    // Use ref instead of useState to avoid triggering re-renders in useFrame
    const flashRef = useRef(false);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const lightRef = useRef<THREE.PointLight>(null);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

    useFrame((state) => {
      // PERFORMANCE: Skip animations when tab hidden
      if (!isTabVisible) return;
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
          lightRef.current.visible = newFlash && (isStopped || isInCrossing);
        }
      }
    });

    // Red when stopped, blue when in crossing zone, amber when normal
    const color = getForkliftWarningColor(isStopped, isInCrossing);
    const glowColor = getForkliftWarningColor(isStopped, isInCrossing);

    return (
      <group position={[0, 2.3, -0.3]}>
        {/* Light housing */}
        <mesh>
          <cylinderGeometry args={[0.1, 0.1, 0.15, 8]} />
          <meshStandardMaterial
            ref={materialRef}
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            toneMapped={false}
          />
        </mesh>
        {/* Glow effect when stopped or in crossing */}
        {(isStopped || isInCrossing) && (
          <pointLight ref={lightRef} color={glowColor} intensity={2} distance={5} visible={false} />
        )}
      </group>
    );
  }
);

// Cargo fade-in duration for billboard (matches detailed model)
const BILLBOARD_CARGO_FADE_DURATION = 0.25;

// Simplified forklift billboard for distant rendering (50+ units away)
// Uses only 4 meshes instead of ~40+ for massive performance improvement
const ForkliftBillboard: React.FC<{ hasCargo: boolean }> = ({ hasCargo }) => {
  // Cargo fade-in refs (no re-renders, minimal overhead)
  const cargoOpacityRef = useRef(hasCargo ? 1 : 0);
  const prevHasCargoRef = useRef(hasCargo);
  const cargoMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame((_, delta) => {
    if (!isTabVisible) return;

    // Detect cargo spawn
    if (hasCargo && !prevHasCargoRef.current) {
      cargoOpacityRef.current = 0;
    }
    prevHasCargoRef.current = hasCargo;

    // Animate opacity (only when needed)
    const targetOpacity = hasCargo ? 1 : 0;
    if (cargoOpacityRef.current !== targetOpacity) {
      if (hasCargo) {
        cargoOpacityRef.current = Math.min(1, cargoOpacityRef.current + delta / BILLBOARD_CARGO_FADE_DURATION);
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
    <group>
      {/* Simple body - single box */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[1.5, 1.2, 2.5]} />
        <meshStandardMaterial color="#f59e0b" roughness={0.6} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 1.5, -0.3]} castShadow>
        <boxGeometry args={[1.2, 0.8, 1]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
      {/* Mast */}
      <mesh position={[0, 1.2, 1.3]} castShadow>
        <boxGeometry args={[0.8, 2, 0.15]} />
        <meshStandardMaterial color="#374151" roughness={0.4} />
      </mesh>
      {/* Cargo - always mounted, opacity animated */}
      <mesh position={[0, 1.4, 1.8]} castShadow visible={hasCargo || cargoOpacityRef.current > 0.01}>
        <boxGeometry args={[0.9, 0.7, 0.9]} />
        <meshStandardMaterial
          ref={cargoMaterialRef}
          color="#fef3c7"
          roughness={0.7}
          transparent
          opacity={cargoOpacityRef.current}
        />
      </mesh>
    </group>
  );
};

type ForkliftOperation = 'traveling' | 'loading' | 'unloading' | 'waiting';

interface WaypointAction {
  type: 'pickup' | 'dropoff' | 'none';
  duration: number; // seconds to spend at this waypoint
}

interface Forklift {
  id: string;
  position: [number, number, number];
  rotation: number;
  speed: number;
  path: [number, number, number][];
  pathActions: WaypointAction[]; // Action at each waypoint
  pathIndex: number;
  cargo: 'empty' | 'pallet';
  operatorName: string;
}

// Path colors for each forklift
const PATH_COLORS = ['#f59e0b', '#3b82f6']; // Amber for first, blue for second

// Conveyor crossing zones - areas where forklifts must yield
// Main conveyor at z=24, roller conveyor at z=21 (updated for new layout)
interface CrossingZone {
  id: string;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  type: 'conveyor' | 'intersection';
}

const CROSSING_ZONES: CrossingZone[] = [
  // Main conveyor crossing zone (z=24, with buffer)
  { id: 'main-conveyor', xMin: -28, xMax: 28, zMin: 22, zMax: 26, type: 'conveyor' },
  // Roller conveyor crossing zone (z=21, with buffer)
  { id: 'roller-conveyor', xMin: -16, xMax: 16, zMin: 19, zMax: 23, type: 'conveyor' },
  // Shipping dock approach (front, z=40-50)
  { id: 'shipping-dock', xMin: -20, xMax: 20, zMin: 40, zMax: 50, type: 'intersection' },
  // Receiving dock approach (back, z=-50 to -40)
  { id: 'receiving-dock', xMin: -20, xMax: 20, zMin: -50, zMax: -40, type: 'intersection' },
];

// Check if a position is within any crossing zone
const isInCrossingZone = (x: number, z: number): CrossingZone | null => {
  for (const zone of CROSSING_ZONES) {
    if (x >= zone.xMin && x <= zone.xMax && z >= zone.zMin && z <= zone.zMax) {
      return zone;
    }
  }
  return null;
};

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
              <meshBasicMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
            <mesh
              position={[(zone.xMin + zone.xMax) / 2, 0.08, zone.zMax]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[xWidth, 0.3]} />
              <meshBasicMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
            {/* Side markers */}
            <mesh
              position={[zone.xMin, 0.08, (zone.zMin + zone.zMax) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.3, zHeight]} />
              <meshBasicMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
            <mesh
              position={[zone.xMax, 0.08, (zone.zMin + zone.zMax) / 2]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[0.3, zHeight]} />
              <meshBasicMaterial
                color="#fbbf24"
                transparent
                opacity={0.6}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
            {/* Warning text */}
            <Text
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

export const ForkliftSystem: React.FC<ForkliftSystemProps> = ({ onSelectForklift }) => {
  // Updated paths for new factory layout (120x160 floor):
  // - Shipping dock at z=50 (front), Receiving dock at z=-50 (back)
  // - Packers at z=25, Silos at z=-22
  // - Conveyors at z=24 (main, x:-28 to 28) and z=21 (roller, x:-15 to 15)
  // IMPORTANT: Forklifts must go AROUND conveyors, not through them
  // Main conveyor blocks z=22.5-25.5 for x in [-28, 28]
  // Roller conveyor blocks z=19.5-22.5 for x in [-15, 15]
  const forklifts = useMemo<Forklift[]>(
    () => [
      {
        id: 'forklift-1',
        position: [45, 0, 32], // Start in east corridor (clear of amenities)
        rotation: 0,
        speed: 3.5,
        // Shipping route: Packing area -> Shipping dock (front, z=50)
        // IMPORTANT: Dock platform obstacle is x:-10 to 10, z:44 to 54
        // Must stay outside those bounds - approach from side at x=15
        // IMPORTANT: Break room at [35,0,25] (x:32-38, z:22.5-27.5) and
        // Toilet block at [35,0,35] (x:31-39, z:32.5-37.5) - route around east side
        path: [
          [28, 0, 20], // Packing area (pickup point) - west of break room
          [45, 0, 20], // Move east to clear corridor
          [45, 0, 42], // Move north along east corridor (clear of toilet block)
          [24, 0, 42], // Approach shipping dock from side (outside platform x=18)
          [24, 0, 44], // At dock edge (dropoff point) - just outside z=44 obstacle boundary
          [24, 0, 42], // Pull back from dock
          [45, 0, 42], // Return to east corridor
          [45, 0, 20], // Head south
        ],
        pathActions: [
          { type: 'pickup', duration: 2.0 }, // Load pallet at packing area
          { type: 'none', duration: 0 },
          { type: 'none', duration: 0 },
          { type: 'none', duration: 0 },
          { type: 'dropoff', duration: 2.0 }, // Unload at shipping dock
          { type: 'none', duration: 0 },
          { type: 'none', duration: 0 },
          { type: 'none', duration: 0 },
        ],
        pathIndex: 0,
        cargo: 'empty',
        operatorName: 'Jake',
      },
      {
        id: 'forklift-2',
        position: [-35, 0, -40], // Start in center of west corridor
        rotation: Math.PI,
        speed: 3,
        // Receiving route: Receiving dock (back, z=-50) -> Silo area
        // IMPORTANT: Dock platform obstacle is x:-10 to 10, z:-54 to -44
        // Must stay outside - approach from side at x=-15
        path: [
          [-35, 0, -43], // At receiving dock edge (pickup point) - aligned with corridor
          [-35, 0, -38], // Pull out
          [-35, 0, -30], // West corridor (center lane to avoid all collisions)
          [-35, 0, -22], // Near silos (dropoff point)
          [-35, 0, -30], // Return to west corridor
          [-35, 0, -38], // Approach receiving dock
        ],
        pathActions: [
          { type: 'pickup', duration: 2.0 }, // Load at receiving dock
          { type: 'none', duration: 0 },
          { type: 'none', duration: 0 },
          { type: 'dropoff', duration: 2.0 }, // Unload at silos
          { type: 'none', duration: 0 },
          { type: 'none', duration: 0 },
        ],
        pathIndex: 0,
        cargo: 'empty',
        operatorName: 'Tom',
      },
    ],
    []
  );

  return (
    <group>
      {/* Render crossing zone markers on floor */}
      <CrossingZoneMarkers />
      {/* Render path lines on floor */}
      {forklifts.map((f, i) => (
        <ForkliftPath
          key={`path-${f.id}`}
          path={f.path}
          color={PATH_COLORS[i % PATH_COLORS.length]}
        />
      ))}
      {/* Render forklifts */}
      {forklifts.map((f) => (
        <Forklift key={f.id} data={f} onSelect={onSelectForklift} />
      ))}
    </group>
  );
};

// Reusable vectors at module level to avoid GC pressure in hot paths
const _tempWorldPos = new THREE.Vector3();

const Forklift: React.FC<{ data: Forklift; onSelect?: (forklift: ForkliftData) => void }> = ({
  data,
  onSelect,
}) => {
  const ref = useRef<THREE.Group>(null);
  const pathIndexRef = useRef(0);
  const currentTarget = useRef(new THREE.Vector3(...data.path[0]));
  const [isStopped, setIsStopped] = useState(false);
  const [distanceTier, setDistanceTier] = useState<'close' | 'far'>('close'); // LOD tier for rendering
  const [hasCargo, setHasCargo] = useState(data.cargo === 'pallet');
  const [currentOperation, setCurrentOperation] = useState<ForkliftOperation>('traveling');
  const forkHeightRef = useRef(0); // Ref for fork animation - avoids re-renders
  const hasCargoRef = useRef(data.cargo === 'pallet'); // Ref mirror for useFrame access
  const operationRef = useRef<ForkliftOperation>('traveling'); // Ref mirror for useFrame access
  const cameraDistanceRef = useRef(0); // Track distance to camera
  const isReversingRef = useRef(false); // Changed to ref to avoid re-renders in useFrame
  const isInCrossingRef = useRef(false); // Changed to ref to avoid re-renders // Track if in crossing zone
  const directionRef = useRef(new THREE.Vector3());
  const dirNormalizedRef = useRef(new THREE.Vector3());
  const prevDirectionRef = useRef(new THREE.Vector3(0, 0, 1));
  const wasStoppedRef = useRef(false);
  const stateChangeTimerRef = useRef(0); // Hysteresis timer
  const frameCountRef = useRef(0); // Frame counter for throttling
  const lastCollisionCheckRef = useRef({
    pathClear: true,
    workersNearby: [] as EntityPosition[],
    forkliftsNearby: [] as EntityPosition[],
  });
  const crossingTimerRef = useRef(0); // Time spent waiting at crossing
  const operationTimerRef = useRef(0); // Time spent on current loading/unloading operation
  const operationDurationRef = useRef(0); // Target duration for current operation
  const wheelRefsRef = useRef<THREE.Mesh[]>([]); // Cached wheel references
  const safetyStopTimerRef = useRef(0); // Time since safety stop started (for resume delay)
  const HYSTERESIS_TIME = 0.15; // 150ms before state can change
  const SAFETY_RESUME_DELAY = 1.0; // Wait 1.0s after safety stop before resuming (prevents worker thrash)
  const CROSSING_WAIT_TIME = 1.0; // Wait 1.0s before entering crossing zone
  const CROSSING_APPROACH_DISTANCE = 3; // Distance to start slowing for crossing
  const FORK_LIFT_HEIGHT = 1.2; // Max height forks raise during load/unload
  const recordSafetyStop = useSafetyStore((state) => state.recordSafetyStop);
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const truckDocked = useTruckScheduleStore(
    useShallow((state) => ({
      shipping: state.truckSchedule.shipping.truckDocked,
      receiving: state.truckSchedule.receiving.truckDocked,
    }))
  );

  // Physics system toggle
  const enablePhysics = useGraphicsStore((state) => state.graphics.enablePhysics);

  // Callback for physics forklift position updates
  // Note: We do NOT update the position of ref.current here because in physics mode,
  // ref.current is a child of the RigidBody and moves with it automatically.
  // Updating it here would cause double-transformation (moving it relative to the moving parent).
  const handlePhysicsPositionUpdate = useCallback((_x: number, _z: number, _rotation: number) => {
    // Left empty intentionally to prevent double-transformation
    // The physics engine handles the movement of the parent RigidBody
  }, []);

  // Callbacks for physics forklift state updates
  const handleCargoChange = useCallback((cargo: boolean) => {
    setHasCargo(cargo);
    hasCargoRef.current = cargo;
  }, []);

  const handleOperationChange = useCallback((op: ForkliftOperation) => {
    setCurrentOperation(op);
    operationRef.current = op;
  }, []);

  // Play horn when stopping for safety
  useEffect(() => {
    if (isStopped && !wasStoppedRef.current) {
      audioManager.playHorn(data.id);
      recordSafetyStop();
    }
    wasStoppedRef.current = isStopped;
  }, [isStopped, data.id, recordSafetyStop]);

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
    };
  }, [data.id]);

  useFrame((state, delta) => {
    // PERFORMANCE: Skip all forklift logic when tab hidden
    if (!ref.current || !isTabVisible) return;

    // When physics is enabled, skip all movement - physics handles position
    // But still update LOD and wheel animations
    if (enablePhysics) {
      // Calculate world distance for LOD (ref.current is local (0,0,0) inside physics body)
      // Uses module-level vector to avoid GC pressure
      ref.current.getWorldPosition(_tempWorldPos);
      cameraDistanceRef.current = state.camera.position.distanceTo(_tempWorldPos);

      const FAR_THRESHOLD = 50;
      const CLOSE_THRESHOLD = 40;
      if (distanceTier === 'close' && cameraDistanceRef.current > FAR_THRESHOLD) {
        setDistanceTier('far');
      } else if (distanceTier === 'far' && cameraDistanceRef.current < CLOSE_THRESHOLD) {
        setDistanceTier('close');
      }
      return; // Skip all legacy movement code
    }

    // Update camera distance for LOD (with hysteresis to prevent flickering)
    cameraDistanceRef.current = state.camera.position.distanceTo(ref.current.position);
    const FAR_THRESHOLD = 50;
    const CLOSE_THRESHOLD = 40;
    if (distanceTier === 'close' && cameraDistanceRef.current > FAR_THRESHOLD) {
      setDistanceTier('far');
    } else if (distanceTier === 'far' && cameraDistanceRef.current < CLOSE_THRESHOLD) {
      setDistanceTier('close');
    }

    const pos = ref.current.position;
    const target = currentTarget.current;
    // Reuse Vector3 refs to avoid GC pressure
    const direction = directionRef.current.subVectors(target, pos);
    const distance = direction.length();

    // Collision avoidance: check for workers and other forklifts ahead
    const SAFETY_RADIUS = 2.5; // Distance to keep from entities
    const FORKLIFT_SAFETY_RADIUS = 4; // Larger radius for forklift-to-forklift
    const CHECK_DISTANCE = 5; // How far ahead to check
    const dirNormalized = dirNormalizedRef.current.copy(direction).normalize();

    // Detect if reversing (direction changed significantly)
    const dotProduct = dirNormalized.dot(prevDirectionRef.current);
    const reversing = dotProduct < -0.5; // Roughly opposite direction
    if (reversing !== isReversingRef.current) {
      isReversingRef.current = reversing;
    }

    // Play backup beeper when reversing
    if (reversing && !isStopped) {
      audioManager.playBackupBeep(data.id);
    }

    prevDirectionRef.current.copy(dirNormalized);

    // Throttle expensive collision detection to every 3 frames (~20Hz instead of 60Hz)
    // This significantly reduces CPU load while still being responsive enough for safety
    frameCountRef.current++;
    const shouldCheckCollisions = frameCountRef.current % 3 === 0;

    let pathClear: boolean;
    let workersNearby: EntityPosition[];
    let forkliftsNearby: EntityPosition[];

    if (shouldCheckCollisions) {
      // Check path is clear of workers, other forklifts, and static obstacles
      pathClear = positionRegistry.isPathClear(
        pos.x,
        pos.z,
        dirNormalized.x,
        dirNormalized.z,
        CHECK_DISTANCE,
        SAFETY_RADIUS,
        data.id, // Pass forklift ID to also check for other forklifts
        true, // Enable obstacle checking
        pos.y // Pass Y position for height checks
      );

      // Check immediate vicinity for workers
      workersNearby = positionRegistry.getWorkersNearby(pos.x, pos.z, SAFETY_RADIUS, pos.y);

      // Check immediate vicinity for other forklifts
      forkliftsNearby = positionRegistry.getForkliftsNearby(
        pos.x,
        pos.z,
        FORKLIFT_SAFETY_RADIUS,
        data.id,
        pos.y
      );

      // Cache the results
      lastCollisionCheckRef.current = { pathClear, workersNearby, forkliftsNearby };
    } else {
      // Use cached results
      ({ pathClear, workersNearby, forkliftsNearby } = lastCollisionCheckRef.current);
    }

    // Check if currently in or approaching a crossing zone
    const currentCrossingZone = isInCrossingZone(pos.x, pos.z);

    // Check if next position (ahead by CROSSING_APPROACH_DISTANCE) would be in crossing zone
    const lookAheadX = pos.x + dirNormalized.x * CROSSING_APPROACH_DISTANCE;
    const lookAheadZ = pos.z + dirNormalized.z * CROSSING_APPROACH_DISTANCE;
    const approachingCrossingZone = isInCrossingZone(lookAheadX, lookAheadZ);

    // Update crossing state
    const nowInCrossing = currentCrossingZone !== null || approachingCrossingZone !== null;
    if (nowInCrossing !== isInCrossingRef.current) {
      isInCrossingRef.current = nowInCrossing;
    }

    // Crossing zone logic: slow down or wait before entering
    let crossingClear = true;
    let speedMultiplier = 1.0;

    if (approachingCrossingZone && !currentCrossingZone) {
      // Approaching a crossing zone - wait before entering
      crossingTimerRef.current += delta;
      if (crossingTimerRef.current < CROSSING_WAIT_TIME) {
        crossingClear = false; // Must wait
      }
      speedMultiplier = 0.5; // Slow approach
    } else if (currentCrossingZone) {
      // In a crossing zone - move at reduced speed
      speedMultiplier = 0.6;
      crossingTimerRef.current = 0; // Reset timer once we're in
    } else {
      crossingTimerRef.current = 0; // Reset when not near crossing
    }

    // Truck coordination: speed up when relevant truck is docked
    // forklift-1 handles shipping dock, forklift-2 handles receiving dock
    const isShippingForklift = data.id === 'forklift-1';
    const isReceivingForklift = data.id === 'forklift-2';
    if (
      (isShippingForklift && truckDocked.shipping) ||
      (isReceivingForklift && truckDocked.receiving)
    ) {
      speedMultiplier *= 1.3; // 30% speed boost when truck is waiting
    }

    // Check emergency stop states (forklift E-stop or fire drill in progress)
    const emergencyStopActive = forkliftEmergencyStop || emergencyDrillMode;

    // Basic safety conditions (path clear, no nearby entities)
    const basicSafetyMet =
      !emergencyStopActive &&
      pathClear &&
      workersNearby.length === 0 &&
      forkliftsNearby.length === 0 &&
      crossingClear;

    // Track safety stop timer - prevents thrash by requiring delay before resume
    // Timer represents time spent in "safe" state since last safety stop
    // When basically safe and timer > 0, we're in the resume delay countdown
    if (!basicSafetyMet) {
      // Currently unsafe - reset the resume timer to start fresh on next safe transition
      // We mark this as -1 to indicate "was recently unsafe"
      if (safetyStopTimerRef.current !== -1) {
        safetyStopTimerRef.current = -1;
      }
    } else if (safetyStopTimerRef.current === -1) {
      // Just transitioned from unsafe to safe - start the resume delay timer
      safetyStopTimerRef.current = 0;
    } else if (safetyStopTimerRef.current < SAFETY_RESUME_DELAY) {
      // In resume delay - count up
      safetyStopTimerRef.current += delta;
    }
    // When timer >= SAFETY_RESUME_DELAY, forklift can move

    // Only safe to move if basic safety met AND resume delay has passed
    const resumeDelayPassed = safetyStopTimerRef.current >= SAFETY_RESUME_DELAY;
    const isSafeToMove = basicSafetyMet && resumeDelayPassed;
    const newIsStopped = !isSafeToMove;

    // Register position with CURRENT frame's stopped state (not delayed React state)
    // This ensures workers see the forklift's intent immediately
    positionRegistry.register(
      data.id,
      pos.x,
      pos.z,
      'forklift',
      dirNormalized.x,
      dirNormalized.z,
      newIsStopped,
      pos.y
    );

    // Hysteresis: require stable state for HYSTERESIS_TIME before changing React state
    if (newIsStopped !== isStopped) {
      stateChangeTimerRef.current += delta;
      if (stateChangeTimerRef.current >= HYSTERESIS_TIME) {
        setIsStopped(newIsStopped);
        stateChangeTimerRef.current = 0;
      }
    } else {
      stateChangeTimerRef.current = 0; // Reset timer if state matches
    }

    // Handle loading/unloading operations (use ref for immediate access)
    const currentOp = operationRef.current;
    if (currentOp === 'loading' || currentOp === 'unloading') {
      operationTimerRef.current += delta;
      const duration = operationDurationRef.current || 1; // Prevent division by zero
      const progress = Math.min(operationTimerRef.current / duration, 1);

      // Animate forks: raise during first half, lower during second half
      let newForkHeight: number;
      if (progress < 0.5) {
        // Raising forks
        newForkHeight = THREE.MathUtils.lerp(0, FORK_LIFT_HEIGHT, progress * 2);
      } else {
        // Lowering forks
        newForkHeight = THREE.MathUtils.lerp(FORK_LIFT_HEIGHT, 0, (progress - 0.5) * 2);
      }
      // Update fork height ref directly (no re-renders)
      forkHeightRef.current = newForkHeight;

      // Toggle cargo at midpoint of operation
      if (progress >= 0.5 && !hasCargoRef.current && currentOp === 'loading') {
        hasCargoRef.current = true;
        setHasCargo(true);
      } else if (progress >= 0.5 && hasCargoRef.current && currentOp === 'unloading') {
        hasCargoRef.current = false;
        setHasCargo(false);
      }

      // Operation complete
      if (progress >= 1) {
        operationTimerRef.current = 0;
        operationRef.current = 'traveling';
        setCurrentOperation('traveling');
        forkHeightRef.current = 0;
        // Move to next waypoint
        pathIndexRef.current = (pathIndexRef.current + 1) % data.path.length;
        currentTarget.current.set(...data.path[pathIndexRef.current]);
      }
      return; // Don't move while operating
    }

    if (distance < 0.5) {
      // Arrived at waypoint - check for action
      const action = data.pathActions[pathIndexRef.current];
      const currentlyHasCargo = hasCargoRef.current; // Use ref for immediate value

      if (action.type === 'pickup' && !currentlyHasCargo) {
        // Start loading operation
        operationTimerRef.current = 0;
        operationDurationRef.current = action.duration;
        operationRef.current = 'loading';
        setCurrentOperation('loading');
        return;
      } else if (action.type === 'dropoff' && currentlyHasCargo) {
        // Start unloading operation
        operationTimerRef.current = 0;
        operationDurationRef.current = action.duration;
        operationRef.current = 'unloading';
        setCurrentOperation('unloading');
        return;
      } else {
        // No action or action not applicable, move to next waypoint
        pathIndexRef.current = (pathIndexRef.current + 1) % data.path.length;
        currentTarget.current.set(...data.path[pathIndexRef.current]);
      }
    } else if (isSafeToMove) {
      // Move towards target only if path is clear
      // Apply speed multiplier for crossing zone slowdown
      const effectiveSpeed = data.speed * speedMultiplier;
      direction.normalize();
      pos.add(direction.multiplyScalar(effectiveSpeed * delta));

      // Rotate to face direction
      const targetRotation = Math.atan2(direction.x, direction.z);
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, targetRotation, 0.1);

      // Wheel rotation animation (only when moving, scaled by speed)
      // Cache wheel references on first access (indices 8-11: after body, cabin, roof, 3 masts, and 2 forks)
      if (wheelRefsRef.current.length === 0 && ref.current.children.length >= 12) {
        wheelRefsRef.current = ref.current.children.slice(8, 12) as THREE.Mesh[];
      }
      for (let i = 0; i < wheelRefsRef.current.length; i++) {
        wheelRefsRef.current[i].rotation.x += delta * 5 * speedMultiplier;
      }
    }
  });

  // Determine if currently performing an operation (for UI display)
  const isOperating = currentOperation === 'loading' || currentOperation === 'unloading';

  // Handle click on forklift
  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (onSelect && ref.current) {
      const status =
        currentOperation === 'loading'
          ? 'loading'
          : currentOperation === 'unloading'
            ? 'unloading'
            : isStopped
              ? 'idle'
              : 'moving';
      onSelect({
        id: data.id,
        operatorName: data.operatorName,
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
      onClick={handleClick}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
    >
      {/* Forklift model - full detail when close, billboard when far */}
      {distanceTier === 'close' ? (
        <ForkliftModel
          hasCargo={hasCargo}
          isMoving={!isStopped && !isOperating}
          speedMultiplier={1}
          forkHeightRef={forkHeightRef}
        />
      ) : (
        <ForkliftBillboard hasCargo={hasCargo} />
      )}

      {/* Warning light - only render when close (flashing light not visible from far anyway) */}
      {distanceTier === 'close' && (
        <WarningLight isStopped={isStopped} isInCrossing={isInCrossingRef.current} />
      )}

      {/* Operator name and status - only render when close */}
      {distanceTier === 'close' && (
        <group>
          <Text
            position={[0, 2.6, 0]}
            fontSize={0.25}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000"
          >
            {data.operatorName}
          </Text>
          {/* Show operation status when loading/unloading */}
          {isOperating && (
            <Text
              position={[0, 2.9, 0]}
              fontSize={0.2}
              color={currentOperation === 'loading' ? '#22c55e' : '#f59e0b'}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.02}
              outlineColor="#000"
            >
              {currentOperation === 'loading' ? 'LOADING' : 'UNLOADING'}
            </Text>
          )}
        </group>
      )}
    </group>
  );

  // When physics is enabled, wrap in PhysicsForklift for collision/movement
  if (enablePhysics) {
    return (
      <PhysicsForklift
        data={{
          id: data.id,
          position: data.position,
          rotation: data.rotation,
          speed: data.speed,
          path: data.path,
          pathActions: data.pathActions,
          pathIndex: data.pathIndex,
          cargo: data.cargo,
          operatorName: data.operatorName,
        }}
        onPositionUpdate={handlePhysicsPositionUpdate}
        onCargoChange={handleCargoChange}
        onOperationChange={handleOperationChange}
      >
        {forkliftContent}
      </PhysicsForklift>
    );
  }

  // Legacy mode - no physics wrapper
  return forkliftContent;
};
