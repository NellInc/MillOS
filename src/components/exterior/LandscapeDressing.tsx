import {
  VILLAGE_REALM_PATHS,
  VILLAGE_REALM_PATCHES,
  WORLD_REALM_PATHS,
  WORLD_REALM_PATCHES,
  FARM_REALM_PATHS,
  inRealmPath,
  inRealmPatch,
} from '../../constants/publicRealmLayout';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  SITE_LAYOUT,
  landmarkLocalToWorld,
  VILLAGE_GARDEN_FOOTPRINTS,
  VILLAGE_ALLOTMENT,
} from '../../constants/siteLayout';
import { useGraphicsStore } from '../../stores/graphicsStore';
import {
  getDistanceToRiver,
  MILLOS_RIVER_CONFIG,
  MILLOS_TERRAIN_REGIONS,
  sampleTerrainGroundHeight,
  signedDistanceToShape,
} from '../terrain/splatMapGenerator';
import { getTerrainGridSegments, TerrainChannel } from '../terrain/terrainTypes';
import {
  BROADLEAF_DEPTH,
  BROADLEAF_MATERIAL,
  InstancedGrassClutter,
  useVegetationDensity,
  type ClutterSpec,
} from '../scenery/InstancedFoliage';
import { HEDGE_CROWN_GEOMETRY, hedgeCrownTransforms } from './HedgeFoliage';
import { treeSeed } from '../scenery/treeForms';

type Point = readonly [number, number];
export interface LandscapeHedge {
  start: Point;
  end: Point;
  height: number;
  width: number;
}

// Cottage doors face the lanes. Each front boundary has a 4.8 m opening;
// rear and side hedges describe a garden without filling it with extra props.
export const COTTAGE_GARDENS = [
  [-25, -35],
  [25, -35],
  [25, -50],
  [-25, 45],
  [25, 55],
] as const;
const gardens: LandscapeHedge[] = [];
for (const [x, z] of COTTAGE_GARDENS) {
  const outer = x + Math.sign(x) * 8;
  const inner = x - Math.sign(x) * 8;
  const world = ([lx, lz]: Point): Point => {
    const [wx, , wz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [lx, 0, lz]);
    return [wx, wz];
  };
  for (const [start, end] of [
    [
      [outer, z - 7],
      [outer, z + 7],
    ],
    [
      [outer, z - 7],
      [inner, z - 7],
    ],
    [
      [outer, z + 7],
      [inner, z + 7],
    ],
    [
      [inner, z - 7],
      [inner, z - 2.4],
    ],
    [
      [inner, z + 2.4],
      [inner, z + 7],
    ],
  ] as const)
    gardens.push({ start: world(start), end: world(end), height: 0.85, width: 0.95 });
}
const rural = (start: Point, end: Point, height = 1.15, width = 1.5): LandscapeHedge => ({
  start,
  end,
  height,
  width,
});
export const LANDSCAPE_HEDGES: readonly LandscapeHedge[] = [
  ...gardens,
  // Crop field: the actual corn occupies x57..93, z148..176. Keep a broad
  // opening to the barn at the north, and a 9 m service gate to the south.
  rural([53, 144], [51, 161]),
  rural([51, 161], [53, 180]),
  rural([53, 180], [70.5, 181]),
  rural([79.5, 181], [98, 180]),
  rural([98, 180], [99, 163]),
  rural([99, 163], [97, 145]),
  // Village meadow boundaries bend and stop at walking gaps.
  rural([-234, -77], [-239, -35], 1.3, 1.8),
  rural([-239, -26], [-241, 14], 1.3, 1.8),
  rural([-241, 24], [-237, 66], 1.3, 1.8),
  rural([-232, 79], [-207, 81], 1.15, 1.6),
  rural([-198, 82], [-172, 80], 1.15, 1.6),
  // Low rear boundary gives the forecourt a plot, leaving its front and sides open.
  rural([-108, 154], [-95, 155], 0.85, 1.25),
  rural([-89, 155], [-69, 154], 0.85, 1.25),
  // Parkland edge beyond the lake and picnic ground, interrupted by a foot gap.
  rural([163, 96], [168, 119], 1.1, 1.5),
  rural([169, 129], [165, 154], 1.1, 1.5),
];

