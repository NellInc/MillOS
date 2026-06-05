/**
 * Visible Chaos System
 *
 * Theme Hospital-inspired visible disasters and events.
 * Grain spills, dust clouds, rat sightings, pigeon incursions,
 * and the ever-critical coffee machine breakdown.
 *
 * PERFORMANCE: Consolidated from 9 separate useFrame hooks into 1 centralized manager
 */

import React, { useRef, useMemo, useCallback, createContext, useContext } from 'react';
import { useFrame, type RootState } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { SceneText as Text } from './shared/SceneText';
import * as THREE from 'three';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import type { ChaosEvent } from '../types';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../constants/renderLayers';

// =========================================================================
// ANIMATION MANAGER - Single useFrame for all chaos events
// =========================================================================

interface ChaosRefs {
  type: ChaosEvent['type'];
  eventId: string;
  startTime: number;
  duration: number;
  position: [number, number, number];
  // Common refs
  groupRef?: React.RefObject<THREE.Group | null>;
  particlesRef?: React.RefObject<THREE.InstancedMesh | THREE.Points | null>;
  materialRef?: React.RefObject<THREE.MeshStandardMaterial | null>;
  lightRef?: React.RefObject<THREE.PointLight | null>;
  // Grain spill specific
  scaleRef?: React.MutableRefObject<number>;
  pileRef?: React.RefObject<THREE.Mesh | null>;
  positions?: Array<{ x: number; z: number; delay: number; scale: number }>;
  dummy?: THREE.Object3D;
  // Rat specific
  tailRef?: React.RefObject<THREE.Mesh | null>;
  angleRef?: React.MutableRefObject<number>;
  radiusRef?: React.MutableRefObject<number>;
  panicModeRef?: React.MutableRefObject<boolean>;
  // Pigeon specific
  wingLeftRef?: React.RefObject<THREE.Mesh | null>;
  wingRightRef?: React.RefObject<THREE.Mesh | null>;
  headRef?: React.RefObject<THREE.Mesh | null>;
  isFlying?: React.MutableRefObject<boolean>;
  flyTargetRef?: React.MutableRefObject<{ x: number; y: number; z: number }>;
  flyTargetVecRef?: React.MutableRefObject<THREE.Vector3>;
  // Temperature spike specific
  glowRef?: React.RefObject<THREE.Mesh | null>;
  steamPositions?: Float32Array;
  smokePositions?: Float32Array;
}

type RegisterFn = (refs: ChaosRefs) => void;
type UnregisterFn = (eventId: string) => void;

// Quality scale context for particle count scaling
const QualityScaleContext = createContext<number>(1.0);

const ChaosAnimationContext = createContext<{
  register: RegisterFn;
  unregister: UnregisterFn;
} | null>(null);

const useChaosAnimation = () => {
  const ctx = useContext(ChaosAnimationContext);
  if (!ctx) throw new Error('useChaosAnimation must be used within ChaosAnimationProvider');
  return ctx;
};

// =========================================================================
// ANIMATION FUNCTIONS - Pure functions for each chaos type
// =========================================================================

function animateGrainSpill(refs: ChaosRefs, state: RootState): void {
  if (!refs.particlesRef?.current || !refs.positions || !refs.dummy || !refs.scaleRef) return;

  const elapsed = (Date.now() - refs.startTime) / 1000;
  refs.scaleRef.current = Math.min(1, elapsed / 2);

  // Grow the main pile via object scale. The cone geometry itself is fixed
  // radius - the old `args={[0.8 * scaleRef.current, ...]}` evaluated the ref
  // at the component's single render, when it was still 0, so the pile was
  // permanently degenerate (radius-0) and only the scattered specks showed.
  if (refs.pileRef?.current) {
    refs.pileRef.current.scale.setScalar(Math.max(0.001, refs.scaleRef.current));
  }

  refs.positions.forEach((p, i) => {
    const spreadProgress = Math.max(0, Math.min(1, (refs.scaleRef!.current - p.delay) / 0.5));
    refs.dummy!.position.set(
      refs.position[0] + p.x * spreadProgress * 1.5,
      0.02 + Math.sin(state.clock.elapsedTime * 3 + i) * 0.01,
      refs.position[2] + p.z * spreadProgress * 1.5
    );
    refs.dummy!.scale.setScalar(p.scale * spreadProgress);
    refs.dummy!.updateMatrix();
    (refs.particlesRef!.current as THREE.InstancedMesh).setMatrixAt(i, refs.dummy!.matrix);
  });
  (refs.particlesRef!.current as THREE.InstancedMesh).instanceMatrix.needsUpdate = true;
}

