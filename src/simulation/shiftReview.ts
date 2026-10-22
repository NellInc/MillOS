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
 * incident (D) caps still apply to every graded window. An ungraded window
 * with a serious incident still open has no letter either, but its review
 * names the incident and its next step rather than reading as clean.
 */

export type ShiftGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Kilograms dispatched per game hour on a commitment for an A and for a B:
 * the old 4,000 and 2,500 kg bars over an eight-hour window, per hour.
 */
export const GRADE_A_KG_PER_COMMITMENT_HOUR = 500;
export const GRADE_B_KG_PER_COMMITMENT_HOUR = 312.5;

/** A serious incident still open when the window closed. */
export interface ShiftOpenIncident {
  title: string;
  /** The incident's description, which names where it is. */
  detail: string;
  phase: 'raised' | 'acknowledged' | 'mitigated';
}

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
  /**
   * The same incidents with where they are (their description) and how far
   * they were handled. Optional: reports saved before it name titles only.
   */
  openIncidents?: ShiftOpenIncident[];
  qualityFailureKg: number;
  /** Orders fulfilled in this window after their deadline. */
  lateDeliveries: number;
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

/**
 * One order as it stood when the window closed, copied into the report: the
 * campaign keeps only its last 30 orders, so ids alone stop resolving.
 */
export interface ShiftOrderOutcome {
  id: string;
  customer: string;
  requiredKg: number;
  shippedKg: number;
  dueAtMinute: number;
  completedAtMinute: number | null;
  qualityFailureKg: number;
}

export function shiftGradeBasis(
  metrics: ShiftCampaignMetrics,
  risks: string[],
  unsafeTitles: string[],
  lateDeliveries = 0,
  openIncidents?: ShiftOpenIncident[]
): ShiftGradeBasis {
  const commitmentMinutes = Math.max(0, metrics.commitmentMinutes ?? 0);
  const hours = commitmentMinutes / 60;
  return {
    commitmentMinutes,
    dispatchedKg: metrics.dispatchedKg,
    margin: shiftMargin(metrics),
    risks: [...risks],
    unsafeTitles: [...unsafeTitles],
    ...(openIncidents ? { openIncidents: openIncidents.map((incident) => ({ ...incident })) } : {}),
    qualityFailureKg: metrics.qualityFailureKg ?? 0,
    lateDeliveries: Math.max(0, lateDeliveries),
    kgForA: Math.ceil(GRADE_A_KG_PER_COMMITMENT_HOUR * hours),
    kgForB: Math.ceil(GRADE_B_KG_PER_COMMITMENT_HOUR * hours),
  };
}

/** True when no customer asked the plant for anything during the window. */
export function hasNoCommitment(basis: ShiftGradeBasis): boolean {
  return basis.commitmentMinutes <= 0 && basis.dispatchedKg <= 0;
}

/** Carried risks plus late deliveries: an A allows none, a B one, a C two. */
const issueCount = (basis: ShiftGradeBasis) => basis.risks.length + (basis.lateDeliveries ?? 0);
const ISSUES_ALLOWED: Record<'A' | 'B' | 'C', number> = { A: 0, B: 1, C: 2 };

/** Why `target` was not reached, in the order a player can act on it. */
export type ShiftBinding = 'late' | 'risks' | 'margin' | 'kg' | 'no_dispatch';

function failsFor(basis: ShiftGradeBasis, target: ShiftGrade): ShiftBinding | null {
  const kg = basis.dispatchedKg;
  if (target === 'F') return null;
  if (kg <= 0) return 'no_dispatch';
  if (target === 'D') return null;
  if (issueCount(basis) > ISSUES_ALLOWED[target])
    return basis.risks.length <= ISSUES_ALLOWED[target] ? 'late' : 'risks';
  if (target === 'C') return null;
  if (basis.margin < 0) return 'margin';
  if (kg < (target === 'A' ? basis.kgForA : basis.kgForB)) return 'kg';
  return null;
}

/** The letter before caps: delivery against the bar, issues and margin. */
function uncappedGrade(basis: ShiftGradeBasis): ShiftGrade {
  return (['A', 'B', 'C', 'D'] as const).find((grade) => !failsFor(basis, grade)) ?? 'F';
}

