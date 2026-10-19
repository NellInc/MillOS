import { describe, expect, it } from 'vitest';
import { stagingBounds } from '../../simulation/layoutPlanning';
import { STAGING_LAYOUT } from './palletStagingLayout';
import {
  createTruckController,
  getTruckControllerPose,
  interpolateTruckControllerState,
  stepTruckController,
  type TruckControllerState,
} from './truckController';
import type { TruckAnimState } from './useTruckPhysics';

const step = (
  state: ReturnType<typeof createTruckController>,
  overrides: Partial<Parameters<typeof stepTruckController>[1]> = {}
) =>
  stepTruckController(state, {
    deltaSeconds: 1 / 60,
    arrivalReady: false,
    safetyHold: false,
    serviceComplete: true,
    speedMultiplier: 1,
    ...overrides,
  });

const runCompleteCycle = (framesPerSecond: number, speedMultiplier: number = 1) => {
  let state = createTruckController('shipping');
  let maximumArticulation = 0;
  let maximumSteering = 0;
  let departureSeconds = Number.POSITIVE_INFINITY;
  const maximumFrames = framesPerSecond * 200;

  for (let frame = 0; frame < maximumFrames; frame += 1) {
    const result = stepTruckController(state, {
      deltaSeconds: 1 / framesPerSecond,
      arrivalReady: false,
      safetyHold: false,
      serviceComplete: true,
      speedMultiplier,
    });
    state = result.state;
    maximumArticulation = Math.max(maximumArticulation, Math.abs(result.pose.articulation));
    maximumSteering = Math.max(maximumSteering, Math.abs(result.pose.steeringAngle));
    if (result.departedThisStep) {
      departureSeconds = (frame + 1) / framesPerSecond;
      break;
    }
  }

  return { state, maximumArticulation, maximumSteering, departureSeconds };
};

const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));

interface ArrivalStep {
  readonly prior: TruckControllerState;
  readonly state: TruckControllerState;
  readonly pose: TruckAnimState;
  readonly phaseChanged: boolean;
}

/** One whole visit, entering to departed, at the 60 Hz controller step. */
const simulateVisit = (dock: 'shipping' | 'receiving', speedMultiplier: number = 1) => {
  let state = createTruckController(dock);
  const steps: ArrivalStep[] = [];
  for (let frame = 0; frame < 60 * 240; frame += 1) {
    const result = stepTruckController(state, {
      deltaSeconds: 1 / 60,
      arrivalReady: false,
      safetyHold: false,
      serviceComplete: true,
      speedMultiplier,
    });
    steps.push({
      prior: state,
      state: result.state,
      pose: result.pose,
      phaseChanged: result.phaseChanged,
    });
    state = result.state;
    if (result.departedThisStep) break;
  }
  return steps;
};

