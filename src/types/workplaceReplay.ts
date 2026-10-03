import type {
  WorkplaceEvent,
  WorkplacePlanId,
  WorkplaceProfile,
  WorkplaceState,
} from './workplace';

export interface WorkplaceCheckpointInfo {
  id: string;
  orderId: string;
  customer: string;
  remainingKg: number;
  seed: number;
  gameDay: number;
  gameTime: number;
  sourceKg: number;
  faults: string[];
  participantIds: string[];
}

/** Public conduct and actual ledger deltas, never a trust or wellbeing score. */
export interface WorkplaceReplayRun {
  id: string;
  checkpointId: string;
  profile: WorkplaceProfile;
  planId: WorkplacePlanId;
  charter: Pick<WorkplaceState, 'practices' | 'workerAutonomy' | 'governance' | 'aiAuthority'>;
  shiftPlans: { shift: number; planId: WorkplacePlanId }[];
  shiftCount: number;
  elapsedMinutes: number;
  agreementMinutes: number;
  targetKg: number;
  deferredKg: number;
  dispatchedKg: number;
  remainingKg: number;
  manifestIds: string[];
  materialErrorKg: number;
  genealogyErrorKg: number;
  financial: {
    plantRevenue: number;
    plantCosts: number;
    workplaceWages: number;
    compensation: number;
    improvements: number;
  };
  members: {
    id: string;
    role: string;
    extraMinutes: number;
    restMinutes: number;
    recoveryMinutes: number;
    recoveryOwedMinutes: number;
    earnedPay: number;
    compensationPaid: number;
    refusalRespected: boolean;
  }[];
  receipts: { shift: number; events: WorkplaceEvent[] | null }[];
  objections: { actorId: string; kind: string; status: string }[];
  objectionsRaised: number;
  objectionsResolved: number;
  refusalsRespected: number;
  promisesKept: number;
}
