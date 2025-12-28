import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { getThrottleLevel, shouldRunThisFrame } from '../../utils/frameThrottle';
import { registerShader, unregisterShader, registerRoller, unregisterRoller } from './shared';
import { MACHINE_MATERIALS } from '../../utils/sharedMaterials';

// Heat shimmer effect for hot machines
export const HeatShimmer: React.FC<{
  position: [number, number, number];
  temperature: number;
  size: [number, number, number];
}> = React.memo(({ position, temperature, size }) => {
  const graphicsQuality = useGraphicsStore.getState().graphics.quality;
  const isLowQuality = graphicsQuality === 'low';

  // Guard against NaN/invalid dimensions
  const safeW = Number.isFinite(size[0]) && size[0] > 0 ? size[0] : 1;
  const safeH = Number.isFinite(size[1]) && size[1] > 0 ? size[1] : 1;

  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Only show shimmer for temperatures above 45°C
  const intensity = Math.max(0, (temperature - 45) / 30); // 0-1 based on temp 45-75°C

  // Create material ONCE
  useEffect(() => {
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: intensity }, // Initial value
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        varying vec2 vUv;

        void main() {
          float distort = sin(vUv.y * 20.0 + time * 3.0) * 0.02 * intensity;
          float alpha = (1.0 - vUv.y) * 0.08 * intensity;
          alpha *= sin(vUv.x * 3.14159);
          gl_FragColor = vec4(1.0, 0.95, 0.9, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    materialRef.current = shaderMaterial;

    // Register shader for updates immediately
    const id = `shimmer-${Math.random()}`;
    registerShader(id, { uniforms: shaderMaterial.uniforms });

    return () => {
      unregisterShader(id);
      shaderMaterial.dispose();
      materialRef.current = null;
    };
  }, []); // Run ONCE on mount

  // Update intensity uniform when it changes, WITHOUT recreating material
  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.intensity.value = intensity;
    }
  }, [intensity]);

  if (intensity <= 0 || !materialRef.current || isLowQuality) return null;

  return (
    <mesh
      ref={meshRef}
      position={[position[0], position[1] + safeH + 1.5, position[2]]}
      material={materialRef.current}
    >
      <planeGeometry args={[safeW * 1.5, 4]} />
    </mesh>
  );
});

// Steam vent effect for hot machinery
export const SteamVent: React.FC<{ position: [number, number, number]; intensity: number }> =
  React.memo(({ position, intensity }) => {
    const graphicsQuality = useGraphicsStore.getState().graphics.quality;
    const isLowQuality = graphicsQuality === 'low';

    const particlesRef = useRef<THREE.Points>(null);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const count = 30;
    const ventThrottle = useMemo(
      () => Math.max(getThrottleLevel(graphicsQuality), 4),
      [graphicsQuality]
    );

    const positions = useMemo(() => {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 0.3;
        pos[i * 3 + 1] = Math.random() * 2;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      }
      return pos;
    }, []);

    const velocities = useMemo(() => {
      return Array.from({ length: count }, () => ({
        speed: 0.5 + Math.random() * 1,
        drift: (Math.random() - 0.5) * 0.02,
      }));
    }, []);

    useFrame((_, delta) => {
      if (!isTabVisible || isLowQuality) return;
      // Throttle steam vent animation - looks fine at 15-20fps
      if (!shouldRunThisFrame(ventThrottle)) return;
      if (!particlesRef.current || intensity <= 0) return;
      const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;

      // Compensate for skipped frames
      const adjustedDelta = delta * 2;
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] += velocities[i].speed * adjustedDelta * intensity;
        pos[i * 3] += velocities[i].drift * 2;
        pos[i * 3 + 2] += velocities[i].drift * 2;

        if (pos[i * 3 + 1] > 2.5) {
          pos[i * 3 + 1] = 0;
          pos[i * 3] = (Math.random() - 0.5) * 0.3;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
        }
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    });

    if (intensity <= 0 || isLowQuality) return null;

    return (
      <points ref={particlesRef} position={position}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.15}
          color="#e2e8f0"
          transparent
          opacity={0.4 * intensity}
          sizeAttenuation
        />
      </points>
    );
  });

