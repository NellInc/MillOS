/**
 * FarmAreaInstances.tsx - Instanced farm animals
 *
 * Converts individual animal components (Chicken, Pig, Cow, Sheep) to InstancedMesh
 * for significant draw call reduction:
 * - 5 chickens: 40 draw calls -> 8 draw calls
 * - 3 pigs: 42 draw calls -> 14 draw calls
 * - 3 cows: 57 draw calls -> 19 draw calls
 * - 4 sheep: 60 draw calls -> 15 draw calls
 * Total: ~199 draw calls -> ~56 draw calls (72% reduction)
 *
 * Pattern: Pre-translated geometries with module-level materials
 */

import React, { useMemo, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

// ============================================================
// SHARED MATERIALS (Module Level)
// ============================================================

const ANIMAL_MATERIALS = {
  // Chicken
  chickenFeather: new THREE.MeshStandardMaterial({ color: '#f5f5dc', roughness: 0.9 }),
  chickenBeak: new THREE.MeshStandardMaterial({ color: '#ff9800', roughness: 0.7 }),
  chickenComb: new THREE.MeshStandardMaterial({ color: '#d32f2f', roughness: 0.7 }),
  chickenTail: new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.8 }),

  // Pig
  pigPink: new THREE.MeshStandardMaterial({ color: '#ffb6c1', roughness: 0.8 }),
  pigSnout: new THREE.MeshStandardMaterial({ color: '#ff9999', roughness: 0.7 }),
  pigNostril: new THREE.MeshStandardMaterial({ color: '#cc6666', roughness: 0.8 }),
  black: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5 }),

  // Cow
  cowWhite: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.85 }),
  cowBlack: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85 }),
  cowMuzzle: new THREE.MeshStandardMaterial({ color: '#ffcccc', roughness: 0.8 }),
  cowNostril: new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.8 }),
  cowHorn: new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.6 }),

  // Sheep
  sheepWool: new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 1 }),
  sheepFace: new THREE.MeshStandardMaterial({ color: '#2d2d2d', roughness: 0.8 }),
  sheepEye: new THREE.MeshStandardMaterial({ color: '#ffd700', roughness: 0.5 }),
};

// ============================================================
// CHICKEN GEOMETRIES (Pre-translated)
// ============================================================

const createChickenGeometries = () => {
  // Body at [0, 0.25, 0]
  const body = new THREE.SphereGeometry(0.2, 8, 8);
  body.translate(0, 0.25, 0);

  // Head at [0.15, 0.4, 0]
  const head = new THREE.SphereGeometry(0.12, 8, 8);
  head.translate(0.15, 0.4, 0);

  // Beak at [0.28, 0.38, 0], rotation [0, 0, -0.3]
  const beak = new THREE.ConeGeometry(0.03, 0.08, 4);
  beak.rotateZ(-0.3);
  beak.translate(0.28, 0.38, 0);

  // Comb at [0.15, 0.52, 0]
  const comb = new THREE.BoxGeometry(0.08, 0.1, 0.02);
  comb.translate(0.15, 0.52, 0);

  // Wattle at [0.2, 0.32, 0]
  const wattle = new THREE.SphereGeometry(0.03, 6, 6);
  wattle.translate(0.2, 0.32, 0);

  // Tail at [-0.2, 0.35, 0], rotation [0, 0, 0.8]
  const tail = new THREE.BoxGeometry(0.15, 0.02, 0.1);
  tail.rotateZ(0.8);
  tail.translate(-0.2, 0.35, 0);

  // Left leg at [0.05, 0.08, 0.05]
  const legLeft = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 4);
  legLeft.translate(0.05, 0.08, 0.05);

  // Right leg at [0.05, 0.08, -0.05]
  const legRight = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 4);
  legRight.translate(0.05, 0.08, -0.05);

  return { body, head, beak, comb, wattle, tail, legLeft, legRight };
};

// ============================================================
// PIG GEOMETRIES (Pre-translated)
// ============================================================

