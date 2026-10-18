/**
 * ZoneLabels Component
 *
 * Floating holographic zone identifiers that appear in Blueprint Mode.
 * Shows labels for each factory zone (Silos, Milling, Sifting, Packing).
 */
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { SceneText as Text } from '../shared/SceneText';
import * as THREE from 'three';
import { PALETTE } from '../../utils/digitalTwinPalette';
import { FACTORY_ZONE_Z } from '../../constants/factoryLayout';
import { useT } from '../../i18n';
import { zoneLabelsMessages } from './ZoneLabels.messages';

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

// Zone configurations with positions and colors. Labels are message keys,
// resolved at render so the blueprint follows the active language.
const ZONES = [
  {
    id: 'silos',
    labelKey: 'storage',
    position: [0, 20, FACTORY_ZONE_Z.silos] as [number, number, number],
    color: PALETTE.zones.silos,
  },
  {
    id: 'milling',
    labelKey: 'milling',
    position: [0, 14, FACTORY_ZONE_Z.milling] as [number, number, number],
    color: PALETTE.zones.milling,
  },
  {
    id: 'sifting',
    labelKey: 'sifting',
    position: [0, 20, FACTORY_ZONE_Z.sifting] as [number, number, number],
    color: PALETTE.zones.sifting,
  },
  {
    id: 'packing',
    labelKey: 'packing',
    position: [0, 14, FACTORY_ZONE_Z.packing] as [number, number, number],
    color: PALETTE.zones.packing,
  },
] as const;

export const ZoneLabels: React.FC<ZoneLabelsProps> = ({ transition }) => {
  const t = useT(zoneLabelsMessages);
  if (transition < 0.01) return null;

  return (
    <group name="zone-labels">
      {ZONES.map((zone) => (
        <ZoneLabel
          key={zone.id}
          label={t(zone.labelKey)}
          position={zone.position}
          color={zone.color}
          transition={transition}
        />
      ))}
    </group>
  );
};

export default ZoneLabels;
