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
import { TREE_MATERIALS, BENCH_MATERIALS } from '../../utils/sharedMaterials';
import {
  createCanopyCage,
  createFoliageMaterial,
  BROADLEAF_DEPTH,
} from '../scenery/InstancedFoliage';
import { WindDriver } from '../scenery/WindDriver';
import { GeneratedBoundary } from '../models/GeneratedModel';
import { useDracoGLTF } from '../../utils/dracoLoader';
import { GENERATED_ASSET_PATHS } from '../../utils/modelLoader';

// ============================================================
// GEOMETRIES (Module Level - Pre-translated with baked offsets)
// ============================================================

/**
 * Tree canopy: three alpha-cut card cages, one per variant.
 *
 * These used to be merged flat-shaded icosahedra - solid green blobs. The
 * exterior tree list sits physically BETWEEN the village and the farm
 * (MAIN_EXTERIOR_TREES below), so leaving it on the old system while those two
 * moved to card foliage would put two different species systems in the same
 * frame. FactoryExterior.tsx imports these three arrays for its individual
 * SimpleTree path, so the shape of the exports is unchanged: index by the
 * `variant` that `treeJitterFromPosition` returns.
 *
 * Sized to the previous canopies (blobs spanned y 4.4-6.6 at radius ~1.1-1.9),
 * so no exterior tree changes height or footprint.
 *
 * All three take the DOME crown layout (see `createCanopyCage`): three
 * overlapping masses weighted below the midline plus three off-axis lobes,
 * instead of the radially symmetric ball the cards used to form. The x/z
 * BOUNDING BOX is bit-identical (both layouts hand `CROWN_RIM` to a card at
 * yaw 0 and one at yaw PI/2). The VISIBLE crown is not: the inscribed leaf
 * blob's half-width goes 0.999 -> 1.082 radii, so a crown is ~8% wider at its
 * widest azimuth than it was, which is the point of the lumpier layout.
 *
 * The cage's BOUNDING BOX moves in y, at BOTH ends, and by an amount that
 * depends on the radius:height ratio - so it is a per-variant number, not one
 * number:
 *
 *   variant 0 (2.45 x 1.95): y 2.805..7.425 -> 3.292..7.250  (+486 / -175 mm)
 *   variant 1 (2.75 x 2.25): y 2.846..8.142 -> 3.383..7.950  (+537 / -192 mm)
 *   variant 2 (2.20 x 1.80): y 2.717..6.924 -> 3.146..6.800  (+429 / -123 mm)
 *
 * All six numbers are a SHRINK, and every one of them was a tilted card's
 * swung CORNER - transparent, since the leaf atlas cuts a disc out of each
 * cell - and not foliage anyone saw. At every azimuth the old crown's lowest
 * visible leaf sat slightly ABOVE where the new one sits, so the standing gap
 * down to the 3 m trunk top narrows rather than widening. Nothing reads the
 * extent: FactoryExterior draws these at the tree transform (both the
 * instanced path and the individual `SimpleTree`), the mulch decals are placed
 * from trunk positions, and no collider or layout number is derived from a
 * canopy. The bounding sphere only tightens, so culling cannot pop.
 */
export const TREE_FOLIAGE_VARIANTS = [
  createCanopyCage({ radius: 2.45, height: 1.95, centerY: 5.3, taper: 0 }),
  createCanopyCage({ radius: 2.75, height: 2.25, centerY: 5.7, taper: 0 }),
  createCanopyCage({ radius: 2.2, height: 1.8, centerY: 5.0, taper: 0.12 }),
];

/**
 * Per-variant hue jitter through three shared materials (no per-instance
 * material churn). `color` is a uniform and all three share one
 * `customProgramCacheKey`, so this is still ONE compiled shader program.
 */
export const TREE_FOLIAGE_MATERIALS = [
  createFoliageMaterial('broadleaf', '#c9d8b4'),
  createFoliageMaterial('broadleaf', '#ffffff'),
  createFoliageMaterial('broadleaf', '#b9c79c'),
];

/** Deterministic per-tree variant/rotation/scale jitter from position hash
 *  (identical to SimpleTree's, so a tree looks the same whether it is
 *  rendered individually or instanced). */
export const treeJitterFromPosition = (position: [number, number, number]) => {
  const h = Math.abs(Math.sin(position[0] * 12.9898 + position[2] * 78.233) * 43758.5453);
  const frac = h - Math.floor(h);
  return {
    variant: Math.floor(frac * 3) % 3,
    rotY: frac * Math.PI * 2,
    jitter: 0.9 + frac * 0.2,
  };
};

