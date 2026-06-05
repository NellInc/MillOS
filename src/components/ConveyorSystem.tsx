import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../utils/audioManager';
import { useGraphicsStore } from '../stores/graphicsStore';
// Note: Production counting moved to App.tsx interval-based system (scales with gameSpeed)
// Conveyor animation is now purely visual - no bag counting here
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { GrainQuality } from '../types';
import {
  METAL_MATERIALS,
  MACHINE_MATERIALS,
  SAFETY_MATERIALS,
  SHARED_GEOMETRIES,
} from '../utils/sharedMaterials';
import { POLYGON_OFFSET } from '../constants/renderLayers';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { useModelTextures } from '../utils/machineTextures';

// Module-level registry for centralized conveyor audio updates
const conveyorAudioRegistry = new Map<string, { position: THREE.Vector3; isRunning: boolean }>();

export const registerConveyorAudio = (id: string, position: THREE.Vector3, isRunning: boolean) => {
  conveyorAudioRegistry.set(id, { position, isRunning });
};

export const unregisterConveyorAudio = (id: string) => {
  conveyorAudioRegistry.delete(id);
};

// Module-level registry for centralized bag animations (15-60 bags → 1 useFrame)
interface BagAnimationState {
  ref: THREE.Group;
  speed: number;
  currentX: number;
  crossedBoundary: boolean;
}
const bagAnimationRegistry = new Map<string, BagAnimationState>();

export const registerBagAnimation = (id: string, state: BagAnimationState) => {
  bagAnimationRegistry.set(id, state);
};

export const unregisterBagAnimation = (id: string) => {
  bagAnimationRegistry.delete(id);
};

export const updateBagPosition = (id: string, x: number, crossedBoundary: boolean) => {
  const state = bagAnimationRegistry.get(id);
  if (state) {
    state.currentX = x;
    state.crossedBoundary = crossedBoundary;
  }
};

// Generate batch number in format: YYYYMMDD-XXX
const generateBatchNumber = (index: number): string => {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const batchNum = String(index + 1).padStart(3, '0');
  return `${dateStr}-${batchNum}`;
};

// Quality colors for batch labeling
const QUALITY_COLORS: Record<GrainQuality, string> = {
  premium: '#22c55e',
  standard: '#3b82f6',
  economy: '#f59e0b',
  mixed: '#8b5cf6',
};

// Module-level constants for position arrays to avoid recreating on each render
const SUPPORT_LEG_POSITIONS = [-25, -15, -5, 5, 15, 25] as const;
const ROLLER_SUPPORT_POSITIONS = [-10, 0, 10] as const;

// Pre-computed arrays for iteration (avoid Array.from on each render)

// Bag movement boundary (wraps from +BOUNDARY to -BOUNDARY)
const BAG_BOUNDARY = 28;

// Module-level conveyor belt texture singleton (created once, never disposed)
// This avoids the useState+useEffect pattern which causes extra renders
let conveyorBeltTextureCache: THREE.CanvasTexture | null = null;

