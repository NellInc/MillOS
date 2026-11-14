/**
 * The temper card on the live plant (plan item 7.7): it is raised on the grain
 * the stamp will read, not on a mean the stamp never sees.
 *
 * Found by the Chronicle probe (13 November, Wet Harvest, seed 101, asked
 * cards left to their windows): the partner refused wet lots at intake while
 * wet lots already taken in reached the line, and no card came until shift
 * 17, while flour was packed at 94.2 to 94.9 against strong white's 95. The
 * card read the wheat silos' mean; the stamp reads each packed portion's own
 * grain, which is the blend the spouts make for that packer. With one silo
 * wet, one sound and one run empty, the mean reads sound while a packer whose
 * mills draw on the wet silo alone packs it unmixed.
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
import { temperKind } from '../../simulation/temperProposal';
import { TEMPER_COVER_MINUTES, TEMPER_REST_MINUTES } from '../../chronicle/temper';
import {
  calculateEfficiency,
  getWearConfig,
  useProductionStore,
} from '../../stores/productionStore';
import { MachineType, type MachineData } from '../../types';
import { equalWeight, productPathQuality, wheatSiloContributions } from '../UnifiedGameTick';
import { projectedStampBase } from '../partnerProposalRuntime';
import { runTemper, temperWorld } from '../temperRuntime';

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

/** Every lot but the wet one is last year's sound grain (opening stock included). */
const context = (): LotStampContext => ({
  crop: useChronicleStore.getState().chronicle.crop!,
  relieved: [],
  otherPenalty: 0,
  cropOf: (lotId) => (lotId === 'lot-wet' ? WET : SOUND),
});

function signWetYear() {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 41, baseline).state;
  useChronicleStore.setState({
    chronicle: { ...state, crop: { index: 4, kind: 'wet', treated: false } },
    // A fresh charter: no card of an earlier test has been answered.
    temperAnswers: [],
  });
}

