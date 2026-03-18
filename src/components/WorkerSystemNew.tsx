/**
 * WorkerSystemNew - Refactored Worker System
 *
 * Uses centralized WorkerAnimationManager for all worker animations.
 * Simplified from ~2668 lines to ~400 lines.
 *
 * Key changes from original:
 * - Single useFrame in manager instead of per-worker hooks
 * - Model components are pure renderers (no useFrame)
 * - Refs managed centrally by animation manager
 */

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { Html, Billboard, Text } from '@react-three/drei';
import { Briefcase, FlaskConical, HardHat, Shield, User, Wrench as WrenchIcon } from 'lucide-react';

// Types
import { WorkerData } from '../types';

// Store
import { useProductionStore } from '../stores/productionStore';

// Animation manager
import { useWorkerAnimationManager, WorkerAnimationConfig, LODLevel } from '../animation';

// Worker models
import {
  DetailedWorker,
  SimplifiedWorker,
  WorkerBillboard,
  WorkerPoseRefs,
  SimplifiedPoseRefs,
  getWorkerAppearance,
} from './workers';

// Stores
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../utils/audioManager';

interface WorkerSystemProps {
  onSelectWorker: (worker: WorkerData) => void;
}

/**
 * Create refs for all animatable body parts
 */
function usePoseRefs(): WorkerPoseRefs {
  return {
    torso: useRef<THREE.Group>(null),
    head: useRef<THREE.Group>(null),
    leftArm: useRef<THREE.Group>(null),
    rightArm: useRef<THREE.Group>(null),
    leftLeg: useRef<THREE.Group>(null),
    rightLeg: useRef<THREE.Group>(null),
    hips: useRef<THREE.Mesh>(null),
    chest: useRef<THREE.Mesh>(null),
    leftEyelid: useRef<THREE.Mesh>(null),
    rightEyelid: useRef<THREE.Mesh>(null),
    leftFingers: useRef<THREE.Mesh>(null),
    rightFingers: useRef<THREE.Mesh>(null),
  };
}

/**
 * Create simplified refs for medium LOD
 */
function useSimplifiedRefs(): SimplifiedPoseRefs {
  return {
    leftArm: useRef<THREE.Group>(null),
    rightArm: useRef<THREE.Group>(null),
    leftLeg: useRef<THREE.Group>(null),
    rightLeg: useRef<THREE.Group>(null),
  };
}

/**
 * Individual Worker Component
 * Minimal logic - just renders the appropriate LOD model
 */
interface WorkerProps {
  data: WorkerData;
  onSelect: (worker: WorkerData) => void;
  manager: ReturnType<typeof useWorkerAnimationManager>;
}

