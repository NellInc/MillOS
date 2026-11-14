/**
 * The silos' mean against the per-portion stamp, outside the temper card:
 * the intake card's line mix (intakeRuntime.ts buildIntakeFacts) and the
 * tick's best wheat penalty (UnifiedGameTick.ts bestWheatPenalty).
 *
 * The stamp reads each packed portion's own grain, a blend of the silos its
 * mills draw on in uneven shares (temperRuntime.test.ts), so a portion reads
 * wet only if a silo it draws on does. Both readers keep the mean, for the
 * reasons each gives in its own comment; these pin where the mean and the
 * stamp part, and that the temper card covers the gap.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import {
  useMaterialFlowStore,
  type MaterialFlowProductionPlan,
} from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter } from '../../chronicle/engine';
import type { CropAttributes } from '../../chronicle/types';
import { stampPenaltyFor, type LotStampContext } from '../../simulation/lotQuality';
import { priceAll } from '../../simulation/partnerProposals';
import { intakeKind } from '../../simulation/intakeProposal';
import { temperKind } from '../../simulation/temperProposal';
import { equalWeight, wheatSiloContributions } from '../UnifiedGameTick';
import { buildIntakeFacts, receiveLot } from '../intakeRuntime';
import { temperWorld } from '../temperRuntime';

const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };
const WET: CropAttributes = {
  cropYear: 4,
  kind: 'wet',
  moisturePct: 15.6,
  proteinPct: 11.2,
  fallingNumberS: 260,
};
const SOUND: CropAttributes = {
  cropYear: 3,
  kind: 'typical',
  moisturePct: 13.0,
  proteinPct: 12.0,
  fallingNumberS: 340,
};

/** A lot reads as stamped on the store, else (opening stock, the test's lots) as named here. */
const context = (): LotStampContext => ({
  crop: useChronicleStore.getState().chronicle.crop!,
  relieved: [],
  otherPenalty: 0,
  cropOf: (lotId) =>
    useMaterialFlowStore.getState().sourceLots.get(lotId)?.crop ??
    (lotId.startsWith('lot-wet') ? WET : SOUND),
});

function fillSilos(silos: Record<'silo-0' | 'silo-2' | 'silo-4', [string, number]>) {
  const buffers = new Map(useMaterialFlowStore.getState().machineBuffers);
  for (const [id, [lotId, kg]] of Object.entries(silos)) {
    const silo = buffers.get(id)!;
    buffers.set(id, {
      ...silo,
      outputBuffer:
        kg > 0
          ? [
              {
                type: 'wheat_grain',
                amount: kg,
                sourceContributions: [{ lotId, amount: kg, path: [id] }],
              },
            ]
          : [],
    });
  }
  useMaterialFlowStore.setState({ machineBuffers: buffers });
}

/** The line run on the store's own per-portion stamp; every sealed batch's stamp from the named lot. */
function packedFrom(lotId: (id: string) => boolean): number[] {
  const plan: MaterialFlowProductionPlan = {
    sourceMaterial: 'wheat_grain',
    finishedMaterial: 'flour',
    remainingFinishedKg: 1_000_000,
  };
  const stamp = context();
  const flourPenalty = (sources: readonly { lotId: string; amount: number }[]) =>
    stampPenaltyFor(sources, stamp);
  // Batches milled mostly from the silos, past the opening stock in the mills.
  const fromSilos = (batch: { sourceContributions: { lotId: string; amount: number }[] }) => {
    const total = batch.sourceContributions.reduce((sum, s) => sum + s.amount, 0);
    const opening = batch.sourceContributions
      .filter((s) => s.lotId.startsWith('lot-opening'))
      .reduce((sum, s) => sum + s.amount, 0);
    return total > 0 && opening / total < 0.2;
  };
  const batches = () =>
    useMaterialFlowStore
      .getState()
      .productionBatches.filter(
        (batch) =>
          batch.sealed && fromSilos(batch) && batch.sourceContributions.some((s) => lotId(s.lotId))
      );
  for (let i = 0; i < 6000 && batches().length < 10; i++)
    useMaterialFlowStore
      .getState()
      .tickMaterialFlow(1, 1, plan, { flour: 99, semolina: 99 }, { planFeed: true, flourPenalty });
  return batches().map((batch) => batch.qualityScore ?? 100);
}

