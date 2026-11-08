import { describe, expect, it } from 'vitest';
import { COMMUNITY_ROSTER } from '../communityLife';
import {
  advanceForkliftCrew,
  createForkliftDriveCue,
  forkliftParkedForCrew,
  forkliftSpellEndTask,
  initialForkliftCrewState,
  FORKLIFT_CREW_ALIGHT_HOURS,
  FORKLIFT_CREW_BOARD_HOURS,
  FORKLIFT_OPERATOR_WHEEL,
  forkliftCrewDuty,
  forkliftDriveCue,
  isOperatorInCab,
  type ForkliftCrewPhase,
  type ForkliftCrewState,
} from '../forkliftCrew';

const PHASES: ForkliftCrewPhase[] = [
  'off',
  'waiting',
  'boarding',
  'aboard',
  'wants-off',
  'alighting',
  'displaced',
];

describe('a crewed forklift at work', () => {
  /**
   * The autopilot works its route (moves at working speed, picks and drops)
   * only with `duty.works`; otherwise it is unmanned, at walking pace to its
   * station or standing there. So in every crew state and climb timing, a
   * working forklift has its operator in the seat.
   */
  it('works only with its operator in the seat, and otherwise only walks to its station', () => {
    for (const phase of PHASES) {
      for (const timer of [0, FORKLIFT_CREW_BOARD_HOURS / 4, FORKLIFT_CREW_ALIGHT_HOURS, 1]) {
        const handover =
          phase === 'displaced' || phase === 'boarding'
            ? { x: 0, z: 0, rotation: 0, routeDistance: 3 }
            : null;
        const state: ForkliftCrewState = { phase, timer, handover };
        const duty = forkliftCrewDuty(state, 12);
        if (duty.works) expect(isOperatorInCab(state)).toBe(true);
        else {
          expect(duty.walkingPace).toBe(true);
          expect(duty.station).not.toBeNull();
        }
      }
    }
  });

  it('puts both hands on the wheel ahead of the seated hips, within an arm of the shoulders', () => {
    for (const tier of ['authored', 'compact'] as const) {
      const wheel = FORKLIFT_OPERATOR_WHEEL[tier];
      // Hips sit on the cushion 0.46 m over the root (WorkerModel's seat).
      expect(wheel.z).toBeGreaterThan(0.25);
      expect(wheel.y).toBeGreaterThan(0.5);
      expect(wheel.y).toBeLessThan(0.85);
      // Shoulders about 0.5 m above the seat, 0.2 m either side.
      const shoulder = { x: 0.2, y: 0.46 + 0.5, z: 0 };
      const rim = Math.hypot(wheel.radius - shoulder.x, wheel.y - shoulder.y, wheel.z - shoulder.z);
      expect(rim).toBeLessThan(0.62);
    }
  });

  it('turns the rim with the steering, and looks back over a shoulder while backing out', () => {
    const cue = createForkliftDriveCue();
    forkliftDriveCue('authored', { steer: 0, reversing: false }, cue);
    expect(cue.rimTurn).toBe(0);
    expect(cue.lookYaw).toBe(0);
    forkliftDriveCue('authored', { steer: 0.3, reversing: false }, cue);
    expect(cue.rimTurn).toBeGreaterThan(0.5);
    expect(cue.lookYaw).toBeGreaterThan(0);
    forkliftDriveCue('authored', { steer: 9, reversing: false }, cue);
    expect(Math.abs(cue.rimTurn)).toBeLessThanOrEqual(1.1);
    forkliftDriveCue('compact', { steer: 0, reversing: true }, cue);
    expect(cue.lookYaw).toBeLessThan(-0.8);
    forkliftDriveCue('compact', null, cue);
    expect(cue.rimTurn).toBe(0);
  });
});

