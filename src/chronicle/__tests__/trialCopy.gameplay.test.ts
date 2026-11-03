import { describe, expect, it } from 'vitest';
import { advanceTrial, emptyTrialProgress, trialById } from '../trials';

// An order's last residual can be a fraction of a kilogram, and any failed kg
// fails a no-failure trial. Rounded to whole kg, its reason read "0 kg failed".
describe('trial failure copy', () => {
  it('names a sub-kilogram quality failure as more than nothing', () => {
    const definition = trialById('wet_harvest');
    const failed = advanceTrial(
      definition,
      { ...emptyTrialProgress(definition.id), phase: 'active', startedShift: 1 },
      {
        dispatchedKg: 400,
        qualityFailureKg: 0.3,
        energyCost: 0,
        grade: 'B',
        qcPassedThisShift: false,
        unresolvedHighIncident: false,
      }
    );
    expect(failed.phase).toBe('failed');
    expect(failed.failureReason).toBe('0.3 kg failed its recipe quality threshold.');
  });

  it('keeps whole kilograms for larger failures', () => {
    const definition = trialById('wet_harvest');
    const failed = advanceTrial(
      definition,
      { ...emptyTrialProgress(definition.id), phase: 'active', startedShift: 1 },
      {
        dispatchedKg: 400,
        qualityFailureKg: 120.4,
        energyCost: 0,
        grade: 'B',
        qcPassedThisShift: false,
        unresolvedHighIncident: false,
      }
    );
    expect(failed.failureReason).toBe('120 kg failed its recipe quality threshold.');
  });
});
