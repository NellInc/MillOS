/**
 * QC Lab Store - Quality Control Laboratory State
 * Extracted from productionStore for better separation of concerns
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export type QCGrade = 'A' | 'B' | 'C' | 'FAIL';

export interface QualityTestResult {
  id: string;
  timestamp: Date;
  machineId: string;
  grade: QCGrade;
  moistureContent: number;
  proteinLevel: number;
  ashContent: number;
  particleSize: number;
  passed: boolean;
}

export interface QCLabState {
  isRunning: boolean;
  currentTest: {
    machineId: string;
    startTime: Date;
    progress: number;
  } | null;
  testHistory: QualityTestResult[];
  certificationStatus: 'valid' | 'expiring' | 'expired';
  certificationExpiry: Date;
  contaminationAlerts: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: Date;
    resolved: boolean;
  }>;
}

export interface QCLabStore {
  qcLab: QCLabState;
  startQCTest: (machineId: string) => void;
  completeQCTest: (result: Omit<QualityTestResult, 'id' | 'timestamp'>) => void;
  triggerContaminationAlert: () => void;
  updateCertificationStatus: (status: QCLabState['certificationStatus']) => void;
  getLatestTestResult: () => QualityTestResult | null;
}

export type DispatchQualityHoldReason =
  'certification_expired' | 'unresolved_contamination' | 'failed_quality_test';

export interface DispatchQualityStatus {
  released: boolean;
  reason: DispatchQualityHoldReason | null;
}

/**
 * Translate the laboratory state into the shipping interlock used by the
 * operations tick and SCADA. An untested startup batch remains releasable so
 * the simulation can begin, while explicit adverse evidence creates a hold.
 */
export function getDispatchQualityStatus(qcLab: QCLabState): DispatchQualityStatus {
  if (qcLab.certificationStatus === 'expired') {
    return { released: false, reason: 'certification_expired' };
  }

  if (qcLab.contaminationAlerts.some((alert) => !alert.resolved)) {
    return { released: false, reason: 'unresolved_contamination' };
  }

  const latestTest = qcLab.testHistory[qcLab.testHistory.length - 1];
  if (latestTest && (!latestTest.passed || latestTest.grade === 'FAIL')) {
    return { released: false, reason: 'failed_quality_test' };
  }

  return { released: true, reason: null };
}

const initialQCLabState: QCLabState = {
  isRunning: false,
  currentTest: null,
  testHistory: [],
  certificationStatus: 'valid',
  certificationExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
  contaminationAlerts: [],
};

export const useQCLabStore = create<QCLabStore>()(
  subscribeWithSelector((set, get) => ({
    qcLab: initialQCLabState,

    startQCTest: (machineId: string) =>
      set((state) => ({
        qcLab: {
          ...state.qcLab,
          isRunning: true,
          currentTest: {
            machineId,
            startTime: new Date(),
            progress: 0,
          },
        },
      })),

    completeQCTest: (result) =>
      set((state) => {
        const fullResult: QualityTestResult = {
          ...result,
          id: `qc-${Date.now()}`,
          timestamp: new Date(),
        };
        return {
          qcLab: {
            ...state.qcLab,
            isRunning: false,
            currentTest: null,
            testHistory: [...state.qcLab.testHistory.slice(-99), fullResult], // Keep last 100
          },
        };
      }),

    triggerContaminationAlert: () =>
      set((state) => ({
        qcLab: {
          ...state.qcLab,
          contaminationAlerts: [
            ...state.qcLab.contaminationAlerts,
            {
              id: `alert-${Date.now()}`,
              type: 'foreign_material',
              severity: 'medium' as const,
              timestamp: new Date(),
              resolved: false,
            },
          ],
        },
      })),

    updateCertificationStatus: (status) =>
      set((state) => ({
        qcLab: {
          ...state.qcLab,
          certificationStatus: status,
        },
      })),

    getLatestTestResult: () => {
      const { qcLab } = get();
      return qcLab.testHistory.length > 0 ? qcLab.testHistory[qcLab.testHistory.length - 1] : null;
    },
  }))
);
