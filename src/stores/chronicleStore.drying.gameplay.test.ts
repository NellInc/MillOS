/**
 * Grid Winter against the temper card's drying (plan item 7.7). Drying a wet
 * year's wheat books energy; a wet year can fall in Grid Winter's window (year
 * four is wet for 178, 378 and 570 of 2,000 charter seeds under cooperative,
 * open-market and marginal grain), and the trial's cap was set on a plant that
 * dries nothing. So a trial's energy goal reads the close's energy less the
 * drying the temper answers reported since the last close.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from './chronicleStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { energyTariffPerKwh } from '../utils/energyCalculations';
import { DEFAULT_CHARTER } from '../chronicle/charter';
import { closeShift, createInitialState, signCharter, trialEnergyCost } from '../chronicle/engine';
import { EVENT_DECK } from '../chronicle/eventDeck';
import { emptyTrialProgress } from '../chronicle/trials';
import { pinEvidence } from '../chronicle/__tests__/chronicleRun';

afterEach(() => useChronicleStore.setState(useChronicleStore.getInitialState(), true));

function wetChronicle() {
  const signed = signCharter(createInitialState(), { ...DEFAULT_CHARTER }, 11, {
    reportId: null,
    qcTestIds: [],
    challengeIds: [],
    orders: [],
  }).state;
  return { ...signed, crop: { index: 1, kind: 'wet' as const, treated: false } };
}

describe('the temper card’s drying and a trial’s energy', () => {
  it('keeps the drying each dry-first answer reports until the close, and nothing for the standard temper', () => {
    useChronicleStore.setState({ chronicle: wetChronicle() });
    const store = useChronicleStore.getState();
    expect(store.answerTemper('dry-first', 100, 61.5)).toBe(true);
    expect(useChronicleStore.getState().chronicle.dryingSinceClose).toBe(61.5);
    useChronicleStore.getState().answerTemper('dry-first', 600, 40);
    useChronicleStore.getState().answerTemper('standard', 700, 99);
    useChronicleStore.getState().answerTemper('dry-first', 800, Number.NaN);
    expect(useChronicleStore.getState().chronicle.dryingSinceClose).toBe(101.5);
    // An answer from a caller that reports no cost changes the temper only.
    useChronicleStore.getState().answerTemper('dry-first', 900);
    expect(useChronicleStore.getState().chronicle.dryingSinceClose).toBe(101.5);
    expect(useChronicleStore.getState().chronicle.crop?.temper?.schedule.at(-1)?.option).toBe(
      'dry-first'
    );
  });

  it('judges Grid Winter on the booked energy less the drying, then counts afresh', () => {
    const base = wetChronicle();
    const active = {
      ...base,
      trials: base.trials.map((trial) =>
        trial.id === 'grid_winter'
          ? { ...emptyTrialProgress('grid_winter'), phase: 'active' as const, startedShift: 0 }
          : trial
      ),
      dryingSinceClose: 70,
    };
    const evidence = pinEvidence(11, 0, 20_000);
    const booked = evidence.report.metrics.energyCost;
    const first = closeShift(active, evidence, EVENT_DECK).state;
    const grid = first.trials.find((trial) => trial.id === 'grid_winter')!;
    expect(grid.energyCost).toBe(booked - 70);
    expect(first.dryingSinceClose).toBeUndefined();
    const second = closeShift(first, pinEvidence(11, 1, 20_000), EVENT_DECK).state;
    const after = second.trials.find((trial) => trial.id === 'grid_winter')!;
    expect(after.energyCost - grid.energyCost).toBe(
      pinEvidence(11, 1, 20_000).report.metrics.energyCost
    );
  });

  // Review 2, finding 1: the plans were credited for drying they never scaled.
  it('credits energy plans on the energy without the drying', () => {
    const planned = {
      ...wetChronicle(),
      improvements: (['wind-turbine', 'heat-recovery'] as const).map((id) => ({
        id,
        phase: 'installed' as const,
        contractorId: null,
        startedShift: 0,
        completesShift: 0,
        paidFund: 0,
        effectScale: 1,
        initiatedBy: 'player' as const,
      })),
    };
    const plain = pinEvidence(11, 0, 20_000);
    const dried = {
      ...plain,
      report: {
        ...plain.report,
        metrics: { ...plain.report.metrics, energyCost: plain.report.metrics.energyCost + 95 },
      },
    };
    const saved = (state: typeof planned) =>
      Object.values(state.planSavings ?? {}).reduce((sum, s) => sum + s.last, 0);
    const without = closeShift(planned, plain, EVENT_DECK).state;
    const withDrying = closeShift({ ...planned, dryingSinceClose: 95 }, dried, EVENT_DECK).state;
    expect(saved(without)).toBeGreaterThan(0);
    expect(saved(withDrying)).toBeCloseTo(saved(without), 6);
  });

  // Review 2, finding 2: what a hired dryer or blending keeps off the books is
  // credited to the fund in full at the close, as a plan's avoided cost is.
  it('credits the drying a Chronicle answer kept off the books, then counts afresh', () => {
    const modifier = (dryingEnergy: number) => ({
      ...wetChronicle(),
      modifiers: [
        { id: 'm1', sourceId: 'e1', label: 'Mobile dryer', dryingEnergy, remainingShifts: 3 },
      ],
    });
    useGameSimulationStore.setState({ gameTime: 10 });
    useChronicleStore.setState({ chronicle: modifier(0) });
    useChronicleStore.getState().answerTemper('dry-first', 100, 0, 800);
    const hired = useChronicleStore.getState().chronicle;
    expect(hired.dryingAvoidedSinceClose).toBeCloseTo(800 * energyTariffPerKwh(600), 6);
    expect(hired.dryingSinceClose).toBeUndefined();
    useChronicleStore.setState({ chronicle: modifier(0.5) });
    useChronicleStore.getState().answerTemper('dry-first', 100, 40, 700);
    expect(useChronicleStore.getState().chronicle.dryingAvoidedSinceClose).toBeCloseTo(40, 6);
    // The standard temper dries nothing, so it avoids nothing.
    useChronicleStore.setState({ chronicle: modifier(0) });
    useChronicleStore.getState().answerTemper('standard', 100, 0, 800);
    expect(useChronicleStore.getState().chronicle.dryingAvoidedSinceClose).toBeUndefined();
    // The close credits it under its own source and clears it.
    const before = hired.ledger.fund.drying;
    const closed = closeShift(hired, pinEvidence(11, 0, 20_000), EVENT_DECK).state;
    expect(closed.ledger.fund.drying - before).toBeCloseTo(
      Math.round(800 * energyTariffPerKwh(600) * 100) / 100,
      6
    );
    expect(closed.dryingAvoidedSinceClose).toBeUndefined();
  });

  it('never reads drying as more than the energy booked, nor a bad figure as drying', () => {
    expect(trialEnergyCost(150, 200)).toBe(0);
    expect(trialEnergyCost(150, undefined)).toBe(150);
    expect(trialEnergyCost(150, Number.NaN)).toBe(150);
    expect(trialEnergyCost(150, -20)).toBe(150);
  });
});
