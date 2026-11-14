/**
 * The mill's outside view turns its rolls at the break differential the
 * cutaway teaches (machineInspectionGeometry), not at equal speeds.
 */
import { describe, expect, it } from 'vitest';
import { millRollerSpin } from './CompactMachines';
import { BREAK_ROLL_DIFFERENTIAL } from '../../stores/millingSources';
import { millBackRollAngle, millFrontRollAngle } from './machineInspectionGeometry';

describe("the outside view's rolls", () => {
  it('turn 2.5 to 1, in opposite directions, as the cutaway does', () => {
    const fast = millRollerSpin(10, 0) - millRollerSpin(0, 0);
    const slow = millRollerSpin(10, 1) - millRollerSpin(0, 1);
    expect(Math.sign(fast)).toBe(-Math.sign(slow));
    expect(Math.abs(fast / slow)).toBeCloseTo(BREAK_ROLL_DIFFERENTIAL, 9);
    expect(Math.abs(fast / slow)).toBeCloseTo(
      Math.abs(millFrontRollAngle(10) / millBackRollAngle(10)),
      9
    );
  });
});
