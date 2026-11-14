/**
 * Fix-up d (plan item 4c): the plant's lab bench now tests every batch, about
 * fifteen to forty a shift. The chartered probe measured what it passed to the
 * Chronicle before this fix: about 15 know-how a shift (a grade A earns 6),
 * standing at 9 by shift 7 for a player who never pressed Test batch, and the
 * Inspection's "a passed QC test in each close" met by the bench alone. A
 * bench test is the plant's routine, not the steward's work: it earns no
 * know-how, no review and no Inspection close. A player's own test of a batch
 * the bench already passed still earns once.
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
import { trialsFor } from '../schedule';
import type { ChronicleEventDefinition } from '../types';

const NO_DECK: ChronicleEventDefinition[] = [];
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

let sequence = 0;
function evidence(qcTests: ShiftCloseEvidence['qcTests']): ShiftCloseEvidence {
  sequence += 1;
  return {
    report: {
      id: `bench-${sequence}`,
      grade: 'A',
      endedAtMinute: sequence * 480,
      metrics: {
        revenue: 1000,
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

const benchPasses = (shift: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `bench-${shift}-${i}`,
    passed: true,
    batchId: `run:batch-${shift}-${i}`,
    bench: true,
  }));

describe('the lab bench’s own tests', () => {
  it('earn no know-how and no review; a player’s test of a bench-passed batch earns once', () => {
    let state: ChronicleState = signCharter(
      createInitialState(),
      { ...DEFAULT_CHARTER, mode: 'sandbox' },
      3,
      baseline
    ).state;
    state = closeShift(state, evidence(benchPasses(1, 20)), NO_DECK).state;
    expect(state.ledger.lastShiftKnowHow.qc ?? 0).toBe(0);
    expect(state.certifier.review?.batches ?? 0).toBe(0);
    const player = { id: 'player-1', passed: true, batchId: 'run:batch-1-0' };
    state = closeShift(state, evidence([...benchPasses(1, 20), player]), NO_DECK).state;
    expect(state.ledger.lastShiftKnowHow.qc).toBe(1);
    expect(state.certifier.review?.batches).toBe(1);
  });

  it('do not close an Inspection: only a test the player ran does', () => {
    let state: ChronicleState = signCharter(
      createInitialState(),
      DEFAULT_CHARTER,
      3,
      baseline
    ).state;
    const inspection = trialsFor(state.charter).find((t) => t.id === 'inspection')!;
    // Close up to the Inspection's start on bench tests alone, then through its window.
    for (let shift = 1; shift <= inspection.startShift + inspection.durationShifts; shift++)
      state = closeShift(state, evidence(benchPasses(shift, 15)), NO_DECK).state;
    const progress = state.trials.find((t) => t.id === 'inspection')!;
    expect(progress.phase).toBe('failed');
    expect(progress.cleanCloses).toBe(0);
    expect(progress.brokenAt?.causes).toContain('qc');
  });
});