const createPigGeometries = () => {
  // Body at [0, 0.35, 0]
  const body = new THREE.SphereGeometry(0.4, 12, 12);
  body.translate(0, 0.35, 0);

  // Head at [0.35, 0.4, 0]
  const head = new THREE.SphereGeometry(0.25, 10, 10);
  head.translate(0.35, 0.4, 0);

  // Snout at [0.55, 0.35, 0], rotation [0, 0, PI/2]
  const snout = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8);
  snout.rotateZ(Math.PI / 2);
  snout.translate(0.55, 0.35, 0);

  // Nostrils at [0.61, 0.37, +/-0.04]
  const nostrilLeft = new THREE.SphereGeometry(0.02, 6, 6);
  nostrilLeft.translate(0.61, 0.37, 0.04);
  const nostrilRight = new THREE.SphereGeometry(0.02, 6, 6);
  nostrilRight.translate(0.61, 0.37, -0.04);

  // Ears at [0.25, 0.6, +/-0.15]
  const earLeft = new THREE.ConeGeometry(0.08, 0.15, 4);
  earLeft.rotateX(0.5);
  earLeft.rotateY(0.3);
  earLeft.translate(0.25, 0.6, 0.15);
  const earRight = new THREE.ConeGeometry(0.08, 0.15, 4);
  earRight.rotateX(0.5);
  earRight.rotateY(-0.3);
  earRight.translate(0.25, 0.6, -0.15);

  // Eyes at [0.5, 0.48, +/-0.12]
  const eyeLeft = new THREE.SphereGeometry(0.03, 6, 6);
  eyeLeft.translate(0.5, 0.48, 0.12);
  const eyeRight = new THREE.SphereGeometry(0.03, 6, 6);
  eyeRight.translate(0.5, 0.48, -0.12);

  // Legs at 4 positions
  const legs: THREE.CylinderGeometry[] = [];
  const legPositions = [
    [0.15, 0.1, 0.2],
    [0.15, 0.1, -0.2],
    [-0.15, 0.1, 0.2],
    [-0.15, 0.1, -0.2],
  ];
  for (const pos of legPositions) {
    const leg = new THREE.CylinderGeometry(0.06, 0.05, 0.2, 6);
    leg.translate(pos[0], pos[1], pos[2]);
    legs.push(leg);
  }

  // Tail at [-0.4, 0.45, 0], rotation [0, 0, 0.5]
  const tail = new THREE.TorusGeometry(0.06, 0.02, 8, 12, Math.PI * 1.5);
  tail.rotateZ(0.5);
  tail.translate(-0.4, 0.45, 0);

  return {
    body,
    head,
    snout,
    nostrilLeft,
    nostrilRight,
    earLeft,
    earRight,
    eyeLeft,
    eyeRight,
    legs,
    tail,
  };
};

// ============================================================
// COW GEOMETRIES (Pre-translated)
// ============================================================

