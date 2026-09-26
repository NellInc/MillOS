import { describe, expect, it } from 'vitest';
import {
  createTruckController,
  getTruckControllerPose,
  interpolateTruckControllerState,
  stepTruckController,
} from './truckController';

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
    for (let frame = 0; frame < 60 * 4; frame += 1) {
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
