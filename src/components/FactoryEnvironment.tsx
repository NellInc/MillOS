/**
 * Factory Environment System
 *
 * Handles the "Handyman" equivalent for the grain mill:
 * - Factory plants (workers like plants!)
 * - Visible dust accumulation
 * - Maintenance tasks visualization
 * - Coffee machine status
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useWorkerMoodStore } from '../stores/workerMoodStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { FactoryPlant, GraphicsQuality } from '../types';
import { shouldRunThisFrame, getThrottleLevel } from '../utils/frameThrottle';
import { PLANT_MATERIALS, getHealthMaterial } from '../utils/sharedMaterials';

// =========================================================================
// FACTORY PLANTS - Workers like plants!
// =========================================================================

interface PlantProps {
  plant: FactoryPlant;
}

const PottedFern: React.FC<PlantProps> = React.memo(({ plant }) => {
  const groupRef = useRef<THREE.Group>(null);
  const leavesRef = useRef<THREE.Group>(null);

  // Subscribe at component level
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Store in refs for useFrame access
  const isTabVisibleRef = useRef(isTabVisible);
  const qualityRef = useRef<GraphicsQuality>(quality);

  useEffect(() => {
    isTabVisibleRef.current = isTabVisible;
  }, [isTabVisible]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useFrame((state) => {
    if (!isTabVisibleRef.current) return;
    // PERFORMANCE: Throttle plant swaying based on quality - doesn't need 60fps
    const throttle = getThrottleLevel(qualityRef.current);
    if (!shouldRunThisFrame(throttle)) return;

    if (leavesRef.current) {
      // Gentle swaying
      leavesRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    }
  });

  // Get cached health material instead of creating inline
  const healthMaterial = getHealthMaterial(plant.health);

  return (
    <group ref={groupRef} position={plant.position}>
      {/* Pot */}
      <mesh position={[0, 0.1, 0]} castShadow material={PLANT_MATERIALS.pot}>
        <cylinderGeometry args={[0.15, 0.12, 0.2, 12]} />
      </mesh>

      {/* Soil */}
      <mesh position={[0, 0.18, 0]} material={PLANT_MATERIALS.soil}>
        <cylinderGeometry args={[0.13, 0.13, 0.04, 12]} />
      </mesh>

      {/* Fern leaves */}
      <group ref={leavesRef} position={[0, 0.25, 0]}>
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * Math.PI * 2;
          const tilt = 0.4 + Math.random() * 0.3;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * 0.05, 0.1, Math.sin(angle) * 0.05]}
              rotation={[tilt, angle, 0]}
              castShadow
              material={healthMaterial}
            >
              <capsuleGeometry args={[0.015, 0.25, 4, 8]} />
            </mesh>
          );
        })}
      </group>

      {/* Plant name tag */}
      {plant.name && (
        <Billboard position={[0, 0.6, 0]}>
          <Text fontSize={0.08} color="#6b7280" anchorX="center">
            {plant.name}
          </Text>
        </Billboard>
      )}

      {/* Water needed indicator */}
      {plant.health < 40 && (
        <Billboard position={[0.2, 0.4, 0]}>
          <Text fontSize={0.1} color="#3b82f6" anchorX="center">
            {String.fromCharCode(128167)} {/* Water drop emoji workaround - use icon instead */}
          </Text>
        </Billboard>
      )}
    </group>
  );
});
PottedFern.displayName = 'PottedFern';

const DeskSucculent: React.FC<PlantProps> = React.memo(({ plant }) => {
  const healthMaterial = getHealthMaterial(plant.health);

  return (
    <group position={plant.position}>
      {/* Small pot - white ceramic */}
      <mesh position={[0, 0.04, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.05, 0.08, 8]} />
        <meshStandardMaterial color="#e5e5e5" roughness={0.5} />
      </mesh>

      {/* Succulent body */}
      <mesh position={[0, 0.1, 0]} castShadow material={healthMaterial}>
        <sphereGeometry args={[0.05, 8, 8]} />
      </mesh>

      {/* Succulent leaves */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * 0.04, 0.12, Math.sin(angle) * 0.04]}
            rotation={[0.3, angle, 0]}
            material={healthMaterial}
          >
            <sphereGeometry args={[0.025, 6, 6]} />
          </mesh>
        );
      })}

      {plant.name && (
        <Billboard position={[0, 0.25, 0]}>
          <Text fontSize={0.06} color="#6b7280" anchorX="center">
            {plant.name}
          </Text>
        </Billboard>
      )}
    </group>
  );
});
DeskSucculent.displayName = 'DeskSucculent';