const createConveyorBeltTexture = (): THREE.CanvasTexture => {
  if (conveyorBeltTextureCache) return conveyorBeltTextureCache;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base belt color - dark rubber
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(0, 0, size, size);

  // Add horizontal ridges
  for (let y = 0; y < size; y += 16) {
    // Ridge highlight
    ctx.fillStyle = '#374151';
    ctx.fillRect(0, y, size, 3);
    // Ridge shadow
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, y + 12, size, 2);
  }

  // Add subtle texture noise (use seeded random for consistency)
  const imageData = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < imageData.data.length; i += 4) {
    // Use deterministic noise based on pixel index
    const noise = Math.sin(i * 0.1) * 0.5 * 10;
    imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + noise));
    imageData.data[i + 1] = Math.max(0, Math.min(255, imageData.data[i + 1] + noise));
    imageData.data[i + 2] = Math.max(0, Math.min(255, imageData.data[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  // Add center guide line
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(size / 2 - 2, 0, 4, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 1);

  conveyorBeltTextureCache = texture;
  return texture;
};

// Hook that returns the cached texture (no state, no effects, no re-renders)
const useConveyorBeltTexture = (): THREE.CanvasTexture => {
  return useMemo(() => createConveyorBeltTexture(), []);
};

// Centralized audio manager component - updates all conveyors in one pass
const ConveyorAudioManager: React.FC<{ productionSpeed: number }> = ({ productionSpeed }) => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame(() => {
    // PERFORMANCE: Skip audio updates when tab hidden
    if (!isTabVisible) return;
    // Skip if no conveyors are registered (avoid per-frame loop when scene hidden)
    if (conveyorAudioRegistry.size === 0) return;
    // Throttle to every 4th frame (was 2nd frame per conveyor)
    // With 10-15 conveyors, this reduces from 150-225 updates/sec to 37-56 updates/sec
    if (!shouldRunThisFrame(4)) return;
    if (productionSpeed === 0) return;

    // Update all registered conveyors in one pass
    conveyorAudioRegistry.forEach((data, id) => {
      if (data.isRunning) {
        audioManager.updateConveyorSpatialVolume(id);
      }
    });
  });
  return null;
};

// Centralized bag animation manager - updates all bags in ONE useFrame (15-60 bags → 1 call)
// NOTE: This is purely visual animation - production counting is handled by App.tsx
// interval-based system which scales with gameSpeed for proper game-time production
const BagAnimationManager: React.FC<{
  productionSpeed: number;
}> = ({ productionSpeed }) => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore(useShallow((state) => state.graphics.quality));

  useFrame((_, delta) => {
    // PERFORMANCE: Skip when tab hidden or production stopped
    if (!isTabVisible || productionSpeed === 0) return;
    // Skip if no bags registered
    if (bagAnimationRegistry.size === 0) return;

    // Throttle based on quality (ultra=1, high=2, medium=3, low=4)
    const movementThrottle =
      quality === 'ultra' ? 1 : quality === 'high' ? 2 : quality === 'medium' ? 3 : 4;
    if (!shouldRunThisFrame(movementThrottle)) return;

    // Cap delta to prevent huge jumps when tab regains focus (max 100ms)
    const cappedDelta = Math.min(delta * movementThrottle, 0.1);

    // Update all bags in a single pass (visual only - no production counting)
    bagAnimationRegistry.forEach((state) => {
      if (!state.ref) return;

      state.currentX += state.speed * productionSpeed * cappedDelta;

      // Wrap bag when it crosses the boundary (visual continuity)
      if (state.currentX > BAG_BOUNDARY) {
        // Preserve overflow to prevent stuttering/bunching
        const overflow = state.currentX - BAG_BOUNDARY;
        state.currentX = -BAG_BOUNDARY + overflow;
      }

      // Apply position to mesh
      state.ref.position.x = state.currentX;
    });
  });

  return null;
};

interface ConveyorSystemProps {
  productionSpeed: number;
}

interface FlourBag {
  id: string;
  position: [number, number, number];
  speed: number;
  rotation: number;
  // Batch tracking
  batchNumber: string;
  quality: GrainQuality;
  weight: number; // kg
}

// Quality distribution (weighted random selection)
const QUALITY_WEIGHTS: { quality: GrainQuality; weight: number }[] = [
  { quality: 'premium', weight: 0.3 },
  { quality: 'standard', weight: 0.5 },
  { quality: 'economy', weight: 0.15 },
  { quality: 'mixed', weight: 0.05 },
];

const getRandomQuality = (): GrainQuality => {
  const rand = Math.random();
  let cumulative = 0;
  for (const { quality, weight } of QUALITY_WEIGHTS) {
    cumulative += weight;
    if (rand < cumulative) return quality;
  }
  return 'standard';
};