export function landscapeCrownTransforms(segments: number) {
  return LANDSCAPE_HEDGES.flatMap(({ start, end, width, height }, row) => {
    const dx = end[0] - start[0];
    const dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    return (
      hedgeCrownTransforms(width, height, length)
        // Full upper crowns plus occasional low shoots avoid a doubled solid
        // curtain. Broken lower foliage also gives the rural rows a softer foot.
        .filter((_, index) => index % 2 === 1 || index % 6 === 0)
        .map((crown, i) => {
          const x = (start[0] + end[0]) / 2 + Math.sin(angle) * crown.position[2];
          const z = (start[1] + end[1]) / 2 + Math.cos(angle) * crown.position[2];
          const h = crown.scale[1] * (0.91 + 0.09 * Math.sin(i * 0.83 + row) ** 2);
          return {
            position: [
              x,
              SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments) + h / 2,
              z,
            ] as const,
            scale: [crown.scale[0], h, crown.scale[2]] as const,
            angle: angle + (i % 2) * Math.PI,
            tint: crown.tint * (0.92 + 0.08 * Math.sin(row * 1.37) ** 2),
          };
        })
    );
  });
}

// Low, irregular scrub on the existing knolls, rather than more full-height
// trees. Each pocket leaves the roads, paths, canal and occupied pads alone.
export const MEADOW_POCKETS = [
  [-233, 102, 12, 13],
  [-215, 148, 23, 15],
  [-199, -96, 22, 9],
  [-102, 180, 24, 12],
  [199, 148, 27, 24],
  [191, 89, 17, 12],
] as const;

export function meadowSiteClear(x: number, z: number, radius: number) {
  return (
    Math.hypot(x, z) + radius < SITE_LAYOUT.world.radius &&
    getDistanceToRiver(x, z, MILLOS_RIVER_CONFIG) >
      MILLOS_RIVER_CONFIG.width / 2 + MILLOS_RIVER_CONFIG.bankWidth + radius &&
    MILLOS_TERRAIN_REGIONS.every(
      (region) =>
        region.channel === TerrainChannel.GRASS ||
        signedDistanceToShape(x, z, region.shape) > (region.edgeSoftness ?? 0) + radius + 1
    )
  );
}

export function meadowTransforms(segments: number, rocks = false) {
  return MEADOW_POCKETS.flatMap(([cx, cz, rx, rz], pocket) => {
    const count = rocks ? 12 : 48;
    return Array.from({ length: count }, (_, i) => {
      const seed = [cx + i * 0.73, 0, cz + pocket] as const;
      const a = treeSeed(seed, 21) * Math.PI * 2;
      const radius = Math.sqrt(treeSeed(seed, 22));
      const x = cx + Math.cos(a) * radius * rx;
      const z = cz + Math.sin(a) * radius * rz;
      const width = rocks ? 0.6 + treeSeed(seed, 23) * 1.5 : 1.5 + treeSeed(seed, 23) * 2.7;
      const height = rocks ? 0.22 + treeSeed(seed, 24) * 0.45 : 0.55 + treeSeed(seed, 24) * 0.9;
      const depth = width * (0.65 + treeSeed(seed, 25) * 0.35);
      const ground = SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments);
      // Sink the crown foot by the local slope drop, so the downhill leaves do
      // not hover. Sample the enclosing circle, independent of crown rotation.
      const footRadius = Math.hypot(width, depth) / 2;
      const seated = rocks
        ? ground
        : Math.min(
            ground,
            ...Array.from({ length: 8 }, (_, j) => {
              const angle = (j * Math.PI) / 4;
              return (
                SITE_LAYOUT.datum.terrain +
                sampleTerrainGroundHeight(
                  x + Math.cos(angle) * footRadius,
                  z + Math.sin(angle) * footRadius,
                  segments
                )
              );
            })
          );
      return {
        position: [x, seated + (rocks ? -height * 0.16 : height / 2), z] as const,
        scale: [width, height, depth] as const,
        angle: treeSeed(seed, 26) * Math.PI * 2,
        tint: 0.76 + treeSeed(seed, 27) * 0.24,
      };
    }).filter((item) =>
      meadowSiteClear(item.position[0], item.position[2], Math.max(item.scale[0], item.scale[2]))
    );
  });
}

/** Rough margins follow existing boundaries, with open meadows left quiet.
 * Reuse the tuft atlas and wind program; one draw, zero shadow casters.
 * Working if both terrain grids seat the blades and hardstands stay clear.
 */
