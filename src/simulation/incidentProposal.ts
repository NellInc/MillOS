/**
 * The `incident` proposal (plan item 3.5): an incident is raised, and the
 * partner proposes how to meet it, from two answers per incident kind
 * (simulation/incidentResponses.ts).
 *
 * Two routes, told apart by the incident's own `origin`:
 * - plant-raised (`origin: 'plant'`: a started recovery challenge, or a roller
 *   mill that failed after its service was answered "run on"): the answer is
 *   the response, and the incident resolves PLANT_INCIDENT_MINUTES later.
 * - Chronicle-raised (no origin; the Chronicle owns and restores it): the
 *   answer only chooses how it is mitigated. Acknowledging it and restoring
 *   it stay the Chronicle's, so nothing here ends it.
 *
 * Each answer is priced from what the incident does and what the ledger
 * charges: the stamp against each open order's minimum (its quality share),
 * the energy its energy share draws at the site's rate for the incident's
 * minutes, and an answer's own booking (a relief lorry at the demurrage rate
 * for the delay it saves, a filter at its part price, recalled flour at the
 * waste rate). A delay that would make an order late is priced at that
 * order's late rate. Throughput is shown nowhere: measured, a production
 * multiplier costs this plant no tonnes (the dock binds).
 *
 * Pure; registered in partnerProposals.ts PROPOSAL_KINDS.
 */
import type { IncidentKind } from '../stores/operationsCampaignStore';
import { INCIDENT_RESPONSES, incidentResponse, INCIDENT_OPTION_IDS } from './incidentResponses';
import type {
  OptionPrice,
  PartnerProposal,
  PlantWorld,
  PricedOption,
  ProposalKindDefinition,
  ProposalReason,
} from './partnerProposals';

/** An incident waits 15 game minutes for an answer (30 real seconds at the standard pace). */
export const INCIDENT_WINDOW_MINUTES = 15;

export interface IncidentFacts {
  incidentId: string;
  incidentKind: IncidentKind;
  origin: 'plant' | 'chronicle';
  machineId: string | null;
  /** The incident's own effect (INCIDENT_DEFINITIONS). */
  qualityPenalty: number;
  energyMultiplier: number;
  /** Game minutes the answer is priced over (PLANT_INCIDENT_MINUTES). */
  minutes: number;
  /** The line's stamp now, without this incident's quality penalty. */
  lineStamp: number;
  /** The open orders' minimums, strictest first. */
  openMinimums: number[];
  /** What the site's energy costs a game hour now. */
  energyCostPerHour: number;
  /** delayed_truck: what waiting adds, in late order-minutes and in late penalties. */
  delayLateMinutes: number;
  delayLateCost: number;
  /** delayed_truck: the relief lorry, the delay's hours at the demurrage rate. */
  reliefCost: number;
  /** dust_filter_pressure: the filter's part price and the unit's service minutes. */
  servicePartPrice: number;
  serviceMinutes: number;
  /** supplier_contamination: flour the alert holds, and its write-off at the waste rate. */
  recallKg: number;
  recallCost: number;
}

/** One open incident, as the plant world carries it for this kind. */
export interface IncidentWorldEntry {
  id: string;
  phase: 'raised' | 'acknowledged' | 'mitigated' | 'resolved';
  response: string | null;
  /** The facts to raise it on; null where no proposal should be raised (an old save's incident). */
  facts: IncidentFacts | null;
}

const ZERO: OptionPrice = {
  currency: 0,
  parts: {},
  kg: 0,
  minutes: null,
  quality: null,
  gradeRisk: false,
};
const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const money = (value: number) => Math.max(0, Math.round(finite(value) * 100) / 100);

export function incidentPrice(optionId: string, facts: IncidentFacts): OptionPrice {
  const response = incidentResponse(facts.incidentKind, optionId);
  if (!response) return { ...ZERO };
  const stamp =
    Math.round(
      Math.max(
        0,
        finite(facts.lineStamp) - response.shares.quality * finite(facts.qualityPenalty)
      ) * 10
    ) / 10;
  const belowMinimums = [...new Set(facts.openMinimums)]
    .filter((minimum) => stamp < minimum - 1e-6)
    .sort((x, y) => y - x);
  const energy =
    response.shares.energy *
    (finite(facts.energyMultiplier, 1) - 1) *
    finite(facts.energyCostPerHour) *
    (finite(facts.minutes) / 60);
  let currency = Math.max(0, energy);
  let kg = 0;
  let minutes: number | null = null;
  let late = false;
  const price: OptionPrice = { ...ZERO };
  if (response.action === 'relief') currency += finite(facts.reliefCost);
  if (response.action === 'filter') {
    currency += finite(facts.servicePartPrice);
    price.parts = { filters: 1 };
  }
  if (response.action === 'recall') {
    currency += finite(facts.recallCost);
    kg = Math.round(Math.max(0, finite(facts.recallKg)));
  }
  if (facts.incidentKind === 'delayed_truck' && response.action !== 'relief') {
    currency += finite(facts.delayLateCost);
    if (facts.delayLateMinutes > 0.5) {
      minutes = Math.round(facts.delayLateMinutes);
      late = true;
    }
  }
  return {
    ...price,
    currency: money(currency),
    kg,
    minutes,
    quality: stamp,
    gradeRisk: late || belowMinimums.length > 0,
    belowMinimums,
  };
}

