import { translate } from '../i18n';
import { ledgerMessages } from './ledger.messages';
/**
 * Where every number comes from, after Predynastic Egypt's source types
 * (source_types.txt: cells, population, events, trading, technologies,
 * consumption). The fund and know-how ledgers and the plant economics are all
 * rendered as signed source breakdowns.
 */
import type { CampaignEconomics, CampaignPurchaseLedger } from '../stores/operationsCampaignStore';
import { shiftMargin } from '../simulation/shiftReview';
import type { ChronicleLedger, FundSource, KnowHowSource } from './types';

export const FUND_SOURCE_LABELS: Record<FundSource, string> = {
  charter: 'Opening fund',
  reinvestment: 'Reinvested contribution',
  loyalty: 'Loyalty premium',
  events: 'Events',
  upkeep: 'Plant upkeep',
  mitigation: 'Forecast mitigations',
  installs: 'Plan installs',
  contractors: 'Contractor retainers',
  refunds: 'Refunds',
  suppression: 'Fire suppression',
  treatment: 'Crop treatment',
  // Quota premiums, and the upkeep an accepted administrator's federation pays.
  federation: 'Federation payments',
  reserve: 'Co-op reserve',
  concessions: 'Needs met',
  avoided: 'Costs plans avoided',
  drying: 'Drying avoided',
};

export const KNOW_HOW_SOURCE_LABELS: Record<KnowHowSource, string> = {
  grades: 'Shift grades',
  // A batch earns once however often it is tested, so the line counts batches.
  qc: 'Batches that passed QC',
  notes: 'History notes read',
  quiz: 'Quiz answers',
  medals: 'Trial and challenge medals',
  events: 'Events',
  plans: 'Plans drawn up',
  forced_maintenance: 'Forced maintenance',
  library: 'Members library',
  event_costs: 'Spent on events',
  policies: 'Policy changes',
};

const zeroFund = (): Record<FundSource, number> => ({
  charter: 0,
  reinvestment: 0,
  loyalty: 0,
  events: 0,
  upkeep: 0,
  mitigation: 0,
  installs: 0,
  contractors: 0,
  refunds: 0,
  suppression: 0,
  treatment: 0,
  federation: 0,
  reserve: 0,
  concessions: 0,
  avoided: 0,
  drying: 0,
});

const zeroKnowHow = (): Record<KnowHowSource, number> => ({
  grades: 0,
  qc: 0,
  notes: 0,
  quiz: 0,
  medals: 0,
  events: 0,
  plans: 0,
  forced_maintenance: 0,
  library: 0,
  event_costs: 0,
  policies: 0,
});

export function emptyLedger(): ChronicleLedger {
  return {
    fund: zeroFund(),
    knowHow: zeroKnowHow(),
    lastShiftFund: {},
    lastShiftKnowHow: {},
    sinceCloseFund: {},
    sinceCloseKnowHow: {},
  };
}

/**
 * A shift close begins: what moved since the previous close is not this
 * close's doing, so the running tally starts empty.
 */
export function openShiftClose(ledger: ChronicleLedger): ChronicleLedger {
  return { ...ledger, sinceCloseFund: {}, sinceCloseKnowHow: {} };
}

/**
 * A shift close ends: its tally becomes "the last close", and spending from
 * here on is counted apart from it.
 */
