/**
 * BreakdownEffects Component
 *
 * Visual effects for machine breakdowns:
 * - Sparks (yellow/orange particles)
 * - Smoke (gray rising particles)
 * - Warning beacon (pulsing orange light)
 * - Status overlay billboard
 *
 * Uses instancing and registry pattern for performance.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useBreakdownStore, type BreakdownEvent } from '../../stores/breakdownStore';

// Constants
const SPARK_COUNT = 20;
const SMOKE_COUNT = 15;

// Shared geometries and materials (created once)
const sparkGeometry = new THREE.SphereGeometry(0.03, 4, 4);
const sparkMaterial = new THREE.MeshBasicMaterial({
  color: '#fbbf24',
  transparent: true,
  opacity: 0.9,
});

const smokeGeometry = new THREE.SphereGeometry(0.15, 6, 6);
const smokeMaterial = new THREE.MeshBasicMaterial({
  color: '#6b7280',
  transparent: true,
  opacity: 0.4,
});

// Sparks Component - Yellow/orange particles ejecting from machine
const BreakdownSparks: React.FC<{
  position: [number, number, number];
  intensity?: number;
}> = ({ position, intensity = 1 }) => {
  const sparksRef = useRef<THREE.InstancedMesh>(null);
  const sparkData = useRef<
    Array<{
      position: THREE.Vector3;
      velocity: THREE.Vector3;
      life: number;
      maxLife: number;
    }>
  >([]);

  // Initialize spark data
  useEffect(() => {
    sparkData.current = Array.from({ length: SPARK_COUNT }, () => ({
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 2
      ),
      life: Math.random(),
      maxLife: 0.5 + Math.random() * 0.5,
    }));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!sparksRef.current) return;

    sparkData.current.forEach((spark, i) => {
      // Update life
      spark.life -= delta;

      if (spark.life <= 0) {
        // Reset spark
        spark.position.set(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.3,
          (Math.random() - 0.5) * 0.5
        );
        spark.velocity.set(
          (Math.random() - 0.5) * 2 * intensity,
          Math.random() * 3 + 1,
          (Math.random() - 0.5) * 2 * intensity
        );
        spark.life = spark.maxLife;
      } else {
        // Update position (addScaledVector mutates in place, no per-frame allocation)
        spark.position.addScaledVector(spark.velocity, delta);
        // Apply gravity
        spark.velocity.y -= 15 * delta;
      }

      // Update instance matrix
      dummy.position.copy(spark.position);
      const scale = (spark.life / spark.maxLife) * 0.8 + 0.2;
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      sparksRef.current!.setMatrixAt(i, dummy.matrix);
    });

    sparksRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={sparksRef}
      args={[sparkGeometry, sparkMaterial, SPARK_COUNT]}
      position={position}
    />
  );
};

// Smoke Component - Gray particles rising
const BreakdownSmoke: React.FC<{
  position: [number, number, number];
}> = ({ position }) => {
  const smokeRef = useRef<THREE.InstancedMesh>(null);
  const smokeData = useRef<
    Array<{
      position: THREE.Vector3;
      velocity: THREE.Vector3;
      life: number;
      maxLife: number;
      scale: number;
    }>
  >([]);

  // Initialize smoke data
  useEffect(() => {
    smokeData.current = Array.from({ length: SMOKE_COUNT }, () => ({
      position: new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        Math.random() * 0.5,
        (Math.random() - 0.5) * 0.5
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.3,
        0.5 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.3
      ),
      life: Math.random() * 2,
      maxLife: 2 + Math.random(),
      scale: 0.5 + Math.random() * 0.5,
    }));
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    if (!smokeRef.current) return;

    smokeData.current.forEach((smoke, i) => {
      smoke.life -= delta;

      if (smoke.life <= 0) {
        // Reset smoke
        smoke.position.set((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
        smoke.life = smoke.maxLife;
        smoke.scale = 0.5 + Math.random() * 0.5;
      } else {
        // Update position - rise and drift (addScaledVector mutates in place, no per-frame allocation)
        smoke.position.addScaledVector(smoke.velocity, delta);
        // Expand as it rises
        smoke.scale += delta * 0.3;
      }

      // Update instance matrix
      dummy.position.copy(smoke.position);
      const lifeRatio = smoke.life / smoke.maxLife;
      dummy.scale.setScalar(smoke.scale * (1 - lifeRatio * 0.3));
      dummy.updateMatrix();
      smokeRef.current!.setMatrixAt(i, dummy.matrix);
    });

    smokeRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={smokeRef}
      args={[smokeGeometry, smokeMaterial, SMOKE_COUNT]}
      position={position}
    />
  );
};

// Warning Beacon - Pulsing orange/red light
const WarningBeacon: React.FC<{
  position: [number, number, number];
}> = ({ position }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    // Pulsing intensity
    const pulse = Math.sin(t * 8) * 0.5 + 0.5;
    const intensity = 10 + pulse * 20;

    if (lightRef.current) {
      lightRef.current.intensity = intensity;
    }
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.5 + pulse * 1.5;
    }
  });

  return (
    <group position={position}>
      {/* Beacon housing */}
      <mesh castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.1, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Beacon dome */}
      <mesh ref={meshRef} position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.12, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#f97316"
          emissive="#f97316"
          emissiveIntensity={1}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Point light */}
      <pointLight
        ref={lightRef}
        position={[0, 0.15, 0]}
        color="#f97316"
        intensity={15}
        distance={10}
        decay={2}
      />
    </group>
  );
};

