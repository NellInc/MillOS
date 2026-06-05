import React, { useRef, useState, useEffect, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import { MachineData, MachineType } from '../types';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';
import { audioManager } from '../utils/audioManager';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';
import { getStatusColor } from '../utils/statusColors';
import { useSCADAMachineVisuals, useSCADAAlarmVisuals } from '../scada';
import { useModelAvailable } from '../utils/modelLoader';
import { MACHINE_MATERIALS, METAL_MATERIALS } from '../utils/sharedMaterials';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useProductionStore } from '../stores/productionStore';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { BreakdownEffects } from './breakdown/BreakdownEffects';

// Import machine subcomponents
import { GRAIN_TYPES, INDICES_5, INDICES_6, INDICES_8 } from './machines/shared';
import { SiloFillIndicator, MaintenanceCountdown } from './machines/SiloComponents';
import {
  useProceduralMetalTexture,
  WeatheringLayer,
  WeldSeams,
} from './machines/TexturesAndMaterials';
import {
  HeatShimmer,
  SteamVent,
  Sparks,
  RotatingFan,
  AnisotropicRoller,
} from './machines/VisualEffects';
import {
  ControlPanel,
  AnimatedGauge,
  AlarmIndicator,
  SCADAValueOverlay,
} from './machines/UIComponents';
import { GLTFSiloBase, IndustrialCable } from './machines/UtilityComponents';
import { MachineAnimationManager } from './machines/MachineAnimationManager';
import { InstancedSilos } from './machines/InstancedSilos';
import { InstancedRollerMills } from './machines/InstancedRollerMills';
import { InstancedPlansifters } from './machines/InstancedPlansifters';
import { InstancedPackers } from './machines/InstancedPackers';

// Module-level read-only temporary to avoid per-render allocation (CLAUDE.md convention).
// Value identical to the previous inline `new THREE.Vector2(0.3, 0.3)`; never mutated.
const SILO_NORMAL_SCALE = new THREE.Vector2(0.3, 0.3);

interface MachinesProps {
  machines: MachineData[];
  onSelect: (data: MachineData) => void;
}

// Animation state stored per-machine for centralized useFrame
interface MachineAnimationState {
  groupRef: THREE.Group | null;
  position: [number, number, number];
  rotation: number;
  type: MachineType;
  status: 'running' | 'idle' | 'warning' | 'critical';
  scadaRpmMultiplier: number;
  scadaVibrationIntensity: number;
  scadaFillLevel: number | undefined;
  metricsLoad: number;
  enableVibration: boolean;
}

const MachinesComponent: React.FC<MachinesProps> = ({ machines, onSelect }) => {
  // Filter machines for optimization
  // PERF: Single pass filter instead of 5 separate filters
  const { silos, rollerMills, plansifters, packers, otherMachines } = useMemo(() => {
    const result = {
      silos: [] as typeof machines,
      rollerMills: [] as typeof machines,
      plansifters: [] as typeof machines,
      packers: [] as typeof machines,
      otherMachines: [] as typeof machines,
    };
    for (const m of machines) {
      switch (m.type) {
        case MachineType.SILO:
          result.silos.push(m);
          break;
        case MachineType.ROLLER_MILL:
          result.rollerMills.push(m);
          break;
        case MachineType.PLANSIFTER:
          result.plansifters.push(m);
          break;
        case MachineType.PACKER:
          result.packers.push(m);
          break;
        default:
          result.otherMachines.push(m);
      }
    }
    return result;
  }, [machines]);
  // PERFORMANCE: Centralized animation state for all machines
  // This eliminates 17 separate useFrame hooks, reducing per-frame overhead
  const machineStatesRef = useRef<Map<string, MachineAnimationState>>(new Map());
  const frameCountRef = useRef(0);
  const audioRegisteredRef = useRef<Set<string>>(new Set());

  // Get global state for animation control
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const isLowQuality = quality === 'low';

  // Callback for MachineMesh to register its animation state
  const updateMachineState = React.useCallback(
    (id: string, state: MachineAnimationState | null) => {
      if (state === null) {
        machineStatesRef.current.delete(id);
        audioRegisteredRef.current.delete(id);
      } else {
        machineStatesRef.current.set(id, state);
      }
    },
    []
  );

  // CENTRALIZED useFrame - runs once per frame instead of 17 times
  useFrame((state) => {
    if (!isTabVisible) return;

    frameCountRef.current++;

    // On LOW quality, skip all animation - only handle audio registration
    if (isLowQuality) {
      // Only run audio logic every 30 frames (~0.5s at 60fps)
      if (frameCountRef.current % 30 === 0) {
        machineStatesRef.current.forEach((machineState, machineId) => {
          if (machineState.status === 'running') {
            // Register audio position if not already done
            if (!audioRegisteredRef.current.has(machineId)) {
              audioManager.registerSoundPosition(
                machineId,
                machineState.position[0],
                machineState.position[1] + 1, // Approximate center
                machineState.position[2]
              );
              audioRegisteredRef.current.add(machineId);
            }
            audioManager.updateMachineSpatialVolume(machineId);
          }
        });
      }
      // Reset positions once on first frame
      if (frameCountRef.current === 1) {
        machineStatesRef.current.forEach((machineState) => {
          if (machineState.groupRef) {
            machineState.groupRef.position.set(
              machineState.position[0],
              machineState.position[1],
              machineState.position[2]
            );
            machineState.groupRef.rotation.set(0, machineState.rotation, 0);
          }
        });
      }
      return; // Skip all animation on LOW quality
    }

    const time = state.clock.elapsedTime;

    // Iterate through all machines and apply animations
    machineStatesRef.current.forEach((machineState, machineId) => {
      const {
        groupRef,
        position,
        rotation,
        type,
        status,
        scadaRpmMultiplier,
        scadaVibrationIntensity,
        enableVibration,
      } = machineState;

      if (!groupRef) return;

      if (status === 'running' && enableVibration) {
        const rpmFactor = scadaRpmMultiplier;
        const vibIntensity = scadaVibrationIntensity;

        switch (type) {
          case MachineType.PLANSIFTER: {
            // Sifters have strong circular oscillation
            const intensity = (0.04 + rpmFactor * 0.03) * vibIntensity;
            const speed = 12 + rpmFactor * 8;
            groupRef.position.x = position[0] + Math.cos(time * speed) * intensity;
            groupRef.position.z = position[2] + Math.sin(time * speed) * intensity;
            groupRef.rotation.x = Math.sin(time * speed * 0.5) * 0.003 * vibIntensity;
            groupRef.rotation.z = Math.cos(time * speed * 0.5) * 0.003 * vibIntensity;
            break;
          }
          case MachineType.ROLLER_MILL: {
            // Mills have high-frequency vertical vibration
            const intensity = (0.005 + rpmFactor * 0.015) * vibIntensity;
            const speed = 30 + rpmFactor * 30;
            groupRef.position.y = position[1] + Math.sin(time * speed) * intensity;
            groupRef.position.x = position[0] + Math.sin(time * speed * 2.3) * intensity * 0.3;
            break;
          }
          case MachineType.PACKER: {
            // Packers have rhythmic mechanical motion
            const cycleTime = time * 3;
            const cycle = Math.sin(cycleTime) > 0.7 ? 1 : 0;
            groupRef.position.y = position[1] + cycle * 0.02 * vibIntensity;
            groupRef.position.x = position[0] + Math.sin(time * 15) * 0.003 * vibIntensity;
            break;
          }
          // Silo case removed as it's handled in InstancedSilos
        }
      } else if (!enableVibration) {
        // Reset position when vibration is disabled
        groupRef.position.set(position[0], position[1], position[2]);
        groupRef.rotation.set(0, rotation, 0);
      }

      // Register machine position for spatial audio (throttled)
      if (status === 'running' && frameCountRef.current % 10 === 0) {
        audioManager.registerSoundPosition(machineId, position[0], position[1] + 1, position[2]);
        audioManager.updateMachineSpatialVolume(machineId);
      }
    });
  });

  // Get active breakdowns for rendering effects
  const activeBreakdowns = useBreakdownStore((state) => state.activeBreakdowns);

  // Create a map of machine id to position for breakdown effects
  const machinePositionMap = useMemo(() => {
    const map = new Map<string, [number, number, number]>();
    machines.forEach((m) => {
      map.set(m.id, m.position);
    });
    return map;
  }, [machines]);

  return (
    <group>
      <MachineAnimationManager />

      <InstancedSilos machines={silos} onSelect={onSelect} />
      <InstancedRollerMills machines={rollerMills} onSelect={onSelect} />
      <InstancedPlansifters machines={plansifters} onSelect={onSelect} />
      <InstancedPackers machines={packers} onSelect={onSelect} />

      {otherMachines.map((m: MachineData) => (
        <MachineMesh key={m.id} data={m} onSelect={onSelect} onStateUpdate={updateMachineState} />
      ))}

      {/* Breakdown Effects - sparks, smoke, warning beacons for broken machines */}
      {activeBreakdowns.map((breakdown) => {
        const position = machinePositionMap.get(breakdown.machineId);
        if (!position) return null;
        return (
          <BreakdownEffects
            key={breakdown.id}
            machineId={breakdown.machineId}
            position={position}
          />
        );
      })}
    </group>
  );
};

