/**
 * QC laboratory, batch disposition, and recall state.
 *
 * Quality actions are linked to the conserved lot and production-batch
 * genealogy in materialFlowStore. The laboratory owns the audit record while
 * the material store remains authoritative for dispatchable mass.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  useMaterialFlowStore,
  type DispositionReasonKey,
  type MaterialDisposition,
  type ProductionBatch,
} from './materialFlowStore';
import { formatFixed, translate } from '../i18n';
import { qcReadingsForLots } from '../chronicle/cropYears';
import { compareDispatchOrder, type ShipmentOrder } from '../simulation/shipmentPlan';
import { crewAtWork } from '../simulation/workplaceCrew';
import { qcLabStoreMessages } from './qcLabStore.messages';
import { operationsCampaignMessages } from './operationsCampaignStore.messages';

export type QCGrade = 'A' | 'B' | 'C' | 'FAIL';
export type QCTestType = 'initial' | 'retest';

export interface QualityTestResult {
  id: string;
  timestamp: Date;
  machineId: string;
  batchId: string | null;
  sourceLotIds: string[];
  testType: QCTestType;
  controlSource: string;
  controlNote: string;
  grade: QCGrade;
  moistureContent: number;
  proteinLevel: number;
  ashContent: number;
  particleSize: number;
  /**
   * Falling number in seconds, from the stamped crop attributes of the lots
   * under test. Absent when no lot carried them (no signed Chronicle charter)
   * and on results saved before the lab recorded it.
   */
  fallingNumber?: number;
  /**
   * Whether the batch meets the minimum it was read against. With
   * `minimumQuality` set (plan item 3.2) a miss only keeps the batch from that
   * order: the lab holds a batch only on a grade of FAIL. Without it, as
   * before, a failed test holds the batch.
   */
  passed: boolean;
  disposition: Extract<MaterialDisposition, 'released' | 'hold'>;
  /** The order the result was read against (plan item 3.2); absent before it. */
  orderId?: string;
  /** The batch's stamp the result read (plan item 3.2); absent before it. */
  qualityScore?: number;
  /** That order's recipe minimum; absent before plan item 3.2 or with no order open. */
  minimumQuality?: number;
}

/**
 * Game minutes the bench takes over one batch (plan item 3.2). Chosen, not
 * sourced: short enough that the first guided delivery still ships on time
 * (UnifiedGameTick.playableJourney.test.ts), long enough that a busy shift
 * queues batches behind each other.
 */
export const BENCH_TEST_MINUTES = 6;
/**
 * Test results kept. The bench tests every batch (about 35 a busy shift), so
 * the record keeps the last few hours'; the save must fit its budget
 * (physicalSession.budget.test.ts). Was 100 before the bench.
 */
export const MAX_TEST_HISTORY = 15;

/**
 * The test record: the last MAX_TEST_HISTORY of the bench's own tests and,
 * apart, the last MAX_TEST_HISTORY a person or an agent ran, in order. The
 * bench never pushes a player's test out before the Chronicle reads it at
 * the shift's close.
 */
function keepTestHistory(tests: QualityTestResult[]): QualityTestResult[] {
  const bench = tests.filter((test) => test.controlSource === BENCH_CONTROL_SOURCE);
  const others = tests.length - bench.length;
  let dropBench = Math.max(0, bench.length - MAX_TEST_HISTORY);
  let dropOthers = Math.max(0, others - MAX_TEST_HISTORY);
  if (dropBench === 0 && dropOthers === 0) return tests;
  return tests.filter((test) => {
    if (test.controlSource === BENCH_CONTROL_SOURCE) {
      if (dropBench > 0) return dropBench-- <= 0;
      return true;
    }
    if (dropOthers > 0) return dropOthers-- <= 0;
    return true;
  });
}
/** The source the lab records for a test the bench ran on its own. */
export const BENCH_CONTROL_SOURCE = 'Autonomous QC controller';

/** The bench's test in progress (plan item 3.2). */
export interface BenchTest {
  batchId: string;
  /** 0 to 1 of BENCH_TEST_MINUTES. */
  progress: number;
}

/** Lab grade bands over the 0-100 product quality score stamped on a batch. */
export function labGradeForQuality(score: number | undefined): QCGrade {
  if (score === undefined || !Number.isFinite(score) || score >= 95) return 'A';
  if (score >= 85) return 'B';
  if (score >= 70) return 'C';
  return 'FAIL';
}