const TallPalm: React.FC<PlantProps> = React.memo(({ plant }) => {
  const leavesRef = useRef<THREE.Group>(null);

  // Subscribe at component level
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Store in refs for useFrame access
  const isTabVisibleRef = useRef(isTabVisible);
  const qualityRef = useRef<GraphicsQuality>(quality);

  useEffect(() => {
    isTabVisibleRef.current = isTabVisible;
  }, [isTabVisible]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useFrame((state) => {
    if (!isTabVisibleRef.current) return;
    // PERFORMANCE: Throttle palm rotation based on quality - doesn't need 60fps
    const throttle = getThrottleLevel(qualityRef.current);
    if (!shouldRunThisFrame(throttle)) return;

    if (leavesRef.current) {
      leavesRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    }
  });

  const healthMaterial = getHealthMaterial(plant.health);

  return (
    <group position={plant.position}>
      {/* Large pot */}
      <mesh position={[0, 0.2, 0]} castShadow material={PLANT_MATERIALS.barkDark}>
        <cylinderGeometry args={[0.25, 0.2, 0.4, 12]} />
      </mesh>

      {/* Trunk */}
      <mesh position={[0, 0.8, 0]} castShadow material={PLANT_MATERIALS.woodPale}>
        <cylinderGeometry args={[0.06, 0.08, 1, 8]} />
      </mesh>

      {/* Palm leaves */}
      <group ref={leavesRef} position={[0, 1.3, 0]}>
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i / 6) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * 0.1, 0, Math.sin(angle) * 0.1]}
              rotation={[0.6, angle, 0]}
              castShadow
              material={healthMaterial}
            >
              <capsuleGeometry args={[0.03, 0.5, 4, 8]} />
            </mesh>
          );
        })}
      </group>

      {plant.name && (
        <Billboard position={[0, 1.7, 0]}>
          <Text fontSize={0.1} color="#6b7280" anchorX="center">
            {plant.name}
          </Text>
        </Billboard>
      )}
    </group>
  );
});
TallPalm.displayName = 'TallPalm';