function animateDustCloud(refs: ChaosRefs, state: RootState): void {
  if (!refs.particlesRef?.current) return;
  const particles = refs.particlesRef.current as THREE.Points;

  const elapsed = (Date.now() - refs.startTime) / 1000;
  const expansion = Math.min(3, elapsed * 2);
  const fade = Math.max(0, 1 - elapsed / refs.duration);

  particles.scale.setScalar(expansion);
  (particles.material as THREE.PointsMaterial).opacity = fade * 0.4;
  particles.rotation.y = state.clock.elapsedTime * 0.2;
}

function animateRat(refs: ChaosRefs, state: RootState): void {
  if (!refs.groupRef?.current || !refs.angleRef || !refs.radiusRef || !refs.panicModeRef) return;

  const time = state.clock.elapsedTime;

  // Rat scurries in expanding circles, occasionally panicking
  if (Math.random() < 0.01) refs.panicModeRef.current = !refs.panicModeRef.current;

  const speed = refs.panicModeRef.current ? 8 : 3;
  refs.angleRef.current += 0.05 * speed;
  refs.radiusRef.current = 1 + Math.sin(time * 0.5) * 2;

  const x = refs.position[0] + Math.cos(refs.angleRef.current) * refs.radiusRef.current;
  const z = refs.position[2] + Math.sin(refs.angleRef.current) * refs.radiusRef.current;

  refs.groupRef.current.position.set(x, 0.05, z);
  refs.groupRef.current.rotation.y = refs.angleRef.current + Math.PI / 2;

  // Tail wiggle
  if (refs.tailRef?.current) {
    refs.tailRef.current.rotation.y = Math.sin(time * 15) * 0.5;
  }
}

function animatePigeon(refs: ChaosRefs, state: RootState): void {
  if (!refs.groupRef?.current || !refs.isFlying || !refs.flyTargetRef || !refs.flyTargetVecRef)
    return;

  const time = state.clock.elapsedTime;

  // Randomly decide to fly or walk
  if (Math.random() < 0.005) {
    refs.isFlying.current = !refs.isFlying.current;
    if (refs.isFlying.current) {
      refs.flyTargetRef.current = {
        x: refs.position[0] + (Math.random() - 0.5) * 6,
        y: 1 + Math.random() * 2,
        z: refs.position[2] + (Math.random() - 0.5) * 6,
      };
    }
  }

  const pos = refs.groupRef.current.position;

  if (refs.isFlying.current) {
    // Flying behavior
    refs.flyTargetVecRef.current.set(
      refs.flyTargetRef.current.x,
      refs.flyTargetRef.current.y,
      refs.flyTargetRef.current.z
    );
    pos.lerp(refs.flyTargetVecRef.current, 0.02);

    // Wing flapping
    if (refs.wingLeftRef?.current && refs.wingRightRef?.current) {
      const flap = Math.sin(time * 20) * 0.8;
      refs.wingLeftRef.current.rotation.z = flap;
      refs.wingRightRef.current.rotation.z = -flap;
    }
  } else {
    // Walking/pecking behavior
    pos.y = 0.1;

    // Waddle walk
    if (Math.random() < 0.02) {
      pos.x += (Math.random() - 0.5) * 0.1;
      pos.z += (Math.random() - 0.5) * 0.1;
    }

    // Wings folded
    if (refs.wingLeftRef?.current && refs.wingRightRef?.current) {
      refs.wingLeftRef.current.rotation.z = THREE.MathUtils.lerp(
        refs.wingLeftRef.current.rotation.z,
        0,
        0.1
      );
      refs.wingRightRef.current.rotation.z = THREE.MathUtils.lerp(
        refs.wingRightRef.current.rotation.z,
        0,
        0.1
      );
    }

    // Head bobbing (classic pigeon)
    if (refs.headRef?.current) {
      refs.headRef.current.position.z = 0.06 + Math.sin(time * 8) * 0.02;
    }
  }
}

