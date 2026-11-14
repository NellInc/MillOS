/**
 * Review 2, finding 3: the wheat figure a "dry first" answer already given
 * makes reachable once its grain reaches the rolls, read by the rolls' own
 * rule (chronicle/temper.ts temperAt), so a later answer that supersedes it
 * is honoured.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { wheatReachableOnceDried } from '../UnifiedGameTick';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import type { LotStampContext } from '../../simulation/lotQuality';
import type { TemperState } from '../../chronicle/types';

const context = (temper: TemperState): LotStampContext => ({
  crop: { index: 1, kind: 'wet', treated: false, temper },
  relieved: [],
  otherPenalty: 0,
  cropOf: () => undefined,
});

beforeEach(() => useMaterialFlowStore.getState().resetMaterialFlow());

describe('the wheat a drying answer in its rest makes reachable', () => {
  it('reads the dried grain from the minute it reaches the rolls', () => {
    const dried = wheatReachableOnceDried(
      context({
        inForce: 'standard',
        schedule: [{ option: 'dry-first', fromMinute: 300, untilMinute: 780 }],
      }),
      200
    );
    expect(dried?.fromMinute).toBe(300);
    // The wet year's 5 points are off: 95 is reachable again.
    expect(dried!.figure).toBeGreaterThanOrEqual(95);
  });

  it('a drying that still cannot make 95 (another penalty on the grain) reads below it, so it holds no forfeit', () => {
    const dried = wheatReachableOnceDried(
      {
        ...context({
          inForce: 'standard',
          schedule: [{ option: 'dry-first', fromMinute: 300, untilMinute: 780 }],
        }),
        otherPenalty: 6,
      },
      200
    );
    // forfeitWorld waits only for a figure that meets the order's minimum.
    expect(dried!.figure).toBeLessThan(95);
  });

  it('counts the minute it reaches the rolls, before the tick steps it in force', () => {
    const at = wheatReachableOnceDried(
      context({
        inForce: 'standard',
        schedule: [{ option: 'dry-first', fromMinute: 300, untilMinute: 780 }],
      }),
      300
    );
    expect(at?.fromMinute).toBe(300);
  });

  it('nothing when it is already at the rolls, has passed, or a later answer supersedes it', () => {
    const dry = { option: 'dry-first' as const, fromMinute: 300, untilMinute: 780 };
    expect(wheatReachableOnceDried(context({ inForce: 'dry-first', schedule: [dry] }), 400)).toBe(
      null
    );
    expect(wheatReachableOnceDried(context({ inForce: 'standard', schedule: [dry] }), 800)).toBe(
      null
    );
    // A standard answer covering the dry one's start: the rolls take it instead.
    const standard = { option: 'standard' as const, fromMinute: 250, untilMinute: 730 };
    expect(
      wheatReachableOnceDried(context({ inForce: 'standard', schedule: [dry, standard] }), 200)
    ).toBe(null);
    expect(wheatReachableOnceDried(null, 200)).toBe(null);
  });
});