/** The three wheat silos' grain, one lot each; 0 kg leaves a silo empty. */
function fillSilos(silos: {
  'silo-0': [string, number];
  'silo-2': [string, number];
  'silo-4': [string, number];
}) {
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

/** Wet lots taken in, intake then refused, and one silo run empty. */
const wetBesideSoundAndEmpty = () =>
  fillSilos({
    'silo-0': ['lot-wet', 12_000],
    'silo-2': ['lot-old-2', 12_000],
    'silo-4': ['lot-old-4', 0],
  });
/** The same wet silo with both others holding sound grain. */
const wetBesideTwoSound = () =>
  fillSilos({
    'silo-0': ['lot-wet', 12_000],
    'silo-2': ['lot-old-2', 12_000],
    'silo-4': ['lot-old-4', 12_000],
  });

/** The grain as the tick hands it in (UnifiedGameTick, temperGrain). */
function tickGrain() {
  const silos = wheatSiloContributions(useMaterialFlowStore.getState());
  return { grain: equalWeight(silos), context: context() };
}

/** The line run on the store's own per-portion stamp until flour from the wet lot is packed. */
function packWetFlour() {
  const plan: MaterialFlowProductionPlan = {
    sourceMaterial: 'wheat_grain',
    finishedMaterial: 'flour',
    remainingFinishedKg: 1_000_000,
  };
  const stamp = context();
  const flourPenalty = (sources: readonly { lotId: string; amount: number }[]) =>
    stampPenaltyFor(sources, stamp);
  const wetBatches = () =>
    useMaterialFlowStore
      .getState()
      .productionBatches.filter(
        (batch) =>
          batch.sealed && batch.sourceContributions.some((source) => source.lotId === 'lot-wet')
      );
  for (let i = 0; i < 6000 && wetBatches().length < 8; i++)
    useMaterialFlowStore
      .getState()
      .tickMaterialFlow(1, 1, plan, { flour: 99, semolina: 99 }, { planFeed: true, flourPenalty });
  const batches = wetBatches();
  expect(batches.length).toBeGreaterThan(0);
  return Math.min(...batches.map((batch) => batch.qualityScore ?? 100));
}

beforeEach(() => {
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.setState({ gameTime: 12 });
  signWetYear();
});

const openingMachines = useProductionStore.getState().machines;

afterEach(() => {
  useProductionStore.getState().setMachines(openingMachines);
  useChronicleStore.setState(useChronicleStore.getInitialState(), true);
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('the temper card reads the grain the stamp reads', () => {
  it('packs the wet silo under 95 when its partner silo is empty, though the silos’ mean reads sound', () => {
    wetBesideSoundAndEmpty();
    // The old trigger's figure: the silos' mean, 14.3%, under the wet band.
    const grain = tickGrain();
    expect(stampPenaltyFor(grain.grain, grain.context)).toBe(0);
    // The store's own stamp packs the wet silo's flour 5 points down.
    expect(packWetFlour()).toBeLessThan(95);
  });

  it('raises the card on that grain, priced on the flour that misses 95, and the partner dries', () => {
    wetBesideSoundAndEmpty();
    const world = temperWorld(tickGrain(), 99);
    expect(world?.raise).not.toBeNull();
    const facts = world!.raise!;
    expect(facts.standardPenalty).toBe(5);
    expect(facts.driedPenalty).toBe(0);
    expect(facts.moisturePct).toBe(15.6);
    // The default comes from the prices the card shows.
    const options = priceAll('temper', facts);
    expect(options.find((option) => option.id === 'standard')?.price.belowMinimums).toContain(95);
    expect(temperKind.chooseDefault!(options, facts)).toBe('dry-first');
  });

  it('raises it beside two sound silos too: the spouts’ half-and-half blend still packs a batch under 95', () => {
    wetBesideTwoSound();
    // Half wet and half sound reads 14.3%, under the band; the spouts do not
    // hold to half, and the store packs a batch at 62% wet grain.
    expect(packWetFlour()).toBeLessThan(95);
    wetBesideTwoSound();
    expect(temperWorld(tickGrain(), 99)?.raise?.standardPenalty).toBe(5);
  });

  it('raises nothing when no silo reads wet, a wet lot diluted in sound grain included', () => {
    fillSilos({
      'silo-0': ['lot-old-0', 12_000],
      'silo-2': ['lot-old-2', 12_000],
      'silo-4': ['lot-old-4', 0],
    });
    const world = temperWorld(tickGrain(), 99);
    expect(world).not.toBeNull();
    expect(world?.raise).toBeNull();
    // 2,000 kg at 15.6% in 10,000 kg at 13.0% reads 13.4%.
    const buffers = new Map(useMaterialFlowStore.getState().machineBuffers);
    const silo = buffers.get('silo-0')!;
    buffers.set('silo-0', {
      ...silo,
      outputBuffer: [
        {
          type: 'wheat_grain',
          amount: 12_000,
          sourceContributions: [
            { lotId: 'lot-wet', amount: 2_000, path: ['silo-0'] },
            { lotId: 'lot-old-0', amount: 10_000, path: ['silo-0'] },
          ],
        },
      ],
    });
    useMaterialFlowStore.setState({ machineBuffers: buffers });
    expect(temperWorld(tickGrain(), 99)?.raise).toBeNull();
  });

  it('prices drying on the wet lots alone, not on their mean with sound grain', () => {
    wetBesideSoundAndEmpty();
    const facts = temperWorld(tickGrain(), 99)!.raise!;
    // The mean (14.3%) would dry 0.3 points of water off every kilogram; the
    // wet lot alone is half the draw and dries from 15.6%.
    expect(facts.dryingKwh).toBeGreaterThan(0);
    const allWet = () =>
      fillSilos({
        'silo-0': ['lot-wet', 12_000],
        'silo-2': ['lot-wet', 12_000],
        'silo-4': ['lot-old-4', 0],
      });
    allWet();
    const whole = temperWorld(tickGrain(), 99)!.raise!;
    expect(facts.dryingKwh / whole.dryingKwh).toBeCloseTo(0.5, 1);
  });
});

describe('the stamp the card prices: the flour its answer covers last', () => {
  /** A wet year with the meters' point back (the probe's runs: standard 4, dried 0). */
  const withMeters = () => ({ ...tickGrain(), context: { ...context(), otherPenalty: -1 } });

  it('keeps the standard temper only if the line, worn to the end of the cover, still makes 95', () => {
    wetBesideSoundAndEmpty();
    // The probe's margin: 99.1 less 4 is 95.1, and the shift's later flour
    // was packed at 94.7 on the line worn to 98.7.
    const now = temperWorld(withMeters(), 99.1)!.raise!;
    expect(now.standardPenalty).toBe(4);
    expect(temperKind.chooseDefault!(priceAll('temper', now), now)).toBe('standard');
    const worn = temperWorld(withMeters(), 99.1, (base, minutes) =>
      minutes >= TEMPER_REST_MINUTES + TEMPER_COVER_MINUTES ? base - 0.4 : base
    )!.raise!;
    expect(worn.base).toBe(98.7);
    expect(temperKind.chooseDefault!(priceAll('temper', worn), worn)).toBe('dry-first');
    // The projection never lifts the stamp above the line's now.
    expect(temperWorld(withMeters(), 99.1, (base) => base + 3)!.raise!.base).toBe(99.1);
  });

  it('judges the minimum unrounded: 94.96 shows as 95.0 and misses 95', () => {
    wetBesideSoundAndEmpty();
    const facts = temperWorld(withMeters(), 98.96)!.raise!;
    const standard = priceAll('temper', facts).find((option) => option.id === 'standard')!;
    expect(standard.price.quality).toBe(95);
    expect(standard.price.belowMinimums).toEqual([95]);
    expect(temperKind.chooseDefault!(priceAll('temper', facts), facts)).toBe('dry-first');
  });

  it('wears each unit at the tick’s rate up to its warning, where its service is raised', () => {
    const roller = getWearConfig(MachineType.ROLLER_MILL);
    const unit = (wear: number, extra: number[] = []): MachineData[] =>
      [wear, ...extra].map((w, index) => ({
        id: `rm-10${index + 1}`,
        name: `rm-10${index + 1}`,
        type: MachineType.ROLLER_MILL,
        position: [0, 0, 0],
        size: [1, 1, 1],
        rotation: 0,
        status: 'running',
        metrics: {
          rpm: 450,
          temperature: 50,
          vibration: 1,
          load: 80,
          wear: w,
          efficiency: calculateEfficiency(w, MachineType.ROLLER_MILL),
        },
        lastMaintenance: '2026-08-01',
        nextMaintenance: '2026-08-08',
      }));
    const inputs = { qualityOf: productPathQuality, wearPace: () => 1, wearMultiplier: 1 };
    /** The tick's own stamp drop between two wears of one unit beside a fresh one. */
    const drop = (from: number, to: number) =>
      productPathQuality(unit(from, [0])) - productPathQuality(unit(to, [0]));
    // Fresh units stay under the knee for the whole cover: nothing is lost.
    useProductionStore.getState().setMachines(unit(0, [0]));
    expect(projectedStampBase(inputs, 99.5, 600)).toBe(99.5);
    // A unit at 20 (load 80) wears 0.0005 x 1.3 x 60 = 0.039 a minute: 43.4 at 600.
    useProductionStore.getState().setMachines(unit(20, [0]));
    const at600 = 20 + roller.wearRatePerSecond * 1.3 * 60 * 600;
    expect(drop(20, at600)).toBeGreaterThan(0);
    expect(projectedStampBase(inputs, 99.5, 600)).toBeCloseTo(99.5 - drop(20, at600), 9);
    // Capped at the warning (60), though 600 minutes would take it to 78.4.
    useProductionStore.getState().setMachines(unit(55, [0]));
    expect(projectedStampBase(inputs, 99.5, 600)).toBeCloseTo(
      99.5 - drop(55, roller.warningThreshold),
      9
    );
    // A unit already past its warning (its service due) stays where it is.
    useProductionStore.getState().setMachines(unit(70, [0]));
    expect(projectedStampBase(inputs, 97, 600)).toBe(97);
  });
});

describe('what a temper answer books', () => {
  it('a dry-first answer adds to the drying since the close exactly what it booked, and standard adds nothing', () => {
    const energy = () => useOperationsCampaignStore.getState().shiftMetrics.energyCost;
    const drying = () => useChronicleStore.getState().chronicle.dryingSinceClose ?? 0;

    wetBesideSoundAndEmpty();
    const facts = temperWorld(tickGrain(), 99)!.raise!;
    expect(facts.dryingCost).toBeGreaterThan(0);

    const before = energy();
    const standard = temperKind.effect('standard', facts);
    expect(standard.type === 'temper' && runTemper(standard)).toBe(true);
    expect(energy()).toBe(before);
    expect(drying()).toBe(0);

    // The next shift's card: a card is answered once (review 2), so a second
    // answer to the same card books nothing.
    const dry = temperKind.effect('dry-first', { ...facts, shiftIndex: facts.shiftIndex + 1 });
    expect(dry.type === 'temper' && runTemper(dry)).toBe(true);
    expect(energy() - before).toBeCloseTo(facts.dryingCost, 9);
    expect(drying()).toBeCloseTo(energy() - before, 9);
  });
});