describe('the end of a driving spell', () => {
  it('never leaves a load on the forks: deliver, put back, or hold, but never park loaded', () => {
    for (const dropOpen of [true, false])
      for (const committed of [true, false])
        for (const canPutBack of [true, false]) {
          const task = forkliftSpellEndTask({
            wantsOff: true,
            loaded: true,
            dropOpen,
            committed,
            canPutBack,
          });
          expect(task).not.toBe('park');
          expect(task).not.toBe('work');
        }
    // With its truck on the way in it waits for it rather than put the load back.
    expect(
      forkliftSpellEndTask({
        wantsOff: true,
        loaded: true,
        dropOpen: false,
        dropExpected: true,
        committed: false,
        canPutBack: true,
      })
    ).toBe('hold');
    expect(
      forkliftSpellEndTask({
        wantsOff: true,
        loaded: true,
        dropOpen: false,
        dropExpected: false,
        committed: false,
        canPutBack: true,
      })
    ).toBe('put-back');
    expect(
      forkliftSpellEndTask({
        wantsOff: true,
        loaded: false,
        dropOpen: false,
        committed: false,
        canPutBack: false,
      })
    ).toBe('park');
  });

  /**
   * Over many shifts, with a forklift that picks and carries loads at random
   * and whose drop opens only now and then: no frame has the operator climbing
   * out or off while the forklift carries a load, stands anywhere but parked
   * at its crew point, or has its forks up; and the operator still gets their
   * breaks (the held hour waits for the job, it is not lost).
   */
  it('has no frame with the operator off and the forklift loaded or away from its parking spot', () => {
    for (const operatorId of ['mill-forklift-shipping', 'mill-forklift-receiving']) {
      const person = COMMUNITY_ROSTER.find((candidate) => candidate.id === operatorId)!;
      let seed = operatorId.length * 7919;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      const vehicle = { atCrew: false, loaded: false, forkHeight: 0.32, travel: 0 };
      let hour = 10;
      let state = initialForkliftCrewState(person, hour);
      let breaks = 0;
      const step = 0.004;
      for (let frame = 0; frame < 20000; frame += 1) {
        const phase = state.phase;
        const dropOpen = random() > 0.97;
        // The forklift's side, as ForkliftSystem drives it.
        if (phase === 'aboard') {
          vehicle.atCrew = false;
          vehicle.forkHeight = vehicle.loaded ? 0.32 : 0;
          if (!vehicle.loaded && random() > 0.95) vehicle.loaded = true;
          else if (vehicle.loaded && dropOpen) vehicle.loaded = false;
        } else if (phase === 'wants-off') {
          const task = forkliftSpellEndTask({
            wantsOff: true,
            loaded: vehicle.loaded,
            dropOpen,
            committed: false,
            canPutBack: random() > 0.9,
          });
          if (task === 'deliver' || task === 'put-back') {
            vehicle.atCrew = false;
            vehicle.loaded = false;
          } else if (task === 'park') {
            vehicle.travel += 1;
            if (vehicle.travel > 20) vehicle.atCrew = true;
            if (vehicle.atCrew) vehicle.forkHeight = 0;
          }
        }
        const parked =
          phase === 'wants-off'
            ? forkliftParkedForCrew({
                atStation: vehicle.atCrew,
                aligned: true,
                speed: vehicle.atCrew ? 0 : 1,
                loaded: vehicle.loaded,
                forkHeight: vehicle.forkHeight,
              })
            : vehicle.atCrew;
        const next = advanceForkliftCrew(
          person,
          state,
          hour,
          step,
          {
            parkedAt: parked ? 'crew' : null,
            playerDriving: false,
            handover: () => null,
          },
          false
        );
        if (next.state.phase === 'alighting' && state.phase !== 'alighting') breaks += 1;
        state = next.state;
        hour = next.hour;
        if (state.phase === 'alighting' || state.phase === 'off') {
          expect(vehicle.loaded).toBe(false);
          expect(vehicle.atCrew).toBe(true);
          expect(vehicle.forkHeight).toBeLessThanOrEqual(0.05);
        }
        if (state.phase === 'boarding' || state.phase === 'waiting') vehicle.travel = 0;
      }
      expect(breaks).toBeGreaterThan(2);
    }
  });
});
