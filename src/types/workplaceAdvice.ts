import type { MaterialFlowData } from '../stores/materialFlowStore';
import type { CustomerOrder, DispatchLoadSnapshot } from '../stores/operationsCampaignStore';

export type PackingArrangement = 'steady' | 'briefing' | 'buffer';
export interface PackingContext {
  order: CustomerOrder | null;
  missionMaterialSessionId: string | null;
  productionSpeed: number;
  campaignMultiplier: number;
  /** Explicit intended resume speed, never the paused zero speed. */
  gameSpeed: number;
  qualityRelease: boolean | null;
  dispatchLoad: DispatchLoadSnapshot | null;
  executionFresh: boolean;
}
export interface PackingEvidence {
  materialSessionId: string;
  orderId: string | null;
  recipeId: string | null;
  finishedMaterial: 'flour' | 'semolina' | null;
  remainingOrderKg: number | null;
  releasedPackedKg: number;
  heldPackedKg: number;
  processingMachines: number;
  totalMachines: number;
  materialClockSeconds: number;
  productionSpeed: number;
  campaignMultiplier: number;
  gameSpeed: number;
  qualityRelease: boolean | null;
  truckCapacityKg: number | null;
  truckLoadedKg: number | null;
  truckStatus: DispatchLoadSnapshot['status'] | null;
  missingFacts: string[];
}
/** Ephemeral input only, never store this object in a workplace save. */
export interface PackingCapture {
  data: MaterialFlowData;
  context: PackingContext;
  evidence: PackingEvidence;
  fingerprint: string;
  reasonToAbstain: string | null;
}
export interface PackingAdvice {
  version: 1;
  fingerprint: string;
  arrangement: PackingArrangement;
  evidence: PackingEvidence;
  reasonToAbstain: string | null;
  workplaceMinutes: 90;
  physicalSeconds: number;
  stepSeconds: number;
  briefingMinutes: number;
  linePacing: number;
  packedLowKg: number;
  packedHighKg: number;
  dispatchLowerKg: 0;
  dispatchUpperKg: number;
  genealogyErrorKg: number | null;
  assumptions: string[];
}
export interface PackingRehearsals {
  fingerprint: string;
  arms: PackingAdvice[];
}
