import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { shouldRunThisFrame } from '../../utils/frameThrottle';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

interface LoadingAnimationProps {
  dockPosition: [number, number, number];
  isActive: boolean;
  cycleOffset: number;
}

/**
 * LoadingAnimation - Animated forklift and pallets for dock loading
 */
export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  dockPosition,
  isActive,
  cycleOffset,
}) => {
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const forkliftRef = useRef<THREE.Group>(null);
  const forkRef = useRef<THREE.Group>(null);
  const palletRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!isTabVisible) return;
    if (!shouldRunThisFrame(2)) return;
    if (!isActive || !forkliftRef.current || !forkRef.current || !palletRef.current) return;

    const time = state.clock.elapsedTime + cycleOffset;
    const cycle = (time * 0.5) % 10;

    // Forklift movement cycle:
    // 0-2: Move to staging area
    // 2-4: Lift pallet
    // 4-6: Move to truck
    // 6-8: Lower pallet
    // 8-10: Return to start

    if (cycle < 2) {
      const t = cycle / 2;
      forkliftRef.current.position.x = THREE.MathUtils.lerp(
        dockPosition[0],
        dockPosition[0] - 6,
        t
      );
      forkliftRef.current.position.z = dockPosition[2];
      forkRef.current.position.y = 0;
      palletRef.current.visible = false;
    } else if (cycle < 4) {
      const t = (cycle - 2) / 2;
      forkliftRef.current.position.x = dockPosition[0] - 6;
      forkliftRef.current.position.z = dockPosition[2];
      forkRef.current.position.y = THREE.MathUtils.lerp(0, 1, t);
      palletRef.current.visible = t > 0.2;
      palletRef.current.position.y = forkRef.current.position.y + 0.1;
    } else if (cycle < 6) {
      const t = (cycle - 4) / 2;
      forkliftRef.current.position.x = THREE.MathUtils.lerp(
        dockPosition[0] - 6,
        dockPosition[0],
        t
      );
      forkliftRef.current.position.z = dockPosition[2];
      forkRef.current.position.y = 1;
      palletRef.current.visible = true;
      palletRef.current.position.y = 1.1;
    } else if (cycle < 8) {
      const t = (cycle - 6) / 2;
      forkliftRef.current.position.x = dockPosition[0];
      forkliftRef.current.position.z = dockPosition[2];
      forkRef.current.position.y = THREE.MathUtils.lerp(1, 0, t);
      palletRef.current.visible = true;
      palletRef.current.position.y = forkRef.current.position.y + 0.1;
    } else {
      const t = (cycle - 8) / 2;
      forkliftRef.current.position.x = THREE.MathUtils.lerp(
        dockPosition[0],
        dockPosition[0] - 6,
        t
      );
      forkliftRef.current.position.z = dockPosition[2];
      forkRef.current.position.y = 0;
      palletRef.current.visible = false;
    }
  });

  if (!isActive) return null;

  return (
    <group>
      {/* Forklift */}
      <group ref={forkliftRef} position={[dockPosition[0], dockPosition[1], dockPosition[2]]}>
        {/* Body */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[1.2, 1, 1.5]} />
          <meshStandardMaterial
            color="#f97316"
            roughness={0.6}
            normalMap={PROCEDURAL_TEXTURES.paintedMetalNormal}
            normalScale={new THREE.Vector2(0.12, 0.12)}
          />
        </mesh>

        {/* Mast */}
        <mesh position={[0, 1.5, 0.5]} castShadow>
          <boxGeometry args={[0.8, 2, 0.1]} />
          <meshStandardMaterial
            color="#374151"
            metalness={0.6}
            roughness={0.4}
            normalMap={PROCEDURAL_TEXTURES.brushedMetal}
            normalScale={new THREE.Vector2(0.15, 0.15)}
          />
        </mesh>

        {/* Forks */}
        <group ref={forkRef} position={[0, 0.5, 0.6]}>
          {[-0.2, 0.2].map((x, i) => (
            <mesh key={i} position={[x, 0, 0.5]}>
              <boxGeometry args={[0.12, 0.08, 1]} />
              <meshStandardMaterial
                color="#64748b"
                metalness={0.7}
                roughness={0.3}
                normalMap={PROCEDURAL_TEXTURES.brushedMetal}
                normalScale={new THREE.Vector2(0.2, 0.2)}
              />
            </mesh>
          ))}
        </group>

        {/* Wheels */}
        {[
          [-0.4, -0.4],
          [0.4, -0.4],
          [-0.4, 0.4],
          [0.4, 0.4],
        ].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.2, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 0.15, 12]} />
            <meshStandardMaterial
              color="#1f2937"
              roughness={0.7}
              normalMap={PROCEDURAL_TEXTURES.rubberNormal}
              normalScale={new THREE.Vector2(0.3, 0.3)}
            />
          </mesh>
        ))}
      </group>

      {/* Pallet (attached to forklift forks) */}
      <mesh
        ref={palletRef}
        position={[dockPosition[0], dockPosition[1] + 0.6, dockPosition[2] + 1.1]}
        castShadow
      >
        <boxGeometry args={[1, 0.15, 1]} />
        <meshStandardMaterial color="#78350f" roughness={0.9} />
      </mesh>
    </group>
  );
};
