import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { audioManager } from '../utils/audioManager';
import { shouldRunThisFrame } from '../utils/frameThrottle';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../constants/renderLayers';

// ==========================================
// CENTRALIZED ANIMATION MANAGER
// ==========================================
//
// PERFORMANCE OPTIMIZATION:
// This file previously had 40+ individual useFrame hooks, one per animated component.
// Each useFrame hook adds overhead to React Three Fiber's render loop.
//
// SOLUTION:
// A centralized animation manager with ONE useFrame hook that executes all animations.
// Components register their animation callbacks via useAmbientAnimation hook.
//
// CONVERSION PATTERN (for remaining components):
//
// Before:
//   useFrame((state, delta) => {
//     if (!shouldRunThisFrame(3)) return;
//     if (meshRef.current) {
//       meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
//     }
//   });
//
// After:
//   const animationId = useMemo(() => `component-${position.join(',')}`, [position]);
//   useAmbientAnimation(animationId, (time, delta) => {
//     if (meshRef.current) {
//       meshRef.current.rotation.z = Math.sin(time * 0.3) * 0.02;
//     }
//   });
//
// BENEFITS:
// - Reduced useFrame overhead from 40+ hooks to 1
// - Centralized throttling (all ambient animations at same rate)
// - Easier to debug and monitor animation performance
// - Individual components can still be mounted/unmounted independently
//
// STATUS:
// - ALL animated components (40+) have been successfully converted
// - All components now use the centralized animation manager
// - Single useFrame hook manages all ambient detail animations
// - Performance significantly improved with reduced render loop overhead
// ==========================================

type AnimationCallback = (time: number, delta: number) => void;

// Global registry for all ambient detail animations
const ambientAnimations = new Map<string, AnimationCallback>();

// Register an animation callback
export const registerAnimation = (id: string, callback: AnimationCallback): void => {
  ambientAnimations.set(id, callback);
};

// Unregister an animation callback
export const unregisterAnimation = (id: string): void => {
  ambientAnimations.delete(id);
};

// Single useFrame hook that manages all ambient detail animations
const AmbientAnimationManager: React.FC = () => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame((state, delta) => {
    // Skip all animations when tab is hidden
    if (!isTabVisible) return;

    // Throttle to every 3rd frame for ambient details (they don't need 60fps)
    if (!shouldRunThisFrame(3)) return;

    const time = state.clock.elapsedTime;

    // Execute all registered animation callbacks
    ambientAnimations.forEach((callback) => {
      callback(time, delta);
    });
  });

  return null;
};

// Hook for components to register their animations
// Uses a ref to avoid recreating the registration on every render
export const useAmbientAnimation = (
  id: string,
  animationFn: (time: number, delta: number) => void
) => {
  const callbackRef = useRef<AnimationCallback>(animationFn);

  // Update the callback ref when animationFn changes
  useEffect(() => {
    callbackRef.current = animationFn;
  }, [animationFn]);

  // Register/unregister animation only when id changes
  useEffect(() => {
    const callback: AnimationCallback = (time, delta) => {
      callbackRef.current(time, delta);
    };

    registerAnimation(id, callback);
    return () => {
      unregisterAnimation(id);
    };
  }, [id]);
};

// ==========================================
// AMBIENT DETAIL COMPONENTS
// ==========================================

// Cobweb component for corners and rafters
const Cobweb: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}> = ({ position, rotation = [0, 0, 0], scale = 1 }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Create cobweb geometry with radial lines
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const center = [0, 0, 0];
    const radius = 1.5 * scale;
    const spokes = 8;
    const rings = 5;

    // Create radial spokes
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      vertices.push(center[0], center[1], center[2]);
      vertices.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.3, // Sag effect
        Math.sin(angle) * radius
      );
    }

    // Create concentric rings with sag
    for (let ring = 1; ring <= rings; ring++) {
      const ringRadius = (ring / rings) * radius;
      const sag = ring * 0.05;
      for (let i = 0; i < spokes; i++) {
        const angle1 = (i / spokes) * Math.PI * 2;
        const angle2 = ((i + 1) / spokes) * Math.PI * 2;
        vertices.push(
          Math.cos(angle1) * ringRadius,
          -sag + Math.sin(angle1 * 2) * 0.02,
          Math.sin(angle1) * ringRadius
        );
        vertices.push(
          Math.cos(angle2) * ringRadius,
          -sag + Math.sin(angle2 * 2) * 0.02,
          Math.sin(angle2) * ringRadius
        );
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geo;
  }, [scale]);

  // Subtle swaying animation using centralized manager
  const animationId = useMemo(
    () => `cobweb-${position.join(',')}-${rotation.join(',')}`,
    [position, rotation]
  );

  useAmbientAnimation(animationId, (time) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = Math.sin(time * 0.3) * 0.02;
    }
  });

  return (
    <lineSegments ref={meshRef} position={position} rotation={rotation} geometry={geometry}>
      <lineBasicMaterial color="#94a3b8" transparent opacity={0.3} />
    </lineSegments>
  );
};

// Rust stain component for equipment surfaces
const RustStain: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}> = ({ position, rotation = [0, 0, 0], size = 0.5 }) => {
  // Guard against NaN/invalid size
  const safeSize = Number.isFinite(size) && size > 0 ? size : 0.5;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Transparent background
    ctx.clearRect(0, 0, 128, 128);

    // Create irregular rust stain
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(139, 69, 19, 0.6)');
    gradient.addColorStop(0.3, 'rgba(160, 82, 45, 0.4)');
    gradient.addColorStop(0.6, 'rgba(205, 133, 63, 0.2)');
    gradient.addColorStop(1, 'rgba(205, 133, 63, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Create irregular blob shape
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const r = 40 + Math.random() * 20;
      const x = 64 + Math.cos(angle) * r;
      const y = 64 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Add drip streaks
    for (let i = 0; i < 3; i++) {
      const startX = 50 + Math.random() * 28;
      const startY = 70;
      const length = 20 + Math.random() * 30;

      const dripGradient = ctx.createLinearGradient(startX, startY, startX, startY + length);
      dripGradient.addColorStop(0, 'rgba(139, 69, 19, 0.4)');
      dripGradient.addColorStop(1, 'rgba(139, 69, 19, 0)');

      ctx.strokeStyle = dripGradient;
      ctx.lineWidth = 2 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(startX + (Math.random() - 0.5) * 10, startY + length);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Dispose canvas texture on unmount to avoid GPU leak
  useEffect(() => () => texture?.dispose?.(), [texture]);

  return (
    <mesh position={position} rotation={rotation} renderOrder={RENDER_ORDER.floorEffects}>
      <planeGeometry args={[safeSize, safeSize]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
        polygonOffsetUnits={POLYGON_OFFSET.standard.units}
      />
    </mesh>
  );
};

// Oil puddle with reflections
const OilPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Animate subtle iridescence using centralized manager
  const animationId = useMemo(() => `oil-puddle-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.1 + Math.sin(time * 0.5) * 0.05;
    }
  });

  const shape = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Create irregular puddle shape
    const points = 16;
    const baseRadius = size * 0.5;

    // Center vertex
    vertices.push(0, 0, 0);
    uvs.push(0.5, 0.5);

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = baseRadius * (0.7 + Math.random() * 0.3);
      vertices.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    }

    // Create triangles
    for (let i = 0; i < points; i++) {
      indices.push(0, i + 1, ((i + 1) % points) + 1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [size]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, Math.random() * Math.PI * 2]}
      geometry={shape}
      renderOrder={RENDER_ORDER.floorEffects}
    >
      <meshStandardMaterial
        color="#1a1a2e"
        metalness={0.9}
        roughness={0.1}
        transparent
        opacity={0.7}
        emissive="#3b82f6"
        emissiveIntensity={0.1}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
        polygonOffsetUnits={POLYGON_OFFSET.standard.units}
      />
    </mesh>
  );
};

// Rain puddle for outdoor areas (clear water after rain)
const RainPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1.5,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Animate subtle surface ripple using centralized manager
  const animationId = useMemo(() => `rain-puddle-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.05 + Math.sin(time * 0.8) * 0.02;
    }
  });

  const shape = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Create irregular puddle shape
    const points = 20;
    const baseRadius = size * 0.5;

    // Center vertex
    vertices.push(0, 0, 0);
    uvs.push(0.5, 0.5);

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const r = baseRadius * (0.6 + Math.random() * 0.4);
      vertices.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
    }

    // Create triangles
    for (let i = 0; i < points; i++) {
      indices.push(0, i + 1, ((i + 1) % points) + 1);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [size]);

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, Math.random() * Math.PI * 2]}
      geometry={shape}
      renderOrder={RENDER_ORDER.floorEffects}
    >
      <meshStandardMaterial
        color="#1e3a5f"
        metalness={0.95}
        roughness={0.05}
        transparent
        opacity={0.4}
        emissive="#60a5fa"
        emissiveIntensity={0.05}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
        polygonOffsetUnits={POLYGON_OFFSET.standard.units}
      />
    </mesh>
  );
};

// Animated safety signage with blinking lights
const SafetySign: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  type: 'exit' | 'caution' | 'danger' | 'ppe';
}> = ({ position, rotation = [0, 0, 0], type }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  const [isOn, _setIsOn] = useState(true);

  const colors = {
    exit: '#22c55e',
    caution: '#eab308',
    danger: '#ef4444',
    ppe: '#3b82f6',
  };

  const color = colors[type];

  // Blinking effect for danger signs using centralized manager
  const animationId = useMemo(() => `safety-sign-${position.join(',')}-${type}`, [position, type]);

  useAmbientAnimation(animationId, (time) => {
    if (type === 'danger' && lightRef.current) {
      const blink = Math.sin(time * 4) > 0;
      lightRef.current.intensity = blink ? 0.5 : 0.1;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Sign backing */}
      <mesh>
        <boxGeometry args={[0.6, 0.4, 0.03]} />
        <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* Sign face */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[0.55, 0.35]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>

      {/* Corner lights */}
      {[
        [-0.22, 0.12],
        [0.22, 0.12],
        [-0.22, -0.12],
        [0.22, -0.12],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.025]}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={color}
            emissiveIntensity={type === 'danger' ? (isOn ? 1 : 0.2) : 0.5}
          />
        </mesh>
      ))}

      {/* Glow light */}
      <pointLight
        ref={lightRef}
        position={[0, 0, 0.1]}
        color={color}
        intensity={0.3}
        distance={2}
      />
    </group>
  );
};

// Large wall-mounted clock (for placement on factory walls)
export const FactoryWallClock: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const gameTime = useGameSimulationStore((state) => state.gameTime);
  const secondHandRef = useRef<THREE.Mesh>(null);

  const hourAngle = ((gameTime % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  const minuteAngle = (((gameTime % 1) * 60) / 60) * Math.PI * 2 - Math.PI / 2;

  // Animate second hand using centralized manager
  const animationId = useMemo(() => `factory-clock-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (secondHandRef.current) {
      const seconds = (time * 10) % 60;
      const secondAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
      secondHandRef.current.rotation.z = -secondAngle;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Clock body */}
      <mesh>
        <cylinderGeometry args={[0.6, 0.6, 0.1, 32]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Clock face */}
      <mesh position={[0, 0, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 32]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>

      {/* Clock rim */}
      <mesh position={[0, 0, 0.06]}>
        <torusGeometry args={[0.55, 0.05, 8, 32]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Hour markers */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const isHour = i % 3 === 0;
        return (
          <mesh
            key={i}
            position={[Math.sin(angle) * 0.45, 0.065, Math.cos(angle) * 0.45]}
            rotation={[Math.PI / 2, 0, -angle]}
          >
            <boxGeometry args={[0.03, isHour ? 0.1 : 0.05, 0.02]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        );
      })}

      {/* Hour hand */}
      <group position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, -hourAngle]}>
        <mesh position={[0.12, 0, 0]}>
          <boxGeometry args={[0.25, 0.04, 0.015]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      </group>

      {/* Minute hand */}
      <group position={[0, 0.075, 0]} rotation={[Math.PI / 2, 0, -minuteAngle]}>
        <mesh position={[0.17, 0, 0]}>
          <boxGeometry args={[0.35, 0.025, 0.012]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      </group>

      {/* Second hand */}
      <group ref={secondHandRef} position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0.18, 0, 0]}>
          <boxGeometry args={[0.38, 0.012, 0.008]} />
          <meshStandardMaterial color="#ef4444" />
        </mesh>
      </group>

      {/* Center cap */}
      <mesh position={[0, 0.085, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} />
      </mesh>

      {/* Backlight glow */}
      <pointLight position={[0, 0.2, 0]} color="#fef3c7" intensity={0.2} distance={2} />
    </group>
  );
};

// Fire extinguisher station with animated inspection tag
const FireExtinguisherStation: React.FC<{ position: [number, number, number] }> = ({
  position,
}) => {
  const tagRef = useRef<THREE.Mesh>(null);

  // Gentle swaying for the inspection tag using centralized manager
  const animationId = useMemo(() => `fire-ext-tag-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (tagRef.current) {
      tagRef.current.rotation.z = Math.sin(time * 1.5) * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Wall mount bracket */}
      <mesh position={[0, 1.2, -0.1]}>
        <boxGeometry args={[0.3, 0.15, 0.1]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>

      {/* Extinguisher body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.9, 16]} />
        <meshStandardMaterial color="#dc2626" roughness={0.4} />
      </mesh>

      {/* Top cap */}
      <mesh position={[0, 0.98, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.08, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Handle */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[0.15, 0.04, 0.03]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} />
      </mesh>

      {/* Nozzle */}
      <mesh position={[0.08, 1, 0.08]} rotation={[0.5, 0.3, 0]}>
        <cylinderGeometry args={[0.015, 0.02, 0.15, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Hose */}
      <mesh position={[0.05, 0.85, 0.1]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.08, 0.015, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Pressure gauge */}
      <mesh position={[0, 0.85, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>

      {/* Inspection tag */}
      <group position={[0.12, 0.9, 0]}>
        <mesh ref={tagRef} position={[0.04, -0.05, 0]}>
          <planeGeometry args={[0.06, 0.1]} />
          <meshStandardMaterial color="#f5f5f5" side={THREE.DoubleSide} />
        </mesh>
        {/* Tag string */}
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <cylinderGeometry args={[0.002, 0.002, 0.08, 4]} />
          <meshBasicMaterial color="#94a3b8" />
        </mesh>
      </group>

      {/* Floor marking ring */}
      <mesh
        position={[0, FLOOR_LAYERS.safetyMain, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <ringGeometry args={[0.4, 0.5, 16]} />
        <meshStandardMaterial
          color="#ef4444"
          transparent
          opacity={0.4}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    </group>
  );
};

// Loading dock door that opens/closes - ref-based animation
export const LoadingDockDoor: React.FC<{
  position: [number, number, number];
  isOpen: boolean;
  onToggle?: () => void;
}> = ({ position, isOpen, onToggle: _onToggle }) => {
  const doorRef = useRef<THREE.Group>(null);
  const currentOpenRef = useRef(0);
  const warningLightsActiveRef = useRef(false);
  const [warningActive, setWarningActive] = useState(false);
  const targetOpen = isOpen ? 1 : 0;

  const doorHeight = 6;
  const segments = 8;

  // Door animation using centralized manager
  const animationId = useMemo(() => `loading-door-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (_time, delta) => {
    const speed = 0.5;
    const diff = targetOpen - currentOpenRef.current;
    if (Math.abs(diff) > 0.01) {
      currentOpenRef.current += diff * speed * delta * 10;

      // Update door panel positions directly via refs
      if (doorRef.current) {
        doorRef.current.children.forEach((mesh, i) => {
          const segmentHeight = doorHeight / segments;
          const yOffset = currentOpenRef.current * doorHeight;
          const baseY = (i + 0.5) * segmentHeight;
          const y = Math.min(baseY + yOffset, doorHeight + 0.5);
          mesh.position.y = y;
          mesh.visible = y <= doorHeight + 0.3;
        });
      }

      // Update warning light state only when crossing thresholds
      const shouldBeActive = currentOpenRef.current > 0.1 && currentOpenRef.current < 0.9;
      if (shouldBeActive !== warningLightsActiveRef.current) {
        warningLightsActiveRef.current = shouldBeActive;
        setWarningActive(shouldBeActive);
      }
    }
  });

  return (
    <group position={position}>
      {/* Door frame */}
      <mesh position={[0, doorHeight / 2 + 0.1, 0]}>
        <boxGeometry args={[5.4, 0.2, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[-2.6, doorHeight / 2, 0]}>
        <boxGeometry args={[0.2, doorHeight, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[2.6, doorHeight / 2, 0]}>
        <boxGeometry args={[0.2, doorHeight, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Sectional door panels - positions updated via ref */}
      <group ref={doorRef}>
        {Array.from({ length: segments }).map((_, i) => {
          const segmentHeight = doorHeight / segments;
          const baseY = (i + 0.5) * segmentHeight;
          return (
            <mesh key={i} position={[0, baseY, 0.05]}>
              <boxGeometry args={[5, segmentHeight - 0.02, 0.1]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? '#475569' : '#64748b'}
                metalness={0.4}
                roughness={0.6}
              />
            </mesh>
          );
        })}
      </group>

      {/* Door tracks */}
      {[-2.4, 2.4].map((x, i) => (
        <mesh key={i} position={[x, doorHeight / 2, 0.15]}>
          <boxGeometry args={[0.05, doorHeight + 1, 0.05]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
      ))}

      {/* Warning lights */}
      <WarningLight position={[-2.3, doorHeight + 0.5, 0.2]} isActive={warningActive} />
      <WarningLight position={[2.3, doorHeight + 0.5, 0.2]} isActive={warningActive} />

      {/* Floor warning stripes */}
      <mesh
        position={[0, FLOOR_LAYERS.safetyMain, 1.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <planeGeometry args={[5, 3]} />
        <meshStandardMaterial
          color="#eab308"
          transparent
          opacity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    </group>
  );
};

// Warning light component
const WarningLight: React.FC<{ position: [number, number, number]; isActive: boolean }> = ({
  position,
  isActive,
}) => {
  const lightRef = useRef<THREE.PointLight>(null);

  // Blinking animation using centralized manager
  const animationId = useMemo(() => `warning-light-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (lightRef.current && isActive) {
      lightRef.current.intensity = Math.abs(Math.sin(time * 4)) * 2;
    } else if (lightRef.current) {
      lightRef.current.intensity = 0;
    }
  });

  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.15, 16]} />
        <meshStandardMaterial
          color={isActive ? '#f97316' : '#64748b'}
          emissive={isActive ? '#f97316' : '#000000'}
          emissiveIntensity={isActive ? 0.5 : 0}
        />
      </mesh>
      <pointLight ref={lightRef} color="#f97316" intensity={0} distance={5} />
    </group>
  );
};

// Blinking control panel LED
export const ControlPanelLED: React.FC<{
  position: [number, number, number];
  color?: string;
  blinkPattern?: 'steady' | 'slow' | 'fast' | 'pulse';
}> = ({ position, color = '#22c55e', blinkPattern = 'steady' }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // LED blinking animation using centralized manager
  const animationId = useMemo(
    () => `control-led-${position.join(',')}-${blinkPattern}`,
    [position, blinkPattern]
  );

  useAmbientAnimation(animationId, (time) => {
    if (!meshRef.current) return;
    const mat = meshRef.current.material as THREE.MeshStandardMaterial;

    let intensity = 1;
    switch (blinkPattern) {
      case 'slow':
        intensity = Math.sin(time * 1) > 0 ? 1 : 0.1;
        break;
      case 'fast':
        intensity = Math.sin(time * 5) > 0 ? 1 : 0.1;
        break;
      case 'pulse':
        intensity = 0.3 + Math.abs(Math.sin(time * 2)) * 0.7;
        break;
      default:
        intensity = 0.8;
    }

    mat.emissiveIntensity = intensity;
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
    </mesh>
  );
};

// Control panel with multiple LEDs
export const ControlPanel: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Panel body */}
      <mesh>
        <boxGeometry args={[0.8, 0.6, 0.15]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Panel face */}
      <mesh position={[0, 0, 0.08]}>
        <planeGeometry args={[0.7, 0.5]} />
        <meshStandardMaterial color="#374151" roughness={0.6} />
      </mesh>

      {/* Status LEDs */}
      <ControlPanelLED position={[-0.25, 0.15, 0.09]} color="#22c55e" blinkPattern="pulse" />
      <ControlPanelLED position={[-0.15, 0.15, 0.09]} color="#22c55e" blinkPattern="steady" />
      <ControlPanelLED position={[-0.05, 0.15, 0.09]} color="#eab308" blinkPattern="slow" />
      <ControlPanelLED position={[0.05, 0.15, 0.09]} color="#22c55e" blinkPattern="steady" />
      <ControlPanelLED position={[0.15, 0.15, 0.09]} color="#3b82f6" blinkPattern="fast" />
      <ControlPanelLED position={[0.25, 0.15, 0.09]} color="#22c55e" blinkPattern="steady" />

      {/* Buttons */}
      {[
        [-0.2, -0.05],
        [0, -0.05],
        [0.2, -0.05],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 16]} />
          <meshStandardMaterial color={['#22c55e', '#eab308', '#ef4444'][i]} roughness={0.3} />
        </mesh>
      ))}

      {/* Small display */}
      <mesh position={[0, -0.15, 0.09]}>
        <planeGeometry args={[0.4, 0.1]} />
        <meshStandardMaterial color="#0f172a" emissive="#22c55e" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
};

