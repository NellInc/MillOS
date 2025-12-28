import React, { useMemo, useEffect, useRef, Suspense, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Text } from '@react-three/drei';
import * as THREE from 'three';

// Import static assets so Vite handles base path correctly
import warehouseHdrUrl from '/hdri/warehouse.hdr?url';
import { MachinesContainer, MachineSimulationController } from './Machines';
import { ConveyorSystem } from './ConveyorSystem';
// Using new optimized worker system with centralized animation manager
import { WorkerSystemNew as WorkerSystem } from './WorkerSystemNew';
import { FactoryInfrastructure } from './FactoryInfrastructure';
import { SpoutingSystem } from './SpoutingSystem';
import { DustParticles, GrainFlow, MachineSteamVents, DustAnimationManager } from './DustParticles';
import { FactoryExterior } from './FactoryExterior';
import { FarmArea } from './FarmArea';
import { VillageArea } from './VillageArea';
import { OpenDockOpening } from './infrastructure/OpenDockOpening';
import { ForkliftSystem, ForkliftData } from './ForkliftSystem';
import { FactoryEnvironment, CoreGameTimeSystem } from './Environment';
import { HolographicDisplays } from './HolographicDisplays';
import { CascadeVisualization } from './CascadeVisualization';
import { StrategicOverlay3D } from './StrategicOverlay3D';
import { ZoneAccentLights } from './ZoneAccentLights';
import { ProductionFlowVisualization } from './ProductionFlowVisualization';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { BlueprintMode } from './blueprint';
import { WorkerPersonalityLayer } from './workers/WorkerPersonalityLayer';
import { PostProcessing } from './PostProcessing';

// Lazy load heavy 3D components to reduce initial bundle
const TruckBay = React.lazy(() =>
  import('./TruckBay')
    .then((m) => ({ default: m.TruckBay }))
    .catch((err) => {
      console.error('Failed to load TruckBay:', err);
      return { default: () => null };
    })
);
const AmbientDetailsGroup = React.lazy(() =>
  import('./AmbientDetails')
    .then((m) => ({ default: m.AmbientDetailsGroup }))
    .catch((err) => {
      console.error('Failed to load AmbientDetailsGroup:', err);
      return { default: () => null };
    })
);
import { VisibleChaos } from './VisibleChaos';
import { FactoryEnvironmentSystem } from './FactoryEnvironment';
import { MaintenanceSystem } from './MaintenanceSystem';
import { useMoodSimulation, useBilateralAlignmentSimulation } from './WorkerMoodOverlay';
import { RemotePlayersGroup } from './multiplayer';
import { MachineData, MachineType, WorkerData } from '../types';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useProductionStore } from '../stores/productionStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore, FIRE_DRILL_EXITS } from '../stores/gameSimulationStore';
import { positionRegistry, Obstacle } from '../utils/positionRegistry';
import { useShallow } from 'zustand/react/shallow';
import { CameraBoundsTracker } from './CameraController';
import { useCameraPositionStore } from '../stores/useCameraPositionStore';
import { FLOOR_LAYERS, RENDER_ORDER, POLYGON_OFFSET } from '../constants/renderLayers';
import { FACTORY_ZONE_Z } from '../constants/factoryLayout';

/**
 * WireframeController - Applies wireframe mode to all scene materials when enabled
 * Reads enableWireframe from graphics store and traverses scene to toggle wireframe
 * OPTIMIZED: Only traverses scene when enableWireframe changes, not every frame
 */
const WireframeController: React.FC = () => {
  const enableWireframe = useGraphicsStore((state) => state.graphics.enableWireframe);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const lastWireframeState = useRef<boolean | null>(null);

  useFrame(({ scene }) => {
    if (!sceneRef.current) sceneRef.current = scene;

    // Only traverse scene when wireframe state actually changes
    if (lastWireframeState.current === enableWireframe) return;
    lastWireframeState.current = enableWireframe;

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
            mat.wireframe = enableWireframe;
            mat.needsUpdate = true;
          }
        });
      }
    });
  });

  return null;
};

