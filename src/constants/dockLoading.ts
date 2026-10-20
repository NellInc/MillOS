/**
 * DOCK LOADING HEIGHTS, shared by the dock render (TruckBay), the trailer
 * (OptimizedTruckBay), the forklift models and the logistics route.
 *
 * The hall floor and the yard are both at y 0: people, forklifts, machines and
 * trucks all stand on it. The trailer's cargo bed is 0.71 m up. So the dock is
 * a deck at bed height bridging the door to the trailer's tail, and a forklift
 * on the hall floor lifts the pallet onto it; it does not drive onto the deck.
 * The deck, platform sections and plate used to stand 2 m up, in the middle of
 * the docked trailer's doors (and 1.6 m inside its body), with the pallet set
 * down on the channel floor below.
 *
 * Dock geometry is in dock-local metres: `u` outward from the dock group (world
 * z 50 at shipping, z -50 under a half turn at receiving), x across the bay.
 * `dockLoading.test.ts` checks every tier's forklift against these numbers.
 */

/** Top of the trailer's chassis rails (OptimizedTruckBay), the cargo bed the dock serves. */
export const TRAILER_BED_Y = 0.71;

/**
 * The dock deck (leveler plate). Hall edge 2.5 cm outside the closed roll-up
 * door (u -1.8, 0.15 m deep); far edge on the bumper face (u 0.5), where the
 * docked trailer's rear sits; 2.4 m wide, clear of the bumper blocks at x
 * +/-1.75. Its 0.1 m depth leaves the underside at 0.61, above both tiers'
 * front tyres where they pass under the hall edge.
 */
export const DOCK_DECK = {
  topY: TRAILER_BED_Y,
  thickness: 0.1,
  width: 2.4,
  nearU: -1.7,
  farU: 0.5,
} as const;

/**
 * Where the carried pallet's underside stands above the fork datum: the
 * authored model's pallet origin (0.34) less the pallet's 0.06 m underside.
 * The compact model's stands 2.5 cm lower.
 */
export const FORKLIFT_PALLET_REST_ABOVE_FORK = 0.28;

/** Fork height at which a pallet rests on the dock deck. */
export const DOCK_DECK_FORK_HEIGHT = DOCK_DECK.topY - FORKLIFT_PALLET_REST_ABOVE_FORK;

/** How far a loaded fork clears a raised work surface while it moves over it. */
export const FORKLIFT_PALLET_CLEARANCE = 0.05;
