/**
 * Incidents and intake on the live plant (plan items 3.1, 3.5): the facts an
 * incident proposal is raised on, what an incident answer does, and the bell
 * for both kinds. The proposals themselves are pure
 * (simulation/incidentProposal.ts, simulation/intakeProposal.ts).
 *
 * How the two incident routes are told apart: an incident the plant raised
 * carries `origin: 'plant'` (a started recovery challenge, a bearing that
 * overheated on an ignored wear warning); one the Chronicle raised is in the
 * Chronicle's `ownedIncidents`. Any other (an incident saved before either
 * existed) is offered nothing and keeps the guide's buttons.
 */
import { defineMessages, translate, type Locale } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import {
  DEMURRAGE_COST_PER_HOUR,
  INCIDENT_DEFINITIONS,
  orderReachable,
  useOperationsCampaignStore,
  type CampaignActor,
  type OperationalIncident,
} from '../stores/operationsCampaignStore';
import { useChronicleStore } from '../stores/chronicleStore';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useQCLabStore } from '../stores/qcLabStore';
import { useUIStore } from '../stores/uiStore';
import { PART_PRICE, useBreakdownStore } from '../stores/breakdownStore';
import { energyTariffPerKwh, getSiteDemandKw } from '../utils/energyCalculations';
import { incidentTitle } from '../stores/incidentText';
import {
  incidentResponse,
  INCIDENT_RESPONSES,
  PLANT_INCIDENT_MINUTES,
} from '../simulation/incidentResponses';
import {
  delayLateCost,
  incidentDefaultDelegation,
  type IncidentFacts,
  type IncidentWorldEntry,
} from '../simulation/incidentProposal';
import type { PartnerProposal, PlantWorld } from '../simulation/partnerProposals';
import { floorProposalMessages as msg } from '../simulation/floorProposals.messages';
import type { PartnerTickInputs, TickHooks } from './partnerProposalRuntime';

export { incidentDefaultDelegation };

const ALERT_CATALOG = 'floorProposals';

/** An incident bell's raw facts: the kind is kept, and worded when the bell renders. */
type IncidentBellParams = { kind?: string; title: string; option: string; window?: number };
/**
 * The floor catalogue, with the incident bells' title worded from the kept
 * kind in each language, as onDeviceOperator.ts words its notices; a bell
 * saved before the kind was kept has none, and shows its stored title.
 * Working if a language switch rewords the whole bell, title included.
 */
const bellCopy = (locale: Locale) => {
  const base = msg[locale];
  const titled = (p: IncidentBellParams) =>
    p.kind ? { ...p, title: incidentTitle({ kind: p.kind, title: p.title }, locale) } : p;
  return {
    ...base,
    bellIncidentProposed: (p: IncidentBellParams) => base.bellIncidentProposed(titled(p)),
    bellIncidentDecided: (p: IncidentBellParams) => base.bellIncidentDecided(titled(p)),
    bellRefused: (p: IncidentBellParams) => base.bellRefused(titled(p)),
  };
};
const bellText = defineMessages({ en: bellCopy('en'), 'pt-BR': bellCopy('pt-BR') });
registerAlertCatalog(ALERT_CATALOG, bellText);

/** The ledger's waste rate a kg (operationsCampaignStore tickCampaign wasteCost). */
const WASTE_COST_PER_KG = 0.18;
/** The dock as the projection carries it (partnerProposalRuntime DOCK_TURN_MINUTES, DOCK_LOAD_KG). */
const DOCK_TURN_MINUTES = 83;
const DOCK_LOAD_KG = 4450;

const openOrders = () =>
  useOperationsCampaignStore
    .getState()
    .orders.filter((order) => order.status !== 'fulfilled' && order.status !== 'cancelled');

const openMinimums = () =>
  [...new Set(openOrders().map((order) => order.recipe.minimumQuality))].sort((x, y) => y - x);

