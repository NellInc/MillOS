import { describe, expect, it, vi } from 'vitest';
import type { ShiftCampaignReport } from './operationsCampaignStore';

function report(index: number): ShiftCampaignReport {
  return {
    id: `period-report-reload-${index}`,
    shiftKey: `day-1-${index}`,
    shiftLabel: 'Morning',
    startedAtMinute: (index - 1) * 480,
    endedAtMinute: index * 480,
    metrics: {
      revenue: 2000,
      energyCost: 0,
      automationCost: 0,
      wasteCost: 0,
      maintenanceCost: 0,
      demurrageCost: 0,
      latePenalties: 0,
      dispatchedKg: 3000,
      qualityFailureKg: 0,
      incidentsResolved: 0,
      automaticActions: 0,
      commitmentMinutes: 0,
    },
    completedOrderIds: [],
    openRisks: [],
    grade: 'A',
    summary: '',
  };
}

/** A fresh page: new module state, the chronicle's persisted slice merged back in. */
async function freshPage(persisted: unknown) {
  vi.resetModules();
  const chronicle = await import('./chronicleStore');
  const campaign = await import('./operationsCampaignStore');
  const store = chronicle.useChronicleStore;
  const merge = store.persist.getOptions().merge!;
  store.setState(merge(persisted, store.getState()) as ReturnType<typeof store.getState>);
  return {
    useChronicleStore: store,
    useOperationsCampaignStore: campaign.useOperationsCampaignStore,
  };
}