const createCowGeometries = () => {
  // Body at [0, 0.6, 0], scale [1.3, 1, 1]
  const body = new THREE.SphereGeometry(0.5, 12, 12);
  body.scale(1.3, 1, 1);
  body.translate(0, 0.6, 0);

  // Spots
  const spotLarge = new THREE.SphereGeometry(0.18, 8, 8);
  spotLarge.translate(0.2, 0.8, 0.3);
  const spotSmall = new THREE.SphereGeometry(0.15, 8, 8);
  spotSmall.translate(-0.3, 0.5, -0.25);

  // Head at [0.6, 0.7, 0]
  const head = new THREE.BoxGeometry(0.35, 0.3, 0.28);
  head.translate(0.6, 0.7, 0);

  // Muzzle at [0.8, 0.6, 0]
  const muzzle = new THREE.BoxGeometry(0.15, 0.18, 0.22);
  muzzle.translate(0.8, 0.6, 0);

  // Nostrils at [0.88, 0.62, +/-0.05]
  const nostrilLeft = new THREE.SphereGeometry(0.025, 6, 6);
  nostrilLeft.translate(0.88, 0.62, 0.05);
  const nostrilRight = new THREE.SphereGeometry(0.025, 6, 6);
  nostrilRight.translate(0.88, 0.62, -0.05);

  // Eyes at [0.7, 0.78, +/-0.12]
  const eyeLeft = new THREE.SphereGeometry(0.04, 6, 6);
  eyeLeft.translate(0.7, 0.78, 0.12);
  const eyeRight = new THREE.SphereGeometry(0.04, 6, 6);
  eyeRight.translate(0.7, 0.78, -0.12);

  // Ears at [0.5, 0.82, +/-0.18]
  const earLeft = new THREE.BoxGeometry(0.12, 0.06, 0.08);
  earLeft.rotateY(0.5);
  earLeft.rotateZ(0.3);
  earLeft.translate(0.5, 0.82, 0.18);
  const earRight = new THREE.BoxGeometry(0.12, 0.06, 0.08);
  earRight.rotateY(-0.5);
  earRight.rotateZ(-0.3);
  earRight.translate(0.5, 0.82, -0.18);

  // Horns at [0.45, 0.92, +/-0.1]
  const hornLeft = new THREE.ConeGeometry(0.03, 0.15, 6);
  hornLeft.rotateZ(0.3);
  hornLeft.translate(0.45, 0.92, 0.1);
  const hornRight = new THREE.ConeGeometry(0.03, 0.15, 6);
  hornRight.rotateZ(-0.3);
  hornRight.translate(0.45, 0.92, -0.1);

  // Legs at 4 positions
  const legs: THREE.CylinderGeometry[] = [];
  const legPositions = [
    [0.3, 0.2, 0.25],
    [0.3, 0.2, -0.25],
    [-0.35, 0.2, 0.25],
    [-0.35, 0.2, -0.25],
  ];
  for (const pos of legPositions) {
    const leg = new THREE.CylinderGeometry(0.06, 0.05, 0.4, 6);
    leg.translate(pos[0], pos[1], pos[2]);
    legs.push(leg);
  }

  // Udder at [-0.15, 0.25, 0]
  const udder = new THREE.SphereGeometry(0.12, 8, 8);
  udder.translate(-0.15, 0.25, 0);

  // Tail at [-0.65, 0.7, 0], rotation [0, 0, 0.8]
  const tail = new THREE.CylinderGeometry(0.02, 0.015, 0.5, 6);
  tail.rotateZ(0.8);
  tail.translate(-0.65, 0.7, 0);

  // Tail tuft at [-0.85, 0.45, 0]
  const tailTuft = new THREE.SphereGeometry(0.05, 6, 6);
  tailTuft.translate(-0.85, 0.45, 0);

  return {
    body,
    spotLarge,
    spotSmall,
    head,
    muzzle,
    nostrilLeft,
    nostrilRight,
    eyeLeft,
    eyeRight,
    earLeft,
    earRight,
    hornLeft,
    hornRight,
    legs,
    udder,
    tail,
    tailTuft,
  };
};

// ============================================================
// SHEEP GEOMETRIES (Pre-translated)
// ============================================================

const createSheepGeometries = () => {
  // Body at [0, 0.5, 0]
  const body = new THREE.SphereGeometry(0.45, 12, 12);
  body.translate(0, 0.5, 0);

  // Fluff balls at 4 positions
  const fluffPositions = [
    [0.2, 0.7, 0.2],
    [-0.2, 0.75, 0.15],
    [0, 0.8, -0.2],
    [0.15, 0.65, -0.25],
  ];
  const fluffs: THREE.SphereGeometry[] = [];
  for (const pos of fluffPositions) {
    const fluff = new THREE.SphereGeometry(0.15, 8, 8);
    fluff.translate(pos[0], pos[1], pos[2]);
    fluffs.push(fluff);
  }

  // Head at [0.4, 0.55, 0]
  const head = new THREE.SphereGeometry(0.18, 10, 10);
  head.translate(0.4, 0.55, 0);

  // Ears at [0.35, 0.65, +/-0.15]
  const earLeft = new THREE.BoxGeometry(0.1, 0.05, 0.08);
  earLeft.rotateY(0.5);
  earLeft.rotateZ(0.5);
  earLeft.translate(0.35, 0.65, 0.15);
  const earRight = new THREE.BoxGeometry(0.1, 0.05, 0.08);
  earRight.rotateY(-0.5);
  earRight.rotateZ(-0.5);
  earRight.translate(0.35, 0.65, -0.15);

  // Eyes at [0.52, 0.6, +/-0.08]
  const eyeLeft = new THREE.SphereGeometry(0.025, 6, 6);
  eyeLeft.translate(0.52, 0.6, 0.08);
  const eyeRight = new THREE.SphereGeometry(0.025, 6, 6);
  eyeRight.translate(0.52, 0.6, -0.08);

  // Legs at 4 positions
  const legs: THREE.CylinderGeometry[] = [];
  const legPositions = [
    [0.2, 0.12, 0.18],
    [0.2, 0.12, -0.18],
    [-0.2, 0.12, 0.18],
    [-0.2, 0.12, -0.18],
  ];
  for (const pos of legPositions) {
    const leg = new THREE.CylinderGeometry(0.04, 0.035, 0.25, 6);
    leg.translate(pos[0], pos[1], pos[2]);
    legs.push(leg);
  }

  return { body, fluffs, head, earLeft, earRight, eyeLeft, eyeRight, legs };
};