/** Incident ids the Chronicle raised and restores. */
const chronicleOwned = () =>
  new Set(useChronicleStore.getState().chronicle.ownedIncidents.map((owned) => owned.incidentId));

/** The stamp the line makes now with no incident penalty at all. */
function stampWithoutIncidents(inputs: PartnerTickInputs): number {
  const machines = useProductionStore.getState().machines;
  const incidents = useOperationsCampaignStore.getState().getIncidentEffect().qualityPenalty;
  const chronicle = Math.max(0, inputs.qualityPenalty - incidents);
  return Math.max(0, inputs.qualityOf(machines) - chronicle);
}

function energyCostPerHour(): number {
  const game = useGameSimulationStore.getState();
  const production = useProductionStore.getState();
  const kw = getSiteDemandKw(
    production.machines,
    game.gameTime,
    game.emergencyActive,
    production.productionSpeed
  );
  return Math.round(kw * energyTariffPerKwh(game.gameTime * 60) * 100) / 100;
}

function delayFacts(inputs: PartnerTickInputs, delayMinutes: number) {
  const campaign = useOperationsCampaignStore.getState();
  const shipping = useTruckScheduleStore.getState().truckSchedule.shipping;
  return delayLateCost(
    openOrders().map((order) => ({
      remainingKg: Math.max(0, order.requiredKg - order.shippedKg),
      dueAtMinute: order.dueAtMinute,
      priority: order.priority,
      product: order.recipe.finishedMaterial,
      reachable: orderReachable(order, inputs.bestReachable),
      active: order.id === campaign.activeOrderId,
      latePerKgHour: order.latePenaltyPerKgHour,
    })),
    {
      nextTruckInMinutes:
        shipping.transferReady || shipping.truckDocked
          ? 0
          : Math.max(
              0,
              Number.isFinite(shipping.nextArrivalMinutes) ? shipping.nextArrivalMinutes : 0
            ),
      cycleMinutes: DOCK_TURN_MINUTES,
      capacityKg: DOCK_LOAD_KG,
      truckActive: shipping.truckActive,
    },
    campaign.elapsedMinutes,
    delayMinutes
  );
}

/** Flour the open supplier alerts hold, kg. */
function heldBySupplierAlerts(): number {
  const alerts = useQCLabStore
    .getState()
    .qcLab.contaminationAlerts.filter(
      (alert) => alert.type === 'supplier_notification' && alert.resolution === null
    );
  if (alerts.length === 0) return 0;
  const named = new Set(alerts.flatMap((alert) => alert.batchIds ?? []));
  return useMaterialFlowStore
    .getState()
    .productionBatches.filter(
      (batch) => batch.disposition === 'hold' && (named.has(batch.id) || named.size === 0)
    )
    .reduce((sum, batch) => sum + Math.max(0, batch.availableKg), 0);
}

function incidentFacts(
  incident: OperationalIncident,
  origin: 'plant' | 'chronicle',
  inputs: PartnerTickInputs,
  delayMinutes: number
): IncidentFacts {
  const definition = INCIDENT_DEFINITIONS[incident.kind].effect;
  const delay =
    incident.kind === 'delayed_truck'
      ? delayFacts(inputs, delayMinutes)
      : { lateMinutes: 0, lateCost: 0 };
  const recallKg = incident.kind === 'supplier_contamination' ? heldBySupplierAlerts() : 0;
  return {
    incidentId: incident.id,
    incidentKind: incident.kind,
    origin,
    machineId: incident.affectedMachineId,
    qualityPenalty: definition.qualityPenalty,
    energyMultiplier: definition.energyMultiplier,
    minutes: PLANT_INCIDENT_MINUTES,
    lineStamp: Math.round(stampWithoutIncidents(inputs) * 10) / 10,
    openMinimums: openMinimums(),
    energyCostPerHour: energyCostPerHour(),
    delayLateMinutes: delay.lateMinutes,
    delayLateCost: delay.lateCost,
    reliefCost: Math.round(DEMURRAGE_COST_PER_HOUR * (delayMinutes / 60) * 100) / 100,
    servicePartPrice: PART_PRICE.filters,
    // A filter change is a part, not a unit service: the sifter keeps running.
    serviceMinutes: 0,
    recallKg: Math.round(recallKg),
    recallCost: Math.round(recallKg * WASTE_COST_PER_KG * 100) / 100,
  };
}

