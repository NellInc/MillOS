/**
 * Maintenance System
 *
 * Handles visible maintenance activities:
 * - Sweeping (dust cleanup)
 * - Oiling machines
 * - Watering plants
 *
 * Also handles worker reactions to chaos events:
 * - Slipping on grain spills
 * - Coughing in dust clouds
 *
 * PERFORMANCE: Consolidated from 6 separate useFrame hooks into 1 centralized manager
 */

import React, { useRef, useMemo, useEffect, useCallback, createContext, useContext } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useShallow } from 'zustand/react/shallow';
import { WORKER_ROSTER } from '../types';

// =========================================================================
// ANIMATION MANAGER - Single useFrame for all maintenance animations
// =========================================================================

type MaintenanceRefType = 'sweeping' | 'watering' | 'oiling' | 'slip_effect' | 'cough_effect';

interface MaintenanceRefs {
  type: MaintenanceRefType;
  id: string;
  // Sweeping refs
  groupRef?: React.RefObject<THREE.Group | null>;
  broomRef?: React.RefObject<THREE.Group | null>;
  sweepPhaseRef?: React.MutableRefObject<number>;
  positionRef?: React.MutableRefObject<THREE.Vector3>;
  targetRef?: React.MutableRefObject<THREE.Vector3>;
  directionRef?: React.MutableRefObject<THREE.Vector3>;
  // Watering refs
  canRef?: React.RefObject<THREE.Group | null>;
  waterRef?: React.RefObject<THREE.Points | null>;
  pourPhaseRef?: React.MutableRefObject<number>;
  plantPosition?: [number, number, number];
  // Oiling refs
  squeezePhaseRef?: React.MutableRefObject<number>;
  machinePosition?: [number, number, number];
  // Slip effect refs
  phaseRef?: React.MutableRefObject<number>;
  // Cough effect refs
  puffsRef?: React.MutableRefObject<THREE.Mesh[]>;
  phases?: number[];
}

type RegisterMaintenanceFn = (refs: MaintenanceRefs) => void;
type UnregisterMaintenanceFn = (id: string) => void;

const MaintenanceAnimationContext = createContext<{
  register: RegisterMaintenanceFn;
  unregister: UnregisterMaintenanceFn;
} | null>(null);

const useMaintenanceAnimation = () => {
  const ctx = useContext(MaintenanceAnimationContext);
  if (!ctx)
    throw new Error('useMaintenanceAnimation must be used within MaintenanceAnimationManager');
  return ctx;
};

// =========================================================================
// ANIMATION FUNCTIONS - Pure functions for each maintenance type
// =========================================================================

function animateSweeping(refs: MaintenanceRefs, delta: number): void {
  if (!refs.groupRef?.current || !refs.broomRef?.current) return;
  if (!refs.positionRef || !refs.targetRef || !refs.sweepPhaseRef || !refs.directionRef) return;

  // Move toward target slowly
  refs.positionRef.current.lerp(refs.targetRef.current, delta * 0.3);
  refs.groupRef.current.position.copy(refs.positionRef.current);

  // Face movement direction
  const dir = refs.directionRef.current.copy(refs.targetRef.current).sub(refs.positionRef.current);
  if (dir.length() > 0.1) {
    refs.groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);
  }

  // Sweeping animation - back and forth
  refs.sweepPhaseRef.current += delta * 4;
  const sweepAngle = Math.sin(refs.sweepPhaseRef.current) * 0.4;
  refs.broomRef.current.rotation.y = sweepAngle;
  refs.broomRef.current.position.x = Math.sin(refs.sweepPhaseRef.current) * 0.15;
}

function animateWatering(refs: MaintenanceRefs, delta: number): void {
  if (!refs.groupRef?.current || !refs.canRef?.current || !refs.plantPosition) return;
  if (!refs.directionRef || !refs.pourPhaseRef) return;

  // Face the plant
  const dir = refs.directionRef.current
    .set(...refs.plantPosition)
    .sub(refs.groupRef.current.position);
  refs.groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);

  // Tilt watering can
  refs.pourPhaseRef.current += delta * 2;
  const tiltAmount = Math.sin(refs.pourPhaseRef.current * 0.5) * 0.1 + 0.5;
  refs.canRef.current.rotation.z = -tiltAmount;

  // Animate water droplets
  if (refs.waterRef?.current) {
    const geo = refs.waterRef.current.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) - delta * 0.5;
      if (y < -0.4) y = 0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }
}

