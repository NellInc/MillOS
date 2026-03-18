/**
 * InstancedVillageComponents - GPU-efficient village rendering
 *
 * ARCHITECTURE:
 * 1. ONE draw call per geometry type (not per instance)
 * 2. Module-level shared geometries (never recreated)
 * 3. Instance attributes for color/transform variations
 * 4. No React state for static geometry - pure instancing
 *
 * PERFORMANCE GAINS:
 * - 8 lamps: 8 draw calls → 1 draw call
 * - 4 benches: 4 draw calls → 1 draw call
 * - etc.
 */

import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';

// ============================================================
// SHARED GEOMETRIES - Created once at module level
// ============================================================

// Lamp geometries
const lampPostGeometry = new THREE.CylinderGeometry(0.08, 0.12, 4, 8);
const lampHousingGeometry = new THREE.BoxGeometry(0.5, 0.6, 0.5);
const lampGlassGeometry = new THREE.BoxGeometry(0.35, 0.45, 0.35);

// Bench geometries
const benchSeatGeometry = new THREE.BoxGeometry(1.5, 0.08, 0.5);
const benchBackGeometry = new THREE.BoxGeometry(1.5, 0.5, 0.08);
const benchLegGeometry = new THREE.BoxGeometry(0.08, 0.4, 0.5);

// Tree geometries (simplified for instancing)
const treeTrunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
const treeCanopyGeometry = new THREE.SphereGeometry(2, 8, 6);

// Market stall geometries
const stallTableGeometry = new THREE.BoxGeometry(2.8, 0.1, 1.8);
const stallPostGeometry = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8);
const stallAwningGeometry = new THREE.BoxGeometry(0.4, 0.05, 2.2);

// ============================================================
// SHARED MATERIALS - Created once at module level
// ============================================================

const blackMetalMaterial = new THREE.MeshStandardMaterial({
  color: '#1a1a1a',
  roughness: 0.5,
  normalMap: PROCEDURAL_TEXTURES.brushedMetal,
  normalScale: new THREE.Vector2(0.1, 0.1),
});

const timberMaterial = new THREE.MeshStandardMaterial({
  color: '#3d2d1d',
  roughness: 0.8,
  normalMap: PROCEDURAL_TEXTURES.panelNormal,
  normalScale: new THREE.Vector2(0.15, 0.15),
});

const whiteMaterial = new THREE.MeshStandardMaterial({
  color: '#e8e8e8',
  roughness: 0.75,
});

const brownBarkMaterial = new THREE.MeshStandardMaterial({
  color: '#4a3728',
  roughness: 0.9,
});

const greenLeafMaterial = new THREE.MeshStandardMaterial({
  color: '#2d5a27',
  roughness: 0.8,
});

const smokeMaterial = new THREE.MeshBasicMaterial({
  color: '#9ca3af',
  transparent: true,
  opacity: 0.4,
});

// ============================================================
// LAMP INSTANCE DATA
// ============================================================

const LAMP_POSITIONS: [number, number][] = [
  [-15, 20],
  [15, 20],
  [-15, -20],
  [15, -20],
  [-15, -45],
  [15, -45],
  [-15, 45],
  [15, 50],
];

/**
 * Instanced village lamps - 8 lamps in ~3 draw calls instead of 24
 */
