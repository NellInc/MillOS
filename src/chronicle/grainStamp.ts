/**
 * The Chronicle's penalty on wheat flour as the plant stamps it under a
 * charter (fix-up b of plan item 4c, after the intake lane's per-lot stamp):
 * read from the grain, through simulation/lotQuality.ts, with the same choice
 * of grain the central tick makes (UnifiedGameTick `lineFlourPenalty` and
 * `bestWheatPenalty`):
 * - now: the wheat in process (every buffer but the silos, every conveyor),
 *   else the silos' wheat. What the line is stamping.
 * - best: the silos' wheat, each holding silo counted once as the valves draw
 *   it, else the wheat in process. What a serviced line can still make, so a
 *   recipe is never called out of reach while good grain is in the silos.
 * Pure over a slice of the material-flow state, so the margin card can ask it.
 */
import { chronicleEffect, chronicleTotals, relievedCropKinds } from './effects';
import { effectInput, type ChronicleState } from './engine';
import type { WheatPenalty } from './margins';
import { stampPenaltyFor, type LotStampContext } from '../simulation/lotQuality';
import type { MaterialFlowState } from '../stores/materialFlowStore';
import {
  equalWeight,
  lineWheatContributions,
  wheatSiloContributions,
  type SourceContributionLike,
} from '../systems/UnifiedGameTick';

type Contribution = SourceContributionLike;

/** The slice of the material-flow state the tick's grain readers take. */
export type GrainFlow = Pick<MaterialFlowState, 'machineBuffers' | 'network' | 'sourceLots'>;

function context(state: ChronicleState, flow: GrainFlow): LotStampContext | null {
  if (state.status !== 'active' || !state.charter || !state.crop) return null;
  const input = effectInput(state);
  return {
    crop: state.crop,
    relieved: relievedCropKinds(input.improvements),
    otherPenalty: chronicleTotals(input).qualityPenalty,
    cropOf: (lotId) => flow.sourceLots.get(lotId)?.crop,
  };
}

/**
 * Readers for `qualityMargins`: the grain's penalty now, and at best. Without
 * a charter or a crop year, the plant-wide figure, as the tick has it.
 */
export function grainPenalties(flow: GrainFlow): { now: WheatPenalty; best: WheatPenalty } {
  const line = lineWheatContributions(flow as MaterialFlowState);
  const silos = wheatSiloContributions(flow as MaterialFlowState);
  const now = line.length ? line : silos.flat();
  const best = silos.length ? equalWeight(silos) : line;
  const read = (grain: Contribution[]) => (state: ChronicleState) => {
    const ctx = context(state, flow);
    return ctx
      ? stampPenaltyFor(grain, ctx)
      : chronicleEffect(effectInput(state), true).qualityPenalty;
  };
  return { now: read(now), best: read(best) };
}
