import type {
  CampaignEconomics,
  CampaignPurchaseLedger,
  ShiftCampaignMetrics,
} from '../stores/operationsCampaignStore';
import { createTranslator, formatFixed, formatGrouped, type Locale } from '../i18n';
import { shiftReviewMessages } from './shiftReview.messages';
import { operationsCampaignMessages } from '../stores/operationsCampaignStore.messages';
import { incidentDescription, incidentTitle } from '../stores/incidentText';
import { recordNamesBest, type PartnerProposal } from './partnerProposals';
import { partnerProposalMessages } from './partnerProposals.messages';
import {
  formatProposalPrice,
  proposalDeciderText,
  proposalOptionLabel,
  proposalSubject,
} from './partnerProposalText';
import { customerDisplayName } from '../stores/customerNames';

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
  /**
   * What each risk is about, by index: an overdue order's customer, a proper
   * name read the same in every language. Null for a risk about no one order.
   * Absent before; two overdue orders saved without it read as one counted line.
   */
  riskSubjects?: (string | null)[];
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
  /**
   * Commitments that fell due by the window's close (open, or completed in
   * it). Absent on reports saved before it; those are graded as before.
   */
  dueInWindow?: number;
}

export function shiftMargin(
  metrics: CampaignEconomics & CampaignPurchaseLedger & Partial<ShiftCampaignMetrics>
): number {
  return (
    metrics.revenue -
    metrics.energyCost -
    metrics.automationCost -
    metrics.wasteCost -
    metrics.maintenanceCost -
    metrics.demurrageCost -
    metrics.latePenalties -
    // Grain and parts bought (plan item 3.8, 3.3); grain still held as stock
    // is credited back until it ships. Absent on a report from before them.
    (metrics.grainCost ?? 0) -
    (metrics.partsCost ?? 0) +
    (metrics.stockHeld ?? 0)
  );
}

/**
 * OEE inputs a shift records (plan item 7.6), over the minutes an order was
 * open: that is the planned production time, as a window with no customer has
 * nothing to make. Kilograms are packed kilograms.
 */
