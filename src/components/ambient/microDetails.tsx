import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';

// ==========================================
// MICRO DETAILS
// Small details that add realism and character
// ==========================================

export const CigaretteButts: React.FC<{ position: [number, number, number]; count?: number }> = ({
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
      {/* Ash scatter around - y=0.03 to prevent z-fighting with floor */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh
          key={`ash-${i}`}
          position={[(Math.random() - 0.5) * 0.5, 0.03, (Math.random() - 0.5) * 0.5]}
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

export const StuckGum: React.FC<{ position: [number, number, number]; color?: string }> = ({
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

export const StickyNote: React.FC<{
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

export const ScatteredPens: React.FC<{ position: [number, number, number]; count?: number }> = ({
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
