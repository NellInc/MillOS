/**
 * MachineLockIndicator - Shows when a machine is being controlled by another player
 *
 * Renders a colored ring and player name when a remote player has selected a machine.
 */

import React, { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { SceneText as Text } from '../shared/SceneText';
import { useMachineLockHolder, useMachineLockedByOther } from '../../multiplayer';
import { useMultiplayerStore, useIsMultiplayerActive } from '../../stores/multiplayerStore';
import { INDICATOR_HEIGHTS, POLYGON_OFFSET } from '../../constants/renderLayers';

interface MachineLockIndicatorProps {
  machineId: string;
  position: [number, number, number];
  size?: [number, number, number]; // Machine size for scaling the indicator
}

export const MachineLockIndicator: React.FC<MachineLockIndicatorProps> = ({
  machineId,
  position,
  size = [2, 2, 2],
}) => {
  const isMultiplayerActive = useIsMultiplayerActive();
  const isLockedByOther = useMachineLockedByOther(machineId);
  const lockHolderName = useMachineLockHolder(machineId);
  const localPlayerId = useMultiplayerStore((s) => s.localPlayerId);
  const lockHolderId = useMultiplayerStore((s) => s.machineLocks.get(machineId));

  // Get the color of the player who has the lock
  const lockHolderColor = useMultiplayerStore((s) => {
    if (!lockHolderId) return null;
    if (lockHolderId === s.localPlayerId) return s.localPlayerColor;
    const player = s._remotePlayersArray.find((p) => p.id === lockHolderId);
    return player?.color ?? '#ffffff';
  });

  // Calculate ring size based on machine size
  const ringRadius = useMemo(() => {
    const maxDimension = Math.max(size[0], size[2]);
    return maxDimension * 0.6;
  }, [size]);

  // Don't render if multiplayer is not active or no lock
  if (!isMultiplayerActive || !lockHolderId) {
    return null;
  }

  const isOwnLock = lockHolderId === localPlayerId;

  return (
    <group position={[position[0], INDICATOR_HEIGHTS.machineRing, position[2]]}>
      {/* Lock ring on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ringRadius - 0.15, ringRadius, 64]} />
        <meshBasicMaterial
          color={lockHolderColor ?? '#ffffff'}
          transparent
          opacity={isOwnLock ? 0.3 : 0.5}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>

      {/* Pulsing inner ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[ringRadius - 0.3, ringRadius - 0.15, 64]} />
        <meshBasicMaterial
          color={lockHolderColor ?? '#ffffff'}
          transparent
          opacity={isOwnLock ? 0.2 : 0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>

      {/* Show player name only if locked by someone else */}
      {isLockedByOther && lockHolderName && (
        <Billboard position={[0, size[1] + 0.5, 0]}>
          {/* Background */}
          <mesh position={[0, 0, -0.01]}>
            <planeGeometry args={[lockHolderName.length * 0.12 + 0.4, 0.35]} />
            <meshBasicMaterial color={lockHolderColor ?? '#000000'} opacity={0.85} transparent />
          </mesh>
          {/* Text */}
          <Text
            fontSize={0.2}
            color="white"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#000000"
          >
            {lockHolderName}
          </Text>
        </Billboard>
      )}
    </group>
  );
};

MachineLockIndicator.displayName = 'MachineLockIndicator';

/**
 * Hook to use in machine click handlers - prevents interaction if locked by another
 */
export function useCanControlMachine(machineId: string): {
  canControl: boolean;
  lockHolderName: string | null;
} {
  const isLockedByOther = useMachineLockedByOther(machineId);
  const lockHolderName = useMachineLockHolder(machineId);

  return {
    canControl: !isLockedByOther,
    lockHolderName: isLockedByOther ? lockHolderName : null,
  };
}
