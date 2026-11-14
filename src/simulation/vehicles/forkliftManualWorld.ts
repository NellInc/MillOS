/**
 * What a driven forklift collides with: the same machine, belt and dock boxes
 * the walking player does, the hall's walls, the world edge, water, the castle
 * and shelter solids, any ground step a forklift could not climb, and the
 * other vehicles.
 *
 * The hall walls are the walker's (`hallWallBlocks`, walkingObstacles.ts),
 * tested against each footprint circle's own radius, with every door open.
 * The only openings a forklift's 1.2 m body fits are the two 4 m service
 * portals: each dock portal is filled by its platforms and bay, and a
 * personnel door is 1.0 m clear (report 04 P6, plan 6.6).
 */
import {
  createConveyorObstacles,
  createMachineObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../../constants/factoryObstacles';
import { getServiceAssetBounds, SITE_LAYOUT, WORLD_RADIUS } from '../../constants/siteLayout';
import { hallDressingSolids } from '../../components/infrastructure/hallDressingLayout';
import {
  isDryWalkingGround,
  sampleWalkingGroundHeight,
  walkingBlocks,
} from '../../utils/castleNavigation';
import { positionRegistry } from '../../utils/positionRegistry';
import { hallWallBlocks } from '../../utils/walkingObstacles';
import {
  truckPhaseDirection,
  truckSweepAheadMeets,
  truckStoppingDistance,
  type TruckControllerState,
} from '../../components/truckbay/truckController';
import type { ForkliftRoutePlan } from './forkliftController';
import { sampleArcLengthPath } from './vehicleKinematics';
import type { LaneDetour, ManualFootprintBlocked } from './forkliftManualDrive';

const BOXES = [
  ...createMachineObstacles(0),
  ...createConveyorObstacles(),
  ...DOCK_PLATFORM_OBSTACLES,
  // The yard's tanks and kit, and the hall's floor dressing (sack bays, racks,
  // carts, reels): solid to a forklift, as the layout planner treats them.
  ...Object.values(SITE_LAYOUT.serviceYard).map((asset) => getServiceAssetBounds(asset)),
  ...hallDressingSolids().filter((solid) => solid.onFloor),
];

/** Largest ground rise or fall between the vehicle origin and a footprint circle. */
const FORKLIFT_GROUND_STEP_METRES = 0.18;
const FORKLIFT_RADIUS = 0.75;
/**
 * A truck registers two points: the tractor's origin, and the trailer's centre
 * 5.75 m behind it on the trailer's own heading (TruckBay). Each is a capsule
 * along its heading: the tractor reaches 5.1 m ahead of its origin (its front
 * plate, TRACTOR_FRONT_OVERHANG 5.05) and 0.6 m behind it (the drive axle is
 * at 0.4), the trailer 5.9 m either way (its tail is 11.76 m behind the tractor).
 */
const TRUCK_HALF_WIDTH = 1.3;
const TRUCK_BODY = {
  tractor: { ahead: 5.1, behind: 0.6 },
  trailer: { ahead: 5.9, behind: 5.9 },
} as const;

const circleMeetsCapsule = (
  x: number,
  z: number,
  radius: number,
  vehicle: {
    readonly x: number;
    readonly z: number;
    readonly dirX?: number;
    readonly dirZ?: number;
  },
  ahead: number,
  behind: number
) => {
  const dirX = vehicle.dirX ?? 0;
  const dirZ = vehicle.dirZ ?? 1;
  const along = Math.max(-behind, Math.min(ahead, (x - vehicle.x) * dirX + (z - vehicle.z) * dirZ));
  return (
    Math.hypot(x - (vehicle.x + dirX * along), z - (vehicle.z + dirZ * along)) <
    radius + TRUCK_HALF_WIDTH
  );
};

const circleMeetsBox = (
  x: number,
  z: number,
  radius: number,
  box: { minX: number; maxX: number; minZ: number; maxZ: number }
) =>
  Math.hypot(
    x - Math.max(box.minX, Math.min(x, box.maxX)),
    z - Math.max(box.minZ, Math.min(z, box.maxZ))
  ) < radius;

/** Static world only: no vehicles. Used by tests on the authored lanes. */
export function manualStaticBlocked(
  x: number,
  z: number,
  radius: number,
  originGround: number,
  segments: number
): boolean {
  if (Math.hypot(x, z) > WORLD_RADIUS - radius) return true;
  for (const box of BOXES) if (circleMeetsBox(x, z, radius, box)) return true;
  if (hallWallBlocks(x, z, radius)) return true;
  if (!isDryWalkingGround(x, z, segments)) return true;
  const ground = sampleWalkingGroundHeight(x, z, segments);
  if (Math.abs(ground - originGround) > FORKLIFT_GROUND_STEP_METRES) return true;
  return walkingBlocks(x, z, ground, radius, 2.2);
}

/** The frame's ground under the vehicle origin and terrain resolution, updated in place. */
export interface ManualWorldFrame {
  originGround: number;
  segments: number;
}

/**
 * The footprint test for one driven forklift, made once and fed a mutable
 * frame. Other forklifts are discs; trucks are capsules along their heading.
 */
export function createManualWorldBlocked(
  selfId: string,
  frame: ManualWorldFrame
): ManualFootprintBlocked {
  return (x, z, radius) => {
    if (manualStaticBlocked(x, z, radius, frame.originGround, frame.segments)) return true;
    for (const other of positionRegistry.getAllEntities()) {
      if (other.id === selfId) continue;
      if (other.kind === 'truck') {
        const body = other.id.endsWith('-trailer') ? TRUCK_BODY.trailer : TRUCK_BODY.tractor;
        if (circleMeetsCapsule(x, z, radius, other, body.ahead, body.behind)) return true;
      } else if (Math.hypot(other.x - x, other.z - z) < radius + FORKLIFT_RADIUS) return true;
    }
    return false;
  };
}

/** Clearance a moving truck keeps from a forklift, beyond its stopping distance. */
const TRUCK_PATH_CLEARANCE_METRES = 3;
/** A forklift's reach from its registered point, metres (body, forks and a pallet). */
const FORKLIFT_PATH_RADIUS = 1.5;

/**
 * Whether a forklift under manual control (driven, or returning to its lane)
 * stands in a truck's way: where the truck's body will be over its stopping
 * distance plus a margin of its own route ahead (truckSweepAheadMeets). Trucks
 * follow scripted yard paths and drove straight through a forklift a player
 * had left on the apron; autopilot forklifts keep to their lanes and the dock
 * interlock, so only manual ones are checked.
 * Working if no truck stepped with this as its hold touches a standing manual
 * forklift anywhere on its route, and none is held by one it would not touch
 * (forkliftManualDrive.test.ts).
 */
export function manualForkliftInTruckPath(truck: TruckControllerState): boolean {
  if (!truck.active || truckPhaseDirection(truck.phase) === 0) return false;
  let reach = -1;
  for (const other of positionRegistry.getAllEntities()) {
    if (!other.manual || other.kind === 'truck') continue;
    // Worked out once, and only when there is a manual forklift at all.
    if (reach < 0) reach = TRUCK_PATH_CLEARANCE_METRES + truckStoppingDistance(truck);
    if (truckSweepAheadMeets(truck, reach, other.x, other.z, FORKLIFT_PATH_RADIUS)) return true;
  }
  return false;
}

/**
 * Each dock's platform sections and bay, as one block: solid from the hall
 * side's line (uIn) to the apron's (uOut), half-width halfWidth either side of
 * x 0, on the side of the site `sign` names (shipping +z, receiving -z).
 */
const DOCK_BLOCKS = [1, -1].map((sign) => {
  const boxes = DOCK_PLATFORM_OBSTACLES.filter((box) => Math.sign(box.minZ + box.maxZ) === sign);
  const near = Math.min(...boxes.map((box) => Math.min(box.minZ * sign, box.maxZ * sign)));
  const far = Math.max(...boxes.map((box) => Math.max(box.minZ * sign, box.maxZ * sign)));
  const halfWidth = Math.max(
    ...boxes.map((box) => Math.max(Math.abs(box.minX), Math.abs(box.maxX)))
  );
  return { sign, uIn: near, uOut: far, halfWidth };
});
const SIDES = [-1, 1] as const;
/** How far outside a dock block the detour runs: the forklift's half-length and a margin. */
const DETOUR_MARGIN_METRES = 2.4;
/** Past this far beyond the block's end, its body is clear of it to turn for the hall. */
const DETOUR_END_CLEAR_METRES = 1.3;
/** A straight line nearer a block than this would scrape it: the body's half-width and a margin. */
const DETOUR_BODY_CLEARANCE_METRES = 1;
/** Favour for the side it is already heading toward, metres, so the choice does not flip. */
const DETOUR_SIDE_HYSTERESIS_METRES = 4;
/** Clearance kept from a truck's body along a detour leg. */
const DETOUR_TRUCK_CLEARANCE_METRES = 1.2;

/** The hall-side corner beside each end, below the block's hall face. */
const cornerZ = (block: (typeof DOCK_BLOCKS)[number]) =>
  (block.uIn - DETOUR_MARGIN_METRES) * block.sign;

/**
 * Per route, per block and side (-1, +1): the lane point nearest that side's
 * hall corner (x, z) and its distance, flattened in threes.
 */
const cornerLaneByPlan = new WeakMap<ForkliftRoutePlan, Float64Array>();
const cornerLane = (plan: ForkliftRoutePlan): Float64Array => {
  let table = cornerLaneByPlan.get(plan);
  if (!table) {
    table = new Float64Array(DOCK_BLOCKS.length * 2 * 3);
    DOCK_BLOCKS.forEach((block, index) => {
      for (const side of SIDES) {
        const cx = side * (block.halfWidth + DETOUR_MARGIN_METRES);
        const cz = cornerZ(block);
        const at = (index * 2 + (side > 0 ? 1 : 0)) * 3;
        table![at + 2] = Infinity;
        for (let d = 0; d < plan.path.totalLength; d += 0.5) {
          const sample = sampleArcLengthPath(plan.path, d);
          const distance = Math.hypot(sample.x - cx, sample.z - cz);
          if (distance < table![at + 2]) {
            table![at] = sample.x;
            table![at + 1] = sample.z;
            table![at + 2] = distance;
          }
        }
      }
    });
    cornerLaneByPlan.set(plan, table);
  }
  return table;
};

/** Whether a straight line from (ax, az) to (bx, bz) keeps clear of a block, with body clearance. */
const lineClearsBlock = (
  ax: number,
  az: number,
  bx: number,
  bz: number,
  block: (typeof DOCK_BLOCKS)[number]
): boolean => {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const u = (az + (bz - az) * t) * block.sign;
    if (
      Math.abs(x) < block.halfWidth + DETOUR_BODY_CLEARANCE_METRES &&
      u > block.uIn - DETOUR_BODY_CLEARANCE_METRES &&
      u < block.uOut + DETOUR_BODY_CLEARANCE_METRES
    )
      return false;
  }
  return true;
};

