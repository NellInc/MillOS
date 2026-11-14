/**
 * Tempering on the live plant (plan item 7.7): the facts a temper card is
 * raised on, what an answer does, the temper at the rolls brought up to the
 * minute, and the bell. The proposal itself is pure
 * (simulation/temperProposal.ts); the runtime (partnerProposalRuntime.ts)
 * raises it and runs these.
 *
 * The temper lives on the Chronicle's crop year (chronicle/temper.ts), so the
 * tick's per-lot stamp reads it through the LotStampContext it already builds.
 */
import { translate } from '../i18n';
import { registerAlertCatalog } from '../i18n/alertCopy';
import { useChronicleStore } from '../stores/chronicleStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useMaterialFlowStore, type MaterialFlowState } from '../stores/materialFlowStore';
import { MILL_RECIPES, useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useUIStore } from '../stores/uiStore';
import { chronicleEffect } from '../chronicle/effects';
import { effectInput } from '../chronicle/engine';
import {
  DRYING_KWH_PER_KG_WATER,
  SHIFT_WHEAT_KG,
  TEMPER_COVER_MINUTES,
  TEMPER_REST_MINUTES,
  waterToDryKg,
} from '../chronicle/temper';
import type { TemperOptionId } from '../chronicle/types';
import {
  mixReadings,
  stampPenaltyFor,
  worstBinPenalty,
  type LotReadings,
  type LotStampContext,
} from '../simulation/lotQuality';
import {
  COMPARISON_DELAY_MINUTES,
  type PartnerProposal,
  type PlantWorld,
} from '../simulation/partnerProposals';
import { temperProposalMessages as msg } from '../simulation/temperProposal.messages';
import { energyTariffPerKwh } from '../utils/energyCalculations';
import { openFlourMinimums } from './intakeRuntime';

const ALERT_CATALOG = 'temperProposals';
registerAlertCatalog(ALERT_CATALOG, msg);

type Contribution = { lotId: string; amount: number };

/**
 * What the tick hands in: the wheat the line will be fed, and its stamp
 * context. The card is raised on the silos one by one (wheatSiloBins) and
 * prices drying on `grain`; with no wheat in any silo, `grain` is all it reads.
 */
export interface TemperGrain {
  /** The silos' wheat as the valves draw it (each holding silo once), else the line's. */
  grain: Contribution[];
  context: LotStampContext;
}

/**
 * The minimums a shift's wheat is milled for: the open flour orders', and
 * every wheat recipe's, since every programme carries all three customers
 * (plan, "Phase 3 re-planned") and an answer covers a shift's wheat, longer
 * than one order is open. Priced on the open orders alone, the partner
 * tempered as it comes whenever the strong-white order of the moment had
 * shipped, and the next programme's took 94.5 flour (MILLOS_PLANT_TEMPER_OUT,
 * first pass: 33,045 net against 41,105 drying every shift, over ten).
 */
function shiftMinimums(): number[] {
  const recipes = Object.values(MILL_RECIPES)
    .filter((recipe) => recipe.sourceMaterial === 'wheat_grain')
    .map((recipe) => recipe.minimumQuality);
  return [...new Set([...openFlourMinimums(), ...recipes])].sort((x, y) => y - x);
}

const withTemper = (context: LotStampContext, option: TemperOptionId): LotStampContext => ({
  ...context,
  crop: { ...context.crop, temper: { inForce: option, schedule: [] } },
});

/** Some grain scaled to a unit of mass, keeping each lot's share. */
function unitMass(grain: readonly Contribution[]): Contribution[] {
  const mass = grain.reduce((sum, source) => sum + Math.max(0, source.amount), 0);
  return mass > 0
    ? grain
        .filter((source) => source.amount > 0)
        .map((source) => ({ lotId: source.lotId, amount: source.amount / mass }))
    : [];
}

/**
 * Each wheat silo's grain, one bin per silo holding any (as the tick's
 * wheatSiloContributions reads them; read here from the store, because the
 * tick hands the silos in already blended).
 *
 * The stamp reads each packed portion's own grain (materialFlowStore,
 * flourPenalty), and a portion is milled from the silos its mills draw on in
 * whatever shares the spouts happen to deliver: measured on the store
 * (temperRuntime.test.ts), a packer fed by a wet silo and a sound one packed
 * one batch at 62% wet grain, though the spouts nominally share half and half.
 * So a portion reads wet only if some silo it draws on does, and may read wet
 * whenever one does. The silos' mean, which the card read before, can sit
 * under the wet band while one silo's flour is packed five points down.
 */
