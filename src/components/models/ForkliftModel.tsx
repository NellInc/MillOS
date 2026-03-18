/**
 * Forklift 3D Model Component
 *
 * Uses GLTF model if available at /public/models/forklift/forklift.glb
 * Falls back to procedural primitives otherwise.
 *
 * Recommended free CC0/public domain models:
 * - Poly.pizza: https://poly.pizza/search/forklift (CC0, properly scaled)
 * - Quaternius: https://quaternius.com/ (vehicle packs, CC0)
 * - TurboSquid free section: https://www.turbosquid.com/Search/3D-Models/free/forklift
 * - RigModels: https://rigmodels.com/index.php?searchkeyword=forklift (GLB available)
 *
 * Scale notes:
 * - Models should be ~2-3 units tall for proper scene integration
 * - If model is in centimeters, use scale ~0.01
 * - If model is tiny (like toy models), use scale ~15
 * - Adjust FORKLIFT_MODEL_SCALE constant below for your model
 */

// Adjust this based on your model's native scale
// Common values: 0.01 (cm model), 1.0 (meter model), 15 (tiny model)
const FORKLIFT_MODEL_SCALE = 15;

import React, { useRef, Suspense } from 'react';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useModelAvailable, MODEL_PATHS } from '../../utils/modelLoader';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// Cargo fade-in duration in seconds (fast for smooth but minimal overhead)
const CARGO_FADE_DURATION = 0.25;

interface ForkliftModelProps {
  hasCargo: boolean;
  isMoving: boolean;
  speedMultiplier?: number;
  forkHeightRef?: React.MutableRefObject<number>; // Ref for fork animation - avoids re-renders
}