/**
 * The incidents part of the plant world: every open incident, with facts for
 * those raised that take the two answers, and what a record reads an hour on.
 */
export function incidentWorld(
  inputs: PartnerTickInputs,
  hooks: TickHooks | null
): Pick<PlantWorld, 'incidents' | 'incidentOutcome'> {
  const delayMinutes = hooks?.shippingDelayMinutes ?? 0;
  const owned = chronicleOwned();
  const incidents: IncidentWorldEntry[] = useOperationsCampaignStore
    .getState()
    .incidents.filter((incident) => incident.phase !== 'resolved')
    .map((incident) => {
      const origin =
        incident.origin === 'plant' ? 'plant' : owned.has(incident.id) ? 'chronicle' : null;
      return {
        id: incident.id,
        phase: incident.phase,
        response: incidentResponse(incident.kind, incident.response)?.id ?? null,
        facts:
          origin && incident.phase === 'raised'
            ? incidentFacts(incident, origin, inputs, delayMinutes)
            : null,
      };
    });
  return {
    incidents,
    incidentOutcome: {
      lineStamp: Math.round(stampWithoutIncidents(inputs) * 10) / 10,
      openMinimums: openMinimums(),
    },
  };
}

/**
 * Carry out an incident answer. A plant incident is met now (acknowledged and
 * mitigated with the answer's shares; it ends PLANT_INCIDENT_MINUTES on) and
 * the answer's own action runs. A Chronicle incident only takes the answer:
 * nothing is booked, consumed or recalled until it is mitigated on its own
 * route (actOnMetIncidents). False when the answer could not run.
 */
export function runIncidentResponse(
  effect: { incidentId: string; response: string },
  actor: CampaignActor,
  hooks: TickHooks | null
): boolean {
  const campaign = useOperationsCampaignStore.getState();
  const incident = campaign.incidents.find((candidate) => candidate.id === effect.incidentId);
  const response = incident ? incidentResponse(incident.kind, effect.response) : null;
  if (!incident || !response) return false;
  const plant = incident.origin === 'plant';
  if (!plant) return campaign.respondToIncident(incident.id, response.id, actor, false);
  // A filter change needs a filter in stores; with none, the incident is met
  // with its kind's first answer, and the answer reads as not run.
  const filterMissing = response.action === 'filter' && !filterInStores();
  const met = filterMissing ? INCIDENT_RESPONSES[incident.kind][0] : response;
  if (!campaign.respondToIncident(incident.id, met.id, actor, true)) return false;
  if (filterMissing) return false;
  return actOn(incident.id, hooks);
}

const filterInStores = () => useBreakdownStore.getState().partsInventory.filters > 0;

/**
 * An answered incident's action, once, when it is met: a relief lorry, a
 * filter from stores, a recall. True when it ran (or there was nothing to do).
 */
