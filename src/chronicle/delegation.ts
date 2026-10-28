import { copy } from './delegation.messages';
/**
 * Delegation, after Egypt: Old Kingdom's decentralization: the more authority
 * is delegated, the more often useful work starts without being ordered. Here
 * the authority is the AI partner's, it is bounded by level and budget, every
 * initiative is logged with its reason, and reversible initiatives can be
 * undone. The policy is deterministic and local; no language model is asked.
 */
import type { DelegationLevel } from './types';

export const DELEGATION_LEVELS: ReadonlyArray<{
  level: DelegationLevel;
  label: string;
  grants: string;
}> = [
  { level: 0, label: 'Advise', grants: 'recommendations only' },
  { level: 1, label: 'Routine', grants: 'answers routine events' },
  {
    level: 2,
    label: 'Forecasts',
    grants:
      'also mitigates forecasts, suppresses fires and restores mitigated incidents, within 15% of the fund a shift',
  },
  { level: 3, label: 'Plans', grants: 'also starts planned installs, keeping 3 shifts of upkeep' },
];

/** Share of the fund the AI partner may spend in one shift. */
export const AI_SHIFT_BUDGET_SHARE = 0.15;
/** A forecast at or above this chance is worth mitigating. */
export const AI_MITIGATION_THRESHOLD = 0.4;
/** Shifts of upkeep the AI partner keeps in reserve before starting an install. */
export const AI_UPKEEP_RESERVE_SHIFTS = 3;
/** Know-how from decisions the AI partner made is scaled by this. */
export const AI_KNOW_HOW_SHARE = 0.5;

export function canAnswerEvents(level: DelegationLevel): boolean {
  return level >= 1;
}

export function canFundMitigations(level: DelegationLevel): boolean {
  return level >= 2;
}

export function canStartInstalls(level: DelegationLevel): boolean {
  return level >= 3;
}

export function aiShiftBudget(fund: number): number {
  return Math.max(0, Math.floor(fund * AI_SHIFT_BUDGET_SHARE));
}

export function getDelegationLevels() {
  return DELEGATION_LEVELS.map((level) => ({
    ...level,
    label: copy(level.label),
    grants: copy(level.grants),
  }));
}
