import { SITE_LAYOUT, landmarkLocalToWorld, type Vec3Tuple } from './siteLayout';

/** Ground-origin people face +Z. Seat heights describe the physical seat TOP.
 * Working if scenery and residents share these anchors, without hidden offsets.
 */
export interface CommunityAnchor {
  readonly position: Vec3Tuple;
  readonly rotation: number;
  readonly seatHeight?: number;
}

function anchor(position: Vec3Tuple, rotation = 0, seatHeight?: number): CommunityAnchor {
  return Object.freeze({
    position: Object.freeze([...position]) as Vec3Tuple,
    rotation,
    seatHeight,
  });
}
function village(local: Vec3Tuple, rotation = 0, seatHeight?: number): CommunityAnchor {
  return anchor(
    landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, local),
    SITE_LAYOUT.landmarks.village.rotation[1] + rotation,
    seatHeight
  );
}

export const COMMUNITY_ANCHORS = Object.freeze({
  // Ground-level workposts face the packing equipment from its apron. The
  // raised pad ends at z -7.5; keep the same 0.55m boot/turn clearance used by
  // the milling posts instead of placing Y0 feet inside the 0.16m slab.
  // Working if both original and fitted shoes clear the pad in work and gait.
  millInspection: anchor([8, 0, -6.95], Math.PI),
  millPacking: anchor([-8, 0, -6.95], Math.PI),
  millReceiving: anchor([-33, 0, 8], Math.PI / 2),
  millRestNorth: anchor([-34, 0, -12], Math.PI / 2, 0.46),
  millRestSouth: anchor([-34, 0, -8], Math.PI / 2, 0.46),
  bakeryCounter: village([15.8, 0, 6.8], -Math.PI / 2),
  bakeryCustomer: village([14.9, 0, 6.8], Math.PI / 2),
  /** On the step outside the bakery's real door, facing out. shop.glb puts the
   * door 1.71 m left of centre (threshold front at model z 2.65); this is model
   * [-1.71, 0, 2.98] through ShopBuilding's placement, yaw and scale. */
  bakeryDoor: village([17.21, 0, 3.22], -Math.PI / 2),
  shopDelivery: village([-15.3, 0, 31.6], Math.PI / 2),
  shopCustomer: village([-14.4, 0, 30], -Math.PI / 2),
  allotmentGardener: village([-25.35, 0, 10], 0),
  allotmentGate: village([-17.9, 0, 9], -Math.PI / 2),
  pubSeatNorth: village([-18.1, 0, -16.9], Math.PI / 2, 0.46),
  pubSeatSouth: village([-18.1, 0, -13.1], Math.PI / 2, 0.46),
  pubDoor: village([-19.5, 0, -15], -Math.PI / 2),
  /** The general store's real door, the same shop.glb point as the bakery's
   * (not a mirror of it: the door is off-centre, so a mirror lands on the
   * window). communityLayout.test.ts derives both from the model. */
  shopDoor: village([-17.09, 0, 31.54], Math.PI / 2),
  /** Opening-hours boards, each standing out in line with its shop door. The
   * store's sits 1.1 m out, between the door and the delivery crate. */
  bakeryBoard: village([15.1, 0, 3.2], -Math.PI / 2),
  shopBoard: village([-16, 0, 31.5], Math.PI / 2),
  /** In front of the allotment tool shed's door (shed-local [-3.3, -2.5]). */
  allotmentShedDoor: village([-27.5, 0, 12.3], Math.PI / 2),
  busSeat: anchor([29.55, 0, 140], -Math.PI / 2, 0.522),
  busWaiting: anchor([28.4, 0.1, 140], -Math.PI / 2),
});

/** Clear routes within each local pedestrian precinct, never cross-site shortcuts. */
export const COMMUNITY_PATHS = Object.freeze({
  millWest: Object.freeze(
    (
      [
        [-31.5, 0, -12],
        [-31.5, 0, -8],
        [-31.5, 0, 25],
      ] satisfies Vec3Tuple[]
    ).map((p) => Object.freeze(p) as Vec3Tuple)
  ),
  bakery: Object.freeze(
    (
      [
        [13, 0, 5],
        [14.9, 0, 5],
        [14.9, 0, 6.8],
      ] satisfies Vec3Tuple[]
    ).map((p) => Object.freeze(landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, p)))
  ),
  allotment: Object.freeze(
    (
      [
        [-14.5, 0, 9],
        [-17.9, 0, 9],
        [-25.35, 0, 9],
      ] satisfies Vec3Tuple[]
    ).map((p) => Object.freeze(landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, p)))
  ),
  pub: Object.freeze(
    (
      [
        [-13, 0, -15],
        [-17, 0, -15],
        [-17, 0, -16.9],
      ] satisfies Vec3Tuple[]
    ).map((p) => Object.freeze(landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, p)))
  ),
});

/** One schedule for actual activity and reopening captions, in simulated hours. */
export const COMMUNITY_OPENING_HOURS = {
  shops: { open: 7, close: 18 },
  pub: { open: 11, close: 23 },
} as const;
/** Village routines without a public sign; the same hours drive the people. */
export const COMMUNITY_ACTIVITY_HOURS = {
  gardening: { open: 8, close: 17 },
  delivery: { open: 9, close: 11 },
  cycling: { open: 11, close: 18 },
} as const;

/** A closed board tells visitors when to return, without promising stock.
 * Working if its hour comes from the same schedule that opens the real place.
 */
export function getCommunityReopeningDetail(
  place: keyof typeof COMMUNITY_OPENING_HOURS,
  open: boolean
): string | undefined {
  return open
    ? undefined
    : `Opens ${String(COMMUNITY_OPENING_HOURS[place].open).padStart(2, '0')}:00`;
}

/** Opening hours use the simulation's hour-of-day, with finite wrapped inputs.
 * Working if the signs, pedestrians and delivery window flip at identical hours.
 */
export function getCommunityHours(hour: number) {
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 0;
  return {
    shopsOpen: h >= COMMUNITY_OPENING_HOURS.shops.open && h < COMMUNITY_OPENING_HOURS.shops.close,
    pubOpen: h >= COMMUNITY_OPENING_HOURS.pub.open && h < COMMUNITY_OPENING_HOURS.pub.close,
    deliveryActive:
      h >= COMMUNITY_ACTIVITY_HOURS.delivery.open && h < COMMUNITY_ACTIVITY_HOURS.delivery.close,
    gardeningActive:
      h >= COMMUNITY_ACTIVITY_HOURS.gardening.open && h < COMMUNITY_ACTIVITY_HOURS.gardening.close,
  };
}

/** Read-only explanation of the bakery's existing flour-delivery signal.
 * Working if opening the shop alone never claims bread or a fulfilled delivery.
 */
export function getBakeryBoardDetail(open: boolean, stocked: boolean): string | undefined {
  return open
    ? stocked
      ? 'Fresh bread'
      : 'Needs mill flour'
    : getCommunityReopeningDetail('shops', open);
}