/**
 * A batch's stamp read against the order it would serve: the grade band, and
 * whether it meets that order's minimum (true with no order to read against).
 * A batch saved before stamps were recorded reads as conforming.
 */
export function readAgainstOrder(
  score: number | undefined,
  minimum: number | null
): { grade: QCGrade; passed: boolean } {
  const grade = labGradeForQuality(score);
  const meets =
    minimum === null || score === undefined || !Number.isFinite(score) || score >= minimum - 1e-6;
  return { grade, passed: grade !== 'FAIL' && meets };
}

/** Whether the lab held what a test judged: a result that holds its batch. */
const heldByTest = (test: Pick<QualityTestResult, 'disposition'>) => test.disposition === 'hold';

/**
 * The source the lab records for an action the player pressed: the campaign
 * logbook's word for the operator (`sourceOperator`), kept in English because
 * the lab's records are machine-readable audit fields (src/i18n/GLOSSARY.md).
 */
export const OPERATOR_CONTROL_SOURCE = operationsCampaignMessages.en.sourceOperator;

export interface ContaminationAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  sourceLotIds: string[];
  batchIds: string[];
  controlNote: string;
  resolved: boolean;
  resolution: 'released' | 'recalled' | null;
  resolvedAt: Date | null;
}

export interface QualityDispositionRecord {
  id: string;
  timestamp: Date;
  action: 'hold' | 'test' | 'retest' | 'release' | 'recall';
  batchIds: string[];
  sourceLotIds: string[];
  referenceId: string;
  controlSource: string;
  note: string;
}

export interface QCLabState {
  isRunning: boolean;
  currentTest: {
    machineId: string;
    batchId: string | null;
    sourceLotIds: string[];
    testType: QCTestType;
    controlSource: string;
    startTime: Date;
    progress: number;
  } | null;
  testHistory: QualityTestResult[];
  certificationStatus: 'valid' | 'expiring' | 'expired';
  certificationExpiry: Date;
  contaminationAlerts: ContaminationAlert[];
  dispositionHistory: QualityDispositionRecord[];
  auditSequence: number;
  /** The bench's test in progress (plan item 3.2); absent or null when idle. */
  bench?: BenchTest | null;
  /** A batch the operator asked to be tested next; absent when none. */
  benchFirst?: string | null;
}

export interface QCLabStore {
  qcLab: QCLabState;
  startQCTest: (
    machineId: string,
    scope?: {
      batchId?: string;
      sourceLotIds?: string[];
      testType?: QCTestType;
      controlSource?: string;
    }
  ) => void;
  completeQCTest: (
    result: Omit<
      QualityTestResult,
      | 'id'
      | 'timestamp'
      | 'disposition'
      | 'batchId'
      | 'sourceLotIds'
      | 'testType'
      | 'controlSource'
      | 'controlNote'
    > & {
      batchId?: string | null;
      sourceLotIds?: string[];
      testType?: QCTestType;
      controlSource?: string;
      controlNote?: string;
      /** The bench's own test: the batch's record only, its lots untouched. */
      batchOnly?: boolean;
    }
  ) => QualityTestResult;
  triggerContaminationAlert: (scope?: {
    type?: string;
    severity?: ContaminationAlert['severity'];
    sourceLotIds?: string[];
    batchIds?: string[];
    controlSource?: string;
    controlNote?: string;
    /** The canned note `controlNote` was rendered from, so the hold reason follows the language. */
    controlNoteKey?: DispositionReasonKey;
  }) => string;
  /**
   * Settle an investigation. A release covers only batches with a passing test
   * recorded after the alert; a recall covers `batchIds` when given, else the
   * whole remaining scope. The alert stays open, narrowed, while any batch it
   * names is still on hold, and closes once none is.
   */
  resolveContaminationAlert: (
    alertId: string,
    resolution: 'released' | 'recalled',
    controlSource?: string,
    note?: string,
    batchIds?: readonly string[],
    /** The canned note `note` was rendered from, so the batch reason follows the language. */
    noteKey?: DispositionReasonKey
  ) => boolean;
  updateCertificationStatus: (status: QCLabState['certificationStatus']) => void;
  getLatestTestResult: () => QualityTestResult | null;
  resetQCLab: () => void;
}

export type DispatchQualityHoldReason =
  | 'certification_expired'
  | 'unresolved_contamination'
  | 'failed_quality_test';

export interface DispatchQualityStatus {
  released: boolean;
  reason: DispatchQualityHoldReason | null;
}