interface MachineMeshProps {
  data: MachineData;
  onSelect: (data: MachineData) => void;
  onStateUpdate: (id: string, state: MachineAnimationState | null) => void;
}

const MachineMesh: React.FC<MachineMeshProps> = React.memo(({ data, onSelect, onStateUpdate }) => {
  const { type, position, rotation, status } = data;
  // Guard against NaN/invalid dimensions - critical for preventing PlaneGeometry NaN errors
  const size: [number, number, number] = [
    Number.isFinite(data.size[0]) && data.size[0] > 0 ? data.size[0] : 3,
    Number.isFinite(data.size[1]) && data.size[1] > 0 ? data.size[1] : 5,
    Number.isFinite(data.size[2]) && data.size[2] > 0 ? data.size[2] : 3,
  ];
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  // PERFORMANCE: Consolidated graphics store subscriptions to prevent unnecessary re-renders
  const {
    enableVibration,
    enableTextures,
    enableWeathering,
    enableControlPanels,
    enableAnisotropicReflections,
    quality,
  } = useGraphicsStore(
    useShallow((state) => ({
      enableVibration: state.graphics.enableMachineVibration,
      enableTextures: state.graphics.enableProceduralTextures,
      enableWeathering: state.graphics.enableWeathering,
      enableControlPanels: state.graphics.enableControlPanels,
      enableAnisotropicReflections: state.graphics.enableAnisotropicReflections,
      quality: state.graphics.quality,
    }))
  );
  // PERFORMANCE: Skip animated sub-components on LOW quality
  const isLowQuality = quality === 'low';

  // Check GLTF model availability
  const siloModelAvailable = useModelAvailable('silo');
  // Use GLTF models on medium+ graphics when available
  const useGLTFModels = quality !== 'low';

  // SCADA visual properties
  const scadaVisuals = useSCADAMachineVisuals(data.id, status);
  const scadaAlarms = useSCADAAlarmVisuals(data.id);

  // Use SCADA-derived status color, falling back to standard status color
  const statusColor = scadaVisuals.hasActiveAlarm
    ? scadaVisuals.statusColor
    : getStatusColor(status);

  // Generate unique seed for this machine's textures
  const textureSeed = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < data.id.length; i++) {
      hash = (hash << 5) - hash + data.id.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }, [data.id]);

  const { roughnessMap, normalMap } = useProceduralMetalTexture(enableTextures, textureSeed);

  // Shared geometries for repeated elements - created once and reused across maps
  const motorFinGeometry = useMemo(() => new THREE.CylinderGeometry(0.52, 0.52, 0.02, 16), []);
  const conveyorRollerGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.04, 0.04, size[0] * 0.12, 12),
    [size]
  );
  const legCylinderGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.2, 4), []);

  // Dispose useMemo'd geometries on unmount/replacement so their GPU buffers are released.
  // These are attached via the `geometry={...}` prop, so R3F does not own or auto-dispose them.
  useEffect(
    () => () => {
      motorFinGeometry.dispose();
      legCylinderGeometry.dispose();
    },
    [motorFinGeometry, legCylinderGeometry]
  );
  useEffect(() => () => conveyorRollerGeometry.dispose(), [conveyorRollerGeometry]);

  // Machine-specific sounds based on type and status
  // Machine-specific sounds - Optimized to avoid thrashing
  const soundRef = useRef<string | null>(null);

  // Update sound parameters without stopping/starting
  useEffect(() => {
    if (status !== 'running') {
      if (soundRef.current) {
        audioManager.stopMachineSound(data.id);
        soundRef.current = null;
      }
      return;
    }

    // Start sound if not playing
    if (!soundRef.current) {
      soundRef.current = data.id;
      switch (type) {
        case MachineType.ROLLER_MILL:
          audioManager.playMillSound(data.id, data.metrics.rpm);
          break;
        case MachineType.PLANSIFTER:
          audioManager.playSifterSound(data.id, data.metrics.rpm);
          break;
        case MachineType.PACKER:
          audioManager.playPackerSound(data.id);
          break;
      }
    } else {
      // RPM updates handled by the dedicated effect below to avoid restarting the sound.
    }

    return () => {
      if (soundRef.current) {
        audioManager.stopMachineSound(data.id);
        soundRef.current = null;
      }
    };
  }, [data.id, type, status]); // REMOVED data.metrics.rpm dependency

  // Separate effect for RPM updates to avoid restarting sound
  useEffect(() => {
    if (
      status === 'running' &&
      (type === MachineType.ROLLER_MILL || type === MachineType.PLANSIFTER)
    ) {
      // Update pitch/rhythm based on RPM without restarting the sound
      const rpm = data.metrics.rpm ?? (type === MachineType.ROLLER_MILL ? 1400 : 200);
      audioManager.updateMachinePitch(data.id, rpm);
    }
  }, [data.id, status, type, data.metrics.rpm]);

  // PERFORMANCE: Register animation state with parent for centralized useFrame
  // This eliminates per-machine useFrame overhead - parent iterates once per frame
  useEffect(() => {
    // Register state with parent on mount and when relevant values change
    onStateUpdate(data.id, {
      groupRef: groupRef.current,
      position,
      rotation,
      type,
      status,
      scadaRpmMultiplier: scadaVisuals.rpmMultiplier,
      scadaVibrationIntensity: scadaVisuals.vibrationIntensity,
      scadaFillLevel: scadaVisuals.fillLevel ?? undefined,
      metricsLoad: data.metrics.load,
      enableVibration,
    });

    // Cleanup: unregister from parent on unmount
    return () => {
      onStateUpdate(data.id, null);
    };
  }, [
    data.id,
    position,
    rotation,
    type,
    status,
    scadaVisuals.rpmMultiplier,
    scadaVisuals.vibrationIntensity,
    scadaVisuals.fillLevel,
    data.metrics.load,
    enableVibration,
    onStateUpdate,
  ]);

  // matProps now incorporates SCADA temperature glow when hot
  const matProps = {
    emissive: hovered
      ? '#3b82f6'
      : scadaVisuals.temperatureGlow > 0
        ? scadaVisuals.temperatureColor
        : '#000000',
    emissiveIntensity: hovered ? 0.3 : scadaVisuals.temperatureGlow,
  };

  const renderGeometry = () => {
    switch (type) {
      case MachineType.SILO: {
        // Use SCADA fill level if available, otherwise fall back to data or generate
        const fillLevel =
          scadaVisuals.fillLevel ?? data.fillLevel ?? 50 + Math.sin(textureSeed) * 30;
        const grainQuality =
          data.grainQuality ??
          (['premium', 'standard', 'economy', 'mixed'] as const)[textureSeed % 4];
        const grainType = data.grainType ?? GRAIN_TYPES[textureSeed % GRAIN_TYPES.length];
        const maintenanceHours = data.maintenanceCountdown ?? 48 + (textureSeed % 200);
        const useSiloGLTF = useGLTFModels && siloModelAvailable === true;

        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* Main silo body - GLTF or procedural */}
            {useSiloGLTF ? (
              <Suspense
                fallback={
                  <mesh castShadow receiveShadow>
                    <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} />
                    <meshStandardMaterial
                      color="#cbd5e1"
                      metalness={0.7}
                      roughness={0.2}
                      {...matProps}
                    />
                  </mesh>
                }
              >
                <GLTFSiloBase size={size as [number, number, number]} matProps={matProps} />
              </Suspense>
            ) : (
              <mesh receiveShadow>
                <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} />
                <meshStandardMaterial
                  color="#cbd5e1"
                  metalness={0.7}
                  roughness={0.2}
                  roughnessMap={roughnessMap}
                  normalMap={normalMap}
                  normalScale={normalMap ? SILO_NORMAL_SCALE : undefined}
                  {...matProps}
                />
              </mesh>
            )}

            {/* Fill level visualization */}
            <SiloFillIndicator
              fillLevel={fillLevel}
              quality={grainQuality}
              grainType={grainType}
              radius={size[0] / 2}
              height={size[1]}
            />

            {/* Weld seams */}
            <WeldSeams radius={size[0] / 2} height={size[1]} enabled={enableTextures} />
            {/* Top cone */}
            <mesh position={[0, size[1] / 2 + 1, 0]}>
              <coneGeometry args={[size[0] / 2, 2, 32]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} {...matProps} />
            </mesh>
            {/* Dust on top of cone */}
            {enableWeathering && (
              <mesh position={[0, size[1] / 2 + 2.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[(size[0] / 2) * 0.6, 16]} />
                <meshStandardMaterial
                  color="#e8dcc8"
                  transparent
                  opacity={0.25}
                  roughness={1}
                  depthWrite={false}
                />
              </mesh>
            )}
            {/* Bottom cone (hopper) */}
            <mesh position={[0, -size[1] / 2 - 1, 0]}>
              <coneGeometry args={[size[0] / 2, 2, 32]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} {...matProps} />
            </mesh>
            {/* Legs - using shared materials */}
            {[1, -1].map((x) =>
              [1, -1].map((z) => (
                <mesh
                  key={`${x}-${z}`}
                  position={[(x * size[0]) / 3, -size[1] / 2 - 3, (z * size[0]) / 3]}
                  geometry={legCylinderGeometry}
                >
                  <primitive object={MACHINE_MATERIALS.millBody} attach="material" />
                </mesh>
              ))
            )}
            {/* Access ladder with safety cage */}
            <group position={[size[0] / 2 + 0.2, 0, 0]}>
              {/* Main ladder rails */}
              <mesh position={[0, 0, -0.2]}>
                <boxGeometry args={[0.1, size[1], 0.05]} />
                <primitive object={METAL_MATERIALS.steelDark} attach="material" />
              </mesh>
              <mesh position={[0, 0, 0.2]}>
                <boxGeometry args={[0.1, size[1], 0.05]} />
                <primitive object={METAL_MATERIALS.steelDark} attach="material" />
              </mesh>

              {/* Safety Cage (Hoops and Rails) - starts 2.5m from bottom */}
              <group position={[0.4, 1.25, 0]}>
                {/* Vertical straps */}
                {[0, -0.3, 0.3].map((z, i) => (
                  <mesh key={`strap-${i}`} position={[0.4, size[1] / 2 - 1.25, z]}>
                    <boxGeometry args={[0.03, size[1] - 2.5, 0.03]} />
                    <meshStandardMaterial color="#94a3b8" />
                  </mesh>
                ))}
                {/* Hoops every 1.5 units */}
                {Array.from({ length: Math.floor((size[1] - 2.5) / 1.5) }).map((_, i) => (
                  <mesh
                    key={`hoop-${i}`}
                    position={[0, -size[1] / 2 + 2.5 + i * 1.5, 0]}
                    rotation={[Math.PI / 2, 0, 0]}
                  >
                    <torusGeometry args={[0.4, 0.02, 8, 16, Math.PI * 1.2]} />
                    <meshStandardMaterial color="#94a3b8" side={THREE.DoubleSide} />
                  </mesh>
                ))}
              </group>
            </group>

            {/* Maintenance countdown - skip on low graphics */}
            {quality !== 'low' && (
              <MaintenanceCountdown
                hoursRemaining={maintenanceHours}
                position={[-(size[0] / 2 + 1), size[1] / 2 - 1, 0]}
              />
            )}
          </group>
        );
      }

      case MachineType.ROLLER_MILL: {
        // Detailed industrial roller mill - Bühler-style grain processing machine
        // Guard against NaN/invalid dimensions
        const w = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 3.5;
        const h = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 5;
        const d = Number.isFinite(size[2]) && size[2] > 0 ? size[2] : 3.5;

        // Cable path for motor power. Plain const, NOT useMemo: renderGeometry()
        // is called conditionally (low-quality branch at the render site), so a
        // hook here would violate the Rules of Hooks. Rebuilding 4 vectors per
        // render of a static machine is negligible.
        const motorCablePoints = [
          new THREE.Vector3(-w * 0.5 - 0.4, -h * 0.1, 0), // Motor
          new THREE.Vector3(-w * 0.5 - 0.4, -h * 0.4, 0), // Down
          new THREE.Vector3(-w * 0.3, -h * 0.45, 0), // In
          new THREE.Vector3(0, -h * 0.45, 0), // Center
        ];

        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* === MAIN HOUSING === */}
            {/* Lower grinding chamber - heavy steel */}
            <mesh castShadow receiveShadow position={[0, -h * 0.15, 0]}>
              <boxGeometry args={[w, h * 0.7, d]} />
              <meshPhysicalMaterial
                color="#2563eb"
                metalness={0.6}
                roughness={0.2}
                roughnessMap={roughnessMap}
                clearcoat={1.0}
                clearcoatRoughness={0.1}
                {...matProps}
              />
            </mesh>

            {/* Machine Label */}
            <group position={[0, h * 0.25, d * 0.51]}>
              <mesh>
                <planeGeometry args={[w * 0.4, 0.15]} />
                <meshStandardMaterial color="#0f172a" />
              </mesh>
              <Text
                position={[0, 0, 0.01]}
                fontSize={0.08}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
              >
                {data.name.toUpperCase()}
              </Text>
            </group>

            {/* Power Cables */}
            <IndustrialCable points={motorCablePoints} radius={0.04} color="#1e293b" />

            {/* Upper feed section - lighter color */}
            <mesh receiveShadow position={[0, h * 0.35, 0]}>
              <boxGeometry args={[w * 0.9, h * 0.3, d * 0.85]} />
              <meshStandardMaterial color="#60a5fa" metalness={0.5} roughness={0.3} {...matProps} />
            </mesh>

            {/* === FEED HOPPER === */}
            <group position={[0, h * 0.55, 0]}>
              {/* Hopper walls - trapezoidal */}
              <mesh>
                <boxGeometry args={[w * 0.7, 0.08, d * 0.6]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} />
              </mesh>
              {/* Hopper sides */}
              {[
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
              ].map(([x, z], i) => (
                <mesh
                  key={i}
                  castShadow
                  position={[x * w * 0.35, 0.3, z * d * 0.3]}
                  rotation={[z ? (z > 0 ? -0.4 : 0.4) : 0, 0, x ? (x > 0 ? 0.4 : -0.4) : 0]}
                >
                  <boxGeometry args={[x ? 0.05 : w * 0.7, 0.6, z ? 0.05 : d * 0.6]} />
                  <meshStandardMaterial color="#cbd5e1" metalness={0.6} roughness={0.25} />
                </mesh>
              ))}
              {/* Feed gate adjustment wheel */}
              <mesh position={[w * 0.4, 0.2, 0]} rotation={[0, 0, Math.PI / 2]}>
                <torusGeometry args={[0.12, 0.02, 8, 16]} />
                <meshStandardMaterial color="#ef4444" metalness={0.6} roughness={0.4} />
              </mesh>
            </group>

            {/* === ROLLER COMPARTMENTS (3 pairs visible through windows) === */}
            {[-0.25, 0, 0.25].map((yOffset, pairIdx) => (
              <group key={pairIdx} position={[0, -h * 0.1 + yOffset * h, 0]}>
                {/* Roller pair housing */}
                <mesh position={[0, 0, d * 0.52]}>
                  <boxGeometry args={[w * 0.85, h * 0.22, 0.08]} />
                  <meshStandardMaterial color="#1e3a5f" metalness={0.5} roughness={0.4} />
                </mesh>
                {/* Viewing window frame */}
                <mesh position={[0, 0, d * 0.54]}>
                  <boxGeometry args={[w * 0.5, h * 0.15, 0.02]} />
                  <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.2} />
                </mesh>
                {/* Glass window */}
                <mesh position={[0, 0, d * 0.55]}>
                  <planeGeometry args={[w * 0.45, h * 0.12]} />
                  <meshPhysicalMaterial
                    color="#1e40af"
                    metalness={0.1}
                    roughness={0.1}
                    transmission={0.6}
                    transparent
                    opacity={0.4}
                  />
                </mesh>
                {/* Actual rollers visible through window - PERFORMANCE: Skip on LOW quality */}
                {!isLowQuality && (
                  <>
                    <AnisotropicRoller
                      position={[0, 0.08, d * 0.35]}
                      radius={0.18}
                      length={w * 0.75}
                      enabled={enableAnisotropicReflections}
                      rpm={status === 'running' ? data.metrics.rpm * (0.6 + pairIdx * 0.15) : 0}
                    />
                    <AnisotropicRoller
                      position={[0, -0.08, d * 0.35]}
                      radius={0.16}
                      length={w * 0.75}
                      enabled={enableAnisotropicReflections}
                      rpm={status === 'running' ? -data.metrics.rpm * (0.6 + pairIdx * 0.15) : 0}
                    />
                  </>
                )}
              </group>
            ))}

            {/* === MOTOR HOUSING (side mount) === */}
            <group position={[-w * 0.5 - 0.4, -h * 0.1, 0]}>
              {/* Motor body - using shared materials */}
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.5, 0.5, 0.7, 16]} />
                <primitive object={MACHINE_MATERIALS.millBody} attach="material" />
              </mesh>
              {/* Motor fins (cooling) - using shared materials */}
              {INDICES_8.map((i) => (
                <mesh
                  key={i}
                  position={[-0.35 + i * 0.1, 0, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  geometry={motorFinGeometry}
                >
                  <primitive object={METAL_MATERIALS.paintedDarkGray} attach="material" />
                </mesh>
              ))}
              {/* Motor shaft - using shared materials */}
              <mesh position={[0.4, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
                <primitive object={MACHINE_MATERIALS.shaft} attach="material" />
              </mesh>
              {/* Belt guard cover */}
              <mesh position={[0.55, 0, 0]}>
                <boxGeometry args={[0.25, 0.8, 0.6]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.3} roughness={0.5} />
              </mesh>
              {/* Warning stripes on belt guard */}
              {[-0.25, 0, 0.25].map((y, i) => (
                <mesh key={i} position={[0.68, y, 0]}>
                  <planeGeometry args={[0.01, 0.08]} />
                  <meshBasicMaterial color="#1f2937" />
                </mesh>
              ))}
              {/* Ventilation fan - PERFORMANCE: Skip on LOW/MEDIUM quality */}
              {(quality === 'high' || quality === 'ultra') && (
                <RotatingFan
                  position={[-0.4, 0, 0]}
                  speed={status === 'running' ? data.metrics.rpm / 80 : 0}
                  size={0.4}
                />
              )}
            </group>

            {/* === CONTROL PANEL === */}
            <group position={[w * 0.5 + 0.15, 0.2, 0]}>
              {/* Panel housing - using shared materials */}
              <mesh>
                <boxGeometry args={[0.2, 1.4, d * 0.7]} />
                <primitive object={MACHINE_MATERIALS.panelBody} attach="material" />
              </mesh>
              {/* Control panel face */}
              <ControlPanel
                position={[0.11, 0.3, 0]}
                rotation={[0, -Math.PI / 2, 0]}
                status={status}
                enabled={enableControlPanels}
              />
              {/* Gauges - PERFORMANCE: Skip on LOW quality */}
              {!isLowQuality && (
                <>
                  <AnimatedGauge
                    position={[0.11, 0.55, d * 0.2]}
                    value={scadaVisuals.tagValues.rpm ?? data.metrics.rpm}
                    maxValue={1600}
                  />
                  <AnimatedGauge
                    position={[0.11, 0.55, -d * 0.2]}
                    value={scadaVisuals.tagValues.temperature ?? data.metrics.temperature}
                    maxValue={80}
                  />
                </>
              )}
              {/* Roll gap adjustment handwheels */}
              {[-0.3, 0, 0.3].map((z, i) => (
                <group key={i} position={[0.12, -0.3, z]}>
                  <mesh rotation={[0, 0, Math.PI / 2]}>
                    <torusGeometry args={[0.08, 0.015, 8, 16]} />
                    <meshStandardMaterial color="#dc2626" metalness={0.5} roughness={0.4} />
                  </mesh>
                  <mesh rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
                    <meshStandardMaterial color="#7f1d1d" metalness={0.6} roughness={0.3} />
                  </mesh>
                </group>
              ))}
            </group>

            {/* === DISCHARGE CHUTE === */}
            <group position={[0, -h * 0.55, d * 0.3]}>
              <mesh rotation={[0.25, 0, 0]}>
                <boxGeometry args={[w * 0.6, 0.08, 0.8]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} />
              </mesh>
              {/* Chute sides */}
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x * w * 0.3, 0, 0]} rotation={[0.25, 0, 0]}>
                  <boxGeometry args={[0.04, 0.15, 0.8]} />
                  <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.3} />
                </mesh>
              ))}
            </group>

            {/* === ASPIRATION/DUST PORTS === */}
            {[-1, 1].map((z) => (
              <group key={z} position={[0, h * 0.2, z * d * 0.52]}>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.15, 0.12, 0.2, 12]} />
                  <meshStandardMaterial color="#6b7280" metalness={0.7} roughness={0.25} />
                </mesh>
                {/* Flange */}
                <mesh position={[0, 0, z * 0.1]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.18, 0.18, 0.03, 12]} />
                  <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.2} />
                </mesh>
              </group>
            ))}

            {/* === SUPPORT FRAME === */}
            {[
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ].map(([x, z], i) => (
              <group key={i}>
                {/* Vertical legs */}
                <mesh position={[x * (w * 0.45), -h * 0.75, z * (d * 0.4)]}>
                  <boxGeometry args={[0.12, h * 0.5, 0.12]} />
                  <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
                </mesh>
                {/* Foot pads */}
                <mesh position={[x * (w * 0.45), -h, z * (d * 0.4)]}>
                  <boxGeometry args={[0.2, 0.05, 0.2]} />
                  <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>
            ))}
            {/* Cross bracing */}
            <mesh position={[0, -h * 0.65, -d * 0.4]}>
              <boxGeometry args={[w * 0.9, 0.08, 0.06]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0, -h * 0.65, d * 0.4]}>
              <boxGeometry args={[w * 0.9, 0.08, 0.06]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
            </mesh>

            {/* === ACCESS DOORS === */}
            {[-1, 1].map((z) => (
              <group key={z} position={[0, -h * 0.15, z * d * 0.51]}>
                {/* Door panel */}
                <mesh>
                  <boxGeometry args={[w * 0.4, h * 0.35, 0.03]} />
                  <meshStandardMaterial color="#3b82f6" metalness={0.45} roughness={0.35} />
                </mesh>
                {/* Door handle */}
                <mesh position={[w * 0.15, 0, z * 0.03]}>
                  <boxGeometry args={[0.08, 0.15, 0.04]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Hinges */}
                {[-0.12, 0.12].map((y, hi) => (
                  <mesh key={hi} position={[-w * 0.18, y, z * 0.02]}>
                    <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
                    <meshStandardMaterial color="#374151" metalness={0.9} roughness={0.1} />
                  </mesh>
                ))}
              </group>
            ))}

            {/* Weathering layer */}
            <WeatheringLayer size={size as [number, number, number]} enabled={enableWeathering} />

            {/* Steam vents when hot */}
            {quality !== 'low' && status === 'running' && data.metrics.temperature > 50 && (
              <SteamVent
                position={[0, h * 0.6, 0]}
                intensity={(data.metrics.temperature - 50) / 25}
              />
            )}

            {/* Sparks from milling process at high RPM */}
            {quality !== 'low' && status === 'running' && data.metrics.rpm > 1400 && (
              <Sparks position={[0, -h * 0.4, d * 0.3]} active />
            )}
          </group>
        );
      }

      case MachineType.PLANSIFTER: {
        // Realistic industrial plansifter - dual-compartment square nest design
        // Based on Bühler MPAG / Imas Multiplexa industrial sifter architecture
        // Guard against NaN/invalid dimensions
        const sw = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 7;
        const sh = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 7;
        const sd = Number.isFinite(size[2]) && size[2] > 0 ? size[2] : 7;
        const compartmentWidth = sw * 0.42; // Width of each lateral sifting cabin
        const centralWidth = sw * 0.16; // Central drive chassis width

        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* === CEILING MOUNTING FRAME === */}
            <group position={[0, sh * 0.65, 0]}>
              {/* Primary I-beam structure */}
              <mesh castShadow>
                <boxGeometry args={[sw * 1.4, 0.18, 0.12]} />
                <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.2} />
              </mesh>
              {/* I-beam flanges */}
              {[-1, 1].map((y) => (
                <mesh key={y} position={[0, y * 0.08, 0]}>
                  <boxGeometry args={[sw * 1.4, 0.025, 0.2]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.2} />
                </mesh>
              ))}
              {/* Cross bracing beams */}
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x * sw * 0.55, 0, 0]}>
                  <boxGeometry args={[0.1, 0.15, sd * 0.9]} />
                  <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.25} />
                </mesh>
              ))}
              {/* Diagonal bracing */}
              {[
                [-1, -1],
                [1, 1],
              ].map(([x, z], i) => (
                <mesh
                  key={i}
                  castShadow
                  position={[x * sw * 0.3, -0.15, z * sd * 0.25]}
                  rotation={[z * 0.4, 0, x * 0.3]}
                >
                  <boxGeometry args={[0.06, 0.35, 0.06]} />
                  <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
                </mesh>
              ))}
            </group>

            {/* === CANE HANGERS (Flexible Suspension Rods) === */}
            {/* 8 hanging rods - 4 per sifting compartment */}
            {[
              [-0.38, -0.38],
              [-0.38, 0.38],
              [-0.18, -0.38],
              [-0.18, 0.38],
              [0.18, -0.38],
              [0.18, 0.38],
              [0.38, -0.38],
              [0.38, 0.38],
            ].map(([xRatio, zRatio], i) => (
              <group key={i} position={[xRatio * sw, sh * 0.35, zRatio * sd]}>
                {/* Upper clevis bracket on ceiling frame */}
                <mesh position={[0, sh * 0.3, 0]}>
                  <boxGeometry args={[0.08, 0.06, 0.08]} />
                  <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
                </mesh>

                {/* Flexible cane rod (High fidelity cable) */}
                <IndustrialCable
                  points={[
                    new THREE.Vector3(0, sh * 0.3, 0),
                    new THREE.Vector3(0.01 * (i % 2 === 0 ? 1 : -1), 0, 0.01), // Slight imperfection
                    new THREE.Vector3(0, -sh * 0.28, 0),
                  ]}
                  radius={0.015}
                  color="#9ca3af"
                />

                {/* Lower clevis bracket on sifter body */}
                <mesh position={[0, -sh * 0.28, 0]}>
                  <boxGeometry args={[0.1, 0.08, 0.1]} />
                  <meshStandardMaterial color="#6b7280" metalness={0.75} roughness={0.25} />
                </mesh>
                {/* Clevis pin (visible bolt) */}
                <mesh position={[0, -sh * 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.012, 0.012, 0.14, 8]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.9} roughness={0.15} />
                </mesh>
              </group>
            ))}

            {/* === DUAL SIFTING COMPARTMENTS (Left & Right Cabins) === */}
            {[-1, 1].map((side) => (
              <group key={side} position={[side * (compartmentWidth / 2 + centralWidth / 2), 0, 0]}>
                {/* Main compartment body - cream/white painted steel */}
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[compartmentWidth, sh * 0.85, sd * 0.92]} />
                  <meshPhysicalMaterial
                    color="#f5f0e6"
                    metalness={0.12}
                    roughness={0.25}
                    roughnessMap={roughnessMap}
                    clearcoat={0.6}
                    clearcoatRoughness={0.2}
                    {...matProps}
                  />
                </mesh>

                {/* Reinforced corner posts (aluminum extrusion profile) */}
                {[
                  [-1, -1],
                  [-1, 1],
                  [1, -1],
                  [1, 1],
                ].map(([cx, cz], ci) => (
                  <mesh
                    key={ci}
                    castShadow
                    position={[cx * (compartmentWidth / 2 - 0.04), 0, cz * (sd * 0.46 - 0.04)]}
                  >
                    <boxGeometry args={[0.1, sh * 0.86, 0.1]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.75} roughness={0.2} />
                  </mesh>
                ))}

                {/* === INDUSTRIAL FRONT PANEL WITH ACCESS HATCHES === */}
                {/* Horizontal reinforcement ribs across front face */}
                {[-0.25, 0, 0.25].map((yRatio, ri) => (
                  <mesh key={ri} position={[0, sh * yRatio, sd * 0.465]}>
                    <boxGeometry args={[compartmentWidth * 0.95, 0.04, 0.02]} />
                    <meshStandardMaterial color="#a8a29e" metalness={0.6} roughness={0.3} />
                  </mesh>
                ))}

                {/* Large access hatch - upper section */}
                <group position={[0, sh * 0.15, sd * 0.47]}>
                  {/* Hatch frame */}
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.7, sh * 0.35, 0.03]} />
                    <meshStandardMaterial color="#d4d4d8" metalness={0.4} roughness={0.35} />
                  </mesh>
                  {/* Hatch recessed panel */}
                  <mesh position={[0, 0, 0.02]}>
                    <boxGeometry args={[compartmentWidth * 0.6, sh * 0.28, 0.015]} />
                    <meshStandardMaterial color="#e7e5e4" metalness={0.35} roughness={0.4} />
                  </mesh>
                  {/* Heavy-duty swing handle */}
                  <group position={[compartmentWidth * 0.25, 0, 0.04]}>
                    <mesh rotation={[0, 0, Math.PI / 2]}>
                      <cylinderGeometry args={[0.025, 0.025, 0.18, 8]} />
                      <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.2} />
                    </mesh>
                    {/* Handle mounts */}
                    {[-0.08, 0.08].map((y, hi) => (
                      <mesh key={hi} position={[0, y, -0.02]}>
                        <boxGeometry args={[0.05, 0.04, 0.04]} />
                        <meshStandardMaterial color="#3f3f46" metalness={0.75} roughness={0.25} />
                      </mesh>
                    ))}
                  </group>
                  {/* Gasket seal line */}
                  <mesh position={[0, 0, 0.016]}>
                    <boxGeometry args={[compartmentWidth * 0.65, sh * 0.32, 0.003]} />
                    <meshStandardMaterial color="#1c1917" metalness={0.1} roughness={0.8} />
                  </mesh>
                </group>

                {/* Lower access hatch - smaller */}
                <group position={[0, -sh * 0.22, sd * 0.47]}>
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.55, sh * 0.2, 0.025]} />
                    <meshStandardMaterial color="#d4d4d8" metalness={0.4} roughness={0.35} />
                  </mesh>
                  {/* Quick-release latches (2) */}
                  {[-0.15, 0.15].map((xOff, li) => (
                    <group key={li} position={[compartmentWidth * xOff, sh * 0.06, 0.03]}>
                      <mesh>
                        <boxGeometry args={[0.06, 0.04, 0.025]} />
                        <meshStandardMaterial color="#71717a" metalness={0.75} roughness={0.2} />
                      </mesh>
                      <mesh position={[0, -0.025, 0.01]} rotation={[0.4, 0, 0]}>
                        <boxGeometry args={[0.035, 0.04, 0.01]} />
                        <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.15} />
                      </mesh>
                    </group>
                  ))}
                </group>

                {/* Ventilation grille - bottom */}
                <group position={[0, -sh * 0.38, sd * 0.465]}>
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.4, sh * 0.08, 0.015]} />
                    <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.35} />
                  </mesh>
                  {/* Grille slats */}
                  {INDICES_5.map((gi) => (
                    <mesh key={gi} position={[compartmentWidth * (-0.15 + gi * 0.075), 0, 0.01]}>
                      <boxGeometry args={[0.02, sh * 0.06, 0.01]} />
                      <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.3} />
                    </mesh>
                  ))}
                </group>

                {/* Corner bolt clusters - industrial detail */}
                {[
                  [-1, 1],
                  [1, 1],
                  [-1, -1],
                  [1, -1],
                ].map(([cx, cy], bi) => (
                  <group
                    key={bi}
                    position={[cx * compartmentWidth * 0.4, cy * sh * 0.35, sd * 0.47]}
                  >
                    {[
                      [0.03, 0.03],
                      [-0.03, 0.03],
                      [0.03, -0.03],
                      [-0.03, -0.03],
                    ].map(([bx, by], si) => (
                      <mesh key={si} position={[bx, by, 0]}>
                        <cylinderGeometry args={[0.012, 0.012, 0.02, 6]} />
                        <meshStandardMaterial color="#3f3f46" metalness={0.85} roughness={0.15} />
                      </mesh>
                    ))}
                  </group>
                ))}

                {/* === SIDE ACCESS PANEL (hinged door with cam latches) === */}
                <group position={[side * (compartmentWidth / 2 + 0.02), -sh * 0.05, 0]}>
                  {/* Panel door */}
                  <mesh rotation={[0, side * 0.02, 0]}>
                    <boxGeometry args={[0.035, sh * 0.65, sd * 0.7]} />
                    <meshStandardMaterial color="#e7e5e4" metalness={0.2} roughness={0.3} />
                  </mesh>
                  {/* Panel frame trim */}
                  <mesh position={[side * 0.02, 0, 0]}>
                    <boxGeometry args={[0.02, sh * 0.68, sd * 0.73]} />
                    <meshStandardMaterial color="#a8a29e" metalness={0.5} roughness={0.35} />
                  </mesh>
                  {/* Cam latches (3 per door) */}
                  {[-0.2, 0, 0.2].map((yOff, li) => (
                    <group key={li} position={[side * 0.04, sh * yOff, sd * 0.32]}>
                      {/* Latch body */}
                      <mesh>
                        <boxGeometry args={[0.025, 0.08, 0.04]} />
                        <meshStandardMaterial color="#52525b" metalness={0.85} roughness={0.15} />
                      </mesh>
                      {/* Latch lever */}
                      <mesh position={[side * 0.02, 0.03, 0]} rotation={[0, 0, side * 0.3]}>
                        <boxGeometry args={[0.04, 0.025, 0.02]} />
                        <meshStandardMaterial color="#27272a" metalness={0.9} roughness={0.1} />
                      </mesh>
                    </group>
                  ))}
                  {/* Hinge pins (opposite side) */}
                  {[-0.25, 0.25].map((yOff, hi) => (
                    <mesh
                      key={hi}
                      position={[-side * (sd * 0.32), sh * yOff, -sd * 0.35]}
                      rotation={[Math.PI / 2, 0, 0]}
                    >
                      <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
                      <meshStandardMaterial color="#3f3f46" metalness={0.8} roughness={0.2} />
                    </mesh>
                  ))}
                </group>

                {/* Inspection window on front */}
                <group position={[0, sh * 0.15, sd * 0.47]}>
                  <mesh>
                    <boxGeometry args={[compartmentWidth * 0.4, sh * 0.2, 0.025]} />
                    <meshStandardMaterial color="#71717a" metalness={0.6} roughness={0.3} />
                  </mesh>
                  <mesh position={[0, 0, 0.015]}>
                    <planeGeometry args={[compartmentWidth * 0.35, sh * 0.17]} />
                    <meshPhysicalMaterial
                      color="#fafafa"
                      metalness={0.05}
                      roughness={0.05}
                      transmission={0.75}
                      transparent
                      opacity={0.35}
                    />
                  </mesh>
                </group>

                {/* Product inlet (top of each compartment) */}
                <group position={[0, sh * 0.44, 0]}>
                  <mesh>
                    <cylinderGeometry args={[0.18, 0.15, 0.12, 12]} />
                    <meshStandardMaterial color="#6b7280" metalness={0.75} roughness={0.2} />
                  </mesh>
                  <mesh position={[0, 0.07, 0]}>
                    <cylinderGeometry args={[0.22, 0.22, 0.03, 12]} />
                    <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.15} />
                  </mesh>
                </group>

                {/* Outlet chutes (bottom - multiple fractions) */}
                {[-0.25, 0, 0.25].map((xOff, oi) => (
                  <group key={oi} position={[compartmentWidth * xOff, -sh * 0.45, sd * 0.2]}>
                    <mesh rotation={[0.35, 0, 0]}>
                      <boxGeometry args={[0.28, 0.06, 0.35]} />
                      <meshStandardMaterial
                        color={oi === 1 ? '#94a3b8' : '#78716c'}
                        metalness={0.7}
                        roughness={0.2}
                      />
                    </mesh>
                  </group>
                ))}
              </group>
            ))}

            {/* === CENTRAL DRIVE CHASSIS === */}
            <group position={[0, 0, 0]}>
              {/* Chassis body */}
              <mesh castShadow receiveShadow>
                <boxGeometry args={[centralWidth, sh * 0.75, sd * 0.85]} />
                <meshStandardMaterial color="#374151" metalness={0.65} roughness={0.3} />
              </mesh>

              {/* === LARGE ECCENTRIC FLYWHEEL (visible counterweight) === */}
              <group position={[0, -sh * 0.15, -sd * 0.48]}>
                {/* Flywheel */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[sh * 0.28, sh * 0.28, 0.12, 24]} />
                  <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.15} />
                </mesh>
                {/* Flywheel rim detail */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[sh * 0.26, 0.025, 8, 32]} />
                  <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
                </mesh>
                {/* Counterweight (off-center mass) */}
                <mesh position={[sh * 0.12, 0, -0.03]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
                  <meshStandardMaterial color="#dc2626" metalness={0.6} roughness={0.3} />
                </mesh>
                {/* Hub */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.08, 0.08, 0.18, 12]} />
                  <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Spokes (6) */}
                {INDICES_6.map((si) => (
                  <mesh
                    key={si}
                    position={[
                      Math.cos((si * Math.PI) / 3) * sh * 0.13,
                      Math.sin((si * Math.PI) / 3) * sh * 0.13,
                      -0.03,
                    ]}
                    rotation={[Math.PI / 2, 0, (si * Math.PI) / 3]}
                  >
                    <boxGeometry args={[sh * 0.22, 0.04, 0.06]} />
                    <meshStandardMaterial color="#27272a" metalness={0.8} roughness={0.2} />
                  </mesh>
                ))}
              </group>

              {/* Drive motor */}
              <group position={[0, -sh * 0.15, -sd * 0.58]}>
                {/* Motor body */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.22, 0.22, 0.4, 16]} />
                  <meshStandardMaterial color="#1e3a5f" metalness={0.6} roughness={0.35} />
                </mesh>
                {/* Motor cooling fins */}
                {INDICES_8.map((fi) => (
                  <mesh
                    key={fi}
                    position={[0, 0, -0.1 - fi * 0.035]}
                    rotation={[Math.PI / 2, 0, 0]}
                  >
                    <cylinderGeometry args={[0.24, 0.24, 0.012, 16]} />
                    <meshStandardMaterial color="#1e3a5f" metalness={0.55} roughness={0.4} />
                  </mesh>
                ))}
                {/* Motor terminal box */}
                <mesh position={[0.18, 0.08, -0.15]}>
                  <boxGeometry args={[0.12, 0.1, 0.08]} />
                  <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.4} />
                </mesh>
                {/* Motor mounting base */}
                <mesh position={[0, -0.15, -0.15]}>
                  <boxGeometry args={[0.35, 0.08, 0.5]} />
                  <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.3} />
                </mesh>
              </group>

              {/* V-belt guard (yellow safety) */}
              <mesh position={[0, -sh * 0.15, -sd * 0.52]}>
                <boxGeometry args={[0.35, sh * 0.35, 0.08]} />
                <meshStandardMaterial color="#eab308" metalness={0.3} roughness={0.45} />
              </mesh>
            </group>

            {/* === ASPIRATION SYSTEM (Dust Collection) === */}
            {/* Main aspiration duct on top */}
            <group position={[0, sh * 0.5, -sd * 0.3]}>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.15, 0.15, sw * 0.8, 12]} />
                <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.25} />
              </mesh>
              {/* Vertical exhaust riser */}
              <mesh position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.12, 0.15, 0.5, 12]} />
                <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.25} />
              </mesh>
              {/* Branch connections to compartments */}
              {[-1, 1].map((side) => (
                <mesh
                  key={side}
                  castShadow
                  position={[side * sw * 0.25, -0.1, 0]}
                  rotation={[0, 0, side * 0.4]}
                >
                  <cylinderGeometry args={[0.08, 0.1, 0.25, 10]} />
                  <meshStandardMaterial color="#78716c" metalness={0.65} roughness={0.3} />
                </mesh>
              ))}
            </group>

            {/* Air inlet dampers (sides) */}
            {[-1, 1].map((side) => (
              <group
                key={side}
                position={[side * sw * 0.45, sh * 0.2, 0]}
                rotation={[0, (side * Math.PI) / 2, 0]}
              >
                <mesh>
                  <boxGeometry args={[0.3, 0.25, 0.06]} />
                  <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.35} />
                </mesh>
                {/* Damper louvers */}
                {[-0.08, 0, 0.08].map((y, li) => (
                  <mesh key={li} position={[0, y, 0.035]} rotation={[0.3, 0, 0]}>
                    <boxGeometry args={[0.25, 0.04, 0.015]} />
                    <meshStandardMaterial color="#71717a" metalness={0.7} roughness={0.25} />
                  </mesh>
                ))}
              </group>
            ))}

            {/* === CONTROL & MONITORING === */}
            {/* Main control panel - PERFORMANCE: Skip on LOW quality */}
            {!isLowQuality && (
              <ControlPanel
                position={[sw * 0.48, 0, sd * 0.35]}
                rotation={[0, -Math.PI / 2, 0]}
                status={status}
                enabled={enableControlPanels}
              />
            )}

            {/* Status indicator lights */}
            {[
              { pos: [-sw * 0.35, sh * 0.4, sd * 0.46], color: '#22c55e' },
              { pos: [sw * 0.35, sh * 0.4, sd * 0.46], color: '#22c55e' },
              { pos: [0, sh * 0.35, -sd * 0.44], color: '#3b82f6' },
            ].map((light, li) => (
              <mesh key={li} position={light.pos as [number, number, number]}>
                <sphereGeometry args={[0.06, 10, 10]} />
                <meshStandardMaterial
                  color={status === 'running' ? light.color : '#6b7280'}
                  emissive={status === 'running' ? light.color : '#000000'}
                  emissiveIntensity={status === 'running' ? 0.6 : 0}
                />
              </mesh>
            ))}

            {/* Vibration sensor (on chassis) */}
            <mesh position={[centralWidth * 0.6, -sh * 0.3, 0]}>
              <boxGeometry args={[0.08, 0.08, 0.08]} />
              <meshStandardMaterial color="#0ea5e9" metalness={0.5} roughness={0.4} />
            </mesh>

            {/* Temperature probe */}
            <mesh position={[-centralWidth * 0.6, sh * 0.1, sd * 0.4]} rotation={[0.5, 0, 0]}>
              <cylinderGeometry args={[0.02, 0.015, 0.15, 8]} />
              <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Weathering - flour dust accumulation */}
            <WeatheringLayer size={size as [number, number, number]} enabled={enableWeathering} />

            {/* Nameplate / ID tag */}
            <group position={[0, sh * 0.35, sd * 0.47]}>
              <mesh>
                <boxGeometry args={[0.4, 0.12, 0.01]} />
                <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
              </mesh>
              <mesh position={[0, 0, 0.006]}>
                <planeGeometry args={[0.35, 0.08]} />
                <meshBasicMaterial color="#fafafa" />
              </mesh>
            </group>
          </group>
        );
      }

      case MachineType.PACKER: {
        // Detailed bag packer - flour/grain bagging machine
        const pw = size[0],
          ph = size[1],
          pd = size[2];
        return (
          <group position={[0, size[1] / 2, 0]}>
            {/* === MAIN FRAME === */}
            {/* Vertical frame posts */}
            {[
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ].map(([x, z], i) => (
              <mesh key={i} position={[x * pw * 0.45, 0, z * pd * 0.4]}>
                <boxGeometry args={[0.1, ph * 1.1, 0.1]} />
                <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.4} />
              </mesh>
            ))}
            {/* Top frame */}
            <mesh position={[0, ph * 0.55, 0]}>
              <boxGeometry args={[pw * 0.95, 0.08, pd * 0.85]} />
              <meshStandardMaterial color="#ea580c" metalness={0.45} roughness={0.35} />
            </mesh>

            {/* === WEIGHING HOPPER === */}
            <group position={[0, ph * 0.35, 0]}>
              {/* Hopper body - tapered */}
              <mesh>
                <boxGeometry args={[pw * 0.6, ph * 0.3, pd * 0.5]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} />
              </mesh>
              {/* Hopper taper bottom */}
              <mesh position={[0, -ph * 0.2, 0]}>
                <boxGeometry args={[pw * 0.4, ph * 0.12, pd * 0.35]} />
                <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.25} />
              </mesh>
              {/* Load cells (visual) */}
              {[-1, 1].map((x) => (
                <mesh key={x} position={[x * pw * 0.25, ph * 0.18, 0]}>
                  <boxGeometry args={[0.15, 0.08, 0.15]} />
                  <meshStandardMaterial color="#22c55e" metalness={0.5} roughness={0.4} />
                </mesh>
              ))}
              {/* Weight display */}
              <group position={[pw * 0.35, 0, pd * 0.28]}>
                <mesh>
                  <boxGeometry args={[0.35, 0.2, 0.08]} />
                  <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0, 0.041]}>
                  <planeGeometry args={[0.3, 0.15]} />
                  <meshBasicMaterial color="#22c55e" />
                </mesh>
              </group>
            </group>

            {/* === FILLING SPOUT === */}
            <group position={[0, ph * 0.05, 0]}>
              {/* Spout tube */}
              <mesh>
                <cylinderGeometry args={[0.12, 0.18, ph * 0.35, 12]} />
                <meshStandardMaterial color="#6b7280" metalness={0.75} roughness={0.2} />
              </mesh>
              {/* Spout collar */}
              <mesh position={[0, -ph * 0.15, 0]}>
                <cylinderGeometry args={[0.22, 0.2, 0.08, 12]} />
                <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.15} />
              </mesh>
              {/* Butterfly valve indicator */}
              <mesh position={[0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
                <meshStandardMaterial color="#dc2626" metalness={0.5} roughness={0.4} />
              </mesh>
            </group>

            {/* === BAG CLAMP MECHANISM === */}
            <group position={[0, -ph * 0.2, 0]}>
              {/* Clamp arms */}
              {[-1, 1].map((x) => (
                <group key={x}>
                  <mesh position={[x * 0.3, 0, 0]}>
                    <boxGeometry args={[0.08, 0.25, pd * 0.4]} />
                    <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
                  </mesh>
                  {/* Clamp pads */}
                  <mesh position={[x * 0.25, -0.05, 0]}>
                    <boxGeometry args={[0.06, 0.15, pd * 0.35]} />
                    <meshStandardMaterial color="#1f2937" roughness={0.8} />
                  </mesh>
                  {/* Pneumatic cylinders */}
                  <mesh position={[x * 0.4, 0.05, 0]} rotation={[0, 0, x * 0.3]}>
                    <cylinderGeometry args={[0.04, 0.04, 0.2, 8]} />
                    <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.15} />
                  </mesh>
                </group>
              ))}
              {/* Bag shape indicator (when running) */}
              {status === 'running' && (
                <mesh position={[0, -0.25, 0]}>
                  <boxGeometry args={[0.5, 0.4, 0.3]} />
                  <meshStandardMaterial color="#fef3c7" roughness={0.7} transparent opacity={0.8} />
                </mesh>
              )}
            </group>

            {/* === CONVEYOR SYSTEM === */}
            <group position={[0, -ph * 0.48, pd * 0.5]}>
              {/* Conveyor frame */}
              <mesh>
                <boxGeometry args={[pw * 1.2, 0.08, pd * 0.8]} />
                <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.35} />
              </mesh>
              {/* Rollers */}
              {INDICES_8.map((i) => (
                <mesh
                  key={i}
                  position={[-pw * 0.5 + i * (pw * 0.15), 0.06, 0]}
                  rotation={[0, 0, Math.PI / 2]}
                  geometry={conveyorRollerGeometry}
                >
                  <meshStandardMaterial color="#6b7280" metalness={0.8} roughness={0.15} />
                </mesh>
              ))}
              {/* Conveyor belt surface */}
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[pw * 1.1, 0.02, pd * 0.6]} />
                <meshStandardMaterial color="#1f2937" roughness={0.9} />
              </mesh>
              {/* Side guides */}
              {[-1, 1].map((z) => (
                <mesh key={z} position={[0, 0.15, z * pd * 0.35]}>
                  <boxGeometry args={[pw * 1.2, 0.1, 0.03]} />
                  <meshStandardMaterial color="#f97316" metalness={0.4} roughness={0.4} />
                </mesh>
              ))}
              {/* Filled bag (when running) */}
              {status === 'running' && (
                <mesh position={[pw * 0.4, 0.2, 0]}>
                  <boxGeometry args={[0.45, 0.25, 0.35]} />
                  <meshStandardMaterial color="#fef3c7" roughness={0.75} />
                </mesh>
              )}
            </group>

            {/* === CONTROL STATION === */}
            <group position={[-pw * 0.55, 0, 0]}>
              {/* Control cabinet */}
              <mesh>
                <boxGeometry args={[0.25, ph * 0.7, pd * 0.5]} />
                <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.35} />
              </mesh>
              {/* Control panel face - PERFORMANCE: Skip on LOW quality */}
              {!isLowQuality && (
                <ControlPanel
                  position={[-0.13, ph * 0.15, 0]}
                  rotation={[0, Math.PI / 2, 0]}
                  status={status}
                  enabled={enableControlPanels}
                />
              )}
              {/* Emergency stop */}
              <group position={[-0.13, -ph * 0.15, pd * 0.15]}>
                <mesh>
                  <cylinderGeometry args={[0.06, 0.06, 0.03, 16]} />
                  <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.5} />
                </mesh>
                <mesh position={[0, 0.025, 0]}>
                  <cylinderGeometry args={[0.045, 0.045, 0.02, 16]} />
                  <meshStandardMaterial color="#7f1d1d" metalness={0.5} roughness={0.4} />
                </mesh>
              </group>
              {/* Start button */}
              <mesh position={[-0.13, -ph * 0.15, -pd * 0.15]}>
                <cylinderGeometry args={[0.04, 0.04, 0.025, 12]} />
                <meshStandardMaterial
                  color="#22c55e"
                  emissive={status === 'running' ? '#22c55e' : '#000000'}
                  emissiveIntensity={status === 'running' ? 0.5 : 0}
                />
              </mesh>
            </group>

            {/* === SAFETY GUARDS === */}
            {/* Side guard panels */}
            {[-1, 1].map((z) => (
              <mesh key={z} position={[pw * 0.3, -ph * 0.1, z * pd * 0.45]}>
                <boxGeometry args={[pw * 0.5, ph * 0.6, 0.02]} />
                <meshStandardMaterial
                  color="#fbbf24"
                  metalness={0.3}
                  roughness={0.5}
                  transparent
                  opacity={0.9}
                />
              </mesh>
            ))}

            {/* Warning stripes on frame */}
            {[
              [-1, -1],
              [-1, 1],
              [1, -1],
              [1, 1],
            ].map(([x, z], i) => (
              <group key={i}>
                {[0, 1, 2].map((stripe) => (
                  <mesh
                    key={stripe}
                    position={[x * pw * 0.45, -ph * 0.3 + stripe * 0.15, z * pd * 0.41]}
                  >
                    <boxGeometry args={[0.11, 0.05, 0.01]} />
                    <meshBasicMaterial color={stripe % 2 === 0 ? '#1f2937' : '#fbbf24'} />
                  </mesh>
                ))}
              </group>
            ))}

            {/* Weathering */}
            <WeatheringLayer size={size as [number, number, number]} enabled={enableWeathering} />

            {/* Status beacon */}
            <mesh position={[pw * 0.4, ph * 0.6, pd * 0.3]}>
              <cylinderGeometry args={[0.06, 0.06, 0.1, 12]} />
              <meshStandardMaterial
                color={
                  status === 'running' ? '#22c55e' : status === 'warning' ? '#f59e0b' : '#6b7280'
                }
                emissive={
                  status === 'running' ? '#22c55e' : status === 'warning' ? '#f59e0b' : '#000000'
                }
                emissiveIntensity={status !== 'idle' ? 0.6 : 0}
              />
            </mesh>
          </group>
        );
      }

      default:
        return null;
    }
  };

  // PERFORMANCE: Simplified box representation for LOW quality
  // Reduces ~150 draw calls per machine down to ~5
  const renderSimplifiedGeometry = () => {
    // Simple colored box based on machine type
    const typeColors: Record<MachineType, string> = {
      [MachineType.SILO]: '#94a3b8',
      [MachineType.ROLLER_MILL]: '#64748b',
      [MachineType.PLANSIFTER]: '#78716c',
      [MachineType.PACKER]: '#475569',
      [MachineType.CONTROL_ROOM]: '#64748b',
    };
    const color = typeColors[type] || '#64748b';

    return (
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={[size[0], size[1], size[2]]} />
        <meshBasicMaterial color={color} />
      </mesh>
    );
  };

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[0, rotation, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
      onClick={(e) => {
        e.stopPropagation();
        audioManager.playClick();
        onSelect(data);
      }}
    >
      {/* PERFORMANCE: Use simplified box on LOW quality, full geometry on MEDIUM+ */}
      {isLowQuality ? renderSimplifiedGeometry() : renderGeometry()}

      {/* Heat shimmer effect for hot machines - uses SCADA temperature */}
      {/* PERFORMANCE: Disabled on LOW quality */}
      {!isLowQuality &&
        status === 'running' &&
        (type === MachineType.ROLLER_MILL || type === MachineType.PACKER) && (
          <HeatShimmer
            position={position as [number, number, number]}
            temperature={scadaVisuals.tagValues.temperature ?? data.metrics.temperature}
            size={size as [number, number, number]}
          />
        )}

      {/* Status light - uses SCADA-derived color */}
      {/* PERFORMANCE: Simplified on LOW quality */}
      {isLowQuality ? (
        <mesh position={[0, size[1] + 0.5, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshBasicMaterial color={statusColor} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, size[1] + 1.5, 0]}>
            <sphereGeometry args={[0.3]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={3}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0, size[1] + 0.75, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 1.5]} />
            <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
          </mesh>
        </>
      )}

      {/* SCADA Alarm Indicator - pulsing octahedron when alarms are active */}
      {/* PERFORMANCE: Disabled on LOW quality */}
      {!isLowQuality && scadaAlarms.highestPriority && (
        <AlarmIndicator
          position={[size[0] / 2 + 0.8, size[1] + 1.5, 0]}
          priority={scadaAlarms.highestPriority}
          pulseSpeed={scadaVisuals.alarmPulseSpeed}
          hasUnacknowledged={scadaAlarms.hasUnacknowledged}
        />
      )}

      {/* SCADA Live Values Overlay - shows on hover for high/ultra graphics */}
      {hovered && Object.keys(scadaVisuals.tagValues).length > 0 && (
        <SCADAValueOverlay
          position={[-(size[0] / 2 + 1.5), size[1] / 2, 0]}
          tagValues={scadaVisuals.tagValues}
          temperatureColor={scadaVisuals.temperatureColor}
          vibrationColor={scadaVisuals.vibrationColor}
        />
      )}

      {/* Hover tooltip - PERFORMANCE: Disabled on LOW quality (Html overlays are expensive) */}
      {!isLowQuality && hovered && (
        <Html position={[0, size[1] + 2.5, 0]} center distanceFactor={12}>
          <div className="bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 px-4 py-2 rounded-lg shadow-2xl pointer-events-none min-w-[180px]">
            <div className="font-bold text-white text-sm">{data.name}</div>
            <div className="text-xs text-cyan-400">{data.type.replace('_', ' ')}</div>
            <div className="flex items-center gap-1 mt-1">
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: statusColor }}
              ></span>
              <span className="text-xs text-slate-400 capitalize">
                {scadaVisuals.derivedStatus}
              </span>
            </div>
            {scadaAlarms.highestPriority && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-[10px] text-red-400">
                  {scadaAlarms.alarms.length} alarm{scadaAlarms.alarms.length > 1 ? 's' : ''} active
                </span>
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-1">Click to inspect</div>
          </div>
        </Html>
      )}
    </group>
  );
});

