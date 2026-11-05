import type { TruckPhase } from '../../components/truckbay/useTruckPhysics';

/**
 * THE SOUTH ROAD IS SHARED. The shipping truck and the village bus drive the
 * same two lanes between the south tunnel and the shipping checkpoint, both
 * keeping right (`SOUTH_ROAD_LANES`), so in either lane one can come up behind
 * the other, and the bus's U-turn north of the checkpoint crosses both. While
 * the trucks drove the centre line they passed the bus side by side; in the
 * lanes they would drive through it. So each gives way to the other, and only
 * where waiting is natural, before it starts:
 *
 *  - the bus waits in the tunnel to come down while a truck is coming down;
 *  - the bus waits at the stop, doors open, while a truck is coming down or
 *    leaving, because its U-turn crosses both lanes and its way back out is
 *    the northbound lane;
 *  - a truck waits in the tunnel while the bus is coming down or turning;
 *  - a truck waits at the dock to pull out while the bus is turning or
 *    driving back out.
 *
 * Neither ever stops mid-route, and each start is the other's reason to wait,
 * so they cannot hold each other. Standing at the stop the bus is pulled in to
 * the kerb, clear of the lane, and holds no truck. Only the shipping truck
 * shares this road; the receiving truck has the north road to itself.
 * Working if no truck meets the bus all day (`southRoadTraffic.test.ts`).
 */
export type BusRoadUse =
  /** Out of service, or out of sight in the tunnel. */
  | 'none'
  /** Coming down the southbound lane to the stop. */
  | 'southbound'
  /** At the stop, pulled in to the kerb. */
  | 'kerb'
  /** Out of the stop and round the U-turn, across both lanes. */
  | 'turning'
  /** Back up the northbound lane to the tunnel. */
  | 'northbound';

/**
 * The bus's use of the road this frame, published by `CommunityLife` as it
 * moves the bus and read by `TruckBay` as it moves the trucks. Both run on the
 * render loop, so whichever moves second in a frame sees the first's move.
 * With no `CommunityLife` mounted there is no bus, and 'none' holds no truck.
 */
const southRoad: { bus: BusRoadUse } = { bus: 'none' };

export function publishBusRoadUse(use: BusRoadUse): void {
  southRoad.bus = use;
}

export function currentBusRoadUse(): BusRoadUse {
  return southRoad.bus;
}

/** A shipping truck stays in the tunnel, not yet out, while this holds. */
export const busHoldsTruckArrival = (bus: BusRoadUse): boolean =>
  bus === 'southbound' || bus === 'turning';

/** A shipping truck ready to leave the dock stays there while this holds. */
export const busHoldsTruckDeparture = (bus: BusRoadUse): boolean =>
  bus === 'turning' || bus === 'northbound';

/** The bus stays in the tunnel while the shipping truck is in this phase. */
export const truckHoldsBusApproach = (phase: TruckPhase | undefined): boolean =>
  phase === 'entering';

/**
 * The phases of a truck coming down the road (to its turn in the yard) or
 * leaving by it, from the moment it is ready to pull away from the dock. The
 * bus waits at the stop through all of them.
 */
const TRUCK_ROAD_PHASES: ReadonlySet<TruckPhase> = new Set<TruckPhase>([
  'entering',
  'slowing',
  'preparing_to_leave',
  'pulling_out',
  'turning_out',
  'accelerating',
  'leaving',
]);

/** The bus stays at the stop while the shipping truck is in this phase. */
export const truckHoldsBusDeparture = (phase: TruckPhase | undefined): boolean =>
  phase !== undefined && TRUCK_ROAD_PHASES.has(phase);