/** Translate laboratory and optional batch state into the shipping interlock. */
export function getDispatchQualityStatus(
  qcLab: QCLabState,
  productionBatches: readonly ProductionBatch[] = []
): DispatchQualityStatus {
  if (qcLab.certificationStatus === 'expired') {
    return { released: false, reason: 'certification_expired' };
  }

  // An open investigation stops dispatch while it holds something: a source
  // lot, or a batch still on hold. One that holds nothing (raised when no stock
  // was packed, or whose batches were all recalled through another alert) has
  // no batch control left to close it, and stopped every truck for good.
  const heldBatchIds = new Set(
    productionBatches.filter((batch) => batch.disposition === 'hold').map((batch) => batch.id)
  );
  if (
    qcLab.contaminationAlerts.some(
      (alert) =>
        !alert.resolved &&
        (alert.sourceLotIds.length > 0 || alert.batchIds.some((id) => heldBatchIds.has(id)))
    )
  ) {
    return { released: false, reason: 'unresolved_contamination' };
  }

  // A held or recalled batch is isolated by mass, not by stopping the plant:
  // shipFinishedGoods loads only released batches, and loading waits for
  // released stock. A plant-wide stop here wedged every truck for the session.

  // A failed result holds dispatch while what it judged is still on hold. A
  // batch-scoped failure stops holding once its batch holds no stock on hold
  // (recalled and scrapped); an unscoped one, or a batch not in the list,
  // still holds. Working if recalling the failed batch lets released stock ship.
  // Keyed on whether the lab held what it judged (plan item 3.2): a result
  // read against an order's minimum and missing it routes the batch to
  // another order and stops no truck.
  const failed = heldByTest;
  const latestTest = qcLab.testHistory[qcLab.testHistory.length - 1];
  if (latestTest && failed(latestTest)) {
    const judged = latestTest.batchId
      ? productionBatches.find((batch) => batch.id === latestTest.batchId)
      : undefined;
    const settled =
      judged !== undefined && !(judged.disposition === 'hold' && judged.availableKg > 0);
    if (!settled) return { released: false, reason: 'failed_quality_test' };
  }
  // An earlier failure holds too while its batch's own latest test failed and
  // the batch still has stock on hold: a test of another batch (a pass, or a
  // failure then recalled) says nothing about it. A batch no longer listed has
  // no control left to settle it, so only listed batches hold here.
  const latestByBatch = new Map<string, QualityTestResult>();
  for (const test of qcLab.testHistory) if (test.batchId) latestByBatch.set(test.batchId, test);
  const failedOnHold = productionBatches.some((batch) => {
    const test = latestByBatch.get(batch.id);
    return !!test && failed(test) && batch.disposition === 'hold' && batch.availableKg > 0;
  });
  if (failedOnHold) return { released: false, reason: 'failed_quality_test' };

  return { released: true, reason: null };
}

function createInitialQCLabState(): QCLabState {
  return {
    isRunning: false,
    currentTest: null,
    testHistory: [],
    certificationStatus: 'valid',
    certificationExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    contaminationAlerts: [],
    dispositionHistory: [],
    auditSequence: 0,
  };
}

/**
 * Batches held on their own evidence: the latest test of the batch failed, or
 * an open investigation (other than `resolvingAlertId`) names it. Releasing a
 * shared lot, or clearing another alert, must leave these held. Working if a
 * failed batch stays held until it passes its own retest or is recalled.
 */
function independentlyHeldBatchIds(qcLab: QCLabState, resolvingAlertId?: string): Set<string> {
  const latestPassed = new Map<string, boolean>();
  for (const test of qcLab.testHistory) {
    if (test.batchId) latestPassed.set(test.batchId, !heldByTest(test));
  }
  const held = new Set<string>();
  latestPassed.forEach((passed, batchId) => {
    if (!passed) held.add(batchId);
  });
  for (const alert of qcLab.contaminationAlerts) {
    if (alert.resolved || alert.id === resolvingAlertId) continue;
    alert.batchIds.forEach((batchId) => held.add(batchId));
  }
  return held;
}

const sequenceOf = (id: string, prefix: string): number | null => {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  return match ? Number(match[1]) : null;
};

const timeOf = (value: Date | string | number): number => new Date(value).getTime();

/**
 * Batches of `alert` whose latest test passed after the alert was raised: the
 * evidence a release may act on. Alerts and tests share the audit sequence, so
 * order is read from it; ids from elsewhere fall back to the timestamps.
 */