export interface ShiftOeeRecord {
  /** Unit-minutes planned: every unit that can hold a work order, times the minutes. */
  unitMinutes: number;
  /** Unit-minutes a unit was down with an open work order (an unplanned stop). */
  downUnitMinutes: number;
  packedKg: number;
  /** What the running packers' rated capacity allows at the line rate, over the seconds they packed. */
  ratedKg: number;
  /** Packed kilograms whose stamp met the minimum of the order the line worked. */
  conformingKg: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Add one tick to a shift's OEE record (tickCampaign), rounded so a save stays short. */
export function accumulateShiftOee(
  prior: ShiftOeeRecord | undefined,
  tick: {
    unitCount: number;
    minutes: number;
    unitsDown: number;
    packedKg: number;
    ratedKg: number;
    conforming: boolean;
  }
): ShiftOeeRecord {
  const finite = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  const units = finite(tick.unitCount);
  const minutes = finite(tick.minutes);
  const packed = finite(tick.packedKg);
  return {
    unitMinutes: round2((prior?.unitMinutes ?? 0) + units * minutes),
    downUnitMinutes: round2(
      (prior?.downUnitMinutes ?? 0) + Math.min(units, finite(tick.unitsDown)) * minutes
    ),
    packedKg: round2((prior?.packedKg ?? 0) + packed),
    ratedKg: round2((prior?.ratedKg ?? 0) + finite(tick.ratedKg)),
    conformingKg: round2((prior?.conformingKg ?? 0) + (tick.conforming ? packed : 0)),
  };
}

/**
 * Overall equipment effectiveness, as oee.com ("Calculating OEE", read
 * 13 November 2026) defines it: "Availability = Run Time / Planned Production
 * Time"; "Performance = (Ideal Cycle Time × Total Count) / Run Time";
 * "Quality = Good Count / Total Count"; OEE is their product. Here:
 * - availability: unit-minutes available against the unit-minutes planned;
 * - performance: kilograms packed against what the line rate allows;
 * - conforming share: kilograms that met their order's minimum against packed.
 * Null when the shift recorded none, or packed nothing.
 */
export function shiftOee(
  metrics: Pick<ShiftCampaignMetrics, 'oee'>
): { availability: number; performance: number; conforming: number; oee: number } | null {
  const record = metrics.oee;
  if (!record || !(record.unitMinutes > 0) || !(record.packedKg > 0) || !(record.ratedKg > 0))
    return null;
  const share = (part: number, whole: number) => Math.max(0, Math.min(1, part / whole));
  const availability = share(record.unitMinutes - record.downUnitMinutes, record.unitMinutes);
  const performance = share(record.packedKg, record.ratedKg);
  const conforming = share(record.conformingKg, record.packedKg);
  return { availability, performance, conforming, oee: availability * performance * conforming };
}

const percent = (share: number, locale: Locale) => formatFixed(share * 100, 1, locale);

/**
 * The review's OEE line and the margin per kilogram shipped. Null on a report
 * from before the record, and when nothing was packed or shipped.
 * Working if a pinned shift reads the same figures in both languages.
 */
export function describeShiftOee(metrics: ShiftCampaignMetrics, locale: Locale): string | null {
  const oee = shiftOee(metrics);
  if (!oee || !(metrics.dispatchedKg > 0)) return null;
  const t = createTranslator(shiftReviewMessages, locale);
  return t('oeeLine', {
    availability: percent(oee.availability, locale),
    performance: percent(oee.performance, locale),
    conforming: percent(oee.conforming, locale),
    oee: percent(oee.oee, locale),
    marginPerKg: formatFixed(shiftMargin(metrics) / metrics.dispatchedKg, 3, locale),
  });
}

/**
 * The purchase lines (plan items 3.3, 3.8) beside the review's other costs:
 * grain and parts bought, and the change in grain held as stock, a credit to
 * the net while it waits to ship and a debit as it ships. Null when the
 * report has none of them (a report from before them).
 */
export function describeShiftPurchases(
  metrics: CampaignPurchaseLedger,
  locale: Locale
): string | null {
  if (
    metrics.grainCost === undefined &&
    metrics.partsCost === undefined &&
    metrics.stockHeld === undefined
  )
    return null;
  const t = createTranslator(shiftReviewMessages, locale);
  const stock = metrics.stockHeld ?? 0;
  return t('purchasesLine', {
    grain: money(metrics.grainCost ?? 0, locale),
    parts: money(metrics.partsCost ?? 0, locale),
    stock: `${stock < 0 ? '−' : '+'}£${money(Math.abs(stock), locale)}`,
  });
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
  /**
   * Set when the order was forfeited in the window (plan item 3.7): when, why,
   * its minimum, and the best stamp the line could make on its grain. Absent
   * on every other outcome and on reports from before forfeits.
   */
  forfeit?: {
    atMinute: number;
    reason: 'unreachable' | 'late';
    minimum: number;
    best: number | null;
  };
}

export function shiftGradeBasis(
  metrics: ShiftCampaignMetrics,
  risks: string[],
  unsafeTitles: string[],
  lateDeliveries = 0,
  openIncidents?: ShiftOpenIncident[],
  riskLabelKeys?: (string | null)[],
  dueInWindow?: number,
  riskSubjects?: (string | null)[]
): ShiftGradeBasis {
  const commitmentMinutes = Math.max(0, metrics.commitmentMinutes ?? 0);
  const hours = commitmentMinutes / 60;
  return {
    commitmentMinutes,
    dispatchedKg: metrics.dispatchedKg,
    margin: shiftMargin(metrics),
    risks: [...risks],
    ...(riskLabelKeys ? { riskLabelKeys: [...riskLabelKeys] } : {}),
    ...(riskSubjects ? { riskSubjects: [...riskSubjects] } : {}),
    unsafeTitles: [...unsafeTitles],
    ...(openIncidents ? { openIncidents: openIncidents.map((incident) => ({ ...incident })) } : {}),
    qualityFailureKg: metrics.qualityFailureKg ?? 0,
    lateDeliveries: Math.max(0, lateDeliveries),
    kgForA: Math.ceil(GRADE_A_KG_PER_COMMITMENT_HOUR * hours),
    kgForB: Math.ceil(GRADE_B_KG_PER_COMMITMENT_HOUR * hours),
    ...(dueInWindow !== undefined ? { dueInWindow: Math.max(0, dueInWindow) } : {}),
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
 *
 * Each overdue order is named once, by its customer; the same label carried
 * more than once with nothing to tell them apart (a report saved before the
 * names) reads once with its count. The grade still counts every risk.
 * Working if two overdue orders read "Commitment overdue (Riverside ...);
 * Commitment overdue (Community ...)", or "Commitment overdue (2)".
 */
export function shiftRiskLabels(basis: ShiftGradeBasis, locale: Locale): string[] {
  const t = createTranslator(operationsCampaignMessages, locale);
  const labels = basis.risks.map((label, index) => {
    const key = basis.riskLabelKeys?.[index];
    const subject = basis.riskSubjects?.[index];
    if (!isCampaignLabelKey(key)) return label;
    return subject
      ? t('riskNamed', { label: t(key), subject: customerDisplayName(subject) })
      : t(key);
  });
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const review = createTranslator(shiftReviewMessages, locale);
  return [...counts].map(([label, count]) =>
    count > 1 ? review('riskRepeated', { label, countText: formatFixed(count, 0, locale) }) : label
  );
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

/**
 * A commitment was open, but none fell due by the close and nothing shipped or
 * failed QC: the first truck leaves well after a programme is accepted, so a
 * window like that has nothing to grade yet. A serious incident left open does
 * not make it gradable (it would grade F for shipping nothing, under a reason
 * saying the incident caps the grade at D); its review names the incident, as
 * a window with no commitment does.
 * Working if such a window with an open incident reads "not graded" and names it.
 */
export function nothingDueYet(basis: ShiftGradeBasis): boolean {
  return (
    basis.dueInWindow === 0 &&
    basis.commitmentMinutes > 0 &&
    basis.dispatchedKg <= 0 &&
    (basis.qualityFailureKg ?? 0) <= 0 &&
    (basis.lateDeliveries ?? 0) === 0
  );
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
  if (hasNoCommitment(basis) || nothingDueYet(basis)) return null;
  let grade = uncappedGrade(basis);
  if (basis.qualityFailureKg > 0) grade = 'F';
  if (basis.unsafeTitles.length && (grade === 'A' || grade === 'B' || grade === 'C')) grade = 'D';
  return grade;
}

/** Money in review copy: two decimals, grouped in every language. */
const money = (value: number, locale: Locale) =>
  formatGrouped(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }, locale);
/** Signed pounds, as the purchases line writes them: "£8,195.15", "−£12.50". */
const pounds = (value: number, locale: Locale) =>
  `${value < 0 ? '−' : ''}£${money(Math.abs(value), locale)}`;

/** The reasons for a grade, in the given language. */
export function shiftGradeReasons(basis: ShiftGradeBasis, locale: Locale): string[] {
  const t = createTranslator(shiftReviewMessages, locale);
  // Nothing to grade is not a clean shift when a serious incident was left
  // open: each is named, with where it is and how far it was handled.
  // Working if an ungraded window with an open incident lists it.
  const openIncidentReasons = () =>
    basis.openIncidents
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
      : basis.unsafeTitles.map((title) => t('openIncidentTitleReason', { title }));
  if (nothingDueYet(basis)) return [t('nothingDue'), ...openIncidentReasons()];
  if (hasNoCommitment(basis)) return [t('noCommitment'), ...openIncidentReasons()];
  const reasons = [
    t('dispatchReason', {
      kg: formatGrouped(Math.round(basis.dispatchedKg), undefined, locale),
      margin: pounds(basis.margin, locale),
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
  if (grade === null && nothingDueYet(basis))
    return basis.unsafeTitles.length
      ? t(severalIncidents ? 'nothingDueIncidents' : 'nothingDueIncident')
      : t('nothingDue');
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
    case 'late':
    case 'risks': {
      // Both causes consume the SAME allowance used by failsFor. A late load
      // is still counted after it left, even when an open material risk is
      // the binding cause. Working if mixed reviews name that combined total.
      // failsFor returns 'late' or 'risks' only for an A, B or C target.
      const allowed = ISSUES_ALLOWED[gap.next as 'A' | 'B' | 'C'];
      const late = basis.lateDeliveries ?? 0;
      if (basis.risks.length && late)
        return t('gapMixedIssues', {
          next,
          allowed,
          allowedText: formatFixed(allowed, 0, locale),
          risks: basis.risks.length,
          riskText: formatFixed(basis.risks.length, 0, locale),
          late,
          lateText: formatFixed(late, 0, locale),
          labels: shiftRiskLabels(basis, locale).join('; '),
        });
      if (gap.binding === 'late')
        return t('gapLate', {
          next,
          count: late,
          countText: formatFixed(late, 0, locale),
          allowed,
          allowedText: formatFixed(allowed, 0, locale),
        });
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
      return t('gapMargin', { next, amount: pounds(-basis.margin, locale) });
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

/**
 * Whether a saved risk is the due-soon warning, by its key or, on a report
 * saved before keys, by its text in either language.
 */
function isDueSoonRisk(basis: ShiftGradeBasis, index: number): boolean {
  const key = basis.riskLabelKeys?.[index];
  if (key) return key === 'constraintDueSoonLabel';
  const label = basis.risks[index];
  return (
    label === operationsCampaignMessages.en.constraintDueSoonLabel ||
    label === operationsCampaignMessages['pt-BR'].constraintDueSoonLabel
  );
}

/** One next operational step, prioritising an unresolved serious incident. */
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
  // A grade's immediate cap can be quality or routine risks while a serious
  // incident is also open. Advice follows the operational priority, without
  // changing that grade. Working if incident handling precedes throughput/QC.
  if (basis.unsafeTitles.length) return tryUnsafe();
  if (grade === null) return t(nothingDueYet(basis) ? 'tryNothingDue' : 'tryNoCommitment');
  const gap = shiftGradeGap(basis, grade);
  if (!gap) return null;
  switch (gap.binding) {
    case 'quality':
      return t('tryQuality');
    case 'unsafe':
      return tryUnsafe();
    case 'late':
      return t('tryLate');
    case 'risks': {
      // A report saved before plan 1.7 may carry "Commitment due soon", which
      // no longer counts and cannot be cleared before a close: advise on the
      // first risk that can be, else on serving the earliest-due order first.
      // Working if no review says to clear "Commitment due soon".
      const actionable = basis.risks
        .map((_, index) => index)
        .filter((index) => !isDueSoonRisk(basis, index));
      if (!actionable.length) return t('tryLate');
      const [risk] = shiftRiskLabels(
        {
          ...basis,
          risks: actionable.map((index) => basis.risks[index]),
          ...(basis.riskLabelKeys
            ? { riskLabelKeys: actionable.map((index) => basis.riskLabelKeys?.[index] ?? null) }
            : {}),
          ...(basis.riskSubjects
            ? { riskSubjects: actionable.map((index) => basis.riskSubjects?.[index] ?? null) }
            : {}),
        },
        locale
      );
      return t('tryRisk', { risk });
    }
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
    customer: customerDisplayName(outcome.customer),
    shipped: kgText(outcome.shippedKg, locale),
    required: kgText(outcome.requiredKg, locale),
  };
  const forfeit = outcome.forfeit;
  const line = forfeit
    ? forfeit.reason === 'unreachable' && forfeit.best !== null && Number.isFinite(forfeit.best)
      ? t('outcomeForfeitedUnreachable', {
          ...kg,
          duration: duration(forfeit.atMinute - outcome.dueAtMinute),
          best: formatFixed(forfeit.best, 1, locale),
          minimum: formatFixed(forfeit.minimum, 0, locale),
        })
      : t('outcomeForfeited', { ...kg, duration: duration(forfeit.atMinute - outcome.dueAtMinute) })
    : outcome.completedAtMinute !== null
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

/**
 * A partner proposal's line in the shift review, an hour after it resolved:
 * who chose which answer, what it cost and what the other answer would have
 * cost, both priced by priceOption on what the hour measured. Written to the
 * campaign log under the decider (operator and agent choices, or the plant's
 * narration for the partner), so the review's operator/controller split
 * carries it. Null until the comparison exists.
 * Working if a "run on" answered by the operator reads, an hour later, with
 * the service's price beside it and "The other answer was better."
 */
export function describeProposalRecord(
  proposal: Pick<PartnerProposal, 'kind' | 'facts' | 'resolution' | 'comparison'>,
  locale: Locale
): string | null {
  const resolution = proposal.resolution;
  const comparison = proposal.comparison;
  if (!resolution || !comparison) return null;
  const t = createTranslator(partnerProposalMessages, locale);
  const decider = proposalDeciderText(resolution.decidedBy, locale);
  const option = proposalOptionLabel(resolution.optionId, locale);
  const subject = proposalSubject(proposal as PartnerProposal, locale);
  if (!resolution.ran) return t('recordRefused', { decider, option, subject });
  const chosen = comparison.prices.find((priced) => priced.id === resolution.optionId);
  const others = comparison.prices.filter((priced) => priced.id !== resolution.optionId);
  if (!chosen || others.length === 0) return null;
  const line = others
    .map((other) =>
      t('recordLine', {
        decider,
        option,
        subject,
        chosenCost: formatProposalPrice(chosen.price, locale),
        other: proposalOptionLabel(other.id, locale),
        otherCost: formatProposalPrice(other.price, locale),
      })
    )
    .join(' ');
  // A kind whose comparison is fixed by arithmetic names no better answer,
  // even on a record saved with one (partnerProposals recordNamesBest).
  return recordNamesBest(proposal) &&
    comparison.bestOptionId !== null &&
    comparison.bestOptionId !== resolution.optionId
    ? `${line} ${t('recordOtherBetter')}`
    : line;
}

/**
 * A compared proposal as a shift report keeps it (plan 3.0, carried to 3.4):
 * what was chosen, by whom, and every answer's price an hour on, with only
 * the facts its subject is worded from. Words are made at read time, in the
 * reader's language, by describeProposalRecord.
 */
export interface ProposalRecord {
  id: string;
  kind: PartnerProposal['kind'];
  /** Only what names the subject: a programme's number, a unit's or a customer's name. */
  facts: Record<string, string | number>;
  resolution: NonNullable<PartnerProposal['resolution']>;
  comparison: NonNullable<PartnerProposal['comparison']>;
}

/** The fields each kind's subject is worded from (partnerProposalText proposalSubject). */
const SUBJECT_FACTS: Record<string, readonly string[]> = {
  programme: ['programmeNumber'],
  service: ['machineName'],
  dispatch: ['customer', 'recipeId', 'heldKg'],
  commitment: ['programmeNumber'],
  forfeit: ['customer'],
  intake: ['fallingNumberS', 'moisturePct'],
  incident: ['incidentKind'],
  temper: ['moisturePct'],
};

/** The record of a compared proposal; null until it has a comparison. */
export function proposalRecordOf(proposal: PartnerProposal): ProposalRecord | null {
  if (!proposal.resolution || !proposal.comparison) return null;
  const facts: Record<string, string | number> = {};
  const source = proposal.facts as unknown as Record<string, unknown>;
  for (const key of SUBJECT_FACTS[proposal.kind] ?? []) {
    const value = source[key];
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))
      facts[key] = value;
  }
  return {
    id: proposal.id,
    kind: proposal.kind,
    facts,
    resolution: { ...proposal.resolution },
    comparison: {
      ...proposal.comparison,
      prices: proposal.comparison.prices.map((priced) => ({ ...priced })),
    },
  };
}

/** The log line's wording for a compared proposal, so the report collects it by key. */
export function proposalRecordWording(
  proposal: PartnerProposal
): { key: 'proposalRecord'; record: ProposalRecord } | undefined {
  const record = proposalRecordOf(proposal);
  return record ? { key: 'proposalRecord', record } : undefined;
}

/** A saved record, or null when this build cannot read it. */
function readRecord(value: unknown): ProposalRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<ProposalRecord>;
  if (
    typeof record.id !== 'string' ||
    typeof record.kind !== 'string' ||
    !(record.kind in SUBJECT_FACTS) ||
    !record.facts ||
    typeof record.facts !== 'object' ||
    !record.resolution ||
    typeof record.resolution.optionId !== 'string' ||
    !record.comparison ||
    !Array.isArray(record.comparison.prices) ||
    !record.comparison.prices.every(
      (priced) =>
        !!priced &&
        typeof priced.id === 'string' &&
        !!priced.price &&
        Number.isFinite(priced.price.currency) &&
        Number.isFinite(priced.price.kg)
    )
  )
    return null;
  return record as ProposalRecord;
}

/** The text of a record kept by a report or a log line; null when unreadable. */
export function proposalRecordText(value: unknown, locale: Locale): string | null {
  const record = readRecord(value);
  if (!record) return null;
  try {
    return describeProposalRecord(record as unknown as PartnerProposal, locale);
  } catch {
    return null;
  }
}

/**
 * Every partner proposal compared in the window, worded in the reader's
 * language. A report saved before the field has none.
 * Working if ten shifts' reviews carry every record the log was given.
 */
export function describeShiftProposals(
  report: { proposals?: readonly unknown[] },
  locale: Locale
): string[] {
  if (!Array.isArray(report.proposals)) return [];
  return report.proposals.flatMap((value) => {
    const text = proposalRecordText(value, locale);
    return text ? [text] : [];
  });
}
