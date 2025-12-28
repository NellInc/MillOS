/**
 * HoloLabel Component
 *
 * Floating holographic machine label with connecting line.
 * Creates HUD-style information display above machines.
 */
import React, { useMemo } from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { PALETTE, getStatusColor } from '../../utils/digitalTwinPalette';

export type LabelStatus = 'running' | 'idle' | 'warning' | 'critical' | 'maintenance';

interface HoloLabelProps {
  text: string;
  subtext?: string;
  position: [number, number, number];
  status?: LabelStatus;
  /** Height of the connecting line */
  lineHeight?: number;
  /** Font size for main text */
  fontSize?: number;
}

export const HoloLabel: React.FC<HoloLabelProps> = ({
  text,
  subtext,
  position,
  status = 'running',
  lineHeight = 2,
  fontSize = 0.4,
}) => {
  const statusColor = getStatusColor(status);

  // Create line geometry
  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([0, 0, 0, 0, -lineHeight, 0]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    return geometry;
  }, [lineHeight]);

  const lineMaterial = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: PALETTE.data.primary,
        opacity: 0.5,
        transparent: true,
      }),
    []
  );
  const lineObject = useMemo(
    () => new THREE.Line(lineGeometry, lineMaterial),
    [lineGeometry, lineMaterial]
  );

  return (
    <group position={position}>
      {/* Connecting line to machine - use primitive to avoid SVG type conflict */}
      <primitive object={lineObject} />

      {/* Main label */}
      <Text
        position={[0, 0.3, 0]}
        fontSize={fontSize}
        color={PALETTE.data.primary}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.02}
        outlineColor="#000"
      >
        {text}
      </Text>

      {/* Status subtext */}
      {subtext && (
        <Text
          position={[0, 0, 0]}
          fontSize={fontSize * 0.625}
          color={statusColor}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.015}
          outlineColor="#000"
        >
          {subtext}
        </Text>
      )}

      {/* Small status indicator dot */}
      <mesh position={[0, -0.2, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={statusColor} />
      </mesh>
    </group>
  );
};

/**
 * Memoized version for lists
 */
export const MemoizedHoloLabel = React.memo(HoloLabel);