function batchesWithPassingEvidence(qcLab: QCLabState, alert: ContaminationAlert): Set<string> {
  const latest = new Map<string, QualityTestResult>();
  for (const test of qcLab.testHistory) if (test.batchId) latest.set(test.batchId, test);
  const alertSequence = sequenceOf(alert.id, 'contamination');
  const evidenced = new Set<string>();
  for (const batchId of alert.batchIds) {
    const test = latest.get(batchId);
    if (!test || heldByTest(test)) continue;
    const testSequence = sequenceOf(test.id, 'qc');
    const after =
      alertSequence !== null && testSequence !== null
        ? testSequence > alertSequence
        : timeOf(test.timestamp) >= timeOf(alert.timestamp);
    if (after) evidenced.add(batchId);
  }
  return evidenced;
}

/** Batches whose latest test, run after `alert` was raised, did not hold them. */
function testedSince(qcLab: QCLabState, alert: ContaminationAlert, batchIds: readonly string[]) {
  return batchesWithPassingEvidence(qcLab, { ...alert, batchIds: [...batchIds] });
}

function auditId(sequence: number): string {
  return `quality-audit-${String(sequence).padStart(5, '0')}`;
}

export const useQCLabStore = create<QCLabStore>()(
  subscribeWithSelector((set, get) => ({
    qcLab: createInitialQCLabState(),

    startQCTest: (machineId, scope) =>
      set((state) => ({
        qcLab: {
          ...state.qcLab,
          isRunning: true,
          currentTest: {
            machineId,
            batchId: scope?.batchId ?? null,
            sourceLotIds: [...(scope?.sourceLotIds ?? [])],
            testType: scope?.testType ?? 'initial',
            controlSource: scope?.controlSource?.trim() || 'Autonomous QC controller',
            startTime: new Date(),
            progress: 0,
          },
        },
      })),

    completeQCTest: (result) => {
      const current = get().qcLab.currentTest;
      const sequence = get().qcLab.auditSequence + 1;
      const batchId = result.batchId ?? current?.batchId ?? null;
      const sourceLotIds = [...new Set(result.sourceLotIds ?? current?.sourceLotIds ?? [])];
      const testType = result.testType ?? current?.testType ?? 'initial';
      const controlSource =
        result.controlSource?.trim() || current?.controlSource || 'Autonomous QC controller';
      const controlNote = result.controlNote?.trim() || '';
      // A result read against an order's minimum holds the batch only on a
      // FAIL grade; a miss keeps it from that order alone (plan item 3.2).
      const orderRead = result.minimumQuality !== undefined;
      const disposition: QualityTestResult['disposition'] = orderRead
        ? result.grade !== 'FAIL'
          ? 'released'
          : 'hold'
        : result.passed && result.grade !== 'FAIL'
          ? 'released'
          : 'hold';
      const { batchOnly, ...recorded } = result;
      const fullResult: QualityTestResult = {
        ...recorded,
        id: `qc-${String(sequence).padStart(5, '0')}`,
        timestamp: new Date(),
        batchId,
        sourceLotIds,
        testType,
        controlSource,
        controlNote,
        disposition,
      };
      const affectedBatchIds = batchId ? [batchId] : [];

      set((state) => ({
        qcLab: {
          ...state.qcLab,
          isRunning: false,
          currentTest: null,
          testHistory: keepTestHistory([...state.qcLab.testHistory, fullResult]),
          // The bench's own tests are their own record (testHistory); only
          // a person's or an agent's test is also an audit line.
          dispositionHistory: batchOnly
            ? state.qcLab.dispositionHistory
            : [
                ...state.qcLab.dispositionHistory.slice(-199),
                {
                  id: auditId(sequence),
                  timestamp: fullResult.timestamp,
                  action: testType === 'retest' ? 'retest' : 'test',
                  batchIds: affectedBatchIds,
                  sourceLotIds,
                  referenceId: fullResult.id,
                  controlSource,
                  note:
                    controlNote ||
                    (orderRead && disposition === 'released' && !result.passed
                      ? translate(qcLabStoreMessages, 'auditNoteBelowOrder', {
                          quality: formatFixed(result.qualityScore ?? 0, 1),
                          minimum: formatFixed(result.minimumQuality ?? 0, 0),
                        })
                      : translate(
                          qcLabStoreMessages,
                          disposition === 'released' ? 'auditNoteReleased' : 'auditNoteHeld',
                          { grade: result.grade }
                        )),
                },
              ],
          auditSequence: sequence,
        },
      }));

      const flow = useMaterialFlowStore.getState();
      const testReasonKey: DispositionReasonKey = {
        catalog: 'qcLab',
        key: testType === 'retest' ? 'retestReason' : 'testReason',
        params: { id: fullResult.id, grade: result.grade },
      };
      const testReason = () =>
        translate(qcLabStoreMessages, testType === 'retest' ? 'retestReason' : 'testReason', {
          id: fullResult.id,
          grade: result.grade,
        });
      if (batchId) {
        flow.setBatchDisposition(
          [batchId],
          disposition,
          testReason(),
          fullResult.id,
          testReasonKey
        );
      }
      // A lot an open investigation names is released only with the alert, so
      // a pass on one batch leaves the rest of that lot's flour on hold.
      const alertLots = new Set(
        get()
          .qcLab.contaminationAlerts.filter((alert) => !alert.resolved)
          .flatMap((alert) => alert.sourceLotIds)
      );
      const lotsToSet =
        disposition === 'released'
          ? sourceLotIds.filter((lotId) => !alertLots.has(lotId))
          : sourceLotIds;
      if (lotsToSet.length > 0 && !batchOnly) {
        flow.setLotDisposition(
          lotsToSet,
          disposition,
          testReason(),
          independentlyHeldBatchIds(get().qcLab),
          testReasonKey
        );
      }
      return fullResult;
    },

    triggerContaminationAlert: (scope) => {
      const flow = useMaterialFlowStore.getState();
      const sequence = get().qcLab.auditSequence + 1;
      const sourceLotIds = [...new Set(scope?.sourceLotIds ?? [])];
      const requestedBatchIds = [...new Set(scope?.batchIds ?? [])];
      const batchIds =
        requestedBatchIds.length > 0 || sourceLotIds.length > 0
          ? requestedBatchIds
          : flow.productionBatches
              .filter((batch) => batch.availableKg > 0 && batch.disposition !== 'shipped')
              .map((batch) => batch.id);
      const alertId = `contamination-${String(sequence).padStart(5, '0')}`;
      const controlSource = scope?.controlSource?.trim() || 'Autonomous QC controller';
      const operatorNote = scope?.controlNote?.trim();
      const note = operatorNote || translate(qcLabStoreMessages, 'contaminationNoteDefault');
      // A canned note is keyed; an operator's own words stay as written.
      const noteKey: DispositionReasonKey | undefined = operatorNote
        ? scope?.controlNoteKey
        : { catalog: 'qcLab', key: 'contaminationNoteDefault' };
      const holdReason = `${alertId}: ${note}`;
      const holdReasonKey: DispositionReasonKey | undefined = noteKey
        ? { catalog: 'qcLab', key: 'holdReason', params: { alertId, note: noteKey } }
        : undefined;

      const lotAffectedBatches = sourceLotIds.length
        ? flow.setLotDisposition(sourceLotIds, 'hold', holdReason, undefined, holdReasonKey)
        : [];
      const allBatchIds = [...new Set([...batchIds, ...lotAffectedBatches])];
      flow.setBatchDisposition(allBatchIds, 'hold', holdReason, undefined, holdReasonKey);

      set((state) => ({
        qcLab: {
          ...state.qcLab,
          contaminationAlerts: [
            ...state.qcLab.contaminationAlerts,
            {
              id: alertId,
              type: scope?.type?.trim() || 'foreign_material',
              severity: scope?.severity ?? 'medium',
              timestamp: new Date(),
              sourceLotIds,
              batchIds: allBatchIds,
              controlNote: note,
              resolved: false,
              resolution: null,
              resolvedAt: null,
            },
          ],
          dispositionHistory: [
            ...state.qcLab.dispositionHistory.slice(-199),
            {
              id: auditId(sequence),
              timestamp: new Date(),
              action: 'hold',
              batchIds: allBatchIds,
              sourceLotIds,
              referenceId: alertId,
              controlSource,
              note,
            },
          ],
          auditSequence: sequence,
        },
      }));
      return alertId;
    },

    resolveContaminationAlert: (
      alertId,
      resolution,
      controlSource = 'Autonomous QC controller',
      note = '',
      scopeBatchIds,
      noteKey
    ) => {
      const alert = get().qcLab.contaminationAlerts.find((candidate) => candidate.id === alertId);
      if (!alert || alert.resolved) return false;
      const sequence = get().qcLab.auditSequence + 1;
      const disposition = resolution === 'recalled' ? 'recalled' : 'released';
      const reason =
        note.trim() ||
        translate(
          qcLabStoreMessages,
          resolution === 'recalled' ? 'recallReason' : 'clearedReason',
          { alertId }
        );
      // A canned reason is keyed; an operator's own words stay as written.
      const reasonKey: DispositionReasonKey | undefined = note.trim()
        ? noteKey
        : {
            catalog: 'qcLab',
            key: resolution === 'recalled' ? 'recallReason' : 'clearedReason',
            params: { alertId },
          };
      const flow = useMaterialFlowStore.getState();
      // One passing retest is evidence for its own batch only, and a recall
      // pressed on one batch scraps that batch only. Whatever this call does not
      // settle stays under the investigation while it is still on hold; a batch
      // that left hold elsewhere (recalled, shipped) no longer keeps it open,
      // so an alert can always be closed from the batches it still shows.
      const requested = scopeBatchIds ? new Set(scopeBatchIds) : null;
      const evidenced =
        disposition === 'released' ? batchesWithPassingEvidence(get().qcLab, alert) : null;
      const settled = alert.batchIds.filter(
        (batchId) =>
          (!requested || requested.has(batchId)) && (!evidenced || evidenced.has(batchId))
      );
      const onHold = new Set(
        flow.productionBatches
          .filter((batch) => batch.disposition === 'hold')
          .map((batch) => batch.id)
      );
      const remaining = alert.batchIds.filter(
        (batchId) => !settled.includes(batchId) && onHold.has(batchId)
      );
      const closes = remaining.length === 0;
      if (settled.length === 0 && !closes) return false;

      const retainedHolds =
        disposition === 'released' ? independentlyHeldBatchIds(get().qcLab, alertId) : undefined;
      // The alert's source lots are released or recalled only with the alert,
      // and a lot another open alert names stays held until that one closes.
      // A recall pressed on named batches scraps those batches: when it is the
      // press that closes the alert, the lots are released, or the last batch
      // recalled would write off every silo the notice named.
      const lotDisposition = disposition === 'recalled' && scopeBatchIds ? 'released' : disposition;
      const lotsCleared = lotDisposition !== disposition;
      const sharedLots = new Set(
        get()
          .qcLab.contaminationAlerts.filter((other) => !other.resolved && other.id !== alertId)
          .flatMap((other) => other.sourceLotIds)
      );
      const closedLots = !closes
        ? []
        : lotDisposition === 'released'
          ? alert.sourceLotIds.filter((lotId) => !sharedLots.has(lotId))
          : alert.sourceLotIds;
      const clearedReason = translate(qcLabStoreMessages, 'clearedReason', { alertId });
      const lotAffected = closedLots.length
        ? flow.setLotDisposition(
            closedLots,
            lotDisposition,
            lotsCleared ? clearedReason : reason,
            lotsCleared
              ? new Set([...independentlyHeldBatchIds(get().qcLab, alertId), ...settled])
              : retainedHolds,
            lotsCleared
              ? { catalog: 'qcLab', key: 'clearedReason', params: { alertId } }
              : reasonKey
          )
        : [];
      // Flour from the notified grain that its lots' release frees has not
      // itself been tested: it goes to the bench before it can ship, so the
      // close never frees notified flour untested (plan 1.9 (a)).
      const evidencedLotFlour = testedSince(get().qcLab, alert, lotAffected);
      const untestedLotFlour = lotAffected.filter((batchId) => !evidencedLotFlour.has(batchId));
      const batchIds = [...new Set([...settled, ...(lotsCleared ? [] : lotAffected)])];
      const source = controlSource.trim() || 'Autonomous QC controller';
      const records: QualityDispositionRecord[] = [
        {
          id: auditId(sequence),
          timestamp: new Date(),
          action: resolution === 'recalled' ? 'recall' : 'release',
          batchIds,
          sourceLotIds: lotsCleared ? [] : alert.sourceLotIds,
          referenceId: alertId,
          controlSource: source,
          note: reason,
        },
      ];
      // The lots a one-batch recall cleared are recorded as the release they were.
      if (lotsCleared && closedLots.length > 0)
        records.push({
          id: auditId(sequence + 1),
          timestamp: new Date(),
          action: 'release',
          batchIds: lotAffected,
          sourceLotIds: closedLots,
          referenceId: alertId,
          controlSource: source,
          note: clearedReason,
        });
      flow.setBatchDisposition(
        retainedHolds ? batchIds.filter((batchId) => !retainedHolds.has(batchId)) : batchIds,
        disposition,
        reason,
        undefined,
        reasonKey
      );
      if (untestedLotFlour.length > 0) flow.setAwaitingTest(untestedLotFlour);

      set((state) => ({
        qcLab: {
          ...state.qcLab,
          contaminationAlerts: state.qcLab.contaminationAlerts.map((candidate) =>
            candidate.id !== alertId
              ? candidate
              : closes
                ? { ...candidate, resolved: true, resolution, resolvedAt: new Date() }
                : { ...candidate, batchIds: remaining }
          ),
          dispositionHistory: [
            ...state.qcLab.dispositionHistory.slice(-(200 - records.length)),
            ...records,
          ],
          auditSequence: sequence + records.length - 1,
        },
      }));
      return true;
    },

    updateCertificationStatus: (status) =>
      set((state) => ({ qcLab: { ...state.qcLab, certificationStatus: status } })),

    getLatestTestResult: () => {
      const { testHistory } = get().qcLab;
      return testHistory.length > 0 ? testHistory[testHistory.length - 1] : null;
    },

    resetQCLab: () => set({ qcLab: createInitialQCLabState() }),
  }))
);

