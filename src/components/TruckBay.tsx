import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
// shouldRunThisFrame is used in the imported TruckAnimationManager from animationSystem
import { audioManager } from '../utils/audioManager';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import {
  FLOOR_LAYERS,
  POLYGON_OFFSET,
  RENDER_ORDER,
} from '../constants/renderLayers';
import {
  OptimizedTrafficConeInstances,
  OptimizedBollardInstances,
  OptimizedSpeedBumpInstances,
  OptimizedStripeInstances,
} from './TruckBayInstances';
import {
  calculateShippingTruckState,
  calculateReceivingTruckState,
  type TruckAnimState,
  type TruckPhase,
} from './truckbay/useTruckPhysics';
// Import animation system functions and TruckAnimationManager
import {
  TruckAnimationManager,
  registerAnimation,
  unregisterAnimation,
  registerParticleSystem,
  unregisterParticleSystem,
  updateParticleSystem,
  registerWorker,
  unregisterWorker,
  registerTruckComponents,
  unregisterTruckComponents,
} from './truckbay/animationSystem';
// NOTE: ExhaustSmoke, WheelChock, FuelTank, AirTank, LandingGear, DEFTank,
// CBAntennaComponent, SunVisor, GrainCoLogo, FlourExpressLogo are defined
// locally in this file - do not import from TruckSmallParts/TruckLogos

interface TruckBayProps {
  productionSpeed: number;
}

// Exhaust particle system
const ExhaustSmoke: React.FC<{
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
const WheelChock: React.FC<{
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

// Fifth wheel coupling - connects cab to trailer
const FifthWheelCoupling: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {/* Main plate */}
    <mesh position={[0, 0, 0]}>
      <cylinderGeometry args={[0.6, 0.6, 0.12, 24]} />
      <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
    </mesh>
    {/* Throat/opening */}
    <mesh position={[0, 0.08, 0.3]}>
      <boxGeometry args={[0.15, 0.1, 0.4]} />
      <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
    </mesh>
    {/* Locking mechanism */}
    <mesh position={[0, 0.1, 0]}>
      <boxGeometry args={[0.4, 0.08, 0.3]} />
      <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
    </mesh>
    {/* Release handle */}
    <mesh position={[0.45, 0.15, 0]}>
      <boxGeometry args={[0.3, 0.06, 0.08]} />
      <meshStandardMaterial color="#ef4444" roughness={0.6} />
    </mesh>
    {/* King pin (connects to trailer) */}
    <mesh position={[0, 0.2, 0]}>
      <cylinderGeometry args={[0.08, 0.08, 0.25, 12]} />
      <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
    </mesh>
  </group>
);

// Glad hands - air brake hose connections between cab and trailer
const GladHands: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {/* Service line (blue) */}
    <group position={[-0.15, 0, 0]}>
      {/* Coupling head */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.08, 12]} />
        <meshStandardMaterial color="#2563eb" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Gasket ring */}
      <mesh position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.04, 0.01, 8, 16]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
      {/* Hose */}
      <mesh position={[-0.15, 0.1, 0]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.35, 8]} />
        <meshStandardMaterial color="#2563eb" roughness={0.7} />
      </mesh>
      {/* Coiled hose section */}
      {[0, 1, 2, 3].map((_: unknown, i: number) => (
        <mesh
          key={i}
          position={[-0.25 - i * 0.08, 0.25 + Math.sin(i * 0.8) * 0.05, 0]}
          rotation={[0, 0, Math.PI / 2 + i * 0.2]}
        >
          <torusGeometry args={[0.04, 0.02, 8, 8, Math.PI]} />
          <meshStandardMaterial color="#2563eb" roughness={0.7} />
        </mesh>
      ))}
    </group>
    {/* Emergency line (red) */}
    <group position={[0.15, 0, 0]}>
      {/* Coupling head */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.08, 12]} />
        <meshStandardMaterial color="#dc2626" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Gasket ring */}
      <mesh position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.04, 0.01, 8, 16]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
      {/* Hose */}
      <mesh position={[-0.15, 0.1, 0]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.35, 8]} />
        <meshStandardMaterial color="#dc2626" roughness={0.7} />
      </mesh>
      {/* Coiled hose section */}
      {[0, 1, 2, 3].map((_: unknown, i: number) => (
        <mesh
          key={i}
          position={[-0.25 - i * 0.08, 0.25 + Math.sin(i * 0.8 + 0.5) * 0.05, 0]}
          rotation={[0, 0, Math.PI / 2 + i * 0.2]}
        >
          <torusGeometry args={[0.04, 0.02, 8, 8, Math.PI]} />
          <meshStandardMaterial color="#dc2626" roughness={0.7} />
        </mesh>
      ))}
    </group>
    {/* Mounting bracket */}
    <mesh position={[0, 0.05, -0.1]}>
      <boxGeometry args={[0.5, 0.05, 0.08]} />
      <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
    </mesh>
  </group>
);

