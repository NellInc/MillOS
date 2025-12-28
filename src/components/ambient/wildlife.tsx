import React, { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

// ==========================================
// WILDLIFE COMPONENTS
// Birds, rodents, insects, and ambient creatures
// ==========================================

export const Pigeon: React.FC<{ position: [number, number, number] }> = ({ position }) => {
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

export const Mouse: React.FC<{ position: [number, number, number]; pathLength?: number }> = ({
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

export const Flies: React.FC<{ position: [number, number, number]; count?: number }> = ({
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

export const Spider: React.FC<{ position: [number, number, number] }> = ({ position }) => {
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

export const DustBunny: React.FC<{ position: [number, number, number] }> = ({ position }) => {
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

export const MothSwarm: React.FC<{ position: [number, number, number]; count?: number }> = ({
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

export const Cockroach: React.FC<{ position: [number, number, number]; pathLength?: number }> = ({
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