// Create geometries once at module load
const CHICKEN_GEO = createChickenGeometries();
const PIG_GEO = createPigGeometries();
const COW_GEO = createCowGeometries();
const SHEEP_GEO = createSheepGeometries();

// ============================================================
// HELPER HOOK - Updates instance matrices
// ============================================================

interface AnimalInstanceData {
  position: [number, number, number];
  rotation?: number;
}

const useAnimalInstances = (count: number, data: AnimalInstanceData[]) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tempObject = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!meshRef.current || data.length === 0) return;

    data.forEach((item, i) => {
      tempObject.position.set(...item.position);
      tempObject.rotation.set(0, item.rotation ?? 0, 0);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [data, tempObject]);

  return meshRef;
};

// ============================================================
// INSTANCED CHICKEN COMPONENT (8 draw calls for 5 chickens)
// ============================================================

export interface ChickenInstanceData {
  position: [number, number, number];
  rotation?: number;
}

export const InstancedChickens: React.FC<{
  chickens: ChickenInstanceData[];
}> = React.memo(({ chickens }) => {
  const count = chickens.length;
  if (count === 0) return null;

  const data = useMemo(
    () => chickens.map((c) => ({ position: c.position, rotation: c.rotation ?? 0 })),
    [chickens]
  );

  const bodyRef = useAnimalInstances(count, data);
  const headRef = useAnimalInstances(count, data);
  const beakRef = useAnimalInstances(count, data);
  const combRef = useAnimalInstances(count, data);
  const wattleRef = useAnimalInstances(count, data);
  const tailRef = useAnimalInstances(count, data);
  const legLeftRef = useAnimalInstances(count, data);
  const legRightRef = useAnimalInstances(count, data);

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[CHICKEN_GEO.body, ANIMAL_MATERIALS.chickenFeather, count]}
        castShadow
      />
      <instancedMesh
        ref={headRef}
        args={[CHICKEN_GEO.head, ANIMAL_MATERIALS.chickenFeather, count]}
        castShadow
      />
      <instancedMesh
        ref={beakRef}
        args={[CHICKEN_GEO.beak, ANIMAL_MATERIALS.chickenBeak, count]}
        castShadow
      />
      <instancedMesh
        ref={combRef}
        args={[CHICKEN_GEO.comb, ANIMAL_MATERIALS.chickenComb, count]}
        castShadow
      />
      <instancedMesh
        ref={wattleRef}
        args={[CHICKEN_GEO.wattle, ANIMAL_MATERIALS.chickenComb, count]}
        castShadow
      />
      <instancedMesh
        ref={tailRef}
        args={[CHICKEN_GEO.tail, ANIMAL_MATERIALS.chickenTail, count]}
        castShadow
      />
      <instancedMesh
        ref={legLeftRef}
        args={[CHICKEN_GEO.legLeft, ANIMAL_MATERIALS.chickenBeak, count]}
        castShadow
      />
      <instancedMesh
        ref={legRightRef}
        args={[CHICKEN_GEO.legRight, ANIMAL_MATERIALS.chickenBeak, count]}
        castShadow
      />
    </group>
  );
});
InstancedChickens.displayName = 'InstancedChickens';

// ============================================================
// INSTANCED PIG COMPONENT (14 draw calls for 3 pigs)
// ============================================================

