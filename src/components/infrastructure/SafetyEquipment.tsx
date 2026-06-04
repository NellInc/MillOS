import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Instances, Instance } from '@react-three/drei';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { POLYGON_OFFSET } from '../../constants/renderLayers';

interface SafetyEquipmentProps {
  floorWidth: number;
  floorDepth: number;
}

// Shared geometries for instanced pallets and sacks
const PALLET_GEOMETRIES = {
  topBoard: new THREE.BoxGeometry(1.2, 0.025, 0.2),
  stringer: new THREE.BoxGeometry(0.1, 0.1, 1),
  bottomBoard: new THREE.BoxGeometry(1.2, 0.02, 0.15),
  crate: new THREE.BoxGeometry(0.8, 0.5, 0.6),
  crateSlat: new THREE.BoxGeometry(0.82, 0.52, 0.02),
  sack: new THREE.BoxGeometry(0.4, 0.25, 0.3),
};

const PALLET_MATERIALS = {
  wood: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 }),
  woodDark: new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.9 }),
  woodMedium: new THREE.MeshStandardMaterial({ color: '#7a4c2a', roughness: 0.9 }),
  crateWood: new THREE.MeshStandardMaterial({ color: '#d4a574', roughness: 0.8 }),
  crateSlatWood: new THREE.MeshStandardMaterial({ color: '#b8956e', roughness: 0.85 }),
  sack: new THREE.MeshStandardMaterial({ color: '#e8dcc8', roughness: 0.95 }),
};

