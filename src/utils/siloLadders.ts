/**
 * The silo ladders a first-person body can climb, shared by the desktop and
 * phone controllers. Each runs up the north face of its silo to the roof,
 * where the climb has a purpose: the silo's level and the grain in it are
 * read there (the silo card, components/worldCard).
 */
import { SITE_LAYOUT, getSiloAssemblyScale } from '../constants/siteLayout';

export interface SiloLadder {
  readonly siloId: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Eye height at the top of the climb, m. */
  readonly height: number;
}

const SCALE = getSiloAssemblyScale(SITE_LAYOUT.machineDimensions.silo);

export const SILO_LADDERS: readonly SiloLadder[] = SITE_LAYOUT.machines.silos.map(
  ({ id, position: [x, y, z] }) => ({
    siloId: id,
    minX: x - 0.6 * SCALE[0],
    maxX: x + 0.6 * SCALE[0],
    minZ: z + 2.29 * SCALE[2] - 0.7,
    maxZ: z + 2.29 * SCALE[2] + 0.7,
    height: y + SITE_LAYOUT.machineDimensions.silo[1],
  })
);

/** The ladder a body standing at (x, z) is on, if any. */
export function siloLadderAt(x: number, z: number): SiloLadder | null {
  for (const ladder of SILO_LADDERS)
    if (x >= ladder.minX && x <= ladder.maxX && z >= ladder.minZ && z <= ladder.maxZ) return ladder;
  return null;
}

/** How close to the top counts as at the top, m. */
export const LADDER_TOP_TOLERANCE = 0.05;