function animateOiling(refs: MaintenanceRefs, delta: number): void {
  if (!refs.groupRef?.current || !refs.canRef?.current || !refs.machinePosition) return;
  if (!refs.directionRef || !refs.squeezePhaseRef) return;

  // Face the machine
  const dir = refs.directionRef.current
    .set(...refs.machinePosition)
    .sub(refs.groupRef.current.position);
  refs.groupRef.current.rotation.y = Math.atan2(dir.x, dir.z);

  // Squeeze animation
  refs.squeezePhaseRef.current += delta * 3;
  const squeeze = Math.sin(refs.squeezePhaseRef.current) * 0.1;
  refs.canRef.current.scale.x = 1 - Math.abs(squeeze);
  refs.canRef.current.scale.z = 1 - Math.abs(squeeze);
}

function animateSlipEffect(refs: MaintenanceRefs, delta: number): void {
  if (!refs.groupRef?.current || !refs.phaseRef) return;

  refs.phaseRef.current += delta * 8;
  refs.groupRef.current.rotation.z = Math.sin(refs.phaseRef.current) * 0.3;
  refs.groupRef.current.position.y = 1.5 + Math.sin(refs.phaseRef.current * 2) * 0.1;
}

function animateCoughEffect(refs: MaintenanceRefs, state: RootState): void {
  if (!refs.puffsRef?.current || !refs.phases) return;

  refs.puffsRef.current.forEach((ref, i) => {
    if (!ref) return;
    const phase = (state.clock.elapsedTime * 2 + refs.phases![i]) % 1;

    // Puffs expand and fade as they move outward
    ref.position.z = 0.3 + phase * 0.4;
    ref.position.y = 1.4 + phase * 0.2;
    ref.scale.setScalar(0.05 + phase * 0.1);
    (ref.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.6;
  });
}

// =========================================================================
// MAINTENANCE ANIMATION MANAGER - Single useFrame for all effects
// =========================================================================

const MaintenanceAnimationManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const maintenanceRefsMap = useRef<Map<string, MaintenanceRefs>>(new Map());
  const frameCountRef = useRef(0);
  const lastChaosCheckRef = useRef(0);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const { chaosEvents, triggerWorkerReaction } = useWorkerMoodStore(
    useShallow((state) => ({
      chaosEvents: state.chaosEvents,
      triggerWorkerReaction: state.triggerWorkerReaction,
    }))
  );

  const register = useCallback<RegisterMaintenanceFn>((refs) => {
    maintenanceRefsMap.current.set(refs.id, refs);
  }, []);

  const unregister = useCallback<UnregisterMaintenanceFn>((id) => {
    maintenanceRefsMap.current.delete(id);
  }, []);

  // Single useFrame for ALL maintenance animations (consolidates 6 hooks into 1)
  useFrame((state, delta) => {
    if (!isTabVisible) return;
    frameCountRef.current++;
    if (frameCountRef.current % 3 !== 0) return; // Throttle to ~20fps

    maintenanceRefsMap.current.forEach((refs) => {
      switch (refs.type) {
        case 'sweeping':
          animateSweeping(refs, delta);
          break;
        case 'watering':
          animateWatering(refs, delta);
          break;
        case 'oiling':
          animateOiling(refs, delta);
          break;
        case 'slip_effect':
          animateSlipEffect(refs, delta);
          break;
        case 'cough_effect':
          animateCoughEffect(refs, state);
          break;
      }
    });

    // Chaos reactions check (every 500ms)
    const now = Date.now();
    if (now - lastChaosCheckRef.current >= 500) {
      lastChaosCheckRef.current = now;

      // Get environment state for dust-based reactions
      const { factoryEnvironment } = useWorkerMoodStore.getState();

      chaosEvents.forEach((event) => {
        if (event.resolved) return;

        WORKER_ROSTER.forEach((worker) => {
          // Probability increases with severity - more noticeable reactions
          const baseProbability =
            event.severity === 'dramatic' ? 0.12 : event.severity === 'moderate' ? 0.08 : 0.05;

          if (event.affectedWorkerIds.includes(worker.id) && Math.random() < baseProbability) {
            if (event.type === 'grain_spill' || event.type === 'mysterious_puddle') {
              // Both grain spills and mysterious puddles cause slipping
              triggerWorkerReaction(worker.id, 'slipping', 1500);
            } else if (event.type === 'dust_cloud') {
              triggerWorkerReaction(worker.id, 'coughing', 2000);
            }
          }
        });
      });

      // Environmental dust triggers coughing even without a dust_cloud event
      // High dust level (>60) has a small chance to make any worker cough
      if (factoryEnvironment.dustLevel > 60) {
        const dustCoughProbability = (factoryEnvironment.dustLevel - 60) / 400; // 0.1% at 60, 10% at 100
        WORKER_ROSTER.forEach((worker) => {
          if (Math.random() < dustCoughProbability) {
            triggerWorkerReaction(worker.id, 'coughing', 1500);
          }
        });
      }
    }
  });

  const contextValue = useMemo(() => ({ register, unregister }), [register, unregister]);

  return (
    <MaintenanceAnimationContext.Provider value={contextValue}>
      {children}
    </MaintenanceAnimationContext.Provider>
  );
};