/** Null means no customer commitments: nothing to grade, so no letter. */
export function gradeShift(basis: ShiftGradeBasis): ShiftGrade | null {
  if (hasNoCommitment(basis)) return null;
  let grade = uncappedGrade(basis);
  if (basis.qualityFailureKg > 0) grade = 'F';
  if (basis.unsafeTitles.length && (grade === 'A' || grade === 'B' || grade === 'C')) grade = 'D';
  return grade;
}

/** Money in review copy: two decimals, grouped in every language. */
const money = (value: number, locale: Locale) =>
  formatGrouped(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, locale);

/** The reasons for a grade, in the given language. */
export function shiftGradeReasons(basis: ShiftGradeBasis, locale: Locale): string[] {
  const t = createTranslator(shiftReviewMessages, locale);
  // Nothing to grade is not a clean shift when a serious incident was left
  // open: each is named, with where it is and how far it was handled.
  // Working if an ungraded window with an open incident lists it.
  if (hasNoCommitment(basis))
    return [
      t('noCommitment'),
      ...(basis.openIncidents
        ? basis.openIncidents.map((incident) => t('openIncidentReason', { ...incident }))
        : basis.unsafeTitles.map((title) => t('openIncidentTitleReason', { title }))),
    ];
  const reasons = [
    t('dispatchReason', {
      kg: formatGrouped(Math.round(basis.dispatchedKg), undefined, locale),
      margin: money(basis.margin, locale),
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

const NEXT_GRADE: Record<ShiftGrade, ShiftGrade | null> = {
  A: null,
  B: 'A',
  C: 'B',
  D: 'C',
  F: 'D',
};

export interface ShiftGradeGap {
  next: ShiftGrade;
  binding: 'quality' | 'unsafe' | ShiftBinding;
  /** Kilograms short of the next grade's bar when the binding is 'kg'. */
  shortKg: number;
}

/** What stood between this grade and the next one up. Null for an A or no grade. */
export function shiftGradeGap(
  basis: ShiftGradeBasis,
  grade: ShiftGrade | null
): ShiftGradeGap | null {
  if (grade === null) return null;
  const next = NEXT_GRADE[grade];
  if (!next) return null;
  if (basis.qualityFailureKg > 0) return { next, binding: 'quality', shortKg: 0 };
  const binding = failsFor(basis, next);
  if (!binding && basis.unsafeTitles.length) return { next, binding: 'unsafe', shortKg: 0 };
  if (!binding) return null;
  const bar = next === 'A' ? basis.kgForA : basis.kgForB;
  return {
    next,
    binding,
    shortKg: binding === 'kg' ? Math.max(0, Math.ceil(bar - basis.dispatchedKg)) : 0,
  };
}

/** "3h 43m" in English, "3h 43min" in pt-BR. */
export function formatShiftDuration(minutes: number, locale: Locale): string {
  const t = createTranslator(shiftReviewMessages, locale);
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours > 0
    ? t('durationHours', {
        hours: formatFixed(hours, 0, locale),
        minutes: formatFixed(rest, 0, locale),
      })
    : t('durationMinutes', { minutes: formatFixed(rest, 0, locale) });
}

const kgText = (kg: number, locale: Locale) => formatGrouped(Math.round(kg), undefined, locale);

/** The one-line headline: never a repeat of the reasons listed under it. */
export function shiftHeadline(
  basis: ShiftGradeBasis,
  grade: ShiftGrade | null,
  locale: Locale
): string {
  const t = createTranslator(shiftReviewMessages, locale);
  if (grade === null)
    return basis.unsafeTitles.length ? t('noCommitmentIncident') : t('noCommitment');
  if (grade === 'A' || grade === 'B')
    return t('headlineGood', { kg: kgText(basis.dispatchedKg, locale) });
  const gap = shiftGradeGap(basis, grade);
  return t('headlineHeldBack', {
    kg: kgText(basis.dispatchedKg, locale),
    cause: gap?.binding ?? 'risks',
  });
}

/** The gap to the next grade, from the bars stored with the report. */
export function describeShiftGap(
  basis: ShiftGradeBasis,
  grade: ShiftGrade | null,
  locale: Locale
): string | null {
  const gap = shiftGradeGap(basis, grade);
  if (!gap) return null;
  const t = createTranslator(shiftReviewMessages, locale);
  // A bare letter reads as a word ("C needs ..."); name it as the grade. The
  // label is copy only: bars and allowances are looked up by `gap.next`.
  const next = t('gradeLabel', { grade: gap.next });
  switch (gap.binding) {
    case 'quality':
      return t('gapQuality', { next });
    case 'unsafe':
      return t('gapUnsafe', { next, titles: basis.unsafeTitles.join(', ') });
    case 'late':
      return t('gapLate', {
        next,
        count: basis.lateDeliveries,
        countText: formatFixed(basis.lateDeliveries, 0, locale),
      });
    case 'risks': {
      // failsFor returns 'risks' only for an A, B or C target.
      const allowed = ISSUES_ALLOWED[gap.next as 'A' | 'B' | 'C'];
      return t('gapRisks', {
        next,
        allowed,
        allowedText: formatFixed(allowed, 0, locale),
        count: basis.risks.length,
        countText: formatFixed(basis.risks.length, 0, locale),
        labels: basis.risks.join('; '),
      });
    }
    case 'margin':
      return t('gapMargin', { next, amount: money(-basis.margin, locale) });
    case 'kg':
      return t('gapKg', {
        next,
        target: kgText(gap.next === 'A' ? basis.kgForA : basis.kgForB, locale),
        duration: formatShiftDuration(basis.commitmentMinutes, locale),
        short: kgText(gap.shortKg, locale),
      });
    case 'no_dispatch':
      return t('gapNoDispatch', { next });
  }
}

/** One thing to try next, keyed to what held the grade back. */
export function describeShiftTryNext(
  basis: ShiftGradeBasis,
  grade: ShiftGrade | null,
  locale: Locale
): string | null {
  const t = createTranslator(shiftReviewMessages, locale);
  if (grade === null)
    return basis.unsafeTitles.length
      ? t('tryUnsafe', { titles: basis.unsafeTitles.join(', ') })
      : t('tryNoCommitment');
  const gap = shiftGradeGap(basis, grade);
  if (!gap) return null;
  switch (gap.binding) {
    case 'quality':
      return t('tryQuality');
    case 'unsafe':
      return t('tryUnsafe', { titles: basis.unsafeTitles.join(', ') });
    case 'late':
      return t('tryLate');
    case 'risks':
      return basis.risks.length ? t('tryRisk', { risk: basis.risks[0] }) : t('tryLate');
    case 'margin':
      return t('tryMargin');
    case 'kg':
    case 'no_dispatch':
      return t('tryKg');
  }
}

/** One order line: what it got, and whether on time. */
export function describeOrderOutcome(
  outcome: ShiftOrderOutcome,
  endedAtMinute: number,
  locale: Locale
): string {
  const t = createTranslator(shiftReviewMessages, locale);
  const kg = {
    customer: outcome.customer,
    shipped: kgText(outcome.shippedKg, locale),
    required: kgText(outcome.requiredKg, locale),
  };
  const line =
    outcome.completedAtMinute !== null
      ? outcome.completedAtMinute <= outcome.dueAtMinute + 1e-6
        ? t('outcomeOnTime', kg)
        : t('outcomeLate', {
            ...kg,
            duration: formatShiftDuration(outcome.completedAtMinute - outcome.dueAtMinute, locale),
          })
      : endedAtMinute > outcome.dueAtMinute
        ? t('outcomeOverdue', {
            ...kg,
            duration: formatShiftDuration(endedAtMinute - outcome.dueAtMinute, locale),
          })
        : t('outcomeOpen', {
            ...kg,
            duration: formatShiftDuration(outcome.dueAtMinute - endedAtMinute, locale),
          });
  return outcome.qualityFailureKg > 0
    ? `${line} ${t('outcomeQualityFailure', { kg: kgText(outcome.qualityFailureKg, locale) })}`
    : line;
}

/** The window's name in the reader's language, from its key ("day-0-night"). */
export function shiftWindowName(shiftKey: string, fallback: string, locale: Locale): string {
  const match = /(morning|afternoon|night)$/.exec(shiftKey);
  return match
    ? createTranslator(shiftReviewMessages, locale)('shiftName', { shift: match[1] })
    : fallback;
}
