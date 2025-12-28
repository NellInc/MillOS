import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useModelTextures } from '../../utils/machineTextures';

// Oil puddle with reflections
export const OilPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(3)) return;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, Math.random() * Math.PI * 2]}
    >
      <circleGeometry args={[size * 0.5, 16]} />
      <meshStandardMaterial
        color="#1a1a2e"
        metalness={0.9}
        roughness={0.1}
        transparent
        opacity={0.7}
        emissive="#3b82f6"
        emissiveIntensity={0.1}
      />
    </mesh>
  );
};

// Rain puddle for outdoor areas
export const RainPuddle: React.FC<{ position: [number, number, number]; size?: number }> = ({
  position,
  size = 1.5,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(3)) return;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.05 + Math.sin(state.clock.elapsedTime * 0.8) * 0.02;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, Math.random() * Math.PI * 2]}
    >
      <circleGeometry args={[size * 0.5, 20]} />
      <meshStandardMaterial
        color="#1e3a5f"
        metalness={0.95}
        roughness={0.05}
        transparent
        opacity={0.4}
        emissive="#60a5fa"
        emissiveIntensity={0.05}
      />
    </mesh>
  );
};

// Stacked pallets with PBR wood textures (high/ultra)
export const StackedPallets: React.FC<{ position: [number, number, number]; count?: number }> = ({
  position,
  count = 3,
}) => {
  // Load pallet/wood textures (high/ultra only)
  const palletTextures = useModelTextures('pallet');

  // Configure texture tiling for pallet dimensions
  useMemo(() => {
    if (palletTextures.color) {
      palletTextures.color.wrapS = palletTextures.color.wrapT = THREE.RepeatWrapping;
      palletTextures.color.repeat.set(2, 2);
    }
    if (palletTextures.normal) {
      palletTextures.normal.wrapS = palletTextures.normal.wrapT = THREE.RepeatWrapping;
      palletTextures.normal.repeat.set(2, 2);
    }
    if (palletTextures.roughness) {
      palletTextures.roughness.wrapS = palletTextures.roughness.wrapT = THREE.RepeatWrapping;
      palletTextures.roughness.repeat.set(2, 2);
    }
  }, [palletTextures]);

  return (
    <group position={position}>
      {Array.from({ length: count }).map((_, i) => (
        <group key={i} position={[0, i * 0.15, 0]}>
          {/* Top board */}
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[1.2, 0.1, 1]} />
            <meshStandardMaterial
              color={palletTextures.color ? '#ffffff' : '#78350f'}
              map={palletTextures.color}
              normalMap={palletTextures.normal}
              normalScale={palletTextures.normal ? new THREE.Vector2(0.5, 0.5) : undefined}
              roughnessMap={palletTextures.roughness}
              roughness={0.9}
            />
          </mesh>
          {/* Support beams */}
          {[-0.4, 0, 0.4].map((x, j) => (
            <mesh key={j} position={[x, 0, 0]} castShadow>
              <boxGeometry args={[0.1, 0.1, 1]} />
              <meshStandardMaterial
                color={palletTextures.color ? '#ffffff' : '#92400e'}
                map={palletTextures.color}
                normalMap={palletTextures.normal}
                normalScale={palletTextures.normal ? new THREE.Vector2(0.5, 0.5) : undefined}
                roughnessMap={palletTextures.roughness}
                roughness={0.9}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

// Oil drum / barrel
export const OilDrum: React.FC<{
  position: [number, number, number];
  color?: string;
  tipped?: boolean;
}> = ({ position, color = '#3b82f6', tipped = false }) => {
  return (
    <group position={position} rotation={tipped ? [0, 0, Math.PI / 2] : [0, 0, 0]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.3, 0.3, 0.9, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Lid */}
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.02, 16]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Rings */}
      {[-0.3, 0, 0.3].map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <torusGeometry args={[0.31, 0.02, 8, 16]} />
          <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
    </group>
  );
};

// Gas cylinder
export const GasCylinder: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#22c55e',
}) => {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.15, 0.15, 1.2, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Cap */}
      <mesh position={[0, 0.65, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.1, 16]} />
        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Valve */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.08, 8]} />
        <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Chain (attached to wall) */}
      <mesh position={[0, 0.3, 0.1]} rotation={[0.2, 0, 0]}>
        <torusGeometry args={[0.2, 0.01, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#52525b" roughness={0.4} metalness={0.7} />
      </mesh>
    </group>
  );
};

// Toolbox
export const Toolbox: React.FC<{ position: [number, number, number]; isOpen?: boolean }> = ({
  position,
  isOpen = false,
}) => {
  return (
    <group position={position}>
      {/* Bottom tray */}
      <mesh>
        <boxGeometry args={[0.5, 0.15, 0.25]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Top lid */}
      <mesh
        position={[0, 0.1, isOpen ? 0.15 : 0]}
        rotation={isOpen ? [Math.PI / 3, 0, 0] : [0, 0, 0]}
      >
        <boxGeometry args={[0.5, 0.05, 0.25]} />
        <meshStandardMaterial color="#b91c1c" roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Handle */}
      <mesh position={[0, 0.2, 0]}>
        <torusGeometry args={[0.08, 0.015, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.7} />
      </mesh>
    </group>
  );
};

// Trash bin
export const TrashBin: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.25, 0.3, 0.6, 12]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} />
      </mesh>
      {/* Lid */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.05, 12]} />
        <meshStandardMaterial color="#374151" roughness={0.5} />
      </mesh>
      {/* Liner bag visible at top */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.1, 12]} />
        <meshStandardMaterial color="#1f2937" transparent opacity={0.8} />
      </mesh>
    </group>
  );
};