// Status overlay billboard
const BreakdownOverlay: React.FC<{
  breakdown: BreakdownEvent;
  position: [number, number, number];
}> = ({ breakdown, position }) => {
  return (
    <Billboard
      position={[position[0], position[1] + 3, position[2]]}
      follow
      lockX={false}
      lockY={false}
      lockZ={false}
    >
      <Html center>
        <div
          role="alert"
          aria-live="assertive"
          aria-label={`Machine fault: ${breakdown.description}`}
          className="bg-red-900/90 border-2 border-red-500 rounded-lg p-3 min-w-[150px] text-center"
        >
          <div className="text-red-400 font-bold text-sm mb-1">FAULT</div>
          <div className="text-white text-xs mb-2">{breakdown.description}</div>
          {breakdown.assignedWorkerName ? (
            <div className="text-xs">
              <span className="text-gray-400">Repair by: </span>
              <span className="text-amber-400">{breakdown.assignedWorkerName}</span>
            </div>
          ) : (
            <div className="text-amber-400 text-xs animate-pulse">Awaiting repair...</div>
          )}
          {/* Progress bar */}
          {breakdown.repairProgress > 0 && (
            <div
              className="mt-2"
              role="progressbar"
              aria-label="Repair progress"
              aria-valuenow={Math.round(breakdown.repairProgress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all duration-300"
                  style={{ width: `${breakdown.repairProgress}%` }}
                />
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {Math.round(breakdown.repairProgress)}% complete
              </div>
            </div>
          )}
        </div>
      </Html>
    </Billboard>
  );
};

// Main BreakdownEffects component - combines all effects for a breakdown
export const BreakdownEffects: React.FC<{
  machineId: string;
  position: [number, number, number];
}> = ({ machineId, position }) => {
  const breakdown = useBreakdownStore((state) =>
    state.activeBreakdowns.find((b) => b.machineId === machineId)
  );

  if (!breakdown) return null;

  const intensityMultiplier = breakdown.severity === 'moderate' ? 1.5 : 1.0;

  return (
    <group>
      {/* Sparks ejecting from machine */}
      <BreakdownSparks
        position={[position[0], position[1] + 1, position[2]]}
        intensity={intensityMultiplier}
      />

      {/* Rising smoke */}
      <BreakdownSmoke position={[position[0], position[1] + 1.5, position[2]]} />

      {/* Warning beacon on top */}
      <WarningBeacon position={[position[0], position[1] + 2.5, position[2]]} />

      {/* Status overlay */}
      <BreakdownOverlay breakdown={breakdown} position={position} />
    </group>
  );
};

export default BreakdownEffects;
