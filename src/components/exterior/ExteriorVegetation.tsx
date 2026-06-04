/**
 * ExteriorVegetation.tsx - Instanced vegetation and scenery
 *
 * Converts SimpleTree and ParkBench from individual meshes to InstancedMesh
 * for significant draw call reduction (48 -> 7 draw calls, ~85% reduction)
 *
 * Pattern: Pre-translated geometries with module-level materials
 */

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { SIMPLE_TREE_MATERIALS, BENCH_MATERIALS } from '../../utils/sharedMaterials';

// ============================================================
// GEOMETRIES (Module Level - Pre-translated with baked offsets)
// ============================================================

// SimpleTree geometry offsets (from original component):
// - Trunk: position [0, 1.5, 0], cylinder [0.3, 0.4, 3, 6]
// - Lower foliage: position [0, 4.5, 0], cone [2, 5, 6]
// - Upper foliage: position [0, 6.5, 0], cone [1.5, 3.5, 6]

const createTreeGeometries = () => {
  const trunk = new THREE.CylinderGeometry(0.3, 0.4, 3, 6);
  trunk.translate(0, 1.5, 0);

  const foliageLower = new THREE.ConeGeometry(2, 5, 6);
  foliageLower.translate(0, 4.5, 0);

  const foliageUpper = new THREE.ConeGeometry(1.5, 3.5, 6);
  foliageUpper.translate(0, 6.5, 0);

  return { trunk, foliageLower, foliageUpper };
};

// ParkBench geometry offsets (from original component):
// - Seat: position [0, 0.45, 0], box [1.8, 0.1, 0.5]
// - Backrest: position [0, 0.75, -0.2], rotation [0.2, 0, 0], box [1.8, 0.5, 0.08]
// - Left leg: position [-0.7, 0.22, 0], box [0.1, 0.45, 0.4]
// - Right leg: position [0.7, 0.22, 0], box [0.1, 0.45, 0.4]

const createBenchGeometries = () => {
  const seat = new THREE.BoxGeometry(1.8, 0.1, 0.5);
  seat.translate(0, 0.45, 0);

  const backrest = new THREE.BoxGeometry(1.8, 0.5, 0.08);
  backrest.rotateX(0.2);
  backrest.translate(0, 0.75, -0.2);

  const leftLeg = new THREE.BoxGeometry(0.1, 0.45, 0.4);
  leftLeg.translate(-0.7, 0.22, 0);

  const rightLeg = new THREE.BoxGeometry(0.1, 0.45, 0.4);
  rightLeg.translate(0.7, 0.22, 0);

  return { seat, backrest, leftLeg, rightLeg };
};

// Create geometries once at module load
const TREE_GEOMETRIES = createTreeGeometries();
const BENCH_GEOMETRIES = createBenchGeometries();

// ============================================================
// HELPER HOOK - Updates instance matrices
// ============================================================

interface InstanceData {
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}

const useInstances = (_count: number, data: InstanceData[]) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!meshRef.current || data.length === 0) return;

    data.forEach((item, i) => {
      tempObject.position.set(...item.position);
      tempObject.rotation.set(0, item.rotation ?? 0, 0);
      const scale = item.scale ?? 1;
      tempObject.scale.set(scale, scale, scale);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [data, tempObject]);

  return meshRef;
};

// ============================================================
// INSTANCED TREE COMPONENT
// ============================================================

export interface TreeInstanceData {
  position: [number, number, number];
  scale?: number;
}

export const SimpleTreeInstances: React.FC<{
  trees: TreeInstanceData[];
}> = React.memo(({ trees }) => {
  const count = trees.length;

  const data = useMemo(
    () => trees.map((t) => ({ position: t.position, scale: t.scale ?? 1 })),
    [trees]
  );

  const trunkRef = useInstances(count, data);
  const foliageLowerRef = useInstances(count, data);
  const foliageUpperRef = useInstances(count, data);

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={trunkRef}
        args={[TREE_GEOMETRIES.trunk, SIMPLE_TREE_MATERIALS.trunk, count]}
        castShadow
      />
      <instancedMesh
        ref={foliageLowerRef}
        args={[TREE_GEOMETRIES.foliageLower, SIMPLE_TREE_MATERIALS.foliageLower, count]}
        castShadow
      />
      <instancedMesh
        ref={foliageUpperRef}
        args={[TREE_GEOMETRIES.foliageUpper, SIMPLE_TREE_MATERIALS.foliageUpper, count]}
        castShadow
      />
    </group>
  );
});
SimpleTreeInstances.displayName = 'SimpleTreeInstances';

// ============================================================
// INSTANCED BENCH COMPONENT
// ============================================================

export interface BenchInstanceData {
  position: [number, number, number];
  rotation?: number;
}

