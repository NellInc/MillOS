/**
 * Plan item 1.1: a batch's lab pass earns know-how and certifier standing once
 * in the whole chronicle, however often or in however many shifts it is
 * retested. A test with no batch is keyed by its own id.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CHARTER } from '../charter';
import {
  closeShift,
  createInitialState,
  signCharter,
  type ChronicleState,
  type ShiftCloseEvidence,
} from '../engine';
import { KNOW_HOW_SOURCE_LABELS, localizedSourceLabels } from '../ledger';
import { emptyTrialProgress } from '../trials';
import { setLocale } from '../../i18n';
import type { ChronicleEventDefinition } from '../types';

const NO_DECK: ChronicleEventDefinition[] = [];
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

/** Sandbox: no events, trials or forecasts move standing in the close. */
const signed = (): ChronicleState =>
  signCharter(createInitialState(), { ...DEFAULT_CHARTER, mode: 'sandbox' }, 11, baseline).state;

let reportSequence = 0;
function evidence(qcTests: ShiftCloseEvidence['qcTests']): ShiftCloseEvidence {
  reportSequence += 1;
  return {
    report: {
      id: `report-qc-${reportSequence}`,
      grade: null,
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
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests,
  };
}

const passes = (batchId: string | null, count: number, prefix = batchId ?? 'none') =>
  Array.from({ length: count }, (_, i) => ({ id: `qc-${prefix}-${i}`, passed: true, batchId }));

function credit(state: ChronicleState, qcTests: ShiftCloseEvidence['qcTests']) {
  const next = closeShift(state, evidence(qcTests), NO_DECK).state;
  return {
    state: next,
    knowHow: next.ledger.lastShiftKnowHow.qc ?? 0,
    // Passes reach standing at the certifier's review (item 4.9); count what awaits it.
    standing:
      next.certifier.score +
      (next.certifier.review?.hundredths ?? 0) -
      state.certifier.score -
      (state.certifier.review?.hundredths ?? 0),
  };
}

describe('lab pass credit per batch', () => {
  it('pays twenty passes of one batch in a shift once', () => {
    const result = credit(signed(), passes('batch-1', 20));
    expect(result.knowHow).toBe(1);
    expect(result.standing).toBe(8);
  });

  it('pays two batches twice', () => {
    const result = credit(signed(), [...passes('batch-1', 7), ...passes('batch-2', 13)]);
    expect(result.knowHow).toBe(2);
    expect(result.standing).toBe(16);
  });

  it('marks every test seen, so the extra presses never pay later', () => {
    const tests = passes('batch-1', 20);
    const first = credit(signed(), tests);
    expect(first.state.seenQcTestIds).toEqual(expect.arrayContaining(tests.map((t) => t.id)));
    const second = credit(first.state, tests);
    expect(second.knowHow).toBe(0);
    expect(second.standing).toBe(0);
  });

  it('pays a batch once across the chronicle, however many shifts it is retested in', () => {
    const first = credit(signed(), passes('batch-1', 3, 'one'));
    expect(first.knowHow).toBe(1);
    const second = credit(first.state, passes('batch-1', 3, 'two'));
    expect(second.knowHow).toBe(0);
    expect(second.standing).toBe(0);
    const third = credit(second.state, [
      ...passes('batch-1', 2, 'three'),
      ...passes('batch-2', 1, 'three'),
    ]);
    expect(third.knowHow).toBe(1);
    expect(third.standing).toBe(8);
  });

  it('still counts a retested batch as a passed test for the Inspection trial', () => {
    let state = signCharter(
      createInitialState(),
      { ...DEFAULT_CHARTER, mode: 'historical' },
      11,
      baseline
    ).state;
    state = {
      ...state,
      trials: state.trials.map((trial) =>
        trial.id === 'inspection'
          ? { ...emptyTrialProgress('inspection'), phase: 'active' as const, startedShift: 0 }
          : trial
      ),
    };
    for (const round of ['one', 'two']) state = credit(state, passes('batch-1', 1, round)).state;
    expect(state.trials.find((trial) => trial.id === 'inspection')?.cleanCloses).toBe(2);
  });

  it('keeps a batch it has credited when the record is full, as long as it is retested', () => {
    let state = credit(signed(), passes('batch-kept', 1, 'first')).state;
    for (let round = 0; round < 3; round++) {
      // Two hundred other batches pass, and the kept batch is retested among them.
      const others = Array.from({ length: 100 }, (_, i) => ({
        id: `qc-other-${round}-${i}`,
        passed: true,
        batchId: `batch-other-${round}-${i}`,
      }));
      state = credit(state, [...others, ...passes('batch-kept', 1, `again-${round}`)]).state;
      expect(state.ledger.lastShiftKnowHow.qc).toBe(100);
    }
    expect(state.creditedQcBatchIds?.length).toBeLessThanOrEqual(200);
    expect(state.creditedQcBatchIds).toContain('batch-kept');
  });

  it('treats a batch a save from before this record already credited as credited', () => {
    const first = credit(signed(), passes('batch-1', 2, 'one'));
    // A save from before batches were recorded: the tests were seen, no batch is listed.
    const saved: ChronicleState = { ...first.state };
    delete saved.creditedQcBatchIds;
    const retested = credit(saved, [
      ...passes('batch-1', 2, 'one'),
      ...passes('batch-1', 1, 'two'),
    ]);
    expect(retested.knowHow).toBe(0);
    expect(retested.state.creditedQcBatchIds).toEqual(['batch-1']);
    const fresh = credit(retested.state, passes('batch-2', 1, 'three'));
    expect(fresh.knowHow).toBe(1);
  });

  it('pays a failed-then-passed batch once and a failed-only batch nothing', () => {
    const result = credit(signed(), [
      { id: 'qc-f1', passed: false, batchId: 'batch-1' },
      { id: 'qc-p1', passed: true, batchId: 'batch-1' },
      { id: 'qc-f2', passed: false, batchId: 'batch-2' },
    ]);
    expect(result.knowHow).toBe(1);
  });

  it('keys a test without a batch by its own id, as saved evidence did', () => {
    const result = credit(signed(), [
      { id: 'qc-x', passed: true },
      { id: 'qc-y', passed: true, batchId: null },
    ]);
    expect(result.knowHow).toBe(2);
    expect(result.standing).toBe(16);
  });
});

describe('the know-how line for lab passes', () => {
  it('says it counts batches, in both languages, and the old label still translates', () => {
    try {
      expect(localizedSourceLabels(KNOW_HOW_SOURCE_LABELS).qc).toBe('Batches that passed QC');
      setLocale('pt-BR');
      expect(localizedSourceLabels(KNOW_HOW_SOURCE_LABELS).qc).toBe('Lotes aprovados no CQ');
      expect(localizedSourceLabels({ qc: 'Passed QC tests' }).qc).toBe('Testes de CQ aprovados');
    } finally {
      setLocale('en');
    }
  });
});