export interface PigInstanceData {
  position: [number, number, number];
  rotation?: number;
}

export const InstancedPigs: React.FC<{
  pigs: PigInstanceData[];
}> = React.memo(({ pigs }) => {
  const count = pigs.length;
  if (count === 0) return null;

  const data = useMemo(
    () => pigs.map((p) => ({ position: p.position, rotation: p.rotation ?? 0 })),
    [pigs]
  );

  const bodyRef = useAnimalInstances(count, data);
  const headRef = useAnimalInstances(count, data);
  const snoutRef = useAnimalInstances(count, data);
  const nostrilLeftRef = useAnimalInstances(count, data);
  const nostrilRightRef = useAnimalInstances(count, data);
  const earLeftRef = useAnimalInstances(count, data);
  const earRightRef = useAnimalInstances(count, data);
  const eyeLeftRef = useAnimalInstances(count, data);
  const eyeRightRef = useAnimalInstances(count, data);
  const leg0Ref = useAnimalInstances(count, data);
  const leg1Ref = useAnimalInstances(count, data);
  const leg2Ref = useAnimalInstances(count, data);
  const leg3Ref = useAnimalInstances(count, data);
  const tailRef = useAnimalInstances(count, data);

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[PIG_GEO.body, ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh
        ref={headRef}
        args={[PIG_GEO.head, ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh
        ref={snoutRef}
        args={[PIG_GEO.snout, ANIMAL_MATERIALS.pigSnout, count]}
        castShadow
      />
      <instancedMesh
        ref={nostrilLeftRef}
        args={[PIG_GEO.nostrilLeft, ANIMAL_MATERIALS.pigNostril, count]}
      />
      <instancedMesh
        ref={nostrilRightRef}
        args={[PIG_GEO.nostrilRight, ANIMAL_MATERIALS.pigNostril, count]}
      />
      <instancedMesh
        ref={earLeftRef}
        args={[PIG_GEO.earLeft, ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh
        ref={earRightRef}
        args={[PIG_GEO.earRight, ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh ref={eyeLeftRef} args={[PIG_GEO.eyeLeft, ANIMAL_MATERIALS.black, count]} />
      <instancedMesh ref={eyeRightRef} args={[PIG_GEO.eyeRight, ANIMAL_MATERIALS.black, count]} />
      <instancedMesh
        ref={leg0Ref}
        args={[PIG_GEO.legs[0], ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh
        ref={leg1Ref}
        args={[PIG_GEO.legs[1], ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh
        ref={leg2Ref}
        args={[PIG_GEO.legs[2], ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh
        ref={leg3Ref}
        args={[PIG_GEO.legs[3], ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
      <instancedMesh
        ref={tailRef}
        args={[PIG_GEO.tail, ANIMAL_MATERIALS.pigPink, count]}
        castShadow
      />
    </group>
  );
});
InstancedPigs.displayName = 'InstancedPigs';

// ============================================================
// INSTANCED COW COMPONENT (19 draw calls for 3 cows)
// ============================================================

export interface CowInstanceData {
  position: [number, number, number];
  rotation?: number;
}

export const InstancedCows: React.FC<{
  cows: CowInstanceData[];
}> = React.memo(({ cows }) => {
  const count = cows.length;
  if (count === 0) return null;

  const data = useMemo(
    () => cows.map((c) => ({ position: c.position, rotation: c.rotation ?? 0 })),
    [cows]
  );

  const bodyRef = useAnimalInstances(count, data);
  const spotLargeRef = useAnimalInstances(count, data);
  const spotSmallRef = useAnimalInstances(count, data);
  const headRef = useAnimalInstances(count, data);
  const muzzleRef = useAnimalInstances(count, data);
  const nostrilLeftRef = useAnimalInstances(count, data);
  const nostrilRightRef = useAnimalInstances(count, data);
  const eyeLeftRef = useAnimalInstances(count, data);
  const eyeRightRef = useAnimalInstances(count, data);
  const earLeftRef = useAnimalInstances(count, data);
  const earRightRef = useAnimalInstances(count, data);
  const hornLeftRef = useAnimalInstances(count, data);
  const hornRightRef = useAnimalInstances(count, data);
  const leg0Ref = useAnimalInstances(count, data);
  const leg1Ref = useAnimalInstances(count, data);
  const leg2Ref = useAnimalInstances(count, data);
  const leg3Ref = useAnimalInstances(count, data);
  const udderRef = useAnimalInstances(count, data);
  const tailRef = useAnimalInstances(count, data);
  const tailTuftRef = useAnimalInstances(count, data);

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[COW_GEO.body, ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={spotLargeRef}
        args={[COW_GEO.spotLarge, ANIMAL_MATERIALS.cowBlack, count]}
        castShadow
      />
      <instancedMesh
        ref={spotSmallRef}
        args={[COW_GEO.spotSmall, ANIMAL_MATERIALS.cowBlack, count]}
        castShadow
      />
      <instancedMesh
        ref={headRef}
        args={[COW_GEO.head, ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={muzzleRef}
        args={[COW_GEO.muzzle, ANIMAL_MATERIALS.cowMuzzle, count]}
        castShadow
      />
      <instancedMesh
        ref={nostrilLeftRef}
        args={[COW_GEO.nostrilLeft, ANIMAL_MATERIALS.cowNostril, count]}
      />
      <instancedMesh
        ref={nostrilRightRef}
        args={[COW_GEO.nostrilRight, ANIMAL_MATERIALS.cowNostril, count]}
      />
      <instancedMesh ref={eyeLeftRef} args={[COW_GEO.eyeLeft, ANIMAL_MATERIALS.black, count]} />
      <instancedMesh ref={eyeRightRef} args={[COW_GEO.eyeRight, ANIMAL_MATERIALS.black, count]} />
      <instancedMesh
        ref={earLeftRef}
        args={[COW_GEO.earLeft, ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={earRightRef}
        args={[COW_GEO.earRight, ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={hornLeftRef}
        args={[COW_GEO.hornLeft, ANIMAL_MATERIALS.cowHorn, count]}
        castShadow
      />
      <instancedMesh
        ref={hornRightRef}
        args={[COW_GEO.hornRight, ANIMAL_MATERIALS.cowHorn, count]}
        castShadow
      />
      <instancedMesh
        ref={leg0Ref}
        args={[COW_GEO.legs[0], ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={leg1Ref}
        args={[COW_GEO.legs[1], ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={leg2Ref}
        args={[COW_GEO.legs[2], ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={leg3Ref}
        args={[COW_GEO.legs[3], ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={udderRef}
        args={[COW_GEO.udder, ANIMAL_MATERIALS.cowMuzzle, count]}
        castShadow
      />
      <instancedMesh
        ref={tailRef}
        args={[COW_GEO.tail, ANIMAL_MATERIALS.cowWhite, count]}
        castShadow
      />
      <instancedMesh
        ref={tailTuftRef}
        args={[COW_GEO.tailTuft, ANIMAL_MATERIALS.cowBlack, count]}
        castShadow
      />
    </group>
  );
});
InstancedCows.displayName = 'InstancedCows';

// ============================================================
// INSTANCED SHEEP COMPONENT (15 draw calls for 4 sheep)
// ============================================================

export interface SheepInstanceData {
  position: [number, number, number];
  rotation?: number;
}

export const InstancedSheep: React.FC<{
  sheep: SheepInstanceData[];
}> = React.memo(({ sheep }) => {
  const count = sheep.length;
  if (count === 0) return null;

  const data = useMemo(
    () => sheep.map((s) => ({ position: s.position, rotation: s.rotation ?? 0 })),
    [sheep]
  );

  const bodyRef = useAnimalInstances(count, data);
  const fluff0Ref = useAnimalInstances(count, data);
  const fluff1Ref = useAnimalInstances(count, data);
  const fluff2Ref = useAnimalInstances(count, data);
  const fluff3Ref = useAnimalInstances(count, data);
  const headRef = useAnimalInstances(count, data);
  const earLeftRef = useAnimalInstances(count, data);
  const earRightRef = useAnimalInstances(count, data);
  const eyeLeftRef = useAnimalInstances(count, data);
  const eyeRightRef = useAnimalInstances(count, data);
  const leg0Ref = useAnimalInstances(count, data);
  const leg1Ref = useAnimalInstances(count, data);
  const leg2Ref = useAnimalInstances(count, data);
  const leg3Ref = useAnimalInstances(count, data);

  return (
    <group>
      <instancedMesh
        ref={bodyRef}
        args={[SHEEP_GEO.body, ANIMAL_MATERIALS.sheepWool, count]}
        castShadow
      />
      <instancedMesh
        ref={fluff0Ref}
        args={[SHEEP_GEO.fluffs[0], ANIMAL_MATERIALS.sheepWool, count]}
        castShadow
      />
      <instancedMesh
        ref={fluff1Ref}
        args={[SHEEP_GEO.fluffs[1], ANIMAL_MATERIALS.sheepWool, count]}
        castShadow
      />
      <instancedMesh
        ref={fluff2Ref}
        args={[SHEEP_GEO.fluffs[2], ANIMAL_MATERIALS.sheepWool, count]}
        castShadow
      />
      <instancedMesh
        ref={fluff3Ref}
        args={[SHEEP_GEO.fluffs[3], ANIMAL_MATERIALS.sheepWool, count]}
        castShadow
      />
      <instancedMesh
        ref={headRef}
        args={[SHEEP_GEO.head, ANIMAL_MATERIALS.sheepFace, count]}
        castShadow
      />
      <instancedMesh
        ref={earLeftRef}
        args={[SHEEP_GEO.earLeft, ANIMAL_MATERIALS.sheepFace, count]}
        castShadow
      />
      <instancedMesh
        ref={earRightRef}
        args={[SHEEP_GEO.earRight, ANIMAL_MATERIALS.sheepFace, count]}
        castShadow
      />
      <instancedMesh ref={eyeLeftRef} args={[SHEEP_GEO.eyeLeft, ANIMAL_MATERIALS.sheepEye, count]} />
      <instancedMesh
        ref={eyeRightRef}
        args={[SHEEP_GEO.eyeRight, ANIMAL_MATERIALS.sheepEye, count]}
      />
      <instancedMesh
        ref={leg0Ref}
        args={[SHEEP_GEO.legs[0], ANIMAL_MATERIALS.sheepFace, count]}
        castShadow
      />
      <instancedMesh
        ref={leg1Ref}
        args={[SHEEP_GEO.legs[1], ANIMAL_MATERIALS.sheepFace, count]}
        castShadow
      />
      <instancedMesh
        ref={leg2Ref}
        args={[SHEEP_GEO.legs[2], ANIMAL_MATERIALS.sheepFace, count]}
        castShadow
      />
      <instancedMesh
        ref={leg3Ref}
        args={[SHEEP_GEO.legs[3], ANIMAL_MATERIALS.sheepFace, count]}
        castShadow
      />
    </group>
  );
});
InstancedSheep.displayName = 'InstancedSheep';

// ============================================================
// STATIC DATA ARRAYS (for use in FarmArea.tsx)
// ============================================================

export const FARM_CHICKENS: ChickenInstanceData[] = [
  { position: [13, 0, -3], rotation: 0.5 },
  { position: [14, 0, -4], rotation: -0.3 },
  { position: [11, 0, -2.5], rotation: 1.2 },
  { position: [13.5, 0, -6], rotation: 2.1 },
  { position: [10.5, 0, -4.5], rotation: -1.5 },
];

export const FARM_PIGS: PigInstanceData[] = [
  { position: [-12, 0, -5], rotation: 0.8 },
  { position: [-11, 0, -6], rotation: -0.5 },
  { position: [-13, 0, -4], rotation: 1.5 },
];

export const FARM_COWS: CowInstanceData[] = [
  { position: [0, 0, 15], rotation: 0.3 },
  { position: [5, 0, 18], rotation: -0.8 },
  { position: [8, 0, 13], rotation: 1.5 },
];

export const FARM_SHEEP: SheepInstanceData[] = [
  { position: [6, 0, -2], rotation: 0.6 },
  { position: [7, 0, 1], rotation: -0.4 },
  { position: [8, 0, 5], rotation: 1.8 },
  { position: [-8, 0, 5], rotation: 2.5 },
];