export function landscapeGrassSpec(segments: number, density: number): ClutterSpec {
  const attractors: Point[] = LANDSCAPE_HEDGES.flatMap(({ start, end }) => {
    const steps = Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / 3);
    return Array.from(
      { length: steps },
      (_, i) =>
        [
          start[0] + ((end[0] - start[0]) * (i + 0.5)) / steps,
          start[1] + ((end[1] - start[1]) * (i + 0.5)) / steps,
        ] as const
    );
  });
  for (const [x, z, rx, rz] of MEADOW_POCKETS)
    for (let i = 0; i < 14; i++) {
      const a = i * 2.399963;
      const r = Math.sqrt((i + 1) / 14);
      attractors.push([x + Math.cos(a) * rx * r, z + Math.sin(a) * rz * r]);
    }
  const village = SITE_LAYOUT.landmarks.village;
  const cosine = Math.cos(village.rotation[1]),
    sine = Math.sin(village.rotation[1]);
  const outsideTendedPlots = (x: number, z: number) => {
    const dx = x - village.position[0],
      dz = z - village.position[2];
    const lx = (dx * cosine - dz * sine) / village.scale;
    const lz = (dx * sine + dz * cosine) / village.scale;
    if (
      VILLAGE_REALM_PATHS.some((p) => inRealmPath(lx, lz, p, 0.45)) ||
      VILLAGE_REALM_PATCHES.some((p) => inRealmPatch(lx, lz, p, 0.45)) ||
      WORLD_REALM_PATHS.some((p) => inRealmPath(x, z, p, 0.65)) ||
      WORLD_REALM_PATCHES.some((p) => inRealmPatch(x, z, p, 0.45))
    )
      return false;
    const farm = SITE_LAYOUT.landmarks.farm;
    if (
      FARM_REALM_PATHS.some((p) => inRealmPath(farm.position[0] - x, farm.position[2] - z, p, 0.5))
    )
      return false;
    return [...VILLAGE_GARDEN_FOOTPRINTS, VILLAGE_ALLOTMENT].every(
      (plot) =>
        Math.abs(lx - plot.x) > plot.halfX + 0.35 || Math.abs(lz - plot.z) > plot.halfZ + 0.35
    );
  };
  return {
    count: 3000,
    density,
    bounds: { minX: -247, maxX: 230, minZ: -115, maxZ: 192 },
    attractors,
    // Only attractor clusters, no uniform confetti across the mown centre.
    openExclude: [{ x: 0, z: 0, halfX: 500, halfZ: 500 }],
    accepts: (x, z) =>
      meadowSiteClear(x, z, 0.6) &&
      outsideTendedPlots(x, z) &&
      COTTAGE_GARDENS.every(([cx, cz]) => {
        const [gx, , gz] = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, [
          cx - Math.sign(cx) * 8,
          0,
          cz,
        ]);
        return Math.abs(x - gx) > 3 || Math.abs(z - gz) > 2.2;
      }),
    groundHeight: (x, z) =>
      SITE_LAYOUT.datum.terrain + sampleTerrainGroundHeight(x, z, segments) - 0.025,
    cullDistance: 95,
  };
}

export const MEADOW_STONE_GEOMETRY = new THREE.DodecahedronGeometry(0.6, 0);
const MEADOW_STONE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#92917c', roughness: 0.98 });

/** All garden and field leaves share one instanced draw and the existing atlas.
 * Working if their roots follow both terrain tiers and every gate stays open.
 */
export function LandscapeDressing() {
  const quality = useGraphicsStore((state) => state.graphics.quality);
  const density = useVegetationDensity();
  const grass = useMemo(
    () => landscapeGrassSpec(getTerrainGridSegments(quality), density),
    [quality, density]
  );
  const crowns = useMemo(
    () => [
      ...landscapeCrownTransforms(getTerrainGridSegments(quality)),
      ...meadowTransforms(getTerrainGridSegments(quality)),
    ],
    [quality]
  );
  const stones = useMemo(() => meadowTransforms(getTerrainGridSegments(quality), true), [quality]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const stoneRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const color = new THREE.Color();
    for (const [target, instances] of [
      [mesh, crowns],
      [stoneRef.current, stones],
    ] as const) {
      if (!target) continue;
      instances.forEach((crown, i) => {
        target.setMatrixAt(
          i,
          matrix.compose(
            p.fromArray(crown.position),
            q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, crown.angle),
            s.fromArray(crown.scale)
          )
        );
        target.setColorAt(i, color.setRGB(crown.tint, crown.tint, crown.tint));
      });
      target.instanceMatrix.needsUpdate = true;
      if (target.instanceColor) target.instanceColor.needsUpdate = true;
      target.computeBoundingSphere();
    }
  }, [crowns, stones]);
  return (
    <>
      <InstancedGrassClutter spec={grass} />
      <instancedMesh
        name="landscape-garden-field-hedges"
        ref={ref}
        args={[HEDGE_CROWN_GEOMETRY, BROADLEAF_MATERIAL, crowns.length]}
        customDepthMaterial={BROADLEAF_DEPTH}
        castShadow
        receiveShadow
      />
      <instancedMesh
        name="landscape-meadow-stone-outcrops"
        ref={stoneRef}
        args={[MEADOW_STONE_GEOMETRY, MEADOW_STONE_MATERIAL, stones.length]}
        receiveShadow
      />
    </>
  );
}
