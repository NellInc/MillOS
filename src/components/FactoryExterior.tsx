import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { playCritterSound } from '../utils/critterAudio';
import { HeartParticle } from './effects/HeartParticle';
import { useModelTextures } from '../utils/machineTextures';
import { useProductionStore } from '../stores/productionStore';
import { FLOOR_LAYERS, EXTERIOR_LAYERS, POLYGON_OFFSET, RENDER_ORDER } from '../constants/renderLayers';
import {
  calculateShippingTruckState,
  calculateReceivingTruckState,
} from './truckbay/useTruckPhysics';
import { PROCEDURAL_TEXTURES, OUTDOOR_MATERIALS } from '../utils/sharedMaterials';
import { GasStation } from './GasStationInstanced';
import {
  SimpleTreeInstances,
  ParkBenchInstances,
  MAIN_EXTERIOR_TREES,
  MAIN_EXTERIOR_BENCHES,
  PARKLAND_TREES,
  PARKLAND_BENCHES,
  FRONT_PARKLAND_TREES,
  FRONT_PARKLAND_BENCHES,
} from './exterior/ExteriorVegetation';
interface FactoryExteriorProps {
  floorWidth?: number;
  floorDepth?: number;
}

// Realistic grass colors
const GRASS_COLORS = {
  lawn: '#4a7c59', // Muted lawn green
  field: '#5c7a4a', // Field grass
  park: '#557a4a', // Park grass
  verge: '#6b8e5a', // Roadside verge
  meadow: '#4d7a50', // Meadow grass
};

// Simple low-poly tree component
const SimpleTree: React.FC<{ position: [number, number, number]; scale?: number }> = React.memo(
  ({ position, scale = 1 }) => (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 3, 6]} />
        <meshStandardMaterial color="#5d4037" roughness={0.9} />
      </mesh>
      {/* Foliage - simple cone */}
      <mesh position={[0, 4.5, 0]} castShadow>
        <coneGeometry args={[2, 5, 6]} />
        <meshStandardMaterial color="#2e7d32" roughness={0.8} />
      </mesh>
      <mesh position={[0, 6.5, 0]} castShadow>
        <coneGeometry args={[1.5, 3.5, 6]} />
        <meshStandardMaterial color="#388e3c" roughness={0.8} />
      </mesh>
    </group>
  )
);

// Simple park bench
const ParkBench: React.FC<{ position: [number, number, number]; rotation?: number }> = React.memo(
  ({ position, rotation = 0 }) => (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Seat */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.8, 0.1, 0.5]} />
        <meshStandardMaterial color="#8d6e63" roughness={0.7} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 0.75, -0.2]} rotation={[0.2, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 0.5, 0.08]} />
        <meshStandardMaterial color="#8d6e63" roughness={0.7} />
      </mesh>
      {/* Legs */}
      {[-0.7, 0.7].map((x, i) => (
        <mesh key={i} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.1, 0.45, 0.4]} />
          <meshStandardMaterial color="#424242" roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
);

// Small office building
const SmallOffice: React.FC<{
  position: [number, number, number];
  size?: [number, number, number];
  rotation?: number;
}> = React.memo(({ position, size = [12, 8, 10], rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Main building */}
    <mesh position={[0, size[1] / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[size[0], size[1], size[2]]} />
      <meshStandardMaterial color="#78909c" roughness={0.7} />
    </mesh>
    {/* Roof */}
    <mesh position={[0, size[1] + 0.3, 0]} castShadow>
      <boxGeometry args={[size[0] + 0.5, 0.6, size[2] + 0.5]} />
      <meshStandardMaterial color="#546e7a" roughness={0.6} />
    </mesh>
    {/* Windows - front */}
    {[-3, 0, 3].map((x, i) => (
      <mesh key={`front-${i}`} position={[x, size[1] / 2, size[2] / 2 + 0.05]}>
        <planeGeometry args={[2, 3]} />
        <meshStandardMaterial color="#90caf9" metalness={0.3} roughness={0.2} />
      </mesh>
    ))}
    {/* Door */}
    <mesh position={[0, 1.2, size[2] / 2 + 0.05]}>
      <planeGeometry args={[1.5, 2.4]} />
      <meshStandardMaterial color="#5d4037" roughness={0.8} />
    </mesh>
  </group>
));

// Nissen hut - semi-cylindrical corrugated building
const NissenHut: React.FC<{
  position: [number, number, number];
  length?: number;
  rotation?: number;
}> = ({ position, length = 12, rotation = 0 }) => {
  const radius = 2.5;

  // Create semi-circular arc shape for extrusion
  const arcShape = useMemo(() => {
    const shape = new THREE.Shape();
    // Start at bottom-left of the semicircle
    shape.moveTo(-radius, 0);
    // Draw arc from left to right (bottom half of circle, which curves UP when viewed)
    shape.absarc(0, 0, radius, Math.PI, 0, true); // counterclockwise from PI to 0
    shape.lineTo(-radius, 0); // close the shape
    return shape;
  }, [radius]);

  const extrudeSettings = useMemo(
    () => ({
      steps: 1,
      depth: length,
      bevelEnabled: false,
    }),
    [length]
  );

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Semi-cylindrical roof/walls - corrugated iron using ExtrudeGeometry */}
      <mesh position={[0, 0, -length / 2]} castShadow receiveShadow>
        <extrudeGeometry args={[arcShape, extrudeSettings]} />
        <meshStandardMaterial
          color="#6b7280"
          roughness={0.7}
          metalness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* End walls - semi-circular caps matching the cylinder cross-section */}
      {[-length / 2, length / 2].map((z, i) => (
        <group key={`end-${i}`} position={[0, 0, z]}>
          {/* Semi-circular end wall - rotated to face outward */}
          <mesh rotation={[0, i === 0 ? Math.PI : 0, 0]} castShadow receiveShadow>
            <circleGeometry args={[radius, 16, 0, Math.PI]} />
            <meshStandardMaterial color="#5a6268" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* Door on front end only */}
          {i === 0 && (
            <mesh position={[0, 1, -0.05]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[1.5, 2]} />
              <meshStandardMaterial color="#3e2723" roughness={0.9} />
            </mesh>
          )}
        </group>
      ))}

      {/* Foundation/base */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[radius * 2 + 0.2, 0.2, length + 0.4]} />
        <meshStandardMaterial color="#4a4a4a" roughness={0.9} />
      </mesh>
    </group>
  );
};

// Office apartment building - multi-story
const OfficeApartment: React.FC<{
  position: [number, number, number];
  floors?: number;
  rotation?: number;
}> = ({ position, floors = 4, rotation = 0 }) => {
  const floorHeight = 3.5;
  const buildingHeight = floors * floorHeight;
  const width = 16;
  const depth = 12;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Main building structure */}
      <mesh position={[0, buildingHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, buildingHeight, depth]} />
        <meshStandardMaterial color="#8d9db6" roughness={0.7} />
      </mesh>

      {/* Floor bands */}
      {Array.from({ length: floors }).map((_, floor) => (
        <mesh key={`band-${floor}`} position={[0, floor * floorHeight + floorHeight - 0.1, 0]}>
          <boxGeometry args={[width + 0.2, 0.2, depth + 0.2]} />
          <meshStandardMaterial color="#667292" roughness={0.6} />
        </mesh>
      ))}

      {/* Windows - front and back */}
      {Array.from({ length: floors }).map((_, floor) =>
        [-5, -1.5, 1.5, 5].map((x, winIdx) => (
          <React.Fragment key={`win-${floor}-${winIdx}`}>
            {/* Front window */}
            <mesh position={[x, floor * floorHeight + floorHeight / 2 + 0.5, depth / 2 + 0.05]}>
              <planeGeometry args={[2.2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
            {/* Back window */}
            <mesh
              position={[x, floor * floorHeight + floorHeight / 2 + 0.5, -depth / 2 - 0.05]}
              rotation={[0, Math.PI, 0]}
            >
              <planeGeometry args={[2.2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
          </React.Fragment>
        ))
      )}

      {/* Side windows */}
      {Array.from({ length: floors }).map((_, floor) =>
        [-3, 0, 3].map((z, winIdx) => (
          <React.Fragment key={`side-win-${floor}-${winIdx}`}>
            {/* Left side */}
            <mesh
              position={[-width / 2 - 0.05, floor * floorHeight + floorHeight / 2 + 0.5, z]}
              rotation={[0, -Math.PI / 2, 0]}
            >
              <planeGeometry args={[2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
            {/* Right side */}
            <mesh
              position={[width / 2 + 0.05, floor * floorHeight + floorHeight / 2 + 0.5, z]}
              rotation={[0, Math.PI / 2, 0]}
            >
              <planeGeometry args={[2, 2]} />
              <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.2} />
            </mesh>
          </React.Fragment>
        ))
      )}

      {/* Main entrance */}
      <group position={[0, 0, depth / 2]}>
        {/* Entrance canopy */}
        <mesh position={[0, 3, 1.5]} castShadow>
          <boxGeometry args={[5, 0.3, 3]} />
          <meshStandardMaterial color="#546e7a" roughness={0.5} />
        </mesh>
        {/* Entrance columns */}
        {[-2, 2].map((x, i) => (
          <mesh key={`col-${i}`} position={[x, 1.5, 2.5]} castShadow>
            <cylinderGeometry args={[0.2, 0.2, 3, 8]} />
            <meshStandardMaterial color="#78909c" roughness={0.5} />
          </mesh>
        ))}
        {/* Glass doors */}
        <mesh position={[0, 1.3, 0.1]}>
          <planeGeometry args={[3, 2.6]} />
          <meshStandardMaterial color="#64b5f6" metalness={0.4} roughness={0.1} />
        </mesh>
      </group>

      {/* Roof structure */}
      <mesh position={[0, buildingHeight + 0.3, 0]} castShadow>
        <boxGeometry args={[width + 0.5, 0.6, depth + 0.5]} />
        <meshStandardMaterial color="#546e7a" roughness={0.6} />
      </mesh>

      {/* Roof equipment */}
      <mesh position={[-4, buildingHeight + 1.2, 0]} castShadow>
        <boxGeometry args={[3, 1.8, 4]} />
        <meshStandardMaterial color="#757575" roughness={0.7} />
      </mesh>
      <mesh position={[4, buildingHeight + 0.8, 2]} castShadow>
        <boxGeometry args={[2, 1, 2]} />
        <meshStandardMaterial color="#616161" roughness={0.7} />
      </mesh>
    </group>
  );
};

// Perimeter fence section - optimized with InstancedMesh
const FenceSection: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  postSpacing?: number;
}> = React.memo(({ start, end, postSpacing = 8 }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const postCount = Math.floor(length / postSpacing) + 1;
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Memoize post positions
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (!meshRef.current) return;

    for (let i = 0; i < postCount; i++) {
      const t = postCount > 1 ? i / (postCount - 1) : 0;
      dummy.position.set(start[0] + dx * t, 1.2, start[2] + dz * t);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [postCount, start, dx, dz, dummy]);

  return (
    <group>
      {/* Fence posts - instanced */}
      <instancedMesh ref={meshRef} args={[undefined, undefined, postCount]} castShadow>
        <boxGeometry args={[0.15, 2.4, 0.15]} />
        <meshStandardMaterial color="#37474f" roughness={0.7} metalness={0.2} />
      </instancedMesh>

      {/* Horizontal rails */}
      <group
        position={[(start[0] + end[0]) / 2, 0, (start[2] + end[2]) / 2]}
        rotation={[0, -angle, 0]}
      >
        {/* Top rail */}
        <mesh position={[0, 2.2, 0]} castShadow>
          <boxGeometry args={[0.08, 0.08, length]} />
          <meshStandardMaterial color="#455a64" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Middle rail */}
        <mesh position={[0, 1.2, 0]} castShadow>
          <boxGeometry args={[0.08, 0.08, length]} />
          <meshStandardMaterial color="#455a64" roughness={0.6} metalness={0.3} />
        </mesh>
        {/* Bottom rail */}
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.08, 0.08, length]} />
          <meshStandardMaterial color="#455a64" roughness={0.6} metalness={0.3} />
        </mesh>
      </group>
    </group>
  );
});

// Water colors
const WATER_COLORS = {
  deep: '#1a3a6e', // Deep blue water
  shallow: '#2d5a8a', // Shallow blue water
  surface: '#3d6ab0', // Blue surface reflection
  edge: '#1e3a5a', // Water edge/shore
  pond: '#2563eb', // Bright blue for decorative ponds
};

// Still canal water surface - shiny reflective without animation
const StillCanalWater: React.FC<{
  width: number;
  length: number;
  position?: [number, number, number];
}> = ({ width, length, position = [0, 0, 0] }) => {
  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 10;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 10;

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[safeWidth, safeLength]} />
      <meshStandardMaterial
        color={WATER_COLORS.shallow}
        metalness={0.3}
        roughness={0.1}
        envMapIntensity={1.5}
      />
    </mesh>
  );
};

