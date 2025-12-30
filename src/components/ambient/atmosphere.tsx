import React, { useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useAmbientAnimation } from './shared';
import { WarningLight } from './safety';
import { FLOOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../../constants/renderLayers';

// ==========================================
// ATMOSPHERIC EFFECTS
// Lighting, steam, movement, and environmental effects
// ==========================================

export const GodRays: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
}> = ({ position, rotation = [0, 0, 0] }) => {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 100;

  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Distribute in a cone/beam shape
      const t = Math.random();
      const spread = t * 2; // Wider at bottom
      positions[i * 3] = (Math.random() - 0.5) * spread;
      positions[i * 3 + 1] = -t * 8; // Vertical beam
      positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      sizes[i] = 0.02 + Math.random() * 0.03;
    }

    return { positions, sizes };
  }, []);

  // God rays particle animation using centralized manager
  const animationId = useMemo(() => `god-rays-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!particlesRef.current) return;
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      // Slow floating motion
      positions[i * 3] += Math.sin(time * 0.3 + i) * 0.002;
      positions[i * 3 + 1] += 0.005;
      positions[i * 3 + 2] += Math.cos(time * 0.2 + i) * 0.002;

      // Reset when reaching top
      if (positions[i * 3 + 1] > 0) {
        const t = Math.random();
        const spread = t * 2;
        positions[i * 3] = (Math.random() - 0.5) * spread;
        positions[i * 3 + 1] = -8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
      }
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <group position={position} rotation={rotation}>
      {/* Light beam cone (volumetric effect) */}
      <mesh>
        <coneGeometry args={[2, 8, 16, 1, true]} />
        <meshBasicMaterial
          color="#fef3c7"
          transparent
          opacity={0.03}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Dust particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.05}
          color="#fef3c7"
          transparent
          opacity={0.4}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
};

// Graffiti / worker tags on walls

export const SteamVent: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const steamRef = useRef<THREE.Points>(null);
  const particleCount = 30;

  const particles = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities: number[] = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.2;
      positions[i * 3 + 1] = Math.random() * 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      velocities.push(0.01 + Math.random() * 0.02);
    }

    return { positions, velocities };
  }, []);

  // Steam particle animation using centralized manager
  const animationId = useMemo(() => `steam-vent-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, () => {
    if (!steamRef.current) return;
    const positions = steamRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 1] += particles.velocities[i];
      positions[i * 3] += (Math.random() - 0.5) * 0.01;

      if (positions[i * 3 + 1] > 1) {
        positions[i * 3] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      }
    }

    steamRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <group position={position}>
      {/* Vent pipe */}
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.3, 12]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Vent cap */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.12, 0.08, 0.1, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.5} />
      </mesh>

      {/* Steam particles */}
      <points ref={steamRef} position={[0, 0.25, 0]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          color="#e2e8f0"
          transparent
          opacity={0.3}
          sizeAttenuation
          depthWrite={false}
        />
      </points>
    </group>
  );
};

// Drainage grate in floor

