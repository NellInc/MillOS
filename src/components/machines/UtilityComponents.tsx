import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { MODEL_PATHS } from '../../utils/modelLoader';

// GLTF Silo base model
export const GLTFSiloBase: React.FC<{
  size: [number, number, number];
  matProps: { emissive: string; emissiveIntensity: number };
}> = React.memo(({ size, matProps }) => {
  const { scene } = useGLTF(MODEL_PATHS.silo);

  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        // Apply emissive properties for hover/status effects
        const mesh = child as THREE.Mesh;
        if (mesh.material && 'emissive' in mesh.material) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.emissive = new THREE.Color(matProps.emissive);
          mat.emissiveIntensity = matProps.emissiveIntensity;
        }
      }
    });
    return clone;
  }, [scene, matProps.emissive, matProps.emissiveIntensity]);

  // Scale to match the expected size (size[1] is height ~12, GLTF silo is ~9 units tall)
  const scale = size[1] / 9;

  return (
    <group position={[0, size[1] / 2, 0]}>
      <primitive object={clonedScene} scale={scale * 1.2} position={[0, -size[1] / 2, 0]} />
    </group>
  );
});

// Industrial cable with CatmullRomCurve3
export const IndustrialCable: React.FC<{
  points: THREE.Vector3[];
  radius?: number;
  color?: string;
}> = React.memo(({ points, radius = 0.03, color = '#1e293b' }) => {
  const path = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);
  const geometry = useMemo(
    () => new THREE.TubeGeometry(path, 20, radius, 8, false),
    [path, radius]
  );

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
});