function animatePuddle(refs: ChaosRefs, state: RootState): void {
  if (refs.materialRef?.current) {
    refs.materialRef.current.opacity = 0.6 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
  }
}

function animateConveyorJam(refs: ChaosRefs, state: RootState): void {
  if (refs.groupRef?.current) {
    refs.groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime) * 0.02;
  }
}

function animateTemperatureSpike(refs: ChaosRefs, state: RootState): void {
  if (refs.particlesRef?.current) {
    const steam = refs.particlesRef.current as THREE.Points;
    steam.rotation.y = state.clock.elapsedTime * 0.3;
    const geo = steam.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (pos.getY(i) + 0.02) % 2);
    }
    pos.needsUpdate = true;
  }
  if (refs.glowRef?.current) {
    const pulse = 0.8 + Math.sin(state.clock.elapsedTime * 4) * 0.2;
    refs.glowRef.current.scale.setScalar(pulse);
  }
}

function animatePowerFlicker(refs: ChaosRefs): void {
  if (refs.lightRef?.current) {
    const flicker = Math.random() > 0.3 ? 1 : 0.2;
    refs.lightRef.current.intensity = flicker * 2;
  }
}

function animateCoffeeMachine(refs: ChaosRefs): void {
  if (refs.particlesRef?.current) {
    const smoke = refs.particlesRef.current as THREE.Points;
    const geo = smoke.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, (pos.getY(i) + 0.01) % 1);
    }
    pos.needsUpdate = true;
  }
}

// =========================================================================
// CHAOS ANIMATION MANAGER - Single useFrame for all events
// =========================================================================

const ChaosAnimationManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chaosRefsMap = useRef<Map<string, ChaosRefs>>(new Map());
  const frameCountRef = useRef(0);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  const register = useCallback<RegisterFn>((refs) => {
    chaosRefsMap.current.set(refs.eventId, refs);
  }, []);

  const unregister = useCallback<UnregisterFn>((eventId) => {
    chaosRefsMap.current.delete(eventId);
  }, []);

  // Single useFrame for ALL chaos events (consolidates 9 hooks into 1)
  useFrame((state) => {
    if (!isTabVisible) return;
    frameCountRef.current++;
    if (frameCountRef.current % 3 !== 0) return; // Throttle to ~20fps

    chaosRefsMap.current.forEach((refs) => {
      switch (refs.type) {
        case 'grain_spill':
          animateGrainSpill(refs, state);
          break;
        case 'dust_cloud':
          animateDustCloud(refs, state);
          break;
        case 'rat_sighting':
          animateRat(refs, state);
          break;
        case 'pigeon_incursion':
          animatePigeon(refs, state);
          break;
        case 'mysterious_puddle':
          animatePuddle(refs, state);
          break;
        case 'conveyor_jam':
          animateConveyorJam(refs, state);
          break;
        case 'temperature_spike':
          animateTemperatureSpike(refs, state);
          break;
        case 'power_flicker':
          animatePowerFlicker(refs);
          break;
        case 'coffee_machine_broken':
          animateCoffeeMachine(refs);
          break;
      }
    });
  });

  const contextValue = useMemo(() => ({ register, unregister }), [register, unregister]);

  return (
    <ChaosAnimationContext.Provider value={contextValue}>{children}</ChaosAnimationContext.Provider>
  );
};