// DOT marker lights along trailer sides (amber on sides, red at rear)
const DOTMarkerLights: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const lightsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const xPos = side === 'right' ? 1.62 : -1.62;

  useEffect(() => {
    const ids: string[] = [];
    lightsRef.current.forEach((mat, i) => {
      if (mat) {
        const id = `dot-light-${Math.random()}`;
        registerAnimation(id, 'pulse', mat, {
          speed: 2,
          min: 0.2,
          max: 0.4,
          offset: i * 0.5,
        });
        ids.push(id);
      }
    });
    return () => ids.forEach((id) => unregisterAnimation(id));
  }, []);

  return (
    <group>
      {/* Amber side markers - front to back */}
      {[-4, -2, 0, 2, 4].map((z, i) => (
        <mesh key={`amber-${i}`} position={[xPos, 0.9, z]}>
          <boxGeometry args={[0.04, 0.08, 0.15]} />
          <meshStandardMaterial
            ref={(el) => {
              if (el) lightsRef.current[i] = el;
            }}
            color="#f59e0b"
            emissive="#f59e0b"
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
      {/* Red clearance lights at corners */}
      <mesh position={[xPos, 4.35, -5.3]}>
        <boxGeometry args={[0.04, 0.1, 0.12]} />
        <meshStandardMaterial
          ref={(el) => {
            if (el) lightsRef.current[5] = el;
          }}
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={0.3}
        />
      </mesh>
      <mesh position={[xPos, 4.35, 5.3]}>
        <boxGeometry args={[0.04, 0.1, 0.12]} />
        <meshStandardMaterial
          ref={(el) => {
            if (el) lightsRef.current[6] = el;
          }}
          color="#f59e0b"
          emissive="#f59e0b"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
};

// ICC reflective tape strips along trailer sides
const ICCReflectiveTape: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const xPos = side === 'right' ? 1.62 : -1.62;

  return (
    <group>
      {/* Alternating red and white reflective strips */}
      {[-4.5, -3, -1.5, 0, 1.5, 3, 4.5].map((z, i) => (
        <mesh key={i} position={[xPos, 0.6, z]}>
          <planeGeometry args={[0.02, 1.2]} />
          <meshStandardMaterial
            color={i % 2 === 0 ? '#ef4444' : '#ffffff'}
            metalness={0.9}
            roughness={0.1}
            emissive={i % 2 === 0 ? '#ef4444' : '#ffffff'}
            emissiveIntensity={0.1}
          />
        </mesh>
      ))}
      {/* Bottom horizontal strip */}
      <mesh
        position={[xPos, 0.35, 0]}
        rotation={[0, side === 'right' ? Math.PI / 2 : -Math.PI / 2, 0]}
      >
        <planeGeometry args={[10, 0.06]} />
        <meshStandardMaterial
          color="#ef4444"
          metalness={0.9}
          roughness={0.1}
          emissive="#ef4444"
          emissiveIntensity={0.1}
        />
      </mesh>
    </group>
  );
};

// Sliding tandem axles on trailer (adjustable for weight distribution)
const SlidingTandemAxles: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {/* Slide rail - left */}
    <mesh position={[-1.2, 0.7, 0]}>
      <boxGeometry args={[0.08, 0.15, 3.5]} />
      <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
    </mesh>
    {/* Slide rail - right */}
    <mesh position={[1.2, 0.7, 0]}>
      <boxGeometry args={[0.08, 0.15, 3.5]} />
      <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
    </mesh>
    {/* Locking pins - 4 positions on each side */}
    {[-1.2, -0.4, 0.4, 1.2].map((z, i) => (
      <group key={i}>
        <mesh position={[-1.35, 0.7, z]}>
          <cylinderGeometry args={[0.03, 0.03, 0.2, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[1.35, 0.7, z]}>
          <cylinderGeometry args={[0.03, 0.03, 0.2, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
    ))}
    {/* Position indicator holes */}
    {[-1.2, -0.4, 0.4, 1.2].map((z, i) => (
      <group key={`holes-${i}`}>
        <mesh position={[-1.2, 0.6, z]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.02, 0.04, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[1.2, 0.6, z]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.02, 0.04, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </group>
    ))}
    {/* Release handle */}
    <mesh position={[-1.5, 0.9, 0.8]} rotation={[0, 0, Math.PI / 4]}>
      <boxGeometry args={[0.04, 0.25, 0.04]} />
      <meshStandardMaterial color="#f59e0b" roughness={0.6} />
    </mesh>
    <mesh position={[-1.5, 1.0, 0.8]}>
      <sphereGeometry args={[0.04, 8, 8]} />
      <meshStandardMaterial color="#f59e0b" roughness={0.6} />
    </mesh>
  </group>
);

// Truck wash station with brushes
const TruckWashStation: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const brushRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!brushRef.current) return;
    const id = `wash-brush-${Math.random()}`;
    registerAnimation(id, 'rotation', brushRef.current, { axis: 'y', speed: 2 });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      {/* Main structure - overhead frame */}
      <mesh position={[0, 5, 0]}>
        <boxGeometry args={[8, 0.4, 12]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.6} />
      </mesh>
      {/* Support columns */}
      {[
        [-3.5, -5],
        [-3.5, 5],
        [3.5, -5],
        [3.5, 5],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 2.5, z]}>
          <boxGeometry args={[0.4, 5, 0.4]} />
          <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* Vertical rotating brushes */}
      {[-3, 3].map((x, i) => (
        <group key={i} position={[x, 2.5, 0]}>
          {/* Brush cylinder */}
          <mesh>
            <cylinderGeometry args={[0.6, 0.6, 4.5, 16]} />
            <meshStandardMaterial color="#1e40af" roughness={0.8} />
          </mesh>
          {/* Bristles */}
          {[0, 1, 2, 3, 4, 5].map((j) => (
            <mesh key={j} position={[0, -2 + j * 0.8, 0]} rotation={[0, j * 0.5, 0]}>
              <boxGeometry args={[1.4, 0.3, 0.1]} />
              <meshStandardMaterial color="#60a5fa" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Horizontal top brush */}
      <group ref={brushRef} position={[0, 4.3, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.5, 0.5, 6, 16]} />
          <meshStandardMaterial color="#1e40af" roughness={0.8} />
        </mesh>
        {[0, 1, 2, 3, 4, 5].map((j) => (
          <mesh key={j} position={[-2.5 + j, 0, 0]} rotation={[j * 0.5, 0, 0]}>
            <boxGeometry args={[0.3, 1.2, 0.1]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.9} />
          </mesh>
        ))}
      </group>
      {/* Water spray bars */}
      {[-2, 0, 2].map((z, i) => (
        <group key={i} position={[0, 4.8, z]}>
          <mesh>
            <cylinderGeometry args={[0.05, 0.05, 7, 8]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Spray nozzles */}
          {[-3, -1.5, 0, 1.5, 3].map((x, j) => (
            <mesh key={j} position={[x, -0.1, 0]}>
              <coneGeometry args={[0.04, 0.1, 8]} />
              <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Floor grate/drain */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 10]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Grate pattern */}
      {[-2, 0, 2].map((x, i) => (
        <mesh key={i} position={[x, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.1, 9]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
      {/* Sign */}
      <group position={[4.5, 3, 0]}>
        <mesh>
          <boxGeometry args={[0.1, 2, 1.5]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} />
        </mesh>
        <Text
          position={[0.06, 0.3, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fontSize={0.25}
          color="#ffffff"
          anchorX="center"
        >
          TRUCK
        </Text>
        <Text
          position={[0.06, -0.1, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fontSize={0.25}
          color="#ffffff"
          anchorX="center"
        >
          WASH
        </Text>
        <Text
          position={[0.06, -0.5, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fontSize={0.15}
          color="#fbbf24"
          anchorX="center"
        >
          $25
        </Text>
      </group>
    </group>
  );
};

// Driver break room/lounge building
export const DriverBreakRoom: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    {/* Main building */}
    <mesh position={[0, 2, 0]} castShadow>
      <boxGeometry args={[8, 4, 6]} />
      <meshStandardMaterial color="#78716c" roughness={0.8} />
    </mesh>
    {/* Roof */}
    <mesh position={[0, 4.15, 0]}>
      <boxGeometry args={[8.5, 0.3, 6.5]} />
      <meshStandardMaterial color="#57534e" roughness={0.7} />
    </mesh>
    {/* Front door - positioned so bottom sits at floor level */}
    <mesh position={[0, 1.2, 3.01]}>
      <boxGeometry args={[1.2, 2.4, 0.1]} />
      <meshStandardMaterial color="#44403c" roughness={0.6} />
    </mesh>
    {/* Door handle */}
    <mesh position={[0.4, 1.2, 3.08]}>
      <boxGeometry args={[0.08, 0.2, 0.05]} />
      <meshStandardMaterial color="#a8a29e" metalness={0.7} roughness={0.3} />
    </mesh>
    {/* Door window */}
    <mesh position={[0, 1.9, 3.06]}>
      <planeGeometry args={[0.5, 0.6]} />
      <meshStandardMaterial
        color="#1e3a5f"
        metalness={0.9}
        roughness={0.1}
        transparent
        opacity={0.8}
      />
    </mesh>
    {/* Windows - properly scaled */}
    {[
      [-2.5, 2.2],
      [2.5, 2.2],
    ].map(([x, y], i) => (
      <mesh key={i} position={[x, y, 3.01]}>
        <planeGeometry args={[1.2, 1.0]} />
        <meshStandardMaterial
          color="#1e3a5f"
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.8}
        />
      </mesh>
    ))}
    {/* AC unit on roof */}
    <mesh position={[2, 4.5, 0]}>
      <boxGeometry args={[1.5, 0.8, 1.5]} />
      <meshStandardMaterial color="#94a3b8" roughness={0.6} />
    </mesh>
    {/* Vending machine alcove */}
    <group position={[-3.5, 1.2, 3.3]}>
      <mesh>
        <boxGeometry args={[1.2, 2.2, 0.8]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.3, 0.41]}>
        <planeGeometry args={[0.9, 1.2]} />
        <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
      </mesh>
      <Text position={[0, 0.85, 0.42]} fontSize={0.12} color="#ffffff" anchorX="center">
        SNACKS
      </Text>
    </group>
    {/* Bench outside */}
    <mesh position={[2.5, 0.4, 4]}>
      <boxGeometry args={[2, 0.1, 0.5]} />
      <meshStandardMaterial color="#713f12" roughness={0.8} />
    </mesh>
    {[-0.6, 0.6].map((x, i) => (
      <mesh key={i} position={[2.5 + x, 0.2, 4]}>
        <boxGeometry args={[0.1, 0.4, 0.4]} />
        <meshStandardMaterial color="#374151" roughness={0.6} />
      </mesh>
    ))}
    {/* Sign */}
    <group position={[0, 3.5, 3.2]}>
      <mesh>
        <boxGeometry args={[3, 0.6, 0.1]} />
        <meshStandardMaterial color="#1e40af" roughness={0.5} />
      </mesh>
      <Text position={[0, 0, 0.06]} fontSize={0.25} color="#ffffff" anchorX="center">
        DRIVER LOUNGE
      </Text>
    </group>
    {/* Smoking area sign */}
    <group position={[5, 1.5, 0]}>
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} />
      </mesh>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[0.8, 0.5, 0.05]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>
      <Text position={[0, 2.2, 0.03]} fontSize={0.1} color="#1f2937" anchorX="center">
        SMOKING
      </Text>
    </group>
  </group>
);

// Employee parking lot with striped spaces
export const EmployeeParking: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    {/* Parking lot surface - raised above TerrainGround (y=0.05) */}
    <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[25, 18]} />
      <meshStandardMaterial
        color="#2d2d2d"
        roughness={0.9}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
    {/* Parking stripes - 8 spaces */}
    {[0, 1, 2, 3, 4, 5, 6, 7].map((_: unknown, i: number) => (
      <group key={i} position={[-10 + i * 3, 0, 0]}>
        {/* Vertical stripe */}
        <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={RENDER_ORDER.floorMarkings}>
          <planeGeometry args={[0.1, 5]} />
          <meshBasicMaterial
            color="#fef3c7"
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
        {/* Horizontal stripe at back */}
        <mesh position={[1.5, 0.09, -2.4]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={RENDER_ORDER.floorMarkings}>
          <planeGeometry args={[3, 0.1]} />
          <meshBasicMaterial
            color="#fef3c7"
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      </group>
    ))}
    {/* Handicap spaces - 2 at end */}
    {[0, 1].map((_: unknown, i: number) => (
      <group key={i} position={[10 + i * 3.5, 0, 0]}>
        <mesh position={[0, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={RENDER_ORDER.floorMarkings}>
          <planeGeometry args={[0.15, 5]} />
          <meshBasicMaterial color="#3b82f6" depthWrite={false} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
        </mesh>
        {/* Handicap symbol (simplified) */}
        <mesh position={[1.5, 0.10, -1]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={RENDER_ORDER.floorMarkings}>
          <circleGeometry args={[0.5, 16]} />
          <meshBasicMaterial color="#3b82f6" depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
        </mesh>
        <Text position={[1.5, 0.11, -1]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.6} color="#ffffff" anchorX="center">
          P
        </Text>
      </group>
    ))}
    {/* Parked vehicles (simple representations) */}
    {[
      [0, 0],
      [3, 0],
      [6, 0],
      [-6, 0],
    ].map(([x, z], i) => (
      <group key={i} position={[x + 1.5, 0, z - 1]}>
        {/* Car body */}
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[1.8, 0.8, 3.5]} />
          <meshStandardMaterial
            color={['#374151', '#dc2626', '#2563eb', '#64748b'][i]}
            roughness={0.5}
          />
        </mesh>
        {/* Cabin */}
        <mesh position={[0, 1.2, 0.2]}>
          <boxGeometry args={[1.6, 0.5, 2]} />
          <meshStandardMaterial
            color={['#374151', '#dc2626', '#2563eb', '#64748b'][i]}
            roughness={0.5}
          />
        </mesh>
        {/* Windows */}
        <mesh position={[0, 1.2, 1.21]}>
          <planeGeometry args={[1.4, 0.4]} />
          <meshStandardMaterial color="#1e3a5f" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Wheels */}
        {[
          [-0.7, -1.2],
          [0.7, -1.2],
          [-0.7, 1.2],
          [0.7, 1.2],
        ].map(([wx, wz], j) => (
          <mesh key={j} position={[wx, 0.35, wz]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.35, 0.35, 0.2, 12]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
        ))}
      </group>
    ))}
    {/* Light pole */}
    <group position={[-12, 0, -8]}>
      <mesh position={[0, 4, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 8, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 8.2, 0]}>
        <boxGeometry args={[1, 0.3, 0.5]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <pointLight position={[0, 8, 0]} intensity={15} distance={20} color="#fef3c7" />
    </group>
    {/* Sign */}
    <group position={[-13, 0, 5]}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3, 8]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.2, 0]}>
        <boxGeometry args={[2, 0.8, 0.1]} />
        <meshStandardMaterial color="#1e40af" roughness={0.5} />
      </mesh>
      <Text position={[0, 3.4, 0.06]} fontSize={0.2} color="#ffffff" anchorX="center">
        EMPLOYEE
      </Text>
      <Text position={[0, 3.1, 0.06]} fontSize={0.2} color="#ffffff" anchorX="center">
        PARKING
      </Text>
    </group>
  </group>
);

// Propane tank cage
export const PropaneTankCage: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    {/* Concrete pad */}
    <mesh position={[0, 0.05, 0]}>
      <boxGeometry args={[3, 0.1, 2]} />
      <meshStandardMaterial color="#6b7280" roughness={0.9} />
    </mesh>
    {/* Cage posts */}
    {[
      [-1.4, -0.9],
      [1.4, -0.9],
      [-1.4, 0.9],
      [1.4, 0.9],
    ].map(([x, z], i) => (
      <mesh key={i} position={[x, 1, z]}>
        <boxGeometry args={[0.08, 2, 0.08]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>
    ))}
    {/* Horizontal bars */}
    {[0.5, 1, 1.5].map((y, i) => (
      <group key={i}>
        <mesh position={[0, y, -0.9]}>
          <boxGeometry args={[2.9, 0.05, 0.05]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
        <mesh position={[0, y, 0.9]}>
          <boxGeometry args={[2.9, 0.05, 0.05]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
        <mesh position={[-1.4, y, 0]}>
          <boxGeometry args={[0.05, 0.05, 1.85]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
      </group>
    ))}
    {/* Gate */}
    <mesh position={[1.4, 1, 0]}>
      <boxGeometry args={[0.05, 1.8, 1.7]} />
      <meshStandardMaterial color="#fbbf24" roughness={0.5} transparent opacity={0.7} />
    </mesh>
    {/* Propane tanks inside */}
    {[
      [-0.5, 0],
      [0.5, 0],
    ].map(([x, z], i) => (
      <group key={i} position={[x, 0.7, z]}>
        <mesh>
          <cylinderGeometry args={[0.3, 0.3, 1.2, 16]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        {/* Tank collar */}
        <mesh position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.15, 0.2, 0.12, 12]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Valve */}
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.1, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    ))}
    {/* Warning sign */}
    <mesh position={[0, 1.8, -0.92]}>
      <boxGeometry args={[0.8, 0.5, 0.02]} />
      <meshStandardMaterial color="#fbbf24" roughness={0.5} />
    </mesh>
    <Text position={[0, 1.9, -0.91]} fontSize={0.08} color="#1f2937" anchorX="center">
      FLAMMABLE
    </Text>
    <Text position={[0, 1.75, -0.91]} fontSize={0.06} color="#1f2937" anchorX="center">
      NO SMOKING
    </Text>
  </group>
);

// Dumpster area
const DumpsterArea: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    {/* Concrete pad */}
    <mesh position={[0, 0.03, 0]}>
      <boxGeometry args={[8, 0.06, 5]} />
      <meshStandardMaterial color="#6b7280" roughness={0.9} />
    </mesh>
    {/* Main dumpster */}
    <group position={[-1.5, 0, 0]}>
      {/* Body */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[4, 2, 2.5]} />
        <meshStandardMaterial color="#166534" roughness={0.7} />
      </mesh>
      {/* Lid (hinged) */}
      <mesh position={[0, 2.3, 0]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[4.1, 0.1, 2.6]} />
        <meshStandardMaterial color="#15803d" roughness={0.6} />
      </mesh>
      {/* Sliding doors */}
      <mesh position={[0, 0.8, 1.26]}>
        <boxGeometry args={[1.8, 1.4, 0.05]} />
        <meshStandardMaterial color="#14532d" roughness={0.7} />
      </mesh>
      {/* Wheels */}
      {[
        [-1.7, -1],
        [-1.7, 1],
        [1.7, -1],
        [1.7, 1],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.25, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.15, 12]} />
          <meshStandardMaterial color="#1f2937" roughness={0.7} />
        </mesh>
      ))}
      {/* Company logo */}
      <Text position={[0, 1.5, 1.27]} fontSize={0.3} color="#fef3c7" anchorX="center">
        WASTE
      </Text>
      <Text position={[0, 1.15, 1.27]} fontSize={0.2} color="#fef3c7" anchorX="center">
        SERVICES
      </Text>
    </group>
    {/* Recycling bin */}
    <group position={[2.5, 0, 0]}>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[2, 1.6, 1.5]} />
        <meshStandardMaterial color="#2563eb" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.75, 0]}>
        <boxGeometry args={[2.1, 0.1, 1.6]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.6} />
      </mesh>
      <Text position={[0, 1.1, 0.76]} fontSize={0.15} color="#ffffff" anchorX="center">
        RECYCLING
      </Text>
      {/* Recycling symbol (simplified) */}
      <mesh position={[0, 0.6, 0.76]}>
        <ringGeometry args={[0.15, 0.25, 3]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
    {/* Bollards to protect dumpsters */}
    {[
      [-4, -2],
      [-4, 2],
      [4, -2],
      [4, 2],
    ].map(([x, z], i) => (
      <mesh key={i} position={[x, 0.4, z]}>
        <cylinderGeometry args={[0.15, 0.18, 0.8, 12]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.6} />
      </mesh>
    ))}
  </group>
);

// Warehouse worker with pallet jack
const WarehouseWorkerWithPalletJack: React.FC<{
  position: [number, number, number];
  isActive: boolean;
  workAreaBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}> = ({ position, isActive, workAreaBounds = { minX: -5, maxX: 5, minZ: -3, maxZ: 3 } }) => {
  const groupRef = useRef<THREE.Group>(null);
  const targetPos = useRef({ x: 0, z: 0 });
  const lastBeepTime = useRef(0);
  const workerId = useMemo(() => `worker-${Math.random()}`, []);

  useEffect(() => {
    registerWorker(workerId, {
      ref: groupRef,
      targetPos,
      lastBeepTime,
      isActive,
      workAreaBounds,
    });

    return () => {
      unregisterWorker(workerId);
    };
  }, [workerId, isActive, workAreaBounds]);

  return (
    <group position={position}>
      <group ref={groupRef}>
        {/* Pallet jack */}
        <group>
          {/* Handle */}
          <mesh position={[0, 0.9, -0.5]} rotation={[-0.3, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 1.2, 8]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.5} />
          </mesh>
          {/* Handle grip */}
          <mesh position={[0, 1.4, -0.8]}>
            <boxGeometry args={[0.3, 0.08, 0.08]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
          {/* Main body */}
          <mesh position={[0, 0.35, 0]}>
            <boxGeometry args={[0.5, 0.25, 1.5]} />
            <meshStandardMaterial color="#f59e0b" roughness={0.5} />
          </mesh>
          {/* Forks */}
          {[-0.25, 0.25].map((x, i) => (
            <mesh key={i} position={[x, 0.1, 0.5]}>
              <boxGeometry args={[0.12, 0.08, 1.2]} />
              <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
            </mesh>
          ))}
          {/* Wheels */}
          {[
            [-0.2, -0.6],
            [0.2, -0.6],
            [-0.3, 1],
            [0.3, 1],
          ].map(([x, z], i) => (
            <mesh key={i} position={[x, 0.1, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.1, 0.1, 0.1, 12]} />
              <meshStandardMaterial color="#1f2937" roughness={0.7} />
            </mesh>
          ))}
          {/* Pallet on forks */}
          <mesh position={[0, 0.2, 0.6]}>
            <boxGeometry args={[0.8, 0.12, 1]} />
            <meshStandardMaterial color="#92400e" roughness={0.8} />
          </mesh>
          {/* Boxes on pallet */}
          <mesh position={[0, 0.5, 0.6]}>
            <boxGeometry args={[0.6, 0.5, 0.8]} />
            <meshStandardMaterial color="#d4a574" roughness={0.7} />
          </mesh>
        </group>
        {/* Worker */}
        <group position={[0, 0, -0.9]}>
          {/* Hard hat */}
          <mesh position={[0, 1.8, 0]}>
            <sphereGeometry args={[0.14, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#fbbf24" roughness={0.6} />
          </mesh>
          {/* Head */}
          <mesh position={[0, 1.6, 0]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color="#d4a574" roughness={0.8} />
          </mesh>
          {/* Safety vest */}
          <mesh position={[0, 1.3, 0]}>
            <boxGeometry args={[0.35, 0.5, 0.2]} />
            <meshStandardMaterial color="#f97316" roughness={0.7} />
          </mesh>
          {/* Reflective stripes */}
          <mesh position={[0, 1.35, 0.11]}>
            <boxGeometry args={[0.34, 0.04, 0.01]} />
            <meshStandardMaterial color="#fef3c7" metalness={0.3} roughness={0.4} />
          </mesh>
          {/* Pants */}
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.3, 0.5, 0.2]} />
            <meshStandardMaterial color="#1e3a8a" roughness={0.7} />
          </mesh>
          {/* Legs */}
          {[-0.08, 0.08].map((x, i) => (
            <mesh key={i} position={[x, 0.5, 0]}>
              <boxGeometry args={[0.1, 0.4, 0.12]} />
              <meshStandardMaterial color="#1e3a8a" roughness={0.7} />
            </mesh>
          ))}
          {/* Boots */}
          {[-0.08, 0.08].map((x, i) => (
            <mesh key={i} position={[x, 0.25, 0.03]}>
              <boxGeometry args={[0.12, 0.15, 0.18]} />
              <meshStandardMaterial color="#1f2937" roughness={0.8} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

// Clipboard/manifest holder at dock
const ManifestHolder: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    {/* Wall-mounted box */}
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.5, 0.7, 0.12]} />
      <meshStandardMaterial color="#374151" roughness={0.6} />
    </mesh>
    {/* Clipboard slot */}
    <mesh position={[0, 0.1, 0.05]}>
      <boxGeometry args={[0.35, 0.45, 0.08]} />
      <meshStandardMaterial color="#1f2937" roughness={0.7} />
    </mesh>
    {/* Clipboard */}
    <mesh position={[0, 0.12, 0.1]}>
      <boxGeometry args={[0.3, 0.4, 0.02]} />
      <meshStandardMaterial color="#92400e" roughness={0.7} />
    </mesh>
    {/* Paper */}
    <mesh position={[0, 0.1, 0.12]}>
      <planeGeometry args={[0.25, 0.35]} />
      <meshStandardMaterial color="#fefce8" roughness={0.8} />
    </mesh>
    {/* Clip */}
    <mesh position={[0, 0.32, 0.11]}>
      <boxGeometry args={[0.2, 0.04, 0.03]} />
      <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
    </mesh>
    {/* Pen holder */}
    <mesh position={[0.2, -0.1, 0.05]}>
      <cylinderGeometry args={[0.03, 0.03, 0.15, 8]} />
      <meshStandardMaterial color="#374151" roughness={0.6} />
    </mesh>
    {/* Pen */}
    <mesh position={[0.2, -0.05, 0.05]} rotation={[0, 0, 0.2]}>
      <cylinderGeometry args={[0.015, 0.015, 0.12, 6]} />
      <meshStandardMaterial color="#1e40af" roughness={0.5} />
    </mesh>
    {/* Label */}
    <Text position={[0, 0.42, 0.07]} fontSize={0.05} color="#fef3c7" anchorX="center">
      MANIFEST
    </Text>
  </group>
);

// Time clock station
const TimeClockStation: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const displayRef = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    if (!displayRef.current) return;
    const id = `clock-${Math.random()}`;
    registerAnimation(id, 'pulse', displayRef.current, { speed: 3, min: 0.5, max: 0.7 });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      {/* Wall mount backing */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.8, 1, 0.08]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      {/* Time clock unit */}
      <mesh position={[0, 1.5, 0.08]}>
        <boxGeometry args={[0.5, 0.6, 0.15]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      {/* Display */}
      <mesh position={[0, 1.6, 0.16]}>
        <planeGeometry args={[0.35, 0.2]} />
        <meshStandardMaterial
          ref={displayRef}
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.6}
        />
      </mesh>
      {/* Time display text */}
      <Text position={[0, 1.6, 0.17]} fontSize={0.08} color="#000000" anchorX="center">
        07:45
      </Text>
      {/* Card slot */}
      <mesh position={[0, 1.35, 0.16]}>
        <boxGeometry args={[0.25, 0.05, 0.02]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Keypad */}
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => (
          <mesh key={`${row}-${col}`} position={[-0.1 + col * 0.1, 1.2 - row * 0.08, 0.16]}>
            <boxGeometry args={[0.06, 0.05, 0.02]} />
            <meshStandardMaterial color="#64748b" roughness={0.5} />
          </mesh>
        ))
      )}
      {/* Card rack beside */}
      <mesh position={[0.5, 1.2, 0]}>
        <boxGeometry args={[0.25, 0.8, 0.1]} />
        <meshStandardMaterial color="#78716c" roughness={0.7} />
      </mesh>
      {/* Time cards in rack */}
      {[0, 1, 2, 3, 4].map((_: unknown, i: number) => (
        <mesh key={i} position={[0.5, 1.5 - i * 0.12, 0.06]}>
          <boxGeometry args={[0.2, 0.08, 0.02]} />
          <meshStandardMaterial color="#fefce8" roughness={0.8} />
        </mesh>
      ))}
      {/* Label */}
      <Text position={[0, 1.95, 0.05]} fontSize={0.06} color="#1f2937" anchorX="center">
        TIME CLOCK
      </Text>
    </group>
  );
};

// Dock plate/bridge board at dock door
const DockPlate: React.FC<{ position: [number, number, number]; isDeployed: boolean }> = ({
  position,
  isDeployed,
}) => {
  const plateRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!plateRef.current) return;
    const plateId = `dockplate-${Math.random()}`;

    registerAnimation(plateId, 'lerp', plateRef.current, {
      target: isDeployed ? -0.15 : 0,
      speed: 0.05,
      property: 'rotation',
      axis: 'x',
    });

    return () => {
      unregisterAnimation(plateId);
    };
  }, [isDeployed]);

  return (
    <group position={position}>
      {/* Dock plate */}
      <mesh ref={plateRef} position={[0, 0, 1.5]}>
        <boxGeometry args={[3, 0.08, 3]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Tread pattern */}
      {[-1, 0, 1].map((x, i) => (
        <mesh key={i} position={[x, 0.05, 1.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.8, 2.8]} />
          <meshStandardMaterial color="#4b5563" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* Lip at trailer end */}
      <mesh position={[0, 0.08, 3]}>
        <boxGeometry args={[3, 0.15, 0.15]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.6} />
      </mesh>
      {/* Warning stripes on lip */}
      {[-1.2, -0.4, 0.4, 1.2].map((x, i) => (
        <mesh key={i} position={[x, 0.1, 3.08]}>
          <boxGeometry args={[0.3, 0.1, 0.02]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
    </group>
  );
};

// Fuel tanks on cab sides
const FuelTank: React.FC<{ position: [number, number, number]; side: 'left' | 'right' }> = ({
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
const AirTank: React.FC<{ position: [number, number, number] }> = ({ position }) => (
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

// Enhanced mudflap with company logo
const MudflapWithLogo: React.FC<{
  position: [number, number, number];
  company: string;
}> = ({ position, company }) => (
  <group position={position}>
    {/* Mudflap body */}
    <mesh>
      <boxGeometry args={[0.6, 0.7, 0.03]} />
      <meshStandardMaterial color="#1f2937" roughness={0.95} />
    </mesh>
    {/* Chrome trim top */}
    <mesh position={[0, 0.32, 0.02]}>
      <boxGeometry args={[0.58, 0.06, 0.01]} />
      <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
    </mesh>
    {/* Logo */}
    {company === 'GRAIN CO' ? (
      <>
        <mesh position={[0, 0, 0.02]}>
          <circleGeometry args={[0.2, 12]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
        </mesh>
        <Text
          position={[0, 0, 0.03]}
          fontSize={0.08}
          color="#7f1d1d"
          anchorX="center"
          anchorY="middle"
        >
          GC
        </Text>
      </>
    ) : (
      <>
        <mesh position={[0, 0, 0.02]}>
          <circleGeometry args={[0.2, 12]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.7} roughness={0.3} />
        </mesh>
        <Text
          position={[0, 0, 0.03]}
          fontSize={0.08}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          FE
        </Text>
      </>
    )}
    {/* Reflective dots */}
    {[
      [-0.2, -0.25],
      [0.2, -0.25],
      [0, -0.28],
    ].map(([x, y], i) => (
      <mesh key={i} position={[x, y, 0.02]}>
        <circleGeometry args={[0.03, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
      </mesh>
    ))}
  </group>
);

// Dock attendant/spotter figure that guides trucks
const DockSpotter: React.FC<{
  position: [number, number, number];
  isGuiding: boolean;
  rotation?: number;
}> = ({ position, isGuiding, rotation = 0 }) => {
  const spotterRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const wandRef = useRef<THREE.Group>(null);
  const animId = useRef(`spotter-${Math.random().toString(36).substr(2, 9)}`);
  const isGuidingRef = useRef(isGuiding);
  isGuidingRef.current = isGuiding;

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      if (isGuidingRef.current) {
        // Wave arms to guide truck back
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = -0.5 + Math.sin(time * 4) * 0.4;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = -0.5 + Math.sin(time * 4 + Math.PI) * 0.4;
        }
        // Bob wands
        if (wandRef.current) {
          wandRef.current.rotation.z = Math.sin(time * 4) * 0.3;
        }
      } else {
        // Idle pose
        if (leftArmRef.current) {
          leftArmRef.current.rotation.x = 0;
        }
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = 0;
        }
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group ref={spotterRef} position={position} rotation={[0, rotation, 0]}>
      {/* Hard hat */}
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.15, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 0.05, 16]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshStandardMaterial color="#d4a574" roughness={0.8} />
      </mesh>

      {/* Safety vest body */}
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[0.35, 0.45, 0.2]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} />
      </mesh>
      {/* Reflective stripes on vest */}
      {[-0.1, 0.1].map((y, i) => (
        <mesh key={i} position={[0, 1.35 + y, 0.11]}>
          <boxGeometry args={[0.34, 0.04, 0.01]} />
          <meshStandardMaterial color="#fef3c7" metalness={0.3} roughness={0.4} />
        </mesh>
      ))}

      {/* Legs */}
      {[-0.08, 0.08].map((x, i) => (
        <mesh key={i} position={[x, 0.9, 0]}>
          <boxGeometry args={[0.12, 0.5, 0.12]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
      ))}

      {/* Feet */}
      {[-0.08, 0.08].map((x, i) => (
        <mesh key={i} position={[x, 0.62, 0.04]}>
          <boxGeometry args={[0.12, 0.08, 0.18]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
      ))}

      {/* Arms with wands */}
      <mesh ref={leftArmRef} position={[-0.22, 1.4, 0]}>
        <boxGeometry args={[0.08, 0.35, 0.08]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.22, 1.4, 0]}>
        <boxGeometry args={[0.08, 0.35, 0.08]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} />
      </mesh>

      {/* Signal wands (orange cones) */}
      <group ref={wandRef}>
        <group position={[-0.22, 1.15, 0]}>
          <mesh rotation={[0, 0, 0.3]}>
            <coneGeometry args={[0.04, 0.35, 8]} />
            <meshStandardMaterial
              color="#f97316"
              emissive="#f97316"
              emissiveIntensity={isGuiding ? 0.5 : 0.1}
            />
          </mesh>
        </group>
        <group position={[0.22, 1.15, 0]}>
          <mesh rotation={[0, 0, -0.3]}>
            <coneGeometry args={[0.04, 0.35, 8]} />
            <meshStandardMaterial
              color="#f97316"
              emissive="#f97316"
              emissiveIntensity={isGuiding ? 0.5 : 0.1}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// Weight scale at yard entrance
const WeightScale: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const displayRef = useRef<THREE.MeshStandardMaterial>(null);
  const [weight] = React.useState(() => Math.floor(35000 + Math.random() * 15000));

  useEffect(() => {
    if (!displayRef.current) return;
    const id = `scale-${Math.random()}`;
    registerAnimation(id, 'pulse', displayRef.current, { speed: 10, min: 0.7, max: 0.9 });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      {/* Scale platform */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[4, 0.2, 12]} />
        <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Platform grip pattern */}
      {[-1.5, -0.5, 0.5, 1.5].map((x, i) => (
        <mesh key={i} position={[x, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.8, 11]} />
          <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}

      {/* Approach ramps */}
      <mesh position={[0, 0.05, 6.5]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[4.2, 0.15, 1.5]} />
        <meshStandardMaterial color="#64748b" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.05, -6.5]} rotation={[-0.1, 0, 0]}>
        <boxGeometry args={[4.2, 0.15, 1.5]} />
        <meshStandardMaterial color="#64748b" roughness={0.7} />
      </mesh>

      {/* Control booth */}
      <group position={[3.5, 0, 0]}>
        {/* Booth structure */}
        <mesh position={[0, 1.5, 0]}>
          <boxGeometry args={[2, 3, 2.5]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.7} />
        </mesh>
        {/* Windows */}
        <mesh position={[-1.01, 1.8, 0]}>
          <planeGeometry args={[1.8, 1.2]} />
          <meshStandardMaterial
            color="#1e3a5f"
            metalness={0.9}
            roughness={0.1}
            transparent
            opacity={0.8}
          />
        </mesh>
        {/* Roof */}
        <mesh position={[0, 3.1, 0]}>
          <boxGeometry args={[2.4, 0.15, 2.9]} />
          <meshStandardMaterial color="#64748b" roughness={0.6} />
        </mesh>
        {/* Door */}
        <mesh position={[1.01, 1.2, 0]}>
          <boxGeometry args={[0.05, 2.2, 0.9]} />
          <meshStandardMaterial color="#374151" roughness={0.6} />
        </mesh>

        {/* Digital display outside booth */}
        <mesh position={[-1.3, 2.5, 0]}>
          <boxGeometry args={[0.1, 0.6, 1.2]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        <mesh position={[-1.36, 2.5, 0]}>
          <planeGeometry args={[0.5, 1]} />
          <meshStandardMaterial
            ref={displayRef}
            color="#22c55e"
            emissive="#22c55e"
            emissiveIntensity={0.8}
          />
        </mesh>
        <Text
          position={[-1.38, 2.5, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          fontSize={0.15}
          color="#000000"
          anchorX="center"
          anchorY="middle"
        >
          {weight.toLocaleString()} LBS
        </Text>
      </group>

      {/* Warning signs */}
      <Text
        position={[0, 0.25, -7]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
      >
        WEIGH STATION
      </Text>

      {/* Ground markings - raised with depthWrite for z-fighting prevention */}
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2, 24]} />
        <meshStandardMaterial
          color="#fbbf24"
          transparent
          opacity={0.5}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    </group>
  );
};

// Landing gear legs - support trailer when detached from cab
const LandingGear: React.FC<{ position: [number, number, number] }> = ({ position }) => (
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
const DEFTank: React.FC<{ position: [number, number, number]; side: 'left' | 'right' }> = ({
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
const CBAntennaComponent: React.FC<{ position: [number, number, number] }> = ({ position }) => (
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
const SunVisor: React.FC<{ position: [number, number, number]; color: string }> = ({
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

// Yard Jockey / Spotter Truck
const YardJockey: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const jockeyRef = useRef<THREE.Group>(null);
  const animId = useRef(`yardjockey-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, { rotation }, (time, _delta, _mesh, data) => {
      if (jockeyRef.current) {
        jockeyRef.current.position.x = Math.sin(time * 0.15) * 8;
        jockeyRef.current.rotation.y =
          Math.cos(time * 0.15) * 0.3 + (data as { rotation: number }).rotation;
      }
    });
    return () => unregisterAnimation(id);
  }, [rotation]);

  return (
    <group position={position}>
      <group ref={jockeyRef}>
        <mesh position={[0, 1.3, 0]}>
          <boxGeometry args={[2, 1.6, 2.5]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.8, 1.1]} rotation={[0.2, 0, 0]}>
          <planeGeometry args={[1.7, 1]} />
          <meshStandardMaterial color="#1e3a5f" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0.9, -0.5]}>
          <cylinderGeometry args={[0.5, 0.5, 0.1, 12]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
        </mesh>
        {[
          [-0.9, 0.8],
          [0.9, 0.8],
          [-0.9, -0.6],
          [0.9, -0.6],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.4, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.4, 0.4, 0.25, 12]} />
            <meshStandardMaterial color="#1f2937" roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 2.2, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.15, 8]} />
          <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.8} />
        </mesh>
        <Text
          position={[1.01, 1.3, 0]}
          rotation={[0, Math.PI / 2, 0]}
          fontSize={0.25}
          color="#1f2937"
          anchorX="center"
          anchorY="middle"
        >
          YARD
        </Text>
      </group>
    </group>
  );
};

// Tire Inspection Area
const TireInspectionArea: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    <mesh position={[0, 0.05, 0]}>
      <boxGeometry args={[4, 0.1, 8]} />
      <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
    </mesh>
    {[-3, -2, -1, 0, 1, 2, 3].map((z, i) => (
      <mesh key={i} position={[0, 0.11, z]}>
        <boxGeometry args={[3.8, 0.02, 0.15]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
      </mesh>
    ))}
    {[-2.2, 2.2].map((x, i) => (
      <group key={i} position={[x, 0, 0]}>
        <mesh position={[0, 0.5, -3.5]}>
          <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.5, 3.5]}>
          <cylinderGeometry args={[0.04, 0.04, 1, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 7, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.6} />
        </mesh>
      </group>
    ))}
    <group position={[3, 0, 0]}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.3, 0]}>
        <boxGeometry args={[1.2, 0.6, 0.05]} />
        <meshStandardMaterial color="#1e40af" roughness={0.5} />
      </mesh>
      <Text
        position={[0, 2.35, 0.03]}
        fontSize={0.12}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        TIRE CHECK
      </Text>
      <Text
        position={[0, 2.2, 0.03]}
        fontSize={0.08}
        color="#fef3c7"
        anchorX="center"
        anchorY="middle"
      >
        REQUIRED
      </Text>
    </group>
    <group position={[-3, 0, 0]}>
      <mesh position={[0, 0.6, 0]}>
        <boxGeometry args={[0.6, 1.2, 0.4]} />
        <meshStandardMaterial color="#dc2626" roughness={0.6} />
      </mesh>
    </group>
  </group>
);

// Fuel Island / Pump Station
const FuelIsland: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    <mesh position={[0, 0.15, 0]}>
      <boxGeometry args={[3, 0.3, 8]} />
      <meshStandardMaterial color="#fbbf24" roughness={0.7} />
    </mesh>
    {[-2, 2].map((z, i) => (
      <group key={i} position={[0, 0, z]}>
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[0.8, 1.8, 0.6]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
        </mesh>
        <mesh position={[0.41, 1.4, 0]}>
          <boxGeometry args={[0.02, 0.4, 0.5]} />
          <meshStandardMaterial color="#1f2937" emissive="#22c55e" emissiveIntensity={0.3} />
        </mesh>
      </group>
    ))}
    <mesh position={[0, 4.5, 0]}>
      <boxGeometry args={[6, 0.2, 10]} />
      <meshStandardMaterial color="#e2e8f0" roughness={0.5} />
    </mesh>
    {[
      [-2.5, -4],
      [-2.5, 4],
      [2.5, -4],
      [2.5, 4],
    ].map(([x, z], i) => (
      <mesh key={i} position={[x, 2.3, z]}>
        <cylinderGeometry args={[0.1, 0.1, 4.3, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
    ))}
    <mesh position={[0, 5.5, 0]}>
      <boxGeometry args={[3, 1.5, 0.2]} />
      <meshStandardMaterial color="#1f2937" roughness={0.6} />
    </mesh>
    <Text
      position={[0, 5.8, 0.11]}
      fontSize={0.4}
      color="#22c55e"
      anchorX="center"
      anchorY="middle"
    >
      DIESEL
    </Text>
    <Text
      position={[0, 5.3, 0.11]}
      fontSize={0.35}
      color="#ffffff"
      anchorX="center"
      anchorY="middle"
    >
      $3.89/GAL
    </Text>
  </group>
);

// Guard Shack at Entrance Gate
const GuardShack: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const gateRef = useRef<THREE.Mesh>(null);
  const gateOpenRef = useRef(false);
  const animId = useRef(`guard-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      const shouldOpen = Math.sin(time * 0.3) > 0.5;
      gateOpenRef.current = shouldOpen;
      if (gateRef.current) {
        gateRef.current.rotation.y = THREE.MathUtils.lerp(
          gateRef.current.rotation.y,
          shouldOpen ? -Math.PI / 2 : 0,
          0.05
        );
      }
    });
    return () => unregisterAnimation(id);
  }, []);
  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[3, 2.8, 3]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
      </mesh>
      <mesh position={[0, 3, 0]}>
        <boxGeometry args={[3.5, 0.2, 3.5]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} />
      </mesh>
      {[
        [1.51, 0],
        [-1.51, 0],
        [0, 1.51],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 1.6, z]} rotation={[0, i < 2 ? Math.PI / 2 : 0, 0]}>
          <planeGeometry args={[2, 1.2]} />
          <meshStandardMaterial
            color="#1e3a5f"
            metalness={0.9}
            roughness={0.1}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
      <mesh position={[0, 1.1, -1.51]}>
        <boxGeometry args={[0.9, 2, 0.05]} />
        <meshStandardMaterial color="#374151" roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.3, 1.5]}>
        <boxGeometry args={[0.3, 0.2, 0.3]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.5} />
      </mesh>
      <pointLight position={[0, 3, 2]} intensity={15} distance={15} color="#fef3c7" />
      <group position={[3, 0, 0]}>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[0.4, 2, 0.4]} />
          <meshStandardMaterial color="#dc2626" roughness={0.6} />
        </mesh>
        <mesh ref={gateRef} position={[2.5, 1.1, 0]}>
          <boxGeometry args={[5, 0.15, 0.1]} />
          <meshStandardMaterial color="#dc2626" roughness={0.6} />
        </mesh>
      </group>
      <group position={[-3, 0, 0]}>
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 3, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 2.8, 0]} rotation={[0, 0, Math.PI / 8]}>
          <cylinderGeometry args={[0.4, 0.4, 0.05, 8]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        <Text
          position={[0, 2.8, 0.03]}
          fontSize={0.15}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          STOP
        </Text>
      </group>
      <Text
        position={[0, 2.5, 1.52]}
        fontSize={0.25}
        color="#1e40af"
        anchorX="center"
        anchorY="middle"
      >
        SECURITY
      </Text>
    </group>
  );
};

// No Idling sign component
const NoIdlingSign: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    {/* Post */}
    <mesh position={[0, 1.2, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 2.4, 8]} />
      <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
    </mesh>
    {/* Sign board */}
    <mesh position={[0, 2.2, 0.03]}>
      <boxGeometry args={[0.8, 0.6, 0.05]} />
      <meshStandardMaterial color="#ffffff" roughness={0.5} />
    </mesh>
    {/* Red circle with slash */}
    <mesh position={[0, 2.2, 0.06]}>
      <ringGeometry args={[0.18, 0.22, 24]} />
      <meshStandardMaterial color="#dc2626" />
    </mesh>
    {/* Slash */}
    <mesh position={[0, 2.2, 0.065]} rotation={[0, 0, Math.PI / 4]}>
      <boxGeometry args={[0.4, 0.04, 0.01]} />
      <meshStandardMaterial color="#dc2626" />
    </mesh>
    <Text
      position={[0, 1.95, 0.06]}
      fontSize={0.08}
      color="#1f2937"
      anchorX="center"
      anchorY="middle"
    >
      NO IDLING
    </Text>
    <Text
      position={[0, 1.85, 0.06]}
      fontSize={0.06}
      color="#6b7280"
      anchorX="center"
      anchorY="middle"
    >
      TURN OFF ENGINE
    </Text>
  </group>
);

// Road tunnel - clean mountain tunnel for trucks to disappear into
const RoadTunnel: React.FC<{
  position: [number, number, number];
  rotation?: number;
  roadWidth?: number;
}> = ({ position, rotation = 0, roadWidth = 10 }) => {
  const tunnelWidth = roadWidth + 2;
  const tunnelHeight = 7;
  const tunnelDepth = 90;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* ========== MOUNTAIN/HILLSIDE ========== */}
      {/* Sloped hillside - left */}
      <mesh position={[-tunnelWidth / 2 - 6, 4, -tunnelDepth / 2]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[12, 10, tunnelDepth + 10]} />
        <meshStandardMaterial color="#5a6a4a" roughness={0.95} />
      </mesh>
      {/* Sloped hillside - right */}
      <mesh position={[tunnelWidth / 2 + 6, 4, -tunnelDepth / 2]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[12, 10, tunnelDepth + 10]} />
        <meshStandardMaterial color="#5a6a4a" roughness={0.95} />
      </mesh>
      {/* Mountain top */}
      <mesh position={[0, 12, -tunnelDepth / 2]}>
        <boxGeometry args={[tunnelWidth + 24, 6, tunnelDepth + 10]} />
        <meshStandardMaterial color="#6a7a5a" roughness={0.95} />
      </mesh>

      {/* ========== TUNNEL PORTAL ========== */}
      {/* Concrete portal frame - left */}
      <mesh position={[-tunnelWidth / 2 - 0.5, tunnelHeight / 2, 0]}>
        <boxGeometry args={[1, tunnelHeight, 2]} />
        <meshStandardMaterial color="#4b5563" roughness={0.8} />
      </mesh>
      {/* Concrete portal frame - right */}
      <mesh position={[tunnelWidth / 2 + 0.5, tunnelHeight / 2, 0]}>
        <boxGeometry args={[1, tunnelHeight, 2]} />
        <meshStandardMaterial color="#4b5563" roughness={0.8} />
      </mesh>
      {/* Concrete portal top */}
      <mesh position={[0, tunnelHeight + 0.5, 0]}>
        <boxGeometry args={[tunnelWidth + 2, 1, 2]} />
        <meshStandardMaterial color="#4b5563" roughness={0.8} />
      </mesh>

      {/* ========== TUNNEL INTERIOR ========== */}
      {/* Ceiling */}
      <mesh position={[0, tunnelHeight, -tunnelDepth / 2]}>
        <boxGeometry args={[tunnelWidth, 0.3, tunnelDepth]} />
        <meshStandardMaterial color="#111111" roughness={1} />
      </mesh>
      {/* Left wall */}
      <mesh position={[-tunnelWidth / 2, tunnelHeight / 2, -tunnelDepth / 2]}>
        <boxGeometry args={[0.3, tunnelHeight, tunnelDepth]} />
        <meshStandardMaterial color="#151515" roughness={1} />
      </mesh>
      {/* Right wall */}
      <mesh position={[tunnelWidth / 2, tunnelHeight / 2, -tunnelDepth / 2]}>
        <boxGeometry args={[0.3, tunnelHeight, tunnelDepth]} />
        <meshStandardMaterial color="#151515" roughness={1} />
      </mesh>
      {/* Back wall - pure black void */}
      <mesh position={[0, tunnelHeight / 2, -tunnelDepth]}>
        <planeGeometry args={[tunnelWidth, tunnelHeight]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* ========== ROAD SURFACE ========== */}
      {/* Road into tunnel */}
      <mesh position={[0, 0.05, -tunnelDepth / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadWidth, tunnelDepth]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.95} />
      </mesh>
      {/* Road approach */}
      <mesh position={[0, 0.06, 10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[roadWidth, 20]} />
        <meshStandardMaterial color="#1c1c1c" roughness={0.95} />
      </mesh>

      {/* Center line marking */}
      <mesh position={[0, 0.07, 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.15, 10]} />
        <meshBasicMaterial color="#fbbf24" />
      </mesh>
    </group>
  );
};

// Pallet staging area with stacked pallets
const PalletStaging: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    {/* Ground marking - raised and with polygon offset to prevent z-fighting */}
    <mesh
      position={[0, FLOOR_LAYERS.truckMarkings, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      <planeGeometry args={[4, 6]} />
      <meshStandardMaterial
        color="#fbbf24"
        transparent
        opacity={0.3}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
        polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        depthWrite={false}
      />
    </mesh>
    {/* Stacked pallets */}
    {[
      [-1, 0],
      [1, 0],
      [-1, -2],
      [1, -2],
    ].map(([x, z], i) => (
      <group key={i} position={[x, 0, z]}>
        {/* Pallet */}
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[1, 0.15, 1.2]} />
          <meshStandardMaterial color="#92400e" roughness={0.9} />
        </mesh>
        {/* Stacked flour sacks */}
        {[
          [0, 0],
          [-0.3, 0],
          [0.3, 0],
          [0, 0.35],
          [-0.2, 0.35],
          [0.2, 0.35],
        ].map(([sx, sy], j) => (
          <mesh key={j} position={[sx, 0.35 + sy, 0]}>
            <boxGeometry args={[0.35, 0.4, 0.5]} />
            <meshStandardMaterial color="#f5f5f4" roughness={0.8} />
          </mesh>
        ))}
      </group>
    ))}
    {/* Staging area sign */}
    <Text
      position={[0, 0.02, 2.5]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.3}
      color="#92400e"
      anchorX="center"
      anchorY="middle"
    >
      STAGING AREA
    </Text>
  </group>
);

// Roll-up dock door component
const RollUpDoor: React.FC<{
  position: [number, number, number];
  isOpen: boolean;
}> = ({ position, isOpen }) => {
  const doorRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!doorRef.current) return;
    const posId = `door-pos-${Math.random()}`;
    const scaleId = `door-scale-${Math.random()}`;

    // Lerp Position Y
    registerAnimation(posId, 'lerp', doorRef.current, {
      target: isOpen ? 4.5 : 2,
      property: 'position',
      axis: 'y',
      speed: 0.05,
    });

    // Lerp Scale Y
    registerAnimation(scaleId, 'lerp', doorRef.current, {
      target: isOpen ? 0.2 : 1,
      property: 'scale',
      axis: 'y',
      speed: 0.05,
    });

    return () => {
      unregisterAnimation(posId);
      unregisterAnimation(scaleId);
    };
  }, [isOpen]);

  return (
    <group position={position}>
      {/* Door frame - narrowed to fit 10-unit dock opening */}
      <mesh position={[-4.7, 2.5, 0]}>
        <boxGeometry args={[0.3, 5, 0.2]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[4.7, 2.5, 0]}>
        <boxGeometry args={[0.3, 5, 0.2]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 5.1, 0]}>
        <boxGeometry args={[9.7, 0.3, 0.2]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Roll-up door */}
      <mesh ref={doorRef} position={[0, 2, 0.1]}>
        <boxGeometry args={[9, 4, 0.15]} />
        <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Door panels (grooves) */}
      {[-1.5, -0.5, 0.5, 1.5].map((y, i) => (
        <mesh key={i} position={[0, y + 2, 0.18]}>
          <boxGeometry args={[8.8, 0.05, 0.01]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
    </group>
  );
};

// Dock shelter (compresses against trailer)
const DockShelter: React.FC<{
  position: [number, number, number];
  isCompressed: boolean;
}> = ({ position, isCompressed }) => {
  const topRef = useRef<THREE.Mesh>(null);
  const leftRef = useRef<THREE.Mesh>(null);
  const rightRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const targetZ = isCompressed ? 0.5 : 1.5;
    const speed = 0.05;
    const ids: string[] = [];

    if (topRef.current) {
      const id = `shelter-top-${Math.random()}`;
      registerAnimation(id, 'lerp', topRef.current, {
        target: targetZ,
        property: 'position',
        axis: 'z',
        speed,
      });
      ids.push(id);
    }
    if (leftRef.current) {
      const id = `shelter-left-${Math.random()}`;
      registerAnimation(id, 'lerp', leftRef.current, {
        target: targetZ,
        property: 'position',
        axis: 'z',
        speed,
      });
      ids.push(id);
    }
    if (rightRef.current) {
      const id = `shelter-right-${Math.random()}`;
      registerAnimation(id, 'lerp', rightRef.current, {
        target: targetZ,
        property: 'position',
        axis: 'z',
        speed,
      });
      ids.push(id);
    }

    return () => ids.forEach((id) => unregisterAnimation(id));
  }, [isCompressed]);

  return (
    <group position={position}>
      {/* Side curtains */}
      <mesh ref={leftRef} position={[-2.2, 2, 1.5]}>
        <boxGeometry args={[0.3, 3.5, 3]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      <mesh ref={rightRef} position={[2.2, 2, 1.5]}>
        <boxGeometry args={[0.3, 3.5, 3]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      {/* Top curtain */}
      <mesh ref={topRef} position={[0, 3.8, 1.5]}>
        <boxGeometry args={[4.1, 0.3, 3]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      {/* Yellow warning frame */}
      <mesh position={[-2.35, 2, 0]}>
        <boxGeometry args={[0.1, 4, 0.2]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[2.35, 2, 0]}>
        <boxGeometry args={[0.1, 4, 0.2]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
      <mesh position={[0, 4.05, 0]}>
        <boxGeometry args={[4.8, 0.1, 0.2]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
    </group>
  );
};

// Headlight beam (light cone)
const HeadlightBeam: React.FC<{
  position: [number, number, number];
  rotation: [number, number, number];
  isOn: boolean;
}> = ({ position, rotation, isOn }) => {
  if (!isOn) return null;

  return (
    <group position={position} rotation={rotation}>
      {/* Cone rotated to point forward (Z direction) - tip at light source, base spreading forward */}
      <mesh position={[0, 0, 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.5, 4, 8, 1, true]} />
        <meshBasicMaterial
          color="#fef3c7"
          transparent
          opacity={0.08}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <spotLight
        position={[0, 0, 0]}
        target-position={[0, 0, 5]}
        angle={0.4}
        penumbra={0.5}
        intensity={5}
        distance={20}
        color="#fef3c7"
      />
    </group>
  );
};

// License plate component
const LicensePlate: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  plateNumber: string;
}> = ({ position, rotation = [0, 0, 0], plateNumber }) => (
  <group position={position} rotation={rotation}>
    {/* Plate background */}
    <mesh>
      <boxGeometry args={[0.8, 0.4, 0.02]} />
      <meshStandardMaterial color="#ffffff" roughness={0.3} />
    </mesh>
    {/* State name */}
    <Text
      position={[0, 0.12, 0.015]}
      fontSize={0.06}
      color="#1e40af"
      anchorX="center"
      anchorY="middle"
    >
      ILLINOIS
    </Text>
    {/* Plate number */}
    <Text
      position={[0, -0.02, 0.015]}
      fontSize={0.12}
      color="#1f2937"
      anchorX="center"
      anchorY="middle"
      letterSpacing={0.05}
    >
      {plateNumber}
    </Text>
    {/* DOT number */}
    <Text
      position={[0, -0.14, 0.015]}
      fontSize={0.04}
      color="#64748b"
      anchorX="center"
      anchorY="middle"
    >
      DOT 1234567
    </Text>
  </group>
);

// Dock status light component
const DockStatusLight: React.FC<{
  position: [number, number, number];
  isOccupied: boolean;
}> = ({ position, isOccupied }) => {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.4, 0.6, 0.2]} />
        <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.11]}>
        <circleGeometry args={[0.15, 16]} />
        <meshStandardMaterial
          color={isOccupied ? '#22c55e' : '#ef4444'}
          emissive={isOccupied ? '#22c55e' : '#ef4444'}
          emissiveIntensity={0.8}
        />
      </mesh>
      <pointLight
        position={[0, 0, 0.3]}
        color={isOccupied ? '#22c55e' : '#ef4444'}
        intensity={2}
        distance={5}
      />
    </group>
  );
};

// Dock leveler component with animation
const DockLeveler: React.FC<{
  position: [number, number, number];
  isDeployed: boolean;
}> = ({ position, isDeployed }) => {
  const levelerRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!levelerRef.current) return;
    const id = `leveler-${Math.random()}`;
    const targetRotation = isDeployed ? -0.15 : 0;

    registerAnimation(id, 'lerp', levelerRef.current, {
      target: targetRotation,
      property: 'rotation',
      axis: 'x',
      speed: 0.05,
    });

    return () => unregisterAnimation(id);
  }, [isDeployed]);

  return (
    <group position={position}>
      <mesh ref={levelerRef} position={[0, 0, 2]}>
        <boxGeometry args={[8, 0.15, 4]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.1, 4]}>
        <boxGeometry args={[8, 0.1, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
};

export const TruckBay: React.FC<TruckBayProps> = ({ productionSpeed }) => {
  const shippingTruckRef = useRef<THREE.Group>(null);
  const receivingTruckRef = useRef<THREE.Group>(null);
  const shippingStateRef = useRef<TruckPhase>('entering');
  const receivingStateRef = useRef<TruckPhase>('entering');
  const shippingDockedRef = useRef(false);
  const receivingDockedRef = useRef(false);
  const shippingDoorsOpenRef = useRef(false);
  const receivingDoorsOpenRef = useRef(false);
  const backupBeeperRef = useRef<{ shipping: boolean; receiving: boolean }>({
    shipping: false,
    receiving: false,
  });

  const shippingWheelRotation = useRef(0);
  const receivingWheelRotation = useRef(0);
  const shippingThrottleRef = useRef(0);
  const receivingThrottleRef = useRef(0);
  const shippingTrailerAngleRef = useRef(0);
  const receivingTrailerAngleRef = useRef(0);

  // Dock status updates
  const updateDockStatus = useProductionStore((state) => state.updateDockStatus);
  const setTruckDocked = useProductionStore((state) => state.setTruckDocked);
  const lastDockUpdateRef = useRef({ receiving: '', shipping: '' });
  const lastDockedStateRef = useRef({ shipping: false, receiving: false });

  // PERFORMANCE: Consolidate store subscriptions with useShallow
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const graphicsQuality = useGraphicsStore((state) => state.graphics.quality);
  const showDecorativeAnimations = graphicsQuality === 'ultra';

  useEffect(() => {
    audioManager.startTruckEngine('shipping-truck', true);
    audioManager.startTruckEngine('receiving-truck', true);

    return () => {
      audioManager.stopTruckEngine('shipping-truck');
      audioManager.stopTruckEngine('receiving-truck');
    };
  }, []);

  useFrame((state, delta) => {
    if (!isTabVisible) return;
    const time = state.clock.elapsedTime;
    const adjustedTime = time * (productionSpeed * 0.25 + 0.2);
    const CYCLE_LENGTH = 60;

    // Shipping truck animation
    if (shippingTruckRef.current) {
      const cycle = adjustedTime % CYCLE_LENGTH;
      const truckState = calculateShippingTruckState(cycle, time);

      shippingTruckRef.current.position.x = truckState.x;
      shippingTruckRef.current.position.z = truckState.z;
      shippingTruckRef.current.rotation.y = truckState.rotation;

      shippingWheelRotation.current += truckState.speed * delta * 5;
      shippingThrottleRef.current = truckState.throttle;
      shippingTrailerAngleRef.current = truckState.trailerAngle;

      shippingDockedRef.current =
        truckState.phase === 'docked' ||
        truckState.phase === 'final_adjustment' ||
        truckState.phase === 'preparing_to_leave';

      // Update store when docked state changes (for forklift speed boost)
      if (shippingDockedRef.current !== lastDockedStateRef.current.shipping) {
        lastDockedStateRef.current.shipping = shippingDockedRef.current;
        setTruckDocked('shipping', shippingDockedRef.current);
      }

      shippingDoorsOpenRef.current = truckState.doorsOpen;

      const shouldBeep = truckState.reverseLights;
      if (shouldBeep !== backupBeeperRef.current.shipping) {
        backupBeeperRef.current.shipping = shouldBeep;
        if (shouldBeep) {
          audioManager.startBackupBeeper?.('shipping-truck');
        } else {
          audioManager.stopBackupBeeper?.('shipping-truck');
        }
      }

      if (truckState.phase !== shippingStateRef.current) {
        if (truckState.phase === 'docked' && shippingStateRef.current === 'final_adjustment') {
          audioManager.playDoorOpen();
          audioManager.playTruckArrival();
          audioManager.updateTruckEngine('shipping-truck', false);
          audioManager.playAirBrake?.();
        } else if (
          truckState.phase === 'preparing_to_leave' &&
          shippingStateRef.current === 'docked'
        ) {
          // Truck horn to signal departure
          audioManager.playTruckHorn?.('shipping-truck', false);
        } else if (
          truckState.phase === 'pulling_out' &&
          shippingStateRef.current === 'preparing_to_leave'
        ) {
          audioManager.playDoorClose();
          audioManager.playTruckDeparture();
          audioManager.updateTruckEngine('shipping-truck', true);
        } else if (truckState.phase === 'stopping_to_back') {
          audioManager.playAirBrake?.();
        } else if (truckState.phase === 'slowing' && shippingStateRef.current === 'entering') {
          // Jake brake when slowing down from highway speed
          audioManager.playJakeBrake?.('shipping-truck', 1.5);
        } else if (truckState.phase === 'turning_in' && shippingStateRef.current === 'slowing') {
          // Tire squeal during tight turn
          audioManager.playTireSqueal?.('shipping-truck', 0.3);
        }
        shippingStateRef.current = truckState.phase;
      }
    }

    // Receiving truck animation
    if (receivingTruckRef.current) {
      const cycle = (adjustedTime + CYCLE_LENGTH / 2) % CYCLE_LENGTH;
      const truckState = calculateReceivingTruckState(cycle, time);

      receivingTruckRef.current.position.x = truckState.x;
      receivingTruckRef.current.position.z = truckState.z;
      receivingTruckRef.current.rotation.y = truckState.rotation;

      receivingWheelRotation.current += truckState.speed * delta * 5;
      receivingThrottleRef.current = truckState.throttle;
      receivingTrailerAngleRef.current = truckState.trailerAngle;

      receivingDockedRef.current =
        truckState.phase === 'docked' ||
        truckState.phase === 'final_adjustment' ||
        truckState.phase === 'preparing_to_leave';

      // Update store when docked state changes (for forklift speed boost)
      if (receivingDockedRef.current !== lastDockedStateRef.current.receiving) {
        lastDockedStateRef.current.receiving = receivingDockedRef.current;
        setTruckDocked('receiving', receivingDockedRef.current);
      }

      receivingDoorsOpenRef.current = truckState.doorsOpen;

      const shouldBeep = truckState.reverseLights;
      if (shouldBeep !== backupBeeperRef.current.receiving) {
        backupBeeperRef.current.receiving = shouldBeep;
        if (shouldBeep) {
          audioManager.startBackupBeeper?.('receiving-truck');
        } else {
          audioManager.stopBackupBeeper?.('receiving-truck');
        }
      }

      if (truckState.phase !== receivingStateRef.current) {
        if (truckState.phase === 'docked' && receivingStateRef.current === 'final_adjustment') {
          audioManager.playDoorOpen();
          audioManager.playTruckArrival();
          audioManager.updateTruckEngine('receiving-truck', false);
          audioManager.playAirBrake?.();
        } else if (
          truckState.phase === 'preparing_to_leave' &&
          receivingStateRef.current === 'docked'
        ) {
          // Truck horn to signal departure
          audioManager.playTruckHorn?.('receiving-truck', false);
        } else if (
          truckState.phase === 'pulling_out' &&
          receivingStateRef.current === 'preparing_to_leave'
        ) {
          audioManager.playDoorClose();
          audioManager.playTruckDeparture();
          audioManager.updateTruckEngine('receiving-truck', true);
        } else if (truckState.phase === 'stopping_to_back') {
          audioManager.playAirBrake?.();
        } else if (truckState.phase === 'slowing' && receivingStateRef.current === 'entering') {
          // Jake brake when slowing down from highway speed
          audioManager.playJakeBrake?.('receiving-truck', 1.5);
        } else if (truckState.phase === 'turning_in' && receivingStateRef.current === 'slowing') {
          // Tire squeal during tight turn
          audioManager.playTireSqueal?.('receiving-truck', 0.3);
        }
        receivingStateRef.current = truckState.phase;
      }

      // Update dock status for HolographicDisplays
      // Receiving truck phases: 0-34 arriving, 34-50 docked/loading, 50-60 departing
      const receivingCycle = (adjustedTime + CYCLE_LENGTH / 2) % CYCLE_LENGTH;
      let receivingStatus: 'arriving' | 'loading' | 'departing' | 'clear';
      let receivingEta: number;

      if (receivingCycle < 34) {
        receivingStatus = 'arriving';
        // Convert cycle units to approximate minutes (cycle 34 = docked)
        receivingEta = Math.ceil((34 - receivingCycle) / 3);
      } else if (receivingCycle < 50) {
        receivingStatus = 'loading';
        // Time remaining for loading
        receivingEta = Math.ceil((50 - receivingCycle) / 3);
      } else {
        receivingStatus = 'departing';
        receivingEta = 0;
      }

      // Only update store when status changes to avoid unnecessary re-renders
      const receivingKey = `${receivingStatus}-${receivingEta}`;
      if (receivingKey !== lastDockUpdateRef.current.receiving) {
        lastDockUpdateRef.current.receiving = receivingKey;
        updateDockStatus('receiving', { status: receivingStatus, etaMinutes: receivingEta });
      }

      // Shipping truck phases: 0-34 arriving, 34-50 docked/loading, 50-60 departing
      const shippingCycle = adjustedTime % CYCLE_LENGTH;
      let shippingStatus: 'arriving' | 'loading' | 'departing' | 'clear';
      let shippingEta: number;

      if (shippingCycle < 34) {
        shippingStatus = 'arriving';
        shippingEta = Math.ceil((34 - shippingCycle) / 3);
      } else if (shippingCycle < 50) {
        shippingStatus = 'loading';
        shippingEta = Math.ceil((50 - shippingCycle) / 3);
      } else {
        shippingStatus = 'departing';
        shippingEta = 0;
      }

      const shippingKey = `${shippingStatus}-${shippingEta}`;
      if (shippingKey !== lastDockUpdateRef.current.shipping) {
        lastDockUpdateRef.current.shipping = shippingKey;
        updateDockStatus('shipping', { status: shippingStatus, etaMinutes: shippingEta });
      }
    }
  });

  const getShippingState = (time: number) => {
    const adjustedTime = time * (productionSpeed * 0.25 + 0.2);
    return calculateShippingTruckState(adjustedTime % 60, time);
  };

  const getReceivingState = (time: number) => {
    const adjustedTime = time * (productionSpeed * 0.25 + 0.2);
    return calculateReceivingTruckState((adjustedTime + 30) % 60, time);
  };

  return (
    <group>
      <TruckAnimationManager />
      {/* ========== SHIPPING DOCK (Front of building, z=50) ========== */}
      {/* Wall is at z=48, so dock elements must be at z>=48 to not clip */}
      <group position={[0, 0, 50]}>
        {/* Dock platform - split into two sections with forklift channel in center */}
        {/* Left platform section */}
        <mesh position={[-3.25, 1, 1.2]} receiveShadow castShadow>
          <boxGeometry args={[2.5, 2, 5.8]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
        {/* Right platform section */}
        <mesh position={[3.25, 1, 1.2]} receiveShadow castShadow>
          <boxGeometry args={[2.5, 2, 5.8]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
        {/* Forklift channel floor (sunken slightly for visual distinction) */}
        <mesh position={[0, 0.15, 1.2]} receiveShadow>
          <boxGeometry args={[4, 0.3, 5.8]} />
          <meshStandardMaterial color="#374151" roughness={0.9} />
        </mesh>
        {/* Yellow safety stripes on channel edges */}
        <mesh position={[-1.85, 0.32, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 5.8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        <mesh position={[1.85, 0.32, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 5.8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>

        {/* Dock bumpers - centered for single bay (narrower to fit platform) */}
        {[-3.5, -1.75, 0, 1.75, 3.5].map((x, i) => (
          <mesh key={i} position={[x, 0.8, 0.2]}>
            <boxGeometry args={[0.8, 1.2, 0.6]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}

        {/* ===== TRUCK GROOVE - Single centered channel for truck positioning ===== */}
        <group position={[0, 0, 8]}>
          {/* Sunken groove floor */}
          <mesh position={[0, -0.3, 0]} receiveShadow>
            <boxGeometry args={[4.5, 0.1, 18]} />
            <meshStandardMaterial color="#1c1c1c" roughness={0.95} />
          </mesh>
          {/* Groove side walls */}
          <mesh position={[-2.4, -0.15, 0]}>
            <boxGeometry args={[0.3, 0.5, 18]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
          <mesh position={[2.4, -0.15, 0]}>
            <boxGeometry args={[0.3, 0.5, 18]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
          {/* Yellow warning stripes on groove edges - raised to prevent z-fighting */}
          <mesh position={[-2.1, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 18]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          <mesh position={[2.1, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 18]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        </group>

        {/* Single dock leveler - centered (at wall opening) */}
        <DockLeveler position={[0, 2, -1.5]} isDeployed={shippingDockedRef.current} />

        {/* Roll-up dock door - at wall opening */}
        <RollUpDoor position={[0, 0, -1.8]} isOpen={shippingDockedRef.current} />

        {/* Dock shelter - centered (in front of wall) */}
        <DockShelter position={[0, 0, 1]} isCompressed={shippingDockedRef.current} />

        {/* Status lights for single bay */}
        <DockStatusLight position={[-5, 4, -1.8]} isOccupied={shippingDockedRef.current} />
        <DockStatusLight position={[5, 4, -1.8]} isOccupied={shippingDockedRef.current} />

        {/* Concrete bollards around dock - single bay */}
        <OptimizedBollardInstances
          positions={[
            [-5.5, 0, 2],
            [5.5, 0, 2],
            [-5.5, 0, 5],
            [5.5, 0, 5],
          ]}
        />

        <Text
          position={[0, 6, -1.5]}
          fontSize={1.2}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#000"
        >
          SHIPPING
        </Text>

        <Text
          position={[0, 4.5, -1.5]}
          fontSize={0.5}
          color="#22c55e"
          anchorX="center"
          anchorY="middle"
        >
          DOCK 1 - OUTBOUND
        </Text>

        {/* Pallet staging area - moved outside dock to avoid wall clipping */}
        <PalletStaging position={[12, 0, 5]} />

        {/* Wheel chocks - deployed when truck is docked (centered bay) */}
        <WheelChock position={[-1.5, 0, 10]} rotation={0} isDeployed={shippingDockedRef.current} />
        <WheelChock position={[1.5, 0, 10]} rotation={0} isDeployed={shippingDockedRef.current} />
        <WheelChock
          position={[-1.5, 0, 11]}
          rotation={Math.PI}
          isDeployed={shippingDockedRef.current}
        />
        <WheelChock
          position={[1.5, 0, 11]}
          rotation={Math.PI}
          isDeployed={shippingDockedRef.current}
        />

        {/* Dock spotter - guides truck while backing */}
        <DockSpotter
          position={[-5, 0, 8]}
          isGuiding={
            shippingStateRef.current === 'backing' ||
            shippingStateRef.current === 'final_adjustment'
          }
          rotation={Math.PI}
        />
      </group>

      {/* ========== FRONT TRUCK YARD ========== */}
      <group position={[0, 0, 50]}>
        {/* Main truck yard asphalt - raised to y=0.08 to prevent z-fighting with main asphalt at y=-0.05 */}
        <mesh position={[0, 0.08, 30]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.95} />
        </mesh>

        {/* Dock apron - raised to y=0.12 to be above truck yard asphalt */}
        <mesh position={[0, 0.12, 8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 16]} />
          <meshStandardMaterial color="#374151" roughness={0.85} />
        </mesh>

        {/* Road markings - raised to y=0.16 to be above dock apron at y=0.12 */}
        <OptimizedStripeInstances positions={[0, 10, 20, 30, 40].map((z) => [18, 0.16, z])} />

        <OptimizedStripeInstances positions={[0, 10, 20, 30, 40].map((z) => [-18, 0.16, z])} />

        <mesh position={[0, 0.16, 10]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[0.15, 20]} />
          <meshBasicMaterial
            color="#3b82f6"
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[-4, 0.16, 10]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[0.1, 20]} />
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.5}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[4, 0.16, 10]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[0.1, 20]} />
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.5}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>

        <mesh position={[0, 0.16, 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[14, 0.4]} />
          <meshBasicMaterial
            color="#ef4444"
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>

        {/* Speed bumps - relocated to employee walkways on yard edges */}
        <OptimizedSpeedBumpInstances
          bumps={[{ position: [-28, 0, 45] }, { position: [28, 0, 45] }]}
        />

        {/* Traffic cones - relocated to dock edges to not block truck path */}
        <OptimizedTrafficConeInstances
          positions={[
            [-8, 0, 5],
            [-6, 0, 5],
            [6, 0, 5],
            [8, 0, 5],
          ]}
        />

        {/* Concrete bollards at yard edges - moved outward to not block trucks */}
        <OptimizedBollardInstances
          positions={[
            [-28, 0, 55],
            [28, 0, 55],
            [-28, 0, 35],
            [28, 0, 35],
          ]}
        />

        {/* No idling signs - relocated near bollards at yard perimeter */}
        <NoIdlingSign position={[-30, 0, 45]} rotation={Math.PI / 2} />
        <NoIdlingSign position={[30, 0, 45]} rotation={-Math.PI / 2} />

        {[
          [-30, 35],
          [30, 35],
          [-30, 55],
          [30, 55],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            {/* Light pole - 14 units tall, centered at y=7, so top is at y=14 */}
            <mesh position={[0, 7, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 14, 8]} />
              <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Fixture - positioned at y=14.2 so it sits flush on pole top at y=14 */}
            <mesh position={[0, 14.2, 0]}>
              <boxGeometry args={[2, 0.4, 1]} />
              <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
            </mesh>
            <pointLight position={[0, 14, 0]} intensity={30} distance={35} color="#fef3c7" />
          </group>
        ))}

        <Text
          position={[0, 0.05, 40]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={2}
          color="#475569"
          anchorX="center"
          anchorY="middle"
        >
          TRUCK STAGING
        </Text>

        {/* Road tunnel - trucks enter and disappear into mountains */}
        {/* Positioned so truck at z=250 is inside the 50-unit deep tunnel */}
        <RoadTunnel position={[20, 0, 170]} rotation={Math.PI} roadWidth={10} />

        {/* Road extension connecting truck yard to tunnel */}
        <mesh position={[20, 0.07, 115]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10, 120]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.95} />
        </mesh>
        {/* Road center line */}
        <mesh position={[20, 0.09, 115]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.15, 120]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>

        {/* PERFORMANCE: Animated decorative components - only on ultra quality */}
        {/* These components have useFrame hooks that add significant overhead */}
        {showDecorativeAnimations && (
          <>
            {/* Weight scale at yard entrance */}
            <WeightScale position={[0, 0, 52]} rotation={0} />

            {/* Guard shack at entrance - relocated to periphery */}
            <GuardShack position={[45, 0, 60]} rotation={-Math.PI / 2} />

            {/* Intercom call box at guard shack - relocated with guard shack */}
            <IntercomCallBox position={[40, 0, 60]} rotation={-Math.PI / 2} />

            {/* Yard jockey patrolling */}
            <YardJockey position={[-35, 0, 40]} rotation={0} />

            {/* Truck wash station - relocated to west periphery */}
            <TruckWashStation position={[-65, 0, 50]} rotation={0} />

            {/* Cardboard compactor/baler for recycling - relocated to west periphery */}
            <CardboardCompactor position={[-65, 0, 25]} rotation={Math.PI / 2} />

            {/* Warehouse worker with pallet jack - centered dock */}
            <WarehouseWorkerWithPalletJack
              position={[10, 0, 5]}
              isActive={shippingDoorsOpenRef.current}
              workAreaBounds={{ minX: -8, maxX: 8, minZ: -5, maxZ: 8 }}
            />

            {/* Time clock station */}
            <TimeClockStation position={[18, 0, 50]} rotation={Math.PI / 2} />

            {/* Air hose station */}
            <AirHoseStation position={[30, 0, 20]} rotation={-Math.PI / 2} />

            {/* Scale ticket kiosk */}
            <ScaleTicketKiosk position={[3, 0, 52]} rotation={0} />

            {/* Overhead crane in maintenance bay */}
            <OverheadCrane position={[90, 5.5, 30]} spanWidth={10} />

            {/* Stretch wrap machine - moved out of dock apron to staging side */}
            <StretchWrapMachine position={[-28, 0, 24]} isActive={shippingDoorsOpenRef.current} />

            {/* Pallet jack charging station - relocated to opposite staging lane */}
            <PalletJackChargingStation position={[26, 0, 24]} rotation={0} />

            {/* Truck alignment guides */}
            <TruckAlignmentGuides position={[0, 0, 4]} />
          </>
        )}

        {/* Static decorative components (no useFrame) - always render */}
        {/* Fuel island - TESTING */}
        {/* <FuelIsland position={[-25, 0, 35]} rotation={Math.PI / 2} /> */}

        {/* Tire inspection area - TESTING */}
        {/* <TireInspectionArea position={[25, 0, 35]} rotation={Math.PI / 2} /> */}

        {/* Driver break room - MOVED to AMENITY BUILDINGS section below (outside dock offset) */}

        {/* Employee parking lot - TESTING */}
        {/* <EmployeeParking position={[45, 0, 55]} rotation={0} /> */}

        {/* Propane tank cage - TESTING */}
        {/* <PropaneTankCage position={[38, 0, 10]} rotation={0} /> */}

        {/* Dumpster area - TESTING */}
        {/* <DumpsterArea position={[-35, 0, 15]} rotation={Math.PI / 2} /> */}

        {/* Manifest holder at dock - centered */}
        <ManifestHolder position={[5.5, 3, -1]} rotation={0} />

        {/* Dock plate - centered */}
        <DockPlate position={[0, 2, 1]} isDeployed={shippingDockedRef.current} />

        {/* Driver restroom - DISABLED pending relocation */}
        {/* <DriverRestroom position={[70, 0, 65]} rotation={-Math.PI / 2} /> */}

        {/* Dock bumpers with wear indicators - moved forward to avoid wall */}
        <DockBumperWithWear position={[-2, 1.2, 0]} wearLevel={0.3} />
        <DockBumperWithWear position={[2, 1.2, 0]} wearLevel={0.4} />

        {/* Floor markings - centered */}
        <DockFloorMarkings position={[0, 0, 3]} />

        {/* Safety mirrors */}
        <SafetyMirror position={[-6, 3, 5]} rotation={Math.PI / 4} />
        <SafetyMirror position={[6, 3, 5]} rotation={-Math.PI / 4} />

        {/* Fire extinguisher stations */}
        <FireExtinguisherStation position={[-5.5, 0, 0]} rotation={Math.PI / 2} />
        <FireExtinguisherStation position={[5.5, 0, 0]} rotation={-Math.PI / 2} />

        {/* PERFORMANCE: TruckAlignmentGuides and PalletJackChargingStation moved to showDecorativeAnimations block */}
      </group>

      {/* ========== AMENITY BUILDINGS (Outside FRONT TRUCK YARD to avoid z=50 offset) ========== */}
      {/* Maintenance bay - positioned at actual world coordinates */}
      <MaintenanceBay position={[85, 0, 30]} rotation={-Math.PI / 2} />

      {/* Trailer drop yard - positioned away from dock */}
      <TrailerDropYard position={[-60, 0, 35]} rotation={0} />

      {/* Driver break room - positioned east of shipping dock at world coordinates */}
      <DriverBreakRoom position={[25, 0, 75]} rotation={-Math.PI / 2} />

      {/* Shipping truck */}
      <group ref={shippingTruckRef} position={[20, 0, 160]}>
        <RealisticTruck
          color="#1e40af"
          company="FLOUR EXPRESS"
          plateNumber="FLR 2847"
          wheelRotation={shippingWheelRotation}
          throttle={shippingThrottleRef}
          trailerAngle={shippingTrailerAngleRef}
          getTruckState={() => getShippingState(performance.now() / 1000)}
        />
      </group>

      {/* ========== RECEIVING DOCK (Back of building, z=-50) ========== */}
      {/* Wall is at z=-48, dock rotated 180deg so local -z = world +z */}
      <group position={[0, 0, -50]} rotation={[0, Math.PI, 0]}>
        {/* Dock platform - split into two sections with forklift channel in center */}
        {/* Left platform section */}
        <mesh position={[-3.25, 1, 1.2]} receiveShadow>
          <boxGeometry args={[2.5, 2, 5.8]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
        {/* Right platform section */}
        <mesh position={[3.25, 1, 1.2]} receiveShadow>
          <boxGeometry args={[2.5, 2, 5.8]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>
        {/* Forklift channel floor (sunken slightly for visual distinction) */}
        <mesh position={[0, 0.15, 1.2]} receiveShadow>
          <boxGeometry args={[4, 0.3, 5.8]} />
          <meshStandardMaterial color="#374151" roughness={0.9} />
        </mesh>
        {/* Yellow safety stripes on channel edges */}
        <mesh position={[-1.85, 0.32, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 5.8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        <mesh position={[1.85, 0.32, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 5.8]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>

        {/* Dock bumpers - centered for single bay (narrower to fit platform) */}
        {[-3.5, -1.75, 0, 1.75, 3.5].map((x, i) => (
          <mesh key={i} position={[x, 0.8, 0.2]}>
            <boxGeometry args={[0.8, 1.2, 0.6]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}

        {/* ===== TRUCK GROOVE - Single centered channel for truck positioning ===== */}
        <group position={[0, 0, 8]}>
          {/* Sunken groove floor */}
          <mesh position={[0, -0.3, 0]} receiveShadow>
            <boxGeometry args={[4.5, 0.1, 18]} />
            <meshStandardMaterial color="#1c1c1c" roughness={0.95} />
          </mesh>
          {/* Groove side walls */}
          <mesh position={[-2.4, -0.15, 0]}>
            <boxGeometry args={[0.3, 0.5, 18]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
          <mesh position={[2.4, -0.15, 0]}>
            <boxGeometry args={[0.3, 0.5, 18]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
          {/* Yellow warning stripes on groove edges - raised to prevent z-fighting */}
          <mesh position={[-2.1, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 18]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          <mesh position={[2.1, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 18]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
        </group>

        <DockLeveler position={[0, 2, -1.5]} isDeployed={receivingDockedRef.current} />

        {/* Roll-up dock door - at wall opening */}
        <RollUpDoor position={[0, 0, -1.8]} isOpen={receivingDockedRef.current} />

        {/* Dock shelter */}
        <DockShelter position={[0, 0, 1]} isCompressed={receivingDockedRef.current} />

        <DockStatusLight position={[-5, 4, -1.8]} isOccupied={receivingDockedRef.current} />
        <DockStatusLight position={[5, 4, -1.8]} isOccupied={receivingDockedRef.current} />

        {/* Concrete bollards around dock */}
        <OptimizedBollardInstances
          positions={[
            [-5.5, 0, 2],
            [5.5, 0, 2],
            [-5.5, 0, 5],
            [5.5, 0, 5],
          ]}
        />

        <Text
          position={[0, 6, -1.5]}
          rotation={[0, Math.PI, 0]}
          fontSize={1.2}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.05}
          outlineColor="#000"
        >
          RECEIVING
        </Text>

        <Text
          position={[0, 4.5, -1.5]}
          rotation={[0, Math.PI, 0]}
          fontSize={0.5}
          color="#f97316"
          anchorX="center"
          anchorY="middle"
        >
          DOCK 2 - INBOUND
        </Text>

        {/* Pallet staging area - moved outside dock to avoid wall clipping */}
        <PalletStaging position={[12, 0, 5]} />

        {/* Wheel chocks - deployed when truck is docked */}
        <WheelChock position={[-1.5, 0, 10]} rotation={0} isDeployed={receivingDockedRef.current} />
        <WheelChock position={[1.5, 0, 10]} rotation={0} isDeployed={receivingDockedRef.current} />
        <WheelChock
          position={[-1.5, 0, 11]}
          rotation={Math.PI}
          isDeployed={receivingDockedRef.current}
        />
        <WheelChock
          position={[1.5, 0, 11]}
          rotation={Math.PI}
          isDeployed={receivingDockedRef.current}
        />

        {/* Dock spotter - guides truck while backing */}
        <DockSpotter
          position={[-5, 0, 8]}
          isGuiding={
            receivingStateRef.current === 'backing' ||
            receivingStateRef.current === 'final_adjustment'
          }
          rotation={Math.PI}
        />
      </group>

      {/* ========== BACK TRUCK YARD ========== */}
      <group position={[0, 0, -50]}>
        {/* Main truck yard asphalt - raised to y=0.08 to prevent z-fighting with main asphalt at y=-0.05 */}
        <mesh position={[0, 0.08, -30]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.95} />
        </mesh>

        {/* Dock apron - raised to y=0.12 to be above truck yard asphalt */}
        <mesh position={[0, 0.12, -8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 16]} />
          <meshStandardMaterial color="#374151" roughness={0.85} />
        </mesh>

        {/* Road markings - raised to y=0.16 to be above dock apron at y=0.12 */}
        <OptimizedStripeInstances positions={[0, -10, -20, -30, -40].map((z) => [-18, 0.16, z])} />

        <OptimizedStripeInstances positions={[0, -10, -20, -30, -40].map((z) => [18, 0.16, z])} />

        <mesh position={[0, 0.16, -10]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[0.15, 20]} />
          <meshBasicMaterial
            color="#3b82f6"
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[-4, 0.16, -10]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[0.1, 20]} />
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.5}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[4, 0.16, -10]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[0.1, 20]} />
          <meshBasicMaterial
            color="#3b82f6"
            transparent
            opacity={0.5}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>

        <mesh position={[0, 0.16, -2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
          <planeGeometry args={[14, 0.4]} />
          <meshBasicMaterial
            color="#ef4444"
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            depthWrite={false}
          />
        </mesh>

        {/* Speed bumps - relocated to employee walkways on yard edges */}
        <OptimizedSpeedBumpInstances
          bumps={[{ position: [-28, 0, -45] }, { position: [28, 0, -45] }]}
        />

        {/* Traffic cones - relocated to dock edges to not block truck path */}
        <OptimizedTrafficConeInstances
          positions={[
            [-8, 0, -5],
            [-6, 0, -5],
            [6, 0, -5],
            [8, 0, -5],
          ]}
        />

        {/* Concrete bollards at yard edges - moved outward to not block trucks */}
        <OptimizedBollardInstances
          positions={[
            [-28, 0, -55],
            [28, 0, -55],
            [-28, 0, -35],
            [28, 0, -35],
          ]}
        />

        {/* No idling signs - relocated near bollards at yard perimeter */}
        <NoIdlingSign position={[-30, 0, -45]} rotation={-Math.PI / 2} />
        <NoIdlingSign position={[30, 0, -45]} rotation={Math.PI / 2} />

        {[
          [-30, -35],
          [30, -35],
          [-30, -55],
          [30, -55],
        ].map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            {/* Light pole - 14 units tall, centered at y=7, so top is at y=14 */}
            <mesh position={[0, 7, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 14, 8]} />
              <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Fixture - positioned at y=14.2 so it sits flush on pole top at y=14 */}
            <mesh position={[0, 14.2, 0]}>
              <boxGeometry args={[2, 0.4, 1]} />
              <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
            </mesh>
            <pointLight position={[0, 14, 0]} intensity={30} distance={35} color="#fef3c7" />
          </group>
        ))}

        <Text
          position={[0, 0.05, -40]}
          rotation={[-Math.PI / 2, 0, Math.PI]}
          fontSize={2}
          color="#475569"
          anchorX="center"
          anchorY="middle"
        >
          TRUCK STAGING
        </Text>

        {/* Road tunnel - trucks enter and disappear into mountains */}
        {/* Positioned so truck at z=-250 is inside the 50-unit deep tunnel */}
        <RoadTunnel position={[-20, 0, -170]} rotation={0} roadWidth={10} />

        {/* Road extension connecting truck yard to tunnel */}
        <mesh position={[-20, 0.07, -115]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[10, 120]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.95} />
        </mesh>
        {/* Road center line */}
        <mesh position={[-20, 0.09, -115]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.15, 120]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>

        {/* PERFORMANCE: Animated decorative components - only on ultra quality */}
        {/* These components have useFrame hooks that add significant overhead */}
        {showDecorativeAnimations && (
          <>
            {/* Weight scale at yard entrance */}
            <WeightScale position={[0, 0, -52]} rotation={Math.PI} />

            {/* Guard shack at entrance - relocated to periphery */}
            <GuardShack position={[-45, 0, -60]} rotation={Math.PI / 2} />

            {/* Intercom call box at guard shack - relocated with guard shack */}
            <IntercomCallBox position={[-40, 0, -60]} rotation={Math.PI / 2} />

            {/* Fuel island */}
            <FuelIsland position={[25, 0, -35]} rotation={-Math.PI / 2} />

            {/* Tire inspection area */}
            <TireInspectionArea position={[-25, 0, -35]} rotation={-Math.PI / 2} />

            {/* Yard jockey patrolling */}
            <YardJockey position={[0, 0, -25]} rotation={Math.PI} />

            {/* Dumpster area for receiving - relocated to east periphery */}
            <DumpsterArea position={[65, 0, -25]} rotation={-Math.PI / 2} />

            {/* Cardboard compactor/baler for receiving area - relocated to east periphery */}
            <CardboardCompactor position={[65, 0, -15]} rotation={-Math.PI / 2} />

            {/* Warehouse worker with pallet jack - centered dock */}
            <WarehouseWorkerWithPalletJack
              position={[10, 0, -5]}
              isActive={receivingDoorsOpenRef.current}
              workAreaBounds={{ minX: -8, maxX: 8, minZ: -8, maxZ: 5 }}
            />

            {/* Time clock station for receiving area - moved to yard */}
            <TimeClockStation position={[-18, 0, -52]} rotation={-Math.PI / 2} />

            {/* Air hose station */}
            <AirHoseStation position={[-30, 0, -20]} rotation={Math.PI / 2} />

            {/* Scale ticket kiosk */}
            <ScaleTicketKiosk position={[-3, 0, -52]} rotation={Math.PI} />

            {/* Stretch wrap machine - moved to yard */}
            <StretchWrapMachine
              position={[28, 0, -24]}
              rotation={Math.PI}
              isActive={receivingDoorsOpenRef.current}
            />

            {/* Pallet jack charging station */}
            <PalletJackChargingStation position={[-26, 0, -24]} rotation={Math.PI / 2} />

            {/* Truck alignment guides */}
            <TruckAlignmentGuides position={[0, 0, -4]} />
          </>
        )}

        {/* Manifest holder at dock - centered */}
        <ManifestHolder position={[5.5, 3, 1]} rotation={0} />

        {/* Dock plate - centered */}
        <DockPlate position={[0, 2, -1]} isDeployed={receivingDockedRef.current} />

        {/* Dock bumpers with wear indicators - moved forward to avoid wall */}
        <DockBumperWithWear position={[-2, 1.2, 0]} wearLevel={0.5} />
        <DockBumperWithWear position={[2, 1.2, 0]} wearLevel={0.2} />

        {/* Floor markings - centered */}
        <DockFloorMarkings position={[0, 0, -3]} />

        {/* Safety mirrors */}
        <SafetyMirror position={[-6, 3, -5]} rotation={Math.PI + Math.PI / 4} />
        <SafetyMirror position={[6, 3, -5]} rotation={Math.PI - Math.PI / 4} />

        {/* Fire extinguisher stations */}
        <FireExtinguisherStation position={[-5.5, 0, 0]} rotation={Math.PI / 2} />
        <FireExtinguisherStation position={[5.5, 0, 0]} rotation={-Math.PI / 2} />

        {/* PERFORMANCE: TruckAlignmentGuides and PalletJackChargingStation moved to showDecorativeAnimations block */}
      </group>

      {/* Receiving truck */}
      <group ref={receivingTruckRef} position={[-20, 0, -160]}>
        <RealisticTruck
          color="#991b1b"
          company="GRAIN CO"
          plateNumber="GRN 5921"
          wheelRotation={receivingWheelRotation}
          throttle={receivingThrottleRef}
          trailerAngle={receivingTrailerAngleRef}
          getTruckState={() => getReceivingState(performance.now() / 1000)}
        />
      </group>
    </group>
  );
};

// Realistic truck with all the bells and whistles
const RealisticTruck: React.FC<{
  color: string;
  company: string;
  plateNumber: string;
  wheelRotation: React.MutableRefObject<number>;
  throttle: React.MutableRefObject<number>;
  trailerAngle: React.MutableRefObject<number>;
  getTruckState: () => TruckAnimState;
}> = ({ color, company, plateNumber, wheelRotation, throttle, trailerAngle, getTruckState }) => {
  const frontLeftWheelRef = useRef<THREE.Mesh>(null);
  const frontRightWheelRef = useRef<THREE.Mesh>(null);
  const rearWheelsRef = useRef<THREE.Group>(null);
  const trailerRef = useRef<THREE.Group>(null);
  const leftDoorRef = useRef<THREE.Mesh>(null);
  const rightDoorRef = useRef<THREE.Mesh>(null);
  const brakeLightLeftRef = useRef<THREE.MeshStandardMaterial>(null);
  const brakeLightRightRef = useRef<THREE.MeshStandardMaterial>(null);
  const reverseLightLeftRef = useRef<THREE.MeshStandardMaterial>(null);
  const reverseLightRightRef = useRef<THREE.MeshStandardMaterial>(null);
  const leftSignalRef = useRef<THREE.MeshStandardMaterial>(null);
  const rightSignalRef = useRef<THREE.MeshStandardMaterial>(null);
  const markerLightsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  // Physics refs
  const cabBodyRef = useRef<THREE.Group>(null);
  const steerLeftRef = useRef<THREE.Group>(null);
  const steerRightRef = useRef<THREE.Group>(null);

  const quality = useGraphicsStore((state) => state.graphics.quality);
  const truckId = useMemo(() => `truck-${company}-${Math.random()}`, [company]);

  // Only show minor details on high/ultra quality
  const showMinorDetails = quality === 'high' || quality === 'ultra';

  // Register truck components with the animation manager
  useEffect(() => {
    // Need to ensure refs are initialized before registering
    const checkAndRegister = () => {
      if (frontLeftWheelRef.current && trailerRef.current) {
        registerTruckComponents(truckId, {
          cabRef: cabBodyRef,
          trailerRef,
          frontLeftWheelRef,
          frontRightWheelRef,
          rearWheelsRef,
          leftDoorRef,
          rightDoorRef,
          brakeLightLeftRef,
          brakeLightRightRef,
          reverseLightLeftRef,
          reverseLightRightRef,
          leftSignalRef,
          rightSignalRef,
          markerLightsRef,
          cabBodyRef,
          wheelRotation,
          trailerAngle,
          steerLeftRef,
          steerRightRef,
          getTruckState,
        });
      }
    };

    // Use a small timeout to ensure refs are initialized
    const timeoutId = setTimeout(checkAndRegister, 0);

    return () => {
      clearTimeout(timeoutId);
      unregisterTruckComponents(truckId);
    };
  }, [truckId, getTruckState]);

  const isEngineRunning = getTruckState().phase !== 'docked' || throttle.current > 0.05;

  return (
    <group>
      {/* === CAB === */}
      <group position={[0, 0, 2]} ref={cabBodyRef}>
        {/* Main cab body */}
        <mesh position={[0, 2, 0]} castShadow>
          <boxGeometry args={[2.8, 2.4, 2.2]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.6} />
        </mesh>

        {/* Hood */}
        <mesh position={[0, 1.2, 1.5]}>
          <boxGeometry args={[2.6, 1, 1.2]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.6} />
        </mesh>

        {/* Windshield */}
        <mesh position={[0, 2.6, 1.2]} rotation={[0.3, 0, 0]}>
          <planeGeometry args={[2.4, 1.4]} />
          <meshStandardMaterial color="#1e3a5f" metalness={0.95} roughness={0.05} />
        </mesh>

        {/* Side windows */}
        {[-1.41, 1.41].map((x, i) => (
          <mesh key={i} position={[x, 2.4, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[1.8, 1.2]} />
            <meshStandardMaterial
              color="#1e3a5f"
              metalness={0.9}
              roughness={0.1}
              transparent
              opacity={0.8}
            />
          </mesh>
        ))}

        {/* === DRIVER === */}
        {showMinorDetails && (
          <group position={[0.4, 2.2, 0]}>
            {/* Head */}
            <mesh position={[0, 0.5, 0]}>
              <sphereGeometry args={[0.18, 8, 8]} />
              <meshStandardMaterial color="#d4a574" roughness={0.8} />
            </mesh>
            {/* Body */}
            <mesh position={[0, 0.1, 0]}>
              <boxGeometry args={[0.35, 0.5, 0.25]} />
              <meshStandardMaterial color="#1e40af" roughness={0.7} />
            </mesh>
            {/* Arms on wheel */}
            <mesh position={[0, 0, 0.3]} rotation={[0.3, 0, 0]}>
              <boxGeometry args={[0.5, 0.12, 0.12]} />
              <meshStandardMaterial color="#1e40af" roughness={0.7} />
            </mesh>
            {/* Cap */}
            <mesh position={[0, 0.65, 0.05]}>
              <cylinderGeometry args={[0.12, 0.15, 0.08, 8]} />
              <meshStandardMaterial color="#1f2937" roughness={0.7} />
            </mesh>
          </group>
        )}

        {/* Roof fairing */}
        <mesh position={[0, 3.5, -0.3]}>
          <boxGeometry args={[2.6, 0.8, 1.8]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.6} />
        </mesh>

        {/* === CAB MARKER LIGHTS (orange roof lights) === */}
        {[-1.1, -0.55, 0, 0.55, 1.1].map((x, i) => (
          <mesh key={i} position={[x, 3.95, 0.5]}>
            <boxGeometry args={[0.15, 0.08, 0.1]} />
            <meshStandardMaterial
              ref={(el) => {
                if (el) markerLightsRef.current[i] = el;
              }}
              color="#f97316"
              emissive="#f97316"
              emissiveIntensity={0.4}
            />
          </mesh>
        ))}

        {/* Exhaust stacks */}
        <mesh position={[-1.2, 2.8, -0.8]}>
          <cylinderGeometry args={[0.08, 0.1, 1.5, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[1.2, 2.8, -0.8]}>
          <cylinderGeometry args={[0.08, 0.1, 1.5, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Exhaust smoke */}
        {showMinorDetails && (
          <>
            <ExhaustSmoke
              position={[-1.2, 3.6, -0.8]}
              throttle={throttle.current}
              isRunning={isEngineRunning}
            />
            <ExhaustSmoke
              position={[1.2, 3.6, -0.8]}
              throttle={throttle.current}
              isRunning={isEngineRunning}
            />
          </>
        )}

        {/* Side mirrors */}
        {[-1.6, 1.6].map((x, i) => (
          <group key={i} position={[x, 2.2, 1]}>
            <mesh>
              <boxGeometry args={[0.1, 0.4, 0.3]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh position={[x > 0 ? 0.15 : -0.15, 0, 0]}>
              <boxGeometry args={[0.05, 0.3, 0.25]} />
              <meshStandardMaterial color="#64748b" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
        ))}

        {/* Headlights */}
        {[-0.9, 0.9].map((x, i) => (
          <mesh key={i} position={[x, 1.4, 2.1]}>
            <circleGeometry args={[0.2, 16]} />
            <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.5} />
          </mesh>
        ))}

        {/* Turn signals (front) */}
        <mesh position={[-1.3, 1.2, 2.1]}>
          <circleGeometry args={[0.1, 12]} />
          <meshStandardMaterial
            ref={leftSignalRef}
            color="#f97316"
            emissive="#f97316"
            emissiveIntensity={0.1}
          />
        </mesh>
        <mesh position={[1.3, 1.2, 2.1]}>
          <circleGeometry args={[0.1, 12]} />
          <meshStandardMaterial
            ref={rightSignalRef}
            color="#f97316"
            emissive="#f97316"
            emissiveIntensity={0.1}
          />
        </mesh>

        {/* Grille */}
        <mesh position={[0, 1.2, 2.11]}>
          <planeGeometry args={[1.8, 0.8]} />
          <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Front bumper */}
        <mesh position={[0, 0.5, 2]}>
          <boxGeometry args={[2.8, 0.4, 0.3]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Front license plate */}
        <LicensePlate position={[0, 0.5, 2.16]} plateNumber={plateNumber} />

        {/* Headlight beams - only on high/ultra quality */}
        {showMinorDetails && (
          <>
            <HeadlightBeam
              position={[-0.9, 1.4, 2.1]}
              rotation={[-0.1, 0, 0]}
              isOn={isEngineRunning}
            />
            <HeadlightBeam
              position={[0.9, 1.4, 2.1]}
              rotation={[-0.1, 0, 0]}
              isOn={isEngineRunning}
            />
          </>
        )}

        {/* === FUEL TANKS (on cab sides) === */}
        <FuelTank position={[-1.6, 0.8, -0.3]} side="left" />
        <FuelTank position={[1.6, 0.8, -0.3]} side="right" />

        {/* === DEF TANKS (smaller blue tanks next to fuel) === */}
        <DEFTank position={[-1.6, 0.5, 0.5]} side="left" />
        <DEFTank position={[1.6, 0.5, 0.5]} side="right" />

        {/* === CB ANTENNA (on roof) === */}
        {showMinorDetails && <CBAntennaComponent position={[1, 4, -0.2]} />}

        {/* === SUN VISOR (above windshield) === */}
        {showMinorDetails && <SunVisor position={[0, 3.3, 1.4]} color={color} />}
      </group>

      {/* === FIFTH WHEEL COUPLING (between cab and trailer) === */}
      <FifthWheelCoupling position={[0, 1.1, 0]} />

      {/* === TRAILER (articulated) === */}
      <group ref={trailerRef} position={[0, 0, -5]}>
        {/* Main trailer body */}
        <mesh position={[0, 2.5, 0]}>
          <boxGeometry args={[3.2, 3.8, 11]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.4} />
        </mesh>

        {/* Trailer roof ribs */}
        {[-4, -2, 0, 2, 4].map((z, i) => (
          <mesh key={i} position={[0, 4.45, z]}>
            <boxGeometry args={[3.3, 0.1, 0.3]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
          </mesh>
        ))}

        {/* Trailer undercarriage */}
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[2.8, 0.4, 10]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>

        {/* === AIR TANKS (under trailer) === */}
        <AirTank position={[-0.8, 0.25, 2]} />
        <AirTank position={[0.8, 0.25, 2]} />
        <AirTank position={[-0.8, 0.25, 0]} />
        <AirTank position={[0.8, 0.25, 0]} />

        {/* === GLAD HANDS (air brake connections) === */}
        <GladHands position={[0, 1.2, 5.3]} />

        {/* === DOT MARKER LIGHTS (along trailer sides) === */}
        <DOTMarkerLights side="left" />
        <DOTMarkerLights side="right" />

        {/* === ICC REFLECTIVE TAPE (along trailer sides) === */}
        <ICCReflectiveTape side="left" />
        <ICCReflectiveTape side="right" />

        {/* === HAZMAT PLACARDS on trailer === */}
        {/* Front of trailer */}
        <HazmatPlacard position={[0, 3.5, 5.51]} rotation={[0, 0, 0]} type="non-hazardous" />
        {/* Rear of trailer */}
        <HazmatPlacard position={[0, 3.5, -5.51]} rotation={[0, Math.PI, 0]} type="non-hazardous" />
        {/* Left side */}
        <HazmatPlacard
          position={[-1.61, 3.5, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          type="non-hazardous"
        />
        {/* Right side */}
        <HazmatPlacard
          position={[1.61, 3.5, 0]}
          rotation={[0, Math.PI / 2, 0]}
          type="non-hazardous"
        />

        {/* === SLIDING TANDEM AXLES === */}
        <SlidingTandemAxles position={[0, 0, -3.25]} />

        {/* === LANDING GEAR (front of trailer) === */}
        <LandingGear position={[0, 0, 4.5]} />

        {/* === ENHANCED MUD FLAPS with company logos === */}
        <MudflapWithLogo position={[-1.7, 0.35, -4.8]} company={company} />
        <MudflapWithLogo position={[1.7, 0.35, -4.8]} company={company} />

        {/* Logos */}
        {company === 'GRAIN CO' ? (
          <>
            <GrainCoLogo side="right" />
            <GrainCoLogo side="left" />
          </>
        ) : (
          <>
            <FlourExpressLogo side="right" />
            <FlourExpressLogo side="left" />
          </>
        )}

        {/* === ANIMATED TRAILER DOORS === */}
        {/* Left door */}
        <group position={[-1.55, 2.2, -5.5]}>
          <mesh ref={leftDoorRef} position={[0.75, 0, 0]}>
            <boxGeometry args={[1.5, 3.4, 0.1]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>
        {/* Right door */}
        <group position={[1.55, 2.2, -5.5]}>
          <mesh ref={rightDoorRef} position={[-0.75, 0, 0]}>
            <boxGeometry args={[1.5, 3.4, 0.1]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
          </mesh>
        </group>

        {/* Door hinges */}
        {[-1.6, 1.6].map((x, i) => (
          <group key={i}>
            <mesh position={[x, 1.5, -5.5]}>
              <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
              <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[x, 3, -5.5]}>
              <cylinderGeometry args={[0.05, 0.05, 0.3, 6]} />
              <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
        ))}

        {/* === REAR LIGHTS === */}
        <mesh position={[-1.4, 1.8, -5.56]}>
          <boxGeometry args={[0.4, 0.6, 0.05]} />
          <meshStandardMaterial
            ref={brakeLightLeftRef}
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={0.2}
          />
        </mesh>
        <mesh position={[1.4, 1.8, -5.56]}>
          <boxGeometry args={[0.4, 0.6, 0.05]} />
          <meshStandardMaterial
            ref={brakeLightRightRef}
            color="#ef4444"
            emissive="#ef4444"
            emissiveIntensity={0.2}
          />
        </mesh>

        <mesh position={[-1.4, 1.1, -5.56]}>
          <boxGeometry args={[0.3, 0.3, 0.05]} />
          <meshStandardMaterial
            ref={reverseLightLeftRef}
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0}
          />
        </mesh>
        <mesh position={[1.4, 1.1, -5.56]}>
          <boxGeometry args={[0.3, 0.3, 0.05]} />
          <meshStandardMaterial
            ref={reverseLightRightRef}
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={0}
          />
        </mesh>

        {/* Reflectors */}
        <mesh position={[0, 0.8, -5.56]}>
          <boxGeometry args={[2, 0.15, 0.05]} />
          <meshStandardMaterial color="#ef4444" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* DOT bumper */}
        <mesh position={[0, 0.4, -5.4]}>
          <boxGeometry args={[3, 0.3, 0.15]} />
          <meshStandardMaterial color="#dc2626" roughness={0.6} />
        </mesh>

        {/* Rear license plate */}
        <LicensePlate
          position={[0, 0.6, -5.58]}
          rotation={[0, Math.PI, 0]}
          plateNumber={plateNumber}
        />

        {/* Rear wheels (dual) */}
        <group ref={rearWheelsRef}>
          {[-1.3, -1.55, 1.3, 1.55].map((x, i) => (
            <group key={i}>
              <mesh position={[x, 0.55, -2.5]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.55, 0.55, 0.3, 12]} />
                <meshStandardMaterial color="#1f2937" roughness={0.7} />
              </mesh>
              <mesh position={[x, 0.55, -4]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.55, 0.55, 0.3, 12]} />
                <meshStandardMaterial color="#1f2937" roughness={0.7} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* === FRONT WHEELS === */}
      <group ref={steerLeftRef} position={[-1.4, 0.55, 2.5]}>
        <mesh ref={frontLeftWheelRef} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.55, 0.55, 0.35, 12]} />
          <meshStandardMaterial color="#1f2937" roughness={0.7} />
        </mesh>
        {/* Hub */}
        <mesh position={[-0.18, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      <group ref={steerRightRef} position={[1.4, 0.55, 2.5]}>
        <mesh ref={frontRightWheelRef} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.55, 0.55, 0.35, 12]} />
          <meshStandardMaterial color="#1f2937" roughness={0.7} />
        </mesh>
        {/* Hub */}
        <mesh position={[0.18, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.05, 12]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
        </mesh>
      </group>

      {/* Wheel hubs (chrome) - REMOVED: now inside steering groups */}
    </group>
  );
};

// GRAIN CO Logo - Heritage shield design with stylized wheat icon
const GrainCoLogo: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const xPos = side === 'right' ? 1.61 : -1.61;
  const rotY = side === 'right' ? Math.PI / 2 : -Math.PI / 2;

  return (
    <group position={[xPos, 2.5, 0]} rotation={[0, rotY, 0]}>
      {/* Base panel - deep maroon */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[9, 3.2, 0.08]} />
        <meshStandardMaterial color="#450a0a" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Main panel - rich red */}
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[8.7, 3, 0.05]} />
        <meshStandardMaterial color="#991b1b" metalness={0.35} roughness={0.55} />
      </mesh>

      {/* Gold border frame - top */}
      <mesh position={[0, 1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Gold border frame - bottom */}
      <mesh position={[0, -1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Gold border frame - left */}
      <mesh position={[-4.2, 0, 0.05]}>
        <boxGeometry args={[0.08, 2.72, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Gold border frame - right */}
      <mesh position={[4.2, 0, 0.05]}>
        <boxGeometry args={[0.08, 2.72, 0.03]} />
        <meshStandardMaterial color="#d4a017" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* === SHIELD MEDALLION with WHEAT === */}
      <group position={[-2.8, 0, 0.06]}>
        {/* Shield outer - gold */}
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[1.6, 1.9, 0.06]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>
        {/* Shield bottom point */}
        <mesh position={[0, -1.05, 0]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.6, 0.6, 0.06]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>

        {/* Shield inner - dark */}
        <mesh position={[0, 0.1, 0.04]}>
          <boxGeometry args={[1.35, 1.6, 0.04]} />
          <meshStandardMaterial color="#7f1d1d" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.85, 0.04]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.42, 0.42, 0.04]} />
          <meshStandardMaterial color="#7f1d1d" metalness={0.4} roughness={0.5} />
        </mesh>

        {/* Wheat Icon - 3 stalks with chevron grains */}
        <group position={[0, 0.15, 0.08]}>
          {/* Center stalk */}
          <mesh position={[0, -0.3, 0]}>
            <boxGeometry args={[0.04, 0.6, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Center grain head - chevrons */}
          {[0.4, 0.25, 0.1, -0.05].map((y, i) => (
            <group key={`cg-${i}`} position={[0, y, 0]}>
              <mesh position={[-0.08, 0, 0]} rotation={[0, 0, 0.5]}>
                <boxGeometry args={[0.12, 0.04, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0.08, 0, 0]} rotation={[0, 0, -0.5]}>
                <boxGeometry args={[0.12, 0.04, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
            </group>
          ))}

          {/* Left stalk */}
          <mesh position={[-0.25, -0.35, 0]} rotation={[0, 0, 0.15]}>
            <boxGeometry args={[0.035, 0.5, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Left grain head */}
          {[0.3, 0.18, 0.06].map((y, i) => (
            <group key={`lg-${i}`} position={[-0.28 - i * 0.02, y, 0]}>
              <mesh position={[-0.06, 0, 0]} rotation={[0, 0, 0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0.06, 0, 0]} rotation={[0, 0, -0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
            </group>
          ))}

          {/* Right stalk */}
          <mesh position={[0.25, -0.35, 0]} rotation={[0, 0, -0.15]}>
            <boxGeometry args={[0.035, 0.5, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Right grain head */}
          {[0.3, 0.18, 0.06].map((y, i) => (
            <group key={`rg-${i}`} position={[0.28 + i * 0.02, y, 0]}>
              <mesh position={[-0.06, 0, 0]} rotation={[0, 0, 0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
              <mesh position={[0.06, 0, 0]} rotation={[0, 0, -0.5]}>
                <boxGeometry args={[0.1, 0.035, 0.02]} />
                <meshStandardMaterial color="#fbbf24" metalness={0.75} roughness={0.25} />
              </mesh>
            </group>
          ))}

          {/* Ribbon tie */}
          <mesh position={[0, -0.55, 0]}>
            <boxGeometry args={[0.5, 0.08, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Ribbon tails */}
          <mesh position={[-0.3, -0.65, 0]} rotation={[0, 0, 0.3]}>
            <boxGeometry args={[0.15, 0.06, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0.3, -0.65, 0]} rotation={[0, 0, -0.3]}>
            <boxGeometry args={[0.15, 0.06, 0.02]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      </group>

      {/* Company name - GRAIN CO */}
      <Text
        position={[1.3, 0.5, 0.08]}
        fontSize={1.0}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
        fontWeight="bold"
      >
        GRAIN CO
      </Text>

      {/* Decorative line under name */}
      <mesh position={[1.3, 0.05, 0.06]}>
        <boxGeometry args={[4, 0.05, 0.02]} />
        <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
      </mesh>

      {/* Est. banner */}
      <group position={[1.3, -0.35, 0.06]}>
        <mesh>
          <boxGeometry args={[2.8, 0.4, 0.03]} />
          <meshStandardMaterial color="#7f1d1d" metalness={0.3} roughness={0.6} />
        </mesh>
        {/* Banner edge accents */}
        <mesh position={[-1.5, 0, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.03]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>
        <mesh position={[1.5, 0, 0]}>
          <boxGeometry args={[0.15, 0.5, 0.03]} />
          <meshStandardMaterial color="#d4a017" metalness={0.85} roughness={0.15} />
        </mesh>
        <Text
          position={[0, 0, 0.03]}
          fontSize={0.22}
          color="#fef3c7"
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
        >
          EST. 1952
        </Text>
      </group>

      {/* Tagline */}
      <Text
        position={[1.3, -0.85, 0.08]}
        fontSize={0.2}
        color="#fcd34d"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.12}
      >
        PREMIUM MILLING QUALITY
      </Text>
    </group>
  );
};

// FLOUR EXPRESS Logo - Dynamic arrow design with clock badge
const FlourExpressLogo: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const xPos = side === 'right' ? 1.61 : -1.61;
  const rotY = side === 'right' ? Math.PI / 2 : -Math.PI / 2;

  return (
    <group position={[xPos, 2.5, 0]} rotation={[0, rotY, 0]}>
      {/* Base panel - deep navy */}
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[9, 3.2, 0.08]} />
        <meshStandardMaterial color="#020617" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Main panel - navy blue */}
      <mesh position={[0, 0, 0.01]}>
        <boxGeometry args={[8.7, 3, 0.05]} />
        <meshStandardMaterial color="#0f172a" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Blue border frame - top */}
      <mesh position={[0, 1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Blue border frame - bottom */}
      <mesh position={[0, -1.4, 0.05]}>
        <boxGeometry args={[8.5, 0.08, 0.03]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* === FORWARD ARROW ICON === */}
      <group position={[-2.8, 0, 0.06]}>
        {/* Circle background - blue gradient effect */}
        <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.0, 1.0, 0.06, 32]} />
          <meshStandardMaterial color="#1e40af" metalness={0.7} roughness={0.25} />
        </mesh>

        {/* Inner circle */}
        <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.85, 0.85, 0.04, 32]} />
          <meshStandardMaterial color="#1e3a8a" metalness={0.5} roughness={0.4} />
        </mesh>

        {/* Arrow - main shaft */}
        <mesh position={[-0.1, 0, 0.05]}>
          <boxGeometry args={[0.8, 0.25, 0.03]} />
          <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Arrow - head top */}
        <mesh position={[0.35, 0.2, 0.05]} rotation={[0, 0, -0.7]}>
          <boxGeometry args={[0.45, 0.2, 0.03]} />
          <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Arrow - head bottom */}
        <mesh position={[0.35, -0.2, 0.05]} rotation={[0, 0, 0.7]}>
          <boxGeometry args={[0.45, 0.2, 0.03]} />
          <meshStandardMaterial color="#ffffff" metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Speed lines */}
        {[-0.15, 0, 0.15].map((y, i) => (
          <mesh key={i} position={[-0.65 - i * 0.05, y, 0.05]}>
            <boxGeometry args={[0.2 - i * 0.04, 0.04, 0.02]} />
            <meshStandardMaterial color="#60a5fa" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* === DYNAMIC STRIPE behind text === */}
      <mesh position={[0.5, 0, 0.04]} rotation={[0, 0, -0.05]}>
        <boxGeometry args={[5.5, 0.12, 0.02]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.7} roughness={0.25} />
      </mesh>

      {/* Company name - FLOUR */}
      <Text
        position={[0.8, 0.45, 0.08]}
        fontSize={0.9}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.1}
        fontWeight="bold"
      >
        FLOUR
      </Text>

      {/* EXPRESS */}
      <Text
        position={[0.8, -0.35, 0.08]}
        fontSize={0.7}
        color="#60a5fa"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.18}
        fontWeight="bold"
      >
        EXPRESS
      </Text>

      {/* === 24/7 CLOCK BADGE === */}
      <group position={[3.4, 0.6, 0.06]}>
        {/* Outer ring - red */}
        <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.55, 0.55, 0.06, 24]} />
          <meshStandardMaterial color="#dc2626" metalness={0.7} roughness={0.25} />
        </mesh>

        {/* Inner circle - white */}
        <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.04, 24]} />
          <meshStandardMaterial color="#fef2f2" metalness={0.3} roughness={0.5} />
        </mesh>

        {/* Clock face marks */}
        {[0, 1, 2, 3].map((_: unknown, i: number) => (
          <mesh
            key={i}
            position={[
              Math.sin((i * Math.PI) / 2) * 0.32,
              Math.cos((i * Math.PI) / 2) * 0.32,
              0.05,
            ]}
          >
            <boxGeometry args={[0.04, 0.08, 0.02]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}

        {/* Clock hands */}
        <mesh position={[0.08, 0.08, 0.05]} rotation={[0, 0, -0.8]}>
          <boxGeometry args={[0.22, 0.03, 0.02]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0.02, -0.06, 0.05]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.15, 0.025, 0.02]} />
          <meshStandardMaterial color="#dc2626" />
        </mesh>

        {/* Center dot */}
        <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </group>

      {/* 24/7 text below clock */}
      <Text
        position={[3.4, -0.1, 0.07]}
        fontSize={0.25}
        color="#dc2626"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        24/7
      </Text>

      {/* Tagline */}
      <Text
        position={[0.5, -0.9, 0.08]}
        fontSize={0.18}
        color="#94a3b8"
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.15}
      >
        FAST + RELIABLE DELIVERY
      </Text>
    </group>
  );
};

// Mudflap with chains/weights (enhanced version)
// @ts-ignore - unused component kept for future use
const MudflapWithChains: React.FC<{
  position: [number, number, number];
}> = ({ position }) => {
  const chainRefs = useRef<THREE.Mesh[]>([]);

  useEffect(() => {
    const chainsId = `mudflap-chains-${Math.random()}`;

    registerAnimation(chainsId, 'custom', null, { chainRefs }, (time, _delta, _mesh, data) => {
      const refs = (data as { chainRefs: React.RefObject<THREE.Mesh[]> }).chainRefs;
      refs.current?.forEach((chain: THREE.Mesh | null, i: number) => {
        if (chain) {
          chain.rotation.x = Math.sin(time * 2 + i * 0.5) * 0.05;
          chain.rotation.z = Math.sin(time * 1.5 + i * 0.3) * 0.03;
        }
      });
    });

    return () => {
      unregisterAnimation(chainsId);
    };
  }, []);

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.6, 0.7, 0.02]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.32, 0.02]}>
        <boxGeometry args={[0.55, 0.06, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
      </mesh>
      {[-0.2, 0, 0.2].map((x, i) => (
        <group key={i} position={[x, -0.38, 0.02]}>
          {[0, 1, 2, 3].map((j) => (
            <mesh
              key={j}
              ref={(el) => {
                if (el) chainRefs.current[i * 4 + j] = el;
              }}
              position={[0, -j * 0.04, 0]}
            >
              <torusGeometry args={[0.015, 0.004, 6, 8]} />
              <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.2} />
            </mesh>
          ))}
          <mesh position={[0, -0.18, 0]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Tire Pressure Monitoring System sensor
// @ts-ignore - unused component kept for future use
const TPMSSensor: React.FC<{
  position: [number, number, number];
  pressure: number;
}> = ({ position, pressure }) => {
  const isLow = pressure < 85;
  const isHigh = pressure > 115;
  const statusColor = isLow ? '#ef4444' : isHigh ? '#f59e0b' : '#22c55e';

  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.025, 0]}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshStandardMaterial color={statusColor} emissive={statusColor} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
};

// Trailer door lock rod handles
// @ts-ignore - unused component kept for future use
const TrailerLockRods: React.FC<{
  position: [number, number, number];
  isLocked: boolean;
}> = ({ position, isLocked }) => {
  const handleRotation = isLocked ? 0 : Math.PI / 4;

  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.02, 0.02, 3.5, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.6, 0.03]} rotation={[0, 0, handleRotation]}>
        <boxGeometry args={[0.08, 0.15, 0.03]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, -1.6, 0.03]} rotation={[0, 0, handleRotation]}>
        <boxGeometry args={[0.08, 0.15, 0.03]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.08, 0, 0.02]} rotation={[0, 0, handleRotation]}>
        <boxGeometry args={[0.15, 0.06, 0.03]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      <mesh position={[0.16, 0, 0.02]} rotation={[0, 0, handleRotation]}>
        <cylinderGeometry args={[0.025, 0.025, 0.08, 8]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </mesh>
    </group>
  );
};

// Reefer (refrigeration) unit for cold storage trailers
// @ts-ignore - unused component kept for future use
const ReeferUnit: React.FC<{
  position: [number, number, number];
  isRunning: boolean;
}> = ({ position, isRunning }) => {
  const fanRef = useRef<THREE.Group>(null);
  const statusLightRef = useRef<THREE.MeshStandardMaterial>(null);

  useEffect(() => {
    // Register fan rotation
    const fanId = `reefer-fan-${Math.random()}`;
    if (fanRef.current && isRunning) {
      registerAnimation(fanId, 'rotation', fanRef.current, { axis: 'z', speed: 15 });
    }

    return () => {
      unregisterAnimation(fanId);
    };
  }, [isRunning]);

  useEffect(() => {
    // Register status light pulse
    const lightId = `reefer-light-${Math.random()}`;
    if (statusLightRef.current) {
      registerAnimation(lightId, 'pulse', statusLightRef.current, {
        speed: 3,
        min: isRunning ? 0.6 : 0.1,
        max: isRunning ? 1.0 : 0.1,
      });
    }

    return () => {
      unregisterAnimation(lightId);
    };
  }, [isRunning]);

  return (
    <group position={position}>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[2.8, 1.2, 0.5]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2, 0.26]}>
        <boxGeometry args={[2.4, 0.8, 0.02]} />
        <meshStandardMaterial color="#1f2937" metalness={0.3} roughness={0.7} />
      </mesh>
      <group ref={fanRef} position={[0, 2, 0.2]}>
        {[0, 1, 2, 3].map((_: unknown, i: number) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <boxGeometry args={[0.6, 0.12, 0.02]} />
            <meshStandardMaterial color="#64748b" />
          </mesh>
        ))}
        <mesh>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      <mesh position={[1.1, 2.3, 0.26]}>
        <boxGeometry args={[0.4, 0.4, 0.06]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[1.1, 2.45, 0.3]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial
          ref={statusLightRef}
          color={isRunning ? '#22c55e' : '#ef4444'}
          emissive={isRunning ? '#22c55e' : '#ef4444'}
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh position={[1.1, 2.2, 0.3]}>
        <planeGeometry args={[0.25, 0.12]} />
        <meshStandardMaterial color="#0f172a" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>
      <Text position={[1.1, 2.2, 0.31]} fontSize={0.06} color="#22c55e" anchorX="center">
        -18°C
      </Text>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[2.2, 0.6, 0.4]} />
        <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
      </mesh>
      {[-0.8, -0.4, 0, 0.4, 0.8].map((x, i) => (
        <mesh key={i} position={[x, 0.8, 0.21]}>
          <boxGeometry args={[0.12, 0.4, 0.02]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}
      <mesh position={[-1.2, 0.4, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.5, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
};

// Aerodynamic trailer skirts
// @ts-ignore - unused component kept for future use
const _TrailerSkirts: React.FC<{ side: 'left' | 'right'; length?: number }> = ({
  side,
  length = 10,
}) => {
  const xPos = side === 'right' ? 1.55 : -1.55;
  const xOffset = side === 'right' ? 0.04 : -0.04;

  return (
    <group position={[xPos + xOffset, 0.5, 0]}>
      <mesh>
        <boxGeometry args={[0.08, 0.6, length]} />
        <meshStandardMaterial color="#475569" metalness={0.4} roughness={0.6} />
      </mesh>
      {[-4, -2, 0, 2, 4].map((z, i) => (
        <mesh key={i} position={[side === 'right' ? -0.06 : 0.06, 0.25, z]}>
          <boxGeometry args={[0.04, 0.1, 0.2]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      <mesh position={[0.045 * (side === 'right' ? 1 : -1), -0.25, 0]}>
        <boxGeometry args={[0.01, 0.08, length - 0.5]} />
        <meshStandardMaterial
          color="#fbbf24"
          metalness={0.8}
          roughness={0.1}
          emissive="#fbbf24"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
};

// Air hose station for tire inflation
const AirHoseStation: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const hoseRef = useRef<THREE.Group>(null);
  const animId = useRef(`airhose-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      if (hoseRef.current) {
        hoseRef.current.rotation.z = Math.sin(time * 0.5) * 0.02;
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 3, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0.2]}>
        <boxGeometry args={[0.6, 0.6, 0.4]} />
        <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.5, 0.12]}>
        <circleGeometry args={[0.12, 16]} />
        <meshStandardMaterial color="#fef3c7" />
      </mesh>
      <mesh position={[0, 2.5, 0.13]}>
        <ringGeometry args={[0.1, 0.12, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0.15, 2, 0.15]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15, 0.15, 0.1, 16]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </mesh>
      <group ref={hoseRef} position={[0.2, 1.5, 0.2]}>
        {[0, 1, 2, 3, 4].map((_: unknown, i: number) => (
          <mesh key={i} position={[0, -i * 0.15, 0]}>
            <torusGeometry args={[0.08 + i * 0.01, 0.015, 8, 16, Math.PI * 1.5]} />
            <meshStandardMaterial color="#1f2937" roughness={0.8} />
          </mesh>
        ))}
        <mesh position={[0.1, -0.8, 0]}>
          <cylinderGeometry args={[0.02, 0.03, 0.15, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
      <mesh position={[0, 3.2, 0.05]}>
        <boxGeometry args={[0.5, 0.25, 0.02]} />
        <meshStandardMaterial color="#1e40af" />
      </mesh>
      <Text position={[0, 3.2, 0.07]} fontSize={0.08} color="#ffffff" anchorX="center">
        AIR
      </Text>
    </group>
  );
};

// Scale ticket kiosk
const ScaleTicketKiosk: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const displayRef = useRef<THREE.MeshStandardMaterial>(null);
  const animId = useRef(`kiosk-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      if (displayRef.current) {
        displayRef.current.emissiveIntensity = 0.6 + Math.sin(time * 2) * 0.1;
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[0.8, 1.8, 0.6]} />
        <meshStandardMaterial color="#374151" roughness={0.6} />
      </mesh>
      <mesh position={[0, 2.5, 0.1]}>
        <boxGeometry args={[1, 0.1, 0.9]} />
        <meshStandardMaterial color="#475569" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.8, 0.31]}>
        <planeGeometry args={[0.5, 0.35]} />
        <meshStandardMaterial
          ref={displayRef}
          color="#0f172a"
          emissive="#22c55e"
          emissiveIntensity={0.5}
        />
      </mesh>
      <Text position={[0, 1.9, 0.32]} fontSize={0.06} color="#22c55e" anchorX="center">
        WEIGHT: 42,580 LBS
      </Text>
      <Text position={[0, 1.75, 0.32]} fontSize={0.04} color="#22c55e" anchorX="center">
        TICKET #: 847291
      </Text>
      <mesh position={[0, 1.4, 0.31]}>
        <boxGeometry args={[0.25, 0.05, 0.02]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, 1.1, 0.31]}>
        <boxGeometry args={[0.3, 0.25, 0.03]} />
        <meshStandardMaterial color="#475569" roughness={0.5} />
      </mesh>
      <mesh position={[0.25, 1.5, 0.31]}>
        <boxGeometry args={[0.12, 0.2, 0.03]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0, 2.1, 0.31]}>
        <circleGeometry args={[0.08, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <Text position={[0, 2.35, 0.31]} fontSize={0.06} color="#fef3c7" anchorX="center">
        SCALE TICKET
      </Text>
    </group>
  );
};

// Driver shower/restroom building
export const DriverRestroom: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    <mesh position={[0, 1.5, 0]} castShadow>
      <boxGeometry args={[6, 3, 4]} />
      <meshStandardMaterial color="#78716c" roughness={0.8} />
    </mesh>
    <mesh position={[0, 3.1, 0]}>
      <boxGeometry args={[6.4, 0.2, 4.4]} />
      <meshStandardMaterial color="#44403c" roughness={0.7} />
    </mesh>
    {/* Doors - positioned so bottom sits at floor level */}
    {[-1.5, 0, 1.5].map((x, i) => (
      <group key={i} position={[x, 1.1, 2.01]}>
        <mesh>
          <boxGeometry args={[1, 2.2, 0.1]} />
          <meshStandardMaterial color="#374151" roughness={0.6} />
        </mesh>
        <mesh position={[0.35, 0.3, 0.06]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>
    ))}
    <Text position={[-1.5, 2.6, 2.01]} fontSize={0.15} color="#1f2937" anchorX="center">
      MEN
    </Text>
    <Text position={[0, 2.6, 2.01]} fontSize={0.15} color="#1f2937" anchorX="center">
      WOMEN
    </Text>
    <Text position={[1.5, 2.6, 2.01]} fontSize={0.12} color="#1f2937" anchorX="center">
      SHOWERS
    </Text>
    {/* Vending machine - positioned so bottom sits at floor level */}
    <mesh position={[-2.5, 1.0, 2.01]}>
      <boxGeometry args={[0.8, 2, 0.6]} />
      <meshStandardMaterial color="#dc2626" roughness={0.5} />
    </mesh>
    <mesh position={[0, 3.3, 2.2]}>
      <boxGeometry args={[0.3, 0.15, 0.2]} />
      <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.3} />
    </mesh>
    <mesh position={[0, 3.5, 2.01]}>
      <boxGeometry args={[3, 0.5, 0.1]} />
      <meshStandardMaterial color="#1e40af" />
    </mesh>
    <Text position={[0, 3.5, 2.12]} fontSize={0.18} color="#ffffff" anchorX="center">
      DRIVER FACILITIES
    </Text>
  </group>
);

// Trailer drop yard with empty trailers
const TrailerDropYard: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    <mesh position={[0, FLOOR_LAYERS.wornPrimary, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[20, 30]} />
      <meshStandardMaterial color="#57534e" roughness={0.95} />
    </mesh>
    {[-6, 0, 6].map((x, i) => (
      <mesh
        key={i}
        position={[x, FLOOR_LAYERS.truckMarkings, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <planeGeometry args={[0.1, 16]} />
        <meshBasicMaterial
          color="#fef3c7"
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    ))}
    {[
      [-6, -5],
      [0, 2],
      [6, -8],
    ].map(([x, z], i) => (
      <group key={i} position={[x, 0, z]}>
        <mesh position={[0, 2.3, 0]}>
          <boxGeometry args={[3, 4, 12]} />
          <meshStandardMaterial color={['#e2e8f0', '#d4d4d4', '#94a3b8'][i]} roughness={0.7} />
        </mesh>
        <mesh position={[-0.8, 0.8, 5]}>
          <boxGeometry args={[0.15, 1.6, 0.15]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.8, 0.8, 5]}>
          <boxGeometry args={[0.15, 1.6, 0.15]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
        <group position={[0, 0.5, -3]}>
          {[
            [-1.2, 0],
            [-1.2, 0.8],
            [1.2, 0],
            [1.2, 0.8],
          ].map(([lx, lz], j) => (
            <mesh key={j} position={[lx, 0, lz]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
              <meshStandardMaterial color="#1f2937" roughness={0.8} />
            </mesh>
          ))}
        </group>
      </group>
    ))}
    <group position={[-10, 0, 0]}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 4, 8]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[2, 0.6, 0.1]} />
        <meshStandardMaterial color="#1e40af" />
      </mesh>
      <Text position={[0, 4, 0.06]} fontSize={0.15} color="#ffffff" anchorX="center">
        DROP YARD
      </Text>
    </group>
  </group>
);

// Maintenance bay/garage
const MaintenanceBay: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    <mesh position={[0, 3, 0]} castShadow>
      <boxGeometry args={[12, 6, 10]} />
      <meshStandardMaterial color="#64748b" roughness={0.7} />
    </mesh>
    {[-3, 3].map((x, i) => (
      <group key={i} position={[x, 2.5, 5.01]}>
        <mesh>
          <boxGeometry args={[4, 5, 0.2]} />
          <meshStandardMaterial color="#374151" roughness={0.5} />
        </mesh>
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <mesh key={`${row}-${col}`} position={[-0.8 + col * 0.8, 1 - row * 0.8, 0.11]}>
              <boxGeometry args={[0.5, 0.5, 0.02]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.8} roughness={0.1} />
            </mesh>
          ))
        )}
      </group>
    ))}
    <mesh position={[-4.5, 2, 5.5]}>
      <boxGeometry args={[3, 4, 1]} />
      <meshStandardMaterial color="#78716c" roughness={0.6} />
    </mesh>
    <mesh position={[-4.5, 2.5, 6.01]}>
      <boxGeometry args={[1.5, 2, 0.1]} />
      <meshStandardMaterial color="#1e3a5f" metalness={0.7} roughness={0.2} />
    </mesh>
    <mesh position={[0, 0.05, 8]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[8, 3]} />
      <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
    </mesh>
    {[-5, -4, 4, 5].map((x, i) => (
      <mesh key={i} position={[x, 1, 4.5]}>
        <boxGeometry args={[0.8, 2, 0.5]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>
    ))}
    <mesh position={[0, 6.5, 5]}>
      <boxGeometry args={[5, 0.8, 0.1]} />
      <meshStandardMaterial color="#fbbf24" />
    </mesh>
    <Text position={[0, 6.5, 5.06]} fontSize={0.35} color="#1f2937" anchorX="center">
      MAINTENANCE
    </Text>
    {[-5, 5].map((x, i) => (
      <mesh key={i} position={[x, 5.5, 5.3]}>
        <boxGeometry args={[0.3, 0.2, 0.15]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.4} />
      </mesh>
    ))}
  </group>
);

// Stretch wrap machine for pallets
const StretchWrapMachine: React.FC<{
  position: [number, number, number];
  rotation?: number;
  isActive: boolean;
}> = ({ position, rotation = 0, isActive }) => {
  const turntableRef = useRef<THREE.Mesh>(null);
  const armRef = useRef<THREE.Group>(null);
  const wrapRollRef = useRef<THREE.Mesh>(null);
  const animId = useRef(`wrapper-${Math.random().toString(36).substr(2, 9)}`);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (_time, delta) => {
      if (isActiveRef.current) {
        if (turntableRef.current) turntableRef.current.rotation.y += delta * 2;
        if (armRef.current) armRef.current.rotation.y -= delta * 2;
        if (wrapRollRef.current) wrapRollRef.current.rotation.x += delta * 8;
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.1, 24]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh ref={turntableRef} position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1, 1, 0.04, 24]} />
        <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[1, 0.15, 1.2]} />
        <meshStandardMaterial color="#92400e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <boxGeometry args={[0.8, 0.8, 0.9]} />
        <meshStandardMaterial color="#d4a574" roughness={0.7} />
      </mesh>
      <mesh position={[1.5, 1.5, 0]}>
        <boxGeometry args={[0.15, 3, 0.15]} />
        <meshStandardMaterial color="#1f2937" metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={armRef} position={[1.5, 1.5, 0]}>
        <mesh position={[-0.75, 0, 0]}>
          <boxGeometry args={[1.5, 0.1, 0.1]} />
          <meshStandardMaterial color="#f97316" roughness={0.5} />
        </mesh>
        <group position={[-1.4, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.2, 0.5, 0.2]} />
            <meshStandardMaterial color="#374151" roughness={0.5} />
          </mesh>
          <mesh ref={wrapRollRef} position={[0, 0, 0.15]} rotation={[0, Math.PI / 2, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.15, 12]} />
            <meshStandardMaterial color="#f5f5f4" transparent opacity={0.7} />
          </mesh>
        </group>
      </group>
      <mesh position={[1.8, 1.2, 0.3]}>
        <boxGeometry args={[0.25, 0.4, 0.1]} />
        <meshStandardMaterial color="#1f2937" roughness={0.5} />
      </mesh>
      <mesh position={[1.76, 1.3, 0.36]}>
        <cylinderGeometry args={[0.04, 0.04, 0.02, 12]} />
        <meshStandardMaterial
          color={isActive ? '#22c55e' : '#64748b'}
          emissive={isActive ? '#22c55e' : '#000000'}
          emissiveIntensity={isActive ? 0.5 : 0}
        />
      </mesh>
    </group>
  );
};

// Dock bumpers with wear indicators
const DockBumperWithWear: React.FC<{ position: [number, number, number]; wearLevel: number }> = ({
  position,
  wearLevel,
}) => {
  const wearColor = wearLevel > 0.7 ? '#ef4444' : wearLevel > 0.4 ? '#f59e0b' : '#22c55e';

  return (
    <group position={position}>
      {/* Main bumper body */}
      <mesh>
        <boxGeometry args={[0.8, 0.4, 0.3 - wearLevel * 0.1]} />
        <meshStandardMaterial color="#1f2937" roughness={0.95} />
      </mesh>
      {/* Backing plate - offset further back to prevent z-fighting */}
      <mesh position={[0, 0, -0.22]}>
        <boxGeometry args={[0.9, 0.5, 0.04]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Wear indicator strip */}
      <mesh position={[0, 0.22, 0.16]}>
        <boxGeometry args={[0.7, 0.03, 0.05]} />
        <meshStandardMaterial color={wearColor} emissive={wearColor} emissiveIntensity={0.2} />
      </mesh>
      {/* Status LEDs */}
      {[0, 1, 2, 3, 4].map((_: unknown, i: number) => (
        <mesh key={i} position={[-0.3 + i * 0.15, -0.22, 0.18]}>
          <boxGeometry args={[0.08, 0.02, 0.01]} />
          <meshStandardMaterial color={i / 4 <= 1 - wearLevel ? '#22c55e' : '#374151'} />
        </mesh>
      ))}
    </group>
  );
};

// Floor tape/markings inside dock
// Floor tape/markings inside dock
const DockFloorMarkings: React.FC<{ position: [number, number, number] }> = ({ position }) => (
  <group position={position}>
    <mesh
      position={[0, FLOOR_LAYERS.truckMarkings, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      <planeGeometry args={[3, 10]} />
      <meshBasicMaterial
        color="#22c55e"
        transparent
        opacity={0.3}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
        polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        depthWrite={false}
      />
    </mesh>
    <mesh
      position={[-1.5, FLOOR_LAYERS.truckMarkings, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      <planeGeometry args={[0.1, 10]} />
      <meshBasicMaterial
        color="#22c55e"
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
        polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        depthWrite={false}
      />
    </mesh>
    <mesh
      position={[1.5, FLOOR_LAYERS.truckMarkings, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      <planeGeometry args={[0.1, 10]} />
      <meshBasicMaterial
        color="#22c55e"
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
        polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        depthWrite={false}
      />
    </mesh>
    <mesh
      position={[3, FLOOR_LAYERS.truckMarkings, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      <planeGeometry args={[1.5, 10]} />
      <meshBasicMaterial
        color="#3b82f6"
        transparent
        opacity={0.3}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
        polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        depthWrite={false}
      />
    </mesh>
    <mesh
      position={[-4, FLOOR_LAYERS.truckMarkings, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      <planeGeometry args={[4, 5]} />
      <meshBasicMaterial
        color="#fbbf24"
        transparent
        opacity={0.2}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
        polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        depthWrite={false}
      />
    </mesh>
    {[
      [-6, 0],
      [-2, 0],
    ].map(([x], i) => (
      <mesh
        key={i}
        position={[x, FLOOR_LAYERS.truckMarkings, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <planeGeometry args={[0.08, 5]} />
        <meshBasicMaterial
          color="#fbbf24"
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
          depthWrite={false}
        />
      </mesh>
    ))}
    <mesh
      position={[0, FLOOR_LAYERS.truckMarkings, -6]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={RENDER_ORDER.floorMarkings}
    >
      <planeGeometry args={[5, 2]} />
      <meshBasicMaterial
        color="#ef4444"
        transparent
        opacity={0.25}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
        polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        depthWrite={false}
      />
    </mesh>
    <Text
      position={[0, FLOOR_LAYERS.floorText, -6]}
      rotation={[-Math.PI / 2, 0, 0]}
      fontSize={0.4}
      color="#ef4444"
      anchorX="center"
      renderOrder={RENDER_ORDER.floorText}
    >
      KEEP CLEAR
    </Text>
  </group>
);

// Safety mirror at blind corners
const SafetyMirror: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    <mesh position={[0, 0, -0.3]}>
      <boxGeometry args={[0.08, 0.08, 0.6]} />
      <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
    </mesh>
    <mesh>
      <boxGeometry args={[1.2, 0.9, 0.08]} />
      <meshStandardMaterial color="#f97316" roughness={0.5} />
    </mesh>
    <mesh position={[0, 0, 0.05]}>
      <circleGeometry args={[0.4, 32]} />
      <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.05} />
    </mesh>
    <Text position={[0, -0.35, 0.05]} fontSize={0.05} color="#1f2937" anchorX="center">
      CHECK FOR FORKLIFTS
    </Text>
  </group>
);

// Fire extinguisher station
const FireExtinguisherStation: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
    <mesh position={[0, 1.2, 0]}>
      <boxGeometry args={[0.5, 0.8, 0.08]} />
      <meshStandardMaterial color="#dc2626" roughness={0.5} />
    </mesh>
    <mesh position={[0, 1.2, 0.06]}>
      <boxGeometry args={[0.35, 0.15, 0.08]} />
      <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
    </mesh>
    <group position={[0, 1, 0.15]}>
      <mesh>
        <cylinderGeometry args={[0.08, 0.08, 0.5, 16]} />
        <meshStandardMaterial color="#dc2626" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.08, 12]} />
        <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.05, 0.28, 0]} rotation={[0, 0, 0.3]}>
        <boxGeometry args={[0.12, 0.03, 0.03]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[0.08, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, 0.15, 8]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
      <mesh position={[0.16, 0.15, 0]}>
        <coneGeometry args={[0.025, 0.06, 8]} />
        <meshStandardMaterial color="#1f2937" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.1, 0.085]}>
        <circleGeometry args={[0.025, 12]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
    <mesh position={[0, 1.7, 0.03]}>
      <boxGeometry args={[0.4, 0.15, 0.02]} />
      <meshStandardMaterial color="#dc2626" />
    </mesh>
    <Text position={[0, 1.7, 0.05]} fontSize={0.05} color="#ffffff" anchorX="center">
      FIRE EXTINGUISHER
    </Text>
  </group>
);

// Truck alignment guides - laser lines on dock floor for precise backing
const TruckAlignmentGuides: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const laserRef1 = useRef<THREE.Mesh>(null);
  const laserRef2 = useRef<THREE.Mesh>(null);
  const animId = useRef(`laser-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      const intensity = 0.5 + Math.sin(time * 4) * 0.3;
      if (laserRef1.current) {
        (laserRef1.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
      }
      if (laserRef2.current) {
        (laserRef2.current.material as THREE.MeshStandardMaterial).emissiveIntensity = intensity;
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position}>
      {/* Center guide line */}
      <mesh
        ref={laserRef1}
        position={[0, 0.08, 5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={10}
      >
        <planeGeometry args={[0.05, 15]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.5}
          transparent
          opacity={0.8}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
          depthWrite={false}
        />
      </mesh>

      {/* Left wheel guide */}
      <mesh
        ref={laserRef2}
        position={[-1.2, 0.08, 5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={10}
      >
        <planeGeometry args={[0.03, 15]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.5}
          transparent
          opacity={0.6}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
          depthWrite={false}
        />
      </mesh>

      {/* Right wheel guide */}
      <mesh position={[1.2, 0.08, 5]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <planeGeometry args={[0.03, 15]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.5}
          transparent
          opacity={0.6}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
          depthWrite={false}
        />
      </mesh>

      {/* Stop line */}
      <mesh position={[0, 0.08, -1]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10}>
        <planeGeometry args={[4, 0.15]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#ef4444"
          emissiveIntensity={0.4}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
          depthWrite={false}
        />
      </mesh>

      {/* Laser projector units */}
      {[-2.5, 2.5].map((x, i) => (
        <group key={i} position={[x, 0.3, 12]}>
          <mesh>
            <boxGeometry args={[0.2, 0.15, 0.2]} />
            <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[0, -0.05, -0.11]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Electric pallet jack charging station
const PalletJackChargingStation: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => {
  const chargeIndicatorRef = useRef<THREE.Mesh>(null);
  const animId = useRef(`charger-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      if (chargeIndicatorRef.current) {
        const blink = Math.sin(time * 2) > 0;
        (chargeIndicatorRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
          blink ? 0.8 : 0.2;
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      {/* Charging station base */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[1.5, 0.6, 1]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Charging unit/panel */}
      <mesh position={[0, 1, -0.4]}>
        <boxGeometry args={[1.2, 1, 0.2]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} />
      </mesh>

      {/* Display screen */}
      <mesh position={[0, 1.2, -0.29]}>
        <planeGeometry args={[0.6, 0.3]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>

      {/* Charging indicator light */}
      <mesh ref={chargeIndicatorRef} position={[0.4, 1.3, -0.29]}>
        <circleGeometry args={[0.05, 12]} />
        <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.5} />
      </mesh>

      {/* Charging cable coiled */}
      <mesh position={[0.5, 0.4, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15, 0.02, 8, 24]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>

      {/* Electric pallet jack parked at station */}
      <group position={[0, 0, 1.5]}>
        {/* Jack body */}
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.6, 0.4, 1.5]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
        {/* Forks */}
        {[-0.25, 0.25].map((x, i) => (
          <mesh key={i} position={[x, 0.1, 1]}>
            <boxGeometry args={[0.15, 0.08, 1.2]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
        {/* Handle */}
        <mesh position={[0, 0.8, -0.6]}>
          <boxGeometry args={[0.4, 0.6, 0.15]} />
          <meshStandardMaterial color="#1f2937" roughness={0.7} />
        </mesh>
        {/* Wheels */}
        {[
          [-0.35, -0.5],
          [0.35, -0.5],
          [-0.3, 1.4],
          [0.3, 1.4],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.08, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.08, 0.08, i < 2 ? 0.15 : 0.1, 12]} />
            <meshStandardMaterial color="#1f2937" roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Floor marking */}
      <mesh
        position={[0, FLOOR_LAYERS.safetyMain, 0.8]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <planeGeometry args={[1.5, 3]} />
        <meshStandardMaterial
          color="#fbbf24"
          transparent
          opacity={0.2}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Sign */}
      <Text position={[0, 1.6, -0.35]} fontSize={0.1} color="#ffffff" anchorX="center">
        CHARGING STATION
      </Text>
    </group>
  );
};

// Hazmat placard for trailers
const HazmatPlacard: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  type: 'flammable' | 'corrosive' | 'oxidizer' | 'toxic' | 'non-hazardous';
}> = ({ position, rotation = [0, 0, 0], type }) => {
  const placardColors = {
    flammable: { bg: '#ef4444', symbol: '#ffffff', number: '3' },
    corrosive: { bg: '#ffffff', symbol: '#1f2937', number: '8' },
    oxidizer: { bg: '#fbbf24', symbol: '#1f2937', number: '5.1' },
    toxic: { bg: '#ffffff', symbol: '#1f2937', number: '6' },
    'non-hazardous': { bg: '#22c55e', symbol: '#ffffff', number: '' },
  };

  const { bg, symbol, number } = placardColors[type];

  return (
    <group position={position} rotation={rotation}>
      {/* Diamond shape - rotated square */}
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.35, 0.35]} />
        <meshStandardMaterial color={bg} />
      </mesh>

      {/* Border */}
      <mesh rotation={[0, 0, Math.PI / 4]} position={[0, 0, 0.001]}>
        <ringGeometry args={[0.16, 0.175, 4]} />
        <meshStandardMaterial color={symbol} />
      </mesh>

      {/* Hazard class number */}
      {number && (
        <Text
          position={[0, -0.08, 0.01]}
          fontSize={0.08}
          color={symbol}
          anchorX="center"
          anchorY="middle"
        >
          {number}
        </Text>
      )}

      {/* Symbol indicator - simplified */}
      {type === 'flammable' && (
        <mesh position={[0, 0.05, 0.01]}>
          <coneGeometry args={[0.04, 0.08, 8]} />
          <meshStandardMaterial color={symbol} />
        </mesh>
      )}
    </group>
  );
};

// Overhead crane for maintenance bay
const OverheadCrane: React.FC<{ position: [number, number, number]; spanWidth?: number }> = ({
  position,
  spanWidth = 10,
}) => {
  const trolleyRef = useRef<THREE.Group>(null);
  const hookRef = useRef<THREE.Group>(null);
  const animId = useRef(`crane-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, { spanWidth }, (time, _delta, _mesh, data) => {
      if (trolleyRef.current) {
        trolleyRef.current.position.x =
          Math.sin(time * 0.2) * ((data as { spanWidth: number }).spanWidth / 2 - 1);
      }
      if (hookRef.current) {
        hookRef.current.rotation.z = Math.sin(time * 0.5) * 0.05;
      }
    });
    return () => unregisterAnimation(id);
  }, [spanWidth]);

  return (
    <group position={position}>
      {/* Main bridge beam */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[spanWidth, 0.6, 0.8]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.5} />
      </mesh>

      {/* End trucks (on rails) */}
      {[-spanWidth / 2, spanWidth / 2].map((x, i) => (
        <group key={i} position={[x, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.8, 0.8, 1.2]} />
            <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Wheels */}
          {[-0.5, 0.5].map((z, j) => (
            <mesh key={j} position={[0, -0.3, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.15, 0.15, 0.2, 12]} />
              <meshStandardMaterial color="#1f2937" metalness={0.7} roughness={0.3} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Trolley */}
      <group ref={trolleyRef} position={[0, -0.4, 0]}>
        <mesh>
          <boxGeometry args={[1.2, 0.4, 0.6]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Hoist motor */}
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.4, 12]} />
          <meshStandardMaterial color="#f97316" roughness={0.5} />
        </mesh>

        {/* Cable */}
        <mesh position={[0, -1.2, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.5, 6]} />
          <meshStandardMaterial color="#1f2937" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Hook assembly */}
        <group ref={hookRef} position={[0, -2, 0]}>
          {/* Hook block */}
          <mesh>
            <boxGeometry args={[0.3, 0.2, 0.15]} />
            <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Hook */}
          <mesh position={[0, -0.2, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.1, 0.025, 6, 12, Math.PI * 1.5]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      </group>

      {/* Warning stripes on bridge */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * (spanWidth / 2 - 0.5), 0, 0.41]}>
          <planeGeometry args={[0.8, 0.5]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#fbbf24' : '#1f2937'} />
        </mesh>
      ))}

      {/* Capacity sign */}
      <mesh position={[0, 0.35, 0.41]}>
        <planeGeometry args={[1.5, 0.3]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <Text position={[0, 0.35, 0.42]} fontSize={0.12} color="#fbbf24" anchorX="center">
        5 TON CAPACITY
      </Text>
    </group>
  );
};

// Cardboard compactor/baler for recycling
const CardboardCompactor: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const ramRef = useRef<THREE.Mesh>(null);
  const animId = useRef(`compactor-${Math.random().toString(36).substr(2, 9)}`);

  // Memoize random cardboard scrap dimensions to prevent NaN errors from Math.random() in geometry args
  const cardboardScraps = useMemo(
    () => [
      {
        x: 0.8,
        z: 1.5,
        width: 0.3 + Math.random() * 0.2,
        height: 0.4 + Math.random() * 0.2,
        rot: Math.random() * Math.PI,
      },
      {
        x: -0.5,
        z: 1.8,
        width: 0.3 + Math.random() * 0.2,
        height: 0.4 + Math.random() * 0.2,
        rot: Math.random() * Math.PI,
      },
      {
        x: 1.2,
        z: 1.2,
        width: 0.3 + Math.random() * 0.2,
        height: 0.4 + Math.random() * 0.2,
        rot: Math.random() * Math.PI,
      },
    ],
    []
  );

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      if (ramRef.current) {
        const cycle = Math.floor(time / 8) % 2;
        const t = (time % 8) / 8;
        if (cycle === 0 && t < 0.5) {
          ramRef.current.position.y = 1.8 - t * 1.2;
        } else if (cycle === 0) {
          ramRef.current.position.y = 1.2 + (t - 0.5) * 1.2;
        }
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      {/* Main body/hopper */}
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[2.5, 2.4, 2]} />
        <meshStandardMaterial color="#22c55e" roughness={0.6} />
      </mesh>

      {/* Loading chute opening */}
      <mesh position={[0, 2, 1.01]}>
        <boxGeometry args={[1.8, 1, 0.1]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Hydraulic ram (animated) */}
      <mesh ref={ramRef} position={[0, 1.8, 0]}>
        <boxGeometry args={[2.3, 0.3, 1.8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Bale discharge door */}
      <mesh position={[-1.26, 0.8, 0]}>
        <boxGeometry args={[0.1, 1.4, 1.6]} />
        <meshStandardMaterial color="#16a34a" roughness={0.5} />
      </mesh>

      {/* Control panel */}
      <mesh position={[1.3, 1.5, 0.8]}>
        <boxGeometry args={[0.15, 0.5, 0.4]} />
        <meshStandardMaterial color="#374151" roughness={0.6} />
      </mesh>

      {/* Buttons */}
      {[0.1, 0, -0.1].map((y, i) => (
        <mesh key={i} position={[1.38, 1.5 + y, 0.8]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
          <meshStandardMaterial
            color={['#22c55e', '#ef4444', '#fbbf24'][i]}
            emissive={['#22c55e', '#ef4444', '#fbbf24'][i]}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}

      {/* Cardboard scraps near compactor */}
      {cardboardScraps.map((scrap, i) => (
        <mesh
          key={i}
          position={[scrap.x, 0.02 + i * 0.02, scrap.z]}
          rotation={[-Math.PI / 2, 0, scrap.rot]}
        >
          <planeGeometry args={[scrap.width, scrap.height]} />
          <meshStandardMaterial color="#a16207" roughness={0.95} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Recycling sign */}
      <mesh position={[0, 2.5, 1.01]}>
        <planeGeometry args={[1, 0.3]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
      <Text position={[0, 2.5, 1.02]} fontSize={0.12} color="#ffffff" anchorX="center">
        CARDBOARD ONLY
      </Text>

      {/* Floor drain */}
      <mesh position={[0, FLOOR_LAYERS.puddle, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.15, 16]} />
        <meshStandardMaterial
          color="#1f2937"
          metalness={0.6}
          roughness={0.4}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    </group>
  );
};

// Intercom/call box for guard shack
const IntercomCallBox: React.FC<{ position: [number, number, number]; rotation?: number }> = ({
  position,
  rotation = 0,
}) => {
  const speakerRef = useRef<THREE.Mesh>(null);
  const animId = useRef(`intercom-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const id = animId.current;
    registerAnimation(id, 'custom', null, {}, (time) => {
      if (speakerRef.current) {
        const active = Math.sin(time * 0.5) > 0.8;
        (speakerRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = active
          ? 0.8
          : 0.1;
      }
    });
    return () => unregisterAnimation(id);
  }, []);

  return (
    <group position={position} rotation={[0, rotation, 0]} matrixAutoUpdate={false}>
      {/* Post */}
      <mesh position={[0, 0.75, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 1.5, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Call box housing */}
      <mesh position={[0, 1.3, 0.08]}>
        <boxGeometry args={[0.3, 0.4, 0.15]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} />
      </mesh>

      {/* Speaker grille */}
      <mesh position={[0, 1.35, 0.16]}>
        <circleGeometry args={[0.08, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Call button */}
      <mesh position={[0, 1.2, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
      </mesh>

      {/* Activity LED */}
      <mesh ref={speakerRef} position={[0.08, 1.4, 0.16]}>
        <circleGeometry args={[0.015, 8]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.1} />
      </mesh>

      {/* Keypad (simplified) */}
      <group position={[0, 1.1, 0.16]}>
        {[
          [-0.04, 0.04],
          [0, 0.04],
          [0.04, 0.04],
          [-0.04, 0],
          [0, 0],
          [0.04, 0],
          [-0.04, -0.04],
          [0, -0.04],
          [0.04, -0.04],
        ].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]}>
            <boxGeometry args={[0.025, 0.025, 0.01]} />
            <meshStandardMaterial color="#475569" />
          </mesh>
        ))}
      </group>

      {/* Label */}
      <mesh position={[0, 1.52, 0.16]}>
        <planeGeometry args={[0.25, 0.06]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
      <Text position={[0, 1.52, 0.17]} fontSize={0.025} color="#1f2937" anchorX="center">
        CALL FOR ENTRY
      </Text>
    </group>
  );
};