// =========================================================================
// MAINTENANCE WORKER WITH BROOM (Sweeping Animation)
// =========================================================================
interface SweepingWorkerProps {
  position: [number, number, number];
  targetPosition: [number, number, number];
  taskId: string;
}

const SweepingWorker: React.FC<SweepingWorkerProps> = React.memo(
  ({ position, targetPosition, taskId }) => {
    const { register, unregister } = useMaintenanceAnimation();
    const groupRef = useRef<THREE.Group>(null);
    const broomRef = useRef<THREE.Group>(null);
    const sweepPhaseRef = useRef(0);
    const positionRef = useRef(new THREE.Vector3(...position));
    const targetRef = useRef(new THREE.Vector3(...targetPosition));
    const directionRef = useRef(new THREE.Vector3());

    // Register with animation manager
    useEffect(() => {
      register({
        type: 'sweeping',
        id: `sweeping-${taskId}`,
        groupRef,
        broomRef,
        sweepPhaseRef,
        positionRef,
        targetRef,
        directionRef,
      });
      return () => unregister(`sweeping-${taskId}`);
    }, [register, unregister, taskId]);

    return (
      <group ref={groupRef} position={position}>
        {/* Simple maintenance worker body */}
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.15, 0.5, 4, 8]} />
          <meshStandardMaterial color="#f97316" roughness={0.8} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#d4a574" roughness={0.9} />
        </mesh>

        {/* Hard hat */}
        <mesh position={[0, 1.62, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.16, 0.08, 12]} />
          <meshStandardMaterial color="#eab308" roughness={0.6} />
        </mesh>

        {/* Broom */}
        <group ref={broomRef} position={[0.2, 0.6, 0.3]}>
          {/* Handle */}
          <mesh rotation={[0.3, 0, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 1.2, 8]} />
            <meshStandardMaterial color="#8b4513" roughness={0.9} />
          </mesh>
          {/* Bristles */}
          <mesh position={[0, -0.5, 0.1]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.15, 0.08, 0.12]} />
            <meshStandardMaterial color="#d4a574" roughness={1} />
          </mesh>
        </group>
      </group>
    );
  }
);
SweepingWorker.displayName = 'SweepingWorker';

// =========================================================================
// WATERING CAN ANIMATION
// =========================================================================
interface WateringWorkerProps {
  position: [number, number, number];
  plantPosition: [number, number, number];
  taskId: string;
}

