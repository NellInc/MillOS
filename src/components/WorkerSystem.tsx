import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Billboard, Text } from '@react-three/drei';
import { Briefcase, FlaskConical, HardHat, Shield, User, Wrench as WrenchIcon } from 'lucide-react';
import { WorkerData, WORKER_ROSTER } from '../types';
import { positionRegistry, type EntityPosition } from '../utils/positionRegistry';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { PhysicsWorker } from './physics/PhysicsWorker';
import { useSafetyStore } from '../stores/safetyStore';
import { useUIStore } from '../stores/uiStore';
import { useProductionStore } from '../stores/productionStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { WorkerMoodOverlay } from './WorkerMoodOverlay';
import { WorkerReactionOverlay } from './MaintenanceSystem';
import { audioManager } from '../utils/audioManager';
import { shouldRunThisFrame, getThrottleLevel, getGlobalFrameCount } from '../utils/frameThrottle';
import { useAIConfigStore } from '../stores/aiConfigStore';
import * as THREE from 'three';
import {
  SHARED_WORKER_MATERIALS,
  getSkinMaterial,
  getSkinSoftMaterial,
  getHairMaterial,
  getUniformMaterial,
  getPantsMaterial,
} from './workers/SharedWorkerMaterials';
import { SHARED_WORKER_GEOMETRY } from './workers/SharedWorkerGeometries';
import { RecommendedWorkerRing } from './workers/RecommendedWorkerRing';
import { FatigueIndicator } from './workers/FatigueIndicator';
import { AutonomyIndicator } from './workers/AutonomyIndicator';
import { FlourishingIndicator } from './workers/FlourishingIndicator';
import { getWorkerStatusColor } from '../utils/statusColors';
import { getWorkerAppearance } from './workers/WorkerAppearance';
import { ToolAccessory } from './workers/WorkerTools';
import { Hair } from './workers/WorkerHair';
import { HumanModel } from './workers/HumanModel';
import {
  TRUCK_EXCLUSION_ZONES,
  SAFE_AISLES,
  isInExclusionZone,
  getSafeZPosition,
  getSafeSpawnZ,
  ROLE_WORKING_POSES,
  type IdleAnimationType,
  type SpecialAction,
} from './workers/shared';

interface WorkerSystemProps {
  onSelectWorker: (worker: WorkerData) => void;
}

// Exclusion zones, safe aisles, and spawn utilities are now imported from './workers/shared'

export const WorkerSystem: React.FC<WorkerSystemProps> = ({ onSelectWorker }) => {
  const setWorkers = useProductionStore((state) => state.setWorkers);

  const workers = useMemo(() => {
    return WORKER_ROSTER.map((roster, i) => {
      // Pick a safe aisle
      const baseX = SAFE_AISLES[i % SAFE_AISLES.length];
      // Add small random offset but keep in safe zone
      const x = baseX + (Math.random() - 0.5) * 2;
      // Generate z position and adjust if in obstacle zone
      const rawZ = Math.random() * 50 - 25;
      const z = getSafeSpawnZ(rawZ);

      return {
        ...roster,
        position: [x, 0, z] as [number, number, number],
        direction: (Math.random() > 0.5 ? 1 : -1) as 1 | -1,
      };
    });
  }, []);

  useEffect(() => {
    setWorkers(workers);
    return () => {
      setWorkers([]);
      workers.forEach((worker) => positionRegistry.unregister(worker.id));
    };
  }, [setWorkers, workers]);

  // Memoize callbacks for each worker to prevent re-renders
  const workerCallbacks = useMemo(
    () => workers.map((w) => () => onSelectWorker(w)),
    [workers, onSelectWorker]
  );

  return (
    <group>
      {workers.map((w, i) => (
        <Worker key={w.id} data={w} onSelect={workerCallbacks[i]} />
      ))}
    </group>
  );
};

// Worker appearance, tools, hair, animation types, and HumanModel are now imported from ./workers/*