const HangingIvy: React.FC<PlantProps> = React.memo(({ plant }) => {
  const vinesRef = useRef<THREE.Group>(null);

  // Subscribe at component level
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Store in refs for useFrame access
  const isTabVisibleRef = useRef(isTabVisible);
  const qualityRef = useRef<GraphicsQuality>(quality);

  useEffect(() => {
    isTabVisibleRef.current = isTabVisible;
  }, [isTabVisible]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useFrame((state) => {
    if (!isTabVisibleRef.current) return;
    // PERFORMANCE: Throttle vine swaying based on quality - doesn't need 60fps
    const throttle = getThrottleLevel(qualityRef.current);
    if (!shouldRunThisFrame(throttle)) return;

    if (vinesRef.current) {
      vinesRef.current.children.forEach((vine, i) => {
        vine.rotation.z = Math.sin(state.clock.elapsedTime * 0.5 + i * 0.5) * 0.1;
      });
    }
  });

  const healthMaterial = getHealthMaterial(plant.health);

  return (
    <group position={plant.position}>
      {/* Hanging pot */}
      <mesh position={[0, 2.5, 0]} castShadow material={PLANT_MATERIALS.hay}>
        <cylinderGeometry args={[0.12, 0.1, 0.15, 8]} />
      </mesh>

      {/* Hanging vines */}
      <group ref={vinesRef} position={[0, 2.4, 0]}>
        {Array.from({ length: 5 }).map((_, i) => {
          const angle = (i / 5) * Math.PI * 2;
          const length = 0.5 + Math.random() * 0.5;
          return (
            <group key={i} position={[Math.cos(angle) * 0.08, 0, Math.sin(angle) * 0.08]}>
              <mesh rotation={[0.2, 0, 0]} material={healthMaterial}>
                <cylinderGeometry args={[0.008, 0.005, length, 4]} />
              </mesh>
              {/* Leaves along vine */}
              {Array.from({ length: 4 }).map((_, j) => (
                <mesh key={j} position={[0, -0.1 - j * 0.12, 0.02]} material={healthMaterial}>
                  <sphereGeometry args={[0.02, 4, 4]} />
                </mesh>
              ))}
            </group>
          );
        })}
      </group>

      {plant.name && (
        <Billboard position={[0, 2.7, 0]}>
          <Text fontSize={0.08} color="#6b7280" anchorX="center">
            {plant.name}
          </Text>
        </Billboard>
      )}
    </group>
  );
});
HangingIvy.displayName = 'HangingIvy';

const PlantRenderer: React.FC<{ plant: FactoryPlant }> = ({ plant }) => {
  switch (plant.type) {
    case 'potted_fern':
      return <PottedFern plant={plant} />;
    case 'desk_succulent':
      return <DeskSucculent plant={plant} />;
    case 'tall_palm':
      return <TallPalm plant={plant} />;
    case 'hanging_ivy':
      return <HangingIvy plant={plant} />;
    default:
      return <PottedFern plant={plant} />;
  }
};

// =========================================================================
// DUST ACCUMULATION VISUAL
// =========================================================================

const DustLayer: React.FC<{ dustLevel: number }> = React.memo(({ dustLevel }) => {
  const dustRef = useRef<THREE.Points>(null);

  const particleCount = Math.floor(dustLevel * 5); // More dust = more particles
  const positions = useMemo(() => {
    const arr = new Float32Array(Math.max(particleCount, 1) * 3);
    for (let i = 0; i < particleCount; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 60;
      arr[i * 3 + 1] = 0.02 + Math.random() * 0.05;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    return arr;
  }, [particleCount]);

  if (dustLevel < 10) return null;

  return (
    <points ref={dustRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#a08060"
        size={0.1}
        transparent
        opacity={Math.min(0.4, dustLevel / 100)}
        sizeAttenuation
      />
    </points>
  );
});
DustLayer.displayName = 'DustLayer';

// =========================================================================
// COFFEE MACHINE
// =========================================================================

interface CoffeeMachineProps {
  position: [number, number, number];
  status: 'working' | 'broken' | 'empty' | 'brewing';
}

const CoffeeMachine: React.FC<CoffeeMachineProps> = React.memo(({ position, status }) => {
  const steamRef = useRef<THREE.Points>(null);
  const lightRef = useRef<THREE.Mesh>(null);

  // Subscribe at component level
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);
  const quality = useGraphicsStore((state) => state.graphics.quality);

  // Store in refs for useFrame access
  const isTabVisibleRef = useRef(isTabVisible);
  const qualityRef = useRef<GraphicsQuality>(quality);

  useEffect(() => {
    isTabVisibleRef.current = isTabVisible;
  }, [isTabVisible]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  const steamPositions = useMemo(() => {
    const arr = new Float32Array(20 * 3);
    for (let i = 0; i < 20; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 0.1;
      arr[i * 3 + 1] = Math.random() * 0.3;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.1;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!isTabVisibleRef.current) return;
    // PERFORMANCE: Throttle coffee machine animations based on quality
    const throttle = getThrottleLevel(qualityRef.current);
    if (!shouldRunThisFrame(throttle)) return;

    if (steamRef.current && status === 'brewing') {
      const geo = steamRef.current.geometry;
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, (pos.getY(i) + 0.02) % 0.3);
      }
      pos.needsUpdate = true;
    }

    if (lightRef.current) {
      const color =
        status === 'working'
          ? '#22c55e'
          : status === 'brewing'
            ? '#3b82f6'
            : status === 'empty'
              ? '#eab308'
              : '#ef4444';
      (lightRef.current.material as THREE.MeshBasicMaterial).color.set(color);

      if (status === 'brewing') {
        lightRef.current.scale.setScalar(0.8 + Math.sin(state.clock.elapsedTime * 4) * 0.2);
      }
    }
  });

  const statusLabels = {
    working: 'READY',
    brewing: 'BREWING...',
    empty: 'NEEDS BEANS',
    broken: 'OUT OF ORDER',
  };

  return (
    <group position={position}>
      {/* Machine body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.8, 0.4]} />
        <meshStandardMaterial color="#2d2d2d" roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Coffee dispensers */}
      <mesh position={[-0.1, 0.3, 0.21]}>
        <cylinderGeometry args={[0.03, 0.02, 0.1, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} />
      </mesh>
      <mesh position={[0.1, 0.3, 0.21]}>
        <cylinderGeometry args={[0.03, 0.02, 0.1, 8]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.8} />
      </mesh>

      {/* Status light */}
      <mesh ref={lightRef} position={[0.15, 0.75, 0.21]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>

      {/* Display screen */}
      <mesh position={[0, 0.65, 0.21]}>
        <planeGeometry args={[0.2, 0.08]} />
        <meshBasicMaterial color={status === 'broken' ? '#ef4444' : '#1e40af'} />
      </mesh>

      {/* Steam when brewing */}
      {status === 'brewing' && (
        <points ref={steamRef} position={[0, 0.9, 0.1]}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[steamPositions, 3]} />
          </bufferGeometry>
          <pointsMaterial color="#ffffff" size={0.03} transparent opacity={0.5} sizeAttenuation />
        </points>
      )}

      {/* Status label */}
      <Billboard position={[0, 1.1, 0]}>
        <Text
          fontSize={0.08}
          color={status === 'broken' ? '#ef4444' : status === 'empty' ? '#eab308' : '#22c55e'}
          anchorX="center"
        >
          {statusLabels[status]}
        </Text>
      </Billboard>
    </group>
  );
});
CoffeeMachine.displayName = 'CoffeeMachine';

// =========================================================================
// MAIN FACTORY ENVIRONMENT COMPONENT
// =========================================================================

export const FactoryEnvironmentSystem: React.FC = () => {
  const factoryEnvironment = useWorkerMoodStore((state) => state.factoryEnvironment);

  return (
    <group>
      {/* Render all plants */}
      {factoryEnvironment.plants.map((plant) => (
        <PlantRenderer key={plant.id} plant={plant} />
      ))}

      {/* Dust layer */}
      <DustLayer dustLevel={factoryEnvironment.dustLevel} />

      {/* Coffee machine */}
      <CoffeeMachine position={[-18, 0, 12]} status={factoryEnvironment.coffeeMachineStatus} />
    </group>
  );
};

export default FactoryEnvironmentSystem;
