/**
 * The forklift's rotating safety beacon, in vehicle metres (forks toward +z).
 *
 * The lamp is on the overhead guard's roof, behind the mast. Its light wedge is
 * an additive cone around the lamp; `forkliftBeaconLabelHeight` puts the fleet
 * label above the wedge's apex.
 */

/** Fork height a loaded forklift travels at away from raised work surfaces. */
export const FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT = 0.32;

export type ForkliftBeaconTier = 'authored' | 'compact';

export const FORKLIFT_BEACON = {
  /** Lamp housing centre: the authored guard roof, and the compact model's at 2.13 m. */
  mountHeight: { authored: 1.86, compact: 2.205 },
  mountZ: -0.3,
  housing: { radius: 0.1, height: 0.15 },
  /**
   * Wedge cone: base radius, height, and its base's offset from the lamp centre.
   *
   * The base sits at the lamp, not below it. It used to hang 0.43 m under the
   * lamp and widen downward to a 0.55 m ring at 1.43 m, while a load carried at
   * travel height tops out at 1.80 m: from ahead, the cone came out of the top
   * bag layer (final-med-12 forklift). From the lamp up it clears the load on
   * both tiers.
   */
  wedge: { radius: 0.5, height: 0.42, baseOffset: 0 },
} as const;

/** Lowest and highest point of the light wedge above the floor. */
export function forkliftBeaconWedgeSpan(tier: ForkliftBeaconTier): [number, number] {
  const bottom = FORKLIFT_BEACON.mountHeight[tier] + FORKLIFT_BEACON.wedge.baseOffset;
  return [bottom, bottom + FORKLIFT_BEACON.wedge.height];
}

/** Fleet identity label centre height: its 0.17 m text clears the wedge's apex. */
export function forkliftBeaconLabelHeight(tier: ForkliftBeaconTier): number {
  return forkliftBeaconWedgeSpan(tier)[1] + 0.14;
}
