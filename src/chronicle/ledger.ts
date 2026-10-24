/**
 * Where every number comes from, after Predynastic Egypt's source types
 * (source_types.txt: cells, population, events, trading, technologies,
 * consumption). The fund and know-how ledgers and the plant economics are all
 * rendered as signed source breakdowns.
 */
import type { CampaignEconomics } from '../stores/operationsCampaignStore';
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
};

export const KNOW_HOW_SOURCE_LABELS: Record<KnowHowSource, string> = {
  grades: 'Shift grades',
  qc: 'Passed QC tests',
  notes: 'History notes read',
  quiz: 'Quiz answers',
  medals: 'Trial and challenge medals',
  events: 'Events',
  plans: 'Plans drawn up',
  forced_maintenance: 'Forced maintenance',
  library: 'Members library',
  event_costs: 'Spent on events',
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
});

export function emptyLedger(): ChronicleLedger {
  return { fund: zeroFund(), knowHow: zeroKnowHow(), lastShiftFund: {}, lastShiftKnowHow: {} };
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
    lastShiftFund: inShift
      ? { ...ledger.lastShiftFund, [source]: round((ledger.lastShiftFund[source] ?? 0) + amount) }
      : ledger.lastShiftFund,
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
    lastShiftKnowHow: inShift
      ? {
          ...ledger.lastShiftKnowHow,
          [source]: round((ledger.lastShiftKnowHow[source] ?? 0) + amount),
        }
      : ledger.lastShiftKnowHow,
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

export const ECONOMICS_LABELS: Record<keyof CampaignEconomics, string> = {
  revenue: 'Revenue from dispatched commitments',
  energyCost: 'Energy',
  automationCost: 'Automation',
  wasteCost: 'Waste',
  maintenanceCost: 'Maintenance work orders',
  demurrageCost: 'Demurrage',
  latePenalties: 'Late and quality penalties',
};

/** The plant ledger as signed lines: revenue positive, every cost negative. */
export function economicsLines(economics: CampaignEconomics): SourceLine[] {
  const signed: Record<keyof CampaignEconomics, number> = {
    revenue: economics.revenue,
    energyCost: -economics.energyCost,
    automationCost: -economics.automationCost,
    wasteCost: -economics.wasteCost,
    maintenanceCost: -economics.maintenanceCost,
    demurrageCost: -economics.demurrageCost,
    latePenalties: -economics.latePenalties,
  };
  return sourceLines(signed, ECONOMICS_LABELS);
}

export function netContribution(economics: CampaignEconomics): number {
  return round(
    economics.revenue -
      economics.energyCost -
      economics.automationCost -
      economics.wasteCost -
      economics.maintenanceCost -
      economics.demurrageCost -
      economics.latePenalties
  );
}