export function wheatSiloBins(flow: MaterialFlowState): Contribution[][] {
  const bins: Contribution[][] = [];
  flow.machineBuffers.forEach((buffer) => {
    if (buffer.machineType !== 'silo') return;
    const wheat = buffer.outputBuffer
      .filter((material) => material.type === 'wheat_grain' && material.amount > 1e-6)
      .flatMap((material) => material.sourceContributions ?? []);
    const bin = unitMass(wheat);
    if (bin.length > 0) bins.push(bin);
  });
  return bins;
}

/**
 * The water drying takes out of a shift's wheat, lot by lot over the grain the
 * tick hands in: a lot already under the dried moisture gives none
 * (chronicle/temper.ts waterToDryKg), so a wet lot is not priced on its mean
 * with sound grain.
 */
function shiftWaterKg(grain: readonly Contribution[], context: LotStampContext): number {
  let water = 0;
  for (const source of unitMass(grain)) {
    const moisture = mixReadings([{ lotId: source.lotId, amount: 1 }], context)?.moisturePct ?? 0;
    water += waterToDryKg(SHIFT_WHEAT_KG * source.amount, moisture);
  }
  return water;
}

/**
 * The temper card's world this tick: null without an active charter, else
 * what to raise it on and what its record reads an hour on.
 *
 * Raised when, on any wheat silo's grain (wheatSiloBins), drying would take
 * points off the stamp, judged by the stamp's own arithmetic
 * (stampPenaltyFor): a portion's grain is a blend of the silos it draws on,
 * so no flour can be stamped wet unless some silo reads wet, and the card is
 * raised whenever one does. Not raised when no silo reads wet, a plan relieves
 * the wet grain, or the year was dried by the old flat treatment. Each answer
 * is priced on the worst silo's grain milled unmixed: the lowest stamp its
 * flour can carry.
 *
 * `projectBase` (the runtime's projectedStampBase) brings the line's stamp
 * forward to the end of the wheat an answer covers, so the card prices the
 * flour milled last, on the most worn line; the hour-later record does the
 * same from the line it then measures, to the same end.
 */
export function temperWorld(
  temperGrain: TemperGrain | null | undefined,
  base: number | undefined,
  projectBase?: (base: number, minutes: number) => number
): PlantWorld['temper'] {
  const chronicle = useChronicleStore.getState().chronicle;
  if (!temperGrain || chronicle.status !== 'active' || !chronicle.crop) return null;
  const now = Number.isFinite(base) ? (base as number) : 0;
  const atCoverEnd = (minutes: number) => {
    const projected = projectBase?.(now, minutes);
    return Math.round(Math.min(now, Number.isFinite(projected) ? projected! : now) * 100) / 100;
  };
  const openMinimums = shiftMinimums();
  const outcome = {
    base: atCoverEnd(TEMPER_REST_MINUTES + TEMPER_COVER_MINUTES - COMPARISON_DELAY_MINUTES),
    openMinimums,
  };
  const { grain, context } = temperGrain;
  // With no grain in any silo, the grain in process (as the tick hands it in).
  const silos = wheatSiloBins(useMaterialFlowStore.getState());
  const bins = silos.length > 0 ? silos : grain.length > 0 ? [grain] : [];
  const standard = withTemper(context, 'standard');
  const dried = withTemper(context, 'dry-first');
  const standardPenalty = worstBinPenalty(bins, standard);
  const driedPenalty = worstBinPenalty(bins, dried);
  let wettest: LotReadings | null = null;
  for (const bin of bins) {
    const readings = mixReadings(bin, context);
    if (
      readings &&
      readings.moisturePct > (wettest?.moisturePct ?? -1) &&
      stampPenaltyFor(bin, dried) < stampPenaltyFor(bin, standard)
    )
      wettest = readings;
  }
  // Nothing to decide: no silo reads wet, a plan relieves the wet grain, or
  // the year was treated.
  if (!wettest || driedPenalty >= standardPenalty) return { raise: null, outcome };
  const readings = wettest;
  // Through ChronicleEffect, clamped there like every other Chronicle effect.
  const drying = chronicleEffect(effectInput(chronicle), true).dryingEnergyMultiplier;
  const dryingKwh = shiftWaterKg(grain, context) * DRYING_KWH_PER_KG_WATER;
  const minuteOfDay = (useGameSimulationStore.getState().gameTime ?? 0) * 60;
  const dryingCost = dryingKwh * energyTariffPerKwh(minuteOfDay) * drying;
  return {
    raise: {
      shiftIndex: chronicle.shift,
      cropYear: chronicle.crop.index,
      moisturePct: Math.round(readings.moisturePct * 10) / 10,
      base: atCoverEnd(TEMPER_REST_MINUTES + TEMPER_COVER_MINUTES),
      standardPenalty,
      driedPenalty,
      openMinimums,
      dryingCost: Math.round(dryingCost * 100) / 100,
      dryingKwh: Math.round(dryingKwh * 10) / 10,
      inForce: chronicle.crop.temper?.inForce ?? 'standard',
    },
    outcome,
  };
}