export const ConveyorSystem = React.memo<ConveyorSystemProps>(({ productionSpeed }) => {
  const graphicsQuality = useGraphicsStore(useShallow((state) => state.graphics.quality));
  // PERF: Removed incrementBagsProduced selector - now using throttledIncrementBags directly
  const bagCount = graphicsQuality === 'low' ? 15 : graphicsQuality === 'medium' ? 30 : 60;

  const bags = useMemo(() => {
    const _bags: FlourBag[] = [];
    for (let i = 0; i < bagCount; i++) {
      _bags.push({
        id: `bag-${i}`,
        position: [(Math.random() - 0.5) * 50, 1.1, 24], // Updated to z=24
        speed: 4 + Math.random() * 2,
        rotation: (Math.random() - 0.5) * 0.1,
        // Batch tracking
        batchNumber: generateBatchNumber(i),
        quality: getRandomQuality(),
        weight: 25 + Math.floor(Math.random() * 6), // 25-30 kg bags
      });
    }
    return _bags;
  }, [bagCount]);

  return (
    <group>
      {/* Centralized audio manager - updates all conveyors in one pass */}
      <ConveyorAudioManager productionSpeed={productionSpeed} />

      {/* Centralized bag animation manager - updates all bags in ONE useFrame */}
      <BagAnimationManager productionSpeed={productionSpeed} />

      {/* Main conveyor belt structure - moved to z=24 to align with packers at z=25 */}
      <MemoizedConveyorBelt position={[0, 0.5, 24]} length={55} productionSpeed={productionSpeed} />

      {/* Side rails with detail */}
      <SideRails position={[0, 1.3, 24]} length={55} />

      {/* Support legs with cross bracing */}
      {SUPPORT_LEG_POSITIONS.map((x, i) => (
        <SupportLeg key={i} position={[x, 0, 24]} />
      ))}

      {/* Flour bags */}
      {bags.map((bag) => (
        <FlourBagMesh key={bag.id} data={bag} />
      ))}

      {/* Roller conveyor to packing with enhanced details - moved to z=21 */}
      <RollerConveyor position={[0, 0.5, 21]} productionSpeed={productionSpeed} />

      {/* Central spine conveyor - longitudinal belt filling the reserved centre gap that
          runs down the middle of the mill (silos z=-22 toward packing). Oriented along Z
          via a 90deg Y rotation; spans z=-20..18 at x=0 to match the central-conveyor-belt
          pathfinding obstacle declared in MillScene (x[-1.8,1.8] z[-20,18]). Without this,
          the reserved gap + obstacle were a "ghost" (empty floor that agents detoured). */}
      <group position={[0, 0.5, -1]} rotation={[0, Math.PI / 2, 0]}>
        <MemoizedConveyorBelt
          position={[0, 0, 0]}
          length={38}
          productionSpeed={productionSpeed}
          enableAudio={false}
        />
      </group>
      {/* Support legs for the central belt (each rotated 90deg to straddle it in x) */}
      {[-16, -10, -4, 2, 8, 14].map((zPos) => (
        <group key={`central-leg-${zPos}`} position={[0, 0, zPos]} rotation={[0, Math.PI / 2, 0]}>
          <SupportLeg position={[0, 0, 0]} />
        </group>
      ))}

      {/* Tension adjustment mechanisms */}
      <TensionMechanism position={[-27.5, 0.5, 24]} />
      <TensionMechanism position={[27.5, 0.5, 24]} />
    </group>
  );
});

// Bracket count: 11 positions × 2 brackets (front + back) = 22 brackets
const BRACKET_COUNT = 22;

// Enhanced Side Rails with detail - using InstancedMesh for brackets (22 → 1 draw call)
const SideRails: React.FC<{ position: [number, number, number]; length: number }> = React.memo(
  ({ position, length }) => {
    const bracketsRef = useRef<THREE.InstancedMesh>(null);

    // Temp objects for matrix calculations
    const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
    const tempPosition = useMemo(() => new THREE.Vector3(), []);
    const tempScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
    const identityQuaternion = useMemo(() => new THREE.Quaternion(), []);

    // Initialize bracket positions on mount
    useEffect(() => {
      if (!bracketsRef.current) return;

      let instanceIndex = 0;
      for (let i = 0; i < 11; i++) {
        const x = -length / 2 + 2.5 + i * 5;
        // Front bracket
        tempPosition.set(x, -0.15, -0.9);
        tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
        bracketsRef.current.setMatrixAt(instanceIndex++, tempMatrix);
        // Back bracket
        tempPosition.set(x, -0.15, 0.9);
        tempMatrix.compose(tempPosition, identityQuaternion, tempScale);
        bracketsRef.current.setMatrixAt(instanceIndex++, tempMatrix);
      }
      bracketsRef.current.instanceMatrix.needsUpdate = true;
    }, [length, tempMatrix, tempPosition, tempScale, identityQuaternion]);

    return (
      <group position={position}>
        {/* Front rail - main structure keeps shadow */}
        <mesh position={[0, 0, -1]} castShadow>
          <boxGeometry args={[length, 0.1, 0.15]} />
          <primitive object={METAL_MATERIALS.steelDark} attach="material" />
        </mesh>
        {/* Back rail */}
        <mesh position={[0, 0, 1]} castShadow>
          <boxGeometry args={[length, 0.1, 0.15]} />
          <primitive object={METAL_MATERIALS.steelDark} attach="material" />
        </mesh>

        {/* Instanced brackets - 22 brackets in 1 draw call - NO SHADOWS for small parts */}
        <instancedMesh
          ref={bracketsRef}
          args={[SHARED_GEOMETRIES.bracketSmall, undefined, BRACKET_COUNT]}
        >
          <primitive object={METAL_MATERIALS.paintedSlate} attach="material" />
        </instancedMesh>
      </group>
    );
  }
);