/** Lower is better: a grade risk, then money, then kilograms, then minutes. */
function rank(price: OptionPrice): number[] {
  return [price.gradeRisk ? 1 : 0, money(price.currency), price.kg, price.minutes ?? 0];
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

export const incidentKind: ProposalKindDefinition<'incident'> = {
  kind: 'incident',
  windowMinutes: INCIDENT_WINDOW_MINUTES,
  optionIds: INCIDENT_OPTION_IDS,
  defaultOptionId: INCIDENT_RESPONSES.power_sag[0].id,
  raise(world: PlantWorld) {
    return (world.incidents ?? []).flatMap((entry) =>
      entry.phase === 'raised' && entry.facts
        ? [{ subject: `incident-${entry.id}`, facts: entry.facts }]
        : []
    );
  },
  optionsFor(facts) {
    return (INCIDENT_RESPONSES[facts.incidentKind] ?? []).map((response) => response.id);
  },
  price: incidentPrice,
  effect(optionId, facts) {
    return { type: 'respond-incident', incidentId: facts.incidentId, response: optionId };
  },
  settle(proposal: PartnerProposal<'incident'>, world: PlantWorld) {
    const now = (world.incidents ?? []).find((entry) => entry.id === proposal.facts.incidentId);
    if (!now || now.phase === 'resolved') return { type: 'withdrawn' };
    if (now.phase === 'mitigated') {
      // Met by other means: the guide's Mitigate or an agent command. A plant
      // incident takes an answer there; a Chronicle one keeps its own route.
      const response = incidentResponse(proposal.facts.incidentKind, now.response);
      return response
        ? { type: 'answered', optionId: response.id, decidedBy: 'operator' }
        : { type: 'withdrawn' };
    }
    return null;
  },
  outcome(proposal: PartnerProposal<'incident'>, world: PlantWorld) {
    // From the branch point, with what the hour measured: the line's stamp
    // (less this incident's own penalty) and the orders then open.
    const now = world.incidentOutcome;
    if (!now) return proposal.facts;
    return { ...proposal.facts, lineStamp: now.lineStamp, openMinimums: [...now.openMinimums] };
  },
  reason(facts): ProposalReason {
    return { key: 'reasonIncident', params: { kind: facts.incidentKind } };
  },
  rank(_optionId, price) {
    return rank(price);
  },
  chooseDefault(options: readonly PricedOption[]) {
    let best: PricedOption | null = null;
    for (const option of options)
      if (!best || compare(rank(option.price), rank(best.price)) < 0) best = option;
    return best?.id ?? incidentKind.defaultOptionId;
  },
};

const INCIDENT_KINDS = Object.keys(INCIDENT_RESPONSES) as IncidentKind[];

/** Saved facts, re-read field by field; null when this build cannot read them. */
export function sanitizeIncidentFacts(value: Record<string, unknown>): IncidentFacts | null {
  const num = (key: string) => typeof value[key] === 'number' && Number.isFinite(value[key]);
  const numbers = [
    'qualityPenalty',
    'energyMultiplier',
    'minutes',
    'lineStamp',
    'energyCostPerHour',
    'delayLateMinutes',
    'delayLateCost',
    'reliefCost',
    'servicePartPrice',
    'serviceMinutes',
    'recallKg',
    'recallCost',
  ] as const;
  if (typeof value.incidentId !== 'string') return null;
  if (!INCIDENT_KINDS.includes(value.incidentKind as IncidentKind)) return null;
  if (value.origin !== 'plant' && value.origin !== 'chronicle') return null;
  if (!numbers.every(num)) return null;
  if (!Array.isArray(value.openMinimums) || !value.openMinimums.every((m) => typeof m === 'number'))
    return null;
  const facts = {
    incidentId: value.incidentId,
    incidentKind: value.incidentKind as IncidentKind,
    origin: value.origin,
    machineId: typeof value.machineId === 'string' ? value.machineId : null,
    openMinimums: [...(value.openMinimums as number[])],
  } as Record<string, unknown>;
  for (const key of numbers) facts[key] = value[key];
  return facts as unknown as IncidentFacts;
}

/**
 * Late order-minutes and late penalties that holding the next truck back
 * `delayMinutes` adds, on the dock as it stands: the active order first, then
 * by priority and due time; one product a truck, up to its load, on the
 * yard's turn (partnerProposals projectLateMinutes, per order). Pure.
 */
export function delayLateCost(
  orders: ReadonlyArray<{
    remainingKg: number;
    dueAtMinute: number;
    priority: 'normal' | 'high' | 'critical';
    product: 'flour' | 'semolina';
    reachable: boolean;
    active: boolean;
    latePerKgHour: number;
  }>,
  dock: {
    nextTruckInMinutes: number;
    cycleMinutes: number;
    capacityKg: number;
    /** The truck already on its way or at the door keeps its time: the delay is the next one's. */
    truckActive?: boolean;
  },
  minute: number,
  delayMinutes: number
): { lateMinutes: number; lateCost: number } {
  const order = { critical: 0, high: 1, normal: 2 } as const;
  const queue = orders
    .filter((entry) => entry.reachable && entry.remainingKg > 1e-6)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        order[a.priority] - order[b.priority] ||
        a.dueAtMinute - b.dueAtMinute
    );
  const capacity = Math.max(1, finite(dock.capacityKg, 5000));
  const cycle = Math.max(1, finite(dock.cycleMinutes, 80));
  const departures = (delay: number) => {
    const out: number[] = [];
    let truck = 0;
    let room = capacity;
    let product: string | null = null;
    for (const entry of queue) {
      if (product !== null && product !== entry.product && room < capacity) {
        truck += 1;
        room = capacity;
      }
      product = entry.product;
      let left = entry.remainingKg;
      while (left > 1e-6) {
        const take = Math.min(left, room);
        left -= take;
        room -= take;
        if (left > 1e-6) {
          truck += 1;
          room = capacity;
        }
      }
      const delayed = truck >= (dock.truckActive ? 1 : 0) ? delay : 0;
      out.push(minute + Math.max(0, finite(dock.nextTruckInMinutes)) + delayed + truck * cycle);
      if (room <= 1e-6) {
        truck += 1;
        room = capacity;
        product = null;
      }
    }
    return out;
  };
  const before = departures(0);
  const after = departures(Math.max(0, finite(delayMinutes)));
  let lateMinutes = 0;
  let lateCost = 0;
  queue.forEach((entry, index) => {
    const lateBefore = Math.max(0, before[index] - entry.dueAtMinute);
    const lateAfter = Math.max(0, after[index] - entry.dueAtMinute);
    const added = lateAfter - lateBefore;
    if (added <= 0) return;
    lateMinutes += added;
    lateCost += entry.remainingKg * Math.max(0, finite(entry.latePerKgHour)) * (added / 60);
  });
  return { lateMinutes: Math.round(lateMinutes * 10) / 10, lateCost: money(lateCost) };
}

