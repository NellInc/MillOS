import React, { useEffect, useMemo } from 'react';
import { createWasteBinFallbackBodyGeometry } from './wasteBinFallbackGeometry';

/** Retained two-mesh load/error fallback with an actual cavity and horizontal rim. */
export const WasteBinFallback: React.FC = () => {
  const geometry = useMemo(() => createWasteBinFallbackBodyGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow>
        <primitive object={geometry} attach="geometry" dispose={null} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.25, 0.03, 8, 16]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
};
