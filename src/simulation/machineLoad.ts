import type { MachineData } from '../types';

/**
 * Store-owned machine load in simulation mode: 50 + line rate * 30 while
 * running, 0 when idle, held otherwise, eased 10% per update and snapped once
 * within 0.05. The SCADA bridge (store.ts) and the offline machine model
 * (MachineSimulationController) both use this one formula.
 * Working if: SCADA's feed-derived load (itself driven by this load) is never
 * written back, so mills hold ~80% at nominal pace instead of climbing to 100%.
 */
export function storeOwnedLoad(
  machine: { status: MachineData['status']; metrics: Pick<MachineData['metrics'], 'load'> },
  productionSpeed: number
): number {
  const current = machine.metrics.load;
  const isRunning =
    productionSpeed > 0 && (machine.status === 'running' || machine.status === 'warning');
  let target = current;
  if (isRunning) target = 50 + productionSpeed * 30;
  else if (machine.status === 'idle') target = 0;
  const clamp = (n: number): number => Math.max(0, Math.min(100, n));
  if (!Number.isFinite(current)) return Number.isFinite(target) ? clamp(target) : 0;
  const next = current + (target - current) * 0.1;
  return clamp(Math.abs(target - next) < 0.05 ? target : next);
}
