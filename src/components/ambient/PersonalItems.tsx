import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { POLYGON_OFFSET } from '../../constants/renderLayers';

// ==========================================
// PERSONAL ITEMS
// Worker belongings and personal effects
// ==========================================

export const JacketOnHook: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#1e3a8a',
}) => {
  const jacketRef = useRef<THREE.Group>(null);

  // Gentle sway using centralized manager
  const animationId = useMemo(() => `jacket-hook-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (jacketRef.current) {
      jacketRef.current.rotation.z = Math.sin(time * 0.5) * 0.02;
    }
  });

  return (
    <group position={position}>
      {/* Hook */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[0.04, 0.04, 0.03]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} />
      </mesh>
      <mesh position={[0, -0.03, 0.02]} rotation={[0.5, 0, 0]}>
        <torusGeometry args={[0.025, 0.006, 6, 12, Math.PI]} />
        <meshStandardMaterial color="#52525b" metalness={0.7} />
      </mesh>

      {/* Jacket */}
      <group ref={jacketRef} position={[0, -0.15, 0.02]}>
        {/* Body */}
        <mesh>
          <boxGeometry args={[0.25, 0.35, 0.08]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Collar */}
        <mesh position={[0, 0.18, 0.02]}>
          <boxGeometry args={[0.15, 0.05, 0.04]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Sleeves drooping */}
        <mesh position={[-0.15, 0.05, 0]} rotation={[0, 0, 0.3]}>
          <cylinderGeometry args={[0.04, 0.035, 0.25, 8]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        <mesh position={[0.15, 0.05, 0]} rotation={[0, 0, -0.3]}>
          <cylinderGeometry args={[0.04, 0.035, 0.25, 8]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
};

// Umbrella in corner

export const UmbrellaCorner: React.FC<{ position: [number, number, number]; color?: string }> = ({
  position,
  color = '#1e293b',
}) => {
  return (
    <group position={position} rotation={[0.15, 0, 0.1]}>
      {/* Shaft */}
      <mesh position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 0.8, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.6} />
      </mesh>
      {/* Handle (J-shaped) */}
      <mesh position={[0.03, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.04, 0.012, 8, 12, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      {/* Ferrule (tip) */}
      <mesh position={[0, 0.82, 0]}>
        <coneGeometry args={[0.008, 0.03, 8]} />
        <meshStandardMaterial color="#71717a" metalness={0.7} />
      </mesh>
      {/* Canopy (collapsed) */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.025, 0.015, 0.35, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Velcro strap */}
      <mesh position={[0, 0.55, 0.02]}>
        <boxGeometry args={[0.015, 0.03, 0.005]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
    </group>
  );
};

// Lunch bag

export const LunchBag: React.FC<{
  position: [number, number, number];
  type?: 'paper' | 'cooler' | 'box';
}> = ({ position, type = 'paper' }) => {
  return (
    <group position={position}>
      {type === 'paper' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.12, 0.2, 0.08]} />
            <meshStandardMaterial color="#d4a574" roughness={0.95} />
          </mesh>
          {/* Folded top */}
          <mesh position={[0, 0.18, 0]} rotation={[0.2, 0, 0]}>
            <boxGeometry args={[0.12, 0.04, 0.02]} />
            <meshStandardMaterial color="#c49a6c" roughness={0.95} />
          </mesh>
        </>
      )}
      {type === 'cooler' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.18, 0.15, 0.12]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.6} />
          </mesh>
          {/* Lid */}
          <mesh position={[0, 0.18, 0]}>
            <boxGeometry args={[0.19, 0.02, 0.13]} />
            <meshStandardMaterial color="#3b82f6" roughness={0.5} />
          </mesh>
          {/* Handle */}
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.08, 0.015, 0.02]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </>
      )}
      {type === 'box' && (
        <>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.15, 0.1, 0.1]} />
            <meshStandardMaterial color="#ef4444" roughness={0.5} />
          </mesh>
          {/* Lid clip */}
          <mesh position={[0, 0.11, 0.05]}>
            <boxGeometry args={[0.04, 0.02, 0.01]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
        </>
      )}
    </group>
  );
};

// Water bottle

export const WaterBottle: React.FC<{
  position: [number, number, number];
  type?: 'plastic' | 'metal' | 'sports';
}> = ({ position, type = 'plastic' }) => {
  return (
    <group position={position}>
      {type === 'plastic' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.03, 0.035, 0.2, 12]} />
            <meshStandardMaterial color="#93c5fd" transparent opacity={0.7} roughness={0.2} />
          </mesh>
          {/* Water inside */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.028, 0.033, 0.12, 12]} />
            <meshStandardMaterial color="#60a5fa" transparent opacity={0.5} />
          </mesh>
          {/* Cap */}
          <mesh position={[0, 0.21, 0]}>
            <cylinderGeometry args={[0.02, 0.025, 0.025, 12]} />
            <meshStandardMaterial color="#3b82f6" roughness={0.4} />
          </mesh>
        </>
      )}
      {type === 'metal' && (
        <>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.24, 16]} />
            <meshStandardMaterial color="#71717a" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.025, 0.03, 0.03, 16]} />
            <meshStandardMaterial color="#52525b" metalness={0.7} />
          </mesh>
        </>
      )}
      {type === 'sports' && (
        <>
          <mesh position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.04, 0.035, 0.2, 12]} />
            <meshStandardMaterial color="#22c55e" roughness={0.5} />
          </mesh>
          {/* Squeeze top */}
          <mesh position={[0, 0.21, 0]}>
            <cylinderGeometry args={[0.015, 0.025, 0.03, 12]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          {/* Pull spout */}
          <mesh position={[0, 0.24, 0.01]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.02, 8]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
        </>
      )}
    </group>
  );
};

// Folded newspaper

export const FoldedNewspaper: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  return (
    <group position={position} rotation={rotation}>
      {/* Folded newspaper stack */}
      <mesh>
        <boxGeometry args={[0.25, 0.02, 0.18]} />
        <meshStandardMaterial color="#f5f5f4" roughness={0.9} />
      </mesh>
      {/* Fold crease shadow */}
      <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.25, 0.005]} />
        <meshBasicMaterial
          color="#d4d4d4"
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.subtle.factor}
          polygonOffsetUnits={POLYGON_OFFSET.subtle.units}
        />
      </mesh>
      {/* Text impression lines */}
      {[-0.06, -0.02, 0.02, 0.06].map((z, i) => (
        <mesh key={i} position={[-0.05, 0.011, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 0.008]} />
          <meshBasicMaterial
            color="#a3a3a3"
            transparent
            opacity={0.4}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.subtle.factor}
            polygonOffsetUnits={POLYGON_OFFSET.subtle.units}
          />
        </mesh>
      ))}
    </group>
  );
};

// ==========================================
// WORK IN PROGRESS
// ==========================================

// Sawhorse with caution tape

export const CoffeeCup: React.FC<{
  position: [number, number, number];
  type?: 'cup' | 'thermos' | 'mug';
}> = ({ position, type = 'cup' }) => {
  return (
    <group position={position}>
      {type === 'cup' && (
        <>
          {/* Paper cup */}
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.035, 0.03, 0.12, 12]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.8} />
          </mesh>
          {/* Coffee ring stain */}
          <mesh position={[0.06, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.025, 0.04, 12]} />
            <meshStandardMaterial
              color="#78350f"
              transparent
              opacity={0.3}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.strong.factor}
              polygonOffsetUnits={POLYGON_OFFSET.strong.units}
            />
          </mesh>
        </>
      )}

      {type === 'thermos' && (
        <>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.24, 12]} />
            <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.035, 0.04, 0.03, 12]} />
            <meshStandardMaterial color="#ef4444" roughness={0.4} />
          </mesh>
        </>
      )}

      {type === 'mug' && (
        <>
          <mesh position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.04, 0.035, 0.1, 12]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.6} />
          </mesh>
          {/* Handle */}
          <mesh position={[0.05, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.025, 0.008, 6, 12, Math.PI]} />
            <meshStandardMaterial color="#f5f5f5" roughness={0.6} />
          </mesh>
          {/* Coffee inside */}
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 12]} />
            <meshStandardMaterial color="#3f2305" roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
};

// First aid kit wall box