// Pipe condensation drip effect - ref-based animation (no setState in useFrame)
export const CondensationDrip: React.FC<{ position: [number, number, number] }> = ({
  position,
}) => {
  const dropRef = useRef<THREE.Mesh>(null);
  const dropYRef = useRef(0);
  const startY = 0;
  const endY = -3;

  // Drip animation using centralized manager
  const animationId = useMemo(() => `condensation-drip-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (_time, delta) => {
    let newY = dropYRef.current - delta * 1.5;
    if (newY < endY) {
      // Reset with random delay
      newY = Math.random() > 0.98 ? startY : endY - 0.1;
    }
    dropYRef.current = newY;

    if (dropRef.current) {
      dropRef.current.position.y = newY;
      // Stretch as it falls
      const stretch = 1 + Math.abs(newY - startY) * 0.1;
      dropRef.current.scale.y = stretch;
      dropRef.current.visible = newY > endY;
    }
  });

  return (
    <group position={position}>
      {/* Water buildup on pipe */}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.03, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#60a5fa"
          transparent
          opacity={0.6}
          metalness={0.8}
          roughness={0.1}
        />
      </mesh>

      {/* Falling drop */}
      <mesh ref={dropRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial
          color="#60a5fa"
          transparent
          opacity={0.7}
          metalness={0.8}
          roughness={0.1}
        />
      </mesh>
    </group>
  );
};

// Audio-reactive equipment vibration
export const VibrationIndicator: React.FC<{
  position: [number, number, number];
  machineId: string;
}> = ({ position, machineId: _machineId }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [vibrationLevel, _setVibrationLevel] = useState(0.5);

  // Vibration animation using centralized manager
  const animationId = useMemo(
    () => `vibration-${position.join(',')}-${_machineId}`,
    [position, _machineId]
  );

  useAmbientAnimation(animationId, (time) => {
    if (!groupRef.current) return;

    // Simulate vibration based on audio manager state
    // In a real implementation, this would read from audio analysis
    const baseVibration = 0.02;
    const audioModulation = Math.sin(time * 20) * 0.01;
    const randomJitter = (Math.random() - 0.5) * 0.005;

    const totalVibration = (baseVibration + audioModulation + randomJitter) * vibrationLevel;

    groupRef.current.position.x = position[0] + (Math.random() - 0.5) * totalVibration;
    groupRef.current.position.y = position[1] + (Math.random() - 0.5) * totalVibration;
    groupRef.current.position.z = position[2] + (Math.random() - 0.5) * totalVibration;
  });

  return <group ref={groupRef} />;
};

// ==========================================
// ENVIRONMENTAL PROPS
// ==========================================

// Stacked pallets in corners
const StackedPallets: React.FC<{ position: [number, number, number]; count?: number }> = ({
  position,
  count = 3,
}) => {
  return (
    <group position={position}>
      {Array.from({ length: count }).map((_, i) => (
        <group key={i} position={[0, i * 0.15, 0]}>
          {/* Pallet base */}
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[1.2, 0.1, 1]} />
            <meshStandardMaterial color="#78350f" roughness={0.9} />
          </mesh>
          {/* Pallet slats */}
          {[-0.4, 0, 0.4].map((x, j) => (
            <mesh key={j} position={[x, 0, 0]} castShadow>
              <boxGeometry args={[0.1, 0.1, 1]} />
              <meshStandardMaterial color="#92400e" roughness={0.9} />
            </mesh>
          ))}
          {/* Cross supports */}
          {[-0.35, 0.35].map((z, j) => (
            <mesh key={j} position={[0, 0, z]}>
              <boxGeometry args={[1.2, 0.08, 0.08]} />
              <meshStandardMaterial color="#78350f" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Random boxes on top pallet */}
      {Math.random() > 0.3 && (
        <group position={[0, count * 0.15 + 0.2, 0]}>
          <mesh position={[-0.2, 0.15, 0.1]} castShadow>
            <boxGeometry args={[0.4, 0.3, 0.35]} />
            <meshStandardMaterial color="#a3a3a3" roughness={0.7} />
          </mesh>
          <mesh position={[0.25, 0.1, -0.15]} castShadow>
            <boxGeometry args={[0.3, 0.2, 0.25]} />
            <meshStandardMaterial color="#78716c" roughness={0.7} />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Tool rack / pegboard on walls
const ToolRack: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Pegboard backing */}
      <mesh>
        <boxGeometry args={[1.5, 1, 0.05]} />
        <meshStandardMaterial color="#a3a3a3" roughness={0.8} />
      </mesh>

      {/* Pegboard holes pattern */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[1.4, 0.9]} />
        <meshStandardMaterial color="#737373" roughness={0.9} />
      </mesh>

      {/* Hanging tools */}
      {/* Wrench */}
      <group position={[-0.5, 0.2, 0.08]}>
        <mesh rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[0.04, 0.3, 0.02]} />
          <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0.02, 0.12, 0]} rotation={[0, 0, Math.PI / 6]}>
          <boxGeometry args={[0.08, 0.06, 0.02]} />
          <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>

      {/* Hammer */}
      <group position={[-0.2, 0.15, 0.08]}>
        <mesh>
          <boxGeometry args={[0.03, 0.25, 0.03]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.15, 0]}>
          <boxGeometry args={[0.08, 0.06, 0.04]} />
          <meshStandardMaterial color="#52525b" metalness={0.7} roughness={0.4} />
        </mesh>
      </group>

      {/* Screwdrivers */}
      {[0.1, 0.2, 0.3].map((x, i) => (
        <group key={i} position={[x, 0.1, 0.08]}>
          <mesh>
            <cylinderGeometry args={[0.015, 0.015, 0.15, 8]} />
            <meshStandardMaterial color={['#ef4444', '#eab308', '#22c55e'][i]} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.08, 6]} />
            <meshStandardMaterial color="#71717a" metalness={0.8} />
          </mesh>
        </group>
      ))}

      {/* Tape measure */}
      <mesh position={[0.5, 0.2, 0.08]}>
        <boxGeometry args={[0.08, 0.08, 0.04]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} />
      </mesh>

      {/* Pliers */}
      <group position={[0.5, -0.1, 0.08]}>
        <mesh rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.02, 0.12, 0.01]} />
          <meshStandardMaterial color="#ef4444" roughness={0.5} />
        </mesh>
        <mesh rotation={[0, 0, -0.3]}>
          <boxGeometry args={[0.02, 0.12, 0.01]} />
          <meshStandardMaterial color="#ef4444" roughness={0.5} />
        </mesh>
      </group>

      {/* Hook for hanging */}
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.1, 8]} />
        <meshStandardMaterial color="#52525b" metalness={0.7} />
      </mesh>
    </group>
  );
};

// Hard hat on hook
const HardHatHook: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#eab308',
}) => {
  const hatRef = useRef<THREE.Group>(null);

  // Gentle swaying using centralized manager
  const animationId = useMemo(() => `hard-hat-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (hatRef.current) {
      hatRef.current.rotation.z = Math.sin(time * 0.8) * 0.03;
    }
  });

  return (
    <group position={position}>
      {/* Wall mount */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[0.1, 0.1, 0.05]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} />
      </mesh>

      {/* Hook */}
      <mesh position={[0, -0.05, 0.05]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.04, 0.01, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#52525b" metalness={0.7} />
      </mesh>

      {/* Hard hat */}
      <group ref={hatRef} position={[0, -0.15, 0.08]}>
        <mesh>
          <sphereGeometry args={[0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
        {/* Brim */}
        <mesh position={[0, -0.01, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.02, 16]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
};

// Cleaning equipment - broom and mop bucket
const CleaningEquipment: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const broomRef = useRef<THREE.Mesh>(null);

  return (
    <group position={position}>
      {/* Mop bucket */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.25, 0.4, 16]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.5} />
        </mesh>
        {/* Water inside */}
        <mesh position={[0, 0.3, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.1, 16]} />
          <meshStandardMaterial color="#60a5fa" transparent opacity={0.6} metalness={0.3} />
        </mesh>
        {/* Handle */}
        <mesh position={[0.15, 0.35, 0]}>
          <boxGeometry args={[0.15, 0.08, 0.02]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
        {/* Wheels */}
        {[-0.15, 0.15].map((x, i) => (
          <mesh key={i} position={[x, 0.03, 0.2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.02, 12]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        ))}
        {/* Wringer */}
        <mesh position={[0, 0.45, 0.15]}>
          <boxGeometry args={[0.2, 0.1, 0.1]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} />
        </mesh>
      </group>

      {/* Broom leaning against wall */}
      <group position={[0.4, 0, 0]} rotation={[0, 0, 0.15]}>
        <mesh ref={broomRef} position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.2, 8]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        {/* Bristles */}
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.15, 0.12, 0.04]} />
          <meshStandardMaterial color="#a16207" roughness={0.9} />
        </mesh>
      </group>

      {/* Wet floor sign */}
      <group position={[-0.4, 0, 0.3]}>
        <mesh position={[0, 0.25, 0]} rotation={[0, 0.3, 0]}>
          <coneGeometry args={[0.15, 0.5, 4]} />
          <meshStandardMaterial color="#eab308" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
};

// Cable tray with hanging wires
const CableTray: React.FC<{
  position: [number, number, number];
  length?: number;
  rotation?: [number, number, number];
}> = ({ position, length = 10, rotation = [0, 0, 0] }) => {
  const wiresRef = useRef<THREE.Group>(null);

  // Subtle wire sway using centralized manager
  const animationId = useMemo(() => `cable-tray-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (wiresRef.current) {
      wiresRef.current.children.forEach((wire, i) => {
        wire.rotation.z = Math.sin(time * 0.5 + i) * 0.02;
      });
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Tray base */}
      <mesh>
        <boxGeometry args={[length, 0.05, 0.3]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Tray sides */}
      {[-0.12, 0.12].map((z, i) => (
        <mesh key={i} position={[0, 0.05, z]}>
          <boxGeometry args={[length, 0.1, 0.02]} />
          <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* Support brackets */}
      {Array.from({ length: Math.floor(length / 2) }).map((_, i) => (
        <mesh key={i} position={[-length / 2 + 1 + i * 2, 0.15, 0]}>
          <boxGeometry args={[0.05, 0.3, 0.35]} />
          <meshStandardMaterial color="#374151" metalness={0.5} />
        </mesh>
      ))}

      {/* Cables running through */}
      {[
        { color: '#ef4444', offset: -0.08 },
        { color: '#3b82f6', offset: 0 },
        { color: '#22c55e', offset: 0.08 },
      ].map((cable, i) => (
        <mesh key={i} position={[0, 0.02, cable.offset]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, length, 8]} />
          <meshStandardMaterial color={cable.color} roughness={0.6} />
        </mesh>
      ))}

      {/* Hanging wires */}
      <group ref={wiresRef}>
        {Array.from({ length: 3 }).map((_, i) => (
          <group key={i} position={[-length / 3 + i * (length / 3), -0.1, 0]}>
            <mesh>
              <cylinderGeometry args={[0.008, 0.008, 0.5 + Math.random() * 0.3, 6]} />
              <meshStandardMaterial color={['#ef4444', '#eab308', '#3b82f6'][i]} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
};

// Steam/vapor vent
const SteamVent: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const steamRef = useRef<THREE.Points>(null);
  const particleCount = 30;

  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities: number[] = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.2;
      positions[i * 3 + 1] = Math.random() * 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      velocities.push(0.01 + Math.random() * 0.02);
    }

    return { positions, velocities };
  }, []);

  // Steam particle animation using centralized manager
  const animationId = useMemo(() => `steam-vent-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, () => {
    if (!steamRef.current) return;
    const positions = steamRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 1] += particles.velocities[i];
      positions[i * 3] += (Math.random() - 0.5) * 0.01;

      if (positions[i * 3 + 1] > 1) {
        positions[i * 3] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      }
    }

    steamRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <group position={position}>
      {/* Vent pipe */}
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 12]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Vent cap */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.12, 0.08, 0.1, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Steam particles */}
      <points ref={steamRef} position={[0, 0.25, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          color="#e2e8f0"
          transparent
          opacity={0.3}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
};

// Drainage grate in floor
const DrainageGrate: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 0.6,
}) => {
  return (
    <group position={position}>
      {/* Grate frame */}
      <mesh position={[0, FLOOR_LAYERS.puddle, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 0.4, size * 0.5, 4]} />
        <meshStandardMaterial
          color="#374151"
          metalness={0.7}
          roughness={0.4}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Grate bars - raised to prevent z-fighting with puddle layer */}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh
          key={i}
          position={[0, FLOOR_LAYERS.puddle + 0.015, (i - 2) * size * 0.15]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <boxGeometry args={[size * 0.8, 0.02, 0.03]} />
          <meshStandardMaterial
            color="#1e293b"
            metalness={0.8}
            roughness={0.3}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
            polygonOffsetUnits={POLYGON_OFFSET.standard.units}
          />
        </mesh>
      ))}

      {/* Dark hole beneath - positioned below floor to prevent z-fighting */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[size * 0.4, 8]} />
        <meshBasicMaterial color="#0a0a0a" />
      </mesh>
    </group>
  );
};

// ==========================================
// ANIMATED ELEMENTS
// ==========================================