// =========================================================================
// GRAIN SPILL - Animated pile spreading on floor
// =========================================================================
const GrainSpill: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const qualityScale = useContext(QualityScaleContext);
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const scaleRef = useRef(0);
  const pileRef = useRef<THREE.Mesh>(null);

  const particleCount = Math.max(10, Math.floor(50 * qualityScale));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useMemo(() => {
    return Array.from({ length: particleCount }, () => ({
      x: (Math.random() - 0.5) * 2,
      z: (Math.random() - 0.5) * 2,
      delay: Math.random() * 0.5,
      scale: 0.05 + Math.random() * 0.1,
    }));
  }, [particleCount]);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'grain_spill',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      groupRef,
      particlesRef: particlesRef as React.RefObject<THREE.InstancedMesh | THREE.Points>,
      scaleRef,
      pileRef,
      positions,
      dummy,
    });
    return () => unregister(event.id);
  }, [
    register,
    unregister,
    event.id,
    event.startTime,
    event.duration,
    event.position,
    positions,
    dummy,
  ]);

  return (
    <group ref={groupRef} position={[event.position[0], 0, event.position[2]]}>
      {/* Main spill pile - fixed-radius cone; animateGrainSpill grows it via
          object scale (starts near-zero to avoid a one-frame full-size pop). */}
      <mesh ref={pileRef} position={[0, 0.1, 0]} scale={0.001} castShadow>
        <coneGeometry args={[0.8, 0.3, 8]} />
        <meshStandardMaterial color="#d4a574" roughness={0.9} />
      </mesh>

      {/* Scattered grain particles */}
      <instancedMesh ref={particlesRef} args={[undefined, undefined, particleCount]} castShadow>
        <sphereGeometry args={[1, 6, 6]} />
        <meshStandardMaterial color="#c68642" roughness={0.8} />
      </instancedMesh>

      {/* Warning sign */}
      <Billboard position={[0, 0.8, 0]}>
        <Text fontSize={0.2} color="#ef4444" anchorX="center">
          SPILL
        </Text>
      </Billboard>
    </group>
  );
});
GrainSpill.displayName = 'GrainSpill';

// =========================================================================
// DUST CLOUD - Particle burst, workers cough dramatically
// =========================================================================
const DustCloud: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const qualityScale = useContext(QualityScaleContext);
  const particlesRef = useRef<THREE.Points>(null);

  const particleCount = Math.max(20, Math.floor(100 * qualityScale));
  const positions = useMemo(() => {
    const arr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 0.5;
      arr[i * 3 + 1] = Math.random() * 0.5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    return arr;
  }, [particleCount]);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'dust_cloud',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      particlesRef: particlesRef as React.RefObject<THREE.InstancedMesh | THREE.Points>,
    });
    return () => unregister(event.id);
  }, [register, unregister, event.id, event.startTime, event.duration, event.position]);

  return (
    <group position={event.position}>
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#a0826d" size={0.08} transparent opacity={0.4} sizeAttenuation />
      </points>
    </group>
  );
});
DustCloud.displayName = 'DustCloud';

// =========================================================================
// RAT - Animated rat scurrying around. Everyone panics (slightly)
// =========================================================================
const Rat: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const groupRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Mesh>(null);
  const angleRef = useRef(Math.random() * Math.PI * 2);
  const radiusRef = useRef(0);
  const panicModeRef = useRef(false);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'rat_sighting',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      groupRef,
      tailRef,
      angleRef,
      radiusRef,
      panicModeRef,
    });
    return () => unregister(event.id);
  }, [register, unregister, event.id, event.startTime, event.duration, event.position]);

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh castShadow>
        <capsuleGeometry args={[0.03, 0.08, 4, 8]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.01, 0.06]} castShadow>
        <sphereGeometry args={[0.025, 8, 8]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
      </mesh>

      {/* Ears */}
      <mesh position={[-0.015, 0.03, 0.05]}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshStandardMaterial color="#8b7b7b" />
      </mesh>
      <mesh position={[0.015, 0.03, 0.05]}>
        <sphereGeometry args={[0.01, 6, 6]} />
        <meshStandardMaterial color="#8b7b7b" />
      </mesh>

      {/* Eyes (beady) */}
      <mesh position={[-0.01, 0.02, 0.08]}>
        <sphereGeometry args={[0.004, 6, 6]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh position={[0.01, 0.02, 0.08]}>
        <sphereGeometry args={[0.004, 6, 6]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Tail */}
      <mesh ref={tailRef} position={[0, 0, -0.06]} rotation={[0.3, 0, 0]}>
        <cylinderGeometry args={[0.004, 0.002, 0.1, 6]} />
        <meshStandardMaterial color="#8b7b7b" />
      </mesh>

      {/* Feet (tiny) */}
      {[
        [-0.02, -0.02, 0.02],
        [0.02, -0.02, 0.02],
        [-0.02, -0.02, -0.02],
        [0.02, -0.02, -0.02],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]}>
          <sphereGeometry args={[0.008, 4, 4]} />
          <meshStandardMaterial color="#8b7b7b" />
        </mesh>
      ))}
    </group>
  );
});
Rat.displayName = 'Rat';