export const ParkBenchInstances: React.FC<{
  benches: BenchInstanceData[];
}> = React.memo(({ benches }) => {
  const count = benches.length;

  const data = useMemo(
    () => benches.map((b) => ({ position: b.position, rotation: b.rotation ?? 0 })),
    [benches]
  );

  const seatRef = useInstances(count, data);
  const backrestRef = useInstances(count, data);
  const leftLegRef = useInstances(count, data);
  const rightLegRef = useInstances(count, data);

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={seatRef}
        args={[BENCH_GEOMETRIES.seat, BENCH_MATERIALS.wood, count]}
        castShadow
      />
      <instancedMesh
        ref={backrestRef}
        args={[BENCH_GEOMETRIES.backrest, BENCH_MATERIALS.wood, count]}
        castShadow
      />
      <instancedMesh
        ref={leftLegRef}
        args={[BENCH_GEOMETRIES.leftLeg, BENCH_MATERIALS.metal, count]}
        castShadow
      />
      <instancedMesh
        ref={rightLegRef}
        args={[BENCH_GEOMETRIES.rightLeg, BENCH_MATERIALS.metal, count]}
        castShadow
      />
    </group>
  );
});
ParkBenchInstances.displayName = 'ParkBenchInstances';

// ============================================================
// MAIN COMPONENT TREES (absolute positions in FactoryExterior main return)
// ============================================================

// Trees directly in FactoryExterior main component (not inside sub-components)
export const MAIN_EXTERIOR_TREES: TreeInstanceData[] = [
  // Lines 6452-6458: Additional trees along boundaries
  { position: [-105, 0, 60], scale: 1.3 },
  { position: [-110, 0, 30], scale: 1.1 },
  { position: [-110, 0, 0], scale: 1.2 },
  { position: [-110, 0, -30], scale: 1.0 },
  { position: [110, 0, 40], scale: 1.2 },
  { position: [110, 0, -20], scale: 1.1 },
  { position: [110, 0, -60], scale: 1.3 },
  // Lines 6916-6920: Trees along waterways
  { position: [-160, 0, 70], scale: 1.1 },
  { position: [-160, 0, 30], scale: 0.9 },
  { position: [-160, 0, -10], scale: 1.2 },
  { position: [-160, 0, -50], scale: 1.0 },
  { position: [-160, 0, -90], scale: 1.1 },
  // Lines 6923-6926: Trees by river
  { position: [-80, 0, -170], scale: 1.3 },
  { position: [-40, 0, -172], scale: 1.0 },
  { position: [40, 0, -170], scale: 1.2 },
  { position: [80, 0, -168], scale: 0.9 },
  // Lines 6929-6931: Trees by lake
  { position: [155, 0, 110], scale: 1.0 },
  { position: [160, 0, 135], scale: 1.2 },
  { position: [100, 0, 145], scale: 0.9 },
];

// Benches directly in FactoryExterior main component
export const MAIN_EXTERIOR_BENCHES: BenchInstanceData[] = [
  // Lines 6906-6908: Benches along paths
  { position: [-157, 0, 20], rotation: Math.PI / 2 },
  { position: [-157, 0, -60], rotation: Math.PI / 2 },
  { position: [0, 0, -140], rotation: 0 },
];

// ============================================================
// PARKLAND GROUP (at [-85, 0, -110]) - computed absolute positions
// ============================================================

export const PARKLAND_TREES: TreeInstanceData[] = [
  // Group position [-85, 0, -95] - moved further from river bank
  { position: [-90, 0, -92], scale: 1.0 },
  { position: [-81, 0, -97], scale: 0.9 },
  { position: [-85, 0, -89], scale: 1.1 },
];

export const PARKLAND_BENCHES: BenchInstanceData[] = [
  // Moved further from riverbank (was z=-110, now z=-90)
  { position: [-85, 0, -90], rotation: 0 },
];

// ============================================================
// FRONT-RIGHT PARKLAND (at [75, 0, 100]) - computed absolute positions
// ============================================================

export const FRONT_PARKLAND_TREES: TreeInstanceData[] = [
  // Group position [75, 0, 100] + relative positions
  { position: [67, 0, 95], scale: 1.2 }, // [-8, 0, -5] relative
  { position: [81, 0, 92], scale: 0.9 }, // [6, 0, -8] relative
];

export const FRONT_PARKLAND_BENCHES: BenchInstanceData[] = [
  // Group position [75, 0, 100] + relative positions
  { position: [71, 0, 90], rotation: Math.PI / 6 }, // [-4, 0, -10] relative
  { position: [79, 0, 90], rotation: -Math.PI / 6 }, // [4, 0, -10] relative
];