/** Whether a straight leg passes a registered truck's body (a docked trailer splits the apron). */
const legMeetsTruck = (ax: number, az: number, bx: number, bz: number): boolean => {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
  for (const other of positionRegistry.getAllEntities()) {
    if (other.kind !== 'truck') continue;
    const body = other.id.endsWith('-trailer') ? TRUCK_BODY.trailer : TRUCK_BODY.tractor;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (
        circleMeetsCapsule(
          ax + (bx - ax) * t,
          az + (bz - az) * t,
          DETOUR_TRUCK_CLEARANCE_METRES,
          other,
          body.ahead,
          body.behind
        )
      )
        return true;
    }
  }
  return false;
};

const HALL = SITE_LAYOUT.factory.bounds;
/** Past this far beyond a wall's line, the forklift's origin is outside the hall. */
const OUTSIDE_HALL_METRES = 0.3;
/** The ring it drives round the hall's outside: clear of the walls and the dock platforms. */
const RING_X = HALL.maxX + 5.5;
const RING_Z = Math.max(...DOCK_BLOCKS.map((block) => block.uOut)) + DETOUR_MARGIN_METRES;
/** The service doors: the only hall openings its body fits. Outside and inside aims. */
const DOOR_Z = SITE_LAYOUT.portals.eastService.centre[2];
const DOOR_HALF_WIDTH = SITE_LAYOUT.portals.eastService.halfWidth;
const DOOR_INSIDE_X = HALL.maxX - 3.5;
/** Within this of the door's outside aim, or in the doorway, it turns in. */
const DOOR_TURN_IN_METRES = 1.5;