/**
 * Parkland trunk: a columnar bole standing on a flared foot.
 *
 * This was `CylinderGeometry(0.3, 0.4, 3, 12)` - a straight cone. On the
 * WIDEST trunk on the site (0.8 m at the base, up to 1.14 m once a 1.3 scale
 * and 1.1 jitter are applied, standing in parkland you walk into) a straight
 * cone reads as a lamp post. A mature park tree is the opposite shape: the
 * bole is very nearly a cylinder for its whole visible length and all the
 * spread is in the root flare, which is here concentrated into the bottom
 * 0.31 m as a concave swell 0.40 -> 0.316 with a knee where it meets the bole.
 * Previewed at 9.5 m in scripts/blender/machine_part_preview.py against
 * scripts/blender/specs/trees-canopy.json.
 *
 * Twelve radial segments is unchanged and is NOT the change here - the chord
 * argument for it still holds (2 x 0.4 x sin 15 deg = 0.207 m against 0.400 m
 * at 6 sides), as does the point that 6 segments put no vertex at theta 90/270
 * and so measured 0.693 m on X against 0.800 m on Z. (FactoryExterior's
 * individual `SimpleTree` path still holds a 6-segment cylinder copy of this;
 * that is a different file's edit.)
 *
 * ENVELOPE: opens at (0.4, -1.5), closes at (0.3, +1.5) and only ever dips
 * inside the straight line between - max radius and y range bit-identical to
 * the cylinder, verified at 0.00 mm by the preview harness. One shared
 * geometry through one InstancedMesh: 76 -> 143 vertices, once, for every
 * exterior tree at any count.
 */
const PARKLAND_TRUNK_PROFILE: readonly (readonly [number, number])[] = [
  [0.0, -1.5],
  [0.4, -1.5], // flare foot - envelope max radius
  [0.362, -1.428],
  [0.332, -1.33],
  [0.316, -1.19], // knee
  [0.31, -0.85],
  [0.307, -0.3],
  [0.305, 0.3],
  [0.302, 0.9],
  [0.3, 1.5], // envelope top radius / max y
  [0.0, 1.5],
];

const createTreeGeometries = () => {
  const trunk = new THREE.LatheGeometry(
    PARKLAND_TRUNK_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
    12
  );
  // LatheGeometry lays v out by profile INDEX, which would squeeze the bark map
  // into the flare; CylinderGeometry (what this replaces) lays it out linearly
  // in height, and TREE_MATERIALS.trunk maps its bark ClampToEdge at repeat 1.
  // Re-deriving v from y keeps the bark density exactly where it was.
  const pos = trunk.getAttribute('position');
  const uv = trunk.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, (pos.getY(i) + 1.5) / 3);
  uv.needsUpdate = true;
  trunk.translate(0, 1.5, 0);

  return { trunk };
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

/**
 * The designed parkland trunk, shared with `FactoryExterior`'s individual
 * `SimpleTree`.
 *
 * `SimpleTree` held its own inline `cylinderGeometry args={[0.3, 0.4, 3, 6]}` -
 * a straight 6-sided cone - and is live at six call sites, so six exterior
 * trees stood next to the 24 instanced ones wearing the shape this profile
 * replaced. Exporting the geometry rather than copying the numbers is what
 * stops the two paths drifting apart again. Already translated so its base sits
 * at y = 0.
 */
export const SHARED_TREE_TRUNK = TREE_GEOMETRIES.trunk;
const BENCH_GEOMETRIES = createBenchGeometries();

// ============================================================
// HELPER HOOK - Updates instance matrices
// ============================================================

interface InstanceData {
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}