// GLTF Model version
const GLTFForklift: React.FC<ForkliftModelProps> = ({
  hasCargo,
  isMoving,
  speedMultiplier = 1,
  forkHeightRef,
}) => {
  const { scene } = useDracoGLTF(MODEL_PATHS.forklift);
  const modelRef = useRef<THREE.Group>(null);
  const cargoRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Cargo fade-in refs (no re-renders)
  const cargoOpacityRef = useRef(hasCargo ? 1 : 0);
  const prevHasCargoRef = useRef(hasCargo);
  const cargoMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // Clone the scene and enable shadows
  const clonedScene = React.useMemo(() => {
    const clone = scene.clone();
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);

  // Animate wheels if moving and update fork height from ref
  useFrame((_, delta) => {
    if (!isTabVisible) return;
    if (!modelRef.current) return;

    // Update fork height directly from ref (no re-render needed)
    if (cargoRef.current && forkHeightRef) {
      cargoRef.current.position.y = 1.2 + forkHeightRef.current;
    }

    // Cargo fade-in animation (ref-based, no re-renders)
    if (hasCargo && !prevHasCargoRef.current) {
      cargoOpacityRef.current = 0;
    }
    prevHasCargoRef.current = hasCargo;

    const targetOpacity = hasCargo ? 1 : 0;
    if (cargoOpacityRef.current !== targetOpacity) {
      const fadeSpeed = 1 / CARGO_FADE_DURATION;
      if (hasCargo) {
        cargoOpacityRef.current = Math.min(1, cargoOpacityRef.current + delta * fadeSpeed);
      } else {
        cargoOpacityRef.current = 0;
      }
      const opacity = cargoOpacityRef.current;
      cargoMaterialsRef.current.forEach((mat) => {
        if (mat) {
          mat.opacity = opacity;
          mat.visible = opacity > 0.01;
        }
      });
    }

    if (!isMoving) return;

    // Find wheel meshes and rotate them
    modelRef.current.traverse((child) => {
      const name = child.name.toLowerCase();
      if (name.includes('wheel') || name.includes('tire')) {
        (child as THREE.Mesh).rotation.x += delta * 5 * speedMultiplier;
      }
    });
  });

  return (
    <group ref={modelRef}>
      {/* Scale and position the model appropriately - adjust FORKLIFT_MODEL_SCALE for your model */}
      <primitive
        object={clonedScene}
        scale={FORKLIFT_MODEL_SCALE}
        position={[0, 0.3, 0]}
        rotation={[0, Math.PI, 0]}
      />
      {/* Add cargo on top if needed - always mounted, opacity animated */}
      <group
        ref={cargoRef}
        position={[0, 1.2, 1.5]}
        visible={hasCargo || cargoOpacityRef.current > 0.01}
      >
        <mesh castShadow>
          <boxGeometry args={[1, 0.15, 1]} />
          <meshStandardMaterial
            ref={(mat) => {
              if (mat) cargoMaterialsRef.current[0] = mat;
            }}
            color="#a16207"
            transparent
            opacity={cargoOpacityRef.current}
          />
        </mesh>
        <mesh castShadow position={[0, 0.4, 0]}>
          <boxGeometry args={[0.9, 0.6, 0.9]} />
          <meshStandardMaterial
            ref={(mat) => {
              if (mat) cargoMaterialsRef.current[1] = mat;
            }}
            color="#fef3c7"
            transparent
            opacity={cargoOpacityRef.current}
          />
        </mesh>
      </group>
    </group>
  );
};

// Forklift model preload disabled - using procedural fallback
// useGLTF.preload(MODEL_PATHS.forklift);

// Procedural fallback (improved from original)
const ProceduralForklift: React.FC<ForkliftModelProps> = ({
  hasCargo,
  isMoving,
  speedMultiplier = 1,
  forkHeightRef,
}) => {
  const wheelRefs = useRef<THREE.Mesh[]>([]);
  const forksRef = useRef<THREE.Group>(null);
  const cargoRef = useRef<THREE.Group>(null);
  const isTabVisible = useGameSimulationStore((state) => state.isTabVisible);

  // Cargo fade-in refs (no re-renders)
  const cargoOpacityRef = useRef(hasCargo ? 1 : 0);
  const prevHasCargoRef = useRef(hasCargo);
  const cargoMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  useFrame((_, delta) => {
    if (!isTabVisible) return;

    // Update fork height directly from ref (no re-render needed)
    const forkHeight = forkHeightRef?.current ?? 0;
    if (forksRef.current) {
      forksRef.current.position.y = forkHeight;
    }
    if (cargoRef.current) {
      cargoRef.current.position.y = 0.6 + forkHeight;
    }

    // Cargo fade-in animation (ref-based, no re-renders)
    if (hasCargo && !prevHasCargoRef.current) {
      // Cargo just spawned - start fade from 0
      cargoOpacityRef.current = 0;
    }
    prevHasCargoRef.current = hasCargo;

    // Animate opacity towards target
    const targetOpacity = hasCargo ? 1 : 0;
    if (cargoOpacityRef.current !== targetOpacity) {
      const fadeSpeed = 1 / CARGO_FADE_DURATION;
      if (hasCargo) {
        cargoOpacityRef.current = Math.min(1, cargoOpacityRef.current + delta * fadeSpeed);
      } else {
        cargoOpacityRef.current = 0; // Instant hide on unload
      }
      // Update all cargo materials directly
      const opacity = cargoOpacityRef.current;
      cargoMaterialsRef.current.forEach((mat) => {
        if (mat) {
          mat.opacity = opacity;
          mat.visible = opacity > 0.01;
        }
      });
    }

    if (!isMoving) return;
    wheelRefs.current.forEach((wheel) => {
      if (wheel) wheel.rotation.x += delta * 5 * speedMultiplier;
    });
  });

  const setWheelRef = (index: number) => (el: THREE.Mesh | null) => {
    if (el) wheelRefs.current[index] = el;
  };

  return (
    <group>
      {/* Main body - more detailed */}
      <mesh castShadow position={[0, 0.6, 0]}>
        <boxGeometry args={[1.5, 1, 2.5]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Body details - side panels */}
      <mesh castShadow position={[-0.76, 0.6, 0]}>
        <boxGeometry args={[0.02, 0.8, 2.3]} />
        <meshStandardMaterial color="#d97706" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[0.76, 0.6, 0]}>
        <boxGeometry args={[0.02, 0.8, 2.3]} />
        <meshStandardMaterial color="#d97706" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Engine cover with vents */}
      <mesh castShadow position={[0, 0.85, -0.8]}>
        <boxGeometry args={[1.3, 0.5, 0.8]} />
        <meshStandardMaterial color="#ea580c" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Vent grilles */}
      {[-0.3, 0, 0.3].map((x, i) => (
        <mesh key={i} position={[x, 0.86, -0.41]}>
          <boxGeometry args={[0.15, 0.3, 0.02]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}

      {/* Counterweight */}
      <mesh castShadow position={[0, 0.4, -1.35]}>
        <boxGeometry args={[1.4, 0.6, 0.3]} />
        <meshStandardMaterial color="#374151" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Cabin - glass effect */}
      <mesh castShadow position={[0, 1.4, -0.3]}>
        <boxGeometry args={[1.3, 1.2, 1.2]} />
        <meshStandardMaterial color="#1f2937" metalness={0.2} roughness={0.8} />
      </mesh>
      {/* Cabin windows */}
      <mesh position={[0, 1.5, 0.32]}>
        <boxGeometry args={[1.1, 0.8, 0.02]} />
        <meshStandardMaterial
          color="#60a5fa"
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh position={[-0.66, 1.5, -0.3]}>
        <boxGeometry args={[0.02, 0.8, 1.0]} />
        <meshStandardMaterial
          color="#60a5fa"
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>
      <mesh position={[0.66, 1.5, -0.3]}>
        <boxGeometry args={[0.02, 0.8, 1.0]} />
        <meshStandardMaterial
          color="#60a5fa"
          metalness={0.9}
          roughness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>

      {/* Roof with ROPS (Roll Over Protection) */}
      <mesh castShadow position={[0, 2.1, -0.3]}>
        <boxGeometry args={[1.5, 0.1, 1.4]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* ROPS pillars */}
      {[
        [-0.65, -0.85],
        [-0.65, 0.25],
        [0.65, -0.85],
        [0.65, 0.25],
      ].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 1.75, z]}>
          <boxGeometry args={[0.08, 0.8, 0.08]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}

      {/* Steering wheel hint */}
      <mesh position={[0.2, 1.3, 0.1]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.12, 0.02, 8, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Seat */}
      <mesh castShadow position={[0, 1.1, -0.4]}>
        <boxGeometry args={[0.5, 0.1, 0.5]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh castShadow position={[0, 1.4, -0.6]}>
        <boxGeometry args={[0.5, 0.5, 0.1]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Mast - hydraulic system */}
      <group position={[0, 0, 1.3]}>
        {/* Main mast rails */}
        {[-0.5, 0, 0.5].map((x, i) => (
          <mesh key={i} castShadow position={[x, 1.2, 0]}>
            <boxGeometry args={[0.08, 2.2, 0.12]} />
            <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
          </mesh>
        ))}
        {/* Hydraulic cylinder */}
        <mesh castShadow position={[0, 1.0, -0.1]}>
          <cylinderGeometry args={[0.06, 0.06, 1.8, 12]} />
          <meshStandardMaterial color="#6b7280" metalness={0.9} roughness={0.1} />
        </mesh>
        {/* Hydraulic lines */}
        <mesh position={[-0.2, 0.8, -0.08]}>
          <cylinderGeometry args={[0.015, 0.015, 1.4, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0.2, 0.8, -0.08]}>
          <cylinderGeometry args={[0.015, 0.015, 1.4, 8]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        {/* Cross bars */}
        {[0.3, 1.0, 1.7].map((y, i) => (
          <mesh key={i} castShadow position={[0, y, 0]}>
            <boxGeometry args={[1.1, 0.06, 0.06]} />
            <meshStandardMaterial color="#4b5563" metalness={0.7} roughness={0.3} />
          </mesh>
        ))}
      </group>

      {/* Forks - with thickness, animated via useFrame */}
      <group ref={forksRef} position={[0, 0, 0]}>
        {[-0.3, 0.3].map((x, i) => (
          <group key={i} position={[x, 0.3, 1.8]}>
            <mesh castShadow>
              <boxGeometry args={[0.12, 0.06, 1.3]} />
              <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Fork tip bevel */}
            <mesh castShadow position={[0, 0.015, 0.68]} rotation={[0.15, 0, 0]}>
              <boxGeometry args={[0.12, 0.03, 0.1]} />
              <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.15} />
            </mesh>
            {/* Fork vertical section */}
            <mesh castShadow position={[0, 0.25, -0.6]}>
              <boxGeometry args={[0.12, 0.5, 0.08]} />
              <meshStandardMaterial color="#6b7280" metalness={0.85} roughness={0.15} />
            </mesh>
          </group>
        ))}
      </group>

      {/* Wheels - larger with tread */}
      {[
        [-0.7, 0.3, 0.8],
        [0.7, 0.3, 0.8],
        [-0.7, 0.25, -0.9],
        [0.7, 0.25, -0.9],
      ].map((pos, i) => (
        <group key={i} position={pos as [number, number, number]}>
          {/* Tire */}
          <mesh ref={setWheelRef(i)} castShadow rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[i < 2 ? 0.3 : 0.25, i < 2 ? 0.3 : 0.25, 0.22, 20]} />
            <meshStandardMaterial color="#1f2937" roughness={0.9} />
          </mesh>
          {/* Hub */}
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.12, 0.12, 0.24, 12]} />
            <meshStandardMaterial color="#f59e0b" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Lug nuts */}
          {[0, 1, 2, 3, 4].map((j) => (
            <mesh key={j} position={[0.12, 0, 0]} rotation={[0, 0, (j * Math.PI * 2) / 5]}>
              <mesh position={[0, 0.08, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.03, 6]} />
                <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
              </mesh>
            </mesh>
          ))}
        </group>
      ))}

      {/* Headlights */}
      {[-0.5, 0.5].map((x, i) => (
        <mesh key={i} position={[x, 0.8, 1.26]}>
          <cylinderGeometry args={[0.08, 0.08, 0.05, 12]} />
          <meshStandardMaterial color="#fef3c7" emissive="#fef3c7" emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* Tail lights */}
      {[-0.55, 0.55].map((x, i) => (
        <mesh key={i} position={[x, 0.7, -1.26]}>
          <boxGeometry args={[0.1, 0.15, 0.03]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
        </mesh>
      ))}

      {/* Side mirrors */}
      {[-0.75, 0.75].map((x, i) => (
        <group key={i} position={[x, 1.6, 0.4]}>
          <mesh>
            <boxGeometry args={[0.02, 0.1, 0.08]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[x > 0 ? 0.03 : -0.03, 0, 0]}>
            <boxGeometry args={[0.02, 0.12, 0.1]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
          </mesh>
        </group>
      ))}

      {/* Cargo (pallet with boxes) - always mounted, opacity animated via useFrame */}
      <group
        ref={cargoRef}
        position={[0, 0.6, 2]}
        visible={hasCargo || cargoOpacityRef.current > 0.01}
      >
        {/* Pallet */}
        <mesh castShadow>
          <boxGeometry args={[1, 0.12, 1]} />
          <meshStandardMaterial
            ref={(mat) => {
              if (mat) cargoMaterialsRef.current[0] = mat;
            }}
            color="#a16207"
            roughness={0.8}
            transparent
            opacity={cargoOpacityRef.current}
          />
        </mesh>
        {/* Pallet slats */}
        {[-0.35, 0, 0.35].map((z, i) => (
          <mesh key={i} position={[0, -0.05, z]}>
            <boxGeometry args={[1, 0.02, 0.15]} />
            <meshStandardMaterial
              ref={(mat) => {
                if (mat) cargoMaterialsRef.current[1 + i] = mat;
              }}
              color="#92400e"
              roughness={0.9}
              transparent
              opacity={cargoOpacityRef.current}
            />
          </mesh>
        ))}
        {/* Stacked boxes */}
        <mesh castShadow position={[0, 0.38, 0]}>
          <boxGeometry args={[0.85, 0.5, 0.85]} />
          <meshStandardMaterial
            ref={(mat) => {
              if (mat) cargoMaterialsRef.current[4] = mat;
            }}
            color="#fef3c7"
            roughness={0.7}
            transparent
            opacity={cargoOpacityRef.current}
          />
        </mesh>
        {/* Box strapping */}
        <mesh position={[0, 0.38, 0.43]}>
          <boxGeometry args={[0.86, 0.05, 0.01]} />
          <meshStandardMaterial
            ref={(mat) => {
              if (mat) cargoMaterialsRef.current[5] = mat;
            }}
            color="#3b82f6"
            transparent
            opacity={cargoOpacityRef.current}
          />
        </mesh>
        <mesh position={[0, 0.38, -0.43]}>
          <boxGeometry args={[0.86, 0.05, 0.01]} />
          <meshStandardMaterial
            ref={(mat) => {
              if (mat) cargoMaterialsRef.current[6] = mat;
            }}
            color="#3b82f6"
            transparent
            opacity={cargoOpacityRef.current}
          />
        </mesh>
      </group>
    </group>
  );
};

// Main export with model detection
export const ForkliftModel: React.FC<ForkliftModelProps> = (props) => {
  const modelAvailable = useModelAvailable('forklift');

  // While checking, show procedural
  if (modelAvailable === null || modelAvailable === false) {
    return <ProceduralForklift {...props} />;
  }

  return (
    <Suspense fallback={<ProceduralForklift {...props} />}>
      <GLTFForklift {...props} />
    </Suspense>
  );
};

export default ForkliftModel;