/**
 * Which incident kinds the partner asks about, by the delegation rule
 * (partnerProposals.ts DELEGATION_EVIDENCE), per incident kind so that two
 * kinds each with one right answer cannot pass the rule together. Each entry
 * names the harness arms (plantMeasure.playtest.test.ts, MILLOS_PLANT_INCIDENT_OUT)
 * where the record found the other answer better and worse, or null.
 */
export const INCIDENT_DELEGATION_EVIDENCE: Record<
  IncidentKind,
  { otherBetter: string | null; otherWorse: string | null }
> = {
  bearing_overheat: { otherBetter: null, otherWorse: null },
  dust_filter_pressure: { otherBetter: null, otherWorse: null },
  power_sag: { otherBetter: null, otherWorse: null },
  delayed_truck: { otherBetter: null, otherWorse: null },
  supplier_contamination: { otherBetter: null, otherWorse: null },
  packaging_shortage: { otherBetter: null, otherWorse: null },
  severe_rain: { otherBetter: null, otherWorse: null },
  control_network_degraded: { otherBetter: null, otherWorse: null },
};

/** An incident kind's default delegation, from INCIDENT_DELEGATION_EVIDENCE. */
export function incidentDefaultDelegation(kind: IncidentKind): 'ask' | 'decide' {
  const evidence = INCIDENT_DELEGATION_EVIDENCE[kind];
  return evidence?.otherBetter && evidence.otherWorse ? 'ask' : 'decide';
}