const WateringWorker: React.FC<WateringWorkerProps> = React.memo(
  ({ position, plantPosition, taskId }) => {
    const { register, unregister } = useMaintenanceAnimation();
    const groupRef = useRef<THREE.Group>(null);
    const canRef = useRef<THREE.Group>(null);
    const waterRef = useRef<THREE.Points>(null);
    const pourPhaseRef = useRef(0);
    const directionRef = useRef(new THREE.Vector3());

    // Water droplet positions
    const waterPositions = useMemo(() => {
      const arr = new Float32Array(15 * 3);
      for (let i = 0; i < 15; i++) {
        arr[i * 3] = (Math.random() - 0.5) * 0.1;
        arr[i * 3 + 1] = -Math.random() * 0.3;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
      }
      return arr;
    }, []);

    // Register with animation manager
    useEffect(() => {
      register({
        type: 'watering',
        id: `watering-${taskId}`,
        groupRef,
        canRef,
        waterRef,
        pourPhaseRef,
        directionRef,
        plantPosition,
      });
      return () => unregister(`watering-${taskId}`);
    }, [register, unregister, taskId, plantPosition]);

    return (
      <group ref={groupRef} position={position}>
        {/* Worker body */}
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.15, 0.5, 4, 8]} />
          <meshStandardMaterial color="#22c55e" roughness={0.8} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#e0ac69" roughness={0.9} />
        </mesh>

        {/* Watering can */}
        <group ref={canRef} position={[0.25, 1.0, 0.2]}>
          {/* Can body */}
          <mesh>
            <cylinderGeometry args={[0.08, 0.1, 0.15, 12]} />
            <meshStandardMaterial color="#22c55e" metalness={0.3} roughness={0.5} />
          </mesh>
          {/* Spout */}
          <mesh position={[0.1, 0.02, 0]} rotation={[0, 0, -0.5]}>
            <cylinderGeometry args={[0.015, 0.02, 0.12, 8]} />
            <meshStandardMaterial color="#22c55e" metalness={0.3} />
          </mesh>
          {/* Handle */}
          <mesh position={[-0.05, 0.1, 0]}>
            <torusGeometry args={[0.04, 0.01, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>

          {/* Water droplets */}
          <points ref={waterRef} position={[0.15, -0.05, 0]}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[waterPositions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#3b82f6" size={0.02} transparent opacity={0.7} sizeAttenuation />
          </points>
        </group>
      </group>
    );
  }
);
WateringWorker.displayName = 'WateringWorker';

// =========================================================================
// OILING ANIMATION
// =========================================================================
interface OilingWorkerProps {
  position: [number, number, number];
  machinePosition: [number, number, number];
  taskId: string;
}

const OilingWorker: React.FC<OilingWorkerProps> = React.memo(
  ({ position, machinePosition, taskId }) => {
    const { register, unregister } = useMaintenanceAnimation();
    const groupRef = useRef<THREE.Group>(null);
    const canRef = useRef<THREE.Group>(null);
    const squeezePhaseRef = useRef(0);
    const directionRef = useRef(new THREE.Vector3());

    // Register with animation manager
    useEffect(() => {
      register({
        type: 'oiling',
        id: `oiling-${taskId}`,
        groupRef,
        canRef,
        squeezePhaseRef,
        directionRef,
        machinePosition,
      });
      return () => unregister(`oiling-${taskId}`);
    }, [register, unregister, taskId, machinePosition]);

    return (
      <group ref={groupRef} position={position}>
        {/* Worker body - maintenance orange */}
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.15, 0.5, 4, 8]} />
          <meshStandardMaterial color="#ea580c" roughness={0.8} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#8d5524" roughness={0.9} />
        </mesh>

        {/* Safety glasses */}
        <mesh position={[0, 1.52, 0.1]}>
          <boxGeometry args={[0.18, 0.04, 0.02]} />
          <meshStandardMaterial color="#1a1a1a" transparent opacity={0.8} />
        </mesh>

        {/* Oil can */}
        <group ref={canRef} position={[0.2, 1.1, 0.25]} rotation={[0.3, 0, 0]}>
          {/* Can body */}
          <mesh>
            <cylinderGeometry args={[0.04, 0.05, 0.12, 12]} />
            <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
          {/* Long spout */}
          <mesh position={[0, 0.08, 0.06]} rotation={[-0.3, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.005, 0.15, 8]} />
            <meshStandardMaterial color="#1a1a1a" metalness={0.8} />
          </mesh>
          {/* Trigger */}
          <mesh position={[0, 0.03, -0.03]}>
            <boxGeometry args={[0.02, 0.04, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        </group>
      </group>
    );
  }
);
OilingWorker.displayName = 'OilingWorker';

// =========================================================================
// WORKER REACTION OVERLAY - Slip and Cough animations
// =========================================================================
interface WorkerReactionOverlayProps {
  workerId: string;
  position: [number, number, number];
}

export const WorkerReactionOverlay: React.FC<WorkerReactionOverlayProps> = React.memo(
  ({ workerId, position }) => {
    const reaction = useWorkerMoodStore((state) => state.workerReactions[workerId]);

    if (!reaction || reaction.reaction === 'none') return null;

    return (
      <group position={position}>
        {reaction.reaction === 'slipping' && <SlipEffect workerId={workerId} />}
        {reaction.reaction === 'coughing' && <CoughEffect workerId={workerId} />}
      </group>
    );
  }
);
WorkerReactionOverlay.displayName = 'WorkerReactionOverlay';

// Slip effect - motion lines and stars
// Falls back to standalone useFrame when not in MaintenanceAnimationManager context
const SlipEffect: React.FC<{ workerId: string }> = React.memo(({ workerId }) => {
  // Nullable context read (NOT the throwing useMaintenanceAnimation wrapper):
  // WorkerReactionOverlay mounts this from WorkerSystem, OUTSIDE the
  // MaintenanceAnimationManager provider. The component is built for that case
  // (the `if (ctx)` register guard + fallback useFrame below), but the throwing
  // wrapper turned the intended standalone path into a render crash that
  // unwound to the app-level ErrorBoundary and killed the whole scene.
  const ctx = useContext(MaintenanceAnimationContext);
  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef(0);
  const frameCountRef = useRef(0);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Memoize motion line heights to prevent NaN errors from Math.random() in geometry args
  const motionLineHeights = useMemo(
    () => [
      0.15 + Math.random() * 0.1,
      0.15 + Math.random() * 0.1,
      0.15 + Math.random() * 0.1,
      0.15 + Math.random() * 0.1,
      0.15 + Math.random() * 0.1,
    ],
    []
  );

  // Register with animation manager if available
  useEffect(() => {
    if (ctx) {
      ctx.register({
        type: 'slip_effect',
        id: `slip-${workerId}`,
        groupRef,
        phaseRef,
      });
      return () => ctx.unregister(`slip-${workerId}`);
    }
  }, [ctx, workerId]);

  // Fallback useFrame when not in context
  useFrame((_state, delta) => {
    if (ctx) return; // Manager handles animation
    if (!isTabVisible) return;
    frameCountRef.current++;
    if (frameCountRef.current % 3 !== 0) return;
    if (!groupRef.current) return;

    phaseRef.current += delta * 8;
    groupRef.current.rotation.z = Math.sin(phaseRef.current) * 0.3;
    groupRef.current.position.y = 1.5 + Math.sin(phaseRef.current * 2) * 0.1;
  });

  return (
    <group ref={groupRef}>
      {/* Motion lines */}
      {[-0.3, -0.15, 0, 0.15, 0.3].map((offset, i) => (
        <mesh key={i} position={[offset, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <planeGeometry args={[0.02, motionLineHeights[i]]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.8 - i * 0.15} />
        </mesh>
      ))}

      {/* Stars around head */}
      {[0, 1, 2].map((i) => {
        const angle = (i / 3) * Math.PI * 2;
        return (
          <mesh key={`star-${i}`} position={[Math.cos(angle) * 0.25, 0.2, Math.sin(angle) * 0.25]}>
            <octahedronGeometry args={[0.04]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        );
      })}
    </group>
  );
});
SlipEffect.displayName = 'SlipEffect';

// Cough effect - puff clouds
// Falls back to standalone useFrame when not in MaintenanceAnimationManager context
const CoughEffect: React.FC<{ workerId: string }> = React.memo(({ workerId }) => {
  // Nullable context read — see SlipEffect: mounted outside the provider by
  // WorkerReactionOverlay; null ctx selects the standalone fallback useFrame.
  const ctx = useContext(MaintenanceAnimationContext);
  const puffsRef = useRef<THREE.Mesh[]>([]);
  const phases = useMemo(() => [0, 0.3, 0.6], []);
  const frameCountRef = useRef(0);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Register with animation manager if available
  useEffect(() => {
    if (ctx) {
      ctx.register({
        type: 'cough_effect',
        id: `cough-${workerId}`,
        puffsRef,
        phases,
      });
      return () => ctx.unregister(`cough-${workerId}`);
    }
  }, [ctx, workerId, phases]);

  // Fallback useFrame when not in context
  useFrame((state) => {
    if (ctx) return; // Manager handles animation
    if (!isTabVisible) return;
    frameCountRef.current++;
    if (frameCountRef.current % 3 !== 0) return;

    puffsRef.current.forEach((ref, i) => {
      if (!ref) return;
      const phase = (state.clock.elapsedTime * 2 + phases[i]) % 1;
      ref.position.z = 0.3 + phase * 0.4;
      ref.position.y = 1.4 + phase * 0.2;
      ref.scale.setScalar(0.05 + phase * 0.1);
      (ref.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.6;
    });
  });

  return (
    <group>
      {phases.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) puffsRef.current[i] = el;
          }}
          position={[0, 1.4, 0.3]}
          scale={0.05}
        >
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color="#a0826d" transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
});
CoughEffect.displayName = 'CoughEffect';

// =========================================================================
// MAIN MAINTENANCE SYSTEM COMPONENT
// PERFORMANCE: Wraps all maintenance workers in MaintenanceAnimationManager
// to consolidate 6 separate useFrame hooks into 1 centralized manager
// =========================================================================
export const MaintenanceSystem: React.FC = () => {
  const { maintenanceTasks, factoryEnvironment, addMaintenanceTask, cleanDust } =
    useWorkerMoodStore(
      useShallow((state) => ({
        maintenanceTasks: state.maintenanceTasks,
        factoryEnvironment: state.factoryEnvironment,
        addMaintenanceTask: state.addMaintenanceTask,
        cleanDust: state.cleanDust,
      }))
    );

  // Auto-spawn maintenance tasks when needed
  useEffect(() => {
    const interval = setInterval(() => {
      // If dust is high and no sweeping task, add one
      if (
        factoryEnvironment.dustLevel > 40 &&
        !maintenanceTasks.some((t) => t.type === 'sweeping')
      ) {
        addMaintenanceTask({
          type: 'sweeping',
          position: [(Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 40],
          priority: factoryEnvironment.dustLevel > 70 ? 'high' : 'medium',
          description: 'Sweeping up dust',
        });
      }

      // Check for thirsty plants
      factoryEnvironment.plants.forEach((plant) => {
        if (
          plant.health < 50 &&
          !maintenanceTasks.some(
            (t) => t.type === 'plant_watering' && t.description.includes(plant.id)
          )
        ) {
          addMaintenanceTask({
            type: 'plant_watering',
            position: plant.position,
            priority: plant.health < 30 ? 'high' : 'low',
            description: `Watering ${plant.name || plant.id}`,
          });
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [factoryEnvironment, maintenanceTasks, addMaintenanceTask]);

  // Slowly clean dust when sweeping task exists
  useEffect(() => {
    if (maintenanceTasks.some((t) => t.type === 'sweeping')) {
      const interval = setInterval(() => {
        cleanDust(2);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [maintenanceTasks, cleanDust]);

  return (
    <MaintenanceAnimationManager>
      <group>
        {/* Render maintenance workers for active tasks */}
        {maintenanceTasks.map((task) => {
          if (task.type === 'sweeping') {
            return (
              <SweepingWorker
                key={task.id}
                taskId={task.id}
                position={[task.position[0] - 2, 0, task.position[2]]}
                targetPosition={task.position}
              />
            );
          }
          if (task.type === 'plant_watering') {
            return (
              <WateringWorker
                key={task.id}
                taskId={task.id}
                position={[task.position[0] + 0.5, 0, task.position[2] + 0.5]}
                plantPosition={task.position}
              />
            );
          }
          if (task.type === 'oiling') {
            return (
              <OilingWorker
                key={task.id}
                taskId={task.id}
                position={[task.position[0] + 1, 0, task.position[2]]}
                machinePosition={task.position}
              />
            );
          }
          return null;
        })}
      </group>
    </MaintenanceAnimationManager>
  );
};

export default MaintenanceSystem;