// Flickering fluorescent light
const FlickeringLight: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  const tubeRef = useRef<THREE.Mesh>(null);
  const flickerState = useRef({ nextFlicker: 0, isFlickering: false, flickerEnd: 0 });

  // Flickering animation using centralized manager
  const animationId = useMemo(() => `flickering-light-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!lightRef.current || !tubeRef.current) return;
    const mat = tubeRef.current.material as THREE.MeshStandardMaterial;

    // Random flickering behavior
    if (time > flickerState.current.nextFlicker && !flickerState.current.isFlickering) {
      if (Math.random() < 0.002) {
        // Rare flicker
        flickerState.current.isFlickering = true;
        flickerState.current.flickerEnd = time + 0.5 + Math.random() * 1;
      }
      flickerState.current.nextFlicker = time + 0.1;
    }

    if (flickerState.current.isFlickering) {
      if (time < flickerState.current.flickerEnd) {
        const flicker = Math.random() > 0.3 ? 1 : 0.1;
        lightRef.current.intensity = flicker * 2;
        mat.emissiveIntensity = flicker * 0.8;
      } else {
        flickerState.current.isFlickering = false;
        lightRef.current.intensity = 2;
        mat.emissiveIntensity = 0.8;
      }
    }
  });

  return (
    <group position={position}>
      {/* Light fixture housing */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.2, 0.08, 0.15]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Fluorescent tube */}
      <mesh ref={tubeRef} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
        <meshStandardMaterial color="#f5f5f5" emissive="#f5f5f5" emissiveIntensity={0.8} />
      </mesh>

      <pointLight
        ref={lightRef}
        position={[0, -0.1, 0]}
        color="#f5f5f5"
        intensity={2}
        distance={8}
      />
    </group>
  );
};

// Swinging chain with hook
const SwingingChain: React.FC<{ position: [number, number, number]; length?: number }> = ({
  position,
  length = 3,
}) => {
  const chainRef = useRef<THREE.Group>(null);
  const swingSpeed = useRef(0.5 + Math.random() * 0.5);
  const swingAmount = useRef(0.05 + Math.random() * 0.1);

  // Swinging animation using centralized manager
  const animationId = useMemo(() => `swinging-chain-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (chainRef.current) {
      chainRef.current.rotation.z = Math.sin(time * swingSpeed.current) * swingAmount.current;
      chainRef.current.rotation.x =
        Math.cos(time * swingSpeed.current * 0.7) * swingAmount.current * 0.5;
    }
  });

  const links = Math.floor(length / 0.15);

  return (
    <group position={position}>
      {/* Ceiling mount */}
      <mesh>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.7} />
      </mesh>

      <group ref={chainRef}>
        {/* Chain links */}
        {Array.from({ length: links }).map((_, i) => (
          <mesh
            key={i}
            position={[0, -0.1 - i * 0.12, 0]}
            rotation={[0, i % 2 === 0 ? 0 : Math.PI / 2, 0]}
          >
            <torusGeometry args={[0.03, 0.008, 6, 12]} />
            <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}

        {/* Hook at bottom */}
        <group position={[0, -length + 0.2, 0]}>
          <mesh rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.08, 0.015, 8, 16, Math.PI * 1.5]} />
            <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
            <meshStandardMaterial color="#374151" metalness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// Electrical panel with occasional sparks
const ElectricalPanel: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const sparkRef = useRef<THREE.PointLight>(null);
  const sparkState = useRef({ nextSpark: 5 + Math.random() * 30, sparking: false, sparkEnd: 0 });

  // Sparking animation using centralized manager
  const animationId = useMemo(() => `electrical-panel-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!sparkRef.current) return;

    if (time > sparkState.current.nextSpark && !sparkState.current.sparking) {
      sparkState.current.sparking = true;
      sparkState.current.sparkEnd = time + 0.1 + Math.random() * 0.2;
      sparkState.current.nextSpark = time + 20 + Math.random() * 60; // Very rare
    }

    if (sparkState.current.sparking) {
      if (time < sparkState.current.sparkEnd) {
        sparkRef.current.intensity = Math.random() > 0.5 ? 5 : 0;
      } else {
        sparkState.current.sparking = false;
        sparkRef.current.intensity = 0;
      }
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Panel box */}
      <mesh castShadow>
        <boxGeometry args={[0.6, 0.8, 0.15]} />
        <meshStandardMaterial color="#374151" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Panel door */}
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[0.55, 0.75, 0.02]} />
        <meshStandardMaterial color="#52525b" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Warning label */}
      <mesh position={[0, 0.2, 0.1]}>
        <planeGeometry args={[0.3, 0.15]} />
        <meshStandardMaterial color="#eab308" />
      </mesh>

      {/* Handle */}
      <mesh position={[0.2, 0, 0.1]}>
        <boxGeometry args={[0.04, 0.12, 0.03]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Conduit pipes */}
      {[-0.15, 0.15].map((x, i) => (
        <mesh key={i} position={[x, 0.5, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
          <meshStandardMaterial color="#64748b" metalness={0.6} />
        </mesh>
      ))}

      {/* Spark light */}
      <pointLight
        ref={sparkRef}
        position={[0, -0.2, 0.2]}
        color="#60a5fa"
        intensity={0}
        distance={2}
      />
    </group>
  );
};

// ==========================================
// AMBIENT LIFE
// ==========================================

// Pigeon in rafters
const Pigeon: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const pigeonRef = useRef<THREE.Group>(null);
  const state = useRef({
    behavior: 'idle' as 'idle' | 'pecking' | 'looking',
    nextBehavior: Math.random() * 5,
    walkTarget: null as [number, number, number] | null,
  });

  // Animated pigeon behavior using centralized manager
  const animationId = useMemo(() => `pigeon-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!pigeonRef.current) return;

    // Change behavior occasionally
    if (time > state.current.nextBehavior) {
      const behaviors = ['idle', 'pecking', 'looking'] as const;
      state.current.behavior = behaviors[Math.floor(Math.random() * behaviors.length)];
      state.current.nextBehavior = time + 2 + Math.random() * 5;
    }

    // Animate based on behavior
    switch (state.current.behavior) {
      case 'pecking':
        pigeonRef.current.rotation.x = Math.sin(time * 8) * 0.2;
        break;
      case 'looking':
        pigeonRef.current.rotation.y = Math.sin(time * 2) * 0.5;
        break;
      default:
        pigeonRef.current.rotation.x = 0;
        pigeonRef.current.rotation.y *= 0.95;
    }
  });

  return (
    <group position={position}>
      <group ref={pigeonRef}>
        {/* Body */}
        <mesh>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#64748b" roughness={0.8} />
        </mesh>

        {/* Head */}
        <mesh position={[0.08, 0.04, 0]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshStandardMaterial color="#64748b" roughness={0.8} />
        </mesh>

        {/* Beak */}
        <mesh position={[0.13, 0.03, 0]} rotation={[0, 0, -0.3 + Math.PI / 2]}>
          <coneGeometry args={[0.01, 0.03, 4]} />
          <meshStandardMaterial color="#f97316" roughness={0.5} />
        </mesh>

        {/* Tail */}
        <mesh position={[-0.1, 0, 0]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.08, 0.02, 0.04]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>

        {/* Feet */}
        {[-0.02, 0.02].map((z, i) => (
          <mesh key={i} position={[0, -0.08, z]}>
            <cylinderGeometry args={[0.005, 0.005, 0.04, 4]} />
            <meshStandardMaterial color="#f97316" roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// Mouse scurrying near walls
const Mouse: React.FC<{ position: [number, number, number]; pathLength?: number }> = ({
  position,
  pathLength = 3,
}) => {
  const mouseRef = useRef<THREE.Group>(null);
  const state = useRef({
    isMoving: false,
    nextMove: 5 + Math.random() * 20,
    moveEnd: 0,
    direction: 1,
    currentX: 0,
  });

  // Mouse scurrying animation using centralized manager
  const animationId = useMemo(() => `mouse-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time, delta) => {
    if (!mouseRef.current) return;

    // Start moving occasionally
    if (time > state.current.nextMove && !state.current.isMoving) {
      state.current.isMoving = true;
      state.current.moveEnd = time + 0.5 + Math.random() * 1;
      state.current.direction = Math.random() > 0.5 ? 1 : -1;
      state.current.nextMove = time + 10 + Math.random() * 30; // Rare
    }

    if (state.current.isMoving) {
      if (time < state.current.moveEnd) {
        // Quick scurrying movement
        state.current.currentX += state.current.direction * delta * 3;
        state.current.currentX = Math.max(
          -pathLength / 2,
          Math.min(pathLength / 2, state.current.currentX)
        );
        mouseRef.current.position.x = state.current.currentX;
        mouseRef.current.rotation.y = state.current.direction > 0 ? 0 : Math.PI;

        // Bobbing motion
        mouseRef.current.position.y = Math.abs(Math.sin(time * 30)) * 0.01;
      } else {
        state.current.isMoving = false;
      }
    }
  });

  return (
    <group position={position}>
      <group ref={mouseRef} scale={0.5}>
        {/* Body */}
        <mesh>
          <sphereGeometry args={[0.06, 8, 6]} scale={[1.5, 1, 1]} />
          <meshStandardMaterial color="#78716c" roughness={0.9} />
        </mesh>

        {/* Head */}
        <mesh position={[0.08, 0.01, 0]}>
          <sphereGeometry args={[0.03, 8, 6]} />
          <meshStandardMaterial color="#78716c" roughness={0.9} />
        </mesh>

        {/* Ears */}
        {[-0.015, 0.015].map((z, i) => (
          <mesh key={i} position={[0.08, 0.04, z]}>
            <sphereGeometry args={[0.015, 6, 6]} />
            <meshStandardMaterial color="#fca5a5" roughness={0.7} />
          </mesh>
        ))}

        {/* Tail */}
        <mesh position={[-0.1, 0.01, 0]} rotation={[0, 0, 0.5 + Math.PI / 2]}>
          <cylinderGeometry args={[0.005, 0.003, 0.12, 6]} />
          <meshStandardMaterial color="#d6d3d1" roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
};

// ==========================================
// ATMOSPHERE EFFECTS
// ==========================================

// God rays / dust motes in light beams
const GodRays: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 100;

  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Distribute in a cone/beam shape
      const t = Math.random();
      const spread = t * 2; // Wider at bottom
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = -t * 8; // Vertical beam
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      sizes[i] = 0.02 + Math.random() * 0.03;
    }

    return { positions, sizes };
  }, []);

  // God rays particle animation using centralized manager
  const animationId = useMemo(() => `god-rays-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!particlesRef.current) return;
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      // Slow floating motion
      positions[i * 3] += Math.sin(time * 0.3 + i) * 0.002;
      positions[i * 3 + 1] += 0.005;
      positions[i * 3 + 2] += Math.cos(time * 0.2 + i) * 0.002;

      // Reset when reaching top
      if (positions[i * 3 + 1] > 0) {
        const t = Math.random();
        const spread = t * 2;
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = -8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      }
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Light beam cone (volumetric effect) */}
      <mesh>
        <coneGeometry args={[2, 8, 16, 1, true]} />
        <meshBasicMaterial
          color="#fef3c7"
          transparent
          opacity={0.03}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Dust particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.05}
          color="#fef3c7"
          transparent
          opacity={0.4}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
};

// Graffiti / worker tags on walls
const Graffiti: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  type?: 'tag' | 'drawing' | 'message';
}> = ({ position, rotation = [0, 0, 0], type = 'tag' }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 64);

    switch (type) {
      case 'tag': {
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = 'rgba(50, 50, 50, 0.6)';
        const tags = ['JAKE WUZ HERE', 'B.M. 2019', 'MILL CREW', 'SHIFT 3'];
        ctx.fillText(tags[Math.floor(Math.random() * tags.length)], 10, 40);
        break;
      }
      case 'drawing':
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.5)';
        ctx.lineWidth = 2;
        // Simple smiley
        ctx.beginPath();
        ctx.arc(64, 32, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(56, 28, 3, 0, Math.PI * 2);
        ctx.arc(72, 28, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(64, 32, 12, 0.2, Math.PI - 0.2);
        ctx.stroke();
        break;
      case 'message':
        ctx.font = '14px Arial';
        ctx.fillStyle = 'rgba(40, 40, 40, 0.5)';
        ctx.fillText('CALL MOM', 10, 25);
        ctx.fillText('555-0123', 10, 45);
        break;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [type]);

  // Dispose canvas texture on unmount to avoid GPU leak
  useEffect(() => () => texture?.dispose?.(), [texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[0.8, 0.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// Bulletin board with pinned notices
const BulletinBoard: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const paperRef = useRef<THREE.Group>(null);

  // Gentle paper flutter using centralized manager
  const animationId = useMemo(() => `bulletin-board-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (paperRef.current) {
      paperRef.current.children.forEach((paper, i) => {
        paper.rotation.z = Math.sin(time * 2 + i * 0.5) * 0.02;
      });
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Cork board */}
      <mesh>
        <boxGeometry args={[1.2, 0.9, 0.05]} />
        <meshStandardMaterial color="#b45309" roughness={0.9} />
      </mesh>

      {/* Frame */}
      {[
        [-0.6, 0],
        [0.6, 0],
        [0, -0.45],
        [0, 0.45],
      ].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.03]} rotation={[0, 0, i < 2 ? 0 : Math.PI / 2]}>
          <boxGeometry args={[0.05, i < 2 ? 0.95 : 1.25, 0.03]} />
          <meshStandardMaterial color="#78350f" roughness={0.7} />
        </mesh>
      ))}

      {/* Pinned papers */}
      <group ref={paperRef}>
        {/* Safety notice */}
        <group position={[-0.35, 0.2, 0.04]}>
          <mesh>
            <planeGeometry args={[0.3, 0.4]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.18, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        </group>

        {/* Schedule */}
        <group position={[0.1, 0.15, 0.04]}>
          <mesh rotation={[0, 0, 0.1]}>
            <planeGeometry args={[0.35, 0.3]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
          </mesh>
          <mesh position={[0.1, 0.1, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#3b82f6" />
          </mesh>
        </group>

        {/* Memo */}
        <group position={[0.35, -0.1, 0.04]}>
          <mesh rotation={[0, 0, -0.15]}>
            <planeGeometry args={[0.25, 0.25]} />
            <meshStandardMaterial color="#fde047" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.1, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
        </group>

        {/* Photo */}
        <group position={[-0.3, -0.2, 0.04]}>
          <mesh rotation={[0, 0, 0.05]}>
            <planeGeometry args={[0.2, 0.15]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.6} />
          </mesh>
          <mesh position={[-0.05, 0.06, 0.01]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        </group>

        {/* Flyer */}
        <group position={[0, -0.25, 0.04]}>
          <mesh rotation={[0, 0, -0.08]}>
            <planeGeometry args={[0.28, 0.2]} />
            <meshStandardMaterial color="#bfdbfe" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.08, 0.01]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#f97316" />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// Scorch marks near welding/hot areas
const ScorchMark: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}> = ({ position, rotation = [0, 0, 0], size = 0.5 }) => {
  // Guard against NaN/invalid size
  const safeSize = Number.isFinite(size) && size > 0 ? size : 0.5;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Create irregular scorch pattern
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 55);
    gradient.addColorStop(0, 'rgba(20, 20, 20, 0.8)');
    gradient.addColorStop(0.3, 'rgba(40, 30, 20, 0.6)');
    gradient.addColorStop(0.6, 'rgba(60, 40, 20, 0.3)');
    gradient.addColorStop(1, 'rgba(80, 50, 30, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const r = 35 + Math.random() * 25;
      const x = 64 + Math.cos(angle) * r;
      const y = 64 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Add some spark splatter
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 30;
      ctx.fillStyle = `rgba(30, 30, 30, ${0.3 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(
        64 + Math.cos(angle) * dist,
        64 + Math.sin(angle) * dist,
        2 + Math.random() * 4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Dispose canvas texture on unmount to avoid GPU leak
  useEffect(() => () => texture?.dispose?.(), [texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[safeSize, safeSize]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// ==========================================
// MORE PROPS
// ==========================================

// Oil drum / barrel
const OilDrum: React.FC<{
  position: [number, number, number];
  color?: string;
  tipped?: boolean;
}> = ({ position, color = '#3b82f6', tipped = false }) => {
  return (
    <group
      position={position}
      rotation={
        tipped
          ? [Math.PI / 2 - 0.3, 0, Math.random() * Math.PI * 2]
          : [0, Math.random() * Math.PI * 2, 0]
      }
    >
      {/* Drum body */}
      <mesh position={[0, tipped ? 0 : 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.9, 16]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Top rim */}
      <mesh position={[0, tipped ? 0.45 : 0.9, 0]}>
        <torusGeometry args={[0.28, 0.02, 8, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Bottom rim */}
      <mesh position={[0, tipped ? -0.45 : 0, 0]}>
        <torusGeometry args={[0.28, 0.02, 8, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Center band */}
      <mesh position={[0, tipped ? 0 : 0.45, 0]}>
        <torusGeometry args={[0.29, 0.015, 8, 16]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Bung holes on top */}
      {!tipped && (
        <>
          <mesh position={[-0.1, 0.91, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.02, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} />
          </mesh>
          <mesh position={[0.1, 0.91, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.02, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} />
          </mesh>
        </>
      )}
    </group>
  );
};

// Gas cylinder (chained to wall)
const GasCylinder: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#22c55e',
}) => {
  return (
    <group position={position}>
      {/* Cylinder body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 1.2, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Top dome */}
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Bottom */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.13, 0.13, 0.04, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Valve guard */}
      <mesh position={[0, 1.35, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.15, 8]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Valve */}
      <mesh position={[0, 1.4, 0.05]}>
        <boxGeometry args={[0.04, 0.06, 0.04]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} />
      </mesh>

      {/* Safety chain */}
      <mesh position={[0, 0.8, 0.15]}>
        <torusGeometry args={[0.02, 0.005, 6, 12]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} />
      </mesh>
      <mesh position={[0, 0.8, 0.19]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.02, 0.005, 6, 12]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} />
      </mesh>

      {/* Wall bracket */}
      <mesh position={[0, 0.8, 0.25]}>
        <boxGeometry args={[0.2, 0.1, 0.05]} />
        <meshStandardMaterial color="#52525b" metalness={0.5} />
      </mesh>
    </group>
  );
};

// Toolbox on floor
const Toolbox: React.FC<{ position: [number, number, number]; isOpen?: boolean }> = ({
  position,
  isOpen = false,
}) => {
  return (
    <group position={position}>
      {/* Main box */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.25]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Lid */}
      <group position={[0, 0.2, isOpen ? 0.12 : 0]} rotation={[isOpen ? -Math.PI / 3 : 0, 0, 0]}>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[0.5, 0.04, 0.25]} />
          <meshStandardMaterial color="#b91c1c" roughness={0.5} metalness={0.3} />
        </mesh>
      </group>

      {/* Handle */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.2, 0.03, 0.03]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Latches */}
      {[-0.18, 0.18].map((x, i) => (
        <mesh key={i} position={[x, 0.15, 0.13]}>
          <boxGeometry args={[0.04, 0.06, 0.02]} />
          <meshStandardMaterial color="#fbbf24" metalness={0.5} />
        </mesh>
      ))}

      {/* Tools visible if open */}
      {isOpen && (
        <group position={[0, 0.15, 0]}>
          <mesh position={[-0.15, 0.05, 0]} rotation={[0, 0, 0.2]}>
            <cylinderGeometry args={[0.01, 0.01, 0.15, 6]} />
            <meshStandardMaterial color="#71717a" metalness={0.8} />
          </mesh>
          <mesh position={[0.1, 0.03, 0.05]}>
            <boxGeometry args={[0.08, 0.02, 0.02]} />
            <meshStandardMaterial color="#52525b" metalness={0.7} />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Trash bin with overflowing garbage
const TrashBin: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Bin body */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.2, 0.7, 12]} />
        <meshStandardMaterial color="#374151" roughness={0.7} />
      </mesh>

      {/* Rim */}
      <mesh position={[0, 0.7, 0]}>
        <torusGeometry args={[0.25, 0.02, 8, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.4} />
      </mesh>

      {/* Overflowing garbage */}
      {/* Crumpled paper */}
      <mesh position={[-0.05, 0.75, 0.1]}>
        <icosahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.72, -0.05]}>
        <icosahedronGeometry args={[0.06, 0]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.9} />
      </mesh>

      {/* Crushed can */}
      <mesh position={[0.15, 0.68, 0.08]} rotation={[0.5, 0.3, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 0.08, 8]} />
        <meshStandardMaterial color="#dc2626" metalness={0.6} />
      </mesh>

      {/* Plastic wrapper */}
      <mesh position={[-0.12, 0.73, -0.08]} rotation={[0.3, 0.5, 0.2]}>
        <planeGeometry args={[0.1, 0.08]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Banana peel */}
      <mesh position={[0, 0.78, 0]} rotation={[0.4, Math.random() * Math.PI, 0]}>
        <torusGeometry args={[0.04, 0.015, 6, 8, Math.PI]} />
        <meshStandardMaterial color="#eab308" roughness={0.7} />
      </mesh>
    </group>
  );
};

// Coffee cup / thermos on surfaces
const CoffeeCup: React.FC<{
  position: [number, number, number];
  type?: 'cup' | 'thermos' | 'mug';
}> = ({ position, type = 'cup' }) => {
  return (
    <group position={position}>
      {type === 'cup' && (
        <>
          {/* Paper cup */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.035, 0.03, 0.12, 12]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
          </mesh>
          {/* Coffee ring stain */}
          <mesh position={[0.06, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.025, 0.04, 12]} />
            <meshStandardMaterial
              color="#78350f"
              transparent
              opacity={0.3}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.strong.factor}
              polygonOffsetUnits={POLYGON_OFFSET.strong.units}
            />
          </mesh>
        </>
      )}

      {type === 'thermos' && (
        <>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.24, 12]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.035, 0.04, 0.03, 12]} />
            <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
        </>
      )}

      {type === 'mug' && (
        <>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.04, 0.035, 0.1, 12]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.6} />
          </mesh>
          {/* Handle */}
          <mesh position={[0.05, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.025, 0.008, 6, 12, Math.PI]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.6} />
          </mesh>
          {/* Coffee inside */}
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 12]} />
            <meshStandardMaterial color="#3f2305" roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
};

// First aid kit wall box
const FirstAidKit: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Box */}
      <mesh castShadow>
        <boxGeometry args={[0.35, 0.25, 0.1]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
      </mesh>

      {/* Red cross */}
      <mesh position={[0, 0, 0.051]}>
        <boxGeometry args={[0.15, 0.05, 0.001]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>
      <mesh position={[0, 0, 0.051]}>
        <boxGeometry args={[0.05, 0.15, 0.001]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>

      {/* Handle */}
      <mesh position={[0.12, 0, 0.06]}>
        <boxGeometry args={[0.03, 0.08, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} />
      </mesh>
    </group>
  );
};

// Extension cord snaking across floor
const ExtensionCord: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
}> = ({ start, end, color = '#f97316' }) => {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const segments = 20;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[2] + (end[2] - start[2]) * t;
      // Add some waviness
      const wave = Math.sin(t * Math.PI * 3) * 0.3;
      const perpX = -(end[2] - start[2]);
      const perpZ = end[0] - start[0];
      const len = Math.sqrt(perpX * perpX + perpZ * perpZ);

      pts.push(new THREE.Vector3(x + (perpX / len) * wave, 0.01, z + (perpZ / len) * wave));
    }

    return pts;
  }, [start, end]);

  const curve = useMemo(() => new THREE.CatmullRomCurve3(points), [points]);

  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 30, 0.015, 8, false]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Plug at start */}
      <mesh position={start} rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[0.04, 0.02, 0.06]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Socket at end */}
      <mesh position={[end[0], 0.02, end[2]]}>
        <boxGeometry args={[0.06, 0.03, 0.04]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
};

