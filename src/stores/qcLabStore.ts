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
import { translate } from '../i18n';
import { qcLabStoreMessages } from './qcLabStore.messages';

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
  passed: boolean;
  disposition: Extract<MaterialDisposition, 'released' | 'hold'>;
}

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
  const failed = (test: QualityTestResult) => !test.passed || test.grade === 'FAIL';
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
    if (test.batchId) latestPassed.set(test.batchId, test.passed && test.grade !== 'FAIL');
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
    if (!test || !test.passed || test.grade === 'FAIL') continue;
    const testSequence = sequenceOf(test.id, 'qc');
    const after =
      alertSequence !== null && testSequence !== null
        ? testSequence > alertSequence
        : timeOf(test.timestamp) >= timeOf(alert.timestamp);
    if (after) evidenced.add(batchId);
  }
  return evidenced;
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
      const disposition: QualityTestResult['disposition'] =
        result.passed && result.grade !== 'FAIL' ? 'released' : 'hold';
      const fullResult: QualityTestResult = {
        ...result,
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
          testHistory: [...state.qcLab.testHistory.slice(-99), fullResult],
          dispositionHistory: [
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
                translate(
                  qcLabStoreMessages,
                  disposition === 'released' ? 'auditNoteReleased' : 'auditNoteHeld',
                  { grade: result.grade }
                ),
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
      if (sourceLotIds.length > 0) {
        flow.setLotDisposition(
          sourceLotIds,
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
      // The alert's source lots are released or recalled only with the alert.
      const lotAffected =
        closes && alert.sourceLotIds.length
          ? flow.setLotDisposition(
              alert.sourceLotIds,
              disposition,
              reason,
              retainedHolds,
              reasonKey
            )
          : [];
      const batchIds = [...new Set([...settled, ...lotAffected])];
      flow.setBatchDisposition(
        retainedHolds ? batchIds.filter((batchId) => !retainedHolds.has(batchId)) : batchIds,
        disposition,
        reason,
        undefined,
        reasonKey
      );

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
            ...state.qcLab.dispositionHistory.slice(-199),
            {
              id: auditId(sequence),
              timestamp: new Date(),
              action: resolution === 'recalled' ? 'recall' : 'release',
              batchIds,
              sourceLotIds: alert.sourceLotIds,
              referenceId: alertId,
              controlSource: controlSource.trim() || 'Autonomous QC controller',
              note: reason,
            },
          ],
          auditSequence: sequence,
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