/**
 * The way back into the hall from outside it, for lane return (plan 6.6). The
 * walls are solid and every door is open, but the only openings a forklift
 * fits are the two service doors (x +/-40, z -20): it drives round the hall on
 * a ring clear of the walls and the dock platforms to the nearer one, the
 * shorter way and never past a truck, and in through it. Sets `out` and returns
 * the distance on from there to the lane, or null when it is in the hall.
 */
function outsideHallDetour(
  x: number,
  z: number,
  laneAim: { readonly x: number; readonly z: number },
  out: { x: number; z: number }
): number | null {
  const beyondSide = Math.abs(x) > HALL.maxX + OUTSIDE_HALL_METRES;
  const beyondEnd = Math.abs(z) > HALL.maxZ + OUTSIDE_HALL_METRES;
  if (!beyondSide && !beyondEnd) return null;
  const inRest = (side: number) => Math.hypot(laneAim.x - side * DOOR_INSIDE_X, laneAim.z - DOOR_Z);
  const doorLeg = RING_X - DOOR_INSIDE_X;
  if (beyondSide) {
    const side = Math.sign(x);
    const turnIn =
      Math.abs(z - DOOR_Z) < DOOR_HALF_WIDTH - 0.6 && Math.abs(x) < RING_X + DOOR_TURN_IN_METRES;
    if (turnIn || Math.hypot(x - side * RING_X, z - DOOR_Z) < DOOR_TURN_IN_METRES) {
      out.x = side * DOOR_INSIDE_X;
      out.z = DOOR_Z;
      return inRest(side);
    }
    out.x = side * RING_X;
    out.z = DOOR_Z;
    return doorLeg + inRest(side);
  }
  // Beyond a gable: to the ring's corner on the shorter side, then down the side.
  const end = Math.sign(z);
  let best = Infinity;
  let bestRest = 0;
  for (const side of SIDES) {
    const cx = side * RING_X;
    const cz = end * RING_Z;
    if (legMeetsTruck(x, z, cx, cz)) continue;
    const rest = Math.abs(cz - DOOR_Z) + doorLeg + inRest(side);
    const total = Math.hypot(cx - x, cz - z) + rest;
    if (total < best) {
      best = total;
      bestRest = rest;
      out.x = cx;
      out.z = cz;
    }
  }
  return best === Infinity ? null : bestRest;
}

