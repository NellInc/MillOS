/**
 * DecisionPathRings Component
 *
 * Pulsing rings around machines that need attention.
 * Shows on machines with 'warning' or 'critical' status.
 */
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useProductionStore } from '../../stores/productionStore';
import { useShallow } from 'zustand/react/shallow';
import { PALETTE } from '../../utils/digitalTwinPalette';
import { POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

interface DecisionRingProps {
  position: [number, number, number];
  status: 'warning' | 'critical';
  transition: number;
}

const DecisionRing: React.FC<DecisionRingProps> = ({ position, status, transition }) => {
  const ringRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const outerRingRef = useRef<THREE.Mesh>(null);

  const color = status === 'critical' ? PALETTE.status.critical : PALETTE.status.warning;
  const pulseSpeed = status === 'critical' ? 4.0 : 2.5;

  useFrame((state) => {
    if (!ringRef.current || !materialRef.current) return;

    const time = state.clock.elapsedTime;
    const pulse = Math.sin(time * pulseSpeed) * 0.5 + 0.5;

    // Pulsing scale
    const scale = 1 + pulse * 0.2;
    ringRef.current.scale.set(scale, scale, 1);

    // Pulsing opacity
    materialRef.current.opacity = transition * (0.4 + pulse * 0.4);

    // Outer expanding ring
    if (outerRingRef.current) {
      const expandPulse = (time * 0.5) % 1;
      const expandScale = 1 + expandPulse * 2;
      outerRingRef.current.scale.set(expandScale, expandScale, 1);
      const outerMat = outerRingRef.current.material as THREE.MeshBasicMaterial;
      outerMat.opacity = transition * (1 - expandPulse) * 0.3;
    }
  });

  if (transition < 0.01) return null;

  return (
    // Keep the machine's Y: hardcoding 0.2 dropped elevated machines' rings to
    // the floor (plansifters sit at y=9, so their attention ring rendered ~9
    // units below the machine it was pointing at).
    <group position={[position[0], position[1] + 0.2, position[2]]}>
      {/* Main pulsing ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={RENDER_ORDER.floorEffects}>
        <ringGeometry args={[3, 3.5, 32]} />
        <meshBasicMaterial
          ref={materialRef}
          color={color}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Expanding outer ring */}
      <mesh
        ref={outerRingRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <ringGeometry args={[3.2, 3.4, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Inner glow circle */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <circleGeometry args={[2.8, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={transition * 0.15}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    </group>
  );
};

interface DecisionPathRingsProps {
  transition: number;
}

export const DecisionPathRings: React.FC<DecisionPathRingsProps> = ({ transition }) => {
  const machines = useProductionStore(useShallow((state) => state.machines));

  // Filter machines needing attention
  const attentionMachines = useMemo(() => {
    return machines.filter((m) => m.status === 'warning' || m.status === 'critical');
  }, [machines]);

  if (transition < 0.01 || attentionMachines.length === 0) return null;

  return (
    <group name="decision-path-rings">
      {attentionMachines.map((machine) => (
        <DecisionRing
          key={machine.id}
          position={machine.position as [number, number, number]}
          status={machine.status as 'warning' | 'critical'}
          transition={transition}
        />
      ))}
    </group>
  );
};

export default DecisionPathRings;
