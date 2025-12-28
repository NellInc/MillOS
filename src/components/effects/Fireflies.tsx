import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { shouldRunThisFrame } from '../../utils/frameThrottle';

interface FirefliesProps {
  count?: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  color?: string;
}

const Fireflies: React.FC<FirefliesProps> = ({ count = 50, bounds, color = '#ccff66' }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Selector optimization: Only re-render when night status CHANGES
  const isNight = useGameSimulationStore((state) => state.gameTime >= 20 || state.gameTime < 6);

  // Generate initial data
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
      const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
      const z = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
      const speed = 0.5 + Math.random() * 0.5;
      const offset = Math.random() * Math.PI * 2;
      temp.push({
        basePos: new THREE.Vector3(x, y, z),
        speed,
        offset,
        time: Math.random() * 10,
      });
    }
    return temp;
  }, [count, bounds]);

  // Dummy object for matrix calculations
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_state, delta) => {
    if (!meshRef.current || !isNight) return;

    // Performance optimization: Skip animation on Low quality
    if (quality === 'low') return;

    // Throttle firefly animation to every 3rd frame (~20 FPS)
    if (!shouldRunThisFrame(3)) return;

    particles.forEach((p, i) => {
      p.time += delta * p.speed;

      // Gentle wandering motion
      const x = p.basePos.x + Math.sin(p.time * 0.5 + p.offset) * 0.5;
      const y = p.basePos.y + Math.cos(p.time * 0.3 + p.offset) * 0.3; // Slight vertical drift
      const z = p.basePos.z + Math.sin(p.time * 0.4 + p.offset) * 0.5;

      // Pulsing scale
      const scale = 0.8 + Math.sin(p.time * 2 + p.offset) * 0.4;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();

      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  // If not night or low quality, don't render (unless we want static ones?)
  // For charm, static is fine on low quality, but let's hide them to save Draw Calls.
  if ((!isNight || quality === 'low') && !meshRef.current) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <planeGeometry args={[0.08, 0.08]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
};

export default Fireflies;