// Warning signage component
const WarningSign: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  type: 'forklift' | 'hardhat' | 'danger' | 'exit' | 'electrical';
}> = React.memo(({ position, rotation = [0, 0, 0], type }) => {
  const colors = {
    forklift: { bg: '#fbbf24', text: '#1e293b' },
    hardhat: { bg: '#fbbf24', text: '#1e293b' },
    danger: { bg: '#ef4444', text: '#ffffff' },
    exit: { bg: '#22c55e', text: '#ffffff' },
    electrical: { bg: '#fbbf24', text: '#1e293b' },
  };

  const { bg, text } = colors[type];
  // Ensure rotation is treated as a valid Euler tuple
  const safeRotation = rotation as [number, number, number];

  return (
    <group position={position} rotation={safeRotation}>
      {/* Sign backing */}
      <mesh castShadow>
        <boxGeometry args={[0.8, 0.6, 0.02]} />
        <meshStandardMaterial color={bg} />
      </mesh>
      {/* Sign border - z=0.02 for proper separation from backing */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[0.72, 0.52]} />
        <meshBasicMaterial color={text} />
      </mesh>
      {/* Inner area - z=0.03 for proper separation from border */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[0.68, 0.48]} />
        <meshBasicMaterial color={bg} />
      </mesh>
      {/* Symbol area (simplified) - z=0.04 for proper separation from inner area */}
      {type === 'forklift' && (
        <mesh position={[0, 0, 0.04]}>
          <planeGeometry args={[0.3, 0.2]} />
          <meshBasicMaterial color={text} />
        </mesh>
      )}
      {type === 'danger' && (
        <mesh position={[0, 0.05, 0.04]} rotation={[0, 0, Math.PI]}>
          <circleGeometry args={[0.15, 3]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
      {type === 'exit' && (
        <mesh position={[0.15, 0, 0.04]}>
          <boxGeometry args={[0.15, 0.25, 0.001]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      )}
      {/* Post */}
      <mesh position={[0, -0.8, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.3, 8]} />
        <meshStandardMaterial
          color="#64748b"
          metalness={0.7}
          roughness={0.3}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>
    </group>
  );
});

// Wall-mounted sign
const WallSign: React.FC<{
  position: [number, number, number];
  rotation?: [number, number, number];
  text: string;
  color?: string;
}> = React.memo(({ position, rotation = [0, 0, 0], color = '#3b82f6' }) => {
  const safeRotation = rotation as [number, number, number];
  return (
    <group position={position} rotation={safeRotation}>
      <mesh>
        <boxGeometry args={[1.2, 0.4, 0.03]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* Text area (simplified as lighter rectangle) - z=0.03 for proper separation */}
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[1.1, 0.3]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
});

// Safety Station component - includes first-aid, eyewash, fire, emergency-stop, aed, and spill-kit
const SafetyStation: React.FC<{
  position: [number, number, number];
  type: 'first-aid' | 'eyewash' | 'fire' | 'emergency-stop' | 'aed' | 'spill-kit';
}> = React.memo(({ position, type }) => {
  const colors = {
    'first-aid': '#22c55e',
    eyewash: '#3b82f6',
    fire: '#ef4444',
    'emergency-stop': '#f97316',
    aed: '#dc2626',
    'spill-kit': '#fbbf24',
  };

  const color = colors[type];

  return (
    <group position={position}>
      {/* Wall mount or stand */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 1.6, 12]} />
        <meshStandardMaterial
          color="#475569"
          metalness={0.6}
          roughness={0.4}
          normalMap={PROCEDURAL_TEXTURES.brushedMetal}
          normalScale={new THREE.Vector2(0.15, 0.15)}
        />
      </mesh>

      {/* Station box/cabinet */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry
          args={[
            type === 'aed' ? 0.45 : type === 'spill-kit' ? 0.6 : 0.5,
            type === 'aed' ? 0.55 : type === 'spill-kit' ? 0.8 : 0.5,
            0.25,
          ]}
        />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>

      {/* Cross or symbol */}
      {type === 'first-aid' && (
        <group position={[0, 1.4, 0.13]}>
          <mesh>
            <boxGeometry args={[0.25, 0.08, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh>
            <boxGeometry args={[0.08, 0.25, 0.02]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      )}

      {type === 'fire' && (
        <mesh position={[0, 0.5, 0.15]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.8, 12]} />
          <meshStandardMaterial color="#dc2626" roughness={0.4} />
        </mesh>
      )}

      {type === 'emergency-stop' && (
        <mesh position={[0, 1.4, 0.15]}>
          <cylinderGeometry args={[0.12, 0.12, 0.08, 16]} />
          <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* AED - Automated External Defibrillator */}
      {type === 'aed' && (
        <group position={[0, 1.4, 0.13]}>
          {/* Heart symbol */}
          <mesh position={[0, 0.05, 0]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {/* Lightning bolt */}
          <mesh position={[0, -0.05, 0.01]} rotation={[0, 0, 0.2]}>
            <boxGeometry args={[0.04, 0.15, 0.02]} />
            <meshStandardMaterial color="#fbbf24" />
          </mesh>
          {/* AED text area */}
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[0.3, 0.08, 0.01]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      )}

      {/* Spill containment kit */}
      {type === 'spill-kit' && (
        <group position={[0, 1.4, 0.13]}>
          {/* Exclamation symbol */}
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.06, 0.2, 0.02]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          {/* Spill kit icon - bucket shape */}
          <mesh position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 0.12, 8]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
      )}

      {/* Warning stripes on floor - raised with depthWrite for z-fighting prevention */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.7, 16]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.3}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={POLYGON_OFFSET.standard.factor}
          polygonOffsetUnits={POLYGON_OFFSET.standard.units}
        />
      </mesh>

      {/* Glow effect */}
      <pointLight position={[0, 1.5, 0.3]} color={color} intensity={0.3} distance={3} />
    </group>
  );
});

// Stacked pallets with optional crates - INSTANCED VERSION
const PalletStack: React.FC<{
  position: [number, number, number];
  layers?: number;
  hasCrates?: boolean;
  rotation?: number;
}> = React.memo(({ position, layers = 1, hasCrates = false, rotation = 0 }) => {
  const topBoardsRef = useRef<THREE.InstancedMesh>(null);
  const stringersRef = useRef<THREE.InstancedMesh>(null);
  const bottomBoardsRef = useRef<THREE.InstancedMesh>(null);

  const instanceData = useMemo(() => {
    const topBoards: THREE.Matrix4[] = [];
    const stringers: THREE.Matrix4[] = [];
    const bottomBoards: THREE.Matrix4[] = [];
    const matrix = new THREE.Matrix4();

    for (let layer = 0; layer < layers; layer++) {
      const y = layer * 0.15;

      // Top boards at z offsets
      [-0.4, 0, 0.4].forEach((z) => {
        matrix.setPosition(0, y + 0.12, z);
        topBoards.push(matrix.clone());
      });

      // Stringers at x offsets
      [-0.5, 0, 0.5].forEach((x) => {
        matrix.setPosition(x, y + 0.05, 0);
        stringers.push(matrix.clone());
      });

      // Bottom boards at z offsets
      [-0.35, 0.35].forEach((z) => {
        matrix.setPosition(0, y, z);
        bottomBoards.push(matrix.clone());
      });
    }

    return { topBoards, stringers, bottomBoards };
  }, [layers]);

  useEffect(() => {
    if (topBoardsRef.current) {
      instanceData.topBoards.forEach((m, i) => topBoardsRef.current!.setMatrixAt(i, m));
      topBoardsRef.current.instanceMatrix.needsUpdate = true;
    }
    if (stringersRef.current) {
      instanceData.stringers.forEach((m, i) => stringersRef.current!.setMatrixAt(i, m));
      stringersRef.current.instanceMatrix.needsUpdate = true;
    }
    if (bottomBoardsRef.current) {
      instanceData.bottomBoards.forEach((m, i) => bottomBoardsRef.current!.setMatrixAt(i, m));
      bottomBoardsRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [instanceData]);

  const topBoardCount = layers * 3;
  const stringerCount = layers * 3;
  const bottomBoardCount = layers * 2;

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Instanced top boards */}
      <instancedMesh
        ref={topBoardsRef}
        args={[PALLET_GEOMETRIES.topBoard, PALLET_MATERIALS.wood, topBoardCount]}
        castShadow
      />

      {/* Instanced stringers */}
      <instancedMesh
        ref={stringersRef}
        args={[PALLET_GEOMETRIES.stringer, PALLET_MATERIALS.woodDark, stringerCount]}
        castShadow
      />

      {/* Instanced bottom boards */}
      <instancedMesh
        ref={bottomBoardsRef}
        args={[PALLET_GEOMETRIES.bottomBoard, PALLET_MATERIALS.woodMedium, bottomBoardCount]}
        castShadow
      />

      {/* Crates on top (not instanced since only one per stack) */}
      {hasCrates && (
        <group position={[0, layers * 0.15 + 0.3, 0]}>
          <mesh
            castShadow
            geometry={PALLET_GEOMETRIES.crate}
            material={PALLET_MATERIALS.crateWood}
          />
          {/* Crate slats */}
          <mesh
            position={[0, 0, -0.2]}
            castShadow
            geometry={PALLET_GEOMETRIES.crateSlat}
            material={PALLET_MATERIALS.crateSlatWood}
          />
          <mesh
            position={[0, 0, 0.2]}
            castShadow
            geometry={PALLET_GEOMETRIES.crateSlat}
            material={PALLET_MATERIALS.crateSlatWood}
          />
        </group>
      )}
    </group>
  );
});

// Sack stack (grain bags) - INSTANCED VERSION
const SackStack: React.FC<{
  position: [number, number, number];
  count?: number;
  rotation?: number;
}> = React.memo(({ position, count = 3, rotation = 0 }) => {
  const sacksRef = useRef<THREE.InstancedMesh>(null);

  const sackMatrices = useMemo(() => {
    const matrices: THREE.Matrix4[] = [];
    let y = 0.15;
    let remaining = count;
    let rowSize = Math.min(3, remaining);

    // Use a seeded random for consistent results
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };

    let seedIndex = 0;

    while (remaining > 0) {
      for (let i = 0; i < rowSize && remaining > 0; i++) {
        const x = (i - (rowSize - 1) / 2) * 0.45;
        const rz = (seededRandom(seedIndex++) - 0.5) * 0.1;

        const matrix = new THREE.Matrix4();
        // Create rotation quaternion for z-axis rotation
        const quaternion = new THREE.Quaternion();
        quaternion.setFromEuler(new THREE.Euler(0, 0, rz));
        matrix.compose(new THREE.Vector3(x, y, 0), quaternion, new THREE.Vector3(1, 1, 1));
        matrices.push(matrix);
        remaining--;
      }
      y += 0.25;
      rowSize = Math.max(1, rowSize - 1);
    }
    return matrices;
  }, [count]);

  useEffect(() => {
    if (sacksRef.current) {
      sackMatrices.forEach((m, i) => sacksRef.current!.setMatrixAt(i, m));
      sacksRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [sackMatrices]);

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <instancedMesh
        ref={sacksRef}
        args={[PALLET_GEOMETRIES.sack, PALLET_MATERIALS.sack, count]}
        castShadow
      />
    </group>
  );
});

// Chain link fence with barbed wire
const PerimeterFence: React.FC<{
  start: [number, number, number];
  end: [number, number, number];
  height?: number;
  hasGate?: boolean;
}> = React.memo(({ start, end, height = 3, hasGate = false }) => {
  const length = Math.sqrt(Math.pow(end[0] - start[0], 2) + Math.pow(end[2] - start[2], 2));
  const midpoint: [number, number, number] = [(start[0] + end[0]) / 2, 0, (start[2] + end[2]) / 2];
  const angle = Math.atan2(end[0] - start[0], end[2] - start[2]);
  const postCount = Math.max(2, Math.floor(length / 3));

  // Generate chain link pattern texture
  const chainLinkTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;

    // Diamond pattern
    for (let i = -32; i < 96; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 32, 64);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 32, 0);
      ctx.lineTo(i, 64);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(length / 2, height / 2);
    return tex;
  }, [length, height]);

  // Dispose the locally-created CanvasTexture on unmount / texture change to
  // avoid orphaning GPU textures when fences unmount on a quality-level toggle.
  useEffect(() => () => chainLinkTexture.dispose(), [chainLinkTexture]);

  // Pre-calculate post positions
  const postPositions = useMemo(() => {
    return Array.from({ length: postCount }).map((_, i) => {
      const z = -length / 2 + (i / (postCount - 1)) * length;
      return z;
    });
  }, [length, postCount]);

  // Pre-calculate per-barb random tilt once so the barbs do not visibly jitter
  // on every re-render (Math.random() in the render path re-rolls each frame).
  const barbCount = Math.floor(length / 0.5);
  const barbRotations = useMemo(
    () =>
      Array.from({ length: barbCount }).map(() => ({
        left: Math.random() * 0.5,
        right: Math.random() * 0.5,
      })),
    [barbCount]
  );

  return (
    <group position={midpoint} rotation={[0, angle, 0]}>
      {/* INSTANCED: Main posts */}
      <Instances limit={postCount} range={postCount}>
        <cylinderGeometry args={[0.04, 0.04, height, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
        {postPositions.map((z, i) => (
          <Instance key={i} position={[0, height / 2, z]} castShadow />
        ))}
      </Instances>

      {/* INSTANCED: Left support arms */}
      <Instances limit={postCount} range={postCount}>
        <boxGeometry args={[0.3, 0.03, 0.03]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
        {postPositions.map((z, i) => (
          <Instance key={i} position={[0.15, height + 0.1, z]} rotation={[0, 0, -Math.PI / 4]} />
        ))}
      </Instances>

      {/* INSTANCED: Right support arms */}
      <Instances limit={postCount} range={postCount}>
        <boxGeometry args={[0.3, 0.03, 0.03]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
        {postPositions.map((z, i) => (
          <Instance key={i} position={[-0.15, height + 0.1, z]} rotation={[0, 0, Math.PI / 4]} />
        ))}
      </Instances>

      {/* Chain link mesh - single mesh, already optimized */}
      {!hasGate && (
        <mesh position={[0, height / 2, 0]}>
          <planeGeometry args={[0.1, height]} />
          <meshStandardMaterial
            map={chainLinkTexture}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
      )}

      {/* Actual fence panels between posts */}
      {/* Kept as individual loop for now as panels scale differently, but reduced complexity if possible */}
      {Array.from({ length: postCount - 1 }).map((_, i) => {
        const z1 = -length / 2 + (i / (postCount - 1)) * length;
        const z2 = -length / 2 + ((i + 1) / (postCount - 1)) * length;
        const segmentLength = z2 - z1;
        const segmentMid = (z1 + z2) / 2;

        return (
          <mesh key={i} position={[0, height / 2, segmentMid]}>
            {/* Switched to BoxGeometry to give the panel proper volume and length */}
            <boxGeometry args={[0.02, height - 0.2, segmentLength]} />
            <meshStandardMaterial
              color="#94a3b8"
              transparent
              opacity={0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}

      {/* Top rail */}
      <mesh position={[0, height, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, length, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Bottom rail */}
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, length, 8]} />
        <meshStandardMaterial color="#64748b" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Barbed wire strands */}
      {[0.25, 0.35, 0.45].map((offset, i) => (
        <group key={i}>
          {/* Left strand */}
          <mesh position={[-0.2, height + offset, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, length, 6]} />
            <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Right strand */}
          <mesh position={[0.2, height + offset, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.008, 0.008, length, 6]} />
            <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Barbs (simplified) - INSTANCED */}
      <Instances limit={Math.floor(length / 0.5) * 2}>
        <boxGeometry args={[0.04, 0.008, 0.008]} />
        <meshStandardMaterial color="#374151" metalness={0.8} />
        {barbRotations.map((rot, i) => {
          const z = -length / 2 + i * 0.5 + 0.25;
          return (
            <React.Fragment key={i}>
              <Instance
                position={[-0.2, height + 0.35, z]}
                rotation={[rot.left, 0, Math.PI / 4]}
              />
              <Instance
                position={[0.2, height + 0.35, z]}
                rotation={[rot.right, 0, -Math.PI / 4]}
              />
            </React.Fragment>
          );
        })}
      </Instances>
    </group>
  );
});

export const SafetyEquipment: React.FC<SafetyEquipmentProps> = React.memo(() => {
  const graphics = useGraphicsStore((state) => state.graphics);

  // PERFORMANCE: Decorative safety equipment moved to HIGH+ only
  const isHighGraphics = graphics.quality === 'high' || graphics.quality === 'ultra';
  const showWarehouseClutter = graphics.enableWarehouseClutter;
  const showSignage = graphics.enableSignage;

  return (
    <group>
      {/* Safety Stations around the factory - HIGH+ only for performance */}
      {/* PERF: Moved to HIGH+ only - saves ~50 draw calls on MEDIUM */}
      {isHighGraphics && (
        <>
          <SafetyStation position={[0, 0, 35]} type="first-aid" />
          <SafetyStation position={[-25, 0, -10]} type="eyewash" />
          <SafetyStation position={[25, 0, -10]} type="fire" />
          <SafetyStation position={[0, 0, -35]} type="emergency-stop" />
          {/* AED stations near high-traffic areas */}
          <SafetyStation position={[-40, 0, 20]} type="aed" />
          <SafetyStation position={[40, 0, 20]} type="aed" />
          {/* Spill containment kits near machinery and dock areas */}
          <SafetyStation position={[-30, 0, -25]} type="spill-kit" />
          <SafetyStation position={[30, 0, -25]} type="spill-kit" />
          <SafetyStation position={[0, 0, 45]} type="spill-kit" />
        </>
      )}

      {/* Perimeter fence with barbed wire - HIGH+ only */}
      {/* PERF: Moved to HIGH+ only - saves ~40 draw calls on MEDIUM */}
      {isHighGraphics && (
        <>
          {/* Front perimeter (shipping side) */}
          <PerimeterFence start={[-58, 0, 75]} end={[-35, 0, 75]} height={2.5} />
          <PerimeterFence start={[35, 0, 75]} end={[58, 0, 75]} height={2.5} />
          {/* Back perimeter (receiving side) */}
          <PerimeterFence start={[-58, 0, -75]} end={[-35, 0, -75]} height={2.5} />
          <PerimeterFence start={[35, 0, -75]} end={[58, 0, -75]} height={2.5} />
          {/* Side perimeters */}
          <PerimeterFence start={[-58, 0, -75]} end={[-58, 0, 75]} height={2.5} />
          <PerimeterFence start={[58, 0, -75]} end={[58, 0, 75]} height={2.5} />
        </>
      )}

      {/* Warehouse clutter - pallets, crates, sacks */}
      {showWarehouseClutter && (
        <>
          {/* Pallets near shipping dock staging (front, but away from truck yard) */}
          <PalletStack position={[35, 0, 35]} layers={2} hasCrates rotation={0.1} />
          <PalletStack position={[40, 0, 32]} layers={1} hasCrates={false} rotation={-0.05} />
          <PalletStack position={[-35, 0, 35]} layers={3} hasCrates rotation={0.2} />
          <PalletStack position={[-40, 0, 32]} layers={2} hasCrates rotation={-0.1} />

          {/* Pallets near packing zone (z=25) */}
          <PalletStack position={[20, 0, 30]} layers={2} hasCrates={false} rotation={Math.PI / 2} />
          <PalletStack position={[-20, 0, 30]} layers={1} hasCrates rotation={Math.PI / 2 + 0.1} />

          {/* Sack stacks near silos (z=-22), away from receiving dock */}
          <SackStack position={[-15, 0, -30]} count={6} rotation={0.15} />
          <SackStack position={[15, 0, -30]} count={4} rotation={-0.1} />
          <SackStack position={[0, 0, -32]} count={8} />

          {/* Receiving dock staging (back, but inside factory) */}
          <PalletStack position={[35, 0, -35]} layers={1} hasCrates={false} rotation={0.3} />
          <PalletStack position={[-35, 0, -35]} layers={2} hasCrates rotation={-0.15} />

          {/* Scattered pallets around factory interior */}
          <PalletStack position={[-45, 0, 5]} layers={1} hasCrates={false} rotation={0.3} />
          <PalletStack position={[45, 0, -8]} layers={2} hasCrates rotation={-0.15} />
          <PalletStack
            position={[-45, 0, -15]}
            layers={1}
            hasCrates={false}
            rotation={Math.PI / 4}
          />
          <PalletStack position={[45, 0, 15]} layers={2} hasCrates rotation={0.2} />
        </>
      )}

      {/* Warning signage */}
      {showSignage && (
        <>
          {/* Forklift warning signs near aisles */}
          <WarningSign position={[-15, 1.5, 30]} type="forklift" rotation={[0, Math.PI, 0]} />
          <WarningSign position={[15, 1.5, 30]} type="forklift" rotation={[0, Math.PI, 0]} />
          <WarningSign position={[-15, 1.5, -30]} type="forklift" rotation={[0, 0, 0]} />
          <WarningSign position={[15, 1.5, -30]} type="forklift" rotation={[0, 0, 0]} />

          {/* Hard hat signs at entrances (near docks) */}
          <WarningSign position={[25, 1.5, 42]} type="hardhat" rotation={[0, Math.PI, 0]} />
          <WarningSign position={[-25, 1.5, 42]} type="hardhat" rotation={[0, Math.PI, 0]} />
          <WarningSign position={[25, 1.5, -42]} type="hardhat" rotation={[0, 0, 0]} />
          <WarningSign position={[-25, 1.5, -42]} type="hardhat" rotation={[0, 0, 0]} />

          {/* Danger signs near machinery */}
          <WarningSign position={[-30, 1.5, -18]} type="danger" />
          <WarningSign position={[30, 1.5, -18]} type="danger" />

          {/* Exit signs - near shipping dock (front), back, and sides */}
          <WallSign position={[0, 4, 48]} rotation={[0, Math.PI, 0]} text="EXIT" color="#22c55e" />
          <WallSign position={[0, 4, -48]} rotation={[0, 0, 0]} text="EXIT" color="#22c55e" />
          <WallSign
            position={[-58, 4, 0]}
            rotation={[0, Math.PI / 2, 0]}
            text="EXIT"
            color="#22c55e"
          />
          <WallSign
            position={[58, 4, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            text="EXIT"
            color="#22c55e"
          />

          {/* Zone signs - positioned near actual zone locations */}
          {/* Zone 1: Silos at z=-22 */}
          <WallSign
            position={[0, 4, -25]}
            rotation={[0, 0, 0]}
            text="ZONE 1 - STORAGE"
            color="#3b82f6"
          />
          {/* Zone 2: Milling at z=-6 */}
          <WallSign
            position={[0, 4, -10]}
            rotation={[0, 0, 0]}
            text="ZONE 2 - MILLING"
            color="#f97316"
          />
          {/* Zone 3: Sifting at z=6 */}
          <WallSign
            position={[0, 4, 8]}
            rotation={[0, 0, 0]}
            text="ZONE 3 - SIFTING"
            color="#a855f7"
          />
          {/* Zone 4: Packing at z=25 */}
          <WallSign
            position={[0, 4, 28]}
            rotation={[0, Math.PI, 0]}
            text="ZONE 4 - PACKING"
            color="#8b5cf6"
          />

          {/* Electrical warning */}
          <WarningSign position={[-40, 1.5, -30]} type="electrical" />
          <WarningSign position={[40, 1.5, -30]} type="electrical" />
        </>
      )}
    </group>
  );
});