// Animated flowing river water surface
const AnimatedRiverWater: React.FC<{
  width: number;
  length: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  flowSpeed?: number;
}> = ({ width, length, position = [0, 0, 0], rotation = [-Math.PI / 2, 0, 0], flowSpeed = 1 }) => {
  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 10;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 10;

  // Keep uniforms in a ref so they persist and can be mutated
  const uniforms = useRef({
    time: { value: 0 },
    waterColor: { value: new THREE.Color(WATER_COLORS.shallow) },
    deepColor: { value: new THREE.Color(WATER_COLORS.deep) },
    foamColor: { value: new THREE.Color('#a8d5e5') },
    flowSpeed: { value: flowSpeed },
  });

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float time;
    uniform float flowSpeed;

    void main() {
      vUv = uv;
      vPosition = position;

      // Flowing wave displacement
      vec3 pos = position;
      float wave = sin(pos.x * 0.3 + time * flowSpeed * 2.0) * 0.15;
      wave += sin(pos.y * 0.4 + time * flowSpeed * 1.5) * 0.1;
      wave += sin((pos.x + pos.y) * 0.2 + time * flowSpeed * 2.5) * 0.12;
      // Cross-current ripples
      wave += sin(pos.x * 0.8 - time * flowSpeed * 3.0) * 0.05;
      pos.z += wave;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 waterColor;
    uniform vec3 deepColor;
    uniform vec3 foamColor;
    uniform float time;
    uniform float flowSpeed;
    varying vec2 vUv;
    varying vec3 vPosition;

    // Noise functions
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      // Flowing UV - water moves downstream
      vec2 flowUV = vUv;
      flowUV.y += time * flowSpeed * 0.15;
      flowUV.x += sin(time * flowSpeed * 0.5 + vUv.y * 3.0) * 0.02;

      // Multi-layer ripples for current
      float ripple1 = sin(vPosition.x * 0.5 + vPosition.y * 0.3 + time * flowSpeed * 3.0) * 0.5 + 0.5;
      float ripple2 = sin(vPosition.x * 0.8 - time * flowSpeed * 4.0) * 0.5 + 0.5;
      float ripple3 = sin((vPosition.x * 0.3 + vPosition.y * 0.6) + time * flowSpeed * 2.0) * 0.5 + 0.5;

      float ripples = ripple1 * 0.4 + ripple2 * 0.35 + ripple3 * 0.25;

      // Caustic patterns
      float caustic1 = noise(flowUV * 6.0 + time * flowSpeed * 0.8);
      float caustic2 = noise(flowUV * 10.0 - time * flowSpeed * 0.6);
      float caustics = (caustic1 + caustic2) * 0.5;
      caustics = pow(caustics, 1.3);

      // Foam/white water patterns - more on peaks
      float foamNoise = noise(flowUV * 15.0 + time * flowSpeed * 1.2);
      float foam = smoothstep(0.6, 0.9, ripples * foamNoise);

      // Depth variation - center is deeper
      float centerDist = abs(vUv.x - 0.5) * 2.0;
      float depthFactor = 1.0 - centerDist * 0.5;

      // Base color mixing
      vec3 color = mix(deepColor, waterColor, depthFactor * 0.7 + caustics * 0.3);

      // Add shimmer highlights
      float shimmer = ripples * caustics;
      shimmer = smoothstep(0.3, 0.7, shimmer);
      color = mix(color, foamColor, shimmer * 0.25);

      // Add foam streaks
      color = mix(color, foamColor, foam * 0.4);

      // Sparkle highlights
      float sparkle = pow(max(ripples, caustics), 10.0);
      color += vec3(1.0, 0.98, 0.95) * sparkle * 0.5;

      // Edge darkening for depth illusion
      float edgeFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);

      gl_FragColor = vec4(color, 0.9 * edgeFade);
    }
  `;

  // Update time uniform every frame
  useFrame((state) => {
    uniforms.current.time.value = state.clock.elapsedTime;
  });

  return (
    <mesh position={position} rotation={rotation} receiveShadow>
      <planeGeometry args={[safeWidth, safeLength, 32, 32]} />
      <shaderMaterial
        uniforms={uniforms.current}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

// Industrial Canal component - straight waterway with stone walls
const Canal: React.FC<{
  position: [number, number, number];
  length: number;
  width: number;
  rotation?: number;
}> = ({ position, length, width, rotation = 0 }) => {
  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 12;
  const safeLength = Number.isFinite(length) && length > 0 ? length : 10;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Still shiny water surface for canal */}
      <StillCanalWater width={safeWidth - 1} length={safeLength} position={[0, -0.15, 0]} />
      {/* Water depth effect */}
      <mesh position={[0, -0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[safeWidth - 1.5, safeLength - 1]} />
        <meshBasicMaterial color="#0a2a3a" transparent opacity={0.6} />
      </mesh>
      {/* Left canal wall */}
      <mesh position={[-safeWidth / 2, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1.5, safeLength]} />
        <meshStandardMaterial color="#5d6d7e" roughness={0.9} />
      </mesh>
      {/* Right canal wall */}
      <mesh position={[safeWidth / 2, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1, 1.5, safeLength]} />
        <meshStandardMaterial color="#5d6d7e" roughness={0.9} />
      </mesh>
      {/* Canal bed */}
      <mesh position={[0, -1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[safeWidth, safeLength]} />
        <meshStandardMaterial color="#2c3e50" roughness={0.95} />
      </mesh>
      {/* Towpath along left side - lowered to prevent z-fighting with paths at y=0.1 */}
      <mesh position={[-safeWidth / 2 - 2, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[3, safeLength]} />
        <meshStandardMaterial color="#7d6d5e" roughness={0.9} />
      </mesh>
      {/* Mooring posts */}
      {[-safeLength / 3, 0, safeLength / 3].map((z, i) => (
        <mesh key={`mooring-${i}`} position={[-safeWidth / 2 - 0.3, 0.8, z]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 1.5, 8]} />
          <meshStandardMaterial color="#3d2d1d" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
};

// English Narrowboat - cute traditional canal boat with roses and castles style
const CanalBoat: React.FC<{
  position: [number, number, number];
  rotation?: number;
  hullColor?: string;
  cabinColor?: string;
}> = React.memo(
  ({
    position,
    rotation = 0,
    hullColor = '#1e3a5a', // Traditional dark blue
    cabinColor = '#8b2323', // Traditional burgundy red
  }) => {
    const isNight = useGameSimulationStore(
      useShallow((state) => state.gameTime >= 20 || state.gameTime < 6)
    );

    // Narrowboat dimensions (scaled for scene)
    const boatLength = 12;
    const boatWidth = 2.4; // Slightly wider for better proportion
    const hullHeight = 0.9;
    const cabinHeight = 1.5;
    const cabinLength = 7.5;

    return (
      <group position={position} rotation={[0, rotation, 0]}>
        {/* ===== UPGRADED NARROWBOAT HULL ===== */}

        {/* Main Hull Body - smoother darker metal */}
        <mesh position={[0, -0.1, 0]} castShadow receiveShadow>
          <boxGeometry args={[boatWidth, hullHeight, boatLength - 2.5]} />
          <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
        </mesh>

        {/* Tapered Bow Section */}
        <group position={[0, 0, boatLength / 2 - 1.25]}>
          <mesh position={[0, -0.1, 1]} rotation={[Math.PI / 2, Math.PI, 0]} castShadow>
            <cylinderGeometry args={[0.1, boatWidth / 2, 2, 8, 1, false, Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
          </mesh>
          <mesh position={[0, -0.1, 1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.1, boatWidth / 2, 2, 8, 1, false, Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
          </mesh>
          {/* Bow Deck */}
          <mesh position={[0, 0.35, 1]} castShadow>
            <cylinderGeometry args={[boatWidth / 2 - 0.2, boatWidth / 2 - 0.2, 0.1, 16]} />
            <meshStandardMaterial color="#5d4e37" roughness={0.9} />
          </mesh>
        </group>

        {/* Tapered Stern Section */}
        <group position={[0, 0, -boatLength / 2 + 1.25]}>
          <mesh position={[0, -0.1, -0.5]} castShadow>
            <boxGeometry args={[boatWidth, hullHeight, 1]} />
            <meshStandardMaterial color={hullColor} roughness={0.4} metalness={0.3} />
          </mesh>
          {/* Stern Deck */}
          <mesh position={[0, 0.36, -0.2]} castShadow>
            <boxGeometry args={[boatWidth - 0.2, 0.05, 2.5]} />
            <meshStandardMaterial color="#5d4e37" roughness={0.9} />
          </mesh>
        </group>

        {/* Rubbing Strakes (Protective Rails) - More detailed */}
        {[-0.2, 0.1].map((y, i) => (
          <group key={`strake-${i}`} position={[0, y, 0]}>
            <mesh position={[boatWidth / 2 + 0.05, 0, 0]} castShadow>
              <boxGeometry args={[0.1, 0.1, boatLength - 3]} />
              <meshStandardMaterial color="#111" roughness={0.8} />
            </mesh>
            <mesh position={[-boatWidth / 2 - 0.05, 0, 0]} castShadow>
              <boxGeometry args={[0.1, 0.1, boatLength - 3]} />
              <meshStandardMaterial color="#111" roughness={0.8} />
            </mesh>
          </group>
        ))}

        {/* ===== CABIN ===== */}
        <group position={[0, 0.4, -0.5]}>
          {/* Main Cabin Structure */}
          <mesh position={[0, cabinHeight / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[boatWidth - 0.4, cabinHeight, cabinLength]} />
            <meshStandardMaterial color={cabinColor} roughness={0.6} />
          </mesh>

          {/* Painted Panels (Roses & Castles style) */}
          {[-1, 0, 1].map((xOffset) => (
            <mesh position={[0, cabinHeight / 2, xOffset * 2]} key={`panel-${xOffset}`}>
              <boxGeometry args={[boatWidth - 0.35, cabinHeight - 0.4, 1.5]} />
              <meshStandardMaterial color="#a03030" roughness={0.6} />
            </mesh>
          ))}

          {/* Windows - Proper portholes and rectangle windows */}
          {[-2.5, -1, 0.5, 2].map((z, i) => (
            <React.Fragment key={`win-${i}`}>
              {/* Port */}
              <group position={[-boatWidth / 2 + 0.2, 0.9, z]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.25, 0.25, 0.1, 16]} />
                  <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]} position={[0.02, 0, 0]}>
                  <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                  {isNight ? (
                    <meshStandardMaterial
                      color="#ffaa00"
                      emissive="#ffaa00"
                      emissiveIntensity={2}
                      toneMapped={false}
                    />
                  ) : (
                    <meshStandardMaterial color="#add8e6" metalness={0.5} roughness={0.1} />
                  )}
                </mesh>
              </group>
              {/* Starboard */}
              <group position={[boatWidth / 2 - 0.2, 0.9, z]}>
                <mesh rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.25, 0.25, 0.1, 16]} />
                  <meshStandardMaterial color="#d4af37" metalness={0.8} roughness={0.2} />
                </mesh>
                <mesh rotation={[0, 0, Math.PI / 2]} position={[-0.02, 0, 0]}>
                  <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                  {isNight ? (
                    <meshStandardMaterial
                      color="#ffaa00"
                      emissive="#ffaa00"
                      emissiveIntensity={2}
                      toneMapped={false}
                    />
                  ) : (
                    <meshStandardMaterial color="#add8e6" metalness={0.5} roughness={0.1} />
                  )}
                </mesh>
              </group>
            </React.Fragment>
          ))}

          {/* Roof Accessories Restored */}

          {/* Chimney - Brass and Smoke */}
          <group position={[0.5, cabinHeight + 0.6, -1.5]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.15, 0.18, 1, 12]} />
              <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.18, 0.04, 8, 16]} />
              <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.3} />
            </mesh>
            {/* Rain Cap */}
            <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0.4]}>
              <cylinderGeometry args={[0.2, 0.01, 0.1, 8]} />
              <meshStandardMaterial color="#333" />
            </mesh>
          </group>

          {/* Roof Storage Box */}
          <mesh position={[-0.4, cabinHeight + 0.3, 1]} castShadow>
            <boxGeometry args={[0.6, 0.3, 1.2]} />
            <meshStandardMaterial color="#5d4e37" roughness={0.9} />
          </mesh>

          {/* Lantern on Roof */}
          <group position={[0, cabinHeight + 0.15, 3]}>
            <mesh castShadow>
              <boxGeometry args={[0.2, 0.3, 0.2]} />
              <meshStandardMaterial color="#222" metalness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.15, 0.25, 0.15]} />
              <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} />
            </mesh>
          </group>
        </group>

        {/* ===== DECK DETAILS ===== */}

        {/* Tiller (Steering) - Distinctive Z shape */}
        <group position={[0, 1.1, -boatLength / 2 + 1.5]}>
          <mesh rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.8]} />
            <meshStandardMaterial color="#8b4513" />
          </mesh>
          <mesh position={[0, 0.4, -0.4]} rotation={[1.8, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 1]} />
            <meshStandardMaterial color="#ccc" metalness={0.7} />
          </mesh>
          <mesh position={[0, 0.4, -0.9]}>
            <sphereGeometry args={[0.06]} />
            <meshStandardMaterial color="#d4af37" metalness={0.8} />
          </mesh>
        </group>

        {/* Cratch Board (Front triangular cover frame) */}
        <group position={[0, 0.8, boatLength / 2 - 1.2]}>
          <mesh rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[boatWidth - 0.4, 0.8, 0.05]} />
            <meshStandardMaterial color="#222" transparent opacity={0.4} />
          </mesh>
          <mesh rotation={[-0.4, 0, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[boatWidth - 0.4, 0.8, 0.05]} />
            <meshStandardMaterial color="#333" wireframe />
          </mesh>
        </group>

        {/* Rope Coils on Bow */}
        <group position={[0, 0.4, boatLength / 2 - 0.5]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.3, 0.08, 8, 16]} />
            <meshStandardMaterial color="#c2b280" roughness={1} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0.5]} position={[0.2, 0.05, 0.1]}>
            <torusGeometry args={[0.25, 0.07, 8, 16]} />
            <meshStandardMaterial color="#c2b280" roughness={1} />
          </mesh>
        </group>

        {/* Water Reflection / Shadow */}
        <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[boatWidth + 0.5, boatLength + 1]} />
          <meshBasicMaterial color="#000" transparent opacity={0.3} />
        </mesh>
      </group>
    );
  }
);

// Natural Lake component - irregular shape with shoreline
const Lake: React.FC<{
  position: [number, number, number];
  size: [number, number];
  depth?: number;
}> = ({ position, size, depth = 0.5 }) => {
  // CRITICAL: Guard against NaN/undefined/zero dimensions which cause
  // "computeBoundingSphere(): Computed radius is NaN" errors in THREE.js
  const safeW = Number.isFinite(size?.[0]) && size[0] > 0 ? size[0] : 20;
  const safeH = Number.isFinite(size?.[1]) && size[1] > 0 ? size[1] : 20;
  const maxDim = Math.max(safeW, safeH);

  // Ensure all radii are positive and finite
  const mainRadius = Math.max(0.1, maxDim / 2 - 1);
  const deepRadius = Math.max(0.1, maxDim / 3);
  const shoreRadius = Math.max(0.1, maxDim / 2 + 2);
  const grassRadius = Math.max(0.1, maxDim / 2 + 6);

  return (
    <group position={position}>
      {/* Main water surface */}
      <mesh position={[0, -depth / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[mainRadius, 32]} />
        <meshStandardMaterial
          color={WATER_COLORS.pond}
          metalness={0.7}
          roughness={0.15}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Deep center */}
      <mesh position={[0, -depth, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[deepRadius, 24]} />
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.9} />
      </mesh>
      {/* Sandy shoreline */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[shoreRadius, 32]} />
        <meshStandardMaterial color="#c9b896" roughness={0.95} />
      </mesh>
      {/* Grass around lake - exteriorBase */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[grassRadius, 32]} />
        <meshStandardMaterial
          color={GRASS_COLORS.park}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>
      {/* Reeds/vegetation patches */}
      {[
        [-safeW / 3, safeH / 4],
        [safeW / 4, -safeH / 3],
        [-safeW / 4, -safeH / 4],
      ].map(([x, z], i) => (
        <group key={`reeds-${i}`} position={[x, 0, z]}>
          {[0, 0.3, -0.3, 0.15, -0.15].map((offset, j) => (
            <mesh key={j} position={[offset, 0.4, offset * 0.5]} castShadow>
              <cylinderGeometry args={[0.02, 0.04, 1, 4]} />
              <meshStandardMaterial color="#4a6741" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Willow trees by lake */}
      <SimpleTree position={[-safeW / 2 - 3, 0, 0]} scale={1.3} />
      <SimpleTree position={[safeW / 3, 0, safeH / 2 + 2]} scale={1.1} />
      {/* Park bench overlooking lake */}
      <ParkBench position={[safeW / 2 + 4, 0, 0]} rotation={-Math.PI / 2} />
    </group>
  );
};

// River Tunnel/Culvert - Victorian arched culvert where river enters/exits
const RiverTunnel: React.FC<{
  position: [number, number, number];
  width: number;
  rotation?: number; // Y rotation for direction
  flowDirection: 'in' | 'out'; // Which way water flows
}> = React.memo(({ position, width, rotation = 0, flowDirection }) => {
  const tunnelHeight = width * 0.7; // Slightly taller for arched profile
  const tunnelDepth = 14; // How far back the tunnel goes
  const zDir = flowDirection === 'in' ? -1 : 1;
  const wallThickness = 1.8;
  const archRadius = width / 2;
  const archSegments = 16;
  const stonesRef = useRef<THREE.InstancedMesh>(null);

  // Stone colors for weathered Victorian masonry
  const stoneMain = '#5d6875';
  const stoneDark = '#4a535e';
  const stoneLight = '#6e7a87';
  const brickColor = '#5c4033';
  const mossColor = '#3d5c3a';
  const ironColor = '#2a2a2a';

  // Set up instanced stones
  useEffect(() => {
    if (!stonesRef.current) return;

    const dummy = new THREE.Object3D();

    for (let i = 0; i <= archSegments; i++) {
      const angle = (Math.PI * i) / archSegments;
      const x = Math.cos(angle) * archRadius;
      const y = Math.sin(angle) * archRadius + tunnelHeight * 0.4;
      const blockRotation = angle - Math.PI / 2;

      dummy.position.set(x, y, zDir * 0.3);
      dummy.rotation.set(0, 0, blockRotation);
      dummy.updateMatrix();
      stonesRef.current.setMatrixAt(i, dummy.matrix);

      // Vary color slightly per instance? InstancedMesh only supports one color unless using instanceColor attribute.
      // For simplicity/performance we'll use a single color for now, or we could add instanceColor support.
      // Given fidelity request, let's stick to single material for now to avoid complexity,
      // or just use 2 instanced meshes for alternating colors if really needed.
      // Actually, let's just use one color (stoneMain) for the arch ring to keep it simple and fast.
      // The original had alternating colors. To keep that, we'd need coloring or 2 meshes.
      // Let's settle for one color for the instanced version or add instanceColor.
      stonesRef.current.setColorAt(i, new THREE.Color(i % 2 === 0 ? stoneMain : stoneLight));
    }

    stonesRef.current.instanceMatrix.needsUpdate = true;
    if (stonesRef.current.instanceColor) stonesRef.current.instanceColor.needsUpdate = true;
  }, [archSegments, archRadius, tunnelHeight, zDir, stoneMain, stoneLight]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Earthen embankment/hill that the tunnel goes through */}
      <mesh position={[0, 4, zDir * 10]} castShadow receiveShadow>
        <boxGeometry args={[width + 24, 10, 18]} />
        <meshStandardMaterial color="#4a5d3a" roughness={0.95} />
      </mesh>
      {/* Sloped front of embankment - left */}
      <mesh position={[width / 2 + 14, 2, zDir * 3]} rotation={[0, 0, Math.PI * 0.18]} castShadow>
        <boxGeometry args={[10, 6, 12]} />
        <meshStandardMaterial color="#5a6d4a" roughness={0.95} />
      </mesh>
      {/* Sloped front of embankment - right */}
      <mesh position={[-width / 2 - 14, 2, zDir * 3]} rotation={[0, 0, -Math.PI * 0.18]} castShadow>
        <boxGeometry args={[10, 6, 12]} />
        <meshStandardMaterial color="#5a6d4a" roughness={0.95} />
      </mesh>
      {/* Grass top of embankment */}
      <mesh position={[0, 9.05, zDir * 10]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 26, 20]} />
        <meshStandardMaterial color={GRASS_COLORS.meadow} roughness={0.9} />
      </mesh>

      {/* ===== VICTORIAN ARCHED STONE PORTAL ===== */}
      <group position={[0, 0, 0]}>
        {/* Stone arch ring - Instanced */}
        <instancedMesh ref={stonesRef} args={[undefined, undefined, archSegments + 1]} castShadow>
          <boxGeometry args={[0.9, 1.6, 2.5]} />
          <meshStandardMaterial color="#ffffff" roughness={0.85} />
        </instancedMesh>

        {/* Prominent keystone at arch apex */}
        <mesh position={[0, tunnelHeight * 0.4 + archRadius + 0.6, zDir * 0.2]} castShadow>
          <boxGeometry args={[1.8, 2.2, 2.8]} />
          <meshStandardMaterial color={stoneDark} roughness={0.8} />
        </mesh>
        {/* Keystone decorative face carving */}
        <mesh position={[0, tunnelHeight * 0.4 + archRadius + 0.5, -zDir * 0.8]} castShadow>
          <boxGeometry args={[1.2, 1.4, 0.3]} />
          <meshStandardMaterial color="#3d454f" roughness={0.75} />
        </mesh>

        {/* Stone pilasters (vertical side columns) */}
        {[-1, 1].map((side) => (
          <group key={`pilaster-${side}`} position={[side * (width / 2 + wallThickness / 2), 0, 0]}>
            {/* Main pilaster body */}
            <mesh position={[0, tunnelHeight * 0.35, zDir * 0.5]} castShadow receiveShadow>
              <boxGeometry args={[wallThickness, tunnelHeight * 0.7 + 1, 3]} />
              <meshStandardMaterial color={stoneMain} roughness={0.85} />
            </mesh>
            {/* Pilaster cap */}
            <mesh position={[0, tunnelHeight * 0.7 + 0.5, zDir * 0.5]} castShadow>
              <boxGeometry args={[wallThickness + 0.4, 0.5, 3.2]} />
              <meshStandardMaterial color={stoneLight} roughness={0.8} />
            </mesh>
            {/* Pilaster base plinth */}
            <mesh position={[0, 0.3, zDir * 0.5]} castShadow>
              <boxGeometry args={[wallThickness + 0.5, 0.6, 3.4]} />
              <meshStandardMaterial color={stoneDark} roughness={0.9} />
            </mesh>
            {/* Weathering/moss patch at base */}
            <mesh position={[side * -0.3, 0.2, zDir * -0.3]} castShadow>
              <boxGeometry args={[0.8, 0.4, 1.5]} />
              <meshStandardMaterial color={mossColor} roughness={0.95} />
            </mesh>
          </group>
        ))}

        {/* String course (horizontal decorative band) below arch spring */}
        <mesh position={[0, tunnelHeight * 0.38, zDir * 0.6]} castShadow>
          <boxGeometry args={[width + 3.5, 0.4, 2.8]} />
          <meshStandardMaterial color={stoneLight} roughness={0.8} />
        </mesh>

        {/* Dark tunnel interior plane - just behind the iron bars */}
        <mesh position={[0, tunnelHeight * 0.45, 0.5]}>
          <planeGeometry args={[width - 0.5, tunnelHeight * 0.85]} />
          <meshBasicMaterial color="#030303" side={THREE.DoubleSide} />
        </mesh>

        {/* ===== IRON GRATING/BARS ===== */}
        {/* Horizontal top bar */}
        <mesh position={[0, tunnelHeight * 0.85, zDir * -0.5]} castShadow>
          <boxGeometry args={[width - 0.5, 0.15, 0.15]} />
          <meshStandardMaterial color={ironColor} metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Vertical bars */}
        {Array.from({ length: 7 }).map((_, i) => {
          const barX = ((i - 3) / 3) * (width / 2 - 0.5);
          return (
            <mesh key={`bar-${i}`} position={[barX, tunnelHeight * 0.5, zDir * -0.5]} castShadow>
              <cylinderGeometry args={[0.06, 0.06, tunnelHeight * 0.7, 8]} />
              <meshStandardMaterial color={ironColor} metalness={0.6} roughness={0.4} />
            </mesh>
          );
        })}

        {/* ===== BRICK-LINED TUNNEL INTERIOR ===== */}
        {/* Arched ceiling inside tunnel */}
        <mesh
          position={[0, tunnelHeight * 0.75, zDir * (tunnelDepth / 2 + 1)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[width, tunnelDepth]} />
          <meshStandardMaterial color={brickColor} roughness={0.9} />
        </mesh>

        {/* Brick interior - left wall */}
        <mesh
          position={[-width / 2, tunnelHeight * 0.4, zDir * (tunnelDepth / 2 + 1)]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[tunnelDepth, tunnelHeight * 0.8]} />
          <meshStandardMaterial color="#4a3528" roughness={0.92} />
        </mesh>

        {/* Brick interior - right wall */}
        <mesh
          position={[width / 2, tunnelHeight * 0.4, zDir * (tunnelDepth / 2 + 1)]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[tunnelDepth, tunnelHeight * 0.8]} />
          <meshStandardMaterial color="#4a3528" roughness={0.92} />
        </mesh>

        {/* Tunnel floor/water bed inside */}
        <mesh position={[0, -0.05, zDir * (tunnelDepth / 2 + 1)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, tunnelDepth]} />
          <meshBasicMaterial color={WATER_COLORS.deep} transparent opacity={0.9} />
        </mesh>

        {/* Back wall of tunnel (darkness) */}
        <mesh position={[0, tunnelHeight * 0.4, zDir * (tunnelDepth + 1)]}>
          <planeGeometry args={[width, tunnelHeight]} />
          <meshBasicMaterial color="#030303" side={THREE.DoubleSide} />
        </mesh>

        {/* ===== WEATHERING DETAILS ===== */}
        {/* Water staining below arch */}
        <mesh position={[0, tunnelHeight * 0.3, zDir * -0.7]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width * 0.6, 0.3]} />
          <meshBasicMaterial color="#3a4a42" transparent opacity={0.5} />
        </mesh>
        {/* Moss patches on stone */}
        <mesh position={[width / 2 + 0.8, 0.5, zDir * 1.2]} castShadow>
          <sphereGeometry args={[0.4, 8, 6]} />
          <meshStandardMaterial color={mossColor} roughness={0.95} />
        </mesh>
        <mesh position={[-width / 2 - 0.6, 0.3, zDir * 0.8]} castShadow>
          <sphereGeometry args={[0.3, 8, 6]} />
          <meshStandardMaterial color={mossColor} roughness={0.95} />
        </mesh>
      </group>

      {/* Water surface transitioning into tunnel */}
      <AnimatedRiverWater
        width={width}
        length={4}
        position={[0, -0.08, zDir * -1.5]}
        flowSpeed={1.2}
      />

      {/* Vegetation around tunnel entrance */}
      <SimpleTree position={[width / 2 + 10, 0, zDir * 5]} scale={0.9} />
      <SimpleTree position={[-width / 2 - 9, 0, zDir * 7]} scale={0.8} />

      {/* Reeds/rushes near water entrance */}
      {[-1, 1].map((side) => (
        <group key={`reeds-${side}`} position={[side * (width / 2 + 2), 0, zDir * -2]}>
          {[0, 0.2, -0.15, 0.35, -0.3].map((offset, j) => (
            <mesh key={j} position={[offset * 0.8, 0.5, offset * 0.4]} castShadow>
              <cylinderGeometry args={[0.03, 0.05, 1.2, 4]} />
              <meshStandardMaterial color="#4a6741" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
});

// River component - meandering natural waterway
const River: React.FC<{
  position: [number, number, number];
  length: number;
  width: number;
  meander?: number;
}> = React.memo(({ position, length, width, meander = 5 }) => {
  // Generate river path points with natural meander
  const riverSegments = useMemo(() => {
    const segments: { x: number; z: number; w: number }[] = [];
    const segmentCount = 12;
    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const x = -length / 2 + t * length;
      const z = Math.sin(t * Math.PI * 2.5) * meander;
      const w = width + Math.sin(t * Math.PI * 3) * (width * 0.2);
      segments.push({ x, z, w });
    }
    return segments;
  }, [length, width, meander]);

  return (
    <group position={position}>
      {/* River bed and banks */}
      {riverSegments.slice(0, -1).map((seg, i) => {
        const nextSeg = riverSegments[i + 1];
        const midX = (seg.x + nextSeg.x) / 2;
        const midZ = (seg.z + nextSeg.z) / 2;
        const segLengthRaw = Math.sqrt(
          Math.pow(nextSeg.x - seg.x, 2) + Math.pow(nextSeg.z - seg.z, 2)
        );
        // Guard against NaN/zero dimensions for PlaneGeometry
        const segLength = Number.isFinite(segLengthRaw) && segLengthRaw > 0.01 ? segLengthRaw : 1;
        const angle = Math.atan2(nextSeg.z - seg.z, nextSeg.x - seg.x);
        const avgWidthRaw = (seg.w + nextSeg.w) / 2;
        const avgWidth = Number.isFinite(avgWidthRaw) && avgWidthRaw > 0.01 ? avgWidthRaw : 5;

        return (
          <group
            key={`river-seg-${i}`}
            position={[midX, 0, midZ]}
            rotation={[0, -angle + Math.PI / 2, 0]}
          >
            {/* Riverbank grass - exteriorBase */}
            <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[avgWidth + 6, segLength + 2]} />
              <meshStandardMaterial
                color={GRASS_COLORS.verge}
                roughness={0.95}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
                polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
              />
            </mesh>
            {/* Narrow pebbly shore - exteriorMid (on top of grass) */}
            <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <planeGeometry args={[avgWidth + 1.5, segLength + 0.5]} />
              <meshStandardMaterial
                color="#2a4a5a"
                roughness={0.9}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.exteriorMid.factor}
                polygonOffsetUnits={POLYGON_OFFSET.exteriorMid.units}
              />
            </mesh>
            {/* Animated flowing water surface */}
            <AnimatedRiverWater
              width={avgWidth}
              length={segLength + 0.5}
              position={[0, -0.08, 0]}
              flowSpeed={1.2}
            />
            {/* Deep channel bed */}
            <mesh position={[0, -0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[avgWidth * 0.6, segLength]} />
              <meshBasicMaterial color={WATER_COLORS.deep} transparent opacity={0.7} />
            </mesh>
          </group>
        );
      })}
      {/* Trees removed - were causing placement issues */}
      {/* Stone bridge - narrower footbridge spanning the river */}
      {/* Deck raised to y=2.0 to prevent water wave clipping (waves can reach ~y=1.0 from base at y=-0.08) */}
      <group position={[0, 0, 0]}>
        {/* Bridge deck - raised to y=2.0 for clearance above wave amplitude */}
        <mesh position={[0, 2.0, 0]} castShadow receiveShadow>
          <boxGeometry args={[6.375, 0.8, width + 14.375]} />
          <meshStandardMaterial color="#6b7280" roughness={0.8} />
        </mesh>
        {/* Bridge arch (simplified) - raised proportionally */}
        <mesh position={[0, 1.0, 0]} castShadow>
          <boxGeometry args={[5.1, 1.5, width - 2]} />
          <meshStandardMaterial color="#5b6470" roughness={0.85} />
        </mesh>
        {/* Bridge railings - raised proportionally */}
        {[-1, 1].map((side, i) => (
          <mesh key={`railing-${i}`} position={[side * 3.1875, 2.7, 0]} castShadow>
            <boxGeometry args={[0.3, 1, width + 14.375]} />
            <meshStandardMaterial color="#4b5563" roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* Tunnel entrances at river ends - water flows from left tunnel, through river, into right tunnel */}
      <RiverTunnel
        position={[-length / 2 - 2, 0, riverSegments[0].z]}
        width={width}
        rotation={-Math.PI / 2}
        flowDirection="out"
      />
      <RiverTunnel
        position={[length / 2 + 2, 0, riverSegments[riverSegments.length - 1].z]}
        width={width}
        rotation={-Math.PI / 2}
        flowDirection="in"
      />
    </group>
  );
});

// Animated frog that hops on lily pads
const AnimatedFrog: React.FC<{
  position: [number, number, number];
  rotation?: number;
  hopOffset?: number;
}> = ({ position, rotation = 0, hopOffset = 0 }) => {
  const frogRef = useRef<THREE.Group>(null);
  const [isExcited, setIsExcited] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; pos: [number, number, number] }[]>([]);

  const handlePet = (e: any) => {
    e.stopPropagation();
    setIsExcited(true);
    playCritterSound('frog');
    const id = Date.now();
    setHearts((prev: { id: number; pos: [number, number, number] }[]) => [
      ...prev,
      { id, pos: [0, 0.5, 0] },
    ]);
  };

  const removeHeart = (id: number) => {
    setHearts((prev: { id: number; pos: [number, number, number] }[]) =>
      prev.filter((h) => h.id !== id)
    );
  };

  useEffect(() => {
    if (isExcited) {
      const t = setTimeout(() => setIsExcited(false), 500);
      return () => clearTimeout(t);
    }
  }, [isExcited]);

  useFrame((state) => {
    if (frogRef.current) {
      if (isExcited) {
        // Rapid hop / shudder
        const t = state.clock.elapsedTime * 30;
        frogRef.current.position.y = position[1] + Math.abs(Math.sin(t)) * 0.1;
        frogRef.current.rotation.x = 0;
        return;
      }

      // Create a hopping animation
      const time = state.clock.elapsedTime + hopOffset;
      const hopCycle = time * 0.8; // Slower hop frequency
      const hopPhase = hopCycle % 3; // Hop every 3 seconds

      if (hopPhase < 0.3) {
        // Hopping up
        const hopProgress = hopPhase / 0.3;
        frogRef.current.position.y = position[1] + Math.sin(hopProgress * Math.PI) * 0.3;
        frogRef.current.rotation.x = -hopProgress * 0.3; // Lean forward while hopping
      } else {
        // Sitting
        frogRef.current.position.y = position[1];
        frogRef.current.rotation.x = 0;
      }
    }
  });

  return (
    <group position={position} rotation={[0, rotation, 0]} onClick={handlePet}>
      <group ref={frogRef}>
        {/* Frog body */}
        <mesh castShadow>
          <sphereGeometry args={[0.12, 12, 8]} />
          <meshStandardMaterial color="#4a7c3f" roughness={0.8} />
        </mesh>
        {/* Head */}
        <mesh position={[0.1, 0.04, 0]} castShadow>
          <sphereGeometry args={[0.08, 10, 8]} />
          <meshStandardMaterial color="#5a8c4f" roughness={0.8} />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.14, 0.1, 0.04]} castShadow>
          <sphereGeometry args={[0.03, 8, 6]} />
          <meshStandardMaterial color="#2d4a2a" roughness={0.6} />
        </mesh>
        <mesh position={[0.14, 0.1, -0.04]} castShadow>
          <sphereGeometry args={[0.03, 8, 6]} />
          <meshStandardMaterial color="#2d4a2a" roughness={0.6} />
        </mesh>
        {/* Eye highlights */}
        <mesh position={[0.16, 0.11, 0.04]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.16, 0.11, -0.04]}>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Back legs */}
        <mesh position={[-0.1, -0.04, 0.08]} rotation={[0, 0, 0.5]} castShadow>
          <capsuleGeometry args={[0.025, 0.1, 4, 6]} />
          <meshStandardMaterial color="#3d6b35" roughness={0.8} />
        </mesh>
        <mesh position={[-0.1, -0.04, -0.08]} rotation={[0, 0, 0.5]} castShadow>
          <capsuleGeometry args={[0.025, 0.1, 4, 6]} />
          <meshStandardMaterial color="#3d6b35" roughness={0.8} />
        </mesh>
        {/* Front legs */}
        <mesh position={[0.06, -0.06, 0.06]} castShadow>
          <capsuleGeometry args={[0.02, 0.05, 4, 6]} />
          <meshStandardMaterial color="#3d6b35" roughness={0.8} />
        </mesh>
        <mesh position={[0.06, -0.06, -0.06]} castShadow>
          <capsuleGeometry args={[0.02, 0.05, 4, 6]} />
          <meshStandardMaterial color="#3d6b35" roughness={0.8} />
        </mesh>
      </group>

      {hearts.map((h: { id: number; pos: [number, number, number] }) => (
        <HeartParticle key={h.id} position={h.pos} onComplete={() => removeHeart(h.id)} />
      ))}
    </group>
  );
};

// Cupid/Eros statue for pond centerpiece
const CupidStatue: React.FC<{
  position: [number, number, number];
}> = ({ position }) => (
  <group position={position}>
    {/* Stone plinth base - octagonal */}
    <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.6, 0.7, 0.3, 8]} />
      <meshStandardMaterial color="#8b9298" roughness={0.85} />
    </mesh>
    {/* Plinth column */}
    <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.35, 0.45, 0.8, 8]} />
      <meshStandardMaterial color="#9ca3ab" roughness={0.8} />
    </mesh>
    {/* Plinth top */}
    <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.5, 0.4, 0.2, 8]} />
      <meshStandardMaterial color="#a8b0b8" roughness={0.75} />
    </mesh>

    {/* Cupid figure - stylized */}
    <group position={[0, 1.5, 0]}>
      {/* Body/torso */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <capsuleGeometry args={[0.15, 0.3, 8, 12]} />
        <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial color="#ebe0d4" roughness={0.55} metalness={0.1} />
      </mesh>
      {/* Curly hair */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <sphereGeometry args={[0.11, 10, 8]} />
        <meshStandardMaterial color="#d4c8bc" roughness={0.7} />
      </mesh>
      {/* Left wing */}
      <group position={[-0.1, 0.4, -0.12]} rotation={[0.2, -0.4, 0.3]}>
        <mesh castShadow>
          <coneGeometry args={[0.2, 0.5, 4]} />
          <meshStandardMaterial color="#f0e8e0" roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Right wing */}
      <group position={[0.1, 0.4, -0.12]} rotation={[0.2, 0.4, -0.3]}>
        <mesh castShadow>
          <coneGeometry args={[0.2, 0.5, 4]} />
          <meshStandardMaterial color="#f0e8e0" roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {/* Left arm - holding bow */}
      <mesh position={[-0.18, 0.35, 0.05]} rotation={[0, 0, -0.8]} castShadow>
        <capsuleGeometry args={[0.04, 0.15, 4, 8]} />
        <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Right arm - drawing bowstring */}
      <mesh position={[0.15, 0.4, 0.08]} rotation={[0.5, 0, 0.6]} castShadow>
        <capsuleGeometry args={[0.04, 0.15, 4, 8]} />
        <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Bow */}
      <group position={[-0.28, 0.3, 0.1]} rotation={[0, 0, 0.2]}>
        <mesh castShadow>
          <torusGeometry args={[0.15, 0.015, 8, 12, Math.PI]} />
          <meshStandardMaterial color="#c4a87c" roughness={0.7} />
        </mesh>
      </group>
      {/* Legs */}
      <mesh position={[-0.06, 0, 0]} rotation={[0, 0, 0.1]} castShadow>
        <capsuleGeometry args={[0.05, 0.2, 4, 8]} />
        <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0.06, 0, 0]} rotation={[0, 0, -0.1]} castShadow>
        <capsuleGeometry args={[0.05, 0.2, 4, 8]} />
        <meshStandardMaterial color="#e8dcd0" roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  </group>
);

// Small decorative pond
const Pond: React.FC<{
  position: [number, number, number];
  radius: number;
}> = ({ position, radius }) => {
  // Fixed lily pad positions and rotations (avoid Math.random in render)
  const lilyPads = useMemo(
    () => [
      { x: -radius * 0.3, z: radius * 0.2, rot: 0.5, frogRot: Math.PI * 0.3, hopOffset: 0 },
      { x: radius * 0.4, z: -radius * 0.1, rot: 2.1, frogRot: -Math.PI * 0.5, hopOffset: 1.2 },
      { x: -radius * 0.1, z: -radius * 0.4, rot: 4.2, frogRot: Math.PI * 0.8, hopOffset: 2.5 },
      { x: radius * 0.2, z: radius * 0.35, rot: 1.0, frogRot: -Math.PI * 0.2, hopOffset: 0.7 },
      { x: -radius * 0.45, z: -radius * 0.15, rot: 3.5, frogRot: Math.PI * 0.6, hopOffset: 1.8 },
    ],
    [radius]
  );

  return (
    <group position={position}>
      {/* Surrounding grass - exteriorBase */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius + 3, 24]} />
        <meshStandardMaterial
          color={GRASS_COLORS.lawn}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>
      {/* Stone edge - exteriorTop */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[radius - 0.3, radius + 0.5, 24]} />
        <meshStandardMaterial
          color="#7d8590"
          roughness={0.85}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorTop.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorTop.units}
        />
      </mesh>
      {/* Water surface - exteriorMid */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius - 0.5, 24]} />
        <meshStandardMaterial
          color={WATER_COLORS.pond}
          metalness={0.7}
          roughness={0.15}
          transparent
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorMid.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorMid.units}
          opacity={0.9}
        />
      </mesh>
      {/* Lily pads with frogs */}
      {lilyPads.map((pad, i) => (
        <group key={`lilypad-${i}`}>
          {/* Lily pad */}
          <mesh position={[pad.x, -0.12, pad.z]} rotation={[-Math.PI / 2, pad.rot, 0]}>
            <circleGeometry args={[0.5, 12]} />
            <meshStandardMaterial color="#3d6b4f" roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
          {/* Lily pad notch effect - darker center */}
          <mesh position={[pad.x, -0.115, pad.z]} rotation={[-Math.PI / 2, pad.rot, 0]}>
            <ringGeometry args={[0.1, 0.25, 12]} />
            <meshStandardMaterial color="#2d5a3f" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
          {/* Frog on the lily pad */}
          <AnimatedFrog
            position={[pad.x, -0.05, pad.z]}
            rotation={pad.frogRot}
            hopOffset={pad.hopOffset}
          />
        </group>
      ))}
      {/* Cupid/Eros statue in center */}
      <CupidStatue position={[0, -0.15, 0]} />
      {/* Bench nearby */}
      <ParkBench position={[radius + 2, 0, 0]} rotation={-Math.PI / 2} />
    </group>
  );
};

// Cute kiosk cafe
const KioskCafe: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => {
  const woodColor = '#8b5a2b';
  const accentColor = '#e74c3c'; // Red accent for awning
  const creamColor = '#fdf5e6'; // Cream for contrast

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[2.2, 2.4, 0.1, 8]} />
        <meshStandardMaterial color="#8b7355" roughness={0.9} />
      </mesh>

      {/* Main octagonal hut body */}
      <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.8, 2, 2.7, 8]} />
        <meshStandardMaterial color={woodColor} roughness={0.75} />
      </mesh>

      {/* Roof - conical with overhang */}
      <mesh position={[0, 3.2, 0]} castShadow>
        <coneGeometry args={[2.8, 1.8, 8]} />
        <meshStandardMaterial color={accentColor} roughness={0.6} />
      </mesh>

      {/* Roof trim */}
      <mesh position={[0, 2.35, 0]} castShadow>
        <torusGeometry args={[2.1, 0.08, 8, 8]} />
        <meshStandardMaterial color="#5d4037" roughness={0.7} />
      </mesh>

      {/* Roof finial - cute little ball on top */}
      <mesh position={[0, 4.2, 0]} castShadow>
        <sphereGeometry args={[0.15, 12, 12]} />
        <meshStandardMaterial color="#f4d03f" roughness={0.3} metalness={0.5} />
      </mesh>

      {/* Serving window - front */}
      <group position={[0, 1.5, 1.85]}>
        {/* Window frame */}
        <mesh castShadow>
          <boxGeometry args={[1.4, 1.2, 0.15]} />
          <meshStandardMaterial color="#5d4037" roughness={0.7} />
        </mesh>
        {/* Window opening (dark) */}
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[1.1, 0.9, 0.1]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
        </mesh>
        {/* Serving counter shelf */}
        <mesh position={[0, -0.5, 0.3]} castShadow>
          <boxGeometry args={[1.6, 0.1, 0.6]} />
          <meshStandardMaterial color={woodColor} roughness={0.7} />
        </mesh>
      </group>

      {/* Cute striped awning over window */}
      <group position={[0, 2.3, 2.2]}>
        {/* Awning frame */}
        <mesh rotation={[0.4, 0, 0]} castShadow>
          <boxGeometry args={[1.8, 0.05, 1.2]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} />
        </mesh>
        {/* Awning stripes - alternating red and cream */}
        {[-0.6, -0.2, 0.2, 0.6].map((x, i) => (
          <mesh key={`stripe-${i}`} position={[x, -0.02, 0]} rotation={[0.4, 0, 0]}>
            <boxGeometry args={[0.35, 0.03, 1.2]} />
            <meshStandardMaterial color={i % 2 === 0 ? accentColor : creamColor} roughness={0.6} />
          </mesh>
        ))}
        {/* Scalloped edge */}
        {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
          <mesh key={`scallop-${i}`} position={[x, -0.55, 0.55]} rotation={[0.4, 0, 0]} castShadow>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color={i % 2 === 0 ? accentColor : creamColor} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Menu board sign */}
      <group position={[1.5, 2.8, 1.2]} rotation={[0, -0.4, 0]}>
        {/* Sign post */}
        <mesh position={[0, -0.8, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.6, 8]} />
          <meshStandardMaterial color="#5d4037" roughness={0.8} />
        </mesh>
        {/* Sign board */}
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.6, 0.06]} />
          <meshStandardMaterial color={creamColor} roughness={0.8} />
        </mesh>
        {/* Sign frame */}
        <mesh position={[0, 0, -0.02]}>
          <boxGeometry args={[0.9, 0.7, 0.02]} />
          <meshStandardMaterial color="#5d4037" roughness={0.7} />
        </mesh>
      </group>

      {/* Flower boxes on sides */}
      {[
        { pos: [1.4, 0.6, 1.2] as [number, number, number], rot: -0.4 },
        { pos: [-1.4, 0.6, 1.2] as [number, number, number], rot: 0.4 },
      ].map(({ pos, rot }, i) => (
        <group key={`flowerbox-${i}`} position={pos} rotation={[0, rot, 0]}>
          {/* Box */}
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.35, 0.3]} />
            <meshStandardMaterial color="#6d4c41" roughness={0.85} />
          </mesh>
          {/* Flowers */}
          {[-0.25, 0, 0.25].map((x, j) => (
            <mesh key={`flower-${j}`} position={[x, 0.3, 0]} castShadow>
              <sphereGeometry args={[0.12, 8, 8]} />
              <meshStandardMaterial color={['#ff6b9d', '#ffd93d', '#ff8fab'][j]} roughness={0.7} />
            </mesh>
          ))}
          {/* Greenery */}
          <mesh position={[0, 0.2, 0]} castShadow>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshStandardMaterial color="#4a7c59" roughness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Outdoor seating area - small table with umbrella */}
      <group position={[0, 0, 6]}>
        {/* Table */}
        <mesh position={[0, 0.7, 0]} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 0.06, 16]} />
          <meshStandardMaterial color={woodColor} roughness={0.7} />
        </mesh>
        {/* Table leg */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.7, 8]} />
          <meshStandardMaterial color="#5d4037" roughness={0.7} />
        </mesh>
        {/* Umbrella pole */}
        <mesh position={[0, 1.6, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 2.2, 8]} />
          <meshStandardMaterial color="#5d4037" roughness={0.6} />
        </mesh>
        {/* Umbrella canopy */}
        <mesh position={[0, 2.6, 0]} castShadow>
          <coneGeometry args={[1.5, 0.6, 8]} />
          <meshStandardMaterial color={accentColor} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
        {/* Umbrella finial */}
        <mesh position={[0, 2.95, 0]} castShadow>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial color="#f4d03f" roughness={0.4} metalness={0.4} />
        </mesh>
        {/* Two small stools */}
        {[
          [-0.9, 0, 0.5],
          [0.9, 0, 0.5],
        ].map((p, i) => (
          <group key={`stool-${i}`} position={p as [number, number, number]}>
            <mesh position={[0, 0.4, 0]} castShadow>
              <cylinderGeometry args={[0.25, 0.25, 0.06, 12]} />
              <meshStandardMaterial color={woodColor} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.2, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.08, 0.4, 8]} />
              <meshStandardMaterial color="#5d4037" roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>

      {/* "CAFE" text sign on awning */}
      <Text
        position={[0, 2.5, 2.6]}
        rotation={[0.4, 0, 0]}
        fontSize={0.35}
        color="#fdf5e6"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        CAFE
      </Text>
    </group>
  );
};

// Cute vintage caravan/trailer
const Caravan: React.FC<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
}> = ({ position, rotation = 0, color = '#e8d5b7' }) => {
  const accentColor = '#2e7d32'; // Retro green trim
  const wheelColor = '#424242';

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Main body - rounded rectangular shape */}
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.8, 5]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>

      {/* Rounded roof */}
      <mesh position={[0, 2.1, 0]} castShadow>
        <boxGeometry args={[2.2, 0.3, 4.8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.25, 0]} castShadow>
        <boxGeometry args={[1.8, 0.15, 4.6]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>

      {/* Bottom trim stripe */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[2.45, 0.15, 5.05]} />
        <meshStandardMaterial color={accentColor} roughness={0.6} />
      </mesh>

      {/* Top trim stripe */}
      <mesh position={[0, 1.95, 0]}>
        <boxGeometry args={[2.45, 0.1, 5.05]} />
        <meshStandardMaterial color={accentColor} roughness={0.6} />
      </mesh>

      {/* Front end (rounded) */}
      <mesh position={[0, 1.1, 2.4]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 2.2, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>

      {/* Hitch/tongue */}
      <mesh position={[0, 0.5, 3.2]} castShadow>
        <boxGeometry args={[0.15, 0.1, 1.2]} />
        <meshStandardMaterial color={wheelColor} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Hitch coupling */}
      <mesh position={[0, 0.5, 3.8]} castShadow>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color={wheelColor} roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Door - right side */}
      <mesh position={[1.21, 1.0, 0.5]}>
        <boxGeometry args={[0.05, 1.4, 0.8]} />
        <meshStandardMaterial color="#5d4037" roughness={0.8} />
      </mesh>
      {/* Door window */}
      <mesh position={[1.23, 1.3, 0.5]}>
        <boxGeometry args={[0.02, 0.5, 0.5]} />
        <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
      </mesh>
      {/* Door handle */}
      <mesh position={[1.25, 0.9, 0.2]}>
        <boxGeometry args={[0.04, 0.08, 0.15]} />
        <meshStandardMaterial color="#bdbdbd" roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Windows - left side */}
      {[-0.8, 0.8].map((z, i) => (
        <mesh key={`win-l-${i}`} position={[-1.21, 1.3, z]}>
          <boxGeometry args={[0.05, 0.6, 0.7]} />
          <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
        </mesh>
      ))}
      {/* Window - right side (back) */}
      <mesh position={[1.21, 1.3, -0.8]}>
        <boxGeometry args={[0.05, 0.6, 0.7]} />
        <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
      </mesh>

      {/* Rear window */}
      <mesh position={[0, 1.4, -2.51]}>
        <boxGeometry args={[1.2, 0.5, 0.05]} />
        <meshStandardMaterial color="#90caf9" roughness={0.2} metalness={0.3} />
      </mesh>

      {/* Wheels */}
      {[-0.9, 0.9].map((x, i) => (
        <group key={`wheel-${i}`} position={[x, 0.35, -1]}>
          {/* Tire */}
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.35, 0.35, 0.2, 16]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
          </mesh>
          {/* Hubcap */}
          <mesh position={[x > 0 ? 0.11 : -0.11, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.18, 0.05, 12]} />
            <meshStandardMaterial color="#bdbdbd" roughness={0.3} metalness={0.6} />
          </mesh>
          {/* Wheel well/fender */}
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[0.3, 0.35, 0.5]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Awning rolled up on side */}
      <mesh position={[-1.35, 2.0, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.12, 3, 8]} />
        <meshStandardMaterial color="#f57c00" roughness={0.7} />
      </mesh>

      {/* Small steps at door */}
      <mesh position={[1.5, 0.15, 0.5]} castShadow>
        <boxGeometry args={[0.4, 0.1, 0.5]} />
        <meshStandardMaterial color={wheelColor} roughness={0.6} metalness={0.3} />
      </mesh>

      {/* Propane tank on tongue */}
      <mesh position={[0.3, 0.6, 2.8]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <capsuleGeometry args={[0.12, 0.3, 4, 8]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
      </mesh>

      {/* Roof vent */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[0.4, 0.15, 0.4]} />
        <meshStandardMaterial color="#f5f5f5" roughness={0.5} />
      </mesh>

      {/* Cute flower box on window */}
      <group position={[-1.35, 0.9, 0.8]}>
        <mesh castShadow>
          <boxGeometry args={[0.2, 0.15, 0.5]} />
          <meshStandardMaterial color="#6d4c41" roughness={0.85} />
        </mesh>
        {/* Flowers */}
        {[-0.15, 0, 0.15].map((z, i) => (
          <mesh key={`flower-${i}`} position={[0, 0.15, z]} castShadow>
            <sphereGeometry args={[0.08, 6, 6]} />
            <meshStandardMaterial color={['#e91e63', '#ffeb3b', '#e91e63'][i]} roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// Cute food truck
const FoodTruck: React.FC<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
  name?: string;
}> = ({ position, rotation = 0, color = '#ff6b6b', name = 'TACOS' }) => {
  const trimColor = '#ffffff';

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Main truck body */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.8, 2.2, 6]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Cab section (front) */}
      <mesh position={[0, 0.9, 3.5]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 1.6, 1.5]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Cab roof (slightly lower) */}
      <mesh position={[0, 1.8, 3.5]} castShadow>
        <boxGeometry args={[2.5, 0.15, 1.4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>

      {/* Windshield */}
      <mesh position={[0, 1.1, 4.26]} rotation={[0.15, 0, 0]}>
        <boxGeometry args={[2.2, 1.0, 0.08]} />
        <meshStandardMaterial color="#64b5f6" roughness={0.1} metalness={0.4} />
      </mesh>

      {/* Side windows - cab */}
      {[-1.31, 1.31].map((x, i) => (
        <mesh key={`cab-win-${i}`} position={[x, 1.1, 3.5]}>
          <boxGeometry args={[0.05, 0.7, 1.0]} />
          <meshStandardMaterial color="#64b5f6" roughness={0.1} metalness={0.4} />
        </mesh>
      ))}

      {/* Serving window (left side) */}
      <group position={[-1.41, 1.4, -0.5]}>
        {/* Window opening */}
        <mesh>
          <boxGeometry args={[0.05, 1.2, 2.0]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
        </mesh>
        {/* Window frame */}
        <mesh position={[-0.03, 0, 0]}>
          <boxGeometry args={[0.08, 1.4, 2.2]} />
          <meshStandardMaterial color={trimColor} roughness={0.5} />
        </mesh>
        {/* Serving counter/shelf */}
        <mesh position={[-0.4, -0.5, 0]} castShadow>
          <boxGeometry args={[0.8, 0.08, 2.0]} />
          <meshStandardMaterial color="#5d4037" roughness={0.7} />
        </mesh>
      </group>

      {/* Awning over serving window */}
      <group position={[-1.8, 2.1, -0.5]}>
        <mesh rotation={[0, 0, -0.4]} castShadow>
          <boxGeometry args={[1.2, 0.08, 2.4]} />
          <meshStandardMaterial color="#f57c00" roughness={0.6} />
        </mesh>
        {/* Awning stripes */}
        {[-0.8, -0.4, 0, 0.4, 0.8].map((z, i) => (
          <mesh key={`awn-${i}`} position={[0, -0.03, z]} rotation={[0, 0, -0.4]}>
            <boxGeometry args={[1.2, 0.04, 0.35]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#f57c00' : '#fff3e0'} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Trim stripe */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[2.85, 0.15, 6.05]} />
        <meshStandardMaterial color={trimColor} roughness={0.5} />
      </mesh>

      {/* Roof equipment - AC unit */}
      <mesh position={[0.5, 2.45, 0]} castShadow>
        <boxGeometry args={[1.0, 0.4, 1.2]} />
        <meshStandardMaterial color="#9e9e9e" roughness={0.5} metalness={0.3} />
      </mesh>

      {/* Roof vent */}
      <mesh position={[-0.5, 2.4, -1]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 0.3, 8]} />
        <meshStandardMaterial color="#757575" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Wheels */}
      {[
        [-1.0, 2.5],
        [1.0, 2.5],
        [-1.0, -1.8],
        [1.0, -1.8],
      ].map(([x, z], i) => (
        <group key={`wheel-${i}`} position={[x, 0.4, z]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.4, 0.4, 0.25, 16]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
          </mesh>
          <mesh position={[x > 0 ? 0.14 : -0.14, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.06, 12]} />
            <meshStandardMaterial color="#bdbdbd" roughness={0.3} metalness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Headlights */}
      {[-0.8, 0.8].map((x, i) => (
        <mesh key={`hl-${i}`} position={[x, 0.7, 4.28]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.08, 12]} />
          <meshStandardMaterial
            color="#ffeb3b"
            roughness={0.3}
            emissive="#ffeb3b"
            emissiveIntensity={0.2}
          />
        </mesh>
      ))}

      {/* Bumper */}
      <mesh position={[0, 0.35, 4.35]} castShadow>
        <boxGeometry args={[2.4, 0.2, 0.15]} />
        <meshStandardMaterial color="#424242" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* Rear lights */}
      {[-1.0, 1.0].map((x, i) => (
        <mesh key={`tl-${i}`} position={[x, 0.8, -3.01]}>
          <boxGeometry args={[0.3, 0.2, 0.05]} />
          <meshStandardMaterial
            color="#ef5350"
            roughness={0.4}
            emissive="#ef5350"
            emissiveIntensity={0.1}
          />
        </mesh>
      ))}

      {/* Menu board on side */}
      <group position={[-1.45, 1.4, 1.5]} rotation={[0, -0.1, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.08, 0.8, 0.6]} />
          <meshStandardMaterial color="#2d2d2d" roughness={0.8} />
        </mesh>
      </group>

      {/* Name sign on top */}
      <Text
        position={[-1.42, 1.9, -0.5]}
        rotation={[0, -Math.PI / 2, 0]}
        fontSize={0.35}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {name}
      </Text>

      {/* Decorative string lights (just little spheres) */}
      {[-1.5, -1.0, -0.5, 0, 0.5].map((z, i) => (
        <mesh key={`light-${i}`} position={[-1.5, 2.25, z]} castShadow>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color={['#ffeb3b', '#ff7043', '#4fc3f7', '#ab47bc', '#ffeb3b'][i]}
            emissive={['#ffeb3b', '#ff7043', '#4fc3f7', '#ab47bc', '#ffeb3b'][i]}
            emissiveIntensity={0.3}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Small generator on back */}
      <mesh position={[0, 0.3, -3.3]} castShadow>
        <boxGeometry args={[0.8, 0.5, 0.5]} />
        <meshStandardMaterial color="#616161" roughness={0.6} metalness={0.3} />
      </mesh>
    </group>
  );
};

// Brick carport/shelter structure - outdoor seating area with brick pillars
const BrickCarport: React.FC<{
  position: [number, number, number];
  rotation?: number;
  size?: [number, number, number]; // width, height, depth
}> = ({ position, rotation = 0, size = [8, 3.5, 6] }) => {
  const [width, height, depth] = size;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Brick pillars at corners */}
      {[
        [-width / 2 + 0.3, 0.3],
        [width / 2 - 0.3, 0.3],
        [-width / 2 + 0.3, -depth / 2 + 0.3],
        [width / 2 - 0.3, -depth / 2 + 0.3],
      ].map(([x, z], i) => (
        <mesh key={`pillar-${i}`} position={[x, height / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[0.5, height, 0.5]} />
          <meshStandardMaterial
            color="#b5836d"
            roughness={0.85}
            map={PROCEDURAL_TEXTURES.brickColor}
            normalMap={PROCEDURAL_TEXTURES.brickNormal}
            normalScale={new THREE.Vector2(0.3, 0.3)}
          />
        </mesh>
      ))}

      {/* Roof structure */}
      <mesh position={[0, height + 0.15, -depth / 4]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.4, 0.3, depth + 0.4]} />
        <meshStandardMaterial
          color="#6b4423"
          roughness={0.8}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>

      {/* Roof tiles/covering */}
      <mesh position={[0, height + 0.35, -depth / 4]} castShadow>
        <boxGeometry args={[width + 0.6, 0.1, depth + 0.6]} />
        <meshStandardMaterial color="#8b4513" roughness={0.9} />
      </mesh>

      {/* Floor/paved area */}
      <mesh position={[0, 0.02, -depth / 4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color="#b0b0b0"
          roughness={0.9}
          map={PROCEDURAL_TEXTURES.cobblestoneColor}
          normalMap={PROCEDURAL_TEXTURES.cobblestoneNormal}
        />
      </mesh>

      {/* Picnic tables under the shelter */}
      {[-2, 2].map((x, i) => (
        <group key={`table-${i}`} position={[x, 0, -depth / 4]}>
          {/* Table top */}
          <mesh position={[0, 0.75, 0]} castShadow>
            <boxGeometry args={[1.8, 0.08, 0.8]} />
            <meshStandardMaterial color="#8b6914" roughness={0.8} />
          </mesh>
          {/* Benches */}
          {[-0.55, 0.55].map((z, j) => (
            <mesh key={`bench-${j}`} position={[0, 0.45, z]} castShadow>
              <boxGeometry args={[1.8, 0.05, 0.3]} />
              <meshStandardMaterial color="#8b6914" roughness={0.8} />
            </mesh>
          ))}
          {/* Table legs */}
          {[-0.7, 0.7].map((lx, k) => (
            <mesh key={`leg-${k}`} position={[lx, 0.4, 0]} castShadow>
              <boxGeometry args={[0.08, 0.8, 0.6]} />
              <meshStandardMaterial color="#5d4037" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

// Gravel/paved path component
const GravelPath: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  width?: number;
  type?: 'gravel' | 'paved' | 'cobble';
}> = ({ start, end, width = 2, type = 'gravel' }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const rawLength = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 2;
  const safeLength = Number.isFinite(rawLength) && rawLength > 0 ? rawLength : 0.1;

  const colors = {
    gravel: '#9ca3af',
    paved: '#6b7280',
    cobble: '#78716c',
  };

  return (
    <group position={[midX, 0.15, midZ]} rotation={[0, -angle, 0]}>
      {/* Path surface - raised to y=0.15 to prevent z-fighting with grass and other surfaces */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[safeWidth, safeLength]} />
        <meshStandardMaterial color={colors[type]} roughness={0.95} />
      </mesh>
      {/* Path borders - raised above path surface */}
      {[-1, 1].map((side, i) => (
        <mesh
          key={i}
          position={[side * (safeWidth / 2 + 0.1), 0.02, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.15, safeLength]} />
          <meshStandardMaterial color="#57534e" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
};

// Curved path section for connecting paths
const CurvedPath: React.FC<{
  position: [number, number, number];
  radius: number;
  startAngle: number;
  endAngle: number;
  width?: number;
  type?: 'gravel' | 'paved';
}> = ({ position, radius, startAngle, endAngle, width = 2, type = 'gravel' }) => {
  const segments = 12;
  const angleStep = (endAngle - startAngle) / segments;

  // CRITICAL: Guard against NaN/zero dimensions to prevent PlaneGeometry errors
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 2;
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;

  const colors = {
    gravel: '#9ca3af',
    paved: '#6b7280',
  };

  return (
    <group position={position}>
      {Array.from({ length: segments }).map((_, i) => {
        const angle1 = startAngle + i * angleStep;
        const angle2 = startAngle + (i + 1) * angleStep;
        const x1 = Math.cos(angle1) * safeRadius;
        const z1 = Math.sin(angle1) * safeRadius;
        const x2 = Math.cos(angle2) * safeRadius;
        const z2 = Math.sin(angle2) * safeRadius;
        const midX = (x1 + x2) / 2;
        const midZ = (z1 + z2) / 2;
        const rawSegLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(z2 - z1, 2));
        const safeSegLength =
          Number.isFinite(rawSegLength) && rawSegLength > 0 ? rawSegLength : 0.1;
        const segAngle = Math.atan2(x2 - x1, z2 - z1);

        return (
          <mesh
            key={i}
            position={[midX, 0.17, midZ]}
            rotation={[-Math.PI / 2, 0, -segAngle]}
            receiveShadow
          >
            <planeGeometry args={[safeWidth, safeSegLength + 0.1]} />
            <meshStandardMaterial color={colors[type]} roughness={0.95} />
          </mesh>
        );
      })}
    </group>
  );
};

// Footbridge over water
const FootBridge: React.FC<{
  position: [number, number, number];
  length: number;
  width?: number;
  rotation?: number;
  style?: 'wooden' | 'stone' | 'iron';
}> = ({ position, length, width = 3, rotation = 0, style = 'wooden' }) => {
  const colors = {
    wooden: { deck: '#8b5a2b', rail: '#6b4423', support: '#5d4037' },
    stone: { deck: '#6b7280', rail: '#4b5563', support: '#374151' },
    iron: { deck: '#374151', rail: '#1f2937', support: '#111827' },
  };
  const c = colors[style];

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Bridge deck */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.2, length]} />
        <meshStandardMaterial color={c.deck} roughness={0.8} />
      </mesh>
      {/* Deck planks detail */}
      {style === 'wooden' &&
        Array.from({ length: Math.floor(length / 0.4) }).map((_, i) => (
          <mesh key={i} position={[0, 1.32, -length / 2 + 0.2 + i * 0.4]} castShadow>
            <boxGeometry args={[width - 0.1, 0.03, 0.35]} />
            <meshStandardMaterial color="#7a4a1b" roughness={0.9} />
          </mesh>
        ))}
      {/* Support beams underneath */}
      {[-length / 3, 0, length / 3].map((z, i) => (
        <mesh key={`support-${i}`} position={[0, 0.5, z]} castShadow>
          <boxGeometry args={[width + 0.5, 0.3, 0.4]} />
          <meshStandardMaterial color={c.support} roughness={0.85} />
        </mesh>
      ))}
      {/* Vertical supports */}
      {[-length / 3, length / 3].map((z, i) => (
        <React.Fragment key={`vert-${i}`}>
          <mesh position={[-width / 2 - 0.1, 0.6, z]} castShadow>
            <boxGeometry args={[0.25, 1.2, 0.25]} />
            <meshStandardMaterial color={c.support} roughness={0.8} />
          </mesh>
          <mesh position={[width / 2 + 0.1, 0.6, z]} castShadow>
            <boxGeometry args={[0.25, 1.2, 0.25]} />
            <meshStandardMaterial color={c.support} roughness={0.8} />
          </mesh>
        </React.Fragment>
      ))}
      {/* Railings */}
      {[-1, 1].map((side, i) => (
        <group key={`rail-${i}`} position={[side * (width / 2 + 0.15), 0, 0]}>
          {/* Top rail */}
          <mesh position={[0, 2, 0]} castShadow>
            <boxGeometry args={[0.1, 0.1, length - 0.5]} />
            <meshStandardMaterial color={c.rail} roughness={0.7} />
          </mesh>
          {/* Railing posts */}
          {Array.from({ length: Math.floor(length / 1.5) + 1 }).map((_, j) => (
            <mesh key={j} position={[0, 1.6, -length / 2 + 0.5 + j * 1.5]} castShadow>
              <boxGeometry args={[0.08, 0.9, 0.08]} />
              <meshStandardMaterial color={c.rail} roughness={0.75} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

// Canal lock gate
const LockGate: React.FC<{
  position: [number, number, number];
  width: number;
  rotation?: number;
}> = ({ position, width, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Gate posts */}
    {[-width / 2 - 0.3, width / 2 + 0.3].map((x, i) => (
      <mesh key={i} position={[x, 1.5, 0]} castShadow>
        <boxGeometry args={[0.5, 3, 0.5]} />
        <meshStandardMaterial color="#374151" roughness={0.7} metalness={0.3} />
      </mesh>
    ))}
    {/* Gate doors (closed) */}
    {[-1, 1].map((side, i) => (
      <mesh key={`door-${i}`} position={[(side * width) / 4, 0.5, 0]} castShadow>
        <boxGeometry args={[width / 2 - 0.2, 2.5, 0.3]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
    ))}
    {/* Operating beam */}
    <mesh position={[0, 2.8, -2]} rotation={[0.1, 0, 0]} castShadow>
      <boxGeometry args={[0.15, 0.15, 4]} />
      <meshStandardMaterial color="#78350f" roughness={0.85} />
    </mesh>
    {/* Walkway across top */}
    <mesh position={[0, 3, 0]} castShadow>
      <boxGeometry args={[width + 1.5, 0.15, 1]} />
      <meshStandardMaterial color="#6b7280" roughness={0.8} />
    </mesh>
  </group>
);

// Lamp post for paths
const PathLamp: React.FC<{
  position: [number, number, number];
  style?: 'modern' | 'victorian';
}> = React.memo(({ position, style = 'modern' }) => (
  <group position={position}>
    {/* Pole */}
    <mesh position={[0, 2, 0]} castShadow>
      <cylinderGeometry args={[0.08, 0.1, 4, 8]} />
      <meshStandardMaterial
        color={style === 'victorian' ? '#1f2937' : '#6b7280'}
        roughness={0.5}
        metalness={0.4}
      />
    </mesh>
    {/* Lamp head */}
    {style === 'victorian' ? (
      <group position={[0, 4.2, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.5, 0.4]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.3} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[0.3, 0.25, 0.3]} />
          <meshBasicMaterial color="#fef3c7" />
        </mesh>
      </group>
    ) : (
      <group position={[0, 4.1, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.2, 0.15, 0.3, 8]} />
          <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.12, 0.15, 0.15, 8]} />
          <meshBasicMaterial color="#fef3c7" />
        </mesh>
      </group>
    )}
  </group>
));

// Bollard for paths and waterside
const Bollard: React.FC<{
  position: [number, number, number];
  type?: 'wood' | 'metal' | 'stone';
}> = React.memo(({ position, type = 'metal' }) => {
  const colors = {
    wood: '#5d4037',
    metal: '#374151',
    stone: '#6b7280',
  };
  return (
    <mesh position={[position[0], position[1] + 0.4, position[2]]} castShadow>
      <cylinderGeometry args={[0.12, 0.15, 0.8, 8]} />
      <meshStandardMaterial
        color={colors[type]}
        roughness={type === 'metal' ? 0.5 : 0.85}
        metalness={type === 'metal' ? 0.4 : 0}
      />
    </mesh>
  );
});

// Information sign
const InfoSign: React.FC<{
  position: [number, number, number];
  text: string;
  rotation?: number;
}> = ({ position, text, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Post */}
    <mesh position={[0, 0.6, 0]} castShadow>
      <boxGeometry args={[0.1, 1.2, 0.1]} />
      <meshStandardMaterial color="#5d4037" roughness={0.85} />
    </mesh>
    {/* Sign board */}
    <mesh position={[0, 1.3, 0.08]} castShadow>
      <boxGeometry args={[0.8, 0.5, 0.05]} />
      <meshStandardMaterial color="#1f2937" roughness={0.7} />
    </mesh>
    {/* Text */}
    <Text
      position={[0, 1.3, 0.12]}
      fontSize={0.12}
      color="#ffffff"
      anchorX="center"
      anchorY="middle"
    >
      {text}
    </Text>
  </group>
);

// Flower bed / hedge border
const HedgeRow: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  height?: number;
  width?: number;
}> = ({ start, end, height = 0.8, width = 0.6 }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  return (
    <mesh position={[midX, height / 2, midZ]} rotation={[0, -angle, 0]} castShadow>
      <boxGeometry args={[width, height, length]} />
      <meshStandardMaterial color="#2d5a27" roughness={0.95} />
    </mesh>
  );
};

// Picnic table
const PicnicTable: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Table top */}
    <mesh position={[0, 0.75, 0]} castShadow>
      <boxGeometry args={[1.8, 0.08, 0.8]} />
      <meshStandardMaterial color="#8b5a2b" roughness={0.85} />
    </mesh>
    {/* Bench seats */}
    {[-0.6, 0.6].map((z, i) => (
      <mesh key={i} position={[0, 0.45, z]} castShadow>
        <boxGeometry args={[1.8, 0.06, 0.3]} />
        <meshStandardMaterial color="#8b5a2b" roughness={0.85} />
      </mesh>
    ))}
    {/* Legs */}
    {[
      [-0.7, -0.4],
      [-0.7, 0.4],
      [0.7, -0.4],
      [0.7, 0.4],
    ].map(([x, z], i) => (
      <mesh key={i} position={[x, 0.35, z]} castShadow>
        <boxGeometry args={[0.08, 0.7, 0.08]} />
        <meshStandardMaterial color="#5d4037" roughness={0.9} />
      </mesh>
    ))}
    {/* Cross braces */}
    {[-0.7, 0.7].map((x, i) => (
      <mesh key={i} position={[x, 0.25, 0]} rotation={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.9]} />
        <meshStandardMaterial color="#5d4037" roughness={0.9} />
      </mesh>
    ))}
  </group>
);

// Waste bin
const WasteBin: React.FC<{
  position: [number, number, number];
}> = ({ position }) => (
  <group position={position}>
    <mesh position={[0, 0.4, 0]} castShadow>
      <cylinderGeometry args={[0.25, 0.22, 0.8, 8]} />
      <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
    </mesh>
    {/* Rim */}
    <mesh position={[0, 0.82, 0]} castShadow>
      <torusGeometry args={[0.25, 0.03, 8, 16]} />
      <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.4} />
    </mesh>
  </group>
);

// Curved text that wraps around a cylinder surface
const CurvedText: React.FC<{
  text: string;
  radius: number;
  height: number;
  fontSize?: number;
  color?: string;
  arcAngle?: number; // Total arc angle in radians (default: auto-calculate based on text)
  startAngle?: number; // Starting angle in radians (default: 0, facing +Z)
}> = ({ text, radius, height, fontSize = 2, color = '#1e293b', arcAngle, startAngle = 0 }) => {
  const chars = text.split('');
  const charCount = chars.length;

  // Estimate character width (approximately 0.6 * fontSize for most fonts)
  const charWidth = fontSize * 0.6;
  const totalTextWidth = charWidth * charCount;

  // Calculate arc angle needed to fit text, or use provided arcAngle
  // Arc length = radius * angle, so angle = arcLength / radius
  const calculatedArcAngle = arcAngle ?? totalTextWidth / radius;

  // Calculate angle step between characters
  const angleStep = calculatedArcAngle / Math.max(charCount - 1, 1);

  // Start angle offset to center the text
  const centerOffset = calculatedArcAngle / 2;

  return (
    <group position={[0, height, 0]}>
      {chars.map((char, i) => {
        // Calculate angle for this character (centered around startAngle)
        const angle = startAngle - centerOffset + i * angleStep;

        // Position on cylinder surface (slightly offset outward for visibility)
        const x = (radius + 0.1) * Math.sin(angle);
        const z = (radius + 0.1) * Math.cos(angle);

        // Rotation to face outward (perpendicular to cylinder surface)
        const rotationY = angle;

        return (
          <Text
            key={i}
            position={[x, 0, z]}
            rotation={[0, rotationY, 0]}
            fontSize={fontSize}
            color={color}
            anchorX="center"
            anchorY="middle"
          >
            {char}
          </Text>
        );
      })}
    </group>
  );
};

// Industrial grain silo - typical flour mill storage
// European-style covered bus stop with advertisements
const BusStop: React.FC<{
  position: [number, number, number];
  rotation?: number;
}> = ({ position, rotation = 0 }) => {
  const shelterWidth = 4;
  const shelterDepth = 1.8;
  const shelterHeight = 2.8;
  const adPanelWidth = 1.4;
  const adPanelHeight = 2;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Ground platform */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[shelterWidth + 0.4, 0.1, shelterDepth + 0.4]} />
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>

      {/* Corner posts - dark green metal */}
      {[
        [-shelterWidth / 2, shelterDepth / 2],
        [shelterWidth / 2, shelterDepth / 2],
        [-shelterWidth / 2, -shelterDepth / 2],
        [shelterWidth / 2, -shelterDepth / 2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, shelterHeight / 2, z]} castShadow>
          <boxGeometry args={[0.08, shelterHeight, 0.08]} />
          <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}

      {/* Roof */}
      <mesh position={[0, shelterHeight + 0.15, 0]} castShadow>
        <boxGeometry args={[shelterWidth + 0.3, 0.08, shelterDepth + 0.5]} />
        <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0, shelterHeight + 0.06, 0]}>
        <boxGeometry args={[shelterWidth - 0.1, 0.04, shelterDepth + 0.3]} />
        <meshStandardMaterial color="#a7f3d0" transparent opacity={0.3} roughness={0.1} />
      </mesh>

      {/* Back panel - glass */}
      <mesh position={[0, shelterHeight / 2, -shelterDepth / 2 - 0.02]}>
        <boxGeometry args={[shelterWidth - 0.1, shelterHeight - 0.3, 0.04]} />
        <meshStandardMaterial color="#e0f2fe" transparent opacity={0.4} roughness={0.1} />
      </mesh>

      {/* LEFT AD PANEL - Millos Flour */}
      <group position={[-shelterWidth / 2 - 0.05, 0, 0]}>
        <mesh position={[0, shelterHeight / 2, 0]} castShadow>
          <boxGeometry args={[0.1, shelterHeight - 0.2, shelterDepth - 0.2]} />
          <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[-0.06, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#fff8e1" roughness={0.5} />
        </mesh>
        <mesh position={[0.06, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#fff8e1" roughness={0.5} />
        </mesh>
        {/* Front ad content */}
        <group position={[-0.07, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.14}
            color="#1e3a5f"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            MillOS FLOUR
          </Text>
          <Text
            position={[0, -0.6, 0.002]}
            fontSize={0.1}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Bake With Love!
          </Text>
          <group position={[0, 0.05, 0.002]}>
            <mesh>
              <capsuleGeometry args={[0.18, 0.25, 8, 12]} />
              <meshStandardMaterial color="#d4a574" roughness={0.6} />
            </mesh>
            {[-0.1, 0, 0.1].map((x, i) => (
              <mesh key={i} position={[x, 0.12, 0.15]} rotation={[0.3, 0, 0]}>
                <boxGeometry args={[0.04, 0.12, 0.02]} />
                <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
              </mesh>
            ))}
          </group>
        </group>
        {/* Back ad content */}
        <group position={[0.07, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshBasicMaterial color="#fbbf24" />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.14}
            color="#1e3a5f"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            MillOS FLOUR
          </Text>
          <Text
            position={[0, -0.6, 0.002]}
            fontSize={0.1}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Bake With Love!
          </Text>
          <group position={[0, 0.05, 0.002]}>
            <mesh>
              <capsuleGeometry args={[0.18, 0.25, 8, 12]} />
              <meshStandardMaterial color="#d4a574" roughness={0.6} />
            </mesh>
            {[-0.1, 0, 0.1].map((x, i) => (
              <mesh key={i} position={[x, 0.12, 0.15]} rotation={[0.3, 0, 0]}>
                <boxGeometry args={[0.04, 0.12, 0.02]} />
                <meshStandardMaterial color="#8b5a2b" roughness={0.7} />
              </mesh>
            ))}
          </group>
        </group>
      </group>

      {/* RIGHT AD PANEL - Dead Dino */}
      <group position={[shelterWidth / 2 + 0.05, 0, 0]}>
        <mesh position={[0, shelterHeight / 2, 0]} castShadow>
          <boxGeometry args={[0.1, shelterHeight - 0.2, shelterDepth - 0.2]} />
          <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0.06, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#e8f5e9" roughness={0.5} />
        </mesh>
        <mesh position={[-0.06, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <planeGeometry args={[adPanelWidth, adPanelHeight]} />
          <meshStandardMaterial color="#e8f5e9" roughness={0.5} />
        </mesh>
        {/* Front ad content */}
        <group position={[0.07, adPanelHeight / 2 + 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshBasicMaterial color="#e65100" />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.12}
            color="#ffffff"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DEAD DINO
          </Text>
          <Text
            position={[0, -0.65, 0.002]}
            fontSize={0.08}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Fill Up & Smile!
          </Text>
          <group position={[0, 0, 0.002]} scale={0.45}>
            <mesh>
              <sphereGeometry args={[0.5, 12, 10]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <mesh position={[0.35, 0.35, 0]}>
              <sphereGeometry args={[0.32, 12, 10]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <group position={[0.45, 0.42, 0.22]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.12, 0.03, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[0.12, 0.03, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
            </group>
          </group>
          <Text
            position={[0, -0.4, 0.002]}
            fontSize={0.1}
            color="#e65100"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            Just 99p/L
          </Text>
        </group>
        {/* Back ad content */}
        <group position={[-0.07, adPanelHeight / 2 + 0.3, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <mesh position={[0, 0.65, 0.001]}>
            <planeGeometry args={[1.3, 0.35]} />
            <meshBasicMaterial color="#e65100" />
          </mesh>
          <Text
            position={[0, 0.65, 0.002]}
            fontSize={0.12}
            color="#ffffff"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            DEAD DINO
          </Text>
          <Text
            position={[0, -0.65, 0.002]}
            fontSize={0.08}
            color="#4a5568"
            anchorX="center"
            anchorY="middle"
          >
            Fill Up & Smile!
          </Text>
          <group position={[0, 0, 0.002]} scale={0.45}>
            <mesh>
              <sphereGeometry args={[0.5, 12, 10]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <mesh position={[0.35, 0.35, 0]}>
              <sphereGeometry args={[0.32, 12, 10]} />
              <meshStandardMaterial color="#4caf50" roughness={0.6} />
            </mesh>
            <group position={[0.45, 0.42, 0.22]}>
              <mesh rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.12, 0.03, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
              <mesh rotation={[0, 0, -Math.PI / 4]}>
                <boxGeometry args={[0.12, 0.03, 0.02]} />
                <meshBasicMaterial color="#212121" />
              </mesh>
            </group>
          </group>
          <Text
            position={[0, -0.4, 0.002]}
            fontSize={0.1}
            color="#e65100"
            fontWeight="bold"
            anchorX="center"
            anchorY="middle"
          >
            Just 99p/L
          </Text>
        </group>
      </group>

      {/* Bench */}
      <group position={[0, 0, -shelterDepth / 2 + 0.35]}>
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[shelterWidth - 0.5, 0.08, 0.4]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.8} />
        </mesh>
        {[-1.2, 0, 1.2].map((x, i) => (
          <mesh key={i} position={[x, 0.22, 0]} castShadow>
            <boxGeometry args={[0.08, 0.44, 0.35]} />
            <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Bus stop pole and sign */}
      <group position={[shelterWidth / 2 + 0.8, 0, shelterDepth / 2]}>
        <mesh position={[0, 1.8, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 3.6, 8]} />
          <meshStandardMaterial color="#1f4e3d" roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh position={[0, 3.3, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.35, 0.06, 16]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        <mesh position={[0, 3.3, 0.035]}>
          <circleGeometry args={[0.28, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 2.9, 0.04]} castShadow>
          <boxGeometry args={[0.5, 0.25, 0.04]} />
          <meshStandardMaterial color="#1f2937" roughness={0.6} />
        </mesh>
        <Text
          position={[0, 2.9, 0.07]}
          fontSize={0.12}
          color="#fef3c7"
          anchorX="center"
          anchorY="middle"
        >
          42
        </Text>
      </group>

      {/* Timetable */}
      <mesh position={[0, 1.6, -shelterDepth / 2 + 0.02]} castShadow>
        <boxGeometry args={[0.6, 0.8, 0.04]} />
        <meshStandardMaterial color="#1f2937" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.6, -shelterDepth / 2 + 0.05]}>
        <planeGeometry args={[0.5, 0.7]} />
        <meshBasicMaterial color="#f5f5f5" />
      </mesh>
      <Text
        position={[0, 1.85, -shelterDepth / 2 + 0.06]}
        fontSize={0.06}
        color="#1f2937"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
      >
        TIMETABLE
      </Text>
      <Text
        position={[0, 1.65, -shelterDepth / 2 + 0.06]}
        fontSize={0.04}
        color="#4b5563"
        anchorX="center"
        anchorY="middle"
      >
        Route 42 to Town Centre
      </Text>
    </group>
  );
};

const GrainSilo: React.FC<{
  position: [number, number, number];
  radius?: number;
  height?: number;
  color?: string;
}> = ({ position, radius = 5, height = 30, color = '#94a3b8' }) => (
  <group position={position}>
    {/* Main cylindrical body */}
    <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 24]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.4} />
    </mesh>
    {/* Corrugated texture rings */}
    {Array.from({ length: Math.floor(height / 3) }).map((_, i) => (
      <mesh key={`ring-${i}`} position={[0, 1.5 + i * 3, 0]} castShadow>
        <torusGeometry args={[radius + 0.05, 0.08, 8, 24]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} metalness={0.5} />
      </mesh>
    ))}
    {/* Conical roof */}
    <mesh position={[0, height + radius * 0.4, 0]} castShadow>
      <coneGeometry args={[radius + 0.3, radius * 0.8, 24]} />
      <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.5} />
    </mesh>
    {/* Roof cap/vent */}
    <mesh position={[0, height + radius * 0.8, 0]} castShadow>
      <cylinderGeometry args={[0.8, 1, 1.5, 12]} />
      <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
    </mesh>
    {/* Access ladder */}
    <group position={[radius - 0.1, 0, 0]}>
      {/* Rails */}
      <mesh position={[-0.15, height / 2, 0]} castShadow>
        <boxGeometry args={[0.08, height, 0.08]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0.15, height / 2, 0]} castShadow>
        <boxGeometry args={[0.08, height, 0.08]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Rungs */}
      {Array.from({ length: Math.floor(height / 0.5) }).map((_, i) => (
        <mesh key={`rung-${i}`} position={[0, 0.5 + i * 0.5, 0]} castShadow>
          <boxGeometry args={[0.35, 0.04, 0.04]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
      {/* Safety cage */}
      <mesh position={[0.3, height / 2 + 5, 0]}>
        <cylinderGeometry args={[0.5, 0.5, height - 10, 8, 1, true]} />
        <meshStandardMaterial
          color="#fbbf24"
          roughness={0.4}
          metalness={0.5}
          wireframe
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
    {/* Foundation ring */}
    <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius + 0.5, radius + 0.8, 0.6, 24]} />
      <meshStandardMaterial color="#6b7280" roughness={0.9} />
    </mesh>
    {/* Company marking on silo - curved to wrap around cylinder */}
    <CurvedText text="MillOS" radius={radius} height={height * 0.6} fontSize={2} color="#1e293b" />
  </group>
);

// Grain elevator tower - iconic tall structure for flour mills
const GrainElevator: React.FC<{
  position: [number, number, number];
}> = ({ position }) => {
  const towerWidth = 8;
  const towerDepth = 6;
  const towerHeight = 45;

  return (
    <group position={position}>
      {/* Main tower body */}
      <mesh position={[0, towerHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[towerWidth, towerHeight, towerDepth]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Horizontal bands/levels */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`band-${i}`} position={[0, 5 + i * 5, 0]} castShadow>
          <boxGeometry args={[towerWidth + 0.3, 0.4, towerDepth + 0.3]} />
          <meshStandardMaterial color="#64748b" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
      {/* Head house (top structure) */}
      <mesh position={[0, towerHeight + 3, 0]} castShadow>
        <boxGeometry args={[towerWidth + 2, 6, towerDepth + 2]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Peaked roof */}
      <mesh position={[0, towerHeight + 7.5, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[towerDepth + 3, 3, towerWidth + 3]} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[0, towerHeight + 9, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <boxGeometry args={[towerDepth + 2, 1.5, towerWidth + 1]} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Elevator leg housing (diagonal conveyor) */}
      <mesh
        position={[towerWidth / 2 + 1.5, towerHeight / 2, 0]}
        rotation={[0, 0, 0.15]}
        castShadow
      >
        <boxGeometry args={[3, towerHeight + 5, 3]} />
        <meshStandardMaterial color="#64748b" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Ground hopper / intake */}
      <mesh position={[towerWidth / 2 + 3, 2, 0]} castShadow>
        <boxGeometry args={[6, 4, 5]} />
        <meshStandardMaterial color="#475569" roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Hopper grate */}
      <mesh position={[towerWidth / 2 + 3, 4.1, 0]}>
        <boxGeometry args={[4, 0.2, 3]} />
        <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Windows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <React.Fragment key={`win-${i}`}>
          <mesh position={[towerWidth / 2 + 0.1, 8 + i * 6, 0]}>
            <boxGeometry args={[0.2, 2, 1.5]} />
            <meshStandardMaterial color="#1e3a5f" transparent opacity={0.6} metalness={0.5} />
          </mesh>
          <mesh position={[-towerWidth / 2 - 0.1, 8 + i * 6, 0]}>
            <boxGeometry args={[0.2, 2, 1.5]} />
            <meshStandardMaterial color="#1e3a5f" transparent opacity={0.6} metalness={0.5} />
          </mesh>
        </React.Fragment>
      ))}
      {/* External stairs */}
      <group position={[-towerWidth / 2 - 1.5, 0, towerDepth / 2]}>
        {Array.from({ length: 30 }).map((_, i) => (
          <mesh key={`stair-${i}`} position={[0, i * 1.5 + 0.5, 0]} castShadow>
            <boxGeometry args={[2, 0.15, 0.6]} />
            <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.5} />
          </mesh>
        ))}
        {/* Stair railings */}
        <mesh position={[-0.9, towerHeight / 3, 0]} castShadow>
          <boxGeometry args={[0.1, towerHeight / 1.5, 0.1]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
        </mesh>
        <mesh position={[0.9, towerHeight / 3, 0]} castShadow>
          <boxGeometry args={[0.1, towerHeight / 1.5, 0.1]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
        </mesh>
      </group>
      {/* Foundation */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[towerWidth + 3, 1, towerDepth + 3]} />
        <meshStandardMaterial color="#6b7280" roughness={0.9} />
      </mesh>
      {/* Company signage on head house (dark top section) */}
      <Text
        position={[0, towerHeight + 4, (towerDepth + 2) / 2 + 0.05]}
        fontSize={1.2}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        MillOS
      </Text>
      <Text
        position={[0, towerHeight + 2.2, (towerDepth + 2) / 2 + 0.05]}
        fontSize={0.6}
        color="#e2e8f0"
        anchorX="center"
        anchorY="middle"
      >
        GRAIN MILL
      </Text>
    </group>
  );
};

// Connecting conveyor bridge between structures
const ConveyorBridge: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
}> = ({ start, end }) => {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const angle = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
  const yRot = Math.atan2(dx, dz);

  return (
    <group
      position={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]}
      rotation={[angle, yRot, 0]}
    >
      {/* Main bridge housing */}
      <mesh castShadow>
        <boxGeometry args={[2, 1.5, length]} />
        <meshStandardMaterial color="#64748b" roughness={0.6} metalness={0.4} />
      </mesh>
      {/* Support structure underneath */}
      <mesh position={[0, -1, 0]}>
        <boxGeometry args={[0.3, 0.5, length - 2]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.5} />
      </mesh>
    </group>
  );
};

// Loading dock canopy for trucks
const LoadingDockCanopy: React.FC<{
  position: [number, number, number];
  width?: number;
  depth?: number;
  rotation?: number;
}> = ({ position, width = 15, depth = 8, rotation = 0 }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Canopy roof */}
    <mesh position={[0, 6, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, 0.2, depth]} />
      <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
    </mesh>
    {/* Corrugated roof panels */}
    {Array.from({ length: Math.floor(depth / 2) }).map((_, i) => (
      <mesh key={`panel-${i}`} position={[0, 6.15, -depth / 2 + 1 + i * 2]} castShadow>
        <boxGeometry args={[width - 0.2, 0.1, 0.5]} />
        <meshStandardMaterial color="#64748b" roughness={0.5} metalness={0.5} />
      </mesh>
    ))}
    {/* Support columns */}
    {[
      [-width / 2 + 1, depth / 2 - 1],
      [width / 2 - 1, depth / 2 - 1],
      [-width / 2 + 1, -depth / 2 + 1],
      [width / 2 - 1, -depth / 2 + 1],
    ].map(([x, z], i) => (
      <mesh key={`col-${i}`} position={[x, 3, z]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 6, 8]} />
        <meshStandardMaterial color="#475569" roughness={0.5} metalness={0.5} />
      </mesh>
    ))}
    {/* Lighting fixtures */}
    {[-width / 3, 0, width / 3].map((x, i) => (
      <group key={`light-${i}`} position={[x, 5.7, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.2, 0.4]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <boxGeometry args={[0.6, 0.08, 0.3]} />
          <meshBasicMaterial color="#fef3c7" />
        </mesh>
      </group>
    ))}
    {/* Gutter */}
    <mesh position={[0, 5.8, depth / 2]} castShadow>
      <boxGeometry args={[width + 0.5, 0.3, 0.4]} />
      <meshStandardMaterial color="#64748b" roughness={0.6} metalness={0.5} />
    </mesh>
  </group>
);

// Industrial storage tank - horizontal cylindrical tank with legs
const StorageTank: React.FC<{
  position: [number, number, number];
  length?: number;
  radius?: number;
  rotation?: number;
  color?: string;
}> = ({ position, length = 8, radius = 2.5, rotation = 0, color = '#e5e7eb' }) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {/* Main cylindrical tank body */}
    <mesh position={[0, radius + 1.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, length, 16]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.5} />
    </mesh>
    {/* End caps - hemispherical */}
    <mesh position={[-length / 2, radius + 1.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <sphereGeometry args={[radius, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.5} />
    </mesh>
    <mesh position={[length / 2, radius + 1.5, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
      <sphereGeometry args={[radius, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.5} />
    </mesh>
    {/* Support legs - 4 saddle supports */}
    {[-length / 3, length / 3].map((x, i) => (
      <group key={`legs-${i}`} position={[x, 0, 0]}>
        {/* Left leg */}
        <mesh position={[0, 0.75, -radius * 0.7]} castShadow>
          <boxGeometry args={[0.4, 1.5, 0.4]} />
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Right leg */}
        <mesh position={[0, 0.75, radius * 0.7]} castShadow>
          <boxGeometry args={[0.4, 1.5, 0.4]} />
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Cross brace */}
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.3, 0.3, radius * 1.4]} />
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Saddle */}
        <mesh position={[0, 1.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry
            args={[radius + 0.1, radius + 0.1, 0.6, 12, 1, false, Math.PI, Math.PI]}
          />
          <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
        </mesh>
      </group>
    ))}
    {/* Pipe fittings on top */}
    <mesh position={[0, radius * 2 + 1.5, 0]} castShadow>
      <cylinderGeometry args={[0.3, 0.3, 0.8, 8]} />
      <meshStandardMaterial color="#6b7280" roughness={0.4} metalness={0.6} />
    </mesh>
    <mesh position={[length / 4, radius * 2 + 1.5, 0]} castShadow>
      <cylinderGeometry args={[0.2, 0.2, 0.6, 8]} />
      <meshStandardMaterial color="#6b7280" roughness={0.4} metalness={0.6} />
    </mesh>
    {/* Ladder access */}
    <group position={[0, 0, -radius - 0.2]}>
      <mesh position={[0, radius + 1.5, 0]} castShadow>
        <boxGeometry args={[0.08, radius * 2 + 1, 0.08]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0.3, radius + 1.5, 0]} castShadow>
        <boxGeometry args={[0.08, radius * 2 + 1, 0.08]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Rungs */}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={`rung-${i}`} position={[0.15, 0.5 + i * 0.5, 0]} castShadow>
          <boxGeometry args={[0.25, 0.04, 0.04]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.4} metalness={0.5} />
        </mesh>
      ))}
    </group>
  </group>
);

// Propane tank - smaller vertical cylindrical tank
const PropaneTank: React.FC<{
  position: [number, number, number];
  height?: number;
  radius?: number;
}> = ({ position, height = 4, radius = 1.2 }) => (
  <group position={position}>
    {/* Main cylindrical body */}
    <mesh position={[0, height / 2 + 0.5, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 12]} />
      <meshStandardMaterial color="#f5f5f5" roughness={0.3} metalness={0.4} />
    </mesh>
    {/* Domed top */}
    <mesh position={[0, height + 0.5, 0]} castShadow>
      <sphereGeometry args={[radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#f5f5f5" roughness={0.3} metalness={0.4} />
    </mesh>
    {/* Domed bottom */}
    <mesh position={[0, 0.5, 0]} rotation={[Math.PI, 0, 0]} castShadow>
      <sphereGeometry args={[radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#f5f5f5" roughness={0.3} metalness={0.4} />
    </mesh>
    {/* Support legs - 3 legs */}
    {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle, i) => (
      <mesh
        key={`leg-${i}`}
        position={[Math.sin(angle) * (radius + 0.2), 0.25, Math.cos(angle) * (radius + 0.2)]}
        castShadow
      >
        <boxGeometry args={[0.25, 0.5, 0.25]} />
        <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.4} />
      </mesh>
    ))}
    {/* Valve assembly on top */}
    <mesh position={[0, height + radius + 0.3, 0]} castShadow>
      <cylinderGeometry args={[0.15, 0.2, 0.4, 8]} />
      <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
    </mesh>
    <mesh position={[0, height + radius + 0.6, 0]} castShadow>
      <boxGeometry args={[0.4, 0.2, 0.4]} />
      <meshStandardMaterial color="#1f2937" roughness={0.4} metalness={0.6} />
    </mesh>
    {/* Pressure gauge */}
    <mesh position={[radius + 0.1, height * 0.7, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.15, 0.15, 0.1, 12]} />
      <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.4} />
    </mesh>
    {/* Warning stripe band */}
    <mesh position={[0, height * 0.3 + 0.5, 0]} castShadow>
      <cylinderGeometry args={[radius + 0.02, radius + 0.02, 0.3, 12]} />
      <meshStandardMaterial color="#dc2626" roughness={0.5} />
    </mesh>
  </group>
);

// Optimized car component - good looks with efficient rendering
// Uses React.memo, reduced geometry segments, consolidated meshes
const CuteCar: React.FC<{
  position: [number, number, number];
  rotation?: number;
  color?: string;
  style?: 'sedan' | 'hatchback' | 'suv' | 'pickup';
}> = React.memo(({ position, rotation = 0, color = '#ef4444', style = 'sedan' }) => {
  // Memoize dimensions lookup
  const { d, cabinX, cabinY } = useMemo(() => {
    const dimensions = {
      sedan: { bodyLength: 3.2, bodyWidth: 1.4, bodyHeight: 0.7, cabinLength: 1.8, cabinHeight: 0.65 },
      hatchback: { bodyLength: 2.6, bodyWidth: 1.3, bodyHeight: 0.65, cabinLength: 1.4, cabinHeight: 0.6 },
      suv: { bodyLength: 3.4, bodyWidth: 1.6, bodyHeight: 0.9, cabinLength: 2.2, cabinHeight: 0.75 },
      pickup: { bodyLength: 3.8, bodyWidth: 1.5, bodyHeight: 0.75, cabinLength: 1.2, cabinHeight: 0.7 },
    };
    const dim = dimensions[style];
    return {
      d: dim,
      cabinX: style === 'pickup' ? -0.5 : 0,
      cabinY: 0.4 + dim.bodyHeight / 2 + dim.cabinHeight / 2,
    };
  }, [style]);

  const darkColor = '#2d3748';
  const trimColor = '#4a5568';

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Main body - single shadow-casting mesh */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[d.bodyLength, d.bodyHeight, d.bodyWidth]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
      </mesh>

      {/* Cabin/roof */}
      <mesh position={[cabinX, cabinY, 0]} castShadow>
        <boxGeometry args={[d.cabinLength, d.cabinHeight, d.bodyWidth - 0.1]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.4} />
      </mesh>

      {/* Window pillars - A and C combined per side */}
      {[-1, 1].map((side) => (
        <group key={`pillars-${side}`}>
          <mesh position={[cabinX + d.cabinLength / 2 - 0.06, cabinY, side * (d.bodyWidth / 2 - 0.04)]}>
            <boxGeometry args={[0.08, d.cabinHeight + 0.02, 0.06]} />
            <meshStandardMaterial color={darkColor} roughness={0.6} />
          </mesh>
          {style !== 'pickup' && (
            <mesh position={[cabinX - d.cabinLength / 2 + 0.06, cabinY, side * (d.bodyWidth / 2 - 0.04)]}>
              <boxGeometry args={[0.08, d.cabinHeight + 0.02, 0.06]} />
              <meshStandardMaterial color={darkColor} roughness={0.6} />
            </mesh>
          )}
          {/* B-pillar */}
          <mesh position={[cabinX - 0.05, cabinY, side * (d.bodyWidth / 2 - 0.03)]}>
            <boxGeometry args={[0.06, d.cabinHeight + 0.02, 0.04]} />
            <meshStandardMaterial color={darkColor} roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Roof rails for SUV only */}
      {style === 'suv' &&
        [-1, 1].map((side) => (
          <mesh key={`roof-rail-${side}`} position={[cabinX, cabinY + d.cabinHeight / 2 + 0.03, side * (d.bodyWidth / 2 - 0.12)]}>
            <boxGeometry args={[d.cabinLength - 0.3, 0.04, 0.05]} />
            <meshStandardMaterial color="#718096" roughness={0.4} metalness={0.6} />
          </mesh>
        ))}

      {/* Windows - front and back */}
      <mesh position={[cabinX + d.cabinLength / 2 - 0.05, cabinY, 0]}>
        <boxGeometry args={[0.02, d.cabinHeight - 0.18, d.bodyWidth - 0.3]} />
        <meshStandardMaterial color="#a8d4e6" transparent opacity={0.75} metalness={0.7} roughness={0.05} />
      </mesh>
      {style !== 'pickup' && (
        <mesh position={[cabinX - d.cabinLength / 2 + 0.05, cabinY, 0]}>
          <boxGeometry args={[0.02, d.cabinHeight - 0.18, d.bodyWidth - 0.3]} />
          <meshStandardMaterial color="#a8d4e6" transparent opacity={0.75} metalness={0.7} roughness={0.05} />
        </mesh>
      )}

      {/* Side windows - simplified to one per side */}
      {[-1, 1].map((side) => (
        <mesh key={`side-window-${side}`} position={[cabinX, cabinY, side * (d.bodyWidth / 2)]}>
          <boxGeometry args={[d.cabinLength - 0.25, d.cabinHeight - 0.18, 0.02]} />
          <meshStandardMaterial color="#a8d4e6" transparent opacity={0.75} metalness={0.7} roughness={0.05} />
        </mesh>
      ))}

      {/* Door handles - simplified */}
      {[-1, 1].map((side) => (
        <group key={`door-${side}`}>
          <mesh position={[0.15, 0.45, side * (d.bodyWidth / 2 + 0.01)]}>
            <boxGeometry args={[0.12, 0.04, 0.02]} />
            <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} />
          </mesh>
          {style !== 'pickup' && (
            <mesh position={[-0.7, 0.45, side * (d.bodyWidth / 2 + 0.01)]}>
              <boxGeometry args={[0.12, 0.04, 0.02]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.2} />
            </mesh>
          )}
        </group>
      ))}

      {/* Side mirrors - simplified to single mesh per side */}
      {[-1, 1].map((side) => (
        <mesh key={`mirror-${side}`} position={[cabinX + d.cabinLength / 2 - 0.15, cabinY - 0.15, side * (d.bodyWidth / 2 + 0.15)]}>
          <boxGeometry args={[0.1, 0.07, 0.06]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.3} />
        </mesh>
      ))}

      {/* Front grille - single mesh */}
      <mesh position={[d.bodyLength / 2 + 0.01, 0.32, 0]}>
        <boxGeometry args={[0.04, 0.22, d.bodyWidth * 0.5]} />
        <meshStandardMaterial color={darkColor} roughness={0.7} />
      </mesh>

      {/* Headlights - simplified */}
      {[-0.4, 0.4].map((z, i) => (
        <mesh key={`headlight-${i}`} position={[d.bodyLength / 2 + 0.02, 0.38, z]}>
          <boxGeometry args={[0.06, 0.16, 0.26]} />
          <meshBasicMaterial color="#fffde7" />
        </mesh>
      ))}

      {/* Taillights - simplified */}
      {[-0.45, 0.45].map((z, i) => (
        <mesh key={`taillight-${i}`} position={[-d.bodyLength / 2 - 0.02, 0.38, z]}>
          <boxGeometry args={[0.05, 0.14, 0.2]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
      ))}

      {/* License plates */}
      <mesh position={[d.bodyLength / 2 + 0.02, 0.18, 0]}>
        <boxGeometry args={[0.02, 0.08, 0.25]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.5} />
      </mesh>
      <mesh position={[-d.bodyLength / 2 - 0.02, 0.18, 0]}>
        <boxGeometry args={[0.02, 0.08, 0.25]} />
        <meshStandardMaterial color="#f7fafc" roughness={0.5} />
      </mesh>

      {/* Wheels - optimized with fewer segments */}
      {[
        [d.bodyLength / 2 - 0.5, -d.bodyWidth / 2 - 0.05],
        [d.bodyLength / 2 - 0.5, d.bodyWidth / 2 + 0.05],
        [-d.bodyLength / 2 + 0.5, -d.bodyWidth / 2 - 0.05],
        [-d.bodyLength / 2 + 0.5, d.bodyWidth / 2 + 0.05],
      ].map(([x, z], i) => (
        <group key={`wheel-${i}`} position={[x, 0.22, z]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.27, 0.27, 0.16, 10]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.95} />
          </mesh>
          <mesh position={[0, z > 0 ? 0.08 : -0.08, 0]}>
            <cylinderGeometry args={[0.15, 0.15, 0.03, 10]} />
            <meshStandardMaterial color="#a0aec0" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Bumpers - simplified */}
      <mesh position={[d.bodyLength / 2 + 0.1, 0.18, 0]} castShadow>
        <boxGeometry args={[0.12, 0.18, d.bodyWidth - 0.15]} />
        <meshStandardMaterial color={trimColor} roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[-d.bodyLength / 2 - 0.1, 0.18, 0]} castShadow>
        <boxGeometry args={[0.12, 0.18, d.bodyWidth - 0.15]} />
        <meshStandardMaterial color={trimColor} roughness={0.7} metalness={0.2} />
      </mesh>

      {/* Pickup truck bed */}
      {style === 'pickup' && (
        <group>
          <mesh position={[0.9, 0.45, 0]} castShadow>
            <boxGeometry args={[1.4, 0.1, d.bodyWidth - 0.1]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={`bed-wall-${side}`} position={[0.9, 0.7, side * (d.bodyWidth / 2 - 0.08)]} castShadow>
              <boxGeometry args={[1.4, 0.4, 0.08]} />
              <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[1.62, 0.65, 0]} castShadow>
            <boxGeometry args={[0.08, 0.3, d.bodyWidth - 0.25]} />
            <meshStandardMaterial color={color} roughness={0.5} />
          </mesh>
        </group>
      )}

      {/* Shadow underneath */}
      <mesh
        position={[0, FLOOR_LAYERS.wornPrimary, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorEffects}
      >
        <planeGeometry args={[d.bodyLength + 0.5, d.bodyWidth + 0.3]} />
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={0.15}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>
    </group>
  );
});

// Car colors palette - fun and varied
const CAR_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#64748b', // Slate gray
  '#1f2937', // Dark gray
  '#ffffff', // White
  '#fbbf24', // Yellow
];

// Parking lot with cute parked cars
const ParkingLot: React.FC<{
  position: [number, number, number];
  rows?: number;
  spotsPerRow?: number;
  rotation?: number;
}> = ({ position, rows = 2, spotsPerRow = 5, rotation = 0 }) => {
  // Generate random but consistent car placements
  const cars = useMemo(() => {
    const carList: Array<{
      row: number;
      spot: number;
      color: string;
      style: 'sedan' | 'hatchback' | 'suv' | 'pickup';
      occupied: boolean;
    }> = [];

    for (let row = 0; row < rows; row++) {
      for (let spot = 0; spot < spotsPerRow; spot++) {
        // ~75% occupancy rate
        const occupied = (row * spotsPerRow + spot) % 4 !== 2;
        if (occupied) {
          const styles: Array<'sedan' | 'hatchback' | 'suv' | 'pickup'> = [
            'sedan',
            'hatchback',
            'suv',
            'pickup',
          ];
          carList.push({
            row,
            spot,
            color: CAR_COLORS[(row * spotsPerRow + spot * 3) % CAR_COLORS.length],
            style: styles[(row + spot) % styles.length],
            occupied: true,
          });
        }
      }
    }
    return carList;
  }, [rows, spotsPerRow]);

  const spotWidth = 3.5;
  const spotDepth = 5;
  const aisleWidth = 6;
  const totalWidth = spotsPerRow * spotWidth;
  const totalDepth = rows * spotDepth + (rows > 1 ? aisleWidth : 0);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Asphalt surface - exteriorMid */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[totalWidth + 4, totalDepth + 4]} />
        <meshStandardMaterial
          color="#374151"
          roughness={0.9}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorMid.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorMid.units}
        />
      </mesh>

      {/* Parking spot markings */}
      {Array.from({ length: rows }).map((_, row) => (
        <group
          key={`row-${row}`}
          position={[
            0,
            EXTERIOR_LAYERS.groundOverlay,
            row * (spotDepth + aisleWidth / 2) - totalDepth / 2 + spotDepth / 2,
          ]}
        >
          {/* Spot dividers */}
          {Array.from({ length: spotsPerRow + 1 }).map((_, spot) => (
            <mesh
              key={`divider-${row}-${spot}`}
              position={[spot * spotWidth - totalWidth / 2, 0, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={RENDER_ORDER.floorMarkings}
            >
              <planeGeometry args={[0.15, spotDepth - 0.5]} />
              <meshBasicMaterial
                color="#ffffff"
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
                polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
              />
            </mesh>
          ))}
          {/* Front line of row */}
          <mesh
            position={[0, 0, spotDepth / 2 - 0.25]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={RENDER_ORDER.floorMarkings}
          >
            <planeGeometry args={[totalWidth, 0.15]} />
            <meshBasicMaterial
              color="#ffffff"
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
              polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            />
          </mesh>
        </group>
      ))}

      {/* Parked cars */}
      {cars.map((car, i) => {
        const xPos = car.spot * spotWidth - totalWidth / 2 + spotWidth / 2;
        const zPos = car.row * (spotDepth + aisleWidth / 2) - totalDepth / 2 + spotDepth / 2;
        // Slight random offset for natural look
        const xOffset = (((car.spot * 7) % 5) - 2) * 0.1;
        const zOffset = (((car.row * 11 + car.spot) % 5) - 2) * 0.15;
        const rotOffset = (((car.spot * 3) % 5) - 2) * 0.02;

        return (
          <CuteCar
            key={`car-${i}`}
            position={[xPos + xOffset, 0, zPos + zOffset]}
            rotation={Math.PI / 2 + rotOffset}
            color={car.color}
            style={car.style}
          />
        );
      })}

      {/* Corner bollards */}
      {[
        [-totalWidth / 2 - 1.5, -totalDepth / 2 - 1.5],
        [totalWidth / 2 + 1.5, -totalDepth / 2 - 1.5],
        [-totalWidth / 2 - 1.5, totalDepth / 2 + 1.5],
        [totalWidth / 2 + 1.5, totalDepth / 2 + 1.5],
      ].map(([x, z], i) => (
        <mesh key={`bollard-${i}`} position={[x, 0.4, z]} castShadow>
          <cylinderGeometry args={[0.15, 0.15, 0.8, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
      ))}

      {/* Parking sign */}
      <group position={[totalWidth / 2 + 2, 0, 0]}>
        {/* Sign pole */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 3, 8]} />
          <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.3} />
        </mesh>
        {/* Sign */}
        <mesh position={[0, 2.8, 0]} castShadow>
          <boxGeometry args={[1.2, 1.2, 0.1]} />
          <meshStandardMaterial color="#3b82f6" roughness={0.5} />
        </mesh>
        {/* P letter */}
        <Text
          position={[0, 2.8, 0.06]}
          fontSize={0.7}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          P
        </Text>
      </group>

      {/* Small trees at corners for decoration */}
      <SimpleTree position={[-totalWidth / 2 - 3, 0, -totalDepth / 2 - 3]} scale={0.6} />
      <SimpleTree position={[totalWidth / 2 + 3, 0, totalDepth / 2 + 3]} scale={0.7} />
    </group>
  );
};

// Victorian Brick Tunnel Entrance - decorative industrial gatehouse style
const TunnelEntrance: React.FC<{
  position: [number, number, number];
  rotation?: number;
  length?: number;
}> = ({ position, rotation = 0, length = 14 }) => {
  const tunnelWidth = 9;
  const tunnelHeight = 6;
  const brickColor = '#8d4004'; // Victorian Red Brick
  const stoneColor = '#a89f91'; // Portland Stone details

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* ===== TUNNEL INTERIOR ===== */}
      {/* Road surface inside tunnel */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[tunnelWidth - 1, length + 2]} />
        <meshStandardMaterial color="#292524" roughness={0.9} />
      </mesh>

      {/* Tunnel Lining (Dark Brick) - Tilted away from map center */}
      {/* User Instruction: "90 degrees, away from the center of the map" */}
      <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, Math.PI / 2, 0]}>
        {/* args: [topRadius, bottomRadius, height, segments, openEnded, thetaStart, thetaLength] */}
        {/* Rotation X=PI/2 tilts it horizontally, Y=PI/2 orients it away from center */}
        <cylinderGeometry
          args={[
            tunnelWidth / 2 - 0.5,
            tunnelWidth / 2 - 0.5,
            length + 0.1,
            32,
            1,
            true,
            0,
            Math.PI,
          ]}
        />
        <meshStandardMaterial color="#3e2723" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* ===== ENTRANCE FACADE (Main visual part) ===== */}
      {/* Rotated 180 degrees so decorative greebles face outward toward factory */}
      <group position={[0, 0, -length / 2 - 0.1]} rotation={[0, Math.PI, 0]}>
        {/* Main Brick Facade Wall */}
        <group>
          {/* Left Column */}
          <mesh position={[-tunnelWidth / 2 - 1, tunnelHeight / 2, 0]} castShadow>
            <boxGeometry args={[3, tunnelHeight + 2, 1.2]} />
            <meshStandardMaterial color={brickColor} roughness={0.8} />
          </mesh>
          {/* Right Column */}
          <mesh position={[tunnelWidth / 2 + 1, tunnelHeight / 2, 0]} castShadow>
            <boxGeometry args={[3, tunnelHeight + 2, 1.2]} />
            <meshStandardMaterial color={brickColor} roughness={0.8} />
          </mesh>
          {/* Top Section */}
          <mesh position={[0, tunnelHeight + 1.5, 0]} castShadow>
            <boxGeometry args={[tunnelWidth + 5, 3, 1.2]} />
            <meshStandardMaterial color={brickColor} roughness={0.8} />
          </mesh>
        </group>

        {/* Stone Archway Trim */}
        <mesh position={[0, tunnelHeight / 2 - 0.5, 0.65]} rotation={[0, 0, Math.PI]}>
          {/* Custom shape for arch outline could be complex, using torus segment for approximation */}
          <torusGeometry args={[tunnelWidth / 2, 0.6, 8, 16, Math.PI]} />
          <meshStandardMaterial color={stoneColor} roughness={0.6} />
        </mesh>

        {/* Keystone */}
        <mesh position={[0, tunnelHeight / 2 + tunnelWidth / 2 + 0.5, 0.7]} castShadow>
          <boxGeometry args={[1.2, 1.5, 1.4]} />
          <meshStandardMaterial color={stoneColor} roughness={0.5} />
        </mesh>

        {/* Base Plinths (Stone) */}
        <mesh position={[-tunnelWidth / 2 - 1, 1, 0.1]} castShadow>
          <boxGeometry args={[3.2, 2, 1.4]} />
          <meshStandardMaterial color={stoneColor} roughness={0.7} />
        </mesh>
        <mesh position={[tunnelWidth / 2 + 1, 1, 0.1]} castShadow>
          <boxGeometry args={[3.2, 2, 1.4]} />
          <meshStandardMaterial color={stoneColor} roughness={0.7} />
        </mesh>

        {/* Cornice / Coping Stones at top */}
        <mesh position={[0, tunnelHeight + 3, 0]} castShadow>
          <boxGeometry args={[tunnelWidth + 6, 0.6, 1.6]} />
          <meshStandardMaterial color={stoneColor} roughness={0.7} />
        </mesh>

        {/* Decorative Parapet on top */}
        <group position={[0, tunnelHeight + 4, 0]}>
          <mesh position={[0, -0.2, 0]}>
            <boxGeometry args={[tunnelWidth + 5, 0.8, 1]} />
            <meshStandardMaterial color={brickColor} roughness={0.8} />
          </mesh>
          {/* Spikes/Finials */}
          {[-6, -3, 0, 3, 6].map((x) => (
            <mesh position={[x, 0.8, 0]} key={x}>
              <sphereGeometry args={[0.4]} />
              <meshStandardMaterial color={stoneColor} />
            </mesh>
          ))}
        </group>

        {/* Lanterns on sides */}
        {[-tunnelWidth / 2 - 1, tunnelWidth / 2 + 1].map((x) => (
          <group position={[x, tunnelHeight / 2 + 1, 0.8]} key={x}>
            <mesh>
              <boxGeometry args={[0.5, 0.8, 0.5]} />
              <meshStandardMaterial color="#222" metalness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.3, 0.6, 0.6]} />
              <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={2} />
            </mesh>
          </group>
        ))}

        {/* Date Plaque */}
        <group position={[0, tunnelHeight + 2, 0.65]}>
          <mesh>
            <boxGeometry args={[3, 1, 0.1]} />
            <meshStandardMaterial color={stoneColor} />
          </mesh>
          <Text
            position={[0, 0, 0.06]}
            fontSize={0.5}
            color="#3e2723"
            anchorX="center"
            anchorY="middle"
          >
            1892
          </Text>
        </group>
      </group>

      {/* ===== EXIT FACADE (Simpler version) ===== */}
      <group position={[0, 0, length / 2 + 0.1]}>
        <mesh position={[0, tunnelHeight / 2, 0]} castShadow>
          <boxGeometry args={[tunnelWidth + 2, tunnelHeight + 1, 1]} />
          <meshStandardMaterial color={brickColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, tunnelHeight + 1, 0]} castShadow>
          <boxGeometry args={[tunnelWidth + 4, 1.5, 1]} />
          <meshStandardMaterial color={brickColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, tunnelHeight + 1.8, 0]} castShadow>
          <boxGeometry args={[tunnelWidth + 4.4, 0.4, 1.2]} />
          <meshStandardMaterial color={stoneColor} roughness={0.7} />
        </mesh>
      </group>

      {/* Ivy/Foliage Growing on it (Procedural cubes for now) */}
      {[
        { pos: [-tunnelWidth / 2 - 2, 1, -length / 2 + 0.5], scale: [1, 2, 1] },
        { pos: [tunnelWidth / 2 + 2, 2, -length / 2 + 0.5], scale: [1.2, 3, 0.8] },
        { pos: [-tunnelWidth / 2 - 1.5, 4, -length / 2 + 0.2], scale: [0.8, 1, 0.5] },
      ].map((item, i) => (
        <mesh position={item.pos as [number, number, number]} key={i} castShadow>
          <boxGeometry args={item.scale as [number, number, number]} />
          <meshStandardMaterial color="#2d5a27" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
};

// Connecting road segment from tunnel to parking lot
const ConnectingRoad: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  width?: number;
}> = ({ start, end, width = 6 }) => {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const length = Math.sqrt(dx * dx + dz * dz);
  const angle = Math.atan2(dx, dz);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;

  return (
    <group>
      {/* Road surface */}
      <mesh
        position={[midX, FLOOR_LAYERS.puddle, midZ]}
        rotation={[-Math.PI / 2, 0, angle]}
        receiveShadow
      >
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial color="#374151" roughness={0.85} />
      </mesh>

      {/* Edge lines */}
      <mesh
        position={[
          midX - Math.cos(angle) * (width / 2 - 0.2),
          FLOOR_LAYERS.wornPrimary,
          midZ + Math.sin(angle) * (width / 2 - 0.2),
        ]}
        rotation={[-Math.PI / 2, 0, angle]}
      >
        <planeGeometry args={[0.15, length]} />
        <meshBasicMaterial
          color="#ffffff"
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>
      <mesh
        position={[
          midX + Math.cos(angle) * (width / 2 - 0.2),
          FLOOR_LAYERS.wornPrimary,
          midZ - Math.sin(angle) * (width / 2 - 0.2),
        ]}
        rotation={[-Math.PI / 2, 0, angle]}
      >
        <planeGeometry args={[0.15, length]} />
        <meshBasicMaterial
          color="#ffffff"
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>

      {/* Center dashed line */}
      {Array.from({ length: Math.floor(length / 4) }).map((_, i) => {
        const t = (i * 4 + 2) / length;
        const x = start[0] + dx * t;
        const z = start[2] + dz * t;
        return (
          <mesh
            key={`dash-${i}`}
            position={[x, FLOOR_LAYERS.wornPrimary, z]}
            rotation={[-Math.PI / 2, 0, angle]}
          >
            <planeGeometry args={[0.15, 2]} />
            <meshBasicMaterial
              color="#fbbf24"
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
              polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            />
          </mesh>
        );
      })}

      {/* Grass verges on sides - exteriorBase */}
      <mesh
        position={[
          midX - Math.cos(angle) * (width / 2 + 2),
          EXTERIOR_LAYERS.ground,
          midZ + Math.sin(angle) * (width / 2 + 2),
        ]}
        rotation={[-Math.PI / 2, 0, angle]}
        receiveShadow
      >
        <planeGeometry args={[3, length]} />
        <meshStandardMaterial
          color={GRASS_COLORS.verge}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>
      <mesh
        position={[
          midX + Math.cos(angle) * (width / 2 + 2),
          EXTERIOR_LAYERS.ground,
          midZ - Math.sin(angle) * (width / 2 + 2),
        ]}
        rotation={[-Math.PI / 2, 0, angle]}
        receiveShadow
      >
        <planeGeometry args={[3, length]} />
        <meshStandardMaterial
          color={GRASS_COLORS.verge}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>
    </group>
  );
};

// Checkpoint Charlie style barrier gate with animated lifting arms
// DESIGN: Booth sits BESIDE the road, barrier arms span ACROSS the road
// Barriers automatically raise when trucks approach
const CheckpointBarrier: React.FC<{
  position: [number, number, number];
  rotation?: number;
  label?: string;
  roadWidth?: number;
  checkpointType?: 'shipping' | 'receiving';
}> = ({ position, rotation = 0, label = 'CHECKPOINT', roadWidth = 16, checkpointType }) => {
  const barrierArmRef = useRef<THREE.Group>(null);
  const barrierArm2Ref = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.MeshBasicMaterial>(null);
  const light2Ref = useRef<THREE.MeshBasicMaterial>(null);

  // Get production speed for synchronized truck timing
  const productionSpeed = useProductionStore((s) => s.productionSpeed);

  // Animate the barrier arms - raise when trucks approach
  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const adjustedTime = time * (productionSpeed * 0.25 + 0.2);
    const CYCLE_LENGTH = 60;

    // Calculate truck positions
    const shippingCycle = adjustedTime % CYCLE_LENGTH;
    const receivingCycle = (adjustedTime + CYCLE_LENGTH / 2) % CYCLE_LENGTH;

    const shippingState = calculateShippingTruckState(shippingCycle, time);
    const receivingState = calculateReceivingTruckState(receivingCycle, time);

    // Checkpoint positions: shipping at z=110, receiving at z=-110
    // Detect when trucks are within range of this checkpoint
    const DETECTION_RANGE = 40; // Units from checkpoint to start raising
    const checkpointZ = position[2];

    // Determine if this checkpoint should respond to shipping or receiving trucks
    const isShippingCheckpoint = checkpointType === 'shipping' || checkpointZ > 0;

    let shouldRaiseInbound = false; // Barrier 1 (left side, z=+3 relative)
    let shouldRaiseOutbound = false; // Barrier 2 (right side, z=-3 relative)

    if (isShippingCheckpoint) {
      // Shipping checkpoint at z=110
      // Truck enters from z=200 (coming from positive z towards dock at z=53)
      // Truck exits towards z=200 (going from dock back to road)
      const truckZ = shippingState.z;

      // Entering phases: truck coming from road towards dock
      // 'entering' is when truck is on straight approach, 'slowing' would be deceleration
      const isEntering = shippingState.phase === 'entering' || shippingState.phase === 'slowing';
      // Leaving phases: truck going from dock back to road
      // 'accelerating' is when truck actually passes checkpoint on the way out
      const isLeaving =
        shippingState.phase === 'turning_out' ||
        shippingState.phase === 'accelerating' ||
        shippingState.phase === 'leaving';

      if (isEntering && truckZ > checkpointZ - 20 && truckZ < checkpointZ + DETECTION_RANGE) {
        shouldRaiseInbound = true;
      }
      if (isLeaving && truckZ > checkpointZ - 20 && truckZ < checkpointZ + DETECTION_RANGE) {
        shouldRaiseOutbound = true;
      }
    } else {
      // Receiving checkpoint at z=-110
      const truckZ = receivingState.z;

      // Entering phases: truck coming from road (z=-200) towards dock (z=-53)
      const isEntering = receivingState.phase === 'entering' || receivingState.phase === 'slowing';
      // Leaving phases: truck going from dock back to road
      // 'accelerating' is when truck actually passes checkpoint on the way out
      const isLeaving =
        receivingState.phase === 'turning_out' ||
        receivingState.phase === 'accelerating' ||
        receivingState.phase === 'leaving';

      if (isEntering && truckZ < checkpointZ + 20 && truckZ > checkpointZ - DETECTION_RANGE) {
        shouldRaiseInbound = true;
      }
      if (isLeaving && truckZ < checkpointZ + 20 && truckZ > checkpointZ - DETECTION_RANGE) {
        shouldRaiseOutbound = true;
      }
    }

    // Target angles: 0 = down, PI/2 = up
    // Both booms raise together when truck approaches from either direction
    const shouldRaiseBoth = shouldRaiseInbound || shouldRaiseOutbound;
    const targetAngle1 = shouldRaiseBoth ? Math.PI / 2 : 0;
    const targetAngle2 = shouldRaiseBoth ? Math.PI / 2 : 0;

    // Smooth animation for barrier 1 (faster response)
    if (barrierArmRef.current) {
      const currentAngle1 = barrierArmRef.current.rotation.z;
      const diff1 = targetAngle1 - currentAngle1;
      barrierArmRef.current.rotation.z += diff1 * 0.08;
    }

    // Smooth animation for barrier 2
    if (barrierArm2Ref.current) {
      const currentAngle2 = barrierArm2Ref.current.rotation.z;
      const diff2 = targetAngle2 - currentAngle2;
      barrierArm2Ref.current.rotation.z += diff2 * 0.08;
    }

    // Flashing warning lights when barrier is down (truck approaching)
    const flash = Math.sin(time * 4) > 0;
    const isUp1 = barrierArmRef.current && barrierArmRef.current.rotation.z > Math.PI / 4;
    const isUp2 = barrierArm2Ref.current && barrierArm2Ref.current.rotation.z > Math.PI / 4;
    if (lightRef.current) {
      lightRef.current.color.setHex(flash && !isUp1 ? 0xff0000 : 0x440000);
    }
    if (light2Ref.current) {
      light2Ref.current.color.setHex(flash && !isUp2 ? 0xff0000 : 0x440000);
    }
  });

  // Arms span half the road from each side
  const armLength = roadWidth / 2 + 1;
  const boothWidth = 3.5;
  const boothDepth = 3;
  const boothHeight = 3.5;
  // Booth offset: positioned beside the road (half road width + gap + half booth)
  const boothOffset = roadWidth / 2 + 2 + boothWidth / 2;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* ===== CHECKPOINT BOOTH (beside road on LEFT side) ===== */}
      <group position={[-boothOffset, 0, 0]}>
        {/* Booth base/platform */}
        <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
          <boxGeometry args={[boothWidth + 1, 0.3, boothDepth + 1]} />
          <meshStandardMaterial color="#4b5563" roughness={0.8} />
        </mesh>

        {/* Main booth structure */}
        <mesh position={[0, boothHeight / 2 + 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[boothWidth, boothHeight, boothDepth]} />
          <meshStandardMaterial color="#f5f5f4" roughness={0.6} />
        </mesh>

        {/* Booth roof */}
        <mesh position={[0, boothHeight + 0.5, 0]} castShadow>
          <boxGeometry args={[boothWidth + 0.8, 0.3, boothDepth + 0.8]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} />
        </mesh>

        {/* Windows - front and back */}
        {[boothDepth / 2 + 0.01, -boothDepth / 2 - 0.01].map((z, i) => (
          <mesh key={`window-${i}`} position={[0, boothHeight / 2 + 0.8, z]}>
            <planeGeometry args={[boothWidth - 0.6, 1.5]} />
            <meshStandardMaterial
              color="#87ceeb"
              transparent
              opacity={0.6}
              metalness={0.5}
              roughness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Side windows */}
        {[boothWidth / 2 + 0.01, -boothWidth / 2 - 0.01].map((x, i) => (
          <mesh
            key={`side-window-${i}`}
            position={[x, boothHeight / 2 + 0.8, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[boothDepth - 0.4, 1.5]} />
            <meshStandardMaterial
              color="#87ceeb"
              transparent
              opacity={0.6}
              metalness={0.5}
              roughness={0.1}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Checkpoint sign on roof */}
        <mesh position={[0, boothHeight + 1.2, 0]} castShadow>
          <boxGeometry args={[boothWidth + 0.4, 0.7, 0.2]} />
          <meshStandardMaterial color="#1e3a8a" roughness={0.5} />
        </mesh>
        <Text
          position={[0, boothHeight + 1.2, 0.12]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {label}
        </Text>
        <Text
          position={[0, boothHeight + 1.2, -0.12]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          rotation={[0, Math.PI, 0]}
        >
          {label}
        </Text>
      </group>

      {/* ===== BARRIER 1 - LEFT EDGE OF ROAD (inbound lane at z=+3) ===== */}
      <group position={[-roadWidth / 2 - 0.5, 0, 3]}>
        {/* Barrier post */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[0.4, 3, 0.4]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        {/* Warning light housing */}
        <mesh position={[0, 3.2, 0]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.5]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} />
        </mesh>
        <mesh position={[0.26, 3.2, 0]}>
          <circleGeometry args={[0.15, 12]} />
          <meshBasicMaterial ref={lightRef} color="#ff0000" />
        </mesh>

        {/* Barrier arm pivot - swings inward across road */}
        <group ref={barrierArmRef} position={[0, 2.9, 0]}>
          <mesh position={[armLength / 2, 0, 0]} castShadow>
            <boxGeometry args={[armLength, 0.2, 0.2]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          {/* Red stripes */}
          {Array.from({ length: Math.floor(armLength / 1.2) }).map((_, i) => (
            <mesh key={`stripe1-${i}`} position={[0.6 + i * 1.2, 0, 0.11]} castShadow>
              <boxGeometry args={[0.5, 0.21, 0.02]} />
              <meshStandardMaterial color="#dc2626" roughness={0.5} />
            </mesh>
          ))}
          {/* Counterweight */}
          <mesh position={[-0.4, 0, 0]} castShadow>
            <boxGeometry args={[0.6, 0.3, 0.3]} />
            <meshStandardMaterial color="#374151" roughness={0.6} />
          </mesh>
          {/* End reflector */}
          <mesh position={[armLength + 0.15, 0, 0]} castShadow>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* ===== BARRIER 2 - RIGHT EDGE OF ROAD (outbound lane at z=-3) ===== */}
      <group position={[roadWidth / 2 + 0.5, 0, -3]}>
        {/* Barrier post */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[0.4, 3, 0.4]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} />
        </mesh>
        {/* Warning light housing */}
        <mesh position={[0, 3.2, 0]} castShadow>
          <boxGeometry args={[0.5, 0.4, 0.5]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} />
        </mesh>
        <mesh position={[-0.26, 3.2, 0]}>
          <circleGeometry args={[0.15, 12]} />
          <meshBasicMaterial ref={light2Ref} color="#ff0000" />
        </mesh>

        {/* Barrier arm pivot - swings inward across road (rotated 180°) */}
        <group ref={barrierArm2Ref} position={[0, 2.9, 0]} rotation={[0, Math.PI, 0]}>
          <mesh position={[armLength / 2, 0, 0]} castShadow>
            <boxGeometry args={[armLength, 0.2, 0.2]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
          {/* Red stripes */}
          {Array.from({ length: Math.floor(armLength / 1.2) }).map((_, i) => (
            <mesh key={`stripe2-${i}`} position={[0.6 + i * 1.2, 0, 0.11]} castShadow>
              <boxGeometry args={[0.5, 0.21, 0.02]} />
              <meshStandardMaterial color="#dc2626" roughness={0.5} />
            </mesh>
          ))}
          {/* Counterweight */}
          <mesh position={[-0.4, 0, 0]} castShadow>
            <boxGeometry args={[0.6, 0.3, 0.3]} />
            <meshStandardMaterial color="#374151" roughness={0.6} />
          </mesh>
          {/* End reflector */}
          <mesh position={[armLength + 0.15, 0, 0]} castShadow>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial color="#dc2626" roughness={0.5} />
          </mesh>
        </group>
      </group>

      {/* Stop lines on road surface (spanning full road width) */}
      <mesh
        position={[0, FLOOR_LAYERS.wornPrimary, 5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <planeGeometry args={[roadWidth, 0.5]} />
        <meshBasicMaterial
          color="#ffffff"
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>
      <mesh
        position={[0, FLOOR_LAYERS.wornPrimary, -5]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={RENDER_ORDER.floorMarkings}
      >
        <planeGeometry args={[roadWidth, 0.5]} />
        <meshBasicMaterial
          color="#ffffff"
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
          polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
        />
      </mesh>

      {/* Safety bollards at road edges */}
      {[
        [-roadWidth / 2 - 0.5, 6],
        [roadWidth / 2 + 0.5, 6],
        [-roadWidth / 2 - 0.5, -6],
        [roadWidth / 2 + 0.5, -6],
      ].map(([x, z], i) => (
        <mesh key={`bollard-${i}`} position={[x, 0.5, z]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 1, 8]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
};

// Factory exterior walls with large signs - positioned OUTSIDE the existing factory elements
export const FactoryExterior: React.FC<FactoryExteriorProps> = () => {
  // Wall dimensions - positioned outside the factory floor
  const wallHeight = 20; // Same height for ALL walls
  const wallThickness = 0.4;

  // Exterior wall positions - these are OUTSIDE the existing factory elements
  // Factory floor extends to about x=±60, z=±80 (for truck yards)
  // Main building is roughly x=±55, z=±45 where personnel doors are
  const buildingHalfWidth = 58; // X extent (slightly outside the x=±55 doors)
  const buildingFrontZ = 48; // Front wall Z (behind the z=42 front doors)
  const buildingBackZ = -48; // Back wall Z (behind the z=-45 back doors)

  // Dock opening dimensions - single centered opening for one truck lane
  const dockOpeningWidth = 10; // Width of the door
  const dockOpeningHeight = 10;

  // Colors
  const wallColor = '#475569';
  const trimColor = '#374151';

  // Load grass textures (high/ultra only) - now using OUTDOOR_MATERIALS.grass directly
  const grassTextures = useModelTextures('grass');

  // Configure texture tiling for external textures only (procedural already configured in sharedMaterials)
  useEffect(() => {
    // Configure external textures if available (match the global procedural repeat of 30)
    if (grassTextures.color) {
      grassTextures.color.wrapS = grassTextures.color.wrapT = THREE.RepeatWrapping;
      grassTextures.color.repeat.set(30, 30);
    }
    if (grassTextures.normal) {
      grassTextures.normal.wrapS = grassTextures.normal.wrapT = THREE.RepeatWrapping;
      grassTextures.normal.repeat.set(30, 30);
    }
    if (grassTextures.roughness) {
      grassTextures.roughness.wrapS = grassTextures.roughness.wrapT = THREE.RepeatWrapping;
      grassTextures.roughness.repeat.set(30, 30);
    }
    // NOTE: Procedural grass textures are now configured globally in sharedMaterials.ts
    // with repeat (30, 30) and anisotropic filtering - no override needed here
  }, [grassTextures]);

  // Note: grassTextures are configured above but we now use OUTDOOR_MATERIALS.grass directly
  // for seamless matching with Village/Farm areas. External textures kept for potential future use.

  return (
    <group>
      {/* ========== EXTERIOR GRASS GROUND ========== */}
      {/* Size 600x600 ensures full coverage beyond the r=400 circular sky ground plane */}
      {/* Uses shared OUTDOOR_MATERIALS.grass for seamless matching with Village/Farm areas */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <primitive object={OUTDOOR_MATERIALS.grass} attach="material" />
      </mesh>
      {/* ========== FRONT WALL (Z+) with single centered dock opening ========== */}
      {/* Left section - FULL HEIGHT - extends PAST side wall for clean corner */}
      <mesh
        position={[
          -((buildingHalfWidth + wallThickness) / 2 + dockOpeningWidth / 4),
          wallHeight / 2,
          buildingFrontZ,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            buildingHalfWidth + wallThickness - dockOpeningWidth / 2,
            wallHeight,
            wallThickness,
          ]}
        />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.8}
          metalness={0.2}
          side={THREE.DoubleSide}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>

      {/* Right section - FULL HEIGHT - extends PAST side wall for clean corner */}
      <mesh
        position={[
          (buildingHalfWidth + wallThickness) / 2 + dockOpeningWidth / 4,
          wallHeight / 2,
          buildingFrontZ,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            buildingHalfWidth + wallThickness - dockOpeningWidth / 2,
            wallHeight,
            wallThickness,
          ]}
        />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.8}
          metalness={0.2}
          side={THREE.DoubleSide}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>

      {/* Section above the centered dock opening */}
      <mesh
        position={[0, wallHeight - (wallHeight - dockOpeningHeight) / 2, buildingFrontZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[dockOpeningWidth, wallHeight - dockOpeningHeight, wallThickness]} />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.8}
          metalness={0.2}
          side={THREE.DoubleSide}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>

      {/* Front wall trim */}
      <mesh position={[0, wallHeight + 0.3, buildingFrontZ]}>
        <boxGeometry args={[buildingHalfWidth * 2 + 1, 0.6, 0.8]} />
        <meshStandardMaterial
          color={trimColor}
          roughness={0.6}
          metalness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ========== FRONT PERSONNEL ENTRANCES - Realistic Industrial Style ========== */}
      {/* Left main entrance at x=-45 - doors positioned 1.5 units in front of wall */}
      <group position={[-45, 0, buildingFrontZ + 1.5]}>
        {/* Concrete entrance platform/steps */}
        <mesh position={[0, 0.2, 1.5]} castShadow receiveShadow>
          <boxGeometry args={[5, 0.4, 4]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.08, 3.5]} castShadow receiveShadow>
          <boxGeometry args={[5, 0.16, 1.5]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
        {/* Door surround - protruding frame structure */}
        <mesh position={[0, 1.8, -0.3]} castShadow>
          <boxGeometry args={[4.5, 3.8, 1]} />
          <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
        </mesh>
        {/* Door opening recess */}
        <mesh position={[0, 1.6, 0.1]}>
          <boxGeometry args={[3.2, 3.2, 0.5]} />
          <meshStandardMaterial color="#1f2937" roughness={0.9} />
        </mesh>
        {/* Double doors - industrial blue */}
        <mesh position={[-0.75, 1.55, 0.4]} castShadow>
          <boxGeometry args={[1.4, 3, 0.15]} />
          <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0.75, 1.55, 0.4]} castShadow>
          <boxGeometry args={[1.4, 3, 0.15]} />
          <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Glass panels on doors */}
        <mesh position={[-0.75, 1.9, 0.5]}>
          <boxGeometry args={[1, 2, 0.04]} />
          <meshStandardMaterial
            color="#87ceeb"
            transparent
            opacity={0.5}
            metalness={0.6}
            roughness={0.1}
          />
        </mesh>
        <mesh position={[0.75, 1.9, 0.5]}>
          <boxGeometry args={[1, 2, 0.04]} />
          <meshStandardMaterial
            color="#87ceeb"
            transparent
            opacity={0.5}
            metalness={0.6}
            roughness={0.1}
          />
        </mesh>
        {/* Door handles - vertical pull bars */}
        <mesh position={[-0.2, 1.5, 0.55]}>
          <boxGeometry args={[0.08, 0.7, 0.08]} />
          <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0.2, 1.5, 0.55]}>
          <boxGeometry args={[0.08, 0.7, 0.08]} />
          <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Metal awning/canopy */}
        <mesh position={[0, 3.9, 0.8]} castShadow>
          <boxGeometry args={[5, 0.15, 2.5]} />
          <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
        </mesh>
        {/* Awning support brackets */}
        <mesh position={[-2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[0.12, 1, 0.12]} />
          <meshStandardMaterial color="#4b5563" metalness={0.5} />
        </mesh>
        <mesh position={[2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[0.12, 1, 0.12]} />
          <meshStandardMaterial color="#4b5563" metalness={0.5} />
        </mesh>
        {/* Handrails */}
        <mesh position={[-2.3, 0.6, 1.5]} castShadow>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        <mesh position={[2.3, 0.6, 1.5]} castShadow>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        <mesh position={[-2.3, 1.2, 2]} castShadow>
          <boxGeometry args={[0.1, 0.1, 4]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        <mesh position={[2.3, 1.2, 2]} castShadow>
          <boxGeometry args={[0.1, 0.1, 4]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        {/* Yellow safety bollards */}
        <mesh position={[-3.2, 0.5, 2.5]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
          <meshStandardMaterial color="#eab308" roughness={0.5} />
        </mesh>
        <mesh position={[3.2, 0.5, 2.5]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
          <meshStandardMaterial color="#eab308" roughness={0.5} />
        </mesh>
        {/* Exterior light fixture */}
        <mesh position={[0, 4.2, 0]} castShadow>
          <boxGeometry args={[0.6, 0.35, 0.5]} />
          <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 4.05, 0.3]}>
          <boxGeometry args={[0.4, 0.2, 0.25]} />
          <meshBasicMaterial color="#fef3c7" />
        </mesh>
      </group>

      {/* Right staff entrance at x=45 - doors positioned 1.5 units in front of wall */}
      <group position={[45, 0, buildingFrontZ + 1.5]}>
        {/* Concrete entrance platform/steps */}
        <mesh position={[0, 0.2, 1.5]} castShadow receiveShadow>
          <boxGeometry args={[5, 0.4, 4]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.08, 3.5]} castShadow receiveShadow>
          <boxGeometry args={[5, 0.16, 1.5]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
        {/* Door surround - protruding frame structure */}
        <mesh position={[0, 1.8, -0.3]} castShadow>
          <boxGeometry args={[4.5, 3.8, 1]} />
          <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
        </mesh>
        {/* Door opening recess */}
        <mesh position={[0, 1.6, 0.1]}>
          <boxGeometry args={[3.2, 3.2, 0.5]} />
          <meshStandardMaterial color="#1f2937" roughness={0.9} />
        </mesh>
        {/* Double doors - industrial blue */}
        <mesh position={[-0.75, 1.55, 0.4]} castShadow>
          <boxGeometry args={[1.4, 3, 0.15]} />
          <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0.75, 1.55, 0.4]} castShadow>
          <boxGeometry args={[1.4, 3, 0.15]} />
          <meshStandardMaterial color="#1e3a5f" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Glass panels on doors */}
        <mesh position={[-0.75, 1.9, 0.5]}>
          <boxGeometry args={[1, 2, 0.04]} />
          <meshStandardMaterial
            color="#87ceeb"
            transparent
            opacity={0.5}
            metalness={0.6}
            roughness={0.1}
          />
        </mesh>
        <mesh position={[0.75, 1.9, 0.5]}>
          <boxGeometry args={[1, 2, 0.04]} />
          <meshStandardMaterial
            color="#87ceeb"
            transparent
            opacity={0.5}
            metalness={0.6}
            roughness={0.1}
          />
        </mesh>
        {/* Door handles - vertical pull bars */}
        <mesh position={[-0.2, 1.5, 0.55]}>
          <boxGeometry args={[0.08, 0.7, 0.08]} />
          <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0.2, 1.5, 0.55]}>
          <boxGeometry args={[0.08, 0.7, 0.08]} />
          <meshStandardMaterial color="#d4d4d4" metalness={0.8} roughness={0.2} />
        </mesh>
        {/* Metal awning/canopy */}
        <mesh position={[0, 3.9, 0.8]} castShadow>
          <boxGeometry args={[5, 0.15, 2.5]} />
          <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.5} />
        </mesh>
        {/* Awning support brackets */}
        <mesh position={[-2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[0.12, 1, 0.12]} />
          <meshStandardMaterial color="#4b5563" metalness={0.5} />
        </mesh>
        <mesh position={[2, 3.4, 0.3]} rotation={[0.5, 0, 0]} castShadow>
          <boxGeometry args={[0.12, 1, 0.12]} />
          <meshStandardMaterial color="#4b5563" metalness={0.5} />
        </mesh>
        {/* Handrails */}
        <mesh position={[-2.3, 0.6, 1.5]} castShadow>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        <mesh position={[2.3, 0.6, 1.5]} castShadow>
          <boxGeometry args={[0.1, 1.2, 0.1]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        <mesh position={[-2.3, 1.2, 2]} castShadow>
          <boxGeometry args={[0.1, 0.1, 4]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        <mesh position={[2.3, 1.2, 2]} castShadow>
          <boxGeometry args={[0.1, 0.1, 4]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} />
        </mesh>
        {/* Yellow safety bollards */}
        <mesh position={[-3.2, 0.5, 2.5]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
          <meshStandardMaterial color="#eab308" roughness={0.5} />
        </mesh>
        <mesh position={[3.2, 0.5, 2.5]} castShadow>
          <cylinderGeometry args={[0.18, 0.18, 1, 12]} />
          <meshStandardMaterial color="#eab308" roughness={0.5} />
        </mesh>
        {/* Exterior light fixture */}
        <mesh position={[0, 4.2, 0]} castShadow>
          <boxGeometry args={[0.6, 0.35, 0.5]} />
          <meshStandardMaterial color="#374151" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh position={[0, 4.05, 0.3]}>
          <boxGeometry args={[0.4, 0.2, 0.25]} />
          <meshBasicMaterial color="#fef3c7" />
        </mesh>
      </group>

      {/* ========== FRONT SIGN - Large Red Sign (similar to truck signage) ========== */}
      <group position={[0, wallHeight / 2 + 2, buildingFrontZ + 1.5]}>
        {/* Main sign background - Red like the truck signs */}
        <mesh frustumCulled={false}>
          <boxGeometry args={[80, 10, 0.5]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
        {/* Gold trim border */}
        <mesh position={[0, 0, 0.3]} frustumCulled={false}>
          <boxGeometry args={[82, 10.6, 0.15]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        {/* Inner red panel */}
        <mesh position={[0, 0, 0.4]} frustumCulled={false}>
          <boxGeometry args={[79, 9.5, 0.1]} />
          <meshBasicMaterial color="#b91c1c" />
        </mesh>
        {/* Company name */}
        <Text
          position={[0, 1.5, 0.6]}
          fontSize={5}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.1}
          outlineColor="#7f1d1d"
        >
          MillOS GRAIN MILL
        </Text>
        {/* Tagline */}
        <Text
          position={[0, -2.5, 0.6]}
          fontSize={1.8}
          color="#fef3c7"
          anchorX="center"
          anchorY="middle"
        >
          EST. 1952 • QUALITY FLOUR PRODUCTS
        </Text>
      </group>

      {/* ========== BACK WALL (Z-) with dock opening ========== */}
      {/* Left section - FULL HEIGHT - extends PAST side wall for clean corner */}
      <mesh
        position={[
          -((buildingHalfWidth + wallThickness) / 2 + dockOpeningWidth / 4),
          wallHeight / 2,
          buildingBackZ,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            buildingHalfWidth + wallThickness - dockOpeningWidth / 2,
            wallHeight,
            wallThickness,
          ]}
        />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.8}
          metalness={0.2}
          side={THREE.DoubleSide}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>
      {/* Right section - FULL HEIGHT - extends PAST side wall for clean corner */}
      <mesh
        position={[
          (buildingHalfWidth + wallThickness) / 2 + dockOpeningWidth / 4,
          wallHeight / 2,
          buildingBackZ,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            buildingHalfWidth + wallThickness - dockOpeningWidth / 2,
            wallHeight,
            wallThickness,
          ]}
        />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.8}
          metalness={0.2}
          side={THREE.DoubleSide}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>
      {/* Section above dock opening - matches wall height */}
      <mesh
        position={[0, wallHeight - (wallHeight - dockOpeningHeight) / 2, buildingBackZ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[dockOpeningWidth, wallHeight - dockOpeningHeight, wallThickness]} />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.8}
          metalness={0.2}
          side={THREE.DoubleSide}
          normalMap={PROCEDURAL_TEXTURES.panelNormal}
          normalScale={new THREE.Vector2(0.2, 0.2)}
        />
      </mesh>

      {/* Back wall trim */}
      <mesh position={[0, wallHeight + 0.3, buildingBackZ]}>
        <boxGeometry args={[buildingHalfWidth * 2 + 1, 0.6, 0.8]} />
        <meshStandardMaterial
          color={trimColor}
          roughness={0.6}
          metalness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ========== BACK EMERGENCY EXITS - Realistic Industrial Style ========== */}
      {/* Left emergency exit at x=-45 - positioned 1.5 units out from wall */}
      <group position={[-45, 0, buildingBackZ - 1.5]} rotation={[0, Math.PI, 0]}>
        {/* Concrete landing pad */}
        <mesh position={[0, 0.15, 1.5]} castShadow receiveShadow>
          <boxGeometry args={[4, 0.3, 3.5]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
        {/* Door surround - protruding frame structure */}
        <mesh position={[0, 1.6, -0.2]} castShadow>
          <boxGeometry args={[3.5, 3.4, 0.8]} />
          <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
        </mesh>
        {/* Door opening recess */}
        <mesh position={[0, 1.5, 0.15]}>
          <boxGeometry args={[2.5, 3, 0.4]} />
          <meshStandardMaterial color="#1f2937" roughness={0.9} />
        </mesh>
        {/* Steel fire door - industrial green */}
        <mesh position={[0, 1.5, 0.4]} castShadow>
          <boxGeometry args={[2, 2.8, 0.12]} />
          <meshStandardMaterial color="#365314" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Small reinforced window */}
        <mesh position={[0, 2.1, 0.5]}>
          <boxGeometry args={[0.5, 0.6, 0.03]} />
          <meshStandardMaterial
            color="#64748b"
            transparent
            opacity={0.5}
            metalness={0.6}
            roughness={0.2}
          />
        </mesh>
        {/* Wire mesh on window */}
        <mesh position={[0, 2.1, 0.52]}>
          <boxGeometry args={[0.48, 0.58, 0.01]} />
          <meshStandardMaterial color="#374151" wireframe transparent opacity={0.6} />
        </mesh>
        {/* Crash bar / panic hardware */}
        <mesh position={[0, 1.3, 0.5]}>
          <boxGeometry args={[1.5, 0.12, 0.1]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Door closer at top */}
        <mesh position={[0.6, 2.75, 0.45]}>
          <boxGeometry args={[0.5, 0.15, 0.1]} />
          <meshStandardMaterial color="#374151" metalness={0.5} />
        </mesh>
        {/* EXIT sign above door - standard emergency */}
        <mesh position={[0, 3.4, 0.3]}>
          <boxGeometry args={[1, 0.45, 0.1]} />
          <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.5} />
        </mesh>
        {/* Running man pictogram area */}
        <mesh position={[0, 3.4, 0.36]}>
          <boxGeometry args={[0.8, 0.35, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Wall-mounted emergency light */}
        <mesh position={[0, 3.8, 0.2]} castShadow>
          <boxGeometry args={[0.6, 0.22, 0.15]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
        </mesh>
        <mesh position={[0, 3.7, 0.3]}>
          <boxGeometry args={[0.5, 0.1, 0.06]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.6} />
        </mesh>
        {/* Kick plate at bottom of door */}
        <mesh position={[0, 0.25, 0.48]}>
          <boxGeometry args={[1.9, 0.4, 0.03]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Yellow hazard stripes on ground */}
        <mesh position={[0, FLOOR_LAYERS.safetyMain, 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.5, 2]} />
          <meshStandardMaterial
            color="#eab308"
            roughness={0.8}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
            polygonOffsetUnits={POLYGON_OFFSET.standard.units}
          />
        </mesh>
      </group>

      {/* Right emergency exit at x=45 - positioned 1.5 units out from wall */}
      <group position={[45, 0, buildingBackZ - 1.5]} rotation={[0, Math.PI, 0]}>
        {/* Concrete landing pad */}
        <mesh position={[0, 0.15, 1.5]} castShadow receiveShadow>
          <boxGeometry args={[4, 0.3, 3.5]} />
          <meshStandardMaterial color="#6b7280" roughness={0.9} />
        </mesh>
        {/* Door surround - protruding frame structure */}
        <mesh position={[0, 1.6, -0.2]} castShadow>
          <boxGeometry args={[3.5, 3.4, 0.8]} />
          <meshStandardMaterial color="#4b5563" roughness={0.7} metalness={0.3} />
        </mesh>
        {/* Door opening recess */}
        <mesh position={[0, 1.5, 0.15]}>
          <boxGeometry args={[2.5, 3, 0.4]} />
          <meshStandardMaterial color="#1f2937" roughness={0.9} />
        </mesh>
        {/* Steel fire door - industrial green */}
        <mesh position={[0, 1.5, 0.4]} castShadow>
          <boxGeometry args={[2, 2.8, 0.12]} />
          <meshStandardMaterial color="#365314" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Small reinforced window */}
        <mesh position={[0, 2.1, 0.5]}>
          <boxGeometry args={[0.5, 0.6, 0.03]} />
          <meshStandardMaterial
            color="#64748b"
            transparent
            opacity={0.5}
            metalness={0.6}
            roughness={0.2}
          />
        </mesh>
        {/* Wire mesh on window */}
        <mesh position={[0, 2.1, 0.52]}>
          <boxGeometry args={[0.48, 0.58, 0.01]} />
          <meshStandardMaterial color="#374151" wireframe transparent opacity={0.6} />
        </mesh>
        {/* Crash bar / panic hardware */}
        <mesh position={[0, 1.3, 0.5]}>
          <boxGeometry args={[1.5, 0.12, 0.1]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Door closer at top */}
        <mesh position={[0.6, 2.75, 0.45]}>
          <boxGeometry args={[0.5, 0.15, 0.1]} />
          <meshStandardMaterial color="#374151" metalness={0.5} />
        </mesh>
        {/* EXIT sign above door - standard emergency */}
        <mesh position={[0, 3.4, 0.3]}>
          <boxGeometry args={[1, 0.45, 0.1]} />
          <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.5} />
        </mesh>
        {/* Running man pictogram area */}
        <mesh position={[0, 3.4, 0.36]}>
          <boxGeometry args={[0.8, 0.35, 0.02]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Wall-mounted emergency light */}
        <mesh position={[0, 3.8, 0.2]} castShadow>
          <boxGeometry args={[0.6, 0.22, 0.15]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.4} />
        </mesh>
        <mesh position={[0, 3.7, 0.3]}>
          <boxGeometry args={[0.5, 0.1, 0.06]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.6} />
        </mesh>
        {/* Kick plate at bottom of door */}
        <mesh position={[0, 0.25, 0.48]}>
          <boxGeometry args={[1.9, 0.4, 0.03]} />
          <meshStandardMaterial color="#6b7280" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Yellow hazard stripes on ground */}
        <mesh position={[0, FLOOR_LAYERS.safetyMain, 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.5, 2]} />
          <meshStandardMaterial
            color="#eab308"
            roughness={0.8}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
            polygonOffsetUnits={POLYGON_OFFSET.standard.units}
          />
        </mesh>
      </group>

      {/* ========== BACK SIGN - Large Red Sign (matching front sign) ========== */}
      <group position={[0, wallHeight / 2 + 2, buildingBackZ - 1.5]} rotation={[0, Math.PI, 0]}>
        {/* Main sign background - Red like the truck signs */}
        <mesh frustumCulled={false}>
          <boxGeometry args={[80, 10, 0.5]} />
          <meshBasicMaterial color="#dc2626" />
        </mesh>
        {/* Gold trim border */}
        <mesh position={[0, 0, 0.3]} frustumCulled={false}>
          <boxGeometry args={[82, 10.6, 0.15]} />
          <meshBasicMaterial color="#fbbf24" />
        </mesh>
        {/* Inner red panel */}
        <mesh position={[0, 0, 0.4]} frustumCulled={false}>
          <boxGeometry args={[79, 9.5, 0.1]} />
          <meshBasicMaterial color="#b91c1c" />
        </mesh>
        {/* Company name */}
        <Text
          position={[0, 1.5, 0.6]}
          fontSize={5}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
          outlineWidth={0.1}
          outlineColor="#7f1d1d"
        >
          MillOS GRAIN MILL
        </Text>
        {/* Tagline */}
        <Text
          position={[0, -2.5, 0.6]}
          fontSize={1.8}
          color="#fef3c7"
          anchorX="center"
          anchorY="middle"
        >
          EST. 1952 • QUALITY FLOUR PRODUCTS
        </Text>
      </group>

      {/* ========== LEFT SIDE WALL (X-) with personnel door ========== */}
      {/* Side walls end INSIDE front/back walls - front/back walls wrap around corners */}
      {/* Personnel door opening in the wall - West Exit */}
      {(() => {
        const sideWallLength = Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2;
        const doorWidth = 3;
        const doorHeight = 3;
        const doorZ = 0;
        const frontSegmentLength = sideWallLength / 2 - doorWidth / 2;
        const backSegmentLength = sideWallLength / 2 - doorWidth / 2;
        const frontSegmentZ = doorZ + doorWidth / 2 + frontSegmentLength / 2;
        const backSegmentZ = doorZ - doorWidth / 2 - backSegmentLength / 2;

        return (
          <>
            {/* Front section of left wall */}
            <mesh
              position={[-buildingHalfWidth, wallHeight / 2, frontSegmentZ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wallThickness, wallHeight, frontSegmentLength]} />
              <meshStandardMaterial
                color={wallColor}
                roughness={0.8}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Back section of left wall */}
            <mesh
              position={[-buildingHalfWidth, wallHeight / 2, backSegmentZ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wallThickness, wallHeight, backSegmentLength]} />
              <meshStandardMaterial
                color={wallColor}
                roughness={0.8}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Section above door opening */}
            <mesh
              position={[-buildingHalfWidth, doorHeight + (wallHeight - doorHeight) / 2, doorZ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wallThickness, wallHeight - doorHeight, doorWidth]} />
              <meshStandardMaterial
                color={wallColor}
                roughness={0.8}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* West Personnel Door - exterior side */}
            <group position={[-buildingHalfWidth - 0.3, 0, doorZ]} rotation={[0, Math.PI / 2, 0]}>
              <mesh position={[0, doorHeight / 2, 0]} castShadow>
                <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              <mesh position={[0, doorHeight / 2, 0.08]}>
                <boxGeometry args={[doorWidth - 0.3, doorHeight - 0.2, 0.1]} />
                <meshStandardMaterial color="#1f2937" roughness={0.8} />
              </mesh>
              <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0, doorHeight + 0.4, 0.1]}>
                <boxGeometry args={[1.5, 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.3} />
              </mesh>
              <mesh position={[0, doorHeight + 0.7, 0.1]}>
                <boxGeometry args={[0.6, 0.15, 0.1]} />
                <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
              </mesh>
            </group>
            {/* West Personnel Door - interior side */}
            <group position={[-buildingHalfWidth + 0.3, 0, doorZ]} rotation={[0, -Math.PI / 2, 0]}>
              <mesh position={[0, doorHeight / 2, 0]} castShadow>
                <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0, doorHeight + 0.4, 0.1]}>
                <boxGeometry args={[1.5, 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.3} />
              </mesh>
            </group>
          </>
        );
      })()}
      <mesh position={[-buildingHalfWidth, wallHeight + 0.3, 0]}>
        <boxGeometry
          args={[0.8, 0.6, Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2 + 0.5]}
        />
        <meshStandardMaterial
          color={trimColor}
          roughness={0.6}
          metalness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* ========== RIGHT SIDE WALL (X+) with personnel door ========== */}
      {/* Personnel door opening in the wall - East Exit */}
      {(() => {
        const sideWallLength = Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2;
        const doorWidth = 3;
        const doorHeight = 3;
        const doorZ = 0;
        const frontSegmentLength = sideWallLength / 2 - doorWidth / 2;
        const backSegmentLength = sideWallLength / 2 - doorWidth / 2;
        const frontSegmentZ = doorZ + doorWidth / 2 + frontSegmentLength / 2;
        const backSegmentZ = doorZ - doorWidth / 2 - backSegmentLength / 2;

        return (
          <>
            {/* Front section of right wall */}
            <mesh
              position={[buildingHalfWidth, wallHeight / 2, frontSegmentZ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wallThickness, wallHeight, frontSegmentLength]} />
              <meshStandardMaterial
                color={wallColor}
                roughness={0.8}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Back section of right wall */}
            <mesh
              position={[buildingHalfWidth, wallHeight / 2, backSegmentZ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wallThickness, wallHeight, backSegmentLength]} />
              <meshStandardMaterial
                color={wallColor}
                roughness={0.8}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Section above door opening */}
            <mesh
              position={[buildingHalfWidth, doorHeight + (wallHeight - doorHeight) / 2, doorZ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[wallThickness, wallHeight - doorHeight, doorWidth]} />
              <meshStandardMaterial
                color={wallColor}
                roughness={0.8}
                metalness={0.2}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* East Personnel Door - exterior side */}
            <group position={[buildingHalfWidth + 0.3, 0, doorZ]} rotation={[0, -Math.PI / 2, 0]}>
              <mesh position={[0, doorHeight / 2, 0]} castShadow>
                <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              <mesh position={[0, doorHeight / 2, 0.08]}>
                <boxGeometry args={[doorWidth - 0.3, doorHeight - 0.2, 0.1]} />
                <meshStandardMaterial color="#1f2937" roughness={0.8} />
              </mesh>
              <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0, doorHeight + 0.4, 0.1]}>
                <boxGeometry args={[1.5, 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.3} />
              </mesh>
              <mesh position={[0, doorHeight + 0.7, 0.1]}>
                <boxGeometry args={[0.6, 0.15, 0.1]} />
                <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
              </mesh>
            </group>
            {/* East Personnel Door - interior side */}
            <group position={[buildingHalfWidth - 0.3, 0, doorZ]} rotation={[0, Math.PI / 2, 0]}>
              <mesh position={[0, doorHeight / 2, 0]} castShadow>
                <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.15]} />
                <meshStandardMaterial color="#374151" roughness={0.6} metalness={0.3} />
              </mesh>
              <mesh position={[-0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[0.7, doorHeight / 2, 0.15]} castShadow>
                <boxGeometry args={[1.2, doorHeight - 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" roughness={0.5} metalness={0.3} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.65, 0.2]}>
                <boxGeometry args={[0.6, 0.8, 0.02]} />
                <meshBasicMaterial color="#1e3a5f" transparent opacity={0.7} />
              </mesh>
              <mesh position={[-0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0.7, doorHeight * 0.4, 0.2]}>
                <boxGeometry args={[0.8, 0.08, 0.05]} />
                <meshBasicMaterial color="#fbbf24" />
              </mesh>
              <mesh position={[0, doorHeight + 0.4, 0.1]}>
                <boxGeometry args={[1.5, 0.4, 0.08]} />
                <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.3} />
              </mesh>
            </group>
          </>
        );
      })()}
      <mesh position={[buildingHalfWidth, wallHeight + 0.3, 0]}>
        <boxGeometry
          args={[0.8, 0.6, Math.abs(buildingFrontZ - buildingBackZ) - wallThickness * 2 + 0.5]}
        />
        <meshStandardMaterial
          color={trimColor}
          roughness={0.6}
          metalness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* CORNER COLUMNS REMOVED - were causing visual protrusion issues */}

      {/* ========== PERIMETER FENCE ========== */}
      {/* Fence around property - with gate openings for truck access */}
      {/* Shipping road at x=20 (width 16, spans x=12-28), Receiving road at x=-20 (spans x=-28 to -12) */}
      <group>
        {/* Front fence (Z+) - left section (ends before receiving road area) */}
        <FenceSection start={[-95, 0, 85]} end={[-32, 0, 85]} />
        {/* Front fence - right section (starts after shipping road area) */}
        <FenceSection start={[32, 0, 85]} end={[95, 0, 85]} />

        {/* Back fence (Z-) - left section (ends before receiving road area) */}
        <FenceSection start={[-95, 0, -85]} end={[-32, 0, -85]} />
        {/* Back fence - right section (starts after shipping road area) */}
        <FenceSection start={[32, 0, -85]} end={[95, 0, -85]} />

        {/* Left fence (X-) */}
        <FenceSection start={[-95, 0, -85]} end={[-95, 0, 85]} />

        {/* Right fence (X+) */}
        <FenceSection start={[95, 0, -85]} end={[95, 0, 85]} />

        {/* Gate posts - front entrance (at fence gap edges) */}
        {[-32, 32].map((x, i) => (
          <group key={`gate-front-${i}`} position={[x, 0, 85]}>
            <mesh position={[0, 1.5, 0]} castShadow>
              <boxGeometry args={[0.4, 3, 0.4]} />
              <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 3.2, 0]} castShadow>
              <sphereGeometry args={[0.25, 8, 8]} />
              <meshStandardMaterial color="#37474f" roughness={0.4} metalness={0.5} />
            </mesh>
          </group>
        ))}

        {/* Gate posts - back entrance (at fence gap edges) */}
        {[-32, 32].map((x, i) => (
          <group key={`gate-back-${i}`} position={[x, 0, -85]}>
            <mesh position={[0, 1.5, 0]} castShadow>
              <boxGeometry args={[0.4, 3, 0.4]} />
              <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
            </mesh>
            <mesh position={[0, 3.2, 0]} castShadow>
              <sphereGeometry args={[0.25, 8, 8]} />
              <meshStandardMaterial color="#37474f" roughness={0.4} metalness={0.5} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ========== GROUND PLANE EXTENSION ========== */}
      {/* All exterior ground surfaces at same Y (-0.02), layered via polygonOffset */}

      {/* Asphalt area around factory - exteriorMid layer */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 180]} />
        <meshStandardMaterial
          color="#ffffff"
          map={PROCEDURAL_TEXTURES.tarmacColor}
          roughnessMap={PROCEDURAL_TEXTURES.tarmacRoughness}
          roughness={0.85}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorMid.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorMid.units}
        />
      </mesh>

      {/* Grass areas outside fence - exteriorBase layer (behind asphalt) */}
      <mesh position={[0, EXTERIOR_LAYERS.ground, 110]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[220, 50]} />
        <meshStandardMaterial
          color={GRASS_COLORS.field}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>
      <mesh position={[0, EXTERIOR_LAYERS.ground, -110]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[220, 50]} />
        <meshStandardMaterial
          color={GRASS_COLORS.field}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>
      {/* Side grass verges */}
      <mesh position={[115, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 180]} />
        <meshStandardMaterial
          color={GRASS_COLORS.verge}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>
      <mesh position={[-115, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 180]} />
        <meshStandardMaterial
          color={GRASS_COLORS.verge}
          roughness={0.95}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
          polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
        />
      </mesh>

      {/* ========== ACCESS ROADS FOR TRUCKS ========== */}
      {/* Front road (shipping trucks) - extends from z=135 to z=280 */}
      <group position={[20, 0, 195]}>
        {/* Road surface - exteriorTop (renders on top of grass) */}
        <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[16, 170]} />
          <meshStandardMaterial
            color="#2d3436"
            roughness={0.85}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorTop.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorTop.units}
          />
        </mesh>
        {/* Road edge lines - white - exteriorOverlay */}
        <mesh position={[-7.5, EXTERIOR_LAYERS.groundOverlay, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 170]} />
          <meshBasicMaterial
            color="#ffffff"
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        <mesh position={[7.5, EXTERIOR_LAYERS.groundOverlay, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 170]} />
          <meshBasicMaterial
            color="#ffffff"
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        {/* Center dashed line - yellow */}
        {Array.from({ length: 17 }).map((_, i) => (
          <mesh
            key={`front-dash-${i}`}
            position={[0, EXTERIOR_LAYERS.groundOverlay, -75 + i * 10]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.25, 5]} />
            <meshBasicMaterial
              color="#f1c40f"
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
              polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
            />
          </mesh>
        ))}
        {/* Grass shoulders - exteriorBase */}
        <mesh position={[-14, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 170]} />
          <meshStandardMaterial
            color={GRASS_COLORS.field}
            roughness={0.95}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
          />
        </mesh>
        <mesh position={[14, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 170]} />
          <meshStandardMaterial
            color={GRASS_COLORS.field}
            roughness={0.95}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
          />
        </mesh>
      </group>

      {/* Back road (receiving trucks) - extends from z=-135 to z=-280 */}
      <group position={[-20, 0, -195]}>
        {/* Road surface - exteriorTop (renders on top of grass) */}
        <mesh position={[0, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[16, 170]} />
          <meshStandardMaterial
            color="#2d3436"
            roughness={0.85}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorTop.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorTop.units}
          />
        </mesh>
        {/* Road edge lines - white - exteriorOverlay */}
        <mesh position={[-7.5, EXTERIOR_LAYERS.groundOverlay, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 170]} />
          <meshBasicMaterial
            color="#ffffff"
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        <mesh position={[7.5, EXTERIOR_LAYERS.groundOverlay, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 170]} />
          <meshBasicMaterial
            color="#ffffff"
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
          />
        </mesh>
        {/* Center dashed line - yellow */}
        {Array.from({ length: 17 }).map((_, i) => (
          <mesh
            key={`back-dash-${i}`}
            position={[0, EXTERIOR_LAYERS.groundOverlay, -75 + i * 10]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.25, 5]} />
            <meshBasicMaterial
              color="#f1c40f"
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.exteriorOverlay.factor}
              polygonOffsetUnits={POLYGON_OFFSET.exteriorOverlay.units}
            />
          </mesh>
        ))}
        {/* Grass shoulders - exteriorBase */}
        <mesh position={[-14, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 170]} />
          <meshStandardMaterial
            color={GRASS_COLORS.field}
            roughness={0.95}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
          />
        </mesh>
        <mesh position={[14, EXTERIOR_LAYERS.ground, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 170]} />
          <meshStandardMaterial
            color={GRASS_COLORS.field}
            roughness={0.95}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorBase.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorBase.units}
          />
        </mesh>
      </group>

      {/* ========== CHECKPOINT BARRIERS AT TRUCK BAY ENTRANCES ========== */}
      {/* Front checkpoint - shipping dock entrance (on the road at z=110) */}
      <CheckpointBarrier
        position={[20, 0, 110]}
        rotation={0}
        label="SHIPPING"
        checkpointType="shipping"
      />

      {/* Back checkpoint - receiving dock entrance (on the road at z=-110) */}
      <CheckpointBarrier
        position={[-20, 0, -110]}
        rotation={Math.PI}
        label="RECEIVING"
        checkpointType="receiving"
      />

      {/* ========== PARKLAND AREA (Front-right) - trees/benches use instanced versions ========== */}
      <group position={[75, 0, 100]}>
        {/* Grass patch - lowered and using polygonOffset to prevent z-fighting */}
        <mesh position={[0, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[18, 16]} />
          <meshStandardMaterial
            color={GRASS_COLORS.park}
            roughness={0.95}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>

        {/* Trees and benches now rendered via instanced components */}

        {/* Small path - raised to y=0.15 to prevent z-fighting with grass and other surfaces */}
        <mesh position={[0, 0.15, -12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[3, 8]} />
          <meshStandardMaterial color="#9e9e9e" roughness={0.85} />
        </mesh>
      </group>
      {/* Front parkland instanced trees/benches (absolute positions) */}
      <SimpleTreeInstances trees={FRONT_PARKLAND_TREES} />
      <ParkBenchInstances benches={FRONT_PARKLAND_BENCHES} />

      {/* ========== SMALL OFFICE BUILDINGS ========== */}
      {/* Admin office - front left outside fence */}
      <SmallOffice position={[-45, 0, 110]} size={[14, 7, 10]} rotation={0} />

      {/* Security/visitor office - near front gate */}
      <group position={[-25, 0, 115]}>
        <mesh position={[0, 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[6, 4, 5]} />
          <meshStandardMaterial color="#607d8b" roughness={0.7} />
        </mesh>
        <mesh position={[0, 4.3, 0]} castShadow>
          <boxGeometry args={[6.5, 0.5, 5.5]} />
          <meshStandardMaterial color="#455a64" roughness={0.6} />
        </mesh>
        {/* Window */}
        <mesh position={[0, 2.2, 2.55]}>
          <planeGeometry args={[4, 2]} />
          <meshStandardMaterial color="#90caf9" metalness={0.4} roughness={0.2} />
        </mesh>
        {/* "SECURITY" sign */}
        <Text
          position={[0, 3.5, 2.6]}
          fontSize={0.4}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          SECURITY
        </Text>
      </group>

      {/* Maintenance shed - back area */}
      <group position={[80, 0, -75]}>
        <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[10, 5, 8]} />
          <meshStandardMaterial color="#6d4c41" roughness={0.85} />
        </mesh>
        {/* Pitched roof */}
        <mesh position={[0, 5.5, 0]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[11, 1, 9]} />
          <meshStandardMaterial color="#5d4037" roughness={0.8} />
        </mesh>
        {/* Large door */}
        <mesh position={[0, 1.5, 4.05]}>
          <planeGeometry args={[6, 3]} />
          <meshStandardMaterial color="#3e2723" roughness={0.9} />
        </mesh>
      </group>

      {/* ========== STREET LAMPS ========== */}
      {[
        [-50, 80],
        [50, 80],
        [-50, -80],
        [50, -80],
        [-90, 0],
        [90, 0],
      ].map(([x, z], i) => (
        <group key={`lamp-${i}`} position={[x, 0, z]}>
          {/* Pole */}
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.15, 6, 8]} />
            <meshStandardMaterial color="#37474f" roughness={0.6} metalness={0.3} />
          </mesh>
          {/* Lamp head */}
          <mesh position={[0, 6.2, 0]}>
            <cylinderGeometry args={[0.4, 0.3, 0.5, 8]} />
            <meshStandardMaterial color="#263238" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* Light bulb area */}
          <mesh position={[0, 5.9, 0]}>
            <cylinderGeometry args={[0.25, 0.35, 0.3, 8]} />
            <meshBasicMaterial color="#fff9c4" />
          </mesh>
        </group>
      ))}

      {/* ========== PARKING AREA MARKINGS (Front) ========== */}
      <group position={[60, 0.01, 70]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={`parking-${i}`} position={[i * 4 - 8, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.15, 5]} />
            <meshBasicMaterial
              color="#ffffff"
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={POLYGON_OFFSET.moderate.factor}
              polygonOffsetUnits={POLYGON_OFFSET.moderate.units}
            />
          </mesh>
        ))}
      </group>

      {/* ========== GAS STATION ========== */}
      <GasStation position={[-85, 0, 140]} rotation={0} />

      {/* Caravan parked behind gas station */}
      <Caravan position={[-100, 0, 125]} rotation={0.3} color="#f5e6d3" />

      {/* ========== BUS STOP ========== */}
      {/* European-style bus shelter on shipping road, past checkpoint, near farm */}
      <BusStop position={[29, 0, 140]} rotation={-Math.PI / 2} />

      {/* ========== EMPLOYEE PARKING LOT WITH CUTE CARS ========== */}
      {/* Parking lot positioned outside east fence (fence is at x=95) */}
      <ParkingLot position={[120, 0, 50]} rows={2} spotsPerRow={6} rotation={0} />

      {/* Tunnel entrance - connects to external road network */}
      <TunnelEntrance position={[160, 0, 50]} rotation={Math.PI / 2} length={15} />

      {/* Connecting road from tunnel exit to parking lot */}
      <ConnectingRoad start={[147, 0, 50]} end={[135, 0, 50]} width={6} />

      {/* Road from parking lot towards factory gate */}
      <ConnectingRoad start={[120, 0, 35]} end={[120, 0, 70]} width={5} />

      {/* Road connecting parking area to front entrance gate */}
      <ConnectingRoad start={[105, 0, 85]} end={[120, 0, 70]} width={5} />

      {/* A few extra parked cars near the gas station for variety */}
      <CuteCar
        position={[-75, 0, 125]}
        rotation={Math.PI * 0.9}
        color="#3b82f6"
        style="hatchback"
      />
      <CuteCar position={[-70, 0, 125]} rotation={Math.PI * 1.1} color="#f59e0b" style="sedan" />
      <CuteCar position={[-65, 0, 126]} rotation={Math.PI} color="#22c55e" style="suv" />

      {/* ========== NISSEN HUTS ========== */}
      {/* Storage hut near back fence */}
      <NissenHut position={[-75, 0, -100]} length={14} rotation={0} />
      {/* Equipment hut near side */}
      <NissenHut position={[85, 0, -100]} length={10} rotation={Math.PI / 2} />

      {/* ========== OFFICE APARTMENT BUILDINGS ========== */}
      {/* Main office block - front left (moved right to not occlude kiosk parasol) */}
      <OfficeApartment position={[-78, 0, 95]} floors={4} rotation={0} />
      {/* Smaller office block - back right */}
      <OfficeApartment position={[100, 0, -100]} floors={3} rotation={Math.PI} />

      {/* ========== ADDITIONAL SMALL BUILDINGS ========== */}
      {/* Weighbridge office */}
      <group position={[30, 0, 120]}>
        <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[4, 3, 3]} />
          <meshStandardMaterial color="#90a4ae" roughness={0.7} />
        </mesh>
        <mesh position={[0, 3.2, 0]} castShadow>
          <boxGeometry args={[4.5, 0.4, 3.5]} />
          <meshStandardMaterial color="#607d8b" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.5, 1.55]}>
          <planeGeometry args={[3, 2]} />
          <meshStandardMaterial color="#81d4fa" metalness={0.3} roughness={0.2} />
        </mesh>
        <Text
          position={[0, 2.8, 1.6]}
          fontSize={0.3}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          WEIGHBRIDGE
        </Text>
        {/* Weighbridge platform */}
        <mesh position={[0, 0.1, 6]} receiveShadow>
          <boxGeometry args={[4, 0.2, 8]} />
          <meshStandardMaterial color="#616161" roughness={0.8} />
        </mesh>
      </group>

      {/* Substation */}
      <group position={[-70, 0, -60]}>
        <mesh position={[0, 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[5, 4, 4]} />
          <meshStandardMaterial color="#78909c" roughness={0.7} />
        </mesh>
        <mesh position={[0, 4.3, 0]} castShadow>
          <boxGeometry args={[5.5, 0.4, 4.5]} />
          <meshStandardMaterial color="#546e7a" roughness={0.6} />
        </mesh>
        {/* Warning sign */}
        <mesh position={[2.55, 2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#ffc107" />
        </mesh>
        <Text
          position={[2.6, 2, 0]}
          fontSize={0.15}
          color="#000000"
          anchorX="center"
          anchorY="middle"
          rotation={[0, Math.PI / 2, 0]}
        >
          DANGER
        </Text>
        {/* Electrical equipment on roof */}
        <mesh position={[0, 4.8, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 1, 8]} />
          <meshStandardMaterial color="#424242" roughness={0.6} metalness={0.4} />
        </mesh>
      </group>

      {/* Instanced trees and benches for draw call optimization (~48 -> 7 draw calls) */}
      <SimpleTreeInstances trees={MAIN_EXTERIOR_TREES} />
      <ParkBenchInstances benches={MAIN_EXTERIOR_BENCHES} />

      {/* Second parkland area - back left (trees/benches use instanced versions) */}
      <group position={[-85, 0, -110]}>
        <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[12, 12]} />
          <meshStandardMaterial color={GRASS_COLORS.lawn} roughness={0.95} />
        </mesh>
        {/* Trees and bench now rendered via instanced components */}
      </group>
      {/* Parkland instanced trees/benches (absolute positions) */}
      <SimpleTreeInstances trees={PARKLAND_TREES} />
      <ParkBenchInstances benches={PARKLAND_BENCHES} />

      {/* ========== WATER FEATURES & WATERWAY INFRASTRUCTURE ========== */}
      {/* Historically, grain mills were built near waterways for power and transport */}

      {/* Industrial Canal - West side (for barge transport of grain and flour) */}
      {/* Extended to connect with the branch canal at z=-110 */}
      <Canal position={[-145, 0, -5]} length={220} width={12} rotation={0} />

      {/* Cute English narrowboat moored on the canal */}
      <CanalBoat position={[-145, 0.1, 15]} rotation={0} />

      {/* Canal Lock Gate - controls water level for barge access */}
      <LockGate position={[-145, 0, 50]} width={10} rotation={0} />

      {/* Wooden docks removed - were floating in canal */}

      {/* Footbridge over canal - connects factory area to west */}
      {/* Rotation=PI/2 to span across canal (east-west) rather than along it */}
      <FootBridge
        position={[-145, 0, -50]}
        length={14}
        width={2.5}
        rotation={Math.PI / 2}
        style="wooden"
      />

      {/* Lake in front-right area - scenic water feature */}
      <Lake position={[120, 0, 120]} size={[40, 30]} depth={0.5} />

      {/* Food truck (taco truck) parked next to the parking lot */}
      <FoodTruck position={[135, 0, 42]} rotation={Math.PI / 2} color="#ff6b6b" name="TACOS" />

      {/* Brick carport shelter next to taco truck - outdoor eating area */}
      <BrickCarport position={[145, 0, 35]} rotation={0} size={[10, 3.5, 8]} />

      {/* River segment - runs along the back boundary */}
      <River position={[0, 0, -145]} length={280} width={20} meander={10} />

      {/* Small decorative pond near the front office buildings */}
      <Pond position={[-125, 0, 105]} radius={10} />

      {/* Upturned shopping trolley abandoned in the canal - classic British waterway decor */}
      <group position={[-143, 0.1, 36.5]} rotation={[Math.PI * 0.85, 0.35, 0.2]}>
        {/* Top rim frame */}
        {[[-0.24, 0.24, 0], [0.24, 0.24, 0]].map(([x, y, z], i) => (
          <mesh key={`rim-long-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.025, 0.025, 1.0]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {[[0, 0.24, -0.5], [0, 0.24, 0.5]].map(([x, y, z], i) => (
          <mesh key={`rim-short-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.5, 0.025, 0.025]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Corner posts */}
        {[[-0.24, 0, -0.5], [0.24, 0, -0.5], [-0.24, 0, 0.5], [0.24, 0, 0.5]].map(([x, y, z], i) => (
          <mesh key={`corner-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.025, 0.5, 0.025]} />
            <meshStandardMaterial color="#5b6370" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Long side wire mesh - horizontal wires */}
        {[-0.24, 0.24].map((x, xi) => (
          <group key={`side-h-${xi}`}>
            {[-0.15, 0, 0.15].map((y, yi) => (
              <mesh key={`wire-h-${yi}`} position={[x, y, 0]} castShadow>
                <boxGeometry args={[0.012, 0.012, 0.98]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Long side wire mesh - vertical wires */}
        {[-0.24, 0.24].map((x, xi) => (
          <group key={`side-v-${xi}`}>
            {[-0.35, -0.17, 0, 0.17, 0.35].map((z, zi) => (
              <mesh key={`wire-v-${zi}`} position={[x, 0, z]} castShadow>
                <boxGeometry args={[0.012, 0.46, 0.012]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Short end wire mesh - horizontal wires */}
        {[-0.5, 0.5].map((z, zi) => (
          <group key={`end-h-${zi}`}>
            {[-0.15, 0, 0.15].map((y, yi) => (
              <mesh key={`wire-eh-${yi}`} position={[0, y, z]} castShadow>
                <boxGeometry args={[0.46, 0.012, 0.012]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Short end wire mesh - vertical wires */}
        {[-0.5, 0.5].map((z, zi) => (
          <group key={`end-v-${zi}`}>
            {[-0.15, 0, 0.15].map((x, xi) => (
              <mesh key={`wire-ev-${xi}`} position={[x, 0, z]} castShadow>
                <boxGeometry args={[0.012, 0.46, 0.012]} />
                <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Bottom mesh - frame */}
        {[[-0.24, -0.24, 0], [0.24, -0.24, 0]].map(([x, y, z], i) => (
          <mesh key={`bot-long-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.02, 0.02, 0.98]} />
            <meshStandardMaterial color="#5b6370" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {[[0, -0.24, -0.5], [0, -0.24, 0.5]].map(([x, y, z], i) => (
          <mesh key={`bot-short-${i}`} position={[x, y, z]} castShadow>
            <boxGeometry args={[0.5, 0.02, 0.02]} />
            <meshStandardMaterial color="#5b6370" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Bottom mesh - grid wires */}
        {[-0.3, -0.1, 0.1, 0.3].map((z, i) => (
          <mesh key={`bot-wire-x-${i}`} position={[0, -0.24, z]} castShadow>
            <boxGeometry args={[0.46, 0.01, 0.01]} />
            <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {[-0.12, 0, 0.12].map((x, i) => (
          <mesh key={`bot-wire-z-${i}`} position={[x, -0.24, 0]} castShadow>
            <boxGeometry args={[0.01, 0.01, 0.98]} />
            <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.7} />
          </mesh>
        ))}
        {/* Handle bar */}
        <mesh position={[0, 0.35, -0.55]} castShadow>
          <boxGeometry args={[0.4, 0.03, 0.03]} />
          <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.7} />
        </mesh>
        {/* Handle uprights */}
        {[-0.15, 0.15].map((x, i) => (
          <mesh key={`handle-${i}`} position={[x, 0.3, -0.52]} castShadow>
            <boxGeometry args={[0.025, 0.15, 0.025]} />
            <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.7} />
          </mesh>
        ))}
        {/* Wheels (pointing up since upturned) */}
        {[
          [-0.18, -0.28, 0.4],
          [0.18, -0.28, 0.4],
          [-0.18, -0.28, -0.4],
          [0.18, -0.28, -0.4],
        ].map(([x, y, z], i) => (
          <group key={`wheel-${i}`} position={[x, y, z]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.06, 0.06, 0.03, 12]} />
              <meshStandardMaterial color="#1f2937" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.04, 0]} castShadow>
              <boxGeometry args={[0.03, 0.08, 0.03]} />
              <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.6} />
            </mesh>
          </group>
        ))}
        {/* Child seat flap - wire mesh */}
        <group position={[0, 0.1, 0.52]} rotation={[0.3, 0, 0]}>
          {[-0.1, 0, 0.1].map((y, i) => (
            <mesh key={`seat-h-${i}`} position={[0, y, 0]} castShadow>
              <boxGeometry args={[0.32, 0.01, 0.01]} />
              <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
          {[-0.12, 0, 0.12].map((x, i) => (
            <mesh key={`seat-v-${i}`} position={[x, 0, 0]} castShadow>
              <boxGeometry args={[0.01, 0.22, 0.01]} />
              <meshStandardMaterial color="#7a8a9a" roughness={0.5} metalness={0.6} />
            </mesh>
          ))}
        </group>
        {/* Rust/algae patches */}
        <mesh position={[0.15, 0.1, 0.3]}>
          <sphereGeometry args={[0.06, 8, 6]} />
          <meshStandardMaterial color="#7c5e3a" roughness={0.9} transparent opacity={0.7} />
        </mesh>
        <mesh position={[-0.1, -0.1, -0.2]}>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshStandardMaterial color="#4a6741" roughness={0.95} transparent opacity={0.6} />
        </mesh>
      </group>

      {/* Abandoned bicycle in the canal - another classic British waterway find */}
      <group position={[-147.5, 0.05, 54]} rotation={[0.25, 0.7, 0.1]}>
        {/* Front wheel */}
        <mesh position={[0.45, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.35, 0.025, 8, 24]} />
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.5} />
        </mesh>
        {/* Front spokes */}
        {[0, 60, 120].map((angle, i) => (
          <mesh
            key={`fspoke-${i}`}
            position={[0.45, 0.35, 0]}
            rotation={[Math.PI / 2, 0, (angle * Math.PI) / 180]}
            castShadow
          >
            <boxGeometry args={[0.02, 0.65, 0.02]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        {/* Rear wheel */}
        <mesh position={[-0.45, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.35, 0.025, 8, 24]} />
          <meshStandardMaterial color="#4b5563" roughness={0.6} metalness={0.5} />
        </mesh>
        {/* Rear spokes */}
        {[0, 60, 120].map((angle, i) => (
          <mesh
            key={`rspoke-${i}`}
            position={[-0.45, 0.35, 0]}
            rotation={[Math.PI / 2, 0, (angle * Math.PI) / 180]}
            castShadow
          >
            <boxGeometry args={[0.02, 0.65, 0.02]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        {/* Main frame - top tube */}
        <mesh position={[0, 0.55, 0]} rotation={[0, 0, 0]} castShadow>
          <boxGeometry args={[0.75, 0.04, 0.04]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Main frame - down tube */}
        <mesh position={[0.15, 0.45, 0]} rotation={[0, 0, 0.4]} castShadow>
          <boxGeometry args={[0.5, 0.04, 0.04]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Main frame - seat tube */}
        <mesh position={[-0.2, 0.45, 0]} rotation={[0, 0, -0.15]} castShadow>
          <boxGeometry args={[0.04, 0.45, 0.04]} />
          <meshStandardMaterial color="#1e40af" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* Fork */}
        <mesh position={[0.45, 0.5, 0]} rotation={[0, 0, 0.1]} castShadow>
          <boxGeometry args={[0.03, 0.35, 0.03]} />
          <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.5} />
        </mesh>
        {/* Handlebars */}
        <mesh position={[0.45, 0.7, 0]} castShadow>
          <boxGeometry args={[0.08, 0.03, 0.45]} />
          <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.6} />
        </mesh>
        {/* Seat */}
        <mesh position={[-0.25, 0.7, 0]} castShadow>
          <boxGeometry args={[0.2, 0.04, 0.12]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        {/* Pedal crank */}
        <mesh position={[0, 0.35, 0]} rotation={[Math.PI / 2, 0, 0.3]} castShadow>
          <boxGeometry args={[0.25, 0.03, 0.03]} />
          <meshStandardMaterial color="#4b5563" roughness={0.5} metalness={0.6} />
        </mesh>
        {/* Rust patches */}
        <mesh position={[0.1, 0.5, 0.03]}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.9} transparent opacity={0.6} />
        </mesh>
        <mesh position={[-0.35, 0.4, -0.02]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color="#6b5b3a" roughness={0.9} transparent opacity={0.5} />
        </mesh>
      </group>

      {/* Cute kiosk cafe by the pond - facing toward the water */}
      <KioskCafe position={[-108, 0, 105]} rotation={Math.PI} />

      {/* Canal branch connecting main canal to the river */}
      <Canal position={[-145, 0, -110]} length={70} width={8} rotation={Math.PI / 2} />

      {/* Additional smaller pond near back parkland */}
      <Pond position={[115, 0, -115]} radius={6} />

      {/* ========== INDUSTRIAL STRUCTURES ========== */}

      {/* Loading dock canopy - FRONT (shipping) */}
      <LoadingDockCanopy position={[0, 0, 58]} width={20} depth={5} rotation={0} />

      {/* Loading dock canopy - BACK (receiving) */}
      <LoadingDockCanopy position={[0, 0, -58]} width={20} depth={5} rotation={Math.PI} />

      {/* Grain elevator tower - positioned at west side of factory */}
      <GrainElevator position={[-75, 0, -20]} />

      {/* Conveyor bridges - connecting elevator to factory and silos */}
      <ConveyorBridge start={[-70, 30, -20]} end={[-58, 15, -22]} />
      <ConveyorBridge start={[-70, 35, -20]} end={[-75, 25, 10]} />
      <ConveyorBridge start={[-58, 12, 0]} end={[-58, 12, -40]} />

      {/* Storage tanks - east side industrial area */}
      <StorageTank position={[75, 0, -30]} length={10} radius={3} rotation={0} color="#d1d5db" />
      <StorageTank position={[75, 0, -15]} length={8} radius={2.5} rotation={0} color="#e5e7eb" />
      <StorageTank position={[75, 0, 0]} length={10} radius={3} rotation={0} color="#d1d5db" />

      {/* Propane tanks - utility area near back */}
      <PropaneTank position={[80, 0, 25]} height={5} radius={1.5} />
      <PropaneTank position={[85, 0, 25]} height={4} radius={1.2} />

      {/* Additional grain silos - outside the main building */}
      <GrainSilo position={[-85, 0, 30]} radius={6} height={35} color="#94a3b8" />
      <GrainSilo position={[-85, 0, 50]} radius={5} height={30} color="#a3b1c6" />

      {/* ========== PATHS & WALKWAYS ========== */}

      {/* Main path from factory front gate to canal towpath */}
      <GravelPath start={[-95, 0, 85]} end={[-130, 0, 85]} width={3} type="paved" />
      <GravelPath start={[-130, 0, 85]} end={[-130, 0, 50]} width={2.5} type="gravel" />

      {/* Canal towpath - runs along the canal */}
      <GravelPath start={[-155, 0, 100]} end={[-155, 0, -100]} width={3} type="gravel" />

      {/* Path to the lake area */}
      <GravelPath start={[95, 0, 85]} end={[120, 0, 100]} width={2.5} type="paved" />
      <CurvedPath
        position={[120, 0, 100]}
        radius={8}
        startAngle={-Math.PI / 2}
        endAngle={0}
        width={2.5}
        type="paved"
      />

      {/* Lakeside walking path - around the lake */}
      <CurvedPath
        position={[120, 0, 120]}
        radius={22}
        startAngle={0}
        endAngle={Math.PI * 2}
        width={2}
        type="gravel"
      />

      {/* Path from back gate to river */}
      <GravelPath start={[0, 0, -85]} end={[0, 0, -125]} width={3} type="paved" />

      {/* Riverbank path removed - was crossing through river */}

      {/* Path to front pond */}
      <GravelPath start={[-100, 0, 95]} end={[-125, 0, 105]} width={2} type="gravel" />
      <CurvedPath
        position={[-125, 0, 105]}
        radius={14}
        startAngle={0}
        endAngle={Math.PI * 1.5}
        width={1.8}
        type="gravel"
      />

      {/* Factory perimeter path - west side */}
      <GravelPath start={[-65, 0, 50]} end={[-65, 0, -50]} width={2} type="paved" />

      {/* Factory perimeter path - east side */}
      <GravelPath start={[65, 0, 50]} end={[65, 0, -50]} width={2} type="paved" />

      {/* Cross path at rear - behind factory */}
      <GravelPath start={[-65, 0, -60]} end={[65, 0, -60]} width={2} type="paved" />

      {/* Path to east pond */}
      <GravelPath start={[100, 0, -85]} end={[115, 0, -110]} width={1.8} type="gravel" />

      {/* ========== PATH AMENITIES & FURNITURE ========== */}

      {/* Victorian lamps along canal towpath */}
      <PathLamp position={[-155, 0, 80]} style="victorian" />
      <PathLamp position={[-155, 0, 40]} style="victorian" />
      <PathLamp position={[-155, 0, 0]} style="victorian" />
      <PathLamp position={[-155, 0, -40]} style="victorian" />
      <PathLamp position={[-155, 0, -80]} style="victorian" />

      {/* Modern lamps along factory paths */}
      <PathLamp position={[-65, 0, 30]} style="modern" />
      <PathLamp position={[-65, 0, -30]} style="modern" />
      <PathLamp position={[65, 0, 30]} style="modern" />
      <PathLamp position={[65, 0, -30]} style="modern" />

      {/* Lamps around lake */}
      <PathLamp position={[98, 0, 120]} style="victorian" />
      <PathLamp position={[142, 0, 120]} style="victorian" />
      <PathLamp position={[120, 0, 142]} style="victorian" />

      {/* Lamps along river path */}
      <PathLamp position={[-60, 0, -135]} style="modern" />
      <PathLamp position={[0, 0, -135]} style="modern" />
      <PathLamp position={[60, 0, -135]} style="modern" />

      {/* Bollards along canal edge */}
      <Bollard position={[-137, 0, -25]} type="wood" />
      <Bollard position={[-137, 0, -15]} type="wood" />
      <Bollard position={[-137, 0, 15]} type="wood" />
      <Bollard position={[-137, 0, 25]} type="wood" />

      {/* Bollards at dock areas */}
      <Bollard position={[-138, 0, -32]} type="metal" />
      <Bollard position={[-138, 0, 32]} type="metal" />

      {/* Information signs */}
      <InfoSign position={[-150, 0, 85]} text="CANAL" rotation={Math.PI / 4} />
      <InfoSign position={[95, 0, 115]} text="LAKE" rotation={-Math.PI / 4} />
      <InfoSign position={[10, 0, -130]} text="RIVER" rotation={0} />
      <InfoSign position={[-137, 0, -45]} text="DOCK" rotation={Math.PI / 2} />

      {/* Picnic area by the lake */}
      <PicnicTable position={[145, 0, 105]} rotation={Math.PI / 6} />
      <PicnicTable position={[150, 0, 130]} rotation={-Math.PI / 4} />
      <WasteBin position={[148, 0, 118]} />

      {/* Picnic area by canal */}
      <PicnicTable position={[-160, 0, 60]} rotation={Math.PI / 2} />
      <WasteBin position={[-158, 0, 70]} />

      {/* Benches along paths - now rendered via instanced components above */}

      {/* Hedges bordering paths */}
      <HedgeRow start={[-130, 0, 90]} end={[-130, 0, 60]} height={0.6} width={0.5} />
      <HedgeRow start={[95, 0, 90]} end={[110, 0, 100]} height={0.5} width={0.4} />
      <HedgeRow start={[-10, 0, -128]} end={[10, 0, -128]} height={0.5} width={0.4} />

      {/* Trees along waterways, by river, and by lake - now rendered via instanced components above */}
    </group>
  );
};

export default FactoryExterior;