/**
 * An open alert that holds source lots but names no batch on hold takes the
 * held batches packed from its lots, so the lab's batch controls can close it.
 * Only such an alert: one still naming held batches closes once those settle,
 * and its lots free the rest; taking every new batch would keep it open while
 * its grain still runs. The tick calls this after packing; nothing is written
 * when nothing applies.
 */
export function bindLotHeldBatches(): void {
  const alerts = useQCLabStore.getState().qcLab.contaminationAlerts;
  if (!alerts.some((alert) => !alert.resolved && alert.sourceLotIds.length > 0)) return;
  const held = useMaterialFlowStore
    .getState()
    .productionBatches.filter((batch) => batch.disposition === 'hold');
  let changed = false;
  const next = alerts.map((alert) => {
    if (alert.resolved || alert.sourceLotIds.length === 0) return alert;
    if (held.some((batch) => alert.batchIds.includes(batch.id))) return alert;
    const lots = new Set(alert.sourceLotIds);
    const bound = held
      .filter((batch) => batch.sourceContributions.some((source) => lots.has(source.lotId)))
      .map((batch) => batch.id);
    if (bound.length === 0) return alert;
    changed = true;
    return { ...alert, batchIds: bound };
  });
  if (changed)
    useQCLabStore.setState((state) => ({ qcLab: { ...state.qcLab, contaminationAlerts: next } }));
}

