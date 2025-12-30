/**
 * Small Truck Detail Parts
 * Individual truck components like exhaust, wheel chocks, fuel tanks, etc.
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import {
  registerAnimation,
  unregisterAnimation,
  registerParticleSystem,
  unregisterParticleSystem,
  updateParticleSystem,
} from './animationSystem';

// Exhaust particle system
export const ExhaustSmoke: React.FC<{
  position: [number, number, number];
  throttle: number;
  isRunning: boolean;
}> = ({ position, throttle, isRunning }) => {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 20;
  const systemId = useMemo(() => `exhaust-${Math.random()}`, []);

  const { positions, velocities, lifetimes, maxLifetimes } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const vel = new Float32Array(particleCount * 3);
    const life = new Float32Array(particleCount);
    const maxLife = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;
      vel[i * 3] = (Math.random() - 0.5) * 0.02;
      vel[i * 3 + 1] = 0.03 + Math.random() * 0.02;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
      life[i] = Math.random();
      maxLife[i] = 0.8 + Math.random() * 0.4;
    }

    return { positions: pos, velocities: vel, lifetimes: life, maxLifetimes: maxLife };
  }, []);

  useEffect(() => {
    registerParticleSystem(systemId, {
      ref: particlesRef,
      positions,
      velocities,
      lifetimes,
      maxLifetimes,
      particleCount,
      throttle,
      isRunning,
    });

    return () => {
      unregisterParticleSystem(systemId);
    };
  }, [systemId, positions, velocities, lifetimes, maxLifetimes, particleCount]);

  useEffect(() => {
    updateParticleSystem(systemId, { throttle, isRunning });
  }, [systemId, throttle, isRunning]);

  if (!isRunning) return null;

  return (
    <points ref={particlesRef} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.15 + throttle * 0.1}
        color="#4b5563"
        transparent
        opacity={0.4 + throttle * 0.2}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
};

// Wheel chock component - placed behind wheels when truck is docked
export const WheelChock: React.FC<{
  position: [number, number, number];
  rotation?: number;
  isDeployed: boolean;
}> = ({ position, rotation = 0, isDeployed }) => {
  const chockRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!chockRef.current) return;
    const id = `chock-${Math.random()}`;
    const targetX = isDeployed ? 0 : 0.5;

    registerAnimation(id, 'lerp', chockRef.current, {
      target: targetX,
      property: 'position',
      axis: 'x',
      speed: 0.08,
      autoHide: true,
      hideThreshold: 0.1,
    });

    return () => unregisterAnimation(id);
  }, [isDeployed]);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      <group ref={chockRef} position={[0.5, 0, 0]}>
        {/* Wedge shape */}
        <mesh position={[0, 0.08, 0]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.25, 0.16, 0.35]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.7} />
        </mesh>
        {/* Angled face */}
        <mesh position={[0.08, 0.12, 0]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.15, 0.12, 0.35]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.7} />
        </mesh>
        {/* Handle */}
        <mesh position={[-0.1, 0.2, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Warning stripes */}
        <mesh position={[0, 0.17, 0]}>
          <boxGeometry args={[0.26, 0.02, 0.36]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
};

// Fuel tanks on cab sides
export const FuelTank: React.FC<{ position: [number, number, number]; side: 'left' | 'right' }> = ({
  position,
  side,
}) => (
  <group position={position}>
    {/* Main tank cylinder */}
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.35, 0.35, 1.2, 16]} />
      <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
    </mesh>
    {/* End caps */}
    <mesh position={[side === 'right' ? 0.62 : -0.62, 0, 0]}>
      <sphereGeometry args={[0.35, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
    </mesh>
    {/* Fuel cap */}
    <mesh position={[0, 0.36, 0.15]}>
      <cylinderGeometry args={[0.08, 0.08, 0.05, 12]} />
      <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
    </mesh>
    {/* Mounting straps */}
    {[-0.35, 0.35].map((x, i) => (
      <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.4, 0.03, 8, 24, Math.PI]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>
    ))}
    {/* Fuel gauge (small circle) */}
    <mesh position={[0.3, 0.2, 0.3]} rotation={[0.3, 0, 0]}>
      <circleGeometry args={[0.06, 16]} />
      <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
    </mesh>
  </group>
);