interface Rect {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Plan-view boxes in vehicle-local metres (x across, z forward), both renderers' outer extents. */
const TRACTOR_BOX = { centreZ: 2, halfLength: 3, halfWidth: 1.35 } as const;
const TRAILER_BOX = { centreZ: -5.98, halfLength: 5.78, halfWidth: 1.3 } as const;

/** Separating-axis test between a yawed box and an axis-aligned one. */
const orientedBoxMeetsRect = (
  originX: number,
  originZ: number,
  yaw: number,
  box: { readonly centreZ: number; readonly halfLength: number; readonly halfWidth: number },
  rect: Rect
): boolean => {
  const forward = [Math.sin(yaw), Math.cos(yaw)] as const;
  const across = [Math.cos(yaw), -Math.sin(yaw)] as const;
  const centre = [originX + forward[0] * box.centreZ, originZ + forward[1] * box.centreZ] as const;
  const rectCentre = [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2] as const;
  const rectHalf = [(rect.maxX - rect.minX) / 2, (rect.maxZ - rect.minZ) / 2] as const;
  const delta = [rectCentre[0] - centre[0], rectCentre[1] - centre[1]] as const;
  const axes = [[1, 0], [0, 1], forward, across] as const;
  return axes.every((axis) => {
    const boxRadius =
      box.halfLength * Math.abs(forward[0] * axis[0] + forward[1] * axis[1]) +
      box.halfWidth * Math.abs(across[0] * axis[0] + across[1] * axis[1]);
    const rectRadius = rectHalf[0] * Math.abs(axis[0]) + rectHalf[1] * Math.abs(axis[1]);
    return Math.abs(delta[0] * axis[0] + delta[1] * axis[1]) < boxRadius + rectRadius;
  });
};

/**
 * Solid things a truck must never enter, in world metres. The shipping dock
 * sections and bollards come from the TruckBay dock group at z = 50; the
 * receiving dock is the same group turned half a revolution, so the shipping
 * check covers both. Each staging area is the planner's reserved envelope.
 */
const SHIPPING_DOCK_SOLIDS: readonly Rect[] = [
  // The five dock bumpers at local z 0.2 (0.6 deep); the trailer stops on their face.
  ...[-3.5, -1.75, 0, 1.75, 3.5].map((x) => ({
    id: `bumper-${x}`,
    minX: x - 0.4,
    maxX: x + 0.4,
    minZ: 49.9,
    maxZ: 50.5,
  })),
  { id: 'left-platform', minX: -4.5, maxX: -2, minZ: 48.3, maxZ: 54.1 },
  { id: 'right-platform', minX: 2, maxX: 4.5, minZ: 48.3, maxZ: 54.1 },
  ...[-5.5, 5.5].flatMap((x) =>
    [52, 55].map((z) => ({
      id: `bollard-${x}-${z}`,
      minX: x - 0.2,
      maxX: x + 0.2,
      minZ: z - 0.2,
      maxZ: z + 0.2,
    }))
  ),
];
/**
 * Yard props beside the truck lanes, from their TruckBay placements (the
 * shipping group sits at z = 50, the receiving group at z = -50, unrotated).
 */
const SHIPPING_YARD_SOLIDS: readonly Rect[] = [
  // WeightScale at (-16, 100), turned pi: a 0.2 m deck with end ramps, and its
  // booth to the west. The truck has no ride height, so crossing the deck would
  // sink its tyres into it; at (0, 102) on the dock lane it did.
  { id: 'weigh-scale-deck', minX: -18.1, maxX: -13.9, minZ: 92.75, maxZ: 107.25 },
  { id: 'weigh-scale-booth', minX: -20.7, maxX: -18.3, minZ: 98.55, maxZ: 101.45 },
  // ScaleTicketKiosk at (-19, 100).
  { id: 'scale-kiosk', minX: -19.5, maxX: -18.5, minZ: 99.4, maxZ: 100.6 },
  // YardAccessNode at (18, 100), turned a quarter: a card-reader post beside the road.
  { id: 'shipping-access-node', minX: 17.9, maxX: 18.2, minZ: 99.3, maxZ: 100.7 },
];
const RECEIVING_YARD_SOLIDS: readonly Rect[] = [
  // The shipping weigh scale and kiosk turned half a revolution: (16, -100).
  { id: 'receiving-weigh-scale-deck', minX: 13.9, maxX: 18.1, minZ: -107.25, maxZ: -92.75 },
  { id: 'receiving-weigh-scale-booth', minX: 18.3, maxX: 20.7, minZ: -101.45, maxZ: -98.55 },
  { id: 'receiving-scale-kiosk', minX: 18.5, maxX: 19.5, minZ: -100.6, maxZ: -99.4 },
  // YardJockey at receiving-group (35, 0, -42): shuttles +/-8 m in x, body 2.5 x 2 m.
  // At (0, 0, -25) it crossed the back-in lane.
  { id: 'receiving-yard-jockey', minX: 25.75, maxX: 44.25, minZ: -93, maxZ: -91 },
  // FuelIsland at (25, -85), turned -pi/2: pad and the 6 x 10 m canopy.
  { id: 'fuel-island', minX: 20, maxX: 30, minZ: -88, maxZ: -82 },
  { id: 'receiving-access-node', minX: -18.2, maxX: -17.9, minZ: -102.7, maxZ: -101.3 },
  // TireInspectionArea at (-25, -85), turned -pi/2: its road-side posts and rail at x -21.5.
  { id: 'tire-inspection-posts', minX: -21.54, maxX: -21.46, minZ: -87.24, maxZ: -82.76 },
];
const stagingRect = (dock: 'shipping' | 'receiving'): Rect => ({
  id: `${dock}-staging`,
  ...stagingBounds(dock, [
    ...(dock === 'shipping' ? STAGING_LAYOUT.shippingOrigin : STAGING_LAYOUT.receivingOrigin),
  ]),
});

const footprintHits = (pose: TruckAnimState, rects: readonly Rect[]): string[] =>
  rects
    .filter(
      (rect) =>
        orientedBoxMeetsRect(pose.x, pose.z, pose.rotation, TRACTOR_BOX, rect) ||
        orientedBoxMeetsRect(pose.x, pose.z, pose.rotation + pose.articulation, TRAILER_BOX, rect)
    )
    .map((rect) => rect.id);

describe('articulated truck yard motion', () => {
  it.each(['shipping', 'receiving'] as const)(
    'keeps the %s trailer and tractor yaw continuous through every phase boundary',
    (dock) => {
      const steps = simulateVisit(dock);
      expect(steps.at(-1)?.state.active).toBe(false);
      let worstTrailer = 0;
      let worstTractor = 0;
      for (const { prior, state } of steps) {
        worstTrailer = Math.max(
          worstTrailer,
          Math.abs(wrapAngle(state.trailerYaw - prior.trailerYaw))
        );
        worstTractor = Math.max(
          worstTractor,
          Math.abs(wrapAngle(state.tractorYaw - prior.tractorYaw))
        );
      }
      expect(worstTrailer).toBeLessThan(0.05);
      expect(worstTractor).toBeLessThan(0.05);
    }
  );

  it('slows into the yard U-turn and holds a steerable radius and lateral acceleration', () => {
    const steps = simulateVisit('shipping');
    let peakLateral = 0;
    let minimumRadius = Infinity;
    let steeringStep = 0;
    for (const { prior, state } of steps) {
      if (state.phase === 'docked') continue;
      const yawStep = Math.abs(wrapAngle(state.tractorYaw - prior.tractorYaw));
      const travel = Math.hypot(state.x - prior.x, state.z - prior.z);
      peakLateral = Math.max(peakLateral, yawStep * 60 * Math.abs(state.motion.speed));
      if (travel > 1e-4 && yawStep > 1e-6)
        minimumRadius = Math.min(minimumRadius, travel / yawStep);
      steeringStep = Math.max(steeringStep, Math.abs(state.steeringAngle - prior.steeringAngle));
    }
    // A 3.8 m wheelbase at 0.55 rad of lock turns no tighter than 6.2 m.
    expect(minimumRadius).toBeGreaterThanOrEqual(3.8 / Math.tan(0.55));
    expect(peakLateral).toBeLessThan(3);
    // Steering is rate-limited (0.52 rad/s) everywhere, including the stop to back.
    expect(steeringStep).toBeLessThanOrEqual(0.52 / 60 + 1e-9);
  });

  it('backs in at its reverse speed and rolls to rest at each stop mark instead of halting', () => {
    const steps = simulateVisit('shipping');
    let peakReverse = 0;
    let peakArrival = 0;
    for (const { prior, state, phaseChanged } of steps) {
      if (state.phase === 'backing' || state.phase === 'final_adjustment')
        peakReverse = Math.max(peakReverse, Math.abs(state.motion.speed));
      // The speed the truck carried into a stop mark.
      if (phaseChanged && (state.phase === 'stopping_to_back' || state.phase === 'docked'))
        peakArrival = Math.max(peakArrival, Math.abs(prior.motion.speed));
    }
    // Was 3.08 m/s in the back-in (a jerk overshoot past a moving limit),
    // and 0.77 / 0.44 m/s at the two stop marks.
    expect(peakReverse).toBeLessThanOrEqual(1.35 + 1e-9);
    expect(peakArrival).toBeLessThan(0.15);
  });

  it.each(['shipping', 'receiving'] as const)(
    'parks the %s trailer on the dock bumper face, not through it',
    (dock) => {
      const docked = simulateVisit(dock).find(({ state }) => state.phase === 'docked')?.pose;
      expect(docked).toBeDefined();
      // Receiving is the shipping yard turned half a revolution about the origin.
      const sign = dock === 'shipping' ? 1 : -1;
      const rearSill = sign * docked!.z - 11.76;
      // Was 49.24: the rear bar 1.26 m inside the bumper face at z 50.5.
      expect(rearSill).toBeGreaterThanOrEqual(50.5);
      expect(rearSill).toBeLessThan(50.6);
    }
  );

  it.each(['shipping', 'receiving'] as const)(
    'never puts the %s tractor or trailer through the dock, its bollards or the staging area',
    (dock) => {
      const solids = [
        ...(dock === 'shipping'
          ? [...SHIPPING_DOCK_SOLIDS, ...SHIPPING_YARD_SOLIDS]
          : RECEIVING_YARD_SOLIDS),
        stagingRect(dock),
      ];
      const hits = new Set<string>();
      for (const { pose } of simulateVisit(dock))
        footprintHits(pose, solids).forEach((id) => hits.add(id));
      expect([...hits]).toEqual([]);
    }
  );

  it('keeps the receiving visit a pure rotation of shipping so the dock check covers both', () => {
    const shipping = simulateVisit('shipping');
    const receiving = simulateVisit('receiving');
    expect(receiving).toHaveLength(shipping.length);
  });
});

describe('schedule-owned articulated truck controller', () => {
  it('runs a complete service cycle without teleporting at phase boundaries', () => {
    let state = createTruckController('shipping');
    let priorPose = getTruckControllerPose(state);
    const visited = new Set([state.phase]);
    let docked = false;
    let departed = false;

    for (let frame = 0; frame < 60 * 180 && !departed; frame += 1) {
      const result = step(state);
      state = result.state;
      const pose = result.pose;
      visited.add(state.phase);
      docked ||= result.dockedThisStep;
      departed ||= result.departedThisStep;
      expect(Math.hypot(pose.x - priorPose.x, pose.z - priorPose.z)).toBeLessThan(0.5);
      expect(Number.isFinite(pose.rotation)).toBe(true);
      expect(Math.abs(pose.articulation)).toBeLessThanOrEqual(0.7 + 1e-8);
      priorPose = pose;
    }

    expect(docked).toBe(true);
    expect(departed).toBe(true);
    expect(visited).toEqual(
      new Set([
        'entering',
        'slowing',
        'turning_in',
        'straightening',
        'positioning',
        'stopping_to_back',
        'backing',
        'final_adjustment',
        'docked',
        'preparing_to_leave',
        'pulling_out',
        'turning_out',
        'accelerating',
        'leaving',
      ])
    );
  });

  it('keeps tractor heading continuous through authored path boundaries', () => {
    let state = createTruckController('shipping');
    let priorPose = getTruckControllerPose(state);
    let maximumHeadingStep = 0;

    for (let frame = 0; frame < 60 * 90 && state.phase !== 'docked'; frame += 1) {
      const result = step(state);
      state = result.state;
      const headingStep = Math.abs(
        Math.atan2(
          Math.sin(result.pose.rotation - priorPose.rotation),
          Math.cos(result.pose.rotation - priorPose.rotation)
        )
      );
      maximumHeadingStep = Math.max(maximumHeadingStep, headingStep);
      priorPose = result.pose;
    }

    expect(state.phase).toBe('docked');
    expect(maximumHeadingStep).toBeLessThan(0.08);
  });

  it('holds transfer until the material service is complete', () => {
    let state = createTruckController('shipping', true, 'docked');
    for (let frame = 0; frame < 60 * 20; frame += 1) {
      state = step(state, { serviceComplete: false }).state;
    }
    expect(state.phase).toBe('docked');
    expect(state.servicePhase).toBe('transfer');
    expect(getTruckControllerPose(state).doorsOpen).toBe(true);

    for (let frame = 0; frame < 60 * 10; frame += 1) state = step(state).state;
    expect(state.phase).not.toBe('docked');
  });

  it('enforces dock interlocks in sequence', () => {
    let state = createTruckController('shipping', true, 'docked');
    let sawLockedDoorClosed = false;
    let sawTransfer = false;
    for (let frame = 0; frame < 60 * 15; frame += 1) {
      const result = step(state);
      state = result.state;
      const pose = result.pose;
      if (pose.dockLocked && !pose.doorsOpen) sawLockedDoorClosed = true;
      if (pose.servicePhase === 'transfer') {
        sawTransfer = true;
        expect(pose.parkingBrake).toBe(true);
        expect(pose.chocksDeployed).toBe(true);
        expect(pose.dockLocked).toBe(true);
        expect(pose.levelerDeployed).toBe(true);
        expect(pose.doorsOpen).toBe(true);
      }
      if (pose.doorsOpen) expect(pose.dockLocked).toBe(true);
      if (pose.levelerDeployed) expect(pose.chocksDeployed).toBe(true);
    }
    expect(sawLockedDoorClosed).toBe(true);
    expect(sawTransfer).toBe(true);
  });

  it('brakes under a safety hold without advancing controller phase', () => {
    let state = createTruckController('shipping');
    for (let frame = 0; frame < 60 * 4; frame += 1) state = step(state).state;
    const heldPhase = state.phase;
    // A jerk-limited stop eases its braking off over the last 1.8 m/s instead
    // of releasing 2.4 m/s^2 at the standstill, so allow 5 s rather than 4.
    for (let frame = 0; frame < 60 * 5; frame += 1) {
      state = step(state, { safetyHold: true }).state;
    }
    const pose = getTruckControllerPose(state, true);
    expect(state.phase).toBe(heldPhase);
    expect(pose.speed).toBe(0);
    expect(pose.brakeLights).toBe(true);
    expect(pose.reverseLights).toBe(false);
  });

  it('rotates receiving motion half a turn without mirroring vehicle-relative steering', () => {
    let shipping = createTruckController('shipping');
    let receiving = createTruckController('receiving');
    let sawSteering = false;
    for (let frame = 0; frame < 60 * 30; frame += 1) {
      shipping = step(shipping).state;
      receiving = step(receiving).state;
      const shippingPose = getTruckControllerPose(shipping);
      const receivingPose = getTruckControllerPose(receiving);
      sawSteering ||= Math.abs(shippingPose.steeringAngle) > 0.1;
      expect(receivingPose.x).toBeCloseTo(-shippingPose.x);
      expect(receivingPose.z).toBeCloseTo(-shippingPose.z);
      expect(Math.cos(receivingPose.rotation - shippingPose.rotation - Math.PI)).toBeCloseTo(1);
      // A 180 degree rotation about the site origin is not a reflection, so
      // steering, articulation, cab roll and indicator side are unchanged.
      expect(receivingPose.steeringAngle).toBeCloseTo(shippingPose.steeringAngle);
      expect(receivingPose.articulation).toBeCloseTo(shippingPose.articulation);
      expect(receivingPose.trailerAngle).toBeCloseTo(shippingPose.trailerAngle);
      expect(receivingPose.cabRoll).toBeCloseTo(shippingPose.cabRoll);
      expect(receivingPose.leftSignal).toBe(shippingPose.leftSignal);
      expect(receivingPose.rightSignal).toBe(shippingPose.rightSignal);
    }
    expect(sawSteering).toBe(true);
  });

  it('freezes dock service under a safety hold', () => {
    let state = createTruckController('receiving', true, 'docked');
    for (let frame = 0; frame < 60 * 2; frame += 1) state = step(state).state;
    const heldServicePhase = state.servicePhase;
    const heldServiceElapsed = state.serviceElapsed;
    for (let frame = 0; frame < 60 * 30; frame += 1) {
      state = step(state, { safetyHold: true }).state;
    }
    expect(state.phase).toBe('docked');
    expect(state.servicePhase).toBe(heldServicePhase);
    expect(state.serviceElapsed).toBe(heldServiceElapsed);

    for (let frame = 0; frame < 60 * 30; frame += 1) state = step(state).state;
    expect(state.phase).not.toBe('docked');
  });

  it('reports the motion phase, not a stale service phase, once the truck pulls out', () => {
    let state = createTruckController('shipping', true, 'docked');
    for (let frame = 0; frame < 60 * 40 && state.phase !== 'pulling_out'; frame += 1) {
      state = step(state).state;
    }
    expect(state.phase).toBe('pulling_out');
    expect(state.servicePhase).toBe('approach');
    const pose = getTruckControllerPose(state);
    expect(pose.doorsOpen).toBe(false);
    expect(pose.landingGearAmount).toBe(0);
  });

  it('spawns only when the schedule marks an arrival ready', () => {
    const inactive = createTruckController('shipping', false);
    expect(step(inactive).state.active).toBe(false);
    expect(step(inactive, { arrivalReady: true }).state.active).toBe(true);
  });

  it('completes the same bounded articulated cycle at 30, 60, and 120 Hz', () => {
    const results = [30, 60, 120].map((framesPerSecond) => runCompleteCycle(framesPerSecond));
    const departureTimes = results.map((result) => result.departureSeconds);
    const wheelTravel = results.map((result) => result.state.wheelTravel);

    expect(departureTimes.every(Number.isFinite)).toBe(true);
    expect(Math.max(...departureTimes) - Math.min(...departureTimes)).toBeLessThan(0.5);
    expect(Math.max(...wheelTravel) - Math.min(...wheelTravel)).toBeLessThan(0.15);
    for (const result of results) {
      expect(result.state.active).toBe(false);
      expect(result.maximumArticulation).toBeLessThanOrEqual(0.7 + 1e-8);
      expect(result.maximumSteering).toBeLessThanOrEqual(0.55 + 1e-8);
    }
  });

  it('applies incident traction limits while preserving the route contract', () => {
    const clear = runCompleteCycle(60, 1);
    const restricted = runCompleteCycle(60, 0.55);

    expect(restricted.departureSeconds).toBeGreaterThan(clear.departureSeconds);
    expect(restricted.state.active).toBe(false);
    expect(restricted.state.wheelTravel).toBeCloseTo(clear.state.wheelTravel, 1);
    expect(restricted.maximumArticulation).toBeLessThanOrEqual(0.7 + 1e-8);
    expect(restricted.maximumSteering).toBeLessThanOrEqual(0.55 + 1e-8);
  });

  it('interpolates render poses smoothly across the angle wrap', () => {
    const previous = {
      ...createTruckController('shipping'),
      x: 10,
      z: 20,
      tractorYaw: Math.PI - 0.1,
      trailerYaw: Math.PI - 0.2,
      steeringAngle: -0.2,
      wheelTravel: 40,
      phaseElapsed: 2,
      motion: { speed: 4, acceleration: 0.5 },
    };
    const current = {
      ...previous,
      x: 14,
      z: 24,
      tractorYaw: -Math.PI + 0.1,
      trailerYaw: -Math.PI + 0.2,
      steeringAngle: 0.2,
      wheelTravel: 44,
      phaseElapsed: 3,
      motion: { speed: 6, acceleration: 1.5 },
    };

    const display = interpolateTruckControllerState(previous, current, 0.5);
    expect(display.x).toBe(12);
    expect(display.z).toBe(22);
    expect(display.wheelTravel).toBe(42);
    expect(display.steeringAngle).toBeCloseTo(0);
    expect(display.motion).toEqual({ speed: 5, acceleration: 1 });
    expect(Math.abs(Math.abs(display.tractorYaw) - Math.PI)).toBeLessThan(1e-8);
    expect(Math.abs(Math.abs(display.trailerYaw) - Math.PI)).toBeLessThan(1e-8);
  });

  it('keeps active transitions discrete so trucks never ghost into or out of the yard', () => {
    const previous = createTruckController('shipping', false);
    const current = createTruckController('shipping', true);
    expect(interpolateTruckControllerState(previous, current, 0.25)).toBe(current);
  });
});