// ==========================================
// ENVIRONMENTAL STORYTELLING
// ==========================================

// Chalk body outline (safety training prop)
const ChalkOutline: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 256);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);

    // Draw simple body outline
    ctx.beginPath();
    // Head
    ctx.arc(64, 30, 20, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.moveTo(64, 50);
    ctx.lineTo(64, 140);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(64, 70);
    ctx.lineTo(20, 110);
    ctx.moveTo(64, 70);
    ctx.lineTo(108, 110);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(64, 140);
    ctx.lineTo(30, 230);
    ctx.moveTo(64, 140);
    ctx.lineTo(98, 230);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Dispose canvas texture on unmount to avoid GPU leak
  useEffect(() => () => texture?.dispose?.(), [texture]);

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.2, 2.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

// "Days since last accident" board
const AccidentBoard: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  days?: number;
}> = ({ position, rotation = [0, 0, 0], days: _days = 47 }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Board backing */}
      <mesh>
        <boxGeometry args={[1, 0.7, 0.05]} />
        <meshStandardMaterial color="#1e3a5f" roughness={0.6} />
      </mesh>

      {/* Header */}
      <mesh position={[0, 0.22, 0.03]}>
        <planeGeometry args={[0.9, 0.15]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>

      {/* Days display */}
      <mesh position={[0, -0.05, 0.03]}>
        <planeGeometry args={[0.5, 0.35]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {/* LED-style number display */}
      <mesh position={[0, -0.05, 0.04]}>
        <planeGeometry args={[0.45, 0.3]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
      </mesh>

      {/* Frame */}
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[1.02, 0.72, 0.02]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.4} />
      </mesh>

      {/* Small safety icon */}
      <mesh position={[-0.35, 0.22, 0.04]}>
        <circleGeometry args={[0.04, 16]} />
        <meshStandardMaterial color="#fbbf24" />
      </mesh>
    </group>
  );
};

// Employee of the month photo frame
const EmployeeOfMonth: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame */}
      <mesh>
        <boxGeometry args={[0.4, 0.5, 0.03]} />
        <meshStandardMaterial color="#78350f" roughness={0.6} />
      </mesh>

      {/* Photo area */}
      <mesh position={[0, 0.05, 0.02]}>
        <planeGeometry args={[0.28, 0.28]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.7} />
      </mesh>

      {/* Silhouette placeholder */}
      <mesh position={[0, 0.08, 0.025]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      <mesh position={[0, -0.02, 0.025]}>
        <planeGeometry args={[0.15, 0.1]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>

      {/* Name plate */}
      <mesh position={[0, -0.17, 0.02]}>
        <planeGeometry args={[0.3, 0.08]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.5} />
      </mesh>

      {/* Star decoration */}
      <mesh position={[0, 0.2, 0.025]}>
        <circleGeometry args={[0.02, 5]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
};

// Old radio playing static
const OldRadio: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const speakerRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Radio animation using centralized manager
  const animationId = useMemo(() => `old-radio-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (speakerRef.current) {
      // Subtle vibration from "playing"
      speakerRef.current.scale.z = 1 + Math.sin(time * 30) * 0.02;
    }
    if (lightRef.current) {
      // Flickering dial light
      lightRef.current.intensity = 0.2 + Math.random() * 0.1;
    }
  });

  return (
    <group position={position}>
      {/* Radio body */}
      <mesh castShadow>
        <boxGeometry args={[0.3, 0.2, 0.15]} />
        <meshStandardMaterial color="#78350f" roughness={0.7} />
      </mesh>

      {/* Speaker grille */}
      <mesh ref={speakerRef} position={[0.05, 0, 0.08]}>
        <circleGeometry args={[0.06, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>

      {/* Tuning dial */}
      <mesh position={[-0.08, 0.02, 0.08]}>
        <planeGeometry args={[0.08, 0.04]} />
        <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.3} />
      </mesh>

      {/* Dial light */}
      <pointLight
        ref={lightRef}
        position={[-0.08, 0.02, 0.1]}
        color="#fef3c7"
        intensity={0.2}
        distance={0.5}
      />

      {/* Knobs */}
      {[-0.1, -0.05].map((x, i) => (
        <mesh key={i} position={[x, -0.06, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.02, 12]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>
      ))}

      {/* Antenna */}
      <mesh position={[0.12, 0.2, 0]}>
        <cylinderGeometry args={[0.003, 0.002, 0.3, 6]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} />
      </mesh>

      {/* Handle */}
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.15, 0.02, 0.02]} />
        <meshStandardMaterial color="#a16207" roughness={0.6} />
      </mesh>
    </group>
  );
};

// ==========================================
// INDUSTRIAL SAFETY EQUIPMENT
// ==========================================

// Emergency shower station
const EmergencyShower: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      {/* Vertical pipe */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 12]} />
        <meshStandardMaterial color="#22c55e" roughness={0.4} />
      </mesh>

      {/* Shower head */}
      <mesh position={[0, 2.3, 0]}>
        <cylinderGeometry args={[0.15, 0.12, 0.08, 16]} />
        <meshStandardMaterial color="#22c55e" roughness={0.4} />
      </mesh>

      {/* Shower head perforations */}
      <mesh position={[0, 2.26, 0]} rotation={[Math.PI, 0, 0]}>
        <circleGeometry args={[0.12, 16]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Pull handle */}
      <group position={[0.15, 1.5, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.02, 0.02, 0.4, 8]} />
          <meshStandardMaterial color="#374151" metalness={0.6} />
        </mesh>
        {/* Triangle pull */}
        <mesh position={[0.25, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.06, 0.15, 3]} />
          <meshStandardMaterial color="#22c55e" />
        </mesh>
      </group>

      {/* Base drain */}
      <mesh
        position={[0, FLOOR_LAYERS.wornPrimary, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <ringGeometry args={[0.3, 0.5, 16]} />
        <meshStandardMaterial
          color="#fbbf24"
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Sign */}
      <mesh position={[0, 2.6, 0.05]}>
        <planeGeometry args={[0.4, 0.2]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
  );
};

// Eye wash station
const EyeWashStation: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Wall mount base */}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[0.5, 0.4, 0.08]} />
        <meshStandardMaterial color="#22c55e" roughness={0.4} />
      </mesh>

      {/* Bowl */}
      <mesh position={[0, -0.1, 0.1]}>
        <sphereGeometry args={[0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#e2e8f0"
          metalness={0.4}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Nozzles */}
      {[-0.06, 0.06].map((x, i) => (
        <group key={i} position={[x, 0.02, 0.08]}>
          <mesh>
            <cylinderGeometry args={[0.015, 0.02, 0.06, 8]} />
            <meshStandardMaterial color="#71717a" metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Push handle */}
      <mesh position={[0, 0.12, 0.15]}>
        <boxGeometry args={[0.25, 0.04, 0.04]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Dust cover (flip-up) */}
      <mesh position={[0, 0.05, 0.12]} rotation={[-0.3, 0, 0]}>
        <boxGeometry args={[0.2, 0.01, 0.1]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.8} />
      </mesh>

      {/* Sign above */}
      <mesh position={[0, 0.25, 0]}>
        <planeGeometry args={[0.35, 0.12]} />
        <meshStandardMaterial color="#22c55e" />
      </mesh>
    </group>
  );
};

// Ear plug dispenser
const EarPlugDispenser: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Dispenser body */}
      <mesh>
        <boxGeometry args={[0.15, 0.25, 0.1]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.5} />
      </mesh>

      {/* Clear front */}
      <mesh position={[0, 0, 0.051]}>
        <planeGeometry args={[0.12, 0.18]} />
        <meshStandardMaterial color="#93c5fd" transparent opacity={0.4} />
      </mesh>

      {/* Ear plugs visible inside (orange/yellow) */}
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} position={[((i % 2) - 0.5) * 0.04, (Math.floor(i / 2) - 1) * 0.05, 0.03]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#f97316' : '#eab308'} />
        </mesh>
      ))}

      {/* Dispense slot */}
      <mesh position={[0, -0.1, 0.051]}>
        <boxGeometry args={[0.08, 0.03, 0.01]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Label */}
      <mesh position={[0, 0.1, 0.052]}>
        <planeGeometry args={[0.1, 0.04]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
    </group>
  );
};

// Safety goggles rack
const SafetyGogglesRack: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Backing board */}
      <mesh>
        <boxGeometry args={[0.5, 0.3, 0.03]} />
        <meshStandardMaterial color="#374151" roughness={0.7} />
      </mesh>

      {/* Hooks */}
      {[-0.15, 0, 0.15].map((x, i) => (
        <group key={i} position={[x, -0.05, 0.03]}>
          <mesh rotation={[0.3 + Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.08, 6]} />
            <meshStandardMaterial color="#71717a" metalness={0.7} />
          </mesh>

          {/* Goggles hanging */}
          {i !== 1 && ( // Leave one hook empty
            <group position={[0, -0.06, 0.04]}>
              {/* Strap */}
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.04, 0.005, 6, 12]} />
                <meshStandardMaterial color={i === 0 ? '#1e293b' : '#3b82f6'} />
              </mesh>
              {/* Lenses */}
              <mesh position={[0, 0, 0.02]}>
                <boxGeometry args={[0.08, 0.03, 0.015]} />
                <meshStandardMaterial color="#0f172a" transparent opacity={0.8} />
              </mesh>
            </group>
          )}
        </group>
      ))}

      {/* Label */}
      <mesh position={[0, 0.1, 0.02]}>
        <planeGeometry args={[0.3, 0.06]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
    </group>
  );
};

// ==========================================
// MORE LIFE DETAILS
// ==========================================

// Flies buzzing around
const Flies: React.FC<{ position: [number, number, number]; count?: number }> = ({
  position,
  count = 5,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const fliesData = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        offset: [Math.random() * 2 - 1, Math.random() * 0.5, Math.random() * 2 - 1],
        speed: 2 + Math.random() * 3,
        radius: 0.3 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
      })),
    [count]
  );

  // Flies buzzing animation using centralized manager
  const animationId = useMemo(() => `flies-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!groupRef.current) return;

    groupRef.current.children.forEach((fly, i) => {
      const data = fliesData[i];
      fly.position.x = Math.sin(time * data.speed + data.phase) * data.radius + data.offset[0];
      fly.position.y = Math.sin(time * data.speed * 1.5 + data.phase) * 0.2 + data.offset[1] + 0.3;
      fly.position.z = Math.cos(time * data.speed + data.phase) * data.radius + data.offset[2];
    });
  });

  return (
    <group position={position} ref={groupRef}>
      {fliesData.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.008, 4, 4]} />
          <meshBasicMaterial color="#1e293b" />
        </mesh>
      ))}
    </group>
  );
};