describe('chronicle store across a reload', () => {
  it('does not credit a shift twice when the page reloads during a replay that rewound the plant', async () => {
    const first = await freshPage(null);
    first.useOperationsCampaignStore.getState().resetCampaign();
    const { DEFAULT_CHARTER } = await import('../chronicle/charter');
    first.useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
    // Two real shifts close and are credited.
    for (const index of [1, 2]) {
      first.useOperationsCampaignStore.setState((s) => ({
        reports: [...s.reports, report(index)],
      }));
      first.useChronicleStore.getState().observe(false);
    }
    expect(first.useChronicleStore.getState().chronicle.shift).toBe(2);
    // A replay restores the plant to a checkpoint from before the second shift
    // and owns the clock; the chronicle re-baselines on the rewound report.
    first.useOperationsCampaignStore.setState({ reports: [report(1)] });
    first.useChronicleStore.getState().observe(true);
    expect(first.useChronicleStore.getState().chronicle.shift).toBe(2);

    // The page reloads mid-replay. The physical session was not written during
    // the replay, so the plant comes back as it was before it: both shifts.
    const persist = first.useChronicleStore.persist.getOptions();
    const saved = JSON.parse(
      JSON.stringify(persist.partialize!(first.useChronicleStore.getState()))
    );
    const second = await freshPage(saved);
    second.useOperationsCampaignStore.setState({ reports: [report(1), report(2)] });
    second.useChronicleStore.getState().observe(false);

    // The second shift was credited once already; the reload must not close it again.
    expect(second.useChronicleStore.getState().chronicle.shift).toBe(2);
  });

  it('does not credit a shift twice when the plant restores from a save taken before it closed', async () => {
    const first = await freshPage(null);
    first.useOperationsCampaignStore.getState().resetCampaign();
    const { DEFAULT_CHARTER } = await import('../chronicle/charter');
    first.useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
    for (const index of [1, 2, 3]) {
      first.useOperationsCampaignStore.setState((s) => ({
        reports: [...s.reports, report(index)],
      }));
      first.useChronicleStore.getState().observe(false);
    }
    expect(first.useChronicleStore.getState().chronicle.shift).toBe(3);
    const fundBefore = first.useChronicleStore.getState().chronicle.ledger.fund.reinvestment;
    const persist = first.useChronicleStore.persist.getOptions();
    const saved = JSON.parse(
      JSON.stringify(persist.partialize!(first.useChronicleStore.getState()))
    );

    // The tab died before the plant's paced autosave caught up: it comes back
    // from a save taken in the second window. The chronicle saved at once.
    const second = await freshPage(saved);
    second.useOperationsCampaignStore.setState({ reports: [report(1)] });
    second.useChronicleStore.getState().observe(false);
    // The second and third windows close again, each a tick later than the
    // first time and under a new logbook sequence.
    const again = (index: number, late: number) => ({
      ...report(index),
      id: `period-report-again-${index}`,
      startedAtMinute: (index - 1) * 480 + (index > 2 ? late : 0),
      endedAtMinute: index * 480 + late,
    });
    for (const index of [2, 3]) {
      second.useOperationsCampaignStore.setState((s) => ({
        reports: [...s.reports, again(index, 0.5)],
      }));
      second.useChronicleStore.getState().observe(false);
    }
    expect(second.useChronicleStore.getState().chronicle.shift).toBe(3);
    expect(second.useChronicleStore.getState().chronicle.ledger.fund.reinvestment).toBe(fundBefore);

    // The first window past the restored history is new, and is credited once.
    second.useOperationsCampaignStore.setState((s) => ({
      reports: [...s.reports, { ...report(4), startedAtMinute: 1440.5 }],
    }));
    second.useChronicleStore.getState().observe(false);
    expect(second.useChronicleStore.getState().chronicle.shift).toBe(4);
  });

  it('credits the next window after a restored close that landed a tick early', async () => {
    const first = await freshPage(null);
    first.useOperationsCampaignStore.getState().resetCampaign();
    const { DEFAULT_CHARTER } = await import('../chronicle/charter');
    first.useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
    for (const index of [1, 2]) {
      first.useOperationsCampaignStore.setState((s) => ({
        reports: [...s.reports, report(index)],
      }));
      first.useChronicleStore.getState().observe(false);
    }
    const persist = first.useChronicleStore.persist.getOptions();
    const saved = JSON.parse(
      JSON.stringify(persist.partialize!(first.useChronicleStore.getState()))
    );
    const second = await freshPage(saved);
    second.useOperationsCampaignStore.setState({ reports: [report(1)] });
    second.useChronicleStore.getState().observe(false);
    second.useOperationsCampaignStore.setState((s) => ({
      reports: [...s.reports, { ...report(2), id: 'period-report-early-2', endedAtMinute: 959.5 }],
    }));
    second.useChronicleStore.getState().observe(false);
    expect(second.useChronicleStore.getState().chronicle.shift).toBe(2);
    second.useOperationsCampaignStore.setState((s) => ({
      reports: [...s.reports, { ...report(3), startedAtMinute: 959.5 }],
    }));
    second.useChronicleStore.getState().observe(false);
    expect(second.useChronicleStore.getState().chronicle.shift).toBe(3);
  });

  it('still keeps a shift closed during an improvement trial out of the record after a reload', async () => {
    const first = await freshPage(null);
    first.useOperationsCampaignStore.getState().resetCampaign();
    const { DEFAULT_CHARTER } = await import('../chronicle/charter');
    first.useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
    first.useOperationsCampaignStore.setState({ reports: [report(1)] });
    first.useChronicleStore.getState().observe(false);
    // A trial owns the clock and the plant keeps saving: its shift is not history.
    first.useOperationsCampaignStore.setState({ reports: [report(1), report(2)] });
    first.useChronicleStore.getState().observe(true);
    const persist = first.useChronicleStore.persist.getOptions();
    const saved = JSON.parse(
      JSON.stringify(persist.partialize!(first.useChronicleStore.getState()))
    );
    const second = await freshPage(saved);
    second.useOperationsCampaignStore.setState({ reports: [report(1), report(2)] });
    second.useChronicleStore.getState().observe(false);
    expect(second.useChronicleStore.getState().chronicle.shift).toBe(1);
  });
});
