/**
 * Plan item 1.1: the Overview panel's Test button can be pressed without limit
 * on a released batch, and each press is a new lab test. The Chronicle credits
 * a batch's pass once in the chronicle, for know-how and certifier standing.
 * Driven through the real lab store and the store's own evidence.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from './chronicleStore';
import { useOperationsCampaignStore, type ShiftCampaignReport } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { OPERATOR_CONTROL_SOURCE, useQCLabStore } from './qcLabStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { DEFAULT_CHARTER } from '../chronicle/charter';
import { createInitialState } from '../chronicle/engine';

let reportSequence = 0;
function closeReport(): void {
  reportSequence += 1;
  const report: ShiftCampaignReport = {
    id: `period-report-qc-credit-${reportSequence}`,
    shiftKey: `day-${reportSequence}-qc`,
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

/** One press of the Overview panel's Test button on a released batch. */
function pressTest(batchId: string, passed = true): void {
  const qc = useQCLabStore.getState();
  // The button's source (OverviewPanel runConformingTest); a test with none
  // takes the bench's, which earns nothing in the Chronicle (fix-up d).
  qc.startQCTest('packer-0', {
    batchId,
    testType: 'initial',
    controlSource: OPERATOR_CONTROL_SOURCE,
  });
  qc.completeQCTest({
    machineId: 'packer-0',
    batchId,
    controlSource: OPERATOR_CONTROL_SOURCE,
    grade: passed ? 'A' : 'FAIL',
    moistureContent: 14,
    proteinLevel: 12,
    ashContent: 0.5,
    particleSize: 150,
    passed,
  });
}

const qcKnowHowLastClose = () =>
  useChronicleStore.getState().chronicle.ledger.lastShiftKnowHow.qc ?? 0;
// Passes reach standing at the certifier's review (item 4.9); count what awaits it.
const standingScore = () => {
  const { certifier } = useChronicleStore.getState().chronicle;
  return certifier.score + (certifier.review?.hundredths ?? 0);
};

describe('lab pass credit', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useQCLabStore.getState().resetQCLab();
    useChronicleStore.setState({ chronicle: createInitialState() });
    useGameSimulationStore.getState().resolveCrisis();
    reportSequence = 0;
    useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
  });

  it('credits twenty passed tests of one batch in one shift as one pass', () => {
    const before = standingScore();
    for (let i = 0; i < 20; i++) pressTest('batch-farm');
    closeReport();
    expect(useChronicleStore.getState().chronicle.shift).toBe(1);
    expect(qcKnowHowLastClose()).toBe(1);
    expect(standingScore() - before).toBe(8);
  });

  it('credits two batches as two passes', () => {
    const before = standingScore();
    for (let i = 0; i < 10; i++) {
      pressTest('batch-a');
      pressTest('batch-b');
    }
    closeReport();
    expect(qcKnowHowLastClose()).toBe(2);
    expect(standingScore() - before).toBe(16);
  });

  it('does not pay the uncredited presses on a later close', () => {
    for (let i = 0; i < 20; i++) pressTest('batch-farm');
    closeReport();
    const before = standingScore();
    closeReport();
    expect(useChronicleStore.getState().chronicle.shift).toBe(2);
    expect(qcKnowHowLastClose()).toBe(0);
    expect(standingScore()).toBe(before);
  });

  it('credits a batch once across the chronicle, not once per shift', () => {
    pressTest('batch-again');
    closeReport();
    expect(qcKnowHowLastClose()).toBe(1);
    const before = standingScore();
    for (let i = 0; i < 5; i++) pressTest('batch-again');
    closeReport();
    expect(useChronicleStore.getState().chronicle.shift).toBe(2);
    expect(qcKnowHowLastClose()).toBe(0);
    expect(standingScore()).toBe(before);
  });

  it('credits a batch id again only when a new plant run reissues it', () => {
    pressTest('batch-00001');
    closeReport();
    expect(qcKnowHowLastClose()).toBe(1);
    // The plant starts afresh (a session that could not be restored) while the
    // chronicle carries on: its counters restart and reissue the same batch id.
    useMaterialFlowStore.getState().resetMaterialFlow();
    pressTest('batch-00001');
    closeReport();
    expect(qcKnowHowLastClose()).toBe(1);
  });

  it('loads a save from before batches were recorded without paying its batches again', () => {
    pressTest('batch-paid');
    closeReport();
    expect(qcKnowHowLastClose()).toBe(1);
    // The save as an older build wrote it: no credited-batch record at all.
    const saved = JSON.parse(JSON.stringify(useChronicleStore.getState().chronicle));
    delete saved.creditedQcBatchIds;
    useChronicleStore.setState({ chronicle: createInitialState() });
    const merge = useChronicleStore.persist.getOptions().merge!;
    useChronicleStore.setState(
      merge({ chronicle: saved }, useChronicleStore.getState()) as ReturnType<
        typeof useChronicleStore.getState
      >
    );
    expect(useChronicleStore.getState().chronicle.shift).toBe(1);
    const before = standingScore();
    pressTest('batch-paid');
    pressTest('batch-unpaid');
    closeReport();
    expect(qcKnowHowLastClose()).toBe(1);
    expect(standingScore() - before).toBe(8);
    const run = useMaterialFlowStore.getState().sessionId;
    expect(useChronicleStore.getState().chronicle.creditedQcBatchIds).toEqual([
      `${run}:batch-paid`,
      `${run}:batch-unpaid`,
    ]);
    // A damaged record is repaired to the batches it can read.
    const damaged = merge(
      { chronicle: { ...saved, creditedQcBatchIds: ['batch-x', 7, null] } },
      useChronicleStore.getState()
    ) as ReturnType<typeof useChronicleStore.getState>;
    expect(damaged.chronicle.creditedQcBatchIds).toEqual(['batch-x']);
  });

  it('credits a batch that failed and then passed once', () => {
    pressTest('batch-retest', false);
    pressTest('batch-retest', true);
    closeReport();
    expect(qcKnowHowLastClose()).toBe(1);
  });

  it('keeps a chronicle saved before batch-keyed credit loading and crediting', () => {
    // Lab history from before the save, already seen by the saved chronicle.
    for (let i = 0; i < 3; i++) pressTest('batch-old');
    const oldIds = useQCLabStore
      .getState()
      .qcLab.testHistory.map((test) => `${test.id}@${new Date(test.timestamp).getTime()}`);
    const saved = JSON.parse(
      JSON.stringify({ ...useChronicleStore.getState().chronicle, seenQcTestIds: oldIds })
    );
    useChronicleStore.setState({ chronicle: createInitialState() });
    const merge = useChronicleStore.persist.getOptions().merge!;
    useChronicleStore.setState(
      merge({ chronicle: saved }, useChronicleStore.getState()) as ReturnType<
        typeof useChronicleStore.getState
      >
    );
    expect(useChronicleStore.getState().chronicle.seenQcTestIds).toEqual(oldIds);
    const before = standingScore();
    for (let i = 0; i < 5; i++) pressTest('batch-new');
    closeReport();
    expect(useChronicleStore.getState().chronicle.shift).toBe(1);
    expect(qcKnowHowLastClose()).toBe(1);
    expect(standingScore() - before).toBe(8);
  });
});