// Spider in cobweb
const Spider: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const spiderRef = useRef<THREE.Group>(null);

  // Spider movement animation using centralized manager
  const animationId = useMemo(() => `spider-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, () => {
    if (!spiderRef.current) return;
    // Occasional tiny movements
    if (Math.random() < 0.002) {
      spiderRef.current.position.x += (Math.random() - 0.5) * 0.02;
      spiderRef.current.position.y += (Math.random() - 0.5) * 0.01;
    }
  });

  return (
    <group position={position} ref={spiderRef}>
      {/* Body */}
      <mesh>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>

      {/* Abdomen */}
      <mesh position={[-0.02, 0, 0]}>
        <sphereGeometry args={[0.02, 6, 6]} />
        <meshStandardMaterial color="#1e293b" roughness={0.8} />
      </mesh>

      {/* Legs (simplified) */}
      {[-1, 1].map((side) =>
        [0.3, 0.5, 0.7, 0.9].map((angle, i) => (
          <mesh
            key={`${side}-${i}`}
            position={[0, 0, side * 0.01]}
            rotation={[side * angle, 0, 0.8]}
          >
            <cylinderGeometry args={[0.002, 0.001, 0.04, 4]} />
            <meshBasicMaterial color="#1e293b" />
          </mesh>
        ))
      )}
    </group>
  );
};

// Dust bunny
const DustBunny: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const bunnyRef = useRef<THREE.Mesh>(null);

  // Very occasional drift using centralized manager
  const animationId = useMemo(() => `dust-bunny-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!bunnyRef.current) return;
    if (Math.random() < 0.001) {
      bunnyRef.current.position.x += (Math.random() - 0.5) * 0.01;
      bunnyRef.current.position.z += (Math.random() - 0.5) * 0.01;
    }
    bunnyRef.current.rotation.y = Math.sin(time * 0.1) * 0.1;
  });

  return (
    <mesh ref={bunnyRef} position={position}>
      <icosahedronGeometry args={[0.03 + Math.random() * 0.02, 0]} />
      <meshStandardMaterial color="#9ca3af" roughness={1} transparent opacity={0.7} />
    </mesh>
  );
};

// ==========================================
// TIME/CULTURE ELEMENTS
// ==========================================

// Vending machine
const VendingMachine: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const glowRef = useRef<THREE.Mesh>(null);

  // Vending machine glow animation using centralized manager
  const animationId = useMemo(() => `vending-machine-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (glowRef.current) {
      const mat = glowRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + Math.sin(time * 2) * 0.1;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Main body */}
      <mesh castShadow>
        <boxGeometry args={[0.8, 1.8, 0.7]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Display window */}
      <mesh ref={glowRef} position={[0, 0.3, 0.36]}>
        <planeGeometry args={[0.65, 0.9]} />
        <meshStandardMaterial color="#1e293b" emissive="#60a5fa" emissiveIntensity={0.3} />
      </mesh>

      {/* Product rows */}
      {[-0.2, 0, 0.2, 0.4].map((y, row) => (
        <group key={row} position={[0, y, 0.2]}>
          {[-0.2, 0, 0.2].map((x, col) => (
            <mesh key={col} position={[x, 0, 0]}>
              <cylinderGeometry args={[0.03, 0.03, 0.1, 8]} />
              <meshStandardMaterial color={['#ef4444', '#3b82f6', '#22c55e', '#eab308'][row]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Coin slot */}
      <mesh position={[0.25, 0, 0.36]}>
        <boxGeometry args={[0.08, 0.15, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Retrieval bin */}
      <mesh position={[0, -0.7, 0.36]}>
        <boxGeometry args={[0.4, 0.2, 0.05]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Logo area */}
      <mesh position={[0, 0.8, 0.36]}>
        <planeGeometry args={[0.5, 0.15]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
    </group>
  );
};

// Time clock punch station
const TimeClockStation: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const displayRef = useRef<THREE.Mesh>(null);

  // Time clock display animation using centralized manager
  const animationId = useMemo(() => `time-clock-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (displayRef.current) {
      const mat = displayRef.current.material as THREE.MeshStandardMaterial;
      // Blinking colon effect
      mat.emissiveIntensity = Math.floor(time * 2) % 2 === 0 ? 0.5 : 0.3;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Main unit */}
      <mesh>
        <boxGeometry args={[0.3, 0.4, 0.12]} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Digital display */}
      <mesh ref={displayRef} position={[0, 0.08, 0.061]}>
        <planeGeometry args={[0.2, 0.08]} />
        <meshStandardMaterial color="#0f172a" emissive="#22c55e" emissiveIntensity={0.5} />
      </mesh>

      {/* Card slot */}
      <mesh position={[0, -0.08, 0.061]}>
        <boxGeometry args={[0.15, 0.01, 0.02]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Keypad */}
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} position={[((i % 3) - 1) * 0.04, -0.02 - Math.floor(i / 3) * 0.035, 0.062]}>
          <boxGeometry args={[0.03, 0.025, 0.01]} />
          <meshStandardMaterial color="#52525b" roughness={0.5} />
        </mesh>
      ))}

      {/* Card rack beside */}
      <mesh position={[0.22, 0, 0]}>
        <boxGeometry args={[0.12, 0.35, 0.08]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>

      {/* Time cards in rack */}
      {[-0.1, -0.05, 0, 0.05, 0.1].map((y, i) => (
        <mesh key={i} position={[0.22, y, 0.045]} visible={Math.random() > 0.3}>
          <boxGeometry args={[0.08, 0.04, 0.002]} />
          <meshStandardMaterial color="#fef3c7" />
        </mesh>
      ))}
    </group>
  );
};

// Old calendar on wall
const WallCalendar: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const pageRef = useRef<THREE.Mesh>(null);

  // Subtle page flutter using centralized manager
  const animationId = useMemo(() => `wall-calendar-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (pageRef.current) {
      pageRef.current.rotation.x = Math.sin(time * 0.5) * 0.02;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Calendar backing */}
      <mesh>
        <boxGeometry args={[0.25, 0.35, 0.01]} />
        <meshStandardMaterial color="#78350f" roughness={0.8} />
      </mesh>

      {/* Picture area (faded) */}
      <mesh position={[0, 0.08, 0.006]}>
        <planeGeometry args={[0.22, 0.18]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.7} />
      </mesh>

      {/* Date grid */}
      <mesh ref={pageRef} position={[0, -0.1, 0.008]}>
        <planeGeometry args={[0.22, 0.12]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
      </mesh>

      {/* Month header */}
      <mesh position={[0, 0.02, 0.007]}>
        <planeGeometry args={[0.15, 0.03]} />
        <meshStandardMaterial color="#dc2626" />
      </mesh>

      {/* Hanging hole */}
      <mesh position={[0, 0.17, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.015, 8]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
    </group>
  );
};

// Forgotten birthday decorations
const BirthdayDecorations: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const balloonRef = useRef<THREE.Group>(null);
  const streamersRef = useRef<THREE.Group>(null);

  // Birthday decoration animation using centralized manager
  const animationId = useMemo(() => `birthday-decor-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (balloonRef.current) {
      balloonRef.current.rotation.z = Math.sin(time * 0.5) * 0.1;
      balloonRef.current.position.y = Math.sin(time * 0.3) * 0.02;
    }
    if (streamersRef.current) {
      streamersRef.current.children.forEach((streamer, i) => {
        streamer.rotation.z = Math.sin(time * 0.8 + i) * 0.15;
      });
    }
  });

  return (
    <group position={position}>
      {/* Deflated balloons (sad, drooping) */}
      <group ref={balloonRef}>
        {/* Balloon 1 - partially deflated */}
        <mesh position={[-0.1, 0.3, 0]}>
          <sphereGeometry args={[0.08, 12, 8]} />
          <meshStandardMaterial color="#ef4444" roughness={0.6} />
        </mesh>
        <mesh position={[-0.1, 0.2, 0]}>
          <cylinderGeometry args={[0.002, 0.002, 0.15, 4]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>

        {/* Balloon 2 - more deflated */}
        <mesh position={[0.05, 0.25, 0.05]} scale={[1, 0.7, 1]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.6} />
        </mesh>
        <mesh position={[0.05, 0.17, 0.05]}>
          <cylinderGeometry args={[0.002, 0.002, 0.12, 4]} />
          <meshStandardMaterial color="#f5f5f5" />
        </mesh>
      </group>

      {/* Drooping streamers */}
      <group ref={streamersRef}>
        {[
          { color: '#ef4444', x: -0.15 },
          { color: '#eab308', x: 0 },
          { color: '#22c55e', x: 0.15 },
        ].map((s, i) => (
          <mesh key={i} position={[s.x, 0, 0]} rotation={[0, 0, 0.2 * (i - 1)]}>
            <planeGeometry args={[0.02, 0.4]} />
            <meshStandardMaterial
              color={s.color}
              side={THREE.DoubleSide}
              transparent
              opacity={0.8}
            />
          </mesh>
        ))}
      </group>

      {/* Faded "HAPPY BIRTHDAY" banner piece */}
      <mesh position={[0, 0.5, 0]} rotation={[0, 0, 0.1]}>
        <planeGeometry args={[0.4, 0.08]} />
        <meshStandardMaterial color="#fde047" transparent opacity={0.5} />
      </mesh>
    </group>
  );
};

// ==========================================
// MORE INDUSTRIAL DETAILS
// ==========================================

// PA system speaker horn
const PASpeaker: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Mounting bracket */}
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[0.1, 0.15, 0.05]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Horn body */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.15, 0.3, 12, 1, true]} />
        <meshStandardMaterial
          color="#d4d4d8"
          metalness={0.4}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Driver housing */}
      <mesh position={[-0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} />
      </mesh>
    </group>
  );
};

