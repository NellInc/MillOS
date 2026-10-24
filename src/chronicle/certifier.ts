/**
 * The certifier's standing (docs/CHRONICLE.md, system 23), after Castles II's
 * Pope: relations from 1 to 9 that plot choices move in hundredths ("once they
 * reach 100, they increment the related field"), and excommunication as a
 * cliff. Here the cliff always has a way back: suspension schedules a
 * reinstatement audit.
 */
import type { CertifierState } from './types';

export const CERTIFIER_NAME = 'County Food Standards';
export const CERTIFIER_START = 500;
export const STANDING_MIN = 100;
export const STANDING_MAX = 999;
/** Hundredths per passed QC test the Chronicle has not seen before. */
export const STANDING_PER_QC_PASS = 8;
/** Hundredths lost in a shift that recorded a quality failure. */
export const STANDING_PER_FAILED_SHIFT = -25;
/** Standing after a reinstatement audit. */
export const REINSTATED_SCORE = 400;
/** Every customer's relationship change when the approval is suspended. */
export const SUSPENSION_CUSTOMER_DELTA = -10;
/** Shifts before the reinstatement audit after a suspension. */
export const REINSTATEMENT_AFTER_SHIFTS = 3;
/** Standing at which the score starts to count it. */
export const STANDING_SCORE_BASE = 5;

export function initialCertifier(): CertifierState {
  return { score: CERTIFIER_START, suspended: false };
}

/** Standing from 1 to 9; a suspended mill reads 1. */
export function standingOf(certifier: CertifierState): number {
  if (certifier.suspended) return 1;
  return Math.floor(clampScore(certifier.score) / 100);
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return CERTIFIER_START;
  return Math.min(STANDING_MAX, Math.max(STANDING_MIN, Math.round(score)));
}

/** Add hundredths; a suspended mill's standing does not move until reinstated. */
export function adjustStanding(certifier: CertifierState, hundredths: number): CertifierState {
  if (certifier.suspended || !hundredths) return certifier;
  return { ...certifier, score: clampScore(certifier.score + hundredths) };
}

export function suspend(): CertifierState {
  return { score: STANDING_MIN, suspended: true };
}

export function reinstate(certifier: CertifierState): CertifierState {
  if (!certifier.suspended) return certifier;
  return { score: REINSTATED_SCORE, suspended: false };
}

/** Score points for standing: nothing at or below 5, nothing while suspended. */
export function standingScore(certifier: CertifierState): number {
  return certifier.suspended ? 0 : Math.max(0, standingOf(certifier) - STANDING_SCORE_BASE);
}