// Single heat map point with ref-based animation (throttled to reduce CPU load)
// Memoized to prevent re-renders when parent updates
const HeatMapPoint = React.memo<{
  point: { x: number; z: number; intensity: number; type: string };
  registerAnimation: (
    id: string,
    refs: {
      circle: THREE.MeshBasicMaterial | null;
      ring: THREE.MeshBasicMaterial | null;
      column: THREE.MeshBasicMaterial | null;
      intensityRef: React.MutableRefObject<number>;
    }
  ) => void;
  unregisterAnimation: (id: string) => void;
}>(({ point, registerAnimation, unregisterAnimation }) => {
  const circleMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const columnMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const id = `${point.x}-${point.z}`;

  // Memoize derived values to prevent recalculation
  const intensity = point.intensity / 10;
  // Use a ref for intensity to avoid re-running the registration effect when it changes
  const intensityRef = useRef(intensity);
  // Update ref on every render
  intensityRef.current = intensity;

  const radius = useMemo(() => 1 + intensity * 2, [intensity]);
  const color = useMemo(
    () =>
      point.type === 'emergency'
        ? '#ef4444'
        : point.type === 'near_miss'
          ? '#f97316'
          : point.type === 'stop'
            ? '#eab308'
            : '#3b82f6',
    [point.type]
  );

  // Memoize position arrays to prevent Three.js re-renders
  // Use FLOOR_LAYERS.heatMap for consistent z-ordering
  const groupPosition = useMemo<[number, number, number]>(
    () => [point.x, FLOOR_LAYERS.heatMap, point.z],
    [point.x, point.z]
  );
  const columnPosition = useMemo<[number, number, number]>(
    () => [0, intensity * 2, 0],
    [intensity]
  );

  // Static positions/rotations defined outside render
  const floorRotation = useMemo<[number, number, number]>(() => [-Math.PI / 2, 0, 0], []);
  const labelPosition = useMemo<[number, number, number]>(() => [0, 0.5, 0], []);

  // Register with parent manager
  useEffect(() => {
    registerAnimation(id, {
      circle: circleMaterialRef.current,
      ring: ringMaterialRef.current,
      column: columnMaterialRef.current,
      intensityRef, // Pass the ref instead of the value
    });
    return () => unregisterAnimation(id);
  }, [id, registerAnimation, unregisterAnimation]); // No intensity dependency!

  return (
    <group position={groupPosition} renderOrder={RENDER_ORDER.heatMap}>
      {/* Heat circle on floor */}
      <mesh rotation={floorRotation}>
        <circleGeometry args={[radius, 32]} />
        <meshBasicMaterial
          ref={circleMaterialRef}
          color={color}
          transparent
          opacity={0.3 * intensity}
          depthWrite={false}
        />
      </mesh>
      {/* Outer ring - raised slightly for z-separation */}
      <mesh rotation={floorRotation} position={[0, 0.02, 0]}>
        <ringGeometry args={[radius - 0.1, radius, 32]} />
        <meshBasicMaterial
          ref={ringMaterialRef}
          color={color}
          transparent
          opacity={0.6}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
      {/* Rising column for high-intensity spots */}
      {intensity > 0.5 && (
        <mesh position={columnPosition}>
          <cylinderGeometry args={[0.3, 0.5, intensity * 4, 16]} />
          <meshBasicMaterial ref={columnMaterialRef} color={color} transparent opacity={0.2} />
        </mesh>
      )}
      {/* Intensity label for significant hotspots */}
      {point.intensity >= 3 && (
        <Text
          position={labelPosition}
          fontSize={0.4}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000"
        >
          {point.intensity.toFixed(0)}x
        </Text>
      )}
    </group>
  );
});