export function finishShiftClose(ledger: ChronicleLedger): ChronicleLedger {
  return {
    ...ledger,
    lastShiftFund: ledger.sinceCloseFund,
    lastShiftKnowHow: ledger.sinceCloseKnowHow,
    sinceCloseFund: {},
    sinceCloseKnowHow: {},
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function recordFund(
  ledger: ChronicleLedger,
  source: FundSource,
  amount: number,
  inShift = true
): ChronicleLedger {
  if (!Number.isFinite(amount) || amount === 0) return ledger;
  return {
    ...ledger,
    fund: { ...ledger.fund, [source]: round(ledger.fund[source] + amount) },
    sinceCloseFund: inShift
      ? { ...ledger.sinceCloseFund, [source]: round((ledger.sinceCloseFund[source] ?? 0) + amount) }
      : ledger.sinceCloseFund,
  };
}

export function recordKnowHow(
  ledger: ChronicleLedger,
  source: KnowHowSource,
  amount: number,
  inShift = true
): ChronicleLedger {
  if (!Number.isFinite(amount) || amount === 0) return ledger;
  return {
    ...ledger,
    knowHow: { ...ledger.knowHow, [source]: round(ledger.knowHow[source] + amount) },
    sinceCloseKnowHow: inShift
      ? {
          ...ledger.sinceCloseKnowHow,
          [source]: round((ledger.sinceCloseKnowHow[source] ?? 0) + amount),
        }
      : ledger.sinceCloseKnowHow,
  };
}

export function fundBalance(ledger: ChronicleLedger): number {
  return round(Object.values(ledger.fund).reduce((sum, value) => sum + value, 0));
}

export function knowHowBalance(ledger: ChronicleLedger): number {
  return round(Object.values(ledger.knowHow).reduce((sum, value) => sum + value, 0));
}

/** Know-how ever earned (spending on plans and forced maintenance excluded). */
export function knowHowEarned(ledger: ChronicleLedger): number {
  return round(
    Object.entries(ledger.knowHow).reduce(
      (sum, [source, value]) =>
        source === 'plans' || source === 'forced_maintenance' ? sum : sum + Math.max(0, value),
      0
    )
  );
}

export interface SourceLine {
  key: string;
  label: string;
  value: number;
}

/** Signed source lines, largest magnitude first, zero lines dropped. */
export function sourceLines<K extends string>(
  values: Partial<Record<K, number>>,
  labels: Record<K, string>
): SourceLine[] {
  return (Object.keys(labels) as K[])
    .map((key) => ({ key, label: labels[key], value: round(values[key] ?? 0) }))
    .filter((line) => line.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/**
 * The plant's ledger: the cost lines, and the purchase lines (grain, parts,
 * grain held as stock) that a save from before them lacks.
 */
export type PlantLedger = CampaignEconomics & CampaignPurchaseLedger;

/**
 * The net the shift review computes (`shiftMargin`), so the fund is fed the
 * figure the review prints: grain and parts bought are costs, and grain still
 * held as stock is credited back until it ships. A report saved before those
 * lines has none, and its net is what it always was.
 */
export function netContribution(economics: PlantLedger): number {
  return round(shiftMargin(economics));
}

/** Resolve source labels when presented; ledger values and keys are canonical. */
export function localizedSourceLabels<K extends string>(
  labels: Record<K, string>
): Record<K, string> {
  return Object.fromEntries(
    Object.entries(labels).map(([key, label]) => {
      const messageKey = Object.keys(ledgerMessages.en).find(
        (id) => ledgerMessages.en[id as keyof typeof ledgerMessages.en] === label
      );
      return [
        key,
        messageKey
          ? translate(ledgerMessages, messageKey as keyof typeof ledgerMessages.en)
          : label,
      ];
    })
  ) as Record<K, string>;
}

export const ECONOMICS_LABELS: Record<keyof PlantLedger, string> = {
  revenue: 'Revenue from dispatched commitments',
  energyCost: 'Energy',
  automationCost: 'Automation',
  wasteCost: 'Waste',
  maintenanceCost: 'Maintenance work orders',
  demurrageCost: 'Demurrage',
  latePenalties: 'Late and quality penalties',
  grainCost: 'Grain bought',
  partsCost: 'Spare parts bought',
  stockHeld: 'Grain still held as stock',
};

/**
 * The plant ledger as signed lines: revenue positive, every cost negative,
 * grain held as stock positive (it is credited back until it ships).
 */
export function economicsLines(economics: PlantLedger): SourceLine[] {
  const signed: Record<keyof PlantLedger, number> = {
    revenue: economics.revenue,
    energyCost: -economics.energyCost,
    automationCost: -economics.automationCost,
    wasteCost: -economics.wasteCost,
    maintenanceCost: -economics.maintenanceCost,
    demurrageCost: -economics.demurrageCost,
    latePenalties: -economics.latePenalties,
    grainCost: -(economics.grainCost ?? 0),
    partsCost: -(economics.partsCost ?? 0),
    stockHeld: economics.stockHeld ?? 0,
  };
  return sourceLines(signed, ECONOMICS_LABELS);
}

export function localizedEconomicsLines(economics: PlantLedger): SourceLine[] {
  return economicsLines(economics).map((line) => ({
    ...line,
    label: localizedSourceLabels(ECONOMICS_LABELS)[line.key as keyof PlantLedger],
  }));
}