// Support leg with cross bracing - using shared materials
const SupportLeg: React.FC<{ position: [number, number, number] }> = React.memo(({ position }) => {
  return (
    <group position={position}>
      {/* Front leg - only main supports cast shadows */}
      <mesh position={[0, 0.25, -0.5]} castShadow>
        <boxGeometry args={[0.3, 0.5, 0.15]} />
        <primitive object={METAL_MATERIALS.paintedDarkGray} attach="material" />
      </mesh>
      {/* Back leg */}
      <mesh position={[0, 0.25, 0.5]} castShadow>
        <boxGeometry args={[0.3, 0.5, 0.15]} />
        <primitive object={METAL_MATERIALS.paintedDarkGray} attach="material" />
      </mesh>
      {/* Cross brace - no shadow for small part */}
      <mesh position={[0, 0.25, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.08, 0.08, 0.9]} />
        <primitive object={METAL_MATERIALS.paintedMediumGray} attach="material" />
      </mesh>
      {/* Foot pads - no shadow for floor-level parts */}
      <mesh position={[0, 0.02, -0.5]}>
        <boxGeometry args={[0.4, 0.04, 0.25]} />
        <primitive object={METAL_MATERIALS.paintedBlack} attach="material" />
      </mesh>
      <mesh position={[0, 0.02, 0.5]}>
        <boxGeometry args={[0.4, 0.04, 0.25]} />
        <primitive object={METAL_MATERIALS.paintedBlack} attach="material" />
      </mesh>
    </group>
  );
});