// Memoize Machines component to prevent re-renders when parent reflows
export const Machines = React.memo(MachinesComponent);

export const MachinesContainer: React.FC<{
  initialMachines: MachineData[];
  onSelect: (data: MachineData) => void;
}> = React.memo(({ initialMachines, onSelect }) => {
  const storeMachines = useProductionStore((state) => state.machines);
  // Use store machines if available (live updates), otherwise initial static machines
  const displayMachines = storeMachines.length > 0 ? storeMachines : initialMachines;

  return <Machines machines={displayMachines} onSelect={onSelect} />;
});

/**
 * MachineSimulationController - Handles physics simulation loop for machines.
 * Isolated from the main rendering tree to prevent re-renders of the scene.
 */
export const MachineSimulationController: React.FC = () => {
  const { storeMachines, batchUpdateMachineMetrics, updateMachineStatus, scadaLive } =
    useProductionStore(
      useShallow((state) => ({
        storeMachines: state.machines,
        batchUpdateMachineMetrics: state.batchUpdateMachineMetrics,
        updateMachineStatus: state.updateMachineStatus,
        scadaLive: state.scadaLive,
      }))
    );

  const lastUpdateRef = useRef(0);
  const frameCountRef = useRef(0);
  const productionSpeed = useProductionStore((state) => state.productionSpeed);

  // BILATERAL ALIGNMENT: Workforce productivity multiplier affects production output
  const workforceProductivity = useWorkerMoodStore((state) =>
    state.getWorkforceProductivityMultiplier()
  );

  // Simulate realistic machine metric changes over time
  // Throttled to check every 30 frames (~0.5s at 60fps) instead of every frame
  useFrame((state) => {
    // When SCADA is driving metrics, skip local simulation
    if (scadaLive) return;
    frameCountRef.current++;

    // Only check time every 30 frames to reduce overhead
    if (frameCountRef.current % 30 !== 0) return;

    const now = state.clock.elapsedTime;

    // Update every 2 seconds
    if (now - lastUpdateRef.current < 2) return;
    lastUpdateRef.current = now;

    // Only update if store has machines
    if (storeMachines.length === 0) return;

    // PHYSICS-BASED METRIC SIMULATION
    // Update ALL machines based on their actual state (not random selection)
    const metricUpdates: { machineId: string; metrics: Partial<MachineData['metrics']> }[] = [];

    for (const machine of storeMachines) {
      const isRunning = machine.status === 'running' || machine.status === 'warning';
      const isIdle = machine.status === 'idle';
      const isCritical = machine.status === 'critical';

      // Get base temps for machine type
      const baseTemp: Record<string, number> = {
        SILO: 20,
        ROLLER_MILL: 42,
        PLANSIFTER: 28,
        PACKER: 28,
        CONTROL_ROOM: 22,
      };
      const machineBaseTemp = baseTemp[machine.type.toString()] || 30;

      // LOAD: Responds to productionSpeed * workforce productivity multiplier
      // BILATERAL ALIGNMENT: High trust workers (1.15x) produce more, low trust (0.85x) drags
      let targetLoad = machine.metrics.load;
      if (isRunning) {
        // Running machines adjust load toward productionSpeed * 80 * workforce productivity
        const baseLoad = 50 + productionSpeed * 30; // 50-80% based on speed
        targetLoad = baseLoad * workforceProductivity; // Apply trust/initiative multiplier (0.85-1.20x)
      } else if (isIdle) {
        targetLoad = 0; // Idle = no load
      }
      const loadChange = (targetLoad - machine.metrics.load) * 0.1; // Smooth transition
      const newLoad = Math.max(0, Math.min(100, machine.metrics.load + loadChange));

      // TEMPERATURE: Correlates with load (high load = heat up, idle = cool down)
      let targetTemp = machineBaseTemp;
      if (isRunning) {
        // Temperature rises with load: base + up to 20°C at full load
        targetTemp = machineBaseTemp + (newLoad / 100) * 20;
      } else if (isIdle) {
        // Cooling down toward ambient
        targetTemp = 20;
      } else if (isCritical) {
        // Critical machines run hot
        targetTemp = machineBaseTemp + 40;
      }
      const tempChange = (targetTemp - machine.metrics.temperature) * 0.05; // Slow thermal change
      const newTemp = Math.max(15, Math.min(90, machine.metrics.temperature + tempChange));

      // VIBRATION: Correlates with RPM and machine status
      let targetVibration = 1.0;
      if (isRunning) {
        // Vibration based on RPM ratio and load
        const rpmRatio = machine.metrics.rpm / 1200; // Normalize to 1200 RPM base
        targetVibration = 1.0 + rpmRatio * 2 + newLoad / 100;
        // Warning machines vibrate more (something is wrong)
        if (machine.status === 'warning') targetVibration *= 1.5;
      } else if (isCritical) {
        targetVibration = 7; // Critical = high vibration
      } else {
        targetVibration = 0.2; // Idle = minimal vibration
      }
      const vibrationChange = (targetVibration - machine.metrics.vibration) * 0.1;
      const newVibration = Math.max(0, Math.min(10, machine.metrics.vibration + vibrationChange));

      // Collect metric updates for batch processing
      metricUpdates.push({
        machineId: machine.id,
        metrics: {
          temperature: Math.round(newTemp * 10) / 10,
          vibration: Math.round(newVibration * 100) / 100,
          load: Math.round(newLoad * 10) / 10,
        },
      });

      // STATUS CHANGES: Based on actual threshold crossings (deterministic)
      if (machine.status === 'running') {
        // Transition to warning if temp or vibration exceeds threshold
        if (newTemp > 70 || newVibration > 5) {
          updateMachineStatus(machine.id, 'warning');
        }
      } else if (machine.status === 'warning') {
        // Recovery when metrics return to safe levels
        if (newTemp < 55 && newVibration < 3.5) {
          updateMachineStatus(machine.id, 'running');
        }
        // Escalate to critical if thresholds exceeded significantly
        if (newTemp > 80 || newVibration > 8) {
          updateMachineStatus(machine.id, 'critical');
        }
      } else if (machine.status === 'critical') {
        // Only recover from critical if metrics are very low (machine cooled down)
        if (newTemp < 40 && newVibration < 2) {
          updateMachineStatus(machine.id, 'warning');
        }
      }
    }

    // Commit all metric updates in one batch to prevent render thrashing
    if (metricUpdates.length > 0) {
      batchUpdateMachineMetrics(metricUpdates);
    }
  });

  return null;
};