/**
 * Put a batch awaiting its test first in the bench's queue (the Overview's
 * Test first). False when it awaits none. A function, not a store action:
 * the combined production store re-exports this store's actions.
 */
export function prioritiseBenchTest(batchId: string): boolean {
  const batch = useMaterialFlowStore
    .getState()
    .productionBatches.find((candidate) => candidate.id === batchId);
  if (!batch?.awaitingTest || batch.disposition !== 'released') return false;
  useQCLabStore.setState((state) => ({ qcLab: { ...state.qcLab, benchFirst: batchId } }));
  return true;
}

/** An open order as the bench reads it. */
export interface BenchOrder {
  id: string;
  product: string;
  remainingKg: number;
  minimumQuality: number;
  priority: ShipmentOrder['priority'];
  dueAtMinute: number;
}

/**
 * The order a batch would serve: the dispatch queue's first open order of its
 * product with anything owed (priority, then due time), as the Overview names
 * it. Its minimum is what the lab reads the batch against.
 */
export function benchOrderFor(
  batch: Pick<ProductionBatch, 'materialType'>,
  orders: readonly BenchOrder[]
): BenchOrder | null {
  return (
    orders
      .filter((order) => order.product === batch.materialType && order.remainingKg > 0)
      .sort(compareDispatchOrder)[0] ?? null
  );
}