// Air tanks under trailer
export const AirTank: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {/* Main tank cylinder */}
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.12, 0.12, 0.8, 12]} />
      <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
    </mesh>
    {/* End caps */}
    {[-0.4, 0.4].map((z, i) => (
      <mesh key={i} position={[0, 0, z]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
      </mesh>
    ))}
    {/* Valve */}
    <mesh position={[0, 0.13, 0]}>
      <cylinderGeometry args={[0.03, 0.03, 0.06, 8]} />
      <meshStandardMaterial color="#fbbf24" metalness={0.5} roughness={0.5} />
    </mesh>
    {/* Mounting bracket */}
    <mesh position={[0, 0.18, 0]}>
      <boxGeometry args={[0.3, 0.04, 0.6]} />
      <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
    </mesh>
  </group>
);

// Landing gear legs - support trailer when detached from cab
export const LandingGear: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {/* Left leg assembly */}
    <group position={[-0.8, 0, 0]}>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.12, 0.8, 0.15]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.1, 12]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
      <mesh position={[0.1, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
    {/* Right leg assembly */}
    <group position={[0.8, 0, 0]}>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.12, 0.8, 0.15]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.1, 12]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
      <mesh position={[-0.1, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.15, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
    {/* Cross beam */}
    <mesh position={[0, 0.75, 0]}>
      <boxGeometry args={[1.8, 0.1, 0.12]} />
      <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
    </mesh>
  </group>
);

// DEF (Diesel Exhaust Fluid) tank - smaller blue tank
export const DEFTank: React.FC<{ position: [number, number, number]; side: 'left' | 'right' }> = ({
  position,
  side,
}) => (
  <group position={position}>
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.18, 0.18, 0.5, 12]} />
      <meshStandardMaterial color="#2563eb" metalness={0.5} roughness={0.4} />
    </mesh>
    <mesh position={[side === 'right' ? 0.27 : -0.27, 0, 0]}>
      <sphereGeometry args={[0.18, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#2563eb" metalness={0.5} roughness={0.4} />
    </mesh>
    <mesh position={[0, 0.19, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 0.04, 10]} />
      <meshStandardMaterial color="#1d4ed8" metalness={0.6} roughness={0.3} />
    </mesh>
    <Text position={[0, 0, 0.19]} fontSize={0.06} color="#ffffff" anchorX="center" anchorY="middle">
      DEF
    </Text>
  </group>
);

// CB Antenna on cab roof
export const CBAntennaComponent: React.FC<{ position: [number, number, number] }> = ({
  position,
}) => (
  <group position={position}>
    <mesh>
      <cylinderGeometry args={[0.04, 0.05, 0.06, 8]} />
      <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
    </mesh>
    <mesh position={[0, 0.15, 0]}>
      <cylinderGeometry args={[0.02, 0.02, 0.25, 8]} />
      <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
    </mesh>
    <mesh position={[0, 0.6, 0]}>
      <cylinderGeometry args={[0.008, 0.015, 0.9, 6]} />
      <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.1} />
    </mesh>
    <mesh position={[0, 1.08, 0]}>
      <sphereGeometry args={[0.02, 8, 8]} />
      <meshStandardMaterial color="#ef4444" roughness={0.6} />
    </mesh>
  </group>
);

// Sun visor above windshield
export const SunVisor: React.FC<{ position: [number, number, number]; color: string }> = ({
  position,
  color,
}) => (
  <group position={position}>
    <mesh rotation={[0.4, 0, 0]}>
      <boxGeometry args={[2.5, 0.05, 0.5]} />
      <meshStandardMaterial color={color} metalness={0.4} roughness={0.6} />
    </mesh>
    {[-1, 1].map((x, i) => (
      <mesh key={i} position={[x, -0.1, 0.15]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.08, 0.25, 0.05]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>
    ))}
    <mesh position={[0, -0.03, 0.26]} rotation={[0.4, 0, 0]}>
      <boxGeometry args={[2.52, 0.02, 0.03]} />
      <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
    </mesh>
  </group>
);
