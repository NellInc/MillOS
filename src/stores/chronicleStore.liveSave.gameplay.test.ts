import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ShiftCampaignReport } from './operationsCampaignStore';

// A real mid-charter save written by the build served at www.millos.net before
// this one replaced it (v0.40-bb1932312f8a, commit bb193231 of 9 November),
// captured headless from the live site on 13 November: the default charter
// signed, the first event answered, moisture meters installing, shifts closed.
// The plant's save of the same moment is restored by physicalSession.test.ts once
// its fixture is in place; here the plant's report log is reduced to the last
// report the chronicle credited.
// Working if a player's charter carries over: same shift, same fund, the full
// 63 shifts, the install still under way, and the next close credits once.
const CHRONICLE_SAVE = join(
  __dirname,
  '__tests__/fixtures/chronicle-saves/2026-11-09-bb193231-mid-charter.json'
);

const raw = readFileSync(CHRONICLE_SAVE, 'utf8');
const live = JSON.parse(raw) as {
  version: number;
  state: { chronicle: Record<string, unknown> & { ledger: { fund: Record<string, number> } } };
};
const liveChronicle = live.state.chronicle;
const sum = (fund: Record<string, number>) => Object.values(fund).reduce((a, b) => a + b, 0);

/**
 * A fresh page whose storage holds the live save. Under test the persist storage
 * is in memory (storage.ts), so the save is put there, and rehydration reads it
 * through the persist envelope and version check as the page does.
 */
async function freshPage() {
  vi.resetModules();
  const { safeJSONStorage } = await import('./storage');
  const { useChronicleStore } = await import('./chronicleStore');
  const { useOperationsCampaignStore } = await import('./operationsCampaignStore');
  await safeJSONStorage.setItem('millos-chronicle', JSON.parse(raw));
  await useChronicleStore.persist.rehydrate();
  useOperationsCampaignStore.getState().resetCampaign();
  useOperationsCampaignStore.setState({ reports: [lastCredited()] });
  return { useChronicleStore, useOperationsCampaignStore };
}

/** The report the chronicle last credited, as its id and end minute were saved. */
function lastCredited(): ShiftCampaignReport {
  return {
    id: String(liveChronicle.lastReportId),
    shiftKey: 'day-1-morning',
    shiftLabel: 'Morning',
    startedAtMinute: Number(liveChronicle.lastReportEndedAt) - 480,
    endedAtMinute: Number(liveChronicle.lastReportEndedAt),
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
    grade: 'B',
    summary: '',
  };
}

describe('a mid-charter Chronicle save from the live v0.40 build', () => {
  it('is the shape this build has to read', () => {
    expect(live.version).toBe(1);
    expect(liveChronicle.status).toBe('active');
    expect(liveChronicle.charter).not.toHaveProperty('length');
    expect(liveChronicle).toHaveProperty('desks');
  });

  it('keeps the charter: shift, fund, length, install, the answered event and its modifier', async () => {
    const { useChronicleStore } = await freshPage();
    const state = useChronicleStore.getState().chronicle;
    expect(state.status).toBe('active');
    expect(state.shift).toBe(liveChronicle.shift);
    // D-083: a saved fund keeps its number, read as currency. Lines added since
    // (avoided costs, item 4.3) start at nothing.
    expect(state.ledger.fund).toEqual({ ...state.ledger.fund, ...liveChronicle.ledger.fund });
    expect(sum(state.ledger.fund)).toBe(sum(liveChronicle.ledger.fund));
    // D-084: a charter saved before lengths is the full 63 shifts.
    expect(state.charter).not.toHaveProperty('length');
    const { chronicleShifts } = await import('../chronicle/schedule');
    expect(chronicleShifts(state.charter)).toBe(63);
    // D10: the desks of attention are gone.
    expect(state).not.toHaveProperty('desks');
    expect(state.improvements).toEqual(liveChronicle.improvements);
    expect(state.modifiers).toEqual(liveChronicle.modifiers);
    expect(state.eventHistory).toEqual(liveChronicle.eventHistory);
    expect(state.lastReportId).toBe(liveChronicle.lastReportId);
  });

  it('does not close the restored shift again, and credits the next close once', async () => {
    const { useChronicleStore, useOperationsCampaignStore } = await freshPage();
    const shift = useChronicleStore.getState().chronicle.shift;
    const latest = useOperationsCampaignStore.getState().reports.at(-1)!;
    expect(latest.id).toBe(liveChronicle.lastReportId);
    useChronicleStore.getState().observe(false);
    expect(useChronicleStore.getState().chronicle.shift).toBe(shift);

    const span = latest.endedAtMinute - latest.startedAtMinute;
    useOperationsCampaignStore.setState((s) => ({
      reports: [
        ...s.reports,
        {
          ...latest,
          id: 'period-report-after-restore',
          startedAtMinute: latest.endedAtMinute,
          endedAtMinute: latest.endedAtMinute + span,
        },
      ],
    }));
    useChronicleStore.getState().observe(false);
    useChronicleStore.getState().observe(false);
    const next = useChronicleStore.getState().chronicle;
    expect(next.status).toBe('active');
    expect(next.shift).toBe(shift + 1);
    expect(Number.isFinite(sum(next.ledger.fund))).toBe(true);
  });

  it('refunds a restored install exactly what the live build charged for it', async () => {
    const { useChronicleStore } = await freshPage();
    const installing = useChronicleStore
      .getState()
      .chronicle.improvements.find((p) => p.phase === 'installing')!;
    expect(installing).toBeDefined();
    const before = sum(useChronicleStore.getState().chronicle.ledger.fund);
    useChronicleStore.getState().cancel(installing.id);
    const after = useChronicleStore.getState().chronicle;
    expect(after.improvements.find((p) => p.id === installing.id)?.phase).toBe('planned');
    expect(sum(after.ledger.fund)).toBe(before + installing.paidFund);
  });
});