// Alarm bell
const AlarmBell: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const bellRef = useRef<THREE.Mesh>(null);
  const hammerRef = useRef<THREE.Mesh>(null);

  // Occasional test ring animation using centralized manager
  const animationId = useMemo(() => `alarm-bell-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    // Ring every ~30 seconds for a brief moment
    if (Math.floor(time) % 30 === 0 && time % 1 < 0.5) {
      if (bellRef.current) {
        bellRef.current.rotation.z = Math.sin(time * 40) * 0.05;
      }
      if (hammerRef.current) {
        hammerRef.current.rotation.z = Math.sin(time * 40) * 0.3;
      }
    }
  });

  return (
    <group position={position}>
      {/* Mounting plate */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.2, 0.2, 0.02]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>

      {/* Bell dome */}
      <mesh ref={bellRef}>
        <sphereGeometry args={[0.08, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#fbbf24" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Hammer */}
      <mesh ref={hammerRef} position={[0.1, 0, 0.02]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Hammer arm */}
      <mesh position={[0.06, 0, 0]}>
        <boxGeometry args={[0.06, 0.01, 0.01]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>
    </group>
  );
};

// Pressure gauge on pipe
const PressureGauge: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const needleRef = useRef<THREE.Mesh>(null);

  // Pressure gauge needle animation using centralized manager
  const animationId = useMemo(() => `pressure-gauge-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (needleRef.current) {
      // Subtle needle wobble
      needleRef.current.rotation.z = -0.5 + Math.sin(time * 0.5) * 0.1;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Gauge body */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.04, 24]} />
        <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Gauge face */}
      <mesh position={[0, 0, 0.021]}>
        <circleGeometry args={[0.065, 24]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>

      {/* Gauge markings arc */}
      <mesh position={[0, 0.01, 0.022]}>
        <ringGeometry args={[0.04, 0.055, 24, 1, -Math.PI * 0.7, Math.PI * 1.4]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>

      {/* Red danger zone */}
      <mesh position={[0, 0.01, 0.022]}>
        <ringGeometry args={[0.04, 0.055, 12, 1, Math.PI * 0.5, Math.PI * 0.2]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>

      {/* Needle */}
      <mesh ref={needleRef} position={[0, 0, 0.025]} rotation={[0, 0, -0.5]}>
        <boxGeometry args={[0.05, 0.005, 0.002]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Center cap */}
      <mesh position={[0, 0, 0.025]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.01, 8]} />
        <meshStandardMaterial color="#1e293b" metalness={0.7} />
      </mesh>

      {/* Pipe connection */}
      <mesh position={[0, -0.06, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.6} />
      </mesh>
    </group>
  );
};

// Valve wheel
const ValveWheel: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  size?: number;
}> = ({ position, rotation = [0, 0, 0], size = 0.15 }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Wheel rim */}
      <mesh>
        <torusGeometry args={[size, size * 0.1, 8, 24]} />
        <meshStandardMaterial color="#ef4444" roughness={0.5} />
      </mesh>

      {/* Spokes */}
      {[0, Math.PI / 3, (Math.PI * 2) / 3, Math.PI, (Math.PI * 4) / 3, (Math.PI * 5) / 3].map(
        (angle, i) => (
          <mesh key={i} rotation={[0, 0, angle]}>
            <boxGeometry args={[size * 2 * 0.8, size * 0.15, size * 0.08]} />
            <meshStandardMaterial color="#ef4444" roughness={0.5} />
          </mesh>
        )
      )}

      {/* Center hub */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[size * 0.25, size * 0.25, size * 0.2, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>

      {/* Stem */}
      <mesh position={[0, 0, -size * 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[size * 0.1, size * 0.1, size * 0.4, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.6} />
      </mesh>
    </group>
  );
};

// Pulsing indicator light synced to audio
export const PulsingIndicator: React.FC<{
  position: [number, number, number];
  baseColor?: string;
  size?: number;
}> = ({ position, baseColor = '#22c55e', size = 0.1 }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  // Pulsing animation using centralized manager
  const animationId = useMemo(() => `pulsing-indicator-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!meshRef.current || !lightRef.current) return;

    // Pulse based on simulated audio level
    const audioLevel = 0.5 + Math.sin(time * 3) * 0.3 + Math.sin(time * 7) * 0.2;

    const mat = meshRef.current.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = audioLevel;

    lightRef.current.intensity = audioLevel * 0.5;
    meshRef.current.scale.setScalar(1 + audioLevel * 0.1);
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={0.5}
          transparent
          opacity={0.9}
        />
      </mesh>
      <pointLight ref={lightRef} color={baseColor} intensity={0.5} distance={3} />
    </group>
  );
};

// ==========================================
// MICRO-DETAILS - OBSESSIVE PERFECTION
// ==========================================

// Cigarette butts near back door
const CigaretteButts: React.FC<{ position: [number, number, number]; count?: number }> = ({
  position,
  count = 5,
}) => {
  const butts = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        offset: [(Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4],
        rotation: Math.random() * Math.PI * 2,
        isLit: Math.random() < 0.1, // 10% chance of recently discarded
      })),
    [count]
  );

  return (
    <group position={position}>
      {butts.map((butt, i) => (
        <group
          key={i}
          position={butt.offset as [number, number, number]}
          rotation={[Math.PI / 2, butt.rotation, Math.random() * 0.3]}
        >
          {/* Filter */}
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.004, 0.004, 0.012, 6]} />
            <meshStandardMaterial color="#f5d0a9" roughness={0.9} />
          </mesh>
          {/* Paper/tobacco */}
          <mesh position={[0, 0.012, 0]}>
            <cylinderGeometry args={[0.003, 0.004, 0.015, 6]} />
            <meshStandardMaterial color={butt.isLit ? '#4a4a4a' : '#e8e0d5'} roughness={0.95} />
          </mesh>
          {/* Ash tip */}
          <mesh position={[0, 0.022, 0]}>
            <cylinderGeometry args={[0.002, 0.003, 0.005, 6]} />
            <meshStandardMaterial color="#2d2d2d" roughness={1} />
          </mesh>
          {/* Ember glow for recently discarded */}
          {butt.isLit && (
            <pointLight position={[0, 0.022, 0]} color="#ff4500" intensity={0.1} distance={0.2} />
          )}
        </group>
      ))}
      {/* Ash scatter around */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh
          key={`ash-${i}`}
          position={[(Math.random() - 0.5) * 0.5, 0.001, (Math.random() - 0.5) * 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.01 + Math.random() * 0.015, 6]} />
          <meshBasicMaterial color="#4a4a4a" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
};

// Gum stuck under surfaces
const StuckGum: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#f472b6',
}) => {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.015 + Math.random() * 0.01, 8, 6]} scale={[1, 0.4, 1]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.1} />
    </mesh>
  );
};

// Sticky notes on equipment
const StickyNote: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  curled?: boolean;
}> = ({ position, rotation = [0, 0, 0], color = '#fef08a', curled = false }) => {
  const noteRef = useRef<THREE.Mesh>(null);

  // Subtle flutter using centralized manager
  const animationId = useMemo(() => `sticky-note-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (noteRef.current && curled) {
      noteRef.current.rotation.x = rotation[0] + Math.sin(time * 2) * 0.02;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      <mesh ref={noteRef}>
        <planeGeometry args={[0.07, 0.07]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
      {/* Curled corner */}
      {curled && (
        <mesh position={[0.03, 0.03, 0.003]} rotation={[0.3, 0, 0.3]}>
          <planeGeometry args={[0.02, 0.02]} />
          <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} />
        </mesh>
      )}
    </group>
  );
};

// Scattered pens and pencils
const ScatteredPens: React.FC<{ position: [number, number, number]; count?: number }> = ({
  position,
  count = 3,
}) => {
  const items = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        offset: [(Math.random() - 0.5) * 0.3, 0.008, (Math.random() - 0.5) * 0.3],
        rotation: Math.random() * Math.PI,
        isPen: Math.random() > 0.4,
        color: ['#1e3a8a', '#dc2626', '#000000', '#16a34a'][Math.floor(Math.random() * 4)],
      })),
    [count]
  );

  return (
    <group position={position}>
      {items.map((item, i) => (
        <group
          key={i}
          position={item.offset as [number, number, number]}
          rotation={[Math.PI / 2, 0, item.rotation]}
        >
          {item.isPen ? (
            // Pen
            <>
              <mesh>
                <cylinderGeometry args={[0.004, 0.004, 0.12, 8]} />
                <meshStandardMaterial color={item.color} roughness={0.3} />
              </mesh>
              <mesh position={[0, 0.065, 0]}>
                <coneGeometry args={[0.004, 0.015, 8]} />
                <meshStandardMaterial color="#1e293b" metalness={0.6} />
              </mesh>
              <mesh position={[0, -0.055, 0]}>
                <cylinderGeometry args={[0.005, 0.004, 0.02, 8]} />
                <meshStandardMaterial color={item.color} roughness={0.3} />
              </mesh>
            </>
          ) : (
            // Pencil
            <>
              <mesh>
                <cylinderGeometry args={[0.003, 0.003, 0.15, 6]} />
                <meshStandardMaterial color="#eab308" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.08, 0]}>
                <coneGeometry args={[0.003, 0.02, 6]} />
                <meshStandardMaterial color="#f5deb3" roughness={0.8} />
              </mesh>
              <mesh position={[0, 0.088, 0]}>
                <coneGeometry args={[0.001, 0.008, 6]} />
                <meshStandardMaterial color="#1e293b" roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.07, 0]}>
                <cylinderGeometry args={[0.004, 0.003, 0.015, 6]} />
                <meshStandardMaterial color="#fca5a5" roughness={0.5} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
};

// ==========================================
// PERSONAL ITEMS
// ==========================================

// Jacket on hook
const JacketOnHook: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#1e3a8a',
}) => {
  const jacketRef = useRef<THREE.Group>(null);

  // Gentle sway using centralized manager
  const animationId = useMemo(() => `jacket-hook-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (jacketRef.current) {
      jacketRef.current.rotation.z = Math.sin(time * 0.5) * 0.02;
    }
  });

  return (
    <group position={position}>
      {/* Hook */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[0.04, 0.04, 0.03]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.03, 0.02]} rotation={[0.5, 0, 0]}>
        <torusGeometry args={[0.025, 0.006, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#52525b" metalness={0.7} />
      </mesh>

      {/* Jacket */}
      <group ref={jacketRef} position={[0, -0.15, 0.02]}>
        {/* Body */}
        <mesh>
          <boxGeometry args={[0.25, 0.35, 0.08]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Collar */}
        <mesh position={[0, 0.18, 0.02]}>
          <boxGeometry args={[0.15, 0.05, 0.04]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Sleeves drooping */}
        <mesh position={[-0.15, 0.05, 0]} rotation={[0, 0, 0.3]}>
          <cylinderGeometry args={[0.04, 0.035, 0.25, 8]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        <mesh position={[0.15, 0.05, 0]} rotation={[0, 0, -0.3]}>
          <cylinderGeometry args={[0.04, 0.035, 0.25, 8]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
};

// Umbrella in corner
const UmbrellaCorner: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#1e293b',
}) => {
  return (
    <group position={position} rotation={[0.15, 0, 0.1]}>
      {/* Shaft */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.8, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.6} />
      </mesh>
      {/* Handle (J-shaped) */}
      <mesh position={[0.03, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.04, 0.012, 8, 12, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Ferrule (tip) */}
      <mesh position={[0, 0.82, 0]}>
        <coneGeometry args={[0.008, 0.03, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.7} />
      </mesh>
      {/* Canopy (collapsed) */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.025, 0.015, 0.35, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Velcro strap */}
      <mesh position={[0, 0.55, 0.02]}>
        <boxGeometry args={[0.015, 0.03, 0.005]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
    </group>
  );
};

// Lunch bag
const LunchBag: React.FC<{
  position: [number, number, number];
  type?: 'paper' | 'cooler' | 'box';
}> = ({ position, type = 'paper' }) => {
  return (
    <group position={position}>
      {type === 'paper' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.12, 0.2, 0.08]} />
            <meshStandardMaterial color="#d4a574" roughness={0.95} />
          </mesh>
          {/* Folded top */}
          <mesh position={[0, 0.18, 0]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.12, 0.04, 0.02]} />
            <meshStandardMaterial color="#c49a6c" roughness={0.95} />
          </mesh>
        </>
      )}
      {type === 'cooler' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.18, 0.15, 0.12]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.6} />
          </mesh>
          {/* Lid */}
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.19, 0.02, 0.13]} />
            <meshStandardMaterial color="#3b82f6" roughness={0.5} />
          </mesh>
          {/* Handle */}
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.08, 0.015, 0.02]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </>
      )}
      {type === 'box' && (
        <>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.15, 0.1, 0.1]} />
            <meshStandardMaterial color="#ef4444" roughness={0.5} />
          </mesh>
          {/* Lid clip */}
          <mesh position={[0, 0.11, 0.05]}>
            <boxGeometry args={[0.04, 0.02, 0.01]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </>
      )}
    </group>
  );
};

// Water bottle
const WaterBottle: React.FC<{
  position: [number, number, number];
  type?: 'plastic' | 'metal' | 'sports';
}> = ({ position, type = 'plastic' }) => {
  return (
    <group position={position}>
      {type === 'plastic' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.2, 12]} />
            <meshStandardMaterial color="#93c5fd" transparent opacity={0.7} roughness={0.2} />
          </mesh>
          {/* Water inside */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.028, 0.033, 0.12, 12]} />
            <meshStandardMaterial color="#60a5fa" transparent opacity={0.5} />
          </mesh>
          {/* Cap */}
          <mesh position={[0, 0.21, 0]}>
            <cylinderGeometry args={[0.02, 0.025, 0.025, 12]} />
            <meshStandardMaterial color="#3b82f6" roughness={0.4} />
          </mesh>
        </>
      )}
      {type === 'metal' && (
        <>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.24, 16]} />
            <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 0.03, 16]} />
            <meshStandardMaterial color="#52525b" metalness={0.7} />
          </mesh>
        </>
      )}
      {type === 'sports' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.04, 0.035, 0.2, 12]} />
            <meshStandardMaterial color="#22c55e" roughness={0.5} />
          </mesh>
          {/* Squeeze top */}
          <mesh position={[0, 0.21, 0]}>
            <cylinderGeometry args={[0.015, 0.025, 0.03, 12]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          {/* Pull spout */}
          <mesh position={[0, 0.24, 0.01]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.02, 8]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
        </>
      )}
    </group>
  );
};

// Folded newspaper
const FoldedNewspaper: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Folded newspaper stack */}
      <mesh>
        <boxGeometry args={[0.25, 0.02, 0.18]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.9} />
      </mesh>
      {/* Fold crease shadow */}
      <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.25, 0.005]} />
        <meshBasicMaterial
          color="#d4d4d4"
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.subtle.factor}
          polygonOffsetUnits={POLYGON_OFFSET.subtle.units}
        />
      </mesh>
      {/* Text impression lines */}
      {[-0.06, -0.02, 0.02, 0.06].map((z, i) => (
        <mesh key={i} position={[-0.05, 0.011, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 0.008]} />
          <meshBasicMaterial
            color="#a3a3a3"
            transparent
            opacity={0.4}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.subtle.factor}
            polygonOffsetUnits={POLYGON_OFFSET.subtle.units}
          />
        </mesh>
      ))}
    </group>
  );
};

// ==========================================
// WORK IN PROGRESS
// ==========================================

// Sawhorse with caution tape
const Sawhorse: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  hasTape?: boolean;
}> = ({ position, rotation = [0, 0, 0], hasTape = true }) => {
  const tapeRef = useRef<THREE.Mesh>(null);

  // Tape flutter using centralized manager
  const animationId = useMemo(() => `sawhorse-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (tapeRef.current) {
      tapeRef.current.rotation.z = Math.sin(time * 3) * 0.05;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Top bar */}
      <mesh position={[0, 0.7, 0]}>
        <boxGeometry args={[0.9, 0.06, 0.06]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} />
      </mesh>
      {/* Warning stripes on top */}
      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 0.7, 0.031]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[0.08, 0.06]} />
          <meshStandardMaterial color="#1e293b" />
        </mesh>
      ))}
      {/* Legs */}
      {[
        [-0.35, 0.35, -0.25],
        [-0.35, 0.35, 0.25],
        [0.35, 0.35, -0.25],
        [0.35, 0.35, 0.25],
      ].map((pos, i) => (
        <mesh
          key={i}
          position={pos as [number, number, number]}
          rotation={[i < 2 ? 0.2 : -0.2, 0, i % 2 === 0 ? 0.15 : -0.15]}
        >
          <boxGeometry args={[0.04, 0.75, 0.04]} />
          <meshStandardMaterial color="#a16207" roughness={0.8} />
        </mesh>
      ))}
      {/* Cross brace */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.6, 0.04, 0.04]} />
        <meshStandardMaterial color="#a16207" roughness={0.8} />
      </mesh>

      {/* Caution tape draped */}
      {hasTape && (
        <mesh ref={tapeRef} position={[0, 0.75, 0.1]} rotation={[0.1, 0, 0]}>
          <planeGeometry args={[0.8, 0.05]} />
          <meshStandardMaterial color="#eab308" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};

// Maintenance cart with parts
const MaintenanceCart: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Cart base */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.6, 0.03, 0.4]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>
      {/* Lower shelf */}
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.55, 0.02, 0.35]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>
      {/* Handle */}
      <mesh position={[0, 0.55, 0.18]}>
        <boxGeometry args={[0.5, 0.02, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>
      <mesh position={[-0.25, 0.45, 0.18]}>
        <boxGeometry args={[0.02, 0.2, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>
      <mesh position={[0.25, 0.45, 0.18]}>
        <boxGeometry args={[0.02, 0.2, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} />
      </mesh>
      {/* Wheels */}
      {[
        [-0.22, 0.05, 0.12],
        [0.22, 0.05, 0.12],
        [-0.22, 0.05, -0.12],
        [0.22, 0.05, -0.12],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.03, 12]} />
          <meshStandardMaterial color="#1e293b" roughness={0.8} />
        </mesh>
      ))}
      {/* Parts on cart - scattered tools and components */}
      <mesh position={[-0.15, 0.4, 0.05]} rotation={[Math.PI / 2, 0, 0.3]}>
        <cylinderGeometry args={[0.015, 0.015, 0.12, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.8} />
      </mesh>
      <mesh position={[0.1, 0.38, -0.08]}>
        <boxGeometry args={[0.08, 0.04, 0.06]} />
        <meshStandardMaterial color="#3b82f6" />
      </mesh>
      <mesh position={[0.18, 0.4, 0.08]}>
        <boxGeometry args={[0.06, 0.06, 0.04]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* Oily rag */}
      <mesh position={[-0.05, 0.37, 0.1]}>
        <boxGeometry args={[0.1, 0.01, 0.08]} />
        <meshStandardMaterial color="#78716c" roughness={0.95} />
      </mesh>
    </group>
  );
};

// Out of Order sign
const OutOfOrderSign: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const signRef = useRef<THREE.Group>(null);

  // Slight swing using centralized manager
  const animationId = useMemo(() => `out-of-order-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (signRef.current) {
      signRef.current.rotation.z = Math.sin(time * 0.8) * 0.03;
    }
  });

  return (
    <group position={position} rotation={rotation}>
      <group ref={signRef}>
        {/* Sign board */}
        <mesh>
          <boxGeometry args={[0.25, 0.18, 0.01]} />
          <meshStandardMaterial color="#ef4444" roughness={0.6} />
        </mesh>
        {/* White text area */}
        <mesh position={[0, 0, 0.006]}>
          <planeGeometry args={[0.22, 0.1]} />
          <meshStandardMaterial color="#fef2f2" />
        </mesh>
        {/* Hanging string */}
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.003, 0.003, 0.15, 6]} />
          <meshStandardMaterial color="#a3a3a3" />
        </mesh>
      </group>
    </group>
  );
};

// Partially opened machine panel
const OpenedPanel: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Panel frame */}
      <mesh>
        <boxGeometry args={[0.5, 0.7, 0.02]} />
        <meshStandardMaterial color="#374151" metalness={0.4} />
      </mesh>
      {/* Open door (hinged) */}
      <group position={[-0.25, 0, 0.01]} rotation={[0, -1.2, 0]}>
        <mesh position={[0.2, 0, 0]}>
          <boxGeometry args={[0.4, 0.6, 0.015]} />
          <meshStandardMaterial color="#52525b" metalness={0.5} roughness={0.4} />
        </mesh>
        {/* Handle */}
        <mesh position={[0.35, 0, 0.02]}>
          <boxGeometry args={[0.03, 0.08, 0.015]} />
          <meshStandardMaterial color="#1e293b" metalness={0.6} />
        </mesh>
      </group>
      {/* Interior components visible */}
      <mesh position={[0.05, 0.15, 0.03]}>
        <boxGeometry args={[0.3, 0.15, 0.04]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.2} />
      </mesh>
      <mesh position={[-0.1, -0.1, 0.03]}>
        <boxGeometry args={[0.15, 0.2, 0.03]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Wires */}
      {[
        ['#ef4444', -0.05],
        ['#3b82f6', 0.05],
        ['#eab308', 0.15],
      ].map(([color, y], i) => (
        <mesh key={i} position={[0.1, y as number, 0.05]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.004, 0.004, 0.2, 6]} />
          <meshStandardMaterial color={color as string} />
        </mesh>
      ))}
    </group>
  );
};

// ==========================================
// WEATHER EFFECTS
// ==========================================

// Puddle from roof leak
const RoofLeakPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 0.8,
}) => {
  const dropRef = useRef<THREE.Mesh>(null);
  const rippleRef = useRef<THREE.Mesh>(null);
  const [dropY, setDropY] = useState(3);

  // Roof leak drip animation using centralized manager
  const animationId = useMemo(() => `roof-leak-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (_time, delta) => {
    // Falling drop
    setDropY((prev) => {
      const newY = prev - delta * 4;
      if (newY < 0) {
        return 3 + Math.random() * 2; // Reset with variation
      }
      return newY;
    });

    if (dropRef.current) {
      dropRef.current.position.y = dropY;
      dropRef.current.visible = dropY > 0.1;
    }

    // Ripple animation
    if (rippleRef.current && dropY < 0.5 && dropY > 0.1) {
      const scale = 1 + (0.5 - dropY) * 3;
      rippleRef.current.scale.set(scale, scale, 1);
      const mat = rippleRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 * (dropY / 0.5);
    }
  });

  return (
    <group position={position}>
      {/* Puddle on floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_LAYERS.puddle, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <circleGeometry args={[size * 0.5, 24]} />
        <meshStandardMaterial
          color="#60a5fa"
          transparent
          opacity={0.4}
          metalness={0.9}
          roughness={0.1}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.subtle.factor}
          polygonOffsetUnits={POLYGON_OFFSET.subtle.units}
        />
      </mesh>
      {/* Ripple effect */}
      <mesh
        ref={rippleRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_LAYERS.puddle, 0]}
        renderOrder={RENDER_ORDER.floorEffects + 1}
      >
        <ringGeometry args={[0.02, 0.05, 16]} />
        <meshBasicMaterial
          color="#93c5fd"
          transparent
          opacity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>
      {/* Falling drop */}
      <mesh ref={dropRef} position={[0, 3, 0]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#60a5fa" transparent opacity={0.7} />
      </mesh>
    </group>
  );
};