const SimplifiedWorker: React.FC<{
  walkCycleRef: React.MutableRefObject<number>;
  uniformColor: string;
  skinTone: string;
  hatColor: string;
  hasVest: boolean;
  pantsColor: string;
}> = React.memo(({ walkCycleRef, uniformColor, skinTone, hatColor, hasVest, pantsColor }) => {
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Basic walk animation
  useFrame(() => {
    // PERFORMANCE: Skip animations when tab hidden or LOW quality
    if (!isTabVisible) return;
    if (quality === 'low') return; // Static workers on LOW quality
    const walkCycle = walkCycleRef.current;
    if (leftLegRef.current && rightLegRef.current) {
      leftLegRef.current.rotation.x = Math.sin(walkCycle) * 0.3;
      rightLegRef.current.rotation.x = -Math.sin(walkCycle) * 0.3;
    }
    if (leftArmRef.current && rightArmRef.current) {
      leftArmRef.current.rotation.x = -Math.sin(walkCycle) * 0.2;
      rightArmRef.current.rotation.x = Math.sin(walkCycle) * 0.2;
    }
  });

  return (
    <group position={[0, 0.05, 0]}>
      {/* Torso - combined chest and hips */}
      <mesh
        position={[0, 1.1, 0]}
        castShadow
        geometry={SHARED_WORKER_GEOMETRY.box_small}
        scale={[0.5, 0.9, 0.25]}
      >
        <meshStandardMaterial color={hasVest ? '#f97316' : uniformColor} roughness={0.7} />
      </mesh>

      {/* Head */}
      <mesh
        position={[0, 1.75, 0]}
        castShadow
        geometry={SHARED_WORKER_GEOMETRY.sphere_med}
        scale={[0.15, 0.15, 0.15]}
      >
        <meshStandardMaterial color={skinTone} roughness={0.6} />
      </mesh>

      {/* Hard hat */}
      <mesh position={[0, 1.9, 0]} castShadow>
        <sphereGeometry args={[0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hatColor} roughness={0.5} />
      </mesh>

      {/* Left arm */}
      <group ref={leftArmRef} position={[-0.3, 1.3, 0]}>
        <mesh
          position={[0, -0.25, 0]}
          castShadow
          geometry={SHARED_WORKER_GEOMETRY.box_small}
          scale={[0.12, 0.5, 0.12]}
        >
          <meshStandardMaterial color={uniformColor} roughness={0.7} />
        </mesh>
      </group>

      {/* Right arm */}
      <group ref={rightArmRef} position={[0.3, 1.3, 0]}>
        <mesh
          position={[0, -0.25, 0]}
          castShadow
          geometry={SHARED_WORKER_GEOMETRY.box_small}
          scale={[0.12, 0.5, 0.12]}
        >
          <meshStandardMaterial color={uniformColor} roughness={0.7} />
        </mesh>
      </group>

      {/* Hips */}
      <mesh
        position={[0, 0.7, 0]}
        geometry={SHARED_WORKER_GEOMETRY.box_small}
        scale={[0.45, 0.3, 0.25]}
      >
        <meshStandardMaterial color={pantsColor} roughness={0.8} />
      </mesh>

      {/* Left leg */}
      <group ref={leftLegRef} position={[-0.13, 0.55, 0]}>
        <mesh
          position={[0, -0.3, 0]}
          castShadow
          geometry={SHARED_WORKER_GEOMETRY.box_small}
          scale={[0.15, 0.6, 0.15]}
        >
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
      </group>

      {/* Right leg */}
      <group ref={rightLegRef} position={[0.13, 0.55, 0]}>
        <mesh
          position={[0, -0.3, 0]}
          castShadow
          geometry={SHARED_WORKER_GEOMETRY.box_small}
          scale={[0.15, 0.6, 0.15]}
        >
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
});
SimplifiedWorker.displayName = 'SimplifiedWorker';

import { SHARED_WORKER_GEOMETRY } from './workers/SharedWorkerGeometries';

// ... (existing imports)

const WorkerBillboard: React.FC<{
  uniformColor: string;
  hasVest: boolean;
  hatColor: string;
}> = React.memo(({ uniformColor, hasVest, hatColor }) => {
  return (
    <group scale={[0.85, 0.85, 0.85]} position={[0, -0.34, 0]}>
      {/* Simple body - single box */}
      <mesh position={[0, 1.0, 0]} castShadow geometry={SHARED_WORKER_GEOMETRY.billboard_body}>
        <meshStandardMaterial color={hasVest ? '#f97316' : uniformColor} roughness={0.8} />
      </mesh>
      {/* Head - sphere */}
      <mesh position={[0, 1.8, 0]} castShadow geometry={SHARED_WORKER_GEOMETRY.billboard_head}>
        <meshStandardMaterial color="#f5d0c5" roughness={0.6} />
      </mesh>
      {/* Hard hat */}
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={hatColor} roughness={0.5} />
      </mesh>
    </group>
  );
});

// Memoize Worker component to prevent unnecessary re-renders
// Custom comparison function - only re-render if worker data actually changes
const Worker: React.FC<{ data: WorkerData; onSelect: () => void }> = React.memo(
  ({ data, onSelect }) => {
    const ref = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);
    // LOD tier: Use ref for internal tracking + state for rendering
    // This prevents re-renders every frame while still updating JSX when LOD changes
    const lodRef = useRef<'high' | 'medium' | 'low'>('high');
    const [lod, setLod] = useState<'high' | 'medium' | 'low'>('high');
    const walkCycleRef = useRef(0); // Changed to ref - no re-render on animation
    const headRotationRef = useRef(0); // Changed to ref for smoother animation without re-renders
    const [isWaving, setIsWaving] = useState(false);
    const isIdleRef = useRef(false); // Changed from useState to ref to avoid re-renders in useFrame
    const directionRef = useRef(data.direction);
    const baseXRef = useRef(data.position[0]);
    const idleTimerRef = useRef(Math.random() * 10 + 5); // 5-15s before first idle
    const idleDurationRef = useRef(0);
    const isEvadingRef = useRef(false);
    const wasEvadingRef = useRef(false);
    const evadeDirectionRef = useRef(0); // -1 for left, 1 for right
    const evadeCooldownRef = useRef(0); // Cooldown after evasion before returning
    const EVADE_COOLDOWN_TIME = 1.5; // Wait 1.5s after forklift passes before returning
    const waveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastStepRef = useRef(0); // Track walk cycle phase for footsteps
    const cameraDistanceRef = useRef(0); // For animation LOD
    const isStartledRef = useRef(false); // Startled when forklift is very close
    const frameCountRef = useRef(0); // Frame counter for throttling expensive checks
    const lastForkliftCheckRef = useRef<EntityPosition | null>(null);
    const alertDirectionRef = useRef<number | undefined>(undefined); // Direction to look at active alert
    const fatigueRef = useRef(0); // Accumulates over time, resets on break
    const nearbyWorkerDirRef = useRef<number | undefined>(undefined); // Direction to nearby worker
    const shiftStartRef = useRef(Date.now()); // Track shift start for fatigue
    const specialActionRef = useRef<
      'none' | 'running' | 'carrying' | 'sitting' | 'celebrating' | 'pointing'
    >('none');
    const pointDirectionRef = useRef(0);
    const celebrationTimerRef = useRef(0); // Timer for celebration duration
    const recordWorkerEvasion = useSafetyStore((state) => state.recordWorkerEvasion);
    const alerts = useUIStore((state) => state.alerts);

    const recordHeatMapPoint = useProductionStore((state) => state.recordHeatMapPoint);

    // Strategic AI recommendation - highlight this worker if recommended
    const recommendWorker = useAIConfigStore((state) => state.strategic.recommendWorker);
    const isRecommended = recommendWorker?.toLowerCase().includes(data.name.toLowerCase()) || false;

    // Cache graphics settings (updated every ~1 second instead of every frame)
    const cachedThrottleLevelRef = useRef(2);
    const workerSettingsCacheFrameRef = useRef(0);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const shiftChangeActive = useGameSimulationStore((state) => state.shiftChangeActive);
    const shiftChangePhase = useGameSimulationStore((state) => state.shiftChangePhase);
    // Fire drill evacuation
    const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
    const drillMetrics = useGameSimulationStore((state) => state.drillMetrics);
    const markWorkerEvacuated = useGameSimulationStore((state) => state.markWorkerEvacuated);
    const getNearestExit = useGameSimulationStore((state) => state.getNearestExit);

    // Breakdown repair (maintenance worker only - David Kim w5)
    const activeBreakdowns = useBreakdownStore((state) => state.activeBreakdowns);
    const updateRepairProgress = useBreakdownStore((state) => state.updateRepairProgress);
    const assignRepairWorker = useBreakdownStore((state) => state.assignRepairWorker);

    // Physics system toggle
    const enablePhysics = useGraphicsStore((state) => state.graphics.enablePhysics);

    // Track if this worker has been marked as evacuated (to prevent multiple calls)
    const hasEvacuatedRef = useRef(false);

    // Track repair assignment for maintenance worker
    const currentRepairIdRef = useRef<string | null>(null);

    // Reset evacuation status when drill ends
    useEffect(() => {
      if (!emergencyDrillMode) {
        hasEvacuatedRef.current = false;
      }
    }, [emergencyDrillMode]);

    // Obstacle avoidance state
    const isAvoidingObstacleRef = useRef(false);
    const avoidanceTargetXRef = useRef(0);
    const currentObstacleRef = useRef<string | null>(null);
    const OBSTACLE_DETECTION_RANGE = 5; // How far ahead to look for obstacles
    const AVOIDANCE_SPEED = 2.5; // Speed when moving sideways to avoid
    const OBSTACLE_PADDING = 0.8; // Extra clearance around obstacles

    // Track when evasion starts and ends
    // Note: This effect intentionally runs on every render to track ref changes
    // The setIsWaving calls are guarded by conditions that prevent infinite loops
    useEffect(() => {
      if (isEvadingRef.current && !wasEvadingRef.current) {
        recordWorkerEvasion();
      }
      // When evasion ends, wave to acknowledge the forklift
      if (!isEvadingRef.current && wasEvadingRef.current) {
        setIsWaving(true);
        // Stop waving after 1.5 seconds
        if (waveTimeoutRef.current) clearTimeout(waveTimeoutRef.current);
        waveTimeoutRef.current = setTimeout(() => setIsWaving(() => false), 1500);
      }
      wasEvadingRef.current = isEvadingRef.current;
    }, [recordWorkerEvasion]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (waveTimeoutRef.current) {
          clearTimeout(waveTimeoutRef.current);
          waveTimeoutRef.current = null;
        }
      };
    }, []);

    // Set initial position only once (not via prop to avoid reset on re-render)
    const initializedRef = useRef(false);
    useEffect(() => {
      if (ref.current && !initializedRef.current) {
        ref.current.position.set(...data.position);
        initializedRef.current = true;
      }
    }, [data.position]);

    // Memoize appearance for consistency
    const appearance = useMemo(
      () => getWorkerAppearance(data.role, data.color, data.id),
      [data.role, data.color, data.id]
    );

    // Callback for physics worker to update position (keeps ref in sync for animations)
    const handlePhysicsPositionUpdate = useCallback((x: number, z: number) => {
      if (ref.current) {
        ref.current.position.x = x;
        ref.current.position.z = z;
      }
    }, []);

    // Callback for physics worker to update direction (syncs rotation with velocity)
    const handlePhysicsDirectionUpdate = useCallback((direction: number) => {
      directionRef.current = direction > 0 ? 1 : -1;
      if (ref.current) {
        ref.current.rotation.y = direction > 0 ? 0 : Math.PI;
      }
    }, []);

    // Generate a consistent offset based on worker ID to distribute frame updates
    // This prevents all workers from updating on the same frame, smoothing out CPU spikes
    const throttleOffset = useMemo(() => {
      let sum = 0;
      for (let i = 0; i < data.id.length; i++) {
        sum += data.id.charCodeAt(i);
      }
      return sum % 60; // Keep within 0-59 range
    }, [data.id]);

    useFrame((state, delta) => {
      // PERFORMANCE: Skip all worker logic when tab hidden
      if (!ref.current || !isTabVisible) return;

      // When physics is enabled, skip all movement code - physics handles position
      // But still update animations and visuals
      if (enablePhysics) {
        // Just update walk cycle animation
        const cappedDelta = Math.min(delta, 0.1);
        walkCycleRef.current += cappedDelta * 5.5;
        ref.current.position.y = Math.abs(Math.sin(walkCycleRef.current)) * 0.025;

        // Update LOD based on camera distance
        // Distribute LOD checks using the offset (check every 10 frames)
        if ((getGlobalFrameCount() + throttleOffset) % 10 === 0) {
          cameraDistanceRef.current = state.camera.position.distanceTo(ref.current.position);
          const dist = cameraDistanceRef.current;
          let newLod = lodRef.current;
          if (lodRef.current === 'high' && dist > 30) newLod = 'medium';
          else if (lodRef.current === 'medium' && dist < 25) newLod = 'high';
          else if (lodRef.current === 'medium' && dist > 55) newLod = 'low';
          else if (lodRef.current === 'low' && dist < 45) newLod = 'medium';
          if (newLod !== lodRef.current) {
            lodRef.current = newLod;
            setLod(newLod);
          }
        }

        // Update rotation based on direction ref
        ref.current.rotation.y = directionRef.current > 0 ? 0 : Math.PI;
        return; // Skip all legacy movement code
      }

      // === SHIFT CHANGE BEHAVIOR ===
      // When shift change is active, workers walk toward exit
      if (shiftChangeActive && shiftChangePhase === 'leaving') {
        const cappedDelta = Math.min(delta, 0.1);
        const exitZ = -50; // Exit toward receiving dock
        const exitSpeed = 3.0; // Faster walk to exit

        // Walk toward exit
        if (ref.current.position.z > exitZ) {
          ref.current.position.z -= exitSpeed * cappedDelta;
          directionRef.current = -1; // Face exit direction
          ref.current.rotation.y = Math.PI;
          walkCycleRef.current += cappedDelta * 6;
          ref.current.position.y = Math.abs(Math.sin(walkCycleRef.current)) * 0.025;
        }

        // Update position registry even during shift change
        // Throttle registry updates slightly during shift change (every 2nd frame)
        if ((getGlobalFrameCount() + throttleOffset) % 2 === 0) {
          positionRegistry.register(
            data.id,
            ref.current.position.x,
            ref.current.position.z,
            'worker',
            undefined,
            undefined,
            undefined,
            ref.current.position.y
          );
        }
        return; // Skip normal behavior during shift change
      }

      // === FIRE DRILL EVACUATION BEHAVIOR ===
      // When fire drill is active, workers run to nearest exit
      if (emergencyDrillMode && drillMetrics.active && !hasEvacuatedRef.current) {
        const cappedDelta = Math.min(delta, 0.1);
        const EVACUATION_SPEED = 6.0; // Running speed
        const EVACUATION_THRESHOLD = 3.0; // Distance to exit to be considered evacuated

        // Get nearest exit for this worker
        const nearestExit = getNearestExit(ref.current.position.x, ref.current.position.z);
        const targetX = nearestExit.position.x;
        const targetZ = nearestExit.position.z;

        // Calculate direction to exit
        const dx = targetX - ref.current.position.x;
        const dz = targetZ - ref.current.position.z;
        const distanceToExit = Math.sqrt(dx * dx + dz * dz);

        if (distanceToExit > EVACUATION_THRESHOLD) {
          // Normalize direction and move toward exit
          const dirX = dx / distanceToExit;
          const dirZ = dz / distanceToExit;

          ref.current.position.x += dirX * EVACUATION_SPEED * cappedDelta;
          ref.current.position.z += dirZ * EVACUATION_SPEED * cappedDelta;

          // Face direction of movement
          ref.current.rotation.y = Math.atan2(dirX, dirZ);

          // Running animation (faster walk cycle)
          walkCycleRef.current += cappedDelta * 10;
          ref.current.position.y = Math.abs(Math.sin(walkCycleRef.current)) * 0.04; // Higher bounce for running
        } else {
          // Worker has reached exit - mark as evacuated
          hasEvacuatedRef.current = true;
          markWorkerEvacuated(data.id);
          ref.current.position.y = 0;
        }

        // Update position registry during evacuation
        // Throttle registry updates slightly (every 2nd frame)
        if ((getGlobalFrameCount() + throttleOffset) % 2 === 0) {
          positionRegistry.register(
            data.id,
            ref.current.position.x,
            ref.current.position.z,
            'worker',
            undefined,
            undefined,
            undefined,
            ref.current.position.y
          );
        }
        return; // Skip normal behavior during evacuation
      }

      // === BREAKDOWN REPAIR BEHAVIOR (Maintenance Worker Only) ===
      // David Kim (w5) is the maintenance technician who repairs breakdowns
      if (data.id === 'w5' && activeBreakdowns.length > 0) {
        const cappedDelta = Math.min(delta, 0.1);
        const REPAIR_SPEED = 4.0; // Walking speed to machine
        const REPAIR_DISTANCE = 2.5; // Distance to start repairing
        const REPAIR_RATE = 15; // Progress % per second when repairing

        // Find breakdown assigned to this worker, or first unassigned one
        let assignedBreakdown = activeBreakdowns.find((b) => b.assignedWorkerId === data.id);

        // If no assignment, pick first unassigned breakdown
        if (!assignedBreakdown) {
          const unassigned = activeBreakdowns.find((b) => !b.assignedWorkerId);
          if (unassigned) {
            assignRepairWorker(unassigned.id, data.id, data.name);
            assignedBreakdown = unassigned;
            currentRepairIdRef.current = unassigned.id;
          }
        }

        if (assignedBreakdown) {
          // Get machine position from production store
          const machines = useProductionStore.getState().machines;
          const targetMachine = machines.find((m) => m.id === assignedBreakdown!.machineId);

          if (targetMachine) {
            const targetX = targetMachine.position[0];
            const targetZ = targetMachine.position[2];

            const dx = targetX - ref.current.position.x;
            const dz = targetZ - ref.current.position.z;
            const distanceToMachine = Math.sqrt(dx * dx + dz * dz);

            if (distanceToMachine > REPAIR_DISTANCE) {
              // Move toward machine
              const dirX = dx / distanceToMachine;
              const dirZ = dz / distanceToMachine;

              ref.current.position.x += dirX * REPAIR_SPEED * cappedDelta;
              ref.current.position.z += dirZ * REPAIR_SPEED * cappedDelta;

              // Face direction of movement
              ref.current.rotation.y = Math.atan2(dirX, dirZ);

              // Walking animation
              walkCycleRef.current += cappedDelta * 6;
              ref.current.position.y = Math.abs(Math.sin(walkCycleRef.current)) * 0.02;
            } else {
              // At machine - perform repair
              ref.current.position.y = 0;
              // Face the machine
              ref.current.rotation.y = Math.atan2(dx, dz);
              // Update repair progress
              updateRepairProgress(assignedBreakdown.id, REPAIR_RATE * cappedDelta);
            }

            // Update position registry - throttled
            if ((getGlobalFrameCount() + throttleOffset) % 2 === 0) {
              positionRegistry.register(
                data.id,
                ref.current.position.x,
                ref.current.position.z,
                'worker',
                undefined,
                undefined,
                undefined,
                ref.current.position.y
              );
            }
            return; // Skip normal behavior during repair
          }
        }

        // Clear repair ref if no active breakdown assigned
        if (!assignedBreakdown) {
          currentRepairIdRef.current = null;
        }
      }

      // Update cached settings every 60 frames (~1 second at 60fps)
      // Use offset to distribute this check across frames for different workers
      workerSettingsCacheFrameRef.current++;
      if ((workerSettingsCacheFrameRef.current + throttleOffset) % 60 === 0) {
        const graphics = useGraphicsStore.getState().graphics;
        cachedThrottleLevelRef.current = getThrottleLevel(graphics.quality);
      }

      // Frame throttling for performance - position updates don't need 60fps
      if (!shouldRunThisFrame(cachedThrottleLevelRef.current, throttleOffset)) {
        return; // Skip this frame
      }

      // Cap delta to prevent huge jumps (max 100ms)
      const cappedDelta = Math.min(delta, 0.1);

      // Get graphics quality for conditional skips
      const graphicsQuality = useGraphicsStore.getState().graphics.quality;
      const isLowQuality = graphicsQuality === 'low';

      // Calculate camera distance for animation LOD (skip on LOW quality)
      if (!isLowQuality) {
        cameraDistanceRef.current = state.camera.position.distanceTo(ref.current.position);

        // Update LOD tier for rendering (with hysteresis to prevent flickering)
        // High: < 25 units, Medium: 25-55 units, Low: > 55 units
        // Use ref to avoid re-renders every frame, only update state when LOD changes
        const dist = cameraDistanceRef.current;
        let newLod = lodRef.current;

        if (lodRef.current === 'high' && dist > 30) {
          newLod = 'medium';
        } else if (lodRef.current === 'medium' && dist < 25) {
          newLod = 'high';
        } else if (lodRef.current === 'medium' && dist > 55) {
          newLod = 'low';
        } else if (lodRef.current === 'low' && dist < 45) {
          newLod = 'medium';
        }

        // Only trigger re-render when LOD actually changes
        if (newLod !== lodRef.current) {
          lodRef.current = newLod;
          setLod(newLod);
        }
      } else {
        // On LOW quality, always use 'low' LOD tier and set once
        if (lodRef.current !== 'low') {
          lodRef.current = 'low';
          setLod('low');
        }
      }

      // === FATIGUE CALCULATION (skip on LOW quality) ===
      if (isLowQuality) {
        // Skip expensive calculations on LOW quality - jump to basic movement
        // Just do simple walk animation update
        const movementSpeed = 1.5;

        // Throttled forklift safety check (every 10 frames)
        if ((getGlobalFrameCount() + throttleOffset) % 10 === 0) {
          const nearestForklift = positionRegistry.getNearestForklift(
            ref.current.position.x,
            ref.current.position.z,
            5 // Check within 5 units
          );
          if (nearestForklift) {
            const dx = nearestForklift.x - ref.current.position.x;
            const dz = nearestForklift.z - ref.current.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist < 3) {
              // Forklift very close - reverse direction to get away
              directionRef.current *= -1;
              ref.current.rotation.y += Math.PI;
            } else if (dist < 5) {
              // Forklift nearby - pause movement this frame
              walkCycleRef.current += cappedDelta * movementSpeed * 0.5; // Slow walk
              return;
            }
          }
        }

        // Simple back-and-forth walk without collision detection
        ref.current.position.z += directionRef.current * movementSpeed * cappedDelta;

        // Reverse at boundaries
        if (ref.current.position.z > 35 || ref.current.position.z < -35) {
          directionRef.current *= -1;
          ref.current.rotation.y += Math.PI;
        }

        // Update walk cycle for leg movement
        walkCycleRef.current += cappedDelta * movementSpeed * 3;

        return; // Skip all the expensive stuff below on LOW quality
      }

      // === FATIGUE CALCULATION ===
      // Fatigue increases slowly over time (full fatigue after ~10 min of real time, scaled to game time)
      const shiftDuration = (Date.now() - shiftStartRef.current) / 1000; // seconds
      const baseFatigue = Math.min(shiftDuration / 600, 0.8); // Max 80% fatigue from time
      // Reduce fatigue if on break
      if (data.status === 'break') {
        fatigueRef.current = Math.max(0, fatigueRef.current - cappedDelta * 0.1);
        shiftStartRef.current = Date.now(); // Reset shift timer on break
      } else {
        fatigueRef.current = baseFatigue;
      }

      // === ALERT REACTION ===
      // Check for active (non-acknowledged) critical/warning alerts and look toward them
      const activeAlerts = alerts.filter(
        (a) => !a.acknowledged && (a.type === 'critical' || a.type === 'warning')
      );
      if (activeAlerts.length > 0 && !isEvadingRef.current) {
        // Find nearest alert by machine position (approximate positions based on machine zones)
        const machinePositions: Record<string, { x: number; z: number }> = {
          silo: { x: 0, z: -22 },
          mill: { x: 0, z: -6 },
          packer: { x: 0, z: 25 },
          default: { x: 0, z: 0 },
        };
        const machineId = activeAlerts[0].machineId?.toLowerCase() ?? '';
        const alertPos =
          machinePositions[
            machineId.includes('silo')
              ? 'silo'
              : machineId.includes('mill') || machineId.includes('rm')
                ? 'mill'
                : machineId.includes('packer')
                  ? 'packer'
                  : 'default'
          ];
        const dx = alertPos.x - ref.current.position.x;
        const dz = alertPos.z - ref.current.position.z;
        const bodyAngle = directionRef.current > 0 ? 0 : Math.PI;
        alertDirectionRef.current = Math.atan2(dx, dz) - bodyAngle;
      } else {
        alertDirectionRef.current = undefined;
      }

      // === NEARBY WORKER DETECTION (throttled) ===
      if (frameCountRef.current % 30 === 0 && isIdleRef.current) {
        // Check every ~0.5s when idle
        const nearbyWorker = positionRegistry.getNearestWorker(
          ref.current.position.x,
          ref.current.position.z,
          5, // 5 unit range
          data.id,
          ref.current.position.y
        );
        if (nearbyWorker) {
          const dx = nearbyWorker.x - ref.current.position.x;
          const dz = nearbyWorker.z - ref.current.position.z;
          const bodyAngle = directionRef.current > 0 ? 0 : Math.PI;
          nearbyWorkerDirRef.current = Math.atan2(dx, dz) - bodyAngle;
        } else {
          nearbyWorkerDirRef.current = undefined;
        }
      } else if (!isIdleRef.current) {
        nearbyWorkerDirRef.current = undefined;
      }

      // === SPECIAL ACTION DETERMINATION ===
      // Priority: emergency > break sitting > celebrating > pointing > carrying > normal
      const hasCriticalAlert = alerts.some((a) => !a.acknowledged && a.type === 'critical');
      const isOnBreak = data.status === 'break';
      const isSupervisor = data.role === 'Supervisor';

      // Celebration: triggered when efficiency hits 100% (check every 2 seconds)
      if (frameCountRef.current % 120 === 0) {
        // PERF: Access store directly to avoid re-renders
        const currentEfficiency = useProductionStore.getState().metrics.efficiency;
        if (currentEfficiency >= 100 && celebrationTimerRef.current <= 0) {
          celebrationTimerRef.current = 3; // Celebrate for 3 seconds
        }
      }
      if (celebrationTimerRef.current > 0) {
        celebrationTimerRef.current -= cappedDelta;
        specialActionRef.current = 'celebrating';
      } else if (hasCriticalAlert && data.role === 'Safety Officer') {
        // Safety officers run during critical alerts
        specialActionRef.current = 'running';
      } else if (isOnBreak && isIdleRef.current) {
        // Sitting during break when idle
        specialActionRef.current = 'sitting';
      } else if (isSupervisor && isIdleRef.current && nearbyWorkerDirRef.current !== undefined) {
        // Supervisors point when giving directions to nearby workers
        specialActionRef.current = 'pointing';
        pointDirectionRef.current = nearbyWorkerDirRef.current;
      } else if (data.role === 'Maintenance' && !isIdleRef.current && Math.random() < 0.001) {
        // Maintenance occasionally carries things (very rare trigger per frame)
        specialActionRef.current = 'carrying';
      } else {
        specialActionRef.current = 'none';
      }

      const FORKLIFT_DETECTION_RANGE = 8; // How far away to detect forklifts
      const EVADE_DISTANCE = 3; // How far to step aside
      const EVADE_SPEED = 4; // How fast to move sideways

      // Throttle expensive forklift detection to every 3 frames (~20Hz instead of 60Hz)
      frameCountRef.current++;
      const shouldCheckForForklifts = frameCountRef.current % 3 === 0;

      let nearestForklift: EntityPosition | null;

      if (shouldCheckForForklifts) {
        nearestForklift = positionRegistry.getNearestForklift(
          ref.current.position.x,
          ref.current.position.z,
          FORKLIFT_DETECTION_RANGE,
          ref.current.position.y
        );
        lastForkliftCheckRef.current = nearestForklift;
      } else {
        nearestForklift = lastForkliftCheckRef.current;
      }

      // Calculate head rotation to look at forklift (uses ref instead of state for performance)
      if (nearestForklift) {
        const dx = nearestForklift.x - ref.current.position.x;
        const dz = nearestForklift.z - ref.current.position.z;
        const distanceToForklift = Math.sqrt(dx * dx + dz * dz);

        // Startled when forklift is very close (under 3 units) and approaching
        const isApproaching = positionRegistry.isForkliftApproaching(
          ref.current.position.x,
          ref.current.position.z,
          nearestForklift
        );
        isStartledRef.current = distanceToForklift < 3 && isApproaching;

        // Calculate angle to forklift, relative to worker's body direction
        const angleToForklift = Math.atan2(dx, dz);
        const bodyAngle = directionRef.current > 0 ? 0 : Math.PI;
        let relativeAngle = angleToForklift - bodyAngle;
        // Clamp head rotation to realistic range (-90 to +90 degrees)
        relativeAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, relativeAngle));
        // Smoothly interpolate head rotation via ref (no re-render)
        headRotationRef.current = THREE.MathUtils.lerp(headRotationRef.current, relativeAngle, 0.1);
      } else {
        // Smoothly return to 0
        headRotationRef.current = THREE.MathUtils.lerp(headRotationRef.current, 0, 0.1);
        isStartledRef.current = false;
      }

      // Determine if we need to evade
      if (
        nearestForklift &&
        positionRegistry.isForkliftApproaching(
          ref.current.position.x,
          ref.current.position.z,
          nearestForklift
        )
      ) {
        if (!isEvadingRef.current) {
          // Decide which direction to evade (away from forklift's path)
          // Use cross product to determine which side of the forklift's path we're on
          const toWorkerX = ref.current.position.x - nearestForklift.x;
          const toWorkerZ = ref.current.position.z - nearestForklift.z;
          const crossProduct =
            (nearestForklift.dirX || 0) * toWorkerZ - (nearestForklift.dirZ || 0) * toWorkerX;
          const preferredDirection = crossProduct > 0 ? 1 : -1;

          // Check if preferred evasion direction is clear of obstacles
          const preferredTargetX = ref.current.position.x + preferredDirection * EVADE_DISTANCE;
          const alternateTargetX = ref.current.position.x + -preferredDirection * EVADE_DISTANCE;

          const preferredClear = !positionRegistry.isInsideObstacle(
            preferredTargetX,
            ref.current.position.z,
            OBSTACLE_PADDING
          );
          const alternateClear = !positionRegistry.isInsideObstacle(
            alternateTargetX,
            ref.current.position.z,
            OBSTACLE_PADDING
          );

          if (preferredClear) {
            evadeDirectionRef.current = preferredDirection;
            isEvadingRef.current = true;
          } else if (alternateClear) {
            // Preferred direction blocked, try the other way
            evadeDirectionRef.current = -preferredDirection;
            isEvadingRef.current = true;
          } else {
            // Both directions blocked - stay put, forklift will stop for us
            evadeDirectionRef.current = 0;
            isEvadingRef.current = false;
          }
        }

        // Move sideways to evade (only if we have a valid direction)
        if (evadeDirectionRef.current !== 0) {
          const targetX = baseXRef.current + evadeDirectionRef.current * EVADE_DISTANCE;
          // Double-check the next position won't be inside an obstacle
          const nextX =
            ref.current.position.x +
            Math.sign(targetX - ref.current.position.x) * EVADE_SPEED * cappedDelta;
          if (
            !positionRegistry.isInsideObstacle(
              nextX,
              ref.current.position.z,
              OBSTACLE_PADDING * 0.5
            )
          ) {
            const diffX = targetX - ref.current.position.x;
            if (Math.abs(diffX) > 0.1) {
              ref.current.position.x = nextX;
            }
          }
        }

        // Slow down forward movement while evading
        walkCycleRef.current += cappedDelta * 2;
      } else {
        // Cooldown before clearing evade state and returning to path
        if (isEvadingRef.current) {
          evadeCooldownRef.current = EVADE_COOLDOWN_TIME; // Start cooldown when we stop evading
          isEvadingRef.current = false;
        }

        // Count down the cooldown timer
        if (evadeCooldownRef.current > 0) {
          evadeCooldownRef.current -= cappedDelta;
        }

        // Note: Return to original path is handled in obstacle avoidance section below

        // Idle behavior management
        if (isIdleRef.current) {
          idleDurationRef.current -= cappedDelta;
          if (idleDurationRef.current <= 0) {
            isIdleRef.current = false;
            idleTimerRef.current = Math.random() * 12 + 8; // 8-20s until next idle
          }
          // Slow breathing animation while idle
          walkCycleRef.current += cappedDelta * 0.5;
        } else {
          idleTimerRef.current -= cappedDelta;
          if (idleTimerRef.current <= 0) {
            isIdleRef.current = true;
            idleDurationRef.current = Math.random() * 4 + 2; // Idle for 2-6s
          }
          // Normal walking animation
          walkCycleRef.current += cappedDelta * 5.5;
        }
      }

      // === OBSTACLE AVOIDANCE ===
      // Check for obstacles ahead (only when not evading forklift and not idle)
      if (!isEvadingRef.current && !isIdleRef.current) {
        const obstacleAhead = positionRegistry.getObstacleAhead(
          ref.current.position.x,
          ref.current.position.z,
          directionRef.current,
          OBSTACLE_DETECTION_RANGE,
          OBSTACLE_PADDING
        );

        if (obstacleAhead) {
          // Start avoiding if not already avoiding this obstacle
          if (!isAvoidingObstacleRef.current || currentObstacleRef.current !== obstacleAhead.id) {
            isAvoidingObstacleRef.current = true;
            currentObstacleRef.current = obstacleAhead.id;
            // Calculate which side to go around
            avoidanceTargetXRef.current = positionRegistry.findClearPath(
              ref.current.position.x,
              ref.current.position.z,
              obstacleAhead.id,
              OBSTACLE_PADDING + 0.5
            );
          }
        } else if (isAvoidingObstacleRef.current) {
          // No obstacle ahead, clear avoidance state
          // Check if we've passed the obstacle before returning to original path
          const stillNearObstacle = positionRegistry.isInsideObstacle(
            ref.current.position.x,
            ref.current.position.z,
            OBSTACLE_PADDING + 1.0
          );
          if (!stillNearObstacle) {
            isAvoidingObstacleRef.current = false;
            currentObstacleRef.current = null;
          }
        }
      }

      // Apply obstacle avoidance movement (move toward avoidance target X)
      if (isAvoidingObstacleRef.current && !isEvadingRef.current) {
        const diffX = avoidanceTargetXRef.current - ref.current.position.x;
        if (Math.abs(diffX) > 0.15) {
          ref.current.position.x += Math.sign(diffX) * AVOIDANCE_SPEED * cappedDelta;
        }
      } else if (
        !isEvadingRef.current &&
        evadeCooldownRef.current <= 0 &&
        !isAvoidingObstacleRef.current
      ) {
        // Return to base path when not avoiding anything
        const diffX = baseXRef.current - ref.current.position.x;
        if (Math.abs(diffX) > 0.15) {
          ref.current.position.x += Math.sign(diffX) * AVOIDANCE_SPEED * 0.5 * cappedDelta;
        }
      }

      // Move worker (skip movement when idle)
      const bobHeight = isIdleRef.current ? 0 : Math.abs(Math.sin(walkCycleRef.current)) * 0.025;
      if (!isIdleRef.current) {
        // Check if next position would be inside an obstacle
        const nextZ = ref.current.position.z + data.speed * cappedDelta * directionRef.current;
        const wouldHitObstacle = positionRegistry.isInsideObstacle(
          ref.current.position.x,
          nextZ,
          OBSTACLE_PADDING
        );

        if (!wouldHitObstacle) {
          ref.current.position.z = nextZ;
        } else {
          // Stop and wait for avoidance to take effect, or turn around
          if (!isAvoidingObstacleRef.current) {
            directionRef.current *= -1;
          }
        }

        // Trigger footstep sounds at each step (when sin crosses 0)
        const currentStep = Math.floor(walkCycleRef.current / Math.PI);
        if (currentStep !== lastStepRef.current) {
          lastStepRef.current = currentStep;
          audioManager.playFootstep(data.id);
        }
      }
      ref.current.position.y = bobHeight;
      ref.current.rotation.y = directionRef.current > 0 ? 0 : Math.PI;

      // Register position for collision avoidance
      positionRegistry.register(
        data.id,
        ref.current.position.x,
        ref.current.position.z,
        'worker',
        undefined,
        undefined,
        undefined,
        ref.current.position.y
      );

      // Record heat map point (throttled to every 60 frames ~1sec to avoid performance issues)
      if (frameCountRef.current % 60 === 0) {
        recordHeatMapPoint(ref.current.position.x, ref.current.position.z);
      }

      // Enforce exclusion zones - push workers away from truck yards
      if (isInExclusionZone(ref.current.position.x, ref.current.position.z)) {
        // Push worker back to safe z position
        ref.current.position.z = getSafeZPosition(ref.current.position.z);
        // Turn around when pushed
        if (ref.current.position.z >= 35) {
          directionRef.current = -1; // Walk backward (away from shipping)
        } else if (ref.current.position.z <= -35) {
          directionRef.current = 1; // Walk forward (away from receiving)
        }
      }

      // Turn around at safe boundaries (inside factory, away from truck yards)
      if (ref.current.position.z > 35 || ref.current.position.z < -35) {
        directionRef.current *= -1;
      }

      // Keep x position within safe central zone (wider factory floor)
      if (ref.current.position.x > 45) {
        ref.current.position.x = 45;
      } else if (ref.current.position.x < -45) {
        ref.current.position.x = -45;
      }
    });

    const getRoleIcon = () => {
      const iconClass = 'w-6 h-6';
      switch (data.role) {
        case 'Supervisor':
          return <Briefcase className={iconClass} />;
        case 'Engineer':
          return <WrenchIcon className={iconClass} />;
        case 'Operator':
          return <HardHat className={iconClass} />;
        case 'Safety Officer':
          return <Shield className={iconClass} />;
        case 'Quality Control':
          return <FlaskConical className={iconClass} />;
        case 'Maintenance':
          return <WrenchIcon className={iconClass} />;
        default:
          return <User className={iconClass} />;
      }
    };

    const statusColor = getWorkerStatusColor(data.status);

    // Visual content for the worker
    const workerContent = (
      <group
        ref={ref}
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
          onSelect();
        }}
      >
        {/* Human Model - 3-tier LOD system */}
        {lod === 'high' ? (
          <HumanModel
            walkCycleRef={walkCycleRef}
            uniformColor={appearance.uniformColor}
            skinTone={appearance.skinTone}
            hatColor={appearance.hatColor}
            hasVest={appearance.hasVest}
            pantsColor={appearance.pantsColor}
            headRotation={headRotationRef.current}
            hairColor={appearance.hairColor}
            hairStyle={appearance.hairStyle}
            tool={appearance.tool}
            role={data.role}
            isWaving={isWaving}
            isIdle={isIdleRef.current}
            isStartled={isStartledRef.current}
            alertDirection={alertDirectionRef.current}
            fatigueLevel={fatigueRef.current}
            nearbyWorkerDirection={nearbyWorkerDirRef.current}
            specialAction={specialActionRef.current}
            pointDirection={pointDirectionRef.current}
            distanceToCamera={cameraDistanceRef.current}
          />
        ) : lod === 'medium' ? (
          <SimplifiedWorker
            walkCycleRef={walkCycleRef}
            uniformColor={appearance.uniformColor}
            skinTone={appearance.skinTone}
            hatColor={appearance.hatColor}
            hasVest={appearance.hasVest}
            pantsColor={appearance.pantsColor}
          />
        ) : (
          <WorkerBillboard
            uniformColor={appearance.uniformColor}
            hasVest={appearance.hasVest}
            hatColor={appearance.hatColor}
          />
        )}

        {/* Strategic AI Recommendation Highlight Ring - Animated */}
        <RecommendedWorkerRing visible={isRecommended} />

        {/* Worker Fatigue/Energy Indicator */}
        <FatigueIndicator energy={data.energy || 100} visible={true} />

        {/* BAS Autonomy Level Indicator - Shows worker autonomy based on BAS axes */}
        <AutonomyIndicator visible={true} workerId={data.id} />

        {/* BAS Flourishing Indicator - Shows worker wellbeing (medium+ quality only) */}
        <FlourishingIndicator workerId={data.id} />

        {/* Status indicator above head */}
        <group position={[0, 2.15, 0]}>
          <mesh>
            <sphereGeometry args={[0.055]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={2.5}
              toneMapped={false}
            />
          </mesh>
          {/* Pulsing ring */}
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.07, 0.085, 20]} />
            <meshStandardMaterial
              color={statusColor}
              emissive={statusColor}
              emissiveIntensity={1.5}
              transparent
              opacity={0.6}
              toneMapped={false}
            />
          </mesh>
        </group>

        {/* Floating name tag when hovered */}
        {hovered && (
          <Html position={[0, 2.6, 0]} center distanceFactor={12}>
            <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-500/50 px-4 py-3 rounded-xl shadow-2xl pointer-events-none min-w-[220px]">
              <div className="flex items-center gap-3 mb-2">
                {getRoleIcon()}
                <div>
                  <div className="font-bold text-white text-sm">{data.name}</div>
                  <div className="text-xs text-blue-400">{data.role}</div>
                </div>
              </div>
              <div className="text-xs text-slate-400 border-t border-slate-700/50 pt-2 mt-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: statusColor }}
                  />
                  <span className="text-slate-300">{data.currentTask}</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 mt-2 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                  />
                </svg>
                Click for details
              </div>
            </div>
          </Html>
        )}

        {/* Always visible name badge */}
        <Billboard position={[0, 2.4, 0]}>
          <Text
            fontSize={0.14}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#000000"
          >
            {data.name.split(' ')[0]}
          </Text>
        </Billboard>

        {/* ID badge on chest */}
        <group position={[0.12, 1.28, 0.125]} rotation={[0, 0, 0]}>
          <mesh>
            <planeGeometry args={[0.09, 0.06]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[0, 0.012, 0.001]}>
            <planeGeometry args={[0.07, 0.015]} />
            <meshStandardMaterial color="#1e40af" />
          </mesh>
          <mesh position={[0, -0.012, 0.001]}>
            <planeGeometry args={[0.06, 0.008]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        </group>

        {/* Theme Hospital-inspired mood overlay with speech bubbles */}
        <WorkerMoodOverlay workerId={data.id} position={[0, 0, 0]} />

        {/* Reaction animations (slipping, coughing) */}
        <WorkerReactionOverlay workerId={data.id} position={[0, 0, 0]} />
      </group>
    );

    // When physics is enabled, wrap in PhysicsWorker for collision/movement
    if (enablePhysics) {
      return (
        <PhysicsWorker
          data={data}
          onPositionUpdate={handlePhysicsPositionUpdate}
          onDirectionUpdate={handlePhysicsDirectionUpdate}
        >
          {workerContent}
        </PhysicsWorker>
      );
    }

    // Legacy mode - no physics wrapper
    return workerContent;
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if worker ID or status changed
    // Position updates are handled via refs in useFrame, not props
    return (
      prevProps.data.id === nextProps.data.id &&
      prevProps.data.status === nextProps.data.status &&
      prevProps.onSelect === nextProps.onSelect
    );
  }
);