// =========================================================================
// PIGEON - A pigeon got in. It's judging everyone.
// =========================================================================
const Pigeon: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const groupRef = useRef<THREE.Group>(null);
  const wingLeftRef = useRef<THREE.Mesh>(null);
  const wingRightRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);
  const isFlying = useRef(false);
  const flyTargetRef = useRef({ x: event.position[0], y: 0.5, z: event.position[2] });
  const flyTargetVecRef = useRef(new THREE.Vector3());

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'pigeon_incursion',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      groupRef,
      wingLeftRef,
      wingRightRef,
      headRef,
      isFlying,
      flyTargetRef,
      flyTargetVecRef,
    });
    return () => unregister(event.id);
  }, [register, unregister, event.id, event.startTime, event.duration, event.position]);

  return (
    <group ref={groupRef} position={[event.position[0], 0.5, event.position[2]]}>
      {/* Body */}
      <mesh castShadow>
        <capsuleGeometry args={[0.05, 0.08, 4, 8]} />
        <meshStandardMaterial color="#7a7a8a" roughness={0.8} />
      </mesh>

      {/* Head */}
      <mesh ref={headRef} position={[0, 0.02, 0.06]} castShadow>
        <sphereGeometry args={[0.035, 8, 8]} />
        <meshStandardMaterial color="#6a6a7a" roughness={0.8} />
      </mesh>

      {/* Beak */}
      <mesh position={[0, 0.01, 0.09]} rotation={[0.3, 0, 0]}>
        <coneGeometry args={[0.01, 0.025, 4]} />
        <meshStandardMaterial color="#d4a574" />
      </mesh>

      {/* Eyes (judgmental) */}
      <mesh position={[-0.015, 0.035, 0.08]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#ff6b00" />
      </mesh>
      <mesh position={[0.015, 0.035, 0.08]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshStandardMaterial color="#ff6b00" />
      </mesh>
      {/* Pupils */}
      <mesh position={[-0.015, 0.035, 0.086]}>
        <sphereGeometry args={[0.004, 4, 4]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh position={[0.015, 0.035, 0.086]}>
        <sphereGeometry args={[0.004, 4, 4]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      {/* Wings */}
      <mesh ref={wingLeftRef} position={[-0.05, 0, 0]} rotation={[0, 0.2, 0]}>
        <boxGeometry args={[0.08, 0.02, 0.06]} />
        <meshStandardMaterial color="#5a5a6a" />
      </mesh>
      <mesh ref={wingRightRef} position={[0.05, 0, 0]} rotation={[0, -0.2, 0]}>
        <boxGeometry args={[0.08, 0.02, 0.06]} />
        <meshStandardMaterial color="#5a5a6a" />
      </mesh>

      {/* Tail */}
      <mesh position={[0, 0, -0.08]} rotation={[-0.3, 0, 0]}>
        <boxGeometry args={[0.03, 0.01, 0.06]} />
        <meshStandardMaterial color="#4a4a5a" />
      </mesh>

      {/* Feet */}
      <mesh position={[-0.02, -0.06, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.04, 4]} />
        <meshStandardMaterial color="#d4a574" />
      </mesh>
      <mesh position={[0.02, -0.06, 0]}>
        <cylinderGeometry args={[0.005, 0.005, 0.04, 4]} />
        <meshStandardMaterial color="#d4a574" />
      </mesh>
    </group>
  );
});
Pigeon.displayName = 'Pigeon';

// =========================================================================
// MYSTERIOUS PUDDLE - Nobody knows where it came from
// =========================================================================
const MysteriousPuddle: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'mysterious_puddle',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      materialRef,
    });
    return () => unregister(event.id);
  }, [register, unregister, event.id, event.startTime, event.duration, event.position]);

  return (
    <group position={[event.position[0], FLOOR_LAYERS.puddle, event.position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow renderOrder={RENDER_ORDER.floorEffects}>
        <circleGeometry args={[0.8, 24]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#4a90b8"
          transparent
          opacity={0.6}
          roughness={0.1}
          metalness={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.subtle.factor}
          polygonOffsetUnits={POLYGON_OFFSET.subtle.units}
        />
      </mesh>
      {/* Reflection highlight */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0.1, 0, -0.1]}
        renderOrder={RENDER_ORDER.floorEffects + 1}
      >
        <circleGeometry args={[0.15, 16]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>

      {/* Question mark */}
      <Billboard position={[0, 0.5, 0]}>
        <Text fontSize={0.25} color="#4a90b8" anchorX="center">
          ?
        </Text>
      </Billboard>
    </group>
  );
});
MysteriousPuddle.displayName = 'MysteriousPuddle';

// =========================================================================
// CONVEYOR JAM - Bags piling up ominously
// =========================================================================
const ConveyorJam: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const bagsRef = useRef<THREE.Group>(null);

  const bagPositions = useMemo(() => {
    return Array.from({ length: 8 }, (_, i) => ({
      x: (Math.random() - 0.5) * 1.5,
      y: 0.15 + i * 0.12 + Math.random() * 0.05,
      z: (Math.random() - 0.5) * 0.8,
      rotX: (Math.random() - 0.5) * 0.3,
      rotZ: (Math.random() - 0.5) * 0.3,
    }));
  }, []);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'conveyor_jam',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      groupRef: bagsRef,
    });
    return () => unregister(event.id);
  }, [register, unregister, event.id, event.startTime, event.duration, event.position]);

  return (
    <group ref={bagsRef} position={event.position}>
      {bagPositions.map((pos, i) => (
        <mesh
          key={i}
          position={[pos.x, pos.y, pos.z]}
          rotation={[pos.rotX, 0, pos.rotZ]}
          castShadow
        >
          <boxGeometry args={[0.3, 0.2, 0.15]} />
          <meshStandardMaterial color={i % 2 === 0 ? '#e5d5c5' : '#d4c4b4'} roughness={0.9} />
        </mesh>
      ))}

      {/* Warning text */}
      <Billboard position={[0, 1.2, 0]}>
        <Text fontSize={0.15} color="#ef4444" anchorX="center">
          JAM!
        </Text>
      </Billboard>
    </group>
  );
});
ConveyorJam.displayName = 'ConveyorJam';