function actOn(incidentId: string, hooks: TickHooks | null): boolean {
  const campaign = useOperationsCampaignStore.getState();
  const incident = campaign.incidents.find((candidate) => candidate.id === incidentId);
  const response = incident ? incidentResponse(incident.kind, incident.response) : null;
  if (!incident || !response || incident.responseActed || incident.phase !== 'mitigated')
    return false;
  campaign.markIncidentResponseActed(incidentId);
  switch (response.action) {
    case 'none':
      return true;
    case 'relief': {
      const minutes = hooks?.shippingDelayMinutes ?? 45;
      const taken = hooks ? hooks.cancelShippingDelay(minutes) : 0;
      if (taken > 0)
        useOperationsCampaignStore
          .getState()
          .bookDemurrageCharge(DEMURRAGE_COST_PER_HOUR * (taken / 60));
      return taken > 0;
    }
    case 'filter':
      return useBreakdownStore.getState().consumePart('filters');
    case 'recall': {
      const qc = useQCLabStore.getState();
      const alerts = qc.qcLab.contaminationAlerts.filter(
        (alert) => alert.type === 'supplier_notification' && alert.resolution === null
      );
      let recalled = false;
      for (const alert of alerts)
        recalled =
          qc.resolveContaminationAlert(alert.id, 'recalled', 'Operations campaign controller') ||
          recalled;
      return recalled || alerts.length === 0;
    }
  }
}

/**
 * The tick's call: a Chronicle incident whose answer was taken runs that
 * answer's action once it is mitigated on its own route (the Chronicle's or
 * the guide's Mitigate).
 */
export function actOnMetIncidents(hooks: TickHooks | null): void {
  for (const incident of useOperationsCampaignStore.getState().incidents)
    if (
      incident.phase === 'mitigated' &&
      incident.response !== undefined &&
      !incident.responseActed &&
      incidentResponse(incident.kind, incident.response)?.action !== 'none'
    )
      actOn(incident.id, hooks);
}

// ---------------------------------------------------------------------------
// The bell
// ---------------------------------------------------------------------------

/** The incident on the bell: its kind, and its title worded now as the fallback. */
const word = (incident: { incidentKind: string }) => ({
  kind: incident.incidentKind,
  title: incidentTitle({ kind: incident.incidentKind, title: incident.incidentKind }),
});

/*
 * An asked card (`window` set) and a decision that could not run (`warning`)
 * are read once to a screen reader as they are filed; a decision told that
 * ran stays quiet.
 */
function bell(
  id: string,
  intake: boolean,
  key: keyof (typeof msg)['en'],
  params: Record<string, string | number>,
  type: 'info' | 'warning' = 'info'
): void {
  const title = intake ? 'kindIntake' : 'kindIncident';
  const announce = 'window' in params || type === 'warning';
  useUIStore.getState().addAlert({
    id,
    type,
    title: translate(bellText, title),
    message: (translate as (c: unknown, k: string, p: unknown) => string)(bellText, key, params),
    timestamp: new Date(),
    acknowledged: false,
    ...(announce ? { announce: 'polite' as const } : {}),
    copy: { catalog: ALERT_CATALOG, title, message: key, params },
  });
}

export function ringIntake(proposal: PartnerProposal<'intake'>): void {
  bell(`partner-proposal-${proposal.id}`, true, 'bellIntakeProposed', {
    fallingNumber: proposal.facts.fallingNumberS,
    moisture: proposal.facts.moisturePct,
    option: proposal.defaultOptionId,
    window: proposal.windowMinutes,
  });
}

export function ringIntakeDecision(proposal: PartnerProposal<'intake'>, ran: boolean): void {
  bell(
    `partner-decided-${proposal.id}`,
    true,
    ran ? 'bellIntakeDecided' : 'bellIntakeRefused',
    { option: proposal.defaultOptionId, fallingNumber: proposal.facts.fallingNumberS },
    ran ? 'info' : 'warning'
  );
}

export function ringIncident(proposal: PartnerProposal<'incident'>): void {
  bell(`partner-proposal-${proposal.id}`, false, 'bellIncidentProposed', {
    ...word(proposal.facts),
    option: proposal.defaultOptionId,
    window: proposal.windowMinutes,
  });
}

export function ringIncidentDecision(proposal: PartnerProposal<'incident'>, ran: boolean): void {
  bell(
    `partner-decided-${proposal.id}`,
    false,
    ran ? 'bellIncidentDecided' : 'bellRefused',
    { ...word(proposal.facts), option: proposal.defaultOptionId },
    ran ? 'info' : 'warning'
  );
}
