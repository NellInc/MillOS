/**
 * Intake on the live plant (plan item 3.1): a docked lot's facts read from the
 * stores, and what an intake answer does. The proposal itself is pure
 * (simulation/intakeProposal.ts); the runtime (partnerProposalRuntime.ts)
 * raises it and runs these effects.
 *
 * The lot is not in the silos while its proposal is open: it is still on the
 * truck's account, so the material ledger counts it only once it is taken in.
 */
import type { CropAttributes } from '../chronicle/types';
import { useMaterialFlowStore, type MaterialFlowState } from '../stores/materialFlowStore';
import {
  DEMURRAGE_COST_PER_HOUR,
  useOperationsCampaignStore,
} from '../stores/operationsCampaignStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { useChronicleStore } from '../stores/chronicleStore';
import { grainPurchaseCost } from '../simulation/grainPrice';
import { stampPenaltyFor, type LotStampContext } from '../simulation/lotQuality';
import {
  REFUSAL_DELAY_MINUTES,
  REFUSAL_FEE_HOURS,
  refusalDelays,
  type IntakeFacts,
} from '../simulation/intakeProposal';
import { seededUnit } from '../simulation/partnerProposals';
import { readPlantClock } from '../utils/timeFormatting';

/** The lot as the tick hands it over: already intake facts, raised this tick. */
export type ArrivedLot = IntakeFacts;

/** A kg of flour takes 1 / (0.72 x 0.95) kg of wheat (materialFlowStore conversion ratios). */
const FLOUR_PER_WHEAT_KG = 0.72 * 0.95;
/** The lot's key in a penalty mix before it has a lot id. */
const ARRIVING = '__arriving__';

interface WheatSilo {
  id: string;
  kg: number;
  space: number;
  grain: { lotId: string; amount: number }[];
}

function wheatSilos(flow: MaterialFlowState): WheatSilo[] {
  const silos: WheatSilo[] = [];
  flow.machineBuffers.forEach((buffer) => {
    if (buffer.machineType !== 'silo') return;
    const index = Number.parseInt(buffer.machineId.replace('silo-', ''), 10) || 0;
    if (index % 2 !== 0) return;
    const kg = buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0);
    silos.push({
      id: buffer.machineId,
      kg,
      space: Math.max(0, buffer.outputCapacity - kg),
      grain: buffer.outputBuffer
        .filter((material) => material.type === 'wheat_grain')
        .flatMap((material) => material.sourceContributions ?? []),
    });
  });
  return silos;
}

/** The emptiest silo of any grain, as receiveGrainDelivery picks it with no silo named. */
function emptiestSiloStoresWheat(flow: MaterialFlowState): string | null {
  let best: { id: string; kg: number } | null = null;
  flow.machineBuffers.forEach((buffer) => {
    if (buffer.machineType !== 'silo') return;
    const kg = buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0);
    if (!best || kg < best.kg) best = { id: buffer.machineId, kg };
  });
  const chosen = best as { id: string; kg: number } | null;
  if (!chosen) return null;
  const index = Number.parseInt(chosen.id.replace('silo-', ''), 10) || 0;
  return index % 2 === 0 ? chosen.id : null;
}

/** Minimum free silo capacity (kg) required to split-blend an arriving wheat lot. */
export const MIN_BLEND_SPACE_KG = 4000;

/**
 * The intake facts for a docked lot, or null when it is not a question: its
 * silo would be a corn silo (the crop year marks only wheat), or no wheat silo
 * has room.
 */
export function buildIntakeFacts(
  lot: { deliveryIndex: number; amountKg: number; crop: CropAttributes; supplier?: string },
  context: LotStampContext,
  base: number
): IntakeFacts | null {
  const flow = useMaterialFlowStore.getState();
  const siloId = emptiestSiloStoresWheat(flow);
  if (!siloId) return null;
  const silos = wheatSilos(flow);
  const withLot: LotStampContext = {
    ...context,
    cropOf: (id) => (id === ARRIVING ? lot.crop : context.cropOf(id)),
  };
  const lineMix = (into: string | null) => {
    const target = into ? silos.find((s) => s.id === into) : null;
    // When blending into a partly full non-emptiest silo, split the arriving lot:
    // place what fits in the blend silo and overflow the remainder to the emptiest silo.
    const primaryShare =
      target && into !== siloId ? Math.min(lot.amountKg, Math.max(0, target.space)) : lot.amountKg;
    const overflowShare = into && into !== siloId ? Math.max(0, lot.amountKg - primaryShare) : 0;
    return silos.flatMap((silo) => {
      const added: { lotId: string; amount: number }[] = [];
      if (silo.id === into && primaryShare > 0)
        added.push({ lotId: ARRIVING, amount: primaryShare });
      if (silo.id === siloId && overflowShare > 0)
        added.push({ lotId: ARRIVING, amount: overflowShare });
      const grain = added.length > 0 ? [...silo.grain, ...added] : silo.grain;
      const mass = grain.reduce((sum, source) => sum + Math.max(0, source.amount), 0);
      return mass > 0
        ? grain.map((source) => ({ lotId: source.lotId, amount: source.amount / mass }))
        : [];
    });
  };
  const straightPenalty = stampPenaltyFor(lineMix(siloId), withLot);
  // The blend: any partly full non-emptiest wheat silo with >= MIN_BLEND_SPACE_KG
  // free whose split line stamps better than pouring straight into the emptiest silo.
  let blend: { id: string; penalty: number; kg: number } | null = null;
  for (const silo of silos) {
    if (silo.id === siloId || silo.grain.length === 0 || silo.space < MIN_BLEND_SPACE_KG) continue;
    const penalty = stampPenaltyFor(lineMix(silo.id), withLot);
    if (!blend || penalty < blend.penalty || (penalty === blend.penalty && silo.kg > blend.kg))
      blend = { id: silo.id, penalty, kg: silo.kg };
  }
  const offerBlend = blend && blend.penalty < straightPenalty ? blend : null;
  // Refused: the line on the wheat already in the silos.
  const refusePenalty = stampPenaltyFor(lineMix(null), context);
  return {
    deliveryIndex: lot.deliveryIndex,
    amountKg: lot.amountKg,
    supplier: lot.supplier ?? null,
    cropYear: lot.crop.cropYear,
    cropKind: lot.crop.kind,
    moisturePct: lot.crop.moisturePct,
    proteinPct: lot.crop.proteinPct,
    fallingNumberS: lot.crop.fallingNumberS,
    siloId,
    blendSiloId: offerBlend?.id ?? null,
    base: Math.round(base * 100) / 100,
    straightPenalty,
    blendPenalty: offerBlend?.penalty ?? null,
    refusePenalty,
    openMinimums: openFlourMinimums(),
    refusalFee: DEMURRAGE_COST_PER_HOUR * REFUSAL_FEE_HOURS,
    shortMinutes: refusalShortMinutes(flow),
  };
}

