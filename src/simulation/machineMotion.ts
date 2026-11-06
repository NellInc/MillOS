import {
  bufferWorksNothing,
  useMaterialFlowStore,
  type MachineBuffer,
} from '../stores/materialFlowStore';

export type MachineOperationalState = 'operating' | 'stopped' | 'starved' | 'blocked' | 'faulted';

/** The material model's feed judgement (materialFlowStore). */
export interface MachineFeedJudge {
  isMachineUnfed?: (machineId: string) => boolean;
  hasFeedRecord?: () => boolean;
}

/** Conversions whose load and energy bill follow the feed judgement (machineLoad.unitHasFeed). */
const FEED_JUDGED_TYPES: ReadonlySet<MachineBuffer['machineType']> = new Set([
  'roller_mill',
  'plansifter',
  'packer',
]);

const totalKg = (materials: MachineBuffer['inputBuffer']): number => {
  let kg = 0;
  for (const material of materials) kg += material.amount;
  return kg;
};

/**
 * A mill, sifter or packer is judged working by the same feed judgement that
 * sets its load and its share of the energy bill (`unitHasFeed`), not by its
 * hopper this instant: a hopper empty between parcels posed starved at working
 * load, and a full hopper on a 0% line posed working while billed idle. Once
 * judged unfed, the hopper says why: empty is starved, a full output is
 * blocked, anything else is a stopped line. Until a full feed window is on
 * record the judgement is the hopper's (bufferWorksNothing), read from the
 * buffer given. A silo keeps its own inventory test.
 * Working if such a unit poses 'operating' exactly when it is billed as fed.
 */
export function getMachineOperationalState(
  status: string,
  buffer: MachineBuffer | undefined,
  feed: MachineFeedJudge | undefined = useMaterialFlowStore.getState()
): MachineOperationalState {
  if (status === 'critical') return 'faulted';
  if (status !== 'running' && status !== 'warning') return 'stopped';
  if (!buffer || !buffer.isProcessing) return buffer ? 'stopped' : 'operating';

  const outputKg = totalKg(buffer.outputBuffer);
  if (FEED_JUDGED_TYPES.has(buffer.machineType)) {
    const unfed =
      feed?.hasFeedRecord?.() && feed.isMachineUnfed
        ? feed.isMachineUnfed(buffer.machineId)
        : bufferWorksNothing(buffer);
    if (!unfed) return 'operating';
    if (totalKg(buffer.inputBuffer) <= 0.01) return 'starved';
    return outputKg >= buffer.outputCapacity - 0.01 ? 'blocked' : 'stopped';
  }

  if (outputKg <= 0.01) return 'starved';
  if (outputKg >= buffer.outputCapacity - 0.01) return 'blocked';
  return 'operating';
}

export interface MachineVisualClock {
  sampleTime: number;
  phaseTime: number | null;
}

/** Local operating time, never an inventory/production authority.
 * Holds consume their sample cursor, so resume has no stopped/hidden catch-up.
 * A simulation rewind starts a new visual cycle rather than a negative step.
 * Working if stopped/blocked/starved/faulted poses retain their exact phase,
 * and the next operating sample advances only its own active interval.
 */
export function sampleMachineVisualPhase(
  clock: MachineVisualClock,
  simulationTime: number,
  operating: boolean,
  visible = true
): number | null {
  if (!Number.isFinite(simulationTime) || simulationTime < 0) return clock.phaseTime;
  if (simulationTime < clock.sampleTime) {
    clock.sampleTime = simulationTime;
    clock.phaseTime = null;
  }
  const elapsed = simulationTime - clock.sampleTime;
  clock.sampleTime = simulationTime;
  if (operating && visible) clock.phaseTime = (clock.phaseTime ?? 0) + elapsed;
  return clock.phaseTime;
}