// Incident Heat Map 3D Visualization
const IncidentHeatMap: React.FC = () => {
  const incidentHeatMap = useSafetyStore((state) => state.incidentHeatMap);
  const showIncidentHeatMap = useSafetyStore((state) => state.showIncidentHeatMap);

  // Registry for animated materials
  const animatedRefs = useRef<
    Map<
      string,
      {
        circle: THREE.MeshBasicMaterial | null;
        ring: THREE.MeshBasicMaterial | null;
        column: THREE.MeshBasicMaterial | null;
        intensityRef: React.MutableRefObject<number>;
      }
    >
  >(new Map());

  const registerAnimation = useCallback((id: string, refs: any) => {
    animatedRefs.current.set(id, refs);
  }, []);

  const unregisterAnimation = useCallback((id: string) => {
    animatedRefs.current.delete(id);
  }, []);

  // Single centralized animation loop
  useFrame((state) => {
    if (!showIncidentHeatMap || animatedRefs.current.size === 0) return;

    // Throttle animation update? Maybe not needed for simple opacity pulse,
    // but we can throttle if needed. For now run every frame for smooth pulse.
    const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.3 + 0.7;

    animatedRefs.current.forEach((refs) => {
      // Use the ref value for intensity
      if (refs.circle) refs.circle.opacity = 0.3 * pulse * refs.intensityRef.current;
      if (refs.ring) refs.ring.opacity = 0.6 * pulse;
      if (refs.column) refs.column.opacity = 0.2 * pulse;
    });
  });

  if (!showIncidentHeatMap || incidentHeatMap.length === 0) return null;

  return (
    <group>
      {incidentHeatMap.map((point) => (
        // PERFORMANCE: Use stable position-based key instead of array index to prevent unnecessary re-renders
        <HeatMapPoint
          key={`${point.x}-${point.z}`}
          point={point}
          registerAnimation={registerAnimation}
          unregisterAnimation={unregisterAnimation}
        />
      ))}
    </group>
  );
};