/**
 * The bench's queue (plan item 3.2), first to be tested first: a batch the
 * operator put first; then by the due time of the earliest-due open order of
 * its product (a batch no open order needs goes last); then the oldest. Only
 * released batches awaiting their test, and only once no more flour can join
 * them: sealed, or their packer is no longer packing their product.
 */
export function benchQueue(
  batches: readonly ProductionBatch[],
  orders: readonly BenchOrder[],
  packerHas: (packerId: string, material: string) => boolean,
  first: string | null | undefined
): ProductionBatch[] {
  const dueFor = (material: string) =>
    orders.reduce(
      (due, order) =>
        order.product === material && order.remainingKg > 0
          ? Math.min(due, order.dueAtMinute)
          : due,
      Number.POSITIVE_INFINITY
    );
  const ready = batches.filter(
    (batch) =>
      batch.awaitingTest &&
      batch.disposition === 'released' &&
      batch.availableKg > 0 &&
      (batch.sealed || batch.id === first || !packerHas(batch.packerId, batch.materialType))
  );
  const index = new Map(batches.map((batch, at) => [batch.id, at]));
  return ready.sort(
    (a, b) =>
      Number(b.id === first) - Number(a.id === first) ||
      dueFor(a.materialType) - dueFor(b.materialType) ||
      (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0)
  );
}

