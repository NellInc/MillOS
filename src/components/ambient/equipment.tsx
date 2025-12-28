import React, { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

// ==========================================
// EQUIPMENT & STORAGE
// Pallets, tools, containers, and storage items
// ==========================================

export const StackedPallets: React.FC<{ position: [number, number, number]; count?: number }> = ({
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

export const ToolRack: React.FC<{
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

export const HardHatHook: React.FC<{ position: [number, number, number]; color?: string }> = ({
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

export const CleaningEquipment: React.FC<{ position: [number, number, number] }> = ({ position }) => {
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

export const Toolbox: React.FC<{ position: [number, number, number]; isOpen?: boolean }> = ({
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

export const OilDrum: React.FC<{
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

export const GasCylinder: React.FC<{ position: [number, number, number]; color?: string }> = ({
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

export const TrashBin: React.FC<{ position: [number, number, number] }> = ({ position }) => {
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

