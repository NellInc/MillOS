import { SITE_LAYOUT } from '../constants/siteLayout';

const HALL = SITE_LAYOUT.factory.bounds;

/** A roofed footprint: no rain below `maxY` inside it. */
export interface RainShelter {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly maxY: number;
}

/**
 * `dock-canopy-structure.glb`, as `LoadingDockCanopy` mounts it: the body is
 * 20.5 x 6.2 x 5.2 m (node scale 20.5 over a unit-wide mesh) and its group is
 * offset 0.1 m along the canopy's own +z.
 */
export const LOADING_DOCK_CANOPY_GLB_EXTENT = {
  halfWidth: 10.25,
  halfDepth: 2.6,
  offsetZ: 0.1,
  roofY: 6.2,
} as const;

/**
 * Every roof the rain must not fall through: the hall, the two yard canopies
 * over the dock approaches (`FactoryExterior` LOADING_DOCK_CANOPIES, at
 * z = +/-58) and the two dock-face canopies (`OptimizedTruckBay`
 * DOCK_CANOPY_ROOF, 12.2 x 9.8 m from each dock at z = +/-50, underside 7.46).
 * Literal here so this module imports no scene code; the test holds both
 * against their authored sources.
 */
export const RAIN_SHELTERS: readonly RainShelter[] = [
  { minX: HALL.minX, maxX: HALL.maxX, minZ: HALL.minZ, maxZ: HALL.maxZ, maxY: HALL.maxY },
  { minX: -10.25, maxX: 10.25, minZ: 55.5, maxZ: 60.7, maxY: 6.2 },
  { minX: -10.25, maxX: 10.25, minZ: -60.7, maxZ: -55.5, maxY: 6.2 },
  { minX: -6.1, maxX: 6.1, minZ: 50.2, maxZ: 60, maxY: 7.84 },
  { minX: -6.1, maxX: 6.1, minZ: -60, maxZ: -50.2, maxY: 7.84 },
];

/** Drops are discarded under every shelter. Mirrors `rainSheltered` in the shader. */
export function rainReachesPoint(x: number, y: number, z: number): boolean {
  return !RAIN_SHELTERS.some(
    (box) => x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ && y < box.maxY
  );
}

const f = (value: number) => value.toFixed(3);

export const SHELTER_GLSL = RAIN_SHELTERS.map(
  (box) =>
    `  if ( p.x > ${f(box.minX)} && p.x < ${f(box.maxX)} && p.z > ${f(box.minZ)} && p.z < ${f(box.maxZ)} && p.y < ${f(box.maxY)} ) return true;`
).join('\n');
