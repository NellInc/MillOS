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
  type MaterialDisposition,
  type ProductionBatch,
} from './materialFlowStore';

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
  }) => string;
  resolveContaminationAlert: (
    alertId: string,
    resolution: 'released' | 'recalled',
    controlSource?: string,
    note?: string
  ) => boolean;
  updateCertificationStatus: (status: QCLabState['certificationStatus']) => void;
  getLatestTestResult: () => QualityTestResult | null;
  resetQCLab: () => void;
}

export type DispatchQualityHoldReason =
  | 'certification_expired'
  | 'unresolved_contamination'
  | 'failed_quality_test'
  | 'batch_quality_hold'
  | 'batch_recalled';

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

  if (qcLab.contaminationAlerts.some((alert) => !alert.resolved)) {
    return { released: false, reason: 'unresolved_contamination' };
  }

  if (
    productionBatches.some((batch) => batch.availableKg > 0 && batch.disposition === 'recalled')
  ) {
    return { released: false, reason: 'batch_recalled' };
  }

  if (productionBatches.some((batch) => batch.availableKg > 0 && batch.disposition === 'hold')) {
    return { released: false, reason: 'batch_quality_hold' };
  }

  const latestTest = qcLab.testHistory[qcLab.testHistory.length - 1];
  if (latestTest && (!latestTest.passed || latestTest.grade === 'FAIL')) {
    return { released: false, reason: 'failed_quality_test' };
  }

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
                `Grade ${result.grade}: material ${disposition === 'released' ? 'released for dispatch' : 'held for investigation'}.`,
            },
          ],
          auditSequence: sequence,
        },
      }));

      const flow = useMaterialFlowStore.getState();
      if (batchId) {
        flow.setBatchDisposition(
          [batchId],
          disposition,
          `${testType === 'retest' ? 'Retest' : 'Test'} ${fullResult.id}: ${result.grade}`,
          fullResult.id
        );
      }
      if (sourceLotIds.length > 0) {
        flow.setLotDisposition(
          sourceLotIds,
          disposition,
          `${testType === 'retest' ? 'Retest' : 'Test'} ${fullResult.id}: ${result.grade}`
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
      const note = scope?.controlNote?.trim() || 'Foreign material investigation opened';

      const lotAffectedBatches = sourceLotIds.length
        ? flow.setLotDisposition(sourceLotIds, 'hold', `${alertId}: ${note}`)
        : [];
      const allBatchIds = [...new Set([...batchIds, ...lotAffectedBatches])];
      flow.setBatchDisposition(allBatchIds, 'hold', `${alertId}: ${note}`);

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
      note = ''
    ) => {
      const alert = get().qcLab.contaminationAlerts.find((candidate) => candidate.id === alertId);
      if (!alert || alert.resolved) return false;
      const sequence = get().qcLab.auditSequence + 1;
      const disposition = resolution === 'recalled' ? 'recalled' : 'released';
      const reason =
        note.trim() ||
        (resolution === 'recalled'
          ? `Material recalled under ${alertId}`
          : `Investigation ${alertId} cleared material`);
      const flow = useMaterialFlowStore.getState();
      const lotAffected = alert.sourceLotIds.length
        ? flow.setLotDisposition(alert.sourceLotIds, disposition, reason)
        : [];
      const batchIds = [...new Set([...alert.batchIds, ...lotAffected])];
      flow.setBatchDisposition(batchIds, disposition, reason);

      set((state) => ({
        qcLab: {
          ...state.qcLab,
          contaminationAlerts: state.qcLab.contaminationAlerts.map((candidate) =>
            candidate.id === alertId
              ? { ...candidate, resolved: true, resolution, resolvedAt: new Date() }
              : candidate
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