// Condensation on windows
const WindowCondensation: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Fog/condensation effect
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(200, 220, 240, 0.4)');
    gradient.addColorStop(0.5, 'rgba(200, 220, 240, 0.2)');
    gradient.addColorStop(1, 'rgba(200, 220, 240, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    // Water droplets
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 1 + Math.random() * 3;
      ctx.fillStyle = `rgba(150, 200, 255, ${0.3 + Math.random() * 0.3})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drip streaks
    for (let i = 0; i < 5; i++) {
      const x = 20 + Math.random() * 88;
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.3)';
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, 30 + Math.random() * 30);
      ctx.lineTo(x + (Math.random() - 0.5) * 10, 90 + Math.random() * 30);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Dispose canvas texture on unmount to avoid GPU leak
  useEffect(() => () => texture?.dispose?.(), [texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[2, 1.5]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

// Water stain on ceiling
const CeilingWaterStain: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1.5,
}) => {
  // Guard against NaN/invalid size
  const safeSize = Number.isFinite(size) && size > 0 ? size : 1.5;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);

    // Main stain
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 55);
    gradient.addColorStop(0, 'rgba(139, 119, 101, 0.5)');
    gradient.addColorStop(0.4, 'rgba(139, 119, 101, 0.3)');
    gradient.addColorStop(0.7, 'rgba(180, 160, 140, 0.2)');
    gradient.addColorStop(1, 'rgba(180, 160, 140, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Irregular shape
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const r = 40 + Math.random() * 20;
      const x = 64 + Math.cos(angle) * r;
      const y = 64 + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    // Ring marks from repeated wetting
    for (let ring = 0; ring < 3; ring++) {
      ctx.strokeStyle = `rgba(100, 80, 60, ${0.1 + ring * 0.05})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(64, 64, 25 + ring * 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Dispose canvas texture on unmount to avoid GPU leak
  useEffect(() => () => texture?.dispose?.(), [texture]);

  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[safeSize, safeSize]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
};

// ==========================================
// MORE WILDLIFE
// ==========================================

// Moths circling lights
const MothSwarm: React.FC<{ position: [number, number, number]; count?: number }> = ({
  position,
  count = 6,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const mothData = useMemo(
    () =>
      Array.from({ length: count }).map(() => ({
        radius: 0.3 + Math.random() * 0.5,
        speed: 2 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        yOffset: (Math.random() - 0.5) * 0.4,
        erratic: Math.random() * 0.5,
      })),
    [count]
  );

  // Moth swarm animation using centralized manager
  const animationId = useMemo(() => `moth-swarm-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!groupRef.current) return;

    groupRef.current.children.forEach((moth, i) => {
      const data = mothData[i];
      // Spiral pattern with erratic movement
      const angle = time * data.speed + data.phase;
      moth.position.x = Math.cos(angle) * data.radius + Math.sin(time * 7 + i) * data.erratic;
      moth.position.y = data.yOffset + Math.sin(time * 3 + i) * 0.1;
      moth.position.z = Math.sin(angle) * data.radius + Math.cos(time * 5 + i) * data.erratic;
      // Face direction of travel
      moth.rotation.y = -angle + Math.PI / 2;
      // Wing flap
      const wingAngle = Math.sin(time * 30 + i * 5) * 0.8;
      (moth.children[0] as THREE.Mesh).rotation.z = wingAngle;
      (moth.children[1] as THREE.Mesh).rotation.z = -wingAngle;
    });
  });

  return (
    <group position={position} ref={groupRef}>
      {mothData.map((_, i) => (
        <group key={i}>
          {/* Body */}
          <mesh scale={[0.008, 0.015, 0.008]}>
            <sphereGeometry args={[1, 6, 4]} />
            <meshStandardMaterial color="#a3a3a3" roughness={0.9} />
          </mesh>
          {/* Left wing */}
          <mesh position={[-0.01, 0, 0]} rotation={[0, 0, 0.3]}>
            <planeGeometry args={[0.02, 0.015]} />
            <meshStandardMaterial
              color="#d4d4d4"
              side={THREE.DoubleSide}
              transparent
              opacity={0.8}
            />
          </mesh>
          {/* Right wing */}
          <mesh position={[0.01, 0, 0]} rotation={[0, 0, -0.3]}>
            <planeGeometry args={[0.02, 0.015]} />
            <meshStandardMaterial
              color="#d4d4d4"
              side={THREE.DoubleSide}
              transparent
              opacity={0.8}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// Cockroach (for the daring)
const Cockroach: React.FC<{ position: [number, number, number]; pathLength?: number }> = ({
  position,
  pathLength = 2,
}) => {
  const roachRef = useRef<THREE.Group>(null);
  const state = useRef({
    isMoving: false,
    nextMove: 10 + Math.random() * 30,
    moveEnd: 0,
    direction: 1,
    currentX: 0,
    rotation: 0,
  });

  // Cockroach scurrying animation using centralized manager
  const animationId = useMemo(() => `cockroach-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time, delta) => {
    if (!roachRef.current) return;

    // Start moving when "disturbed"
    if (time > state.current.nextMove && !state.current.isMoving) {
      state.current.isMoving = true;
      state.current.moveEnd = time + 0.3 + Math.random() * 0.5; // Quick burst
      state.current.direction = Math.random() > 0.5 ? 1 : -1;
      state.current.rotation = (Math.random() - 0.5) * Math.PI;
      state.current.nextMove = time + 15 + Math.random() * 45; // Very rare
    }

    if (state.current.isMoving) {
      if (time < state.current.moveEnd) {
        // Very fast scurrying
        state.current.currentX += state.current.direction * delta * 5;
        state.current.currentX = Math.max(
          -pathLength / 2,
          Math.min(pathLength / 2, state.current.currentX)
        );
        roachRef.current.position.x = state.current.currentX;
        roachRef.current.rotation.y = state.current.rotation;
        // Leg animation through body wobble
        roachRef.current.position.y = Math.abs(Math.sin(time * 60)) * 0.003;
      } else {
        state.current.isMoving = false;
      }
    }
  });

  return (
    <group position={position}>
      <group ref={roachRef} scale={0.4}>
        {/* Body */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.02, 0.04, 4, 8]} />
          <meshStandardMaterial color="#3d2817" roughness={0.7} />
        </mesh>
        {/* Head */}
        <mesh position={[0.035, 0.005, 0]}>
          <sphereGeometry args={[0.012, 6, 4]} />
          <meshStandardMaterial color="#2d1f12" roughness={0.7} />
        </mesh>
        {/* Antennae */}
        {[-0.008, 0.008].map((z, i) => (
          <mesh key={i} position={[0.04, 0.01, z]} rotation={[0, 0, -0.5 + i * 0.3 + Math.PI / 2]}>
            <cylinderGeometry args={[0.001, 0.0005, 0.03, 4]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
        {/* Legs (simplified) */}
        {[-1, 1].map((side) =>
          [-0.015, 0, 0.015].map((x, i) => (
            <mesh
              key={`${side}-${i}`}
              position={[x, -0.01, side * 0.015]}
              rotation={[side * 0.5, 0, 0]}
            >
              <cylinderGeometry args={[0.002, 0.001, 0.02, 4]} />
              <meshStandardMaterial color="#2d1f12" />
            </mesh>
          ))
        )}
      </group>
    </group>
  );
};

// Main ambient details group component
export const AmbientDetailsGroup: React.FC = () => {
  const [doorStates, setDoorStates] = useState<Record<string, boolean>>({
    'door-1': false,
    'door-2': false,
    'door-3': false,
  });

  // Toggle door states periodically
  useEffect(() => {
    const interval = setInterval(
      () => {
        const doorId = `door-${Math.floor(Math.random() * 3) + 1}`;
        setDoorStates((prev) => ({
          ...prev,
          [doorId]: !prev[doorId],
        }));

        // Play door sound
        if (audioManager.initialized) {
          if (doorStates[doorId]) {
            audioManager.playDoorClose();
          } else {
            audioManager.playDoorOpen();
          }
        }
      },
      15000 + Math.random() * 30000
    );

    return () => clearInterval(interval);
  }, [doorStates]);

  return (
    <group>
      {/* Centralized animation manager for all ambient details */}
      <AmbientAnimationManager />

      {/* Cobwebs in corners and rafters (updated for 120x160 floor) */}
      <Cobweb position={[-55, 28, -40]} rotation={[0.2, 0.5, 0]} scale={1.2} />
      <Cobweb position={[55, 28, -40]} rotation={[0.2, -0.5, 0]} scale={1} />
      <Cobweb position={[-55, 28, 40]} rotation={[0.2, -0.3, 0]} scale={0.8} />
      <Cobweb position={[55, 28, 40]} rotation={[0.2, 0.3, 0]} scale={1.1} />
      <Cobweb position={[-35, 26, -42]} rotation={[0.1, 0.2, 0.1]} scale={0.7} />
      <Cobweb position={[25, 27, -42]} rotation={[0.15, -0.1, 0]} scale={0.9} />

      {/* Rust stains on walls and equipment */}
      <RustStain position={[-58, 8, -25]} rotation={[0, Math.PI / 2, 0]} size={1.5} />
      <RustStain position={[58, 6, 15]} rotation={[0, -Math.PI / 2, 0]} size={1.2} />
      <RustStain position={[-45, 4, -42]} rotation={[0, 0, 0]} size={0.8} />
      <RustStain position={[35, 5, -42]} rotation={[0, 0, 0]} size={1} />
      <RustStain position={[-25, 3, 42]} rotation={[0, Math.PI, 0]} size={0.7} />

      {/* Oil puddles on floor - spread across larger area */}
      <OilPuddle position={[-20, FLOOR_LAYERS.puddle, -8]} size={1.2} />
      <OilPuddle position={[12, FLOOR_LAYERS.puddle, 18]} size={0.8} />
      <OilPuddle position={[-35, FLOOR_LAYERS.puddle, 12]} size={1} />
      <OilPuddle position={[30, FLOOR_LAYERS.puddle, -18]} size={0.6} />
      <OilPuddle position={[0, FLOOR_LAYERS.puddle, 28]} size={1.1} />
      <OilPuddle position={[-40, FLOOR_LAYERS.puddle, -20]} size={0.7} />
      <OilPuddle position={[40, FLOOR_LAYERS.puddle, 25]} size={0.9} />

      {/* Oil stains in truck yard areas - near where trucks park */}
      <OilPuddle position={[5, FLOOR_LAYERS.puddle, 45]} size={1.5} />
      <OilPuddle position={[-10, FLOOR_LAYERS.puddle, 40]} size={1.0} />
      <OilPuddle position={[15, FLOOR_LAYERS.puddle, 50]} size={0.8} />
      <OilPuddle position={[-5, FLOOR_LAYERS.puddle, 55]} size={1.2} />
      {/* Back yard oil stains */}
      <OilPuddle position={[8, FLOOR_LAYERS.puddle, -65]} size={1.3} />
      <OilPuddle position={[-12, FLOOR_LAYERS.puddle, -70]} size={0.9} />
      <OilPuddle position={[0, FLOOR_LAYERS.puddle, -60]} size={1.1} />

      {/* Rain puddles in outdoor yard areas (water pooling on pavement) */}
      <RainPuddle position={[-15, FLOOR_LAYERS.puddle, 48]} size={2.5} />
      <RainPuddle position={[20, FLOOR_LAYERS.puddle, 52]} size={2.0} />
      <RainPuddle position={[-8, FLOOR_LAYERS.puddle, 60]} size={1.8} />
      <RainPuddle position={[10, FLOOR_LAYERS.puddle, 65]} size={2.2} />
      {/* Back yard rain puddles */}
      <RainPuddle position={[-18, FLOOR_LAYERS.puddle, -68]} size={2.3} />
      <RainPuddle position={[15, FLOOR_LAYERS.puddle, -72]} size={1.9} />
      <RainPuddle position={[5, FLOOR_LAYERS.puddle, -80]} size={2.6} />

      {/* Safety signage - walls at x=±60 */}
      <SafetySign position={[-58, 8, 0]} rotation={[0, Math.PI / 2, 0]} type="exit" />
      <SafetySign position={[58, 8, 0]} rotation={[0, -Math.PI / 2, 0]} type="exit" />
      <SafetySign position={[0, 10, -42]} rotation={[0, 0, 0]} type="caution" />
      <SafetySign position={[-25, 8, -42]} rotation={[0, 0, 0]} type="danger" />
      <SafetySign position={[25, 8, -42]} rotation={[0, 0, 0]} type="ppe" />
      <SafetySign position={[0, 8, 42]} rotation={[0, Math.PI, 0]} type="exit" />

      {/* Wall clocks */}
      <FactoryWallClock position={[-58, 12, 0]} rotation={[0, Math.PI / 2, 0]} />
      <FactoryWallClock position={[58, 12, 0]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Fire extinguisher stations - expanded coverage */}
      <FireExtinguisherStation position={[-50, 0, -40]} />
      <FireExtinguisherStation position={[50, 0, -40]} />
      <FireExtinguisherStation position={[-50, 0, 40]} />
      <FireExtinguisherStation position={[50, 0, 40]} />
      <FireExtinguisherStation position={[0, 0, -35]} />
      <FireExtinguisherStation position={[0, 0, 35]} />

      {/* Loading dock doors - at z=48 (shipping dock) */}
      <LoadingDockDoor position={[-15, 0, 48]} isOpen={doorStates['door-1']} />
      <LoadingDockDoor position={[0, 0, 48]} isOpen={doorStates['door-2']} />
      <LoadingDockDoor position={[15, 0, 48]} isOpen={doorStates['door-3']} />

      {/* Control panels - walls at x=±60 */}
      <ControlPanel position={[-40, 5, -42]} rotation={[0, 0, 0]} />
      <ControlPanel position={[40, 5, -42]} rotation={[0, 0, 0]} />
      <ControlPanel position={[-58, 5, 20]} rotation={[0, Math.PI / 2, 0]} />
      <ControlPanel position={[58, 5, -20]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Condensation drips on pipes */}
      <CondensationDrip position={[-20, 18, -12]} />
      <CondensationDrip position={[15, 16, 8]} />
      <CondensationDrip position={[-8, 17, 18]} />
      <CondensationDrip position={[25, 15, -8]} />

      {/* Pulsing indicators on key machinery */}
      <PulsingIndicator position={[-25, 4, -22]} baseColor="#22c55e" />
      <PulsingIndicator position={[0, 4, -22]} baseColor="#3b82f6" />
      <PulsingIndicator position={[25, 4, -22]} baseColor="#22c55e" />
      <PulsingIndicator position={[-18, 12, 6]} baseColor="#eab308" size={0.08} />
      <PulsingIndicator position={[18, 12, 6]} baseColor="#eab308" size={0.08} />

      {/* ==========================================
          ENVIRONMENTAL PROPS (updated for 120x160 floor)
          ========================================== */}

      {/* Stacked pallets in corners and along walls */}
      <StackedPallets position={[-52, 0, -35]} count={4} />
      <StackedPallets position={[52, 0, -35]} count={3} />
      <StackedPallets position={[-52, 0, 35]} count={5} />
      <StackedPallets position={[52, 0, 35]} count={2} />
      <StackedPallets position={[-40, 0, 30]} count={3} />
      <StackedPallets position={[40, 0, -30]} count={4} />
      <StackedPallets position={[-52, 0, 0]} count={2} />
      <StackedPallets position={[52, 0, 0]} count={3} />

      {/* Tool racks on walls - x=±60 */}
      <ToolRack position={[-58, 4, -30]} rotation={[0, Math.PI / 2, 0]} />
      <ToolRack position={[58, 4, 30]} rotation={[0, -Math.PI / 2, 0]} />
      <ToolRack position={[20, 4, -42]} rotation={[0, 0, 0]} />

      {/* Hard hats on hooks - x=±60 */}
      <HardHatHook position={[-58, 5, 25]} color="#eab308" />
      <HardHatHook position={[-58, 5, 27]} color="#f97316" />
      <HardHatHook position={[-58, 5, 29]} color="#22c55e" />
      <HardHatHook position={[58, 5, -25]} color="#eab308" />
      <HardHatHook position={[58, 5, -27]} color="#3b82f6" />

      {/* Cleaning equipment - spread out */}
      <CleaningEquipment position={[-45, 0, 5]} />
      <CleaningEquipment position={[45, 0, 20]} />

      {/* Cable trays overhead - extended for larger ceiling */}
      <CableTray position={[-35, 22, 0]} length={25} />
      <CableTray position={[35, 22, 0]} length={25} />
      <CableTray position={[0, 20, -20]} length={40} rotation={[0, Math.PI / 2, 0]} />
      <CableTray position={[0, 20, 20]} length={40} rotation={[0, Math.PI / 2, 0]} />

      {/* Steam vents */}
      <SteamVent position={[-30, 15, -18]} />
      <SteamVent position={[30, 15, -18]} />
      <SteamVent position={[0, 18, 12]} />

      {/* Drainage grates in floor - expanded coverage */}
      <DrainageGrate position={[-25, 0, 0]} size={0.8} />
      <DrainageGrate position={[25, 0, 0]} size={0.8} />
      <DrainageGrate position={[0, 0, -20]} size={0.6} />
      <DrainageGrate position={[0, 0, 20]} size={0.6} />
      <DrainageGrate position={[-15, 0, 28]} size={0.5} />
      <DrainageGrate position={[15, 0, 28]} size={0.5} />
      <DrainageGrate position={[-40, 0, -15]} size={0.6} />
      <DrainageGrate position={[40, 0, 15]} size={0.6} />

      {/* ==========================================
          ANIMATED ELEMENTS (updated for 120x160 floor)
          ========================================== */}

      {/* Flickering fluorescent lights - spread across larger area */}
      <FlickeringLight position={[-35, 18, -25]} />
      <FlickeringLight position={[35, 18, 25]} />
      <FlickeringLight position={[0, 16, 0]} />
      <FlickeringLight position={[-45, 17, 10]} />
      <FlickeringLight position={[45, 17, -10]} />

      {/* Swinging chains from ceiling */}
      <SwingingChain position={[-40, 25, -15]} length={4} />
      <SwingingChain position={[40, 25, 15]} length={3} />
      <SwingingChain position={[-20, 24, 25]} length={2.5} />
      <SwingingChain position={[20, 24, -25]} length={3.5} />

      {/* Electrical panels with occasional sparks */}
      <ElectricalPanel position={[-58, 4, 8]} rotation={[0, Math.PI / 2, 0]} />
      <ElectricalPanel position={[58, 4, -8]} rotation={[0, -Math.PI / 2, 0]} />
      <ElectricalPanel position={[-30, 4, -42]} rotation={[0, 0, 0]} />

      {/* ==========================================
          AMBIENT LIFE (updated for 120x160 floor)
          ========================================== */}

      {/* Pigeons in rafters - spread across larger ceiling */}
      <Pigeon position={[-45, 27, -38]} />
      <Pigeon position={[-43, 27, -37]} />
      <Pigeon position={[48, 26, 35]} />
      <Pigeon position={[25, 28, -40]} />
      <Pigeon position={[-20, 27, 38]} />
      <Pigeon position={[0, 28, 0]} />

      {/* Pigeons roosting on yard light poles */}
      <Pigeon position={[-25, 14.5, 35]} />
      <Pigeon position={[-24, 14.5, 35]} />
      <Pigeon position={[25, 14.5, 35]} />
      <Pigeon position={[-25, 14.5, 55]} />
      <Pigeon position={[25, 14.5, 55]} />
      <Pigeon position={[26, 14.5, 55]} />
      {/* Pigeons on back yard light poles */}
      <Pigeon position={[-25, 14.5, -85]} />
      <Pigeon position={[25, 14.5, -85]} />
      <Pigeon position={[24, 14.5, -85]} />

      {/* Mice near walls (rare, scurrying) - walls at x=±60 */}
      <Mouse position={[-55, 0.02, -25]} pathLength={4} />
      <Mouse position={[55, 0.02, 20]} pathLength={3} />
      <Mouse position={[-35, 0.02, 40]} pathLength={5} />

      {/* ==========================================
          ATMOSPHERE EFFECTS
          ========================================== */}

      {/* God rays through skylights - spread across larger area */}
      <GodRays position={[-25, 30, -18]} rotation={[0.1, 0, 0.05]} />
      <GodRays position={[20, 30, 15]} rotation={[-0.05, 0, -0.1]} />
      <GodRays position={[0, 30, 0]} rotation={[0, 0, 0]} />
      <GodRays position={[0, 30, -25]} rotation={[0.08, 0, 0]} />

      {/* Graffiti in hidden corners */}
      <Graffiti position={[-51, 2, -32]} rotation={[0, Math.PI / 2, 0]} type="tag" />
      <Graffiti position={[51, 1.5, 28]} rotation={[0, -Math.PI / 2, 0]} type="drawing" />
      <Graffiti position={[-42, 2.5, -37.5]} rotation={[0, 0, 0]} type="message" />
      <Graffiti position={[35, 3, -37.5]} rotation={[0, 0, 0]} type="tag" />

      {/* Bulletin boards */}
      <BulletinBoard position={[-52, 5.5, -10]} rotation={[0, Math.PI / 2, 0]} />
      <BulletinBoard position={[52, 5.5, 10]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Scorch marks near machinery */}
      <ScorchMark
        position={[-18, FLOOR_LAYERS.wornPrimary, -8]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={0.8}
      />
      <ScorchMark
        position={[22, FLOOR_LAYERS.wornPrimary, -4]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={0.6}
      />
      <ScorchMark position={[-52, 3, 8]} rotation={[0, Math.PI / 2, 0]} size={0.5} />
      <ScorchMark
        position={[10, FLOOR_LAYERS.wornPrimary, 18]}
        rotation={[-Math.PI / 2, 0, 0]}
        size={0.7}
      />

      {/* ==========================================
          MORE PROPS
          ========================================== */}

      {/* Oil drums / barrels */}
      <OilDrum position={[-42, 0, -28]} color="#3b82f6" />
      <OilDrum position={[-40, 0, -28]} color="#22c55e" />
      <OilDrum position={[-41, 0, -26]} color="#ef4444" />
      <OilDrum position={[42, 0, 28]} color="#3b82f6" />
      <OilDrum position={[44, 0, 27]} color="#1e293b" />
      <OilDrum position={[-25, 0, 32]} color="#78350f" tipped />

      {/* Gas cylinders (chained to walls) */}
      <GasCylinder position={[-51.5, 0, -15]} color="#22c55e" />
      <GasCylinder position={[-51.5, 0, -13]} color="#ef4444" />
      <GasCylinder position={[51.5, 0, 20]} color="#3b82f6" />
      <GasCylinder position={[51.5, 0, 22]} color="#eab308" />

      {/* Toolboxes on floor */}
      <Toolbox position={[-28, 0, -10]} isOpen />
      <Toolbox position={[32, 0, 8]} isOpen={false} />
      <Toolbox position={[-15, 0, 22]} isOpen />

      {/* Trash bins */}
      <TrashBin position={[-45, 0, 5]} />
      <TrashBin position={[45, 0, -8]} />
      <TrashBin position={[0, 0, 32]} />

      {/* Coffee cups and thermoses on surfaces */}
      <CoffeeCup position={[-35, 5.3, -37.8]} type="cup" />
      <CoffeeCup position={[-34.5, 5.3, -37.8]} type="thermos" />
      <CoffeeCup position={[35, 5.3, -37.8]} type="mug" />
      <CoffeeCup position={[-51.8, 4.3, -24.5]} type="cup" />
      <CoffeeCup position={[51.8, 4.3, 25.5]} type="thermos" />

      {/* First aid kits on walls */}
      <FirstAidKit position={[-52, 6, 30]} rotation={[0, Math.PI / 2, 0]} />
      <FirstAidKit position={[52, 6, -25]} rotation={[0, -Math.PI / 2, 0]} />
      {/* First aid kit outside bathroom door (ToiletBlock at [35,0,35], door on south wall at z=37.5) */}
      <FirstAidKit position={[38, 1.5, 39]} rotation={[0, Math.PI, 0]} />

      {/* Extension cords */}
      <ExtensionCord start={[-30, 0.01, -12]} end={[-22, 0.01, -8]} color="#f97316" />
      <ExtensionCord start={[25, 0.01, 15]} end={[32, 0.01, 18]} color="#eab308" />
      <ExtensionCord start={[-10, 0.01, 25]} end={[5, 0.01, 28]} color="#f97316" />

      {/* ==========================================
          ENVIRONMENTAL STORYTELLING
          ========================================== */}

      {/* Chalk body outline (safety training area) */}
      <ChalkOutline position={[-35, 0.02, 15]} />

      {/* "Days since last accident" boards */}
      <AccidentBoard position={[-52, 8, -5]} rotation={[0, Math.PI / 2, 0]} days={47} />
      <AccidentBoard position={[52, 8, 5]} rotation={[0, -Math.PI / 2, 0]} days={47} />

      {/* Employee of the month frames */}
      <EmployeeOfMonth position={[-52, 6, 0]} rotation={[0, Math.PI / 2, 0]} />
      <EmployeeOfMonth position={[52, 6, 0]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Old radios */}
      <OldRadio position={[-51.5, 4.5, -25]} />
      <OldRadio position={[35.5, 5.3, -37.5]} />

      {/* ==========================================
          INDUSTRIAL SAFETY EQUIPMENT
          ========================================== */}

      {/* Emergency shower stations */}
      <EmergencyShower position={[-48, 0, -35]} />
      <EmergencyShower position={[48, 0, 35]} />

      {/* Eye wash stations */}
      <EyeWashStation position={[-52, 4.5, -30]} rotation={[0, Math.PI / 2, 0]} />
      <EyeWashStation position={[52, 4.5, 30]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Ear plug dispensers */}
      <EarPlugDispenser position={[-52, 5, 5]} rotation={[0, Math.PI / 2, 0]} />
      <EarPlugDispenser position={[52, 5, -5]} rotation={[0, -Math.PI / 2, 0]} />
      <EarPlugDispenser position={[0, 5, -38]} rotation={[0, 0, 0]} />

      {/* Safety goggles racks */}
      <SafetyGogglesRack position={[-52, 4.5, 8]} rotation={[0, Math.PI / 2, 0]} />
      <SafetyGogglesRack position={[52, 4.5, -8]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ==========================================
          MORE LIFE DETAILS
          ========================================== */}

      {/* Flies around trash bins */}
      <Flies position={[-45, 0.8, 5]} count={4} />
      <Flies position={[45, 0.8, -8]} count={3} />
      <Flies position={[0, 0.8, 32]} count={5} />

      {/* Spiders in cobwebs */}
      <Spider position={[-49.5, 27.5, -34.5]} />
      <Spider position={[49.5, 27.5, 34.5]} />
      <Spider position={[-29, 25.5, -37.5]} />

      {/* Dust bunnies in corners */}
      <DustBunny position={[-49, 0.02, -36]} />
      <DustBunny position={[49, 0.02, 36]} />
      <DustBunny position={[-49, 0.02, 36]} />
      <DustBunny position={[49, 0.02, -36]} />
      <DustBunny position={[-35, 0.02, -37]} />
      <DustBunny position={[35, 0.02, 37]} />
      <DustBunny position={[-48, 0.02, 0]} />
      <DustBunny position={[48, 0.02, 0]} />

      {/* ==========================================
          TIME/CULTURE ELEMENTS
          ========================================== */}

      {/* Vending machines */}
      <VendingMachine position={[-48, 0.9, 35]} rotation={[0, Math.PI / 4, 0]} />

      {/* Time clock stations */}
      <TimeClockStation position={[-52, 5, 35]} rotation={[0, Math.PI / 2, 0]} />
      <TimeClockStation position={[52, 5, -35]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Wall calendars */}
      <WallCalendar position={[-52, 5.5, 28]} rotation={[0, Math.PI / 2, 0]} />
      <WallCalendar position={[52, 5.5, -28]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Forgotten birthday decorations */}
      <BirthdayDecorations position={[-48, 6, 15]} />

      {/* ==========================================
          MORE INDUSTRIAL DETAILS
          ========================================== */}

      {/* PA system speakers */}
      <PASpeaker position={[-40, 25, -38]} rotation={[0.3, 0, 0]} />
      <PASpeaker position={[40, 25, -38]} rotation={[0.3, 0, 0]} />
      <PASpeaker position={[-40, 25, 38]} rotation={[-0.3, Math.PI, 0]} />
      <PASpeaker position={[40, 25, 38]} rotation={[-0.3, Math.PI, 0]} />

      {/* Alarm bells */}
      <AlarmBell position={[-52, 10, -20]} />
      <AlarmBell position={[52, 10, 20]} />
      <AlarmBell position={[0, 12, -38]} />

      {/* Pressure gauges on pipes */}
      <PressureGauge position={[-18, 16, -12]} rotation={[0, Math.PI / 4, 0]} />
      <PressureGauge position={[18, 16, -12]} rotation={[0, -Math.PI / 4, 0]} />
      <PressureGauge position={[0, 18, 8]} rotation={[0, 0, 0]} />
      <PressureGauge position={[-25, 14, 5]} rotation={[0, Math.PI / 2, 0]} />
      <PressureGauge position={[25, 14, 5]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Valve wheels on pipes */}
      <ValveWheel position={[-22, 15, -10]} rotation={[0, 0, 0]} size={0.12} />
      <ValveWheel position={[22, 15, -10]} rotation={[0, 0, 0]} size={0.15} />
      <ValveWheel position={[0, 17, 5]} rotation={[Math.PI / 2, 0, 0]} size={0.18} />
      <ValveWheel position={[-30, 13, 8]} rotation={[0, Math.PI / 2, 0]} size={0.1} />
      <ValveWheel position={[30, 13, 8]} rotation={[0, -Math.PI / 2, 0]} size={0.1} />
      <ValveWheel position={[-15, 16, 12]} rotation={[0, 0.3, 0]} size={0.14} />
      <ValveWheel position={[15, 16, 12]} rotation={[0, -0.3, 0]} size={0.14} />

      {/* ==========================================
          MICRO-DETAILS - OBSESSIVE PERFECTION
          ========================================== */}

      {/* Cigarette butts near back door / loading area */}
      <CigaretteButts position={[28, 0.01, 38]} count={7} />
      <CigaretteButts position={[-28, 0.01, 38]} count={5} />
      <CigaretteButts position={[-49, 0.01, -5]} count={4} />

      {/* Gum stuck under surfaces (work tables, control panels) */}
      <StuckGum position={[-35, 4.95, -37.5]} color="#f472b6" />
      <StuckGum position={[-34.8, 4.95, -37.6]} color="#86efac" />
      <StuckGum position={[35, 4.95, -37.4]} color="#93c5fd" />
      <StuckGum position={[-51.95, 4.2, -24.8]} color="#fca5a5" />

      {/* Sticky notes on equipment */}
      <StickyNote position={[-35.2, 5.4, -37.7]} rotation={[0, 0, 0.05]} color="#fef08a" curled />
      <StickyNote position={[35.3, 5.35, -37.75]} rotation={[0, 0, -0.08]} color="#fbcfe8" />
      <StickyNote
        position={[-52, 5.2, 15.1]}
        rotation={[0, Math.PI / 2, 0.03]}
        color="#bfdbfe"
        curled
      />
      <StickyNote
        position={[52, 5.25, -15.05]}
        rotation={[0, -Math.PI / 2, -0.05]}
        color="#fef08a"
      />
      <StickyNote position={[-25.1, 4.15, -37.9]} rotation={[0, 0, 0.1]} color="#d9f99d" curled />

      {/* Scattered pens and pencils on work surfaces */}
      <ScatteredPens position={[-35, 5.32, -37.5]} count={4} />
      <ScatteredPens position={[35, 5.32, -37.6]} count={3} />
      <ScatteredPens position={[-51.5, 4.55, -24.5]} count={2} />

      {/* ==========================================
          PERSONAL ITEMS
          ========================================== */}

      {/* Jackets on hooks near entrances */}
      <JacketOnHook position={[-52, 5.5, 32]} color="#1e3a8a" />
      <JacketOnHook position={[-52, 5.5, 33.5]} color="#166534" />
      <JacketOnHook position={[52, 5.5, -32]} color="#7c2d12" />

      {/* Umbrellas in corners */}
      <UmbrellaCorner position={[-49, 0, 36]} color="#1e293b" />
      <UmbrellaCorner position={[49, 0, -36]} color="#1e40af" />
      <UmbrellaCorner position={[-49, 0, -36]} color="#dc2626" />

      {/* Lunch bags near break area */}
      <LunchBag position={[-47, 0, 34.5]} type="paper" />
      <LunchBag position={[-46.5, 0, 34]} type="cooler" />
      <LunchBag position={[-47.3, 4.52, 35]} type="box" />

      {/* Water bottles scattered around */}
      <WaterBottle position={[-35.3, 5.32, -37.3]} type="plastic" />
      <WaterBottle position={[34.8, 5.32, -37.7]} type="metal" />
      <WaterBottle position={[-51.5, 4.55, -24.2]} type="sports" />
      <WaterBottle position={[-28, 0.7, -10]} type="plastic" />
      <WaterBottle position={[32.2, 0.55, 8.2]} type="metal" />

      {/* Folded newspapers */}
      <FoldedNewspaper position={[-35.2, 5.35, -37.2]} rotation={[0, 0.3, 0]} />
      <FoldedNewspaper position={[-47, 4.52, 34.8]} rotation={[0, -0.5, 0]} />

      {/* ==========================================
          WORK IN PROGRESS
          ========================================== */}

      {/* Sawhorses blocking off maintenance areas */}
      <Sawhorse position={[-20, 0, 12]} rotation={[0, 0.3, 0]} hasTape />
      <Sawhorse position={[-17, 0, 12.5]} rotation={[0, -0.2, 0]} hasTape />
      <Sawhorse position={[25, 0, -18]} rotation={[0, Math.PI / 2, 0]} hasTape={false} />

      {/* Maintenance carts */}
      <MaintenanceCart position={[-22, 0, 10]} rotation={[0, 0.5, 0]} />
      <MaintenanceCart position={[30, 0, 5]} rotation={[0, -0.3, 0]} />

      {/* Out of Order signs on equipment */}
      <OutOfOrderSign position={[-18, 4.5, -6.2]} rotation={[0, 0, 0]} />
      <OutOfOrderSign position={[7.5, 12, 5.8]} rotation={[0, 0, 0]} />

      {/* Opened panels showing maintenance in progress */}
      <OpenedPanel position={[-52, 4, 12]} rotation={[0, Math.PI / 2, 0]} />
      <OpenedPanel position={[52, 4, -12]} rotation={[0, -Math.PI / 2, 0]} />

      {/* ==========================================
          WEATHER EFFECTS
          ========================================== */}

      {/* Puddles from roof leaks */}
      <RoofLeakPuddle position={[-12, 0, 8]} size={1} />
      <RoofLeakPuddle position={[18, 0, -12]} size={0.7} />
      <RoofLeakPuddle position={[-35, 0, 22]} size={0.9} />

      {/* Condensation on windows (high humidity areas) */}
      <WindowCondensation position={[-52, 8, -25]} rotation={[0, Math.PI / 2, 0]} />
      <WindowCondensation position={[52, 8, 25]} rotation={[0, -Math.PI / 2, 0]} />
      <WindowCondensation position={[-20, 12, -38]} rotation={[0, 0, 0]} />

      {/* Water stains on ceiling from past leaks */}
      <CeilingWaterStain position={[-12, 28, 8]} size={2} />
      <CeilingWaterStain position={[18, 27, -12]} size={1.5} />
      <CeilingWaterStain position={[-35, 26, 22]} size={1.8} />
      <CeilingWaterStain position={[5, 29, 0]} size={1.2} />

      {/* ==========================================
          MORE WILDLIFE
          ========================================== */}

      {/* Moths circling the overhead lights */}
      <MothSwarm position={[-30, 17.5, -20]} count={5} />
      <MothSwarm position={[30, 17.5, 20]} count={4} />
      <MothSwarm position={[0, 15.5, 0]} count={6} />
      <MothSwarm position={[-15, 24, 20]} count={3} />

      {/* Cockroaches (rare, near dark corners and moisture) */}
      <Cockroach position={[-49, 0.01, -35]} pathLength={3} />
      <Cockroach position={[49, 0.01, 35]} pathLength={2} />
      <Cockroach position={[-12, 0.01, 9]} pathLength={2.5} />
    </group>
  );
};

export default AmbientDetailsGroup;