// =========================================================================
// TEMPERATURE SPIKE - Steam venting, red glow
// =========================================================================
const TemperatureSpike: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const qualityScale = useContext(QualityScaleContext);
  const steamRef = useRef<THREE.Points>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const particleCount = Math.max(10, Math.floor(50 * qualityScale));
  const steamPositions = useMemo(() => {
    const arr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 0.5;
      arr[i * 3 + 1] = Math.random() * 2;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    }
    return arr;
  }, [particleCount]);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'temperature_spike',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      particlesRef: steamRef as React.RefObject<THREE.InstancedMesh | THREE.Points>,
      glowRef,
      steamPositions,
    });
    return () => unregister(event.id);
  }, [
    register,
    unregister,
    event.id,
    event.startTime,
    event.duration,
    event.position,
    steamPositions,
  ]);

  return (
    <group position={event.position}>
      {/* Red warning glow */}
      <mesh ref={glowRef} position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.15} />
      </mesh>

      {/* Steam particles */}
      <points ref={steamRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[steamPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffffff" size={0.1} transparent opacity={0.5} sizeAttenuation />
      </points>

      {/* Warning text */}
      <Billboard position={[0, 2.5, 0]}>
        <Text fontSize={0.2} color="#ef4444" anchorX="center">
          HOT!
        </Text>
      </Billboard>
    </group>
  );
});
TemperatureSpike.displayName = 'TemperatureSpike';

// =========================================================================
// POWER FLICKER - Handled via scene lighting, this is just the indicator
// =========================================================================
const PowerFlicker: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const lightRef = useRef<THREE.PointLight>(null);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'power_flicker',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      lightRef,
    });
    return () => unregister(event.id);
  }, [register, unregister, event.id, event.startTime, event.duration, event.position]);

  return (
    <group position={event.position}>
      <pointLight ref={lightRef} color="#fef3c7" intensity={2} distance={10} />
      <Billboard position={[0, 2, 0]}>
        <Text fontSize={0.2} color="#eab308" anchorX="center">
          *flicker*
        </Text>
      </Billboard>
    </group>
  );
});
PowerFlicker.displayName = 'PowerFlicker';