/** In a side aisle this near a side wall, a lane further in is reached along the aisle first. */
const SIDE_AISLE_X = HALL.maxX - 7;
/** Within this of the lane's z, it turns off the aisle for the lane. */
const SIDE_AISLE_TURN_METRES = 3;

/**
 * Just in by a service door, or anywhere along a side aisle, with its lane
 * further into the hall and well up or down it: along the aisle (x
 * +/-DOOR_INSIDE_X) to the lane's z first, and only then across, rather than
 * straight over the milling floor's machines. Null otherwise.
 */
function sideAisleDetour(
  x: number,
  z: number,
  laneAim: { readonly x: number; readonly z: number },
  out: { x: number; z: number }
): number | null {
  if (Math.abs(x) < SIDE_AISLE_X || Math.abs(laneAim.x) > Math.abs(x) - 3) return null;
  if (Math.abs(laneAim.z - z) <= SIDE_AISLE_TURN_METRES) return null;
  out.x = Math.sign(x) * DOOR_INSIDE_X;
  out.z = laneAim.z;
  return Math.abs(laneAim.x - out.x);
}

/**
 * The way back to the hall from a dock apron or beside a dock's end, for lane
 * return. The platforms wall the apron off from the hall, and pursuit straight
 * at the lane pushed the forklift's nose into the dock bay for good (45 of 45
 * starts behind the shipping dock). On the apron it aims round whichever end
 * of the block makes the shorter way to its lane, never past a truck (a docked
 * trailer splits the apron), favouring the way it already heads so the choice
 * does not flip; beside an end it aims for the hall corner only while a
 * straight line to the lane would scrape the block, and is its own once that
 * line is clear. Sets `out` to the point to aim at and returns the distance on
 * from there to the lane, or null when nothing is in the way.
 */
