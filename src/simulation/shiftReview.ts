import type { ShiftCampaignMetrics } from '../stores/operationsCampaignStore';
import { createTranslator, formatFixed, formatGrouped, type Locale } from '../i18n';
import { shiftReviewMessages } from './shiftReview.messages';

/**
 * How a closed shift window is graded, from evidence the campaign already
 * records. Pure, so the closing tick and the "this shift so far" view share it.
 *
 * A grade measures the commitments a customer gave the plant. A window in
 * which no order was open and nothing shipped has nothing to grade and gets no
 * letter. The kilogram bar scales with the minutes an order was open, so the
 * half-length first window and a programme accepted late in a window are held
 * to the time they actually had.
 * Working if an idle window after a finished programme reads "No customer
 * commitments this shift" rather than F, and the quality (F) and unsafe
 * incident (D) caps still apply to every graded window.
 */

export type ShiftGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Kilograms dispatched per game hour on a commitment for an A and for a B:
 * the old 4,000 and 2,500 kg bars over an eight-hour window, per hour.
 */
export const GRADE_A_KG_PER_COMMITMENT_HOUR = 500;
export const GRADE_B_KG_PER_COMMITMENT_HOUR = 312.5;

/** The evidence a grade is computed from, stored with the report. */
export interface ShiftGradeBasis {
  /** Game minutes in the window during which a customer order was open. */
  commitmentMinutes: number;
  dispatchedKg: number;
  /** Net contribution: revenue less every recorded cost. */
  margin: number;
  /** Material or deadline risks still open when the window closed. */
  risks: string[];
  /** Unresolved high or critical incidents at close, by title. */
  unsafeTitles: string[];
  qualityFailureKg: number;
  /** The kilogram bars in force for this window. */
  kgForA: number;
  kgForB: number;
}

export function shiftMargin(metrics: ShiftCampaignMetrics): number {
  return (
    metrics.revenue -
    metrics.energyCost -
    metrics.automationCost -
    metrics.wasteCost -
    metrics.maintenanceCost -
    metrics.demurrageCost -
    metrics.latePenalties
  );
}

export function shiftGradeBasis(
  metrics: ShiftCampaignMetrics,
  risks: string[],
  unsafeTitles: string[]
): ShiftGradeBasis {
  const commitmentMinutes = Math.max(0, metrics.commitmentMinutes ?? 0);
  const hours = commitmentMinutes / 60;
  return {
    commitmentMinutes,
    dispatchedKg: metrics.dispatchedKg,
    margin: shiftMargin(metrics),
    risks: [...risks],
    unsafeTitles: [...unsafeTitles],
    qualityFailureKg: metrics.qualityFailureKg ?? 0,
    kgForA: Math.ceil(GRADE_A_KG_PER_COMMITMENT_HOUR * hours),
    kgForB: Math.ceil(GRADE_B_KG_PER_COMMITMENT_HOUR * hours),
  };
}

/** True when no customer asked the plant for anything during the window. */
export function hasNoCommitment(basis: ShiftGradeBasis): boolean {
  return basis.commitmentMinutes <= 0 && basis.dispatchedKg <= 0;
}

/** The letter before caps: delivery against the bar, risks and margin. */
function uncappedGrade(basis: ShiftGradeBasis): ShiftGrade {
  const kg = basis.dispatchedKg;
  const risks = basis.risks.length;
  if (kg > 0 && risks === 0 && basis.margin >= 0 && kg >= basis.kgForA) return 'A';
  if (kg > 0 && risks <= 1 && basis.margin >= 0 && kg >= basis.kgForB) return 'B';
  if (kg > 0 && risks <= 2) return 'C';
  if (kg > 0) return 'D';
  return 'F';
}

/** Null means no customer commitments: nothing to grade, so no letter. */
export function gradeShift(basis: ShiftGradeBasis): ShiftGrade | null {
  if (hasNoCommitment(basis)) return null;
  let grade = uncappedGrade(basis);
  if (basis.qualityFailureKg > 0) grade = 'F';
  if (basis.unsafeTitles.length && (grade === 'A' || grade === 'B' || grade === 'C')) grade = 'D';
  return grade;
}

/** The reasons for a grade, in the given language. */
export function shiftGradeReasons(basis: ShiftGradeBasis, locale: Locale): string[] {
  const t = createTranslator(shiftReviewMessages, locale);
  if (hasNoCommitment(basis)) return [t('noCommitment')];
  const reasons = [
    t('dispatchReason', {
      kg: formatGrouped(Math.round(basis.dispatchedKg), undefined, locale),
      margin: formatFixed(basis.margin, 2, locale),
    }),
    t('riskReason', {
      count: basis.risks.length,
      countText: formatFixed(basis.risks.length, 0, locale),
    }),
  ];
  if (basis.qualityFailureKg > 0)
    reasons.push(
      t('qualityFailureReason', {
        kg: formatGrouped(Math.round(basis.qualityFailureKg), undefined, locale),
      })
    );
  if (basis.unsafeTitles.length)
    reasons.push(t('unsafeReason', { titles: basis.unsafeTitles.join(', ') }));
  return reasons;
}
