/**
 * Boarding and leaving a forklift on foot, shared by the desktop and touch
 * first-person controllers. Each controller finds its own free ground for the
 * step-down point, against its own collision set.
 */
import { FORKLIFT_BOARDING_REACH_METRES } from '../simulation/vehicles/forkliftManualDrive';
import { forkliftBoardable } from '../stores/forkliftDriveStore';
import { sampleWalkingGroundHeight } from './castleNavigation';
import { FIRST_PERSON_EYE_HEIGHT } from './cameraNavigation';
import { positionRegistry } from './positionRegistry';

/** How far out from the forklift's centre, on the driver's side, the player steps down. */
const FORKLIFT_STEP_DOWN_METRES = 1.4;
/**
 * And this far back along it: a displaced operator, or one waiting at the crew
 * stand, stands 1.15 m out level with the centre (ForkliftSystem's handover
 * side, the site stands), so straight out would put the player 0.25 m from
 * them, inside their body. Working if the two stand about 0.9 m apart.
 */
const FORKLIFT_STEP_DOWN_REAR_METRES = 0.9;

/** The boardable forklift nearest the eye, within reach and at standing height, or null. */
export const forkliftInReach = (
  x: number,
  y: number,
  z: number,
  segments: number
): string | null => {
  const feet = y - FIRST_PERSON_EYE_HEIGHT - sampleWalkingGroundHeight(x, z, segments);
  if (feet > 0.6) return null;
  let best: string | null = null;
  let bestDistance = FORKLIFT_BOARDING_REACH_METRES;
  for (const vehicle of positionRegistry.getAllEntities()) {
    if (vehicle.kind === 'truck' || forkliftBoardable.get(vehicle.id) !== true) continue;
    const distance = Math.hypot(vehicle.x - x, vehicle.z - z);
    if (distance < bestDistance) {
      best = vehicle.id;
      bestDistance = distance;
    }
  }
  return best;
};

/**
 * Where to step down from forklift `id`: on the driver's (left) side, just
 * behind the operator's spot, before any search for free ground. Null when the
 * forklift is not registered.
 */
export const forkliftStepDownPoint = (id: string): [number, number] | null => {
  const vehicle = positionRegistry.get(id);
  if (!vehicle) return null;
  // Heading is atan2(dirX, dirZ), so the driver's left is (dirZ, -dirX).
  const dirX = vehicle.dirX ?? 0;
  const dirZ = vehicle.dirZ ?? 1;
  return [
    vehicle.x + dirZ * FORKLIFT_STEP_DOWN_METRES - dirX * FORKLIFT_STEP_DOWN_REAR_METRES,
    vehicle.z - dirX * FORKLIFT_STEP_DOWN_METRES - dirZ * FORKLIFT_STEP_DOWN_REAR_METRES,
  ];
};