// =========================================================================
// COFFEE MACHINE BROKEN - The most serious disaster
// =========================================================================
const CoffeeMachineBroken: React.FC<{ event: ChaosEvent }> = React.memo(({ event }) => {
  const { register, unregister } = useChaosAnimation();
  const qualityScale = useContext(QualityScaleContext);
  const smokeRef = useRef<THREE.Points>(null);

  const particleCount = Math.max(8, Math.floor(30 * qualityScale));
  const smokePositions = useMemo(() => {
    const arr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 0.3;
      arr[i * 3 + 1] = Math.random() * 1;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    return arr;
  }, [particleCount]);

  // Register with animation manager
  React.useEffect(() => {
    register({
      type: 'coffee_machine_broken',
      eventId: event.id,
      startTime: event.startTime,
      duration: event.duration,
      position: event.position,
      particlesRef: smokeRef as React.RefObject<THREE.InstancedMesh | THREE.Points>,
      smokePositions,
    });
    return () => unregister(event.id);
  }, [
    register,
    unregister,
    event.id,
    event.startTime,
    event.duration,
    event.position,
    smokePositions,
  ]);

  return (
    <group position={event.position}>
      {/* Coffee machine body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.3]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
      </mesh>

      {/* Screen (showing error) */}
      <mesh position={[0, 0.5, 0.16]}>
        <planeGeometry args={[0.2, 0.1]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>

      {/* Sad smoke */}
      <points ref={smokeRef} position={[0, 0.7, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[smokePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#6b7280" size={0.05} transparent opacity={0.4} sizeAttenuation />
      </points>

      {/* Crisis text */}
      <Billboard position={[0, 1.2, 0]}>
        <Text fontSize={0.15} color="#ef4444" anchorX="center" fontWeight="bold">
          CRITICAL
        </Text>
      </Billboard>
      <Billboard position={[0, 1, 0]}>
        <Text fontSize={0.12} color="#6b7280" anchorX="center">
          Coffee Machine Down
        </Text>
      </Billboard>
    </group>
  );
});
CoffeeMachineBroken.displayName = 'CoffeeMachineBroken';

// =========================================================================
// MAIN CHAOS RENDERER
// =========================================================================
const ChaosEventRenderer: React.FC<{ event: ChaosEvent }> = ({ event }) => {
  if (event.resolved) return null;

  switch (event.type) {
    case 'grain_spill':
      return <GrainSpill event={event} />;
    case 'dust_cloud':
      return <DustCloud event={event} />;
    case 'rat_sighting':
      return <Rat event={event} />;
    case 'pigeon_incursion':
      return <Pigeon event={event} />;
    case 'mysterious_puddle':
      return <MysteriousPuddle event={event} />;
    case 'conveyor_jam':
      return <ConveyorJam event={event} />;
    case 'temperature_spike':
      return <TemperatureSpike event={event} />;
    case 'power_flicker':
      return <PowerFlicker event={event} />;
    case 'coffee_machine_broken':
      return <CoffeeMachineBroken event={event} />;
    default:
      return null;
  }
};

// Props for quality scaling
interface VisibleChaosProps {
  /** Quality scale factor (0.25 = low, 0.5 = medium, 0.75 = high, 1.0 = ultra) */
  qualityScale?: number;
}

// Main visible chaos system component
// PERFORMANCE: Wraps all chaos events in ChaosAnimationManager
// to consolidate 9 separate useFrame hooks into 1 centralized manager
export const VisibleChaos: React.FC<VisibleChaosProps> = ({ qualityScale = 1.0 }) => {
  const chaosEvents = useWorkerMoodStore((state) => state.chaosEvents);

  return (
    <QualityScaleContext.Provider value={qualityScale}>
      <ChaosAnimationManager>
        <group>
          {chaosEvents.map((event) => (
            <ChaosEventRenderer key={event.id} event={event} />
          ))}
        </group>
      </ChaosAnimationManager>
    </QualityScaleContext.Provider>
  );
};

export default VisibleChaos;