export const dockPlatformDetour: LaneDetour = (x, z, heading, plan, laneAim, out) => {
  const outside = outsideHallDetour(x, z, laneAim, out) ?? sideAisleDetour(x, z, laneAim, out);
  if (outside !== null) return outside;
  const lanes = cornerLane(plan);
  for (let index = 0; index < DOCK_BLOCKS.length; index += 1) {
    const block = DOCK_BLOCKS[index];
    const u = z * block.sign;
    // In the hall, or in the dock's own channel or footprint: nothing to go round.
    if (u <= block.uIn - DETOUR_BODY_CLEARANCE_METRES) continue;
    const beyondEnd = Math.abs(x) >= block.halfWidth + DETOUR_END_CLEAR_METRES;
    const onApron = u >= block.uOut - 0.3;
    if (!beyondEnd && !onApron) continue;
    const edge = block.halfWidth + DETOUR_MARGIN_METRES;
    const innerZ = cornerZ(block);
    const outerZ = (block.uOut + DETOUR_MARGIN_METRES) * block.sign;
    if (beyondEnd && !onApron) {
      // Beside an end: straight on once the line to where pursuit aims clears
      // the block (it aims along the lane, which can be past the block's end).
      const at = (index * 2 + (x > 0 ? 1 : 0)) * 3;
      if (lineClearsBlock(x, z, laneAim.x, laneAim.z, block)) return null;
      out.x = Math.sign(x) * edge;
      out.z = innerZ;
      return lanes[at + 2];
    }
    let best = Infinity;
    let bestRest = 0;
    for (const side of SIDES) {
      const innerX = side * edge;
      const at = (index * 2 + (side > 0 ? 1 : 0)) * 3;
      const direct = beyondEnd && Math.sign(x) === side;
      const aimZ = direct ? innerZ : outerZ;
      if (
        legMeetsTruck(x, z, innerX, aimZ) ||
        (!direct && legMeetsTruck(innerX, outerZ, innerX, innerZ))
      )
        continue;
      const rest = (direct ? 0 : Math.abs(outerZ - innerZ)) + lanes[at + 2];
      const turnBack =
        !beyondEnd && side * Math.sin(heading) < 0 ? DETOUR_SIDE_HYSTERESIS_METRES : 0;
      const total = Math.hypot(innerX - x, aimZ - z) + rest + turnBack;
      if (total < best) {
        best = total;
        bestRest = rest;
        out.x = innerX;
        out.z = aimZ;
      }
    }
    return best === Infinity ? null : bestRest;
  }
  return null;
};
