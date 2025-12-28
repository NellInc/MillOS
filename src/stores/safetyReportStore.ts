/**
 * Safety Report Store
 *
 * Bilateral Alignment Phase 2: Dialogue-as-Safety Feedback Loop
 *
 * Workers who feel heard become safety assets - they report hazards,
 * near-misses, and concerns. Workers who feel ignored become safety
 * liabilities - they stop reporting, and problems escalate silently.
 */

import { create } from 'zustand';
import {
  SafetyReport,
  SafetyReportType,
  SafetyReportSeverity,
  TrackedGrumble,
  GrumbleCategory,
  WorkerSafetyBehavior,
  DEFAULT_WORKER_SAFETY_BEHAVIOR,
  SAFETY_REPORT_PHRASES,
  WORKER_ROSTER,
} from '../types';

// Helper to get random item from array
const randomFrom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// =========================================================================
// SAFETY REPORT STORE
// =========================================================================

interface SafetyReportStore {
  // Active safety reports
  safetyReports: SafetyReport[];

  // Tracked grumbles (potential early warnings)
  trackedGrumbles: TrackedGrumble[];

  // Worker safety behaviors (reporting willingness)
  workerSafetyBehaviors: Record<string, WorkerSafetyBehavior>;

  // Report management
  createSafetyReport: (
    reporterId: string,
    type: SafetyReportType,
    severity: SafetyReportSeverity,
    location: { x: number; z: number },
    machineId?: string
  ) => SafetyReport | null;

  acknowledgeSafetyReport: (reportId: string) => void;
  resolveSafetyReport: (reportId: string) => void;
  dismissSafetyReport: (reportId: string) => void;

  // Grumble tracking
  trackGrumble: (workerId: string, category: GrumbleCategory, text: string) => void;
  addressGrumble: (grumbleId: string) => void;

  // Metrics
  getReportingHealth: () => {
    avgWillingness: number;
    pendingReports: number;
    ignoredReports: number;
    atRiskWorkers: string[]; // Workers with low reporting willingness
  };

  // Simulation tick
  tickSafetySimulation: (deltaMinutes: number) => void;
}

// Initialize safety behaviors for all workers
const initializeSafetyBehaviors = (): Record<string, WorkerSafetyBehavior> => {
  const behaviors: Record<string, WorkerSafetyBehavior> = {};
  WORKER_ROSTER.forEach((worker, index) => {
    // Slight variation based on experience - experienced workers more willing to report
    const experienceBonus = Math.min(worker.experience * 2, 15);
    behaviors[worker.id] = {
      ...DEFAULT_WORKER_SAFETY_BEHAVIOR,
      reportingWillingness: 75 + experienceBonus + (index % 5) * 2,
      reportAccuracy: 80 + Math.min(worker.experience * 1.5, 15),
    };
  });
  return behaviors;
};