// Belt tension adjustment mechanism - using shared materials
const TensionMechanism: React.FC<{ position: [number, number, number] }> = React.memo(
  ({ position }) => {
    return (
      <group position={position}>
        {/* Tension frame - main structure keeps shadow */}
        <mesh castShadow>
          <boxGeometry args={[0.6, 0.4, 2.4]} />
          <primitive object={METAL_MATERIALS.paintedMediumGray} attach="material" />
        </mesh>
        {/* End roller - NO SHADOW for small roller */}
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 2, 16]} />
          <primitive object={METAL_MATERIALS.steel} attach="material" />
        </mesh>
        {/* Tension screws - no shadow for small parts */}
        <mesh position={[0.35, 0, -1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
          <primitive object={METAL_MATERIALS.brass} attach="material" />
        </mesh>
        <mesh position={[0.35, 0, 1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
          <primitive object={METAL_MATERIALS.brass} attach="material" />
        </mesh>
        {/* Bolt heads - no shadow for tiny parts */}
        <mesh position={[0.52, 0, -1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 6]} />
          <primitive object={METAL_MATERIALS.brass} attach="material" />
        </mesh>
        <mesh position={[0.52, 0, 1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.04, 6]} />
          <primitive object={METAL_MATERIALS.brass} attach="material" />
        </mesh>
      </group>
    );
  }
);

// Shared geometries and materials for drive rollers (created once at module level to avoid GC pressure)
const DRIVE_ROLLER_MAIN_GEOMETRY = new THREE.CylinderGeometry(0.12, 0.12, 1.9, 12);
const DRIVE_ROLLER_CAP_GEOMETRY = new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12);
const DRIVE_ROLLER_BEARING_GEOMETRY = new THREE.BoxGeometry(0.15, 0.15, 0.08);
// Use shared textured materials from sharedMaterials module
const DRIVE_ROLLER_MAIN_MATERIAL = METAL_MATERIALS.steel;
const DRIVE_ROLLER_CAP_MATERIAL = METAL_MATERIALS.steelDark;
const DRIVE_ROLLER_BEARING_MATERIAL = METAL_MATERIALS.paintedSlate;

export const ConveyorBelt: React.FC<{
  position: [number, number, number];
  length: number;
  productionSpeed: number;
  enableAudio?: boolean;
}> = ({ position, length, productionSpeed, enableAudio = true }) => {
  const beltRef = useRef<THREE.Mesh>(null);
  const driveRollerRef = useRef<THREE.Group>(null);
  // Roller count derived from the belt's actual length (one every 4 units,
  // inset 2 from each end). The old module-level 13-roller constant was tuned
  // for the length=55 main belt (this formula still yields 13 there) and left
  // rollers floating 4-12 units past the end of the shorter length=38 central
  // spine belt.
  const driveRollerIndices = useMemo(
    () => Array.from({ length: Math.max(1, Math.floor((length - 4) / 4) + 1) }),
    [length]
  );
  const posX = position[0];
  const posY = position[1];
  const posZ = position[2];
  const conveyorId = `conveyor-main-${posX}-${posZ}`;
  const beltTexture = useConveyorBeltTexture();
  const { quality, enableProceduralTextures } = useGraphicsStore(
    useShallow((state) => ({
      quality: state.graphics.quality,
      enableProceduralTextures: state.graphics.enableProceduralTextures,
    }))
  );
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  // Throttle roller animation more aggressively on non-ultra to cut per-frame work
  const movementThrottle = quality === 'ultra' ? 1 : 3;

  // Load conveyor PBR textures (high/ultra only)
  const conveyorTextures = useModelTextures('conveyor');

  // Configure texture tiling for belt length
  useMemo(() => {
    const repeatX = Math.max(1, length / 4);
    const repeatY = 1;

    if (conveyorTextures.color) {
      conveyorTextures.color.wrapS = conveyorTextures.color.wrapT = THREE.RepeatWrapping;
      conveyorTextures.color.repeat.set(repeatX, repeatY);
    }
    if (conveyorTextures.normal) {
      conveyorTextures.normal.wrapS = conveyorTextures.normal.wrapT = THREE.RepeatWrapping;
      conveyorTextures.normal.repeat.set(repeatX, repeatY);
    }
    if (conveyorTextures.roughness) {
      conveyorTextures.roughness.wrapS = conveyorTextures.roughness.wrapT = THREE.RepeatWrapping;
      conveyorTextures.roughness.repeat.set(repeatX, repeatY);
    }
  }, [conveyorTextures, length]);

  // Position vector for audio registry (reused, never recreated)
  const positionVec = useMemo(() => new THREE.Vector3(posX, posY, posZ), [posX, posY, posZ]);

  // Start conveyor sound and register for centralized audio updates
  useEffect(() => {
    if (!enableAudio) return;
    audioManager.startConveyorSound(conveyorId, posX, posY, posZ);
    registerConveyorAudio(conveyorId, positionVec, true);
    return () => {
      audioManager.stopConveyorSound(conveyorId);
      unregisterConveyorAudio(conveyorId);
    };
  }, [conveyorId, enableAudio, posX, posY, posZ, positionVec]);

  useFrame((_, delta) => {
    // PERFORMANCE: Skip animations when tab hidden or production stopped
    if (!isTabVisible || productionSpeed === 0) return;
    // Skip animations on low graphics
    if (quality === 'low') return;
    if (!shouldRunThisFrame(movementThrottle)) return;

    // Cap delta to prevent huge jumps when tab regains focus (max 100ms)
    const cappedDelta = Math.min(delta * movementThrottle, 0.1);

    // Animate belt texture scrolling - wrap to prevent float precision issues
    const scrollAmount = cappedDelta * productionSpeed * 0.3;
    if (beltTexture) {
      beltTexture.offset.x = (beltTexture.offset.x + scrollAmount) % 1;
    }
    // Also animate PBR textures if available
    if (conveyorTextures.color) {
      conveyorTextures.color.offset.x = (conveyorTextures.color.offset.x + scrollAmount) % 1;
    }
    if (conveyorTextures.normal) {
      conveyorTextures.normal.offset.x = (conveyorTextures.normal.offset.x + scrollAmount) % 1;
    }
    if (conveyorTextures.roughness) {
      conveyorTextures.roughness.offset.x =
        (conveyorTextures.roughness.offset.x + scrollAmount) % 1;
    }

    // Animate drive rollers - wrap to prevent float precision issues
    if (driveRollerRef.current) {
      driveRollerRef.current.rotation.z =
        (driveRollerRef.current.rotation.z + cappedDelta * productionSpeed * 3) % (Math.PI * 2);
    }
    // Audio updates now handled by centralized ConveyorAudioManager
  });

  const showDetails = enableProceduralTextures;

  return (
    <group position={position}>
      {/* Belt surface with scrolling texture - PBR on high/ultra, procedural fallback on low/medium */}
      <mesh ref={beltRef} receiveShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[length, 0.1, 2]} />
        <meshStandardMaterial
          color={conveyorTextures.color ? '#ffffff' : undefined}
          map={conveyorTextures.color || beltTexture}
          normalMap={conveyorTextures.normal}
          normalScale={conveyorTextures.normal ? new THREE.Vector2(0.5, 0.5) : undefined}
          roughnessMap={conveyorTextures.roughness}
          roughness={0.8}
        />
      </mesh>

      {/* Belt frame */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[length, 0.5, 2.2]} />
        <primitive object={METAL_MATERIALS.paintedMediumGray} attach="material" />
      </mesh>

      {/* Drive rollers at intervals - NO SHADOWS for small rotating parts */}
      {showDetails &&
        driveRollerIndices.map((_, i) => {
          const x = -length / 2 + 2 + i * 4;
          return (
            <group key={i} ref={i === 0 ? driveRollerRef : undefined} position={[x, 0.15, 0]}>
              {/* Main roller */}
              <mesh
                rotation={[Math.PI / 2, 0, 0]}
                geometry={DRIVE_ROLLER_MAIN_GEOMETRY}
                material={DRIVE_ROLLER_MAIN_MATERIAL}
              />
              {/* Roller end caps */}
              <mesh
                position={[0, 0, -1]}
                rotation={[Math.PI / 2, 0, 0]}
                geometry={DRIVE_ROLLER_CAP_GEOMETRY}
                material={DRIVE_ROLLER_CAP_MATERIAL}
              />
              <mesh
                position={[0, 0, 1]}
                rotation={[Math.PI / 2, 0, 0]}
                geometry={DRIVE_ROLLER_CAP_GEOMETRY}
                material={DRIVE_ROLLER_CAP_MATERIAL}
              />
              {/* Bearing housings */}
              <mesh
                position={[0, 0, -1.05]}
                geometry={DRIVE_ROLLER_BEARING_GEOMETRY}
                material={DRIVE_ROLLER_BEARING_MATERIAL}
              />
              <mesh
                position={[0, 0, 1.05]}
                geometry={DRIVE_ROLLER_BEARING_GEOMETRY}
                material={DRIVE_ROLLER_BEARING_MATERIAL}
              />
            </group>
          );
        })}

      {/* Motor housing at one end */}
      {showDetails && (
        <group position={[-length / 2 + 1, -0.1, 1.3]}>
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.6, 0.5]} />
            <primitive object={METAL_MATERIALS.industrialBlue} attach="material" />
          </mesh>
          {/* Motor shaft - NO SHADOW for small part */}
          <mesh position={[0, 0.1, -0.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.3, 8]} />
            <primitive object={MACHINE_MATERIALS.shaft} attach="material" />
          </mesh>
          {/* Ventilation grille - z offset increased to 0.28 to prevent z-fighting with motor housing front face at z=0.25 */}
          <mesh position={[0, 0, 0.28]}>
            <planeGeometry args={[0.5, 0.35]} />
            <meshBasicMaterial
              color="#1a1a1a"
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
              polygonOffsetUnits={POLYGON_OFFSET.standard.units}
            />
          </mesh>
          {/* Warning label */}
          <mesh position={[0.41, 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.2, 0.15]} />
            <primitive object={SAFETY_MATERIALS.warningYellow} attach="material" />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Memoize ConveyorBelt to prevent re-renders when productionSpeed changes
const MemoizedConveyorBelt = React.memo(ConveyorBelt);

// Shared geometries for instanced rollers (created once at module level)
const ROLLER_GEOMETRY = new THREE.CylinderGeometry(0.15, 0.15, 2, 16);
const AXLE_GEOMETRY = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8);
const ROLLER_COUNT = 25;

// Module-level temp objects to avoid GC pressure in useFrame
const _tempEuler = new THREE.Euler();

// Instanced roller conveyor - 25 rollers rendered in 1 draw call
export const RollerConveyor: React.FC<{
  position: [number, number, number];
  productionSpeed: number;
  enableAudio?: boolean;
}> = ({ position, productionSpeed, enableAudio = true }) => {
  const rollersRef = useRef<THREE.InstancedMesh>(null);
  const axlesRef = useRef<THREE.InstancedMesh>(null);
  const posX = position[0];
  const posY = position[1];
  const posZ = position[2];
  const conveyorId = `conveyor-roller-${posX}-${posZ}`;
  const { quality, enableProceduralTextures } = useGraphicsStore(
    useShallow((state) => ({
      quality: state.graphics.quality,
      enableProceduralTextures: state.graphics.enableProceduralTextures,
    }))
  );
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const movementThrottle = quality === 'ultra' ? 1 : 3;

  // Position vector for audio registry (reused, never recreated)
  const positionVec = useMemo(() => new THREE.Vector3(posX, posY, posZ), [posX, posY, posZ]);

  // Store rotations per roller for animation
  const rotationsRef = useRef<Float32Array>(new Float32Array(ROLLER_COUNT));

  // Temp objects for matrix calculations (reused each frame)
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);

  // Initialize roller positions on mount
  useEffect(() => {
    if (!rollersRef.current) return;

    const baseRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

    for (let i = 0; i < ROLLER_COUNT; i++) {
      tempPosition.set(-12 + i * 1, 0.25, 0);
      tempMatrix.compose(tempPosition, baseRotation, tempScale);
      rollersRef.current.setMatrixAt(i, tempMatrix);
    }
    rollersRef.current.instanceMatrix.needsUpdate = true;
  }, [tempMatrix, tempPosition, tempScale]);

  // Initialize axle positions on mount
  useEffect(() => {
    if (!axlesRef.current || quality === 'low') return;

    const baseRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));

    for (let i = 0; i < ROLLER_COUNT; i++) {
      // Front axle
      tempPosition.set(-12 + i * 1, 0.25, -1.05);
      tempMatrix.compose(tempPosition, baseRotation, tempScale);
      axlesRef.current.setMatrixAt(i * 2, tempMatrix);

      // Back axle
      tempPosition.set(-12 + i * 1, 0.25, 1.05);
      tempMatrix.compose(tempPosition, baseRotation, tempScale);
      axlesRef.current.setMatrixAt(i * 2 + 1, tempMatrix);
    }
    axlesRef.current.instanceMatrix.needsUpdate = true;
  }, [tempMatrix, tempPosition, tempScale, quality]);

  // Start roller conveyor sound and register for centralized audio updates
  useEffect(() => {
    if (!enableAudio) return;
    audioManager.startConveyorSound(conveyorId, posX, posY, posZ);
    registerConveyorAudio(conveyorId, positionVec, true);
    return () => {
      audioManager.stopConveyorSound(conveyorId);
      unregisterConveyorAudio(conveyorId);
    };
  }, [conveyorId, enableAudio, posX, posY, posZ, positionVec]);

  useFrame((_, delta) => {
    // PERFORMANCE: Skip animations when tab hidden or production stopped
    if (!isTabVisible || productionSpeed === 0) return;
    // Skip animations on low graphics
    if (quality === 'low') return;
    if (!rollersRef.current) return;
    if (!shouldRunThisFrame(movementThrottle)) return;

    // Cap delta to prevent huge jumps when tab regains focus (max 100ms)
    const cappedDelta = Math.min(delta * movementThrottle, 0.1);

    // Update rotations for each roller
    for (let i = 0; i < ROLLER_COUNT; i++) {
      const speedVariation = 1 + Math.sin(i * 0.5) * 0.1;
      rotationsRef.current[i] =
        (rotationsRef.current[i] + cappedDelta * productionSpeed * 5 * speedVariation) %
        (Math.PI * 2);

      // Update instance matrix with new rotation (reuse module-level Euler)
      tempPosition.set(-12 + i * 1, 0.25, 0);
      _tempEuler.set(Math.PI / 2, 0, rotationsRef.current[i]);
      tempQuaternion.setFromEuler(_tempEuler);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      rollersRef.current.setMatrixAt(i, tempMatrix);
    }
    rollersRef.current.instanceMatrix.needsUpdate = true;

    // Audio updates now handled by centralized ConveyorAudioManager
  });

  const showDetails = enableProceduralTextures;

  return (
    <group position={position}>
      {/* Frame with detail */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[30, 0.2, 2.5]} />
        <primitive object={METAL_MATERIALS.steelDark} attach="material" />
      </mesh>

      {/* Side rails - main structure gets shadows */}
      <mesh position={[0, 0.2, -1.2]} castShadow>
        <boxGeometry args={[30, 0.35, 0.1]} />
        <primitive object={METAL_MATERIALS.paintedSlate} attach="material" />
      </mesh>
      <mesh position={[0, 0.2, 1.2]} castShadow>
        <boxGeometry args={[30, 0.35, 0.1]} />
        <primitive object={METAL_MATERIALS.paintedSlate} attach="material" />
      </mesh>

      {/* Instanced Rollers - 25 rollers in 1 draw call - NO SHADOW for rotating parts */}
      <instancedMesh ref={rollersRef} args={[ROLLER_GEOMETRY, undefined, ROLLER_COUNT]}>
        <meshStandardMaterial
          color={showDetails ? '#ffffff' : '#94a3b8'}
          metalness={0.8}
          roughness={0.2}
        />
      </instancedMesh>

      {/* Instanced Axle ends - 50 axles in 1 draw call (only on medium+ quality) */}
      {showDetails && (
        <instancedMesh ref={axlesRef} args={[AXLE_GEOMETRY, undefined, ROLLER_COUNT * 2]}>
          <primitive object={METAL_MATERIALS.steelDark} attach="material" />
        </instancedMesh>
      )}

      {/* End stops */}
      <mesh position={[-14.5, 0.3, 0]} castShadow>
        <boxGeometry args={[0.3, 0.4, 2.6]} />
        <primitive object={SAFETY_MATERIALS.warningRed} attach="material" />
      </mesh>
      <mesh position={[14.5, 0.3, 0]} castShadow>
        <boxGeometry args={[0.3, 0.4, 2.6]} />
        <primitive object={SAFETY_MATERIALS.warningRed} attach="material" />
      </mesh>

      {/* Support legs - using shared materials, no shadows for small parts */}
      {ROLLER_SUPPORT_POSITIONS.map((x, i) => (
        <group key={i} position={[x, -0.3, 0]}>
          <mesh position={[0, 0, -1]} geometry={SHARED_GEOMETRIES.legVertical}>
            <primitive object={METAL_MATERIALS.paintedDarkGray} attach="material" />
          </mesh>
          <mesh position={[0, 0, 1]} geometry={SHARED_GEOMETRIES.legVertical}>
            <primitive object={METAL_MATERIALS.paintedDarkGray} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// FlourBagMesh - now uses centralized animation via BagAnimationManager (15-60 bags → 1 useFrame)
const FlourBagMesh: React.FC<{ data: FlourBag }> = React.memo(({ data }) => {
  const ref = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const enableProceduralTextures = useGraphicsStore(
    useShallow((state) => state.graphics.enableProceduralTextures)
  );

  // Register with centralized bag animation manager on mount
  useEffect(() => {
    if (!ref.current) return;

    // Register bag state with centralized manager
    registerBagAnimation(data.id, {
      ref: ref.current,
      speed: data.speed,
      currentX: data.position[0],
      crossedBoundary: false,
    });

    return () => {
      unregisterBagAnimation(data.id);
    };
  }, [data.id, data.speed, data.position]);

  const showDetails = enableProceduralTextures;
  const qualityColor = QUALITY_COLORS[data.quality];

  // Extract position values for stable initial position (animated via ref after mount)
  const initPosX = data.position[0];
  const initPosY = data.position[1];
  const initPosZ = data.position[2];
  const initialPosition = useMemo<[number, number, number]>(
    () => [initPosX, initPosY, initPosZ],
    [initPosX, initPosY, initPosZ]
  );

  return (
    <group
      ref={ref}
      position={initialPosition}
      rotation={[0, data.rotation, 0]}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Bag body - main object keeps shadow */}
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.6, 0.5, 0.9]} />
        <meshStandardMaterial
          color={hovered ? '#fff7ed' : '#fef3c7'}
          roughness={0.9}
          emissive={hovered ? '#fbbf24' : '#000000'}
          emissiveIntensity={hovered ? 0.1 : 0}
        />
      </mesh>

      {/* Quality-colored label stripe - z offset increased to 0.48 to prevent z-fighting with bag front face at z=0.45 */}
      <mesh position={[0, 0.25, 0.48]}>
        <planeGeometry args={[0.5, 0.3]} />
        <meshBasicMaterial
          color={qualityColor}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Batch number text on bag (3D text) */}
      {showDetails && (
        <Text
          position={[0, 0.25, 0.49]}
          fontSize={0.06}
          color="white"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {data.batchNumber}
        </Text>
      )}

      {/* Weight indicator */}
      {showDetails && (
        <Text
          position={[0, 0.15, 0.49]}
          fontSize={0.04}
          color="white"
          anchorX="center"
          anchorY="middle"
          font={undefined}
        >
          {data.weight}kg
        </Text>
      )}

      {/* Bag stitching detail - NO SHADOWS for small details */}
      {showDetails && (
        <>
          <mesh position={[0, 0.51, 0]}>
            <boxGeometry args={[0.58, 0.02, 0.88]} />
            <meshStandardMaterial color="#d4c4a8" roughness={1} />
          </mesh>
          {/* Top fold */}
          <mesh position={[0, 0.52, 0.2]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.5, 0.01, 0.2]} />
            <meshStandardMaterial color="#f5f0e6" roughness={0.95} />
          </mesh>
        </>
      )}

      {/* Hover tooltip with full batch info */}
      {hovered && (
        <Html position={[0, 0.8, 0]} center distanceFactor={10}>
          <div className="bg-slate-900/95 backdrop-blur px-3 py-2 rounded-lg border border-slate-700 shadow-xl pointer-events-none min-w-[120px]">
            <div className="text-xs font-mono text-white font-bold">{data.batchNumber}</div>
            <div className="text-[10px] text-slate-400 mt-1">
              <div className="flex justify-between">
                <span>Quality:</span>
                <span style={{ color: qualityColor }} className="font-medium capitalize">
                  {data.quality}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Weight:</span>
                <span className="text-white">{data.weight} kg</span>
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
});
