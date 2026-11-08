import { describe, expect, it } from 'vitest';
import {
  SCHOOL_BELL_COOLDOWN_S,
  SCHOOL_BELL_MAX_ANGLE,
  createSchoolBellMotion,
  isSchoolBellCoolingDown,
  ringSchoolBell,
  schoolBellClapperAngle,
  stepSchoolBell,
} from './schoolBellMotion';

/** Run the pendulum for `seconds` at 60 fps and return the largest |angle| seen. */
function run(motion: ReturnType<typeof createSchoolBellMotion>, seconds: number): number {
  let peak = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepSchoolBell(motion, 1 / 60);
    peak = Math.max(peak, Math.abs(motion.angle));
  }
  return peak;
}

describe('school bell ring state machine', () => {
  it('hangs at rest until rung, and stepping at rest changes nothing', () => {
    const motion = createSchoolBellMotion();
    expect(stepSchoolBell(motion, 1 / 60)).toBe(false);
    expect(motion.angle).toBe(0);
    expect(motion.velocity).toBe(0);
  });

  it('a ring swings the bell, and the swing decays back to rest', () => {
    const motion = createSchoolBellMotion();
    expect(ringSchoolBell(motion, 10)).toBe(true);
    const firstSecond = run(motion, 1);
    expect(firstSecond).toBeGreaterThan(0.3);
    expect(firstSecond).toBeLessThanOrEqual(SCHOOL_BELL_MAX_ANGLE + 1e-9);
    run(motion, 4);
    const sixthSecond = run(motion, 1);
    expect(sixthSecond).toBeLessThan(firstSecond * 0.25);
    run(motion, 120);
    expect(motion.angle).toBe(0);
    expect(motion.velocity).toBe(0);
    expect(stepSchoolBell(motion, 1 / 60)).toBe(false);
  });

  it('refuses a ring inside the cooldown and accepts one after it', () => {
    const motion = createSchoolBellMotion();
    expect(ringSchoolBell(motion, 100)).toBe(true);
    const velocity = motion.velocity;
    expect(isSchoolBellCoolingDown(motion, 100.2)).toBe(true);
    expect(ringSchoolBell(motion, 100.2)).toBe(false);
    expect(ringSchoolBell(motion, 100 + SCHOOL_BELL_COOLDOWN_S - 0.01)).toBe(false);
    // A refused ring changes nothing: no extra impulse, no extra strike.
    expect(motion.velocity).toBe(velocity);
    expect(motion.rings).toBe(1);
    expect(ringSchoolBell(motion, 100 + SCHOOL_BELL_COOLDOWN_S)).toBe(true);
    expect(motion.rings).toBe(2);
  });

  it('spam-clicking for ten seconds never swings past the belfry limit', () => {
    const motion = createSchoolBellMotion();
    let accepted = 0;
    let peak = 0;
    for (let frame = 0; frame < 600; frame++) {
      const now = frame / 60;
      if (ringSchoolBell(motion, now)) accepted++;
      stepSchoolBell(motion, 1 / 60);
      peak = Math.max(peak, Math.abs(motion.angle));
    }
    expect(accepted).toBe(Math.ceil(10 / SCHOOL_BELL_COOLDOWN_S));
    expect(peak).toBeLessThanOrEqual(SCHOOL_BELL_MAX_ANGLE + 1e-6);
  });

  it('survives a long frame and a non-finite clock without blowing up', () => {
    const motion = createSchoolBellMotion();
    expect(ringSchoolBell(motion, Number.NaN)).toBe(false);
    ringSchoolBell(motion, 0);
    stepSchoolBell(motion, 30);
    expect(Number.isFinite(motion.angle)).toBe(true);
    expect(Math.abs(motion.angle)).toBeLessThanOrEqual(SCHOOL_BELL_MAX_ANGLE + 1e-6);
  });

  it('the clapper hangs back against the swing', () => {
    const motion = createSchoolBellMotion();
    ringSchoolBell(motion, 0);
    run(motion, 0.2);
    expect(Math.sign(schoolBellClapperAngle(motion))).toBe(-Math.sign(motion.angle));
    expect(Math.abs(schoolBellClapperAngle(motion))).toBeLessThan(Math.abs(motion.angle));
  });
});