export const useSafetyReportStore = create<SafetyReportStore>((set, get) => ({
  safetyReports: [],
  trackedGrumbles: [],
  workerSafetyBehaviors: initializeSafetyBehaviors(),

  createSafetyReport: (reporterId, type, severity, location, machineId) => {
    const behaviors = get().workerSafetyBehaviors;
    const behavior = behaviors[reporterId];

    if (!behavior) return null;

    // Check if worker is willing to report (based on past experience)
    const willReport = Math.random() * 100 < behavior.reportingWillingness;
    if (!willReport) {
      // Worker stays silent - learned helplessness in action
      console.log(
        `[Safety] Worker ${reporterId} chose not to report (willingness: ${behavior.reportingWillingness}%)`
      );
      return null;
    }

    const report: SafetyReport = {
      id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      reporterId,
      type,
      location,
      machineId,
      description: randomFrom(SAFETY_REPORT_PHRASES[type][severity]),
      severity,
      timestamp: Date.now(),
      status: 'pending',
      shiftsUnaddressed: 0,
      wasAcknowledged: false,
    };

    set((state) => ({
      safetyReports: [...state.safetyReports, report],
      workerSafetyBehaviors: {
        ...state.workerSafetyBehaviors,
        [reporterId]: {
          ...behavior,
          totalReports: behavior.totalReports + 1,
        },
      },
    }));

    return report;
  },

  acknowledgeSafetyReport: (reportId) => {
    const report = get().safetyReports.find((r) => r.id === reportId);
    if (!report || report.status !== 'pending') return;

    const behavior = get().workerSafetyBehaviors[report.reporterId];
    if (!behavior) return;

    set((state) => ({
      safetyReports: state.safetyReports.map((r) =>
        r.id === reportId ? { ...r, status: 'acknowledged', wasAcknowledged: true } : r
      ),
      workerSafetyBehaviors: {
        ...state.workerSafetyBehaviors,
        [report.reporterId]: {
          ...behavior,
          reportsAddressed: behavior.reportsAddressed + 1,
          // Being heard increases willingness to report!
          reportingWillingness: Math.min(100, behavior.reportingWillingness + 5),
        },
      },
    }));
  },

  resolveSafetyReport: (reportId) => {
    const report = get().safetyReports.find((r) => r.id === reportId);
    if (!report) return;

    const behavior = get().workerSafetyBehaviors[report.reporterId];
    if (!behavior) return;

    // Resolution is the best outcome - significant trust boost
    set((state) => ({
      safetyReports: state.safetyReports.map((r) =>
        r.id === reportId ? { ...r, status: 'resolved', wasAcknowledged: true } : r
      ),
      workerSafetyBehaviors: {
        ...state.workerSafetyBehaviors,
        [report.reporterId]: {
          ...behavior,
          reportsAddressed: behavior.reportsAddressed + 1,
          reportingWillingness: Math.min(100, behavior.reportingWillingness + 10),
        },
      },
    }));
  },

  dismissSafetyReport: (reportId) => {
    const report = get().safetyReports.find((r) => r.id === reportId);
    if (!report) return;

    const behavior = get().workerSafetyBehaviors[report.reporterId];
    if (!behavior) return;

    // Dismissal erodes trust significantly
    set((state) => ({
      safetyReports: state.safetyReports.map((r) =>
        r.id === reportId ? { ...r, status: 'dismissed' } : r
      ),
      workerSafetyBehaviors: {
        ...state.workerSafetyBehaviors,
        [report.reporterId]: {
          ...behavior,
          reportsIgnored: behavior.reportsIgnored + 1,
          reportingWillingness: Math.max(0, behavior.reportingWillingness - 15),
        },
      },
    }));
  },

  trackGrumble: (workerId, category, text) => {
    const existing = get().trackedGrumbles.find(
      (g) => g.workerId === workerId && g.category === category && !g.addressed
    );

    if (existing) {
      // Escalate existing grumble
      set((state) => ({
        trackedGrumbles: state.trackedGrumbles.map((g) =>
          g.id === existing.id
            ? {
                ...g,
                intensity: Math.min(10, g.intensity + 1),
                occurrences: g.occurrences + 1,
                lastSeen: Date.now(),
                text: text, // Update to latest phrasing
              }
            : g
        ),
      }));
    } else {
      // Create new tracked grumble
      const escalationMap: Record<GrumbleCategory, TrackedGrumble['escalationConsequence']> = {
        fatigue: 'accident',
        equipment: 'breakdown',
        safety: 'injury',
        workload: 'quality_defect',
        colleague: 'conflict',
        management: 'resignation',
        environment: 'sick_leave',
        morale: 'slowdown',
      };

      const grumble: TrackedGrumble = {
        id: `grumble-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        workerId,
        category,
        text,
        intensity: 1,
        occurrences: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        addressed: false,
        escalationConsequence: escalationMap[category],
      };

      set((state) => ({
        trackedGrumbles: [...state.trackedGrumbles, grumble],
      }));
    }
  },

  addressGrumble: (grumbleId) => {
    set((state) => ({
      trackedGrumbles: state.trackedGrumbles.map((g) =>
        g.id === grumbleId ? { ...g, addressed: true, intensity: Math.max(1, g.intensity - 3) } : g
      ),
    }));
  },

  getReportingHealth: () => {
    const behaviors = get().workerSafetyBehaviors;
    const reports = get().safetyReports;

    const willingnessValues = Object.values(behaviors).map((b) => b.reportingWillingness);
    const avgWillingness =
      willingnessValues.length > 0
        ? willingnessValues.reduce((a, b) => a + b, 0) / willingnessValues.length
        : 75;

    const pendingReports = reports.filter((r) => r.status === 'pending').length;
    const ignoredReports = reports.filter((r) => r.status === 'dismissed').length;

    // Workers with willingness below 50 are "at risk" of learned helplessness
    const atRiskWorkers = Object.entries(behaviors)
      .filter(([, b]) => b.reportingWillingness < 50)
      .map(([id]) => id);

    return { avgWillingness, pendingReports, ignoredReports, atRiskWorkers };
  },

  tickSafetySimulation: (deltaMinutes) => {
    const state = get();

    // Age pending reports (increase shifts unaddressed)
    // Assume ~8 game-hours per shift, track in minutes
    const shiftMinutes = 8 * 60;

    const updatedReports = state.safetyReports.map((report) => {
      if (report.status === 'pending') {
        const ageMinutes = (Date.now() - report.timestamp) / 60000;
        const shiftsUnaddressed = Math.floor(ageMinutes / shiftMinutes);
        return { ...report, shiftsUnaddressed };
      }
      return report;
    });

    // Decay willingness for workers with unaddressed reports
    const updatedBehaviors = { ...state.workerSafetyBehaviors };
    updatedReports
      .filter((r) => r.status === 'pending' && r.shiftsUnaddressed >= 2)
      .forEach((report) => {
        const behavior = updatedBehaviors[report.reporterId];
        if (behavior) {
          // Slow decay in willingness for ignored reports
          updatedBehaviors[report.reporterId] = {
            ...behavior,
            reportingWillingness: Math.max(0, behavior.reportingWillingness - 0.5 * deltaMinutes),
          };
        }
      });

    // Escalate intense grumbles
    const updatedGrumbles = state.trackedGrumbles.map((grumble) => {
      if (!grumble.addressed && grumble.intensity >= 5) {
        // High-intensity grumbles slowly escalate
        return {
          ...grumble,
          intensity: Math.min(10, grumble.intensity + 0.1 * deltaMinutes),
        };
      }
      return grumble;
    });

    set({
      safetyReports: updatedReports,
      workerSafetyBehaviors: updatedBehaviors,
      trackedGrumbles: updatedGrumbles,
    });
  },
}));
