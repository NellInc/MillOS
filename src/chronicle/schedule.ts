/**
 * The chronicle's clock (plan item 4.2, D3): 63 shifts, or 27 for a short one.
 *
 * The full chronicle is the reference. Everything scheduled in it (crop-year
 * turns, trials, scheduled events, the long night, the epilogue) is placed on a
 * short chronicle's clock by `onSchedule`, the full shift times 27/63 rounded
 * down, so each still happens, in order, at the same share of the way through.
 * Rounding down puts the one three-shift crop year first, where it sets the
 * quota baseline: every later year has four shifts, so steady dispatch meets
 * every quota. For a full chronicle every function here returns the full tables
 * themselves, and a full charter stores no length at all (types.ts, `Charter`).
 */
import { CHRONICLE_SHIFTS, CROP_YEARS_PER_CHRONICLE, SHIFTS_PER_CROP_YEAR } from './cropYears';
import { SHORT_TRIALS, TRIALS, TRIAL_TELEGRAPH_SHIFTS } from './trials';
import type { Charter, ChronicleLength, TrialDefinition, TrialId } from './types';

export const FULL_CHRONICLE_SHIFTS = CHRONICLE_SHIFTS;
export const SHORT_CHRONICLE_SHIFTS = 27;

type Clock = Pick<Charter, 'length'> | null | undefined;

export function chronicleLength(charter: Clock): ChronicleLength {
  return charter?.length === 'short' ? 'short' : 'full';
}

export function shiftsForLength(length: ChronicleLength): number {
  return length === 'short' ? SHORT_CHRONICLE_SHIFTS : FULL_CHRONICLE_SHIFTS;
}

/** The chronicle's last shift: the epilogue closes it. */
export function chronicleShifts(charter: Clock): number {
  return shiftsForLength(chronicleLength(charter));
}

/** A full-chronicle shift on this chronicle's clock. */
export function onSchedule(charter: Clock, fullShift: number): number {
  if (chronicleLength(charter) === 'full') return fullShift;
  return Math.floor((fullShift * SHORT_CHRONICLE_SHIFTS) / FULL_CHRONICLE_SHIFTS);
}

/** The closed-shift count at which crop year `index` (0-based) begins. */
export function cropYearStart(charter: Clock, index: number): number {
  return onSchedule(charter, index * SHIFTS_PER_CROP_YEAR);
}

/** The crop year (0-based) a closed-shift count falls in; the closing shift reads as one past the last. */
export function cropYearAt(charter: Clock, shift: number): number {
  if (chronicleLength(charter) === 'full')
    return Math.floor(Math.max(0, shift) / SHIFTS_PER_CROP_YEAR);
  let index = 0;
  while (index < CROP_YEARS_PER_CHRONICLE && cropYearStart(charter, index + 1) <= shift) index++;
  return index;
}

/** How many shifts crop year `index` runs. */
export function cropYearShifts(charter: Clock, index: number): number {
  return cropYearStart(charter, index + 1) - cropYearStart(charter, index);
}

/** The chronicle's trials, with their windows and goals. */
export function trialsFor(charter: Clock): readonly TrialDefinition[] {
  return chronicleLength(charter) === 'short' ? SHORT_TRIALS : TRIALS;
}

export function trialFor(charter: Clock, id: TrialId): TrialDefinition {
  const trials = trialsFor(charter);
  return trials.find((trial) => trial.id === id) ?? trials[0];
}

/** How many shifts ahead a trial is announced. */
export function trialTelegraphShifts(definition: TrialDefinition): number {
  return definition.telegraphShifts ?? TRIAL_TELEGRAPH_SHIFTS;
}