export const InstancedLamps: React.FC<{ isNight: boolean }> = React.memo(({ isNight }) => {
  const postsRef = useRef<THREE.InstancedMesh>(null);
  const housingsRef = useRef<THREE.InstancedMesh>(null);
  const glassRef = useRef<THREE.InstancedMesh>(null);

  const count = LAMP_POSITIONS.length;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    LAMP_POSITIONS.forEach(([x, z], i) => {
      // Post
      dummy.position.set(x, 2, z);
      dummy.updateMatrix();
      postsRef.current?.setMatrixAt(i, dummy.matrix);

      // Housing
      dummy.position.set(x, 4.3, z);
      dummy.updateMatrix();
      housingsRef.current?.setMatrixAt(i, dummy.matrix);

      // Glass
      dummy.position.set(x, 4.3, z);
      dummy.updateMatrix();
      glassRef.current?.setMatrixAt(i, dummy.matrix);
    });

    if (postsRef.current) postsRef.current.instanceMatrix.needsUpdate = true;
    if (housingsRef.current) housingsRef.current.instanceMatrix.needsUpdate = true;
    if (glassRef.current) glassRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  // Glass material changes based on night/day
  const glassMaterial = useMemo(() => {
    if (isNight) {
      return new THREE.MeshStandardMaterial({
        color: '#ffaa00',
        emissive: '#ffaa00',
        emissiveIntensity: 2,
        toneMapped: false,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: '#333333',
      roughness: 0.6,
    });
  }, [isNight]);

  return (
    <group>
      <instancedMesh
        ref={postsRef}
        args={[lampPostGeometry, blackMetalMaterial, count]}
        castShadow
      />
      <instancedMesh ref={housingsRef} args={[lampHousingGeometry, blackMetalMaterial, count]} />
      <instancedMesh ref={glassRef} args={[lampGlassGeometry, glassMaterial, count]} />
      {/* Point lights only at night - limit to reduce draw calls */}
      {isNight &&
        LAMP_POSITIONS.slice(0, 4).map(([x, z], i) => (
          <pointLight
            key={i}
            position={[x, 4.3, z]}
            color="#ffaa00"
            intensity={0.5}
            distance={15}
            decay={2}
          />
        ))}
    </group>
  );
});
InstancedLamps.displayName = 'InstancedLamps';

// ============================================================
// BENCH INSTANCE DATA
// ============================================================

const BENCH_DATA: Array<{ position: [number, number]; rotation: number }> = [
  { position: [-5, 18], rotation: 0 },
  { position: [5, 18], rotation: 0 },
  { position: [-12, -25], rotation: Math.PI / 2 },
  { position: [12, 35], rotation: Math.PI / 2 },
];

/**
 * Instanced village benches - 4 benches in ~3 draw calls instead of 16
 */
export const InstancedBenches: React.FC = React.memo(() => {
  const seatsRef = useRef<THREE.InstancedMesh>(null);
  const backsRef = useRef<THREE.InstancedMesh>(null);
  const legsRef = useRef<THREE.InstancedMesh>(null);

  const count = BENCH_DATA.length;
  const legCount = count * 2; // 2 legs per bench
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    BENCH_DATA.forEach(({ position: [x, z], rotation }, i) => {
      // Seat
      dummy.position.set(x, 0.4, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      seatsRef.current?.setMatrixAt(i, dummy.matrix);

      // Back
      dummy.position.set(x + Math.sin(rotation) * -0.2, 0.25, z + Math.cos(rotation) * -0.2);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      backsRef.current?.setMatrixAt(i, dummy.matrix);

      // Legs (2 per bench)
      [-0.6, 0.6].forEach((lx, li) => {
        dummy.position.set(x + Math.cos(rotation) * lx, 0.2, z - Math.sin(rotation) * lx);
        dummy.rotation.set(0, rotation, 0);
        dummy.updateMatrix();
        legsRef.current?.setMatrixAt(i * 2 + li, dummy.matrix);
      });
    });

    if (seatsRef.current) seatsRef.current.instanceMatrix.needsUpdate = true;
    if (backsRef.current) backsRef.current.instanceMatrix.needsUpdate = true;
    if (legsRef.current) legsRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  return (
    <group>
      <instancedMesh ref={seatsRef} args={[benchSeatGeometry, timberMaterial, count]} castShadow />
      <instancedMesh ref={backsRef} args={[benchBackGeometry, timberMaterial, count]} castShadow />
      <instancedMesh
        ref={legsRef}
        args={[benchLegGeometry, blackMetalMaterial, legCount]}
        castShadow
      />
    </group>
  );
});
InstancedBenches.displayName = 'InstancedBenches';

// ============================================================
// TREE INSTANCE DATA
// ============================================================

interface TreeData {
  position: [number, number, number];
  scale: number;
  type: 'oak' | 'birch';
}

const TREE_DATA: TreeData[] = [
  { position: [-30, 0, -55], scale: 1.2, type: 'oak' },
  { position: [30, 0, -60], scale: 1.0, type: 'birch' },
  { position: [-30, 0, 55], scale: 1.3, type: 'oak' },
  { position: [30, 0, 65], scale: 1.1, type: 'oak' },
  { position: [-30, 0, 0], scale: 0.9, type: 'birch' },
  { position: [30, 0, 20], scale: 1.2, type: 'oak' },
  { position: [-30, 0, 25], scale: 1.0, type: 'birch' },
];

/**
 * Instanced village trees - 7 trees in 2 draw calls instead of 14+
 */
export const InstancedTrees: React.FC = React.memo(() => {
  const trunksRef = useRef<THREE.InstancedMesh>(null);
  const canopiesRef = useRef<THREE.InstancedMesh>(null);

  const count = TREE_DATA.length;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    TREE_DATA.forEach(({ position: [x, y, z], scale }, i) => {
      // Trunk
      dummy.position.set(x, y + 1.5 * scale, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunksRef.current?.setMatrixAt(i, dummy.matrix);

      // Canopy
      dummy.position.set(x, y + 4 * scale, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      canopiesRef.current?.setMatrixAt(i, dummy.matrix);
    });

    if (trunksRef.current) trunksRef.current.instanceMatrix.needsUpdate = true;
    if (canopiesRef.current) canopiesRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  return (
    <group>
      <instancedMesh
        ref={trunksRef}
        args={[treeTrunkGeometry, brownBarkMaterial, count]}
        castShadow
      />
      <instancedMesh
        ref={canopiesRef}
        args={[treeCanopyGeometry, greenLeafMaterial, count]}
        castShadow
        receiveShadow
      />
    </group>
  );
});
InstancedTrees.displayName = 'InstancedTrees';

// ============================================================
// MARKET STALL INSTANCE DATA
// ============================================================

interface StallData {
  position: [number, number, number];
  rotation: number;
  color1: string;
  color2: string;
}

const STALL_DATA: StallData[] = [
  { position: [-8, 0, 10], rotation: 0, color1: '#dc2626', color2: '#fef3c7' },
  { position: [8, 0, 10], rotation: 0, color1: '#3b82f6', color2: '#fef3c7' },
  { position: [-8, 0, 2], rotation: 0, color1: '#22c55e', color2: '#fef3c7' },
  { position: [8, 0, 2], rotation: 0, color1: '#f59e0b', color2: '#fef3c7' },
];

/**
 * Instanced market stalls - 4 stalls with shared geometry
 * Tables, legs, and posts are instanced; awnings have color variation
 */
export const InstancedMarketStalls: React.FC = React.memo(() => {
  const tablesRef = useRef<THREE.InstancedMesh>(null);
  const postsRef = useRef<THREE.InstancedMesh>(null);

  const count = STALL_DATA.length;
  const postCount = count * 2; // 2 posts per stall
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    STALL_DATA.forEach(({ position: [x, y, z], rotation }, i) => {
      // Table
      dummy.position.set(x, y + 0.9, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      tablesRef.current?.setMatrixAt(i, dummy.matrix);

      // Posts
      [-1.3, 1.3].forEach((px, pi) => {
        dummy.position.set(x + px, y + 1.6, z + 0.8);
        dummy.rotation.set(0, rotation, 0);
        dummy.updateMatrix();
        postsRef.current?.setMatrixAt(i * 2 + pi, dummy.matrix);
      });
    });

    if (tablesRef.current) tablesRef.current.instanceMatrix.needsUpdate = true;
    if (postsRef.current) postsRef.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  // Awnings need individual colors - render separately but with shared geometry
  const awnings = useMemo(() => {
    return STALL_DATA.map(({ position: [x, y, z], rotation, color1, color2 }, stallIdx) => (
      <group key={stallIdx} position={[x, y + 2.4, z + 0.2]} rotation={[0.4, rotation, 0]}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <mesh key={i} position={[-1.4 + i * 0.4, 0, 0]}>
            <primitive object={stallAwningGeometry} attach="geometry" />
            <meshStandardMaterial color={i % 2 === 0 ? color1 : color2} roughness={0.9} />
          </mesh>
        ))}
      </group>
    ));
  }, []);

  return (
    <group>
      <instancedMesh
        ref={tablesRef}
        args={[stallTableGeometry, timberMaterial, count]}
        castShadow
      />
      <instancedMesh
        ref={postsRef}
        args={[stallPostGeometry, timberMaterial, postCount]}
        castShadow
      />
      {awnings}
    </group>
  );
});
InstancedMarketStalls.displayName = 'InstancedMarketStalls';

// ============================================================
// EXPORTS
// ============================================================

export {
  // Geometries for reuse
  lampPostGeometry,
  lampHousingGeometry,
  benchSeatGeometry,
  treeTrunkGeometry,
  treeCanopyGeometry,
  // Materials for reuse
  blackMetalMaterial,
  timberMaterial,
  whiteMaterial,
  brownBarkMaterial,
  greenLeafMaterial,
  smokeMaterial,
};
