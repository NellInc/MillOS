import { describe, expect, it } from 'vitest';
import {
  createManualForkliftState,
  manualPedestrianAhead,
  pedestrianClosingAtSpeed,
  pedestrianGiveWaySpeed,
  stepManualForklift,
} from './forkliftManualDrive';
import {
  FORKLIFT_PEDESTRIAN_LOOKAHEAD,
  FORKLIFT_PEDESTRIAN_SLOW_SPEED,
  FORKLIFT_PEDESTRIAN_STOP,
  FORKLIFT_WORK_SPEED,
  MANUAL_WORK_FORK_TOLERANCE,
  manualWorkLinedUp,
  manualWorkRefusal,
} from './forkliftWork';

const clear = () => false;
/** Facing +z from the origin. */
const start = createManualForkliftState({ x: 0, z: 0, heading: 0 });

/** Top speed under `throttle` for `seconds`, capped by whoever stands at `person`. */
const drive = (person: { x: number; z: number } | null, throttle: number, seconds = 3) => {
  let state = start;
  let top = 0;
  for (let t = 0; t < seconds; t += 1 / 30) {
    const people = person ? [person] : [];
    const ahead = manualPedestrianAhead(state, 1, people, people.length);
    const behind = manualPedestrianAhead(state, -1, people, people.length);
    state = stepManualForklift(
      state,
      { throttle, steer: 0, lift: 0 },
      {
        loaded: false,
        deltaSeconds: 1 / 30,
        blocked: clear,
        maximumForwardSpeed: pedestrianGiveWaySpeed(ahead),
        maximumReverseSpeed: pedestrianGiveWaySpeed(behind),
      }
    );
    top = Math.max(top, Math.abs(state.speed));
  }
  return { state, top };
};

describe('a driven forklift gives way as the autopilot does', () => {
  it('gives speed 0 toward a pedestrian 3 m ahead', () => {
    const { state, top } = drive({ x: 0, z: 3 }, 1);
    expect(top).toBe(0);
    expect(state.z).toBe(0);
  });

  it('still reverses away from them', () => {
    expect(drive({ x: 0, z: 3 }, -1).top).toBeGreaterThan(0.3);
  });

  it('stops for someone behind while reversing, not while driving on', () => {
    expect(drive({ x: 0, z: -3 }, -1).top).toBe(0);
    expect(drive({ x: 0, z: -3 }, 1).top).toBeGreaterThan(1.4);
  });

  it('slows to the slow speed within the look-ahead and is free beyond it', () => {
    expect(pedestrianGiveWaySpeed(FORKLIFT_PEDESTRIAN_STOP)).toBe(0);
    expect(pedestrianGiveWaySpeed(FORKLIFT_PEDESTRIAN_LOOKAHEAD)).toBe(
      FORKLIFT_PEDESTRIAN_SLOW_SPEED
    );
    expect(pedestrianGiveWaySpeed(FORKLIFT_PEDESTRIAN_LOOKAHEAD + 0.5)).toBe(Infinity);
  });

  it('ignores someone off to the side of its corridor', () => {
    expect(manualPedestrianAhead(start, 1, [{ x: 3, z: 3 }], 1)).toBe(Infinity);
  });

  it('counts a closing at speed only inside the stop distance above the slow speed', () => {
    expect(pedestrianClosingAtSpeed(FORKLIFT_PEDESTRIAN_STOP, 2)).toBe(true);
    expect(pedestrianClosingAtSpeed(FORKLIFT_PEDESTRIAN_STOP, -2)).toBe(true);
    expect(pedestrianClosingAtSpeed(FORKLIFT_PEDESTRIAN_STOP, FORKLIFT_PEDESTRIAN_SLOW_SPEED)).toBe(
      false
    );
    expect(pedestrianClosingAtSpeed(FORKLIFT_PEDESTRIAN_LOOKAHEAD, 3)).toBe(false);
  });
});

describe('the driver’s pick or drop', () => {
  const at = { x: 0, z: 0, heading: 0 };

  it('is offered only lined up at the work start', () => {
    expect(manualWorkLinedUp(0.2, -0.2, 0.1, at)).toBe(true);
    expect(manualWorkLinedUp(0.6, 0, 0, at)).toBe(false);
    expect(manualWorkLinedUp(0, 0, 0.5, at)).toBe(false);
  });

  it('refuses a pick with the forks raised, below a deck, or at speed', () => {
    expect(manualWorkRefusal('pickup', 0.3, 0, 0)).toBe('forksRaised');
    expect(manualWorkRefusal('pickup', 0, 0.71, 0)).toBe('forksLow');
    expect(manualWorkRefusal('pickup', 0, 0, FORKLIFT_WORK_SPEED + 0.1)).toBe('tooFast');
    expect(manualWorkRefusal('pickup', MANUAL_WORK_FORK_TOLERANCE, 0, 0)).toBeNull();
    expect(manualWorkRefusal('pickup', 0.72, 0.71, 0)).toBeNull();
  });

  it('lets a load down from any height onto the floor, but never into a deck', () => {
    expect(manualWorkRefusal('dropoff', 0.5, 0, 0)).toBeNull();
    expect(manualWorkRefusal('dropoff', 0.3, 0.71, 0)).toBe('forksLow');
  });
});