export const FlickeringLight: React.FC<{ position: [number, number, number] }> = ({ position }) => {
  const lightRef = useRef<THREE.PointLight>(null);
  const tubeRef = useRef<THREE.Mesh>(null);
  const flickerState = useRef({ nextFlicker: 0, isFlickering: false, flickerEnd: 0 });

  // Flickering animation using centralized manager
  const animationId = useMemo(() => `flickering-light-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (!lightRef.current || !tubeRef.current) return;
    const mat = tubeRef.current.material as THREE.MeshStandardMaterial;

    // Random flickering behavior
    if (time > flickerState.current.nextFlicker && !flickerState.current.isFlickering) {
      if (Math.random() < 0.002) {
        // Rare flicker
        flickerState.current.isFlickering = true;
        flickerState.current.flickerEnd = time + 0.5 + Math.random() * 1;
      }
      flickerState.current.nextFlicker = time + 0.1;
    }

    if (flickerState.current.isFlickering) {
      if (time < flickerState.current.flickerEnd) {
        const flicker = Math.random() > 0.3 ? 1 : 0.1;
        lightRef.current.intensity = flicker * 2;
        mat.emissiveIntensity = flicker * 0.8;
      } else {
        flickerState.current.isFlickering = false;
        lightRef.current.intensity = 2;
        mat.emissiveIntensity = 0.8;
      }
    }
  });

  return (
    <group position={position}>
      {/* Light fixture housing */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[1.2, 0.08, 0.15]} />
        <meshStandardMaterial color="#374151" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Fluorescent tube */}
      <mesh ref={tubeRef} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 1, 8]} />
        <meshStandardMaterial color="#f5f5f5" emissive="#f5f5f5" emissiveIntensity={0.8} />
      </mesh>

      <pointLight
        ref={lightRef}
        position={[0, -0.1, 0]}
        color="#f5f5f5"
        intensity={2}
        distance={8}
      />
    </group>
  );
};

// Swinging chain with hook

export const SwingingChain: React.FC<{ position: [number, number, number]; length?: number }> = ({
  position,
  length = 3,
}) => {
  const chainRef = useRef<THREE.Group>(null);
  const swingSpeed = useRef(0.5 + Math.random() * 0.5);
  const swingAmount = useRef(0.05 + Math.random() * 0.1);

  // Swinging animation using centralized manager
  const animationId = useMemo(() => `swinging-chain-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (time) => {
    if (chainRef.current) {
      chainRef.current.rotation.z = Math.sin(time * swingSpeed.current) * swingAmount.current;
      chainRef.current.rotation.x =
        Math.cos(time * swingSpeed.current * 0.7) * swingAmount.current * 0.5;
    }
  });

  const links = Math.floor(length / 0.15);

  return (
    <group position={position}>
      {/* Ceiling mount */}
      <mesh>
        <cylinderGeometry args={[0.05, 0.05, 0.1, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.7} />
      </mesh>

      <group ref={chainRef}>
        {/* Chain links */}
        {Array.from({ length: links }).map((_, i) => (
          <mesh
            key={i}
            position={[0, -0.1 - i * 0.12, 0]}
            rotation={[0, i % 2 === 0 ? 0 : Math.PI / 2, 0]}
          >
            <torusGeometry args={[0.03, 0.008, 6, 12]} />
            <meshStandardMaterial color="#52525b" metalness={0.8} roughness={0.3} />
          </mesh>
        ))}

        {/* Hook at bottom */}
        <group position={[0, -length + 0.2, 0]}>
          <mesh rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.08, 0.015, 8, 16, Math.PI * 1.5]} />
            <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
            <meshStandardMaterial color="#374151" metalness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

// Electrical panel with occasional sparks

export const LoadingDockDoor: React.FC<{
  position: [number, number, number];
  isOpen: boolean;
  onToggle?: () => void;
}> = ({ position, isOpen, onToggle: _onToggle }) => {
  const doorRef = useRef<THREE.Group>(null);
  const currentOpenRef = useRef(0);
  const warningLightsActiveRef = useRef(false);
  const [warningActive, setWarningActive] = useState(false);
  const targetOpen = isOpen ? 1 : 0;

  const doorHeight = 6;
  const segments = 8;

  // Door animation using centralized manager
  const animationId = useMemo(() => `loading-door-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (_time, delta) => {
    const speed = 0.5;
    const diff = targetOpen - currentOpenRef.current;
    if (Math.abs(diff) > 0.01) {
      currentOpenRef.current += diff * speed * delta * 10;

      // Update door panel positions directly via refs
      if (doorRef.current) {
        doorRef.current.children.forEach((mesh, i) => {
          const segmentHeight = doorHeight / segments;
          const yOffset = currentOpenRef.current * doorHeight;
          const baseY = (i + 0.5) * segmentHeight;
          const y = Math.min(baseY + yOffset, doorHeight + 0.5);
          mesh.position.y = y;
          mesh.visible = y <= doorHeight + 0.3;
        });
      }

      // Update warning light state only when crossing thresholds
      const shouldBeActive = currentOpenRef.current > 0.1 && currentOpenRef.current < 0.9;
      if (shouldBeActive !== warningLightsActiveRef.current) {
        warningLightsActiveRef.current = shouldBeActive;
        setWarningActive(shouldBeActive);
      }
    }
  });

  return (
    <group position={position}>
      {/* Door frame */}
      <mesh position={[0, doorHeight / 2 + 0.1, 0]}>
        <boxGeometry args={[5.4, 0.2, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[-2.6, doorHeight / 2, 0]}>
        <boxGeometry args={[0.2, doorHeight, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[2.6, doorHeight / 2, 0]}>
        <boxGeometry args={[0.2, doorHeight, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
      </mesh>

      {/* Sectional door panels - positions updated via ref */}
      <group ref={doorRef}>
        {Array.from({ length: segments }).map((_, i) => {
          const segmentHeight = doorHeight / segments;
          const baseY = (i + 0.5) * segmentHeight;
          return (
            <mesh key={i} position={[0, baseY, 0.05]}>
              <boxGeometry args={[5, segmentHeight - 0.02, 0.1]} />
              <meshStandardMaterial
                color={i % 2 === 0 ? '#475569' : '#64748b'}
                metalness={0.4}
                roughness={0.6}
              />
            </mesh>
          );
        })}
      </group>

      {/* Door tracks */}
      {[-2.4, 2.4].map((x, i) => (
        <mesh key={i} position={[x, doorHeight / 2, 0.15]}>
          <boxGeometry args={[0.05, doorHeight + 1, 0.05]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} />
        </mesh>
      ))}

      {/* Warning lights */}
      <WarningLight position={[-2.3, doorHeight + 0.5, 0.2]} isActive={warningActive} />
      <WarningLight position={[2.3, doorHeight + 0.5, 0.2]} isActive={warningActive} />

      {/* Floor warning stripes */}
      <mesh
        position={[0, FLOOR_LAYERS.safetyMain, 1.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <planeGeometry args={[5, 3]} />
        <meshStandardMaterial
          color="#eab308"
          transparent
          opacity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>
    </group>
  );
};

// Warning light component

export const CondensationDrip: React.FC<{ position: [number, number, number] }> = ({
  position,
}) => {
  const dropRef = useRef<THREE.Mesh>(null);
  const dropYRef = useRef(0);
  const startY = 0;
  const endY = -3;

  // Drip animation using centralized manager
  const animationId = useMemo(() => `condensation-drip-${position.join(',')}`, [position]);

  useAmbientAnimation(animationId, (_time, delta) => {
    let newY = dropYRef.current - delta * 1.5;
    if (newY < endY) {
      // Reset with random delay
      newY = Math.random() > 0.98 ? startY : endY - 0.1;
    }
    dropYRef.current = newY;

    if (dropRef.current) {
      dropRef.current.position.y = newY;
      // Stretch as it falls
      const stretch = 1 + Math.abs(newY - startY) * 0.1;
      dropRef.current.scale.y = stretch;
      dropRef.current.visible = newY > endY;
    }
  });

  return (
    <group position={position}>
      {/* Water buildup on pipe */}
      <mesh position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.03, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#60a5fa"
          transparent
          opacity={0.6}
          metalness={0.8}
          roughness={0.1}
        />
      </mesh>

      {/* Falling drop */}
      <mesh ref={dropRef} position={[0, 0, 0]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial
          color="#60a5fa"
          transparent
          opacity={0.7}
          metalness={0.8}
          roughness={0.1}
        />
      </mesh>
    </group>
  );
};

// Audio-reactive equipment vibration
