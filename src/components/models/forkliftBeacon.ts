/**
 * The forklift's rotating safety beacon, in vehicle metres (forks toward +z).
 *
 * The lamp is on the overhead guard's roof, behind the mast: a dark base, a
 * coloured lens with a domed top, and a reflector that turns round inside the
 * lens face, so the hot spot sweeps round the lamp the way a real beacon's
 * does. Its light reaches the world as a small camera-facing glow (and, on
 * high and ultra, a point light); `forkliftBeaconLabelHeight` puts the fleet
 * label above that glow.
 *
 * NO LIGHT CONE. The beacon used to throw an additive open cone, 1 m across,
 * spun about its own axis. A cone of revolution looks the same at every angle
 * of that spin, so on screen it was a static translucent 16-sided pyramid over
 * the truck, which the art review read as an editor gizmo (final3-med-12
 * forklift and interior). A sprite has no coverage edge to read as geometry.
 */

/** Fork height a loaded forklift travels at away from raised work surfaces. */
export const FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT = 0.32;

export type ForkliftBeaconTier = 'authored' | 'compact';

export const FORKLIFT_BEACON = {
  /** Lamp housing centre: the authored guard roof, and the compact model's at 2.13 m. */
  mountHeight: { authored: 1.86, compact: 2.205 },
  mountZ: -0.3,
  /** The lamp's whole envelope, centred on `mountHeight`. */
  housing: { radius: 0.1, height: 0.15 },
  /** Parts stacked inside the housing; `bottom` and `top` are about the lamp centre. */
  base: { radius: 0.1, bottom: -0.075, top: -0.047 },
  lens: { radius: 0.082, bottom: -0.047, top: 0.035 },
  dome: { radius: 0.082, bottom: 0.035, top: 0.075 },
  /**
   * The turning reflector's hot spot: a small bright plate on the lens face,
   * `radius` out from the axis (centre of its depth at `radius + depth / 2`).
   */
  reflector: { radius: 0.082, width: 0.05, height: 0.07, depth: 0.012, y: -0.006 },
  /** The light spill: a camera-facing glow centred on the lens. */
  glow: { diameter: 0.34 },
} as const;

/** Lowest and highest point of the beacon (lamp and glow) above the floor. */
export function forkliftBeaconSpan(tier: ForkliftBeaconTier): [number, number] {
  const lamp = FORKLIFT_BEACON.mountHeight[tier];
  const lensCentre = lamp + (FORKLIFT_BEACON.lens.bottom + FORKLIFT_BEACON.lens.top) / 2;
  return [
    lamp - FORKLIFT_BEACON.housing.height / 2,
    Math.max(
      lamp + FORKLIFT_BEACON.housing.height / 2,
      lensCentre + FORKLIFT_BEACON.glow.diameter / 2
    ),
  ];
}

/** Fleet identity label centre height: its 0.17 m text clears the glow. */
export function forkliftBeaconLabelHeight(tier: ForkliftBeaconTier): number {
  return forkliftBeaconSpan(tier)[1] + 0.14;
}
