import { createConveyorObstacles, DOCK_PLATFORM_OBSTACLES } from '../constants/factoryObstacles';
import React, { useMemo, useEffect, useRef, Suspense, useCallback, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';
import * as THREE from 'three';

// Import static assets so Vite handles base path correctly
import warehouseHdrUrl from '/hdri/warehouse.hdr?url';
import { CompactMachinesContainer as MachinesContainer } from './machines/CompactMachines';
import { MachineSimulationController } from './machines/MachineSimulationController';
import { DustParticles, GrainFlow, MachineSteamVents, DustAnimationManager } from './DustParticles';
import { OptimizedFactoryInfrastructure } from './infrastructure/OptimizedFactoryInfrastructure';
import type { ForkliftData } from './ForkliftSystem';
import { OptimizedFactoryEnvironment } from './environment/OptimizedFactoryEnvironment';
import { getTerrainGridSegments } from './terrain/terrainTypes';
import { ENVIRONMENT_INTENSITY } from './environment/SceneEnvironmentIBL';
import { CentralTickProvider, useUnifiedGameTick } from '../systems';
import { ProductionFlowVisualization } from './ProductionFlowVisualization';
import { useAIConfigStore } from '../stores/aiConfigStore';
import { recoverableLazy } from '../utils/recoverableLazy';
import ErrorBoundary from './ErrorBoundary';
import { StaticMeshBatch } from './performance/StaticMeshBatch';
import { PunctualLightIsolation } from './performance/PunctualLightIsolation';
import { SurfaceTreatmentIsolation } from './performance/SurfaceTreatmentIsolation';
import { applyBatchWorldSurface } from '../utils/worldSurface';
import {
  DISTANT_FACTORY_INTERIOR_LOD,
  resolveFactoryInteriorDetailVisibility,
} from './performance/distantFactoryInteriorLod';

// Lazy load heavy optional layers while preserving the complete authored world.
// Quality changes may reduce effects and geometry density, but never swap the
// user into a different factory or remove the surrounding site.
const TruckBay = recoverableLazy(() =>
  import('./TruckBay').then((module) => ({ default: module.TruckBay }))
);
const AuthoredFactoryExterior = recoverableLazy(() =>
  import('./FactoryExterior').then((module) => ({ default: module.FactoryExterior }))
);
const AuthoredCastle = recoverableLazy(() =>
  import('./scenery/FairytaleCastle').then((module) => ({ default: module.FairytaleCastle }))
);
const AuthoredFarm = recoverableLazy(() =>
  import('./FarmArea').then((module) => ({ default: module.FarmArea }))
);
const AuthoredVillage = recoverableLazy(() =>
  import('./VillageArea').then((module) => ({ default: module.VillageArea }))
);
const AuthoredTerrain = recoverableLazy(() =>
  import('./terrain').then((module) => ({ default: module.TerrainGround }))
);
const AuthoredDockOpening = recoverableLazy(() =>
  import('./infrastructure/OpenDockOpening').then((module) => ({
    default: module.OpenDockOpening,
  }))
);
const OperationalConveyors = recoverableLazy(() =>
  import('./ConveyorSystem').then((module) => ({ default: module.ConveyorSystem }))
);
const OperationalForklifts = recoverableLazy(() =>
  import('./ForkliftSystem').then((module) => ({ default: module.ForkliftSystem }))
);
const EnhancedHolographicDisplays = recoverableLazy(() =>
  import('./HolographicDisplays').then((module) => ({
    default: module.HolographicDisplays,
  }))
);
const OptionalCascadeVisualization = recoverableLazy(() =>
  import('./CascadeVisualization').then((module) => ({
    default: module.CascadeVisualization,
  }))
);
const OptionalStrategicOverlay = recoverableLazy(() =>
  import('./StrategicOverlay3D').then((module) => ({ default: module.StrategicOverlay3D }))
);
const OptionalBlueprintMode = recoverableLazy(() =>
  import('./blueprint').then((module) => ({ default: module.BlueprintMode }))
);
const HighDetailSpoutingSystem = recoverableLazy(() =>
  import('./SpoutingSystem').then((module) => ({ default: module.SpoutingSystem }))
);
const PostProcessing = recoverableLazy(() =>
  import('./PostProcessing').then((module) => ({ default: module.PostProcessing }))
);
const OperationalWorldSignals = recoverableLazy(() =>
  import('./OperationalWorldSignals').then((module) => ({
    default: module.OperationalWorldSignals,
  }))
);

/**
 * Keep the unified factory mounted while omitting sub-pixel service detail
 * behind the distant shell and glazing. Machine bodies remain visible through
 * the windows. The hysteresis avoids visibility chatter near the boundary, and
 * the named contract groups remain visible so this is a conventional detail
 * LOD rather than an alternate world.
 */
const DistantFactoryInteriorDetail: React.FC<React.PropsWithChildren> = ({ children }) => {
  const groupRef = useRef<THREE.Group>(null);
  const visibleRef = useRef(true);
  const sampleFrameRef = useRef(0);

  useFrame(({ camera }) => {
    sampleFrameRef.current =
      (sampleFrameRef.current + 1) % DISTANT_FACTORY_INTERIOR_LOD.sampleEveryFrames;
    if (sampleFrameRef.current !== 0) return;

    const nextVisible = resolveFactoryInteriorDetailVisibility(
      visibleRef.current,
      camera.position.x,
      camera.position.z
    );
    if (nextVisible === visibleRef.current) return;

    visibleRef.current = nextVisible;
    if (groupRef.current) groupRef.current.visible = nextVisible;
  });

  return <group ref={groupRef}>{children}</group>;
};
import { MachineData, MachineType } from '../types';
import { useGraphicsStore, isPostProcessingActive } from '../stores/graphicsStore';
import { useProductionStore } from '../stores/productionStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore, SERVICE_EGRESS_POINTS } from '../stores/gameSimulationStore';
import { useCameraPositionStore } from '../stores/useCameraPositionStore';
import { positionRegistry, Obstacle } from '../utils/positionRegistry';
import { useShallow } from 'zustand/react/shallow';
import { CameraBoundsTracker } from './CameraController';
import { FLOOR_LAYERS, RENDER_ORDER, POLYGON_OFFSET } from '../constants/renderLayers';
import { SITE_LAYOUT } from '../constants/siteLayout';
import { useReducedMotion } from '../hooks/useReducedMotion';

/**
 * Authored `wireframe` values of the materials the toggle has overridden, so
 * turning it off restores deliberate wireframe grilles instead of making them
 * solid. Weak keys: a disposed material is never pinned here.
 */
const ORIGINAL_WIREFRAME = new WeakMap<THREE.Material, boolean>();

/**
 * WireframeController - Applies wireframe mode to all scene materials when enabled
 * Reads enableWireframe from graphics store and traverses scene to toggle wireframe
 * OPTIMIZED: Only traverses scene when enableWireframe changes, not every frame
 */
const WireframeController: React.FC = () => {
  const enableWireframe = useGraphicsStore((state) => state.graphics.enableWireframe);
  const sceneRef = useRef<THREE.Scene | null>(null);
  // Starts false: with the setting off at load there is nothing to restore, so
  // the first frame skips a whole-scene traversal. A persisted `true` still
  // traverses once.
  const lastWireframeState = useRef<boolean>(false);

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
            if (enableWireframe) {
              if (!ORIGINAL_WIREFRAME.has(mat)) ORIGINAL_WIREFRAME.set(mat, mat.wireframe);
              mat.wireframe = true;
            } else {
              const original = ORIGINAL_WIREFRAME.get(mat);
              if (original === undefined) return;
              mat.wireframe = original;
              ORIGINAL_WIREFRAME.delete(mat);
            }
            // three's program key reads `wireframe` only through flat shading;
            // every other material picks the change up without a recompile.
            if (mat instanceof THREE.MeshStandardMaterial && mat.flatShading) {
              mat.needsUpdate = true;
            }
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
      circle: React.RefObject<THREE.MeshBasicMaterial | null>;
      ring: React.RefObject<THREE.MeshBasicMaterial | null>;
      column: React.RefObject<THREE.MeshBasicMaterial | null>;
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

  // Register the ref OBJECTS with the parent manager, not their current
  // values: the column mounts only once intensity passes 0.5, long after this
  // effect has run, and a captured `null` would leave it static for good.
  useEffect(() => {
    registerAnimation(id, {
      circle: circleMaterialRef,
      ring: ringMaterialRef,
      column: columnMaterialRef,
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
  const reducedMotion = useReducedMotion();

  // Registry for animated materials
  interface AnimatedMaterialRefs {
    circle: React.RefObject<THREE.MeshBasicMaterial | null>;
    ring: React.RefObject<THREE.MeshBasicMaterial | null>;
    column: React.RefObject<THREE.MeshBasicMaterial | null>;
    intensityRef: React.MutableRefObject<number>;
  }

  const animatedRefs = useRef<Map<string, AnimatedMaterialRefs>>(new Map());

  const registerAnimation = useCallback((id: string, refs: AnimatedMaterialRefs) => {
    animatedRefs.current.set(id, refs);
  }, []);

  const unregisterAnimation = useCallback((id: string) => {
    animatedRefs.current.delete(id);
  }, []);

  // Single centralized animation loop
  useFrame((state) => {
    if (!showIncidentHeatMap || animatedRefs.current.size === 0) return;

    // Runs every frame for a smooth pulse. Under reduced motion every hotspot
    // holds its authored resting opacity (pulse 1); colour and size still
    // convey severity.
    const pulse = reducedMotion ? 1 : Math.sin(state.clock.elapsedTime * 2) * 0.3 + 0.7;

    animatedRefs.current.forEach((refs) => {
      // Use the ref value for intensity
      const circle = refs.circle.current;
      const ring = refs.ring.current;
      const column = refs.column.current;
      if (circle) circle.opacity = 0.3 * pulse * refs.intensityRef.current;
      if (ring) ring.opacity = 0.6 * pulse;
      if (column) column.opacity = 0.2 * pulse;
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

const EGRESS_PENDING_COLOR = '#f59e0b';
const EGRESS_VERIFIED_COLOR = '#22c55e';
const EGRESS_RING_REST = { emissiveIntensity: 1.5, opacity: 0.8 } as const;

// Automated egress verification markers. A pending egress point pulses amber;
// once the sequencer verifies it, the marker turns steady green and its label
// says so, so the world tracks the Safety panel's "X/Y zones verified".
// Memoized since it receives stable props from store selectors
const ServiceEgressMarkers = React.memo(() => {
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const drillMetrics = useGameSimulationStore((state) => state.drillMetrics);
  const reducedMotion = useReducedMotion();
  const materialRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  // A drill may cover fewer zones than there are egress points. Only the zones
  // in the drill are marked and verified, so none is left pending when it ends.
  const drillPoints = useMemo(
    () => SERVICE_EGRESS_POINTS.slice(0, drillMetrics.totalZones),
    [drillMetrics.totalZones]
  );
  const verified = useMemo(
    () => drillPoints.map((exit) => drillMetrics.verifiedZoneIds.includes(exit.id)),
    [drillPoints, drillMetrics.verifiedZoneIds]
  );

  // The verification sequence itself. Nothing else calls markZoneVerified, so
  // without this a started drill could never complete: each egress point is
  // verified in turn, and the drill ends shortly after the last one.
  useEffect(() => {
    if (!emergencyDrillMode || !drillMetrics.active) return;
    const ZONE_INTERVAL_MS = 4000;
    const COMPLETION_HOLD_MS = 5000;
    let completionTimer: number | undefined;
    const store = () => useGameSimulationStore.getState();
    const timer = window.setInterval(() => {
      const current = store();
      if (!current.emergencyDrillMode || !current.drillMetrics.active) return;
      if (current.drillMetrics.verificationComplete) {
        window.clearInterval(timer);
        completionTimer = window.setTimeout(() => {
          const latest = store();
          if (latest.emergencyDrillMode && latest.drillMetrics.verificationComplete) {
            latest.endEmergencyDrill();
          }
        }, COMPLETION_HOLD_MS);
        return;
      }
      const zone = SERVICE_EGRESS_POINTS.slice(0, current.drillMetrics.totalZones).find(
        (point) => !current.drillMetrics.verifiedZoneIds.includes(point.id)
      );
      // Defensive: every drill zone is verified without the drill completing
      // (startEmergencyDrill clamps totalZones, so this should not happen).
      // Stop ticking instead of spinning until END DRILL.
      if (!zone) {
        window.clearInterval(timer);
        return;
      }
      current.markZoneVerified(zone.id);
    }, ZONE_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      if (completionTimer !== undefined) window.clearTimeout(completionTimer);
    };
  }, [emergencyDrillMode, drillMetrics.active]);

  // Pending markers pulse during the automated verification sequence. Verified
  // markers, and every marker under reduced motion, hold their resting glow.
  useFrame((state) => {
    if (!emergencyDrillMode) return;
    const pulse = Math.sin(state.clock.elapsedTime * 4) * 0.3 + 0.7;
    materialRefs.current.forEach((mat, i) => {
      if (!mat) return;
      if (reducedMotion || verified[i]) {
        mat.emissiveIntensity = EGRESS_RING_REST.emissiveIntensity;
        mat.opacity = EGRESS_RING_REST.opacity;
        return;
      }
      mat.emissiveIntensity = pulse * 2;
      mat.opacity = 0.6 + pulse * 0.4;
    });
  });

  // Only show during an active egress test.
  if (!emergencyDrillMode || !drillMetrics.active) return null;

  return (
    <group>
      {drillPoints.map((exit, i) => {
        const color = verified[i] ? EGRESS_VERIFIED_COLOR : EGRESS_PENDING_COLOR;
        return (
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
                color={color}
                emissive={color}
                emissiveIntensity={EGRESS_RING_REST.emissiveIntensity}
                transparent
                opacity={EGRESS_RING_REST.opacity}
                side={THREE.DoubleSide}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
                polygonOffsetUnits={POLYGON_OFFSET.standard.units}
              />
            </mesh>
            {/* Inner solid circle - raised slightly for z-separation */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <circleGeometry args={[2, 32]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
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
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.05}
              outlineColor="#000000"
            >
              {verified[i] ? `${exit.label.toUpperCase()} VERIFIED` : exit.label.toUpperCase()}
            </Text>
            {/* Pointing arrow above */}
            <mesh position={[0, 3.5, 0]} rotation={[0, 0, Math.PI]}>
              <coneGeometry args={[0.5, 1, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
});

interface MillSceneProps {
  productionSpeed: number;
  showZones: boolean;
  onSelectMachine: (data: MachineData) => void;
  onSelectForklift?: (data: ForkliftData) => void;
}

export const MillScene: React.FC<MillSceneProps> = ({
  productionSpeed,
  showZones,
  onSelectForklift,
  onSelectMachine,
}) => {
  const [authoredSiteReady, setAuthoredSiteReady] = useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.sceneReady === 'true'
  );

  // Paint the operational factory first, then mount the complete authored site
  // once. This keeps the village, farms, water, yards, and landmarks continuously
  // present during play without making their initial construction block the first
  // useful frame.
  useEffect(() => {
    if (document.documentElement.dataset.sceneReady === 'true') {
      setAuthoredSiteReady(true);
      return;
    }
    const revealAuthoredSite = (): void => setAuthoredSiteReady(true);
    window.addEventListener('millos:first-frame', revealAuthoredSite, { once: true });
    return () => window.removeEventListener('millos:first-frame', revealAuthoredSite);
  }, []);

  // PERF DEBUG: Track renders
  // trackRender('MillScene');

  const { setMachines } = useProductionStore(
    useShallow((state) => ({
      setMachines: state.setMachines,
      // Removed subscriptions that cause re-renders
    }))
  );

  // CENTRALIZED TICK SYSTEM - Single source of truth for all game ticks
  // Replaces scattered tickGameTime, tickMetrics, and various intervals
  useUnifiedGameTick();

  const machines = useMemo(() => {
    const _machines: MachineData[] = [];

    // ZONE 1: Raw Material Storage (Silos) - Back Row
    const siloNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    SITE_LAYOUT.machines.silos.forEach((anchor, idx) => {
      _machines.push({
        id: anchor.id,
        name: `Silo ${siloNames[idx]}`,
        type: MachineType.SILO,
        position: [...anchor.position],
        size: [...SITE_LAYOUT.machineDimensions.silo],
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
    });

    // ZONE 2: Milling Floor (Roller Mills)
    // Names use "R.M." format for proper TTS pronunciation in PA announcements
    // Exactly 4 roller mills are placed (the loop below skips the centre x=0 for the
    // central spine conveyor), so the name/id arrays are 4 long. (Were 6; rm-105/106
    // were never built.)
    const millNames = ['R.M. 101', 'R.M. 102', 'R.M. 103', 'R.M. 104'];
    SITE_LAYOUT.machines.rollerMills.forEach((anchor, idx) => {
      _machines.push({
        id: anchor.id,
        name: millNames[idx],
        type: MachineType.ROLLER_MILL,
        position: [...anchor.position],
        size: [...SITE_LAYOUT.machineDimensions.rollerMill],
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
    });

    // ZONE 3: Sifting (Plansifters) - Elevated
    const sifterNames = ['Sifter A', 'Sifter B', 'Sifter C'];
    SITE_LAYOUT.machines.sifters.forEach((anchor, idx) => {
      _machines.push({
        id: anchor.id,
        name: sifterNames[idx],
        type: MachineType.PLANSIFTER,
        position: [...anchor.position],
        size: [...SITE_LAYOUT.machineDimensions.sifter],
        rotation: 0,
        status: 'running',
        metrics: {
          rpm: 200 + idx * 6, // Deterministic: 200-212
          temperature: 28 + idx * 1.3, // Deterministic: 28-30.6°C
          // Deterministic: 1.2-1.4 mm/s, near MachineSimulationController's
          // running steady state and SCADA's mapped amplitude band. A 5.5+ seed
          // tipped every sifter into 'warning' on its first simulation tick.
          vibration: 1.2 + idx * 0.1,
          load: 75 + idx * 3, // Deterministic: 75-81%
          wear: 0, // Start with no wear
          efficiency: 100, // Start at full efficiency
        },
        lastMaintenance: '2024-01-20',
        nextMaintenance: '2024-04-20',
      });
    });

    // ZONE 4: Packaging (Packers)
    const packerNames = ['Pack Line 1', 'Pack Line 2', 'Pack Line 3'];
    SITE_LAYOUT.machines.packers.forEach((anchor, idx) => {
      _machines.push({
        id: anchor.id,
        name: packerNames[idx],
        type: MachineType.PACKER,
        position: [...anchor.position],
        size: [...SITE_LAYOUT.machineDimensions.packer],
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
    });

    return _machines;
  }, []);

  // Define obstacle regions for autonomous mobile-equipment pathfinding
  const obstacles = useMemo<Obstacle[]>(() => {
    const obs: Obstacle[] = [];
    const CLEARANCE_PADDING = 1.0;

    SITE_LAYOUT.machines.silos.forEach((anchor) => {
      const [x, , z] = anchor.position;
      obs.push({
        id: `${anchor.id}-obstacle`,
        minX: x - SITE_LAYOUT.machineDimensions.silo[0] / 2 - CLEARANCE_PADDING,
        maxX: x + SITE_LAYOUT.machineDimensions.silo[0] / 2 + CLEARANCE_PADDING,
        minZ: z - SITE_LAYOUT.machineDimensions.silo[2] / 2 - CLEARANCE_PADDING,
        maxZ: z + SITE_LAYOUT.machineDimensions.silo[2] / 2 + CLEARANCE_PADDING,
      });
    });

    SITE_LAYOUT.machines.rollerMills.forEach((anchor) => {
      const [x, , z] = anchor.position;
      obs.push({
        id: `${anchor.id}-obstacle`,
        minX: x - SITE_LAYOUT.machineDimensions.rollerMill[0] / 2 - CLEARANCE_PADDING,
        maxX: x + SITE_LAYOUT.machineDimensions.rollerMill[0] / 2 + CLEARANCE_PADDING,
        minZ: z - SITE_LAYOUT.machineDimensions.rollerMill[2] / 2 - CLEARANCE_PADDING,
        maxZ: z + SITE_LAYOUT.machineDimensions.rollerMill[2] / 2 + CLEARANCE_PADDING,
      });
    });

    // PLANSIFTERS, elevated at the shared mezzanine datum, have hanging cables
    // Mobile units can pass beneath these, but the cable anchors remain obstacles.
    SITE_LAYOUT.machines.sifters.forEach((anchor) => {
      const [x, , z] = anchor.position;
      // Just mark small cable anchor points at corners (not full machine footprint)
      const cablePositions = [
        [-3.2, -3.2],
        [-3.2, 3.2],
        [3.2, -3.2],
        [3.2, 3.2],
      ];
      cablePositions.forEach(([dx, dz], idx) => {
        obs.push({
          id: `${anchor.id}-cable-${idx}`,
          minX: x + dx - 0.3,
          maxX: x + dx + 0.3,
          minZ: z + dz - 0.3,
          maxZ: z + dz + 0.3,
        });
      });
    });

    SITE_LAYOUT.machines.packers.forEach((anchor) => {
      const [x, , z] = anchor.position;
      obs.push({
        id: `${anchor.id}-obstacle`,
        minX: x - 2 - CLEARANCE_PADDING,
        maxX: x + 2 + CLEARANCE_PADDING,
        minZ: z - 2 - CLEARANCE_PADDING,
        maxZ: z + 2 + CLEARANCE_PADDING,
      });
    });

    obs.push(...createConveyorObstacles());

    obs.push(...DOCK_PLATFORM_OBSTACLES);

    return obs;
  }, []);

  // Register obstacles with position registry on mount
  useEffect(() => {
    positionRegistry.registerObstacles(obstacles);
  }, [obstacles]);

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
  const { graphicsQuality, perfDebug, postProcessingEnabled, enableAnisotropicReflections } =
    useGraphicsStore(
      useShallow((state) => ({
        graphicsQuality: state.graphics.quality,
        perfDebug: state.graphics.perfDebug,
        enableAnisotropicReflections: state.graphics.enableAnisotropicReflections,
        // Shared with PostProcessing.tsx's own mount check. These two must
        // agree exactly: if this says mount and the component returns null,
        // the composer never forces NoToneMapping and the grade silently
        // does not apply. A tier that only tone maps and grades still counts.
        postProcessingEnabled: isPostProcessingActive(state.graphics),
      }))
    );
  const useUltraQualityLayers = graphicsQuality === 'ultra';
  const isLowGraphics = graphicsQuality === 'low';
  // Static batching must not rebuild at the live day/night boundary. Every
  // time-reactive mesh opts out locally, so the large authored batches can
  // remain stable while windows, lamps, and clocks update in place.
  const staticBatchRevision = graphicsQuality;
  const terrainResolution =
    graphicsQuality === 'ultra' || graphicsQuality === 'high'
      ? 1024
      : graphicsQuality === 'medium'
        ? 512
        : 256;
  const terrainSegments = getTerrainGridSegments(graphicsQuality);
  const { isCameraInside, isCameraInDockZone } = useCameraPositionStore(
    useShallow((state) => ({
      isCameraInside: state.isCameraInside,
      isCameraInDockZone: state.isCameraInDockZone,
    }))
  );

  // AI Visualization toggles (all default OFF)
  const showCascadeVisualization = useAIConfigStore((state) => state.showCascadeVisualization);

  return (
    <group name="world-root">
      {/* Wireframe mode controller - responds to enableWireframe toggle */}
      <WireframeController />

      {/* Internal dock openings remain mounted with the exterior site so the
          factory reads as one continuous navigable world. */}
      {authoredSiteReady && !isLowGraphics && (
        <StaticMeshBatch
          name="authored-dock-openings"
          revision={staticBatchRevision}
          surface={applyBatchWorldSurface}
        >
          <>
            <AuthoredDockOpening
              position={[0, 0, 48]}
              rotation={0}
              width={30}
              height={14}
              label="SHIPPING"
              dock="shipping"
            />
            <AuthoredDockOpening
              position={[0, 0, -48]}
              rotation={Math.PI}
              width={18}
              height={14}
              label="RECEIVING"
              dock="receiving"
            />
          </>
        </StaticMeshBatch>
      )}

      {/* The local HDRI is an explicit cinematic reflection option. Keeping it
          behind the reflection toggle avoids a multi-second PMREM compile and
          whole-site shading cost in the ordinary Ultra preset. */}
      {useUltraQualityLayers && enableAnisotropicReflections && (
        <ErrorBoundary fallback={null} resetKeys={[graphicsQuality]}>
          <Suspense fallback={null}>
            {/* Shares the default rig's weight rather than carrying its own
                0.28. The two paths write the same `scene.environmentIntensity`
                and swapping between them should change WHAT is reflected, not
                how much of the scene's fill comes from reflection. */}
            <Environment
              files={warehouseHdrUrl}
              background={false}
              environmentIntensity={ENVIRONMENT_INTENSITY}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* CENTRALIZED TICK SYSTEM - Replaces CoreGameTimeSystem */}
      {/* Single source of truth for game time, machine metrics, and all periodic updates */}
      {/* See src/systems/CentralTickSystem.ts for architecture */}
      <CentralTickProvider />
      {/* OLD: <CoreGameTimeSystem /> - disabled, replaced by CentralTickProvider */}

      {/* Environment & Lighting */}
      <group name="world-environment">
        {!perfDebug?.disableEnvironment && <OptimizedFactoryEnvironment />}
      </group>
      {/* A/B instrument, inert unless the perfDebug flag is set. Mounted
          unconditionally so the toggle can be flipped at runtime in one page
          load rather than across two builds. */}
      <PunctualLightIsolation />
      <SurfaceTreatmentIsolation />

      {/* Camera bounds remain useful to controls and UI, but never gate scene existence. */}
      <CameraBoundsTracker />

      {/* Main Systems - Respect perfDebug toggles for A/B testing */}
      <group name="world-factory-process">
        {!perfDebug?.disableMachines && (
          <MachinesContainer initialMachines={displayMachines} onSelect={onSelectMachine} />
        )}
        <DistantFactoryInteriorDetail>
          {!isLowGraphics && !perfDebug?.disableMachines && (
            <ErrorBoundary fallback={null} resetKeys={[graphicsQuality]}>
              <Suspense fallback={null}>
                <HighDetailSpoutingSystem machines={displayMachines} />
              </Suspense>
            </ErrorBoundary>
          )}
          {!isLowGraphics && <ProductionFlowVisualization />}
        </DistantFactoryInteriorDetail>
      </group>
      <group name="world-factory-infrastructure">
        <OptimizedFactoryInfrastructure showZones={showZones} />
      </group>

      {/* Dynamic Elements - Respect perfDebug toggles */}
      <group name="world-conveyors">
        <DistantFactoryInteriorDetail>
          {authoredSiteReady && !perfDebug?.disableConveyorSystem && (
            <OperationalConveyors productionSpeed={productionSpeed} />
          )}
        </DistantFactoryInteriorDetail>
      </group>
      <group name="world-forklifts">
        {authoredSiteReady && !perfDebug?.disableForkliftSystem && (
          <OperationalForklifts showSpeedZones={showZones} onSelectForklift={onSelectForklift} />
        )}
      </group>
      {/* The authored truck bay includes the garage, service yard, docks, and trucks. */}
      <group name="world-logistics">
        {authoredSiteReady && !isLowGraphics && !perfDebug?.disableTruckBay && (
          <StaticMeshBatch
            name="authored-truck-yard"
            revision={staticBatchRevision}
            surface={applyBatchWorldSurface}
          >
            <ErrorBoundary fallback={null} resetKeys={[graphicsQuality]}>
              <Suspense fallback={null}>
                <TruckBay productionSpeed={productionSpeed} />
              </Suspense>
            </ErrorBoundary>
          </StaticMeshBatch>
        )}
      </group>

      {/* The complete authored exterior remains present from every camera position. */}
      <group name="world-terrain">
        {authoredSiteReady && !perfDebug?.disableTerrain && (
          <AuthoredTerrain
            debug={false}
            resolution={terrainResolution}
            segments={terrainSegments}
            enableRiverChannel
          />
        )}
      </group>
      {authoredSiteReady && (
        <>
          <StaticMeshBatch
            name="authored-factory-exterior"
            revision={staticBatchRevision}
            surface={applyBatchWorldSurface}
          >
            <AuthoredFactoryExterior showFactoryShell={false} />
          </StaticMeshBatch>
          <StaticMeshBatch
            name="authored-castle"
            revision={staticBatchRevision}
            surface={applyBatchWorldSurface}
          >
            <AuthoredCastle
              position={SITE_LAYOUT.landmarks.castle.position}
              scale={SITE_LAYOUT.landmarks.castle.scale}
              rotation={SITE_LAYOUT.landmarks.castle.rotation}
            />
          </StaticMeshBatch>
          <StaticMeshBatch
            name="authored-farm"
            revision={staticBatchRevision}
            surface={applyBatchWorldSurface}
          >
            <AuthoredFarm />
          </StaticMeshBatch>
          <StaticMeshBatch
            name="authored-village"
            revision={staticBatchRevision}
            surface={applyBatchWorldSurface}
          >
            <AuthoredVillage />
          </StaticMeshBatch>
        </>
      )}

      {/* Incident Heat Map Visualization */}
      <IncidentHeatMap />

      {/* Operational campaign incidents become legible in the same authored
          site. The marker layer adds no lights or shadows and keeps one shared
          animation loop for all active incidents. */}
      {authoredSiteReady && (
        <ErrorBoundary fallback={null} resetKeys={[graphicsQuality]}>
          <Suspense fallback={null}>
            <OperationalWorldSignals />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Fire Drill Exit Markers - shown during active drill */}
      <ServiceEgressMarkers />

      {/* AI Cascade Visualization - shows production flow stress (default OFF, toggle with 'K') */}
      {authoredSiteReady && showCascadeVisualization && <OptionalCascadeVisualization />}

      {/* Strategic Overlay 3D - floating priority text above factory (default OFF, toggle with 'J') */}
      {authoredSiteReady && <OptionalStrategicOverlay />}

      {/* Blueprint Mode - architectural overlay (toggle with Ctrl+B) */}
      {authoredSiteReady && <OptionalBlueprintMode />}

      {/* The composer now mounts on medium and above, so this subtree survives
          tier changes rather than being absent at every tier. `graphicsQuality`
          stays in `resetKeys` deliberately: ErrorBoundary only acts on it when
          `state.hasError` is already true, and it puts no key on its children,
          so a tier change cannot remount the N8AO pass on the healthy path. In
          the error path PostProcessing is unmounted anyway, which makes a
          quality change a legitimate recovery trigger. */}
      {postProcessingEnabled && (
        <ErrorBoundary fallback={null} resetKeys={[postProcessingEnabled, graphicsQuality]}>
          <Suspense fallback={null}>
            <PostProcessing />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* Physics Simulation Controller - Isolated from render tree */}
      <MachineSimulationController />

      {/* Atmospheric Effects - heavily reduced for performance */}
      {graphicsQuality !== 'low' && (
        <DustAnimationManager>
          {/* This prop is the POOL SIZE, and `DustParticles` activates
              `Math.min(count, graphics.dustParticleCount)` of it. Medium's
              store value is 30, so raising 30 here alone buys nothing and
              leaves the extra instances allocated and permanently hidden -
              move `GRAPHICS_PRESETS.medium.dustParticleCount` with it or not
              at all. High and ultra are the other way round: the store's 180
              and 500 leave these numbers as the binding cap. */}
          <DustParticles
            count={graphicsQuality === 'ultra' ? 150 : graphicsQuality === 'high' ? 80 : 30}
          />
          {/* Both now mount wherever this block does, i.e. above 'low'. They
              were gated to high/ultra a second time inside a branch that has
              already excluded 'low', which left medium with pipes carrying no
              grain and machines venting nothing. Each component does its own
              tier scaling from here: GrainFlow is one `<points>` draw of 200
              particles and defers to `graphics.enableGrainFlow`, and
              MachineSteamVents already halves its source list on medium and
              culls at 40 units, so medium mounts 6 vents rather than 11. */}
          <GrainFlow />
          <MachineSteamVents />
        </DustAnimationManager>
      )}

      {authoredSiteReady && useUltraQualityLayers && (isCameraInside || isCameraInDockZone) && (
        <EnhancedHolographicDisplays />
      )}

      {/* Legacy environment, maintenance and ambient-detail worlds stay
          quarantined. Mounting them here duplicated the authored site and
          collapsed Ultra frame pacing. Ultra enriches the same world through
          HDRI, holograms, texture filtering and longer LOD distances instead. */}
    </group>
  );
};
