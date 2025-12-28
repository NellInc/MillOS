/**
 * Worker 3D Model Component
 *
 * Uses GLTF model if available at /public/models/worker/worker.glb
 * Falls back to procedural primitives otherwise.
 *
 * Recommended free models:
 * - Quaternius: https://quaternius.com/ (animated characters with walk/idle, CC0)
 * - KayKit Adventurers: https://kaylousberg.itch.io/ (CC0)
 * - Kenney Blocky Characters: https://kenney.nl/assets/blocky-characters (CC0)
 * - Mixamo: https://www.mixamo.com/ (free with Adobe account, rigged/animated)
 */

import React, { useRef, Suspense, useMemo } from 'react';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useModelAvailable, WorkerVariant, getWorkerVariantPath } from '../../utils/modelLoader';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface WorkerModelProps {
  uniformColor: string;
  skinTone: string;
  hatColor: string;
  hasVest: boolean;
  pantsColor: string;
  walkCycle: number;
  isIdle: boolean;
  isWaving?: boolean;
  scale?: number;
  /** Character variant key - uses default if not specified or unavailable */
  variant?: WorkerVariant;
}

// GLTF Model version
const GLTFWorker: React.FC<WorkerModelProps> = ({
  hatColor,
  isIdle,
  scale = 1,
  variant = 'default',
}) => {
  const modelPath = getWorkerVariantPath(variant);
  const { scene } = useDracoGLTF(modelPath);
  const modelRef = useRef<THREE.Group>(null);
  const bobPhase = useRef(0);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Clone scene for each instance and enable shadows
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Graphics quality for throttling
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Simple walk animation (bobbing motion) since Kenney characters aren't rigged
  // PERFORMANCE: Throttle to 20fps on LOW, 30fps on MEDIUM
  useFrame((_, delta) => {
    if (!isTabVisible) return;
    // PERFORMANCE: Skip entirely on LOW quality - workers stay static
    if (quality === 'low') return;
    // PERFORMANCE: Throttle to every 2nd frame on MEDIUM (~30fps)
    if (quality === 'medium' && !shouldRunThisFrame(2)) return;
    if (!modelRef.current) return;

    // Scale delta by throttle factor to maintain animation speed
    const throttleFactor = quality === 'medium' ? 2 : 1;
    const scaledDelta = delta * throttleFactor;

    if (!isIdle) {
      bobPhase.current += scaledDelta * 8;
      // Subtle vertical bob while walking
      modelRef.current.position.y = Math.abs(Math.sin(bobPhase.current)) * 0.05;
      // Slight rotation sway
      modelRef.current.rotation.z = Math.sin(bobPhase.current) * 0.03;
    } else {
      // Breathing motion when idle
      bobPhase.current += scaledDelta * 1.5;
      modelRef.current.position.y = Math.sin(bobPhase.current) * 0.01;
      modelRef.current.rotation.z = 0;
    }
  });

  return (
    <group ref={modelRef} scale={scale * 1.5} position={[0, 0, 0]}>
      <primitive object={clonedScene} />
      {/* Add hard hat on top since Kenney characters don't have one */}
      <group position={[0, 1.15, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.22, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={hatColor} metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh castShadow position={[0, -0.01, 0]}>
          <cylinderGeometry args={[0.24, 0.24, 0.025, 32]} />
          <meshStandardMaterial color={hatColor} metalness={0.4} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
};

// Note: Worker model preloading is handled by modelLoader.ts preloadAvailableModels()
// which checks for model existence first. Direct preload here was causing texture errors
// when the model has missing external textures.

// Simplified procedural worker (cleaner than original, easier to maintain)
const ProceduralWorker: React.FC<WorkerModelProps> = ({
  uniformColor,
  skinTone,
  hatColor,
  hasVest,
  pantsColor,
  walkCycle,
  isIdle,
  isWaving = false,
  scale = 0.85,
}) => {
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // PERFORMANCE: Throttle limb animations on LOW/MEDIUM quality
  useFrame(() => {
    if (!isTabVisible) return;
    // PERFORMANCE: Skip entirely on LOW quality - workers stay static
    if (quality === 'low') return;
    // PERFORMANCE: Throttle to every 2nd frame on MEDIUM (~30fps)
    if (quality === 'medium' && !shouldRunThisFrame(2)) return;

    const armSwing = isIdle ? Math.sin(walkCycle) * 0.05 : Math.sin(walkCycle) * 0.5;
    const legSwing = isIdle ? 0 : Math.sin(walkCycle) * 0.6;

    // Adjust lerp speed based on quality (faster lerp on lower FPS to maintain animation speed)
    const lerpSpeed = quality === 'medium' ? 0.2 : 0.1;

    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = THREE.MathUtils.lerp(
        leftArmRef.current.rotation.x,
        armSwing,
        lerpSpeed
      );
    }
    if (rightArmRef.current) {
      if (isWaving) {
        rightArmRef.current.rotation.x = -2.2;
        rightArmRef.current.rotation.z = -0.8 + Math.sin(walkCycle * 2) * 0.4;
      } else {
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.x,
          -armSwing,
          lerpSpeed
        );
        rightArmRef.current.rotation.z = THREE.MathUtils.lerp(
          rightArmRef.current.rotation.z,
          0,
          lerpSpeed
        );
      }
    }
    if (leftLegRef.current) {
      leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
        leftLegRef.current.rotation.x,
        -legSwing,
        lerpSpeed
      );
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
        rightLegRef.current.rotation.x,
        legSwing,
        lerpSpeed
      );
    }
  });

  return (
    <group scale={[scale, scale, scale]}>
      {/* Torso */}
      <group position={[0, 1.15, 0]}>
        {/* Chest */}
        <mesh castShadow position={[0, 0.2, 0]}>
          <boxGeometry args={[0.48, 0.45, 0.26]} />
          <meshStandardMaterial
            color={uniformColor}
            roughness={0.75}
            normalMap={PROCEDURAL_TEXTURES.panelNormal}
            normalScale={new THREE.Vector2(0.08, 0.08)}
          />
        </mesh>

        {/* Shoulders */}
        <mesh castShadow position={[-0.28, 0.32, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color={uniformColor} roughness={0.75} />
        </mesh>
        <mesh castShadow position={[0.28, 0.32, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color={uniformColor} roughness={0.75} />
        </mesh>

        {/* Waist */}
        <mesh castShadow position={[0, -0.12, 0]}>
          <boxGeometry args={[0.42, 0.28, 0.22]} />
          <meshStandardMaterial
            color={uniformColor}
            roughness={0.8}
            normalMap={PROCEDURAL_TEXTURES.panelNormal}
            normalScale={new THREE.Vector2(0.08, 0.08)}
          />
        </mesh>

        {/* Safety vest */}
        {hasVest && (
          <>
            <mesh castShadow position={[0, 0.15, 0.01]}>
              <boxGeometry args={[0.5, 0.52, 0.27]} />
              <meshStandardMaterial color="#f97316" roughness={0.55} />
            </mesh>
            {[0.32, 0.12, -0.08].map((y, i) => (
              <mesh key={i} position={[0, y, 0.14]}>
                <boxGeometry args={[0.52, 0.04, 0.01]} />
                <meshStandardMaterial
                  color="#e5e5e5"
                  emissive="#ffffff"
                  emissiveIntensity={0.5}
                  metalness={0.9}
                  roughness={0.1}
                />
              </mesh>
            ))}
          </>
        )}

        {/* Neck */}
        <mesh castShadow position={[0, 0.55, 0]}>
          <cylinderGeometry args={[0.07, 0.085, 0.1, 16]} />
          <meshStandardMaterial color={skinTone} roughness={0.55} />
        </mesh>

        {/* Head */}
        <group position={[0, 0.8, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.16, 24, 24]} />
            <meshStandardMaterial color={skinTone} roughness={0.5} />
          </mesh>
          {/* Face features */}
          <mesh position={[0, -0.04, 0.14]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color={skinTone} roughness={0.55} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.05, 0.02, 0.14]}>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshStandardMaterial color="#fefefe" />
          </mesh>
          <mesh position={[0.05, 0.02, 0.14]}>
            <sphereGeometry args={[0.02, 12, 12]} />
            <meshStandardMaterial color="#fefefe" />
          </mesh>
          <mesh position={[-0.05, 0.02, 0.155]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
          <mesh position={[0.05, 0.02, 0.155]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>

          {/* Hard hat */}
          <group position={[0, 0.1, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.18, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={hatColor} metalness={0.4} roughness={0.4} />
            </mesh>
            <mesh castShadow position={[0, -0.01, 0]}>
              <cylinderGeometry args={[0.2, 0.2, 0.025, 32]} />
              <meshStandardMaterial color={hatColor} metalness={0.4} roughness={0.4} />
            </mesh>
          </group>
        </group>

        {/* Left arm */}
        <group ref={leftArmRef} position={[-0.34, 0.22, 0]}>
          <mesh castShadow position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.055, 0.22, 8, 16]} />
            <meshStandardMaterial color={uniformColor} roughness={0.75} />
          </mesh>
          <mesh castShadow position={[0, -0.32, 0]}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshStandardMaterial color={uniformColor} roughness={0.75} />
          </mesh>
          <mesh castShadow position={[0, -0.48, 0]}>
            <capsuleGeometry args={[0.042, 0.2, 8, 16]} />
            <meshStandardMaterial color={skinTone} roughness={0.55} />
          </mesh>
          <mesh castShadow position={[0, -0.65, 0]}>
            <boxGeometry args={[0.05, 0.08, 0.025]} />
            <meshStandardMaterial color={skinTone} roughness={0.55} />
          </mesh>
        </group>

        {/* Right arm */}
        <group ref={rightArmRef} position={[0.34, 0.22, 0]}>
          <mesh castShadow position={[0, -0.15, 0]}>
            <capsuleGeometry args={[0.055, 0.22, 8, 16]} />
            <meshStandardMaterial color={uniformColor} roughness={0.75} />
          </mesh>
          <mesh castShadow position={[0, -0.32, 0]}>
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshStandardMaterial color={uniformColor} roughness={0.75} />
          </mesh>
          <mesh castShadow position={[0, -0.48, 0]}>
            <capsuleGeometry args={[0.042, 0.2, 8, 16]} />
            <meshStandardMaterial color={skinTone} roughness={0.55} />
          </mesh>
          <mesh castShadow position={[0, -0.65, 0]}>
            <boxGeometry args={[0.05, 0.08, 0.025]} />
            <meshStandardMaterial color={skinTone} roughness={0.55} />
          </mesh>
        </group>
      </group>

      {/* Hips */}
      <mesh castShadow position={[0, 0.72, 0]}>
        <boxGeometry args={[0.36, 0.12, 0.2]} />
        <meshStandardMaterial
          color={pantsColor}
          roughness={0.8}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.06, 0.06)}
        />
      </mesh>

      {/* Belt */}
      <mesh castShadow position={[0, 0.78, 0]}>
        <boxGeometry args={[0.38, 0.04, 0.22]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.45} metalness={0.3} />
      </mesh>

      {/* Left leg */}
      <group ref={leftLegRef} position={[-0.1, 0.62, 0]}>
        <mesh castShadow position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.075, 0.28, 8, 16]} />
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, -0.4, 0.01]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, -0.58, 0]}>
          <capsuleGeometry args={[0.052, 0.26, 8, 16]} />
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
        {/* Boot */}
        <mesh castShadow position={[0, -0.78, 0.03]}>
          <boxGeometry args={[0.1, 0.1, 0.16]} />
          <meshStandardMaterial
            color="#1a1a1a"
            roughness={0.6}
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.15, 0.15)}
          />
        </mesh>
        <mesh castShadow position={[0, -0.84, 0.03]}>
          <boxGeometry args={[0.11, 0.02, 0.17]} />
          <meshStandardMaterial color="#0d0d0d" roughness={0.9} />
        </mesh>
      </group>

      {/* Right leg */}
      <group ref={rightLegRef} position={[0.1, 0.62, 0]}>
        <mesh castShadow position={[0, -0.18, 0]}>
          <capsuleGeometry args={[0.075, 0.28, 8, 16]} />
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, -0.4, 0.01]}>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, -0.58, 0]}>
          <capsuleGeometry args={[0.052, 0.26, 8, 16]} />
          <meshStandardMaterial color={pantsColor} roughness={0.8} />
        </mesh>
        <mesh castShadow position={[0, -0.78, 0.03]}>
          <boxGeometry args={[0.1, 0.1, 0.16]} />
          <meshStandardMaterial
            color="#1a1a1a"
            roughness={0.6}
            normalMap={PROCEDURAL_TEXTURES.rubberNormal}
            normalScale={new THREE.Vector2(0.15, 0.15)}
          />
        </mesh>
        <mesh castShadow position={[0, -0.84, 0.03]}>
          <boxGeometry args={[0.11, 0.02, 0.17]} />
          <meshStandardMaterial color="#0d0d0d" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
};

// Main export with model detection
export const WorkerModel: React.FC<WorkerModelProps> = (props) => {
  const modelAvailable = useModelAvailable('worker');

  if (modelAvailable === null || modelAvailable === false) {
    return <ProceduralWorker {...props} />;
  }

  return (
    <Suspense fallback={<ProceduralWorker {...props} />}>
      <GLTFWorker {...props} />
    </Suspense>
  );
};

export default WorkerModel;
