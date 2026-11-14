/**
 * Plan 6.6 (report 04 P6): the hall's walls stop a driven forklift as they
 * stop a walker, with its own footprint, and its doors stay open. The only
 * openings a forklift's 1.2 m body fits are the two 4 m service portals: each
 * dock portal is filled by its platforms and bay, and a personnel door is 1.0 m
 * clear. Lane return from outside comes back through a service door.
 */
import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { sampleWalkingGroundHeight } from '../../utils/castleNavigation';
import {
  createManualForkliftState,
  forkliftFootprintBlocked,
  stepManualForklift,
  type ManualFootprintBlocked,
  type ManualForkliftState,
} from './forkliftManualDrive';
import { manualStaticBlocked } from './forkliftManualWorld';

const SEGMENTS = 128;
const worldFor =
  (state: ManualForkliftState): ManualFootprintBlocked =>
  (x, z, r) =>
    manualStaticBlocked(x, z, r, sampleWalkingGroundHeight(state.x, state.z, SEGMENTS), SEGMENTS);

/** Full throttle straight ahead for `seconds`; the last state. */
function driveStraight(start: ManualForkliftState, seconds: number): ManualForkliftState {
  let state = start;
  for (let t = 0; t < seconds; t += 1 / 30)
    state = stepManualForklift(
      state,
      { throttle: 1, steer: 0, lift: 0 },
      { loaded: false, deltaSeconds: 1 / 30, blocked: worldFor(state) }
    );
  return state;
}

/** The body's reach ahead of its origin: front circle centre 0.7 m plus its 0.6 m radius. */
const NOSE = 1.3;

describe('a driven forklift and the hall walls', () => {
  it('stops at the gable wall beside the shipping dock, as a walker does', () => {
    // Inside the hall east of the shipping portal and its platforms, facing the wall.
    const end = driveStraight(createManualForkliftState({ x: 25, z: 44, heading: 0 }), 12);
    const wallFace = SITE_LAYOUT.factory.bounds.maxZ - 0.275;
    expect(end.z + NOSE).toBeLessThanOrEqual(wallFace + 0.01);
    // The wall stopped it, not anything before it.
    expect(end.z + NOSE).toBeGreaterThan(wallFace - 0.3);
  });

  it('stops at the back gable wall and at a side wall', () => {
    const back = driveStraight(createManualForkliftState({ x: -25, z: -44, heading: Math.PI }), 12);
    expect(back.z - NOSE).toBeGreaterThanOrEqual(SITE_LAYOUT.factory.bounds.minZ + 0.275 - 0.01);
    const side = driveStraight(
      createManualForkliftState({ x: -34, z: 10, heading: -Math.PI / 2 }),
      12
    );
    expect(side.x - NOSE).toBeGreaterThanOrEqual(SITE_LAYOUT.factory.bounds.minX + 0.275 - 0.01);
  });

  for (const [name, sx] of [
    ['east', 1],
    ['west', -1],
  ] as const)
    it(`drives out through the ${name} service door and back in`, () => {
      const door = SITE_LAYOUT.portals[sx > 0 ? 'eastService' : 'westService'];
      const out = driveStraight(
        createManualForkliftState({ x: sx * 34, z: door.centre[2], heading: (sx * Math.PI) / 2 }),
        14
      );
      expect(Math.abs(out.x), 'out through the door').toBeGreaterThan(46);
      const back = driveStraight(
        createManualForkliftState({ x: out.x, z: out.z, heading: (-sx * Math.PI) / 2 }),
        14
      );
      expect(Math.abs(back.x), 'back in through the door').toBeLessThan(36);
    });

  it('cannot pass a personnel door: its 1.0 m opening is narrower than the body', () => {
    const blocked = worldFor(createManualForkliftState({ x: 37, z: 50, heading: 0 }));
    expect(forkliftFootprintBlocked(37, 50, 0, false, blocked)).toBe(true);
  });

  it('is clear standing in each dock portal channel, where the autopilot works', () => {
    for (const sign of [1, -1]) {
      const z = 47.56 * sign;
      const heading = sign > 0 ? 0 : Math.PI;
      const state = createManualForkliftState({ x: 0, z, heading });
      expect(forkliftFootprintBlocked(0, z, heading, true, worldFor(state))).toBe(false);
    }
  });
});