beforeEach(() => {
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.setState({ gameTime: 12 });
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 41, baseline).state;
  useChronicleStore.setState({
    chronicle: { ...state, crop: { index: 4, kind: 'wet', treated: false } },
  });
});

afterEach(() => {
  useChronicleStore.setState(useChronicleStore.getInitialState(), true);
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('a wet lot taken into an empty silo beside one sound silo', () => {
  const wetLot = { deliveryIndex: 7, amountKg: 4_000, crop: WET };
  // Lots refused until two wheat silos ran empty (the probe's shifts 12 to 16).
  // R.M. 102 draws on silos 0 and 4, so with silo 4 empty it mills silo 0
  // alone, and packer 1 packs it unmixed. Beside two full silos the same lot
  // is blended at the mills and stamps sound (measured, so not tested here).
  const soundAndEmpty = () =>
    fillSilos({
      'silo-0': ['lot-old-0', 0],
      'silo-2': ['lot-old-2', 12_000],
      'silo-4': ['lot-old-4', 0],
    });

  it('taken straight into the empty silo, a wet lot is milled unmixed and packed under 95', () => {
    soundAndEmpty();
    const facts = buildIntakeFacts(wetLot, context(), 99)!;
    expect(facts.siloId).toBe('silo-0');
    expect(receiveLot({ siloId: 'silo-0', amountKg: 4_000, supplier: null, crop: WET })).toBe(true);
    const lot = [...useMaterialFlowStore.getState().sourceLots.values()].at(-1)!.id;
    expect(Math.min(...packedFrom((id) => id === lot))).toBeLessThan(95);
  });

  it('blended into a full sound silo, the same lot reads sound and its flour makes 95', () => {
    soundAndEmpty();
    expect(receiveLot({ siloId: 'silo-2', amountKg: 4_000, supplier: null, crop: WET })).toBe(true);
    const lot = [...useMaterialFlowStore.getState().sourceLots.values()].at(-1)!.id;
    expect(Math.min(...packedFrom((id) => id === lot))).toBeGreaterThanOrEqual(95);
  });

  it('the card prices it on the silos’ mean and takes it straight; the temper card then dries that silo', () => {
    soundAndEmpty();
    // Kept on purpose (intakeRuntime.ts buildIntakeFacts): priced silo by
    // silo, intake lost what refusing buys on the sprouted harness.
    const facts = buildIntakeFacts(wetLot, context(), 99)!;
    expect(facts.straightPenalty).toBe(0);
    expect(facts.blendSiloId).toBeNull();
    expect(intakeKind.chooseDefault!(priceAll('intake', facts), facts)).toBe('accept');
    expect(receiveLot({ siloId: 'silo-0', amountKg: 4_000, supplier: null, crop: WET })).toBe(true);
    const silos = wheatSiloContributions(useMaterialFlowStore.getState());
    const card = temperWorld({ grain: equalWeight(silos), context: context() }, 99)?.raise;
    expect(card?.standardPenalty).toBe(5);
    expect(card && temperKind.chooseDefault!(priceAll('temper', card), card)).toBe('dry-first');
  });
});

describe('the best wheat the line can plan an order on', () => {
  it('two wet silos beside one sound: the mean reads wet, and the store still packs flour that makes 95', () => {
    fillSilos({
      'silo-0': ['lot-wet-0', 12_000],
      'silo-2': ['lot-old-2', 12_000],
      'silo-4': ['lot-wet-4', 12_000],
    });
    const mean = equalWeight(wheatSiloContributions(useMaterialFlowStore.getState()));
    expect(stampPenaltyFor(mean, context())).toBe(5);
    const stamps = packedFrom(() => true);
    expect(Math.max(...stamps)).toBeGreaterThanOrEqual(95);
    expect(Math.min(...stamps)).toBeLessThan(95);
  });
});