/** The open flour orders' minimums, strictest first. */
export function openFlourMinimums(): number[] {
  return [
    ...new Set(
      useOperationsCampaignStore
        .getState()
        .orders.filter(
          (order) =>
            order.status !== 'fulfilled' &&
            order.status !== 'cancelled' &&
            order.recipe.finishedMaterial === 'flour'
        )
        .map((order) => order.recipe.minimumQuality)
    ),
  ].sort((x, y) => y - x);
}

/**
 * Refused, the game minutes until the next grain truck when the wheat on site
 * (silos and in process) cannot make the flour the open orders still lack
 * beyond what is packed; 0 when it can.
 */
function refusalShortMinutes(flow: MaterialFlowState): number {
  let wheatKg = 0;
  let flourInProcessKg = 0;
  flow.machineBuffers.forEach((buffer) => {
    for (const material of [...buffer.inputBuffer, ...buffer.outputBuffer]) {
      if (material.type === 'wheat_grain') wheatKg += material.amount;
      else if (material.type === 'flour') flourInProcessKg += material.amount;
    }
  });
  for (const segment of flow.network.segments)
    for (const material of segment.inTransit) {
      if (material.type === 'wheat_grain') wheatKg += material.amount;
      else if (material.type === 'flour') flourInProcessKg += material.amount;
    }
  const owedKg = useOperationsCampaignStore
    .getState()
    .orders.filter(
      (order) =>
        order.status !== 'fulfilled' &&
        order.status !== 'cancelled' &&
        order.recipe.finishedMaterial === 'flour'
    )
    .reduce((sum, order) => sum + Math.max(0, order.requiredKg - order.shippedKg), 0);
  const packedKg = flow.productionBatches
    .filter((batch) => batch.materialType === 'flour' && batch.disposition !== 'recalled')
    .reduce((sum, batch) => sum + Math.max(0, batch.availableKg), 0);
  const makeable = wheatKg * FLOUR_PER_WHEAT_KG + flourInProcessKg + packedKg;
  if (makeable + 1e-6 >= owedKg) return 0;
  const next = useTruckScheduleStore.getState().truckSchedule.receiving.nextArrivalMinutes;
  return Math.max(1, Number.isFinite(next) ? next : 0);
}

/** The intake record an hour on: the line's stamp base now and the open flour minimums. */
export function intakeOutcome(base: number): { base: number; openMinimums: number[] } {
  return { base: Math.round(base * 100) / 100, openMinimums: openFlourMinimums() };
}

/** Take a lot in, into a named silo (overflowing into the emptiest wheat silo when split-blending). */
export function receiveLot(effect: {
  siloId: string;
  amountKg: number;
  supplier: string | null;
  crop: CropAttributes;
}): boolean {
  const flow = useMaterialFlowStore.getState();
  const baseDetails = {
    crop: { ...effect.crop },
    materialType: 'wheat_grain' as const,
    gameClock: readPlantClock(),
    ...(effect.supplier ? { supplier: effect.supplier } : {}),
  };
  let taken = flow.receiveGrainDelivery(effect.amountKg, {
    ...baseDetails,
    siloId: effect.siloId,
  });
  const overflow = effect.amountKg - taken;
  if (overflow > 1e-6) {
    const fallback = emptiestSiloStoresWheat(useMaterialFlowStore.getState());
    if (fallback && fallback !== effect.siloId) {
      taken += flow.receiveGrainDelivery(overflow, { ...baseDetails, siloId: fallback });
    }
  }
  if (taken > 0)
    useOperationsCampaignStore
      .getState()
      .bookPurchase({ grainCost: grainPurchaseCost({ wheat_grain: taken, corn_grain: 0 }) });
  return taken > 0;
}

/**
 * Refuse a lot: the fee is booked to demurrage, and with the seeded chance
 * the supplier's next truck comes REFUSAL_DELAY_MINUTES late (`delayNextTruck`
 * holds it until the refused truck has left).
 */
export function refuseLot(
  effect: { deliveryIndex: number; fee: number },
  delayNextTruck: ((minutes: number) => void) | undefined
): boolean {
  useOperationsCampaignStore.getState().bookDemurrageCharge(effect.fee);
  const seed = useChronicleStore.getState().chronicle.charter?.seed ?? 0;
  if (refusalDelays(seed, effect.deliveryIndex, seededUnit))
    delayNextTruck?.(REFUSAL_DELAY_MINUTES);
  return true;
}
