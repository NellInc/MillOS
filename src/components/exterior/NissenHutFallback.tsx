import { useEffect, useMemo } from 'react';
import { createNissenHutFallbackGeometries } from './nissenHutFallbackGeometry';

/** Loading/error shell: one set of matched end faces, with the current palette. */
export function NissenHutFallback({ length }: { length: number }) {
  const geometries = useMemo(() => createNissenHutFallbackGeometries(length), [length]);
  useEffect(
    () => () => {
      geometries.shell.dispose();
      geometries.caps.dispose();
    },
    [geometries]
  );
  return (
    <group name="nissen-hut-fallback">
      <mesh castShadow receiveShadow>
        <primitive object={geometries.shell} attach="geometry" dispose={null} />
        <meshStandardMaterial color="#6b7280" roughness={0.7} metalness={0.4} />
      </mesh>
      <mesh castShadow receiveShadow>
        <primitive object={geometries.caps} attach="geometry" dispose={null} />
        <meshStandardMaterial color="#5a6268" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1, -length / 2 - 0.05]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.5, 2]} />
        <meshStandardMaterial color="#3e2723" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[5.2, 0.2, length + 0.4]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
      </mesh>
    </group>
  );
}
