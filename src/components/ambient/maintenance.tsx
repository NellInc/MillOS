import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';

// ==========================================
// MAINTENANCE & WORK IN PROGRESS
// Maintenance equipment, warning signs, ongoing work
// ==========================================

export const Sawhorse: React.FC<{
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

export const MaintenanceCart: React.FC<{
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

export const OutOfOrderSign: React.FC<{
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

export const OpenedPanel: React.FC<{
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
