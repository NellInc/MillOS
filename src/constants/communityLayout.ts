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
  millInspection: anchor([8, 0, -8.8], Math.PI),
  millPacking: anchor([-8, 0, -8.8], Math.PI),
  millReceiving: anchor([-33, 0, 8], Math.PI / 2),
  millRestNorth: anchor([-34, 0, -12], Math.PI / 2, 0.46),
  millRestSouth: anchor([-34, 0, -8], Math.PI / 2, 0.46),
  bakeryCounter: village([15.8, 0, 6.8], -Math.PI / 2),
  bakeryCustomer: village([14.9, 0, 6.8], Math.PI / 2),
  bakeryDoor: village([15.6, 0, 5], Math.PI / 2),
  shopDelivery: village([-15.3, 0, 31.6], Math.PI / 2),
  shopCustomer: village([-14.4, 0, 30], -Math.PI / 2),
  allotmentGardener: village([-25.35, 0, 10], 0),
  allotmentGate: village([-17.9, 0, 9], -Math.PI / 2),
  pubSeatNorth: village([-18.1, 0, -16.9], Math.PI / 2, 0.46),
  pubSeatSouth: village([-18.1, 0, -13.1], Math.PI / 2, 0.46),
  pubDoor: village([-19.5, 0, -15], -Math.PI / 2),
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

/** Opening hours use the simulation's hour-of-day, with finite wrapped inputs.
 * Working if the signs, pedestrians and delivery window flip at identical hours.
 */
export function getCommunityHours(hour: number) {
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 0;
  return {
    shopsOpen: h >= 7 && h < 18,
    pubOpen: h >= 11 && h < 23,
    deliveryActive: h >= 9 && h < 11,
    gardeningActive: h >= 8 && h < 17,
  };
}