/**
 * A temper answer: the shift's wheat is tempered that way (at the rolls after
 * the rest), and drying books its energy. False when there is no crop year to
 * temper for (the charter ended).
 */
export function runTemper(effect: {
  option: TemperOptionId;
  kwh: number;
  cost: number;
  /** The card answered (its subject); absent from a caller that names none. */
  key?: string;
}): boolean {
  const minute = useOperationsCampaignStore.getState().elapsedMinutes;
  const drying = effect.option === 'dry-first' && effect.cost > 0 ? effect.cost : 0;
  // The Chronicle saves at once and the plant every 5 s: after a reload
  // between the two, this card is answered again on a plant from before the
  // first answer. The Chronicle's first answer stands (answerTemper books it
  // once), and the plant books the drying that answer booked, which its older
  // save does not hold (review 2).
  const prior = effect.key ? useChronicleStore.getState().temperAnswerFor(effect.key) : undefined;
  // The Chronicle is told what drying booked, so a trial's energy goal judges the line alone.
  // Its energy too, so the Chronicle credits what a hired dryer kept off the books.
  const kwh = effect.option === 'dry-first' ? effect.kwh : 0;
  if (!useChronicleStore.getState().answerTemper(effect.option, minute, drying, kwh, effect.key))
    return false;
  const booked = prior ? prior.drying : drying;
  if (booked > 0) useOperationsCampaignStore.getState().bookEnergyCharge(booked);
  return true;
}

/** The temper at the rolls brought up to the campaign's minute (each tick, under a charter). */
export function stepTemper(): void {
  if (!useChronicleStore.getState().chronicle.crop?.temper) return;
  useChronicleStore.getState().stepTemper(useOperationsCampaignStore.getState().elapsedMinutes);
}

function bell(
  id: string,
  key: 'bellTemperProposed' | 'bellTemperDecided' | 'bellTemperRefused',
  params: Record<string, string | number>,
  type: 'info' | 'warning' = 'info'
): void {
  // The asked card (with its window) and a decision that could not run are
  // read once to a screen reader; a decision told that ran stays quiet.
  const announce = 'window' in params || type === 'warning';
  useUIStore.getState().addAlert({
    id,
    type,
    title: translate(msg, 'kindTemper'),
    message: (translate as (c: unknown, k: string, p: unknown) => string)(msg, key, params),
    timestamp: new Date(),
    acknowledged: false,
    ...(announce ? { announce: 'polite' as const } : {}),
    copy: { catalog: ALERT_CATALOG, title: 'kindTemper', message: key, params },
  });
}

export function ringTemper(proposal: PartnerProposal<'temper'>): void {
  bell(`partner-proposal-${proposal.id}`, 'bellTemperProposed', {
    moisture: proposal.facts.moisturePct,
    option: proposal.defaultOptionId,
    window: proposal.windowMinutes,
  });
}

export function ringTemperDecision(proposal: PartnerProposal<'temper'>, ran: boolean): void {
  bell(
    `partner-decided-${proposal.id}`,
    ran ? 'bellTemperDecided' : 'bellTemperRefused',
    { moisture: proposal.facts.moisturePct, option: proposal.defaultOptionId },
    ran ? 'info' : 'warning'
  );
}
