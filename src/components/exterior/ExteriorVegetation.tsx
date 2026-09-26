import { GeneratedGeometrySurface } from '../models/GeneratedGeometrySurface';
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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
import {
  getDistanceToRiver,
  sampleTerrainGroundHeight,
  signedDistanceToShape,
  MILLOS_RIVER_CONFIG,
  MILLOS_TERRAIN_REGIONS,
} from '../terrain/splatMapGenerator';
import { getLandmarkBounds, SITE_LAYOUT } from '../../constants/siteLayout';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { TerrainChannel, getTerrainGridSegments } from '../terrain/terrainTypes';

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
export function groundedTreePosition(
  position: [number, number, number],
  quality: string
): [number, number, number] {
  return [
    position[0],
    position[1] +
      sampleTerrainGroundHeight(position[0], position[2], getTerrainGridSegments(quality)),
    position[2],
  ];
}

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

/**
 * Five tapering scaffold branches connect the 3 m bole to its leaf crown.
 * The existing generated trunk and foliage retain their geometry and atlases.
 * Working if every crown has a woody connection, including in the low tier.
 */
function createTreeBranches(): THREE.BufferGeometry {
  const forks = [
    [[0, 2.6, 0], [0.14, 5.2, -0.08], 0.22, 0.07],
    [[0, 3.05, 0], [-1.45, 4.8, 0.3], 0.15, 0.03],
    [[0.08, 3.45, 0], [1.45, 5.1, -0.35], 0.14, 0.025],
    [[0.08, 3.6, 0], [0.15, 5.65, 1.3], 0.13, 0.025],
    [[0.1, 4.25, -0.1], [-0.65, 5.6, -1.25], 0.11, 0.02],
  ] as const;
  const up = new THREE.Vector3(0, 1, 0);
  const parts = forks.map(([from, to, base, tip]) => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const geometry = new THREE.CylinderGeometry(tip, base, direction.length(), 8);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize()));
    geometry.translate(...start.add(end).multiplyScalar(0.5).toArray());
    return geometry;
  });
  const result = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!result) throw new Error('Cannot assemble parkland scaffold branches');
  result.name = 'parkland-scaffold-branches';
  result.computeBoundingBox();
  return result;
}
export const TREE_BRANCH_GEOMETRY = createTreeBranches();
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
    // A quality change moves grounded heights; three never refreshes the
    // cached bounds of an InstancedMesh on its own.
    meshRef.current.computeBoundingBox();
    meshRef.current.computeBoundingSphere();
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
  // one for trunks and one for branches (5 draws regardless of tree count).
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const { allTrees, byVariant } = useMemo(() => {
    const all: InstanceData[] = [];
    const buckets: InstanceData[][] = [[], [], []];
    trees.forEach((t) => {
      const { variant, rotY, jitter } = treeJitterFromPosition(t.position);
      const item: InstanceData = {
        position: groundedTreePosition(t.position, quality),
        rotation: rotY,
        scale: (t.scale ?? 1) * jitter,
      };
      all.push(item);
      buckets[variant].push(item);
    });
    return { allTrees: all, byVariant: buckets };
  }, [trees, quality]);

  const trunkRef = useInstances(allTrees.length, allTrees);
  const branchRef = useInstances(allTrees.length, allTrees);
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
        name="tree-trunks"
        ref={trunkRef}
        args={[TREE_GEOMETRIES.trunk, TREE_MATERIALS.trunk, allTrees.length]}
        castShadow
        receiveShadow
      >
        <GeneratedBoundary fallback={null}>
          <GeneratedGeometrySurface
            asset={'parkTrunkUnit'}
            original={TREE_GEOMETRIES.trunk}
            meshRef={trunkRef}
          />
        </GeneratedBoundary>
      </instancedMesh>
      <instancedMesh
        name="parkland-scaffold-branches"
        ref={branchRef}
        args={[TREE_BRANCH_GEOMETRY, TREE_MATERIALS.trunk, allTrees.length]}
        castShadow
        receiveShadow
      />
      {byVariant.map((bucket, variant) =>
        bucket.length > 0 ? (
          <instancedMesh
            key={variant}
            name="tree-canopies"
            ref={canopyRefs[variant]}
            args={[TREE_FOLIAGE_VARIANTS[variant], TREE_FOLIAGE_MATERIALS[variant], bucket.length]}
            castShadow
          >
            <GeneratedBoundary fallback={null}>
              <GeneratedGeometrySurface
                asset={
                  (['parkCanopyZeroUnit', 'parkCanopyOneUnit', 'parkCanopyTwoUnit'] as const)[
                    variant
                  ]
                }
                original={TREE_FOLIAGE_VARIANTS[variant]}
                meshRef={canopyRefs[variant]}
              />
            </GeneratedBoundary>
          </instancedMesh>
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
// Kept outside the square, waterways and yard; all use the existing five
// instanced tree batches. Unequal spacing and canopy sizes leave sightlines.
const VALLEY_GROVES = [
  [-174, -98, 22, 11, 36],
  [-119, -93, 9, 8, 12],
  [-71, -198, 45, 18, 82],
  [68, -192, 57, 17, 110],
  [-212, 106, 17, 10, 18],
  [-120, 0, 5, 65, 26],
  [-70, -95, 22, 9, 20],
  [-165, 87, 29, 12, 26],
  [0, -209, 17, 10, 14],
  [-232, 0, 7, 57, 26],
  [-137, -324, 29, 57, 76],
  [94, -323, 31, 60, 84],
  [-20, -410, 86, 8, 72],
  [-88, -267, 33, 17, 40],
  [65, -254, 34, 22, 44],
] as const;

const VILLAGE_GROVE_EXCLUSION = getLandmarkBounds(SITE_LAYOUT.landmarks.village);
const CASTLE = SITE_LAYOUT.landmarks.castle;
// The castle stands at 45 degrees, so its corners reach the half-diagonal.
const CASTLE_CLEAR_RADIUS = (Math.SQRT2 / 2) * Math.max(...CASTLE.footprint) * CASTLE.scale + 2;
const outsideBounds = (
  x: number,
  z: number,
  margin: number,
  bounds: ReturnType<typeof getLandmarkBounds>
): boolean =>
  x < bounds.minX - margin ||
  x > bounds.maxX + margin ||
  z < bounds.minZ - margin ||
  z > bounds.maxZ + margin;

/** Signed distance from (x, z) to a footprint centred on `position`, `along` its local Z. */
function distanceToFootprint(
  x: number,
  z: number,
  position: readonly [number, number, number],
  rotation: number,
  halfAlong: number,
  halfAcross: number
): number {
  const dx = x - position[0];
  const dz = z - position[2];
  // Inverse of three's Y rotation, back into the footprint's own axes.
  const across = Math.abs(dx * Math.cos(rotation) - dz * Math.sin(rotation)) - halfAcross;
  const along = Math.abs(dx * Math.sin(rotation) + dz * Math.cos(rotation)) - halfAlong;
  return Math.hypot(Math.max(across, 0), Math.max(along, 0)) + Math.min(Math.max(across, along), 0);
}

/** Trunk clearance from open water and its walls: root flare plus a dry verge. */
const TRUNK_WATER_CLEARANCE = 2.5;

/**
 * Whether a tree at (x, z) stands clear of the canals, lake, ponds and huts.
 *
 * The woodland filter below knew the river and the painted terrain regions
 * but not these, so a grove seeded across the canal kept five trunks in its
 * water and one stood through the Nissen hut. A crown may overhang water, as
 * a real bank tree does; the TRUNK must stand on the verge. Nothing may grow
 * through a hut, so the whole crown clears it.
 * Working if the live tree audit finds no trunk in water and no crown in a hut.
 */
export function treeSiteClear(x: number, z: number, crownRadius: number): boolean {
  const { canal, canalBranch, lake, ponds, nissenHuts } = SITE_LAYOUT.exteriorFeatures;
  // Each canal wall is 0.5 m of masonry outside the water width.
  for (const { position, length, width, rotation } of [canal, canalBranch])
    if (
      distanceToFootprint(x, z, position, rotation, length / 2, width / 2 + 0.5) <
      TRUNK_WATER_CLEARANCE
    )
      return false;
  // The lake's organic bank reaches 1.2 m beyond its nominal half-size.
  const lakeX = lake.size[0] / 2 + 1.2 + TRUNK_WATER_CLEARANCE;
  const lakeZ = lake.size[1] / 2 + 1.2 + TRUNK_WATER_CLEARANCE;
  if (((x - lake.position[0]) / lakeX) ** 2 + ((z - lake.position[2]) / lakeZ) ** 2 < 1)
    return false;
  for (const { position, radius } of ponds)
    if (Math.hypot(x - position[0], z - position[2]) < radius + 0.5 + TRUNK_WATER_CLEARANCE)
      return false;
  // Nissen huts are 2.5 m-radius half-cylinders along their local Z.
  for (const { position, length, rotation } of nissenHuts)
    if (distanceToFootprint(x, z, position, rotation, length / 2, 2.5) < crownRadius) return false;
  return true;
}

/** Connected woodland opens into the village, castle, river banks and service approaches.
 * Working if the ground-map test keeps every trunk dry and outside the square,
 * and all of the additional crowns remain in the same five instance batches.
 */
export const VALLEY_WOODLAND_TREES: TreeInstanceData[] = VALLEY_GROVES.flatMap(
  ([x, z, radiusX, radiusZ, count], grove) =>
    Array.from({ length: count }, (_, index) => {
      const angle = index * 2.3999632297 + grove * 1.31;
      const radius = Math.sqrt((index + 0.5) / count);
      return {
        position: [
          Math.round((x + Math.cos(angle) * radiusX * radius) * 10) / 10,
          0,
          Math.round((z + Math.sin(angle) * radiusZ * radius) * 10) / 10,
        ] as [number, number, number],
        scale: 1.3 + ((index * 17 + grove * 7) % 19) * 0.035,
      };
    })
).filter(({ position, scale }) => {
  const [x, , z] = position;
  const crownRadius = 3.1 * scale * treeJitterFromPosition(position).jitter;
  // Test the terrain's own river and road fields. A grove seed may fall on a
  // bank or road verge; rejecting that seed keeps the trunk on undisturbed land.
  const dry =
    getDistanceToRiver(x, z, MILLOS_RIVER_CONFIG) >
    MILLOS_RIVER_CONFIG.width / 2 + MILLOS_RIVER_CONFIG.bankWidth + 3.5;
  return (
    dry &&
    treeSiteClear(x, z, crownRadius) &&
    Math.hypot(x, z) + crownRadius < SITE_LAYOUT.world.radius &&
    outsideBounds(x, z, crownRadius, VILLAGE_GROVE_EXCLUSION) &&
    Math.hypot(x - CASTLE.position[0], z - CASTLE.position[2]) >
      CASTLE_CLEAR_RADIUS + crownRadius &&
    MILLOS_TERRAIN_REGIONS.every(
      (region) =>
        region.channel === TerrainChannel.GRASS ||
        signedDistanceToShape(x, z, region.shape) > (region.edgeSoftness ?? 0) + 3
    )
  );
});

export const LANDSCAPE_GROVE_TREES: TreeInstanceData[] = [
  ...VALLEY_WOODLAND_TREES,
  // West belt behind the village, clear of its 70 m footprint at full crown.
  { position: [-235, 0, -48], scale: 1.65 },
  { position: [-242, 0, -37], scale: 1.35 },
  { position: [-234, 0, -28], scale: 1.8 },
  { position: [-241, 0, -17], scale: 1.2 },
  { position: [-235, 0, 26], scale: 1.55 },
  { position: [-243, 0, 38], scale: 1.8 },
  { position: [-233, 0, 48], scale: 1.3 },
  { position: [-236, 0, 60], scale: 1.6 },
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
  // Off the visitor car park, whose tarmac starts at x 107.5.
  { position: [101, 0, 34], scale: 1.2 },
  { position: [110, 0, -20], scale: 1.1 },
  { position: [110, 0, -60], scale: 1.3 },
  // Lines 6916-6920: Trees along waterways
  { position: [-160, 0, 70], scale: 1.1 },
  { position: [-160, 0, 30], scale: 0.9 },
  { position: [-160, 0, -10], scale: 1.2 },
  // East of the village cottage at (-165, -50), clear of the canal wall.
  { position: [-156, 0, -50], scale: 1.0 },
  { position: [-160, 0, -90], scale: 1.1 },
  // Trees by river, on the dry ground above its 25 m canyon bank. At z -170
  // three stood over the channel itself: 3.6 m down to the bed at x 40, with
  // the -2 m water surface up their trunks. The x 40 tree moved west of the
  // castle rock rather than into it.
  { position: [-80, 0, -170], scale: 1.3 },
  { position: [-44, 0, -187], scale: 1.0 },
  { position: [2, 0, -194], scale: 1.2 },
  { position: [74, 0, -189], scale: 0.9 },
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
  // Moved further from riverbank (was z=-110). At z=-90 it stood against the
  // trunk at (-85, -89); here it sits among the three trees, clear of each.
  { position: [-85, 0, -93.5], rotation: 0 },
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
