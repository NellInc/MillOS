import { describe, expect, it } from 'vitest';
import { describeShiftTryNext, shiftGradeBasis } from './shiftReview';
import { playableShiftMessages } from '../components/ui-new/onboarding/PlayableShift.messages';

/*
 * Plan item 1.15 (report 02, defect 3): the review's quality advice names where
 * the order's recipe minimum is shown. Overview shows no recipe target; the
 * guided delivery does ("Recipe quality target: 95/100."), and the shift card's
 * Replay guided delivery opens it for the active order.
 */

const failedQuality = shiftGradeBasis(
  {
    revenue: 4000,
    energyCost: 100,
    automationCost: 100,
    wasteCost: 0,
    maintenanceCost: 0,
    demurrageCost: 0,
    latePenalties: 0,
    dispatchedKg: 5000,
    qualityFailureKg: 5000,
    incidentsResolved: 0,
    automaticActions: 0,
    commitmentMinutes: 240,
  },
  [],
  []
);

describe('quality advice names a real surface (1.15)', () => {
  it.each(['en', 'pt-BR'] as const)('%s: names Replay guided delivery, not Overview', (locale) => {
    const advice = describeShiftTryNext(failedQuality, 'F', locale)!;
    expect(advice).toContain(playableShiftMessages[locale].replayGuide);
    expect(advice).not.toMatch(locale === 'en' ? /Overview/ : /Visão geral/);
  });
});