// Fire Drill Exit Markers - glowing green markers at each exit point
// Memoized since it receives stable props from store selectors
const FireDrillExitMarkers = React.memo(() => {
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const drillMetrics = useGameSimulationStore((state) => state.drillMetrics);
  const materialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);

  // Pulsing animation for exit markers
  useFrame((state) => {
    if (!emergencyDrillMode) return;
    const pulse = Math.sin(state.clock.elapsedTime * 4) * 0.3 + 0.7;
    materialRefs.current.forEach((mat) => {
      if (mat) {
        mat.emissiveIntensity = pulse * 2;
        mat.opacity = 0.6 + pulse * 0.4;
      }
    });
  });

  // Only show during active fire drill
  if (!emergencyDrillMode || !drillMetrics.active) return null;

  return (
    <group>
      {FIRE_DRILL_EXITS.map((exit, i) => (
        <group
          key={exit.id}
          position={[exit.position.x, FLOOR_LAYERS.exitIndicator, exit.position.z]}
          renderOrder={RENDER_ORDER.exitIndicator}
        >
          {/* Glowing circle on floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[2, 3.5, 32]} />
            <meshStandardMaterial
              ref={(el) => {
                materialRefs.current[i] = el;
              }}
              color="#22c55e"
              emissive="#22c55e"
              emissiveIntensity={1.5}
              transparent
              opacity={0.8}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {/* Inner solid circle - raised slightly for z-separation */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <circleGeometry args={[2, 32]} />
            <meshStandardMaterial
              color="#22c55e"
              emissive="#22c55e"
              emissiveIntensity={0.5}
              transparent
              opacity={0.4}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
              polygonOffsetUnits={POLYGON_OFFSET.standard.units}
            />
          </mesh>
          {/* Exit label */}
          <Text
            position={[0, 2, 0]}
            fontSize={1.2}
            color="#22c55e"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.05}
            outlineColor="#000000"
          >
            {exit.label.toUpperCase()}
          </Text>
          {/* Pointing arrow above */}
          <mesh position={[0, 3.5, 0]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[0.5, 1, 8]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

interface MillSceneProps {
  productionSpeed: number;
  showZones: boolean;
  onSelectMachine: (data: MachineData) => void;
  onSelectWorker: (data: WorkerData) => void;
  onSelectForklift?: (data: ForkliftData) => void;
}

const FLOOR_SIZE_X = 120; // Wide enough for interior operations
const FLOOR_SIZE_Z = 160; // Extended for front/back truck yards
const FLOOR_SIZE = 120; // Legacy reference for components using single value

export const MillScene: React.FC<MillSceneProps> = ({
  productionSpeed,
  showZones,
  onSelectForklift,
  onSelectMachine,
  onSelectWorker,
}) => {
  // PERF DEBUG: Track renders
  // trackRender('MillScene');

  const { setMachines } = useProductionStore(
    useShallow((state) => ({
      setMachines: state.setMachines,
      // Removed subscriptions that cause re-renders
    }))
  );

  // Worker mood simulation - Theme Hospital inspired mood system
  useMoodSimulation();

  // Bilateral Alignment simulation - preference requests, safety reports, emergent cooperation
  useBilateralAlignmentSimulation();

  const machines = useMemo(() => {
    const _machines: MachineData[] = [];

    // ZONE 1: Raw Material Storage (Silos) - Back Row
    const siloNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    for (let i = -2; i <= 2; i++) {
      // Deterministic metrics based on machine index (no Math.random)
      const idx = i + 2; // 0-4
      _machines.push({
        id: `silo-${idx}`, // silo-0 to silo-4
        name: `Silo ${siloNames[idx]}`,
        type: MachineType.SILO,
        position: [i * 9, 0, FACTORY_ZONE_Z.silos],
        size: [4.5, 16, 4.5],
        rotation: 0,
        status: 'running',
        metrics: {
          rpm: 0,
          temperature: 20 + idx * 0.4, // Deterministic: 20-21.6°C
          vibration: 0.8 + idx * 0.04, // Deterministic: 0.8-0.96
          load: 60 + idx * 3, // Deterministic: 60-72%
          wear: 0, // Start with no wear
          efficiency: 100, // Start at full efficiency
        },
        lastMaintenance: '2024-01-15',
        nextMaintenance: '2024-04-15',
      });
    }

    // ZONE 2: Milling Floor (Roller Mills)
    const millNames = ['RM-101', 'RM-102', 'RM-103', 'RM-104', 'RM-105', 'RM-106'];
    let millIndex = 0;
    for (let i = -3; i <= 3; i += 1.5) {
      if (Math.abs(i) < 0.5) continue;
      // Deterministic metrics based on mill position
      const idx = millIndex;
      _machines.push({
        id: `rm-${millNames[millIndex].split('-')[1]}`, // rm-101 to rm-106
        name: millNames[millIndex],
        type: MachineType.ROLLER_MILL,
        position: [i * 5, 0, FACTORY_ZONE_Z.milling],
        size: [3.5, 5, 3.5],
        rotation: 0,
        status: 'running',
        metrics: {
          rpm: 1200 + idx * 8, // Deterministic: 1200-1240
          temperature: 42 + idx * 0.8, // Deterministic: 42-46°C
          vibration: 1.5 + idx * 0.08, // Deterministic: 1.5-1.9
          load: 70 + idx * 1.6, // Deterministic: 70-80%
          wear: 0, // Start with no wear
          efficiency: 100, // Start at full efficiency
        },
        lastMaintenance: '2024-02-01',
        nextMaintenance: '2024-05-01',
      });
      millIndex++;
    }

    // ZONE 3: Sifting (Plansifters) - Elevated
    const sifterNames = ['Sifter A', 'Sifter B', 'Sifter C'];
    for (let i = -1; i <= 1; i++) {
      // Deterministic metrics based on sifter position
      const idx = i + 1; // 0-2
      _machines.push({
        id: `sifter-${['a', 'b', 'c'][idx]}`, // sifter-a, sifter-b, sifter-c
        name: sifterNames[idx],
        type: MachineType.PLANSIFTER,
        position: [i * 14, 9, FACTORY_ZONE_Z.sifting],
        size: [7, 7, 7],
        rotation: 0,
        status: 'running',
        metrics: {
          rpm: 200 + idx * 6, // Deterministic: 200-212
          temperature: 28 + idx * 1.3, // Deterministic: 28-30.6°C
          vibration: 5.5 + idx * 0.3, // Deterministic: 5.5-6.1
          load: 75 + idx * 3, // Deterministic: 75-81%
          wear: 0, // Start with no wear
          efficiency: 100, // Start at full efficiency
        },
        lastMaintenance: '2024-01-20',
        nextMaintenance: '2024-04-20',
      });
    }

    // ZONE 4: Packaging (Packers) - Moved forward to z=25 for more space
    const packerNames = ['Pack Line 1', 'Pack Line 2', 'Pack Line 3'];
    for (let i = -1; i <= 1; i++) {
      // Deterministic metrics based on packer position
      const idx = i + 1; // 0-2
      _machines.push({
        id: `packer-${idx}`, // packer-0, packer-1, packer-2
        name: packerNames[idx],
        type: MachineType.PACKER,
        position: [i * 8, 0, FACTORY_ZONE_Z.packing],
        size: [4, 6, 4],
        rotation: Math.PI,
        status: 'running',
        metrics: {
          rpm: 60,
          temperature: 28 + idx * 1.6, // Deterministic: 28-31.2°C
          vibration: 1 + idx * 0.3, // Deterministic: 1.0-1.6
          load: 85 + idx * 3, // Deterministic: 85-91%
          wear: 0, // Start with no wear
          efficiency: 100, // Start at full efficiency
        },
        lastMaintenance: '2024-02-10',
        nextMaintenance: '2024-05-10',
      });
    }

    return _machines;
  }, []);

  // Define obstacle regions for worker pathfinding
  const obstacles = useMemo<Obstacle[]>(() => {
    const obs: Obstacle[] = [];
    const WORKER_PADDING = 1.0; // Extra padding around machines

    // SILOS (Zone 1, z=-22) - including legs and hopper
    // Silos have size [4.5, 16, 4.5] at positions [i*9, 0, -22]
    for (let i = -2; i <= 2; i++) {
      const x = i * 9;
      obs.push({
        id: `silo-obs-${i}`,
        minX: x - 2.25 - WORKER_PADDING,
        maxX: x + 2.25 + WORKER_PADDING,
        minZ: FACTORY_ZONE_Z.silos - 2.25 - WORKER_PADDING,
        maxZ: FACTORY_ZONE_Z.silos + 2.25 + WORKER_PADDING,
      });
    }

    // ROLLER MILLS (Zone 2, z=-6)
    // Mills have size [3.5, 5, 3.5] at positions [i*5, 0, -6] for i in [-3, -1.5, 1.5, 3]
    for (const i of [-3, -1.5, 1.5, 3]) {
      const x = i * 5;
      obs.push({
        id: `mill-obs-${i}`,
        minX: x - 1.75 - WORKER_PADDING,
        maxX: x + 1.75 + WORKER_PADDING,
        minZ: FACTORY_ZONE_Z.milling - 1.75 - WORKER_PADDING,
        maxZ: FACTORY_ZONE_Z.milling + 1.75 + WORKER_PADDING,
      });
    }

    // PLANSIFTERS (Zone 3, z=6) - elevated at y=9, but have hanging cables
    // Workers can walk under these, but the cables at corners need small obstacles
    for (let i = -1; i <= 1; i++) {
      const x = i * 14;
      // Just mark small cable anchor points at corners (not full machine footprint)
      const cablePositions = [
        [-3.2, -3.2],
        [-3.2, 3.2],
        [3.2, -3.2],
        [3.2, 3.2],
      ];
      cablePositions.forEach(([dx, dz], idx) => {
        obs.push({
          id: `sifter-cable-${i}-${idx}`,
          minX: x + dx - 0.3,
          maxX: x + dx + 0.3,
          minZ: FACTORY_ZONE_Z.sifting + dz - 0.3,
          maxZ: FACTORY_ZONE_Z.sifting + dz + 0.3,
        });
      });
    }

    // PACKERS (Zone 4, z=25)
    // Packers have size [4, 6, 4] at positions [i*8, 0, 25]
    for (let i = -1; i <= 1; i++) {
      const x = i * 8;
      obs.push({
        id: `packer-obs-${i}`,
        minX: x - 2 - WORKER_PADDING,
        maxX: x + 2 + WORKER_PADDING,
        minZ: FACTORY_ZONE_Z.packing - 2 - WORKER_PADDING,
        maxZ: FACTORY_ZONE_Z.packing + 2 + WORKER_PADDING,
      });
    }

    // CONVEYOR SYSTEM OBSTACLES - Full belt structures
    // Workers and forklifts must walk around the conveyors
    // Main conveyor belt at z=24, length 55 (x from -27.5 to 27.5)
    obs.push({
      id: 'main-conveyor-belt',
      minX: -28,
      maxX: 28,
      minZ: 22.5,
      maxZ: 25.5,
    });

    // Roller conveyor at z=21, length 30 (x from -15 to 15)
    obs.push({
      id: 'roller-conveyor-belt',
      minX: -15,
      maxX: 15,
      minZ: 19.5,
      maxZ: 22.5,
    });

    // Central longitudinal conveyor - runs from silos (z=-22) to packers (z=25)
    // Located at x=-1.5 to 1.5 (center of factory), workers must walk around
    // Note: Safe aisles at x=±2.5 remain clear for workers to walk beside conveyor
    obs.push({
      id: 'central-conveyor-belt',
      minX: -1.8, // Actual belt width (x: -1.5 to 1.5) + small buffer
      maxX: 1.8,
      minZ: -20, // From just past silos
      maxZ: 18, // Up to just before the lateral conveyors
    });

    // LOADING DOCK PLATFORMS - Forklifts must not drive onto elevated docks
    // Shipping dock (front, z=50): platform at [0, 1, 47], size 32x6 (expanded for 2 bays)
    obs.push({
      id: 'shipping-dock-platform',
      minX: -18,
      maxX: 18,
      minZ: 44,
      maxZ: 54,
    });

    // Receiving dock (back, z=-50): platform at [0, 1, -47], size 16x6
    obs.push({
      id: 'receiving-dock-platform',
      minX: -10,
      maxX: 10,
      minZ: -54,
      maxZ: -44,
    });

    // AMENITY BUILDINGS - Break rooms, toilet blocks, locker rooms
    // These are forklift-only obstacles (workers can enter/exit normally)
    // Moved to back wall area, away from truck paths

    // Left break room at [-50, 0, -20], floor 6x5
    obs.push({
      id: 'break-room-left',
      minX: -53,
      maxX: -47,
      minZ: -22.5,
      maxZ: -17.5,
      forkliftOnly: true,
    });

    // Right break room at [50, 0, -20], floor 6x5
    obs.push({
      id: 'break-room-right',
      minX: 47,
      maxX: 53,
      minZ: -22.5,
      maxZ: -17.5,
      forkliftOnly: true,
    });

    // Toilet block at [35, 0, 35], floor 8x5
    obs.push({
      id: 'toilet-block',
      minX: 31,
      maxX: 39,
      minZ: 32.5,
      maxZ: 37.5,
      forkliftOnly: true,
    });

    // Locker room at [-50, 0, -35], floor 8x6 - moved to back wall area
    obs.push({
      id: 'locker-room',
      minX: -54,
      maxX: -46,
      minZ: -38,
      maxZ: -32,
      forkliftOnly: true,
    });

    // Manager's office at [-20, 0, 30], floor 8x6
    obs.push({
      id: 'manager-office',
      minX: -24,
      maxX: -16,
      minZ: 27,
      maxZ: 33,
      forkliftOnly: true,
    });

    return obs;
  }, []);

  // Register obstacles with position registry on mount
  useEffect(() => {
    positionRegistry.registerObstacles(obstacles);
  }, [obstacles]);

  // Sync machines with store on mount
  // Sync machines with store on mount
  useEffect(() => {
    // Only set if store is empty
    if (useProductionStore.getState().machines.length === 0) {
      setMachines(machines);
    }
  }, [machines, setMachines]);

  // Use store machines if available, otherwise use local machines
  // PERFORMANCE: MillScene NO LONGER subscribes to storeMachines updates to prevent full scene re-renders
  // MachinesContainer handles live updates internally
  const displayMachines = machines;

  // PERFORMANCE: Consolidated store subscriptions with useShallow to prevent unnecessary re-renders
  const { graphicsQuality, perfDebug } = useGraphicsStore(
    useShallow((state) => ({
      graphicsQuality: state.graphics.quality,
      perfDebug: state.graphics.perfDebug,
    }))
  );
  const isLowGraphics = graphicsQuality === 'low';

  // Camera-based visibility culling - hide interior when outside, hide exterior when inside
  // Exception: In dock zones (near open dock openings), show BOTH interior and exterior
  const isCameraInside = useCameraPositionStore((state) => state.isCameraInside);
  const isCameraInDockZone = useCameraPositionStore((state) => state.isCameraInDockZone);

  // AI Visualization toggles (all default OFF)
  const showCascadeVisualization = useAIConfigStore((state) => state.showCascadeVisualization);

  // Show interior when inside OR in dock transition zone
  const showInterior = isCameraInside || isCameraInDockZone;
  // Show exterior when outside OR in dock transition zone
  const showExterior = !isCameraInside || isCameraInDockZone;

  return (
    <group>
      {/* Wireframe mode controller - responds to enableWireframe toggle */}
      <WireframeController />

      {/* Atmospheric fog for depth - Bruno Simon style */}
      {/* Linear fog with dark blue-gray color, subtle enough not to obscure gameplay */}
      {!isLowGraphics && <fog attach="fog" args={['#1a1a2e', 80, 250]} />}

      {/* Internal Dock Elements - Shipping and Receiving */}
      {/* These large black doors link the interior and exterior visually */}
      {showInterior && !isLowGraphics && (
        <>
          {/* Shipping Dock (Front) */}
          <OpenDockOpening
            position={[0, 0, 48]}
            rotation={0}
            width={30}
            height={14}
            label="SHIPPING"
          />
          {/* Receiving Dock (Back) */}
          <OpenDockOpening
            position={[0, 0, -48]}
            rotation={Math.PI}
            width={18}
            height={14}
            label="RECEIVING"
          />
        </>
      )}

      {/* HDRI Environment for realistic reflections - disable on low */}
      {/* Uses local HDRI to avoid network dependency on GitHub CDN */}
      {/* CRITICAL: Wrapped in its own Suspense to prevent blocking the entire scene during load */}
      {/* Intensity increased from 0.55 to 0.8 for better metal reflections */}
      {!isLowGraphics && (
        <Suspense fallback={null}>
          <Environment files={warehouseHdrUrl} background={false} environmentIntensity={0.8} />
        </Suspense>
      )}

      {/* Core Game Time System - ALWAYS runs to prevent sky freeze */}
      {/* See docs/sky-time-cycle-investigation.md for why this is unconditional */}
      <CoreGameTimeSystem />

      {/* Environment & Lighting */}
      {!perfDebug?.disableEnvironment && <FactoryEnvironment />}
      {/* Zone Accent Lights - colored lights for each factory zone */}
      {!isLowGraphics && <ZoneAccentLights enabled={!perfDebug?.disableEnvironment} />}

      {/* Camera bounds tracker for inside/outside detection */}
      <CameraBoundsTracker />

      {/* Main Systems - Respect perfDebug toggles for A/B testing */}
      {/* PERFORMANCE: Interior systems only render when camera is inside factory or in dock zone */}
      {showInterior && !perfDebug?.disableMachines && (
        <MachinesContainer initialMachines={displayMachines} onSelect={onSelectMachine} />
      )}
      {showInterior && !isLowGraphics && !perfDebug?.disableMachines && (
        <SpoutingSystem machines={displayMachines} />
      )}
      {/* Production Flow Visualization - animated lines between machines (medium+ only) */}
      {showInterior && !isLowGraphics && <ProductionFlowVisualization />}
      {/* CRITICAL: Wrapped in Suspense to prevent MeshReflectorMaterial from breaking scene on quality change */}
      <Suspense fallback={null}>
        <FactoryInfrastructure
          floorSize={FLOOR_SIZE}
          floorWidth={FLOOR_SIZE_X}
          floorDepth={FLOOR_SIZE_Z}
          showZones={showZones}
        />
      </Suspense>

      {/* Dynamic Elements - Respect perfDebug toggles */}
      {/* PERFORMANCE: Interior systems only render when camera is inside factory or in dock zone */}
      {showInterior && !perfDebug?.disableConveyorSystem && (
        <ConveyorSystem productionSpeed={productionSpeed} />
      )}
      {showInterior && !perfDebug?.disableWorkerSystem && (
        <WorkerSystem onSelectWorker={onSelectWorker} />
      )}
      {/* Worker Personality Visualization - mood auras, thoughts, relationships */}
      {showInterior && (graphicsQuality === 'high' || graphicsQuality === 'ultra') && (
        <WorkerPersonalityLayer showAuras={true} showThoughts={true} showRelationships={false} />
      )}
      {/* Remote multiplayer players */}
      <RemotePlayersGroup />
      {showInterior && !perfDebug?.disableForkliftSystem && (
        <ForkliftSystem showSpeedZones={showZones} onSelectForklift={onSelectForklift} />
      )}
      {/* PERFORMANCE: TruckBay renders when camera is outside OR in dock zone (to see trucks through openings) */}
      {showExterior &&
        (graphicsQuality === 'medium' ||
          graphicsQuality === 'high' ||
          graphicsQuality === 'ultra') &&
        !perfDebug?.disableTruckBay && (
          <Suspense fallback={null}>
            <TruckBay productionSpeed={productionSpeed} />
          </Suspense>
        )}

      {/* Factory exterior walls and signage - renders when camera is outside or in dock zone */}
      {showExterior && <FactoryExterior />}
      {showExterior && <FarmArea />}
      {showExterior && <VillageArea />}

      {/* Theme Hospital-inspired Mood & Chaos Systems */}
      {/* PERFORMANCE: Interior-only, scaled by quality level */}
      {showInterior && (
        <VisibleChaos
          qualityScale={
            graphicsQuality === 'ultra'
              ? 1.0
              : graphicsQuality === 'high'
                ? 0.75
                : graphicsQuality === 'medium'
                  ? 0.5
                  : 0.25
          }
        />
      )}
      {showInterior && graphicsQuality === 'ultra' && <FactoryEnvironmentSystem />}
      {showInterior && graphicsQuality === 'ultra' && <MaintenanceSystem />}

      {/* Incident Heat Map Visualization */}
      <IncidentHeatMap />

      {/* Fire Drill Exit Markers - shown during active drill */}
      <FireDrillExitMarkers />

      {/* AI Cascade Visualization - shows production flow stress (default OFF, toggle with 'K') */}
      {showCascadeVisualization && <CascadeVisualization />}

      {/* Strategic Overlay 3D - floating priority text above factory (default OFF, toggle with 'J') */}
      <StrategicOverlay3D />

      {/* Blueprint Mode - architectural overlay (toggle with Ctrl+B) */}
      <BlueprintMode />

      {/* Post-processing effects - Bloom, Vignette, SSAO, DoF (controlled by graphics settings) */}
      <PostProcessing />

      {/* Physics Simulation Controller - Isolated from render tree */}
      <MachineSimulationController />

      {/* Atmospheric Effects - heavily reduced for performance */}
      {/* PERFORMANCE: Interior-only particle effects */}
      {showInterior && graphicsQuality !== 'low' && (
        <DustAnimationManager>
          <DustParticles
            count={graphicsQuality === 'ultra' ? 150 : graphicsQuality === 'high' ? 80 : 30}
          />
          {(graphicsQuality === 'high' || graphicsQuality === 'ultra') && <GrainFlow />}
          {(graphicsQuality === 'high' || graphicsQuality === 'ultra') && <MachineSteamVents />}
        </DustAnimationManager>
      )}

      {/* Holographic Displays - interior only, high/ultra */}
      {showInterior && (graphicsQuality === 'high' || graphicsQuality === 'ultra') && (
        <HolographicDisplays />
      )}

      {/* Ambient Details - interior only, ultra */}
      {showInterior && graphicsQuality === 'ultra' && (
        <Suspense fallback={null}>
          <AmbientDetailsGroup />
        </Suspense>
      )}
    </group>
  );
};