const useInstances = (_count: number, data: InstanceData[], localMatrix?: THREE.Matrix4) => {
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
      if (localMatrix) tempObject.matrix.multiply(localMatrix);
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [data, tempObject, localMatrix]);

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
  // Per-tree deterministic variant/rotation/scale jitter, matching SimpleTree.
  // Trees are bucketed by canopy variant: one instancedMesh per variant plus
  // one for all trunks (4 draw calls total regardless of tree count).
  const { allTrees, byVariant } = useMemo(() => {
    const all: InstanceData[] = [];
    const buckets: InstanceData[][] = [[], [], []];
    trees.forEach((t) => {
      const { variant, rotY, jitter } = treeJitterFromPosition(t.position);
      const item: InstanceData = {
        position: t.position,
        rotation: rotY,
        scale: (t.scale ?? 1) * jitter,
      };
      all.push(item);
      buckets[variant].push(item);
    });
    return { allTrees: all, byVariant: buckets };
  }, [trees]);

  const trunkRef = useInstances(allTrees.length, allTrees);
  const canopy0Ref = useInstances(byVariant[0].length, byVariant[0]);
  const canopy1Ref = useInstances(byVariant[1].length, byVariant[1]);
  const canopy2Ref = useInstances(byVariant[2].length, byVariant[2]);
  const canopyRefs = useMemo(
    () => [canopy0Ref, canopy1Ref, canopy2Ref],
    [canopy0Ref, canopy1Ref, canopy2Ref]
  );

  // Wind-synced shadows: three copies map/alphaTest onto the depth material by
  // itself, but not the vertex sway, so leaves would move under a rigid shadow.
  useLayoutEffect(() => {
    canopyRefs.forEach((ref) => {
      if (ref.current) ref.current.customDepthMaterial = BROADLEAF_DEPTH;
    });
  }, [canopyRefs]);

  if (trees.length === 0) return null;

  return (
    <group>
      {/* Idempotent per frame - the village and the farm mount one too, and
          only the first call of any given frame advances the clock. */}
      <WindDriver />
      <instancedMesh
        ref={trunkRef}
        args={[TREE_GEOMETRIES.trunk, TREE_MATERIALS.trunk, allTrees.length]}
        castShadow
        receiveShadow
      />
      {byVariant.map((bucket, variant) =>
        bucket.length > 0 ? (
          <instancedMesh
            key={variant}
            ref={canopyRefs[variant]}
            args={[TREE_FOLIAGE_VARIANTS[variant], TREE_FOLIAGE_MATERIALS[variant], bucket.length]}
            castShadow
          />
        ) : null
      )}
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

const PrimitiveParkBenchInstances: React.FC<{
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
PrimitiveParkBenchInstances.displayName = 'PrimitiveParkBenchInstances';

// One material/mesh atlas, instanced across each parkland set. The normalized
// GLB hierarchy carries scale and centring; compose that matrix into every seat.
export function generatedBenchSource(scene: THREE.Object3D): THREE.Mesh {
  const meshes: THREE.Mesh[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  if (meshes.length !== 1 || Array.isArray(meshes[0].material))
    throw new Error('Park bench must contain one shared mesh and material');
  return meshes[0];
}

const GeneratedParkBenchInstances: React.FC<{ benches: BenchInstanceData[] }> = ({ benches }) => {
  const { scene } = useDracoGLTF(GENERATED_ASSET_PATHS.parkBench);
  const source = useMemo(() => generatedBenchSource(scene), [scene]);
  const ref = useInstances(benches.length, benches, source.matrixWorld);
  useLayoutEffect(() => {
    ref.current?.computeBoundingBox();
    ref.current?.computeBoundingSphere();
  }, [benches, ref]);
  return (
    <instancedMesh
      ref={ref}
      args={[source.geometry, source.material, benches.length]}
      castShadow
      receiveShadow
    />
  );
};

export const ParkBenchInstances: React.FC<{ benches: BenchInstanceData[] }> = React.memo(
  ({ benches }) =>
    benches.length ? (
      <GeneratedBoundary fallback={<PrimitiveParkBenchInstances benches={benches} />}>
        <GeneratedParkBenchInstances benches={benches} />
      </GeneratedBoundary>
    ) : null
);
ParkBenchInstances.displayName = 'ParkBenchInstances';

// ============================================================
// MAIN COMPONENT TREES (absolute positions in FactoryExterior main return)
// ============================================================

// Loose groves frame the village's outer grass verge and the mill approach.
// Kept outside the square, waterways and yard; all use the existing four
// instanced tree batches. Unequal spacing and canopy sizes leave sightlines.
export const LANDSCAPE_GROVE_TREES: TreeInstanceData[] = [
  { position: [-231, 0, -48], scale: 1.65 },
  { position: [-238, 0, -37], scale: 1.35 },
  { position: [-230, 0, -28], scale: 1.8 },
  { position: [-237, 0, -17], scale: 1.2 },
  { position: [-231, 0, 26], scale: 1.55 },
  { position: [-239, 0, 38], scale: 1.8 },
  { position: [-229, 0, 48], scale: 1.3 },
  { position: [-232, 0, 60], scale: 1.6 },
  { position: [-203, 0, -83], scale: 1.5 },
  { position: [-192, 0, -89], scale: 1.85 },
  { position: [-180, 0, -81], scale: 1.3 },
  { position: [-207, 0, 82], scale: 1.75 },
  { position: [-194, 0, 87], scale: 1.35 },
  { position: [-182, 0, 80], scale: 1.65 },
  { position: [-118, 0, 63], scale: 1.55 },
  { position: [-116, 0, 49], scale: 1.25 },
  { position: [-110, 0, 75], scale: 1.6 },
];

// Trees directly in FactoryExterior main component (not inside sub-components)
export const MAIN_EXTERIOR_TREES: TreeInstanceData[] = [
  ...LANDSCAPE_GROVE_TREES,
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
  // The old z=-140 placement floated in the river beneath the northern bridge.
  { position: [3, 0, -112], rotation: Math.PI },
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
