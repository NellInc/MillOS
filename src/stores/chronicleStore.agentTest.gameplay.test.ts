/**
 * Close-out 3 of plan item 7c: whose lab test earns in the Chronicle. Only a
 * test the player ran (the Overview's Test button, OPERATOR_CONTROL_SOURCE)
 * earns know-how and standing. A test any other hand ran, the bench's own, an
 * agent's or the AI partner's, is the plant's work done for the player and
 * earns nothing, whatever it records as its source: a test with none records
 * the bench's. Driven through the real lab store and the store's evidence.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from './chronicleStore';
import { useOperationsCampaignStore, type ShiftCampaignReport } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { OPERATOR_CONTROL_SOURCE, useQCLabStore } from './qcLabStore';
import { DEFAULT_CHARTER } from '../chronicle/charter';
import { createInitialState } from '../chronicle/engine';

let reportSequence = 0;
function closeReport(): void {
  reportSequence += 1;
  const report: ShiftCampaignReport = {
    id: `period-report-agent-test-${reportSequence}`,
    shiftKey: `day-${reportSequence}-agent`,
    shiftLabel: 'Morning',
    startedAtMinute: (reportSequence - 1) * 480,
    endedAtMinute: reportSequence * 480,
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
    grade: null,
    summary: '',
  };
  useOperationsCampaignStore.setState((s) => ({ reports: [...s.reports, report] }));
  useChronicleStore.getState().observe(false);
}

/** A passed test of a batch, recorded under `source` (none: the store's default). */
function test(batchId: string, source?: string): void {
  const qc = useQCLabStore.getState();
  qc.startQCTest('packer-0', {
    batchId,
    testType: 'initial',
    ...(source ? { controlSource: source } : {}),
  });
  qc.completeQCTest({
    machineId: 'packer-0',
    batchId,
    ...(source ? { controlSource: source } : {}),
    grade: 'A',
    moistureContent: 14,
    proteinLevel: 12,
    ashContent: 0.5,
    particleSize: 150,
    passed: true,
  });
}

const qcKnowHow = () => useChronicleStore.getState().chronicle.ledger.lastShiftKnowHow.qc ?? 0;

describe('whose lab test earns', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useQCLabStore.getState().resetQCLab();
    useChronicleStore.setState({ chronicle: createInitialState() });
    useGameSimulationStore.getState().resolveCrisis();
    reportSequence = 0;
    useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
  });

  it("earns for the player's own test", () => {
    test('batch-player', OPERATOR_CONTROL_SOURCE);
    closeReport();
    expect(qcKnowHow()).toBe(1);
  });

  it('earns nothing for an agent’s or the partner’s test, or one with no source', () => {
    test('batch-agent', 'Agent');
    test('batch-partner', 'AI partner');
    test('batch-none');
    closeReport();
    expect(qcKnowHow()).toBe(0);
  });
});