// Sparks effect for grinding/milling machinery
export const Sparks: React.FC<{ position: [number, number, number]; active: boolean }> =
  React.memo(({ position, active }) => {
    const graphicsQuality = useGraphicsStore.getState().graphics.quality;
    const isLowQuality = graphicsQuality === 'low';

    const particlesRef = useRef<THREE.Points>(null);
    const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
    const count = 20;
    const nextSparkRef = useRef(0);
    const sparkThrottle = useMemo(
      () => Math.max(getThrottleLevel(graphicsQuality), 3),
      [graphicsQuality]
    );

    const positions = useMemo(() => new Float32Array(count * 3), []);
    const velocities = useMemo(
      () => Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, life: 0 })),
      []
    );

    useFrame((_state, delta) => {
      if (!isTabVisible || isLowQuality) return;
      // Throttle sparks animation - 20fps+ is sufficient
      if (!shouldRunThisFrame(sparkThrottle)) return;
      if (!particlesRef.current || !active) return;
      const pos = particlesRef.current.geometry.attributes.position.array as Float32Array;

      // Compensate for skipped frames
      const adjustedDelta = delta * 2;

      // Occasionally spawn new sparks
      nextSparkRef.current -= adjustedDelta;
      if (nextSparkRef.current <= 0 && Math.random() > 0.7) {
        const idx = Math.floor(Math.random() * count);
        pos[idx * 3] = 0;
        pos[idx * 3 + 1] = 0;
        pos[idx * 3 + 2] = 0;
        velocities[idx] = {
          x: (Math.random() - 0.5) * 3,
          y: Math.random() * 2 + 1,
          z: (Math.random() - 0.5) * 3,
          life: 1,
        };
        nextSparkRef.current = 0.05 + Math.random() * 0.1;
      }

      // Update spark positions
      for (let i = 0; i < count; i++) {
        if (velocities[i].life > 0) {
          pos[i * 3] += velocities[i].x * adjustedDelta;
          pos[i * 3 + 1] += velocities[i].y * adjustedDelta;
          pos[i * 3 + 2] += velocities[i].z * adjustedDelta;
          velocities[i].y -= 5 * adjustedDelta; // Gravity
          velocities[i].life -= adjustedDelta * 2;
        } else {
          pos[i * 3 + 1] = -100; // Hide dead sparks
        }
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    });

    if (!active || isLowQuality) return null;

    return (
      <points ref={particlesRef} position={position}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial size={0.08} color="#fcd34d" transparent opacity={0.9} sizeAttenuation />
      </points>
    );
  });

// Rotating fan for machine ventilation
export const RotatingFan: React.FC<{
  position: [number, number, number];
  speed: number;
  size?: number;
}> = React.memo(({ position, speed, size = 0.4 }) => {
  const fanRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const graphicsQuality = useGraphicsStore.getState().graphics.quality;
  const isLowQuality = graphicsQuality === 'low';
  const fanThrottle = useMemo(
    () => Math.max(getThrottleLevel(graphicsQuality), 3),
    [graphicsQuality]
  );

  // Shared geometry for all fan blades
  const bladeGeometry = useMemo(() => new THREE.BoxGeometry(size * 1.8, 0.02, size * 0.3), [size]);

  useFrame((_, delta) => {
    if (!isTabVisible || isLowQuality) return;
    if (!shouldRunThisFrame(fanThrottle)) return;
    if (fanRef.current && speed > 0) {
      fanRef.current.rotation.z += delta * speed * 0.5;
    }
  });

  return (
    <group position={position}>
      {/* Fan housing - using shared materials */}
      <mesh>
        <cylinderGeometry args={[size + 0.05, size + 0.05, 0.1, 16]} />
        <primitive object={MACHINE_MATERIALS.millBody} attach="material" />
      </mesh>
      {/* Rotating blades - using shared materials */}
      <group ref={fanRef} position={[0, 0.06, 0]}>
        {[0, 1, 2, 3].map((_: unknown, i: number) => (
          <mesh
            key={i}
            rotation={[0, 0, (i * Math.PI) / 2]}
            position={[0, 0, 0]}
            geometry={bladeGeometry}
          >
            <primitive object={MACHINE_MATERIALS.millDrum} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  );
});

// Anisotropic metal surface (brushed metal effect for rollers)
export const AnisotropicRoller: React.FC<{
  position: [number, number, number];
  radius: number;
  length: number;
  rotation?: [number, number, number];
  enabled: boolean;
  rpm?: number;
}> = ({ position, radius, length, rotation = [0, 0, Math.PI / 2], enabled, rpm = 0 }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create anisotropic normal map
  const normalMap = useMemo(() => {
    if (!enabled) return null;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base neutral normal
    ctx.fillStyle = 'rgb(128, 128, 255)';
    ctx.fillRect(0, 0, size, size);

    // Horizontal brushed lines (anisotropic direction)
    for (let y = 0; y < size; y += 2) {
      const intensity = 20 + Math.random() * 20;
      ctx.strokeStyle = `rgb(128, ${128 + intensity}, 255)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }

    // Add some scratches perpendicular to brush direction
    ctx.strokeStyle = 'rgb(150, 128, 240)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      const x = Math.random() * size;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 20, size);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 1);
    return texture;
  }, [enabled]);

  // Register for centralized rotation update
  useEffect(() => {
    if (!meshRef.current || rpm <= 0) return;
    const id = `roller-${Math.random()}`;
    registerRoller(id, { mesh: meshRef.current, rpm });
    return () => unregisterRoller(id);
  }, [rpm]);

  return (
    <mesh ref={meshRef} position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, length, 32]} />
      <meshStandardMaterial
        color="#94a3b8"
        metalness={0.95}
        roughness={enabled ? 0.15 : 0.3}
        normalMap={normalMap}
        normalScale={enabled ? new THREE.Vector2(0.5, 0.1) : undefined}
      />
    </mesh>
  );
};