// Coffee cup
export const CoffeeCup: React.FC<{
  position: [number, number, number];
  type?: 'cup' | 'thermos' | 'mug';
}> = ({ position, type = 'cup' }) => {
  const sizes = {
    cup: [0.035, 0.04, 0.08],
    thermos: [0.04, 0.04, 0.15],
    mug: [0.045, 0.05, 0.1],
  };

  const colors = {
    cup: '#f5f5f5',
    thermos: '#374151',
    mug: '#3b82f6',
  };

  const [topRadius, bottomRadius, height] = sizes[type];

  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[topRadius, bottomRadius, height, 12]} />
        <meshStandardMaterial color={colors[type]} roughness={0.4} />
      </mesh>
      {type === 'mug' && (
        <mesh position={[topRadius + 0.015, -height / 4, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.025, 0.008, 8, 12, Math.PI]} />
          <meshStandardMaterial color={colors[type]} roughness={0.4} />
        </mesh>
      )}
    </group>
  );
};

// Cleaning equipment
export const CleaningEquipment: React.FC<{ position: [number, number, number] }> = ({
  position,
}) => {
  return (
    <group position={position}>
      {/* Mop bucket */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 0.4, 16]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.5} />
      </mesh>
      {/* Broom */}
      <group position={[0.4, 0, 0]} rotation={[0, 0, 0.15]}>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 1.2, 8]} />
          <meshStandardMaterial color="#78350f" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.08, 0]}>
          <boxGeometry args={[0.15, 0.12, 0.04]} />
          <meshStandardMaterial color="#a16207" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
};

// Hard hat on hook
export const HardHatHook: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#eab308',
}) => {
  const hatRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(3)) return;
    if (hatRef.current) {
      hatRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.8) * 0.03;
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[0.1, 0.1, 0.05]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.05, 0.05]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.04, 0.01, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#52525b" metalness={0.7} />
      </mesh>
      <group ref={hatRef} position={[0, -0.15, 0.08]}>
        <mesh>
          <sphereGeometry args={[0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.01, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.02, 16]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
};
