import { beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from './chronicleStore';
import { useOperationsCampaignStore, type ShiftCampaignReport } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { DEFAULT_CHARTER } from '../chronicle/charter';
import { createInitialState, fundOf } from '../chronicle/engine';
import { chronicleChance } from '../chronicle/rng';

describe('chronicle store gameplay', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
    useGameSimulationStore.getState().resolveCrisis();
  });

  it('lets a duct fire go when the plant stop it raised is gone after a reload', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const saved = {
      ...useChronicleStore.getState().chronicle,
      fire: { active: true, suppressing: false, resolveAtMinute: null },
    };
    // The game simulation never persists its crisis; the chronicle persists its fire.
    const merge = useChronicleStore.persist.getOptions().merge!;
    useChronicleStore.setState(
      merge({ chronicle: saved }, useChronicleStore.getState()) as ReturnType<
        typeof useChronicleStore.getState
      >
    );
    expect(useGameSimulationStore.getState().crisisState.active).toBe(false);
    const fund = fundOf(useChronicleStore.getState().chronicle);
    useChronicleStore.getState().observe(false);
    const chronicle = useChronicleStore.getState().chronicle;
    expect(chronicle.fire.active).toBe(false);
    expect(fundOf(chronicle)).toBe(fund);
  });

  it('lets a duct fire go when a game reset cleared its stop', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    useChronicleStore.setState((s) => ({
      chronicle: {
        ...s.chronicle,
        fire: { active: true, suppressing: false, resolveAtMinute: null },
      },
    }));
    useGameSimulationStore.getState().triggerCrisis('fire', 'high', { source: 'chronicle' });
    useChronicleStore.getState().observe(false);
    // The live fire stays while its stop holds.
    expect(useChronicleStore.getState().chronicle.fire.active).toBe(true);
    useGameSimulationStore.getState().resetGameState();
    useChronicleStore.getState().observe(false);
    expect(useChronicleStore.getState().chronicle.fire.active).toBe(false);
  });

  it('does not leave a fire notice standing when the fire stop could not start', () => {
    // A seed whose first close rolls a fire under long austerity.
    let seed = 1;
    while (chronicleChance(seed, 'fire', 1) >= 0.2) seed++;
    useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'no_trials' }, seed);
    useChronicleStore.setState((s) => ({
      chronicle: { ...s.chronicle, austerity: { active: true, shifts: 10 } },
    }));
    // A facility stop already holds the interlock, so the fire's crisis cannot start.
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    const report: ShiftCampaignReport = {
      id: 'period-report-gameplay-fire',
      shiftKey: 'day-1-fire',
      shiftLabel: 'Morning',
      startedAtMinute: 0,
      endedAtMinute: 480,
      metrics: {
        revenue: 0,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 0,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
      completedOrderIds: [],
      openRisks: [],
      grade: 'C',
      summary: '',
    };
    useOperationsCampaignStore.setState({ reports: [report] });
    useChronicleStore.getState().observe(false);
    useGameSimulationStore.getState().resolveEmergency();
    const chronicle = useChronicleStore.getState().chronicle;
    expect(chronicle.shift).toBe(1);
    expect(chronicle.fire.active).toBe(false);
    const fireNotice = chronicle.notices.findIndex(
      (n) => n.title === 'Smouldering dust in the extraction ducting'
    );
    expect(fireNotice).toBeGreaterThanOrEqual(0);
    // Whatever the log said about a fire stop, a later line says no fire is left.
    expect(
      chronicle.notices
        .slice(fireNotice + 1)
        .some((n) => n.kind === 'event' && /fire/i.test(n.body))
    ).toBe(true);
  });

  it('lets a level-2 AI partner answer a fire in the close that started it, so its dialog never flashes', () => {
    let seed = 1;
    while (chronicleChance(seed, 'fire', 1) >= 0.2) seed++;
    useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'no_trials' }, seed);
    useChronicleStore.setState((s) => ({
      chronicle: { ...s.chronicle, delegation: 2, austerity: { active: true, shifts: 10 } },
    }));
    const report: ShiftCampaignReport = {
      id: 'period-report-gameplay-ai-fire',
      shiftKey: 'day-1-ai-fire',
      shiftLabel: 'Morning',
      startedAtMinute: 0,
      endedAtMinute: 480,
      metrics: {
        revenue: 0,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 0,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
      completedOrderIds: [],
      openRisks: [],
      grade: 'C',
      summary: '',
    };
    useOperationsCampaignStore.setState({ reports: [report] });
    useChronicleStore.getState().observe(false);
    const chronicle = useChronicleStore.getState().chronicle;
    expect(chronicle.shift).toBe(1);
    expect(chronicle.fire.active).toBe(true);
    expect(useGameSimulationStore.getState().crisisState.type).toBe('fire');
    // The partner took it in the same pass: no tick ever shows an unanswered fire.
    expect(chronicle.fire.suppressing).toBe(true);
  });

  it('loads a chronicle that ended with a shortfall open without asking for it again', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const saved = {
      ...useChronicleStore.getState().chronicle,
      status: 'ended' as const,
      upkeepShortfall: 12,
    };
    const merge = useChronicleStore.persist.getOptions().merge!;
    const restored = merge({ chronicle: saved }, useChronicleStore.getState()) as ReturnType<
      typeof useChronicleStore.getState
    >;
    expect(restored.chronicle.status).toBe('ended');
    expect(restored.chronicle.upkeepShortfall).toBeNull();
  });

  it('loads a chronicle that ended mid-install without leaving the plan installing', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const saved = {
      ...useChronicleStore.getState().chronicle,
      status: 'ended' as const,
      improvements: [
        {
          id: 'members-library',
          phase: 'installing' as const,
          contractorId: null,
          startedShift: 61,
          completesShift: 64,
          paidFund: 70,
          effectScale: 1,
          initiatedBy: 'player' as const,
        },
      ],
    };
    const merge = useChronicleStore.persist.getOptions().merge!;
    const restored = merge({ chronicle: saved }, useChronicleStore.getState()) as ReturnType<
      typeof useChronicleStore.getState
    >;
    expect(restored.chronicle.improvements.filter((p) => p.phase === 'installing')).toEqual([]);
    expect(restored.chronicle.ledger.fund.refunds).toBe(70);
  });

  it('restores a save from before the since-close tally with one, so spending still records', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 23);
    const current = useChronicleStore.getState().chronicle;
    // The ledger as saved before the last close and the spending since it were kept apart.
    const oldLedger = {
      fund: current.ledger.fund,
      knowHow: current.ledger.knowHow,
      lastShiftFund: { reinvestment: 40, mitigation: -30 },
      lastShiftKnowHow: {},
    };
    const merge = useChronicleStore.persist.getOptions().merge!;
    const restored = merge(
      { chronicle: { ...current, ledger: oldLedger } },
      useChronicleStore.getState()
    ) as ReturnType<typeof useChronicleStore.getState>;
    expect(restored.chronicle.ledger.sinceCloseFund).toEqual({});
    expect(restored.chronicle.ledger.sinceCloseKnowHow).toEqual({});
    // That tally mixed the close with spending after it, so it is not shown as the close's.
    expect(restored.chronicle.ledger.lastShiftFund).toEqual({});
    expect(restored.chronicle.ledger.fund).toEqual(current.ledger.fund);
  });
});