/**
 * The lab's tick (plan item 3.2): one test at a time, each BENCH_TEST_MINUTES
 * of game time, read against the minimum of the order the batch would serve.
 * The tick calls it after packing; nothing is written while nothing awaits.
 * Benchmark runs form no batch awaiting a test, so the bench stays idle there.
 */
export function stepLabBench(
  gameMinutes: number,
  orders: readonly BenchOrder[],
  packerHas: (packerId: string, material: string) => boolean
): void {
  const lab = useQCLabStore.getState();
  const flow = useMaterialFlowStore.getState();
  let bench = lab.qcLab.bench ?? null;
  const benchBatch = bench
    ? flow.productionBatches.find((batch) => batch.id === bench!.batchId)
    : undefined;
  // A batch that left the bench's reach (recalled, held, or dropped from the
  // record) frees it.
  if (bench && (!benchBatch || !benchBatch.awaitingTest || benchBatch.disposition !== 'released')) {
    bench = null;
    useQCLabStore.setState((state) => ({ qcLab: { ...state.qcLab, bench: null } }));
  }
  if (!bench) {
    // 5.4: no new test starts while the season's Quality is away uncovered
    // (workplaceCrew); one under way runs on. With no season it always starts.
    if (!crewAtWork('quality')) return;
    const next = benchQueue(flow.productionBatches, orders, packerHas, lab.qcLab.benchFirst)[0];
    if (!next) return;
    flow.sealBatch(next.id);
    bench = { batchId: next.id, progress: 0 };
    const started = bench;
    useQCLabStore.setState((state) => ({
      qcLab: {
        ...state.qcLab,
        bench: started,
        ...(state.qcLab.benchFirst === next.id ? { benchFirst: null } : {}),
      },
    }));
    // This tick's minutes count: a test takes the same game time at any pace.
  }
  const minutes = Number.isFinite(gameMinutes) ? Math.max(0, gameMinutes) : 0;
  const progress = Math.min(1, bench.progress + minutes / BENCH_TEST_MINUTES);
  if (progress < 1 - 1e-9) {
    const running: BenchTest = { ...bench, progress };
    useQCLabStore.setState((state) => ({ qcLab: { ...state.qcLab, bench: running } }));
    return;
  }
  const batch = useMaterialFlowStore
    .getState()
    .productionBatches.find((candidate) => candidate.id === bench!.batchId)!;
  const order = benchOrderFor(batch, orders);
  const { grade, passed } = readAgainstOrder(batch.qualityScore, order?.minimumQuality ?? null);
  const lots = flow.sourceLots;
  const readings = qcReadingsForLots(
    batch.sourceContributions.map((source) => ({
      crop: lots.get(source.lotId)?.crop,
      amountKg: source.amount,
    }))
  );
  useQCLabStore.setState((state) => ({ qcLab: { ...state.qcLab, bench: null } }));
  useQCLabStore.getState().completeQCTest({
    machineId: batch.packerId,
    batchId: batch.id,
    sourceLotIds: [...new Set(batch.sourceContributions.map((source) => source.lotId))],
    testType: 'initial',
    controlSource: BENCH_CONTROL_SOURCE,
    grade,
    passed,
    moistureContent: readings.moistureContent,
    proteinLevel: readings.proteinLevel,
    ashContent: readings.ashContent,
    particleSize: readings.particleSize,
    ...(readings.fallingNumber !== null ? { fallingNumber: readings.fallingNumber } : {}),
    ...(order ? { orderId: order.id, minimumQuality: order.minimumQuality } : {}),
    ...(batch.qualityScore !== undefined && Number.isFinite(batch.qualityScore)
      ? { qualityScore: batch.qualityScore }
      : {}),
    batchOnly: true,
  });
}
