/**
 * ZoneLabels Component
 *
 * Floating holographic zone identifiers that appear in Blueprint Mode.
 * Shows labels for each factory zone (Silos, Milling, Sifting, Packing).
 */
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE } from '../../utils/digitalTwinPalette';
import { FACTORY_ZONE_Z } from '../../constants/factoryLayout';

interface ZoneLabelProps {
  label: string;
  position: [number, number, number];
  color: string;
  transition: number;
}

const ZoneLabel: React.FC<ZoneLabelProps> = ({ label, position, color, transition }) => {
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Holographic floating animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.8) * 0.3;
    }
    if (materialRef.current) {
      // Subtle pulse effect
      const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.1 + 0.9;
      materialRef.current.opacity = transition * pulse * 0.9;
    }
  });

  if (transition < 0.01) return null;

  return (
    <group ref={groupRef} position={position}>
      {/* Main label text */}
      <Text
        fontSize={2.5}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.08}
        outlineColor="#000000"
        fillOpacity={transition}
      >
        {label}
      </Text>

      {/* Holographic underline */}
      <mesh position={[0, -1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[label.length * 1.2, 0.15]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={transition * 0.7}
          depthWrite={false}
        />
      </mesh>

      {/* Corner brackets for holographic effect */}
      <mesh position={[-label.length * 0.6, 0.8, 0]}>
        <planeGeometry args={[0.3, 0.8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={transition * 0.5}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[label.length * 0.6, 0.8, 0]}>
        <planeGeometry args={[0.3, 0.8]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={transition * 0.5}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

interface ZoneLabelsProps {
  transition: number;
}

// Zone configurations with positions and colors
const ZONES = [
  {
    id: 'silos',
    label: 'ZONE 1: STORAGE',
    position: [0, 20, FACTORY_ZONE_Z.silos] as [number, number, number],
    color: PALETTE.zones.silos,
  },
  {
    id: 'milling',
    label: 'ZONE 2: MILLING',
    position: [0, 14, FACTORY_ZONE_Z.milling] as [number, number, number],
    color: PALETTE.zones.milling,
  },
  {
    id: 'sifting',
    label: 'ZONE 3: SIFTING',
    position: [0, 20, FACTORY_ZONE_Z.sifting] as [number, number, number],
    color: PALETTE.zones.sifting,
  },
  {
    id: 'packing',
    label: 'ZONE 4: PACKING',
    position: [0, 14, FACTORY_ZONE_Z.packing] as [number, number, number],
    color: PALETTE.zones.packing,
  },
];

export const ZoneLabels: React.FC<ZoneLabelsProps> = ({ transition }) => {
  if (transition < 0.01) return null;

  return (
    <group name="zone-labels">
      {ZONES.map((zone) => (
        <ZoneLabel
          key={zone.id}
          label={zone.label}
          position={zone.position}
          color={zone.color}
          transition={transition}
        />
      ))}
    </group>
  );
};

export default ZoneLabels;
