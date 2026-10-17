import type { MachineBuffer } from '../stores/materialFlowStore';

export type MachineOperationalState = 'operating' | 'stopped' | 'starved' | 'blocked' | 'faulted';

export function getMachineOperationalState(
  status: string,
  buffer: MachineBuffer | undefined
): MachineOperationalState {
  if (status === 'critical') return 'faulted';
  if (status !== 'running' && status !== 'warning') return 'stopped';
  if (!buffer || !buffer.isProcessing) return buffer ? 'stopped' : 'operating';

  const sourceKg =
    buffer.machineType === 'silo'
      ? buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0)
      : buffer.inputBuffer.reduce((sum, material) => sum + material.amount, 0);
  if (sourceKg <= 0.01) return 'starved';

  const outputKg = buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0);
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
