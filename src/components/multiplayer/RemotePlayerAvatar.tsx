/**
 * RemotePlayerAvatar - 3D avatar for remote players in multiplayer
 *
 * Features:
 * - Smooth position interpolation
 * - Walking animation based on velocity
 * - Name tag billboard
 * - Selection indicator when controlling a machine
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { RemotePlayer } from '../../multiplayer/types';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

interface RemotePlayerAvatarProps {
  player: RemotePlayer;
}

// Interpolation settings
const POSITION_LERP_FACTOR = 12; // Higher = snappier
const ROTATION_LERP_FACTOR = 10;

export const RemotePlayerAvatar: React.FC<RemotePlayerAvatarProps> = React.memo(({ player }) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);

  // Target position/rotation for interpolation
  const targetPosition = useRef(new THREE.Vector3(...player.position));
  const targetRotation = useRef(player.rotation);
  const walkPhase = useRef(0);

  // Calculate if moving based on velocity
  const isMoving = useMemo(() => {
    const [vx, , vz] = player.velocity;
    return Math.sqrt(vx * vx + vz * vz) > 0.5;
  }, [player.velocity]);

  // Smooth interpolation and walk animation
  useFrame((_, delta) => {
    if (!groupRef.current) return;

    // Update targets from player state
    targetPosition.current.set(...player.position);
    targetRotation.current = player.rotation;

    // Smooth position interpolation
    const lerpFactor = Math.min(delta * POSITION_LERP_FACTOR, 1);
    groupRef.current.position.lerp(targetPosition.current, lerpFactor);

    // Smooth rotation interpolation
    const currentY = groupRef.current.rotation.y;
    const rotLerpFactor = Math.min(delta * ROTATION_LERP_FACTOR, 1);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      currentY,
      targetRotation.current,
      rotLerpFactor
    );

    // Walk animation
    if (isMoving) {
      walkPhase.current += delta * 8; // Animation speed

      const armSwing = Math.sin(walkPhase.current) * 0.5;
      const legSwing = Math.sin(walkPhase.current) * 0.4;

      if (leftArmRef.current) leftArmRef.current.rotation.x = armSwing;
      if (rightArmRef.current) rightArmRef.current.rotation.x = -armSwing;
      if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing;
      if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing;
    } else {
      // Reset to idle pose
      if (leftArmRef.current) leftArmRef.current.rotation.x *= 0.9;
      if (rightArmRef.current) rightArmRef.current.rotation.x *= 0.9;
      if (leftLegRef.current) leftLegRef.current.rotation.x *= 0.9;
      if (rightLegRef.current) rightLegRef.current.rotation.x *= 0.9;
    }
  });

  return (
    <group ref={groupRef} position={player.position}>
      {/* Player body - visitor style (different from workers) */}
      <group position={[0, 0, 0]}>
        {/* Torso */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.45, 0.75, 0.22]} />
          <meshStandardMaterial color={player.color} roughness={0.6} />
        </mesh>

        {/* Head */}
        <mesh position={[0, 1.7, 0]} castShadow>
          <sphereGeometry args={[0.14, 16, 16]} />
          <meshStandardMaterial color="#ffdbac" roughness={0.5} />
        </mesh>

        {/* Hair/cap (using player color) */}
        <mesh position={[0, 1.82, 0]} castShadow>
          <sphereGeometry args={[0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={player.color} roughness={0.7} />
        </mesh>

        {/* Left arm */}
        <group ref={leftArmRef} position={[-0.28, 1.25, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <boxGeometry args={[0.1, 0.45, 0.1]} />
            <meshStandardMaterial color={player.color} roughness={0.6} />
          </mesh>
        </group>

        {/* Right arm */}
        <group ref={rightArmRef} position={[0.28, 1.25, 0]}>
          <mesh position={[0, -0.22, 0]} castShadow>
            <boxGeometry args={[0.1, 0.45, 0.1]} />
            <meshStandardMaterial color={player.color} roughness={0.6} />
          </mesh>
        </group>

        {/* Legs */}
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.35, 0.5, 0.2]} />
          <meshStandardMaterial color="#374151" roughness={0.8} />
        </mesh>

        {/* Left leg */}
        <group ref={leftLegRef} position={[-0.1, 0.35, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <boxGeometry args={[0.12, 0.5, 0.12]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
        </group>

        {/* Right leg */}
        <group ref={rightLegRef} position={[0.1, 0.35, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <boxGeometry args={[0.12, 0.5, 0.12]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* Name tag billboard */}
      <Billboard position={[0, 2.1, 0]} follow lockX={false} lockY={false} lockZ={false}>
        {/* Background - guard against NaN from undefined name */}
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[(player.name?.length ?? 5) * 0.08 + 0.2, 0.25]} />
          <meshBasicMaterial color="#000000" opacity={0.7} transparent depthWrite={false} />
        </mesh>
        {/* Name text */}
        <Text
          fontSize={0.15}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.01}
          outlineColor="#000000"
        >
          {player.name}
        </Text>
      </Billboard>

      {/* Selection indicator when controlling a machine */}
      {player.selectedMachineId && (
        <mesh
          position={[0, FLOOR_LAYERS.safetyMain, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={RENDER_ORDER.floorEffects}
        >
          <ringGeometry args={[0.4, 0.5, 32]} />
          <meshBasicMaterial
            color={player.color}
            transparent
            opacity={0.6}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
            polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
          />
        </mesh>
      )}

      {/* Pointer light (subtle glow to make players visible) */}
      <pointLight
        position={[0, 1.5, 0]}
        color={player.color}
        intensity={0.3}
        distance={3}
        decay={2}
      />
    </group>
  );
});

RemotePlayerAvatar.displayName = 'RemotePlayerAvatar';
