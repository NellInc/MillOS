/**
 * Where a vent puff is born and how it sets off.
 *
 * Pure, so the clearance of the roller-mill plume from the casing it vents
 * through can be pinned by arithmetic (ventPlume.test.ts) rather than by eye.
 */

export type VentKind = 'steam' | 'dust' | 'exhaust';
export type Vec3 = [number, number, number];

/**
 * The roller mill's louvre stack, relative to the mill anchor: four slats
 * (`CompactMachines` millVent) 0.018 m thick centred on this X, on the west
 * face, at y 2.25 + 0.38 i and z -0.5, each 1.35 m wide.
 */
export const MILL_LOUVRE_FACE_X = -2.412;
export const MILL_LOUVRE_THICKNESS = 0.018;

/** The vent each roller mill breathes through, relative to its anchor. */
export const MILL_VENT_OFFSET: Readonly<Vec3> = [-2.85, 2.3, -0.5];

/**
 * The louvre plume, in vent-relative metres and metres per plant second. The
 * top two slats sit 0.71-1.09 m above the vent origin; the outward speed is
 * along -X, away from the west face.
 */
const LOUVRE_PLUME = { baseY: 0.7, spanY: 0.4, outward: 0.3, outwardJitter: 0.2 } as const;

export interface VentPuffSeed {
  position: Vec3;
  velocity: Vec3;
}

/**
 * Seed one puff, relative to its vent. `initial` is the mount-time seeding,
 * which spreads the first puffs over a taller band so the plume starts mature.
 */
export function seedVentPuff(
  kind: VentKind,
  initial: boolean,
  random: () => number = Math.random
): VentPuffSeed {
  if (kind !== 'dust') {
    // Roller-mill louvres (steam and exhaust). Born at the vent mouth across
    // the top two slats and blown OUT of the face before rising, so the puffs
    // overlap into one plume leaving the casing. Spawned anywhere in a 0.5 m
    // box with +-0.15 m/s of sideways drift, they formed a scattered cloud and
    // drifted to within 0.1 m of the face, where each sprite - drawn at its
    // centre's depth - was cut off along the casing plane.
    return {
      position: [
        (random() - 0.5) * 0.1,
        LOUVRE_PLUME.baseY + random() * LOUVRE_PLUME.spanY,
        (random() - 0.5) * 0.36,
      ],
      velocity: [
        -(LOUVRE_PLUME.outward + random() * LOUVRE_PLUME.outwardJitter),
        kind === 'steam' ? 0.8 + random() * 0.5 : 0.3 + random() * 0.3,
        (random() - 0.5) * 0.12,
      ],
    };
  }
  // Sifter and packer dust: a loose cloud over a lid or deck, unchanged.
  return {
    position: [(random() - 0.5) * 0.5, random() * (initial ? 0.5 : 0.3), (random() - 0.5) * 0.5],
    velocity: [(random() - 0.5) * 0.3, 0.3 + random() * 0.3, (random() - 0.5) * 0.3],
  };
}