const Worker: React.FC<WorkerProps> = React.memo(
  ({ data, onSelect, manager }) => {
    // Stable click handler that passes worker data
    const handleClick = useCallback(() => {
      onSelect(data);
    }, [onSelect, data]);
    const groupRef = useRef<THREE.Group>(null);
    const [hovered, setHovered] = useState(false);
    const [lod, setLod] = useState<LODLevel>('high');

    // Create refs for body parts
    const poseRefs = usePoseRefs();
    const simplifiedRefs = useSimplifiedRefs();

    // Get appearance config
    const appearance = useMemo(
      () => getWorkerAppearance(data.role, data.color, data.id),
      [data.role, data.color, data.id]
    );

    // Register with animation manager ONCE on mount (no LOD in deps!)
    useEffect(() => {
      if (!groupRef.current) return;

      const config: WorkerAnimationConfig = {
        id: data.id,
        position: data.position,
        speed: data.speed,
        direction: data.direction,
        role: data.role,
        status: data.status,
      };

      // Initial refs (will be updated when LOD changes)
      const initialRefs = {
        group: groupRef.current,
        torso: poseRefs.torso.current,
        head: poseRefs.head.current,
        leftArm: poseRefs.leftArm.current,
        rightArm: poseRefs.rightArm.current,
        leftLeg: poseRefs.leftLeg.current,
        rightLeg: poseRefs.rightLeg.current,
        hips: poseRefs.hips.current,
        leftEyelid: poseRefs.leftEyelid.current,
        rightEyelid: poseRefs.rightEyelid.current,
        leftFingers: poseRefs.leftFingers.current,
        rightFingers: poseRefs.rightFingers.current,
      };

      const unregister = manager.register(config, initialRefs);

      return unregister;
    }, [data.id, manager]); // Only re-register if worker ID changes

    // Update refs when LOD changes (preserves position)
    useEffect(() => {
      if (!groupRef.current) return;

      const updatedRefs = {
        group: groupRef.current,
        torso: poseRefs.torso.current,
        head: poseRefs.head.current,
        leftArm: lod === 'high' ? poseRefs.leftArm.current : simplifiedRefs.leftArm.current,
        rightArm: lod === 'high' ? poseRefs.rightArm.current : simplifiedRefs.rightArm.current,
        leftLeg: lod === 'high' ? poseRefs.leftLeg.current : simplifiedRefs.leftLeg.current,
        rightLeg: lod === 'high' ? poseRefs.rightLeg.current : simplifiedRefs.rightLeg.current,
        hips: poseRefs.hips.current,
        leftEyelid: poseRefs.leftEyelid.current,
        rightEyelid: poseRefs.rightEyelid.current,
        leftFingers: poseRefs.leftFingers.current,
        rightFingers: poseRefs.rightFingers.current,
      };

      manager.updateRefs(data.id, updatedRefs);
    }, [data.id, lod, manager, poseRefs, simplifiedRefs]);

    // Subscribe to LOD changes
    useEffect(() => {
      return manager.onLodChange(data.id, setLod);
    }, [data.id, manager]);

    // Update status when it changes
    useEffect(() => {
      manager.updateWorkerStatus(data.id, data.status);
    }, [data.id, data.status, manager]);

    // Icon based on role
    const getRoleIcon = useCallback(() => {
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
    }, [data.role]);

    // Status color
    const getStatusColor = useCallback(() => {
      switch (data.status) {
        case 'working':
          return '#22c55e';
        case 'responding':
          return '#f59e0b';
        case 'break':
          return '#6b7280';
        default:
          return '#3b82f6';
      }
    }, [data.status]);

    const statusColor = getStatusColor();

    return (
      <group
        ref={groupRef}
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
          handleClick();
        }}
      >
        {/* Worker Model - 3-tier LOD system */}
        {lod === 'high' && <DetailedWorker appearance={appearance} poseRefs={poseRefs} />}
        {lod === 'medium' && <SimplifiedWorker appearance={appearance} poseRefs={simplifiedRefs} />}
        {lod === 'low' && <WorkerBillboard appearance={appearance} />}

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

        {/* Hover tooltip */}
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
      </group>
    );
  },
  // Custom comparison - only re-render on meaningful changes
  (prevProps, nextProps) => {
    return (
      prevProps.data.id === nextProps.data.id &&
      prevProps.data.status === nextProps.data.status &&
      prevProps.onSelect === nextProps.onSelect
    );
  }
);

Worker.displayName = 'Worker';

/**
 * Main WorkerSystem Component
 * Creates workers and manages the animation manager
 */
export const WorkerSystemNew: React.FC<WorkerSystemProps> = ({ onSelectWorker }) => {
  // Get store state
  // PERFORMANCE: Consolidated store subscriptions to prevent unnecessary re-renders
  const { isTabVisible, emergencyDrillMode, getNearestExit, markWorkerEvacuated } =
    useGameSimulationStore(
      useShallow((state) => ({
        isTabVisible: state.isTabVisible,
        emergencyDrillMode: state.emergencyDrillMode,
        getNearestExit: state.getNearestExit,
        markWorkerEvacuated: state.markWorkerEvacuated,
      }))
    );
  const { quality, workerLodDistance } = useGraphicsStore(
    useShallow((state) => ({
      quality: state.graphics.quality,
      workerLodDistance: state.graphics.workerLodDistance,
    }))
  );

  // Create animation manager with single useFrame
  const manager = useWorkerAnimationManager(
    isTabVisible,
    quality as 'low' | 'medium' | 'high' | 'ultra',
    workerLodDistance,
    emergencyDrillMode,
    getNearestExit,
    markWorkerEvacuated
  );

  const workers = useProductionStore((state) => state.workers);

  // Stable callback for worker selection
  const handleSelectWorker = useCallback(
    (worker: WorkerData) => {
      onSelectWorker(worker);
    },
    [onSelectWorker]
  );

  return (
    <group>
      {workers.map((w) => (
        <Worker key={w.id} data={w} onSelect={handleSelectWorker} manager={manager} />
      ))}
    </group>
  );
};

// Memoize the entire system to prevent re-renders from parent updates
export default React.memo(WorkerSystemNew);
