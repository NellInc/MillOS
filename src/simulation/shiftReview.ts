import type { ShiftCampaignMetrics } from '../stores/operationsCampaignStore';
import { createTranslator, formatFixed, formatGrouped, type Locale } from '../i18n';
import { shiftReviewMessages } from './shiftReview.messages';
import { operationsCampaignMessages } from '../stores/operationsCampaignStore.messages';
import { incidentDescription, incidentTitle } from '../stores/incidentText';

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
  /** Its kind, so a review reads its title and place in the reader's language (absent before). */
  kind?: string;
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
  /**
   * The catalogue key of each risk's label, by index, so a review read after a
   * language switch words it again (shiftRiskLabels). Absent before; those
   * reports keep the text they saved.
   */
  riskLabelKeys?: (string | null)[];
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
  openIncidents?: ShiftOpenIncident[],
  riskLabelKeys?: (string | null)[]
): ShiftGradeBasis {
  const commitmentMinutes = Math.max(0, metrics.commitmentMinutes ?? 0);
  const hours = commitmentMinutes / 60;
  return {
    commitmentMinutes,
    dispatchedKg: metrics.dispatchedKg,
    margin: shiftMargin(metrics),
    risks: [...risks],
    ...(riskLabelKeys ? { riskLabelKeys: [...riskLabelKeys] } : {}),
    unsafeTitles: [...unsafeTitles],
    ...(openIncidents ? { openIncidents: openIncidents.map((incident) => ({ ...incident })) } : {}),
    qualityFailureKg: metrics.qualityFailureKg ?? 0,
    lateDeliveries: Math.max(0, lateDeliveries),
    kgForA: Math.ceil(GRADE_A_KG_PER_COMMITMENT_HOUR * hours),
    kgForB: Math.ceil(GRADE_B_KG_PER_COMMITMENT_HOUR * hours),
  };
}

type CampaignEn = typeof operationsCampaignMessages.en;
type CampaignLabelKey = {
  [K in keyof CampaignEn]: CampaignEn[K] extends string ? K : never;
}[keyof CampaignEn] &
  string;
const isCampaignLabelKey = (key: unknown): key is CampaignLabelKey =>
  typeof key === 'string' &&
  Object.prototype.hasOwnProperty.call(operationsCampaignMessages.en, key) &&
  typeof operationsCampaignMessages.en[key as keyof CampaignEn] === 'string';

/*
 * A report is saved in the language active when its window closed. Its risks
 * and open incidents are worded again here, in the reader's language; a risk
 * or incident saved without its key or kind keeps the text it saved.
 * Working if a report closed in English reads wholly in pt-BR after a switch.
 */
export function shiftRiskLabels(basis: ShiftGradeBasis, locale: Locale): string[] {
  const t = createTranslator(operationsCampaignMessages, locale);
  return basis.risks.map((label, index) => {
    const key = basis.riskLabelKeys?.[index];
    return isCampaignLabelKey(key) ? t(key) : label;
  });
}

function unsafeTitles(basis: ShiftGradeBasis, locale: Locale): string[] {
  return basis.unsafeTitles.map((title, index) => {
    const kind = basis.openIncidents?.[index]?.kind;
    return kind ? incidentTitle({ kind, title }, locale) : title;
  });
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
        ? basis.openIncidents.map((incident) =>
            t('openIncidentReason', {
              phase: incident.phase,
              title: incident.kind
                ? incidentTitle({ kind: incident.kind, title: incident.title }, locale)
                : incident.title,
              detail: incident.kind
                ? incidentDescription({ kind: incident.kind, description: incident.detail }, locale)
                : incident.detail,
            })
          )
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
    reasons.push(t('unsafeReason', { titles: unsafeTitles(basis, locale).join(', ') }));
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
  const severalIncidents = basis.unsafeTitles.length > 1;
  if (grade === null)
    return basis.unsafeTitles.length
      ? t(severalIncidents ? 'noCommitmentIncidents' : 'noCommitmentIncident')
      : t('noCommitment');
  if (grade === 'A' || grade === 'B')
    return t('headlineGood', { kg: kgText(basis.dispatchedKg, locale) });
  const gap = shiftGradeGap(basis, grade);
  const cause = gap?.binding ?? 'risks';
  return t('headlineHeldBack', {
    kg: kgText(basis.dispatchedKg, locale),
    // "a late delivery" names one; two or more read as late deliveries, and
    // likewise for unresolved incidents.
    cause:
      cause === 'late' && basis.lateDeliveries > 1
        ? 'lateMany'
        : cause === 'unsafe' && severalIncidents
          ? 'unsafeMany'
          : cause,
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
      return t('gapUnsafe', { next, titles: unsafeTitles(basis, locale).join(', ') });
    // Late deliveries and carried risks share one allowance, so each line
    // names what is left of it once the other kind is counted: two late with
    // no risks is one too many for a B, not "every delivery on time".
    // Working if every allowance this copy states would have earned `next`.
    case 'late': {
      // failsFor returns 'late' only for an A, B or C target.
      const allowed = Math.max(0, ISSUES_ALLOWED[gap.next as 'A' | 'B' | 'C'] - basis.risks.length);
      return t('gapLate', {
        next,
        allowed,
        allowedText: formatFixed(allowed, 0, locale),
        count: basis.lateDeliveries,
        countText: formatFixed(basis.lateDeliveries, 0, locale),
      });
    }
    case 'risks': {
      // failsFor returns 'risks' only for an A, B or C target.
      const allowed = Math.max(
        0,
        ISSUES_ALLOWED[gap.next as 'A' | 'B' | 'C'] - (basis.lateDeliveries ?? 0)
      );
      return t('gapRisks', {
        next,
        allowed,
        allowedText: formatFixed(allowed, 0, locale),
        count: basis.risks.length,
        countText: formatFixed(basis.risks.length, 0, locale),
        labels: shiftRiskLabels(basis, locale).join('; '),
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
  // "as soon as it is raised" names one; several are each raised and resolved.
  const tryUnsafe = () =>
    t('tryUnsafe', {
      titles: unsafeTitles(basis, locale).join(', '),
      count: basis.unsafeTitles.length,
    });
  if (grade === null) return basis.unsafeTitles.length ? tryUnsafe() : t('tryNoCommitment');
  const gap = shiftGradeGap(basis, grade);
  if (!gap) return null;
  switch (gap.binding) {
    case 'quality':
      return t('tryQuality');
    case 'unsafe':
      return tryUnsafe();
    case 'late':
      return t('tryLate');
    case 'risks':
      return basis.risks.length
        ? t('tryRisk', { risk: shiftRiskLabels(basis, locale)[0] })
        : t('tryLate');
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
  // Whole minutes, rounded up as the shift card's deadline above this report
  // rounds them (deriveDeliveryDeadline), so a part minute counts: "0m late"
  // contradicts the grade, which counts any delivery past its due time as late.
  // Working if "due in" and "overdue" name the card's minutes.
  const duration = (minutes: number) =>
    formatShiftDuration(Math.max(1, Math.ceil(minutes)), locale);
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
            duration: duration(outcome.completedAtMinute - outcome.dueAtMinute),
          })
      : endedAtMinute > outcome.dueAtMinute
        ? t('outcomeOverdue', {
            ...kg,
            duration: duration(endedAtMinute - outcome.dueAtMinute),
          })
        : t('outcomeOpen', {
            ...kg,
            duration: duration(outcome.dueAtMinute - endedAtMinute),
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
