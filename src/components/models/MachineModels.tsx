/**
 * Machine 3D Model Components
 *
 * Uses GLTF models if available, falls back to procedural primitives.
 * Models from Kenney City Kit Industrial (CC0)
 */

import React, { useMemo, Suspense } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useModelAvailable, MODEL_PATHS } from '../../utils/modelLoader';

interface MachineModelProps {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  color?: string;
}

// === SILO MODEL ===

const GLTFSilo: React.FC<MachineModelProps> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}) => {
  const { scene } = useGLTF(MODEL_PATHS.silo);

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

  return (
    <group position={position} rotation={rotation}>
      <primitive object={clonedScene} scale={scale * 3} />
    </group>
  );
};

const ProceduralSilo: React.FC<MachineModelProps> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = '#9ca3af',
}) => {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Main cylinder */}
      <mesh castShadow position={[0, 4, 0]}>
        <cylinderGeometry args={[2, 2, 8, 24]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Top cone */}
      <mesh castShadow position={[0, 8.5, 0]}>
        <coneGeometry args={[2.2, 1.5, 24]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Bottom hopper */}
      <mesh castShadow position={[0, -0.5, 0]}>
        <coneGeometry args={[2, 1.5, 24]} />
        <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Support legs */}
      {[0, 1, 2, 3].map((i: number) => (
        <mesh
          key={i}
          castShadow
          position={[Math.cos((i * Math.PI) / 2) * 1.5, -1.5, Math.sin((i * Math.PI) / 2) * 1.5]}
        >
          <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
};

export const SiloModel: React.FC<MachineModelProps> = (props) => {
  const modelAvailable = useModelAvailable('silo');

  if (modelAvailable === null || modelAvailable === false) {
    return <ProceduralSilo {...props} />;
  }

  return (
    <Suspense fallback={<ProceduralSilo {...props} />}>
      <GLTFSilo {...props} />
    </Suspense>
  );
};

// === ROLLER MILL MODEL ===

const GLTFMill: React.FC<MachineModelProps> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
}) => {
  const { scene } = useGLTF(MODEL_PATHS.rollerMill);

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

  return (
    <group position={position} rotation={rotation}>
      <primitive object={clonedScene} scale={scale * 2} />
    </group>
  );
};

const ProceduralMill: React.FC<MachineModelProps> = ({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  color = '#3b82f6',
}) => {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* Main body */}
      <mesh castShadow position={[0, 1.5, 0]}>
        <boxGeometry args={[3, 3, 2]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Hopper */}
      <mesh castShadow position={[0, 3.5, 0]}>
        <boxGeometry args={[2, 1, 1.5]} />
        <meshStandardMaterial color="#6b7280" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Control panel */}
      <mesh castShadow position={[1.6, 1.5, 0]}>
        <boxGeometry args={[0.1, 1.5, 1]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Base */}
      <mesh castShadow position={[0, -0.1, 0]}>
        <boxGeometry args={[3.2, 0.2, 2.2]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
};

export const MillModel: React.FC<MachineModelProps> = (props) => {
  const modelAvailable = useModelAvailable('rollerMill');

  if (modelAvailable === null || modelAvailable === false) {
    return <ProceduralMill {...props} />;
  }

  return (
    <Suspense fallback={<ProceduralMill {...props} />}>
      <GLTFMill {...props} />
    </Suspense>
  );
};

// Note: Model preloading is handled by useModelAvailable hook and preloadAvailableModels()
// in modelLoader.ts. This respects the DISABLED_MODELS list and prevents texture loading errors.
